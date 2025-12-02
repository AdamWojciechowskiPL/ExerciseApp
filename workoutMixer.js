
import { state } from './state.js';
import { getISODate } from './utils.js';

/**
 * WORKOUT MIXER (Dynamic Biomechanical Matrix)
 * Moduł odpowiedzialny za dynamiczne dobieranie ćwiczeń i adaptację ich parametrów.
 */

const CACHE_FRESHNESS_DAYS = 60;
const SECONDS_PER_REP = 4; // Średni czas jednego powtórzenia (do konwersji)

export const workoutMixer = {

    mixWorkout: (staticDayPlan, forceShuffle = false) => {
        if (!staticDayPlan) return null;

        const dynamicPlan = JSON.parse(JSON.stringify(staticDayPlan));
        const sessionUsedIds = new Set();

        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!dynamicPlan[section]) return;

            dynamicPlan[section] = dynamicPlan[section].map(originalExercise => {
                const criteria = {
                    categoryId: originalExercise.categoryId,
                    targetLevel: originalExercise.difficultyLevel || 1,
                };

                const freshVariant = findFreshVariant(originalExercise, criteria, sessionUsedIds, forceShuffle);

                if (freshVariant) {
                    sessionUsedIds.add(freshVariant.id);
                    // Tutaj następuje inteligentne łączenie i przeliczanie
                    return mergeExerciseData(originalExercise, freshVariant);
                }

                sessionUsedIds.add(originalExercise.id || originalExercise.exerciseId);
                return originalExercise;
            });
        });

        dynamicPlan._isDynamic = true;
        return dynamicPlan;
    },

    getAlternative: (originalExercise, currentId) => {
        const criteria = {
            categoryId: originalExercise.categoryId,
            targetLevel: originalExercise.difficultyLevel || 1
        };
        const usedIds = new Set([currentId]); 
        const variant = findFreshVariant(originalExercise, criteria, usedIds, true);
        
        if (variant) {
            return mergeExerciseData(originalExercise, variant);
        }
        return originalExercise;
    },
    
    // Eksportujemy helper do przeliczania, aby training.js mógł go użyć przy ręcznym swapie
    adaptVolume: (oldEx, newDef) => adaptVolumeInternal(oldEx, newDef)
};

// --- HELPERY LOGICZNE ---

function adaptVolumeInternal(originalEx, newEx) {
    const oldVal = (originalEx.reps_or_time || "").toString();
    const isOldTimeBased = /s\b|min\b|:/.test(oldVal); // Czy oryginał był na czas?
    
    // Sprawdź preferencje nowego ćwiczenia (z bazy)
    // Jeśli maxDuration > 0 -> to ćwiczenie na czas (izometria)
    // Jeśli maxReps > 0 -> to ćwiczenie na powtórzenia (dynamika)
    const prefersTime = (newEx.maxDuration && newEx.maxDuration > 0);
    const prefersReps = (newEx.maxReps && newEx.maxReps > 0);
    
    let newVal = oldVal;

    // SCENARIUSZ 1: Zamiana CZAS -> POWTÓRZENIA (np. Plank 60s -> Brzuszki)
    if (isOldTimeBased && prefersReps && !prefersTime) {
        const seconds = parseSeconds(oldVal);
        // Konwersja: Czas / 4s
        let reps = Math.round(seconds / SECONDS_PER_REP);
        // Limit: Nie przekraczaj maxReps nowego ćwiczenia (bezpieczeństwo)
        if (newEx.maxReps) reps = Math.min(reps, newEx.maxReps);
        // Minimum 5 powtórzeń
        reps = Math.max(5, reps);
        
        // Obsługa stron (/str.)
        if (oldVal.includes("/str")) newVal = `${reps}/str.`;
        else newVal = `${reps}`;
    } 
    // SCENARIUSZ 2: Zamiana POWTÓRZENIA -> CZAS (np. Przysiad 15 -> Krzesełko)
    else if (!isOldTimeBased && prefersTime && !prefersReps) {
        const reps = parseReps(oldVal);
        // Konwersja: Reps * 4s
        let seconds = reps * SECONDS_PER_REP;
        // Limit: Nie przekraczaj maxDuration
        if (newEx.maxDuration) seconds = Math.min(seconds, newEx.maxDuration);
        // Minimum 15 sekund
        seconds = Math.max(15, seconds);
        
        if (oldVal.includes("/str")) newVal = `${seconds} s/str.`;
        else newVal = `${seconds} s`;
    }
    // SCENARIUSZ 3: Ten sam typ (Reps->Reps lub Time->Time), ale sprawdzamy LIMITY
    else {
        if (isOldTimeBased && newEx.maxDuration) {
             const seconds = parseSeconds(oldVal);
             // Jeśli oryginał to 60s, a nowe ma max 30s -> utnij do 30s
             if (seconds > newEx.maxDuration) {
                 newVal = oldVal.replace(/\d+/, newEx.maxDuration);
             }
        }
        else if (!isOldTimeBased && newEx.maxReps) {
             const reps = parseReps(oldVal);
             // Jeśli oryginał to 20, a nowe ma max 10 -> utnij do 10
             if (reps > newEx.maxReps) {
                 newVal = oldVal.replace(/\d+/, newEx.maxReps);
             }
        }
    }
    
    return newVal;
}

