# #BuildHybridAI 2026 submission draft: AI Stack Check

Status: draft. Not submittable until an eligible adult registers (Devpost requires the entrant to be of legal age; MV2 of Munim, Inc. enters as a team with that person as the Representative) and the Firebase web config is filled in.

## Tagline
Check your self-hosted AI stack for known vulnerabilities and open doors, privately: Gemini Nano explains what is wrong on your own computer, and the cloud only sees what you approve.

## Inspiration
Small teams now run their own AI apps (Ollama, Open WebUI, vLLM, LiteLLM, n8n) from a docker-compose file. Those files are exactly what you should not paste into a cloud chatbot: they hold API keys, database passwords and internal hostnames. Yet the common mistakes in them are serious: an Ollama API with no login published to the internet, Open WebUI with its login switched off, the Docker socket mounted into an automation tool. On-device AI is the right tool for this job, not just a cheaper one.

## What it does
- Paste a compose file (or Dockerfile, requirements.txt, package.json, CycloneDX SBOM).
- In plain JavaScript in the browser, it matches every pinned version against a curated list of 210 advisories for 12 AI products, and runs exposure rules (open APIs without a login, auth off, secrets in the file, Docker socket, privileged containers).
- It redacts secrets locally and shows the redacted copy.
- "Explain and suggest fixes": Firebase AI Logic hybrid inference. The default is **only on this device** (Gemini Nano in Chrome, `ONLY_ON_DEVICE`). If the user picks "on-device first", it falls back to Gemini in the cloud (`PREFER_ON_DEVICE`), and the page shows the exact redacted prompt before it is sent. A badge shows where each answer was computed (`inferenceSource`).
- The model only explains findings computed by rules; any CVE/GHSA ID in its answer that is not in the findings is flagged.

## How we built it
Static web page (GitHub Pages), Firebase JS SDK 13.3.0 from gstatic as ES modules, Firebase AI Logic with the Gemini Developer API, App Check with reCAPTCHA v3, structured JSON output (headline, steps, patched compose). The version matcher is shared with MV2's open-source AI Stack Guard for Jira. The prompt is capped to fit Chrome's on-device token limit, most urgent findings first.

## Challenges
- Fitting a useful prompt into the on-device context window: findings are ranked and compacted, and the config excerpt is cut with a visible marker.
- Making the privacy promise checkable: redaction runs before any model call, on-device or cloud, and the page shows the exact prompt.
- Keeping a small model honest: it never decides what is wrong, only explains; invented IDs are flagged.

## What's next
More products and rules (Kubernetes manifests, Helm values), and an MCP/agent skill so coding agents can run the same check locally.

## Built with
javascript, firebase-ai-logic, gemini-nano, gemini, chrome-prompt-api, app-check, github-pages

## Disclosure
Built by MV2 of Munim, Inc. with AI agents (Claude). Open source under Apache-2.0: https://github.com/munimtechnologies/ai-stack-check-web
