// tests/test_effective_rest.js

// --- MOCK ENVIRONMENT ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const assert = require('assert');
const { prescribeForExercise } = require('../netlify/functions/generate-plan.js');

console.log('TEST: US-03 Phase-aware rest (restAfterExercise includes PHASE, not USER)\n');

// MOCK EXERCISE (base timing)
const mockExercise = {
  id: 'test_squat',
  category_id: 'strength',
  difficulty_level: 4,
  default_tempo: '2-0-2',
  calculated_timing: {
    rest_sec: 60,         // BASE REST
    transition_sec: 5
  }
};

const baseCtx = { isSevere: false };      // minimal ctx for loadFactorFromState
const dummyWeights = {};                  // not used by rest logic here
const fatigueState = 'fresh';
const targetMin = 30;
const rpeModifier = 1.0;

const createPhaseContext = (phaseId, restFactor) => ({
  phaseId,
  config: {
    prescription: {
      restFactor,         // THIS is what getPhaseRestFactor reads
      sets: '3',
      reps: '8-12'
    }
  }
});

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    console.error(`  ${e.message}`);
    failed++;
  }
}

// Helper: what "effective rest" would be after frontend applies user factor
function effectiveRest(restAfterExercise, userRestFactor) {
  return Math.round(restAfterExercise * userRestFactor);
}

// --- TEST SCENARIOS ---

runTest('Strength main: restAfterExercise = base(60) * phase(1.5) = 90', () => {
  const userData = { exercise_experience: 'regular', restTimeFactor: 1.0 };
  const phaseCtx = createPhaseContext('strength', 1.5);

  const result = prescribeForExercise(
    mockExercise, 'main', userData, baseCtx, dummyWeights, fatigueState, targetMin, rpeModifier, phaseCtx
  );

  assert.strictEqual(result.restAfterExercise, 90, 'Expected 90s (60 * 1.5)');
  assert.strictEqual(result.transitionTime, 5, 'Transition should pass through');
  assert.strictEqual(result.restFactor, 1.5, 'restFactor should reflect phase prescription restFactor');
});

runTest('Mobility main: restAfterExercise = base(60) * phase(0.5) = 30', () => {
  const userData = { exercise_experience: 'regular', restTimeFactor: 1.0 };
  const phaseCtx = createPhaseContext('mobility', 0.5);

  const result = prescribeForExercise(
    mockExercise, 'main', userData, baseCtx, dummyWeights, fatigueState, targetMin, rpeModifier, phaseCtx
  );

  assert.strictEqual(result.restAfterExercise, 30, 'Expected 30s (60 * 0.5)');
  assert.strictEqual(result.restFactor, 0.5, 'restFactor should reflect phase prescription restFactor');
});

runTest('Warmup protection: strength warmup caps phase factor at 1.0 -> restAfterExercise = 60', () => {
  const userData = { exercise_experience: 'regular', restTimeFactor: 1.0 };
  const phaseCtx = createPhaseContext('strength', 1.5);

  const result = prescribeForExercise(
    mockExercise, 'warmup', userData, baseCtx, dummyWeights, fatigueState, targetMin, rpeModifier, phaseCtx
  );

  // In your code: getPhaseRestFactor caps warmup/cooldown at max 1.0
  assert.strictEqual(result.restAfterExercise, 60, 'Expected 60s (cap at 1.0 for warmup)');
  assert.strictEqual(result.restFactor, 1.5, 'restFactor stays as phase value; cap applies to restAfterExercise');
});

runTest('Legacy: no phaseContext -> phase factor defaults to 1.0 -> restAfterExercise = 60', () => {
  const userData = { exercise_experience: 'regular', restTimeFactor: 1.0 };

  const result = prescribeForExercise(
    mockExercise, 'main', userData, baseCtx, dummyWeights, fatigueState, targetMin, rpeModifier, null
  );

  assert.strictEqual(result.restAfterExercise, 60, 'Expected base rest (60) with default phase factor 1.0');
  assert.strictEqual(result.restFactor, 1.0, 'Expected default restFactor=1.0 when no phaseConfig');
});

runTest('User factor is NOT applied in restAfterExercise (prevents double counting)', () => {
  const phaseCtx = createPhaseContext('strength', 1.5);

  const userA = { exercise_experience: 'regular', restTimeFactor: 1.0 };
  const userB = { exercise_experience: 'regular', restTimeFactor: 1.3 };

  const rA = prescribeForExercise(mockExercise, 'main', userA, baseCtx, dummyWeights, fatigueState, targetMin, rpeModifier, phaseCtx);
  const rB = prescribeForExercise(mockExercise, 'main', userB, baseCtx, dummyWeights, fatigueState, targetMin, rpeModifier, phaseCtx);

  assert.strictEqual(rA.restAfterExercise, 90, 'User A phase-adjusted rest should be 90');
  assert.strictEqual(rB.restAfterExercise, 90, 'User B phase-adjusted rest should STILL be 90 (no user factor here)');
});

runTest('Effective rest (math check): base*phase*user computed as restAfterExercise*userRestFactor', () => {
  const phaseCtx = createPhaseContext('strength', 1.5);
  const userData = { exercise_experience: 'regular', restTimeFactor: 1.3 };

  const result = prescribeForExercise(
    mockExercise, 'main', userData, baseCtx, dummyWeights, fatigueState, targetMin, rpeModifier, phaseCtx
  );

  // phase-adjusted = 90; effective after user = 117
  assert.strictEqual(result.restAfterExercise, 90, 'phase-adjusted rest should be 90');
  assert.strictEqual(effectiveRest(result.restAfterExercise, userData.restTimeFactor), 117, 'effective rest should be 117 (90 * 1.3)');
});

console.log(`\nDONE. Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
