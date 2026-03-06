'use strict';

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp, makeCategoryPool } = require('./_test_helpers.v2');

const plan = requireApp('generate-plan.js');
const canonical = requireApp('_wizard-canonical.js');

test('wizard payload contract: running + knee profile boosts expected categories', () => {
    const payload = canonical.normalizeWizardPayload({
        pain_locations: ['knee', 'lumar_general'],
        hobby: ['running', 'bad-value'],
        focus_locations: ['hip'],
        physical_restrictions: ['no_kneeling', 'unknown'],
        pain_intensity: 4,
        daily_impact: 4,
        exercise_experience: 'regular'
    });

    const ctx = plan.safeBuildUserContext(payload);
    const pool = makeCategoryPool(['core_stability', 'vmo_activation', 'glute_activation', 'hip_extension']);
    const weights = plan.buildDynamicCategoryWeights(pool, payload, ctx);

    assert.equal(payload.hobby.includes('bad-value'), false);
    assert.equal(payload.pain_locations.includes('lumbar_general'), true);
    assert.equal(ctx.physicalRestrictions.includes('no_kneeling'), true);

    assert.ok(weights.core_stability > 1.0, 'running should boost core stability');
    assert.ok(weights.vmo_activation > 1.0, 'knee profile should boost vmo');
    assert.ok(weights.hip_extension > 1.0, 'hip focus should boost hip_extension');
});

test('developer debug mode: filter diagnostics include pass/fail reason', () => {
    const exercises = [
        { id: 'ok', impact_level: 'low', position: 'standing', is_foot_loading: false, equipment: ['none'], difficulty_level: 1, primary_plane: 'multi', knee_load_level: 'low', spine_load_level: 'low' },
        { id: 'blocked', impact_level: 'high', position: 'standing', is_foot_loading: true, equipment: ['none'], difficulty_level: 1, primary_plane: 'multi', knee_load_level: 'low', spine_load_level: 'low' }
    ];

    const userData = canonical.normalizeWizardPayload({ physical_restrictions: ['no_high_impact'] });
    const ctx = plan.safeBuildUserContext(userData);
    const fatigueProfile = { fatigueScoreNow: 0, fatigueThresholdFilter: 99, isMonotonyRelevant: false, monotony7d: 0, strain7d: 0, p85_strain_56d: 1, weekLoad7d: 0 };

    const result = plan.filterExerciseCandidates(exercises, userData, ctx, fatigueProfile, {}, { debug: true });

    assert.ok(Array.isArray(result.candidates));
    assert.ok(Array.isArray(result.diagnostics));
    assert.ok(result.diagnostics.some(d => d.passed === true));
    assert.ok(result.diagnostics.some(d => d.id === 'blocked' && d.passed === false && d.reason));
});
