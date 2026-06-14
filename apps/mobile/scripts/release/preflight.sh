#!/usr/bin/env bash
# Verify environment is ready for an EAS release.
# Exits 0 if everything required is in place, non-zero with diagnostics otherwise.
# Run via: pnpm --filter @agiworkforce/mobile release:preflight

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

PROFILE="${1:-production}"

log "preflight for profile: ${PROFILE}"

# --- Toolchain ------------------------------------------------------------

require_cmd eas
require_cmd git
require_cmd jq

EAS_VERSION="$(eas --version 2>/dev/null | head -n1 || true)"
log "eas-cli: ${EAS_VERSION}"

NODE_VERSION="$(node --version 2>/dev/null || echo none)"
log "node: ${NODE_VERSION}"
case "${NODE_VERSION}" in
  v22.*) log_ok "node version OK" ;;
  *) log_warn "node should be 22.x (repo .nvmrc) — got ${NODE_VERSION}" ;;
esac

# --- Auth -----------------------------------------------------------------

require_eas_login
EAS_USER="$(eas whoami 2>/dev/null || true)"
log_ok "EAS account: ${EAS_USER}"

# --- App config -----------------------------------------------------------

require_file "${MOBILE_DIR}/eas.json"
require_file "${MOBILE_DIR}/app.config.js"
log_ok "eas.json + app.config.js present"

# Confirm the profile exists.
if ! jq -e ".build.\"${PROFILE}\"" "${MOBILE_DIR}/eas.json" >/dev/null; then
  die "profile '${PROFILE}' not defined in eas.json"
fi
log_ok "profile '${PROFILE}' defined in eas.json"

# --- Submit credentials (production / preview only) ----------------------

if [[ "${PROFILE}" == "production" || "${PROFILE}" == "preview" ]]; then
  log "checking submit credentials for App Store + Play uploads..."

  IOS_OK=1
  for var in APPLE_ID ASC_APP_ID ASC_API_KEY_ID ASC_API_KEY_ISSUER_ID; do
    if [[ -z "${!var:-}" ]]; then
      log_warn "env ${var} not set — iOS submit will fail"
      IOS_OK=0
    fi
  done
  if [[ ! -f "${SECRETS_DIR}/asc-api-key.p8" ]]; then
    log_warn "missing ${SECRETS_DIR}/asc-api-key.p8 — iOS submit will fail"
    IOS_OK=0
  fi
  [[ "${IOS_OK}" == "1" ]] && log_ok "iOS submit credentials present"

  ANDROID_OK=1
  if [[ ! -f "${SECRETS_DIR}/google-play-service-account.json" ]]; then
    log_warn "missing ${SECRETS_DIR}/google-play-service-account.json — Android submit will fail"
    ANDROID_OK=0
  fi
  [[ "${ANDROID_OK}" == "1" ]] && log_ok "Android submit credentials present"

  if [[ "${IOS_OK}" == "0" || "${ANDROID_OK}" == "0" ]]; then
    log_warn "submit credentials incomplete — build will still work, but ':submit' steps will fail until the founder action items in scripts/release/README.md are done"
  fi
fi

# --- TLS pin guard (#387) -------------------------------------------------
# Fail if any SPKI hashes in lib/pinning.ts are still placeholders.
# Real pin provisioning is an ops task — see the runbook in lib/pinning.ts.

if [[ "${PROFILE}" == "production" || "${PROFILE}" == "preview" ]]; then
  log "checking TLS SPKI pins..."
  if EXPO_PUBLIC_APP_ENV=production node "${MOBILE_DIR}/scripts/check-tls-pins.mjs"; then
    log_ok "TLS pins provisioned"
  else
    die "TLS SPKI pins are still placeholders — provision real hashes before releasing (runbook: apps/mobile/lib/pinning.ts)"
  fi
fi

# --- Git ------------------------------------------------------------------

if [[ "${PROFILE}" == "production" ]]; then
  require_clean_git
  log_ok "git working tree is clean"
fi

log_ok "preflight passed for profile=${PROFILE}"
