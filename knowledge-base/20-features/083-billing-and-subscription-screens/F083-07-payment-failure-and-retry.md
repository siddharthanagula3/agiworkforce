---
id: "F083-07"
type: "feature"
title: "Payment failure and retry"
aliases: ["Payment failure and retry", "Failed-payment notice", "Past due notice", "Payment issue page", "/payment-failure", "Pay open invoice", "Update payment method", "S83.14", "S83.15", "Payment didn't go through"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S83.14", "S83.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:GET /api/billing/invoices", "api:POST /api/portal", "api:POST /api/checkout", "api:GET /api/me", "table:subscriptions", "file:apps/web/features/billing/components/BillingPlanNotices.tsx", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-07 Payment failure and retry

When a renewal payment fails, AGI Workforce tells the person on every app that the plan is past due or unpaid and where to fix it. Web and Desktop (the hosted web app) offer 'Pay <amount> now' and 'Update payment method'. CLI, VS Code and Chrome point to web billing. Mobile shows a status sentence only.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.14](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8314), [S83.15](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8315).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Detects a subscription in the past_due or unpaid state and shows a clear message that paid features are paused, with the way to pay the open invoice or change the card. Also explains on a public page why a payment fails. Pricing and the upgrade page block new upgrades while payment is overdue and send the person to Billing. (apps/web/features/billing/components/BillingPlanNotices.tsx:115; apps/web/app/payment-failure/page.tsx:33; apps/web/app/pricing/page.tsx:502)

**Why it exists.** A failed renewal otherwise looks like a silent loss of paid features. The brief (S83.14, S83.15) requires the person to be told clearly and to be able to retry from the product. Product policy ranks past_due and unpaid below active, so paid access stops until payment succeeds. (doc: docs/product/commercial.md:175-181)

**Who uses it.** Paying subscribers whose card was declined at renewal, on Web, Desktop, Mobile, CLI, VS Code and Chrome. Support staff also point people to /payment-failure.

**Problems it solves**

- A person does not know why paid features stopped.
- A person cannot find the open invoice to pay.
- A person tries to upgrade while an unpaid invoice exists and gets confusing errors.
- A person worries a failed new checkout charged them.

**Use cases**

- A card expires; the renewal fails; the person opens Settings, Billing on the web and clicks 'Pay <amount> now'.
- A CLI user runs the account usage summary and reads that the account is on Free until the payment is settled, with the billing link.
- A Chrome side panel user sees the composer gate 'Update billing to restore Managed Cloud chat.' and clicks 'Manage billing'.
- A person whose 3D Secure check closed during a new checkout reads /payment-failure and learns no subscription was created and no charge was made.

## 2. User experience

**Where to find it**

- Web and Desktop (Desktop shows the hosted web app): Settings, Billing: a red alert at the top of the plan block (apps/web/features/settings/sections/BillingSection.tsx:832; apps/web/features/billing/components/BillingPlanNotices.tsx:115).
- Web and Desktop: public page /payment-failure titled 'Payment didn't go through.' with buttons 'Open billing' and 'See plans' (apps/web/app/payment-failure/page.tsx:33-46).
- Web and Desktop: /pricing shows the alert 'Your last payment didn't go through...' and the plan buttons read 'Update payment' (apps/web/app/pricing/page.tsx:502-506,982-990); /upgrade shows 'Open billing' (apps/web/app/upgrade/UpgradeChooser.tsx:169-173).
- Mobile: Settings, plan screen; the plan summary sentence 'Your <plan> subscription is past due. Paid capabilities are unavailable.' (apps/mobile/src/features/settings/cloud-billing/index.tsx:167).
- CLI: the account usage summary (apps/cli/src/usage_summary.rs:639-662).
- VS Code: account menu item 'Manage billing & subscription' with the description 'Restore paid Cloud access on Web' (apps/extension-vscode/src/core/commandSetup.ts:2414-2417).
- Chrome: side panel composer gate message with the button 'Manage billing' (apps/extension/src/side_panel.ts:13427-13438; apps/extension/_locales/en/messages.json:117,185).

