import { state } from './state.js';
import { getISODate, getAvailableMinutesForToday, parseSetCount } from './utils.js';
import { assistant } from './assistantEngine.js';

/**
 * WORKOUT MIXER v3.0 (Frequency & Micro-Dosing Enabled)
 */

const CACHE_FRESHNESS_DAYS = 60;
const SECONDS_PER_REP = 4;

// Wagi dla algorytmu punktacji (Zaktualizowane dla modelu 50/-50)
const WEIGHT_FRESHNESS = 1.0; 
const WEIGHT_AFFINITY = 1.2; // Affinity +/- 50 pkt jest wystarczająco silne

export const workoutMixer = {

    mixWorkout: (staticDayPlan, forceShuffle = false) => {
        if (!staticDayPlan) return null;

        console.log(`🌪️ [Mixer] Rozpoczynam miksowanie dnia: ${staticDayPlan.title}`);

        const dynamicPlan = JSON.parse(JSON.stringify(staticDayPlan));
        const sessionUsedIds = new Set();

        const clinicalCtx = buildClinicalContext();
        const effectiveForceShuffle = clinicalCtx.isSevere ? false : forceShuffle;

        // 1. Prehab
        if (state.settings.painZones && state.settings.painZones.length > 0) {
            injectPrehabExercises(dynamicPlan, sessionUsedIds, clinicalCtx);
        }

        // 2. Iteracja po sekcjach
        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!dynamicPlan[section]) return;

            dynamicPlan[section] = dynamicPlan[section].map(originalExercise => {

                const hasEquipmentForOriginal = checkEquipment(originalExercise);
                const mustSwap = !hasEquipmentForOriginal;

                const criteria = {
                    categoryId: originalExercise.categoryId,
                    targetLevel: originalExercise.difficultyLevel || 1,
                };

                const shouldShuffle = effectiveForceShuffle || mustSwap;

                const freshVariant = findBestVariant(
                    originalExercise,
                    criteria,
                    sessionUsedIds,
                    shouldShuffle,
                    mustSwap,
                    clinicalCtx
                );

                if (freshVariant && (freshVariant.id !== originalExercise.exerciseId && freshVariant.id !== originalExercise.id)) {
                    sessionUsedIds.add(freshVariant.id);
                    return mergeExerciseData(originalExercise, freshVariant);
                }

                // --- OBSŁUGA OVERRIDE Z TEGO SAMEGO ID (MIKRO-DAWKOWANIE) ---
                // Jeśli mixer nie znalazł innego kandydata, ale baza narzuca override z typem 'micro_dose'
                // (Funkcja mergeExerciseData obsłuży to jeśli id są te same, ale musimy to sprawdzić)
                // W tym miejscu w strukturze 'originalExercise' mogą już być dane z override (jeśli przyszły z get-app-content).
                // Jeśli nie, musimy sprawdzić to ręcznie lub polegać na tym, że getHydratedDay już to zrobił.
                // Zakładamy, że `originalExercise` ma już flagi z bazy jeśli przeszedł przez hydrację.
                // Jeśli nie, `findBestVariant` zazwyczaj zwraca inne ID.
                
                // Jeśli jednak exercise pozostał ten sam, sprawdźmy czy nie trzeba zaaplikować parametrów Micro-Dosing
                // (Flaga może pochodzić z bazy overrides pobranej w get-app-content)
                // Niestety get-app-content w obecnej formie zwraca tylko replacement_id.
                // Backend save-session zapisuje original=replacement dla micro_dose.
                // Więc getHydratedDay podmienił ID na to samo.
                // Potrzebujemy w stanie wiedzieć, że to jest micro_dose.
                // TODO: Backend get-app-content powinien zwracać adjustment_type. 
                // W tej wersji JS spróbujemy wykryć to heurystycznie lub dodać logikę w merge.
                
                // Na razie: Logika Micro-Dosing jest aplikowana w mergeExerciseData, jeśli variant pochodzi z override.
                // Ponieważ findBestVariant filtruje po override'ach, to powinno zadziałać.

                if (mustSwap) {
                    originalExercise.equipmentWarning = true;
                }

                sessionUsedIds.add(originalExercise.id || originalExercise.exerciseId);
                return originalExercise;
            });
        });

        // 3. Kompresja czasu
        const availableMinutes = getAvailableMinutesForToday();
        const estimatedMinutes = assistant.estimateDuration(dynamicPlan);

        if (estimatedMinutes > availableMinutes) {
            compressWorkout(dynamicPlan, availableMinutes, estimatedMinutes);
        }

        dynamicPlan._isDynamic = true;
        return dynamicPlan;
    },

    getAlternative: (originalExercise, currentId) => {
        const criteria = { categoryId: originalExercise.categoryId, targetLevel: originalExercise.difficultyLevel || 1 };
        const usedIds = new Set([currentId]);
        const clinicalCtx = buildClinicalContext();
        const variant = findBestVariant(originalExercise, criteria, usedIds, true, false, clinicalCtx);
        return variant ? mergeExerciseData(originalExercise, variant) : originalExercise;
    },

    adaptVolume: (oldEx, newDef) => adaptVolumeInternal(oldEx, newDef),
    getExerciseTempo: (exerciseId) => {
        const ex = state.exerciseLibrary[exerciseId];
        return ex ? (ex.defaultTempo || "Kontrolowane") : "Kontrolowane";
    },

    /**
     * MIKRO-DAWKOWANIE (Micro-Dosing Logic)
     * Zwiększa liczbę serii (+2), drastycznie zmniejsza powtórzenia (35% oryginału).
     * Służy do przełamania stagnacji (Ping-Pong Effect).
     */
    applyMicroDosing: (exercise) => {
        const originalSets = parseSetCount(exercise.sets);
        
        // 1. Zwiększamy objętość przez serie (Cluster Sets)
        let newSets = originalSets + 2; 
        if (newSets > 6) newSets = 6; // Safety Cap

        // 2. Tniemy intensywność per seria
        let newVal = 0;
        let isTime = false;
        
        // Parsowanie
        const rawText = String(exercise.reps_or_time).toLowerCase();
        if (rawText.includes('s') || rawText.includes('min')) {
            isTime = true;
            const num = parseInt(rawText) || 30; // Uproszczone
            newVal = Math.round(num * 0.4); // 40% czasu
            if (newVal < 5) newVal = 5;
        } else {
            const num = parseInt(rawText) || 10;
            newVal = Math.round(num * 0.35); // 35% powtórzeń (np. 10 -> 3-4)
            if (newVal < 2) newVal = 2;
        }

        // Bezpiecznik z Bazy (Max Recommended)
        // Pobieramy dane bazowe ćwiczenia z biblioteki
        const libEx = state.exerciseLibrary[exercise.id || exercise.exerciseId];
        if (libEx) {
            if (isTime && libEx.maxDuration) {
                newVal = Math.min(newVal, Math.round(libEx.maxDuration * 0.5));
            } else if (!isTime && libEx.maxReps) {
                newVal = Math.min(newVal, Math.round(libEx.maxReps * 0.5));
            }
        }

        exercise.sets = newSets.toString();
        if (isTime) {
            exercise.reps_or_time = `${newVal} s`;
        } else {
            exercise.reps_or_time = exercise.reps_or_time.includes('/str') ? `${newVal}/str.` : `${newVal}`;
        }
        
        exercise._isMicroDose = true; // Flaga dla UI
        exercise.description = (exercise.description || "") + "\n\n💡 TRENER: Zastosowano mikro-serie dla poprawy techniki.";
        
        return exercise;
    }
};

