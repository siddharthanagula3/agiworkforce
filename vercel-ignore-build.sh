#!/usr/bin/env bash
# Vercel ignoredBuildStep. Exit 1 to BUILD, exit 0 to SKIP.
#
# Every push used to build the whole monorepo. On 2026-08-16 eight commits in
# twelve minutes cost 8h30m of Turbo build CPU, and four of them only touched
# guard configs and generated agent-context graphs that the web app never
# renders. This decides whether the changed paths can affect the deployed site.
#
# Fail open: on any doubt, unknown base commit, git failure, no diff, build.

set -uo pipefail

build() { echo "BUILD: $1"; exit 1; }
skip() { echo "SKIP: $1"; exit 0; }

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
HEAD="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

[ -n "$BASE" ] || build "no previous deployment sha; cannot diff"
git cat-file -e "${BASE}^{commit}" 2>/dev/null || build "previous sha $BASE not in this clone"

CHANGED="$(git diff --name-only "$BASE" "$HEAD" 2>/dev/null)" || build "git diff failed"
[ -n "$CHANGED" ] || skip "no file changes between $BASE and $HEAD"

# Paths that cannot change what the deployed web app serves. Anything not
# matched here builds, so a new top-level directory is never silently skipped.
IRRELEVANT='^(docs/|\.github/|\.claude/|apps/(desktop|mobile|cli|extension|extension-vscode)/|crates/|services/|tools/|\.vscode/|[^/]*\.md$|scripts/config/|docs/agent-context/)'

RELEVANT="$(printf '%s\n' "$CHANGED" | grep -Ev "$IRRELEVANT" || true)"

[ -n "$RELEVANT" ] || skip "$(printf '%s\n' "$CHANGED" | wc -l | tr -d ' ') changed path(s), none affect the web build"

echo "$RELEVANT" | head -20
build "$(printf '%s\n' "$RELEVANT" | wc -l | tr -d ' ') web-relevant path(s) changed"
