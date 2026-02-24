# Specification: Resilience & Security Audit

Generated: 2026-02-23T00:00:00Z

## Task Overview

Comprehensive resilience and security audit of the AGI Workforce codebase covering four areas:

1. Outage UX & Graceful Degradation
2. AI Provider Resilience
3. Security & RLS
4. Abuse Prevention & Cost Controls

Each area is assigned to a dedicated audit agent. This specification documents every relevant file, its current state, the key code paths, and the interface contracts between components so each agent can work in parallel without overlap.

---

## Team Composition

- **Agent A** -- Outage UX Auditor: Examines frontend error states, offline mode handling, status banners, and dependency isolation across auth/DB/Stripe outages.
- **Agent B** -- AI Provider Resilience Auditor: Examines API key exposure paths, fallback chains, timeout handling, retry policies, and transparent failover behavior.
- **Agent C** -- Security & RLS Auditor: Examines Supabase RLS policies, privilege escalation vectors, client-side manipulation risks, and write-privilege separation.
- **Agent D** -- Abuse Prevention Auditor: Examines rate limiting, kill switches, budget caps, daily/monthly credit limits, and cost controls.

---

## File Allocation

### Agent A -- Outage UX & Graceful Degradation

**Files to Audit:**

| File                  | Path                                                  | Purpose                                                                                                                                               |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth Store (Frontend) | `apps/desktop/src/stores/auth.ts`                     | Unified auth/billing/subscription state; manages login, session validation, subscription sync, credit balance fetching                                |
| Auth Orchestrator     | `apps/desktop/src/stores/authOrchestrator.ts`         | Coordinates auth flows between stores                                                                                                                 |
| Tauri Mock            | `apps/desktop/src/lib/tauri-mock.ts`                  | Wraps `invoke()` calls; returns mocks in test mode; throws error in non-Tauri web mode                                                                |
| Agentic Events Hook   | `apps/desktop/src/hooks/useAgenticEvents.ts`          | Central hook subscribing to all Tauri backend events (agent status, tool execs, approvals, MCP, file ops, terminal, screenshots)                      |
| Web Error Handler     | `apps/web/lib/error-handler.ts`                       | `withErrorHandler()` wrapper for all Next.js API routes; catches `AppError`, Zod errors, unknown errors; returns structured JSON                      |
| Web Errors Module     | `apps/web/lib/errors.ts`                              | Re-exports `AppError`, `createError`, error codes from `@agiworkforce/utils`                                                                          |
| Gateway Error Handler | `services/api-gateway/src/middleware/errorHandler.ts` | Express global error handler; `AppError` class with `isOperational` flag; `notFoundHandler` for 404s                                                  |
| Gateway Index         | `services/api-gateway/src/index.ts`                   | Entry point; validates `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` at startup (fatal exit if missing); helmet, CORS, JSON size limits   |
| Billing Module        | `apps/desktop/src-tauri/src/sys/billing/mod.rs`       | `BillingState` with `#[cfg(feature = "billing")]` guards; `check_cloud_access()` returns false when Stripe not initialized                            |
| Billing Models        | `apps/desktop/src-tauri/src/sys/billing/models.rs`    | `PlanTier` enum (Hobby/Pro/Max); `UserSubscription` with `has_cloud_access()`                                                                         |
| Subscription Service  | `apps/web/lib/services/subscription-service.ts`       | `syncWithStripe()` -- self-healing sync; falls back from customer_id to email lookup; handles missing columns via retry with minimal fields           |
| Credit Service        | `apps/web/lib/services/credit-service.ts`             | `checkAvailable()` with RPC fallback; `checkAvailableFallback()` uses direct balance query when RPC fails                                             |
| Extension Background  | `apps/extension/src/background.ts`                    | Service worker; native host connection with exponential backoff reconnect (base 1s, max 30s, max 8 attempts); connection status notifications to tabs |
| Extension Types       | `apps/extension/src/types.ts`                         | `ConnectionStatus` type, message types                                                                                                                |
| Extension Utils       | `apps/extension/src/utils.ts`                         | `RateLimiter`, `retry`, `withTimeout`, `storageUtils` helpers                                                                                         |

**Current State Summary:**

1. **Desktop auth store** (`apps/desktop/src/stores/auth.ts`): Zustand store with `persist` + `subscribeWithSelector` middleware. Tracks `SubscriptionFetchStatus` (idle/fetching/succeeded/failed). Has `CreditBalance` interface. Uses Supabase auth + Stripe for subscription validation. Defines `isSubscriptionActive()` and `isInGracePeriod()` utility gates.

