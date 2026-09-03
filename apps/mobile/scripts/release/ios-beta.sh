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
  --auto-submit    Upload the resulting IPA to TestFlight via eas submit.

Founder action required first, see apps/mobile/scripts/release/EAS_SIGNING_RUNBOOK.md.
EOF
      exit 0
      ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

bash "$(dirname "${BASH_SOURCE[0]}")/preflight.sh" "${PROFILE}" "${AUTO_SUBMIT}" ios 1

if [[ "${AUTO_SUBMIT}" == "1" ]]; then
  log "starting iOS ${PROFILE} build with submission bound to this exact build"
  eas_build ios "${PROFILE}" --auto-submit
  log_ok "iOS build and paired TestFlight submission queued."
else
  log "starting iOS ${PROFILE} build (TestFlight-ready IPA)"
  eas_build ios "${PROFILE}"
  log_ok "iOS build queued. Watch progress: https://expo.dev/accounts → builds"
  log "build only, to upload after it finishes:"
  log "  pnpm --filter @agiworkforce/mobile release:ios:beta:submit -- --build-id <id>"
fi
