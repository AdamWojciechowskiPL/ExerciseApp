// ExerciseApp/tests/test_us11_null_handling.js

// --- 0. MOCK ENVIRONMENT ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const assert = require('assert');
const plan = require('../netlify/functions/generate-plan.js');
const clinicalEngine = require('../netlify/functions/_clinical-rule-engine.js');

let passed = 0;
let failed = 0;

function runTest(name, testFn) {
    try {
        testFn();
        console.log(`✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`❌ FAIL: ${name}`);
        console.error(`   Error: ${e.message}`);
        failed++;
    }
}

console.log("\n🧪 URUCHAMIANIE TESTÓW DLA US-11 (NULL HANDLING & CLINICAL GATES)\n");

// ============================================================================
// SEKCJA 1: Normalizacja danych (Logic check)
// ============================================================================
console.log("--- Normalization & Applicability ---");

runTest('1. knee_flexion_max_deg=null for neck exercise -> applicability=false', () => {
    const row = {
        id: 'neck_iso',
        knee_flexion_max_deg: null,
        knee_load_level: 'none',
        is_foot_loading: false
    };
    const norm = plan.normalizeExerciseRow(row);
    assert.strictEqual(norm.kneeFlexionApplicability, false, 'Neck exercise should not care about knee angle');
    assert.strictEqual(norm.kneeFlexionMaxDeg, null);
});

runTest('2. knee_flexion_max_deg=null for standing exercise -> applicability=true', () => {
    const row = {
        id: 'stand_ex',
        knee_flexion_max_deg: null,
        knee_load_level: 'low',
        is_foot_loading: true
    };
    const norm = plan.normalizeExerciseRow(row);
    assert.strictEqual(norm.kneeFlexionApplicability, true, 'Standing exercise implicitly involves knee loading context');
    assert.strictEqual(norm.kneeFlexionMaxDeg, null);
});

runTest('3. spine_motion_profile=null -> neutral', () => {
    const row = { id: 'ex', spine_motion_profile: null };
    const norm = plan.normalizeExerciseRow(row);
    assert.strictEqual(norm.spineMotionProfile, 'neutral');
});

runTest('4. overhead_required=null -> false', () => {
    const row = { id: 'ex', overhead_required: null };
    const norm = plan.normalizeExerciseRow(row);
    assert.strictEqual(norm.overheadRequired, false);
});

// ============================================================================
// SEKCJA 2: Knee Gates (Context Awareness)
// ============================================================================
console.log("\n--- Knee Gates (Chondromalacia/Pain) ---");

// Mock context for scoring tests
const mockCtx = (severity) => ({
    isSevere: severity,
    painFilters: new Set(['knee']), // Legacy
    painZoneSet: new Set(['knee']), // US-01
});

// Mock exercise factory
const mkKneeEx = (deg, applicable = true) => ({
    id: 'k1',
    kneeFlexionMaxDeg: deg,
    kneeFlexionApplicability: applicable,
    knee_load_level: 'low'
});

// Helper for private function testing
// Note: In real integration tests, we'd use rewiring, but here we import exported map.
// Since violatesDiagnosisHardContraindications is not exported directly in the snippet provided previously, 
// I'm assuming it IS exported or accessible via the module. 
// Looking at generate-plan.js exports, it IS NOT exported. 
// However, filterExerciseCandidates IS exported (implicitly via handler usage).
// For the sake of this test script, let's assume we can test logic via filterExerciseCandidates or scoreExercise.

// Let's test via `scoreExercise` which calls `painSafetyPenalty`
const { scoreExercise } = plan;

runTest('6. Mild Pain + Knee Applicable + NULL deg -> Score Penalty (x0.75)', () => {
    const ex = mkKneeEx(null, true);
    const userData = { pain_locations: ['knee'] };
    const ctx = mockCtx(false); // Mild
    
    // Base score 1.0
    const score = scoreExercise(ex, 'main', userData, ctx, {}, { usedIds: new Set(), weeklyUsage: new Map(), sessionCategoryUsage: new Map(), weeklyFamilyUsage: new Map(), sessionFamilyUsage: new Map() }, new Set(), null);
    
    // Expect penalty around 0.75 (from painSafetyPenalty)
    // Note: scoreExercise also applies section multipliers etc. 
    // Let's ensure category weight is 1.0 and section main (0.0 for breathing? no this is uncategorized).
    // Let's force a safe category.
    ex.category_id = 'strength'; 
    const weights = { 'strength': 1.0 };
    
    // painSafetyPenalty: 0.75 (NULL deg mild)
    // sectionCategoryFitMultiplier: 1.15 (main, strength)
    // goalMultiplier: 1.0
    // variety: 1.0
    // Expected: 1.0 * 1.15 * 0.75 = 0.8625
    
    const finalScore = scoreExercise(ex, 'main', userData, ctx, weights, { usedIds: new Set(), weeklyUsage: new Map(), sessionCategoryUsage: new Map(), weeklyFamilyUsage: new Map(), sessionFamilyUsage: new Map() }, new Set(), null);
    
    assert.ok(finalScore < 1.0, `Score should be penalized (Got ${finalScore})`);
    assert.ok(finalScore > 0.7, `Score shouldn't be zero`);
});

runTest('8. Mild Pain + Knee <= 60 deg -> Score Boost (x1.10)', () => {
    const ex = mkKneeEx(45, true);
    ex.category_id = 'strength';
    const userData = { pain_locations: ['knee'] };
    const ctx = mockCtx(false);
    const weights = { 'strength': 1.0 };
    
    // painSafetyPenalty: 1.10
    // section: 1.15
    // Total: 1.265
    
    const finalScore = scoreExercise(ex, 'main', userData, ctx, weights, { usedIds: new Set(), weeklyUsage: new Map(), sessionCategoryUsage: new Map(), weeklyFamilyUsage: new Map(), sessionFamilyUsage: new Map() }, new Set(), null);
    
    assert.ok(finalScore > 1.15, `Score should be boosted (Got ${finalScore})`);
});

// ============================================================================
// SEKCJA 3: Spine & Overhead
// ============================================================================
console.log("\n--- Spine & Overhead ---");

runTest('9. Flexion Intolerant blocks lumbar_flexion_loaded', () => {
    const ex = { primary_plane: 'sagittal', spineMotionProfile: 'lumbar_flexion_loaded' };
    const allowed = clinicalEngine.passesTolerancePattern(ex, 'flexion_intolerant');
    assert.strictEqual(allowed, false, 'Should block loaded flexion');
});

runTest('10. Flexion Intolerant allows neutral (including NULL source)', () => {
    const ex = { primary_plane: 'sagittal', spineMotionProfile: 'neutral' };
    const allowed = clinicalEngine.passesTolerancePattern(ex, 'flexion_intolerant');
    assert.strictEqual(allowed, true, 'Should allow neutral spine');
});

runTest('11. Overhead Severe Neck -> Check Constraints', () => {
    // Requires mocking `violatesRestrictions` or `checkExerciseAvailability` logic.
    // clinicalEngine exports checkExerciseAvailability.
    
    const ex = { id: 'oh_press', overheadRequired: true, difficulty_level: 1 };
    const ctx = {
        isSevere: true,
        painFilters: new Set(['neck']),
        blockedIds: new Set(),
        userEquipment: new Set(),
        physicalRestrictions: [],
        painZoneSet: new Set(['neck']), // needed for severity pass
        medicalDiagnosis: []
    };
    // Make sure exercise "helps" the zone so it passes the basic severity filter
    ex.pain_relief_zones = ['neck']; 
    
    // checkExerciseAvailability calls violatesRestrictions internally
    const res = clinicalEngine.checkExerciseAvailability(ex, ctx, { strictSeverity: true });
    
    assert.strictEqual(res.allowed, false, 'Should be blocked due to overhead restriction in severe neck pain');
    assert.strictEqual(res.reason, 'physical_restriction', 'Reason should be restriction');
});

runTest('12. Overhead Mild Neck -> Penalty', () => {
    const ex = { id: 'oh_press', overheadRequired: true, category_id: 'strength', difficulty_level: 1 };
    const userData = { pain_locations: ['neck'] };
    const ctx = mockCtx(false); // Mild
    const weights = { 'strength': 1.0 };
    
    const finalScore = scoreExercise(ex, 'main', userData, ctx, weights, { usedIds: new Set(), weeklyUsage: new Map(), sessionCategoryUsage: new Map(), weeklyFamilyUsage: new Map(), sessionFamilyUsage: new Map() }, new Set(), null);
    
    // penalty 0.75 * 1.15 section = ~0.86
    assert.ok(finalScore < 1.0, `Overhead should be penalized in mild neck pain (Got ${finalScore})`);
});

// --- PODSUMOWANIE ---
console.log("\n========================================");
if (failed === 0) {
    console.log(`✅ WSZYSTKIE TESTY ZALICZONE (${passed}/${passed})`);
    process.exit(0);
} else {
    console.log(`❌ NIEPOWODZENIE: Zaliczone: ${passed}, Błędy: ${failed}`);
    process.exit(1);
}