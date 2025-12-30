// assistantEngine.js

import { state } from './state.js';
import { parseSetCount, calculateSmartDuration } from './utils.js';

/**
 * MÓZG SYSTEMU (ASSISTANT ENGINE) v4.0 (Unified Time-Boxing)
 * Teraz używa wspólnej logiki obliczania czasu z utils.js, identycznej jak w backendzie.
 */

export const assistant = {

    calculateResilience: () => {
        if (state.userStats && state.userStats.resilience) {
            return state.userStats.resilience;
        }
        return { score: 0, status: 'Vulnerable', daysSinceLast: 0, sessionCount: 0 };
    },

    // ZMIANA: Używamy nowej, dokładnej funkcji z utils.js
    estimateDuration: (dayPlan) => {
        return calculateSmartDuration(dayPlan);
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