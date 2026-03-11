# Feature: Billing

> End-to-end Stripe-powered billing system spanning a Rust desktop backend (feature-gated), a Next.js web API layer with Supabase-backed credit metering, and React frontends on both desktop and web with subscription gating, usage tracking, and plan tier enforcement.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust billing module | `apps/desktop/src-tauri/src/sys/billing/` (`mod.rs`, `models.rs`, `stripe_client.rs`, `webhooks.rs`) |
| Rust subscription commands | `apps/desktop/src-tauri/src/sys/commands/subscription.rs` |
| Desktop Stripe service (TS) | `apps/desktop/src/services/stripe.ts` |
| Desktop subscription service | `apps/desktop/src/services/subscriptionService.ts` |
| Desktop billing stores | `apps/desktop/src/stores/billingStore.ts`, `billingUsage.ts`, `subscriptionPlanStore.ts`, `costStore.ts` |
| Desktop subscription UI | `apps/desktop/src/components/Subscription/` (`SubscriptionGate.tsx`, `SubscriptionLockDialog.tsx`) |
| Desktop analytics UI | `apps/desktop/src/components/Analytics/` (`CostDashboard.tsx`, `UsageDashboard.tsx`, `CostSidebarWidget.tsx`) |
| Web Stripe lib (client) | `apps/web/shared/lib/stripe.ts` |
| Web pricing config | `apps/web/lib/pricing.ts` |
| Web price-tier mapping | `apps/web/lib/price-tier-mapping.ts` |
| Web Stripe type helpers | `apps/web/lib/stripe-types.ts` |
| Web credit service | `apps/web/lib/services/credit-service.ts` |
| Web subscription service | `apps/web/lib/services/subscription-service.ts` |
| Web token enforcement | `apps/web/core/billing/token-enforcement-service.ts` |
| Web billing feature services | `apps/web/features/billing/services/` (`stripe-payments.ts`, `credit-tracking.ts`, `token-pack-purchase.ts`) |
| Web billing hooks | `apps/web/features/billing/hooks/use-billing-queries.ts` |
| Web billing page | `apps/web/features/billing/pages/BillingDashboard.tsx` |
| Web API routes | `apps/web/app/api/checkout/route.ts`, `stripe-webhook/route.ts`, `portal/route.ts`, `credit-topup/route.ts`, `sync-subscription/route.ts`, `cron/reset-credits/route.ts`, `llm/v1/credits/balance/route.ts` |
| Web dashboard billing page | `apps/web/app/dashboard/billing/page.tsx` |
| Web pricing page | `apps/web/app/pricing/page.tsx` |
| Web subscription gate | `apps/web/components/Subscription/SubscriptionGate.tsx`, `SubscriptionLockDialog.tsx` |
| Web manage billing button | `apps/web/components/stripe/ManageBillingButton.tsx` |
| Supabase migrations | `apps/web/supabase/migrations/` (credit accounts, idempotency, RLS policies) |

## Data Flow

### Stripe Checkout Flow (Web)

```
User clicks "Subscribe" on /pricing
  -> POST /api/checkout { plan, billingInterval }
     -> Zod validates request (CheckoutRequestSchema)
     -> Auth check via Supabase getUser()
     -> Get or create Stripe customer (profiles.stripe_customer_id)
     -> If active subscription exists -> redirect to Billing Portal
     -> stripe.checkout.sessions.create({ mode: 'subscription', ... })
     -> Returns { url } -> redirect to Stripe Checkout
  -> Stripe Checkout completes
  -> Stripe fires webhook events
```

### Webhook Processing (Web)

```
Stripe sends POST /api/stripe-webhook
  -> Verify signature via stripe.webhooks.constructEvent()
  -> Rate limited (withRateLimit)
  -> Handled events:
     checkout.session.completed
       -> Resolve user via metadata.supabase_user_id / client_reference_id
       -> Upsert subscription record in Supabase
       -> Allocate credits via SubscriptionService.allocateCreditsForPeriod()
     customer.subscription.updated
       -> Update plan_tier, status, period dates
     customer.subscription.deleted
       -> Set status = 'canceled'
     invoice.payment_succeeded
       -> Allocate credits for new period
     invoice.payment_failed
       -> Set status = 'past_due', record payment failure
     checkout.session.completed (credit_topup)
       -> Add credits via CreditService
```

### Webhook Processing (Desktop / Rust)

