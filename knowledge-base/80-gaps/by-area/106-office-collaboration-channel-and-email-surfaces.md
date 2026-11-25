---
id: "GAPS-AREA-106"
type: "gap-list"
title: "Gaps: Office, collaboration-channel, and email surfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 106. Office, collaboration-channel, and email surfaces

51 open gaps that touch this area. Area page: [20-features/106-office-collaboration-channel-and-email-surfaces](../../20-features/106-office-collaboration-channel-and-email-surfaces/README.md).

## CMP-WP268

**Mention people, agents, files and chats in a message**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F106-04](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-04-handoff-between-host-apps-and-the-standalone-app.md)
- Detail: The composer @ picks library files, folders and connectors only The composer @ picks library files, folders and connectors only.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:644,997

## GAP-AREA106-LW07

**Desktop is marked partial for Slack, but no Slack code exists in the desktop source tree. The partial status depends on the hosted web app.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-106
- Detail: Area 106. Office, collaboration-channel, and email surfaces
- Evidence: apps/desktop/src/types/mcp.ts (only Slack reference found under apps/desktop/src)

## GAP-AREA106-LW08

**Every Slack event, including direct-message text, is also passed to the trigger ingest, even when the assistant ignores it. Where the trigger ingest keeps that data was not read.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-106
- Detail: Area 106. Office, collaboration-channel, and email surfaces
- Evidence: apps/web/app/api/webhooks/slack/route.ts:93-99

## GAP-CAP-sharing-and-collaboration-28

**Group chats and mentions of people: No people mentions, no group chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F106-04](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-04-handoff-between-host-apps-and-the-standalone-app.md)
- Requirement items: S106.12
- Detail: Claude unknown, ChatGPT partly; AGI not built

## GAP-F106-01-01

**No Office add-in at all for Word, Excel, PowerPoint or Outlook.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-01](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-01-office-add-in-assistant-pane-word-excel-powerpoint.md)
- Detail: Affects: Web and desktop users who work in Office.. Work needed: Design, build and publish add-ins and a host bridge; decide hosting, auth and subscription rules.
- Evidence: Brief S106.01 to S106.04 mark web and desktop missing; code search found nothing.

## GAP-F106-01-NOTBUILT

**Office add-in assistant pane (Word, Excel, PowerPoint, Outlook): not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F106-01](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-01-office-add-in-assistant-pane-word-excel-powerpoint.md)
- Requirement items: S106.01, S106.02, S106.03, S106.04
- Detail: Web: S106.01, S106.02, S106.03, S106.04; Desktop: S106.01, S106.02, S106.03, S106.04

## GAP-F106-02-01

**No Google Docs, Sheets or Slides assistant.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-02](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-02-google-docs-sheets-and-slides-assistant.md)
- Detail: Affects: Web and desktop users in Google Workspace.. Work needed: Design and build the add-on, OAuth and data-use policy, and subscription wiring.
- Evidence: Brief S106.05 to S106.07 mark web and desktop missing.

## GAP-F106-02-NOTBUILT

**Google Docs, Sheets and Slides assistant: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F106-02](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-02-google-docs-sheets-and-slides-assistant.md)
- Requirement items: S106.05, S106.06, S106.07
- Detail: Web: S106.05, S106.06, S106.07; Desktop: S106.05, S106.06, S106.07

## GAP-F106-03-01

**No selection context, tracked edits, protected-range checks or cross-document references.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-03](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-03-selection-tracked-edits-protected-ranges-and-cross.md)
- Detail: Affects: Web, desktop and Chrome users once host panes exist.. Work needed: Define the host adapter contract, implement per host, and add tests.
- Evidence: Brief S106.08 to S106.11 mark web, desktop and (09 to 11) Chrome missing.

## GAP-F106-03-NOTBUILT

