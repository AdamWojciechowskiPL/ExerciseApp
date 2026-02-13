// service-worker.js

// ⚠️ WAŻNE: Zmieniaj ten numer wersji przy KAŻDYM wdrożeniu (deployu) na produkcję!
const STATIC_CACHE_NAME = 'static-assets-v29.1.0';
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
    // Nowe moduły główne
    '/dom.js',
    '/cast.js',
    '/sessionRecovery.js',
    '/assistantEngine.js',
    '/clinicalEngine.js',
    '/protocolGenerator.js',
    '/workoutMixer.js',
    '/gamification.js',
    // Moduły UI (Core)
    '/ui/core.js',
    '/ui/modals.js',
    '/ui/templates.js',
    '/ui/wizard.js',
    // Moduły UI (Ekrany)
    '/ui/screens/dashboard.js',
    '/ui/screens/history.js',
    '/ui/screens/library.js',
    '/ui/screens/settings.js',
    '/ui/screens/training.js',
    '/ui/screens/summary.js',
    '/ui/screens/help.js',
    // Style CSS (ładowane przez @import)
    '/css/variables.css',
    '/css/global.css',
    '/css/dashboard.css',
    '/css/training.css',
    '/css/modules.css',
    '/css/responsive.css',
    // Zasoby
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/icons/sprite.svg'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalacja nowej wersji:', STATIC_CACHE_NAME);
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => {
            // Używamy Promise.allSettled lub pętli, aby błąd jednego pliku nie przerywał całej instalacji
            // (dla bezpieczeństwa deweloperskiego)
            return cache.addAll(APP_SHELL_ASSETS).catch(err => {
                console.error("[Service Worker] Błąd cache'owania plików:", err);
            });
        })
    );
    self.skipWaiting(); // Wymuś natychmiastową aktywację
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Aktywacja...');
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys
                .filter(key => key !== STATIC_CACHE_NAME && key !== DYNAMIC_CACHE_NAME)
                .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim()) // Przejmij kontrolę nad otwartymi kartami natychmiast
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
            return; // Domyślna obsługa przeglądarki dla POST/PUT/DELETE
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

    // Strategia dla plików statycznych (Stale-While-Revalidate lub Cache First)
    // Tutaj: Cache First z fallbackiem do sieci
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).then(response => {
                // Jeśli pliku nie było w cache (np. nowy plik dodany dynamicznie), dodaj go
                // Ale tylko jeśli status jest 200 (OK)
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(STATIC_CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return response;
            });
        })
    );
});