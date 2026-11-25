---
id: "SYS-subscriptions-entitlements-and-usage"
type: "system"
title: "AGI Subscription: plans, entitlements, usage and limits"
basis: "code inspection and project documents"
second_reader: "challenged and corrected; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# AGI Subscription: plans, entitlements, usage and limits

One AGI Subscription system serves all six apps. The account row resolves to a plan tier (own paid row, then team seat, then Free). Tier tables give capabilities and credit allowances (5-hour and weekly rolling windows, plus a billing-period total). A database reservation gates each managed turn. Stripe sells plans on web; mobile sells nothing in v1. Paid sales sit behind an access-code gate. Apps read /api/me, but CLI, VS Code, mobile, Tauri desktop and Chrome add local plan logic. Local and own-key plans carry no managed usage and no payment; which apps actually offer Local or own-key is set by the trust-boundary document, not by the plan catalog. Local needs no account on Mobile (after an on-device age confirmation), the CLI or VS Code; Electron Desktop chat and web have no Local mode.

## What it is and why it exists

**AGI Subscription** is the single system that decides what a signed-in account may do in the cloud and how much managed AI it may spend. It exists so Web, Desktop, Mobile, CLI, VS Code and Chrome never keep separate plan rules. [requirement] (docs/product/commercial.md:74-81: one user has one `subscriptions` row and one billing owner; the same entitlement applies to every surface).

Plain terms used below:
- **Plan tier**: the stored plan name (`free`, `basic`, `pro`, `max`, `max_15x`, `team`, `team_premium`, `enterprise`, plus `local-only` and `byok`). [code] (packages/contracts/types/src/billing-catalog.ts:5-15)
- **Credit**: the only usage unit customers see. 1 credit = $0.005 of provider cost (5,000 microUSD). [requirement] (docs/architecture/credits.md:7-16)
- **Entitlement**: the answer to "what plan does this account hold right now, and is it paid up". [code] (apps/web/lib/services/entitlement-resolution.ts:217-228)
- **Window**: a time slice with its own cap: rolling 5-hour, rolling weekly, and the billing period (monthly). [code] (packages/contracts/types/src/managed-usage-limits.ts:31-85)

