---
id: "F083-03"
type: "feature"
title: "Upgrade a live plan with proration and promotion code"
aliases: ["Upgrade with proration (S83.05)", "Coupon entry (S83.07)", "Promotion code", "Upgrade confirm dialog", "Order details", "/api/upgrade/preview", "/upgrade/<plan>", "Mid-cycle upgrade"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.05", "S83.07"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:basic", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "api:POST /api/upgrade/preview", "api:POST /api/upgrade", "api:POST /api/stripe-webhook", "table:subscriptions", "file:apps/web/lib/server/stripe-upgrade-preview-token.ts", "F083-02", "F083-04", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-03 Upgrade a live plan with proration and promotion code

A paying web user moves to a higher plan mid-cycle. The app asks the server for a priced preview (credit for unused time, subtotal, discount, tax, total due today), lets the person add a promotion code, and on confirm charges the saved card with a signed preview token. A new billing period starts that day.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.05](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8305), [S83.07](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8307).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Previews and applies an upgrade of a live Stripe subscription, with proration lines, tax, an optional promotion code, and a confirmation.

**Why it exists.** Upgrades must explain proration: credit for unused time, the charge today, and when renewal happens (S83.05), and users can enter a promotion code when buying (S83.07). Charging a saved card needs explicit assent.

**Who uses it.** Paying web and Desktop users on Basic, Premium or Max moving up, and Team owners adding seats or moving from an individual plan to Team.

**Problems it solves**

- Surprise charges: the dialog shows what will be taken today.
- Stale prices: the token expires after 10 minutes and must match user, plan, interval, seats and code.
- Silent coupon failure: a bad code shows an error and nothing changes.
- Free-to-paid users with no card to credit are sent to full checkout rather than a fake proration.

**Use cases**

- Premium user clicks 'Max' and sees a prorated charge before confirming.
- Team owner raises seats and sees the tax line.
- User applies a promotion code and sees the discount row.
- User on a plan with no paid Stripe charge is told it is not a prorated upgrade and starts normal checkout.

## 2. User experience

**Where to find it**

- Web /pricing: for a paid subscriber an Individual plan button goes to /upgrade/<plan>; the Team button opens the 'Upgrade to Team' dialog (apps/web/app/pricing/page.tsx:645-657).
- Web /upgrade (chooser) then /upgrade/<plan> (apps/web/app/upgrade/UpgradeChooser.tsx:99,230).
- Chat upgrade dialog (apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx).
- Desktop: same pages in the Electron window.
- Mobile: no upgrade in the shipped build (see F083-02).

**Before you start**

- Signed in with an active or trialing Stripe-billed subscription (apps/web/app/pricing/page.tsx:636-645).
- Billing details loaded.
- Not on a store-billed or organization-managed plan; those see a link to the owner instead (pricing/page.tsx:641-644).

**Screens and controls**

- /upgrade note: 'Upgrading starts a new billing period today, with credit for unused time on your plan.' (UpgradeChooser.tsx:99).
- Order screen: card 'Order details', 'Calculating your prorated cost…', rows per proration line, 'Subtotal', 'Discount (CODE)', 'Tax', 'Total', 'Applied balance', 'Total due today', 'Credit toward future invoices' (apps/web/features/billing/components/UpgradeOrderPanel.tsx:315-460).
- 'Payment method' section naming the card that will be charged (UpgradeOrderPanel.tsx:503).
- Agreement checkbox and button 'Subscribe to <plan>' (UpgradeOrderPanel.tsx:541-584).
- Dialog for Team: title 'Upgrade to <plan>', 'Order details', Cancel, and 'Confirm · pay <amount>' (apps/web/features/billing/components/UpgradeConfirmDialog.tsx:263,411-430).
- Promotion control: link 'Add a promotion code', field 'Promotion code', button 'Apply', and 'Remove' (apps/web/features/billing/components/UpgradePromotionCode.tsx:61-113).

**Journey**

