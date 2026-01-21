// netlify/functions/patch-session-feedback.js
'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { validatePainMonitoring } = require('./_data-contract.js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const userId = await getUserIdFromEvent(event);
        const { sessionId, after24h, note } = JSON.parse(event.body);

        if (!sessionId || !after24h) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing sessionId or after24h data' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Pobierz aktualne dane sesji
            const res = await client.query(
                `SELECT session_data FROM training_sessions WHERE session_id = $1 AND user_id = $2 FOR UPDATE`,
                [sessionId, userId]
            );

            if (res.rowCount === 0) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
            }

            const sessionData = res.rows[0].session_data;
            const currentFeedback = sessionData.feedback || {};

            // 2. Sprawdź, czy feedback jest w nowym formacie
            if (currentFeedback.type !== 'pain_monitoring') {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: 'Cannot patch legacy feedback session' }) };
            }

            // 3. Zaktualizuj sekcję after24h
            currentFeedback.after24h = {
                ...after24h,
                updated_at: new Date().toISOString()
            };

            if (note) {
                currentFeedback.note = (currentFeedback.note ? currentFeedback.note + "\n[24h]: " : "[24h]: ") + note;
            }

            // 4. Walidacja całego obiektu po scaleniu
            const validation = validatePainMonitoring(currentFeedback);
            if (!validation.valid) {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: `Validation failed: ${validation.error}` }) };
            }

            // 5. Zapisz zaktualizowany JSON
            sessionData.feedback = currentFeedback;

            await client.query(
                `UPDATE training_sessions SET session_data = $1 WHERE session_id = $2`,
                [JSON.stringify(sessionData), sessionId]
            );

            await client.query('COMMIT');

            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Feedback updated successfully (24h check-in)' })
            };

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Patch Feedback Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};