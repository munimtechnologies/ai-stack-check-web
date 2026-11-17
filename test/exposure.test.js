'use strict';
// Tests for src/exposure.js (node --test). Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const X = require('../src/exposure');

const SAMPLE = fs.readFileSync(path.join(__dirname, '..', 'demo', 'compose.yaml'), 'utf8');

test('port specs', () => {
  assert.deepEqual(X.parsePortSpec('11434:11434', 1), { spec: '11434:11434', line: 1, hostIp: null, published: '11434', target: 11434 });
  assert.deepEqual(X.parsePortSpec('127.0.0.1:4000:4000/tcp', 2), { spec: '127.0.0.1:4000:4000/tcp', line: 2, hostIp: '127.0.0.1', published: '4000', target: 4000 });
  assert.deepEqual(X.parsePortSpec('[::1]:8000:8000', 3), { spec: '[::1]:8000:8000', line: 3, hostIp: '::1', published: '8000', target: 8000 });
  assert.equal(X.parsePortSpec('8000', 4).published, null);
  assert.equal(X.parsePortSpec('8000-8001:8000-8001', 5).target, 8000);
  assert.equal(X.isAllInterfaces(null), true);
  assert.equal(X.isAllInterfaces('0.0.0.0'), true);
  assert.equal(X.isAllInterfaces('::'), true);
  assert.equal(X.isAllInterfaces('127.0.0.1'), false);
  assert.equal(X.isAllInterfaces('::1'), false);
});

test('parseCompose reads services, ports, env lists and maps, flow commands, volumes', () => {
  const s = X.parseCompose(SAMPLE);
  assert.deepEqual(s.map((x) => [x.name, x.line]), [['ollama', 4], ['open-webui', 11], ['vllm', 20], ['litellm', 26], ['n8n', 34]]);
  assert.equal(s[0].image, 'ollama/ollama:0.33.1');
  assert.deepEqual(s[0].ports.map((p) => [p.target, p.hostIp, p.line]), [[11434, null, 7]]);
  assert.equal(s[1].env.WEBUI_AUTH.value, 'False');
  assert.equal(s[1].env.WEBUI_AUTH.line, 17);
  assert.match(s[2].command, /--model Qwen\/Qwen3-8B/);
  assert.equal(s[3].env.LITELLM_MASTER_KEY.value, '${LITELLM_MASTER_KEY}');
  assert.equal(s[3].ports[0].hostIp, '127.0.0.1');
  assert.deepEqual(s[4].volumes.map((v) => v.line), [39]);
});

test('the sample stack: every planted problem is found, in order of severity', () => {
  const found = X.checks(SAMPLE).map((c) => [c.id, c.severity, c.service, c.line]);
  assert.deepEqual(found, [
    ['ollama-open-api', 'high', 'ollama', 7],
    ['openwebui-auth-off', 'high', 'open-webui', 17],
    ['vllm-open-api', 'high', 'vllm', 24],
    ['docker-socket', 'high', 'n8n', 39],
    ['secret-in-file', 'medium', 'open-webui', 18],
  ]);
});

test('safe settings are not flagged', () => {
  const text = [
    'services:',
    '  ollama:',
    '    image: ollama/ollama:0.35.0',
    '    ports:',
    '    - "127.0.0.1:11434:11434"',
    '  vllm:',
    '    image: vllm/vllm-openai:v0.32.0',
    '    command: --model x --api-key ${VLLM_API_KEY}',
    '    ports:',
    '      - 8000:8000',
    '  webui:',
    '    image: ghcr.io/open-webui/open-webui:v0.12.2',
    '    environment:',
    '      WEBUI_AUTH: "True"',
    '      WEBUI_SECRET_KEY: ${WEBUI_SECRET_KEY}',
    '  proxy:',
    '    image: nginx:1.27',
    '    ports: ["0.0.0.0:11434:11434"]',
  ].join('\n');
  assert.deepEqual(X.checks(text), []);
  // Same-indent list items ("ports:\n    - ...") are still read as ports.
  assert.equal(X.parseCompose(text)[0].ports[0].hostIp, '127.0.0.1');
});

test('long port syntax, privileged, LiteLLM without a master key, Langflow auto login', () => {
  const text = [
    'services:',
    '  ollama:',
    '    image: docker.io/ollama/ollama:${OLLAMA_TAG:-0.35.0}',
    '    ports:',
    '      - target: 11434',
    '        published: "11434"',
    '        host_ip: 0.0.0.0',
    '    privileged: true',
    '  litellm:',
    '    image: ghcr.io/berriai/litellm:main-stable',
    '    ports:',
    '      - "4000:4000"',
    '  langflow:',
    '    image: langflowai/langflow:1.6.0',
    '    ports:',
    '      - "7860:7860"',
    '    environment:',
    '      - LANGFLOW_AUTO_LOGIN=true',
  ].join('\n');
  const found = X.checks(text).map((c) => [c.id, c.severity, c.line]);
  assert.deepEqual(found, [
    ['ollama-open-api', 'high', 5],
    ['privileged', 'medium', 8],
    ['litellm-no-master-key', 'medium', 12],
    ['langflow-auto-login', 'medium', 16],
  ]);
});

test('input that is not a compose file is harmless', () => {
  assert.deepEqual(X.checks(''), []);
  assert.deepEqual(X.checks(null), []);
  assert.deepEqual(X.checks('FROM ollama/ollama:0.1\nRUN echo'), []);
  assert.deepEqual(X.checks('services:\n  - not a map\n  x: [unclosed'), []);
});
