# AGI Desktop — Volume 30 — Error Codes

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and real repo paths: `apps/desktop/src-tauri/src/sys/error/{mod,categorization,recovery,retry,translator,commands,integration}.rs`, `apps/desktop/src-tauri/src/sys/commands/error_reporting.rs`, `apps/desktop/src-tauri/src/sys/telemetry/{logging,correlation,redaction,tracing}.rs`, `apps/desktop/src-tauri/src/sys/security/log_redaction.rs`, `apps/desktop/src-tauri/src/sys/diagnostics/{runner,commands,checks}`, `apps/desktop/src-tauri/src/integrations/realtime/{websocket_server,events}.rs`, `apps/desktop/src-tauri/src/integrations/native_messaging/`, `apps/desktop/src/{features/errors,features/error-handling,ui/SectionErrorBoundary.tsx,constants/errorMessages.ts,lib/friendlyErrors.ts,services/errorReporting.ts}`, `packages/contracts/types/src/errors.ts`, `packages/platform/utils/src/errors.ts`, `apps/web/lib/{errors.ts,error-handler.ts}`, `apps/web/app/api/support/route.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

Desktop is the full-trust surface (Local + BYOK + Managed Cloud), so its error model is **trust-mode aware by construction**. Errors carry which boundary they came from and never leak data across it: a Local failure stays on device, a BYOK failure names the user's own provider, a Cloud failure maps to a shared HTTP `ErrorCode`. Two error taxonomies coexist. The **native Rust taxonomy** (`AGIError` and children in `apps/desktop/src-tauri/src/sys/error/mod.rs`) governs everything the local host does; the **shared cloud taxonomy** (`ErrorCode` in `packages/contracts/types/src/errors.ts`, re-exported via `packages/platform/utils/src/errors.ts`) governs Neon-backed HTTP routes. This volume defines both, plus recovery, logging, diagnostics, and the support IDs that tie a user report to a redacted trace. No model ID is written literally; provider names in errors resolve from `packages/contracts/types/src/models.json`.

## Cloud Errors — ✅ Built

Managed-Cloud calls hit `apps/web/app/api/*` and fail with the shared `ErrorCode` enum (`packages/contracts/types/src/errors.ts`): `UNAUTHORIZED` (401), `FORBIDDEN` (403), `PAYMENT_REQUIRED` (402), `VALIDATION_ERROR`/`INVALID_INPUT` (400), `NOT_FOUND` (404), `CONFLICT` (409, sync), `PAYLOAD_TOO_LARGE` (413), `RATE_LIMIT_EXCEEDED` (429), `TIMEOUT` (504), `NETWORK_ERROR`/`SERVICE_UNAVAILABLE` (503), `STRIPE_ERROR`/`CLOUD_DB_ERROR` (502), `INTERNAL_ERROR` (500). `AppError` carries `code`, `message`, `statusCode`, and optional `details` (`packages/platform/utils/src/errors.ts`); `withErrorHandler` (`apps/web/lib/error-handler.ts`) serializes them. Requirement: only `cloud_managed` sessions reach these routes; error bodies never echo a Local/BYOK payload or a provider key. Gap: the legacy `PGRST116` code remains for compatibility and must be treated as `NOT_FOUND`, not a live Postgres-REST path (Supabase is fully removed) — 🟡.

## Local Errors — ✅ Built

On-device failures use `AGIError` (`apps/desktop/src-tauri/src/sys/error/mod.rs`): `ToolError`, `LLMError`, `ResourceError`, plus `PermissionError`, `TransientError`, `FatalError`, `ConfigurationError`, `TimeoutError`, `Database`, `InvalidPath`. Each maps to an `ErrorCategory` (`Transient`, `Permanent`, `ResourceLimit`, `Permission`, `Configuration`, `Unknown`) via `categorization.rs`, which also drives `is_retryable()` and a plain-language `suggested_action()`. Requirement: Local errors are serialized and rendered locally only — they never travel a Cloud route and carry no cloud identifiers. `ResourceError` (CPU/memory/network/storage/concurrency limits) is retryable; `FatalError` is not.

## IPC Errors — ✅ Built (🟡 companion)

Tauri commands return `Result<T, String>`; the `127.0.0.1` realtime host (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`) and the Chrome native-messaging host (`integrations/native_messaging/`) add transport errors. Enforced today: loopback-only origin rejection, bridge-token auth failure, and `SEV-DESK-01` IP lockout — five auth failures from one IP triggers a 300-second lockout that skips the handshake entirely. Stream failures surface as the `chat:stream-error` native event (`integrations/realtime/events.rs`). Requirement: every command validates inputs (no unvalidated IPC) and returns a categorized string, not a raw panic. Gap: the Desktop↔Mobile companion re-emits control errors with no listener and its chat panel is commented out — 🟡.

## Provider Errors — ✅ Built

Provider failures use `LLMError` (`sys/error/mod.rs`): `RateLimitError`, `ContextLengthError`, `ContentFilterError`, `ModelNotAvailable`, `AuthenticationError`, `NetworkError`, `Timeout`, `InvalidResponse`, `ApiError`. `reqwest::Error` is mapped automatically (timeout → `TimeoutError`, connect → `NetworkError`, 429 → `RateLimitError`). Requirement: a provider error names the **actual provider and trust mode** so the UI shows the correct label — a BYOK rate limit is the user's own key/quota, a Cloud rate limit is an AGI plan limit. The offending model ID must resolve in `models.json` or the request is rejected before dispatch.

## Authentication Errors — 🟡 Partial

Three auth surfaces, three failure paths. Cloud: Clerk yields `UNAUTHORIZED` (401) / `FORBIDDEN` (403), plan/entitlement denial yields `PAYMENT_REQUIRED` (402). Bridge: extension pairing failures return bridge-token/lockout errors (above). BYOK: an invalid or missing key surfaces as `LLMError::AuthenticationError`, never as a Cloud 401. Requirement: keys live in OS keychains (macOS Keychain / Windows Credential Manager / Linux Secret Service); auth errors state which credential failed **without printing it**. Gap: uniform RLS/entitlement coverage across every cloud route is not yet audited — 🟡.

## Validation Errors — ✅ Built (🟡 uniform IPC coverage)

Cloud routes validate with Zod and throw `VALIDATION_ERROR`/`INVALID_INPUT` with a `details.field` (e.g. `apps/web/app/api/support/route.ts` schema caps `subject`/`message` length). Native validation uses `ToolError::InvalidParameters`, `ToolError::NotFound`, and `AGIError::InvalidPath` for rejected file targets. Requirement: reject before side effects; return the failing field/parameter, not the whole payload. Gap: input validation is not yet uniform across all ~1,500 IPC commands — 🟡.

## Recovery — ✅ Built

`sys/error/recovery.rs` defines `RecoveryManager` + `RecoveryStrategy` producing a `RecoveryAction`: `Retry`, `WaitAndRetry(ms)`, `Fallback(name)`, `Skip`, `Abort`, `RequestUserInput`. `retry.rs` supplies `RetryPolicy` with `BackoffStrategy::{Fixed,Linear,Exponential,ExponentialWithJitter}` (jitter capped at max). `ErrorContext` (`mod.rs`) tracks `recovery_attempts`; commands `retry_failed_step`, `skip_failed_step`, `abort_execution`, and `get_recovery_suggestion` (`sys/error/commands.rs`) expose recovery to the UI. Requirement: only `Transient`/`ResourceLimit` categories auto-retry; permission/fatal errors escalate to `RequestUserInput` or `Abort`. A Local→BYOK fallback is never automatic — it requires the explicit fork (consent, secret scan, payload preview, provider label).

## Logging — ✅ Built

Native logging uses `tracing` (`sys/telemetry/logging.rs`, `tracing.rs`) with correlation IDs (`sys/telemetry/correlation.rs`, UUID guard). All user-supplied data passes secret redaction before write (`sys/security/log_redaction.rs`: patterns for `sk-ant-`, generic `sk-`, `AIzaSy`, and more → `[REDACTED_*]`; `sys/telemetry/redaction.rs`). Frontend errors flow through `error_report` (`sys/commands/error_reporting.rs`) to `tracing::error!` and, if `SENTRY_DSN` is set, to Sentry with a generated `event_id`. Requirement: no API key, bearer token, or Local file content ever reaches a log sink or Sentry; Local-mode telemetry stays local unless the user opts into crash reporting.

## Diagnostics — ✅ Built

`sys/diagnostics/runner.rs` runs checks in parallel emitting `DiagnosticProgressEvent`; checks live in `sys/diagnostics/checks/` (`auth_health`, `config_validation`, `database_integrity`, `dependency`, `disk_space`, `mcp_connectivity`, `network`, `permissions`) and produce a `DiagnosticReport`. Exposed via `sys/diagnostics/commands.rs`. Requirement: diagnostics are read-only and offline-safe; a failing check names the subsystem and a remediation hint, never dumps secrets.

## Support IDs — 🟡 Partial

Every error path can be tied to a stable ID: `ErrorContext.id` (UUID) for a native failure, the correlation ID from `CorrelationGuard`, and the Sentry `event_id`. Cloud support tickets persist a row `id` with `status`/`priority` (`apps/web/app/api/support/route.ts`). Requirement: the UI surfaces a copyable Support ID that resolves to a **redacted** trace only; the ID must never encode PII or the user's raw error text. Gap: a single unified Support ID that stitches native `ErrorContext.id` + cloud ticket `id` is not yet wired — 🟡.

## Repository map

- `apps/desktop/src-tauri/src/sys/error/` — `AGIError`/`ToolError`/`LLMError`/`ResourceError`, categorization, recovery, retry, translator, commands
- `apps/desktop/src-tauri/src/sys/{telemetry,logging,security/log_redaction.rs}` — tracing, correlation, redaction
- `apps/desktop/src-tauri/src/sys/diagnostics/` — runner, checks, commands
- `apps/desktop/src-tauri/src/sys/commands/error_reporting.rs` — `error_report` → tracing + Sentry
- `apps/desktop/src-tauri/src/integrations/{realtime,native_messaging}/` — WS/bridge/native-messaging transport errors + IP lockout
- `apps/desktop/src/{features/errors,features/error-handling,ui/SectionErrorBoundary.tsx,constants/errorMessages.ts,lib/friendlyErrors.ts,services/errorReporting.ts}` — UI error rendering/toasts/boundaries
- `packages/contracts/types/src/errors.ts`, `packages/platform/utils/src/errors.ts` — shared `ErrorCode` SSOT + `AppError`
- `apps/web/lib/{errors.ts,error-handler.ts}`, `apps/web/app/api/support/route.ts` — cloud error envelope + support tickets

## Competitor notes

Claude, ChatGPT, and Codex present a single cloud error surface — every failure is a vendor HTTP status because all inference is remote. AGI diverges deliberately: because Desktop runs Local, BYOK, and Cloud, an error must first say **which trust boundary failed**, then map to the right taxonomy (native `AGIError` for local/IPC, `ErrorCode` for cloud). Provider errors are multi-provider and name the real provider from `models.json`; BYOK failures point at the user's own key/quota, not an AGI plan. Recovery never silently promotes a Local session to a paid Cloud path — a fallback across the boundary is always an explicit, consented fork.

## Acceptance / Definition of Done

Production-ready when every failure is categorized, redacted, recoverable-or-escalated, and traceable to a Support ID, with zero cross-boundary leakage.

- [ ] Build: `AGIError`/`ErrorCode` cover all paths; UI renders friendly messages + a copyable Support ID; diagnostics run green.
- [ ] Trust: no Local/BYOK data in Cloud error bodies; no auto Local→BYOK/Cloud fallback; provider label matches the failing trust mode.
- [ ] Security: redaction proven for keys/tokens/file content in logs + Sentry; IP lockout + loopback origin + bridge token enforced on the WS host.

## Anti-patterns

- Returning a Cloud `ErrorCode` for a Local/BYOK failure, or leaking Local payloads/provider keys into an error body, log, or Sentry event.
- Auto-retrying a `FatalError`/`PermissionError`, or auto-falling-back a Local session to Cloud without the explicit fork.
- Printing API keys/tokens/file contents; skipping `log_redaction` before a `tracing` call.
- Hardcoding or inventing a model ID in a provider error instead of resolving from `models.json`.
- Reviving removed tiers (Plus, `pro_plus`, Hobby, Team) or top-up flows in `PAYMENT_REQUIRED` copy; inventing Pro/Max INR prices.
- Referencing Supabase (treat `PGRST116` as `NOT_FOUND`), or renaming `proxy.ts` to `middleware.ts`.
- Claiming the Desktop↔Mobile companion or a unified Support ID is shipped — both are 🟡.
