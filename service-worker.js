// service-worker.js

// Definicja nazw i wersji pamięci podręcznej (cache).
const STATIC_CACHE_NAME = 'static-assets-v1';
const DYNAMIC_CACHE_NAME = 'dynamic-content-v1';

// Lista kluczowych zasobów aplikacji (tzw. "App Shell").
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
    console.log('[Service Worker] Instalacja...');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Zapisywanie kluczowych zasobów (App Shell) w cache...');
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
    // Wymuszamy przejęcie kontroli przez nowego SW od razu
    return self.clients.claim();
});

// * Krok 3: Przechwytywanie zapytań sieciowych (Fetch)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // --- NAPRAWA BŁĘDU FIREFOX / CDN ---
    // Jeśli zapytanie idzie do innej domeny (np. cdn.jsdelivr.net, auth0.com),
    // Service Worker NIE powinien go dotykać (nie używamy event.respondWith).
    // Pozwalamy przeglądarce obsłużyć to standardowo.
    if (url.origin !== self.location.origin) {
        return;
    }

    // Strategia dla zapytań do API Netlify Functions
    if (url.pathname.startsWith('/.netlify/functions/')) {
        // Obsługuj tylko zapytania, które modyfikują dane (POST, PUT, DELETE) strategią "tylko sieć"
        if (event.request.method !== 'GET') {
            event.respondWith(fetch(event.request));
            return;
        }

        // Dla zapytań GET użyj strategii Network First, Fallback to Cache
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
    }
    // Strategia dla wszystkich pozostałych zapytań lokalnych (Cache First)
    else {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
    }



});