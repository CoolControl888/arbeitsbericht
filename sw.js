// Offline-Speicher der App. Bei jeder neuen Version VERSION erhöhen, sonst lädt das Handy die alte.
const VERSION = 'cc-ab-1.3.0';

const DATEIEN = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/util.js',
  'js/db.js',
  'js/settings.js',
  'js/signature.js',
  'js/photos.js',
  'js/abrechnung.js',
  'js/pdf.js',
  'vendor/jspdf.umd.min.js',
  'fonts/CourierPrime-Regular.ttf',
  'fonts/CourierPrime-Bold.ttf',
  'img/logo.png',
  'img/logo-weiss.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN.map((d) => new Request(d, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const treffer = await cache.match(req, { ignoreSearch: true });
    if (treffer) return treffer;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      throw err;
    }
  })());
});
