// netlify/functions/get-or-create-user-data.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Krok 1: Bezpiecznie uzyskaj ID użytkownika z tokena JWT
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      // Rozpocznij transakcję, aby zapewnić spójność danych
      await client.query('BEGIN');

      // Krok 2: Sprawdź, czy użytkownik ma już zapisane ustawienia
      let settingsResult = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
      let userSettings;

      // Krok 3: Jeśli użytkownik nie ma ustawień (jest to jego pierwsza wizyta),
      // utwórz dla niego domyślny profil.
      if (settingsResult.rows.length === 0) {
        const userInsertQuery = 'INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING';
        await client.query(userInsertQuery, [userId]);

        const defaultSettings = {
          appStartDate: new Date().toISOString().split('T')[0],
          restBetweenExercises: 60,
          progressionFactor: 100,
          activePlanId: "l5s1-foundation"
        };

        const settingsInsertQuery = 'INSERT INTO user_settings (user_id, settings) VALUES ($1, $2)';
        await client.query(settingsInsertQuery, [userId, JSON.stringify(defaultSettings)]);
        
        userSettings = defaultSettings;
      } else {
        userSettings = settingsResult.rows[0].settings;
      }

      // --- POCZĄTEK KLUCZOWEJ ZMIANY ---
      // Krok 4: Sprawdź, czy istnieje aktywna integracja ze Stravą
      const integrationQuery = "SELECT 1 FROM user_integrations WHERE user_id = $1 AND provider = 'strava' LIMIT 1";
      const integrationResult = await client.query(integrationQuery, [userId]);
      
      // `integrationResult.rowCount` będzie równe 1, jeśli wpis istnieje, lub 0, jeśli nie.
      const isStravaConnected = integrationResult.rowCount > 0;
      // --- KONIEC KLUCZOWEJ ZMIANY ---

      // Krok 5: Skonstruuj obiekt odpowiedzi, który zawiera teraz obie informacje
      const dataToReturn = {
        settings: userSettings,
        integrations: {
          isStravaConnected: isStravaConnected,
        }
      };
      
      // Zatwierdź transakcję, jeśli wszystko przebiegło pomyślnie
      await client.query('COMMIT');
      
      return { statusCode: 200, body: JSON.stringify(dataToReturn) };

    } catch (dbError) {
      // W przypadku jakiegokolwiek błędu, wycofaj wszystkie zmiany w transakcji
      await client.query('ROLLBACK');
      console.error('Database transaction failed, rolled back.', dbError);
      throw dbError;
    } finally {
      // Zawsze zwalniaj połączenie z bazą danych
      client.release();
    }
  } catch (error) {
    console.error('Error in get-or-create-user-data handler:', error.message);
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};