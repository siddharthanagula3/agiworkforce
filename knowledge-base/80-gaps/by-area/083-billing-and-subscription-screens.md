---
id: "GAPS-AREA-083"
type: "gap-list"
title: "Gaps: Billing and subscription screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 83. Billing and subscription screens

86 open gaps that touch this area. Area page: [20-features/083-billing-and-subscription-screens](../../20-features/083-billing-and-subscription-screens/README.md).

## CMP-MP12

**Subscription bought on another platform alert**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md), [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Detail: There is no pop-up alert The Billing row says where the plan is managed (web, store, organization); there is no pop-up alert.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:378

## CMP-MP9

**List of what each plan includes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: 'What your plan includes' lists only the current plan's benefits 'What your plan includes' lists only the current plan's benefits; the side-by-side plan list is hidden with purchases off.
- Evidence: apps/mobile/src/features/settings/plans/index.tsx:100

## CMP-W29

**Annual billing for individual plans**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: Individual plans are monthly only; yearly prices exist only for Team.
- Evidence: packages/contracts/types/src/billing-catalog.ts:229-231 (individual tiers: yearlyPriceUsd?: never)

## CMP-W31

**Buy an Enterprise plan online without sales**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md), [F100-08](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md), [F100-10](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Detail: Enterprise has no checkout; it starts with a sales conversation.
- Evidence: apps/web/app/faq/page.tsx:94; packages/contracts/types/src/billing-catalog.ts:225-228 (contractPriced)

## CMP-W53

**Regional payment methods (UPI, Pix, bank debit)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md), [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: Checkout is cards only.
- Evidence: apps/web/lib/server/payments/stripe-provider.ts:260

## CMP-WP17

**Add a tax or VAT ID and a different invoice name**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md), [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: Sales are paused and no separate invoice name is built Checkout asks for a tax ID, but sales are paused and no separate invoice name is built.
- Evidence: apps/web/lib/billing/tax-policy.ts:34-63

## CMP-WP21

**Local payment methods beyond cards (UPI, MoMo, ACH)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md), [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: Checkout does not name payment methods in code Checkout does not name payment methods in code; which local methods appear is left to the payment provider.
- Evidence: apps/web/app/api/checkout/route.ts; searched: payment_method_types in apps/web/app/api/checkout

## CMP-WP24

**Billing information edit (email, name, address)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md), [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: No editable form in the pane Handled inside the billing portal opened by Manage billing; no editable form in the pane.
- Evidence: apps/web/features/settings/sections/BillingSection.tsx:893

## CMP-WP29

**Tax exemption request**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md), [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: No self-service exemption request for personal or Team plans Enterprise contracts record tax-exempt status; no self-service exemption request for personal or Team plans.
- Evidence: apps/web/lib/services/enterprise-billing-service.ts:344

## GAP-AREA083-LW02

**Credit notes (S83.19) have no screen or route in the web billing code I searched.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-083
- Detail: Area 83. Billing and subscription screens
- Evidence: apps/web/features/settings/sections/BillingSection.tsx

## GAP-AREA083-LW03

**Payment method management is read-only with a Default tag; add, set default, update and remove all go through the hosted portal, not in-product controls as 'Should' reads.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-083
- Detail: Area 83. Billing and subscription screens
- Evidence: apps/web/features/settings/sections/BillingSection.tsx:923 and apps/web/app/api/billing/payment-methods/route.ts:80

## GAP-AREA083-LW04

**On a first purchase the in-product screen says 'Tax is calculated at checkout', so tax and total are not shown before leaving for the hosted page (they are shown for mid-cycle upgrades).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-083
- Detail: Area 83. Billing and subscription screens
- Evidence: apps/web/features/billing/components/UpgradeOrderPanel.tsx:391

## GAP-AREA083-LW05

**A user with no access code cannot start any paid checkout, including Team seats; this is an owner decision but contradicts 'a signed-in user can start and complete a paid upgrade'.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-083
- Detail: Area 83. Billing and subscription screens
- Evidence: apps/web/app/api/checkout/route.ts:325 and apps/web/lib/server/billing-waitlist-access.ts:41

## GAP-AREA083-LW07

**A failed save of the Stripe customer link after creating the customer is only logged, not shown to the user.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-083
- Detail: Area 83. Billing and subscription screens
- Evidence: apps/web/app/api/checkout/route.ts:340

## GAP-AREA083-LW08

**Fallback that finds a customer by email in the portal route is labelled deprecated and a security warning.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-083
- Detail: Area 83. Billing and subscription screens
- Evidence: apps/web/app/api/portal/route.ts:218

## GAP-AREA083-LW09

**Checkout error text for an invalid checkout setup is generic ('Invalid checkout configuration. Please contact support.'), which does not tell the user how to fix it.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-083
- Detail: Area 83. Billing and subscription screens
- Evidence: apps/web/app/api/checkout/route.ts:594

## GAP-CAP-subscriptions-and-plans-03

**Annual billing for individual plans: No yearly price for Basic, Premium, Max or Ultra.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Requirement items: S81.17, S83.02
- Detail: Claude yes, ChatGPT no; AGI partly built

## GAP-CAP-subscriptions-and-plans-04

**Plan comparison and plan-gated feature explanations: Seen defect: Basic plan card 'What changes' omits scheduled tasks (W-16). Mobile list partial (MP9). Chrome unverified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-01](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md), [F081-04](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md), [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Requirement items: S81.09, S81.28, S83.01
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-05

**Buying or upgrading a paid plan: By decision, no live paid purchase. Checkout never run against a real sale; paid-launch gate evidence not accepted yet.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md), [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md), [F100-04](../../20-features/100-commercial-and-administrative-components/F100-04-buying-a-plan-and-paying.md)
- Requirement items: S100.14, S83.03, S83.28
- Detail: Claude yes, ChatGPT yes; AGI off by decision

