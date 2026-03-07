'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAppModule } = require('./_test_helpers.v2.js');

function stubModule(relPath, exportsObj) {
  const resolved = resolveAppModule(relPath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObj,
  };
  return resolved;
}

test('difficulty selection mapping easy/hard/reset -> payload ratings', async () => {
  const mod = await import('../shared/exercise-difficulty-rating.mjs');

  assert.equal(mod.mapDifficultySelectionToRating('easy'), -1);
  assert.equal(mod.mapDifficultySelectionToRating('hard'), 1);
  assert.equal(mod.mapDifficultySelectionToRating(null), 0);

  const payload = mod.buildExerciseDifficultyRatingsPayload({
    exEasy: mod.mapDifficultySelectionToRating('easy'),
    exHard: mod.mapDifficultySelectionToRating('hard'),
    exReset: mod.mapDifficultySelectionToRating(null),
    exBad: 7,
  });

  assert.deepEqual(payload, [
    { exerciseId: 'exEasy', difficultyRating: -1 },
    { exerciseId: 'exHard', difficultyRating: 1 },
    { exerciseId: 'exReset', difficultyRating: 0 },
  ]);
});

test('updatePreferences persists affinity and difficulty_rating independently', async () => {
  const enginePath = resolveAppModule('_amps-engine.js');
  delete require.cache[enginePath];
  const { updatePreferences } = require(enginePath);

  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };

  await updatePreferences(
    client,
    'user-1',
    [{ exerciseId: 'ex1', action: 'like' }],
    [
      { exerciseId: 'ex1', difficultyRating: 1 },
      { exerciseId: 'ex2', difficultyRating: -1 },
      { exerciseId: 'ex3', difficultyRating: 0 },
    ]
  );

  const affinityWrites = calls.filter(c => c.sql.includes('affinity_score'));
  const difficultyWrites = calls.filter(c => c.sql.includes('difficulty_rating'));

  assert.equal(affinityWrites.length, 1);
  assert.equal(difficultyWrites.length, 3);
  assert.deepEqual(difficultyWrites.map(c => c.params.slice(1)), [
    ['ex1', 1],
    ['ex2', -1],
    ['ex3', 0],
  ]);
});

test('save-session forwards exerciseDifficultyRatings to preferences update and stores in session_data', async (t) => {
  let capturedUpdateArgs = null;
  let capturedInsertPayload = null;

  const authPath = stubModule('_auth-helper.js', {
    getUserIdFromEvent: async () => 'user-1',
    pool: {
      connect: async () => ({
        query: async (sql, params) => {
          if (sql.includes('INSERT INTO training_sessions')) {
            capturedInsertPayload = JSON.parse(params[4]);
          }
          if (sql.includes('SELECT settings FROM user_settings')) {
            return { rows: [{ settings: {} }], rowCount: 1 };
          }
          if (sql.includes('SELECT completed_at FROM training_sessions')) {
            return { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => {},
      }),
    },
  });

  const statsPath = stubModule('_stats-helper.js', {
    calculateStreak: () => 0,
    calculateResilience: () => 0,
    calculateAndUpsertPace: async () => {},
  });

  const phasePath = stubModule('_phase-manager.js', {
    updatePhaseStateAfterSession: (state) => ({ newState: state, transition: null }),
    checkDetraining: (state) => state,
  });

  const contractPath = stubModule('_data-contract.js', {
    validatePainMonitoring: () => ({ valid: true }),
  });

  const ampsPath = stubModule('_amps-engine.js', {
    inferMissingSessionData: (log) => log,
    updatePreferences: async (...args) => { capturedUpdateArgs = args; },
    analyzeAndAdjustPlan: async () => null,
    applyImmediatePlanAdjustmentsInMemory: async () => false,
  });

  const savePath = resolveAppModule('save-session.js');
  delete require.cache[savePath];
  const { handler } = require(savePath);

  t.after(() => {
    delete require.cache[savePath];
    delete require.cache[authPath];
    delete require.cache[statsPath];
    delete require.cache[phasePath];
    delete require.cache[contractPath];
    delete require.cache[ampsPath];
  });

  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      planId: 'plan-1',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sessionLog: [],
      exerciseRatings: [{ exerciseId: 'ex1', action: 'like' }],
      exerciseDifficultyRatings: [{ exerciseId: 'ex1', difficultyRating: 1 }],
    }),
  };

  const response = await handler(event);
  assert.equal(response.statusCode, 201);
  assert.ok(capturedUpdateArgs, 'updatePreferences should be called');
  assert.deepEqual(capturedUpdateArgs[2], [{ exerciseId: 'ex1', action: 'like' }]);
  assert.deepEqual(capturedUpdateArgs[3], [{ exerciseId: 'ex1', difficultyRating: 1 }]);
  assert.deepEqual(capturedInsertPayload.exerciseDifficultyRatings, [{ exerciseId: 'ex1', difficultyRating: 1 }]);
});

