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

### 1. Specyfikacja Tabeli: `exercises`

Tabela `exercises` stanowi centralny katalog (Bazę Wiedzy) aplikacji. Przechowuje definicje wszystkich dostępnych ćwiczeń, ich parametry, media instruktażowe oraz relacje logiczne (progresje, strefy bólu).

#### Lista Kolumn

##### 1. `id`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `PRIMARY KEY`, `NOT NULL`, `UNIQUE`
*   **Opis techniczny:** Klucz główny tabeli. Jest to ciąg znaków, nie liczba (np. auto-increment). Zalecana konwencja to *camelCase* (np. `birdDog`, `boxSquatNeutralSpine`).
*   **Opis biznesowy:** Unikalny identyfikator ćwiczenia używany przez system w kodzie. Służy do wiązania ćwiczeń w plany treningowe, logowania historii oraz definiowania progresji. Nie powinien być zmieniany po utworzeniu.

##### 2. `name`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NOT NULL`
*   **Opis techniczny:** Standardowy ciąg tekstowy o ograniczonej długości.
*   **Opis biznesowy:** Wyświetlana nazwa ćwiczenia widoczna dla użytkownika (np. "Deska na przedramionach"). Powinna być zrozumiała i jednoznaczna.

##### 3. `description`
*   **Typ danych:** `TEXT`
*   **Ograniczenia:** Brak limitu znaków (w praktyce limit silnika DB).
*   **Opis techniczny:** Pole tekstowe o dużej pojemności.
*   **Opis biznesowy:** Pełna instrukcja wykonania ćwiczenia. Zawiera opis pozycji wyjściowej, ruchu, kluczowych punktów technicznych ("Cueing") oraz błędów, których należy unikać. Używana w widoku szczegółów ćwiczenia oraz na odwrocie "Karty Wizualnej".

##### 4. `equipment`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NULL` (dopuszczalne, choć rzadkie).
*   **Opis techniczny:** Ciąg tekstowy. Może zawierać pojedyncze słowo lub listę oddzieloną przecinkami.
*   **Opis biznesowy:** Lista sprzętu wymaganego do wykonania ćwiczenia (np. "Mata", "Taśma", "Stopień/Schodek"). Informacja ta pozwala użytkownikowi przygotować się do sesji lub filtrować ćwiczenia, jeśli nie posiada danego sprzętu.

##### 5. `youtube_url`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NULL` (opcjonalne).
*   **Opis techniczny:** Przechowuje pełny adres URL (np. `https://www.youtube.com/shorts/...`).
*   **Opis biznesowy:** Link do zewnętrznego materiału wideo prezentującego poprawne wykonanie ćwiczenia. System wykorzystuje to pole do osadzania wideo (embed) lub otwierania linku w nowym oknie.

##### 6. `created_at`
*   **Typ danych:** `TIMESTAMP WITH TIME ZONE`
*   **Ograniczenia:** `DEFAULT CURRENT_TIMESTAMP`, `NOT NULL`.
*   **Opis techniczny:** Znacznik czasu utworzenia rekordu, automatycznie ustawiany przez bazę danych w momencie INSERT.
*   **Opis biznesowy:** Informacja audytowa – kiedy ćwiczenie zostało dodane do systemu. Przydatne przy sortowaniu nowości lub synchronizacji danych.

##### 7. `category_id`
*   **Typ danych:** `VARCHAR(50)`
*   **Ograniczenia:** Zalecana spójność z systemem kategorii (np. `core_anti_extension`, `hip_mobility`).
*   **Opis techniczny:** Krótki identyfikator tekstowy (tzw. slug). Może pełnić rolę klucza obcego (Foreign Key) do tabeli kategorii, jeśli taka istnieje.
*   **Opis biznesowy:** Kategoria biomechaniczna ćwiczenia. Jest kluczowa dla algorytmu **Smart Swap** – system pozwala wymieniać ćwiczenia tylko w obrębie tej samej kategorii (np. zamiana jednego ćwiczenia na anty-rotację na inne z tej samej grupy).

