# Aplikacja Treningowa (Full-Stack PWA)

W pełni funkcjonalna aplikacja PWA (Progressive Web App) do planowania i śledzenia treningów, zbudowana w architekturze full-stack. Umożliwia dynamiczne zarządzanie treścią, synchronizację danych w chmurze, bezpieczne uwierzytelnianie użytkowników oraz integrację z platformą Strava.

## Cel Projektu

Głównym celem aplikacji jest zapewnienie użytkownikom niezawodnego i spersonalizowanego narzędzia do realizacji planów treningowych. Dane każdego użytkownika, w tym historia i ustawienia, są bezpiecznie przechowywane w chmurze i powiązane z jego osobistym kontem, co gwarantuje prywatność i stały dostęp do postępów z dowolnego urządzenia.

## Kluczowe Funkcje

*   **Konta Użytkowników i Synchronizacja Danych:** Pełna integracja z **Auth0** dla bezpiecznej rejestracji i logowania. Wszystkie postępy, ustawienia i dane integracji są automatycznie zapisywane w centralnej bazie danych i dostępne na każdym urządzeniu.

*   **Pełnoprawna Aplikacja PWA (Progressive Web App):**
    *   **Instalowalność:** Możliwość instalacji na ekranie głównym smartfonów i komputerów, co zapewnia szybki dostęp i natywne odczucia (uruchamianie w trybie pełnoekranowym).
    *   **Działanie Offline:** Dostęp do kluczowych zasobów w trybie offline – użytkownik może przeglądać bibliotekę ćwiczeń i strukturę swojego planu treningowego nawet bez połączenia z internetem.
    *   **Wydajność:** Błyskawiczne ładowanie dzięki zaawansowanym strategiom buforowania (cache) zasobów statycznych.

*   **Dynamiczne Zarządzanie Treścią:** Definicje ćwiczeń i plany treningowe są ładowane dynamicznie z bazy danych, co pozwala na ich modyfikację i rozszerzanie bez potrzeby aktualizacji kodu aplikacji.

*   **Integracja ze Strava:**
    *   Możliwość bezpiecznego połączenia konta Strava poprzez protokół OAuth 2.0.
    *   Automatyczne przesyłanie ukończonych treningów na Stravę jako nowa aktywność typu "Trening siłowy".
    *   Poprawne odzwierciedlenie tytułu, opisu (lista wykonanych ćwiczeń), czasu rozpoczęcia i całkowitego czasu trwania treningu, z uwzględnieniem lokalnej strefy czasowej użytkownika.

*   **Zautomatyzowany Tryb Treningu ("Focus Mode"):** Inteligentny asystent treningowy z przewodnikiem głosowym (TTS), timerem, stoperem oraz blokadą wygaszania ekranu (Wake Lock API), prowadzący użytkownika krok po kroku przez sesję.

*   **Historia i Zarządzanie Treningami:**
    *   Przejrzysty widok kalendarza z historią wykonanych treningów.
    *   Szczegółowy wgląd w każdą sesję, w tym czas rozpoczęcia, zakończenia, całkowity czas trwania i lista wykonanych ćwiczeń.
    *   Możliwość trwałego usunięcia wybranej sesji treningowej z historii.

*   **Personalizacja:** Użytkownicy mogą dostosować datę startu cyklu, przerwy między ćwiczeniami oraz globalny współczynnik progresji (np. wydłużenie czasu ćwiczeń o 10%).

*   **Bezpieczny Backend Serverless:** Logika po stronie serwera jest zaimplementowana przy użyciu **Funkcji Serverless Netlify (Node.js)**. Wszystkie operacje na danych użytkownika są chronione i wymagają poprawnego tokena JWT. Tokeny do integracji ze Strava są bezpiecznie szyfrowane w bazie danych.

## Architektura Systemu

*   **Frontend:** Czysty (Vanilla) JavaScript z modułami ES6, HTML5, CSS3. Aplikacja zaimplementowana jako Progressive Web App (PWA) z wykorzystaniem Service Workera do obsługi trybu offline i buforowania zasobów.
*   **Backend:** **Funkcje Serverless Netlify** (środowisko Node.js) z wykorzystaniem `axios` do komunikacji z zewnętrznymi API.
*   **Baza Danych:** **PostgreSQL** hostowana na platformie **Neon**.
*   **Uwierzytelnianie:** Platforma **Auth0** jako dostawca tożsamości.
*   **Bezpieczeństwo:** Weryfikacja tokenów JWT (`jsonwebtoken`, `jwks-rsa`), szyfrowanie tokenów integracji (`crypto`), ochrona przed CSRF w przepływie OAuth 2.0.

