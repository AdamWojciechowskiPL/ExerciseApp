// training-plan.js

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
        { "name": "Oddychanie przeponowe (leżenie)", "sets": "1", "reps_or_time": "2–3 min", "tempo_or_iso": "spokojny oddech 4–6/min", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=UB3tSaiEbNY" },
        { "name": "Quadruped rock back", "sets": "2", "reps_or_time": "8–10", "tempo_or_iso": "pauza 1–2 s w końcu ruchu", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=gNs0QgWiUto" }
      ],
      "main": [
        { "name": "McGill curl-up", "sets": "3", "reps_or_time": "5–6", "tempo_or_iso": "izometria 8–10 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=3nhAkkzh738" },
        { "name": "Bird-dog", "sets": "3", "reps_or_time": "6–8/str.", "tempo_or_iso": "izometria 5–8 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=xo7Qpb_NTKE" },
        { "name": "Side plank (na kolanach)", "sets": "2–3", "reps_or_time": "10–20 s/str.", "tempo_or_iso": "izometria", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=gMMgnm5_QIs" }
      ],
      "cooldown": [
        { "name": "Hip flexor stretch (klęk półkolanowy)", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "rozciąganie statyczne", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=Z-u4RDhWrhc" },
        { "name": "Hamstring stretch z taśmą (leżenie)", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "rozciąganie statyczne", "equipment": "Pasek/Mata", "youtube_url": "https://www.youtube.com/watch?v=r7Of03DkVMA" }
      ]
    },
    {
      "dayNumber": 2,
      "title": "Anty-rotacja + anty-przeprost (statycznie)",
      "duration_estimate_min": 27,
      "duration_estimate_max": 30,
      "warmup": [
        { "name": "Cat–cow (mała amplituda)", "sets": "1–2", "reps_or_time": "6–8 cykli", "tempo_or_iso": "płynnie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=lmKhCTz0y8w" },
        { "name": "Foam rolling T-spine (nie lędźwie)", "sets": "1", "reps_or_time": "60–90 s", "tempo_or_iso": "powoli", "equipment": "Roller", "youtube_url": "https://www.youtube.com/watch?v=PRAJ5HNhc6Q" }
      ],
      "main": [
        { "name": "Dead bug (bazowy)", "sets": "2–3", "reps_or_time": "6–8/str.", "tempo_or_iso": "pauza 2–3 s na wydechu", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=GbSC02oU3To" },
        { "name": "Pallof press (stanie)", "sets": "3", "reps_or_time": "6/str.", "tempo_or_iso": "izometria 10 s przy wyprostowanych ramionach", "equipment": "Taśma", "youtube_url": "https://www.youtube.com/watch?v=n8ZZG9gElhs" },
        { "name": "Glute bridge – izometria", "sets": "3", "reps_or_time": "5 × 10–15 s", "tempo_or_iso": "izometria w neutralu", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=PPNCe7nX3Fc" }
      ],
      "cooldown": [
        { "name": "Piriformis/figure-4 (leżenie)", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "rozciąganie statyczne", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=qgbpYL_NDZ0" },
        { "name": "Oddychanie przeponowe", "sets": "1", "reps_or_time": "2 min", "tempo_or_iso": "spokojny oddech", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=UB3tSaiEbNY" }
      ]
    },
    {
      "dayNumber": 3,
      "title": "Boczna stabilizacja + biodro (kontrola)",
      "duration_estimate_min": 25,
      "duration_estimate_max": 28,
      "warmup": [
        { "name": "Quadruped rock back", "sets": "2", "reps_or_time": "8–10", "tempo_or_iso": "pauza 1–2 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=gNs0QgWiUto" },
        { "name": "Open book (T-spine)", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "kontrola zakresu", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=720_avYMUDY" }
      ],
      "main": [
        { "name": "Side plank (kolana → stopy jeśli łatwo)", "sets": "3", "reps_or_time": "12–20 s/str.", "tempo_or_iso": "izometria", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=gMMgnm5_QIs" },
        { "name": "Clamshell (opcjonalnie z minibandem)", "sets": "2–3", "reps_or_time": "10/str.", "tempo_or_iso": "pauza 2 s w górze", "equipment": "Mata/Taśma", "youtube_url": "https://www.youtube.com/watch?v=QJ9Rmst88iE" },
        { "name": "Bird-dog – dłuższa izometria", "sets": "2", "reps_or_time": "5/str.", "tempo_or_iso": "izometria 8–10 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=xo7Qpb_NTKE" }
      ],
      "cooldown": [
        { "name": "Hip flexor stretch", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "statycznie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=Z-u4RDhWrhc" },
        { "name": "Hamstring stretch", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "statycznie", "equipment": "Pasek/Mata", "youtube_url": "https://www.youtube.com/watch?v=r7Of03DkVMA" }
      ]
    },
    {
      "dayNumber": 4,
      "title": "Reset (mobilność + core w środkowym zakresie)",
      "duration_estimate_min": 24,
      "duration_estimate_max": 27,
      "warmup": [
        { "name": "Cat–cow (kontrola segmentarna)", "sets": "1–2", "reps_or_time": "6–8", "tempo_or_iso": "płynnie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=lmKhCTz0y8w" },
        { "name": "Foam roll T-spine", "sets": "1", "reps_or_time": "60–90 s", "tempo_or_iso": "powoli", "equipment": "Roller", "youtube_url": "https://www.youtube.com/watch?v=PRAJ5HNhc6Q" }
      ],
      "main": [
        { "name": "Dead bug (pauza na wydechu)", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "pauza 3 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=GbSC02oU3To" },
        { "name": "McGill curl-up (krótsze serie)", "sets": "2", "reps_or_time": "5", "tempo_or_iso": "izometria 8 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=3nhAkkzh738" }
      ],
      "cooldown": [
        { "name": "Piriformis/figure-4", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "statycznie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=qgbpYL_NDZ0" },
        { "name": "Oddychanie przeponowe", "sets": "1", "reps_or_time": "2 min", "tempo_or_iso": "spokojny oddech", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=UB3tSaiEbNY" }
      ]
    },
    {
      "dayNumber": 5,
      "title": "Anty-rotacja + stabilizacja miednicy",
      "duration_estimate_min": 26,
      "duration_estimate_max": 29,
      "warmup": [
        { "name": "Quadruped rock back", "sets": "2", "reps_or_time": "8–10", "tempo_or_iso": "pauza 1–2 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=gNs0QgWiUto" },
        { "name": "Open book", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "kontrola zakresu", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=720_avYMUDY" }
      ],
      "main": [
        { "name": "Pallof press (½-klęk)", "sets": "3", "reps_or_time": "5/str.", "tempo_or_iso": "izometria 10–12 s", "equipment": "Taśma", "youtube_url": "https://www.youtube.com/watch?v=n8ZZG9gElhs" },
        { "name": "Side plank (wg tolerancji: kolana/stopy krótko)", "sets": "2–3", "reps_or_time": "12–20 s/str.", "tempo_or_iso": "izometria", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=gMMgnm5_QIs" },
        { "name": "Clamshell (z izometrią 2–3 s)", "sets": "2", "reps_or_time": "12/str.", "tempo_or_iso": "pauza w końcu ruchu", "equipment": "Mata/Taśma", "youtube_url": "https://www.youtube.com/watch?v=QJ9Rmst88iE" }
      ],
      "cooldown": [
        { "name": "Hip flexor stretch", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "statycznie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=Z-u4RDhWrhc" },
        { "name": "Hamstring stretch", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "statycznie", "equipment": "Pasek/Mata", "youtube_url": "https://www.youtube.com/watch?v=r7Of03DkVMA" }
      ]
    },
    {
      "dayNumber": 6,
      "title": "Gluty + anty-przeprost (kontrola miednicy)",
      "duration_estimate_min": 25,
      "duration_estimate_max": 28,
      "warmup": [
        { "name": "Cat–cow", "sets": "1", "reps_or_time": "8", "tempo_or_iso": "płynnie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=lmKhCTz0y8w" },
        { "name": "Quadruped rock back", "sets": "1–2", "reps_or_time": "8", "tempo_or_iso": "pauza 1–2 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=gNs0QgWiUto" }
      ],
      "main": [
        { "name": "Glute bridge – izometria", "sets": "3", "reps_or_time": "5 × 10–15 s", "tempo_or_iso": "izometria w neutralu", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=PPNCe7nX3Fc" },
        { "name": "Bird-dog", "sets": "2", "reps_or_time": "6/str.", "tempo_or_iso": "izometria 8 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=xo7Qpb_NTKE" },
        { "name": "Dead bug", "sets": "2", "reps_or_time": "8/str.", "tempo_or_iso": "pauza 2–3 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=GbSC02oU3To" }
      ],
      "cooldown": [
        { "name": "Piriformis", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "statycznie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=qgbpYL_NDZ0" },
        { "name": "Open book", "sets": "1", "reps_or_time": "8/str.", "tempo_or_iso": "kontrola zakresu", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=720_avYMUDY" }
      ]
    },
    {
      "dayNumber": 7,
      "title": "Delikatny miks + oddech",
      "duration_estimate_min": 24,
      "duration_estimate_max": 27,
      "warmup": [
        { "name": "Oddychanie przeponowe", "sets": "1", "reps_or_time": "2–3 min", "tempo_or_iso": "spokojny oddech", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=UB3tSaiEbNY" },
        { "name": "Cat–cow (krótkie zakresy)", "sets": "1", "reps_or_time": "6–8", "tempo_or_iso": "płynnie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=lmKhCTz0y8w" }
      ],
      "main": [
        { "name": "McGill curl-up", "sets": "2", "reps_or_time": "5", "tempo_or_iso": "izometria 8–10 s", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=3nhAkkzh738" },
        { "name": "Pallof press (lekka taśma)", "sets": "2", "reps_or_time": "5/str.", "tempo_or_iso": "izometria 8–10 s", "equipment": "Taśma", "youtube_url": "https://www.youtube.com/watch?v=n8ZZG9gElhs" },
        { "name": "Side plank (kolana)", "sets": "2", "reps_or_time": "12–15 s/str.", "tempo_or_iso": "izometria", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=gMMgnm5_QIs" }
      ],
      "cooldown": [
        { "name": "Hamstring stretch", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "statycznie", "equipment": "Pasek/Mata", "youtube_url": "https://www.youtube.com/watch?v=r7Of03DkVMA" },
        { "name": "Hip flexor stretch", "sets": "2", "reps_or_time": "30–45 s/str.", "tempo_or_iso": "statycznie", "equipment": "Mata", "youtube_url": "https://www.youtube.com/watch?v=Z-u4RDhWrhc" }
      ]
    }
  ],
  "AcupressureNote": "Mata do akupresury opcjonalnie po treningu 5–10 min (komfort), nie zastępuje ćwiczeń."
};