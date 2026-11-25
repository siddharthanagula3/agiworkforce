# Area 100. Commercial and administrative components

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S100.01 Plan catalog.
- Should: A single plan catalog defines each plan's tier, capabilities and limits and is what checkout and enforcement read.
- Status: platform done
- Code: packages/contracts/types/src/billing-catalog.ts:289; packages/contracts/types/src/billing-plan-catalog.ts:11; apps/web/app/api/checkout/route.ts:157

## S100.02 Price catalog.
- Should: A price catalog maps each plan, interval and currency to a real charged price that pricing and checkout use.
- Status: platform done
- Code: apps/web/lib/pricing.ts:50; apps/web/lib/server/localized-pricing-service.ts:34; apps/web/lib/server/localized-pricing-service.ts:44

## S100.03 Entitlement resolver.
- Should: One service resolves what an account is entitled to (plan, seat, grace) and every enforcement point asks it.
- Status: platform done
- Code: apps/web/lib/services/entitlement-resolution.ts:253; apps/web/lib/services/entitlement-resolution.ts:285; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:82

## S100.04 Limit/quota resolver.
- Should: Per-plan limits and quotas (rolling windows, unit quotas) are resolved from the plan and applied when a request is admitted.
- Status: platform done
- Code: apps/web/lib/services/tier-unit-quota-service.ts:58

## S100.05 Usage-event ingestion.
- Should: Each metered operation records a usage event (who, what model, how much, cost) into durable storage.
- Status: platform done
- Code: apps/web/lib/services/managed-usage-request-service.ts:756; apps/web/lib/services/managed-usage-request-service.ts:486; apps/web/db/neon/0182_managed_usage_microusd_ledger.sql:2695

## S100.06 Usage ledger.
- Should: An append-only usage ledger holds every reservation, settlement and release so balances and windows can be recomputed correctly.
- Status: platform done
- Code: apps/web/db/neon/0056_managed_usage_request_lifecycle.sql:13; apps/web/db/neon/0182_managed_usage_microusd_ledger.sql:256; apps/web/db/neon/0281_managed_usage_overage_classification.sql:1

## S100.07 Credit reservation.
- Should: Before a metered operation runs, its estimated cost is reserved against the account's limits and balance.
- Status: platform done
- Code: apps/web/lib/services/managed-usage-request-service.ts:454; apps/web/lib/services/managed-usage-request-service.ts:486; apps/web/db/neon/0182_managed_usage_microusd_ledger.sql:2069

## S100.08 Credit settlement.
- Should: After a metered operation, the reservation is settled at the actual cost and credits are deducted exactly once.
- Status: platform done
- Code: apps/web/lib/services/managed-usage-request-service.ts:707; apps/web/lib/services/managed-usage-request-service.ts:756; apps/web/db/neon/0182_managed_usage_microusd_ledger.sql:1288

## S100.09 Credit refund/release.
- Should: Unused or failed reservations are released, stranded ones are recovered, and refunded purchases reverse their credits.
- Status: platform done
- Code: apps/web/app/api/cron/recover-reservations/route.ts:40; vercel.json:44; apps/web/db/neon/0056_managed_usage_request_lifecycle.sql:537; apps/web/db/neon/0182_managed_usage_microusd_ledger.sql:782

## S100.10 Cost attribution.
- Should: Costs are attributed to account, project, feature and model, and the provider cost is kept separately from what the user is billed.
- Status: platform done
- Code: apps/web/lib/services/managed-usage-request-service.ts:733; apps/web/lib/services/managed-usage-request-service.ts:820; apps/web/lib/services/organization-usage-service.ts:198

## S100.11 Rate-limiting service.
- Should: A shared rate-limiting service limits requests per user/route/plan across instances.
- Status: platform done
- Code: apps/web/lib/rate-limit.ts:979; apps/web/lib/rate-limit.ts:29

## S100.12 Concurrency-limiting service.
- Should: A concurrency limiter caps simultaneous managed turns per account according to plan.
- Status: platform done
- Code: apps/web/lib/rate-limit.ts:1224; apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:35

## S100.13 Budget manager.
- Should: A budget manager holds spending limits and stops managed usage when a budget is reached.
- Status: platform done
- Code: apps/web/lib/services/spend-limit-service.ts:175; apps/web/lib/services/managed-usage-request-service.ts:471

## S100.14 Checkout adapter.
- Should: A checkout adapter creates a payment-provider checkout for any eligible user and returns them to a verified result.
- Status: platform done
- Code: apps/web/app/api/checkout/route.ts:414; apps/web/app/api/checkout/route.ts:392; apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:55

## S100.15 Subscription synchronization.
- Should: Subscription state is kept in sync with the payment provider, in order, with periodic reconciliation.
- Status: platform done
- Code: apps/web/app/api/stripe-webhook/lib/handlers.ts:133; apps/web/app/api/cron/reconcile-billed-plans/route.ts:36; apps/web/app/api/stripe-webhook/lib/db.ts:860

