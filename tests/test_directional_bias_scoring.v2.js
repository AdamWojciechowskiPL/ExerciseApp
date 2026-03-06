// ExerciseApp/tests/test_directional_bias_scoring.v2.js
'use strict';

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp, makeExercise } = require('./_test_helpers.v2');

const plan = requireApp('generate-plan.js');
const clinical = requireApp('_clinical-rule-engine.js');

function makeScoreState() {
  return {
    usedIds: new Set(),
    weeklyUsage: new Map(),
    sessionCategoryUsage: new Map(),
    weeklyFamilyUsage: new Map(),
    sessionFamilyUsage: new Map(),
    anchorFamilies: new Set(),
    anchorTargetExposure: 2
  };
}

test('Directional bias: single signal keeps exercise allowed but lowers score', () => {
  const userData = {
    trigger_movements: ['bending_forward'],
    directional_negative_24h_count: 0
  };

  const ctx = plan.safeBuildUserContext(userData);
  const weights = { core_stability: 1 };

  const biasedExercise = makeExercise({
    id: 'biased',
    category_id: 'core_stability',
    primary_plane: 'flexion'
  });

  const neutralExercise = makeExercise({
    id: 'neutral',
    category_id: 'core_stability',
    primary_plane: 'sagittal'
  });

  const filtered = plan.filterExerciseCandidates([biasedExercise, neutralExercise], userData, ctx, {
    fatigueScoreNow: 0,
    fatigueThresholdFilter: 999,
    weekLoad7d: 0,
    isMonotonyRelevant: false,
    monotony7d: 1,
    strain7d: 0,
    p85_strain_56d: 999
  }, { volumeModifier: 1 }, {});

  assert.equal(filtered.length, 2, 'Both exercises should pass filtering for single directional signal');

  const filteredBiased = filtered.find((ex) => ex.id === 'biased');
  const filteredNeutral = filtered.find((ex) => ex.id === 'neutral');

  assert.equal(filteredBiased.directionalBias, true, 'Biased exercise should carry directionalBias metadata');
  assert.equal(filteredNeutral.directionalBias, false, 'Neutral exercise should not carry directionalBias metadata');

  const scoreBiased = plan.scoreExercise(filteredBiased, 'main', userData, ctx, weights, makeScoreState(), new Set(), null, null);
  const scoreNeutral = plan.scoreExercise(filteredNeutral, 'main', userData, ctx, weights, makeScoreState(), new Set(), null, null);

  assert.ok(scoreBiased < scoreNeutral, `Biased score (${scoreBiased}) should be lower than neutral (${scoreNeutral})`);
});

test('Directional bias: no directional signal means no penalty', () => {
  const userData = {
    trigger_movements: [],
    directional_negative_24h_count: 0
  };

  const ctx = plan.safeBuildUserContext(userData);
  const weights = { core_stability: 1 };

  const exerciseA = makeExercise({ id: 'a', category_id: 'core_stability', primary_plane: 'sagittal' });
  const exerciseB = makeExercise({ id: 'b', category_id: 'core_stability', primary_plane: 'sagittal' });

  const scoreA = plan.scoreExercise(exerciseA, 'main', userData, ctx, weights, makeScoreState(), new Set(), null, null);
  const scoreB = plan.scoreExercise(exerciseB, 'main', userData, ctx, weights, makeScoreState(), new Set(), null, null);

  assert.equal(scoreA, scoreB, 'Comparable exercises should not diverge without directional signal');
});

test('Directional bias: confirmed intolerance escalates to hard block', () => {
  const userData = {
    trigger_movements: ['bending_forward'],
    directional_negative_24h_count: 2
  };

  const ctx = plan.safeBuildUserContext(userData);
  const exercise = makeExercise({
    id: 'blocked',
    category_id: 'core_stability',
    primary_plane: 'flexion'
  });

  const availability = clinical.checkExerciseAvailability(exercise, ctx, userData);
  assert.equal(availability.allowed, false);
  assert.equal(availability.reason, 'biomechanics_mismatch');

  const filtered = plan.filterExerciseCandidates([exercise], userData, ctx, {
    fatigueScoreNow: 0,
    fatigueThresholdFilter: 999,
    weekLoad7d: 0,
    isMonotonyRelevant: false,
    monotony7d: 1,
    strain7d: 0,
    p85_strain_56d: 999
  }, { volumeModifier: 1 }, {});

  assert.equal(filtered.length, 0, 'Confirmed intolerance should hard-block candidate in generator filter');
});

test('Directional bias: small candidate pool keeps biased fallback available', () => {
  const userData = {
    trigger_movements: ['bending_forward'],
    directional_negative_24h_count: 0
  };

  const ctx = plan.safeBuildUserContext(userData);
  const biasedExercise = makeExercise({
    id: 'fallback',
    category_id: 'core_stability',
    primary_plane: 'flexion'
  });

  const filtered = plan.filterExerciseCandidates([biasedExercise], userData, ctx, {
    fatigueScoreNow: 0,
    fatigueThresholdFilter: 999,
    weekLoad7d: 0,
    isMonotonyRelevant: false,
    monotony7d: 1,
    strain7d: 0,
    p85_strain_56d: 999
  }, { volumeModifier: 1 }, {});

  assert.equal(filtered.length, 1, 'Single biased candidate should remain available as fallback');
  assert.equal(filtered[0].directionalBias, true, 'Fallback candidate should preserve directional bias metadata');
});
