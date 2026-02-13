# Aplikacja Treningowa (Smart Rehab PWA) v29.1.0

Zaawansowana aplikacja PWA (Progressive Web App) łącząca inteligentny trening siłowy z nowoczesną rehabilitacją. System wykorzystuje architekturę Serverless (Netlify Functions + Neon DB) oraz silnik **"Adaptive Calendar Engine (ACE)"**, który zamiast sztywnych planów tygodniowych generuje dynamiczne, "kroczące" okno treningowe dopasowane do realnego kalendarza użytkownika.

---

## 🚀 Kluczowe Funkcjonalności

### 🌊 Phase Manager (Silnik Periodyzacji)
System nie generuje już "przypadkowych" treningów. Każdy użytkownik znajduje się w konkretnej **Fazie Treningowej**, która determinuje dobór ćwiczeń, objętość i tempo.

*   **Blueprints (Szablony):** Sekwencje faz dopasowane do celu (np. *Siła*: Control → Capacity → Strength → Deload).
*   **Progress Clock:** Licznik sesji steruje przejściem do kolejnej fazy.
    *   *Target Reached:* Użytkownik wykonał założoną liczbę sesji → Level Up.
    *   *Time Cap (Soft Progression):* Użytkownik trenował zbyt rzadko → Wymuszona zmiana bodźca (anty-stagnacja).
*   **Safety Override:** Automatyczne wykrywanie stanów zagrożenia.
    *   **Rehab Mode:** Wymuszany przy wysokim bólu. Skupia się na izometrii i mobilności.
    *   **Deload Mode:** Wymuszany przy wysokim skumulowanym zmęczeniu (Acute Fatigue > 80).

### ⚡ AMPS (Adaptive Multi-Dimensional Progression System)
System zbierania i analizy danych w trakcie treningu, mający na celu precyzyjne sterowanie obciążeniem (Autoregulacja).

*   **Inference Engine (Silnik Wnioskowania):**
    *   Działa na Backendzie (`save-session.js`).
    *   Jeśli użytkownik pominie ocenę, system **wnioskuje** ją na podstawie ogólnego zmęczenia, historii i kontekstu sesji. Zapewnia to ciągłość danych analitycznych.

### ⚙️ Explicit Pacing & Metadata
Zastąpiono algorytmiczne "zgadywanie" tempa twardymi danymi z bazy.
*   Każde ćwiczenie posiada w bazie dedykowane kolumny tempa dla różnych faz (np. `tempo_strength`, `tempo_control`).
*   **Efekt:** To samo ćwiczenie (np. Przysiad) w fazie *Control* jest wykonywane w tempie **3-1-3** (nauka), a w fazie *Strength* w tempie **Dynamicznym**.

### 🛡️ Generator & Validator (Safety Net)
Proces generowania planu został wzbogacony o **Phase Context Pipeline**:
1.  **Context Build:** Generator pobiera stan fazy i override'y z bazy.
2.  **Scoring (G2):** Ćwiczenia są punktowane pod kątem pasowania do fazy (np. w fazie *Metabolic* promowane są ćwiczenia o wysokiej intensywności).
3.  **Prescription (G3):** Narzucanie liczby serii i powtórzeń przez fazę (np. *Strength* wymusza 3-6 powt., *Deload* ucina objętość o 40%).
4.  **Validation (G4):** Ostatnia linia obrony. Jeśli generator wylosuje zbyt trudne ćwiczenie dla fazy *Rehab*, walidator automatycznie je "osłabi" lub odrzuci.

### 📅 Adaptive Calendar Engine (ACE)
Rewolucja w planowaniu treningów. Zamiast statycznego "Planu A" na 4 tygodnie, system działa w modelu **Rolling Window (Kroczące Okno)**:
*   **Planowanie ciągłe:** System zawsze utrzymuje plan na 7 dni do przodu od "Dzisiaj".
*   **Auto-Synchronizacja:** Przy każdym uruchomieniu aplikacja sprawdza, czy plan jest aktualny. Jeśli minął dzień lub brakuje danych, backend automatycznie "dopycha" brakujące dni w tle.
*   **Reality Check:** Algorytm analizuje historię z ostatnich 24-72h. Jeśli ominąłeś trening, dzisiejsza sesja zostanie zmodyfikowana (np. zwiększona objętość "Carry Over"). Jeśli trenowałeś ekstra, dzisiejsza sesja będzie lżejsza ("Fatigue Management").

