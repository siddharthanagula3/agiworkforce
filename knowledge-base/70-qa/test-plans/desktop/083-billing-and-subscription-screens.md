---
id: "PLAN-desktop-083"
type: "test-plan"
title: "Desktop · 83. Billing and subscription screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "83"
---
# Desktop · 83. Billing and subscription screens

30 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S83.01 Plan-comparison dialog.

- **Expected:** A plan-comparison view/dialog lets the user compare plans (price, usage, features) before choosing.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1384 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:1529 (quoted code not found in the file now); apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:174 (quoted code not found in the file now); apps/web/app/upgrade/UpgradeChooser.tsx:213
- **Where to find it:** Settings > Billing > Compare plans (paid plan); Settings > Billing > Upgrade plan (Free plan) (labels found in the code)
- **Needs:** a paid account to see Compare plans; a Free account for Upgrade plan
- **Steps:**
  1. Sign in and open Settings, then Billing.
  2. On a paid plan, click Compare plans. On the Free plan, click Upgrade plan, which opens the plan chooser instead.
  3. On the pricing page, scroll to the Compare plans heading and the table under it.
  4. Check that prices, Usage rows and feature rows can be compared across plans before choosing one.

## S83.02 Monthly/annual toggle.

- **Expected:** A monthly/annual toggle changes displayed prices and the cadence charged.
- **Code:** done. Evidence present: apps/web/app/pricing/page.tsx:1056; apps/web/app/pricing/page.tsx:748; apps/web/app/pricing/page.tsx:748; apps/web/app/pricing/page.tsx:690
- **Where to find it:** Settings > Billing > Compare plans > Team & Enterprise tab > Monthly / Annual (labels found in the code)
- **Needs:** none for viewing prices; a signed-in account to see the plan-state wording
- **Steps:**
  1. Open Settings, then Billing, then click Compare plans.
  2. On the pricing page, click the Team & Enterprise button in the audience toggle.
  3. Find the group with the buttons Monthly and Annual.
  4. Click Annual, then Monthly, and compare the displayed seat prices and the line that says billed yearly or billed monthly.

## S83.03 Upgrade checkout.

- **Expected:** A signed-in user can start and complete a paid upgrade checkout.
- **Code:** done. Evidence present: apps/web/app/api/checkout/route.ts:529; apps/web/app/api/checkout/route.ts:501; apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:33; apps/web/app/pricing/page.tsx:1304
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Billing > Upgrade plan > Continue with (plan name) > Subscribe to (plan name) (labels found in the code)
- **Needs:** a Free account that is not on the billing waitlist, and a Stripe test card
- **Steps:**
  1. Sign in with a Free account and open Settings, then Billing.
  2. Click Upgrade plan, then click Continue with and the plan name.
  3. Read the Order details box, then click Subscribe to and the plan name (or Start free trial if shown).
  4. Expect a Stripe Checkout page to open; then look for the plan showing as active in Billing.

## S83.04 Downgrade review.

- **Expected:** Before a downgrade the user reviews what changes (price, features, limits, when it applies) and confirms.
- **Code:** done. Evidence present: apps/web/features/billing/components/DowngradeReviewDialog.tsx:167
- **Where to find it:** Settings > Billing > Switch to a smaller plan (labels found in the code)
- **Needs:** a paid Stripe-billed account with no scheduled change; Team and Enterprise plans change in Manage billing instead
- **Steps:**
  1. Sign in with a paid Stripe-billed account and open Settings, then Billing.
  2. Click Switch to a smaller plan.
  3. In the dialog, pick a plan under the Plan heading and read the panel titled What changes on that plan.
  4. Look for the rows Plan price, plus tax, Usage, Limits and Not included, and the line that says when the change starts, then compare with the Switch on (date) or Switch to (plan) button.

## S83.05 Proration explanation.

