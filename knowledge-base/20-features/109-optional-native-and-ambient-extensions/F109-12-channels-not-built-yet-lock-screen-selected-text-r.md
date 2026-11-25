---
id: "F109-12"
type: "feature"
title: "Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial)"
aliases: ["Ambient channels not built", "Lock-screen widget", "Selected-text rewrite", "Telephone access", "AGI in Slack", "Messaging-platform access", "Wearable voice", "Spatial/XR interface", "Chat in Slack"]
area: "109 Optional native and ambient extensions"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.02", "S109.08", "S109.12", "S109.15", "S109.16", "S109.17"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "plan:pro", "plan:max", "plan:team", "plan:enterprise", "api:POST /api/webhooks/slack", "table:slack_installations", "table:slack_account_links", "table:slack_assistant_runs", "table:slack_channel_policies", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-security-and-privacy", "SYS-voice-and-media"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-12 Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial)

A group of ways to reach AGI from outside the main apps. Slack is built in code: a signed event receiver and an assistant that answers direct messages and mentions, but it needs owner setup. Lock-screen widget, selected-text rewrite, phone calls, other messengers, wearables and spatial interfaces were not found in code.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.02](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10902), [S109.08](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10908), [S109.12](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10912), [S109.15](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10915), [S109.16](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10916), [S109.17](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10917).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Slack: after a workspace installs the AGI app and a person links their account, AGI answers direct messages and channel mentions in Slack on that person's plan (apps/web/lib/slack/slack-assistant.ts:420-449; apps/web/db/neon/0330_slack_app.sql header). The other channels do nothing today.

**Why it exists.** People want AGI where they already work or with hands free, as the leading assistants offer. The brief lists these as ambient extensions (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md, S109.02, S109.08, S109.12, S109.15, S109.16, S109.17).

**Who uses it.** Slack: team members on plans that include 'Chat in Slack' (pro, max, max_15x, team, team_premium, enterprise). Others: nobody yet.

**Problems it solves**

- Leaving the chat tool to ask AGI a question.
- Agent approvals needed while in Slack (approval through web or desktop).

**Use cases**

- Direct message AGI in Slack to summarise a thread.
- Mention AGI in a channel and get a threaded answer or an AGI Work task.
- Approve a tool step on the web page while Slack waits (apps/web/app/api/slack/runs/[runId]/approval/route.ts).

## 2. User experience

**Where to find it**

- Web: Settings, section 'Slack' (apps/web/features/settings/sections/SlackSection.tsx; apps/web/features/settings/lib/web-settings-sections.ts:39). The owner installs from there; each person then links their Slack account through /slack/link (apps/web/lib/slack/slack-config.ts:30-31).
- Slack itself: direct message the AGI app or mention it in a channel.
- Mobile, desktop, CLI, VS Code, Chrome: no Slack screen found.
- Lock screen: an iOS 18 control named 'Open AGI Mobile' says in its description that it can be placed on the Lock Screen, Control Center or Action Button (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:90-99). It opens the app; whether it works on a locked phone is unknown.

**Before you start**

- Slack: Slack app created and configured by the owner; signing secret, client id and client secret set; NEXT_PUBLIC_APP_URL set to a secure origin; connector token storage available (apps/web/lib/slack/slack-config.ts:62-70).
- Slack: a plan with 'slack_app' (pro or higher) (packages/contracts/types/src/billing-catalog.ts:360; apps/web/lib/slack/slack-assistant-turn.ts:415-421).
- Slack: migration 0330 applied; the brief also says 0333 must be applied before deploy (apps/web/db/neon/0330_slack_app.sql; 0333_slack_run_cancel_and_delete.sql).

**Screens and controls**

- Settings, Slack: add to Slack, installed workspaces, channel policies, linked accounts, disconnect, approval decisions (SlackSection.tsx; apps/web/features/slack/components/SlackChannelPolicies.tsx).
- In Slack: an 'eyes' reaction while working (slack-config.ts:50), a link message for unlinked people, notices such as 'AGI is turned off in this channel by the person who added it to Slack. You can still message it directly.' (slack-assistant.ts:50-51).
- Settings messages: 'AGI was added to Slack. Send it a message there to start.' and 'AGI in Slack is not available right now.' (SlackSection.tsx:46-50).

