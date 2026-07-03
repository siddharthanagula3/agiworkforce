# AGI Chrome Extension — Volume 29 — Error Codes

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root) and `apps/extension/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/extension/manifest.json`; `apps/extension/src/features/computer-use/{cloudAgentClient,cdpDriver,agentLoop,escalationEngine}.ts`; `apps/extension/src/features/native-bridge/{providerStreamClient,sendQueue}.ts`; `apps/extension/src/pairing.ts`; `apps/extension/src/background/{memory-bridge,policy}.ts`; `apps/extension/src/features/background/conversation-history.ts`; `apps/extension/THREAT_MODEL.md`, `MANIFEST_NOTES.md`. Model IDs come from `packages/types/src/models.json` only.

## Overview & stance

This volume defines the error taxonomy for the AGI Browser Companion: how each failure class is detected, surfaced, recovered, and logged. The Chrome surface is a permission-gated browser agent, **not** a consumer assistant. It holds **no provider keys and runs no inference** — every model call streams through the AGI cloud gateway, so there is **no BYOK and no Local trust mode here** (canon: Chrome is Cloud-only, task-scoped). That shapes the error model three ways: (1) auth and billing failures are cloud failures resolved server-side (paywalls, 401/403), never local key errors; (2) browser-action failures (CDP, allowlist, injection) are hard trust boundaries that must **fail closed** — an off-allowlist or injected action aborts, never "best-effort" continues; (3) diagnostics stay **device-scoped** — history/memory live in `chrome.storage.local`, never synced. Error messages must not leak page content, tokens, or provider hostnames.

## Authentication Errors

Auth errors originate at the Clerk token boundary. `getAuthToken()` reads `chrome.storage.session` (`agi_clerk_session_token`), then a dev-only `agi_dev_bearer_token`, else returns `null` — callers must render a sign-in prompt, not silently fail. A gateway `401` throws an actionable message directing the user to paste a fresh Clerk session token via AGI Cloud sign-in. ✅ Built — `cloudAgentClient.ts:424` (401 branch), token relay per Volume 02/24. 🟡 Partial — headless `createClerkClient`-in-service-worker is a documented TODO; token refresh is manual on expiry.

## Browser Errors

CDP-driver failures throw plain `Error`s with a stable prefix so callers can classify: `Selector eval error: …`, `Element not found for selector: …`, `navigate: only http/https URLs allowed, got <protocol>`. The debugger is attached **per action** and detached on completion or error — never left attached after a failure. DOM-stability waits (`waitForStable`, 2 s timeout) bound flaky captures. ✅ Built — `cdpDriver.ts` (selector/eval/navigate guards), `agentLoop.ts:executeTool`.

## Permission Errors

Two named error classes gate browser actions and MUST hard-stop the agent loop: `NavigationOffAllowlistError` (a click/navigate would leave the approved allowlist) and `InjectionDetectedError` (prompt-injection sentinel in page content — page text is data, never instructions). Cloud-side, a gateway `403` matching `public_launch_blocked | managed_compute_private_beta | not_private_beta` means either the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` incident kill-switch is off server-side, **or** the account lacks the paid plan computer-use requires — surfaced as one actionable message, never "turn on an env var." ✅ Built — `agentLoop.ts:128,159` (classes), `cloudAgentClient.ts:410` (403 branch). 🟡 Partial — high-risk-site intervention copy is stubbed (see Volume 18).

## Extension Errors

Chrome-platform faults surface via `chrome.runtime.lastError`, checked and rewrapped as a rejected `Error` on native-messaging round-trips (`pairing.ts:52,79`). Storage limits are enforced as **eviction, not errors**: history caps at 100 conversations / 30-day TTL (`conversation-history.ts`), device memory at 200 rows (`memory-bridge.ts`), scheduled tasks at 50. Malformed SSE frames are ignored rather than thrown, keeping a stream alive through partial corruption. The send queue degrades to a volatile in-memory queue if persistence fails, swallowing the storage error. ✅ Built — cited files (`sendQueue.ts` volatile fallback). 🔭 Planned — service-worker-restart replay of in-flight agent turns.

## Bridge Errors

The Desktop bridge has two transports. **Native messaging**: `chrome.runtime.connectNative('com.agiworkforce.browser')` port errors and `onDisconnect` propagate via `lastError`. **Localhost pairing bridge** (`POST <bridgeUrl>/pair`, default `http://localhost:8787`): the host must be in `ALLOWED_BRIDGE_HOSTS` or it throws `Pairing is only supported with local desktop bridge` (IPv6 `[::1]` always rejected); tokens must match `^[A-Za-z0-9_-]{32,128}$` and fingerprints `^[A-Za-z0-9_-]{4,32}$`, else rejected before use. If the desktop `/pair` endpoint is absent the fetch rejects (ECONNREFUSED / non-ok) and pairing state transitions to `error` with a reason. Requests carry `X-Bridge-Token`. ✅ Built — `apps/extension/src/pairing.ts` (`PAIRING_TOKEN_RE`, `ALLOWED_BRIDGE_HOSTS`, phase state), `background/policy.ts`.

## API Errors

Gateway-call errors are classified before retry. Egress is allowlist-locked: a non-allowlisted origin throws `callCloud: gateway URL not in allowlist: <base>` **before** the JWT is sent (`validateGatewayUrl`). A `403` from a missing `X-Requested-With` header is the gateway CSRF rejection (`CSRF_ERROR`). A `429` carrying `{kind:'paywall', feature, requiredTier}` is re-emitted as a first-class `paywall` chunk (not an error); a `>=500` becomes an `error` chunk flagged `retryable:true`; other non-ok statuses become `Upstream error <status>`. Truncated bodies (`errText.slice(0, 300)`) bound log size. **No provider host is ever contacted directly.** ✅ Built — `cloudAgentClient.ts:369,430`, `providerStreamClient.ts:115,143`. 🟡 Partial — `PaywallRequiredTier` still encodes removed tiers (`'hobby' | 'pro' | 'pro_plus' | 'max'`); gap: reconcile to Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise (tracked with the `billing-catalog.ts` reconciliation).