## GAP-CAP-subscriptions-and-plans-06

**Mid-cycle upgrade with proration: None known beyond the purchase gate.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md)
- Requirement items: S81.23, S83.05
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-subscriptions-and-plans-07

**Downgrade at end of period: Doc and ledger disagree on whether downgrade is a built path; needs a live test.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-09](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Requirement items: S81.24, S83.04
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-subscriptions-and-plans-08

**Cancel, end-of-term access and resume: None known in code; not seen live.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-09](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Requirement items: S83.21, S83.22, S83.23, S83.24
- Detail: Claude yes, ChatGPT yes; AGI built

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

## GAP-CAP-subscriptions-and-plans-11

**Payment methods, billing address, tax ID and local currency: Billing-information edit partial (WP24), UPI/Pix/bank debit missing (W53), tax-exemption request partial (WP29).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md), [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Requirement items: S83.06, S83.09, S83.10, S83.11, S83.12
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-12

**Invoices, receipts and billing history: Credit-note display (S83.19) and auto-reload history (S83.33) missing on every app; mobile shows no credit purchases (S83.32).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Requirement items: S83.16, S83.17, S83.18, S83.19, S83.20, S83.32, S83.33
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-13

**Refunds and legal withdrawal rights: None known in code; legal copy under owner and legal review.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md), [F100-06](../../20-features/100-commercial-and-administrative-components/F100-06-invoices-refunds-and-disputes.md)
- Requirement items: S100.19, S83.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-14

**Failed payment and grace handling: Billing says Active while the period ended and no credits exist (W-12, W-14, W-19). The error says to check Billing, which shows no period or renewal date.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-06](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md), [F083-07](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Requirement items: S81.25, S83.14, S83.15
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-18

**Promotions, promo codes and trials: Promo path off while purchasing is gated; not seen live.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-07](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md), [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md), [F083-05](../../20-features/083-billing-and-subscription-screens/F083-05-trial-terms.md), [F100-07](../../20-features/100-commercial-and-administrative-components/F100-07-promotions-and-referrals.md)
- Requirement items: S100.22, S100.23, S81.18, S81.19, S83.07, S83.08
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-20

**Team plan with standard and premium seats: Team purchase closed by the waitlist; premium seats not sold in every interval or currency (checkout route messages).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F081-05](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md), [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Requirement items: S81.16, S83.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-subscriptions-and-plans-21

**Team seat assignment and billing administration: None known; not run live.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Requirement items: S83.29, S83.30
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-subscriptions-and-plans-23

**Enterprise plan with contract and invoice billing: Self-serve Enterprise (a Claude-only option) not built; launch needs SSO and SCIM and a managed-credit ledger per commercial.md.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md), [F100-08](../../20-features/100-commercial-and-administrative-components/F100-08-seats-team-admin-and-admin-api.md), [F100-10](../../20-features/100-commercial-and-administrative-components/F100-10-enterprise-contracts.md)
- Requirement items: S100.21, S100.25, S83.30, S83.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F083-01-01

