#!/usr/bin/env bash
# Wave 0 smoke-test prep — iOS
# Verifies toolchain, builds a dev client via EAS, and prints install instructions.
# Re-runnable: safe to run more than once (EAS skips builds that are already queued).
#
# Usage: bash apps/mobile/scripts/wave0-smoke/ios-smoke.sh
#        Or from the mobile dir: bash scripts/wave0-smoke/ios-smoke.sh

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
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1 — install it and re-run."
}

require_min_version() {
  local cmd="$1"
  local label="$2"
  local version
  version="$($cmd 2>/dev/null | head -n1 || true)"
  smoke "${label}: ${version:-not found}"
}

# ---------------------------------------------------------------------------
# 1. Toolchain checks
# ---------------------------------------------------------------------------
smoke "=== Step 1: Toolchain ==="

require_cmd xcodebuild
require_cmd eas
require_cmd node
require_cmd pnpm

XCODE_VERSION="$(xcodebuild -version 2>/dev/null | head -n1 || echo 'not found')"
smoke "Xcode: ${XCODE_VERSION}"
case "${XCODE_VERSION}" in
  *"Xcode 16"* | *"Xcode 17"*) ok "Xcode version OK" ;;
  *) warn "Xcode 16+ recommended. Got: ${XCODE_VERSION}" ;;
esac

IOS_SDK="$(xcodebuild -showsdks 2>/dev/null | grep 'iphonesimulator' | tail -n1 || echo 'not found')"
smoke "iOS SDK: ${IOS_SDK}"

NODE_VERSION="$(node --version 2>/dev/null || echo none)"
smoke "Node: ${NODE_VERSION}"
case "${NODE_VERSION}" in
  v22.*) ok "Node version OK" ;;
  *) warn "Node 22.x expected (repo .nvmrc). Got: ${NODE_VERSION}" ;;
esac

EAS_VERSION="$(eas --version 2>/dev/null | head -n1 || echo 'not found')"
smoke "EAS CLI: ${EAS_VERSION}"

# ---------------------------------------------------------------------------
# 2. EAS login check
# ---------------------------------------------------------------------------
smoke "=== Step 2: EAS auth ==="

EAS_USER="$(eas whoami 2>/dev/null || true)"
if [[ -z "${EAS_USER}" ]]; then
  die "Not logged in to EAS. Run: eas login"
fi
ok "EAS account: ${EAS_USER}"

# ---------------------------------------------------------------------------
# 3. Apple Team ID confirmation
# ---------------------------------------------------------------------------
smoke "=== Step 3: Apple Team ID ==="

TEAM_ID="D2PR62RLT4"
smoke "Expected Apple Team ID: ${TEAM_ID}"
smoke "Bundle ID: com.agiworkforce.app"

# The development profile in eas.json uses 'simulator: true' for dev builds.
# This means we get a simulator build by default.
# For a real-device dev build, use --profile preview (no simulator flag).
smoke "Note: development profile targets simulator. Using 'preview' for real device."

# ---------------------------------------------------------------------------
# 4. Check eas.json has the preview profile
# ---------------------------------------------------------------------------
smoke "=== Step 4: Verify eas.json profiles ==="

require_cmd jq

EAS_JSON="${MOBILE_DIR}/eas.json"
[[ -f "${EAS_JSON}" ]] || die "eas.json not found at ${EAS_JSON}"

if jq -e '.build.preview' "${EAS_JSON}" >/dev/null 2>&1; then
  ok "preview profile found in eas.json"
else
  die "preview profile missing from eas.json — cannot build for real device"
fi

# ---------------------------------------------------------------------------
# 5. Trigger EAS build
# ---------------------------------------------------------------------------
smoke "=== Step 5: EAS build (iOS preview — real device) ==="
smoke "This will queue a build on EAS cloud. First build takes ~15 min."
smoke "Subsequent builds with the same cache key are faster (~5-8 min)."
smoke ""
smoke "Build command:"
smoke "  cd ${MOBILE_DIR} && eas build --platform ios --profile preview --non-interactive"
smoke ""

# We print the command rather than run it inline so the founder can inspect
# it and the output is readable. EAS builds are long-running cloud jobs.
printf '\033[1;36m[action]\033[0m Run the following to start the iOS build:\n'
printf '\n'
printf '  cd %s\n' "${MOBILE_DIR}"
printf '  eas build --platform ios --profile preview --non-interactive\n'
printf '\n'

# If EAS_AUTO_BUILD is set to 1, actually run the build.
if [[ "${EAS_AUTO_BUILD:-0}" == "1" ]]; then
  smoke "EAS_AUTO_BUILD=1 — starting build now..."
  (cd "${MOBILE_DIR}" && eas build --platform ios --profile preview --non-interactive) || \
    die "EAS build failed. Check the output above."
fi

# ---------------------------------------------------------------------------
# 6. Install instructions
# ---------------------------------------------------------------------------
smoke "=== Step 6: Install on device ==="
smoke ""
smoke "After the build completes, install using one of these methods:"
smoke ""
smoke "  Option A — QR code (easiest):"
smoke "    1. Open the EAS build URL printed above in a browser"
smoke "    2. Scan the QR code with your iPhone camera"
smoke "    3. Tap 'Install' in Safari"
smoke ""
smoke "  Option B — devicectl (Xcode 15+):"
smoke "    xcrun devicectl device install app --device <UDID> <path/to/AGIWorkforce.ipa>"
smoke "    (Get UDID: xcrun devicectl list devices)"
smoke ""
smoke "  Option C — Expo Go fallback (simulator only):"
smoke "    npx expo start --ios"
smoke ""

# ---------------------------------------------------------------------------
# 7. Test ID
# ---------------------------------------------------------------------------
TEST_ID="ios-smoke-$(date +%Y%m%d-%H%M%S)"
smoke "=== Test run ID: ${TEST_ID} ==="
smoke ""
smoke "Record this ID in SMOKE-TEST-LOG.template.md when you fill it in."
smoke "Build history: https://expo.dev/accounts/${EAS_USER}/projects/agi-workforce/builds"
smoke ""
ok "iOS smoke prep complete. Follow the README.md procedure on the device."
