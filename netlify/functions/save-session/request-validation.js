'use strict';

const { validatePainMonitoring } = require('../_data-contract.js');

const ALLOWED_AFFINITY_ACTIONS = new Set(['like', 'dislike']);
const ALLOWED_DIFFICULTY_RATINGS = new Set([-1, 0, 1]);

function parseExerciseId(rawId) {
    return String(rawId || '').trim();
}

function validateExerciseRatingsContract(ratings) {
    if (ratings === undefined) return { valid: true };
    if (!Array.isArray(ratings)) return { valid: false, error: 'Bad Request: exerciseRatings must be an array' };

    for (const [index, rating] of ratings.entries()) {
        const exerciseId = parseExerciseId(rating?.exerciseId);
        const action = rating?.action;
        if (!exerciseId) return { valid: false, error: `Bad Request: exerciseRatings[${index}].exerciseId is required` };
        if (!ALLOWED_AFFINITY_ACTIONS.has(action)) return { valid: false, error: `Bad Request: exerciseRatings[${index}].action must be like/dislike` };
    }

    return { valid: true };
}

function validateExerciseDifficultyRatingsContract(ratings) {
    if (ratings === undefined) return { valid: true };
    if (!Array.isArray(ratings)) return { valid: false, error: 'Bad Request: exerciseDifficultyRatings must be an array' };

    for (const [index, rating] of ratings.entries()) {
        const exerciseId = parseExerciseId(rating?.exerciseId);
        const difficultyRating = Number(rating?.difficultyRating);
        if (!exerciseId) return { valid: false, error: `Bad Request: exerciseDifficultyRatings[${index}].exerciseId is required` };
        if (!ALLOWED_DIFFICULTY_RATINGS.has(difficultyRating)) return { valid: false, error: `Bad Request: exerciseDifficultyRatings[${index}].difficultyRating must be one of -1/0/1` };
    }

    return { valid: true };
}

function validateSaveSessionRequest(body) {
    const { planId, startedAt, completedAt, feedback, exerciseRatings, exerciseDifficultyRatings } = body;
    if (!planId || !startedAt || !completedAt) {
        return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: Missing required fields' }) } };
    }

    if (feedback) {
        const validation = validatePainMonitoring(feedback);
        if (!validation.valid) {
            return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: `Feedback Error: ${validation.error}` }) } };
        }
    }

    const affinityValidation = validateExerciseRatingsContract(exerciseRatings);
    if (!affinityValidation.valid) {
        return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: affinityValidation.error }) } };
    }

    const difficultyValidation = validateExerciseDifficultyRatingsContract(exerciseDifficultyRatings);
    if (!difficultyValidation.valid) {
        return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: difficultyValidation.error }) } };
    }

    return { ok: true };
}

module.exports = {
    validateSaveSessionRequest,
    validateExerciseRatingsContract,
    validateExerciseDifficultyRatingsContract
};
