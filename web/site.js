// AI Stack Check: mounts the in-browser assistant (open agentic web runtime).
// Copyright 2026 Munim, Inc. Licensed under the Apache License, Version 2.0 (Apache-2.0).
// Made by MV2 of Munim, Inc. with AI agents.
//
// The runtime in ../runtime/ is from cognizant-ai-labs/agentic-web (Apache-2.0). It runs in the
// visitor's browser and talks only to the model provider the visitor picks in "AI model settings"
// (bring your own key). A local Ollama works too: http://localhost:11434/v1 with
// OLLAMA_ORIGINS=https://munimv2.github.io, and then nothing leaves the visitor's machine.
// If anything here fails, the page keeps working without the assistant.

export class AssistantMount {
  static GREETING = 'Hi, I explain what AI Stack Check found and help you fix it. Paste your compose file above and press Check (or ask me to load the sample stack), then ask "what do I fix first?". I only see the findings and the redacted file, never your secrets.';

  // No action here places, sends or deletes anything, so there are no confirmation dialogs.
  static DIALOGS = {};

  static engine = null;

  static siteBase() {
    return new URL('../', import.meta.url).href;
  }

  static status(text) {
    const s = typeof document !== 'undefined' ? document.getElementById('assistant-status') : null;
    if (s) s.textContent = text;
  }

  static greet() {
    const first = document.querySelector('#ns-msgs .ns-msg.bot');
    if (first) first.textContent = AssistantMount.GREETING;
  }

  static async start() {
    try {
      const base = AssistantMount.siteBase();
      const { boot } = await import('../runtime/index.js');
      const booted = await boot('#agent-app', {
        originUrl: base,
        sandboxWorkerUrl: new URL('runtime/sandbox-worker.js', base).href,
      });
      const engine = booted && booted.engine ? booted.engine : null;
      AssistantMount.engine = engine;
      if (engine && !engine.mockLLM && (!engine.byokKey || engine.byokKey === 'demo')) {
        AssistantMount.status('Choose a model in "AI model settings" to start: your own key for any OpenAI-compatible provider, or your local Ollama. The key stays in this browser.');
      } else {
        AssistantMount.status('Assistant connected to this page.');
        AssistantMount.greet();
      }
      return booted;
    } catch (error) {
      AssistantMount.status('The assistant could not load. You can still use the page directly.');
      console.error('Assistant startup failed', error);
      return null;
    }
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') await AssistantMount.start();
