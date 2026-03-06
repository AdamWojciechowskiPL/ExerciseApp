'use strict';

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const clinical = requireApp('_clinical-rule-engine.js');
const canonical = requireApp('_wizard-canonical.js');

test('detectTolerancePattern maps trigger/relief combinations', () => {
    assert.equal(clinical.buildUserContext({ trigger_movements: ['bending_forward'] }).tolerancePattern, 'flexion_intolerant');
    assert.equal(clinical.buildUserContext({ relief_movements: ['bending_forward'] }).tolerancePattern, 'extension_intolerant');
    assert.equal(clinical.buildUserContext({ trigger_movements: ['walking'] }).tolerancePattern, 'neutral');
});

test('severityScore and difficulty cap react to sharp pain', () => {
    const ctx = clinical.buildUserContext({
        pain_intensity: 8,
        daily_impact: 8,
        pain_character: ['sharp'],
        exercise_experience: 'advanced'
    });

    assert.equal(ctx.isSevere, true);
    assert.equal(ctx.difficultyCap, 2);
    assert.ok(ctx.severityScore > 9);
});

test('pain zone mapping normalizes lumbar aliases to low_back for shared behavior', () => {
    const normalized = canonical.normalizeWizardPayload({ pain_locations: ['lumar_general', 'lumbar', 'knee'] });
    assert.deepEqual(normalized.pain_locations, ['lumbar_general', 'low_back', 'knee']);

    const ctxLowBack = clinical.buildUserContext({ pain_locations: ['low_back'] });
    const ctxLumbar = clinical.buildUserContext({ pain_locations: ['lumbar'] });
    const ctxLumbarGeneral = clinical.buildUserContext({ pain_locations: ['lumbar_general'] });

    for (const ctx of [ctxLowBack, ctxLumbar, ctxLumbarGeneral]) {
        assert.equal(ctx.painFilters.has('low_back'), true);
        assert.equal(ctx.painFilters.has('lumbar_general'), true);
        assert.equal(ctx.painZoneSet.has('low_back'), true);
    }
});

test('canonical hobby/equipment/restrictions keep only allowed values', () => {
    const normalized = canonical.normalizeWizardPayload({
        hobby: ['running', 'unknown_hobby'],
        equipment_available: ['Hantle', 'none', 'Mat'],
        physical_restrictions: ['no_kneeling', 'invalid_restriction']
    });

    assert.deepEqual(normalized.hobby, ['running']);
    assert.deepEqual(normalized.equipment_available, ['hantle', 'mata']);
    assert.deepEqual(normalized.physical_restrictions, ['no_kneeling']);
});
