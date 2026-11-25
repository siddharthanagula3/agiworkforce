---
id: "GAPS-AREA-100"
type: "gap-list"
title: "Gaps: Commercial and administrative components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 100. Commercial and administrative components

84 open gaps that touch this area. Area page: [20-features/100-commercial-and-administrative-components](../../20-features/100-commercial-and-administrative-components/README.md).

## CMP-C14

**Admin per-member and pooled group spend budgets**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: The CLI has only the user's own /budget; no admin-set member caps or shared pools.
- Evidence: searched: pooled, group budget, member cap in apps/cli/src, crates/agiworkforce-licensing

## CMP-D4

**Request a higher personal usage limit from Usage**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No in-product request for a higher limit.
- Evidence: searched: limit increase, request more usage in apps/web/features/settings and billing

## CMP-DP5

**Admin spend limits with alerts**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No per-user or per-group caps A workspace monthly cap with alert threshold and notify or block mode exists; no per-user or per-group caps.
- Evidence: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx

## CMP-MP12

**Subscription bought on another platform alert**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md), [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Detail: There is no pop-up alert The Billing row says where the plan is managed (web, store, organization); there is no pop-up alert.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:378

## CMP-V2

**Ask a workspace owner for more credits or limits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: A user who hits a limit sees upgrade or top-up links but cannot message an admin from the editor.
- Evidence: searched: ask admin, workspace owner in apps/extension-vscode/src

## CMP-W23

**Per-member, group and seat-type monthly spend limits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Only one workspace cap and one personal cap exist; no group, role or member limits with overrides.
- Evidence: searched: memberCap, perMember, group budget, usage limit in apps/web/lib/services, app/api/settings/organization/groups, roles

## CMP-W25

**Request more usage from an admin when capped**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: A blocked member sees the limit but has no in-product button to ask an admin for more.
- Evidence: searched: request more usage, request increase in apps/web/app, apps/web/features

## CMP-W26

**$500 plan**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md), [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Detail: No plan above $200 for individuals.
- Evidence: packages/contracts/types/src/billing-catalog.ts:23-30 (self-serve tiers end at max_15x and team)

## CMP-W27

**Admin view of who is blocked or near a limit**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Workspace usage analytics lists usage per member but not who is blocked or close to a cap.
- Evidence: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:243

## CMP-W31

**Buy an Enterprise plan online without sales**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md), [F100-08](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md), [F100-10](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Detail: Enterprise has no checkout; it starts with a sales conversation.
- Evidence: apps/web/app/faq/page.tsx:94; packages/contracts/types/src/billing-catalog.ts:225-228 (contractPriced)

## CMP-W45

**Member Request more button when team budget runs out**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No member request flow for more budget or credits.
- Evidence: searched: request more, credit request, ask admin in features, app, lib, unified-chat

## CMP-W46

**Notice that you are now running on credits after a limit**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: No message tells the user that a turn is being paid from credits.
- Evidence: searched apps/web (app, features, lib, shared) and packages (ui, contracts, client), tests excluded: using credits, now on credits, continuing with credits, drawing credits (no hits)

## CMP-W49

**Per-user usage limits with group and individual overrides**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-11](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Workspace has one monthly spend cap with enforcement and alert threshold; no per-member or per-group limits.
- Evidence: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:82

## CMP-WP19

**Credit expiry rules**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F082-06](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md), [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: Purchased credits show 'No expiry date recorded' when none is set Bonus credits show an expiry date; purchased credits show 'No expiry date recorded' when none is set.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:370-398

## CMP-WP30

**Usage alerts at chosen thresholds sent to chosen people**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F082-09](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: No several thresholds or recipient list The workspace spend cap has one alert percentage and a notify mode; no several thresholds or recipient list.
- Evidence: apps/web/app/api/settings/organization/spend-limit/route.ts:37

## GAP-AREA100-LW03

**Auth gate decides entitlement without the enterprise collection state when that read fails, so a read failure may grant access rather than refuse it.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-100
- Detail: Area 100. Commercial and administrative components
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:44-50

## GAP-AREA100-LW04

**Mobile verify acknowledges the purchase with the store after recording it. If acknowledgement fails the purchase is still recorded and the response is returned with storeAcknowledged false, so the store may refund later.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-100
- Detail: Area 100. Commercial and administrative components
- Evidence: apps/web/app/api/mobile/iap/verify/route.ts:70-95

## GAP-AREA100-LW06

**Stripe webhook logs a configuration error at module load but does not stop; requests then return HTTP 500 'Stripe not configured'.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-100
- Detail: Area 100. Commercial and administrative components
- Evidence: apps/web/app/api/stripe-webhook/route.ts:10-13 and 36-40

## GAP-CAP-subscriptions-and-plans-02

**Individual paid plan ladder: No equivalent of ChatGPT's $500 tier (W26). Whether to add one is an owner choice.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-02](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md), [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Requirement items: S100.01, S100.02, S81.03, S81.04, S81.05, S81.06, S81.07
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-05

**Buying or upgrading a paid plan: By decision, no live paid purchase. Checkout never run against a real sale; paid-launch gate evidence not accepted yet.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md), [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md), [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Requirement items: S100.14, S83.03, S83.28
- Detail: Claude yes, ChatGPT yes; AGI off by decision

## GAP-CAP-subscriptions-and-plans-09

**One billing owner and store-managed subscriptions: Mobile alert partial (MP12).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md), [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Requirement items: S100.15, S81.27, S83.26, S83.27
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-10

**Mobile in-app purchase and restore: Store products and server flag not live; untested against real store sandboxes in the evidence.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md), [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md), [F100-05](../../20-features/100-commercial-and-administrative-components/F100-05-mobile-store-purchases-apple-and-google.md)
- Requirement items: S100.17, S83.03, S83.25
- Detail: Claude yes, ChatGPT yes; AGI off by decision

