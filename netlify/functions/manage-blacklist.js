const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      // 1. GET: Pobierz czarną listę
      if (event.httpMethod === 'GET') {
        const result = await client.query(
          'SELECT exercise_id FROM user_exercise_blacklist WHERE user_id = $1',
          [userId]
        );
        // Zwracamy samą tablicę ID-ków
        return {
          statusCode: 200,
          body: JSON.stringify(result.rows.map(row => row.exercise_id)),
        };
      }

      // 2. POST: Dodaj do czarnej listy
      if (event.httpMethod === 'POST') {
        const { exerciseId, replacementId } = JSON.parse(event.body);
        await client.query(
          `INSERT INTO user_exercise_blacklist (user_id, exercise_id, preferred_replacement_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, exercise_id) DO UPDATE SET preferred_replacement_id = EXCLUDED.preferred_replacement_id`,
          [userId, exerciseId, replacementId || null]
        );
        return { statusCode: 200, body: JSON.stringify({ message: 'Added' }) };
      }

      // 3. DELETE: Usuń z czarnej listy
      if (event.httpMethod === 'DELETE') {
        const { exerciseId } = JSON.parse(event.body);
        await client.query(
          'DELETE FROM user_exercise_blacklist WHERE user_id = $1 AND exercise_id = $2',
          [userId, exerciseId]
        );
        return { statusCode: 200, body: JSON.stringify({ message: 'Removed' }) };
      }

      return { statusCode: 405, body: 'Method Not Allowed' };

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Blacklist API Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};