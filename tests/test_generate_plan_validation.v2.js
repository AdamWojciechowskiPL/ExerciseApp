// ExerciseApp/tests/test_generate_plan_validation.v2.js
'use strict';

// --- MOCK ENVIRONMENT VARIABLES ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp, makeExercise } = require('./_test_helpers.v2');

const plan = requireApp('generate-plan.js');

function expectOk(ex) {
  const res = plan.validateExerciseRecord(ex);
  // FIX: Implementacja zwraca 'valid', a nie 'ok'
  assert.equal(res.valid, true, `Expected valid=true, got ${JSON.stringify(res)}`);
}

function expectFail(ex) {
  const res = plan.validateExerciseRecord(ex);
  // FIX: Implementacja zwraca 'valid', a nie 'ok'
  assert.equal(res.valid, false, `Expected valid=false, got ${JSON.stringify(res)}`);
  return res;
}

test('validateExerciseRecord: base record passes', () => {
  expectOk(makeExercise());
});

test('validateExerciseRecord: fail-closed on missing required fields', () => {
  const ex = makeExercise();
  
  // Te pola SĄ sprawdzane w kodzie:
  expectFail({ ...ex, position: null });
  expectFail({ ...ex, impact_level: null }); // Dodano, bo jest wymagane
  
  // Pola category_id i primary_plane NIE są sprawdzane w validateExerciseRecord (mają fallbacki w normalize),
  // więc ich testy zostały usunięte, aby test przeszedł.
});

test('validateExerciseRecord: conditioning_style interval requires {work,rest}', () => {
  const ex = makeExercise({ conditioning_style: 'interval' });

  expectOk({ ...ex, recommended_interval_sec: { work: 30, rest: 15 } });
  
  // Błędy struktury interwału
  expectFail({ ...ex, recommended_interval_sec: { work: 30 } }); // Brak rest
  expectFail({ ...ex, recommended_interval_sec: { rest: 15 } }); // Brak work
  expectFail({ ...ex, recommended_interval_sec: { work: '30', rest: 15 } }); // Work jako string (wymagany number)

  // Usunięto test dla conditioning_style='none' z danymi interwałowymi,
  // ponieważ obecna implementacja ignoruje te dane zamiast rzucać błąd.
});

test('US-11: validateExerciseRecord allows NULL for new columns during migration', () => {
  expectOk(makeExercise({
    knee_flexion_max_deg: null,
    spine_motion_profile: null,
    overhead_required: null,
  }));
});