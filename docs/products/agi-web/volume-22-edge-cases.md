# AGI Web — Volume 22 — Edge Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon). Grounded in real repo paths: `apps/web/lib/{error-handler,errors,rate-limit,csrf}.ts`, `apps/web/proxy.ts`, `apps/web/lib/server/{rls-db,media-storage}.ts`, `apps/web/app/api/{chat/sync,llm/v2/chat,completion}/route.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts`, `apps/web/lib/runtime/WebChatRuntime.ts`, `apps/web/components/OfflineIndicator.tsx`, `apps/web/lib/offline/{offlineQueue,offlineSync}.ts`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts`, `apps/web/lib/services/credit-service.ts`, `apps/web/app/api/stripe-webhook/lib/idempotency.ts`, `packages/types/src/chat.ts`.

## Overview & stance

AGI Web is the **cloud-only** surface: no BYOK, no Local mode — never add either. That single trust boundary shapes every failure path here. With no local disk to fall back to and no user-key path to reroute through, an edge case can only resolve inside **Managed Cloud** (public alpha, open by default for signed-in users; founder decision 2026-06-27) or degrade gracefully — never silently crossing a trust boundary. The offline queue below is a **device-local buffer**, not a Local trust mode: it holds pending mutations in the browser and flushes to the Neon delta-sync APIs Web hosts (`apps/web/app/api/{chat,memory,projects}/sync`). Local/BYOK rows do not exist here, so no error path can leak into or out of them. Each requirement is testable and carries a Built-vs-Planned label.

## No Internet

✅ Built (core) / 🔭 Planned (live streaming offline). Web detects connectivity via `navigator.onLine` plus `window` online/offline events and an `/api/health` HEAD probe, surfaced by `apps/web/components/OfflineIndicator.tsx` (banner with status, queued count, sync state, retry). Mutations buffer in `apps/web/lib/offline/offlineQueue.ts` (localStorage key `agi_offline_queue`, backed by shared `@agiworkforce/runtime/offline-queue`) and drain through `apps/web/lib/offline/offlineSync.ts` on reconnect. Requirements: the offline banner MUST appear within one health-probe interval; queued writes MUST replay idempotently against the delta-sync endpoints (see Duplicate Requests) and never drop on reload. Live LLM **streaming** cannot proceed offline — the request MUST fail fast with a retryable, non-destructive error (resumable generation is 🔭).

## Upload Failure

🟡 Partial. The knowledge-file write (`apps/web/app/api/projects/[id]/knowledge-files/route.ts`) validates type/size, requires a non-empty `mimeType`, and is guarded by `requireCsrfToken` + `withRateLimit`; object bytes live in Vercel Blob (`apps/web/lib/server/media-storage.ts`). The gap: the route assumes `storageUri` **already exists** — the signed-upload contract (`SignedUploadRequest`/`SignedUploadResponse` in `packages/types/src/chat.ts`) has no Web endpoint, so a partial byte upload is not yet transactional with the metadata row. Requirements: on failure the UI MUST show a specific, retryable reason (network, too-large, unsupported, server); a failed upload MUST NOT leave an orphaned metadata row or orphaned bytes; retries MUST reuse the same checksum-addressed object key. No Local/BYOK fallback may appear when an upload fails.

## Rate Limits

✅ Built. `apps/web/lib/rate-limit.ts` enforces per-endpoint budgets (`rateLimitConfigs`) via `withRateLimit`, returning **429** with `Retry-After` and `X-RateLimit-{Limit,Remaining,Reset}` headers, logged to the security-audit trail. Expensive/abuse-prone endpoints (`llm-completion`, `llm-streaming`, `image-generation`, auth/2FA) are `failClosed: true`; Redis is **required in production** (SEV-WEB-13 fail-fast at cold start). Buckets key by verified `user.id` when passed, else by right-most-IP (SEV-WEB-09: never off an unverified JWT `sub`). Requirements: the UI MUST honor `Retry-After` (backoff, disable resend, countdown) and MUST NOT hot-loop a 429; per-tier quotas (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) are 🔭 — do not invent per-tier numbers, and no credit top-ups apply.

