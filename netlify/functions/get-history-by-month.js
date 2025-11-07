// netlify/functions/get-history-by-month.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    const { year, month } = event.queryStringParameters;

    if (!year || !month) {
      return { statusCode: 400, body: 'Year and month parameters are required.' };
    }

    // Obliczanie daty początkowej i końcowej miesiąca
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const client = await pool.connect();
    try {
      const query = `
        SELECT session_id, plan_id, completed_at, session_data 
        FROM training_sessions 
        WHERE user_id = $1 AND completed_at >= $2 AND completed_at < $3
        ORDER BY completed_at DESC
      `;
      
      const progressResult = await client.query(query, [userId, startDate.toISOString(), endDate.toISOString()]);
      
      const historyData = progressResult.rows.map(row => ({
          ...row.session_data,
          sessionId: row.session_id,
          planId: row.plan_id,
          completedAt: row.completed_at,
      }));
      
      return { statusCode: 200, body: JSON.stringify(historyData) };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching history:', error);
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};