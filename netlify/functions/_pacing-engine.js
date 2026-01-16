// netlify/functions/_pacing-engine.js

/**
 * PACING ENGINE v1.0
 * Centralny moduł "Medyczny" do wyliczania bazowych czasów przerw i przejść.
 *
 * Zasada: Backend określa fizjologiczną potrzebę regeneracji (Base Rest).
 * Frontend aplikuje do tego preferencje użytkownika (User Factor).
 */

const calculateTiming = (exercise) => {
    const cat = String(exercise.category_id || '').toLowerCase();
    const load = parseInt(exercise.difficulty_level || 1, 10);
    const isUnilateral = !!exercise.is_unilateral;

    let baseRest = 30; // Domyślna wartość (Standard)

    // --- 1. LOGIKA DOBORU PRZERWY (FIZJOLOGIA) ---

    if (cat.includes('nerve') || cat.includes('flossing') || cat.includes('neuro')) {
        // Neurodynamika: Umiarkowana przerwa, aby układ nerwowy "odetchnął", ale nie ostygł.
        baseRest = 35;
    }
    else if (cat.includes('mobility') || cat.includes('stretch') || cat.includes('flow') || cat.includes('flexor')) {
        // Mobilność: Krótka przerwa, utrzymanie ciepła tkankowego jest kluczowe.
        baseRest = 20;
    }
    else if (cat.includes('conditioning') || cat.includes('cardio') || cat.includes('burn')) {
        // Kondycja: Bardzo krótka, celem jest utrzymanie tętna.
        baseRest = 20;
    }
    else if (load >= 4 || cat.includes('strength') || cat.includes('squat') || cat.includes('deadlift') || cat.includes('push') || cat.includes('pull')) {
        // Siła / Ciężkie wielostawy: Długa przerwa na resyntezę ATP.
        baseRest = 60;
    }
    else if (cat.includes('core_stability') || cat.includes('anti_') || cat.includes('plank')) {
        // Stabilizacja: Średnia+, liczy się jakość napięcia, zmęczenie psuje technikę.
        baseRest = 45;
    }
    else if (cat.includes('breathing') || cat.includes('relax')) {
        // Oddechowe: Krótka przerwa, to ciągły proces.
        baseRest = 15;
    }

    // --- 2. LOGIKA PRZEJŚĆ (LOGISTYKA) ---

    // Czas na zmianę strony (Unilateral) lub przyjęcie pozycji (Bilateral)
    const baseTransition = isUnilateral ? 12 : 5;

    return {
        rest_sec: baseRest,
        transition_sec: baseTransition
    };
};

module.exports = { calculateTiming };


