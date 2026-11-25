---
id: "F106-05"
type: "feature"
title: "Slack direct-message assistant"
aliases: ["Slack direct-message assistant", "AGI in Slack", "Chat in Slack (plan capability label)", "Slack app (settings label)", "slack_app capability", "S106.13"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.13"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:pro", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-execution-boundaries", "table:slack_installations", "table:slack_account_links", "table:slack_assistant_runs", "table:slack_link_requests", "api:POST /api/webhooks/slack", "api:POST /api/webhooks/slack-interactions", "api:POST /api/slack/link"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-05 Slack direct-message assistant

A person messages the AGI app in Slack and gets the answer in the same direct message. The first message returns a Connect account link; after linking, answers use that person's own plan and approvals. Built on the web service. Needs the Slack app set up, the plan to allow it, and migrations applied.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.13](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10613).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Receives Slack direct messages, links the Slack user to an AGI account, runs a managed chat turn with the person's plan, memory and tools, and posts the answer back in the same direct message (apps/web/lib/slack/slack-assistant.ts:295-418, apps/web/lib/slack/slack-assistant-turn.ts:408).

**Why it exists.** Brief S106.13: a user can DM the product's Slack bot and gets the reply in that DM. The runbook compares it to Claude in Slack (doc: docs/runbooks/connector-oauth-apps.md, section 'The AGI Workforce app in Slack').

**Who uses it.** People on a plan that includes Chat in Slack whose team uses Slack. The workspace owner installs the app once; each person links their own account.

**Problems it solves**

- Switching to another app to ask the assistant.
- Teammates sharing one account: each person links their own and uses their own plan.

**Use cases**

- Ask a quick question in the app's Messages tab.
- Ask for a summary of a draft pasted into the message.
- Continue a conversation: earlier DM messages from the last 12 hours are read as context.
- Approve a tool step with the Approve button in the DM.

## 2. User experience

**Where to find it**

- Slack: the AGI app under Apps, Messages tab (the Messages Tab must be enabled in the Slack app, doc: docs/runbooks/connector-oauth-apps.md).
- Web app: Settings, section 'Slack app' (page title 'Slack app', apps/web/features/settings/sections/SlackSection.tsx:478); URL /chat?settings=slack, also reached by /settings/slack (apps/web/app/settings/[section]/page.tsx).
- Desktop app: Cloud settings, section Slack, headed 'Slack app', with the button 'Open Slack app settings', which opens the web page in the browser (apps/desktop/src/features/settings/cloud/CloudSlackSection.tsx:29,45). No Slack logic lives in the desktop app.
- Mobile, CLI, VS Code and Chrome: no Slack code found; mobile only lists the capability as hidden in its plan display (apps/mobile/src/features/settings/plans/index.tsx:50).

**Before you start**

- A Slack workspace where the owner added the app through Settings, Slack app, button 'Add to Slack' (SlackSection.tsx:644,661).
- An AGI account on a plan with the Chat in Slack capability: pro, max, max_15x, team, team_premium or enterprise (packages/contracts/types/src/billing-catalog.ts:341,360). Others get 'AGI in Slack is available on ... plans.' with a See plans link (slack-assistant-turn.ts:415-421).
- The Slack app configured: signing secret, client id and secret, public app URL and connector token storage (apps/web/lib/slack/slack-config.ts:57-64).
- Not an organization-wide Slack install: refused with status workspace_install_only (apps/web/features/settings/sections/SlackSection.tsx:51-52).

**Screens and controls**

- Slack Messages tab: the person types a message.
- Link prompt message with button 'Connect account' (apps/web/lib/slack/slack-messages.ts:209).
- Web page /slack/link: heading 'Connect Slack to AGI', sign-in redirect, workspace choice and connect action, success 'Your Slack account is connected' with button 'Manage in Settings' (apps/web/app/slack/link/page.tsx:120-141).
- Settings cards: 'Waiting for your approval', 'Your Slack accounts' with Disconnect, 'Slack workspaces you added' with Add to Slack and Remove (SlackSection.tsx:565-700).
- Approve and Deny buttons in Slack when an answer needs approval (slack-messages.ts:263-270).

**Journey**

1. 1. Owner adds the app from Settings, Slack app, Add to Slack.
2. 2. Person opens the AGI app in Slack and sends a message.
3. 3. If not linked, a private message with a 'Connect account' button appears; the link works once and expires in 15 minutes (slack-config.ts:28; slack-messages.ts:201-205).
4. 4. Person opens the link, signs in to AGI, picks a workspace if offered and confirms (app/slack/link/page.tsx).
5. 5. Slack posts 'Your Slack account is now connected to AGI...' (slack-messages.ts:213-217).
6. 6. Person sends the message again. An eyes reaction is added to the message while it runs and removed after (slack-assistant.ts:113-128, 232, 256).
7. 7. The answer arrives in the DM as formatted blocks.

**What the person sees and gets**

- Answer posted in the DM; DM answers carry a footer with the model display name and no requester name (slack-messages.ts:159-166 with requesterId null for DMs at slack-assistant.ts:152).
- Notices: 'I could not finish that answer. Please try again.' (slack-assistant.ts:60); rate limit notice 'You are sending messages faster than AGI can answer them. Wait a minute, then try again.' (slack-assistant.ts:64-65); account unavailable (66-67); workspace left with an Open Settings button (68-70, 333).
- Refusals with links: plan required (See plans), quota messages with Add credits, Upgrade or View usage (slack-assistant-turn.ts:167-172, 590-594).
- Approval card with Approve, Deny and Review in AGI (slack-messages.ts:234-278); an in-app notification 'A Slack answer is waiting for your approval' (slack-assistant.ts:193-204).

**Settings**

- Settings, Slack app: disconnect an account, remove a workspace, manage channel policies (channel policies apply to channels only, not DMs: slack-assistant.ts:349-353).
- Memory is applied to DM answers: direct messages load account memory (slack-assistant-turn.ts:521-522).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Event receiver with signature check and replay window, url_verification handshake, 413 for bodies over 256 KB (apps/web/app/api/webhooks/slack/route.ts:36-72).
- DM event parsing: only direct messages (and app mentions) are read; bot messages, other subtypes, empty messages and bare verification codes are ignored (apps/web/lib/slack/slack-events.ts:67-70, 84-85).
- Account link request, preview, one-time consume, and link creation (apps/web/lib/slack/slack-links.ts:102-225; apps/web/app/api/slack/link/route.ts).
- Managed answer turn with entitlement check, access check, model route admission, content screening, memory, usage reservation and settle (apps/web/lib/slack/slack-assistant-turn.ts:408-715).
- Per workspace and per user rate limits: 120 and 12 per minute (apps/web/lib/rate-limit.ts:479-488).
- Answer budget: the turn is aborted after the chat tool-loop budget, 240 seconds (slack-assistant.ts:234; apps/web/lib/deadline-policy.ts:1-6).
- Approval in Slack with Approve and Deny buttons, 24-hour expiry (slack-config.ts:30; apps/web/lib/slack/slack-interactions.ts:91-160).
- Uninstall and token-revoked events delete the installation (slack-assistant.ts:426-447).

**Incomplete**

- Files attached in Slack are not opened: the model is told 'I attached files in Slack that you cannot open' with file names only (apps/web/lib/slack/slack-context.ts:241-243).
- Tool use in DMs needs approval handled by the person; no approval means the run waits (slack-assistant-turn.ts:98-104).

**Present but disconnected or switched off**

- Everything is off until the Slack app is configured: events return 503 without the signing secret (route.ts:48-52), and Settings shows 'AGI in Slack is not set up on this service yet.' (SlackSection.tsx:545-549).
- The brief says migration 0333 must be applied before deploy; the migration file exists in the chain (apps/web/db/neon/0333_slack_run_cancel_and_delete.sql). Whether it is applied in production is not recorded in the code.
- Docs conflict: docs/decisions/wire-or-cut.md:74 says the inbound Slack app was cut in 2026-07-30; the current code and the runbook describe a working inbound app. Code outranks prose, so this page follows the code.

**Not available**

- Desktop, mobile, CLI, VS Code and Chrome have no Slack runtime; the desktop only opens the web settings page (CloudSlackSection.tsx:14-24).
- Local mode and bring-your-own-key mode: the answer path calls managed Cloud routing only (slack-assistant-turn.ts:334).

## 4. Required behaviour

**Established requirements**

- A user can DM the product's Slack bot and gets the assistant's reply in that DM. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S106.13)
- Each person links their own account; answers use their plan and approvals; the link works once and expires in 15 minutes. (source: apps/web/lib/slack/slack-messages.ts:201-205 and doc: docs/runbooks/connector-oauth-apps.md)
- The Slack app is created with bot scopes only and subscribed to app_mention, message.im, app_uninstalled and tokens_revoked. (source: doc: docs/runbooks/connector-oauth-apps.md (section 3))

