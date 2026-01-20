// tests/test_weighting_logic.js

// --- MOCK ENVIRONMENT VARIABLES (MUST BE BEFORE IMPORTS) ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// --- OPTIONAL DEP STUBS (only if packages are missing) ---
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request) {
  // Stub only if missing in test environment
  if (request === '@neondatabase/serverless') {
    try {
      return originalRequire.apply(this, arguments);
    } catch (e) {
      return {
        Pool: class Pool {
          constructor() {}
          async connect() { throw new Error('Mock Pool.connect called in unit tests'); }
        }
      };
    }
  }

  if (request === 'jwks-rsa') {
    try {
      return originalRequire.apply(this, arguments);
    } catch (e) {
      return function jwksClient() {
        return { getSigningKey: (_kid, cb) => cb(new Error('Mock jwks-rsa')) };
      };
    }
  }

  if (request === 'jsonwebtoken') {
    try {
      return originalRequire.apply(this, arguments);
    } catch (e) {
      return {
        verify: () => { throw new Error('Mock jsonwebtoken.verify called in unit tests'); }
      };
    }
  }

  return originalRequire.apply(this, arguments);
};

console.log('STARTING WEIGHTING LOGIC & TAXONOMY TESTS\n');

let passed = 0;
let failed = 0;

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    console.error(`  ${e && e.message ? e.message : e}`);
    failed++;
  }
}

function approxEqual(actual, expected, eps = 1e-9, msg = '') {
  const ok = Math.abs(actual - expected) <= eps;
  assert.ok(ok, `${msg} expected ~${expected}, got ${actual}`);
}

function approxRatio(actualRatio, expectedRatio, eps = 1e-2, msg = '') {
  const ok = Math.abs(actualRatio - expectedRatio) <= eps;
  assert.ok(ok, `${msg} expected ratio ~${expectedRatio}, got ${actualRatio}`);
}

function loadPlanModule() {
  const primary = path.join(__dirname, '..', 'netlify', 'functions', 'generate-plan.js');
  const fallback = path.join(__dirname, '..', 'generate-plan.js');

  let primaryErr = null;
  try {
    const mod = require(primary);
    return { mod, file: require.resolve(primary) };
  } catch (e) {
    primaryErr = e;
  }

  try {
    const mod = require(fallback);
    return { mod, file: require.resolve(fallback) };
  } catch (e2) {
    // Give the real reason instead of silently failing
    throw new Error(
      `Cannot load generate-plan.js.\n` +
      `Primary (${primary}) error: ${primaryErr && primaryErr.message ? primaryErr.message : primaryErr}\n` +
      `Fallback (${fallback}) error: ${e2 && e2.message ? e2.message : e2}`
    );
  }
}

function mkExercises(categoryIds) {
  return categoryIds.map((c, i) => ({ id: `ex_${i}`, category_id: c }));
}

function mkState() {
  return {
    usedIds: new Set(),
    weeklyUsage: new Map(),
    sessionCategoryUsage: new Map(),
    weeklyCategoryUsage: new Map(),
    // US-05 Updates:
    weeklyFamilyUsage: new Map(),
    sessionFamilyUsage: new Map(),
    anchorFamilies: new Set(),
    anchorTargetExposure: 2
  };
}

const { mod: plan, file: planFile } = loadPlanModule();
const { buildDynamicCategoryWeights, scoreExercise, safeBuildUserContext } = plan;

runTest('Exports are present', () => {
  assert.strictEqual(typeof buildDynamicCategoryWeights, 'function', 'buildDynamicCategoryWeights must be exported');
  assert.strictEqual(typeof scoreExercise, 'function', 'scoreExercise must be exported');
  assert.strictEqual(typeof safeBuildUserContext, 'function', 'safeBuildUserContext must be exported');
});

// --- Static drift guards (do not rely on runtime behavior) ---
const source = fs.readFileSync(planFile, 'utf8');