```
WebhookHandler.process_event(payload, signature)
  -> HMAC-SHA256 signature verification (constant-time comparison)
  -> Timestamp freshness validation (300s tolerance)
  -> Idempotency check (billing_webhook_events table)
  -> Store event, dispatch to handler by EventType:
     CustomerSubscriptionCreated -> INSERT billing_subscriptions
     CustomerSubscriptionUpdated -> UPDATE status, period
     CustomerSubscriptionDeleted -> UPDATE status = 'canceled'
     InvoicePaymentSucceeded -> INSERT billing_invoices
     InvoicePaymentFailed -> UPDATE status = 'past_due', 7-day grace period
     CustomerCreated/Updated/Deleted -> sync billing_customers
  -> Mark event processed
  -> Retry support: retry_failed_events(max_retries)
```

### Subscription Sync (Desktop -> Web)

```
Desktop app authenticates via Supabase
  -> POST /api/sync-subscription (Bearer token or cookie)
  -> SubscriptionService.syncWithStripe(userId, email)
     -> Look up stripe_customer_id from profiles (preferred)
     -> Fallback: Stripe customer search by email (deprecated)
     -> Fetch active/trialing subscriptions from Stripe
     -> Infer plan tier via resolvePlanTier(metadata, priceId)
     -> Upsert subscription record in Supabase
     -> Allocate credits for the period
  -> Desktop stores update (billingStore, subscriptionPlanStore)
```

### Credit Metering

```
LLM API call begins:
  -> Pre-flight check: CreditService.checkAvailable(userId, estimatedCents)
     -> Supabase RPC: check_credits_available (monthly + daily limits)
     -> Daily limit = 30% of monthly allocation
  -> If insufficient -> deny request with specific error code

LLM API call completes:
  -> CreditService.deductCredits(userId, amountCents, description, metadata, idempotencyKey)
     -> Supabase RPC: deduct_credits (atomic, idempotent)
  -> Balance update pushed to frontend stores

Monthly reset:
  -> Cron: GET /api/cron/reset-credits (CRON_SECRET required in prod)
     -> Iterates active subscriptions
     -> SubscriptionService.resetCreditsForNewPeriod()
     -> CreditService.resetForPeriod() via Supabase RPC
```

### Plan Tiers

| Tier | Monthly Price | Cloud Credits/mo | Automations | API Calls | Storage | Team Members |
|------|--------------|-------------------|-------------|-----------|---------|-------------|
| Hobby | $10 | $3.50 | 10/day | 100 | 1 GB | 1 |
| Pro | $29.99 | $12.00 | Unlimited | 10,000 | 10 GB | 1 |
| Max | $299.99 | $150.00 | Unlimited | 100,000 | 100 GB | 5 |
| Enterprise | Custom | $1,000.00 | Unlimited | Custom | Custom | Custom |

## Rust Commands (IPC)

All billing commands are `#[cfg(feature = "billing")]`-gated with no-op stubs when disabled. The `billing` feature is enabled by default in `Cargo.toml`.

### `sys/billing/mod.rs` (18 defined, 13 registered in lib.rs)

| Command | Purpose | Registered in lib.rs |
|---------|---------|---------------------|
| `billing_initialize` | Initialize Stripe client + webhook handler with API key and secret | Yes |
| `stripe_create_customer` | Create Stripe customer and persist to `billing_customers` | Yes |
| `stripe_get_customer_by_email` | Look up customer in local DB by email | Yes |
| `stripe_create_subscription` | Create Stripe subscription with optional trial period | Yes |
| `stripe_get_subscription` | Retrieve and sync subscription from Stripe | Yes |
| `stripe_update_subscription` | Change price/plan on existing subscription | Yes |
| `stripe_cancel_subscription` | Cancel subscription via Stripe API | Yes |
| `stripe_get_invoices` | Fetch invoices from Stripe, cache in `billing_invoices` | Yes |
| `stripe_get_usage` | Query aggregated usage from `billing_usage` table | Yes |
| `stripe_track_usage` | Record usage event (automation, api_call, llm_tokens, etc.) | Yes |
| `stripe_create_portal_session` | Create Stripe Billing Portal session URL | Yes |
| `stripe_get_active_subscription` | Get active/trialing subscription from local DB | Yes |
| `stripe_process_webhook` | Process and verify webhook event | Yes |
| `stripe_get_payment_methods` | List customer payment methods from Stripe | **No** |
| `stripe_attach_payment_method` | Attach payment method to customer | **No** |
| `stripe_set_default_payment_method` | Set default payment method on customer | **No** |
| `stripe_create_setup_intent` | Create SetupIntent for saving payment methods | **No** |
| `stripe_delete_payment_method` | Detach payment method from customer | **No** |
| `send_invoice_email` | Send invoice via SMTP (with mailto fallback) | **No** |

