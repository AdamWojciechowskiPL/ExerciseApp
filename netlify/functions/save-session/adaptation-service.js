'use strict';

const {
    inferMissingSessionData,
    updatePreferences,
    analyzeAndAdjustPlan,
    applyImmediatePlanAdjustmentsInMemory
} = require('../_amps-engine.js');

function enrichSessionLog(session_data, settings) {
    if (session_data.sessionLog) {
        session_data.sessionLog = inferMissingSessionData(session_data.sessionLog, settings);
    }
    return session_data;
}

async function applyPreferenceAndPlanAdaptation(client, userId, sessionLog, settings, exerciseRatings, exerciseDifficultyRatings) {
    if ((exerciseRatings && exerciseRatings.length > 0) || (exerciseDifficultyRatings && exerciseDifficultyRatings.length > 0)) {
        await updatePreferences(client, userId, exerciseRatings, exerciseDifficultyRatings);
    }

    const adaptationResult = await analyzeAndAdjustPlan(client, userId, sessionLog);

    if (!adaptationResult && exerciseRatings && exerciseRatings.length > 0) {
        await applyImmediatePlanAdjustmentsInMemory(client, exerciseRatings, sessionLog, settings);
    }

    return adaptationResult;
}

module.exports = { enrichSessionLog, applyPreferenceAndPlanAdaptation };