**Selection, tracked edits, protected ranges and cross-file references in host documents: not built on Web, Desktop, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F106-03](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-03-selection-tracked-edits-protected-ranges-and-cross.md)
- Requirement items: S106.08, S106.09, S106.10, S106.11
- Detail: Web: S106.08, S106.09, S106.10, S106.11; Desktop: S106.08, S106.09, S106.10, S106.11; Chrome: S106.09, S106.10, S106.11

## GAP-F106-04-01

**No handoff between host apps or between a host and the standalone app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-04](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-04-handoff-between-host-apps-and-the-standalone-app.md)
- Detail: Affects: Web, desktop and Chrome users.. Work needed: Add a host session model, link format, access checks and return path.
- Evidence: Brief S106.12 and S106.25 mark them missing.

## GAP-F106-04-02

**Local to cloud handoff rules are undefined.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-04](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-04-handoff-between-host-apps-and-the-standalone-app.md)
- Detail: Affects: Desktop and mobile users who run Local.. Work needed: Decide and document consent rules.
- Evidence: AGENTS.md section 6 requires an explicit consented fork for Local to BYOK or cloud moves; no host design exists.

## GAP-F106-04-NOTBUILT

**Handoff between host apps and the standalone app: not built on Web, Desktop, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F106-04](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-04-handoff-between-host-apps-and-the-standalone-app.md)
- Requirement items: S106.12, S106.25
- Detail: Web: S106.12, S106.25; Desktop: S106.12, S106.25; Chrome: S106.25

## GAP-F106-05-01

**Feature is off until the owner creates and configures the Slack app and applies the migrations.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-05](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-05-slack-direct-message-assistant.md)
- Detail: Affects: All web users and desktop users (through the web service).. Work needed: Owner setup per docs/runbooks/connector-oauth-apps.md; confirm migration state in each environment.
- Evidence: Brief S106.13 Unfinished note; slack-config.ts:57-64; route.ts:48-52.

## GAP-F106-05-02

**Attached files are not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-05](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-05-slack-direct-message-assistant.md)
- Detail: Affects: Slack users who share documents.. Work needed: Fetch and parse allowed files with consent and size limits.
- Evidence: slack-context.ts:241-243

## GAP-F106-05-03

**No Local or own-key route in Slack.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-05](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-05-slack-direct-message-assistant.md)
- Detail: Affects: Users who want Local or own-key mode.. Work needed: Product decision; if wanted, explicit consent and provider label.
- Evidence: slack-assistant-turn.ts:334 uses managed routing only.

## GAP-F106-05-04

**Docs disagree: wire-or-cut says inbound Slack was cut.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-05](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-05-slack-direct-message-assistant.md)
- Detail: Affects: Engineers reading docs.. Work needed: Update the decision record to match the code.
- Evidence: docs/decisions/wire-or-cut.md:74 versus current code.

## GAP-F106-05-05

**No end-to-end test with real Slack is recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-05](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-05-slack-direct-message-assistant.md)
- Detail: Affects: Release confidence.. Work needed: Run the scenarios in a test workspace.
- Evidence: No test file or run log found that records a live run.

## GAP-F106-05-NOTBUILT

**Slack direct-message assistant: not built on Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F106-05](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-05-slack-direct-message-assistant.md)
- Requirement items: S106.13
- Detail: Desktop: S106.13

## GAP-F106-05-PARTLY

**Slack direct-message assistant: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F106-05](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-05-slack-direct-message-assistant.md)
- Requirement items: S106.13
- Detail: Web S106.13: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy | Desktop S106.13: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy

## GAP-F106-06-01

**Needs owner setup of the Slack app and applied migrations before it works.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-06](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)
- Detail: Affects: All web users and desktop users via the web service.. Work needed: Create the app per docs/runbooks/connector-oauth-apps.md; confirm migrations.
- Evidence: Brief S106.14, S106.16 and S106.21 Unfinished notes; slack-config.ts:57-64.

## GAP-F106-06-02