1. Choose a higher plan.
2. The screen asks the server for a preview and shows 'Calculating your prorated cost…'.
3. Read the lines: new plan for the new period, credit for unused time, subtotal, tax, total due today, and the renewal date.
4. Optionally click 'Add a promotion code', type it, click 'Apply'. The preview refreshes with a discount row.
5. Tick the agreement (order screen) and click the confirm button.
6. The server charges the saved card and answers that activation is pending. The page refreshes the account; the plan changes when the webhook lands.
7. Order screen then says 'You're on <plan>.' and 'Your new capacity is active. It can take a moment to appear everywhere.' The Team dialog toasts 'Your plan has been upgraded.'

**What the person sees and gets**

- Errors in plain words: 'Upgrade failed. Your current plan is unchanged.' (UpgradeConfirmDialog.tsx:249; UpgradeOrderPanel.tsx:299).
- Promotion errors: 'That promotion code could not be applied.'; server texts 'That promotion code does not apply to this upgrade.' and 'The promotion code could not be checked. Please try again.' (apps/web/app/api/upgrade/preview/route.ts:473,503).
- Not-prorated message: 'Your current plan has no paid Stripe charge to credit, so this is not a prorated upgrade...' (UpgradeConfirmDialog.tsx:276).
- If extra payment action is needed the server answers 402 with a payment link (apps/web/app/api/upgrade/route.ts:359-372).

**Settings**

- None in the screen. The proration rule is set in code: always-invoice with a new billing anchor for tier upgrades (doc: docs/product/commercial.md:144-152).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/upgrade/preview computes the proration lines with a Stripe invoice preview, counting only proration lines, per-line tax and any discount (apps/web/app/api/upgrade/preview/route.ts:55-150,480-495).
- The preview returns a signed token binding user, plan, interval, subscription, seats, promotion and proration date; it expires after 10 minutes (apps/web/lib/server/stripe-upgrade-preview-token.ts:7-50).
- POST /api/upgrade verifies the token ('Your upgrade preview expired or no longer matches this subscription. Preview the price again.') and applies the change with an idempotency key (apps/web/app/api/upgrade/route.ts:279-352).
- After Stripe returns, the route checks the target price and seat count were applied, else 500 'Upgrade payment status could not be verified' (route.ts:376-389).
- Pending extra payment gives 402 and the old plan stays (route.ts:359-373; doc: docs/product/definition.md:395).
- A scheduled cancellation blocks an upgrade with code subscription_pending_cancellation (route.ts:200-212).
- Account with no paid Stripe charge to credit gets 409 checkout_required; the UI switches to the full checkout wording and button (preview/route.ts:223-254; UpgradeConfirmDialog.tsx:137-146,275-276).
- Promotion codes: checked on the server in preview and on confirm; failures leave the plan unchanged (preview/route.ts:465-503; upgrade/route.ts:259-275).
- First-purchase coupons: the hosted Checkout page has allow_promotion_codes true (apps/web/app/api/checkout/route.ts:522).
- Web client waits for plan_tier to settle after the call because the webhook writes it (apps/web/app/pricing/page.tsx:278-286).

**Incomplete**

- Mobile: the brief says the billing screen shows proration wording; no proration or 'unused time' wording was found in apps/mobile non-test source (grep), and the shipped build cannot upgrade.

**Present but disconnected or switched off**

- Mobile in-app plan change code (store replacement modes) exists but is compiled off (apps/mobile/src/features/billing/useMobileIap.ts; storePurchases.json).

**Not available**

- Upgrade on CLI, VS Code, Chrome (they link to web).
- In-app upgrade on mobile in the shipped build.

## 4. Required behaviour

**Established requirements**

- Upgrades explain proration: credit for unused time, the charge today and when the next renewal happens. (source: S83.05)
- Users can enter a coupon or promotion code when buying. (source: S83.07)
- An immediate tier upgrade starts a new billing period that day and charges the new price minus credit for unused time; if payment is incomplete or fails the old plan stays. (source: doc: docs/product/definition.md:395)
- Preview and charge share one signed proration timestamp; a seat increase keeps the renewal date. (source: doc: docs/product/commercial.md:144-152)
- Usage never resets on upgrade; consumed usage and purchased balance carry forward. (source: doc: docs/product/commercial.md:153-158)

