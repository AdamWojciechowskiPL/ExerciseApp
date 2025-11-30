// netlify/functions/save-session.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateStreak, calculateResilience } = require('./_stats-helper.js'); // Import helpera

// (Funkcja analyzeAndAdjustPlan pozostaje bez zmian - wklejam ją skrótowo)
async function analyzeAndAdjustPlan(client, userId, sessionLog, feedback) {

    let direction = 'maintain';
    let reason = '';
    if (feedback.type === 'tension') {
        if (feedback.value === 1) { direction = 'evolve'; reason = 'Monotony detected'; }
        else if (feedback.value === -1) { direction = 'devolve'; reason = 'Control loss'; }
    } else if (feedback.type === 'symptom') {
        if (feedback.value === -1) { direction = 'devolve'; reason = 'Flare-up'; }
    }
    if (direction === 'maintain') return null;

    const candidates = sessionLog.filter(ex => !ex.isRest && ex.status !== 'skipped');
    if (candidates.length === 0) return null;
    const candidateIds = candidates.map(c => c.exerciseId || c.id).filter(Boolean);
    const exercisesResult = await client.query(`SELECT id, name, next_progression_id FROM exercises WHERE id = ANY($1)`, [candidateIds]);
    const dbExercises = exercisesResult.rows;
    
    for (const dbEx of dbExercises) {
        if (direction === 'evolve' && dbEx.next_progression_id) {
            await client.query(`INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason) VALUES ($1, $2, $3, 'evolution', $4) ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'evolution', reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP`, [userId, dbEx.id, dbEx.next_progression_id, reason]);
            return { original: dbEx.name, type: 'evolution', newId: dbEx.next_progression_id };
        } else if (direction === 'devolve') {
            const parentResult = await client.query(`SELECT id, name FROM exercises WHERE next_progression_id = $1 LIMIT 1`, [dbEx.id]);
            if (parentResult.rows.length > 0) {
                const parentEx = parentResult.rows[0];
                await client.query(`INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason) VALUES ($1, $2, $3, 'devolution', $4) ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'devolution', reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP`, [userId, dbEx.id, parentEx.id, reason]);
                return { original: dbEx.name, type: 'devolution', newId: parentEx.id, newName: parentEx.name };
            }
        }
    }
    return null;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 };

    try {
        const userId = await getUserIdFromEvent(event);
        const body = JSON.parse(event.body);
        const { planId, startedAt, completedAt, feedback, ...session_data } = body;

        if (!planId || !startedAt || !completedAt) return { statusCode: 400, body: 'Bad Request' };

        const client = await pool.connect();
        let adaptationResult = null;
        let newStats = null; // Tutaj trafią obliczone statystyki

        try {
            await client.query('BEGIN');

            // 1. Zapisz Sesję
            const sessionDataToSave = { ...session_data, feedback };
            await client.query(`
                INSERT INTO training_sessions (user_id, plan_id, started_at, completed_at, session_data) 
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, planId, startedAt, completedAt, JSON.stringify(sessionDataToSave)]);

            // 2. Analiza Ewolucji
            if (feedback && feedback.value !== 0) {
                adaptationResult = await analyzeAndAdjustPlan(client, userId, session_data.sessionLog, feedback);
            }

            // 3. --- NOWOŚĆ: REKALKULACJA STATYSTYK (Streak + Resilience) ---
            // Pobieramy daty, aby przeliczyć statystyki "na świeżo"
            // Pobieramy tylko kolumnę completed_at, to lekkie zapytanie
            const historyResult = await client.query(
                'SELECT completed_at FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC',
                [userId]
            );
            const allDates = historyResult.rows.map(r => new Date(r.completed_at));
            
            newStats = {
                totalSessions: historyResult.rowCount,
                streak: calculateStreak(allDates),
                resilience: calculateResilience(allDates) // Liczymy tarczę
            };

            await client.query('COMMIT');
            
            return { 
                statusCode: 201, 
                body: JSON.stringify({ 
                    message: "Session saved", 
                    adaptation: adaptationResult,
                    newStats: newStats // Zwracamy frontendowi nowe statystyki!
                }) 
            };

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Error saving session:', error);
        return { statusCode: 500, body: `Server Error: ${error.message}` };
    }
};