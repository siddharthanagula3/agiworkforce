---
id: "SYS-observability-and-operations"
type: "system"
title: "Observability and operations"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Observability and operations

The web app (Next.js on Vercel) is watched by Pino logs with redaction, Sentry plus optional OTLP traces, OpenTelemetry metrics, and a health endpoint. 47 Vercel crons do background work, and some also detect outages and burning error budgets. Alerts go through one dispatcher (email, pager, channel, out-of-band). Rate limits live in one table backed by Redis. Capacity figures are unmeasured targets. Other apps have only partial telemetry.

## What it is and why it exists

This page covers how the **running hosted system** (the Next.js web service, surface:web, which also serves the API used by every other app) is watched and kept alive. It answers: where do logs go, what is traced, what is measured, which scheduled jobs exist, what limits requests, how health is reported, how errors are classed, and where to look when something fails.

Why it exists [requirement]: `docs/runbooks/incident-response.md` says that until 2026-08-09 nothing in the repository could reach a human when production broke; the probe, burn-rate alerting and dispatcher were added to fix that. `AGENTS.md` section 8 says scale is a target and a concurrency figure may never be claimed without a live run (also stated in `docs/runbooks/capacity-and-load-testing.md`).

Scope note: everything below is the **hosted** service. Local inference on desktop and mobile is not watched by any of it [inferred: none of these routes or crons see on-device work]. See SYS-chat-turn-pipeline for the turn path and the subscription pages for quotas and credits.

## How it works today

All statements are [code] unless marked.

### Logs
- `apps/web/lib/logger.ts` builds a Pino logger. Every record gets `service`, `version` (release SHA), `region`, `deploy_env`, and, inside a request, `trace_id`, `span_id`, `request_id`, `organization_id`, `user_id` (`traceLogFields` in `apps/web/lib/observability/trace-context.ts:96-104`).
- Deployed runtimes refuse `trace` and `debug` however `LOG_LEVEL` is set; the floor is `info` (`logger.ts` `resolveLogLevel`, `MINIMUM_DEPLOYED_LEVEL`). Development defaults to `debug` with `pino-pretty` unless `AGI_DEV_LOG_FORMAT=json`.
- Strings and records are redacted by key and by secret pattern before output (`redactLogRecord`, `redactSecrets`; key denylist in `apps/web/lib/observability/log-field-policy.ts`: prompt, body, token, email, password and similar). A repo guard `scripts/check-log-redaction.mjs` loads that policy file (comment at the top of `log-field-policy.ts`).
- Where logs are shipped is [unknown]: the logger writes to the platform stream; no log drain is configured in the repository.

### Traces and spans
- `apps/web/instrumentation.ts` `register()` runs once at server start. In Node it installs trace storage and the provider tracer, validates environment (fails boot in production unless `AGI_ALLOW_INVALID_ENV=1`), asserts a pooled database endpoint, preloads platform keys, and records configuration states.
- Sentry starts only when `NODE_ENV=production` and a DSN exists (`apps/web/lib/sentry-shared.ts` `isSentryConfigured`). Release is the commit SHA; environment comes from the Vercel environment so previews are not filed as production.
- OTLP export is **off unless** `AGI_OTEL_EXPORTER_ENDPOINT` is a valid URL (`apps/web/lib/observability/otel-config.ts:15-20, 71-86`). Other settings: `AGI_OTEL_SERVICE_NAME` (default `agiworkforce-web`), `AGI_OTEL_HEADERS`, `AGI_OTEL_SAMPLE_RATIO`, `AGI_OTEL_SLOW_SPAN_MS` (default 1000 ms).
- Sampling is **tail-biased** (`otel-sdk.ts:55-85`, `trace-sampling.ts`): every span is recorded; at span end it is exported if it errored, ran at least the slow threshold, or its trace id falls in the sample ratio (decided on the last 8 hex digits, so a trace is kept or dropped whole). With OTLP on, Sentry records all traces (rate 1) so this tail filter decides (`otel-config.ts` `sentryTracesSampleRate`).
- Spans use closed domains: approval, billing, database, external, http, model, queue, retrieval, sandbox, task, tool (`apps/web/lib/observability/span.ts:15-27`). A span can be closed as a deliberate refusal so refusals are not counted as success (`ActiveSpan.refuse`).
- Incoming `traceparent` is parsed and a request id header `x-request-id` is used (`trace-context.ts` `parseTraceparent`; `packages/contracts/cloud-contracts/src/header-names.ts:11`). `apps/web/lib/error-handler.ts` wraps routes, records the HTTP metric, and returns the request id with errors.
- Exported spans pass a privacy filter (`PrivacyFilteredSpanExporter` in `sentry-otel-export.ts`).

### Metrics
`apps/web/lib/observability/metrics.ts` defines the OpenTelemetry instruments (names in `METRIC_NAME`, lines 21-62): HTTP request count and duration, span count and duration, tool calls, browser tasks, notification deliveries, `agi.failures` (kinds: api, browser, client, connector, database, mcp, model, notification, remote, tool, worker), database operation count and duration, queue depth, wait, age and stuck, routing decisions, turn counts, time to first token, duration, cost and retries, completions and false-success, denials (layers: capability, policy, entitlement, surface), rejections, client failures, configuration state, media generation. Label values are bounded so series cannot explode (`cardinality.ts`: enumerated, bounded with a default limit of 50, overflow label `other`). `apps/web/lib/observability/dashboards.ts` declares 20 dashboards as data (for example http-traffic, job-health, turn-latency-and-cost, database-health, client-health, completion-truth); rendering them in a vendor tool is [unknown].

