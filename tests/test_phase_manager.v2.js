'use strict';

// --- MOCK ENVIRONMENT VARIABLES ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

// Wczytujemy moduł (ścieżka może wymagać dostosowania w zależności od helpera)
const phase = requireApp('netlify/functions/_phase-manager.js');

test('initializePhaseState starts in control', () => {
  // Funkcja oczekuje (primaryGoal, userCtx)
  const s = phase.initializePhaseState('strength', { exercise_experience: 'beginner' });
  
  // Sprawdzamy poprawną strukturę danych (snake_case)
  assert.equal(s.current_phase_stats.phase_id, 'control');
  assert.ok(s.current_phase_stats.target_sessions >= 1);
});

test('resolveActivePhase returns a valid phase id', () => {
  const s = phase.initializePhaseState('strength', { exercise_experience: 'beginner' });

  // Funkcja oczekuje (state, safetyCtx)
  const res = phase.resolveActivePhase(s, {
    fatigueScore: 20,
    painStatus: 'green',
    isSeverePain: false,
    monotony7d: 1.0,
    strain7d: 100
  });

  // Funkcja zwraca obiekt { activePhaseId, isOverride, ... }
  assert.ok(['control','capacity','strength','deload','rehab'].includes(res.activePhaseId));
});

test('updatePhaseStateAfterSession returns updated state', () => {
  const s = phase.initializePhaseState('strength', { exercise_experience: 'beginner' });

  // POPRAWKA: Funkcja oczekuje 3 argumentów: (state, completedPhaseId, userCtx)
  // Zwraca: { newState, transition }
  const result = phase.updatePhaseStateAfterSession(s, 'control', {});
  const after = result.newState;

  assert.ok(after.current_phase_stats.phase_id);
  // Sprawdzamy czy licznik sesji wzrósł (z 0 na 1)
  assert.equal(after.current_phase_stats.sessions_completed, 1);
});