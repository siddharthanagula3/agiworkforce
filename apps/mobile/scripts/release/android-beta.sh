#!/usr/bin/env bash
# Build an Android Play Internal Testing beta via EAS.
# Usage: pnpm --filter @agiworkforce/mobile release:android:beta [--auto-submit]
#
# What it does:
#   1. Preflight (EAS login, jq, eas.json, app.config.js)
#   2. eas build --platform android --profile preview (APK for internal sideload)
#   3. If --auto-submit: eas submit --platform android --profile preview (Play Internal Testing track)
#
# Founder action required first — see scripts/release/README.md.

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

AUTO_SUBMIT=0
PROFILE="preview"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto-submit) AUTO_SUBMIT=1; shift ;;
    --profile)     PROFILE="$2"; shift 2 ;;
    --help|-h)
      cat <<EOF
Usage: $0 [--auto-submit] [--profile <name>]
  --auto-submit    Upload AAB to Google Play Internal Testing via eas submit.
  --profile <name> EAS build profile (default: preview).

Notes:
  - 'preview' profile produces an APK for direct install / Firebase distribution.
  - 'production' profile produces an AAB for Play Store; use release:android:prod for that.
EOF
      exit 0
      ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

bash "$(dirname "${BASH_SOURCE[0]}")/preflight.sh" "${PROFILE}"

log "starting Android ${PROFILE} build"
eas_build android "${PROFILE}"
log_ok "Android build queued."

if [[ "${AUTO_SUBMIT}" == "1" ]]; then
  log "submitting Android ${PROFILE} build to Play Internal Testing..."
  eas_submit android "${PROFILE}" --latest
  log_ok "submitted. Appears in Play Console → Internal testing within a few minutes."
fi
