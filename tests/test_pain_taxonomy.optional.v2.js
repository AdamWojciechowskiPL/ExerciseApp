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

  test('pain-taxonomy maps low_back and lumbar aliases to low_back zone', () => {
    const low = tax.derivePainZoneSet(['low_back']);
    const lum = tax.derivePainZoneSet(['lumbar_general']);
    assert.equal(low.has('low_back'), true);
    assert.equal(lum.has('low_back'), true);
  });
}
