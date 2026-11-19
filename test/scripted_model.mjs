// A scripted stand-in for the visitor's model, so a full agent turn runs with no LLM provider.
// Copyright 2026 Munim, Inc. Licensed under the Apache License, Version 2.0 (Apache-2.0).
// Made by MV2 of Munim, Inc. with AI agents.
//
// Same contract as the ScriptedModel in cognizant-ai-labs/agentic-web's example tests
// (Apache-2.0): pass it as ctx.llm to the runtime's runAgent. Each step is either
// { tool: "<name>", arguments: {...} } (one tool call) or { text: "<final answer>" }.
export class ScriptedModel {
  constructor(steps) {
    this.steps = steps;
    this.calls = [];
  }

  async chat(request = {}) {
    const tools = [...(request.tools || [])];
    const messages = [...(request.messages || [])];
    this.calls.push({ tools, messages });
    const step = this.steps[this.calls.length - 1];
    if (!step) throw new Error(`ScriptedModel ran out of steps after ${this.steps.length} replies.`);
    if (step.tool) {
      return {
        content: '',
        toolCalls: [{
          id: `call-${this.calls.length}`,
          type: 'function',
          function: { name: step.tool, arguments: JSON.stringify(step.arguments || {}) },
        }],
      };
    }
    return { content: step.text, toolCalls: [] };
  }

  /** Names of the tools offered on call `index` (zero-based). */
  toolNames(index) {
    return this.calls[index].tools.map((t) => (t.function ? t.function.name : t.name));
  }

  /** Parsed tool results the runtime sent back, as seen on call `index`. */
  toolResults(index) {
    return this.calls[index].messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content));
  }

  /** Everything the model was ever sent, as one string (for leak checks). */
  everythingSent() {
    return JSON.stringify(this.calls);
  }
}
