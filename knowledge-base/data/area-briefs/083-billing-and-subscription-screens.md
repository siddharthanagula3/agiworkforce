# Area 83. Billing and subscription screens

33 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S83.01 Plan-comparison dialog.
- Should: A plan-comparison view/dialog lets the user compare plans (price, usage, features) before choosing.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/pricing/page.tsx:1384; apps/web/app/pricing/page.tsx:1529; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:174; apps/web/app/upgrade/UpgradeChooser.tsx:214; apps/mobile/src/features/settings/cloud-billing/index.tsx:398; apps/mobile/src/features/settings/plans/index.tsx:59

## S83.02 Monthly/annual toggle.
- Should: A monthly/annual toggle changes displayed prices and the cadence charged.
- Status: web done, desktop done
- Code: apps/web/app/pricing/page.tsx:1046; apps/web/app/pricing/page.tsx:1076; apps/web/app/pricing/page.tsx:1139; apps/web/app/pricing/page.tsx:727

## S83.03 Upgrade checkout.
- Should: A signed-in user can start and complete a paid upgrade checkout.
- Status: web done, desktop done, mobile partial, api done
- Code: apps/web/app/api/checkout/route.ts:414; apps/web/app/api/checkout/route.ts:392; apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:33; apps/web/app/pricing/page.tsx:1642; apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:26
- Unfinished: mobile: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## S83.04 Downgrade review.
- Should: Before a downgrade the user reviews what changes (price, features, limits, when it applies) and confirms.
- Status: web done, desktop done
- Code: apps/web/features/billing/components/DowngradeReviewDialog.tsx:140; apps/mobile/src/features/settings/cloud-billing/index.tsx:165; apps/mobile/src/features/settings/cloud-billing/index.tsx:367
- Unfinished: mobile: Mobile sends plan changes to the store or to web billing ("Subscription managed elsewhere" / "Manage billing on the web"); no downgrade review in the app.

## S83.05 Proration explanation.
- Should: Upgrades explain proration: credit for unused time, the charge today and when the next renewal happens.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/upgrade/UpgradeChooser.tsx:99; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:248; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:339; apps/mobile/src/features/settings/cloud-billing/index.tsx:435

## S83.06 Tax and total-price display.
- Should: Before paying, the user sees tax and the total price.
- Status: web done, desktop done, mobile partial
- Code: apps/web/features/billing/components/UpgradeOrderPanel.tsx:293; apps/web/lib/billing/tax-policy.ts:94; apps/web/app/api/checkout/route.ts:408; apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:26
- Unfinished: mobile: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## S83.07 Coupon entry.
- Should: Users can enter a coupon/promotion code when buying.
- Status: web done, desktop done
- Code: apps/web/app/api/checkout/route.ts:407; apps/web/features/billing/components/UpgradePromotionCode.tsx:31; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:345; apps/web/app/api/upgrade/route.ts:250

## S83.08 Trial terms.
- Should: When a plan starts as a trial, the user sees the trial terms: length, end date, what is charged after and how to cancel.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/api/checkout/route.ts:60; apps/web/app/api/checkout/route.ts:75; apps/web/features/settings/sections/BillingSection.tsx:544; apps/mobile/src/features/settings/cloud-billing/index.tsx:349

## S83.09 Payment-method entry.
- Should: Users can add a payment method.
- Status: web done, desktop done
- Code: apps/web/app/api/portal/route.ts:217; apps/web/app/api/portal/route.ts:460; apps/web/app/api/checkout/route.ts:414

## S83.10 Payment-method management.
- Should: Users can see and manage saved payment methods (default card, update, remove).
- Status: web done, desktop done
- Code: apps/web/features/settings/sections/BillingSection.tsx:923; apps/web/app/api/billing/payment-methods/route.ts:80; apps/web/features/billing/services/stripe-payments.ts:112

## S83.11 Billing address.
- Should: Users can enter and update a billing address.
- Status: web done, desktop done
- Code: apps/web/lib/billing/tax-policy.ts:80; apps/web/lib/billing/tax-policy.ts:94; apps/web/app/api/portal/route.ts:217

