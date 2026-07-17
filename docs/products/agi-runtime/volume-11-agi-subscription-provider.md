# AGI Runtime — Volume 11 — AGI Subscription Provider

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); nearest surface rules in `services/AGENTS.md`; grounded in `apps/web/lib/api-auth.ts`, `apps/web/app/api/models/route.ts`, `packages/contracts/types/src/model-catalog.ts`, `packages/contracts/types/src/models.json`, `apps/web/app/api/usage/route.ts`, `apps/web/lib/services/credit-service.ts`, `apps/web/lib/services/subscription-service.ts`, `apps/web/lib/assert-quota.ts`, `apps/web/app/api/checkout/route.ts`, `apps/web/app/api/stripe-webhook/route.ts`, `apps/web/lib/pricing.ts`, `apps/web/lib/rate-limit.ts`, `packages/contracts/types/src/billing-catalog.ts`, `services/api-gateway/src/routes/mobile.ts`.

## Overview & stance

The **AGI Subscription Provider** is the internal Runtime component that represents _AGI-managed access_ inside the provider registry — the counterpart to a BYOK provider adapter. Where a BYOK adapter forwards a user's own key directly, the Subscription Provider answers five questions on behalf of every surface: _who is this user (Clerk), what models does their plan unlock, how much have they used, is their subscription valid (Stripe), and are they within rate limits._ It exists only inside the **Managed Cloud** trust mode. **Local** and **BYOK** are free access modes and never touch this provider — they carry no subscription, no metering, and no plan gate (`packages/contracts/types/src/billing-catalog.ts` labels `local-only` and `byok` at $0). Never route a Local or BYOK session through subscription checks; doing so would leak the trust boundary the canon protects.

This provider is consumed by the surfaces that can reach Managed Cloud: Web, Mobile, Desktop, CLI, VS Code (Chrome verifies entitlements via the account/server, holding no keys). A **Remote Control** window inherits the host session's entitlement — it is not a separately-billed identity. The pricing ladder is fixed by founder decision (2026-06-30): **Free $0 / Basic $8·₹399 / Pro $20 / Max $100 and $200 / Enterprise custom**, no top-ups.

## Authentication — authenticate AGI users (Clerk)

Every managed-cloud request resolves to a Clerk user before any entitlement work. ✅ Built: `apps/web/lib/api-auth.ts` — `getClerkAuthUser()` accepts either a Clerk session (browser via `proxy.ts`) or a bearer token verified through `@clerk/backend` `verifyToken({ secretKey })`, and `assertAccountActive()` rejects `suspended`/`banned` profiles (fails open only on DB lookup error). Gateway parity is ✅ Built: `services/api-gateway/src/routes/mobile.ts` applies `authenticateToken` _before_ rate-limiting so no inserted route bypasses auth.

Requirements: (1) no anonymous managed-cloud call; unauthenticated requests return 401. (2) The userId is the sole billing/usage key — never trust a client-supplied plan or user id. (3) Suspension status is read on the request path, not just written by admin actions.

## Model Discovery — discover subscription models per plan

The catalog is single-sourced from `packages/contracts/types/src/models.json`; model IDs are never invented here. ✅ Built: `apps/web/app/api/models/route.ts` serves the canonical catalog (`listCanonicalModels`), and `packages/contracts/types/src/model-catalog.ts` gates it per tier via `getAllowedModelsForTier(tier)` / `isModelAllowedForTier(modelId, tier)` reading `modelsCatalog.tierAllowedModels`.

Requirements: (1) discovery returns only the models the caller's plan unlocks, so a Free user cannot select a Max-only model. (2) Higher tiers add manual model selection (`TIER_POLICIES.manualModelSelection`). (3) BYOK/Local surfaces enumerate providers independently and are not filtered by subscription plan.

