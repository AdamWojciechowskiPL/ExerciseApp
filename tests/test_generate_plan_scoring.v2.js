// ExerciseApp/tests/test_generate_plan_scoring.v2.js
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

// Helper do wywoływania scoreExercise z poprawną sygnaturą (uwzględniającą ctx)
function getScore(ex, weights, userData = {}, phaseCtx = null, preferencesMap = {}) {
  // 1. Zbuduj stan dummy
  const state = {
    usedIds: new Set(),
    weeklyUsage: new Map(),
    sessionCategoryUsage: new Map(),
    weeklyFamilyUsage: new Map(),
    sessionFamilyUsage: new Map(),
    anchorFamilies: new Set(),
    anchorTargetExposure: 2,
    preferencesMap
  };

  // 2. Zbuduj kontekst kliniczny (US-11 requirement)
  // safeBuildUserContext jest eksportowane z generate-plan.js
  const ctx = plan.safeBuildUserContext(userData);

  const painZoneSet = new Set(); // uproszczenie dla testów scoringu (chyba że testujemy pain relief)

  // 3. Wywołanie z poprawną kolejnością argumentów:
  // (ex, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext, fatigueProfile)
  return plan.scoreExercise(
    ex, 
    'main', 
    userData, 
    ctx, 
    weights, 
    state, 
    painZoneSet, 
    phaseCtx, 
    null // fatigueProfile (opcjonalny w tym teście)
  );
}

test('Scoring: runner preference boosts strength/control (relative checks)', () => {
  const userData = { hobby: ['running','gym'] };
  
  // Weights (Base score 1.0)
  const weights = { 
    'core_stability': 1.0, 
    'hip_extension': 1.0 
  };

  const exUni = makeExercise({
    id: 'uni',
    category_id: 'hip_extension',
    is_unilateral: true
  });
  
  const exBi = makeExercise({
    id: 'bi',
    category_id: 'hip_extension',
    is_unilateral: false
  });

  // Check Strength Phase
  const sUni = getScore(exUni, weights, userData, { phaseId: 'strength' });
  const sBi = getScore(exBi, weights, userData, { phaseId: 'strength' });
  
  // Runner + Unilateral in Strength phase gets 1.2x boost
  assert.ok(sUni > sBi, `Unilateral (${sUni}) should be higher than Bilateral (${sBi}) for runner`);
  assert.ok(Math.abs(sUni / sBi - 1.2) < 0.05, 'Should apply ~1.2x multiplier');
});

test('Scoring: disc_herniation penalizes rotation (relative checks)', () => {
  const userData = { medical_diagnosis: ['disc_herniation'] };
  const weights = { 'core_stability': 1.0 };

  const exRot = makeExercise({ 
    category_id: 'core_stability', 
    primary_plane: 'rotation' 
  });
  
  const exNeu = makeExercise({ 
    category_id: 'core_stability', 
    primary_plane: 'sagittal' 
  });

  const sRot = getScore(exRot, weights, userData, { phaseId: 'strength' });
  const sNeu = getScore(exNeu, weights, userData, { phaseId: 'strength' });

  // Rotation should be penalized (0.7 in strength phase)
  assert.ok(sRot < sNeu, 'Rotation should be penalized for disc herniation');
  assert.ok(Math.abs(sRot / sNeu - 0.7) < 0.05, `Expected ~0.7 ratio, got ${sRot/sNeu}`);
});

