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

const canonical = requireApp('_wizard-canonical.js');
const plan = requireApp('generate-plan.js');

const wizardSource = fs.readFileSync(path.resolve(__dirname, '..', 'ui', 'wizard.js'), 'utf8');
const wizardCanonicalSource = fs.readFileSync(path.resolve(__dirname, '..', 'ui', 'wizardCanonical.js'), 'utf8');
const clinicalCoreSource = fs.readFileSync(path.resolve(__dirname, '..', 'shared', 'clinical-core', 'index.js'), 'utf8');

function extractOptionValues(source, constName) {
  const anchorRegex = new RegExp(`(?:export\\s+)?const\\s+${constName}\\s*=\\s*\\[`);
  const anchor = source.search(anchorRegex);
  if (anchor === -1) return [];

  const arrayStart = source.indexOf('[', anchor);
  const afterStart = source.slice(arrayStart);
  const filterEnd = afterStart.indexOf('].filter');
  const plainEnd = afterStart.indexOf('];');
  const endCandidates = [filterEnd, plainEnd].filter((v) => v >= 0);
  if (endCandidates.length === 0) return [];
  const endOffset = Math.min(...endCandidates) + 1;

  const section = afterStart.slice(0, endOffset);
  return [...section.matchAll(/val:\s*'([^']+)'/g)].map((m) => m[1]);
}


test('clinical core fields are provided by wizard or explicitly optional', () => {
  const usedFields = new Set([...clinicalCoreSource.matchAll(/data\.([a-z0-9_]+)/g)].map((m) => m[1]));

  const wizardProvidedFields = new Set([
    'pain_locations',
    'focus_locations',
    'pain_intensity',
    'pain_character',
    'medical_diagnosis',
    'red_flags',
    'symptom_onset',
    'symptom_duration',
    'symptom_trend',
    'exercise_medical_clearance',
    'trigger_movements',
    'relief_movements',
    'daily_impact',
    'work_type',
    'hobby',
    'equipment_available',
    'exercise_experience',
    'schedule_pattern',
    'target_session_duration_min',
    'session_component_weights',
    'primary_goal',
    'secondary_goals',
    'physical_restrictions'
  ]);

  const optionalContextFields = new Set(['directional_negative_24h_count']);

  for (const field of usedFields) {
    const isProvided = wizardProvidedFields.has(field);
    const isOptional = optionalContextFields.has(field);
    assert.equal(
      isProvided || isOptional,
      true,
      `clinical core uses field '${field}' that wizard does not provide and is not marked optional`
    );
  }

  assert.equal(wizardProvidedFields.has('medical_diagnosis'), true);
  assert.equal(wizardProvidedFields.has('physical_restrictions'), true);
  assert.equal(wizardProvidedFields.has('exercise_medical_clearance'), true);
});

test('FE/BE canonical dictionaries stay aligned for diagnosis, red flags, restrictions and screening', () => {
  const feDiagnosis = new Set(extractOptionValues(wizardCanonicalSource, 'MEDICAL_DIAGNOSIS_OPTIONS'));
  const feRestrictions = new Set(extractOptionValues(wizardCanonicalSource, 'RESTRICTION_OPTIONS'));
  const feRedFlags = new Set(extractOptionValues(wizardSource, 'RED_FLAG_OPTIONS'));
  const feMedicalScreening = new Set(extractOptionValues(wizardSource, 'MEDICAL_SCREENING_OPTIONS'));

  const beDiagnosis = new Set(canonical.CANONICAL.medical_diagnosis || []);
  const beRestrictions = new Set(canonical.CANONICAL.physical_restrictions || []);
  const beRedFlags = new Set(canonical.CANONICAL.red_flags || []);
  const beMedicalScreening = new Set(canonical.CANONICAL.exercise_medical_clearance_fields || []);

  assert.deepEqual([...feDiagnosis].sort(), [...beDiagnosis].sort(), 'medical_diagnosis FE/BE mismatch');
  assert.deepEqual([...feRestrictions].sort(), [...beRestrictions].sort(), 'physical_restrictions FE/BE mismatch');
  assert.deepEqual([...feRedFlags].sort(), [...beRedFlags].sort(), 'red_flags FE/BE mismatch');

  assert.equal(feMedicalScreening.has('none'), true, 'wizard should expose explicit "none" answer for screening');
  feMedicalScreening.delete('none');
  assert.deepEqual([...feMedicalScreening].sort(), [...beMedicalScreening].sort(), 'exercise_medical_clearance_fields FE/BE mismatch');
});

test('normalized wizard payload keeps safety-critical fields across clinical core and generator guards', async () => {
  const normalized = canonical.normalizeWizardPayload({
    pain_locations: ['knee'],
    medical_diagnosis: ['chondromalacia', 'unknown'],
    physical_restrictions: ['no_kneeling', 'invalid'],
    red_flags: ['progressive_neuro_deficit'],
    exercise_medical_clearance: { cvd: true },
    symptom_onset: 'sudden',
    symptom_duration: 'lt_6_weeks',
    symptom_trend: 'worsening',
    trigger_movements: ['bending_forward'],
    relief_movements: ['bending_backward']
  });

  assert.deepEqual(normalized.medical_diagnosis, ['chondromalacia']);
  assert.deepEqual(normalized.physical_restrictions, ['no_kneeling']);
  assert.deepEqual(normalized.red_flags, ['progressive_neuro_deficit']);
  assert.equal(normalized.exercise_medical_clearance.cvd, true);
  assert.equal(typeof normalized.exercise_medical_clearance.metabolic, 'boolean');

  const ctx = plan.safeBuildUserContext(normalized);
  assert.equal(ctx.medicalDiagnosis.includes('chondromalacia'), true);
  assert.equal(ctx.physicalRestrictions.includes('no_kneeling'), true);

  const exercises = [
    {
      id: 'high-knee-load',
      difficulty_level: 1,
      primary_plane: 'sagittal',
      spine_load_level: 'low',
      knee_load_level: 'high',
      impact_level: 'low',
      pain_relief_zones: ['knee'],
      position: 'standing',
      equipment: ['none'],
      is_foot_loading: false
    },
    {
      id: 'kneeling',
      difficulty_level: 1,
      primary_plane: 'sagittal',
      spine_load_level: 'low',
      knee_load_level: 'low',
      impact_level: 'low',
      pain_relief_zones: ['knee'],
      position: 'kneeling',
      equipment: ['none'],
      is_foot_loading: false
    }
  ];

  const fatigueProfile = {
    fatigueScoreNow: 0,
    fatigueThresholdFilter: 99,
    isMonotonyRelevant: false,
    monotony7d: 0,
    strain7d: 0,
    p85_strain_56d: 1,
    weekLoad7d: 0
  };

  const filterResult = plan.filterExerciseCandidates(exercises, normalized, ctx, fatigueProfile, {}, { debug: true });
  assert.equal(filterResult.candidates.length, 0);
  assert.equal(filterResult.diagnostics.some((d) => d.id === 'high-knee-load' && d.reason === 'physical_restriction'), true);
  assert.equal(filterResult.diagnostics.some((d) => d.id === 'kneeling' && d.reason === 'physical_restriction'), true);

  const handlerResult = await plan.handler({
    httpMethod: 'POST',
    headers: { 'x-dev-user-id': 'user-contract-consistency' },
    body: JSON.stringify(normalized)
  });

  assert.equal(handlerResult.statusCode, 422);
  const parsedBody = JSON.parse(handlerResult.body);
  assert.equal(parsedBody.error, 'INELIGIBLE_FOR_PLAN');
});
