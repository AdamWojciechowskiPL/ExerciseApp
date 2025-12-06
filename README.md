# Aplikacja Treningowa (Smart Rehab PWA) v10.1.0

Zaawansowana aplikacja PWA (Progressive Web App) łącząca trening siłowy z rehabilitacją kręgosłupa (metodyka McGill L5-S1). System wykorzystuje architekturę Serverless oraz autorski silnik **"Virtual Physio"** (v3.3), który generuje spersonalizowane plany treningowe na podstawie szczegółowej ankiety medycznej i biomechanicznej.

---

## 🚀 Kluczowe Funkcjonalności

### 🧠 Virtual Physio (Dynamiczny Generator Planów v3.3)
*   **Inteligentny Wizard:** Rozbudowana ankieta zbierająca dane o lokalizacji bólu, historii medycznej, wzorcach ruchowych (triggers/reliefs) oraz stylu życia (praca, hobby).
*   **Generator AI (`generate-plan.js`):** Algorytm po stronie serwera tworzący spersonalizowane plany tygodniowe, uwzględniający przeciwwskazania i priorytety terapeutyczne.
*   **Walidacja kliniczna:** Blokada generacji planu dla przypadków wykluczonych regułami klinicznymi (`can_generate_plan`).
*   **Ograniczenie powtarzalności:** Mechanizm `weeklyUsage` limitujący częstość pojawiania się tego samego ćwiczenia w tygodniu.

### 🏆 Gamifikacja i Analityka
*   **Exercise Mastery (Karty Mistrzostwa):** System RPG dla ćwiczeń. Każde wykonane ćwiczenie dodaje XP. Karty ewoluują wizualnie (Brąz → Srebro → Złoto → Neon) wraz z postępami.
*   **Resilience Shield ("Tarcza"):** Wskaźnik ciągłości treningów i odporności na nawroty bólu.
*   **Hero Dashboard:** Nowoczesny panel z kafelkami statystyk (Seria, Tarcza, Łączny Czas Treningów).
*   **Streak:** Licznik dni treningowych z rzędu.

### 📱 Nowoczesny Dashboard (UI & UX)
*   **Mission Card:** Karta "Twoja Misja na Dziś" z gradientowym nagłówkiem i statusem bólu.
*   **Upcoming Carousel:** Horyzontalna lista nadchodzących treningów.
*   **Poprawiona walidacja trybu:** Przełączanie między trybem dynamicznym a statycznym poprawnie resetuje cache sesji.

### 🏋️ Tryby Treningowe
1.  **Tryb Dynamiczny:** Plan "szyty na miarę" przez generator AI.
2.  **Tryb Statyczny:** Klasyczne, sztywne plany treningowe (np. "Fundamenty L5-S1").
3.  **Focus Mode:** Ekran treningu z dużym zegarem, obsługą TTS (lektora) i animacjami SVG (karta z efektem flip).

### 💾 Session Recovery (Nowość v10.1)
*   **Auto-backup:** Stan treningu zapisywany do `localStorage` w czasie rzeczywistym przy każdej zmianie ćwiczenia.
*   **Wykrywanie przerwanej sesji:** Po awarii/zamknięciu przeglądarki aplikacja wykrywa niezakończony trening.
*   **Modal przywracania:** Opcja "Przywróć" lub "Porzuć" z informacją o czasie przerwy i postępie.
*   **Luka czasowa jako pauza:** Czas nieobecności doliczany do `totalPausedTime`.

### ⚙️ Mechanizmy Adaptacyjne
*   **Workout Mixer:** Rotuje ćwiczenia w ramach tej samej kategorii biomechanicznej, aby uniknąć monotonii.
*   **Assistant Engine:** Silnik regułowy modyfikujący objętość w czasie rzeczywistym (np. skrócenie treningu przy wysokim poziomie bólu).
*   **Smart Swap:** Możliwość ręcznej wymiany ćwiczenia na alternatywę z tej samej kategorii.
*   **Obsługa Czarnej Listy:** Blokowanie nielubianych ćwiczeń.

