---
id: "F083-02"
type: "feature"
title: "Start a paid plan (checkout, access gate, confirmation)"
aliases: ["Upgrade checkout (S83.03)", "Purchase confirmation (S83.13)", "Start a paid plan", "POST /api/checkout", "Pending checkout confirmation", "Waitlist access gate", "/billing?success=true"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.03", "S83.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:free", "plan:basic", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "api:POST /api/checkout", "api:GET /api/waitlist", "api:POST /api/waitlist/access", "api:POST /api/stripe-webhook", "api:POST /api/mobile/iap/verify", "table:subscriptions", "table:profiles", "table:beta_redemptions", "store:agi.billing.pendingCheckout", "F083-01", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-02 Start a paid plan (checkout, access gate, confirmation)

A signed-in person clicks a plan button, the server checks access and existing subscriptions, creates a hosted Stripe subscription checkout, and the browser goes there. After paying, the person returns to /billing?success=true, which waits for the plan to turn active and says 'You're all set.' Mobile purchase code exists but is compiled off.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.03](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8303), [S83.13](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8313).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a plan choice into a paid subscription: access check, duplicate-subscription check, hosted payment page, and a confirmation that the plan is active.

**Why it exists.** A signed-in user must be able to start and complete a paid checkout (S83.03) and see that what they bought is active (S83.13), without being double billed.

**Who uses it.** Free users and returning customers with no live paid plan on web and Desktop; staff who open or close the paid-upgrade gate.

**Problems it solves**

- Double billing across Stripe, Apple, Google and organization grants.
- Paying but not seeing the plan active.
- Paid sales opening before the owner decides: a waitlist and access code gate controls first purchases.
- Two open checkout pages racing to create two subscriptions.

**Use cases**

- A Free user with an access code buys Premium from /pricing.
- A new Team owner buys 5 seats yearly.
- A user on Apple billing tries web checkout and is told to manage the Apple plan first.
- A Desktop user pays in the browser and the app window picks up the new plan when focus returns.

## 2. User experience

**Where to find it**

- Web /pricing plan buttons and /upgrade/<plan> (apps/web/app/pricing/page.tsx:601; apps/web/app/upgrade/[plan]/UpgradeOrderScreen.tsx).
- Desktop: same pages in the Electron window; the payment page opens in the user's browser and the window rereads the plan on return (apps/web/features/desktop-host/lib/browser-handoff.ts:49-60).
- Mobile: purchase rows in the Subscription screen exist in code but only when native purchases are compiled in (apps/mobile/src/features/settings/cloud-billing/index.tsx:351,736-808).
- CLI, VS Code, Chrome: send the user to the web; no checkout of their own (apps/cli/src/usage_summary.rs:668; apps/extension/src/side_panel.ts:14139).

**Before you start**

- Signed-in account.
- No live paid subscription anywhere (Stripe, Apple, Google or organization).
- For an account that never held a paid plan: upgrade access (access code redeemed, or the operator switch / AGI_BILLING_WAITLIST_OPEN on) (apps/web/lib/server/billing-waitlist-access.ts:28-54).
- Checkout switched on and a ready price for the plan, interval and region.

**Screens and controls**

- Plan button on /pricing (labels in F083-01).
- Waitlist dialog: 'Join upgrade waitlist', 'Have an access code?', field 'Access code' with placeholder 'Enter code', button 'Continue with code' (apps/web/features/billing/components/UpgradeWaitlistDialog.tsx).
- Order screen /upgrade/<plan>: 'Order details', checkbox agreeing to recurring charge, button 'Subscribe to <plan>' or 'Start free trial' (apps/web/features/billing/components/UpgradeOrderPanel.tsx:315,541-587).
- Toast 'Redirecting to checkout...' while the session is created (apps/web/app/pricing/page.tsx:676; locale key redirectingToCheckout).
- Hosted Stripe page: card, full billing address, tax ID, terms-of-service tick box (apps/web/app/api/checkout/route.ts:517-524).
- Confirmation: /billing?success=true shows 'You're all set.' with plan name and renewal date, buttons 'Start chatting' and 'View billing' (apps/web/app/billing/UpgradeWelcome.tsx:99,172-190).

**Journey**

1. Click the plan button. Signed out: go to sign-in and return.
2. The page asks the server whether this account needs the waitlist. If yes the waitlist dialog opens: enter an access code or join the waitlist.
3. With access, the page posts to /api/checkout with plan, interval and seats. The toast reads 'Redirecting to checkout...'.
4. The server returns a payment page link and a session id. The page stores the session id and plan in the browser and goes to the link (in Desktop it opens the browser).
5. Pay on the hosted page. Stripe returns to /billing?success=true&session_id=...
6. /billing checks the session belongs to you, then polls your account every 2 seconds for up to 30 seconds until the plan matches and status is active or trialing.
7. The page shows 'You're all set.' If it takes too long it says the plan is taking longer than usual and tells you to check Billing before buying again.

**What the person sees and gets**

- Hosted-page cancel returns to /pricing (route.ts:502).
- Messages: 'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.' (billing-waitlist-access.ts:11-12); 'This account already has an active subscription with our payment provider. Open Billing to manage it, or contact support if your plan is not showing yet.' (route.ts:70-71); 'Billing details could not be verified. No checkout was created; please retry.' (route.ts:68-69).
- Desktop handoff text: 'Checkout opened in your browser. Pay there, then come back: this window reads your plan again when you return.' (stripe-payments.ts:30-31).

**Settings**

- STRIPE_CHECKOUT_ENABLED and NEXT_PUBLIC_CHECKOUT_ENABLED.
- AGI_BILLING_WAITLIST_OPEN and the operator flag that opens upgrades per account (apps/web/lib/feature-flags/billing-upgrade-gate.ts).
- Mobile: nativePurchases in storePurchases.json and server MOBILE_IAP_ENABLED.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/checkout validates body, CSRF, rate limit, plan hold, price and seats, then creates a subscription Checkout Session with terms-of-service consent (apps/web/app/api/checkout/route.ts:169-524).
- Waitlist gate: an account without a live paid subscription needs hasBillingWaitlistAccess, else HTTP 403 with the waitlist code (route.ts:297-310; billing-waitlist-access.ts:42-66).
- Owner conflict: Apple, Google, organization-managed or unverifiable ownership returns 409 with a message naming the owner (route.ts:312-314; apps/web/lib/server/subscription-billing-owner.ts:129-160).
- Live Stripe subscription guard: any of active, trialing, past_due, unpaid, incomplete, paused for the customer gives 409 (route.ts:98-120,391-429).
- Open checkout sessions for the same user are expired before a new one is made; a completed sibling gives 409 (route.ts:468-492,535-559).
- Idempotency-Key header makes the session creation repeatable (route.ts:525-529).
- Stripe card, invalid request, authentication, rate limit and connection errors map to plain messages (route.ts:574-606).
- Browser stores session id and plan under agi.billing.pendingCheckout for one hour (apps/web/features/billing/lib/pending-checkout.ts:3-4; stripe-payments.ts:245).
- PendingCheckoutConfirmation, mounted app-wide, polls every 2 s for 30 s while a pending checkout exists and moves to /billing?success=true when the plan matches (apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:12-67; apps/web/app/AppRuntimeMounts.tsx:27).
- /billing verifies the Stripe session for this user and shows UpgradeWelcome (apps/web/app/billing/page.tsx:20-48; UpgradeWelcome.tsx:59-141).
- Webhook checkout.session.completed provisions via upsertSubscriptionFromSession, but waits for async_payment_succeeded when payment_status is unpaid (apps/web/app/api/stripe-webhook/lib/handlers.ts:76-101).

**Incomplete**

- Mobile: purchase, receipt verification, confirmation and restore code exist, but the shipped build is purchases-off (apps/mobile/src/features/billing/storePurchases.json; useMobileIap.ts).

**Present but disconnected or switched off**

- Mobile native purchases: nativePurchases false, FEATURES.billing false (apps/mobile/lib/v1FeatureFlags.ts:8), and the server catalog returns 'Native purchases are not enabled for this deployment.' unless MOBILE_IAP_ENABLED is on (apps/web/lib/server/mobile-iap-catalog.ts:53-56,132).
- First paid purchases on web are gated by the waitlist or access code by owner decision (doc: docs/product/commercial.md:56-72).

**Not available**

- Checkout inside CLI, VS Code and Chrome.
- Mobile store purchase before the owner switches it on (doc: docs/product/commercial.md:66-69).

## 4. Required behaviour

**Established requirements**

- A signed-in user can start and complete a paid upgrade checkout. (source: S83.03)
- After paying, the user sees a confirmation of what was bought and that it is active. (source: S83.13)
- Working checkout code does not open paid purchasing; a valid access code or founder-opened gate is required until the paid waitlist is retired. (source: doc: docs/product/commercial.md:48-56)
- Access codes authorize acquisition, not a second subscription owner; clients do not fork the rule. (source: doc: docs/product/commercial.md:64-72)
- Mobile v1 sells nothing in the app; when store purchase is turned on it carries no waitlist or access code. (source: doc: docs/product/commercial.md:66-69)
- Server refuses a user who already has a live subscription anywhere, with a clear message. (source: S83.27)

**Acceptance criteria**

1. With no access, POST /api/checkout returns 403 with the waitlist code and the page opens the waitlist dialog.
2. With access, a Free user is redirected to a hosted payment page whose session has terms-of-service consent required.
3. A user with a live subscription (Stripe, Apple, Google or organization) cannot create a checkout and sees a message naming the owner.
4. Two quick clicks create one live checkout; the older open session is expired.
5. After a successful payment, /billing?success=true shows 'You're all set.' only when the plan matches and status is active or trialing.
6. If the plan does not activate within 30 seconds, the page says it is taking longer and tells the user to check Billing before trying again.
7. With checkout switched off, no session is created and the page shows the disabled notice.
8. Signed-out request to /api/checkout is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the server never writes the plan itself on return, activation depends on the Stripe webhook arriving [inferred from handlers.ts:76-101 and UpgradeWelcome polling].
- PendingCheckoutConfirmation exists for the case where the user lands on a page other than /billing, such as the Desktop window after paying in a browser [inferred from handoff text and pathname check at PendingCheckoutConfirmation.tsx:24-28].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a unit test for PendingCheckoutConfirmation; none was found.
- [proposed] Record one live end-to-end checkout run (test mode) in a project file.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Gate checks, customer, session creation. |
| schema | Checkout request schema | `apps/web/lib/validations/checkout.ts` | Plan, interval, seats and premium seats validation. |
| service | Waitlist access | `apps/web/lib/server/billing-waitlist-access.ts` | Gate check, 403 response, live-subscription test. |
| service | Billing owner policy | `apps/web/lib/server/subscription-billing-owner.ts` | Who may start checkout or open portal; owner messages. |
| service | Plan change gate | `apps/web/lib/services/billing-plan-change-gate.ts` | Refuses purchase during account deletion or open dispute. |
| service | Stripe payments client | `apps/web/features/billing/services/stripe-payments.ts` | upgradeToPlan posts to /api/checkout and hands off to the hosted page. |
| service | Browser handoff | `apps/web/features/desktop-host/lib/browser-handoff.ts` | Navigate in browser or open external browser from Desktop. |
| store | Pending checkout | `apps/web/features/billing/lib/pending-checkout.ts` | localStorage record of session id and plan, 1 hour. |
| component | PendingCheckoutConfirmation | `apps/web/features/billing/components/PendingCheckoutConfirmation.tsx` | Polls account and redirects to confirmation. |
| screen | Billing return page | `apps/web/app/billing/page.tsx` | Verifies the Stripe session for the user. |
| screen | UpgradeWelcome | `apps/web/app/billing/UpgradeWelcome.tsx` | Polling and 'You're all set.' confirmation. |
| component | Waitlist dialog | `apps/web/features/billing/components/UpgradeWaitlistDialog.tsx` | Join waitlist or redeem access code. |
| service | Waitlist client | `apps/web/features/billing/services/upgrade-waitlist.ts` | Calls /api/waitlist and /api/waitlist/access. |
| endpoint | Stripe webhook | `apps/web/app/api/stripe-webhook/lib/handlers.ts` | Provisions the subscription on checkout.session.completed. |
| table | subscriptions | `apps/web/lib/server/neon-types.ts` | Plan, status and Stripe/store ids per user (read at route.ts:280). |
| table | beta_redemptions | `apps/web/lib/server/billing-waitlist-access.ts` | A row means the user redeemed upgrade access (line 47-52). |
| table | profiles | `apps/web/app/api/checkout/route.ts` | stripe_customer_id read and written (lines 316-364). |
| endpoint | Mobile IAP catalog and verify | `apps/web/app/api/mobile/iap` | Server side of mobile store purchase (catalog, verify, notifications). |
| service | Mobile IAP client | `apps/mobile/src/features/billing/mobileIapService.ts` | Calls /api/mobile/iap/catalog and /verify. |
| hook | useMobileIap | `apps/mobile/src/features/billing/useMobileIap.ts` | Purchase, restore, acknowledgement on the phone. |
| config | Mobile purchase switch | `apps/mobile/src/features/billing/storePurchases.json` | nativePurchases false. |
| test | Checkout route tests | `apps/web/app/api/checkout/route.test.ts` | Gate, owner, live subscription, open session handling. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Button click: page resolves upgrade access via the server, then posts /api/checkout with Authorization, CSRF and Idempotency-Key headers. | device and our servers | apps/web/app/pricing/page.tsx:601-625; apps/web/features/billing/services/stripe-payments.ts:208-245 |
| Server checks CSRF, the checkout flag and the Stripe secret, rate limit, account hold, and parses the body. | our servers | apps/web/app/api/checkout/route.ts:173-217 |
| Server reads the user's subscription row, applies the waitlist gate and billing-owner policy. | our servers | apps/web/app/api/checkout/route.ts:278-314 |
| Server finds or creates the Stripe customer and refuses if Stripe already bills a live subscription. | outside service | apps/web/app/api/checkout/route.ts:332-429 |
| Server expires older open checkouts, creates the subscription Checkout Session and records an audit event 'checkout_started'. | outside service | apps/web/app/api/checkout/route.ts:468-573 |
| Browser stores the pending session and goes to the hosted page (Desktop opens the user's browser). | device | apps/web/features/billing/services/stripe-payments.ts:245-246; browser-handoff.ts:49-60 |
| Customer pays on the hosted page; Stripe sends webhook events; server writes the subscription. | outside service | apps/web/app/api/stripe-webhook/lib/handlers.ts:76-101 |
| Return page verifies the session and polls the account until active. | device and our servers | apps/web/app/billing/page.tsx:20-48; UpgradeWelcome.tsx:76-88 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Stripe customer id | table profiles (stripe_customer_id) and subscriptions | Server-side only | Kept with the account; replaced if Stripe does not know the stored id (route.ts:404-412) |
| Pending checkout record (session id, plan, start time) | Browser localStorage key agi.billing.pendingCheckout | No (this browser only) | Cleared on /billing, on activation, or after 1 hour (pending-checkout.ts) |
| Subscription row (plan_tier, status, ids, period end) | table subscriptions, written by the webhook | Read by all apps through the account API | Owned by SYS-subscriptions-entitlements-and-usage |
| Audit event checkout_started | Security audit log | No | Retention not read (unknown) |

**Models and providers.** No AI model takes part. The payment service is Stripe, reached only from the server (apps/web/lib/server/stripe-client.ts). Which models the bought plan unlocks is decided later by SYS-subscriptions-entitlements-and-usage and SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; the route resolves the user through getUserScopedDb (apps/web/app/api/checkout/route.ts:171) and an anonymous call is refused (test apps/web/e2e/checkout.spec.ts:30). |
| Permissions | CSRF token required (route.ts:173). No workspace role check was found in this route; Team seat ownership rules are in SYS-authorization-and-workspaces. |
| Subscription | A live paid plan blocks a new checkout. Accounts without one need upgrade access (access code row in beta_redemptions or the open switch) (billing-waitlist-access.ts:42-54,72-77). |
| Limits and metering | Rate limit bucket 'checkout' (route.ts:184); route deadline BILLING_API_ROUTE_DEADLINE_MS and circuit 'billing.checkout' (route.ts:610-616). Seats must be 2 or more and at most 999,999 for Team (packages/contracts/types/src/billing-catalog.ts:157-158; apps/web/lib/validations/checkout.ts:26). |
| Feature flags | STRIPE_CHECKOUT_ENABLED, NEXT_PUBLIC_CHECKOUT_ENABLED, AGI_BILLING_WAITLIST_OPEN, the billing upgrades operator flag, MOBILE_IAP_ENABLED, nativePurchases. |
| Model compatibility | None found in the code; checkout does not look at models. |
| Provider restrictions | Web checkout is Stripe only. Apple and Google subscriptions are bought only through the mobile store flow and block web checkout (subscription-billing-owner.ts:129-146). |
| Local mode | Local and own-key need no purchase. If checkout is off the server answers 'Paid-plan checkout is not available yet. Local and BYOK are free.' (route.ts:178-182). Buying requires sign-in even though Local does not. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Waitlist required | 403 with waitlist code; page opens the waitlist dialog without joining. | route.ts:307-309; apps/web/app/pricing/page.tsx:660-667; test page.test.tsx:707 |
| Gate unreadable | 503 'Upgrade access could not be verified. No checkout was created.' | route.ts:301-306 |
| Billing state unreadable | 503 and nothing created. | route.ts:286-293,316-329 |
| Live subscription | 409 conflict message. | route.ts:415-428 |
| Another checkout just completed | 409 and the new session is expired. | route.ts:486-492,551-559 |
| Payment service down or rate limited | Plain messages ('Payment service temporarily unavailable...', 'Too many requests...'). | route.ts:594-603 |
| Return before webhook | Page polls 2 s for 30 s, then shows a slow-activation message. | UpgradeWelcome.tsx:76-88,134-137 |
| Invalid or other user's session id on /billing | Redirect to /settings/billing. | apps/web/app/billing/page.tsx:15-35 |
| Async payment method | Plan is not provisioned until payment is confirmed. | handlers.ts:81-101 |
| Desktop | Payment opens in the browser; the window rereads the plan when focus returns. | browser-handoff.ts:49-60; stripe-payments.ts:41-43 |
| Accessibility | Confirmation text uses aria-live polite while activating. | UpgradeWelcome.tsx:132 |
| Offline | not handled in the code beyond the generic fetch error toast. | apps/web/app/pricing/page.tsx:668-670 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/checkout/route.test.ts`: Waitlist gate, owner conflicts, live Stripe subscription, open-session expiry, idempotency.
- `apps/web/app/api/checkout/route.catalog-binding.test.ts`: Catalog and price binding.
- `apps/web/app/api/checkout/route.premium-seats.test.ts`: Premium seats in checkout.
- `apps/web/app/api/checkout/route.tax-errors.test.ts`: Logging of Stripe refusals.
- `apps/web/app/billing/UpgradeWelcome.test.tsx`: Confirmation only for the exact target plan.
- `apps/web/app/billing/page.test.tsx`: Return page verification.
- `apps/web/features/billing/components/UpgradeWaitlistDialog.test.tsx`: Waitlist dialog.
- `apps/web/features/billing/services/stripe-payments.test.ts`: Client calls to billing routes.
- `apps/web/app/api/stripe-webhook/lib/__tests__/unpaid-checkout-entitlement.test.ts`: No entitlement while payment is unpaid.
- `apps/web/e2e/checkout.spec.ts`: Signed-out flow and anonymous API refusal.
- `apps/mobile/src/features/billing/__tests__/MobileIapPurchaseFlow.test.tsx`: Mobile purchase flow code.
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: Mobile never calls store or purchase routes in shipped config.

**Test scenarios**

- **Gated first purchase**
  1. Sign in as a Free account with no access code and the gate on.
  2. Click a paid plan button.
  - Expected: Button reads 'Join the <plan> waitlist'; no checkout is created; waitlist dialog opens.
- **Happy path with access**
  1. Redeem an access code.
  2. Click the plan button.
  3. Pay with a Stripe test card.
  4. Wait on /billing.
  - Expected: Redirect to hosted page, then 'You're all set.' within about 30 seconds, and Settings, Billing shows the plan.
- **Duplicate subscription**
  1. Use an account with an active Apple-billed plan.
  2. POST /api/checkout.
  - Expected: 409 with 'This subscription is billed by Apple...' and no Stripe session.
- **Slow webhook**
  1. Complete payment but hold webhook delivery.
  2. Stay on /billing.
  - Expected: 'Activating your <plan> plan…' then the 'taking longer than usual' text; no second charge.
- **Desktop handoff**
  1. In the Electron window click a plan button with access.
  2. Pay in the browser.
  3. Return to the window.
  - Expected: Window shows handoff text, then reads the new plan on focus.

**Where to look when it fails**

- Server logs: 'Refusing checkout: Stripe is already billing a subscription for this customer', 'Failed to verify paid upgrade access', 'Stripe rejected checkout session creation' (route.ts:416,302,576).
- Audit event checkout_started.
- Tables subscriptions, profiles, beta_redemptions.
- Webhook handler logs 'Subscription entitlement awaits asynchronous payment confirmation'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **No unit test found for PendingCheckoutConfirmation or pending-checkout storage.** Affects: Web and Desktop. Evidence: No test file referencing PendingCheckoutConfirmation found under apps/web. Work needed: Add tests for the 30 s poll and the redirect.
- **The draft says the confirmation moves the user to /billing after return; in code it does nothing on /billing itself (the return page does the polling).** Affects: Documentation. Evidence: apps/web/features/billing/components/PendingCheckoutConfirmation.tsx:24-28. Work needed: Describe the two confirmation paths separately.
- **Mobile purchase is off; the confirmation and restore paths have never been shown as run in a store build.** Affects: Mobile. Evidence: apps/mobile/src/features/billing/storePurchases.json; apps/mobile/lib/v1FeatureFlags.ts:8. Work needed: Owner switch-on plus store products live (brief S83.03 unfinished), then run on devices.
- **First-time Team purchase is blocked by the waitlist gate on web and Desktop by owner decision.** Affects: Web, Desktop. Evidence: apps/web/lib/server/billing-waitlist-access.ts:42-54; doc: docs/product/commercial.md:56-72. Work needed: Owner opens upgrades (AGI_BILLING_WAITLIST_OPEN or operator flag).
- **No record of a live end-to-end checkout run.** Affects: All web buyers. Evidence: No file in the repository records one that was read. Work needed: Run and record a test-mode purchase.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:free
- plan:basic
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- api:POST /api/checkout
- api:GET /api/waitlist
- api:POST /api/waitlist/access
- api:POST /api/stripe-webhook
- api:POST /api/mobile/iap/verify
- table:subscriptions
- table:profiles
- table:beta_redemptions
- store:agi.billing.pendingCheckout
- F083-01
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-security-and-privacy

## Unknown

- Whether the Stripe return and webhook run in production as the code assumes (no recorded live run).
- Retention period of the checkout_started audit event.
- Whether the Stripe account's Checkout settings show the tick box exactly as coded.
- Exact mobile behaviour on a real store build (no record found).
- Who consumes onUpgrade from the chat upgrade dialog for checkout (not read).
