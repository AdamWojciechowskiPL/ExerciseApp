'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { requireApp } = require('./_test_helpers.v2');

const be = requireApp('netlify/functions/_clinical-rule-engine.js');
const clinicalEngineUrl = pathToFileURL(path.resolve(__dirname, '..', 'clinicalEngine.js')).href;

async function loadFrontend() {
  return import(clinicalEngineUrl);
}

function ex(base = {}) {
  return {
    id: 'ex1',
    difficulty_level: 2,
    difficultyLevel: 2,
    primary_plane: 'sagittal',
    primaryPlane: 'sagittal',
    spine_load_level: 'low',
    spineLoadLevel: 'low',
    knee_load_level: 'low',
    kneeLoadLevel: 'low',
    impact_level: 'low',
    impactLevel: 'low',
    pain_relief_zones: ['low_back'],
    painReliefZones: ['low_back'],
    ...base
  };
}

async function expectSame(caseName, wizard, exercise, options = {}) {
  const fe = await loadFrontend();
  const feCtx = fe.buildClinicalContext(wizard);
  const beCtx = be.buildUserContext(wizard);
  assert.deepEqual(feCtx.acuteGuard, beCtx.acuteGuard, `${caseName}: acuteGuard mismatch`);
  assert.deepEqual(feCtx.toleranceBias, beCtx.toleranceBias, `${caseName}: toleranceBias mismatch`);
  const feResult = fe.checkExerciseAvailability(exercise, feCtx, options);
  const beResult = be.checkExerciseAvailability(exercise, beCtx, options);
  assert.deepEqual(feResult, beResult, `${caseName}: checkExerciseAvailability mismatch`);

  const fePass = fe.passesTolerancePattern(exercise, feCtx.tolerancePattern);
  const bePass = be.passesTolerancePattern(exercise, beCtx.tolerancePattern);
  assert.equal(fePass, bePass, `${caseName}: passesTolerancePattern mismatch`);
}

test('FE/BE contract parity matrix for clinical rules', async () => {
  const cases = [
    {
      name: 'acute_worsening_context_parity',
      wizard: {
        pain_locations: ['low_back'],
        pain_intensity: 4,
        daily_impact: 4,
        symptom_onset: 'sudden',
        symptom_duration: 'lt_6_weeks',
        symptom_trend: 'worsening'
      },
      exercise: ex({ pain_relief_zones: ['low_back'], painReliefZones: ['low_back'] }),
      expected: { allowed: true, reason: null }
    },
    {
      name: 'knee_pain_high_load',
      wizard: { pain_locations: ['knee'] },
      exercise: ex({ knee_load_level: 'high', kneeLoadLevel: 'high' }),
      expected: { allowed: false, reason: 'physical_restriction' }
    },
    {
      name: 'disc_herniation_not_hard_blocked_by_diagnosis_only',
      wizard: { medical_diagnosis: ['disc_herniation'] },
      exercise: ex({ impact_level: 'high', impactLevel: 'high' }),
      expected: { allowed: true, reason: null }
    },
    {
      name: 'severe_pain_filters_high_spine_load',
      wizard: { pain_locations: ['low_back'], pain_intensity: 9, daily_impact: 9 },
      exercise: ex({ spine_load_level: 'high', spineLoadLevel: 'high' }),
      expected: { allowed: false, reason: 'severity_filter' }
    },
    {
      name: 'no_kneeling',
      wizard: { physical_restrictions: ['no_kneeling'] },
      exercise: ex({ position: 'kneeling' }),
      expected: { allowed: false, reason: 'physical_restriction' }
    },
    {
      name: 'no_twisting',
      wizard: { physical_restrictions: ['no_twisting'] },
      exercise: ex({ primary_plane: 'rotation', primaryPlane: 'rotation' }),
      expected: { allowed: false, reason: 'physical_restriction' }
    },
    {
      name: 'overhead_restriction_severe_neck',
      wizard: { pain_locations: ['cervical'], pain_intensity: 8, daily_impact: 8 },
      exercise: ex({ overheadRequired: true, shoulder_load_level: 'high' }),
      expected: { allowed: false, reason: 'physical_restriction' }
    },
    {
      name: 'sciatica_zone_match_allowed',
      wizard: { pain_locations: ['sciatica'] },
      exercise: ex({ pain_relief_zones: ['sciatica'], painReliefZones: ['sciatica'] }),
      expected: { allowed: true, reason: null }
    },
    {
      name: 'tolerance_pattern_soft_bias',
      wizard: { trigger_movements: ['bending_forward'] },
      exercise: ex({ primary_plane: 'flexion', primaryPlane: 'flexion' }),
      expected: { allowed: true, reason: 'directional_bias' }
    },
    {
      name: 'followup_escalation_hard_restriction',
      wizard: { trigger_movements: ['bending_forward'], directional_negative_24h_count: 2, symptom_trend: 'worsening' },
      exercise: ex({ primary_plane: 'flexion', primaryPlane: 'flexion' }),
      expected: { allowed: false, reason: 'biomechanics_mismatch' }
    }
  ];

  for (const row of cases) {
    await expectSame(row.name, row.wizard, row.exercise);

    const fe = await loadFrontend();
    const feRes = fe.checkExerciseAvailability(row.exercise, fe.buildClinicalContext(row.wizard));
    assert.deepEqual(feRes, row.expected, `${row.name}: expected output mismatch`);
  }
});
