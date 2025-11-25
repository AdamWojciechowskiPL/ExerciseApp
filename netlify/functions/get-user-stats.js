// netlify/functions/get-user-stats.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateStreak, calculateResilience } = require('./_stats-helper.js');

const LEVEL_THRESHOLDS = [
    0, 1, 3, 6, 10, 15, 21, 28, 36, 45,
    55, 65, 75, 85, 100, 115, 130, 145, 160, 175,
    190, 210, 230, 250, 275, 300, 350, 400, 450, 500
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405 };

  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      // Pobieramy same daty wszystkich sesji (lekkie payload, ale skanuje całą tabelę usera)
      const historyResult = await client.query(
        'SELECT completed_at FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC', 
        [userId]
      );
      
      const allDates = historyResult.rows.map(row => new Date(row.completed_at));
      const totalSessions = historyResult.rowCount;
      
      const streak = calculateStreak(allDates);
      const resilience = calculateResilience(allDates);

      let level = 1;
      for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (totalSessions >= LEVEL_THRESHOLDS[i]) level = i + 1;
        else break;
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ totalSessions, streak, level, resilience })
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Stats error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};