### 📺 Integracja z TV (Google Cast)
*   **Custom Receiver:** Dedykowana aplikacja na telewizor (Chromecast).
*   **Real-time Sync:** Synchronizacja timera i animacji między telefonem a TV.
*   **Anti-Idle System (v8):** Zaawansowane mechanizmy (MediaSession API, Wake Lock API, Canvas Animation, Audio Oscillator, KeepAlive) zapobiegające wygaszaniu ekranu TV.

---

## 📂 Pełna Struktura Plików

```text
/ExerciseApp
│
├── index.html                  # Główny kontener SPA
├── style.css                   # Globalne style (CSS Variables, Dark/Glass Mode)
├── app.js                      # Punkt wejścia, routing, init, session recovery check
├── auth.js                     # Obsługa logowania (Auth0 SDK + JWT)
├── state.js                    # Globalny stan aplikacji (Reactive Store)
├── dataStore.js                # Warstwa API (Fetch, Cache, Sync)
├── utils.js                    # Helpery (Daty, Parsowanie, Hydracja)
├── sessionRecovery.js          # [NOWOŚĆ] Backup/restore sesji treningowej
│
├── LOGIKA BIZNESOWA (FRONTEND):
│   ├── workoutMixer.js         # Logika rotacji ćwiczeń i Smart Swap
│   ├── assistantEngine.js      # Skalowanie objętości (Ból/Czas)
│   ├── training.js             # Kontroler przebiegu treningu + triggerSessionBackup
│   ├── timer.js                # Obsługa stopera i timera
│   ├── tts.js                  # Text-to-Speech (Synteza mowy)
│   ├── cast.js                 # Google Cast Sender SDK
│   ├── gamification.js         # Obliczanie poziomów i statystyk
│   └── dom.js                  # Cache referencji DOM
│
├── UI (MODUŁY PREZENTACJI):
│   ├── ui.js                   # Eksporter modułów UI
│   ├── ui/
│   │   ├── core.js             # Loader, WakeLock, Nawigacja
│   │   ├── templates.js        # Generatory HTML (Karty, Hero Dashboard)
│   │   ├── modals.js           # Okna dialogowe (Swap, Evolution, Session Recovery)
│   │   ├── wizard.js           # Kreator konfiguracji (Ankieta medyczna, SVG Body Map)
│   │   └── screens/            # Widoki poszczególnych ekranów:
│   │       ├── dashboard.js    # Ekran Główny (Hero Stats, Karuzela) + plan mode validation
│   │       ├── training.js     # Ekran Treningu (Focus Mode)
│   │       ├── history.js      # Kalendarz i Historia
│   │       ├── library.js      # Baza Ćwiczeń i Filtry
│   │       ├── settings.js     # Ustawienia i Integracje
│   │       ├── summary.js      # Podsumowanie i Feedback + clearSessionBackup
│   │       ├── help.js         # Ekran Pomocy
│   │       └── analytics.js    # Ekran Kart Mistrzostwa (Mastery)
│
├── BACKEND (NETLIFY FUNCTIONS):
│   ├── netlify/functions/
│   │   ├── generate-plan.js        # Generator planów dynamicznych (v3.3)
│   │   ├── get-app-content.js      # Pobieranie bazy wiedzy (+ primaryPlane, position)
│   │   ├── get-or-create-user.js   # Inicjalizacja usera
│   │   ├── save-session.js         # Zapis treningu + Ewolucja planu
│   │   ├── save-settings.js        # Zapis ustawień i planów
│   │   ├── get-user-stats.js       # Statystyki (Streak, Resilience, Time)
│   │   ├── get-exercise-mastery.js # Agregacja statystyk XP dla ćwiczeń
│   │   ├── manage-blacklist.js     # Zarządzanie czarną listą
│   │   ├── strava-*.js             # Integracja OAuth ze Strava
│   │   ├── _auth-helper.js         # Weryfikacja JWT i połączenie DB
│   │   └── _stats-helper.js        # Logika statystyk (współdzielona)
│
├── RECEIVER (APLIKACJA TV):
│   └── receiver/
│       ├── index.html          # Widok na telewizorze
│       ├── style.css           # Style TV
│       └── receiver.js         # Logika odbiornika (Anti-Idle v8)
│
└── KONFIGURACJA:
    ├── netlify.toml            # Config hostingu
    ├── package.json            # Zależności Node.js
    ├── manifest.json           # PWA Manifest
    └── service-worker.js       # Cache PWA (Offline support)
```

