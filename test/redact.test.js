'use strict';
// Tests for src/redact.js (node --test). Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
// Fake tokens are assembled from pieces so no real-looking secret sits in the repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/redact');

const kinds = (r) => r.redactions.map((x) => x.kind);

test('secret-named values are hidden in env lists and YAML maps; references are kept', () => {
  const text = [
    'environment:',
    '  - WEBUI_SECRET_KEY=demo-secret',
    '  - OPENAI_API_KEY=${OPENAI_API_KEY}',
    '  - WEBUI_AUTH=False',
    '  POSTGRES_PASSWORD: "hunter2"   # keep this comment',
    '  HF_TOKEN: $HF_TOKEN',
    '  OLLAMA_BASE_URL: http://ollama:11434',
  ].join('\n');
  const r = R.redact(text);
  const out = r.text.split('\n');
  assert.equal(out[1], '  - WEBUI_SECRET_KEY=<redacted>');
  assert.equal(out[2], '  - OPENAI_API_KEY=${OPENAI_API_KEY}');
  assert.equal(out[3], '  - WEBUI_AUTH=False');
  assert.equal(out[4], '  POSTGRES_PASSWORD: "<redacted>"   # keep this comment');
  assert.equal(out[5], '  HF_TOKEN: $HF_TOKEN');
  assert.equal(out[6], '  OLLAMA_BASE_URL: http://ollama:11434');
  assert.deepEqual(r.redactions, [{ line: 2, kind: 'secret-value' }, { line: 5, kind: 'secret-value' }]);
});

test('credentials in URLs', () => {
  const r = R.redact('DATABASE_URL: postgres://litellm:pw123@db:5432/litellm');
  assert.equal(r.text, 'DATABASE_URL: postgres://<redacted>@db:5432/litellm');
  assert.deepEqual(kinds(r), ['url-credentials']);
  assert.equal(R.redact('url: http://ollama:11434/api').text, 'url: http://ollama:11434/api');
});

test('known token shapes are hidden anywhere, comments included', () => {
  const gh = 'gh' + 'p_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
  const hf = 'h' + 'f_' + 'abcdefghijklmnopqrstuvwxyz12';
  const aws = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
  const r = R.redact(`command: ["--token", "${gh}"]\n# old: ${hf}\nnote: ${aws}`);
  assert.ok(!r.text.includes(gh));
  assert.ok(!r.text.includes(hf));
  assert.ok(!r.text.includes(aws));
  assert.deepEqual(kinds(r).sort(), ['aws-access-key', 'github-token', 'huggingface-token']);
});

test('private key blocks spanning lines', () => {
  const block = ['-----BEGIN', 'OPENSSH PRIVATE KEY-----'].join(' ') + '\nAAAAB3Nza\nC1yc2E\n' + '-----END OPENSSH PRIVATE KEY-----';
  const r = R.redact(`a: 1\nkey_file: |\n${block}\nb: 2`);
  assert.ok(!r.text.includes('AAAAB3Nza'));
  assert.ok(r.text.includes('b: 2'));
  assert.deepEqual(r.redactions[0], { line: 3, kind: 'private-key' });
});

test('public IPv4 hidden, private and loopback kept', () => {
  const r = R.redact('ports:\n  - "127.0.0.1:11434:11434"\n  - "203.0.113.7:80:80"\nextra_hosts: ["db:10.0.0.5", "gw:192.168.1.1", "ts:100.101.102.103"]');
  assert.ok(r.text.includes('127.0.0.1:11434'));
  assert.ok(r.text.includes('<public-ip>:80:80'));
  assert.ok(r.text.includes('10.0.0.5') && r.text.includes('192.168.1.1') && r.text.includes('100.101.102.103'));
  assert.deepEqual(kinds(r), ['public-ip']);
  assert.equal(R.isPublicIPv4('8', '8', '8', '8'), true);
  assert.equal(R.isPublicIPv4('172', '20', '0', '1'), false);
  assert.equal(R.isPublicIPv4('999', '1', '1', '1'), false);
});

test('secret names', () => {
  for (const n of ['OPENAI_API_KEY', 'LITELLM_MASTER_KEY', 'N8N_ENCRYPTION_KEY', 'DB_PASSWORD', 'password', 'HF_TOKEN', 'JWT_SECRET', 'SENTRY_DSN']) {
    assert.equal(R.isSecretName(n), true, n);
  }
  for (const n of ['WEBUI_AUTH', 'OLLAMA_HOST', 'KEY_FILE', 'API_KEY_NAME', 'TOKEN_URL', 'AUTH_TYPE', 'MONKEY', 'BYPASS', 'image']) {
    assert.equal(R.isSecretName(n), false, n);
  }
});

test('summary and empty input', () => {
  assert.equal(R.summarize([]), 'Nothing needed hiding.');
  assert.equal(R.summarize([{ line: 1, kind: 'secret-value' }, { line: 2, kind: 'secret-value' }, { line: 3, kind: 'public-ip' }]), '3 values hidden (1 public-ip, 2 secret-value).');
  assert.deepEqual(R.redact(null), { text: '', redactions: [] });
});

test('the sample stack: secrets hidden, settings that explain the risk kept', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const text = fs.readFileSync(path.join(__dirname, '..', 'demo', 'compose.yaml'), 'utf8');
  const r = R.redact(text);
  assert.ok(!r.text.includes('demo-secret-change-me'));
  assert.ok(!r.text.includes('demo-password'));
  assert.ok(r.text.includes('WEBUI_AUTH=False'));
  assert.ok(r.text.includes('${LITELLM_MASTER_KEY}'));
  assert.ok(r.text.includes('"11434:11434"'));
  assert.deepEqual(kinds(r).sort(), ['secret-value', 'url-credentials']);
});
