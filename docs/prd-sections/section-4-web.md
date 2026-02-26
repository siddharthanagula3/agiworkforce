# Section 4 — Web Application

> PRD: AGI Workforce
> Last updated: 2026-02-26

---

## 4.1 Overview

The AGI Workforce web application is a full-stack Next.js 16 application that serves as both a standalone AI chat product and the account/billing layer for the desktop client. It provides plan management, credit tracking, media generation, conversation history, and the authoritative identity layer that desktop instances sync against.

The web app is deployed on Vercel (serverless, per-route `maxDuration` configuration) and uses Supabase as the primary database and authentication provider. All LLM and media generation requests are credit-gated and routed through server-side API routes — no provider API keys are exposed to the browser.

---

## 4.2 Technology Stack

| Category | Technology | Notes |
|---|---|---|
| Framework | Next.js 16, App Router | Server Components + Server Actions |
| Language | TypeScript (strict mode) | All files `.ts` / `.tsx` |
| Database / Auth | Supabase (PostgreSQL, Auth, SSR) | Row-level security on all tables |
| Payments | Stripe SDK, API version `2026-02-25.clover` | Webhook + portal + checkout |
| Rate Limiting | Upstash Redis + `@upstash/ratelimit` | Per-user and per-IP |
| State | Zustand v5 + Immer + Persist | See §4.9 for store catalog |
| Validation | Zod v4 (`.strict()` schemas) | All API route inputs |
| UI | Radix UI, Tailwind CSS v4, Lucide icons, Sonner toasts | |
| Markdown | `react-markdown`, `remark-gfm`, KaTeX | Chat messages + docs |
| Logging | Pino + pino-pretty | Structured JSON in prod |
| i18n | i18next, react-i18next | Languages: `en`, `es` |
| Testing | Playwright (e2e), Vitest, MSW | |
| Deploy | Vercel serverless | `maxDuration` set per route |

---

## 4.3 Page Routes

### 4.3.1 Public Routes

| Route | Purpose | Notes |
|---|---|---|
| `/` | Landing page | Marketing, hero, feature highlights |
| `/pricing` | Plan comparison | Billing interval toggle, upgrade CTA, waitlist CTA for Pro/Max |
| `/download` | Desktop app download | Links to platform builds, beta channel |
| `/login` | Email/password login | Redirects via `?next=` after success |
| `/signup` | New account registration | Creates Supabase user, initialises credit account |
| `/forgot-password` | Password reset request | Sends reset email via Supabase Auth |
| `/auth/update-password` | Password reset landing | Consumes token from email link |
| `/verify` | Email verification | Processes Supabase verification token |
| `/privacy` | Privacy policy | Static |
| `/terms` | Terms of service | Static |
| `/about` | About page | Static |
| `/contact` | Contact page | Form submits to support queue |
| `/faq` | FAQ | Static, expandable accordions |
| `/get-started` | Onboarding guide | Step-by-step setup walkthrough |
| `/docs` | Documentation | MDX-based, full-text searchable |

### 4.3.2 Authenticated Routes

All authenticated routes validate the Supabase session in middleware. Unauthenticated requests are redirected to `/login?next=<original-path>`.

| Route | Purpose | Notes |
|---|---|---|
| `/chat` | Main AI chat interface | Model selector, message history, streaming |
| `/dashboard` | Main dashboard hub | Summary cards, quick actions |
| `/dashboard/billing` | Subscription management | Plan status, top-up credits, invoice history |
| `/dashboard/chat` | Chat history | Conversation list, search, delete |
| `/dashboard/settings` | User and app settings | Theme, model defaults, notifications |
| `/dashboard/media` | Media generation | Image and video generation UI |
| `/dashboard/usage` | Analytics | Token usage, credit consumption charts |
| `/payment-failure` | Post-checkout failure | Retry/support CTA |
| `/diagnose` | Debug/diagnostic tool | Dev/support use only |

---

## 4.4 API Endpoint Catalog