🟡 Gap: `ProductTier` in `model-catalog.ts` is `free | pro | max | enterprise` — it has **no `basic` tier and no split Max ($100 vs $200)**, so per-plan discovery cannot yet distinguish the canon ladder. Reconciling `tierAllowedModels` and `ProductTier` with Free/Basic/Pro/Max×2/Enterprise is the separate tracked catalog task; specs use the canon ladder.

## Usage Tracking — track quotas and metering

Usage is metered credit-side, not sold as top-ups. ✅ Built: `apps/web/app/api/usage/route.ts` returns allocated / used / remaining credit cents plus period window via `CreditService.getBalance()` and `SubscriptionService.getSubscription()`; deduction flows through the `deduct_credits` RPC (`apps/web/lib/services/credit-service.ts`) with sibling routes `apps/web/app/api/usage/{deduct,history,analytics,providers}/route.ts`. Pre-flight gating is ✅ Built in `apps/web/lib/assert-quota.ts`: `assertQuota()` reads tier from the JWT claim (no DB hit), then an RLS-bound usage read and a `SECURITY DEFINER increment_usage` RPC, returning `ok | warn | downgrade | paywall`. Mobile surfaces its own view (`apps/mobile/services/usage.ts`, `apps/mobile/app/(app)/usage.tsx`).

Requirements: (1) metering is per-user and atomic (no direct service-role UPDATE). (2) Approaching-cap and hard-cap outcomes are distinct signals surfaced to the client. (3) Top-ups are enabled for paid tiers as of 2026-07-11 (capped, opt-in, per-tier payout parity — supersedes the earlier no-top-ups policy this row described). 🟡 Gap: `apps/web/app/api/credit-topup/route.ts` does not exist in the current tree at all (not even dormant/env-gated); it needs to be built as part of the 2026-07-11 top-up reconciliation, not merely un-gated.

## Billing — verify subscriptions (Stripe)

Stripe is the billing system of record; Neon stores the mirrored subscription row. ✅ Built: `apps/web/app/api/stripe-webhook/route.ts` pins the Node runtime, verifies the HMAC signature (`./lib/verify`), enforces idempotency (`./lib/idempotency`), and dispatches events (`./lib/handlers`); `SubscriptionService.syncWithStripe()` and `apps/web/app/api/sync-subscription/route.ts` reconcile `plan_tier`/`status` (active + trialing) into Neon. Checkout is 🟡 Partial: `apps/web/app/api/checkout/route.ts` is intentionally **env-gated off** behind `STRIPE_CHECKOUT_ENABLED` (managed-cloud _access_ is public-alpha-open; only paid higher-capacity checkout is gated while metering/refunds/fraud controls prove out) and requires CSRF.

Requirements: (1) verify entitlements from the server row, never a client claim. (2) Webhook signature + idempotency are mandatory; never trust an unsigned event. (3) Present the canon ladder in any paywall.

🟡 Gap: `packages/contracts/types/src/pricing.ts` does not exist — the real file is `packages/contracts/types/src/billing-catalog.ts` (`STRIPE_PRICE_IDS` lives in `apps/web/lib/pricing.ts`). `billing-catalog.ts` still encodes an incomplete shape (single Max, no `basic`, and a `team` entry that predates the 2026-07-11 per-seat reinstatement so it needs re-deriving, not deleting). This price-catalog reconciliation is the separate tracked task; do not invent INR for Pro/Max/Team (only Basic ₹399 is fixed).

## Rate Limits — enforce plan limits

Two layers. ✅ Built (transport): `apps/web/lib/rate-limit.ts` uses Upstash Redis with per-endpoint `rateLimitConfigs` and `failClosed` semantics, and **fails fast at cold-start** if Redis env is missing in production (in-memory limits are per-instance and unsafe). ✅ Built (plan): `packages/contracts/types/src/model-catalog.ts` `TIER_POLICIES` carry `tokenCapPerMonth` and `flagshipDailyTokenCap`, enforced by `assertQuota()`. Gateway adds per-route limiters (`services/api-gateway/src/middleware/rateLimit.ts`, applied in `routes/mobile.ts`).

