// ExerciseApp/tests/test_fatigue_calculator.v2.js
'use strict';

// --- MOCK ENVIRONMENT VARIABLES ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const fatigue = requireApp('_fatigue-calculator.js');

// Helper do tworzenia mocka wiersza bazy danych
const mkRow = (dateStr, durationMin = 60, rpeVal = 0) => ({
  completed_at: new Date(dateStr),
  session_data: {
    netDurationSeconds: durationMin * 60,
    feedback: { value: rpeVal, type: 'tension' } // value 0 -> RPE 5
  }
});

test('calculateFatigueProfile returns detailed metrics (monotony, strain, thresholds)', async () => {
  // Symulacja 7 dni historii
  const mockRows = [
    mkRow('2026-01-10'),
    mkRow('2026-01-11'),
    mkRow('2026-01-12'),
    mkRow('2026-01-13'),
    mkRow('2026-01-14'),
    mkRow('2026-01-15'),
    mkRow('2026-01-16'),
  ];

  // Mock klienta Postgres
  const mockClient = {
    query: async () => ({ rows: mockRows })
  };

  const res = await fatigue.calculateFatigueProfile(mockClient, 'user-1');

  // Weryfikacja struktury zwracanej przez calculateFatigueProfile
  assert.equal(typeof res.fatigueScoreNow, 'number', 'fatigueScoreNow should be a number');
  assert.equal(typeof res.monotony7d, 'number', 'monotony7d should be a number');
  assert.equal(typeof res.strain7d, 'number', 'strain7d should be a number');
  
  // Sprawdzenie progów adaptacyjnych
  assert.equal(typeof res.fatigueThresholdEnter, 'number');
  assert.equal(typeof res.fatigueThresholdExit, 'number');
  
  // Obecna implementacja NIE zwraca boolean 'fatigueFlag' bezpośrednio w tym obiekcie
  // (decyzja o fladze jest podejmowana w generate-plan.js na podstawie score >= threshold)
});

test('calculateAcuteFatigue returns a scalar number (backward compatibility wrapper)', async () => {
  const mockClient = {
    query: async () => ({ rows: [mkRow('2026-01-16')] })
  };

  const score = await fatigue.calculateAcuteFatigue(mockClient, 'user-1');

  // Ta funkcja zwraca tylko fatigueScoreNow (number)
  assert.equal(typeof score, 'number', 'Should return a single number');
});

test('calculateFatigueProfile works with empty history (safe defaults)', async () => {
  const fakeClient = { query: async () => ({ rows: [] }) };
  
  const profile = await fatigue.calculateFatigueProfile(fakeClient, 'user-1');
  
  assert.ok(profile);
  assert.equal(profile.fatigueScoreNow, 0);
  assert.equal(profile.monotony7d, 0);
  assert.equal(profile.strain7d, 0);
  // Sprawdzamy czy obiekt dataQuality istnieje zamiast schema_version
  assert.ok(profile.dataQuality, 'Should contain dataQuality metadata');
});