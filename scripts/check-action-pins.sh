#!/usr/bin/env bash
# scripts/check-action-pins.sh
#
# Verify every external GitHub Action is pinned to a full commit SHA.
# Fails (exit 1) if any `uses:` line points at a tag.
#
# Source: docs/plans/redteam-services.md (red team report 2026-05-04, C3).
#
# Every external action MUST be SHA-pinned, including GitHub-owned actions.
# Owners can grant exceptions by adding the `uses:` value to ALLOWED_UNPINNED
# below with a justification.

set -euo pipefail

WORKFLOWS_DIR="${1:-.github/workflows}"

if [ ! -d "$WORKFLOWS_DIR" ]; then
  echo "ERROR: workflows directory not found: $WORKFLOWS_DIR" >&2
  exit 2
fi

# Specific "external but reviewed" exceptions. Add here ONLY with a
# justification comment in the workflow itself.
ALLOWED_UNPINNED=()

violations=0
checked=0

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

  checked=$((checked + 1))

  # Allow explicit exceptions.
  trusted=0
  for allow in "${ALLOWED_UNPINNED[@]:-}"; do
    if [ "$ref" = "$allow" ]; then trusted=1; break; fi
  done
  if [ "$trusted" -eq 1 ]; then continue; fi

  # Require a 40-char hex SHA. Short SHAs and tags fail.
  if printf '%s' "$version" | grep -Eq '^[0-9a-f]{40}$'; then
    continue
  fi

  echo "::error::Unpinned third-party action: $ref" >&2
  echo "  Pin to a full 40-char commit SHA (with a # vN.N.N comment)." >&2
  violations=$((violations + 1))
done < <(grep -E "^[[:space:]]*-?[[:space:]]*uses:[[:space:]]*" "$WORKFLOWS_DIR"/*.yml 2>/dev/null | cut -d: -f2-)

echo ""
echo "Checked $checked external action references."
if [ "$violations" -gt 0 ]; then
  echo "FAIL: $violations unpinned external action(s)." >&2
  exit 1
fi
echo "PASS: all external actions are SHA-pinned."
