// Real-browser smoke test: serve the page, load the sample stack, check the findings render with no errors.
// Usage: node scripts/browser-smoke.mjs <out-dir>   (needs the playwright package and its Chromium)
// Copyright 2026 Munim, Inc. Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '.';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.yaml': 'text/plain', '.json': 'application/json' };

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

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let result;
try {
  await page.goto(base, { waitUntil: 'load' });
  await page.click('#sample');
  await page.waitForSelector('#results:not([hidden])', { timeout: 30000 });
  result = await page.evaluate(() => ({
    counts: document.getElementById('counts').textContent,
    cards: [...document.querySelectorAll('#findings .card h3')].map((h) => h.textContent),
    redactedHasSecret: document.getElementById('redacted').textContent.includes('demo-secret-change-me'),
    redactSummary: document.getElementById('redact-summary').textContent,
    feedDate: document.getElementById('feed-date').textContent,
    status: document.getElementById('status').textContent,
    aiOffShown: !document.getElementById('ai-off').hidden,
  }));
  await page.screenshot({ path: path.join(OUT, 'page.png'), fullPage: true });
} finally {
  await browser.close();
  server.close();
}

const report = { ...result, errors };
fs.writeFileSync(path.join(OUT, 'browser.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const ok = result && result.cards.length >= 7 && !result.redactedHasSecret && errors.length === 0 && result.aiOffShown;
process.exit(ok ? 0 : 1);
