// assistantEngine.js

import { state } from './state.js';
import { parseSetCount, getExerciseDuration } from './utils.js';

/**
 * MÓZG SYSTEMU (ASSISTANT ENGINE) v3.7 (Linear Scaling Fix)
 * Naprawiono błąd, w którym tryb CARE był dłuższy od ECO przez różnice w limicie serii jednostronnych.
 */

export const assistant = {

    calculateResilience: () => {
        if (state.userStats && state.userStats.resilience) {
            return state.userStats.resilience;
        }
        return { score: 0, status: 'Vulnerable', daysSinceLast: 0, sessionCount: 0 };
    },

    estimateDuration: (dayPlan) => {
        if (!dayPlan) return 0;

        const globalSecondsPerRep = state.settings.secondsPerRep || 6;
        const restBetweenSets = state.settings.restBetweenSets || 30;
        const restBetweenExercises = state.settings.restBetweenExercises || 30;

        let totalSeconds = 0;
        const allExercises = [
            ...(dayPlan.warmup || []),
            ...(dayPlan.main || []),
            ...(dayPlan.cooldown || [])
        ];

        allExercises.forEach((exercise, index) => {
            const sets = parseSetCount(exercise.sets);
            
            const isUnilateral = exercise.isUnilateral ||
                                 exercise.is_unilateral ||
                                 String(exercise.reps_or_time).includes('/str') ||
                                 String(exercise.reps_or_time).includes('stron');

            const multiplier = isUnilateral ? 2 : 1;

            // workTimePerSet uwzględnia już multiplier w getExerciseDuration dla ćwiczeń na czas
            let workTimePerSet = getExerciseDuration(exercise);

            if (workTimePerSet === null) {
                const repsString = String(exercise.reps_or_time).toLowerCase();
                const repsMatch = repsString.match(/(\d+)/);
                const reps = repsMatch ? parseInt(repsMatch[0], 10) : 10;

                const exId = exercise.id || exercise.exerciseId;
                const personalPace = state.exercisePace ? state.exercisePace[exId] : null;
                const tempoToUse = personalPace || globalSecondsPerRep;

                // Czas = Powtórzenia * Tempo * 2 (jeśli na stronę)
                workTimePerSet = reps * tempoToUse * multiplier;
            }

            totalSeconds += sets * workTimePerSet;

            if (sets > 1) {
                totalSeconds += (sets - 1) * restBetweenSets;
            }

            if (index < allExercises.length - 1) {
                totalSeconds += restBetweenExercises;
            }
        });

        return Math.ceil(totalSeconds / 60);
    },

    adjustTrainingVolume: (dayPlan, painLevel, timeFactor = 1.0) => {
        if (!dayPlan) return null;

        const modifiedPlan = JSON.parse(JSON.stringify(dayPlan));

        let mode = 'standard';
        let painMessage = null;

        let targetSetsMode = 'normal'; 
        let addBoostSet = false;
        let intensityScale = 1.0;

        // --- 1. DEFINICJA PROGÓW (Gwarancja liniowości) ---
        if (painLevel <= 1) {
            mode = 'boost';
            addBoostSet = true;
            intensityScale = 1.0;
        }
        else if (painLevel >= 2 && painLevel <= 3) {
            mode = 'standard';
            intensityScale = 1.0;
        }
        else if (painLevel >= 4 && painLevel <= 5) {
            mode = 'eco';
            painMessage = "Tryb Oszczędny (Eco).";
            targetSetsMode = 'minus_step';
            intensityScale = 0.8; // Redukcja powtórzeń o 20%
        }
        else if (painLevel >= 6 && painLevel <= 7) {
            mode = 'care';
            painMessage = "Tryb Ostrożny (Care).";
            targetSetsMode = 'minimum';
            intensityScale = 0.6; // Redukcja powtórzeń o 40% (Klucz do skrócenia sesji)
        }
        else {
            mode = 'sos';
            painMessage = "Zalecany tryb SOS.";
            targetSetsMode = 'minimum';
            intensityScale = 0.45; // Redukcja o ponad połowę
        }

        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!modifiedPlan[section]) return;

            modifiedPlan[section].forEach(exercise => {
                let currentSets = parseSetCount(exercise.sets);

                const isUnilateral = exercise.isUnilateral ||
                                     exercise.is_unilateral ||
                                     String(exercise.reps_or_time).includes('/str') ||
                                     String(exercise.reps_or_time).includes('stron');

                const stepSize = isUnilateral ? 2 : 1;
                // WAŻNE: Minimum to zawsze pełny cykl (1 dla zwykłych, 2 dla jednostronnych)
                const minSetsFloor = isUnilateral ? 2 : 1;

                let modificationBadge = null;

                // --- KROK 1: MODYFIKACJA SERII ---
                if (addBoostSet) {
                    const limit = isUnilateral ? 6 : 4;
                    if (section === 'main' && currentSets < limit) {
                        currentSets += stepSize;
                        modificationBadge = { type: 'boost', label: `🚀 BOOST: +${stepSize} serii` };
                    }
                }
                else if (targetSetsMode === 'minus_step') {
                    // ECO: Zmniejszamy, ale NIE poniżej floor (żeby nie uciąć jednej nogi)
                    currentSets = Math.max(minSetsFloor, currentSets - stepSize);
                }
                else if (targetSetsMode === 'minimum') {
                    // CARE/SOS: Zawsze schodzimy do minimum
                    currentSets = minSetsFloor;
                }

                // --- KROK 2: SUWAK CZASU ---
                if (timeFactor < 0.9 || timeFactor > 1.1) {
                    const rawCalc = currentSets * timeFactor;
                    if (isUnilateral) {
                        currentSets = Math.max(2, Math.floor(rawCalc / 2) * 2);
                    } else {
                        currentSets = Math.max(1, Math.floor(rawCalc));
                    }
                }

                exercise.sets = String(currentSets);

                // --- KROK 3: REDUKCJA POWTÓRZEŃ/CZASU (Intensity Scale) ---
                if (intensityScale < 1.0) {
                    const rawVal = String(exercise.reps_or_time);
                    const numMatch = rawVal.match(/(\d+)/);
                    
                    if (numMatch) {
                        const rawNum = parseInt(numMatch[0]);
                        // Math.ceil zamiast floor, aby nie zejść do zera
                        const newNum = Math.max(rawVal.includes('s') ? 5 : 3, Math.ceil(rawNum * intensityScale));
                        
                        if (newNum < rawNum) {
                            exercise.reps_or_time = rawVal.replace(rawNum, newNum);
                        }
                    }
                }

                // Badge
                if (!modificationBadge && mode !== 'standard') {
                    if (mode === 'eco') modificationBadge = { type: 'eco', label: `🍃 ECO` };
                    else if (mode === 'care') modificationBadge = { type: 'care', label: `🛡️ CARE` };
                    else if (mode === 'sos') modificationBadge = { type: 'sos', label: `🏥 SOS` };
                }

                if (modificationBadge) exercise.modification = modificationBadge;
            });
        });

        modifiedPlan._modificationInfo = {
            originalPainLevel: painLevel,
            appliedMode: mode,
            appliedModifier: intensityScale,
            message: painMessage,
            shouldSuggestSOS: (mode === 'sos')
        };

        return modifiedPlan;
    }
};