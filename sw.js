// Houdt het scoreblok bruikbaar zonder internet. Verhoog VERSIE na een wijziging.
const VERSIE = "klaverjas-5";
const BASIS = ["./", "./index.html", "./app.js", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSIE).then(c => c.addAll(BASIS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSIE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    // Eigen bestanden: eerst het netwerk (nieuwste versie), anders de opgeslagen kopie
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const kopie = r.clone(); caches.open(VERSIE).then(c => c.put(req, kopie)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
  } else if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com" ||
             (u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/"))) {
    // Lettertypes en de Firebase-bibliotheek (vaste versie): opgeslagen kopie eerst
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => {
      const kopie = n.clone(); caches.open(VERSIE).then(c => c.put(req, kopie)); return n;
    })));
  }
  // Verkeer naar de database gaat ongewijzigd naar het netwerk
});
