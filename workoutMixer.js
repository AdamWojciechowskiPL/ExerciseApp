import { state } from './state.js';
import { getISODate, getAvailableMinutesForToday, parseSetCount } from './utils.js';
import { assistant } from './assistantEngine.js';

/**
 * WORKOUT MIXER (Dynamic Biomechanical Matrix) v2.0 (Affinity Engine Enabled)
 * 
 * Odpowiada za dobór ćwiczeń uwzględniając:
 * 1. Reguły kliniczne (Ból, Ograniczenia) - PRIORYTET
 * 2. Sprzęt
 * 3. Świeżość (Kiedy ostatnio robione)
 * 4. Preferencje użytkownika (Affinity Score - Like/Dislike)
 * 5. Bezpieczniki trudności (Difficulty Rating - Too Hard)
 */

const CACHE_FRESHNESS_DAYS = 60;
const SECONDS_PER_REP = 4;

// Wagi dla algorytmu punktacji
const WEIGHT_FRESHNESS = 1.0;
const WEIGHT_AFFINITY = 1.5; // Preferencje mają duży wpływ (Like +20 = +30 pkt w rankingu)
const PENALTY_TOO_HARD = 50; // Kara za oznaczenie "Za trudne"

// Mapowanie doświadczenia
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

        // 1. Inicjalizacja kontekstu klinicznego
        const clinicalCtx = buildClinicalContext();
        
        // W trybie ostrym (Severe) wyłączamy losowość, ale nadal uwzględniamy preferencje w ramach bezpiecznych ćwiczeń
        const effectiveForceShuffle = clinicalCtx.isSevere ? false : forceShuffle;

        // 2. Prehab (Rozgrzewka celowana)
        if (state.settings.painZones && state.settings.painZones.length > 0) {
            injectPrehabExercises(dynamicPlan, sessionUsedIds, clinicalCtx);
        }

        // 3. Iteracja po sekcjach
        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!dynamicPlan[section]) return;

            dynamicPlan[section] = dynamicPlan[section].map(originalExercise => {

                const hasEquipmentForOriginal = checkEquipment(originalExercise);
                const mustSwap = !hasEquipmentForOriginal;

                // Kryteria poszukiwania alternatywy
                const criteria = {
                    categoryId: originalExercise.categoryId,
                    targetLevel: originalExercise.difficultyLevel || 1,
                };

                // Decyzja czy szukać zamiennika
                const shouldShuffle = effectiveForceShuffle || mustSwap;

                // --- GŁÓWNY MECHANIZM WYBORU ---
                const freshVariant = findBestVariant(
                    originalExercise,
                    criteria,
                    sessionUsedIds,
                    shouldShuffle,
                    mustSwap,
                    clinicalCtx
                );

                if (freshVariant && (freshVariant.id !== originalExercise.exerciseId && freshVariant.id !== originalExercise.id)) {
                    console.log(`🔀 [Mixer] Zamiana: ${originalExercise.name} -> ${freshVariant.name} (Score: ${freshVariant._score?.toFixed(1)})`);
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

        // 4. Kompresja czasu (jeśli potrzebna)
        const availableMinutes = getAvailableMinutesForToday();
        const estimatedMinutes = assistant.estimateDuration(dynamicPlan);

        if (estimatedMinutes > availableMinutes) {
            console.log(`⏱️ [Mixer] Kompresja czasu: ${estimatedMinutes}m -> ${availableMinutes}m`);
            compressWorkout(dynamicPlan, availableMinutes, estimatedMinutes);
        }

        dynamicPlan._isDynamic = true;
        return dynamicPlan;
    },

    getAlternative: (originalExercise, currentId) => {
        const criteria = {
            categoryId: originalExercise.categoryId,
            targetLevel: originalExercise.difficultyLevel || 1
        };
        const usedIds = new Set([currentId]);
        const clinicalCtx = buildClinicalContext();
        
        // Wymuszamy shuffle=true
        const variant = findBestVariant(originalExercise, criteria, usedIds, true, false, clinicalCtx);

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

// --- CORE LOGIC: RANKING I WYBÓR ---

/**
 * Znajduje najlepszy wariant ćwiczenia na podstawie:
 * 1. Reguł klinicznych (Filtr twardy)
 * 2. Punktacji (Score): Świeżość + Affinity (Preferencje) - Difficulty Penalty
 */
function findBestVariant(originalEx, criteria, usedIds, forceShuffle = false, mustSwap = false, clinicalCtx = null) {
    if (!criteria.categoryId) return null;

    // 1. FILTROWANIE KANDYDATÓW
    let candidates = Object.entries(state.exerciseLibrary)
        .map(([id, data]) => ({ id: id, ...data }))
        .filter(ex => {
            // A. Kategoria
            if (ex.categoryId !== criteria.categoryId) return false;

            // B. Poziom trudności (jeśli nie jest to wymuszona zamiana z braku sprzętu, trzymamy się poziomu +/- 1)
            if (!mustSwap) {
                const lvl = ex.difficultyLevel || 1;
                if (Math.abs(lvl - criteria.targetLevel) > 1) return false;
            }

            // C. Czarna lista i Użyte w sesji
            if (state.blacklist.includes(ex.id)) return false;
            if (usedIds.has(ex.id)) return false;

            // D. Sprzęt
            if (!checkEquipment(ex)) return false;

            // E. Reguły Kliniczne (Safety First!)
            if (!passesMixerClinicalRules(ex, clinicalCtx)) return false;

            return true;
        });

    if (candidates.length === 0) return null;

    // 2. PUNKTACJA (SCORING)
    const scoredCandidates = candidates.map(ex => {
        let score = 0;

        // A. Świeżość (Kiedy ostatnio robione?)
        // Range: -100 (wczoraj) do +60 (dawno temu)
        const lastDate = getLastPerformedDate(ex.id, ex.name);
        if (!lastDate) {
            score += 100 * WEIGHT_FRESHNESS; // Nie robione nigdy? Priorytet.
        } else {
            const daysSince = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
            const freshnessScore = Math.min(daysSince, CACHE_FRESHNESS_DAYS);
            
            if (daysSince < 2) score -= 100; // Robione wczoraj/dziś? Kara.
            else score += freshnessScore * WEIGHT_FRESHNESS;
        }

        // B. Preferencje (Affinity Score)
        // Range: -100 do +100. Mnożnik 1.5x
        const userPref = state.userPreferences[ex.id] || { score: 0, difficulty: 0 };
        const affinityPoints = (userPref.score || 0) * WEIGHT_AFFINITY;
        score += affinityPoints;

        // C. Bezpiecznik Trudności (Difficulty Flag)
        // Jeśli użytkownik oznaczył jako "Za trudne" (difficulty === 1)
        if (userPref.difficulty === 1) {
            score -= PENALTY_TOO_HARD; // -50 pkt
        }
        // Jeśli oznaczył jako "Za łatwe" (-1), lekka kara (bo pewnie nudne), ale mniejsza
        if (userPref.difficulty === -1) {
            score -= 5; 
        }

        // D. Bonus za idealny poziom trudności
        if ((ex.difficultyLevel || 1) === criteria.targetLevel) score += 15;

        // E. Bonus za bycie oryginałem (stabilność planu)
        // Jeśli nie wymuszamy tasowania, oryginał ma duży bonus, żeby nie zmieniać bez sensu
        if (!forceShuffle && !mustSwap && (ex.id === originalEx.exerciseId || ex.id === originalEx.id)) {
            score += 60; // Podbito z 50, żeby przebić affinity lekkie
        }

        // F. Losowość (Entropy)
        // Jeśli forceShuffle=true, losowość jest duża, żeby przełamać rutynę
        const randomFactor = forceShuffle ? (Math.random() * 50) : (Math.random() * 10);
        score += randomFactor;

        return { ex, score };
    });

    // 3. SORTOWANIE I WYBÓR
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Debugging (opcjonalny)
    // if (criteria.categoryId === 'core_anti_extension') {
    //     console.log(`[Mixer Score] Top for ${criteria.categoryId}:`);
    //     scoredCandidates.slice(0, 3).forEach(c => console.log(` - ${c.ex.name}: ${c.score.toFixed(1)} (Affinity: ${state.userPreferences[c.ex.id]?.score || 0})`));
    // }

    if (scoredCandidates.length > 0) {
        // Zwracamy obiekt z dopisanym _score do debugowania
        const winner = scoredCandidates[0].ex;
        winner._score = scoredCandidates[0].score;
        return winner;
    }

    return null;
}

// --- HELPERY LOGICZNE (Bez zmian lub drobne poprawki) ---

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

function injectPrehabExercises(plan, usedIds, clinicalCtx) {
    if (!plan.warmup) plan.warmup = [];

    const libraryArray = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));

    state.settings.painZones.forEach(zone => {
        const rehabCandidates = libraryArray.filter(ex => {
            if (!ex.painReliefZones || !ex.painReliefZones.includes(zone)) return false;
            if (usedIds.has(ex.id)) return false;
            if (!checkEquipment(ex)) return false;
            if (!passesMixerClinicalRules(ex, clinicalCtx)) return false;
            return true;
        });

        if (rehabCandidates.length > 0) {
            // Tutaj też można by dodać ważenie preferencjami, ale prehab rządzi się swoimi prawami (medycznymi)
            const chosen = rehabCandidates[Math.floor(Math.random() * rehabCandidates.length)];
            
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
        isSwapped: !isSameExercise, 
        originalName: !isSameExercise ? original.name : null
    };
}

// --- KONTEKST KLINICZNY ---

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

function getPlane(ex) {
    return ex.primaryPlane || ex.primary_plane || 'multi';
}

function getPosition(ex) {
    return ex.position || ex.bodyPosition || null;
}

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