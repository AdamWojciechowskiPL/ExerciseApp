'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

function loadSaveSessionServices() {
    const modules = [
        './save-session/request-validation.js',
        './save-session/session-transaction.js',
        './save-session/stats-service.js',
        './save-session/adaptation-service.js'
    ];
    modules.forEach((m) => {
        try { delete require.cache[require.resolve(m)]; } catch (_) { /* noop */ }
    });

    return {
        ...require('./save-session/request-validation.js'),
        ...require('./save-session/session-transaction.js'),
        ...require('./save-session/stats-service.js')
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const requestStartedAtMs = Date.now();
        const { validateSaveSessionRequest, executeSaveSessionTransaction, updatePaceStats } = loadSaveSessionServices();
        const userId = await getUserIdFromEvent(event);
        const body = JSON.parse(event.body);

        const validation = validateSaveSessionRequest(body);
        if (!validation.ok) return validation.response;

        const {
            planId,
            startedAt,
            completedAt,
            feedback,
            exerciseRatings,
            exerciseDifficultyRatings,
            ...session_data
        } = body;

        const client = await pool.connect();
        try {
            const result = await executeSaveSessionTransaction(client, userId, {
                planId,
                startedAt,
                completedAt,
                feedback,
                exerciseRatings,
                exerciseDifficultyRatings,
                session_data
            });

            const paceUpdateDurationMs = await updatePaceStats(client, userId, result.session_data.sessionLog);

            console.info('[save-session] Request cost', {
                userId,
                totalDurationMs: Date.now() - requestStartedAtMs,
                paceUpdateDurationMs
            });

            return {
                statusCode: 201,
                body: JSON.stringify({
                    message: 'Saved',
                    adaptation: result.adaptationResult,
                    newStats: result.newStats,
                    phaseUpdate: result.phaseTransition ? {
                        transition: result.phaseTransition,
                        newPhaseId: result.phaseState.current_phase_stats.phase_id,
                        isSoft: result.phaseState.current_phase_stats.is_soft_progression
                    } : null
                })
            };
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Handler Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: `Server Error: ${error.message}` }) };
    }
};
