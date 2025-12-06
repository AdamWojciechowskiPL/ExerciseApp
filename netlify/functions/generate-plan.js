// netlify/functions/generate-plan.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

/**
 * GENERATOR PLANU TRENINGOWEGO (VIRTUAL PHYSIO) v3.3
 * Zmiany v3.3:
 * - Wstępna walidacja kliniczna (can_generate_plan)
 * - Nowa logika severity / difficulty cap
 * - Rozszerzone mapowanie diagnoz (disc_herniation)
 * - Rozszerzona logika nerve_flossing (radiating + lokalizacja)
 * - Nowe helpery: violatesRestrictions, passesTolerancePattern
 * - Zmodyfikowane filtrowanie kandydatów (primary_plane, position)
 * - Ograniczenie powtarzalności ćwiczeń w tygodniu (weeklyUsage)
 * - Skalowanie objętości od sessions_per_week
 * - Zoptymalizowane optimizeSessionDuration
 */

const SECONDS_PER_REP = 4;
const REST_BETWEEN_SETS = 60;
const REST_BETWEEN_EXERCISES = 90;
const MAX_MAIN_OCCURRENCES_PER_WEEK = 4;

const DIFFICULTY_MAP = {
    'none': 1,
    'occasional': 2,
    'regular': 3,
    'advanced': 4
};

// Bazowe wagi (neutralne)
const CATEGORY_WEIGHTS = {
    'breathing': 1.0,
    'spine_mobility': 1.0,
    'hip_mobility': 1.0,
    'glute_activation': 1.0,
    'core_anti_extension': 1.0,
    'core_anti_rotation': 1.0,
    'core_anti_flexion': 1.0,
    'nerve_flossing': 0.0 // Domyślnie wyłączone
};

