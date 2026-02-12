// netlify/functions/_amps-engine.js
'use strict';

const SCORE_LIKE_INCREMENT = 15;
const SCORE_DISLIKE_DECREMENT = 30;
const SCORE_MAX = 100;
const SCORE_MIN = -100;

/**
 * Helper: Oblicza oczekiwany czas trwania serii (Time Under Tension)
 * Służy do porównania z czasem rzeczywistym (entry.duration).
 */
function calculateExpectedDuration(repsOrTime, secondsPerRep = 6) {
    const val = String(repsOrTime || '').toLowerCase();

    // Jeśli zadano czas (np. "45 s")
    if (val.includes('s') || val.includes('min')) {
        if (val.includes('min')) {
            const match = val.match(/(\d+(?:[.,]\d+)?)/);
            return match ? parseFloat(match[0].replace(',', '.')) * 60 : 60;
        }
        return parseInt(val) || 30;
    }

    // Jeśli zadano powtórzenia (np. "10")
    const reps = parseInt(val) || 10;
    // Unilateral (na stronę) zajmuje 2x więcej czasu + margines na zmianę
    // Bilateral: 1.0, Unilateral: ~2.2 (czas na stronę L + P + przejście)
    const isUnilateral = val.includes('/str') || val.includes('stron');
    const multiplier = isUnilateral ? 2.2 : 1.0;

    return reps * secondsPerRep * multiplier;
}

/**
 * AMPS: SMART INFERENCE ENGINE v2.0
 * Uzupełnia brakujące dane w logu sesji na podstawie kontekstu (czas, trudność).
 */
function inferMissingSessionData(sessionLog, feedback, userSettings = {}) {
    if (!Array.isArray(sessionLog)) return sessionLog;

    // Pobieramy globalne tempo usera (domyślnie 6s na powtórzenie)
    const pace = userSettings.secondsPerRep || 6;

    let defaultRating = 'ok';
    let defaultRir = 2;

    if (feedback) {
        const val = parseInt(feedback.value, 10);
        if (val === -1) { defaultRating = 'hard'; defaultRir = 1; }
        else if (val === 1) { defaultRating = 'good'; defaultRir = 4; }
    }

    return sessionLog.map(entry => {
        if (entry.status === 'skipped' || entry.isRest) return entry;

        // Jeśli dane zostały już wpisane ręcznie przez modal "Detail Assessment" (i nie jest to szybka ocena), zostawiamy je
        if (entry.rating && !entry.inferred && entry.difficultyDeviation === undefined) {
            return entry;
        }

        const newEntry = { ...entry };

        // 1. Analiza Pacingu (Czas rzeczywisty vs Oczekiwany)
        // entry.duration pochodzi ze stopera w training.js (czas netto wykonywania)
        const expectedDuration = calculateExpectedDuration(entry.reps_or_time, pace);
        const actualDuration = entry.duration || expectedDuration; // Fallback jeśli błąd stopera

        // Ratio: > 1.0 (Wolniej/Dłużej), < 1.0 (Szybciej/Krócej)
        // Np. 1.3 oznacza, że robiliśmy ćwiczenie 30% dłużej niż planowano (Grind)
        const paceRatio = expectedDuration > 0 ? (actualDuration / expectedDuration) : 1.0;

        // Czy ćwiczenie jest złożone technicznie? (Lvl 4+)
        const isComplex = (parseInt(entry.difficultyLevel || 1, 10)) >= 4;

        // --- LOGIKA OCENY (User Intent + Pacing Data) ---

        // PRZYPADEK 1: User kliknął "TRUDNE" (lub difficultyDeviation='hard')
        if (newEntry.difficultyDeviation === 'hard' || newEntry.rating === 'hard') {
            newEntry.rating = 'hard';

            if (paceRatio < 0.75) {
                // Zrobił dużo szybciej niż planowano -> "Rwanie" techniki, kompensacja pędem
                newEntry.tech = 5; // Technika ucierpiała
                newEntry.rir = 1;  // Siła jeszcze była, ale technika padła
                newEntry.inferenceReason = "Rushed Hard Set (Momentum)";
            } else if (paceRatio > 1.25) {
                // Zrobił dużo wolniej -> "Grind" (walka z ciężarem, velocity loss)
                newEntry.tech = 8; // Technika utrzymana (w miarę)
                newEntry.rir = 0;  // Prawdziwy upadek mięśniowy
                newEntry.inferenceReason = "Grinded Failure";
            } else {
                // Standardowe trudne
                newEntry.tech = isComplex ? 6 : 9; // Przy trudnych ćwiczeniach zakładamy gorszą technikę przy failure
                newEntry.rir = 0;
            }
        }

        // PRZYPADEK 2: User kliknął "ŁATWE" (lub difficultyDeviation='easy')
        else if (newEntry.difficultyDeviation === 'easy') {
            newEntry.rating = 'good';

            if (paceRatio > 1.1) {
                // Robił bardzo wolno/dokładnie -> To nie było AŻ TAK łatwe, po prostu kontrolowane
                newEntry.tech = 10;
                newEntry.rir = 3;
                newEntry.inferenceReason = "Slow Controlled Easy";
            } else {
                // Standardowe łatwe (lub szybkie)
                newEntry.tech = 10;
                newEntry.rir = 4; // RPE 6 (duży zapas)
            }
        }

        // PRZYPADEK 3: Brak reakcji (Neutral) - Inteligentne domyślanie się
        // Jeśli nie ma ratingu i RIR jest pusty -> User nie kliknął nic
        else if (!newEntry.rating && (newEntry.rir === undefined || newEntry.rir === null)) {
            newEntry.rating = 'ok';
            newEntry.inferred = true;

            // Jeśli znacznie odbiegł od czasu, korygujemy RIR
            if (paceRatio > 1.3) {
                // Bardzo wolno -> Prawdopodobnie było ciężej niż 'ok'
                newEntry.rir = 1.5;
                newEntry.tech = 8;
                newEntry.inferenceReason = "Auto-detected Grind (Slow)";
            } else if (paceRatio < 0.7) {
                // Bardzo szybko -> Prawdopodobnie za łatwo / niedbale
                newEntry.rir = 3;
                newEntry.tech = 9;
                newEntry.inferenceReason = "Auto-detected Speed (Fast)";
            } else {
                // Idealnie w punkt (Sweet Spot)
                newEntry.rir = 2;
                newEntry.tech = 9;
                newEntry.inferenceReason = "Perfect Pace";
            }
        }

        return newEntry;
    });
}

