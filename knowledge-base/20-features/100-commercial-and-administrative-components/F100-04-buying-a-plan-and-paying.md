---
id: "F100-04"
type: "feature"
title: "Buying a plan and paying"
aliases: ["Checkout adapter (S100.14)", "Subscription synchronization (S100.15)", "Payment webhook processor (S100.16)", "Tax calculation integration (S100.20)", "Stripe checkout", "upgrade waitlist gate", "paid acquisition gate", "reconcile-billed-plans"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.14", "S100.15", "S100.16", "S100.20"]
depends_on: ["F100-01", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-observability-and-operations", "table:subscriptions", "table:processed_stripe_events", "table:beta_redemptions", "file:apps/web/app/api/checkout/route.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-04 Buying a plan and paying

Lets an eligible web account buy a plan on Stripe's hosted checkout, then keeps the stored plan in step with Stripe through signed, de-duplicated webhooks. A daily job compares billed plans to Stripe and emails a report. Stripe Tax calculates tax. New paying customers are currently gated by an access code or flag.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.14](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10014), [S100.15](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10015), [S100.16](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10016), [S100.20](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10020).

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

**What it does.** Creates a Stripe subscription checkout for a verified account, returns the person to a page that waits for the webhook, applies subscription events in order, and compares billed plans to the catalog once a day (apps/web/app/api/checkout/route.ts; apps/web/app/api/stripe-webhook/route.ts; apps/web/app/api/cron/reconcile-billed-plans/route.ts).

**Why it exists.** So a payment turns into a plan on every app, double billing is prevented, and drift between Stripe and the stored plan is noticed (S100.14 to S100.16, S100.20).

**Who uses it.** Web users who upgrade or buy Team seats, and operations staff who receive divergence reports. The desktop app reuses the web flow and opens Stripe in the browser.

**Problems it solves**

- Two live subscriptions for one customer (guard at checkout/route.ts:391-428).
- Webhooks arriving twice or out of order (idempotency and event ordering, idempotency.ts:8-49; db.ts:1086-1100).
- Silent drift between the stored plan and what Stripe bills (daily comparison, cron/reconcile-billed-plans/route.ts:71-160).
- Wrong or missing tax (tax-policy.ts:98-112).

**Use cases**

- A Free user with an access code chooses Premium and pays by card.
- A buyer in India pays in INR with tax included in the price.
- A webhook for an async bank payment arrives later and only then grants the plan (handlers.ts:89-111).
- Operations receives an email when a stored plan differs from the Stripe price (reconcile cron lines 115-145).

## 2. User experience

**Where to find it**

- Web: /upgrade and /upgrade/<plan> order screen, button 'Subscribe to <plan>' (apps/web/features/billing/components/UpgradeOrderPanel.tsx:584); Settings > Billing 'Payment' section (BillingSection.tsx:938).
- Desktop: same screens; the 'Checkout opened in your browser. Pay there, then come back' notice (apps/web/features/billing/services/stripe-payments.ts:30-36).
- Mobile, CLI, VS Code, Chrome: do not sell through Stripe; CLI and Chrome open the web pricing page (claude_parity.rs:789-797; side_panel.ts:14139). Mobile store purchases are F100-05.

**Before you start**

- Signed in; an email is optional but used if available (checkout/route.ts:191-202).
- The upgrade gate must allow the account: a live paid subscription, or the upgrades-open flag, or AGI_BILLING_WAITLIST_OPEN=1, or a beta_redemptions row (billing-waitlist-access.ts:33-54; checkout/route.ts:297-310).
- STRIPE_CHECKOUT_ENABLED not set off, and STRIPE_SECRET_KEY present (checkout/route.ts:58-62, 178-182).

**Screens and controls**

- Upgrade waitlist dialog: 'Join upgrade waitlist' and 'Have an access code?' (apps/web/features/billing/components/UpgradeWaitlistDialog.tsx:149, 161).
- Order panel sections 'Order details', 'Payment method', 'Due today', 'Subtotal', 'Tax', 'Total due today' and 'Tax is calculated at checkout.' (UpgradeOrderPanel.tsx:320, 360, 391-446).
- Stripe hosted checkout with terms-of-service consent, promotion codes, full billing address and tax ID collection (checkout/route.ts:517-523; tax-policy.ts:98-112).
- Confirmation page /billing with 'Confirming checkout.' or 'You're all set.', 'Start chatting' and 'View billing' (apps/web/app/billing/UpgradeWelcome.tsx:96-166).

**Journey**

1. Pick a plan on the upgrade page and press 'Subscribe to <plan>'.
2. The browser calls POST /api/checkout with plan, interval and an idempotency key.
3. If the gate refuses (403 code from WAITLIST_ACCESS_REQUIRED_CODE), the waitlist dialog opens.
4. On success the server returns a Stripe URL; the app remembers the pending session and opens it (stripe-payments.ts:222-253).
5. Pay on Stripe; Stripe returns to /billing?success=true&session_id=...
6. The server verifies the session belongs to the user; the page polls the account until the plan is active, up to 30 seconds (UpgradeWelcome.tsx:14-15, 77-90).
7. If it takes longer, the page says to check Billing and that the person was not charged twice (line 112-114).

**What the person sees and gets**

- 'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.' when gated (billing-waitlist-access.ts:11-12).
- 'This account already has an active subscription with our payment provider. Open Billing to manage it...' on a double-billing refusal (checkout/route.ts:70-71).
- 'Paid-plan checkout is not available yet. Local and BYOK are free.' when switched off (checkout/route.ts:178-182).
- A notification 'Your payment did not go through' on a failed invoice (handlers.ts:57-66).

**Settings**

- Trial and promotion codes in checkout (allow_promotion_codes true, checkout/route.ts:522).
- Stripe billing portal for payment methods and cancellation (stripe-payments.ts:189).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Checkout creates a subscription-mode Stripe session with catalog version in metadata, terms consent, promotion codes, automatic tax, tax ID collection and required billing address (checkout/route.ts:460-523; apps/web/lib/billing/tax-policy.ts:98-112).
- Price comes from the localized price selection and is refused when Stripe's amount or tax behavior does not match the catalog (checkout/route.ts:231-237; localized-pricing-service.ts:140-180).
- Refuses if Stripe already bills a live subscription for the stored customer, if another checkout just completed, or if the billing owner is another channel (checkout/route.ts:312-314, 391-428, 486-492, 551-559).
- If the stored Stripe customer no longer exists, drops it and creates a fresh one (checkout/route.ts:396-413).
- Open earlier checkouts for the same user are expired before a new one is created (checkout/route.ts:468-492).
- CSRF token, rate limit key 'checkout', deadline and circuit are applied (checkout/route.ts:173-189, 610-616).
- Webhook: rate limit, signature check with a 60 second tolerance (400 on wrong or missing signature, logged as an invalid signature), idempotency by event id through a database function, then dispatch and mark succeeded in one transaction (stripe-webhook/route.ts:33-95; lib/verify.ts:15-51; lib/idempotency.ts:8-70).
- Subscription created, updated and invoice events update plan and status; an older event cannot overwrite a newer one, and a canceled subscription is not resurrected (handlers.ts:135-165; db.ts:1086-1111).
- Async-payment checkouts grant the plan only on async_payment_succeeded (handlers.ts:89-113).
- Cancellation sets the plan to free and ends enterprise contracts (handlers.ts:176-221).
- Daily job at 01:11 compares billed plans against Stripe, logs, emails a report, and re-queues review if the email cannot be sent; it repairs nothing (vercel.json:174-175; cron/reconcile-billed-plans/route.ts:71-160).
- Top-ups use the same tax parameters (apps/web/app/api/billing/top-up/route.ts:250).

**Incomplete**

- Tax on mid-cycle plan changes through /api/upgrade was not found in that route; tax handling there is unknown (apps/web/app/api/upgrade/route.ts).

**Present but disconnected or switched off**

- Paid acquisition is gated: without the upgrades-open flag, AGI_BILLING_WAITLIST_OPEN=1 or a redeemed code, a non-paying account gets HTTP 403 (checkout/route.ts:297-310; doc: docs/product/commercial.md Paid Acquisition Gate).
- STRIPE_CHECKOUT_ENABLED set to 0, false or off closes checkout (checkout/route.ts:58-62).
- Pending checkout confirmation component renders nothing; it only polls and redirects to /billing (apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:16-70).

**Not available**

- Stripe checkout on mobile, CLI, VS Code and Chrome: none found; they send the person to the web (side_panel.ts:14139; claude_parity.rs:789).

## 4. Required behaviour

**Established requirements**

- A checkout adapter creates a payment-provider checkout for any eligible user and returns them to a verified result. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.14)
- Subscription state is kept in sync with the payment provider, in order, with periodic reconciliation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.15)
- A webhook endpoint verifies provider signatures, processes each event exactly once and handles the billing event types. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.16)
- Tax is calculated by an integrated tax engine for every charge, including tax IDs and reverse charge. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.20)
- Paid upgrades stay behind the access gate; the presence of working checkout code does not open paid purchasing. (source: doc: docs/product/commercial.md (Payment Guidance, Paid Acquisition Gate))
- One billing owner per user; a second channel loses while the first is entitled. (source: doc: docs/product/commercial.md (Subscription Ownership Across The Suite))
- Yearly billing is withdrawn for individual plans; checkout refuses it with a message naming the cadence sold. (source: doc: docs/decisions/2026-09-27-founder-decisions.md)

