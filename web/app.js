// AI Stack Check: page logic.
// Copyright 2026 Munim, Inc. Licensed under the Apache License, Version 2.0 (Apache-2.0).
// Made by MV2 of Munim, Inc. with AI agents.
//
// One page object (App.page) owns the check. The page's own buttons and the in-browser
// assistant's website_* tools (web/site-actions.js) call the same methods, so the assistant can
// never get a different answer from the one the page shows. The assistant only ever receives
// findings and the redacted file, never the raw paste.
import { aiConfigured, deviceModelStatus, explain } from './ai.js';

const FEED_URL = 'https://raw.githubusercontent.com/munimtechnologies/ai-stack-advisories/main/advisories.json';
const MAX_TEXT = 200000;
const g = typeof window !== 'undefined' ? window : globalThis;
const lib = () => ({ core: g.StackCore, R: g.StackRedact, X: g.StackExposure, P: g.StackPrompt });
const hasDom = typeof document !== 'undefined' && typeof document.getElementById === 'function';
const $ = (id) => (hasDom ? document.getElementById(id) : null);

function el(tag, attrs, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'href') {
      // Only http(s) links from the curated feed are rendered as links.
      if (/^https?:\/\//i.test(v)) n.setAttribute('href', v);
    } else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

function clip(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Findings in the compact shape the assistant reads (no raw file text, bounded size). */
function summarize(versionFindings, exposures, feedDate) {
  const affected = versionFindings.filter((f) => f.status === 'affected');
  const unpinned = versionFindings.filter((f) => f.status === 'unpinned');
  const ok = versionFindings.filter((f) => f.status === 'ok');
  return {
    ok: true,
    feedDate: feedDate || null,
    counts: { exposureProblems: exposures.length, componentsWithAdvisories: affected.length, componentsWithoutExactVersion: unpinned.length, componentsWithNoneKnown: ok.length },
    exposures: exposures.slice(0, 40).map((e) => ({ id: e.id, severity: e.severity, service: clip(e.service, 60), line: e.line, title: clip(e.title, 200), detail: clip(e.detail, 300), fix: clip(e.fix, 400) })),
    components: versionFindings.slice(0, 40).map((f) => ({
      name: f.name,
      version: f.version,
      line: f.line,
      status: f.status,
      upgradeTo: f.upgradeTo || null,
      advisoriesWithNoFixedRelease: f.noFixedRelease || 0,
      advisoryCount: (f.advisories || []).length,
      advisories: (f.advisories || []).slice(0, 8).map((a) => ({ id: a.id, severity: a.severity || 'unrated', fixedIn: a.fixedIn || null, onlyIfFeatureUsed: !!a.onlyIfFeatureUsed, notInPublicDatabases: !!a.notInPublicDatabases, summary: clip(a.summary, 220), url: a.url })),
    })),
  };
}

class StackCheckPage {
  constructor() {
    this.feed = null;
    this.last = null;
    this.version = 0;
    this.fetchImpl = (...a) => g.fetch(...a);
  }

  async loadFeed() {
    if (this.feed) return this.feed;
    const res = await this.fetchImpl(FEED_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`advisory list: HTTP ${res.status}`);
    this.feed = await res.json();
    if ($('feed-date')) $('feed-date').textContent = this.feed.checked || 'unknown';
    return this.feed;
  }

  /** Pure check of any text; changes nothing on the page. */
  async analyze(text, filename) {
    const { core, R, X } = lib();
    const data = await this.loadFeed();
    const name = filename || 'pasted file';
    const kind = core.fileKind(filename || '') || core.codeBlockKind('', text) || 'yaml';
    const versionFindings = core.scanText(data, name, kind, text);
    const exposures = kind === 'yaml' ? X.checks(text) : [];
    const red = R.redact(text);
    return { versionFindings, exposures, red, feedDate: data.checked, kind };
  }

  /** The Check button: checks what the visitor pasted and shows the results. */
  async check() {
    const text = $('input') ? $('input').value : '';
    const filename = $('filename') ? $('filename').value : '';
    if (!String(text).trim()) return { ok: false, reason: 'The file box is empty. Ask the visitor to paste a docker-compose file (or Dockerfile, requirements.txt, package.json, CycloneDX SBOM), or load the sample stack.', field: 'input' };
    if (text.length > MAX_TEXT) return { ok: false, reason: `The pasted file is longer than ${MAX_TEXT} characters.`, field: 'input' };
    const result = await this.analyze(text, filename);
    this.last = result;
    this.version += 1;
    if (hasDom) this.render(result);
    return { ...this.findings(), version: this.version };
  }

  /** The "Try a sample stack" button. */
  async loadSample() {
    const res = await this.fetchImpl(new URL('../demo/compose.yaml', import.meta.url).href);
    if (!res.ok) throw new Error(`sample: HTTP ${res.status}`);
    const text = await res.text();
    if ($('input')) $('input').value = text;
    if ($('filename')) $('filename').value = 'compose.yaml';
    if (!hasDom) return this.checkText(text, 'compose.yaml');
    return this.check();
  }

  /** Used by tests and by loadSample when there is no page. */
  async checkText(text, filename) {
    this.last = await this.analyze(text, filename);
    this.version += 1;
    return { ...this.findings(), version: this.version };
  }

  /** Current findings for the assistant: never the raw file. */
  findings() {
    if (!this.last) return { ok: false, reason: 'No check has run yet. Ask the visitor to paste a file and press Check (or call website_check_pasted_file), or call website_load_sample_stack.', field: 'input' };
    return { ...summarize(this.last.versionFindings, this.last.exposures, this.last.feedDate), version: this.version };
  }

  /** The redacted copy, the only form of the file a model may see. */
  redacted() {
    if (!this.last) return this.findings();
    const { R } = lib();
    return { ok: true, version: this.version, redactions: R.summarize(this.last.red.redactions), text: clip(this.last.red.text, 30000) };
  }

  /** One product + version against the curated list (no file needed). */
  async checkComponent(product, version) {
    const { core } = lib();
    const data = await this.loadFeed();
    const f = core.checkComponent(data, product, version, 'linux');
    if (!f || f.status === 'unknown-product') return { ok: false, reason: f ? f.message : 'Unknown product.', field: 'product' };
    if (f.status === 'unpinned') return { ok: false, reason: `"${version}" is not an exact version number, so it can't be checked.`, field: 'version' };
    const s = summarize([f], [], data.checked);
    return { ok: true, feedDate: s.feedDate, component: s.components[0], summary: core.describe(f) };
  }

  /** Re-runs the same rules on a proposed compose file without touching the page. */
  async verifyDraft(composeText) {
    if (!String(composeText || '').trim()) return { ok: false, reason: 'The draft is empty.', field: 'composeText' };
    const { R } = lib();
    const r = await this.analyze(composeText, 'draft-compose.yaml');
    const leaked = r.red.redactions.length;
    const s = summarize(r.versionFindings, r.exposures, r.feedDate);
    return { ...s, draftContainsSecretLikeValues: leaked > 0, note: leaked ? 'The draft contains values that look like secrets; replace them with ${VARIABLE} references before showing it.' : undefined };
  }

  render(result) {
    const { versionFindings, exposures, red } = result;
    const { core, R } = lib();
    const box = $('findings');
    box.replaceChildren();
    const affected = versionFindings.filter((f) => f.status === 'affected');
    const unpinned = versionFindings.filter((f) => f.status === 'unpinned');
    const ok = versionFindings.filter((f) => f.status === 'ok');
    $('counts').textContent = `${exposures.length} exposure problem(s), ${affected.length} component(s) with known advisories, ${unpinned.length} without an exact version, ${ok.length} with none known.`;

    if (!exposures.length && !affected.length && !unpinned.length) {
      box.append(el('p', { class: 'ok' }, versionFindings.length
        ? 'No known problems in the self-hosted AI components found here.'
        : 'No self-hosted AI components were recognised. Paste a docker-compose file, Dockerfile, requirements.txt, package.json or CycloneDX SBOM.'));
    }
    for (const e of exposures) {
      box.append(el('div', { class: `card sev-${e.severity}` },
        el('div', { class: 'tag' }, `${e.severity} · ${e.service} · line ${e.line}`),
        el('h3', {}, e.title),
        el('p', {}, e.detail),
        el('p', { class: 'fix' }, 'Fix: ', e.fix)));
    }
    for (const f of affected) {
      const list = el('ul', {});
      for (const a of f.advisories.slice(0, 12)) {
        list.append(el('li', {},
          el('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer' }, a.id),
          ` (${String(a.severity || 'unrated').toLowerCase()}${a.fixedIn ? `, fixed in ${a.fixedIn}` : ', no fixed release'}${a.onlyIfFeatureUsed ? ', only if that feature is used' : ''}${a.notInPublicDatabases ? ', not in OSV when checked' : ''}): `,
          a.summary));
      }
      if (f.advisories.length > 12) list.append(el('li', {}, `…and ${f.advisories.length - 12} more.`));
      box.append(el('div', { class: 'card sev-version' },
        el('div', { class: 'tag' }, `version · line ${f.line}`),
        el('h3', {}, core.describe(f)),
        list));
    }
    if (unpinned.length) {
      box.append(el('div', { class: 'card sev-low' },
        el('div', { class: 'tag' }, 'not checked'),
        el('h3', {}, `No exact version: ${unpinned.map((f) => `${f.name} (line ${f.line})`).join(', ')}`),
        el('p', {}, 'Tags like latest or main change on every pull, so nobody can say which advisories apply. Pin an exact version and update it on purpose.')));
    }
    $('redacted').textContent = red.text;
    $('redact-summary').textContent = R.summarize(red.redactions);
    $('results').hidden = false;
  }
}

export class App {
  static page = new StackCheckPage();
}

// ---- Page wiring (browser only) ----

async function runCheck() {
  $('status').textContent = 'Checking…';
  $('ai-out').replaceChildren();
  try {
    const r = await App.page.check();
    $('status').textContent = r.ok === false ? r.reason : 'Done. Everything above ran in this browser; your file was not uploaded.';
  } catch (e) {
    $('status').textContent = `Could not run the check: ${e.message}`;
  }
}

function renderAnswer(ans, source, inventedIds) {
  const { P } = lib();
  const out = $('ai-out');
  out.replaceChildren();
  const where = P.sourceOf(source);
  out.append(el('div', { class: `badge src-${where}` },
    where === 'device' ? 'Answered on this device by Gemini Nano: nothing left your computer'
      : where === 'cloud' ? 'Answered in the cloud by Gemini: only the redacted prompt shown below was sent'
        : 'Answered'));
  if (!ans.ok) {
    out.append(el('pre', { class: 'plain' }, ans.text));
  } else {
    out.append(el('h3', {}, ans.headline));
    const ol = el('ol', {});
    for (const s of ans.steps) ol.append(el('li', {}, el('strong', {}, s.title), el('p', {}, s.why), el('p', { class: 'fix' }, s.how)));
    out.append(ol);
    if (ans.patchedCompose) {
      out.append(el('h4', {}, 'Suggested compose file (check it before use; secrets stay as <redacted>)'));
      out.append(el('pre', {}, ans.patchedCompose));
    }
  }
  if (inventedIds.length) {
    out.append(el('p', { class: 'warn' }, `Ignore these IDs in the answer: they are not in the curated findings (${inventedIds.join(', ')}).`));
  }
}

async function runExplain() {
  const { P } = lib();
  if (!App.page.last) await runCheck();
  const last = App.page.last;
  if (!last) return;
  const privacy = document.querySelector('input[name=privacy]:checked').value;
  const prompt = P.buildPrompt({ versionFindings: last.versionFindings, exposures: last.exposures, redactedText: last.red.text, feedDate: last.feedDate });
  $('prompt-preview').textContent = prompt;
  $('ai-status').textContent = privacy === 'device-only' ? 'Asking Gemini Nano on this device…' : 'Asking Gemini Nano on this device (cloud if it is not available)…';
  try {
    const { text, source } = await explain(prompt, P.SYSTEM, P.ANSWER_SCHEMA, privacy, (p) => {
      $('ai-status').textContent = `Downloading the on-device model: ${(p * 100).toFixed(0)}%`;
    });
    const ans = P.parseAnswer(text);
    renderAnswer(ans, source, P.inventedIds(text, last.versionFindings));
    $('ai-status').textContent = '';
  } catch (e) {
    $('ai-status').textContent = privacy === 'device-only'
      ? `The on-device model is not available here (${e.message}). Choose "on-device first" to allow the cloud fallback, or use Chrome on a desktop that supports Gemini Nano.`
      : `The explanation failed: ${e.message}`;
  }
}

async function init() {
  $('check').addEventListener('click', runCheck);
  $('sample').addEventListener('click', async () => {
    $('status').textContent = 'Checking…';
    try {
      await App.page.loadSample();
      $('status').textContent = 'Done. Everything above ran in this browser; your file was not uploaded.';
    } catch (e) {
      $('status').textContent = `Could not run the check: ${e.message}`;
    }
  });
  if (aiConfigured()) {
    $('ai-panel').hidden = false;
    $('explain').addEventListener('click', runExplain);
    const st = await deviceModelStatus();
    $('device-status').textContent = {
      available: 'Gemini Nano is ready on this device.',
      downloadable: 'Gemini Nano can be downloaded to this device on first use.',
      downloading: 'Gemini Nano is downloading.',
      unavailable: 'This device cannot run Gemini Nano; explanations will come from the cloud.',
      'no-api': 'This browser has no on-device model; explanations will come from the cloud.',
    }[st] || `On-device model: ${st}`;
  } else {
    $('ai-off').hidden = false;
  }
  App.page.loadFeed().catch(() => { $('feed-date').textContent = 'not loaded'; });
}

if (hasDom && $('check')) init();
