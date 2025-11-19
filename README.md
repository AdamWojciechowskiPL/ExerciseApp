# Aplikacja Treningowa (Full-Stack PWA)

W pełni funkcjonalna aplikacja PWA (Progressive Web App) do planowania i śledzenia treningów, zbudowana w architekturze full-stack. Umożliwia dynamiczne zarządzanie treścią, synchronizację danych w chmurze, bezpieczne uwierzytelnianie użytkowników oraz integrację z platformami zewnętrznymi, takimi jak Strava i Chromecast.

## Cel Projektu

Głównym celem aplikacji jest zapewnienie użytkownikom niezawodnego i spersonalizowanego narzędzia do realizacji planów treningowych. Dane każdego użytkownika, w tym historia i ustawienia, są bezpiecznie przechowywane w chmurze i powiązane z jego osobistym kontem, co gwarantuje prywatność i stały dostęp do postępów z dowolnego urządzenia.

## Kluczowe Funkcje

*   **Konta Użytkowników i Synchronizacja Danych:** Pełna integracja z **Auth0** dla bezpiecznej rejestracji i logowania. Wszystkie postępy i ustawienia są automatycznie zapisywane w centralnej bazie danych i dostępne na każdym urządzeniu.

*   **Pełnoprawna Aplikacja PWA (Progressive Web App):**
    *   **Instalowalność:** Możliwość instalacji na ekranie głównym smartfonów i komputerów, co zapewnia szybki dostęp i natywne odczucia (uruchamianie w trybie pełnoekranowym).
    *   **Działanie Offline:** Dostęp do kluczowych zasobów w trybie offline – użytkownik może przeglądać bibliotekę ćwiczeń i strukturę swojego planu treningowego nawet bez połączenia z internetem.
    *   **Wydajność:** Błyskawiczne ładowanie dzięki zaawansowanym strategiom buforowania (cache) zasobów.

*   **Dynamiczne Zarządzanie Treścią:** Definicje ćwiczeń i plany treningowe są ładowane dynamicznie z bazy danych, co pozwala na ich modyfikację i rozszerzanie bez potrzeby aktualizacji kodu aplikacji.

*   **Integracja z Chromecast (Wyświetlanie Jednokierunkowe):**
    *   **Wyświetlanie sesji na dużym ekranie:** Przesyłaj aktywną sesję treningową na urządzenie Chromecast, aby wygodnie śledzić kluczowe informacje (aktualny timer, nazwa ćwiczenia, postęp) na ekranie telewizora.
    *   **Rzutowanie wideo instruktażowych:** Odtwarzaj filmy instruktażowe z biblioteki ćwiczeń bezpośrednio na dużym ekranie.

*   **Integracja ze Strava:**
    *   Możliwość bezpiecznego połączenia konta Strava poprzez protokół OAuth 2.0.
    *   Automatyczne przesyłanie ukończonych treningów na Stravę jako nowa aktywność typu "Trening siłowy".

*   **Zautomatyzowany Tryb Treningu ("Focus Mode"):** Inteligentny asystent treningowy z przewodnikiem głosowym (TTS), timerem, stoperem oraz blokadą wygaszania ekranu (Wake Lock API), prowadzący użytkownika krok po kroku przez sesję.

*   **Historia i Zarządzanie Treningami:**
    *   Przejrzysty widok kalendarza z historią wykonanych treningów.
    *   Szczegółowy wgląd w każdą sesję, w tym czas rozpoczęcia, zakończenia, całkowity czas trwania i lista wykonanych ćwiczeń.
    *   Możliwość trwałego usunięcia wybranej sesji treningowej z historii.

*   **Personalizacja i Ustawienia:**
    *   Użytkownicy mogą dostosować datę startu cyklu, przerwy między ćwiczeniami oraz globalny współczynnik progresji.
    *   Zaimplementowano bezpieczny mechanizm trwałego usuwania konta i wszystkich powiązanych z nim danych.

*   **Bezpieczny Backend Serverless:** Logika po stronie serwera jest zaimplementowana przy użyciu **Funkcji Serverless Netlify (Node.js)**. Wszystkie operacje na danych użytkownika są chronione i wymagają poprawnego tokena JWT. Tokeny do integracji ze Strava są bezpiecznie szyfrowane w bazie danych.

## Architektura Systemu

