// ExerciseApp/tests/test_weighting_logic.v2.js
'use strict';

// --- MOCK ENVIRONMENT VARIABLES (MUST BE BEFORE IMPORTS) ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp, assertApprox, makeCategoryPool } = require('./_test_helpers.v2');

const plan = requireApp('generate-plan.js');

const ALL_CATS = [
  'ankle_mobility', 'balance_proprioception', 'calves',
  'core_stability', 'vmo_activation', 'knee_stability', 'glute_activation',
  'terminal_knee_extension', 'conditioning_low_impact',
  'spine_mobility', 'thoracic_mobility', 'core_anti_extension',
  'nerve_flossing', 'hip_extension', 'hip_flexor_stretch',
  'cervical_motor_control', 'scapular_stability',
  'core_anti_rotation', 'breathing', 'breathing_control', 'muscle_relaxation'
];

function basePool() { return makeCategoryPool(ALL_CATS); }

function weights(inputOverrides) {
  // 1. Budujemy obiekt userData, mapując parametry testowe na strukturę oczekiwaną przez logikę
  const userData = {
    pain_locations: inputOverrides.pain_locations || [],
    medical_diagnosis: inputOverrides.diagnoses || [],
    work_type: inputOverrides.work_type || '',
    hobby: inputOverrides.hobby || [],

    // Mapowanie celów testowych na focus_locations
    focus_locations: (inputOverrides.goals || []).map(g => g.replace('focus_', '')),

    // Ustawienie parametrów bólu dla flagi isSevere
    pain_intensity: inputOverrides.severity === 'severe' ? 8 : 3,
    daily_impact: inputOverrides.severity === 'severe' ? 8 : 3,

    // Domyślne puste tablice dla reszty
    physical_restrictions: [],
    session_component_weights: [],
    equipment_available: []
  };

  // 2. Generujemy Context na podstawie userData
  const ctx = plan.safeBuildUserContext(userData);

  // 3. Wywołujemy funkcję z poprawną sygnaturą (3 argumenty)
  return plan.buildDynamicCategoryWeights(basePool(), userData, ctx);
}

test('Ankle pain boosts: ankle_mobility (+0.8), balance_proprioception (+0.5), calves (+0.6)', () => {
  const w = weights({ pain_locations: ['ankle'] });
  assertApprox(assert, w.ankle_mobility, 1.8, 1e-9, 'ankle_mobility');
  assertApprox(assert, w.balance_proprioception, 1.5, 1e-9, 'balance_proprioception');
  assertApprox(assert, w.calves, 1.6, 1e-9, 'calves');
});

test('Running boosts: core_stability (+1.0), vmo_activation (+0.3)', () => {
  const w = weights({ hobby: ['running', 'cycling'] });
  assertApprox(assert, w.core_stability, 2.0, 1e-9, 'core_stability');
  // FIX: Updated expectation to 1.3 (Base 1.0 + 0.3 Boost per US-06)
  assertApprox(assert, w.vmo_activation, 1.3, 1e-9, 'vmo_activation');
  assertApprox(assert, w.thoracic_mobility, 1.8, 1e-9, 'thoracic_mobility from cycling');
});

test('Focus hip boosts: glute_activation (+1.1), hip_extension (+1.3)', () => {
  const w = weights({ goals: ['focus_hip'] });
  assertApprox(assert, w.glute_activation, 2.1, 1e-9, 'glute_activation');
  assertApprox(assert, w.hip_extension, 2.3, 1e-9, 'hip_extension');
});

test('Knee pain retune (v1): mild vs severe', () => {
  const mild = weights({ pain_locations: ['knee'], severity: 'mild' });
  const severe = weights({ pain_locations: ['knee'], severity: 'severe' });

  assertApprox(assert, mild.vmo_activation, 2.0, 1e-9, 'mild vmo');
  assertApprox(assert, mild.knee_stability, 3.2, 1e-9, 'mild knee_stability');
  assertApprox(assert, mild.glute_activation, 3.0, 1e-9, 'mild glute');
  assertApprox(assert, mild.terminal_knee_extension, 2.3, 1e-9, 'mild TKE');
  assertApprox(assert, mild.conditioning_low_impact, 0.90, 1e-9, 'mild conditioning');

  assertApprox(assert, severe.terminal_knee_extension, 2.1, 1e-9, 'severe TKE');
  // FIX: Updated expectation to 0.70 (Base 1.0 * 0.70 per US-06)
  assertApprox(assert, severe.conditioning_low_impact, 0.70, 1e-9, 'severe conditioning');
});

