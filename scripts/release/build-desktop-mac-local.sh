#!/usr/bin/env bash
# Builds, signs, notarizes and verifies the AGI Desktop macOS release on this
# Mac, with the Developer ID certificate from the login keychain and the App
# Store Connect key from a local file. Nothing is uploaded or published: the
# verified installers are left in apps/desktop/release for a person to release.
#
# Usage: scripts/release/build-desktop-mac-local.sh <version>
#
# Notarization credentials come from AGI_RELEASE_ENV_FILE (default
# ~/.agi-release/notary.env), which sets APPLE_API_KEY (path to the .p8),
# APPLE_API_KEY_ID and APPLE_API_ISSUER. Keep that file outside the repository.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <version>" >&2
  exit 2
fi
version="$1"
if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "ERROR: ${version} is not a SemVer version" >&2
  exit 2
fi
if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo "ERROR: the local release needs an Apple silicon Mac" >&2
  exit 1
fi

repo="$(git rev-parse --show-toplevel)"
cd "$repo"
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: the working tree has uncommitted changes; release from a clean commit" >&2
  exit 1
fi

identity="Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)"
if ! security find-identity -v -p codesigning | grep -qF "\"${identity}\""; then
  echo "ERROR: the keychain has no valid \"${identity}\" certificate" >&2
  exit 1
fi

env_file="${AGI_RELEASE_ENV_FILE:-$HOME/.agi-release/notary.env}"
if [ ! -f "$env_file" ]; then
  echo "ERROR: ${env_file} is missing; see the header of this script" >&2
  exit 1
fi
if [ "$(stat -f '%Lp' "$env_file")" != "600" ]; then
  echo "ERROR: ${env_file} must be readable by its owner only (chmod 600)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
for name in APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER; do
  if [ -z "${!name:-}" ]; then
    echo "ERROR: ${env_file} does not set ${name}" >&2
    exit 1
  fi
done
if [ ! -f "$APPLE_API_KEY" ]; then
  echo "ERROR: APPLE_API_KEY must be the path to the App Store Connect .p8 key" >&2
  exit 1
fi

release_dir="apps/desktop/release"
rm -rf "$release_dir"

node apps/desktop/electron/build-main.mjs

(
  cd apps/desktop
  CSC_NAME="${identity#Developer ID Application: }" \
    CSC_IDENTITY_AUTO_DISCOVERY=true \
    pnpm exec electron-builder --mac --arm64 --x64 \
    --config electron-builder.yml \
    --config.extraMetadata.version="$version" \
    --publish never
)

node apps/desktop/electron/notarizeInstallers.mjs "$release_dir"/*.dmg

scripts/release/verify-desktop-mac-release.sh "$release_dir" "$version"

echo "Verified AGI Desktop ${version} for macOS at ${release_dir}; nothing was published."
