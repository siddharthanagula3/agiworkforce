---
id: "ENG-monitoring"
type: "engineering"
title: "Monitoring"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Monitoring

Monitoring covers the web app only in depth. Production emits structured pino logs with trace and request ids, OpenTelemetry metrics and spans, and optional Sentry errors. Vercel crons probe health every 10 minutes and burn-rate alerts every 30. Alerts go through one dispatcher by email, pager and channel. Read a request by its x-request-id. Desktop, mobile, CLI and extension have only crash or error reporting.

## Purpose

This page says what the AGI Workforce platform watches, where each signal lands, and how to follow one production request through logs and traces. Almost all of it lives in `surface:web` (the Next.js app in `apps/web`), which also serves the Desktop window and backs the phone, CLI and extensions.

**Implementation status vs verification status.** Everything below that is tagged [code] is present in the repository. None of it is recorded as executed against production in any document I read. The incident runbook describes an alert drill but records no result of one [unknown]. Capacity numbers are all marked unmeasured in `docs/runbooks/capacity-and-load-testing.md` [requirement].

### The signals at a glance

| Signal | What it is | Where it lands | Basis |
| --- | --- | --- | --- |
| Structured logs | JSON lines from pino, with `trace_id`, `span_id`, `request_id`, `user_id`, `organization_id`, plus `service`, `version`, `region`, `deploy_env` | Process stdout, which the host (Vercel) collects | [code] (apps/web/lib/logger.ts:55-83; apps/web/lib/observability/trace-context.ts:93-102) |
| Span log lines | One `span` log line per HTTP request with duration, status, method, path | Same log stream | [code] (apps/web/lib/error-handler.ts:~320, the `logger.info({event:'span'...})` call) |
| Metrics | OpenTelemetry counters, histograms and gauges named `agi.*`, `http.server.*`, `db.client.*` | OTLP collector, only when `AGI_OTEL_EXPORTER_ENDPOINT` is set | [code] (apps/web/lib/observability/metrics.ts:17-62; otel-config.ts:15-17) |
| Traces | Spans bridged to OpenTelemetry, exported to the collector and to Sentry | Collector and Sentry, tail-kept (errors, slow spans, or a sampled ratio) | [code] (apps/web/lib/observability/trace-sampling.ts:25-31; instrumentation.ts) |
| Errors | Sentry events, with release, environment and organization tag | Sentry, only in a production build with a DSN | [code] (apps/web/lib/sentry-shared.ts:19-25) |
| Health | `/api/health` and `/status`, same checks | Public, on request | [code] (apps/web/app/api/health/route.ts) |
| Alerts | Probe, SLO burn, security anomaly, credit and quota crons | Email, pager webhook, incident channel webhook | [code] (apps/web/lib/server/incident/dispatch.ts) and [requirement] (docs/runbooks/incident-response.md) |
| Domain events | Durable, immutable business events (audit log, SIEM feed, read models) | Database audit trail and listed consumers | [requirement] (docs/standards/domain-events.md) |
| Client failures | Counted failure classes from the browser, no content | `api:POST /api/telemetry/client`, which records a metric | [code] (apps/web/app/api/telemetry/client/route.ts) |

## Procedure

### A. Read one production request (web)

1. **Get the request id.** Every API route wrapped in `withErrorHandler` sets response headers `x-request-id` and `traceparent` [code] (apps/web/lib/error-handler.ts:344-346). The header name is `x-request-id` [code] (packages/contracts/cloud-contracts/src/header-names.ts:11). A caller may send its own id. It is kept only if `isWellFormedRequestId` accepts it. Otherwise the server uses the 32-hex trace id [code] (apps/web/lib/error-handler.ts:246-250).
2. **Search the logs for it.** Every log line written inside the request carries `request_id` and `trace_id` through the pino `mixin` [code] (apps/web/lib/logger.ts:50; trace-context.ts:93-102). Filter the host's function logs by `request_id`.
3. **Find the span line.** Look for the line with `event: "span"`, `span_name` of the HTTP server span, `duration_ms`, `status` and `http.response.status_code` [code] (apps/web/lib/error-handler.ts, span log call). Its `parent_span_id` is the caller's span if a `traceparent` came in.
4. **Open the trace** in Sentry by `trace_id`, or in the OTLP backend, if either is configured. If neither is configured, the logs are the only record [inferred] from the opt-in config above.
5. **Check the release.** Log lines carry `version` (commit SHA), `region` and `deploy_env` [code] (apps/web/lib/logger.ts:36-46). Sentry events carry release and environment from the same variables [code] (apps/web/lib/sentry-shared.ts:42-63).

