#!/usr/bin/env bash
# Build an iOS App Store production release via EAS.
# Usage: pnpm --filter @agiworkforce/mobile release:ios:prod [--auto-submit]
#
# What it does:
#   1. Preflight + clean-git check (production requires committed source)
#   2. eas build --platform ios --profile production
#   3. If --auto-submit: eas submit --platform ios --profile production
#
# Production releases land in App Store Connect → TestFlight first.
# Promote to App Store via the App Store Connect UI after Apple review.

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
  --auto-submit    Upload the resulting IPA to App Store Connect via eas submit.

Production releases require:
  - Clean git working tree (eas.json requireCommit: true)
  - Apple Developer Program enrollment active (D2PR62RLT4)
  - App Store Connect API key configured (see scripts/release/README.md)
EOF
      exit 0
      ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

bash "$(dirname "${BASH_SOURCE[0]}")/preflight.sh" "${PROFILE}"

log "starting iOS PRODUCTION build (App Store)"
eas_build ios "${PROFILE}"
log_ok "iOS production build queued."

if [[ "${AUTO_SUBMIT}" == "1" ]]; then
  log "submitting iOS production build to App Store Connect..."
  eas_submit ios "${PROFILE}" --latest
  log_ok "submitted. Apple processing takes 5-30 min, then it appears in App Store Connect → TestFlight."
  log "to release to App Store: log in to App Store Connect → My Apps → AGI → 'Prepare for Submission' → submit for review."
else
  log "build only. To upload after it finishes:"
  log "  pnpm --filter @agiworkforce/mobile release:ios:prod:submit"
fi