**Acceptance criteria**

1. An unlinked person sending a DM receives one 'Connect account' prompt, not repeated prompts for the same event.
2. After linking, the same DM gets an answer in the same DM with an eyes reaction during the run.
3. A message from a bot, an empty message, or a bare 12-character code is not answered.
4. More than 12 messages in a minute from one user gets the rate limit notice once.
5. A person on a plan without Chat in Slack gets 'AGI in Slack is available on ... plans.' with See plans.
6. A failure shows 'I could not finish that answer. Please try again.'
7. Disconnect in Settings deletes the person's Slack run records.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Free-plan users see an upgrade path, not usage meters; the settings screen shows the plan message and an Upgrade button (SlackSection.tsx:554-561) [inferred as the intended pattern].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Open attached files so DMs with documents work.
- [proposed] Allow the person to choose own-key mode in Slack with a visible provider label.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/webhooks/slack | `apps/web/app/api/webhooks/slack/route.ts` | Slack Events API receiver; verifies signature, parses event, schedules the assistant after the response, and feeds the trigger system. |
| service | Event reader | `apps/web/lib/slack/slack-events.ts` | Filters Slack events to direct messages and mentions and removes noise. |
| service | Assistant event handler | `apps/web/lib/slack/slack-assistant.ts` | Looks up installation and link, rate limits, starts a run, posts answers, notices and approvals. |
| service | Assistant turn | `apps/web/lib/slack/slack-assistant-turn.ts` | Entitlement, route admission, screening, memory, usage reservation, model call, outcomes. |
| service | Context builder | `apps/web/lib/slack/slack-context.ts` | Reads earlier DM messages (up to 20, last 12 hours) and user names from Slack. |
| service | Message builders | `apps/web/lib/slack/slack-messages.ts` | Converts answers to Slack blocks, builds link prompt, notice and approval messages. |
| service | Slack API client | `apps/web/lib/slack/slack-api.ts` | Calls chat.postMessage, chat.postEphemeral, reactions, history and users with 10 second timeout and one rate-limit retry. |
| service | Link service | `apps/web/lib/slack/slack-links.ts` | Issues, previews, consumes and removes account links. |
| service | Run records | `apps/web/lib/slack/slack-runs.ts` | Creates and settles slack_assistant_runs, parks and claims approvals. |
| service | Installations | `apps/web/lib/slack/slack-installations.ts` | Stores and reads the encrypted bot token per workspace. |
| config | Slack config | `apps/web/lib/slack/slack-config.ts` | Scopes, TTLs, context limits, working reaction, configured check. |
| endpoint | /api/slack/link | `apps/web/app/api/slack/link/route.ts` | Preview and confirm the account link; posts a welcome message. |
| screen | Link page | `apps/web/app/slack/link/page.tsx` | Web page that confirms the link. |
| screen | Slack settings section | `apps/web/features/settings/sections/SlackSection.tsx` | Web settings: approvals, linked accounts, workspaces. |
| screen | Desktop Slack section | `apps/desktop/src/features/settings/cloud/CloudSlackSection.tsx` | Opens the web Slack settings in the system browser. |
| endpoint | /api/webhooks/slack-interactions | `apps/web/app/api/webhooks/slack-interactions/route.ts` | Receives Approve and Deny button clicks. |
| service | Interactions | `apps/web/lib/slack/slack-interactions.ts` | Validates a click and resumes the parked run. |
| table | slack_installations, slack_link_requests, slack_account_links, slack_assistant_runs | `apps/web/db/neon/0330_slack_app.sql` | Creates the four tables. |
| table | slack_assistant_runs status change | `apps/web/db/neon/0333_slack_run_cancel_and_delete.sql` | Adds cancelled status and owner delete. |
| config | Rate limit entries | `apps/web/lib/rate-limit.ts` | slack-assistant-team (120 per minute) and slack-assistant-user (12 per minute). |
| config | Plan capability slack_app | `packages/contracts/types/src/billing-catalog.ts` | Defines which plans may use Chat in Slack. |
| service | Plan check for settings | `apps/web/lib/slack/slack-settings.ts` | slackPlanAllowed, workspace choices and overview. |
| test | Receiver tests | `apps/web/app/api/webhooks/slack/route.test.ts` | Signature, replay, handshake, queue failure and no inline run. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Slack sends the event to /api/webhooks/slack; rate limit and 256 KB cap checked; signature and five minute window verified. | our servers | apps/web/app/api/webhooks/slack/route.ts:36-72; apps/web/lib/rate-limit.ts:474-478 |
| The event is read; direct messages become an assistant event that runs after the response is sent, so Slack gets its acknowledgment in time. | our servers | route.ts:84-94; slack-events.ts:67-86 |
| Installation is found, the Slack user is checked against the account link; an unlinked user gets a one-time link prompt. | our servers | slack-assistant.ts:305-327; slack-links.ts:66-127 |
| Per workspace and per user rate limits are checked; over the limit gives one notice. | our servers | slack-assistant.ts:284-293, 340-343 |
| The bot adds the eyes reaction, reads earlier DM messages and names from Slack, and builds the conversation. | outside service | slack-assistant.ts:232; slack-context.ts:198-259; slack-api.ts:175-240 |
| Entitlement, access, model route, content screening, secret check, memory and usage reservation are applied, then the model runs with the allowed tools; cost is settled. | our servers | slack-assistant-turn.ts:412-665 |
| The model call goes to the provider chosen by managed routing. | outside service | slack-assistant-turn.ts:334-352, 602-642 |
| The answer is converted to Slack blocks and posted in the DM with the bot token; the reaction is removed; the run is marked completed. | outside service | slack-assistant.ts:150-166, 255-257; slack-messages.ts:159-184 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Slack workspace installation with encrypted bot token | table slack_installations | Server database only | Deleted on uninstall or token revoke events and when the owner removes the workspace (slack-assistant.ts:426-447; SlackSection.tsx removal text). |
| Account link between Slack user and AGI user | table slack_account_links | Server only | Deleted by Disconnect, which also deletes the person's run records (slack-links.ts:263-301). |
| One-time link request (hash of token only) | table slack_link_requests | Server only | Deleted when used; expires after 15 minutes (slack-links.ts:159-190). |
| Run record: channel, message time, status, approval state | table slack_assistant_runs | Server only | Deleted on Disconnect; pending approvals expire after 24 hours (slack-runs.ts). |
| Usage and cost of the answer | Managed usage ledger via reserve and finalize | Server only | Per the usage system (SYS-subscriptions-entitlements-and-usage); retention not read. |
| Slack message text | Not stored by this path for DM answers; it is read live from Slack each turn [inferred from slack-context.ts] | not applicable | Stays in Slack under the workspace's own rules. |

