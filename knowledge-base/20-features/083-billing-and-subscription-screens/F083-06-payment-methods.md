---
id: "F083-06"
type: "feature"
title: "Payment methods"
aliases: ["Payment methods (S83.09, S83.10)", "Payment section", "Manage cards", "Add payment method", "Manage billing", "Billing portal", "GET /api/billing/payment-methods", "POST /api/portal"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.09", "S83.10"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "api:GET /api/billing/payment-methods", "api:POST /api/portal", "api:GET /api/billing/invoices", "table:subscriptions", "table:profiles", "file:apps/web/lib/server/subscription-billing-owner.ts", "F083-02", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-06 Payment methods

In Settings, Billing a Stripe-billed user sees saved cards (brand, last four, expiry, a Default tag). Adding, changing, removing or choosing the default card happens on the payment provider's hosted billing portal, opened by 'Manage cards', 'Add payment method' or 'Manage billing'. Store-billed and organization-managed users get a message instead.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.09](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8309), [S83.10](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8310).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists the payment methods the provider will charge and opens the hosted portal for changes.

**Why it exists.** Users can add a payment method (S83.09) and see and manage saved methods: default, update, remove (S83.10). Card data stays with the provider, so the product shows a read-only list and hands changes to the portal.

**Who uses it.** Paying users whose plan is billed by Stripe on web and Desktop.

**Problems it solves**

- Failed renewal because the card expired.
- Not knowing which card will be charged.
- Keeping card details out of our systems.

**Use cases**

- User checks the card expiry before renewal.
- User adds a new card after a failed payment.
- User changes the default card in the portal.
- A user billed by Apple opens Billing and is told to manage the plan in the App Store.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Billing, heading 'Payment' (apps/web/features/settings/sections/BillingSection.tsx:938).
- Button 'Manage billing' in the plan area (BillingSection.tsx:883-893).
- Mobile: not in the shipped build. Subscription screen row 'Billing' says 'Managed on the web' for web-billed plans (apps/mobile/src/features/settings/cloud-billing/index.tsx:376-388). A 'Manage billing' row that calls POST /api/portal exists only in the purchase-on branch (index.tsx:561-578; apps/mobile/src/features/billing/service.ts:10).
- CLI: failed payment message points to Settings > Billing (apps/cli/src/usage_summary.rs:321). Chrome opens /settings/billing?from=chrome-extension (apps/extension/src/side_panel.ts:14143).

**Before you start**

- Signed-in account billed by Stripe: the Payment section shows only when the billing source is stripe (BillingSection.tsx:431).
- For a never-paid account the portal also needs upgrade access (apps/web/app/api/portal/route.ts:143-168).

**Screens and controls**

- Card row: brand name, '•••• <last4>', 'Default' tag, 'Expires <MM/YY>' (BillingSection.tsx:963-1003).
- Empty state text 'No card on file' with button 'Add payment method' (BillingSection.tsx:1009-1033).
- Error state 'Payment method unavailable' with button 'Open billing portal', an alert with the message and a 'Try again' button (BillingSection.tsx:1008-1052).
- Button 'Manage cards' when cards exist; 'Opening…' while the portal is created.

**Journey**

1. Open Settings, Billing and find 'Payment'.
2. Read each card: brand, last four, expiry and which is Default.
3. Click 'Manage cards' (or 'Add payment method' / 'Manage billing').
4. The portal opens (Desktop opens your browser).
5. Add, update, remove or set default there, then return.
6. The page rereads your account when you come back.

**What the person sees and gets**

- Loading skeleton while cards load (BillingSection.tsx:940-947).
- Error below the buttons: 'Could not open billing portal.' or the server message (BillingSection.tsx:327-336,921-933).
- Store or organization owner messages from the server, for example 'This subscription is billed by Apple. Manage or cancel it with Apple before starting web billing.' (apps/web/lib/server/subscription-billing-owner.ts:137-141).
- For store-billed plans the buttons 'Manage in the App Store' or 'Manage on Google Play' (BillingSection.tsx:883).

**Settings**

- The set of things the portal allows is the provider's portal configuration, not in the repository (unknown).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/billing/payment-methods returns every payment method type of the customer with is_default, card brand, last4 and expiry, billing details and creation time (apps/web/app/api/billing/payment-methods/route.ts:78-107).
- The default is the subscription's own default method if set, else the customer default; if the subscription cannot be read the whole list fails rather than naming the wrong card (route.ts:56-73,110-113).
- Without Stripe or customer the list is empty (route.ts:33-42).
- POST /api/portal opens a billing portal session, with an optional return path (must start with '/') and an optional cancel flow (apps/web/app/api/portal/route.ts:45-59,424-440).
- Portal is refused for store or organization billing owners with an explanation (portal/route.ts:170-172; subscription-billing-owner.ts:123,137-151).
- Portal needs CSRF and a rate limit bucket 'portal' (portal/route.ts:109-117).
- UI loads cards with invoices in parallel and handles loading, error, empty and ready states (BillingSection.tsx:481-545).
- Desktop opens the portal in the user's browser and rereads the plan on return (apps/web/features/billing/services/stripe-payments.ts:35-46,162-190).

**Incomplete**

- The list shows only cards: entries without a card object (for example Link) are filtered out, so a user who paid with Link sees 'No card on file' (BillingSection.tsx:603-605).

**Present but disconnected or switched off**

- Mobile 'Manage billing' (portal) row exists but is in the purchase-on branch (cloud-billing/index.tsx:351,561-578).

**Not available**

- Add, update, remove or default inside the product; only in the portal (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-27).
- Payment method management on CLI, VS Code, Chrome (they point to web billing).

## 4. Required behaviour

**Established requirements**

- Users can add a payment method. (source: S83.09)
- Users can see and manage saved payment methods (default card, update, remove). (source: S83.10)
- The list is read-only in the product; changes happen in the provider's hosted portal. (source: S83.10 (apps/web/app/api/portal/route.ts))
- A plan billed on the web is managed on the web: mobile links out for the card and has no in-app form. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-27))
- Users whose subscription is billed by Apple or Google are told to manage it in that store. (source: S83.26)

