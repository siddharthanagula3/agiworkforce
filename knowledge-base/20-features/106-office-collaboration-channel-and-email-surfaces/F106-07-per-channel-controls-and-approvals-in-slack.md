---
id: "F106-07"
type: "feature"
title: "Per-channel controls and approvals in Slack"
aliases: ["Channel-based approvals (S106.20)", "Channel-specific permissions (S106.22)", "Slack channel policies", "slack_channel_policies", "What AGI may do in a channel", "Waiting for your approval", "Approve / Deny buttons"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.20", "S106.22"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:pro", "plan:max", "plan:team", "plan:enterprise", "table:slack_channel_policies", "table:slack_assistant_runs", "table:slack_installations", "api:PUT /api/slack/installations/{installationId}/channels", "api:POST /api/webhooks/slack-interactions", "api:POST /api/slack/runs/{runId}/approval", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-execution-boundaries", "F106-08", "F106-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-07 Per-channel controls and approvals in Slack

The person who added the AGI app to a Slack workspace picks, per channel, whether AGI is off, answers only, or runs tasks, and which tool groups it may use. When a Slack answer or task needs approval, Approve and Deny buttons appear in Slack. Web only; Teams and email approvals do not exist.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.20](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10620), [S106.22](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10622).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Two linked controls for the AGI Slack app on web. (1) Per-channel policy: mode (off, answer, task) and a tool allow-list (web, code, apps) stored per Slack channel and read on every message (apps/web/lib/slack/slack-channel-policies.ts:28-67). (2) Approval in the channel: when the tool loop pauses for a sensitive step, AGI posts the request with Approve and Deny buttons in Slack and resumes when the linked requester clicks (apps/web/lib/slack/slack-messages.ts:234-280; apps/web/lib/slack/slack-interactions.ts:91-160).

**Why it exists.** Admins need to limit where and how far an assistant acts in shared channels, and a person needs to approve risky steps where the conversation happens. The migration says AGI used to answer the same way in every channel and cites Claude in Slack and ChatGPT as references (apps/web/db/neon/0374_slack_channel_policy_and_agent_credit_cap.sql:1-12).

**Who uses it.** The installer (the AGI user who added the app to the Slack workspace) sets policies. The requester (a Slack user linked to their AGI account) approves or denies their own pending steps (apps/web/lib/slack/slack-interactions.ts:88-89, 118-120).

**Problems it solves**

- AGI answering or acting in channels where it should be quiet
- AGI using web, code or connected apps in a channel that should not allow them
- Having to leave Slack to approve a step
- A stale or forged approval click resuming the wrong step

**Use cases**

- An installer turns AGI off in a private HR channel and leaves it on elsewhere
- An installer allows answers but no code in a customer channel
- A requester mentions AGI in a channel; it needs approval for a connected-app action; the requester clicks Approve in Slack
- A requester ignores a request and the approval expires after 24 hours

## 2. User experience

**Where to find it**

- Web: Settings, Slack section, card 'Slack workspaces you added'; each workspace row shows the channel editor (apps/web/features/settings/sections/SlackSection.tsx:634,680).
- Web: Settings, Slack section, card 'Waiting for your approval' lists pending requests with Approve and Deny (apps/web/features/settings/sections/SlackSection.tsx:564-577,255-258).
- Slack: the approval card is posted in the channel thread (visible only to the requester) or in the DM (apps/web/lib/slack/slack-assistant.ts:80-97).
- Desktop: the public Electron desktop shows the hosted web app, so the same Settings screens apply (doc: AGENTS.md section 5). Mobile, CLI, VS Code and Chrome: none found in the code for this feature.

**Before you start**

- Slack app configured on the server (signing secret, client id and secret, app URL, connector token storage) (apps/web/lib/slack/slack-config.ts:71-78)
- Installer account added the app to the workspace; requester linked their Slack account to AGI
- A plan that includes the Slack capability; task mode also needs AGI Work (apps/web/lib/slack/slack-assistant-turn.ts:415-428)

