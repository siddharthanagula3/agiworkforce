# AGI Mobile — Volume 34 — Error Codes

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: Grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`, and verified repo paths: `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/services/api.ts`, `apps/mobile/services/llmGate.ts`, `apps/mobile/services/secureFetch.ts`, `apps/mobile/lib/egressGuard.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/offlineQueue.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines the error-code taxonomy AGI Mobile surfaces to users and logs internally — the stable identifiers, the trigger conditions, and the recovery path for each. It covers authentication, network, runtime (companion/remote-control), API, and validation failures.

Mobile's trust shape governs every code. Mobile exposes exactly two trust modes: **Local** (small on-device LLM, free) and **Managed Cloud** (public alpha, open by default). **Mobile has no BYOK** — there is no provider-key entry, so no "invalid API key" class of error exists on this surface. Local-mode failures must never resolve by silently routing to Cloud, and Cloud-mode failures must never leak Local data. The egress guard enforces this as a fail-closed error rather than a fallback (`apps/mobile/lib/egressGuard.ts`). Codes should be machine-stable strings (used in tests and telemetry) with a separate human-readable message; never put raw tokens, payloads, or PII in either field.

## Authentication Errors

Cloud chat keeps a real auth gate; signing in IS the Managed-Cloud entitlement in public alpha (no demo bypass).

- **AUTH_SESSION_EXPIRED** — ✅ Built. HTTP 401 from the managed API triggers one token-refresh-and-retry; if refresh fails, the session facade is cleared and a "Session Expired" alert offers a Sign In action routing to `/(auth)/login` (`apps/mobile/services/api.ts`, `handleUnrecoverableAuth`). Refresh races are de-duped and back off after 3 failures.
- **MOBILE_REMOTE_CHAT_DISABLED** — ✅ Built. `RemoteChatDisabledError` thrown when Cloud chat is off (kill-switch/local-only build); `remoteChatGate` fails closed (`apps/mobile/services/remoteChatGate.ts`).
- **MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED** — ✅ Built. Message constant returned when a local-only build lacks the signed-in entitlement (same file).
- **AUTH_SIGNIN_FAILED** (Clerk native auth errors: wrong credentials, OAuth cancel, network) — 🔭 Planned as a unified mapped code over Clerk's error objects; today raw Clerk errors surface in the AuthView flow (`FEATURES.auth` true in `apps/mobile/lib/v1FeatureFlags.ts`).

## Network Errors

- **NET_TIMEOUT** — ✅ Built. Requests abort on a per-call timeout; uploads translate `AbortError` to "Upload timed out. Please check your connection and try again." (`apps/mobile/services/api.ts`, `TIMEOUTS` in `apps/mobile/lib/constants.ts`).
- **NET_HTTP_ERROR** — ✅ Built. Non-OK responses throw `HTTP <status>` with the body truncated to 500 chars to avoid leaking sensitive data (`apps/mobile/services/api.ts`).
- **EGRESS_BLOCKED_LOCAL_MODE** — ✅ Built. `EgressBlockedError` refuses any our-cloud host while in Local mode, before network I/O; fail-closed when app mode is indeterminate (`apps/mobile/lib/egressGuard.ts`).
- **TLS_PINNING_REFUSED** — 🟡 Partial. `PinningError` exists at the single fetch chokepoint but is dormant: `PINNING_ENFORCED` is off until ops provisions SPKI hashes (`apps/mobile/services/secureFetch.ts`, `apps/mobile/lib/pinning.ts`).
- **NET_OFFLINE_QUEUED** — ✅ Built. Failed/offline requests can be parked for retry via the offline queue rather than hard-failing (`apps/mobile/services/offlineQueue.ts`).

## Runtime Errors — companion failures

Remote Control is **not** a fourth trust mode: the phone is a secure remote window over a session that keeps running on the host (outbound-only, QR + HMAC paired, approval-gated). These codes describe that channel; most are dormant because the companion/dispatch flags are off.

- **COMPANION_INVALID_PAIRING_CODE** — 🟡 Partial. `isValidPairingCode` validates `agiw:<code>[:<64-hex-role-token>]` and rejects malformed scans, but the companion/dispatch features are flagged off (`FEATURES.companion`/`FEATURES.dispatch` false) and not wired to task execution (`apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`).
- **COMPANION_HMAC_REJECTED** — 🟡 Partial. Dispatch payloads are HMAC-signed/validated (`apps/mobile/lib/dispatchHmac.ts`, `apps/mobile/lib/dispatchAgentValidator.ts`); surfaced as a user-facing code only once dispatch ships.
- **COMPANION_CONNECTION_STALE** — 🟡 Partial. Heartbeat/missed-beat staleness and a reconnect countdown exist in the companion helpers and `connectionStore`; not yet a stable user code (`apps/mobile/services/companion.ts`, `apps/mobile/stores/connectionStore.ts`).
- **COMPANION_APPROVAL_DENIED / TIMED_OUT** — 🔭 Planned. Approval-gated action rejection/expiry codes for the remote window.

## API Errors