**Reading Vercel request logs from outside the dashboard.** The owner's working notes describe an HTTP call to the Vercel request-logs API with a CLI token, 50 rows per call, filtered by `requestPath` [unknown to the repo]. No document in the repository states this. Only the private memory note does, so treat it as unverified here.

### B. Follow a request across a queue

When work is handed to a background job, the trace carrier holds `traceparent` and the request id so the worker log line joins the original request [code] (apps/web/lib/observability/trace-propagation.ts:10-58).

### C. React to an alert

1. An alert mail, pager call or channel post arrives from `apps/web/lib/server/incident/dispatch.ts` [code].
2. Match the subject to the triage section in `docs/runbooks/incident-response.md` (database, cache, search, vector, environment, stripe, probe_failed, credit settlement drift) [requirement].
3. For a cache fault, read the log line `Cache health check failed`. For Stripe, read `Stripe health check failed` and its `step` field [requirement] (incident-response.md triage sections).
4. If the cause is the release, roll back first (`docs/runbooks/release-rollback.md`).
5. Before calling a data incident resolved, run each reconciler cron that applies and require a non-500 answer [requirement] (incident-response.md, Data integrity section).

### D. Check live status without logs

- `/status` shows the same checks to a signed-out person [code] (apps/web/app/status/page.tsx).
- `/operator` has tabs `services`, `dashboards`, `routing`, `jobs` and `costs` for platform operators [requirement] (docs/runbooks/admin-surfaces.md, section on `/operator`). The dashboard panels come from `SERVICE_DASHBOARDS` [code] (apps/web/lib/observability/dashboards.ts:33).
- `api:GET /api/admin/observability` returns route and cache breakdowns by `route`, `model`, `user` or `tenant` for a platform admin [code] (apps/web/app/api/admin/observability/route.ts:10-45).

## Commands

| Purpose | Command or call | Notes and basis |
| --- | --- | --- |
| Run a cron by hand (health probe, reconcilers) | `curl -i -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/<name>` | The route fails closed with 401 when the secret is missing or wrong. HTTP 500 means it did not finish. [requirement] (docs/runbooks/incident-response.md); [code] (apps/web/lib/server/cron-auth.ts) |
| Alert path drill on a preview | Remove `DATABASE_URL` and `AGI_DATABASE_URL` from the preview, call the probe twice, expect `"alerted":true,"delivery":"delivered"` | [requirement] (incident-response.md, drill section). Not recorded as run [unknown]. |
| Local alert logic test | `pnpm --filter @agiworkforce/web exec vitest run app/api/cron/health-probe lib/server/incident` | Covers decision logic, not real delivery. [requirement] |
| Log redaction guard | `pnpm check:log-redaction` | Runs `scripts/check-log-redaction.mjs`, inside the guard chain. [code] (package.json:310) |
| LLM log hygiene guard | `pnpm check:llm-log-hygiene` | In the guard chain `check:llm-operability`. [code] (package.json:397) |
| Route observability guard | `scripts/check-route-observability.mjs` | Script exists. Its package script name I did not confirm [unknown]. |
| Desktop telemetry domain guard | `pnpm check:desktop-telemetry-domains` | Fails a telemetry domain with no production call site. [code] (scripts/check-desktop-telemetry-domains.mjs:1-8; package.json guard chain) |
| Load test | `AGI_LOAD_BASE_URL=... AGI_LOAD_TOKEN=... k6 run tools/load-test/search.js` | Never against production. No default target. [requirement] (tools/load-test/README.md) |
| Web tests for observability | `pnpm --filter @agiworkforce/web exec vitest run lib/observability` | Run from the web package, not the root binary. [requirement] (AGENTS.md section 12) |

A local dev server pretty-prints logs. Set `AGI_DEV_LOG_FORMAT=json` for JSON [code] (apps/web/lib/logger.ts:9,35-39).