test('save-session rejects invalid affinity contract payload', async (t) => {
  const authPath = stubModule('_auth-helper.js', {
    getUserIdFromEvent: async () => 'user-1',
    pool: {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => {},
      }),
    },
  });

  const statsPath = stubModule('_stats-helper.js', {
    calculateStreak: () => 0,
    calculateResilience: () => 0,
    calculateAndUpsertPace: async () => {},
  });

  const phasePath = stubModule('_phase-manager.js', {
    updatePhaseStateAfterSession: (state) => ({ newState: state, transition: null }),
    checkDetraining: (state) => state,
  });

  const contractPath = stubModule('_data-contract.js', {
    validatePainMonitoring: () => ({ valid: true }),
  });

  const ampsPath = stubModule('_amps-engine.js', {
    inferMissingSessionData: (log) => log,
    updatePreferences: async () => {},
    analyzeAndAdjustPlan: async () => null,
    applyImmediatePlanAdjustmentsInMemory: async () => false,
  });

  const savePath = resolveAppModule('save-session.js');
  delete require.cache[savePath];
  const { handler } = require(savePath);

  t.after(() => {
    delete require.cache[savePath];
    delete require.cache[authPath];
    delete require.cache[statsPath];
    delete require.cache[phasePath];
    delete require.cache[contractPath];
    delete require.cache[ampsPath];
  });

  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      planId: 'plan-1',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sessionLog: [],
      exerciseRatings: [{ exerciseId: 'ex1', action: 'hard' }],
    }),
  };

  const response = await handler(event);
  assert.equal(response.statusCode, 400);
  const parsed = JSON.parse(response.body);
  assert.match(parsed.error, /exerciseRatings\[0\]\.action must be like\/dislike/);
});

test('save-session rejects invalid difficulty contract payload', async (t) => {
  const authPath = stubModule('_auth-helper.js', {
    getUserIdFromEvent: async () => 'user-1',
    pool: {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => {},
      }),
    },
  });

  const statsPath = stubModule('_stats-helper.js', {
    calculateStreak: () => 0,
    calculateResilience: () => 0,
    calculateAndUpsertPace: async () => {},
  });

  const phasePath = stubModule('_phase-manager.js', {
    updatePhaseStateAfterSession: (state) => ({ newState: state, transition: null }),
    checkDetraining: (state) => state,
  });

  const contractPath = stubModule('_data-contract.js', {
    validatePainMonitoring: () => ({ valid: true }),
  });

  const ampsPath = stubModule('_amps-engine.js', {
    inferMissingSessionData: (log) => log,
    updatePreferences: async () => {},
    analyzeAndAdjustPlan: async () => null,
    applyImmediatePlanAdjustmentsInMemory: async () => false,
  });

  const savePath = resolveAppModule('save-session.js');
  delete require.cache[savePath];
  const { handler } = require(savePath);

  t.after(() => {
    delete require.cache[savePath];
    delete require.cache[authPath];
    delete require.cache[statsPath];
    delete require.cache[phasePath];
    delete require.cache[contractPath];
    delete require.cache[ampsPath];
  });

  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      planId: 'plan-1',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sessionLog: [],
      exerciseDifficultyRatings: [{ exerciseId: 'ex1', difficultyRating: 2 }],
    }),
  };

  const response = await handler(event);
  assert.equal(response.statusCode, 400);
  const parsed = JSON.parse(response.body);
  assert.match(parsed.error, /exerciseDifficultyRatings\[0\]\.difficultyRating must be one of -1\/0\/1/);
});

test('save-session keeps backward compatibility when exerciseDifficultyRatings is missing', async (t) => {
  let capturedUpdateArgs = null;

  const authPath = stubModule('_auth-helper.js', {
    getUserIdFromEvent: async () => 'user-1',
    pool: {
      connect: async () => ({
        query: async (sql) => {
          if (sql.includes('SELECT settings FROM user_settings')) {
            return { rows: [{ settings: {} }], rowCount: 1 };
          }
          if (sql.includes('SELECT completed_at FROM training_sessions')) {
            return { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => {},
      }),
    },
  });

  const statsPath = stubModule('_stats-helper.js', {
    calculateStreak: () => 0,
    calculateResilience: () => 0,
    calculateAndUpsertPace: async () => {},
  });

  const phasePath = stubModule('_phase-manager.js', {
    updatePhaseStateAfterSession: (state) => ({ newState: state, transition: null }),
    checkDetraining: (state) => state,
  });

  const contractPath = stubModule('_data-contract.js', {
    validatePainMonitoring: () => ({ valid: true }),
  });

  const ampsPath = stubModule('_amps-engine.js', {
    inferMissingSessionData: (log) => log,
    updatePreferences: async (...args) => { capturedUpdateArgs = args; },
    analyzeAndAdjustPlan: async () => null,
    applyImmediatePlanAdjustmentsInMemory: async () => false,
  });

  const savePath = resolveAppModule('save-session.js');
  delete require.cache[savePath];
  const { handler } = require(savePath);

  t.after(() => {
    delete require.cache[savePath];
    delete require.cache[authPath];
    delete require.cache[statsPath];
    delete require.cache[phasePath];
    delete require.cache[contractPath];
    delete require.cache[ampsPath];
  });

  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      planId: 'plan-1',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sessionLog: [],
      exerciseRatings: [{ exerciseId: 'ex1', action: 'like' }],
    }),
  };

  const response = await handler(event);
  assert.equal(response.statusCode, 201);
  assert.ok(capturedUpdateArgs, 'updatePreferences should be called for affinity');
  assert.deepEqual(capturedUpdateArgs[2], [{ exerciseId: 'ex1', action: 'like' }]);
  assert.equal(capturedUpdateArgs[3], undefined);
});
