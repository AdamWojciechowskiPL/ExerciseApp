import { state } from './state.js';
import { getISODate, getAvailableMinutesForToday, parseSetCount } from './utils.js';
import { assistant } from './assistantEngine.js';

/**
 * WORKOUT MIXER (Dynamic Biomechanical Matrix)
 */

const CACHE_FRESHNESS_DAYS = 60;
const SECONDS_PER_REP = 4;

// 1.1. Stała z mapowaniem doświadczenia
const DIFFICULTY_MAP = {
    none: 1,
    occasional: 2,
    regular: 3,
    advanced: 4
};

export const workoutMixer = {

    mixWorkout: (staticDayPlan, forceShuffle = false) => {
        if (!staticDayPlan) return null;

        console.log(`🌪️ [Mixer] Rozpoczynam miksowanie dnia: ${staticDayPlan.title}`);

        const dynamicPlan = JSON.parse(JSON.stringify(staticDayPlan));
        const sessionUsedIds = new Set();

        // 3.1. Inicjalizacja kontekstu klinicznego
        const clinicalCtx = buildClinicalContext();
        const effectiveForceShuffle = clinicalCtx.isSevere ? false : forceShuffle;

        // 3.2. Wywołanie injectPrehabExercises z kontekstem
        if (state.settings.painZones && state.settings.painZones.length > 0) {
            injectPrehabExercises(dynamicPlan, sessionUsedIds, clinicalCtx);
        }

        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!dynamicPlan[section]) return;

            dynamicPlan[section] = dynamicPlan[section].map(originalExercise => {

                const hasEquipmentForOriginal = checkEquipment(originalExercise);
                const mustSwap = !hasEquipmentForOriginal;

                const criteria = {
                    categoryId: originalExercise.categoryId,
                    targetLevel: originalExercise.difficultyLevel || 1,
                };

                // 3.3. Użycie effectiveForceShuffle i przekazanie clinicalCtx do findFreshVariant
                const shouldShuffle = effectiveForceShuffle || mustSwap;

                const freshVariant = findFreshVariant(
                    originalExercise,
                    criteria,
                    sessionUsedIds,
                    shouldShuffle,
                    mustSwap,
                    clinicalCtx
                );

                if (freshVariant && (freshVariant.id !== originalExercise.exerciseId && freshVariant.id !== originalExercise.id)) {
                    console.log(`🔀 [Mixer] Zamiana: ${originalExercise.name} -> ${freshVariant.name}`);
                    sessionUsedIds.add(freshVariant.id);
                    return mergeExerciseData(originalExercise, freshVariant);
                }

                if (mustSwap) {
                    originalExercise.equipmentWarning = true;
                    console.warn(`⚠️ [Mixer] Brak sprzętu dla: ${originalExercise.name}, brak alternatywy.`);
                }

                sessionUsedIds.add(originalExercise.id || originalExercise.exerciseId);
                return originalExercise;
            });
        });

        const availableMinutes = getAvailableMinutesForToday();
        const estimatedMinutes = assistant.estimateDuration(dynamicPlan);

        if (estimatedMinutes > availableMinutes) {
            console.log(`⏱️ [Mixer] Kompresja czasu: ${estimatedMinutes}m -> ${availableMinutes}m`);
            compressWorkout(dynamicPlan, availableMinutes, estimatedMinutes);
        }

        dynamicPlan._isDynamic = true;
        return dynamicPlan;
    },

    // 5. Zmiany w getAlternative - dodanie kontekstu klinicznego
    getAlternative: (originalExercise, currentId) => {
        const criteria = {
            categoryId: originalExercise.categoryId,
            targetLevel: originalExercise.difficultyLevel || 1
        };
        const usedIds = new Set([currentId]);
        const clinicalCtx = buildClinicalContext();
        const variant = findFreshVariant(originalExercise, criteria, usedIds, true, false, clinicalCtx);

        if (variant) {
            return mergeExerciseData(originalExercise, variant);
        }
        return originalExercise;
    },

    adaptVolume: (oldEx, newDef) => adaptVolumeInternal(oldEx, newDef),

    getSafeTempo: (repsOrTimeString) => calculateSafeTempo(repsOrTimeString),

    getExerciseTempo: (exerciseId) => {
        if (!exerciseId) return "Kontrolowane";
        const ex = state.exerciseLibrary[exerciseId];
        return ex ? (ex.defaultTempo || "Kontrolowane") : "Kontrolowane";
    }
};