**Mobile 'compare plans' is a single-plan screen in the shipped build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: Affects: Mobile users (all plans). Work needed: Decide whether purchases-off mobile should list other plans read-only, or change the brief status to partial.
- Evidence: apps/mobile/src/features/settings/plans/index.tsx:100-108; apps/mobile/src/features/billing/storePurchases.json

## GAP-F083-01-02

**CLI, VS Code and Chrome only link to the web comparison; VS Code has its own pick list without prices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: Affects: CLI, Chrome users. Work needed: None required by the brief (n/a); record as link-out.
- Evidence: apps/cli/src/usage_summary.rs:201; apps/extension/src/side_panel.ts:12083

## GAP-F083-01-03

**Two flags (client and server) must be kept equal by hand.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: Affects: Web and Desktop. Work needed: A guard or a single source for both flags [proposed].
- Evidence: apps/web/features/billing/lib/localized-pricing.ts:20-24

## GAP-F083-01-04

**Desktop 'done' depends on the hosted page; no test records the Electron window showing /pricing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: Affects: Desktop. Work needed: Drive the Electron window to /pricing and record the result.
- Evidence: no Electron test found for /pricing in apps/desktop/electron/__tests__ (not exhaustively searched)

## GAP-F083-01-05

**The brief says checkout-off is explained by a toast; the page also shows a visible notice and disables the button, so the toast is only a backup.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-01](../../20-features/083-billing-and-subscription-screens/F083-01-compare-plans-and-pick-monthly-or-yearly.md)
- Detail: Affects: Web, Desktop. Work needed: Update the brief wording.
- Evidence: apps/web/app/pricing/page.tsx:441,626,972-976

## GAP-F083-02-01

**No unit test found for PendingCheckoutConfirmation or pending-checkout storage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md)
- Detail: Affects: Web and Desktop. Work needed: Add tests for the 30 s poll and the redirect.
- Evidence: No test file referencing PendingCheckoutConfirmation found under apps/web

## GAP-F083-02-02

**The draft says the confirmation moves the user to /billing after return; in code it does nothing on /billing itself (the return page does the polling).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md)
- Detail: Affects: Documentation. Work needed: Describe the two confirmation paths separately.
- Evidence: apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:24-28

## GAP-F083-02-03

**Mobile purchase is off; the confirmation and restore paths have never been shown as run in a store build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md)
- Detail: Affects: Mobile. Work needed: Owner switch-on plus store products live (brief S83.03 unfinished), then run on devices.
- Evidence: apps/mobile/src/features/billing/storePurchases.json; apps/mobile/lib/v1FeatureFlags.ts:8

## GAP-F083-02-04

**First-time Team purchase is blocked by the waitlist gate on web and Desktop by owner decision.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md)
- Detail: Affects: Web, Desktop. Work needed: Owner opens upgrades (AGI_BILLING_WAITLIST_OPEN or operator flag).
- Evidence: apps/web/lib/server/billing-waitlist-access.ts:42-54; doc: docs/product/commercial.md:56-72

## GAP-F083-02-05

**No record of a live end-to-end checkout run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md)
- Detail: Affects: All web buyers. Work needed: Run and record a test-mode purchase.
- Evidence: No file in the repository records one that was read

## GAP-F083-02-PARTLY

**Start a paid plan (checkout, access gate, confirmation): partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F083-02](../../20-features/083-billing-and-subscription-screens/F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md)
- Requirement items: S83.03, S83.13
- Detail: Mobile S83.03: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built | Mobile S83.13: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## GAP-F083-03-01

**Brief says mobile shows proration wording; none found in mobile source.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md)
- Detail: Affects: Mobile. Work needed: Correct the brief or add the wording to the purchase branch.
- Evidence: grep for 'prorat' and 'unused time' in apps/mobile/src, app, lib found only tests and an unrelated delete-account file

## GAP-F083-03-02

**The order screen button reads 'Subscribe to <plan>' even for a proration upgrade.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md)
- Detail: Affects: Web, Desktop. Work needed: Wording change [proposed].
- Evidence: apps/web/features/billing/components/UpgradeOrderPanel.tsx:584

