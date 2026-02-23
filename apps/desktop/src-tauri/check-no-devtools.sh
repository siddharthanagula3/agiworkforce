#!/bin/bash
# Fails if the release binary was built with devtools in default tauri features
set -e
TOML="$(dirname "$0")/Cargo.toml"
# Check if "devtools" appears in the tauri dependency features (not in [features] section)
TAURI_LINE=$(grep '^tauri = ' "$TOML" || true)
if echo "$TAURI_LINE" | grep -q '"devtools"'; then
  echo "ERROR: devtools feature must not be in default tauri dependency features for release"
  exit 1
fi
echo "OK: devtools not in default tauri dependency features"