---

## 🗄 Struktura Bazy Danych (PostgreSQL)

Baza danych hostowana na **Neon (Serverless Postgres)**. Poniżej schemat kluczowych tabel.

### 1. `users`
Tabela główna użytkowników (powiązana z Auth0 ID).
*   `id` (PK, VARCHAR): Auth0 User ID.
*   `created_at` (TIMESTAMP).

### 2. `exercises`
Katalog ćwiczeń (Baza Wiedzy).
*   `id` (PK, VARCHAR): Unikalny slug (np. `deadBug`).
*   `name` (VARCHAR): Nazwa wyświetlana.
*   `description` (TEXT): Instrukcja.
*   `equipment` (VARCHAR): Np. "Mata, Hantle" (CSV).
*   `category_id` (VARCHAR): Kategoria biomechaniczna (np. `core_anti_extension`).
*   `difficulty_level` (INT): 1-5.
*   `pain_relief_zones` (TEXT[]): Tagi medyczne.
*   `animation_svg` (TEXT): Kod SVG animacji.
*   `default_tempo` (VARCHAR): Np. "2-0-2".
*   `is_unilateral` (BOOLEAN): Czy wykonywane na stronę.
*   `max_recommended_reps` (INT).
*   `max_recommended_duration` (INT).
*   `primary_plane` (VARCHAR): **[NOWE]** Płaszczyzna ruchu (flexion/extension/rotation/lateral_flexion/multi).
*   `position` (VARCHAR): **[NOWE]** Pozycja wyjściowa (standing/sitting/kneeling/quadruped/supine/prone).

### 3. `user_settings`
Przechowuje konfigurację oraz **wygenerowany plan dynamiczny**.
*   `user_id` (FK, VARCHAR).
*   `settings` (JSONB): Przechowuje m.in. `dynamicPlanData` (Lekki JSON z referencjami do ćwiczeń).
*   `updated_at` (TIMESTAMP).

### 4. `training_sessions`
Historia wykonanych treningów.
*   `session_id` (PK, BIGINT).
*   `user_id` (FK, VARCHAR).
*   `plan_id` (VARCHAR).
*   `started_at` (TIMESTAMP).
*   `completed_at` (TIMESTAMP).
*   `session_data` (JSONB): Pełny log (ćwiczenia, serie, feedback, ból, netDurationSeconds).

### 5. `user_exercise_blacklist`
Lista ćwiczeń zablokowanych przez użytkownika.
*   `user_id` (FK).
*   `exercise_id` (FK).
*   `preferred_replacement_id` (FK, NULLABLE).

### 6. `training_plans` & `plan_days` & `day_exercises`
Struktura dla planów **statycznych** (szablonów).

### 7. `user_integrations`
Tokeny do serwisów zewnętrznych (Strava).

### 8. `user_plan_overrides`
Przechowuje trwałe zamiany ćwiczeń (Ewolucja/Dewolucja) dokonane przez algorytm lub usera.
*   `user_id` (FK).
*   `original_exercise_id` (FK).
*   `replacement_exercise_id` (FK).
*   `reason` (TEXT): np. "flare-up", "monotony", "progression".

---

## 🚀 Instalacja i Uruchomienie

### Wymagania
*   Node.js v18+
*   Konto Netlify (i zainstalowane `netlify-cli`).
*   Baza PostgreSQL (np. Neon).
*   Konto Auth0.

### Setup
1.  Sklonuj repozytorium.
2.  Zainstaluj zależności:
    ```bash
    npm install
    ```
