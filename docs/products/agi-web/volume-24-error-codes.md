# AGI Web — Volume 24 — Error Codes

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`. Grounded in real repo code: `packages/types/src/errors.ts`, `packages/utils/src/errors.ts`, `apps/web/lib/errors.ts`, `apps/web/lib/error-handler.ts`, `apps/web/lib/friendlyErrors.ts`, `apps/web/lib/db-error.ts`, `apps/web/lib/rate-limit.ts`, `apps/web/lib/logger.ts`, `apps/web/lib/sentry-shared.ts`, `apps/web/app/api/chat/sync/route.ts`, `apps/web/proxy.ts`.

## Overview & stance

AGI Web is the **cloud-only** surface — no Local mode, no BYOK. Its error taxonomy therefore never contains BYOK-key faults or local-runtime faults (those live in the Desktop/CLI/VS Code volumes). Web errors come from three places: **Managed-Cloud** LLM/tool execution, **account/billing** (Clerk + Stripe), and **Neon delta-sync** (`app/api/{chat,memory,projects}/sync`). Every route funnels through one structured handler so machine-readable codes and safe messages are consistent, and so Neon/SQL internals never leak to the client. Because Web is subscription-backed through account state, quota/plan errors must map cleanly to the pricing ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) — never to credit top-ups, which are removed policy.

## API Errors

**✅ Built** — `packages/types/src/errors.ts` defines the canonical `ErrorCode` enum (`UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `INVALID_INPUT`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `RATE_LIMIT_EXCEEDED`, `STRIPE_ERROR`, `CLOUD_DB_ERROR`, `PGRST116`, `NETWORK_ERROR`, `PAYLOAD_TOO_LARGE`, `INVALID_RESPONSE`, `PAYMENT_REQUIRED`) plus `HTTP_STATUS_TO_ERROR_CODE` / `ERROR_CODE_TO_HTTP_STATUS` bidirectional maps. `AppError` and the `createError.*` factory (`packages/utils/src/errors.ts`, re-exported via `apps/web/lib/errors.ts`) carry `code`, `message`, `statusCode`, and optional `details`.

**✅ Built** — `apps/web/lib/error-handler.ts` `handleError()` returns `NextResponse.json({ error: { code, message, details? }, requestId }, { status })`. It applies `GENERIC_MESSAGES` per status class (400/401/403/404/408/409/422/429/500/502/503) and only forwards the raw message + `details` for an allowlist `SAFE_TO_EXPOSE_CODES` set; all other codes (especially `CLOUD_DB_ERROR`) get a generic summary while the original is logged server-side (WEB-10). Route handlers wrap with `withErrorHandler()`; the sync routes already do (`apps/web/app/api/chat/sync/route.ts` GET/POST). Requirement: no route may hand-roll `NextResponse.json({ error })` — it must throw `createError.*` and let the wrapper serialize.

**🟡 Partial** — sync conflict semantics exist but return generic `CONFLICT`/`INTERNAL_ERROR`. `apps/web/app/api/chat/sync/route.ts` enforces append-only messages and tombstone-only updates via `on conflict (id) do update`, but a rejected non-tombstone mutation surfaces as `Failed to push sync changes` (500) rather than a dedicated sync-conflict code with the offending row. Gap: add a `SYNC_CONFLICT` code + per-row rejection list.

## User Errors

**✅ Built** — user-facing translation lives in `packages/utils/src/errors.ts` (`getFriendlyError`, `getFriendlyErrorByCode`) and is re-exported by `apps/web/lib/friendlyErrors.ts`. `AppError`s map by code to `{ title, message, suggestion, icon }`; free-text errors are pattern-matched into friendly buckets: network, timeout, auth (401), rate-limit (429, with a parsed `retry after` hint), quota/billing, model-not-found, provider-capability mismatch (structured-output / thinking / effort unsupported → "switch to Auto routing"), and stream-watchdog. **ERR-002** guarantees the string "MCP" is never shown to a user. Requirement: Web chat/tool failures render the friendly title + suggestion, never a raw provider or SQL string.

