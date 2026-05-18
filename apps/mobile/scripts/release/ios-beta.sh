#!/usr/bin/env bash
# Build an iOS TestFlight beta via EAS (preview profile → ad-hoc / TestFlight).
# Usage: pnpm --filter @agiworkforce/mobile release:ios:beta [--auto-submit]
#
# What it does:
#   1. Preflight (EAS login, jq, eas.json, app.config.js)
#   2. eas build --platform ios --profile preview
#   3. If --auto-submit: eas submit --platform ios --profile preview (uploads to TestFlight)
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
  --auto-submit    Upload the resulting IPA to TestFlight via eas submit.
  --profile <name> EAS build profile (default: preview).

Founder action required first — see apps/mobile/scripts/release/README.md.
EOF
      exit 0
      ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

bash "$(dirname "${BASH_SOURCE[0]}")/preflight.sh" "${PROFILE}"

log "starting iOS ${PROFILE} build (TestFlight-ready IPA)"
eas_build ios "${PROFILE}"
log_ok "iOS build queued. Watch progress: https://expo.dev/accounts → builds"

if [[ "${AUTO_SUBMIT}" == "1" ]]; then
  log "submitting most recent iOS ${PROFILE} build to TestFlight..."
  eas_submit ios "${PROFILE}" --latest
  log_ok "submitted to TestFlight. Apple processing takes 5-30 min before the build appears in App Store Connect → TestFlight."
else
  log "build only — to upload after it finishes:"
  log "  pnpm --filter @agiworkforce/mobile release:ios:beta:submit"
fi
