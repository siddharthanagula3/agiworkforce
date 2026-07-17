# AGI VS Code Extension — Volume 20 — Analytics

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, `docs/surfaces/vscode-extension.md`, and grounded in `apps/extension-vscode/package.json`, `apps/extension-vscode/src/core/telemetry.ts`, `apps/extension-vscode/src/__tests__/telemetryRedaction.test.ts`, `apps/extension-vscode/src/core/subsystemHealth.ts`, `apps/extension-vscode/src/providers/errorExplainerProvider.ts`, and `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`.

## Overview & stance

This volume covers analytics for the AGI VS Code extension: what usage, error, performance, and diagnostic signals the surface may collect, and — far more importantly — what it must never collect. The extension is the IDE-native, **workspace-scoped** developer surface with all three trust modes available under explicit selection (Local, BYOK, Managed Cloud). Analytics sits directly on the trust boundary, so two rules dominate everything below.

First, **telemetry is off by default and doubly gated**. Nothing leaves the host unless both the VS Code global telemetry setting (`vscode.env.isTelemetryEnabled`) **and** the extension setting `agiWorkforce.telemetryEnabled` (default `false`) are on — enforced in `src/core/telemetry.ts` (`postBatch` checks `vscode.env.isTelemetryEnabled`; `logEvent`/`logError` check `isExtensionTelemetryEnabled`). Second, **local sessions never send content**. Analytics captures counts, names, and coarse categories — never prompt text, file contents, code, terminal output, or provider keys. Local→BYOK/Cloud escalation is a separate explicit fork (Volume 03), and analytics must not become a side channel that leaks Local data into a Cloud-hosted endpoint. There is no automatic app-chat sync; analytics is device-scoped and never rides the Neon delta-sync path (which is Managed-Cloud chat data only, Web↔Mobile↔Desktop).

## Feature Usage

- ✅ Built — Feature-usage events flow through VS Code's `TelemetryLogger` (`vscode.env.createTelemetryLogger`) in `src/core/telemetry.ts`. The event vocabulary is a fixed enum (`TelemetryEvents`): `extension/activated`, `inlineCommand/executed`, `model/selected`, `error/occurred`. Common properties are limited to a per-session random `sessionId` (`crypto.getRandomValues`, regenerated each activation — not a stable device ID), `extensionVersion`, `vscodeVersion`, and `process.platform`. No workspace name, file path, repo URL, user identity, or content is attached.
- ✅ Built — Model selection reports a **normalized** model id via `normalizeConfiguredModelId` (`src/features/model-picker/modelConstants`), not a raw free-text string, so analytics never emits an invented or hardcoded model id. Model ids remain sourced from `packages/contracts/types/src/models.json`.
- ✅ Built — Events are batched (`TelemetryBatcher`): one POST per flush of ≤50 events on a 30 s timer, on the batch cap, and on dispose. On network failure events are **dropped** (no persistent retry queue), bounding both overhead and data retention.
- 🟡 Partial — Local token/usage counters (`agi-workforce.modelDashboard`, `agi-workforce.showTokenBreakdown`, `agi-workforce.resetTokenCounter` in `package.json`) render usage **in-editor only** and are not part of the telemetry pipeline. Requirement: keep these strictly local; any future aggregation to a server is a new trust-boundary crossing requiring consent and a visible destination.
- Requirement: every new event name must be added to the `TelemetryEvents` enum with a documented property schema; free-form property maps that could carry content are prohibited.

## Errors

- ✅ Built — Error analytics use `logError` / the `TelemetrySender.sendErrorData` path (`src/core/telemetry.ts`), emitting `error/occurred` with `errorName` and `errorMessage` only. Every string is passed through `redactSecrets` before it can be enqueued.
- ✅ Built — Redaction covers JWTs, `Bearer` tokens, Anthropic/OpenAI/generic `sk-` keys, Stripe `sk_live_`/`sk_test_`, Slack, GitHub PAT, Google, and AWS access keys, replacing matches with `[REDACTED]`. This is locked by `src/__tests__/telemetryRedaction.test.ts`, which also asserts innocuous strings are left intact.
- ✅ Built — The telemetry endpoint is host-allowlisted (`ALLOWED_TELEMETRY_HOSTS`: `telemetry.agiworkforce.com`, `agiworkforce.com`, `localhost`, `127.0.0.1`) by exact hostname — a misconfigured or attacker-set `agiWorkforce.telemetryEndpoint` silently disables sending rather than exfiltrating errors. `agiWorkforce.telemetryEndpoint` is a `restrictedConfiguration` (untrusted workspaces cannot override it — `package.json` `capabilities.untrustedWorkspaces`).
- Requirement: error reports must never include stack frames carrying file contents or user paths beyond the redacted message; a Local-mode error must not attach BYOK/Cloud provider identifiers that imply content routing.

## Performance

