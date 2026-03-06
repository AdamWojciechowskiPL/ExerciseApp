'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2.js');

const {
  validatePainMonitoring,
  PAIN_MONITORING_VERSION
} = requireApp('_data-contract.js');

const makeBaseFeedback = () => ({
  type: 'pain_monitoring',
  schema_version: PAIN_MONITORING_VERSION,
  during: { max_nprs: 4, locations: [] },
  note: 'ok'
});

test('accepts valid pain_monitoring save payload with during.max_nprs', () => {
  const payload = makeBaseFeedback();
  const result = validatePainMonitoring(payload);
  assert.equal(result.valid, true);
  assert.equal(result.isSchema, true);
});

test('accepts valid after24h patch payload with required fields', () => {
  const payload = makeBaseFeedback();
  payload.after24h = {
    max_nprs: 3,
    delta_vs_baseline: -1,
    stiffness_increased: false,
    swelling: false,
    night_pain: false,
    neuro_red_flags: false,
  };

  const result = validatePainMonitoring(payload, { requireAfter24h: true });
  assert.equal(result.valid, true);
});

test('rejects invalid schema shape (missing during)', () => {
  const payload = {
    type: 'pain_monitoring',
    schema_version: PAIN_MONITORING_VERSION,
    note: 'bad payload'
  };

  const result = validatePainMonitoring(payload);
  assert.equal(result.valid, false);
  assert.match(result.error, /Missing "during" section/);
});

test('rejects invalid boolean flag types in after24h', () => {
  const payload = makeBaseFeedback();
  payload.after24h = {
    max_nprs: 5,
    delta_vs_baseline: 1,
    stiffness_increased: 'true',
    swelling: false,
    night_pain: false,
    neuro_red_flags: false,
  };

  const result = validatePainMonitoring(payload, { requireAfter24h: true });
  assert.equal(result.valid, false);
  assert.match(result.error, /stiffness_increased/);
});



test('rejects after24h patch payload with missing required boolean field', () => {
  const payload = makeBaseFeedback();
  payload.after24h = {
    max_nprs: 3,
    delta_vs_baseline: 0,
    stiffness_increased: false,
    swelling: false,
    night_pain: false,
  };

  const result = validatePainMonitoring(payload, { requireAfter24h: true });
  assert.equal(result.valid, false);
  assert.match(result.error, /Missing required boolean field: neuro_red_flags/);
});
test('rejects legacy feedback by default', () => {
  const legacy = { type: 'symptom', value: 1 };
  const result = validatePainMonitoring(legacy);
  assert.equal(result.valid, false);
  assert.match(result.error, /Legacy feedback format/);
});
