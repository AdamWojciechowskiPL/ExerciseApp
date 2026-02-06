// netlify/functions/_pacing-engine.js
'use strict';

/**
 * PACING ENGINE v2.1 (Simplified Transition)
 *
 * Moduł oblicza czasy przerw (Rest) i przejść (Transition).
 * ZMIANA: Usunięto logikę 'requires_side_switch'.
 * Teraz is_unilateral zawsze wymusza 12s na zmianę strony.
 */

const calculateTiming = (exercise) => {
    // 1. Normalizacja danych wejściowych
    const cat = String(exercise.category_id || '').toLowerCase();
    const load = parseInt(exercise.difficulty_level || 1, 10);
    const metabolic = parseInt(exercise.metabolic_intensity || 1, 10);
    const condStyle = String(exercise.conditioning_style || 'none').toLowerCase();

    // Normalizacja flagi jednostronności
    const isUnilateral = !!(exercise.is_unilateral || exercise.isUnilateral);

    // 2. Domyślna baza (Standard)
    let baseRest = 30;

    // ====================================================================
    // A. KATEGORYZACJA FIZJOLOGICZNA (Strict Dictionary Match)
    // ====================================================================

    switch (cat) {
        // --- GRUPA 1: SIŁA I STRUKTURA (High Load / ATP-CP Recovery) ---
        case 'hip_extension':
        case 'eccentric_control':
            baseRest = 60;
            break;

        // --- GRUPA 2: STABILIZACJA CENTRALNA ("ANTI" PATTERNS) ---
        case 'core_anti_extension':
        case 'core_anti_flexion':
        case 'core_anti_rotation':
        case 'core_anti_lateral_flexion':
            baseRest = 45;
            break;

        // --- GRUPA 3: KONTROLA MOTORYCZNA I STABILNOŚĆ LOKALNA ---
        case 'core_stability':
        case 'scapular_stability':
        case 'cervical_motor_control':
        case 'balance_proprioception':
        case 'knee_stability':
            baseRest = 40;
            break;

        // --- GRUPA 4: AKTYWACJA I IZOLACJA ---
        case 'glute_activation':
        case 'vmo_activation':
        case 'terminal_knee_extension':
        case 'calves':
            baseRest = 30;
            break;

        // --- GRUPA 5: NEURODYNAMIKA ---
        case 'nerve_flossing':
            baseRest = 30;
            break;

        // --- GRUPA 6: MOBILNOŚĆ I ROZCIĄGANIE ---
        case 'spine_mobility':
        case 'thoracic_mobility':
        case 'hip_mobility':
        case 'ankle_mobility':
        case 'hip_flexor_stretch':
            baseRest = 20;
            break;

        // --- GRUPA 7: REGENERACJA I ODDECH ---
        case 'breathing':
        case 'breathing_control':
        case 'muscle_relaxation':
            baseRest = 15;
            break;

        // --- GRUPA 8: KONDYCJA ---
        case 'conditioning_low_impact':
            baseRest = 15;
            break;

        default:
            baseRest = 30; // Fallback
    }

    // ====================================================================
    // B. MODYFIKATORY ATRYBUTÓW (Override Logic)
    // ====================================================================

    // 1. Conditioning Style Override
    if (condStyle === 'amrap' || condStyle === 'steady_state') {
        baseRest = 10;
    } else if (condStyle === 'interval') {
        baseRest = 15;
    }

    // 2. Metabolic Intensity Modifier
    if (metabolic >= 4) {
        if (!['eccentric_control', 'hip_extension', 'core_anti_extension'].includes(cat)) {
            baseRest = Math.min(baseRest, 25);
        }
    }

    // 3. Difficulty Level Modifier
    if (load >= 4) {
        baseRest += 15;
    }

    // ====================================================================
    // C. LOGIKA PRZEJŚĆ (TRANSITION) - ZGODNA Z UI
    // ====================================================================

    // ZASADA: Ćwiczenia jednostronne (Unilateral) ZAWSZE otrzymują 12 sekund na zmianę strony.
    // Dla ćwiczeń obustronnych (Bilateral) standardowy bufor 5s.

    const baseTransition = isUnilateral ? 12 : 5;

    return {
        rest_sec: Math.round(baseRest),
        transition_sec: baseTransition
    };
};

module.exports = { calculateTiming };