test('Sciatica + low_back: lumbar location alone does not auto-bias anti-extension; nerve_flossing still boosted', () => {
  const mild = weights({ pain_locations: ['sciatica', 'low_back'], severity: 'mild' });
  const severe = weights({ pain_locations: ['sciatica', 'low_back'], severity: 'severe' });

  assertApprox(assert, mild.spine_mobility, 1.6, 1e-9, 'spine_mobility');
  assertApprox(assert, mild.core_anti_extension, 1.0, 1e-9, 'core_anti_extension mild (no directional bias)');
  assertApprox(assert, severe.core_anti_extension, 1.0, 1e-9, 'core_anti_extension severe (no directional bias)');

  // Nerve flossing boost logic (Base 1.0 + 2.0 for mild = 3.0)
  assertApprox(assert, mild.nerve_flossing, 3.0, 1e-9, 'nerve_flossing mild (boosted)');
});

test('Diagnosis: chondromalacia adds vmo_activation (+0.3) and conditioning multiplier 0.90', () => {
  const w = weights({ diagnoses: ['chondromalacia'], severity: 'mild' });
  assertApprox(assert, w.vmo_activation, 1.3, 1e-9, 'vmo');
  assertApprox(assert, w.conditioning_low_impact, 0.90, 1e-9, 'conditioning');
});

test('3A: neck pain boosts cervical_motor_control (+1.5) and scapular_stability (+1.3)', () => {
  const w = weights({ pain_locations: ['neck'] });
  // Updated from old values to US-06 spec
  assertApprox(assert, w.cervical_motor_control, 2.5, 1e-9, 'cervical_motor_control');
  assertApprox(assert, w.scapular_stability, 2.3, 1e-9, 'scapular_stability');
  assertApprox(assert, w.thoracic_mobility, 1.8, 1e-9, 'thoracic_mobility');
});

test('Work type: sedentary -> thoracic_mobility (+0.7), hip_flexor_stretch (+0.5)', () => {
  const w = weights({ work_type: 'sedentary' });
  assertApprox(assert, w.thoracic_mobility, 1.7, 1e-9, 'thoracic_mobility');
  assertApprox(assert, w.hip_flexor_stretch, 1.5, 1e-9, 'hip_flexor_stretch');
});

test('Work type: standing -> spine_mobility (+0.4), calves (+0.4)', () => {
  const w = weights({ work_type: 'standing' });
  assertApprox(assert, w.spine_mobility, 1.4, 1e-9, 'spine_mobility');
  assertApprox(assert, w.calves, 1.4, 1e-9, 'calves');
});

test('Lumbar aliases map to wspólne zachowanie scoringu (low_back/lumbar/lumbar_general)', () => {
  const low = weights({ pain_locations: ['low_back'], severity: 'mild' });
  const lumbar = weights({ pain_locations: ['lumbar'], severity: 'mild' });
  const lumbarGeneral = weights({ pain_locations: ['lumbar_general'], severity: 'mild' });

  assertApprox(assert, low.spine_mobility, lumbar.spine_mobility, 1e-9, 'low_back vs lumbar spine_mobility');
  assertApprox(assert, low.spine_mobility, lumbarGeneral.spine_mobility, 1e-9, 'low_back vs lumbar_general spine_mobility');
  assertApprox(assert, low.core_anti_extension, lumbar.core_anti_extension, 1e-9, 'low_back vs lumbar core_anti_extension');
  assertApprox(assert, low.core_anti_extension, lumbarGeneral.core_anti_extension, 1e-9, 'low_back vs lumbar_general core_anti_extension');
});

test('Focus canonical: core i glute mają aktywne boosty scoringu', () => {
  const core = weights({ goals: ['focus_core'] });
  const glute = weights({ goals: ['focus_glute'] });

  assertApprox(assert, core.core_stability, 2.2, 1e-9, 'core core_stability');
  assertApprox(assert, core.core_anti_extension, 2.0, 1e-9, 'core core_anti_extension');
  assertApprox(assert, glute.glute_activation, 2.1, 1e-9, 'glute activation');
  assertApprox(assert, glute.hip_extension, 2.3, 1e-9, 'glute hip extension');
});


test('Component weights: stability boosts stability categories', () => {
  const ws = plan.buildDynamicCategoryWeights(basePool(), {
    pain_locations: [],
    medical_diagnosis: [],
    work_type: '',
    hobby: [],
    focus_locations: [],
    pain_intensity: 0,
    daily_impact: 0,
    physical_restrictions: [],
    session_component_weights: ['stability'],
    equipment_available: []
  }, plan.safeBuildUserContext({}));

  assertApprox(assert, ws.core_stability, 2.0, 1e-9, 'stability core_stability');
  assertApprox(assert, ws.core_anti_rotation, 1.9, 1e-9, 'stability core_anti_rotation');
  assertApprox(assert, ws.core_anti_extension, 1.9, 1e-9, 'stability core_anti_extension');
  assertApprox(assert, ws.scapular_stability, 1.8, 1e-9, 'stability scapular_stability');
  assertApprox(assert, ws.knee_stability, 1.8, 1e-9, 'stability knee_stability');
});