### `sys/commands/subscription.rs` (5 defined, 1 registered in lib.rs)

| Command | Purpose | Registered in lib.rs |
|---------|---------|---------------------|
| `subscribe_to_plan` | Create subscription with 14-day trial, validates no existing active sub | **No** |
| `upgrade_plan` | Change to new plan tier on existing subscription | **No** |
| `cancel_subscription` | Cancel with ownership verification (customer_id must match user_id) | Yes |
| `get_pricing_plans` | Return hardcoded plan catalog (Hobby/Pro/Max) | **No** |
| `get_current_plan` | Return current user plan (stub: always returns Hobby) | **No** |

## Web API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/checkout` | POST | Create Stripe Checkout session for new subscription (CSRF + rate limited) |
| `/api/stripe-webhook` | POST | Receive and process Stripe webhook events (signature verified) |
| `/api/portal` | POST | Create Stripe Billing Portal session for managing subscription (CSRF + rate limited) |
| `/api/credit-topup` | POST | Create Checkout session for one-time credit purchase ($10-$1000, CSRF + rate limited) |
| `/api/sync-subscription` | POST | Sync local subscription with Stripe (supports Bearer token + cookie auth) |
| `/api/cron/reset-credits` | GET | Monthly credit reset cron job (CRON_SECRET required in production) |
| `/api/llm/v1/credits/balance` | GET | Return credit balance for desktop/mobile (Bearer auth, rate limited) |
| `/api/usage` | GET | Usage statistics endpoint |
| `/api/claim-offer` | POST | Claim promotional offers |

## Store Schema

### `billingStore.ts` (Desktop — primary billing store)

```typescript
interface BillingState {
  plan: PlanTier | null;                    // 'free' | 'hobby' | 'pro' | 'max' | 'enterprise'
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;   // 'active' | 'trialing' | 'past_due' | 'canceled' | 'none' | ...
  subscriptionFetchStatus: SubscriptionFetchStatus;
  currentPeriodEnd: number | null;
  isPro: boolean;                           // true for hobby, pro, max, enterprise
  isEnterprise: boolean;
  featureFlags: Record<string, boolean>;
  stripeCustomerId: string | null;
  stripeCustomer: CustomerInfo | null;
  stripeSubscription: SubscriptionInfo | null;
  stripeInitialized: boolean;
  credits: CreditBalance | null;
  creditBalance_cents: number | null;
  dailyUsage_cents: number | null;
  dailyLimit_cents: number | null;
  dailyResetAt: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  deviceLinkId: string | null;
  deviceLinkCode: string | null;
  lastSyncedAt: number | null;
  error: string | null;
}
```

Persist key: `billing-core-storage` (v1). Only `creditBalance_cents` is persisted; all other data is fetched fresh from backend.

### `subscriptionPlanStore.ts` (Desktop — plan tier source of truth)

```typescript
interface SubscriptionPlanState {
  plan: PlanTier | null;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
  currentPeriodEnd: number | null;
  isPro: boolean;
  isEnterprise: boolean;
}
```

Persist key: `subscription-plan-storage` (v1). Nothing persisted (sensitive tier data always re-fetched).

### `costStore.ts` (Desktop — LLM cost analytics)

```typescript
interface CostState {
  costOverview: CostOverviewResponse | null;
  costAnalytics: CostAnalyticsResponse | null;
  costFilters: { days: number; provider?: string; model?: string };
  loadingCostOverview: boolean;
  loadingCostAnalytics: boolean;
  costError: string | null;
}
```

Invokes: `chat_get_cost_overview`, `chat_get_cost_analytics`, `chat_set_monthly_budget`.

### `billingUsage.ts` (Desktop — unified usage tracking)

Large consolidated store merging usage tracking, budget enforcement, and analytics:
- Usage stats: automations, API calls, storage, LLM tokens
- Token budget: monthly/daily budgets, alerts at thresholds
- ROI analytics: time saved, cost per automation
- Model-level usage breakdown

## Component Tree

### Desktop