**Brief rows S106.22 and S106.23 say missing while code exists for channel policies and thread to conversation reuse.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-06](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)
- Detail: Affects: Planning accuracy.. Work needed: Verify live and update the brief.
- Evidence: slack-channel-policies.ts; slack-tasks.ts:93-119.

## GAP-F106-06-03

**Policy list shows channel ids, not names, and lists only channels seen or with a policy.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-06](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)
- Detail: Affects: Installers.. Work needed: Resolve channel names (needs a Slack scope not requested today: channels:read is not in slack-config.ts:14-22).
- Evidence: SlackChannelPolicies.tsx:259; slack-channel-policies.ts:103-113.

## GAP-F106-06-04

**No live end-to-end run recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-06](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)
- Detail: Affects: Release confidence.. Work needed: Run the scenarios in a test workspace.
- Evidence: No log or test file records a live Slack run.

## GAP-F106-06-05

**Plain channel messages without a mention are never answered by the agent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-06](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)
- Detail: Affects: Users expecting an always-listening channel agent.. Work needed: Product decision; the current mention-only design is deliberate [inferred].
- Evidence: slack-events.ts:67-69; brief S106.14 wording 'listens in a Slack channel'.

## GAP-F106-06-NOTBUILT

**Slack channel agent and mention-to-task: not built on Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F106-06](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)
- Requirement items: S106.14, S106.16, S106.21
- Detail: Desktop: S106.14, S106.16, S106.21

## GAP-F106-06-PARTLY

**Slack channel agent and mention-to-task: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F106-06](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)
- Requirement items: S106.14, S106.16, S106.21
- Detail: Web S106.14: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy | Web S106.16: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy | Web S106.21: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy | Desktop S106.14: owner: create the Slack app per docs/runbooks/connector-oauth-ap

## GAP-F106-07-01

**No Teams or email approval path**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-07](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-07-per-channel-controls-and-approvals-in-slack.md)
- Detail: Affects: Teams and email users; web and desktop. Work needed: Build Teams and email channels first (F106-09, F106-10), then reuse the approval claim logic
- Evidence: No Teams bot or inbound email code found; brief S106.20

## GAP-F106-07-02

**No scheduled expiry sweep**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-07](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-07-per-channel-controls-and-approvals-in-slack.md)
- Detail: Affects: Requesters who never open Settings; web. Work needed: Add a job that expires and notifies
- Evidence: slack-runs.ts:278-295 only runs on list

## GAP-F106-07-03

**Channels shown by ID only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-07](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-07-per-channel-controls-and-approvals-in-slack.md)
- Detail: Affects: Installers; web and desktop. Work needed: Store and show channel names (column channel_name exists)
- Evidence: SlackChannelPolicies.tsx:256

## GAP-F106-07-04

**No read or post restriction per channel beyond off/answer/task**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-07](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-07-per-channel-controls-and-approvals-in-slack.md)
- Detail: Affects: Admins wanting read-only channels; web. Work needed: Decide if S106.22 needs more controls
- Evidence: slack-channel-policies.ts; SlackChannelMode values

## GAP-F106-07-05

**Brief statuses out of date**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-07](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-07-per-channel-controls-and-approvals-in-slack.md)
- Detail: Affects: Planning. Work needed: Update the brief
- Evidence: Brief says missing; code present

## GAP-F106-07-06

**Docs say no inbound Slack app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-07](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-07-per-channel-controls-and-approvals-in-slack.md)
- Detail: Affects: Readers of decisions. Work needed: Correct the decision record
- Evidence: docs/decisions/wire-or-cut.md:74 contradicts the live inbound handler

## GAP-F106-08-01

**Brief says missing, code exists for task mode**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-08](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-08-thread-continuity.md)
- Detail: Affects: Planning. Work needed: Update brief to partial
- Evidence: slack-tasks.ts:93-119

## GAP-F106-08-02

**Answer-mode and DM runs have no persistent session**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-08](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-08-thread-continuity.md)
- Detail: Affects: Slack users in answer-only channels and DMs. Work needed: Decide if S106.23 requires sessions there
- Evidence: slack-assistant.ts:401

