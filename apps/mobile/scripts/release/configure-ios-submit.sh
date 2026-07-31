#!/usr/bin/env bash
# Materialize the non-secret App Store Connect application ID in eas.json.
#
# App Store Connect owns this numeric identifier, so CI supplies it through the
# protected mobile-store-release environment instead of committing a guessed
# value. EAS Submit requires the literal value in eas.json for non-interactive
# iOS submissions; shell-style interpolation is not supported for ascAppId.

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

ASC_APP_ID_VALUE="${1:-${ASC_APP_ID:-}}"

require_cmd jq
if [[ ! "${ASC_APP_ID_VALUE}" =~ ^[0-9]+$ ]]; then
  die "ASC_APP_ID must be the numeric Apple ID from App Store Connect > App Information"
fi

CURRENT_ASC_APP_ID="$(jq -r '.submit.production.ios.ascAppId // empty' "${MOBILE_DIR}/eas.json")"
if [[ -n "${CURRENT_ASC_APP_ID}" && "${CURRENT_ASC_APP_ID}" != "${ASC_APP_ID_VALUE}" ]]; then
  die "eas.json ascAppId does not match the protected ASC_APP_ID release value"
fi

if [[ "${CURRENT_ASC_APP_ID}" == "${ASC_APP_ID_VALUE}" ]]; then
  log_ok "iOS submit destination is already configured"
  exit 0
fi

TEMP_EAS_JSON="$(mktemp "${MOBILE_DIR}/eas.json.XXXXXX")"
trap 'rm -f "${TEMP_EAS_JSON}"' EXIT

jq --arg asc_app_id "${ASC_APP_ID_VALUE}" \
  '.submit.production.ios.ascAppId = $asc_app_id' \
  "${MOBILE_DIR}/eas.json" > "${TEMP_EAS_JSON}"
jq -e '.submit.production.ios.ascAppId | test("^[0-9]+$")' "${TEMP_EAS_JSON}" >/dev/null
mv "${TEMP_EAS_JSON}" "${MOBILE_DIR}/eas.json"
trap - EXIT

log_ok "materialized the protected App Store Connect destination in eas.json"
