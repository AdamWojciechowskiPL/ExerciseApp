# Aplikacja Treningowa (Smart Rehab PWA)

Zaawansowana aplikacja PWA (Progressive Web App) do treningu siłowego i rehabilitacyjnego, oparta na metodyce McGill L5-S1. System wykorzystuje architekturę Serverless, autorski silnik decyzyjny ("Asystent") oraz integrację z Google Cast.

Wersja **7.0** wprowadza fundamentalną zmianę w logice aplikacji: **Model Hybrydowy** oraz **Automatyczną Ewolucję**. Aplikacja przestaje być pasywnym dziennikiem, a staje się aktywnym trenerem, który modyfikuje plan w czasie rzeczywistym na podstawie biomechanicznego feedbacku użytkownika.

## 🌟 Kluczowe Funkcjonalności

### 1. Inteligentny Asystent & Bio-Feedback
*   **Wellness Check-in:** Przed każdym treningiem użytkownik określa poziom bólu (0-10).
    *   **Ból > 3 (Safety Mode):** System aktywuje protokół ochronny, redukując objętość treningu (serie/czas).
    *   **Ból 0-3 (Performance Mode):** System przechodzi w tryb budowania stabilności.
*   **Hybrid Feedback Loop (Nowość):** Ekran podsumowania dostosowuje się do kontekstu sesji:
    *   **Ścieżka A (Symptomy):** Jeśli start był z bólem, pytamy o reakcję (Ulga / Stabilnie / Podrażnienie).
    *   **Ścieżka B (Tension Meter):** Jeśli start był bez bólu, użytkownik ocenia jakość napięcia mięśniowego ("Lina"):
        *   *Luźna Lina:* Nuda/Zbyt łatwo.
        *   *Napięta Cięciwa:* Idealna kontrola (Sweet Spot).
        *   *Strzępiąca się Lina:* Utrata techniki/Drżenie.
*   **Auto-Ewolucja Planu (Smart Progression):**
    *   Zgłoszenie "Luźnej Liny" (Nuda) powoduje, że backend automatycznie i trwale podmienia ćwiczenie na trudniejszy wariant (np. *Plank* -> *Weighted Plank*) w planie użytkownika.
    *   Zgłoszenie "Podrażnienia" lub "Strzępiącej się Liny" powoduje regresję do bezpieczniejszego wariantu.
*   **Time Slider:** Możliwość skrócenia lub wydłużenia treningu w locie (50% - 120%) z automatycznym przeliczaniem parametrów.

### 2. Dashboard & Gamifikacja
*   **Weekly Rhythm HUD:** Wizualizacja ostatnich 7 dni na ekranie głównym. Dni treningowe podświetlają się na złoto, dzisiejszy dzień (przed treningiem) pulsuje, motywując do domknięcia cyklu.
*   **Resilience Shield ("Tarcza"):** Algorytm analizujący historię z 14 dni, obliczający stabilność nawyku i ryzyko nawrotu bólu (liczony po stronie serwera).
*   **System Rang:** Początkujący, Adept, Mistrz (zależne od liczby sesji).
*   **Smart Streak:** Licznik serii uwzględniający strefy czasowe użytkownika.

### 3. Wydajność (Performance)
*   **Lazy Loading & Caching:** Strategia "Render First, Fetch Later".
    *   UI ładuje się natychmiast (<200ms) korzystając z cache'owanych danych.
    *   Ciężkie statystyki (pełna historia) są dociągane w tle i "wstrzykiwane" do widoku, gdy są gotowe.
*   **Server-Side Calc:** Złożona matematyka (Tarcza, Streak) przeniesiona do funkcji serverless, aby odciążyć telefon.

### 4. Warstwa Wizualna (Focus Mode)
*   **SVG Animations (SMIL):** Lekkie, wektorowe animacje instruktażowe.
*   **Visual Card (Flip):** Interaktywna karta w trybie treningu. Kliknięcie obraca widok między animacją a opisem.
*   **Dark Mode / High Contrast:** UI zoptymalizowane pod kątem czytelności i oszczędzania baterii (OLED).