## GAP-CAP-subscriptions-and-plans-13

**Refunds and legal withdrawal rights: None known in code; legal copy under owner and legal review.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md), [F100-06](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Requirement items: S100.19, S83.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-15

**Credits past plan limits: No 'now using credits' notice (W46); expiry display partial (WP19); seen defect: credit banner and sidebar meter stale after image generations (W-7).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Requirement items: S100.07, S100.08, S81.20, S81.21
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-17

**One subscription shared across apps and coding tools: None known; cross-app agreement not seen by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Requirement items: S100.03, S81.27
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-18

**Promotions, promo codes and trials: Promo path off while purchasing is gated; not seen live.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md), [F083-05](../../20-features/083-billing-and-subscription-screens/F083-05-trial-terms.md), [F100-07](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Requirement items: S100.22, S100.23, S81.18, S81.19, S83.07, S83.08
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-22

**Admin spend limits and requests for more usage: Per-member and group budgets, request-more flow and admin blocked view.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Requirement items: S100.13, S81.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-23

**Enterprise plan with contract and invoice billing: Self-serve Enterprise (a Claude-only option) not built; launch needs SSO and SCIM and a managed-credit ledger per commercial.md.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md), [F100-08](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md), [F100-10](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Requirement items: S100.21, S100.25, S83.30, S83.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F100-01-01

**The brief says an account with no live paid subscription resolves with entitlement_missing. Only an account with no subscription row does; a lapsed paid row gives payment_required.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Detail: Affects: Testers and any client that maps denial reasons.. Work needed: Correct the brief wording; make clients handle both reasons.
- Evidence: apps/web/lib/services/entitlement-resolution.ts:289-302, 320

## GAP-F100-01-02

**Surface visibility has no entry for CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Detail: Affects: surface:cli, surface:vscode, surface:chrome. Work needed: Decide whether plan selection on those apps is intentionally web-only, then record it or extend the type.
- Evidence: packages/contracts/types/src/billing-catalog.ts:233-246

## GAP-F100-01-03

**Only USD and INR have configured price ids; the brief expects every currency a plan is sold in.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Detail: Affects: Buyers outside the US and India. Work needed: Confirm in Stripe which currency options exist; add a check that fails when a sold currency has no matching option.
- Evidence: apps/web/lib/pricing.ts:54-110; localized-pricing-service.ts:113

## GAP-F100-01-04

**Withdrawn-plan handling has no live data, so it has only been exercised by code paths and tests, not by a real withdrawal.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Detail: Affects: Future plan changes. Work needed: Run a staged withdrawal scenario before relying on it.
- Evidence: billing-plan-catalog.ts:36-41

## GAP-F100-01-05

**Paid purchase is open only to accounts that pass the acquisition gate, so the catalog's self_serve plans are not purchasable by everyone.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-01](../../20-features/100-commercial-and-administrative-components/F100-01-plans-prices-and-what-a-plan-allows.md)
- Detail: Affects: All new paying customers on web. Work needed: None until the owner opens upgrades; the flag already exists.
- Evidence: billing-waitlist-access.ts:33-54; doc: docs/product/commercial.md (Paid Acquisition Gate)

## GAP-F100-02-01

**Three different budget mechanisms exist with different failure behaviour (workspace block fails open and is cached; workspace policy cap fails closed; personal cap is exact in the database).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Affects: Workspace admins and testers. Work needed: Document which one the console controls and decide whether to merge or align them.
- Evidence: spend-limit-service.ts:51-58, 161-200; managed-usage-request-service.ts:338-399; 0378_personal_spend_limit.sql:11-25

## GAP-F100-02-02

**The brief points the budget manager at managed-usage-request-service.ts:471, which is only refusal text; the block gate is in spend-limit-service and managed-compute-gate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Affects: Engineers following the brief. Work needed: Update the brief's code pointers.
- Evidence: managed-usage-request-service.ts:431-444; managed-compute-gate.ts:511

## GAP-F100-02-03

**Chat route rate limit is not plan scaled.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Affects: Paid users on high-concurrency plans. Work needed: Confirm intent; pass plan tier if scaling is wanted.
- Evidence: auth-gate.ts:274; rate-limit.ts:961-966

## GAP-F100-02-04

**Window lengths are constants in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Affects: Plan changes that alter windows. Work needed: Move to the plan configuration if windows ever differ by plan.
- Evidence: capability-limit-resets.ts:7-8

## GAP-F100-02-05

**No evidence in this read that CLI, VS Code, Chrome and mobile show identical refusal wording and reset times.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-02](../../20-features/100-commercial-and-administrative-components/F100-02-limits-rate-and-spend-controls.md)
- Detail: Affects: surface:cli, surface:vscode, surface:chrome, surface:mobile. Work needed: Run the same refusal through each app and compare.
- Evidence: Per-app handlers listed in the implementation map; wording not compared