**Acceptance criteria**

1. A gated account posting to /api/checkout gets 403 with the waitlist access code; after opening the flag or redeeming a code it receives a Stripe URL.
2. A customer with a live Stripe subscription cannot start a second checkout and sees the active-subscription message.
3. A webhook with a wrong signature returns 400 and is logged; the same valid event delivered twice processes once.
4. An older subscription update delivered after a newer one does not change the stored plan or status.
5. After paying, /billing shows 'Confirming checkout.' and then 'You're all set.' with the right plan, without a manual refresh, within 30 seconds in the normal case.
6. Tax is computed on the Stripe session for USD and the INR price includes tax; tax ID entry is offered.
7. The daily reconcile job returns the number examined and diverged and emails a report when a divergence exists.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A webhook failure returns 500 so Stripe retries, because the event is marked failed (stripe-webhook/route.ts:77-95) [inferred from Stripe retry behaviour].
- The pending-confirmation component and the /billing page together make the return trip trustworthy, because /billing only accepts a session id that belongs to the user (app/billing/page.tsx:16-41).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the reconcile job able to repair, or add a runbook step for each drift type.
- [proposed] Show tax and total on the order panel before the Stripe page, in every currency.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Creates the Stripe subscription checkout (handleCheckout line 169). |
| endpoint | POST /api/stripe-webhook | `apps/web/app/api/stripe-webhook/route.ts` | Receives Stripe events (line 27). |
| service | verifyStripeSignature | `apps/web/app/api/stripe-webhook/lib/verify.ts` | Signature check and invalid-signature logging. |
| service | idempotency | `apps/web/app/api/stripe-webhook/lib/idempotency.ts` | process_stripe_event_idempotent, mark succeeded and failed. |
| service | dispatchStripeEvent | `apps/web/app/api/stripe-webhook/lib/handlers.ts` | Routes each Stripe event type (line 69). |
| service | subscription writers | `apps/web/app/api/stripe-webhook/lib/db.ts` | upsertSubscriptionFromSession (454), updateSubscriptionFromStripeSubscription (941), handleCreditTopUp (220). |
| service | subscription status map | `apps/web/app/api/stripe-webhook/lib/subscription-status.ts` | Maps Stripe status to stored status. |
| service | tax-policy | `apps/web/lib/billing/tax-policy.ts` | buildCheckoutTaxParams and describeSessionTax (lines 98, 152). |
| service | billing-waitlist-access | `apps/web/lib/server/billing-waitlist-access.ts` | The paid acquisition gate. |
| service | billing-upgrade-gate | `apps/web/lib/feature-flags/billing-upgrade-gate.ts` | Reads the upgrades-open flag; failures read closed (line 15). |
| service | checkout validation | `apps/web/lib/validations/checkout.ts` | CheckoutRequestSchema and seat quantities. |
| service | stripe-payments client | `apps/web/features/billing/services/stripe-payments.ts` | Browser calls to /api/checkout and top-up; hands off to the browser on desktop. |
| store | agi.billing.pendingCheckout | `apps/web/features/billing/lib/pending-checkout.ts` | Browser local storage entry with the session id, plan and start time, valid one hour (lines 3-4, 8-16). |
| component | PendingCheckoutConfirmation | `apps/web/features/billing/components/PendingCheckoutConfirmation.tsx` | Polls the account every 2 s for 30 s and redirects to /billing. |
| screen | BillingPage and UpgradeWelcome | `apps/web/app/billing/page.tsx` | Verifies the Stripe session and shows the activation result (lines 10-49). |
| component | UpgradeOrderPanel | `apps/web/features/billing/components/UpgradeOrderPanel.tsx` | Order and subscribe button. |
| component | UpgradeWaitlistDialog | `apps/web/features/billing/components/UpgradeWaitlistDialog.tsx` | Waitlist and access code dialog. |
| job | reconcile-billed-plans cron | `apps/web/app/api/cron/reconcile-billed-plans/route.ts` | Daily comparison and email report (vercel.json:174-175). |
| service | billing-reconciliation | `apps/web/lib/services/billing-reconciliation.ts` | reconcileBilledPlans (line 236). |
| endpoint | POST /api/billing/top-up | `apps/web/app/api/billing/top-up/route.ts` | Credit top-up checkout with the same tax parameters. |
| endpoint | POST /api/upgrade | `apps/web/app/api/upgrade/route.ts` | Mid-cycle plan change for existing subscribers. |
| table | processed_stripe_events | `apps/web/app/api/stripe-webhook/lib/idempotency.ts` | Event id and status for de-duplication (lines 27-31). |
| table | profiles and subscriptions | `apps/web/app/api/checkout/route.ts` | stripe_customer_id lookup and update (lines 280-285, 318-355). |
| table | beta_redemptions | `apps/web/lib/server/billing-waitlist-access.ts` | Rows that open the upgrade gate (lines 47-52). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person presses Subscribe; the browser posts plan and interval with a CSRF header and a fresh idempotency key. | device | apps/web/features/billing/services/stripe-payments.ts:222-239 |
| The server checks CSRF, the on/off switch, rate limit and the plan-change gate, then validates the request and resolves the purchasable plan. | our servers | checkout/route.ts:173-227 |
| The server asks Stripe for the price and checks amount and tax behavior. | outside service | localized-pricing-service.ts:52, 140-180 |
| The server applies the acquisition gate, the billing-owner rule, finds or creates the Stripe customer, and refuses if Stripe already bills a subscription. | our servers | checkout/route.ts:294-428 |
| The server expires earlier open checkouts, creates the Stripe session and records a checkout_started audit event. | our servers | checkout/route.ts:468-573 |
| The person pays on Stripe's page in the browser; Stripe calculates tax. | outside service | checkout/route.ts:523; tax-policy.ts:98-112 |
| Stripe sends events; the server checks the signature, de-duplicates and updates the subscription row in one transaction. | our servers | stripe-webhook/route.ts:33-95 |
| The return page verifies the session and the app polls the account until the plan is active. | device and our servers | app/billing/page.tsx:20-49; UpgradeWelcome.tsx:77-90 |
| Once a day the cron compares each billed subscription to Stripe and emails a report. | our servers | cron/reconcile-billed-plans/route.ts:71-160 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Stripe customer id | profiles.stripe_customer_id and subscriptions | Server only | Kept for billing; erasure handled in account-erasure (not read in detail) |
| Subscription plan, status, period, catalog version, last_stripe_event_at | table subscriptions | Read by all apps via the account API | unknown |
| Processed webhook event ids and status | table processed_stripe_events | Server only | unknown |
| Billing address, business name and tax ID | Stripe only; this product deliberately does not copy them (tax-policy.ts:37-47, 77-80) | No | Held by Stripe under its terms |
| Pending checkout (session id, plan, start time) | browser local storage key agi.billing.pendingCheckout | No | Cleared on /billing or after one hour (pending-checkout.ts:4) |
| Audit event checkout_started | audit store | Server only | unknown |

