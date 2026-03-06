'use strict';

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const plan = requireApp('generate-plan.js');

const wizardPath = path.resolve(__dirname, '..', 'ui', 'wizard.js');

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: {
      'x-dev-user-id': 'user-test-red-flags'
    },
    body: JSON.stringify(body)
  };
}

test('API: red_flags with symptom returns 422 INELIGIBLE_FOR_PLAN', async () => {
  const result = await plan.handler(makeEvent({
    pain_locations: ['low_back'],
    red_flags: ['progressive_neuro_deficit']
  }));

  assert.equal(result.statusCode, 422);
  const parsedBody = JSON.parse(result.body);
  assert.equal(parsedBody.error, 'INELIGIBLE_FOR_PLAN');
  assert.equal(parsedBody.status, 'ineligible_for_plan');
});

test('API: red_flags payload rejects unknown flag', async () => {
  const result = await plan.handler(makeEvent({ red_flags: ['unknown_flag'] }));
  assert.equal(result.statusCode, 400);
  const parsedBody = JSON.parse(result.body);
  assert.equal(parsedBody.error, 'INVALID_RED_FLAG_VALUE');
});

test('Frontend wizard guardrails: p4b validation and generation block are present', () => {
  const wizardSource = fs.readFileSync(wizardPath, 'utf8');

  assert.match(
    wizardSource,
    /case 'p4b': return wizardAnswers\.pain_locations\.length === 0 \|\| hasExplicitRedFlagsAnswer\(\);/,
    'wizard should require explicit p4b answer when pain flow is active'
  );

  assert.match(
    wizardSource,
    /if \(hasRedFlags\) \{[\s\S]*plan nie został wygenerowany/,
    'wizard should block plan generation when red flags are present'
  );
});


test('Frontend wizard p4b explicit-answer logic supports none and specific flags', () => {
  const wizardSource = fs.readFileSync(wizardPath, 'utf8');

  assert.match(
    wizardSource,
    /function hasExplicitRedFlagsAnswer\(\) \{[\s\S]*selectedFlags\.includes\('none'\) \|\| selectedFlags\.some\(\(flag\) => flag !== 'none'\);[\s\S]*\}/,
    'wizard should treat "none" or any concrete red flag as an explicit p4b answer'
  );
});
