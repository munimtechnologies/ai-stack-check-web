# AI Stack Check

**Is your self-hosted AI stack safe? Paste the compose file and find out in your browser. The file is not uploaded.**

Live page: https://munimv2.github.io/stack-check/

AI Stack Check reads the docker-compose file (or Dockerfile, requirements.txt, package.json or CycloneDX SBOM) of the AI apps a team runs on its own servers: Ollama, Open WebUI, vLLM, LiteLLM, n8n, Dify, Langflow, Flowise, RAGFlow, AnythingLLM, ComfyUI and MCP Inspector. It reports:

- **Known vulnerabilities** in the exact versions you pin, from the curated [ai-stack-advisories](https://github.com/munimtechnologies/ai-stack-advisories) list (210 advisories as of 2026-11-10, including some that have no CVE yet and are not in OSV).
- **Exposure problems** that a version check can't see: an Ollama or ComfyUI API (no login of its own) published on every network interface, vLLM without `--api-key`, LiteLLM without a master key, Langflow auto-login, Open WebUI with `WEBUI_AUTH=False`, secrets written into the file, the Docker socket mounted into a container, privileged containers.
- **Unpinned images** (`latest`, `main`), which nobody can check.

Then, if you want, it **explains the findings in plain words and writes the fixed compose file**, using Firebase AI Logic hybrid inference.

## Private by design: how the hybrid part works

| Step | Where it runs | What it sees |
|---|---|---|
| Version and exposure checks | Your browser (plain JavaScript) | Your file |
| Redaction | Your browser | Your file. API keys, passwords, tokens, credentials in URLs, private keys and public IPs are replaced by `<redacted>`; `${VARIABLE}` references are kept |
| Explanation, "only on this device" (default) | Gemini Nano in Chrome (`InferenceMode.ONLY_ON_DEVICE`) | The redacted file and the findings. Nothing leaves the computer |
| Explanation, "on this device first" | Gemini Nano, with Gemini in the cloud as fallback (`PREFER_ON_DEVICE`) | The same redacted prompt, which the page shows you word for word before you send it |

- **The model never decides what is wrong.** Findings come from fixed rules and the curated list. The model only explains them, and the page flags any CVE or GHSA ID in its answer that is not in the findings.
- **The prompt fits the on-device model.** It is cut to about 16,000 characters, under Chrome's 9,216-token limit; the most urgent findings come first.
- **The page shows where each answer came from** (`response.inferenceSource`): "on this device" or "in the cloud".

Without a Firebase project configured (`web/firebase-config.js` is empty in this repository), the page runs every check and the redaction. Only the explanation is off.

## Run it locally

```sh
python3 -m http.server 8080   # then open http://localhost:8080
npm test                       # node --test, Node 22
```

To turn on explanations, put your Firebase web app config and a reCAPTCHA v3 site key (for App Check) in `web/firebase-config.js`, and enable Firebase AI Logic with the Gemini Developer API in that project. For on-device answers, Chrome 139+ on desktop needs `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled.

## Layout

- `src/core.js`: the version matcher, shared with [AI Stack Guard for Jira](https://github.com/munimtechnologies/jira-ai-stack-guard) (same rules as `scan_stack.py` in ai-stack-advisories).
- `src/exposure.js`: compose-file exposure checks (line based, no YAML library, works on partial pastes).
- `src/redact.js`: secret redaction.
- `src/prompt.js`: the prompt, the answer schema, answer parsing and the invented-ID guard.
- `web/ai.js`: Firebase AI Logic hybrid inference. `web/app.js`: the page.

## Limits

- The checks read what the file says, not what is running. A port bound by a firewall or a reverse proxy in front may already be safe.
- The advisory list covers the 12 products above. Other images are ignored, not cleared.
- Redaction is rule based. Look at the redacted copy (shown on the page) before choosing the cloud fallback.
- Findings are information, not a guarantee. Check every suggested fix before you apply it.

Want every machine checked for you, speed included? [Local AI health check, $49](https://buy.stripe.com/5kQcN43Gcfii6Jo47L3Ru00) for one machine, or [$199](https://buy.stripe.com/aFabJ0foU2vw6Jo8o13Ru01) for a small office (up to 5 machines).

## License

Apache-2.0. Made by MV2 of Munim, Inc. (mv2@munimtech.com) with AI agents.
