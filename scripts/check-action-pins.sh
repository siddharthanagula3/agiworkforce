#!/usr/bin/env bash
# scripts/check-action-pins.sh
#
# Verify every GitHub Action, GitHub's own included, is pinned to a full commit
# SHA. Fails (exit 1) if any non-allowlisted `uses:` line points at a tag or,
# when VERIFY_ACTION_PIN_OBJECTS=1, an annotated tag object SHA.
#
# Source: docs/plans/redteam-services.md (red team report 2026-05-04, C3).
#
# A tag can be moved by whoever controls the action's repository, and that
# holds for actions/* as much as for anyone else. Owners can grant exceptions
# by adding the `uses:` value to ALLOWED_UNPINNED below with a justification.

set -euo pipefail

WORKFLOWS_DIR="${1:-.github/workflows}"
VERIFY_ACTION_PIN_OBJECTS="${VERIFY_ACTION_PIN_OBJECTS:-0}"

if [ ! -d "$WORKFLOWS_DIR" ]; then
  echo "ERROR: workflows directory not found: $WORKFLOWS_DIR" >&2
  exit 2
fi

# Specific reviewed exceptions. Add here ONLY with a justification comment in
# the workflow itself.
ALLOWED_UNPINNED=()

violations=0
checked=0
object_checks=0
verified_pins=""
failed_pins=""

if [ "$VERIFY_ACTION_PIN_OBJECTS" = "1" ]; then
  TMP_ROOT="${TMPDIR:-/tmp}/agi-action-pin-check.$$"
  mkdir -p "$TMP_ROOT"
  trap 'rm -rf "$TMP_ROOT"' EXIT
fi

verify_commit_object() {
  action_repo="$1"
  version="$2"
  ref_label="$3"

  object_checks=$((object_checks + 1))

  repo_dir="$TMP_ROOT/check-${object_checks}"
  mkdir -p "$repo_dir"
  (
    cd "$repo_dir"
    git init -q
    git remote add origin "https://github.com/${action_repo}.git"
    git fetch --depth=1 --quiet origin "$version"
    object_type="$(git cat-file -t FETCH_HEAD)"
    if [ "$object_type" != "commit" ]; then
      resolved_commit="$(git rev-parse -q --verify 'FETCH_HEAD^{commit}' 2>/dev/null || true)"
      echo "::error::Pinned action ref is a ${object_type}, not a commit: ${ref_label}" >&2
      if [ -n "$resolved_commit" ]; then
        echo "  Use commit SHA: ${action_repo}@${resolved_commit}" >&2
      fi
      exit 1
    fi
  )
}

while IFS= read -r line; do
  # Strip leading whitespace and the "uses:" key.
  raw=$(printf '%s' "$line" | sed -E 's/^[[:space:]]*-?[[:space:]]*uses:[[:space:]]*//')
  # Drop trailing comments.
  ref=$(printf '%s' "$raw" | sed -E 's/[[:space:]]+#.*$//' | tr -d '"' | tr -d "'")
  # Skip empty / continuation lines.
  if [ -z "$ref" ]; then continue; fi
  # Composite ref: "owner/repo[/path]@version".
  # Locate the @version separator from the right so paths with @ in them work.
  if [[ "$ref" != *"@"* ]]; then continue; fi
  owner_repo=$(printf '%s' "$ref" | sed -E 's/@[^@]+$//')
  version=$(printf '%s' "$ref" | sed -E 's/^.*@//')
  owner=$(printf '%s' "$owner_repo" | cut -d/ -f1)
  repo=$(printf '%s' "$owner_repo" | cut -d/ -f2)
  action_repo="${owner}/${repo}"

  checked=$((checked + 1))

  # Allow explicit exceptions.
  allowed=0
  for allow in "${ALLOWED_UNPINNED[@]:-}"; do
    if [ "$ref" = "$allow" ]; then allowed=1; break; fi
  done
  if [ "$allowed" -eq 1 ]; then continue; fi

  # Require a 40-char hex SHA. Short SHAs and tags fail.
  if printf '%s' "$version" | grep -Eq '^[0-9a-f]{40}$'; then
    if [ "$VERIFY_ACTION_PIN_OBJECTS" = "1" ]; then
      pin="${action_repo}@${version}"
      case "$verified_pins" in
        *"|${pin}|"*) continue ;;
      esac
      case "$failed_pins" in
        *"|${pin}|"*)
          violations=$((violations + 1))
          continue
          ;;
      esac
      if verify_commit_object "$action_repo" "$version" "$ref"; then
        verified_pins="${verified_pins}|${pin}|"
      else
        failed_pins="${failed_pins}|${pin}|"
        violations=$((violations + 1))
      fi
    fi
    continue
  fi

  echo "::error::Unpinned action: $ref" >&2
  echo "  Pin to a full 40-char commit SHA (with a # vN.N.N comment)." >&2
  violations=$((violations + 1))
done < <(grep -hE "^[[:space:]]*-?[[:space:]]*uses:[[:space:]]*" "$WORKFLOWS_DIR"/*.yml "$WORKFLOWS_DIR"/*.yaml 2>/dev/null)

echo ""
echo "Scanned $checked action references."
if [ "$VERIFY_ACTION_PIN_OBJECTS" = "1" ]; then
  echo "Verified $object_checks pinned action object(s)."
fi
if [ "$checked" -eq 0 ]; then
  echo "FAIL: no action reference was read from $WORKFLOWS_DIR, so nothing was measured." >&2
  exit 1
fi
if [ "$violations" -gt 0 ]; then
  echo "FAIL: $violations unpinned action(s)." >&2
  exit 1
fi
echo "PASS: every action is SHA-pinned."
