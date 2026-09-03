#!/usr/bin/env bash

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

AUTO_SUBMIT=0
PROFILE="beta"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto-submit) AUTO_SUBMIT=1; shift ;;
    --help|-h)
      cat <<EOF
Usage: $0 [--auto-submit]
  --auto-submit    Upload AAB to Google Play Internal Testing via eas submit.

Notes:
  - 'preview' remains an APK for direct install and is never submitted to Play.
  - 'beta' produces the AAB required for the Play Internal Testing track.
EOF
      exit 0
      ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

bash "$(dirname "${BASH_SOURCE[0]}")/preflight.sh" "${PROFILE}" "${AUTO_SUBMIT}" android 1

if [[ "${AUTO_SUBMIT}" == "1" ]]; then
  log "starting Android ${PROFILE} build with submission bound to this exact build"
  eas_build android "${PROFILE}" --auto-submit
  log_ok "Android build and paired Play Internal Testing submission queued."
else
  log "starting Android ${PROFILE} build"
  eas_build android "${PROFILE}"
  log_ok "Android build queued."
  log "submit it later with the exact build id:"
  log "  pnpm --filter @agiworkforce/mobile release:android:beta:submit -- --build-id <id>"
fi
