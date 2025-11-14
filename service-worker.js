// service-worker.js

// Definicja nazw i wersji pamięci podręcznej (cache).
// Zmiana nazwy (np. na 'v2') automatycznie uruchomi proces aktualizacji i wyczyści stary cache.
const STATIC_CACHE_NAME = 'static-assets-v1';
const DYNAMIC_CACHE_NAME = 'dynamic-content-v1';

// Lista kluczowych zasobów aplikacji (tzw. "App Shell"), które zostaną zapisane w cache podczas instalacji.
// Zapewni to, że podstawowy interfejs aplikacji będzie zawsze dostępny, nawet offline.
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
    '/icons/icon-512x512.png',
    'https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js',
    'https://cdn.jsdelivr.net/npm/jose@5/dist/browser/index.js'
];

/**
 * Krok 1: Instalacja Service Workera
 * 
 * To zdarzenie jest wywoływane jednorazowo podczas pierwszej rejestracji Service Workera.
 * Jego głównym zadaniem jest przygotowanie aplikacji do działania offline poprzez
 * zapisanie kluczowych zasobów (App Shell) w pamięci podręcznej.
 */
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalacja...');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Zapisywanie kluczowych zasobów (App Shell) w cache...');
            return cache.addAll(APP_SHELL_ASSETS);
        })
    );
});

/**
 * Krok 2: Aktywacja Service Workera
 * 
 * To zdarzenie jest wywoływane po pomyślnej instalacji. Jest to idealne miejsce
 * do wykonania zadań porządkowych, takich jak usunięcie starych wersji cache,
 * które nie są już potrzebne. Zapewnia to, że użytkownik zawsze korzysta
 * z najnowszych zasobów po aktualizacji.
 */
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

/**
 * Krok 3: Przechwytywanie zapytań sieciowych (Fetch)
 * 
 * Ten event jest sercem Service Workera. Jest wywoływany dla każdego zapytania HTTP
 * wysłanego przez aplikację (np. o plik CSS, obrazek, czy dane z API).
 * Tutaj implementujemy strategie cache'owania, decydując, czy odpowiedź
 * ma pochodzić z sieci, czy z pamięci podręcznej.
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Strategia dla zapytań do API Netlify Functions (Network First, fallback to Cache)
    if (url.pathname.startsWith('/.netlify/functions/')) {
        event.respondWith(
            fetch(event.request)
            .then(networkResponse => {
                // Jeśli odpowiedź z sieci jest poprawna, zapisujemy ją w dynamicznym cache
                const cache = caches.open(DYNAMIC_CACHE_NAME);
                cache.then(c => c.put(event.request, networkResponse.clone()));
                return networkResponse;
            })
            .catch(() => {
                // Jeśli sieć zawiedzie (offline), próbujemy znaleźć odpowiedź w cache
                return caches.match(event.request);
            })
        );
    } 
    // Strategia dla wszystkich pozostałych zapytań (Cache First, fallback to Network)
    else {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                // Jeśli odpowiedź jest w cache, zwracamy ją natychmiast.
                // W przeciwnym razie, próbujemy pobrać ją z sieci.
                return cachedResponse || fetch(event.request).then(networkResponse => {
                    // Opcjonalnie: można dodać nowe, nieznane zasoby do dynamicznego cache
                    // const cache = caches.open(DYNAMIC_CACHE_NAME);
                    // cache.then(c => c.put(event.request, networkResponse.clone()));
                    return networkResponse;
                });
            })
        );
    }
});