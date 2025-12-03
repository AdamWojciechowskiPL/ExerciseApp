# Aplikacja Treningowa (Smart Rehab PWA) v8.0.0

Zaawansowana aplikacja PWA (Progressive Web App) do treningu siłowego i rehabilitacyjnego, oparta na metodyce McGill L5-S1. System wykorzystuje architekturę Serverless, autorski silnik decyzyjny ("Asystent") oraz integrację z Google Cast.

---

## 🚀 Funkcjonalności

### Dashboard & Gamifikacja
*   **Weekly Rhythm HUD:** Wizualizacja ciągłości treningów w bieżącym tygodniu.
*   **Resilience Shield ("Tarcza"):** Algorytm analizujący historię i obliczający stabilność nawyku oraz ryzyko nawrotu bólu.
*   **Smart Refresh:** Mechanizm odświeżania danych w tle bez blokowania interfejsu ("Render First, Fetch Later").

### Tryb Treningowy (Focus Mode)
*   **Visual Card (Flip):** Interaktywna karta – kliknięcie przełącza między animacją SVG a opisem technicznym.
*   **Wellness Check-in:** Przed startem użytkownik określa poziom bólu (0-10). Silnik automatycznie skaluje objętość treningu w zależności od samopoczucia.
*   **Manual Shuffle:** Możliwość ręcznego przelosowania całego treningu przyciskiem "Shuffle" lub pojedynczego ćwiczenia przyciskiem "Mix".

### Integracja z Google Cast (TV)
*   **Custom Receiver v5.0:** Dedykowana aplikacja na telewizor.
*   **Anti-Idle Protection:** Mechanizm zapobiegający wygaszaniu ekranu TV (pętla wideo w tle + wymuszanie klatek GPU).
*   **Real-time Sync:** Synchronizacja timera, nazwy ćwiczenia i animacji SVG między telefonem a TV.

### Integracje Zewnętrzne
*   **Strava:** Automatyczny upload ukończonych treningów z sformatowanym opisem.

### Smart Onboarding Wizard (Bio-Skaner)
Proces kalibracji użytkownika uruchamiany przy starcie lub na żądanie:
*   **Mapa Bólu (Bio-Skaner):** Interaktywny model SVG kręgosłupa pozwala zaznaczyć strefy wymagające naprawy (Szyja, Piersiowy, Lędźwia, Miednica). System automatycznie wstrzykuje ćwiczenia naprawcze ("Pre-hab") do rozgrzewki każdej sesji.
*   **Zbrojownia (Equipment Selector):** Dynamiczna lista sprzętu pobierana z bazy. System filtruje ćwiczenia, których użytkownik nie jest w stanie wykonać (np. brak drążka) i szuka zamienników.
*   **Chrono-Architekt:** Użytkownik definiuje dostępne okna czasowe dla każdego dnia tygodnia oraz dni wolne.

### Dynamic Biomechanical Matrix (Workout Mixer)
Silnik `workoutMixer.js` generuje unikalne zestawy treningowe w czasie rzeczywistym:
*   **Freshness Index:** Algorytm analizuje historię treningów (do 90 dni wstecz) i priorytetyzuje ćwiczenia, których użytkownik dawno nie wykonywał, aby uniknąć monotonii.
*   **Smart Swap:** Jeśli użytkownik nie posiada wymaganego sprzętu, silnik automatycznie podmienia ćwiczenie na biomechaniczny odpowiednik z tej samej kategorii.
*   **Inteligentna Konwersja:** Przy zamianie ćwiczeń system przelicza parametry (np. zamieniając 60s Planka na 15 powtórzeń Dead Bug), respektując limity (`maxDuration`, `maxReps`) z bazy danych.
*   **Time Compression:** Jeśli plan przewiduje 45 min, a użytkownik ma tylko 20 min (wg ustawień Wizarda), system automatycznie kompresuje trening (redukcja serii), zachowując kluczowe bodźce.

### Płynna Kolejka (Liquid Queue)
*   **Logika kolejkowania:** System nie przypisuje treningów do dat kalendarzowych. Zamiast tego wylicza kolejny logiczny krok na podstawie liczby *ukończonych* sesji. Pominięcie treningu nie psuje planu – kolejka po prostu czeka.
*   **Dni Regeneracji:** Jeśli w harmonogramie użytkownik oznaczył dzień jako wolny, Dashboard automatycznie przechodzi w tryb "Regeneracji".

