# AGI Web — Volume 13 — Subscription

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-11

Authority: `AGENTS.md` (repo root) and `apps/web/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon, pricing ladder + trust modes); grounded in `apps/web/lib/pricing.ts`, `packages/contracts/types/src/billing-catalog.ts`, `apps/web/app/pricing/page.tsx`, `apps/web/app/settings/billing/page.tsx`, `apps/web/app/api/{checkout,portal,upgrade,stripe-webhook,sync-subscription}/route.ts`, `apps/web/app/api/stripe-webhook/lib/{verify,handlers,idempotency,db}.ts`, `apps/web/db/neon/0012_stripe.sql`, `apps/web/features/billing/**`, and the delta-sync APIs `apps/web/app/api/{chat,memory,projects}/sync/route.ts`.

## Overview & stance

This volume specifies the AGI Web subscription ladder and its billing lifecycle: plan definitions, Stripe integration, and upgrade / downgrade / cancellation flows. AGI Web is the **cloud-only** surface — there is **no Local mode and no BYOK** here, ever. Every paid capability is Managed-Cloud, entitled through account state in Neon and enforced server-side. Because Web owns account, billing, and admin for the whole suite, the subscription a user buys on Web is the entitlement other synced surfaces (Mobile, Desktop) read through the delta-sync APIs Web hosts. Local and BYOK remain **free access modes on other surfaces**, not plans, and never appear as purchasable options on Web.

Managed Cloud is **public alpha, open by default** for signed-in users (founder decision 2026-06-27): Web presents cloud chat as available, never waitlist-gated. The ladder below is the founder model of 2026-07-11 (`docs/plans/tier-metering-reconciliation-wave2-2026-07-11.md`, `docs/decisions/CURRENT_DECISIONS.md` #22), superseding the 2026-06-30 ladder this volume previously specified. Metering is token/value-based (a micro-dollar ledger, never a flat prompt count), displayed to users as **credits** everywhere except at actual Stripe checkout; internal ledgering stays cents/micro-dollars. Credit top-ups are **enabled** for paid tiers: opt-in, off by default, capped, 12-month expiry, with per-tier payout parity (a tier's top-up credits-per-$ matches its subscription credits-per-$). Pricing presentation carries **no discount anchors of any kind** — no strikethroughs, no "% off," no "was $X"; flat prices, with real annual options (Pro/Team) framed honestly. Re-verified against code 2026-07-11: `packages/contracts/types/src/billing-catalog.ts` and `apps/web/lib/pricing.ts` are already substantially reconciled — `basic`/`pro`/`max`/`team` all exist as real catalog entries with real Stripe price mappings, and neither `hobby` nor `pro_plus` remains live. Remaining gaps are called out per-tier below, not assumed wholesale.

## Free — entry cloud chat

🟡 Partial — `packages/contracts/types/src/billing-catalog.ts` (the `free` tier exists at `$0`); `apps/web/app/pricing/page.tsx`.

Free is $0 / ₹0: entry Managed-Cloud chat with limited metered usage, open by default to any signed-in user with no waitlist. Requirements: signed-in Clerk identity, cloud-only, usage-capped, no BYOK/Local affordance, no credit card required, an in-product upgrade path to Basic/Pro. Gap: the marketing surface presents a "Hobby" web-trial card (`apps/web/app/pricing/page.tsx`) and a cloud waitlist trigger — both must be reconciled to the canon "Free" name with no waitlist framing.

## Basic — $7/mo (₹399/mo, IAP-first)

🟡 Partial — `packages/contracts/types/src/billing-catalog.ts` has a real `basic` `BillingPlanTier` entry with `STRIPE_PRICE_IDS.basic` mapped in `apps/web/lib/pricing.ts` (monthly-only, USD + INR price objects on the same product). Gap: the catalog still prices it at `monthlyPriceUsd: 8`, not the current **$7**.

Basic is the entry paid tier: **$7/mo, ₹399/mo** (cut from $8 on 2026-07-11; INR fixed for Basic only). Basic is **IAP-first** — purchasable only via App Store/Play Store; the Web pricing page shows Basic with a "Get it on iOS/Android" hand-off rather than a direct Stripe Checkout button, with the Stripe USD/INR test prices kept as a dormant fallback. Requirements: `monthlyPriceUsd` corrected to `7` in the catalog, higher usage caps than Free, and model-by-plan gating driven from `packages/contracts/types/src/models.json` (never hardcoded IDs).

## Pro — $20/mo

🟡 Partial — `packages/contracts/types/src/billing-catalog.ts` sets `pro` at `monthlyPriceUsd: 20`; checkout wired via `apps/web/lib/pricing.ts` (`STRIPE_PRICE_IDS.pro`) and `apps/web/app/api/checkout/route.ts`.

Pro is the main paid tier at **$20/mo** (INR TBD — do not invent an INR figure). The plan id, price, and Stripe mapping already exist. Requirements: monthly and annual Stripe prices, expanded usage budget, full model access per `models.json` gating, and priority within metered limits. Gap: the annual price (`yearlyPriceUsd: 204`) and any INR presentation must be confirmed against Stripe before being shown as final.

## Max — $100/mo and $200/mo

🟡 Partial — `packages/contracts/types/src/billing-catalog.ts` encodes `max` at `monthlyPriceUsd: 100` only; the **second $200 Max tier is not present** in the catalog or in `apps/web/lib/pricing.ts` (`STRIPE_PRICE_IDS.max` has a single `monthly`, `yearly: undefined`).

Max ships as **two price points — $100/mo and $200/mo** — presented as Max tiers (higher usage, limits, and model access), never as "Plus". INR is TBD. Requirements: a second Stripe Price and catalog entry for the $200 tier, distinct usage budgets per tier, model-by-plan gating from `models.json`, and clear in-UI differentiation of the two Max levels. Gap: today only one Max ($100) exists in code; the $200 tier is 🔭 Planned within this 🟡 partial.

## Team — $30/seat/mo ($299/seat/yr)

✅ Built (pricing) / 🟡 Partial (UI) — `packages/contracts/types/src/billing-catalog.ts` already prices `team` at `monthlyPriceUsd: 30, yearlyPriceUsd: 299`, matching the 2026-07-11 reinstatement exactly, with `STRIPE_PRICE_IDS.team` mapped in `apps/web/lib/pricing.ts`.

Team is a **real, separate per-seat tier** between Max and Enterprise (reinstated 2026-07-11, supersedes the 2026-06-30 "served by Enterprise" removal) — do not describe it as folded into Enterprise. Requirements: per-seat checkout and seat management, `$30/seat/mo` and `$299/seat/yr` Stripe prices, and a Team usage budget (`$15/seat/mo` COGS budget per the wave-2 plan) distinct from Enterprise's negotiated/pooled model.

## Enterprise — custom

🟡 Partial — `packages/contracts/types/src/billing-catalog.ts` has an `enterprise` tier (custom, price `0`); contact-sales path in `apps/web/app/pricing/page.tsx`.

Enterprise is custom-priced and covers org-scale needs beyond Team — SSO, admin, seats at negotiated volume, contracts, org controls. Requirements: contact-sales entry (no self-serve checkout), seat/entitlement provisioning through account/admin, and Enterprise-grade retention/deletion controls.

## Billing — Stripe

✅ Built — `apps/web/app/api/checkout/route.ts`, `apps/web/app/api/portal/route.ts`, `apps/web/app/api/stripe-webhook/route.ts` with `lib/{verify,handlers,idempotency,db}.ts`, `apps/web/app/api/sync-subscription/route.ts`, schema `apps/web/db/neon/0012_stripe.sql`.

Billing runs on **Stripe** with **Clerk** auth and **Neon** as the entitlement store; deployed on **Vercel**. Requirements: Checkout Sessions for new subscriptions; the Stripe Billing Portal for self-serve plan and payment management; webhook handling with **signature verification** (`verify.ts`) and **idempotency** (`idempotency.ts`) so replayed events never double-apply; subscription state persisted user-scoped under RLS in Neon; and `sync-subscription` to reconcile Stripe truth into account state. Never reference Supabase. Never expose provider keys client-side.

## Upgrade

🟡 Partial — `apps/web/app/api/upgrade/route.ts`; checkout mapping in `apps/web/lib/pricing.ts`; UI in `apps/web/features/billing/components/Billing/Subscription.tsx`.

Upgrades (Free→Basic→Pro→Max→Team, or Max $100→$200) go through Checkout or a plan-change call, take effect immediately, and update entitlements the moment the webhook confirms. Requirements: proration handled by Stripe; new usage caps applied on confirmation; model gating widened per `models.json`; capped, opt-in credit top-ups may be offered alongside a plan upgrade, not as a substitute for one. Gap: upgrade targets must include the $200 Max tier once that Price exists; Basic upgrade routes through IAP, not Web Checkout.

## Downgrade

🟡 Partial — self-serve via `apps/web/app/api/portal/route.ts` (Stripe Billing Portal); state landed through `apps/web/app/api/stripe-webhook/lib/handlers.ts`.

Downgrades (e.g., Max→Pro, Pro→Basic, any→Free) schedule the lower plan and apply entitlement/usage reductions at period end via the webhook. Requirements: no data loss on downgrade; synced cloud chats remain accessible subject to the new plan's caps; clear "changes at period end" messaging. No top-up path substitutes for a downgrade.

## Cancellation

🟡 Partial — self-serve cancel via `apps/web/app/api/portal/route.ts`; period-end handling in `apps/web/app/api/stripe-webhook/lib/handlers.ts`; account view `apps/web/app/settings/billing/page.tsx`.

Cancellation sets `cancel_at_period_end`, keeps paid access until the period ends, then reverts the account to Free (not deletion). Requirements: Free cloud access persists after cancellation (public-alpha default); the user's synced chats/projects/memory remain per retention policy; reactivation restores the prior plan; refunds/chargebacks follow policy and never silently re-enable a canceled entitlement.

## Repository map

- `apps/web/lib/pricing.ts` — Stripe price-ID mapping + pricing config (legacy tiers 🟡).
- `packages/contracts/types/src/billing-catalog.ts` — canonical `BillingPlanTier` + price catalog (has `basic`/`pro`/`max`/`team`; gaps: `basic` still priced at $8 not $7, $200 Max tier missing — 🟡).
- `apps/web/app/pricing/page.tsx` — marketing pricing page (still renders some Hobby/waitlist framing per the 2026-06-30 ladder — 🟡; Team itself is live and correctly sold, not a leftover).
- `apps/web/app/settings/billing/page.tsx`, `apps/web/features/billing/**` — account billing dashboard, subscription, usage, invoices.
- `apps/web/app/api/{checkout,portal,upgrade,stripe-webhook,sync-subscription}/route.ts` — Stripe lifecycle.
- `apps/web/app/api/stripe-webhook/lib/{verify,handlers,idempotency,db}.ts` — verified, idempotent event handling.
- `apps/web/app/api/billing/{invoices,payment-methods,analytics}/route.ts` — billing reads.
- `apps/web/db/neon/0012_stripe.sql` — Stripe/subscription schema (RLS, user-scoped).
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — entitlement-backed cross-device sync (✅ built).

## Competitor notes

Claude, ChatGPT, and Codex sell single-vendor cloud subscriptions with in-product upgrade and portal-style management — the lifecycle mechanics AGI Web mirrors. AGI's deliberate divergence: (1) **per-surface trust** — Web is cloud-only, while Local and BYOK stay free access modes on Desktop/CLI/VS Code, so a subscription buys managed capacity, not the only way to use AGI; (2) **multi-provider under one plan** with model access gated from `models.json`, not tied to one model family; (3) **usage displayed as credits, with capped opt-in top-ups** — token/value-based metering inside plan caps, sold as consumable credits only within the per-tier payout-parity cap, not open-ended overage; (4) a **local-first suite** where the paid cloud plan is a convenience layer, not a lock-in.

## Acceptance / Definition of Done

Production-ready when the canon ladder (Free / Basic $7·₹399 IAP-first / Pro $20 / Max $100 & $200 / Team $30-seat / Enterprise) is the only ladder rendered and sold, every Stripe lifecycle path is verified and idempotent, and entitlements are enforced server-side from Neon with RLS.

- [ ] Build: `basic` corrected to $7 and the $200 `max` tier added in `billing-catalog.ts` with Stripe Prices mapped in `pricing.ts`; legacy `pro_plus`/Hobby framing removed from the pricing page; a capped, opt-in top-up component is built (none currently exists — `apps/web/features/billing/components/Billing/Topup.tsx` does not exist in the repo today).
- [ ] Trust: no BYOK or Local affordance anywhere on Web; cloud chat is open by default with no waitlist; canceled accounts revert to Free, not deletion.
- [ ] Security: webhook signatures verified and events idempotent; no provider/Stripe secret keys client-side; subscription rows user-scoped under RLS; model IDs read only from `models.json`.

## Anti-patterns

- Adding a BYOK or Local option to Web, or letting a Web plan route to user keys — Web is cloud-only.
- Shipping or reintroducing removed tiers: "Plus", `pro_plus`, "Hobby". Team is NOT removed — it is a real, separate per-seat tier.
- Offering uncapped or non-opt-in top-ups, or top-ups that don't honor per-tier payout parity; presenting a discount anchor ("% off," "was $X") anywhere in pricing UI.
- Inventing INR prices for Pro/Max/Team (only Basic ₹399 is fixed) or hardcoding model IDs instead of reading `models.json`.
- Gating cloud chat behind a waitlist, or claiming Basic/$200-Max are shipped without a real Stripe Price + catalog entry.
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or trusting client-supplied plan claims over verified Stripe webhooks.
