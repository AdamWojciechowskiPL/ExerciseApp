// netlify/functions/_pacing-engine.js
'use strict';

/**
 * PACING ENGINE v2.0 (Medical & Metabolic compliant)
 * 
 * Moduł oblicza czasy przerw (Rest) i przejść (Transition) na podstawie:
 * 1. Fizjologii kategorii biomechanicznej (category_id).
 * 2. Poziomu obciążenia metabolicznego (metabolic_intensity).
 * 3. Stylu kondycyjnego (conditioning_style).
 * 4. Poziomu trudności (difficulty_level).
 * 
 * Źródła wiedzy:
 * - Resynteza ATP-CP: ~60-90s (Strength/High Load)
 * - Regeneracja CUN (Motor Control): ~45s (Stability/Proprioception)
 * - Histereza tkanek (Mobility): ~15-20s (utrzymanie ciepła/płynności)
 * - Neurodynamika (Butler/Shacklock): ~30s (powrót do bazowej mechanosensytywności)
 */

const calculateTiming = (exercise) => {
    // 1. Normalizacja danych wejściowych
    const cat = String(exercise.category_id || '').toLowerCase();
    const load = parseInt(exercise.difficulty_level || 1, 10);
    const metabolic = parseInt(exercise.metabolic_intensity || 1, 10);
    const condStyle = String(exercise.conditioning_style || 'none').toLowerCase();
    
    // Normalizacja flagi jednostronności (obsługa snake_case z DB i camelCase z JS)
    const isUnilateral = !!(exercise.is_unilateral || exercise.isUnilateral);

    // 2. Domyślna baza (Standard)
    let baseRest = 30; 

    // ====================================================================
    // A. KATEGORYZACJA FIZJOLOGICZNA (Strict Dictionary Match)
    // ====================================================================

    switch (cat) {
        // --- GRUPA 1: SIŁA I STRUKTURA (High Load / ATP-CP Recovery) ---
        // Cel: Maksymalna rekrutacja jednostek motorycznych, pełna regeneracja ATP.
        // Zalecenie: 60s - 90s+
        case 'hip_extension':       // Bridges, Thrusts (Posterior Chain Power)
        case 'eccentric_control':   // High neuromuscular fatigue
            baseRest = 60;
            break;

        // --- GRUPA 2: STABILIZACJA CENTRALNA ("ANTI" PATTERNS) ---
        // Cel: Regeneracja zdolności do generowania napięcia izometrycznego. 
        // Okluzja naczyń podczas napięcia wymaga czasu na reperfuzję.
        // Zalecenie: 45s - 60s
        case 'core_anti_extension':
        case 'core_anti_flexion':
        case 'core_anti_rotation':
        case 'core_anti_lateral_flexion':
            baseRest = 45;
            break;

        // --- GRUPA 3: KONTROLA MOTORYCZNA I STABILNOŚĆ LOKALNA ---
        // Cel: Regeneracja CUN (skupienie), ale bez dużego wyczerpania energetycznego.
        // Zalecenie: 30s - 45s
        case 'core_stability':          // General patterns (Dead bug etc.)
        case 'scapular_stability':      // Serratus/Traps control
        case 'cervical_motor_control':  // Deep Neck Flexors (precyzja ważniejsza niż siła)
        case 'balance_proprioception':  // Układ równowagi
        case 'knee_stability':          // Propriocepcja kolana
            baseRest = 40;
            break;

        // --- GRUPA 4: AKTYWACJA I IZOLACJA ---
        // Cel: "Obudzenie" mięśnia, ukrwienie (pump), ale zachowanie świeżości.
        // Zalecenie: 30s
        case 'glute_activation':
        case 'vmo_activation':
        case 'terminal_knee_extension':
        case 'calves':
            baseRest = 30;
            break;

        // --- GRUPA 5: NEURODYNAMIKA ---
        // Cel: Uspokojenie mechanosensytywności nerwu. Unikanie latencji objawów.
        // Zalecenie: 30s (bezpieczny bufor)
        case 'nerve_flossing':
            baseRest = 30; 
            break;

        // --- GRUPA 6: MOBILNOŚĆ I ROZCIĄGANIE ---
        // Cel: Wykorzystanie lepkości tkanek (Viscoelasticity). Zbyt długa przerwa powoduje "stygnięcie".
        // Zalecenie: 15s - 20s (Flow)
        case 'spine_mobility':
        case 'thoracic_mobility':
        case 'hip_mobility':
        case 'ankle_mobility':
        case 'hip_flexor_stretch':
            baseRest = 20;
            break;

        // --- GRUPA 7: REGENERACJA I ODDECH ---
        // Cel: Ciągłość procesu relaksacji.
        // Zalecenie: Minimalna przerwa.
        case 'breathing':
        case 'breathing_control':
        case 'muscle_relaxation':
            baseRest = 15;
            break;

        // --- GRUPA 8: KONDYCJA ---
        // Cel: Utrzymanie podwyższonego tętna (Density Training).
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
    // Jeśli zdefiniowano styl kondycyjny, ma on priorytet nad kategorią.
    if (condStyle === 'amrap' || condStyle === 'steady_state') {
        baseRest = 10; // Minimalna przerwa techniczna
    } else if (condStyle === 'interval') {
        // Dla interwałów przerwa jest zazwyczaj zdefiniowana w `recommended_interval_sec`
        // Ale jako bazę ustawiamy krótki czas.
        baseRest = 15;
    }

    // 2. Metabolic Intensity Modifier (1-5)
    // Wysoka intensywność metaboliczna (4-5) sugeruje trening wytrzymałościowy/gęstości.
    // Skracamy przerwy, chyba że to ćwiczenie siłowe (gdzie metabolizm wynika z ciężaru).
    if (metabolic >= 4) {
        // Wyjątek: Eccentric Control i Hip Extension potrzebują odpoczynku nawet przy wysokim metabolizmie,
        // bo technika siada. Dla reszty - skracamy.
        if (!['eccentric_control', 'hip_extension', 'core_anti_extension'].includes(cat)) {
            baseRest = Math.min(baseRest, 25);
        }
    }

    // 3. Difficulty Level Modifier (1-5)
    // Bardzo trudne ćwiczenia (4-5) wymagają więcej czasu na regenerację (ATP/CUN).
    if (load >= 4) {
        baseRest += 15;
    }

    // ====================================================================
    // C. LOGIKA PRZEJŚĆ (TRANSITION) - ZGODNA Z UI
    // ====================================================================
    
    // ZASADA: Ćwiczenia jednostronne (Unilateral) ZAWSZE otrzymują 12 sekund na zmianę strony.
    // Ignorujemy flagę 'requires_side_switch' dla czasu trwania, aby zapewnić spójność z frontendem (training.js).
    // Dla ćwiczeń obustronnych (Bilateral) standardowy bufor 5s.
    
    const baseTransition = isUnilateral ? 12 : 5;

    return {
        rest_sec: Math.round(baseRest),
        transition_sec: baseTransition
    };
};

module.exports = { calculateTiming };