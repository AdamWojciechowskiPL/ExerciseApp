// netlify/functions/get-user-preferences.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405 };

  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      const result = await client.query(
        'SELECT exercise_id, affinity_score, difficulty_rating FROM user_exercise_preferences WHERE user_id = $1',
        [userId]
      );

      // Przekształcamy tablicę w mapę dla szybkiego dostępu na frontendzie:
      // { "deadBug": { score: 20, difficulty: 0 }, ... }
      const preferencesMap = result.rows.reduce((acc, row) => {
        acc[row.exercise_id] = {
          score: row.affinity_score,
          difficulty: row.difficulty_rating
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