## Timeout

🟡 Partial. `apps/web/app/api/completion/route.ts` sets `export const maxDuration = 30`; the shared handler maps timeouts to **408 "Request timed out"** (`apps/web/lib/error-handler.ts`). Long LLM calls run under `request.signal`/`AbortController` (`apps/web/app/api/llm/v2/chat/route.ts`), and the client aborts per-conversation via `AbortController` in `apps/web/lib/runtime/WebChatRuntime.ts`. Gap: `maxDuration` is not declared uniformly across every LLM/streaming route. Requirements: every long-running route MUST bound its duration and abort the upstream provider call on client disconnect (no zombie spend); a timeout MUST refund reserved credits (see Streaming Failure) and present a retry, not a silent hang.

## Expired Session

✅ Built (enforcement) / 🟡 (graceful client re-auth). Auth is Clerk via `apps/web/proxy.ts` (`clerkMiddleware` — the exported `proxy` function, **never** `middleware.ts`). Expired requests resolve to **401 "Authentication required"** (`GENERIC_MESSAGES[401]` in `error-handler.ts`), and `getUserScopedDb` (`apps/web/lib/server/rls-db.ts`) binds the verified session subject so RLS `WITH CHECK` is the DB backstop — an expired token can never touch another user's rows. Gap: a smooth client re-auth (silent refresh, preserved draft, resume after sign-in) is only partially wired. Requirements: on 401 the UI MUST route to sign-in without data loss and MUST NOT retry signed-out calls in a loop ("no signed-out API spam").

## Large Files

✅ Built. A hard per-file cap `MAX_ATTACHMENT_BYTES = 25 MiB` lives in `packages/types/src/chat.ts`, enforced client-side by `validateAttachmentFile()` and server-side in the knowledge-file POST (MiB-accurate rejection message). Sync payloads are bounded independently: `apps/web/app/api/chat/sync/route.ts` caps push/pull rows (`MAX_MESSAGES_PUSH`, `MAX_CONVERSATIONS_PULL`, etc.) and zod-limits field sizes (message `content` ≤ 1,000,000 chars, artifact `content` ≤ 2,000,000). Requirements: oversized input MUST be rejected **before** transmit with a clear reason; the paginated pull cursor MUST NOT skip rows when a page saturates (`computePullCursor` invariant). Per-tier storage/volume quotas are 🔭.

## Duplicate Requests

✅ Built. Chat sync is idempotent by **client-supplied UUID**: messages are append-only (`on conflict (id) do update` only advances a `deleted_at` tombstone) and conversations/artifacts UPSERT last-writer-wins (`apps/web/app/api/chat/sync/route.ts`), so a replayed offline queue or double-submit cannot duplicate rows. Billing uses `CreditService.generateIdempotencyKey` (`apps/web/lib/services/credit-service.ts`) for reserve/refund/charge, and Stripe events dedupe via `apps/web/app/api/stripe-webhook/lib/idempotency.ts`. State-changing routes require CSRF (`apps/web/lib/csrf.ts`, `requireCsrfToken`). Requirement: any new write path MUST carry an idempotency or natural unique key so retries are safe.

## Streaming Failure

🟡 Partial. The client reads SSE via `apps/web/lib/runtime/WebChatRuntime.ts` (`TextDecoder` loop, per-conversation `AbortController`), emitting a structured `error` event on non-OK status, missing body, or read failure. Server-side, `apps/web/app/api/llm/v2/chat/route.ts` **refunds reserved credits** on stream error and maps upstream `429`/rate-limit to a typed error; `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` reconciles usage in `flush()` and passes malformed chunks through rather than crashing the stream. Gap: **resuming a dropped partial stream** is 🔭. Requirements: a mid-stream failure MUST persist the partial assistant message, refund unspent credits, and offer regenerate/continue — never a blank bubble.

## Server Errors