## S100.16 Payment webhook processor.
- Should: A webhook endpoint verifies provider signatures, processes each event exactly once and handles the billing event types.
- Status: platform done
- Code: apps/web/app/api/stripe-webhook/route.ts:47; apps/web/app/api/stripe-webhook/lib/verify.ts:29

## S100.17 Mobile receipt validation.
- Should: Receipts from Apple and Google are validated server-side and grant the matching plan or credits.
- Status: platform partial
- Code: apps/web/app/api/mobile/iap/verify/route.ts:50; apps/web/lib/server/mobile-iap-store-verification.ts:399; apps/web/lib/server/mobile-iap-catalog.ts:62; apps/web/app/api/mobile/iap/catalog/route.ts:83
- Unfinished: platform: Turn on native purchases: Apple/Google verification is built, but MOBILE_IAP_ENABLED is unset by default so no product resolves and every verify call is refused; the catalog also requires an upgrade-waitlist redemption (beta_redemptions).

## S100.18 Invoice service.
- Should: An invoice service produces and lists invoices for each account with downloadable documents.
- Status: platform done
- Code: apps/web/lib/services/billing-invoice-service.ts:46; apps/web/app/api/billing/invoices/route.ts:28

## S100.19 Refund/dispute workflow.
- Should: Refunds and disputes are processed end to end: issued, reflected in plan and credits, and reversed when a dispute is won.
- Status: platform done
- Code: apps/web/app/api/stripe-webhook/lib/dispute-events.ts:431; apps/web/lib/services/billing-refund-service.ts:764; apps/web/lib/services/billing-refund-service.ts:580

## S100.20 Tax calculation integration.
- Should: Tax is calculated by an integrated tax engine for every charge, including tax IDs and reverse charge.
- Status: platform done
- Code: apps/web/lib/billing/tax-policy.ts:94; apps/web/lib/billing/tax-policy.ts:110; apps/web/app/api/checkout/route.ts:408; apps/web/app/api/billing/top-up/route.ts:258

## S100.21 Seat/license service.
- Should: A seat/license service tracks purchased seats, assigns them to members and enforces the count.
- Status: platform done
- Code: apps/web/app/api/stripe-webhook/lib/seats.ts:114; apps/web/lib/services/organization-seat-service.ts:33; apps/web/app/api/settings/team/invitations/route.ts:75

## S100.22 Promotion service.
- Should: A promotion service creates and applies promo codes, bonus credits and invite grants to accounts.
- Status: platform done
- Code: apps/web/app/api/checkout/route.ts:407; apps/web/app/api/upgrade/route.ts:256; apps/web/features/admin/services/operator-metrics.ts:411

## S100.23 Referral service.
- Should: A referral service issues referral codes, attributes sign-ups and grants rewards.
- Status: platform done
- Code: apps/web/lib/services/referral-service.ts:194; apps/web/lib/services/referral-service.ts:235; apps/web/lib/services/referral-service.ts:445; apps/web/app/api/stripe-webhook/lib/referral-events.ts:128; apps/web/app/api/stripe-webhook/lib/referral-events.ts:211; apps/web/features/settings/sections/ReferralsSection.tsx:126

## S100.24 Usage reporting.
- Should: Usage reporting aggregates the ledger by time, model and feature for accounts and workspaces, with export.
- Status: platform done
- Code: apps/web/app/api/usage/history/route.ts:24; apps/web/lib/services/account-usage-history-service.ts:95; apps/web/app/api/settings/organization/usage-analytics/export/route.ts:41

## S100.25 Enterprise billing integration.
- Should: Enterprise contracts (committed seats, invoicing terms, PO, offline payment) are stored and drive billing.
- Status: platform done
- Code: apps/web/lib/services/enterprise-contracts/agreement-store.ts:31; apps/web/db/neon/0287_commercial_agreement_procurement_terms.sql:31; apps/web/lib/services/enterprise-contracts/invoicing.ts:287; apps/web/app/api/stripe-webhook/lib/handlers.ts:133

## S100.26 Administrative API.
- Should: Organization admins can manage their workspace programmatically through an authenticated, scoped administrative API.
- Status: platform done
- Code: apps/web/lib/server/compliance-caller.ts:36; apps/web/app/api/settings/organization/audit/export/route.ts:59; apps/web/db/neon/0206_organization_admin_api_keys.sql:18; apps/web/app/api/scim/v2/Users/route.ts:40; apps/web/lib/server/scim/scim-auth.ts:45

## S100.27 Support-case integration.
- Should: Support cases are created with account context, routed to staff and threaded with replies.
- Status: platform done
- Code: apps/web/lib/support/tickets/service.ts:131; apps/web/db/neon/0024_support_tickets.sql:9; apps/web/app/api/support/tickets/route.ts:44

## S100.28 Audit-event store.
- Should: Commercial and administrative actions write durable audit events that can be queried later.
- Status: platform done
- Code: apps/web/lib/security-audit.ts:641; apps/web/db/neon/0014_security.sql:1
