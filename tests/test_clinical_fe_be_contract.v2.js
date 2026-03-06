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

async function expectSame(wizard, exercise) {
  const fe = await loadFrontend();
  const feCtx = fe.buildClinicalContext(wizard);
  const beCtx = be.buildUserContext(wizard);
  const feResult = fe.checkExerciseAvailability(exercise, feCtx);
  const beResult = be.checkExerciseAvailability(exercise, beCtx);
  assert.deepEqual(feResult, beResult);
}

test('FE/BE contract parity: severe pain, no_kneeling, overhead, knee, sciatica, diagnosis', async () => {
  await expectSame({ pain_locations: ['knee'], physical_restrictions: ['no_kneeling'] }, ex({ position: 'kneeling' }));
  await expectSame({ pain_locations: ['low_back'], pain_intensity: 9, daily_impact: 8 }, ex({ spine_load_level: 'high', spineLoadLevel: 'high' }));
  await expectSame({ pain_locations: ['cervical'], pain_intensity: 8, daily_impact: 8 }, ex({ overheadRequired: true, shoulder_load_level: 'high' }));
  await expectSame({ pain_locations: ['sciatica'] }, ex({ pain_relief_zones: ['sciatica'], painReliefZones: ['sciatica'] }));
  await expectSame({ medical_diagnosis: ['disc_herniation'] }, ex({ impact_level: 'high', impactLevel: 'high' }));
  await expectSame({ trigger_movements: ['bending_forward'] }, ex({ primary_plane: 'flexion', primaryPlane: 'flexion' }));
});
