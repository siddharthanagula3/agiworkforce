---
id: "F110-08"
type: "feature"
title: "Email and GitHub mentions start tracked work"
aliases: ["Email and GitHub mentions start tracked work", "Email thread to agent task (S110.10)", "Team mention to coding session (S110.11)", "Gmail trigger", "@agi-workforce mention", "GitHub App webhook", "Schedule triggers panel"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S110.10", "S110.11"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-api-and-contracts", "table:event_triggers", "table:github_installations", "api:POST /api/github/webhook", "api:POST /api/webhooks/gmail", "api:POST /api/triggers", "F110-09", "F110-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-08 Email and GitHub mentions start tracked work

A new email (Gmail trigger) or an @agi-workforce comment on a GitHub issue or pull request starts an agent run on our servers. Gmail triggers are currently refused because connectors are marked coming soon. GitHub mentions start a review or a cloud coding session and reply on GitHub, but only when sandbox switches and the installation's review setting are on.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.10](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11010), [S110.11](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11011).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns an outside event into tracked agent work. A Gmail trigger runs a saved schedule's prompt for each new message in a connected mailbox. A GitHub mention by a repository member starts a pull request review or a cloud coding session and posts progress and the result back as a comment.

**Why it exists.** The brief wants an email thread to become a tracked agent task, and a team mention to open a coding session that the team can follow and whose result posts back (doc: knowledge-base/data/area-briefs/110-cross-product-experiences-to-include-in-the-product-map.md, S110.10, S110.11). The founder decision says neither leader offers an address to forward email to an agent, so no forward address is built (doc: docs/decisions/2026-09-27-founder-decisions.md:164-168).

**Who uses it.** Individuals and teams with a connected Gmail account (when released) or a GitHub App installation on their repositories.

**Problems it solves**

- Copying email content into chat by hand
- Asking for code changes or reviews from inside GitHub without opening the app
- Giving the team one place (the session link) to follow the work

**Use cases**

- A routine summarises every new email from a mailbox.
- A maintainer writes '@agi-workforce fix the failing check' on a pull request.
- A reviewer writes '@agi-workforce' alone on a pull request to start a review.
- A team follows the linked cloud session from the issue comment.

## 2. User experience

**Where to find it**

- Web (and desktop, which shows the hosted web app, AGENTS.md section 5): Schedules page > triggers panel, source choices GitHub, Slack, Gmail, Google Calendar and 'Anything else (signed webhook)' (apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:55-100).
- GitHub: comment on an issue or pull request in a repository where the AGI GitHub App is installed (apps/web/app/api/github/webhook/route.ts:200-266).
- CLI: `agi schedules triggers add <schedule> --source gmail|github|...`, and /schedule in a Managed session (apps/cli/src/lib.rs:1650-1676; claude_parity.rs:1098-1115). The brief lists CLI as not listed; the code shows a trigger command exists.
- Mobile, Chrome: not found. VS Code: no email intake found; the cited localRuntimeClient lines are a thread-reconnect schema (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1150-1165).

**Before you start**

- Gmail: Gmail connected in Connectors with the same address as the trigger; the server has GMAIL_PUBSUB_TOPIC, GMAIL_PUBSUB_AUDIENCE and GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL set; connectors released (lines below).
- GitHub: AGI GitHub App installed with an ownership-verified installation row whose pr_review_enabled is true; commenter is OWNER, MEMBER or COLLABORATOR (route.ts:51-56, 228; cloud-code-github-task.ts:191-206).
- GitHub coding task: managed Code on (AGI_E2B_EXECUTION=1 plus E2B_API_KEY and priced compute), AGI_MANAGED_COMPUTE_PRIVATE_BETA not set to 0, a plan that includes AGI Code, workspace code policy allowing it (cloud-code-github-task.ts:221-238; apps/web/lib/e2b/gate.ts:20-28).

**Screens and controls**

- Triggers panel: Gmail option with 'Mailbox address' field, placeholder you@example.com and the note 'Runs for each new email. Use the Gmail address connected in Connectors.' (ScheduleTriggersPanel.tsx:73-80).
- Each source is disabled in the panel when triggerSourceAvailable() is false (ScheduleTriggersPanel.tsx:488).
- GitHub: the comment itself; replies are posted by the bot as issue comments.

**Journey**

1. Email: create or choose a schedule (its prompt describes the work).
2. Open the triggers panel, choose Gmail, enter the mailbox address, save. The server starts a Gmail watch (api/triggers/route.ts:101).
3. Gmail pushes a notice to our Pub/Sub endpoint; the server lists new inbox messages and ingests one event per message (webhooks/gmail/route.ts:49-95; gmail-watch.ts:414-440).
4. A background job creates a schedule run with the event data appended to the prompt as data, and the agent runs (trigger-fire.ts:59-75, 85-160).
5. The run appears in the schedule's run history; the trigger delivery is marked fired, filtered, failed or dead (trigger-fire.ts:110-195).
6. GitHub: a member comments '@agi-workforce <task>' on an issue or pull request. The webhook verifies the signature, drops duplicates and bots, checks the commenter's standing, then queues a review (empty text or a review request on a pull request) or a coding task (route.ts:70-266).
7. The bot comments 'AGI Code is working on this. Follow along or step in here:' with the session link, then posts the final message and opened pull request number, or a pause, stop or failure message (cloud-code-github-task.ts:61-75, 289-345).

**What the person sees and gets**

- GitHub comments with the session link and result (TASK_COPY strings, cloud-code-github-task.ts:61-75).
- Webhook JSON replies such as {received:true, task:'queued'} or review:'queued' (route.ts:261-267).
- Trigger delivery statuses and run history in the schedule (trigger-fire.ts:110-195).
- Gmail errors shown when saving a trigger: 'Gmail triggers are not set up on this server yet.', 'Connect Gmail in Connectors, then try again.', 'Reconnect Gmail in Connectors, then try again.' (gmail-watch.ts:53-59).

**Settings**

- Env GMAIL_PUBSUB_TOPIC (gmail-watch.ts:23), GMAIL_PUBSUB_AUDIENCE, GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL (apps/web/lib/triggers/trigger-signatures.ts:7-8).
- Env GITHUB_BOT_LOGIN and GITHUB_PR_REVIEW_MONTHLY_CAP (default 100) (route.ts:44, 59-61).
- Per-installation pr_review_enabled column (cloud-code-github-task.ts:191-206).
- Connector release state constant CONNECTOR_RELEASE_STATE (packages/contracts/types/src/connector-release.ts:14).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GitHub webhook: signature check, per-delivery dedupe, bot-sender filter, membership filter, review versus coding-task routing (apps/web/app/api/github/webhook/route.ts:63-266).
- GitHub coding task end to end in code: session creation, agent turn, changes read, commit and push, pull request opening and comment replies (apps/web/lib/services/cloud-code-github-task.ts:209-345).
- Event prompt wrapper that marks event data as data, not instructions (apps/web/lib/triggers/trigger-fire.ts:59-75).
- Trigger fire job: creates the run, runs the executor, settles the delivery (trigger-fire.ts:85-195).
- CLI trigger commands for sources including Gmail and GitHub (apps/cli/src/lib.rs:1650-1700).

**Incomplete**

- Gmail ingest reads message metadata and a snippet only, not the full thread (gmail-watch.ts:414, 430).
- GitHub coding task is skipped silently when the installation's pr_review_enabled is false: readTaskInstallation returns null and the function returns with no reply (cloud-code-github-task.ts:191-211).
- Email forwarded to or addressed to the assistant, and picking a thread from the mailbox, are not built; the first is ruled out by decision (doc: docs/decisions/2026-09-27-founder-decisions.md:164-168).
- Mobile, Chrome, VS Code have no intake.

**Present but disconnected or switched off**

- Gmail triggers: CONNECTOR_RELEASE_STATE is 'coming_soon' and gmail is a connector-backed source, so trigger creation throws connectorsComingSoonError and the panel option is unavailable (packages/contracts/types/src/connector-release.ts:14; apps/web/lib/triggers/trigger-types.ts:22-32; apps/web/lib/triggers/trigger-service.ts:302; ScheduleTriggersPanel.tsx:488). The brief calls web email trigger done; the code gate says otherwise.
- GitHub coding task needs the sandbox switches; otherwise the bot replies 'AGI Code cannot take coding tasks from GitHub right now, because managed Code sessions are not available on this deployment.' (cloud-code-github-task.ts:61-62, 221-224).
- Gmail push is refused with 503 'Gmail push is not configured' until audience and service account env are set (webhooks/gmail/route.ts:57-63).

**Not available**

- Forward-to-address email intake (decision).
- Slack-style team channel mention to coding session: only GitHub was read; no other channel mention path was found in the files read.
- Mobile and Chrome intake.

## 4. Required behaviour

**Established requirements**

- The user turns an email thread (forwarded, addressed, or picked from a connected mailbox) into an agent task that runs as a tracked task. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.10)
- A teammate's mention in a channel, issue or PR opens a coding session on the repository that the team can follow, and the result posts back. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.11)
- No address to forward email to an agent is built because neither ChatGPT nor Claude offers one. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:164-168)
- Event data is treated as data, never instructions. (source: apps/web/lib/triggers/trigger-fire.ts:59-75)
- Only repository members may start a GitHub review or task. (source: apps/web/app/api/github/webhook/route.ts:46-56, 228)

