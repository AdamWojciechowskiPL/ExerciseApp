// ExerciseApp/tests/test_generate_plan_normalize_row.v2.js
'use strict';

// --- MOCK ENVIRONMENT VARIABLES ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp, makeExercise } = require('./_test_helpers.v2');

const plan = requireApp('generate-plan.js');

// ZMIANA: Usunięto test "bilateral cannot require side switch", ponieważ
// normalizator już nie przetwarza ani nie zwraca tej właściwości.

test('normalizeExerciseRow: adds calculated_timing', () => {
  // requires_side_switch w makeExercise jest ignorowane przez nową logikę,
  // ale is_unilateral nadal wpływa na calculated_timing
  const ex = makeExercise({ category_id: 'nerve_flossing', is_unilateral: true });
  const n = plan.normalizeExerciseRow(ex);
  
  assert.ok(n.calculated_timing);
  assert.equal(typeof n.calculated_timing.rest_sec, 'number');
  assert.equal(typeof n.calculated_timing.transition_sec, 'number');
});

test('normalizeExerciseRow: handles basic normalization', () => {
    const ex = makeExercise({ 
        difficulty_level: '3', 
        is_unilateral: 1 // Test rzutowania na boolean
    });
    const n = plan.normalizeExerciseRow(ex);
    
    assert.equal(n.difficulty_level, 3);
    assert.equal(n.is_unilateral, true);
});

/**
 * US-11 contract: null-safe defaults in code.
 */
test('US-11: normalizeExerciseRow handles NULL new attributes without crash and with safe defaults', () => {
  const ex = makeExercise({
    category_id: 'breathing',
    position: 'supine',
    knee_flexion_max_deg: null,
    spine_motion_profile: null,
    overhead_required: null,
  });

  const n = plan.normalizeExerciseRow(ex);

  assert.ok('kneeFlexionMaxDeg' in n, 'kneeFlexionMaxDeg missing');
  assert.ok('spineMotionProfile' in n, 'spineMotionProfile missing');
  assert.ok('overheadRequired' in n, 'overheadRequired missing');

  if (n.spineMotionProfile !== undefined) assert.equal(n.spineMotionProfile, 'neutral');
  if (n.overheadRequired !== undefined) assert.equal(n.overheadRequired, false);
});