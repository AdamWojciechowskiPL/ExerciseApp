
// assistantEngine.js

import { state } from './state.js';
import { getISODate, parseSetCount, getExerciseDuration } from './utils.js';

/**
 * MÓZG SYSTEMU (ASSISTANT ENGINE) v3.5 (Adaptive Pacing)
 * Algorytm estymacji czasu oparty na dynamicznych ustawieniach użytkownika i historii tempa.
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

        // POBIERANIE USTAWIEŃ DYNAMICZNYCH Z STANU
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

            // Wykrywanie jednostronności
            const isUnilateral = exercise.isUnilateral ||
                                 exercise.is_unilateral ||
                                 String(exercise.reps_or_time).includes('/str') ||
                                 String(exercise.reps_or_time).includes('stron');

            const multiplier = isUnilateral ? 2 : 1;

            // 1. Próba obliczenia czasu, jeśli ćwiczenie jest na czas (np. "30s")
            // getExerciseDuration zwraca całkowity czas pracy dla wszystkich stron (np. 60s dla 30s/str)
            let workTimePerSet = getExerciseDuration(exercise);

            // 2. Jeśli null, to ćwiczenie na powtórzenia -> używamy Adaptive Pacing
            if (workTimePerSet === null) {
                const repsString = String(exercise.reps_or_time).toLowerCase();
                const repsMatch = repsString.match(/(\d+)/);
                const reps = repsMatch ? parseInt(repsMatch[0], 10) : 10;

                // Sprawdzamy, czy mamy personalne tempo dla tego ćwiczenia
                const exId = exercise.id || exercise.exerciseId;
                const personalPace = state.exercisePace ? state.exercisePace[exId] : null;
                const tempoToUse = personalPace || globalSecondsPerRep;

                // Czas = Powtórzenia * Personalne Tempo * Mnożnik Stron
                workTimePerSet = reps * tempoToUse * multiplier;
            }

            totalSeconds += sets * workTimePerSet;

            // Przerwy między seriami (ilość przerw = ilość serii - 1)
            // Uproszczenie: sets to ilość bloków pracy.
            if (sets > 1) {
                // Jeśli jednostronne, to sets może oznaczać serie na stronę lub łączne.
                // W training.js sets jest traktowane jako liczba powtórzeń cyklu (L+P).
                // Przyjmujemy, że przerwa jest po całym cyklu L+P lub po prostu po serii.
                // Jeśli sets = 2 (2 na L, 2 na P), to mamy 2 duże bloki.
                // Total sets blocks = sets.
                totalSeconds += (sets - 1) * restBetweenSets;
            }

            // Przerwy między ćwiczeniami
            if (index < allExercises.length - 1) totalSeconds += restBetweenExercises;
        });

        return Math.ceil(totalSeconds / 60);
    },

    adjustTrainingVolume: (dayPlan, painLevel, timeFactor = 1.0) => {
        if (!dayPlan) return null;

        const modifiedPlan = JSON.parse(JSON.stringify(dayPlan));

        let mode = 'standard';
        let painMessage = null;

        // Parametry Strategii
        let targetSetsMode = 'normal'; // 'normal', 'minus_step', 'minimum'
        let addBoostSet = false;
        let intensityScale = 1.0;

        // 1. ANALIZA POZIOMU BÓLU

        // A. BOOST (0-1)
        if (painLevel <= 1) {
            mode = 'boost';
            painMessage = "Tryb Progresji (Boost).";
            addBoostSet = true;
            intensityScale = 1.0;
        }
        // B. STANDARD (2-3)
        else if (painLevel >= 2 && painLevel <= 3) {
            mode = 'standard';
        }
        // C. ECO (4-5)
        else if (painLevel >= 4 && painLevel <= 5) {
            mode = 'eco';
            painMessage = "Tryb Oszczędny (Eco).";
            targetSetsMode = 'minus_step';
            intensityScale = 1.0;
        }
        // D. CARE (6-7)
        else if (painLevel >= 6 && painLevel <= 7) {
            mode = 'care';
            painMessage = "Tryb Ostrożny (Care).";
            targetSetsMode = 'minimum';
            intensityScale = 0.7;
        }
        // E. SOS (8+)
        else {
            mode = 'sos';
            painMessage = "Zalecany tryb SOS.";
            targetSetsMode = 'minimum';
            intensityScale = 0.5;
        }

        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!modifiedPlan[section]) return;

            modifiedPlan[section].forEach(exercise => {
                let currentSets = parseSetCount(exercise.sets);

                // Wykrywanie jednostronności
                const isUnilateral = exercise.isUnilateral ||
                                     exercise.is_unilateral ||
                                     String(exercise.reps_or_time).includes('/str') ||
                                     String(exercise.reps_or_time).includes('stron');

                const stepSize = isUnilateral ? 2 : 1;
                const minSets = isUnilateral ? 2 : 1;

                // Obiekt modyfikacji dla UI (Badges)
                let modificationBadge = null;

                // --- KROK 1: MODYFIKACJA SERII ---

                if (addBoostSet) {
                    const limit = isUnilateral ? 6 : 4;
                    if (section === 'main' && currentSets >= minSets && currentSets < limit) {
                        currentSets += stepSize;
                        modificationBadge = { type: 'boost', label: `🚀 BOOST: +${stepSize} serii` };
                    }
                }
                else if (targetSetsMode === 'minus_step') {
                    if (currentSets > minSets) {
                        currentSets -= stepSize;
                    } else {
                        if (mode === 'eco') intensityScale = Math.min(intensityScale, 0.8);
                    }
                }
                else if (targetSetsMode === 'minimum') {
                    currentSets = minSets;
                }

                // --- KROK 2: SUWAK CZASU (Time Factor) ---
                if (timeFactor < 0.9) {
                    const rawCalc = currentSets * timeFactor;

                    if (isUnilateral) {
                        let reduced = Math.floor(rawCalc / 2) * 2;
                        currentSets = Math.max(2, reduced);
                    } else {
                        currentSets = Math.max(1, Math.floor(rawCalc));
                    }
                }

                exercise.sets = String(currentSets);

                // --- KROK 3: REDUKCJA POWTÓRZEŃ/CZASU ---
                if (intensityScale < 1.0) {
                    const rawVal = String(exercise.reps_or_time);

                    if (rawVal.includes('s') || rawVal.includes('min')) {
                        const numMatch = rawVal.match(/(\d+)/);
                        if (numMatch) {
                            const rawNum = parseInt(numMatch[0]);
                            const newNum = Math.max(5, Math.floor(rawNum * intensityScale));
                            if (newNum < rawNum) {
                                exercise.reps_or_time = rawVal.replace(rawNum, newNum);
                            }
                        }
                    } else {
                        const repsMatch = rawVal.match(/(\d+)/);
                        if (repsMatch) {
                            const reps = parseInt(repsMatch[0]);
                            const newReps = Math.max(3, Math.floor(reps * intensityScale));
                            if (newReps < reps) {
                                exercise.reps_or_time = rawVal.replace(reps, newReps);
                            }
                        }
                    }
                }

                // Ustawienie Badge'a (jeśli nie został ustawiony przez Boost)
                if (!modificationBadge) {
                    if (mode === 'eco') {
                        modificationBadge = { type: 'eco', label: `🍃 ECO: Oszczędzanie` };
                    } else if (mode === 'care') {
                        modificationBadge = { type: 'care', label: `🛡️ CARE: Redukcja` };
                    } else if (mode === 'sos') {
                        modificationBadge = { type: 'sos', label: `🏥 SOS: Minimum` };
                    }
                }

                // Zapisujemy badge w obiekcie ćwiczenia, aby templates.js mógł go użyć
                if (modificationBadge && mode !== 'standard') {
                    exercise.modification = modificationBadge;
                }
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