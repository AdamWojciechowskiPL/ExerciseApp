'use strict';

const engine = require('./engine.js');

module.exports = {
    normalizeExerciseRow: engine.normalizeExerciseRow,
    safeBuildUserContext: engine.safeBuildUserContext,
    validateExerciseRecord: engine.validateExerciseRecord,
    filterExerciseCandidates: engine.filterExerciseCandidates
};
