#!/usr/bin/env bash
# Verify environment is ready for an EAS release.
# Exits 0 if everything required is in place, non-zero with diagnostics otherwise.
# Run via: pnpm --filter @agiworkforce/mobile release:preflight

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

PROFILE="${1:-production}"
REQUIRE_SUBMIT="${2:-1}"
PLATFORM="${3:-all}"
REQUIRE_CLEAN="${4:-1}"

case "${REQUIRE_SUBMIT}" in
  0|1) ;;
  *) die "require-submit must be 0 or 1; got ${REQUIRE_SUBMIT}" ;;
esac
case "${REQUIRE_CLEAN}" in
  0|1) ;;
  *) die "require-clean must be 0 or 1; got ${REQUIRE_CLEAN}" ;;
esac
case "${PLATFORM}" in
  ios|android|all) ;;
  *) die "platform must be ios, android, or all; got ${PLATFORM}" ;;
esac

log "preflight for profile=${PROFILE} platform=${PLATFORM} submit=${REQUIRE_SUBMIT}"

# --- Toolchain ------------------------------------------------------------

require_cmd eas
require_cmd git
require_cmd jq
require_cmd node

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

EAS_PROJECT_ID="$({
  cd "${MOBILE_DIR}"
  node -e 'const id = require("./app.config.js").expo?.extra?.eas?.projectId; process.stdout.write(typeof id === "string" ? id : "")'
})"
if [[ ! "${EAS_PROJECT_ID}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  die "EAS project is not linked: run 'cd apps/mobile && eas init', then commit the generated expo.extra.eas.projectId UUID"
fi
log_ok "EAS project linked: ${EAS_PROJECT_ID}"

# Confirm the profile exists.
if ! jq -e ".build.\"${PROFILE}\"" "${MOBILE_DIR}/eas.json" >/dev/null; then
  die "profile '${PROFILE}' not defined in eas.json"
fi
log_ok "profile '${PROFILE}' defined in eas.json"

# --- Submit credentials (store beta / production only) ------------------

if [[ "${REQUIRE_SUBMIT}" == "1" && ("${PROFILE}" == "production" || "${PROFILE}" == "beta") ]]; then
  log "checking ${PLATFORM} submit credentials..."

  if [[ "${PLATFORM}" == "ios" || "${PLATFORM}" == "all" ]]; then
    ASC_APP_ID="$(jq -r '.submit.production.ios.ascAppId // empty' "${MOBILE_DIR}/eas.json")"
    if [[ ! "${ASC_APP_ID}" =~ ^[0-9]+$ ]]; then
      die "iOS store submission requires the non-secret numeric ascAppId in eas.json submit.production.ios"
    fi

    for var in ASC_API_KEY_ID ASC_API_KEY_ISSUER_ID; do
      require_env "${var}"
    done
    require_file "${SECRETS_DIR}/asc-api-key.p8"
    log_ok "iOS submit destination and credentials present"
  fi

  if [[ "${PLATFORM}" == "android" || "${PLATFORM}" == "all" ]]; then
    require_file "${SECRETS_DIR}/google-play-service-account.json"
    log_ok "Android submit credentials present"
  fi
fi

# --- TLS pin guard (#387) -------------------------------------------------
# Fail if any SPKI hashes in lib/pinning.ts are still placeholders.
# Real pin provisioning is an ops task — see the runbook in lib/pinning.ts.

if [[ "${PROFILE}" == "production" || "${PROFILE}" == "beta" || "${PROFILE}" == "preview" ]]; then
  log "checking TLS SPKI pins..."
  if EXPO_PUBLIC_APP_ENV=production node "${MOBILE_DIR}/scripts/check-tls-pins.mjs"; then
    log_ok "TLS pins provisioned"
  else
    die "TLS SPKI pins are still placeholders — provision real hashes before releasing (runbook: apps/mobile/lib/pinning.ts)"
  fi
fi

# --- Git ------------------------------------------------------------------

if [[ "${REQUIRE_CLEAN}" == "1" ]]; then
  require_clean_git
  log_ok "git working tree is clean"
fi

log_ok "preflight passed for profile=${PROFILE}"
