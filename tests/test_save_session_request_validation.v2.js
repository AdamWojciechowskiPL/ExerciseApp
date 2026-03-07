'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const validation = requireApp('save-session/request-validation.js');

test('validateSaveSessionRequest: rejects missing required fields', () => {
  const result = validation.validateSaveSessionRequest({});
  assert.equal(result.ok, false);
  assert.equal(result.response.statusCode, 400);
});

test('validateSaveSessionRequest: rejects invalid difficulty rating payload', () => {
  const result = validation.validateSaveSessionRequest({
    planId: 'p1',
    startedAt: '2024-01-01T10:00:00.000Z',
    completedAt: '2024-01-01T11:00:00.000Z',
    exerciseDifficultyRatings: [{ exerciseId: 'ex1', difficultyRating: 5 }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.response.statusCode, 400);
  assert.match(result.response.body, /difficultyRating/);
});