## GAP-F083-03-03

**Whether the 'next renewal' date line always shows depends on Stripe returning a period end; the dialog falls back to 'Then <price> at each renewal'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md)
- Detail: Affects: Web, Desktop. Work needed: None required; fallback exists.
- Evidence: apps/web/features/billing/components/UpgradeConfirmDialog.tsx:382-386

## GAP-F083-03-04

**No live run records a real prorated charge matching the preview.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-03](../../20-features/083-billing-and-subscription-screens/F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md)
- Detail: Affects: Web, Desktop. Work needed: Run in Stripe test mode and record.
- Evidence: No such record found

## GAP-F083-04-01

**The brief says billing address and tax ID can be updated; the code opens the provider portal, but what the portal allows is a provider setting not visible here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md)
- Detail: Affects: Web, Desktop. Work needed: Check the portal configuration and record it.
- Evidence: apps/web/app/api/portal/route.ts:326-343 (portal session created without a configuration id)

## GAP-F083-04-02

**Mobile has no tax display in the shipped build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md)
- Detail: Affects: Mobile. Work needed: None until store purchase is switched on.
- Evidence: storePurchases.json nativePurchases false

## GAP-F083-04-03

**No test shows the hosted page asking for the full address and tax ID in a live session.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md)
- Detail: Affects: Web, Desktop. Work needed: Run a test-mode checkout and record it.
- Evidence: Tests assert parameters only (apps/web/lib/billing/tax-policy.test.ts)

## GAP-F083-04-PARTLY

**Tax, billing address and tax ID: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F083-04](../../20-features/083-billing-and-subscription-screens/F083-04-tax-billing-address-and-tax-id.md)
- Requirement items: S83.06
- Detail: Mobile S83.06: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## GAP-F083-05-01

**No catalog plan sets trialDays, so plan trials never appear; only referral trials for Premium.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-05](../../20-features/083-billing-and-subscription-screens/F083-05-trial-terms.md)
- Detail: Affects: Web, Desktop. Work needed: Owner decision whether any plan should offer a trial.
- Evidence: packages/contracts/types/src/billing-catalog.ts:150,1048 (type and reader only); apps/web/app/api/checkout/route.trial.test.ts:131

## GAP-F083-05-02

**The draft listed 'Free trial ends..., then renews unless you cancel' for mobile as live; it is compiled off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-05](../../20-features/083-billing-and-subscription-screens/F083-05-trial-terms.md)
- Detail: Affects: Mobile. Work needed: Correct the brief.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:351,520-523

## GAP-F083-05-03

**The reminder cron has no record of a live run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-05](../../20-features/083-billing-and-subscription-screens/F083-05-trial-terms.md)
- Detail: Affects: Web. Work needed: Run once in test mode and record.
- Evidence: No record found

## GAP-F083-06-01

**Non-card payment methods are hidden by the card filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: Affects: Web, Desktop users paying with Link or other methods. Work needed: List non-card methods too.
- Evidence: apps/web/features/settings/sections/BillingSection.tsx:603-605 versus the all-types list at apps/web/app/api/billing/payment-methods/route.ts:75-80

## GAP-F083-06-02

**What users can do in the portal (add, remove, default) is provider configuration and was not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: Affects: Web, Desktop. Work needed: Check the Stripe portal configuration and record it.
- Evidence: apps/web/app/api/portal/route.ts:424-428 creates a session with no configuration id

## GAP-F083-06-03

**Brief names the section 'Payment methods'; the heading in code is 'Payment'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: apps/web/features/settings/sections/BillingSection.tsx:938

## GAP-F083-06-04

**No payment method view on mobile in the shipped build; web-billed users only see 'Managed on the web'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-06](../../20-features/083-billing-and-subscription-screens/F083-06-payment-methods.md)
- Detail: Affects: Mobile. Work needed: None per decision D-2026-09-28-27 (link out), but the link is not shown unless purchases are on.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:376-388

## GAP-F083-07-01