function parseSeconds(val) {
    const v = val.toLowerCase();
    if (v.includes('min')) return parseInt(v) * 60;
    return parseInt(v) || 45; // default fallback
}

function parseReps(val) {
    return parseInt(val) || 10;
}

function findFreshVariant(originalEx, criteria, usedIds, forceShuffle = false) {
    if (!criteria.categoryId) return null;

    let candidates = Object.values(state.exerciseLibrary).filter(ex => {
        if (ex.categoryId !== criteria.categoryId) return false;
        const lvl = ex.difficultyLevel || 1;
        if (Math.abs(lvl - criteria.targetLevel) > 1) return false;
        if (state.blacklist.includes(ex.id)) return false;
        if (usedIds.has(ex.id)) return false;
        return true;
    });

    if (candidates.length === 0) return null;

    const scoredCandidates = candidates.map(ex => {
        const lastDate = getLastPerformedDate(ex.id);
        let score = 0;

        if (!lastDate) {
            score = 100;
        } else {
            const daysSince = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
            score = Math.min(daysSince, CACHE_FRESHNESS_DAYS); 
            if (daysSince < 2) score = -100;
        }

        if ((ex.difficultyLevel || 1) === criteria.targetLevel) {
            score += 15;
        }

        const randomFactor = forceShuffle ? (Math.random() * 50) : (Math.random() * 5);
        score += randomFactor;

        return { ex, score };
    });

    scoredCandidates.sort((a, b) => b.score - a.score);

    if (scoredCandidates[0].score > -50) {
        return scoredCandidates[0].ex;
    }
    
    if (forceShuffle && scoredCandidates.length > 0) {
        return scoredCandidates[0].ex;
    }
    
    return null;
}

function getLastPerformedDate(exerciseId) {
    let latestDate = null;
    Object.keys(state.userProgress).forEach(dateKey => {
        const sessions = state.userProgress[dateKey];
        sessions.forEach(session => {
            if (!session.sessionLog) return;
            const found = session.sessionLog.find(logItem => logItem.exerciseId === exerciseId);
            if (found) {
                const d = new Date(dateKey);
                if (!latestDate || d > latestDate) latestDate = d;
            }
        });
    });
    return latestDate;
}

function mergeExerciseData(original, variant) {
    // Używamy nowej logiki adaptacji objętości
    const smartRepsOrTime = adaptVolumeInternal(original, variant);

    return {
        ...original,
        id: variant.id,
        exerciseId: variant.id,
        name: variant.name,
        description: variant.description,
        equipment: variant.equipment,
        youtube_url: variant.youtube_url,
        animationSvg: variant.animationSvg,
        
        // Nadpisujemy parametry nowymi, przeliczonymi
        reps_or_time: smartRepsOrTime,
        // Jeśli nowe ćwiczenie nie ma instrukcji tempo, bierzemy ze starego, ale jeśli ma - bierzemy nowe
        tempo_or_iso: variant.tempo_or_iso || original.tempo_or_iso,
        
        isDynamicSwap: (original.exerciseId !== variant.id),
        originalName: (original.exerciseId !== variant.id) ? original.name : null
    };
}