**Journey**

1. 1. The owner creates the Slack app and sets its secrets (owner task, per docs/runbooks/connector-oauth-apps.md section 3).
2. 2. A workspace admin opens Settings, Slack and adds the app (one workspace at a time).
3. 3. A person messages AGI in Slack and receives a link to connect their AGI account (15 minute link).
4. 4. After linking, AGI replies in the thread; a tool step may wait for approval on web or desktop.
5. 5. The person disconnects in Settings, Slack, which also deletes their run records.

**What the person sees and gets**

- Answers posted in Slack; 'I could not finish that answer. Please try again.'; rate limit notice 'You are sending messages faster than AGI can answer them. Wait a minute, then try again.'; plan notice 'AGI in Slack is available on <plans> plans.' with a 'See plans' link (slack-assistant.ts:49-55; slack-assistant-turn.ts:415-421).

**Settings**

- Per-channel mode and tools policy (slack_channel_policies, migrations 0374 and 0385).
- Slack bot scopes are listed in code (slack-config.ts:12-20).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Slack events route: rate limit, 256 KB body cap, signature check that fails closed (503 when the signing secret is unset), url_verification, then answer and trigger ingest (apps/web/app/api/webhooks/slack/route.ts:21-129).
- Assistant handles direct messages, mentions, uninstall and token revoke events (apps/web/lib/slack/slack-events.ts:57-99; slack-assistant.ts:420-449).
- Install, OAuth callback, account link, runs approval and channel policy routes exist under apps/web/app/api/slack.
- Answers run through managed cloud routing with plan and compute checks (apps/web/lib/slack/slack-assistant-turn.ts:334-437).
- Tables slack_installations, slack_link_requests, slack_account_links, slack_assistant_runs, slack_channel_policies (apps/web/db/neon/0330_slack_app.sql:31-140; 0374_slack_channel_policy_and_agent_credit_cap.sql:28).
- Nine test files in apps/web/lib/slack plus route tests exist.

**Incomplete**

- Setup depends on the owner: Slack app creation, secrets and applying migrations (brief; docs/runbooks/connector-oauth-apps.md:296-320).
- The brief cites apps/web/app/api/github/webhook/route.ts:253 as the evidence for messaging; that route handles review requests, not chat. The real Slack code is the slack route and lib/slack.
- The brief's status 'web partial' for Slack is based on the unfinished owner setup, not on missing code.
- Teams, WhatsApp and Telegram chat access: no route found (a search of apps/web/app and apps/web/lib matched only connector catalog files and Microsoft Graph).

**Present but disconnected or switched off**

- Slack answers nothing until SLACK_SIGNING_SECRET, SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and a secure app origin exist; Settings says the app is not set up (slack-config.ts:62-70; docs/runbooks/connector-oauth-apps.md:318-320).
- Mobile, desktop and Chrome have no Slack entry.

**Not available**

- Lock-screen widget (S109.02): no code found beyond the iOS control noted above.
- Selected-text rewrite shortcut (S109.08): none found in Desktop; the 'selected_text' matches in desktop code belong to agentic event handling in the Tauri build, not a rewrite shortcut (apps/desktop/src/hooks/useAgenticEvents.ts:396).
- Wearable voice (S109.12), telephone access (S109.15), spatial or XR (S109.17): no code found in desktop, mobile or web.
- Other messaging platforms (Teams, WhatsApp, Telegram): not found.

## 4. Required behaviour

**Established requirements**

- The phone lock screen can show an AGI widget or start an AGI action without unlocking. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.02)
- Text selected in any app can be rewritten by AGI with a shortcut and the result put back in place. (source: S109.08 (same brief))
- The user can talk to AGI from a smartwatch or other wearable. (source: S109.12 (same brief))
- The user can reach AGI by calling or texting a phone number. (source: S109.15 (same brief))
- The user can talk to AGI from a messaging platform (Slack, Teams, WhatsApp, Telegram) and get answers there. (source: S109.16 (same brief))
- AGI offers a spatial or XR interface. (source: S109.17 (same brief))
- Slack bot scopes only; the owner creates the app, sets SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribes to app_mention and message.im; migration 0333 applied before deploy. (source: S109.16 unfinished note; docs/runbooks/connector-oauth-apps.md:296-320)

