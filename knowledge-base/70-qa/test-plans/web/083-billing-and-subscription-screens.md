---
id: "PLAN-web-083"
type: "test-plan"
title: "Web · 83. Billing and subscription screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "83"
---
# Web · 83. Billing and subscription screens

30 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S83.01 Plan-comparison dialog.

- **Expected:** A plan-comparison view/dialog lets the user compare plans (price, usage, features) before choosing.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1384 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:1529 (quoted code not found in the file now); apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:174 (quoted code not found in the file now); apps/web/app/upgrade/UpgradeChooser.tsx:213
- **Where to find it:** Pricing > Compare plans (labels found in the code)
- **Steps:**
  1. Open the Pricing page (/pricing), or the plans page reached from Settings > Billing.
  2. Scroll to the section headed "Compare plans".
  3. Read the columns "Plan", "Price", "Billing" and "Usage capacity" and the rows for usage, models, admin and data.
  4. Compare the plans shown with what the Expected line asks for: price, usage and features before choosing.

## S83.02 Monthly/annual toggle.

- **Expected:** A monthly/annual toggle changes displayed prices and the cadence charged.
- **Code:** done. Evidence present: apps/web/app/pricing/page.tsx:1056; apps/web/app/pricing/page.tsx:748; apps/web/app/pricing/page.tsx:748; apps/web/app/pricing/page.tsx:690
- **Where to find it:** Pricing > Team & Enterprise > Monthly / Annual (labels found in the code)
- **Steps:**
  1. Open the Pricing page (/pricing).
  2. Select the "Team & Enterprise" tab.
  3. Click "Annual", then "Monthly" in the toggle beside the seat price.
  4. Look at the price text and the billing line ("billed yearly" or "billed monthly") and compare with Expected.

## S83.03 Upgrade checkout.

- **Expected:** A signed-in user can start and complete a paid upgrade checkout.
- **Code:** done. Evidence present: apps/web/app/api/checkout/route.ts:529; apps/web/app/api/checkout/route.ts:501; apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:33; apps/web/app/pricing/page.tsx:1304
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Billing > Upgrade plan (labels found in the code)
- **Needs:** a Free account and a card for the Stripe checkout
- **Steps:**
  1. Sign in with a Free account, press ⌘, and choose "Billing".
  2. Click "Upgrade plan".
  3. Choose a paid plan on the "Upgrade" page and read the "Upgrade to" dialog.
  4. Click the confirm button and complete the Stripe checkout page.
  5. Return to Billing and check the plan name and status shown under the Billing heading against Expected.

## S83.04 Downgrade review.

- **Expected:** Before a downgrade the user reviews what changes (price, features, limits, when it applies) and confirms.
- **Code:** done. Evidence present: apps/web/features/billing/components/DowngradeReviewDialog.tsx:167
- **Where to find it:** Settings > Billing > Switch to a smaller plan (labels found in the code)
- **Needs:** a paid account billed through Stripe
- **Steps:**
  1. Press ⌘, and choose "Billing" with a paid Stripe-billed account.
  2. Click "Switch to a smaller plan".
  3. In the dialog, read the "Price", "Usage" and "Limits" sections.
  4. Read the switch date line and the button "Switch on" or "Switch to" and compare with Expected before confirming.

## S83.05 Proration explanation.

