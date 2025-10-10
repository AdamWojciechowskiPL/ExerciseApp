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
          "reps_or_time": "3 min",
          "tempo_or_iso": "spokojny oddech 4–6/min",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/watch?v=eXtpk0khmLs",
          "description": "Połóż się na plecach z ugiętymi kolanami. Jedna dłoń na brzuchu, druga na klatce piersiowej. Wdech nosem tak, by unosił się głównie brzuch; wydech przez lekko zaciśnięte usta – żebra opadają. Szyja i barki rozluźnione, lędźwie w neutralnej pozycji. Oddychaj spokojnie, w równym rytmie."
        },
        {
          "name": "Quadruped rock back",
          "sets": "2",
          "reps_or_time": "10",
          "tempo_or_iso": "pauza 2 s w końcu ruchu",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/2T1zLAtpHIQ",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami, kręgosłup neutralnie. Lekko napnij mięśnie głębokie brzucha (ustabilizuj tułów). Cofaj biodra w kierunku pięt bez zaokrąglania lędźwi; zatrzymaj na 2 s i wróć kontrolnie. Głowa w przedłużeniu kręgosłupa, łopatki stabilne."
        }
      ],
      "main": [
        {
          "name": "McGill curl-up",
          "sets": "3",
          "reps_or_time": "6",
          "tempo_or_iso": "izometria 10 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/4TtogRci6ZQ",
          "description": "Leżenie tyłem; jedna noga zgięta, druga wyprostowana. Dłonie pod naturalną lordozą lędźwiową (nie dociskaj pleców). Delikatnie napnij mięśnie brzucha, utrzymaj żebra w dół. Unieś głowę i łopatki o 1–2 cm, nie zginając lędźwi; trzymaj 10 s z płytkim oddechem, opuść powoli."
        },
        {
          "name": "Bird-dog",
          "sets": "3",
          "reps_or_time": "6/str.",
          "tempo_or_iso": "izometria 10 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/J5Filrte5uw",
          "description": "Pozycja na czworaka; kręgosłup i miednica stabilne. Wysuń jednocześnie rękę do przodu i przeciwległą nogę do tyłu do jednej linii z tułowiem; nie kołysz tułowiem. Utrzymaj 10 s, wróć z kontrolą. Pięta aktywnie do tyłu, kciuk do przodu; nie unoś kończyn ponad linię tułowia."
        },
        {
          "name": "Side plank (na kolanach)",
          "sets": "2",
          "reps_or_time": "10 s/str.",
          "tempo_or_iso": "izometria",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/OxUqMcC944g",
          "description": "Leżenie bokiem; łokieć pod barkiem, kolana ugięte. Unieś biodra tak, by bark–biodro–kolano tworzyły linię prostą. Utrzymuj napięcie mięśni brzucha i pośladków, żebra skieruj w dół. Głowa w jednej linii z tułowiem; oddychaj spokojnie."
        }
      ],
      "cooldown": [
        {
          "name": "Hip flexor stretch (klęk półkolanowy)",
          "sets": "2",
          "reps_or_time": "30 s/str.",
          "tempo_or_iso": "rozciąganie statyczne",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/XshgpFfzwAs",
          "description": "Półklęk. Ustaw miednicę w lekkim tyłopochyleniu (jak podwinięcie „ogona”) i napnij pośladek nogi zakrocznej. Przesuń biodra minimalnie do przodu, aż poczujesz rozciąganie z przodu biodra. Plecy neutralnie, żebra w dół; oddychaj spokojnie."
        },
        {
          "name": "Hamstring stretch z taśmą (leżenie)",
          "sets": "2",
          "reps_or_time": "30 s/str.",
          "tempo_or_iso": "rozciąganie statyczne",
          "equipment": "Pasek/Mata",
          "youtube_url": "https://www.youtube.com/shorts/YNfj9bXXoXo",
          "description": "Leżenie tyłem. Załóż pasek na stopę i unieś wyprostowaną nogę do łagodnego rozciągania tylnej części uda. Druga noga zgięta lub wyprostowana – bez bólu w krzyżu. Kostka w lekkim zgięciu grzbietowym. Oddychaj spokojnie; nie ciągnij na siłę."
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
          "sets": "1",
          "reps_or_time": "15 cykli",
          "tempo_or_iso": "płynnie",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/ZsbK-jZOTxM",
          "description": "Klęk podparty: nadgarstki pod barkami, kolana pod biodrami, kręgosłup neutralnie. Na wydechu segmentarnie zaokrąglaj plecy (miednica podwija się, żebra w dół), broda lekko do mostka. Na wdechu łagodnie wróć do ustawienia z lekkim uniesieniem mostka bez zapadania lędźwi. Zakres mały, bez bólu. Unikaj unoszenia barków do uszu i zadzierania głowy."
        },
        {
          "name": "Foam rolling T-spine (nie lędźwie)",
          "sets": "1",
          "reps_or_time": "90 s",
          "tempo_or_iso": "powoli",
          "equipment": "Roller",
          "youtube_url": "https://www.youtube.com/shorts/n42oBoM_b1s",
          "description": "Leżenie tyłem, wałek pod odcinkiem piersiowym. Dłonie pod głową, łokcie lekko zbliżone. Przetaczaj powoli od dolnych kątów łopatek do dolnej krawędzi żeber. Miednica może spoczywać na ziemi; nie roluj lędźwi. Oddychaj spokojnie, zatrzymuj się krótko na napiętych miejscach bez dociskania na siłę."
        }
      ],
      "main": [
        {
          "name": "Dead bug (bazowy)",
          "sets": "2",
          "reps_or_time": "8/str.",
          "tempo_or_iso": "pauza 3 s na wydechu",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/c0hPg8Sv47U",
          "description": "Leżenie tyłem. Biodra i kolana 90°, ręce nad klatką. Utrzymaj żebra w dół i neutralną miednicę (lędźwie nie odrywają się). Na wydechu powoli oddal jedną nogę i przeciwną rękę, zatrzymaj 2–3 s; na wdechu wróć. Zmieniaj strony. Unikaj przeprostu w lędźwiach, unoszenia żeber i pośpiechu; w razie trudności zmniejsz zakres."
        },
        {
          "name": "Pallof press (stanie)",
          "sets": "2",
          "reps_or_time": "6/str.",
          "tempo_or_iso": "izometria 10 s przy wyprostowanych ramionach",
          "equipment": "Taśma",
          "youtube_url": "https://www.youtube.com/shorts/rQ1nEcYvWig",
          "description": "Stań bokiem do zaczepu taśmy, stopy na szerokość bioder, kolana lekko ugięte. Dłonie przy mostku, żebra w dół, napnij mięśnie głębokie brzucha. Wypchnij ręce przed siebie i utrzymaj 10 s bez rotacji tułowia; oddychaj spokojnie. Wróć z kontrolą i zmień stronę. Unikaj kołysania, wysuwania żeber i przeprostu w lędźwiach."
        },
        {
          "name": "Glute bridge – izometria",
          "sets": "3",
          "reps_or_time": "5 × 15 s",
          "tempo_or_iso": "izometria w neutralu",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/_heWM-2yF3s",
          "description": "Leżenie tyłem, kolana ugięte, stopy na szerokość bioder. Delikatnie podwiń miednicę, napnij pośladki i unieś biodra do linii barki–biodra–kolana bez przeprostu w lędźwiach. Utrzymaj 10–15 s, oddychaj swobodnie. Opuść z kontrolą. Unikaj odchylania żeber w górę, zapadania kolan i przenoszenia pracy na odcinek lędźwiowy."
        }
      ],
      "cooldown": [
        {
          "name": "Piriformis",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "rozciąganie statyczne",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/axbdUK3jnmE",
          "description": "Leżenie tyłem. Załóż kostkę jednej nogi na kolano drugiej (kształt „4”). Chwyć udo nogi podporowej i delikatnie przyciągnij do klatki do uczucia rozciągania pośladka. Miednica neutralnie, żebra w dół, barki rozluźnione. Oddychaj spokojnie; nie dociskaj kolana ręką i nie odrywaj krzyża."
        },
        {
          "name": "Oddychanie przeponowe",
          "sets": "1",
          "reps_or_time": "2 min",
          "tempo_or_iso": "spokojny oddech",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/9v_1TbzxpvU",
          "description": "Pozycja leżąca lub siedząca, barki rozluźnione. Jedna dłoń na brzuchu, druga na klatce. Wdech nosem „do brzucha” tak, by dolne żebra rozszerzały się na boki; dłuższy, spokojny wydech ustami – żebra w dół. Równy rytm oddechu, bez unoszenia klatki i napinania szyi."
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
          "reps_or_time": "10",
          "tempo_or_iso": "pauza 2 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/NK2_By5eEmM",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami; kręgosłup i miednica neutralnie. „Żebra w dół”, napnij mięśnie głębokie brzucha, łopatki stabilne. Wdech; z wydechem cofaj biodra w kierunku pięt, ruch z bioder bez zaokrąglania lędźwi; pauza 1–2 s przy pierwszym oporze i powrót. Zakres: bez bólu i bez utraty neutralnej pozycji. Błędy: zapadanie lędźwi, kołysanie miednicy, unoszenie żeber, przenoszenie ciężaru na barki, wstrzymywanie oddechu."
        },
        {
          "name": "Open book (T-spine)",
          "sets": "2",
          "reps_or_time": "8/str.",
          "tempo_or_iso": "kontrola zakresu",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/SKapoHxQxuk",
          "description": "Leżenie bokiem, biodra i kolana zgięte ~90°, ręce wyciągnięte przed klatką. Miednica stabilna, brzuch lekko napięty. Wdech; z wydechem otwieraj górną rękę łukiem za siebie, rotując klatkę piersiową; głowa podąża za dłonią, dolne kolano dociśnięte. Pauza oddechowa i powrót. Zakres: do łagodnego rozciągnięcia bez bólu. Błędy: odrywanie kolan/miednicy, przeprost w lędźwiach, ciągnięcie samą ręką, unoszenie żeber, pośpiech."
        }
      ],
      "main": [
        {
          "name": "Side plank (kolana → stopy jeśli łatwo)",
          "sets": "2",
          "reps_or_time": "20 s/str.",
          "tempo_or_iso": "izometria",
          "equipment": "Mata",
          "youtube_url": "[https://www.youtube.com/shorts/7ACbue6ZfRc",
          "description": "Leżenie bokiem; łokieć pod barkiem, kolana ugięte, stopy w linii z tułowiem. Miednica neutralna, „żebra w dół”, napnij mięśnie głębokie brzucha i pośladek. Unieś biodra do prostej od kolan do barków; szyja wydłużona. Oddychaj spokojnie, utrzymaj napięcie. Wersja trudniejsza: podpór na stopach (linia od kostek do barków). Błędy: zapadanie bioder, wysunięty bark, rotacja tułowia, wstrzymany oddech, wbijanie barku w ucho."
        },
        {
          "name": "Clamshell (opcjonalnie z minibandem)",
          "sets": "2",
          "reps_or_time": "10/str.",
          "tempo_or_iso": "pauza 2 s w górze",
          "equipment": "Mata/Taśma",
          "youtube_url": "https://www.youtube.com/shorts/sNKCdm_AZhE",
          "description": "Leżenie bokiem, biodra i kolana zgięte, stopy razem w linii z tułowiem. Brzuch lekko napięty, miednica stabilna. Wdech; z wydechem unieś górne kolano, nie odrywaj stóp i nie rotuj tułowia; pauza 2 s, powrót wolno. Zakres: do momentu bez kołysania miednicy. Błędy: „otwieranie” biodra do tyłu, rozchylanie stóp, przeprost w lędźwiach, pchanie ruchem z pleców; z taśmą — zapadanie kolan do środka."
        },
        {
          "name": "Bird-dog – dłuższa izometria",
          "sets": "2",
          "reps_or_time": "5/str.",
          "tempo_or_iso": "izometria 10 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/j-cX-4I-1pQ",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami; kręgosłup i miednica neutralnie. „Żebra w dół”, napnij mięśnie głębokie brzucha, łopatki stabilne. Z wydechem wyprostuj przeciwległą rękę i nogę do linii tułowia; trzymaj 8–10 s, oddychając spokojnie, bez rotacji miednicy. Wróć kontrolowanie, zmień stronę. Błędy: unoszenie żeber, przeprost szyi, kołysanie tułowia, przodopochylenie/tyłopochylenie miednicy."
        }
      ],
      "cooldown": [
        {
          "name": "Hip flexor stretch",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "statycznie",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/PGvojsBrZR0",
          "description": "Klęk półkolanowy. Podwiń miednicę („ogon pod siebie”) i napnij pośladek nogi zakrocznej — najpierw uzyskaj rozciąganie z przodu biodra, dopiero potem delikatnie przesuń miednicę do przodu bez przeprostu lędźwi. Tułów wysoki, żebra w dół. Oddychaj spokojnie, wydłużaj wydech. Błędy: wyginanie lędźwi, wypychanie żeber, pochylanie tułowia, brak napięcia pośladka, ból w pachwinie."
        },
        {
          "name": "Hamstring stretch",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "statycznie",
          "equipment": "Pasek/Mata",
          "youtube_url": "https://www.youtube.com/shorts/YNfj9bXXoXo",
          "description": "Leżenie tyłem; jedna noga na podłodze (prosta lub ugięta), druga z paskiem na stopie. Kręgosłup i miednica neutralnie, kolano rozciąganej nogi niemal proste (dopuszczalne mikrozgięcie). Z wydechem unieś nogę do pierwszego oporu, pięta do sufitu, palce lekko do siebie; trzymaj stałe napięcie paska bez szarpania. Oddychaj miarowo 45 s. Błędy: zaokrąglanie lędźwi, przeprost kolana, ból pod kolanem, ciągnięcie barkami."
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
          "name": "Cat–cow",
          "sets": "1",
          "reps_or_time": "15",
          "tempo_or_iso": "płynnie",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/droZedhAz94",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami; kręgosłup i miednica neutralnie. Wdech – delikatnie unieś mostek, rozszerz dolne żebra; wydech – łagodnie zaokrąglij grzbiet, „żebra w dół”, napnij mięśnie głębokie brzucha. Ruch segmentarny, mały zakres, bez bólu. Błędy: przesadny ruch w lędźwiach, unoszenie barków, kołysanie miednicy, wstrzymywanie oddechu."
        },
        {
          "name": "Foam roll T-spine",
          "sets": "1",
          "reps_or_time": "90 s",
          "tempo_or_iso": "powoli",
          "equipment": "Roller",
          "youtube_url": "https://www.youtube.com/shorts/n42oBoM_b1s",
          "description": "Leżenie na plecach, roller poprzecznie pod górnym odcinkiem pleców; dłonie pod głową. „Żebra w dół”, brzuch lekko napięty. Roluj powoli od łopatek do dolnych żeber, zatrzymuj na 1–2 oddechy w tkliwych punktach. Nie zjeżdżaj na lędźwie. Błędy: mostkowanie bez kontroli tułowia, zadzieranie głowy, szybkie szarpane ruchy, dociskanie bólu na siłę."
        }
      ],
      "main": [
        {
          "name": "Dead bug (pauza na wydechu)",
          "sets": "2",
          "reps_or_time": "8/str.",
          "tempo_or_iso": "pauza 3 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/c0hPg8Sv47U",
          "description": "Leżenie tyłem; biodra i kolana 90°, ręce nad barkami. „Żebra w dół”, napnij mięśnie głębokie brzucha; lędźwie blisko podłoża w neutralnym ustawieniu. Z wydechem oddal przeciwną rękę i nogę, zatrzymaj 3 s bez rotacji miednicy; z wdechem wróć. Zakres tak daleki, by lędźwie nie odrywały się. Błędy: przeprost lędźwi, unoszenie żeber, kołysanie miednicy, wstrzymany oddech."
        },
        {
          "name": "McGill curl-up (krótsze serie)",
          "sets": "2",
          "reps_or_time": "5",
          "tempo_or_iso": "izometria 8 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/ywvxPANcA48",
          "description": "Leżenie tyłem; jedna noga ugięta, druga prosta; dłonie pod lędźwiami, by zachować neutralną krzywiznę. „Żebra w dół”, brzuch delikatnie napięty. Uniesienie głowy i łopatek to mikro-ruch; szyja długa, wzrok w sufit. Utrzymaj 8 s, oddychaj spokojnie, opuść kontrolowanie. Błędy: dociskanie lędźwi do podłoża, zbyt duży skłon, ciągnięcie głowy rękami, unoszenie żeber."
        }
      ],
      "cooldown": [
        {
          "name": "Piriformis",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "statycznie",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/mpCt25ZKFHg",
          "description": "Leżenie tyłem; załóż kostkę jednej nogi na udo drugiej (pozycja „4”). Miednica neutralnie, brzuch lekko napięty. Chwyć udo nogi podporowej i przyciągaj do uczucia rozciągania w pośladku; barki rozluźnione, oddychaj równomiernie. Błędy: skręcanie miednicy, dociskanie kolana ręką, ból w pachwinie, napinanie szyi."
        },
        {
          "name": "Oddychanie przeponowe",
          "sets": "1",
          "reps_or_time": "2 min",
          "tempo_or_iso": "spokojny oddech",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/opZMEDlJ8y0",
          "description": "Leżenie tyłem; jedna dłoń na dolnych żebrach, druga na brzuchu; kręgosłup i miednica neutralnie. Wdech nosem – rozszerz dolne żebra i miękko unieś brzuch; powolny wydech przez lekko zaciśnięte usta, „żebra w dół”. Oddech cichy, równy. Błędy: unoszenie barków, napinanie szyi, wypychanie wyłącznie brzucha bez ruchu żeber, hiperwentylacja."
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
          "reps_or_time": "10",
          "tempo_or_iso": "pauza 1–2 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/NK2_By5eEmM",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami, kręgosłup i miednica neutralnie. Napnij mięśnie głębokie brzucha, „żebra w dół”. Cofaj biodra do pięt, utrzymując długie lędźwie; pauza 1–2 s i wróć. Oddychaj spokojnie (wydech w tył). Zakres tylko do lekkiego rozciągania bioder. Błędy: zaokrąglanie lub zapadanie lędźwi, unoszenie barków, kołysanie tułowia."
        },
        {
          "name": "Open book",
          "sets": "2",
          "reps_or_time": "8/str.",
          "tempo_or_iso": "kontrola zakresu",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/k0mwD94LYcc",
          "description": "Leżenie bokiem, biodra i kolana ok. 90°, ramiona wyciągnięte przed sobą; głowa podparta. Ustabilizuj tułów i miednicę. Z wdechem otwieraj górną rękę łukiem za siebie, rotując klatkę piersiową; patrz za dłonią. Z wydechem wróć. Zakres bez bólu, kolana zostają w kontakcie z podłożem. Błędy: ciągnięcie ręką zamiast rotacji piersiowej, unoszenie żeber, rotacja miednicy."
        }
      ],
      "main": [
        {
          "name": "Pallof press (½-klęk)",
          "sets": "3",
          "reps_or_time": "5/str.",
          "tempo_or_iso": "izometria 10–12 s",
          "equipment": "Taśma",
          "youtube_url": "https://www.youtube.com/shorts/oQE1OgcDEeo",
          "description": "Pozycja półklęku: kolano pod biodrem, druga stopa z przodu; taśma zakotwiczona z boku na wysokości mostka. Miednica poziomo, „żebra w dół”, mięśnie głębokie brzucha napięte. Wypchnij uchwyt przed klatkę i utrzymaj 10–12 s, nie dopuszczając do skrętu tułowia; oddychaj swobodnie. Powrót kontrolowany, zmień stronę. Błędy: przeprost w lędźwiach i ucieczka żeber, skręt do kotwicy, kołysanie miednicy."
        },
        {
          "name": "Side plank (wg tolerancji: kolana/stopy krótko)",
          "sets": "2",
          "reps_or_time": "20 s/str.",
          "tempo_or_iso": "izometria",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/sjcgyRMSdgY",
          "description": "Podpór bokiem na przedramieniu, łokieć pod barkiem. Wersja wg tolerancji: kolana ugięte lub stopy jedna na drugiej. Ustaw ciało w linii prostej, biodra wysoko; napnij pośladek i bok brzucha, „żebra w dół”. Oddychaj płynnie; trzymaj 12–20 s. Błędy: opadanie bioder, zapadanie barku, zadzieranie głowy, wstrzymywanie oddechu."
        },
        {
          "name": "Clamshell (z izometrią 2–3 s)",
          "sets": "2",
          "reps_or_time": "12/str.",
          "tempo_or_iso": "pauza w końcu ruchu",
          "equipment": "Mata/Taśma",
          "youtube_url": "https://www.youtube.com/shorts/iF_kTPauoFs",
          "description": "Leżenie bokiem, biodra lekko zgięte, kolana ok. 90°, stopy razem; opcjonalnie taśma nad kolanami. Ustabilizuj miednicę i tułów, napnij mięśnie głębokie brzucha. Unieś górne kolano bez odrywania stóp; pauza 2–3 s; powrót wolno. Oddychaj spokojnie. Zakres do pracy w pośladku, bez rotacji tułowia. Błędy: kołysanie miednicą, rozchodzenie się stóp, ciągnięcie ruchem z przodu uda."
        }
      ],
      "cooldown": [
        {
          "name": "Hip flexor stretch",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "statycznie",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/XshgpFfzwAs",
          "description": "Klęk półkolanowy; „ogon pod siebie”, pośladek nogi zakrocznej napięty, tułów wysoki. Delikatnie przesuń biodra w przód przy neutralnych lędźwiach; możesz unieść ramię po stronie nogi zakrocznej. Oddychaj długim wydechem; trzymaj 30–45 s/str., bez bólu. Błędy: przeprost w lędźwiach, wysuwanie żeber, zbyt duże wysunięcie kolana, brak napięcia pośladka."
        },
        {
          "name": "Hamstring stretch",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "statycznie",
          "equipment": "Pasek/Mata",
          "youtube_url": "https://www.youtube.com/shorts/EO_JVx1najw",
          "description": "Leżenie tyłem; pasek wokół śródstopia ćwiczonej nogi, druga noga prosta na podłodze. „Żebra w dół”, lędźwie neutralnie. Wyprostuj kolano i powoli unieś nogę, aż poczujesz rozciąganie z tyłu uda/łydki; trzymaj 30–45 s, oddychaj spokojnie. Zakres bez bólu i bez ciągnięcia pod kolanem. Błędy: szarpanie paskiem, blokowanie kolana w przeproście, objawy nerwowe."
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
          "youtube_url": "https://www.youtube.com/shorts/Tn4dXCaJHu8",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami; kręgosłup i miednica neutralnie. Wdech – delikatnie unieś mostek i wydłuż odcinek piersiowy; wydech – łagodnie zaokrąglij grzbiet, żebra w dół, niewielkie podwinięcie miednicy. Zakres mały, segmentarny, bez bólu. Oddychaj płynnie. Błędy: dociskanie ruchu w lędźwiach, unoszenie barków, kołysanie miednicy, wstrzymywanie oddechu."
        },
        {
          "name": "Quadruped rock back",
          "sets": "2",
          "reps_or_time": "16",
          "tempo_or_iso": "pauza 1–2 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/NK2_By5eEmM",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami; kręgosłup i miednica neutralnie. Żebra w dół, napnij mięśnie głębokie brzucha, łopatki stabilne. Z wydechem cofaj biodra w kierunku pięt, ruch z bioder bez zaokrąglania ani zapadania lędźwi; pauza 1–2 s i powrót. Zakres bez bólu. Błędy: przeprost lub zaokrąglanie lędźwi, unoszenie barków, kołysanie miednicy."
        }
      ],
      "main": [
        {
          "name": "Glute bridge – izometria",
          "sets": "3",
          "reps_or_time": "5 × 15 s",
          "tempo_or_iso": "izometria w neutralu",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/45OW5NVTDbQ",
          "description": "Leżenie tyłem; stopy na szerokość bioder, kolana ~90°. Delikatnie podwiń miednicę (ogon pod siebie), żebra w dół. Unieś biodra do linii uda–tułów bez przeprostu w lędźwiach; napnij pośladki, kolana stabilnie nad stopami. Utrzymaj 15 s, oddychaj spokojnie; opuść kontrolowanie. Błędy: praca głównie tyłem uda, rozszerzanie żeber, zapadanie kolan, odgięta szyja/przeprost lędźwi."
        },
        {
          "name": "Bird-dog",
          "sets": "2",
          "reps_or_time": "6/str.",
          "tempo_or_iso": "izometria 8 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/j-cX-4I-1pQ",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami; kręgosłup i miednica neutralnie. Żebra w dół, napnij mięśnie głębokie brzucha. Wyprostuj przeciwległą rękę i nogę do linii tułowia; trzymaj ok. 8 s, oddychając spokojnie i bez rotacji miednicy. Wróć kontrolowanie, zmień stronę. Błędy: unoszenie kończyn zbyt wysoko (przeprost lędźwi), zapadanie barku, przeprost szyi, kołysanie tułowia."
        },
        {
          "name": "Dead bug",
          "sets": "2",
          "reps_or_time": "8/str.",
          "tempo_or_iso": "pauza 2–3 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/c0hPg8Sv47U",
          "description": "Leżenie tyłem; biodra i kolana 90°, ręce nad barkami. Żebra w dół, brzuch napięty; lędźwie blisko podłoża w neutralnym ustawieniu. Z wydechem oddal przeciwną rękę i nogę, zatrzymaj 2–3 s bez odrywania lędźwi; z wdechem wróć. Zakres tak daleki, by tułów pozostał stabilny. Błędy: przeprost lędźwi, unoszenie żeber, szarpanie, napięta szyja."
        }
      ],
      "cooldown": [
        {
          "name": "Piriformis",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "statycznie",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/mpCt25ZKFHg",
          "description": "Leżenie tyłem; załóż kostkę jednej nogi na udo drugiej. Miednica neutralnie, brzuch lekko napięty. Chwyć udo nogi podporowej i przyciągaj do uczucia rozciągania w pośladku; barki rozluźnione, oddychaj równomiernie 45 s. Błędy: skręcanie miednicy, dociskanie kolana ręką, ból/ciągnięcie nerwowe pod kolanem."
        },
        {
          "name": "Open book",
          "sets": "1",
          "reps_or_time": "8/str.",
          "tempo_or_iso": "kontrola zakresu",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/k0mwD94LYcc",
          "description": "Leżenie bokiem; biodra i kolana zgięte ~90°, ręce wyciągnięte przed klatką. Ustabilizuj miednicę i „żebra w dół”. Wdech; z wydechem otwieraj górną rękę łukiem za siebie, rotując klatkę piersiową; głowa podąża za dłonią. Pauza oddechowa i powrót. Błędy: odrywanie kolan/miednicy, przeprost w lędźwiach, ciągnięcie samą ręką, pośpiech."
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
          "reps_or_time": "3 min",
          "tempo_or_iso": "spokojny oddech",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/opZMEDlJ8y0",
          "description": "Leżenie tyłem; jedna dłoń na dolnych żebrach, druga na brzuchu; kręgosłup i miednica neutralnie. „Żebra w dół”, szyja i barki rozluźnione. Wdech nosem – rozszerz dolne żebra i łagodnie unieś brzuch; powolny wydech przez lekko zaciśnięte usta. Rytm równy, bez napięcia. Błędy: unoszenie barków, oddychanie tylko klatką, wstrzymywanie oddechu, hiperwentylacja."
        },
        {
          "name": "Cat–cow (krótkie zakresy)",
          "sets": "1",
          "reps_or_time": "8",
          "tempo_or_iso": "płynnie",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/Tn4dXCaJHu8",
          "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami; kręgosłup i miednica neutralnie. Wdech – delikatnie unieś mostek i wydłuż odcinek piersiowy; wydech – łagodnie zaokrąglij grzbiet, „żebra w dół”, małe podwinięcie miednicy. Zakres mały i segmentarny, bez bólu. Błędy: dociskanie ruchu w lędźwiach, unoszenie barków, kołysanie miednicy, pośpiech."
        }
      ],
      "main": [
        {
          "name": "McGill curl-up",
          "sets": "2",
          "reps_or_time": "5",
          "tempo_or_iso": "izometria 10 s",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/ywvxPANcA48",
          "description": "Leżenie tyłem; jedna noga ugięta, druga prosta; dłonie pod lędźwiami dla utrzymania neutralnej krzywizny. „Żebra w dół”, brzuch delikatnie napięty. Unieś lekko głowę i łopatki (mikro-ruch) i utrzymaj ~10 s, oddychając spokojnie; opuść kontrolowanie. Błędy: dociskanie lędźwi do podłoża, zbyt duży skłon, ciągnięcie głowy rękami, unoszenie żeber."
        },
        {
          "name": "Pallof press (lekka taśma)",
          "sets": "2",
          "reps_or_time": "5/str.",
          "tempo_or_iso": "izometria 8–10 s",
          "equipment": "Taśma",
          "youtube_url": "https://www.youtube.com/shorts/oQE1OgcDEeo",
          "description": "Stój bokiem do zakotwiczenia taśmy; stopy na szerokość bioder. Miednica poziomo, „żebra w dół”, napnij mięśnie głębokie brzucha. Wypchnij ręce przed klatkę i utrzymaj 8–10 s bez skrętu tułowia; oddychaj swobodnie, wróć kontrolowanie. Błędy: rotacja w stronę taśmy, przeprost w lędźwiach, wysuwanie żeber, kołysanie miednicy."
        },
        {
          "name": "Side plank (kolana)",
          "sets": "2",
          "reps_or_time": "15 s/str.",
          "tempo_or_iso": "izometria",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/sjcgyRMSdgY",
          "description": "Podpór bokiem na przedramieniu; łokieć pod barkiem, kolana ugięte. Ustaw ciało w linii od kolan do barków; miednica neutralnie, „żebra w dół”, napnij pośladek i bok brzucha. Oddychaj spokojnie i utrzymaj czas. Błędy: opadanie bioder, zapadanie barku, rotacja tułowia, zadzieranie głowy, wstrzymany oddech."
        }
      ],
      "cooldown": [
        {
          "name": "Hamstring stretch",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "statycznie",
          "equipment": "Pasek/Mata",
          "youtube_url": "https://www.youtube.com/shorts/EO_JVx1najw",
          "description": "Leżenie tyłem; pasek na śródstopiu rozciąganej nogi, druga noga na podłodze (prosta lub ugięta). Kręgosłup i miednica neutralnie, „żebra w dół”. Z wydechem unieś nogę do pierwszego oporu; kolano niemal proste (dopuszczalne mikrozgięcie), pięta do sufitu, palce lekko do siebie. Trzymaj 30–45 s, oddychaj spokojnie. Błędy: szarpanie paskiem, przeprost kolana, unoszenie miednicy, ból pod kolanem."
        },
        {
          "name": "Hip flexor stretch",
          "sets": "2",
          "reps_or_time": "45 s/str.",
          "tempo_or_iso": "statycznie",
          "equipment": "Mata",
          "youtube_url": "https://www.youtube.com/shorts/XshgpFfzwAs",
          "description": "Klęk półkolanowy. Podwiń miednicę („ogon pod siebie”) i napnij pośladek nogi zakrocznej, utrzymując neutralne lędźwie i „żebra w dół”. Delikatnie przesuń biodra do przodu do uczucia rozciągania z przodu biodra; oddychaj długim wydechem. Błędy: przeprost w lędźwiach, wysuwanie żeber, pochylanie tułowia, brak napięcia pośladka, ból w pachwinie."
        }
      ]
    }
  ],
  "AcupressureNote": "Mata do akupresury opcjonalnie po treningu 5–10 min (komfort), nie zastępuje ćwiczeń."
};
export { TRAINING_PLAN };