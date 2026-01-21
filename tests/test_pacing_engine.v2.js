'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp, makeExercise } = require('./_test_helpers.v2');

const pacing = requireApp('_pacing-engine.js');

test('Pacing: unilateral + side switch => transition_sec=12', () => {
  const ex = makeExercise({ is_unilateral: true, requires_side_switch: true });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.transition_sec, 12);
});

test('Pacing: unilateral without side switch => transition_sec=5', () => {
  const ex = makeExercise({ is_unilateral: true, requires_side_switch: false });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.transition_sec, 5);
});

test('Pacing: nerve_flossing rest=35 (regression guard)', () => {
  const ex = makeExercise({ category_id: 'nerve_flossing' });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.rest_sec, 35);
});
