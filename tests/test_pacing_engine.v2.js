// ExerciseApp/tests/test_pacing_engine.v2.js
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

test('Pacing: unilateral without side switch => transition_sec=12 (Force Unified Transition)', () => {
  // ZMIANA: Oczekujemy 12s, ponieważ nowa logika wymusza ten czas dla wszystkich ćwiczeń jednostronnych
  const ex = makeExercise({ is_unilateral: true, requires_side_switch: false });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.transition_sec, 12);
});

test('Pacing: nerve_flossing rest=30 (Medical Update)', () => {
  // ZMIANA: Oczekujemy 30s zgodnie z nowym silnikiem medycznym (poprzednio 35s)
  const ex = makeExercise({ category_id: 'nerve_flossing' });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.rest_sec, 30);
});