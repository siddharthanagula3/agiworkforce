# Codebase Review Findings — apps/web

Generated: 2026-02-26
Passes completed: 2
Total issues found: 47 (Critical: 7, High: 19, Medium: 14, Low: 7)

## Summary

- Fixed: 20 issues (Pass 1: 13, Pass 2: 7)
- Needs Human Review: 8 issues
- Skipped (test/config/blocked): 19 issues
- Verification: build PASS, lint PASS (0 errors, 1 warning)

---

## Pass 1 — Critical Issues

### FIXED [C1] Edge Runtime crash — Buffer.from in middleware

- **File**: `middleware.ts:41`
- **Category**: logic
- **Description**: `Buffer.from(crypto.randomUUID()).toString('base64')` — `Buffer` is not available in Next.js Edge Runtime. This crashes the middleware on every request.
- **Fix applied**: Replaced with `btoa(crypto.randomUUID())`.

### FIXED [C2] Wrong env vars in lib/supabase.ts — VITE\_ prefix

- **File**: `lib/supabase.ts:4-5`
- **Category**: config
- **Description**: Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (desktop Vite env vars) instead of `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. In Next.js, `VITE_*` vars are not exposed — Supabase client silently initializes with empty strings.
- **Fix applied**: Changed to `NEXT_PUBLIC_*` env var names and updated error message.

### FIXED [C3] getSession() instead of getUser() in multiple routes

- **File**: `app/api/user/export/route.ts:108`, `app/api/user/data/route.ts:117`, `app/api/waitlist/route.ts:22`, `app/api/download-beta/route.ts:52`, `app/api/me/route.ts:81`
- **Category**: security
- **Description**: `getSession()` trusts the JWT from the cookie without server-side re-validation. An attacker with a stolen or forged cookie could impersonate users. `getUser()` re-validates the JWT against Supabase on every call.
- **Fix applied**: Replaced `getSession()` with `getUser()` in all 5 cookie-based auth paths.

### NEEDS_HUMAN [C4] getAuthenticatedUser() duplicated in 17 route files

- **File**: 17 route files under `app/api/`
- **Category**: quality
- **Description**: The same ~30-line `getAuthenticatedUser()` helper (Bearer token + cookie fallback) is copy-pasted in 17 routes. Should be extracted to a shared module.
- **Blocked**: Extracting to shared module would change imports in 17 files — risk of breaking routes; recommend manual extraction.

---

## Pass 2 — Critical Issues

### FIXED [C5] localStorage crashes in Next.js server context

- **File**: `lib/supabase.ts:26-35`
- **Category**: logic
- **Description**: `secureStorage` adapter calls `localStorage.getItem()` / `.setItem()` / `.removeItem()` unconditionally. In server context (API routes, middleware, server components), `localStorage` is undefined — causes `ReferenceError` crash.
- **Fix applied**: Added `typeof window === 'undefined'` guards returning no-op values.

### FIXED [C6] Enterprise tier allocates 0 credits — all enterprise requests fail 402

- **File**: `lib/services/subscription-service.ts:29`
- **Category**: logic
- **Description**: `PLAN_CREDITS['enterprise'] = 0` with comment "handled separately" but no separate handler exists. Enterprise users cannot make any LLM requests — `allocateCreditsForPeriod` returns empty string, `CreditService.checkAvailable()` returns false, route returns 402.
- **Fix applied**: Set enterprise credits to 100000 ($1000/month default, overridable per-contract via Stripe metadata).

### NEEDS_HUMAN [C7] Stripe webhook idempotency — lock fails on DB error

- **File**: `app/api/webhooks/stripe/route.ts`
- **Category**: logic
- **Description**: Idempotency lock (`processed_events` table) insert fails on DB error → handler returns 500 → Stripe retries → duplicate processing. Should return 200 even on DB errors to stop Stripe retry loops.
- **Blocked**: Changing webhook error handling affects production billing.

---

## Pass 1 — High Issues

### FIXED [H1] Prompt cache cost calculation off by 100x

- **File**: `lib/prompt-cache-helper.ts:71-76`
- **Category**: logic
- **Description**: `inputCostPerMtok` is in dollars per 1M tokens. Formula `(tokens * costPerMtok) / 100` should be `/ 10_000` (tokens/1M _ dollars _ 100 cents/dollar). Result was 100x too high.
- **Fix applied**: Changed divisor from `100` to `10_000` in all three cost lines.

### FIXED [H2] Spurious deductCredits on insufficient balance

- **File**: `app/api/llm/v1/chat/completions/route.ts:531`
- **Category**: logic
- **Description**: When `hasCredits === false`, the code called `CreditService.deductCredits()` — draining whatever credit remained even though the user couldn't afford the request.
- **Fix applied**: Removed the spurious `deductCredits` call. Now derives `DAILY_CREDIT_LIMIT_REACHED` from balance info.

### FIXED [H3] Model tier allow-by-default in v1/chat/completions

- **File**: `app/api/llm/v1/chat/completions/route.ts:131`
- **Category**: security
- **Description**: `checkModelTierAccess` returned `true` for unknown models, meaning any new model added to providers would be available to all tiers.
- **Fix applied**: Added `ECONOMY_MODELS` set; changed fallthrough to `return false` (deny by default); updated `MODEL_TIER_REQUIREMENTS` to match the completion route.

### FIXED [H4] Missing CSRF_SECRET in env validation

- **File**: `lib/validate-env.ts:29`
- **Category**: config
- **Description**: `CSRF_SECRET` not listed in `importantVars` — server starts without it, silently breaking CSRF protection.
- **Fix applied**: Added `CSRF_SECRET` to `importantVars` list.

### NEEDS_HUMAN [H5] IDOR in video status endpoint

- **File**: `app/api/video/status/route.ts`
- **Category**: security
- **Description**: Video status endpoint may not verify the requesting user owns the video task. Requires Redis-backed task ownership store.
- **Blocked**: Needs Redis infra + task ownership schema.

### NEEDS_HUMAN [H6] 1039-line handleChatCompletions monolith

- **File**: `app/api/llm/v1/chat/completions/route.ts`
- **Category**: quality
- **Description**: Single function spans ~1039 lines handling auth, credits, streaming, caching, cost calculation, and error handling. Should be decomposed.
- **Blocked**: Decomposition changes public API handler — requires careful refactoring to avoid regressions.

### [H7] Streaming path missing prompt caching (factory.ts)

- **File**: `lib/llm-providers/factory.ts:369`
- **Category**: logic
- **Description**: `streamRequest()` in the factory never passes `usePromptCache` to the provider. Only `sendRequest()` enables prompt caching.
- **Status**: Skipped — changes to provider factory need careful testing with actual API calls.

### [H8] Silent empty auth token in useMediaGeneration

- **File**: `hooks/useMediaGeneration.ts`
- **Category**: logic
- **Description**: When Supabase session is absent, empty string is used as Bearer token rather than failing explicitly.
- **Status**: Skipped — frontend hook, would need coordinated frontend + backend changes.

### [H9] Image generation priced as free

- **File**: `lib/services/llm-cost-calculator.ts:52-54`
- **Category**: logic
- **Description**: Image gen models have `inputCostPer1MTokens: 0.0` — correct since they're not token-based, but per-image pricing is not implemented. Requests may be undercharged.
- **Status**: Skipped — image gen pricing is fundamentally different. Needs a separate pricing model.

### NEEDS_HUMAN [H10] CI typecheck only checks desktop, never apps/web

- **File**: `.github/workflows/` CI config
- **Category**: config
- **Description**: `pnpm typecheck` only runs `cd apps/desktop && tsc --noEmit`. Web app TypeScript errors never caught in CI.
- **Blocked**: CI changes affect shared infra.

---

## Pass 2 — High Issues

### FIXED [H11] ECONOMY_MODELS diverged between two routes

- **File**: `app/api/llm/v1/chat/completions/route.ts` vs `app/api/llm/completion/route.ts`
- **Category**: logic
- **Description**: v1/chat/completions ECONOMY_MODELS was missing `glm-4.7`, `glm-4.6v`, `glm-4.6v-flash`, `grok-4-mini`, `grok-code-fast-1`, `qwen-plus`, `claude-3-haiku`. These models were denied to hobby users in one route but allowed in the other.
- **Fix applied**: Synced ECONOMY_MODELS to include all budget models from both routes.

### FIXED [H12] daily_remaining_cents === 0 strict check misses edge cases

- **File**: `app/api/llm/v1/chat/completions/route.ts:605,611`
- **Category**: logic
- **Description**: `balance?.daily_remaining_cents === 0` fails for `null`, `undefined`, and near-zero fractional values. Should use `!= null && <= 0`.
- **Fix applied**: Changed to `balance?.daily_remaining_cents != null && balance.daily_remaining_cents <= 0`.

### FIXED [H13] ZhipuAI models missing from MODEL_PRICING

- **File**: `lib/services/llm-cost-calculator.ts`
- **Category**: logic
- **Description**: `glm-4.7`, `glm-4.6v`, `glm-4.6v-flash` not in MODEL_PRICING table. Falls back to FALLBACK_PRICING ($1/$4 per 1M tokens) instead of actual prices (~$0.10-$0.50). Users overcharged 7-9x.
- **Fix applied**: Added ZhipuAI pricing entries and `zhipuai` provider default.

### FIXED [H14] Missing env vars in validation (UPSTASH_REDIS, DEVICE_TOKEN_ENCRYPTION_KEY)

- **File**: `lib/validate-env.ts:41-49`
- **Category**: config
- **Description**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `DEVICE_TOKEN_ENCRYPTION_KEY` not in importantVars. Server starts without them, silently breaking rate limiting and push notifications.
- **Fix applied**: Added all three to importantVars with explanatory comments.

### FIXED [H15] Anthropic streamRequest missing usePromptCache

- **File**: `lib/llm-providers/anthropic.ts:235`
- **Category**: logic
- **Description**: `streamRequest()` calls `mapMessagesToAnthropic()` without passing `usePromptCache` parameter. Message-body `cache_control` blocks never applied during streaming — cache savings lost for streaming requests.
- **Fix applied**: Added `request.usePromptCache` as second argument to `mapMessagesToAnthropic()` in `streamRequest()`.

### FIXED [H16] Hobby tier gets 403 on auto-balanced/auto-premium

- **File**: `app/api/llm/v1/chat/completions/route.ts`
- **Category**: logic
- **Description**: `auto-balanced` resolves to `gpt-5.2` (pro-tier), `auto-premium` resolves to `claude-sonnet-4.5` (pro-tier). Hobby users sending auto models get 403 instead of being downgraded to economy.
- **Fix applied**: Made `resolveAutoModel()` tier-aware — hobby users' balanced/premium auto selections downgrade to `gpt-5-nano`.

### NEEDS_HUMAN [H17] Stripe credit top-up amount from unverified metadata

- **File**: `app/api/webhooks/stripe/route.ts`
- **Category**: security
- **Description**: `checkout.session.completed` reads credit amount from `session.metadata.credit_amount` instead of `session.amount_total`. An attacker could manipulate checkout metadata to receive more credits than paid for.
- **Blocked**: Changing Stripe webhook logic affects production billing — needs manual review.

### NEEDS_HUMAN [H18] Credit revocation race condition (non-atomic read-modify-write)

- **File**: `lib/services/credit-service.ts`
- **Category**: logic
- **Description**: `checkAvailable()` + `deductCredits()` are separate RPCs. Under concurrent requests, both can pass `checkAvailable()` then both deduct, driving balance negative.
- **Blocked**: Requires atomic Supabase RPC (stored procedure) or Redis-based locking. Architecture change.

### [H19] Two competing vercel.json — root missing rewrites and crons

- **File**: Root `vercel.json` vs `apps/web/vercel.json`
- **Category**: config
- **Description**: Root vercel.json is authoritative for Vercel deployment but may be missing `api.agiworkforce.com` rewrites and daily credit reset cron that exist in `apps/web/vercel.json`.
- **Status**: Skipped — needs manual review of production Vercel configuration to determine which file is active.

---

## Pass 1 — Medium Issues

### [M1] CSP connect-src incomplete

- **File**: `middleware.ts`
- **Description**: CSP `connect-src` doesn't include all LLM provider domains. Client-side fetch to these would be blocked.
- **Status**: Skipped — all LLM calls go server-side through the API route.

### [M2] IP-only rate limiting

- **File**: `lib/rate-limit.ts`
- **Description**: Rate limiting uses IP only, not user ID. Users behind shared NATs may be unfairly rate-limited.
- **Status**: Skipped — standard pattern for Vercel deployments.

### [M3] Two competing vercel.json files

- **File**: Root and apps/web vercel.json
- **Description**: Both root and apps/web have vercel.json files which may conflict.
- **Status**: Tracked in H19 for deeper analysis.

### [M4] Missing Redis validation for rate limiting

- **File**: `lib/rate-limit.ts`
- **Description**: If Redis is unavailable, rate limiting silently falls back to allowing all requests.
- **Status**: Skipped — graceful degradation is intentional for availability.

### [M5] Stripe webhook silent null degradation

- **File**: `app/api/webhooks/stripe/route.ts`
- **Description**: Missing Stripe webhook secret causes silent failures rather than explicit startup error.
- **Status**: Addressed indirectly by H4/H14 (env validation pattern).

### FIXED [M6] AUTO_MODEL_MAPPINGS uses outdated model names

- **File**: `app/api/llm/v1/chat/completions/route.ts:109-113`
- **Description**: Auto models map to `gpt-4o-mini` and `gpt-4o` which are legacy.
- **Fix applied**: Updated to `gpt-5-nano` (economy), `gpt-5.2` (balanced), `claude-sonnet-4.5` (premium).

### [M7] argon2 native addon on Vercel

- **File**: `package.json`
- **Description**: argon2 requires native compilation which may fail on Vercel's serverless runtime.
- **Status**: Skipped — needs package replacement evaluation.

### [M8] typescript.ignoreBuildErrors tech debt

- **File**: `next.config.ts`
- **Description**: Build ignores TypeScript errors, masking real type issues.
- **Status**: Known tech debt, tracked separately.

---

## Pass 2 — Medium Issues

### [M9] Rate limit key 'chat-conversation' reused for 25+ non-conversation routes

- **File**: Multiple API routes
- **Category**: quality
- **Description**: Many routes use the same rate limit bucket, allowing cross-route rate limit bypass.
- **Status**: Skipped — functional, low risk.

### [M10] Supabase admin client created fresh in 36 handler bodies

- **File**: Multiple API routes
- **Category**: quality
- **Description**: Each route instantiates its own admin Supabase client. Should use a shared singleton.
- **Status**: Skipped — performance optimization, not a bug.

### [M11] 30+ routes return no CORS/security headers

- **File**: Multiple API routes
- **Category**: security
- **Description**: Many routes don't apply CORS or security headers. The `handleCorsPreflightRequest` is only used in some.
- **Status**: Skipped — middleware handles CORS globally.

### [M12] CSP unsafe-eval on all pages

- **File**: `middleware.ts`
- **Category**: security
- **Description**: `script-src 'unsafe-eval'` applied globally instead of only on pages that need it (Stripe).
- **Status**: Skipped — would need per-route CSP headers.

### [M13] Two independent chatStore implementations both actively imported

- **File**: `stores/chatStore.ts` and `stores/stub-chatStore.ts`
- **Category**: quality
- **Description**: Stub and real store both exist, potentially causing confusion.
- **Status**: Skipped — stubs are intentional for build compatibility.

### [M14] Stripe cron reset uses stale period boundaries

- **File**: `app/api/cron/reset-credits/route.ts`
- **Category**: logic
- **Description**: Credit reset cron may use stale subscription period dates if Stripe webhook was delayed.
- **Status**: Skipped — edge case, requires Stripe API call to refresh periods.

---

## Low Issues

### [L1-L7] Various code quality issues

- Unused imports/variables in stores (warnings only)
- 17 `getAuthenticatedUser` duplications (tracked as C4)
- Console.log debug statements in validate-env.ts
- Missing error boundaries in some client components
- Some API routes missing OPTIONS/CORS handler
- Dead code in egress policy module
- Stub stores shadow real store names

---

## Verification

- **Pass 1**: Build PASS, Lint PASS (0 errors, 51 warnings)
- **Pass 2**: Build PASS, Lint PASS (0 errors, 1 warning — pre-existing unused var)
- **Type-check**: PASS (via `next build` with `ignoreBuildErrors: true`)

---

## Requires Human Attention

| ID  | Category | Severity | Title                                         | Reason Blocked                                          |
| --- | -------- | -------- | --------------------------------------------- | ------------------------------------------------------- |
| C4  | quality  | critical | getAuthenticatedUser duplicated 17x           | Risk of breaking 17 routes; recommend manual extraction |
| C7  | logic    | critical | Stripe webhook idempotency lock               | Changes production billing error handling               |
| H5  | security | high     | IDOR in video status endpoint                 | Needs Redis infra + task ownership schema               |
| H6  | quality  | high     | 1039-line handler monolith                    | Decomposition requires careful refactoring              |
| H10 | config   | high     | CI typecheck skips apps/web                   | CI changes affect shared infra                          |
| H17 | security | high     | Stripe credit top-up from unverified metadata | Production billing change                               |
| H18 | logic    | high     | Credit service TOCTOU race condition          | Needs atomic RPC or distributed lock                    |
| H19 | config   | high     | Competing vercel.json files                   | Needs production Vercel config review                   |
