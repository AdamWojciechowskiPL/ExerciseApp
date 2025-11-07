// netlify/functions/delete-user-data.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();

    try {
      // Rozpoczynamy transakcję, aby zapewnić, że wszystkie operacje się powiodą albo żadna
      await client.query('BEGIN');

      // Krok 1: Usuń dane zależne (sesje treningowe)
      await client.query('DELETE FROM training_sessions WHERE user_id = $1', [userId]);

      // Krok 2: Usuń dane zależne (ustawienia)
      await client.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);

      // Krok 3: Usuń główny rekord użytkownika
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      // Jeśli wszystko się udało, zatwierdzamy transakcję
      await client.query('COMMIT');

      return { statusCode: 200, body: JSON.stringify({ message: 'User data deleted successfully.' }) };
    } catch (dbError) {
      // W przypadku błędu na którymkolwiek etapie, wycofujemy wszystkie zmiany
      await client.query('ROLLBACK');
      console.error('Database transaction failed, rolled back.', dbError);
      throw dbError; // Rzucamy błąd, aby został przechwycony przez zewnętrzny blok try/catch
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting user data:', error.message);
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};