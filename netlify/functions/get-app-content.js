const { Pool } = require('@neondatabase/serverless');
const { getUserIdFromEvent } = require('./_auth-helper.js');
const { buildUserContext, checkExerciseAvailability } = require('./_clinical-rule-engine.js');
const { calculateTiming } = require('./_pacing-engine.js'); // IMPORT NOWEGO SILNIKA (Task B3)

const normalizeEquipment = (rawEquipment) => {
    if (!rawEquipment) return [];

    let items = [];
    if (Array.isArray(rawEquipment)) {
        items = rawEquipment.map(item => String(item).trim());
    } else if (typeof rawEquipment === 'string') {
        items = rawEquipment.split(',').map(item => item.trim());
    } else {
        return [];
    }

    const IGNORE_LIST = ['brak', 'none', 'brak sprzętu', 'masa własna', 'bodyweight', ''];
    const normalizedSet = new Set();

    items.forEach(item => {
        if (IGNORE_LIST.includes(item.toLowerCase())) return;
        const formatted = item.charAt(0).toUpperCase() + item.slice(1);
        normalizedSet.add(formatted);
    });

    return Array.from(normalizedSet);
};

const normalizePainZones = (zones) => {
    if (Array.isArray(zones)) return zones;
    return [];
};

const normalizeArray = (arr) => {
    if (Array.isArray(arr)) return arr;
    return [];
};

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

    // 2. Pobierz Personalizację
    let overrides = {};
    let blockedIds = new Set();
    let clinicalContext = null;

    if (userId) {
      const [overridesResult, blacklistResult, settingsResult] = await Promise.all([
        client.query('SELECT original_exercise_id, replacement_exercise_id FROM user_plan_overrides WHERE user_id = $1', [userId]),
        client.query('SELECT exercise_id, preferred_replacement_id FROM user_exercise_blacklist WHERE user_id = $1', [userId]),
        client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId])
      ]);

      overridesResult.rows.forEach(row => {
        overrides[row.original_exercise_id] = row.replacement_exercise_id;
      });

      blacklistResult.rows.forEach(row => {
        if (row.preferred_replacement_id) {
          overrides[row.exercise_id] = row.preferred_replacement_id;
        } else {
          blockedIds.add(row.exercise_id);
        }
      });

      if (settingsResult.rows.length > 0 && settingsResult.rows[0].settings) {
        const settings = settingsResult.rows[0].settings;
        if (settings.wizardData) {
            clinicalContext = buildUserContext(settings.wizardData);
            blacklistResult.rows.forEach(row => clinicalContext.blockedIds.add(row.exercise_id));
        }
      }
    }

    // 3. Transformacja Ćwiczeń z Walidacją i Normalizacją
    const exercises = exercisesResult.rows.reduce((acc, ex) => {
      const normalizedEquipment = normalizeEquipment(ex.equipment);
      const normalizedZones = normalizePainZones(ex.pain_relief_zones);

      // TASK 1: Mapowanie requires_side_switch
      const requiresSideSwitch = !!ex.requires_side_switch;

      const exForCheck = {
          ...ex,
          is_unilateral: !!ex.is_unilateral,
          requires_side_switch: requiresSideSwitch,
          pain_relief_zones: normalizedZones,
          equipment: normalizedEquipment,
          default_tempo: ex.default_tempo,
          primary_plane: ex.primary_plane || 'multi',
          position: ex.position || null,
          is_foot_loading: !!ex.is_foot_loading,
          impact_level: ex.impact_level || 'low',
          spine_load_level: ex.spine_load_level || 'low',
          knee_load_level: ex.knee_load_level || 'low'
      };

      let isAllowed = true;
      let rejectionReason = null;

      if (clinicalContext) {
          const check = checkExerciseAvailability(exForCheck, clinicalContext, { strictSeverity: false });
          isAllowed = check.allowed;
          rejectionReason = check.reason;
      }

      // --- ZMIANA: Dodanie calculated_timing do Atlasu ---
      // To pozwoli frontendowi "znać" bazowy czas nawet przy manualnym swapie.
      const timing = calculateTiming(exForCheck);

      acc[ex.id] = {
        name: ex.name,
        description: ex.description,
        equipment: normalizedEquipment,
        youtube_url: ex.youtube_url,
        categoryId: ex.category_id,
        difficultyLevel: ex.difficulty_level,
        maxDuration: ex.max_recommended_duration,
        maxReps: ex.max_recommended_reps,
        nextProgressionId: ex.next_progression_id,
        painReliefZones: normalizedZones,

        hasAnimation: !!ex.animation_svg && ex.animation_svg.length > 10,

        defaultTempo: ex.default_tempo || null,
        isUnilateral: ex.is_unilateral || false,
        requiresSideSwitch: requiresSideSwitch, // Explicitly send to frontend
        primaryPlane: ex.primary_plane || 'multi',
        position: ex.position || null,
        isFootLoading: !!ex.is_foot_loading,

        goalTags: normalizeArray(ex.goal_tags),
        metabolicIntensity: ex.metabolic_intensity || 1,
        impactLevel: ex.impact_level || 'low',
        spineLoadLevel: ex.spine_load_level || 'low',
        kneeLoadLevel: ex.knee_load_level || 'low',
        conditioningStyle: ex.conditioning_style || 'none',
        recommendedInterval: ex.recommended_interval_sec || null,

        isAllowed: isAllowed,
        rejectionReason: rejectionReason,

        // DODANO:
        baseRestSeconds: timing.rest_sec,
        baseTransitionSeconds: timing.transition_sec
      };
      return acc;
    }, {});

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercises, training_plans: {} }),
    };

  } catch (error) {
    console.error('Database query error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch content.' }) };
  } finally {
    if (client) client.release();
    await pool.end();
  }
};