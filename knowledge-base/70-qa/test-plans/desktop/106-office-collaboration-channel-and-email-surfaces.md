---
id: "PLAN-desktop-106"
type: "test-plan"
title: "Desktop · 106. Office, collaboration-channel, and email surfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "106"
---
# Desktop · 106. Office, collaboration-channel, and email surfaces

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S106.13 Slack direct-message assistant.

- **Expected:** A user can DM the product's Slack bot and gets the assistant's reply in that DM.
- **Code:** partial. Evidence moved: apps/web/app/api/webhooks/slack/route.ts:84; apps/web/app/api/webhooks/slack/route.ts:89; apps/web/lib/slack/slack-events.ts:67; apps/web/lib/slack/slack-assistant.ts:320; apps/web/lib/slack/slack-assistant.ts:367; apps/web/lib/slack/slack-assistant-turn.ts:408; apps/web/lib/slack/slack-assistant-turn.ts:415; apps/web/lib/slack/slack-assistant-turn.ts (text found, layout changed); apps/web/lib/slack/slack-assistant-turn.ts:554; apps/web/lib/slack/slack-assistant.ts:156; apps/web/app/api/slack/install/route.ts:63; apps/web/app/api/slack/oauth/callback/route.ts:124; apps/web/app/api/slack/link/route.ts:115; apps/web/app/slack/link/page.tsx:139 (quoted code not found in the file now); apps/web/features/settings/sections/SlackSection.tsx:461 (quoted code not found in the file now); apps/web/features/settings/sections/SlackSection.tsx:577; apps/web/app/api/slack/runs/[runId]/approval/route.ts:50
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** Settings > Slack app > Add to Slack, then in Slack open a direct message with the AGI app (labels found in the code)
- **Needs:** A Slack workspace where you can add apps, and a Slack account you can message; the owner must first complete the Slack app setup from the plan's 'Known to be unfinished' note
- **Steps:**
  1. Sign in and open Settings from the account menu.
  2. Click 'Slack app' in the Customize group and click 'Add to Slack' under 'Slack workspaces you added' to add the app to a Slack workspace.
  3. In Slack, open a direct message with the AGI app (first link your account by messaging the app, as 'Your Slack accounts' says) and send a question.
  4. Look for the assistant's reply in that same direct message and compare with Expected.

## S106.14 Slack channel agent.

- **Expected:** An agent listens in a Slack channel and acts (and reports back) when channel messages or events arrive.
- **Code:** partial. Evidence present: apps/web/app/api/webhooks/slack/route.ts:84; apps/web/app/api/webhooks/slack/route.ts:89; apps/web/lib/slack/slack-events.ts:68; apps/web/lib/slack/slack-config.ts:14; apps/web/lib/slack/slack-config.ts:15; apps/web/lib/slack/slack-api.ts:273; apps/web/lib/slack/slack-api.ts:302; apps/web/lib/slack/slack-context.ts:95; apps/web/lib/slack/slack-context.ts:108; apps/web/lib/slack/slack-context.ts:192; apps/web/lib/slack/slack-assistant-turn.ts:109; apps/web/lib/slack/slack-assistant-turn.ts:491; apps/web/lib/slack/slack-assistant-turn.ts:522; apps/web/lib/slack/slack-assistant.ts:99; apps/web/lib/slack/slack-assistant.ts:156; apps/web/lib/slack/slack-messages.ts:166
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** Settings > Slack app > Slack workspaces you added, then /invite the app to a Slack channel (labels found in the code)
- **Needs:** A Slack workspace where you can add apps and invite them to a channel, and a second member who can post in the channel if needed
- **Steps:**
  1. Open Settings, click 'Slack app', and make sure the workspace is listed under 'Slack workspaces you added' (click 'Add to Slack' if not).
  2. In Slack, type /invite with the AGI app's name in a channel.
  3. Under the workspace, check the per-channel control labelled 'What AGI may do in' that channel and leave it on a mode that answers.
  4. In that channel, post a message for the agent and watch for the agent's reply or report in the channel. Compare with Expected.

## S106.16 Mention-to-task handoff.

