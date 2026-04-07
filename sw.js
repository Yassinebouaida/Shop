const CACHE = 'temu-v3'; // تحديث الإصدار ليشمل الأيقونات
const FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',   // الأيقونة الموجودة لديك
  './icon-512.png'    // الأيقونة الموجودة لديك
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(FILES).catch(err => {
        console.error('Failed to cache some files:', err);
        // محاولة تخزين الملفات بشكل فردي لتجنب فشل الكاش بالكامل
        return Promise.all(
          FILES.map(file => 
            cache.add(file).catch(e => console.warn(`Could not cache ${file}`, e))
          )
        );
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 404 });
      });
    })
  );
});