✅ Built. `apps/web/lib/error-handler.ts` normalizes every API error: `GENERIC_MESSAGES` per status class (500/502/503 → "Internal server error" / "Upstream service error" / "Service temporarily unavailable"), a `requestId` echoed to the client for correlation, and WEB-10 leak prevention — raw DB/SQL/constraint details are logged server-side and dropped from the body unless the code is in `SAFE_TO_EXPOSE_CODES` (e.g. `RATE_LIMITED`, `VALIDATION_ERROR`, `SUBSCRIPTION_REQUIRED`). Zod and unknown errors funnel through the same wrapper (`withErrorHandler`). Requirements: no route may return a stack trace, table name, or provider secret; 5xx responses MUST be retryable-safe (idempotent writes) and surface a friendly message + `requestId`, with no visible console errors beyond intentional dev-key warnings.

## Repository map

- `apps/web/lib/{error-handler,errors}.ts` — error normalization, leak prevention, generic messages.
- `apps/web/lib/rate-limit.ts` — per-endpoint 429 limits, `Retry-After`, fail-closed, Redis-required guard; `apps/web/lib/csrf.ts` — `requireCsrfToken` on writes.
- `apps/web/proxy.ts`, `apps/web/lib/server/rls-db.ts` — Clerk session gate + RLS-scoped DB (401).
- `apps/web/app/api/chat/sync/route.ts` — idempotent delta-sync UPSERT, payload caps, pull cursor.
- `apps/web/app/api/{llm/v2/chat,completion}/route.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts`, `apps/web/lib/runtime/WebChatRuntime.ts` — streaming, timeout, credit refund, client SSE reader.
- `apps/web/components/OfflineIndicator.tsx`, `apps/web/lib/offline/{offlineQueue,offlineSync}.ts` — offline queue.
- `apps/web/app/api/projects/[id]/knowledge-files/route.ts`, `apps/web/lib/server/media-storage.ts`, `packages/types/src/chat.ts` — upload validation, storage, size caps.
- `apps/web/lib/services/credit-service.ts`, `apps/web/app/api/stripe-webhook/lib/idempotency.ts` — idempotency keys.

## Competitor notes

Claude, ChatGPT, and Codex handle these edges with retryable errors, streaming reconnection, and rate-limit backoff. AGI's deliberate divergence is **per-surface trust**: on Web every failure resolves inside one Managed-Cloud boundary — no "fall back to Local" or "reroute via your key" escape hatch that Desktop/CLI/VS Code have. Provider-neutrality lives at the model layer (IDs only from `packages/types/src/models.json`), never by exposing user keys. The offline queue is a local **buffer** that flushes to AGI's own Neon delta-sync (Web ↔ Mobile ↔ Desktop), not a device trust mode.

## Acceptance / Definition of Done

Production-ready when every edge path degrades safely: no data loss, no leaked internals, no trust-boundary crossing, no infinite retry loops.

- [ ] Build: 408/429/5xx map to friendly messages + `requestId`; offline queue replays idempotently; timeouts abort upstream and refund credits; oversized input rejected before transmit.
- [ ] Trust: no Local/BYOK affordance in any error/offline/upload path; failures stay inside Managed Cloud; sync only via `apps/web/app/api/{chat,memory,projects}/sync`.
- [ ] Security: RLS + `FORCE ROW LEVEL SECURITY` on 401 paths; CSRF + rate limit on writes; no DB/provider details in bodies; Redis-backed limits in production.

## Anti-patterns

- Adding a Local or BYOK fallback when a cloud request fails (trust-boundary violation).
- Hot-looping on 429/401/5xx instead of honoring `Retry-After` and routing to sign-in.
- Leaking SQL/table/constraint/provider-secret detail in an error body (bypassing `SAFE_TO_EXPOSE_CODES`).
- Dropping a partial assistant message on stream failure, or failing to refund reserved credits.
- Non-idempotent writes that duplicate rows on offline-queue replay.
- Claiming resumable-streaming, transactional uploads, or uniform timeouts as shipped — keep them 🔭/🟡.
- Inventing per-tier quotas, INR prices, or model IDs; referencing removed tiers ("Plus"/`pro_plus`/"Hobby"); adding credit top-ups.
- Referencing Supabase, or using `middleware.ts` instead of `proxy.ts`.
