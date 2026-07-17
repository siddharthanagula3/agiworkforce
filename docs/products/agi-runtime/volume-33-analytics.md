# AGI Runtime — Volume 33 — Analytics

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `services/AGENTS.md`, plus the real repo paths grounded below: `services/signaling-server/src/metrics.ts`, `services/api-gateway/src/routes/usage.ts`, `apps/web/app/api/control-plane/status/route.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/companion.ts`, `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, `packages/client/client-runtime/src/`.

## Overview & stance

This volume specifies analytics for **AGI Runtime** — the internal shared execution layer (the Rust/TS crates, `packages/client/client-runtime`, the desktop `127.0.0.1` WS/IPC host, the Chrome native-messaging bridge, `services/signaling-server`, `services/api-gateway`, and the Neon delta-sync APIs). It is **not** a user surface, so "analytics" here means _operational and reliability telemetry for the runtime itself_, not consumer product dashboards (those live in each surface's volumes).

The three trust modes shape every requirement. **Local** telemetry is opt-in and anonymous only: the runtime may never exfiltrate Local chat content, file paths, prompts, tool outputs, or user identifiers off-device. **BYOK** telemetry (Desktop/CLI/VS Code only) is operational-metadata-only — latency, error class, token counts for the user's own metering — never provider key material or payloads. **Managed Cloud** is the only mode where per-user, server-side usage rows are retained, keyed to a Clerk user id in Neon. Remote Control is a window, not a trust mode: pairing/relay telemetry (a paired-session count, message-type counters) describes transport health and must never carry the local session's content. The North Star: measure the runtime's throughput, error, and reliability posture without ever turning telemetry into a covert Local→Cloud exfiltration path.

## Runtime Usage — runtime metrics

The signaling relay already emits Prometheus-format runtime metrics: active WebSocket connections, active pairing sessions, messages processed by type, errors by type, pairing request success/failure, uptime, and process memory. **✅ Built** — `services/signaling-server/src/metrics.ts` (`MetricsCollector.toPrometheusFormat()` / `.toJSON()`).

Requirements (mostly forward-looking): (1) every runtime component (`crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)`, `packages/client/client-runtime`, the desktop WS host, the native-messaging host) SHOULD emit a comparable counter/gauge set — active hosts, active tasks, dispatched control verbs (`approval_request`/`response`, `sync`, `dispatch`, `heartbeat`, `cancel`), and queued-while-offline approvals. (2) Counters MUST be label-bounded (bounded cardinality: `type`, `status`, `surface`) and MUST NOT include user ids, chat ids, or free-form strings. (3) Managed-Cloud per-user usage (event type, token counts, cost, model, provider, session id) is recorded server-side. **✅ Built** for the usage event shape — `services/api-gateway/src/routes/usage.ts` (`UsageRow`). Task-runtime-emitted metrics beyond the signaling relay are **🔭 Planned** — `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` has no metrics surface today.

## Feature Usage — feature adoption

Adoption analytics answer: which runtime capabilities are actually exercised — remote-control pairings completed, dispatch sessions run, plugin/command-registry invocations, delta-sync cursors advanced per surface.

- Pairing adoption is measurable today via `signaling_pairing_requests_total{status}` and per-`type` message counters. **✅ Built** — `services/signaling-server/src/metrics.ts`.
- Companion/dispatch adoption is **🟡 Partial**: the mobile companion protocol and its control-message builders exist (`apps/mobile/services/companion.ts`) but are shipped behind `companion:false` and `dispatch:false` (`apps/mobile/lib/v1FeatureFlags.ts`), and the desktop last mile is unwired — so real dispatch adoption is not yet countable end-to-end.
- Cross-surface feature adoption (which surface used sync/dispatch/remote-attach) depends on presence, which is **🟡 Partial**: `apps/web/app/api/control-plane/status/route.ts` queries a `surface_heartbeats` table that has no migration in `apps/web/db/neon`, so the query cannot return rows in production. CLI and VS Code remote-attach adoption are **🔭 Planned**.

Requirement: adoption events MUST be trust-scoped — Local feature use is counted only as an anonymous, aggregate, opt-in tick with no content; Managed-Cloud feature use may be attributed per user.

## Errors — error analytics

The relay records errors by type (`signaling_errors_total{type}`) and pairing failures. **✅ Built** — `services/signaling-server/src/metrics.ts`.

Requirements: (1) every runtime boundary — JSON-RPC-over-stdio (`crates/agiworkforce-app-server`), the desktop WS host (IP lockout, bad IPC token), the native-messaging bridge, signaling relay, and the Neon sync routes — MUST classify failures into bounded error taxonomies (auth/pairing/transport/protocol/timeout/policy-denied) rather than logging raw exceptions. (2) Error records MUST redact payloads, secrets, and file contents; a Local-mode error report carries the error class and a stack fingerprint, never the prompt or document. (3) Approval-denied and policy-blocked events (execpolicy/sandbox refusals) are first-class error-analytics signals, not silent drops. Unified cross-component error aggregation beyond the relay counter is **🔭 Planned** — no shared error-analytics collector exists across the crates today.

## Performance — performance analytics

Performance analytics cover latency and throughput of runtime operations: task start-to-first-token, tool-call round-trip, control-verb dispatch latency, relay message fan-out time, and delta-sync apply time.

- Provider health/latency probing exists for the dashboard: `apps/web/app/api/control-plane/status/route.ts` probes provider reachability and reports `latencyMs`. **🟡 Partial** — it probes provider _sites_ for a coarse up/degraded/down signal, not real inference latency per request.
- Managed-Cloud usage rows already carry token counts and cost, enabling throughput/cost analytics. **✅ Built** — `services/api-gateway/src/routes/usage.ts`.
- Per-task latency histograms in the runtime crates and a device-local performance ring buffer for Local mode are **🔭 Planned**.

Requirements: latency MUST be captured as bounded histograms/percentiles (p50/p95/p99), never per-request rows keyed to content. Local-mode performance samples stay on-device and are only ever uploaded as opt-in, pre-aggregated, de-identified buckets.

## Reliability — runtime reliability

Reliability analytics quantify whether the runtime stays up and connected: relay uptime, connection churn, reconnect success, heartbeat liveness, and offline-approval queue drain.

- Uptime, connection count, and memory are exported. **✅ Built** — `services/signaling-server/src/metrics.ts` (`signaling_uptime_seconds`, `signaling_connections_total`, `signaling_memory_bytes`).
- Heartbeat/stale detection primitives exist client-side: `apps/mobile/services/companion.ts` defines heartbeat interval and a missed-heartbeat stale threshold. **🟡 Partial** — gated off with the companion flag, and no server-side liveness table backs it.
- Cross-surface presence/liveness is **🟡 Partial → 🔭**: the `surface_heartbeats`-backed status route exists but the table is unmigrated (`apps/web/app/api/control-plane/status/route.ts`). A durable reliability SLO store (error budgets, reconnect success rate, queue-drain latency) is **🔭 Planned**.

Requirement: reliability metrics MUST be content-free and safe to expose to on-call/monitoring, and Managed-Cloud reliability data MUST be tenant-isolated under Neon RLS.

## Repository map

- `services/signaling-server/src/metrics.ts` — relay runtime/reliability metrics (Prometheus + JSON).
- `services/api-gateway/src/routes/usage.ts` — Managed-Cloud per-user usage events (tokens, cost, model, provider).
- `apps/web/app/api/control-plane/status/route.ts` — cross-surface status/provider-latency probe (unmigrated `surface_heartbeats` gap).
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts` — companion heartbeat/dispatch primitives (flagged off).
- `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, `crates/agiworkforce-app-server`, `packages/client/client-runtime/src/` — runtime execution surfaces awaiting metric emission.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — delta-sync apply points (sync reliability signals).

## Competitor notes

Claude Code Remote Control and OpenAI Codex remote connections keep the session on the host and expose minimal transport telemetry; Claude/ChatGPT usage analytics are single-vendor and cloud-centric. AGI's deliberate divergence: analytics are **multi-provider** (usage rows carry `provider`/`model`, never a hardcoded id — model ids come only from `packages/contracts/types/src/models.json`), **per-surface trust-scoped**, and **local-first**. Where competitors default telemetry on and cloud-bound, AGI treats Local telemetry as opt-in/anonymous and BYOK telemetry as operational-metadata-only, so measuring the runtime never becomes a reason to move a user's private compute or content to the cloud.

## Acceptance / Definition of Done

Production-ready when every runtime component emits bounded, content-free operational metrics; Local telemetry is provably opt-in and de-identified; Managed-Cloud usage is tenant-isolated under RLS; and the `surface_heartbeats` presence gap is either migrated or the status route degrades honestly.

- [ ] Build: task-runtime, app-server, desktop WS host, and native-messaging bridge each emit connection/task/error/latency metrics with bounded label cardinality; no user/chat ids in labels.
- [ ] Trust: Local metrics are opt-in, aggregate, and carry zero content, paths, prompts, or identifiers; BYOK metrics carry no key material or payloads; Managed-Cloud usage rows are RLS-scoped to the Clerk user.
- [ ] Security: error/performance records redact secrets and payloads; relay/pairing metrics expose no session content; `surface_heartbeats` is migrated or the status route reports `unknown` instead of querying a missing table.

## Anti-patterns

- Silently uploading Local-mode telemetry, or attaching content/prompts/file paths/user ids to any Local or BYOK metric — this is a trust-boundary violation.
- Routing analytics through a fabricated monolithic "runtime daemon" — no such daemon exists; assemble only from the real parts above.
- Claiming presence/heartbeat analytics as shipped: `surface_heartbeats` has no migration, and companion/dispatch are flagged off.
- Unbounded metric labels (per-user, per-chat, free-form strings) that explode cardinality or leak identity.
- Hardcoding or inventing model ids in usage/analytics code — read them from `packages/contracts/types/src/models.json`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups in usage/billing analytics; use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise. Do not invent Pro/Max INR prices.
- Referencing Supabase for any analytics store — the stack is Clerk + Neon + Stripe.
