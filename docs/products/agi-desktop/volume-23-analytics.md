# AGI Desktop — Volume 23 — Analytics

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/desktop/AGENTS.md`. Grounded in `apps/desktop/src/services/{analytics,featureFlags,errorTracking,analyticsQueries}.ts`, `apps/desktop/src/types/analytics.ts`, `apps/desktop/src/api/analytics.ts`, `apps/desktop/src/features/settings/AnalyticsSettings.tsx`, `apps/desktop/src/stores/privacyBoundary.ts`, `apps/desktop/src-tauri/src/sys/telemetry/{collector,logging,redaction}.rs`, `apps/desktop/src-tauri/src/sys/commands/analytics.rs`, `apps/desktop/src-tauri/src/data/analytics/`, and `apps/desktop/src-tauri/src/lib.rs`.

## Overview & stance

AGI Desktop is the full-trust surface (Local + BYOK + Managed Cloud), and analytics is where the trust boundary matters most. The governing rule: **analytics is a Managed-Cloud-only egress.** Local and BYOK are private trust boundaries — telemetry, crash reports, and metrics must never leave the device in those modes, regardless of any consent toggle.

This is enforced fail-closed in two layers. In TypeScript, `isPrivateTrustBoundary()` (`apps/desktop/src/stores/privacyBoundary.ts`) returns `true` unless the active mode is `'managed'`, and both `analytics.track()` and `errorTracking.captureError()` return early when it does (✅). In Rust, `TelemetryCollector::is_local_trust_boundary()` suppresses `track()`/`flush()` when `privacy_mode` is `"local"` or `"byok"` (`apps/desktop/src-tauri/src/sys/telemetry/collector.rs`, ✅). The frontend pushes the current mode down on startup and on every switch via `analytics_set_privacy_mode` (`apps/desktop/src/services/analytics.ts` → `apps/desktop/src-tauri/src/sys/commands/analytics.rs`), so both layers stay in sync. A prior `=== 'local'` check leaked Sentry/analytics in BYOK; consolidation into one predicate is the fix. Consent gates the Managed-Cloud opt-in only; it never re-opens the private boundary. Content — chat messages, file bodies, automation logic, keys — is never an analytics payload.

## Cloud Mode

### Events ✅

The event pipeline is built. `AnalyticsService` (`apps/desktop/src/services/analytics.ts`) queues typed events, batches them (`batchSize` 50 / `batchInterval` 30s), persists offline events to `localStorage` when disconnected, and forwards each event to the Rust collector through the 29-command bridge in `apps/desktop/src/api/analytics.ts`. Event names are a closed union in `apps/desktop/src/types/analytics.ts` (`EventName`: `session_started`, `chat_message_sent`, `automation_executed`, `mcp_tool_called`, `error_occurred`, `subscription_upgraded`, etc.). `sanitizeProperties()` strips a PII denylist (`email`, `token`, `api_key`, …) recursively before queueing. Requirements: every material user action maps to a member of `EventName` (extend the union, never free-string); no property may carry raw content; `plan_tier` on `UserProperties` is currently `'free' | 'pro' | 'enterprise'` and does **not** yet encode the canon ladder (Free/Basic/Pro/Max/Enterprise) — 🟡 gap tracked with the billing-catalog reconciliation, not to be papered over here.

### Funnels 🟡

`FunnelStep` is typed (`types/analytics.ts`) and `queryConversionFunnel()` exists (`apps/desktop/src/services/analyticsQueries.ts`), but the query currently returns `[]` — no aggregation is wired. Requirement: a funnel is an ordered `FunnelStep[]` with per-step `users_count` and `conversion_rate` computed server-side over Managed-Cloud events only; onboarding→first-chat→first-automation→upgrade is the first target funnel. Until aggregation lands, treat funnels as design intent.

### Retention 🟡

`RetentionCohort` (day-1/7/30) is typed and `queryRetentionRate()` exists, but returns a stubbed cohort; `UsageStats.retention_rate` is defined but not populated end-to-end. Requirement: cohorts are keyed by install date, computed only from Managed-Cloud sessions, and exclude any device that has never entered Managed Cloud. No Local/BYOK session may appear in a cohort.

### Session Tracking ✅

`SessionInfo` and a per-run `sessionId` are built (`services/analytics.ts`); `session_started`/`session_ended` bracket each session, the backend session id is adopted via `analyticsGetSessionId()`, and `beforeunload` flushes on exit. Requirement: session identifiers are opaque UUIDs, never derived from account identity in a private boundary, and session duration must never embed message content.

### Performance 🟡

`PerformanceMetrics` (startup, web-vitals `lcp`/`fid`/`cls`, memory, CPU) is typed and gated by the `performance_monitoring_enabled` consent; `metricsGetSystem`/`metricsGetApp` return live host metrics (`apps/desktop/src-tauri/src/sys/telemetry/analytics_metrics.rs`, ✅ for system/app metrics). The web-vitals capture pipeline that would populate `PerformanceMetrics` from the renderer is not yet wired to the event bus — 🟡. Requirement: performance samples respect the same private-boundary suppression and consent gate as events.

### Crash Reporting ✅ / 🟡

Renderer crash reporting is built on Sentry (`apps/desktop/src/services/errorTracking.ts`): global `error`/`unhandledrejection` handlers (`setupGlobalErrorHandler`), React boundary capture (`captureErrorBoundaryError`, `apps/desktop/src/features/error-handling/ErrorBoundary.tsx`), `beforeSend` scrubbing of cookies/headers/query strings, `sendDefaultPii: false`, and DSN from `VITE_SENTRY_DSN`; wired in `apps/desktop/src/main.tsx`. Reporting is off unless enabled **and** in Managed Cloud. The Rust process installs a panic hook that logs location + message (`apps/desktop/src-tauri/src/lib.rs`), but native minidump capture/symbolication is not yet integrated — 🟡. Requirement: crash payloads carry stack traces and component names only, never user data.

### Feature Flags ✅

`FeatureFlagsService` (`apps/desktop/src/services/featureFlags.ts`) supports default flags, rollout-percentage bucketing (stable hash of flag+user id), plan-tier and user-id targeting, `localOverride` kill-switches, a 5-minute remote refresh via `feature_flag_get_all`, and the reactive `useFeatureFlag()` hook. `DESKTOP_CHAT_V3` ships default-on with an override kill-switch. Requirement: flag evaluation is local-safe (works with no network); remote flag fetch is metadata only and carries no user content.

## Local Mode

### Optional Anonymous Analytics 🔭

Today, Local (and BYOK) fully suppress telemetry, so there is **no** local-mode analytics emission at all — this is the correct default. The primitives exist: default-off consent (`AnalyticsSettings.tsx`), an anonymous per-device UUID (`analytics_user_id`), and the PII sanitizer. A genuinely device-resident, opt-in, anonymous, **never-egressing** local analytics store (aggregate counts only, no cloud endpoint) is design intent, not built. Requirement when built: strictly opt-in, anonymous, on-device only, aggregate-only, and never content.

### Diagnostic Logs ✅

Rust logging writes rolling daily files under `app_data/logs` (7-file retention) via `apps/desktop/src-tauri/src/sys/telemetry/logging.rs`, and `RedactingWriter` (`redaction.rs`) scrubs API keys, bearer tokens, Google/GitHub tokens before anything hits disk. Requirement: diagnostic logs are local artifacts; they are never auto-uploaded, and any user-initiated share must re-run redaction and show a payload preview.

### Privacy Controls ✅

`AnalyticsSettings.tsx` exposes independent toggles for analytics, error reporting, and performance monitoring, plus GDPR-style **Export Data** and **Delete All Data** (`deleteAllData()` clears local ids/config/consent and calls `analytics_delete_all_data`). Requirement: consent is versioned (`PrivacyConsent.consent_version`), all toggles default off, and export/delete work offline against local state.

## Repository map

- `apps/desktop/src/services/analytics.ts` — event queue, batching, offline buffer, sanitizer, export/delete.
- `apps/desktop/src/services/{featureFlags,errorTracking,analyticsQueries}.ts` — flags, crash reporting, funnel/retention/usage queries.
- `apps/desktop/src/types/analytics.ts` — `EventName`, `PerformanceMetrics`, `FunnelStep`, `RetentionCohort`, `PrivacyConsent`, `FeatureFlag`.
- `apps/desktop/src/api/analytics.ts` — Tauri command wrappers (`analytics_set_privacy_mode`, `feature_flag_get_all`, …).
- `apps/desktop/src/stores/privacyBoundary.ts` — fail-closed trust-boundary predicate.
- `apps/desktop/src/features/settings/AnalyticsSettings.tsx` — consent + data-rights UI.
- `apps/desktop/src-tauri/src/sys/telemetry/{collector,logging,redaction,analytics_metrics}.rs` — Rust collector, logs, redaction, metrics.
- `apps/desktop/src-tauri/src/sys/commands/analytics.rs`, `apps/desktop/src-tauri/src/data/analytics/` — commands, ROI/aggregation/reports.

## Competitor notes

Claude, ChatGPT, and Codex desktop/web clients centralize product analytics and crash reporting into vendor-managed pipelines with limited per-mode granularity. AGI's deliberate divergence: analytics is a **per-trust-mode** capability, not a global one. Local and BYOK are private by construction — the local-first stance means "no telemetry off the device" is the default, enforced in both TS and Rust, not a settings preference. Managed Cloud gets full product analytics because the user has explicitly chosen a shared cloud boundary. Multi-provider usage means events describe activity without ever encoding provider secrets or content.

## Acceptance / Definition of Done

Production-ready when: no analytics/crash/perf payload leaves the device in Local or BYOK (verified in both layers); consent defaults off and gates only the Managed opt-in; export/delete work; diagnostic logs are redacted and never auto-uploaded; funnel/retention aggregation is real (not `[]`) before those dashboards ship.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck` and `cargo check -p agiworkforce-desktop` pass.
- [ ] Trust: automated test proves Local **and** BYOK suppress telemetry, crash reports, and metrics at both the TS gate and the Rust collector.
- [ ] Security: PII denylist + Rust redaction cover keys/tokens; Sentry `beforeSend` strips cookies/headers/query strings; `sendDefaultPii` stays false.

## Anti-patterns

- Emitting any telemetry, crash report, or metric while in Local or BYOK — a hard trust-boundary violation.
- Re-introducing a `mode === 'local'` check instead of `isPrivateTrustBoundary()` (leaked BYOK before).
- Shipping funnel/retention dashboards that render stubbed `[]` data as if real.
- Putting message text, file contents, keys, or account PII into event properties or logs.
- Encoding removed tiers (`Plus`, `pro_plus`, `Hobby`) or credit top-ups in `plan_tier`/flags; the canon ladder is Free/Basic/Pro/Max/Enterprise.
- Hardcoding model IDs into analytics enums — model identity comes only from `packages/types/src/models.json`.
- Referencing Supabase or Next.js `middleware.ts`; the stack is Clerk + Neon + Stripe, and Web uses `proxy.ts`.
