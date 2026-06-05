#!/usr/bin/env bash
# reference-index/ci/check-no-temp-barrels.sh
#
# PHASE 8 CI PROTOTYPE — not yet enabled in any workflow.
#
# Fails if any legacy path listed in `reference-index/temp-barrel-catalog.json`
# still exists in the working tree AND has zero remaining consumers (or, in
# date-threshold mode, simply remains past a parameterized cutoff).
#
# The catalog (produced by Phase 7) is a flat array:
#
#   [
#     {
#       "old_path": "apps/mobile/services/waitlist.ts",
#       "new_path": "apps/mobile/src/features/waitlist/service.ts",
#       "barrel_type": "re-export",
#       "consumers_still_using_old_path": ["apps/mobile/app/.../foo.tsx:38"],
#       "ready_for_removal_when": "all consumers migrated OR phase 7"
#     },
#     ...
#   ]
#
# Two modes:
#
#   * Default: an entry is "due for removal" when its
#     `consumers_still_using_old_path` array is empty. The legacy barrel
#     should have been deleted in the same PR that migrated the last
#     consumer.
#
#   * --threshold YYYY-MM-DD: every legacy path remaining on disk is
#     overdue if today >= threshold. Used as the global Phase 7-→8
#     cutoff: after that date the catalog should be empty regardless of
#     consumer-count bookkeeping.
#
# Intended trigger:
#   Phase 8b: required CI check on every PR that touches `apps/<surface>/`.
#             The gate auto-relaxes when the catalog file is empty / absent.
#
# Usage:
#   reference-index/ci/check-no-temp-barrels.sh                     # default mode
#   reference-index/ci/check-no-temp-barrels.sh --threshold 2026-07-01
#   reference-index/ci/check-no-temp-barrels.sh --dry-run           # list, don't fail
#
# Requires: bash >= 4, jq.
#
# Exit codes:
#   0  No legacy paths are overdue.
#   1  At least one legacy path is overdue.
#   2  Usage error.

set -euo pipefail

[[ "${BASH_SOURCE[0]}" == "${0}" ]] || return 0

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

CATALOG="reference-index/temp-barrel-catalog.json"

threshold=""
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --threshold)  threshold="$2"; shift 2 ;;
    --dry-run)    dry_run=1; shift ;;
    --help|-h)
      sed -n '2,42p' "$0"
      exit 0
      ;;
    *)
      echo "[check-no-temp-barrels] unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$CATALOG" ]]; then
  echo "[check-no-temp-barrels] No catalog at $CATALOG — Phase 7 hasn't shipped or it's been deleted. Nothing to check."
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[check-no-temp-barrels] ERROR: jq is required to parse the catalog." >&2
  exit 2
fi

today="$(date -u +%Y-%m-%d)"

# Flat list: <old_path>\t<consumer_count>
entries=()
while IFS=$'\t' read -r old_path consumer_count; do
  entries+=("$old_path"$'\t'"$consumer_count")
done < <(
  jq -r '
    .[] |
    "\(.old_path)\t\((.consumers_still_using_old_path // []) | length)"
  ' "$CATALOG"
)

violations=0
for line in "${entries[@]}"; do
  IFS=$'\t' read -r old_path consumer_count <<<"$line"

  # If the legacy file is already gone, the catalog entry is satisfied.
  if [[ ! -e "$old_path" ]]; then
    continue
  fi

  due=0
  reason=""

  if [[ "$consumer_count" == "0" ]]; then
    due=1
    reason="zero consumers remain, but the legacy barrel is still on disk"
  fi

  if [[ -n "$threshold" ]] && [[ "$today" > "$threshold" || "$today" == "$threshold" ]]; then
    due=1
    reason="${reason:+$reason; }today ($today) is past --threshold $threshold"
  fi

  if (( due )); then
    if (( dry_run )); then
      echo "WOULD-FAIL: $old_path ($reason)"
    else
      echo "VIOLATION: $old_path" >&2
      echo "  reason:  $reason" >&2
      echo "  fix:     delete the legacy barrel and remove its catalog entry." >&2
      violations=$((violations + 1))
    fi
  fi
done

if (( violations > 0 )); then
  echo "" >&2
  echo "[check-no-temp-barrels] $violations stale legacy path(s) still in the tree." >&2
  exit 1
fi

if (( dry_run )); then
  echo "[check-no-temp-barrels] dry-run complete."
else
  echo "[check-no-temp-barrels] OK — no overdue legacy paths."
fi
exit 0
