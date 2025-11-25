// netlify/functions/get-or-create-user-data.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      
      // 1. Ensure User & Settings
      await client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
      
      let settingsResult = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
      let userSettings;
      
      if (settingsResult.rows.length === 0) {
        const defaultSettings = { appStartDate: new Date().toISOString().split('T')[0], progressionFactor: 100, activePlanId: "l5s1-foundation" };
        await client.query('INSERT INTO user_settings (user_id, settings) VALUES ($1, $2)', [userId, JSON.stringify(defaultSettings)]);
        userSettings = defaultSettings;
      } else {
        userSettings = settingsResult.rows[0].settings;
      }

      // 2. Integrations
      const integrationResult = await client.query("SELECT 1 FROM user_integrations WHERE user_id = $1 AND provider = 'strava' LIMIT 1", [userId]);
      
      // 3. LIGHTWEIGHT Session Check (Tylko 3 ostatnie, bez liczenia statystyk)
      // To jest błyskawiczne zapytanie, które pozwala Dashboardowi działać
      const recentQuery = `
        SELECT session_id, plan_id, started_at, completed_at, session_data 
        FROM training_sessions 
        WHERE user_id = $1 
        ORDER BY completed_at DESC 
        LIMIT 3
      `;
      const recentResult = await client.query(recentQuery, [userId]);
      
      const recentSessions = recentResult.rows.map(row => ({
          ...row.session_data,
          sessionId: row.session_id,
          planId: row.plan_id,
          startedAt: row.started_at,
          completedAt: row.completed_at
      }));

      // Zwracamy null dla stats - frontend doładuje je w tle
      const dataToReturn = {
        settings: userSettings,
        integrations: { isStravaConnected: integrationResult.rowCount > 0 },
        stats: null, // <--- Tu jest zmiana. Nie liczymy tego teraz.
        recentSessions: recentSessions
      };
      
      await client.query('COMMIT');
      return { statusCode: 200, body: JSON.stringify(dataToReturn) };

    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};