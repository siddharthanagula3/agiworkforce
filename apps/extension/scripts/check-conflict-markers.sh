#!/usr/bin/env bash
#
# Pretest guard: fail loudly when unresolved Git merge-conflict markers
# remain in the working tree. Catches the build-blocker class that ate
# `src/inPagePanel/panel.ts` and `pageActions.ts` in May 2026 (see
# `docs/audit/...` for the audit trail).
#
# We grep only at column 0 to avoid false positives on shell heredocs
# or comments that legitimately contain `<<<<<<<` etc. Runs against the
# extension's tracked files relative to the workspace root.
#
# Exit 0 when clean. Exit 1 with a path listing when markers are present.

set -euo pipefail

# Resolve to apps/extension regardless of where the script is invoked from.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Search both src/ and __tests__/ — conflict markers anywhere in our owned
# tree are equally fatal. `git ls-files` keeps us inside tracked files so
# node_modules / dist / .cache cannot trigger a false positive.
#
# Self-review #10 audit 2026-05-19: only match `<<<<<<< ` and `>>>>>>> `
# prefixes — never the bare `=======` line. A standalone `=======` is the
# Markdown h1 underline pattern, and matching it would false-positive any
# README touched in scope. The open + close markers are uniquely produced
# by git merge and never appear in legitimate code.
MATCHES="$(git ls-files src __tests__ 2>/dev/null | xargs grep -l '^<<<<<<< \|^>>>>>>> ' 2>/dev/null || true)"

if [ -n "$MATCHES" ]; then
  echo "[check-conflict-markers] Unresolved merge-conflict markers in:" >&2
  echo "$MATCHES" | sed 's/^/  - /' >&2
  exit 1
fi