**Screens and controls**

- Intro text: 'Choose what AGI may do in each channel of <team>. Channels you have not set answer and run tasks as usual. Direct messages are not affected.' (apps/web/features/slack/components/SlackChannelPolicies.tsx:230-233)
- Per channel: link showing the channel ID that opens Slack, and a select with options 'Default: answers and runs tasks', 'Answers and runs tasks', 'Answers only, never starts a task', 'Off: does not answer here' (SlackChannelPolicies.tsx:22-26,258-278)
- When mode is answer or task: fieldset 'Tools AGI may use in <channel>' with checkboxes 'Search and read the web', 'Run code', 'Use connected apps and integrations' (SlackChannelPolicies.tsx:27-31,280-304)
- Form 'Turn it off in another channel' with a channel ID box and a 'Turn off' button (SlackChannelPolicies.tsx:313-359)
- Slack card buttons 'Approve' and 'Deny' plus a 'Review in AGI' link (apps/web/lib/slack/slack-messages.ts:263,270,276)

**Journey**

1. Installer opens Settings, Slack; the list of channels loads ('Loading channels...').
2. Channels where someone has mentioned the app appear automatically; for others the installer types the channel ID and clicks 'Turn off'.
3. Installer picks a mode and unticks tool groups; each change saves immediately.
4. A linked person mentions AGI in a channel; AGI applies the policy: off gives a private notice, answer never starts a task, task may.
5. If a step needs approval, AGI posts a card with the step list and Approve and Deny.
6. The requester clicks a button; Slack replaces the card text with 'Approved. AGI is continuing and will answer in this thread.' or 'Denied. Nothing was run, and AGI will answer without that step.'
7. AGI posts the continued answer in the thread.

**What the person sees and gets**

- Channel off: private message 'AGI is turned off in this channel by the person who added it to Slack. You can still message it directly.' (apps/web/lib/slack/slack-assistant.ts:61-62)
- Refusals on click: 'This request is no longer waiting for approval.', 'Only the person who asked can approve this...', 'This approval card is out of date. Review the current request in AGI.' (slack-interactions.ts:117,88-89,86)
- An in-app notification 'A Slack task|answer is waiting for your approval' (slack-assistant.ts:193-204)
- Error text in the editor: 'Channel settings could not be loaded.' and 'The result could not be confirmed. Check Slack before trying this action again.' (SlackChannelPolicies.tsx:51,206-208)

**Settings**

- Per-channel mode and tool allow-list (stored in slack_channel_policies)
- No setting for the approval window; it is a constant of 24 hours (apps/web/lib/slack/slack-config.ts:30)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Policy storage, read and write for mode and tool groups with installer-only access and an audit event on change (apps/web/lib/slack/slack-channel-policies.ts:145-181; apps/web/app/api/slack/installations/[installationId]/channels/route.ts:50-80).
- Policy is applied before a run starts; mode off stops the run and sends the CHANNEL_OFF notice (apps/web/lib/slack/slack-assistant.ts:349-366).
- Tool groups gate web, code and connected apps for the turn (apps/web/lib/slack/slack-assistant-turn.ts:487-505). Google connector tools are never offered in Slack (slack-assistant-turn.ts:495-501).
- Unreadable policy during approval resume gives the run no tools (slack-channel-policies.ts:44-58; slack-assistant.ts:488-492).
- Approve and Deny buttons in Slack with a signed webhook, requester check, generation check, audit event and resume (apps/web/app/api/webhooks/slack-interactions/route.ts:36-89; slack-interactions.ts:91-160).
- In-app approval alternative: Settings card and POST /api/slack/runs/{runId}/approval (apps/web/app/api/slack/runs/[runId]/approval/route.ts:28-88).
- Approval expiry: the run is parked with approval_expires_at = now + 24 hours (slack-runs.ts:233-260); a click after expiry is refused with 'This approval expired...' (slack-runs.ts:380-385); listing pending approvals marks expired rows and stops their parked tasks as timed_out (slack-runs.ts:278-295).
- If the channel is switched off while a run waits, resume is refused and the run settles failed (slack-assistant.ts:497-508).

