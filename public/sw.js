const APP_CACHE = 'ndsk-app-v1';
const PIPER_CACHE = 'ndsk-piper-runtime-v1';
const PIPER_HOSTS = ['cdn.jsdelivr.net', 'huggingface.co'];

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('ndsk-') && key !== APP_CACHE && key !== PIPER_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (PIPER_HOSTS.includes(url.hostname) && /\.(wasm|data|onnx|json)(\?|$)/i.test(url.pathname + url.search)) {
    event.respondWith(cacheFirst(request, PIPER_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async (response) => {
      const cache = await caches.open(APP_CACHE);
      cache.put('/', response.clone()).catch(() => {});
      return response;
    }).catch(async () => (await caches.open(APP_CACHE)).match('/') || Response.error()));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/piper/')) {
    event.respondWith(cacheFirst(request, APP_CACHE));
  }
});