## GAP-F100-03-01

**The brief calls the ledger append-only, but the service updates managed_usage_requests rows in place for attribution and outcome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: Affects: Engineers relying on the brief. Work needed: Verify the SQL and word the requirement as an auditable lifecycle, or add an append-only event table.
- Evidence: managed-usage-request-service.ts:614-712

## GAP-F100-03-02

**Brief says Reservation is at managed-usage-request-service.ts:738-827 and cost attribution at 614-712; attribution of organization and feature is only partly there (organization id passed in at line 742; feature is the quotaFeature tag).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: Affects: Cost reports by workspace and feature. Work needed: Confirm where organization_id is written to the row and that reports group by it.
- Evidence: managed-usage-request-service.ts:742, 1160-1165

## GAP-F100-03-03

**No evidence of a ledger entry for Local or own-key turns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: Affects: mode:local, mode:own-key. Work needed: Decide if device-only turns need no ledger and record that in SYS-execution-boundaries.
- Evidence: No write found outside the managed path

## GAP-F100-03-04

**The cron test file exists but the recovery path has no scenario recorded as run in any file I read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: Affects: Operations. Work needed: Run the scenario above and record the result.
- Evidence: apps/web/app/api/cron/recover-reservations/route.test.ts exists; no result file

## GAP-F100-03-05

**Late settlement can be rejected and the cost absorbed with only a log line.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-03](../../20-features/100-commercial-and-administrative-components/F100-03-metered-usage-ledger-reserve-settle-release-cost.md)
- Detail: Affects: Margin. Work needed: Add an alert or a daily count of absorbed costs.
- Evidence: managed-usage-request-service.ts:1115-1128

## GAP-F100-04-01

**The brief says a daily reconciliation keeps the plan in step; the job only reports differences and repairs nothing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Detail: Affects: Operations and customers whose plan drifts. Work needed: State this in the brief; add a runbook for drift or an optional repair step.
- Evidence: cron/reconcile-billed-plans/route.ts:36-40 (report text 'Nothing was repaired automatically'), 71-160

## GAP-F100-04-02

