'use strict';

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const requestValidation = requireApp('generate-plan/request-validation.js');

const canonical = {
  red_flags: ['none', 'cauda_equina'],
  exercise_medical_clearance_fields: ['none', 'cvd'],
  current_activity_status: ['inactive', 'active']
};

const deps = {
  normalizeWizardPayload: (payload) => payload,
  normalizeLowerSet: (arr) => new Set((arr || []).map((x) => String(x).toLowerCase())),
  CANONICAL: canonical
};

function makeEvent(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) };
}

test('validateGeneratePlanRequest: rejects non-array red_flags', () => {
  const result = requestValidation.validateGeneratePlanRequest(makeEvent({ red_flags: 'bad' }), 'u1', deps);
  assert.equal(result.ok, false);
  assert.equal(result.response.statusCode, 400);
});

test('validateGeneratePlanRequest: passes cautious flow', () => {
  const body = {
    red_flags: ['none'],
    exercise_medical_clearance: { none: false, cvd: true },
    current_activity_status: 'active',
    primary_goal: 'mobility',
    session_component_weights: [],
    focus_locations: []
  };
  const result = requestValidation.validateGeneratePlanRequest(makeEvent(body), 'u1', deps);
  assert.equal(result.ok, true);
  assert.equal(result.userData.primary_goal, 'mobility');
});