All state-changing endpoints require a valid CSRF token passed via the `X-CSRF-Token` header. Server modules import `'server-only'` to prevent accidental client-side execution. All request bodies are validated with Zod `.strict()` schemas before processing.

### 4.4.1 Authentication Endpoints (`/api/auth/`)

| Method | Path | Auth | Rate Limit | Purpose |
|---|---|---|---|---|
| POST | `/api/auth/sso` | None | 10/min per IP | Enterprise SSO login via SAML/OIDC; exchanges assertion for Supabase session |
| GET | `/api/auth/sso-check` | None | 30/min per IP | Check SSO availability for a given email domain; returns provider config |
| POST | `/api/auth/security` | Session | 20/min per user | Security event logging (failed logins, suspicious actions) |
| GET | `/api/auth/directory-sync` | Admin token | — | List enterprise directory sync records (users/groups) |
| POST | `/api/auth/directory-sync` | Admin token | — | Trigger or update enterprise directory sync |

**FR-W01: SSO Login Flow** — The `/api/auth/sso` endpoint must accept a SAML assertion or OIDC callback, validate the assertion against the stored IdP metadata, and exchange it for a Supabase session. The response must set a secure, HttpOnly session cookie.

**FR-W02: Domain-Based SSO Lookup** — `/api/auth/sso-check` must accept an `email` query parameter, extract the domain, and return the configured SSO provider (or `null` if none) so the login page can present the correct authentication method automatically.

### 4.4.2 Billing and Subscription Endpoints

| Method | Path | Auth | Rate Limit | Purpose |
|---|---|---|---|---|
| POST | `/api/checkout` | Session | Per-user, 5/min | Create Stripe Checkout session for new subscription |
| POST | `/api/portal` | Session | Per-user, 5/min | Create Stripe Billing Portal session for existing subscriber |
| POST | `/api/credit-topup` | Session | Per-user, 3/min | Create Stripe Checkout session for one-time credit purchase ($10–$1,000); Max plan only |
| POST | `/api/stripe-webhook` | Stripe signature | N/A (Stripe-controlled) | Ingest and process Stripe webhook lifecycle events |
| GET | `/api/cron/reset-credits` | Cron secret header | N/A | Monthly credit reset job, invoked by Vercel Cron |
| POST | `/api/sync-subscription` | Session | 5/min | Sync Stripe subscription state into Supabase `profiles` table |

**Stripe Webhook Events Handled:**

| Event | Action |
|---|---|
| `checkout.session.completed` | Activate subscription, set `stripe_customer_id` in profile, initialise credit account |
| `customer.subscription.created` | Insert subscription record, set tier in profile |
| `customer.subscription.updated` | Update tier, status, period end date |
| `customer.subscription.deleted` | Downgrade to free tier, preserve credit balance for grace period |
| `customer.subscription.trial_will_end` | Queue trial-ending notification email |

**FR-W03: Checkout Session** — `/api/checkout` must validate that the user does not already have an active subscription before creating a session. The `success_url` must include `?session_id={CHECKOUT_SESSION_ID}` for reconciliation. Open redirect prevention: the `success_url` and `cancel_url` origins must be validated against the CORS allowlist.

**FR-W04: Credit Top-Up** — Top-up is restricted to Max-tier and Enterprise users. Amount must be between $10 and $1,000. The resulting credit grant is one-time, non-expiring, and separate from the monthly allocation.

**FR-W05: Webhook Idempotency** — All Stripe webhook handlers must use the Stripe event `id` as an idempotency key to prevent double-processing on Stripe retries.

**FR-W06: Monthly Credit Reset** — The Vercel Cron job must run on the first day of each calendar month UTC. It must reset monthly allocations without touching one-time top-up balances or daily allocations.

### 4.4.3 LLM / AI Endpoints

| Method | Path | Auth | Rate Limit | maxDuration | Purpose |
|---|---|---|---|---|---|
| POST | `/api/llm/completion` | Bearer token | Per-user (tier-based) | 120s | Full LLM completion with credit gating, SSE streaming |
| POST | `/api/llm/v1/chat/completions` | Bearer token | Per-user (tier-based) | 120s | OpenAI-compatible completions endpoint |

