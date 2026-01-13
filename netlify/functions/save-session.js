// netlify/functions/save-session.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateStreak, calculateResilience, calculateAndUpsertPace } = require('./_stats-helper.js');

// --- SMART REHAB MODEL CONFIG ---
const SCORE_LIKE_INCREMENT = 15;
const SCORE_DISLIKE_DECREMENT = 30;
const SCORE_MAX = 100;
const SCORE_MIN = -100;

/**
 * Aktualizuje preferencje (Affinity) w trybie PRZYROSTOWYM (Model Akumulacji).
 */
async function updatePreferences(client, userId, ratings) {
    if (!ratings || !Array.isArray(ratings) || ratings.length === 0) return;

    for (const rating of ratings) {
        let sql = '';
        let params = [];

        // Logika przyrostowa (Smart Rehab)
        // Zamiast ustawiać na 50, dodajemy 15 lub odejmujemy 30.
        // GREATEST/LEAST pilnują zakresu -100 do +100.

        if (rating.action === 'like') {
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = LEAST($4, user_exercise_preferences.affinity_score + $3),
                    updated_at = CURRENT_TIMESTAMP
            `;
            params = [userId, rating.exerciseId, SCORE_LIKE_INCREMENT, SCORE_MAX];
        }
        else if (rating.action === 'dislike') {
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, -$3, 0, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = GREATEST($4, user_exercise_preferences.affinity_score - $3),
                    updated_at = CURRENT_TIMESTAMP
            `;
            params = [userId, rating.exerciseId, SCORE_DISLIKE_DECREMENT, SCORE_MIN];
        }
        else if (rating.action === 'neutral') {
            // Neutral nie zmienia wyniku w modelu akumulacji
            continue;
        }

        if (sql) {
            await client.query(sql, params);
        }
    }
}

/**
 * Analizuje Ewolucję/Dewolucję i obsługuje Ping-Pong (Micro-Dosing).
 */
