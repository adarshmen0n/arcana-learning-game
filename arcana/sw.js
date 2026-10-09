// Service worker: lets the game install on a phone and keep working briefly offline.
// Network first (so updates always arrive), cache as the fallback. The API is never cached.
const CACHE = "arcana-v14";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.pathname.startsWith("/api/")) return;
  // pages: the fresh copy when the server answers within 3.5 s, else the saved copy (the free server can take ~50 s to wake up)
  if (r.mode === "navigate" || u.origin === location.origin) {
    const net = fetch(r).then((res) => { if (res.ok) { const c2 = res.clone(); caches.open(CACHE).then((c) => c.put(r, c2)); } return res; });
    e.respondWith(Promise.race([net.catch(() => null), new Promise((ok) => setTimeout(() => ok(null), 3500))])
      .then((res) => res || caches.match(r, { ignoreSearch: true }).then((hit) => hit || net)));
    return;
  }
  e.respondWith(fetch(r).then((res) => { if (res.ok && (u.origin === location.origin || /cdn\.jsdelivr|fonts\.(googleapis|gstatic)/.test(u.hostname))) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r)));
});