```
AppLayout
  SubscriptionGate                    # Full-page gate: blocks app if no active sub
    <app content>
  SubscriptionLockDialog              # Modal gate: shown for specific locked features

Settings/
  AccountSettings                     # Shows current plan, subscription status
  SettingsPanel                       # Plan selector, billing interval toggle

Analytics/
  CostDashboard                       # LLM cost overview, per-model breakdown
  CostSidebarWidget                   # Compact cost summary in sidebar
  UsageDashboard                      # Usage metrics (automations, API calls, tokens)

UnifiedAgenticChat/
  BudgetTracker                       # Real-time token/cost tracking in chat
  BudgetAlertsPanel                   # Budget threshold alerts
  ChatInputArea                       # Shows credit warnings before send
```

### Web

```
app/pricing/page.tsx                  # Pricing page with plan cards, checkout integration
app/dashboard/billing/page.tsx        # Server-rendered billing status page
  ManageBillingButton                 # Opens Stripe Billing Portal

features/billing/pages/
  BillingDashboard                    # Full billing dashboard (React Query)
    useBillingData()                  # Parallel fetch: plan + balance + usage
    useTokenBalance()                 # Credit balance in cents
    useTokenAnalytics()               # Session-level token analytics

components/Subscription/
  SubscriptionGate                    # Tier-based access control (TIER_RANK comparison)
  SubscriptionLockDialog              # Upgrade prompt dialog

components/modals/
  CreditAlertModal                    # Low credit warnings

features/chat/components/tokens/
  TokenAnalyticsDashboard             # Token usage analytics view
  TokenBalanceDisplay                 # Credit balance indicator
```

## Key Patterns

### Stripe Integration Pattern

**Web**: Server-side Stripe SDK (`stripe` npm package) used in Next.js API routes. Lazy-initialized to avoid build-time errors when env vars are missing. Most API routes use `apiVersion: '2026-02-25.clover'`; `subscription-service.ts` uses `'2026-01-28.clover'` (version mismatch — should be unified).

**Desktop (Rust)**: `async-stripe` crate (v0.31) with `runtime-tokio-hyper` feature. Behind `#[cfg(feature = "billing")]` with complete no-op stub implementations for when billing is disabled. `StripeService` wraps the Stripe `Client` and owns a `Arc<Mutex<Connection>>` to the local SQLite database.

**Desktop (TypeScript)**: `StripeService` class in `services/stripe.ts` wraps all Tauri `invoke()` calls to the Rust billing commands. Gracefully handles "Billing feature is not enabled" errors for dev/BYOK builds.

### Webhook Verification