What it does not govern: local inference and BYOK (the user's own provider key). Plans `local-only` and `byok` carry zero managed credits in every window, product limits of zero sandboxes and zero scheduled tasks, and they are absent from the cloud chat capability tiers, so managed chat, cloud sync and projects are denied to them. [code] (managed-usage-limits.ts:20-24, 33-34; billing-catalog.ts:322-336, 583-616). That is the code basis for "local inference needs no payment". Mobile Local mode never asks the server for a plan. [code] (apps/mobile/src/features/billing/store.ts, function `refreshTier` returns early unless app mode is `cloud`). Local needs no account. On Mobile the root routing sends a signed-out user through the on-device age confirmation first, then onboarding and the app, with no sign-in required. [code] (apps/mobile/src/features/auth/services/rootRouting.ts:30-60; apps/mobile/app/index.tsx:9-12). The CLI and VS Code need no account for Local either. Electron Desktop chat has no Local mode. Sign-in SDK calls reach auth hosts in either mobile mode. [requirement] (docs/architecture/trust-boundaries.md:45-60). See SYS-local-inference.

A plan tier existing is not the same as a mode being available on an app. See "Rules: access, plans, modes".

Public names differ from stored ids: `pro` is shown as Premium and `max_15x` as Ultra. [code] (billing-catalog.ts:191-208). Old ids `hobby` and `pro_plus` fold to `basic` and `max`. [code] (billing-catalog.ts:1029-1041)

## How it works today

### 1. Who is the account, and what plan does it hold
`resolveEntitlementBundle` is the one entry point. Order: (1) the user's own paid, entitled `subscriptions` row; (2) a team seat in an organization whose owner subscription is entitled, whose plan is seat-bearing and whose seat rank is within `licensed_seats`; (3) the user's own lapsed or free row; (4) none. [code] (apps/web/lib/services/entitlement-resolution.ts:376-413)

A status counts as entitled only if it is `active` or `trialing`. Any other status collapses the effective plan to `free`. [code] (packages/contracts/types/src/subscription-entitlement.ts:3-17). Enterprise also tolerates `past_due` and `unpaid` unless the contract is in read-only collection. [code] (subscription-entitlement.ts:19-43)

Access ladder: rank 2 `active`/`trialing` gets managed execution, plan features, purchased-credit spend and plan change; rank 1 `incomplete`/`past_due` gets none (billing portal only); rank 0 everything else. Unknown status ranks 0. [code] (apps/web/lib/services/subscription-access-policy.ts:16-28, 55-79)

### 2. Asking "may this account use X"
- **Capabilities** are static tables keyed by tier: `BILLING_PLAN_CAPABILITY_TIERS` and `canUseBillingPlanCapability`. [code] (billing-catalog.ts:302-372)
- **Product limits** (projects, storage, concurrent turns, sandboxes, scheduled tasks, attachments) come from `BILLING_PLAN_PRODUCT_LIMITS`. [code] (billing-catalog.ts:580-731)
- Apps get both through `GET /api/me`, which returns `plan` (tier, display name, status, period end, `effective_tier`, `subscription_source`, `billing_owner`), `feature_flags`, a `capability_handshake` document, and attachment and message limits. [code] (apps/web/app/api/me/route.ts:250-345)
- The handshake is built from four layers: model, tier, surface, settings (operator kill switches, account and workspace switches). A capability is granted only if every layer grants it. [code] (apps/web/lib/services/capability-handshake-service.ts:114-132, 353-383)

### 3. Spending: reserve, run, settle
Every managed turn calls `reserveManagedUsageRequest`. It checks the organization spend cap, resolves the plan allowance (catalog version and revenue context from the open credit period), applies promotion caps, then calls a database function that takes a per-user lock and decides in one place. Variants: normal plan windows, `extra_usage` funding, and per-app artifact runtime. [code] (apps/web/lib/services/managed-usage-request-service.ts:738-878)
The turn then settles through `finalizeManagedUsageRequest`, which also writes `provider_cost_events`. [code] (managed-usage-request-service.ts:1140-1190; docs/product/commercial.md:298-306)

Order of funding: plan windows, then bonus credits (soonest expiry first), then purchased credits only when a plan limit is hit and usage credits (extra usage) are on. A turn that crosses a cap finishes on the plan; the next one goes to credits. [requirement] (docs/architecture/credits.md:44-50; docs/product/commercial.md:239-258)

### 4. Free accounts use a separate ledger
Free turns are admitted by `free-trial-service` against `free_daily_usage_reservations` and `website_auto_economy_trial_usage`, using the same Free numbers from the limits table. [code] (apps/web/lib/services/free-trial-service.ts:40-46, 394-409; apps/web/lib/services/managed-usage-summary-service.ts:91-92, 119-138). The paid ledger helpers return a zero budget for Free (`isFreeSubject`), so Free admission depends on the Free ledger only. [code] (apps/web/lib/server/managed-usage-policy.ts:98-115)

### 5. Buying
- **Web**: `POST /api/checkout` creates a Stripe Checkout subscription session; the Stripe webhook writes the subscription and credit period. [code] (apps/web/app/api/checkout/route.ts:494-529; apps/web/app/api/stripe-webhook/route.ts:1-100)
- **Top-ups** (extra credits) via `/api/billing/top-up`, only on an active paid plan billed by Stripe, Apple or Google. [code] (apps/web/app/api/billing/top-up/route.ts:150-168)
- **Mobile stores**: compiled out in v1. [code] (apps/mobile/src/features/billing/storePurchases.json:2)
- **Sales gate**: before checkout, an account with no live paid subscription needs waitlist access. [code] (checkout/route.ts:297-310)

## Implementation map

| Concern | Owner file | Notes |
|---|---|---|
| Plan ids, prices, capabilities, product limits, quota-block codes | packages/contracts/types/src/billing-catalog.ts | 1,197 lines; the canonical catalog. Catalog version is 4 (billing-plan-catalog.ts:19). |
| Credit math | packages/contracts/types/src/credits.ts | unit constants; charge rounds up to 0.01 credit [requirement] (credits.md:20-25) |
| Window allowances per plan and catalog version | packages/contracts/types/src/managed-usage-limits.ts | `MANAGED_USAGE_LIMITS`, `PLAN_CREDIT_ALLOWANCES` |
| Regional revenue scaling of allowances | packages/contracts/types/src/billing-revenue.ts | `effectiveManagedUsageLimit` scales credits by net revenue ratio (lines 128-148) |
| Recovery choice at a limit | packages/contracts/types/src/work-usage.ts | add credits, turn on usage credits, upgrade, wait |
| Top-up packs and auto-reload | packages/contracts/types/src/billing-topups.ts | $20 min, $1,000 max, $2,000 per day; auto-reload threshold 100 to 100,000 credits |
| Entitled statuses | packages/contracts/types/src/subscription-entitlement.ts | |
| Entitlement resolution | apps/web/lib/services/entitlement-resolution.ts | re-exported by effective-subscription-service.ts |
| Status ladder | apps/web/lib/services/subscription-access-policy.ts | |
| Subscription row read and period credit allocation | apps/web/lib/services/subscription-service.ts | `allocateCreditsForPeriod`, `resetCreditsForNewPeriod`, `carryCreditsForUpgradePeriod` |
| Credit account | apps/web/lib/services/credit-service.ts | `getOrCreateAccount`, `settleCreditsDurably`, `carryUsageIntoUpgradedPeriod` |
| Plan credits to ledger budgets and caps | apps/web/lib/server/managed-usage-policy.ts | warning at 80%, critical at 95% (lines 207-208); Enterprise uncapped ledger allocation (lines 95-102) |
| Billing period for a subscription | apps/web/lib/server/managed-usage-period.ts | periods up to 45 days are used as is; longer (yearly) are cut into monthly slices anchored to the start (lines 46-75) |
| Rolling window sums | apps/web/lib/server/rolling-usage.ts | sums signed `deduction` rows in `credit_transactions`; excludes `is_overage` rows |
| Reserve, settle, error mapping | apps/web/lib/services/managed-usage-request-service.ts | 1,306 lines |
| Usage summary for UI | apps/web/lib/services/managed-usage-summary-service.ts | |
| Free ledger | apps/web/lib/services/free-trial-service.ts | |
| Sales gate | apps/web/lib/server/billing-waitlist-access.ts; apps/web/lib/feature-flags/billing-upgrades.ts; billing-upgrade-gate.ts | |
| Billing owner (Stripe, Apple, Google, manual) | apps/web/lib/server/subscription-billing-owner.ts; subscription-owner-handoff.ts | |
| Seats | apps/web/lib/services/team-seat-entitlement.ts; org-entitlements.ts | |
| Checkout | apps/web/app/api/checkout/route.ts | 621 lines |
| Webhook | apps/web/app/api/stripe-webhook/route.ts and lib/handlers.ts, db.ts, dispute-events.ts, refund-events.ts, seats.ts | |
| Promotions | apps/web/lib/services/usage-limit-promotion-service.ts | flag `billing.usage_promotions`, migration 0390 [requirement] (credits.md:52-69) |
| Mobile store ledger | apps/web/lib/services/mobile-iap-ledger-service.ts; apps/web/app/api/mobile/iap/{verify,catalog,apple-notifications,google-notifications} | |
| Offline license verifier | packages/contracts/licensing; crates/agiworkforce-licensing | verify only, not connected (see Gaps) |
| UI | apps/web/features/billing/{components,hooks,lib,services} | not read in detail [unknown] |

Implementation status: all rows above exist in code. Verification status: see "How to verify".

## Data and state

### Plans, prices and allowances (code is the source)
Prices (monthly, USD): Free 0; Basic 7; Premium (`pro`) 20; Max 100; Ultra (`max_15x`) 200; Team 25 per seat (240 a year); Team Premium 125 per seat (1,200 a year); Enterprise by contract. [code] (billing-catalog.ts:166-231). India prices exist for Basic through Ultra and Team. [code] (billing-catalog.ts:189-217)

| Plan (id) | 5-hour credits | Weekly | Monthly | Flagship weekly cap |
|---|---|---|---|---|
| Free (`free`) | 200 | 1,500 | 2,000 | none |
| Basic (`basic`) | 10 | 100 | 400 | none (the flagship cap exists only for Premium, Max, Ultra and per-seat team plans) |
| Premium (`pro`) | 50 | 500 | 2,000 | 30% of weekly |
| Max (`max`) | 250 | 2,500 | 10,000 | 30% of weekly |
| Ultra (`max_15x`) | no cap (null) | 5,000 | 20,000 | 30% of weekly |
| Team (`team`, per seat) | 50 | 500 | 2,000 | 30% of weekly |
| Team Premium (`team_premium`, per seat) | 250 | 2,500 | 10,000 | 30% of weekly |
| Enterprise | unlimited flag; all window numbers are zero but the plan is treated as uncapped | | | |
| Local-only, BYOK | 0 | 0 | 0 | none (no managed usage) |

Source: [code] (managed-usage-limits.ts:20-85, 250-292; ratio 0.3 at line 27). Matches docs/architecture/credits.md:29-42. Enterprise: `unlimited: true` makes the plan credit allowance Infinity, and the ledger allocation uses an uncapped constant. [code] (managed-usage-limits.ts:82-84, 284-290; apps/web/lib/server/managed-usage-policy.ts:95-102). Catalog versions 1 to 4 all point at the same table today, so grandfathering is a mechanism, not yet a difference. [code] (managed-usage-limits.ts:89-96)

Allowances are scaled by the revenue the subscriber's channel and currency produce versus a US web subscriber (store commission, card fees, included tax). [code] (billing-revenue.ts:96-148). A zero cap means zero allowed usage; a null cap means no cap. [requirement] (commercial.md:108-123)

### Capabilities by plan
[code] (billing-catalog.ts:322-364)
- Free and up: managed chat, chat tools, projects, memory, skills, cloud sync.
- Basic and up: connectors, Remote Control.
- Premium and up (incl. team plans, Enterprise): AGI Work, Deep Research, image generation, managed API, developer surfaces (CLI and VS Code cloud), Slack app, artifact connectors.
- Ultra and Enterprise only: video generation.
- Team, Team Premium, Enterprise: team admin. Enterprise only: SSO, SCIM and admin controls.
- Local-only and BYOK: none of the above (not in the cloud chat tiers).

### Product limits (examples)
Free: 5 projects, 1 concurrent turn, 2 sandboxes, 0 custom MCP servers, 0 connector tools, 0 scheduled tasks, 5 attachment uploads a day. Max: 5 concurrent turns, 15 scheduled tasks. Ultra: 10 concurrent turns, 25 scheduled tasks. [code] (billing-catalog.ts:617-690). Free daily caps: 1,000 message writes, 100 conversation creates, 25 MiB egress, 10 emails, 200 vector queries. [code] (billing-catalog.ts:484-490)

### Tables (names seen in code)
| Table | Role |
|---|---|
| table:subscriptions | one row per user: plan_tier, status, period dates, stripe_subscription_id, stripe_price_id, apple_original_transaction_id, google_purchase_token, plan_catalog_version [code] (entitlement-resolution.ts:39-55; checkout/route.ts:280-285) |
| table:token_credits | credit period balance (allocated, used, top-up portion, catalog version) [requirement] (commercial.md:225-232) |
| table:credit_transactions | the usage ledger: `deduction`, `purchase`, `refund` rows with `amount_microusd`, `metadata.is_overage`, `metadata.is_flagship` [code] (rolling-usage.ts query; top-up/route.ts:190-196) |
| table:managed_usage_requests | one row per reservation with idempotency key and `is_overage` [code] (managed-usage-request-service.ts:919-939) |
| table:provider_cost_events, table:cogs_adjustments | cost of goods ledger [requirement] (commercial.md:298-322) |
| table:billing_disputes, table:billing_refund_requests | disputes and refunds [requirement] (commercial.md:189-223) |
| table:free_daily_usage_reservations, table:website_auto_economy_trial_usage | Free ledger [code] (free-trial-service.ts:647-660) |
| table:organizations, table:organization_members | seats: licensed_seats, licensed_premium_seats, seat_type, premium_paid_through [code] (entitlement-resolution.ts:62-93; team-seat-entitlement.ts:18-36) |
| table:beta_invites, table:beta_redemptions | access codes [code] (waitlist/access/route.ts:34-48; billing-waitlist-access.ts:47-53) |
| table:waitlist | per-plan waitlist joins [code] (apps/web/app/api/waitlist/route.ts GET) |
| table:mobile_iap_transactions, table:mobile_app_transactions | store purchase records [code] (mobile-iap-ledger-service.ts:158-203) |

### Periods and windows
- 5-hour and weekly windows are **rolling**: spend in the last 5 hours or 168 hours. They refill as old spend leaves, not at a fixed clock time. [code] (rolling-usage.ts; quota text in billing-catalog.ts:922-941)
- The monthly total follows the subscription billing period, not a calendar month. [code] (managed-usage-period.ts:46-75)
- Allowance does not roll over; purchased credits carry across renewals; bonus credits expire after 90 days; Japan purchases expire after six months. [requirement] (credits.md:44-50; commercial.md:231-236)

### Top-ups and extra usage
Two different rates, not to be confused. A top-up buys 50 credits per $1 paid (before discount). A credit is defined as $0.005 of provider cost, so $1 of provider cost is 200 credits. The code keeps them as two separate constants (TOP_UP_UNITS_PER_USD = 50 in billing-topups.ts; CREDITS_PER_USD = 200 in credits.ts). They have not been reconciled, and neither the code nor docs/architecture/credits.md says whether the gap is a deliberate markup or a defect. [code] (billing-topups.ts:5; credits.ts:2-4) [requirement] (credits.md:5-30) [unknown] Packs $20, $50, $100, $250, $1,000; discounts 0, 5, 10, 20, 30 percent; auto-reload an extra 5 percent; purchase min $20, max $1,000, $2,000 a day; auto-reload threshold 100 to 100,000 credits (default 500). [code] (billing-topups.ts:5-14). Extra usage (usage credits) must be switched on in Settings > Billing for purchased credits to be spent. [requirement] (commercial.md:247-251)

### Configuration names (purposes only)
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: Stripe API and webhook signature. [code] (stripe-webhook/route.ts:12-13)
- STRIPE_PRICE_* (for example the Basic monthly USD price): Stripe price ids per plan, interval and currency. [code] (apps/web/lib/pricing.ts:54-57)
- AGI_BILLING_WAITLIST_OPEN=1: forces paid upgrades open. [code] (billing-waitlist-access.ts:28-30)
- AGI_MANAGED_COMPUTE_PRIVATE_BETA: incident kill switch for managed compute. [code] (apps/web/lib/managed-compute-gate.ts:40)
- Flag `billing.upgrades_open`: runtime operator switch for the sales gate. [code] (apps/web/lib/feature-flags/billing-upgrades.ts:3)
- Flag `billing.usage_promotions`. [requirement] (credits.md:54-55)

## Rules: access, plans, modes

### Which apps offer which mode
The plan catalog lists `local-only`, `byok` and every other plan as selectable on web, desktop and mobile. [code] (billing-catalog.ts:235-247). That is only visibility in the plan table; Local is offered only on Mobile, CLI, VS Code and the retained Tauri build, not on web or the public Electron Desktop chat (see SYS-local-inference). It does not mean a mode runs on that app. The trust-boundary document sets the real mode support: [requirement] (docs/architecture/trust-boundaries.md:45-60)

| App | Local | Own key | Cloud (subscription) |
|---|---|---|---|
| surface:mobile | yes, on device | not offered | yes; needs the account's current consent to share with AI providers |
| surface:web | no | no | cloud only |
| surface:desktop (public Electron) | chat: no (rejects local-inference commands); local coding sessions run the bundled CLI and may use a local model or a provider key | chat: no key accepted; coding sessions via CLI yes | chat is cloud only |
| surface:cli | yes | yes (`Byok` tier; enforcement left to the user) | managed models need a subscription |
| surface:vscode | yes | yes | subscription required for managed models |
| surface:chrome | no | no | cloud only |

The CLI tier enum has its own `Byok` variant whose enforcement is the user's responsibility, so local and BYOK CLI use is not gated by the account tier. [code] (apps/cli/src/tier_cache.rs:184-200)

In mobile Local mode, the egress guard blocks every managed-cloud host except account controls, withdrawal controls and a content report the user chooses to send; sign-in SDK calls reach auth hosts in either mode. [requirement] (trust-boundaries.md:47-49)

### Rules by mode
| Mode | Subscription rule | Evidence |
|---|---|---|
| mode:local | No plan or payment needed. Mobile Local does not call `/api/me`. Plan id `local-only` has zero managed credits and no sandboxes. Needs no account. Offered only on Mobile (after the on-device age confirmation), CLI, VS Code, desktop coding sessions and the retained Tauri build; not on web or Electron Desktop chat. | [code] (store.ts `refreshTier` guard; billing-catalog.ts:583-599) [requirement] (trust-boundaries.md:45-60) |
| mode:own-key | `byok` plan: zero managed credits; user pays the provider. Not offered on mobile or web. | [code] (managed-usage-limits.ts:34) [requirement] (trust-boundaries.md:46, 56-57) |
| mode:cloud | Needs sign-in. Free uses the Free ledger; paid plans use the reservation system. Managed Free is public alpha for signed-in users. | [requirement] (commercial.md:8-14, 20-29) |

A Local-to-cloud move is a separate trust-boundary decision. [requirement] (AGENTS.md section 6)

### Plan resolution rules
1. Own entitled paid row wins over a seat. [code] (entitlement-resolution.ts:395-398)
2. A seat applies only if the org plan is seat-bearing (per-seat or contract), the member's join-order rank is within `licensed_seats`, and the owner subscription is entitled. [code] (entitlement-resolution.ts:104-120, 139-143)
3. Premium seat type depends on `premium_paid_through` and `licensed_premium_seats`. [code] (team-seat-entitlement.ts:18-75)
4. Plans below rank 2 resolve to Free. [code] (subscription-entitlement.ts:12-17)
5. If the seat lookup fails for a workspace member and the caller asked for strictness (`/api/me`), the call throws instead of reporting Free. [code] (entitlement-resolution.ts:258-264, 401-409) [requirement] (CLI comment tier_cache.rs:696-700)

### One billing owner
The source is read in this order. [code] (subscription-billing-owner.ts:47-67)
1. No row reads as `none`.
2. A malformed Stripe subscription id, or ids from more than one of Stripe, Apple, Google, reads as `unverified`; every billing action fails closed.
3. A valid Stripe subscription id reads as `stripe`; an Apple id as `apple`; a Google token as `google`.
4. No such ids and a `free` tier reads as `none`.
5. No such ids but a valid Stripe customer id reads as `stripe`.
6. Otherwise (a non-free tier with no store id, no Stripe subscription id and no Stripe customer id) it reads as `manual`: organization-managed or granted by hand.

`/api/me` reports `manual` for any seat holder. [code] (me/route.ts:304-307)
Handoff: a second channel loses while the owner is still entitled; once the owner is terminal the new purchase takes over and clears the other ids. [requirement] (commercial.md:86-99). Store rows expire three days after the paid-through date. [code] (subscription-billing-owner.ts:31, 83-107)

### Sales gate and waitlist
- Applies to an account with no live paid subscription. It needs `billing.upgrades_open` on (or env override), or any row in `beta_redemptions`. Otherwise checkout returns HTTP 403 with the waitlist code. [code] (checkout/route.ts:297-310; billing-waitlist-access.ts:38-66)
- The flag reads closed on any failure. [code] (billing-upgrade-gate.ts:10-34)
- Existing paid accounts keep entitlements; Free users need no code for Free managed usage. [requirement] (commercial.md:57-72)
- Access codes open acquisition only; they grant no plan or trial. [requirement] (docs/runbooks/admin-surfaces.md:145). Redeemed through `validate_and_redeem_invite_code`. [code] (apps/web/app/api/waitlist/access/route.ts:44-48)
- Observation: the gate query counts any `beta_redemptions` row for the user, not only rows from billing-upgrade invites. [code] (billing-waitlist-access.ts:47-53) [inferred] that a beta-program redemption also opens checkout.
- Mobile v1 sells nothing. When store purchase turns on, it opens with no waitlist or code. [requirement] (commercial.md:66-70)

### What happens at a limit
The database refuses a reservation with a decision; the server maps it to HTTP and a code. [code] (managed-usage-request-service.ts, `reservationError` and `PLAN_LIMIT_WINDOWS`)
| Decision | HTTP | Code | Recovery |
|---|---|---|---|
| declined (period used up) | 402 | `insufficient_credits` | add credits or upgrade or wait |
| extra_usage_required | 402 | `extra_usage_required` | turn on usage credits |
| session_limit | 429 | `rolling_five_hour_limit_reached` | wait for refill, credits, or upgrade |
| weekly_limit | 429 | `rolling_weekly_limit_reached` | same |
| flagship_weekly_limit | 429 | `flagship_weekly_limit_reached` | choose a standard model |
| artifact_limit | 429 | `artifact_runtime_limit_reached` | per-app cap, other chats unaffected |
| organization spend cap | 402 | `organization_spend_cap_reached` | admin |
| anything else | 503 | `billing_unavailable` | retry |
Free codes: `free_trial_token_budget_reached`, `free_trial_model_only`, `free_trial_feature_unavailable`; plan lacks capability: `plan_upgrade_required`. [code] (billing-catalog.ts:884-921)
Recovery action: Free gets Upgrade; paid self-serve plans whose block is cleared by credits get Add credits; accounts not billed by Stripe, Apple or Google are told to wait or ask whoever manages the plan. [code] (work-usage.ts:22-39, 78-94; managed-usage-request-service.ts:86-104)
The next upgrade ladder is Basic, Premium, Max, Ultra; Team and Enterprise have none. [code] (billing-catalog.ts:32-37, 847-860)

### Plan changes
Upgrade goes through `/api/upgrade` with immediate proration; a tier upgrade starts a new billing period and carries usage and purchased balance. Downgrade is the Stripe portal only; the smaller allowance applies at the next renewal while tier gates drop at once. [requirement] (commercial.md:144-170). Disputes set `past_due`, revoke the period's remaining credits and restore them on a win; refunds revoke the refunded share. [requirement] (commercial.md:187-206)

### Trials
No plan in the catalog sets `trialDays`, so catalog trials do not exist today; a trial can still arrive through a referral. [code] (billing-catalog.ts:166-231 has no `trialDays`; checkout/route.ts:431-438, 454)

### Plans granted by hand
A `subscriptions` row with a paid tier and no store id, no Stripe subscription id and no Stripe customer id is the `manual` source. [code] (subscription-billing-owner.ts:56-66). The mobile review account is meant to get its plan this way. [requirement] (docs/runbooks/mobile-store-first-release.md:92, 179, 431). The tool or admin route that writes such a row was not found. [unknown]

## Differences between apps

### How each app reads the same entitlement
All five client apps call `GET /api/me` (the surface is passed as a query value) and use `plan.effective_tier`, `plan.tier`, `plan.status` and `capability_handshake`. Usage meters come from `/api/usage`.

| App | How it reads the entitlement | Evidence |
|---|---|---|
| surface:web | Server code resolves the bundle directly and enforces on every managed route; billing screens in `features/billing`. | [code] (entitlement-resolution.ts:384; apps/web/app/api/llm/v1/chat/completions/route.ts:399-460) |
| surface:desktop | The public Electron Desktop shows the hosted web app, so it uses web's resolution. The Tauri code is retained internal code, not the shipped Desktop; it calls `/api/me?surface=desktop`, then uses `canUseBillingPlanCapability` and shared model lists. | [requirement] (AGENTS.md section 5) [code] (apps/desktop/src/services/cloudAccountAuth.ts:693; apps/desktop/src/services/desktopCloudEntitlements.ts:1-71) |
| surface:mobile | Zustand tier store, persisted; refresh only in cloud mode; reads tier, status, source, period end, handshake, attachment and message limits. Defaults to Free until the first refresh; `planCheckOf` reports `confirmed`, `checking` or `unconfirmed`. | [code] (apps/mobile/src/features/billing/store.ts `refreshTier`; planCheck.ts) |
| surface:cli | Caches the tier and handshake in `~/.agiworkforce/cache/tier.toml` for 300 s; fetch timeout 3 s; reads usage from `/api/usage`. | [code] (apps/cli/src/tier_cache.rs:31-35, 734-826; usage_summary.rs:11-32) |
| surface:vscode | Same 300 s cache in extension global state; plan comparison table built from shared catalog functions. | [code] (apps/extension-vscode/src/integrations/tierResolver.ts TIER_CACHE_TTL_MS; features/account-auth/planComparison.ts:1-90) |
| surface:chrome | Fetches `/api/me?surface=web` and answers capability questions with the shared `resolveCapabilityDocumentDecision`. Cloud only. | [code] (apps/extension/src/features/cloud-bridge/capabilityDocument.ts:20-92) [requirement] (commercial.md:29; trust-boundaries.md:60) |

### Where an app checks plans in its own way
Rows 8 and 9 describe the retained Tauri build, which is internal code and not the public Desktop (the public Desktop shows the hosted web app). They are listed because they are still in the repository.

| # | App | Place | What it does differently |
|---|---|---|---|
| 1 | surface:cli | apps/cli/src/tier_cache.rs:184-252 | Own `UserTier` enum including `Byok`; own `tier_rank` and `managed_auto_routing_tier` (Team grouped with Pro; Max, Ultra and Team Premium with Max; Free, Basic and BYOK with free). |
| 2 | surface:cli | tier_cache.rs:677-710, 734-826 | A fresh cache is returned without a network call; a lower fetched tier never replaces a higher cached one, so a downgrade can lag. |
| 3 | surface:cli | apps/cli/src/usage_summary.rs:22-31 | Own copies of entitled and payment-failed status lists and of the workload labels. |
| 4 | surface:vscode | integrations/tierResolver.ts `coerceTier` | Own tier whitelist and legacy alias map (`hobby`, `pro+`, `pro_plus`), plus a `local` tier. |
| 5 | surface:mobile | apps/mobile/src/features/billing/subscriptionSource.ts | Own terminal-status set (copy of the server's) and own source labels. |
| 6 | surface:mobile | settings/cloud-billing/index.tsx:155; model-picker/components/ModelPickerSheet.tsx:293 | Direct comparison `=== 'free'`. |
| 7 | surface:mobile | store.ts | Falls back to `effectivePlanTier(plan.tier, plan.status)` when the server omits `effective_tier`. |
| 8 | surface:desktop (retained Tauri code only) | apps/desktop/src/stores/auth.ts:796 | Sets `subscriptionStatus` locally to `none` for Free and `active` for everything else, without reading the server status. This is a client-side display value. |
| 9 | surface:desktop (retained Tauri code only) | src-tauri/src/core/llm/llm_router.rs:757, 842 | A routing hint, not an entitlement check: `free`, `basic` or `hobby` count as a budget plan when choosing a route. |
| 10 | surface:chrome | features/side-panel/freePlanNotices.ts; cloud-bridge/freeTrialClient.ts | Free-plan notices and a free-trial gateway client of its own (contents not read). [unknown] |
| 11 | surface:web | many files (about 300 reference plan tiers under apps/web) | Direct `isFreeBillingPlanTier` checks for example in top-up route, LLM route, pricing page, voice allowance. |
| 12 | all | Free vs paid | Free is admitted through a separate ledger (free-trial-service) from paid reservations. |

### Mobile purchase state
`nativePurchases: false` means no purchase, upgrade, top-up or restore control, no store connection and no Play Billing permission. It is fixed per build, never switched by OTA update or server. [code] (apps/mobile/src/features/billing/storePurchases.json:1-14). Server-side store verification, catalog and notification routes exist for when it is turned on. [code] (apps/web/app/api/mobile/iap/*). Mobile shows web billing links for Stripe or manual sources and store links for Apple or Google. [code] (subscriptionSource.ts:44-58)

## Failure handling

| Situation | Behaviour | Evidence |
|---|---|---|
| Usage database cannot answer a reservation | HTTP 503 `billing_unavailable`; no model call (fails closed) | [code] (managed-usage-request-service.ts:283-300) |
| Organization policy or spend lookup fails | 503 `billing_unavailable` | [code] (managed-usage-request-service.ts:331-365) |
| Plan catalog lookup fails | falls back to the current catalog, logs a warning | [code] (managed-usage-request-service.ts:598-612) |
| Rolling usage read fails (display and limit-context paths) | logs a warning and treats usage as 0 (fails open for those reads) | [code] (apps/web/lib/server/rolling-usage.ts, `getRollingUsage` catch) |
| Operator sales switch unreadable | gate stays closed | [code] (billing-upgrade-gate.ts:10-34) |
| Waitlist access check errors | checkout refused with 503 | [code] (checkout/route.ts:299-306) |
| Billing owner unverifiable | all Stripe billing actions refused with a conflict | [code] (subscription-billing-owner.ts:58, 129-136) |
| Subscription lookup fails at checkout | 503, no session created | [code] (checkout/route.ts:286-293) |
| Stripe already bills this customer | 409 conflict | [code] (checkout/route.ts:415-428) |
| Webhook: rate limit or bad signature | rejected before processing | [code] (stripe-webhook/route.ts:34-52) |
| Webhook: event already done | 200 `Event already processed` | [code] (stripe-webhook/route.ts:56-69) |
| Webhook: same event still processing | 503 with `Retry-After: 10` | [code] (stripe-webhook/route.ts:60-66) |
| Webhook: handler throws | whole event rolled back (one transaction), marked failed, HTTP 500 so Stripe retries | [code] (stripe-webhook/route.ts:71-93) |
| Out-of-order Stripe event resurrecting a canceled row | refused | [requirement] (commercial.md:184-186) |
| Seat lookup fails for a workspace member | `/api/me` errors rather than report Free; other paths log and fall back to the user's own row | [code] (entitlement-resolution.ts:401-409) |
| Owner seat type lookup fails | entitled at the Standard seat | [code] (entitlement-resolution.ts:360-374) |
| Seat member ledger cannot be provisioned | logged; entitlement still returned | [code] (entitlement-resolution.ts:198-208) |
| CLI tier fetch fails or times out (3 s) | no tier returned; caller uses its configured default; HTTP 401 clears cache and asks for re-login | [code] (tier_cache.rs:790-826) |
| Mobile refresh fails | keeps cached tier, returns false | [code] (store.ts `refreshTier` catch) |
| Idempotency key reused | 409 `idempotency_in_progress`, `idempotency_replay` or `idempotency_conflict` | [code] (managed-usage-request-service.ts `reservationError`) |
| Enterprise invoice overdue | read-only stage denies managed compute but keeps reads | [requirement] (docs/runbooks/enterprise-billing.md:218) |

## How it should work

Established requirements, then proposals.

**Requirements the code already follows**
- One account, one subscription row, one billing owner, one entitlement for all surfaces. [requirement] (commercial.md:74-81)
- Credits are the only customer unit; plan numbers live only in `managed-usage-limits.ts`. [requirement] (credits.md:85-87)
- Model and provider names are never hard-coded in consumers; usage cost comes from the registry and rate card. [requirement] (AGENTS.md section 4; credits.md:20-25)
- Local and own-key use stays usable without managed usage. [requirement] (commercial.md:79-81)
- Free usage screens show only Upgrade, never meters (owner decision recorded in project memory; the UsageSection test holds it). [unknown] whether this is enforced on every app; only the web test is named.

**Proposals (not decisions)**
- [proposed] Move CLI, VS Code and Tauri status lists, tier ranks and alias maps to one shared function in `@agiworkforce/types` and generate the Rust copy through the existing protocol-type export, so there is one place to change a plan.
- [proposed] Have `/api/me` (or the handshake) carry a ready-made `is_free` and `is_paid` field so apps stop comparing to the string `free`.
- [proposed] Limit the sales-gate redemption query to invites of the billing-upgrade kind, so a beta redemption does not silently open checkout, if that is not intended.
- [proposed] Record a documented, audited operator path for plans granted by hand, so the `manual` source has a known writer.
- [proposed] Make the CLI cache honour a lower fresh tier from the server after a cancellation, or document the up-to-5-minute lag as accepted.
- [proposed] Make the plan catalog surface visibility match real mode support, or document that it is plan visibility only, so a reader does not take `local-only` as available on web.

## Gaps

| Gap | Status | Evidence |
|---|---|---|
| Offline signed licensing (TypeScript package and Rust crate) is built but not connected to any app, UI or enforcement path. No app package depends on it. | implemented, not wired | [code] (packages/contracts/licensing/src/index.ts:1-15; crates/agiworkforce-licensing/src/lib.rs:1-25; search found importers only in its own package, its crate, and generated indexes) |
| Catalog versions 1 to 4 share one allowance table, so grandfathering has never changed a number. | by design for now | [code] (managed-usage-limits.ts:89-96) |
| No plan sets a trial length. | none sold | [code] (billing-catalog.ts:166-231) |
| No writer found for hand-granted plans. | [unknown] | see Rules |
| Paid sales are gated; mobile sells nothing. | owner decision, no subscription sales before 2027-01-01 is recorded in project memory, not in a repository document | [requirement] (commercial.md:57-72, 20-29) |
| Rolling usage read swallows errors as 0 used. | defect risk for meters and reset times | [code] (rolling-usage.ts catch) |
| CLI header comment lists tiers without `team_premium` and claims no per-use credits; code and the enum include `team_premium` and usage read from `/api/usage`. | stale comment | [code] (tier_cache.rs:6-9 vs 184-200; usage_summary.rs:1-8) |
| Apps keep their own plan checks (twelve listed above). | consolidation open | see Differences |
| Free managed path and paid path use two ledgers with duplicated windows logic. | design choice | [code] (free-trial-service.ts:40-46; managed-usage-policy.ts:98-115) |
| Plan catalog marks `local-only` and `byok` selectable on web, desktop and mobile, while those modes are not offered on web, Chrome or desktop chat. | catalog says plan visibility only; Local is offered only on Mobile, CLI, VS Code and the retained Tauri build | [code] (billing-catalog.ts:235-247) [requirement] (trust-boundaries.md:45-60) |
| Free users on mobile and Chrome: whether limit messages match web wording was not compared. | [unknown] | |
| Billing UI components in apps/web/features/billing and Chrome notices not read. | [unknown] | |
| Where the yearly interval is sold for individual plans: catalog has yearly prices for Team only. | by design | [code] (billing-catalog.ts:209-224) |

## How to verify

Nothing here was run by this author; the project folder was read only. All "works" statements are [code]-level.

**Recorded runs in project documents**
- A signed-in managed chat completion was refused with `billing_read_only` for an Enterprise contract in the read-only stage, while a read request still returned 200, on 2026-09-04 in test mode. [requirement] (docs/runbooks/enterprise-billing.md:354). This is a document record, not something repeated here.

**Tests that exist (names seen in the tree; results unknown)**
- test:apps/web/lib/services/subscription-access-policy.test.ts (status ladder)
- test:apps/web/lib/server/managed-usage-period.test.ts (period slicing)
- test:apps/web/lib/server/managed-usage-policy.test.ts (caps and budgets)
- test:apps/web/lib/server/subscription-billing-owner.test.ts and subscription-owner-handoff.test.ts (billing owner)
- test:apps/web/lib/services/managed-usage-request-service.test.ts and managed-usage-accounting-service.test.ts (reservation and settlement)
- test:apps/web/lib/services/free-plan-entitlements.test.ts, .labels.test.ts, .policy-source.test.ts
- test:apps/web/lib/services/subscription-service.usage-period.test.ts and subscription-service.store-expiry.test.ts
- test:apps/web/app/api/checkout/route.test.ts, route.catalog-binding.test.ts, route.premium-seats.test.ts, route.tax-errors.test.ts, route.trial.test.ts
- test:apps/web/app/api/waitlist/access/route.test.ts and apps/web/app/api/waitlist/route.test.ts
- test:apps/web/lib/services/usage-limit-promotion-service.live.test.ts (needs a live database)
- test:apps/web/app/api/upgrade/route.seats.test.ts and route.stale-tier.test.ts
- test:apps/mobile/__tests__/trust-boundary.test.ts (mobile Local egress rule, named in trust-boundaries.md)
- packages/contracts/licensing has fixtures shared by TypeScript and Rust verifiers. [code] (crates/agiworkforce-licensing/src/lib.rs:1-25)

**How a human or agent would check, without changing production**
1. Compare `MANAGED_USAGE_LIMITS` with the credits.md table (they agree as read).
2. In a local build with seeded accounts, call `GET /api/me` for each tier and check `plan.effective_tier`, `capability_handshake.granted` and `/api/usage` windows against the tables above.
3. Drive a Free account to a window limit and confirm the code and recovery action per the limit table.
4. With the gate closed, `POST /api/checkout` for a Free account should return 403 with the waitlist code; after redeeming a code, it should create a session.
5. Replay a Stripe test event twice and confirm the second is skipped.
6. On mobile, confirm no purchase control appears while `nativePurchases` is false.
7. Run `pnpm check:llm-operability` (guard chain) per AGENTS.md section 12 for the model-literal and catalog guards.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Plan tiers are local-only, byok, free, basic, pro, max, max_15x, team, team_premium, enterprise; pro is shown as Premium and max_15x as Ultra. | read in the code | `packages/contracts/types/src/billing-catalog.ts:5-15`; `packages/contracts/types/src/billing-catalog.ts:191-208` |
| The plan catalog marks every plan, including local-only and byok, selectable on web, desktop and mobile. This is visibility in the plan table, not mode support: Local is offered only on Mobile, CLI, VS Code and the retained Tauri build. | read in the code | `packages/contracts/types/src/billing-catalog.ts:235-247` |
| Mode support by app: mobile has Local and Cloud (no BYOK); web is Cloud only; public Desktop chat is Cloud only and rejects local-inference commands; Chrome is Cloud only; CLI and VS Code support subscription, BYOK and local models. | stated requirement | `docs/architecture/trust-boundaries.md:45-60` |
| local-only and byok get zero managed usage in every window, are absent from the cloud chat capability tiers (managed chat, cloud sync, projects denied), and have zero sandboxes and scheduled tasks. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:20-24`; `packages/contracts/types/src/billing-catalog.ts:322-336`; `packages/contracts/types/src/billing-catalog.ts:583-615` |
| Enterprise has unlimited managed usage: unlimited true with zero window numbers, plan credit allowance Infinity, and an uncapped ledger allocation constant. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:82-84`; `packages/contracts/types/src/managed-usage-limits.ts:284-290`; `apps/web/lib/server/managed-usage-policy.ts:95-102` |
| The CLI has its own Byok tier whose enforcement is left to the user, so local and BYOK CLI use is not gated by the account tier. | read in the code | `apps/cli/src/tier_cache.rs:184-200` |
| Local needs no account: a signed-out Mobile user passes the on-device age confirmation, then onboarding and the app; CLI and VS Code need no account for Local; Electron Desktop chat has no Local mode. In Mobile Local mode the egress guard blocks managed-cloud hosts except account controls, withdrawal controls and a user-sent content report; sign-in SDK calls reach auth hosts in either mode. | read in the code | `apps/mobile/src/features/auth/services/rootRouting.ts:30-60`; `apps/mobile/app/index.tsx:9-12`; `docs/architecture/trust-boundaries.md:45-60` |
| Monthly USD prices: Basic 7, Premium 20, Max 100, Ultra 200, Team 25 per seat, Team Premium 125 per seat; Enterprise is contract priced. | read in the code | `packages/contracts/types/src/billing-catalog.ts:166-231` |
| 1 credit equals $0.005 of provider cost (5,000 microUSD); credits are the only usage unit shown to customers. | stated requirement | `docs/architecture/credits.md:7-16` |
| A top-up buys 50 credits per $1 paid (TOP_UP_UNITS_PER_USD) while a credit is $0.005 of provider cost (200 credits per $1 of cost, CREDITS_PER_USD). The two constants are kept separate and not reconciled; whether the gap is a deliberate markup or a defect is not established. Minimum $20, maximum $1,000, $2,000 a day; auto-reload threshold 100 to 100,000 credits. | read in the code | `packages/contracts/types/src/billing-topups.ts:5-14`; `packages/contracts/types/src/credits.ts:2-4`; `docs/architecture/credits.md:5-30` |
| Per-plan credit windows (5-hour / weekly / monthly): Free 200/1,500/2,000; Basic 10/100/400; Premium 50/500/2,000; Max 250/2,500/10,000; Ultra none/5,000/20,000; Team 50/500/2,000 per seat; Team Premium 250/2,500/10,000 per seat. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:31-85` |
| Ultra (max_15x) has no 5-hour cap (null); a zero cap means zero allowed usage. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:63-69`; `docs/product/commercial.md:108-123` |
| Flagship-model usage is capped at 30% of the weekly allowance on Premium, Max, Ultra and per-seat team plans; Basic and Free have no flagship cap. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:27`; `packages/contracts/types/src/managed-usage-limits.ts:250-292` |
| The 5-hour and weekly windows are rolling sums over the last 5 and 168 hours of credit_transactions deductions; rows tagged is_overage are excluded. | read in the code | `apps/web/lib/server/rolling-usage.ts (getRollingUsage)`; `apps/web/lib/services/managed-usage-request-service.ts:480-501` |
| The monthly window follows the subscription billing period; periods over 45 days (yearly) are cut into monthly slices anchored to the start date. | read in the code | `apps/web/lib/server/managed-usage-period.ts:46-75` |
| Entitlement resolves in one function: own entitled paid row, then team seat, then own lapsed or free row, then none. | read in the code | `apps/web/lib/services/entitlement-resolution.ts:376-413` |
| Only active and trialing statuses are entitled; any other status collapses the effective plan to free. Enterprise also tolerates past_due and unpaid unless collection is read-only. | read in the code | `packages/contracts/types/src/subscription-entitlement.ts:3-43`; `apps/web/lib/services/subscription-access-policy.ts:16-28` |
| Apps ask for entitlement through GET /api/me, which returns plan, effective_tier, subscription_source, billing_owner, feature flags and a four-layer capability handshake (model, tier, surface, settings). | read in the code | `apps/web/app/api/me/route.ts:250-345`; `apps/web/lib/services/capability-handshake-service.ts:353-383` |
| Capabilities by tier: connectors and Remote Control from Basic; AGI Work, Deep Research, images, managed API, developer surfaces from Premium; video only Ultra and Enterprise; team admin on team plans and Enterprise. | read in the code | `packages/contracts/types/src/billing-catalog.ts:322-364` |
| Every managed turn reserves usage through a per-user database function and is refused with a typed decision (402 or 429 codes) or 503 billing_unavailable when billing cannot answer. | read in the code | `apps/web/lib/services/managed-usage-request-service.ts:738-878`; `apps/web/lib/services/managed-usage-request-service.ts:283-300` |
| Funding order is plan windows, then bonus credits, then purchased credits only when usage credits are on; a turn that crosses a cap finishes on the plan. | stated requirement | `docs/architecture/credits.md:44-50`; `docs/product/commercial.md:239-258` |
| Free accounts are admitted through a separate Free ledger (free_daily_usage_reservations and website_auto_economy_trial_usage); the paid ledger helpers give Free a zero budget. Free product limits include 5 projects, 0 custom MCP servers, 0 connector tools, 0 scheduled tasks, 5 daily attachment uploads and 2 sandboxes. | read in the code | `apps/web/lib/services/free-trial-service.ts:40-46`; `apps/web/lib/server/managed-usage-policy.ts:98-115`; `packages/contracts/types/src/billing-catalog.ts:617-640` |
| Checkout is gated: an account without a live paid subscription needs billing.upgrades_open on (or AGI_BILLING_WAITLIST_OPEN=1) or any beta_redemptions row; otherwise POST /api/checkout returns 403 with the waitlist code. The flag reads closed on any error. | read in the code | `apps/web/app/api/checkout/route.ts:297-310`; `apps/web/lib/server/billing-waitlist-access.ts:28-66`; `apps/web/lib/feature-flags/billing-upgrade-gate.ts` |
| A subscription has one billing owner. A malformed Stripe subscription id or ids from more than one channel read as unverified and fail closed. With no store id and no Stripe subscription id: free tier reads none; a valid Stripe customer id reads stripe; otherwise a non-free tier reads manual. Store rows expire 3 days after paid-through. | read in the code | `apps/web/lib/server/subscription-billing-owner.ts:31`; `apps/web/lib/server/subscription-billing-owner.ts:47-67`; `apps/web/lib/server/subscription-billing-owner.ts:109-127` |
| The Stripe webhook rate-limits and verifies the signature, dedupes by event id (200 if done, 503 with Retry-After 10 if still processing), runs the handler and idempotency mark in one transaction, and returns 500 on failure so Stripe retries. | read in the code | `apps/web/app/api/stripe-webhook/route.ts:34-93` |
| Mobile v1 sells nothing: storePurchases.json has nativePurchases false, compiled per build; mobile only refreshes the tier in cloud mode. | read in the code | `apps/mobile/src/features/billing/storePurchases.json:2`; `apps/mobile/src/features/billing/store.ts (refreshTier)` |
| CLI and VS Code cache the account tier for 300 seconds; the CLI keeps a higher cached tier over a lower fetched one and times out the fetch at 3 seconds. | read in the code | `apps/cli/src/tier_cache.rs:31-35`; `apps/cli/src/tier_cache.rs:696-710`; `apps/extension-vscode/src/integrations/tierResolver.ts (TIER_CACHE_TTL_MS)` |
| Team seat entitlement comes from the organization owner's subscription, limited by join-order rank within licensed_seats; /api/me reports subscription_source manual for seat holders. | read in the code | `apps/web/lib/services/entitlement-resolution.ts:62-120`; `apps/web/app/api/me/route.ts:304-307` |
| The offline licensing verifier (TypeScript package and Rust crate) is not wired into any app runtime. | read in the code | `packages/contracts/licensing/src/index.ts:1-15`; `crates/agiworkforce-licensing/src/lib.rs:1-25` |
| Catalog versions 1 to 4 all map to the same allowance table; a subscription records the version it was sold under. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:89-96`; `packages/contracts/types/src/billing-plan-catalog.ts:19` |
| No plan in the catalog sets trialDays, so trials come only from referrals. | read in the code | `packages/contracts/types/src/billing-catalog.ts:166-231`; `apps/web/app/api/checkout/route.ts:431-454` |
| Access codes open acquisition only and grant no plan or trial. | stated requirement | `docs/runbooks/admin-surfaces.md:145`; `docs/product/commercial.md:63-65` |
| Apps with their own plan logic include the CLI tier enum, the VS Code alias map and mobile direct free comparisons. The retained Tauri code (not the public Desktop) derives subscription status locally and uses a free/basic/hobby budget-plan routing hint, which is not an entitlement check. | read in the code | `apps/cli/src/tier_cache.rs:184-252`; `apps/desktop/src/stores/auth.ts:796`; `apps/desktop/src-tauri/src/core/llm/llm_router.rs:757`; `apps/mobile/src/features/settings/cloud-billing/index.tsx:155`; `AGENTS.md section 5` |

## Open questions

- Which tool or admin route writes a hand-granted plan (the manual billing source, used for the mobile review account)? Not found in apps/web/app/api/admin or lib/services.
- Is it intended that any beta_redemptions row (not only billing-upgrade invites) opens the paid checkout gate? Code counts any row for the user.
- When will paid sales open? The gate flag billing.upgrades_open and the owner date for subscription sales are not stated in a repository document read here.
- Is the 50-credits-per-dollar top-up rate against the 200-credits-per-dollar credit definition a deliberate markup or a defect? The code keeps both constants and does not say.
- Is the up-to-5-minute CLI and VS Code cache lag after a cancellation accepted by the owner?
- What do the Chrome free-trial client and free-plan notices check, and do they match web wording and numbers? Not read.
- Do apps/web/features/billing components add any plan checks of their own beyond the shared helpers? Not read.
- Will catalog versions ever differ in allowances, and what is the 30-day notice process in practice? Only the mechanism exists.
- How the Free usage screen rule (Upgrade only, no meters) is enforced on mobile, desktop and Chrome; only a web test is named in project memory.
- Exact Stripe price ids and the full list of STRIPE_PRICE_* names beyond the first rows in apps/web/lib/pricing.ts were not enumerated.
- Challenge 'local-only and byok listed as available on web, desktop and mobile' was accepted in substance. The catalog does list them for web, desktop and mobile (billing-catalog.ts:235-247), but the page now states this is plan visibility only and adds the per-app mode table from trust-boundaries.md:45-60. The page never claimed Local ran on web; the mismatch between catalog visibility and mode support is now listed as a gap, and the page states that Local is offered only on Mobile, CLI, VS Code and the retained Tauri build.
- Challenge on Tauri desktop logic was accepted in part. The page already marked the Tauri code as retained, but rows 8 and 9 now say plainly they are not the public Desktop, and row 9 is described as a routing hint (free, basic, hobby), not an entitlement check. The findings stay listed because the code is still in the repository.
- Challenge on the manual billing source was accepted and corrected: a valid Stripe customer id with no subscription id reads as stripe (subscription-billing-owner.ts:56-66), and a free tier reads none. Manual needs a paid tier with no store id, no Stripe subscription id and no Stripe customer id.
- Challenge that the top-up rate is not reconciled with the credit definition was checked: the code has two separate constants (50 credits per $1 paid; a credit is $0.005 of provider cost) and neither the code nor credits.md establishes a markup or a defect, so the page no longer says there is no conflict.
- Challenge that Basic has no flagship cap was checked against managed-usage-limits.ts:250-258 and is right. The page table already showed none for Basic, and it now says why.
- Challenge on the webhook 503 was checked at stripe-webhook/route.ts:60-66 and is right. The page already mentioned it in prose; it now has its own failure-handling row and key fact.
- The Enterprise unlimited point was checked and is right (managed-usage-limits.ts:82-84; managed-usage-policy.ts:95-102). The page had Enterprise as 'contract (unlimited flag)'. It now states the Infinity allowance and the uncapped ledger constant.

## Project documents found out of date

- `apps/cli/src/tier_cache.rs (module header comment)`: Lists canonical tiers without team_premium and says the CLI no longer reads credits because there are no per-use credits. The code says: The UserTier enum includes TeamPremium, and usage_summary.rs reads /api/usage credit windows (monthly, weekly, five_hour). (apps/cli/src/tier_cache.rs:6-9 versus 184-200; apps/cli/src/usage_summary.rs:1-8, 40-62)
- `packages/contracts/licensing/src/index.ts and crates/agiworkforce-licensing/src/lib.rs (header comments)`: Not outdated as such, but they are the only statement that the verifier is unwired. No project guide says whether Team and Enterprise editions will use it. The code says: No app imports the package or crate; editions are only team and enterprise in the claims schema. (packages/contracts/licensing/src/claims.ts:3-4; searches found no app-level importer)
- `docs/architecture/credits.md`: Calls the windows a '5-hour' and 'weekly' allowance without saying they are rolling sums rather than fixed periods; and says top-ups are 'sold on the web only' while the top-up route also serves Apple- and Google-billed accounts (the purchase is still made through Stripe). The code says: 5-hour and weekly windows are rolling sums over trailing hours; the top-up route accepts billing sources stripe, apple and google. (apps/web/lib/server/rolling-usage.ts; apps/web/app/api/billing/top-up/route.ts:157-162)
- `packages/contracts/types/src/billing-catalog.ts (PLAN_SURFACE_VISIBILITY, lines 235-247)`: Marks local-only and byok selectable on web, desktop and mobile, which reads as if those modes run there. The code says: The trust-boundary document says web and Chrome are Cloud only, public Desktop chat is Cloud only, and BYOK is not offered on mobile. This is a catalog-versus-document mismatch; the catalog is code and wins as plan visibility, but it is not mode support. (packages/contracts/types/src/billing-catalog.ts:235-247; docs/architecture/trust-boundaries.md:45-60)
