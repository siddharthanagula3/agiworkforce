---
id: "F063-05"
type: "feature"
title: "Event triggers and webhooks"
aliases: ["Event triggers", "Triggers panel", "Add trigger", "Anything else (signed webhook)", "Webhook trigger", "Triggers (mobile)", "agi schedules triggers", "API trigger", "POST /api/schedules/{id}/runs", "S63.15 S63.16 S63.17 S63.18"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S63.15", "S63.16", "S63.17", "S63.18"]
depends_on: ["F063-02", "F063-06", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "table:event_triggers", "table:event_trigger_events", "table:scheduled_tasks", "api:POST /api/triggers", "api:POST /api/webhooks/connectors/{triggerId}", "api:POST /api/schedules/{id}/runs", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-05 Event triggers and webhooks

Starts a routine when something happens: a GitHub event, a Slack message, a new Gmail email, a Calendar change, or a signed POST to a URL the trigger owns. Filters and a repeat wait narrow events. Gmail and Calendar are switched off while connectors are coming soon. A documented API call can also start a run. The CLI daemon is separate.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.15](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6315), [S63.16](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6316), [S63.17](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6317), [S63.18](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6318).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Matches an incoming event to the owner's enabled triggers, filters it, queues a background job, and the job starts a run of the routine with the event attached as untrusted data (apps/web/lib/triggers/trigger-ingest.ts:361; apps/web/lib/triggers/trigger-fire.ts:85).

**Why it exists.** Some work should start when something changes, not on a clock. Event triggers sit beside timing on the same routine.

**Who uses it.** People who connect GitHub or Slack, or who can send a signed HTTP request from their own tools.

**Problems it solves**

- Polling a clock for something that is event-driven
- Running on every noisy event (conditions and repeat wait)
- Spoofed events (signature, owner must hold the account)

**Use cases**

- Review each new pull request
- Summarise a Slack channel message that matches a keyword
- Run when the person's own script posts a signed event
- Start a routine from a script by calling the runs endpoint

## 2. User experience

**Where to find it**

- Web and public Electron Desktop: expand 'Run History' on a routine card; the 'Triggers for <name>' panel sits inside it with 'Add trigger' (ScheduleCard.tsx:520-543; ScheduleTriggersPanel.tsx:384-397).
- Tauri desktop: button 'Triggers' on a routine row, panel with 'Add trigger' (DesktopCloudSchedules.tsx:1266-1274; DesktopScheduleTriggersPanel.tsx:266).
- Mobile: edit a routine, then 'Triggers' (accessibility label 'Event triggers for this schedule'); screen 'Triggers for <name>' (create.tsx:315-330; ScheduleTriggersScreen.tsx:344).
- CLI: agi schedules triggers list|add|pause|resume|watch|remove (lib.rs:1636-1700).
- Chrome and VS Code: none found.

**Before you start**

- A saved routine (a trigger belongs to one routine)
- Account held at the source: GitHub repo reached through the linked installation; Slack workspace installed or linked
- Server key for signed webhooks configured (environment variable EVENT_TRIGGER_SIGNING_SECRET)
- Workspace policy 'event_triggers' on

**Screens and controls**

- Source choices: GitHub (Repository owner/name), Slack (Workspace (team) id), Gmail (Mailbox address), Google Calendar, 'Anything else (signed webhook)' (packages/contracts/cloud-contracts/src/trigger-sources.ts:25-65)
- Event types, field conditions (up to 10), 'Ignore repeats for (seconds)' on web; 'Wait before running (seconds)' on mobile
- Buttons: 'Add trigger', 'Regenerate secret' (webhook only, web), 'Register watch' or 'Register mailbox watch', 'Save conditions', 'Delete trigger', 'Turned on' switch (mobile)
- One-time reveal box with signing secret and a sample curl command (web) or webhook URL and secret with Copy and Share (mobile)

**Journey**

1. Open the routine's triggers
2. Press Add trigger and pick a source
3. Fill account and event types; add conditions and a repeat wait if wanted
4. Save
5. Copy the webhook URL and signing secret now (shown once), or post the Slack verification code in the workspace
6. Send an event; the delivery list records its outcome and a run starts

**What the person sees and gets**

- Secrets shown once; regenerate confirms first, naming that current senders stop working (ScheduleTriggersPanel.test.tsx:88)
- Row text 'Waiting until this account is verified; nothing fires until then.' (ScheduleTriggersPanel.tsx:598)
- Delivery outcomes: filtered, debounced, enqueued, duplicate, failed, fired, dead (trigger-ingest.ts:190, 285)
- Notification when the hourly or daily event-run cap is hit (trigger-ingest.ts:262-283)
- Webhook sender responses: 200 with matched and queued counts; 401, 400, 413, 503 on failure (route.ts:44-130)

**Settings**

- Debounce 0 to 86,400 s; attempts 1 to 10 (default 5); 1 to 20 event types (trigger-service.ts:193-224)
- At most 50 triggers per account (trigger-service.ts:26, 303-312)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/triggers: rate limit, CSRF, workspace 'event_triggers' gate, validate, create, audit event, start Gmail watch, return trigger, one-time verification code and signing secret (apps/web/app/api/triggers/route.ts:66-110).
- Slack: trigger starts 'pending'; posting the code in the workspace verifies it, and the next event runs (trigger-ingest.ts:339-359, 374-390). GitHub and webhook triggers are verified at creation (trigger-service.ts:317-318).
- Owner must hold the GitHub installation repository or the Slack workspace, checked at create and again in the match SQL (trigger-service.ts:278-295; trigger-ingest.ts:63-110).
- Signed webhook: POST /api/webhooks/connectors/{triggerId}; 128 KB limit; headers x-agi-timestamp and x-agi-signature; HMAC-SHA256 over 'timestamp.body' with a per-trigger secret derived from the server key, the trigger id and a rotating salt; 5-minute window; 401 on bad signature, 503 if the key is unset or salt unreadable (route.ts:22-100; trigger-signatures.ts:11, 47-85).
- Body must be a JSON object with string id (delivery id) and type (route.ts:86-101).
- Up to 20 triggers per event; event data cut at 16,384 bytes (trigger-ingest.ts:26-27, 44-45).
- Duplicate deliveries recorded once; a redelivery may reclaim an unqueued receipt (trigger-ingest.ts:156-189).
- Conditions and debounce filter; each outcome recorded (trigger-ingest.ts:405-420).
- Event-run caps 30 per hour and 720 per day per user, then 'debounced' with a notification (trigger-ingest.ts:233-283; billing-catalog.ts:480-482).
- Job 'event-triggers.fire' starts the run with the event appended inside a fenced block marked untrusted, cut at 4,000 characters; a paused or deleted trigger marks the delivery filtered (trigger-fire.ts:59-118).
- Job queue: up to 4 concurrent, lease 60 s so a triggered run is limited to 45 s, up to 10 attempts (job-queues.ts:73-80; trigger-fire.ts:23).
- Regenerate signing secret route and watch route exist (apps/web/app/api/triggers/[triggerId]/signing-secret/route.ts:61; watch/route.ts:62).
- API trigger: POST /api/schedules/{id}/runs with required Idempotency-Key, answers when the run finishes, pauses, or after 40 s; repeats return the same run, or 409 while still running (apps/web/app/api/schedules/[id]/runs/route.ts:65-103; openapi.json 'Start a scheduled task run').
- CLI has a local daemon with cron, webhook and file-watcher triggers on this machine, webhook on loopback port 7891 by default (apps/cli/src/daemon.rs:1-10, 1163-1223; apps/cli/src/features/hooks/hooks.rs:581-614).

**Incomplete**

- Mobile triggers screen exists and is reachable only from Edit schedule; it has no 'Regenerate secret' (apps/mobile/src/features/schedules/triggersService.ts has no rotate call).
- Tauri trigger panel has no 'Regenerate secret' (no match in DesktopScheduleTriggersPanel.tsx).
- API runs are recorded with trigger source 'manual'; the contract enum also has 'api', but no write of it was found (schedule-service.ts:1495-1500, 358).
- OpenAPI says the endpoint takes a session bearer token; API keys are rejected where only that scheme is listed (openapi.json BearerAuth description).

**Present but disconnected or switched off**

- Gmail and Google Calendar triggers: createTrigger refuses them while connectors are 'coming soon' (trigger-service.ts:302; trigger-types.ts:24-33; connector-release.ts:14). The web panel shows them as coming soon (ScheduleConnectorGates.test.tsx:41).
- Event cadence: routine type 'event' has no clock time; day-parts and watch conditions are refused for it (schedule-service.ts:760-770).

**Not available**

- Chrome and VS Code triggers.
- Per-trigger delivery history screen on mobile and Tauri: web/mobile call /events (triggersService.ts:56-61); a screen listing deliveries was not confirmed.

## 4. Required behaviour

**Established requirements**

- A routine can run when an external event happens (GitHub, Slack, Gmail, Calendar, webhook). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.15)
- Event triggers can be narrowed by event types, account, field conditions and repeat suppression. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.16)
- A routine gets a webhook URL with a secret; a signed POST starts a run. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.17)
- A documented, token-authenticated API call starts a routine run. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.18)
- Event triggers are a beta feature present on web and desktop, absent on mobile, VS Code and Chrome (matrix may be stale). (source: doc: docs/product/surface-feature-matrix.md:108)
- An event reaches a trigger only when its owner holds the source account; at most 20 triggers per event; 30 runs an hour and 720 a day. (source: apps/web/lib/triggers/trigger-ingest.ts:26, 63-110; packages/contracts/types/src/billing-catalog.ts:480-482)
- External event content is data, never instructions. (source: apps/web/lib/triggers/trigger-fire.ts:59-78)