### Client failures
Browsers send closed-vocabulary failure classes (no free text, strict schema) in batches to `api:POST /api/telemetry/client`; it needs CSRF, the `client-telemetry` limit (30 per minute, fail closed), and the user's telemetry consent (`apps/web/app/api/telemetry/client/route.ts`; sender `client-failure-transport.ts`, 20 reports per page budget, 5 s timeout, one attempt).

### Scheduled jobs
47 crons are registered in `vercel.json` (`crons`), one per route directory under `apps/web/app/api/cron/`; `apps/web/app/api/cron/cron-registration.test.ts` fails if a route is unscheduled, a schedule points nowhere, a path repeats, or an expression is not five fields. Each route checks `verifyCronRequest` (bearer `CRON_SECRET`, constant-time compare, 10 failures per minute per client throttle, fail closed when no secret; a dev bypass works only with `CRON_DEV_BYPASS=1` on a loopback host in development; `apps/web/lib/server/cron-auth.ts`). Full cadence table is in Data and state.

### Detection and alerting
- `api:GET /api/cron/health-probe` (every 10 min) runs `runHealthChecks()` directly with an 8 s timeout, tracks a failure streak in the key-value store (`agi-health-probe:consecutive-failures`, TTL 1800 s) and pages only on the **second consecutive** miss (`route.ts:21-25, 146-160`). Healthy clears the incident. `unhealthy` maps to critical, `degraded` to warning; a thrown or timed-out check pages critical as `probe_failed` with HTTP 500.
- `evaluate-slo-burn` (at :05 and :35) evaluates error-budget burn and cost or latency anomalies. Fast window 1 h at 14.4x burn is critical; slow window 6 h at 6x is warning; fewer than 20 samples stays silent (`apps/web/lib/server/slo/attainment.ts:210-215`).
- `page-security-anomalies` (every 30 min), `reconcile-credits` (email on terminal settlements) and `remind-free-quota-renewal` also reach humans [requirement: incident-response.md detector table].
- `apps/web/lib/server/incident/dispatch.ts` is the one exit: email to the on-call responder (or `AGI_SUPPORT_FALLBACK_EMAIL`), pager webhook (`PAGER_WEBHOOK_URL`), incident channel webhook (`INCIDENT_CHANNEL_WEBHOOK_URL`), and, only if none delivered, an out-of-band webhook (`INCIDENT_OUT_OF_BAND_WEBHOOK_URL` plus token) and a status mirror write (`AGI_STATUS_MIRROR_*`). Escalation level rises with how long the same incident key keeps firing (default 15 min per level), held in the key-value store for 6 hours as `agi-incident:<key>`.

### Health and status
- `api:GET /api/health` is public, rate limited (`health-check`, 30 per minute), `Cache-Control: no-store`. It serves a cached result (60 s render cache, stale after 120 s). A stale result triggers one shared refresh bounded to 8 s; if that fails it answers 503 with `stale: true`. `unhealthy` also answers 503; `healthy` and `degraded` answer 200 (`app/api/health/route.ts:81-111`). Public check messages are reduced to `unavailable` or `not configured` so no component name leaks.
- `/status` (`apps/web/app/status/page.tsx`) renders the same checks plus SLO attainment, and says a passing check does not verify a model response.
- Core checks (database, environment, cache) failing means `unhealthy`; Stripe, chat routing, work queues, voice routing, search, vector and identity failing means `degraded` (`apps/web/lib/server/health-check.ts:474-500`). The key-value store is core on purpose: rate limiting fails closed, so turns cannot be served without it.

### Rate limits
`apps/web/lib/rate-limit.ts` holds `rateLimitConfigs` (147 named buckets, each with a limit, a window and `failClosed`). Limits are enforced in Redis-compatible shared storage with an 800 ms limiter budget. Key points are in Rules.

## Implementation map

