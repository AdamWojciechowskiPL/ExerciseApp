# Aplikacja Treningowa L5-S1

Dedykowana, responsywna aplikacja webowa (Progressive Web App) wspierająca spersonalizowany, cykliczny plan treningowy dla osób z bólem w okolicy kręgosłupa lędźwiowo-krzyżowego (L5-S1). Aplikacja została zaprojektowana z myślą o maksymalnej prostocie, elastyczności w planowaniu, bezpieczeństwie i prywatności użytkownika.

## Cel Projektu

Głównym celem aplikacji jest bezpieczne i automatyczne prowadzenie użytkownika przez spersonalizowany plan treningowy, szczegółowe monitorowanie postępów w kalendarzu oraz umożliwienie dostosowania intensywności treningu. Aplikacja kładzie nacisk na edukację (opisy ćwiczeń, TTS) i działa w pełni offline po pierwszym załadowaniu.

## Kluczowe Funkcje

*   **Elastyczny Plan Treningowy:** Ekran główny prezentuje 7-dniowy cykl treningowy. Użytkownik może wybrać i wykonać **dowolny trening w dowolnym dniu**, a postęp zostanie zapisany pod **aktualną datą**.
*   **Historia i Kalendarz Treningów:**
    *   Dedykowana sekcja "Historia" z interaktywnym kalendarzem.
    *   Możliwość przeglądania poprzednich i przyszłych miesięcy.
    *   Wizualne oznaczenie dni, w które odbył się jakikolwiek trening.
*   **Szczegółowe Logowanie Sesji:**
    *   Możliwość wykonania i zapisania **wielu sesji treningowych tego samego dnia**.
    *   Po kliknięciu dnia w kalendarzu, aplikacja wyświetla szczegółowe podsumowanie każdej sesji, w tym:
        *   Nazwę wykonanego planu (np. "Dzień 3: ...").
        *   Godzinę ukończenia.
        *   Zapisaną ocenę bólu i notatki.
        *   **Pełny log wykonanych ćwiczeń**, z podziałem na serie, czasem wykonania i statusem (ukończone/pominięte).
*   **Moduł Ustawień:**
    *   **Personalizacja Przerw:** Użytkownik może globalnie ustawić długość przerwy między ćwiczeniami.
    *   **Współczynnik Progresji:** Intuicyjny suwak pozwala na skalowanie intensywności treningu (od 50% do 200%), co automatycznie przelicza czas trwania i liczbę powtórzeń.
*   **Backup i Przywracanie Danych:**
    *   Możliwość wyeksportowania wszystkich postępów i ustawień do jednego pliku `.json`.
    *   Funkcja przywracania danych z pliku, idealna do przenoszenia postępów między urządzeniami.
*   **Zautomatyzowany Tryb Treningu ("Focus Mode"):**
    *   Pełnoekranowy interfejs, który automatycznie prowadzi użytkownika przez każdą serię i przerwę.
    *   Inteligentny timer, który rozpoznaje ćwiczenia na czas i na powtórzenia.
*   **Asystent Głosowy (TTS):**
    *   **Automatyczne zapowiedzi:** Aplikacja głosem zapowiada nazwę, serię, liczbę powtórzeń i tempo każdego ćwiczenia.
    *   **Automatyczne odczytywanie opisów:** Po zapowiedzi, asystent głosowy odczytuje szczegółowy opis wykonania ćwiczenia.
    *   **Globalny przełącznik:** Możliwość włączenia/wyłączenia wszystkich komunikatów głosowych jednym przyciskiem.
*   **Ekran Podglądu i Modyfikacji:** Przed sesją użytkownik może przejrzeć plan dnia, przeczytać opisy i jednorazowo zmodyfikować liczbę serii lub powtórzeń.
*   **Lokalny Zapis i Prywatność:** Wszystkie dane są automatycznie zapisywane w `localStorage` przeglądarki. Aplikacja nie wysyła żadnych danych na zewnętrzne serwery, gwarantując 100% prywatności.

## Specyfikacja Techniczna

*   **Frontend:** Czysty (Vanilla) JavaScript z wykorzystaniem modułów ES6, HTML5, CSS3.
*   **Architektura:** Aplikacja jednostronicowa (SPA) bez użycia frameworków.
*   **Środowisko deweloperskie:** Wymaga lokalnego serwera deweloperskiego (np. **Live Server** w VS Code) ze względu na użycie modułów JS.
*   **Źródło Danych:** Plan treningowy jest przechowywany w obiekcie JavaScript w osobnym pliku (`training-plan.js`).
*   **Przechowywanie Danych Użytkownika:** `localStorage` przeglądarki internetowej.
*   **Zależności:** Brak zewnętrznych bibliotek i zależności.

## Struktura Projektu

Projekt został podzielony na logiczne moduły, aby ułatwić jego utrzymanie i rozwój:
```
/aplikacja-treningowa
│
├── index.html         # Główny plik HTML, struktura aplikacji
├── style.css          # Plik CSS, definicje stylów
│
├── app.js             # Główny plik, inicjalizacja i obsługa zdarzeń
├── training-plan.js   # Dane z planem treningowym
├── dataStore.js   # Obsługa localStorage
├── dom.js         # Selektory elementów DOM
├── state.js       # Centralny obiekt stanu aplikacji
├── timer.js       # Logika timera
├── training.js    # Logika przebiegu sesji treningowej
├── tts.js         # Logika syntezatora mowy (Text-to-Speech)
├── ui.js          # Funkcje renderujące interfejs
└── utils.js       # Funkcje pomocnicze (daty, obliczenia)
```