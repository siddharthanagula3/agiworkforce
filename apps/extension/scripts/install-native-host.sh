#!/usr/bin/env bash
# install-native-host.sh
# Installs the com.agiworkforce.browser native messaging host manifest for the
# AGI Workforce Chrome extension. Run after installing the desktop app.
#
# Usage:
#   ./install-native-host.sh <EXTENSION_ID> [HOST_PATH]
#
# EXTENSION_ID  Chrome extension ID (find in chrome://extensions)
# HOST_PATH     Optional path to native_messaging_host.
#               Defaults to the external helper prepared by the AGI desktop app.

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
    CHROMIUM_HOST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    EDGE_HOST_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    DEFAULT_HOST="$HOME/Library/Application Support/com.agiworkforce.desktop/native_messaging_host"
    ;;
  Linux)
    HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    CHROMIUM_HOST_DIR="$HOME/.config/chromium/NativeMessagingHosts"
    EDGE_HOST_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"
    DEFAULT_HOST="/opt/agiworkforce/native_messaging_host"
    ;;
  *)
    echo "Unsupported platform. Use scripts/install-native-host.ps1 on Windows." >&2
    exit 1
    ;;
esac

HOST_PATH="${2:-$DEFAULT_HOST}"
if [ ! -x "$HOST_PATH" ]; then
  echo "Native host helper is missing or not executable: $HOST_PATH" >&2
  echo "Launch AGI Desktop once so it can prepare the external native host helper." >&2
  exit 1
fi
OUT="$HOST_DIR/com.agiworkforce.browser.json"
CHROMIUM_OUT="$CHROMIUM_HOST_DIR/com.agiworkforce.browser.json"
EDGE_OUT="$EDGE_HOST_DIR/com.agiworkforce.browser.json"

mkdir -p "$HOST_DIR"
mkdir -p "$CHROMIUM_HOST_DIR"
mkdir -p "$EDGE_HOST_DIR"

sed \
  -e "s|<EXTENSION_ID_PLACEHOLDER>|$EXT_ID|g" \
  -e "s|<NATIVE_HOST_PATH_PLACEHOLDER>|$HOST_PATH|g" \
  "$TEMPLATE" > "$OUT"
cp "$OUT" "$CHROMIUM_OUT"
cp "$OUT" "$EDGE_OUT"

echo "Installed: $OUT"
echo "Installed: $CHROMIUM_OUT"
echo "Installed: $EDGE_OUT"
echo "Reload the extension in chrome://extensions to apply."