## Rules and traps

### Logging

- **Deployed log level has a floor of `info`.** `LOG_LEVEL=debug` or `trace` is ignored outside development, because those levels carry bodies and prompts that redaction only masks by key [code] (apps/web/lib/logger.ts:19-33). So you cannot turn on debug logs in production to chase a bug.
- **Logs are redacted twice.** String arguments pass through `redactSecrets`, and the record passes through `redactLogRecord` [code] (apps/web/lib/logger.ts:55-66). Field names such as `prompt`, `body`, `email`, `token`, `payload`, `text`, `query` are denied by final segment [code] (apps/web/lib/observability/log-field-policy.ts:6-35). Do not look for prompts or message text in logs. They are deliberately absent.
- **Health messages are scrubbed on purpose.** The public `/api/health` answers `unavailable` for a failed check and counts what it cannot name, so the payload shows no host, key or vendor text. The reason is only in the log line [code] (apps/web/app/api/health/route.ts:24-45) and [requirement] (incident-response.md, cache triage).
- **Only web routes wrapped in `withErrorHandler` get the request id header and the span line.** A route that does not use it has neither [inferred] from apps/web/lib/error-handler.ts.

### Tracing and metrics

- **No collector, no export.** With `AGI_OTEL_EXPORTER_ENDPOINT` unset, no SDK starts and no span leaves the process. The pino span lines are unchanged [code] (apps/web/.env.example:~730 comment; otel-config.ts:resolveOtelExportConfig returns null).
- **Sentry runs only in production builds with a DSN.** Preview builds also have `NODE_ENV=production`, so the environment tag comes from `VERCEL_ENV` first [code] (apps/web/lib/sentry-shared.ts:22-25,52-63).
- **Tail sampling.** Errored spans and spans at or above the slow threshold (default 1000 ms, `AGI_OTEL_SLOW_SPAN_MS`) are always kept. The rest are kept by trace-id ratio (`AGI_OTEL_SAMPLE_RATIO`) [code] (apps/web/lib/observability/trace-sampling.ts).
- **Metric labels are bounded.** `boundAttributes` caps cardinality, and request labels use closed sets (surface, client version, API version, else `unknown` or `unsupported`) [code] (apps/web/lib/observability/request-labels.ts; cardinality.ts).
- **Metric names are restated in two files** for media, and a test fails if they differ [code] (apps/web/lib/observability/metrics.ts comment; test:apps/web/lib/observability/metrics.media-names.test.ts).

### Alerting

- **Detection latency is up to 20 minutes.** The probe runs every 10 minutes and pages only on the second consecutive miss [requirement] (incident-response.md) and [code] (apps/web/app/api/cron/health-probe/route.ts:~20-25, `CONSECUTIVE_FAILURES_BEFORE_PAGE = 2`).
- **An undelivered alert is an HTTP 500.** When no channel reached anyone, the probe returns 500 so the Vercel cron log shows it [requirement] (incident-response.md). Check the cron log after any env var change.
- **Email needs both `RESEND_API_KEY` and a valid `AGI_SUPPORT_FROM_EMAIL`.** Pager needs `PAGER_WEBHOOK_URL`. Channel needs `INCIDENT_CHANNEL_WEBHOOK_URL` [requirement] (incident-response.md).
- **Escalation level lives in the key-value store** under `agi-incident:<key>` for six hours. With no store, every alert is level 1 [requirement].
- **Degraded is not unhealthy.** Stripe or retrieval outages are `WARNING`/`degraded`. Database, cache, `probe_failed` are `CRITICAL` [requirement] (incident-response.md, Severity table).
- **Low-power mode delays crons.** With `AGI_DB_LOW_POWER=1`, crons that run more than once an hour do work only in the first 15 UTC minutes of each hour and otherwise answer `{"skipped":"db_low_power"}`. The health probe calls this skip, so in that mode probing is hourly, not every 10 minutes [code] (apps/web/lib/server/cron-low-power.ts:5-19; health-probe/route.ts:196-197) and [requirement] (capacity-and-load-testing.md). The `.env.example` default is `0` [code] (apps/web/.env.example:31). Whether production has it on is [unknown].
- **SLO alerts stay silent under 20 samples.** Fast burn: 1 hour window, rate 14.4, critical. Slow burn: 6 hour window, rate 6, warning [code] (apps/web/lib/server/slo/attainment.ts:211-215). Objectives exist only in `apps/web/lib/server/slo/catalogue.ts`. Some objectives have no source yet and say what instrument is missing [code] (catalogue.ts:SloDefinition.missingInstrument).
- **SLO analytics need consent.** Some indicators read `product_analytics_events`, so accounts that refused the analytics purpose are absent [code] (catalogue.ts:ANALYTICS_COVERAGE). Client failure ingest also needs telemetry consent [code] (apps/web/lib/observability/client-failure-transport.ts:29-31; telemetry/client/route.ts imports readServerTelemetryConsent).
- **No global backpressure and no database-pool alert.** Saturation first shows as latency [requirement] (capacity-and-load-testing.md).

