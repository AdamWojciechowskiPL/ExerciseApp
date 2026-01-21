// ExerciseApp/tests/test_clinical_rule_engine.v2.js
'use strict';

// --- MOCK ENVIRONMENT VARIABLES ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const clinical = requireApp('netlify/functions/_clinical-rule-engine.js');

test('Equipment: case-insensitive matching', () => {
  // FIX: checkEquipment expects a Set as the second argument
  const userEq = new Set(['hantle', 'gumy']);
  
  // Case match check
  const ex1 = { equipment: ['Hantle'] };
  assert.equal(clinical.checkEquipment(ex1, userEq), true, 'Should match Hantle with hantle');

  // Negative check
  const exMat = { equipment: ['mata'] };
  assert.equal(clinical.checkEquipment(exMat, userEq), false, 'Should fail if user lacks mat');
});

test('Foot injury blocks moderate/high impact', () => {
  // FIX: Use buildUserContext to ensure ctx is complete (painZoneSet, etc.)
  const ctx = clinical.buildUserContext({ physical_restrictions: ['foot_injury'] });
  
  const ex = { id: 'test1', is_foot_loading: true, impact_level: 'high', position: 'standing' };
  
  const res = clinical.checkExerciseAvailability(ex, ctx, { strictSeverity: true });
  
  // Implementation returns { allowed: false, reason: 'physical_restriction' }
  assert.equal(res.allowed, false, 'Should block high impact for foot injury');
});

test('No twisting blocks rotation/transverse planes', () => {
  const ctx = clinical.buildUserContext({ physical_restrictions: ['no_twisting'] });

  const exRot = { id: 'rot', primary_plane: 'rotation', position: 'standing' };
  assert.equal(clinical.checkExerciseAvailability(exRot, ctx).allowed, false, 'Should block rotation');

  const exTrans = { id: 'trans', primary_plane: 'transverse', position: 'standing' };
  assert.equal(clinical.checkExerciseAvailability(exTrans, ctx).allowed, false, 'Should block transverse');
});

test('Tolerance tags: flexion_intolerant blocks flexion unless ok_for_flexion_intolerant', () => {
  // Force tolerance pattern via mock inputs that trigger it
  const ctx = clinical.buildUserContext({ trigger_movements: ['bending_forward'] }); 
  // verify detection works
  assert.equal(ctx.tolerancePattern, 'flexion_intolerant', 'Context setup failed');

  // Case 1: Flexion plane, no tag -> Block
  const exBad = { id: 'flex1', primary_plane: 'flexion', tolerance_tags: [] };
  assert.equal(clinical.checkExerciseAvailability(exBad, ctx).allowed, false, 'Should block flexion');

  // Case 2: Flexion plane, HAS tag -> Allow
  const exGood = { id: 'flex2', primary_plane: 'flexion', tolerance_tags: ['ok_for_flexion_intolerant'] };
  assert.equal(clinical.checkExerciseAvailability(exGood, ctx).allowed, true, 'Should allow tagged flexion');
});

test('US-11: engine tolerates new spine_motion_profile field (NULL-safe)', () => {
  const ctx = clinical.buildUserContext({}); // Neutral context
  
  const ex = { 
    id: 'test_us11',
    spineMotionProfile: null, // Should be handled safely
    primary_plane: 'sagittal'
  };

  // Direct check of passesTolerancePattern which uses this field
  const res = clinical.passesTolerancePattern(ex, 'flexion_intolerant');
  assert.equal(typeof res, 'boolean');
  assert.equal(res, true, 'Should default to neutral behavior on null profile');
});