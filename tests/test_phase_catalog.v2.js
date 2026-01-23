'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireApp } = require('./_test_helpers.v2');

const catalog = requireApp('phase-catalog.js');

test('phase-catalog has unique ids and targetSessions', () => {
  const ids = new Set();
  for (const p of catalog.phases ?? []) {
    assert.ok(p.id);
    assert.ok(!ids.has(p.id), `duplicate id: ${p.id}`);
    ids.add(p.id);
    assert.ok(p.targetSessions, `phase ${p.id} missing targetSessions`);
  }
});
