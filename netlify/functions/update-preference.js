// netlify/functions/update-preference.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

// --- SMART REHAB CONSTANTS ---
const SCORE_LIKE_INCREMENT = 15;
const SCORE_DISLIKE_DECREMENT = 30;
const SCORE_MAX = 100;
const SCORE_MIN = -100;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  try {
    const userId = await getUserIdFromEvent(event);
    const { exerciseId, action, value } = JSON.parse(event.body);

    if (!exerciseId || !action) {
        return { statusCode: 400, body: "Missing parameters" };
    }

    const client = await pool.connect();

    let performUpdate = true;
    let isResetDifficulty = false;
    let sql = '';
    let params = [];

    switch (action) {
        // --- PRZYROSTOWE ---
        case 'like':
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = LEAST($4, user_exercise_preferences.affinity_score + $3),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, SCORE_LIKE_INCREMENT, SCORE_MAX];
            break;

        case 'dislike':
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, -$3, 0, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = GREATEST($4, user_exercise_preferences.affinity_score - $3),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, SCORE_DISLIKE_DECREMENT, SCORE_MIN];
            break;

        case 'neutral':
            performUpdate = false; // W modelu akumulacji neutral nic nie robi
            break;

        // --- ABSOLUTNE (z Tunera) ---
        case 'set':
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = $3,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, typeof value === 'number' ? value : 0];
            break;

        case 'set_difficulty':
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, 0, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    difficulty_rating = $3,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, value];
            break;

        case 'reset_difficulty':
            isResetDifficulty = true;
            performUpdate = false;
            break;

        default:
            performUpdate = false;
    }

    try {
        if (isResetDifficulty) {
            await client.query(`
                UPDATE user_exercise_preferences
                SET difficulty_rating = 0, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1 AND exercise_id = $2
            `, [userId, exerciseId]);

            await client.query(`
                DELETE FROM user_plan_overrides
                WHERE user_id = $1 AND original_exercise_id = $2
            `, [userId, exerciseId]);

            return { statusCode: 200, body: JSON.stringify({ message: "Difficulty reset and overrides removed" }) };
        }

        if (performUpdate && sql) {
            const result = await client.query(sql, params);
            const newPref = result.rows[0];
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "Updated",
                    newScore: Math.round(newPref.affinity_score),
                    newDifficulty: newPref.difficulty_rating
                })
            };
        }

        return { statusCode: 200, body: JSON.stringify({ message: "No action taken" }) };

    } finally {
        client.release();
    }
  } catch (error) {
    console.error('Update Pref Error:', error);
    return { statusCode: 500, body: error.message };
  }
};