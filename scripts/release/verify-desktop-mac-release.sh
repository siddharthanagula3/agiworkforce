#!/usr/bin/env bash
# Verifies a signed, notarized AGI Desktop macOS release before anything is
# published. The release workflow and the local Mac release both run this, so a
# build made on either side passes the same checks.
#
# Usage: scripts/release/verify-desktop-mac-release.sh <release-dir> <version>
set -euo pipefail
shopt -s nullglob

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <release-dir> <version>" >&2
  exit 2
fi
out="${1%/}"
EXPECTED_VERSION="$2"

dmgs=("$out"/*.dmg)
if [ "${#dmgs[@]}" -ne 2 ]; then
  echo "ERROR: expected two architecture-specific .dmg installers; got ${#dmgs[@]}" >&2
  exit 1
fi

zips=("$out"/*.zip)
if [ "${#zips[@]}" -ne 2 ]; then
  echo "ERROR: expected two architecture-specific .zip update archives; got ${#zips[@]}" >&2
  exit 1
fi

verify_app() {
  local app_path="$1" expected_arch="$2"
  local plist="${app_path}/Contents/Info.plist"
  local bundle_version
  bundle_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")
  if [ "$bundle_version" != "$EXPECTED_VERSION" ]; then
    echo "ERROR: bundle version ${bundle_version} does not match ${EXPECTED_VERSION}" >&2
    exit 1
  fi
  local protocol_info
  protocol_info=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' "$plist")
  if ! printf '%s\n' "$protocol_info" | grep -F 'agiworkforce-cloud'; then
    echo "ERROR: packaged app is missing the agiworkforce-cloud URL protocol" >&2
    exit 1
  fi
  local executable
  executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")
  local archs
  archs=$(lipo -archs "${app_path}/Contents/MacOS/${executable}")
  if [ "$archs" != "$expected_arch" ]; then
    echo "ERROR: ${app_path} is ${archs}, expected ${expected_arch}" >&2
    exit 1
  fi
  codesign --verify --deep --strict --verbose=2 "$app_path"
  local signature_info
  signature_info=$(codesign -d --verbose=4 "$app_path" 2>&1)
  printf '%s\n' "$signature_info" | grep -F 'Authority=Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)'
  printf '%s\n' "$signature_info" | grep -F 'TeamIdentifier=D2PR62RLT4'
  printf '%s\n' "$signature_info" | grep -E 'flags=.*runtime'
  spctl --assess --type execute --verbose=4 "$app_path"
  local helper="${app_path}/Contents/Resources/agi-input"
  if [ ! -x "$helper" ]; then
    echo "ERROR: ${app_path} does not carry the agi-input helper" >&2
    exit 1
  fi
  if ! lipo -archs "$helper" | tr ' ' '\n' | grep -x "$expected_arch" >/dev/null; then
    echo "ERROR: ${helper} is $(lipo -archs "$helper"), which cannot run as ${expected_arch}" >&2
    exit 1
  fi
  local cli="${app_path}/Contents/Resources/agi-cli/agi"
  if [ ! -x "$cli" ]; then
    echo "ERROR: ${app_path} does not carry the agi CLI" >&2
    exit 1
  fi
  if [ "$(lipo -archs "$cli")" != "$expected_arch" ]; then
    echo "ERROR: ${cli} is $(lipo -archs "$cli"), expected ${expected_arch}" >&2
    exit 1
  fi
  codesign --verify --strict --verbose=2 "$cli"
  local cli_signature
  cli_signature=$(codesign -d --verbose=4 "$cli" 2>&1)
  printf '%s\n' "$cli_signature" | grep -F 'TeamIdentifier=D2PR62RLT4'
  printf '%s\n' "$cli_signature" | grep -E 'flags=.*runtime'
  xcrun stapler validate "$app_path" || {
    xcrun stapler staple "$app_path"
    xcrun stapler validate "$app_path"
  }
}

verify_app "$out/mac/AGI Desktop.app" x86_64
verify_app "$out/mac-arm64/AGI Desktop.app" arm64

for dmg in "${dmgs[@]}"; do
  [ -s "$dmg" ] || { echo "ERROR: empty artifact $dmg" >&2; exit 1; }
  xcrun stapler validate "$dmg" || {
    xcrun stapler staple "$dmg"
    xcrun stapler validate "$dmg"
  }
done

for zip in "${zips[@]}"; do
  [ -s "$zip" ] || { echo "ERROR: empty artifact $zip" >&2; exit 1; }
done

# Local coding sessions spawn `agi app-server` from the bundle, so the CLI the
# signed app carries must speak the protocol this commit declares. It starts
# the arm64 copy, so this check needs an Apple silicon Mac.
node scripts/release/verify-cli-protocol-handshake.mjs \
  "$out/mac-arm64/AGI Desktop.app/Contents/Resources/agi-cli/agi"

# Notarization proves who built the installer, not which bytes arrived.
# /api/download/checksums serves this file, so the download page can only show
# a digest the release itself published.
(
  cd "$out"
  shasum -a 256 ./*.dmg ./*.zip | sed 's| \./| |' > SHA256SUMS
  shasum -a 256 -c SHA256SUMS
  cat SHA256SUMS
)

node --test scripts/lib/rollout/release-guards.test.mjs
node scripts/release/scan-release-artifact.mjs \
  "$out/mac/AGI Desktop.app" \
  "$out/mac-arm64/AGI Desktop.app"