| Concern | Owner file | Basis |
| --- | --- | --- |
| Cron schedule | `vercel.json` (`crons`) | [code] |
| Cron routes (47) | `apps/web/app/api/cron/*/route.ts` | [code] |
| Cron registry of workers, versions, queues | `apps/web/app/api/cron/deployable-components.json` (gated by `deployable-components.test.ts`) | [code] |
| Cron registration test | `apps/web/app/api/cron/cron-registration.test.ts` | [code] |
| Cron auth | `apps/web/lib/server/cron-auth.ts` | [code] |
| Low-power cron gate | `apps/web/lib/server/cron-low-power.ts`, test `apps/web/__tests__/cron-low-power-window.test.ts` | [code] |
| Logger | `apps/web/lib/logger.ts`, redaction in `apps/web/lib/observability/redact.ts`, `log-field-policy.ts` | [code] |
| Trace context | `apps/web/lib/observability/trace-context.ts`, `trace-storage.node.ts`, `trace-propagation.ts` | [code] |
| Spans | `apps/web/lib/observability/span.ts`, `otel-span-bridge.ts`, `database-span.ts`, `provider-tracer.ts` | [code] |
| OTLP config and SDK | `otel-config.ts`, `otel-sdk.ts`, `trace-sampling.ts`, `sentry-otel-export.ts` (same folder) | [code] |
| Boot hook | `apps/web/instrumentation.ts`, `apps/web/lib/sentry-shared.ts` | [code] |
| Metrics and labels | `metrics.ts`, `cardinality.ts`, `attributes.ts`, `dashboards.ts`, `signal-coverage.ts` | [code] |
| Server error capture | `apps/web/lib/observability/error-capture.ts` (reports only 5xx or undeclared status; validation errors skipped) | [code] |
| Route error wrapper | `apps/web/lib/error-handler.ts` | [code] |
| Error classes | `packages/contracts/types/src/error-taxonomy.ts` and `error-taxonomy.json` | [code] |
| Health checks | `apps/web/lib/server/health-check.ts`, route `apps/web/app/api/health/route.ts` | [code] |
| Status page | `apps/web/app/status/page.tsx`, `signal-view.ts`, notices `apps/web/app/api/status/notices` | [code] |
| SLO catalogue, burn, anomaly, job health | `apps/web/lib/server/slo/{catalogue,attainment,anomaly,job-health,degradation}.ts` | [code] |
| Incident dispatch | `apps/web/lib/server/incident/{dispatch,on-call,pager,out-of-band}.ts` | [code] |
| Rate limiter | `apps/web/lib/rate-limit.ts`, `rate-limit-headers.ts`, `redis-outage-policy.ts`, `server/key-value.ts` | [code] |
| Domain events catalogue | `packages/contracts/cloud-contracts` (`DOMAIN_EVENTS`), doc `docs/standards/domain-events.md` | [requirement] and test path named there |
| Load scenarios | `tools/load-test/{chat-streaming,search,durable-runs,large-uploads}.js` | [code] (directory listing) |
| Shared error reporting port for browser-adjacent apps | `packages/*/observability` (`@agiworkforce/observability`: port, scrub, Sentry envelope adapter) | [code] (package.json description) |
| CLI crash reports | `apps/cli/src/crash_reports.rs` | [code] |
| Failure taxonomy for agents | `docs/agent-context/llm-failure-taxonomy.json` | [code] |

## Data and state

### Cron cadence (from `vercel.json`, UTC)

| Cadence | Routes |
| --- | --- |
| Every 5 min | `drain-background-jobs`, `sweep-chat-file-intakes` |
| Every 10 min | `health-probe`, `index-retrieval-documents` |
| Every 15 min | `live-artifacts-refresh`, `run-schedules`, `recover-reservations` (:00/:15/:30/:45) |
| Four times an hour, offset | `notify-upgrade-waitlist` (:04,:19,:34,:49), `reap-code-turns` (:05,:20,:35,:50), `reap-agent-runs` (:10,:25,:40,:55) |
| Every 10 min offset | `run-auto-reloads` (:07,:17,...:57) |
| Every 30 min | `drain-audit-streams`, `page-security-anomalies`, `evaluate-slo-burn` (:05,:35) |
| Hourly | `remind-trials` (:13), `reclaim-sandboxes` (:11), `replicate-object-backups` (:06), `expire-code-trials` (:06), `evaluate-model-rollout` (:05), `remind-free-quota-renewal` (:05) |
| Daily | `reset-credits` 00:00, `reconcile-credits` 00:07, `expire-bonus-credits` 00:12, `enforce-billing-retention` 01:00, `expire-purchased-credits` 01:06, `grant-referral-rewards` 01:10, `reconcile-provider-costs` 01:03, `reconcile-billed-plans` 01:11, `expire-support-handoffs` 02:00, `expire-support-access-grants` 02:03, `purge-security-audit-logs` 02:07, `roll-up-product-metrics` 02:10, `purge-temporary-chats` 03:00, `expire-memories` 03:05, `purge-deleted-media` 04:00, `purge-deleted-accounts` 04:07, `enforce-workspace-retention` 04:05, `purge-soft-deleted-resources` 04:10, `purge-deleted-organizations` 04:12, `enforce-domain-retention` 04:14, `expire-organization-invitations` 05:00, `enforce-billing-collection` 05:05, `report-enterprise-usage` 05:10, `refresh-connector-directory` 06:03, `refresh-plugin-directory` 06:08, `renew-gmail-watches` 06:13 |
| Monthly | `allocate-infrastructure-costs` (06:00 on the 5th) |

Max durations seen: `drain-background-jobs`, `reap-agent-runs`, `reap-code-turns`, `recover-reservations`, `reclaim-sandboxes` 300 s; `run-schedules` 60 s; `health-probe` 30 s; `evaluate-slo-burn` 60 s. The drain has a 250 s budget and at most 12 jobs in flight (`drain-background-jobs/route.ts:15-18`). `run-schedules` claims waves of 10 with a 40 s wave timeout and a 55 s sweep budget (`run-schedules/route.ts:12-20`).

