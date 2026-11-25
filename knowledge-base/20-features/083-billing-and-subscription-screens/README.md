---
id: "AREA-083"
type: "area"
title: "Billing and subscription screens"
features: ["F083-01", "F083-02", "F083-03", "F083-04", "F083-05", "F083-06", "F083-07", "F083-08", "F083-09", "F083-10", "F083-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 83. Billing and subscription screens

This area is where a person chooses a paid plan, pays for it, changes or cancels it, and looks back at what they paid. It also covers credit top-ups, team seats and enterprise contract billing. It matters because it is the only path to paid Cloud plans, and a wrong charge, a missing receipt or a stuck cancellation costs real money and trust.

**Who uses it.** Every signed-in user can see plans and Billing. Only Cloud users pay: Local and own-key use need no plan. Paid checkout is currently gated: a user with no live paid plan needs an access code (a row in beta_redemptions) or the operator switch open, otherwise the server answers 403. Team seat and contract screens are for workspace admins with billing permission. Mobile only shows plan status, because in-app purchases are compiled off.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F083-01](F083-01-compare-plans-and-pick-monthly-or-yearly.md) | Compare plans and pick monthly or yearly | built | built | built | n/a | n/a | n/a |
| [F083-02](F083-02-start-a-paid-plan-checkout-access-gate-confirmatio.md) | Start a paid plan (checkout, access gate, confirmation) | built | built | partly | n/a | n/a | n/a |
| [F083-03](F083-03-upgrade-a-live-plan-with-proration-and-promotion-c.md) | Upgrade a live plan with proration and promotion code | built | built | built | n/a | n/a | n/a |
| [F083-04](F083-04-tax-billing-address-and-tax-id.md) | Tax, billing address and tax ID | built | built | partly | n/a | n/a | n/a |
| [F083-05](F083-05-trial-terms.md) | Trial terms | built | built | built | n/a | n/a | n/a |
| [F083-06](F083-06-payment-methods.md) | Payment methods | built | built | n/a | n/a | n/a | n/a |
| [F083-07](F083-07-payment-failure-and-retry.md) | Payment failure and retry | built | built | built | built | built | built |
| [F083-08](F083-08-billing-history-invoices-receipts-refunds-and-cred.md) | Billing history, invoices, receipts, refunds and credit purchases | partly | partly | no | n/a | n/a | n/a |
| [F083-09](F083-09-cancel-resume-downgrade-and-end-of-term.md) | Cancel, resume, downgrade and end-of-term | built | built | built | n/a | built | n/a |
| [F083-10](F083-10-store-billed-plans-duplicate-subscription-warning.md) | Store-billed plans, duplicate-subscription warning and purchase restore | built | built | partly | n/a | n/a | n/a |
| [F083-11](F083-11-team-seats-and-enterprise-billing.md) | Team seats and enterprise billing | built | partly | built | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/083-billing-and-subscription-screens.md](../../10-requirements/capabilities/083-billing-and-subscription-screens.md).

## How this area works in the code

