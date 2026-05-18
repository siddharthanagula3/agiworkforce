#!/usr/bin/env bash
# reference-index/ci/check-ownership-coverage.sh
#
# PHASE 8 CI PROTOTYPE — not yet enabled in any workflow.
#
# For every `reference-index/<surface>-ownership.json`, verifies that:
#
#   1. The JSON validates against `reference-index/ownership-schema.json`
#      (delegates to `reference-index/scripts/validate-ownership.ts`).
#   2. Every TS/TSX file currently in `apps/<surface>/` appears in exactly
#      one `by_owner.<role>` list.
#   3. In `--strict` mode, the `unassigned` role bucket is empty.
#
# Files that are intentionally excluded from coverage:
#   - apps/<surface>/{__tests__,__mocks__,e2e,playwright,tests}/**
#   - apps/<surface>/scripts/**
#   - apps/<surface>/{native,ios,android,src-tauri}/**
#   - apps/<surface>/.expo/**
#   - **/*.d.ts, **/*.config.{js,cjs,mjs,ts}
#
# Intended trigger:
#   Phase 8a: nightly cron, warn-only.
#   Phase 8b: required CI check on PRs that ADD new files under apps/<surface>/.
#             (For PRs that only modify existing files, this script is a no-op
#              because new-file coverage is the actionable failure mode.)
#
# Requires: bash >= 4, jq, pnpm (for `pnpm tsx`).
#
# Exit codes:
#   0  All ownership maps are complete and well-formed.
#   1  At least one coverage gap or validation error.
#   2  Usage / setup error.

set -euo pipefail

[[ "${BASH_SOURCE[0]}" == "${0}" ]] || return 0

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

strict=0
surface_filter=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict)  strict=1; shift ;;
    --surface) surface_filter="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,32p' "$0"
      exit 0
      ;;
    *)
      echo "[check-ownership-coverage] unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

# Find ownership files.
shopt -s nullglob
ownership_files=(reference-index/*-ownership.json)
shopt -u nullglob

if [[ ${#ownership_files[@]} -eq 0 ]]; then
  echo "[check-ownership-coverage] No reference-index/*-ownership.json files. Nothing to check."
  exit 0
fi

# Phase 1: schema validation.
echo "[check-ownership-coverage] Running schema validation..."
strict_flag=""
(( strict )) && strict_flag="--strict"
if ! pnpm tsx reference-index/scripts/validate-ownership.ts $strict_flag; then
  echo "[check-ownership-coverage] schema validation failed (see above)." >&2
  exit 1
fi
echo ""

# Phase 2: coverage check per surface.
total_gaps=0
for f in "${ownership_files[@]}"; do
  surface="$(basename "$f" -ownership.json)"
  if [[ -n "$surface_filter" && "$surface_filter" != "$surface" ]]; then
    continue
  fi
  surface_dir="apps/$surface"
  if [[ ! -d "$surface_dir" ]]; then
    echo "[check-ownership-coverage] WARN: $f exists but $surface_dir does not." >&2
    continue
  fi

  echo "[check-ownership-coverage] Surface: $surface"

  # Build the set of files claimed by the ownership map.
  claimed_file="$(mktemp)"
  present_file="$(mktemp)"
  trap 'rm -f "$claimed_file" "$present_file"' RETURN

  jq -r '.by_owner | to_entries[] | .value[]?' "$f" 2>/dev/null | sort -u > "$claimed_file"

  git ls-files -- \
      "$surface_dir/**/*.ts" \
      "$surface_dir/**/*.tsx" \
    | grep -Ev '/(__tests__|__mocks__|e2e|playwright|tests|scripts|native|ios|android|src-tauri|\.expo)/' \
    | grep -Ev '\.d\.ts$' \
    | grep -Ev '\.(config|setup)\.(js|cjs|mjs|ts)$' \
    | sort -u > "$present_file"

  # Files in tree but not claimed.
  not_claimed=$(comm -23 "$present_file" "$claimed_file")
  # Files claimed but not in tree (stale ownership entries).
  not_in_tree=$(comm -13 "$present_file" "$claimed_file")

  present_count=$(wc -l < "$present_file" | tr -d ' ')

  if [[ -z "$not_claimed" && -z "$not_in_tree" ]]; then
    echo "  OK — $present_count file(s) all owned, no stale entries."
    rm -f "$claimed_file" "$present_file"
    continue
  fi

  if [[ -n "$not_claimed" ]]; then
    count=$(wc -l <<<"$not_claimed" | tr -d ' ')
    echo "  FAIL — $count file(s) in $surface_dir but not in ownership map:" >&2
    while IFS= read -r p; do echo "    + $p" >&2; done <<<"$not_claimed"
    total_gaps=$((total_gaps + count))
  fi

  if [[ -n "$not_in_tree" ]]; then
    count=$(wc -l <<<"$not_in_tree" | tr -d ' ')
    echo "  FAIL — $count file(s) in ownership map but not in tree (stale):" >&2
    while IFS= read -r p; do echo "    - $p" >&2; done <<<"$not_in_tree"
    total_gaps=$((total_gaps + count))
  fi

  rm -f "$claimed_file" "$present_file"
done

if (( total_gaps > 0 )); then
  echo "" >&2
  echo "[check-ownership-coverage] $total_gaps gap(s)." >&2
  echo "  fix: regenerate the ownership map (pnpm tsx reference-index/scripts/generate-<surface>-index.ts)" >&2
  echo "       and/or assign new files to the correct engineer-role bucket." >&2
  exit 1
fi

echo ""
echo "[check-ownership-coverage] OK — every reorganized surface has full coverage."
exit 0