**Acceptance criteria**

1. POST to the webhook URL with a valid signature and an id and type returns 200 with matched and queued counts
2. Wrong signature or a timestamp older than 5 minutes returns 401
3. Body over 128 KB returns 413
4. Same delivery id sent twice queues one run
5. An event failing a condition is recorded as filtered and starts no run
6. The 31st event run within an hour is recorded debounced and starts no run
7. Deleting the routine's trigger before the job starts marks the delivery filtered
8. Regenerating a secret makes the old one fail and the new one work

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should be able to regenerate a webhook secret like web [inferred].
- The matrix entry saying mobile is absent is stale [inferred from ScheduleTriggersScreen.tsx].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make API-started runs record trigger source 'api'.
- [proposed] Show a delivery history with outcomes on mobile and Tauri.
- [proposed] Add the CLI daemon triggers to the cloud trigger documentation to avoid confusion.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST/GET /api/triggers | `apps/web/app/api/triggers/route.ts` | Create and list triggers |
| endpoint | GET/PATCH/DELETE /api/triggers/{triggerId} | `apps/web/app/api/triggers/[triggerId]/route.ts` | Read, update, delete |
| endpoint | POST /api/triggers/{triggerId}/signing-secret | `apps/web/app/api/triggers/[triggerId]/signing-secret/route.ts` | Rotate webhook secret |
| endpoint | POST /api/triggers/{triggerId}/watch | `apps/web/app/api/triggers/[triggerId]/watch/route.ts` | Register mailbox watch |
| endpoint | GET /api/triggers/{triggerId}/events | `apps/web/app/api/triggers/[triggerId]/events/route.ts` | Delivery history |
| endpoint | POST /api/webhooks/connectors/{triggerId} | `apps/web/app/api/webhooks/connectors/[triggerId]/route.ts` | Signed webhook receiver |
| endpoint | POST /api/webhooks/slack | `apps/web/app/api/webhooks/slack/route.ts` | Slack events into ingest |
| endpoint | POST /api/github/webhook | `apps/web/app/api/github/webhook/route.ts` | GitHub events into ingest |
| endpoint | POST /api/webhooks/google-calendar | `apps/web/app/api/webhooks/google-calendar/route.ts` | Calendar notifications into ingest |
| service | ingestTriggerEvent | `apps/web/lib/triggers/trigger-ingest.ts` | Match, verify, filter, debounce, cap, enqueue (line 361) |
| job | fireEventTriggerJob | `apps/web/lib/triggers/trigger-fire.ts` | Job 'event-triggers.fire' that starts the run (line 85) |
| service | createTrigger, validateTriggerInput, regenerateConnectorTriggerSecret | `apps/web/lib/triggers/trigger-service.ts` | Create, validate, rotate (lines 193, 296, 413) |
| service | trigger-signatures | `apps/web/lib/triggers/trigger-signatures.ts` | HMAC verification and secret derivation |
| service | gmail-watch | `apps/web/lib/triggers/gmail-watch.ts` | Gmail watch start and ingest |
| service | createEventTriggeredScheduleRun | `apps/web/lib/services/schedule-service.ts` | Idempotent run for an event (line 1503) |
| endpoint | POST /api/schedules/{id}/runs | `apps/web/app/api/schedules/[id]/runs/route.ts` | API-started run |
| table | event_triggers and event_trigger_events | `apps/web/db/neon/0210_event_triggers.sql` | Triggers and delivery records (lines 38, 81) |
| component | ScheduleTriggersPanel, TriggerConditionsEditor | `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx` | Web UI |
| component | DesktopScheduleTriggersPanel | `apps/desktop/src/features/schedules/DesktopScheduleTriggersPanel.tsx` | Tauri UI |
| screen | ScheduleTriggersScreen | `apps/mobile/src/features/schedules/ScheduleTriggersScreen.tsx` | Mobile UI |
| command | agi schedules triggers | `apps/cli/src/schedules/triggers.rs` | CLI client of /api/triggers |
| service | daemon (local triggers) | `apps/cli/src/daemon.rs` | CLI daemon cron, webhook, file-watcher on this machine |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| An outside system (GitHub, Slack, Google, or the person's own script) sends an event. | outside service | route.ts:44-100; webhooks/slack/route.ts:129 |
| Server verifies the signature or source, finds enabled triggers whose owner holds the account (up to 20), records a delivery. | our servers | trigger-ingest.ts:63-189, 361-380 |
| Unverified Slack triggers only verify; conditions filter; in one transaction the user's event-run cap and the debounce are checked and a background job is enqueued. | our servers | trigger-ingest.ts:285-332, 380-425 |
| The job worker loads the trigger and routine, creates a run keyed to the event, and runs the agent with the event block appended to the prompt. | our servers | trigger-fire.ts:85-150; schedule-service.ts:1503 |
| The model call and tools run at an outside provider; run and delivery outcomes are saved. | outside service | trigger-fire.ts:150-181; scheduled-agent-executor.ts:1056 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Trigger definition and verification state | table event_triggers | Server record read by web, Tauri, mobile, CLI | Deleted with the routine or the account (on delete cascade, 0210_event_triggers.sql:40-42) |
| Delivery record with outcome, job id, run id | table event_trigger_events | Server only | Cascades with the trigger; background job rows kept 14 days after finishing (job-queues.ts:79) |
| Signing secret | Derived on demand from the server key, trigger id and stored salt; not stored in plain | Shown once to the creator | Rotated by regenerate |
| Event payload attached to the job | background job payload, cut to 16,384 bytes | Server only | Per job retention |

**Models and providers.** The same server routing as any scheduled run (F063-03). Events from Google data force a route that keeps inputs out of training, otherwise the run does not start (trigger-fire.ts:130-133; executor:719-722).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account to create triggers; the webhook sender needs only the signed URL. |
| Permissions | Workspace policy 'event_triggers' on create (triggers/route.ts:74-80); owner must hold GitHub or Slack account; owner must be an allowed account and active member at fire time (trigger-ingest.ts:63-110); CSRF on mutations. |
| Subscription | Needs an existing routine, so the plan must allow scheduled tasks (F063-02). No separate plan entitlement for triggers was found. Platform caps: 30 event runs an hour, 720 a day, 50 triggers per account. |
| Limits and metering | Each triggered run reserves usage like any run (executor:1056). Credit cap on the routine applies (schedule-service.ts:1558). |
| Feature flags | CONNECTOR_RELEASE_STATE coming_soon blocks Gmail and Calendar; environment variables EVENT_TRIGGER_SIGNING_SECRET, SLACK_SIGNING_SECRET, GMAIL_PUBSUB_AUDIENCE, GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL, GOOGLE_CALENDAR_CHANNEL_SECRET (names only; trigger-signatures.ts:6-10). |
| Model compatibility | As F063-03. |
| Provider restrictions | none found in the code beyond the training rule. |
| Local mode | Cloud triggers are unavailable in Local mode on mobile, CLI and Tauri. The CLI daemon runs cron, webhook and file-watcher triggers on this machine with the CLI's own config and does not use the cloud tables (apps/cli/src/daemon.rs:1-10); whether it is limited to Local mode was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signing key not set | 503 and an error log; no event accepted | route.ts:73-80; route.test.ts:80 |
| Bad or old signature | 401 | route.ts:82; route.test.ts:88 |
| Trigger id not a uuid | 400 before reading the body | route.ts:39-42; route.test.ts:110 |
| Event could not be queued | 503 with Retry-After 10 so the sender redelivers | route.ts:115-121; route.test.ts:134 |
| Slack trigger not yet verified | Events only verify; recorded as filtered 'Waiting for ownership of this account to be verified' | trigger-ingest.ts:380-395 |
| Direct message to the Slack app | May carry the code but is never delivered to a trigger | trigger-ingest.ts:334-338 |
| Owner left the workspace | Event fires nothing; a warning logs why | trigger-ingest.ts:122-148 |
| Routine paused, expired, at run limit or credit cap | Delivery marked filtered with the reason, no retry | trigger-fire.ts:107-118 |
| Triggered run fails | Job retried; last attempt marked dead | trigger-fire.ts:171-181; trigger-fire.test.ts:226 |
| Gmail watch failed or lapsed | Row shows notice; 'Register watch' button; CLI 'triggers watch' | schedules/triggers.rs:267-295; mobile 'Register mailbox watch' |
| Offline in the app | not handled in the code beyond request errors | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/webhooks/connectors/[triggerId]/route.test.ts`: Refuses when key unset, wrong-trigger signature, missing id/type, non-uuid id, routes signed event, redelivery on queue failure, original secret accepted, old secret rejected after rotation, unreadable salt, unknown trigger
- `apps/web/lib/triggers/__tests__/trigger-ingest.test.ts`: Match only enabled triggers on held installation, one job per trigger, redelivery once, receipt reclaim, condition filter, debounce, unverified account, Slack code verification, GitHub and Slack ownership, DM code, queue failure recorded
- `apps/web/lib/triggers/__tests__/trigger-fire.test.ts`: Untrusted event fence, run with event attached, Google routing, skip on deleted trigger, skip when task refuses, retry then dead, malformed payload
- `apps/web/lib/triggers/__tests__/trigger-ingest.membership.test.ts`: Owner membership rules (case titles not read)
- `apps/web/lib/triggers/__tests__/trigger-service.test.ts`: Trigger validation and creation (case titles not read)
- `apps/web/app/api/triggers/route.test.ts`: List, CSRF required, workspace policy off, create with audit and one-time secret, validation error
- `apps/web/features/schedules/components/ScheduleTriggersPanel.test.tsx`: Regenerate only on webhook triggers, confirm first, rotate with CSRF and show new secret once
- `apps/web/features/schedules/components/ScheduleConnectorGates.test.tsx`: Gmail and Calendar triggers shown only as coming soon
- `apps/mobile/src/features/schedules/__tests__/ScheduleTriggersScreen.test.tsx`: List with filter and switch off, add signed webhook trigger with filter and one-time secret, copy and share, empty condition refused, delete after naming what stops
- `apps/web/__tests__/api/schedule-runs.test.ts`: Idempotency key required and validated, replay, in-progress conflict (API trigger)
- `apps/web/db/neon/event-triggers-migration.test.ts`: Trigger tables migration (title not read)
- `apps/cli/src/schedules/triggers.rs`: 14 inline Rust tests (names not read)

**Test scenarios**

- **Signed webhook happy path**
  1. Create a 'Anything else (signed webhook)' trigger and copy URL and secret
  2. Compute sha256 HMAC of '<timestamp>.<body>'
  3. POST with x-agi-timestamp and x-agi-signature and body {id,type,data}
  - Expected: 200 received true, matched 1, queued 1; a run with trigger source webhook appears in history
- **Replay and tamper**
  1. Re-send the same body
  2. Change one body byte and re-send with the old signature
  - Expected: First: matched 1, queued 0 (duplicate). Second: 401
- **Rotate secret**
  1. Press Regenerate secret and confirm
  2. Send with the old secret
  3. Send with the new one
  - Expected: Old 401, new 200
- **Hourly cap**
  1. Fire 31 accepted events within an hour on one account
  - Expected: 31st delivery debounced, notification 'Event-triggered tasks reached the hourly limit', no run
- **Gmail refused**
  1. POST /api/triggers with source gmail
  - Expected: Refused as connectors coming soon
- **API run**
  1. POST /api/schedules/{id}/runs twice with the same Idempotency-Key
  - Expected: First 201 with run; second 200 replay true (or 409 while running)

**Where to look when it fails**

- event_trigger_events.outcome and detail
- Log 'Connector event signature rejected'
- Log 'Event trigger held back'
- background_jobs rows kind 'event-triggers.fire'
- scheduled_task_runs.trigger_source

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- CLI: [70-qa/test-plans/cli/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/cli/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **Brief says mobile has no triggers; code has a screen** Affects: Brief and matrix accuracy. Evidence: apps/mobile/src/features/schedules/ScheduleTriggersScreen.tsx; docs/product/surface-feature-matrix.md:108 says absent. Work needed: Correct brief S63.15-S63.17 and the matrix
- **Gmail and Calendar triggers off while connectors are coming soon** Affects: All apps. Evidence: trigger-service.ts:302. Work needed: Follows the connector release
- **API runs recorded as manual, not api** Affects: Run history readers. Evidence: schedule-service.ts:1495-1500; contract enum schedules.ts:248. Work needed: Pass a trigger source for API callers or drop the unused value
- **No regenerate secret on mobile and Tauri** Affects: Mobile, Tauri users. Evidence: triggersService.ts; DesktopScheduleTriggersPanel.tsx. Work needed: Add the control
- **API keys rejected on run endpoint; documentation says token-authenticated** Affects: Developers using API keys. Evidence: openapi.json BearerAuth description. Work needed: Decide whether API keys may start runs
- **CLI daemon triggers and cloud triggers are two systems under one name** Affects: CLI users. Evidence: daemon.rs:1-10 versus schedules/triggers.rs:1-13. Work needed: Document the difference
- **Brief cites desktop config.ts and product-routes.ts for filters; they hold route lists** Affects: Brief accuracy. Evidence: apps/desktop/electron/config.ts:39-47. Work needed: Replace citations
- **Chrome and VS Code have no triggers** Affects: Those users. Evidence: Matrix lines 572-580. Work needed: Product decision
- Not built on: Chrome (from the capability ledger).

**Depends on**

- F063-02
- F063-06
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- table:event_triggers
- table:event_trigger_events
- table:scheduled_tasks
- api:POST /api/triggers
- api:POST /api/webhooks/connectors/{triggerId}
- api:POST /api/schedules/{id}/runs
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-agents-tools-and-automation

## Unknown

- Whether a delivery-history screen exists on mobile or Tauri: the /events endpoint is called by the mobile service, a screen was not confirmed.
- Whether the CLI daemon is limited to Local mode.
- Whether the Slack and GitHub receivers verify their own signatures with the same helpers: their route files were not read.
- Retention of event_trigger_events rows.
- Case names of trigger-service.test.ts, trigger-ingest.membership.test.ts and the 14 Rust tests in triggers.rs.
