# Aplikacja Treningowa L5-S1

Dedykowana, responsywna aplikacja webowa (Progressive Web App) wspierająca spersonalizowany, cykliczny plan treningowy dla osób z bólem w okolicy kręgosłupa lędźwiowo-krzyżowego (L5-S1). Aplikacja została zaprojektowana z myślą o maksymalnej prostocie, elastyczności w planowaniu, bezpieczeństwie i prywatności użytkownika.

## Cel Projektu

Głównym celem aplikacji jest bezpieczne i automatyczne prowadzenie użytkownika przez spersonalizowany plan treningowy, szczegółowe monitorowanie postępów w kalendarzu oraz umożliwienie dostosowania intensywności treningu. Aplikacja kładzie nacisk na edukację (opisy ćwiczeń, TTS) i działa w pełni offline po pierwszym załadowaniu.

## Kluczowe Funkcje

### Najważniejsze Aktualizacje
*   **Inteligentne, dynamiczne przerwy** dostosowujące się do czasu trwania zapowiedzi głosowej.
*   **Pełna personalizacja cyklu treningowego** dzięki możliwości zmiany daty startowej.
*   **Blokada wygaszania ekranu** w trybie treningu, zapewniająca nieprzerwaną sesję.
*   **Dynamiczna lista wymaganego sprzętu** widoczna na ekranie głównym.

### Pełna Lista Funkcji

*   **Elastyczny Plan Treningowy:**
    *   Ekran główny prezentuje 7-dniowy cykl treningowy z dynamicznie generowaną **listą wymaganego sprzętu** dla każdego dnia.
    *   Użytkownik może wybrać i wykonać **dowolny trening w dowolnym dniu**, a postęp zostanie zapisany pod **aktualną datą**.
*   **Historia i Kalendarz Treningów:**
    *   Dedykowana sekcja "Historia" z interaktywnym kalendarzem.
    *   Wizualne oznaczenie dni z wykonanym treningiem.
    *   **Dynamiczny widok planu:** Przypisany dzień treningowy jest wyświetlany tylko dla dnia dzisiejszego i dat przyszłych, co nadaje aplikacji "żywy" charakter.
*   **Szczegółowe Logowanie Sesji:**
    *   Możliwość wykonania i zapisania **wielu sesji treningowych tego samego dnia**.
    *   Szczegółowe podsumowanie każdej sesji, w tym: nazwa planu, godzina ukończenia, ocena bólu, notatki oraz **pełny log wykonanych ćwiczeń**.
*   **Zaawansowany Moduł Ustawień:**
    *   **Personalizacja Cyklu Treningowego:** Użytkownik może w dowolnym momencie **zmienić datę rozpoczęcia cyklu** za pomocą wbudowanego kalendarza, co natychmiast przelicza cały plan.
    *   **Personalizacja Długości Przerw (w trybie cichym):** Użytkownik może ustawić długość przerwy, która będzie używana jako timer w przypadku, gdy asystent głosowy jest wyłączony.
    *   **Współczynnik Progresji:** Intuicyjny suwak pozwala na skalowanie intensywności treningu (od 50% do 200%).
*   **Zautomatyzowany Tryb Treningu ("Focus Mode"):**
    *   **Inteligentne, dynamiczne przerwy:** Czas trwania przerwy jest **automatycznie dostosowywany do długości zapowiedzi głosowej**. Aplikacja przechodzi do kolejnego ćwiczenia dokładnie w momencie, gdy asystent kończy czytać opis.
    *   **Brak wygaszania ekranu:** Aplikacja aktywnie blokuje automatyczne wygaszanie ekranu telefonu podczas trwania całej sesji treningowej (Wake Lock API).
    *   Pełnoekranowy interfejs, który prowadzi użytkownika przez każdą serię i przerwę.
    *   Precyzyjny mechanizm rozróżniający ćwiczenia na czas (automatyczny timer) od tych na powtórzenia (ręczne potwierdzenie).
*   **Inteligentny Asystent Głosowy (TTS):**
    *   **Naturalne zapowiedzi:** Asystent głosowy inteligentnie formatuje tekst z planu, poprawnie odmieniając jednostki ("2 sekundy", "5 powtórzeń") i tłumacząc skróty, co zapewnia naturalne i zrozumiałe komunikaty.
    *   **Zapowiedzi wyłącznie podczas przerw:** Aby zapewnić maksymalne skupienie, wszystkie komunikaty głosowe (nazwa ćwiczenia, opis) odtwarzane są **tylko w fazie przygotowania**. Faza wykonywania ćwiczenia jest całkowicie cicha.
*   **Backup i Przywracanie Danych:** Możliwość eksportu i importu wszystkich postępów i ustawień do pliku `.json`.
*   **Ekran Podglądu i Modyfikacji:** Przed sesją użytkownik może przejrzeć plan dnia, przeczytać opisy i jednorazowo zmodyfikować liczbę serii lub powtórzeń.
*   **Lokalny Zapis i Prywatność:** Wszystkie dane są automatycznie zapisywane w `localStorage` przeglądarki. Aplikacja nie wysyła żadnych danych na zewnętrzne serwery.

## Specyfikacja Techniczna

*   **Frontend:** Czysty (Vanilla) JavaScript z wykorzystaniem modułów ES6, HTML5, CSS3.
*   **Kluczowe API Webowe:** Web Speech API (Text-to-Speech), Wake Lock API.
*   **Architektura:** Aplikacja jednostronicowa (SPA) bez użycia frameworków.
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