test('Variety: repeated family in session is heavily penalized (non-anchor)', () => {
  const ex = makeExercise({ 
    id: 'sq1', 
    category_id: 'knee_stability', 
    primary_plane: 'sagittal', 
    position: 'standing', 
    is_unilateral: false 
  });
  
  const famKey = plan.deriveFamilyKey(ex);
  const weights = { 'knee_stability': 100 };

  // Manual state setup to simulate session usage
  const state = {
    usedIds: new Set(),
    weeklyUsage: new Map(),
    sessionCategoryUsage: new Map(),
    weeklyFamilyUsage: new Map(),
    sessionFamilyUsage: new Map(),
    anchorFamilies: new Set(),
    anchorTargetExposure: 2,
    preferencesMap: {}
  };
  
  // Simulate that this family was ALREADY used in this session
  state.sessionFamilyUsage.set(famKey, 1);

  // Call raw function to inject specific state
  const ctx = plan.safeBuildUserContext({});
  const score = plan.scoreExercise(ex, 'main', {}, ctx, weights, state, new Set(), null, null);

  // Expect drastic penalty (factor 0.1) -> 100 * 0.1 = 10
  assert.ok(score < 20, `Score should be crushed for session duplicate (got ${score})`);
});

test('Difficulty rating soft-adjust: hard lowers score, easy mildly raises score', () => {
  const ex = makeExercise({ id: 'pref-ex', category_id: 'core_stability' });
  const weights = { core_stability: 1.0 };

  const neutral = getScore(ex, weights, {}, null, { 'pref-ex': { score: 20, difficultyRating: 0 } });
  const hard = getScore(ex, weights, {}, null, { 'pref-ex': { score: 20, difficultyRating: 1 } });
  const easy = getScore(ex, weights, {}, null, { 'pref-ex': { score: 20, difficultyRating: -1 } });

  assert.ok(hard < neutral, `Hard difficulty flag should reduce score (${hard} < ${neutral})`);
  assert.ok(easy > neutral, `Easy difficulty flag should modestly increase score (${easy} > ${neutral})`);
});

test('Difficulty rating does not bypass phase safety filters', () => {
  const ex = makeExercise({ id: 'blocked-by-phase', category_id: 'core_stability', difficulty_level: 5 });
  const weights = { core_stability: 2.0 };
  const phaseCtx = { config: { forbidden: { maxDifficulty: 3 } } };
  const score = getScore(ex, weights, {}, phaseCtx, { 'blocked-by-phase': { score: 40, difficultyRating: -1 } });
  assert.equal(score, 0);
});


test('Component flags: stability changes top-k, breathing changes weights', () => {
  const exercisePool = [
    makeExercise({ id: 'cond', category_id: 'conditioning_low_impact' }),
    makeExercise({ id: 'breath', category_id: 'breathing' }),
    makeExercise({ id: 'core-stab', category_id: 'core_stability' }),
    makeExercise({ id: 'scap-stab', category_id: 'scapular_stability' })
  ];

  const baseUser = { pain_locations: [], focus_locations: [], medical_diagnosis: [] };
  const baseCtx = plan.safeBuildUserContext(baseUser);

  const baseWeights = plan.buildDynamicCategoryWeights(exercisePool, { ...baseUser, session_component_weights: [] }, baseCtx);
  const stabilityWeights = plan.buildDynamicCategoryWeights(exercisePool, { ...baseUser, session_component_weights: ['stability'] }, baseCtx);
  const breathingWeights = plan.buildDynamicCategoryWeights(exercisePool, { ...baseUser, session_component_weights: ['breathing'] }, baseCtx);

  const rank = (weights) => exercisePool
    .map((ex) => ({ id: ex.id, score: getScore(ex, weights, baseUser) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.id);

  const topBase = rank(baseWeights).slice(0, 2);
  const topStability = rank(stabilityWeights).slice(0, 2);
  const baseCore = getScore(exercisePool[2], baseWeights, baseUser);
  const stabilityCore = getScore(exercisePool[2], stabilityWeights, baseUser);
  assert.ok(stabilityCore > baseCore, 'stability flag should increase stability candidates score');
  assert.notDeepEqual(topBase, topStability, 'stability flag should affect top-k order');
  assert.ok(breathingWeights.breathing > baseWeights.breathing, 'breathing flag should raise breathing category weight');
});