// --- HELPERY LOGICZNE ---

function checkEquipment(exercise) {
    if (!state.settings.equipment || state.settings.equipment.length === 0) return true;
    if (!exercise.equipment) return true;

    const reqEq = exercise.equipment.toLowerCase();
    if (reqEq.includes('brak') || reqEq.includes('none') || reqEq.includes('bodyweight')) return true;

    const userEq = state.settings.equipment.map(e => e.toLowerCase());
    const requirements = reqEq.split(',').map(s => s.trim());

    return requirements.every(req => {
        return userEq.some(owned => owned.includes(req) || req.includes(owned));
    });
}

// 4. Zmiany w injectPrehabExercises
function injectPrehabExercises(plan, usedIds, clinicalCtx) {
    if (!plan.warmup) plan.warmup = [];

    const libraryArray = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));

    state.settings.painZones.forEach(zone => {
        // 4.2. Filtr kandydatów z regułami klinicznymi
        const rehabCandidates = libraryArray.filter(ex => {
            if (!ex.painReliefZones || !ex.painReliefZones.includes(zone)) return false;
            if (usedIds.has(ex.id)) return false;
            if (!checkEquipment(ex)) return false;
            if (!passesMixerClinicalRules(ex, clinicalCtx)) return false;
            return true;
        });

        if (rehabCandidates.length > 0) {
            const chosen = rehabCandidates[Math.floor(Math.random() * rehabCandidates.length)];
            console.log(`🚑 [Mixer] Dodano Prehab: ${chosen.name} (${zone})`);

            plan.warmup.unshift({
                ...chosen,
                exerciseId: chosen.id,
                sets: "1",
                reps_or_time: "45 s",
                tempo_or_iso: chosen.defaultTempo || "Izometria",
                isPersonalized: true,
                section: "warmup",
                isUnilateral: chosen.isUnilateral
            });
            usedIds.add(chosen.id);
        }
    });
}

function compressWorkout(plan, targetMin, currentMin) {
    if (plan.main) {
        plan.main.forEach(ex => {
            const currentSets = parseSetCount(ex.sets);
            if (currentSets > 1) {
                ex.sets = String(currentSets - 1);
            }
        });
    }
    plan.compressionApplied = true;
    plan.targetMinutes = targetMin;
}

function adaptVolumeInternal(originalEx, newEx) {
    const oldVal = (originalEx.reps_or_time || "").toString();
    const isOldTimeBased = /s\b|min\b|:/.test(oldVal);

    const newMaxDuration = newEx.maxDuration || 0;
    const newMaxReps = newEx.maxReps || 0;

    let newVal = oldVal;

    if (isOldTimeBased && newMaxReps > 0 && newMaxDuration === 0) {
        const seconds = parseSeconds(oldVal);
        let reps = Math.round(seconds / SECONDS_PER_REP);
        reps = Math.min(reps, newMaxReps);
        reps = Math.max(5, reps);
        newVal = `${reps}`;
    }
    else if (!isOldTimeBased && newMaxDuration > 0 && newMaxReps === 0) {
        const reps = parseReps(oldVal);
        let seconds = reps * SECONDS_PER_REP;
        seconds = Math.min(seconds, newMaxDuration);
        seconds = Math.max(15, seconds);
        newVal = `${seconds} s`;
    }
    else {
        if (isOldTimeBased && newMaxDuration > 0) {
            const seconds = parseSeconds(oldVal);
            if (seconds > newMaxDuration) {
                newVal = `${newMaxDuration} s`;
            }
        }
        else if (!isOldTimeBased && newMaxReps > 0) {
            const reps = parseReps(oldVal);
            if (reps > newMaxReps) {
                newVal = `${newMaxReps}`;
            }
        }
    }

    return newVal;
}

function calculateSafeTempo(repsOrTimeString) {
    const isTimeBased = /s\b|min\b|:/.test(repsOrTimeString || "");
    if (isTimeBased) {
        return "Statycznie";
    } else {
        return "2-0-2";
    }
}

function parseSeconds(val) {
    const v = val.toLowerCase();
    if (v.includes('min')) {
        return parseFloat(v) * 60;
    }
    return parseInt(v) || 45;
}

