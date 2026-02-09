// ExerciseApp/netlify/functions/phase-catalog.js
'use strict';

/**
 * PHASE CATALOG (Task B1)
 *
 * Centralny rejestr reguł dla faz treningowych.
 * Definiuje:
 * 1. Jakie fazy wchodzą w skład programu dla danego celu (Blueprints).
 * 2. Jakie są priorytety doboru ćwiczeń w danej fazie (Bias).
 * 3. Jakie są domyślne parametry objętości (Prescription).
 * 4. Jak długo powinna trwać faza (Progression).
 */

// ============================================================================
// 1. DEFINICJE FAZ
// ============================================================================

const PHASE_IDS = {
    CONTROL: 'control',       // Nauka ruchu, stabilizacja, tempo wolne
    MOBILITY: 'mobility',     // Zakres ruchu, zdrowie stawów
    CAPACITY: 'capacity',     // Budowa tolerancji, hipertrofia
    STRENGTH: 'strength',     // Siła, układ nerwowy
    METABOLIC: 'metabolic',   // Kondycja, gęstość pracy
    DELOAD: 'deload',         // Regeneracja, zmniejszona objętość
    REHAB: 'rehab'            // Override bezpieczeństwa
};

// ============================================================================
// 2. BLUEPRINTS (Sekwencje faz dla celów)
// ============================================================================

const BLUEPRINTS = {
    // Cel: Redukcja bólu (Długi okres wstępny, unikanie przeciążeń)
    'pain_relief': {
        id: 'pain_relief',
        sequence: [PHASE_IDS.CONTROL, PHASE_IDS.MOBILITY, PHASE_IDS.CONTROL, PHASE_IDS.CAPACITY]
    },
    // Cel: Redukcja tkanki tłuszczowej (Więcej pracy metabolicznej)
    'fat_loss': {
        id: 'fat_loss',
        sequence: [PHASE_IDS.CONTROL, PHASE_IDS.METABOLIC, PHASE_IDS.CAPACITY, PHASE_IDS.METABOLIC]
    },
    // Cel: Siła / Hipertrofia (Klasyczna periodyzacja)
    'strength': {
        id: 'strength',
        sequence: [PHASE_IDS.CONTROL, PHASE_IDS.CAPACITY, PHASE_IDS.STRENGTH, PHASE_IDS.DELOAD]
    },
    'hypertrophy': { // Alias do strength, ale może mieć inny wariant w przyszłości
        id: 'strength',
        sequence: [PHASE_IDS.CONTROL, PHASE_IDS.CAPACITY, PHASE_IDS.STRENGTH, PHASE_IDS.DELOAD]
    },
    // Cel: Prewencja / Zdrowie (Dużo mobilności)
    'prevention': {
        id: 'prevention',
        sequence: [PHASE_IDS.MOBILITY, PHASE_IDS.CONTROL, PHASE_IDS.CAPACITY, PHASE_IDS.DELOAD]
    },
    // Cel: Sprawność / Mobilność
    'mobility': {
        id: 'mobility',
        sequence: [PHASE_IDS.MOBILITY, PHASE_IDS.CONTROL, PHASE_IDS.MOBILITY, PHASE_IDS.CAPACITY]
    },
    // Fallback
    'default': {
        id: 'default',
        sequence: [PHASE_IDS.CONTROL, PHASE_IDS.CAPACITY, PHASE_IDS.STRENGTH, PHASE_IDS.DELOAD]
    }
};

// ============================================================================
// 3. KONFIGURACJA FAZ (Reguły Generatora)
// ============================================================================

