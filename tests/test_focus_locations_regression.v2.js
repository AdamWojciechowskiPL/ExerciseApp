'use strict';

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { requireApp, makeCategoryPool } = require('./_test_helpers.v2');

const canonical = requireApp('_wizard-canonical.js');
const plan = requireApp('generate-plan.js');

test('focus_locations canonical keeps only core/glute naming and maps legacy aliases', () => {
    const normalized = canonical.normalizeWizardPayload({
        focus_locations: ['core', 'glute', 'abs', 'glutes', 'hip']
    });

    assert.deepEqual(normalized.focus_locations, ['core', 'glute', 'hip']);
});

test('focus_locations from UI have matching backend scoring branches (no abs/glutes dead paths)', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'netlify/functions/generate-plan.js'), 'utf8');

    assert.equal(source.includes("focusLocs.has('abs')"), false);
    assert.equal(source.includes("focusLocs.has('glutes')"), false);

    const payload = canonical.normalizeWizardPayload({
        focus_locations: ['core', 'glute', 'hip', 'low_back']
    });

    const ctx = plan.safeBuildUserContext(payload);
    const pool = makeCategoryPool(['core_stability', 'core_anti_extension', 'glute_activation', 'hip_extension']);
    const weights = plan.buildDynamicCategoryWeights(pool, payload, ctx);

    assert.ok(weights.core_stability > 1.0);
    assert.ok(weights.glute_activation > 1.0);
    assert.ok(weights.hip_extension > 1.0);
});
