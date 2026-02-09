const assert = require('assert');

// Mock helpers
function mockFunction(returnValue) {
    return () => returnValue;
}

console.log("Running Phase 2 Optimization Tests...");

let passed = 0;
let failed = 0;

function runTest(name, testFn) {
    try {
        testFn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

const {
    buildDynamicCategoryWeights,
    normalizeExerciseRow,
    scoreExercise
} = require('../netlify/functions/generate-plan.js');

const {
    violatesDiagnosisHardContraindications
} = require('../netlify/functions/_clinical-rule-engine.js');


// --- US-06: Category Weights ---
runTest('US-06: Glute Activation Boost for Knee Pain', () => {
    const exercises = [{ category_id: 'glute_activation' }, { category_id: 'vmo_activation' }];
    const userData = { pain_locations: ['knee'] };
    const ctx = { isSevere: false, painFilters: new Set(['knee']) };

    const weights = buildDynamicCategoryWeights(exercises, userData, ctx);

    const gluteW = weights['glute_activation'];
    const vmoW = weights['vmo_activation'];

    assert.ok(gluteW > vmoW, `Glute (${gluteW}) should be > VMO (${vmoW})`);
    assert.ok(gluteW >= 3.0, `Glute weight should be boosted significantly (Expected ~3.0, Got ${gluteW})`);
});

runTest('US-06: Conditioning reduced for Severe Knee Pain', () => {
    const exercises = [{ category_id: 'conditioning_interval' }];
    const userData = { pain_locations: ['knee'] };
    const ctx = { isSevere: true, painFilters: new Set(['knee']) };

    const weights = buildDynamicCategoryWeights(exercises, userData, ctx);
    const condW = weights['conditioning_interval'];

    assert.ok(condW <= 0.75, `Conditioning should be reduced (Got ${condW})`);
});


// --- US-07: New Attribute shoulderloadlevel ---
runTest('US-07: Normalize Row maps shoulder_load_level', () => {
    const row = {
        id: 'ex1',
        name: 'Test',
        shoulder_load_level: 'High',
        impact_level: 'low',
        position: 'standing',
        is_foot_loading: false
    };
    const ex = normalizeExerciseRow(row);
    assert.strictEqual(ex.shoulderLoadLevel, 'high');
});

runTest('US-07: High Shoulder Load blocked for Severe Neck Pain', () => {
    const ex = {
        id: 'ex1',
        overheadRequired: true,
        shoulderLoadLevel: 'high',
        category_id: 'shoulder_press'
    };
    const ctx = { isSevere: true, painFilters: new Set(['neck', 'cervical']) };

    const blocked = violatesDiagnosisHardContraindications(ex, new Set(), ctx);
    assert.strictEqual(blocked, true, "Should block High Shoulder Load for Severe Neck Pain");
});

runTest('US-07: Low Shoulder Load Scapular allowed for Severe Neck Pain', () => {
    const ex = {
        id: 'ex1',
        overheadRequired: true,
        shoulderLoadLevel: 'low',
        category_id: 'scapularstability',
        difficulty_level: 2,
        primary_plane: 'multi'
    };
    const ctx = { isSevere: true, painFilters: new Set(['neck', 'cervical']) };

    const blocked = violatesDiagnosisHardContraindications(ex, new Set(), ctx);
    assert.strictEqual(blocked, false, "Should allow Low Load Scapular for Severe Neck Pain");
});


// --- US-08: intendedpainresponse ---
runTest('US-08: Normalize Row maps intended_pain_response', () => {
    const row = {
        id: 'ex1',
        name: 'Test',
        intended_pain_response: 'Acceptable',
        impact_level: 'low',
        position: 'standing',
        is_foot_loading: false
    };
    const ex = normalizeExerciseRow(row);
    assert.strictEqual(ex.intendedPainResponse, 'acceptable');
});

runTest('US-08: Score boost for Acceptable Pain in Pain Relief (Relative check)', () => {
    // 1. Base exercise (without intendedPainResponse)
    const exBase = {
        id: 'ex1',
        category_id: 'mobility',
        // intendedPainResponse: undefined
    };
    
    // 2. Boosted exercise (with intendedPainResponse = acceptable)
    const exBoost = {
        id: 'ex2',
        category_id: 'mobility',
        intendedPainResponse: 'acceptable'
    };

    const userData = { primary_goal: 'pain_relief' };
    const ctx = { isSevere: false, painFilters: new Set() }; // painStatus defaults to green logic if undefined in ctx, but safer to inject if logic requires it. generate-plan logic checks ctx.painStatus or default.
    // We mock ctx.painStatus for clarity, though current logic handles undefined as green.
    ctx.painStatus = 'green';

    const state = { usedIds: new Set(), weeklyUsage: new Map(), sessionCategoryUsage: new Map(), sessionFamilyUsage: new Map() };
    const weights = { 'mobility': 1.0 };

    const scoreBase = scoreExercise(exBase, 'main', userData, ctx, weights, state, new Set(), null, null);
    const scoreBoost = scoreExercise(exBoost, 'main', userData, ctx, weights, state, new Set(), null, null);

    const ratio = scoreBoost / scoreBase;

    // US-08 specifies 1.1 multiplier
    // Mobility in main section gets 0.85 penalty, and 1.25 goal multiplier.
    // Base: 1.0 * 0.85 * 1.25 = 1.0625
    // Boost: 1.0 * 0.85 * 1.25 * 1.1 = 1.16875
    // Ratio should be exactly 1.1

    assert.ok(scoreBoost > scoreBase, `Score with 'acceptable' (${scoreBoost}) should be higher than without (${scoreBase})`);
    assert.ok(Math.abs(ratio - 1.1) < 0.05, `Expected ~1.1x boost ratio, got ${ratio.toFixed(4)}`);
});


console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) process.exit(1);
else process.exit(0);