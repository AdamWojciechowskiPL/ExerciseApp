'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const contracts = requireApp('shared/clinical-core/contracts.js');
const clinical = requireApp('netlify/functions/_clinical-rule-engine.js');

test('clinical core exposes explicit decision reasons contract', () => {
  assert.deepEqual(Object.keys(contracts.DECISION_REASONS).sort(), [
    'BIOMECHANICS_MISMATCH',
    'BLACKLISTED',
    'DIRECTIONAL_BIAS',
    'MISSING_EQUIPMENT',
    'PHYSICAL_RESTRICTION',
    'SEVERITY_FILTER',
    'TOO_HARD_CALCULATED'
  ]);
});

test('buildUserContext returns shared output flags contract', () => {
  const ctx = clinical.buildUserContext({
    trigger_movements: ['bending_forward'],
    directional_negative_24h_count: 2,
    symptom_onset: 'sudden',
    symptom_duration: 'lt_6_weeks',
    symptom_trend: 'worsening'
  });

  assert.equal(typeof ctx.toleranceBias, 'object');
  assert.equal(ctx.toleranceBias.pattern, 'flexion_intolerant');
  assert.equal(ctx.toleranceBias.confirmed, true);
  assert.equal(ctx.acuteGuard.isAcuteWorsening, true);
});

test('checkExerciseAvailability returns shared output shape', () => {
  const ctx = clinical.buildUserContext({ trigger_movements: ['bending_forward'] });
  const res = clinical.checkExerciseAvailability({ id: 'e1', primary_plane: 'flexion' }, ctx);

  assert.equal(typeof res.allowed, 'boolean');
  assert.ok(Object.values(contracts.DECISION_REASONS).includes(res.reason) || res.reason === null);
});