- **Expected:** Upgrades explain proration: credit for unused time, the charge today and when the next renewal happens.
- **Code:** done. Evidence moved: apps/web/app/upgrade/UpgradeChooser.tsx:99 (quoted code not found in the file now); apps/web/features/billing/components/UpgradeConfirmDialog.tsx:280; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:339 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Adjust plan > Continue with (plan name) > Order details (labels found in the code)
- **Needs:** a paid Stripe-billed account that has a higher plan to move to, and a Stripe test card
- **Steps:**
  1. Sign in with a paid Stripe-billed account and open Settings, then Billing.
  2. Click Adjust plan, then Continue with and a higher plan name.
  3. Read the note that starts with Upgrading starts a new billing period today, and the Order details box with its credit row.
  4. Look for the Total due today line and the renewal sentence below it, and compare them with the note.

## S83.06 Tax and total-price display.

- **Expected:** Before paying, the user sees tax and the total price.
- **Code:** done. Evidence moved: apps/web/features/billing/components/UpgradeOrderPanel.tsx:415; apps/web/lib/billing/tax-policy.ts:98; apps/web/app/api/checkout/route.ts:408 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Upgrade plan > Continue with (plan name) > Order details (labels found in the code)
- **Needs:** a Free or paid account; the order box needs a working price preview
- **Steps:**
  1. Open Settings, then Billing, then click Upgrade plan (Free) or Adjust plan (paid).
  2. Click Continue with and a plan name to open the order page.
  3. Read the Order details box: Subtotal, Tax, Total and Total due today.
  4. Compare the Tax line with the note Tax is calculated at checkout.

## S83.07 Coupon entry.

- **Expected:** Users can enter a coupon/promotion code when buying.
- **Code:** done. Evidence present: apps/web/app/api/checkout/route.ts:522; apps/web/features/billing/components/UpgradePromotionCode.tsx:37; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:390; apps/web/app/api/upgrade/route.ts:260
- **Where to find it:** Settings > Billing > Upgrade plan > Continue with (plan name) > Add a promotion code (labels found in the code)
- **Needs:** a Free or paid account and a valid promotion code
- **Steps:**
  1. Open the order page: Settings, then Billing, then Upgrade plan, then Continue with and a plan name.
  2. Click Add a promotion code.
  3. Type a code into the field with the placeholder Promotion code and click the apply button.
  4. Check that the Order details box updates with a Discount line, or shows an error if the code is not valid.

## S83.08 Trial terms.

- **Expected:** When a plan starts as a trial, the user sees the trial terms: length, end date, what is charged after and how to cancel.
- **Code:** done. Evidence moved: apps/web/app/api/checkout/route.ts:73; apps/web/app/api/checkout/route.ts:88; apps/web/features/settings/sections/BillingSection.tsx:544 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Upgrade plan > Continue with (plan name) > Start free trial (labels found in the code)
- **Needs:** a Free account for a plan that offers a trial, and a Stripe test card
- **Steps:**
  1. Open the order page: Settings, then Billing, then Upgrade plan, then Continue with and a plan name.
  2. Read the trial line in Order details, which gives the end date and the charge after it.
  3. Compare the trial line with the button Start free trial, and note that Checkout asks for a card.
  4. After starting a trial, open Settings > Billing and read the notice that starts with Your and the trial length and says free trial.

## S83.09 Payment-method entry.

- **Expected:** Users can add a payment method.
- **Code:** done. Evidence present: apps/web/app/api/portal/route.ts:154; apps/web/app/api/portal/route.ts:399; apps/web/app/api/checkout/route.ts:529
- **Where to find it:** Settings > Billing > Payment > Add payment method (labels found in the code)
- **Needs:** an account with no saved card; a Stripe test card
- **Steps:**
  1. Sign in with an account that has no card on file and open Settings, then Billing.
  2. Find the Payment heading and read the line saying No card on file.
  3. Click Add payment method, which opens the billing portal in a new page (Stripe).
  4. Add a Stripe test card in the portal, return to Billing and check the card appears under Payment.

## S83.10 Payment-method management.

- **Expected:** Users can see and manage saved payment methods (default card, update, remove).
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:1031; apps/web/app/api/billing/payment-methods/route.ts:78
- **Where to find it:** Settings > Billing > Payment (labels found in the code)
- **Needs:** a paid account with at least one saved card
- **Steps:**
  1. Open Settings, then Billing, and find the Payment heading.
  2. Look for the saved card line with a Default tag on the default card.
  3. Click Manage cards to open the billing portal.
  4. In the portal, change or remove a card, then return to Billing and check the Payment list again.

