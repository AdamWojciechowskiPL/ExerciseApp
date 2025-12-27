// netlify/functions/generate-plan.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { buildUserContext, checkExerciseAvailability } = require('./_clinical-rule-engine.js');

const MAX_MAIN_OCCURRENCES_PER_WEEK = 4;
const MAX_ROTATIONAL_CORE_WITH_DISC_HERNIATION = 3;
const MAX_ROTATION_MOBILITY_WITH_DISC_HERNIATION = 4;

const CATEGORY_WEIGHTS = {
    'breathing': 1.0,
    'spine_mobility': 1.0,
    'hip_mobility': 1.0,
    'glute_activation': 1.0,
    'core_anti_extension': 1.0,
    'core_anti_rotation': 1.0,
    'core_anti_flexion': 1.0,
    'core_anti_lateral_flexion': 1.0,
    'nerve_flossing': 0.0,
    'conditioning_low_impact': 0.5
};

const BREATHING_CATEGORIES = ['breathing', 'breathing_control', 'muscle_relaxation'];

// --- HELPER: NORMALIZACJA SPRZĘTU (BEZ TŁUMACZENIA) ---
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

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const userId = await getUserIdFromEvent(event);
        const userData = JSON.parse(event.body);

        if (userData && userData.can_generate_plan === false) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'PLAN_GENERATION_BLOCKED_BY_CLINICAL_RULES' })
            };
        }

        // --- POBIERANIE USTAWIEŃ CZASOWYCH Z PAYLOADU USERA ---
        // (Jeśli brak, używamy bezpiecznych wartości domyślnych)
        const SECONDS_PER_REP = userData.secondsPerRep || 6;
        const REST_BETWEEN_SETS = userData.restBetweenSets || 30;
        const REST_BETWEEN_EXERCISES = userData.restBetweenExercises || 30;

        // --- DEFINICJA FUNKCJI ESTYMUJĄCEJ (Z DOMKNIĘCIEM NA ZMIENNE) ---
        // Musi być wewnątrz handler, aby widzieć powyższe zmienne
        function estimateDurationSeconds(session) {
            let totalSeconds = 0;
            const allExercises = [...session.warmup, ...session.main, ...session.cooldown];

            allExercises.forEach((ex, index) => {
                const sets = parseInt(ex.sets);

                // Wykrywanie unilateral aby policzyć czas x2 (L+R)
                const isUnilateral = ex.is_unilateral || (ex.reps_or_time && String(ex.reps_or_time).includes('/str'));
                const multiplier = isUnilateral ? 2 : 1;

                let workTimePerSet = 0;
                const text = String(ex.reps_or_time).toLowerCase();

                if (text.includes('s') || text.includes('min')) {
                    // Czas: Pobieramy wartość
                    const val = parseInt(text) || 30;
                    const isMin = text.includes('min');
                    workTimePerSet = isMin ? val * 60 : val;
                } else {
                    // Reps: Używamy dynamicznego SECONDS_PER_REP
                    const reps = parseInt(text) || 10;
                    workTimePerSet = reps * SECONDS_PER_REP;
                }

                // Całkowity czas pracy
                totalSeconds += sets * workTimePerSet * multiplier;

                // Przerwy: (Ilość wykonanych serii - 1) * Przerwa
                const totalExecutions = sets * multiplier;
                if (totalExecutions > 1) {
                    totalSeconds += (totalExecutions - 1) * REST_BETWEEN_SETS;
                }

                // Przerwa po ćwiczeniu
                if (index < allExercises.length - 1) totalSeconds += REST_BETWEEN_EXERCISES;
            });

            return totalSeconds;
        }

        function optimizeSessionDuration(session, targetMin) {
            const targetSeconds = targetMin * 60;
            let estimatedSeconds = estimateDurationSeconds(session);

            if (estimatedSeconds > targetSeconds + 300) {
                while (session.main.length > 1 && estimatedSeconds > targetSeconds + 300) {
                    session.main.pop();
                    estimatedSeconds = estimateDurationSeconds(session);
                }
            }

            let attempts = 0;
            while (estimatedSeconds > targetSeconds * 1.15 && attempts < 5) {
                let reductionMade = false;
                for (let ex of session.main) {
                    if (BREATHING_CATEGORIES.includes(ex.category_id)) continue;
                    const sets = parseInt(ex.sets);
                    if (ex.is_unilateral) { if (sets >= 4) { ex.sets = String(sets - 2); reductionMade = true; } }
                    else { if (sets > 1) { ex.sets = String(sets - 1); reductionMade = true; } }
                }
                if (!reductionMade) {
                    [...session.warmup, ...session.main, ...session.cooldown].forEach(ex => {
                        const text = String(ex.reps_or_time);
                        const val = parseInt(text);
                        if (!isNaN(val)) {
                            const isBreathing = BREATHING_CATEGORIES.includes(ex.category_id);
                            const minLimit = isBreathing ? 45 : 5;
                            let newVal = Math.max(minLimit, Math.floor(val * 0.85));
                            if (isBreathing) newVal = Math.ceil(newVal / 15) * 15;
                            ex.reps_or_time = text.replace(val, newVal);
                        }
                    });
                }
                estimatedSeconds = estimateDurationSeconds(session);
                attempts++;
            }
        }

        function expandSessionDuration(session, targetMin) {
            const targetSeconds = targetMin * 60;
            let estimatedSeconds = estimateDurationSeconds(session);
            if (estimatedSeconds < targetSeconds * 0.8) {
                let attempts = 0;
                const maxSets = 5;
                while (estimatedSeconds < targetSeconds * 0.9 && attempts < 10) {
                    let expansionMade = false;
                    for (let ex of session.main) {
                        if (ex.category_id.startsWith('core_')) continue;

                        if (BREATHING_CATEGORIES.includes(ex.category_id)) continue;
                        const sets = parseInt(ex.sets);
                        if (sets < maxSets) {
                            if (ex.is_unilateral) { if (sets + 2 <= maxSets) { ex.sets = String(sets + 2); expansionMade = true; } }
                            else { ex.sets = String(sets + 1); expansionMade = true; }
                        }
                    }
                    if (!expansionMade) break;
                    estimatedSeconds = estimateDurationSeconds(session);
                    attempts++;
                }
            }
        }

        const client = await pool.connect();
        try {
            // 1. POBRANIE DANYCH
            const [exercisesResult, blacklistResult] = await Promise.all([
                client.query('SELECT * FROM exercises'),
                client.query('SELECT exercise_id FROM user_exercise_blacklist WHERE user_id = $1', [userId])
            ]);

            const exerciseDB = exercisesResult.rows.map(ex => ({
                ...ex,
                is_unilateral: !!ex.is_unilateral,
                pain_relief_zones: normalizePainZones(ex.pain_relief_zones),
                equipment: normalizeEquipment(ex.equipment),
                default_tempo: ex.default_tempo,
                primary_plane: ex.primary_plane || 'multi',
                position: ex.position || null,
                goal_tags: ex.goal_tags || [],
                metabolic_intensity: ex.metabolic_intensity || 1,
                conditioning_style: ex.conditioning_style || 'none'
            }));

            // 2. BUDOWANIE KONTEKSTU UŻYTKOWNIKA
            const ctx = buildUserContext(userData);
            blacklistResult.rows.forEach(row => ctx.blockedIds.add(row.exercise_id));

            // --- SEKCJA WAG ---
            let weights = { ...CATEGORY_WEIGHTS };
            const diagnosis = userData.medical_diagnosis || [];

            if (diagnosis.includes('scoliosis')) {
                weights['core_anti_rotation'] += 0.6;
                weights['core_anti_lateral_flexion'] += 0.6;
                weights['glute_activation'] += 0.4;
                weights['spine_mobility'] += 0.3;
            }
            if (diagnosis.includes('facet_syndrome') || diagnosis.includes('stenosis')) {
                weights['hip_mobility'] += 0.6;
                weights['core_anti_extension'] -= 0.5;
            }
            if (diagnosis.includes('disc_herniation')) {
                weights['core_anti_extension'] += 0.3;
                weights['core_anti_rotation'] += 0.2;
                if (ctx.tolerancePattern !== 'flexion_intolerant' && ctx.severityScore < 4) weights['core_anti_flexion'] += 0.5;
            }
            if (ctx.painFilters.has('sciatica') || diagnosis.includes('piriformis')) {
                weights['nerve_flossing'] = 2.5;
                weights['glute_activation'] += 0.3;
            }

            if (userData.primary_goal === 'fat_loss' || (userData.goal_tags && userData.goal_tags.includes('fat_loss'))) {
                weights['conditioning_low_impact'] += 1.5;
            }

            const painChar = userData.pain_character || [];
            const painLocs = userData.pain_locations || [];
            if (painChar.includes('radiating') && (painLocs.includes('sciatica') || painLocs.includes('lumbar_radiculopathy'))) {
                weights['nerve_flossing'] = Math.max(weights['nerve_flossing'], 2.5);
            }

            const workType = userData.work_type;
            if (workType === 'sedentary') { weights['hip_mobility'] += 0.5; weights['spine_mobility'] += 0.4; weights['glute_activation'] += 0.4; }
            else if (workType === 'standing' || workType === 'physical') { weights['core_anti_extension'] += 0.4; weights['breathing'] += 0.3; }

            const hobbies = userData.hobby || [];
            if (hobbies.includes('cycling') || hobbies.includes('running')) { weights['hip_mobility'] += 0.4; weights['glute_activation'] += 0.3; }
            if (hobbies.includes('gym')) { weights['spine_mobility'] += 0.3; }

            const userPriorities = [...(userData.session_component_weights || []), userData.primary_goal, ...(userData.secondary_goals || [])];

            if (userPriorities.includes('mobility') || userPriorities.includes('flexibility')) { weights['hip_mobility'] += 0.5; weights['spine_mobility'] += 0.5; }

            if (userPriorities.includes('stability') || userPriorities.includes('core')) {
                weights['core_anti_extension'] += 0.4;
                weights['core_anti_rotation'] += 0.4;
                weights['core_anti_flexion'] += 0.4;
                weights['core_anti_lateral_flexion'] += 0.3;
            }

            if (userPriorities.includes('core_side')) {
                weights['core_anti_lateral_flexion'] += 1.0;
            }

            if (userPriorities.includes('strength')) { weights['glute_activation'] += 0.6; }

            if (userPriorities.includes('fat_loss') || userPriorities.includes('conditioning')) {
                weights['conditioning_low_impact'] += 1.0;
            }

            if (userPriorities.includes('breathing') || userPriorities.includes('pain_relief')) { weights['breathing'] += 0.7; }
            if (userPriorities.includes('posture')) { weights['core_anti_extension'] += 0.5; weights['spine_mobility'] += 0.3; }

            // 4. FILTROWANIE KANDYDATÓW
            let candidates = exerciseDB.filter(ex => {
                const result = checkExerciseAvailability(ex, ctx, { strictSeverity: true });
                return result.allowed;
            });

            if (candidates.length < 5) {
                candidates = exerciseDB.filter(ex => {
                    const fallbackCtx = { ...ctx, isSevere: false };
                    const result = checkExerciseAvailability(ex, fallbackCtx, { ignoreDifficulty: true });
                    return result.allowed;
                });
            }

            // 5. BUDOWA TYGODNIA
            const sessionsPerWeek = parseInt(userData.sessions_per_week) || 3;
            const targetDurationMin = parseInt(userData.target_session_duration_min) || 30;

            const weeklyPlan = {
                id: `dynamic-${Date.now()}`,
                name: "Terapia Personalizowana",
                description: "Plan wygenerowany przez Asystenta AI (v4.5 - New Cats)",
                days: []
            };

            const weeklyUsage = new Map();
            const weeklyRotationMobilityUsage = new Map();

            for (let i = 1; i <= sessionsPerWeek; i++) {
                let session = generateSession(
                    i, candidates, weights, ctx.severityScore,
                    userData.exercise_experience, weeklyUsage, sessionsPerWeek,
                    userData, weeklyRotationMobilityUsage
                );

                ['warmup', 'main', 'cooldown'].forEach(section => {
                    session[section].forEach(ex => {
                        applyVolume(ex, calculateLoadFactor(ctx.severityScore, userData.exercise_experience, sessionsPerWeek), section, targetDurationMin);
                    });
                });

                expandSessionDuration(session, targetDurationMin);
                optimizeSessionDuration(session, targetDurationMin);
                session = sanitizeForStorage(session);
                weeklyPlan.days.push(session);
            }

            // 6. ZAPIS DO BAZY
            const currentSettingsRes = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
            let currentSettings = currentSettingsRes.rows.length > 0 ? currentSettingsRes.rows[0].settings : {};

            currentSettings.dynamicPlanData = weeklyPlan;
            currentSettings.planMode = 'dynamic';
            currentSettings.onboardingCompleted = true;
            // Aktualizujemy wizardData o nowe parametry czasowe, aby generator miał je "na przyszłość"
            currentSettings.wizardData = userData;

            await client.query(
                `INSERT INTO user_settings (user_id, settings, updated_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP`,
                [userId, JSON.stringify(currentSettings)]
            );

            return { statusCode: 200, body: JSON.stringify({ message: "Plan generated", plan: weeklyPlan }) };

        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Generator Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

// --- HELPERY LOGIKI ---

function generateSession(dayNum, candidates, weights, severity, experience, weeklyUsage, sessionsPerWeek, userData, weeklyRotationMobilityUsage) {
    const session = {
        dayNumber: dayNum,
        title: `Sesja ${dayNum}`,
        warmup: [],
        main: [],
        cooldown: []
    };

    const sessionUsedIds = new Set();

    // 1. Rozgrzewka
    session.warmup.push(pickOne(candidates, BREATHING_CATEGORIES, sessionUsedIds, weeklyUsage, 'warmup', userData, weeklyRotationMobilityUsage));

    if (weights['spine_mobility'] > 1.2) {
        session.warmup.push(pickOne(candidates, 'spine_mobility', sessionUsedIds, weeklyUsage, 'warmup', userData, weeklyRotationMobilityUsage));
        session.warmup.push(pickOne(candidates, 'spine_mobility', sessionUsedIds, weeklyUsage, 'warmup', userData, weeklyRotationMobilityUsage));
    } else {
        session.warmup.push(pickOne(candidates, 'spine_mobility', sessionUsedIds, weeklyUsage, 'warmup', userData, weeklyRotationMobilityUsage));
    }

    // 2. Część Główna
    if (weights['nerve_flossing'] > 1.0) {
        session.main.push(pickOne(candidates, 'nerve_flossing', sessionUsedIds, weeklyUsage, 'main', userData, weeklyRotationMobilityUsage));
    }

    if (weights['conditioning_low_impact'] > 1.2) {
        session.main.push(pickOne(candidates, 'conditioning_low_impact', sessionUsedIds, weeklyUsage, 'main', userData, weeklyRotationMobilityUsage));
    }

    const coreCats = ['core_anti_extension', 'core_anti_flexion', 'core_anti_rotation', 'core_anti_lateral_flexion'];
    coreCats.sort((a, b) => weights[b] - weights[a]);

    const primaryCoreCat = coreCats[0];
    const secondaryCoreCat = coreCats[1];

    session.main.push(pickOne(candidates, primaryCoreCat, sessionUsedIds, weeklyUsage, 'main', userData, weeklyRotationMobilityUsage));

    if (weights[primaryCoreCat] >= 1.2) {
        const extraEx = pickOne(candidates, primaryCoreCat, sessionUsedIds, weeklyUsage, 'main', userData, weeklyRotationMobilityUsage);
        if (extraEx) {
            session.main.push(extraEx);
        }
    }

    session.main.push(pickOne(candidates, secondaryCoreCat, sessionUsedIds, weeklyUsage, 'main', userData, weeklyRotationMobilityUsage));

    if (weights['glute_activation'] > 0.8) {
        session.main.push(pickOne(candidates, 'glute_activation', sessionUsedIds, weeklyUsage, 'main', userData, weeklyRotationMobilityUsage));
    }

    // 3. Schłodzenie
    if (weights['hip_mobility'] >= 1.0) {
        session.cooldown.push(pickOne(candidates, 'hip_mobility', sessionUsedIds, weeklyUsage, 'cooldown', userData, weeklyRotationMobilityUsage));
    }
    session.cooldown.push(pickOne(candidates, BREATHING_CATEGORIES, sessionUsedIds, weeklyUsage, 'cooldown', userData, weeklyRotationMobilityUsage));

    session.warmup = session.warmup.filter(Boolean);
    session.main = session.main.filter(Boolean);
    session.cooldown = session.cooldown.filter(Boolean);

    return session;
}

function sanitizeForStorage(session) {
    const cleanSection = (exercises) => {
        return exercises.map(ex => ({
            exerciseId: ex.id || ex.exerciseId,
            sets: ex.sets,
            reps_or_time: ex.reps_or_time,
            equipment: Array.isArray(ex.equipment) ? ex.equipment.join(', ') : ex.equipment
        }));
    };

    return {
        dayNumber: session.dayNumber,
        title: session.title,
        warmup: cleanSection(session.warmup),
        main: cleanSection(session.main),
        cooldown: cleanSection(session.cooldown),
        compressionApplied: session.compressionApplied,
        targetMinutes: session.targetMinutes
    };
}

function pickOne(pool, category, usedIds, weeklyUsage, sectionName, userData, weeklyRotationMobilityUsage) {
    const categories = Array.isArray(category) ? category : [category];
    const hasDisc = (userData?.medical_diagnosis || []).includes('disc_herniation');

    let matching = pool.filter(ex => {
        if (!categories.includes(ex.category_id)) return false;
        if (usedIds && usedIds.has(ex.id)) return false;

        if (weeklyUsage && sectionName === 'main') {
            const used = weeklyUsage.get(ex.id) || 0;
            if (used >= MAX_MAIN_OCCURRENCES_PER_WEEK) return false;
            if (hasDisc && ex.category_id === 'core_anti_rotation') {
                if (used >= MAX_ROTATIONAL_CORE_WITH_DISC_HERNIATION) return false;
            }
        }

        if (weeklyRotationMobilityUsage && sectionName !== 'main' && hasDisc) {
            const plane = ex.primary_plane || 'multi';
            if (plane === 'rotation') {
                const usedRot = weeklyRotationMobilityUsage.get(ex.id) || 0;
                if (usedRot >= MAX_ROTATION_MOBILITY_WITH_DISC_HERNIATION) return false;
            }
        }
        return true;
    });

    if (matching.length === 0) {
        matching = pool.filter(ex => categories.includes(ex.category_id) && (!usedIds || !usedIds.has(ex.id)));
        if (matching.length === 0) return null;
    }

    matching.sort((a, b) => {
        const aTags = a.goal_tags || [];
        const bTags = b.goal_tags || [];
        const hasA = aTags.some(t => [userData.primary_goal, ...userData.secondary_goals].includes(t));
        const hasB = bTags.some(t => [userData.primary_goal, ...userData.secondary_goals].includes(t));
        return (hasB ? 1 : 0) - (hasA ? 1 : 0);
    });

    const topCandidates = matching.slice(0, Math.min(3, matching.length));
    const original = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    if (usedIds) usedIds.add(original.id);

    if (weeklyUsage && sectionName === 'main') {
        weeklyUsage.set(original.id, (weeklyUsage.get(original.id) || 0) + 1);
    }
    if (weeklyRotationMobilityUsage && sectionName !== 'main' && hasDisc) {
        const plane = original.primary_plane || 'multi';
        if (plane === 'rotation') {
            weeklyRotationMobilityUsage.set(original.id, (weeklyRotationMobilityUsage.get(original.id) || 0) + 1);
        }
    }

    return JSON.parse(JSON.stringify(original));
}

function calculateLoadFactor(severity, experience, sessionsPerWeek) {
    let base = 1.0;
    if (experience === 'none') base = 0.7;
    else if (experience === 'occasional') base = 0.8;
    else if (experience === 'regular') base = 1.0;
    else base = 1.1;

    if (severity >= 7) base *= 0.5;
    else if (severity >= 4) base *= 0.75;

    if (sessionsPerWeek >= 6) {
        base *= 0.85;
    } else if (sessionsPerWeek <= 2) {
        base *= 1.1;
    }

    return base;
}

function applyVolume(ex, factor, sectionName, targetDurationMin = 30) {
    const isBreathing = BREATHING_CATEGORIES.includes(ex.category_id);

    if (isBreathing) {
        ex.sets = "1";
        let baseDuration = 90;
        if (targetDurationMin < 25) baseDuration = 60;
        else if (targetDurationMin > 45) baseDuration = 120;
        if (sectionName === 'warmup') baseDuration = Math.max(60, baseDuration - 30);
        let calcDuration = Math.round(baseDuration * factor);
        calcDuration = Math.max(60, calcDuration);
        calcDuration = Math.ceil(calcDuration / 15) * 15;
        ex.reps_or_time = `${calcDuration} s`;
        ex.exerciseId = ex.id;
        ex.tempo_or_iso = "Spokojnie";
        return;
    }

    let sets = 2;
    if (sectionName === 'warmup' || sectionName === 'cooldown') {
        sets = 1;
    } else {
        if (factor < 0.6) sets = 1;
        else if (factor > 1.0) sets = 3;
        else sets = 2;
    }

    if (ex.category_id && ex.category_id.startsWith('core_')) {
        sets = Math.min(sets, 3);
    }

    const isUnilateralText = (ex.reps_or_time && String(ex.reps_or_time).includes('/str')) || (ex.description && ex.description.toLowerCase().includes('stron'));
    const isReallyUnilateral = ex.is_unilateral || isUnilateralText;

    if (isReallyUnilateral) {
        sets = Math.ceil(sets / 2) * 2;
        if (sets > 4) sets = 4;
        if ((sectionName === 'warmup' || sectionName === 'cooldown') && sets > 2) sets = 2;
    }

    let repsOrTime = "10";
    if (ex.max_recommended_duration) {
        let baseDuration = (ex.difficulty_level >= 3) ? 45 : 30;
        let calculatedDuration = Math.round(baseDuration * factor);
        calculatedDuration = Math.min(calculatedDuration, ex.max_recommended_duration);
        calculatedDuration = Math.max(10, calculatedDuration);
        repsOrTime = `${calculatedDuration} s`;
    } else {
        let baseReps = 10;
        if (ex.max_recommended_reps) baseReps = ex.max_recommended_reps;
        let calculatedReps = Math.round(baseReps * factor);
        if (ex.max_recommended_reps) calculatedReps = Math.min(calculatedReps, ex.max_recommended_reps + 2);
        repsOrTime = `${Math.max(5, calculatedReps)}`;
    }

    ex.sets = sets.toString();
    ex.reps_or_time = repsOrTime;
    ex.exerciseId = ex.id;
}