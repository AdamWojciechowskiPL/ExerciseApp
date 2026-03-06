'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAppModule } = require('./_test_helpers.v2.js');

function stubModule(relPath, exportsObj) {
  const resolved = resolveAppModule(relPath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObj,
  };
  return resolved;
}

test('save-session rejects invalid during payload with 400', async (t) => {
  const authPath = stubModule('_auth-helper.js', {
    getUserIdFromEvent: async () => 'user-1',
    pool: { connect: async () => { throw new Error('DB should not be called for validation error'); } },
  });

  const savePath = resolveAppModule('save-session.js');
  delete require.cache[savePath];
  const { handler } = require(savePath);

  t.after(() => {
    delete require.cache[savePath];
    delete require.cache[authPath];
  });

  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      planId: 'plan-1',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      feedback: {
        type: 'pain_monitoring',
        schema_version: 1,
        during: { max_nprs: '8' },
      },
    }),
  };

  const response = await handler(event);
  assert.equal(response.statusCode, 400);
  const body = JSON.parse(response.body);
  assert.match(body.error, /Feedback Error: Invalid during.max_nprs/);
});

test('update-pain-feedback-24h delegates to patch-session-feedback handler', async (t) => {
  let called = 0;
  let captured = null;

  const patchPath = stubModule('patch-session-feedback.js', {
    handler: async (event, context) => {
      called += 1;
      captured = { event, context };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    },
  });

  const updatePath = resolveAppModule('update-pain-feedback-24h.js');
  delete require.cache[updatePath];
  const { handler } = require(updatePath);

  t.after(() => {
    delete require.cache[updatePath];
    delete require.cache[patchPath];
  });

  const event = { httpMethod: 'POST', body: JSON.stringify({ sessionId: 123, after24h: { max_nprs: 3 } }) };
  const context = { requestId: 'ctx-1' };
  const response = await handler(event, context);

  assert.equal(response.statusCode, 200);
  assert.equal(called, 1);
  assert.deepEqual(captured, { event, context });
});
