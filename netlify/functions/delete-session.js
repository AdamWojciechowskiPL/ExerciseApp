// netlify/functions/delete-session.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateAndUpsertPace } = require('./_stats-helper.js');

/**
 * Bezpiecznie usuwa sesję i aktualizuje Phase Manager TYLKO JEŚLI sesja należy do obecnej fazy.
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const userId = await getUserIdFromEvent(event);
    const { sessionId } = event.queryStringParameters;

    if (!sessionId) return { statusCode: 400, body: 'Session ID required' };

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. POBIERZ DANE SESJI (Data i Logi)
      const sessionRes = await client.query(
        `SELECT completed_at, session_data FROM training_sessions WHERE session_id = $1 AND user_id = $2`,
        [sessionId, userId]
      );

      if (sessionRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
      }

      const session = sessionRes.rows[0];
      const sessionDate = new Date(session.completed_at);
      const isCompleted = session.session_data?.status === 'completed';

      // 2. POBIERZ PHASE MANAGER (Ustawienia)
      const settingsRes = await client.query(
        `SELECT settings FROM user_settings WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      let settingsChanged = false;
      if (settingsRes.rows.length > 0 && isCompleted) {
        const settings = settingsRes.rows[0].settings;
        const pm = settings.phase_manager;

        if (pm) {
            // A. SPRAWDŹ FAZĘ BAZOWĄ
            if (pm.current_phase_stats) {
                const phaseStart = new Date(pm.current_phase_stats.start_date);
                // Logika: Jeśli sesja odbyła się PO rozpoczęciu tej fazy, to znaczy, że nabiła licznik.
                // Odejmujemy tylko wtedy, gdy licznik > 0.
                if (sessionDate >= phaseStart && pm.current_phase_stats.sessions_completed > 0) {
                    console.log(`[DeleteSession] Decrementing Base Phase counter for user ${userId}`);
                    pm.current_phase_stats.sessions_completed--;
                    settingsChanged = true;
                } else {
                    console.log(`[DeleteSession] Session is older than current phase start (${phaseStart.toISOString()}). Ignoring counter.`);
                }
            }

            // B. SPRAWDŹ OVERRIDE (np. Rehab/Deload)
            if (pm.override && pm.override.mode && pm.override.stats) {
                // Jeśli override ma datę startu (powinien mieć, ale dla bezpieczeństwa sprawdzamy)
                // Jeśli nie ma daty startu w stats, używamy 'triggered_at'
                const overrideStartStr = pm.override.stats.start_date || pm.override.triggered_at;
                if (overrideStartStr) {
                    const overrideStart = new Date(overrideStartStr);
                    if (sessionDate >= overrideStart && pm.override.stats.sessions_completed > 0) {
                        console.log(`[DeleteSession] Decrementing Override counter.`);
                        pm.override.stats.sessions_completed--;
                        settingsChanged = true;
                    }
                }
            }
        }

        // ZAPISZ ZMIANY W USTAWIENIACH
        if (settingsChanged) {
            await client.query(
                `UPDATE user_settings SET settings = $1 WHERE user_id = $2`,
                [JSON.stringify(settings), userId]
            );
        }
      }

      // 3. USUŃ SESJĘ
      await client.query(
        'DELETE FROM training_sessions WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      await client.query('COMMIT');

      // 4. PRZELICZ STATYSTYKI TEMPA (Fire & Forget, poza transakcją)
      // (Nie musimy czekać na to, żeby zwrócić sukces userowi)
      if (session.session_data?.sessionLog) {
          const idsToRecalc = new Set();
          session.session_data.sessionLog.forEach(l => {
              if (l.status === 'completed' && !String(l.reps_or_time).includes('s')) {
                  idsToRecalc.add(l.exerciseId || l.id);
              }
          });
          if (idsToRecalc.size > 0) {
              calculateAndUpsertPace(client, userId, Array.from(idsToRecalc))
                  .catch(err => console.error("Stats recalc failed:", err));
          }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Deleted and counters updated if necessary.' })
      };

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Delete Error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    } finally {
      client.release();
    }

  } catch (error) {
    return { statusCode: 500, body: 'Server Error' };
  }
};