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
      const historyResult = await client.query(
        `SELECT started_at, completed_at, session_data->>'netDurationSeconds' as recorded_duration 
         FROM training_sessions 
         WHERE user_id = $1 
         ORDER BY completed_at DESC`,
        [userId]
      );

      const allDates = [];
      let totalSeconds = 0;

      historyResult.rows.forEach(row => {
        if (row.completed_at) {
          allDates.push(new Date(row.completed_at));
        }

        let duration = 0;

        // 1. Czas netto z nowych sesji
        if (row.recorded_duration) {
          duration = parseInt(row.recorded_duration, 10);
        }

        // 2. Fallback dla starych sesji (różnica czasu)
        if (!duration || isNaN(duration)) {
          const start = row.started_at ? new Date(row.started_at).getTime() : 0;
          const end = row.completed_at ? new Date(row.completed_at).getTime() : 0;

          if (start > 0 && end > 0 && end > start) {
            duration = Math.round((end - start) / 1000);
          }
        }

        // 3. Bezpieczniki
        if (!duration || isNaN(duration) || duration <= 0) {
          duration = 0; // Na razie 0, policzymy ryczałtem na końcu jeśli trzeba
        }
        if (duration > 14400) duration = 2700; // Max 45 min jeśli błąd

        totalSeconds += (duration || 0); // Zabezpieczenie przed NaN
      });

      const totalSessions = historyResult.rowCount;
      const streak = calculateStreak(allDates);
      const resilience = calculateResilience(allDates);

      // --- LOGIKA RATUNKOWA ---
      // Jeśli użytkownik ma sesje, a czas wyszedł 0 lub NaN (bo np. stare dane nie miały dat),
      // to przyjmujemy średnio 30 minut (1800s) na każdy trening.
      if (totalSessions > 0 && (!totalSeconds || isNaN(totalSeconds) || totalSeconds === 0)) {
        totalSeconds = totalSessions * 1800;
      }

      const totalMinutes = Math.floor(totalSeconds / 60);

      let level = 1;
      for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (totalSessions >= LEVEL_THRESHOLDS[i]) level = i + 1;
        else break;
      }

      return {
        statusCode: 200,
        headers: {
          // Nagłówki wymuszające brak cache'owania
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify({ totalSessions, streak, level, resilience, totalMinutes })
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Stats error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};