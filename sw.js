var CACHE_NAME = 'povtoryalka-cache-v1';
var urlsToCache = [
  './index.html',
  './app.js',
  'https://code.jquery.com/jquery-3.6.0.min.js',
  'https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.css',
  'https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js',
  'https://unpkg.com/@mliebelt/pgn-parser/lib/pgn-parser.js'
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
      // Возвращаем из кэша, если есть. Иначе грузим из сети и добавляем в кэш (для картинок фигур)
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