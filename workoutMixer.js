// ExerciseApp/workoutMixer.js
import { state } from './state.js';
import { buildClinicalContext, checkExerciseAvailability } from './clinicalEngine.js';

// workoutMixer.js v3.3 (Cleaned up Devolution Logic)

export const workoutMixer = {

    // Helper do ręcznej wymiany ćwiczeń (używany w Training Screen -> Swap Modal)
    getAlternative: (originalExercise, currentId) => {
        const criteria = { categoryId: originalExercise.categoryId, targetLevel: originalExercise.difficultyLevel || 1 };
        const usedIds = new Set([currentId]);
        const wizardData = state.settings.wizardData || {};
        const clinicalCtx = buildClinicalContext(wizardData);
        clinicalCtx.blockedIds = new Set(state.blacklist || []);

        const variant = findBestVariant(originalExercise, criteria, usedIds, true, false, clinicalCtx);
        return variant ? mergeExerciseData(originalExercise, variant) : originalExercise;
    },

    // USUNIĘTO: getEasierVariant (nieużywane)

    adaptVolume: (oldEx, newDef) => adaptVolumeInternal(oldEx, newDef),

    getExerciseTempo: (exerciseId) => {
        const ex = state.exerciseLibrary[exerciseId];
        return ex ? (ex.defaultTempo || "Kontrolowane") : "Kontrolowane";
    }
};

// --- HELPERY WEWNĘTRZNE ---

function findBestVariant(originalEx, criteria, usedIds, forceShuffle = false, mustSwap = false, clinicalCtx = null) {
    if (!criteria.categoryId) return null;
    let candidates = Object.entries(state.exerciseLibrary)
        .map(([id, data]) => ({ id: id, ...data }))
        .filter(ex => {
            if (ex.categoryId !== criteria.categoryId) return false;
            // Przy ręcznym swapie pozwalamy na +/- 1 poziom trudności
            const lvl = ex.difficultyLevel || 1;
            if (Math.abs(lvl - criteria.targetLevel) > 1) return false;

            if (usedIds.has(ex.id)) return false;

            const result = checkExerciseAvailability(ex, clinicalCtx, { ignoreDifficulty: true, ignoreEquipment: false });
            return result.allowed;
        });

    if (candidates.length === 0) return null;

    // Proste sortowanie po preferencjach
    candidates.sort((a, b) => {
        const prefA = (state.userPreferences[a.id]?.score || 0);
        const prefB = (state.userPreferences[b.id]?.score || 0);
        return prefB - prefA;
    });

    return candidates[0];
}

function adaptVolumeInternal(originalEx, newEx) {
    const SECONDS_PER_REP = state.settings.secondsPerRep || 6;

    if (['breathing', 'breathing_control', 'muscle_relaxation'].includes(newEx.categoryId)) {
        let minDuration = 60;
        if (newEx.maxDuration) minDuration = Math.max(60, Math.min(newEx.maxDuration, 120));
        return `${minDuration} s`;
    }
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
    let merged = {
        ...original,
        id: variant.id,
        exerciseId: variant.id,
        name: variant.name,
        description: variant.description,
        equipment: variant.equipment,
        youtube_url: variant.youtube_url,
        animationSvg: variant.animationSvg,
        hasAnimation: variant.hasAnimation,
        reps_or_time: adaptVolumeInternal(original, variant),
        sets: original.sets,
        tempo_or_iso: variant.defaultTempo || "Kontrolowane",
        isDynamicSwap: (original.exerciseId !== variant.id),
        isSwapped: (original.exerciseId !== variant.id),
        originalName: (original.exerciseId !== variant.id) ? original.name : null
    };
    if (variant.isUnilateral && !merged.reps_or_time.includes("/str")) {
        if (merged.reps_or_time.includes("s")) merged.reps_or_time = merged.reps_or_time.replace("s", "s/str.");
        else merged.reps_or_time = `${merged.reps_or_time}/str.`;

        // Reset serii do 1 jeśli w oryginale była tylko 1, a nowe jest na stronę (unikamy 1 seria Lewa, brak Prawej)
        if (original.sets === "1") merged.sets = "1";
    }
    return merged;
}

function parseSeconds(val) { const v = val.toLowerCase(); return v.includes('min') ? parseFloat(v) * 60 : (parseInt(v) || 45); }
function parseReps(val) { return parseInt(val) || 10; }