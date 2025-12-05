# Aplikacja Treningowa (Smart Rehab PWA) v10.0.0

Zaawansowana aplikacja PWA (Progressive Web App) łącząca trening siłowy z rehabilitacją kręgosłupa (metodyka McGill L5-S1). System wykorzystuje architekturę Serverless oraz autorski silnik **"Virtual Physio"**, który generuje spersonalizowane plany treningowe na podstawie szczegółowej ankiety medycznej i biomechanicznej.

---

## 🚀 Kluczowe Funkcjonalności

### 🧠 Virtual Physio (Dynamiczny Generator Planów)
*   **Inteligentny Wizard:** Rozbudowana ankieta zbierająca dane o lokalizacji bólu, historii medycznej, wzorcach ruchowych (triggers/reliefs) oraz stylu życia (praca, hobby).
*   **Generator AI (`generate-plan.js`):** Algorytm po stronie serwera tworzący spersonalizowane plany tygodniowe, uwzględniający przeciwwskazania i priorytety terapeutyczne.

### 🏆 Gamifikacja i Analityka (Nowość v10)
*   **Exercise Mastery (Karty Mistrzostwa):** System RPG dla ćwiczeń. Każde wykonane powtórzenie lub sekunda dodaje punkty XP do konkretnego ćwiczenia. Karty ewoluują wizualnie (Brąz → Srebro → Złoto → Neon) wraz z postępami.
*   **Resilience Shield ("Tarcza"):** Wskaźnik ciągłości treningów i odporności na nawroty bólu.
*   **Hero Dashboard:** Nowoczesny panel z kafelkami statystyk (Seria, Tarcza, Łączny Czas Treningów).
*   **Streak:** Licznik dni treningowych z rzędu.

### 📱 Nowoczesny Dashboard (UI & UX)
*   **Weekly Strip:** Interaktywny pasek kalendarza pokazujący kontekst tygodnia i historię wykonań ("Don't break the chain").
*   **Mission Card:** Karta "Twoja Misja na Dziś" z gradientowym nagłówkiem i statusem bólu.
*   **Upcoming Carousel:** Horyzontalna lista nadchodzących treningów (zamiast długiej listy wertykalnej).

### 🏋️ Tryby Treningowe
1.  **Tryb Dynamiczny:** Plan "szyty na miarę" przez generator AI.
2.  **Tryb Statyczny:** Klasyczne, sztywne plany treningowe (np. "Fundamenty L5-S1").
3.  **Focus Mode:** Ekran treningu z dużym zegarem, obsługą TTS (lektora) i animacjami SVG (karta z efektem flip).

### ⚙️ Mechanizmy Adaptacyjne
*   **Workout Mixer:** Rotuje ćwiczenia w ramach tej samej kategorii biomechanicznej, aby uniknąć monotonii.
*   **Assistant Engine:** Silnik regułowy modyfikujący objętość w czasie rzeczywistym (np. skrócenie treningu przy wysokim poziomie bólu).
*   **Smart Swap:** Możliwość ręcznej wymiany ćwiczenia na alternatywę z tej samej kategorii.
*   **Obsługa Czarnej Listy:** Blokowanie nielubianych ćwiczeń.

### 📺 Integracja z TV (Google Cast)
*   **Custom Receiver:** Dedykowana aplikacja na telewizor (Chromecast).
*   **Real-time Sync:** Synchronizacja timera i animacji między telefonem a TV.
*   **Anti-Idle System:** Zaawansowane mechanizmy (Audio Oscillator, Video Loop, GPU Activator) zapobiegające wygaszaniu ekranu TV.

---

## 📂 Pełna Struktura Plików

