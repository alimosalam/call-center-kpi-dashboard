'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { embedAssets } = require('../scripts/embed-assets.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
test('preview contains current source assets and regeneration is repeatable', () => {
  assert.equal(embedAssets(html), html);
  assert.equal(embedAssets(embedAssets(html)), html);
});
test('preview needs no separate CSS or JavaScript requests', () => {
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']stylesheet["']/i);
  assert.match(html, /<style>[\s\S]*\.kpi-grid/);
  assert.ok(html.indexOf('root.CallCenter =') < html.indexOf('const { calculate, SAMPLE }'));
  assert.ok(html.indexOf('<section id="kpis"') < html.indexOf('const { calculate, SAMPLE }'));
});