2. **Web error handling**: All API routes wrap handlers with `withErrorHandler()` which catches errors and returns structured JSON with error codes. The `createError` factory produces typed errors: `unauthorized`, `validation`, `internal`, `serviceUnavailable`, `rateLimit`.

3. **Gateway error handling**: Express `errorHandler` middleware distinguishes `AppError` (operational, shows message) from unexpected errors (shows "Internal Server Error"). Logs stacks only in development.

4. **Billing graceful degradation**: The Rust `BillingState` returns `false` for `check_cloud_access()` when Stripe is not initialized. Non-billing builds compile with stub commands that return `Err(BILLING_DISABLED_MSG)`.

5. **Extension reconnect**: The background service worker implements exponential backoff reconnection to the native host with `NATIVE_RECONNECT_MAX_ATTEMPTS = 8`, base delay 1s, max delay 30s. Tab notifications propagate connection status changes.

**Key Audit Questions for Agent A:**

- What happens to the desktop UI when Supabase auth is unreachable?
- Does the desktop app degrade gracefully when the API gateway is down?
- Are there status banners or offline indicators in the frontend?
- Does the credit balance UI handle `null` or error states gracefully?
- What happens when the Stripe webhook endpoint is unreachable?
- Does the extension show meaningful state to the user when the desktop app is not running?
- Are there circuit breakers for cascading failures between services?

---

### Agent B -- AI Provider Resilience

**Files to Audit:**

| File                          | Path                                                                                                  | Purpose                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM Router (Rust)             | `apps/desktop/src-tauri/src/core/llm/llm_router.rs`                                                   | Core routing with `RetryConfig` (3 retries, 500ms initial, 2x backoff, max 10s); `is_retryable_error()` classification; fallback candidate support                              |
| Fallback Chain (Rust)         | `apps/desktop/src-tauri/src/core/llm/fallback_chain.rs`                                               | `FallbackChain` with `RateLimitTracker` per-provider cooldowns (base 60s, max 600s, 2x backoff); `ModelCandidate` priority system; `AggregateError` with user-friendly messages |
| Provider Adapter (Rust)       | `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`                                             | Translates between unified format and provider-specific formats (OpenAI, Anthropic, Google, DeepSeek, etc.)                                                                     |
| Managed Cloud Provider (Rust) | `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`                             | Routes through `api.agiworkforce.com/api/llm/v1/chat/completions`; uses Supabase access token; handles 401/405 with context-aware error messages (dev vs prod)                  |
| Ollama Provider (Rust)        | `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`                                             | Local model provider                                                                                                                                                            |
| HTTP Client (Rust)            | `apps/desktop/src-tauri/src/core/llm/providers/http_client.rs`                                        | Shared HTTP client for providers                                                                                                                                                |
| Providers Mod (Rust)          | `apps/desktop/src-tauri/src/core/llm/providers/mod.rs`                                                | Module declarations                                                                                                                                                             |
| SSE Parser (Rust)             | `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`                                                   | Server-Sent Events stream parser                                                                                                                                                |
| Cost Calculator (Rust)        | `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`                                              | Pricing table for all providers (January 2026 pricing); `calculate()` with ManagedCloud cross-provider lookup                                                                   |
| Token Counter (Rust)          | `apps/desktop/src-tauri/src/core/llm/token_counter.rs`                                                | Token counting                                                                                                                                                                  |
| Cache Manager (Rust)          | `apps/desktop/src-tauri/src/core/llm/cache_manager.rs`                                                | Prompt caching                                                                                                                                                                  |
| LLM Mod (Rust)                | `apps/desktop/src-tauri/src/core/llm/mod.rs`                                                          | Module root; defines `Provider` enum, `LLMRequest`, `LLMResponse`, `ChatMessage`, `LLMProvider` trait                                                                           |
| Web LLM Route                 | `apps/web/app/api/llm/v1/chat/completions/route.ts`                                                   | OpenAI-compatible proxy; authenticates via Supabase JWT; checks credits; routes to provider factory; handles streaming and non-streaming; calculates cost and deducts credits   |
| LLM Provider Factory          | `apps/web/lib/llm-providers/factory.ts`                                                               | Factory for creating provider instances based on model name                                                                                                                     |
| Provider Implementations      | `apps/web/lib/llm-providers/{anthropic,openai,google,deepseek,xai,moonshot,perplexity,qwen,zhipu}.ts` | Individual provider adapters                                                                                                                                                    |
| Provider Base                 | `apps/web/lib/llm-providers/base.ts`                                                                  | Base class/interface for LLM providers                                                                                                                                          |
| Autonomous Agent (Rust)       | `apps/desktop/src-tauri/src/core/agent/autonomous.rs`                                                 | `MAX_SELF_HEAL_RETRIES = 3`; `APPROVAL_TIMEOUT_SECS = 300`; `check_resource_limits()` before task processing                                                                    |

