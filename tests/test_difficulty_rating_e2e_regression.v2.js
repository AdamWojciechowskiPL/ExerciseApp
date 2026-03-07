'use strict';

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const authHelper = requireApp('netlify/functions/_auth-helper.js');
const saveSession = requireApp('netlify/functions/save-session.js');
const generatePlan = requireApp('netlify/functions/generate-plan.js');

function makeDbExercise(id, name) {
  return {
    id,
    name,
    description: `${name} description`,
    equipment: ['none'],
    is_unilateral: false,
    is_foot_loading: false,
    category_id: 'core_stability',
    difficulty_level: 2,
    pain_relief_zones: [],
    tolerance_tags: [],
    primary_plane: 'sagittal',
    position: 'standing',
    knee_load_level: 'low',
    spine_load_level: 'low',
    impact_level: 'low',
    metabolic_intensity: 1,
    max_recommended_duration: 0,
    max_recommended_reps: 10,
    conditioning_style: 'none',
    recommended_interval_sec: null,
    default_tempo: '3-1-1: Kontrola',
    calculated_timing: { rest_sec: 40, transition_sec: 6 }
  };
}

function createInMemoryDb() {
  const settingsByUser = new Map();
  const sessionsByUser = new Map();
  const preferencesByUser = new Map();
  const exercises = [
    makeDbExercise('target-x', 'Target X'),
    makeDbExercise('peer-a', 'Peer A'),
    makeDbExercise('peer-b', 'Peer B'),
    makeDbExercise('peer-c', 'Peer C'),
    makeDbExercise('peer-d', 'Peer D'),
    makeDbExercise('peer-e', 'Peer E')
  ];

  function getUserPrefs(userId) {
    if (!preferencesByUser.has(userId)) preferencesByUser.set(userId, new Map());
    return preferencesByUser.get(userId);
  }

  return {
    connect: async () => ({
      async query(sql, params = []) {
        const text = String(sql);
        const s = text.toLowerCase();

        if (s.includes('begin') || s.includes('commit') || s.includes('rollback')) {
          return { rows: [], rowCount: 0 };
        }

        if (s.includes('from exercises')) return { rows: exercises };

        if (s.includes('from user_settings') && s.includes('select')) {
          const userId = params[0];
          const settings = settingsByUser.get(userId) || { phase_manager: null };
          return { rows: [{ settings }] };
        }

        if (s.includes('insert into user_settings') && params.length >= 2) {
          const userId = params[0];
          const parsed = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
          settingsByUser.set(userId, parsed);
          return { rowCount: 1, rows: [] };
        }

        if (s.includes('update user_settings set settings') && params.length >= 2) {
          const userId = params[1];
          const parsed = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
          settingsByUser.set(userId, parsed);
          return { rowCount: 1, rows: [] };
        }

        if (s.includes('insert into training_sessions')) {
          const [userId, planId, startedAt, completedAt, payload] = params;
          const existing = sessionsByUser.get(userId) || [];
          const sessionData = typeof payload === 'string' ? JSON.parse(payload) : payload;
          existing.push({ planId, startedAt, completedAt, session_data: sessionData });
          sessionsByUser.set(userId, existing);
          return { rowCount: 1, rows: [] };
        }

        if (s.includes("session_data->'sessionlog' as logs")) {
          const userId = params[0];
          const sessions = sessionsByUser.get(userId) || [];
          return {
            rows: sessions.map((entry) => ({
              logs: entry.session_data.sessionLog || [],
              completed_at: entry.completedAt
            }))
          };
        }

        if (s.includes("session_data->'feedback' as feedback")) {
          const userId = params[0];
          const sessions = sessionsByUser.get(userId) || [];
          return {
            rows: sessions
              .map((entry) => ({ completed_at: entry.completedAt, feedback: entry.session_data.feedback || null }))
              .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
              .slice(0, 3)
          };
        }

        if (s.includes('select completed_at from training_sessions')) {
          const userId = params[0];
          const sessions = sessionsByUser.get(userId) || [];
          return {
            rows: sessions
              .map((entry) => ({ completed_at: entry.completedAt }))
              .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)),
            rowCount: sessions.length
          };
        }

        if (s.includes('from user_exercise_preferences') && s.includes('select exercise_id, affinity_score, difficulty_rating')) {
          const userId = params[0];
          const prefs = getUserPrefs(userId);
          return {
            rows: Array.from(prefs.entries()).map(([exerciseId, pref]) => ({
              exercise_id: exerciseId,
              affinity_score: pref.affinity_score ?? 0,
              difficulty_rating: pref.difficulty_rating ?? 0
            }))
          };
        }

        if (s.includes('insert into user_exercise_preferences')) {
          const [userId, exerciseId, value] = params;
          const prefs = getUserPrefs(userId);
          const existing = prefs.get(exerciseId) || { affinity_score: 0, difficulty_rating: 0 };
          if (s.includes('difficulty_rating')) {
            existing.difficulty_rating = Number(value);
          }
          if (s.includes('affinity_score')) {
            existing.affinity_score = Math.max(-100, Math.min(100, Number(existing.affinity_score || 0) + Number(value)));
          }
          prefs.set(exerciseId, existing);
          return { rowCount: 1, rows: [] };
        }

        if (
          s.includes('from user_exercise_blacklist') ||
          s.includes('from user_exercise_stats') ||
          s.includes('from user_plan_overrides') ||
          (s.includes('training_sessions') && !s.includes('insert into training_sessions') && !s.includes('select completed_at from training_sessions') && !s.includes("session_data->'sessionlog' as logs") && !s.includes("session_data->'feedback' as feedback"))
        ) {
          return { rows: [], rowCount: 0 };
        }

        return { rows: [], rowCount: 0 };
      },
      release() {}
    })
  };
}

