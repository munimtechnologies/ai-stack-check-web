'use strict';
// Static and load-order tests for the web page (node --test). Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('index.html');

function localRefs() {
  const refs = [];
  const re = /\b(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) if (!/^(https?:|mailto:|#)/.test(m[1])) refs.push(m[1]);
  return refs;
}

test('every local file the page references exists', () => {
  const refs = localRefs();
  assert.ok(refs.includes('src/core.js'));
  assert.ok(refs.includes('web/app.js'));
  for (const r of refs) assert.ok(fs.existsSync(path.join(ROOT, r)), `missing ${r}`);
  // app.js fetches the sample stack by a relative path too.
  assert.ok(fs.existsSync(path.join(ROOT, 'demo', 'compose.yaml')));
});

test('classic scripts load in page order in a browser-like global and work together', () => {
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(order, ['web/cjs-shim.js', 'src/core.js', 'web/cjs-capture.js', 'src/redact.js', 'src/exposure.js', 'src/prompt.js']);
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of order) vm.runInContext(read(f), ctx, { filename: f });
  assert.equal(ctx.module, undefined, 'the CommonJS shim is cleared after core.js');
  for (const name of ['StackCore', 'StackRedact', 'StackExposure', 'StackPrompt']) assert.equal(typeof ctx[name], 'object', name);
  const sample = read('demo/compose.yaml');
  const exposures = ctx.StackExposure.checks(sample);
  assert.equal(exposures.length, 5);
  assert.equal(exposures[0].id, 'ollama-open-api');
  const data = JSON.parse(read('test/fixture-feed.json'));
  const findings = ctx.StackCore.scanText(data, 'compose.yaml', 'yaml', sample);
  const prompt = ctx.StackPrompt.buildPrompt({ versionFindings: findings, exposures, redactedText: ctx.StackRedact.redact(sample).text, feedDate: data.checked });
  assert.ok(prompt.includes('[VERSION] Ollama 0.33.1'));
  assert.ok(!prompt.includes('demo-secret-change-me'));
});

test('the ES modules parse', () => {
  for (const f of ['web/app.js', 'web/ai.js', 'web/firebase-config.js']) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
  }
});

test('page rules: no inline scripts, a CSP, AI disclosure, Apache-2.0, no committed Firebase project', () => {
  assert.ok(!/<script>(?!<)/.test(html), 'no inline <script> blocks (the CSP forbids them)');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /with AI agents/);
  assert.match(html, /Apache-2\.0/);
  const cfg = read('web/firebase-config.js');
  assert.match(cfg, /export const firebaseConfig = null;/);
  assert.match(cfg, /export const appCheckSiteKey = '';/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.license, 'Apache-2.0');
  for (const f of ['src/redact.js', 'src/exposure.js', 'src/prompt.js', 'web/app.js', 'web/ai.js']) {
    assert.match(read(f), /Apache-2\.0/, f);
    assert.ok(!/\bMIT\b/.test(read(f)), f);
  }
});

test('the model never gets raw input: app.js builds the prompt from the redacted text only', () => {
  const app = read('web/app.js');
  assert.match(app, /redactedText: last\.red\.text/);
  assert.ok(!/explain\([^)]*\$\('input'\)/.test(app));
  assert.ok(!/redactedText: text\b/.test(app));
});
