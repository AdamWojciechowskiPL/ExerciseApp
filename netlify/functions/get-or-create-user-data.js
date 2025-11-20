// netlify/functions/get-or-create-user-data.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

// Konfiguracja progów (musi być spójna z frontendem)
const LEVEL_THRESHOLDS = [
    0, 1, 3, 6, 10, 15, 21, 28, 36, 45,
    55, 65, 75, 85, 100, 115, 130, 145, 160, 175,
    190, 210, 230, 250, 275, 300, 350, 400, 450, 500
];

// Funkcja pomocnicza do obliczania serii (Streak)
function calculateStreak(dates) {
    if (!dates || dates.length === 0) return 0;
    
    // Unikalne daty YYYY-MM-DD
    const uniqueDates = [...new Set(dates.map(d => d.toISOString().split('T')[0]))];
    if (uniqueDates.length === 0) return 0;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    // Jeśli ostatni trening nie był dzisiaj ani wczoraj, seria = 0
    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
        return 0;
    }

    let streak = 1;
    let currentDateStr = uniqueDates[0];

    for (let i = 1; i < uniqueDates.length; i++) {
        const prevDateStr = uniqueDates[i];
        const curr = new Date(currentDateStr);
        const prev = new Date(prevDateStr);
        const diffDays = Math.round(Math.abs(curr - prev) / (1000 * 60 * 60 * 24)); 

        if (diffDays === 1) {
            streak++;
            currentDateStr = prevDateStr;
        } else if (diffDays === 0) {
            continue;
        } else {
            break;
        }
    }
    return streak;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Upewnij się, że użytkownik istnieje
      await client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);

      // 2. Pobierz ustawienia
      let settingsResult = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
      let userSettings;

      if (settingsResult.rows.length === 0) {
        const defaultSettings = {
          appStartDate: new Date().toISOString().split('T')[0],
          progressionFactor: 100,
          activePlanId: "l5s1-foundation"
        };
        await client.query('INSERT INTO user_settings (user_id, settings) VALUES ($1, $2)', [userId, JSON.stringify(defaultSettings)]);
        userSettings = defaultSettings;
      } else {
        userSettings = settingsResult.rows[0].settings;
      }

      // 3. Sprawdź integrację Strava
      const integrationResult = await client.query("SELECT 1 FROM user_integrations WHERE user_id = $1 AND provider = 'strava' LIMIT 1", [userId]);
      const isStravaConnected = integrationResult.rowCount > 0;

      // 4. --- GAMIFIKACJA (NOWOŚĆ) ---
      // Pobierz historię dat treningów
      const historyResult = await client.query(
        'SELECT completed_at FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC', 
        [userId]
      );

      const allDates = historyResult.rows.map(row => new Date(row.completed_at));
      const totalSessions = historyResult.rowCount;
      const streak = calculateStreak(allDates);

      // Oblicz Level
      let level = 1;
      for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (totalSessions >= LEVEL_THRESHOLDS[i]) level = i + 1;
        else break;
      }

      const stats = { totalSessions, streak, level };
      // -------------------------------

      const dataToReturn = {
        settings: userSettings,
        integrations: { isStravaConnected },
        stats: stats // Zwracamy nowy obiekt
      };
      
      await client.query('COMMIT');
      return { statusCode: 200, body: JSON.stringify(dataToReturn) };

    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('Database transaction failed, rolled back.', dbError);
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in get-or-create-user-data handler:', error.message);
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};