- **Web**: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` — standard Stripe SDK verification.
- **Rust**: Custom HMAC-SHA256 verification with constant-time comparison (`mac.verify_slice`), 300-second timestamp freshness validation to prevent replay attacks, and idempotency via `billing_webhook_events` table.

### Price-Tier Mapping

Centralized in `apps/web/lib/price-tier-mapping.ts`. Maps Stripe price IDs to plan tiers using environment variables (`STRIPE_PRICE_HOBBY_MONTHLY`, etc.) as the single source of truth. Supports `PRICE_ID_OVERRIDES` env var for ad-hoc overrides. The `resolvePlanTier()` function checks metadata first, then price ID mapping, avoiding fragile substring matching.

### Subscription Caching (Desktop)

`billingStore.ts` implements a localStorage-based subscription cache (`agiworkforce_subscription_cache_billing`) with a 24-hour TTL, keyed by userId. Used to show plan info immediately while a fresh fetch is in progress.

### Credit System

Credits are tracked in cents (not tokens) in Supabase via RPC functions:
- `get_credit_balance` — returns current balance with daily limits
- `check_credits_available` — atomic pre-flight check (monthly + daily)
- `deduct_credits` — atomic deduction with idempotency key support (24h key validity)
- `get_or_create_credit_account` — ensures account exists for a billing period
- `reset_credits_for_period` — resets credits at period boundary

Daily limit is 30% of monthly allocation, preventing a user from burning all credits in one day.

Credit allocation per plan (cents/month): free=0, hobby=350, pro=1200, max=15000, enterprise=100000.

### Plan Tier Guards

**Desktop**: `SubscriptionGate` component blocks the entire app if no active subscription. `SubscriptionLockDialog` is a dismissible modal for individual features. `hasBillingFeature()` checks feature flags, then falls back to plan-based feature matrix (`PLAN_FEATURES` in `subscriptionService.ts`).

**Web**: `SubscriptionGate` component uses `TIER_RANK` ordering (`free=0, hobby=1, pro=2, max=3, enterprise=4`) to compare `currentTier >= requiredTier`. Returns `null` while tier is loading to avoid premature lockout.

### Token Enforcement (Web)

`token-enforcement-service.ts` provides:
- `canUserMakeRequest(userId, estimatedTokens)` — comprehensive pre-flight check (monthly allowance + token balance)
- `checkTokenSufficiency(userId, estimatedTokens)` — balance-only check
- `deductTokens(userId, metadata)` — dual-path deduction (new credit system RPC, legacy `deduct_user_tokens` fallback)
- `getUserTokenBalance(userId)` — fails closed on errors (returns `null` to trigger denial)

### Dual Stripe Client Architecture

The web app has two independent Stripe integrations:
1. **Server-side** (`apps/web/app/api/` routes): Uses `stripe` Node.js SDK directly for checkout, webhooks, portal, credit topup.
2. **Client-side** (`apps/web/shared/lib/stripe.ts`): Uses `@stripe/stripe-js` + `@stripe/react-stripe-js` for Elements-based payment forms, with `PaymentAPI` class calling Netlify function endpoints.

### Usage Tracking Types (Rust)

The `billing_usage` table tracks six categories:
- `automation_execution` — workflow/automation runs
- `api_call` — API requests
- `storage_mb` — storage consumption
- `llm_tokens` — total LLM token usage
- `browser_session` — browser automation sessions
- `mcp_tool_call` — MCP tool invocations

### Token Cost Tracking (Web)

`TokenTrackingService` in `features/billing/services/credit-tracking.ts` maintains an in-memory usage history with per-provider pricing tables (OpenAI, Anthropic, Google, Perplexity) and calculates costs per request in real-time. Provides export to JSON/CSV.

## Known Issues / Tech Debt

1. **`get_current_plan` is a stub**: Always returns the first plan (Hobby), ignoring the `user_id` parameter. Needs to query actual subscription state.

2. **Dual billing system coexistence**: The web app has both a Netlify Functions-based payment system (referenced in `stripe-payments.ts`, `token-pack-purchase.ts`) and a Next.js API routes-based system (`/api/checkout`, `/api/portal`). The Netlify functions appear to be legacy but are still referenced from the `BillingDashboard` component.

3. **`billing` feature flag always enabled**: `Cargo.toml` sets `default = ["shell", "updater", "billing", ...]` so the feature gate is effectively always on. The extensive `#[cfg(not(feature = "billing"))]` stubs exist for a build configuration that is never used in practice.

4. **Email-based Stripe customer lookup deprecated**: The portal and sync endpoints fall back to looking up Stripe customers by email when `stripe_customer_id` is not stored in profiles. This is explicitly marked as deprecated with security warnings. Migration to customer_id-only lookup is pending.

5. **Webhook `handle_subscription_created` has typo**: Column name `updated_a` (truncated) in the SQL INSERT statement at `webhooks.rs:252`. This would cause a runtime SQL error when handling subscription creation webhooks via the Rust path.

6. **`send_invoice_email` env-based SMTP**: Uses raw environment variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`) rather than SecretManager. Sensitive credentials are read from env vars directly.

7. **Token enforcement is partially client-side**: `token-enforcement-service.ts` contains a TODO noting that client-side deduction is a legacy pattern and should be moved entirely server-side.

8. **`get_plan_details` uses substring matching**: In `subscription.rs`, plan names are inferred from price IDs via `contains("basic")`, `contains("pro")` etc. — fragile compared to the web's strict `price-tier-mapping.ts` approach.

9. **No Rust-side credit metering**: The Rust billing module tracks usage in `billing_usage` but does not enforce credit limits before LLM calls. Credit enforcement only happens on the web API side.

10. **Desktop `billingStore` and `subscriptionPlanStore` overlap**: Both stores track `plan`, `subscriptionStatus`, `isPro`, `isEnterprise` with nearly identical state shapes. This duplication was created during the auth store decomposition and has not been consolidated.

11. **Web `subscriptionGate.ts` is a stub**: The file at `apps/web/utils/subscriptionGate.ts` is a stub file (`export const _stub = true`) used only for web port compilation. The actual subscription gating for the web is in `apps/web/components/Subscription/SubscriptionGate.tsx`.

12. **Credit topup success/cancel URLs use billing page**: The credit topup route redirects to `/dashboard/billing?topup=success` but the billing dashboard page does not handle the `topup` query parameter.

13. **`BillingDashboard` references Netlify Functions**: The web billing dashboard component calls `/.netlify/functions/payments/*` endpoints (from `stripe-payments.ts` and `token-pack-purchase.ts`), but the current deployment is on Vercel/Next.js. These endpoints may not exist in the current infrastructure.
