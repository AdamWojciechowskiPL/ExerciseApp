# Aplikacja Treningowa L5-S1

Dedykowana aplikacja webowa (Progressive Web App) wspierająca 7-dniowy, z góry zdefiniowany plan treningowy dla osób z bólem w okolicy kręgosłupa lędźwiowo-krzyżowego (L5-S1) i przeciążeniem stawów międzywyrostkowych. Aplikacja została zaprojektowana z myślą o maksymalnej prostocie, bezpieczeństwie i prywatności użytkownika.

## Cel Projektu

Głównym celem aplikacji jest bezpieczne prowadzenie użytkownika przez plan treningowy, monitorowanie jego postępów oraz subiektywnych odczuć bólowych. Aplikacja edukuje również w zakresie bezpieczeństwa i kładzie nacisk na prawidłowe wykonywanie ćwiczeń, działając w pełni offline po pierwszym załadowaniu.

## Kluczowe Funkcje

*   **7-dniowy Plan Treningowy:** Aplikacja wczytuje gotowy, szczegółowy plan treningowy z zewnętrznego pliku, co ułatwia jego modyfikację.
*   **Ekran Podglądu i Modyfikacji:** Przed rozpoczęciem sesji użytkownik może przejrzeć listę wszystkich ćwiczeń, zapoznać się z ich opisem oraz **dostosować liczbę serii i powtórzeń/czas** do swoich aktualnych możliwości.
*   **Zautomatyzowany Tryb Treningu ("Focus Mode"):** Po rozpoczęciu sesji aplikacja przechodzi w tryb pełnoekranowy, który automatycznie prowadzi użytkownika krok po kroku przez każde ćwiczenie, serię i przerwę.
*   **Inteligentny Timer:** Aplikacja automatycznie rozpoznaje, czy dane ćwiczenie jest oparte na czasie (np. izometria, rozciąganie), czy na liczbie powtórzeń, i dostosowuje do tego interfejs.
*   **Obsługa Serii i Przerw:** Plan treningowy jest automatycznie rozbijany na poszczególne serie, a między nimi uruchamiane są timery na odpoczynek (krótszy między seriami, dłuższy między ćwiczeniami).
*   **Pełna Nawigacja w Trakcie Treningu:** Użytkownik ma pełną kontrolę nad sesją dzięki przyciskom:
    *   **Cofnij:** Powrót do poprzedniego kroku (serii lub przerwy).
    *   **Pauza / Wznów:** Zatrzymanie i wznowienie timera.
    *   **Pomiń:** Przejście do następnego kroku.
    *   **Zakończ:** Możliwość przerwania całej sesji i powrotu do ekranu głównego.
*   **Lokalny Zapis Postępów:** Wszystkie postępy (statusy dni, notatki, oceny bólu) są **automatycznie zapisywane w `localStorage` przeglądarki**.
*   **Prywatność i Działanie Offline:** Aplikacja nie wymaga połączenia z internetem (poza pierwszym załadowaniem i linkami do YouTube) i nie wysyła żadnych danych na zewnętrzne serwery.

## Specyfikacja Techniczna

*   **Frontend:** Czysty (Vanilla) JavaScript (ES6+), HTML5, CSS3.
*   **Architektura:** Aplikacja jednostronicowa (SPA) bez użycia frameworków.
*   **Źródło Danych:** Plan treningowy jest przechowywany w obiekcie JavaScript w osobnym pliku (`training-plan.js`).
*   **Przechowywanie Danych Użytkownika:** `localStorage` przeglądarki internetowej.
*   **Zależności:** Brak zewnętrznych bibliotek i zależności.

## Struktura Projektu

```
/aplikacja-treningowa
│
├── index.html         # Główny plik HTML, struktura aplikacji
├── style.css          # Plik CSS, definicje stylów
├── app.js             # Główny plik JavaScript, cała logika aplikacji
└── training-plan.js   # Plik z danymi, zawiera obiekt z planem treningowym
```

## Instalacja i Uruchomienie

Aplikacja nie wymaga skomplikowanej instalacji ani serwera.

1.  Upewnij się, że wszystkie cztery pliki (`index.html`, `style.css`, `app.js`, `training-plan.js`) znajdują się w tym samym folderze.
2.  Otwórz plik `index.html` w dowolnej nowoczesnej przeglądarce internetowej (np. Google Chrome, Mozilla Firefox, Safari, Microsoft Edge).

Aplikacja jest gotowa do użycia.

## Jak Korzystać z Aplikacji (Przepływ Użytkownika)

1.  **Ekran Główny:** Po otwarciu aplikacji zobaczysz listę 7 dni treningowych.
2.  **Rozpoczęcie Dnia:** Kliknij przycisk **"Start treningu dnia"** przy wybranym dniu.
3.  **Podgląd i Modyfikacja:** Zostaniesz przeniesiony na ekran podglądu, gdzie możesz przejrzeć listę ćwiczeń i opcjonalnie zmienić liczbę serii lub powtórzeń.
4.  **Uruchomienie Sesji:** Kliknij **"Rozpocznij Trening"**, aby przejść do zautomatyzowanego trybu skupienia.
5.  **Wykonywanie Ćwiczeń:** Aplikacja poprowadzi Cię przez każdą serię i przerwę. Postępuj zgodnie z instrukcjami na ekranie:
    *   Jeśli widzisz **timer**, wykonuj ćwiczenie przez wskazany czas.
    *   Jeśli widzisz przycisk **"WYKONAJ"**, wykonaj zadaną liczbę powtórzeń i kliknij go, aby przejść dalej.
6.  **Zakończenie Treningu:** Po ostatnim ćwiczeniu zostaniesz przeniesiony na ekran podsumowania.
7.  **Podsumowanie:** Wypełnij formularz z oceną bólu i notatkami, a następnie kliknij **"Zapisz i zakończ"**.
8.  **Powrót:** Wrócisz do ekranu głównego, a ukończony dzień będzie oznaczony zielonym kolorem.