// service-worker.js

// ⚠️ WAŻNE: Zmieniaj ten numer wersji przy KAŻDYM wdrożeniu (deployu) na produkcję!
// To sygnał dla przeglądarki, że są nowe pliki.
const STATIC_CACHE_NAME = 'static-assets-v15.1.0'; // Bump version to force update
const DYNAMIC_CACHE_NAME = 'dynamic-content-v1';

const APP_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/auth.js',
    '/dataStore.js',
    '/state.js',
    '/ui.js',
    '/utils.js',
    '/timer.js',
    '/training.js',
    '/tts.js',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalacja nowej wersji:', STATIC_CACHE_NAME);
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => {
            return cache.addAll(APP_SHELL_ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Aktywacja...');
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys
                .filter(key => key !== STATIC_CACHE_NAME && key !== DYNAMIC_CACHE_NAME)
                .map(key => caches.delete(key))
            );
        })
    );
});

// --- NOWOŚĆ: Obsługa wymuszenia aktualizacji ---
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/.netlify/functions/')) {
        if (event.request.method !== 'GET') {
            event.respondWith(fetch(event.request));
            return;
        }
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                return fetch(event.request)
                    .then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    })
                    .catch(() => {
                        return cache.match(event.request);
                    });
            })
        );
    } else {
        // Cache First, Network Fallback
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
    }
});
