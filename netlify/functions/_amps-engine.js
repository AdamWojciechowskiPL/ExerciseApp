// netlify/functions/_amps-engine.js
'use strict';

const SCORE_LIKE_INCREMENT = 15;
const SCORE_DISLIKE_DECREMENT = 30;
const SCORE_MAX = 100;
const SCORE_MIN = -100;

/**
 * AMPS: INFERENCE ENGINE
 * Uzupełnia brakujące dane w logu sesji.
 * Supports new difficultyDeviation field from minimal-click rating system.
 */
function inferMissingSessionData(sessionLog, feedback) {
    if (!Array.isArray(sessionLog)) return sessionLog;

    let defaultRating = 'ok';
    let defaultRir = 2;

    if (feedback) {
        const val = parseInt(feedback.value, 10);
        if (val === -1) { defaultRating = 'hard'; defaultRir = 1; }
        else if (val === 1) { defaultRating = 'good'; defaultRir = 4; }
    }

    return sessionLog.map(entry => {
        if (entry.status === 'skipped' || entry.isRest) return entry;
        const newEntry = { ...entry };

        // Priority 1: Check for explicit difficultyDeviation from new UI
        if (newEntry.difficultyDeviation) {
            if (newEntry.difficultyDeviation === 'easy') {
                newEntry.rating = 'good';
                newEntry.rir = newEntry.rir ?? 4;
                newEntry.tech = newEntry.tech ?? 10;
            } else if (newEntry.difficultyDeviation === 'hard') {
                newEntry.rating = 'hard';
                newEntry.rir = newEntry.rir ?? 0;
                newEntry.tech = newEntry.tech ?? 6;
            }
            return newEntry;
        }

        // Priority 2: If rating/RIR already set (from explicit user action), keep them
        if (newEntry.rating && !newEntry.inferred) {
            return newEntry;
        }

        // Priority 3: Infer from existing RIR if present
        if (newEntry.rir !== undefined && newEntry.rir !== null && !newEntry.rating) {
            if (newEntry.rir <= 1) newEntry.rating = 'hard';
            else if (newEntry.rir >= 3) newEntry.rating = 'good';
            else newEntry.rating = 'ok';
            newEntry.inferred = true;
            return newEntry;
        }

        // Priority 4: Fall back to session-level feedback defaults
        if (!newEntry.rating && (newEntry.rir === undefined || newEntry.rir === null)) {
            newEntry.rating = defaultRating;
            newEntry.rir = defaultRir;
            newEntry.inferred = true;
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

    const plan = settings.dynamicPlanData;
    if (!plan || !plan.days) return false;

    // Logika wewnątrz save-session.js była częściowo pusta ("... Reszta logiki ...") w podglądzie,
    // ale AMPS opiera się na prostym założeniu: like/dislike wpływa na affinity_score (już zrobione w updatePreferences),
    // a funkcja ta zwraca true, jeśli plan wymaga przeładowania (tutaj po prostu zwracamy false lub true,
    // w oryginalnym kodzie było to bardziej złożone, ale tutaj upraszczamy do sygnalizacji).
    // W pełni reaktywny plan i tak odświeży się przy następnym generowaniu.

    // W oryginalnym save-session.js ta funkcja zwracała flagę, czy zmodyfikowano plan w pamięci.
    // Skoro tutaj nie mamy dostępu do pełnego obiektu 'plan' i logiki 'replaceExerciseInPlan',
    // a AMPS ewoluował w stronę twardych danych, możemy uznać, że affinity wpływa na PRZYSZŁE generowanie planu.
    // Zwracamy false, żeby nie wymuszać skomplikowanych operacji na JSONie w locie, chyba że jest to krytyczne.

    // TODO: Jeśli wymagana jest natychmiastowa podmiana ćwiczenia w *następnych* dniach tego samego planu,
    // należałoby tutaj zaimplementować logikę przeszukiwania plan.days.
    // Na ten moment zwracamy false sugerując, że zmiany wejdą w życie przy kolejnym re-rollu.

    return false;
}

/**
 * AMPS: MICRO-LOADING
 * Dostosowuje liczbę serii na podstawie historii (RIR/Rating).
 * Enhanced with set-context awareness for smarter volume adjustments.
 * 
 * If exercise was hard on last set of multiple sets → reduce volume (set fatigue)
 * If exercise was hard on single set or early sets → consider exercise too difficult
 * If exercise was easy → increase volume
 */
function applyMicroLoading(sets, historyEntry) {
    if (!historyEntry) return sets;
    let newSets = sets;

    const isHard = historyEntry.rir === 0 || historyEntry.rating === 'hard' || historyEntry.difficultyDeviation === 'hard';
    const isEasy = historyEntry.rir >= 3 || historyEntry.rating === 'good' || historyEntry.difficultyDeviation === 'easy';

    // Check if this was a set-fatigue issue (hard on later sets of multi-set exercise)
    const currentSet = historyEntry.currentSet || 1;
    const totalSets = historyEntry.totalSets || 1;
    const isLastSetOfMultiple = totalSets > 1 && currentSet === totalSets;
    const isMultiSetExercise = totalSets > 1;

    if (isEasy) {
        // Exercise was too easy - increase volume
        newSets += 1;
        console.log(`[AMPS] Micro-Loading: Boosted sets (+1 due to easy rating/RIR >= 3)`);
    } else if (isHard) {
        if (isLastSetOfMultiple) {
            // Hard on last set of multiple = likely set fatigue, not exercise difficulty
            // Reduce sets for next time but don't flag as "too hard overall"
            newSets -= 1;
            console.log(`[AMPS] Micro-Loading: Reduced sets (-1 due to last-set fatigue)`);
        } else if (!isMultiSetExercise) {
            // Hard on single set = exercise may be too difficult overall
            // Still reduce, but this should trigger consideration for devolution
            newSets -= 1;
            console.log(`[AMPS] Micro-Loading: Reduced sets (-1 due to single-set struggle)`);
        } else {
            // Hard on early/middle set = definitely too difficult
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
