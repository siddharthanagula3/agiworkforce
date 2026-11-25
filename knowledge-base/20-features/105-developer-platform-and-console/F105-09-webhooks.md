---
id: "F105-09"
type: "feature"
title: "Webhooks"
aliases: ["Webhooks card", "Webhook endpoints", "Webhook configuration (S105.21)", "Webhook event history (S105.22)", "Signing secret", "developer webhooks"]
area: "105 Developer platform and console"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.21", "S105.22"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-agents-tools-and-automation", "table:developer_webhook_endpoints", "table:developer_webhook_deliveries", "api:POST /api/developers/webhooks", "api:POST /api/developers/webhooks/{endpointId}/test", "F105-08", "F105-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-09 Webhooks

In the web Developer console a developer registers an https endpoint, chooses events, copies a signing secret shown once, sends a test event, reads delivery history and resends a delivery. Our servers sign each POST, retry failures for about three days, and keep a log. Desktop shows the hosted web app.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.21](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10521), [S105.22](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10522).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sends signed event messages from the platform to a developer's https address when an API key is created or revoked, a project spend limit is reached, or a task run completes, fails or needs approval (apps/web/lib/developer-api/webhook-events.ts:3-35), and keeps a delivery log with Resend (apps/web/features/developers/components/WebhooksPanel.tsx:367-410).

**Why it exists.** Developers want to react to events without polling. The card says 'Add one to receive events without polling.' (WebhooksPanel.tsx:869-871).

**Who uses it.** A signed-in developer or automation owner who runs a public https service.

**Problems it solves**

- Missing a key revocation or a limit hit.
- Knowing when a scheduled task finished or needs approval.
- Proving a message is genuine (signature).

**Use cases**

- Alert a chat channel when a project spend limit is reached.
- Start a follow-up job when a task run completes.
- Audit key creation in an external log.
- Debug a receiver by sending a test event and resending a failed delivery.

## 2. User experience

**Where to find it**

- Web: /developers, card 'Webhooks' with button 'Add endpoint' (WebhooksPanel.tsx:812-826).
- Web docs: /api-docs#webhooks and Reference card link 'Webhooks' (apps/web/app/api-docs/page.tsx:247-278; DeveloperConsolePage.tsx:27-31).
- Desktop: hosted web app (doc: AGENTS.md section 5); no desktop source refers to api/developers (grep found nothing).
- CLI, VS Code, Chrome, mobile: not available; none of their sources refers to api/developers (grep).

**Before you start**

- Signed in with an admitted workspace (WebhooksPanel.tsx:935-950).
- An https endpoint that resolves to a public address (apps/web/lib/services/developer-webhook-service.ts:119-143).
- Secret storage configured on the deployment, else webhooks are unavailable (developer-webhook-service.ts:104-113).

**Screens and controls**

- Endpoint dialog titled 'Add an endpoint' or 'Edit <host>': fields 'Endpoint URL', 'Description' (optional), checkboxes under 'Events', buttons 'Add endpoint' or 'Save' (WebhooksPanel.tsx:163-229).
- Secret dialog 'Copy the signing secret now' with 'Copy secret' and 'I have stored it' (WebhooksPanel.tsx:283-298).
- Row buttons: 'Send test event', 'Deliveries' or 'Hide deliveries', 'Turn off' or 'Turn on', 'Edit', 'Remove' (WebhooksPanel.tsx:470-530).
- Delivery rows: event name, time, 'answered N', state text, 'Resend' (WebhooksPanel.tsx:370-407).
- Remove confirmation: 'Remove <host>?' with 'Remove endpoint' (WebhooksPanel.tsx:752-755).

**Journey**

1. Open /developers, Webhooks, press 'Add endpoint'.
2. Enter the https URL, an optional description, tick at least one event, press 'Add endpoint'.
3. Copy the secret from the dialog and press 'I have stored it'.
4. Press 'Send test event'; the toast says 'A test event is on its way.' and the delivery list opens.
5. Read each delivery's state; press 'Resend' on one to queue it again ('The event is queued to be sent again.').
6. Verify signatures in the receiver as described at /api-docs#webhooks.

**What the person sees and gets**

