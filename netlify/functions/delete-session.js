// netlify/functions/delete-session.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

/**
 * Bezpiecznie usuwa określoną sesję treningową należącą do zalogowanego użytkownika.
 * 
 * 1. Oczekuje żądania HTTP metodą DELETE, która jest semantycznie poprawna dla usuwania zasobów.
 * 2. Pobiera `sessionId` z parametrów zapytania URL (np. /delete-session?sessionId=123).
 * 3. Weryfikuje tożsamość użytkownika na podstawie jego tokena JWT.
 * 4. Wykonuje zapytanie DELETE do bazy danych, ale z kluczowym warunkiem WHERE,
 *    który sprawdza, czy `sessionId` jest powiązane z `userId`. To zapobiega
 *    sytuacji, w której użytkownik A mógłby usunąć trening użytkownika B.
 * 5. Zwraca potwierdzenie sukcesu lub odpowiedni kod błędu.
 */
exports.handler = async (event) => {
  // Wymagamy, aby metoda była DELETE. Przeglądarka wyśle zapytanie OPTIONS (preflight)
  // przed DELETE, więc musimy na nie zezwolić.
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Lub bardziej restrykcyjnie, Twoja domena
        'Access-Control-Allow-Methods': 'DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    };
  }
  
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Krok 1: Weryfikacja tożsamości użytkownika
    const userId = await getUserIdFromEvent(event);
    const { sessionId } = event.queryStringParameters;

    // Krok 2: Walidacja, czy ID sesji zostało dostarczone
    if (!sessionId || isNaN(parseInt(sessionId, 10))) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'A valid Session ID is required.' }) 
      };
    }

    const client = await pool.connect();
    try {
      // Krok 3: Wykonanie zapytania DELETE z warunkiem bezpieczeństwa
      const result = await client.query(
        'DELETE FROM training_sessions WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      // Krok 4: Weryfikacja wyniku operacji
      // Jeśli `result.rowCount` jest równe 0, oznacza to, że nie znaleziono rekordu,
      // który pasowałby JEDNOCZEŚNIE do `sessionId` i `userId`.
      // Traktujemy to jako próbę dostępu do nieautoryzowanego zasobu.
      if (result.rowCount === 0) {
        return { 
          statusCode: 404, // 404 Not Found jest tu bardziej odpowiednie niż 403 Forbidden
          body: JSON.stringify({ error: 'Session not found or you do not have permission to delete it.' }) 
        };
      }

      // Jeśli `rowCount` jest > 0, operacja się powiodła
      return { 
        statusCode: 200, // 200 OK jest standardem dla udanego DELETE
        body: JSON.stringify({ message: 'Training session deleted successfully.' }) 
      };

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting session:', error.message);
    // Obsługa ogólnych błędów serwera lub autoryzacji
    if (error.message.includes('Unauthorized')) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
    }
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'An internal server error occurred.' }) 
    };
  }
};