// tests/run_tests.js

// --- MOCK ENVIRONMENT VARIABLES ---
// Ustawiamy to PRZED importami, aby _auth-helper.js nie wyrzucił błędu
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';

const assert = require('assert');

// Teraz możemy bezpiecznie importować moduły
const { validateExerciseRecord, prescribeForExercise, normalizeExerciseRow } = require('../netlify/functions/generate-plan.js');
const { checkExerciseAvailability, checkEquipment, buildUserContext } = require('../netlify/functions/_clinical-rule-engine.js');

console.log("🚀 Starting Clinical Safety Regression Tests...\n");

let passed = 0;
let failed = 0;

function runTest(name, testFn) {
    try {
        testFn();
        console.log(`✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`❌ FAIL: ${name}`);
        console.error(`   ${e.message}`);
        failed++;
    }
}

// --- P0: SAFETY & LOGIC ---

runTest('P0.1 Foot Injury blocks High Impact', () => {
    const ex = { id: 'test1', is_foot_loading: true, impact_level: 'high', position: 'standing' };
    const ctx = { physicalRestrictions: ['foot_injury'], blockedIds: new Set(), painFilters: new Set() };
    const res = checkExerciseAvailability(ex, ctx, { strictSeverity: true });
    assert.strictEqual(res.allowed, false, 'Should block high impact for foot injury');
});

runTest('P0.1 Foot Injury blocks Moderate Impact', () => {
    const ex = { id: 'test1b', is_foot_loading: true, impact_level: 'moderate', position: 'standing' };
    const ctx = { physicalRestrictions: ['foot_injury'], blockedIds: new Set(), painFilters: new Set() };
    const res = checkExerciseAvailability(ex, ctx, { strictSeverity: true });
    assert.strictEqual(res.allowed, false, 'Should block moderate impact for foot injury');
});

runTest('P0.2 No Twisting blocks Rotation & Transverse', () => {
    const ctx = { physicalRestrictions: ['no_twisting'], blockedIds: new Set(), painFilters: new Set() };

    const exRot = { id: 'rot', primary_plane: 'rotation', position: 'standing' };
    assert.strictEqual(checkExerciseAvailability(exRot, ctx).allowed, false, 'Should block rotation');

    const exTrans = { id: 'trans', primary_plane: 'transverse', position: 'standing' };
    assert.strictEqual(checkExerciseAvailability(exTrans, ctx).allowed, false, 'Should block transverse');
});

runTest('P0.3 Tolerance Tags Logic', () => {
    const ctx = { tolerancePattern: 'flexion_intolerant', blockedIds: new Set(), painFilters: new Set(), physicalRestrictions: [] };

    // Case 1: Flexion plane, no tag -> Block
    const exBad = { id: 'flex1', primary_plane: 'flexion', tolerance_tags: [] };
    assert.strictEqual(checkExerciseAvailability(exBad, ctx).allowed, false, 'Should block flexion for intolerant user');

    // Case 2: Flexion plane, HAS tag -> Allow
    const exGood = { id: 'flex2', primary_plane: 'flexion', tolerance_tags: ['ok_for_flexion_intolerant'] };
    assert.strictEqual(checkExerciseAvailability(exGood, ctx).allowed, true, 'Should allow tagged flexion exercise');
});

runTest('P0.5 Fail-closed Validation (Missing Data)', () => {
    // Missing position
    const exInvalid = { id: 'inv1', impact_level: 'low', is_foot_loading: false };
    assert.strictEqual(validateExerciseRecord(exInvalid).valid, false, 'Should reject record without position');

    // Missing impact
    const exInvalid2 = { id: 'inv2', position: 'standing', is_foot_loading: true };
    assert.strictEqual(validateExerciseRecord(exInvalid2).valid, false, 'Should reject record without impact_level');
});

runTest('P0.6 Clean Safety (No Magic Categories)', () => {
    const ctx = { physicalRestrictions: ['no_high_impact'], blockedIds: new Set(), painFilters: new Set() };

    // Category says "cardio", but impact is "low" -> SHOULD PASS
    const exSafeCardio = { id: 'c1', category_id: 'cardio', impact_level: 'low', position: 'standing' };
    assert.strictEqual(checkExerciseAvailability(exSafeCardio, ctx).allowed, true, 'Should allow low impact cardio');

    // Category says "yoga", but impact is "high" -> SHOULD FAIL
    const exUnsafeYoga = { id: 'y1', category_id: 'yoga', impact_level: 'high', position: 'standing' };
    assert.strictEqual(checkExerciseAvailability(exUnsafeYoga, ctx).allowed, false, 'Should block high impact yoga');
});

// --- P1: DICTIONARIES & CONSISTENCY ---

runTest('P1.1 Equipment Exact Match', () => {
    const userEq = new Set(['hantle', 'gumy']);

    // Case match check (function internal logic should handle case)
    const ex1 = { equipment: ['Hantle'] };
    assert.strictEqual(checkEquipment(ex1, userEq), true, 'Should match Hantle with hantle');

    // Mat check (mat is NOT ignorable now)
    const exMat = { equipment: ['mata'] };
    assert.strictEqual(checkEquipment(exMat, userEq), false, 'Should fail if user lacks mat (it is required)');
});

runTest('P1.2 Half Kneeling Logic', () => {
    const ctx = { physicalRestrictions: ['no_kneeling'], blockedIds: new Set(), painFilters: new Set() };
    const ex = { id: 'hk', position: 'half_kneeling' };
    assert.strictEqual(checkExerciseAvailability(ex, ctx).allowed, false, 'No kneeling should block half_kneeling');
});

// --- P2: CONDITIONING & INTERVALS ---

runTest('P2.1 Interval Prescription', () => {
    const ex = {
        id: 'int1',
        conditioning_style: 'interval',
        recommended_interval_sec: { work: 30, rest: 15 }
    };

    // Mock user context to get factor ~1.0
    const userData = { exercise_experience: 'regular', pain_intensity: 0 };
    const result = prescribeForExercise(ex, 'main', userData, {}, {}, 'fresh', 30, 1.0);

    assert.ok(result.reps_or_time.includes('30 s'), 'Should set work time');
    assert.strictEqual(result.restBetweenSets, 15, 'Should preserve rest interval');
    assert.ok(parseInt(result.sets) > 1, 'Should calculate multiple sets');
});

runTest('P2.2 Interval Validation', () => {
    const validEx = {
        id: 'v1', impact_level: 'low', position: 'standing', is_foot_loading: true,
        conditioning_style: 'interval',
        recommended_interval_sec: { work: 20, rest: 10 }
    };
    assert.strictEqual(validateExerciseRecord(validEx).valid, true);

    const invalidEx = {
        id: 'v2', impact_level: 'low', position: 'standing', is_foot_loading: true,
        conditioning_style: 'interval',
        recommended_interval_sec: { work: 0, rest: 10 } // Invalid work
    };
    assert.strictEqual(validateExerciseRecord(invalidEx).valid, false, 'Should reject invalid interval structure');
});

console.log(`\nTests Completed. Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);