### 5. Integracja z Google Cast (TV)
*   **Custom Receiver v3.8:** Dedykowana aplikacja na telewizor.
*   **Anti-Idle Protection:** Zaimplementowany mechanizm "Silent Audio Loop", który zapobiega włączaniu się wygaszacza ekranu na telewizorze podczas statycznych ćwiczeń.
*   **Real-time Sync:** Synchronizacja timera, nazwy ćwiczenia i animacji między telefonem a TV.

### 6. Integracje i Prawo
*   **Strava:** Automatyczny upload ukończonych treningów z sformatowanym opisem.
*   **Dokumentacja Prawna:** Wbudowane podstrony Regulaminu i Polityki Prywatności (zgodność z RODO).

## 📂 Struktura Plików

Projekt zorganizowany jest modułowo w oparciu o **Vanilla JS + ES Modules**.

```text
/aplikacja-treningowa
│
├── index.html                  # Główny plik aplikacji (SPA)
├── style.css                   # Globalne style CSS (Grid, Flex, Dark Mode)
├── app.js                      # Główny punkt wejścia (Init, Lazy Loading, Event Delegation)
├── manifest.json               # Konfiguracja PWA
├── service-worker.js           # Obsługa Offline, Caching
├── package.json                # Zależności Node.js (dla Netlify Functions)
├── README.md                   # Dokumentacja projektu
├── privacy.html                # Podstrona Polityki Prywatności (RODO)
├── terms.html                  # Podstrona Regulaminu
│
├── icons/                      # Ikony SVG
│   ├── icon-192x192.png
│   ├── icon-512x512.png
│   ├── logo.png
│   ├── check-circle.svg        # Ikona "Misja Wykonana"
│   ├── refresh-cw.svg          # Ikona odświeżania historii
│   ├── badge-level-1.svg
│   ├── badge-level-2.svg
│   ├── badge-level-3.svg
│   ├── streak-fire.svg
│   ├── shield-check.svg
│   ├── control-play.svg
│   ├── control-pause.svg
│   ├── control-skip.svg
│   ├── control-back.svg
│   ├── sound-on.svg
│   ├── sound-off.svg
│   ├── clock.svg
│   ├── trash.svg
│   ├── swap.svg
│   ├── eye.svg
│   ├── cast.svg
│   ├── external-link.svg
│   ├── info.svg
│   └── ban.svg
│
├── ui/                         # WARSTWA PREZENTACJI (Frontend UI)
│   ├── ui.js                   # Eksporter modułów UI (agregator)
│   ├── core.js                 # Logika nawigacji, Loadera, WakeLock
│   ├── templates.js            # Generatory HTML (Karty, Hero Dashboard, Wykresy)
│   ├── modals.js               # Okna dialogowe (Swap, Ewolucja, Preview)
│   └── screens/                # Logika poszczególnych ekranów
│       ├── dashboard.js        # Ekran Główny (Hero, Misja, Rhythm HUD)
│       ├── training.js         # Ekran Treningu (Widok Focus)
│       ├── summary.js          # Ekran Podsumowania (Hybrydowy Feedback)
│       ├── history.js          # Kalendarz i Szczegóły dnia
│       ├── library.js          # Baza ćwiczeń + Czarna lista
│       └── settings.js         # Ustawienia i Integracje
│
├── netlify/                    # BACKEND (Serverless Functions)
│   └── functions/
│       ├── _auth-helper.js         # Współdzielone: Połączenie z DB, Weryfikacja JWT
│       ├── _crypto-helper.js       # Współdzielone: Szyfrowanie tokenów (AES-256)
│       ├── _stats-helper.js        # Współdzielone: Logika Tarczy i Streaka
│       ├── get-app-content.js      # Pobieranie planów + Overrides (Personalizacja)
│       ├── get-or-create-user-data.js # Init usera + Szybkie sesje (Lightweight)
│       ├── get-user-stats.js       # Pełne przeliczenie statystyk (Heavyweight)
│       ├── get-history-by-month.js # Pobieranie historii do kalendarza
│       ├── save-session.js         # Zapis treningu + Logika Ewolucji Planu
│       ├── save-settings.js        # Zapis ustawień
│       ├── delete-session.js       # Usuwanie pojedynczego treningu
│       ├── delete-user-data.js     # Usuwanie konta (RODO)
│       ├── migrate-data.js         # Migracja z localStorage
│       ├── manage-blacklist.js     # Zarządzanie czarną listą ćwiczeń
│       ├── strava-auth-start.js    # OAuth Strava (Start)
│       ├── strava-auth-callback.js # OAuth Strava (Callback + Szyfrowanie)
│       ├── strava-upload-activity.js # Upload do Strava
│       └── strava-disconnect.js    # Rozłączanie Strava
│
├── receiver/                   # APLIKACJA TV (Chromecast Custom Receiver)
│   ├── index.html              # Struktura widoku TV (Audio Loop Hack)
│   ├── style.css               # Style TV (Duża typografia, Ciemne tło)
│   └── receiver.js             # Logika Cast SDK (Anti-Idle, Sync)
│
└── (Moduły logiczne w głównym katalogu)
    ├── auth.js                 # Wrapper na Auth0 SDK
    ├── cast.js                 # Google Cast Sender SDK (Telefon)
    ├── dataStore.js            # Komunikacja z API, Cache, Inwalidacja
    ├── state.js                # Globalny stan aplikacji (Reactive Store)
    ├── dom.js                  # Cache referencji do elementów DOM
    ├── utils.js                # Helpery (Daty, Parsowanie)
    ├── timer.js                # Obsługa czasu (Timer/Stoper)
    ├── tts.js                  # Syntezator mowy (Text-to-Speech)
    ├── training.js             # Silnik treningowy (Sekwenser)
    ├── gamification.js         # Logika poziomów i rang (Client-side fallback)
    └── assistantEngine.js      # Silnik adaptacji (Pain/Time logic)
```

