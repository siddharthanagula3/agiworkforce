#!/usr/bin/env bash
# 90-second demo flow for AGI Workforce CLI.
#
# Pre-reqs:
#   * `agi` on PATH (`cargo install --path apps/cli --bin agi`)
#   * Optional: ANTHROPIC_API_KEY / OPENAI_API_KEY for the live happy-path
#     turn. Without them the --demo synth shows the fallback fire and
#     surfaces a clean classified error.
#
# Hit Enter at each pause. Recommended capture: asciinema or OBS.
set -e

CLI=${CLI:-agi}

# Demo fallback-chain models. Defaults track the canonical catalog
# (packages/types/src/models.json: claude-sonnet-4.6 + gpt-5.5 flagships; the
# CLI resolves the dashed `claude-sonnet-4-6` form to canonical). Override when
# the catalog IDs are renamed/retired so the demo never points at a dead model:
#   DEMO_PRIMARY_MODEL=… DEMO_FALLBACK_MODEL=… ./demo.sh
DEMO_PRIMARY_MODEL=${DEMO_PRIMARY_MODEL:-claude-sonnet-4-6}
DEMO_FALLBACK_MODEL=${DEMO_FALLBACK_MODEL:-gpt-5.5}

pause() { read -r -p "" _; }

clear
echo "=== AGI Workforce CLI demo ==="
echo
echo "We're running v$($CLI --version | awk '{print $2}')."
echo "Four headline differentiators in 90 seconds."
pause

echo "--- 1. Live cost HUD (top-right of the TUI) ---"
echo "Token / cache / dollar / ctx% updates in real time, pricing from"
echo "models.json. Color-shifts grey → orange → red as ctx% grows."
echo "(Skipping live TUI — see screencap; the next steps are all CLI.)"
pause

echo "--- 2. Typed JSON event stream ---"
echo "Every lifecycle event becomes one JSONL object."
$CLI exec --json-events "explain hello.txt in 5 words" 2>&1 | jq -c '{event, model, kind, from, to}' | head -8 || true
pause

echo "--- 3. Multi-model fallback chain ---"
echo "Primary 429s → next model takes over, no operator action."
echo "Using --demo to fire the rate-limit deterministically:"
$CLI --demo --json-events exec -m "$DEMO_PRIMARY_MODEL,$DEMO_FALLBACK_MODEL" "say hello" 2>&1 | grep -E 'spawning|ready|fallback_triggered|↘'
pause

echo "--- 4. Session replay / fork ---"
echo "Every turn is persisted. List, inspect, and fork at any point."
$CLI session list 2>/dev/null | head -6
SID=$($CLI session list 2>/dev/null | awk 'NR==2 {print $1}')
if [ -n "$SID" ]; then
  echo
  $CLI session fork "$SID" --at-turn 0 --as demo-fork
fi
pause

echo "--- 5. Output styles ---"
echo "Three baked styles, user overrides via ~/.agiworkforce/output-styles/."
echo "Swap mid-session with /output-style explanatory."
pause

echo "Done. agi — the AI CLI that doesn't surprise you."
