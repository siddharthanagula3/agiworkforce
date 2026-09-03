#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--" ]]; then
  shift
fi

device_udid="${1:-${IOS_DEVICE_UDID:-}}"
device_args=(--device)
if [[ -n "$device_udid" ]]; then
  device_args=(--device "$device_udid")
fi

export APP_ENV="${APP_ENV:-development}"
export EXPO_PUBLIC_APP_ENV="${EXPO_PUBLIC_APP_ENV:-$APP_ENV}"
export AGI_IOS_DEVELOPMENT_TEAM="${AGI_IOS_DEVELOPMENT_TEAM:-D2PR62RLT4}"
export EXPO_IOS_DEVELOPMENT_TEAM="${EXPO_IOS_DEVELOPMENT_TEAM:-$AGI_IOS_DEVELOPMENT_TEAM}"
export EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS="${EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS:-1}"

if [[ "${AGI_SKIP_IOS_SIGNING_IDENTITY_CHECK:-0}" != "1" ]] &&
  ! security find-identity -v -p codesigning |
    grep -Eq "Apple Development:"; then
  cat >&2 <<EOF
No Apple Development signing identity was found in the login keychain.

AGI physical iPhone debug builds default to the company Apple team and will not
silently fall back to a personal Apple ID.

Fix:
  1. Open Xcode -> Settings -> Accounts.
  2. Add/sign in with the company Apple Developer account.
  3. Select the AGI AUTOMATION LLC team (${AGI_IOS_DEVELOPMENT_TEAM}).
  4. Create or download an Apple Development certificate.
  5. Rerun this command.

Temporary escape hatch, only if you intentionally want Xcode to create signing
assets automatically:
  AGI_SKIP_IOS_SIGNING_IDENTITY_CHECK=1 pnpm --filter @agiworkforce/mobile run ios:device:dev -- <device>

EOF
  exit 1
fi

if [[ "${SKIP_IOS_PREBUILD:-0}" != "1" ]]; then
  pnpm exec expo prebuild --platform ios --clean
fi

derived_data_dir="${AGI_IOS_DERIVED_DATA_DIR:-$HOME/Library/Developer/Xcode/DerivedData}"
if [[ "${AGI_IOS_SKIP_DERIVED_DATA_RESET:-0}" != "1" && -d "$derived_data_dir" ]]; then
  rm -rf "$derived_data_dir"/AGIWorkforce-*
fi

project_file="ios/AGIWorkforce.xcodeproj/project.pbxproj"
if [[ -f "$project_file" ]]; then
  AGI_IOS_DEVELOPMENT_TEAM="$AGI_IOS_DEVELOPMENT_TEAM" perl -0pi -e '
    s/DEVELOPMENT_TEAM = "?[A-Z0-9]+"?;/DEVELOPMENT_TEAM = "$ENV{AGI_IOS_DEVELOPMENT_TEAM}";/g;
    s/CODE_SIGN_STYLE = Manual;/CODE_SIGN_STYLE = Automatic;/g;
  ' "$project_file"
fi

if [[ "${AGI_IOS_DEVICE_CLEAN_INSTALL:-0}" == "1" && -n "$device_udid" ]]; then
  xcrun devicectl device uninstall app --device "$device_udid" com.agiworkforce.app || true
fi

log_file="$(mktemp -t agi-ios-device-dev.XXXXXX.log)"
trap 'rm -f "$log_file"' EXIT

set +e
pnpm exec expo run:ios --configuration Debug "${device_args[@]}" 2>&1 | tee "$log_file"
status="${PIPESTATUS[0]}"
set -e

if [[ "$status" -ne 0 ]] &&
  grep -Eq 'profile has not been explicitly trusted|invalid code signature|inadequate entitlements' "$log_file"; then
  cat <<'EOF'

AGI iPhone build installed, but iOS refused to launch it because the local
developer profile is not trusted on the device yet.

On the iPhone:
  Settings -> General -> VPN & Device Management -> Developer App
  Trust the listed developer profile, then rerun:
  pnpm --filter @agiworkforce/mobile run ios:device:dev:no-prebuild -- <device-udid-or-name>

EOF
fi

if [[ "$status" -ne 0 ]] && grep -q 'MismatchedApplicationIdentifierEntitlement' "$log_file"; then
  cat <<EOF

AGI iPhone build is signed for company team ${AGI_IOS_DEVELOPMENT_TEAM}, but the
device still has an older AGI app install with the same bundle id signed by a
different Apple team.

Delete the old AGI Workforce app from the iPhone, or rerun once with:
  AGI_IOS_DEVICE_CLEAN_INSTALL=1 pnpm --filter @agiworkforce/mobile run ios:device:dev:no-prebuild -- <device-udid-or-name>

EOF
fi

exit "$status"
