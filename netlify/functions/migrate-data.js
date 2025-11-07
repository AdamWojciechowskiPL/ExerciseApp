// netlify/functions/migrate-data.js
const { Pool } = require('pg');
const { getUserIdFromEvent } = require('./_auth-helper.js');

const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  try {
    const userId = await getUserIdFromEvent(event);
    const sessionsToMigrate = JSON.parse(event.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const session of sessionsToMigrate) {
        const { planId, completedAt, ...session_data } = session;
        const query = 'INSERT INTO training_sessions (user_id, plan_id, completed_at, session_data) VALUES ($1, $2, $3, $4)';
        await client.query(query, [userId, planId, completedAt, JSON.stringify(session_data)]);
      }
      await client.query('COMMIT');
      return { statusCode: 200, body: JSON.stringify({ message: "Migration successful" }) };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error migrating data:', error);
    return { statusCode: 401, body: 'Unauthorized or bad request' };
  }
};