runTest('Static guard: no deprecated category boost for balance', () => {
  assert.ok(!/boost\(\s*weights\s*,\s*['"]balance['"]\s*,/m.test(source),
    'Found deprecated boost(weights, "balance", ...)');
});

runTest('Static guard: no deprecated category boost for unilateral_leg', () => {
  assert.ok(!/boost\(\s*weights\s*,\s*['"]unilateral_leg['"]\s*,/m.test(source),
    'Found deprecated boost(weights, "unilateral_leg", ...)');
});

runTest('Static guard: no rotation_mobility substring logic', () => {
  assert.ok(!/rotation_mobility/m.test(source), 'Found deprecated rotation_mobility logic');
});

// Mock exercises to initialize all weights we care about (+ drift sentinels)
const mockExercises = mkExercises([
  // New buckets
  'ankle_mobility',
  'balance_proprioception',
  'hip_extension',

  // Drift sentinels (must remain 1.0)
  'balance',
  'unilateral_leg',

  // Existing buckets used by retuning / scoring
  'calves',
  'glute_activation',
  'hip_mobility',
  'terminal_knee_extension',
  'vmo_activation',
  'knee_stability',
  'nerve_flossing',
  'core_anti_extension',
  'core_stability',
  'breathing',
  'spine_mobility',
]);

// --- 1) TAXONOMY + PAIN BOOSTS ---
runTest('Ankle pain boosts: ankle_mobility (+0.8), balance_proprioception (+0.5), calves (+0.6) and does NOT touch balance', () => {
  const userData = { pain_locations: ['ankle'], pain_intensity: 3, daily_impact: 3 };
  const ctx = safeBuildUserContext(userData);
  const weights = buildDynamicCategoryWeights(mockExercises, userData, ctx);

  approxEqual(weights.ankle_mobility, 1.0 + 0.8, 1e-9, 'ankle_mobility');
  approxEqual(weights.balance_proprioception, 1.0 + 0.5, 1e-9, 'balance_proprioception');
  approxEqual(weights.calves, 1.0 + 0.6, 1e-9, 'calves');

  // Drift sentinel
  approxEqual(weights.balance, 1.0, 1e-9, 'balance (sentinel)');
});

runTest('Running boosts core_stability (+1.0) and vmo_activation (+1.0), and does NOT boost unilateral_leg category', () => {
  const userData = { hobby: 'running', pain_intensity: 0, daily_impact: 0 };
  const ctx = safeBuildUserContext(userData);
  const weights = buildDynamicCategoryWeights(mockExercises, userData, ctx);

  approxEqual(weights.core_stability, 1.0 + 1.0, 1e-9, 'core_stability');
  approxEqual(weights.vmo_activation, 1.0 + 1.0, 1e-9, 'vmo_activation');

  // Drift sentinel
  approxEqual(weights.unilateral_leg, 1.0, 1e-9, 'unilateral_leg (sentinel)');
});

runTest('Focus glutes boosts glute_activation (+1.5) and hip_extension (+1.5)', () => {
  const userData = { focus_locations: ['glutes'], pain_intensity: 0, daily_impact: 0 };
  const ctx = safeBuildUserContext(userData);
  const weights = buildDynamicCategoryWeights(mockExercises, userData, ctx);

  approxEqual(weights.glute_activation, 1.0 + 1.5, 1e-9, 'glute_activation');
  approxEqual(weights.hip_extension, 1.0 + 1.5, 1e-9, 'hip_extension');
});

// --- 2) RETUNING LOGIC (MILD vs SEVERE) ---
runTest('Retuning knee pain: glute_activation=+1.5, hip_mobility=+0.2, TKE severe=+1.2 vs mild=+1.5', () => {
  const mild = { pain_locations: ['knee'], pain_intensity: 3, daily_impact: 3 };
  const severe = { pain_locations: ['knee'], pain_intensity: 9, daily_impact: 9 };

  const ctxMild = safeBuildUserContext(mild);
  const ctxSevere = safeBuildUserContext(severe);

  assert.strictEqual(ctxMild.isSevere, false, 'mild ctx should not be severe');
  assert.strictEqual(ctxSevere.isSevere, true, 'severe ctx should be severe');

  const wMild = buildDynamicCategoryWeights(mockExercises, mild, ctxMild);
  const wSev = buildDynamicCategoryWeights(mockExercises, severe, ctxSevere);

  approxEqual(wMild.glute_activation, 2.5, 1e-9, 'glute_activation');
  approxEqual(wMild.hip_mobility, 1.2, 1e-9, 'hip_mobility');

  // Sanity: boosts that are present in code
  approxEqual(wMild.vmo_activation, 3.0, 1e-9, 'vmo_activation');
  approxEqual(wMild.knee_stability, 3.0, 1e-9, 'knee_stability');

  // Conditional TKE
  approxEqual(wMild.terminal_knee_extension, 2.5, 1e-9, 'TKE mild');
  approxEqual(wSev.terminal_knee_extension, 2.2, 1e-9, 'TKE severe');
});

runTest('Retuning sciatica + low_back: nerve_flossing severe=+1.2 vs mild=+2.0 and core_anti_extension severe=+1.7 vs mild=+2.0', () => {
  const mild = { pain_locations: ['sciatica', 'low_back'], pain_intensity: 3, daily_impact: 3 };
  const severe = { pain_locations: ['sciatica', 'low_back'], pain_intensity: 9, daily_impact: 9 };

  const ctxMild = safeBuildUserContext(mild);
  const ctxSevere = safeBuildUserContext(severe);

  const wMild = buildDynamicCategoryWeights(mockExercises, mild, ctxMild);
  const wSev = buildDynamicCategoryWeights(mockExercises, severe, ctxSevere);

  approxEqual(wMild.nerve_flossing, 3.0, 1e-9, 'nerve_flossing mild');
  approxEqual(wSev.nerve_flossing, 2.2, 1e-9, 'nerve_flossing severe');

  approxEqual(wMild.core_anti_extension, 3.0, 1e-9, 'core_anti_extension mild');
  approxEqual(wSev.core_anti_extension, 2.7, 1e-9, 'core_anti_extension severe');
});

// --- 3) ATTRIBUTE-BASED SCORING ---
runTest('Attribute scoring: runner unilateral preference (strength=1.2x, control=1.1x)', () => {
  const userData = { hobby: 'running', pain_intensity: 0, daily_impact: 0 };
  const ctx = safeBuildUserContext(userData);
  const weights = { core_stability: 1.0 };
  const painZoneSet = new Set();
  const state = mkState();

  const exUni = {
    id: 'uni',
    category_id: 'core_stability',
    is_unilateral: true,
    primary_plane: 'sagittal',
    impact_level: 'low',
    position: 'standing',
    knee_load_level: 'low',
    metabolic_intensity: 2,
    difficulty_level: 2,
    pain_relief_zones: [],
  };
  const exBi = { ...exUni, id: 'bi', is_unilateral: false };

  const phaseStrength = { phaseId: 'strength' };
  const sUni = scoreExercise(exUni, 'main', userData, ctx, weights, state, painZoneSet, phaseStrength);
  const sBi = scoreExercise(exBi, 'main', userData, ctx, weights, state, painZoneSet, phaseStrength);
  approxRatio(sUni / sBi, 1.2, 1e-2, 'strength ratio');

  const phaseControl = { phaseId: 'control' };
  const sUniC = scoreExercise(exUni, 'main', userData, ctx, weights, state, painZoneSet, phaseControl);
  const sBiC = scoreExercise(exBi, 'main', userData, ctx, weights, state, painZoneSet, phaseControl);
  approxRatio(sUniC / sBiC, 1.1, 1e-2, 'control ratio');
});

runTest('Attribute scoring: disc_herniation rotation penalty (strength=0.7x, rehab=0.5x)', () => {
  const userData = { medical_diagnosis: ['disc_herniation'], pain_intensity: 0, daily_impact: 0 };
  const ctx = safeBuildUserContext(userData);
  const weights = { core_stability: 1.0 };
  const painZoneSet = new Set();
  const state = mkState();

  const baseEx = {
    category_id: 'core_stability',
    is_unilateral: false,
    impact_level: 'low',
    position: 'standing',
    knee_load_level: 'low',
    metabolic_intensity: 2,
    difficulty_level: 2,
    pain_relief_zones: [],
  };

  const exRot = { ...baseEx, id: 'rot', primary_plane: 'rotation' };
  const exNeu = { ...baseEx, id: 'neu', primary_plane: 'sagittal' };

  const phaseStrength = { phaseId: 'strength' };
  const sRot = scoreExercise(exRot, 'main', userData, ctx, weights, state, painZoneSet, phaseStrength);
  const sNeu = scoreExercise(exNeu, 'main', userData, ctx, weights, state, painZoneSet, phaseStrength);
  approxRatio(sRot / sNeu, 0.7, 1e-2, 'strength ratio');

  const phaseRehab = { phaseId: 'rehab' };
  const sRotR = scoreExercise(exRot, 'main', userData, ctx, weights, state, painZoneSet, phaseRehab);
  const sNeuR = scoreExercise(exNeu, 'main', userData, ctx, weights, state, painZoneSet, phaseRehab);
  approxRatio(sRotR / sNeuR, 0.5, 1e-2, 'rehab ratio');
});

runTest('Attribute scoring (negative): without disc_herniation, rotation is NOT penalized', () => {
  const userData = { medical_diagnosis: [], pain_intensity: 0, daily_impact: 0 };
  const ctx = safeBuildUserContext(userData);
  const weights = { core_stability: 1.0 };
  const painZoneSet = new Set();
  const state = mkState();

  const baseEx = {
    category_id: 'core_stability',
    is_unilateral: false,
    impact_level: 'low',
    position: 'standing',
    knee_load_level: 'low',
    metabolic_intensity: 2,
    difficulty_level: 2,
    pain_relief_zones: [],
  };

  const exRot = { ...baseEx, id: 'rot_no_dx', primary_plane: 'rotation' };
  const exNeu = { ...baseEx, id: 'neu_no_dx', primary_plane: 'sagittal' };

  const phaseStrength = { phaseId: 'strength' };
  const sRot = scoreExercise(exRot, 'main', userData, ctx, weights, state, painZoneSet, phaseStrength);
  const sNeu = scoreExercise(exNeu, 'main', userData, ctx, weights, state, painZoneSet, phaseStrength);

  // Without disc_herniation, rotation penalty must not apply => ratio ~ 1.0
  approxRatio(sRot / sNeu, 1.0, 1e-2, 'strength ratio without disc_herniation');
});


console.log(`\nDONE. Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);