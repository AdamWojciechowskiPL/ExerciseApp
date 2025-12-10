// assistantEngine.js

import { state } from './state.js';
import { getISODate, parseSetCount, getExerciseDuration } from './utils.js';

/**
 * MÓZG SYSTEMU (ASSISTANT ENGINE) v3.2
 * Strategia: Unilateral Awareness (Parzystość Serii) + UI Badges
 * Cel: Zachowanie symetrii oraz czyste przekazywanie informacji do UI (bez modyfikacji description).
 */

const SECONDS_PER_REP = 4;
const DEFAULT_REST_SETS = 5;
const DEFAULT_REST_EXERCISES = 5;

export const assistant = {

    calculateResilience: () => {
        if (state.userStats && state.userStats.resilience) {
            return state.userStats.resilience;
        }
        return { score: 0, status: 'Vulnerable', daysSinceLast: 0, sessionCount: 0 };
    },

    estimateDuration: (dayPlan) => {
        if (!dayPlan) return 0;
        const activePlan = state.trainingPlans[state.settings.activePlanId];
        const globalRules = activePlan?.GlobalRules || {};
        const restBetweenSets = globalRules.defaultRestSecondsBetweenSets || DEFAULT_REST_SETS;
        const restBetweenExercises = globalRules.defaultRestSecondsBetweenExercises || DEFAULT_REST_EXERCISES;

        let totalSeconds = 0;
        const allExercises = [
            ...(dayPlan.warmup || []),
            ...(dayPlan.main || []),
            ...(dayPlan.cooldown || [])
        ];

        allExercises.forEach((exercise, index) => {
            const sets = parseSetCount(exercise.sets);
            let workTimePerSet = getExerciseDuration(exercise);

            if (workTimePerSet === null) {
                const repsString = String(exercise.reps_or_time).toLowerCase();
                const repsMatch = repsString.match(/(\d+)/);
                const reps = repsMatch ? parseInt(repsMatch[0], 10) : 10;
                workTimePerSet = reps * SECONDS_PER_REP;
            }

            totalSeconds += sets * workTimePerSet;
            if (sets > 1) totalSeconds += (sets - 1) * restBetweenSets;
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