### Low-power mode
`AGI_DB_LOW_POWER=1` makes any cron call after minute 14 of the hour return `{"skipped":"db_low_power"}` (`cron-low-power.ts`, window 15 minutes). Crons that call `lowPowerCronSkip` then run only in the first 15 minutes of each hour, so the 15-minute and 30-minute crons effectively run hourly. `docs/runbooks/capacity-and-load-testing.md` says to set it in Production on the Neon Free plan; whether it is set now is [unknown].

### Service level objectives (`apps/web/lib/server/slo/catalogue.ts`)
Objectives are computed from named production tables over a 30-day window. Examples: authentication 99.9% (`authentication_attempts`), chat 99% (`routing_decision_traces`, served turns reaching success), first token 95% within 3000 ms, completion 95% within 120000 ms, tool execution 99% (`agent_tool_executions`), work 99% (`background_jobs`), research 95% (`research_reports`), search 99% (`search_history`), file upload and parsing 99% (`product_analytics_events`, consented accounts only), remote control 95%, notifications 99% (declared, instrument missing), billing events 99.9%. Some are `audience: 'internal'` (billing-usage, entitlement-activation) and never published. A definition may carry `missingInstrument` instead of a source.

### Stores
- Key-value store (Upstash Redis REST, or Vercel KV names): rate limit counters (prefix `agi-rl:<bucket>`), managed turn slots (`agi-turns:<userId>`, TTL 360 s), health streak, incident state.
- Postgres (Neon): the SLO source tables above, `credit_settlement_jobs`, `background_jobs`, `mcp_response_cache`. Table list for observability itself is [unknown] beyond these.
- Domain events (`docs/standards/domain-events.md`): 29 catalogued events named `<namespace>.<object>.<verb>`, each with data class, PII fields, retention class and consumers (audit-log, siem-export, product-analytics, notifications, read-model). Retention class is set by the catalogue, not the producer. Delivery is at least once; consumers dedupe on `dedupeKey`.
- Device stores: none are used by this subject on the server. CLI crash reports go to a local `crash-reports` folder (max 20 pending) before upload (`apps/cli/src/crash_reports.rs:13-20`).

### Configuration names (purpose only)
`LOG_LEVEL`, `AGI_DEV_LOG_FORMAT`, `AGI_OTEL_*`, `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_RELEASE`, `CRON_SECRET`, `CRON_DEV_BYPASS`, `AGI_DB_LOW_POWER`, `AGI_RATE_LIMIT_SCALE` (ignored in production), `AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY`, `AGI_RATE_LIMIT_CLIENT_IP_SOURCE`, `UPSTASH_REDIS_REST_URL/TOKEN` (or `KV_REST_API_*`), `PAGER_WEBHOOK_URL`, `INCIDENT_CHANNEL_WEBHOOK_URL`, `INCIDENT_OUT_OF_BAND_*`, `AGI_STATUS_MIRROR_*`, `AGI_ONCALL_*`, `AGI_SUPPORT_FALLBACK_EMAIL`, `AGI_SUPPORT_FROM_EMAIL`, `RESEND_API_KEY`, `AGI_ALLOW_INVALID_ENV`.

## Rules: access, plans, modes

### Who may call what
- Cron routes: only with `Authorization: Bearer <CRON_SECRET>`; 401 otherwise; also fail closed when no secret is set (`cron-auth.ts`). Calling one by hand is the same call the scheduler makes (`incident-response.md`).
- `api:GET /api/health` and `/status` are public. Public payloads hide component names and error text.
- `api:POST /api/telemetry/client` needs CSRF and telemetry consent; a browser that refused telemetry sends nothing (`client-failure-transport.ts` `mayReport`).

### Rate limit rules
- Production **requires** shared-store credentials: importing `rate-limit.ts` throws `SEV-WEB-13` in a production runtime without them (`rate-limit.ts:22-30`).
- Each bucket is `failClosed` true or false. When the shared store errors or times out (800 ms) a fail-closed bucket refuses with 429 and `Retry-After: 60` and a fail-open bucket admits. The deployment policy `AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY` can force either; default is fail-closed when credentials exist or in production (`redis-outage-policy.ts`). If the store's request quota is exhausted the limiter falls back to per-instance counting and sets `X-RateLimit-Degraded: shared-store-quota` (`rate-limit.ts` catch block).
- Examples [code]: `chat-message` 20 per minute fail open; `llm-completion` 30 per minute per user fail closed; `llm-completion-ip` 1500 per minute fail closed; `chat-conversation` 60 per minute; `health-check` 30 per minute; `client-telemetry` 30 per minute fail closed; `guest-chat-device` and `guest-chat-ip` per day from `GUEST_CHAT_CONFIG` fail closed; `default` 100 per minute.
- **Plan scaling:** keys in `TIER_SCALED_KEYS` (`llm-completion`, `chat-message`, `chat-conversation`, `chat-conversation-read`, `chat-conversation-list`, `image-generation`, `video-generation`, `audio-transcription`, `voice-speech`, `voice-live-session`) multiply the base limit by the plan's `maxConcurrentTurns` from `BILLING_PLAN_PRODUCT_LIMITS` in `@agiworkforce/types` (`rate-limit.ts` `resolveTierRateLimit`). Plan names and values live in that package, not here. Whether every caller passes the plan tier is [unknown].
- **Concurrent turns:** `acquireManagedTurnSlot` admits a managed turn only under the plan's concurrent limit; denial reasons are `plan-excluded`, `ceiling-reached`, `limiter-unavailable`. Slots expire after 360 s, just above the 300 s maximum chat duration (`rate-limit.ts` comment on `MANAGED_TURN_SLOT_TTL_SECONDS`; `app/api/llm/v1/chat/completions/route.ts:161` sets `maxDuration = 300`).
- A 429 body has `error.code = RATE_LIMIT_EXCEEDED`, `retry_after_seconds`, `reset_at` and an appeal path; the block is audit logged (`logRateLimitExceeded`).
- The client IP source is configurable (`x-real-ip` default, `xff-rightmost`, `xff-hop:N`) so a caller cannot dodge limits by editing `x-forwarded-for`.
- Developer API limits are tabulated in `docs/standards/api-rate-limits.md`; API-key traffic falls back to the IP bucket.

