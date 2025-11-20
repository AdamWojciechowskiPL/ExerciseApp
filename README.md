# Aplikacja Treningowa (Full-Stack PWA + Gamification)

Zaawansowana aplikacja PWA (Progressive Web App) do planowania i śledzenia treningów siłowych, zbudowana w architekturze serverless. Projekt ewoluował z prostego dziennika w **angażującą platformę treningową** z systemem grywalizacji, immersyjnym trybem "Focus" i integracją z dużym ekranem (Chromecast).

## 🌟 Nowości w wersji 7.0

*   **Hero Dashboard (Grywalizacja):** System poziomów i rang. Użytkownik zdobywa doświadczenie za każdy trening.
    *   **3 Rangi:** Początkujący (Kiełek), Adept (Hantle), Mistrz (Korona).
    *   **Licznik Serii (Streak):** Ognista ikona śledzi dni treningowe z rzędu.
*   **Nowoczesny UI/UX:**
    *   **Header:** Nowoczesny pasek nawigacji typu "Single Row".
    *   **Mobile-First:** Dedykowana dolna belka nawigacyjna z ikonami SVG na urządzeniach mobilnych.
    *   **Karty Historii:** Przejrzysty układ z siatką statystyk i "zebrą" na liście ćwiczeń.
*   **Ulepszony Tryb Focus:** Pełnoekranowy, minimalistyczny interfejs z ogromnym, czytelnym zegarem i ciemnym motywem, zapobiegający wygaszaniu ekranu.

## Kluczowe Funkcje

### 1. Śledzenie i Planowanie
*   **Dynamiczne Plany:** Obsługa złożonych planów treningowych (np. McGill L5-S1) z podziałem na rozgrzewkę, część główną i schłodzenie.
*   **Historia:** Szczegółowy podgląd ukończonych sesji z czasem trwania, oceną bólu i notatkami.
*   **Baza Ćwiczeń:** Biblioteka z opisami, wymaganym sprzętem i linkami do wideo (YouTube).

### 2. Grywalizacja (The Path of Progress)
System motywacyjny działający zarówno na telefonie, jak i na telewizorze.
*   **Logika:** Obliczana po stronie backendu oraz frontendu (dla natychmiastowej reakcji).
*   **Progi:**
    *   **Początkujący:** Poziomy 1-9.
    *   **Adept:** Poziomy 10-24.
    *   **Mistrz:** Poziom 25+.

### 3. Integracja z Chromecast (v3.0)
Aplikacja posiada dedykowany odbiornik (Custom Receiver), który zmienia telewizor w dashboard treningowy.
*   **Tryb Idle:** Wyświetla **Hero Dashboard** – wielki awatar rangi, poziom i licznik serii użytkownika.
*   **Tryb Treningu:** Wyświetla aktualne ćwiczenie, ogromny licznik czasu (zmieniający kolor podczas przerwy) i następny krok.
*   **Wideo:** Możliwość rzutowania filmów instruktażowych z bazy ćwiczeń.

### 4. Integracje Zewnętrzne
*   **Strava:** Pełna obsługa OAuth 2.0. Automatyczny upload ukończonego treningu jako aktywności z pełnym opisem wykonanych serii.
*   **Auth0:** Bezpieczne logowanie i zarządzanie sesją użytkownika.

## Architektura Techniczna

*   **Frontend:** Vanilla JS (ES Modules), CSS3 Variables, Flexbox/Grid. Brak frameworków – czysta wydajność.
*   **Backend:** Netlify Functions (Node.js).
*   **Baza Danych:** PostgreSQL (platforma Neon).
*   **PWA:** Service Worker (`network-first` dla API, `stale-while-revalidate` dla assetów), `manifest.json`.

## Struktura Projektu

```text
/aplikacja-treningowa
│
├── icons/                  # Ikony aplikacji, rangi (SVG) i logo
│   ├── badge-level-1.svg
│   ├── badge-level-2.svg
│   ├── badge-level-3.svg
│   ├── streak-fire.svg
│   ├── logo.png
│   └── ...
│
├── netlify/functions/      # Backend Serverless
│   ├── get-or-create-user-data.js  # Pobiera profil + oblicza statystyki grywalizacji
│   ├── save-session.js
│   ├── strava-*.js         # Logika integracji Strava
│   ├── _auth-helper.js     # Weryfikacja JWT i połączenie z DB
│   └── ...
│
├── receiver/               # Aplikacja Odbiorcy Chromecast
│   ├── index.html
│   ├── style.css           # Style dostosowane do TV (jednostki vh/vw)
│   └── receiver.js         # Logika odbioru komunikatów
│
├── index.html              # Główny punkt wejścia PWA
├── style.css               # Globalne style, zmienne, RWD
│
├── app.js                  # Główny kontroler aplikacji
├── auth.js                 # Obsługa Auth0
├── cast.js                 # Sender SDK (wysyłanie danych do TV)
├── dataStore.js            # Warstwa danych (API, State)
├── gamification.js         # Logika obliczania poziomów i serii
├── state.js                # Globalny stan aplikacji
├── training.js             # Logika silnika treningowego
├── ui.js                   # Renderowanie interfejsu
├── utils.js                # Funkcje pomocnicze
│
├── manifest.json
└── service-worker.js
```

## Uruchomienie i Konfiguracja

### Wymagania
*   Node.js & NPM
*   Konto na Netlify (do hostingu i funkcji)
*   Baza danych PostgreSQL (np. Neon)
*   Konto Auth0
*   Konto Google Cast SDK Developer (do rejestracji aplikacji Receivera)

### Zmienne Środowiskowe (.env / Netlify Dashboard)
Aby aplikacja działała, musisz skonfigurować następujące zmienne:

```env
DATABASE_URL="postgres://user:pass@host/db?sslmode=require"
AUTH0_DOMAIN="twoja-domena.us.auth0.com"
AUTH0_AUDIENCE="https://twoja-aplikacja.netlify.app/"
STRAVA_CLIENT_ID="..."
STRAVA_CLIENT_SECRET="..."
ENCRYPTION_SECRET_KEY="..." # Min. 32 znaki, do szyfrowania tokenów
URL="https://twoja-aplikacja.netlify.app" # Adres produkcyjny
```

### Instalacja Lokalna
1.  `npm install`
2.  Skonfiguruj plik `.env`.
3.  Uruchom serwer deweloperski: `netlify dev`.

## Baza Danych (Schema)

Kluczowe tabele wymagane do działania systemu:

```sql
-- Użytkownicy
CREATE TABLE users (id VARCHAR(255) PRIMARY KEY, email VARCHAR(255));

-- Ustawienia (JSONB)
CREATE TABLE user_settings (user_id VARCHAR(255) PRIMARY KEY, settings JSONB);

-- Sesje (Kluczowe dla historii i grywalizacji)
CREATE TABLE training_sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id),
    plan_id VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    session_data JSONB
);

-- Integracje
CREATE TABLE user_integrations (...);
```

## Licencja
Projekt prywatny. Wszelkie prawa zastrzeżone.

---
&copy; 2025 Aplikacja Treningowa. Wersja 7.0.0