**The brief's checkout line numbers (392, 414, 420-430) and handlers.ts:133-140 do not match the file; the guards are at 391-428 and the subscription cases at 135-146.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Detail: Affects: Engineers following the brief. Work needed: Refresh the brief pointers.
- Evidence: checkout/route.ts:391-428; handlers.ts:135-146

## GAP-F100-04-03

**Purchase is gated for accounts that are not already paying, which the brief does not mention.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Detail: Affects: All new web buyers. Work needed: None to code; add the gate to the brief's use text.
- Evidence: checkout/route.ts:297-310; doc: docs/product/commercial.md (Paid Acquisition Gate)

## GAP-F100-04-04

**Tax on the mid-cycle upgrade path was not found, so 'tax for every charge' is established only for checkout and top-up.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Detail: Affects: Existing subscribers changing plan. Work needed: Read the upgrade route and the Stripe subscription tax settings and record the result.
- Evidence: apps/web/app/api/upgrade/route.ts (no tax parameters found by search)

## GAP-F100-04-05

**The brief says a 'pending confirmation screen' waits; the component is invisible and the visible screen is UpgradeWelcome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Detail: Affects: Testers writing steps. Work needed: Correct the wording in tests and docs.
- Evidence: PendingCheckoutConfirmation.tsx:69; UpgradeWelcome.tsx:96-114

## GAP-F100-05-01

**The brief says the catalog needs an upgrade-waitlist redemption. The code and its tests say it does not.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-05](../../20-features/100-commercial-and-administrative-components/F100-05-mobile-store-purchases-apple-and-google.md)
- Detail: Affects: Testers and planners relying on the brief. Work needed: Remove the stale note from the brief.
- Evidence: apps/web/app/api/mobile/iap/catalog/__tests__/route.test.ts:156-159; verify/__tests__/route.test.ts:242-245; docs/product/commercial.md (Paid Acquisition Gate)

## GAP-F100-05-02

**There are three independent switches (build flag, deployment variable, kill switch) and verify checks none of the last two directly.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-05](../../20-features/100-commercial-and-administrative-components/F100-05-mobile-store-purchases-apple-and-google.md)
- Detail: Affects: surface:mobile. Work needed: Decide whether verify must refuse when the catalog is off, and add a test.
- Evidence: storePurchases.json:2; mobile-iap-catalog.ts:53-56; catalog/route.ts:71-80; verify/route.ts:53-114

## GAP-F100-05-03

**Selling is switched off, so the whole flow is unverified against the real stores.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-05](../../20-features/100-commercial-and-administrative-components/F100-05-mobile-store-purchases-apple-and-google.md)
- Detail: Affects: surface:mobile. Work needed: Run the sandbox scenarios on both stores before turning it on.
- Evidence: storePurchases.json:2; docs/product/commercial.md (Launch Posture)

## GAP-F100-05-04

**The brief points the verify route at line 50 and the catalog at 83; the files differ (verify handler 53-114, catalog handler 41-187).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-05](../../20-features/100-commercial-and-administrative-components/F100-05-mobile-store-purchases-apple-and-google.md)
- Detail: Affects: Engineers following the brief. Work needed: Refresh the brief pointers.
- Evidence: verify/route.ts:53; catalog/route.ts:41

## GAP-F100-06-01

