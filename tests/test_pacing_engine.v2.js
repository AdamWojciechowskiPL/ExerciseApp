// ExerciseApp/tests/test_pacing_engine.v2.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp, makeExercise } = require('./_test_helpers.v2');

const pacing = requireApp('_pacing-engine.js');

test('Pacing: unilateral + side switch => transition_sec=12', () => {
  // Test zachowany dla pewności (logika side switch=true pokrywa się z nową)
  const ex = makeExercise({ is_unilateral: true, requires_side_switch: true });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.transition_sec, 12);
});

test('Pacing: unilateral WITHOUT side switch => transition_sec=12 (Unified Rule)', () => {
  // ZMIANA: Wcześniej oczekiwaliśmy 5s. Teraz, zgodnie z decyzją o uproszczeniu,
  // każde ćwiczenie unilateralne (nawet hantle stojąc) dostaje bufor 12s na zmianę strony.
  const ex = makeExercise({ is_unilateral: true, requires_side_switch: false });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.transition_sec, 12, 'Unilateral should always default to 12s transition');
});

test('Pacing: bilateral => transition_sec=5', () => {
  const ex = makeExercise({ is_unilateral: false });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.transition_sec, 5, 'Bilateral should standard 5s transition');
});

test('Pacing: nerve_flossing rest=30', () => {
  const ex = makeExercise({ category_id: 'nerve_flossing' });
  const t = pacing.calculateTiming(ex);
  assert.equal(t.rest_sec, 30);
});