##### 8. `difficulty_level`
*   **Typ danych:** `INTEGER`
*   **Ograniczenia:** `CHECK (difficulty_level >= 1 AND difficulty_level <= 5)`
*   **Opis techniczny:** Liczba całkowita. Ograniczenie (`CONSTRAINT`) na poziomie bazy danych wymusza zakres od 1 do 5.
*   **Opis biznesowy:** Poziom trudności ćwiczenia.
    *   1: Rehabilitacja / Bardzo łatwe.
    *   3: Średniozaawansowane.
    *   5: Elita / Bardzo trudne.
    Używane do filtrowania i sugerowania progresji.

##### 9. `max_recommended_duration`
*   **Typ danych:** `INTEGER`
*   **Ograniczenia:** `NULL` (opcjonalne).
*   **Opis techniczny:** Wartość w sekundach.
*   **Opis biznesowy:** Domyślny czas trwania jednej serii dla ćwiczeń izometrycznych (na czas) lub rozciągających (np. 10s dla Bird-dog, 300s dla oddychania). Jeśli pole jest wypełnione, ćwiczenie jest traktowane jako "Time-based".

##### 10. `max_recommended_reps`
*   **Typ danych:** `INTEGER`
*   **Ograniczenia:** `NULL` (opcjonalne).
*   **Opis techniczny:** Liczba powtórzeń.
*   **Opis biznesowy:** Domyślna liczba powtórzeń dla ćwiczeń dynamicznych (np. 12 przysiadów). Jeśli pole jest wypełnione, a `duration` puste, ćwiczenie jest traktowane jako "Rep-based".

##### 11. `next_progression_id`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NULL` (opcjonalne). Powinno wskazywać na istniejące `id` w tej samej tabeli (Self-Referencing Foreign Key).
*   **Opis techniczny:** Klucz obcy wskazujący na inne ćwiczenie w tabeli.
*   **Opis biznesowy:** Wskaźnik do logicznej "Ewolucji" ćwiczenia. Jeśli użytkownik zgłosi "nudę/zbyt łatwo" przy obecnym ćwiczeniu, system automatycznie podmieni je na to wskazane w tym polu (np. `deadBugBasic` -> `birdDog`). Jeśli `NULL`, ćwiczenie jest na szczycie drabiny progresji.

##### 12. `pain_relief_zones`
*   **Typ danych:** `TEXT[]` (Tablica tekstowa w PostgreSQL)
*   **Ograniczenia:** `NULL` (opcjonalne).
*   **Opis techniczny:** Tablica stringów, np. `["lumbar_general", "si_joint"]`.
*   **Opis biznesowy:** Tagi medyczne/rehabilitacyjne. Określają, przy jakich dolegliwościach dane ćwiczenie jest zalecane lub bezpieczne. System używa tego do personalizacji planu pod kątem zgłoszonych dolegliwości użytkownika (np. "Jeśli boli odcinek lędźwiowy, priorytetyzuj ćwiczenia z tagiem `lumbar_general`").

##### 13. `animation_svg`
*   **Typ danych:** `TEXT`
*   **Ograniczenia:** `NULL` (opcjonalne).
*   **Opis techniczny:** Pole przechowujące surowy kod XML/SVG. Może być bardzo długi (kilka-kilkanaście KB tekstu).
*   **Opis biznesowy:** Wektorowa animacja instruktażowa. Jest renderowana bezpośrednio w kodzie strony (inline SVG) oraz wysyłana do urządzenia Chromecast. Pozwala na animowanie elementów (np. ruch ręki, zmiana koloru przy wdechu) bez konieczności ładowania zewnętrznych plików wideo.

### 2. Specyfikacja Tabeli: `training_plans`

Tabela nadrzędna (korzeń hierarchii). Definiuje dostępne w aplikacji plany treningowe jako całość (np. "Plan Podstawowy", "Joga przeciwbólowa").

#### Lista Kolumn

##### 1. `id`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `PRIMARY KEY`, `NOT NULL`, `UNIQUE`
*   **Opis techniczny:** Unikalny identyfikator tekstowy (tzw. slug). Zalecany format *kebab-case* (np. `l5s1-foundation`, `yoga-l5s1-pain-relief`).
*   **Opis biznesowy:** Identyfikator używany w kodzie aplikacji i URL-ach do wyboru aktywnego planu. Musi być stały, ponieważ użytkownicy zapisują swoje postępy w powiązaniu z tym ID.

