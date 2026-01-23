// netlify/functions/update-preference.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

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
    let sql = '';
    let params = [];

    // OBSŁUGA STAREGO SYSTEMU ZOSTAŁA USUNIĘTA.
    // TERAZ TYLKO AFFINITY (SCORE).

    switch (action) {
        case 'like':
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = LEAST($4, COALESCE(user_exercise_preferences.affinity_score, 0) + $3),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score;
            `;
            params = [userId, exerciseId, SCORE_LIKE_INCREMENT, SCORE_MAX];
            break;

        case 'dislike':
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, updated_at)
                VALUES ($1, $2, -$3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = GREATEST($4, COALESCE(user_exercise_preferences.affinity_score, 0) - $3),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score;
            `;
            params = [userId, exerciseId, SCORE_DISLIKE_DECREMENT, SCORE_MIN];
            break;

        case 'set': // Z Tunera (ustawienie dokładnej wartości)
            sql = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = $3,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score;
            `;
            params = [userId, exerciseId, typeof value === 'number' ? value : 0];
            break;

        // Akcje 'set_difficulty', 'reset_difficulty', 'hard', 'easy' są ignorowane lub przeniesione
        // do AMPS (update-exercise-log i save-session).
        default:
            return { statusCode: 200, body: JSON.stringify({ message: "Action ignored (Legacy/AMPS handled elsewhere)" }) };
    }

    try {
        const result = await client.query(sql, params);
        const newPref = result.rows[0];
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Updated",
                newScore: Math.round(newPref.affinity_score)
            })
        };
    } finally {
        client.release();
    }
  } catch (error) {
    console.error('Update Pref Error:', error);
    return { statusCode: 500, body: error.message };
  }
};