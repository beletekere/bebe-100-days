const CACHE = 'bebe100-v4';
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
  // תמיד לנסות רשת קודם, כדי שעדכונים חדשים יגיעו מיד כשיש אינטרנט - הקאש הוא רק גיבוי לאופליין
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