## S83.11 Billing address.

- **Expected:** Users can enter and update a billing address.
- **Code:** done. Evidence present: apps/web/lib/billing/tax-policy.ts:84; apps/web/lib/billing/tax-policy.ts:98; apps/web/app/api/portal/route.ts:154
- **Where to find it:** Settings > Billing > Upgrade plan > Continue with (plan name) > Subscribe to (plan name), then the Stripe Checkout page (labels found in the code)
- **Needs:** a Free account with checkout open, and a Stripe test card
- **Steps:**
  1. Start a paid checkout as in S83.03 until the Stripe Checkout page opens.
  2. On the Stripe page, find the billing address fields, which are required.
  3. Enter an address, then go back to Settings > Billing to see if it was kept.
  4. Compare with the address shown in the Stripe billing portal after Manage billing.

## S83.12 Tax identifier.

- **Expected:** Business buyers can enter a tax identifier (VAT/GST) that is applied to their invoices.
- **Code:** done. Evidence moved: apps/web/lib/billing/tax-policy.ts:103; apps/web/app/api/checkout/route.ts:408 (quoted code not found in the file now); apps/web/app/api/billing/top-up/route.ts:250
- **Where to find it:** not found in the code. Searched for Tax ID and VAT in apps/web and packages/ui: the code turns on tax_id_collection in Stripe Checkout (apps/web/lib/billing/tax-policy.ts:103), but no AGI screen has a tax ID input; the Tax ID key in packages/ui/i18n/locales/en/pricing.json is not used by any component. Whether Stripe's page shows the field is not verified in code.
- **Needs:** a Free account with checkout open, and a business test customer

## S83.13 Purchase confirmation.

- **Expected:** After paying, the user sees a confirmation of what was bought and that it is active.
- **Code:** done. Evidence present: apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:33; apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:55; apps/web/app/AppRuntimeMounts.tsx:27; apps/web/features/billing/services/stripe-payments.ts:252
- **Where to find it:** Settings > Billing > Upgrade plan > Continue with (plan name) > Subscribe to (plan name), then return to the app (labels found in the code)
- **Needs:** a Free account and a Stripe test card
- **Steps:**
  1. Complete a paid checkout in Stripe (see S83.03).
  2. Wait on the page after Stripe returns; the app polls the plan for a short time.
  3. Look for the heading Payment received. or Checkout confirmed. and the plan name with its status.
  4. Open Settings > Billing and check the plan name and status match the confirmation.

## S83.14 Payment failure.

- **Expected:** When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it.
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPlanNotices.tsx:115
- **Where to find it:** Settings > Billing (red notice at the top of the plan card) (labels found in the code)
- **Needs:** a paid Stripe account with a failed renewal
- **Steps:**
  1. Sign in with an account whose renewal payment failed (needs a Stripe test card that declines).
  2. Open Settings, then Billing.
  3. Look at the red notice that says your payment did not go through and the plan is past due or unpaid.
  4. Check that the notice names the buttons Update payment method and, when an invoice is open, Pay (amount) now.

## S83.15 Retry payment.

- **Expected:** After a failed payment the user can retry it (pay the open invoice or update the card) from the product.
- **Code:** done. Evidence present: apps/web/app/payment-failure/page.tsx:48; apps/web/app/pricing/page.tsx:502; apps/web/app/pricing/page.tsx:982; apps/web/app/upgrade/UpgradeChooser.tsx:169; apps/web/features/settings/sections/BillingSection.tsx:606
- **Where to find it:** Settings > Billing > red payment notice > Update payment method or Pay (amount) now (labels found in the code)
- **Needs:** a paid account with a failed or open invoice, and a Stripe test card
- **Steps:**
  1. Sign in with an account in a failed-payment state and open Settings, then Billing.
  2. Click Update payment method; the billing portal opens in a new page.
  3. Or click Pay (amount) now to open the open invoice in a new page.
  4. Also open the link why a payment fails and what to do, which opens the Open billing help page; click Open billing and check the notice returns to a normal state after payment.

