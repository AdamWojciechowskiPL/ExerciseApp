// netlify/functions/strava-disconnect.js

const axios = require('axios');
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { decrypt } = require('./_crypto-helper.js');

/**
 * Bezpiecznie rozłącza konto Strava użytkownika od naszej aplikacji.
 * 
 * 1. Weryfikuje tożsamość użytkownika na podstawie tokena JWT.
 * 2. Pobiera zaszyfrowany access_token z bazy danych.
 * 3. Deszyfruje access_token.
 * 4. Wysyła żądanie do API Strava w celu unieważnienia (deautoryzacji) tokena.
 * 5. Usuwa rekord integracji z tabeli `user_integrations`.
 * 6. Zwraca odpowiedź o sukcesie.
 */
exports.handler = async (event) => {
  // Funkcja musi być wywoływana metodą POST dla bezpieczeństwa.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Krok 1: Weryfikacja tożsamości użytkownika.
    const userId = await getUserIdFromEvent(event);
    const client = await pool.connect();
    let accessToken;

    try {
      // Krok 2: Pobranie rekordu integracji z bazy danych.
      const result = await client.query(
        "SELECT access_token FROM user_integrations WHERE user_id = $1 AND provider = 'strava'",
        [userId]
      );

      if (result.rows.length === 0) {
        // Jeśli integracja nie istnieje, nie ma nic do zrobienia.
        // Zwracamy sukces, aby UI mogło się poprawnie zaktualizować.
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'No active Strava integration found to disconnect.' }),
        };
      }

      const encryptedAccessToken = result.rows[0].access_token;
      
      // Krok 3: Deszyfrowanie tokena.
      accessToken = decrypt(encryptedAccessToken);

    } finally {
      client.release();
    }

    try {
      // Krok 4: Deautoryzacja tokena po stronie Strava.
      // Strava wymaga wysłania tokena w ciele żądania.
      await axios.post('https://www.strava.com/oauth/deauthorize', {
        access_token: accessToken,
      });
    } catch (stravaError) {
      // Jeśli deautoryzacja na Stravie się nie powiedzie (np. token już wygasł lub został unieważniony),
      // logujemy błąd, ale kontynuujemy proces, ponieważ naszym głównym celem jest usunięcie
      // integracji z naszej bazy danych.
      console.warn('Strava deauthorization failed, but proceeding with local disconnection.', stravaError.response ? stravaError.response.data : stravaError.message);
    }
    
    // Krok 5: Usunięcie rekordu integracji z naszej bazy danych.
    const deleteClient = await pool.connect();
    try {
        await deleteClient.query(
            "DELETE FROM user_integrations WHERE user_id = $1 AND provider = 'strava'",
            [userId]
        );
    } finally {
        deleteClient.release();
    }


    // Krok 6: Zwrócenie odpowiedzi o sukcesie.
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Strava account disconnected successfully.' }),
    };

  } catch (error) {
    console.error('Error during Strava disconnection:', error.message);
    
    if (error.message.includes('Unauthorized')) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An internal server error occurred.' }),
    };
  }
};