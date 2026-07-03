# AGI Runtime — Volume 29 — Observability

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; `apps/desktop/AGENTS.md` (nearest surface AGENTS.md — the desktop host owns most runtime telemetry). Grounded in real repo paths: `services/signaling-server/src/{logger,metrics,index}.ts`; `apps/desktop/src-tauri/src/sys/telemetry/{tracing,logging,metrics,correlation,redaction,analytics_metrics,collector,mod}.rs`; `apps/desktop/src-tauri/src/sys/commands/error_reporting.rs`; `apps/desktop/src-tauri/src/lib.rs` (panic hook); `apps/web/app/api/control-plane/status/route.ts`; `crates/agiworkforce-task-runtime/src/lib.rs`; `crates/agiworkforce-app-server/src/lib.rs`; `crates/agiworkforce-plugin-runtime/src/lib.rs`.

## Overview & stance

Observability for AGI Runtime — the internal shared execution layer, not a seventh product — must be honest about a fractured reality: the Desktop host and the `signaling-server` relay each have real, independent telemetry, while the shared crates (`task-runtime`, `app-server`, `plugin-runtime`) have little or none. There is **no monolithic runtime daemon** and therefore no single pane of glass today; this volume defines the target that stitches the real parts together and labels every gap `🔭`.

Trust modes shape every requirement. **Local** telemetry stays on-device by default and is redacted before it touches disk (`redaction.rs` strips `sk-`, `Bearer`, and `ghp_` tokens). **BYOK** keys and Local chat content must never leave the host inside a log line, metric label, crash frame, or trace — crash upload is opt-in and off by default. **Managed Cloud** telemetry (the signaling relay) is aggregate and non-content: counts, memory, uptime, never payloads. Remote-control observability counts control verbs (`approval_request/response`, `dispatch`, `sync`, `heartbeat`, `cancel`) but must not log the payloads flowing over the outbound-only window, because the session keeps running locally on the host.

## Logging — runtime logs

Structured, level-controlled, redaction-first logs per component with a shared field schema (`ts`, `level`, `surface`, `correlationId`, `event`).

- ✅ Built — signaling relay uses `pino` structured logging (`services/signaling-server/src/logger.ts`): JSON in production, pretty in dev, `LOG_LEVEL`/`NODE_ENV`-driven levels, child loggers, and short correlation IDs.
- ✅ Built — Desktop host emits JSON file logs plus a compact stdout layer via `tracing_subscriber` with `EnvFilter`, non-blocking appender, and daily rotation capped at 7 files (`apps/desktop/src-tauri/src/sys/telemetry/tracing.rs`, `logging.rs`); all file output passes through `RedactingWriter`.
- 🟡 Partial — the shared crates log ad hoc with `eprintln!` and no levels/correlation (`crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-plugin-runtime/src/lib.rs`); gap: no structured logger, no redaction, not aggregatable.
- 🔭 Planned — a unified runtime log schema across all six surfaces and the crates; `crates/agiworkforce-task-runtime/src/lib.rs` emits **no** logs today and must gain structured, redacted, correlation-tagged logging.

## Diagnostics — runtime diagnostics

Fast, authenticated health and self-check surfaces that report component liveness without leaking content.