## S83.16 Billing-history list.

- **Expected:** Users can see a list of past bills (invoices and credit purchases).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:1273 (quoted code not found in the file now); apps/web/lib/services/billing-invoice-service.ts:56
- **Where to find it:** Settings > Billing > Invoices, and Settings > Billing > Credit purchases (labels found in the code)
- **Needs:** a paid account with at least one invoice; a credit purchase for the second list
- **Steps:**
  1. Open Settings, then Billing.
  2. Scroll to the Invoices heading and read the list of dates, totals and status.
  3. Scroll further to the Credit purchases heading and the Refunds heading below it.
  4. Compare the rows with the purchases you made.

## S83.17 Invoice download.

- **Expected:** Users can download an invoice (PDF).
- **Code:** done. Evidence present: apps/web/app/billing/invoices/InvoiceList.tsx:166; apps/web/lib/services/billing-invoice-service.ts:56
- **Where to find it:** Settings > Billing > Invoices > View (or Pay for an open invoice) (labels found in the code)
- **Needs:** a paid account with at least one issued invoice
- **Steps:**
  1. Open Settings, then Billing, then find the Invoices list.
  2. Click the View link on a paid invoice; it opens the invoice in a new page.
  3. Check the invoice opens with the right date, total and status.
  4. Look for a PDF download on that page.

## S83.18 Receipt download.

- **Expected:** Users can download a receipt for every payment, including one-off credit purchases.
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPaymentHistory.tsx:150; apps/web/app/api/billing/receipts/route.ts:1
- **Where to find it:** Settings > Billing > Credit purchases > View receipt (labels found in the code)
- **Needs:** an account that has bought a credit pack
- **Steps:**
  1. Open Settings, then Billing, and scroll to the Credit purchases list.
  2. Find a credit purchase row with a View receipt link.
  3. Click View receipt; it opens the receipt in a new page.
  4. Check the receipt amount matches the row. Rows with no receipt show Not issued yet.

## S83.20 Refund status.

- **Expected:** Users can see the status of a refund (requested, processing, refunded).
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPaymentHistory.tsx:212; apps/web/app/api/billing/refunds/route.ts:15
- **Where to find it:** Settings > Billing > Refunds (labels found in the code)
- **Needs:** an account with at least one refund (created by the owner or a Stripe test refund)
- **Steps:**
  1. Open Settings, then Billing, and scroll to the Refunds list (newest first).
  2. Find a refund row and read its status: Processing, Action needed, Refunded, Failed or Canceled.
  3. Compare the status with the refund's state in the payment provider.
  4. Check the amount and date on the row.

## S83.21 Cancel subscription.

- **Expected:** Users can cancel their subscription themselves.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:908; apps/web/features/billing/services/stripe-payments.ts:112 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Cancel plan (labels found in the code)
- **Needs:** a paid Stripe-billed account (not Apple, Google or organization billing)
- **Steps:**
  1. Sign in with a paid Stripe-billed account and open Settings, then Billing.
  2. Click Cancel plan; the billing portal opens on the cancel screen.
  3. Confirm the cancellation in the portal.
  4. Return to Billing and check that the plan shows an Ends on date and the button Resume (plan) appears.

## S83.22 Resume subscription.

- **Expected:** A user who scheduled a cancellation can resume the subscription before it ends.
- **Code:** done. Evidence moved: apps/web/app/api/billing/resume-cancellation/route.ts:42 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Resume (plan name) (labels found in the code)
- **Needs:** a paid Stripe account with a scheduled cancellation
- **Steps:**
  1. After a cancellation (S83.21), open Settings, then Billing.
  2. Find the notice that says Your (plan) plan ends on (date).
  3. Click the button Resume (plan name).
  4. Check that the notice disappears and the Cancel plan button comes back.

## S83.23 Scheduled cancellation.

