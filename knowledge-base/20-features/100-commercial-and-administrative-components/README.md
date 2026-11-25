---
id: "AREA-100"
type: "area"
title: "Commercial and administrative components"
features: ["F100-01", "F100-02", "F100-03", "F100-04", "F100-05", "F100-06", "F100-07", "F100-08", "F100-09", "F100-10", "F100-11", "F100-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 100. Commercial and administrative components

This area is the money and admin side of AGI Workforce. It decides which plan an account holds, what that plan allows, how much each model call costs and is charged, how payments and refunds reach the account, and how workspace admins manage seats, audit logs and directory sync. A person gets a paid plan or credits, sees their usage and invoices, and can ask for support. The area matters because every managed (Cloud) model call passes through it, so a fault here either lets usage run for free or blocks paying customers.

**Who uses it.** Every signed-in person uses the plan, usage and checkout parts (their own account). Paid-plan holders get their plan's limits and invoices. Workspace owners and admins use seats, team invitations, usage analytics export, audit export and the admin API. Enterprise customers get contract-based billing. Developers use API keys with scopes (for example usage:read on the usage history route, and admin API keys with scopes for workspace admin calls). Staff see support tickets and operator metrics (apps/web/features/admin/services/operator-metrics.ts is referenced by the brief). Code that is not a person: the Stripe webhook and cron jobs run without a user.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F100-01](F100-01-plans-prices-and-what-a-plan-allows.md) | Plans, prices and what a plan allows | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-02](F100-02-limits-rate-and-spend-controls.md) | Limits, rate and spend controls | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-03](F100-03-metered-usage-ledger-reserve-settle-release-cost.md) | Metered usage ledger (reserve, settle, release, cost) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-04](F100-04-buying-a-plan-and-paying.md) | Buying a plan and paying | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-05](F100-05-mobile-store-purchases-apple-and-google.md) | Mobile store purchases (Apple and Google) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-06](F100-06-invoices-refunds-and-disputes.md) | Invoices, refunds and disputes | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-07](F100-07-promotions-and-referrals.md) | Promotions and referrals | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-08](F100-08-seats-team-admin-and-admin-api.md) | Seats, team admin and admin API | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-09](F100-09-usage-reporting-and-export.md) | Usage reporting and export | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-10](F100-10-enterprise-contracts.md) | Enterprise contracts | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-11](F100-11-support-cases.md) | Support cases | n/a | n/a | n/a | n/a | n/a | n/a |
| [F100-12](F100-12-audit-trail.md) | Audit trail | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/100-commercial-and-administrative-components.md](../../10-requirements/capabilities/100-commercial-and-administrative-components.md).

## How this area works in the code

