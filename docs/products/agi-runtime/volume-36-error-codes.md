# AGI Runtime — Volume 36 — Error Codes

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); the nearest `services/AGENTS.md` and `apps/desktop/AGENTS.md`; and the runtime sources grounded below — `crates/agiworkforce-protocol/src/{error,protocol,permissions,approvals,auth}.rs`, `packages/client/client-runtime/src/errors.ts`, `services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/{mobile,pair}.ts`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/mobile/services/companion.ts`. Model IDs (where relevant) come only from `packages/contracts/types/src/models.json`.

## Overview & stance

AGI Runtime is the internal execution and connective layer under the six surfaces, not a product. This volume defines the error taxonomy that layer emits: the core runtime enum, provider/transport failures, tool failures, permission violations, and the recovery guidance attached to each. There is **no monolithic daemon** and, today, **no single namespaced numeric code registry** — the real taxonomy is typed enums (Rust `AgiworkforceErr`, the client-facing `AgiworkforceErrorInfo`), string codes at the signaling/gateway edges, and HTTP status codes. The trust model shapes every category: an error must never leak Local or BYOK context into a Cloud-bound error report, provider errors carry the **provider label** of the boundary that produced them, and Remote-Control failures are surfaced on the paired window without moving the session off its host. A stable, cross-surface, versioned error-code catalog is the target (🔭); the shipped reality below is labeled per item.

## Runtime Errors — core runtime failures

The core taxonomy is the `AgiworkforceErr` enum — ✅ Built (`crates/agiworkforce-protocol/src/error.rs`). Every core failure is one variant with a stable `Display` message: `ContextWindowExceeded`, `ThreadNotFound`, `AgentLimitReached`, `TurnAborted`, `Interrupted` (Ctrl-C), `Timeout`, `Spawn`, `SessionConfiguredNotFirstEvent`, `InternalAgentDied`, `UnsupportedOperation`, `Fatal`, plus transparent `Io`/`Json`/`TokioJoin`/`EnvVar` conversions. Requirements: each variant maps deterministically to a client-facing code via `to_agiworkforce_protocol_error()` → `AgiworkforceErrorInfo` (snake_case-serialized: `context_window_exceeded`, `internal_server_error`, `bad_request`, `sandbox_error`, `other`, etc.) — ✅ Built (`crates/agiworkforce-protocol/src/protocol.rs`, enum at the `AgiworkforceErrorInfo` definition). Emitted to clients as an `ErrorEvent { message, agiworkforce_error_info }` (or `StreamErrorEvent` mid-turn). UI messages MUST be truncated to `ERROR_MESSAGE_UI_MAX_BYTES` (2 KiB) via `get_error_message_ui()` — ✅ Built. `affects_turn_status()` decides whether replaying history marks the turn failed (`thread_rollback_failed` and `active_turn_not_steerable` do not) — ✅ Built. Gap: variant names are the de-facto codes; a documented public catalog with stable string IDs and a migration policy is 🔭.

## Provider Errors

Provider/transport failures are first-class `AgiworkforceErr` variants — ✅ Built (`error.rs`). `UnexpectedStatus(UnexpectedResponseError)` carries `status`, `body`, `url`, `cf_ray`, `request_id`, and identity error fields; the Cloudflare-region block is rendered as a distinct friendly message on `403` — ✅ Built. `ConnectionFailed`, `ResponseStreamFailed { request_id }`, `RetryLimit { status, request_id }`, `ServerOverloaded`, `InternalServerError`, and `Stream(String, Option<Duration>)` (SSE disconnect after handshake, before completion) cover the transport surface — ✅ Built. Entitlement/quota failures — `UsageLimitReached(UsageLimitReachedError)`, `QuotaExceeded`, `UsageNotIncluded`, `RefreshTokenFailed` — collapse to `usage_limit_exceeded` / `unauthorized` client codes — ✅ Built. HTTP status is preserved through `http_status_code_value()` — ✅ Built. Trust rule: BYOK provider errors surface the user's provider label and never route Cloud fallbacks silently; Managed-Cloud errors are a distinct boundary. Gap (🟡): `UsageLimitReachedError`'s `Display` still references legacy `KnownPlan` tiers (Go/Plus/ProLite/Team/…) and a "managed cloud waitlist" (`error.rs`, `auth.rs`), which contradicts the canon pricing ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) and the public-alpha open-by-default decision. Reconcile the copy to canon; this is tracked drift, not a new tier.

## Tool Errors

Tool-execution failures are represented by `SandboxErr`, wrapped as `AgiworkforceErr::Sandbox(_)` → client code `sandbox_error` — ✅ Built (`error.rs`). Variants: `Denied { output, network_policy_decision }` (exit code + stdout/stderr + the network decision that blocked it), `Timeout { output }` (rendered as a plain "command timed out after N ms", not a scary sandbox error), `Signal(i32)`, `LandlockRestrict`, and Linux `Seccomp*` setup/backend failures — ✅ Built. `get_error_message_ui()` aggregates sandbox stdout/stderr into one bounded message — ✅ Built. Tool lifecycle errors stream over the desktop host as `emit_tool_error` alongside `emit_tool_started`/`emit_tool_completed` — ✅ Built (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`). Capability-dispatch failures use typed TS errors: `DesktopRequiredError` (a desktop-only command invoked from Web/Mobile → UI shows a "download desktop" CTA) and the non-throwing `DesktopPreferredWarning` — ✅ Built (`packages/client/client-runtime/src/errors.ts`). Requirement: a tool error must carry the tool name/`call_id`, be truncated, and never echo Local/BYOK secrets into a Cloud-visible payload. A unified per-tool error-code namespace across surfaces is 🔭.