- **Expected:** A scheduled (end-of-period) cancellation is shown with its date.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:757 (quoted code not found in the file now); apps/web/lib/services/subscription-service.ts:145
- **Where to find it:** Settings > Billing > plan card row Ends on (labels found in the code)
- **Needs:** a paid Stripe account with a scheduled cancellation
- **Steps:**
  1. Cancel a paid Stripe plan (S83.21).
  2. Open Settings, then Billing, and look at the plan card rows.
  3. Find the row labelled Ends on with a date.
  4. Compare the date with the notice that says Your (plan) plan ends on (date).

## S83.24 End-of-term access explanation.

- **Expected:** After cancelling, the user is told what they keep until the end of the term and what happens after.
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPlanNotices.tsx:214; apps/web/app/upgrade/UpgradeChooser.tsx:151
- **Where to find it:** Settings > Billing > notice after Cancel plan (labels found in the code)
- **Needs:** a paid Stripe account with a scheduled cancellation
- **Steps:**
  1. Cancel a paid Stripe plan (S83.21).
  2. Open Settings, then Billing, and read the notice below the plan card.
  3. Read the sentence starting You keep (plan) features and credits until then.
  4. Check that it ends with Free; your chats, projects and files stay.

## S83.26 Store-managed subscription instructions.

- **Expected:** Users whose subscription is billed by Apple or Google are told to manage it in that store, with a link.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:883; apps/web/features/settings/sections/BillingSection.tsx:350 (quoted code not found in the file now); apps/web/lib/server/subscription-billing-owner.ts:109
- **Where to find it:** Settings > Billing > Manage in the App Store or Manage on Google Play (labels found in the code)
- **Needs:** an account billed through the Apple App Store or Google Play
- **Steps:**
  1. Sign in with an account whose plan is billed by Apple or Google (bought in the mobile app).
  2. Open Settings, then Billing, and find the Billed through row, which names the store.
  3. Click Manage in the App Store (or Manage on Google Play); the store page opens in a new window.
  4. Check that Cancel plan and Switch to a smaller plan are not shown for this account.

## S83.27 Duplicate-subscription warning.

- **Expected:** Before a purchase that would double-bill, the user is warned (existing subscription elsewhere).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:350 (quoted code not found in the file now); apps/web/app/api/checkout/route.ts:332 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Upgrade plan > Continue with (plan name) > Subscribe to (plan name) (labels found in the code)
- **Needs:** an account with an active Stripe subscription that the app does not show as paid (hard to set up)
- **Steps:**
  1. Use an account that already has an active subscription with the payment provider but does not show it as a paid plan.
  2. Open the order page and click Subscribe to (plan name).
  3. Read the red error line under the order box.
  4. Check that the message says to open Billing to manage it, or contact support.

## S83.28 Team seat purchase.

- **Expected:** A team owner can buy seats (choose a seat count at purchase and add seats later).
- **Code:** partial. Evidence moved: apps/web/lib/server/billing-waitlist-access.ts:22 (quoted code not found in the file now)
- **Known to be unfinished:** owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades
- **Where to find it:** Settings > Billing > Compare plans (opens /pricing) > Team card > Seats box > Get Team. A team owner whose plan already bills per seat sees Update seats instead. Adding seats later: Settings > Workspace > Seats & billing > Change seats (opens /pricing with the seat count). (labels found in the code)
- **Needs:** a Free account (or a team owner account to test adding seats); a second account is not needed. Paid checkout is held behind the billing waitlist by the owner's decision, so a Free tester may see the waitlist or access-code message instead of checkout.
- **Steps:**
  1. Sign in as the account that would own the Team workspace. Open Settings, then Billing, then click Compare plans.
  2. On the Team card, change the number in the Seats box (minimum 2) and read the total line that shows Seats: N and the monthly total.
  3. Click Get Team. If upgrades are on the waitlist, the button reads Join the Team waitlist, or Enter access code if you already joined.
  4. Compare with Expected: the seat count is chosen before purchase, and checkout or the waitlist/access-code message appears. For adding seats later, use Settings > Workspace > Seats & billing > Change seats and check the Seats box is pre-filled with the current licensed count.