**Current State Summary:**

1. **Retry & Fallback (Rust)**: The `LLMRouter` has a `RetryConfig` with 3 retries, 500ms initial delay, 2x backoff, max 10s delay. Error classification via `is_retryable_error()` checks for rate limits, 5xx errors, connection timeouts, overload. The `FallbackChain` implements per-provider rate limit tracking with cooldowns (60s base, 600s max), exponential backoff with jitter, and up to 10 candidate attempts.

2. **Provider adapter**: The `ManagedCloudProvider` sends requests to the web API's `/api/llm/v1/chat/completions` endpoint using the user's Supabase access token. It has context-aware error messages for 401 and 405 errors (dev vs prod variants). Model aliases are canonicalized (e.g., `gpt-5.2-codex-*` -> `gpt-5-codex`).

3. **Web LLM proxy**: The completions route validates requests with Zod, authenticates via Supabase JWT, checks credit availability, applies rate limiting (`llm-completion` or `llm-streaming`), routes to the appropriate provider, and deducts credits after completion with idempotency keys. Model tier requirements restrict expensive models to Pro/Max/Enterprise plans.

4. **Error classification**: Both Rust and TypeScript sides classify errors into retryable (rate limits, 5xx, connection, timeout, overload) vs permanent (auth errors, invalid requests). Rate limit errors trigger provider cooldowns; permanent errors skip retries.

**Key Audit Questions for Agent B:**

- Are API keys for any LLM provider ever exposed to the frontend or logged?
- Does the `ManagedCloudProvider` handle all HTTP error codes gracefully?
- What happens when all providers in the fallback chain are rate-limited simultaneously?
- Is the `AggregateError.user_message()` always safe for end-user display?
- Are timeouts configured appropriately for streaming vs non-streaming requests?
- Does the web proxy strip sensitive headers before forwarding to LLM providers?
- Are provider API keys stored securely in environment variables on the web side?
- What happens to in-flight streaming requests when the connection drops?
- Is the cost calculation accurate enough to prevent credit undercharging?

---

### Agent C -- Security & RLS

**Files to Audit:**