##### 2. `name`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NOT NULL`
*   **Opis techniczny:** Nazwa wyświetlana.
*   **Opis biznesowy:** Pełna, marketingowa nazwa planu widoczna dla użytkownika w interfejsie wyboru planu oraz w nagłówku aplikacji (np. "Plan Podstawowy L5-S1 (McGill)").

##### 3. `description`
*   **Typ danych:** `TEXT`
*   **Ograniczenia:** Brak.
*   **Opis techniczny:** Pole tekstowe o dużej pojemności.
*   **Opis biznesowy:** Szczegółowy opis celu planu, grupy docelowej oraz przeciwwskazań. Informuje użytkownika, dla kogo przeznaczony jest dany cykl (np. "7-dniowy cykl stabilizacyjny", "uwzględnia haluks").

##### 4. `global_rules`
*   **Typ danych:** `JSONB`
*   **Ograniczenia:** Poprawny format JSON.
*   **Opis techniczny:** Binarny format JSON pozwalający na przechowywanie elastycznej konfiguracji.
*   **Opis biznesowy:** Zbiór globalnych zasad i ustawień dla całego planu. Przechowuje parametry takie jak:
    *   `defaultRestSecondsBetweenSets`: Domyślny czas przerwy między seriami.
    *   `defaultRestSecondsBetweenExercises`: Domyślny czas przerwy przy zmianie ćwiczenia.
    *   `lumbarRange`: Wytyczne bezpieczeństwa dla kręgosłupa (np. "Zakres środkowy").
    *   `tempoGuideline`: Ogólna instrukcja tempa (np. "Powoli 2–3 s").
    Dzięki temu aplikacja (Timer, Asystent) wie, jak sterować przebiegiem treningu.

##### 5. `created_at`
*   **Typ danych:** `TIMESTAMP WITH TIME ZONE`
*   **Ograniczenia:** `DEFAULT CURRENT_TIMESTAMP`.
*   **Opis techniczny:** Data utworzenia rekordu.
*   **Opis biznesowy:** Informacja audytowa.

### 3. Specyfikacja Tabeli: `plan_days`

Tabela pośrednia. Definiuje strukturę czasową planu (kolejne dni treningowe). Łączy plan (`training_plans`) z konkretnymi zestawami ćwiczeń (`day_exercises`).

#### Lista Kolumn

##### 1. `id`
*   **Typ danych:** `SERIAL` (Auto-increment Integer)
*   **Ograniczenia:** `PRIMARY KEY`.
*   **Opis techniczny:** Unikalny numer identyfikacyjny wiersza (sztuczny klucz).
*   **Opis biznesowy:** Wewnętrzny identyfikator dnia. Służy do łączenia ćwiczeń z konkretnym dniem.

##### 2. `plan_id`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NOT NULL`, `FOREIGN KEY` do `training_plans(id)`.
*   **Opis techniczny:** Klucz obcy wskazujący, do którego planu należy ten dzień.
*   **Opis biznesowy:** Grupuje dni w ramach jednego planu treningowego.

##### 3. `day_number`
*   **Typ danych:** `INTEGER`
*   **Ograniczenia:** `NOT NULL`.
*   **Opis techniczny:** Liczba całkowita.
*   **Opis biznesowy:** Logiczny numer dnia w cyklu (np. Dzień 1, Dzień 2). Aplikacja używa tego pola do sortowania dni oraz do określania, jaki trening przypada na "dzisiaj" na podstawie daty rozpoczęcia planu przez użytkownika.

##### 4. `title`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NOT NULL`.
*   **Opis techniczny:** Krótki opis tekstowy.
*   **Opis biznesowy:** Temat przewodni danego dnia (np. "Stabilizacja bazowa", "Anty-rotacja"). Wyświetlany na karcie dnia ("Day Card") oraz w nagłówku podczas treningu ("Mission Title").

#### Unikalność (Unique Constraint)
*   `UNIQUE(plan_id, day_number)`: Zapewnia, że w ramach jednego planu nie mogą istnieć dwa dni o tym samym numerze (np. nie może być dwóch "Dni 1" w planie "l5s1-foundation").

### 4. Specyfikacja Tabeli: `day_exercises`

Tabela najniższego poziomu. To "przepis" na trening. Określa, jakie ćwiczenie, w jakiej ilości i w jaki sposób ma zostać wykonane w konkretnym dniu.

#### Lista Kolumn