### Modes and plans
- mode:local: nothing on this page governs on-device inference. It has no server limit, quota or health check [inferred].
- mode:own-key and mode:cloud: turns that reach the hosted API are subject to the limits above. Whether the managed turn slot applies to own-key turns is [unknown].
- Free usage screens show only Upgrade, not meters [memory note, not a repository document]; the free quota gate renewal is watched by `remind-free-quota-renewal`.
- Telemetry that carries user data follows consent: product analytics SLOs read consented accounts only; client failures need consent; CLI crash reports need privacy mode `Managed` and the setting or `AGI_CRASH_REPORTS`.
- Trust boundary: health and telemetry payloads must carry no prompts or content (`log-field-policy.ts`, strict client schema).

## Differences between apps

| App | What is observed | Basis |
| --- | --- | --- |
| surface:web | Everything above: logs, traces, metrics, health, status, crons, rate limits, client failure ingest | [code] |
| surface:desktop | Electron shows the hosted web app, so server-side watching applies; the desktop bundle has its own Sentry-related code and a Sentry React dependency (`apps/desktop/package.json:93`, apps/desktop/electron/dist/main.cjs (not found) log sink); what it sends, and whether consent gates it, was not established | [code], [unknown] for behavior |
| surface:mobile | Calls the same hosted API and its limits (`mobile-*` buckets in `rate-limit.ts`, for example `mobile-push-token` 30 per minute); a mobile telemetry sender was not found in this read | [code], [unknown] |
| surface:cli | Local crash reports as JSON files, uploaded to Sentry with a 5 s timeout only when privacy mode is managed and enabled; product analytics client in `apps/cli/src/cloud/product_analytics.rs` | [code] |
| surface:vscode | Not examined for telemetry; shares the hosted API limits | [unknown] |
| surface:chrome | Not examined for telemetry; shares the hosted API limits | [unknown] |

The shared `@agiworkforce/observability` package (error reporting port, scrub step, Sentry envelope adapter) is described as shared by browser-adjacent surfaces (package.json). Which apps import it was not verified.

The `/status` page and the `surface-status.ts` map (`apps/web/lib/surface-status.ts`) are different things: the status page reports service checks; `SURFACE_STATUS` is marketing availability labels (web Available now, others Coming soon).

## Failure handling

### Error categories
User-visible errors carry a code, a class, an HTTP status, `retryable`, a suggested action and a request id (`packages/contracts/types/src/error-taxonomy.ts` `UserFacingError`). The 23 classes and their retry flag from `error-taxonomy.json`:

| Retryable | Classes |
| --- | --- |
| yes | rate_limit, provider_unavailable, timeout, network, offline, storage, database, search, tool, connector, sandbox, internal |
| no | authentication, authorization, policy, entitlement, validation, unsupported, conflict, not_found, deleted, quota, safety |

Only provider_unavailable, storage, search, tool, connector and sandbox may show the upstream's name and status; all other classes hide provider detail. `scripts/check-error-model.mjs` fails a code with no class (comment at the top of `error-taxonomy.ts`). A route error handler hides internal messages behind generic text except a safe list of codes such as `RATE_LIMIT_EXCEEDED`, `CREDIT_REQUIRED`, `SUBSCRIPTION_REQUIRED` (`apps/web/lib/error-handler.ts`).

Note: `docs/agent-context/llm-failure-taxonomy.json` (28 categories such as `error-handling-failures`, `reliability-scalability-failures`, `webhook-failures`) is **not** a runtime error list. It is a guardrail vocabulary for agents and repository checks about code defects [code: its `purpose` field]. Do not use it to classify production errors.

### Severity and response (from `incident-response.md`, matches code)
| Condition | Overall status | Action |
| --- | --- | --- |
| Database unreachable or no database URL | unhealthy, critical | Page now |
| Key-value store does not answer one read | unhealthy, critical | Page now; turns refuse |
| Harness threw or dependency hung beyond 8 s | `probe_failed`, critical, HTTP 500 | Page now |
| Stripe unreachable | degraded, warning | Billing only |
| Retrieval or embedding index missing | degraded, warning | Search over own content blind; chat unaffected |