- Delivery state text: 'Delivered', 'Failed', 'Queued', or 'Retrying after N attempts' plus the error (WebhooksPanel.tsx:118-125).
- Empty endpoints: 'No endpoints yet. Add one to receive events without polling.'
- Empty deliveries: 'Nothing has been sent to this endpoint yet. Send a test event to try it.' (WebhooksPanel.tsx:360-366).
- Errors such as 'Webhook endpoints must use https.' and 'That address is private or does not resolve, so events could not reach it.' (developer-webhook-service.ts:127, :137).

**Settings**

- Per endpoint: URL, description, event list, enabled flag.
- Limit of 10 endpoints (developer-webhook-service.ts:35).
- Rate limits for the routes: reads 60 per minute, writes 20 per minute (apps/web/lib/rate-limit.ts:701-710).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create, list, edit, turn on or off, delete endpoints (apps/web/app/api/developers/webhooks/route.ts:20-59; apps/web/app/api/developers/webhooks/[endpointId]/route.ts:26-80).
- Test event and resend routes (apps/web/app/api/developers/webhooks/[endpointId]/test/route.ts; .../deliveries/[deliveryId]/redeliver/route.ts:15-30 returns 202).
- Delivery by a queue job with a first attempt right after the response (developer-webhook-service.ts:319-337, :558-578; apps/web/lib/jobs/job-handlers.ts:357).
- Secret sealed with the platform key; only a 10 character prefix is readable (developer-webhook-service.ts:165-167; apps/web/lib/developer-api/webhook-signature.ts:8-13).
- Signature header: webhook-signature = v1, base64 HMAC-SHA256 over id.timestamp.body (webhook-signature.ts:15-26, :28-46).
- Private-address check at save and again at send; redirects are not followed (developer-webhook-service.ts:119-143, :420-468).
- Producers wired: api_key.created, api_key.revoked, project.spend_limit_reached, task_run.completed, task_run.failed, task_run.needs_approval (apps/web/app/api/settings/api-keys/route.ts:147; api-keys/[keyId]/route.ts:59; projects/[projectId]/route.ts:85; project-spend.ts:65; job-handlers.ts:136-150).

**Incomplete**

- Delivery log lists the latest 50 per endpoint with no paging (developer-webhook-service.ts:37, :245-259).
- The secret cannot be rotated or re-shown: no route or control for it was found (routes listed above; UpdateWebhookSchema has no secret field, webhook-route-schemas.ts:34-43).

**Present but disconnected or switched off**

- An endpoint that is turned off causes its queued deliveries to be marked failed with 'The endpoint was turned off before this event was sent.' (developer-webhook-service.ts:506-513).

**Not available**

- Webhooks on mobile, CLI, VS Code, Chrome (n/a per brief).
- Public OpenAPI entries for the webhook management routes: the bundle has 30 paths and none under /developers or /webhooks (grep of apps/web/public/openapi.json).

## 4. Required behaviour

**Established requirements**

- Developers can register a webhook endpoint and choose which events it receives. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.21)
- Developers can see a history of webhook deliveries with status and can redeliver. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.22)
- Up to 10 endpoints per user. (source: apps/web/lib/services/developer-webhook-service.ts:35, :177-181)
- URLs must be https, carry no credentials and resolve to a public address. (source: developer-webhook-service.ts:119-143)
- The secret is stored encrypted; without secret storage webhooks are unavailable. (source: developer-webhook-service.ts:104-113)
- A delivery times out after 10 seconds and is attempted up to 20 times with exponential backoff capped at 6 hours. (source: apps/web/lib/developer-api/webhook-events.ts:48-60; apps/web/lib/jobs/job-queues.ts:37-45)
- Requests follow Standard Webhooks headers webhook-id, webhook-timestamp, webhook-signature. (source: apps/web/app/api-docs/page.tsx:255-268; webhook-signature.ts:34-45)

**Acceptance criteria**