**Mobile gives no way to fix a failed payment in the shipped build; only a sentence is shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-07](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Detail: Affects: Mobile users with a past-due plan. Work needed: Add a link or instruction to web billing in the reduced screen where store rules allow, or turn on native purchases (owner decision).
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:351-410; apps/mobile/src/features/billing/storePurchases.json:2

## GAP-F083-07-02

**The brief calls mobile payment failure fully 'done' but the recovery rows are not reachable in the shipped build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-07](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Detail: Affects: Mobile. Work needed: Correct the brief status to partial.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:351; knowledge-base/data/area-briefs/083-billing-and-subscription-screens.md (S83.14)

## GAP-F083-07-03

**Chrome shows a generic message for unpaid instead of the past-due wording.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-07](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Detail: Affects: Chrome users with an unpaid plan. Work needed: Add a specific unpaid string.
- Evidence: apps/extension/src/side_panel.ts:13434-13437

## GAP-F083-07-04

**'Pay now' depends on the latest 24 invoices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-07](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Detail: Affects: Web and Desktop accounts with many invoices. Work needed: Query open invoices directly.
- Evidence: apps/web/lib/services/billing-invoice-service.ts:26; BillingSection.tsx:606-613

## GAP-F083-07-05

**No past-due notice for Enterprise contract plans in Settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-07](../../20-features/083-billing-and-subscription-screens/F083-07-payment-failure-and-retry.md)
- Detail: Affects: Enterprise admins. Work needed: Decide the invoice-based remedy (see F083-11) and surface it; owner decision needed.
- Evidence: apps/web/features/billing/components/BillingPlanNotices.tsx:115

## GAP-F083-08-01

**Credit notes are not shown anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Read credit notes from the provider and add a table beside invoices.
- Evidence: No credit_note or Credit note text in apps/web app, features or lib; brief S83.19 missing

## GAP-F083-08-02

**No dedicated automatic-reload history; only an 'Auto-reload' tag on purchases.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: A filtered list or section for reload purchases and failed reload attempts.
- Evidence: apps/web/features/billing/components/BillingPaymentHistory.tsx:125-127; brief S83.33

## GAP-F083-08-03

**Mobile has no download, refund status or credit ledger; 'View invoices' is unreachable in the shipped build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Detail: Affects: Mobile. Work needed: Add a read-only credit history from /api/billing/credit-history and web links where store rules allow.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:351,844; storePurchases.json:2

## GAP-F083-08-04

**Settings invoices table lacks the PDF link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Detail: Affects: Web and Desktop. Work needed: Add the PDF link.
- Evidence: BillingSection.tsx:1123-1140 versus InvoiceList.tsx:145-162

## GAP-F083-08-05

**Brief says invoices show a Receipt link and a 'Payment history' heading; the code uses 'View'/'Pay' and the headings 'Credit purchases' and 'Refunds'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Detail: Affects: Documentation. Work needed: Correct the brief wording.
- Evidence: BillingPaymentHistory.tsx:86,150; no 'Payment history' string found in apps/web app or features

## GAP-F083-08-NOTBUILT

**Billing history, invoices, receipts, refunds and credit purchases: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F083-08](../../20-features/083-billing-and-subscription-screens/F083-08-billing-history-invoices-receipts-refunds-and-cred.md)
- Requirement items: S83.19, S83.33
- Detail: Web: S83.19, S83.33; Desktop: S83.19, S83.33; Mobile: S83.19, S83.33

## GAP-F083-09-01

**Mobile and VS Code have no resume or downgrade review; they show a date only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-09](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Detail: Affects: Mobile, VS Code. Work needed: Link each to the exact web action, or add native review where store rules allow.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:519; apps/extension-vscode/src/core/commandSetup.ts:2418-2420

## GAP-F083-09-02

**Mobile cancel/resume text and rows are not reachable in the shipped build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-09](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Detail: Affects: Mobile. Work needed: Owner decision on native purchases; until then, the reduced screen shows 'Access ends' only.
- Evidence: apps/mobile/src/features/billing/storePurchases.json:2; cloud-billing/index.tsx:351

## GAP-F083-09-03

**docs/product/commercial.md says downgrade is not a code path, but the code has a scheduled downgrade.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-09](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Detail: Affects: Documentation. Work needed: Rewrite that paragraph; code wins.
- Evidence: doc: docs/product/commercial.md:160; apps/web/app/api/billing/downgrade-preview/route.ts:70-98

## GAP-F083-09-04

**Team and Enterprise plans have no self-serve cancel or downgrade review.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-09](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Detail: Affects: Workspace owners. Work needed: Decide the intended path (contact sales or portal).
- Evidence: downgrade-preview/route.ts:30-32; mobile test CloudBillingPage.test.tsx:398

## GAP-F083-09-05

**CLI and Chrome show no scheduled-cancellation information.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-09](../../20-features/083-billing-and-subscription-screens/F083-09-cancel-resume-downgrade-and-end-of-term.md)
- Detail: Affects: CLI, Chrome. Work needed: Decide whether they need a one-line notice.
- Evidence: No cancel_at_period_end use found in apps/cli/src/usage_summary.rs or apps/extension/src (search done for cancel text in side_panel only)