3.  Utwórz plik `.env` z kluczami:
    ```env
    NETLIFY_DATABASE_URL=postgres://...
    AUTH0_ISSUER_BASE_URL=...
    AUTH0_AUDIENCE=...
    ENCRYPTION_SECRET_KEY=...
    STRAVA_CLIENT_ID=...
    STRAVA_CLIENT_SECRET=...
    URL=http://localhost:8888
    ```
4.  Uruchom lokalnie:
    ```bash
    netlify dev
    ```

Aplikacja dostępna pod: `http://localhost:8888`

---

### Virtual Physio – generator dynamicznych planów

Generator buduje tygodniowy plan ćwiczeń na podstawie danych z ankiety kliniczno‑treningowej użytkownika. Logika działa w kilku krokach.

#### 1. Wejście

Generator przyjmuje strukturę `wizardData` zawierającą m.in.:

* profil bólu:

  * `pain_intensity`, `daily_impact`,
  * `pain_character` (np. dull, sharp, burning, radiating),
  * `pain_locations` (np. lumbar_general, sciatica),
  * `trigger_movements`, `relief_movements`,
* diagnozy medyczne (`medical_diagnosis`),
* tryb pracy (`work_type`),
* hobby (`hobby`),
* priorytety treningowe (`primary_goal`, `secondary_goals`, `session_component_weights`),
* liczba sesji w tygodniu (`sessions_per_week`) i docelowy czas sesji (`target_session_duration_min`),
* dostępny sprzęt (`equipment_available`),
* doświadczenie treningowe (`exercise_experience`),
* ograniczenia fizyczne (`physical_restrictions`),
* flaga `can_generate_plan`.

Generator uruchamia się wyłącznie, gdy `can_generate_plan === true`.

#### 2. Dane z bazy ćwiczeń

Z bazy `exercises` pobierana jest pełna lista ćwiczeń, wraz z:

* `category_id`, `difficulty_level`,
* `max_recommended_reps`, `max_recommended_duration`, `default_tempo`,
* `pain_relief_zones`,
* `equipment`,
* `is_unilateral`,
* dodatkowymi polami biomechanicznymi:

  * `primary_plane` (flexion / extension / rotation / lateral_flexion / multi),
  * `position` (standing / sitting / kneeling / quadruped / supine / prone).

Dodatkowo uwzględniana jest czarna lista ćwiczeń konkretnego użytkownika (`user_exercise_blacklist`).

#### 3. Analiza wzorców ruchowych i ciężkości stanu

Na podstawie `trigger_movements` i `relief_movements` określany jest wzorzec tolerancji kręgosłupa:

* `flexion_intolerant`,
* `extension_intolerant`,
* `neutral`.

Na podstawie natężenia bólu i wpływu na funkcjonowanie wyliczany jest `severityScore`, z korektą dla bólu ostrego/promieniującego. Ten wynik decyduje o:

* fladze `isSevere`,
* maksymalnym dopuszczalnym poziomie trudności ćwiczeń (`difficultyCap`), z uwzględnieniem doświadczenia użytkownika i charakteru bólu.

#### 4. Ważenie kategorii ćwiczeń

Generator buduje wektor wag kategorii (`weights`) wychodząc od neutralnych wartości i modyfikując je na podstawie:

* diagnoz medycznych (np. scoliosis, disc_herniation, stenosis, piriformis),
* typu pracy,
* hobby (np. bieganie, rower, siłownia),
* priorytetów użytkownika (mobilność, stabilizacja, siła, oddech, postawa).

Wagi określają, które kategorie (np. core_anti_extension, core_anti_rotation, glute_activation, hip_mobility, nerve_flossing, breathing) będą preferowane przy budowaniu sesji.

#### 5. Filtracja kandydatów z bazy ćwiczeń

Z listy wszystkich ćwiczeń tworzona jest lista kandydatów, spełniających jednocześnie:

1. brak na czarnej liście użytkownika,
2. dostępny sprzęt,
3. poziom trudności ≤ `difficultyCap`,
4. brak naruszenia ograniczeń fizycznych (`no_kneeling`, `no_twisting`, `no_floor_sitting`) w oparciu o:

   * `primary_plane`,
   * `position`,