### Where to look
1. `/status` or `api:GET /api/health` for which check fails.
2. Logs: search by `request_id` (given to the user) or `trace_id`; key messages: `Cache health check failed`, `Stripe health check failed` (field `step`: client, products.list, prices.retrieve, price.usable), `Health probe alert dispatched`, `Incident alert could NOT be delivered · no human has been told`, `Rate limit exceeded`, `Rate limit check failed, allowing request (fail-open)`.
3. Vercel cron log: an undeliverable alert returns HTTP 500 so the failed invocation shows there.
4. Neon dashboard (suspended compute, pool, region), Upstash dashboard (request quota), `status.stripe.com`.
5. Queue trouble: `evaluateJobHealth` warns when the oldest due job waited 15 min or 1 lease lapsed, and goes critical at 60 min or 5 lapsed (`slo/job-health.ts`). SQL for terminal credit settlements is in the runbook (`credit_settlement_jobs` where status is terminal).
6. Data integrity: run the reconcilers (`reconcile-credits`, `reconcile-billed-plans`, `recover-reservations`, `reconcile-provider-costs`, `purge-deleted-accounts`, `replicate-object-backups`, `drain-background-jobs`) before closing an incident; a 500 means unfinished.
7. Bad release: revert first (`docs/runbooks/release-rollback.md`, `scripts/release/rollback.mjs`); a rollback does not revert the database.

### Built-in resilience
- Health probe holds the first miss and pages on the second; detection latency is up to 20 minutes.
- `/api/health` shares one refresh among concurrent callers and refuses to call a stale result ready.
- Status page and health payloads never expose vendor errors.
- Retries are bounded (CLI crash upload: 5 s, one try; client failure post: one try) so telemetry cannot add load during an incident.
- Reapers and recoverers clean after dead turns: `reap-agent-runs`, `reap-code-turns`, `reclaim-sandboxes`, `recover-reservations` (returns held quota), `drain-background-jobs` (re-queues or dead-letters when a worker died).

## How it should work

[requirement] `AGENTS.md` section 8: horizontal scaling with bounded resources, backpressure, graceful degradation and observability; rate limits are configuration, never constants; 100,000 concurrent users is a target never to be claimed without a live run. Section 9: no silent failures. Section 6: security fails closed. `docs/runbooks/capacity-and-load-testing.md`: load tests never run against production, a failing threshold is the result, one variable per run, and a capacity figure may be promoted to the SLO catalogue only after a recorded run in `docs/research/`.

[proposed] Items worth deciding, each owned elsewhere if accepted: (1) a cross-process backpressure signal, since there is none today; (2) an alert on database connection pool exhaustion; (3) one documented place for where logs and metrics are viewed; (4) a shared, consent-gated crash and failure report path for desktop, mobile, VS Code and Chrome like the CLI and web ones; (5) instruments for the SLOs still declared without a source.

## Gaps

Implementation status (code exists and is connected) versus verification status (someone ran it):

| Item | Implemented | Verified |
| --- | --- | --- |
| 47 crons registered and tested for registration | yes, `cron-registration.test.ts` | registration shape tested; production execution not recorded here [unknown] |
| Health probe, burn alerts, dispatcher | yes | decision logic has unit tests (`health-probe/route.test.ts`, `incident/__tests__`); real delivery needs the drill in `incident-response.md`; no record of the drill being run in this repository was read [unknown] |
| OTLP export and tail sampling | yes, off unless endpoint set | tests exist (`otel-sdk.test.ts`, `trace-sampling.test.ts`); live export [unknown] |
| Capacity targets | targets only | unmeasured per `capacity-and-load-testing.md`; four dimensions have no scenario (conversation volume, connector directory size, remote-control fleet, provider fleet behavior) |
| Global backpressure | not implemented | per-conversation and per-user turn admission only; first symptom of saturation is latency |
| Database pool alert | not implemented | stated gap in the capacity runbook |
| CPU, memory, storage, CDN | platform dashboards | not in repository |
| Notifications SLO | declared, `missingInstrument` | none |
| Telemetry on desktop, mobile, VS Code, Chrome | not found in this read | [unknown] |
| Low-power mode side effects | by design | reservation recovery hourly means a stranded reservation can hold quota up to an hour; scheduled tasks can start up to an hour late |
| Rate limit table drift | `api-rate-limits.md` shows 30 per minute for completions | code scales that bucket by plan concurrency (see outdated list) |
| Log destination and dashboards | declared as data | where viewed is [unknown] |

## How to verify

Nothing here was executed by this page's author; the project folder was read only. The checks below are what the repository provides.