| File                       | Path                                                                                                                                                                                  | Purpose                                                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (Rust Desktop)        | `apps/desktop/src-tauri/src/sys/security/auth.rs`                                                                                                                                     | `AuthManager` with in-memory user/session store; Argon2 password hashing; account lockout (5 attempts, 30min); token validation rate limiting (100/min)                                                                                                                   |
| Auth DB (Rust)             | `apps/desktop/src-tauri/src/sys/security/auth_db.rs`                                                                                                                                  | Database-backed auth                                                                                                                                                                                                                                                      |
| Secret Manager             | `apps/desktop/src-tauri/src/sys/security/secret_manager.rs`                                                                                                                           | JWT secret management; key derivation                                                                                                                                                                                                                                     |
| Master Password            | `apps/desktop/src-tauri/src/sys/security/master_password.rs`                                                                                                                          | Argon2id (OWASP params) for master password; HKDF-SHA256 for key derivation                                                                                                                                                                                               |
| Machine Key                | `apps/desktop/src-tauri/src/sys/security/machine_key.rs`                                                                                                                              | Machine-specific key derivation                                                                                                                                                                                                                                           |
| Encryption                 | `apps/desktop/src-tauri/src/sys/security/encryption.rs`                                                                                                                               | Encryption utilities                                                                                                                                                                                                                                                      |
| OAuth                      | `apps/desktop/src-tauri/src/sys/security/oauth.rs`                                                                                                                                    | OAuth flows                                                                                                                                                                                                                                                               |
| Permissions                | `apps/desktop/src-tauri/src/sys/security/permissions.rs`                                                                                                                              | Permission checks                                                                                                                                                                                                                                                         |
| RBAC                       | `apps/desktop/src-tauri/src/sys/security/rbac.rs`                                                                                                                                     | Role-based access control                                                                                                                                                                                                                                                 |
| Command Validator          | `apps/desktop/src-tauri/src/sys/security/command_validator.rs`                                                                                                                        | Validates Tauri commands                                                                                                                                                                                                                                                  |
| Guardrails                 | `apps/desktop/src-tauri/src/sys/security/guardrails.rs`                                                                                                                               | Safety guardrails                                                                                                                                                                                                                                                         |
| Injection Detector         | `apps/desktop/src-tauri/src/sys/security/injection_detector.rs`                                                                                                                       | Detects prompt injection                                                                                                                                                                                                                                                  |
| Prompt Injection           | `apps/desktop/src-tauri/src/sys/security/prompt_injection.rs`                                                                                                                         | Prompt injection prevention                                                                                                                                                                                                                                               |
| Tool Guard                 | `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`                                                                                                                               | Tool execution safety                                                                                                                                                                                                                                                     |
| Sandbox                    | `apps/desktop/src-tauri/src/sys/security/sandbox.rs`                                                                                                                                  | Sandbox execution                                                                                                                                                                                                                                                         |
| Audit Logger               | `apps/desktop/src-tauri/src/sys/security/audit_logger.rs`                                                                                                                             | Security audit logging                                                                                                                                                                                                                                                    |
| DM Protection              | `apps/desktop/src-tauri/src/sys/security/dm_protection.rs`                                                                                                                            | Direct manipulation protection                                                                                                                                                                                                                                            |
| Approval Workflow          | `apps/desktop/src-tauri/src/sys/security/approval_workflow.rs`                                                                                                                        | Approval workflows                                                                                                                                                                                                                                                        |
| Validator                  | `apps/desktop/src-tauri/src/sys/security/validator.rs`                                                                                                                                | Input validation                                                                                                                                                                                                                                                          |
| Security Mod               | `apps/desktop/src-tauri/src/sys/security/mod.rs`                                                                                                                                      | Module declarations                                                                                                                                                                                                                                                       |
| Policy Directory           | `apps/desktop/src-tauri/src/sys/security/policy/`                                                                                                                                     | Security policies                                                                                                                                                                                                                                                         |
| Policy Integration         | `apps/desktop/src-tauri/src/sys/security/policy_integration.rs`                                                                                                                       | Policy integration                                                                                                                                                                                                                                                        |
| Gateway Auth Middleware    | `services/api-gateway/src/middleware/auth.ts`                                                                                                                                         | JWT verification with `jsonwebtoken`; parses Bearer token; differentiates `TokenExpiredError` vs `JsonWebTokenError`; attaches `AuthenticatedUser` to request                                                                                                             |
| Gateway Auth Routes        | `services/api-gateway/src/routes/auth.ts`                                                                                                                                             | Registration with bcrypt (salt 10); login with timing-attack prevention (dummy hash); auth rate limiting (5/15min)                                                                                                                                                        |
| Gateway Request Validation | `services/api-gateway/src/middleware/requestValidation.ts`                                                                                                                            | Content-Type enforcement, security header monitoring                                                                                                                                                                                                                      |
| Authenticated User Schema  | `services/api-gateway/src/authenticated-user.ts`                                                                                                                                      | Zod schema for JWT payload validation                                                                                                                                                                                                                                     |
| RLS Optimization Migration | `apps/web/supabase/migrations/20260105000000_optimize_rls_policies.sql`                                                                                                               | RLS policies for profiles, subscriptions, token_credits, credit_transactions -- all use `(select auth.uid())` pattern for optimizer caching                                                                                                                               |
| Credit RPC Lockdown        | `apps/web/supabase/migrations/20260108000000_lock_down_credit_rpcs.sql`                                                                                                               | Hardens all credit RPCs: `add_credits` (service_role only); `get_credit_balance`, `check_credits_available`, `deduct_credits` (authenticated + auth.uid() check); `get_or_create_credit_account`, `reset_credits_for_period` (service_role only); REVOKE from PUBLIC/anon |
| Security Audit Logs        | `apps/web/supabase/migrations/20260122000000_add_security_audit_logs.sql`                                                                                                             | `security_audit_logs` table with RLS restricting INSERT/SELECT/DELETE to service_role                                                                                                                                                                                     |
| Additional RLS Migrations  | `apps/web/supabase/migrations/20260107000000_fix_duplicate_indexes_and_rls.sql`, `20260118000000_add_missing_rls_policies.sql`                                                        | Additional RLS policy fixes                                                                                                                                                                                                                                               |
| Consolidated Schema        | `apps/web/supabase/migrations/20260101000000_consolidated_schema.sql`                                                                                                                 | Base schema with tables and initial RLS                                                                                                                                                                                                                                   |
| GDPR/Cleanup               | `apps/web/supabase/migrations/20260115000000_critical_fixes_gdpr_compliance.sql`                                                                                                      | GDPR compliance, data cleanup                                                                                                                                                                                                                                             |
| Stripe Integration         | `apps/web/supabase/migrations/20260101000003_add_stripe_integration.sql`                                                                                                              | Stripe-related tables                                                                                                                                                                                                                                                     |
| Device Auth                | `apps/web/supabase/migrations/20260106000000_add_device_authorization.sql`, `20260108000001_fix_device_authorization_flow.sql`, `20260108000003_add_device_token_consumption_rpc.sql` | Device authorization flow                                                                                                                                                                                                                                                 |
| CSRF Module                | `apps/web/app/api/csrf/`                                                                                                                                                              | CSRF token management                                                                                                                                                                                                                                                     |
| Web Checkout Route         | `apps/web/app/api/checkout/route.ts`                                                                                                                                                  | CSRF protection via `requireCsrfToken()`; prevents duplicate subscriptions; validates against existing active subscription                                                                                                                                                |