**Models and providers.** The model is chosen by managed Cloud route admission using the person's plan, the workspace model policy and the training opt-out preference (slack-assistant-turn.ts:334-352, 439-479). Media models are refused (353-358). The provider list is not fixed in this feature. The answer footer shows the model's display name.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | An AGI account linked to the Slack user; the account must be allowed to run unattended and, for a workspace link, still be a member (slack-links.ts:66-100). |
| Permissions | The person who installed the app is the installer; only they manage workspaces and channel policies. Linking is per Slack user. Only the asker can approve a pending request (slack-interactions.ts:88-89, 118-120). |
| Subscription | Chat in Slack (capability slack_app) on pro, max, max_15x, team, team_premium and enterprise (billing-catalog.ts:341,360,418). Checked in slack-assistant-turn.ts:415-421 and at link confirm (api/slack/link/route.ts). |
| Limits and metering | 120 per minute per workspace and 12 per minute per Slack user (rate-limit.ts:479-488). Each answer reserves and settles managed usage with workload 'chat' (slack-assistant-turn.ts:554-582). Quota refusals show recovery links. Event receiver: 300 per minute per IP (rate-limit.ts:474). |
| Feature flags | Config names: SLACK_SIGNING_SECRET, SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET, NEXT_PUBLIC_APP_URL (slack-config.ts:55-71). No feature flag found for DMs. |
| Model compatibility | Any model the managed router admits for the person; tool use needs a provider with an adapter, otherwise a plain completion is used (slack-assistant-turn.ts:505, 602-642). |
| Provider restrictions | Google connector tools are never offered in Slack (slack-assistant-turn.ts:494-503). Models that keep inputs out of training are required when the person opted out (slack-assistant-turn.ts:344-346). |
| Local mode | Not available. The Slack path always uses managed Cloud routing and the web service. The desktop app only opens the web settings page. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Eyes reaction on the message while the answer runs; removed at the end. | slack-assistant.ts:113-128, 232, 256 |
| Unlinked user | One link prompt per event; a retry of the same event does not issue another token. | slack-links.ts:106-126 |
| Workspace left or account unavailable | A notice; not repeated on a Slack retry. | slack-assistant.ts:328-338 |
| Rate limited | A notice once, not on Slack retries. | slack-assistant.ts:340-343 |
| Duplicate delivery | A second run with the same event id is skipped. | slack-runs.ts:177-201 (on conflict do nothing) |
| Timeout | The turn is aborted at the tool-loop budget; the person gets the failure notice. | slack-assistant.ts:234-253 |
| Provider or quota failure | A refusal message with a recovery link where one applies. | slack-assistant-turn.ts:583-595 |
| Secret in the message | Refused with a message to remove it. | slack-assistant-turn.ts:120-122, 393-394 |
| Slack token revoked | The installation is deleted. | slack-assistant.ts:436-443 |
| Attachments | Only file names are passed; contents are not read. | slack-context.ts:241-243 |
| Offline or reconnect | not handled in the code beyond Slack's own retry; retries are detected and suppress repeat notices. | route.ts:85; slack-assistant.ts:329 |
| Accessibility | Web settings and link page use labelled sections and alert roles; Slack's own UI governs the rest. | SlackSection.tsx:119; app/slack/link/page.tsx:116-134 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/webhooks/slack/route.test.ts`: Unset secret, bad signature, replay, handshake, queue failure and no inline run.
- `apps/web/lib/slack/slack-interactions.test.ts`: Approval button clicks and refusals.
- `apps/web/lib/slack/slack-assistant.approval.test.ts`: Resuming a parked approval when the channel is off or on.
- `apps/web/lib/slack/slack-runs.approval-generation.test.ts`: Approval generation handling.
- `apps/web/lib/slack/slack-assistant-turn.system-prompt.test.ts`: System prompt assembly for Slack turns.
- `apps/web/lib/slack/slack-assistant-turn.google-user-data.test.ts`: Google user data handling in Slack turns.
- `apps/web/app/api/slack/link/__tests__/route.test.ts`: Link preview and confirm route.
- `apps/web/app/slack/link/page.test.tsx`: Link page.
- `apps/web/app/api/slack/__tests__/route.test.ts`: Settings overview route.
- `apps/web/features/settings/sections/SlackSection.lifetime.test.tsx`: Settings section lifetime.

