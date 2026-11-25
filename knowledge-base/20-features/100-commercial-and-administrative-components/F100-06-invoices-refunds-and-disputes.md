---
id: "F100-06"
type: "feature"
title: "Invoices, refunds and disputes"
aliases: ["Invoice service (S100.18)", "Refund/dispute workflow (S100.19)", "Invoices and receipts", "refund request", "chargeback", "billing_refund_requests", "billing_disputes"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.18", "S100.19"]
depends_on: ["F100-03", "F100-04", "F100-05", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "table:billing_refund_requests", "table:billing_disputes", "table:credit_transactions", "file:apps/web/lib/services/billing-refund-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-06 Invoices, refunds and disputes

Shows a person their recent Stripe invoices and receipts, lets them request a refund on a payment, and applies refunds and card disputes to the plan and credits. Simple cases refund automatically; the rest go to staff. A won dispute restores the plan and credits; a lost one ends the held plan.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.18](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10018), [S100.19](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10019).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists the account's latest 24 invoices with links to the receipt and PDF; accepts customer refund requests and decides them by rule or sends them to an operator; reverses credits for refunded charges; places a hold on the plan and revokes credits when a dispute opens and restores or finalizes them when it closes.

**Why it exists.** Customers need receipts and a fair way to get money back, laws give statutory withdrawal rights in some countries, and card disputes must not leave credits spendable that the money no longer backs (S100.18, S100.19; apps/web/lib/services/billing-refund-service.ts:389-420).

**Who uses it.** Paying customers (invoices, refund request form); operations staff (refund operations page); Stripe and the card networks as event sources.

**Problems it solves**

- No proof of payment (Invoices and receipts page).
- Refund requests handled by hand every time (automatic settlement for statutory and unused cases, billing-refund-service.ts:713-775).
- Credits spent after a refund or lost dispute (credit reversal, refund-events.ts:147-216; dispute-events.ts:166-265).

**Use cases**

- A customer opens Invoices and receipts to download a PDF for expenses.
- A customer in the EEA or UK requests a refund within 14 days and is refunded in proportion to unused credits.
- A customer who never used the plan asks within 7 days and is refunded automatically.
- A bank dispute opens: the plan goes on hold and credits are revoked until it closes.

## 2. User experience

**Where to find it**

- Web: /billing/invoices headed 'Invoices and receipts', with 'Back to billing' on small screens (apps/web/app/billing/invoices/page.tsx:26, 22-24); Settings > Billing has an 'Invoices' section (BillingSection.tsx:1056).
- Web: refund request form on the refund policy page with 'Choose a payment…', 'Choose a reason…' and 'Your requests' (apps/web/app/refund-policy/RefundRequestForm.tsx:261, 283, 328).
- Web admin: Refund operations page (apps/web/features/admin/pages/RefundOperationsPage.tsx).
- Desktop: same web pages. Mobile, CLI, VS Code, Chrome: no invoice or refund screen found; mobile store purchases are refunded by the store (billing-refund-service.ts:1107-1151).

**Before you start**

- Signed in; a Stripe customer on the account for invoices and refunds (billing-invoice-service.ts:54).
- Staff with admin access for operator actions (api/admin/billing-refunds).

**Screens and controls**

- Invoice table with columns Date, Invoice, Total, Status, Receipt (InvoiceList.tsx:127-140).
- Messages 'Loading your invoices', 'No invoices yet. A paid plan produces one each billing period, and it appears here.', and 'Try again' on error (InvoiceList.tsx:70-110).
- Refund form fields: payment, reason, details (RefundRequestForm.tsx:252-299).

**Journey**

1. Open Billing, then Invoices and receipts; the page loads invoices from the server.
2. Download the PDF or open the hosted receipt.
3. To ask for a refund, open the refund form, choose the payment and a reason, add details, and send.
4. The server records the request and may refund at once or leave it pending for review; the person is notified of the decision.
5. The plan and credits change follow the refund.

**What the person sees and gets**

- A message when invoices are not available, or older invoices exist in the billing portal (InvoiceList.tsx:98-122).
- A status heading after a refund request (RefundRequestForm.tsx:238).
- A notification of the decision: card refund takes 5 to 10 business days, store refund goes to the store payment method (billing-refund-service.ts:560-566).
- A notification 'Your plan and credits are back' when a dispute is won (dispute-events.ts:431-441).

**Settings**

- None for the person; refund windows are 14 days statutory and 7 days for unused plans, set in apps/web/lib/billing/refund-requests.ts:1-2.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Invoices are read live from Stripe for the stored customer, newest first, at most 24, with line items; store and organization invoices are excluded (billing-invoice-service.ts:29, 38-102; invoices/page.tsx:28-30). Rate limit key billing-invoices (api/billing/invoices/route.ts:14).
- Customer refund requests: GET lists requests and refundable charges; POST files a request with CSRF, rate limit and an audit event refund_requested (api/billing/refund-requests/route.ts:48-137).
- Assessment: billing-error reasons go to review; statutory withdrawal in the EEA and UK within 14 days refunds the unused share; an unused plan or top-up within 7 days with no earlier discretionary refund refunds in full; otherwise review (billing-refund-service.ts:389-420; refund-requests.ts:1-2).
- Automatic settlement retries safely and leaves the request pending if Stripe refuses or is unfinished (billing-refund-service.ts:713-775).
- Operator tools: issue a refund, decline, record a store refund, look up an account (billing-refund-service.ts:890-1181; api/admin/billing-refunds/route.ts:228-229).
- On a refunded plan charge the current period's plan allowance is revoked in proportion and a full refund ends the entitlement; on a refunded top-up purchased credits are revoked (refund-events.ts:147-250, 251-342).
- Dispute opened: plan moves to past_due with cancel at period end, collection is paused, credits are revoked and recorded; won disputes restore credits and lift the hold; lost disputes end the plan (dispute-events.ts:166-265, 379-451, 483-528).
- Refund and dispute events arrive on the same webhook as checkout (handlers.ts:305-324).
- Refunds also reverse referral rewards (handlers.ts:307, 316).

**Incomplete**

- Early fraud warnings are only recorded; what to do about them is undecided (handlers.ts:325-365).
- A refunded plan's Stripe subscription is left alone unless an operator cancels it; the code notes this in a warning (refund-events.ts:239-244).

**Present but disconnected or switched off**

- Refunds need Stripe configured, else the form route says 'Refunds are not available in this deployment.' (refund-requests/route.ts:92-96).

**Not available**

- Invoice or refund screens in the mobile, CLI, VS Code and Chrome apps: none found. Store invoices: not listed (invoices/page.tsx:28-30).

## 4. Required behaviour

**Established requirements**

- An invoice service produces and lists invoices for each account with downloadable documents. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.18)
- Refunds and disputes are processed end to end: issued, reflected in plan and credits, and reversed when a dispute is won. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.19)
- Refund and chargeback policy and a dispute reserve are launch requirements for managed credits. (source: doc: docs/product/commercial.md (Managed Credit Requirements))
- Legal copies the leaders and the stricter wins; statutory withdrawal rights apply in the EEA and UK. (source: code: billing-refund-service.ts:44 (STATUTORY_WITHDRAWAL_COUNTRIES) and refund-requests.ts:1)