**Current State Summary:**

1. **Desktop auth**: `AuthManager` stores users/sessions in memory (HashMap). Argon2 password hashing. Account lockout after 5 failed attempts for 30 minutes. Token validation rate-limited to 100 attempts/minute per partial token hash (first 8 chars).

2. **Gateway auth**: JWT verification with `jsonwebtoken` library. Bearer token parsing is case-insensitive. Differentiates expired vs invalid tokens. Registration rate-limited to 5 attempts per 15 minutes. Login uses dummy bcrypt hash for timing-attack prevention.

3. **Supabase RLS**: All user-facing tables have RLS enabled. Policies use `(select auth.uid())` pattern for optimizer caching. Credit RPCs are hardened: `add_credits`, `get_or_create_credit_account`, `reset_credits_for_period` are restricted to `service_role` only. `get_credit_balance`, `check_credits_available`, `deduct_credits` enforce `auth.uid() = p_user_id` for authenticated users. All functions set `search_path TO 'public', 'pg_temp'` to prevent search_path injection.

4. **Security audit logs**: Dedicated table with RLS restricting all operations to service_role. Logs security events: auth failures, rate limit exceedances, authorization failures, CSRF violations.

**Key Audit Questions for Agent C:**

- Can a user manipulate their `plan_tier` or `credits_remaining_cents` via the Supabase client?
- Are all tables with user data protected by RLS?
- Can the `deduct_credits` RPC be called with another user's ID from an authenticated session?
- Is the gateway's JWT secret rotation coordinated with the desktop app?
- Are there any tables without RLS enabled?
- Does the gateway `auth/verify` endpoint have rate limiting?
- Are there any SECURITY DEFINER functions without proper authorization checks?
- Can a user bypass the `check_cloud_access()` gate on the desktop by modifying local state?
- Is the device authorization flow resistant to token replay attacks?

---

### Agent D -- Abuse Prevention & Cost Controls

**Files to Audit:**

