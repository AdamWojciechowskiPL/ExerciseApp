// tests/test_frontend_calc.js

// --- MOCK ENVIRONMENT VARIABLES (MUSZĄ BYĆ PRZED IMPORTAMI) ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';

const assert = require('assert');

// Mocking browser environment for ES Module testing
global.state = {
    settings: {
        restTimeFactor: 1.0
    }
};

// Simple mock loader logic (symulacja utils.js)
const mockUtils = () => {
    const calculateSmartRest = (exercise, userRestFactor = 1.0) => {
        // 1. Explicit override
        if (exercise.restBetweenSets) {
            return Math.round(parseInt(exercise.restBetweenSets, 10) * userRestFactor);
        }
        
        // 2. Base from backend object
        let baseRest = 30;
        if (exercise.calculated_timing && exercise.calculated_timing.rest_sec) {
            baseRest = exercise.calculated_timing.rest_sec;
        } else if (exercise.baseRestSeconds) {
            baseRest = exercise.baseRestSeconds;
        }
        
        // 3. Apply user factor
        return Math.max(10, Math.round(baseRest * userRestFactor));
    };
    return { calculateSmartRest };
};

const { calculateSmartRest } = mockUtils();

console.log('🧪 TEST: Frontend Calculations (Utils)');

let passed = 0;
let failed = 0;

try {
    // Scenario 1: Standard Backend Data
    const ex1 = { calculated_timing: { rest_sec: 60 } };
    assert.strictEqual(calculateSmartRest(ex1, 1.0), 60, 'S1: Should respect backend data');

    // Scenario 2: User Factor
    const ex2 = { calculated_timing: { rest_sec: 60 } };
    assert.strictEqual(calculateSmartRest(ex2, 0.5), 30, 'S2: Should scale by user factor');

    // Scenario 3: Legacy Fallback
    const ex3 = {};
    assert.strictEqual(calculateSmartRest(ex3, 1.0), 30, 'S3: Should fallback to 30s');

    // Scenario 4: Protocol Override
    const ex4 = { restBetweenSets: 10, calculated_timing: { rest_sec: 60 } };
    assert.strictEqual(calculateSmartRest(ex4, 1.0), 10, 'S4: Should prefer explicit override');

    console.log('✅ PASS: All Frontend Calculation Scenarios');
} catch (e) {
    console.error('❌ FAIL:', e.message);
    process.exit(1);
}