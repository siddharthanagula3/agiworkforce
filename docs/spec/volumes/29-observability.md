# Volume 29 — Observability

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 29)
Authority: `docs/strategy/04` §5/§7 (SLOs, alerting), Vol 28 (metering drift), Vol 30 (trust-boundary violations), Vol 32 (testing)

## Philosophy & Cloud/Local stance

We measure to keep the system honest and to catch the failures that cost money or trust before users do — not to harvest data. Observability is itself trust-boundary aware: **Local content never enters telemetry without explicit consent.** A Local chat's prompts, files, and outputs are not log lines, not trace payloads, not analytics events. We instrument the shape of work (latency, token counts, error classes, route taken) — not the substance of private work. Managed traffic carries richer telemetry by entitlement and policy; BYOK carries operational metrics but not key material. The whole system speaks OpenTelemetry end-to-end so a single request ID follows a token from composer to provider to usage event. The alerts that matter most are not CPU graphs — they are provider error rate, stream stalls, metering drift, and trust-boundary violations.

## Binding rules

1. No raw Local content in telemetry without explicit user consent. Default Local telemetry is opt-in and content-free.
2. OpenTelemetry end-to-end; emit `gen_ai.*` semantic attributes (model, provider, token counts, latency) on every model call.
3. A global request ID traces every token from client → gateway → provider → usage event (`docs/strategy/04` §5).
4. Secrets, BYOK keys, and PII are never logged (Vol 30); scrub before emit.
5. Per-surface SLOs are defined and monitored; breaches alert (`04` §7).
6. P0 alert on any trust-boundary violation — zero is the only acceptable count (`04` §7).
7. Alert on provider error rate, stream stalls, and metering drift (Vol 28); these are the revenue/trust-critical signals.
8. Crash reporting (Sentry-class) on every surface, with PII scrubbing and source maps/symbolication.

## Repository map (real paths)

- Gateway logging/metrics: `services/api-gateway/src/lib/logger.ts`; provider health `src/services/providerHealth.ts`; signaling metrics `services/signaling-server/src/metrics.ts`, `src/logger.ts`.
- Web monitoring: `apps/web/core/monitoring/` — `analytics-tracker.ts`, `performance-monitor.ts`, `system-monitor.ts`; perf script `apps/web/scripts/perf-profile.js`.
- Shared telemetry helpers: `packages/client/desktop-command-client/src/analytics.ts`, `packages/client/desktop-command-client/src/errorReporting.ts`.
- Feature flags / A-B: gate via entitlement (Vol 4) + flag config; route through `packages/client/desktop-command-client/src/settings.ts` and gateway middleware.
- Trust-boundary signals to alert on: `services/api-gateway/src/middleware/managedComputeGate.ts`, `routes/providerStream.ts`; CLI guards `apps/cli/src/agent/mod.rs`; contracts `packages/contracts/types/src/suite-contracts.ts`.
- Metering drift source: `services/api-gateway/src/routes/{credits,usage}.ts` (Vol 28).

## Competitor notes (`docs/strategy/01`, `02`)

Incumbents run inference SRE/capacity orgs and stream OpenTelemetry/SIEM to enterprise customers as a compliance feature (`01` §4 enterprise/compliance). They publish red-team metrics for the prompt-injection program (`01` §4 trust & safety). AGI's deliberate divergence: our most important dashboards are privacy-preserving — we prove the trust boundary holds _mechanically_ (contract tests, Vol 32) and _operationally_ (a P0 alert on any violation), which is the literal product for our buyer (`docs/strategy/05` §3). We emit `gen_ai.*` like everyone, but we are the vendor that can show "we collected nothing from your Local sessions" — instrument to make that provable, not just claimed.

## Checklists

### Tracing & instrumentation

- [ ] OpenTelemetry initialized on web, gateway, signaling (and desktop/CLI where feasible).
- [ ] `gen_ai.*` attributes emitted on every model call (model, provider, prompt/completion tokens, latency).
- [ ] Global request ID propagated client → gateway → provider → usage event.
- [ ] Spans cover tool calls and MCP calls (Vol 18/19), not just the LLM hop.

### Logging hygiene & privacy

- [ ] No prompt/response content in logs for Local mode without consent.
- [ ] Secrets/BYOK keys/PII scrubbed before any emit (Vol 30).
- [ ] Log levels sane; no debug payloads in production.
- [ ] Local-mode telemetry defaults to off / content-free.

### Metrics & SLOs

- [ ] Per-surface SLOs defined (e.g., Managed first-token p95 < 2.5s, stream success > 99.5%, gateway availability 99.9% — `04` §7).
- [ ] Token/cost, latency, error-rate, and concurrency metrics dashboarded.
- [ ] Metering-accuracy metric (usage vs. billed) tracked daily (Vol 28).

### Alerting (the signals that matter)

- [ ] P0 alert: any trust-boundary violation (target count = 0).
- [ ] Alert: provider error rate above threshold (per provider).
- [ ] Alert: stream stalls / first-token timeout breaches.
- [ ] Alert: metering drift non-zero (Vol 28 `BILL-01`).
- [ ] Alert: auth/entitlement failure spikes (abuse signal, Vol 27/30).

### Crash & error reporting

- [ ] Sentry-class crash reporting on every surface with PII scrubbing.
- [ ] Source maps (web/desktop) and symbolication (mobile native) wired.
- [ ] Errors carry request ID for correlation with traces.

### Feature flags & experiments

- [ ] Flags gated by entitlement/trust mode; never expose Managed-only flags to Local.
- [ ] A/B assignment logged without PII; experiments have a kill path.

## Definition of Done

OpenTelemetry traces with `gen_ai.*` flow end-to-end with a correlating request ID; a test proves Local-mode telemetry emits no prompt/response content without consent; secret/PII scrubbing verified; per-surface SLO dashboards exist; alerts fire in staging for synthetic provider-error, stream-stall, metering-drift, and trust-boundary-violation events; crash reporting verified on each surface; no secret appears in any log sample (Vol 30 scan clean).

## Anti-patterns

- Logging Local prompts/responses, or any content, without consent.
- Emitting BYOK keys, tokens, or PII into traces/logs/crash reports.
- Treating CPU/memory graphs as the priority while provider errors, stream stalls, metering drift, and boundary violations go unmonitored.
- Telemetry with no request ID, so a token cannot be traced to its usage event.
- Feature flags that leak Managed-only capability into Local.
- Alert fatigue: paging on noise instead of the revenue/trust-critical signals.
- Shipping a surface with no crash reporting.