| File                        | Path                                                                             | Purpose                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate Limiter (Rust Desktop) | `apps/desktop/src-tauri/src/sys/security/rate_limit.rs`                          | `RateLimiter` with bounded VecDeque (ring buffer); configurable `max_requests` and `window`; default 100 req/60s                                                                                  |
| Web Rate Limit              | `apps/web/lib/rate-limit.ts`                                                     | Upstash Redis-backed rate limiting with in-memory fallback; `failClosed` flag for security-sensitive endpoints; `IN_MEMORY_MAX_ENTRIES = 10000`; comprehensive endpoint configs (32+ categories)  |
| Gateway Rate Limit          | `services/api-gateway/src/middleware/rateLimit.ts`                               | Express `express-rate-limit` with in-memory store; endpoint configs: credits-deduct (5/min), credits-balance (10/min), heartbeat (600/min), device-register (10/min); user ID or IP key generator |
| Credit Service              | `apps/web/lib/services/credit-service.ts`                                        | `CreditService` with `deductCredits()` (atomic, idempotency key support), `checkAvailable()` with RPC fallback, daily limit check via `calculate_daily_limit()`                                   |
| Credit RPCs (SQL)           | `apps/web/supabase/migrations/20260108000000_lock_down_credit_rpcs.sql`          | `deduct_credits()` enforces daily limit (30% of monthly), monthly limit; uses `FOR UPDATE` row locking; all inputs validated                                                                      |
| Subscription Service        | `apps/web/lib/services/subscription-service.ts`                                  | `PLAN_CREDITS` map: free=0, hobby=350c, pro=1200c, max=15000c; `allocateCreditsForPeriod()` and `resetCreditsForNewPeriod()`                                                                      |
| Cost Calculator (Rust)      | `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`                         | Pricing table for all models; `CostCalculator.calculate()` with ManagedCloud cross-provider lookup; default fallback pricing                                                                      |
| LLM Completions Route       | `apps/web/app/api/llm/v1/chat/completions/route.ts`                              | Credit check before LLM call; model tier requirements; cost calculation and deduction with idempotency; rate limiting (`llm-completion`: 30/min, `llm-streaming`: 20/min)                         |
| Credit Topup Route          | `apps/web/app/api/credit-topup/route.ts`                                         | One-time credit purchase; validates amount ($10-$1000); rate limited; origin validation against CORS allowlist                                                                                    |
| Checkout Route              | `apps/web/app/api/checkout/route.ts`                                             | Subscription checkout; CSRF protection; prevents duplicate subscriptions; rate limited (15/min)                                                                                                   |
| Stripe Webhook              | `apps/web/app/api/stripe-webhook/route.ts`                                       | Webhook signature verification; idempotency; credit allocation on subscription events                                                                                                             |
| Stripe Client (Rust)        | `apps/desktop/src-tauri/src/sys/billing/stripe_client.rs`                        | `StripeService` with `track_usage()` recording to local SQLite                                                                                                                                    |
| Billing State (Rust)        | `apps/desktop/src-tauri/src/sys/billing/mod.rs`                                  | `check_cloud_access()` based on active subscription; feature-gated billing commands                                                                                                               |
| Gateway Credits Routes      | `services/api-gateway/src/routes/credits.ts`                                     | Credit balance (10/min), check (10/min), deduct (5/min); Zod `.strict()` schemas; idempotency key support                                                                                         |
| Fallback Chain (Rust)       | `apps/desktop/src-tauri/src/core/llm/fallback_chain.rs`                          | Rate limit tracking with provider cooldowns; prevents repeated calls to rate-limited providers                                                                                                    |
| Autonomous Agent (Rust)     | `apps/desktop/src-tauri/src/core/agent/autonomous.rs`                            | `MAX_PENDING_TASKS = 500`; `check_resource_limits()` before processing; `MAX_SELF_HEAL_RETRIES = 3`                                                                                               |
| Extension Background        | `apps/extension/src/background.ts`                                               | `RateLimiter(120, 500)` -- 120 requests per 500ms per tab; per-tab rate limiting in `handleMessageAsync()`                                                                                        |
| LLM Cost Calculator (Web)   | `apps/web/lib/services/llm-cost-calculator.ts`                                   | Web-side cost calculation for credit deduction                                                                                                                                                    |
| Credit Idempotency          | `apps/web/supabase/migrations/20260110000001_add_credit_idempotency.sql`         | Idempotency table for credit operations                                                                                                                                                           |
| Webhook Idempotency         | `apps/web/supabase/migrations/20260108000004_fix_stripe_webhook_idempotency.sql` | Webhook event idempotency                                                                                                                                                                         |

**Current State Summary:**

1. **Rate limiting layers**:
   - **Desktop Rust**: `RateLimiter` with bounded VecDeque, default 100 req/60s.
   - **Web (Next.js)**: Upstash Redis with in-memory fallback; `failClosed: true` blocks security-sensitive endpoints when Redis unavailable; 32+ endpoint categories with varying limits (e.g., `llm-completion: 30/min`, `llm-streaming: 20/min`, `auth-login: 5/15min`, `video-generation: 5/min`).
   - **API Gateway**: `express-rate-limit` in-memory store; per-user or per-IP keys; financial endpoints strictest (credits-deduct: 5/min).
   - **Extension**: Per-tab rate limiter (120 req/500ms).

2. **Credit controls**:
   - Daily limit: 30% of monthly allocation (enforced in SQL `deduct_credits()` RPC).
   - Monthly limit: Full allocation per plan tier (hobby=350c, pro=1200c, max=15000c).
   - Atomic deduction: `FOR UPDATE` row locking prevents race conditions.
   - Idempotency keys: Prevent duplicate deductions on retries (24h TTL).
   - Credit check before LLM call: `checkAvailable()` with fallback to direct balance query.

3. **Cost calculation**:
   - Rust `CostCalculator` with per-model pricing and provider defaults.
   - ManagedCloud cross-provider lookup for accurate pricing.
   - Web-side `LLMCostCalculator` for server-side credit deduction.

4. **Kill switches**: No explicit "kill switch" mechanism found. The `check_cloud_access()` in Rust and model tier requirements in the web route provide access gating but not emergency shutdown.

**Key Audit Questions for Agent D:**

- Is there a global kill switch to immediately disable LLM calls across all users?
- Can a user exhaust their daily limit in a single request with a very large prompt?
- What happens if the credit deduction fails AFTER the LLM call has been made (credit leak)?
- Is the in-memory rate limiting in the API gateway sufficient for multi-instance deployments?
- Are the rate limits for `llm-streaming` strict enough given the resource intensity?
- Can a user bypass rate limits by using different API keys or devices?
- Is there monitoring/alerting for abnormal credit consumption patterns?
- Can the extension's per-tab rate limiter be bypassed by opening many tabs?
- Is there a maximum request size limit for LLM calls (message array length, image sizes)?
- What prevents a malicious client from sending very large `max_tokens` values to maximize cost?

