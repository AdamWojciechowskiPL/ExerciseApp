'use strict';

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const amps = requireApp('_amps-engine.js');
const plan = requireApp('generate-plan.js');
const authHelper = requireApp('netlify/functions/_auth-helper.js');

function makeMockClient({
  existingOverride = null,
  parentExercise = null,
  currentExercise = null,
  nextExercise = null
} = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const s = String(sql).toLowerCase();

      if (s.includes('from user_plan_overrides') && s.includes('limit 1')) {
        return { rows: existingOverride ? [existingOverride] : [] };
      }

      if (s.includes('from exercises where next_progression_id = $1')) {
        return { rows: parentExercise ? [parentExercise] : [] };
      }

      if (s.includes('from exercises where id = $1')) {
        if (currentExercise) return { rows: [currentExercise] };
        if (nextExercise) return { rows: [nextExercise] };
        return { rows: [] };
      }

      return { rows: [], rowCount: 1 };
    }
  };
}

function makeDbExercise({ id, name, category = 'core_stability', difficulty = 2, nextProgressionId = null }) {
  return {
    id,
    name,
    description: `${name} description`,
    equipment: ['none'],
    is_unilateral: false,
    is_foot_loading: false,
    category_id: category,
    difficulty_level: difficulty,
    pain_relief_zones: [],
    tolerance_tags: [],
    primary_plane: 'sagittal',
    position: 'standing',
    knee_load_level: 'low',
    spine_load_level: 'low',
    impact_level: 'low',
    metabolic_intensity: 1,
    max_recommended_duration: 0,
    max_recommended_reps: 12,
    conditioning_style: 'none',
    recommended_interval_sec: null,
    next_progression_id: nextProgressionId,
    default_tempo: '3-1-1: Kontrola',
    calculated_timing: { rest_sec: 40, transition_sec: 6 }
  };
}

test('AMPS E2E: first hard signal creates micro_dose override (without devolution)', async () => {
  const client = makeMockClient();
  const sessionLog = [{
    status: 'completed',
    isRest: false,
    exerciseId: 'ex-hard',
    name: 'Hard Exercise',
    rating: 'hard',
    rir: 0,
    tech: 6
  }];

  const adaptation = await amps.analyzeAndAdjustPlan(client, 'user-1', sessionLog);

  assert.equal(adaptation?.type, 'micro_dose');
  const insertedMicroDose = client.calls.some((c) =>
    c.sql.toLowerCase().includes("'micro_dose'") && c.params?.[1] === 'ex-hard'
  );
  assert.equal(insertedMicroDose, true, 'first hard signal should persist micro_dose override');
});

test('AMPS E2E: repeated hard signal after micro_dose creates devolution override', async () => {
  const client = makeMockClient({
    existingOverride: { adjustment_type: 'micro_dose', replacement_exercise_id: 'ex-hard' },
    parentExercise: { id: 'ex-easier', name: 'Easier Variant' }
  });

  const sessionLog = [{
    status: 'completed',
    isRest: false,
    exerciseId: 'ex-hard',
    name: 'Hard Exercise',
    rating: 'hard',
    rir: 0,
    tech: 4
  }];

  const adaptation = await amps.analyzeAndAdjustPlan(client, 'user-1', sessionLog);

  assert.equal(adaptation?.type, 'devolution');
  assert.equal(adaptation?.newId, 'ex-easier');
  const insertedDevolution = client.calls.some((c) =>
    c.sql.toLowerCase().includes("'devolution'") && c.params?.[1] === 'ex-hard' && c.params?.[2] === 'ex-easier'
  );
  assert.equal(insertedDevolution, true, 'repeated hard signal should persist devolution override');
});

test('AMPS E2E: easy signal supports progression policy (evolution)', async () => {
  const client = makeMockClient({
    currentExercise: { id: 'ex-base', name: 'Base Variant', next_progression_id: 'ex-next' },
    nextExercise: { id: 'ex-next', name: 'Next Variant' }
  });

  const sessionLog = [{
    status: 'completed',
    isRest: false,
    exerciseId: 'ex-base',
    name: 'Base Variant',
    rir: 4,
    tech: 9
  }];

  const adaptation = await amps.analyzeAndAdjustPlan(client, 'user-1', sessionLog);

  assert.equal(adaptation?.type, 'evolution');
  assert.equal(adaptation?.newId, 'ex-next');
});

test('AMPS E2E: generator respects micro_dose override via forced volume reduction', () => {
  const ex = makeDbExercise({ id: 'ex-md', name: 'Micro Dose Candidate' });

  const rx = plan.prescribeForExercise(
    ex,
    'main',
    { exercise_experience: 'regular' },
    {},
    {},
    'normal',
    30,
    1.0,
    { phaseId: 'capacity', config: { prescription: { sets: '3' } } },
    { 'ex-md': { forceMicroDose: true } },
    1.0
  );

  assert.equal(Number.parseInt(rx.sets, 10), 2, 'micro_dose override should reduce sets by 1');
});

test('AMPS E2E: generator respects devolution override in plan selection', async () => {
  const original = makeDbExercise({ id: 'ex-hard', name: 'Hard Variant', difficulty: 3 });
  const easier = makeDbExercise({ id: 'ex-easier', name: 'Easier Variant', difficulty: 2 });
  const fillerA = makeDbExercise({ id: 'ex-filler-a', name: 'Filler A', category: 'hip_mobility' });
  const fillerB = makeDbExercise({ id: 'ex-filler-b', name: 'Filler B', category: 'spine_mobility' });
  const fillerC = makeDbExercise({ id: 'ex-filler-c', name: 'Filler C', category: 'glute_activation' });
  const fillerD = makeDbExercise({ id: 'ex-filler-d', name: 'Filler D', category: 'breathing' });

  authHelper.pool.connect = async () => ({
    async query(sql) {
      const s = String(sql).toLowerCase();

      if (s.includes('select * from exercises')) {
        return { rows: [original, easier, fillerA, fillerB, fillerC, fillerD] };
      }

      if (s.includes('from user_settings')) {
        if (s.includes('select')) return { rows: [{ settings: { phase_manager: null } }] };
        return { rowCount: 1, rows: [] };
      }

      if (s.includes('from user_plan_overrides')) {
        return {
          rows: [{
            original_exercise_id: 'ex-hard',
            replacement_exercise_id: 'ex-easier',
            adjustment_type: 'devolution'
          }]
        };
      }

      if (
        s.includes('training_sessions') ||
        s.includes('user_exercise_blacklist') ||
        s.includes('user_exercise_preferences') ||
        s.includes('user_exercise_stats')
      ) {
        return { rows: [] };
      }

      return { rows: [] };
    },
    release() {}
  });

  const event = {
    httpMethod: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-user-id': 'amps-e2e-user'
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

  const res = await plan.handler(event);
  assert.equal(res.statusCode, 200, `generator should return 200, got ${res.statusCode}`);

  const payload = JSON.parse(res.body);
  const allIds = payload.plan.days
    .flatMap((d) => [...(d.main || []), ...(d.warmup || []), ...(d.cooldown || [])])
    .map((ex) => ex.id);

  assert.ok(allIds.includes('ex-easier'), 'replacement exercise should be present in generated plan');
  assert.ok(!allIds.includes('ex-hard'), 'original exercise should be replaced by devolution override');
});