**Acceptance criteria**

1. The preview lists real proration lines and a Total due today equal to what Stripe takes.
2. A stale or mismatched preview token makes confirm fail and tells the user to preview again.
3. A valid promotion code shows a discount row and its description; an invalid code shows an error and leaves the total unchanged.
4. If the card needs extra action, the old plan stays active and a payment link is offered.
5. A user whose plan has no paid charge to credit sees the non-prorated explanation and a start-checkout button.
6. After confirm the plan changes only after the webhook; the screen does not claim activation before it can be read.
7. A store-billed or organization-managed user cannot start this flow.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because /api/upgrade does not call the waitlist gate, a paying user can always upgrade [inferred: no Waitlist reference in apps/web/app/api/upgrade/route.ts, and holdsLivePaidSubscription skips the gate in checkout].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the order-screen button say 'Upgrade' rather than 'Subscribe to <plan>' when the flow is a proration.
- [proposed] If mobile should show proration text, add it to the store-purchase branch and test it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/upgrade/preview | `apps/web/app/api/upgrade/preview/route.ts` | Priced preview, promotion check, signed token, checkout_required. |
| endpoint | POST /api/upgrade | `apps/web/app/api/upgrade/route.ts` | Verifies token and updates the Stripe subscription. |
| service | Preview token | `apps/web/lib/server/stripe-upgrade-preview-token.ts` | Signs and verifies the preview token (10 minutes). |
| service | Plan change anchor | `apps/web/lib/server/stripe-plan-change.ts` | Proration anchor and plan-change items (named in docs). |
| service | Plan change gate | `apps/web/lib/services/billing-plan-change-gate.ts` | Checks upgrade is allowed. |
| service | Stripe payments client | `apps/web/features/billing/services/stripe-payments.ts` | previewUpgrade and upgradePlanMidCycle calls and parsing. |
| component | UpgradeConfirmDialog | `apps/web/features/billing/components/UpgradeConfirmDialog.tsx` | Team and dialog upgrade review and confirm. |
| component | UpgradeOrderPanel | `apps/web/features/billing/components/UpgradeOrderPanel.tsx` | Order details, payment method, agreement, subscribe. |
| component | UpgradePromotionCode | `apps/web/features/billing/components/UpgradePromotionCode.tsx` | Add, apply, remove promotion code. |
| screen | UpgradeOrderScreen | `apps/web/app/upgrade/[plan]/UpgradeOrderScreen.tsx` | Page wrapper and success view. |
| screen | UpgradeChooser | `apps/web/app/upgrade/UpgradeChooser.tsx` | Next-plan recommendation and proration note. |
| hook | useUpgradePlanFlow | `apps/web/features/billing/hooks/useUpgradePlanFlow.tsx` | Chat-side upgrade flow. |
| service | Billing queries | `apps/web/features/billing/hooks/use-billing-queries.ts` | Plan and usage data refreshed after upgrade. |
| endpoint | Stripe webhook | `apps/web/app/api/stripe-webhook/route.ts` | Writes the new plan after the paid invoice. |
| table | subscriptions | `apps/web/app/api/upgrade/route.ts` | Read for current plan and Stripe ids. |
| test | Upgrade tests | `apps/web/app/api/upgrade/preview/route.test.ts` | Preview behaviour. |
| test | Stale tier test | `apps/web/app/api/upgrade/route.stale-tier.test.ts` | Stale plan refusal. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page opens the order screen or dialog and calls POST /api/upgrade/preview. | device and our servers | apps/web/features/billing/components/UpgradeConfirmDialog.tsx:118-122; stripe-payments.ts:410 |
| Server reads the user's subscription, owner policy and live Stripe subscription; no paid charge gives 409 checkout_required. | our servers | apps/web/app/api/upgrade/preview/route.ts:257-310,223-254 |
| Server resolves the promotion code and asks Stripe for an invoice preview with the proration anchor. | outside service | apps/web/app/api/upgrade/preview/route.ts:462-495 |
| Server returns charge breakdown, recurring terms and a signed token. | our servers | apps/web/app/api/upgrade/preview/route.ts:508-540 |
| On confirm the page posts /api/upgrade with the token; server verifies it and updates the Stripe subscription with an idempotency key. | outside service | apps/web/app/api/upgrade/route.ts:279-352 |
| Server confirms the target price and seats were applied and answers activation 'webhook_pending'; webhook later writes the plan. | our servers | apps/web/app/api/upgrade/route.ts:376-415; handlers.ts:139 |
| Browser refreshes the account and billing queries. | device | apps/web/app/upgrade/[plan]/UpgradeOrderScreen.tsx:20-26 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Preview token (signed text) | Page memory only | No | Valid 10 minutes; not stored by the server |
| Updated subscription items and discounts | Stripe; plan_tier in table subscriptions after the webhook | Read by all apps via the account API | Per SYS-subscriptions-entitlements-and-usage |
| Audit event plan_changed (status webhook_pending) | Security audit log | No | Retention unknown |

