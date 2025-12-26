// netlify/functions/strava-upload-activity.js

const axios = require('axios');
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { encrypt, decrypt } = require('./_crypto-helper.js');

const formatDescription = (sessionLog) => {
  if (!sessionLog || sessionLog.length === 0) {
    return 'Brak szczegółowego logu ćwiczeń.';
  }

  // Krok 1: Filtruj log, aby zostawić tylko wykonane ćwiczenia
  const completedExercises = sessionLog.filter(item => item.status !== 'skipped');

  // Jeśli po odfiltrowaniu nie ma żadnych ćwiczeń, zwróć odpowiedni komunikat
  if (completedExercises.length === 0) {
      return 'Żadne ćwiczenie nie zostało wykonane.';
  }

  // Krok 2: Mapuj przefiltrowaną tablicę na czysty, sformatowany tekst
  const body = completedExercises.map(item => {
    // Przykład: "- McGill curl-up (Seria 1/3): 6 powtórzeń"
    return `- ${item.name} (Seria ${item.currentSet}/${item.totalSets}): ${item.reps_or_time}`;
  }).join('\n'); // Połącz każdą linię znakiem nowej linii

  return body;
};

const getValidAccessToken = async (integrationData) => {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = process.env;
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (integrationData.expires_at > nowInSeconds + 300) {
    console.log('Access token is valid.');
    return decrypt(integrationData.access_token);
  }

  console.log('Access token has expired. Refreshing now...');
  const refreshToken = decrypt(integrationData.refresh_token);

  const response = await axios.post('https://www.strava.com/oauth/token', {
    client_id: STRAVA_CLIENT_ID,
    client_secret: STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const { access_token, refresh_token: new_refresh_token, expires_at } = response.data;

  const encryptedAccessToken = encrypt(access_token);
  const encryptedRefreshToken = encrypt(new_refresh_token);

  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE user_integrations
      SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $4 AND provider = 'strava'
    `, [encryptedAccessToken, encryptedRefreshToken, expires_at, integrationData.user_id]);
    console.log('Tokens refreshed and updated in the database successfully.');
  } finally {
    client.release();
  }

  return access_token;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    const body = JSON.parse(event.body);

    // --- FIX: OBSŁUGA RÓŻNYCH NAZW PÓŁ (trainingTitle vs title) ---
    const { sessionLog, startedAt } = body;
    
    // 1. Ustalanie tytułu (frontend wysyła 'trainingTitle', stara wersja 'title')
    const finalTitle = body.trainingTitle || body.title;

    // 2. Ustalanie czasu trwania (frontend wysyła 'netDurationSeconds', stara wersja 'totalDurationSeconds')
    const duration = (body.netDurationSeconds !== undefined) 
        ? body.netDurationSeconds 
        : body.totalDurationSeconds;

    // Walidacja
    if (!sessionLog || !finalTitle || duration === undefined || !startedAt) {
      console.error('[Strava] Missing fields:', { 
          hasLog: !!sessionLog, 
          title: finalTitle, 
          duration, 
          startedAt 
      });
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required session data (title or duration mismatch).' }) };
    }

    const client = await pool.connect();
    let integrationData;
    try {
      const result = await client.query(
        "SELECT * FROM user_integrations WHERE user_id = $1 AND provider = 'strava'",
        [userId]
      );
      if (result.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Strava integration not found for this user.' }) };
      }
      integrationData = result.rows[0];
    } finally {
      client.release();
    }

    const accessToken = await getValidAccessToken(integrationData);
    const description = formatDescription(sessionLog);

    const stravaPayload = {
      name: finalTitle,
      type: 'Workout',
      start_date_local: startedAt,
      elapsed_time: duration,
      description: description,
    };

    const stravaResponse = await axios.post('https://www.strava.com/api/v3/activities', stravaPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const stravaActivityId = stravaResponse.data.id;
    console.log(`Successfully uploaded activity to Strava. Activity ID: ${stravaActivityId}`);

    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Activity uploaded to Strava successfully.', stravaActivityId }),
    };

  } catch (error) {
    console.error('Error during Strava activity upload:', error.response ? error.response.data : error.message);
    return {
      statusCode: error.response?.status || 500,
      body: JSON.stringify({ error: 'Failed to upload activity to Strava.', details: error.message }),
    };
  }
};