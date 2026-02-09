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
  'cervical_motor_control', 'scapular_stability'
];

function basePool() { return makeCategoryPool(ALL_CATS); }

function weights(inputOverrides) {
  // 1. Budujemy obiekt userData, mapując parametry testowe na strukturę oczekiwaną przez logikę
  const userData = {
    pain_locations: inputOverrides.pain_locations || [],
    medical_diagnosis: inputOverrides.diagnoses || [],
    work_type: inputOverrides.work_type || '',
    hobby: inputOverrides.hobby || '',

    // Mapowanie celów testowych na focus_locations (np. 'focus_glutes' -> 'glutes')
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
  const w = weights({ hobby: 'running' });
  assertApprox(assert, w.core_stability, 2.0, 1e-9, 'core_stability');
  // FIX: Updated expectation to 1.3 (Base 1.0 + 0.3 Boost per US-06)
  assertApprox(assert, w.vmo_activation, 1.3, 1e-9, 'vmo_activation');
});

test('Focus glutes boosts: glute_activation (+1.5), hip_extension (+1.5)', () => {
  const w = weights({ goals: ['focus_glutes'] });
  assertApprox(assert, w.glute_activation, 2.5, 1e-9, 'glute_activation');
  assertApprox(assert, w.hip_extension, 2.5, 1e-9, 'hip_extension');
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

test('Sciatica + low_back retune (v1): spine_mobility=1.6; core_anti_extension mild=2.8 severe=2.5; nerve_flossing boosted', () => {
  const mild = weights({ pain_locations: ['sciatica', 'low_back'], severity: 'mild' });
  const severe = weights({ pain_locations: ['sciatica', 'low_back'], severity: 'severe' });

  assertApprox(assert, mild.spine_mobility, 1.6, 1e-9, 'spine_mobility');
  assertApprox(assert, mild.core_anti_extension, 2.8, 1e-9, 'core_anti_extension mild');
  assertApprox(assert, severe.core_anti_extension, 2.5, 1e-9, 'core_anti_extension severe');

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