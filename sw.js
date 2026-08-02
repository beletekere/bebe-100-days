const CACHE = 'bebe100-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/habits.js',
  './js/quotes.js',
  './js/db.js',
  './js/store.js',
  './js/backup.js',
  './js/firebase-config.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin.includes('gstatic.com') || url.origin.includes('firestore.googleapis.com')) return; // אל תשמור בקאש קריאות ענן
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});
