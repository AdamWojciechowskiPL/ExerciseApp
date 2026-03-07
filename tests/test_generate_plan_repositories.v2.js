'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const { fetchPlanGenerationData } = requireApp('generate-plan/repositories.js');

test('fetchPlanGenerationData: builds maps and applies micro_dose flag', async () => {
  const responses = [
    { rows: [{ id: 'e1' }] },
    { rows: [{ exercise_id: 'blocked-1' }] },
    { rows: [{ exercise_id: 'e1', affinity_score: 2, difficulty_rating: 1 }] },
    { rows: [{ completed_at: '2024-01-01T00:00:00Z', logs: [{ id: 'e1', currentSet: 2 }] }] },
    { rows: [{ exercise_id: 'e1', avg_seconds_per_rep: '5.2' }] },
    { rows: [{ completed_at: '2024-01-02T00:00:00Z', feedback: {} }] },
    { rows: [{ original_exercise_id: 'e1', replacement_exercise_id: 'e2', adjustment_type: 'micro_dose' }] },
    { fatigueScoreNow: 10, fatigueThresholdEnter: 70, fatigueThresholdExit: 55, fatigueThresholdFilter: 65, isMonotonyRelevant: false },
    { rows: [{ settings: { planMode: 'dynamic' } }] }
  ];
  let idx = 0;
  const client = { query: async () => responses[idx++] };

  const result = await fetchPlanGenerationData(client, 'u1', { exercise_experience: 'regular' }, {
    normalizeExerciseRow: (row) => ({ ...row }),
    safeBuildUserContext: () => ({ blockedIds: new Set(), toleranceBias: { strength: 0 } }),
    analyzeRpeTrend: () => ({ volumeModifier: 1 }),
    analyzePainResponse: () => ({ painModifier: 1, directionalNegative24hCount: 3 }),
    calculateFatigueProfile: async () => responses[idx++]
  });

  assert.equal(result.exercises.length, 1);
  assert.equal(result.ctx.blockedIds.has('blocked-1'), true);
  assert.equal(result.historyMap.e1.forceMicroDose, true);
  assert.equal(result.paceMap.e1, 5.2);
  assert.equal(result.ctx.toleranceBias.strength, 1);
});
