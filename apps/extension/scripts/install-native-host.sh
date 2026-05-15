#!/usr/bin/env bash
# install-native-host.sh
# Installs the com.agiworkforce.browser native messaging host manifest for the
# AGI Workforce Chrome extension. Run after installing the desktop app.
#
# Usage:
#   ./install-native-host.sh <EXTENSION_ID> [BRIDGE_PATH]
#
# EXTENSION_ID  Chrome extension ID (find in chrome://extensions)
# BRIDGE_PATH   Optional path to agi-workforce-bridge binary.
#               Defaults to /Applications/AGI Workforce.app/Contents/MacOS/agi-workforce-bridge (macOS)

set -euo pipefail

EXT_ID="${1:-}"
if [ -z "$EXT_ID" ]; then
  echo "Usage: $0 <EXTENSION_ID> [BRIDGE_PATH]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../native-host/com.agiworkforce.browser.json.template"

if [ ! -f "$TEMPLATE" ]; then
  echo "Template not found: $TEMPLATE" >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    DEFAULT_BRIDGE="/Applications/AGI Workforce.app/Contents/MacOS/agi-workforce-bridge"
    ;;
  Linux)
    HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    DEFAULT_BRIDGE="/opt/agiworkforce/agi-workforce-bridge"
    ;;
  *)
    echo "Unsupported platform. See native-host/INSTALL.md for Windows instructions." >&2
    exit 1
    ;;
esac

BRIDGE_PATH="${2:-$DEFAULT_BRIDGE}"
OUT="$HOST_DIR/com.agiworkforce.browser.json"

mkdir -p "$HOST_DIR"

sed \
  -e "s|<EXTENSION_ID_PLACEHOLDER>|$EXT_ID|g" \
  -e "s|/Applications/AGI Workforce.app/Contents/MacOS/agi-workforce-bridge|$BRIDGE_PATH|g" \
  "$TEMPLATE" > "$OUT"

echo "Installed: $OUT"
echo "Reload the extension in chrome://extensions to apply."
