#!/usr/bin/env bash
# launch-verify.sh — Run all 6 surface verifications in parallel for launch sign-off.
# Usage: bash scripts/launch-verify.sh [--with-builds]
#
# Without --with-builds: runs typecheck + lint + test per surface.
# With --with-builds:    additionally runs production builds (slow).
#
# Exit code:
#   0 — all green
#   1 — at least one surface failed (output stored in /tmp/launch-verify-<surface>.log)

set -uo pipefail

WITH_BUILDS=0
[[ "${1:-}" == "--with-builds" ]] && WITH_BUILDS=1

cd "$(git rev-parse --show-toplevel)" || exit 1

LOG_DIR="/tmp/launch-verify-$(date +%s)"
mkdir -p "$LOG_DIR"
echo "Logs: $LOG_DIR"
echo ""

run_surface() {
  local name="$1"
  local cmd="$2"
  local log="$LOG_DIR/${name}.log"
  echo "▶ [$name] start"
  if bash -c "$cmd" > "$log" 2>&1; then
    echo "✓ [$name] PASS  (log: $log)"
    return 0
  else
    echo "✗ [$name] FAIL  (log: $log)"
    tail -25 "$log" | sed 's/^/   /'
    return 1
  fi
}

# Run 6 surfaces in parallel via background jobs.

pids=()
failures=0

(run_surface "cli-test"        "cargo test -p agiworkforce-cli --lib") &
pids+=($!)

(run_surface "cli-check"       "cargo check --workspace") &
pids+=($!)

(run_surface "desktop"         "pnpm --filter desktop typecheck && pnpm --filter desktop lint && pnpm --filter desktop test -- --run") &
pids+=($!)

(run_surface "web"             "pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test -- --run") &
pids+=($!)

(run_surface "mobile"          "pnpm --filter @agiworkforce/mobile typecheck && pnpm --filter @agiworkforce/mobile lint && pnpm --filter @agiworkforce/mobile test -- --run") &
pids+=($!)

(run_surface "chrome-ext"      "pnpm --filter @agiworkforce/extension typecheck && pnpm --filter @agiworkforce/extension lint && pnpm --filter @agiworkforce/extension test -- --run") &
pids+=($!)

(run_surface "vscode-ext"      "pnpm --filter agi-workforce typecheck && pnpm --filter agi-workforce lint && pnpm --filter agi-workforce test -- --run") &
pids+=($!)

for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failures=$((failures + 1))
  fi
done

if [[ $WITH_BUILDS -eq 1 ]]; then
  echo ""
  echo "--- builds (sequential) ---"
  bpids=()
  (run_surface "build-cli"     "cargo build --release -p agiworkforce-cli") &
  bpids+=($!)
  (run_surface "build-web"     "pnpm --filter web build") &
  bpids+=($!)
  (run_surface "build-chrome"  "pnpm --filter @agiworkforce/extension package") &
  bpids+=($!)
  (run_surface "build-vscode"  "pnpm --filter agi-workforce build") &
  bpids+=($!)
  for pid in "${bpids[@]}"; do
    if ! wait "$pid"; then
      failures=$((failures + 1))
    fi
  done
fi

echo ""
if [[ $failures -eq 0 ]]; then
  echo "═══════════════════════════════════"
  echo "  ALL SURFACES GREEN — LAUNCH READY"
  echo "═══════════════════════════════════"
  exit 0
else
  echo "═══════════════════════════════════"
  echo "  $failures SURFACE(S) FAILED"
  echo "  See $LOG_DIR for details"
  echo "═══════════════════════════════════"
  exit 1
fi
