---
id: "PLAN-web-109"
type: "test-plan"
title: "Web · 109. Optional native and ambient extensions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "109"
---
# Web · 109. Optional native and ambient extensions

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S109.16 Messaging-platform access.

- **Expected:** The user can talk to AGI from a messaging platform (Slack, Teams, WhatsApp, Telegram) and get answers there.
- **Code:** partial. Evidence present: apps/web/app/api/github/webhook/route.ts:266
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** Settings > Customize > Slack app > "Add to Slack" (then message AGI in Slack) (labels found in the code)
- **Needs:** a Slack workspace where you can add apps, and a Slack account; the app must be configured by the owner first (see note)
- **Steps:**
  1. Sign in to the web app and open Settings.
  2. Under Customize, click "Slack app".
  3. In the "Slack workspaces you added" card, click "Add to Slack". Slack's install page opens in the browser.
  4. Approve the app in Slack. Come back to Settings and look for the message "AGI was added to Slack. Send it a message there to start."
  5. In Slack, send AGI a direct message or mention it in a channel after /invite-ing it. Click the link it sends to connect your Slack account, then check that "Your Slack accounts" in Settings lists your account and that AGI answers in the thread.