## Permission Errors — permission violations

Permission and approval violations are distinct from generic failures. Filesystem denials come from `FileSystemAccessMode` (`can_read`/`can_write`), `is_read_denied()`, and `forbidden_agent_metadata_write()` guarding protected metadata paths — ✅ Built (`crates/agiworkforce-protocol/src/permissions.rs`). Approval outcomes are typed: `ReviewDecision` (`Approved`, `ApprovedExecpolicyAmendment`, session-scoped approval, and reject), and `GuardianAssessmentStatus` (`Approved` / `Denied`) with `GuardianRiskLevel`, `GuardianUserAuthorization`, and rationale — ✅ Built (`crates/agiworkforce-protocol/src/approvals.rs`). Network approvals carry `NetworkApprovalContext { host, protocol }` and `NetworkPolicyRuleAction` — ✅ Built. At the connective edges, denials are string- and status-coded: the desktop `127.0.0.1` host rejects non-allowlisted origins, enforces a constant-time `x-bridge-token` check, and imposes an IP lockout after repeated auth failures — ✅ Built (`websocket_server.rs`). The signaling relay returns `Unauthorized`, `INVALID_REQUEST`, `RATE_LIMIT_EXCEEDED`, `pairing_not_found`, `invalid_code_format`, and `missing_code`, and rejects unknown control verbs against the allowlist — ✅ Built (`services/signaling-server/src/index.ts`). The api-gateway raises `AppError` with `401`, `403` / "Device registered to another user", `404`, and `503` — ✅ Built (`services/api-gateway/src/routes/{mobile,pair}.ts`). Canon rule: a Local→BYOK fork attempted without context selection, secret scan, payload preview, provider label, and consent MUST error, not silently proceed — the fork flow is 🔭.

## Recovery Guidance — suggested recovery actions