**The brief says refunds and disputes are started by staff or the provider, not the person. In the code a customer can file a refund request and many cases settle automatically.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-06](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Detail: Affects: Testers and writers of help text. Work needed: Correct the brief's use text.
- Evidence: api/billing/refund-requests/route.ts:75-137; billing-refund-service.ts:713-775

## GAP-F100-06-02

**The brief says the invoice service produces invoices. The code only lists Stripe's invoices; it produces none and stores none.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-06](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Detail: Affects: Engineers. Work needed: Reword the requirement to listing and linking.
- Evidence: billing-invoice-service.ts:38-102

## GAP-F100-06-03

**Store-billed and organization invoices are not listed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-06](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Detail: Affects: surface:mobile customers and workspace owners. Work needed: Decide where those documents live and link them.
- Evidence: apps/web/app/billing/invoices/page.tsx:28-30

## GAP-F100-06-04

**Invoice listing stops at 24 and has no paging.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-06](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Detail: Affects: Long-time subscribers. Work needed: Add paging or a link to the portal in every case.
- Evidence: billing-invoice-service.ts:29; InvoiceList.tsx:117-122

## GAP-F100-06-05

**The brief's line numbers (billing-refund-service.ts:580, 764; dispute-events.ts:431) do not point to the credit reversal; that lives in refund-events.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-06](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Detail: Affects: Engineers following the brief. Work needed: Refresh the brief pointers.
- Evidence: refund-events.ts:147-250

## GAP-F100-06-06

**Early fraud warnings are recorded but trigger no action.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-06](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Detail: Affects: Risk handling. Work needed: Owner decision on the risk response.
- Evidence: handlers.ts:325-365

## GAP-F100-07-01

**Referral reward, clawback and promotion application write no audit event.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-07](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Detail: Affects: Finance and admins on the web.. Work needed: Add audit events for grant, block and clawback.
- Evidence: No recordAuditEvent in apps/web/lib/services/referral-service.ts or apps/web/app/api/stripe-webhook/lib/referral-events.ts.

## GAP-F100-07-02

**Invite grants named in the brief have no code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-07](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Detail: Affects: All apps.. Work needed: Decide whether invite grants are wanted; build or drop the wording.
- Evidence: Search for invite_grant found nothing in apps/web.

## GAP-F100-07-03

**Mobile, VS Code and Chrome have no referral entry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-07](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Detail: Affects: Mobile, VS Code, Chrome.. Work needed: Open the web page from each app or show the link.
- Evidence: Only bonus credit text in apps/mobile/src/features/settings/cloud-usage/index.tsx:382.

## GAP-F100-07-04

**Brief line numbers for S100.22 are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-07](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Detail: Affects: Documentation readers.. Work needed: Refresh the brief.
- Evidence: apps/web/app/api/checkout/route.ts:407 is error handling.

## GAP-F100-07-05

**No evidence any test or run covers a real Stripe promotion in upgrade.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-07](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Detail: Affects: Web upgrade.. Work needed: Add a route test with a stubbed Stripe promotion list.
- Evidence: Test files read do not name promotion in titles seen.

## GAP-F100-08-01

**No seat, invitation or admin management in desktop, mobile, CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-08](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md)
- Detail: Affects: All non-web apps.. Work needed: Decide hand-off to web or native screens.
- Evidence: No client code found for settings/team routes except mobile references not read.

## GAP-F100-08-02

**Usage analytics and its export cannot be reached with a workspace key.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-08](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md)
- Detail: Affects: Admin automation.. Work needed: Add route access declarations if wanted.
- Evidence: apps/web/lib/server/service-principals/route-access.ts lists usage-report but not usage-analytics.

## GAP-F100-08-03

**Two invitation routes exist (team and organization).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-08](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md)
- Detail: Affects: Web maintainers.. Work needed: Confirm why both exist and share logic.
- Evidence: apps/web/app/api/settings/team/invitations/route.ts and apps/web/app/api/settings/organization/invitations/route.ts.

## GAP-F100-08-04

**Seat service has no single 'assign a seat' step; seats follow membership by trigger.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-08](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md)
- Detail: Affects: Brief wording 'assigns them to members'.. Work needed: Clarify the wording or the model.
- Evidence: apps/web/db/neon/0085_organization_seats_lifecycle.sql

## GAP-F100-09-01

**Desktop, mobile and Chrome history screens are not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-09](../../20-features/100-commercial-and-administrative-components/F100-09-usage-reporting-and-export.md)
- Detail: Affects: Desktop, mobile, Chrome.. Work needed: Confirm or build history views.
- Evidence: apps/desktop/src/api/cloudApi.ts:366 uses /api/usage only.

## GAP-F100-09-02

**Personal export does not mark cut-off breakdowns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-09](../../20-features/100-commercial-and-administrative-components/F100-09-usage-reporting-and-export.md)
- Detail: Affects: Web users with many models.. Work needed: Add omitted markers.
- Evidence: apps/web/app/api/usage/export/route.ts has no omitted lines.

## GAP-F100-09-03

**Local inference usage is not reported anywhere in this feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-09](../../20-features/100-commercial-and-administrative-components/F100-09-usage-reporting-and-export.md)
- Detail: Affects: Desktop and mobile Local users.. Work needed: Decide whether on-device usage should be shown, separately and unmetered.
- Evidence: History reads only managed_usage_requests.

## GAP-F100-09-04

