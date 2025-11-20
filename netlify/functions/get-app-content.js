// netlify/functions/get-app-content.js

// Importujemy klienta bazy danych Neon.
// Ta funkcja nie używa _auth-helper.js, ponieważ jej zawartość jest publiczna
// i musi być dostępna przed zalogowaniem użytkownika.
const { Pool } = require('@neondatabase/serverless');

// Główna funkcja handler dla Netlify.
exports.handler = async (event) => {
  // Sprawdzamy, czy connection string do bazy danych jest dostępny w zmiennych środowiskowych.
  if (!process.env.NETLIFY_DATABASE_URL) {
    console.error('Database URL is not set.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error.' }),
    };
  }

  // Tworzymy nową pulę połączeń.
  const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });
  const client = await pool.connect();

  try {
    // === KROK 1: POBRANIE WSZYSTKICH ĆWICZEŃ ===
    // Proste zapytanie, które pobiera wszystkie rekordy z tabeli exercises.
    const exercisesResult = await client.query('SELECT * FROM exercises;');
    
    // Przekształcamy tablicę ćwiczeń w obiekt, gdzie kluczem jest ID ćwiczenia.
    // To jest format, którego oczekuje frontend (identyczny jak w starym pliku exercise-library.js).
    const exercises = exercisesResult.rows.reduce((acc, exercise) => {
      acc[exercise.id] = {
        // Stare pola
        name: exercise.name,
        description: exercise.description,
        equipment: exercise.equipment,
        youtube_url: exercise.youtube_url,
        
        // --- NOWE POLA (TASK-03 - EPIK 1) ---
        categoryId: exercise.category_id,
        difficultyLevel: exercise.difficulty_level,
        maxDuration: exercise.max_recommended_duration,
        maxReps: exercise.max_recommended_reps,
        nextProgressionId: exercise.next_progression_id,
        painReliefZones: exercise.pain_relief_zones || [] // Zwracamy pustą tablicę, jeśli null
        // ------------------------------------
      };
      return acc;
    }, {});

    // === KROK 2: POBRANIE WSZYSTKICH PLANÓW TRENINGOWYCH (ZŁOŻONE ZAPYTANIE) ===
    // To jedno, zoptymalizowane zapytanie SQL łączy 4 tabele, aby pobrać
    // wszystkie potrzebne dane za jednym razem. Zwraca płaską listę wierszy,
    // posortowaną w sposób ułatwiający późniejszą rekonstrukcję.
    const plansQuery = `
      SELECT
        tp.id as plan_id,
        tp.name as plan_name,
        tp.description as plan_description,
        tp.global_rules,
        pd.day_number,
        pd.title as day_title,
        de.section,
        de.sets,
        de.reps_or_time,
        de.tempo_or_iso,
        de.exercise_id
      FROM
        training_plans tp
      LEFT JOIN
        plan_days pd ON tp.id = pd.plan_id
      LEFT JOIN
        day_exercises de ON pd.id = de.day_id
      ORDER BY
        tp.id,
        pd.day_number,
        -- Używamy CASE, aby zapewnić prawidłową kolejność sekcji.
        CASE de.section
          WHEN 'warmup' THEN 1
          WHEN 'main' THEN 2
          WHEN 'cooldown' THEN 3
          ELSE 4
        END,
        de.order_in_section;
    `;
    const plansResult = await client.query(plansQuery);

    // === KROK 3: REKONSTRUKCJA STRUKTURY JSON Z PŁASKIEJ ODPOWIEDZI BAZY DANYCH ===
    // W tym kroku "nawadniamy" dane, przekształcając płaską tablicę z SQL
    // w zagnieżdżoną strukturę obiektów, której oczekuje frontend.
    const training_plans = plansResult.rows.reduce((acc, row) => {
      // Jeśli dany plan nie istnieje jeszcze w naszym obiekcie wynikowym, tworzymy go.
      if (row.plan_id && !acc[row.plan_id]) {
        acc[row.plan_id] = {
          name: row.plan_name,
          description: row.plan_description,
          GlobalRules: row.global_rules,
          Days: [],
        };
      }

      // Jeśli wiersz zawiera dane dnia (niektóre plany mogą być puste), przetwarzamy je.
      if (row.day_number) {
        const plan = acc[row.plan_id];
        // Szukamy, czy dzień o danym numerze już istnieje w planie.
        let day = plan.Days.find(d => d.dayNumber === row.day_number);

        // Jeśli nie, tworzymy go.
        if (!day) {
          day = {
            dayNumber: row.day_number,
            title: row.day_title,
            warmup: [],
            main: [],
            cooldown: [],
          };
          plan.Days.push(day);
        }

        // Jeśli wiersz zawiera dane o ćwiczeniu, tworzymy obiekt referencyjny
        // i dodajemy go do odpowiedniej sekcji ('warmup', 'main' lub 'cooldown').
        if (row.exercise_id && day[row.section]) {
          const exerciseRef = {
            exerciseId: row.exercise_id,
            sets: row.sets,
            reps_or_time: row.reps_or_time,
            tempo_or_iso: row.tempo_or_iso,
          };
          day[row.section].push(exerciseRef);
        }
      }
      return acc;
    }, {});
    
    // Na koniec sortujemy dni w każdym planie na wypadek, gdyby ORDER BY w SQL nie wystarczył.
    Object.values(training_plans).forEach(plan => {
        plan.Days.sort((a, b) => a.dayNumber - b.dayNumber);
    });

    // === KROK 4: ZWROT POPRAWNEJ ODPOWIEDZI ===
    // Zwracamy obiekt zawierający dwie główne właściwości: `exercises` i `training_plans`.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercises, training_plans }),
    };

  } catch (error) {
    // W przypadku błędu bazy danych, logujemy go i zwracamy odpowiedź 500.
    console.error('Database query error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch application content.' }),
    };
  } finally {
    // Niezależnie od wyniku, zawsze zwalniamy połączenie z bazą.
    if (client) {
      client.release();
    }
    // Zamykamy pulę, aby zapobiec "wiszącym" połączeniom w środowisku serverless.
    await pool.end();
  }
};