async function analyzeAndAdjustPlan(client, userId, sessionLog, feedback, ratings) {
    if (!ratings || ratings.length === 0) return null;

    const hardRating = ratings.find(r => r.action === 'hard');

    if (hardRating) {
        const currentId = hardRating.exerciseId;
        const currentNameRes = await client.query('SELECT name FROM exercises WHERE id = $1', [currentId]);
        const currentName = currentNameRes.rows[0]?.name || 'Ćwiczenie';

        const historyCheck = await client.query(`
            SELECT original_exercise_id
            FROM user_plan_overrides
            WHERE user_id = $1 AND replacement_exercise_id = $2 AND adjustment_type = 'evolution'
        `, [userId, currentId]);

        if (historyCheck.rows.length > 0) {
            console.log(`🏓 Ping-Pong detected for ${currentId}. Applying Micro-Dosing.`);
            const reason = "Ping-Pong: Too Hard after Evolution. Applying Micro-Dose.";

            await client.query(`
                INSERT INTO user_plan_overrides
                (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                VALUES ($1, $2, $2, 'micro_dose', $3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, original_exercise_id)
                DO UPDATE SET
                    replacement_exercise_id = $2,
                    adjustment_type = 'micro_dose',
                    reason = $3,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, currentId, reason]);

            // Reset affinity to 0 to be safe
            await client.query(`
                UPDATE user_exercise_preferences SET affinity_score = 0 WHERE user_id = $1 AND exercise_id = $2
            `, [userId, currentId]);

            return { original: currentName, type: 'micro_dose', newName: `${currentName} (Mikro-Serie)` };
        }

        const parentRes = await client.query(`
            SELECT id, name, difficulty_level
            FROM exercises
            WHERE next_progression_id = $1
            ORDER BY difficulty_level DESC
            LIMIT 1
        `, [currentId]);

        if (parentRes.rows.length > 0) {
            const parentEx = parentRes.rows[0];
            const reason = "User rated as Too Hard";

            await client.query(`
                INSERT INTO user_plan_overrides
                (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                VALUES ($1, $2, $3, 'devolution', $4, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, original_exercise_id)
                DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'devolution', reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP
            `, [userId, currentId, parentEx.id, reason]);

            // Reset affinity
            await client.query(`
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, updated_at)
                VALUES ($1, $3, 0, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET affinity_score = 0
            `, [userId, currentId, parentEx.id]);

            return { original: currentName, type: 'devolution', newId: parentEx.id, newName: parentEx.name };
        }
    }

    const easyRating = ratings.find(r => r.action === 'easy');

    if (easyRating) {
        const currentExRes = await client.query('SELECT id, name, next_progression_id FROM exercises WHERE id = $1', [easyRating.exerciseId]);
        if (currentExRes.rows.length > 0) {
            const currentEx = currentExRes.rows[0];

            if (currentEx.next_progression_id) {
                const nextRes = await client.query('SELECT name FROM exercises WHERE id = $1', [currentEx.next_progression_id]);
                const nextName = nextRes.rows[0]?.name || 'Trudniejszy wariant';
                const reason = "User rated as Too Easy";

                await client.query(`
                    INSERT INTO user_plan_overrides
                    (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                    VALUES ($1, $2, $3, 'evolution', $4, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, original_exercise_id)
                    DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'evolution', reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP
                `, [userId, currentEx.id, currentEx.next_progression_id, reason]);

                return { original: currentEx.name, type: 'evolution', newId: currentEx.next_progression_id, newName: nextName };
            }
        }
    }

    return null;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const userId = await getUserIdFromEvent(event);
        const body = JSON.parse(event.body);

        const { planId, startedAt, completedAt, feedback, exerciseRatings, ...session_data } = body;

        if (!planId || !startedAt || !completedAt) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: Missing required fields' }) };
        }

        const client = await pool.connect();
        let adaptationResult = null;
        let newStats = null;

        try {
            await client.query('BEGIN');

            const sessionDataToSave = { ...session_data, feedback, exerciseRatings };

            await client.query(`
                INSERT INTO training_sessions (user_id, plan_id, started_at, completed_at, session_data)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, planId, startedAt, completedAt, JSON.stringify(sessionDataToSave)]);

            if (exerciseRatings && exerciseRatings.length > 0) {
                await updatePreferences(client, userId, exerciseRatings);
            }

            if (exerciseRatings && exerciseRatings.length > 0) {
                adaptationResult = await analyzeAndAdjustPlan(client, userId, session_data.sessionLog, feedback, exerciseRatings);
            }

            const historyResult = await client.query(
                'SELECT completed_at FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC',
                [userId]
            );
            const allDates = historyResult.rows.map(r => new Date(r.completed_at));

            newStats = {
                totalSessions: historyResult.rowCount,
                streak: calculateStreak(allDates),
                resilience: calculateResilience(allDates)
            };

            await client.query('COMMIT');

            try {
                if (session_data.sessionLog && Array.isArray(session_data.sessionLog)) {
                    const exerciseIds = new Set();
                    session_data.sessionLog.forEach(log => {
                        if (log.status === 'completed' && log.duration > 0) {
                            const valStr = String(log.reps_or_time || "").toLowerCase();
                            if (!valStr.includes('s') && !valStr.includes('min') && !valStr.includes(':')) {
                                exerciseIds.add(log.exerciseId || log.id);
                            }
                        }
                    });

                    if (exerciseIds.size > 0) {
                        console.log('[Stats] Recalculating pace for:', Array.from(exerciseIds));
                        await calculateAndUpsertPace(client, userId, Array.from(exerciseIds));
                    }
                }
            } catch (statsError) {
                console.error('[Stats] Error calculating pace:', statsError);
            }

            return {
                statusCode: 201,
                body: JSON.stringify({
                    message: "Session saved successfully",
                    adaptation: adaptationResult,
                    newStats: newStats
                })
            };

        } catch (dbError) {
            await client.query('ROLLBACK');
            console.error('Database transaction error:', dbError);
            throw dbError;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Error in save-session handler:', error);
        return { statusCode: 500, body: JSON.stringify({ error: `Server Error: ${error.message}` }) };
    }
};