// netlify/functions/get-recent-history.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    
    // Domyślnie pobieramy 60 dni, jeśli nie podano inaczej
    const days = parseInt(event.queryStringParameters.days) || 60;

    // Obliczamy datę graniczną w JS
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffISO = cutoffDate.toISOString();

    const client = await pool.connect();
    try {
      const query = `
        SELECT session_id, plan_id, started_at, completed_at, session_data 
        FROM training_sessions 
        WHERE user_id = $1 
          AND completed_at >= $2
        ORDER BY completed_at DESC
      `;
      
      const result = await client.query(query, [userId, cutoffISO]);
      
      // Mapujemy wyniki tak samo jak w get-history-by-month
      const historyData = result.rows.map(row => ({
          ...row.session_data,
          sessionId: row.session_id,
          planId: row.plan_id,
          startedAt: row.started_at,
          completedAt: row.completed_at,
      }));
      
      return { 
        statusCode: 200, 
        body: JSON.stringify(historyData) 
      };

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching recent history:', error);
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};