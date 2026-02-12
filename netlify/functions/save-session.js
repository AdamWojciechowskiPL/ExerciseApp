// ExerciseApp/netlify/functions/save-session.js
'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateStreak, calculateResilience, calculateAndUpsertPace } = require('./_stats-helper.js');
const { updatePhaseStateAfterSession, checkDetraining } = require('./_phase-manager.js');
const { validatePainMonitoring } = require('./_data-contract.js');

const {
    inferMissingSessionData,
    updatePreferences,
    analyzeAndAdjustPlan,
    applyImmediatePlanAdjustmentsInMemory
} = require('./_amps-engine.js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const userId = await getUserIdFromEvent(event);
        const body = JSON.parse(event.body);
        let { planId, startedAt, completedAt, feedback, exerciseRatings, ...session_data } = body;

        if (!planId || !startedAt || !completedAt) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: Missing required fields' }) };
        }

        if (feedback) {
            const validation = validatePainMonitoring(feedback);
            if (!validation.valid) {
                return { statusCode: 400, body: JSON.stringify({ error: `Feedback Error: ${validation.error}` }) };
            }
        }

        const client = await pool.connect();
        let adaptationResult = null;
        let newStats = null;
        let phaseTransition = null;

        try {
            await client.query('BEGIN');

            const settingsRes = await client.query('SELECT settings FROM user_settings WHERE user_id = $1 FOR UPDATE', [userId]);
            let settings = settingsRes.rows[0]?.settings || {};

            // --- AMPS SMART INFERENCE v2.0 ---
            // Uruchamiamy wnioskowanie dopiero teraz, gdy mamy dostęp do `settings` (dla secondsPerRep)
            if (session_data.sessionLog) {
                session_data.sessionLog = inferMissingSessionData(session_data.sessionLog, feedback, settings);
            }
            // ---------------------------------

            let phaseState = settings.phase_manager;

            if (phaseState) {
                phaseState = checkDetraining(phaseState);
                const activePhaseId = phaseState.override.mode || phaseState.current_phase_stats.phase_id;
                const updateResult = updatePhaseStateAfterSession(phaseState, activePhaseId, settings.wizardData);
                phaseState = updateResult.newState;
                phaseTransition = updateResult.transition;
                settings.phase_manager = phaseState;
            }

            // Zapis sesji (z już uzupełnionym Smart Inference Logiem)
            await client.query(`
                INSERT INTO training_sessions (user_id, plan_id, started_at, completed_at, session_data)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, planId, startedAt, completedAt, JSON.stringify({ ...session_data, feedback, exerciseRatings })]);

            // AMPS: Aktualizacja Preferencji (Tylko Affinity)
            if (exerciseRatings && exerciseRatings.length > 0) {
                await updatePreferences(client, userId, exerciseRatings);
            }

            // AMPS: Analiza Progresji (Na podstawie Logów, nie Przycisków)
            adaptationResult = await analyzeAndAdjustPlan(client, userId, session_data.sessionLog);

            // Jeśli nie ma twardej progresji, spróbuj miękkiej adaptacji planu (Affinity)
            if (!adaptationResult && exerciseRatings && exerciseRatings.length > 0) {
                await applyImmediatePlanAdjustmentsInMemory(client, exerciseRatings, session_data.sessionLog, settings);
            }

            const historyResult = await client.query('SELECT completed_at FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC', [userId]);
            const allDates = historyResult.rows.map(r => new Date(r.completed_at));
            newStats = {
                totalSessions: historyResult.rowCount,
                streak: calculateStreak(allDates),
                resilience: calculateResilience(allDates)
            };

            await client.query(
                `UPDATE user_settings SET settings = $1 WHERE user_id = $2`,
                [JSON.stringify(settings), userId]
            );

            await client.query('COMMIT');

            // Fire & Forget: Pace stats
            try {
                if (session_data.sessionLog && Array.isArray(session_data.sessionLog)) {
                    const exerciseIds = new Set();
                    session_data.sessionLog.forEach(log => {
                        if (log.status === 'completed' && log.duration > 0) {
                            const valStr = String(log.reps_or_time || "").toLowerCase();
                            if (!valStr.includes('s') && !valStr.includes('min') && !valStr.includes(':')) exerciseIds.add(log.exerciseId || log.id);
                        }
                    });
                    if (exerciseIds.size > 0) await calculateAndUpsertPace(client, userId, Array.from(exerciseIds));
                }
            } catch (e) { console.error("Pace update failed:", e); }

            return {
                statusCode: 201,
                body: JSON.stringify({
                    message: "Saved",
                    adaptation: adaptationResult,
                    newStats,
                    phaseUpdate: phaseTransition ? {
                        transition: phaseTransition,
                        newPhaseId: phaseState.current_phase_stats.phase_id,
                        isSoft: phaseState.current_phase_stats.is_soft_progression
                    } : null
                })
            };

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Handler Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: `Server Error: ${error.message}` }) };
    }
};