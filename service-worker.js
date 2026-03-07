// service-worker.js

// Jedno źródło wersji aplikacji: package.json.
// Service Worker celowo używa stabilnych nazw cache, żeby uniknąć ręcznego
// zarządzania numerami wersji w tym pliku przy każdym deployu.
const STATIC_CACHE_NAME = 'static-assets';
const DYNAMIC_CACHE_NAME = 'dynamic-content';
const LEGACY_CACHE_PREFIXES = ['static-assets-v', 'dynamic-content-v'];

// Minimalny app shell; pozostałe assety są cache'owane runtime podczas fetch.
const APP_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.webmanifest',
    '/package.json'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalacja nowej wersji cache:', STATIC_CACHE_NAME);
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => {
            return cache.addAll(APP_SHELL_ASSETS).catch(err => {
                console.error("[Service Worker] Błąd cache\'owania plików:", err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Aktywacja...');
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => {
                        if (key === STATIC_CACHE_NAME || key === DYNAMIC_CACHE_NAME) {
                            return false;
                        }

                        // Sprzątanie legacy cache z ręcznie utrzymywaną wersją.
                        if (LEGACY_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) {
                            return true;
                        }

                        // Usuwaj pozostałe cache niezarządzane przez aktualny SW.
                        return true;
                    })
                    .map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignoruj żądania spoza domeny (np. Google Fonts, Auth0, CDN)
    if (url.origin !== self.location.origin) return;

    // Strategia dla API (Network First)
    if (url.pathname.startsWith('/.netlify/functions/')) {
        if (event.request.method !== 'GET') {
            return;
        }
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    return caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Dla nawigacji (HTML): Network First, aby po deployu szybciej łapać nowe assety.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    const responseToCache = networkResponse.clone();
                    caches.open(STATIC_CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                })
                .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
        );
        return;
    }

    // Dla statycznych assetów: Cache First + runtime update.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(STATIC_CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return response;
            });
        })
    );
});
