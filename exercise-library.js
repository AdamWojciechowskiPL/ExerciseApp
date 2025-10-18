// exercise-library.js

/**
 * Centralna Biblioteka Ćwiczeń
 * 
 * To jest "jedyne źródło prawdy" o każdym ćwiczeniu. 
 * Każdy obiekt ma unikalne ID (klucz), które jest używane w plikach planów treningowych.
 * Obiekty tutaj zawierają stałe informacje o ćwiczeniu: nazwę, opis, wymagany sprzęt i link do wideo.
 * Parametry takie jak serie, powtórzenia czy tempo są definiowane w planie treningowym.
 */
export const EXERCISE_LIBRARY = {
    // --- ĆWICZENIA ODDECHOWE I MOBILIZACYJNE ---

    "diaphragmaticBreathing": {
        "name": "Oddychanie przeponowe",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/watch?v=eXtpk0khmLs",
        "description": "Połóż się na plecach z ugiętymi kolanami. Jedna dłoń na brzuchu, druga na klatce piersiowej. Wdech nosem tak, by unosił się głównie brzuch; wydech przez lekko zaciśnięte usta – żebra opadają. Szyja i barki rozluźnione, lędźwie w neutralnej pozycji. Oddychaj spokojnie, w równym rytmie."
    },
    "quadrupedRockBack": {
        "name": "Quadruped rock back",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/2T1zLAtpHIQ",
        "description": "Pozycja na czworaka: dłonie pod barkami, kolana pod biodrami, kręgosłup neutralnie. Lekko napnij mięśnie głębokie brzucha (ustabilizuj tułów). Cofaj biodra w kierunku pięt bez zaokrąglania lędźwi; zatrzymaj się i wróć kontrolnie. Głowa w przedłużeniu kręgosłupa, łopatki stabilne."
    },
    "foamRollingTSpine": {
        "name": "Foam rolling T-spine (nie lędźwie)",
        "equipment": "Roller",
        "youtube_url": "https://www.youtube.com/shorts/n42oBoM_b1s",
        "description": "Leżenie na plecach, wałek pod odcinkiem piersiowym. Dłonie pod głową, łokcie lekko zbliżone. Przetaczaj powoli od dolnych kątów łopatek do dolnej krawędzi żeber. Miednica może spoczywać na ziemi; nie roluj lędźwi. Oddychaj spokojnie, zatrzymuj się krótko na napiętych miejscach."
    },
    "openBookTSpine": {
        "name": "Open book (T-spine)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/SKapoHxQxuk",
        "description": "Leżenie bokiem, biodra i kolana zgięte ~90°, ręce wyciągnięte przed klatką. Miednica stabilna, brzuch lekko napięty. Z wydechem otwieraj górną rękę łukiem za siebie, rotując klatkę piersiową; głowa podąża za dłonią, dolne kolano dociśnięte. Pauza oddechowa i powrót."
    },

    // --- ĆWICZENIA WZMACNIAJĄCE CORE (ANTY-ZGIĘCIE, ANTY-PRZEPROST, ANTY-ROTACJA) ---

    "mcgillCurlUp": {
        "name": "McGill curl-up",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/4TtogRci6ZQ",
        "description": "Leżenie na plecach; jedna noga zgięta, druga wyprostowana. Dłonie pod naturalną lordozą lędźwiową (nie dociskaj pleców). Delikatnie napnij mięśnie brzucha. Unieś głowę i łopatki o 1–2 cm, nie zginając lędźwi; trzymaj z płytkim oddechem, opuść powoli."
    },
    "birdDog": {
        "name": "Bird-dog",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/J5Filrte5uw",
        "description": "Pozycja na czworaka; kręgosłup i miednica stabilne. Wysuń jednocześnie rękę do przodu i przeciwległą nogę do tyłu do jednej linii z tułowiem; nie kołysz tułowiem. Utrzymaj pozycję, wróć z kontrolą. Pięta aktywnie do tyłu, kciuk do przodu; nie unoś kończyn ponad linię tułowia."
    },
    "deadBugBasic": {
        "name": "Dead bug (bazowy)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/c0hPg8Sv47U",
        "description": "Leżenie na plecach. Biodra i kolana 90°, ręce nad klatką. Utrzymaj żebra w dół i neutralną miednicę (lędźwie nie odrywają się). Na wydechu powoli oddal jedną nogę i przeciwną rękę; na wdechu wróć. Zmieniaj strony. Unikaj przeprostu w lędźwiach i unoszenia żeber."
    },
    "pallofPressStanding": {
        "name": "Pallof press (stanie)",
        "equipment": "Taśma",
        "youtube_url": "https://www.youtube.com/shorts/rQ1nEcYvWig",
        "description": "Stań bokiem do zaczepu taśmy, stopy na szerokość bioder, kolana lekko ugięte. Dłonie przy mostku, żebra w dół, napnij mięśnie głębokie brzucha. Wypchnij ręce przed siebie i utrzymaj pozycję bez rotacji tułowia; oddychaj spokojnie. Wróć z kontrolą i zmień stronę."
    },
    "pallofPressHalfKneeling": {
        "name": "Pallof press (½-klęk)",
        "equipment": "Taśma",
        "youtube_url": "https://www.youtube.com/shorts/oQE1OgcDEeo",
        "description": "Pozycja półklęku: kolano pod biodrem, druga stopa z przodu; taśma zakotwiczona z boku na wysokości mostka. Miednica poziomo, „żebra w dół”, mięśnie głębokie brzucha napięte. Wypchnij uchwyt przed klatkę i utrzymaj, nie dopuszczając do skrętu tułowia; oddychaj swobodnie."
    },

    // --- ĆWICZENIA WZMACNIAJĄCE POŚLADKI I STABILIZACJĘ BOCZNĄ ---

    "sidePlankKnees": {
        "name": "Side plank (na kolanach)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/OxUqMcC944g",
        "description": "Leżenie bokiem; łokieć pod barkiem, kolana ugięte. Unieś biodra tak, by bark–biodro–kolano tworzyły linię prostą. Utrzymuj napięcie mięśni brzucha i pośladków, żebra skieruj w dół. Głowa w jednej linii z tułowiem; oddychaj spokojnie."
    },
    "sidePlankProgression": {
        "name": "Side plank (progresja kolana/stopy)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/7ACbue6ZfRc",
        "description": "Leżenie bokiem; łokieć pod barkiem. Zacznij z kolanami ugiętymi. Unieś biodra do prostej linii. Jeśli to łatwe, przejdź do wersji z podporą na stopach (ciało w jednej linii od kostek do barków). Utrzymuj biodra wysoko i tułów stabilnie. Oddychaj spokojnie."
    },
    "gluteBridgeIsometric": {
        "name": "Glute bridge – izometria",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/_heWM-2yF3s",
        "description": "Leżenie na plecach, kolana ugięte, stopy na szerokość bioder. Delikatnie podwiń miednicę, napnij pośladki i unieś biodra do linii barki–biodra–kolana bez przeprostu w lędźwiach. Utrzymaj pozycję, oddychaj swobodnie. Opuść z kontrolą. Unikaj odchylania żeber w górę."
    },
    "clamshell": {
        "name": "Clamshell",
        "equipment": "Mata/Taśma",
        "youtube_url": "https://www.youtube.com/shorts/sNKCdm_AZhE",
        "description": "Leżenie bokiem, biodra i kolana zgięte, stopy razem w linii z tułowiem. Opcjonalnie załóż miniband nad kolanami. Brzuch lekko napięty, miednica stabilna. Unieś górne kolano, nie odrywając stóp i nie rotując tułowia; pauza w górze i powrót wolno. Ruch inicjuj z pośladka."
    },

    // --- ĆWICZENIA ROZCIĄGAJĄCE ---

    "hipFlexorStretchHalfKneeling": {
        "name": "Hip flexor stretch (klęk półkolanowy)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/XshgpFfzwAs",
        "description": "Półklęk. Ustaw miednicę w lekkim tyłopochyleniu (jak podwinięcie „ogona”) i napnij pośladek nogi zakrocznej. Przesuń biodra minimalnie do przodu, aż poczujesz rozciąganie przodu biodra. Plecy neutralnie, żebra w dół; unikaj przeprostu w lędźwiach. Oddychaj spokojnie."
    },
    "hamstringStretchWithBandLying": {
        "name": "Hamstring stretch z taśmą (leżenie)",
        "equipment": "Pasek/Mata",
        "youtube_url": "https://www.youtube.com/shorts/YNfj9bXXoXo",
        "description": "Leżenie na plecach. Załóż pasek na stopę i unieś wyprostowaną nogę do łagodnego rozciągania tylnej części uda. Druga noga zgięta lub wyprostowana – bez bólu w krzyżu. Kostka w lekkim zgięciu grzbietowym. Oddychaj spokojnie; nie ciągnij na siłę."
    },
    "piriformisStretch": {
        "name": "Piriformis stretch",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/axbdUK3jnmE",
        "description": "Leżenie na plecach. Załóż kostkę jednej nogi na kolano drugiej (kształt ‘4’). Chwyć udo nogi podporowej i delikatnie przyciągnij do klatki do uczucia rozciągania pośladka. Miednica neutralnie, żebra w dół, barki rozluźnione. Oddychaj spokojnie; nie dociskaj kolana ręką i nie odrywaj krzyża."
    },

    // === NOWE: ASANY Z PLANU JOGI (L/S skolioza, hiperlordoza, L5–S1, haluks) ===

    // --- Pozycje relaksacyjne i mobilizacja kręgosłupa ---
    "yogaChildsPoseBalasana": {
        "name": "Pozycja dziecka (Balasana)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/watch?v=omYNDBYbbu0",
        "description": "Klęk, pośladki na piętach. Z wydechem opuść tułów na uda, czoło na matę. Ręce wyciągnięte w przód lub wzdłuż ciała. Oddychaj w plecy, rozluźnij szyję; utrzymuj brak bólu w lędźwiach (jeśli potrzeba, podłóż koc pod uda/tułów)."
    },
    "yogaCatCow": {
        "name": "Cat-cow (pełne)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/shorts/ZsbK-jZOTxM",
        "description": "Klęk podparty: nadgarstki pod barkami, kolana pod biodrami. Na wdechu opuszczaj brzuch i unoś mostek (krowa), na wydechu segmentarnie zaokrąglaj grzbiet i podwijaj miednicę (kot). Zakres kontrolowany, bez bólu; łącz ruch z oddechem i neutralizuj lędźwie."
    },
    "yogaSupineSpinalTwist": {
        "name": "Leżący skręt kręgosłupa (Jathara Parivartanasana)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/watch?v=Ghb_7W2tb1w",
        "description": "Leżenie na plecach, kolana zgięte. Opuść złączone kolana na bok, barki zostają na macie, głowa w stronę przeciwną. Oddychaj, rozluźniając dolne plecy. Wróć do centrum z wydechem, powtórz na drugą stronę. Podłóż poduszkę pod kolana, jeśli brak pełnego kontaktu z podłogą."
    },
    "yogaHappyBaby": {
        "name": "Pozycja szczęśliwego dziecka (Ananda Balasana)",
        "equipment": "Mata/Pasek",
        "youtube_url": "https://www.youtube.com/watch?v=kuR2BIm3mO4",
        "description": "Leżenie na plecach. Zegnij kolana do klatki, chwyć zewnętrzne krawędzie stóp (lub pasek). Kolana szerzej niż tułów, piszczele pionowo. Delikatnie ciągnij stopy w dół, kierując kość krzyżową do maty; oddychaj spokojnie, możesz lekko kołysać miednicą."
    },

    // --- Pozycje odwrócone / łańcuch tylny ---
    "yogaDownwardDog": {
        "name": "Pies z głową w dół (Adho Mukha Svanasana)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/watch?v=KcXYi7zZ1-Y",
        "description": "Z klęku podpartego unieś kolana i wypchnij biodra w górę/do tyłu do kształtu ‘V’. Dłonie mocno w matę, szyja rozluźniona. Jeśli trzeba ugnij kolana, aby wydłużyć kręgosłup. Priorytet: proste plecy, nie dotykanie piętami podłogi. Oddychaj równomiernie."
    },

    // --- Wzmacnianie core (planki) ---
    "plankForearm": {
        "name": "Deska na przedramionach (Forearm plank)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/watch?v=BjGVnfGk6j8",
        "description": "Podpór na przedramionach i palcach stóp. Ciało w linii prostej od pięt po głowę, miednica lekko podwinięta, brzuch i pośladki napięte. Nie dopuść do opadania bioder ani przeprostu w lędźwiach. Utrzymuj spokojny oddech, wyjdź z pozycji przy utracie techniki."
    },
    
    "plankHigh": {
        "name": "Deska wysoka (na dłoniach, Phalakasana)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/watch?v=nM234df-At8",
        "description": "Podpór przodem na wyprostowanych rękach. Dłonie pod barkami, łopatki aktywne, żebra w dół. Ciało w jednej linii; miednica neutralnie (delikatne tyłopochylenie), szyja w przedłużeniu kręgosłupa. Oddychaj swobodnie, utrzymuj stabilny tułów bez zapadania w lędźwiach."
    },

    // --- Asany stojące / mobilność bioder i stabilizacja miednicy ---
    "yogaWarriorI": {
        "name": "Wojownik I (Virabhadrasana I)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/watch?v=jcPexzdfARQ",
        "description": "Szeroki wykrok, tylna stopa ~45° na ziemi, biodra skierowane na wprost. Zginaj przednie kolano, unieś ręce nad głowę. Podwiń lekko kość ogonową, utrzymuj żebra w dół (bez przeprostu lędźwi). Dociśnij piętę tylnej stopy, oddychaj spokojnie."
    },
    "yogaTriangle": {
        "name": "Pozycja trójkąta (Utthita Trikonasana)",
        "equipment": "Mata/Blok (opcjonalnie)",
        "youtube_url": "https://www.youtube.com/watch?v=k5IQb3Nywvo",
        "description": "Szeroki rozkrok, stopy: przód 90°, tył 15–30°. Z wydechem skłon boczny nad nogą przednią; dolna dłoń na piszczeli/klocku, druga w górze. Tułów w jednej płaszczyźnie (nie pochylaj do przodu), oba kolana wyprostowane (bez przeprostu). Oddychaj, wydłużaj boki tułowia."
    },
    "yogaTreePose": {
        "name": "Pozycja drzewa (Vrksasana)",
        "equipment": "Mata/Ściana (opcjonalnie)",
        "youtube_url": "https://www.youtube.com/watch?v=srvf2tm95UM",
        "description": "Stój na jednej nodze, drugą stopę oprzyj na wewnętrznym udzie lub łydce (nie na kolanie). Dociśnij stopę do uda i udo do stopy; miednica prosto. Ręce nad głową lub w namaste. Utrzymuj równowagę patrząc w stały punkt; ciężar na pięcie i zewnętrznej krawędzi stopy podporowej."
    },
    "yogaToeSquat": {
        "name": "Siad na palcach stóp (Toe squat)",
        "equipment": "Mata",
        "youtube_url": "https://www.youtube.com/watch?v=yoULE1TRebg",
        "description": "Klęk z podwiniętymi palcami stóp, usiądź na piętach utrzymując wszystkie palce podwinięte. Tułów wyprostowany, oddychaj spokojnie. Czuj intensywne rozciąganie podeszw i palców; przerwij przy ostrym bólu. Po ćwiczeniu rozluźnij stopy w pozycji na grzbietach."
    },

    // --- Relaks końcowy ---
    "yogaSavasana": {
        "name": "Savasana (pozycja trupa)",
        "equipment": "Mata/Koc (opcjonalnie)",
        "youtube_url": "https://www.youtube.com/watch?v=QrNkmeoCP2s",
        "description": "Leżenie na plecach, ręce wzdłuż ciała, dłonie ku górze, stopy rozluźnione na boki. Daj ciału opaść w podłoże, wydłuż wydechy. Możesz podłożyć wałek pod kolana, by odciążyć lędźwie. Pozostań bez ruchu, obserwując oddech i rozluźnienie mięśni."
    }
};