**FR-W07: Credit-Gated LLM Completion** — Before forwarding to any LLM provider, the completion endpoint must call `check_credits_available` via Supabase RPC. If insufficient credits, return HTTP 402 with a `credit_balance` field in the error body. Credits are reserved at request start and reconciled (actual token cost) after the response completes.

**FR-W08: SSE Streaming** — The `/api/llm/completion` endpoint must stream responses using Server-Sent Events with `Content-Type: text/event-stream`. Each event must carry a `delta` field. A final `[DONE]` event signals stream end.

**FR-W09: TTFT SLO Monitoring** — The OpenAI-compatible endpoint (`/api/llm/v1/chat/completions`) must record time-to-first-token (TTFT). Target SLO: 2,500ms. Breach threshold: 5,000ms. Breaches must be logged to the structured log at `warn` level with model, provider, and user tier context.

**FR-W10: Tier-Based Model Access** — Model access must be enforced server-side per the tier matrix in §4.7. Attempting to use a model above the user's tier must return HTTP 403 with a `required_tier` field.

### 4.4.4 Media Generation Endpoints

| Method | Path | Auth | maxDuration | Purpose |
|---|---|---|---|---|
| POST | `/api/media/image/generate` | Bearer | 60s | Synchronous image generation |
| POST | `/api/media/video/generate` | Bearer | 60s | Initiate asynchronous video generation task |
| GET | `/api/media/video/status` | Bearer | — | Poll video task status by task ID |

**Image Generation Provider Cascade:**

1. Imagen 4 (primary)
2. DALL-E 3 (fallback)
3. Stability AI (final fallback)

The cascade proceeds to the next provider on any non-200 response or timeout. The response includes a `provider` field indicating which provider served the request.

**Video Generation Providers:**

| Provider | Duration Options | Resolution | Estimated Wait |
|---|---|---|---|
| Runway Gen4 Turbo | 2s, 5s, 10s | 720p, 1080p | 60–160s |
| Veo 3.1 | 4s, 6s, 8s | Up to 4K | 90–210s |

**FR-W11: Async Video Task** — The video generation endpoint must return immediately with a task ID (format: `runway_{id}` or `google_{operationId}`) and HTTP 202. The client polls `/api/media/video/status?task_id={id}` for completion. Status values: `pending`, `processing`, `completed`, `failed`.

**FR-W12: Media Access Gate** — Image and video generation endpoints must reject requests from Free, Hobby, and Pro tier users with HTTP 403. Only Max, Enterprise, and Team tiers may access media generation.

### 4.4.5 Chat / Conversation Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/chat/conversations` | Session | List all conversations for the authenticated user (paginated, 50/page) |
| POST | `/api/chat/conversations` | Session | Create a new conversation; returns `id`, `created_at`, `title` |
| GET | `/api/chat/conversations/[id]` | Session | Retrieve a single conversation with its full message array |
| PUT | `/api/chat/conversations/[id]` | Session | Update conversation metadata (title, pinned status) |
| DELETE | `/api/chat/conversations/[id]` | Session | Soft-delete conversation (hard-deleted after 30 days) |

**FR-W13: Conversation Ownership** — All conversation endpoints must enforce row-level security: a user may only read, modify, or delete conversations where `user_id = auth.uid()`. The API layer must never expose another user's conversation ID or content.

### 4.4.6 User / Account Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/me` | Session | Return current user profile (id, email, tier, credit balance, created_at) |
| GET | `/api/user/data` | Session | GDPR data export request; queues async export job |
| GET | `/api/user/export` | Session | Download completed data export archive (ZIP) |
| DELETE | `/api/user/...` | Session | Initiate account deletion; 30-day grace period before permanent removal |

**FR-W14: GDPR Export** — The data export must include: profile, all conversations + messages, billing history, settings. The export must be delivered as a downloadable ZIP within 24 hours of request.

