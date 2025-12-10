// assistantEngine.js

import { state } from './state.js';
import { getISODate, parseSetCount, getExerciseDuration } from './utils.js';

/**
 * MÓZG SYSTEMU (ASSISTANT ENGINE) v3.1 (Fix Regression Logic)
 * Cel: Gwarancja, że tryb Średni/Boli zawsze zmniejsza obciążenie.
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
        let forceOneSet = false;
        let addBoostSet = false;
        let intensityScale = 1.0;

        // 1. ANALIZA POZIOMU BÓLU (Logika 0-10)
        
        // A. BOOST (0-1) -> +1 Seria
        if (painLevel <= 1) {
            mode = 'boost';
            painMessage = "Tryb Progresji (Boost).";
            addBoostSet = true;
            intensityScale = 1.0;
        } 
        // B. STANDARD (2-3) -> Baza
        else if (painLevel >= 2 && painLevel <= 3) {
            mode = 'standard';
            intensityScale = 1.0;
        } 
        // C. ECO (4-5) -> 70% powtórzeń (Serie bez zmian)
        // Redukcja zmęczenia wewnątrz serii.
        else if (painLevel >= 4 && painLevel <= 5) {
            mode = 'eco'; 
            painMessage = "Tryb Oszczędny (Eco).";
            forceOneSet = false; 
            intensityScale = 0.7; // -30%
        } 
        // D. CARE (6-7) -> 1 Seria + 70% powtórzeń
        // Maksymalne skrócenie czasu.
        else if (painLevel >= 6 && painLevel <= 7) {
            mode = 'care';
            painMessage = "Tryb Ostrożny (Care).";
            forceOneSet = true;
            intensityScale = 0.7; // -30%
        } 
        // E. SOS (8+) -> Awaryjnie
        else {
            mode = 'sos';
            painMessage = "Zalecany tryb SOS.";
            forceOneSet = true;
            intensityScale = 0.5;
        }

        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!modifiedPlan[section]) return;

            modifiedPlan[section].forEach(exercise => {
                let currentSets = parseSetCount(exercise.sets);
                
                // --- KROK 1: MODYFIKACJA SERII ---
                
                if (addBoostSet) {
                    if (section === 'main' && currentSets >= 2 && currentSets < 4) {
                        currentSets += 1;
                        exercise.description = (exercise.description || "") + "\n🚀 BOOST: +1 seria.";
                    }
                } 
                else if (forceOneSet) {
                    currentSets = 1;
                }
                
                // Suwak czasu (Master Override)
                if (timeFactor < 0.9) {
                    currentSets = Math.max(1, Math.floor(currentSets * timeFactor));
                }

                exercise.sets = String(currentSets);

                // --- KROK 2: MODYFIKACJA POWTÓRZEŃ / CZASU (Bezpieczna) ---
                
                if (intensityScale < 1.0) {
                    const originalStr = String(exercise.reps_or_time);
                    let newVal = originalStr;

                    // A. Wykrywanie czasu (s / min)
                    if (originalStr.includes('s') || originalStr.includes('min')) {
                        const numMatch = originalStr.match(/(\d+)/);
                        if (numMatch) {
                            const oldVal = parseInt(numMatch[0]);
                            const calcVal = Math.floor(oldVal * intensityScale);
                            // Bezpiecznik: Czas nie krótszy niż 5s
                            const finalVal = Math.max(5, calcVal); 
                            
                            // Podmieniamy TYLKO jeśli nowa wartość jest mniejsza
                            if (finalVal < oldVal) {
                                newVal = originalStr.replace(oldVal, finalVal);
                            }
                        }
                    } 
                    // B. Wykrywanie powtórzeń (liczba)
                    else {
                        const numMatch = originalStr.match(/(\d+)/);
                        if (numMatch) {
                            const oldVal = parseInt(numMatch[0]);
                            const calcVal = Math.floor(oldVal * intensityScale);
                            // Bezpiecznik: Min 3 powtórzenia
                            const finalVal = Math.max(3, calcVal);

                            if (finalVal < oldVal) {
                                newVal = originalStr.replace(oldVal, finalVal);
                            }
                        }
                    }
                    exercise.reps_or_time = newVal;
                }

                // Info w opisie
                if (mode === 'eco') {
                    exercise.description = (exercise.description || "") + "\n🍃 ECO: Lżejsze serie (-30%).";
                } else if (mode === 'care') {
                    exercise.description = (exercise.description || "") + "\n🛡️ CARE: Tylko 1 seria.";
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