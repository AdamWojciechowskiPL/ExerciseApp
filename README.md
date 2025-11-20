# Aplikacja Treningowa (Smart PWA + Rehabilitation Focus)

Zaawansowana aplikacja PWA (Progressive Web App) stworzona do inteligentnego planowania i śledzenia treningów siłowych oraz rehabilitacyjnych (metodyka McGill L5-S1). System działa w architekturze Serverless i wykorzystuje autorski silnik decyzyjny ("Asystent"), który w czasie rzeczywistym dostosowuje parametry treningu do samopoczucia użytkownika.

## 🌟 Główne Funkcjonalności

### 1. Inteligentne Centrum Dowodzenia (Dashboard)
*   **Wskaźnik Resilience ("Tarcza"):** Algorytm analizujący regularność treningów z ostatnich 14 dni, motywujący do utrzymania ciągłości rehabilitacji.
*   **Wellness Check-in:** Przed rozpoczęciem treningu użytkownik określa poziom bólu. System automatycznie przelicza objętość treningu (serie/czas) – redukując obciążenie w gorsze dni.
*   **Karta Misji:** Dynamiczna karta prezentująca zadanie na "Dziś" z estymowanym czasem trwania.

### 2. Smart Swap & Czarna Lista
*   **Inteligentna Wymiana:** Możliwość podmienienia ćwiczenia na alternatywę z tej samej kategorii biomechanicznej (np. *Core Anti-Extension*).
*   **Smart Value Converter:** Przy wymianie system automatycznie konwertuje parametry (np. zamieniając "10 powtórzeń" na "45 sekund", jeśli nowe ćwiczenie jest izometryczne).
*   **Czarna Lista:** Użytkownik może trwale zablokować nielubiane ćwiczenia. System zapamiętuje preferencje i pozwala zarządzać blokadami z poziomu Biblioteki.

### 3. Tryb Treningowy (Focus Mode)
*   **Immersyjny Interfejs:** Pełnoekranowy widok z blokadą wygaszania ekranu (Wake Lock API).
*   **Panel Dostosowania:** Suwak czasu (50% - 120%) pozwalający skrócić lub wydłużyć trening "w locie", dynamicznie przeliczając wszystkie serie i powtórzenia.
*   **Integracja Chromecast:** Możliwość rzutowania parametrów treningu i filmów instruktażowych na telewizor (Custom Receiver).

### 4. Integracje
*   **Strava:** Automatyczny upload ukończonych sesji z pełnym opisem wykonanych ćwiczeń.
*   **Auth0:** Bezpieczne uwierzytelnianie użytkowników.

## 🏗 Architektura Techniczna

Projekt oparty jest na nowoczesnym stacku JavaScript bez frameworków (Vanilla JS + ES Modules), co zapewnia maksymalną wydajność i pełną kontrolę nad kodem.

*   **Frontend:** HTML5, CSS3 (Grid/Flex, CSS Variables), Vanilla JS (ES Modules).
*   **Backend:** Netlify Functions (Node.js) – bezstanowe mikroserwisy.
*   **Baza Danych:** PostgreSQL (platforma Neon Serverless).
*   **Hosting:** Netlify.

## 📂 Struktura Plików

Projekt wykorzystuje modułową architekturę frontendu, oddzielając logikę biznesową, stan i warstwę prezentacji.

```text
/aplikacja-treningowa
│
├── icons/                  # Ikony SVG (tarcza, zegar, swap, etc.)
│
├── ui/                 # MODUŁY WARSTWY PREZENTACJI
│   ├── screens/        # Logika poszczególnych ekranów
│   │   ├── dashboard.js    # Ekran Główny (Tarcza, Misja)
│   │   ├── training.js     # Podgląd, Trening, Podsumowanie
│   │   ├── library.js      # Baza ćwiczeń (Filtry, Czarna Lista)
│   │   ├── history.js      # Kalendarz i szczegóły
│   │   └── settings.js     # Ustawienia
│   ├── core.js         # Loader, WakeLock, Nawigacja
│   ├── templates.js    # Generatory kodu HTML (Czyste funkcje)
│   └── modals.js       # Logika okien dialogowych (Smart Swap)
│
├── assistantEngine.js  # MÓZG SYSTEMU (Algorytmy adaptacji i Resilience)
├── app.js              # Punkt wejścia (Init)
├── state.js            # Globalny stan aplikacji (Reaktywny store)
├── dataStore.js        # Komunikacja z API (Fetch wrapper)
├── training.js         # Silnik wykonywania ćwiczeń (Step sequencer)
├── timer.js            # Obsługa czasu i stopera
├── cast.js             # Obsługa Google Cast SDK (Sender)
├── auth.js             # Obsługa Auth0
└── utils.js            # Funkcje pomocnicze
│
├── netlify/functions/      # BACKEND (Serverless)
│   ├── get-app-content.js  # Pobieranie planów i ćwiczeń
│   ├── manage-blacklist.js # API Czarnej Listy (GET/POST/DELETE)
│   ├── save-session.js     # Zapis treningu
│   ├── strava-*.js         # Endpoints integracji Strava
│   └── ...
│
├── receiver/               # Aplikacja Odbiorcy Chromecast
│   ├── index.html
│   └── receiver.js
│
├── index.html              # Główny plik HTML
├── style.css               # Globalne style CSS
└── manifest.json           # Konfiguracja PWA
```

## 🗄 Struktura Bazy Danych (PostgreSQL)

Kluczowe tabele wykorzystywane przez system.

```sql
-- 1. ĆWICZENIA (Metadane dla Smart Assistant)
CREATE TABLE exercises (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    description TEXT,
    equipment VARCHAR(255),
    youtube_url VARCHAR(255),
    category_id VARCHAR(50),             -- np. 'core_anterior' (Kluczowe dla Smart Swap)
    difficulty_level INTEGER,            -- 1-5
    max_recommended_duration INTEGER,    -- Limit czasu (dla konwersji Reps->Time)
    max_recommended_reps INTEGER,        -- Limit powtórzeń
    pain_relief_zones TEXT[]             -- Tagi rehabilitacyjne
);

-- 2. CZARNA LISTA (Preferencje użytkownika)
CREATE TABLE user_exercise_blacklist (
    user_id VARCHAR(255),
    exercise_id VARCHAR(255),
    preferred_replacement_id VARCHAR(255), -- Opcjonalny stały zamiennik
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, exercise_id)
);

-- 3. SESJE TRENINGOWE (Historia)
CREATE TABLE training_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    plan_id VARCHAR(255),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    session_data JSONB                   -- Pełny log serii, RPE, notatki, ból
);

-- 4. PLANY I DNI (Struktura statyczna)
CREATE TABLE training_plans (...);
CREATE TABLE plan_days (...);
CREATE TABLE day_exercises (...);        -- Powiązania ćwiczeń z dniami
```

## 🚀 Uruchomienie Projektu

1.  **Instalacja zależności:**
    ```bash
    npm install
    ```
2.  **Zmienne środowiskowe (.env):**
    Wymagane skonfigurowanie połączenia z bazą danych (`DATABASE_URL`), Auth0 oraz Strava API.
3.  **Uruchomienie lokalne (Netlify Dev):**
    ```bash
    netlify dev
    ```
    Komenda uruchamia lokalny serwer dla frontendu oraz emuluje funkcje serverless na porcie 8888.

---
&copy; 2025 Aplikacja Treningowa v7.0. Wszelkie prawa zastrzeżone.