// Kategorie oddechowe/relaksacyjne dla warmup/cooldown
const BREATHING_CATEGORIES = ['breathing', 'breathing_control', 'muscle_relaxation'];

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const userId = await getUserIdFromEvent(event);
        const userData = JSON.parse(event.body);

        // 2.1. Wstępna walidacja kliniczna wejścia
        if (userData && userData.can_generate_plan === false) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'PLAN_GENERATION_BLOCKED_BY_CLINICAL_RULES' })
            };
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
                pain_relief_zones: ex.pain_relief_zones || [],
                equipment: ex.equipment ? ex.equipment.split(',').map(e => e.trim().toLowerCase()) : [],
                default_tempo: ex.default_tempo,
                primary_plane: ex.primary_plane || 'multi',
                position: ex.position || null
            }));

            const blockedIds = new Set(blacklistResult.rows.map(row => row.exercise_id));

            // 2. ANALIZA BIOMECHANICZNA I WZORCE
            let tolerancePattern = 'neutral';
            const triggers = userData.trigger_movements || [];
            const reliefs = userData.relief_movements || [];

            if (triggers.includes('bending_forward') || reliefs.includes('bending_backward')) {
                tolerancePattern = 'flexion_intolerant';
            } else if (triggers.includes('bending_backward') || reliefs.includes('bending_forward')) {
                tolerancePattern = 'extension_intolerant';
            }

            // 2.2. Logika Charakteru Bólu i Severity
            const painChar = userData.pain_character || [];
            const isPainSharp = painChar.includes('sharp') || painChar.includes('burning') || painChar.includes('radiating');

            const painInt = parseInt(userData.pain_intensity) || 0;
            const impact = parseInt(userData.daily_impact) || 0;

            let severityScore = (painInt + impact) / 2;
            if (isPainSharp) severityScore *= 1.2;

            const isSevere = severityScore >= 6.5;

            // 2.2. Difficulty Cap - nowa logika
            const experienceKey = userData.exercise_experience;
            const baseDifficultyCap = DIFFICULTY_MAP[experienceKey] || 2;
            let difficultyCap = baseDifficultyCap;

            // Silny przypadek – twardy cap 2
            if (isSevere) {
                difficultyCap = Math.min(baseDifficultyCap, 2);
            } else if (isPainSharp && severityScore >= 4) {
                // Umiarkowany ból o ostrym charakterze – cap max 3
                difficultyCap = Math.min(baseDifficultyCap, 3);
            }

            // Mapowanie lokalizacji bólu
            let painFilters = new Set();
            const painLocs = userData.pain_locations || [];
            if (painLocs.length > 0) {
                painLocs.forEach(loc => painFilters.add(loc));
                if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('lumbar_general');
            } else {
                painFilters.add('lumbar_general');
                painFilters.add('thoracic');
            }

            // 3. WAŻENIE KATEGORII
            let weights = { ...CATEGORY_WEIGHTS };

            const diagnosis = userData.medical_diagnosis || [];
            if (diagnosis.includes('scoliosis')) {
                weights['core_anti_rotation'] += 0.6;
                weights['glute_activation'] += 0.4;
                weights['spine_mobility'] += 0.3;
            }
            if (diagnosis.includes('facet_syndrome') || diagnosis.includes('stenosis')) {
                weights['hip_mobility'] += 0.6;
                weights['core_anti_extension'] -= 0.5;
            }

            // 2.3. Rozszerzone mapowanie diagnoz (disc_herniation)
            if (diagnosis.includes('disc_herniation')) {
                // Domyślne wzmocnienie stabilizacji neutralnej
                weights['core_anti_extension'] += 0.3;
                weights['core_anti_rotation'] += 0.2;

                // Elementy zgięciowe tylko przy braku nietolerancji zgięcia i niższej ciężkości
                if (tolerancePattern !== 'flexion_intolerant' && severityScore < 4) {
                    weights['core_anti_flexion'] += 0.5;
                }
            }

            if (painFilters.has('sciatica') || diagnosis.includes('piriformis')) {
                weights['nerve_flossing'] = 2.5;
                weights['glute_activation'] += 0.3;
            }

            // 2.4. Rozszerzona logika nerve_flossing (radiating + lokalizacja)
            if (painChar.includes('radiating') &&
                (painLocs.includes('sciatica') || painLocs.includes('lumbar_radiculopathy'))) {
                weights['nerve_flossing'] = Math.max(weights['nerve_flossing'], 2.5);
            }

            const workType = userData.work_type;
            if (workType === 'sedentary') {
                weights['hip_mobility'] += 0.5;
                weights['spine_mobility'] += 0.4;
                weights['glute_activation'] += 0.4;
            } else if (workType === 'standing' || workType === 'physical') {
                weights['core_anti_extension'] += 0.4;
                weights['breathing'] += 0.3;
            }

            const hobbies = userData.hobby || [];
            if (hobbies.includes('cycling') || hobbies.includes('running')) {
                weights['hip_mobility'] += 0.4;
                weights['glute_activation'] += 0.3;
            }
            if (hobbies.includes('gym')) {
                weights['spine_mobility'] += 0.3;
            }

            const userPriorities = [
                ...(userData.session_component_weights || []),
                userData.primary_goal,
                ...(userData.secondary_goals || [])
            ];

            if (userPriorities.includes('mobility') || userPriorities.includes('flexibility')) {
                weights['hip_mobility'] += 0.5;
                weights['spine_mobility'] += 0.5;
            }
            if (userPriorities.includes('stability') || userPriorities.includes('core')) {
                weights['core_anti_extension'] += 0.4;
                weights['core_anti_rotation'] += 0.4;
                weights['core_anti_flexion'] += 0.4;
            }
            if (userPriorities.includes('strength')) {
                weights['glute_activation'] += 0.6;
            }
            if (userPriorities.includes('breathing') || userPriorities.includes('pain_relief')) {
                weights['breathing'] += 0.7;
            }
            if (userPriorities.includes('posture')) {
                weights['core_anti_extension'] += 0.5;
                weights['spine_mobility'] += 0.3;
            }

            // 4. FILTROWANIE KANDYDATÓW (2.7)
            const userEquip = (userData.equipment_available || []).map(e => e.toLowerCase());
            const restrictions = userData.physical_restrictions || [];

            let candidates = exerciseDB.filter(ex => {
                if (blockedIds.has(ex.id)) return false;

                const exEquip = ex.equipment;
                const requiresEquip = exEquip.length > 0 && !exEquip.includes('brak') && !exEquip.includes('masa własna') && !exEquip.includes('none');
                if (requiresEquip) {
                    const hasAll = exEquip.every(req =>
                        userEquip.some(owned => owned.includes(req) || req.includes(owned))
                    );
                    if (!hasAll) return false;
                }

                if (ex.difficulty_level > difficultyCap) return false;

                if (violatesRestrictions(ex, restrictions)) return false;

                if (!passesTolerancePattern(ex, tolerancePattern)) return false;

                const zones = ex.pain_relief_zones || [];
                const helpsZone = zones.some(z => painFilters.has(z));
                if (isSevere && !helpsZone) return false;

                return true;
            });

            // 2.8. Fallback kandydatów
            if (candidates.length < 5) {
                candidates = exerciseDB.filter(ex => {
                    if (blockedIds.has(ex.id)) return false;

                    const exEquip = ex.equipment;
                    const requiresEquip = exEquip.length > 0 && !exEquip.includes('brak') && !exEquip.includes('masa własna') && !exEquip.includes('none');
                    if (requiresEquip) {
                        const hasAll = exEquip.every(req =>
                            userEquip.some(owned => owned.includes(req) || req.includes(owned))
                        );
                        if (!hasAll) return false;
                    }

                    if (violatesRestrictions(ex, restrictions)) return false;

                    if (!passesTolerancePattern(ex, tolerancePattern)) return false;

                    const cap = isSevere ? 2 : 3;
                    if (ex.difficulty_level > cap) return false;

                    if (isSevere) {
                        const zones = ex.pain_relief_zones || [];
                        const helpsZone = zones.some(z => painFilters.has(z));
                        if (!helpsZone) return false;
                    }

                    return true;
                });
            }

            // 5. BUDOWA TYGODNIA
            const sessionsPerWeek = parseInt(userData.sessions_per_week) || 3;
            const targetDurationMin = parseInt(userData.target_session_duration_min) || 30;

            const weeklyPlan = {
                id: `dynamic-${Date.now()}`,
                name: "Terapia Personalizowana",
                description: "Plan wygenerowany przez Asystenta AI (v3.3)",
                days: []
            };

            // 2.10.1. Nowy licznik tygodniowy
            const weeklyUsage = new Map(); // exerciseId -> liczba wystąpień w części main

            for (let i = 1; i <= sessionsPerWeek; i++) {
                let session = generateSession(i, candidates, weights, severityScore, userData.exercise_experience, weeklyUsage, sessionsPerWeek);

                optimizeSessionDuration(session, targetDurationMin);

                // Sanityzacja (czyszczenie zbędnych pól przed zapisem)
                session = sanitizeForStorage(session);

                weeklyPlan.days.push(session);
            }

            // 6. ZAPIS DO BAZY
            const currentSettingsRes = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
            let currentSettings = currentSettingsRes.rows.length > 0 ? currentSettingsRes.rows[0].settings : {};

            currentSettings.dynamicPlanData = weeklyPlan;
            currentSettings.planMode = 'dynamic';
            currentSettings.onboardingCompleted = true;
            currentSettings.wizardData = userData;

            await client.query(
                `INSERT INTO user_settings (user_id, settings, updated_at) 
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP`,
                [userId, JSON.stringify(currentSettings)]
            );

            return {
                statusCode: 200,
                body: JSON.stringify({ message: "Plan generated", plan: weeklyPlan })
            };

        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Generator Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

