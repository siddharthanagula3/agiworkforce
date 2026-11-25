---
id: "F083-08"
type: "feature"
title: "Billing history, invoices, receipts, refunds and credit purchases"
aliases: ["Billing history", "Invoices and receipts", "/billing/invoices", "Credit purchases", "Refunds table", "Credit history", "Request a refund", "Refund request form", "S83.16", "S83.17", "S83.18", "S83.19", "S83.20", "S83.32", "S83.33"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.16", "S83.17", "S83.18", "S83.19", "S83.20", "S83.32", "S83.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:GET /api/billing/invoices", "api:GET /api/billing/receipts", "api:GET /api/billing/refunds", "api:GET /api/billing/credit-history", "api:GET /api/billing/refund-requests", "api:POST /api/billing/refund-requests", "table:credit_transactions", "table:subscriptions", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-08 Billing history, invoices, receipts, refunds and credit purchases

Lets a person look back at what they paid. Web and Desktop (hosted web app) list invoices, credit-purchase receipts, refunds with status, and a credit ledger, and a refund request form sits on /refund-policy. Mobile only sends people to the web. Credit notes and a dedicated auto-reload history do not exist.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.16](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8316), [S83.17](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8317), [S83.18](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8318), [S83.19](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8319), [S83.20](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8320), [S83.32](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8332), [S83.33](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8333).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows invoices from the payment provider (up to 24, with hosted link and PDF link on the invoices page), credit-pack receipts and refunds with provider status, and the account's credit ledger from our database. Offers a refund request form. (apps/web/lib/services/billing-invoice-service.ts:26; apps/web/features/billing/components/BillingPaymentHistory.tsx:63-236; apps/web/app/api/billing/credit-history/route.ts:106-120; apps/web/app/refund-policy/RefundRequestForm.tsx:20)

**Why it exists.** People need proof of payment, a way to follow a refund and a record of credit changes (S83.16-S83.20, S83.32, S83.33).

**Who uses it.** Paying web subscribers and credit buyers on Web and Desktop; Mobile users who are sent to web invoices; finance and support who ask for receipts.

**Problems it solves**

- Cannot find an invoice or receipt for expenses.
- Does not know if a refund went through.
- Cannot see why the credit balance changed.
- Does not know how to ask for a refund.

**Use cases**

- A freelancer opens /billing/invoices and clicks 'PDF' to attach an invoice to an expense report.
- A buyer of a credit pack opens Settings, Billing and clicks 'View receipt' in 'Credit purchases'.
- A customer reads the 'Refunds' table and sees 'Processing' then 'Refunded'.
- A customer files a refund request on /refund-policy.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Billing, sections 'Invoices', 'Credit history', 'Credit purchases' and 'Refunds' (apps/web/features/settings/sections/BillingSection.tsx:1056,1246,1343; apps/web/features/billing/components/BillingPaymentHistory.tsx:86,150).
- Web and Desktop: page /billing/invoices titled 'Invoices and receipts' (apps/web/app/billing/invoices/page.tsx:9,26).
- Web and Desktop: form on /refund-policy (apps/web/app/refund-policy/RefundRequestForm.tsx).
- Mobile: a row 'View invoices' (or 'Invoices', value 'On the web') and 'Help with a purchase'; in the full screen only (apps/mobile/src/features/settings/cloud-billing/index.tsx:844-860).

**Before you start**

- Signed in.
- Invoices, credit purchases and refunds show only for web-billed (Stripe) plans (BillingSection.tsx:453,1343).
- Credit history loads for any signed-in billing account once the billing store is ready (BillingSection.tsx:573-600).
- Mobile rows appear only when native purchases are compiled on (apps/mobile/src/features/billing/storePurchases.json:2; cloud-billing/index.tsx:351).

**Screens and controls**

