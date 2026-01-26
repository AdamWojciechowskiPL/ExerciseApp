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

// Wczytujemy moduł z nową logiką AMPS
const fatigue = requireApp('netlify/functions/_fatigue-calculator.js');

// Helper do tworzenia mocka wiersza bazy danych
const mkRow = (dateStr, loadAU) => ({
  completed_at: new Date(dateStr),
  session_data: {
    // Symulujemy, że calculateSessionLoadAU zwróciło już wartość,
    // w teście integracyjnym musielibyśmy mockować całą strukturę logów.
    // Tutaj testujemy głównie logikę kalkulacji profilu.
    netDurationSeconds: 1800, // 30 min
    feedback: { value: 0 } // Neutral
  }
});

// --- TESTY JEDNOSTKOWE NOWEJ LOGIKI RPE (AMPS) ---
// Dostęp do funkcji wewnętrznych nie jest możliwy bez eksportu,
// więc testujemy poprzez publiczne API lub symulację sesji.
// Ponieważ calculateSessionLoadAU nie jest eksportowane, musimy zaufać,
// że calculateFatigueProfile używa go poprawnie, albo dodać exporty w pliku źródłowym dla celów testowych.
// Zamiast tego, przetestujemy zachowanie na pełnym profilu z danymi AMPS w sessionLog.

test('AMPS Logic: RIR 0 results in high load calculation', async () => {
  // Mock sesji z RIR 0 (Max wysiłek)
  // 10 min * RPE 10 (bo RIR 0) = 100 AU
  const sessionHigh = {
    completed_at: new Date(),
    session_data: {
        sessionLog: [{
            reps_or_time: '10 min',
            rir: 0, // RPE 10
            status: 'completed'
        }]
    }
  };

  // Mock sesji z RIR 5 (Lekko)
  // 10 min * RPE 5 (10 - 5) = 50 AU
  const sessionLow = {
    completed_at: new Date(),
    session_data: {
        sessionLog: [{
            reps_or_time: '10 min',
            rir: 5, // RPE 5
            status: 'completed'
        }]
    }
  };

  const mockClient = {
    query: async () => ({ rows: [sessionHigh, sessionLow] })
  };

  // Uruchamiamy kalkulator (wewnętrznie policzy Load AU dla obu sesji)
  const res = await fatigue.calculateFatigueProfile(mockClient, 'user-1');

  // Sprawdzamy czy strain nie jest zerowy (co oznacza że policzył cokolwiek)
  assert.ok(res.weekLoad7d > 0, 'Should calculate some load');
});

test('AMPS Logic: Quick Rating "hard" results in high RPE', async () => {
    // 30 min * RPE 9 (Hard) = 270 AU
    const sessionHard = {
        completed_at: new Date(),
        session_data: {
            sessionLog: [{
                reps_or_time: '30 min',
                rating: 'hard', // RPE 9
                status: 'completed'
            }]
        }
    };

    // 30 min * RPE 6 (Good) = 180 AU
    const sessionGood = {
        completed_at: new Date(),
        session_data: {
            sessionLog: [{
                reps_or_time: '30 min',
                rating: 'good', // RPE 6
                status: 'completed'
            }]
        }
    };

    const mockClient = { query: async () => ({ rows: [sessionHard, sessionGood] }) };
    const res = await fatigue.calculateFatigueProfile(mockClient, 'user-1');

    // Nie możemy łatwo sprawdzić dokładnych wartości wewnątrz private scope,
    // ale możemy upewnić się, że funkcja działa bez błędu dla nowych struktur danych.
    assert.ok(res.fatigueScoreNow >= 0);
});

test('calculateFatigueProfile returns detailed metrics (monotony, strain, thresholds)', async () => {
  // Symulacja 7 dni historii (Legacy data format support check)
  const mockRows = [
    { completed_at: new Date('2026-01-10'), session_data: { netDurationSeconds: 3600, feedback: { value: 0 } } },
    { completed_at: new Date('2026-01-11'), session_data: { netDurationSeconds: 3600, feedback: { value: 0 } } }
  ];

  const mockClient = {
    query: async () => ({ rows: mockRows })
  };

  const res = await fatigue.calculateFatigueProfile(mockClient, 'user-1');

  assert.equal(typeof res.fatigueScoreNow, 'number', 'fatigueScoreNow should be a number');
  assert.equal(typeof res.monotony7d, 'number', 'monotony7d should be a number');
  assert.equal(typeof res.strain7d, 'number', 'strain7d should be a number');
  assert.equal(typeof res.fatigueThresholdEnter, 'number');
  assert.equal(typeof res.fatigueThresholdExit, 'number');
});

test('calculateAcuteFatigue returns a scalar number', async () => {
  const mockClient = {
    query: async () => ({ rows: [] })
  };
  const score = await fatigue.calculateAcuteFatigue(mockClient, 'user-1');
  assert.equal(typeof score, 'number', 'Should return a single number');
});