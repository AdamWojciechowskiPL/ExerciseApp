// tests/test_data_structure.js

// --- MOCK ENVIRONMENT VARIABLES (MUSZĄ BYĆ PRZED IMPORTAMI) ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';

const assert = require('assert');
const { normalizeExerciseRow } = require('../netlify/functions/generate-plan.js');

console.log('🧪 TEST: Data Structure Integration (Generate Plan)');

const rawRow = {
    id: 'test_ex',
    name: 'Test Exercise',
    category_id: 'nerve_flossing', // Zmieniono na istniejącą kategorię dla pewności testu
    difficulty_level: 1,
    is_unilateral: false
};

try {
    const normalized = normalizeExerciseRow(rawRow);

    assert.ok(normalized.calculated_timing, 'Property calculated_timing missing');
    assert.strictEqual(typeof normalized.calculated_timing.rest_sec, 'number', 'rest_sec is not a number');
    assert.strictEqual(typeof normalized.calculated_timing.transition_sec, 'number', 'transition_sec is not a number');

    // Neuro = 35s (zgodnie z logiką _pacing-engine.js)
    assert.strictEqual(normalized.calculated_timing.rest_sec, 35, `Incorrect logic integration (expected 35s for nerve_flossing, got ${normalized.calculated_timing.rest_sec}s)`);

    console.log('✅ PASS: Data Structure Integration Check');
} catch (e) {
    console.error('❌ FAIL:', e.message);
    process.exit(1);
}