function buildGenerateEvent(userId) {
  return {
    httpMethod: 'POST',
    queryStringParameters: { debug: 'true' },
    headers: {
      'content-type': 'application/json',
      'x-dev-user-id': userId
    },
    body: JSON.stringify({
      primary_goal: 'strength',
      pain_intensity: 2,
      exercise_medical_clearance: {
        cvd: false,
        metabolic: false,
        renal: false,
        chest_pain_exertional: false,
        syncope_exertional: false,
        dyspnea_disproportionate: false,
        recent_cardiac_event: false,
        uncontrolled_hypertension: false
      },
      schedule_pattern: [1, 3, 5],
      exercise_experience: 'beginner',
      current_activity_status: 'regular_moderate'
    })
  };
}

async function saveDifficultyRating(userId, difficultyRating) {
  const now = new Date().toISOString();
  const res = await saveSession.handler({
    httpMethod: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-user-id': userId
    },
    body: JSON.stringify({
      planId: 'plan-1',
      startedAt: now,
      completedAt: now,
      sessionLog: [],
      exerciseDifficultyRatings: [{ exerciseId: 'target-x', difficultyRating }]
    })
  });

  assert.equal(res.statusCode, 201, `save-session should persist difficulty_rating=${difficultyRating}`);
}

async function generateWithDebugRanking(userId) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };

  try {
    const res = await generatePlan.handler(buildGenerateEvent(userId));
    assert.equal(res.statusCode, 200, `generate-plan should return 200 for user ${userId}`);
  } finally {
    console.log = originalLog;
  }

  const markerIndex = logs.findIndex((entry) => entry.includes('=== CLINICALLY ALLOWED EXERCISES & WEIGHTS ==='));
  assert.ok(markerIndex >= 0, 'debug marker should be present in logs');
  assert.ok(logs[markerIndex + 1], 'debug JSON payload should be logged after marker');

  const ranking = JSON.parse(logs[markerIndex + 1]);
  const target = ranking.find((entry) => entry.id === 'target-x');
  const neutralPeer = ranking.find((entry) => entry.id === 'peer-a');

  assert.ok(target, 'debug ranking should include target exercise');
  assert.ok(neutralPeer, 'debug ranking should include neutral peer exercise');

  return { target, neutralPeer };
}

test('E2E regression: difficulty_rating=1 zapisane w save-session obniża ranking targetu w generate-plan', async () => {
  authHelper.pool.connect = createInMemoryDb().connect;

  await saveDifficultyRating('difficulty-penalty-user', 1);
  const { target, neutralPeer } = await generateWithDebugRanking('difficulty-penalty-user');

  assert.equal(target.breakdown.difficultyAdjust, 0.94);
  assert.equal(neutralPeer.breakdown.difficultyAdjust, 1);
  assert.ok(target.w_main < neutralPeer.w_main, `penalty scenario should lower target score (${target.w_main} < ${neutralPeer.w_main})`);
});

test('E2E regression: difficulty_rating=-1 zapisane w save-session daje bonus rankingowy w generate-plan', async () => {
  authHelper.pool.connect = createInMemoryDb().connect;

  await saveDifficultyRating('difficulty-bonus-user', -1);
  const { target, neutralPeer } = await generateWithDebugRanking('difficulty-bonus-user');

  assert.equal(target.breakdown.difficultyAdjust, 1.03);
  assert.equal(neutralPeer.breakdown.difficultyAdjust, 1);
  assert.ok(target.w_main > neutralPeer.w_main, `bonus scenario should raise target score (${target.w_main} > ${neutralPeer.w_main})`);
});
