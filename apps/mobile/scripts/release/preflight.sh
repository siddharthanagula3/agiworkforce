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
require_cmd pnpm

EAS_VERSION="$(eas --version 2>/dev/null | head -n1 || true)"
log "eas-cli: ${EAS_VERSION}"

NODE_VERSION="$(node --version 2>/dev/null || echo none)"
log "node: ${NODE_VERSION}"
case "${NODE_VERSION}" in
  v24.*) log_ok "node version OK" ;;
  *) log_warn "node should be 24.x (repo .nvmrc), got ${NODE_VERSION}" ;;
esac

# --- Auth -----------------------------------------------------------------

require_eas_login
EAS_USER="$(eas whoami 2>/dev/null || true)"
log_ok "EAS account: ${EAS_USER}"

# --- App config -----------------------------------------------------------

require_file "${MOBILE_DIR}/eas.json"
require_file "${MOBILE_DIR}/app.config.js"
log_ok "eas.json + app.config.js present"

log "checking Expo SDK dependency compatibility..."
if pnpm --dir "${MOBILE_DIR}" run check:expo-deps; then
  log_ok "Expo SDK dependencies are compatible"
else
  die "Expo SDK dependency drift detected, run 'pnpm --dir apps/mobile exec expo install --fix --pnpm', reconcile documented exceptions, and verify native builds"
fi

EAS_PROJECT_ID="$({
  cd "${MOBILE_DIR}"
  node -e 'const id = require("./app.config.js").expo?.extra?.eas?.projectId; process.stdout.write(typeof id === "string" ? id : "")'
})"
if [[ ! "${EAS_PROJECT_ID}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  die "EAS project is not linked: run 'cd apps/mobile && eas init', then commit the generated expo.extra.eas.projectId UUID"
fi
log_ok "EAS project linked: ${EAS_PROJECT_ID}"

UPDATES_URL="$({
  cd "${MOBILE_DIR}"
  node -e 'const url = require("./app.config.js").expo?.updates?.url; process.stdout.write(typeof url === "string" ? url : "")'
})"
if [[ "${UPDATES_URL}" != "https://u.expo.dev/${EAS_PROJECT_ID}" ]]; then
  die "Expo Updates URL must target the linked EAS project: https://u.expo.dev/${EAS_PROJECT_ID}"
fi

RUNTIME_VERSION_POLICY="$({
  cd "${MOBILE_DIR}"
  node -e 'const policy = require("./app.config.js").expo?.runtimeVersion?.policy; process.stdout.write(typeof policy === "string" ? policy : "")'
})"
if [[ "${RUNTIME_VERSION_POLICY}" != "fingerprint" ]]; then
  die "Expo runtimeVersion.policy must be fingerprint for native compatibility"
fi
log_ok "Expo Updates URL and fingerprint runtime policy are configured"

# Confirm the profile exists.
if ! jq -e ".build.\"${PROFILE}\"" "${MOBILE_DIR}/eas.json" >/dev/null; then
  die "profile '${PROFILE}' not defined in eas.json"
fi
log_ok "profile '${PROFILE}' defined in eas.json"

UPDATE_CHANNEL="$(jq -r ".build.\"${PROFILE}\".channel // empty" "${MOBILE_DIR}/eas.json")"
if [[ -z "${UPDATE_CHANNEL}" ]]; then
  EXTENDED_PROFILE="$(jq -r ".build.\"${PROFILE}\".extends // empty" "${MOBILE_DIR}/eas.json")"
  if [[ -n "${EXTENDED_PROFILE}" ]]; then
    UPDATE_CHANNEL="$(jq -r ".build.\"${EXTENDED_PROFILE}\".channel // empty" "${MOBILE_DIR}/eas.json")"
  fi
fi
if [[ -z "${UPDATE_CHANNEL}" ]]; then
  die "profile '${PROFILE}' must declare or inherit an EAS Update channel"
fi
log_ok "profile '${PROFILE}' uses update channel '${UPDATE_CHANNEL}'"

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


if [[ "${PROFILE}" == "production" || "${PROFILE}" == "beta" || "${PROFILE}" == "preview" ]]; then
  log "checking TLS SPKI pins..."
  if EXPO_PUBLIC_APP_ENV=production node "${MOBILE_DIR}/scripts/check-tls-pins.mjs"; then
    log_ok "TLS pins provisioned"
  else
    die "TLS SPKI pins are still placeholders, provision real hashes before releasing (runbook: apps/mobile/lib/pinning.ts)"
  fi
fi

# --- Store release-state registry (CRIT-007) -------------------------------
# src/features/release-state/mobileReleaseState.json decides whether the app may name a store or hand
# out a store link. Reconcile it with the live stores before shipping: a record
# that claims a listing which does not exist is a false distribution claim, and
# a live listing the record has not caught up with means the app is still
# hiding real store surfaces from its users.

if [[ "${PROFILE}" == "production" || "${PROFILE}" == "beta" ]]; then
  log "reconciling the store release-state registry with the live stores..."
  if node "${MOBILE_DIR}/scripts/release/verify-store-listings.mjs"; then
    log_ok "release-state registry matches the live App Store and Play listings"
  else
    die "store release-state registry disagrees with the live stores, update apps/mobile/src/features/release-state/mobileReleaseState.json deliberately before releasing"
  fi
fi

# --- Git ------------------------------------------------------------------

if [[ "${REQUIRE_CLEAN}" == "1" ]]; then
  require_clean_git
  log_ok "git working tree is clean"
fi

log_ok "preflight passed for profile=${PROFILE}"
