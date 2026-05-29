#!/usr/bin/env bash
# audit.sh — frozen read-only feedback instrument for the hardening mission.
#
# PROVENANCE: The original audit.sh (referenced by REMEDIATION_BRIEF.md) was
# deleted by a coding agent. This is a RECONSTRUCTION built from the signal set
# documented in REMEDIATION_LOG.md's baseline table. It is a NEW INSTRUMENT:
# absolute counts may differ from the prior baseline (6559/197/21/17/156/4/158/3/4747)
# because grep patterns and exclusions are not guaranteed identical. Treat deltas
# only WITHIN this instrument (baseline-with-this-script vs post-batch-with-this-script).
# Do NOT compare these numbers to the prior documented baseline.
#
# Read-only. Writes audit-report.md. Re-run after every batch.
set -uo pipefail
cd "$(dirname "$0")"

OUT="audit-report.md"

# Resolve a real ripgrep binary (the interactive `rg` is a shell function, unusable in scripts).
RG=""
for cand in /Users/siddhartha/.local/share/opencode/bin/rg /opt/homebrew/bin/rg /usr/local/bin/rg "$(command -v rg 2>/dev/null || true)"; do
  if [ -x "$cand" ]; then RG="$cand"; break; fi
done
if [ -z "$RG" ]; then echo "FATAL: no ripgrep binary found" >&2; exit 1; fi

# Path exclusions (stable across runs)
EXCL=(
  -g '!**/node_modules/**' -g '!**/target/**' -g '!**/dist/**'
  -g '!**/.git/**' -g '!**/_archive/**' -g '!**/.next/**'
  -g '!**/build/**' -g '!**/coverage/**' -g '!**/.turbo/**'
  -g '!**/.cache/**' -g '!**/*.lock' -g '!pnpm-lock.yaml'
  -g '!**/vendor/**' -g '!audit/**' -g '!docs-hardening/**'
)
# Additional exclusions to isolate NON-TEST source
NONTEST=(
  -g '!**/*.test.*' -g '!**/*.spec.*' -g '!**/__tests__/**'
  -g '!**/__mocks__/**' -g '!**/tests/**' -g '!**/test/**'
  -g '!**/*.stories.*' -g '!**/e2e/**' -g '!**/cypress/**'
  -g '!**/mocks/**' -g '!**/*.fixture.*' -g '!**/fixtures/**'
)
TS=(-g '*.ts' -g '*.tsx' -g '*.js' -g '*.jsx' -g '*.mjs' -g '*.cjs')
RS=(-g '*.rs')

count() { "$RG" --no-messages -c "$@" 2>/dev/null | awk -F: '{s+=$NF} END{print s+0}'; }
countlines() { "$RG" --no-messages "$@" 2>/dev/null | wc -l | tr -d ' '; }
countfiles() { "$RG" --no-messages -l "$@" 2>/dev/null | wc -l | tr -d ' '; }

echo "Measuring..." >&2

# 1. Slop markers (non-test source): broad noise gauge
SLOP=$(countlines "${EXCL[@]}" "${NONTEST[@]}" -e 'TODO' -e 'FIXME' -e 'HACK' -e 'XXX' -e 'PLACEHOLDER' -e '\bWIP\b' -e 'TBD' -e 'mock' -e 'mocked' -e 'placeholder')

# 2. Mock/random/hardcoded-data FILES (non-test): files that may render fake data
MOCKFILES=$(countfiles "${EXCL[@]}" "${NONTEST[@]}" "${TS[@]}" -e 'Math\.random' -e 'mockData' -e 'MOCK_' -e 'hardcoded' -e 'fakeData' -e 'dummyData' -e 'sampleData' -e 'faker\.')

# 3. Rust todo!/unimplemented!
RUST_TODO=$(countlines "${EXCL[@]}" "${RS[@]}" -e '\btodo!\s*\(' -e '\bunimplemented!\s*\(')

# 4. `as any`
AS_ANY=$(countlines "${EXCL[@]}" "${TS[@]}" -e '\bas any\b')

# 5. @ts-ignore / @ts-expect-error
TS_IGNORE=$(countlines "${EXCL[@]}" "${TS[@]}" -e '@ts-ignore' -e '@ts-expect-error')

# 6. Skipped / .only / .todo tests (TS) + #[ignore] (Rust)
SKIPPED_TS=$(countlines "${EXCL[@]}" "${TS[@]}" -e '\b(describe|it|test|context)\.(skip|only|todo)\b' -e '\bx(it|describe|test)\b')
SKIPPED_RS=$(countlines "${EXCL[@]}" "${RS[@]}" -e '#\[ignore')
SKIPPED=$((SKIPPED_TS + SKIPPED_RS))

# 7. Duplicate-version files (file basenames suffixed _v2/_enhanced/_new where a base exists)
DUP=$("$RG" --files "${EXCL[@]}" 2>/dev/null | "$RG" -i '_(v2|v3|enhanced|new|copy|old|final)\.(ts|tsx|js|jsx|rs)$' | wc -l | tr -d ' ')

# 8. Rust panic!()
RUST_PANIC=$(countlines "${EXCL[@]}" "${RS[@]}" -e '\bpanic!\s*\(')

# 9. Rust unreachable!()
RUST_UNREACH=$(countlines "${EXCL[@]}" "${RS[@]}" -e '\bunreachable!\s*\(')

# 10. Rust .unwrap()/.expect()
RUST_UNWRAP=$(countlines "${EXCL[@]}" "${RS[@]}" -e '\.unwrap\s*\(\s*\)' -e '\.expect\s*\(')

STAMP=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")

{
echo "# audit-report.md"
echo ""
echo "> RECONSTRUCTED instrument (original deleted). New-instrument numbers — compare deltas only within this script, NOT to the prior documented baseline."
echo ">"
echo "> HEAD: \`$STAMP\`"
echo ""
echo "| Signal | Count |"
echo "| ------ | ----: |"
echo "| Slop markers (non-test) | $SLOP |"
echo "| Mock/random/hardcoded-data files (non-test) | $MOCKFILES |"
echo "| Rust todo!/unimplemented! | $RUST_TODO |"
echo "| \`as any\` | $AS_ANY |"
echo "| @ts-ignore/@ts-expect-error | $TS_IGNORE |"
echo "| Skipped/.only/.todo tests | $SKIPPED |"
echo "| Duplicate-version files | $DUP |"
echo "| Rust panic!() | $RUST_PANIC |"
echo "| Rust unreachable!() | $RUST_UNREACH |"
echo "| Rust .unwrap()/.expect() | $RUST_UNWRAP |"
} > "$OUT"

cat "$OUT"
