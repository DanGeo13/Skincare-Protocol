// sw.js
const CACHE_NAME = 'protocol-v3';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './protocol.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