## Struktura Bazy Danych

Aplikacja opiera się na relacyjnym schemacie w bazie PostgreSQL, który zapewnia integralność danych. Kluczowe tabele:

```sql
-- Główna tabela użytkowników (z Auth0)
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY
);

-- Ustawienia specyficzne dla użytkownika
CREATE TABLE user_settings (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Przechowuje dane integracji, np. zaszyfrowane tokeny Strava
CREATE TABLE user_integrations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    strava_athlete_id BIGINT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at BIGINT,
    scope VARCHAR(255),
    UNIQUE (user_id, provider)
);

-- Historia wszystkich ukończonych sesji treningowych
CREATE TABLE training_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ NOT NULL,
    session_data JSONB
);

-- Tabele przechowujące dynamiczną treść aplikacji
CREATE TABLE exercises ( /* ... */ );
CREATE TABLE training_plans ( /* ... */ );
CREATE TABLE plan_days ( /* ... */ );
CREATE TABLE day_exercises ( /* ... */ );
```

## Struktura Projektu

```
/aplikacja-treningowa
│
├── netlify/
│   └── functions/
│       ├── _auth-helper.js
│       ├── _crypto-helper.js
│       ├── get-app-content.js
│       ├── get-or-create-user-data.js
│       ├── save-session.js
│       ├── delete-session.js
│       ├── strava-auth-start.js
│       ├── strava-auth-callback.js
│       ├── strava-disconnect.js
│       └── strava-upload-activity.js
│
├── scripts/
│   └── migrate-content.js          # Jednorazowy skrypt do migracji danych
│
├── index.html
├── style.css
│
├── app.js                          # Główna logika i routing aplikacji
├── auth.js                         # Moduł obsługi uwierzytelniania (Auth0)
├── dataStore.js                    # Warstwa dostępu do danych (komunikacja z API)
├── state.js                        # Centralny obiekt stanu aplikacji
├── ui.js                           # Funkcje renderujące interfejs
├── utils.js                        # Funkcje pomocnicze
├── timer.js                        # Logika timera i stopera
├── training.js                     # Logika sesji treningowej
├── tts.js                          # Logika syntezatora mowy
│
├── manifest.json                   # Manifest aplikacji PWA
├── service-worker.js               # Logika offline i cache PWA
│
├── netlify.toml
└── package.json
```

## Uruchomienie Lokalne

1.  **Wymagania Wstępne:**
    *   Zainstalowany [Node.js](https://nodejs.org/).
    *   Zainstalowany [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npm install -g netlify-cli`.
    *   Skonfigurowane konta na **Auth0**, **Neon** (PostgreSQL) oraz **Strava** (dla deweloperów).

2.  **Instalacja:**
    ```bash
    git clone <adres-repozytorium>
    cd aplikacja-treningowa
    npm install
    ```

3.  **Konfiguracja Zmiennych Środowiskowych:**
    Stwórz plik `.env` w głównym katalogu projektu i wypełnij go wymaganymi kluczami:
    ```
    # Baza danych Neon
    NETLIFY_DATABASE_URL="postgres://..."

    # Auth0
    AUTH0_AUDIENCE="https://..."
    AUTH0_ISSUER_BASE_URL="https://..."

    # Strava
    STRAVA_CLIENT_ID="..."
    STRAVA_CLIENT_SECRET="..."

    # Klucz do szyfrowania tokenów (min. 32 znaki)
    ENCRYPTION_SECRET_KEY="..."
    ```
    Pamiętaj, aby te same zmienne skonfigurować w panelu Netlify dla środowiska produkcyjnego.

4.  **Konfiguracja Frontendu:**
    W pliku `auth.js` wypełnij obiekt `AUTH_CONFIG` swoimi danymi z Auth0.

5.  **Konfiguracja Zewnętrznych Usług:**
    *   **Auth0:** Dodaj `http://localhost:8888` do `Allowed Callback URLs`.
    *   **Strava:** Ustaw `localhost` jako `Authorization Callback Domain`.

6.  **Uruchomienie Aplikacji:**
    ```bash
    netlify dev
    ```
    Aplikacja będzie dostępna pod adresem `http://localhost:8888`.

## Deployment

1.  Wypchnij kod do repozytorium połączonego z Netlify.
2.  Upewnij się, że wszystkie zmienne środowiskowe z pliku `.env` są skonfigurowane w panelu Netlify (`Site settings` -> `Build & deploy` -> `Environment`).
3.  Netlify automatycznie zbuduje i wdroży aplikację oraz wszystkie funkcje serverless.