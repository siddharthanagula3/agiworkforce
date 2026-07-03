# AGI Web — Volume 19 — API Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (binding canon), and the real routes under `apps/web/app/api/**`, `apps/web/proxy.ts`, `apps/web/lib/{error-handler,errors,csrf,rate-limit}.ts`, `apps/web/lib/server/rls-db.ts`, `packages/utils/src/errors.ts`, `packages/types/src/models.json`.

## Overview & stance

AGI Web is the **cloud-only** surface. Every route here runs under exactly one trust mode — **Managed Cloud** — for a signed-in user. There is **no BYOK and no Local** on Web: the API never accepts user provider keys and never runs on-device inference. Managed Cloud is public alpha, open by default (founder decision 2026-06-27) — routes are subscription/entitlement-gated, never waitlist-gated.

APIs are Next.js 16 App Router route handlers (`app/api/**/route.ts`) fronted by `apps/web/proxy.ts` (exported `proxy` function — never `middleware.ts`). Auth is Clerk; the datastore is Neon Postgres with row-level security; billing is Stripe. Cross-device data sync is the delta-sync family Web itself hosts (`/api/{chat,memory,projects}/sync` ✅), scoped to Managed-Cloud rows only. This volume specifies the wire contract per domain, with Built/Partial/Planned labels.

## Authentication

**✅ Built.** All authenticated routes resolve identity from the Clerk session, not the request body. `apps/web/proxy.ts` wraps `clerkMiddleware`, injects a per-request CSP nonce, and redirects signed-out browser sessions to `/login`. Route handlers call `getClerkAuthUser` (`apps/web/lib/api-auth.ts`) or `getUserScopedDb` (`apps/web/lib/server/rls-db.ts`, which `SET LOCAL ROLE app_rls` + binds the session sub) so `user_id` is always server-derived and RLS `WITH CHECK` is the backstop.

- Mutations require a CSRF token via `requireCsrfToken` (`apps/web/lib/csrf.ts`); token issuance at `GET /api/csrf` (✅).
- Cross-surface handoff: `POST /api/auth/desktop-token` and the device-flow trio `POST /api/auth/device/{code,approve,token}` (✅) mint scoped tokens for Desktop/CLI without exposing web cookies.
- Requirement: unauthenticated requests to protected routes return `401` with the standard error envelope; never leak whether a resource exists (return `404`/`403` per handler).

## Chat

**✅ Built (sync) / 🟡 Partial (surface breadth).** Conversation CRUD and cross-device sync exist; some list endpoints still use fixed caps rather than full cursor paging.

- `GET/POST /api/chat/sync` (✅ `apps/web/app/api/chat/sync/route.ts`) — delta pull by `?since=<server_version>` (conversations + messages + artifacts, including tombstones) and idempotent UPSERT by `id`. Conversation/artifact metadata is last-writer-wins by `updated_at`; messages are append-only (only a `deleted_at` tombstone mutates an existing message). Pull caps: 500 conversations / 1000 messages / 500 artifacts.
- CRUD: `/api/chat/conversations`, `/api/chat/conversations/[id]`, `.../messages`, `/api/chat/sessions`, plus `branch`, `folders`, `bookmarks`, `reactions`, `shortcuts` (✅ dirs present).
- Inference: `POST /api/llm/v1/chat/completions` (✅) is the OpenAI-compatible, streaming gateway; `/api/llm/v2/chat` is the newer path. Model IDs are validated against `packages/types/src/models.json` — never accepted from arbitrary client input.
- Requirement: Local/BYOK rows have no `cloud_id` and must never be pushed/pulled.

## Files

**✅ Built (project knowledge files).** `apps/web/app/api/projects/[id]/knowledge-files/route.ts` and `.../[fileId]` handle upload/list/delete of project-scoped files under RLS. Blob bytes go through the media-storage path (`apps/web/lib/server/media-storage.ts`), not the delta-sync JSON — knowledge-file **bytes are intentionally out of `projects/sync` scope**. General media assets: `/api/media` (✅). Requirement: enforce content-type + size limits and return `413 PAYLOAD_TOO_LARGE` on oversize uploads.