- ✅ Built — signaling `GET /health` returns uptime, connection count, and memory (`services/signaling-server/src/index.ts`, wired to `metrics.ts`).
- 🟡 Partial — the web control-plane status endpoint aggregates surface heartbeats, agent-task counts, provider probes, and a recent-activity feed (`apps/web/app/api/control-plane/status/route.ts`); gap: the `surface_heartbeats`, `agent_tasks`, and `surface_activity_log` tables **do not exist yet**, so every query is wrapped in a catch that degrades to `unknown`/zeros, and provider "health" is a coarse `HEAD` probe of vendor homepages.
- 🔭 Planned — an `agi doctor`-style self-diagnostic for the crates and the Desktop `127.0.0.1` WS/IPC host (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`) and the `app-server`; neither exposes a health endpoint. Cross-surface presence stays `🔭` until `surface_heartbeats` is created.

## Metrics — collect runtime metrics

Counters, gauges, and latency aggregates per component, exportable to a scrape target, with non-content labels only.

- ✅ Built — signaling `MetricsCollector` (`services/signaling-server/src/metrics.ts`) exports Prometheus text and JSON: connections, active sessions, messages-by-type, errors-by-type, pairing success/failure, uptime, and memory; the `/metrics` endpoint is admin-authenticated and rate-limited (`index.ts`).
- ✅ Built — Desktop in-memory `MetricsCollector` records per-operation durations via `OperationMetrics` and a scoped `Timer` (`apps/desktop/src-tauri/src/sys/telemetry/metrics.rs`), with product counters in `analytics_metrics.rs`.
- 🔭 Planned — no metrics originate from `task-runtime`, `app-server`, or `plugin-runtime`; there is no OTLP/OpenTelemetry export and no unified cross-surface metrics pipeline. Desktop metrics are process-local and never leave the device unless the user opts in.

## Tracing — trace execution

Correlation-ID propagation now, distributed spans as the target, so a dispatch can be followed phone → relay → host → crate.

- ✅ Built — Desktop provides thread-local correlation IDs via `CorrelationGuard` and `with_correlation_id` (`apps/desktop/src-tauri/src/sys/telemetry/correlation.rs`) plus `tracing` spans with thread/file/line context (`tracing.rs`).
- ✅ Built — signaling generates per-request correlation IDs and binds them to child loggers (`services/signaling-server/src/logger.ts`, used throughout `index.ts`).
- 🔭 Planned — distributed trace propagation (W3C `traceparent`) across the pairing/dispatch fabric — signaling relay → Desktop host → crates — is not built. Correlation IDs are per-process and are **not** carried on the control verbs, so an end-to-end remote-control trace cannot be reconstructed. Spans are not exported to any tracing backend. CLI and VS Code remote attach are `🔭`, so their trace edges do not exist yet.

## Crash Reporting — capture failures

Capture panics/uncaught failures with symbolication, opt-in upload, and strict content redaction across the trust boundary.

- ✅ Built — Desktop installs a global panic hook that records location and message via `tracing::error!` and stderr (`apps/desktop/src-tauri/src/lib.rs`, `std::panic::set_hook`).
- 🟡 Partial — Sentry crash reporting is feature-gated `#[cfg(feature = "sentry")]` and **off by default** (`apps/desktop/src-tauri/src/sys/telemetry/tracing.rs` `init_sentry`, `mod.rs` `initialize_sentry_if_configured`, reading `SENTRY_DSN` + environment); the `error_report` command posts an `ErrorReport` to the Sentry store API only when `SENTRY_DSN` is set (`apps/desktop/src-tauri/src/sys/commands/error_reporting.rs`). Gap: opt-in path, no minidump/symbolication pipeline, and redaction of `stack_trace`/`context` must be enforced before upload.
- 🔭 Planned — no crash capture for the crates or the signaling relay beyond process exit (`app-server` only `eprintln!`s on WebSocket send error); no cross-surface crash correlation.

## Repository map

- `services/signaling-server/src/logger.ts`, `metrics.ts`, `index.ts` — relay logging, Prometheus/JSON metrics, `/health` + `/metrics`.
- `apps/desktop/src-tauri/src/sys/telemetry/` — `tracing.rs`, `logging.rs`, `metrics.rs`, `correlation.rs`, `redaction.rs`, `analytics_metrics.rs`, `collector.rs`, `mod.rs`.
- `apps/desktop/src-tauri/src/sys/commands/error_reporting.rs` — `error_report` command → Sentry store API.
- `apps/desktop/src-tauri/src/lib.rs` — panic hook, telemetry init guard.
- `apps/web/app/api/control-plane/status/route.ts` — cross-surface status aggregation (tables `🔭`).
- `crates/agiworkforce-task-runtime/src/lib.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-plugin-runtime/src/lib.rs` — runtime cores needing structured telemetry.

## Competitor notes

Claude Code, ChatGPT, and Codex centralize telemetry in the vendor cloud: crash and usage data flow to first-party pipelines by default, and a remote-control session is observed from the vendor's dashboards. AGI diverges deliberately. Because trust is per-surface and local-first, observability is **local by default**: on-device logs (redacted, rotated) and in-process metrics never leave the host unless the user opts in. Managed Cloud telemetry is aggregate and content-free. Multi-provider and BYOK mean provider health is probed generically and provider keys are scrubbed before any log/metric/crash frame is written. Remote control is a window over a locally-running session, so its telemetry counts events without exfiltrating payloads — the opposite of a cloud-observed session.

## Acceptance / Definition of Done

Production-ready when every runtime component emits structured, redacted, correlation-tagged logs to a shared schema; metrics from the crates flow to a scrape target; a distributed trace can follow one remote-control dispatch end to end; crash upload is opt-in with enforced redaction; and the control-plane status endpoint reads real heartbeat tables instead of degrading silently.

- [ ] Build: `task-runtime`/`app-server`/`plugin-runtime` emit structured logs + metrics; `surface_heartbeats` migration lands; `/health` exists on the Desktop WS host.
- [ ] Trust: no Local content, BYOK key, or provider secret appears in any log, metric label, span, or crash frame; crash upload defaults off; cloud metrics remain aggregate.
- [ ] Security: `RedactingWriter` (and an equivalent for crash payloads) is verified against `sk-`, `Bearer`, and `ghp_` patterns; `/metrics` stays admin-authed and rate-limited.

## Anti-patterns

- Inventing a single monolithic "runtime daemon" telemetry service — the repo has none; assemble the real parts.
- Shipping Local chat content or BYOK provider keys into Sentry, signaling metrics, or cloud logs; enabling crash upload by default.
- Silently routing Local/BYOK telemetry to Managed Cloud, or logging remote-control payloads that cross the outbound-only window.
- Claiming `surface_heartbeats`/presence or distributed tracing as shipped — they are `🔭`.
- Hardcoding or inventing model IDs in provider-health labels (read `packages/types/src/models.json`); referencing Supabase; or reintroducing removed tiers (Plus/Hobby/`pro_plus`) or credit top-ups in any usage/billing metric.