```text
/ExerciseApp
│
├── index.html                  # Główny kontener SPA
├── style.css                   # Globalne style (CSS Variables, Dark/Glass Mode)
├── app.js                      # Punkt wejścia, routing, init
├── auth.js                     # Obsługa logowania (Auth0 SDK + JWT)
├── state.js                    # Globalny stan aplikacji (Reactive Store)
├── dataStore.js                # Warstwa API (Fetch, Cache, Sync)
├── utils.js                    # Helpery (Daty, Parsowanie, Hydracja)
│
├── LOGIKA BIZNESOWA (FRONTEND):
│   ├── workoutMixer.js         # Logika rotacji ćwiczeń i Smart Swap
│   ├── assistantEngine.js      # Skalowanie objętości (Ból/Czas)
│   ├── training.js             # Kontroler przebiegu treningu
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
│   │   ├── modals.js           # Okna dialogowe (Swap, Evolution)
│   │   ├── wizard.js           # Kreator konfiguracji (Ankieta medyczna, SVG Body Map)
│   │   └── screens/            # Widoki poszczególnych ekranów:
│   │       ├── dashboard.js    # Ekran Główny (Hero Stats, Week Strip, Karuzela)
│   │       ├── training.js     # Ekran Treningu (Focus Mode)
│   │       ├── history.js      # Kalendarz i Historia
│   │       ├── library.js      # Baza Ćwiczeń i Filtry
│   │       ├── settings.js     # Ustawienia i Integracje
│   │       ├── summary.js      # Podsumowanie i Feedback
│   │       ├── help.js         # Ekran Pomocy
│   │       └── analytics.js    # [NOWOŚĆ] Ekran Kart Mistrzostwa (Mastery)
│
├── BACKEND (NETLIFY FUNCTIONS):
│   ├── netlify/functions/
│   │   ├── generate-plan.js        # Generator planów dynamicznych (AI Logic)
│   │   ├── get-app-content.js      # Pobieranie bazy wiedzy
│   │   ├── get-or-create-user.js   # Inicjalizacja usera
│   │   ├── save-session.js         # Zapis treningu + Ewolucja planu
│   │   ├── save-settings.js        # Zapis ustawień i planów
│   │   ├── get-user-stats.js       # Statystyki (Streak, Resilience, Time)
│   │   ├── get-exercise-mastery.js # [NOWOŚĆ] Agregacja statystyk XP dla ćwiczeń
│   │   ├── manage-blacklist.js     # Zarządzanie czarną listą
│   │   ├── strava-*.js             # Integracja OAuth ze Strava
│   │   ├── _auth-helper.js         # Weryfikacja JWT i połączenie DB
│   │   └── _stats-helper.js        # Logika statystyk (współdzielona)
│
├── RECEIVER (APLIKACJA TV):
│   └── receiver/
│       ├── index.html          # Widok na telewizorze
│       ├── style.css           # Style TV
│       └── receiver.js         # Logika odbiornika (Anti-Idle)
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

## Algorytm Wirtualnego Fizjoterapeuty (v3.2)

### 1. Dane Wejściowe (Input)
Funkcja `generate-plan.js` analizuje rozszerzony obiekt `userData` z 8-etapowej ankiety, w tym:
*   **Profil Medyczny:** Lokalizacje bólu, charakter bólu (np. ostry, tępy), diagnozy (np. dyskopatia).
*   **Styl Życia:** Tryb pracy (siedzący, fizyczny) i hobby (np. rower, bieganie).
*   **Biomechanika:** Ruchy nasilające ból (Triggers) i przynoszące ulgę (Reliefs).
*   **Preferencje:** Dostępny sprzęt, czas na trening, priorytety (siła vs mobilność).

### 2. Etap I: Analiza Stanu ("Mózg")
Algorytm oblicza parametry bezpieczeństwa:
*   **Wzorzec Tolerancji:** Określa, czy kręgosłup użytkownika nie toleruje zgięcia (*Flexion Intolerant*) czy wyprostu (*Extension Intolerant*).
*   **Severity Score (Wskaźnik Ciężkości):** Średnia z nasilenia bólu i wpływu na życie.
    *   **Modyfikator:** Jeśli ból jest *Ostry* lub *Promieniujący*, wynik jest mnożony przez **1.2**.
    *   **Próg Ostrożności:** Jeśli wynik **>= 6.5**, uruchamiany jest tryb *High Severity* (tylko bezpieczne pozycje).
*   **Difficulty Cap:** Maksymalny poziom trudności ćwiczeń (1-5). Jest redukowany do max 2, jeśli stan jest ostry.

### 3. Etap II: System Wagowy (Priorytetyzacja)
Każda kategoria ćwiczeń otrzymuje dynamiczną wagę (bazowo 1.0). Przykłady logiki:
*   **Rwa Kulszowa:** Kategoria *Nerve Flossing* otrzymuje priorytet absolutny (2.5).
*   **Praca Siedząca:** Podbija wagę *Hip Mobility* (+0.5) i *Glute Activation* (+0.4) w celu walki z "amnezją pośladkową".
*   **Hobby (Rower/Bieganie):** Zwiększa nacisk na otwieranie bioder i stabilizację miednicy.
*   **Skolioza:** Priorytet dla *Core Anti-Rotation* i asymetrycznej pracy.

### 4. Etap III: Lejek Bezpieczeństwa (Filtracja)
Algorytm odrzuca ćwiczenia, które nie spełniają kryteriów:
1.  **Czarna Lista:** Odrzuca ćwiczenia zablokowane ręcznie przez użytkownika.
2.  **Sprzęt:** Sprawdza dostępność (np. hantle, drążek).
3.  **Ograniczenia Fizyczne:** Np. "Nie mogę klęczeć" usuwa *Bird Dog*, "Ból przy skrętach" usuwa rotacje.
4.  **Mechanika Bólu:** Jeśli użytkownik ma nietolerancję zgięcia, usuwane są "brzuszki" i skłony (chyba że są oznaczone jako bezpieczne).
5.  **Tryb Ostry:** W stanie zapalnym dozwolone są tylko ćwiczenia z tagiem `pain_relief_zones` pasującym do lokalizacji bólu.

### 5. Etap IV: Konstrukcja Planu (Generator)
Budowa sesji treningowej (cykl tygodniowy):
*   **Rozgrzewka:** Oddech + Mobilność Kręgosłupa (dobrana pod tryb pracy).
*   **Main A (Priorytet):** Jeśli występuje rwa kulszowa -> Neuromobilizacja. W innym przypadku -> Stabilizacja Core (Anti-Extension/Flexion/Rotation) dobrana wg wag.
*   **Main B (Wsparcie):** Aktywacja pośladków lub siła (zależnie od celu).
*   **Schłodzenie:** Mobilność bioder + Oddech.

### 6. Etap V: Wolumetria i Optymalizacja
*   **Load Factor:** Mnożnik objętości (0.5 - 1.1) zależny od doświadczenia i poziomu bólu.
*   **Czas Trwania:** Algorytm estymuje czas sesji. Jeśli przekracza zadeklarowany limit (np. 30 min), inteligentnie ucina serie w ćwiczeniach jednostronnych lub zmniejsza liczbę powtórzeń, aby zmieścić się w oknie czasowym.

### 7. Etap VI: Lightweight Storage
Dla optymalizacji bazy danych, wygenerowany JSON zawiera tylko kluczowe parametry zmienne (`exerciseId`, `sets`, `reps`). Dane stałe (opisy, tempo, animacje SVG, flagi unilateral) są **hydrowane (uzupełniane)** na żywo w aplikacji klienta z głównej Biblioteki Ćwiczeń.