### 🧠 Adaptive Pacing & Recalculation
System uczy się tempa użytkownika, aby estymacje czasu trwania sesji były idealnie dopasowane.
*   **Analiza Historii:** Backend wylicza medianę czasu wykonania jednego powtórzenia dla każdego ćwiczenia.
*   **Manualna Rekalibracja:** Funkcja przeliczania statystyk na żądanie analizuje całą historię treningową.

### ⏱️ Centralized Pacing Engine
Architektura **Explicit Base Rest**. Logika doboru przerw regeneracyjnych (regeneracja ATP, układ nerwowy, metabolizm) została przeniesiona w 100% na Backend.
*   **Fizjologiczna Baza:** Backend przypisuje każdemu ćwiczeniu idealny czas przerwy (np. 60s dla Siły, 35s dla Neurodynamiki) w momencie generowania planu.
*   **User Scaling:** Frontend nie "zgaduje" kategorii ćwiczenia. Jedynie skaluje otrzymaną wartość bazową przez suwak preferencji użytkownika (np. x0.8 dla "Szybki trening").
*   **Spójność:** Gwarantuje, że czas estymowany na Dashboardzie jest matematycznie identyczny z czasem wykonywania treningu.

### 🛡️ Session Recovery (Crash Protection)
*   **Stan sesji:** Pozycja w treningu, czasy serii, timer i logi są zapisywane lokalnie co 2 sekundy.
*   **Auto-Resume:** Po odświeżeniu strony aplikacja oferuje wznowienie treningu, uwzględniając czas przerwy.

### 🏥 Clinical Engine v6.0 (Safety First)
Zaawansowany silnik reguł współdzielony między Frontend i Backend:
*   **Knee & Spine Protection:** Blokuje wysokie obciążenia (High Load) u osób zdiagnozowanych (np. chondromalacia, dyskopatia) lub zgłaszających ostry ból.
*   **Wzorce Tolerancji:** Wyklucza ruchy (zgięcie/wyprost), które historycznie nasilały ból u danego użytkownika.
*   **Fatigue Filter:** Jeśli system wykryje przemęczenie (np. 3 dni treningowe z rzędu), automatycznie blokuje ćwiczenia o najwyższym poziomie trudności (Lvl 4-5) w kolejnym dniu.

---

## 🧠 Moduły Logiczne (Backend)

### 1. Phase Manager Core (`_phase-manager.js`)
Mózg operacji. Zarządza stanem (JSON), decyduje o aktywnej fazie (czy Override?), obsługuje detraining (powrót po przerwie >21 dni) i resetuje cykl przy zmianie celu głównego.

### 2. Phase Catalog (`phase-catalog.js`)
Statyczna konfiguracja reguł biznesowych:
*   Definicje faz (Control, Mobility, Capacity, Strength, Metabolic).
*   Mapowanie Cel -> Sekwencja Faz.
*   Zasady doboru `target_sessions` w zależności od poziomu zaawansowania (Beginner vs Advanced).

### 3. Virtual Physio (Rolling Planner)
Generator oparty na pętli kalendarzowej, a nie sekwencyjnej.
*   **Schedule Pattern:** Użytkownik wybiera konkretne dni tygodnia (np. Pn, Śr, Pt). System generuje treningi tylko w te dni, a w pozostałe wstawia regenerację.
*   **Frequency Scaling:** Algorytm analizuje gęstość treningów.
    *   *Wysoka częstotliwość (5-7 dni):* Lżejsze sesje, mniejsza objętość na sesję (uniknięcie wypalenia CUN).
    *   *Niska częstotliwość (1-2 dni):* Cięższe sesje, maksymalizacja bodźca ("Weekend Warrior").
*   **Global Freshness:** Algorytm pamięta użycie mięśni w obrębie całego generowanego okna, aby uniknąć katowania tej samej partii dzień po dniu.

### 4. Workout Mixer Lite
Obsługa modyfikacji "w locie" (podczas trwania treningu):
*   **Smart Swap:** Wymiana ćwiczenia na bezpieczną alternatywę z tej samej kategorii biomechanicznej (np. z powodu braku sprzętu).
*   **Tuner Synaptyczny:** Użytkownik może ocenić ćwiczenie jako "Za łatwe" (Ewolucja -> trudniejszy wariant) lub "Za trudne" (Dewolucja -> łatwiejszy wariant).

### 5. Smart Progression Engine (Fluid Logic)
Nowatorski model **Progresji Probabilistycznej**, który działa podczas **generowania nowego planu**. Zastępuje sztywne podmienianie ćwiczeń logiką opartą na wagach.

*   **Zasada Bezpieczeństwa (Fail-Safe):** Nawet jeśli użytkownik odblokował trudniejsze ćwiczenie (Ewolucja), system najpierw sprawdza, czy posiada on wymagany sprzęt i czy stan kliniczny na to pozwala. Jeśli nie – override jest ignorowany.
*   **Cykl Adaptacyjny:** To, co wczoraj było wyzwaniem ("Main"), jutro staje się rozgrzewką ("Warmup").

**Matryca Wag Losowania (Generator):**
| Typ Ćwiczenia | Sekcja Main | Sekcja Warmup | Sekcja Cooldown | Logika |
| :--- | :--- | :--- | :--- | :--- |
| **Cel Ewolucji (Trudne)** | **x3.0** (Priorytet) | x0.5 (Unikaj) | x0.1 (Zabronione) | Nauka nowego ruchu. |
| **Źródło Ewolucji (Łatwe)** | x0.2 (Nuda) | **x1.5** (Idealne) | **x2.0** (Idealne) | Degradacja do roli rozgrzewki. |

### 6. Real-Time Feedback Loop (Injection & Ejection)
Mechanizm natychmiastowej adaptacji **bieżącego planu** (JSON) w momencie zapisu sesji. Sprawia, że opinia użytkownika działa "od razu", a nie dopiero w przyszłym tygodniu.

*   **Injection (Like 👍):** Jeśli użytkownik polubi ćwiczenie, system skanuje resztę tygodnia. Jeśli znajdzie "nudne" ćwiczenie z tej samej kategorii, podmienia je na to polubione. *Cel: Budowanie nawyku i satysfakcji.*
*   **Ejection (Dislike 👎):** Jeśli użytkownik da "Dislike", system natychmiast usuwa to ćwiczenie z przyszłych dni bieżącego planu i zastępuje je bezpieczną alternatywą. *Cel: Zapobieganie demotywacji (Adherence Protection).*
*   **Entropy Grace Period:** Punkty "Affinity" są chronione przed wygaszaniem (Time Decay) przez 7 dni od ostatniej interakcji.

### 7. Bio-Protocol Hub (Front-end)
Sesje celowane generowane natychmiastowo po stronie klienta (Time-Boxing):
*   🚑 **SOS:** Ratunek przeciwbólowy.
*   ⚡ **Neuro:** Ślizgi nerwowe.
*   🌊 **Flow:** Mobilność całego ciała.
*   🔥 **Metabolic Burn:** Intensywne spalanie Low-Impact.
*   🧗 **Ladder:** Budowanie progresji technicznej.

### 8. Pacing Engine (`_pacing-engine.js`)
Centralny moduł "medyczny" odpowiedzialny za parametry czasowe.
*   Przyjmuje definicję ćwiczenia (kategoria, trudność, typ).
*   Zwraca obiekt `calculated_timing` zawierający:
    *   `baseRestSeconds`: Bazowy czas przerwy fizjologicznej (np. 35s dla Neuro, 60s dla Siły).
    *   `baseTransitionSeconds`: Czas na zmianę pozycji.
---

## 🧪 Testy (Jakość Kodu)
Projekt posiada zestaw testów regresyjnych w katalogu `/tests`:
*   **Safety Tests:** Weryfikacja czy Clinical Engine poprawnie blokuje ćwiczenia niebezpieczne (np. rotacja przy przepuklinie).
*   **Data Integrity:** Sprawdzenie czy generator planów poprawnie wstrzykuje obiekt `calculated_timing`.
*   **Calc Logic:** Testy jednostkowe przeliczania przerw na frontendzie.

---

## 📂 Pełna Struktura Plików

```text
/ExerciseApp
│
├── index.html                  # Główny kontener SPA
├── style.css                   # Główny plik stylów (importuje moduły z folderu /css)
├── app.js                      # Punkt wejścia, routing, init, session recovery check
├── auth.js                     # Obsługa logowania (Auth0 SDK + JWT)
├── state.js                    # Globalny stan aplikacji (+ userPreferences)
├── dataStore.js                # Warstwa API (Fetch, Cache, Sync, Preferences)
├── utils.js                    # Helpery (Daty, Parsowanie, Hydracja, SVG)
├── sessionRecovery.js          # Backup/restore sesji treningowej
│
├── CSS (MODULAR STYLES):
│   ├── css/
│   │   ├── variables.css       # Zmienne globalne (kolory, fonty), reset, animacje
│   │   ├── global.css          # Layout, Header, Footer, wspólne komponenty UI
│   │   ├── dashboard.css       # Ekran Główny: Hero, Kalendarz, Oś czasu
│   │   ├── training.css        # Tryb Focus (trening) i podgląd (Pre-training)
│   │   ├── modules.css         # Pozostałe ekrany: Historia, Wizard, Atlas, Podsumowanie
│   │   └── responsive.css      # Media Queries (Mobile/Desktop overrides)
│
├── LOGIKA BIZNESOWA (FRONTEND):
│   ├── protocolGenerator.js    # Generator Bio-Protokołów (Time-Boxing logic)
│   ├── workoutMixer.js         # Mixer v3.0 Lite (Manual swap logic) + Helpery Dewolucji (szukanie łatwiejszych wariantów)
│   ├── assistantEngine.js      # Skalowanie objętości (Pain/Time adaptation) + Klasyfikacja sesji (Smart Summary logic)
│   ├── clinicalEngine.js       # Frontendowy walidator reguł medycznych
│   ├── training.js             # Kontroler przebiegu treningu + pętla backupu + Obsługa Quick Rating i Detail Prompt (State-First)
│   ├── timer.js                # Obsługa stopera (z Audio Pacing) i timera
│   ├── tts.js                  # Text-to-Speech (Synteza mowy)
│   ├── cast.js                 # Google Cast Sender SDK
│   ├── gamification.js         # Obliczanie poziomów i statystyk
│   ├── help.js                 # Wyświetlanie widoku pomocy
│   └── dom.js                  # Cache referencji DOM
│
├── UI (MODUŁY PREZENTACJI):
│   ├── ui.js                   # Eksporter modułów UI
│   ├── ui/
│   │   ├── core.js             # Loader, WakeLock, Nawigacja
│   │   ├── templates.js        # Generatory HTML (Karty Kalendarza, Badges)
│   │   ├── modals.js           # Okna dialogowe (Tuner, Swap, Evolution, Move Day)
│   │   ├── wizard.js           # Kreator konfiguracji (Ankieta medyczna, SVG Body Map)
│   │   └── screens/            # Widoki poszczególnych ekranów:
│   │       ├── dashboard.js    # Ekran Główny (Logic + Render)
│   │       ├── training.js     # Ekran Treningu (Render + Eventy)
│   │       ├── history.js      # Historia + edycja ocen/trudności
│   │       ├── library.js      # Baza Ćwiczeń + filtry
│   │       ├── settings.js     # Ustawienia i Integracje
│   │       └── summary.js      # Podsumowanie z kafelkami ocen
│   │
├── BACKEND (NETLIFY FUNCTIONS):
│   ├── netlify/functions/
│   │   ├── _auth-helper.js          # Weryfikacja JWT i puli połączeń DB
│   │   ├── _clinical-rule-engine.js # Backendowy walidator medyczny
│   │   ├── _crypto-helper.js        # Szyfrowanie tokenów (AES-256-GCM)
│   │   ├── _stats-helper.js         # Logika statystyk (Streak, Resilience, Pacing)
│   │   ├── _pain-taxonomy.js        # Ujednolicony słownik stref bólu
│   │   ├── _tempo-validator.js      # Walidacja i egzekwowanie tempa fazy
│   │   ├── _fatigue-calculator.js   # Oblicza wskaźniki zmęczenia uwzględniając RIR (Reps In Reserve) oraz Quick Ratings (Kciuki). Wykorzystuje model Banistera z precyzyjniejszym wsadem danych (RPE 1-10 wyliczane dynamicznie).
│   │   ├── _data-contract.js        # Schematy walidacji JSON (Pain Monitoring)
│   │   ├── patch-session-feedback.js # Aktualizacja sesji po 24h
│   │   ├── generate-plan.js         # Generator planów dynamicznych (Rolling Window + Fluid Progression)
│   │   ├── _phase-manager.js        # Zarządzanie stanem faz i licznikami
│   │   ├── phase-catalog.js         # Konfiguracja blueprintów i reguł
│   │   ├── get-app-content.js       # Pobieranie bazy wiedzy i personalizacji
│   │   ├── get-or-create-user-data.js # Bootstrap usera (Parallel Fetch)
│   │   ├── get-user-preferences.js  # Pobieranie affinity score
│   │   ├── get-user-stats.js        # Pobieranie statystyk głównych
│   │   ├── get-recent-history.js    # Historia sesji
│   │   ├── get-history-by-month.js  # Historia kalendarzowa
│   │   ├── get-exercise-animation.js # Pobieranie SVG (Cacheable)
│   │   ├── get-exercise-mastery.js  # Statystyki objętości per ćwiczenie
│   │   ├── save-session.js          # Zapis treningu z uruchomieniem Inference Engine (uzupełnianie brakujących ocen) oraz obsługą natychmiastowej Dewolucji (wymuszanie łatwiejszych wariantów).
│   │   ├── save-settings.js         # Zapis ustawień i planów
│   │   ├── update-preference.js     # Pojedyncza aktualizacja oceny
│   │   ├── recalculate-stats.js     # Wymuszone przeliczenie tempa
│   │   ├── manage-blacklist.js      # Zarządzanie czarną listą
│   │   ├── delete-session.js        # Usuwanie sesji + korekta statystyk
│   │   ├── delete-user-data.js      # GDPR: Pełne usunięcie konta
│   │   ├── migrate-data.js          # Migracja z LocalStorage do DB
│   │   └── strava-*.js              # Endpointy integracji OAuth ze Strava
│   │
├── RECEIVER (APLIKACJA TV):
│   └── receiver/
│       ├── index.html          # Widok na telewizorze
│       ├── style.css           # Style TV
│       └── receiver.js         # Logika odbiornika (Anti-Idle v8, MediaSession)
│
└── KONFIGURACJA:
    ├── netlify.toml            # Config hostingu
    ├── package.json            # Zależności Node.js
    ├── manifest.json           # PWA Manifest
    ├── privacy.html            # RODO / Polityka prywatności
    ├── terms.html              # Regulamin
    └── service-worker.js       # Cache PWA
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
*   `equipment` (VARCHAR): Tablica znormalizowanych nazw (np. {mata, hantle})
*   `category_id` (VARCHAR): Kategoria biomechaniczna (np. `core_anti_extension`).
*   `difficulty_level` (INT): 1-5.
*   `pain_relief_zones` (TEXT[]): Tagi medyczne.
*   `animation_svg` (TEXT): Kod SVG animacji.
*   `default_tempo` (VARCHAR): Np. "2-0-2".
*   `tempo_control` (VARCHAR): Np. "2-0-2".
*   `tempo_mobility` (VARCHAR): Np. "2-0-2".
*   `tempo_capacity` (VARCHAR): Np. "2-0-2".
*   `tempo_strength` (VARCHAR): Np. "2-0-2".
*   `tempo_metabolic` (VARCHAR): Np. "2-0-2".
*   `tempo_rehab` (VARCHAR): Np. "2-0-2".
*   `is_unilateral` (BOOLEAN): Czy wykonywane jednostronnie i wymaga jawnej zmiany strony/ustawienia pomiędzy pracą na lewą i prawą stronę.
*   `max_recommended_reps` (INT).
*   `max_recommended_duration` (INT).
*   `primary_plane` (VARCHAR): Płaszczyzna ruchu (flexion/extension/rotation/lateral_flexion/multi).
*   `position` (VARCHAR): Pozycja wyjściowa (standing/sitting/kneeling/quadruped/supine/prone).
*   `is_foot_loading` (BOOLEAN): Czy ćwiczenie obciąża stopę (dla kontuzji)

### 3. `user_settings`
Przechowuje konfigurację oraz **wygenerowany plan dynamiczny**.
*   `user_id` (FK, VARCHAR).
*   Pole `settings` (JSONB) przechowuje teraz nowy format planu:
    **   `wizardData.schedule_pattern`: Tablica int `[1, 3, 5]` (dni treningowe).
    **  `dynamicPlanData`: Obiekt typu `RollingPlan`:
        ```json
        {
        "id": "rolling-1715000...",
        "days": [
            { "date": "2025-05-27", "type": "workout", "title": "Trening Wtorek", ... },
            { "date": "2025-05-28", "type": "rest", "title": "Regeneracja", ... }
        ]
        }
        ```
    ** `phase_manager`:
        ```json
            {
            "phase_manager": {
                "version": 1,
                "template_id": "strength",
                "current_phase_stats": {
                "phase_id": "capacity",
                "sessions_completed": 4,
                "target_sessions": 12
                },
                "override": {
                "mode": "deload",
                "reason": "high_fatigue"
                },
                "history": { ... }
            }
            }
        ```
*   `updated_at` (TIMESTAMP).

### 4. `training_sessions`
Historia wykonanych treningów.
*   `session_id` (PK, BIGINT).
*   `user_id` (FK, VARCHAR).
*   `plan_id` (VARCHAR).
*   `started_at` (TIMESTAMP).
*   `completed_at` (TIMESTAMP).
*   `session_data` (JSONB): Rozszerzona struktura logów zawierająca dane AMPS:
    ```json
    {
      "sessionLog": [
        {
          "exerciseId": "deadBug",
          "rating": "ok",       // Enum: good/ok/hard/skipped
          "rir": 2,             // Int: Rezerwa powtórzeń
          "tech": 8,            // Int: Ocena techniki (1-10)
          "inferred": true      // Bool: Czy system zgadł ocenę?
        }
      ]
    }
    ```

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

### 9. `user_exercise_preferences` (NOWOŚĆ)
Przechowuje relację emocjonalną i percepcyjną użytkownika z ćwiczeniem.
*   `user_id` (PK, FK): Kto ocenia.
*   `exercise_id` (PK, FK): Co ocenia.
*   `affinity_score` (INT): Punkty od -100 do +100. Wpływają na częstotliwość losowania.
*   `difficulty_rating` (INT): Flaga trudności (-1: Za łatwe, 0: OK, 1: Za trudne).
*   `updated_at` (TIMESTAMP).

### 10. `user_exercise_stats`
Analityka tempa:
*   `avg_seconds_per_rep`: Średni czas wykonania jednego powtórzenia przez użytkownika. Używane przez silnik estymacji czasu.
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
## 🚀 Logika Exercise Affinity Engine (Mixer v2.0)

Nowy algorytm doboru ćwiczeń (`workoutMixer.js`) łączy twarde dane kliniczne z miękkimi preferencjami użytkownika.

### Wzór Rankingu Kandydata
```javascript
FinalScore = (FreshnessScore * 1.0)
           + (AffinityScore * 1.5)
           + RandomFactor
           - DifficultyPenalty