**✅ Built** — auth/permission user errors: `UNAUTHORIZED` → "Sign In Required"; `FORBIDDEN` → "Access Denied". These fire from Clerk-guarded routes; Web never presents a BYOK-key error because BYOK does not exist here.

## Validation

**✅ Built** — request validation is Zod-first. `apps/web/lib/error-handler.ts` detects Zod errors (objects with `issues`) and rebuilds them via `createError.validation()` into a `VALIDATION_ERROR` (400) whose `details` is a `path` + `message` array — always client-safe (`VALIDATION_ERROR` is in `SAFE_TO_EXPOSE_CODES`). The sync route validates JSON parse and payload shape (`createError.validation('Invalid JSON body')`, `createError.validation('Invalid sync payload', parsed.error)`).

**🟡 Partial** — model-selection validation. An invalid model must be rejected against the catalog in `packages/types/src/models.json` (never a hardcoded list). Web has an `INVALID_MODEL` recovery code referenced in the safe-expose set (below) but there is no single grounded validator module cited here; treat catalog validation as the requirement and wire the code to a real check.

## Recovery

**✅ Built** — recovery-driving codes are surfaced verbatim. `apps/web/lib/error-handler.ts` `SAFE_TO_EXPOSE_CODES` = `CREDIT_REQUIRED`, `SUBSCRIPTION_REQUIRED`, `RATE_LIMITED`, `VALIDATION_ERROR`, `INVALID_MODEL`, `CSRF_REQUIRED` — the client uses these to render targeted recovery UI (upgrade prompt, retry, refresh CSRF, switch model). Rate-limit recovery is fully wired in `apps/web/lib/rate-limit.ts`: 429 responses carry `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. `getContextualError` (`packages/utils/src/errors.ts`) adds per-operation suggestions (`send_message`, `save_settings`, `upload_file`, `connect_service`, `search`, `tool_execution`) and downgrades "try again" when `canRetry === false`.

**✅ Built** — service-outage recovery. `apps/web/lib/db-error.ts` `isDbUnavailableError` classifies Neon/network faults (`ECONNREFUSED`/`ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND` / "fetch failed") so callers can degrade to `SERVICE_UNAVAILABLE` (503) with a retry suggestion instead of a hard 500.

**🟡 Partial** — recovery codes drift from the canonical enum. `SAFE_TO_EXPOSE_CODES` uses `RATE_LIMITED`/`CREDIT_REQUIRED`/`SUBSCRIPTION_REQUIRED`, but `ErrorCode` (`packages/types/src/errors.ts`) defines `RATE_LIMIT_EXCEEDED`/`PAYMENT_REQUIRED` and no subscription/credit codes. `PAYMENT_REQUIRED` → "Upgrade Required" must route to the plan ladder, and `CREDIT_REQUIRED` is **legacy** — top-ups are removed policy (route stays env-gated off), so it must not drive a "buy credits" flow. Gap: reconcile these string codes into the enum (tracked billing-catalog reconciliation).

## Logging

**✅ Built** — server logging uses pino (`apps/web/lib/logger.ts`, level from `LOG_LEVEL`). `handleError` logs the full original error (code, message, `details`, statusCode, `requestId`, and stack for unknown 500s) at `error`/`warn` while returning only the scrubbed summary. Neon/SQL specifics are logged, never returned.

**✅ Built** — crash telemetry is privacy-first. `apps/web/lib/sentry-shared.ts` is **disabled unless `NODE_ENV === 'production'` AND a DSN is set**, runs `sendDefaultPii: false`, and `scrubEvent`/`redactDeep` strip request bodies, cookies, all headers, query strings, and redact any key matching `SENSITIVE_KEY` (authorization, api-key, token, prompt, message, content, conversation, email, etc.). Only a stable user `id` is kept. Requirement: no prompt, message, or key value may reach Sentry.

## Support IDs

**🟡 Partial** — every error response includes a `requestId` field (`apps/web/lib/error-handler.ts`), read from the inbound `x-request-id` header and echoed into both the response body and the log line, giving a correlation key across client → API → pino → Sentry. Gap: no server-side generator was found in `apps/web/proxy.ts` or instrumentation, so `requestId` is only populated when an upstream (edge/proxy) supplies the header — otherwise it is `undefined`.

**🔭 Planned** — user-visible support ID. The client should render the `requestId` (or Sentry event id) in the error card ("Reference: …") so a user can quote it to support, and proxy/edge should always mint one. Not yet built.

## Repository map

- `packages/types/src/errors.ts` — canonical `ErrorCode` enum, status↔code maps, `ApiError`.
- `packages/utils/src/errors.ts` — `AppError`, `createError.*`, `getFriendlyError`, `getContextualError`.
- `apps/web/lib/errors.ts` — Web re-export shim.
- `apps/web/lib/error-handler.ts` — `handleError`, `withErrorHandler`, safe-expose allowlist, WEB-10 scrub.
- `apps/web/lib/friendlyErrors.ts` — Web friendly-message surface.
- `apps/web/lib/db-error.ts` — Neon/network unavailability classifier.
- `apps/web/lib/rate-limit.ts` — 429 + `Retry-After`/`X-RateLimit-*` headers.
- `apps/web/lib/logger.ts`, `apps/web/lib/sentry-shared.ts` — logging + scrubbed telemetry.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — sync error/conflict paths.

## Competitor notes

Claude, ChatGPT, and Codex expose a single-provider error taxonomy (e.g. one vendor's `rate_limit_error`, `invalid_api_key`) and lean on an opaque request-id. AGI diverges deliberately: (1) **multi-provider** — provider-capability mismatches (structured output / thinking / effort) are caught and translated to a "switch to Auto routing" suggestion instead of leaking a vendor payload; (2) **per-surface trust** — Web's taxonomy has no BYOK-key or local-runtime error class because those modes are absent here, unlike Desktop/CLI/VS Code; (3) **leak-safe by default** — WEB-10 + the Sentry scrubber ensure DB internals and prompts never leave the process, a stricter posture than typical hosted assistants. Competitors are parity references only; copy no proprietary codes or copy.

## Acceptance / Definition of Done

Production-ready when every Web route throws `createError.*`/`AppError` and is wrapped by `withErrorHandler`, responses carry `{ code, message, requestId }`, no unsafe code leaks DB/provider internals, quota/plan errors route to the ladder (no top-ups), and telemetry stays scrubbed.

- [ ] Build: all `app/api/**` handlers use `withErrorHandler`; no ad-hoc `NextResponse.json({ error })`; Zod → `VALIDATION_ERROR` with safe `details`.
- [ ] Trust: no BYOK/Local error class on Web; `PAYMENT_REQUIRED` maps to Free/Basic/Pro/Max/Enterprise, never credit top-ups; sync returns generic `CONFLICT` without exposing row internals.
- [ ] Security: `CLOUD_DB_ERROR`/`INTERNAL_ERROR` never return raw messages/`details`; Sentry disabled outside prod-with-DSN and scrubs prompts/keys/headers; `requestId` present and never contains PII.

## Anti-patterns

- Returning raw Neon/SQL/PGRST or provider strings to the client (violates WEB-10) — always throw a coded `AppError`.
- Adding a BYOK-key, local-runtime, or credit-top-up error/recovery path to Web (top-ups removed; BYOK/Local absent).
- Inventing model IDs, INR prices, or new status codes — model IDs come from `packages/types/src/models.json`; INR is fixed only for Basic (₹399).
- Referencing removed tiers (Plus, `pro_plus`, Hobby) in `PAYMENT_REQUIRED` upgrade copy.
- Logging prompts/messages/keys, or disabling the Sentry scrubber; referencing Supabase (fully migrated to Neon).
- Letting `SAFE_TO_EXPOSE_CODES` drift further from `ErrorCode` — reconcile, don't fork.
