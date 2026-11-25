#!/bin/bash
# Local-only fixture: a Slack workspace "Acme Dev" and a pending link request, so a person can open the Slack
# link page without a real Slack app. The bot token is not real, so the page cannot fetch the Slack display name
# and must show its fallback wording. Refuses any database that is not on 127.0.0.1.
# Usage: slack-fixture.sh <label>   prints the link address (valid 60 minutes)
set -eu
ENVF=${AGI_CHECKOUT:-$HOME/Desktop/agiworkforce}/apps/web/.env.local
URL=$(grep -E '^DATABASE_URL=' "$ENVF" | tail -1 | cut -d= -f2- | tr -d '"')
if [[ "$URL" != *@127.0.0.1:5432/* ]]; then echo "refusing: not the local database"; exit 2; fi
LABEL=$(echo "${1:-A}" | tr -cd 'A-Z0-9' | cut -c1-6)
TOKEN=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
HASH=$(printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1)
psql "$URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.slack_installations (team_id, team_name, app_id, bot_user_id, bot_token_enc)
values ('T0AGIDEV01', 'Acme Dev', 'A0AGIDEV01', 'B0AGIDEV01', 'local-fixture-not-a-token')
on conflict (team_id) do nothing;
insert into public.slack_link_requests (installation_id, slack_user_id, token_sha256, last_event_id, expires_at)
select id, 'U0AGIDEV${LABEL}', '${HASH}', 'fixture-${LABEL}-$(date +%s)', now() + interval '60 minutes'
from public.slack_installations where team_id = 'T0AGIDEV01'
on conflict (installation_id, slack_user_id) do update
  set token_sha256 = excluded.token_sha256, last_event_id = excluded.last_event_id,
      expires_at = excluded.expires_at, created_at = now();
SQL
echo "http://localhost:3001/slack/link?token=${TOKEN}"
