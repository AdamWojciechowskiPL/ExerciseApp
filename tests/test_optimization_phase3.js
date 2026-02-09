
const assert = require('assert');

// Mock helpers
function mockFunction(returnValue) {
    return () => returnValue;
}

console.log("Running Phase 3 Optimization Tests...");

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

// Imports
const { calculateTiming } = require('../netlify/functions/_pacing-engine.js');
const { buildDynamicCategoryWeights } = require('../netlify/functions/generate-plan.js');
// Note: We might need to access PHASE_CONFIG from phase-catalog to check keywords, 
// but it's internal. We can check if generate-plan uses the new keywords if we mock/spy on it, 
// OR we can just check if calculateTiming works and weights update works.
// For phase-catalog, we can import it directly.
const { getPhaseConfig, PHASE_IDS } = require('../netlify/functions/phase-catalog.js');

// --- US-09: Experience-adjusted Unilateral Transition ---
runTest('US-09: Beginner Unilateral -> 15s Transition', () => {
    const ex = { is_unilateral: true };
    const timing = calculateTiming(ex, 'beginner');
    assert.strictEqual(timing.transition_sec, 15);
});

runTest('US-09: Intermediate (Default) Unilateral -> 12s Transition', () => {
    const ex = { is_unilateral: true };
    const timing = calculateTiming(ex, 'intermediate');
    assert.strictEqual(timing.transition_sec, 12);
});

runTest('US-09: Advanced Unilateral -> 8s Transition', () => {
    const ex = { is_unilateral: true };
    const timing = calculateTiming(ex, 'advanced');
    assert.strictEqual(timing.transition_sec, 8);
});

runTest('US-09: Bilateral -> 5s Transition (Unchanged)', () => {
    const ex = { is_unilateral: false };
    const timing = calculateTiming(ex, 'beginner');
    assert.strictEqual(timing.transition_sec, 5);
});

// --- US-10: Patellofemoral Control ---
runTest('US-10: Patellofemoral Control Boost for Knee Pain', () => {
    const exercises = [{ category_id: 'patellofemoralcontrol' }];
    const userData = { pain_locations: ['knee'] };
    const ctx = { isSevere: false, painFilters: new Set(['knee']) };

    const weights = buildDynamicCategoryWeights(exercises, userData, ctx);
    const weight = weights['patellofemoralcontrol'];

    // Base 1.0. Knee pain boost should make it > 1.0.
    assert.ok(weight > 1.2, `Patellofemoral Control should be boosted for Knee Pain (Got ${weight})`);
});

runTest('US-10: Phase Catalog Keywords (REHAB includes patellofemoralcontrol)', () => {
    const config = getPhaseConfig(PHASE_IDS.REHAB);
    const keywords = config.bias.categoryKeywords;
    assert.ok(keywords.includes('patellofemoralcontrol'), 'REHAB phase should include patellofemoralcontrol keyword');
});


console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) process.exit(1);
else process.exit(0);