**Acceptance criteria**

1. For a Stripe-billed user, Settings, Billing shows each saved card with brand, last four and expiry, and exactly one Default tag matching the card Stripe will charge.
2. 'Manage cards' opens the hosted portal and returns to the app.
3. With no card the page shows 'No card on file' and 'Add payment method'.
4. If the list fails to load the page shows 'Payment method unavailable', the reason and a working 'Try again'.
5. A store-billed or organization-managed user cannot open the Stripe portal and sees who owns billing.
6. A user who paid with a non-card method still sees that a payment method exists [proposed fix of current gap].
7. No card number is ever stored in our database.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'Mobile n/a' is consistent with the shipped build, which shows 'Managed on the web' text without a link [inferred from the NoPurchasesBilling test title at apps/mobile/__tests__/NoPurchasesBilling.test.tsx:151].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show non-card methods (for example Link) in the list with a type label.
- [proposed] Name the card that will be charged next, as the upgrade order screen already does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/billing/payment-methods | `apps/web/app/api/billing/payment-methods/route.ts` | Read-only list with default marking. |
| endpoint | POST /api/portal | `apps/web/app/api/portal/route.ts` | Creates the hosted portal session. |
| service | Billing owner row | `apps/web/lib/server/billing-owner-row.ts` | Reads the owner row and customer id. |
| service | Billing owner policy | `apps/web/lib/server/subscription-billing-owner.ts` | canOpenStripePortal and messages. |
| service | Waitlist access | `apps/web/lib/server/billing-waitlist-access.ts` | hasPaidBillingHistory and gate used by the portal. |
| screen | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Payment section UI, openPortal, states. |
| service | Stripe payments client | `apps/web/features/billing/services/stripe-payments.ts` | fetchSavedPaymentMethods, openBillingPortal, goToHostedBilling. |
| service | Browser handoff | `apps/web/features/desktop-host/lib/browser-handoff.ts` | Opens the portal in the browser from Desktop. |
| config | Desktop openExternal | `apps/desktop/electron/main.ts` | Opens http(s) links in the system browser. |
| component | BillingPlanNotices | `apps/web/features/billing/components/BillingPlanNotices.tsx` | Uses the default card label in notices. |
| service | Mobile portal client | `apps/mobile/src/features/billing/service.ts` | Calls POST /api/portal (purchase-on branch). |
| screen | Mobile subscription screen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Shows 'Managed on the web' in the shipped build. |
| table | subscriptions | `apps/web/app/api/portal/route.ts` | Source and Stripe ids (read at line 124-130). |
| table | profiles | `apps/web/app/api/portal/route.ts` | stripe_customer_id (read at line 183-186). |
| test | Payment methods route test | `apps/web/app/api/billing/payment-methods/route.test.ts` | Default selection and failures. |
| test | Portal route test | `apps/web/app/api/portal/route.test.ts` | Portal opening and refusals. |
| test | BillingSection test | `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx` | Card list, empty state, Manage cards. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Settings, Billing loads and calls GET /api/billing/payment-methods and invoices together. | device and our servers | apps/web/features/settings/sections/BillingSection.tsx:481-545 |
| Server finds the customer and asks the provider for the customer, subscription default and payment methods. | outside service | apps/web/app/api/billing/payment-methods/route.ts:38-80 |
| User clicks a manage button; page posts /api/portal with CSRF and an idempotency key. | device and our servers | apps/web/features/billing/services/stripe-payments.ts:162-182 |
| Server checks owner policy and gate, then creates the portal session with a safe return path. | our servers | apps/web/app/api/portal/route.ts:120-172,424-440 |
| Browser goes to the portal (Desktop opens the system browser); the user edits cards there. | outside service | apps/web/features/billing/services/stripe-payments.ts:35-46,189 |
| On return the window rereads the plan and billing queries. | device and our servers | apps/web/features/billing/services/stripe-payments.ts:35-38 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Card brand, last four, expiry, default flag | Payment provider; sent to the page on request | Not stored by us | Provider-owned; page state only |
| Billing details name, email and address on each method | Returned by the API to the page; not stored by us | No | Page state only (route.ts:94-105) |
| Audit event billing_portal_opened | Security audit log | No | Retention unknown |

