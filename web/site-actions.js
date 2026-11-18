// AI Stack Check: the operations the in-browser assistant may call (website_* tools).
// Copyright 2026 Munim, Inc. Licensed under the Apache License, Version 2.0 (Apache-2.0).
// Made by MV2 of Munim, Inc. with AI agents.
//
// Written for the open agentic web runtime from cognizant-ai-labs/agentic-web (Apache-2.0).
// Every action wraps a method of App.page in app.js, the same methods the page's own buttons
// call; no business rules live here. Privacy rule: no action returns the raw pasted file.
// The assistant gets findings, or the redacted copy in which secrets and public IPs are replaced.
// Nothing here places, sends or deletes anything, so there are no irreversible actions.
import { App } from './app.js'; // the same URL index.html loads, so there is one page state

const none = { type: 'object', properties: {}, additionalProperties: false };

export const ACTIONS = [
  {
    name: 'get_findings',
    description: 'Returns the results of the last check shown on the page: exposure problems (id, severity, service, line, title, fix) and each recognised AI component with its version, status and curated advisories (id, severity, fixed-in version). Never returns the file itself. Returns ok:false if no check has run yet. Changes nothing.',
    inputSchema: none,
    effect: 'read',
    execute: async () => App.page.findings(),
  },
  {
    name: 'check_pasted_file',
    description: 'Runs the page\'s Check on the file the visitor pasted into the page (same as pressing Check) and shows the results on the page. Returns the findings, not the file. Returns ok:false if the box is empty. The check runs entirely in this browser.',
    inputSchema: none,
    effect: 'write',
    execute: async () => App.page.check(),
  },
  {
    name: 'load_sample_stack',
    description: 'Puts the built-in sample stack (an outdated Ollama, Open WebUI, vLLM, LiteLLM and n8n with risky settings, made-up secrets) into the page and checks it, replacing whatever was in the file box. Use only when the visitor asks for a demo or the sample. Returns the findings.',
    inputSchema: none,
    effect: 'write',
    execute: async () => App.page.loadSample(),
  },
  {
    name: 'get_redacted_file',
    description: 'Returns the last checked file with secrets, credentials in URLs, private keys and public IP addresses replaced by <redacted> markers (${VARIABLE} references are kept), plus a summary of what was replaced. Use it only to write a corrected file for the visitor. Changes nothing.',
    inputSchema: none,
    effect: 'read',
    execute: async () => App.page.redacted(),
  },
  {
    name: 'check_component',
    description: 'Checks one self-hosted AI product at one exact version against the curated advisory list, without any file. Products: Ollama, Open WebUI, vLLM, LiteLLM, n8n, Dify, Langflow, Flowise, RAGFlow, AnythingLLM, MCP Inspector (names, Docker images, PyPI or npm names work). Returns the advisories that affect that version and the version to update to. Changes nothing.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', minLength: 2, maxLength: 80, description: 'Product name or image, for example "Open WebUI" or "ollama/ollama".' },
        version: { type: 'string', minLength: 1, maxLength: 40, description: 'Exact version, for example "0.11.2".' },
      },
      required: ['product', 'version'],
      additionalProperties: false,
    },
    effect: 'read',
    execute: async (args) => App.page.checkComponent(args.product, args.version),
  },
  {
    name: 'verify_fix',
    description: 'Runs the same rules on a corrected docker-compose file you propose, without changing the page, and returns what problems would remain. Always call it before showing the visitor a corrected file, and only show a file once it has no high-severity problems left. Write secrets as ${VARIABLE} references, never real values.',
    inputSchema: {
      type: 'object',
      properties: {
        composeText: { type: 'string', minLength: 10, maxLength: 30000, description: 'The full corrected docker-compose YAML.' },
      },
      required: ['composeText'],
      additionalProperties: false,
    },
    effect: 'read',
    execute: async (args) => App.page.verifyDraft(args.composeText),
  },
];

export function registerActions(actions) {
  for (const a of ACTIONS) actions.register(a);
}
