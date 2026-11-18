// Tests for the open agentic web layer of AI Stack Check (node --test).
// Copyright 2026 Munim, Inc. Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const require = createRequire(import.meta.url);

// The classic scripts the page loads, as the browser globals app.js expects.
globalThis.StackCore = require('../src/core.js');
globalThis.StackRedact = require('../src/redact.js');
globalThis.StackExposure = require('../src/exposure.js');
globalThis.StackPrompt = require('../src/prompt.js');

const feed = JSON.parse(read('test/fixture-feed.json'));
const sample = read('demo/compose.yaml');
const SECRETS = ['demo-secret-change-me', 'demo-password'];

const { ACTIONS, registerActions } = await import('../web/site-actions.js');
const { App } = await import('../web/app.js');
App.page.fetchImpl = async () => ({ ok: true, status: 200, json: async () => feed });

const byName = Object.fromEntries(ACTIONS.map((a) => [a.name, a]));
const run = async (name, args = {}) => {
  const out = await byName[name].execute(args, {});
  assert.notEqual(out, undefined, `${name} returned undefined`);
  const json = JSON.stringify(out);
  assert.ok(json.length < 64 * 1024, `${name} result over 64 KB`);
  return { out, json };
};

const ALLOWED = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'format', 'title', 'description', 'default']);
function checkSchema(s, depth, where) {
  assert.ok(depth <= 8, `${where}: deeper than 8`);
  for (const [k, v] of Object.entries(s)) {
    if (k.startsWith('x-')) continue;
    assert.ok(ALLOWED.has(k), `${where}: keyword ${k} is not supported by the runtime`);
    if (k === 'additionalProperties') assert.equal(v, false, `${where}: additionalProperties must be false`);
    if (k === 'format') assert.ok(['date', 'email'].includes(v), `${where}: format ${v}`);
  }
  if (s.properties) for (const [p, sub] of Object.entries(s.properties)) checkSchema(sub, depth + 1, `${where}.${p}`);
  if (s.items) checkSchema(s.items, depth + 1, `${where}[]`);
}

test('the manifest exposes exactly the registered actions, and its files exist', () => {
  const m = JSON.parse(read('agent-manifest.json'));
  const registered = [];
  registerActions({ register: (d) => registered.push(d) });
  assert.deepEqual(m.actions.agentTools, registered.map((d) => d.name));
  assert.ok(fs.existsSync(path.join(ROOT, m.actions.module)), m.actions.module);
  assert.equal(m.networks[0].name, 'ai_stack_check');
  assert.equal(m.networks[0].hocon, './ai_stack_check.network.json');
  assert.ok(fs.existsSync(path.join(ROOT, 'ai_stack_check.hocon')));
  assert.equal(m.agent_mcp.network, m.networks[0].name);
  assert.equal(m.linking.exports[0].front_man, m.networks[0].front_man);
  assert.deepEqual(Object.keys(JSON.parse(read('links.json')).networks), ['ai_stack_check']);
});

test('every action definition follows the runtime rules', () => {
  const names = new Set();
  for (const a of ACTIONS) {
    assert.match(a.name, /^[A-Za-z][A-Za-z0-9_-]{0,79}$/);
    assert.ok(!names.has(a.name), `duplicate ${a.name}`);
    names.add(a.name);
    assert.ok(['read', 'write', 'irreversible'].includes(a.effect));
    assert.ok(a.description.length > 40);
    assert.equal(a.inputSchema.type, 'object');
    assert.equal(a.inputSchema.additionalProperties, false);
    assert.equal(typeof a.execute, 'function');
    checkSchema(a.inputSchema, 1, a.name);
  }
  // Nothing on this site places, sends or deletes anything.
  assert.ok(!ACTIONS.some((a) => a.effect === 'irreversible'));
});

test('before any check, the tools refuse with a reason instead of guessing', async () => {
  const { out } = await run('get_findings');
  assert.equal(out.ok, false);
  assert.match(out.reason, /No check has run yet/);
  const empty = await run('check_pasted_file');
  assert.equal(empty.out.ok, false);
  assert.equal(empty.out.field, 'input');
});

test('findings for the sample stack match the page rules and never carry a secret', async () => {
  await App.page.checkText(sample, 'compose.yaml');
  const { out, json } = await run('get_findings');
  assert.equal(out.ok, true);
  assert.equal(out.feedDate, '2026-11-10');
  assert.equal(out.counts.exposureProblems, 5);
  assert.equal(out.exposures[0].id, 'ollama-open-api');
  assert.ok(out.exposures.some((e) => e.id === 'docker-socket'));
  const ollama = out.components.find((c) => c.name === 'Ollama');
  assert.equal(ollama.status, 'affected');
  assert.equal(ollama.upgradeTo, '0.33.3');
  assert.ok(ollama.advisories.every((a) => a.id !== 'CVE-2026-42248'), 'Windows-only advisory skipped for a Docker image');
  for (const s of SECRETS) assert.ok(!json.includes(s), `findings leak ${s}`);
  assert.ok(!json.includes('services:'), 'findings must not contain the raw file');
});