- Cron registration: `apps/web/app/api/cron/cron-registration.test.ts`; worker registry: `deployable-components.test.ts`; low-power windows: `apps/web/__tests__/cron-low-power-window.test.ts`.
- Health probe and alert decisions: `pnpm --filter @agiworkforce/web exec vitest run app/api/cron/health-probe lib/server/incident` (from the runbook). It does not test real delivery.
- Alert path drill (real): follow the numbered drill in `docs/runbooks/incident-response.md` on a preview deployment; expect `"alerted":true,"delivery":"delivered"` on the second call.
- SLO logic: `apps/web/lib/server/slo/__tests__/{catalogue,attainment,anomaly,job-health,degradation}.test.ts`.
- Logger: `apps/web/lib/logger.test.ts`; tracing: `apps/web/lib/observability/__tests__` and the `*.test.ts` files beside `otel-sdk.ts`, `trace-sampling.ts`, `trace-context.ts`.
- Rate limits: `apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts` pins the developer table.
- Domain events: `packages/contracts/cloud-contracts/src/__tests__/domain-events.test.ts`.
- Live: `curl` the public `api:GET /api/health` (expect 200 or 503 and `Cache-Control: no-store`); call a cron with the bearer secret (expect 401 without it).
- Load: `tools/load-test/README.md`; record results in `docs/research/` before updating the capacity table.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| 47 crons are registered in vercel.json, one per directory under apps/web/app/api/cron, and a test enforces that they match. | read in the code | `vercel.json (crons)`; `apps/web/app/api/cron/cron-registration.test.ts` |
| Every cron route requires a bearer CRON_SECRET, compared in constant time, throttled at 10 failures per minute per client, and fails closed when no secret is configured. | read in the code | `apps/web/lib/server/cron-auth.ts:12-108` |
| The health probe runs every 10 minutes, times out its checks at 8 s, and pages only on the second consecutive failure, so outage detection takes up to about 20 minutes. | read in the code | `vercel.json (health-probe */10)`; `apps/web/app/api/cron/health-probe/route.ts:21-25`; `docs/runbooks/incident-response.md` |
| Core health checks are database, environment and key-value cache; failing any means unhealthy. Stripe, chat routing, work queues, voice, search, vector and identity failing means degraded. | read in the code | `apps/web/lib/server/health-check.ts:474-500` |
| GET /api/health is public, no-store, rate limited to 30 per minute, caches results 60 s, treats results older than 120 s as stale and answers 503 for unhealthy or stale. | read in the code | `apps/web/app/api/health/route.ts:81-111`; `apps/web/lib/server/render-cache.ts:37-51`; `apps/web/lib/rate-limit.ts:202` |
| Public health payloads reduce messages to 'unavailable' or 'not configured' so component names and vendor errors do not leak. | read in the code | `apps/web/app/api/health/route.ts:23-48` |
| Burn-rate alerting: fast window 1 h at 14.4x is critical, slow window 6 h at 6x is warning, and fewer than 20 samples stays silent; evaluated at :05 and :35. | read in the code | `apps/web/lib/server/slo/attainment.ts:210-215`; `vercel.json (evaluate-slo-burn)` |
| SLOs are defined only in apps/web/lib/server/slo/catalogue.ts over a 30-day window (for example chat 99%, first token 95% within 3000 ms, completion 95% within 120000 ms, authentication 99.9%); some are declared with a missing instrument. | read in the code | `apps/web/lib/server/slo/catalogue.ts:82-185` |
| All incidents leave through one dispatcher: email to on-call (or support fallback mailbox), pager webhook, incident channel webhook, then an out-of-band webhook and status mirror if none delivered; escalation levels rise every 15 minutes by default while the condition persists. | read in the code | `apps/web/lib/server/incident/dispatch.ts:100-175`; `docs/runbooks/incident-response.md` |
| Logs use Pino with redaction; deployed runtimes force a minimum level of info, whatever LOG_LEVEL says. | read in the code | `apps/web/lib/logger.ts:12-33` |
| Every log line inside a request carries trace_id, span_id, request_id, organization_id and user_id when known. | read in the code | `apps/web/lib/observability/trace-context.ts:96-104` |
| OTLP trace and metric export is enabled only when AGI_OTEL_EXPORTER_ENDPOINT is a valid URL; default service name is agiworkforce-web. | read in the code | `apps/web/lib/observability/otel-config.ts:15-20,71-86` |
| Trace export is tail-biased: errored spans and spans over the slow threshold (default 1000 ms) are always exported; others are kept by trace-id ratio so a trace is whole. | read in the code | `apps/web/lib/observability/trace-sampling.ts:1-31`; `apps/web/lib/observability/otel-sdk.ts:55-85` |
| Sentry initialises only in production with a DSN; production boot fails on invalid environment unless AGI_ALLOW_INVALID_ENV=1. | read in the code | `apps/web/lib/sentry-shared.ts (isSentryConfigured)`; `apps/web/instrumentation.ts (register)` |
| The rate limiter has 147 named buckets; each is fail-closed or fail-open, and production throws at import if shared store credentials are missing. | read in the code | `apps/web/lib/rate-limit.ts:22-30,79` |
| Rate limit shared-store calls have an 800 ms budget; on failure fail-closed buckets answer 429 with Retry-After 60, and when store quota is exhausted the limiter counts per instance and sets X-RateLimit-Degraded. | read in the code | `apps/web/lib/rate-limit.ts:1111-1232` |
| Chat-related rate limits scale by the plan's maxConcurrentTurns for ten tier-scaled buckets; the AGI_RATE_LIMIT_SCALE override is ignored in production. | read in the code | `apps/web/lib/rate-limit.ts:925-960`; `apps/web/lib/rate-limit.ts:48-71` |
| Managed turn slots live in the key-value store with a 360 s TTL, just above the 300 s chat maxDuration, and can be denied as plan-excluded, ceiling-reached or limiter-unavailable. | read in the code | `apps/web/lib/rate-limit.ts:1330-1440`; `apps/web/app/api/llm/v1/chat/completions/route.ts:161` |
| There is no global backpressure; admission is per conversation, per user and for video, so saturation first shows as latency. | stated requirement | `docs/runbooks/capacity-and-load-testing.md` |
| All capacity targets are unmeasured; four dimensions have no load scenario, and no concurrency figure may be claimed without a recorded run. | stated requirement | `docs/runbooks/capacity-and-load-testing.md`; `AGENTS.md section 8` |
| With AGI_DB_LOW_POWER=1 crons answer {skipped: db_low_power} after minute 14 of each hour, so frequent crons effectively run hourly. | read in the code | `apps/web/lib/server/cron-low-power.ts:1-21`; `apps/web/__tests__/cron-low-power-window.test.ts` |
| Runtime error classes are 23 (authentication through internal), each with a retryable flag decided server side; only six classes may show upstream provider name and status. | read in the code | `packages/contracts/types/src/error-taxonomy.ts:17-45`; `packages/contracts/types/src/error-taxonomy.json` |
| llm-failure-taxonomy.json is a guardrail vocabulary of 28 code-defect categories for agents, not a runtime error list. | read in the code | `docs/agent-context/llm-failure-taxonomy.json (purpose, categories)` |
| Browser failure telemetry is a strict closed schema posted to /api/telemetry/client, needs CSRF, consent and a 30 per minute limit, with one attempt and a 20-report page budget. | read in the code | `apps/web/app/api/telemetry/client/route.ts`; `apps/web/lib/observability/client-failure-transport.ts:16-25` |
| CLI crash reports are stored as local JSON files (max 20) and uploaded with a 5 s timeout only when privacy mode is managed and enabled. | read in the code | `apps/cli/src/crash_reports.rs:13-48` |
| Job queue health warns at 15 minutes oldest-due age or 1 lapsed lease and goes critical at 60 minutes or 5 lapsed leases. | read in the code | `apps/web/lib/server/slo/job-health.ts:15-23` |
| Domain events: 29 catalogued durable events with data class, retention class and consumers, written once and consumed idempotently by dedupeKey. | stated requirement | `docs/standards/domain-events.md` |
| Metrics label cardinality is bounded (default 50 values, overflow label 'other') and enforced by a test. | read in the code | `apps/web/lib/observability/cardinality.ts:11-35` |