## GAP-F083-10-01

**Restore purchases and the duplicate warning alert are not visible on the shipped mobile build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md)
- Detail: Affects: Mobile. Work needed: Owner switches nativePurchases on with a new store build and review, and the server sets MOBILE_IAP_ENABLED with live products (doc: docs/product/commercial.md:66-70).
- Evidence: apps/mobile/src/features/billing/storePurchases.json:2; cloud-billing/index.tsx:351

## GAP-F083-10-02

**The brief's switch-on instruction names FEATURES.billing, which is not the purchase switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md)
- Detail: Affects: Documentation, release team. Work needed: Correct S83.03, S83.06, S83.13 and S83.25 notes.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:6; cloud-billing/index.tsx:199; storePurchases.json:2

## GAP-F083-10-03

**Mobile shows the owner for a web-billed plan without a link unless storefront rules allow.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md)
- Detail: Affects: Mobile non-US users. Work needed: None required; it is a store rule. Keep wording clear.
- Evidence: apps/mobile/src/features/billing/webBillingLinks.ts:6-9

## GAP-F083-10-04

**VS Code, CLI and Chrome do not explain store ownership or offer the store link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide if a one-line owner message is needed.
- Evidence: No store management URL use found in those apps' billing code searched

## GAP-F083-10-PARTLY

**Store-billed plans, duplicate-subscription warning and purchase restore: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F083-10](../../20-features/083-billing-and-subscription-screens/F083-10-store-billed-plans-duplicate-subscription-warning.md)
- Requirement items: S83.25
- Detail: Mobile S83.25: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## GAP-F083-11-01

**First Team purchase is blocked by the upgrade-access gate for accounts without a redeemed access code while upgrades are staged.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Detail: Affects: Web, Desktop and any API caller. Work needed: Owner opens paid upgrades (AGI_BILLING_WAITLIST_OPEN or the run-time switch); no code change.
- Evidence: apps/web/app/api/checkout/route.ts:293-307; apps/web/lib/server/billing-waitlist-access.ts:42-52; brief S83.28

## GAP-F083-11-02

**No UI for recording or listing offline payments; API only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Detail: Affects: Enterprise admins and operators. Work needed: Add a screen or document the operator procedure in the runbook.
- Evidence: use-enterprise-contract.ts:17; no component posts report_offline_payment; route supports it at billing-contract/route.ts:176-204

## GAP-F083-11-03

**Migration 0288 is marked 'NOT YET APPLIED : draft only' and the header names 0287.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Detail: Affects: Enterprise offline payments in production. Work needed: Confirm applied status with the migration status command, then fix the header text via a new migration note, not by editing an applied file.
- Evidence: apps/web/db/neon/0288_enterprise_offline_payment_records.sql:1-6

## GAP-F083-11-04

**The brief calls Desktop seat purchase 'partial' but Desktop shows the hosted web app, so it equals Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Detail: Affects: Documentation. Work needed: Correct the brief wording.
- Evidence: apps/desktop/electron/config.ts:17,103

## GAP-F083-11-05

**No dedicated seat assignment screen; seats follow invitations and membership.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Detail: Affects: Workspace admins. Work needed: Decide whether the brief's 'assign seats' needs a separate control.
- Evidence: invitations/route.ts:81-88

## GAP-F083-11-06

**Mobile brief line for seats points to the wrong line.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Detail: Affects: Documentation. Work needed: Fix the reference.
- Evidence: brief cites workspace.tsx:268; seat text is at workspace.tsx:578

## GAP-F083-11-PARTLY

**Team seats and enterprise billing: partly built on Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F083-11](../../20-features/083-billing-and-subscription-screens/F083-11-team-seats-and-enterprise-billing.md)
- Requirement items: S83.28
- Detail: Desktop S83.28: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades
