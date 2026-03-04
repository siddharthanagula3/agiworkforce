#!/usr/bin/env bash
# release.sh — Create and publish a GitHub release with agiworkforce.dmg
# Usage: bash scripts/release.sh [version]
# Example: bash scripts/release.sh v1.1.6

set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  VERSION="v$(python3 -c "import json; d=json.load(open('apps/desktop/src-tauri/tauri.conf.json')); print(d['version'])")"
fi

DMG_SRC="target/release/bundle/dmg/AGI Workforce_${VERSION#v}_aarch64.dmg"
DMG_OUT="target/release/bundle/dmg/agiworkforce.dmg"

echo "==> Creating release $VERSION"
echo "==> Source DMG: $DMG_SRC"

# 1. Verify DMG exists, then copy + rename to agiworkforce.dmg
[[ -f "$DMG_SRC" ]] || { echo "ERROR: DMG not found at $DMG_SRC"; exit 1; }
cp "$DMG_SRC" "$DMG_OUT"
echo "==> Renamed to agiworkforce.dmg"

# 2. Create and push git tag
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"
echo "==> Pushed tag $VERSION"

# 3. Create GitHub release with agiworkforce.dmg attached
gh release create "$VERSION" \
  "$DMG_OUT#AGI Workforce macOS (Apple Silicon)" \
  --title "AGI Workforce $VERSION" \
  --notes "## What's new in $VERSION

### Bug fixes
- Agent mode no longer silently activates when accessibility permissions are not granted — falls back to standard LLM chat with a toast notification
- Fixed: asking the agent to 'search' no longer opens Google in a browser — uses the \`search_web\` tool directly
- Fixed: raw JSON payloads no longer appear in chat after web search or browser tool calls
- Fixed: tool approval dialog now shows parameters as readable key/value pairs instead of raw JSON
- Improved: agent now always writes a natural-language synthesis after running any tool

### Download
Download **agiworkforce.dmg** below (macOS Apple Silicon — signed & notarized)"

echo ""
echo "==> Release $VERSION published!"
echo "==> Download URL: https://github.com/\$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/download/$VERSION/agiworkforce.dmg"
