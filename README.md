# L5–S1 Trening (single-file)

Aplikacja do bezpiecznego, krok-po-kroku prowadzenia treningu dla użytkownika z bólem w okolicy **L5–S1** i przeciążeniem **stawów międzywyrostkowych**.
Jednoplikowe rozwiązanie (HTML + CSS + JS) działające **offline**, z **lokalnym zapisem** postępów oraz **eksportem CSV**.

---

## Spis treści

* [Funkcje](#funkcje)
* [Bezpieczeństwo (SafetyRules)](#bezpieczeństwo-safetyrules)
* [Wymagania](#wymagania)
* [Szybki start](#szybki-start)
* [Użycie na telefonie](#użycie-na-telefonie)
* [Dane i prywatność](#dane-i-prywatność)
* [Eksport / Import](#eksport--import)
* [Interfejs i wygląd](#interfejs-i-wygląd)
* [Ograniczenia techniczne](#ograniczenia-techniczne)
* [Rozwiązywanie problemów](#rozwiązywanie-problemów)
* [Konfiguracja / personalizacja](#konfiguracja--personalizacja)
* [Licencja i zastrzeżenia](#licencja-i-zastrzeżenia)
* [Historia wersji](#historia-wersji)

---

## Funkcje

* **Plan 7 dni**: widok „Dzień 1–7” z czasem trwania oraz sekcjami: **Rozgrzewka**, **Część główna**, **Schłodzenie**.
* **Przepływ treningu**: krok-po-kroku z opisem serii/powt./czasu, tempem/izometrią, wymaganym sprzętem i linkiem do YouTube.
* **Timery**: odliczanie z **Start/Pauza/Wznów/Reset**, sygnał dźwiękowy + wibracja (jeśli wspierane).
* **Rejestr wykonania**: oznaczanie serii jako „Zakończ serię”, status **Ukończono** dla sekcji/dnia.
* **Skale bólu 0–10**: w trakcie i po 24 h; notatki per dzień/ćwiczenie.
* **Tryb „Zaostrzenie”**: szybki przełącznik redukujący objętość (~40%), skracający izometrie do 6–8 s i **pomijający** Pallof/Glute bridge danego dnia.
* **Progresja**: zasady i kryteria przejścia (informacyjnie).
* **Czerwone flagi**: osobny ekran + przycisk „Zatrzymaj trening i skontaktuj się z lekarzem”.
* **Eksport CSV**: separator `;`, kodowanie **UTF-8-SIG**; kopia zapasowa/odtwarzanie **JSON**.
* **Offline i prywatność**: wszystkie dane **lokalnie** (localStorage); brak wysyłki.

---

## Bezpieczeństwo (SafetyRules)

* **Zakresy i tempo**: środkowe zakresy, ruch powolny (2–3 s/faza).
  Jeśli **ból miejscowy > 3/10** lub wystąpi **promieniowanie** – **przerwij**.
* **Zaostrzenie objawów** (chwilowe): zredukuj objętość o **30–50%**, izometrie do **5–8 s**, **pomiń** Pallof/mosty; zostaw: **oddech + rock back + open book** (10–12 min).
* **Obciążenia osiowe/ścinanie**: unikaj głębokich kątów i dźwigni bez kontroli.
* **Roller**: tylko odcinek piersiowy/pośladki; **nie roluj lędźwi**.
* **Czerwone flagi** – przerwij i skonsultuj lekarza: narastające osłabienie, zaburzenia czucia w kroku/siodle, problemy ze zwieraczami (nietrzymanie/retencja), ból promieniujący z drętwieniem + osłabienie, gorączka/uraz/nowotwór, niezamierzona utrata masy.
* **Uwaga o dowodach**: najlepsze wyniki daje konsekwencja i kontrola motoryczna; mata do akupresury – słabsze dowody, tylko dodatek.

---

## Wymagania

* Przeglądarka mobilna lub desktopowa z obsługą **ES6** i **localStorage** (Chrome/Edge/Firefox/Safari).
* Dla wibracji – urządzenie mobilne i HTTPS (zalecane).
* Brak instalacji; to **jeden plik HTML**.

---

## Szybki start

1. Zapisz plik `l5s1_trening.html` na urządzeniu.
2. Otwórz w przeglądarce.
3. Przejdź do zakładki **Dni** → wybierz **Start treningu dnia**.
4. W trakcie używaj timera i oznaczaj serie przyciskiem **Zakończ serię**.
5. Po skończeniu sekcji/dnia zobaczysz podsumowanie i status **Ukończono**.
6. W zakładce **Eksport** pobierzesz **CSV** lub zrobisz **kopię JSON**.

---

## Użycie na telefonie

* **Android (Chrome/Edge)**: otwórz plik z „Pliki/Files” lub wgraj do pamięci i uruchom z przeglądarki; opcjonalnie „Dodaj do ekranu głównego”.
* **iOS (Safari)**: zapisz do „Pliki”, otwórz w Safari → udostępnij → **Dodaj do ekranu domowego**.
  *Uwaga:* iOS może ograniczać dźwięk timera do czasu pierwszej interakcji (wymóg autoplay).

---

## Dane i prywatność

* Dane zapisywane są w **localStorage** przeglądarki dla tego pliku.
* Zakres danych: data, dzień, nazwa ćwiczenia, status serii, skale bólu (0–10), notatki.
* **Brak** wrażliwych danych osobowych/zdrowotnych poza subiektywną skalą bólu.
* Usunięcie danych: wyczyść dane przeglądarki dla tego pliku (cache/storage) lub użyj **Przywróć z JSON** ze „świecącym” stanem.

---

## Eksport / Import

* **CSV**: separator `;`, **UTF-8-SIG** (kompatybilne z Excel/LibreOffice).
  Kolumny: `data; dzień; ćwiczenie; serie/powt./czas; status; ból; notatka`.
* **Kopia JSON**: pełny stan aplikacji – do odtworzenia na tym samym lub innym urządzeniu.
* **Import JSON**: zakładka **Eksport** → *Przywróć z JSON* → wybierz plik.

---

## Interfejs i wygląd

* Spójny, nowoczesny motyw: ciemne tło, miękkie cienie, gradienty, duże promienie narożników, wysoki kontrast.
* Własne **logo** (minimalistyczny motyw L5–S1) osadzone jako **SVG** – brak zależności zewnętrznych.
* Układ responsywny: duże przyciski, czytelna typografia, przejrzyste „karty”.

---

## Ograniczenia techniczne

* **Zapisywanie „w katalogu z plikiem HTML”** nie jest możliwe z poziomu przeglądarki (bezpośredni zapis do systemu plików jest ograniczony względami bezpieczeństwa).
  Aplikacja używa **localStorage** i oferuje **eksport plików** (CSV/JSON) poprzez pobranie.
* Dźwięk timera może wymagać **jednej interakcji** użytkownika z kartą (polityka autoplay).
* Wibracje wymagają urządzenia z obsługą `navigator.vibrate` i najlepiej HTTPS.

---

## Rozwiązywanie problemów

* **Brak dźwięku** timera → kliknij dowolny przycisk w aplikacji (odblokowuje AudioContext).
* **CSV otwiera się z przecinkami** w Excelu → zmień separator regionalny lub zaimportuj plik wskazując `;`.
* **Brak zapisu postępów** → upewnij się, że przeglądarka nie jest w trybie prywatnym (niektóre blokują localStorage).
* **Po aktualizacji pliku** zniknęły dane → skorzystaj z kopii **JSON** (eksport przed podmianą pliku).
* **iOS**: po dodaniu do ekranu domowego, audio może być cichsze – wymagane ponowne „aktywowanie” przyciskiem.

---

## Konfiguracja / personalizacja

* **Kolory i styl**: wszystkie główne barwy w sekcji `:root{ ... }` (zmienne CSS).
* **Logo**: wewnątrz kontenera `<div class="logo">` – można podmienić SVG lub dodać obraz `data:`.
* **Domyślne przerwy**: w obiekcie `PLAN.GlobalRules` (`defaultRestSecondsBetweenSets/Exercises`).
* **Reguły progresji / safety**: sekcje `PROGRESSION` i `SAFETY_RULES` – teksty informacyjne (logika treningu pozostaje bez zmian).
* **Tryb „Zaostrzenie”**: funkcje `adjustForFlare(...)` i `isSkippedInFlare(...)` zawierają reguły redukcji i pomijania ćwiczeń.

---

## Licencja i zastrzeżenia

* Materiał informacyjny, nie zastępuje porady medycznej. W razie wątpliwości skonsultuj się z lekarzem/fizjoterapeutą.
* (Wstaw własną licencję, np. MIT/Proprietary.)

---

## Historia wersji

* **v1.0.0** – Wydanie początkowe: plan 7 dni, timery, tryb „Zaostrzenie”, skale bólu, notatki, eksport CSV/JSON, nowoczesna szata graficzna, logo.

