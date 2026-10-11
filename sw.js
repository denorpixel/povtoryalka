var CACHE_NAME = 'povtoryalka-cache-v5';
var urlsToCache = [
  './index.html',
  './app.js',
  './chessboard-1.0.0.min.css',
  './chessboard-1.0.0.min.js',
  './chess.min.js',
  './pgn-parser.js',
  './jquery-3.6.0.min.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request).then(function(res) {
          return caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, res.clone());
              return res;
          });
      });
    }).catch(function() {
        return new Response('Офлайн режим. Ресурс не найден.');
    })
  );
});