**Workspace usage analytics is not reachable with workspace keys.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-09](../../20-features/100-commercial-and-administrative-components/F100-09-usage-reporting-and-export.md)
- Detail: Affects: Admin automation.. Work needed: Add an access entry or document usage-report as the route.
- Evidence: apps/web/lib/server/service-principals/route-access.ts:96-100.

## GAP-F100-10-01

**No caller or screen creates agreements; the draft's 'internal tools' were not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-10](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Detail: Affects: Sales and staff; all apps.. Work needed: Build or document the staff path, with audit and confirmation.
- Evidence: authorCommercialAgreementVersion and recordSignedOrder appear only in tests, index.ts and docs.

## GAP-F100-10-02

**Brief says the invoicing module builds invoices; it reads and reconciles them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-10](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Detail: Affects: Documentation.. Work needed: Correct the brief wording.
- Evidence: apps/web/lib/services/enterprise-contracts/invoicing.ts:101-198

## GAP-F100-10-03

**No contract view outside the web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-10](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Detail: Affects: Desktop, mobile, CLI, VS Code, Chrome.. Work needed: Decide if a link is enough.
- Evidence: No client code found.

## GAP-F100-10-04

**Retention of contract and payment records is not stated in files read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-10](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Detail: Affects: Compliance.. Work needed: Read and document.
- Evidence: apps/web/lib/billing/financial-record-retention.ts not read.

## GAP-F100-11-01

**No ticket creation or list on CLI, VS Code or Chrome; desktop links to the web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-11](../../20-features/100-commercial-and-administrative-components/F100-11-support-cases.md)
- Detail: Affects: Desktop, CLI, VS Code, Chrome.. Work needed: Decide whether to add native clients.
- Evidence: No client code found; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:171.

## GAP-F100-11-02

**Ticket actions write no audit event.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-11](../../20-features/100-commercial-and-administrative-components/F100-11-support-cases.md)
- Detail: Affects: Admins and compliance.. Work needed: Audit staff reads and replies.
- Evidence: No recordAuditEvent in apps/web/lib/support/tickets/service.ts or apps/web/app/api/support/tickets/route.ts.

## GAP-F100-11-03

**Mobile test coverage covers a help link only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-11](../../20-features/100-commercial-and-administrative-components/F100-11-support-cases.md)
- Detail: Affects: Mobile.. Work needed: Add tests for the screens.
- Evidence: apps/mobile/src/features/support/__tests__ has one file.

## GAP-F100-11-04

**Data retention for tickets is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-11](../../20-features/100-commercial-and-administrative-components/F100-11-support-cases.md)
- Detail: Affects: Privacy.. Work needed: Document retention and erasure.
- Evidence: Not found in files read.

## GAP-F100-12-01

**Audit write failures are swallowed for most events.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-12](../../20-features/100-commercial-and-administrative-components/F100-12-audit-trail.md)
- Detail: Affects: Web admins and compliance.. Work needed: Decide which events must fail closed or retry.
- Evidence: apps/web/lib/security-audit.ts:690-694, 715-730.

## GAP-F100-12-02

**Referral rewards, bonus credit grants and support ticket staff actions write no events.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-12](../../20-features/100-commercial-and-administrative-components/F100-12-audit-trail.md)
- Detail: Affects: Finance and compliance.. Work needed: Add events.
- Evidence: No recordAuditEvent in apps/web/lib/services/referral-service.ts, referral-events.ts or lib/support/tickets/service.ts.

## GAP-F100-12-03

**No audit viewing outside web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-12](../../20-features/100-commercial-and-administrative-components/F100-12-audit-trail.md)
- Detail: Affects: Desktop, mobile, CLI, VS Code, Chrome.. Work needed: Link to web if needed.
- Evidence: No client code found.

## GAP-F100-12-04

**Retention period of audit rows is not stated in files read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-12](../../20-features/100-commercial-and-administrative-components/F100-12-audit-trail.md)
- Detail: Affects: Compliance.. Work needed: Read and record.
- Evidence: Migration 0167 name only.

## GAP-F100-12-05

**The brief cites security-audit.ts:641 for 'commercial actions write audit events'; that line is inside the generic writer, not a billing list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F100-12](../../20-features/100-commercial-and-administrative-components/F100-12-audit-trail.md)
- Detail: Affects: Documentation.. Work needed: Update the brief.
- Evidence: apps/web/lib/security-audit.ts:610-650.