## S83.12 Tax identifier.
- Should: Business buyers can enter a tax identifier (VAT/GST) that is applied to their invoices.
- Status: web done, desktop done
- Code: apps/web/lib/billing/tax-policy.ts:99; apps/web/app/api/checkout/route.ts:408; apps/web/app/api/billing/top-up/route.ts:258

## S83.13 Purchase confirmation.
- Should: After paying, the user sees a confirmation of what was bought and that it is active.
- Status: web done, desktop done, mobile partial
- Code: apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:33; apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:55; apps/web/app/AppRuntimeMounts.tsx:27; apps/web/features/billing/services/stripe-payments.ts:221; apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:26
- Unfinished: mobile: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## S83.14 Payment failure.
- Should: When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/billing/components/BillingPlanNotices.tsx:112; apps/mobile/src/features/settings/cloud-billing/index.tsx:236; apps/mobile/src/features/settings/cloud-billing/index.tsx:367; apps/mobile/src/features/billing/store.ts:67; apps/cli/src/usage_summary.rs:557; apps/extension-vscode/src/core/commandSetup.ts:2076; apps/extension-vscode/src/utils/api.ts:837; apps/extension/src/side_panel.ts:8331

## S83.15 Retry payment.
- Should: After a failed payment the user can retry it (pay the open invoice or update the card) from the product.
- Status: web done, desktop done
- Code: apps/web/app/payment-failure/page.tsx:47; apps/web/app/pricing/page.tsx:584; apps/web/app/pricing/page.tsx:1199; apps/web/app/upgrade/UpgradeChooser.tsx:169; apps/web/features/settings/sections/BillingSection.tsx:530

## S83.16 Billing-history list.
- Should: Users can see a list of past bills (invoices and credit purchases).
- Status: web done, desktop done
- Code: apps/web/features/settings/sections/BillingSection.tsx:1273; apps/web/lib/services/billing-invoice-service.ts:46; apps/web/app/api/billing/credit-history/route.ts:117

## S83.17 Invoice download.
- Should: Users can download an invoice (PDF).
- Status: web done, desktop done
- Code: apps/web/app/billing/invoices/InvoiceList.tsx:137; apps/web/features/settings/sections/BillingSection.tsx:1350; apps/web/lib/services/billing-invoice-service.ts:46; apps/mobile/src/features/settings/cloud-billing/index.tsx:535
- Unfinished: mobile: Invoices open on web; nothing downloads in the app.

## S83.18 Receipt download.
- Should: Users can download a receipt for every payment, including one-off credit purchases.
- Status: web done, desktop done
- Code: apps/web/features/billing/components/BillingPaymentHistory.tsx:148; apps/web/app/api/billing/receipts/route.ts:1; apps/mobile/src/features/settings/cloud-billing/index.tsx:535
- Unfinished: mobile: Mobile sends users to web invoices and to the store for store receipts ('Refunds are handled by the store').

## S83.19 Credit-note display.
- Should: Users can see credit notes issued against their invoices.
- Status: web missing, desktop missing, mobile missing

## S83.20 Refund status.
- Should: Users can see the status of a refund (requested, processing, refunded).
- Status: web done, desktop done
- Code: apps/web/features/billing/components/BillingPaymentHistory.tsx:209; apps/web/app/api/billing/refunds/route.ts:20; apps/mobile/src/features/settings/cloud-billing/index.tsx:542
- Unfinished: mobile: Mobile says refunds are handled by the store and links web help; no refund status.

## S83.21 Cancel subscription.
- Should: Users can cancel their subscription themselves.
- Status: web done, desktop done
- Code: apps/web/features/settings/sections/BillingSection.tsx:828; apps/web/features/billing/services/stripe-payments.ts:112; apps/web/app/api/portal/route.ts:455

## S83.22 Resume subscription.
- Should: A user who scheduled a cancellation can resume the subscription before it ends.
- Status: web done, desktop done
- Code: apps/web/app/api/billing/resume-cancellation/route.ts:42; apps/mobile/src/features/settings/cloud-billing/index.tsx:318; apps/mobile/src/features/settings/cloud-billing/index.tsx:367
- Unfinished: mobile: Mobile shows the cancel date and sends users to the store or web billing.

