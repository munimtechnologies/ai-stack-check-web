# AI Stack Check

**Is your self-hosted AI stack safe? Paste the compose file and find out in your browser. The file is not uploaded.**

Live page: https://munimv2.github.io/stack-check/

AI Stack Check reads the docker-compose file (or Dockerfile, requirements.txt, package.json or CycloneDX SBOM) of the AI apps a team runs on its own servers: Ollama, Open WebUI, vLLM, LiteLLM, n8n, Dify, Langflow, Flowise, RAGFlow, AnythingLLM, ComfyUI and MCP Inspector. It reports:

- **Known vulnerabilities** in the exact versions you pin, from the curated [ai-stack-advisories](https://github.com/munimtechnologies/ai-stack-advisories) list (210 advisories as of 2026-11-10, including some that have no CVE yet and are not in OSV).
- **Exposure problems** that a version check can't see: an Ollama or ComfyUI API (no login of its own) published on every network interface, vLLM without `--api-key`, LiteLLM without a master key, Langflow auto-login, Open WebUI with `WEBUI_AUTH=False`, secrets written into the file, the Docker socket mounted into a container, privileged containers.
- **Unpinned images** (`latest`, `main`), which nobody can check.

Then, if you want, it **explains the findings in plain words and writes the fixed compose file**.

## An open agentic website (version 0.2, in testing on the `agentic-web` branch)

Version 0.2 turns the page into an [open agentic website](https://github.com/cognizant-ai-labs/agentic-web) (MVP profile 0.2). It publishes `agent-manifest.json`, `ai_stack_check.network.json` and `links.json`, and it embeds an assistant that runs in the visitor's browser with the model the visitor chooses (bring your own key).

- **Your own model, or your own machine.** Any OpenAI-compatible provider that allows CORS works. So does a local Ollama (`http://localhost:11434/v1`, started with `OLLAMA_ORIGINS=https://munimv2.github.io`); then nothing leaves your computer at all.
- **The assistant uses the page's own functions** as `website_*` tools, so it can't disagree with the page:

| Tool | Effect | What it does |
|---|---|---|
| `get_findings` | read | The findings shown on the page: exposure problems, components, advisories. Never the file |
| `check_pasted_file` | write | Presses Check on what you pasted |
| `load_sample_stack` | write | Loads and checks the built-in sample stack |
| `get_redacted_file` | read | The file with secrets and public IPs replaced, for writing a fix |
| `check_component` | read | One product and version against the curated list, no file needed |
| `verify_fix` | read | Re-runs the same rules on the assistant's proposed compose file. The assistant must show a fix only after it passes |

- **Fixes are checked, not just suggested.** Before the assistant shows you a corrected compose file, it runs `verify_fix`, which reports any high-severity problem left and any value that looks like a secret.
- **Nothing irreversible.** No tool sends, places or deletes anything, so there is nothing to confirm.

The runtime in `runtime/`, the bridge page and the network builder are from [cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web) (Apache-2.0). They are copied in at build time; see `test/agentic.test.mjs` and `scripts/agentic-smoke.mjs` for the checks.

## Private by design

| Step | Where it runs | What it sees |
|---|---|---|
| Version and exposure checks | Your browser (plain JavaScript) | Your file |
| Redaction | Your browser | Your file. API keys, passwords, tokens, credentials in URLs, private keys and public IPs are replaced by `<redacted>`; `${VARIABLE}` references are kept |
| Assistant (optional) | The model you pick: your provider, or your own Ollama | Findings and the redacted file only |
| Explanation, "only on this device" (when a Firebase project is configured) | Gemini Nano in Chrome (`InferenceMode.ONLY_ON_DEVICE`) | The redacted file and the findings. Nothing leaves the computer |
| Explanation, "on this device first" | Gemini Nano, with Gemini in the cloud as fallback (`PREFER_ON_DEVICE`) | The same redacted prompt, which the page shows you word for word before you send it |

- **The model never decides what is wrong.** Findings come from fixed rules and the curated list. The model only explains them. The page flags any CVE or GHSA ID in an answer that is not in the findings, and the assistant's instructions forbid advisory IDs that no tool returned.

## Run it locally

```sh
python3 -m http.server 8080   # then open http://localhost:8080
npm test                       # node --test, Node 22
```

## Layout

- `src/core.js`: the version matcher, shared with [AI Stack Guard for Jira](https://github.com/munimtechnologies/jira-ai-stack-guard) (same rules as `scan_stack.py` in ai-stack-advisories).
- `src/exposure.js`: compose-file exposure checks (line based, no YAML library, works on partial pastes).
- `src/redact.js`: secret redaction. `src/prompt.js`: the explanation prompt and the invented-ID guard.
- `web/app.js`: the page object (`App.page`), shared by the page's buttons and the assistant's tools.
- `web/site-actions.js`: the `website_*` tools. `web/site.js`: mounts the assistant. `ai_stack_check.hocon`: the assistant network source.
- `web/ai.js`: Firebase AI Logic hybrid inference (off unless `web/firebase-config.js` is filled in).

## Limits

- The checks read what the file says, not what is running. A port bound by a firewall or a reverse proxy in front may already be safe.
- The advisory list covers the 12 products above. Other images are ignored, not cleared.
- Redaction is rule based. Look at the redacted copy (shown on the page) before using a cloud model.
- The assistant's answers come from a language model. Findings are information, not a guarantee. Check every suggested fix before you apply it.

Want every machine checked for you, speed included? [Local AI health check, $49](https://buy.stripe.com/5kQcN43Gcfii6Jo47L3Ru00) for one machine, or [$199](https://buy.stripe.com/aFabJ0foU2vw6Jo8o13Ru01) for a small office (up to 5 machines).

## License

Apache-2.0. Made by MV2 of Munim, Inc. (mv2@munimtech.com) with AI agents.
