'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tryRequireApp } = require('./_test_helpers.v2');

const maybe = tryRequireApp('_pain-taxonomy.js');

if (!maybe.ok) {
  test('pain-taxonomy optional: missing -> SKIP', { skip: true }, () => {});
} else {
  const tax = maybe.mod;

  test('pain-taxonomy exports derivePainZoneSet', () => {
    assert.equal(typeof tax.derivePainZoneSet, 'function');
  });
}