1. Adding an endpoint with an http URL is refused with 'Webhook endpoints must use https.'
2. The signing secret is shown once, starts with whsec_, and is not returned by later reads.
3. An 11th endpoint is refused with a message naming the limit.
4. 'Send test event' creates a delivery of type webhook.test that reaches the receiver with a valid signature.
5. A receiver answering 500 shows 'Retrying after 1 attempts' with the error 'The endpoint answered 500.'
6. 'Resend' creates a new delivery marked 'resent' using the same event id.
7. Turning an endpoint off stops new events being queued to it.
8. Creating an API key queues api_key.created for endpoints that picked it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A resend carries the original event id as webhook-id, so a receiver can de-duplicate (service lines 409-414, 523-527).
- [inferred] The retry window works out to about 2.85 days (sum of backoff steps), which the code rounds to 3 days (webhook-events.ts:53-60).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add secret rotation with a short overlap.
- [proposed] Page the delivery log and add a status filter.
- [proposed] Document the management routes in the OpenAPI bundle if they are meant for key holders.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | WebhooksPanel | `apps/web/features/developers/components/WebhooksPanel.tsx` | Card, editor dialog, secret dialog, delivery log, actions |
| hook | use-developer-webhooks | `apps/web/features/developers/hooks/use-developer-webhooks.ts` | Queries and mutations for endpoints and deliveries |
| endpoint | GET/POST /api/developers/webhooks | `apps/web/app/api/developers/webhooks/route.ts` | List and create, audit developer_webhook_configured |
| endpoint | PATCH/DELETE /api/developers/webhooks/{endpointId} | `apps/web/app/api/developers/webhooks/[endpointId]/route.ts` | Edit and remove, audit |
| endpoint | POST /api/developers/webhooks/{endpointId}/test | `apps/web/app/api/developers/webhooks/[endpointId]/test/route.ts` | Queue a webhook.test event |
| endpoint | GET /api/developers/webhooks/{endpointId}/deliveries | `apps/web/app/api/developers/webhooks/[endpointId]/deliveries/route.ts` | List deliveries |
| endpoint | POST .../deliveries/{deliveryId}/redeliver | `apps/web/app/api/developers/webhooks/[endpointId]/deliveries/[deliveryId]/redeliver/route.ts` | Queue the same event again, returns 202 |
| service | developer-webhook-service | `apps/web/lib/services/developer-webhook-service.ts` | All endpoint and delivery logic, SSRF checks, sealing, sending, job handler |
| config | webhook events and retry constants | `apps/web/lib/developer-api/webhook-events.ts` | Event list, test event, 20 attempts, 10 s timeout, retry days |
| service | webhook signature | `apps/web/lib/developer-api/webhook-signature.ts` | Secret generation, HMAC, headers |
| schema | webhook route schemas | `apps/web/lib/developer-api/webhook-route-schemas.ts` | URL max 2048, description max 200, unique known events |
| table | developer_webhook_endpoints | `apps/web/db/neon/0323_developer_webhooks.sql` | Endpoints with encrypted secret, row-level security by owner |
| table | developer_webhook_deliveries | `apps/web/db/neon/0323_developer_webhooks.sql` | One row per delivery with status, attempts, response status, error, redelivery_of |
| job | webhooks.developer-delivery | `apps/web/lib/jobs/job-handlers.ts` | Queue kind mapped to deliverDeveloperWebhookJob (line 357); queue policy in job-queues.ts:37-45, :116 |
| event | api_key.created | `apps/web/app/api/settings/api-keys/route.ts` | Producer at line 147 |
| event | api_key.revoked | `apps/web/app/api/settings/api-keys/[keyId]/route.ts` | Producer at line 59 (also projects/[projectId]/route.ts:85) |
| event | project.spend_limit_reached | `apps/web/lib/developer-api/project-spend.ts` | Producer at line 65, once per month |
| event | task_run.completed, failed, needs_approval | `apps/web/lib/jobs/job-handlers.ts` | Producer at lines 136-150 after schedule completion notice |
| service | egress policy | `apps/web/lib/egress-policy.ts` | assertResolvedPublicHostname and pinnedPublicFetch used for sending |
| service | envelope encryption | `apps/web/lib/crypto/envelope.ts` | sealEnvelope and openEnvelope for the secret |
| component | API docs webhooks section | `apps/web/app/api-docs/page.tsx` | Public description of payload, headers, retries (lines 247-278) |
| component | DeveloperConsolePage | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Mounts WebhooksPanel (line 73) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person adds an endpoint; the browser POSTs url, description and events with CSRF. | device | WebhooksPanel.tsx:163-229; apps/web/app/api/developers/webhooks/route.ts:28-41 |
| The server checks https, credentials, DNS to a public address, seals a new whsec_ secret, takes a per-user lock and inserts if under 10 endpoints. | our servers | developer-webhook-service.ts:159-193 |
| The secret is returned once in the 201 body and shown in a dialog. | our servers | route.ts:55; WebhooksPanel.tsx:283-298 |
| When an event happens, matching enabled endpoints get a delivery row and a queue job; the first attempt runs after the response. | our servers | developer-webhook-service.ts:262-302, :339-366, :319-337 |
| The job decrypts the secret, signs the JSON body, and POSTs to the developer's URL with a 10 second timeout and no redirects. | outside service | developer-webhook-service.ts:475-531, :420-468 |
| Status, attempts, response status and error are written; a non-2xx result leaves it pending until the final attempt, then failed. | our servers | developer-webhook-service.ts:532-551 |
| Resend copies the stored payload into a new delivery with redelivery_of set and attempts once after the response. | our servers | developer-webhook-service.ts:389-418 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Endpoint URL, description, event list, enabled flag, secret prefix, sealed secret | Table developer_webhook_endpoints | Server only | Deleted with the endpoint or the account (foreign key on delete cascade, 0323 migration) |
| Event payloads and delivery outcomes | Table developer_webhook_deliveries (payload json, status, attempts, response status, error text up to 500 characters) | Server only | Deleted with the endpoint (cascade); other retention unknown |
| Queue jobs | Job queue 'webhooks' | Server only | Finished jobs kept 7 days, dead jobs 30 days (job-queues.ts:43-44) |
| Plain secret | Shown once in the browser dialog; never stored in plain form | no | Gone when the dialog closes |