---

## 📂 Struktura Plików

Projekt zorganizowany jest w płaskiej strukturze modułowej (ES Modules), co ułatwia importowanie zależności bez skomplikowanych ścieżek.

```text
/aplikacja-treningowa
│
├── index.html                  # Główny plik aplikacji (SPA Container + Nawigacja)
├── style.css                   # Globalne style (CSS Variables, Dark Mode, Layout)
├── app.js                      # Punkt wejścia (Router, Init, Event Listeners)
├── service-worker.js           # Obsługa PWA (Cache, Offline mode)
├── manifest.json               # Konfiguracja instalacji PWA
│
├── ui/                         # WARSTWA PREZENTACJI (Podkatalog)
│   ├── ui.js                   # Główny eksporter modułów UI
│   ├── core.js                 # Narzędzia UI (Loader, WakeLock, Nawigacja)
│   ├── templates.js            # Generatory HTML (Karty ćwiczeń, Hero Dashboard)
│   ├── modals.js               # Okna dialogowe (Swap, Ewolucja, Preview)
│   ├── wizard.js               # Kreator konfiguracji (SVG Body Map, Sprzęt)
│   └── screens/                # Logika renderowania poszczególnych ekranów
│       ├── dashboard.js        # Ekran Główny
│       ├── training.js         # Ekran Treningu (Widok)
│       ├── history.js          # Kalendarz i Historia
│       ├── library.js          # Baza ćwiczeń i Filtry
│       ├── settings.js         # Ustawienia i Integracje
│       ├── summary.js          # Podsumowanie i Feedback
│       └── help.js             # Centrum Wiedzy (Pomoc)
│
├── PLIKI GŁÓWNE (LOGIKA, DANE I NARZĘDZIA W KORZENIU):
│   ├── workoutMixer.js         # SILNIK AI: Dobór ćwiczeń, Freshness Index, Smart Swap
│   ├── assistantEngine.js      # SILNIK ZASAD: Skalowanie objętości (Ból/Czas)
│   ├── training.js             # KONTROLER: Logika przepływu treningu (Next/Prev step)
│   ├── dataStore.js            # API Wrapper (Fetch, Cache, Sync z backendem)
│   ├── state.js                # Globalny, reaktywny stan aplikacji
│   ├── auth.js                 # Obsługa Auth0 (Logowanie, Tokeny JWT)
│   ├── utils.js                # Helpery (Daty, Parsowanie, Kolejkowanie planu)
│   ├── gamification.js         # Obliczanie poziomów, serii i rang
│   ├── cast.js                 # Sender dla Google Cast (Komunikacja z TV)
│   ├── timer.js                # Obsługa czasu (Stoper i Timer)
│   ├── tts.js                  # Text-to-Speech (Synteza mowy)
│   └── dom.js                  # Cache referencji do elementów DOM
│
├── netlify/functions/          # BACKEND (Serverless Functions)
│   ├── get-app-content.js      # Pobieranie bazy wiedzy + personalizacja
│   ├── save-session.js         # Zapis treningu + Logika Ewolucji Planu
│   ├── get-user-stats.js       # Obliczanie statystyk (Streak, Resilience)
│   ├── manage-blacklist.js     # Zarządzanie czarną listą ćwiczeń
│   ├── strava-*.js             # Zestaw funkcji do integracji ze Strava API
│   ├── _auth-helper.js         # Weryfikacja tokenów JWT (współdzielony)
│   └── _stats-helper.js        # Logika statystyk (współdzielona)
│
└── receiver/                   # APLIKACJA TV (Custom Cast Receiver)
    ├── index.html              # Widok na telewizorze
    ├── style.css               # Style dedykowane dla TV
    └── receiver.js             # Logika odbiornika (Anti-Idle Hacks, Sync)    
```
---

## 🗄 Struktura Bazy Danych (PostgreSQL)

System opiera się na relacyjnej bazie danych PostgreSQL (hosting Neon). Poniżej znajduje się szczegółowa specyfikacja kluczowych tabel.

### 1. Tabela: `exercises`
Centralny katalog (Baza Wiedzy). Przechowuje definicje ćwiczeń używane przez Mixer.

