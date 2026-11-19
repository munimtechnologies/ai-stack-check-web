// End-to-end agent turns for AI Stack Check as an open agentic website (node --test).
// Copyright 2026 Munim, Inc. Licensed under the Apache License, Version 2.0 (Apache-2.0).
// Made by MV2 of Munim, Inc. with AI agents.
//
// Drives the real open agentic web runtime (runtime/, copied from cognizant-ai-labs/agentic-web,
// Apache-2.0) with the real generated network and the real page code, using a scripted model
// instead of an LLM. What it proves, end to end:
//   1. the generated network is valid and its front agent is the manifest's front_man;
//   2. the runtime offers the visitor's model exactly the six website_* tools, within budget;
//   3. a full demo turn (load sample -> findings -> redacted copy) succeeds, and NOTHING the model
//      is ever sent (system prompt, tool definitions, tool results) contains a secret from the file;
//   4. verify_fix runs through the runtime and leaves the page state untouched;
//   5. arguments outside the schema are refused by the runtime before the page code runs.
// Needs the assembled bundle: runtime/ and ai_stack_check.network.json (built by build_network.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { AgentNetwork, validateNetwork } from '../runtime/kernel.js';
import { ActionRegistry } from '../runtime/actions.js';
import { buildToolTable, dispatchToolCall, runAgent } from '../runtime/runner.js';
import { TraceBus } from '../runtime/trace.js';
import { ScriptedModel } from './scripted_model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const require = createRequire(import.meta.url);

// The classic scripts the page loads, as the browser globals app.js expects.
globalThis.StackCore = require('../src/core.js');
globalThis.StackRedact = require('../src/redact.js');
globalThis.StackExposure = require('../src/exposure.js');
globalThis.StackPrompt = require('../src/prompt.js');

const NETWORK = 'ai_stack_check';
const BASE = 'http://localhost:8081';
const SCOPE = { base: BASE, network: NETWORK };
const CALL_BUDGET = 16000; // system prompt + tool definitions, characters, as in the reference examples
const TOOLS = ['get_findings', 'check_pasted_file', 'load_sample_stack', 'get_redacted_file', 'check_component', 'verify_fix'];
const SECRETS = ['demo-secret-change-me', 'demo-password'];

const feed = JSON.parse(read('test/fixture-feed.json'));
const sample = read('demo/compose.yaml');
for (const s of SECRETS) assert.ok(sample.includes(s), `the sample must contain ${s} for the leak test to mean anything`);

const { registerActions } = await import('../web/site-actions.js');
const { App } = await import('../web/app.js');
App.page.fetchImpl = async (url) => {
  const u = String(url);
  if (u.endsWith('compose.yaml')) return { ok: true, status: 200, text: async () => sample };
  return { ok: true, status: 200, json: async () => feed };
};

async function load() {
  const config = JSON.parse(read(`${NETWORK}.network.json`));
  const manifest = JSON.parse(read('agent-manifest.json'));
  return { config, manifest, network: new AgentNetwork(config, NETWORK) };
}

async function registry() {
  const r = new ActionRegistry();
  await registerActions({ register: r.register.bind(r, SCOPE) });
  return r;
}

const approve = async () => true;

function context(loaded, reg, model, confirm = approve) {
  return {
    network: loaded.network,
    manifest: loaded.manifest,
    actions: reg,
    baseOrigin: BASE,
    displayOrigin: new URL(BASE).host,
    trace: new TraceBus(),
    isTop: true,
    frontMan: loaded.network.findFrontMan(),
    history: [],
    llm: model,
    confirmWebsiteActions: confirm,
  };
}

async function toolEntry(loaded, ctx, name) {
  const spec = loaded.network.getAgentSpec(loaded.network.findFrontMan());
  const table = await buildToolTable(ctx, spec, [], null);
  return table.toolByName.get(`website_${name}`);
}

const loaded = await load();
const reg = await registry();

