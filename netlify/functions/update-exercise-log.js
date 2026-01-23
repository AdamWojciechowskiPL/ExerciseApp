// netlify/functions/update-exercise-log.js
'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const userId = await getUserIdFromEvent(event);
        const { sessionId, exerciseId, tech, rir } = JSON.parse(event.body);

        if (!sessionId || !exerciseId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Pobierz sesję (blokując wiersz do edycji)
            const res = await client.query(
                `SELECT session_data FROM training_sessions WHERE session_id = $1 AND user_id = $2 FOR UPDATE`,
                [sessionId, userId]
            );

            if (res.rowCount === 0) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
            }

            const sessionData = res.rows[0].session_data;
            const log = sessionData.sessionLog || [];
            let updated = false;

            // 2. Znajdź i zaktualizuj wpisy dla danego ćwiczenia
            // Aktualizujemy wszystkie wpisy dla tego ID (np. jeśli są 3 serie, aktualizujemy ocenę dla całości w tym kontekście UX)
            // W bardziej zaawansowanej wersji moglibyśmy używać uniqueId dla konkretnej serii.
            for (const entry of log) {
                const entryId = entry.exerciseId || entry.id;
                if (String(entryId) === String(exerciseId)) {
                    // Aktualizacja wartości
                    if (tech !== undefined) entry.tech = tech;
                    if (rir !== undefined) entry.rir = rir;
                    
                    // Usuwamy flagę 'inferred', bo teraz to jest ocena manualna użytkownika
                    entry.inferred = false;
                    delete entry.inferenceReason;
                    
                    // Opcjonalnie: przeliczamy rating na podstawie RIR (dla spójności)
                    if (rir !== undefined) {
                        if (rir === 0) entry.rating = 'hard';
                        else if (rir >= 3) entry.rating = 'good';
                        else entry.rating = 'ok';
                    }
                    
                    updated = true;
                }
            }

            if (!updated) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Exercise not found in session log' }) };
            }

            // 3. Zapisz zaktualizowany JSON
            await client.query(
                `UPDATE training_sessions SET session_data = $1 WHERE session_id = $2`,
                [JSON.stringify(sessionData), sessionId]
            );

            await client.query('COMMIT');

            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Log updated successfully', updatedLog: log })
            };

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Update Log Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};