'use strict';
// Tests for src/prompt.js (node --test). Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core');
const R = require('../src/redact');
const X = require('../src/exposure');
const P = require('../src/prompt');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-feed.json'), 'utf8'));
const SAMPLE = fs.readFileSync(path.join(__dirname, '..', 'demo', 'compose.yaml'), 'utf8');

function sampleInput() {
  return {
    versionFindings: core.scanText(data, 'compose.yaml', 'yaml', SAMPLE),
    exposures: X.checks(SAMPLE),
    redactedText: R.redact(SAMPLE).text,
    feedDate: data.checked,
  };
}

test('the prompt holds the findings and the redacted file, never the secrets', () => {
  const input = sampleInput();
  const p = P.buildPrompt(input);
  assert.ok(p.startsWith(P.SYSTEM));
  assert.match(p, /advisory list dated 2026-11-10/);
  assert.match(p, /\[HIGH\] ollama \(line 7\): Ollama API published/);
  assert.match(p, /\[VERSION\] Ollama 0\.33\.1 \(line 5\): 1 known advisories; update to 0\.33\.3/);
  assert.match(p, /\[UNPINNED\] n8n \(line 35\)/);
  assert.match(p, /CVE-2026-85180/);
  assert.ok(!p.includes('demo-secret-change-me'));
  assert.ok(!p.includes('demo-password'));
  assert.ok(p.includes('WEBUI_SECRET_KEY=<redacted>'));
  // Exposures come before version findings: they are usually the more urgent fix.
  assert.ok(p.indexOf('[HIGH]') < p.indexOf('[VERSION]'));
  assert.ok(p.length < P.MAX_PROMPT_CHARS);
});

test('long files and many findings are cut to fit the on-device model', () => {
  const input = sampleInput();
  input.redactedText = 'x'.repeat(50000);
  const many = [];
  for (let i = 0; i < 400; i += 1) many.push({ id: 'secret-in-file', severity: 'medium', service: `s${i}`, line: i + 1, title: `KEY_${i} is written into the file`, detail: 'Anyone with the file has the secret.', fix: 'Use a variable reference.' });
  input.exposures = many;
  const p = P.buildPrompt(input);
  assert.ok(p.length <= P.MAX_PROMPT_CHARS, `prompt is ${p.length} chars`);
  assert.match(p, /cut to fit the on-device model/);
  assert.match(p, /more findings not shown/);
  assert.match(p, /Answer as JSON/);
});

test('no findings', () => {
  const p = P.buildPrompt({ versionFindings: [], exposures: [], redactedText: 'services: {}', feedDate: '2026-11-10' });
  assert.match(p, /FINDINGS[^\n]*\n- none/);
});

test('parseAnswer: JSON, fenced JSON, and plain text', () => {
  const doc = { headline: 'Two services are open to the network.', steps: [{ title: 'Bind Ollama to localhost', why: 'No login.', how: 'Use 127.0.0.1:11434:11434.' }, { nope: 1 }], patchedCompose: 'services: {}' };
  const a = P.parseAnswer(JSON.stringify(doc));
  assert.equal(a.ok, true);
  assert.equal(a.steps.length, 1);
  assert.equal(a.patchedCompose, 'services: {}');
  const b = P.parseAnswer('```json\n' + JSON.stringify(doc) + '\n```');
  assert.equal(b.ok, true);
  assert.equal(b.headline, doc.headline);
  const c = P.parseAnswer('Sorry, I cannot help with that.');
  assert.equal(c.ok, false);
  assert.equal(c.text, 'Sorry, I cannot help with that.');
  assert.equal(P.parseAnswer('{"steps": []}').ok, false);
  assert.equal(P.parseAnswer(null).ok, false);
});

test('invented advisory IDs are caught', () => {
  const input = sampleInput();
  const answer = 'Update Ollama because of CVE-2026-85180 and CVE-2099-12345; see also GHSA-vpq8-f445-hcq7 and GHSA-aaaa-bbbb-cccc.';
  assert.deepEqual(P.inventedIds(answer, input.versionFindings), ['CVE-2099-12345', 'GHSA-AAAA-BBBB-CCCC']);
  assert.deepEqual(P.inventedIds('No IDs here.', input.versionFindings), []);
});

test('inference source names from the SDK', () => {
  assert.equal(P.sourceOf('ON_DEVICE'), 'device');
  assert.equal(P.sourceOf('on_device'), 'device');
  assert.equal(P.sourceOf('IN_CLOUD'), 'cloud');
  assert.equal(P.sourceOf(undefined), 'unknown');
});

test('the answer schema asks for what the page renders', () => {
  assert.deepEqual(P.ANSWER_SCHEMA.required, ['headline', 'steps']);
  assert.deepEqual(P.ANSWER_SCHEMA.properties.steps.items.required, ['title', 'why', 'how']);
});
