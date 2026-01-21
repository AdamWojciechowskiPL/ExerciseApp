// tests/test_us03_us05.js

// --- 0. MOCK ENVIRONMENT ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const assert = require('assert');

// --- 1. IMPORTY MODUŁÓW ---
// Ścieżki względne zakładają, że skrypt jest w folderze /tests/
const tempoValidator = require('../netlify/functions/_tempo-validator.js');
const planner = require('../netlify/functions/generate-plan.js');

// --- 2. NARZĘDZIA TESTOWE ---
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

console.log("\n🧪 URUCHAMIANIE TESTÓW DLA US-03, US-04, US-05\n");

// ============================================================================
// US-03: Walidacja Tempa i Fail-Safe
// ============================================================================
console.log("--- US-03: Tempo Validation ---");

runTest('Validator accepts valid dynamic format', () => {
    const input = "2-0-2: Kontrola ruchu";
    const res = tempoValidator.validateTempoString(input);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.type, 'dynamic');
});

runTest('Validator accepts valid isometric format', () => {
    const input = "Izometria: Pełne napięcie";
    const res = tempoValidator.validateTempoString(input);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.type, 'isometric');
});

runTest('Validator REJECTS missing space after colon', () => {
    const input = "2-0-2:Błąd spacji";
    const res = tempoValidator.validateTempoString(input);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'missing_space_after_colon');
});

runTest('Validator REJECTS seconds in isometry description', () => {
    const input = "Izometria: Trzymaj 30s";
    const res = tempoValidator.validateTempoString(input);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'iso_contains_seconds');
});

// ============================================================================
// US-04: Phase Intent Enforcement
// ============================================================================
console.log("\n--- US-04: Phase Intent Enforcement ---");

// Mock exercise with safe default
const mockEx = {
    id: 'ex1',
    default_tempo: "2-0-2: Safe fallback",
    tempos: {
        control: "3-1-3: Super slow"
    }
};

runTest('Enforcer: REHAB blocks "fast" keywords', () => {
    const unsafeInput = "1-0-1: Bardzo szybko i dynamicznie";
    const result = tempoValidator.enforceTempoByPhaseIntent(unsafeInput, mockEx, 'rehab');
    
    // Oczekujemy fallbacku do bezpiecznej stałej dla rehab, bo default_tempo (2-0-2) jest za szybkie dla rehab (wymaga 3s)
    // Lub fallbacku do SAFE_FALLBACK_REHAB (3-1-3...)
    assert.notStrictEqual(result, unsafeInput, 'Should reject unsafe input');
    assert.ok(result.includes("3-1-3") || result.includes("3-0-3"), `Should return safe rehab tempo, got: ${result}`);
});

runTest('Enforcer: REHAB blocks numeric fast tempo (<3s)', () => {
    const numericUnsafe = "2-0-2: Wolno"; // 2s is too fast for rehab logic (min 3s)
    const result = tempoValidator.enforceTempoByPhaseIntent(numericUnsafe, mockEx, 'rehab');
    
    assert.notStrictEqual(result, numericUnsafe);
    assert.ok(result.includes("3-1-3"), 'Should upgrade to 3s eccentric/concentric');
});

runTest('Enforcer: STRENGTH allows fast concentric (X)', () => {
    const powerTempo = "2-0-X: Dynamiczny wyprost";
    const result = tempoValidator.enforceTempoByPhaseIntent(powerTempo, mockEx, 'strength');
    
    assert.strictEqual(result, powerTempo, 'Should allow explosive concentric in Strength phase');
});

runTest('Enforcer: CONTROL blocks fast eccentric', () => {
    const badControl = "0-0-2: Szybki spad"; // 0s eccentric is illegal in Control
    const result = tempoValidator.enforceTempoByPhaseIntent(badControl, mockEx, 'control');
    
    assert.notStrictEqual(result, badControl);
    // Powinien spaść do ex.tempos.control (3-1-3) lub default
    assert.strictEqual(result, "3-1-3: Super slow");
});