**Models and providers.** No AI model is involved. The payment provider (Stripe) holds the methods and hosts the portal.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; the route uses the user-scoped database and refuses unauthenticated calls (payment-methods/route.ts:22-31). |
| Permissions | CSRF token for the portal. Team billing role checks were not found in these two routes (unknown for organization admins). |
| Subscription | Portal only for Stripe-billed subscriptions (subscription-billing-owner.ts:123); never-paid accounts also need upgrade access (portal/route.ts:143-168). |
| Limits and metering | Rate limit buckets 'billing-payment-methods' and 'portal' (route.ts:19; portal/route.ts:114). |
| Feature flags | STRIPE_SECRET_KEY must be set; otherwise the list is empty and the portal answers 503 'Stripe is not configured.' (payment-methods/route.ts:33; portal/route.ts:117-119). |
| Model compatibility | None found in the code. |
| Provider restrictions | Stripe only; Apple, Google and organization plans refused with owner messages. |
| Local mode | Not applicable: Local and own-key need no payment method; the Payment section only shows for Stripe-billed paid accounts. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Skeleton row. | BillingSection.tsx:940-947 |
| Empty | 'No card on file' and 'Add payment method'. | BillingSection.tsx:1009-1031; test BillingSection.test.tsx:700 |
| Error loading | 'Payment method unavailable', alert text and 'Try again'. | BillingSection.tsx:1008,1036-1051 |
| Portal fails to open | Error under the buttons; controls handed back. | BillingSection.tsx:327-336; test BillingSection.test.tsx:595 |
| Cancellation flow not enabled in portal | 409 'cancellation_unavailable' message. | apps/web/app/api/portal/route.ts:402-415 |
| Desktop | Opens the browser and hands controls back. | BillingSection.test.tsx:611; stripe-payments.ts:35-46 |
| Subscription default unreadable | Whole list fails with 'Failed to fetch payment methods'. | payment-methods/route.ts:56-73,110-113; route.test.ts:142 |
| Non-card method (Link) | Hidden from the card list; shows as no card. | BillingSection.tsx:603-605 |
| Accessibility | Error uses role alert; buttons are real buttons. | BillingSection.tsx:1036-1040 |
| Offline | not handled in the code beyond the load error state. | BillingSection.tsx:526-531 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/billing/payment-methods/route.test.ts`: Customer lookup, default selection, failures, auth.
- `apps/web/app/api/portal/route.test.ts`: Portal opening, store refusals, email-match safety.
- `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx`: Card list with Default pill, empty state, Manage cards, portal failure, Desktop handoff.
- `apps/web/features/billing/services/stripe-payments.test.ts`: Client calls.
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: Mobile web-billed wording without a link.

**Test scenarios**

- **Card list**
  1. Sign in with a Stripe-billed plan and two cards.
  2. Open Settings, Billing.
  - Expected: Both cards listed, the subscription's default first with one Default tag.
- **Add card**
  1. Click 'Manage cards'.
  2. Add a card in the portal.
  3. Return.
  - Expected: New card appears after the page rereads.
- **Store-billed user**
  1. Sign in with an Apple-billed plan.
  2. Open Settings, Billing.
  - Expected: No Payment section; 'Manage in the App Store' button; a portal call returns the Apple message.
- **Non-card method**
  1. Pay with a Link method.
  2. Open Settings, Billing.
  - Expected: Currently shows 'No card on file' (known gap).
- **Portal failure**
  1. Make /api/portal fail.
  2. Click 'Manage billing'.
  - Expected: Error line under the buttons and buttons enabled again.

**Where to look when it fails**

- Server log 'Failed to fetch Stripe payment methods' (payment-methods/route.ts:111) and 'Failed to create Stripe portal session' (portal/route.ts:431).
- Audit event billing_portal_opened.
- Tables subscriptions and profiles for the customer id.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **Non-card payment methods are hidden by the card filter.** Affects: Web, Desktop users paying with Link or other methods. Evidence: apps/web/features/settings/sections/BillingSection.tsx:603-605 versus the all-types list at apps/web/app/api/billing/payment-methods/route.ts:75-80. Work needed: List non-card methods too.
- **What users can do in the portal (add, remove, default) is provider configuration and was not verified.** Affects: Web, Desktop. Evidence: apps/web/app/api/portal/route.ts:424-428 creates a session with no configuration id. Work needed: Check the Stripe portal configuration and record it.
- **Brief names the section 'Payment methods'; the heading in code is 'Payment'.** Affects: Documentation. Evidence: apps/web/features/settings/sections/BillingSection.tsx:938. Work needed: Update the brief.
- **No payment method view on mobile in the shipped build; web-billed users only see 'Managed on the web'.** Affects: Mobile. Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:376-388. Work needed: None per decision D-2026-09-28-27 (link out), but the link is not shown unless purchases are on.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- api:GET /api/billing/payment-methods
- api:POST /api/portal
- api:GET /api/billing/invoices
- table:subscriptions
- table:profiles
- file:apps/web/lib/server/subscription-billing-owner.ts
- F083-02
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-authentication-and-identity

## Unknown

- Portal configuration at the provider (which actions are allowed).
- Whether organization admins on Team can open the portal for the team's card (no role check found in these routes).
- Retention of billing_portal_opened audit events.
- VS Code payment-failure handling file lines cited in the brief were not opened by this page.
- Whether the Electron window blocks or allows the external browser for the Stripe domain beyond the https check (only protocol check seen).
