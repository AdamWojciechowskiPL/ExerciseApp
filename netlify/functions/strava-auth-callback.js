// netlify/functions/strava-auth-callback.js

const axios = require('axios');
const { pool } = require('./_auth-helper.js');
const { encrypt } = require('./_crypto-helper.js');

/**
 * Obsługuje przekierowanie zwrotne od Strava po autoryzacji przez użytkownika.
 * 
 * 1. Odbiera tymczasowy kod (`code`) i stan (`state`, czyli user_id).
 * 2. Wymienia kod na tokeny (access_token, refresh_token) poprzez API Strava.
 * 3. Szyfruje otrzymane tokeny.
 * 4. Zapisuje zaszyfrowane tokeny i dane sportowca w bazie danych.
 * 5. Przekierowuje użytkownika z powrotem do aplikacji z odpowiednim statusem.
 */
exports.handler = async (event) => {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, URL } = process.env;
  const { code, state: userId, error } = event.queryStringParameters;

  // Definiujemy docelowy URL przekierowania w aplikacji.
  const redirectUrl = `${URL}/#settings`;

  // Jeśli użytkownik anulował autoryzację na Stravie.
  if (error === 'access_denied') {
    return {
      statusCode: 302,
      headers: {
        Location: `${redirectUrl}?strava_status=cancelled`,
      },
    };
  }
  
  // Walidacja podstawowych parametrów.
  if (!code || !userId) {
    return {
      statusCode: 302,
      headers: {
        Location: `${redirectUrl}?strava_status=error&message=Invalid_request_parameters`,
      },
    };
  }

  try {
    // Krok 1: Wymiana kodu na tokeny.
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    const { access_token, refresh_token, expires_at, athlete } = response.data;

    // Krok 2: Szyfrowanie tokenów przed zapisem do bazy.
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = encrypt(refresh_token);

    // Krok 3: Zapisanie danych integracji w bazie (operacja "upsert").
    const query = `
      INSERT INTO user_integrations 
        (user_id, provider, strava_athlete_id, access_token, refresh_token, expires_at, scope)
      VALUES 
        ($1, 'strava', $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, provider) 
      DO UPDATE SET
        strava_athlete_id = EXCLUDED.strava_athlete_id,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        scope = EXCLUDED.scope,
        updated_at = CURRENT_TIMESTAMP;
    `;
    
    const client = await pool.connect();
    try {
        await client.query(query, [
            userId,
            athlete.id,
            encryptedAccessToken,
            encryptedRefreshToken,
            expires_at,
            'read,activity:write' // Zapisujemy zakres, o który prosiliśmy
        ]);
    } finally {
        client.release();
    }
    
    // Krok 4: Przekierowanie użytkownika z powrotem do aplikacji z informacją o sukcesie.
    return {
      statusCode: 302, // 302 Found - standard dla przekierowań
      headers: {
        Location: `${redirectUrl}?strava_status=success`,
      },
    };

  } catch (err) {
    console.error('Error in Strava auth callback:', err.response ? err.response.data : err.message);
    const errorMessage = err.response?.data?.errors?.[0]?.message || 'Failed_to_exchange_token';
    return {
      statusCode: 302,
      headers: {
        Location: `${redirectUrl}?strava_status=error&message=${encodeURIComponent(errorMessage)}`,
      },
    };
  }
};