// --- HELPERY LOGIKI ---

// 2.5. Nowa funkcja violatesRestrictions
function violatesRestrictions(ex, restrictions) {
    const plane = ex.primary_plane || 'multi';
    const pos = ex.position || null;

    if (restrictions.includes('no_kneeling')) {
        if (pos === 'kneeling' || pos === 'quadruped') return true;
    }

    if (restrictions.includes('no_twisting')) {
        if (plane === 'rotation') return true;
    }

    if (restrictions.includes('no_floor_sitting')) {
        if (pos === 'sitting') return true;
    }

    return false;
}

// 2.6. Nowa funkcja passesTolerancePattern
function passesTolerancePattern(ex, tolerancePattern) {
    const plane = ex.primary_plane || 'multi';
    const zones = ex.pain_relief_zones || [];

    if (tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !zones.includes('lumbar_flexion_intolerant')) {
            return false;
        }
    } else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !zones.includes('lumbar_extension_intolerant')) {
            return false;
        }
    }

    return true;
}

// 2.10.2, 2.10.3 - Zmodyfikowana sygnatury generateSession i pickOne
function generateSession(dayNum, candidates, weights, severity, experience, weeklyUsage, sessionsPerWeek) {
    const session = {
        dayNumber: dayNum,
        title: `Sesja ${dayNum}`,
        warmup: [],
        main: [],
        cooldown: []
    };

    const sessionUsedIds = new Set();

    // 1. Rozgrzewka (2.9)
    session.warmup.push(pickOne(candidates, BREATHING_CATEGORIES, sessionUsedIds, weeklyUsage, 'warmup'));

    if (weights['spine_mobility'] > 1.2) {
        session.warmup.push(pickOne(candidates, 'spine_mobility', sessionUsedIds, weeklyUsage, 'warmup'));
        session.warmup.push(pickOne(candidates, 'spine_mobility', sessionUsedIds, weeklyUsage, 'warmup'));
    } else {
        session.warmup.push(pickOne(candidates, 'spine_mobility', sessionUsedIds, weeklyUsage, 'warmup'));
    }

    // 2. Część Główna
    if (weights['nerve_flossing'] > 1.0) {
        session.main.push(pickOne(candidates, 'nerve_flossing', sessionUsedIds, weeklyUsage, 'main'));
    }

    const coreCats = ['core_anti_extension', 'core_anti_flexion', 'core_anti_rotation'];
    coreCats.sort((a, b) => weights[b] - weights[a]);

    session.main.push(pickOne(candidates, coreCats[0], sessionUsedIds, weeklyUsage, 'main'));

    if (weights[coreCats[0]] > 1.2) {
        session.main.push(pickOne(candidates, coreCats[1], sessionUsedIds, weeklyUsage, 'main'));
    }

    if (weights['glute_activation'] > 0.8) {
        session.main.push(pickOne(candidates, 'glute_activation', sessionUsedIds, weeklyUsage, 'main'));
    }

    // 3. Schłodzenie (2.9)
    if (weights['hip_mobility'] >= 1.0) {
        session.cooldown.push(pickOne(candidates, 'hip_mobility', sessionUsedIds, weeklyUsage, 'cooldown'));
    }
    session.cooldown.push(pickOne(candidates, BREATHING_CATEGORIES, sessionUsedIds, weeklyUsage, 'cooldown'));

    // Filtrowanie
    session.warmup = session.warmup.filter(Boolean);
    session.main = session.main.filter(Boolean);
    session.cooldown = session.cooldown.filter(Boolean);

    // 2.11. Skalowanie objętości od sessions_per_week
    const loadFactor = calculateLoadFactor(severity, experience, sessionsPerWeek);

    ['warmup', 'main', 'cooldown'].forEach(section => {
        session[section].forEach(ex => {
            applyVolume(ex, loadFactor, section);
        });
    });

    return session;
}

