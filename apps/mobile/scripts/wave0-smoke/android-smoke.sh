#!/usr/bin/env bash

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
smoke()    { printf '\033[1;35m[smoke]\033[0m %s\n' "$*"; }
ok()       { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn()     { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()      { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1, install it and re-run."
}

# ---------------------------------------------------------------------------
# 1. Toolchain checks
# ---------------------------------------------------------------------------
smoke "=== Step 1: Toolchain ==="

require_cmd eas
require_cmd node
require_cmd pnpm

NODE_VERSION="$(node --version 2>/dev/null || echo none)"
smoke "Node: ${NODE_VERSION}"
case "${NODE_VERSION}" in
  v24.*) ok "Node version OK" ;;
  *) warn "Node 24.x expected (repo .nvmrc). Got: ${NODE_VERSION}" ;;
esac

EAS_VERSION="$(eas --version 2>/dev/null | head -n1 || echo 'not found')"
smoke "EAS CLI: ${EAS_VERSION}"

# Check for adb (Android Debug Bridge)
if command -v adb >/dev/null 2>&1; then
  ADB_VERSION="$(adb version 2>/dev/null | head -n1 || echo 'not found')"
  smoke "ADB: ${ADB_VERSION}"
  ok "adb found"
else
  warn "adb not found. Install Android SDK Platform-Tools."
  warn "  brew install android-platform-tools"
  warn "  OR download from: https://developer.android.com/studio/releases/platform-tools"
  warn "  ADB is needed to install the APK directly (Option B below)."
fi

# ---------------------------------------------------------------------------
# 2. ADB device check
# ---------------------------------------------------------------------------
smoke "=== Step 2: Connected Android devices ==="

if command -v adb >/dev/null 2>&1; then
  ADB_DEVICES="$(adb devices 2>/dev/null | tail -n +2 | grep -v '^$' || true)"
  if [[ -n "${ADB_DEVICES}" ]]; then
    smoke "Connected devices:"
    echo "${ADB_DEVICES}" | while IFS= read -r line; do
      smoke "  ${line}"
    done
    ok "At least one Android device connected"
  else
    warn "No Android devices detected via adb."
    warn "Check: Settings → Developer options → USB debugging is ON"
    warn "Check: USB cable is connected and 'Allow USB debugging' was tapped on device"
  fi
fi

# ---------------------------------------------------------------------------
# 3. EAS login check
# ---------------------------------------------------------------------------
smoke "=== Step 3: EAS auth ==="

EAS_USER="$(eas whoami 2>/dev/null || true)"
if [[ -z "${EAS_USER}" ]]; then
  die "Not logged in to EAS. Run: eas login"
fi
ok "EAS account: ${EAS_USER}"

# ---------------------------------------------------------------------------
# 4. Verify eas.json profiles
# ---------------------------------------------------------------------------
smoke "=== Step 4: Verify eas.json profiles ==="

require_cmd jq

EAS_JSON="${MOBILE_DIR}/eas.json"
[[ -f "${EAS_JSON}" ]] || die "eas.json not found at ${EAS_JSON}"

if jq -e '.build.preview' "${EAS_JSON}" >/dev/null 2>&1; then
  ok "preview profile found in eas.json"
  PROFILE_TYPE="$(jq -r '.build.preview.android.buildType // "apk"' "${EAS_JSON}")"
  smoke "Android build type: ${PROFILE_TYPE}"
else
  die "preview profile missing from eas.json"
fi

# Android package ID
smoke "Android package: com.agiworkforce.app"

# ---------------------------------------------------------------------------
# 5. Trigger EAS build
# ---------------------------------------------------------------------------
smoke "=== Step 5: EAS build (Android preview APK) ==="
smoke "This will queue a build on EAS cloud. First build takes ~15 min."
smoke "Subsequent builds with same cache key are faster (~5-8 min)."
smoke ""
smoke "Build command:"
smoke "  cd ${MOBILE_DIR} && eas build --platform android --profile preview --non-interactive"
smoke ""

printf '\033[1;36m[action]\033[0m Run the following to start the Android build:\n'
printf '\n'
printf '  cd %s\n' "${MOBILE_DIR}"
printf '  eas build --platform android --profile preview --non-interactive\n'
printf '\n'

# If EAS_AUTO_BUILD is set to 1, actually run the build.
if [[ "${EAS_AUTO_BUILD:-0}" == "1" ]]; then
  smoke "EAS_AUTO_BUILD=1, starting build now..."
  (cd "${MOBILE_DIR}" && eas build --platform android --profile preview --non-interactive) || \
    die "EAS build failed. Check the output above."
fi

# ---------------------------------------------------------------------------
# 6. Install instructions
# ---------------------------------------------------------------------------
smoke "=== Step 6: Install on device ==="
smoke ""
smoke "After the build completes (EAS will print the APK download URL):"
smoke ""
smoke "  Option A, QR code (easiest):"
smoke "    1. Open the EAS build URL in a browser on your Mac"
smoke "    2. Scan the QR code with the Pixel camera"
smoke "    3. Tap the download link, then 'Install' (may need to allow 'Install unknown apps')"
smoke ""
smoke "  Option B, adb install (faster, requires USB):"
smoke "    1. Download the .apk from the EAS build URL to your Mac"
smoke "    2. Run: adb install /path/to/AGIWorkforce-preview.apk"
smoke "    3. Confirm: adb shell am start -n com.agiworkforce.app/.MainActivity"
smoke ""
smoke "  Option C, Expo Go (Metro, no native modules):"
smoke "    npx expo start --android"
smoke "    Note: native modules (llama.rn, executorch) will not work in Expo Go."
smoke ""

# ---------------------------------------------------------------------------
# 7. Android-specific notes
# ---------------------------------------------------------------------------
smoke "=== Step 7: Android-specific notes ==="
smoke ""
smoke "  - Tier 1 (Apple Foundation Models) is iOS-only. Pixel will always"
smoke "    land on Tier 2 (AICore) or Tier 3 (llama.rn)."
smoke ""
smoke "  - If AICore detection fails, the app falls through to Tier 3."
smoke "    This is expected on Pixels running Android < 14 or without an AICore model."
smoke ""
smoke "  - Biometric unlock on Pixel uses fingerprint (not Face ID)."
smoke ""
smoke "  - Model download path on Android: /data/data/com.agiworkforce.app/files/"
smoke "    Check logs with: adb logcat -s ReactNativeJS"
smoke ""

# ---------------------------------------------------------------------------
# 8. Test ID
# ---------------------------------------------------------------------------
TEST_ID="android-smoke-$(date +%Y%m%d-%H%M%S)"
smoke "=== Test run ID: ${TEST_ID} ==="
smoke ""
smoke "Record this ID in SMOKE-TEST-LOG.template.md when you fill it in."
smoke "Build history: https://expo.dev/accounts/${EAS_USER}/projects/agi-workforce/builds"
smoke ""
ok "Android smoke prep complete. Follow the README.md procedure on the device."