**Models and providers.** No model or model provider takes part. The payment provider is Stripe with Stripe Tax as the tax engine (tax-policy.ts:69-75). The purchased plan later decides which models and limits apply (see F100-01 and F100-02).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account (checkout/route.ts:171). |
| Permissions | The caller buys for their own account. Seat purchases for a workspace go through the same route with seat counts (checkout/route.ts:227-228). Role checks for who in a workspace may buy: none found in this route. |
| Subscription | A live paid subscription already held skips the gate but not the double-billing guard (checkout/route.ts:297-310, 391-428). A subscription billed by Apple or Google blocks Stripe checkout (checkout/route.ts:312-314). |
| Limits and metering | The 'checkout' rate limit key applies (rate-limit.ts:80-85); the webhook has its own key stripe-webhook (rate-limit.ts:469). Seat purchase bounds are 2 to 999999 (billing-catalog.ts:157-158). |
| Feature flags | STRIPE_CHECKOUT_ENABLED, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, AGI_BILLING_WAITLIST_OPEN, the upgrades-open flag, STRIPE_PRICE_* price ids. |
| Model compatibility | none found in the code. |
| Provider restrictions | Payment only through Stripe on web. A subscription owned by a store cannot be bought again through Stripe. |
| Local mode | Checkout is for Cloud plans only. The route states 'Local and BYOK are free' when checkout is off (checkout/route.ts:178-182); no payment is needed for Local or own-key use, and sign-in requirements are separate (see SYS-authentication-and-identity). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Gated account | HTTP 403 with the waitlist access code; the app opens the waitlist dialog. | billing-waitlist-access.ts:56-66; stripe-payments.ts:240-245 |
| Stripe or database unavailable while verifying | 503 with 'No checkout was created; please retry.' | checkout/route.ts:286-293, 349-352, 399-402, 479-485 |
| Stripe errors at session creation | Card error as validation message; invalid request as 'Invalid checkout configuration'; authentication or connection as 503; rate limit as 429. | checkout/route.ts:575-606 |
| Webhook event still processing | 503 with Retry-After 10. | stripe-webhook/route.ts:63-68 |
| Webhook handler throws | Event marked failed, response 500 so Stripe retries. | stripe-webhook/route.ts:77-95 |
| Webhook secret not configured | Logs and returns 500 'Stripe not configured'. | stripe-webhook/route.ts:40-44 |
| Plan not active after 30 seconds | Page says it is taking longer and not to buy twice. | UpgradeWelcome.tsx:110-114 |
| Payment still pending (async method) | No plan is granted until async_payment_succeeded; failure sets past_due. | handlers.ts:89-134 |
| Offline in the app | not handled in the code beyond local storage of the pending session; storage failures are ignored (pending-checkout.ts:10-16). | apps/web/features/billing/lib/pending-checkout.ts:10-16 |
| Session expired on return | Redirect to sign-in with the billing settings as destination. | app/billing/page.tsx:20-23 |
| Accessibility | The activation message uses aria-live polite. | UpgradeWelcome.tsx:107 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/checkout/route.test.ts`: By file name: the checkout route. Contents not read.
- `apps/web/app/api/checkout/route.tax-errors.test.ts`: By file name: tax errors at checkout. Contents not read.
- `apps/web/app/api/checkout/route.catalog-binding.test.ts`: By file name: catalog binding of checkout. Contents not read.
- `apps/web/app/api/checkout/route.trial.test.ts`: By file name: trial terms. Contents not read.
- `apps/web/__tests__/api/checkout.test.ts`: By file name: checkout API. Contents not read.
- `apps/web/app/api/stripe-webhook/lib/__tests__/route.test.ts`: By file name: webhook route. Contents not read.
- `apps/web/app/api/stripe-webhook/lib/__tests__/subscription-event-ordering.test.ts`: By file name: out-of-order events. Contents not read.
- `apps/web/app/api/stripe-webhook/lib/__tests__/delivery-guarantees.test.ts`: By file name: delivery and idempotency. Contents not read.
- `apps/web/app/api/stripe-webhook/lib/__tests__/checkout-tax.test.ts`: Per tax-policy.ts:44-46 it pins that the webhook never writes tax identifiers or addresses.
- `apps/web/lib/billing/tax-policy.test.ts`: By file name: tax parameters. Contents not read.
- `apps/web/lib/server/__tests__/billing-waitlist-access.test.ts`: By file name: the acquisition gate. Contents not read.
- `apps/web/app/api/cron/reconcile-billed-plans/route.test.ts`: By file name: the reconcile cron. Contents not read.
- `apps/web/app/billing/page.test.tsx`: Includes a case that success=true without a session id is not trusted (line 77).

**Test scenarios**

- **Gated purchase**
  1. Sign in with a Free test account that has no code and with upgrades closed.
  2. Press Subscribe on a self-serve plan.
  - Expected: 403 with the access-code message and the waitlist dialog; no Stripe session is created.
- **Happy path in Stripe test mode**
  1. Open the gate for the test account.
  2. Subscribe, pay with a test card, return to /billing.
  3. Watch the page and the account's plan.
  - Expected: Page shows 'Confirming checkout.' then 'You're all set.'; subscriptions row shows the plan, active.
- **Double billing guard**
  1. Use a customer with a live Stripe subscription but a stale stored plan.
  2. Call /api/checkout.
  - Expected: 409 with the active subscription message and an error log 'Refusing checkout: Stripe is already billing a subscription'.
- **Webhook signature and replay**
  1. Send an event with a wrong signature.
  2. Send a valid event twice.
  - Expected: 400 for the first; the second delivery returns 'Event already processed'.
- **Event ordering**
  1. Deliver a newer subscription.updated, then an older one.
  - Expected: The older one is ignored with a warning and the row keeps the newer state.
- **Daily reconcile**
  1. Change a stored plan so it differs from the Stripe price.
  2. Call the cron route with cron credentials.
  - Expected: JSON with diverged greater than zero, alert true and an email delivery result; nothing is repaired.

**Where to look when it fails**

- Log lines 'Refusing checkout: Stripe is already billing a subscription', 'Stripe webhook signature verification failed', 'Ignoring out-of-order subscription snapshot', 'Billed plan divergence detected'.
- Span attribute stripe.webhook.outcome and event id on the stripe.webhook span.
- Tables subscriptions, processed_stripe_events, audit events checkout_started and plan_changed.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief says a daily reconciliation keeps the plan in step; the job only reports differences and repairs nothing.** Affects: Operations and customers whose plan drifts. Evidence: cron/reconcile-billed-plans/route.ts:36-40 (report text 'Nothing was repaired automatically'), 71-160. Work needed: State this in the brief; add a runbook for drift or an optional repair step.
- **The brief's checkout line numbers (392, 414, 420-430) and handlers.ts:133-140 do not match the file; the guards are at 391-428 and the subscription cases at 135-146.** Affects: Engineers following the brief. Evidence: checkout/route.ts:391-428; handlers.ts:135-146. Work needed: Refresh the brief pointers.
- **Purchase is gated for accounts that are not already paying, which the brief does not mention.** Affects: All new web buyers. Evidence: checkout/route.ts:297-310; doc: docs/product/commercial.md (Paid Acquisition Gate). Work needed: None to code; add the gate to the brief's use text.
- **Tax on the mid-cycle upgrade path was not found, so 'tax for every charge' is established only for checkout and top-up.** Affects: Existing subscribers changing plan. Evidence: apps/web/app/api/upgrade/route.ts (no tax parameters found by search). Work needed: Read the upgrade route and the Stripe subscription tax settings and record the result.
- **The brief says a 'pending confirmation screen' waits; the component is invisible and the visible screen is UpgradeWelcome.** Affects: Testers writing steps. Evidence: PendingCheckoutConfirmation.tsx:69; UpgradeWelcome.tsx:96-114. Work needed: Correct the wording in tests and docs.

**Depends on**

- F100-01
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-observability-and-operations
- table:subscriptions
- table:processed_stripe_events
- table:beta_redemptions
- file:apps/web/app/api/checkout/route.ts

## Unknown

- Tax handling on /api/upgrade mid-cycle changes.
- Which Stripe webhook events are enabled in the live Stripe account.
- Retention of processed_stripe_events and audit events.
- Whether the Stripe account holds tax registrations for the regions customers buy from (the code states it keeps no jurisdiction list).
- Whether the daily reconcile email recipient inbox is monitored.
- How the redeem-an-access-code route (not read) writes beta_redemptions.
