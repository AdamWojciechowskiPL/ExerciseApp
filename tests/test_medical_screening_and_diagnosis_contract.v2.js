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
const canonical = requireApp('_wizard-canonical.js');

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: {
      'x-dev-user-id': 'user-test-medical-screening'
    },
    body: JSON.stringify(body)
  };
}

test('canonical diagnosis list covers clinical rule-engine diagnoses', () => {
  const canonicalDiagnosis = new Set(canonical.CANONICAL.medical_diagnosis || []);

  const clinicalSource = fs.readFileSync(path.resolve(__dirname, '..', 'netlify', 'functions', '_clinical-rule-engine.js'), 'utf8');
  const matches = [...clinicalSource.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const diagnosisFromRules = new Set(matches.filter((v) => v.includes('_rehab') || ['chondromalacia', 'meniscus_tear', 'knee_oa', 'disc_herniation', 'spondylolisthesis'].includes(v)));

  for (const diagnosis of diagnosisFromRules) {
    assert.equal(canonicalDiagnosis.has(diagnosis), true, `missing diagnosis in canonical values: ${diagnosis}`);
  }
});

test('canonical aliases normalize backend diagnosis variants', () => {
  const payload = canonical.normalizeWizardPayload({
    medical_diagnosis: ['osteoarthritis', 'knee_osteoarthritis', 'spondylolisthesis_lumbar']
  });

  assert.deepEqual(payload.medical_diagnosis, ['knee_oa', 'spondylolisthesis']);
});



test('knee_oa and osteoarthritis alias trigger identical OA weighting logic', () => {
  const pool = [
    { category_id: 'vmo_activation' },
    { category_id: 'glute_activation' },
    { category_id: 'hip_extension' },
    { category_id: 'conditioning_cardio' }
  ];

  const baselineCtx = plan.safeBuildUserContext({ medical_diagnosis: [] });
  const kneeOaPayload = canonical.normalizeWizardPayload({ medical_diagnosis: ['knee_oa'] });
  const aliasPayload = canonical.normalizeWizardPayload({ medical_diagnosis: ['osteoarthritis'] });

  const weightsBaseline = plan.buildDynamicCategoryWeights(pool, { medical_diagnosis: [] }, baselineCtx);
  const weightsKneeOa = plan.buildDynamicCategoryWeights(pool, kneeOaPayload, plan.safeBuildUserContext(kneeOaPayload));
  const weightsAlias = plan.buildDynamicCategoryWeights(pool, aliasPayload, plan.safeBuildUserContext(aliasPayload));

  assert.equal(weightsKneeOa.vmo_activation > weightsBaseline.vmo_activation, true);
  assert.equal(weightsKneeOa.glute_activation > weightsBaseline.glute_activation, true);
  assert.equal(weightsKneeOa.hip_extension > weightsBaseline.hip_extension, true);
  assert.equal(weightsKneeOa.conditioning_cardio < weightsBaseline.conditioning_cardio, true);

  assert.deepEqual(weightsKneeOa, weightsAlias);
});


test('medical screening normalization includes explicit booleans for each field', () => {
  const payload = canonical.normalizeWizardPayload({
    exercise_medical_clearance: {
      cvd: true,
      renal: true
    }
  });

  for (const field of canonical.CANONICAL.exercise_medical_clearance_fields) {
    assert.equal(typeof payload.exercise_medical_clearance[field], 'boolean', `field ${field} should be boolean`);
  }

  assert.equal(payload.exercise_medical_clearance.cvd, true);
  assert.equal(payload.exercise_medical_clearance.renal, true);
  assert.equal(payload.exercise_medical_clearance.metabolic, false);
  assert.equal(payload.exercise_medical_clearance.none, false);
});



test('medical screening normalization persists explicit none and infers none for all-negative payload', () => {
  const explicitNone = canonical.normalizeWizardPayload({
    exercise_medical_clearance: {
      none: true,
      cvd: true
    }
  });

  assert.equal(explicitNone.exercise_medical_clearance.none, true);
  for (const field of canonical.CANONICAL.exercise_medical_clearance_fields) {
    assert.equal(explicitNone.exercise_medical_clearance[field], false);
  }

  const allNegative = canonical.normalizeWizardPayload({
    exercise_medical_clearance: {
      cvd: false,
      metabolic: false,
      renal: false,
      chest_pain_exertional: false,
      syncope_exertional: false,
      dyspnea_disproportionate: false,
      recent_cardiac_event: false,
      uncontrolled_hypertension: false
    }
  });

  assert.equal(allNegative.exercise_medical_clearance.none, true);
});


test('API blocks high-intensity intent with positive medical screening', async () => {
  const result = await plan.handler(makeEvent({
    primary_goal: 'fat_loss',
    session_component_weights: ['conditioning'],
    exercise_medical_clearance: {
      cvd: true,
      metabolic: false,
      renal: false,
      chest_pain_exertional: false,
      syncope_exertional: false,
      dyspnea_disproportionate: false,
      recent_cardiac_event: false,
      uncontrolled_hypertension: false
    }
  }));

  assert.equal(result.statusCode, 422);
  const parsedBody = JSON.parse(result.body);
  assert.equal(parsedBody.error, 'INELIGIBLE_FOR_HIGH_INTENSITY_PLAN');
});

test('API validates missing medical screening answers before generation', async () => {
  const result = await plan.handler(makeEvent({
    primary_goal: 'mobility'
  }));

  assert.equal(result.statusCode, 422);
  const parsedBody = JSON.parse(result.body);
  assert.equal(parsedBody.error, 'MISSING_MEDICAL_SCREENING_ANSWER');
});

test('helpers detect high-intensity intent and positive screening flags', () => {
  assert.equal(plan.isHighIntensityIntent({ primary_goal: 'fat_loss' }), true);
  assert.equal(plan.isHighIntensityIntent({ session_component_weights: ['conditioning'] }), true);
  assert.equal(plan.isHighIntensityIntent({ focus_locations: ['metabolic'] }), true);
  assert.equal(plan.isHighIntensityIntent({ primary_goal: 'mobility' }), false);

  assert.equal(plan.hasPositiveMedicalScreening({ cvd: true }), true);
  assert.equal(plan.hasPositiveMedicalScreening({ cvd: false, metabolic: false }), false);
});

test('frontend diagnosis step renders full list independent from pain locations map', () => {
  const wizardSource = fs.readFileSync(path.resolve(__dirname, '..', 'ui', 'wizard.js'), 'utf8');

  assert.doesNotMatch(wizardSource, /diagnosisTriggerMap/, 'pain-location diagnosis filtering should be removed');
  assert.match(
    wizardSource,
    /renderMultiSelect\(c, title, MEDICAL_DIAGNOSIS_OPTIONS, 'medical_diagnosis', hint\);/,
    'wizard should always render full diagnosis option list'
  );
});


test('wizard normalizes medical screening state to keep explicit negative answer on reopen', () => {
  const wizardSource = fs.readFileSync(path.resolve(__dirname, '..', 'ui', 'wizard.js'), 'utf8');
  assert.match(wizardSource, /function normalizeMedicalScreeningState\(source = \{\}\)/);
  assert.match(wizardSource, /exercise_medical_clearance: normalizeMedicalScreeningState\(saved\.exercise_medical_clearance\)/);
});
