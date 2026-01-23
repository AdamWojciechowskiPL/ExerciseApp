'use strict';

// --- MOCK ENVIRONMENT VARIABLES ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

test('Exports: generate-plan exposes expected API', () => {
  const plan = requireApp('generate-plan.js');
  const expected = [
    'validateExerciseRecord',
    'normalizeExerciseRow',
    'buildDynamicCategoryWeights',
    'scoreExercise',
    'prescribeForExercise',
    'deriveFamilyKey',
    'selectMicrocycleAnchors',
    'safeBuildUserContext',
  ];
  for (const k of expected) {
    assert.equal(typeof plan[k], 'function', `Missing export: ${k}`);
  }
});

test('Exports: clinical-rule-engine exposes expected API', () => {
  const clinical = requireApp('_clinical-rule-engine.js');
  const expected = [
    'buildUserContext',
    'checkExerciseAvailability',
    'checkEquipment',
    'detectTolerancePattern',
    'KNOWN_POSITIONS',
    'isRotationalPlane',
  ];
  for (const k of expected) {
    assert.ok(k in clinical, `Missing export: ${k}`);
  }
});

test('Exports: pacing-engine exposes calculateTiming', () => {
  const pacing = requireApp('_pacing-engine.js');
  assert.equal(typeof pacing.calculateTiming, 'function');
});

test('Exports: phase-manager exposes expected API', () => {
  const phase = requireApp('_phase-manager.js');
  const expected = [
    'initializePhaseState',
    'resolveActivePhase',
    'updatePhaseStateAfterSession',
    'checkDetraining',
    'applyGoalChangePolicy',
  ];
  for (const k of expected) {
    assert.equal(typeof phase[k], 'function', `Missing export: ${k}`);
  }
});

test('Exports: fatigue-calculator exposes expected API', () => {
  const f = requireApp('_fatigue-calculator.js');
  assert.equal(typeof f.calculateAcuteFatigue, 'function');
  assert.equal(typeof f.calculateFatigueProfile, 'function');
});