### 4.4.7 Device Linking Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/device/link` | Session | Initiate device link; returns a short-lived `link_code` (5-min TTL) |
| GET | `/api/device/poll` | Session | Long-poll for device link confirmation (20s max hold) |
| POST | `/api/device/approve` | Session | Approve a pending device link request by `link_code` |

**FR-W15: Device Linking Flow** — The desktop app requests a link code from the web app. The user approves in the web dashboard. The desktop polls until approval or timeout. On approval, the desktop receives a signed token tied to the `user_id`. Link codes expire after 5 minutes and are single-use.

### 4.4.8 Voice Endpoints

| Method | Path | Auth | Rate Limit | Purpose |
|---|---|---|---|---|
| POST | `/api/voice/transcribe` | Bearer | 30/min per user | Transcribe uploaded audio via Whisper API; returns `text`, `language`, `duration_s` |
| GET | `/api/voice/health` | None | — | Voice service health check; returns provider availability |

**FR-W16: Audio Transcription** — Accepted formats: `audio/webm`, `audio/ogg`, `audio/wav`, `audio/mp4`. Maximum file size: 25MB. The endpoint must forward to the Whisper API and return the transcript within the `maxDuration` budget.

### 4.4.9 Admin Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/*` | Admin JWT | Admin management endpoints (user list, tier override, suspension) |
| GET/POST | `/api/admin/sso` | Admin JWT | Manage enterprise SSO provider configurations |
| GET/POST | `/api/admin/directory-sync` | Admin JWT | Manage enterprise directory sync jobs |

Admin JWT is a separate short-lived token (1h) issued only to users with `role = admin` in the `profiles` table.

### 4.4.10 Release Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/releases/latest` | None | Latest desktop release metadata (version, date, notes) |
| GET | `/api/releases/[target]` | None | Release artifact for a specific platform target (e.g., `darwin-aarch64`) |
| GET | `/api/releases/check` | None | Check if update is available given `current_version` query param |

**FR-W17: Auto-Update Check** — `/api/releases/check` accepts `current_version` and `platform` query parameters and returns `{ update_available: boolean, latest_version, download_url }`. The desktop app polls this endpoint on startup and every 4 hours.

### 4.4.11 Waitlist Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/waitlist` | Session | Join waitlist for Pro or Max plan; records position |
| GET | `/api/waitlist` | Session | Get current waitlist status and estimated position |

### 4.4.12 Utility Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | None | Application health check (DB connectivity, cache) |
| GET | `/api/csrf` | None | Issue a CSRF token bound to the current session |
| POST | `/api/validate-webhook` | None | Validate an inbound webhook signature (generic) |
| GET | `/api/webhook-diagnostic` | None | Webhook delivery diagnostic (last 10 events, status) |
| GET | `/api/download` | None | Redirect to latest stable desktop download for detected platform |
| GET | `/api/download-beta` | None | Redirect to latest beta desktop download |
| GET | `/api/debug` | None | Debug endpoint — enabled only in `NODE_ENV=development` |
| POST | `/api/claim-offer` | Session | Claim a promotional offer code; applies credit or tier upgrade |

---

## 4.5 Authentication and Authorization

### 4.5.1 Primary Authentication

Authentication is managed by Supabase Auth. `middleware.ts` calls `updateSession(request)` on every request, which:

1. Reads the Supabase session cookie.
2. Silently refreshes expired access tokens using the refresh token.
3. For authenticated-only routes, redirects unauthenticated requests to `/login?next=<original-path>`.

**FR-W18: Session Refresh** — The middleware must transparently refresh tokens with no user-visible interruption. If the refresh token is also expired or revoked, the user must be redirected to `/login` with the `?next=` parameter preserved.

### 4.5.2 Token Types

| Type | Transport | Use Cases | Verification |
|---|---|---|---|
| Supabase Session JWT | HttpOnly cookie (SSR) | Web pages, most API routes, SSR data fetching | `supabase.auth.getSession()` |
| Bearer Token | `Authorization` header | LLM routes, media routes, desktop-originated requests | `supabase.auth.getUser(token)` |

