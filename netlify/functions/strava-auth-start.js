// netlify/functions/strava-auth-start.js

const { getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  const { STRAVA_CLIENT_ID, URL } = process.env;

  if (!STRAVA_CLIENT_ID || !URL) {
    console.error('Missing required environment variables: STRAVA_CLIENT_ID or URL');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error.' }),
    };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    
    const params = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      redirect_uri: `${URL}/.netlify/functions/strava-auth-callback`,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:write',
      state: userId, 
    });

    const authorizationUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationUrl }),
    };

  } catch (error) {
    console.error('Authorization error:', error.message);
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized: ' + error.message }),
    };
  }
};