function parseReps(val) {
    return parseInt(val) || 10;
}

// 6. Zmiany w findFreshVariant
function findFreshVariant(originalEx, criteria, usedIds, forceShuffle = false, mustSwap = false, clinicalCtx = null) {
    if (!criteria.categoryId) return null;

    // 6.2. Filtr kandydatów – dodanie reguł klinicznych
    let candidates = Object.entries(state.exerciseLibrary)
        .map(([id, data]) => ({ id: id, ...data }))
        .filter(ex => {
            if (ex.categoryId !== criteria.categoryId) return false;

            if (!mustSwap) {
                const lvl = ex.difficultyLevel || 1;
                if (Math.abs(lvl - criteria.targetLevel) > 1) return false;
            }

            if (state.blacklist.includes(ex.id)) return false;
            if (usedIds.has(ex.id)) return false;

            if (!checkEquipment(ex)) return false;

            // Nowy filtr kliniczny
            if (!passesMixerClinicalRules(ex, clinicalCtx)) return false;

            return true;
        });

    if (candidates.length === 0) return null;

    const scoredCandidates = candidates.map(ex => {
        const lastDate = getLastPerformedDate(ex.id, ex.name);
        let score = 0;

        if (!lastDate) {
            score = 100; // Nie robione? Priorytet!
        } else {
            const daysSince = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
            score = Math.min(daysSince, CACHE_FRESHNESS_DAYS);
            if (daysSince < 2) score = -100; // Robione wczoraj/dziś? Kara.
        }

        // Bonus za idealny poziom trudności
        if ((ex.difficultyLevel || 1) === criteria.targetLevel) score += 15;

        // Bonus za bycie oryginałem (jeśli nie wymuszamy losowania)
        if (!forceShuffle && !mustSwap && (ex.id === originalEx.exerciseId || ex.id === originalEx.id)) {
            score += 50;
        }

        // Losowość - ZWIĘKSZONA WAGA
        const randomFactor = forceShuffle ? (Math.random() * 60) : (Math.random() * 10);
        score += randomFactor;

        return { ex, score };
    });

    // Sortujemy malejąco wg wyniku
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Debug log dla kategorii, żeby zobaczyć co wygrywa
    // console.log(`[Mixer Debug] Cat: ${criteria.categoryId}, Winner: ${scoredCandidates[0].ex.name} (${scoredCandidates[0].score.toFixed(1)})`);

    if (scoredCandidates.length > 0) return scoredCandidates[0].ex;

    return null;
}

function getLastPerformedDate(exerciseId, exerciseName) {
    let latestDate = null;
    const loadedDates = Object.keys(state.userProgress);

    loadedDates.forEach(dateKey => {
        const sessions = state.userProgress[dateKey];
        sessions.forEach(session => {
            if (!session.sessionLog) return;
            const found = session.sessionLog.find(logItem => {
                const idMatch = logItem.exerciseId && logItem.exerciseId === exerciseId;
                const nameMatch = exerciseName && logItem.name === exerciseName;
                return idMatch || nameMatch;
            });
            if (found) {
                const d = new Date(dateKey);
                if (!latestDate || d > latestDate) latestDate = d;
            }
        });
    });
    return latestDate;
}

function mergeExerciseData(original, variant) {
    let smartRepsOrTime = adaptVolumeInternal(original, variant);
    let smartSets = original.sets;

    if (variant.isUnilateral) {
        if (!smartRepsOrTime.includes("/str")) {
            if (smartRepsOrTime.includes("s")) {
                smartRepsOrTime = smartRepsOrTime.replace("s", "s/str.");
            } else {
                smartRepsOrTime = `${smartRepsOrTime}/str.`;
            }
        }
        const setsCount = parseSetCount(original.sets);
        if (setsCount === 1) {
            smartSets = "2";
        }
    }
    else {
        smartRepsOrTime = smartRepsOrTime.replace(/\/str\.?/g, "").trim();
    }

    const isSameExercise = (original.exerciseId === variant.id);

    let finalTempo = original.tempo_or_iso;
    if (!isSameExercise) {
        finalTempo = variant.defaultTempo || "Kontrolowane";
    }

    return {
        ...original,
        id: variant.id,
        exerciseId: variant.id,
        name: variant.name,
        description: variant.description,
        equipment: variant.equipment,
        youtube_url: variant.youtube_url,
        animationSvg: variant.animationSvg,
        reps_or_time: smartRepsOrTime,
        sets: smartSets,
        tempo_or_iso: finalTempo,
        isDynamicSwap: !isSameExercise,
        isSwapped: !isSameExercise, // Dodatkowa flaga dla UI
        originalName: !isSameExercise ? original.name : null
    };
}

