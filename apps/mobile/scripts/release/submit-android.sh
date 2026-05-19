#!/usr/bin/env bash
# Upload an existing EAS Android build artifact to Play Console.
# Usage:
#   pnpm --filter @agiworkforce/mobile release:android:beta:submit
#   ./submit-android.sh --profile production --track production --status draft

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

PROFILE="preview"
BUILD_ID=""
LOCAL_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)  PROFILE="$2"; shift 2 ;;
    --build-id) BUILD_ID="$2"; shift 2 ;;
    --path)     LOCAL_PATH="$2"; shift 2 ;;
    --help|-h)
      cat <<EOF
Usage: $0 [--profile <preview|production>] [--build-id <id> | --path <aab|apk>]
Defaults to the latest preview build if neither --build-id nor --path is given.
EOF
      exit 0
      ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

require_cmd eas
require_eas_login

ARGS=()
if [[ -n "${BUILD_ID}" ]]; then
  ARGS+=(--id "${BUILD_ID}")
elif [[ -n "${LOCAL_PATH}" ]]; then
  require_file "${LOCAL_PATH}"
  ARGS+=(--path "${LOCAL_PATH}")
else
  ARGS+=(--latest)
fi

log "submitting Android profile=${PROFILE}"
eas_submit android "${PROFILE}" "${ARGS[@]}"
log_ok "submitted to Play Console."