## S83.29 Seat assignment.

- **Expected:** Admins can assign seats to members and see seats used vs licensed.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:126; apps/web/app/api/settings/team/invitations/route.ts:83
- **Where to find it:** Settings > Workspace > Seats & billing (figures Licensed, In use, Available, and Premium seats if the workspace bills seats). On each member row, the Seat type dropdown. Workspace console: Workspace > Billing shows Seats used as X of Y. (labels found in the code)
- **Needs:** a workspace owner or admin account; a workspace with seat billing (Premium seats) for the dropdown to appear; a second member in the same workspace to change a seat on. Without seat billing the row shows static text instead of the dropdown.
- **Steps:**
  1. Sign in as the workspace owner or an admin. Open Settings, then Workspace.
  2. Find the card titled Seats & billing and read the Licensed, In use and Available figures.
  3. On a member row, open the seat dropdown (it reads Standard seat or Premium seat) and pick the other seat type.
  4. Confirm the dialog that appears, then compare the In use count and the Premium seats assigned count with Expected: admins can assign seats and see seats used against licensed.

## S83.30 Enterprise billing contacts.

- **Expected:** Enterprise admins can see (and have on record) billing and procurement contacts for their contract.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:301; apps/web/app/api/settings/organization/billing-contract/route.ts:124
- **Where to find it:** Settings > Workspace > Seats & billing > Review contract (opens Workspace > Billing) > Enterprise contract > Contacts. Rows: Billing contact and Procurement contact. (labels found in the code)
- **Needs:** an owner or admin account on a workspace with a contract on record (the contract is entered by billing staff, not in the app). Without a contract, a contract-priced workspace shows No contract is on record for this workspace.; other plans see no contract card at all.
- **Steps:**
  1. Sign in as an owner or admin of a workspace that has an enterprise contract on record. Open Settings, then Workspace.
  2. In the Seats & billing card, click Review contract.
  3. On the billing page, scroll to the Enterprise contract card and find the Contacts section.
  4. Read the Billing contact and Procurement contact rows and compare with Expected: each shows a name and email, or Not on record. The card is read only.

## S83.31 Purchase-order and invoicing workflows.

- **Expected:** Enterprise customers can buy through purchase orders and invoices (PO numbers on invoices, invoice terms, offline payment reporting).
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:280; apps/web/lib/services/enterprise-contracts/invoicing.ts:269
- **Where to find it:** Settings > Workspace > Seats & billing > Review contract > Enterprise contract card (rows Payment terms and Purchase order) and the Invoices table in the same page. (labels found in the code)
- **Needs:** an owner or admin account on a contract-priced workspace with a contract on record and at least one invoice (created by billing staff, not in the app).
- **Steps:**
  1. Sign in as an owner or admin of a contract-priced workspace. Open Settings, then Workspace, then click Review contract.
  2. In the Enterprise contract card, read the Payment terms row (Net N, Due on receipt, or As stated on each invoice).
  3. Read the Purchase order row (a PO number or Not on record).
  4. Scroll to the Invoices section and read the Invoice, Period, Due, Status and Amount columns, then check the Links column; compare with Expected: PO numbers and invoice terms are shown. Buying by purchase order or reporting a bank transfer has no control on any screen.

## S83.32 Credit-purchase history.

- **Expected:** Users can see a history of their credit purchases.
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:108; apps/web/app/api/billing/credit-history/route.ts:24
- **Where to find it:** Settings > Billing > Credit history (table with Date, Description, Amount), and the Credit purchases section below it. (labels found in the code)
- **Needs:** an account that has bought credits (a top-up). The Credit purchases section appears only when Stripe billing exists for the account.
- **Steps:**
  1. Sign in with an account that has bought credits (a top-up). Open Settings, then Billing.
  2. Scroll to the Credit history card and read the rows; a credit purchase appears with the description Top-up purchase.
  3. Scroll further to the Credit purchases section and read each purchase row, including its receipt link.
  4. Compare with Expected: every credit purchase is listed, newest first. A Free account with no purchases sees No credit activity yet... or No credit purchases yet.