test('the redacted file hides the demo secrets and keeps variable references', async () => {
  const { out, json } = await run('get_redacted_file');
  assert.equal(out.ok, true);
  for (const s of SECRETS) assert.ok(!json.includes(s), `redacted copy leaks ${s}`);
  assert.match(out.text, /\$\{LITELLM_MASTER_KEY\}/);
  assert.ok(out.redactions.length > 0);
});

test('check_component answers from the curated list and refuses unknown products', async () => {
  const { out } = await run('check_component', { product: 'Open WebUI', version: '0.11.2' });
  assert.equal(out.ok, true);
  assert.equal(out.component.status, 'affected');
  assert.equal(out.component.upgradeTo, '0.12.2');
  assert.deepEqual(out.component.advisories.map((a) => a.id).sort(), ['GHSA-3vvh-g22g-jq6r', 'GHSA-vpq8-f445-hcq7']);
  const img = await run('check_component', { product: 'ollama/ollama', version: '0.35.0' });
  assert.equal(img.out.component.status, 'ok');
  const unknown = await run('check_component', { product: 'Totally Unknown App', version: '1.0.0' });
  assert.equal(unknown.out.ok, false);
  assert.equal(unknown.out.field, 'product');
  const unpinned = await run('check_component', { product: 'vLLM', version: 'latest' });
  assert.equal(unpinned.out.ok, false);
  assert.equal(unpinned.out.field, 'version');
});

test('verify_fix re-checks a proposed file with the same rules and leaves the page alone', async () => {
  const before = App.page.version;
  const bad = await run('verify_fix', { composeText: sample });
  assert.ok(bad.out.exposures.some((e) => e.severity === 'high'));
  assert.equal(bad.out.draftContainsSecretLikeValues, true);
  const fixed = [
    'services:',
    '  ollama:',
    '    image: ollama/ollama:0.35.0',
    '    ports:',
    '      - "127.0.0.1:11434:11434"',
    '  open-webui:',
    '    image: ghcr.io/open-webui/open-webui:v0.12.2',
    '    ports:',
    '      - "127.0.0.1:3000:8080"',
    '    environment:',
    '      - OLLAMA_BASE_URL=http://ollama:11434',
    '      - WEBUI_SECRET_KEY=${WEBUI_SECRET_KEY}',
    '      - OTHER_TOKEN=$OTHER_TOKEN',
  ].join('\n');
  const good = await run('verify_fix', { composeText: fixed });
  assert.equal(good.out.counts.exposureProblems, 0);
  assert.equal(good.out.counts.componentsWithAdvisories, 0);
  assert.equal(good.out.draftContainsSecretLikeValues, false);
  assert.equal(App.page.version, before, 'verify_fix must not change the page state');
});

test('the network source is valid for the builder subset and keeps the privacy rules', () => {
  const h = read('ai_stack_check.hocon');
  const known = new Set(['site_name', 'grounding_rules', 'peer_rules']);
  for (const m of h.matchAll(/(?<!\$)\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) assert.ok(known.has(m[1]), `unknown placeholder {${m[1]}}`);
  assert.ok(!h.includes('${'), 'no HOCON substitutions');
  assert.match(h, /\{peer_rules\}/);
  assert.match(h, /never ask the visitor to paste secrets/i);
  assert.match(h, /website_verify_fix/);
  for (const a of ACTIONS) assert.match(h, new RegExp(`website_${a.name}\\b`), `instructions mention website_${a.name}`);
});

test('the page mounts the assistant without breaking the check', () => {
  const html = read('index.html');
  assert.match(html, /<script type="module" src="web\/site\.js"><\/script>/);
  assert.match(html, /id="agent-app"/);
  assert.match(html, /id="assistant-status"/);
  for (const slot of ['header', 'chat', 'agents', 'settings']) assert.match(html, new RegExp(`data-ns-slot="${slot}"`));
  assert.match(html, /cognizant-ai-labs\/agentic-web/);
  assert.match(html, /never the file itself/);
  const site = read('web/site.js');
  assert.match(site, /could not load\. You can still use the page directly/);
  assert.match(site, /import\('\.\.\/runtime\/index\.js'\)/);
});