### 4.5.3 Enterprise SSO

SAML/OIDC enterprise login flows through `/api/auth/sso`. Domain-based provider discovery is available via `/api/auth/sso-check` so the login page can present a "Sign in with SSO" button automatically for known domains.

### 4.5.4 CSRF Protection

All state-changing endpoints (POST, PUT, DELETE) require a valid CSRF token:

- Server issues token via `GET /api/csrf`.
- Client stores token in memory and attaches it via `addCsrfHeaders()` which sets the `X-CSRF-Token` header.
- Server validates with `requireCsrfToken(request)` before processing.

**FR-W19: CSRF Enforcement** — Any state-changing request without a valid `X-CSRF-Token` header must return HTTP 403.

### 4.5.5 Content Security Policy

CSP is generated per-request in `middleware.ts` with a random nonce to prevent script injection:

| Directive | Value |
|---|---|
| `default-src` | `'self'` |
| `script-src` | `'self'` `'nonce-{random}'` `'unsafe-eval'` `https://js.stripe.com` `https://challenges.cloudflare.com` |
| `connect-src` | `'self'` `https://*.supabase.co` `wss://*.supabase.co` `https://api.stripe.com` `https://api.openai.com` `https://api.anthropic.com` `https://generativelanguage.googleapis.com` |
| `frame-src` | `https://js.stripe.com` `https://hooks.stripe.com` `https://challenges.cloudflare.com` |

### 4.5.6 HTTP Security Headers

Set globally in `next.config.ts`:

| Header | Value |
|---|---|
| `X-DNS-Prefetch-Control` | `off` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `credentialless` |

---

## 4.6 Subscription and Billing System

### 4.6.1 Plan Tiers

| Tier | Level | LLM Access | Media Generation | Purchase Status |
|------|-------|-----------|------------------|-----------------|
| free | 0 | Blocked (403) | No | Active (default) |
| hobby | 1 | Economy models only | No | Active |
| pro | 2 | Economy + Pro models | No | Waitlisted |
| max | 3 | All models incl. flagships | Yes | Waitlisted |
| team | 3.5 | All models | Yes | Active |
| enterprise | 4 | All models | Yes | Active (sales-led) |

Active subscription statuses: `active`, `trialing`
Inactive statuses: `past_due`, `canceled`, `incomplete`, `incomplete_expired`, `paused`

**FR-W20: Graceful Past-Due Handling** — Users with `past_due` subscriptions must retain their current tier access for a 3-day grace period before being downgraded to Free.

### 4.6.2 Credit System

Credits are the unit of consumption tracked in the `credit_accounts` Supabase table. Each plan tier grants a monthly allocation and a daily allocation. One-time top-up credits are tracked separately and do not expire.

**Credit Flow:**

1. LLM request arrives at `/api/llm/completion`.
2. Call `check_credits_available(user_id, estimated_tokens)` RPC.
3. If insufficient → HTTP 402, suggest top-up or fallback model.
4. If sufficient → reserve estimated credits, forward request to provider.
5. On response completion → call `deduct_credits(user_id, actual_tokens, idempotency_key)` RPC.
6. Reconcile: if actual < estimated, release the difference.

**Supabase RPCs:**

| RPC | Parameters | Returns |
|---|---|---|
| `get_credit_balance` | `user_id` | `{ monthly_remaining, daily_remaining, topup_balance }` |
| `check_credits_available` | `user_id, amount` | `boolean` |
| `deduct_credits` | `user_id, amount, idempotency_key` | `{ success, new_balance }` |

**FR-W21: Idempotency** — All `deduct_credits` calls must include a unique `idempotency_key` derived from the request ID to prevent double-deduction on retries.

**FR-W22: Fallback Model** — If a user has insufficient credits for their requested model, the system must offer (and optionally auto-select) the cheapest available model for their tier rather than returning a hard error.

---

## 4.7 LLM Model Tier Matrix