**Acceptance criteria**

1. With connectors released and Gmail connected, creating a Gmail trigger on a schedule succeeds and a new email creates one run in that schedule's history.
2. While connectors are coming soon, the Gmail option is unavailable in the panel and POST /api/triggers for gmail is refused.
3. A comment '@agi-workforce' alone on a pull request by a MEMBER queues a review; by a non-member nothing is queued.
4. A comment with task text on an issue by a MEMBER leads to a reply with a session link when managed Code is on, and to the 'cannot take coding tasks' reply when it is off.
5. A duplicate webhook delivery with the same delivery id is acknowledged without a second run.
6. A comment from the bot's own login or any Bot sender is ignored.
7. A mention on a pull request from a fork gets the 'branch lives in a fork' reply.
8. A comment on an installation with pr_review_enabled false produces no reply (record as current behaviour; a gap).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A user whose coding task is silently dropped should be told why [inferred from the fail-closed reply for other refusals].
- Gmail intake should include the thread, not only the snippet, to meet 'reads the thread' [inferred from S110.10 wording].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reply on GitHub when the installation has the task feature switched off, instead of staying silent.
- [proposed] Fetch the full thread for Gmail runs when the connector scope allows.
- [proposed] Show the trigger's delivery statuses in the panel for failed deliveries.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | ScheduleTriggersPanel | `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx` | Choose source, address and events for a trigger; disables unreleased sources (lines 55-100, 488). |
| endpoint | POST /api/triggers | `apps/web/app/api/triggers/route.ts` | Creates a trigger and starts the Gmail watch (line 101). |
| service | trigger-service | `apps/web/lib/triggers/trigger-service.ts` | Validates and creates triggers; refuses unreleased sources (line 302). |
| config | trigger-types | `apps/web/lib/triggers/trigger-types.ts` | Trigger sources, connector-backed set and triggerSourceAvailable (lines 22-32). |
| config | connector-release | `packages/contracts/types/src/connector-release.ts` | CONNECTOR_RELEASE_STATE constant, coming_soon (line 14). |
| service | gmail-watch | `apps/web/lib/triggers/gmail-watch.ts` | Starts and reads Gmail watches; ingests events (lines 23, 53-59, 414-440). |
| endpoint | POST /api/webhooks/gmail | `apps/web/app/api/webhooks/gmail/route.ts` | Pub/Sub push receiver with identity check (line 49). |
| job | fireEventTriggerJob | `apps/web/lib/triggers/trigger-fire.ts` | Runs the schedule for an event with event data wrapped as data (lines 59-195). |
| endpoint | POST /api/github/webhook | `apps/web/app/api/github/webhook/route.ts` | GitHub App webhook: signature, dedupe, mention routing (lines 63-266). |
| service | cloud-code-github-task | `apps/web/lib/services/cloud-code-github-task.ts` | Parses mentions and runs the coding task with GitHub replies (lines 44-345). |
| service | webhook-router and delivery-dedup | `apps/web/app/api/github/webhook/webhook-router.ts` | Routes GitHub event kinds; delivery-dedup.ts records each delivery once. |
| service | cloud-code-session-open | `apps/web/lib/services/cloud-code-session-open.ts` | Switches and gates that open managed Code sessions (lines 44-52). |
| config | E2B gate | `apps/web/lib/e2b/gate.ts` | e2bProvisioningReady (line 20). |
| table | event_triggers | `apps/web/db/neon` | Trigger definitions; created with 'create table if not exists public.event_triggers' (file not recorded). |
| table | github_installations | `apps/web/db/neon/0017_github.sql` | GitHub installations with user_id, pr_review_enabled and ownership_verified_at. |
| table | github_webhook_deliveries | `apps/web/db/neon` | Delivery ids for dedupe (create statement found by search; file not recorded). |
| command | agi schedules triggers add | `apps/cli/src/lib.rs` | CLI to add Gmail, GitHub, Slack, Calendar or webhook triggers (lines 1650-1700). |
| test | gmail-watch and trigger tests | `apps/web/lib/triggers/__tests__/gmail-watch.ingest.test.ts` | Covers Gmail ingest. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Gmail sends a mailbox-changed notice to Google Pub/Sub, which pushes it to POST /api/webhooks/gmail with a signed token. | outside service | apps/web/app/api/webhooks/gmail/route.ts:33-50 |
| The server verifies the token against the configured audience and service account, decodes the notice (mailbox and history id only). | our servers | webhooks/gmail/route.ts:53-80 |
| For each trigger on that mailbox, the server lists new inbox messages through the owner's Gmail grant (metadata and snippet) and ingests one event each. | our servers | gmail-watch.ts:414-440 |
| A background job loads the trigger, creates a schedule run, appends the event block to the prompt and runs the scheduled-agent executor. | our servers | trigger-fire.ts:85-160 |
| The agent works with the model route set for the schedule; the result lands in run history and the delivery is settled. | our servers | trigger-fire.ts:160-195 |
| GitHub sends a webhook; the server verifies x-hub-signature-256, records the delivery id once, and routes the comment event. | our servers | github/webhook/route.ts:70-130 |
| The server checks sender and commenter standing, then runs a review or a coding task in the background (after()), calling GitHub's API with an installation token. | our servers | route.ts:213-266; cloud-code-github-task.ts:209-250 |
| A cloud coding session runs in a managed sandbox; the final changes are committed, pushed and a pull request is opened; the bot comments the result. | outside service | cloud-code-github-task.ts:289-345 (sandbox provider referenced by the E2B gate, apps/web/lib/e2b/gate.ts) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Trigger definition and delivery rows | tables event_triggers and trigger delivery rows on our servers | Server only | Until the trigger or schedule is deleted; retention of deliveries not opened |
| Gmail message metadata and snippet inside the event | Job payload and run prompt on our servers (capped by MAX_EVENT_BLOCK_CHARS, trigger-fire.ts:59-75) | No | Not established |
| GitHub delivery id | table github_webhook_deliveries | Server only | Not established |
| Cloud code session, turns, steps, approvals | tables such as cloud_code_agent_turns, cloud_code_agent_steps, cloud_code_agent_approvals | Visible in the Code area | Session lifecycle rules not opened |