**Before you start**

- Signed in with an account that has a paid plan whose status is past_due or unpaid.
- For the Pay and Update buttons on Web and Desktop: the plan is billed through the web payment provider (subscription_source stripe) (apps/web/features/billing/components/BillingPlanNotices.tsx:117-118).
- The notice is not shown for contract-priced Enterprise plans (apps/web/features/billing/components/BillingPlanNotices.tsx:115).

**Screens and controls**

- Web and Desktop red notice: first line 'Your last <plan> payment didn't go through, so the plan is past due' (or 'unpaid'); second paragraph 'Self-serve plans have no grace period: paid features stop at the first failed renewal and come back as soon as the payment succeeds. Your chats and files stay.' with the link 'why a payment fails and what to do' to /payment-failure (apps/web/features/billing/components/BillingPlanNotices.tsx:147-162).
- Link 'Pay <amount> now': opens the hosted invoice in a new tab; only when an open invoice with a hosted link is in the loaded invoice list (BillingPlanNotices.tsx:121-133; BillingSection.tsx:606-613).
- Button 'Update payment method': opens the billing portal (BillingPlanNotices.tsx:134-143; BillingSection.tsx:327-337).
- Settings also keeps 'Manage billing' available when the Stripe plan is past due (test: apps/web/features/settings/sections/__tests__/BillingSection.test.tsx:573).
- CLI: lines 'Subscription: past due', 'Your last payment did not go through, so this subscription is past due. Until it is settled this account is on Free, and plan features and purchased credits are paused.' and 'Update your payment method in Settings > Billing: <link>' (apps/cli/src/usage_summary.rs:647,654-662).
- Chrome: the button text 'Manage billing' (apps/extension/_locales/en/messages.json:117).

**Journey**

1. 1. A renewal payment fails; the server stores the status past_due (the Settings test comment says invoice.payment_failed does this) (apps/web/features/settings/sections/__tests__/BillingSection.test.tsx:797; doc: docs/product/commercial.md:175-179).
2. 2. The person opens an app. Each app reads the plan and status from the account (web: billing store; mobile: GET /api/me?surface=mobile) (apps/mobile/src/features/billing/store.ts:79).
3. 3. The app shows its own notice (see where_to_find_it).
4. 4. On Web or Desktop the person clicks 'Pay <amount> now' to pay the hosted invoice, or 'Update payment method' to open the portal and change the card.
5. 5. When payment succeeds the status returns to active and paid features come back; the notice goes away on the next account read [inferred from the notice text 'come back as soon as the payment succeeds'] (BillingPlanNotices.tsx:152).
6. 6. On CLI, VS Code, Chrome and Mobile the person is sent to web billing to do step 4.

**What the person sees and gets**

- Red alert with role=alert on Web and Desktop (BillingPlanNotices.tsx:41).
- Portal failure shows 'Could not open billing portal.' or the server message (BillingSection.tsx:334).
- /payment-failure page text: renewal failure pauses paid features; a failed new checkout created no subscription and no charge; usual causes are a decline by the card issuer, a 3D Secure check that closed before confirming, or a network error reaching the bank (apps/web/app/payment-failure/page.tsx:34-44).

**Settings**

