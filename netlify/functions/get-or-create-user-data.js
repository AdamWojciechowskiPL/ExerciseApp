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
        // Dodaj użytkownika do głównej tabeli 'users'. 'ON CONFLICT DO NOTHING'
        // bezpiecznie obsługuje przypadki, gdyby rekord już istniał.
        const userInsertQuery = 'INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING';
        await client.query(userInsertQuery, [userId]);

        // Zdefiniuj domyślne ustawienia dla nowego użytkownika
        const defaultSettings = {
          appStartDate: new Date().toISOString().split('T')[0],
          restBetweenExercises: 60,
          progressionFactor: 100,
          activePlanId: "l5s1-foundation"
        };

        // Zapisz domyślne ustawienia w bazie danych
        const settingsInsertQuery = 'INSERT INTO user_settings (user_id, settings) VALUES ($1, $2)';
        await client.query(settingsInsertQuery, [userId, JSON.stringify(defaultSettings)]);
        
        userSettings = defaultSettings;
      } else {
        // Jeśli użytkownik już istnieje, po prostu pobierz jego ustawienia
        userSettings = settingsResult.rows[0].settings;
      }

      // ZMIANA KRYTYCZNA: Usunięto pobieranie historii treningów (tabela training_sessions).
      // Ta funkcja zwraca teraz TYLKO ustawienia, co sprawia, że jest bardzo szybka.
      const dataToReturn = {
        settings: userSettings,
      };
      
      // Zatwierdź transakcję, jeśli wszystko przebiegło pomyślnie
      await client.query('COMMIT');
      
      return { statusCode: 200, body: JSON.stringify(dataToReturn) };

    } catch (dbError) {
      // W przypadku jakiegokolwiek błędu, wycofaj wszystkie zmiany w transakcji
      await client.query('ROLLBACK');
      console.error('Database transaction failed, rolled back.', dbError);
      throw dbError; // Rzuć błąd dalej, aby został obsłużony przez zewnętrzny blok catch
    } finally {
      // Zawsze zwalniaj połączenie z bazą danych
      client.release();
    }
  } catch (error) {
    console.error('Error in get-or-create-user-data handler:', error.message);
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};