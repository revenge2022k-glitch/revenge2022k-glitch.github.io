/* オフラインでも開けるようにするだけの、ごく小さなキャッシュ。
   記録そのものは localStorage に入っているのでネットは要りません。 */
const CACHE = "meal-log-v4";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];
// レシピの棚は置いていない配信先もある。無くても導入は失敗させない
// （addAll は1つでも 404 だと全部やめてしまう）
const OPTIONAL = ["./data/recipes.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).then(() => Promise.all(OPTIONAL.map((u) => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 本体とレシピの棚はネット優先。そうしないと一度入れたきり
   新しい版が来なくなる（圏外のときだけキャッシュを出す）。
   写真などそれ以外の自分のファイルはキャッシュ優先で軽く。 */
function isFresh(url) {
  return url.pathname.endsWith("/") ||
         url.pathname.endsWith("/index.html") ||
         url.pathname.endsWith("/data/recipes.json");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {   // Google Fonts
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  const store = (res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  };

  if (req.mode === "navigate" || isFresh(url)) {
    // GitHub Pages は10分キャッシュさせるので、no-cache で毎回サーバーに確かめる
    // （変わっていなければ 304 で中身は送られてこない）。navigate の Request は
    // そのまま設定を足せないので URL で取り直す。
    const fresh = req.mode === "navigate"
      ? fetch(url.href, { cache: "no-cache", credentials: "same-origin" })
      : fetch(req, { cache: "no-cache" });
    e.respondWith(fresh.then(store).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html"))));
  } else {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(store)));
  }
});