/**
 * AMPS: PREFERENCES ENGINE
 * Aktualizacja Affinity Score (Lubi/Nie lubi)
 */
async function updatePreferences(client, userId, ratings) {
    if (!ratings || !Array.isArray(ratings) || ratings.length === 0) return;

    const scoreDeltas = new Map();

    ratings.forEach(r => {
        const exId = String(r.exerciseId);
        if (r.action === 'like') scoreDeltas.set(exId, SCORE_LIKE_INCREMENT);
        else if (r.action === 'dislike') scoreDeltas.set(exId, -SCORE_DISLIKE_DECREMENT);
    });

    for (const [exerciseId, delta] of scoreDeltas.entries()) {
        const sql = `
            INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, updated_at)
            VALUES ($1, $2, $3::INTEGER, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                affinity_score = LEAST(${SCORE_MAX}, GREATEST(${SCORE_MIN}, COALESCE(user_exercise_preferences.affinity_score, 0) + $3::INTEGER)),
                updated_at = CURRENT_TIMESTAMP
        `;
        await client.query(sql, [userId, exerciseId, delta]);
    }
}

/**
 * AMPS: PROGRESSION ENGINE
 * Analizuje twarde dane z logów (RIR, Tech) i decyduje o Ewolucji/Dewolucji.
 */