```

1.  **Freshness (Świeżość):** Ćwiczenia nierobione dawno mają wyższy priorytet. Kara -100 pkt za ćwiczenia robione wczoraj/dziś.
2.  **Affinity (Preferencje):**
    *   **Like (👍):** +20 pkt (Boostuje szansę wylosowania).
    *   **Dislike (👎):** -20 pkt (Obniża szansę, ale nie blokuje całkowicie, jeśli brak alternatyw).
3.  **Difficulty Penalty (Bezpiecznik):**
    *   **Za trudne (🔥):** -50 pkt. Ćwiczenie spada na dno listy kandydatów. System dąży do jego wymiany (Dewolucji).
4.  **Priorytet Kliniczny:** Niezależnie od punktów, ćwiczenie musi najpierw przejść walidację Wizarda (np. zakaz rotacji przy przepuklinie).

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

## 🧠 Logika Bio-Protocol Generator

Nowy moduł `protocolGenerator.js` działa całkowicie po stronie klienta, zapewniając natychmiastową reakcję interfejsu.

### 1. Wejście (Input)
Generator przyjmuje obiekt konfiguracyjny:
*   `mode`: `'sos'` | `'booster'` | `'reset'`
*   `focusZone`: np. `'cervical'`, `'core'`, `'office'`
*   `durationMin`: Czas całkowity (np. 5 min)
*   `userContext`: Dostępny sprzęt, czarna lista.

### 2. Selekcja Kandydatów
*   Dla trybu **SOS**: Szuka ćwiczeń z tagiem `pain_relief_zones` zgodnym z `focusZone` oraz `difficulty_level <= 2`.
*   Dla trybu **Booster**: Szuka ćwiczeń z kategorii biomechanicznej (np. `core_anti_rotation`) i sortuje je według `Affinity Score` (ulubione ćwiczenia użytkownika mają priorytet).

### 3. Time-Boxing (Dopychanie Czasu)
Algorytm buduje linię czasu (Timeline):
1.  Pobiera kandydata z puli.
2.  Dodaje czas pracy (np. 60s dla SOS, 40s dla Booster) + czas przejścia (15s).
3.  Sprawdza, czy `aktualnyCzas + nowyBlok <= durationMin`.
4.  Powtarza proces aż do wypełnienia zadanego okna czasowego.

### 4. Wyjście (Output)
Zwraca obiekt sesji kompatybilny z `training.js`, ale ze spłaszczoną strukturą (`flatExercises` gotowe do odtworzenia), co pomija etap standardowej hydracji planu dziennego.