##### 1. `id`
*   **Typ danych:** `SERIAL`
*   **Ograniczenia:** `PRIMARY KEY`.
*   **Opis techniczny:** Unikalny identyfikator wiersza.
*   **Opis biznesowy:** Identyfikator konkretnego wystąpienia ćwiczenia w planie.

##### 2. `day_id`
*   **Typ danych:** `INTEGER`
*   **Ograniczenia:** `NOT NULL`, `FOREIGN KEY` do `plan_days(id)`.
*   **Opis techniczny:** Klucz obcy wiążący ćwiczenie z konkretnym dniem planu.
*   **Opis biznesowy:** Określa, w którym dniu użytkownik ma wykonać to ćwiczenie.

##### 3. `exercise_id`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NOT NULL`, `FOREIGN KEY` do `exercises(id)`.
*   **Opis techniczny:** Klucz obcy wskazujący na definicję ćwiczenia w Bazie Wiedzy.
*   **Opis biznesowy:** Wskazuje, *co* użytkownik ma robić (np. "birdDog"). System pobiera stąd nazwę, wideo i opis techniczny.

##### 4. `section`
*   **Typ danych:** `VARCHAR(50)`
*   **Ograniczenia:** `NOT NULL`. Wartości biznesowe: `warmup`, `main`, `cooldown`.
*   **Opis techniczny:** Kategoria logiczna wewnątrz dnia.
*   **Opis biznesowy:** Dzieli trening na fazy:
    *   `warmup`: Rozgrzewka/Mobilizacja.
    *   `main`: Część główna (siła/stabilizacja).
    *   `cooldown`: Wyciszenie/Rozciąganie.
    Aplikacja używa tego do grupowania kart na ekranie podglądu.

##### 5. `order_in_section`
*   **Typ danych:** `INTEGER`
*   **Ograniczenia:** `NOT NULL`.
*   **Opis techniczny:** Liczba porządkowa.
*   **Opis biznesowy:** Kolejność wykonywania ćwiczeń w ramach jednej sekcji. Decyduje o tym, co wyświetli się jako pierwsze, drugie itd.

##### 6. `sets`
*   **Typ danych:** `VARCHAR(50)`
*   **Ograniczenia:** Brak (ciąg znaków).
*   **Opis techniczny:** Przechowuje liczbę serii jako tekst (np. "3", "2-3").
*   **Opis biznesowy:** Ilość serii do wykonania. Jest to string, aby umożliwić zapisy zakresów ("2-3") dla bardziej zaawansowanych użytkowników, choć zazwyczaj jest to pojedyncza cyfra. System parsuje to pole, aby wygenerować odpowiednią liczbę "okienek" w pętli treningowej.

##### 7. `reps_or_time`
*   **Typ danych:** `VARCHAR(100)`
*   **Ograniczenia:** Brak.
*   **Opis techniczny:** Ciąg znaków (np. "10", "30 s", "5 breaths", "10/str.").
*   **Opis biznesowy:** "Dawkowanie" ćwiczenia w pojedynczej serii.
    *   Jeśli zawiera "s" lub "min" -> Timer (czas).
    *   Jeśli sama liczba -> Licznik powtórzeń.
    *   Może zawierać modyfikatory jak "/str." (na stronę).
    System TTS czyta to pole użytkownikowi.

##### 8. `tempo_or_iso`
*   **Typ danych:** `VARCHAR(255)`
*   **Ograniczenia:** `NULL` (opcjonalne).
*   **Opis techniczny:** Tekst instruktażowy.
*   **Opis biznesowy:** Szczegółowe instrukcje dotyczące tempa ruchu lub czasu utrzymania napięcia (izometrii) dla *tego konkretnego dnia*. Nadpisuje lub uzupełnia ogólny opis ćwiczenia (np. "pauza 2s na wydechu", "izometria 10s"). Kluczowe dla jakości wykonania ("Quality over Quantity").

---

### Inne Tabele (Skrót)

*   `user_plan_overrides`: Przechowuje indywidualne zmiany planu (ewolucje).
*   `training_sessions`: Historia wykonanych treningów z pełnym logiem JSONB.
*   `user_exercise_blacklist`: Lista ćwiczeń blokowanych przez użytkownika.
*   `user_settings`: Ustawienia globalne (data startu, mnożnik progresji).
*   `user_integrations`: Tokeny OAuth dla usług zewnętrznych (Strava).

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