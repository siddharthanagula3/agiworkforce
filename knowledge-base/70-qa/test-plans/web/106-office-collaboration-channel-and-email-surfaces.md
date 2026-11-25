---
id: "PLAN-web-106"
type: "test-plan"
title: "Web · 106. Office, collaboration-channel, and email surfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "106"
---
# Web · 106. Office, collaboration-channel, and email surfaces

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S106.13 Slack direct-message assistant.

- **Expected:** A user can DM the product's Slack bot and gets the assistant's reply in that DM.
- **Code:** partial. Evidence moved: apps/web/app/api/webhooks/slack/route.ts:84; apps/web/app/api/webhooks/slack/route.ts:89; apps/web/lib/slack/slack-events.ts:67; apps/web/lib/slack/slack-assistant.ts:320; apps/web/lib/slack/slack-assistant.ts:367; apps/web/lib/slack/slack-assistant-turn.ts:408; apps/web/lib/slack/slack-assistant-turn.ts:415; apps/web/lib/slack/slack-assistant-turn.ts (text found, layout changed); apps/web/lib/slack/slack-assistant-turn.ts:554; apps/web/lib/slack/slack-assistant.ts:156; apps/web/app/api/slack/install/route.ts:63; apps/web/app/api/slack/oauth/callback/route.ts:124; apps/web/app/api/slack/link/route.ts:115; apps/web/app/slack/link/page.tsx:139 (quoted code not found in the file now); apps/web/features/settings/sections/SlackSection.tsx:461 (quoted code not found in the file now); apps/web/features/settings/sections/SlackSection.tsx:577; apps/web/app/api/slack/runs/[runId]/approval/route.ts:50
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** Settings > Customize > Slack app > Slack workspaces you added > Add to Slack, then message AGI in Slack (labels found in the code)
- **Needs:** a Slack workspace where you can add apps, the Slack app set up by the owner first (see the code note)
- **Steps:**
  1. Open Settings and choose Slack app under Customize.
  2. In the card Slack workspaces you added, click Add to Slack, and finish the install on Slack's own page.
  3. In Slack, open a direct message with the AGI app and send a message such as hello.
  4. Look at the DM: the assistant's reply should appear in that same DM, and compare it with Expected.

## S106.14 Slack channel agent.

- **Expected:** An agent listens in a Slack channel and acts (and reports back) when channel messages or events arrive.
- **Code:** partial. Evidence present: apps/web/app/api/webhooks/slack/route.ts:84; apps/web/app/api/webhooks/slack/route.ts:89; apps/web/lib/slack/slack-events.ts:68; apps/web/lib/slack/slack-config.ts:14; apps/web/lib/slack/slack-config.ts:15; apps/web/lib/slack/slack-api.ts:273; apps/web/lib/slack/slack-api.ts:302; apps/web/lib/slack/slack-context.ts:95; apps/web/lib/slack/slack-context.ts:108; apps/web/lib/slack/slack-context.ts:192; apps/web/lib/slack/slack-assistant-turn.ts:109; apps/web/lib/slack/slack-assistant-turn.ts:491; apps/web/lib/slack/slack-assistant-turn.ts:522; apps/web/lib/slack/slack-assistant.ts:99; apps/web/lib/slack/slack-assistant.ts:156; apps/web/lib/slack/slack-messages.ts:166
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** Settings > Customize > Slack app > Slack workspaces you added (read the text there), then in Slack use /invite in a channel (labels found in the code)
- **Needs:** a Slack workspace where you can add apps and invite them to a channel, the Slack app set up by the owner first
- **Steps:**
  1. Open Settings, choose Slack app under Customize, and read the card Slack workspaces you added: it says to add the app, then /invite it to channels.
  2. In Slack, type /invite and the app name in a channel to add the app to that channel.
  3. Post a normal message in that channel and wait for the agent to act.
  4. Check the channel for the agent's reply, and check Settings > Customize > Slack app > Waiting for your approval for any request, then compare with Expected.

## S106.16 Mention-to-task handoff.

