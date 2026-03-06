'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const clinicalEngineUrl = pathToFileURL(path.resolve(__dirname, '..', 'clinicalEngine.js')).href;

async function loadClinicalEngine() {
  return import(clinicalEngineUrl);
}

test('frontend clinicalEngine: low_back/lumbar/lumbar_general map to shared pain filters', async () => {
  const clinical = await loadClinicalEngine();

  const low = clinical.buildClinicalContext({ pain_locations: ['low_back'] });
  const lumbar = clinical.buildClinicalContext({ pain_locations: ['lumbar'] });
  const lumbarGeneral = clinical.buildClinicalContext({ pain_locations: ['lumbar_general'] });

  for (const ctx of [low, lumbar, lumbarGeneral]) {
    assert.equal(ctx.painFilters.has('low_back'), true);
    assert.equal(ctx.painFilters.has('lumbar_general'), true);
  }
});