**Models and providers.** The run uses the model route attached to the schedule or, for coding tasks, resolveCloudCodeAgentModel(null, planTier) chosen from the account's plan (cloud-code-github-task.ts:303-312). No model is hardcoded in the files read. The pull-request review path uses the installation's review_model setting (route.ts InstallationRow interface).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The installing account owns GitHub-triggered work (installation user_id); Gmail trigger owner must be signed in and have Gmail connected. |
| Permissions | GitHub: commenter must be OWNER, MEMBER or COLLABORATOR (route.ts:51-56, 228). Code gate: assertWorkspaceCodeAccess for act open_cloud_session (cloud-code-github-task.ts:227-234). |
| Subscription | A plan that includes AGI Code is required for the coding task, otherwise the reply says the installing account has no plan that includes managed Code sessions (cloud-code-github-task.ts:236-239, 62-63). Scheduled-task counts per plan apply to the schedules that hold triggers [inferred]. |
| Limits and metering | Reviews capped per installation per 30 days by GITHUB_PR_REVIEW_MONTHLY_CAP default 100 (route.ts:59-62); task text capped at 1,000 characters (cloud-code-github-task.ts:51); compute metered as managed sandbox compute (brief note on compute-metering). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_MANAGED_COMPUTE_PRIVATE_BETA (off only when 0, false or off), GMAIL_PUBSUB_* env, CONNECTOR_RELEASE_STATE constant. |
| Model compatibility | Not model dependent at the trigger layer; the agent needs tool use for coding tasks [inferred]. |
| Provider restrictions | Gmail requires the Google connector; GitHub requires the GitHub App. Model providers: none named in this path. |
| Local mode | Not applicable: both paths run on our servers and need an account. Nothing here runs on device. A Local-mode user receives no email or GitHub triggers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connectors coming soon | Gmail source is unavailable; creating it throws a coming-soon error. | trigger-service.ts:302; connector-release.ts:14 |
| Gmail not set up on the server | Push route answers 503; saving a trigger says 'Gmail triggers are not set up on this server yet.' | webhooks/gmail/route.ts:57-63; gmail-watch.ts:53 |
| Gmail not connected or expired | Messages 'Connect Gmail in Connectors, then try again.' or 'Reconnect Gmail in Connectors, then try again.' | gmail-watch.ts:54-55 |
| Gmail read fails transiently | Ingest returns retry true so the push is retried. | gmail-watch.ts:419-422 |
| Trigger disabled or deleted before run | Delivery marked filtered with a detail and the job skips. | trigger-fire.ts:96-101 |
| Run waiting for approval | Delivery marked fired with 'The run is waiting for your approval'. | trigger-fire.ts:178-186 |
| Run fails on final attempt | Delivery marked dead; earlier attempts failed and the job throws to retry. | trigger-fire.ts:190-196 |
| Duplicate GitHub delivery | Acknowledged without reprocessing. | route.ts:113-128 |
| GitHub processing error | Delivery released and HTTP 500 with Retry-After 10. | route.ts:170-178 |
| Pull request from a fork | Reply that the branch lives in a fork. | cloud-code-github-task.ts:63-64, 258-262 |
| Agent pauses for approval or stops | Bot comments a pause or stop message with the session link. | cloud-code-github-task.ts:304-318 |
| Installation with review feature off | Coding task returns with no reply (silent). | cloud-code-github-task.ts:191-211 |
| Offline, accessibility, app differences | not handled in the code reviewed: all paths are server side; accessibility of the triggers panel was not reviewed. | not applicable |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/triggers/__tests__/gmail-watch.ingest.test.ts`: Gmail message ingest.
- `apps/web/lib/triggers/__tests__/gmail-watch.unreachable.test.ts`: Gmail unreachable handling.
- `apps/web/lib/triggers/__tests__/trigger-fire.test.ts`: Triggered run behaviour.
- `apps/web/lib/triggers/__tests__/trigger-service.test.ts`: Trigger creation rules.
- `apps/web/app/api/webhooks/gmail/route.test.ts`: Gmail push route.
- `apps/web/app/api/github/webhook/github-events.test.ts`: GitHub event handling.
- `apps/web/app/api/github/webhook/webhook-router.test.ts`: Event routing.
- `apps/web/app/api/github/webhook/delivery-dedup.test.ts`: Delivery dedupe.
- `apps/web/features/schedules/components/ScheduleTriggersPanel.test.tsx`: Triggers panel.

**Test scenarios**

- **Gmail option while connectors are coming soon**
  1. Open Schedules > triggers panel.
  2. Select Gmail.
  3. Try POST /api/triggers with source gmail.
  - Expected: The option is unavailable and the API refuses with a coming-soon error.
- **Member mention starts a review**
  1. On a test repository with the App installed and reviews enabled, a MEMBER comments '@agi-workforce' on a pull request.
  - Expected: Webhook returns review queued and a review is posted.
- **Outsider mention is ignored**
  1. A non-member comments the mention.
  - Expected: HTTP 200 received with no review or session.
- **Coding task with sandbox off**
  1. Run with managed Code off.
  2. A member comments '@agi-workforce fix the typo' on an issue.
  - Expected: The bot replies that managed Code sessions are not available on this deployment.
- **Duplicate delivery**
  1. Replay the same x-github-delivery id.
  - Expected: Second response has duplicate true and no new run.
- **Installation with review off**
  1. Set pr_review_enabled false in a test database.
  2. Comment a task.
  - Expected: No reply (current behaviour, a gap).

**Where to look when it fails**

- Logs: 'GitHub webhook signature verification failed', 'GitHub automation event could not be ingested', '[code-task] GitHub coding task failed', 'Gmail push identity rejected' (route.ts, cloud-code-github-task.ts, webhooks/gmail/route.ts).
- Tables: event_triggers, github_installations, github_webhook_deliveries, cloud_code_agent_turns.
- Run history of the schedule and the delivery status text.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- CLI: [70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **Gmail triggers are gated off while connectors are coming soon.** Affects: Web, desktop, CLI. Evidence: connector-release.ts:14; trigger-service.ts:302. Work needed: Release connectors or release Gmail selectively, then run a live check; update the brief.
- **Email is not read as a thread, and no forward or addressed intake exists.** Affects: All apps. Evidence: gmail-watch.ts:414, 430; docs/decisions/2026-09-27-founder-decisions.md:164-168. Work needed: Fetch the thread for each run; the forward address stays out by decision.
- **A GitHub coding task is silently dropped when pr_review_enabled is false.** Affects: GitHub users. Evidence: cloud-code-github-task.ts:191-211. Work needed: Reply with the reason or use a separate setting for tasks.
- **No intake on mobile, Chrome or VS Code.** Affects: Mobile, Chrome, VS Code. Evidence: Brief S110.10 and S110.11 statuses. Work needed: Decide per app; VS Code defers to the CLI per the brief.
- **Team channel mentions other than GitHub (for example a chat tool) not found.** Affects: All. Evidence: Only github/webhook/route.ts opened. Work needed: Confirm whether Slack mention intake exists (the Slack source exists for triggers); otherwise build or drop.
- Not built on: Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-api-and-contracts
- table:event_triggers
- table:github_installations
- api:POST /api/github/webhook
- api:POST /api/webhooks/gmail
- api:POST /api/triggers
- F110-09
- F110-11

## Unknown

- Whether any chat tool other than GitHub can mention the assistant into a coding session.
- Retention of Gmail snippets and trigger deliveries.
- Whether the review path (runAutomatedReview) has its own switches beyond pr_review_enabled and the monthly cap (not opened).
- Exact migration file names for event_triggers and github_webhook_deliveries.
- How the desktop app exposes the triggers panel (assumed the hosted web app).
- Whether the CLI trigger commands are exercised by tests (not searched).