**Acceptance criteria**

1. A Slack event without a valid signature gets 401; with the secret unset gets 503.
2. A direct message from an unlinked person gets a link message, not an answer.
3. A linked person on a plan below pro gets 'AGI in Slack is available on ... plans.'
4. A channel set to 'off' answers 'AGI is turned off in this channel...' only when mentioned, and runs nothing.
5. Disconnecting a Slack account deletes its run records.
6. Removing the app in Slack deletes the installation and its links.
7. For each unbuilt channel, no entry is shown anywhere in the apps.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Slack answers use the same plan, credits and model policy as web chat because they pass through managed cloud admission [inferred from slack-assistant-turn.ts:334-437].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Mark S109.16 as 'built, awaiting owner setup' rather than partial.
- [proposed] Ship a lock-screen widget family before wearables.
- [proposed] Decide product scope for Teams, WhatsApp and Telegram before any build.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/webhooks/slack | `apps/web/app/api/webhooks/slack/route.ts` | Verified Slack Events API receiver; hands off to assistant and trigger ingest. |
| service | slack-events | `apps/web/lib/slack/slack-events.ts` | Reads messages, mentions, uninstall and token revoke events. |
| service | slack-assistant | `apps/web/lib/slack/slack-assistant.ts` | Account link, channel policy, run start, answer and approval claim. |
| service | slack-assistant-turn | `apps/web/lib/slack/slack-assistant-turn.ts` | Plan check, managed route admission, compute access, model call. |
| service | slack-config | `apps/web/lib/slack/slack-config.ts` | Scopes, TTLs, credentials, app readiness. |
| service | slack-installations / slack-links / slack-runs | `apps/web/lib/slack/slack-installations.ts` | Installations, account links and run records (with slack-links.ts, slack-runs.ts). |
| endpoint | Slack install, OAuth callback and link routes | `apps/web/app/api/slack/install/route.ts` | Start install; also oauth/callback, link, links/[linkId], installations/[installationId] and channels routes. |
| endpoint | POST /api/slack/runs/[runId]/approval | `apps/web/app/api/slack/runs/[runId]/approval/route.ts` | Approve or deny a waiting step. |
| screen | SlackSection | `apps/web/features/settings/sections/SlackSection.tsx` | Settings, Slack. |
| component | SlackChannelPolicies | `apps/web/features/slack/components/SlackChannelPolicies.tsx` | Per-channel mode and tools. |
| screen | Slack link page | `apps/web/app/slack/link/page.tsx` | Landing page for the one-time link. |
| table | slack_installations, slack_link_requests, slack_account_links, slack_assistant_runs | `apps/web/db/neon/0330_slack_app.sql` | Slack app storage. |
| table | slack_channel_policies | `apps/web/db/neon/0374_slack_channel_policy_and_agent_credit_cap.sql` | Channel policy storage. |
| schema | Migration 0333 | `apps/web/db/neon/0333_slack_run_cancel_and_delete.sql` | Allows cancelled runs and owner deletion. |
| config | slack_app capability | `packages/contracts/types/src/billing-catalog.ts` | PRO_TIERS and label 'Chat in Slack'. |
| service | trigger ingest | `apps/web/lib/triggers/trigger-ingest.ts` | Queues routines for Slack events. |
| component | AGIWidgets (iOS) | `apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift` | Home widget and iOS 18 control; the only lock-screen-related code (lines 77-99). |
| other | Operator runbook | `docs/runbooks/connector-oauth-apps.md` | Slack app setup steps (lines 275-320). |
| test | Slack library tests | `apps/web/lib/slack/slack-assistant.approval.test.ts` | Approval flow (also slack-channel-policies, slack-interactions, slack-runs, slack-tasks tests, by name). |
| test | Slack route tests | `apps/web/app/api/slack/__tests__/route.test.ts` | Slack API route (by name; also install, link, callback, installations tests). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Slack posts an event to /api/webhooks/slack; the server rate-limits, caps size and verifies the signature. | our servers | apps/web/app/api/webhooks/slack/route.ts:21-60 |
| The route acknowledges at once and schedules the assistant work after the response; it also offers the event to the trigger ingest. | our servers | route.ts:85-118 |
| The assistant finds the installation, resolves the person's AGI link and the channel policy, and records a run. | our servers | slack-assistant.ts:420-449 and answerMessage |
| The turn checks plan 'slack_app', admits a managed cloud route, checks compute access, then calls the model. | our servers | slack-assistant-turn.ts:334-437 |
| The answer is posted back to Slack with the bot token. | outside service | apps/web/lib/slack/slack-api.ts (postSlackMessage import at slack-assistant.ts:19-24) |
| A step needing approval is parked; the person decides on web or desktop; the run resumes. | our servers | slack-assistant.ts:458-533 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Installation (bot token sealed), link requests (hash only), account links, runs and checkpoints, channel policies | tables in the web database | Server side only | Uninstall or token revoke deletes the installation and its links and runs; disconnect deletes the person's runs (0330, 0333 headers) |
| Slack message text and thread context sent to the model | Read from Slack at answer time; not stored here beyond run records [inferred] | Sent to the managed model route | Run records follow the rules above |

