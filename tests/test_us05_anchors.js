// tests/test_us05_anchors.js

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const assert = require('assert');
const path = require('path');

function loadModule(primaryRel, fallbackRel) {
  const primary = path.join(__dirname, '..', primaryRel);
  const fallback = path.join(__dirname, '..', fallbackRel);
  try { return require(primary); } catch (_) { return require(fallback); }
}

const plan = loadModule('netlify/functions/generate-plan.js', 'generate-plan.js');
const { deriveFamilyKey, selectMicrocycleAnchors, scoreExercise } = plan;

console.log('TEST: US-05 Autonomy & Anchors (Anti-Chaos Logic)');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    console.error(`  ${e.message}`);
    failed++;
  }
}

function approx(actual, expected, eps = 0.02, msg = '') {
  assert.ok(Math.abs(actual - expected) <= eps, `${msg} expected ~${expected}, got ${actual}`);
}

function mkState({ anchorFamilies = new Set(), weeklyFamilyUsage = {}, weeklyUsage = {}, sessionFamilyUsage = {}, sessionCategoryUsage = {}, anchorTargetExposure = 2 } = {}) {
  const toMap = (obj) => {
    const m = new Map();
    Object.entries(obj).forEach(([k, v]) => m.set(k, v));
    return m;
  };

  return {
    usedIds: new Set(),
    weeklyUsage: toMap(weeklyUsage),
    weeklyCategoryUsage: new Map(),
    sessionCategoryUsage: toMap(sessionCategoryUsage),

    // US-05 fields
    weeklyFamilyUsage: toMap(weeklyFamilyUsage),
    sessionFamilyUsage: toMap(sessionFamilyUsage),
    anchorFamilies,
    anchorTargetExposure,
  };
}

function baseScore(ex, state, categoryWeights = {}) {
  const weights = Object.keys(categoryWeights).length ? categoryWeights : { [ex.category_id]: 100 };
  return scoreExercise(ex, 'main', {}, {}, weights, state, new Set(), null);
}

// --- MOCK EXERCISES ---
const exSquat = {
  id: 'squat_goblet',
  category_id: 'squat',
  primary_plane: 'sagittal',
  position: 'standing',
  is_unilateral: false,
  difficulty_level: 2,
  metabolic_intensity: 2,
  impact_level: 'low',
  knee_load_level: 'low',
  pain_relief_zones: [],
};

const exLunge = {
  id: 'lunge_back',
  category_id: 'lunge',
  primary_plane: 'sagittal',
  position: 'standing',
  is_unilateral: true,
  difficulty_level: 2,
  metabolic_intensity: 2,
  impact_level: 'low',
  knee_load_level: 'low',
  pain_relief_zones: [],
};

// --- TESTS ---

runTest('1) Family Key derivation is deterministic and matches contract', () => {
  assert.strictEqual(typeof deriveFamilyKey, 'function', 'deriveFamilyKey must exist/export');
  const key = deriveFamilyKey(exSquat);
  assert.strictEqual(key, 'squat|sagittal|standing|bi');
  const keyUni = deriveFamilyKey(exLunge);
  assert.strictEqual(keyUni, 'lunge|sagittal|standing|uni');
});

runTest('2) Anchor Selection prefers higher weighted family and returns targetExposure', () => {
  assert.strictEqual(typeof selectMicrocycleAnchors, 'function', 'selectMicrocycleAnchors must exist/export');

  const candidates = [exSquat, exLunge];
  const categoryWeights = { squat: 2.0, lunge: 1.0 };

  const outDefault = selectMicrocycleAnchors(candidates, {}, {}, categoryWeights, null);
  assert.ok(outDefault.anchorFamilies.has(deriveFamilyKey(exSquat)), 'squat family should be selected as anchor');
  assert.strictEqual(outDefault.targetExposure, 2, 'default targetExposure should be 2');

  // Strength exposure: 3 (w kodzie jest PHASE_IDS.STRENGTH -> 3)
  const outStrength = selectMicrocycleAnchors(candidates, {}, {}, categoryWeights, { phaseId: 'strength' });
  assert.strictEqual(outStrength.targetExposure, 3, 'strength targetExposure should be 3');
});

runTest('3) Non-anchor weekly repetition penalty matches 1/(1+1.5*weeklyUsed)', () => {
  const s0 = mkState();
  const score0 = baseScore(exSquat, s0);

  const s1 = mkState({ weeklyUsage: { [exSquat.id]: 1 } });
  const score1 = baseScore(exSquat, s1);

  // expected multiplier = 1/(1+1.5) = 0.4 -> score1/score0 ~ 0.4
  approx(score1 / score0, 0.4, 0.03, 'non-anchor repeat ratio');
});

runTest('4) Anchor is protected from repetition below targetExposure (no penalty)', () => {
  const fam = deriveFamilyKey(exSquat);

  const s0 = mkState({ anchorFamilies: new Set([fam]), weeklyFamilyUsage: { [fam]: 0 } });
  const score0 = baseScore(exSquat, s0);

  const s1 = mkState({
    anchorFamilies: new Set([fam]),
    weeklyFamilyUsage: { [fam]: 1 },          // below target(2)
    weeklyUsage: { [exSquat.id]: 1 },         // nawet jak ID powtórzone
    anchorTargetExposure: 2
  });
  const score1 = baseScore(exSquat, s1);

  // anchor below target => multiplier ~1.0 -> score1/score0 ~ 1.0
  approx(score1 / score0, 1.0, 0.03, 'anchor protected ratio');
});

runTest('5) Anchor over-exposure penalty matches 1/(1+(usage-target+1)*1.2)', () => {
  const fam = deriveFamilyKey(exSquat);

  const s0 = mkState({ anchorFamilies: new Set([fam]), weeklyFamilyUsage: { [fam]: 0 } });
  const score0 = baseScore(exSquat, s0);

  const usage = 5;
  const target = 2;
  const expected = 1 / (1 + (usage - target + 1) * 1.2); // 1/5.8 ~ 0.1724

  const s1 = mkState({
    anchorFamilies: new Set([fam]),
    weeklyFamilyUsage: { [fam]: usage },
    weeklyUsage: { [exSquat.id]: usage },
    anchorTargetExposure: target
  });
  const score1 = baseScore(exSquat, s1);

  approx(score1 / score0, expected, 0.03, 'anchor over-exposure ratio');
});

runTest('6) Same family in the same session is almost hard-blocked (x0.1)', () => {
  const fam = deriveFamilyKey(exSquat);

  const s0 = mkState();
  const score0 = baseScore(exSquat, s0);

  const sDup = mkState({
    sessionFamilyUsage: { [fam]: 1 }, // already used this family in session
    sessionCategoryUsage: { [exSquat.category_id]: 0 }
  });
  const scoreDup = baseScore(exSquat, sDup);

  approx(scoreDup / score0, 0.1, 0.02, 'session family duplicate penalty ratio');
});

console.log(`\nDONE. Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