| Tier Required | Models |
|---|---|
| Hobby (economy) | `gemini-3-flash-preview`, `glm-4.7`, `glm-4.6v`, `deepseek-chat` ($0.28/$0.42 per 1M), `claude-haiku-4.5`, `gpt-5-nano` ($0.05/$0.40), `qwen-flash` ($0.05/$0.15) |
| Pro (pro-tier) | `gpt-5.2`, `claude-sonnet-4.5`, `gemini-3-pro-preview`, `kimi-k2.5-turbo`, `qwen-max`, `qwen-coder-plus`, `sonar-pro`, `sonar-reasoning`, `sonar-deep-research` |
| Max / Enterprise | `claude-opus-4.5`, `gpt-5-pro`, `gemini-3-ultra`, `o3`, `grok-4`, `deepseek-r1` |

**Access Logic:**

- `free` → HTTP 403, all models blocked.
- `hobby` → economy models only; pro/max models return HTTP 403 with `required_tier: "pro"`.
- `pro` → economy + pro models; max models return HTTP 403 with `required_tier: "max"`.
- `max` / `enterprise` / `team` → all models.
- Unknown tier → HTTP 403 denied.

---

## 4.8 i18n

**FR-W23: Internationalisation** — All user-facing strings must use `i18next` keys. The initial supported locales are `en` (default) and `es`. Language detection order: URL prefix → `Accept-Language` header → `en` fallback. All API error messages must be keyed and translated.

---

## 4.9 Web App State Management

Zustand v5 stores located in `/apps/web/stores/`:

| Store | File | Persisted | Purpose |
|---|---|---|---|
| Settings | `settingsStore.ts` | Yes | Theme, font size, streaming preference, default model, custom model configs |
| Chat | `chatStore.ts` | Session | Active conversation ID, messages array, in-flight model selection |
| Media | `mediaStore.ts` | No | Current image/video generation request state, task IDs, results |
| Memory | `memoryStore.ts` | Yes | AI memory entries for the current user |
| Scheduler | `schedulerStore.ts` | Yes | Scheduled agent task definitions |
| Artifact | `artifactStore.ts` | Session | Code/file artifacts produced by the AI during the session |
| UI | `uiStore.ts` | No | Panel open states, active modals, sidebar visibility |
| Unified Agentic | `unified/` | Session | Multi-step agentic chat state (steps, tool calls, results) |

**FR-W24: Store Persistence** — Persisted stores must use Zustand's `persist` middleware with `version` set and a `migrate` function to handle schema evolution. The current migration target is v10.

---

## 4.10 Input Validation

**FR-W25: Zod Strict Validation** — Every API route handler must define a Zod `.strict()` schema for its request body. Unknown keys must cause a 400 response. Validation errors must be serialised using Zod's `ZodError.flatten()` and returned as `{ errors: { fieldErrors, formErrors } }`.

---

## 4.11 Rate Limiting

Rate limits are enforced via Upstash Redis + `@upstash/ratelimit`. Identifiers are per-user (authenticated) or per-IP (unauthenticated).

**FR-W26: Rate Limit Response** — When a rate limit is exceeded, the API must return HTTP 429 with headers `Retry-After` (seconds) and `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`.

---

## 4.12 Logging

**FR-W27: Structured Logging** — All server-side code must use Pino for structured JSON logging. Every log entry must include: `timestamp`, `level`, `route`, `userId` (if authenticated), `requestId` (UUID per request). PII must not appear in log bodies.

---

## 4.13 Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-W01 | All authenticated API routes must respond within 5,000ms at P99 |
| NFR-W02 | LLM streaming first byte must be delivered within 2,500ms at P95 (5,000ms breach threshold) |
| NFR-W03 | The web application must achieve Lighthouse performance score ≥ 85 on the landing page |
| NFR-W04 | All Supabase queries must use row-level security policies; no `service_role` key in client-side code |
| NFR-W05 | Stripe webhook handlers must complete idempotent processing within the 30s Stripe retry window |
| NFR-W06 | The app must be fully functional in the latest two versions of Chrome, Firefox, and Safari |
