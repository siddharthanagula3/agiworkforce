#!/bin/bash
# Objective checks for the web-lane branch. Run through scripts/dev/heavy-job.sh.
# Usage: checks.sh [steps...]   steps: typecheck webtests pkgtests mobiletests lint cargo  (default: all)
set -u
W=${AGI_CHECKOUT:-$HOME/Desktop/agiworkforce}
L=$HOME/.cache/agi-audit/web-lane/logs
mkdir -p "$L"
cd "$W" || exit 2
export TURBO_CACHE_DIR=$HOME/.cache/agi-audit/web-lane/turbo NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS=--max-old-space-size=8192
STEPS="${*:-typecheck webtests pkgtests mobiletests lint cargo}"
SUMMARY="$L/checks-summary.log"
: > "$SUMMARY"
note() { echo "$(date '+%H:%M:%S') $*" | tee -a "$SUMMARY"; }

changed() { { git diff --name-only origin/main...HEAD; git status --porcelain | awk '{print $2}'; } | sort -u; }

for step in $STEPS; do
  case "$step" in
    typecheck)
      note "typecheck start"
      pnpm typecheck:all > "$L/checks-typecheck.log" 2>&1; rc=$?
      note "typecheck rc=$rc"
      [ $rc -ne 0 ] && grep -E "error TS|Failed|ERROR" "$L/checks-typecheck.log" | head -40 >> "$SUMMARY"
      ;;
    webtests)
      files=$(changed | grep -E '^apps/web/.*\.test\.tsx?$' | sed 's#^apps/web/##' | tr '\n' ' ')
      note "web tests start: $(echo $files | wc -w | tr -d ' ') files"
      (cd apps/web && pnpm exec vitest run $files > "$L/checks-webtests.log" 2>&1); rc=$?
      note "web tests rc=$rc $(grep -E '^ *(Test Files|Tests) ' "$L/checks-webtests.log" | tr '\n' ' ')"
      [ $rc -ne 0 ] && grep -E "FAIL|Error:|AssertionError|Unhandled" "$L/checks-webtests.log" | head -40 >> "$SUMMARY"
      ;;
    pkgtests)
      note "contracts tests start"
      (cd packages/contracts/cloud-contracts && pnpm exec vitest run > "$L/checks-pkgtests.log" 2>&1); rc=$?
      note "contracts tests rc=$rc $(grep -E '^ *(Test Files|Tests) ' "$L/checks-pkgtests.log" | tr '\n' ' ')"
      [ $rc -ne 0 ] && grep -E "FAIL|Error:|AssertionError" "$L/checks-pkgtests.log" | head -30 >> "$SUMMARY"
      ;;
    mobiletests)
      files=$(changed | grep -E '^apps/mobile/.*\.test\.tsx?$' | sed 's#^apps/mobile/##' | tr '\n' ' ')
      note "mobile tests start: $files"
      if [ -n "$files" ]; then
        (cd apps/mobile && perl -e 'alarm 600; exec @ARGV' pnpm exec jest $files --forceExit --runInBand > "$L/checks-mobiletests.log" 2>&1); rc=$?
        note "mobile tests rc=$rc $(grep -E '^(Test Suites|Tests):' "$L/checks-mobiletests.log" | tr '\n' ' ')"
        [ $rc -ne 0 ] && grep -E "FAIL|●" "$L/checks-mobiletests.log" | head -30 >> "$SUMMARY"
      fi
      ;;
    lint)
      note "lint start"
      pnpm exec turbo run lint --concurrency=2 > "$L/checks-lint.log" 2>&1; rc=$?
      note "lint rc=$rc"
      [ $rc -ne 0 ] && grep -E "error|✖|warning" "$L/checks-lint.log" | head -40 >> "$SUMMARY"
      ;;
    cargo)
      note "cargo start"
      export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk CARGO_TARGET_DIR=$HOME/.cache/agi-audit/web-lane/cargo-target
      cargo test -p agiworkforce-cli schedules > "$L/checks-cargo.log" 2>&1; rc=$?
      note "cargo rc=$rc $(grep -E '^test result' "$L/checks-cargo.log" | tail -3 | tr '\n' ' ')"
      [ $rc -ne 0 ] && grep -E "^error|FAILED|panicked" "$L/checks-cargo.log" | head -30 >> "$SUMMARY"
      ;;
    related)
      mods=$(changed | grep -E '^apps/web/.*\.tsx?$' | grep -vE '\.test\.tsx?$' | sed -E 's#^apps/web/##; s#\.tsx?$##; s#/route$##' | awk -F/ '{print $(NF-1)"/"$NF}' | sort -u)
      : > "$L/checks-related.list"
      for m in $mods; do rg -l --fixed-strings "$m" apps/web -g '*.test.ts' -g '*.test.tsx' -g '!**/node_modules/**' -g '!**/.next/**' >> "$L/checks-related.list" 2>/dev/null; done
      changed | grep -E '\.test\.tsx?$' > "$L/checks-related.skip"
      files=$(sort -u "$L/checks-related.list" | grep -vxF -f "$L/checks-related.skip" | sed 's#^apps/web/##' | tr '\n' ' ')
      note "related web tests start: $(echo $files | wc -w | tr -d ' ') untouched files that reference a changed module"
      (cd apps/web && pnpm exec vitest run $files > "$L/checks-related.log" 2>&1); rc=$?
      note "related web tests rc=$rc $(grep -E '^ *(Test Files|Tests) ' "$L/checks-related.log" | tr '\n' ' ')"
      [ $rc -ne 0 ] && grep -E "FAIL|AssertionError|Unhandled" "$L/checks-related.log" | head -40 >> "$SUMMARY"
      ;;
    guards)
      for g in mock-exports cron-contract boundaries hardcoded-arrays css-tokens project-context-boundary db-isolation rls-boundary membership-isolation membership-revocation membership-exit-revocation membership-unattended-work trust-boundaries cloud-contract-ownership route-shared-contracts error-contract-parity pagination-contract capability-boundaries model-id-literals; do
        pnpm "check:$g" > "$L/checks-guard-$g.log" 2>&1; rc=$?
        note "guard $g rc=$rc"
        [ $rc -ne 0 ] && tail -15 "$L/checks-guard-$g.log" >> "$SUMMARY"
      done
      ;;
    l1)
      note "test:l1 start"
      pnpm test:l1 > "$L/checks-l1.log" 2>&1; rc=$?
      note "test:l1 rc=$rc $(grep -E '^ *(Test Files|Tests) |^(Test Suites|Tests):' "$L/checks-l1.log" | tail -4 | tr '\n' ' ')"
      [ $rc -ne 0 ] && grep -E "FAIL|AssertionError|✖" "$L/checks-l1.log" | head -40 >> "$SUMMARY"
      ;;
    chain)
      note "guard chain start"
      pnpm check:llm-operability > "$L/checks-chain.log" 2>&1; rc=$?
      note "guard chain rc=$rc"
      tail -25 "$L/checks-chain.log" >> "$SUMMARY"
      ;;
  esac
done
note "done"
cat "$SUMMARY"