// ============================================================================
// US-05: Microcycle Anchors & Variety Penalty
// ============================================================================
console.log("\n--- US-05: Anchors & Variety ---");

runTest('Family Key Generation', () => {
    const ex1 = { category_id: 'squat', primary_plane: 'sagittal', position: 'standing', is_unilateral: false };
    const ex2 = { category_id: 'squat', primary_plane: 'sagittal', position: 'standing', is_unilateral: true }; // Unilateral

    const key1 = planner.deriveFamilyKey(ex1);
    const key2 = planner.deriveFamilyKey(ex2);

    assert.ok(key1.includes('bi'), 'Should detect bilateral');
    assert.ok(key2.includes('uni'), 'Should detect unilateral');
    assert.notStrictEqual(key1, key2, 'Keys must differ by unilaterality');
});

runTest('Anchor Selection Logic', () => {
    const candidates = [
        { id: '1', category_id: 'c1', primary_plane: 'p1', position: 'pos1' }, // Family A
        { id: '2', category_id: 'c2', primary_plane: 'p1', position: 'pos1' }, // Family B
        { id: '3', category_id: 'c1', primary_plane: 'p1', position: 'pos1' }  // Family A (duplicate fam)
    ];

    // Mock scoring: Exercise 1 has highest score
    const categoryWeights = { 'c1': 10, 'c2': 5 }; 
    const phaseContext = { phaseId: 'strength' }; // Should set target to 3

    const result = planner.selectMicrocycleAnchors(candidates, {}, {}, categoryWeights, phaseContext);

    assert.strictEqual(result.targetExposure, 3, 'Strength phase should have target 3');
    assert.strictEqual(result.anchorFamilies.size, 2, 'Should pick max 2 families');
    
    // Check if correct families picked
    const famA = planner.deriveFamilyKey(candidates[0]);
    assert.ok(result.anchorFamilies.has(famA), 'Highest scored family must be anchor');
});

runTest('Variety Penalty: Anchor Protection', () => {
    const ex = { id: '1', category_id: 'squat', primary_plane: 'sagittal', position: 'standing' };
    const famKey = planner.deriveFamilyKey(ex);
    
    // State: Is anchor, usage 0, target 2
    const state = {
        usedIds: new Set(), // FIX: Added missing field
        weeklyUsage: new Map(),
        sessionFamilyUsage: new Map(),
        sessionCategoryUsage: new Map(),
        weeklyFamilyUsage: new Map([[famKey, 0]]),
        anchorFamilies: new Set([famKey]),
        anchorTargetExposure: 2
    };

    // scoreExercise will call varietyPenalty internally.
    // If usage < target, penalty is 1.0 (so score remains high).
    
    const penaltyLow = planner.scoreExercise(ex, 'main', {}, {}, { 'squat': 100 }, state, new Set(), null) / 100;
    
    assert.ok(penaltyLow > 0.8, 'Anchor below target should maintain high score');
});

runTest('Variety Penalty: Session Duplicate (Hard Penalty)', () => {
    const ex = { id: '1', category_id: 'squat', primary_plane: 'sagittal', position: 'standing' };
    const famKey = planner.deriveFamilyKey(ex);

    const state = {
        usedIds: new Set(), // FIX: Added missing field
        weeklyUsage: new Map(),
        sessionFamilyUsage: new Map([[famKey, 1]]), // Already used in session!
        sessionCategoryUsage: new Map(),
        weeklyFamilyUsage: new Map(),
        anchorFamilies: new Set(),
        anchorTargetExposure: 2
    };

    const categoryWeights = { 'squat': 100 };
    const score = planner.scoreExercise(ex, 'main', {}, {}, categoryWeights, state, new Set(), null);

    // Should be heavily penalized (x0.1) -> 100 * 0.1 = 10
    assert.ok(score < 20, `Score should be low for session duplicate. Got: ${score}`);
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