- **Expected:** Mentioning the assistant in a channel message turns that message into a task the agent runs.
- **Code:** partial. Evidence present: apps/web/lib/slack/slack-assistant.ts:358; apps/web/lib/slack/slack-assistant.ts:400; apps/web/lib/slack/slack-assistant.ts:401; apps/web/lib/slack/slack-assistant.ts:154; apps/web/lib/slack/slack-assistant.ts:169; apps/web/lib/slack/slack-tasks.ts:45; apps/web/lib/slack/slack-tasks.ts:62; apps/web/lib/slack/slack-tasks.ts:178; apps/web/lib/slack/slack-tasks.ts:185; apps/web/lib/slack/slack-tasks.ts:194; apps/web/lib/slack/slack-tasks.ts:198; apps/web/lib/slack/slack-tasks.ts:210; apps/web/lib/slack/slack-tasks.ts:222; apps/web/lib/slack/slack-assistant-turn.ts:114; apps/web/lib/slack/slack-assistant-turn.ts:422; apps/web/lib/slack/slack-assistant-turn.ts:435; apps/web/lib/slack/slack-assistant-turn.ts:541; apps/web/lib/slack/slack-assistant-turn.ts:629; apps/web/lib/slack/slack-messages.ts:178; apps/web/lib/services/scheduled-agent-executor.ts:604; apps/web/lib/services/scheduled-agent-executor.ts:654; apps/web/lib/services/cloud-agent-run-service.ts:3170; apps/web/lib/slack/slack-runs.ts:84; apps/web/lib/slack/slack-runs.ts:294; apps/web/lib/slack/slack-links.ts:296; apps/web/lib/slack/slack-installations.ts:151; apps/web/features/settings/sections/SlackSection.tsx:200; apps/web/features/settings/sections/SlackSection.tsx:212; apps/web/db/neon/0333_slack_run_cancel_and_delete.sql:25
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** In Slack, @mention the app in a channel message; then in AGI open Settings > Customize > Slack app > Waiting for your approval (labels found in the code)
- **Needs:** a Slack channel where the app is invited, the Slack app set up by the owner first
- **Steps:**
  1. In a Slack channel where the app is invited, write a message that mentions the app with a request.
  2. In AGI, open Settings > Customize > Slack app and look at the card Waiting for your approval.
  3. Find the item that says A task from a channel mention, and click View task if it appears.
  4. Compare with Expected: the channel message should now be a task the agent runs.

## S106.21 Agent identity distinct from a human account.

- **Expected:** In channels and connected tools the agent acts under its own identity (bot or service account), clearly distinct from the human user.
- **Code:** partial. Evidence present: apps/web/lib/slack/slack-api.ts:108; apps/web/lib/slack/slack-api.ts:109; apps/web/lib/slack/slack-installations.ts:88; apps/web/lib/slack/slack-assistant.ts:156; apps/web/lib/slack/slack-messages.ts:166
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** Settings > Customize > Slack app > Your Slack accounts; the agent's own name is seen in Slack (labels found in the code)
- **Needs:** a Slack workspace where the app is installed and a Slack account of your own, the Slack app set up by the owner first
- **Steps:**
  1. Open Settings, choose Slack app under Customize, and read the card Your Slack accounts: it says accounts AGI answers as you.
  2. In Slack, mention the app in a channel with a short request.
  3. Read the reply in Slack and compare its sender name with your own name.
  4. Compare with Expected: the agent should answer under its own app identity, not as you.

## S106.24 Results mirrored into the main application.

- **Expected:** Work the agent does from a channel or host shows up in the main app (run history, results) for review.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleCard.tsx:516; apps/web/lib/triggers/trigger-fire.ts:135 (quoted code not found in the file now); apps/web/lib/services/scheduled-agent-executor.ts:588 (quoted code not found in the file now); packages/platform/context-engine/src/manifest-store.ts:59
- **Where to find it:** Scheduled page (route /chat/schedules, page title Scheduled) > schedule card > Run History button (labels found in the code)
- **Needs:** a paid account with at least one schedule that has run
- **Steps:**
  1. Open the Scheduled page.
  2. On a schedule card, click the history icon button (its tooltip says Run History).
  3. Read the section Run History that opens under the card.
  4. Compare with Expected: work started from a channel or host should be listed there for review.
