# Aplikacja Treningowa

Pełnoprawna aplikacja full-stack PWA (Progressive Web App) wspierająca spersonalizowane plany treningowe, z kontami użytkowników, synchronizacją danych w chmurze oraz bezpiecznym backendem opartym na architekturze serverless.

## Cel Projektu

Głównym celem aplikacji jest bezpieczne i automatyczne prowadzenie użytkownika przez wybrany plan treningowy, z możliwością **synchronizacji postępów i ustawień między urządzeniami**. Dane każdego użytkownika są bezpiecznie przechowywane w chmurze i powiązane z jego osobistym kontem, co gwarantuje prywatność i stały dostęp do historii treningów.

## Kluczowe Funkcje

*   **Konta Użytkowników i Synchronizacja Danych w Chmurze:** Pełna integracja z **Auth0** umożliwia bezpieczną rejestrację i logowanie. Wszystkie postępy i ustawienia są automatycznie zapisywane w centralnej bazie danych i dostępne na każdym urządzeniu.
*   **Bezpieczny Backend Serverless:** Logika po stronie serwera jest zaimplementowana przy użyciu **Funkcji Serverless Netlify (Node.js)**. Każdy endpoint API jest zabezpieczony i wymaga poprawnego tokena JWT od zalogowanego użytkownika.
*   **Niezawodne Przechowywanie Danych:** Dane użytkowników, historia treningów i ustawienia są przechowywane w relacyjnej bazie danych **PostgreSQL** (hostowanej na Neon), co zapewnia integralność i skalowalność.
*   **Jednorazowa Migracja Danych:** Aplikacja posiada mechanizm, który po pierwszym zalogowaniu proponuje użytkownikowi przeniesienie jego dotychczasowych postępów z `localStorage` na jego nowe konto w chmurze.
*   **Zarządzanie Planami Treningowymi:** Możliwość wyboru aktywnego planu z dostępnej listy w ustawieniach.
*   **Dedykowana Baza Ćwiczeń:** Osobna zakładka z wyszukiwarką, pozwalająca na przeglądanie wszystkich dostępnych ćwiczeń wraz z opisami i linkami do wideo.
*   **Zautomatyzowany Tryb Treningu ("Focus Mode"):** Inteligentny asystent głosowy (TTS), zróżnicowany przepływ sesji dla ćwiczeń na czas i na powtórzenia oraz blokada wygaszania ekranu (Wake Lock API).
*   **Personalizacja:** Możliwość dostosowania daty startu cyklu, przerw między ćwiczeniami oraz współczynnika progresji.

## Architektura Systemu

*   **Frontend:** Czysty (Vanilla) JavaScript z modułami ES6, HTML5, CSS3.
    *   **Uwierzytelnianie:** Biblioteka **Auth0 SPA SDK**. Obsługa logowania odbywa się poprzez przepływ **Authorization Code Flow with PKCE (`loginWithRedirect`)**, co zapewnia bezpieczne otrzymywanie Refresh Tokenów i niezawodne utrzymanie sesji. Dane sesji są buforowane w `localStorage`.
*   **Backend:** **Funkcje Serverless Netlify** (środowisko Node.js).
    *   **Bezpieczeństwo:** Weryfikacja tokenów JWT przy użyciu bibliotek `jsonwebtoken` i `jwks-rsa` na każdym chronionym endpoincie.
*   **Baza Danych:** **PostgreSQL** hostowana na platformie **Neon**.
*   **Uwierzytelnianie:** Platforma **Auth0** jako dostawca tożsamości (Identity Provider).
*   **Synchronizacja Danych Użytkownika:** Aplikacja implementuje solidny wzorzec **"Get or Create"**. Po pomyślnym zalogowaniu, frontend wykonuje jedno zapytanie do dedykowanego endpointu (`get-or-create-user-data`). Funkcja ta w ramach jednej, atomowej transakcji sprawdza, czy użytkownik istnieje w bazie. Jeśli nie, tworzy dla niego rekord oraz domyślne ustawienia, a następnie zwraca pełny pakiet danych. Ten model eliminuje problemy z asynchronicznością (race conditions) i daje aplikacji pełną kontrolę nad spójnością danych.