*   **Frontend:** Czysty (Vanilla) JavaScript z modułami ES6, HTML5, CSS3. Aplikacja zaimplementowana jako PWA z wykorzystaniem Service Workera oraz integracją z Google Cast Sender SDK.
*   **Aplikacja Odbiorcy (Chromecast):** Dedykowana, lekka aplikacja webowa (HTML, CSS, JS) hostowana jako część głównego projektu, uruchamiana na urządzeniach Chromecast.
*   **Backend:** **Funkcje Serverless Netlify** (środowisko Node.js) z wykorzystaniem `axios` do komunikacji z zewnętrznymi API.
*   **Baza Danych:** **PostgreSQL** hostowana na platformie **Neon**.
*   **Uwierzytelnianie:** Platforma **Auth0** jako dostawca tożsamości.
*   **Bezpieczeństwo:** Weryfikacja tokenów JWT (`jsonwebtoken`, `jwks-rsa`), szyfrowanie tokenów integracji (`crypto`), ochrona przed CSRF w przepływie OAuth 2.0.

## Struktura Bazy Danych

Aplikacja opiera się na relacyjnym schemacie w bazie PostgreSQL, który zapewnia integralność danych. Kluczowe tabele:

```sql
-- Główna tabela użytkowników (z Auth0)
CREATE TABLE users ( id VARCHAR(255) PRIMARY KEY );

-- Ustawienia specyficzne dla użytkownika
CREATE TABLE user_settings ( /* ... */ );

-- Przechowuje dane integracji, np. zaszyfrowane tokeny Strava
CREATE TABLE user_integrations ( /* ... */ );

-- Historia wszystkich ukończonych sesji treningowych
CREATE TABLE training_sessions ( /* ... */ );

-- Tabele przechowujące dynamiczną treść aplikacji
CREATE TABLE exercises ( /* ... */ );
CREATE TABLE training_plans ( /* ... */ );
CREATE TABLE plan_days ( /* ... */ );
CREATE TABLE day_exercises ( /* ... */ );
```

## Struktura Projektu

```/aplikacja-treningowa
│
├── netlify/
│   └── functions/              # Logika backendu
│
├── receiver/
│   ├── index.html              # Aplikacja Odbiorcy Chromecast
│   ├── style.css
│   └── receiver.js
│
├── index.html
├── style.css
│
├── app.js                      # Główna logika i routing aplikacji
├── auth.js                     # Moduł obsługi uwierzytelniania (Auth0)
├── cast.js                     # Logika Nadawcy Chromecast
├── dataStore.js                # Warstwa dostępu do danych (komunikacja z API)
├── state.js                    # Centralny obiekt stanu aplikacji
├── ui.js                       # Funkcje renderujące interfejs
├── training.js                 # Logika sesji treningowej
├── ...                         # Pozostałe moduły JS
│
├── manifest.json               # Manifest aplikacji PWA
├── service-worker.js           # Logika offline i cache PWA
│
├── netlify.toml
└── package.json
```

## Uruchomienie Lokalne

1.  **Wymagania Wstępne:**
    *   Zainstalowany [Node.js](https://nodejs.org/).
    *   Zainstalowany [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npm install -g netlify-cli`.
    *   Skonfigurowane konta na **Auth0**, **Neon** (PostgreSQL), **Strava** oraz **Google Cast SDK** (dla deweloperów).

2.  **Instalacja:**
    ```bash
    git clone <adres-repozytorium>
    cd aplikacja-treningowa
    npm install
    ```

3.  **Konfiguracja Zmiennych Środowiskowych:**
    Stwórz plik `.env` i wypełnij go wymaganymi kluczami (baza danych, Auth0, Strava, klucz szyfrowania). Pamiętaj, aby te same zmienne skonfigurować w panelu Netlify.

4.  **Konfiguracja Frontendu:**
    *   W pliku `auth.js` wypełnij obiekt `AUTH_CONFIG` swoimi danymi z Auth0.
    *   W pliku `cast.js` wstaw swój `APPLICATION_ID` z konsoli Google Cast.

5.  **Uruchomienie Aplikacji:**
    ```bash
    netlify dev
    ```
    Aplikacja będzie dostępna pod adresem `http://localhost:8888`. Do testowania Chromecasta lokalnie zalecane jest użycie narzędzia `ngrok`.

## Deployment

1.  Wypchnij kod do repozytorium połączonego z Netlify.
2.  Upewnij się, że wszystkie zmienne środowowiskowe są skonfigurowane w panelu Netlify.
3.  Netlify automatycznie zbuduje i wdroży aplikację, funkcje serverless oraz pliki aplikacji Odbiorcy Chromecast.