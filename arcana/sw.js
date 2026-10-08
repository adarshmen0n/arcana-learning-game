// Service worker: lets the game install on a phone and keep working briefly offline.
// Network first (so updates always arrive), cache as the fallback. The API is never cached.
const CACHE = "arcana-v4";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.pathname.startsWith("/api/")) return;
  // app pages open instantly from cache (the free server can take ~50 s to wake), then refresh in the background
  if (r.mode === "navigate") { e.respondWith(caches.match(r, { ignoreSearch: true }).then((hit) => { const net = fetch(r).then((res) => { if (res.ok) { const c2 = res.clone(); caches.open(CACHE).then((c) => c.put(r, c2)); } return res; }).catch(() => hit); return hit || net; })); return; }
  e.respondWith(fetch(r).then((res) => { if (res.ok && (u.origin === location.origin || /cdn\.jsdelivr|fonts\.(googleapis|gstatic)/.test(u.hostname))) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r)));
});