### Other apps

| Surface | What is monitored | Basis |
| --- | --- | --- |
| surface:cli | Opt-in crash reports with a release DSN baked at build time (`AGI_CLI_SENTRY_DSN`), disabled unless privacy mode is Managed, controlled by `AGI_CRASH_REPORTS` or config; reports hold version, OS, arch, panic location | [code] (apps/cli/src/crash_reports.rs:14-47) |
| surface:chrome | Error reporting client over a Sentry fetch adapter, gated on a consent snapshot, DSN from `VITE_SENTRY_DSN` | [code] (apps/extension/src/features/observability/errorReporting.ts:1-26) |
| surface:desktop | A telemetry service with a closed list of domains, `DESKTOP_TELEMETRY_DOMAINS`, emitted through `recordDesktopEvent` | [code] (scripts/check-desktop-telemetry-domains.mjs:14-18). The public Desktop shows the hosted web app, so web monitoring covers its server calls [requirement] (AGENTS.md section 5) |
| surface:mobile | Not established. I found no Sentry or crash module under apps/mobile/lib or services | [unknown] |
| surface:vscode | Not examined; the web request labels treat `vscode` as a surface | [code] (request-labels.ts:VSCODE_SURFACE); monitoring itself [unknown] |

Local mode (`mode:local`) work stays on the device, so server logs do not see it. Server monitoring sees `mode:cloud` traffic, and `mode:own-key` traffic only where it goes through our servers [inferred].

## Where the canonical document is

| Question | Owner |
| --- | --- |
| What detects an outage, who gets paged, triage by check, reconcilers, postmortem rules | `docs/runbooks/incident-response.md` |
| Capacity targets, which numbers are measured, low-power mode, load-test rules | `docs/runbooks/capacity-and-load-testing.md` and `tools/load-test/README.md` |
| Service level objectives (the only place an objective may be stated) | `apps/web/lib/server/slo/catalogue.ts` |
| Burn windows and sample floor | `apps/web/lib/server/slo/attainment.ts` |
| Where an incident goes | `apps/web/lib/server/incident/dispatch.ts`, `on-call.ts`, `pager.ts` |
| Cron schedules (47 entries) | `vercel.json`, key `crons` [code] |
| Log setup and levels | `apps/web/lib/logger.ts` |
| Which field names are secret | `apps/web/lib/observability/log-field-policy.ts` |
| Metric names | `apps/web/lib/observability/metrics.ts` (`METRIC_NAME`) |
| Dashboards shown to operators | `apps/web/lib/observability/dashboards.ts` |
| OpenTelemetry config names | `apps/web/lib/observability/otel-config.ts` |
| Sentry config | `apps/web/lib/sentry-shared.ts`, `apps/web/instrumentation.ts`, `apps/web/.env.example` |
| Durable business events | `docs/standards/domain-events.md`, pinned by `packages/contracts/cloud-contracts/src/__tests__/domain-events.test.ts` |
| Health checks | `apps/web/lib/server/health-check.ts` |
| Operator panels | `docs/runbooks/admin-surfaces.md` |
| Related pages | SYS-chat-turn-pipeline for the turn path that emits turn metrics; other pages for subscription and usage accounting [unknown ids] |

## Gaps in the documents

