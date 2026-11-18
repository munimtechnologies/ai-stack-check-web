// Real-browser smoke test of the agentic page: the check still works, the assistant runtime boots
// under the page's CSP, and the open agentic web files are served as JSON.
// Usage: node scripts/agentic-smoke.mjs <out-dir>   (needs the playwright package and its Chromium;
// run from the assembled bundle that contains runtime/ and the built ai_stack_check.network.json)
// Copyright 2026 Munim, Inc. Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '.';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.yaml': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, url.endsWith('/') ? `${url}index.html` : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const files = {};
for (const f of ['agent-manifest.json', 'ai_stack_check.network.json', 'links.json', 'agent-mcp.json']) {
  try {
    const r = await fetch(base + f);
    const t = await r.text();
    let json = false;
    try { JSON.parse(t); json = true; } catch { /* not JSON */ }
    files[f] = { status: r.status, json, bytes: t.length };
  } catch (e) {
    files[f] = { error: String(e) };
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
const csp = [];
page.on('console', (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to/i.test(t)) csp.push(t);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push(String(e)));

let result = null;
try {
  await page.goto(base, { waitUntil: 'load' });
  await page.click('#sample');
  await page.waitForSelector('#results:not([hidden])', { timeout: 30000 });
  // Give the assistant runtime time to boot (it loads after the page).
  await page.waitForFunction(() => !/loading/i.test(document.getElementById('assistant-status').textContent), null, { timeout: 30000 }).catch(() => {});
  result = await page.evaluate(() => {
    const slot = (n) => document.querySelector(`[data-ns-slot="${n}"]`);
    const text = (n) => (slot(n) ? slot(n).innerText.slice(0, 600) : null);
    return {
      cards: [...document.querySelectorAll('#findings .card h3')].map((h) => h.textContent),
      status: document.getElementById('status').textContent,
      redactedHasSecret: document.getElementById('redacted').textContent.includes('demo-secret-change-me'),
      assistantStatus: document.getElementById('assistant-status').textContent,
      agentAppChildren: document.querySelectorAll('#agent-app *').length,
      slots: { header: text('header'), chat: text('chat'), agents: text('agents'), settings: text('settings') },
      inputs: [...document.querySelectorAll('#agent-app input, #agent-app select, #agent-app textarea, #agent-app button')].map((e) => ({ tag: e.tagName.toLowerCase(), id: e.id, name: e.name || '', type: e.type || '', placeholder: e.placeholder || '', label: (e.getAttribute('aria-label') || e.textContent || '').slice(0, 60) })).slice(0, 40),
    };
  });
  await page.screenshot({ path: path.join(OUT, 'agentic-page.png'), fullPage: true });
} finally {
  await browser.close();
  server.close();
}

const report = { files, ...result, errors, csp };
fs.writeFileSync(path.join(OUT, 'agentic-browser.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const booted = result && !/could not load|loading/i.test(result.assistantStatus);
const ok = result && result.cards.length >= 7 && !result.redactedHasSecret && booted && errors.length === 0 && csp.length === 0
  && files['agent-manifest.json'].json && files['ai_stack_check.network.json'].json && files['links.json'].json;
process.exit(ok ? 0 : 1);
