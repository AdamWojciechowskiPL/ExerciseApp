'use strict';

const { updatePhaseStateAfterSession, checkDetraining } = require('../_phase-manager.js');
const { enrichSessionLog, applyPreferenceAndPlanAdaptation } = require('./adaptation-service.js');
const { calculateUserStats } = require('./stats-service.js');

async function executeSaveSessionTransaction(client, userId, payload) {
    const { planId, startedAt, completedAt, feedback, exerciseRatings, exerciseDifficultyRatings } = payload;
    let { session_data } = payload;

    await client.query('BEGIN');

    try {
        const settingsRes = await client.query('SELECT settings FROM user_settings WHERE user_id = $1 FOR UPDATE', [userId]);
        const settings = settingsRes.rows[0]?.settings || {};

        let phaseTransition = null;
        let phaseState = settings.phase_manager;

        if (phaseState) {
            phaseState = checkDetraining(phaseState);
            const activePhaseId = phaseState.override.mode || phaseState.current_phase_stats.phase_id;
            const updateResult = updatePhaseStateAfterSession(phaseState, activePhaseId, settings.wizardData);
            phaseState = updateResult.newState;
            phaseTransition = updateResult.transition;
            settings.phase_manager = phaseState;
        }

        session_data = enrichSessionLog(session_data, feedback, settings);

        await client.query(`
            INSERT INTO training_sessions (user_id, plan_id, started_at, completed_at, session_data)
            VALUES ($1, $2, $3, $4, $5)
        `, [userId, planId, startedAt, completedAt, JSON.stringify({
            ...session_data,
            feedback,
            exerciseRatings,
            exerciseDifficultyRatings
        })]);

        const adaptationResult = await applyPreferenceAndPlanAdaptation(
            client,
            userId,
            session_data.sessionLog,
            settings,
            exerciseRatings,
            exerciseDifficultyRatings
        );

        const newStats = await calculateUserStats(client, userId);

        await client.query(
            'UPDATE user_settings SET settings = $1 WHERE user_id = $2',
            [JSON.stringify(settings), userId]
        );

        await client.query('COMMIT');

        return {
            adaptationResult,
            newStats,
            phaseState,
            phaseTransition,
            session_data
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}

module.exports = { executeSaveSessionTransaction };
