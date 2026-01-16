// tests/test_phase_logic.js

const assert = require('assert');
const { 
    initializePhaseState, 
    resolveActivePhase, 
    updatePhaseStateAfterSession, 
    checkDetraining 
} = require('../netlify/functions/_phase-manager.js');

const { 
    resolveTemplate, 
    pickTargetSessions, 
    PHASE_IDS 
} = require('../netlify/functions/phase-catalog.js');

console.log("🧪 STARTING PHASE MANAGER LOGIC TESTS\n");

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

// --- 1. CATALOG INTEGRITY ---

runTest('Blueprint Resolution', () => {
    const strengthTemplate = resolveTemplate('strength');
    assert.strictEqual(strengthTemplate.id, 'strength');
    assert.ok(strengthTemplate.sequence.includes(PHASE_IDS.STRENGTH));
    assert.ok(strengthTemplate.sequence.includes(PHASE_IDS.DELOAD));
});

runTest('Target Session Picking (Beginner vs Advanced)', () => {
    const beginnerCtx = { exercise_experience: 'none' };
    const advancedCtx = { exercise_experience: 'advanced' };

    const targetBeginner = pickTargetSessions(PHASE_IDS.CONTROL, beginnerCtx);
    const targetAdvanced = pickTargetSessions(PHASE_IDS.CONTROL, advancedCtx);

    assert.strictEqual(targetBeginner, 16, 'Beginner should get max sessions in Control');
    assert.strictEqual(targetAdvanced, 12, 'Advanced should get min sessions in Control');
});

// --- 2. STATE INITIALIZATION ---

runTest('State Initialization', () => {
    const state = initializePhaseState('strength', { exercise_experience: 'regular' });
    
    assert.strictEqual(state.template_id, 'strength');
    assert.strictEqual(state.current_phase_stats.phase_id, PHASE_IDS.CONTROL);
    assert.strictEqual(state.current_phase_stats.sessions_completed, 0);
    assert.ok(state.current_phase_stats.target_sessions > 0);
});

// --- 3. PROGRESSION SIMULATION (The Loop) ---

runTest('Standard Progression: Target Reached', () => {
    let state = initializePhaseState('strength', { exercise_experience: 'regular' });
    const target = state.current_phase_stats.target_sessions;
    const initialPhase = state.current_phase_stats.phase_id; // Control

    console.log(`   ℹ️ Simulating ${target} sessions for ${initialPhase}...`);

    for (let i = 0; i < target; i++) {
        const result = updatePhaseStateAfterSession(state, initialPhase, {});
        state = result.newState;
        
        if (i === target - 1) {
            // OSTATNIA SESJA: Powinna wywołać zmianę fazy
            assert.notStrictEqual(state.current_phase_stats.phase_id, initialPhase, 'Phase should have advanced');
            assert.strictEqual(state.current_phase_stats.phase_id, PHASE_IDS.CAPACITY, 'Should move to Capacity');
            assert.strictEqual(state.current_phase_stats.sessions_completed, 0, 'New counter should be 0');
        } else {
            // ZWYKŁA SESJA: Inkrementacja
            assert.strictEqual(state.current_phase_stats.phase_id, initialPhase);
            assert.strictEqual(state.current_phase_stats.sessions_completed, i + 1);
        }
    }
});

// --- 4. SAFETY OVERRIDE LOGIC ---

runTest('Safety Override: High Fatigue triggers Deload', () => {
    let state = initializePhaseState('strength', {});
    
    // 1. Check Normal State
    let resolution = resolveActivePhase(state, { fatigueScore: 20, isSeverePain: false });
    assert.strictEqual(resolution.activePhaseId, PHASE_IDS.CONTROL);
    assert.strictEqual(resolution.isOverride, false);

    // 2. Simulate HIGH FATIGUE (Trigger Override)
    resolution = resolveActivePhase(state, { fatigueScore: 85, isSeverePain: false });
    
    // Simulate applying the override
    state.override.mode = PHASE_IDS.DELOAD;
    state.override.reason = 'high_fatigue';

    // 3. Verify Active Phase is now Deload
    resolution = resolveActivePhase(state, { fatigueScore: 85 });
    assert.strictEqual(resolution.activePhaseId, PHASE_IDS.DELOAD);
    assert.strictEqual(resolution.isOverride, true);

    // 4. Simulate Completing a Deload Session
    const baseCountBefore = state.current_phase_stats.sessions_completed;
    const result = updatePhaseStateAfterSession(state, PHASE_IDS.DELOAD, {});
    state = result.newState;

    assert.strictEqual(state.override.stats.sessions_completed, 1);
    assert.strictEqual(state.current_phase_stats.sessions_completed, baseCountBefore, 'Base phase should NOT progress during override');
});

runTest('Safety Override: Severe Pain triggers Rehab', () => {
    let state = initializePhaseState('strength', {});
    const resolution = resolveActivePhase(state, { fatigueScore: 20, isSeverePain: true });
    
    assert.strictEqual(resolution.suggestedUpdate.mode, PHASE_IDS.REHAB);
});

// --- 5. DETRAINING LOGIC ---

runTest('Detraining: Cuts volume after 3 weeks break', () => {
    let state = initializePhaseState('strength', {});
    
    // Simulate some progress
    state.current_phase_stats.sessions_completed = 10;
    
    // Mock last session date to 30 days ago
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    state.current_phase_stats.last_session_completed_at = oldDate.toISOString().split('T')[0];

    // Run Check
    const newState = checkDetraining(state);

    // Should cut by 50% -> 5
    assert.strictEqual(newState.current_phase_stats.sessions_completed, 5);
});

runTest('Detraining: No penalty for short break', () => {
    let state = initializePhaseState('strength', {});
    state.current_phase_stats.sessions_completed = 10;
    
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    state.current_phase_stats.last_session_completed_at = recentDate.toISOString().split('T')[0];

    const newState = checkDetraining(state);
    assert.strictEqual(newState.current_phase_stats.sessions_completed, 10);
});

console.log(`\n🏁 TESTS COMPLETED. Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);