---

## Interface Contracts

### Desktop (Rust) -> Web API

**Authentication Flow:**

```
ManagedCloudProvider -> GET access_token from sys/account
  -> HTTP POST api.agiworkforce.com/api/llm/v1/chat/completions
  -> Authorization: Bearer <supabase_access_token>
  -> Content-Type: application/json
  -> Body: OpenAI-compatible ChatCompletion request
```

**Credit Deduction (Gateway path):**

```
Desktop -> POST /api/credits/deduct
  -> Authorization: Bearer <jwt>
  -> Body: { amount_cents, description, metadata, idempotency_key }
  -> Response: { success, remaining_cents, daily_limit, daily_used, daily_remaining }
```

### Web API -> Supabase

**Credit RPCs:**

```sql
-- Service role context (server-side):
get_or_create_credit_account(p_user_id, p_subscription_id, p_period_start, p_period_end, p_credits_allocated_cents) -> uuid
reset_credits_for_period(same params) -> uuid
add_credits(p_user_id, p_account_id, p_amount_cents, p_description, p_transaction_type) -> void

-- Authenticated user context (client or service role):
get_credit_balance(p_user_id) -> TABLE(account_id, credits_*, daily_*, period_*)
check_credits_available(p_user_id, p_amount_cents) -> boolean
deduct_credits(p_user_id, p_amount_cents, p_description, p_metadata, p_idempotency_key) -> TABLE(success, remaining_cents, error, code, daily_*)
```

### Desktop Frontend -> Desktop Backend (IPC)

```typescript
// All calls go through apps/desktop/src/lib/tauri-mock.ts
invoke(command: string, args?: Record<string, unknown>): Promise<T>
listen(event: string, handler: (event: Event<T>) => void): Promise<UnlistenFn>
```

### Gateway -> Supabase

```typescript
// Gateway uses service_role key
supabase.rpc('get_credit_balance', { p_user_id })
supabase.rpc('check_credits_available', { p_user_id, p_amount_cents })
supabase.rpc('deduct_credits', { p_user_id, p_amount_cents, ... })
```

### Extension -> Desktop (Native Messaging)

```typescript
// Extension sends via chrome.runtime.connectNative('com.agiworkforce.browser')
// Message format: { id: string, message: { type: string, ... } }
// Response format: { id: string, success: boolean, data?: unknown, error?: string }
```

---

## Shared Types & Interfaces

### CreditBalance (shared concept, different shapes)

**Web (`apps/web/lib/services/credit-service.ts`):**

```typescript
interface CreditBalance {
  account_id: string;
  period_start: string;
  period_end: string;
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
  percentage_used?: number;
  daily_limit_cents?: number;
  daily_used_cents?: number;
  daily_remaining_cents?: number;
  last_daily_reset_at?: string;
}
```

**Desktop Frontend (`apps/desktop/src/stores/auth.ts`):**

```typescript
interface CreditBalance {
  account_id?: string;
  period_start?: string;
  period_end?: string;
  allocated_cents?: number;
  used_cents?: number;
  remaining_cents?: number;
  percentage_used?: number;
  daily_limit_cents?: number;
  daily_used_cents?: number;
  daily_remaining_cents?: number;
  daily_reset_at?: string;
}
```

### AuthenticatedUser (Gateway)

**`services/api-gateway/src/authenticated-user.ts`:**

```typescript
// Zod-validated JWT payload
authenticatedUserSchema; // contains userId, email
```

### Provider Enum (Rust)

**`apps/desktop/src-tauri/src/core/llm/mod.rs`:**

```rust
enum Provider {
    OpenAI, Anthropic, Google, DeepSeek, XAI,
    Moonshot, Qwen, Perplexity, Ollama, Zhipu,
    ManagedCloud
}
```

### Rate Limit Configs (Web)

**`apps/web/lib/rate-limit.ts`:**

```typescript
type RateLimitKey =
  | 'checkout'
  | 'credit-topup'
  | 'device-link'
  | 'device-poll'
  | 'claim-offer'
  | 'me'
  | 'credits-balance'
  | 'sync-subscription'
  | 'portal'
  | 'health-check'
  | 'download'
  | 'download-beta'
  | 'release-check'
  | 'release-latest'
  | 'auth-login'
  | 'auth-signup'
  | 'auth-password-reset'
  | 'auth-verify'
  | 'api-key-create'
  | 'api-key-revoke'
  | 'user-data-delete'
  | 'user-data-export'
  | 'chat-conversation'
  | 'chat-message'
  | 'llm-completion'
  | 'llm-streaming'
  | 'image-generation'
  | 'video-generation'
  | 'video-status'
  | 'default';
```