**Incomplete**

- Expiry is enforced lazily: on click and when the Settings approvals list is read. No scheduled job that expires them was found (searched apps/web/lib and app/api/cron/deployable-components.json for slack; none).
- Policy applies only to channel messages; DMs are not affected (slack-assistant.ts:349-352; SlackChannelPolicies.tsx:231-232).
- The channel list shows raw channel IDs, not names; channel_name column exists but the code reads and writes no name (migration 0374; slack-channel-policies.ts:84-143).
- Approval cards for channel runs are ephemeral, visible only to the requester (slack-assistant.ts:90-96); no approver other than the requester is allowed.

**Present but disconnected or switched off**

- Brief marks S106.20 and S106.22 as 'missing' for web and desktop, but the code above exists and is connected for Slack; the status is out of date [inferred]. Everything is inert until the owner configures the Slack app and applies migrations 0330, 0333, 0374 and 0385 (brief S106.13 'Unfinished' note; migration files).

**Not available**

- Teams approvals: no Teams bot code (see F106-09).
- Email approvals: no inbound or outbound approval mail path found (see F106-10).
- Mobile, CLI, VS Code and Chrome surfaces: not applicable per brief.

## 4. Required behaviour

**Established requirements**

- When an agent needs approval, the request appears in a channel (Slack, Teams or email) and can be approved there. (source: S106.20)
- Admins or users can set what the agent may do per channel (which channels it may read, post in or act on). (source: S106.22)
- Approvals are shown in Slack and also as an in-app notification. (source: apps/web/lib/slack/slack-assistant.ts:193-204)
- A missing policy row means the default: answers and runs tasks when task is available. (source: apps/web/lib/slack/slack-channel-policies.ts:60-67)
- An unreadable tool list gives the run no tools. (source: apps/web/lib/slack/slack-channel-policies.ts:44-58)
- A pending approval expires after 24 hours. (source: apps/web/lib/slack/slack-config.ts:30)

**Acceptance criteria**