test('the generated network is valid and fronted by the manifest front_man', () => {
  assert.deepEqual(validateNetwork(loaded.network).errors, []);
  assert.equal(loaded.network.findFrontMan(), loaded.manifest.networks[0].front_man);
  assert.equal(loaded.manifest.peer_policy.mode, 'closed');
  const front = loaded.network.getAgentSpec(loaded.network.findFrontMan());
  assert.match(front.instructions, /website_verify_fix/);
  assert.ok(!JSON.stringify(loaded.config).includes('make up a realistic response'), 'no demo mode');
});

test('a full demo turn succeeds and the model never sees a secret from the file', async (t) => {
  const model = new ScriptedModel([
    { tool: 'website_load_sample_stack', arguments: {} },
    { tool: 'website_get_findings', arguments: {} },
    { tool: 'website_get_redacted_file', arguments: {} },
    { text: 'I found exposure problems and outdated components in the sample stack.' },
  ]);
  const ctx = context(loaded, reg, model);
  const result = await runAgent(ctx, ctx.frontMan, 'Show me a demo with the sample stack.', null, []);

  const offered = model.toolNames(0);
  for (const name of TOOLS) assert.ok(offered.includes(`website_${name}`), `website_${name} offered`);
  assert.equal(offered.filter((n) => n.startsWith('website_')).length, TOOLS.length, 'no extra website_* tools');

  const loadedSample = model.toolResults(1)[0];
  assert.equal(loadedSample.status, 'succeeded');
  const findings = model.toolResults(2)[1];
  assert.equal(findings.status, 'succeeded');
  assert.equal(findings.result.ok, true);
  assert.equal(findings.result.counts.exposureProblems, 5);
  const redacted = model.toolResults(3)[2];
  assert.equal(redacted.status, 'succeeded');
  assert.match(redacted.result.text, /\$\{LITELLM_MASTER_KEY\}/);
  assert.match(result.text, /exposure problems/);

  const sent = model.everythingSent();
  for (const s of SECRETS) assert.ok(!sent.includes(s), `the model was sent ${s}`);

  const prompt = model.calls[0].messages[0].content.length;
  const tools = JSON.stringify(model.calls[0].tools).length;
  t.diagnostic(`system prompt ${prompt} chars + tools ${tools} chars = ${prompt + tools} (budget ${CALL_BUDGET})`);
  assert.ok(prompt + tools <= CALL_BUDGET, 'call fits the budget');
});

test('verify_fix runs through the runtime and leaves the page alone', async () => {
  const before = App.page.version;
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
  ].join('\n');
  const model = new ScriptedModel([
    { tool: 'website_verify_fix', arguments: { composeText: fixed } },
    { text: 'The corrected file passes: no exposure problems left.' },
  ]);
  const ctx = context(loaded, reg, model);
  await runAgent(ctx, ctx.frontMan, 'Fix my compose file.', null, []);
  const receipt = model.toolResults(1)[0];
  assert.equal(receipt.status, 'succeeded');
  assert.equal(receipt.result.counts.exposureProblems, 0);
  assert.equal(receipt.result.draftContainsSecretLikeValues, false);
  assert.equal(App.page.version, before, 'verify_fix must not change the page state');
});

test('arguments outside the schema are refused before the page code runs', async () => {
  const ctx = context(loaded, reg, null);
  const entry = await toolEntry(loaded, ctx, 'check_component');
  assert.ok(entry, 'website_check_component is in the tool table');
  const before = App.page.version;
  for (const args of [{ product: 'vLLM' }, { product: 'vLLM', version: '0.9.0', extra: 'x' }, { product: 'v', version: '1' }]) {
    let refused = false;
    try {
      const receipt = await dispatchToolCall(ctx, entry, args, null, []);
      refused = receipt.status !== 'succeeded';
    } catch (err) {
      refused = true;
      assert.match(String(err && err.message), /argument|schema|invalid/i);
    }
    assert.ok(refused, `refused ${JSON.stringify(args)}`);
  }
  const ok = await dispatchToolCall(ctx, entry, { product: 'Open WebUI', version: '0.11.2' }, null, []);
  assert.equal(ok.status, 'succeeded');
  assert.equal(ok.result.component.upgradeTo, '0.12.2');
  assert.equal(App.page.version, before);
});