async function analyzeAndAdjustPlan(client, userId, sessionLog) {
    if (!sessionLog || !sessionLog.length) return null;

    // Szukamy kandydatów do zmian w oparciu o RIR i Technikę
    // Priorytet: Dewolucja (Bezpieczeństwo) > Ewolucja (Progres)

    // 1. KRYTYCZNE PROBLEMY (RIR 0, Tech <= 4, Rating 'hard')
    // Szukamy najtrudniejszego ćwiczenia w sesji
    const hardEx = sessionLog.find(l =>
        l.status === 'completed' &&
        !l.isRest &&
        (l.rating === 'hard' || (l.rir !== undefined && l.rir <= 0) || (l.tech !== undefined && l.tech <= 4))
    );

    if (hardEx) {
        const currentId = hardEx.exerciseId || hardEx.id;
        console.log(`[AMPS] Detected struggle with ${currentId} (RIR:${hardEx.rir}, Tech:${hardEx.tech}). Checking options...`);

        // Sprawdź czy to nie "ping-pong" (czy już nie ewoluowaliśmy do tego)
        const historyCheck = await client.query(`
            SELECT original_exercise_id FROM user_plan_overrides
            WHERE user_id = $1 AND replacement_exercise_id = $2 AND adjustment_type = 'evolution'
        `, [userId, currentId]);

        if (historyCheck.rows.length > 0) {
            // Ping-Pong: User awansował, ale nowe ćwiczenie go pokonało.
            // Strategia: Micro-Dose (Zostań przy tym ćwiczeniu, ale zmniejsz objętość)
            await client.query(`
                INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                VALUES ($1, $2, $2, 'micro_dose', 'AMPS: Ping-Pong detected', CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET
                    replacement_exercise_id = $2, adjustment_type = 'micro_dose', updated_at = CURRENT_TIMESTAMP
            `, [userId, currentId]);

            // Reset affinity, żeby user nie forsował "like" na siłę
            await client.query(`UPDATE user_exercise_preferences SET affinity_score = 0 WHERE user_id = $1 AND exercise_id = $2`, [userId, currentId]);

            return { original: hardEx.name, type: 'micro_dose', newName: `${hardEx.name} (Regresja objętości)` };
        }

        // Standardowa Dewolucja (Szukamy łatwiejszego rodzica)
        const parentRes = await client.query(`SELECT id, name FROM exercises WHERE next_progression_id = $1 ORDER BY difficulty_level DESC LIMIT 1`, [currentId]);
        if (parentRes.rows.length > 0) {
            const parentEx = parentRes.rows[0];
            await client.query(`
                INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                VALUES ($1, $2, $3, 'devolution', 'AMPS: Tech breakdown/RIR failure', CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET
                    replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'devolution', updated_at = CURRENT_TIMESTAMP
            `, [userId, currentId, parentEx.id]);

            // Ustaw flagę trudności
            await client.query(`
                INSERT INTO user_exercise_preferences (user_id, exercise_id, difficulty_rating) VALUES ($1, $2, 1)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET difficulty_rating = 1
            `, [userId, currentId]);

            return { original: hardEx.name, type: 'devolution', newId: parentEx.id, newName: parentEx.name };
        }
    }

    // 2. PROGRESJA (RIR >= 4, Tech >= 9, Rating 'good')
    // Tylko jeśli nie było problemów
    const easyEx = sessionLog.find(l =>
        l.status === 'completed' &&
        !l.isRest &&
        (l.rir >= 4 && (l.tech === undefined || l.tech >= 8))
    );

    if (easyEx) {
        const currentId = easyEx.exerciseId || easyEx.id;
        const currentExRes = await client.query('SELECT id, name, next_progression_id FROM exercises WHERE id = $1', [currentId]);

        if (currentExRes.rows.length > 0) {
            const currentDbEx = currentExRes.rows[0];
            if (currentDbEx.next_progression_id) {
                const nextRes = await client.query('SELECT name FROM exercises WHERE id = $1', [currentDbEx.next_progression_id]);
                const nextName = nextRes.rows[0]?.name || 'Trudniejszy wariant';

                await client.query(`
                    INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                    VALUES ($1, $2, $3, 'evolution', 'AMPS: RIR target exceeded', CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET
                        replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'evolution', updated_at = CURRENT_TIMESTAMP
                `, [userId, currentDbEx.id, currentDbEx.next_progression_id]);

                return { original: currentDbEx.name, type: 'evolution', newId: currentDbEx.next_progression_id, newName: nextName };
            }
        }
    }

    return null;
}

/**
 * AMPS: PLAN ADJUSTMENT (IN-MEMORY)
 * Obsługuje natychmiastowe zmiany z "Like/Dislike" (Affinity Injection/Ejection).
 */
async function applyImmediatePlanAdjustmentsInMemory(client, ratings, sessionLog, settings) {
    const likes = ratings.filter(r => r.action === 'like');
    const dislikes = ratings.filter(r => r.action === 'dislike');

    if (likes.length === 0 && dislikes.length === 0) return false;

    // Placeholder logic - Affinity affects future generation via updatePreferences
    return false;
}

/**
 * AMPS: MICRO-LOADING
 * Dostosowuje liczbę serii na podstawie historii (RIR/Rating).
 */
function applyMicroLoading(sets, historyEntry) {
    if (!historyEntry) return sets;
    let newSets = sets;

    const isHard = historyEntry.rir === 0 || historyEntry.rating === 'hard' || historyEntry.difficultyDeviation === 'hard';
    const isEasy = historyEntry.rir >= 3 || historyEntry.rating === 'good' || historyEntry.difficultyDeviation === 'easy';

    const currentSet = historyEntry.currentSet || 1;
    const totalSets = historyEntry.totalSets || 1;
    const isLastSetOfMultiple = totalSets > 1 && currentSet === totalSets;
    const isMultiSetExercise = totalSets > 1;

    if (isEasy) {
        newSets += 1;
        console.log(`[AMPS] Micro-Loading: Boosted sets (+1 due to easy rating/RIR >= 3)`);
    } else if (isHard) {
        if (isLastSetOfMultiple) {
            newSets -= 1;
            console.log(`[AMPS] Micro-Loading: Reduced sets (-1 due to last-set fatigue)`);
        } else if (!isMultiSetExercise) {
            newSets -= 1;
            console.log(`[AMPS] Micro-Loading: Reduced sets (-1 due to single-set struggle)`);
        } else {
            newSets -= 1;
            console.log(`[AMPS] Micro-Loading: Reduced sets (-1 due to early difficulty)`);
        }
    }

    return newSets;
}

module.exports = {
    inferMissingSessionData,
    updatePreferences,
    analyzeAndAdjustPlan,
    applyImmediatePlanAdjustmentsInMemory,
    applyMicroLoading
};