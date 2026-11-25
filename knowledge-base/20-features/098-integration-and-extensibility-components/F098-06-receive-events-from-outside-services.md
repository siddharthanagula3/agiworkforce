---
id: "F098-06"
type: "feature"
title: "Receive events from outside services"
aliases: ["Webhook receiver", "Connector triggers", "Signed webhook", "GitHub webhook", "Event trigger endpoint", "Anything else (signed webhook)"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.09"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "surface:web", "mode:cloud", "table:event_triggers", "table:github_pr_review_attempts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-06 Receive events from outside services

Accepts signed events from outside services and turns them into work. A generic connector endpoint checks a per-trigger signature. A separate GitHub endpoint checks GitHub's signature, ignores duplicate deliveries, and can start an automatic pull request review. Slack, Gmail and Calendar have their own receivers.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.09](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9809).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** POST /api/webhooks/connectors/{triggerId} verifies an x-agi-signature over the timestamp and body, then queues the event for the trigger that owns that secret. POST /api/github/webhook verifies x-hub-signature-256, records the delivery id once, and routes events to event triggers, an automatic review, or a mention-driven task.

**Why it exists.** Lets outside systems start automations without polling, and lets the GitHub App review pull requests (S98.09).

**Who uses it.** People who create an event trigger (web: Schedules, Triggers panel) and owners who install the GitHub App.

**Problems it solves**

- Polling delays.
- Forged requests: bad signatures get 401.
- Repeat deliveries: duplicates are acknowledged without reprocessing (GitHub).

**Use cases**

- A build system posts a signed event that starts an agent task.
- GitHub sends a pull request opened event and a review is queued.
- A teammate mentions the bot in a comment and a task runs.
- Rotate a trigger's secret after a leak.

## 2. User experience

**Where to find it**

- Web: Schedules, Triggers panel; source choice 'Anything else (signed webhook)' with the note 'You get a URL and a signing secret to post events to.'; source label 'Webhook' (apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:88-103).
- Web: regenerate action titled 'Regenerate the signing secret for <name>?' with 'Signing secret: ...' shown once (ScheduleTriggersPanel.tsx:308, 414-419).
- Developer webhooks panel (outgoing, separate): features/developers/components/WebhooksPanel.tsx (not this feature).
- GitHub: installed through the GitHub App; webhook URL is set on the App by the owner.
- Mobile, CLI, VS Code, Chrome, Desktop: server only; the brief and code show no receiver on devices.

**Before you start**

- Signed-in person who owns the trigger (signing-secret route).
- EVENT_TRIGGER_SIGNING_SECRET set on the deployment (connector route returns 503 'Connector events are not configured' otherwise) (trigger-signatures.ts:5, route.ts:75-80).
- For GitHub: GITHUB_WEBHOOK_SECRET set, a verified installation, and PR review enabled on it (github route.ts:64-80; route.ts:329-352).

**Screens and controls**

- Create trigger, copy URL and signing secret, regenerate secret, delete trigger (ScheduleTriggersPanel.tsx:300-360).
- GitHub App settings page at GitHub (outside).

**Journey**

1. 1. Person creates a trigger with source 'Anything else (signed webhook)'.
2. 2. The panel shows the URL and a signing secret once.
3. 3. The outside service signs each request: HMAC over '<timestamp>.<body>' sent as x-agi-timestamp and x-agi-signature, within 5 minutes.
4. 4. The server verifies, parses the JSON (needs string 'id' and 'type'), and queues work.
5. 5. The sender gets {received, matched, queued} or a retryable 503.

**What the person sees and gets**

- 200 {received:true, matched, queued} (connector route.ts:123-127).
- 401 'Invalid signature'; 400 'Body must carry an id and a type'; 413 'Payload too large' (128 KB); 503 with Retry-After 10 when queueing fails (route.ts:44-120).
- GitHub: 200 with duplicate:true on a repeat, 401 on a bad signature, review: queued (github route.ts:123-129).

**Settings**

- EVENT_TRIGGER_SIGNING_SECRET, SLACK_SIGNING_SECRET, GMAIL_PUBSUB_AUDIENCE, GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL, GOOGLE_CALENDAR_CHANNEL_SECRET, GITHUB_WEBHOOK_SECRET, GITHUB_PR_REVIEW_MONTHLY_CAP, GITHUB_BOT_LOGIN (names only) (trigger-signatures.ts:5-9; github route.ts:50, 59).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Connector route: rate limit bucket trigger-webhook, uuid check, 128 KB body cap, salt read, signature check with a 300 s window, JSON object check, id and type check, ingest, 503 on queue failure (webhooks/connectors/[triggerId]/route.ts:35-128).
- Per-trigger secret is derived from the deployment secret, the trigger id and a rotation salt; rotating the salt invalidates the old secret (trigger-signatures.ts:47-86; db/neon/0387_event_trigger_signing_salt.sql; trigger-service.ts:413, 438).
- Constant-time comparison in both signature checks (trigger-signatures.ts:14-18; github-app.ts:349-360).
- GitHub route: rate limit github-webhook, signature check (401 when secret missing or wrong), router for ping, ignored and invalid events, delivery de-duplication, automation events into triggers, installation-deleted cleanup, mention tasks limited to OWNER, MEMBER or COLLABORATOR, automatic PR review on opened, reopened, synchronize, ready_for_review for non-drafts (github/webhook/route.ts:64-300).
- Review budget: 5-minute debounce while a review is pending and a rolling 30-day cap (default 100, from GITHUB_PR_REVIEW_MONTHLY_CAP) per installation (route.ts:57-61, 356-420).
- Review gates: workspace code policy, managed compute policy, managed compute private beta flag, plan tier lookup (route.ts:462-486, 543).
- Release of the delivery receipt when processing fails so a redelivery is processed (route.ts:171-178; delivery-dedup.ts:57).
- Slack, Gmail and Calendar receivers exist with their own verification (verifySlackSignature trigger-signatures.ts:24; Gmail Pub/Sub token check in app/api/webhooks/gmail/route.ts; calendar channel token trigger-signatures.ts:90).

**Incomplete**

- The connector route does not itself record the delivery id; duplicate handling happens inside ingestTriggerEvent, which returns outcome 'duplicate' (trigger-ingest.ts:37, 372). The brief only claims de-duplication for GitHub.
- PR review also depends on a managed compute private beta flag; when it is off, reviews are skipped with a log line (github route.ts:477-483).
- The brief item 'rate limits per route' is true in code, but limits are per IP and fail open if the limiter store is down (rate-limit.ts:464-478).

**Present but disconnected or switched off**

- Connector events are refused when EVENT_TRIGGER_SIGNING_SECRET is unset (route.ts:75-80).
- GitHub webhook returns 401 for every request when GITHUB_WEBHOOK_SECRET is unset (route.ts:73-80).
- Automatic review off unless the installation has pr_review_enabled and a verified owner (route.ts:329-352).

**Not available**

- Receivers on mobile, CLI, VS Code, Chrome and Desktop: none; server only.
- Local mode: none; an outside service must reach our server.

## 4. Required behaviour

**Established requirements**

- Signed webhooks from external providers are received, verified and routed (S98.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.09)
- Connector triggers reject a bad signature with 401. (source: apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:66-83)
- The code-host webhook rejects a bad signature with 401 and acknowledges a duplicate delivery without reprocessing. (source: apps/web/app/api/github/webhook/route.ts:73-80, 123-129)
- Security behaviour fails closed. (source: AGENTS.md section 6)

**Acceptance criteria**

1. A connector POST with a wrong signature returns 401 and queues nothing.
2. A POST with a timestamp older than 300 seconds is rejected.
3. After regenerating a trigger's secret, the old signature fails and the new one works.
4. A body over 128 KB returns 413.
5. A GitHub POST without a valid x-hub-signature-256 returns 401.
6. Sending the same GitHub delivery id twice processes it once and answers duplicate:true.
7. A non-draft pull request opened event queues a review only when the installation has review enabled.
8. With the signing secret unset, connector events return 503 not configured.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A sender must retry on 503 because the route asks for redelivery.
- [inferred] Because the rate limit is per IP, a shared sender IP could share the 300 per minute budget.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document the signing format for sender developers on the trigger panel.
- [proposed] Add a replay test for the connector route's duplicate outcome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:POST /api/webhooks/connectors/{triggerId} | `apps/web/app/api/webhooks/connectors/[triggerId]/route.ts` | Generic signed connector event receiver. |
| endpoint | api:POST /api/github/webhook | `apps/web/app/api/github/webhook/route.ts` | GitHub App event receiver, review and task scheduler. |
| service | Trigger signatures | `apps/web/lib/triggers/trigger-signatures.ts` | HMAC derivation and verification for connector, Slack and Calendar. |
| service | Trigger service | `apps/web/lib/triggers/trigger-service.ts` | createTrigger, regenerateConnectorTriggerSecret (413), readConnectorTriggerSalt (438). |
| service | Trigger ingest | `apps/web/lib/triggers/trigger-ingest.ts` | ingestTriggerEvent (361): match, filter, dedupe, cap, enqueue. |
| service | GitHub events adapter | `apps/web/lib/triggers/github-events.ts` | Turns a GitHub event into a trigger event. |
| service | GitHub webhook router | `apps/web/app/api/github/webhook/webhook-router.ts` | Classifies events: ping, ignored, invalid, automation, installation-deleted. |
| service | Delivery de-duplication | `apps/web/app/api/github/webhook/delivery-dedup.ts` | recordDeliveryOnce (21) and releaseDelivery (57). |
| service | GitHub App library | `apps/web/lib/github-app.ts` | verifyGitHubWebhookSignature (349), installation tokens, review posting. |
| service | Code review pipeline | `apps/web/lib/code-review/pipeline.ts` | Reviews a pull request diff and builds comments. |
| service | Prompt-injection screen | `apps/web/app/api/github/webhook/pr-diff-prompt.ts` | Escapes untrusted diff text. |
| endpoint | api:POST /api/triggers/{triggerId}/signing-secret | `apps/web/app/api/triggers/[triggerId]/signing-secret/route.ts` | Regenerates a trigger's secret (route name inferred from the handler; method not confirmed). |
| component | ScheduleTriggersPanel | `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx` | UI to create triggers and copy or rotate the secret. |
| config | Rate limit buckets | `apps/web/lib/rate-limit.ts` | github-webhook (200 per minute) and trigger-webhook (300 per minute), fail open (lines 464-478). |
| table | table:event_triggers | `apps/web/db/neon/0210_event_triggers.sql` | Triggers; signing_salt added in 0387. |
| schema | Trigger signing salt migration | `apps/web/db/neon/0387_event_trigger_signing_salt.sql` | Adds signing_salt (64 hex). |
| table | table:github_installations | `apps/web/app/api/github/webhook/route.ts` | Installation rows read for review settings (table defined by migration not read). |
| table | table:github_pr_review_attempts | `apps/web/app/api/github/webhook/route.ts` | Review attempts for debounce and quota (table definition not read). |
| endpoint | api:POST /api/webhooks/slack | `apps/web/app/api/webhooks/slack/route.ts` | Slack receiver. |
| endpoint | api:POST /api/webhooks/gmail | `apps/web/app/api/webhooks/gmail/route.ts` | Gmail push receiver (Pub/Sub token). |
| endpoint | api:POST /api/webhooks/google-calendar | `apps/web/app/api/webhooks/google-calendar/route.ts` | Calendar channel receiver. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Outside service sends a signed POST to our server. | outside service | trigger-signatures.ts:60-86 |
| Server applies a per-IP rate limit and body cap. | our servers | connector route.ts:39-50 |
| Server reads the trigger's salt and verifies the signature against the derived secret. | our servers | route.ts:52-83 |
| Server validates payload shape and calls ingestTriggerEvent, which matches triggers, filters, de-duplicates, applies run caps and enqueues a job. | our servers | route.ts:85-114; trigger-ingest.ts:361-421 |
| For GitHub, the server also may schedule a PR review or a mention task after the response, using an installation token from GitHub. | our servers | github route.ts:134-150, 220-250 |
| A model reviews the diff through managed compute and comments are posted to GitHub. | our servers | github route.ts:543-600 region; lib/code-review/pipeline.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Trigger and signing salt. | table:event_triggers | Server only. | Deleted with the trigger; old secret invalid after rotation. |
| Event delivery records and job rows. | trigger event tables used by trigger-ingest.ts (names not read) | Server only. | Not read. |
| GitHub delivery receipts. | delivery-dedup store (table name not read) | Server only. | Released if processing fails (route.ts:171-178). |
| Review attempts. | table:github_pr_review_attempts | Server only. | Deleted when the installation is removed (route.ts:182-187). |

**Models and providers.** The generic connector route uses no model. GitHub review uses a model through the platform's managed compute; the model is chosen by the installation's review_model setting or defaults (route.ts:329-352) [model identity not recorded here].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The sender needs no account, only the secret. The trigger owner is a signed-in user; a GitHub review runs for the installation's owner user (route.ts:329-352). |
| Permissions | Trigger ownership checked on secret regeneration (signing-secret route). Mention-driven GitHub tasks only for OWNER, MEMBER, COLLABORATOR (route.ts:228-232). Workspace code policy checked before review (route.ts:462-472). |
| Subscription | GitHub review resolves the owner's entitled plan tier (route.ts:543); the connector route has no plan check; whether event triggers need a plan is not read here. |
| Limits and metering | Rate limits 200 per minute (GitHub) and 300 per minute (triggers) per IP, fail open; 128 KB body cap; 300 s signature window; GitHub review debounce 5 minutes and cap 100 per 30 days by default; trigger run caps in trigger-ingest.ts (line 281). |
| Feature flags | isManagedComputePrivateBetaEnabled (route.ts:477); pr_review_enabled per installation. |
| Model compatibility | Not applicable to the connector route; review model per installation. |
| Provider restrictions | Senders must follow the signature format; GitHub must be the GitHub App. |
| Local mode | Not applicable. Receivers are on our servers; a device cannot receive these events. Local mode has no webhook path. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | A trigger that matches no one returns matched 0. | connector route.ts:123-127 |
| Error | 401 bad or stale signature; 400 not uuid, not JSON object, missing id or type; 413 too large; 503 not configured or cannot queue. | route.ts:43-120 |
| Retry | 503 with Retry-After 10 asks the sender to redeliver. | route.ts:57-59, 116-121 |
| Duplicate | GitHub: acknowledged with duplicate:true. Connector: ingest returns duplicate outcome. | github route.ts:123-129; trigger-ingest.ts:372 |
| Rotation | Old signature rejected immediately after regenerate. | route.test.ts case at line 157; trigger-signatures.ts:47-57 |
| Timeout | Stale timestamp beyond 300 s gives 401; GitHub background work runs after the response with maxDuration 800. | trigger-signatures.ts:11, 66-69; github route.ts:51 |
| Rate limited | withRateLimit response; fails open if the store is down. | rate-limit.ts:464-478 |
| Cancel and offline | not handled in the code (server push receivers). | searched both routes |
| Prompt injection in a diff | Review skipped with a comment. | github route.ts:520-535 region |
| Accessibility | Not applicable to receivers; the trigger panel shows the secret once. | ScheduleTriggersPanel.tsx:414-419 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/webhooks/connectors/[triggerId]/route.test.ts`: Unset key, wrong-trigger signature, bad body, non-uuid, routing, redeliver on queue failure, rotation, unreadable salt, unknown trigger.
- `apps/web/lib/triggers/__tests__/trigger-service.test.ts`: Trigger service including secrets.
- `apps/web/app/api/triggers/[triggerId]/signing-secret/__tests__/route.test.ts`: Secret regeneration route.
- `apps/web/app/api/github/webhook/__tests__/delivery-release.test.ts`: Receipt kept or released depending on success.
- `apps/web/app/api/github/webhook/__tests__/automated-review.test.ts`: Pull request events trigger a review.
- `apps/web/app/api/github/webhook/__tests__/review-custody.test.ts`: Review custody (name only; details not read).
- `apps/web/app/api/github/webhook/webhook-router.test.ts`: Event routing.
- `apps/web/app/api/github/webhook/delivery-dedup.test.ts`: Delivery de-duplication.
- `apps/web/app/api/github/webhook/github-events.test.ts`: GitHub to trigger event mapping.
- `apps/web/app/api/github/webhook/pr-diff-prompt.test.ts`: Diff escaping.
- `apps/web/db/neon/event-trigger-signing-salt-migration.test.ts`: Salt migration.
- `apps/web/app/api/webhooks/slack/route.test.ts`: Slack receiver.
- `apps/web/app/api/webhooks/gmail/route.test.ts`: Gmail receiver.
- `apps/web/app/api/webhooks/google-calendar/route.test.ts`: Calendar receiver.

**Test scenarios**

- **Valid signed event**
  1. Create a signed-webhook trigger.
  2. Sign '<timestamp>.<body>' with the shown secret and POST with x-agi-timestamp and x-agi-signature.
  - Expected: 200 received:true, matched 1, queued 1.
- **Bad signature**
  1. POST the same body with a changed signature.
  - Expected: 401 Invalid signature; no job.
- **Rotated secret**
  1. Regenerate the secret.
  2. POST with the old secret, then the new.
  - Expected: Old 401, new 200.
- **Stale timestamp**
  1. Sign with a timestamp 10 minutes old.
  - Expected: 401.
- **GitHub duplicate**
  1. Send a signed GitHub event twice with the same x-github-delivery.
  - Expected: Second answer has duplicate:true and no second job.
- **Draft pull request**
  1. Send a pull_request opened event with draft true on a review-enabled installation.
  - Expected: No review queued.

**Where to look when it fails**

- Log lines: 'Connector event signature rejected', 'Connector trigger salt could not be read', 'EVENT_TRIGGER_SIGNING_SECRET is not set; connector events are refused until it is', 'GitHub webhook signature verification failed', 'Duplicate GitHub webhook delivery acknowledged without reprocessing'.
- Tables: event_triggers, github_pr_review_attempts.
- Response codes 401, 413, 503.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The GitHub log line for a failed signature logs the supplied signature value.** Affects: Operators reading logs.. Evidence: github route.ts:76-78 passes { signature } to logger.warn.. Work needed: Review whether logging a rejected signature is acceptable.
- **Rate limits are per IP and fail open.** Affects: Senders sharing an IP; availability under limiter failure.. Evidence: rate-limit.ts:464-478.. Work needed: Decide per-trigger limits; the signature check still gates the request.
- **Plan or entitlement rule for event triggers not established.** Affects: Free users creating signed webhook triggers.. Evidence: connector route.ts has no plan check; trigger-service not read for plan rules.. Work needed: Read trigger-service plan checks and document.
- **No evidence a human has run end to end signed deliveries.** Affects: All.. Evidence: only code tests found; no recorded run.. Work needed: Run the scenarios against a test deployment.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- surface:web
- mode:cloud
- table:event_triggers
- table:github_pr_review_attempts

## Unknown

- Whether event triggers require a paid plan.
- Names of the delivery receipt and trigger event tables.
- Exact HTTP method and path of the signing-secret route (handler read, export not confirmed).
- Which model the GitHub review uses by default.
- How Slack and Gmail receivers behave in full (only their verification helpers were read).
- Whether the owner has registered the webhook URL with any vendor.
