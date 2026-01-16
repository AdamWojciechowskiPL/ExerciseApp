// tests/test_pacing_engine.js

// --- MOCK ENVIRONMENT VARIABLES (MUSZĄ BYĆ PRZED IMPORTAMI) ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';

const assert = require('assert');
const { calculateTiming } = require('../netlify/functions/_pacing-engine.js');

console.log('🧪 TEST: Pacing Engine (Backend Module)');

const tests = [
    {
        name: 'Should return 35s rest for Neuro/Flossing',
        input: { category_id: 'nerve_flossing' },
        expect: { rest: 35 }
    },
    {
        name: 'Should return 60s rest for Strength/Squat',
        input: { category_id: 'strength', difficulty_level: 4 },
        expect: { rest: 60 }
    },
    {
        name: 'Should return 45s rest for Core Stability',
        input: { category_id: 'core_stability' },
        expect: { rest: 45 }
    },
    {
        name: 'Should return 20s rest for Mobility/Stretch',
        input: { category_id: 'hip_mobility' },
        expect: { rest: 20 }
    },
    {
        name: 'Should default to 30s rest',
        input: { category_id: 'unknown_category' },
        expect: { rest: 30 }
    },
    {
        name: 'Should return 12s transition for Unilateral',
        input: { is_unilateral: true },
        expect: { trans: 12 }
    },
    {
        name: 'Should return 5s transition for Bilateral',
        input: { is_unilateral: false },
        expect: { trans: 5 }
    }
];

let passed = 0;
let failed = 0;

tests.forEach(t => {
    try {
        const result = calculateTiming(t.input);
        if (t.expect.rest !== undefined) {
            assert.strictEqual(result.rest_sec, t.expect.rest);
        }
        if (t.expect.trans !== undefined) {
            assert.strictEqual(result.transition_sec, t.expect.trans);
        }
        console.log(`✅ PASS: ${t.name}`);
        passed++;
    } catch (e) {
        console.error(`❌ FAIL: ${t.name} (Expected ${JSON.stringify(t.expect)}, got ${JSON.stringify(calculateTiming(t.input))})`);
        failed++;
    }
});

console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
if (failed > 0) process.exit(1);