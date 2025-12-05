import { state } from './state.js';
import { getISODate, getAvailableMinutesForToday, parseSetCount } from './utils.js';
import { assistant } from './assistantEngine.js';

/**
 * WORKOUT MIXER (Dynamic Biomechanical Matrix)
 */

const CACHE_FRESHNESS_DAYS = 60;
const SECONDS_PER_REP = 4; 

export const workoutMixer = {

    mixWorkout: (staticDayPlan, forceShuffle = false) => {
        if (!staticDayPlan) return null;

        const dynamicPlan = JSON.parse(JSON.stringify(staticDayPlan));
        const sessionUsedIds = new Set();
        
        if (state.settings.painZones && state.settings.painZones.length > 0) {
            injectPrehabExercises(dynamicPlan, sessionUsedIds);
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

                const freshVariant = findFreshVariant(originalExercise, criteria, sessionUsedIds, forceShuffle || mustSwap, mustSwap);

                if (freshVariant) {
                    sessionUsedIds.add(freshVariant.id);
                    return mergeExerciseData(originalExercise, freshVariant);
                }

                if (mustSwap) {
                    originalExercise.equipmentWarning = true; 
                }

                sessionUsedIds.add(originalExercise.id || originalExercise.exerciseId);
                return originalExercise;
            });
        });

        const availableMinutes = getAvailableMinutesForToday();
        const estimatedMinutes = assistant.estimateDuration(dynamicPlan); 

        if (estimatedMinutes > availableMinutes) {
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
        const variant = findFreshVariant(originalExercise, criteria, usedIds, true, false);
        
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

function injectPrehabExercises(plan, usedIds) {
    if (!plan.warmup) plan.warmup = [];
    
    const libraryArray = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));

    state.settings.painZones.forEach(zone => {
        const rehabCandidates = libraryArray.filter(ex => {
            return ex.painReliefZones && ex.painReliefZones.includes(zone) && !usedIds.has(ex.id) && checkEquipment(ex);
        });

        if (rehabCandidates.length > 0) {
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
    
    // Pobranie limitów z bazy (lub 0 jeśli brak)
    const newMaxDuration = newEx.maxDuration || 0;
    const newMaxReps = newEx.maxReps || 0;

    let newVal = oldVal;

    // SCENARIUSZ 1: Konwersja Czas (np. 2 min) -> Powtórzenia (limit np. 12 reps)
    if (isOldTimeBased && newMaxReps > 0 && newMaxDuration === 0) {
        const seconds = parseSeconds(oldVal);
        let reps = Math.round(seconds / SECONDS_PER_REP);
        reps = Math.min(reps, newMaxReps); // Cięcie do limitu
        reps = Math.max(5, reps); // Minimum 5
        newVal = `${reps}`;
    } 
    // SCENARIUSZ 2: Konwersja Powtórzenia -> Czas (limit np. 30s)
    else if (!isOldTimeBased && newMaxDuration > 0 && newMaxReps === 0) {
        const reps = parseReps(oldVal);
        let seconds = reps * SECONDS_PER_REP;
        seconds = Math.min(seconds, newMaxDuration); // Cięcie do limitu
        seconds = Math.max(15, seconds); // Minimum 15s
        newVal = `${seconds} s`;
    }
    // SCENARIUSZ 3: Ten sam typ (Czas -> Czas LUB Powt -> Powt)
    else {
        // A. Czas -> Czas (np. 2 min -> max 30s)
        if (isOldTimeBased && newMaxDuration > 0) {
             const seconds = parseSeconds(oldVal);
             if (seconds > newMaxDuration) {
                 // CRITICAL FIX: Jeśli przekroczono limit, wymuszamy jednostkę "s"
                 // Ignorujemy oryginalne "min"
                 newVal = `${newMaxDuration} s`;
             }
        }
        // B. Powtórzenia -> Powtórzenia (np. 20 -> max 10)
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
        // Parsuje "2 min" na 120 sekund
        return parseFloat(v) * 60;
    }
    // Parsuje "45 s" na 45 sekund
    return parseInt(v) || 45; 
}

function parseReps(val) {
    return parseInt(val) || 10;
}

function findFreshVariant(originalEx, criteria, usedIds, forceShuffle = false, mustSwap = false) {
    if (!criteria.categoryId) return null;

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

            return true;
        });

    if (candidates.length === 0) return null;

    const scoredCandidates = candidates.map(ex => {
        const lastDate = getLastPerformedDate(ex.id, ex.name);
        let score = 0;

        if (!lastDate) {
            score = 100;
        } else {
            const daysSince = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
            score = Math.min(daysSince, CACHE_FRESHNESS_DAYS); 
            if (daysSince < 2) score = -100;
        }

        if ((ex.difficultyLevel || 1) === criteria.targetLevel) score += 15;

        const randomFactor = forceShuffle ? (Math.random() * 50) : (Math.random() * 5);
        score += randomFactor;

        return { ex, score };
    });

    scoredCandidates.sort((a, b) => b.score - a.score);

    if (mustSwap && scoredCandidates.length > 0) return scoredCandidates[0].ex;
    if (scoredCandidates[0].score > -50) return scoredCandidates[0].ex;
    if (forceShuffle && scoredCandidates.length > 0) return scoredCandidates[0].ex;
    
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
        originalName: !isSameExercise ? original.name : null
    };
}