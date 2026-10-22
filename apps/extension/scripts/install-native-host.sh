#!/usr/bin/env bash
# install-native-host.sh
# Installs the com.agiworkforce.browser native messaging host manifest for the
# AGI Extension. Run after installing the desktop app.
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

# Every Chromium browser reads host manifests from <its user data dir>/NativeMessagingHosts.
# Chrome, Chromium and Edge are always written; the others only when the browser's
# user data directory exists, so no folder is created for a browser that is not installed.
case "$(uname -s)" in
  Darwin)
    SUPPORT="$HOME/Library/Application Support"
    ALWAYS_DIRS=(
      "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
      "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
      "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    )
    IF_INSTALLED_DATA_DIRS=(
      "$SUPPORT/BraveSoftware/Brave-Browser"
      "$SUPPORT/Vivaldi"
      "$SUPPORT/Arc/User Data"
      "$SUPPORT/com.operasoftware.Opera"
      "$SUPPORT/Comet"
    )
    DEFAULT_HOST="$HOME/Library/Application Support/com.agiworkforce.desktop/native_messaging_host"
    ;;
  Linux)
    ALWAYS_DIRS=(
      "$HOME/.config/google-chrome/NativeMessagingHosts"
      "$HOME/.config/chromium/NativeMessagingHosts"
      "$HOME/.config/microsoft-edge/NativeMessagingHosts"
    )
    IF_INSTALLED_DATA_DIRS=(
      "$HOME/.config/BraveSoftware/Brave-Browser"
      "$HOME/.config/vivaldi"
      "$HOME/.config/opera"
    )
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

TARGET_DIRS=("${ALWAYS_DIRS[@]}")
for DATA_DIR in "${IF_INSTALLED_DATA_DIRS[@]}"; do
  if [ -d "$DATA_DIR" ]; then
    TARGET_DIRS+=("$DATA_DIR/NativeMessagingHosts")
  fi
done

MANIFEST="$(sed \
  -e "s|<EXTENSION_ID_PLACEHOLDER>|$EXT_ID|g" \
  -e "s|<NATIVE_HOST_PATH_PLACEHOLDER>|$HOST_PATH|g" \
  "$TEMPLATE")"

for DIR in "${TARGET_DIRS[@]}"; do
  mkdir -p "$DIR"
  printf '%s\n' "$MANIFEST" > "$DIR/com.agiworkforce.browser.json"
  echo "Installed: $DIR/com.agiworkforce.browser.json"
done

echo "Reload the extension in each browser's extensions page to apply."
