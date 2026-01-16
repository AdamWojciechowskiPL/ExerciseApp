// netlify/functions/delete-session.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateAndUpsertPace } = require('./_stats-helper.js');

/**
 * Bezpiecznie usuwa określoną sesję treningową należącą do zalogowanego użytkownika.
 * Oraz przelicza statystyki tempa (Adaptive Pacing) po usunięciu.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    };
  }

  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    const { sessionId } = event.queryStringParameters;

    if (!sessionId || isNaN(parseInt(sessionId, 10))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'A valid Session ID is required.' })
      };
    }

    const client = await pool.connect();
    try {
      // 1. POBIERAMY DANE SESJI PRZED USUNIĘCIEM
      // Musimy wiedzieć, jakie ćwiczenia były w tej sesji, aby przeliczyć ich statystyki.
      const getSessionQuery = `
        SELECT session_data
        FROM training_sessions
        WHERE session_id = $1 AND user_id = $2
      `;
      const sessionResult = await client.query(getSessionQuery, [sessionId, userId]);

      if (sessionResult.rowCount === 0) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Session not found or you do not have permission to delete it.' })
        };
      }

      const sessionData = sessionResult.rows[0].session_data;
      const exerciseIdsToRecalculate = new Set();

      // Wyciągamy ID ćwiczeń wykonanych na powtórzenia (z logu)
      if (sessionData && sessionData.sessionLog && Array.isArray(sessionData.sessionLog)) {
          sessionData.sessionLog.forEach(log => {
              // Interesują nas tylko zakończone ćwiczenia
              if (log.status === 'completed') {
                  const valStr = String(log.reps_or_time || "").toLowerCase();
                  // Tylko rep-based (bez 's', 'min', ':')
                  if (!valStr.includes('s') && !valStr.includes('min') && !valStr.includes(':')) {
                      exerciseIdsToRecalculate.add(log.exerciseId || log.id);
                  }
              }
          });
      }

      // 2. USUWANIE SESJI
      await client.query(
        'DELETE FROM training_sessions WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      // 3. PRZELICZANIE STATYSTYK (PO USUNIĘCIU)
      // Robimy to w try-catch, aby błąd statystyk nie maskował sukcesu usunięcia sesji.
      if (exerciseIdsToRecalculate.size > 0) {
          try {
              console.log(`[DeleteSession] Recalculating stats for ${exerciseIdsToRecalculate.size} exercises...`);
              await calculateAndUpsertPace(client, userId, Array.from(exerciseIdsToRecalculate));
          } catch (statError) {
              console.error("[DeleteSession] Warning: Failed to recalculate stats after deletion:", statError);
          }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Training session deleted successfully.' })
      };

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting session:', error.message);
    if (error.message.includes('Unauthorized')) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An internal server error occurred.' })
    };
  }
};