/**
 * Zapisuje tylko to, co jest unikalne dla danej sesji.
 * Opisy, tempo (jeśli domyślne) i flaga unilateral są pobierane z biblioteki na frontendzie.
 */
function sanitizeForStorage(session) {
    const cleanSection = (exercises) => {
        return exercises.map(ex => ({
            exerciseId: ex.id || ex.exerciseId,
            sets: ex.sets,
            reps_or_time: ex.reps_or_time,
            equipment: ex.equipment && typeof ex.equipment === 'string' ? ex.equipment : undefined
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

// 2.10.3 - Zmodyfikowana pickOne z weeklyUsage i sectionName
function pickOne(pool, category, usedIds, weeklyUsage, sectionName) {
    const categories = Array.isArray(category) ? category : [category];

    let matching = pool.filter(ex => {
        if (!categories.includes(ex.category_id)) return false;
        if (usedIds && usedIds.has(ex.id)) return false;

        if (weeklyUsage && sectionName === 'main') {
            const used = weeklyUsage.get(ex.id) || 0;
            if (used >= MAX_MAIN_OCCURRENCES_PER_WEEK) return false;
        }
        return true;
    });

    if (matching.length === 0) {
        matching = pool.filter(ex => categories.includes(ex.category_id));
    }

    if (matching.length === 0) return null;

    const original = matching[Math.floor(Math.random() * matching.length)];

    if (usedIds) usedIds.add(original.id);
    if (weeklyUsage && sectionName === 'main') {
        weeklyUsage.set(original.id, (weeklyUsage.get(original.id) || 0) + 1);
    }

    return JSON.parse(JSON.stringify(original));
}

// 2.11.1 - Zmodyfikowana calculateLoadFactor z sessionsPerWeek
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

function applyVolume(ex, factor, sectionName) {
    let sets = 2;

    if (sectionName === 'warmup' || sectionName === 'cooldown') {
        sets = 1;
    } else {
        if (factor < 0.6) sets = 1;
        else if (factor > 1.0) sets = 3;
        else sets = 2;
    }

    // Sprawdzamy jednostronność tylko do kalkulacji serii, ale nie zapisujemy flagi
    const isUnilateralText = (ex.reps_or_time && String(ex.reps_or_time).includes('/str')) ||
        (ex.description && ex.description.toLowerCase().includes('stron'));

    const isReallyUnilateral = ex.is_unilateral || isUnilateralText;

    if (isReallyUnilateral) {
        sets = Math.ceil(sets / 2) * 2;
        if (sets > 4) sets = 4;
        if ((sectionName === 'warmup' || sectionName === 'cooldown') && sets > 2) {
            sets = 2;
        }
    }

    let repsOrTime = "10";

    if (ex.max_recommended_duration) {
        let baseDuration = (ex.difficulty_level >= 3) ? 45 : 30;
        let calculatedDuration = Math.round(baseDuration * factor);
        calculatedDuration = Math.min(calculatedDuration, ex.max_recommended_duration);
        calculatedDuration = Math.max(10, calculatedDuration);
        repsOrTime = `${calculatedDuration} s`;
    }
    else {
        let baseReps = 10;
        if (ex.max_recommended_reps) {
            baseReps = ex.max_recommended_reps;
        }
        let calculatedReps = Math.round(baseReps * factor);
        if (ex.max_recommended_reps) {
            calculatedReps = Math.min(calculatedReps, ex.max_recommended_reps + 2);
        }
        repsOrTime = `${Math.max(5, calculatedReps)}`;
    }

    ex.sets = sets.toString();
    ex.reps_or_time = repsOrTime;
    ex.exerciseId = ex.id;

    if (Array.isArray(ex.equipment)) {
        if (ex.equipment.length === 0) {
            ex.equipment = "Brak sprzętu";
        } else {
            ex.equipment = ex.equipment
                .map(e => e.charAt(0).toUpperCase() + e.slice(1))
                .join(', ');
        }
    }
}

function estimateDurationSeconds(session) {
    let totalSeconds = 0;
    const allExercises = [...session.warmup, ...session.main, ...session.cooldown];

    allExercises.forEach((ex, index) => {
        const sets = parseInt(ex.sets);
        let workTimePerSet = 0;

        const text = String(ex.reps_or_time).toLowerCase();
        if (text.includes('s') || text.includes('min')) {
            const val = parseInt(text) || 30;
            const isMin = text.includes('min');
            workTimePerSet = isMin ? val * 60 : val;
        } else {
            const reps = parseInt(text) || 10;
            workTimePerSet = reps * SECONDS_PER_REP;
        }

        totalSeconds += sets * workTimePerSet;

        if (sets > 1) {
            totalSeconds += (sets - 1) * REST_BETWEEN_SETS;
        }

        if (index < allExercises.length - 1) {
            totalSeconds += REST_BETWEEN_EXERCISES;
        }
    });

    return totalSeconds;
}

// 2.12. Zmodyfikowana optimizeSessionDuration
function optimizeSessionDuration(session, targetMin) {
    const targetSeconds = targetMin * 60;
    let estimatedSeconds = estimateDurationSeconds(session);

    // Etap 1: Usuwanie ćwiczeń z main jeśli przekroczenie > 5 minut
    if (estimatedSeconds > targetSeconds + 300) {
        while (session.main.length > 1 && estimatedSeconds > targetSeconds + 300) {
            session.main.pop();
            estimatedSeconds = estimateDurationSeconds(session);
        }
    }

    // Etap 2: Redukcja serii/reps (istniejąca logika)
    let attempts = 0;

    while (estimatedSeconds > targetSeconds * 1.15 && attempts < 5) {
        let reductionMade = false;

        for (let ex of session.main) {
            const sets = parseInt(ex.sets);

            if (ex.is_unilateral) {
                if (sets >= 4) {
                    ex.sets = String(sets - 2);
                    reductionMade = true;
                }
            }
            else {
                if (sets > 1) {
                    ex.sets = String(sets - 1);
                    reductionMade = true;
                }
            }
        }

        if (!reductionMade) {
            [...session.warmup, ...session.main, ...session.cooldown].forEach(ex => {
                const text = String(ex.reps_or_time);
                const val = parseInt(text);
                if (!isNaN(val)) {
                    const newVal = Math.max(5, Math.floor(val * 0.8));
                    ex.reps_or_time = text.replace(val, newVal);
                }
            });
        }

        estimatedSeconds = estimateDurationSeconds(session);
        attempts++;
    }
}