#!/usr/bin/env bash
# Build an iOS App Store production release via EAS.
# Usage: pnpm --filter @agiworkforce/mobile release:ios:prod [--auto-submit]
#
# What it does:
#   1. Preflight + clean-git check (production requires committed source)
#   2. eas build --platform ios --profile production
#   3. If --auto-submit: bind that exact build to the production submit profile
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

bash "$(dirname "${BASH_SOURCE[0]}")/preflight.sh" "${PROFILE}" "${AUTO_SUBMIT}" ios 1

if [[ "${AUTO_SUBMIT}" == "1" ]]; then
  log "starting iOS PRODUCTION build with submission bound to this exact build"
  eas_build ios "${PROFILE}" --auto-submit
  log_ok "iOS production build and paired App Store Connect submission queued."
  log "to release to App Store: log in to App Store Connect → My Apps → AGI → 'Prepare for Submission' → submit for review."
else
  log "starting iOS PRODUCTION build (App Store)"
  eas_build ios "${PROFILE}"
  log_ok "iOS production build queued."
  log "build only. To upload after it finishes:"
  log "  pnpm --filter @agiworkforce/mobile release:ios:prod:submit -- --build-id <id>"
fi
