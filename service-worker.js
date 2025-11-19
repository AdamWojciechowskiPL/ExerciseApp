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
    '/icons/icon-512x512.png'
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


// * Krok 3: Przechwytywanie zapytań sieciowych (Fetch)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Strategia dla zapytań do API Netlify Functions
    if (url.pathname.startsWith('/.netlify/functions/')) {
        // Obsługuj tylko zapytania, które modyfikują dane (POST, PUT, DELETE) strategią "tylko sieć"
        if (event.request.method !== 'GET') {
            event.respondWith(fetch(event.request));
            return; // Zakończ, aby nie próbować buforować
        }
        
        // Dla zapytań GET użyj strategii Network First, Fallback to Cache
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Poprawna obsługa: klonujemy i zapisujemy w cache tylko odpowiedzi GET
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    })
                    .catch(() => {
                        // Jeśli sieć zawiedzie, spróbuj znaleźć odpowiedź w cache
                        return cache.match(event.request);
                    });
            })
        );
    } 
    // Strategia dla wszystkich pozostałych zapytań (Cache First)
    else {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
    }
});