- Invoices table in Settings: columns Date, Total, Status, Actions; the action is 'Pay' for an open invoice or 'View' otherwise; 'Not issued yet' when there is no hosted link (BillingSection.tsx:1072-1155).
- /billing/invoices table: Date, Invoice, Total, Status, Receipt with links 'View' and 'PDF' (apps/web/app/billing/invoices/InvoiceList.tsx:107-173).
- Credit purchases table: Date, Credits, Paid, Status (Paid, Processing, Refunded, Partly refunded), Receipt link 'View receipt'; an 'Auto-reload' tag marks reload purchases (BillingPaymentHistory.tsx:21-26,108-166).
- Refunds table: Requested, For, Amount, Status (Processing, Action needed, Refunded, Failed, Canceled), Receipt 'View' (BillingPaymentHistory.tsx:28-34,181-232).
- Credit history table: Date, Description, Amount; types are purchases, refunds, bonuses, adjustments and usage debits (BillingSection.tsx:1246-1340).
- Refund form on /refund-policy: payment select, reason select, details box, confirm step (RefundRequestForm.tsx:252-301).

**Journey**

1. 1. Open Settings, Billing (or /billing/invoices).
2. 2. Wait for the loading skeleton or 'Loading credit purchases…'.
3. 3. Read the Invoices table; click 'View' or 'Pay'; on /billing/invoices click 'PDF' for the file.
4. 4. In 'Credit purchases' click 'View receipt'.
5. 5. In 'Refunds' read the status.
6. 6. In 'Credit history' read each credit change.
7. 7. To ask for a refund, open /refund-policy, choose a payment and a reason, read the consequence text, confirm.

**What the person sees and gets**

- Empty text: 'Invoices appear here once you are billed on a paid plan.' (Free), 'No invoices yet. Invoices appear here once your first billing cycle closes.' (paid), 'Receipts for this plan are issued by <store> and are not available here.' (store billed) (BillingSection.tsx:1171-1179).
- 'No credit purchases yet. Each one you make gets a receipt here.' (BillingPaymentHistory.tsx:99).
- 'No credit activity yet. Purchases, refunds, bonus grants, adjustments, and per-task usage debits will appear here as they happen.' (BillingSection.tsx:1337).
- Errors with 'Try again' for invoices, credit purchases and credit history (BillingSection.tsx:1158-1167,1325-1330; BillingPaymentHistory.tsx:91-97).
- When the list is cut: 'Showing your N most recent invoices. Older invoices are available from the billing portal in Settings.' (InvoiceList.tsx:128-132).
- Refund request result states: Waiting for a decision, Refunded, Declined (RefundRequestForm.tsx:22-26).

**Settings**

- None found in the code for this feature; auto-reload settings live in a separate panel (apps/web/features/billing/components/AutoReloadPanel.tsx imported at BillingSection.tsx:29).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/billing/invoices returns up to 24 invoices with number, status, amount, hosted link, PDF link and line items (apps/web/lib/services/billing-invoice-service.ts:26-95).
- GET /api/billing/receipts and GET /api/billing/refunds read credit purchases and refunds from the payment provider for the user's customer (apps/web/app/api/billing/receipts/route.ts:35-49; apps/web/app/api/billing/refunds/route.ts:35-49).
- GET /api/billing/credit-history reads the credit_transactions table (types purchase, adjustment, refund, bonus, deduction), labels usage rows by model name, and hides allocation and reset rows (apps/web/app/api/billing/credit-history/route.ts:21-27,106-120).
- Refund requests: GET and POST /api/billing/refund-requests with a charge id, reason and details, audit event 'refund_requested' (apps/web/app/api/billing/refund-requests/route.ts:30-36,124-134).
- Web pages and the hosted app on Desktop show all of the above. Tests exist for the routes and pages (see verification).

**Incomplete**

- Invoice list is capped at 24 with a note pointing to the portal for older ones (apps/web/lib/services/billing-invoice-service.ts:26; InvoiceList.tsx:128-132).
- Settings invoice table has only 'Pay' or 'View'; the PDF link exists only on /billing/invoices (BillingSection.tsx:1123-1140; InvoiceList.tsx:145-162).
- Credit history loads the default 50 rows and the page does not request more; the route supports limit and offset up to 100 (apps/web/app/api/billing/credit-history/route.ts:14-15,99-104; BillingSection.tsx:578) [inferred: no 'load more' control seen].
- The Refunds section is hidden when there are no refunds (BillingPaymentHistory.tsx:181).