**Models and providers.** Slack answers use managed cloud routing and the person's plan model policy; the model is chosen by the route admission, not by Slack (apps/web/lib/slack/slack-assistant-turn.ts:334-437, :45-50). No on-device model takes part. The other channels have no model path.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Slack needs an AGI account linked to the Slack user; the app is installed once per Slack workspace by an AGI account (apps/web/db/neon/0330_slack_app.sql header). |
| Permissions | Slack bot scopes limited to those in slack-config; channel owners set per-channel mode and tools; approvals by the linked account. |
| Subscription | Capability slack_app, label 'Chat in Slack', allowed on pro, max, max_15x, team, team_premium and enterprise (packages/contracts/types/src/billing-catalog.ts:360, :418). Refusal code slack_plan_required (slack-assistant-turn.ts:415-421). |
| Limits and metering | Rate limit 'trigger-webhook' on the endpoint; per-person answer rate limit; body 256 KB; context limits in SLACK_CONTEXT_LIMITS; agent credit cap migration 0374; managed usage accounting is imported by the turn (slack-assistant-turn.ts:60-75). |
| Feature flags | Readiness depends on environment names SLACK_SIGNING_SECRET, SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET, NEXT_PUBLIC_APP_URL (names only). No feature flag found. |
| Model compatibility | Whatever the managed route admits for the plan; some models may be refused when the plan keeps chats out of training (slack-assistant-turn.ts:128). |
| Provider restrictions | Content-safety and training opt-out checks apply to the managed route (slack-assistant-turn.ts:45, :53, :125-128). |
| Local mode | Slack is a Cloud feature and has no Local mode. The unbuilt channels have none either. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Secret not set | 503 'Slack events are not configured'; error logged. | route.ts:48-55 |
| Bad signature | 401 'Invalid signature'. | route.ts:56-60 |
| Oversize body | 413. | route.ts:30-33 |
| Unlinked person | Gets a one-time link message. | slack-assistant.ts:125-130 |
| Workspace left | Told to disconnect in Settings, Slack and link again. | slack-assistant.ts:56-58, :129-136 |
| Rate limited | Notice to wait a minute. | slack-assistant.ts:54-55 |
| Token revoked | Installation removed and logged. | slack-assistant.ts:436-443 |
| Queue failure | 503 with Retry-After 10 so Slack redelivers. | route.ts:117-123 |
| Retry delivery | x-slack-retry-num is passed on to avoid duplicate answers. | route.ts:85-93 |
| Unbuilt channels | not handled in the code; nothing is shown. | no code found |
| Accessibility | Slack settings text only; no special handling read. | SlackSection.tsx (not read in full) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/slack/slack-assistant.approval.test.ts`: Slack approval flow (by name).
- `apps/web/lib/slack/slack-channel-policies.test.ts`: Channel policies (by name).
- `apps/web/lib/slack/slack-interactions.test.ts`: Slack interactions (by name).
- `apps/web/lib/slack/slack-runs.approval-generation.test.ts`: Approval generation (by name).
- `apps/web/lib/slack/slack-tasks.thread.test.ts`: Thread tasks (by name).
- `apps/web/lib/slack/slack-assistant-turn.system-prompt.test.ts`: System prompt (by name).
- `apps/web/app/api/slack/__tests__/route.test.ts`: Slack overview route (by name).
- `apps/web/app/api/slack/install/__tests__/route.test.ts`: Install route (by name).
- `apps/web/app/api/slack/oauth/callback/__tests__/route.test.ts`: OAuth callback (by name).
- `apps/web/app/api/slack/link/__tests__/route.test.ts`: Link route (by name).
- `apps/web/features/settings/sections/SlackSection.lifetime.test.tsx`: Settings section (by name).

**Test scenarios**

- **Signature**
  1. Post a Slack event with a wrong signature, then with the secret unset.
  - Expected: 401 then 503.
- **Link and answer**
  1. Install the app in a test workspace.
  2. DM the app from an unlinked account.
  3. Open the link, sign in, DM again.
  - Expected: Link message first; then an answer in Slack.
- **Plan refusal**
  1. Link a free account and DM the app.
  - Expected: 'AGI in Slack is available on ... plans.' with 'See plans'.
- **Channel off**
  1. Set a channel to off.
  2. Mention the app there.
  - Expected: Notice that AGI is turned off; no run.
- **Disconnect**
  1. Disconnect the Slack account in Settings, Slack.
  - Expected: Run records deleted; next message asks to link again.
- **Absence check**
  1. Search the apps for lock-screen widget, selected-text shortcut, wearable, phone number and XR entries.
  - Expected: None reachable.

**Where to look when it fails**

- Log lines 'Slack events are refused until it is' (secret unset), 'Slack event signature rejected', 'Slack assistant event could not be handled', 'Slack installation removed after Slack revoked the app'.
- Tables slack_installations and slack_assistant_runs; settings status codes in SlackSection.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/web/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **Slack is built in code but not usable until the owner creates the Slack app, sets secrets and applies migrations.** Affects: All web users; Slack teams.. Evidence: area brief S109.16; docs/runbooks/connector-oauth-apps.md:296-320; slack-config.ts:62-70. Work needed: Owner setup, then a live run.
- **Brief evidence for S109.16 points to the GitHub review webhook, not Slack.** Affects: Accuracy of the brief.. Evidence: apps/web/app/api/github/webhook/route.ts:253. Work needed: Correct the brief to cite the Slack route and lib.
- **No Teams, WhatsApp or Telegram access.** Affects: Web users on those platforms.. Evidence: no route found. Work needed: Product decision and build.
- **No lock-screen widget, selected-text rewrite, wearable voice, telephone or spatial interface.** Affects: Mobile and Desktop users.. Evidence: area brief S109.02, S109.08, S109.12, S109.15, S109.17. Work needed: Product decision and build; the iOS 18 control is a starting point for the lock screen.
- **Brief says home-screen widgets are missing on mobile (S109.01) while the iOS widget code exists; the brief rates it differently from code.** Affects: Accuracy of the brief (outside this feature's item list).. Evidence: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77-87. Work needed: Recheck S109.01 status.
- Not built on: Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- plan:pro
- plan:max
- plan:team
- plan:enterprise
- api:POST /api/webhooks/slack
- table:slack_installations
- table:slack_account_links
- table:slack_assistant_runs
- table:slack_channel_policies
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-security-and-privacy
- SYS-voice-and-media

## Unknown

- Whether the Slack app has been created and secrets set in production (owner task; no file records it).
- Whether migrations 0330 to 0385 are applied in production.
- Whether the iOS 18 control works from a locked phone.
- Whether the Slack answer path honours the person's chosen model or only the plan default.
- Contents of the Slack test files were not opened.
- Whether Desktop has any hidden selected-text rewrite code in the internal Tauri build beyond the agentic event matches.
