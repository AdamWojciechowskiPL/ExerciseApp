// tests/test_us01_us02.js

// --- 0. MOCK ENVIRONMENT (Niezbędne dla importów) ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const assert = require('assert');
const path = require('path');

// --- 1. IMPORTY MODUŁÓW ---
const taxonomy = require('../netlify/functions/_pain-taxonomy.js');
const clinicalEngine = require('../netlify/functions/_clinical-rule-engine.js');
const phaseManager = require('../netlify/functions/_phase-manager.js');
const phaseCatalog = require('../netlify/functions/phase-catalog.js');

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
        if (e.expected) console.error(`   Expected: ${e.expected}, Actual: ${e.actual}`);
        failed++;
    }
}

console.log("\n🧪 URUCHAMIANIE TESTÓW DLA US-01 i US-02\n");

// ============================================================================
// SEKCJA US-01: Ujednolicenie taksonomii i filtr Severe Pain
// ============================================================================
console.log("--- US-01: Pain Taxonomy & Severe Filter ---");

runTest('Taxonomy: "knee_anterior" should expand to set including "patella"', () => {
    const input = ['knee_anterior'];
    const result = taxonomy.derivePainZoneSet(input);
    
    assert.ok(result.has('patella'), 'Should contain mapped "patella"');
    assert.ok(result.has('knee_anterior'), 'Should contain original "knee_anterior"');
    assert.ok(result.has('knee'), 'Should contain expanded "knee"');
});

runTest('Taxonomy: "lumbar" should expand to "sciatica" and "lumbosacral"', () => {
    const input = ['lumbar'];
    const result = taxonomy.derivePainZoneSet(input);
    
    assert.ok(result.has('sciatica'), 'Should map lumbar to sciatica');
    assert.ok(result.has('lumbosacral'), 'Should map lumbar to lumbosacral');
});

runTest('Clinical Engine: buildUserContext uses new taxonomy', () => {
    const userData = { pain_locations: ['knee_anterior'], equipment_available: [] };
    const ctx = clinicalEngine.buildUserContext(userData);
    
    assert.ok(ctx.painZoneSet instanceof Set, 'painZoneSet should be a Set');
    assert.ok(ctx.painZoneSet.has('patella'), 'Context should have expanded pain zones');
});

runTest('Severe Filter: Blocks exercise if NO intersection with pain zones (Fail-Closed)', () => {
    // User ma ból kolana (severe)
    const ctx = {
        isSevere: true,
        painZoneSet: new Set(['knee', 'patella']),
        blockedIds: new Set(),
        userEquipment: new Set(),
        physicalRestrictions: [],
        painFilters: new Set(['knee']) // Legacy fallback
    };

    // Ćwiczenie na kręgosłup (nie pomaga na kolano)
    const ex = {
        id: 'back_ext',
        pain_relief_zones: ['lumbar_general'],
        difficulty_level: 1
    };

    const result = clinicalEngine.checkExerciseAvailability(ex, ctx, { strictSeverity: true });
    assert.strictEqual(result.allowed, false, 'Should block because it does not help the specific severe pain');
    assert.strictEqual(result.reason, 'severity_filter');
});

runTest('Severe Filter: Allows exercise if matches expanded taxonomy', () => {
    // User ma ból "knee_anterior" -> mapuje na "patella"
    const ctx = {
        isSevere: true,
        painZoneSet: new Set(['knee_anterior', 'patella', 'knee']),
        blockedIds: new Set(),
        userEquipment: new Set(),
        physicalRestrictions: [],
        painFilters: new Set(['knee'])
    };

    // Ćwiczenie pomaga na "patella"
    const ex = {
        id: 'vmo_act',
        pain_relief_zones: ['patella'], // To jest kluczowe - matchuje z expanded set
        difficulty_level: 1
    };

    const result = clinicalEngine.checkExerciseAvailability(ex, ctx, { strictSeverity: true });
    assert.strictEqual(result.allowed, true, 'Should allow because "patella" is in user pain zones');
});

// ============================================================================
// SEKCJA US-02: Phase Override Persistence & Reporting
// ============================================================================
console.log("\n--- US-02: Phase Override Persistence ---");

runTest('Phase Manager: applySuggestedUpdate enters Override correctly', () => {
    const initialState = phaseManager.initializePhaseState('strength', {});
    
    // Simulate suggestion from resolveActivePhase
    const suggestion = {
        mode: 'rehab',
        reason: 'severe_pain'
    };

    const newState = phaseManager.applySuggestedUpdate(initialState, suggestion);

    assert.strictEqual(newState.override.mode, 'rehab', 'Override mode should be set');
    assert.strictEqual(newState.override.reason, 'severe_pain', 'Reason should be set');
    assert.ok(newState.override.triggered_at, 'Timestamp should be set');
    assert.strictEqual(newState.override.stats.sessions_completed, 0, 'Stats should be reset to 0');
    
    // Ensure base stats are untouched
    assert.strictEqual(newState.current_phase_stats.phase_id, 'control', 'Base phase should remain control');
});

runTest('Phase Manager: applySuggestedUpdate exits Override correctly', () => {
    const stateInOverride = phaseManager.initializePhaseState('strength', {});
    stateInOverride.override.mode = 'rehab';
    stateInOverride.override.stats.sessions_completed = 5;

    // Simulate exit suggestion
    const suggestion = {
        mode: null,
        reason: 'condition_cleared'
    };

    const newState = phaseManager.applySuggestedUpdate(stateInOverride, suggestion);

    assert.strictEqual(newState.override.mode, null, 'Override mode should be null');
    assert.strictEqual(newState.override.stats.sessions_completed, 0, 'Override stats should be reset');
});

runTest('Phase Catalog: pickTargetSessions returns correct values for Overrides', () => {
    // REHAB -> 999
    const rehabTarget = phaseCatalog.pickTargetSessions('rehab', {});
    assert.strictEqual(rehabTarget, 999, 'Rehab should have infinite target (999)');

    // DELOAD -> 3-5 range (average 4 for regular)
    const deloadTarget = phaseCatalog.pickTargetSessions('deload', { exercise_experience: 'regular' });
    assert.ok(deloadTarget >= 3 && deloadTarget <= 5, 'Deload should be short (3-5 sessions)');
});

runTest('Integration Logic Check: Phase Context Reporting', () => {
    // Symulacja logiki z generate-plan.js (bez odpalania całego handlera)
    
    // Scenario: User is in REHAB override
    const phaseState = {
        current_phase_stats: { phase_id: 'strength', sessions_completed: 10, target_sessions: 12 },
        override: { 
            mode: 'rehab', 
            stats: { sessions_completed: 2 } 
        }
    };

    const resolved = { activePhaseId: 'rehab', isOverride: true };
    const userData = { exercise_experience: 'regular' };

    // Logika z generate-plan.js:
    let sessionsCompleted = phaseState.current_phase_stats.sessions_completed;
    let targetSessions = phaseState.current_phase_stats.target_sessions;

    if (resolved.isOverride) {
        sessionsCompleted = phaseState.override.stats.sessions_completed;
        targetSessions = phaseCatalog.pickTargetSessions(resolved.activePhaseId, userData);
    }

    assert.strictEqual(sessionsCompleted, 2, 'Should report Override sessions completed');
    assert.strictEqual(targetSessions, 999, 'Should report Override target (Rehab)');
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