**Present but disconnected or switched off**

- Mobile 'View invoices' and 'Help with a purchase' rows are in the full screen that is returned only when native purchases are compiled on; the shipped flag is false (apps/mobile/src/features/settings/cloud-billing/index.tsx:351,844-860; apps/mobile/src/features/billing/storePurchases.json:2). The reduced screen shows 'Billing' with 'Managed on the web' instead (index.tsx:385).

**Not available**

- Credit notes: no code found on any app (searched app, features and lib in apps/web for credit_note and Credit note).
- A dedicated auto-reload history: none; reload purchases appear only as an 'Auto-reload' tag in Credit purchases (BillingPaymentHistory.tsx:125-127; apps/web/lib/server/payments/stripe-provider.ts:854).
- Mobile: no invoice download, no refund status, and /api/billing/credit-history is not called by the app (brief S83.32; I did not search all mobile files, only the billing screen and store).
- CLI, VS Code and Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- Users can see a list of past bills (invoices and credit purchases). (source: S83.16)
- Users can download an invoice (PDF) and a receipt for every payment, including one-off credit purchases. (source: S83.17, S83.18)
- Users can see credit notes issued against their invoices. (source: S83.19 (missing on every app))
- Users can see refund status (requested, processing, refunded). (source: S83.20)
- Users can see a history of credit purchases and of automatic reloads. (source: S83.32, S83.33)
- Customers request refunds on /refund-policy and operators refund from /admin/refunds; both issue the refund in the payment provider. (source: doc: docs/product/commercial.md:204-206)
- Refund status labels come from the provider, empty states explain why, failures show an error with Try again. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S83.16, S83.17, S83.18, S83.19, S83.20, S83.32, S83.33)

**Acceptance criteria**

