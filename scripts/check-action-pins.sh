#!/usr/bin/env bash
# scripts/check-action-pins.sh
#
# Verify every third-party GitHub Action is pinned to a full commit SHA.
# Fails (exit 1) if any non-allowlisted `uses:` line points at a tag or,
# when VERIFY_ACTION_PIN_OBJECTS=1, an annotated tag object SHA.
#
# Source: docs/plans/redteam-services.md (red team report 2026-05-04, C3).
#
# Trusted first-party prefixes may use version tags. Everything else MUST be
# SHA-pinned. Owners can grant exceptions by adding the `uses:` value to
# ALLOWED_UNPINNED below with a justification.

set -euo pipefail

WORKFLOWS_DIR="${1:-.github/workflows}"
VERIFY_ACTION_PIN_OBJECTS="${VERIFY_ACTION_PIN_OBJECTS:-0}"

if [ ! -d "$WORKFLOWS_DIR" ]; then
  echo "ERROR: workflows directory not found: $WORKFLOWS_DIR" >&2
  exit 2
fi

# Trusted first-party allowlist.
TRUSTED_PREFIXES=(
  "actions/"
  "github/"
  "microsoft/"
)

# Specific "third-party but reviewed" exceptions. Add here ONLY with a
# justification comment in the workflow itself.
ALLOWED_UNPINNED=()

violations=0
checked=0
object_checks=0

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

  # Allow trusted prefixes.
  trusted=0
  for prefix in "${TRUSTED_PREFIXES[@]}"; do
    case "$owner_repo/" in
      "$prefix"*) trusted=1; break ;;
    esac
  done
  if [ "$trusted" -eq 1 ]; then continue; fi

  # Allow explicit exceptions.
  for allow in "${ALLOWED_UNPINNED[@]:-}"; do
    if [ "$ref" = "$allow" ]; then trusted=1; break; fi
  done
  if [ "$trusted" -eq 1 ]; then continue; fi

  # Require a 40-char hex SHA. Short SHAs and tags fail.
  if printf '%s' "$version" | grep -Eq '^[0-9a-f]{40}$'; then
    if [ "$VERIFY_ACTION_PIN_OBJECTS" = "1" ]; then
      if ! verify_commit_object "$action_repo" "$version" "$ref"; then
        violations=$((violations + 1))
      fi
    fi
    continue
  fi

  echo "::error::Unpinned third-party action: $ref" >&2
  echo "  Pin to a full 40-char commit SHA (with a # vN.N.N comment)." >&2
  violations=$((violations + 1))
done < <(grep -E "^[[:space:]]*-?[[:space:]]*uses:[[:space:]]*" "$WORKFLOWS_DIR"/*.yml 2>/dev/null | cut -d: -f2-)

echo ""
echo "Scanned $checked action references."
if [ "$VERIFY_ACTION_PIN_OBJECTS" = "1" ]; then
  echo "Verified $object_checks pinned action object(s)."
fi
if [ "$violations" -gt 0 ]; then
  echo "FAIL: $violations unpinned external action(s)." >&2
  exit 1
fi
echo "PASS: all third-party actions are SHA-pinned."
