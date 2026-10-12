// Service worker: deja la app disponible sin conexión.
// Estrategia: red primero (así una actualización publicada se ve enseguida) y caché como respaldo.
// Subí CACHE cuando publiques una versión nueva.
const CACHE = 'compras-1.0.0-local';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'js/app.js', 'js/config.js', 'js/data.js', 'js/calc.js', 'js/format.js', 'js/ui.js', 'js/charts.js',
  'js/views/shared.js', 'js/views/bienvenida.js', 'js/views/inicio.js', 'js/views/compras.js', 'js/views/nuevaCompra.js', 'js/views/comparativas.js', 'js/views/productos.js',
  'js/views/historial.js', 'js/views/informes.js', 'js/views/backups.js', 'js/views/configuracion.js', 'js/views/purchaseEdit.js', 'js/views/purchaseForm.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const ok = url.origin === location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ok) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((m) => m || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