## 🗄 Struktura Bazy Danych (PostgreSQL)

Kluczowe tabele i kolumny (Schema v7.0):

```sql
-- 1. ĆWICZENIA (Baza wiedzy + Drzewo Ewolucji)
CREATE TABLE exercises (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    description TEXT,
    next_progression_id VARCHAR(255),    -- Wskaźnik na trudniejszą wersję (Ewolucja)
    category_id VARCHAR(50),
    difficulty_level INTEGER,
    animation_svg TEXT,
    youtube_url VARCHAR(255),
    max_recommended_duration INTEGER,
    max_recommended_reps INTEGER,
    equipment VARCHAR(255)
);

-- 2. NADPISANIA PLANU (Personalizacja / Ewolucja)
CREATE TABLE user_plan_overrides (
    user_id VARCHAR(255) NOT NULL,
    original_exercise_id VARCHAR(255) NOT NULL,
    replacement_exercise_id VARCHAR(255) NOT NULL, -- Np. Plank -> Weighted Plank
    adjustment_type VARCHAR(50),         -- 'evolution' / 'devolution'
    reason VARCHAR(255),                 -- Np. "Monotony detected"
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, original_exercise_id)
);

-- 3. SESJE TRENINGOWE (Z nowym formatem feedbacku)
CREATE TABLE training_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    plan_id VARCHAR(255),
    session_data JSONB,                  -- Zawiera teraz obiekt feedback { type: 'tension', value: 1 }
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- 4. PREFERENCJE (Czarna lista)
CREATE TABLE user_exercise_blacklist (
    user_id VARCHAR(255),
    exercise_id VARCHAR(255),
    preferred_replacement_id VARCHAR(255),
    PRIMARY KEY (user_id, exercise_id)
);

-- 5. USTAWIENIA
CREATE TABLE user_settings (
    user_id VARCHAR(255) PRIMARY KEY,
    settings JSONB                       -- Start daty, plan, mnożnik progresji
);

-- 6. INTEGRACJE
CREATE TABLE user_integrations (
    user_id VARCHAR(255),
    provider VARCHAR(50),
    access_token TEXT,                   -- Szyfrowane
    refresh_token TEXT,                  -- Szyfrowane
    expires_at BIGINT
);
```

## 🚀 Instrukcja Uruchomienia

### Wymagania
*   Node.js (v18+)
*   Konto Netlify + CLI
*   Konto Neon (Postgres)
*   Konto Auth0

### Setup
1.  Zainstaluj zależności: `npm install`
2.  Skonfiguruj `.env` (URL bazy, klucze Auth0, Sekret szyfrowania).
3.  Uruchom lokalnie: `netlify dev`

Aplikacja dostępna pod: `http://localhost:8888`