**Acceptance criteria**

1. The invoice page lists up to 24 invoices newest first with Date, Invoice, Total, Status and Receipt, and says when older ones exist.
2. With no Stripe customer the page says 'No invoices yet.'; with Stripe not configured it says invoices cannot be shown.
3. A refund request for a payment not on the account is refused with 404 'That payment is not on your account.'
4. A request inside the withdrawal window from an EEA or UK billing country is assessed statutory_withdrawal and refunded at the unused share.
5. A fully refunded plan charge for the current period revokes the plan and revokes credits; a repeat webhook delivery revokes nothing more.
6. A dispute opening revokes credits and holds the plan; a won dispute restores the credits and the plan; a lost one leaves them revoked and ends the plan.
7. Each refund request filing writes a refund_requested audit event.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An operator decision must also notify the customer; the code returns customerNotified for that purpose [inferred from billing-refund-service.ts:1107-1181].
- Statutory country lists should come from one shared EEA list [inferred from the import of EEA_COUNTRY_CODES, billing-refund-service.ts:23].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an invoice list for store-billed customers or link to the store receipt.
- [proposed] Decide the rule for early fraud warnings and record it in docs/product/commercial.md.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/billing/invoices | `apps/web/app/api/billing/invoices/route.ts` | Lists the account's invoices. |
| service | billing-invoice-service | `apps/web/lib/services/billing-invoice-service.ts` | readUserBillingInvoicePage reads Stripe (line 38). |
| screen | Invoices and receipts page | `apps/web/app/billing/invoices/page.tsx` | Page shell with the list and payment history. |
| component | InvoiceList | `apps/web/app/billing/invoices/InvoiceList.tsx` | Table, loading, error and empty states. |
| component | BillingPaymentHistory | `apps/web/features/billing/components/BillingPaymentHistory.tsx` | Credit purchase receipts below the invoice list. |
| endpoint | GET/POST /api/billing/refund-requests | `apps/web/app/api/billing/refund-requests/route.ts` | List and file customer refund requests. |
| component | RefundRequestForm | `apps/web/app/refund-policy/RefundRequestForm.tsx` | Customer refund form. |
| service | billing-refund-service | `apps/web/lib/services/billing-refund-service.ts` | Assess, settle, operator refund, store refund, decline (lines 389, 713, 783, 991, 1112, 1152). |
| config | refund windows | `apps/web/lib/billing/refund-requests.ts` | STATUTORY_WITHDRAWAL_DAYS 14 and UNUSED_REFUND_WINDOW_DAYS 7 (lines 1-2). |
| endpoint | GET/POST /api/admin/billing-refunds | `apps/web/app/api/admin/billing-refunds/route.ts` | Operator list, lookup and decisions (lines 228-229). |
| screen | RefundOperationsPage | `apps/web/features/admin/pages/RefundOperationsPage.tsx` | Operator screen. |
| service | refund-events | `apps/web/app/api/stripe-webhook/lib/refund-events.ts` | Credit reversal for refunded charges (lines 147, 178, 216, 251). |
| service | dispute-events | `apps/web/app/api/stripe-webhook/lib/dispute-events.ts` | Dispute hold, restore and close (lines 166, 379, 483, 530). |
| service | referral-events | `apps/web/app/api/stripe-webhook/lib/referral-events.ts` | Reverses referral rewards on refund or dispute. |
| service | duplicate-subscription-settlement | `apps/web/app/api/stripe-webhook/lib/duplicate-subscription-settlement.ts` | Separates refunds of duplicate subscriptions from the kept allocation. |
| service | stripe payments provider | `apps/web/lib/server/payments/stripe-provider.ts` | Charge, refund and subscription calls used by the refund service. |
| table | billing_refund_requests | `apps/web/db/neon/0299_billing_refunds_and_disputes.sql` | Customer refund requests with assessment and decision (line 82). |
| table | billing_disputes | `apps/web/db/neon/0299_billing_refunds_and_disputes.sql` | Dispute state, revoked and restored credits (line 33). |
| schema | store refund and pause states | `apps/web/db/neon/0362_store_refund_and_pause_states.sql` | Store charge refunds in the same request table. |
| service | mobile-iap-ledger-service | `apps/web/lib/services/mobile-iap-ledger-service.ts` | Files refund requests for store charges that were not granted (line 337). |
| endpoint | POST /api/stripe-webhook | `apps/web/app/api/stripe-webhook/route.ts` | Carries charge.refunded and charge.dispute events. |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | Tells the customer a refund or dispute outcome. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The invoices page requests the list from the server. | device and our servers | InvoiceList.tsx:38; api/billing/invoices/route.ts:13-36 |
| The server looks up the stored Stripe customer and asks Stripe for the invoices. | outside service | billing-invoice-service.ts:46-59 |
| A refund request is posted; the server checks CSRF, rate limit and that the charge belongs to the account, assesses it and may refund through Stripe at once. | our servers | api/billing/refund-requests/route.ts:75-120; billing-refund-service.ts:783-850 |
| Stripe processes the refund and later sends charge.refunded. | outside service | handlers.ts:305-309 |
| The webhook revokes credits in proportion and ends the entitlement for a fully refunded current period, in one transaction with de-duplication. | our servers | refund-events.ts:251-342; stripe-webhook/route.ts:72-76 |
| A dispute event revokes credits, pauses collection in Stripe and moves the plan to past_due; the close event restores or finalizes. | our servers | dispute-events.ts:166-265, 379-451, 483-528 |
| The person gets a notification of the outcome. | our servers | billing-refund-service.ts:551-576; dispute-events.ts:431-441 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Refund request: charge id, kind, amount, reason, details, billing country, assessment, decision | table billing_refund_requests | Server only; the form reads the person's own requests | Included in account export and erasure lists (api/user/export/route.ts, lib/server/account-erasure.ts reference the table); retention period unknown |
| Dispute record: amounts, outcome, revoked and restored credits | table billing_disputes | Server only | unknown |
| Credit reversal transactions | table credit_transactions | Server only | unknown |
| Invoice data | Stripe only; not copied (billing-invoice-service.ts:56-91) | Fetched on demand | Held by Stripe |

