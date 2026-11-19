#!/bin/sh
# Assemble AI Stack Check 0.2.0 (open agentic website) and run full agent turns with a scripted model.
# Base: munimtechnologies/ai-stack-check-web main. Overlay: its branch agentic-web (the 0.2.0 source).
# Runtime + network builder: cognizant-ai-labs/agentic-web skills/agentify-website (Apache-2.0).
# No browser here: this is the light job. Made by MV2 of Munim, Inc. with AI agents. Apache-2.0.
set -u
OUT=/out
AW=/tmp/agentic-web
SK=$AW/skills/agentify-website
B=/tmp/bundle
O=/tmp/overlay
R=$OUT/report.txt
mkdir -p "$OUT/ref"
note() { echo "$*" | tee -a "$R"; }

note "== commits =="
note "agentic-web=$(git -C $AW rev-parse HEAD)"
note "main=$(git -C $B rev-parse HEAD)"
note "overlay(agentic-web branch)=$(git -C $O rev-parse HEAD)"
note "node=$(node --version)"

# Assemble: main, then the 0.2.0 overlay, then this job's tests, then the runtime and bridge.
rm -rf "$O/.git"
cp -R "$O/." "$B/"
cp /work/test/*.mjs "$B/test/"
cp -R "$SK/runtime" "$B/runtime"
mkdir -p "$B/bridge"
cp "$SK/templates/bridge/action-bridge.html" "$B/bridge/action-bridge.html"
note "== files =="
(cd "$B" && ls -la . web test runtime | head -80) >> "$R" 2>&1

note "== build network =="
(cd "$B" && node "$SK/scripts/build_network.mjs" ai_stack_check.hocon --manifest agent-manifest.json) >> "$R" 2>&1
note "build-exit=$?"
(cd "$B" && node "$SK/scripts/build_network.mjs" ai_stack_check.hocon --manifest agent-manifest.json --check) >> "$R" 2>&1
note "check-exit=$?"

note "== agent turns (scripted model) =="
(cd "$B" && node --test test/agent-turn.test.mjs) > "$OUT/agent-turn-test.txt" 2>&1
note "agent-turn-exit=$?"
tail -40 "$OUT/agent-turn-test.txt" >> "$R"

note "== unit + agentic tests =="
(cd "$B" && node --test test/*.test.js test/agentic.test.mjs) > "$OUT/node-test.txt" 2>&1
note "node-test-exit=$?"
tail -25 "$OUT/node-test.txt" >> "$R"

# Exact reference facts for later runs (WebFetch only paraphrases).
for f in kernel.js actions.js runner.js trace.js index.js; do
  echo "== runtime/$f exports ==" >> "$OUT/ref/runtime-exports.txt"
  grep -nE "^export|^  (async )?[a-zA-Z]+\(.*\) \{$" "$SK/runtime/$f" | head -60 >> "$OUT/ref/runtime-exports.txt" 2>&1
done
grep -nE "role: ?.tool.|content: ?JSON.stringify" "$SK/runtime/runner.js" | head -20 > "$OUT/ref/runner-tool-message.txt" 2>&1
mkdir -p "$OUT/ref/harbor"
cp -R "$AW/examples/harbor_tours_agentified/tests" "$OUT/ref/harbor/tests" 2>/dev/null
cp "$AW/examples/harbor_tours_agentified/site.js" "$AW/examples/harbor_tours_agentified/agent-manifest.json" "$AW/examples/harbor_tours_agentified/links.json" "$OUT/ref/harbor/" 2>/dev/null
cp -R "$SK/SKILL.md" "$SK/references" "$SK/templates" "$OUT/ref/" 2>/dev/null
cp "$AW/docs/worldwide_agentic_web_mvp_spec.md" "$OUT/ref/" 2>/dev/null

# The assembled bundle (no .git), ready to publish once the browser job also passes.
rm -rf "$B/.git"
cp -R "$B" "$OUT/bundle"
(cd "$OUT/bundle" && find . -type f | sort) > "$OUT/bundle-files.txt"
cat "$R"
echo agent-turn-done