1. **Person opens pricing and picks a plan.** The pricing page builds cards and the comparison table from the shared plan catalog and localized prices. The Team card holds seat counts and the monthly/annual choice. Clicking a plan runs handleUpgrade. (`apps/web/app/pricing/page.tsx:269`, `apps/web/app/pricing/page.tsx:446`, `apps/web/app/pricing/page.tsx:601`, `apps/web/app/pricing/page.tsx:1046`)
2. **Access gate check in the browser.** A user with no paid plan is asked whether upgrades are open to them. If not, the waitlist dialog opens. A user with a live paid plan skips the gate and goes to the upgrade dialog or /upgrade/<plan>. (`apps/web/app/pricing/page.tsx:616`, `apps/web/app/pricing/page.tsx:638`, `apps/web/app/pricing/page.tsx:1304`)
3. **Browser calls the checkout API.** stripe-payments builds the request with CSRF header and an idempotency key (so a double click cannot make two sessions), posts to /api/checkout, remembers the session id, then hands off to the hosted page. (`apps/web/features/billing/services/stripe-payments.ts:210`, `apps/web/features/billing/services/stripe-payments.ts:222`, `apps/web/features/billing/services/stripe-payments.ts:252`)
4. **Server checks who may buy.** The route validates the body, picks the price for the buyer's country, reads the subscriptions row, applies the access gate (access code or operator switch), refuses when another owner (store, org) or a live provider subscription exists, and closes older open sessions. (`apps/web/app/api/checkout/route.ts:214`, `apps/web/app/api/checkout/route.ts:284`, `apps/web/lib/server/billing-waitlist-access.ts:41`, `apps/web/lib/server/subscription-billing-owner.ts:120`, `apps/web/app/api/checkout/route.ts:456`)
5. **Server builds the hosted session with tax, trial and promotion code.** It adds trial terms text, terms-of-service consent, promotion codes, the automatic tax and tax ID settings, then returns the session URL and records an audit event. (`apps/web/app/api/checkout/route.ts:82`, `apps/web/app/api/checkout/route.ts:516`, `apps/web/app/api/checkout/route.ts:556`, `apps/web/lib/billing/tax-policy.ts:94`)
6. **Return and confirmation.** The success URL is /billing?success=true. PendingCheckoutConfirmation polls the account every 2 seconds for up to 30 seconds and moves to /billing once the plan is active or trialing. The subscriptions table is filled by the provider's webhook. (`apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:12`, `apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:55`, `apps/web/app/api/checkout/route.ts:537`)
7. **Mid-cycle upgrade preview and apply.** UpgradeConfirmDialog asks the preview route for a priced order and a token, shows proration and tax, lets the user add a promotion code, then POST /api/upgrade applies the change after checking the token and the result. (`apps/web/features/billing/components/UpgradeConfirmDialog.tsx:98`, `apps/web/features/billing/components/UpgradeConfirmDialog.tsx:248`, `apps/web/features/billing/components/UpgradePromotionCode.tsx:31`, `apps/web/app/api/upgrade/route.ts:255`, `apps/web/app/api/upgrade/route.ts:277`)
8. **Billing settings page: status, notices and actions.** BillingSection loads plan state, saved cards, invoices and credit history in parallel, derives the billing owner, and shows notices (past due, trial, ending, scheduled change) and buttons (Manage billing, Cancel plan, Switch to a smaller plan, Resume). (`apps/web/features/settings/sections/BillingSection.tsx:273`, `apps/web/features/settings/sections/BillingSection.tsx:506`, `apps/web/features/settings/sections/BillingSection.tsx:827`, `apps/web/features/billing/components/BillingPlanNotices.tsx:112`)
9. **Portal, resume and downgrade server routes.** Cancel, card changes and add payment method open the hosted portal (cancel deep-links to the cancel step when allowed). Resume and downgrade call our routes, which change the subscription at the provider and update subscriptions.cancel_at_period_end. (`apps/web/app/api/portal/route.ts:399`, `apps/web/app/api/billing/resume-cancellation/route.ts:42`, `apps/web/app/api/billing/downgrade-preview/route.ts:77`, `apps/web/features/billing/components/DowngradeReviewDialog.tsx:132`)
10. **History, receipts and refunds.** Invoices, receipts and refunds are read live from the payment provider for the user's customer id; credit history is read from the credit_transactions table. Each list shows loading, empty and error states. (`apps/web/lib/services/billing-invoice-service.ts:46`, `apps/web/app/api/billing/receipts/route.ts:33`, `apps/web/app/api/billing/refunds/route.ts:36`, `apps/web/app/api/billing/credit-history/route.ts:117`, `apps/web/features/billing/components/BillingPaymentHistory.tsx:59`)
11. **Mobile read-only screen.** The phone reads plan, status, billing source and period end from /api/me, shows them, and sends web or store billed users to manage elsewhere. Native purchase code is gated by a compile-time value. (`apps/mobile/src/features/billing/store.ts:67`, `apps/mobile/src/features/billing/subscriptionSource.ts:41`, `apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3`, `apps/mobile/src/features/settings/cloud-billing/index.tsx:351`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/pricing/page.tsx` | Pricing page: plan cards, comparison table, Team seat and cadence picker, starts checkout or upgrade. |
| `apps/web/app/api/checkout/route.ts` | Server route that checks access, ownership and trial, then creates the hosted subscription session. |
| `apps/web/app/api/upgrade/route.ts` | Applies a mid-cycle upgrade or seat increase using the preview token, promotion code and proration. |
| `apps/web/features/billing/services/stripe-payments.ts` | Browser helpers that call checkout, portal, payment methods, preview and upgrade routes. |
| `apps/web/features/settings/sections/BillingSection.tsx` | Settings, Billing screen: plan status, buttons, cards, invoices, credit history. |
| `apps/web/features/billing/components/BillingPlanNotices.tsx` | Past due, trial, ending and scheduled-change notices with their action buttons. |
| `apps/web/features/billing/components/UpgradeConfirmDialog.tsx` | Upgrade order dialog with proration lines, tax, total and promotion code. |
| `apps/web/features/billing/components/DowngradeReviewDialog.tsx` | Review and confirm a switch to a smaller plan. |
| `apps/web/lib/server/subscription-billing-owner.ts` | Decides who bills a subscription (web, Apple, Google, organization) and what actions are allowed. |
| `apps/web/lib/server/billing-waitlist-access.ts` | Paid-upgrade access gate (access code or operator switch). |
| `apps/web/lib/billing/tax-policy.ts` | The one place that sets tax, address and tax ID collection for checkout. |
| `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Mobile Subscription screen: plan status, manage elsewhere, restore, web links. |

## What is stored

- Subscription row: plan_tier, status, stripe_customer_id, stripe_subscription_id, Apple and Google ids, current_period_end, cancel_at_period_end, canceled_at: database table subscriptions (read in apps/web/app/api/checkout/route.ts:284; updated in apps/web/app/api/billing/resume-cancellation/route.ts:42)
- Stripe customer id link: database table profiles, column stripe_customer_id (apps/web/app/api/checkout/route.ts:327)
- Access-code redemption that opens paid upgrades: database table beta_redemptions (apps/web/lib/server/billing-waitlist-access.ts:45)
- Credit ledger shown in Credit history: database table credit_transactions (apps/web/app/api/billing/credit-history/route.ts:117)
- Offline enterprise payment records (wire, check, bank transfer, bank reference): database table enterprise_offline_payment_records (apps/web/db/neon/0288_enterprise_offline_payment_records.sql:33)
- Pending checkout session id and plan, remembered until the plan shows active: browser, set by rememberPendingCheckout in apps/web/features/billing/services/stripe-payments.ts:252 (exact storage type not opened)
- Billing address, tax ID, invoices, cards, refunds: not stored by us: they stay at the payment provider and are read on demand (apps/web/lib/billing/tax-policy.ts:50 comment and apps/web/lib/services/billing-invoice-service.ts:46)
- Plan tier, status, source, period end and cancel flag cached on the phone: mobile persisted store useTierStore (apps/mobile/src/features/billing/store.ts:67)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_BILLING_WAITLIST_OPEN**: When 1, paid upgrades are open to everyone and the access code is not needed. (apps/web/lib/server/billing-waitlist-access.ts:30)
- **billing.upgrades_open flag (run-time operator switch)**: Opens paid upgrades per account without a deploy; any read failure counts as closed. (apps/web/lib/feature-flags/billing-upgrade-gate.ts:13 and apps/web/lib/feature-flags/billing-upgrades.ts:4)
- **STRIPE_CHECKOUT_ENABLED**: Set to 0, false or off to turn web checkout off. (apps/web/app/api/checkout/route.ts:60)
- **MOBILE_IAP_ENABLED and store product id variables**: Turns the server side of in-app purchases on; without it the catalog says purchases are not enabled. (apps/web/lib/server/mobile-iap-catalog.ts:26 and :52)
- **nativePurchases (compile-time)**: false hides every purchase, upgrade, top-up and restore control in the phone app; changing it needs a new store build. (apps/mobile/src/features/billing/storePurchases.json:2 read by apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3)
- **FEATURES.billing**: false means the phone does not open the hosted billing portal; web-billed users get a link instead. (apps/mobile/lib/v1FeatureFlags.ts:6 read in apps/mobile/src/features/settings/cloud-billing/index.tsx:197)
- **Plan tier**: Decides which plans can be bought or downgraded to, whether top-ups and seat purchase show, and what is in each card. (apps/web/features/settings/sections/BillingSection.tsx:425)
- **Billing source (stripe, apple, google, manual, unverified)**: Chooses which buttons appear and blocks checkout when another owner bills the plan. (apps/web/lib/server/subscription-billing-owner.ts:120)
- **x-vercel-ip-country header**: Picks the regional price and currency at checkout. (apps/web/app/api/checkout/route.ts:240)

## Shared between apps

Web, Desktop and the hosted pages are one code base: the Electron Desktop shows the web app, so every web billing screen is also the Desktop screen. Shared packages hold plan prices, plan tiers and capability rules (@agiworkforce/types, imported by pricing, checkout and mobile). Mobile has its own billing store, screens and store-purchase code in apps/mobile/src/features/billing and apps/mobile/src/features/settings. CLI (apps/cli/src/usage_summary.rs), VS Code (apps/extension-vscode) and Chrome (apps/extension/src/side_panel.ts) each have their own small wording for a failed payment and open web billing for the real work.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says S83.33 auto-reload history is missing on every app. AutoReloadPanel has no history list at all (no match for history in the file); only the settings are shown. (apps/web/features/billing/components/AutoReloadPanel.tsx)
- Credit notes (S83.19) have no screen or route in the web billing code I searched. (apps/web/features/settings/sections/BillingSection.tsx)
- Payment method management is read-only with a Default tag; add, set default, update and remove all go through the hosted portal, not in-product controls as 'Should' reads. (apps/web/features/settings/sections/BillingSection.tsx:923 and apps/web/app/api/billing/payment-methods/route.ts:80)
- On a first purchase the in-product screen says 'Tax is calculated at checkout', so tax and total are not shown before leaving for the hosted page (they are shown for mid-cycle upgrades). (apps/web/features/billing/components/UpgradeOrderPanel.tsx:391)
- A user with no access code cannot start any paid checkout, including Team seats; this is an owner decision but contradicts 'a signed-in user can start and complete a paid upgrade'. (apps/web/app/api/checkout/route.ts:325 and apps/web/lib/server/billing-waitlist-access.ts:41)
- Brief line numbers for the CLI, VS Code and Chrome payment-failure entries no longer match: the code is at usage_summary.rs:639, side_panel.ts:13434 and commandSetup.ts:2419. (apps/cli/src/usage_summary.rs:639; apps/extension/src/side_panel.ts:13434; apps/extension-vscode/src/core/commandSetup.ts:2419)
- A failed save of the Stripe customer link after creating the customer is only logged, not shown to the user. (apps/web/app/api/checkout/route.ts:340)
- Fallback that finds a customer by email in the portal route is labelled deprecated and a security warning. (apps/web/app/api/portal/route.ts:218)
- Checkout error text for an invalid checkout setup is generic ('Invalid checkout configuration. Please contact support.'), which does not tell the user how to fix it. (apps/web/app/api/checkout/route.ts:594)

## Not established

- Whether the Electron Desktop adds any billing screen of its own beyond showing the hosted web app; I only read apps/web and trusted the brief's 'desktop done'.
- How the provider's webhook fills the subscriptions table after payment; I did not open the webhook route.
- Where the refund request form posts (apps/web/app/refund-policy/RefundRequestForm.tsx) and how /api/billing/refund-requests results appear to the user; I only read the top of that route.
- The exact browser storage used to remember a pending checkout.
- Whether Chrome and VS Code show the cancellation date or payment failure exactly as the brief says; I read the code that checks the status but did not run them.
- The content of the access-code redemption and waitlist dialog flow (UpgradeWaitlistDialog) and the top-up and auto-reload server rules; I did not open them in full.
- How seats are assigned to members beyond invitations and the seat summary (WorkspaceBillingSummary was only partly read), and what the mobile workspace screen shows for seats.
- The server-side store receipt verification and restore path for mobile; I saw the client hook and catalog only.
- Which plans offer a free trial; getPlanTrialDays was referenced but not opened.
