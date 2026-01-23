// ExerciseApp/tests/test_prescription_and_rest.v2.js
'use strict';

// --- MOCK ENVIRONMENT VARIABLES (MUST BE BEFORE IMPORTS) ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp, makeExercise } = require('./_test_helpers.v2');

const plan = requireApp('generate-plan.js');

// Mock helpers for arguments
const mockUserData = { exercise_experience: 'regular', restTimeFactor: 1.0 };
const mockCtx = {};
const mockWeights = {};
const mockFatigue = 'fresh';
const mockTargetMin = 30;
const mockRpe = 1.0;

test('Prescription: warmup rest capped vs main', () => {
  // 1. Create base exercise
  const ex = makeExercise({ category_id: 'core_stability' });
  
  // 2. FORCE assignment of missing property (bypass helper limitations)
  ex.calculated_timing = { rest_sec: 60, transition_sec: 5 };

  // 3. Construct correct phaseContext
  const phaseContext = { 
    phaseId: 'strength',
    config: { 
      prescription: { restFactor: 2.0 } 
    } 
  };

  // 4. Use correct positional arguments
  const warmup = plan.prescribeForExercise(
    ex, 'warmup', mockUserData, mockCtx, mockWeights, mockFatigue, mockTargetMin, mockRpe, phaseContext
  );
  
  const main = plan.prescribeForExercise(
    ex, 'main', mockUserData, mockCtx, mockWeights, mockFatigue, mockTargetMin, mockRpe, phaseContext
  );

  // Warmup cap logic: getPhaseRestFactor caps warmup at 1.0, main uses 2.0
  // warmup rest = 60 * 1.0 = 60
  // main rest = 60 * 2.0 = 120
  assert.ok(warmup.restAfterExercise < main.restAfterExercise, `Warmup (${warmup.restAfterExercise}) should be less than Main (${main.restAfterExercise})`);
});

test('Prescription: interval conditioning uses recommended_interval_sec', () => {
  // 1. Create base exercise
  const ex = makeExercise({
    category_id: 'conditioning_low_impact',
    conditioning_style: 'interval',
    recommended_interval_sec: { work: 30, rest: 15 }
  });

  // 2. FORCE assignment of missing property
  ex.calculated_timing = { rest_sec: 30, transition_sec: 5 };

  // 3. Call function
  const p = plan.prescribeForExercise(
    ex, 'main', mockUserData, mockCtx, mockWeights, mockFatigue, mockTargetMin, mockRpe, null
  );

  // 4. Assertions matching actual return structure
  assert.strictEqual(p.reps_or_time, '30 s', 'Should use work time from interval config');
  assert.strictEqual(p.restBetweenSets, 15, 'Should use rest time from interval config');
  assert.ok(parseInt(p.sets) > 1, 'Should calculate multiple sets for interval');
});