**Models and providers.** No model or provider takes part in delivery. Event content may report task or key facts only; payloads are built from ids and names (job-handlers.ts:136-150; project-spend.ts:65-70).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; every query filters by user_id and the tables use row-level security (0323 migration). |
| Permissions | Owner only: the routes use the caller's user id and no workspace role (apps/web/app/api/developers/webhooks/route.ts:24). Changes are audited (developer_webhook_configured, developer_webhook_deleted). |
| Subscription | none found in the code for the webhook routes or the service. Keys that trigger events need plan:pro or above for managed API (billing-catalog.ts:341, :358). |
| Limits and metering | 10 endpoints; 20 attempts; 10 s timeout; page of 50 deliveries; console rate limits 60 reads and 20 writes per minute; background queue concurrency 4 (job-queues.ts:37-39). Webhook sends are not metered in credits [inferred: no cost code found]. |
| Feature flags | Secret storage must be configured, else capabilityUnavailable (developer-webhook-service.ts:108-111). No feature flag found. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable: webhooks are sent by our servers about Cloud events. A Local or own-key session creates no webhook event, although a task run or key event on the account does. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | No-endpoints and no-deliveries messages. | WebhooksPanel.tsx:360-366, :869-871 |
| Loading and load failure | Retry button and 'Webhook endpoints could not be loaded.' or 'Deliveries could not be loaded.' | WebhooksPanel.tsx:351-356, :856-866 |
| Endpoint limit | Validation error naming 10. | developer-webhook-service.ts:177-181 |
| Private or unresolvable address | Refused at save; at send the delivery fails with 'The endpoint now resolves to a private address.' | developer-webhook-service.ts:132-141, :442-444 |
| Timeout | 'The endpoint did not answer within 10 seconds.' | developer-webhook-service.ts:445-451 |
| Redirect | Counted as failure: 'redirects are not followed'. | developer-webhook-service.ts:461-466 |
| Retry | Status stays pending ('Retrying after N attempts') until the last attempt, then failed. | developer-webhook-service.ts:544-546; WebhooksPanel.tsx:118-125 |
| Already delivered | A job for a delivered row is skipped. | developer-webhook-service.ts:504 |
| Endpoint removed during delivery | Job skipped with endpoint_removed. | developer-webhook-service.ts:503 |
| Cancel (job aborted) | AbortSignal is honoured; an observed outcome is still saved. | developer-webhook-service.ts:480-482, :533-552 |
| Unconfirmed action | Message tells the person to refresh before repeating. | WebhooksPanel.tsx:90 |
| Accessibility | Lists have aria-labels, deliveries button has aria-expanded, errors use role alert. | WebhooksPanel.tsx:370, :488-493, :856 |
| Offline | not handled in the code beyond the failure messages above. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/developers/webhooks/__tests__/route.test.ts`: 401 on list and create, CSRF refusal, unknown or duplicate event refused, create returns the secret once and audits (it titles 107-159)
- `apps/web/app/api/developers/webhooks/[endpointId]/__tests__/route.test.ts`: name only; not opened
- `apps/web/app/api/developers/webhooks/[endpointId]/test/__tests__/route.test.ts`: name only; not opened
- `apps/web/app/api/developers/webhooks/[endpointId]/deliveries/__tests__/route.test.ts`: name only; not opened
- `apps/web/lib/services/__tests__/developer-webhook-endpoint-admission.test.ts`: name only; not opened
- `apps/web/lib/services/__tests__/developer-webhook-queue-transaction.test.ts`: name only; not opened
- `apps/web/lib/services/__tests__/developer-webhook-delivery-terminal-state.test.ts`: name only; not opened
- `apps/web/features/developers/__tests__/WebhooksPanel.ownership.test.tsx`: name only; not opened
- `apps/web/features/developers/__tests__/DeveloperWebhookMutationOwnership.test.tsx`: name only; not opened
- `apps/web/features/developers/__tests__/DeveloperWebhookReadOwnership.test.tsx`: name only; not opened

**Test scenarios**

- **Create and verify**
  1. Add an endpoint to a test receiver.
  2. Copy the secret.
  3. Press 'Send test event'.
  4. On the receiver, recompute HMAC-SHA256 of id.timestamp.body with the base64 part of the secret.
  - Expected: Signature equals the webhook-signature value after 'v1,'; delivery shows Delivered with answered 200.
- **Reject http**
  1. Add an endpoint with http://example.com.
  - Expected: Error 'Webhook endpoints must use https.'
- **Failure and retry**
  1. Point an endpoint at a receiver that returns 500.
  2. Send a test event.
  3. Open Deliveries.
  - Expected: State 'Retrying after 1 attempts: The endpoint answered 500.'; later attempts increase the count.
- **Resend**
  1. Fix the receiver.
  2. Press 'Resend' on the failed delivery.
  - Expected: A new row marked 'resent' reaches Delivered; webhook-id equals the original event id.
- **Endpoint cap**
  1. Create 10 endpoints, then an 11th.
  - Expected: The 11th is refused.
- **Real event**
  1. Subscribe to api_key.created.
  2. Create an API key.
  - Expected: A delivery for api_key.created appears.

**Where to look when it fails**

- Log 'First webhook attempt failed; the queued job retries it' (developer-webhook-service.ts:329).
- Log 'Developer webhook event was not queued' (developer-webhook-service.ts:364).
- Log 'Developer webhook secrets cannot be sealed without the platform key' (line 108).
- developer_webhook_deliveries.error and response_status columns.
- Queue kind webhooks.developer-delivery in the job tables.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **No secret rotation or re-reveal.** Affects: Web developers who lose the secret. Evidence: webhook-route-schemas.ts:34-43; dialog text 'cannot be recovered' WebhooksPanel.tsx:285-288. Work needed: Add rotate action with confirmation.
- **Delivery log shows only the latest 50 and has no filter.** Affects: Developers with busy endpoints. Evidence: developer-webhook-service.ts:245-259. Work needed: Paging and status filter.
- **Management routes are not in the OpenAPI bundle and docs name only the console.** Affects: Developers wanting to automate setup. Evidence: openapi.json has 30 paths, none for developers. Work needed: Decide whether to publish them.
- **Many webhook tests were only seen by name.** Affects: Test planning. Evidence: files listed above. Work needed: Read them and record what they cover.
- **Delivery retention beyond cascade deletion is unknown.** Affects: Privacy review. Evidence: Not found. Work needed: Establish and state it.
- **Brief has no CLI or extension entries for webhooks; none exist.** Affects: CLI users. Evidence: grep of apps/cli, apps/extension found no webhook console call. Work needed: None unless required.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-agents-tools-and-automation
- table:developer_webhook_endpoints
- table:developer_webhook_deliveries
- api:POST /api/developers/webhooks
- api:POST /api/developers/webhooks/{endpointId}/test
- F105-08
- F105-10

## Unknown

- Retention of delivery rows beyond endpoint deletion.
- The format difference between seal 'versioned' (line 167) and open 'hex-triple' (line 516) in developer-webhook-service.ts.
- How often the job queue drains retries.
- What the test, [endpointId] and ownership tests assert (not opened).
- Whether an API key can call the management routes.
- Whether each event payload's fields are documented beyond the docs table (code-samples.json not opened).