## Recovery

Recovery is per-class: **retryable** (`>=500`) — bounded exponential backoff; **paywall** (`429`) — stop and route to server-rendered upgrade UI, never auto-retry; **auth** (`401`) — clear the stale session token and prompt re-sign-in; **trust** (`NavigationOffAllowlistError` / `InjectionDetectedError`) — abort the loop, detach CDP, require fresh approval before continuing; **bridge** — surface the pairing `error` phase and offer re-pair. The persisted send queue replays commands after transient failure. 🟡 Partial — the retryable flag and paywall/auth branches ship (`providerStreamClient.ts:146`, `cloudAgentClient.ts`); 🔭 Planned — a unified backoff/retry policy and mid-turn resume are not yet centralized.

## Logging

Logs are device-local and must be **PII- and content-safe**: no page DOM, tokens, provider hostnames, or clipboard contents in any log line. Gateway error bodies are truncated (`slice(0, 300)`). Malformed SSE and non-fatal storage writes are swallowed intentionally rather than logged noisily. There is **no telemetry sync** — error logs never leave the device via the sync APIs (canon: Chrome stays task-scoped; history/memory unsynced). ✅ Built — truncation and silent-swallow paths cited above. 🔭 Planned — a structured, redaction-audited logger with severity levels.

## Diagnostics

The pairing subsystem exposes an observable state machine (`PairingPhase`: `idle | requesting | paired | error`, plus `fingerprint` and `error` reason) that the popup/side panel render for self-service triage. `THREAT_MODEL.md` and `MANIFEST_NOTES.md` are the canonical references for permission/injection failure modes. 🟡 Partial — pairing state is surfaced today; 🔭 Planned — a consolidated in-panel diagnostics view (last gateway status, allowlist state, bridge health).

## Support IDs

There is **no shipped correlation/request-ID scheme** in the extension today, and none may be invented. A future support-ID design must generate a client-side, non-PII correlation token, attach it to gateway requests, echo it in error toasts, and keep it device-scoped (never synced). 🔭 Planned — do not claim a support-ID format, header, or endpoint until it exists in `apps/extension/`.

## Repository map

- `apps/extension/src/features/computer-use/` — `cloudAgentClient.ts` (401/403/allowlist), `cdpDriver.ts` (selector/eval/navigate), `agentLoop.ts` (`NavigationOffAllowlistError`, `InjectionDetectedError`), `escalationEngine.ts`.
- `apps/extension/src/features/native-bridge/` — `providerStreamClient.ts` (429/5xx/paywall), `sendQueue.ts` (volatile fallback), `pairing.ts` (re-export).
- `apps/extension/src/pairing.ts` — pairing state machine, token/fingerprint regex, `ALLOWED_BRIDGE_HOSTS` guard.
- `apps/extension/src/background/` — `memory-bridge.ts` (200-row cap), `policy.ts`; `features/background/conversation-history.ts` (100 / 30-day).
- `apps/extension/manifest.json`, `THREAT_MODEL.md`, `MANIFEST_NOTES.md`; `packages/types/src/models.json` (model SSOT).

## Competitor notes

Claude for Chrome and ChatGPT/Codex browser tooling classify errors against a single first-party backend and often sync diagnostics to an account. AGI diverges: (1) **multi-provider through one gateway** (`anthropic|openai|ollama|google`), so API errors are gateway-normalized, never provider-host-specific; (2) **per-surface trust** — Chrome is Cloud-only and key-less, so no BYOK/Local key errors here (those live on Desktop/CLI/VS Code); (3) **local-first diagnostics** — device-scoped, never synced; (4) **fail-closed trust errors** — off-allowlist and injection faults abort rather than degrade.

## Acceptance / Definition of Done

Production-ready when every error class above has a cited detection path, trust errors fail closed, cloud errors are correctly classified (retry vs paywall vs auth), and logs carry no PII/tokens/page content.

- [ ] Build: `pnpm --filter @agiworkforce/extension typecheck` and `test` pass; manifest install re-verified after any permission change.
- [ ] Trust: no BYOK/Local error path introduced; trust errors abort and detach CDP; no provider host contacted on any error branch; `THREAT_MODEL.md` updated for new failure modes.
- [ ] Security: gateway origin validated before JWT send; pairing/bridge tokens shape-validated; error bodies truncated; `PaywallRequiredTier` reconciled to Free/Basic/Pro/Max/Enterprise; no support ID claimed until built.

## Anti-patterns

- Treating an off-allowlist or injection error as recoverable, or continuing CDP actions after a trust abort.
- Leaking page content, Clerk/bridge tokens, or provider hostnames into error strings or logs.
- Auto-retrying a `429` paywall instead of routing to server-rendered upgrade UI.
- Emitting or requiring removed tiers (`hobby`, `pro_plus`, `Plus`, `Hobby`) in a paywall error, or any credit-top-up recovery flow.
- Inventing a support-ID header, correlation format, model ID, route, or env var not present in `apps/extension/`.
- Contacting a provider host on a fallback path, or adding a BYOK/Local error branch on this Cloud-only surface.
- Referencing Supabase, or renaming Next.js `proxy.ts` to `middleware.ts`.
