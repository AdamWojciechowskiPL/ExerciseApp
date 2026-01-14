// netlify/functions/get-user-preferences.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405 };

  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      // ZMIANA: Pobieramy updated_at
      const result = await client.query(
        'SELECT exercise_id, affinity_score, difficulty_rating, updated_at FROM user_exercise_preferences WHERE user_id = $1',
        [userId]
      );

      const preferencesMap = result.rows.reduce((acc, row) => {
        acc[row.exercise_id] = {
          score: row.affinity_score,
          difficulty: row.difficulty_rating,
          updatedAt: row.updated_at // Dodano timestamp
        };
        return acc;
      }, {});

      return {
        statusCode: 200,
        body: JSON.stringify(preferencesMap)
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get Preferences Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};