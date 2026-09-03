#!/usr/bin/env bash

set -euo pipefail

REPO="${REPO:-siddharthanagula3/agiworkforce}"

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }

gh auth status >/dev/null 2>&1 || die "gh is not authenticated. Run: gh auth login"

require() {
  local name="$1"
  [ -n "${!name:-}" ] || die "\$$name is not exported. See the export block in the header of this file."
}

# Exactly what deploy-production.yml reads. The first four are the ones its
# preflight refuses to start without.
WEB_SECRETS=(VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID AGI_DATABASE_URL PAGER_WEBHOOK_URL)
WEB_VARS=(PRODUCTION_WEB_URL)

for v in "${WEB_SECRETS[@]}" "${WEB_VARS[@]}"; do
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

cat <<'DONE'

production-web is populated.

Verify (values are never printed back, only names and timestamps):
  gh secret list --env production-web
  gh variable list --env production-web

Then unset the exported values from this shell:
  unset VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID AGI_DATABASE_URL \
        PAGER_WEBHOOK_URL PRODUCTION_WEB_URL

The staging-gateway and production-gateway environments are left over from the
Express gateway deleted on 2026-08-17. Nothing reads them. Delete them with:
  gh api -X DELETE repos/OWNER/REPO/environments/staging-gateway
  gh api -X DELETE repos/OWNER/REPO/environments/production-gateway
DONE