1. A web-billed paid account sees its invoices newest first, each with 'View' (and 'PDF' on /billing/invoices).
2. A credit-pack purchase appears in 'Credit purchases' with the right status and a 'View receipt' link.
3. A partial refund shows 'Partly refunded' on the purchase and a row in 'Refunds'.
4. A Free account sees 'Invoices appear here once you are billed on a paid plan.'
5. An Apple or Google billed account sees the store receipt message.
6. When the provider call fails, an error and 'Try again' appear and are not replaced by an empty state.
7. Credit history shows usage debits labelled 'Usage: <model name>' and hides allocation and reset rows.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should at least show a link to web invoices when links are allowed, and the credit ledger should be readable on mobile [inferred from S83.32].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the PDF link to the Settings invoices table so both screens match.
- [proposed] Add a load-more control to Credit history.
- [proposed] Add credit notes and a dedicated auto-reload history list, built from provider data.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | BillingSection (Invoices, Credit history) | `apps/web/features/settings/sections/BillingSection.tsx` | Fetches and renders invoices and credit history; mounts BillingPaymentHistory. |
| component | BillingPaymentHistory | `apps/web/features/billing/components/BillingPaymentHistory.tsx` | Credit purchases and Refunds tables with status labels. |
| screen | /billing/invoices page | `apps/web/app/billing/invoices/page.tsx` | Page titled 'Invoices and receipts' combining invoices and payment history. |
| component | InvoiceList | `apps/web/app/billing/invoices/InvoiceList.tsx` | Invoice table with View and PDF links and the 'more not shown' note. |
| endpoint | GET /api/billing/invoices | `apps/web/app/api/billing/invoices/route.ts` | Returns invoices, available and hasMore flags. |
| service | readUserBillingInvoicePage | `apps/web/lib/services/billing-invoice-service.ts` | Lists the last 24 invoices from the provider for the stored customer id. |
| endpoint | GET /api/billing/receipts | `apps/web/app/api/billing/receipts/route.ts` | Credit purchase receipts from the provider. |
| endpoint | GET /api/billing/refunds | `apps/web/app/api/billing/refunds/route.ts` | Refunds with provider status. |
| service | readPaymentHistory | `apps/web/lib/server/payments/stripe-provider.ts` | Builds receipts and refunds from payment intents; sets autoReload and receipt URL. |
| endpoint | GET /api/billing/credit-history | `apps/web/app/api/billing/credit-history/route.ts` | Reads credit_transactions; maps rows to labels, credits and model names. |
| table | credit_transactions | `apps/web/app/api/billing/credit-history/route.ts` | Ledger rows of the user (query at line ~108). |
| endpoint | GET and POST /api/billing/refund-requests | `apps/web/app/api/billing/refund-requests/route.ts` | Lists refundable charges and requests; files a request with CSRF and rate limit. |
| service | billing-refund-service | `apps/web/lib/services/billing-refund-service.ts` | Files and lists refund requests and refundable charges. |
| component | RefundRequestForm | `apps/web/app/refund-policy/RefundRequestForm.tsx` | Form on /refund-policy with consequence text and confirmation. |
| service | billing-account service | `apps/web/features/billing/services/billing-account.ts` | Client fetches fetchTopUpReceipts and fetchRefunds. |
| config | billing-format helpers | `apps/web/features/billing/lib/billing-format.ts` | formatBillingDate and formatBillingMoney used by every table. |
| component | AutoReloadPanel | `apps/web/features/billing/components/AutoReloadPanel.tsx` | Auto-reload settings (not a history). |
| endpoint | /api/billing/auto-reload | `apps/web/app/api/billing/auto-reload/route.ts` | Reads and saves auto-reload settings. |
| screen | Mobile plan screen invoice rows | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | 'View invoices' opens https://agiworkforce.com/billing; gated by native-purchase flag. |
| screen | /billing page | `apps/web/app/billing/page.tsx` | Redirects to /settings/billing unless it is a checkout success return. |
| test | InvoicesPage test | `apps/web/app/billing/__tests__/InvoicesPage.test.tsx` | Covers the invoices page states. |
| config | Desktop hosted-app origin | `apps/desktop/electron/config.ts` | The Desktop window loads the web app, so these screens appear unchanged. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Settings page waits for the billing store, then fetches invoices and payment methods in parallel, and credit history separately. | device | apps/web/features/settings/sections/BillingSection.tsx:466-600 |
| The invoices route authenticates, applies the rate limit and reads the stored customer id from the subscriptions table. | our servers | apps/web/app/api/billing/invoices/route.ts:14-36; apps/web/lib/services/billing-invoice-service.ts:35-45 |
| The server lists invoices from the payment provider (limit 24) and returns them with hosted and PDF links. | outside service | apps/web/lib/services/billing-invoice-service.ts:46-95 |
| Receipts and refunds routes read payment intents and refunds from the provider for the user's customer. | outside service | apps/web/app/api/billing/receipts/route.ts:35-45; apps/web/lib/server/payments/stripe-provider.ts:882-898 |
| Credit history is a database query on credit_transactions filtered to user-facing types, newest first. | our servers | apps/web/app/api/billing/credit-history/route.ts:106-120 |
| Clicking a View, PDF or receipt link opens the provider's hosted page in a new tab (system browser on Desktop). | outside service | BillingSection.tsx:1124-1134; apps/desktop/electron/windowPolicy.ts:293-299 |
| A refund request is posted with CSRF and rate limit, assessed and stored; an audit event is recorded. | our servers | apps/web/app/api/billing/refund-requests/route.ts:92-134 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Invoices, receipts, refunds | Payment provider | Read live per request; nothing cached by this feature | Held by the provider; retention disclosure test exists (apps/web/__tests__/billing-record-retention-disclosure.test.ts); details unknown |
| Credit ledger rows | table:credit_transactions | Server side; clients read through the API | unknown |
| Refund requests | billing_refund_requests (named in doc: docs/product/commercial.md:220) | Server side | unknown |

