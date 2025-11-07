// netlify/functions/save-settings.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'PUT') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const userId = await getUserIdFromEvent(event);
    const newSettings = JSON.parse(event.body);
    const client = await pool.connect();

    try {
        const query = `
            INSERT INTO user_settings (user_id, settings, updated_at) 
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP`;
        await client.query(query, [userId, JSON.stringify(newSettings)]);
        return { statusCode: 200, body: JSON.stringify({ message: "Settings updated" }) };
    } finally {
        client.release();
    }
  } catch (error) {
    console.error('Error saving settings:', error.message);
    return { statusCode: 401, body: `Unauthorized or bad request: ${error.message}` };
  }
};