---

## DO NOT TOUCH Sections

These files/areas should NOT be modified by any audit agent. The audit is read-only analysis.

| File/Area                                                    | Reason                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `apps/desktop/src-tauri/src/lib.rs`                          | Core entry point; modifications will break the entire desktop app build |
| `apps/desktop/src-tauri/src/core/llm/mod.rs` (Provider enum) | Changing Provider enum breaks all provider implementations              |
| `packages/types/index.ts`                                    | Shared types used across all packages                                   |
| `packages/utils/`                                            | Shared utilities; modifications affect all consumers                    |
| `apps/web/supabase/migrations/*.sql`                         | Production database migrations; never modify existing migrations        |
| `Cargo.toml`, `Cargo.lock`                                   | Rust dependency manifests                                               |
| `package.json`, `pnpm-lock.yaml`                             | JS dependency manifests                                                 |
| `apps/desktop/src-tauri/src/data/db/migrations/`             | SQLite migration files                                                  |
| All `*.test.ts`, `*.test.rs`, `__tests__/`                   | Test files (agents should not modify tests during audit)                |

**CRITICAL**: This is a READ-ONLY audit. No agents should modify any code. The output of each agent should be a findings report documenting:

1. Vulnerabilities or gaps discovered
2. Severity rating (Critical/High/Medium/Low/Info)
3. Specific file and line references
4. Recommended remediation steps

---

## Verification Checklist

Before spawning agents, verify:

- [x] All file paths exist in the codebase (verified via Read/Glob tools)
- [x] All interface contracts are documented with actual types from the codebase
- [x] No circular dependencies between agent scopes
- [x] DO NOT TOUCH sections are clearly communicated
- [x] Each agent has a clear, non-overlapping focus area
- [x] Shared files that appear in multiple agents' scope are identified (credit-service.ts, rate-limit.ts appear in Agent A/C/D but with different audit angles)

---

## Cross-Cutting Concerns

Some files appear in multiple agents' scope but from different audit perspectives:

| File                     | Agent A Focus                          | Agent B Focus                  | Agent C Focus                     | Agent D Focus                            |
| ------------------------ | -------------------------------------- | ------------------------------ | --------------------------------- | ---------------------------------------- |
| `credit-service.ts`      | Fallback behavior when RPC fails       | --                             | Authorization checks in RPCs      | Daily/monthly limit enforcement          |
| `rate-limit.ts`          | Fail-open vs fail-closed behavior      | --                             | --                                | Limit configurations and bypass vectors  |
| `auth.ts` (gateway)      | Error response format                  | --                             | JWT validation, timing attacks    | Rate limiting on auth endpoints          |
| `fallback_chain.rs`      | User-facing error messages             | Provider failover behavior     | --                                | Rate limit cooldown tracking             |
| `mod.rs` (billing)       | Degraded mode when billing disabled    | --                             | --                                | Access gating via `check_cloud_access()` |
| `route.ts` (completions) | Error handling for downstream failures | Provider routing and streaming | JWT validation, model tier access | Credit pre-check, deduction, rate limits |

---

## Summary of Architecture Patterns

### Error Handling Patterns

1. **Web API routes**: `withErrorHandler()` wrapper -> `AppError` with codes -> structured JSON responses
2. **Gateway**: Express `errorHandler` middleware -> operational vs programming errors
3. **Rust backend**: `Result<T, String>` for Tauri commands; `anyhow::Result` internally
4. **Frontend stores**: Zustand state with status enums (idle/fetching/succeeded/failed)

### Fallback Patterns

1. **LLM routing**: Primary provider -> retry with backoff -> fallback candidates -> aggregate error
2. **Credit checks**: RPC call -> RPC fallback -> direct balance query -> return false
3. **Rate limiting**: Redis -> in-memory fallback -> fail-closed for sensitive endpoints
4. **Subscription sync**: customer_id lookup -> email fallback -> retry with minimal fields

### Security Patterns

1. **Authentication**: Supabase JWT (web) + local Argon2 sessions (desktop) + JWT (gateway)
2. **Authorization**: RLS policies + RPC authorization checks + model tier requirements
3. **Input validation**: Zod schemas with `.strict()` + Rust type system
4. **Rate limiting**: Multi-layer (Redis, in-memory, per-provider cooldowns)
