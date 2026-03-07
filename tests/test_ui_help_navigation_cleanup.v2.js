'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('UI: Help screen is reachable from desktop and bottom navigation', () => {
  const appJs = read('app.js');
  const indexHtml = read('index.html');

  assert.match(indexHtml, /id="nav-help"/, 'Missing desktop Help nav button');
  assert.match(indexHtml, /data-screen="help"/, 'Missing bottom Help nav button');
  assert.match(appJs, /renderHelpScreen\(/, 'Help screen renderer should be used in app navigation');
  assert.match(appJs, /case 'help':\s*renderHelpScreen\(\);\s*break;/, 'Bottom nav should route to Help screen');
});

test('UI: no ghost analytics screen reference remains in dom map', () => {
  const domJs = read('dom.js');
  const indexHtml = read('index.html');

  assert.doesNotMatch(domJs, /analytics-screen/, 'dom.js should not reference analytics-screen');
  assert.doesNotMatch(indexHtml, /id="analytics-screen"/, 'index.html should not define analytics-screen');
});
