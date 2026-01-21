#!/usr/bin/env node
'use strict';
// --- MOCK ENVIRONMENT VARIABLES ---
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

const here = __dirname;

const testFiles = [
  'test_exports.v2.js',
  'test_generate_plan_validation.v2.js',
  'test_generate_plan_normalize_row.v2.js',
  'test_weighting_logic.v2.js',
  'test_generate_plan_scoring.v2.js',
  'test_prescription_and_rest.v2.js',
  'test_pacing_engine.v2.js',
  'test_clinical_rule_engine.v2.js',
  'test_phase_manager.v2.js',
  'test_fatigue_calculator.v2.js',
  'test_phase_catalog.v2.js',
  'test_pain_taxonomy.optional.v2.js',
  'test_tempo_validator.optional.v2.js',
  'test_integration_generate_plan.optional.v2.js',
].map(f => path.resolve(here, f)).filter(p => fs.existsSync(p));

if (!testFiles.length) {
  console.error('No v2 test files found next to run_tests.v2.js');
  process.exit(2);
}

const nodeArgs = ['--test', ...testFiles];
if (verbose) nodeArgs.unshift('--test-reporter', 'spec');

const res = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit' });

if (res.error) {
  console.error('\nFailed to run node --test. Ensure Node >= 18.');
  console.error('Error:', res.error.message);
  process.exit(2);
}

process.exit(res.status ?? 1);