const PHASE_CONFIG = {
    [PHASE_IDS.CONTROL]: {
        bias: {
            // Preferuj łatwe/średnie ćwiczenia (Lvl 1-2)
            difficulty: { 1: 1.5, 2: 1.2, 3: 0.8, 4: 0.1, 5: 0.0 },
            metabolicPenalty: 2.0, // Unikaj wysokiego tętna
            // US-10/11: Control Phase is good for initial control and exposure
            categoryKeywords: ['control', 'activation', 'patellofemoralcontrol']
        },
        prescription: {
            sets: '2-4',
            reps: '8-12',
            restFactor: 1.0
        },
        progression: {
            targetSessions: [12, 16], // min-max sesji w fazie
            capWeeks: 8               // limit czasowy (soft progression)
        },
        forbidden: {
            minDifficulty: 0,
            maxDifficulty: 3,         // Blokuj trudne technicznie
            blockHighImpact: true     // Blokuj skoki
        }
    },

    [PHASE_IDS.MOBILITY]: {
        bias: {
            difficulty: { 1: 1.5, 2: 1.2, 3: 0.5, 4: 0.0, 5: 0.0 },
            metabolicPenalty: 0.0,
            categoryKeywords: ['mobility', 'stretch', 'flow', 'thoracic', 'hip']
        },
        prescription: {
            sets: '2-3',
            reps: '10-15',
            restFactor: 0.5           // Krótkie przerwy
        },
        progression: {
            targetSessions: [12, 16],
            capWeeks: 8
        },
        forbidden: {
            maxDifficulty: 3,
            blockHighImpact: true
        }
    },

    [PHASE_IDS.CAPACITY]: {
        bias: {
            // Zbalansowany dobór, lekkie karanie ekstremów
            difficulty: { 1: 0.8, 2: 1.2, 3: 1.5, 4: 0.8, 5: 0.2 },
            metabolicPenalty: 0.5
        },
        prescription: {
            sets: '3-5',
            reps: '10-15',
            restFactor: 1.0
        },
        progression: {
            targetSessions: [20, 24], // Dłuższa faza akumulacji
            capWeeks: 10
        },
        forbidden: {
            maxDifficulty: 5,
            blockHighImpact: false
        }
    },

    [PHASE_IDS.STRENGTH]: {
        bias: {
            // Preferuj trudne ćwiczenia (Lvl 3-5)
            difficulty: { 1: 0.1, 2: 0.5, 3: 1.2, 4: 1.5, 5: 1.5 },
            metabolicPenalty: 1.5     // Siła to nie cardio
        },
        prescription: {
            sets: '3-6',
            reps: '3-6',              // Niskie zakresy
            restFactor: 1.5           // Długie przerwy
        },
        progression: {
            targetSessions: [10, 12], // Krótka, intensywna faza
            capWeeks: 6
        },
        forbidden: {
            minDifficulty: 2,         // Musi być wyzwanie
            blockHighImpact: false
        }
    },

    [PHASE_IDS.METABOLIC]: {
        bias: {
            // Preferuj średnie, ale intensywne
            difficulty: { 1: 0.5, 2: 1.5, 3: 1.2, 4: 0.5, 5: 0.1 },
            metabolicBonus: 2.0       // Promuj wysokie tętno
        },
        prescription: {
            sets: '3-4',
            reps: '15-25',
            restFactor: 0.5
        },
        progression: {
            targetSessions: [12, 16],
            capWeeks: 8
        },
        forbidden: {
            maxDifficulty: 4,         // Technika siada przy zmęczeniu
            blockHighImpact: false
        }
    },

    [PHASE_IDS.DELOAD]: {
        bias: {
            // Neutralny dobór
            difficulty: { 1: 1.2, 2: 1.2, 3: 0.8, 4: 0.1, 5: 0.0 }
        },
        prescription: {
            sets: '2',                // Sztywno mało serii
            reps: '8-10',
            restFactor: 1.0,
            volumeModifier: 0.5       // Globalne cięcie objętości
        },
        progression: {
            targetSessions: [3, 5],
            capWeeks: 2
        },
        forbidden: {
            maxDifficulty: 3
        }
    },

    [PHASE_IDS.REHAB]: {
        bias: {
            difficulty: { 1: 2.0, 2: 1.0, 3: 0.0, 4: 0.0, 5: 0.0 },
            metabolicPenalty: 3.0,
            // US-10/11: Rehab specifically triggers specific therapeutic categories
            categoryKeywords: ['isometric', 'stability', 'activation', 'nerve', 'patellofemoralcontrol']
        },
        prescription: {
            sets: '3-5',
            reps: '30-45s',           // Często izometria
            restFactor: 1.2
        },
        progression: {
            targetSessions: [999, 999], // Override steruje wyjściem, nie licznik
            capWeeks: 999
        },
        forbidden: {
            maxDifficulty: 2,
            blockHighImpact: true
        }
    }
};

// ============================================================================
// 4. HELPERY PUBLICZNE
// ============================================================================

/**
 * Zwraca obiekt konfiguracyjny dla danej fazy.
 * @param {string} phaseId 
 * @returns {object} Konfiguracja fazy lub domyślna (Control)
 */
const getPhaseConfig = (phaseId) => {
    return PHASE_CONFIG[phaseId] || PHASE_CONFIG[PHASE_IDS.CONTROL];
};

/**
 * Wybiera odpowiedni Blueprint (sekwencję faz) na podstawie celu użytkownika.
 * @param {string} primaryGoal - Cel z ankiety (np. 'strength', 'pain_relief')
 * @returns {object} Obiekt Blueprint { id, sequence }
 */
const resolveTemplate = (primaryGoal) => {
    const key = String(primaryGoal).toLowerCase();
    return BLUEPRINTS[key] || BLUEPRINTS['default'];
};

/**
 * Wylicza docelową liczbę sesji w fazie, uwzględniając poziom zaawansowania.
 * 
 * Logika:
 * - Początkujący potrzebują dłuższych faz adaptacyjnych (Control, Capacity).
 * - Zaawansowani potrzebują krótszych faz adaptacyjnych, a dłuższych siłowych.
 * 
 * @param {string} phaseId 
 * @param {object} userCtx - Kontekst użytkownika (np. { exercise_experience: 'advanced' })
 * @returns {number} Liczba sesji do ukończenia fazy
 */
const pickTargetSessions = (phaseId, userCtx) => {
    const config = getPhaseConfig(phaseId);
    const range = config.progression.targetSessions; // [min, max]

    const experience = String(userCtx?.exercise_experience || 'none').toLowerCase();
    const isBeginner = experience === 'none' || experience === 'occasional';
    const isAdvanced = experience === 'advanced';

    // Domyślnie środek zakresu
    let target = Math.round((range[0] + range[1]) / 2);

    if (phaseId === PHASE_IDS.CONTROL || phaseId === PHASE_IDS.CAPACITY) {
        // Fazy adaptacyjne: Początkujący dłużej, Zaawansowani krócej
        if (isBeginner) target = range[1]; // Max
        if (isAdvanced) target = range[0]; // Min
    }
    else if (phaseId === PHASE_IDS.STRENGTH || phaseId === PHASE_IDS.METABOLIC) {
        // Fazy intensywne: Początkujący krócej (bezpieczeństwo), Zaawansowani dłużej (efekt)
        if (isBeginner) target = range[0]; // Min
        if (isAdvanced) target = range[1]; // Max
    }

    return target;
};

module.exports = {
    PHASE_IDS,
    BLUEPRINTS,
    getPhaseConfig,
    resolveTemplate,
    pickTargetSessions
};