*   **`id`** (PK, VARCHAR): Unikalny identyfikator (np. `birdDog`, `deadBug`).
*   **`name`** (VARCHAR): Nazwa wyświetlana dla użytkownika.
*   **`description`** (TEXT): Instrukcja wykonania, "Cueing" i błędy.
*   **`equipment`** (VARCHAR): Wymagany sprzęt (np. "mata, hantle"). Kluczowe dla filtra w Wizardzie.
*   **`category_id`** (VARCHAR): Kategoria biomechaniczna (np. `core_anti_extension`). `workoutMixer` wymienia ćwiczenia tylko w obrębie tej samej kategorii.
*   **`difficulty_level`** (INT): Poziom trudności (1-5). Mixer stara się dobierać ćwiczenia +/- 1 poziom od celu.
*   **`max_recommended_duration`** (INT): Limit czasu dla izometrii (używane przy konwersji Reps -> Time).
*   **`max_recommended_reps`** (INT): Limit powtórzeń dla dynamiki (używane przy konwersji Time -> Reps).
*   **`pain_relief_zones`** (TEXT[]): Tagi medyczne (np. `["lumbar", "si_joint"]`). Jeśli użytkownik zaznaczy te strefy w Wizardzie, te ćwiczenia trafią do "Pre-hab".
*   **`animation_svg`** (TEXT): Kod SVG animacji instruktażowej.
*   **`default_tempo`** (VARCHAR): Domyślne tempo wykonywania ćwiczenia.
*   **`is_unilateral`** (BOOLEAN): Informuje, czy dane ćwiczenie jest wykonywane z każdej strony ciała (prawa, lewa) osobno - true.

### 2. Tabela: `training_plans`
Definicje planów treningowych (szablony).

*   **`id`** (PK, VARCHAR): Slug planu (np. `l5s1-foundation`).
*   **`name`** (VARCHAR): Nazwa wyświetlana.
*   **`global_rules`** (JSONB): Konfiguracja przerw i tempa.
    *   `defaultRestSecondsBetweenSets`: int
    *   `defaultRestSecondsBetweenExercises`: int

### 3. Tabela: `plan_days` & `day_exercises`
Struktura "Szkieletu" planu. Definiuje intencję treningową, którą Mixer wypełnia treścią.

*   **`plan_days`**:
    *   `id` (PK, SERIAL)
    *   `plan_id` (FK)
    *   `day_number` (INT): Numer logiczny dnia w cyklu.
    *   `title` (VARCHAR): Temat dnia (np. "Stabilizacja Rotacyjna").

*   **`day_exercises`**:
    *   `day_id` (FK)
    *   `exercise_id` (FK): Ćwiczenie bazowe (domyślne).
    *   `section` (VARCHAR): `warmup`, `main`, `cooldown`.
    *   `sets` (VARCHAR): Liczba serii (np. "3").
    *   `reps_or_time` (VARCHAR): Domyślna objętość (np. "10", "30 s").

### 4. Tabela: `user_settings`
Przechowuje profil "Cyborga" wygenerowany przez Wizard. Kolumna `settings` to typ JSONB.

**Struktura JSON w kolumnie `settings`:**
```json
{
  "appStartDate": "2024-01-01",
  "progressionFactor": 100,
  "activePlanId": "l5s1-foundation",
  
  // Dane z Wizarda:
  "onboardingCompleted": true,
  "painZones": ["lumbar", "neck"],          // Strefy do naprawy
  "equipment": ["Mata", "Hantle", "Drążek"], // Dostępny sprzęt
  "schedule": {                             // Harmonogram
    "0": { "active": true, "minutes": 45 }, // Poniedziałek
    "1": { "active": false, "minutes": 0 }, // Wtorek (Rest)
    "2": { "active": true, "minutes": 30 }, // Środa (Krótki trening - kompresja)
    ...
  }
}
```

### 5. Tabela: `training_sessions`
Historia treningów. Służy do obliczania Freshness Index i kolejki.

*   **`session_id`** (PK, BIGINT): Timestamp.
*   **`user_id`** (FK, VARCHAR).
*   **`plan_id`** (VARCHAR).
*   **`started_at`** (TIMESTAMP).
*   **`completed_at`** (TIMESTAMP).
*   **`session_data`** (JSONB): Pełny log wykonanych ćwiczeń (z uwzględnieniem podmian).
    *   Ważne: W logu zapisywane jest `exerciseId`. To na jego podstawie Mixer sprawdza, kiedy ostatnio robiono dany ruch.

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