// netlify/functions/update-preference.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  try {
    const userId = await getUserIdFromEvent(event);
    const { exerciseId, action, value } = JSON.parse(event.body);

    if (!exerciseId || !action) {
        return { statusCode: 400, body: "Missing parameters" };
    }

    const client = await pool.connect();
    
    let targetScore = 0;
    let targetDiff = 0; // 0 = Neutral
    let performUpdate = true;
    let isResetDifficulty = false;

    switch (action) {
        case 'like': 
            targetScore = 50; 
            break;
        case 'dislike': 
            targetScore = -50; 
            break;
        case 'neutral':
            targetScore = 0;
            break;
            
        case 'set': 
            targetScore = typeof value === 'number' ? value : 0;
            break;

        case 'set_difficulty':
            targetDiff = value;
            performUpdate = false; 
            break;
            
        case 'reset_difficulty':
            isResetDifficulty = true;
            performUpdate = false;
            break;
            
        default:
            performUpdate = false;
    }

    try {
        let query = '';
        let params = [];

        if (isResetDifficulty) {
            // 1. Zresetuj flagę w preferencjach
            await client.query(`
                UPDATE user_exercise_preferences 
                SET difficulty_rating = 0, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1 AND exercise_id = $2
            `, [userId, exerciseId]);

            // 2. Usuń overrides (Cofnij Ewolucję/Dewolucję)
            // Usuwamy wpisy, gdzie to ćwiczenie było ŹRÓDŁEM zmiany
            await client.query(`
                DELETE FROM user_plan_overrides
                WHERE user_id = $1 AND original_exercise_id = $2
            `, [userId, exerciseId]);

            return { statusCode: 200, body: JSON.stringify({ message: "Difficulty reset and overrides removed" }) };
        }
        else if (action === 'set_difficulty') {
            query = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, 0, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    difficulty_rating = $3,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, targetDiff];
        } else {
            query = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = $3,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, targetScore];
        }

        if (!isResetDifficulty) {
            const result = await client.query(query, params);
            const newPref = result.rows[0];
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: "Updated",
                    newScore: newPref.affinity_score,
                    newDifficulty: newPref.difficulty_rating
                })
            };
        }

    } finally {
        client.release();
    }
  } catch (error) {
    console.error('Update Pref Error:', error);
    return { statusCode: 500, body: error.message };
  }
};