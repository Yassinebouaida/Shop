// sw.js - Service Worker كامل ومحسّن لتطبيق Temu

const CACHE_NAME = 'temu-v3';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// تثبيت الـ SW: تخزين الملفات مع تجاهل الأخطاء الفردية (لضمان نجاح التثبيت)
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching app shell');
      // نستخدم addAll ولكن نلتقط الأخطاء لمنع فشل التثبيت
      return cache.addAll(urlsToCache).catch(err => {
        console.error('[Service Worker] Failed to cache some files:', err);
        // لا نرمي الخطأ مرة أخرى، نكمل التثبيت
      });
    })
  );
  self.skipWaiting(); // يصبح الـ SW نشطاً فوراً
});

// تنشيط الـ SW: حذف الـ caches القديمة
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim(); // يتحكم بالصفحات المفتوحة فوراً
});

// استراتيجية الاستجابة: cache first ثم network، مع fallback إلى index.html
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // نتجنب التعامل مع طلبات غير GET (مثل POST)
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // نفضل استخدام cache للملفات الثابتة (صور، html، manifest)
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // إرجاع النسخة المخزنة مؤقتاً
        return cachedResponse;
      }
      // محاولة جلب من الشبكة
      return fetch(request).then(networkResponse => {
        // نتحقق من أن الاستجابة صالحة قبل التخزين
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        // نضيف المورد الجديد إلى cache للاستخدام لاحقاً
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // إذا فشل الطلب وكان من نوع مستند HTML، نعيد index.html (للـ SPA)
        if (request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
        // للملفات الأخرى (مثل الصور) قد نعيد استجابة فارغة أو صورة بديلة
        return new Response('', { status: 404, statusText: 'Not Found' });
      });
    })
  );
});