// --- KONTEKST KLINICZNY ---

// 1.2. Funkcja budująca kontekst kliniczny
function buildClinicalContext() {
    const wizard = (state.settings && state.settings.wizardData) || {};
    const restrictions = wizard.physical_restrictions || [];
    const triggers = wizard.trigger_movements || [];
    const reliefs = wizard.relief_movements || [];
    const painChar = wizard.pain_character || [];
    const painLocs = wizard.pain_locations || [];
    const diagnosis = wizard.medical_diagnosis || [];
    const painZones = state.settings.painZones || [];

    const tolerancePattern = detectTolerancePattern(triggers, reliefs);

    const painInt = parseInt(wizard.pain_intensity) || 0;
    const impact = parseInt(wizard.daily_impact) || 0;
    let severityScore = (painInt + impact) / 2;

    const isPainSharp =
        painChar.includes('sharp') ||
        painChar.includes('burning') ||
        painChar.includes('radiating');

    if (isPainSharp) {
        severityScore *= 1.2;
    }

    const isSevere = severityScore >= 6.5;

    const experienceKey = wizard.exercise_experience;
    const baseDifficultyCap = DIFFICULTY_MAP[experienceKey] || 2;

    let difficultyCap = baseDifficultyCap;
    if (isSevere) {
        difficultyCap = Math.min(baseDifficultyCap, 2);
    } else if (isPainSharp && severityScore >= 4) {
        difficultyCap = Math.min(baseDifficultyCap, 3);
    }

    return {
        restrictions,
        tolerancePattern,
        isSevere,
        isPainSharp,
        severityScore,
        difficultyCap,
        painZones,
        painLocations: painLocs,
        diagnosis,
        hasDisc: diagnosis.includes('disc_herniation')
    };
}

function detectTolerancePattern(triggers, reliefs) {
    if (!Array.isArray(triggers)) triggers = [];
    if (!Array.isArray(reliefs)) reliefs = [];

    if (triggers.includes('bending_forward') || reliefs.includes('bending_backward')) {
        return 'flexion_intolerant';
    }
    if (triggers.includes('bending_backward') || reliefs.includes('bending_forward')) {
        return 'extension_intolerant';
    }
    return 'neutral';
}

// --- HELPERY DO ODCZYTU PLANE/POSITION ---

// 2.1. Helpery do odczytu plane/position
function getPlane(ex) {
    return ex.primaryPlane || ex.primary_plane || 'multi';
}

function getPosition(ex) {
    return ex.position || ex.bodyPosition || null;
}

// 2.2. Główna funkcja reguł klinicznych do mixera
function passesMixerClinicalRules(ex, ctx) {
    if (!ctx) return true;

    const plane = getPlane(ex);
    const pos = getPosition(ex);
    const restrictions = ctx.restrictions || [];
    const zones = ex.painReliefZones || ex.pain_relief_zones || [];

    // Ograniczenia pozycji
    if (restrictions.includes('no_kneeling')) {
        if (pos === 'kneeling' || pos === 'quadruped') return false;
    }
    if (restrictions.includes('no_twisting')) {
        if (plane === 'rotation') return false;
    }
    if (restrictions.includes('no_floor_sitting')) {
        if (pos === 'sitting') return false;
    }

    // Wzorzec tolerancji
    if (ctx.tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !zones.includes('lumbar_flexion_intolerant')) {
            return false;
        }
    } else if (ctx.tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !zones.includes('lumbar_extension_intolerant')) {
            return false;
        }
    }

    // Cap trudności
    const lvl = ex.difficultyLevel || ex.difficulty_level || 1;
    if (ctx.difficultyCap && lvl > ctx.difficultyCap) {
        return false;
    }

    // Tryb ostry – trzymamy się ćwiczeń „ulga dla tej strefy"
    if (ctx.isSevere) {
        if (!zones || zones.length === 0) return false;
        if (!ctx.painZones || !ctx.painZones.some(z => zones.includes(z))) {
            return false;
        }
    }

    return true;
}