## S83.23 Scheduled cancellation.
- Should: A scheduled (end-of-period) cancellation is shown with its date.
- Status: web done, desktop done, mobile done, vscode done
- Code: apps/web/features/settings/sections/BillingSection.tsx:757; apps/web/lib/services/subscription-service.ts:68; apps/mobile/src/features/settings/cloud-billing/index.tsx:318; apps/mobile/src/features/billing/store.ts:67; apps/extension-vscode/src/core/commandSetup.ts:2182

## S83.24 End-of-term access explanation.
- Should: After cancelling, the user is told what they keep until the end of the term and what happens after.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/billing/components/BillingPlanNotices.tsx:197; apps/web/app/upgrade/UpgradeChooser.tsx:154; apps/mobile/src/features/settings/cloud-billing/index.tsx:347

## S83.25 Mobile purchase restoration.
- Should: On mobile, users can restore store purchases (re-send receipts) without being charged again.
- Status: mobile partial
- Code: apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:26
- Unfinished: mobile: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## S83.26 Store-managed subscription instructions.
- Should: Users whose subscription is billed by Apple or Google are told to manage it in that store, with a link.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/settings/sections/BillingSection.tsx:791; apps/web/features/settings/sections/BillingSection.tsx:350; apps/web/lib/server/subscription-billing-owner.ts:94; apps/mobile/src/features/settings/cloud-billing/index.tsx:165; apps/mobile/src/features/billing/subscriptionSource.ts:41

## S83.27 Duplicate-subscription warning.
- Should: Before a purchase that would double-bill, the user is warned (existing subscription elsewhere).
- Status: web done, desktop done, mobile done
- Code: apps/web/features/settings/sections/BillingSection.tsx:350; apps/web/app/api/checkout/route.ts:332; apps/web/lib/server/subscription-billing-owner.ts:94; apps/mobile/src/features/settings/cloud-billing/index.tsx:165; apps/mobile/src/features/billing/subscriptionSource.ts:56

## S83.28 Team seat purchase.
- Should: A team owner can buy seats (choose a seat count at purchase and add seats later).
- Status: web done, desktop partial, api partial
- Code: apps/web/app/pricing/page.tsx:1104; apps/web/app/api/checkout/route.ts:376; apps/web/app/api/upgrade/route.ts:277; apps/web/lib/server/billing-waitlist-access.ts:22; apps/web/lib/validations/checkout.ts:52; apps/web/app/api/checkout/route.ts:208; apps/web/lib/server/billing-waitlist-access.ts:23
- Unfinished: desktop: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | api: POST /checkout accepts a seat count, but a first Team purchase hits the upgrade-waitlist gate (403); seat increases are app-only (/api/upgrade). Also the upgrade-waitlist gate (hasBillingWaitlistAccess: a beta_redemptions row) blocks first-time buyers.

## S83.29 Seat assignment.
- Should: Admins can assign seats to members and see seats used vs licensed.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:124; apps/web/app/api/settings/team/invitations/route.ts:75; apps/mobile/app/(app)/settings/workspace.tsx:268

## S83.30 Enterprise billing contacts.
- Should: Enterprise admins can see (and have on record) billing and procurement contacts for their contract.
- Status: web done, desktop done
- Code: apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:278; apps/web/app/api/settings/organization/billing-contract/route.ts:114; apps/web/lib/services/enterprise-contracts/agreement-store.ts:31

## S83.31 Purchase-order and invoicing workflows.
- Should: Enterprise customers can buy through purchase orders and invoices (PO numbers on invoices, invoice terms, offline payment reporting).
- Status: web done, desktop done
- Code: apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:270; apps/web/lib/services/enterprise-contracts/invoicing.ts:287; apps/web/db/neon/0288_enterprise_offline_payment_records.sql:33

## S83.32 Credit-purchase history.
- Should: Users can see a history of their credit purchases.
- Status: web done, desktop done
- Code: apps/web/features/settings/sections/BillingSection.tsx:69; apps/web/features/settings/sections/BillingSection.tsx:1154; apps/web/app/api/billing/credit-history/route.ts:24; apps/mobile/src/features/settings/cloud-billing/index.tsx:535
- Unfinished: mobile: Show credit purchases on mobile; /api/billing/credit-history (which returns them) is never called by the app.

## S83.33 Auto-reload history.
- Should: Users can see a history of automatic credit reloads.
- Status: web missing, desktop missing, mobile missing
