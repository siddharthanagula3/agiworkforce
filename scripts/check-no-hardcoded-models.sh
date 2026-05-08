#!/usr/bin/env bash
# check-no-hardcoded-models.sh
#
# Rust-side regression gate for the locked CLAUDE.md "Critical rules" #1
# ("never hardcode model IDs; read from models.json"). Complements the
# ESLint `no-restricted-syntax` rule (eslint.config.mjs §"PREVENTION
# LAYER") which only sees TS/JS — this script covers `*.rs` so the rule
# is enforced uniformly.
#
# Why a NARROW gate, not a wide one:
#   The 2026-05-05 codebase has ~64 Rust files that already inline model
#   ID literals (mostly in tests, fallback registries, and provider-
#   adapter switch arms). Migrating all 64 is a multi-wave project; a
#   wide gate that fails CI on every one of them would force a
#   wholesale rewrite before this prevention layer can land. So this
#   script narrowly targets the specific patterns the 2026-05-05 audit
#   flagged as P0 ghost-model regressions:
#
#     1. `FAST_STATUS_MODEL = "<literal>"` style consts (the audit
#        flagged the literal `"gpt-5.4"` const at chatwidget.rs:344;
#        the prevention rule is "this const must use the catalog").
#     2. The phantom model `claude-opus-4-6-mini` user-reachable from
#        TUI bottom-pane (audit FINAL_AUDIT §9-§10).
#     3. Any `const FAST_*_MODEL` or `const DEFAULT_*_MODEL` that
#        directly assigns a string literal — these are the patterns
#        most likely to drift past audit cycles.
#
# Wider migration (the 64-file backlog) is tracked under Wave 2's CLI
# and Desktop sweeps — when those land, the entries below can be
# tightened or generalized. For now the gate's job is to keep the
# closed P0s closed.
#
# Wired into .github/workflows/ci.yml lint job (Wave 1.5 prevention).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXIT=0
HITS_FILE="$(mktemp)"
trap 'rm -f "$HITS_FILE"' EXIT

# ---------------------------------------------------------------------------
# Gate 1: ghost-model regression — `claude-opus-4-6-mini` (no such model
# exists in the catalog). The audit found this user-reachable in TUI;
# CI must refuse any future sneak-back.
# ---------------------------------------------------------------------------
echo "gate 1: scanning for the 'claude-opus-4-6-mini' ghost model…"
GHOST_PATTERN='claude-opus-4-6-mini'
# Skip tests + the catalog-mirror's negative assertions; they're the
# regression *test* that the ghost-model rejection is in place. The
# catalog-mirror file (model_catalog.rs) carries a `forbidden` array of
# ghost-model literals as part of its `no_hardcoded_model_ids_in_*`
# regression tests — those are EXPECTED to mention the literal.
# Path-anchored exclusions so future-named "xxx_model_catalog.rs" can't
# bypass the gate. Each legitimate baseline file lives at exactly one
# path in the workspace.
GHOST_BASELINE_REGEX='(__tests__|/(test|tests)/|/tests\.rs|\.test\.|\.spec\.|^\./apps/cli/src/model_catalog\.rs:|^\./packages/types/src/__tests__/model-catalog\.test\.ts:)'
if grep -REn --include='*.rs' --include='*.ts' --include='*.tsx' \
    --exclude-dir=node_modules --exclude-dir=target \
    --exclude-dir=.git --exclude-dir=crates \
    "$GHOST_PATTERN" . 2>/dev/null \
  | grep -Ev "$GHOST_BASELINE_REGEX" \
  > "$HITS_FILE"; then
  if [[ -s "$HITS_FILE" ]]; then
    echo "  FAIL: ghost model 'claude-opus-4-6-mini' present (no such ID in models.json)"
    cat "$HITS_FILE"
    EXIT=1
  else
    echo "  ok"
  fi
else
  echo "  ok"
fi

# ---------------------------------------------------------------------------
# Gate 2: literal-string `FAST_STATUS_MODEL` const assignments. The
# audit flagged `const FAST_STATUS_MODEL: &str = "gpt-5.4";` — the
# canonical pattern is to read from
# `crate::model_catalog::fast_completion_model("openai")` instead.
# Any future const-style hardcode trips this.
# ---------------------------------------------------------------------------
echo "gate 2: scanning for literal FAST_STATUS_MODEL / DEFAULT_*_MODEL consts in Rust…"
# Patterns:
#   const FAST_STATUS_MODEL: &str = "gpt-…"
#   static DEFAULT_FAST_MODEL: &str = "claude-…"
# We tolerate const-from-function-call patterns because those go through
# the catalog (e.g. `fn fast_status_model() -> String`).
LITERAL_CONST_RE='(const|static)[[:space:]]+(FAST|DEFAULT)_[A-Z_]*MODEL[[:space:]]*:[[:space:]]*&?str[[:space:]]*=[[:space:]]*"(gpt-[0-9]|claude-(opus|sonnet|haiku|[0-9])|gemini-[0-9]|grok-[0-9]|o[1-9]-)'
if grep -REn --include='*.rs' \
    --exclude-dir=target --exclude-dir=.git --exclude-dir=crates \
    -E "$LITERAL_CONST_RE" . > "$HITS_FILE" 2>/dev/null; then
  echo "  FAIL: Rust const/static directly assigns a model-ID literal."
  echo "  Read from crate::model_catalog::fast_completion_model(provider) instead."
  cat "$HITS_FILE"
  EXIT=1
else
  echo "  ok"
fi

if [[ $EXIT -eq 0 ]]; then
  echo
  echo "all model-ID gates passed (ESLint covers TS/JS, this script covers Rust)."
fi
exit $EXIT