Recovery is classification-driven. `AgiworkforceErr::is_retryable()` is the single source of truth for automatic retry — transient transport (`Stream`, `Timeout`, `UnexpectedStatus`, `ConnectionFailed`, `ResponseStreamFailed`, `InternalServerError`, transient `Io` kinds) is retryable; deterministic failures (`Json`, `InvalidRequest`, `QuotaExceeded`, `UsageNotIncluded`, `Sandbox`, permission/landlock) are not — ✅ Built (`error.rs`). `Stream(_, Option<Duration>)` carries an optional server-advised backoff before the turn is retried — ✅ Built. Usage/quota errors attach a `resets_at` timestamp and render human "Try again at …" guidance via `retry_suffix()` — ✅ Built. `RetryLimit` terminates retries and surfaces the last status + `request_id` for support — ✅ Built. For Remote-Control, approvals queue offline and replay on reconnect so a dropped phone does not lose an in-flight decision — 🟡 Partial: signaling queues and mobile builders exist (`services/signaling-server/src/index.ts`, `apps/mobile/services/companion.ts`) but the desktop last-mile is unwired (`companion`/`dispatch` flags are `false`). Recovery UX: retryable errors auto-retry with bounded backoff and a visible indicator; entitlement errors offer local-model / BYOK (Desktop/CLI/VS Code) or plan-upgrade paths, never a silent Cloud reroute; `request_id`/`cf_ray` are shown for support without exposing secrets. A unified recovery-hint field on every code is 🔭.

## Repository map

- `crates/agiworkforce-protocol/src/error.rs` — `AgiworkforceErr`, `SandboxErr`, `is_retryable`, UI truncation, provider/usage error structs.
- `crates/agiworkforce-protocol/src/protocol.rs` — client `AgiworkforceErrorInfo`, `ErrorEvent`, `StreamErrorEvent`.
- `crates/agiworkforce-protocol/src/{permissions,approvals,auth}.rs` — access modes, review/guardian decisions, refresh-token failures.
- `packages/client/client-runtime/src/errors.ts` — capability-dispatch errors (`DesktopRequiredError`, `DesktopPreferredWarning`).
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — local-host origin/token/lockout errors, `emit_tool_error`.
- `services/signaling-server/src/index.ts` — pairing/control-verb codes, rate limits.
- `services/api-gateway/src/routes/{mobile,pair}.ts` — `AppError` HTTP status mapping.
- `apps/mobile/services/companion.ts` — Remote-Control approval/heartbeat errors.

## Competitor notes

Claude Code, ChatGPT, and Codex surface single-provider, mostly HTTP-status-derived errors from one managed backend. AGI diverges deliberately: errors are **trust-boundary aware** (a Local sandbox denial, a BYOK provider 429, and a Managed-Cloud quota error are distinct classes with distinct recovery paths), **multi-provider** (provider label always attached; no silent cross-provider fallback), and **per-surface** (`DesktopRequiredError` exists precisely because Web/Mobile lack BYOK/Local). Remote-Control errors mirror the Claude Code Remote Control / Codex model — the window reports the failure while the session keeps running on its host.

## Acceptance / Definition of Done

Production-ready when: every core failure maps to exactly one `AgiworkforceErrorInfo`; retryability is decided only by `is_retryable()`; UI messages are truncated and secret-free; provider errors carry provider label + `request_id`; legacy plan/waitlist copy is reconciled to canon pricing.

- [ ] Build: `AgiworkforceErr → AgiworkforceErrorInfo` mapping is exhaustive and unit-tested (`error_tests.rs`); no `panic!`/`unwrap` on the error path.
- [ ] Trust: no error report copies Local/BYOK context into a Cloud-bound payload; entitlement errors never trigger a silent Cloud reroute; Local→BYOK fork rejects without full consent flow.
- [ ] Security: signaling/gateway/desktop-host denial codes stay generic (`pairing_not_found`, `401`) to avoid enumeration; IP lockout and constant-time token checks remain enforced.

## Anti-patterns

- Inventing a numeric `AGI-xxxx` catalog and presenting it as shipped — the real codes are enum variants and edge strings; a stable catalog is 🔭.
- Emitting a Cloud entitlement error that references removed tiers ("Plus", `pro_plus`, "Hobby") or an INR price for Pro/Max — use only Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise; no top-ups.
- Auto-retrying deterministic errors (JSON, invalid request, quota, permission) or silently falling back to another provider/Cloud on a BYOK failure.
- Leaking secrets, full sandbox output, or Local/BYOK context into a Cloud-visible error; skipping the 2 KiB truncation.
- Hardcoding model IDs in error strings (read `packages/contracts/types/src/models.json`), referencing Supabase, or renaming `proxy.ts` back to `middleware.ts`.
