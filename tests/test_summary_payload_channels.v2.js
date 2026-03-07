'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('summary payload builder keeps affinity actions separate from difficulty ratings', async () => {
  const summaryPayload = await import('../shared/summary-feedback-payload.mjs');
  const difficultyPayload = await import('../shared/exercise-difficulty-rating.mjs');

  const ratings = summaryPayload.buildExerciseRatingsPayload(
    {
      exLike: 15,
      exDislike: -30,
      exNeutral: 0,
      exLegacyHard: 1,
    },
    ['exLike', 'exDislike', 'exNeutral', 'exLegacyHard']
  );

  const difficultyRatings = difficultyPayload.buildExerciseDifficultyRatingsPayload({
    exLike: difficultyPayload.mapDifficultySelectionToRating(null),
    exDislike: difficultyPayload.mapDifficultySelectionToRating('easy'),
    exLegacyHard: difficultyPayload.mapDifficultySelectionToRating('hard'),
  });

  assert.deepEqual(ratings, [
    { exerciseId: 'exLike', action: 'like' },
    { exerciseId: 'exDislike', action: 'dislike' },
  ]);

  assert.deepEqual(difficultyRatings, [
    { exerciseId: 'exLike', difficultyRating: 0 },
    { exerciseId: 'exDislike', difficultyRating: -1 },
    { exerciseId: 'exLegacyHard', difficultyRating: 1 },
  ]);
});
