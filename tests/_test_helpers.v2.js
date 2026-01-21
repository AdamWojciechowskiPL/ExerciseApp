'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveAppModule(relPathFromNetlifyFunctions, repoRoot = path.resolve(__dirname, '..')) {
  const candidates = [
    path.resolve(repoRoot, 'netlify', 'functions', relPathFromNetlifyFunctions),
    path.resolve(repoRoot, 'src', 'netlify', 'functions', relPathFromNetlifyFunctions),
    path.resolve(repoRoot, relPathFromNetlifyFunctions),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  const err = new Error(
    `Cannot resolve app module "${relPathFromNetlifyFunctions}". Tried:\n- ${candidates.join('\n- ')}`
  );
  err.code = 'APP_MODULE_NOT_FOUND';
  throw err;
}

function requireApp(relPathFromNetlifyFunctions) {
  const p = resolveAppModule(relPathFromNetlifyFunctions);
  return require(p);
}

function tryRequireApp(relPathFromNetlifyFunctions) {
  try {
    return { ok: true, mod: requireApp(relPathFromNetlifyFunctions) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function approxEqual(actual, expected, eps = 1e-9) {
  if (Number.isNaN(actual) || Number.isNaN(expected)) return false;
  return Math.abs(actual - expected) <= eps;
}

function assertApprox(assert, actual, expected, eps = 1e-9, msg = '') {
  assert.ok(
    approxEqual(actual, expected, eps),
    `${msg} expected ~${expected}, got ${actual}`
  );
}

function makeExercise(overrides = {}) {
  return {
    id: overrides.id ?? 'ex1',
    name: overrides.name ?? 'Test Exercise',
    category_id: overrides.category_id ?? 'core_stability',
    difficulty_level: overrides.difficulty_level ?? 2,
    goal_tags: overrides.goal_tags ?? ['stability'],
    pain_relief_zones: overrides.pain_relief_zones ?? [],
    tolerance_tags: overrides.tolerance_tags ?? [],
    primary_plane: overrides.primary_plane ?? 'multi',
    position: overrides.position ?? 'standing',
    spine_load_level: overrides.spine_load_level ?? 'low',
    knee_load_level: overrides.knee_load_level ?? 'low',
    impact_level: overrides.impact_level ?? 'no_impact',
    is_unilateral: overrides.is_unilateral ?? false,
    requires_side_switch: overrides.requires_side_switch ?? false,
    is_foot_loading: overrides.is_foot_loading ?? false,
    conditioning_style: overrides.conditioning_style ?? 'none',
    recommended_interval_sec: overrides.recommended_interval_sec ?? null,
    // US-11 columns (may be NULL)
    knee_flexion_max_deg: overrides.knee_flexion_max_deg ?? null,
    spine_motion_profile: overrides.spine_motion_profile ?? null,
    overhead_required: overrides.overhead_required ?? null,
    default_tempo: overrides.default_tempo ?? '3-1-1: Kontroluj ruch.',
    equipment: overrides.equipment ?? ['none'],
    attributes: overrides.attributes ?? undefined,
  };
}

function makeCategoryPool(categoryIds) {
  return categoryIds.map((cat, i) =>
    makeExercise({
      id: `cat_${i}_${cat}`,
      name: `Exercise ${cat}`,
      category_id: cat,
      position: 'standing',
      impact_level: 'no_impact',
      is_foot_loading: false,
    })
  );
}

module.exports = {
  requireApp,
  tryRequireApp,
  resolveAppModule,
  assertApprox,
  makeExercise,
  makeCategoryPool,
};
