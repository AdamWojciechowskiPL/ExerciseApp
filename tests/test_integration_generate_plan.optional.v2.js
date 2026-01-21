// ExerciseApp/tests/test_integration_generate_plan.optional.v2.js
'use strict';

// --- MOCK ENVIRONMENT VARIABLES ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev'; // Important for bypass

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

// 1. Import _auth-helper explicitly to patch the pool
const authHelper = requireApp('netlify/functions/_auth-helper.js');

// 2. Mock Data
const MOCK_EXERCISES = [
    { id: 'ex1', name: 'Squat', category_id: 'strength', difficulty_level: 1, impact_level: 'low', position: 'standing', is_foot_loading: true, is_unilateral: false },
    { id: 'ex2', name: 'Plank', category_id: 'core_stability', difficulty_level: 1, impact_level: 'low', position: 'prone', is_foot_loading: false, is_unilateral: false },
    { id: 'ex3', name: 'Lunge', category_id: 'strength', difficulty_level: 1, impact_level: 'low', position: 'standing', is_foot_loading: true, is_unilateral: true },
    { id: 'ex4', name: 'Bird Dog', category_id: 'core_stability', difficulty_level: 1, impact_level: 'low', position: 'quadruped', is_foot_loading: false, is_unilateral: true },
    { id: 'ex5', name: 'Glute Bridge', category_id: 'glute_activation', difficulty_level: 1, impact_level: 'low', position: 'supine', is_foot_loading: true, is_unilateral: false },
    { id: 'ex6', name: 'Cat Cow', category_id: 'spine_mobility', difficulty_level: 1, impact_level: 'low', position: 'quadruped', is_foot_loading: false, is_unilateral: false }
];

// 3. Patch pool.connect to return our Mock Client
authHelper.pool.connect = async () => {
    return {
        query: async (sql, params) => {
            const sqlLower = sql.toLowerCase();
            
            // A. Exercises (Essential for generation)
            if (sqlLower.includes('from exercises')) {
                return { rows: MOCK_EXERCISES };
            }
            
            // B. User Settings (Return empty or valid structure)
            if (sqlLower.includes('from user_settings')) {
                // Return default settings if reading
                if (sqlLower.includes('select')) {
                    return { rows: [{ settings: { phase_manager: null } }] };
                }
                // Return success if writing (INSERT/UPDATE)
                return { rowCount: 1, rows: [] };
            }

            // C. Stats / History / Blacklist / Overrides (Return empty arrays)
            if (sqlLower.includes('training_sessions') || 
                sqlLower.includes('user_exercise_blacklist') || 
                sqlLower.includes('user_exercise_preferences') ||
                sqlLower.includes('user_exercise_stats') ||
                sqlLower.includes('user_plan_overrides')) {
                return { rows: [] };
            }

            // Fallback
            return { rows: [] };
        },
        release: () => {}
    };
};

// 4. Import the handler AFTER patching
const handlerModule = requireApp('netlify/functions/generate-plan.js');

test('integration: handler returns plan-like payload for minimal request', async () => {
  const body = {
    primary_goal: 'strength',
    pain_intensity: 2,
    schedule_pattern: [1, 3, 5],
    exercise_experience: 'beginner'
  };

  const event = {
    httpMethod: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-user-id': 'integration-test-user' // Auth Bypass
    },
    body: JSON.stringify(body)
  };

  try {
    const res = await handlerModule.handler(event);

    if (res.statusCode !== 200) {
        console.error("Handler Error Response:", res.body);
    }

    assert.equal(res.statusCode, 200, 'Should return 200 OK');
    
    const json = JSON.parse(res.body);
    assert.ok(json.plan, 'Response should contain plan object');
    assert.ok(json.plan.days.length > 0, 'Plan should have days');
    assert.ok(json.phaseContext, 'Response should contain phaseContext');
    assert.equal(json.phaseContext.phaseId, 'control', 'Default phase should be control');

  } catch (e) {
    console.error(e);
    assert.fail(`Integration test threw error: ${e.message}`);
  }
});