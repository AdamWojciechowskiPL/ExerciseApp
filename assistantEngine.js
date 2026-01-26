// ExerciseApp/assistantEngine.js
// assistantEngine.js

import { state } from './state.js';
import { parseSetCount } from './utils.js';

/**
 * MÓZG SYSTEMU (ASSISTANT ENGINE) v4.2 (AMPS Classification)
 */

export const assistant = {

    // AMPS PHASE 3: CLASSIFICATION
    classifySessionPerformance: (sessionLog) => {
        const groups = {
            good: [],
            moderate: [],
            difficult: []
        };

        const uniqueLogs = new Map();
        // Deduplicate logs (take last status)
        sessionLog.forEach(log => {
            if (log.isRest || log.status === 'skipped') return;
            uniqueLogs.set(log.exerciseId || log.id, log);
        });

        uniqueLogs.forEach(log => {
            const rating = log.rating || 'none';
            const tech = log.tech !== undefined && log.tech !== null ? log.tech : -1;
            const rir = log.rir !== undefined && log.rir !== null ? log.rir : -1;

            let classification = 'moderate';

            // Rules
            if (rating === 'hard' || (tech !== -1 && tech <= 4) || rir === 0) {
                classification = 'difficult';
            }
            else if (rating === 'good' || (tech >= 8 && rir >= 2)) {
                classification = 'good';
            }

            groups[classification].push(log);
        });

        return groups;
    },

    adjustTrainingVolume: (dayPlan, painLevel, timeFactor = 1.0) => {
        if (!dayPlan) return null;

        const modifiedPlan = JSON.parse(JSON.stringify(dayPlan));

        let mode = 'standard';
        let painMessage = null;

        let targetSetsMode = 'normal';
        let addBoostSet = false;
        let intensityScale = 1.0;

        // --- 1. DEFINICJA PROGÓW ---
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
            intensityScale = 0.8;
        }
        else if (painLevel >= 6 && painLevel <= 7) {
            mode = 'care';
            painMessage = "Tryb Ostrożny (Care).";
            targetSetsMode = 'minimum';
            intensityScale = 0.6;
        }
        else {
            mode = 'sos';
            painMessage = "Zalecany tryb SOS.";
            targetSetsMode = 'minimum';
            intensityScale = 0.45;
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
                const minSetsFloor = isUnilateral ? 2 : 1;

                let modificationBadge = null;

                // --- KROK 1: MODYFIKACJA SERII ---
                if (addBoostSet) {
                    const limit = isUnilateral ? 6 : 4;
                    // Boostujemy tylko część główną (main), żeby nie zamęczyć na rozgrzewce
                    if (section === 'main' && currentSets < limit) {
                        currentSets += stepSize;
                        modificationBadge = { type: 'boost', label: `🚀 BOOST: +${stepSize} serii` };
                    }
                }
                else if (targetSetsMode === 'minus_step') {
                    currentSets = Math.max(minSetsFloor, currentSets - stepSize);
                }
                else if (targetSetsMode === 'minimum') {
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
                        const newNum = Math.max(rawVal.includes('s') ? 5 : 3, Math.ceil(rawNum * intensityScale));

                        if (newNum < rawNum) {
                            exercise.reps_or_time = rawVal.replace(rawNum, newNum);
                        }
                    }
                }

                // --- KROK 4: LOGIKA BADGE'Y (DODANO OBSŁUGĘ BOOST DLA RESZTY) ---
                if (!modificationBadge && mode !== 'standard') {
                    if (mode === 'eco') modificationBadge = { type: 'eco', label: `🍃 ECO` };
                    else if (mode === 'care') modificationBadge = { type: 'care', label: `🛡️ CARE` };
                    else if (mode === 'sos') modificationBadge = { type: 'sos', label: `🏥 SOS` };

                    // NOWOŚĆ: Jeśli czujesz się świetnie, ale nie dodano serii (np. rozgrzewka),
                    // i tak pokaż badge "PRO" / "FLOW" / "BOOST"
                    else if (mode === 'boost') modificationBadge = { type: 'boost', label: `🔥 PRO` };
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