- **API_PAYWALL** — ✅ Built. HTTP 429 with `{ kind: 'paywall', feature, requiredTier, reason }` becomes `ApiPaywallError` (carrying `feature`, `requiredTier`, `reason`), caught separately and rendered by the paywall sheet (`apps/mobile/services/api.ts`). The `requiredTier` value must map to the canon ladder — **Free / Basic ($8, ₹399) / Pro ($20) / Max ($100 and $200) / Enterprise** — for display; the server currently emits legacy tier strings, and that reconciliation is a tracked task, not a spec license to show retired names.
- **API_LLM_GATE_DISCLOSURE_REQUIRED** — ✅ Built. `Article50DisclosureRequiredError` from the LLM gate routes the user back to the onboarding disclosure (`apps/mobile/services/llmGate.ts`).
- **API_PROVIDER_NOT_OPTED_IN** — ✅ Built. `ChineseHqProviderNotOptedInError` blocks a Chinese-HQ provider the user has not opted into (same file).
- **API_IMAGE_GEN_FAILED** — 🟡 Partial. Image generation is cloud-backed (mobile is not a heavy local image-gen surface); Pro+ gating returns `ApiPaywallError`, but a dedicated generation-failure code is 🔭 (`apps/mobile/lib/v1FeatureFlags.ts` `imageGen`).

## Validation Errors

- **VALIDATION_PAIRING_FORMAT** — ✅ Built. Regex rejection of malformed pairing input (`apps/mobile/services/companion.ts`).
- **VALIDATION_DISPATCH_SCHEMA** — ✅ Built. Dispatch agent/payload schema validation rejects malformed control messages (`apps/mobile/lib/dispatchAgentValidator.ts`; covered by `apps/mobile/__tests__/dispatch-payload-schema.test.ts`).
- **VALIDATION_MODEL_ID_UNKNOWN** — 🔭 Planned. Reject any model ID not present in `packages/contracts/types/src/models.json`; never fall back to a guessed/hardcoded ID.
- **VALIDATION_INPUT_TOO_LARGE / UNSUPPORTED_FILE** — 🔭 Planned. Composer/upload guards for size and MIME type with clear, testable limits.

## Recovery Guidance — user steps

- **Auth expired:** tap **Sign In** on the Session Expired alert; if it recurs, sign out and back in. Local Mode stays usable while signed out.
- **Cloud disabled / sign-in required:** the message states Local Mode remains on-device; sign in to reach Cloud — never presented as BYOK.
- **Egress blocked:** you are in Local mode by design; switch to Cloud mode explicitly (with payload preview/consent) to use managed features. Local data is not auto-sent.
- **Network/timeout:** check connection and retry; queued requests resend automatically when back online.
- **Paywall:** the sheet names the feature and the required canon tier and links to upgrade; no credit top-ups are offered.
- **Companion stale:** wait for the reconnect countdown or re-pair via QR; the host session keeps running locally.

## Repository map

- `apps/mobile/services/{api,remoteChatGate,llmGate,secureFetch,offlineQueue,companion}.ts`
- `apps/mobile/lib/{egressGuard,pinning,dispatchHmac,dispatchAgentValidator,v1FeatureFlags,constants}.ts`
- `apps/mobile/stores/connectionStore.ts`
- `apps/mobile/__tests__/{auth-401,egress-guard,cloud-gate-public-alpha,api-paywall,dispatch-payload-schema,dispatchHmac}.test.ts`
- Shared: `packages/contracts/compliance` (LLM-gate errors), `packages/contracts/types/src/models.json` (model-ID validation source).

## Competitor notes

ChatGPT and Claude mobile expose a narrow set of cloud-account errors (auth, rate limit, network) for a single managed provider and no on-device inference. AGI diverges deliberately: a **dual-mode** taxonomy where Local has its own failure surface (egress block, on-device model availability) distinct from Cloud; multi-provider compliance gating (Article 50 disclosure, Chinese-HQ opt-in) that single-provider apps never need; per-surface trust expressed as errors (fail-closed `remoteChatGate`/`egressGuard`); and a remote-control window with pairing/HMAC/approval failures rather than a fourth cloud mode. Crucially, AGI Mobile has **no BYOK**, so it never shows "invalid API key" — a class both competitors and AGI's own Desktop/CLI/VS Code surfaces carry.

## Acceptance / Definition of Done

Production-ready when every user-facing failure maps to a stable code + safe message, codes are covered by tests, and no error message leaks tokens, payloads, or model IDs absent from `models.json`.

- [ ] Build: each ✅ code has a passing test; messages truncate bodies and omit secrets.
- [ ] Trust: Local-mode failures never auto-route to Cloud; `remoteChatGate`/`egressGuard` fail closed; paywall `requiredTier` renders only canon tiers.
- [ ] Security: 401 refresh/retry/back-off verified; companion HMAC/pairing rejections logged without leaking the role token.

## Anti-patterns

- Adding a BYOK / "invalid API key" error path to Mobile.
- Recovering a Local-mode error by silently sending to Managed Cloud.
- Surfacing retired tier names (Plus, pro_plus, Hobby) in paywall copy, or inventing INR prices for Pro/Max.
- Hardcoding or guessing a model ID in a validation message instead of reading `packages/contracts/types/src/models.json`.
- Claiming the companion/dispatch error codes are shipped while their flags are off, or referencing Supabase.
- Putting raw tokens, request bodies, or PII into a code's message or telemetry.
