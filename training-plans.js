// training-plans.js

/**
 * Kolekcja Planów Treningowych
 * 
 * Ten plik definiuje strukturę poszczególnych planów. Każdy plan ma swoje ID, nazwę i opis.
 * Dni treningowe zawierają listy ćwiczeń podzielone na sekcje (rozgrzewka, część główna, schłodzenie).
 * 
 * Kluczowa zmiana: zamiast pełnych obiektów ćwiczeń, używamy tu obiektów referencyjnych, które zawierają:
 * - "exerciseId": Unikalny klucz łączący z ćwiczeniem w pliku `exercise-library.js`.
 * - Parametry wykonania: "sets", "reps_or_time", "tempo_or_iso", które mogą być różne w zależności od planu.
 */
export const TRAINING_PLANS = {
  "l5s1-foundation": {
    "name": "Plan Podstawowy L5-S1 (McGill)",
    "description": "7-dniowy cykl stabilizacyjny oparty o metodę prof. McGilla, skoncentrowany na budowaniu wytrzymałości i kontroli motorycznej tułowia.",
    "GlobalRules": {
      "language": "pl",
      "defaultRestSecondsBetweenSets": 30,
      "defaultRestSecondsBetweenExercises": 60,
      "tempoGuideline": "Powoli 2–3 s w każdej fazie; izometrie według opisu.",
      "lumbarRange": "Zakres środkowy; unikać skrajnej fleksji i przeprostu.",
      "notes": "Neutralny kręgosłup, kontrola miednicy i oddechu."
    },
    "Days": [
      {
        "dayNumber": 1,
        "title": "Stabilizacja bazowa (McGill + anty-przeprost)",
        "warmup": [
          { "exerciseId": "diaphragmaticBreathing", "sets": "1", "reps_or_time": "3 min", "tempo_or_iso": "spokojny oddech 4–6/min" },
          { "exerciseId": "quadrupedRockBack", "sets": "2", "reps_or_time": "10", "tempo_or_iso": "pauza 2 s w końcu ruchu" }
        ],
        "main": [
          { "exerciseId": "mcgillCurlUp", "sets": "3", "reps_or_time": "6", "tempo_or_iso": "izometria 10 s" },
          { "exerciseId": "birdDog", "sets": "3", "reps_or_time": "6/str.", "tempo_or_iso": "izometria 10 s" },
          { "exerciseId": "sidePlankKnees", "sets": "2", "reps_or_time": "10 s/str.", "tempo_or_iso": "izometria" }
        ],
        "cooldown": [
          { "exerciseId": "hipFlexorStretchHalfKneeling", "sets": "2", "reps_or_time": "30 s/str.", "tempo_or_iso": "rozciąganie statyczne" },
          { "exerciseId": "hamstringStretchWithBandLying", "sets": "2", "reps_or_time": "30 s/str.", "tempo_or_iso": "rozciąganie statyczne" }
        ]
      },
      {
        "dayNumber": 2,
        "title": "Anty-rotacja + anty-przeprost (statycznie)",
        "warmup": [
          { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "15 cykli", "tempo_or_iso": "płynnie" },
          { "exerciseId": "foamRollingTSpine", "sets": "1", "reps_or_time": "90 s", "tempo_or_iso": "powoli" }
        ],
        "main": [
          { "exerciseId": "deadBugBasic", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "pauza 3 s na wydechu" },
          { "exerciseId": "pallofPressStanding", "sets": "2", "reps_or_time": "6/str.", "tempo_or_iso": "izometria 10 s przy wyprostowanych ramionach" },
          { "exerciseId": "gluteBridgeIsometric", "sets": "3", "reps_or_time": "5 × 15 s", "tempo_or_iso": "izometria w neutralu" }
        ],
        "cooldown": [
          { "exerciseId": "piriformisStretch", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "rozciąganie statyczne" },
          { "exerciseId": "diaphragmaticBreathing", "sets": "1", "reps_or_time": "2 min", "tempo_or_iso": "spokojny oddech" }
        ]
      },
      {
        "dayNumber": 3,
        "title": "Boczna stabilizacja + biodro (kontrola)",
        "warmup": [
          { "exerciseId": "quadrupedRockBack", "sets": "2", "reps_or_time": "10", "tempo_or_iso": "pauza 2 s" },
          { "exerciseId": "openBookTSpine", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "kontrola zakresu" }
        ],
        "main": [
          { "exerciseId": "sidePlankProgression", "sets": "2", "reps_or_time": "20 s/str.", "tempo_or_iso": "izometria" },
          { "exerciseId": "clamshell", "sets": "2", "reps_or_time": "10/str.", "tempo_or_iso": "pauza 2 s w górze" },
          { "exerciseId": "birdDog", "sets": "2", "reps_or_time": "5/str.", "tempo_or_iso": "izometria 10 s" }
        ],
        "cooldown": [
          { "exerciseId": "hipFlexorStretchHalfKneeling", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "statycznie" },
          { "exerciseId": "hamstringStretchWithBandLying", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "statycznie" }
        ]
      },
      {
        "dayNumber": 4,
        "title": "Reset (mobilność + core w środkowym zakresie)",
        "warmup": [
          { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "15", "tempo_or_iso": "płynnie" },
          { "exerciseId": "foamRollingTSpine", "sets": "1", "reps_or_time": "90 s", "tempo_or_iso": "powoli" }
        ],
        "main": [
          { "exerciseId": "deadBugBasic", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "pauza 3 s" },
          { "exerciseId": "mcgillCurlUp", "sets": "2", "reps_or_time": "5", "tempo_or_iso": "izometria 8 s" }
        ],
        "cooldown": [
          { "exerciseId": "piriformisStretch", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "statycznie" },
          { "exerciseId": "diaphragmaticBreathing", "sets": "1", "reps_or_time": "2 min", "tempo_or_iso": "spokojny oddech" }
        ]
      },
      {
        "dayNumber": 5,
        "title": "Anty-rotacja + stabilizacja miednicy",
        "warmup": [
          { "exerciseId": "quadrupedRockBack", "sets": "2", "reps_or_time": "10", "tempo_or_iso": "pauza 1–2 s" },
          { "exerciseId": "openBookTSpine", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "kontrola zakresu" }
        ],
        "main": [
          { "exerciseId": "pallofPressHalfKneeling", "sets": "3", "reps_or_time": "5/str.", "tempo_or_iso": "izometria 10–12 s" },
          { "exerciseId": "sidePlankProgression", "sets": "2", "reps_or_time": "20 s/str.", "tempo_or_iso": "izometria" },
          { "exerciseId": "clamshell", "sets": "2", "reps_or_time": "12/str.", "tempo_or_iso": "pauza w końcu ruchu" }
        ],
        "cooldown": [
          { "exerciseId": "hipFlexorStretchHalfKneeling", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "statycznie" },
          { "exerciseId": "hamstringStretchWithBandLying", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "statycznie" }
        ]
      },
      {
        "dayNumber": 6,
        "title": "Pośladki + anty-przeprost (kontrola miednicy)",
        "warmup": [
          { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "8", "tempo_or_iso": "płynnie" },
          { "exerciseId": "quadrupedRockBack", "sets": "2", "reps_or_time": "16", "tempo_or_iso": "pauza 1–2 s" }
        ],
        "main": [
          { "exerciseId": "gluteBridgeIsometric", "sets": "3", "reps_or_time": "5 × 15 s", "tempo_or_iso": "izometria w neutralu" },
          { "exerciseId": "birdDog", "sets": "2", "reps_or_time": "6/str.", "tempo_or_iso": "izometria 8 s" },
          { "exerciseId": "deadBugBasic", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "pauza 2–3 s" }
        ],
        "cooldown": [
          { "exerciseId": "piriformisStretch", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "statycznie" },
          { "exerciseId": "openBookTSpine", "sets": "1", "reps_or_time": "8/str.", "tempo_or_iso": "kontrola zakresu" }
        ]
      },
      {
        "dayNumber": 7,
        "title": "Delikatny miks + oddech",
        "warmup": [
          { "exerciseId": "diaphragmaticBreathing", "sets": "1", "reps_or_time": "3 min", "tempo_or_iso": "spokojny oddech" },
          { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "8", "tempo_or_iso": "płynnie" }
        ],
        "main": [
          { "exerciseId": "mcgillCurlUp", "sets": "2", "reps_or_time": "5", "tempo_or_iso": "izometria 10 s" },
          { "exerciseId": "pallofPressStanding", "sets": "2", "reps_or_time": "5/str.", "tempo_or_iso": "izometria 8–10 s" },
          { "exerciseId": "sidePlankKnees", "sets": "2", "reps_or_time": "15 s/str.", "tempo_or_iso": "izometria" }
        ],
        "cooldown": [
          { "exerciseId": "hamstringStretchWithBandLying", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "statycznie" },
          { "exerciseId": "hipFlexorStretchHalfKneeling", "sets": "2", "reps_or_time": "45 s/str.", "tempo_or_iso": "statycznie" }
        ]
      }
    ],
    "AcupressureNote": "Mata do akupresury opcjonalnie po treningu 5–10 min (komfort), nie zastępuje ćwiczeń."
  },

"yoga-l5s1-pain-relief": {
  "name": "Joga L5–S1 – 7 dni przeciwbólowo (skolioza lędźwiowa, hiperlordoza, haluks)",
  "description": "Tygodniowy (ok. 30 min/dzień) plan jogi ukierunkowany na redukcję bólu w okolicy L5–S1: wydłużenie kręgosłupa, kontrola miednicy, rozciąganie zginaczy bioder i tylnej taśmy, stabilizacja boczna; uwzględnia haluks (mobilizacja i wzmocnienie stóp).",
  "GlobalRules": {
    "language": "pl",
    "defaultRestSecondsBetweenSets": 20,
    "defaultRestSecondsBetweenExercises": 45,
    "tempoGuideline": "Ruchy płynne 2–3 s; izometrie 15–30 s zgodnie z opisem; oddech przeponowy 4–6/min.",
    "lumbarRange": "Neutral (wydłużenie); unikać skrajnej fleksji i przeprostu.",
    "notes": "Bez bólu. Priorytet: neutralna miednica, „żebra w dół”, przy rozciąganiu zginaczy bioder lekkie tyłopochylenie miednicy. W Adho Mukha Svanasana ugnij kolana, jeśli to potrzebne, by utrzymać proste plecy."
  },
  "Days": [
    {
      "dayNumber": 1,
      "title": "Ulga i mobilizacja – wydłużenie kręgosłupa",
      "warmup": [
        { "exerciseId": "yogaChildsPoseBalasana", "sets": "1", "reps_or_time": "30 s", "tempo_or_iso": "rozluźnienie, oddech spokojny" },
        { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "10", "tempo_or_iso": "płynnie z oddechem" }
      ],
      "main": [
        { "exerciseId": "yogaDownwardDog", "sets": "3", "reps_or_time": "5 oddechów", "tempo_or_iso": "równy oddech, wydłuż kręgosłup" },
        { "exerciseId": "yogaSupineSpinalTwist", "sets": "2", "reps_or_time": "20 s/str.", "tempo_or_iso": "statycznie, bez bólu" }
      ],
      "cooldown": [
        { "exerciseId": "yogaHappyBaby", "sets": "1", "reps_or_time": "30 s", "tempo_or_iso": "rozluźnienie" }
      ]
    },
    {
      "dayNumber": 2,
      "title": "Stabilizacja – core izometrycznie",
      "warmup": [
        { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "12", "tempo_or_iso": "płynnie" }
      ],
      "main": [
        { "exerciseId": "birdDog", "sets": "3", "reps_or_time": "8/str.", "tempo_or_iso": "izometria 5–8 s na końcu" },
        { "exerciseId": "plankForearm", "sets": "3", "reps_or_time": "20 s", "tempo_or_iso": "izometria" },
        { "exerciseId": "sidePlankProgression", "sets": "2", "reps_or_time": "15 s/str.", "tempo_or_iso": "izometria (przedramię)" }
      ],
      "cooldown": [
        { "exerciseId": "yogaChildsPoseBalasana", "sets": "1", "reps_or_time": "30 s", "tempo_or_iso": "uspokojenie oddechu" }
      ]
    },
    {
      "dayNumber": 3,
      "title": "Otwarcie bioder + pozycje stojące",
      "warmup": [
        { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "8", "tempo_or_iso": "płynnie" },
        { "exerciseId": "yogaDownwardDog", "sets": "1", "reps_or_time": "5 oddechów", "tempo_or_iso": "wydłużenie" }
      ],
      "main": [
        { "exerciseId": "hipFlexorStretchHalfKneeling", "sets": "3", "reps_or_time": "20 s/str.", "tempo_or_iso": "statycznie, miednica w tyłopochyleniu" },
        { "exerciseId": "yogaWarriorI", "sets": "2", "reps_or_time": "20 s/str.", "tempo_or_iso": "statycznie, kontrola żeber" },
        { "exerciseId": "yogaTriangle", "sets": "1", "reps_or_time": "20 s/str.", "tempo_or_iso": "statycznie, jedna płaszczyzna" }
      ],
      "cooldown": [
        { "exerciseId": "yogaToeSquat", "sets": "2", "reps_or_time": "20 s", "tempo_or_iso": "rozciąganie podeszw/palców" }
      ]
    },
    {
      "dayNumber": 4,
      "title": "Core w środkowym zakresie + reset",
      "warmup": [
        { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "10", "tempo_or_iso": "płynnie" }
      ],
      "main": [
        { "exerciseId": "plankHigh", "sets": "3", "reps_or_time": "15 s", "tempo_or_iso": "izometria, żebra w dół" },
        { "exerciseId": "birdDog", "sets": "2", "reps_or_time": "6/str.", "tempo_or_iso": "izometria 8 s" },
        { "exerciseId": "sidePlankKnees", "sets": "2", "reps_or_time": "10 s/str.", "tempo_or_iso": "izometria" }
      ],
      "cooldown": [
        { "exerciseId": "yogaSupineSpinalTwist", "sets": "2", "reps_or_time": "20 s/str.", "tempo_or_iso": "statycznie" },
        { "exerciseId": "yogaChildsPoseBalasana", "sets": "1", "reps_or_time": "30 s", "tempo_or_iso": "relaks" }
      ]
    },
    {
      "dayNumber": 5,
      "title": "Balans i postawa – pozycje stojące + stopy",
      "warmup": [
        { "exerciseId": "yogaDownwardDog", "sets": "1", "reps_or_time": "5 oddechów", "tempo_or_iso": "wydłużenie" }
      ],
      "main": [
        { "exerciseId": "yogaTriangle", "sets": "1", "reps_or_time": "30 s/str.", "tempo_or_iso": "statycznie" },
        { "exerciseId": "yogaWarriorI", "sets": "1", "reps_or_time": "30 s/str.", "tempo_or_iso": "statycznie" },
        { "exerciseId": "yogaTreePose", "sets": "1", "reps_or_time": "30 s/str.", "tempo_or_iso": "balans, stabilna stopa" },
        { "exerciseId": "yogaToeSquat", "sets": "1", "reps_or_time": "30 s", "tempo_or_iso": "rozciąganie podeszw/palucha" }
      ],
      "cooldown": [
        { "exerciseId": "yogaHappyBaby", "sets": "1", "reps_or_time": "30 s", "tempo_or_iso": "rozluźnienie lędźwi/bioder" }
      ]
    },
    {
      "dayNumber": 6,
      "title": "Mobilność bioder + ulga L/S",
      "warmup": [
        { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "10", "tempo_or_iso": "płynnie" },
        { "exerciseId": "yogaDownwardDog", "sets": "1", "reps_or_time": "5 oddechów", "tempo_or_iso": "wydłużenie" }
      ],
      "main": [
        { "exerciseId": "hipFlexorStretchHalfKneeling", "sets": "2", "reps_or_time": "20 s/str.", "tempo_or_iso": "statycznie, miednica w tyłopochyleniu" }
      ],
      "cooldown": [
        { "exerciseId": "yogaHappyBaby", "sets": "1", "reps_or_time": "45 s", "tempo_or_iso": "rozluźnienie" },
        { "exerciseId": "yogaSupineSpinalTwist", "sets": "1", "reps_or_time": "30 s/str.", "tempo_or_iso": "statycznie" },
        { "exerciseId": "yogaSavasana", "sets": "1", "reps_or_time": "2 min", "tempo_or_iso": "bez ruchu, oddech" }
      ]
    },
    {
      "dayNumber": 7,
      "title": "Flow łączony + równowaga",
      "warmup": [
        { "exerciseId": "yogaChildsPoseBalasana", "sets": "1", "reps_or_time": "20 s", "tempo_or_iso": "uspokojenie" },
        { "exerciseId": "yogaCatCow", "sets": "1", "reps_or_time": "5", "tempo_or_iso": "płynnie" }
      ],
      "main": [
        { "exerciseId": "yogaDownwardDog", "sets": "3", "reps_or_time": "5 oddechów", "tempo_or_iso": "flow (3 rundy)" },
        { "exerciseId": "hipFlexorStretchHalfKneeling", "sets": "3", "reps_or_time": "15 s/str.", "tempo_or_iso": "flow (3 rundy)" },
        { "exerciseId": "yogaChildsPoseBalasana", "sets": "3", "reps_or_time": "20 s", "tempo_or_iso": "flow (3 rundy)" },
        { "exerciseId": "yogaTreePose", "sets": "1", "reps_or_time": "30 s/str.", "tempo_or_iso": "balans" },
        { "exerciseId": "birdDog", "sets": "2", "reps_or_time": "6/str.", "tempo_or_iso": "izometria 6–8 s" }
      ],
      "cooldown": [
        { "exerciseId": "yogaHappyBaby", "sets": "1", "reps_or_time": "30 s", "tempo_or_iso": "rozluźnienie" },
        { "exerciseId": "yogaSavasana", "sets": "1", "reps_or_time": "3 min", "tempo_or_iso": "bez ruchu, oddech" }
      ]
    }
  ],
  "AcupressureNote": "Mata do akupresury (opcjonalnie) po treningu 5–10 min – komfortowo, nie zastępuje ćwiczeń."
}
};
