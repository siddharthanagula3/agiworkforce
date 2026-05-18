#!/usr/bin/env bash
# Build an Android Play Store production release (AAB).
# Usage: pnpm --filter @agiworkforce/mobile release:android:prod [--auto-submit]

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

AUTO_SUBMIT=0
PROFILE="production"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto-submit) AUTO_SUBMIT=1; shift ;;
    --help|-h)
      cat <<EOF
Usage: $0 [--auto-submit]
  --auto-submit    Upload AAB to Google Play (internal track, draft) via eas submit.

Production releases require:
  - Clean git working tree (eas.json requireCommit: true)
  - Google Play upload keystore configured in EAS credentials
  - Play Console service account JSON at apps/mobile/secrets/google-play-service-account.json
EOF
      exit 0
      ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

bash "$(dirname "${BASH_SOURCE[0]}")/preflight.sh" "${PROFILE}"

log "starting Android PRODUCTION build (AAB for Play Store)"
eas_build android "${PROFILE}"
log_ok "Android production build queued."

if [[ "${AUTO_SUBMIT}" == "1" ]]; then
  log "submitting Android production AAB to Play Console (internal track, draft)..."
  eas_submit android "${PROFILE}" --latest
  log_ok "submitted as draft. Promote tracks (internal → closed → production) via Play Console."
fi