- **Expected:** Mentioning the assistant in a channel message turns that message into a task the agent runs.
- **Code:** partial. Evidence present: apps/web/lib/slack/slack-assistant.ts:358; apps/web/lib/slack/slack-assistant.ts:400; apps/web/lib/slack/slack-assistant.ts:401; apps/web/lib/slack/slack-assistant.ts:154; apps/web/lib/slack/slack-assistant.ts:169; apps/web/lib/slack/slack-tasks.ts:45; apps/web/lib/slack/slack-tasks.ts:62; apps/web/lib/slack/slack-tasks.ts:178; apps/web/lib/slack/slack-tasks.ts:185; apps/web/lib/slack/slack-tasks.ts:194; apps/web/lib/slack/slack-tasks.ts:198; apps/web/lib/slack/slack-tasks.ts:210; apps/web/lib/slack/slack-tasks.ts:222; apps/web/lib/slack/slack-assistant-turn.ts:114; apps/web/lib/slack/slack-assistant-turn.ts:422; apps/web/lib/slack/slack-assistant-turn.ts:435; apps/web/lib/slack/slack-assistant-turn.ts:541; apps/web/lib/slack/slack-assistant-turn.ts:629; apps/web/lib/slack/slack-messages.ts:178; apps/web/lib/services/scheduled-agent-executor.ts:604; apps/web/lib/services/scheduled-agent-executor.ts:654; apps/web/lib/services/cloud-agent-run-service.ts:3170; apps/web/lib/slack/slack-runs.ts:84; apps/web/lib/slack/slack-runs.ts:294; apps/web/lib/slack/slack-links.ts:296; apps/web/lib/slack/slack-installations.ts:151; apps/web/features/settings/sections/SlackSection.tsx:200; apps/web/features/settings/sections/SlackSection.tsx:212; apps/web/db/neon/0333_slack_run_cancel_and_delete.sql:25
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** In Slack, a channel where the AGI app is invited: @mention the app with a request; then Settings > Slack app > Waiting for your approval if a step needs approval (labels found in the code)
- **Needs:** A Slack workspace with the app invited to a channel, a linked Slack account, and the Tasks feature available on the account's plan
- **Steps:**
  1. In a channel where the AGI app has been invited, type a message that mentions the app and asks for a task.
  2. Wait for the reply in the channel thread and check whether it includes a task link in its footer.
  3. If the task needs a tool, open Settings > Slack app and look under 'Waiting for your approval' for the pending item.
  4. Compare the task created with Expected: the mention should become a task the agent runs.

## S106.21 Agent identity distinct from a human account.

- **Expected:** In channels and connected tools the agent acts under its own identity (bot or service account), clearly distinct from the human user.
- **Code:** partial. Evidence present: apps/web/lib/slack/slack-api.ts:108; apps/web/lib/slack/slack-api.ts:109; apps/web/lib/slack/slack-installations.ts:88; apps/web/lib/slack/slack-assistant.ts:156; apps/web/lib/slack/slack-messages.ts:166
- **Known to be unfinished:** owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy
- **Where to find it:** no screen of its own. Identity is set by the bot token (xoxb- prefix, bot_user_id) in apps/web/lib/slack/slack-api.ts and posting in apps/web/lib/slack/slack-messages.ts; the tester sees it only as the sender name in Slack, and the 'Your Slack accounts' copy says AGI answers 'as you' for linked accounts, which may read as confusing next to the bot identity.
- **Needs:** A Slack workspace with the app invited to a channel, and a second person's account in that channel if you want to compare
- **Steps:**
  1. After the app has replied in a channel, look at the sender name and avatar on that reply in Slack.
  2. Confirm the sender is the AGI app's bot user and not your own Slack name.
  3. Open Settings > Slack app and compare with the list under 'Your Slack accounts' to see which human accounts AGI answers as.

## S106.24 Results mirrored into the main application.

- **Expected:** Work the agent does from a channel or host shows up in the main app (run history, results) for review.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleCard.tsx:516; apps/web/lib/triggers/trigger-fire.ts:135 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Scheduled > View History (the history icon on a schedule card, tooltip 'Run History') (labels found in the code)
- **Needs:** A schedule that has run at least once; for the Slack-originated part, a Slack setup as in S106.13
- **Steps:**
  1. Sign in and click 'Scheduled' in the sidebar.
  2. On a schedule that has run, click the history icon (tooltip 'Run History', aria-label 'View History for' the schedule name).
  3. Look at the 'Run History' panel for the runs and their results.
  4. Compare with Expected: work the agent did from a channel or host should show up here for review.
