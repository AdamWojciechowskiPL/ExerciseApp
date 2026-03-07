'use strict';

const engine = require('./engine.js');

module.exports = {
    buildDynamicCategoryWeights: engine.buildDynamicCategoryWeights,
    scoreExercise: engine.scoreExercise,
    selectMicrocycleAnchors: engine.selectMicrocycleAnchors,
    deriveFamilyKey: engine.deriveFamilyKey,
    analyzePainResponse: engine.analyzePainResponse,
    analyzeRpeTrend: engine.analyzeRpeTrend,
    calculateScoreComponents: engine.calculateScoreComponents
};