1. Setting a channel to off makes a mention there return the 'turned off' notice and creates no run.
2. Setting a channel to answer never opens a task conversation even when the plan allows tasks.
3. Unticking 'Run code' removes code tools from the next turn in that channel; ticking all three stores null (all tools).
4. Only the installer can read-write policies for that workspace; another AGI user gets 'That Slack workspace is not one you installed'.
5. A step needing approval posts Approve and Deny; clicking as the requester resumes; clicking as another Slack user is refused.
6. Clicking an old card after a newer checkpoint is refused as out of date.
7. After 24 hours, Approve returns 'This approval expired'.
8. Denying resumes the answer without that step.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Per-channel read or post restrictions (which channels AGI may read) are not modelled; only off/answer/task and tool groups exist, so S106.22 is covered in part [inferred].
- Approver is always the requester; an admin cannot approve for someone else [inferred from NOT_YOURS check].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the installer view channel names, not just IDs.
- [proposed] Add a scheduled job that expires parked approvals and tells the person in Slack.
- [proposed] Update the brief status for S106.20 and S106.22 to partial.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | slack-channel-policies | `apps/web/lib/slack/slack-channel-policies.ts` | Read, list and set per-channel mode and tools; mode resolution |
| schema | SlackChannelPolicy contracts | `packages/contracts/cloud-contracts/src/slack-channel-policies.ts` | Modes, tool groups, ids and request and response schemas |
| component | SlackChannelPolicies | `apps/web/features/slack/components/SlackChannelPolicies.tsx` | Settings channel editor |
| screen | SlackSection | `apps/web/features/settings/sections/SlackSection.tsx` | Settings, Slack: workspaces, channel editor, approvals list |
| endpoint | GET/PUT /api/slack/installations/{installationId}/channels | `apps/web/app/api/slack/installations/[installationId]/channels/route.ts` | List and set channel policies with CSRF, rate limit and audit |
| table | slack_channel_policies | `apps/web/db/neon/0374_slack_channel_policy_and_agent_credit_cap.sql` | One row per installation and channel; installer-only write by row-level security |
| table | slack_channel_policies.allowed_tools | `apps/web/db/neon/0385_slack_channel_tool_allow_list.sql` | Tool group list; null means all |
| table | slack_assistant_runs | `apps/web/db/neon/0330_slack_app.sql` | Run row with approval checkpoint, request and expiry |
| service | slack-assistant | `apps/web/lib/slack/slack-assistant.ts` | Applies policy, posts approval card, records notification, resumes after decision |
| service | slack-assistant-turn | `apps/web/lib/slack/slack-assistant-turn.ts` | Plan checks and tool plan gated by channel tool groups |
| service | slack-runs | `apps/web/lib/slack/slack-runs.ts` | Park run for approval, expiry, claim with generation check |
| service | slack-interactions | `apps/web/lib/slack/slack-interactions.ts` | Parse button click, check requester, claim approval |
| endpoint | POST /api/webhooks/slack-interactions | `apps/web/app/api/webhooks/slack-interactions/route.ts` | Signed Slack button callback |
| endpoint | POST /api/slack/runs/{runId}/approval | `apps/web/app/api/slack/runs/[runId]/approval/route.ts` | In-app approve or deny |
| service | slack-messages | `apps/web/lib/slack/slack-messages.ts` | Builds approval card with buttons |
| config | SLACK_APPROVAL_TTL_HOURS | `apps/web/lib/slack/slack-config.ts` | Approval window constant (24) |
| service | slack-settings | `apps/web/lib/slack/slack-settings.ts` | Builds the Settings view including pending approvals |
| service | notification-service use | `apps/web/lib/slack/slack-assistant.ts` | Records the in-app approval notification |
| config | slack_app capability tiers | `packages/contracts/types/src/billing-catalog.ts` | Plan tiers allowed to use AGI in Slack |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Installer changes a channel setting; browser sends PUT with CSRF; server checks the caller installed the workspace and writes the row; audit event recorded. | device and our servers | apps/web/app/api/slack/installations/[installationId]/channels/route.ts:50-80; slack-channel-policies.ts:69-82,145-181 |
| Slack sends a mention event; AGI verifies the link, rate limits, reads the channel row and resolves mode. | our servers | apps/web/lib/slack/slack-assistant.ts:295-366 |
| Turn checks plan and compute access, picks a model route, builds a tool plan limited to allowed groups. | our servers | apps/web/lib/slack/slack-assistant-turn.ts:413-505 |
| Run parks with checkpoint and expiry; card posted via Slack API privately; in-app notification recorded. | our servers | slack-assistant.ts:178-206; slack-runs.ts:233-260 |
| Slack delivers button click to the interactions endpoint; signature verified; decision claimed in a locked transaction; audit event; run resumes after the response. | outside service | apps/web/app/api/webhooks/slack-interactions/route.ts:36-89; slack-runs.ts:359-417 |
| Slack message and card are held by Slack; the card text is replaced through response_url. | outside service | slack-interactions route.ts:24-34 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Channel policy rows (mode, allowed tools, updated_by) | table slack_channel_policies | Server database only; no device copy | Deleted with the installation (on delete cascade) or when the installer sets the default (slack-channel-policies.ts:156-161; migration 0374) |
| Approval checkpoint, request and expiry | slack_assistant_runs columns approval_checkpoint, approval_request, approval_expires_at | Server only | Cleared when decided, expired or settled (slack-runs.ts:213-222,282-293) |
| Audit events connector_setting_changed and tool_approval_decided | security audit log | Server only | unknown |

