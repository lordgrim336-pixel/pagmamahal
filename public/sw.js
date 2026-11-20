// Offline support, kept small for low-storage phones: only the app itself and
// today's listings are stored (about 5 MB). Photos and thumbnails are never
// stored here; the browser's normal cache handles them and clears them as needed.
const CACHE = "pagmamahal-maps-v3";
const SHELL = ["./", "index.html", "about.html", "css/styles.css", "js/app.js", "js/util.js", "js/theme.js", "js/loan-rules.js", "js/config.js", "icons/icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // map tiles, photos, CDN: straight to network
  if (url.pathname.includes("/thumbs/") || url.pathname.includes("/icons/og-")) return; // never stored offline

  // Network first, cache as fallback (keeps listings and code current).
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