**Test scenarios**

- **Link then answer**
  1. Use a test Slack workspace with the app installed and a paid test account.
  2. Send a DM as an unlinked user.
  3. Open the link, sign in, confirm.
  4. Send the DM again.
  - Expected: Connect prompt, welcome message, then an answer in the DM with an eyes reaction during the run.
- **Plan gate**
  1. Link an account on a plan with the capability, then move the account to a plan without it.
  2. Send a DM.
  - Expected: The message 'AGI in Slack is available on ... plans.' with a See plans button.
- **Rate limit**
  1. Send 13 DMs in under a minute.
  - Expected: One rate-limit notice; later messages answered after a minute.
- **Ignored messages**
  1. Send an empty message, a bot post and a 12-character hex code.
  - Expected: No reply.
- **Disconnect**
  1. Settings, Slack app, Your Slack accounts, Disconnect, confirm.
  2. Send a DM.
  - Expected: Runs deleted; next DM gives a new link prompt.
- **Unconfigured service**
  1. Unset SLACK_SIGNING_SECRET in a test environment.
  2. Post a signed event.
  - Expected: 503 'Slack events are not configured' and Settings shows not set up.

**Where to look when it fails**

- Log 'SLACK_SIGNING_SECRET is not set; Slack events are refused until it is' (route.ts:49).
- Log 'Slack event signature rejected' (route.ts:54).
- Log 'Slack answer failed; the person was told' (slack-assistant.ts:238).
- Log 'NEXT_PUBLIC_APP_URL is not set; Slack messages cannot be answered' (slack-assistant.ts:302).
- Log 'Slack event from a workspace with no installation' (slack-assistant.ts:307).
- Error class SlackApiError with codes such as ratelimited, token_revoked.
- Tables slack_assistant_runs (status, error), slack_account_links, slack_installations.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md](../../70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md)

