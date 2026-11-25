# Area 106. Office, collaboration-channel, and email surfaces

25 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S106.01 Assistant inside Word.
- Should: An assistant pane runs inside Word and can read and change the open document through the host.
- Status: web missing, desktop missing

## S106.02 Assistant inside Excel.
- Should: An assistant pane runs inside Excel and can read and change the open document through the host.
- Status: web missing, desktop missing

## S106.03 Assistant inside PowerPoint.
- Should: An assistant pane runs inside PowerPoint and can read and change the open document through the host.
- Status: web missing, desktop missing

## S106.04 Assistant inside Outlook.
- Should: An assistant pane runs inside Outlook and can read and change the open message through the host.
- Status: web missing, desktop missing

## S106.05 Assistant inside Google Docs.
- Should: An assistant pane runs inside Google Docs and can read and change the open document through the host.
- Status: web missing, desktop missing

## S106.06 Assistant inside Google Sheets.
- Should: An assistant pane runs inside Google Sheets and can read and change the open document through the host.
- Status: web missing, desktop missing

## S106.07 Assistant inside Google Slides.
- Should: An assistant pane runs inside Google Slides and can read and change the open document through the host.
- Status: web missing, desktop missing

## S106.08 Host-document selection context.
- Should: The in-host assistant sees what the user has selected in the host document (text, cells, slide objects) as context.
- Status: web missing, desktop missing

## S106.09 Native tracked edits.
- Should: Edits the assistant makes to a host document appear as native tracked changes or suggestions the user can accept or reject.
- Status: web missing, desktop missing, chrome missing

## S106.10 Protected-range awareness.
- Should: The in-host assistant knows which ranges, sheets or sections are protected or locked and does not try to change them.
- Status: web missing, desktop missing, chrome missing

## S106.11 Cross-document references.
- Should: From inside one host document the assistant can pull in or cite another document from the same host (another file, sheet or deck).
- Status: web missing, desktop missing, chrome missing

## S106.12 Shared conversation context across supported host applications.
- Should: One assistant conversation carries across the supported host apps (for example, started in Word and continued in Excel) with its context.
- Status: web missing, desktop missing

## S106.13 Slack direct-message assistant.
- Should: A user can DM the product's Slack bot and gets the assistant's reply in that DM.
- Status: web partial, desktop partial
- Code: apps/web/app/api/webhooks/slack/route.ts:84; apps/web/app/api/webhooks/slack/route.ts:89; apps/web/lib/slack/slack-events.ts:67; apps/web/lib/slack/slack-assistant.ts:276; apps/web/lib/slack/slack-assistant.ts:305; apps/web/lib/slack/slack-assistant-turn.ts:370; apps/web/lib/slack/slack-assistant-turn.ts:377; apps/web/lib/slack/slack-assistant-turn.ts:384
- Unfinished: web: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy | desktop: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy

## S106.14 Slack channel agent.
- Should: An agent listens in a Slack channel and acts (and reports back) when channel messages or events arrive.
- Status: web partial, desktop partial
- Code: apps/web/app/api/webhooks/slack/route.ts:84; apps/web/app/api/webhooks/slack/route.ts:89; apps/web/lib/slack/slack-events.ts:68; apps/web/lib/slack/slack-config.ts:14; apps/web/lib/slack/slack-config.ts:15; apps/web/lib/slack/slack-api.ts:273; apps/web/lib/slack/slack-api.ts:302; apps/web/lib/slack/slack-context.ts:95
- Unfinished: web: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy | desktop: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy

## S106.15 Teams assistant.
- Should: Users can talk to the assistant inside Microsoft Teams (bot or app) and get answers there.
- Status: web missing, desktop missing

## S106.16 Mention-to-task handoff.
- Should: Mentioning the assistant in a channel message turns that message into a task the agent runs.
- Status: web partial, desktop partial
- Code: apps/web/lib/slack/slack-assistant.ts:340; apps/web/lib/slack/slack-assistant.ts:379; apps/web/lib/slack/slack-assistant.ts:380; apps/web/lib/slack/slack-assistant.ts:146; apps/web/lib/slack/slack-assistant.ts:161; apps/web/lib/slack/slack-tasks.ts:45; apps/web/lib/slack/slack-tasks.ts:62; apps/web/lib/slack/slack-tasks.ts:148
- Unfinished: web: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy | desktop: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy

## S106.17 Email-to-task address.
- Should: Each user or workspace gets an email address; mail sent to it creates a task for the agent.
- Status: web missing, desktop missing

## S106.18 Forward-email-to-agent workflow.
- Should: A user forwards an email to the agent and the agent acts on that email.
- Status: web missing, desktop missing

## S106.19 Task replies within an email thread.
- Should: When a task came from email, the agent posts progress or results as replies in that same email thread.
- Status: web missing, desktop missing

## S106.20 Channel-based approvals.
- Should: When an agent needs approval, the request appears in a channel (Slack, Teams or email) and can be approved there.
- Status: web missing, desktop missing

## S106.21 Agent identity distinct from a human account.
- Should: In channels and connected tools the agent acts under its own identity (bot or service account), clearly distinct from the human user.
- Status: web partial, desktop partial
- Code: apps/web/lib/slack/slack-api.ts:108; apps/web/lib/slack/slack-api.ts:109; apps/web/lib/slack/slack-installations.ts:87; apps/web/lib/slack/slack-assistant.ts:134; apps/web/lib/slack/slack-messages.ts:148
- Unfinished: web: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy | desktop: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy

## S106.22 Channel-specific permissions.
- Should: Admins or users can set what the agent may do per channel (which channels it may read, post in or act on).
- Status: web missing, desktop missing

## S106.23 Conversation-to-session mapping.
- Should: Each channel conversation or thread maps to one persistent agent session, so follow-ups in the thread continue it.
- Status: web missing, desktop missing

## S106.24 Results mirrored into the main application.
- Should: Work the agent does from a channel or host shows up in the main app (run history, results) for review.
- Status: web done, desktop done
- Code: apps/web/features/schedules/components/ScheduleCard.tsx:408; apps/web/lib/triggers/trigger-fire.ts:135; apps/web/lib/services/scheduled-agent-executor.ts:588; packages/platform/context-engine/src/manifest-store.ts:54

## S106.25 Native-host and standalone-app handoff.
- Should: A session started in a host add-in can be opened in the standalone app (and back) with its context.
- Status: web missing, desktop missing, chrome missing
