#!/bin/bash
# Create a brand-new test user in the Clerk DEVELOPMENT instance (test email, no mail sent), so a tester can
# sign in as a first-time Free user without the sign-up form's human check. Refuses a live key.
# Usage: make-free-user.sh <email>
set -u
ENVF=${AGI_CHECKOUT:-$HOME/Desktop/agiworkforce}/apps/web/.env.local
KEY=$(grep -E '^CLERK_SECRET_KEY=' "$ENVF" | tail -1 | cut -d= -f2- | tr -d '"')
case "$KEY" in sk_test_*) ;; *) echo "refusing: not a development key"; exit 2;; esac
EMAIL="$1"
case "$EMAIL" in *+clerk_test@example.com) ;; *) echo "refusing: not a test email"; exit 2;; esac
code=$(curl -s -o /tmp/agi-web-lane-clerk.json -w '%{http_code}' -X POST https://api.clerk.com/v1/users \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  --data "{\"email_address\":[\"$EMAIL\"],\"skip_password_requirement\":true,\"skip_password_checks\":true}")
echo "$EMAIL -> HTTP $code $(python3 -I -c "import json;d=json.load(open('/tmp/agi-web-lane-clerk.json'));print(d.get('id') or [e.get('message') for e in d.get('errors',[])])")"
rm -f /tmp/agi-web-lane-clerk.json