5. zgodność z wzorcem tolerancji (`flexion_intolerant` / `extension_intolerant`) w oparciu o:

   * `primary_plane`,
   * `pain_relief_zones`,
6. w trybie ostrym (`isSevere === true`) – dopasowanie strefy ulgi bólu (`pain_relief_zones`) do lokalizacji bólu.

Jeżeli po tym etapie liczba kandydatów jest zbyt mała, uruchamiany jest fallback, który luzuje jedynie poziom trudności, pozostawiając wszystkie ograniczenia kliniczne (sprzęt, restrykcje pozycji/ruchu, wzorzec tolerancji, tryb ostry).

#### 6. Budowa tygodniowego planu

Generator tworzy strukturę `weeklyPlan` z `sessions_per_week` sesjami. Każda sesja składa się z trzech części:

1. **Rozgrzewka (`warmup`)**

   * ćwiczenia oddechowe/relaksacyjne (kategorie `breathing`, `breathing_control`, `muscle_relaxation`),
   * 1–2 ćwiczenia mobilności kręgosłupa (`spine_mobility`), w liczbie zależnej od wagi tej kategorii.

2. **Część główna (`main`)**

   * opcjonalne ćwiczenie `nerve_flossing` przy wysokiej wadze tej kategorii,
   * ćwiczenia core z kategorii `core_anti_extension`, `core_anti_rotation`, `core_anti_flexion` w kolejności wynikającej z wektora wag,
   * ćwiczenia aktywacji pośladków (`glute_activation`) przy odpowiednio wysokiej wadze.

   Generator ogranicza maksymalną liczbę sesji w tygodniu, w których to samo ćwiczenie może pojawić się w części głównej, aby uniknąć nadmiernej powtarzalności.

3. **Schłodzenie (`cooldown`)**

   * ćwiczenia mobilności bioder (`hip_mobility`) zależnie od wagi tej kategorii,
   * ćwiczenia oddechowe/relaksacyjne.

Dobór konkretnych ćwiczeń odbywa się przez funkcję losującą z ograniczeniami:

* brak powtórzeń tego samego ćwiczenia w obrębie jednej sesji,
* ograniczona liczba powtórzeń ćwiczenia w częściach głównych w skali całego tygodnia.

#### 7. Dobór objętości (serie, powtórzenia / czas)

Dla każdej sesji wyliczany jest `loadFactor`, który zależy od:

* ciężkości stanu (`severityScore`),
* doświadczenia treningowego (`exercise_experience`),
* liczby sesji w tygodniu (`sessions_per_week`).

Na tej podstawie:

* ustalana jest liczba serii w rozgrzewce, części głównej i schłodzeniu, z osobnym traktowaniem ćwiczeń unilateralnych,
* wyliczana jest docelowa liczba powtórzeń lub czas pracy (w sekundach) w oparciu o:

  * `max_recommended_reps`,
  * `max_recommended_duration`,
  * poziom trudności ćwiczenia.

#### 8. Optymalizacja czasu trwania sesji

Dla każdej sesji:

1. Szacowany jest czas trwania na podstawie:

   * liczby serii i powtórzeń,
   * szacowanego czasu pojedynczego powtórzenia,
   * stałych wartości odpoczynku pomiędzy seriami i ćwiczeniami.
2. Jeżeli czas znacząco przekracza cel:

   * najpierw redukowana jest liczba ćwiczeń w części głównej (usuwane są ostatnie ćwiczenia),
   * następnie – w razie potrzeby – redukowana jest liczba serii i/lub powtórzeń/czas pracy.

#### 9. Zapis planu

Gotowy plan tygodniowy jest „sanityzowany" – w sesjach zapisywane są tylko:

* `exerciseId`,
* `sets`,
* `reps_or_time`,
* `equipment` (w formie tekstowej).

Struktura jest zapisywana w `user_settings.settings.dynamicPlanData` jako aktualny plan dynamiczny użytkownika.