## GAP-F106-08-03

**Continuity is per person, not per thread**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-08](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-08-thread-continuity.md)
- Detail: Affects: Teams of people in one thread. Work needed: Product decision
- Evidence: slack-tasks.ts:109

## GAP-F106-08-04

**Follow-ups require a mention**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-08](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-08-thread-continuity.md)
- Detail: Affects: Slack users. Work needed: Subscribe to thread message events if wanted
- Evidence: slack-events.ts:67-68

## GAP-F106-08-05

**No continuity for Teams or email**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-08](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-08-thread-continuity.md)
- Detail: Affects: Those users. Work needed: Build channels first
- Evidence: No code

## GAP-F106-09-01

**No Teams assistant**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-09](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-09-microsoft-teams-assistant.md)
- Detail: Affects: Teams users; Web and Desktop. Work needed: Bot registration, signed receiver, install and link flow, policy, approvals, tests
- Evidence: Brief S106.15; no code

## GAP-F106-09-02

**No product requirement document**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-09](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-09-microsoft-teams-assistant.md)
- Detail: Affects: Planning. Work needed: Write requirement and priority
- Evidence: No Teams entry in docs/product found

## GAP-F106-09-03

**Decision record says messaging connectors cut**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-09](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-09-microsoft-teams-assistant.md)
- Detail: Affects: Planning. Work needed: Record a new decision before building
- Evidence: docs/decisions/wire-or-cut.md:572

## GAP-F106-09-NOTBUILT

**Microsoft Teams assistant: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F106-09](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-09-microsoft-teams-assistant.md)
- Requirement items: S106.15
- Detail: Web: S106.15; Desktop: S106.15

## GAP-F106-10-01

**No agent email address**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-10](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-10-email-to-agent.md)
- Detail: Affects: All users; Web and Desktop. Work needed: Address allocation and inbound receiver
- Evidence: Brief S106.17

## GAP-F106-10-02

**No forwarded-mail handling**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-10](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-10-email-to-agent.md)
- Detail: Affects: All users. Work needed: Parse forwarded content, sender checks
- Evidence: Brief S106.18

## GAP-F106-10-03

**No threaded replies**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-10](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-10-email-to-agent.md)
- Detail: Affects: All users. Work needed: Outbound mail with thread headers
- Evidence: Brief S106.19

## GAP-F106-10-04

**No product doc**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-10](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-10-email-to-agent.md)
- Detail: Affects: Planning. Work needed: Write requirement
- Evidence: No email-to-agent entry found in docs/product

## GAP-F106-10-NOTBUILT

**Email-to-agent: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F106-10](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-10-email-to-agent.md)
- Requirement items: S106.17, S106.18, S106.19
- Detail: Web: S106.17, S106.18, S106.19; Desktop: S106.17, S106.18, S106.19

## GAP-F106-11-01

**Answer-mode and DM answers not mirrored**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-11](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-11-results-in-the-main-app.md)
- Detail: Affects: Slack users in answer channels and DMs. Work needed: Decide scope of S106.24; save run history
- Evidence: slack-assistant.ts:401

## GAP-F106-11-02

**Brief evidence lists scheduled-run files**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-11](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-11-results-in-the-main-app.md)
- Detail: Affects: Planning accuracy. Work needed: Replace with Slack task files
- Evidence: Brief S106.24 code list

## GAP-F106-11-03

**No test seen for conversation creation and final message saving**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-11](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-11-results-in-the-main-app.md)
- Detail: Affects: Quality. Work needed: Add tests
- Evidence: Only thread test and approval test found in lib/slack

## GAP-F106-11-04

**Not run by anyone: no file records a live check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F106-11](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-11-results-in-the-main-app.md)
- Detail: Affects: All. Work needed: Run the scenarios with a real Slack app
- Evidence: No verification record found
