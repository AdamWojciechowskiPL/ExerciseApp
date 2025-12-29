// netlify/functions/get-or-create-user-data.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      // 1. GWARANCJA ISTNIENIA UŻYTKOWNIKA (Szybki Insert/Check)
      // Używamy transakcji tylko do momentu utworzenia usera/ustawień domyślnych
      await client.query('BEGIN');
      await client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);

      // Sprawdź czy są ustawienia, jeśli nie - utwórz domyślne
      const settingsCheck = await client.query('SELECT 1 FROM user_settings WHERE user_id = $1', [userId]);
      if (settingsCheck.rowCount === 0) {
        const defaultSettings = { appStartDate: new Date().toISOString().split('T')[0], progressionFactor: 100, activePlanId: "l5s1-foundation" };
        await client.query('INSERT INTO user_settings (user_id, settings) VALUES ($1, $2)', [userId, JSON.stringify(defaultSettings)]);
      }
      await client.query('COMMIT');

      // 2. RÓWNOLEGŁE POBIERANIE DANYCH (Parallel Execution)
      // To drastycznie przyspiesza odpowiedź, bo zapytania lecą do NeonDB jednocześnie
      const [
        settingsResult,
        integrationResult,
        recentSessionsResult,
        paceResult,
        preferencesResult,
        blacklistResult,
        overridesResult
      ] = await Promise.all([
        // A. Ustawienia
        client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]),

        // B. Integracje (Strava)
        client.query("SELECT 1 FROM user_integrations WHERE user_id = $1 AND provider = 'strava' LIMIT 1", [userId]),

        // C. Ostatnie sesje (Lightweight Dashboard Data)
        client.query(`
            SELECT session_id, plan_id, started_at, completed_at, session_data
            FROM training_sessions
            WHERE user_id = $1
            ORDER BY completed_at DESC
            LIMIT 3
        `, [userId]),

        // D. Statystyki Tempa (Adaptive Pacing)
        client.query('SELECT exercise_id, avg_seconds_per_rep FROM user_exercise_stats WHERE user_id = $1', [userId]),

        // E. Preferencje (Affinity/Difficulty) - Zastępuje get-user-preferences.js
        client.query('SELECT exercise_id, affinity_score, difficulty_rating FROM user_exercise_preferences WHERE user_id = $1', [userId]),

        // F. Czarna Lista - Zastępuje manage-blacklist.js (GET)
        client.query('SELECT exercise_id, preferred_replacement_id FROM user_exercise_blacklist WHERE user_id = $1', [userId]),

        // G. Overrides (Ewolucje)
        client.query('SELECT original_exercise_id, replacement_exercise_id FROM user_plan_overrides WHERE user_id = $1', [userId])
      ]);

      // 3. PRZETWARZANIE WYNIKÓW (Data Mapping)

      // Settings
      const userSettings = settingsResult.rows.length > 0 ? settingsResult.rows[0].settings : {};

      // Pacing Stats
      const exercisePace = {};
      paceResult.rows.forEach(row => {
          exercisePace[row.exercise_id] = parseFloat(row.avg_seconds_per_rep);
      });

      // Recent Sessions
      const recentSessions = recentSessionsResult.rows.map(row => ({
          ...row.session_data,
          sessionId: row.session_id,
          planId: row.plan_id,
          startedAt: row.started_at,
          completedAt: row.completed_at
      }));

      // Preferences Map
      const preferencesMap = {};
      preferencesResult.rows.forEach(row => {
          preferencesMap[row.exercise_id] = {
              score: row.affinity_score,
              difficulty: row.difficulty_rating
          };
      });

      // Blacklist Array
      const blacklist = blacklistResult.rows.map(row => row.exercise_id);

      // Overrides Map
      const overrides = {};
      overridesResult.rows.forEach(row => {
          overrides[row.original_exercise_id] = row.replacement_exercise_id;
      });

      // 4. BUDOWA MEGA-PAYLOADU
      const dataToReturn = {
        settings: userSettings,
        integrations: { isStravaConnected: integrationResult.rowCount > 0 },
        stats: null, // Detailed stats are fetched separately to not block init
        exercisePace: exercisePace,
        recentSessions: recentSessions,
        // New aggregated fields
        userPreferences: preferencesMap,
        blacklist: blacklist,
        overrides: overrides
      };

      return {
        statusCode: 200,
        // Cache na 5 sekund dla szybkich przeładowań, prywatny
        headers: { 'Cache-Control': 'private, max-age=5' },
        body: JSON.stringify(dataToReturn)
      };

    } catch (dbError) {
      // W razie błędu w bloku równoległym, upewnij się, że transakcja (jeśli otwarta) jest wycofana
      // Ale tutaj transakcja kończy się w punkcie 1, więc jest bezpiecznie.
      console.error("DB Error in Bootstrap:", dbError);
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};