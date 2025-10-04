// training-plan.js (z opisami dla pacjenta)
const TRAINING_PLAN = {
  "GlobalRules": {
    "language": "pl",
    "defaultRestSecondsBetweenSets": 30,
    "defaultRestSecondsBetweenExercises": 60,
    "tempoGuideline": "Powoli 2–3 s w każdej fazie; izometrie według opisu.",
    "lumbarRange": "Zakres środkowy; unikać skrajnej fleksji i przeprostu.",
    "notes": "Neutral kręgosłupa, kontrola miednicy i oddechu."
  },
  "Days": [
    {
      "dayNumber": 1,
      "title": "Stabilizacja bazowa (McGill + anty-przeprost)",
      "duration_estimate_min": 26,
      "duration_estimate_max": 29,
      "warmup": [
        { 
          "name": "Oddychanie przeponowe (leżenie)", 
          "sets": "1", 
          "reps_or_time": "2–3 min", 
          "tempo_or_iso": "spokojny oddech 4–6/min", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=UB3tSaiEbNY",
          "description": "Połóż się na plecach, kolana ugięte, stopy na podłodze. Jedna dłoń na brzuchu, druga na klatce piersiowej. Wdech nosem – brzuch unosi się, klatka minimalnie. Wydech ustami – żebra schodzą w dół, pępek delikatnie do kręgosłupa. Szyja i barki rozluźnione. Lędźwie w neutralu, bez dociskania na siłę. Jeśli czujesz napięcie w szyi – zmniejsz głębokość oddechu. Utrzymuj spokojny, równy rytm."
        },
        { 
          "name": "Quadruped rock back", 
          "sets": "2", 
          "reps_or_time": "8–10", 
          "tempo_or_iso": "pauza 1–2 s w końcu ruchu", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=gNs0QgWiUto",
          "description": "Ustaw pozycję na czworakach: dłonie pod barkami, kolana pod biodrami, kręgosłup w neutralu. Napnij delikatnie brzuch, żebra w dół. Cofaj biodra do pięt, aż poczujesz łagodny rozciąg w biodrach/plecach, bez zaokrąglania lędźwi. Zatrzymaj 1–2 s, wróć do startu z kontrolą. Głowa w przedłużeniu kręgosłupa, nie unoś barków do uszu."
        }
      ],
      "main": [
        { 
          "name": "McGill curl-up", 
          "sets": "3", 
          "reps_or_time": "5–6", 
          "tempo_or_iso": "izometria 8–10 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=3nhAkkzh738",
          "description": "Leżenie tyłem, jedna noga ugięta, druga wyprostowana. Ręce pod naturalną lordozą lędźwiową dla podparcia. Napnij delikatnie brzuch (bracing), żebra w dół. Uniesienie głowy i łopatek o 1–2 cm (mikroruch), bez zginania w lędźwiach. Utrzymaj 8–10 s, oddychaj płytko, barki daleko od uszu. Opuść powoli. Unikaj ciągnięcia brody do klatki – patrz w sufit, szyja neutralnie."
        },
        { 
          "name": "Bird-dog", 
          "sets": "3", 
          "reps_or_time": "6–8/str.", 
          "tempo_or_iso": "izometria 5–8 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=xo7Qpb_NTKE",
          "description": "Pozycja na czworakach, kręgosłup neutralnie, żebra w dół. Wysuń naprzemiennie rękę i przeciwległą nogę, pilnując stabilnej miednicy (brak kołysania). Utrzymaj 5–8 s, oddychaj spokojnie, następnie wróć z kontrolą. Pięta nogi aktywnie do tyłu, kciuk ręki do przodu. Nie unoś kończyn zbyt wysoko – ciało w jednej linii."
        },
        { 
          "name": "Side plank (na kolanach)", 
          "sets": "2–3", 
          "reps_or_time": "10–20 s/str.", 
          "tempo_or_iso": "izometria", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=gMMgnm5_QIs",
          "description": "Leżenie bokiem, łokieć pod barkiem, kolana ugięte. Unieś biodra, tworząc linię: bark–biodro–kolano. Napnij brzuch i pośladki, nie wypychaj żeber. Głowa w jednej linii z tułowiem. Utrzymaj napięcie boczne brzucha, oddychaj spokojnie. Jeśli boli bark lub lędźwie – skróć czas, dociągnij łokieć bliżej tułowia."
        }
      ],
      "cooldown": [
        { 
          "name": "Hip flexor stretch (klęk półkolanowy)", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "rozciąganie statyczne", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=Z-u4RDhWrhc",
          "description": "Pozycja wykroku w klęku: jedna noga z przodu, druga klęczy. Miednicę ustaw w lekkim tyłopochyleniu (ogon pod siebie), napnij pośladek nogi zakrocznej. Przesuń tułów minimalnie do przodu, aż poczujesz rozciąganie w przodzie biodra. Plecy neutralnie, żebra w dół. Oddychaj spokojnie, nie przeprostowuj lędźwi."
        },
        { 
          "name": "Hamstring stretch z taśmą (leżenie)", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "rozciąganie statyczne", 
          "equipment": "Pasek/Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=r7Of03DkVMA",
          "description": "Leżenie tyłem. Załóż pasek/taśmę na stopę, unieś wyprostowaną nogę do odczucia łagodnego ciągnięcia z tyłu uda. Druga noga zgięta lub wyprostowana – bez bólu w krzyżu. Kostka w lekkim zgięciu grzbietowym. Oddychaj spokojnie, nie ciągnij na siłę; utrzymuj neutral lędźwi."
        }
      ]
    },
    {
      "dayNumber": 2,
      "title": "Anty-rotacja + anty-przeprost (statycznie)",
      "duration_estimate_min": 27,
      "duration_estimate_max": 30,
      "warmup": [
        { 
          "name": "Cat–cow (mała amplituda)", 
          "sets": "1–2", 
          "reps_or_time": "6–8 cykli", 
          "tempo_or_iso": "płynnie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=lmKhCTz0y8w",
          "description": "Pozycja na czworakach. Delikatnie zmieniaj ustawienie kręgosłupa od lekkiego zaokrąglenia do łagodnego wyprostowania, w małym zakresie i bez bólu. Oddychaj: wydech przy zaokrąglaniu, wdech przy powrocie. Ruch kontrolowany segmentarnie, barki daleko od uszu."
        },
        { 
          "name": "Foam rolling T-spine (nie lędźwie)", 
          "sets": "1", 
          "reps_or_time": "60–90 s", 
          "tempo_or_iso": "powoli", 
          "equipment": "Roller", 
          "youtube_url": "https://www.youtube.com/watch?v=PRAJ5HNhc6Q",
          "description": "Połóż wałek pod odcinkiem piersiowym (górne/środkowe plecy). Podpieraj głowę dłońmi, biodra opuszczone lub na ziemi. Przetaczaj powoli w górę i w dół od łopatek do dolnej części żeber. Nie roluj lędźwi. Oddychaj równomiernie, nie dociskaj na siłę bolesnych punktów."
        }
      ],
      "main": [
        { 
          "name": "Dead bug (bazowy)", 
          "sets": "2–3", 
          "reps_or_time": "6–8/str.", 
          "tempo_or_iso": "pauza 2–3 s na wydechu", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=GbSC02oU3To",
          "description": "Leżenie tyłem, biodra i kolana 90°, ręce nad klatką. Utrzymaj żebra w dół, miednica neutralnie. Na wydechu oddal jedną nogę i przeciwną rękę, nie wyginaj lędźwi. Pauza 2–3 s, wróć z kontrolą i zmień stronę. Jeśli krzyż odrywa się – zmniejsz zakres lub dotknij piętą podłogi zamiast pełnego wyprostu."
        },
        { 
          "name": "Pallof press (stanie)", 
          "sets": "3", 
          "reps_or_time": "6/str.", 
          "tempo_or_iso": "izometria 10 s przy wyprostowanych ramionach", 
          "equipment": "Taśma", 
          "youtube_url": "https://www.youtube.com/watch?v=n8ZZG9gElhs",
          "description": "Stań bokiem do punktu zaczepienia taśmy. Stopy na szerokość bioder, kolana lekko ugięte, żebra w dół. Trzymając taśmę przy klatce wypchnij ręce do przodu i trzymaj 10 s, nie pozwalając na rotację tułowia. Miednica stabilna, oddychaj. Wróć powoli. Zmieniaj stronę."
        },
        { 
          "name": "Glute bridge – izometria", 
          "sets": "3", 
          "reps_or_time": "5 × 10–15 s", 
          "tempo_or_iso": "izometria w neutralu", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=PPNCe7nX3Fc",
          "description": "Leżenie tyłem, kolana ugięte, stopy na szerokość bioder. Dociśnij stopy, napnij pośladki, unieś biodra do linii bark–biodra–kolana, bez przeprostu w lędźwiach. Utrzymaj 10–15 s, oddychaj spokojnie. Opuść z kontrolą. Jeśli czujesz krzyż – obniż biodra, wzmocnij napięcie brzucha."
        }
      ],
      "cooldown": [
        { 
          "name": "Piriformis/figure-4 (leżenie)", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "rozciąganie statyczne", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=qgbpYL_NDZ0",
          "description": "Leżenie tyłem. Załóż kostkę jednej nogi na kolano drugiej (pozycja „4”). Przeciągnij udo nogi podporowej do klatki, aż poczujesz rozciąganie pośladka. Miednica neutralnie, barki rozluźnione. Oddychaj spokojnie; nie dociskaj kolana na siłę."
        },
        { 
          "name": "Oddychanie przeponowe", 
          "sets": "1", 
          "reps_or_time": "2 min", 
          "tempo_or_iso": "spokojny oddech", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=UB3tSaiEbNY",
          "description": "Połóż się lub usiądź wygodnie. Wdech nosem do brzucha, szeroko na boki żeber; wydech ustami, żebra w dół. Utrzymuj rozluźnione barki i szyję. Równy rytm oddechu, bez napinania brzucha na siłę."
        }
      ]
    },
    {
      "dayNumber": 3,
      "title": "Boczna stabilizacja + biodro (kontrola)",
      "duration_estimate_min": 25,
      "duration_estimate_max": 28,
      "warmup": [
        { 
          "name": "Quadruped rock back", 
          "sets": "2", 
          "reps_or_time": "8–10", 
          "tempo_or_iso": "pauza 1–2 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=gNs0QgWiUto",
          "description": "Pozycja na czworakach, plecy neutralnie. Cofaj biodra do pięt bez zapadania lędźwi. Oddychaj, zatrzymaj 1–2 s w końcu zakresu. Kolana i stopy stabilnie, barki oddalone od uszu."
        },
        { 
          "name": "Open book (T-spine)", 
          "sets": "2", 
          "reps_or_time": "8/str.", 
          "tempo_or_iso": "kontrola zakresu", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=720_avYMUDY",
          "description": "Leżenie bokiem, kolana ugięte, ręce wyciągnięte przed sobą. Otwórz górną rękę łukiem za siebie, rotując klatkę piersiową – miednica stabilna. Patrz za dłonią. Wróć powoli. Nie ciągnij siłą – ruch ma być płynny, bez bólu."
        }
      ],
      "main": [
        { 
          "name": "Side plank (kolana → stopy jeśli łatwo)", 
          "sets": "3", 
          "reps_or_time": "12–20 s/str.", 
          "tempo_or_iso": "izometria", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=gMMgnm5_QIs",
          "description": "Start jak w podporze bokiem na kolanach. Biodra wysoko, linia prosta. Jeśli łatwo – przejdź na podpór na stopach (pełna wersja). Pośladki i brzuch napięte, żebra w dół. Oddychaj. Zakończ przed utratą pozycji."
        },
        { 
          "name": "Clamshell (opcjonalnie z minibandem)", 
          "sets": "2–3", 
          "reps_or_time": "10/str.", 
          "tempo_or_iso": "pauza 2 s w górze", 
          "equipment": "Mata/Taśma", 
          "youtube_url": "https://www.youtube.com/watch?v=QJ9Rmst88iE",
          "description": "Leżenie bokiem, kolana ugięte, stopy razem. Utrzymując stopy w kontakcie, unieś górne kolano, nie rotuj tułowia. Pauza 2 s w górze, powrót wolno. Miednica stabilna, nie kołysz biodrami. Miniband nad kolanami zwiększa opór."
        },
        { 
          "name": "Bird-dog – dłuższa izometria", 
          "sets": "2", 
          "reps_or_time": "5/str.", 
          "tempo_or_iso": "izometria 8–10 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=xo7Qpb_NTKE",
          "description": "Ustaw czworaki, napnij „gorset” brzuszny. Wyprostuj przeciwległą rękę i nogę; trzymaj 8–10 s w stabilnej pozycji, bez rotacji miednicy. Wróć powoli, zmień stronę. Oddychaj równomiernie."
        }
      ],
      "cooldown": [
        { 
          "name": "Hip flexor stretch", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "statycznie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=Z-u4RDhWrhc",
          "description": "Klęk półkolanowy, ogon pod siebie, pośladek nogi zakrocznej napięty. Minimalnie przesuń ciężar do przodu przy zachowaniu neutralnych lędźwi. Oddychaj spokojnie, barki rozluźnione."
        },
        { 
          "name": "Hamstring stretch", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "statycznie", 
          "equipment": "Pasek/Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=r7Of03DkVMA",
          "description": "Leżenie tyłem lub siad z wyprostowaną nogą. Pochyl się z biodra, plecy długie, nie garb się. Utrzymuj łagodny ciąg z tyłu uda, bez bólu pod kolanem. Oddychaj równomiernie."
        }
      ]
    },
    {
      "dayNumber": 4,
      "title": "Reset (mobilność + core w środkowym zakresie)",
      "duration_estimate_min": 24,
      "duration_estimate_max": 27,
      "warmup": [
        { 
          "name": "Cat–cow (kontrola segmentarna)", 
          "sets": "1–2", 
          "reps_or_time": "6–8", 
          "tempo_or_iso": "płynnie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=lmKhCTz0y8w",
          "description": "Na czworakach prowadzaj ruch kręg po kręgu w niewielkim zakresie. Wydech – delikatnie zaokrąglij; wdech – wróć do neutralu. Nie dociskaj ruchu w lędźwiach, barki pozostają nisko."
        },
        { 
          "name": "Foam roll T-spine", 
          "sets": "1", 
          "reps_or_time": "60–90 s", 
          "tempo_or_iso": "powoli", 
          "equipment": "Roller", 
          "youtube_url": "https://www.youtube.com/watch?v=PRAJ5HNhc6Q",
          "description": "Powoli roluj od łopatek do dolnych żeber. Oddychaj głęboko, unikaj lędźwi. Jeśli któryś punkt jest tkliwy – zatrzymaj na kilka oddechów, nie dociskaj gwałtownie."
        }
      ],
      "main": [
        { 
          "name": "Dead bug (pauza na wydechu)", 
          "sets": "2", 
          "reps_or_time": "8/str.", 
          "tempo_or_iso": "pauza 3 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=GbSC02oU3To",
          "description": "Ustaw pozycję jak w dead bug. Z wydechem oddal kończyny, utrzymaj 3 s napięcie brzucha bez unoszenia żeber. Wróć wolno. Jeśli lędźwie odklejają się – zmniejsz zakres ruchu."
        },
        { 
          "name": "McGill curl-up (krótsze serie)", 
          "sets": "2", 
          "reps_or_time": "5", 
          "tempo_or_iso": "izometria 8 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=3nhAkkzh738",
          "description": "Mikropodniesienie głowy i łopatek przy neutralnych lędźwiach. Brzuch delikatnie napięty, oddychaj spokojnie. Utrzymaj 8 s, kontrola szyi (patrz w sufit), brak ciągnięcia brody."
        }
      ],
      "cooldown": [
        { 
          "name": "Piriformis/figure-4", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "statycznie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=qgbpYL_NDZ0",
          "description": "Pozycja „4” w leżeniu. Delikatnie przyciągnij udo do siebie do uczucia rozciągania pośladka. Miednica stabilnie, barki rozluźnione. Oddychaj i nie forsuj zakresu."
        },
        { 
          "name": "Oddychanie przeponowe", 
          "sets": "1", 
          "reps_or_time": "2 min", 
          "tempo_or_iso": "spokojny oddech", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=UB3tSaiEbNY",
          "description": "Wdech nosem do brzucha, wydech ustami – długi i rozluźniający. Utrzymuj neutralne lędźwie i miękkość w barkach."
        }
      ]
    },
    {
      "dayNumber": 5,
      "title": "Anty-rotacja + stabilizacja miednicy",
      "duration_estimate_min": 26,
      "duration_estimate_max": 29,
      "warmup": [
        { 
          "name": "Quadruped rock back", 
          "sets": "2", 
          "reps_or_time": "8–10", 
          "tempo_or_iso": "pauza 1–2 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=gNs0QgWiUto",
          "description": "Cofaj biodra do pięt, zachowaj neutral lędźwi. Oddychaj spokojnie, dociśnij dłonie w matę, szyja długa. Nie pozwól na zapadanie barków."
        },
        { 
          "name": "Open book", 
          "sets": "2", 
          "reps_or_time": "8/str.", 
          "tempo_or_iso": "kontrola zakresu", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=720_avYMUDY",
          "description": "Rotacja piersiowa z ustabilizowaną miednicą. Otwórz rękę łagodnym łukiem, oddychaj spokojnie. Zakres bez bólu, powrót płynny."
        }
      ],
      "main": [
        { 
          "name": "Pallof press (½-klęk)", 
          "sets": "3", 
          "reps_or_time": "5/str.", 
          "tempo_or_iso": "izometria 10–12 s", 
          "equipment": "Taśma", 
          "youtube_url": "https://www.youtube.com/watch?v=n8ZZG9gElhs",
          "description": "Pozycja półklęku (kolano pod biodrem, druga stopa z przodu). Miednica poziomo, żebra w dół. Wypchnij uchwyt przed klatkę i trzymaj 10–12 s, nie pozwalaj na skręt tułowia. Oddychaj, wróć kontrolowanie. Zmień strony."
        },
        { 
          "name": "Side plank (wg tolerancji: kolana/stopy krótko)", 
          "sets": "2–3", 
          "reps_or_time": "12–20 s/str.", 
          "tempo_or_iso": "izometria", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=gMMgnm5_QIs",
          "description": "Ustaw podpor boczny w wersji tolerowanej (kolana lub stopy). Utrzymaj linię ciała, napięcie boczne brzucha i pośladków. Jeśli pozycja „ucieka” – skróć czas lub wróć do wersji na kolanach."
        },
        { 
          "name": "Clamshell (z izometrią 2–3 s)", 
          "sets": "2", 
          "reps_or_time": "12/str.", 
          "tempo_or_iso": "pauza w końcu ruchu", 
          "equipment": "Mata/Taśma", 
          "youtube_url": "https://www.youtube.com/watch?v=QJ9Rmst88iE",
          "description": "Unieś kolano do uczucia pracy w pośladku, zatrzymaj 2–3 s. Miednica stabilnie, stopy razem. Powrót wolny. Uważaj, by nie kompensować rotacją tułowia."
        }
      ],
      "cooldown": [
        { 
          "name": "Hip flexor stretch", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "statycznie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=Z-u4RDhWrhc",
          "description": "Półklęk, ogon pod siebie, pośladek napięty. Lekko do przodu, bez przeprostu w lędźwiach. Oddychaj równomiernie."
        },
        { 
          "name": "Hamstring stretch", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "statycznie", 
          "equipment": "Pasek/Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=r7Of03DkVMA",
          "description": "Delikatne rozciąganie tyłu uda w pozycji leżenia lub siadu. Utrzymuj długie plecy, bez wymuszania zakresu. Oddech miarowy."
        }
      ]
    },
    {
      "dayNumber": 6,
      "title": "Gluty + anty-przeprost (kontrola miednicy)",
      "duration_estimate_min": 25,
      "duration_estimate_max": 28,
      "warmup": [
        { 
          "name": "Cat–cow", 
          "sets": "1", 
          "reps_or_time": "8", 
          "tempo_or_iso": "płynnie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=lmKhCTz0y8w",
          "description": "Łagodna mobilizacja kręgosłupa w małym zakresie. Synchronizuj z oddechem, nie dociskaj końcowych pozycji. Utrzymuj barki z dala od uszu."
        },
        { 
          "name": "Quadruped rock back", 
          "sets": "1–2", 
          "reps_or_time": "8", 
          "tempo_or_iso": "pauza 1–2 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=gNs0QgWiUto",
          "description": "Kontrolowany dosiad na pięty przy neutralnych lędźwiach. Oddychaj, trzymaj napięcie brzucha. Bez bólu, bez kołysania miednicy."
        }
      ],
      "main": [
        { 
          "name": "Glute bridge – izometria", 
          "sets": "3", 
          "reps_or_time": "5 × 10–15 s", 
          "tempo_or_iso": "izometria w neutralu", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=PPNCe7nX3Fc",
          "description": "Unieś biodra do linii z udami, napnij pośladki, trzymaj żebra w dół. Utrzymaj 10–15 s, oddech płynny. Opuść wolno. Bez przeprostu w krzyżu."
        },
        { 
          "name": "Bird-dog", 
          "sets": "2", 
          "reps_or_time": "6/str.", 
          "tempo_or_iso": "izometria 8 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=xo7Qpb_NTKE",
          "description": "Wyprostuj przeciwległe kończyny, trzymaj miednicę stabilnie przez ~8 s. Wracaj z kontrolą, oddychaj. Nie unoś kończyn zbyt wysoko."
        },
        { 
          "name": "Dead bug", 
          "sets": "2", 
          "reps_or_time": "8/str.", 
          "tempo_or_iso": "pauza 2–3 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=GbSC02oU3To",
          "description": "Z wydechem oddal rękę i przeciwną nogę, pauza 2–3 s przy stabilnym tułowiu. Wróć powoli, zmień stronę. Jeśli lędźwie odklejają się – zmniejsz zakres."
        }
      ],
      "cooldown": [
        { 
          "name": "Piriformis", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "statycznie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=qgbpYL_NDZ0",
          "description": "Pozycja „figure-4”. Rozciągaj pośladek do uczucia łagodnego napięcia, bez bólu. Miednica i barki rozluźnione, oddech spokojny."
        },
        { 
          "name": "Open book", 
          "sets": "1", 
          "reps_or_time": "8/str.", 
          "tempo_or_iso": "kontrola zakresu", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=720_avYMUDY",
          "description": "Rotacja piersiowa przy stabilnej miednicy. Płynny ruch, wzrok podąża za dłonią. Oddychaj, nie forsuj zakresu."
        }
      ]
    },
    {
      "dayNumber": 7,
      "title": "Delikatny miks + oddech",
      "duration_estimate_min": 24,
      "duration_estimate_max": 27,
      "warmup": [
        { 
          "name": "Oddychanie przeponowe", 
          "sets": "1", 
          "reps_or_time": "2–3 min", 
          "tempo_or_iso": "spokojny oddech", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=UB3tSaiEbNY",
          "description": "Wdech nosem do brzucha, rozszerz żebra na boki; wydech długi ustami, żebra w dół. Barki rozluźnione, szyja miękka. Równy rytm oddechu."
        },
        { 
          "name": "Cat–cow (krótkie zakresy)", 
          "sets": "1", 
          "reps_or_time": "6–8", 
          "tempo_or_iso": "płynnie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=lmKhCTz0y8w",
          "description": "Łagodna zmiana ustawienia kręgosłupa w komfortowym zakresie. Oddech prowadzi ruch. Unikaj przeprostu w lędźwiach i unoszenia barków."
        }
      ],
      "main": [
        { 
          "name": "McGill curl-up", 
          "sets": "2", 
          "reps_or_time": "5", 
          "tempo_or_iso": "izometria 8–10 s", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=3nhAkkzh738",
          "description": "Mikrouniesienie głowy i łopatek przy neutralnych lędźwiach, lekko napięty brzuch. Trzymaj 8–10 s, oddychaj płytko. Odkładaj z kontrolą."
        },
        { 
          "name": "Pallof press (lekka taśma)", 
          "sets": "2", 
          "reps_or_time": "5/str.", 
          "tempo_or_iso": "izometria 8–10 s", 
          "equipment": "Taśma", 
          "youtube_url": "https://www.youtube.com/watch?v=n8ZZG9gElhs",
          "description": "Stań bokiem do oporu, stopy stabilnie. Wypchnij ręce przed klatkę i trzymaj 8–10 s, nie pozwalając na skręt tułowia. Oddychaj, utrzymuj miednicę w neutralu."
        },
        { 
          "name": "Side plank (kolana)", 
          "sets": "2", 
          "reps_or_time": "12–15 s/str.", 
          "tempo_or_iso": "izometria", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=gMMgnm5_QIs",
          "description": "Podpór bokiem na kolanach. Biodra wysoko, brzuch i pośladek napięte. Oddychaj równomiernie, utrzymuj linię ciała bez zapadania barku."
        }
      ],
      "cooldown": [
        { 
          "name": "Hamstring stretch", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "statycznie", 
          "equipment": "Pasek/Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=r7Of03DkVMA",
          "description": "Rozciągaj tył uda w bezbolesnym zakresie. Plecy długie, szyja rozluźniona. Oddech spokojny; nie sprężynuj."
        },
        { 
          "name": "Hip flexor stretch", 
          "sets": "2", 
          "reps_or_time": "30–45 s/str.", 
          "tempo_or_iso": "statycznie", 
          "equipment": "Mata", 
          "youtube_url": "https://www.youtube.com/watch?v=Z-u4RDhWrhc",
          "description": "Półklęk, ogon pod siebie, pośladek napięty. Delikatnie do przodu bez wyginania lędźwi. Oddychaj i utrzymuj rozluźnione barki."
        }
      ]
    }
  ],
  "AcupressureNote": "Mata do akupresury opcjonalnie po treningu 5–10 min (komfort), nie zastępuje ćwiczeń."
};
export { TRAINING_PLAN };