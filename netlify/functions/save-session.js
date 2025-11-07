// netlify/functions/save-session.js
const { Pool } = require('pg');
const { getUserIdFromEvent } = require('./_auth-helper.js');

const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  
  try {
    const userId = await getUserIdFromEvent(event);
    const { planId, completedAt, ...session_data } = JSON.parse(event.body);

    const client = await pool.connect();
    try {
        const query = 'INSERT INTO training_sessions (user_id, plan_id, completed_at, session_data) VALUES ($1, $2, $3, $4)';
        await client.query(query, [userId, planId, completedAt, JSON.stringify(session_data)]);
        return { statusCode: 201, body: JSON.stringify({ message: "Session saved" }) };
    } finally {
        client.release();
    }
  } catch (error) {
    console.error('Error saving session:', error);
    return { statusCode: 401, body: 'Unauthorized or bad request' };
  }
};