#!/usr/bin/env bash
#
# push-prod-env-to-vercel.sh
#
# Pushes the production-required env vars from your LOCAL apps/web/.env.local to
# the Vercel PRODUCTION environment, then triggers a production redeploy.
#
# Why this exists: agiworkforce.com 500s because Vercel production is missing env
# var VALUES that your localhost has. The values are secrets — they live only in
# your .env.local and flow file -> vercel CLI here; they never leave your machine.
#
# Run it yourself:   bash scripts/deploy/push-prod-env-to-vercel.sh
# (Optionally pass a different env file as $1.)
#
set -uo pipefail

ENV_FILE="${1:-apps/web/.env.local}"
[ -f "$ENV_FILE" ] || ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ No env file found (looked for apps/web/.env.local and .env.local)."
  echo "  Pass the path explicitly: bash $0 path/to/.env.local"
  exit 1
fi

# The minimum set for the free-tier public MVP, plus the hero extras.
VARS=(
  GOOGLE_API_KEY                       # free chat model gemini-3.1-flash-lite (free tier, no card)
  CLERK_PUBLISHABLE_KEY                # auth (wraps every page)
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY    # auth (client)
  CLERK_SECRET_KEY                     # auth (server)
  DATABASE_URL                         # Neon (chats/users)
  CSRF_SECRET                          # CSRF (>=32 bytes)
  OPENAI_API_KEY                       # computer-use hero (gpt-5.4-mini, Pro)
  AGI_MANAGED_COMPUTE_PRIVATE_BETA     # computer-use hero gate (set to 1)
)

command -v vercel >/dev/null 2>&1 || { echo "✗ vercel CLI not found. Run: npm i -g vercel"; exit 1; }

echo "Pushing production env from $ENV_FILE -> Vercel production…"
for k in "${VARS[@]}"; do
  # Read the value WITHOUT printing it.
  v="$(grep -E "^${k}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  if [ -z "$v" ]; then
    echo "–  $k not in $ENV_FILE — skipping"
    continue
  fi
  vercel env rm "$k" production -y >/dev/null 2>&1 || true
  if printf '%s' "$v" | vercel env add "$k" production >/dev/null 2>&1; then
    echo "✓  set $k"
  else
    echo "✗  failed to set $k (run 'vercel env add $k production' manually)"
  fi
done

echo ""
echo "Redeploying production…"
vercel --prod --yes
echo ""
echo "Done. Verify: curl -sI https://agiworkforce.com/ | head -1   (expect 200, not 500)"
