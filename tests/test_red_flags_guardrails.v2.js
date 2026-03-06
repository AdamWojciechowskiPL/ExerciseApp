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


test('Canonical red flags list contains expanded triage set', () => {
  const canonical = requireApp('_wizard-canonical.js');
  const values = new Set((canonical.CANONICAL.red_flags || []).map(String));

  const expected = [
    'trauma_major_recent',
    'minor_trauma_high_fragility',
    'cauda_equina_symptoms',
    'progressive_neuro_deficit',
    'oncologic_history_or_cancer_suspicion',
    'infection_risk_significant',
    'fracture_risk_osteoporosis_steroids',
    'night_rest_pain_unrelenting',
    'none'
  ];

  for (const val of expected) {
    assert.equal(values.has(val), true, `missing canonical red flag: ${val}`);
  }
});


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

test('API: red_flags contract accepts every canonical flag and still blocks generation for each non-none value', async () => {
  const allowedFlags = [
    'trauma_major_recent',
    'minor_trauma_high_fragility',
    'cauda_equina_symptoms',
    'progressive_neuro_deficit',
    'oncologic_history_or_cancer_suspicion',
    'infection_risk_significant',
    'fracture_risk_osteoporosis_steroids',
    'night_rest_pain_unrelenting'
  ];

  for (const redFlag of allowedFlags) {
    const result = await plan.handler(makeEvent({
      pain_locations: ['low_back'],
      red_flags: [redFlag]
    }));

    assert.equal(result.statusCode, 422, `flag ${redFlag} should block generation`);
    const parsedBody = JSON.parse(result.body);
    assert.equal(parsedBody.error, 'INELIGIBLE_FOR_PLAN');
  }
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
    /case 'p4b': return hasExplicitRedFlagsAnswer\(\);/,
    'wizard should require explicit p4b answer in every wizard path'
  );

  assert.match(
    wizardSource,
    /if \(hasRedFlags\) \{[\s\S]*plan nie został wygenerowany/,
    'wizard should block plan generation when red flags are present'
  );
});

test('Frontend wizard keeps diagnosis step in no-pain path and does not reset medical_diagnosis to none', () => {
  const wizardSource = fs.readFileSync(wizardPath, 'utf8');

  assert.match(
    wizardSource,
    /return \['p2', 'p3', 'p5', 'p6', 'p7'\];/,
    'wizard skip-list should keep p4 diagnosis and p4b red flags in no-pain flow'
  );

  assert.doesNotMatch(
    wizardSource,
    /case 'p4': wizardAnswers\.medical_diagnosis = \['none'\]; break;/,
    'wizard should not reset diagnosis to none while skipping steps'
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
