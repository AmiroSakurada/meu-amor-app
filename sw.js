// ============================================================
// ONESIGNAL SERVICE WORKER + CACHE (com fallback)
// ============================================================

// Tenta carregar o Service Worker do OneSignal.
// Se falhar (ex: CDN bloqueado), o app continua funcionando,
// mas as notificações push podem não chegar (fallback silencioso).
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js');
  console.log('✅ OneSignal SDK Worker carregado');
} catch (e) {
  console.warn('⚠️ Falha ao carregar OneSignalSDKWorker.js. Notificações podem não funcionar.', e);
  // O OneSignal pode funcionar sem o worker em alguns casos,
  // mas as notificações push podem não chegar.
  // Vamos continuar para que o app funcione pelo menos sem notificações.
}

// ============================================================
// CACHE PARA O PWA (offline)
// ============================================================
const CACHE_NAME = 'amor-cache-v4';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/photo-elaeeu.jpg',
  './assets/photo-meudocinho.jpg',
  './assets/photo-nafesta.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('Cache install failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .catch((err) => console.warn('Cache activation failed:', err))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  // Ignora requisições para o backend (Render) e OneSignal (CDN)
  if (
    url.includes('onrender.com') ||
    url.includes('onesignal.com')
  ) {
    return; // Deixa o navegador lidar com essas requisições diretamente
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match('./index.html'));
    })
  );
});