- Settings, Billing is the section that holds the controls (apps/web/features/settings/sections/BillingSection.tsx).
- No separate setting turns the notice on or off: none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop: the past-due notice with Pay and Update actions renders for status past_due or unpaid on non-Enterprise plans (apps/web/features/billing/components/BillingPlanNotices.tsx:115-164). Test file exists (apps/web/features/billing/components/__tests__/BillingPlanNotices.past-due-link.test.tsx:36).
- Web and Desktop: the public /payment-failure page exists with both causes (apps/web/app/payment-failure/page.tsx:25-62).
- Web and Desktop: Pricing disables plan changes while overdue ('Update payment' button and an alert) and /upgrade shows 'Open billing' instead of the chooser (apps/web/app/pricing/page.tsx:359-363,502-506,982-990; apps/web/app/upgrade/UpgradeChooser.tsx:169-173).
- Checkout refuses a new Stripe checkout while a live subscription exists, with 409 and 'Open Billing to manage it' (apps/web/app/api/checkout/route.ts:70-71,399-415).
- CLI: statuses past_due, unpaid and incomplete print the payment-failed lines (apps/cli/src/usage_summary.rs:24,654-662). A test asserts the exact lines (apps/cli/src/usage_summary.rs:1483-1500).
- VS Code: any plan that is not entitled (status other than active or trialing) changes the billing item description to 'Restore paid Cloud access on Web' (apps/extension-vscode/src/core/commandSetup.ts:2224-2226,2414-2417).
- Chrome: a paid account whose status is not entitled sets the chat gate; past_due gets the specific text, any other non-entitled status gets a generic status message, both with a billing action (apps/extension/src/side_panel.ts:13427-13438).
- Mobile: the plan summary sentence names the status and says paid capabilities are unavailable (apps/mobile/src/features/settings/cloud-billing/index.tsx:164-167); a test sets billingStatus past_due (apps/mobile/__tests__/CloudBillingPage.test.tsx:220).

**Incomplete**

- Pay and Update buttons appear only for web-billed plans; for an Apple or Google billed plan the notice has the text but no action button, and Settings shows 'Manage in the App Store' or 'Manage on Google Play' separately (apps/web/features/billing/components/BillingPlanNotices.tsx:117-118; apps/web/features/settings/sections/BillingSection.tsx:877-884).
- 'Pay <amount> now' needs the open invoice to be inside the latest 24 invoices that the page loaded; otherwise only 'Update payment method' shows (apps/web/features/settings/sections/BillingSection.tsx:606-613; apps/web/lib/services/billing-invoice-service.ts:26).
- Mobile gives no action to fix a failed payment in the shipped build: the build flag for native purchases is off and the screen returns early before any manage or restore row (apps/mobile/src/features/billing/storePurchases.json:2; apps/mobile/src/features/settings/cloud-billing/index.tsx:351-410).
- Chrome treats 'unpaid' with the generic status message, not the specific past-due wording (apps/extension/src/side_panel.ts:13434-13437).

**Present but disconnected or switched off**

- Mobile recovery rows ('Manage billing', 'Manage in <store>', alert 'Subscription managed elsewhere') are written but unreachable while native purchases are compiled off (apps/mobile/src/features/billing/storePurchases.json:2; apps/mobile/src/features/settings/cloud-billing/index.tsx:287-337,351). Tests render them with the flag mocked (apps/mobile/__tests__/CloudBillingPage.test.tsx:215).

**Not available**

- Retry from inside the app on CLI, VS Code, Chrome and Mobile: not available; they link or tell the person to use web billing (apps/cli/src/usage_summary.rs:659-662; apps/extension-vscode/src/core/commandSetup.ts:2414).
- No retry button that re-charges the card directly: the only retry paths are the hosted invoice and the portal [inferred from BillingPlanNotices.tsx:121-143].

## 4. Required behaviour

**Established requirements**

- When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it, on Web, Desktop, Mobile, CLI, VS Code and Chrome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S83.14)
- After a failed payment the user can retry it (pay the open invoice or update the card) from the product; the brief marks this done on Web and Desktop only. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S83.15)
- Status past_due and incomplete grant no paid features; remediation goes through the billing portal only. Access is monotonic and the effective tier falls to free below the active/trialing rank. (source: doc: docs/product/commercial.md:175-185)
- A failed new checkout creates no subscription and no charge, and the /payment-failure page must say so. (source: apps/web/app/payment-failure/page.tsx:34-36 and the task brief)

**Acceptance criteria**