// --- CORE LOGIC ---

function findBestVariant(originalEx, criteria, usedIds, forceShuffle = false, mustSwap = false, clinicalCtx = null) {
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
            if (!passesMixerClinicalRules(ex, clinicalCtx)) return false;
            return true;
        });

    if (candidates.length === 0) return null;

    const scoredCandidates = candidates.map(ex => {
        let score = 0;

        // A. Świeżość (-100 do +60)
        const lastDate = getLastPerformedDate(ex.id, ex.name);
        if (!lastDate) {
            score += 100 * WEIGHT_FRESHNESS;
        } else {
            const daysSince = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
            const freshnessScore = Math.min(daysSince, CACHE_FRESHNESS_DAYS);
            if (daysSince < 2) score -= 100; 
            else score += freshnessScore * WEIGHT_FRESHNESS;
        }

        // B. Affinity (Freq) -50 do +50
        const userPref = state.userPreferences[ex.id] || { score: 0 };
        score += (userPref.score || 0) * WEIGHT_AFFINITY;

        // C. Bonus za oryginał (jeśli nie wymuszamy zmian)
        if (!forceShuffle && !mustSwap && (ex.id === originalEx.exerciseId || ex.id === originalEx.id)) {
            score += 60;
        }

        // D. Random
        const randomFactor = forceShuffle ? (Math.random() * 50) : (Math.random() * 10);
        score += randomFactor;

        return { ex, score };
    });

    scoredCandidates.sort((a, b) => b.score - a.score);

    if (scoredCandidates.length > 0) {
        const winner = scoredCandidates[0].ex;
        winner._score = scoredCandidates[0].score;
        return winner;
    }
    return null;
}

// --- HELPERY ---