## Open questions

- Where do production logs, metrics and dashboards actually get viewed (log drain, OTLP backend, Sentry project)? The repository declares dashboards as data but names no backend.
- Is AGI_DB_LOW_POWER=1 currently set in Production? It changes real cadence for 15 and 30 minute crons.
- Has the alert-path drill in incident-response.md been run recently, and is PAGER_WEBHOOK_URL set in production? No record found.
- Which apps other than web and CLI send crash or failure telemetry (desktop, mobile, VS Code, Chrome), and is each consent gated?
- Do all callers pass the plan tier to the limiter, so the tier scaling applies to every chat route, and does the managed turn slot apply to mode:own-key turns?
- What is the intended public availability commitment: the status page and SLO catalogue state objectives, but capacity and availability are unmeasured in a recorded run.
- Should there be a global backpressure mechanism and a database pool alert, or is the current latency-first behavior accepted?
- Observability of mode:local on-device inference is not defined anywhere found; product choice whether any local health or diagnostics are collected.

## Project documents found out of date

- `docs/runbooks/incident-response.md`: The 'Where the alert lands' section lists three channels (email, pager, incident channel) and says an undeliverable alert is when none reached anyone. It does not mention the fourth, out-of-band webhook and status mirror fallback, and the detector table does not say evaluate-slo-burn also evaluates cost and latency anomalies. The code says: dispatch.ts tries the out-of-band webhook and writes a status mirror when no channel delivered, and counts a paged out-of-band alert as delivered; evaluate-slo-burn also runs evaluateAnomalies. (apps/web/lib/server/incident/dispatch.ts:140-175; apps/web/app/api/cron/evaluate-slo-burn/route.ts:16-21,116)
- `docs/runbooks/capacity-and-load-testing.md`: Says admission is per conversation (plus video) with nothing else, and lists streaming admission only as conversation-turn-admission.ts. The code says: There is also a per-user managed concurrent turn ceiling by plan (acquireManagedTurnSlot, with denials plan-excluded, ceiling-reached, limiter-unavailable) and tier-scaled rate limits. Still no process-wide backpressure, so the main conclusion holds. (apps/web/lib/rate-limit.ts:925-960,1330-1440)
- `docs/standards/api-rate-limits.md`: Shows POST /chat/completions as a flat 30 requests per minute per user and /embeddings as 60. The code says: llm-completion and chat-conversation (used by embeddings) are in TIER_SCALED_KEYS, so the effective limit is the base multiplied by the plan's concurrent turns when a plan tier is passed. The base values (30, 60, 1500, default 100) match. (apps/web/lib/rate-limit.ts:354-362,925-960; apps/web/app/api/llm/v1/embeddings/route.ts:126)
- `docs/agent-context/llm-failure-taxonomy.json`: Not outdated, but easy to misread: the brief for this subject names it as an error-category source. The code says: It is a development guardrail vocabulary (purpose field). Runtime error categories are in packages/contracts/types/src/error-taxonomy.json. (docs/agent-context/llm-failure-taxonomy.json (purpose); packages/contracts/types/src/error-taxonomy.ts:17-41)