Requirements: (1) security-sensitive endpoints fail closed when Redis is down; business-critical ones (checkout) may fail open. (2) Plan token caps and daily flagship caps are enforced server-side, not client-trusted. (3) Limits key on authenticated userId, not IP alone. 🟡 Gap: tier caps predate Basic/dual-Max and need the same reconciliation.

## Repository map

- `apps/web/lib/api-auth.ts`, `apps/web/lib/auth-guards.ts` — Clerk auth + account status.
- `apps/web/app/api/models/route.ts`; `packages/contracts/types/src/{model-catalog.ts,models.json,billing-catalog.ts,pricing.ts}` — catalog + per-tier gating + tier policies.
- `apps/web/app/api/usage/*`, `apps/web/lib/services/credit-service.ts`, `apps/web/lib/assert-quota.ts` — metering + quotas.
- `apps/web/app/api/{checkout,stripe-webhook,sync-subscription}/route.ts`, `apps/web/lib/services/subscription-service.ts`, `apps/web/lib/stripe-config.ts` — Stripe billing.
- `apps/web/lib/rate-limit.ts`, `services/api-gateway/src/middleware/rateLimit.ts`, `services/api-gateway/src/routes/mobile.ts` — rate limits.
- `apps/mobile/services/usage.ts`, `apps/mobile/lib/v1FeatureFlags.ts` (`billing: false`) — mobile consumer.

## Competitor notes

Claude, ChatGPT, and Codex each authenticate to one first-party account and meter one house model family. AGI's deliberate divergence: the Subscription Provider is _one_ provider among many in the Runtime registry, sitting beside **BYOK** adapters (Desktop/CLI/VS Code only) and **Local** runtimes that carry no subscription at all. Model discovery is multi-provider from `models.json`, not a single vendor list. Trust is per-surface: Web/Mobile can never present a BYOK path, and no subscription check ever touches a Local or BYOK session. Where competitors bundle plan + provider, AGI keeps "your models, no markup" free and monetizes only managed cloud.

## Acceptance / Definition of Done

Production-ready when: authentication rejects anonymous and suspended users on every managed-cloud path; model discovery returns only plan-unlocked IDs sourced from `models.json`; usage metering is atomic and top-up-free; Stripe webhooks verify signature + idempotency and the Neon row is the entitlement source of truth; rate limits fail closed where required and enforce per-plan token caps; and the tier catalog matches the canon ladder.

- [ ] Build: `/api/usage`, `/api/models`, `/api/stripe-webhook` green; `assertQuota` unit tests pass.
- [ ] Trust: no Local/BYOK request reaches subscription/metering; BYOK stays Desktop/CLI/VS Code only.
- [ ] Security: unsigned/duplicate webhooks rejected; Redis-down security routes fail closed; no client-supplied plan trusted.
- [ ] Reconciliation (🟡 tracked): `ProductTier`, `tierAllowedModels`, `STRIPE_PRICE_IDS`, `billing-catalog.ts` express Free/Basic $8·₹399/Pro $20/Max $100 & $200/Enterprise; `credit-topup` stays gated off.

## Anti-patterns

- Routing a Local or BYOK session through the Subscription Provider, or exposing BYOK on Web/Mobile.
- Trusting a client-supplied plan, userId, or entitlement instead of the Neon row + Clerk identity.
- Hardcoding or inventing a model ID; per-plan discovery must read `packages/contracts/types/src/models.json`.
- Reintroducing removed tiers ("Plus", `pro_plus`, "Hobby", consumer "Team") or inventing INR for Pro/Max.
- Shipping credit top-ups, or wiring `credit-topup` into UI.
- Accepting unsigned/replayed Stripe webhooks, or using in-memory rate limits in production.
- Referencing Supabase, or renaming `proxy.ts` back to `middleware.ts`.
- Claiming checkout is live while it is env-gated off, or describing 🟡/🔭 gaps as shipped.