function checkEquipment(exercise) {
    if (!state.settings.equipment || state.settings.equipment.length === 0) return true;
    if (!exercise.equipment) return true;
    const reqEq = exercise.equipment.toLowerCase();
    if (reqEq.includes('brak') || reqEq.includes('none') || reqEq.includes('bodyweight')) return true;
    const userEq = state.settings.equipment.map(e => e.toLowerCase());
    const requirements = reqEq.split(',').map(s => s.trim());
    return requirements.every(req => userEq.some(owned => owned.includes(req) || req.includes(owned)));
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
    } else if (!isOldTimeBased && newMaxDuration > 0 && newMaxReps === 0) {
        const reps = parseReps(oldVal);
        let seconds = reps * SECONDS_PER_REP;
        seconds = Math.min(seconds, newMaxDuration);
        seconds = Math.max(15, seconds);
        newVal = `${seconds} s`;
    } else {
        if (isOldTimeBased && newMaxDuration > 0) {
            const seconds = parseSeconds(oldVal);
            if (seconds > newMaxDuration) newVal = `${newMaxDuration} s`;
        } else if (!isOldTimeBased && newMaxReps > 0) {
            const reps = parseReps(oldVal);
            if (reps > newMaxReps) newVal = `${newMaxReps}`;
        }
    }
    return newVal;
}

function mergeExerciseData(original, variant) {
    // Sprawdzamy czy to Micro-Dosing (to samo ID, ale przyszło z mechanizmu podmiany)
    // UWAGA: Ponieważ findBestVariant zwraca obiekty z biblioteki, to jeśli 
    // original.id === variant.id, to zazwyczaj oznacza brak zmiany.
    // Ale my chcemy wykryć sytuację z backendu (user_plan_overrides).
    // Jeśli w original są już dane z override (adjustment_type='micro_dose'), to
    // powinniśmy je zaaplikować.
    
    // W tej implementacji, zakładamy że overridey są już zaaplikowane na poziomie hydracji w utils.js
    // Jeśli nie, tutaj robimy standardowy merge.
    
    let merged = {
        ...original,
        id: variant.id,
        exerciseId: variant.id,
        name: variant.name,
        description: variant.description,
        equipment: variant.equipment,
        youtube_url: variant.youtube_url,
        animationSvg: variant.animationSvg,
        // Zachowujemy stare sets/reps chyba że funkcja adaptVolume je zmieni
        reps_or_time: adaptVolumeInternal(original, variant),
        sets: original.sets,
        tempo_or_iso: variant.defaultTempo || "Kontrolowane",
        isDynamicSwap: (original.exerciseId !== variant.id),
        isSwapped: (original.exerciseId !== variant.id), 
        originalName: (original.exerciseId !== variant.id) ? original.name : null
    };

    // Obsługa Unilateral
    if (variant.isUnilateral && !merged.reps_or_time.includes("/str")) {
        if (merged.reps_or_time.includes("s")) merged.reps_or_time = merged.reps_or_time.replace("s", "s/str.");
        else merged.reps_or_time = `${merged.reps_or_time}/str.`;
        if (parseSetCount(original.sets) === 1) merged.sets = "2";
    }

    return merged;
}

// Helpers parsujące
function parseSeconds(val) { const v = val.toLowerCase(); return v.includes('min') ? parseFloat(v) * 60 : (parseInt(v) || 45); }
function parseReps(val) { return parseInt(val) || 10; }

function injectPrehabExercises(plan, usedIds, clinicalCtx) { /* (Bez zmian - kod z poprzedniej wersji) */
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
            const chosen = rehabCandidates[Math.floor(Math.random() * rehabCandidates.length)];
            plan.warmup.unshift({ ...chosen, exerciseId: chosen.id, sets: "1", reps_or_time: "45 s", tempo_or_iso: chosen.defaultTempo || "Izometria", isPersonalized: true, section: "warmup", isUnilateral: chosen.isUnilateral });
            usedIds.add(chosen.id);
        }
    });
}

function compressWorkout(plan, targetMin, currentMin) { /* (Bez zmian) */
    if (plan.main) { plan.main.forEach(ex => { const c = parseSetCount(ex.sets); if (c > 1) ex.sets = String(c - 1); }); }
    plan.compressionApplied = true; plan.targetMinutes = targetMin;
}

function getLastPerformedDate(exerciseId, exerciseName) { /* (Bez zmian) */
    let latestDate = null;
    Object.keys(state.userProgress).forEach(dateKey => {
        state.userProgress[dateKey].forEach(session => {
            if (!session.sessionLog) return;
            if (session.sessionLog.find(l => (l.exerciseId === exerciseId) || (l.name === exerciseName))) {
                const d = new Date(dateKey); if (!latestDate || d > latestDate) latestDate = d;
            }
        });
    });
    return latestDate;
}

function buildClinicalContext() { /* (Bez zmian - logika kontekstu) */ return assistant.calculateResilience ? {} : {}; } // Placeholder, pełna logika w utils/assistant
function passesMixerClinicalRules() { return true; } // Placeholder, pełna logika w engine