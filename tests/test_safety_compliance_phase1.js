
const assert = require('assert');
const {
    violatesDiagnosisHardContraindications,
    violatesSeverePainRules
} = require('../netlify/functions/_clinical-rule-engine.js');
const {
    analyzePainResponse
} = require('../netlify/functions/generate-plan.js');

const { resolveActivePhase } = require('../netlify/functions/_phase-manager.js');

console.log("Running Phase 1 Safety Compliance Tests V2...");

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

// --- US-01: Safer Knee Flexion Logic ---
runTest('US-01: Chondromalacia + Severe + CKC + 45° -> Allowed', () => {
    const ex = { knee_load_level: 'low', is_foot_loading: true, kneeFlexionApplicability: true, kneeFlexionMaxDeg: 45 };
    const ctx = { isSevere: true };
    const diagnosis = new Set(['chondromalacia']);
    assert.strictEqual(violatesDiagnosisHardContraindications(ex, diagnosis, ctx), false);
});

runTest('US-01: Chondromalacia + Severe + CKC + 70° -> Blocked', () => {
    const ex = { knee_load_level: 'low', is_foot_loading: true, kneeFlexionApplicability: true, kneeFlexionMaxDeg: 70 };
    const ctx = { isSevere: true };
    const diagnosis = new Set(['chondromalacia']);
    assert.strictEqual(violatesDiagnosisHardContraindications(ex, diagnosis, ctx), true);
});

runTest('US-01: Chondromalacia + Severe + OKC + 75° -> Allowed', () => {
    const ex = { knee_load_level: 'low', is_foot_loading: false, kneeFlexionApplicability: true, kneeFlexionMaxDeg: 75 };
    const ctx = { isSevere: true };
    const diagnosis = new Set(['chondromalacia']);
    assert.strictEqual(violatesDiagnosisHardContraindications(ex, diagnosis, ctx), false);
});

// --- US-02: Pain Thresholds ---
runTest('US-02: Pain 5, Delta 1 -> Green', () => {
    const fb = { type: 'pain_monitoring', during: { max_nprs: 5 }, after24h: { delta_vs_baseline: 1 } };
    const res = analyzePainResponse([{ feedback: fb }]);
    assert.strictEqual(res.painStatus, 'green');
});

runTest('US-02: Pain 6, Delta 2 -> Amber', () => {
    const fb = { type: 'pain_monitoring', during: { max_nprs: 6 }, after24h: { delta_vs_baseline: 2 } };
    const res = analyzePainResponse([{ feedback: fb }]);
    assert.strictEqual(res.painStatus, 'amber');
});

runTest('US-02: Pain 7, Delta 2 -> Amber (Limit inclusive)', () => {
    const fb = { type: 'pain_monitoring', during: { max_nprs: 7 }, after24h: { delta_vs_baseline: 2 } };
    const res = analyzePainResponse([{ feedback: fb }]);
    assert.strictEqual(res.painStatus, 'amber');
});

runTest('US-02: Pain 8, Delta 1 -> Red', () => {
    const fb = { type: 'pain_monitoring', during: { max_nprs: 8 }, after24h: { delta_vs_baseline: 1 } };
    const res = analyzePainResponse([{ feedback: fb }]);
    assert.strictEqual(res.painStatus, 'red');
});

runTest('US-02: Delta 3 -> Amber', () => {
    const fb = { type: 'pain_monitoring', during: { max_nprs: 4 }, after24h: { delta_vs_baseline: 3 } };
    const res = analyzePainResponse([{ feedback: fb }]);
    assert.strictEqual(res.painStatus, 'amber');
});

runTest('US-02: Delta 4 -> Red', () => {
    const fb = { type: 'pain_monitoring', during: { max_nprs: 4 }, after24h: { delta_vs_baseline: 4 } };
    const res = analyzePainResponse([{ feedback: fb }]);
    assert.strictEqual(res.painStatus, 'red');
});

// --- US-03: Overhead Restriction with Exception ---
runTest('US-03: Cervical + Severe + Overhead + ScapularStability + Diff=2 -> Allowed', () => {
    const ex = {
        overheadRequired: true,
        category_id: 'scapularstability',
        difficulty_level: 2,
        primary_plane: 'sagittal'
    };
    const ctx = { isSevere: true, painFilters: new Set(['cervical']) };
    const diagnosis = new Set([]);
    assert.strictEqual(violatesDiagnosisHardContraindications(ex, diagnosis, ctx), false);
});

runTest('US-03: Cervical + Severe + Overhead + HipExtension (Wrong Cat) -> Blocked', () => {
    const ex = {
        overheadRequired: true,
        category_id: 'hipextension',
        difficulty_level: 2,
        primary_plane: 'sagittal'
    };
    const ctx = { isSevere: true, painFilters: new Set(['cervical']) };
    const diagnosis = new Set([]);
    assert.strictEqual(violatesDiagnosisHardContraindications(ex, diagnosis, ctx), true);
});

// --- US-04: Severe Pain Difficulty Cap Exception ---
runTest('US-04: Severe + CoreAntiRotation + Diff=3 + Controlled -> Allowed', () => {
    const ex = {
        category_id: 'coreantirotation',
        difficulty_level: 3,
        default_tempo: '3010', // Controlled
        metabolic_intensity: 2
    };
    const ctx = { isSevere: true };
    assert.strictEqual(violatesSeverePainRules(ex, ctx), false);
});

runTest('US-04: Severe + HipExtension + Diff=3 + Dynamic (Wrong Tempo) -> Blocked', () => {
    const ex = {
        category_id: 'hipextension',
        difficulty_level: 3,
        default_tempo: 'Dynamicznie',
        metabolic_intensity: 2
    };
    const ctx = { isSevere: true };
    assert.strictEqual(violatesSeverePainRules(ex, ctx), true);
});

console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) process.exit(1);
else process.exit(0);
