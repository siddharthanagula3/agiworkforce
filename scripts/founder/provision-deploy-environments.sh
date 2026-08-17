#!/usr/bin/env bash
# INFRA-60 — create the three GitHub environments the production deploy workflow
# targets and populate the credentials it reads. Until this runs, the workflow at
# .github/workflows/deploy-production.yml cannot execute: it has never run.
#
# Values are read from your shell environment, never typed as arguments, so no
# secret lands in shell history or in a transcript. Export them, run this, then
# `unset` them.
#
# Requires: gh auth login  (the CLI must hold a token with repo admin scope)

set -euo pipefail

REPO="${REPO:-siddharthanagula3/agiworkforce}"

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }

gh auth status >/dev/null 2>&1 || die "gh is not authenticated. Run: gh auth login"

require() {
  local name="$1"
  [ -n "${!name:-}" ] || die "\$$name is not exported. See the export block in the header of this file."
}

# ---------------------------------------------------------------------------
# Secrets, per environment, exactly as deploy-production.yml reads them.
# ---------------------------------------------------------------------------
WEB_SECRETS=(VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID AGI_DATABASE_URL PAGER_WEBHOOK_URL)
GATEWAY_SECRETS=(FLY_API_TOKEN AGI_DATABASE_URL)

# Non-secret build values the workflow reads as vars.*
WEB_VARS=(PRODUCTION_WEB_URL)
GATEWAY_STAGING_VARS=(FLY_GATEWAY_STAGING_APP GATEWAY_STAGING_URL)
GATEWAY_PROD_VARS=(FLY_GATEWAY_PRODUCTION_APP GATEWAY_PRODUCTION_URL)

for v in "${WEB_SECRETS[@]}" "${GATEWAY_SECRETS[@]}" \
         "${WEB_VARS[@]}" "${GATEWAY_STAGING_VARS[@]}" "${GATEWAY_PROD_VARS[@]}"; do
  require "$v"
done

create_env() {
  local env="$1"
  printf 'environment %s ... ' "$env"
  gh api -X PUT "repos/$REPO/environments/$env" --silent
  printf 'ok\n'
}

set_secret() {
  local env="$1" name="$2"
  printf '  secret %-20s ' "$name"
  printf '%s' "${!name}" | gh secret set "$name" --repo "$REPO" --env "$env" --body -
  printf 'set\n'
}

set_var() {
  local env="$1" name="$2"
  printf '  var    %-20s ' "$name"
  gh variable set "$name" --repo "$REPO" --env "$env" --body "${!name}" >/dev/null
  printf 'set\n'
}

create_env production-web
for s in "${WEB_SECRETS[@]}"; do set_secret production-web "$s"; done
for v in "${WEB_VARS[@]}"; do set_var production-web "$v"; done

create_env staging-gateway
for s in "${GATEWAY_SECRETS[@]}"; do set_secret staging-gateway "$s"; done
for v in "${GATEWAY_STAGING_VARS[@]}"; do set_var staging-gateway "$v"; done

create_env production-gateway
for s in "${GATEWAY_SECRETS[@]}"; do set_secret production-gateway "$s"; done
for v in "${GATEWAY_PROD_VARS[@]}"; do set_var production-gateway "$v"; done

cat <<'DONE'

All three environments exist and are populated.

Verify (values are never printed back — only names and timestamps):
  gh api repos/OWNER/REPO/environments --jq '.environments[].name'
  gh secret list --env production-web
  gh variable list --env production-gateway

Then unset the exported values from this shell:
  unset VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID AGI_DATABASE_URL \
        PAGER_WEBHOOK_URL FLY_API_TOKEN PRODUCTION_WEB_URL \
        FLY_GATEWAY_STAGING_APP GATEWAY_STAGING_URL \
        FLY_GATEWAY_PRODUCTION_APP GATEWAY_PRODUCTION_URL
DONE