## Images

**✅ Built.** `POST /api/media/image/generate` (`apps/web/app/api/media/image/generate/route.ts`) is a unified, catalog-selected image endpoint: it resolves the engine via `getModelMetadataById`/`getRoutingSlotModel` from `@agiworkforce/types`, gates on subscription/credits, stores output via media-storage, and records the asset. Video: `POST /api/media/video/generate` + `GET /api/media/video/status` (✅). Requirement: never hardcode an engine ID; source it from the catalog.

## Search

**✅ Built.** `POST /api/search` (`apps/web/app/api/search/route.ts`) records a search event and searches the user's sessions/messages under RLS with a validated Zod schema (query ≤ 500 chars, optional role/date/archive filters). Memory search: `GET /api/memory/search?q=` (✅). Requirement: results are user-scoped only; no cross-tenant leakage.

## Projects

**✅ Built.** CRUD at `/api/projects` and `/api/projects/[id]` (✅), with delta sync at `GET/POST /api/projects/sync` (`apps/web/app/api/projects/sync/route.ts`). Sync v1 carries only shareable content — `name`, `description`, `instructions`, `color`, `is_archived`, `metadata`. **Trust-critical:** routing hints (`default_privacy_mode`, `default_provider_mode`, `allowed_surfaces`) are deliberately **not** synced so one device's trust default can't be pushed onto another. Caps: 500 pull / 500 push.

## Memory

**✅ Built.** CRUD at `/api/memory` + `/api/memory/[id]` (✅), delta sync at `GET/POST /api/memory/sync` (`apps/web/app/api/memory/sync/route.ts`). Delta pull by `?since=` returns rows with `server_version > cursor` including `is_deleted` tombstones; POST is idempotent UPSERT, last-writer-wins by `updated_at`. Legacy no-`since` GET returns a status doc for the mobile data-controls UI. Caps: 1000 pull / 1000 push. Local/BYOK memories never sync.

## Settings

**✅ Built (allowlist sync).** `GET/POST /api/settings/sync` (`apps/web/app/api/settings/sync/route.ts`) is a single-JSONB-doc delta guarded by a **fail-closed namespace allowlist** plus a recursive secret-key scrubber — the enforcement point that keeps BYOK keys, local model paths, and device config from ever crossing the trust boundary. Related: `/api/settings/preferences`, `/api/settings/2fa/*`, `/api/settings/api-keys` (platform API keys), `/api/settings/activity`, `/api/settings/audit-logs` (✅). Requirement: settings sync lands last and stays allowlist-gated; a missing namespace under-syncs a preference but can never leak a secret.

## Billing

**✅ Built (Stripe).** Checkout at `POST /api/checkout` (✅), customer portal at `/api/portal`, webhook ingestion at `/api/stripe-webhook` (✅), plus `/api/billing/{analytics,invoices,payment-methods}` and `/api/usage/*`, `/api/sync-subscription`. Plans map to the canon ladder: **Free $0 · Basic $8 (₹399) · Pro $20 · Max $100 & $200 · Enterprise custom**. 🟡 Gap: `packages/types/src/billing-catalog.ts` still encodes retired tiers (`pro_plus`/Plus/Hobby and a credit-topup path) — reconciliation is a separate tracked task; specs use the canon ladder and there are **no credit top-ups** (the `/api/credit-topup` path stays env-gated off).

## Responses

**✅ Built.** JSON responses via `NextResponse.json`. Success bodies are domain-shaped (e.g. `{ conversations, messages, artifacts, cursor, hasMore }` for sync). Streaming chat uses server-sent chunks from `/api/llm/v1/chat/completions`. Every error is the uniform envelope `{ error: { code, message, details? }, requestId }`. Public model metadata is served cacheably at `GET /api/models` (✅, sourced from `models.json`). Requirement: never echo raw SQL/Stripe/Neon messages in a response body.

## Errors