test('Component weights: breathing boosts breathing categories', () => {
  const ws = plan.buildDynamicCategoryWeights(basePool(), {
    pain_locations: [],
    medical_diagnosis: [],
    work_type: '',
    hobby: [],
    focus_locations: [],
    pain_intensity: 0,
    daily_impact: 0,
    physical_restrictions: [],
    session_component_weights: ['breathing'],
    equipment_available: []
  }, plan.safeBuildUserContext({}));

  assertApprox(assert, ws.breathing, 2.0, 1e-9, 'breathing breathing');
  assertApprox(assert, ws.breathing_control, 2.0, 1e-9, 'breathing breathing_control');
  assertApprox(assert, ws.muscle_relaxation, 1.8, 1e-9, 'breathing muscle_relaxation');
});

test('Diagnosis label parity: disc_herniation vs spondylolisthesis without directional data', () => {
  const herniation = weights({ diagnoses: ['disc_herniation'] });
  const spondy = weights({ diagnoses: ['spondylolisthesis'] });
  assertApprox(assert, herniation.core_anti_extension, spondy.core_anti_extension, 1e-9, 'diagnosis-only parity');
});

test('Directional pattern drives anti-extension: extension intolerance does not boost', () => {
  const exIntolerantData = {
    pain_locations: [],
    medical_diagnosis: ['disc_herniation'],
    trigger_movements: ['bending_backward'],
    relief_movements: [],
    pain_intensity: 3,
    daily_impact: 3,
    session_component_weights: []
  };
  const flexIntolerantData = {
    pain_locations: [],
    medical_diagnosis: ['disc_herniation'],
    trigger_movements: ['bending_forward'],
    relief_movements: [],
    pain_intensity: 3,
    daily_impact: 3,
    session_component_weights: []
  };

  const wExt = plan.buildDynamicCategoryWeights(basePool(), exIntolerantData, plan.safeBuildUserContext(exIntolerantData));
  const wFlex = plan.buildDynamicCategoryWeights(basePool(), flexIntolerantData, plan.safeBuildUserContext(flexIntolerantData));

  assertApprox(assert, wExt.core_anti_extension, 0.85, 1e-9, 'extension intolerant anti-extension penalty');
  assertApprox(assert, wFlex.core_anti_extension, 1.6, 1e-9, 'flexion intolerant anti-extension boost');
});


test('Confirmed directional negatives and worsening trend strengthen flexion-intolerant anti-extension preference', () => {
  const data = {
    pain_locations: ['lumbar_general'],
    medical_diagnosis: [],
    trigger_movements: ['bending_forward'],
    relief_movements: [],
    symptom_trend: 'worsening',
    directional_negative_24h_count: 2,
    symptom_onset: 'sudden',
    symptom_duration: 'lt_6_weeks',
    pain_intensity: 3,
    daily_impact: 3,
    session_component_weights: []
  };

  const w = plan.buildDynamicCategoryWeights(basePool(), data, plan.safeBuildUserContext(data));
  assertApprox(assert, w.core_anti_extension, 2.25, 1e-9, 'flexion intolerance + 24h + worsening + acute guard');
});

test('Safety-only knee diagnoses do not change category weights', () => {
  const baseline = weights({});
  const safetyOnlyDiagnoses = ['meniscus_tear', 'acl_rehab', 'mcl_rehab', 'lcl_rehab', 'jumpers_knee'];

  for (const diagnosis of safetyOnlyDiagnoses) {
    const variant = weights({ diagnoses: [diagnosis] });
    assertApprox(assert, variant.knee_stability, baseline.knee_stability, 1e-9, `${diagnosis} knee_stability should be safety-only`);
    assertApprox(assert, variant.vmo_activation, baseline.vmo_activation, 1e-9, `${diagnosis} vmo_activation should be safety-only`);
    assertApprox(assert, variant.glute_activation, baseline.glute_activation, 1e-9, `${diagnosis} glute_activation should be safety-only`);
  }
});

test('Weighted knee diagnoses still affect category weights', () => {
  const baseline = weights({});

  for (const diagnosis of ['chondromalacia', 'knee_oa']) {
    const weighted = weights({ diagnoses: [diagnosis] });
    assert.ok(weighted.vmo_activation > baseline.vmo_activation, `${diagnosis} should boost vmo_activation`);
    assert.ok(weighted.glute_activation > baseline.glute_activation, `${diagnosis} should boost glute_activation`);
  }
});


test('Spondylolisthesis with worsening trend still needs directional signal for anti-extension bias', () => {
  const data = {
    pain_locations: [],
    medical_diagnosis: ['spondylolisthesis'],
    symptom_trend: 'worsening',
    pain_intensity: 3,
    daily_impact: 3,
    session_component_weights: []
  };
  const w = plan.buildDynamicCategoryWeights(basePool(), data, plan.safeBuildUserContext(data));
  assertApprox(assert, w.core_anti_extension, 1.0, 1e-9, 'no diagnosis-only anti-extension boost');
});
