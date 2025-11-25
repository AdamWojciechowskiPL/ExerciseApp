// netlify/functions/get-app-content.js
const { Pool } = require('@neondatabase/serverless');
const { getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (!process.env.NETLIFY_DATABASE_URL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server config error' }) };
  }

  const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });
  const client = await pool.connect();

  try {
    // 0. Sprawdź, czy user jest zalogowany (Opcjonalne, ale potrzebne do personalizacji)
    // Jeśli to zapytanie publiczne (bez tokena), zwracamy standardowy plan.
    // Jeśli z tokenem, nakładamy overrides.
    let userId = null;
    try {
        // Próbujemy wyciągnąć ID usera, ale nie blokujemy, jeśli go nie ma
        // (W Twoim kodzie get-app-content było publiczne, ale teraz dodajemy logikę per-user)
        // Jeśli frontend nie wysyła tokena do tego endpointu, trzeba to zmienić w dataStore.js!
        // Zakładam, że dataStore.js doda Authorization header.
        if (event.headers.authorization) {
            userId = await getUserIdFromEvent(event);
        }
    } catch (e) {
        console.warn("Public access to app content (no personalization)");
    }

    // 1. Pobierz Ćwiczenia
    const exercisesResult = await client.query('SELECT * FROM exercises;');
    const exercises = exercisesResult.rows.reduce((acc, ex) => {
      acc[ex.id] = {
        name: ex.name,
        description: ex.description,
        equipment: ex.equipment,
        youtube_url: ex.youtube_url,
        categoryId: ex.category_id,
        difficultyLevel: ex.difficulty_level,
        maxDuration: ex.max_recommended_duration,
        maxReps: ex.max_recommended_reps,
        nextProgressionId: ex.next_progression_id, // Ważne dla progresji
        painReliefZones: ex.pain_relief_zones || [],
        animationSvg: ex.animation_svg || null
      };
      return acc;
    }, {});

    // 2. Pobierz Overrides (Jeśli mamy usera)
    let overrides = {};
    if (userId) {
        const overridesResult = await client.query(
            'SELECT original_exercise_id, replacement_exercise_id FROM user_plan_overrides WHERE user_id = $1',
            [userId]
        );
        overridesResult.rows.forEach(row => {
            overrides[row.original_exercise_id] = row.replacement_exercise_id;
        });
    }

    // 3. Pobierz Plany (i podmień w locie)
    const plansQuery = `
      SELECT
        tp.id as plan_id, tp.name as plan_name, tp.description as plan_description, tp.global_rules,
        pd.day_number, pd.title as day_title,
        de.section, de.sets, de.reps_or_time, de.tempo_or_iso, de.exercise_id
      FROM training_plans tp
      LEFT JOIN plan_days pd ON tp.id = pd.plan_id
      LEFT JOIN day_exercises de ON pd.id = de.day_id
      ORDER BY tp.id, pd.day_number, 
      CASE de.section WHEN 'warmup' THEN 1 WHEN 'main' THEN 2 WHEN 'cooldown' THEN 3 ELSE 4 END, 
      de.order_in_section;
    `;
    const plansResult = await client.query(plansQuery);

    const training_plans = plansResult.rows.reduce((acc, row) => {
      if (row.plan_id && !acc[row.plan_id]) {
        acc[row.plan_id] = {
          name: row.plan_name,
          description: row.plan_description,
          GlobalRules: row.global_rules,
          Days: [],
        };
      }

      if (row.day_number) {
        const plan = acc[row.plan_id];
        let day = plan.Days.find(d => d.dayNumber === row.day_number);
        if (!day) {
          day = { dayNumber: row.day_number, title: row.day_title, warmup: [], main: [], cooldown: [] };
          plan.Days.push(day);
        }

        if (row.exercise_id && day[row.section]) {
            // --- LOGIKA PODMIANY (SMART SWAP) ---
            // Sprawdzamy, czy dla tego ćwiczenia istnieje override
            let finalExerciseId = row.exercise_id;
            let isOverridden = false;

            if (overrides[finalExerciseId]) {
                finalExerciseId = overrides[finalExerciseId];
                isOverridden = true;
            }

            const exerciseRef = {
                exerciseId: finalExerciseId,
                sets: row.sets,
                reps_or_time: row.reps_or_time,
                tempo_or_iso: row.tempo_or_iso,
                isPersonalized: isOverridden // Flaga dla Frontendu (można pokazać ikonkę!)
            };
            day[row.section].push(exerciseRef);
        }
      }
      return acc;
    }, {});
    
    Object.values(training_plans).forEach(plan => {
        plan.Days.sort((a, b) => a.dayNumber - b.dayNumber);
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercises, training_plans }),
    };

  } catch (error) {
    console.error('Database query error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch content.' }) };
  } finally {
    if (client) client.release();
    await pool.end();
  }
};