**✅ Built.** `apps/web/lib/error-handler.ts` (`handleError`/`withErrorHandler`) maps thrown `AppError`s (codes in `packages/utils/src/errors.ts`: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMIT_EXCEEDED`, `PAYMENT_REQUIRED`, `PAYLOAD_TOO_LARGE`, `STRIPE_ERROR`, `CLOUD_DB_ERROR`, `TIMEOUT`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, …) to HTTP status. Internal messages are logged server-side; clients get generic per-status text except for a small `SAFE_TO_EXPOSE_CODES` set (`CREDIT_REQUIRED`, `SUBSCRIPTION_REQUIRED`, `RATE_LIMITED`, `VALIDATION_ERROR`, `INVALID_MODEL`, `CSRF_REQUIRED`) whose `message`/`details` drive recovery UI. Zod failures become `400 VALIDATION_ERROR` with a `path`/`message` list.

## Pagination

**✅ Built (cursor sync) / 🟡 Partial (list routes).** The sync family is **cursor-based**: pass `?since=<server_version>`, receive `{ cursor, hasMore }` and page until `hasMore` is false; tombstones ride the same stream so deletes propagate. Bounded page sizes (`MAX_*_PULL`/`MAX_*_PUSH`) cap each response. 🟡 Gap: some list endpoints (e.g. chat conversation search) still use fixed `limit 50` slices rather than opaque cursors — planned to migrate to the cursor contract. Requirement: never return unbounded result sets.

## Repository map

- `apps/web/proxy.ts` — auth + CSP edge (`export const proxy`).
- `apps/web/app/api/{chat,memory,projects,settings}/sync/route.ts` — delta-sync family (✅).
- `apps/web/app/api/{chat,projects,memory}/**` — CRUD; `apps/web/app/api/llm/v1/chat/completions` + `llm/v2/chat` — inference gateway.
- `apps/web/app/api/media/{image,video}/**`, `.../projects/[id]/knowledge-files/**` — media + files.
- `apps/web/app/api/{checkout,portal,stripe-webhook,billing,usage}/**` — billing.
- `apps/web/lib/{error-handler,errors,csrf,rate-limit,api-auth}.ts`, `apps/web/lib/server/rls-db.ts`, `packages/utils/src/errors.ts`, `packages/types/src/models.json`.

## Competitor notes

Claude, ChatGPT, and Codex expose single-vendor cloud APIs keyed to their own models. AGI Web's deliberate divergence: it is one surface of a six-surface suite, so its API is a **multi-provider, catalog-driven** gateway (`models.json` SSOT) rather than a house-model endpoint, and it enforces **per-surface trust** in the wire contract — Web accepts no BYOK keys and runs no Local inference, while Desktop/CLI/VS Code do. The delta-sync APIs are designed so Local/BYOK data physically cannot enter the cloud store, a boundary the single-vendor APIs don't need to model.

## Acceptance / Definition of Done

Production-ready when every route derives identity server-side, mutations require CSRF, all queries run under RLS, errors use the uniform envelope, and no route accepts a BYOK key or Local payload.

- [ ] Build: every `route.ts` wraps `withErrorHandler` + `withRateLimit`; success and error shapes covered by tests (e.g. `apps/web/app/api/projects/__tests__`).
- [ ] Trust: sync routes reject rows lacking `cloud_id`; settings sync passes the allowlist + scrubber test; no route reads `user_id` from the body.
- [ ] Security: CSRF enforced on mutations; internal DB/Stripe messages never in response bodies; model IDs validated against `models.json`.

## Anti-patterns

- Adding a BYOK key field or Local execution path to any Web route (trust-boundary violation).
- Trusting `user_id` from the request body instead of the Clerk session / RLS.
- Renaming `proxy.ts` to `middleware.ts` or dropping the exported `proxy`.
- Hardcoding a model/engine ID instead of resolving from `packages/types/src/models.json`.
- Referencing removed tiers (Plus/`pro_plus`/Hobby) or reintroducing credit top-ups; inventing INR prices for Pro/Max.
- Any Supabase reference (fully migrated to Clerk + Neon + Stripe).
- Leaking raw SQL/Stripe/Neon error text; returning unbounded, uncapped result sets.
