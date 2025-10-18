# Aplikacja Treningowa L5-S1

Modułowa i responsywna platforma webowa (PWA) wspierająca spersonalizowane, cykliczne plany treningowe dla osób z bólem w okolicy kręgosłupa lędźwiowo-krzygowego (L5-S1). Aplikacja została przekształcona w elastyczny system, który oddziela bazę ćwiczeń od planów treningowych, umożliwiając łatwą rozbudowę i personalizację.

## Cel Projektu

Głównym celem aplikacji jest bezpieczne i automatyczne prowadzenie użytkownika przez wybrany plan treningowy. Aplikacja kładzie nacisk na elastyczność (możliwość zmiany planu), edukację (dedykowana baza ćwiczeń z opisami i wideo), szczegółowe monitorowanie postępów oraz działanie w pełni offline po pierwszym załadowaniu, gwarantując 100% prywatności.

## Kluczowe Funkcje

### Najważniejsze Aktualizacje (Wersja 2.0)
*   **Modułowa Architektura:** Całkowite oddzielenie danych o ćwiczeniach (opisy, linki wideo) od struktury planów treningowych (serie, powtórzenia), co pozwala na łatwe dodawanie nowych planów i ćwiczeń.
*   **Wybór Planu Treningowego:** Użytkownik może wybrać aktywny plan z dostępnej listy w ustawieniach. Zmiana jest natychmiast odzwierciedlana w harmonogramie na ekranie głównym.
*   **Nowy Ekran: Baza Ćwiczeń:** Dedykowana sekcja w aplikacji, która pozwala na przeglądanie, wyszukiwanie i studiowanie wszystkich dostępnych ćwiczeń, niezależnie od aktywnego planu.
*   **Ulepszony Tryb Treningu:**
    *   **Inteligentne Rozróżnianie Ćwiczeń:** Aplikacja inaczej traktuje ćwiczenia na czas i na powtórzenia, optymalizując przepływ sesji.
    *   **Informacyjny Stoper:** Podczas ćwiczeń na powtórzenia (z ręcznym potwierdzeniem) na ekranie wyświetlany jest licznik czasu (stoper), informujący użytkownika, jak długo wykonuje daną serię.

### Pełna Lista Funkcji

*   **Wybór i Zarządzanie Planami Treningowymi:**
    *   Możliwość wyboru aktywnego planu treningowego w panelu ustawień.
    *   Ekran główny dynamicznie prezentuje 7-dniowy harmonogram oparty na **aktualnie wybranym planie**.
    *   Automatyczne generowanie listy wymaganego sprzętu dla każdego dnia.
*   **Dedykowana Baza Ćwiczeń:**
    *   Osobna zakładka z listą wszystkich ćwiczeń dostępnych w aplikacji.
    *   Funkcjonalność **wyszukiwania na żywo** pozwala na szybkie filtrowanie ćwiczeń po nazwie lub opisie.
    *   Każde ćwiczenie posiada szczegółowy opis, informację o sprzęcie i bezpośredni link do wideo instruktażowego.
*   **Historia i Kalendarz Treningów:**
    *   Interaktywny kalendarz wizualnie oznaczający dni z wykonanym treningiem.
    *   **Kompatybilność wsteczna:** Historia poprawnie wyświetla treningi wykonane przed zmianą architektury.
    *   Szczegółowy widok dnia z zapisanym logiem każdej sesji.
*   **Zaawansowany Moduł Ustawień:**
    *   **Personalizacja Cyklu:** Możliwość zmiany daty rozpoczęcia cyklu treningowego.
    *   **Wybór Planu:** Intuicyjna lista rozwijana do zmiany aktywnego planu.
    *   **Współczynnik Progresji:** Suwak do skalowania intensywności treningu (od 50% do 200%).
*   **Zautomatyzowany Tryb Treningu ("Focus Mode"):**
    *   **Zróżnicowany Przepływ Sesji:**
        *   **Ćwiczenia na czas:** Asystent głosowy odtwarza instrukcje w fazie przygotowania.
        *   **Ćwiczenia na powtórzenia:** Krótka, cicha faza przygotowania, po której asystent głosowy odtwarza instrukcje **w trakcie wykonywania ćwiczenia**, a na ekranie działa stoper.
    *   **Blokada Wygaszania Ekranu:** Aplikacja aktywnie blokuje automatyczne wygaszanie ekranu (Wake Lock API).
    *   Inteligentny asystent głosowy (TTS) z naturalnie brzmiącymi komunikatami.
*   **Backup i Przywracanie Danych:** Możliwość eksportu i importu wszystkich postępów i ustawień do pliku `.json`.
*   **Lokalny Zapis i Prywatność:** Wszystkie dane są zapisywane wyłącznie w `localStorage` przeglądarki. Aplikacja nie wysyła żadnych danych na zewnętrzne serwery.

## Specyfikacja Techniczna

*   **Frontend:** Czysty (Vanilla) JavaScript z wykorzystaniem modułów ES6, HTML5, CSS3.
*   **Kluczowe API Webowe:** Web Speech API (Text-to-Speech), Wake Lock API.
*   **Architektura:** Aplikacja jednostronicowa (SPA) bez użycia frameworków.
*   **Źródło Danych:** Dane są podzielone na dwa pliki:
    *   `exercise-library.js`: Centralna baza wszystkich unikalnych ćwiczeń (opisy, wideo).
    *   `training-plans.js`: Definicje struktur planów treningowych (kolejność, serie, powtórzenia).
*   **Przechowywanie Danych Użytkownika:** `localStorage` przeglądarki internetowej.
*   **Zależności:** Brak zewnętrznych bibliotek i zależności.

## Struktura Projektu

Projekt został zrestrukturyzowany w celu oddzielenia danych od logiki, co ułatwia jego utrzymanie i przyszły rozwój.
```
/aplikacja-treningowa
│
├── index.html              # Główny plik HTML, struktura aplikacji
├── style.css               # Plik CSS, definicje stylów
│
├── app.js                  # Główny plik, inicjalizacja i obsługa zdarzeń
│
├── exercise-library.js     # NOWOŚĆ: Baza danych ćwiczeń (opisy, wideo)
├── training-plans.js       # NOWOŚĆ: Struktura planów (serie, powtórzenia)
│
├── dataStore.js            # Obsługa localStorage
├── dom.js                  # Selektory elementów DOM
├── state.js                # Centralny obiekt stanu aplikacji
├── timer.js                # Logika timera i stopera
├── training.js             # Logika przebiegu sesji treningowej
├── tts.js                  # Logika syntezatora mowy (Text-to-Speech)
├── ui.js                   # Funkcje renderujące interfejs
└── utils.js                # Funkcje pomocnicze (daty, "nawadnianie" danych)