1. A web-billed account with status past_due shows a red alert in Settings, Billing with 'Pay <amount> now' (when an open invoice exists) and 'Update payment method'.
2. The same alert for status unpaid says 'unpaid'; an Enterprise contract plan shows no such alert.
3. /pricing shows 'Update payment' on plan buttons and /upgrade shows 'Open billing' while the status is past_due or unpaid.
4. /payment-failure shows both the renewal text and the 'no subscription was created and you weren't charged' text.
5. CLI account usage prints 'Subscription: past due' and the billing link for past_due, unpaid and incomplete.
6. Chrome side panel for a past_due paid account shows 'Update billing to restore Managed Cloud chat.' and a 'Manage billing' button that opens web billing.
7. VS Code shows 'Restore paid Cloud access on Web' under 'Manage billing & subscription' for a non-entitled paid plan.
8. After the payment succeeds and the account is re-read, the alert is gone.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should offer an action to reach web billing for a past-due web-billed plan when store links are allowed [inferred from the brief claiming mobile 'done']
- Chrome should word 'unpaid' as specifically as 'past_due' [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the same failed-payment sentence on every app from one shared copy source, so the six wordings cannot drift.
- [proposed] Fetch the open invoice by status instead of from the latest 24, so 'Pay now' never goes missing.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | BillingPlanNotices | `apps/web/features/billing/components/BillingPlanNotices.tsx` | Renders the past-due, trial, ending and scheduled-change notices with Pay, Update and Resume actions. |
| component | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Settings, Billing screen; loads invoices, finds the open invoice, opens the portal, hosts the notices. |
| screen | PaymentFailurePage | `apps/web/app/payment-failure/page.tsx` | Public page explaining failed renewals, failed new checkouts and common causes. |
| screen | Pricing page | `apps/web/app/pricing/page.tsx` | Computes paymentOverdue, swaps plan buttons to 'Update payment' and shows the overdue alert. |
| component | UpgradeChooser | `apps/web/app/upgrade/UpgradeChooser.tsx` | Replaces the chooser with 'Open billing' while payment is overdue. |
| service | openBillingPortal | `apps/web/features/billing/services/stripe-payments.ts` | POSTs /api/portal and hands the browser to the hosted portal. |
| endpoint | POST /api/portal | `apps/web/app/api/portal/route.ts` | Creates the portal session; allows past_due and unpaid statuses (line 316). |
| endpoint | GET /api/billing/invoices | `apps/web/app/api/billing/invoices/route.ts` | Returns up to 24 invoices with hosted links; source of the open invoice. |
| service | readUserBillingInvoicePage | `apps/web/lib/services/billing-invoice-service.ts` | Reads invoices from the payment provider for the user's stored customer. |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Refuses a second checkout when a live subscription exists (409). |
| store | useBillingStore | `apps/web/shared/stores/web-auth-store.ts` | Holds subscription status, billing_tier and source for the web screens. |
| screen | Mobile plan screen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Shows the status sentence (line 167); recovery rows exist but are gated by the native-purchase flag. |
| store | useTierStore | `apps/mobile/src/features/billing/store.ts` | Reads GET /api/me?surface=mobile; keeps billingStatus and source; skips the read in Local mode. |
| config | storePurchases.json | `apps/mobile/src/features/billing/storePurchases.json` | nativePurchases false hides purchase, manage and restore rows in the shipped build. |
| command | subscription_lines | `apps/cli/src/usage_summary.rs` | Prints the failed-payment lines for past_due, unpaid and incomplete in the CLI usage summary. |
| command | agi-workforce.showAccountUsage menu item | `apps/extension-vscode/src/core/commandSetup.ts` | Builds 'Manage billing & subscription' with the restore description. |
| component | Chrome side-panel billing gate | `apps/extension/src/side_panel.ts` | Sets the managed chat gate with 'billing' action when the subscription needs attention. |
| config | Chrome locale strings | `apps/extension/_locales/en/messages.json` | spGateBillingPastDue and spBillingManage texts. |
| config | Subscription access ladder | `apps/web/lib/services/subscription-access-policy.ts` | Ranks statuses so past_due and unpaid grant no paid access (named in docs/product/commercial.md:172). |
| config | Hosted-app window policy | `apps/desktop/electron/windowPolicy.ts` | Opens hosted invoice and portal links in the system browser from the Desktop window. |
| test | BillingPlanNotices past-due test | `apps/web/features/billing/components/__tests__/BillingPlanNotices.past-due-link.test.tsx` | Covers the failure notice link. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The payment provider reports a failed renewal; the server stores status past_due or unpaid on the user's subscriptions row. | outside service | apps/web/features/settings/sections/__tests__/BillingSection.test.tsx:797 (comment); doc: docs/product/commercial.md:175-179 |
| The app reads plan, status and billing source from the account (web store; mobile GET /api/me?surface=mobile; CLI and extensions read the account usage and plan data). | our servers | apps/mobile/src/features/billing/store.ts:79; apps/cli/src/usage_summary.rs:87 |
| Web loads GET /api/billing/invoices; the server asks the payment provider for the last 24 invoices of the stored customer. | our servers | apps/web/app/api/billing/invoices/route.ts:30; apps/web/lib/services/billing-invoice-service.ts:46-60 |
| The browser picks the first open invoice with a hosted link and builds 'Pay <amount> now'. | device | apps/web/features/settings/sections/BillingSection.tsx:606-613 |
| 'Update payment method' calls POST /api/portal; the server creates a portal session and the browser is handed to the provider's hosted page. | device and our servers | apps/web/features/billing/services/stripe-payments.ts:162-189; apps/web/app/api/portal/route.ts:316 |
| The person pays or updates the card on the provider's hosted page; the provider tells our webhook and the status returns to active. | outside service | doc: docs/product/commercial.md:175-185 (status ladder); webhook path apps/web/app/api/stripe-webhook/lib/db.ts named in doc: docs/product/commercial.md:88 |
| On Desktop the same web screens run inside the Electron window; clicks on external links open in the system browser. | device | apps/desktop/electron/config.ts:17,103; apps/desktop/electron/windowPolicy.ts:82-86,293-299 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Subscription status, plan tier, billing source, cancel flag, period end | table:subscriptions (read by the checkout route at apps/web/app/api/checkout/route.ts:308-312) | Read by each app on demand; mobile caches in the persisted tier store (apps/mobile/src/features/billing/store.ts:49-60) | Mobile clears it on account change (store.ts clearAccountEntitlements); server retention: unknown |
| Invoices and hosted invoice links | The payment provider; not copied to our database for the Settings list | Fetched live on every page load | Held by the provider; not stored by this feature |

**Models and providers.** No model is called. The payment provider is Stripe, which is not one of the folders under packages/ai/providers, so no provider: relationship applies. Credit-priced model usage is unrelated to this notice.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required on every app; the billing store shows 'Your session expired before we could read your plan' when not (apps/web/features/settings/sections/BillingSection.tsx:683-690). /payment-failure is public. |
| Permissions | Personal billing needs only the user's own session. Workspace seat or enterprise screens use other permissions (see F083-11). Rate limit key billing-invoices on invoice reads (apps/web/app/api/billing/invoices/route.ts:13). |
| Subscription | Applies to paid plans in status past_due, unpaid (all apps) and incomplete (CLI, VS Code, Chrome gate). Past_due and incomplete rank 1 and unpaid ranks 0 on the access ladder (doc: docs/product/commercial.md:175-179). The effective tier collapses to free for access decisions. |
| Limits and metering | Purchased credits are paused while payment fails (apps/cli/src/usage_summary.rs:656; doc: docs/product/commercial.md:175-181). No separate rate limit for the notice: none found in the code. |
| Feature flags | AGI_BILLING_WAITLIST_OPEN governs first-time paid checkout, not this notice (apps/web/lib/server/billing-waitlist-access.ts:30). storePurchases.json nativePurchases=false hides mobile recovery rows (apps/mobile/src/features/billing/storePurchases.json:2). |
| Model compatibility | None found in the code: no model takes part. |
| Provider restrictions | Pay and Update actions need a Stripe-billed plan (subscription_source stripe) (apps/web/features/billing/components/BillingPlanNotices.tsx:117). Apple and Google billed plans are fixed in the store. |
| Local mode | Local inference needs no subscription and is unaffected by this notice. On Mobile the plan refresh is skipped unless chat is in Cloud mode, and the screen then says 'Your plan is read from your account once chat is set to Cloud' (apps/mobile/src/features/billing/store.ts:73; apps/mobile/src/features/settings/cloud-billing/index.tsx:164). Whether the CLI, VS Code and Chrome show any notice in Local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading billing account | Skeleton with the screen-reader text 'Loading your billing account…'. | apps/web/features/settings/sections/BillingSection.tsx:597-613 region (loading branch) and test apps/web/features/settings/sections/__tests__/BillingSection.test.tsx:845 |
| Invoices failed to load | Invoices section shows an error with 'Try again'; the Pay link is absent, Update payment method stays. | apps/web/features/settings/sections/BillingSection.tsx:1158-1167,606-613 |
| Portal cannot open | Error line 'Could not open billing portal.' and the buttons return. | apps/web/features/settings/sections/BillingSection.tsx:327-337 |
| Enterprise contract plan | No past-due notice (isEnterprise). | apps/web/features/billing/components/BillingPlanNotices.tsx:115 |
| Plan billed by Apple or Google | Notice text only; store manage button shown separately. | apps/web/features/billing/components/BillingPlanNotices.tsx:117-118; BillingSection.tsx:877-884 |
| Session expired | Settings shows 'Your session expired before we could read your plan. Your subscription has not changed.' with Try again. | apps/web/features/settings/sections/BillingSection.tsx:683-705 |
| Offline | not handled in the code beyond the generic load errors above. | searched BillingSection.tsx and BillingPlanNotices.tsx for offline handling; none found |
| Accessibility | The destructive notice has role=alert; buttons use a taller target on coarse pointers. | apps/web/features/billing/components/BillingPlanNotices.tsx:41,129 |
| Mobile in Local mode or plan unconfirmed | Shows 'Checking your plan…' or 'We couldn't read your plan just now' with Try again; never calls the account Free before confirmation. | apps/mobile/src/features/settings/cloud-billing/index.tsx:158-166 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/billing/components/__tests__/BillingPlanNotices.past-due-link.test.tsx`: Failed-payment notice link: points to a page the site serves, stays when no fix can be offered, absent on a healthy plan or Enterprise.
- `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx`: Past-due Stripe plan keeps recovery controls (line 573); status text humanized (line 584); 'says the renewal failed, states the no-grace rule and offers both fixes' (line 801); silent on healthy plan (line 836).
- `apps/web/lib/server/subscription-billing-owner.test.ts`: Past-due Stripe plan must recover before a prorated upgrade (line 93).
- `apps/cli/src/usage_summary.rs`: In-file Rust test 'a_failed_payment_is_worded_like_billing_and_points_at_settings' asserts the exact CLI lines.
- `apps/mobile/__tests__/CloudBillingPage.test.tsx`: Past-due states at lines 220, 262, 283: inactive subscriber portal action and store-owned recovery.
- `apps/extension-vscode/src/__tests__/usageMeter.test.ts`: Usage meter with subscriptionStatus past_due (lines 98, 107); whether the menu item text is asserted: unknown.

**Test scenarios**

- **Web past-due recovery**
  1. Use a test account on a web-billed paid plan; set the subscription status to past_due.
  2. Open Settings, Billing.
  3. Click 'Pay <amount> now' (an open invoice must exist), then return and click 'Update payment method'.
  - Expected: Red alert is shown; the first opens the hosted invoice in a new tab; the second opens the portal; after paying and refreshing the alert is gone.
- **Overdue blocks upgrades**
  1. With the same account open /pricing.
  2. Open /upgrade.
  - Expected: Pricing shows the overdue alert and 'Update payment' buttons; /upgrade shows 'Open billing'.
- **Failed new checkout page**
  1. Open /payment-failure while signed out.
  - Expected: Page loads with both the renewal and the 'no subscription was created' paragraphs and the 'Open billing' and 'See plans' buttons.
- **CLI wording**
  1. Run the account usage summary for an account whose status is unpaid.
  - Expected: Output includes 'Subscription: unpaid', the Free-until-settled sentence and the Settings > Billing link.
- **Chrome gate**
  1. Sign in the Chrome side panel with a past_due paid account.
  2. Try to chat.
  - Expected: Gate message 'Update billing to restore Managed Cloud chat.' with a 'Manage billing' button that opens web billing.
- **Mobile shipped build**
  1. Open the plan screen on a build with native purchases off, account past_due, chat in Cloud mode.
  - Expected: Sentence 'Your <plan> subscription is past due. Paid capabilities are unavailable.' and a 'Billing' row 'Managed on the web'; no manage or restore row.

**Where to look when it fails**

- Server log line 'Failed to fetch Stripe invoices' for invoice list failures (apps/web/app/api/billing/invoices/route.ts:35).
- Portal error code 'cancellation_unavailable' and refusals from /api/portal (apps/web/app/api/portal/route.ts:414).
- Checkout conflict log 'Refusing checkout: Stripe is already billing a subscription for this customer' (apps/web/app/api/checkout/route.ts:399-408).
- Table subscriptions: status column.
- Mobile console warning '[tierStore] refreshTier failed (keeping cached tier)' (apps/mobile/src/features/billing/store.ts).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)
- CLI: [70-qa/test-plans/cli/083-billing-and-subscription-screens.md](../../70-qa/test-plans/cli/083-billing-and-subscription-screens.md)
- VS Code: [70-qa/test-plans/vscode/083-billing-and-subscription-screens.md](../../70-qa/test-plans/vscode/083-billing-and-subscription-screens.md)
- Chrome: [70-qa/test-plans/chrome/083-billing-and-subscription-screens.md](../../70-qa/test-plans/chrome/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **Mobile gives no way to fix a failed payment in the shipped build; only a sentence is shown.** Affects: Mobile users with a past-due plan. Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:351-410; apps/mobile/src/features/billing/storePurchases.json:2. Work needed: Add a link or instruction to web billing in the reduced screen where store rules allow, or turn on native purchases (owner decision).
- **The brief calls mobile payment failure fully 'done' but the recovery rows are not reachable in the shipped build.** Affects: Mobile. Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:351; knowledge-base/data/area-briefs/083-billing-and-subscription-screens.md (S83.14). Work needed: Correct the brief status to partial.
- **Chrome shows a generic message for unpaid instead of the past-due wording.** Affects: Chrome users with an unpaid plan. Evidence: apps/extension/src/side_panel.ts:13434-13437. Work needed: Add a specific unpaid string.
- **'Pay now' depends on the latest 24 invoices.** Affects: Web and Desktop accounts with many invoices. Evidence: apps/web/lib/services/billing-invoice-service.ts:26; BillingSection.tsx:606-613. Work needed: Query open invoices directly.
- **No past-due notice for Enterprise contract plans in Settings.** Affects: Enterprise admins. Evidence: apps/web/features/billing/components/BillingPlanNotices.tsx:115. Work needed: Decide the invoice-based remedy (see F083-11) and surface it; owner decision needed.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:GET /api/billing/invoices
- api:POST /api/portal
- api:POST /api/checkout
- api:GET /api/me
- table:subscriptions
- file:apps/web/features/billing/components/BillingPlanNotices.tsx
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries

## Unknown

- Exact webhook code that sets past_due was not opened; only the test comment and the product document state it.
- Whether the notice clears immediately after payment or after the next account refresh: not tested in a file I opened.
- Whether CLI, VS Code and Chrome show any notice in Local mode.
- Whether /payment-failure is linked from Mobile or the extensions: none found.
