// netlify/functions/recalculate-stats.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateAndUpsertPace } = require('./_stats-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      // 1. Znajdź wszystkie unikalne ID ćwiczeń, które użytkownik kiedykolwiek wykonał (status completed)
      // Używamy jsonb_array_elements, aby "rozpakować" tablicę sessionLog z JSONB
      const query = `
        SELECT DISTINCT COALESCE(log_item->>'exerciseId', log_item->>'id') as exercise_id
        FROM training_sessions ts,
             jsonb_array_elements(ts.session_data->'sessionLog') as log_item
        WHERE ts.user_id = $1
          AND log_item->>'status' = 'completed'
      `;

      const result = await client.query(query, [userId]);
      const exerciseIds = result.rows
        .map(row => row.exercise_id)
        .filter(id => id); // Usuwamy ewentualne nulle

      if (exerciseIds.length === 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'No exercises found to recalculate.' })
        };
      }

      console.log(`[Recalc] Found ${exerciseIds.length} unique exercises for user ${userId}`);

      // 2. Uruchom przeliczanie dla znalezionych ID
      // Funkcja helpera sama pobierze historię i zaktualizuje tabelę user_exercise_stats
      await calculateAndUpsertPace(client, userId, exerciseIds);

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Statistics recalculated successfully.',
          count: exerciseIds.length
        })
      };

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Recalculate Stats Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};