## 10. Gaps and dependencies

- **Feature is off until the owner creates and configures the Slack app and applies the migrations.** Affects: All web users and desktop users (through the web service).. Evidence: Brief S106.13 Unfinished note; slack-config.ts:57-64; route.ts:48-52.. Work needed: Owner setup per docs/runbooks/connector-oauth-apps.md; confirm migration state in each environment.
- **Attached files are not read.** Affects: Slack users who share documents.. Evidence: slack-context.ts:241-243. Work needed: Fetch and parse allowed files with consent and size limits.
- **No Local or own-key route in Slack.** Affects: Users who want Local or own-key mode.. Evidence: slack-assistant-turn.ts:334 uses managed routing only.. Work needed: Product decision; if wanted, explicit consent and provider label.
- **Docs disagree: wire-or-cut says inbound Slack was cut.** Affects: Engineers reading docs.. Evidence: docs/decisions/wire-or-cut.md:74 versus current code.. Work needed: Update the decision record to match the code.
- **No end-to-end test with real Slack is recorded.** Affects: Release confidence.. Evidence: No test file or run log found that records a live run.. Work needed: Run the scenarios in a test workspace.
- Not built on: Desktop (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:pro
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-execution-boundaries
- table:slack_installations
- table:slack_account_links
- table:slack_assistant_runs
- table:slack_link_requests
- api:POST /api/webhooks/slack
- api:POST /api/webhooks/slack-interactions
- api:POST /api/slack/link

## Unknown

- Whether the Slack app is created and migrations 0330, 0333, 0374 and 0385 are applied in production; the code cannot show it.
- Which providers are admitted for a given plan; owned by SYS-model-catalog-and-routing.
- Retention period of usage records.
- Exact visible name of the Slack app in a workspace; set in Slack, not in the repository.
