#!/usr/bin/env bash
# verify-surfaces.sh
#
# 6-surface verification harness. Runs typecheck + tests + (where feasible)
# build for each shipping surface, plus the CLI Rust workspace and the
# backend services. Prints a summary table at the end.
#
# Usage:
#   scripts/verify-surfaces.sh           # all surfaces
#   scripts/verify-surfaces.sh fast      # skip slow build steps (Tauri, Expo, vsix)
#   scripts/verify-surfaces.sh cli       # one surface only
#
# Exits non-zero if any required step fails.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="${1:-all}"
declare -A RESULTS

# Helper: run a step, record pass/fail in RESULTS, never abort the script.
step() {
  local name="$1"; shift
  echo ""
  echo "── $name ─────────────────────────────────────────────────"
  if "$@"; then
    RESULTS["$name"]="PASS"
  else
    RESULTS["$name"]="FAIL"
  fi
}

# --- Workspace-wide gates (must pass before per-surface checks) ---
if [[ "$MODE" == "all" || "$MODE" == "fast" ]]; then
  step "workspace:typecheck:all" pnpm typecheck:all
fi

# --- CLI (Rust) ---
if [[ "$MODE" == "all" || "$MODE" == "fast" || "$MODE" == "cli" ]]; then
  step "cli:cargo-check" cargo check --workspace
  step "cli:cargo-test"  cargo test -p agiworkforce-cli --quiet
  if [[ "$MODE" == "all" ]]; then
    step "cli:cargo-clippy" cargo clippy --workspace --lib -- -D warnings -D unsafe-code
  fi
fi

# --- Desktop (Tauri + React) ---
if [[ "$MODE" == "all" || "$MODE" == "fast" || "$MODE" == "desktop" ]]; then
  step "desktop:typecheck" pnpm --filter @agiworkforce/desktop typecheck
  step "desktop:test"      pnpm --filter @agiworkforce/desktop test --run
  if [[ "$MODE" == "all" ]]; then
    # Skip Tauri bundle build by default — it requires Rust + native deps and
    # takes minutes. Caller can opt-in with MODE=desktop-build.
    :
  fi
fi
if [[ "$MODE" == "desktop-build" ]]; then
  step "desktop:tauri-build" pnpm build:desktop
fi

# --- Web (Next.js) ---
if [[ "$MODE" == "all" || "$MODE" == "fast" || "$MODE" == "web" ]]; then
  step "web:typecheck"    pnpm --filter web typecheck
  step "web:test"         pnpm --filter web test
  if [[ "$MODE" == "all" ]]; then
    step "web:build:next-only" pnpm --filter web build:next-only
  fi
fi

# --- Mobile (Expo + RN) ---
if [[ "$MODE" == "all" || "$MODE" == "fast" || "$MODE" == "mobile" ]]; then
  step "mobile:typecheck"  pnpm --filter @agiworkforce/mobile typecheck
  step "mobile:test"       pnpm --filter @agiworkforce/mobile test
  # iOS/Android binary builds need Xcode/Android Studio — never run from this script.
fi

# --- Chrome extension (MV3) ---
if [[ "$MODE" == "all" || "$MODE" == "fast" || "$MODE" == "chrome" ]]; then
  step "chrome:typecheck"  pnpm --filter @agiworkforce/extension typecheck
  step "chrome:test"       pnpm --filter @agiworkforce/extension test
  if [[ "$MODE" == "all" ]]; then
    step "chrome:build"    pnpm --filter @agiworkforce/extension build
  fi
fi

# --- VS Code extension ---
if [[ "$MODE" == "all" || "$MODE" == "fast" || "$MODE" == "vscode" ]]; then
  step "vscode:typecheck"  pnpm --filter agi-workforce typecheck
  step "vscode:test"       pnpm --filter agi-workforce test
  if [[ "$MODE" == "all" ]]; then
    step "vscode:build"    pnpm --filter agi-workforce build
  fi
fi

# --- Backend services ---
if [[ "$MODE" == "all" || "$MODE" == "fast" || "$MODE" == "services" ]]; then
  step "services:api-gateway:test"      pnpm --filter @agiworkforce/api-gateway test
  step "services:signaling-server:test" pnpm --filter @agiworkforce/signaling-server test
fi

# --- Shared packages ---
if [[ "$MODE" == "all" || "$MODE" == "fast" || "$MODE" == "packages" ]]; then
  step "packages:tests" pnpm -r --filter './packages/**' test
fi

# --- Summary ---
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Surface verification summary"
echo "═══════════════════════════════════════════════════════════════"
fail_count=0
for name in "${!RESULTS[@]}"; do
  status="${RESULTS[$name]}"
  if [[ "$status" == "PASS" ]]; then
    printf "  \033[32m✓\033[0m  %s\n" "$name"
  else
    printf "  \033[31m✗\033[0m  %s\n" "$name"
    fail_count=$((fail_count + 1))
  fi
done
echo "═══════════════════════════════════════════════════════════════"
if [[ $fail_count -eq 0 ]]; then
  echo "  All steps passed."
  exit 0
else
  echo "  $fail_count step(s) failed."
  exit 1
fi