**Models and providers.** The model for the resumed turn is the one in the saved checkpoint; if it is retired the run is refused with 'model_retired' (slack-assistant-turn.ts:455-460). Routing runs on the server (selectRoute); no Local or own-key path was found in the Slack turn.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | AGI account linked to a Slack account; the installer must be the AGI user who installed the workspace (slack-channel-policies.ts:69-82). |
| Permissions | Installer-only write by code and row-level security (migration 0374). Approver must be the requester with an active link (slack-interactions.ts:118-120). |
| Subscription | Slack capability needs tier pro, max, max_15x, team, team_premium or enterprise; task mode also needs the AGI Work capability on the same tiers (packages/contracts/types/src/billing-catalog.ts:341,354,360; slack-assistant-turn.ts:415-428). |
| Limits and metering | Slack team and user rate limits ('slack-assistant-team', 'slack-assistant-user') (slack-assistant.ts:284-293); settings rate limit 'slack-settings'; approval route uses 'llm-completion'; managed compute access check per turn (slack-assistant-turn.ts:429-437). Limit values: unknown here. |
| Feature flags | Task availability is gated by the WORK capability kill switch and managed-compute workspace access (apps/web/lib/slack/slack-tasks.ts:45-76). Slack as a whole needs isSlackAppConfigured (slack-config.ts:71-78). |
| Model compatibility | A resumed run needs a model that can still use tools, else 'model_cannot_resume' (slack-assistant-turn.ts:507-512). |
| Provider restrictions | Models that may train on inputs are refused when Google user data is in context or the user opted out (slack-assistant-turn.ts:462-471). Google connector tools are never offered in Slack (slack-assistant-turn.ts:495-501). |
| Local mode | Not applicable: the feature runs entirely on our servers through Slack; none found in the code for Local or own-key. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading channels | Spinner and 'Loading channels...' (SlackChannelPolicies.tsx:239-244) | SlackChannelPolicies.tsx:239-244 |
| No channels yet | 'No channels yet. Channels where someone mentions the app appear here.' | SlackChannelPolicies.tsx:308-311 |
| Save fails or result unknown | Error text; after dispatch, further edits are blocked and the person is told to check Slack | SlackChannelPolicies.tsx:201-213 |
| Invalid channel ID typed | 'Turn off' button disabled | SlackChannelPolicies.tsx:223-224,356 |
| Approval expired | Click refused as expired; list marks run expired and stops the task as timed_out | slack-runs.ts:282-295,380-385 |
| Task stopped in AGI while waiting | Click refused 'This task was stopped in AGI' | slack-runs.ts:418-423 |
| Double click or two clients | Row lock and status change; second claim sees 'not waiting for approval' | slack-runs.ts:359-378,407-415 |
| Slack installation removed before approval | Run settles failed; person told the workspace is no longer connected | slack-assistant.ts:478-487 |
| Offline or retry | Retried Slack deliveries do not repeat private notices (options.retrying); other offline handling for the editor: not handled in the code | slack-assistant.ts:329-336,341,364 |
| Accessibility | Select has an aria-label per channel, fieldset legend, alert role on errors, touch-size select | SlackChannelPolicies.tsx:229,234-236,259,282 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/slack/slack-channel-policies.test.ts`: mode mapping, installer-only, saving and keeping tools, unknown group read as none, unreadable policy gives no tools
- `apps/web/lib/slack/slack-assistant-turn.channel-tools.test.ts`: which tool groups are offered for no list, partial list, apps only, empty list
- `apps/web/lib/slack/slack-assistant.approval.test.ts`: resume refused when the channel was turned off, task settled failed, resume with saved tools, DMs ignore channel policy
- `apps/web/lib/slack/slack-interactions.test.ts`: Approve and Deny on the card, generation binding, click parsing and Slack-only response URLs, requester check, reachable endpoint
- `apps/web/lib/slack/slack-runs.approval-generation.test.ts`: approval generation matching and stale cards
- `apps/web/features/slack/components/SlackChannelPolicies.test.tsx`: listing, saving mode, typed channel off, tool checkboxes
- `apps/web/features/slack/components/SlackChannelPolicies.lifetime.test.tsx`: draft and request lifetime, uncertain results, installation switch
- `apps/web/app/api/slack/installations/[installationId]/channels/route.test.ts`: GET, PUT, CSRF, validation, audit
- `apps/web/app/api/slack/runs/[runId]/approval/__tests__/route.test.ts`: auth, CSRF, validation, 404, 409, claim and resume
- `apps/web/db/neon/slack-channel-tool-allow-list-migration.test.ts`: migration 0385 shape
- `apps/web/db/neon/slack-channel-policy-and-agent-credit-cap-migration.test.ts`: migration 0374 shape

**Test scenarios**

- **Turn a channel off**
  1. As installer, open Settings, Slack
  2. Set a channel to 'Off: does not answer here'
  3. Mention AGI in that channel as a linked user
  - Expected: Private notice that AGI is turned off; no slack_assistant_runs row for it
- **Answer-only channel**
  1. Set 'Answers only, never starts a task'
  2. Mention AGI with a request that would be a task
  - Expected: Answer posted; run mode is answer; no new conversation in AGI
- **Approve in Slack**
  1. Mention AGI with a step needing approval
  2. Click Approve as the requester
  - Expected: Card text replaced with 'Approved...'; answer continues in thread; audit event tool_approval_decided
- **Wrong person clicks**
  1. Have another Slack user click Approve on the card (if visible)
  - Expected: Refused with 'Only the person who asked can approve this...'
- **Expiry**
  1. Leave a request for over 24 hours
  2. Click Approve
  - Expected: 'This approval expired. Ask again in Slack to start over.'

**Where to look when it fails**

- Log 'Slack channel tool policy unreadable; the run gets no tools'
- Log 'Slack assistant event could not be handled'
- Table slack_assistant_runs columns status, error (e.g. slack_channel_off:, task_stopped:)
- Audit event types connector_setting_changed and tool_approval_decided

**Hands-on test plans**

- Web: [70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md](../../70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md)
- Desktop: [70-qa/test-plans/desktop/106-office-collaboration-channel-and-email-surfaces.md](../../70-qa/test-plans/desktop/106-office-collaboration-channel-and-email-surfaces.md)

## 10. Gaps and dependencies

- **No Teams or email approval path** Affects: Teams and email users; web and desktop. Evidence: No Teams bot or inbound email code found; brief S106.20. Work needed: Build Teams and email channels first (F106-09, F106-10), then reuse the approval claim logic
- **No scheduled expiry sweep** Affects: Requesters who never open Settings; web. Evidence: slack-runs.ts:278-295 only runs on list. Work needed: Add a job that expires and notifies
- **Channels shown by ID only** Affects: Installers; web and desktop. Evidence: SlackChannelPolicies.tsx:256. Work needed: Store and show channel names (column channel_name exists)
- **No read or post restriction per channel beyond off/answer/task** Affects: Admins wanting read-only channels; web. Evidence: slack-channel-policies.ts; SlackChannelMode values. Work needed: Decide if S106.22 needs more controls
- **Brief statuses out of date** Affects: Planning. Evidence: Brief says missing; code present. Work needed: Update the brief
- **Docs say no inbound Slack app** Affects: Readers of decisions. Evidence: docs/decisions/wire-or-cut.md:74 contradicts the live inbound handler. Work needed: Correct the decision record

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:pro
- plan:max
- plan:team
- plan:enterprise
- table:slack_channel_policies
- table:slack_assistant_runs
- table:slack_installations
- api:PUT /api/slack/installations/{installationId}/channels
- api:POST /api/webhooks/slack-interactions
- api:POST /api/slack/runs/{runId}/approval
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-execution-boundaries
- F106-08
- F106-11

## Unknown

- Values of the Slack rate limits
- Retention of audit events
- Whether any cron or job outside apps/web expires parked approvals
- Whether 0330 status check allows 'cancelled' without 0333 (0333 not read)
- What the in-app Work page shows for a task awaiting approval
