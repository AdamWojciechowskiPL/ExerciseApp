'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tryRequireApp } = require('./_test_helpers.v2');

const maybe = tryRequireApp('_tempo-validator.js');

if (!maybe.ok) {
  test('tempo-validator optional: missing -> SKIP', { skip: true }, () => {});
} else {
  const tv = maybe.mod;

  test('tempo-validator exports validateTempoString', () => {
    assert.equal(typeof tv.validateTempoString, 'function');
  });

  test('tempo-validator accepts "3-1-1: ..."', () => {
    const res = tv.validateTempoString('3-1-1: Kontroluj opuszczanie, dynamicznie w górę.');
    assert.equal(res.ok, true);
  });

  test('tempo-validator rejects isometric tempo containing seconds', () => {
    const res = tv.validateTempoString('Izometria: Utrzymaj 30 sekund.');
    assert.equal(res.ok, false);
  });
}
