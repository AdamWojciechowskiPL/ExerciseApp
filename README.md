# Aplikacja Treningowa L5-S1

Dedykowana, responsywna aplikacja webowa (Progressive Web App) wspierająca spersonalizowany, cykliczny plan treningowy dla osób z bólem w okolicy kręgosłupa lędźwiowo-krzyżowego (L5-S1). Aplikacja została zaprojektowana z myślą o maksymalnej prostocie, personalizacji, bezpieczeństwie i prywatności użytkownika.

## Cel Projektu

Głównym celem aplikacji jest bezpieczne i automatyczne prowadzenie użytkownika przez spersonalizowany plan treningowy, monitorowanie postępów w kalendarzu oraz umożliwienie dostosowania intensywności treningu. Aplikacja kładzie nacisk na edukację (opisy ćwiczeń, TTS) i działa w pełni offline po pierwszym załadowaniu.

## Kluczowe Funkcje

*   **Dynamiczny Plan na 7 Dni:** Ekran główny zawsze pokazuje plan treningowy na najbliższe 7 dni, zaczynając od dnia dzisiejszego, z automatycznie przypisanym dniem z cyklu treningowego.
*   **Historia i Kalendarz Treningów:**
    *   Dedykowana sekcja "Historia" z interaktywnym kalendarzem.
    *   Możliwość przeglądania poprzednich i przyszłych miesięcy.
    *   Automatyczne, cykliczne przypisywanie planu treningowego do dni w kalendarzu od daty startowej.
    *   Wizualne oznaczenie statusu każdego dnia (ukończony, w trakcie, nie rozpoczęto).
*   **Moduł Ustawień:**
    *   **Personalizacja Przerw:** Użytkownik może globalnie ustawić długość przerwy między ćwiczeniami.
    *   **Współczynnik Progresji:** Intuicyjny suwak pozwala na skalowanie intensywności treningu (od 50% do 200%), co automatycznie przelicza czas trwania i liczbę powtórzeń w ćwiczeniach.
*   **Backup i Przywracanie Danych:**
    *   Możliwość wyeksportowania wszystkich postępów i ustawień do jednego pliku `.json`.
    *   Funkcja przywracania danych z pliku, co pozwala na przenoszenie postępów między urządzeniami lub przeglądarkami.
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

### Uruchomienie na telefonie (PWA)

Aplikację można łatwo "zainstalować" na telefonie, aby działała jak natywna aplikacja:
1.  **Opublikuj aplikację online** używając darmowej usługi takiej jak [Netlify](https://www.netlify.com/) lub [Vercel](https://vercel.com/) (wystarczy przeciągnąć folder z projektem).
2.  **Otwórz link** do opublikowanej aplikacji w przeglądarce Chrome na telefonie z Androidem.
3.  Kliknij menu z trzema kropkami i wybierz opcję **"Zainstaluj aplikację"** (lub "Dodaj do ekranu głównego").
4.  Ikona aplikacji pojawi się na ekranie głównym Twojego telefonu.