- **Expected:** Upgrades explain proration: credit for unused time, the charge today and when the next renewal happens.
- **Code:** done. Evidence moved: apps/web/app/upgrade/UpgradeChooser.tsx:99 (quoted code not found in the file now); apps/web/features/billing/components/UpgradeConfirmDialog.tsx:280; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:339 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Upgrade plan > choose a paid plan (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Start from a Free account: press ⌘, and choose "Billing", then click "Upgrade plan".
  2. Read the sentence about starting a new billing period and credit for unused time.
  3. Choose a paid plan and open the confirmation dialog.
  4. Read "Total due today" and the "Renews" line and compare with Expected.

## S83.06 Tax and total-price display.

- **Expected:** Before paying, the user sees tax and the total price.
- **Code:** done. Evidence moved: apps/web/features/billing/components/UpgradeOrderPanel.tsx:415; apps/web/lib/billing/tax-policy.ts:98; apps/web/app/api/checkout/route.ts:408 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Upgrade plan > choose a paid plan (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open "Upgrade plan" from Settings > Billing.
  2. Choose a paid plan and read the order panel.
  3. Look for the "Tax" line and the "Total due today" line.
  4. If the panel says "Tax is calculated at checkout.", note that tax is only added on the Stripe page, and compare with Expected.

## S83.07 Coupon entry.

- **Expected:** Users can enter a coupon/promotion code when buying.
- **Code:** done. Evidence present: apps/web/app/api/checkout/route.ts:522; apps/web/features/billing/components/UpgradePromotionCode.tsx:37; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:390; apps/web/app/api/upgrade/route.ts:260
- **Where to find it:** Settings > Billing > Upgrade plan > choose a paid plan > Add a promotion code (labels found in the code)
- **Needs:** a Free account and a valid promotion code
- **Steps:**
  1. Open "Upgrade plan" from Settings > Billing and choose a paid plan.
  2. In the confirmation dialog, find the "Promotion code" field.
  3. Click "Add a promotion code" and type a code.
  4. Check the discount line shown below the code, such as "% off", and compare with Expected.

## S83.08 Trial terms.

- **Expected:** When a plan starts as a trial, the user sees the trial terms: length, end date, what is charged after and how to cancel.
- **Code:** done. Evidence moved: apps/web/app/api/checkout/route.ts:73; apps/web/app/api/checkout/route.ts:88; apps/web/features/settings/sections/BillingSection.tsx:544 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing (status row "Trial ends on" or badge "Free trial") (labels found in the code)
- **Needs:** an account on a trial (or a plan offered with a trial)
- **Steps:**
  1. Open Settings > Billing with an account on a trial.
  2. Read the "Free trial" badge and the "Trial ends on" row.
  3. Read the text under the plan name about the trial end date.
  4. Open "Upgrade plan" and choose a plan with a trial, then read "Your free trial ends on" and the charge after it, and compare with Expected.

## S83.09 Payment-method entry.

- **Expected:** Users can add a payment method.
- **Code:** done. Evidence present: apps/web/app/api/portal/route.ts:154; apps/web/app/api/portal/route.ts:399; apps/web/app/api/checkout/route.ts:529
- **Where to find it:** Settings > Billing > Payment > Add payment method (labels found in the code)
- **Needs:** a Free or paid account with no saved card
- **Steps:**
  1. Press ⌘, and choose "Billing".
  2. Find the "Payment" heading.
  3. If no card is saved, click "Add payment method".
  4. Complete the card form that opens and compare the new card with Expected.

## S83.10 Payment-method management.

- **Expected:** Users can see and manage saved payment methods (default card, update, remove).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:1031; apps/web/app/api/billing/payment-methods/route.ts:78; apps/web/features/billing/services/stripe-payments.ts:112 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Payment (labels found in the code)
- **Needs:** a saved card on a paid or Stripe-billed account
- **Steps:**
  1. Press ⌘, and choose "Billing".
  2. Under "Payment", read each saved card line with its "Default" badge and "Expires" date.
  3. Click "Manage cards" to change or remove a card in the billing portal.
  4. Compare the default card, update and remove options with Expected.

## S83.11 Billing address.

- **Expected:** Users can enter and update a billing address.
- **Code:** done. Evidence present: apps/web/lib/billing/tax-policy.ts:84; apps/web/lib/billing/tax-policy.ts:98; apps/web/app/api/portal/route.ts:154
- **Where to find it:** not found in the code. The billing address form is collected on the Stripe checkout page (tax-policy.ts sets billing_address_collection to 'required'); I found no in-app billing address field, and searched apps/web for 'billing address'.
- **Needs:** a paid checkout or a Stripe billing portal session

## S83.12 Tax identifier.

- **Expected:** Business buyers can enter a tax identifier (VAT/GST) that is applied to their invoices.
- **Code:** done. Evidence moved: apps/web/lib/billing/tax-policy.ts:103; apps/web/app/api/checkout/route.ts:408 (quoted code not found in the file now); apps/web/app/api/billing/top-up/route.ts:250
- **Where to find it:** not found in the code. Tax identifier collection is enabled on Stripe checkout (apps/web/lib/billing/tax-policy.ts); I found no in-app tax ID field, and searched apps/web for 'Tax ID' and 'VAT'.
- **Needs:** a business buyer account and a paid checkout

## S83.13 Purchase confirmation.

- **Expected:** After paying, the user sees a confirmation of what was bought and that it is active.
- **Code:** done. Evidence present: apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:33; apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:55; apps/web/app/AppRuntimeMounts.tsx:27; apps/web/features/billing/services/stripe-payments.ts:252
- **Where to find it:** Finish a paid checkout > Billing > You're all set. (labels found in the code)
- **Needs:** a Free account and a completed paid checkout
- **Steps:**
  1. Complete a paid upgrade on the Stripe checkout page.
  2. Return to the app; it opens Billing with success in the address.
  3. Wait for the page to update the plan.
  4. Read the heading "You're all set." and the plan name beside it, and compare with Expected.

## S83.14 Payment failure.

- **Expected:** When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it.
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPlanNotices.tsx:115
- **Where to find it:** Settings > Billing (past-due notice) (labels found in the code)
- **Needs:** a paid account with a failed renewal
- **Steps:**
  1. Use an account whose renewal failed, press ⌘, and choose "Billing".
  2. Read the red notice at the top of the page.
  3. Read the text "Your last ... payment didn't go through" and the status "past due" or "unpaid".
  4. Check that the notice shows how to fix it with the buttons "Pay" and "Update payment method", and compare with Expected.

## S83.15 Retry payment.

- **Expected:** After a failed payment the user can retry it (pay the open invoice or update the card) from the product.
- **Code:** done. Evidence present: apps/web/app/payment-failure/page.tsx:48; apps/web/app/pricing/page.tsx:502; apps/web/app/pricing/page.tsx:982; apps/web/app/upgrade/UpgradeChooser.tsx:169; apps/web/features/settings/sections/BillingSection.tsx:606
- **Where to find it:** Settings > Billing > Update payment method (labels found in the code)
- **Needs:** a paid account with a failed payment
- **Steps:**
  1. Use an account with a failed payment and open Settings > Billing.
  2. In the red notice, click "Update payment method" (or the "Pay" link for the open invoice).
  3. Complete the payment in the billing portal or on the invoice page.
  4. Return to Billing and check that the notice is gone and the status is active, as Expected says.

## S83.16 Billing-history list.

- **Expected:** Users can see a list of past bills (invoices and credit purchases).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:1273 (quoted code not found in the file now); apps/web/lib/services/billing-invoice-service.ts:56; apps/web/app/api/billing/credit-history/route.ts:104
- **Earlier check in the running app:** UI_ONLY: E010 [UI_ONLY; empty-state UI]: Billing shows current Free plan, credit-history and invoice areas. No paid invoice, purchase or payment flow exercised.
- **Where to find it:** Settings > Billing > Invoices (and Settings > Billing > Credit history) (labels found in the code)
- **Needs:** a paid account with invoices and credit purchases
- **Steps:**
  1. Press ⌘, and choose "Billing".
  2. Scroll to the "Invoices" heading and read the table.
  3. Scroll to the "Credit history" heading and read its rows.
  4. Compare the lists with Expected: past bills and credit purchases.

## S83.17 Invoice download.

- **Expected:** Users can download an invoice (PDF).
- **Code:** done. Evidence present: apps/web/app/billing/invoices/InvoiceList.tsx:166; apps/web/features/settings/sections/BillingSection.tsx:1136; apps/web/lib/services/billing-invoice-service.ts:56
- **Where to find it:** Settings > Billing > Invoices > Pay / View (labels found in the code)
- **Needs:** a paid account with an issued invoice
- **Steps:**
  1. Open Settings > Billing and scroll to "Invoices".
  2. Find an invoice row with a link labelled "Pay" or "View".
  3. Click the link; it opens the hosted invoice in a new tab.
  4. On /billing/invoices, check the "PDF" link in the "Invoice" column and compare with Expected.

## S83.18 Receipt download.

- **Expected:** Users can download a receipt for every payment, including one-off credit purchases.
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPaymentHistory.tsx:150; apps/web/app/api/billing/receipts/route.ts:1
- **Where to find it:** Settings > Billing (payment history table, column "Receipt") (labels found in the code)
- **Needs:** an account with at least one credit purchase
- **Steps:**
  1. Open Settings > Billing with an account that has bought credits or paid a top-up.
  2. Find the payment history table and its "Receipt" column.
  3. Click the receipt link for a payment.
  4. Check that a receipt exists for each payment, including credit purchases, and compare with Expected.

## S83.20 Refund status.

- **Expected:** Users can see the status of a refund (requested, processing, refunded).
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPaymentHistory.tsx:212; apps/web/app/api/billing/refunds/route.ts:15
- **Where to find it:** Settings > Billing > Refunds table (labels found in the code)
- **Needs:** an account with a refund request
- **Steps:**
  1. Open Settings > Billing and find the "Refunds" table below the payment history.
  2. Read the status shown for each refund.
  3. Compare the status words with Expected: requested, processing, refunded.

## S83.21 Cancel subscription.

- **Expected:** Users can cancel their subscription themselves.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:908; apps/web/features/billing/services/stripe-payments.ts:112 (quoted code not found in the file now); apps/web/app/api/portal/route.ts:400
- **Where to find it:** Settings > Billing > Cancel plan (labels found in the code)
- **Needs:** a paid account billed through Stripe
- **Steps:**
  1. Press ⌘, and choose "Billing" with a paid Stripe-billed account.
  2. Click "Cancel plan".
  3. Complete the cancellation in the billing portal that opens.
  4. Return to Billing and check the scheduled end date, and compare with Expected.

## S83.22 Resume subscription.

- **Expected:** A user who scheduled a cancellation can resume the subscription before it ends.
- **Code:** done. Evidence moved: apps/web/app/api/billing/resume-cancellation/route.ts:42 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Resume button in the scheduled-cancellation notice (labels found in the code)
- **Needs:** a paid account with a scheduled cancellation
- **Steps:**
  1. Use an account with a cancellation already scheduled and open Settings > Billing.
  2. Find the notice that says the plan ends on a date.
  3. Click the "Resume" button in that notice (its label includes the plan name).
  4. Check that the notice disappears and the plan continues, and compare with Expected.

## S83.23 Scheduled cancellation.

- **Expected:** A scheduled (end-of-period) cancellation is shown with its date.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:757 (quoted code not found in the file now); apps/web/lib/services/subscription-service.ts:145
- **Where to find it:** Settings > Billing (notice "Your ... plan ends on ...") (labels found in the code)
- **Needs:** a paid account with a scheduled cancellation
- **Steps:**
  1. Use an account with a scheduled cancellation and open Settings > Billing.
  2. Read the notice that starts "Your ... plan ends on" and the date after it.
  3. Check the "Price" and status rows below the notice, and compare with Expected.

## S83.24 End-of-term access explanation.

- **Expected:** After cancelling, the user is told what they keep until the end of the term and what happens after.
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPlanNotices.tsx:214; apps/web/app/upgrade/UpgradeChooser.tsx:151
- **Where to find it:** Settings > Billing (notice "You keep ... features and credits until then") (labels found in the code)
- **Needs:** a paid account with a scheduled cancellation
- **Steps:**
  1. Use an account with a scheduled cancellation and open Settings > Billing.
  2. Read the notice under "Your ... plan ends on".
  3. Check the sentence "You keep ... features and credits until then" and what it says happens after: the account moves to Free and chats, projects and files stay.
  4. Compare with Expected.

## S83.26 Store-managed subscription instructions.

- **Expected:** Users whose subscription is billed by Apple or Google are told to manage it in that store, with a link.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:883; apps/web/features/settings/sections/BillingSection.tsx:350 (quoted code not found in the file now); apps/web/lib/server/subscription-billing-owner.ts:109
- **Where to find it:** Settings > Billing > Manage in the App Store / Manage on Google Play (labels found in the code)
- **Needs:** an account billed through Apple or Google
- **Steps:**
  1. Use an account whose subscription was bought in the App Store or Google Play.
  2. Open Settings > Billing.
  3. Read the text about the store billing the plan and the button "Manage in the App Store" or "Manage on Google Play".
  4. Click the button, check it opens the store page, and compare with Expected.

## S83.27 Duplicate-subscription warning.

- **Expected:** Before a purchase that would double-bill, the user is warned (existing subscription elsewhere).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:350 (quoted code not found in the file now); apps/web/app/api/checkout/route.ts:332 (quoted code not found in the file now); apps/web/lib/server/subscription-billing-owner.ts:109
- **Where to find it:** Settings > Billing > Upgrade plan > choose a paid plan (warning appears when checkout is refused) (labels found in the code)
- **Needs:** an account that already has an active paid subscription
- **Steps:**
  1. Use an account that already has an active paid subscription.
  2. Open "Upgrade plan" from Settings > Billing and choose a paid plan.
  3. Read the warning if checkout is refused: "This account already has an active subscription with our payment provider. Open Billing to manage it".
  4. Compare with Expected and check the warning appears before any second charge.

## S83.28 Team seat purchase.

- **Expected:** A team owner can buy seats (choose a seat count at purchase and add seats later).
- **Code:** done. Evidence present: apps/web/app/pricing/page.tsx:1119; apps/web/app/api/checkout/route.ts:464; apps/web/app/api/upgrade/route.ts:287
- **Where to find it:** Settings > Billing > "Upgrade plan" (opens the pricing page), then the Team plan card's "Seats" box; on a plan already owned, "Update seats" is the button (labels found in the code)
- **Needs:** a Free account for the purchase, or a paid team owner account to change seats
- **Steps:**
  1. Sign in and open Settings, then the Billing tab.
  2. On the plan row, click "Upgrade plan" (shown on a Free plan) or "Adjust plan" (on a paid plan).
  3. On the pricing page, find the Team plan card and its "Seats" number box.
  4. Type a seat count, or use the up and down values, then check the price line changes ("Seats: ... /mo" or "/yr") and compare with Expected.
  5. Continue to checkout and check the seat count shown before paying.

## S83.29 Seat assignment.

- **Expected:** Admins can assign seats to members and see seats used vs licensed.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:126; apps/web/app/api/settings/team/invitations/route.ts:83
- **Where to find it:** Workspace > Members (seat counts appear on Workspace > Billing under "Plan and seats") (labels found in the code)
- **Needs:** a workspace admin account in a workspace with seats, and a second account in the same workspace to assign
- **Steps:**
  1. Sign in as a workspace admin and open the Workspace area.
  2. Click "Members" to see the people list, roles and invitations.
  3. Click "Billing" in the same Workspace area and read the "Plan and seats" section.
  4. Compare the "Seats used" row (for example "N of M") with the members list and the seat assignment controls.
  5. Invite or assign a member and check the seats used count changes.

## S83.30 Enterprise billing contacts.

- **Expected:** Enterprise admins can see (and have on record) billing and procurement contacts for their contract.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:301; apps/web/app/api/settings/organization/billing-contract/route.ts:124; apps/web/lib/services/enterprise-contracts/agreement-store.ts:30
- **Where to find it:** Workspace > Billing, then the "Enterprise contract" section and its "Contacts" part (labels found in the code)
- **Needs:** an enterprise contract on the workspace and an admin account
- **Steps:**
  1. Sign in as an enterprise organization admin and open Workspace, then Billing.
  2. Scroll to the "Enterprise contract" section (shown only when the plan has a contract).
  3. Read the "Contacts" part.
  4. Compare "Billing contact" and "Procurement contact" with the names on record; a missing one shows the not-on-record text.
  5. Check that these are read only, as the section caption says.

## S83.31 Purchase-order and invoicing workflows.

- **Expected:** Enterprise customers can buy through purchase orders and invoices (PO numbers on invoices, invoice terms, offline payment reporting).
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:280; apps/web/lib/services/enterprise-contracts/invoicing.ts:269; apps/web/db/neon/0288_enterprise_offline_payment_records.sql:33
- **Where to find it:** Workspace > Billing, then the "Enterprise contract" section: "Purchase order" row and "Invoices" section (labels found in the code)
- **Needs:** an enterprise contract with a purchase order number and an admin account
- **Steps:**
  1. Sign in as an enterprise organization admin and open Workspace, then Billing.
  2. In the "Enterprise contract" section, read the "Payment terms" and "Purchase order" rows.
  3. Scroll to the "Invoices" section and read the recent invoices, newest first.
  4. Compare the purchase order number and payment terms with the order form on record.
  5. Note that no screen for reporting a bank transfer was found; check whether offline payment reporting is shown anywhere.

## S83.32 Credit-purchase history.

- **Expected:** Users can see a history of their credit purchases.
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:108; apps/web/features/settings/sections/BillingSection.tsx:1246; apps/web/app/api/billing/credit-history/route.ts:24
- **Earlier check in the running app:** UI_ONLY: E010 [UI_ONLY; empty-state UI]: Billing shows current Free plan, credit-history and invoice areas. No paid invoice, purchase or payment flow exercised.
- **Where to find it:** Settings > Billing > "Credit history" (labels found in the code)
- **Needs:** a Free account shows the empty state; a paid or top-up account shows purchase rows
- **Steps:**
  1. Sign in and open Settings, then the "Billing" tab.
  2. Scroll to the "Credit history" section.
  3. Find rows labelled "Top-up purchase" for credit purchases.
  4. Compare each purchase row with the credits bought and the date.
  5. If there are no purchases, the empty text should say "No credit activity yet."