1. **Plan and price catalog.** The catalog defines plans, sellability, versions and prices. Checkout, pricing and enforcement read the same plan records. Tax policy and the plan limits come from the same tier policy. (`packages/contracts/types/src/billing-plan-catalog.ts:1-30`, `packages/contracts/types/src/billing-catalog.ts:280-300`, `apps/web/lib/pricing.ts:1-40`, `apps/web/lib/server/localized-pricing-service.ts:40-60`)
2. **Checkout a plan.** The person's upgrade request reaches the checkout route. It reuses or creates the payment customer, refuses if a live subscription already exists, and creates the payment-provider checkout session. (`apps/web/app/api/checkout/route.ts:150-170`, `apps/web/app/api/checkout/route.ts:380-430`)
3. **Payment webhook.** The provider calls the webhook. The route rate-limits, checks the signature, de-duplicates by event id, and then dispatches the event. Subscription events update the stored plan in event order. (`apps/web/app/api/stripe-webhook/route.ts:47-70`, `apps/web/app/api/stripe-webhook/lib/verify.ts:29-45`, `apps/web/app/api/stripe-webhook/lib/handlers.ts:69-75`, `apps/web/app/api/stripe-webhook/lib/handlers.ts:125-140`)
4. **Resolve what the account may do.** Each managed request passes the auth gate. It reads the subscription, decides whether it is entitled, and resolves the usage plan. A lapsed paid plan is served as Free. (`apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:60-84`, `apps/web/lib/services/entitlement-resolution.ts:241-248`, `apps/web/lib/services/entitlement-resolution.ts:283-302`)
5. **Admit the request.** The shared rate limiter checks the request, then a concurrency slot is taken for the turn. Full slots return an error with a retry or upgrade message. (`apps/web/lib/rate-limit.ts:1234-1250`, `apps/web/lib/rate-limit.ts:1366-1380`, `apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:20-40`)
6. **Reserve the estimated cost.** Spend cap is checked for workspaces; the plan allowance and promotional caps are read; a database function writes the reservation against the session, weekly and flagship caps. Refusals name the window that was hit. (`apps/web/lib/services/managed-usage-request-service.ts:738-800`, `apps/web/lib/services/managed-usage-request-service.ts:800-830`, `apps/web/lib/services/managed-usage-request-service.ts:440-467`)
7. **Settle the actual cost.** After the model call the request is finalized. Billed cost and provider cost are stored separately. A failed call records zero cost. (`apps/web/lib/services/managed-usage-request-service.ts:1140-1170`)
8. **Recover stranded holds.** A cron job every 15 minutes releases reservations that were never settled, recovers abandoned voice sessions, and drains the settlement queue. (`apps/web/app/api/cron/recover-reservations/route.ts:20-60`, `vercel.json:74-75`)
9. **Report and export.** The usage history route reads the ledger by window, granularity and workload. Admin exports go through the audit and usage export routes, which check permissions and policy first. (`apps/web/app/api/usage/history/route.ts:25-50`, `apps/web/app/api/settings/organization/audit/export/route.ts:50-80`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/services/managed-usage-request-service.ts` | Reserves, settles and releases the cost of each managed model call; attributes cost. |
| `apps/web/lib/services/entitlement-resolution.ts` | Single resolver for what an account is entitled to (plan, seat, lapsed paid plan). |
| `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Gate every managed model request passes before it runs; enforces surface and terms. |
| `apps/web/lib/rate-limit.ts` | Shared rate limiter and the managed concurrent-turn slot. |
| `apps/web/app/api/checkout/route.ts` | Creates the payment checkout and refuses double subscriptions. |
| `apps/web/app/api/stripe-webhook/route.ts` | Entry point for payment provider events; verifies, de-duplicates and dispatches. |
| `packages/contracts/types/src/billing-plan-catalog.ts` | Plan catalog: sellability, catalog version, withdrawn plans and successors. |
| `apps/web/lib/server/mobile-iap-catalog.ts` | Reads mobile store configuration and decides whether store purchases are offered. |
| `apps/web/app/api/mobile/iap/verify/route.ts` | Verifies an Apple or Google receipt on the server and grants the plan or credits. |
| `apps/web/lib/server/scim/scim-auth.ts` | Authenticates directory sync calls and enforces the incident lockdown. |
| `apps/web/app/api/cron/recover-reservations/route.ts` | Releases stranded cost holds and drains the settlement queue every 15 minutes. |
| `apps/web/lib/services/spend-limit-service.ts` | Workspace monthly spend cap; block mode refuses managed usage at the cap. |

## What is stored

- Managed usage requests (lifecycle rows, reservations and settlement): Neon Postgres: apps/web/db/neon/0056_managed_usage_request_lifecycle.sql:13 and 0182_managed_usage_microusd_ledger.sql (micro-dollar ledger)
- Usage overage classification: Neon Postgres: apps/web/db/neon/0281_managed_usage_overage_classification.sql:1
- Subscriptions (plan tier, status, Stripe and store ids, period end): Neon Postgres table subscriptions (read at apps/web/app/api/mobile/iap/catalog/route.ts; written by stripe-webhook handlers)
- Mobile store account token and store transactions: Neon Postgres tables mobile_iap_accounts and mobile_app_transactions (apps/web/app/api/mobile/iap/verify/route.ts:58-66; catalog route)
- Support tickets: Neon Postgres: apps/web/db/neon/0024_support_tickets.sql:9
- Workspace admin API keys: Neon Postgres: apps/web/db/neon/0206_organization_admin_api_keys.sql:18
- Enterprise agreement terms (procurement terms): Neon Postgres: apps/web/db/neon/0287_commercial_agreement_procurement_terms.sql:31
- Security and audit events: Neon Postgres: apps/web/db/neon/0014_security.sql:1; written by apps/web/lib/security-audit.ts
- Store price cache (10 minutes): Server memory only: apps/web/lib/server/localized-pricing-service.ts:40-41
- Payment provider customer and subscription ids: Stored on the subscriptions table; read by apps/web/app/api/checkout/route.ts:392-410

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **MOBILE_IAP_ENABLED**: Turns store purchases on for the deployment. Off or unset means no product is offered. (apps/web/lib/server/mobile-iap-catalog.ts:53-57 (read); apps/web/lib/validate-env.ts:1389 (declared); apps/web/.env.example:285 (default false))
- **MOBILE_IAP_APPLE_PRODUCT_IDS_JSON and MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON**: Map logical product keys to store product ids. A bad value throws. (apps/web/lib/server/mobile-iap-catalog.ts:14-30 and 80-110)
- **MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON**: Sets how Google subscription upgrades and downgrades replace the old plan. (apps/web/lib/server/mobile-iap-catalog.ts:21-23)
- **in_app_purchase capability (kill switch)**: Turns the mobile catalog off without a deploy. (apps/web/app/api/mobile/iap/catalog/route.ts:50-60)
- **Stripe keys and webhook secret**: Required for the webhook and checkout. Missing values log an error and the webhook returns 500. (apps/web/app/api/stripe-webhook/route.ts:10-13 and 36-40)
- **Stripe price ids (STRIPE_PRICE_*)**: A missing or badly formed price id makes that price unavailable. (apps/web/lib/pricing.ts:17-35)
- **Plan limits and concurrent responses**: Set per plan; zero or missing concurrency refuses the turn. (apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:1-40 and apps/web/lib/services/tier-unit-quota-service.ts:50-75)
- **Workspace spend cap (block or report mode)**: Block mode refuses managed usage at the monthly cap. (apps/web/lib/services/spend-limit-service.ts:175-184)
- **Organization audit export policy**: A saved policy can turn audit export off for the workspace. (apps/web/app/api/settings/organization/audit/export/route.ts:59-65)
- **Cron schedules**: How often reservations are recovered (every 15 minutes) and billed plans reconciled (daily). (vercel.json:74-75 and vercel.json:174-175)
- **Low-power cron skip**: Skips the recovery cron when set. (apps/web/app/api/cron/recover-reservations/route.ts:29-30 (lowPowerCronSkip))
- **Stripe API version pin**: Webhook logs a warning when the endpoint API version differs from the pinned one. (apps/web/app/api/stripe-webhook/lib/verify.ts:33-40 and apps/web/lib/stripe-config.ts (imported))

## Shared between apps

Shared: the plan, price and product catalogs in packages/contracts/types/src (billing-catalog.ts, billing-plan-catalog.ts) are imported by the web server and the mobile catalog (mobile-iap-catalog.ts imports from @agiworkforce/types). The entitlement resolver, usage ledger, rate limiter, spend cap and audit writer are shared server code in apps/web/lib and are called by all API routes. Mobile-only: the Apple and Google store code (mobile-iap-store-verification.ts, mobile/iap routes). Web-only per code read: the checkout pages, ReferralsSection.tsx, and the team and billing settings screens. Desktop, CLI, VS Code and Chrome extension UI for this area were not read.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says the mobile catalog requires an upgrade-waitlist redemption (beta_redemptions). The catalog route code has no redemption check, and its test asserts that no beta_redemptions query runs. The verify route test still expects a beta_redemptions query, so the two disagree. The brief claim is not confirmed. (apps/web/app/api/mobile/iap/catalog/__tests__/route.test.ts:130-160 vs apps/web/app/api/mobile/iap/verify/__tests__/route.test.ts:242)
- Spend cap fails open. When the spend state cannot be read the request is treated as ungoverned and allowed, although the brief says the budget manager stops managed usage at the limit. (apps/web/lib/services/spend-limit-service.ts:175-184 (UNGOVERNED on read error))
- Auth gate decides entitlement without the enterprise collection state when that read fails, so a read failure may grant access rather than refuse it. (apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:44-50)
- Mobile verify acknowledges the purchase with the store after recording it. If acknowledgement fails the purchase is still recorded and the response is returned with storeAcknowledged false, so the store may refund later. (apps/web/app/api/mobile/iap/verify/route.ts:70-95)
- Brief says support cases are routed to staff. The code read creates the ticket with priority and emails the support team, but the staff queue routing was not found in the files read. (apps/web/lib/support/tickets/service.ts:131-140)
- Stripe webhook logs a configuration error at module load but does not stop; requests then return HTTP 500 'Stripe not configured'. (apps/web/app/api/stripe-webhook/route.ts:10-13 and 36-40)

## Not established

- Per-app UI for every item: the brief gives only 'platform' status, so Desktop, Mobile, CLI, VS Code and Chrome screens were not read.
- Seat enforcement count at invitation time and the Stripe seat sync were only partly read (seats.ts and organization-seat-service.ts opened at the top only).
- Referral reward amounts and the referral-service internals (referral-service.ts lines 194-445 were not read).
- Refund and dispute reversal logic internals (billing-refund-service.ts and dispute-events.ts were only partly read).
- Invoice document generation and download (billing-invoice-service.ts:46 not read in full).
- Tax engine internals beyond tax-policy.ts:94-110 (which provider computes tax was not established).
- Whether the local-only and BYOK plan tiers are charged or enforced by this area (the catalog lists them as free_of_charge).
- Admin operator metrics (apps/web/features/admin/services/operator-metrics.ts) not opened.
- No tests, builds or servers were run, as the task was read-only. The relayed request asks for testing on localhost one surface at a time; that is for a later QA pass and was not done here.
- Whether the brief's 'platform done' statuses hold: the code read supports most items, but the status claims were checked only at the cited lines.
