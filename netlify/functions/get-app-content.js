// netlify/functions/get-app-content.js
const { Pool } = require('@neondatabase/serverless');
const { getUserIdFromEvent } = require('./_auth-helper.js');
const { buildUserContext, checkExerciseAvailability } = require('./_clinical-rule-engine.js');

exports.handler = async (event) => {
  if (!process.env.NETLIFY_DATABASE_URL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server config error' }) };
  }

  const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });
  const client = await pool.connect();

  try {
    let userId = null;
    try {
      if (event.headers.authorization) {
        userId = await getUserIdFromEvent(event);
      }
    } catch (e) {
      console.warn("Public access to app content (no personalization)");
    }

    // 1. Pobierz Ćwiczenia
    const exercisesResult = await client.query('SELECT * FROM exercises;');
    
    // 2. Pobierz Personalizację (Overrides, Blacklist, Settings/WizardData)
    let overrides = {};
    let blockedIds = new Set();
    let clinicalContext = null;

    if (userId) {
      // Pobieramy wszystko równolegle dla wydajności
      const [overridesResult, blacklistResult, settingsResult] = await Promise.all([
        client.query('SELECT original_exercise_id, replacement_exercise_id FROM user_plan_overrides WHERE user_id = $1', [userId]),
        client.query('SELECT exercise_id, preferred_replacement_id FROM user_exercise_blacklist WHERE user_id = $1', [userId]),
        client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId])
      ]);

      // Obsługa Overrides
      overridesResult.rows.forEach(row => {
        overrides[row.original_exercise_id] = row.replacement_exercise_id;
      });

      // Obsługa Blacklisty
      blacklistResult.rows.forEach(row => {
        if (row.preferred_replacement_id) {
          overrides[row.exercise_id] = row.preferred_replacement_id;
        } else {
          blockedIds.add(row.exercise_id);
        }
      });

      // Budowanie Kontekstu Klinicznego (Wizard Data)
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].settings) {
        const settings = settingsResult.rows[0].settings;
        if (settings.wizardData) {
            clinicalContext = buildUserContext(settings.wizardData);
            // Dodajemy blacklistę do kontekstu klinicznego
            blacklistResult.rows.forEach(row => clinicalContext.blockedIds.add(row.exercise_id));
        }
      }
    }

    // 3. Transformacja Ćwiczeń z Walidacją
    const exercises = exercisesResult.rows.reduce((acc, ex) => {
      // Przygotowanie obiektu do analizy (normalizacja pól)
      const exForCheck = {
          ...ex,
          is_unilateral: !!ex.is_unilateral,
          pain_relief_zones: ex.pain_relief_zones || [],
          equipment: ex.equipment ? ex.equipment.split(',').map(e => e.trim().toLowerCase()) : [],
          default_tempo: ex.default_tempo,
          primary_plane: ex.primary_plane || 'multi',
          position: ex.position || null
      };

      // Domyślnie dozwolone, chyba że kontekst kliniczny zabroni
      let isAllowed = true;
      let rejectionReason = null;

      if (clinicalContext) {
          // Używamy silnika regułowego
          // strictSeverity: false -> w widoku Atlasu nie chcemy ukrywać wszystkiego jak leci w trybie ostrym, 
          // chyba że frontend o to poprosi. Ale dla generatora protokołów lepiej wiedzieć co jest "safe".
          // Ustalmy: Zwracamy flagę isSafeClinical (czy pasuje do kontuzji) i isAvailableEquipment.
          
          const check = checkExerciseAvailability(exForCheck, clinicalContext, { strictSeverity: false });
          isAllowed = check.allowed;
          rejectionReason = check.reason;
      }

      acc[ex.id] = {
        name: ex.name,
        description: ex.description,
        equipment: ex.equipment,
        youtube_url: ex.youtube_url,
        categoryId: ex.category_id,
        difficultyLevel: ex.difficulty_level,
        maxDuration: ex.max_recommended_duration,
        maxReps: ex.max_recommended_reps,
        nextProgressionId: ex.next_progression_id,
        painReliefZones: ex.pain_relief_zones || [],
        animationSvg: ex.animation_svg || null,
        defaultTempo: ex.default_tempo || null,
        isUnilateral: ex.is_unilateral || false,
        primaryPlane: ex.primary_plane || 'multi',
        position: ex.position || null,
        
        // NOWE POLA DLA FRONTENDU
        isAllowed: isAllowed,
        rejectionReason: rejectionReason
      };
      return acc;
    }, {});

    // 4. Pobierz i Zbuduj Plan (Stara logika bez zmian)
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
          let finalExerciseId = row.exercise_id;
          let isOverridden = false;

          if (overrides[finalExerciseId]) {
            finalExerciseId = overrides[finalExerciseId];
            isOverridden = true;
          }

          if (blockedIds.has(finalExerciseId)) {
            return acc;
          }

          const exerciseRef = {
            exerciseId: finalExerciseId,
            sets: row.sets,
            reps_or_time: row.reps_or_time,
            tempo_or_iso: row.tempo_or_iso,
            isPersonalized: isOverridden
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