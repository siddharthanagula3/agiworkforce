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
export EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS="${EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS:-1}"

if [[ "${SKIP_IOS_PREBUILD:-0}" != "1" ]]; then
  pnpm exec expo prebuild --platform ios --clean
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

exit "$status"
