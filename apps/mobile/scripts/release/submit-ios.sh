#!/usr/bin/env bash
# Upload an existing EAS iOS build artifact to TestFlight / App Store Connect.
# Usage:
#   pnpm --filter @agiworkforce/mobile release:ios:beta:submit
#   pnpm --filter @agiworkforce/mobile release:ios:prod:submit
#   ./submit-ios.sh --profile beta --build-id <id>         # specific build
#   ./submit-ios.sh --profile production --path ./app.ipa  # local IPA

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

PROFILE="beta"
BUILD_ID=""
LOCAL_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)  PROFILE="$2"; shift 2 ;;
    --build-id) BUILD_ID="$2"; shift 2 ;;
    --path)     LOCAL_PATH="$2"; shift 2 ;;
    --help|-h)
      cat <<EOF
Usage: $0 [--profile <beta|production>] [--build-id <id> | --path <ipa>]
An exact EAS build id or local IPA path is required.
EOF
      exit 0
      ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

case "${PROFILE}" in
  beta|production) ;;
  *) die "unsupported iOS submit profile: ${PROFILE} (expected beta or production)" ;;
esac
if [[ -n "${BUILD_ID}" && -n "${LOCAL_PATH}" ]]; then
  die "provide only one of --build-id or --path"
fi
if [[ -z "${BUILD_ID}" && -z "${LOCAL_PATH}" ]]; then
  die "provide --build-id or --path; --latest is intentionally unsupported because it can select a build from the wrong channel"
fi

ARGS=()
if [[ -n "${BUILD_ID}" ]]; then
  ARGS+=(--id "${BUILD_ID}")
elif [[ -n "${LOCAL_PATH}" ]]; then
  require_file "${LOCAL_PATH}"
  [[ "${LOCAL_PATH}" == *.ipa ]] || die "iOS submissions require an .ipa file"
  ARGS+=(--path "${LOCAL_PATH}")
else
  die "unreachable submission source"
fi

require_cmd eas
bash "$(dirname "${BASH_SOURCE[0]}")/preflight.sh" "${PROFILE}" 1 ios 0
log "submitting iOS profile=${PROFILE}"
eas_submit ios "${PROFILE}" "${ARGS[@]}"
log_ok "submitted to App Store Connect — appears in TestFlight in 5-30 min after Apple processing."