- 🔭 Planned — There is no latency/throughput performance-telemetry instrumentation in `src/` today (no timing spans on completion round-trips, streaming first-token latency, or activation cost beyond the `extension/activated` event). Design intent: coarse, content-free performance counters (e.g. request duration buckets, streaming stall counts, inline-completion debounce hit rate) emitted through the same gated, redacted, batched pipeline.
- ✅ Built (guardrail) — The batching design (`TelemetryBatcher`, ≤50/flush, drop-on-failure) already bounds the extension's own analytics overhead; any performance metric must reuse it rather than add per-event POSTs.
- Requirement: performance metrics are counts and durations only — never sampled payloads or timed content. They obey the same double gate; when disabled, zero measurement traffic leaves the host. Local-mode performance data (on-device runtime timings) stays on-device and is never uploaded.

## Diagnostics

- ✅ Built — Subsystem-boot diagnostics live in `src/core/subsystemHealth.ts`: `runBoot`/`runBootAsync` wrap each subsystem's activation, record failures, and surface a status-bar item ("AGI: N subsystems unavailable") whose click opens a quick-pick of failed subsystems and messages via the `agi-workforce.showSubsystemHealth` command. This is **local, in-session** diagnostics — failures are shown to the user, not shipped anywhere.
- ✅ Built — Desktop-bridge connection diagnostics are surfaced locally by the bridge status bar in `src/features/desktop-bridge/desktopBridge.ts` (connected / connecting / disconnected / error, with a Reconnect action). No bridge telemetry is emitted.
- ✅ Built — User-facing error explanation (`agi-workforce.explainError`, `src/providers/errorExplainerProvider.ts`) is an editor feature, not analytics; when it sends diagnostics text to a model it obeys the resolved trust mode and visible provider label (a boundary crossing, per Volume 03), and is distinct from the telemetry pipeline.
- Requirement: diagnostics that stay on-device (subsystem health, bridge status) need no consent; anything that would _upload_ a diagnostic bundle must be explicit, redacted, gated by the same settings, and must never bundle workspace content.

## Repository map

- `apps/extension-vscode/src/core/telemetry.ts` — telemetry service: double-gate, event enum, `redactSecrets`, endpoint allowlist, `TelemetryBatcher`.
- `apps/extension-vscode/src/__tests__/telemetryRedaction.test.ts` — redaction regression lock.
- `apps/extension-vscode/src/core/subsystemHealth.ts` — subsystem-failure diagnostics + `agi-workforce.showSubsystemHealth`.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — bridge connection-state diagnostics (status bar).
- `apps/extension-vscode/src/providers/errorExplainerProvider.ts` — user-facing error explanation (editor feature, not analytics).
- `apps/extension-vscode/package.json` — `agiWorkforce.telemetryEnabled` / `agiWorkforce.telemetryEndpoint` settings and untrusted-workspace restrictions.

## Competitor notes

Claude Code, ChatGPT, and Codex IDE extensions collect usage and error telemetry against a single first-party account and provider. AGI's deliberate divergence: analytics is **per-surface and trust-aware**, off by default, doubly gated behind the VS Code global switch, content-free, and host-allowlisted — with mandatory secret redaction proven by tests. Because the extension is multi-provider and supports BYOK, analytics must never emit provider keys or route a Local session's signals to a Cloud endpoint. Managed-Cloud billing/metering is a separate server-side concern (not this file) and must not be conflated with product analytics.

## Acceptance / Definition of Done

- [ ] Build: `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass, including `telemetryRedaction.test.ts`; every emitted event name exists in the `TelemetryEvents` enum with a documented content-free schema.
- [ ] Trust: with either the VS Code global telemetry setting or `agiWorkforce.telemetryEnabled` off, no network POST is issued; Local-mode sessions emit no content; no BYOK/Cloud key or prompt/file/terminal content appears in any payload.
- [ ] Security: endpoint stays exact-host allowlisted; `agiWorkforce.telemetryEndpoint` remains a restricted configuration in untrusted workspaces; failed sends drop (no unbounded retry queue); redaction runs on every string property and every error message.

## Anti-patterns

- Sending prompt text, code, file paths, terminal output, or diagnostic bundles as telemetry properties. Analytics is counts, names, and categories only.
- Emitting a raw or hardcoded model id; always normalize from `models.json` — never invent one.
- Routing a Local session's analytics to a Cloud-hosted endpoint, or using telemetry as a covert Local→BYOK/Cloud bridge.
- Adding a stable device/user identifier; `sessionId` is per-activation and random.
- Widening the endpoint allowlist to wildcard subdomains, or letting workspace settings override the endpoint in untrusted workspaces.
- Referencing Supabase, or reusing the Neon delta-sync path for analytics (that path is Managed-Cloud chat data only).
- 🟡 Gap — `package.json` `agiWorkforce.tier` still enumerates removed tiers (`hobby`, `pro_plus`); analytics must not label events with retired tier names. Use only Free / Basic / Pro / Max / Enterprise; the enum cleanup is the separately tracked billing-catalog reconciliation.