- **No document teaches reading production logs.** The incident runbook names log lines and the Vercel cron log but gives no command, no log-query recipe and no field list. This page rebuilds it from code. The Vercel request-logs API recipe exists only in private owner notes, not in the repository [unknown].
- **No document describes the request id contract.** `x-request-id`, how a caller's id is accepted and how it joins logs are only in code (`error-handler.ts`, `trace-context.ts`).
- **No document lists the `agi.*` metrics or says where they are viewed.** Which backend receives OTLP in production is not in the repository [unknown]. Whether Sentry or a collector is configured in production is [unknown].
- **The incident runbook table lists five detectors, but more crons exist.** Examples are `drain-background-jobs`, `reap-agent-runs`, `evaluate-model-rollout` and `recover-reservations` in `vercel.json`. They are mentioned in the reconciler table only in part.
- **Mobile and VS Code monitoring are undocumented** and I did not find code for mobile [unknown].
- **No recorded run of the alert drill, load tests or SLO alert** appears in `docs/research/` that I read [unknown].
- **Database pool saturation, CPU, memory, object storage and CDN have no alert in the repository** [requirement] (capacity-and-load-testing.md).
- **`docs/standards/domain-events.md` is about durable events, not operational monitoring.** It does not say how an event relates to logs or traces. Its table has 29 event rows [code] by my count of the table (39 matches for lines starting with a backtick include other tables, so I did not use that figure).

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Web logs are pino JSON lines carrying trace_id, span_id, request_id, user_id, organization_id, plus service, version (commit SHA), region and deploy_env. | read in the code | `apps/web/lib/logger.ts:36-83`; `apps/web/lib/observability/trace-context.ts:93-102` |
| A deployed runtime refuses log levels below info, so LOG_LEVEL=debug or trace has no effect in production. | read in the code | `apps/web/lib/logger.ts:12-33` |
| Log records and string args are redacted; field names such as prompt, body, email, token, payload, text and query are denied. | read in the code | `apps/web/lib/logger.ts:55-66`; `apps/web/lib/observability/log-field-policy.ts:6-35` |
| The request id header is x-request-id. A caller's id is honored only if well formed, else the server uses the trace id. | read in the code | `packages/contracts/cloud-contracts/src/header-names.ts:11`; `apps/web/lib/error-handler.ts:246-250` |
| Routes wrapped in withErrorHandler return x-request-id and traceparent headers and write one span log line per request with duration, status, method and path. | read in the code | `apps/web/lib/error-handler.ts:240-350` |
| OpenTelemetry export is off unless AGI_OTEL_EXPORTER_ENDPOINT is set to a valid URL; related names are AGI_OTEL_SERVICE_NAME, AGI_OTEL_HEADERS, AGI_OTEL_SAMPLE_RATIO, AGI_OTEL_SLOW_SPAN_MS. | read in the code | `apps/web/lib/observability/otel-config.ts:15-20,70-85` |
| Trace export keeps every errored span and every span at or above the slow threshold (default 1000 ms), and the rest by trace-id ratio. | read in the code | `apps/web/lib/observability/trace-sampling.ts:1,25-31` |
| Sentry is on only when NODE_ENV is production and a DSN is set; environment tag prefers VERCEL_ENV; release is the commit SHA. | read in the code | `apps/web/lib/sentry-shared.ts:19-63` |
| Metric instruments are named under agi.*, http.server.request.*, db.client.operation.*; turn metrics include time to first token, duration, cost and retries. | read in the code | `apps/web/lib/observability/metrics.ts:17-62` |
| vercel.json defines 47 cron jobs; health-probe runs every 10 minutes and evaluate-slo-burn at :05 and :35. | read in the code | `vercel.json crons` |
| The health probe pages only after 2 consecutive failing runs, runs the same checks directly (no self-HTTP call), times out at 8 seconds, and returns HTTP 500 when no channel reached a human. | read in the code | `apps/web/app/api/cron/health-probe/route.ts:16-35,190-215`; `docs/runbooks/incident-response.md` |
| All alerts go through apps/web/lib/server/incident/dispatch.ts to email (Resend), a pager webhook (PAGER_WEBHOOK_URL) and an incident channel webhook (INCIDENT_CHANNEL_WEBHOOK_URL). | stated requirement | `docs/runbooks/incident-response.md, Where the alert lands` |
| On-call rotation is configuration: AGI_ONCALL_ROTATION, AGI_ONCALL_ROTATION_START, AGI_ONCALL_SHIFT_HOURS (default 168), AGI_ONCALL_ESCALATE_AFTER_MINUTES (default 15). | stated requirement | `docs/runbooks/incident-response.md, On-call rotation` |
| SLO burn alerts use a fast window (1 h, rate 14.4, critical) and a slow window (6 h, rate 6, warning) and stay silent under 20 samples. | read in the code | `apps/web/lib/server/slo/attainment.ts:199-215` |
| Service level objectives are stated only in apps/web/lib/server/slo/catalogue.ts; some have no source and name the missing instrument. | read in the code | `apps/web/lib/server/slo/catalogue.ts:1-80`; `docs/runbooks/capacity-and-load-testing.md` |
| Public /api/health reduces failed-check text to 'unavailable' and counts dependencies; detail is only in the server log line. | read in the code | `apps/web/app/api/health/route.ts:24-90`; `docs/runbooks/incident-response.md` |
| AGI_DB_LOW_POWER=1 restricts multi-per-hour crons, including the health probe, to the first 15 UTC minutes of each hour; .env.example default is 0; production value unknown. | read in the code | `apps/web/lib/server/cron-low-power.ts:5-19`; `apps/web/app/api/cron/health-probe/route.ts:196-197`; `apps/web/.env.example:31` |
| All capacity dimensions are marked unmeasured; no capacity figure is proven. | stated requirement | `docs/runbooks/capacity-and-load-testing.md, targets table`; `AGENTS.md section 8` |
| Client failure classes are ingested at POST /api/telemetry/client with a strict schema (no free text), CSRF, a rate limit and a consent check. | read in the code | `apps/web/app/api/telemetry/client/route.ts:16-60`; `apps/web/lib/observability/client-failure-transport.ts:12-31` |
| Platform admins can read route and cache breakdowns by route, model, user or tenant at GET /api/admin/observability. | read in the code | `apps/web/app/api/admin/observability/route.ts:10-62` |
| The /operator page has tabs services, dashboards, routing, jobs, costs among eighteen. | stated requirement | `docs/runbooks/admin-surfaces.md, What is on /operator` |
| CLI crash reports are opt-in, disabled unless privacy mode is Managed, and use a release DSN baked at build time. | read in the code | `apps/cli/src/crash_reports.rs:14-47` |
| The Chrome extension reports errors through a Sentry fetch adapter gated on a consent snapshot. | read in the code | `apps/extension/src/features/observability/errorReporting.ts:1-26` |
| Domain events are durable immutable records with correlationId and causationId, retention and data class set by the catalogue, and a closed list of consumers (audit-log, siem-export, product-analytics, notifications, read-model). | stated requirement | `docs/standards/domain-events.md` |
| Trace context and request id are carried into queued jobs so a worker log line joins the original request. | read in the code | `apps/web/lib/observability/trace-propagation.ts:10-58` |
| Cron routes authenticate with CRON_SECRET (minimum 32 characters) and answer 401 when absent. | read in the code | `apps/web/lib/server/cron-auth.ts:19,64`; `docs/runbooks/incident-response.md drill` |
| Guards check logging hygiene: check:log-redaction, check:llm-log-hygiene and check:desktop-telemetry-domains are in the guard chain. | read in the code | `package.json:310,397` |

## Open questions

- Which backend receives OTLP metrics and traces in production, and is AGI_OTEL_EXPORTER_ENDPOINT set there? Not in the repository.
- Is a Sentry DSN set in production, and who reads it?
- Is AGI_DB_LOW_POWER=1 set in production? If so, health probing is hourly, not every 10 minutes.
- Has the alert-path drill ever been run, and where is the result recorded?
- What does the mobile app report for errors or crashes? No module found under apps/mobile/lib or services.
- How does the VS Code extension report errors?
- Where is the supported way to read Vercel request logs documented? Only a private owner note describes the API call.
- Is the package script name for scripts/check-route-observability.mjs defined?
- Product choice left open: whether to alert on database pool saturation, CPU, memory and storage, which the capacity runbook says are not alerted.
- Which routes are not wrapped in withErrorHandler, and so lack request id headers and span lines? I did not enumerate them.