**Models and providers.** No AI model is involved. The token is signed with the Stripe secret key as the key material (apps/web/app/api/upgrade/preview/route.ts:535). Stripe computes proration and tax. Carried usage is handled by SYS-subscriptions-entitlements-and-usage.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with a Stripe-billed active or trialing subscription (upgrade/route.ts:100-120). |
| Permissions | CSRF token (upgrade/route.ts:48). Seat changes on Team: role rules not read here; see SYS-authorization-and-workspaces. |
| Subscription | Target plan must be a legal upgrade from the current plan; otherwise 400 with the reason (upgrade/route.ts:244-256). Not available on store, organization or terminal states (upgrade/route.ts:100-108). |
| Limits and metering | Rate limit bucket 'upgrade' (upgrade/route.ts:51). Token expiry 10 minutes. Consumed usage carries into the higher plan (doc: docs/product/definition.md:395). |
| Feature flags | None found for this route beyond the Stripe key. The pricing page needs billing policy ready (apps/web/app/pricing/page.tsx:636-640). |
| Model compatibility | None found in the code. |
| Provider restrictions | Stripe subscriptions only; Apple and Google plans are refused with owner messages (subscription-billing-owner.ts:129-146). |
| Local mode | Not applicable: Local and own-key need no plan. A signed-in Free user with no card sees the checkout path instead (preview 409 checkout_required). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Preview loading | 'Calculating your prorated cost…' and confirm disabled. | UpgradeConfirmDialog.tsx:266,414; UpgradeOrderPanel.tsx:355 |
| Preview failed | Error line; order card says 'No charge could be calculated for this plan right now.' | UpgradeOrderPanel.tsx:455-459 |
| Token expired or changed | 400 asking to preview again; plan unchanged. | upgrade/route.ts:293-295 |
| Bad promotion code | Inline alert; removing it re-runs the preview. | UpgradePromotionCode.tsx:109-113; UpgradeConfirmDialog.tsx:216-220 |
| Payment needs action | 402 with link; old plan stays. | upgrade/route.ts:359-373 |
| Cancellation scheduled | 409 subscription_pending_cancellation. | upgrade/route.ts:200-212 |
| Customer balance exists | Shows Total, Applied balance and Total due today separately. | UpgradeConfirmDialog.tsx:346-367 |
| Double click on confirm | Button disabled while confirming; Stripe idempotency key prevents a repeat charge. | UpgradeConfirmDialog.tsx:414; upgrade/route.ts:349 |
| Accessibility | Order card is aria-live polite and busy while loading; promotion input has a hidden label; errors use role alert. | UpgradeOrderPanel.tsx:315-318; UpgradePromotionCode.tsx:77,109 |
| Session expired | Order screen shows 'Your session expired before we could read your plan. Nothing has been charged.' and a sign-in link. | UpgradeOrderPanel.tsx:327-340 |
| Offline | not handled in the code beyond the error line. | UpgradeConfirmDialog.tsx:148 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/upgrade/preview/route.test.ts`: Preview totals, promotion and checkout_required.
- `apps/web/app/api/upgrade/route.seats.test.ts`: Seat changes.
- `apps/web/app/api/upgrade/route.stale-tier.test.ts`: Stale plan refusal.
- `apps/web/__tests__/api/upgrade-double-credit.test.ts`: No double credit on upgrade.
- `apps/web/lib/server/stripe-upgrade-preview-token.test.ts`: Token signing and checks.
- `apps/web/features/billing/components/UpgradeConfirmDialog.test.tsx`: Full-price disclosure, renewal wording, per-seat renewal.
- `apps/web/features/billing/components/__tests__/UpgradeConfirmDialog.receipt.test.tsx`: Itemized receipt.
- `apps/web/features/billing/components/UpgradeOrderPanel.test.tsx`: Order panel states.
- `apps/web/app/upgrade/[plan]/UpgradeOrderScreen.test.tsx`: Order screen.
- `apps/web/features/billing/hooks/useUpgradePlanFlow.test.tsx`: Chat upgrade flow.

**Test scenarios**

- **Prorated upgrade**
  1. Sign in with an active Basic plan on a test Stripe account.
  2. Open /upgrade/pro.
  3. Read the order details, tick the agreement, click Subscribe.
  - Expected: Credit and charge lines match Stripe's invoice; plan becomes the higher tier after the webhook.
- **Promotion code**
  1. Open the order screen.
  2. Click 'Add a promotion code', apply a valid code, then an invalid one.
  - Expected: Valid: Discount row and 'Promotion CODE: ...'. Invalid: inline error, total unchanged.
- **Stale preview**
  1. Open the preview.
  2. Wait over 10 minutes.
  3. Click confirm.
  - Expected: Error asking to preview again; plan unchanged; no charge.
- **No paid charge to credit**
  1. Use an account with a free-of-charge granted plan.
  2. Open the upgrade dialog for Team.
  - Expected: Non-prorated explanation and a 'Start ... · pay ...' button leading to hosted checkout.
- **Declined card**
  1. Use a test card that requires action or declines.
  2. Confirm the upgrade.
  - Expected: 402 with payment link or an error; message says the current plan is unchanged.

**Where to look when it fails**

- Server log 'Stripe upgrade preview failed' and 'Stripe returned an upgrade without the target price and seat count applied' (preview/route.ts:495; upgrade/route.ts:378).
- Audit event plan_changed with status webhook_pending.
- Table subscriptions after the webhook.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **Brief says mobile shows proration wording; none found in mobile source.** Affects: Mobile. Evidence: grep for 'prorat' and 'unused time' in apps/mobile/src, app, lib found only tests and an unrelated delete-account file. Work needed: Correct the brief or add the wording to the purchase branch.
- **The order screen button reads 'Subscribe to <plan>' even for a proration upgrade.** Affects: Web, Desktop. Evidence: apps/web/features/billing/components/UpgradeOrderPanel.tsx:584. Work needed: Wording change [proposed].
- **Whether the 'next renewal' date line always shows depends on Stripe returning a period end; the dialog falls back to 'Then <price> at each renewal'.** Affects: Web, Desktop. Evidence: apps/web/features/billing/components/UpgradeConfirmDialog.tsx:382-386. Work needed: None required; fallback exists.
- **No live run records a real prorated charge matching the preview.** Affects: Web, Desktop. Evidence: No such record found. Work needed: Run in Stripe test mode and record.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:basic
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- api:POST /api/upgrade/preview
- api:POST /api/upgrade
- api:POST /api/stripe-webhook
- table:subscriptions
- file:apps/web/lib/server/stripe-upgrade-preview-token.ts
- F083-02
- F083-04
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-api-and-contracts

## Unknown

- Contents of apps/web/lib/server/stripe-plan-change.ts were not opened; proration anchor details come from docs and route comments.
- Whether the chat upgrade dialog calls /upgrade or the dialog (consumer not read).
- Mobile store proration behaviour (Android replacement modes) was not verified in a run.
- How Stripe's own configuration affects the invoice (dashboard settings not in the repository).