**Models and providers.** The credit-history route turns a stored route id into the model's display name using the model catalog, and deliberately hides the serving provider and route detail (apps/web/app/api/billing/credit-history/route.ts:44-56,125-135). No model is called. The payment provider is Stripe, not a folder under packages/ai/providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for every route; /refund-policy shows a sign-in link when signed out (RefundRequestForm.tsx:24,141-145). |
| Permissions | Own data only; routes use the user-scoped database handle (apps/web/app/api/billing/credit-history/route.ts:79-86). No workspace permission is needed for personal billing. |
| Subscription | Invoices and receipts need a web-billed plan with a stored customer; store-billed users get a message that receipts come from the store (BillingSection.tsx:1171). Credit history needs no paid plan. |
| Limits and metering | Invoice page limit 24; credit history default 50, maximum 100 per call (credit-history/route.ts:14-15); rate limit key 'billing-invoices' on reads and 'billing-refund-request' on refund posts. |
| Feature flags | None found in the code for these screens. Mobile rows depend on nativePurchases in storePurchases.json (false). |
| Model compatibility | Usage rows show the model name from the catalog; unknown model ids fall back to the raw id (credit-history/route.ts:56). |
| Provider restrictions | Invoice, receipt and refund lists exist only for the web payment provider's customers; Apple and Google receipts are in the stores. |
| Local mode | Local inference creates no invoices and needs no subscription. On Mobile in Local mode the account is not read (apps/mobile/src/features/billing/store.ts:73), so no billing history is reachable. Web and Desktop history screens need sign-in; behaviour of Desktop screens offline or without an account: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Skeleton rows for invoices; 'Loading credit purchases…'; 'Loading credit history…'. | BillingSection.tsx:1057-1065,1333; BillingPaymentHistory.tsx:89 |
| Empty | Specific explanation per account type (free, paid, store, organization, hand-granted plan). | BillingSection.tsx:1168-1180 |
| Error | Error text plus 'Try again' that bumps a refresh counter and reloads. | BillingSection.tsx:1158-1167,1318-1330 |
| Payment provider not configured | Invoices route returns available=false and the page says 'Invoices cannot be shown right now.'; receipts and refunds return empty lists. | billing-invoice-service.ts:40; InvoiceList.tsx:87-93; receipts/route.ts:32 |
| Too many invoices | Page says only the most recent are shown. | InvoiceList.tsx:128-132 |
| Invoice not issued | Shows 'Not issued yet' instead of a dead link. | BillingSection.tsx:1141-1143; InvoiceList.tsx:163-165; BillingPaymentHistory.tsx:160-162 |
| Refund form, signed out or session refused | Sign-in prompt kept; submit failures stay visible with retry. | RefundRequestForm.tsx:141-145,209; tests RefundRequestForm.test.tsx:153,280 |
| Offline | not handled in the code beyond generic load errors. | searched BillingSection.tsx, InvoiceList.tsx, BillingPaymentHistory.tsx |
| Accessibility | Tables carry sr-only captions and scope headers; Enterprise invoice links have unique names; /billing/invoices has a 48px back row below md. | InvoiceList.tsx:108-111; BillingPaymentHistory.tsx:111; apps/web/app/billing/__tests__/InvoicesPage.test.tsx:106 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/billing/__tests__/InvoicesPage.test.tsx`: Lists invoices with receipt links; 'Not issued' wording; empty state; failed load points to portal; older invoices note; unavailable source is not an empty history; mobile back row.
- `apps/web/app/api/billing/receipts/route.test.ts`: Lists own receipts; refuses without session; MFA refusal; rate limit; no receipts when billing not configured or never paid; failure message.
- `apps/web/app/api/billing/refunds/route.test.ts`: Lists own refunds and status; session, MFA, rate-limit and not-configured cases; provider failure message.
- `apps/web/app/api/billing/credit-history/route.test.ts`: Credit history route; individual cases not read.
- `apps/web/app/api/billing/refund-requests/route.test.ts`: Refund request route; individual cases not read.
- `apps/web/lib/services/billing-invoice-service.test.ts`: Invoice page reading; individual cases not read.
- `apps/web/lib/services/billing-refund-service.test.ts`: Refund request service; individual cases not read.
- `apps/web/app/refund-policy/RefundRequestForm.test.tsx`: Form loading, sign-in state, confirmation with CSRF, retry after refusal, account-change safety.
- `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx`: 'keeps failed billing detail requests distinct from honest empty states' (line 547); invoices ordering and labelled columns (line 873); released reservation shown as credit back (line 759); store-billed receipt message (lines 172, 208).
- `apps/web/__tests__/api/stripe-refund.test.ts`: Refund handling; individual cases not read.

**Test scenarios**

- **Invoice list and PDF**
  1. Sign in as a web-billed paid user with at least one paid invoice.
  2. Open /billing/invoices.
  3. Click 'View' and 'PDF'.
  - Expected: Table lists invoices newest first; both links open the hosted invoice and the PDF in new tabs.
- **Credit pack receipt**
  1. Buy a credit pack in test mode.
  2. Open Settings, Billing and find 'Credit purchases'.
  - Expected: Row with Credits, Paid, Status 'Paid' and 'View receipt'.
- **Partial refund status**
  1. Refund part of a credit pack from the operator side.
  2. Reload Settings, Billing.
  - Expected: Status 'Partly refunded' and a row in 'Refunds' with its status.
- **Empty states**
  1. Open Settings, Billing as a Free user, then as an Apple-billed user.
  - Expected: Free: 'Invoices appear here once you are billed on a paid plan.' Apple: 'Receipts for this plan are issued by Apple...'.
- **Provider failure**
  1. Make the invoices call fail (test double or blocked provider).
  2. Open Settings, Billing and click 'Try again'.
  - Expected: Error text with 'Try again', never the 'No invoices yet' text.
- **Credit history labels**
  1. Spend credits on a chat turn and open Credit history.
  - Expected: A row 'Usage: <model name>' with a negative amount; no allocation or reset rows.

**Where to look when it fails**

- Logs: 'Failed to fetch Stripe invoices', 'Failed to read top-up receipts from Stripe', 'Failed to read refunds from Stripe', 'Failed to fetch credit history' (route files).
- User messages: 'Your credit purchase receipts could not be loaded. Please try again.' and 'Your refunds could not be loaded. Please try again.'
- Table credit_transactions; audit event refund_requested.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **Credit notes are not shown anywhere.** Affects: Web, Desktop, Mobile. Evidence: No credit_note or Credit note text in apps/web app, features or lib; brief S83.19 missing. Work needed: Read credit notes from the provider and add a table beside invoices.
- **No dedicated automatic-reload history; only an 'Auto-reload' tag on purchases.** Affects: Web, Desktop, Mobile. Evidence: apps/web/features/billing/components/BillingPaymentHistory.tsx:125-127; brief S83.33. Work needed: A filtered list or section for reload purchases and failed reload attempts.
- **Mobile has no download, refund status or credit ledger; 'View invoices' is unreachable in the shipped build.** Affects: Mobile. Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:351,844; storePurchases.json:2. Work needed: Add a read-only credit history from /api/billing/credit-history and web links where store rules allow.
- **Settings invoices table lacks the PDF link.** Affects: Web and Desktop. Evidence: BillingSection.tsx:1123-1140 versus InvoiceList.tsx:145-162. Work needed: Add the PDF link.
- **Brief says invoices show a Receipt link and a 'Payment history' heading; the code uses 'View'/'Pay' and the headings 'Credit purchases' and 'Refunds'.** Affects: Documentation. Evidence: BillingPaymentHistory.tsx:86,150; no 'Payment history' string found in apps/web app or features. Work needed: Correct the brief wording.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:GET /api/billing/invoices
- api:GET /api/billing/receipts
- api:GET /api/billing/refunds
- api:GET /api/billing/credit-history
- api:GET /api/billing/refund-requests
- api:POST /api/billing/refund-requests
- table:credit_transactions
- table:subscriptions
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-data-model-and-migrations

## Unknown

- Retention period for invoices, ledger rows and refund requests.
- Whether any other mobile file calls /api/billing/credit-history (brief says never).
- Whether the admin refund flow at /admin/refunds updates the statuses shown here without delay.
- What 'Receipt' versus hosted invoice means for card-billed invoices at the provider.
- Whether Desktop-specific handling changes any of these screens: Desktop loads the hosted app, no separate code found.
