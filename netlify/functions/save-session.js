// netlify/functions/save-session.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js'); // Zmieniono na poprawny import

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  
  try {
    const userId = await getUserIdFromEvent(event);
    // Wyodrębniamy nowe pole `startedAt` z ciała żądania
    const { planId, startedAt, completedAt, ...session_data } = JSON.parse(event.body);

    // Walidacja, czy kluczowe dane zostały przesłane
    if (!planId || !startedAt || !completedAt) {
      return { statusCode: 400, body: 'Bad Request: Missing required session metadata.' };
    }

    const client = await pool.connect();
    try {
        // Zaktualizowane zapytanie INSERT, które uwzględnia nową kolumnę `started_at`
        const query = `
          INSERT INTO training_sessions 
            (user_id, plan_id, started_at, completed_at, session_data) 
          VALUES ($1, $2, $3, $4, $5)
        `;
        await client.query(query, [userId, planId, startedAt, completedAt, JSON.stringify(session_data)]);
        return { statusCode: 201, body: JSON.stringify({ message: "Session saved" }) };
    } finally {
        client.release();
    }
  } catch (error) {
    console.error('Error saving session:', error);
    return { statusCode: 401, body: 'Unauthorized or bad request' };
  }
};