## Struktura Projektu

```
/aplikacja-treningowa
│
├── netlify/
│   └── functions/
│       ├── _auth-helper.js                 # Pomocnik do weryfikacji JWT i połączenia z bazą
│       ├── get-or-create-user-data.js      # Endpoint "Get or Create" dla danych użytkownika
│       ├── migrate-data.js                 # Endpoint do migracji danych z localStorage
│       ├── save-session.js                 # Endpoint do zapisu sesji treningowej
│       └── save-settings.js                # Endpoint do zapisu ustawień
│
├── index.html                              # Główny plik HTML
├── style.css                               # Arkusz stylów
│
├── app.js                                  # Główna logika aplikacji klienckiej
├── auth.js                                 # Moduł obsługi uwierzytelniania (Auth0)
├── dataStore.js                            # Moduł komunikacji z API backendu
│
├── exercise-library.js                     # Baza danych ćwiczeń
├── training-plans.js                       # Definicje planów treningowych
│
├── state.js                                # Centralny obiekt stanu aplikacji
├── ui.js                                   # Funkcje renderujące interfejs
├── utils.js                                # Funkcje pomocnicze
├── timer.js                                # Logika timera i stopera
├── training.js                             # Logika sesji treningowej
├── tts.js                                  # Logika syntezatora mowy
│
├── netlify.toml                            # Plik konfiguracyjny Netlify
└── package.json                            # Definicje projektu i zależności Node.js
```

## Instalacja i Uruchomienie Lokalne

1.  **Wymagania Wstępne:**
    *   Zainstalowany [Node.js](https://nodejs.org/) (wersja 18 lub nowsza).
    *   Zainstalowany [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npm install -g netlify-cli`.
    *   Skonfigurowane konta na **Auth0**, **Neon** i **Netlify**.

2.  **Klonowanie Repozytorium:**
    ```bash
    git clone <adres-repozytorium>
    cd aplikacja-treningowa
    ```

3.  **Instalacja Zależności:**
    Zainstaluj pakiety Node.js wymagane przez funkcje serverless:
    ```bash
    npm install
    ```

4.  **Konfiguracja:**
    *   **Połącz projekt z Netlify:** Uruchom `netlify link`, aby połączyć lokalne repozytorium z Twoją stroną na Netlify. To automatycznie udostępni zmienną `NETLIFY_DATABASE_URL`.
    *   **Skonfiguruj zmienne środowiskowe:** W panelu Netlify lub w pliku `.env` dla lokalnego dewelopmentu, skonfiguruj zmienne dla funkcji backendowych:
        *   `AUTH0_AUDIENCE`: Identifier Twojego API w Auth0.
        *   `AUTH0_ISSUER_BASE_URL`: Twoja domena Auth0 (z `https://` na początku i `/` na końcu).
    *   **Skonfiguruj frontend:** W pliku `auth.js` wypełnij obiekt `AUTH_CONFIG` swoimi danymi: `domain`, `clientId` i `audience`.
    *   **Skonfiguruj Auth0:** Upewnij się, że w ustawieniach Twojej aplikacji w Auth0, w polu **Allowed Callback URLs** znajduje się adres `http://localhost:8888`.

5.  **Uruchomienie Aplikacji:**
    ```bash
    netlify dev
    ```
    Aplikacja będzie dostępna pod adresem `http://localhost:8888`.

## Deployment

1.  Wypchnij kod do repozytorium połączonego z Netlify.
2.  W panelu Netlify (w `Site settings` -> `Build & deploy` -> `Environment`) upewnij się, że wszystkie zmienne środowiskowe (`AUTH0_AUDIENCE`, `AUTH0_ISSUER_BASE_URL`) są poprawnie skonfigurowane. Zmienna `NETLIFY_DATABASE_URL` zostanie dodana automatycznie przez integrację z Neon.
3.  Netlify automatycznie zbuduje i wdroży aplikację oraz funkcje serverless.