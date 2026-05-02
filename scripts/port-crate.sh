#!/usr/bin/env bash
set -euo pipefail

# Usage: port-crate.sh <codex-rs-dir-name>
# Example: port-crate.sh rollout-trace
# Example for sub-crate: port-crate.sh memories/read

SRC_NAME="${1:?Usage: port-crate.sh <crate-name>}"
REF_RS=~/Desktop/reference/codex-cli/codex-rs
CRATES=~/Desktop/agiworkforce/crates
SCRIPTS=~/Desktop/agiworkforce/scripts

# Derive target name
# memories/read -> agiworkforce-memories-read  (slash → hyphen)
# codex-mcp -> agiworkforce-mcp  (strip codex- prefix, add agiworkforce-)
# rollout-trace -> agiworkforce-rollout-trace
BASENAME=$(echo "$SRC_NAME" | sed 's|/|-|g')
if [[ "$BASENAME" == codex-* ]]; then
    NEW_NAME="agiworkforce-${BASENAME#codex-}"
else
    NEW_NAME="agiworkforce-${BASENAME}"
fi

TARGET="$CRATES/$NEW_NAME"

if [ -d "$TARGET" ]; then
    echo "Already exists: $TARGET — skipping"
    exit 0
fi

echo "==> Copying $REF_RS/$SRC_NAME → $TARGET"
cp -r "$REF_RS/$SRC_NAME" "$TARGET"

echo "==> Renaming identifiers (codex→agiworkforce)"
while IFS= read -r -d '' f; do
    sed -i '' \
        -e 's/CODEX_/AGIWORKFORCE_/g' \
        -e 's/CODEX/AGIWORKFORCE/g' \
        -e 's/Codex/Agiworkforce/g' \
        -e 's/codex_/agiworkforce_/g' \
        -e 's/codex-/agiworkforce-/g' \
        -e 's/"codex"/"agiworkforce"/g' \
        "$f"
done < <(find "$TARGET" -type f \( -name "*.rs" -o -name "*.toml" -o -name "*.md" -o -name "*.json" \) -print0)

echo "==> Expanding workspace deps in Cargo.toml(s)"
find "$TARGET" -name "Cargo.toml" | while read -r ct; do
    python3 "$SCRIPTS/expand-workspace-deps.py" "$ct"
done

echo "==> Done: $NEW_NAME"