**Models and providers.** No model or model provider takes part. Stripe holds invoices, refunds and disputes; the stores hold store refunds. Plan allowance reversed by a refund later changes what limits apply (F100-02).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; invoice and refund routes use the user-scoped database (billing/invoices/route.ts:17-25; refund-requests/route.ts:34-46). |
| Permissions | A person sees only their own invoices and requests; a charge must belong to their Stripe customer (billing-refund-service.ts:805-808). Operator routes sit under /api/admin (admin access check not read in detail). |
| Subscription | Needs a Stripe customer (any plan that was ever bought on Stripe). Store-billed accounts have no invoice list here. |
| Limits and metering | Rate limit keys billing-invoices and billing-refund-request (refund-requests/route.ts:49, 78-83). Listing capped at 24 charges and invoices (billing-invoice-service.ts:29; billing-refund-service.ts:28). |
| Feature flags | Stripe configured (isStripeConfigured). No feature flag found for refunds. |
| Model compatibility | none found in the code. |
| Provider restrictions | Stripe for web charges; stores for store charges. |
| Local mode | none found in the code. Local and own-key use produce no charge and so no invoice or refund. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading invoices | Spinner with 'Loading your invoices'. | InvoiceList.tsx:70-77 |
| Invoice load error | Alert with message and 'Try again', pointing to the billing portal. | InvoiceList.tsx:79-94 |
| Stripe not configured | available false: 'Invoices cannot be shown right now.' | billing-invoice-service.ts:43; InvoiceList.tsx:98-105 |
| No customer or no invoices | 'No invoices yet.' message. | billing-invoice-service.ts:54; InvoiceList.tsx:107-113 |
| More than 24 invoices | Notice that older ones are in the billing portal. | InvoiceList.tsx:117-122 |
| Refund already requested for the charge | Returns the existing request and retries settlement if still pending. | billing-refund-service.ts:783-795 |
| Stripe refuses an automatic refund | Request stays pending for an operator. | billing-refund-service.ts:752-757 |
| Disputed charge | Stripe does not allow a refund while a dispute is open; message mapped. | billing-refund-service.ts:52-57 |
| Dispute event for an unknown customer | Logged 'Could not find user for disputed charge'; no change. | dispute-events.ts:195-201 |
| Offline in the app | not handled in the code beyond the error and retry control. | InvoiceList.tsx:79-94 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/billing/invoices/__tests__/route.test.ts`: By file name: the invoices route. Contents not read.
- `apps/web/lib/services/billing-invoice-service.test.ts`: By file name: the invoice service. Contents not read.
- `apps/web/app/billing/__tests__/InvoicesPage.test.tsx`: By file name: the invoices page. Contents not read.
- `apps/web/app/api/billing/refund-requests/route.test.ts`: By file name: the refund request route. Contents not read.
- `apps/web/app/refund-policy/RefundRequestForm.test.tsx`: By file name: the refund form. Contents not read.
- `apps/web/lib/services/billing-refund-service.test.ts`: By file name: refund assessment and settlement. Contents not read.
- `apps/web/lib/services/__tests__/billing-refund-service.concurrency.test.ts`: By file name: concurrent refund requests. Contents not read.
- `apps/web/app/api/stripe-webhook/lib/__tests__/dispute-stripe-hold.test.ts`: By file name: dispute hold in Stripe. Contents not read.
- `apps/web/app/api/stripe-webhook/lib/__tests__/dispute-audit.test.ts`: By file name: dispute audit events. Contents not read.
- `apps/web/app/api/stripe-webhook/lib/__tests__/referral-clawback.test.ts`: By file name: referral reversal. Contents not read.
- `apps/web/__tests__/api/stripe-refund.test.ts`: By file name: refund API. Contents not read.
- `apps/web/features/admin/pages/RefundOperationsPage.test.tsx`: By file name: operator page. Contents not read.

**Test scenarios**

- **List invoices**
  1. Sign in as a customer with Stripe invoices.
  2. Open /billing/invoices.
  3. Open a receipt and a PDF.
  - Expected: Invoices appear newest first with working links; with no customer the page shows 'No invoices yet.'
- **Automatic unused refund**
  1. In Stripe test mode buy a plan and use no credits.
  2. Within 7 days file a refund request for the charge from a non-statutory country.
  - Expected: Assessment unused_within_policy and a Stripe refund for the full amount; the customer is notified.
- **Statutory withdrawal**
  1. Buy with an EEA billing country and withdrawal consent.
  2. File a request within 14 days.
  - Expected: Assessment statutory_withdrawal and a refund of the unused share.
- **Refund webhook idempotence**
  1. Refund a plan charge fully in Stripe.
  2. Deliver charge.refunded twice.
  - Expected: Credits revoked once; entitlement ends once; the second delivery changes nothing.
- **Dispute lifecycle**
  1. Open a test dispute on a paid charge.
  2. Then close it as won in one run and as lost in another.
  - Expected: Open: plan past_due and credits revoked. Won: credits and plan restored with 'Your plan and credits are back'. Lost: plan ended and credits stay revoked.

**Where to look when it fails**

- Log lines 'CRITICAL: Charge dispute created', 'Plan credits revoked in proportion to the refunded share', 'Automatic refund could not be completed', 'Won dispute restored what its opening revoked'.
- Tables billing_refund_requests, billing_disputes, credit_transactions, processed_stripe_events.
- Audit events refund_requested and plan_changed.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief says refunds and disputes are started by staff or the provider, not the person. In the code a customer can file a refund request and many cases settle automatically.** Affects: Testers and writers of help text. Evidence: api/billing/refund-requests/route.ts:75-137; billing-refund-service.ts:713-775. Work needed: Correct the brief's use text.
- **The brief says the invoice service produces invoices. The code only lists Stripe's invoices; it produces none and stores none.** Affects: Engineers. Evidence: billing-invoice-service.ts:38-102. Work needed: Reword the requirement to listing and linking.
- **Store-billed and organization invoices are not listed.** Affects: surface:mobile customers and workspace owners. Evidence: apps/web/app/billing/invoices/page.tsx:28-30. Work needed: Decide where those documents live and link them.
- **Invoice listing stops at 24 and has no paging.** Affects: Long-time subscribers. Evidence: billing-invoice-service.ts:29; InvoiceList.tsx:117-122. Work needed: Add paging or a link to the portal in every case.
- **The brief's line numbers (billing-refund-service.ts:580, 764; dispute-events.ts:431) do not point to the credit reversal; that lives in refund-events.ts.** Affects: Engineers following the brief. Evidence: refund-events.ts:147-250. Work needed: Refresh the brief pointers.
- **Early fraud warnings are recorded but trigger no action.** Affects: Risk handling. Evidence: handlers.ts:325-365. Work needed: Owner decision on the risk response.

**Depends on**

- F100-03
- F100-04
- F100-05
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- table:billing_refund_requests
- table:billing_disputes
- table:credit_transactions
- file:apps/web/lib/services/billing-refund-service.ts

## Unknown

- Retention periods for refund requests, disputes and credit transactions.
- How admin access is checked on /api/admin/billing-refunds.
- Whether any app other than web shows a refund or invoice entry.
- Which countries make up the statutory list at runtime (EEA_COUNTRY_CODES plus GB; list contents not read).
- What happens to an Apple or Google refund notification beyond recordStoreRefund (notification services not read).
- Whether the refund policy page text matches the 14 and 7 day windows.
