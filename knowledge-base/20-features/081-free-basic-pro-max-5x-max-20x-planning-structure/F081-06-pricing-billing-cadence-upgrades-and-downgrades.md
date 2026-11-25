---
id: "F081-06"
type: "feature"
title: "Pricing, billing cadence, upgrades and downgrades"
aliases: ["Pricing, billing cadence, upgrades and downgrades", "Monthly and annual billing", "Upgrade effective time", "Downgrade effective time", "Grace-period behaviour", "Past due notice", "S81.17 S81.23 S81.24 S81.25"]
area: "81 Free / Basic / Pro / Max 5x / Max 20x planning structure"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S81.17", "S81.23", "S81.24", "S81.25"]
depends_on: ["F081-01", "F081-04", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-observability-and-operations", "table:subscriptions", "table:beta_redemptions", "api:POST /api/upgrade", "api:POST /api/upgrade/preview", "api:GET /api/billing/downgrade-preview", "api:POST /api/billing/downgrade-preview", "api:POST /api/checkout"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F081-06 Pricing, billing cadence, upgrades and downgrades

Individual plans are billed monthly; only Team offers monthly or annual. An upgrade is charged now with credit for unused time and shows the charge and next renewal before confirming. A downgrade is scheduled for the end of the period. Self-serve plans have no grace period: a failed renewal moves the account to Free until paid. Mobile store purchase is switched off.

Area: [81. Free / Basic / Pro / Max 5x / Max 20x planning structure](README.md). Requirement items: [S81.17](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8117), [S81.23](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8123), [S81.24](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8124), [S81.25](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8125).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets people pick a billing cadence where offered, preview and confirm an upgrade (apps/web/features/billing/components/UpgradeConfirmDialog.tsx:77), schedule a downgrade for the period end (apps/web/features/billing/components/DowngradeReviewDialog.tsx:167), and tells them what access remains after a failed payment (apps/web/features/billing/components/BillingPlanNotices.tsx:152).

**Why it exists.** So no charge or loss of access is a surprise, and plan changes behave the same as at the leading assistants.

**Who uses it.** Paying subscribers and people about to subscribe; support staff.

**Problems it solves**

- Surprise charges on upgrade
- Losing access immediately on downgrade
- Not knowing why paid features stopped
- Double billing between Stripe and an app store

**Use cases**

- Upgrade Premium to Max and read the total due today and the next renewal date before confirming
- Downgrade Max to Premium and see 'Switch on <date>'
- Team owner picks Annual and sees the yearly saving
- Renewal fails, the page shows 'Update payment method' and 'Pay now'

## 2. User experience

**Where to find it**

- Web: /pricing Team Monthly/Annual toggle and plan buttons (apps/web/app/pricing/page.tsx:1020-1050,494-560)
- Web: /upgrade chooser and upgrade confirm dialog (apps/web/app/upgrade/UpgradeChooser.tsx:99; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:77)
- Web: downgrade review dialog from the pricing page (apps/web/app/pricing/page.tsx:1310)
- Web: Settings > Billing notices (apps/web/features/billing/components/BillingPlanNotices.tsx:72)
- Desktop (public Electron app): same web pages
- Mobile: Settings > 'Subscription' shows plan, renewal or end date and a summary line (apps/mobile/src/features/settings/cloud-billing/index.tsx:159-170,351-390)
- CLI: 'usage' command subscription lines (apps/cli/src/usage_summary.rs:639-671)
- VS Code: account menu warning line (apps/extension-vscode/src/core/commandSetup.ts:2334-2340)
- Chrome: composer gate 'Update billing to restore Managed Cloud chat.' (apps/extension/_locales/en/messages.json:185)

**Before you start**

- Signed-in account
- Upgrade access: paid upgrades open in stages behind a waitlist or access code unless opened (apps/web/lib/server/billing-waitlist-access.ts:11-40)
- Stripe-billed subscription to upgrade or downgrade on web; a subscription billed elsewhere must be changed where it was bought (apps/web/app/api/upgrade/route.ts:97-106)

**Screens and controls**

- Pricing: audience toggle, Team 'Monthly' and 'Annual' buttons, seat counts, plan CTA, 'Current plan', 'Update payment' (page.tsx:494-560,1020-1050)
- Upgrade confirm dialog: line items, subtotal, discount, tax, 'Total due today', 'Renews <date>, then <terms>', Confirm and cancel (UpgradeConfirmDialog.tsx:300-420)
- Downgrade dialog: 'Switch on <date>' and 'Keep <current plan>' (DowngradeReviewDialog.tsx:274-279)
- Billing notice buttons 'Pay <amount> now', 'Update payment method' (BillingPlanNotices.tsx:84-118)
- Waitlist dialog (apps/web/features/billing/components/UpgradeWaitlistDialog.tsx)

**Journey**

1. Choose a plan on the pricing page or the upgrade chooser
2. If upgrade access is closed, join the waitlist or enter an access code
3. Web previews the charge: POST /api/upgrade/preview returns a signed preview
4. Read the charge and the new renewal date, then confirm; POST /api/upgrade applies it and the page polls until the plan changes
5. For a downgrade open the review dialog and confirm; the change is scheduled for the end of the period
6. If renewal fails the plan is served as Free and the notice explains how to pay

**What the person sees and gets**

- Upgrade note: 'Upgrading starts a new billing period today, with credit for unused time on your plan.' (UpgradeChooser.tsx:99)
- Confirm text: 'You'll be charged <amount> today. After that, <plan> renews at <terms>.' (UpgradeConfirmDialog.tsx:280)
- Downgrade text: '<Plan> starts on <date>, at the end of your current billing period. You keep <current> and its credits until then, and nothing is charged today.' (DowngradeReviewDialog.tsx:167)
- Success toasts 'Your plan has been upgraded.' and 'Your plan switches to <plan> on <date>.' (apps/web/app/pricing/page.tsx:1298,1316; pricing.json:217)
- Past due: 'Self-serve plans have no grace period: paid features stop at the first failed renewal and come back as soon as the payment succeeds. Your chats and files stay.' (BillingPlanNotices.tsx:152)
- Web chat toast 'Your plan lapsed. Update your payment method.' with 'Open billing' (apps/web/lib/hooks/useChatStream.ts:572)

**Settings**

- Team billing cadence choice (pricing page); yearly saving shown as 'save N% annually' (pricing.json:113; page.tsx:151)
- Switch to monthly billing for a yearly subscriber (doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-01)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Individual plans have no yearly price; Team has yearly $240 against $25 monthly per seat; the pricing page shows the saving and the toggle only when a yearly price is ready (billing-catalog.ts:200-215; apps/web/app/pricing/page.tsx:377,1020-1050)
- Upgrade preview and apply routes exist; apply refuses non-upgrades and tells the person to use the billing portal or downgrade flow (apps/web/app/api/upgrade/route.ts:112-125; apps/web/app/api/upgrade/preview/route.ts:257)
- Upgrade confirm dialog shows line items, tax, total due today and the renewal date (UpgradeConfirmDialog.tsx:300-385)
- A downgrade is scheduled for the period end through POST /api/billing/downgrade-preview; the dialog shows the end date and nothing is charged today (apps/web/app/api/billing/downgrade-preview/route.ts:60-120; DowngradeReviewDialog.tsx:137,167)
- Grace rule: statuses active and trialing are entitled; past_due, unpaid and everything else are not; Enterprise keeps access in past_due and unpaid unless collection is read-only (packages/contracts/types/src/subscription-entitlement.ts:3,19-43; doc: docs/product/commercial.md state ladder)
- A lapsed paid plan is served as Free with header X-AGI-Billing-Notice naming the status (apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:68,341-352); web chat shows a toast once per status per session (apps/web/lib/hooks/useChatStream.ts:559-575)
- CLI, VS Code and Chrome and mobile tell the person the plan is paused (apps/cli/src/usage_summary.rs:639-671; apps/extension-vscode/src/core/commandSetup.ts:2334-2340; apps/extension/src/side_panel.ts:13427-13440; apps/mobile/src/features/settings/cloud-billing/index.tsx:159-170)
- Yearly Premium is grandfathered with a stated notice (billing-plan-catalog.ts:43,56)

**Incomplete**

- Mobile store purchase, receipt and restore code are built but not shown: nativePurchases is false, FEATURES.billing is false and the server also needs MOBILE_IAP_ENABLED (apps/mobile/src/features/billing/storePurchases.json:2; apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:53-56)
- The internal Tauri plans modal sends a lower-plan choice to the billing portal and shows a different confirm dialog, not the scheduled-downgrade dialog (apps/desktop/src/features/pricing/PlansModal.tsx:80-98)
- The billing notice header is read only by web chat; mobile, CLI, VS Code and Chrome learn the status from their account calls (apps/web/lib/hooks/useChatStream.ts:563; search found no other reader)

**Present but disconnected or switched off**

- Paid upgrades are gated by a waitlist or access code; the operator switch and AGI_BILLING_WAITLIST_OPEN control it (billing-waitlist-access.ts:28-40; doc: docs/product/commercial.md line 24)
- Checkout can be switched off with STRIPE_CHECKOUT_ENABLED and NEXT_PUBLIC_CHECKOUT_ENABLED (apps/web/app/api/checkout/route.ts:58-62)
- Mobile in-app purchase and the Android downgrade-at-renewal mode are built but off (apps/mobile/src/features/settings/cloud-billing/index.tsx:244-249)

**Not available**

- Yearly billing for Basic, Premium, Max and Ultra (doc: docs/decisions/2026-09-27-founder-decisions.md)
- A grace period for self-serve plans (BillingPlanNotices.tsx:152)

## 4. Required behaviour

**Established requirements**

- Users can choose monthly or annual billing where a plan offers both, with the annual saving shown and checkout charging the chosen cadence. (source: S81.17 (brief))
- An upgrade takes effect at a stated time (immediately), with the charge and new renewal date shown before confirming. (source: S81.23 (brief))
- A downgrade takes effect at a stated time (for example end of period), shown before confirming, with access kept until then. (source: S81.24 (brief))
- When a renewal fails the plan follows a defined grace rule and the user is told what access remains and how to fix it. (source: S81.25 (brief))
- Individual plans are monthly only; Team has both cadences; existing yearly Premium subscribers keep their price. (source: doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-01)
- An upgrade starts a new billing period that day with credit for unused time; consumed usage and purchased balance carry forward. (source: doc: docs/product/commercial.md 'Plan Change, Proration, And Subscription State Transitions')
- Access is monotonic: below active and trialing the effective plan is Free; past_due and incomplete keep none of the paid access. (source: doc: docs/product/commercial.md state ladder table)
- Mobile purchase must show the same charge and renewal date before purchase; the store shows the price. (source: S81.23 (brief); apps/mobile/src/features/settings/cloud-billing/index.tsx:300-310)

**Acceptance criteria**

1. Individual plan cards show no cadence toggle; Team shows Monthly and Annual and the saving percent
2. Upgrade confirm dialog shows 'Total due today' and 'Renews <date>' before the Confirm button can be used
3. After confirm, the page polls until the plan changes and shows 'Your plan has been upgraded.'
4. Downgrade dialog shows the period end date and says nothing is charged today; after confirm the scheduled change appears with that date
5. A subscription in past_due is served as Free by the chat gate and the response carries X-AGI-Billing-Notice
6. The past-due notice says self-serve plans have no grace period and offers a way to pay
7. An Enterprise account in past_due keeps access until collection is read-only
8. With store purchases off, mobile shows no buy control and still shows the plan and status

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The scheduled downgrade date comes from the current period end held in Stripe, so access until then follows from the subscription staying active [inferred from DowngradeReviewDialog.tsx:118,167]
- Mobile will need the confirm step in the store sheet because the store shows the price (cloud-billing:300-310) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update commercial.md so it says downgrades are scheduled through the review dialog
- [proposed] Show the lapsed-plan notice on mobile, CLI, VS Code and Chrome from the same status field in one wording
- [proposed] Decide and document whether a short grace period should exist for self-serve plans

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | PricingPage | `apps/web/app/pricing/page.tsx` | Cadence toggle for Team, plan actions, dialogs (lines 377,494-560,1020-1050,1295-1320) |
| screen | UpgradeChooser | `apps/web/app/upgrade/UpgradeChooser.tsx` | Next plan and proration note (lines 61-99) |
| component | UpgradeConfirmDialog | `apps/web/features/billing/components/UpgradeConfirmDialog.tsx` | Charge preview and confirm (lines 77-420) |
| component | DowngradeReviewDialog | `apps/web/features/billing/components/DowngradeReviewDialog.tsx` | Scheduled downgrade review (lines 137-279) |
| component | BillingPlanNotices | `apps/web/features/billing/components/BillingPlanNotices.tsx` | Past due and trial notices (lines 72-200) |
| component | UpgradeWaitlistDialog | `apps/web/features/billing/components/UpgradeWaitlistDialog.tsx` | Waitlist or access code gate |
| endpoint | POST /api/upgrade/preview | `apps/web/app/api/upgrade/preview/route.ts` | Signed charge preview (line 257) |
| endpoint | POST /api/upgrade | `apps/web/app/api/upgrade/route.ts` | Apply an upgrade (lines 45-125) |
| endpoint | GET and POST /api/billing/downgrade-preview | `apps/web/app/api/billing/downgrade-preview/route.ts` | Read plan change state and schedule a downgrade (lines 41-120) |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | New subscription checkout with cadence and seats (lines 219-260) |
| service | stripe-plan-change | `apps/web/lib/server/stripe-plan-change.ts` | Plan change anchor, scheduleDowngrade, readPlanChangeState |
| service | billing-waitlist-access | `apps/web/lib/server/billing-waitlist-access.ts` | Waitlist and access code gate (lines 28-60) |
| service | auth-gate lapsed plan handling | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Serve as Free and set billing notice header (lines 68, 313-352) |
| config | subscription-entitlement | `packages/contracts/types/src/subscription-entitlement.ts` | Entitled statuses and enterprise grace (lines 3-43) |
| hook | surfaceBillingNotice | `apps/web/lib/hooks/useChatStream.ts` | Web toast for a lapsed plan (lines 559-575) |
| screen | Mobile CloudBillingScreen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Plan status, store purchase code kept off (lines 117-400) |
| config | mobile-iap-catalog | `apps/web/lib/server/mobile-iap-catalog.ts` | Server switch MOBILE_IAP_ENABLED for store products (line 53) |
| command | CLI subscription_lines | `apps/cli/src/usage_summary.rs` | Payment-failed and paused text (lines 24, 639-671) |
| command | VS Code account menu | `apps/extension-vscode/src/core/commandSetup.ts` | Billing warning line (lines 2334-2340) |
| component | Chrome billing gate | `apps/extension/src/side_panel.ts` | Blocks managed chat for an unentitled subscription (lines 13427-13440) |
| screen | Tauri PlansModal | `apps/desktop/src/features/pricing/PlansModal.tsx` | Internal desktop upgrade and portal logic (lines 60-110) |
| test | stripe-downgrade test | `apps/web/__tests__/api/stripe-downgrade.test.ts` | Downgrade handling |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks a plan; the page checks upgrade access and checkout availability for the region. | device and our servers | apps/web/app/pricing/page.tsx:330-350; apps/web/lib/server/billing-waitlist-access.ts:38-40 |
| For an existing Stripe subscription the app asks for an upgrade preview; the server builds a signed preview with proration. | our servers | apps/web/app/api/upgrade/preview/route.ts:257-540 |
| Stripe computes tax and proration for the preview and later the invoice. | outside service | doc: docs/product/commercial.md 'Plan Change, Proration...' (always_invoice and billing_cycle_anchor now) |
| On confirm the server applies the upgrade; the webhook updates plan_tier and carries usage into the new period. | our servers | apps/web/app/api/upgrade/route.ts:45-125; doc: docs/product/commercial.md |
| For a downgrade the server schedules the lower plan at period end through Stripe and records an audit event. | our servers | apps/web/app/api/billing/downgrade-preview/route.ts:60-120 |
| On a failed renewal Stripe sends a past_due or unpaid status; the chat gate serves Free and sets the billing notice header. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:313-352 |
| Clients show the notice from the header (web chat) or from the plan status in their account call. | device | apps/web/lib/hooks/useChatStream.ts:563-575; apps/cli/src/usage_summary.rs:639-671 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Subscription status, period end, cancel_at, scheduled change | table subscriptions and Stripe | Webhook from Stripe to our database; clients read through the account endpoint | Kept while the subscription exists |
| Audit event plan_changed with status scheduled | audit log | Server | unknown (downgrade-preview/route.ts:94-106) |
| Billing notice shown flag | browser session storage key agi.billing-notice-seen | No | Cleared when the browser session ends (useChatStream.ts:559-570) |
| Upgrade access grants | table beta_redemptions | Server | unknown (billing-waitlist-access.ts:48-55) |

**Models and providers.** None for the billing flow. Stripe is the outside payment service; Apple and Google stores are outside services when mobile purchase is on. A lapsed plan changes which models are reachable because the account is treated as Free (auth-gate.ts:341-352; model-catalog.ts:2216).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. Changes are made by the subscription's billing owner; a subscription billed through another channel is blocked with a message to use that channel (apps/web/app/api/upgrade/route.ts:97-106). |
| Permissions | The person who owns the Stripe subscription. Team seat changes need the workspace owner. |
| Subscription | Upgrade and downgrade apply to Basic, Premium, Max and Ultra (the individual ladder); Team and Enterprise follow seat and sales paths (billing-catalog.ts:32; apps/web/app/pricing/page.tsx:458-480). |
| Limits and metering | Seat count 2 to 999,999 (billing-catalog.ts:157-158). Previews are signed and time bound (apps/web/lib/server/stripe-upgrade-preview-token.ts, test file exists). |
| Feature flags | STRIPE_CHECKOUT_ENABLED, NEXT_PUBLIC_CHECKOUT_ENABLED, AGI_BILLING_WAITLIST_OPEN, the run-time billing upgrade gate, MOBILE_IAP_ENABLED, mobile FEATURES.billing and storePurchases.json nativePurchases. Production values unknown. |
| Model compatibility | None found in the code for billing; a lapsed plan reduces model access by moving to Free. |
| Provider restrictions | Stripe for web, Apple and Google for mobile when on; regional prices need a configured Stripe price (apps/web/app/api/checkout/route.ts:231-236). |
| Local mode | No billing rule applies to Local or own-key use; the CLI usage command reports the usage as unavailable when only local (apps/cli/src/usage_summary.rs:340-352,523). Mobile reads the plan only in Cloud mode (apps/mobile/src/features/billing/store.ts:73). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Upgrade chooser shows 'Checking your plan…'; confirm dialog previews before enabling Confirm | apps/web/app/upgrade/UpgradeChooser.tsx:110-120; UpgradeConfirmDialog.tsx:414 |
| Preview fails | Confirm stays disabled until a price is previewed | apps/web/features/billing/components/UpgradeConfirmDialog.tsx:239,414 |
| Upgrade webhook lag | Page polls 6 times at 1 second for the plan to change | apps/web/app/pricing/page.tsx:73-74,277-285 |
| Downgrade scheduling fails | 'The plan change could not be scheduled. Nothing was changed.' | apps/web/features/billing/components/DowngradeReviewDialog.tsx:140; downgrade-preview/route.ts:78-86 |
| Past due or unpaid on self-serve | Served as Free, no grace, chats and files stay | BillingPlanNotices.tsx:152; auth-gate.ts:341-352 |
| Enterprise past due | Access kept until collection becomes read-only; then 403 billing_read_only | subscription-entitlement.ts:19-31; auth-gate.ts:317-336 |
| Billing owned by another channel | Upgrade refused with a message naming the owner; Chrome and mobile show it | apps/web/app/api/upgrade/route.ts:97-106; apps/mobile/src/features/settings/cloud-billing/index.tsx:225-233 |
| Cancel | Dialogs have Cancel and 'Keep <plan>' and cannot be closed while confirming | UpgradeConfirmDialog.tsx:258,408; DowngradeReviewDialog.tsx:150,274 |
| Offline and timeout | Billing routes use a deadline policy; client offline handling not handled in the code | apps/web/app/api/billing/downgrade-preview/route.ts:13 |
| Accessibility | Pricing status messages use role status and alert | apps/web/app/pricing/page.tsx:968-1010 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/billing/components/UpgradeConfirmDialog.test.tsx`: Upgrade confirm dialog; contents not read
- `apps/web/features/billing/components/UpgradeOrderPanel.test.tsx`: Upgrade order panel; contents not read
- `apps/web/features/billing/components/UpgradeWaitlistDialog.test.tsx`: Waitlist dialog; contents not read
- `apps/web/features/billing/components/__tests__/BillingPlanNotices.past-due-link.test.tsx`: Past-due notice link; contents not read
- `apps/web/__tests__/api/stripe-downgrade.test.ts`: Downgrade; contents not read
- `apps/web/app/api/billing/downgrade-preview/route.test.ts`: Downgrade route; contents not read
- `apps/web/app/api/upgrade/preview/route.test.ts`: Upgrade preview; contents not read
- `apps/web/app/api/upgrade/route.stale-tier.test.ts`: Upgrade from a stale tier; contents not read
- `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.test.ts`: Lapsed paid plan served as Free with billing notice header (lines 298-312)
- `packages/contracts/types/src/__tests__/billing-catalog.test.ts`: Individual plans monthly only, Team monthly or yearly, yearly seat price (lines 143-161)
- `packages/contracts/types/src/__tests__/billing-plan-catalog.test.ts`: Yearly Premium withdrawn and grandfather notice
- `apps/mobile/src/features/billing/__tests__/MobileIapPurchaseFlow.test.tsx`: Store purchase flow in code that is switched off; contents not read
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: Mobile screen with purchases off; contents not read
- `apps/cli/src/usage_summary.rs`: Inline tests include a past_due case (line 1486)

**Test scenarios**

- **Upgrade preview then confirm**
  1. On a test Stripe subscription at Premium open /upgrade and choose Max
  2. Read the dialog
  3. Confirm
  - Expected: Dialog shows total due today and the renewal date before Confirm; after confirm the plan shows Max within about 6 seconds
- **Scheduled downgrade**
  1. On Max open the downgrade review for Premium
  2. Confirm
  - Expected: Toast says the plan switches on the period-end date; Max access and credits remain until then; nothing is charged today
- **Failed renewal**
  1. Set a test subscription to past_due in Stripe test mode
  2. Send a Cloud chat turn on web, then run CLI usage and open the VS Code account menu and Chrome side panel
  - Expected: Web serves the turn as Free with a toast; the others show the paused message or block chat; the notice says no grace period
- **Cadence**
  1. Open /pricing Business tab and toggle Monthly and Annual
  2. Open the individual tab
  - Expected: Team shows both prices and a saving percent; individual plans show monthly only
- **Mobile purchases off**
  1. Open Settings > Subscription on a build with nativePurchases false
  - Expected: Plan, renewal or end date and 'Managed on the web' text; no purchase or restore row
- **Waitlist gate**
  1. On a Free test account with the upgrade gate closed click a paid plan
  - Expected: Waitlist dialog or 'Paid upgrades are opening in stages' message

**Where to look when it fails**

- Error code waitlist_access_required with message 'Paid upgrades are opening in stages...' (billing-waitlist-access.ts:11-20)
- Log 'Scheduling a downgrade failed' (downgrade-preview/route.ts:80)
- Response header X-AGI-Billing-Notice (auth-gate.ts:68)
- Status values in subscriptions.status and Stripe webhook logs
- CLI usage output lines 'Your last payment did not go through...' (usage_summary.rs:655-658)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Desktop: [70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Mobile: [70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- CLI: [70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- VS Code: [70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Chrome: [70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md)

## 10. Gaps and dependencies

- **Self-serve plans have no grace period; the brief asks for a defined grace rule. The rule is defined as none for self-serve and kept access for Enterprise only** Affects: All self-serve subscribers on every app. Evidence: apps/web/features/billing/components/BillingPlanNotices.tsx:152; packages/contracts/types/src/subscription-entitlement.ts:3,19-31. Work needed: Owner confirms the no-grace decision and records it in docs/decisions
- **The notice header is read only by web chat; Chrome blocks chat instead of serving Free; CLI, VS Code, mobile use their own text** Affects: Chrome, CLI, VS Code and mobile users with a lapsed plan. Evidence: apps/web/lib/hooks/useChatStream.ts:563; apps/extension/src/side_panel.ts:13427-13440; apps/cli/src/usage_summary.rs:639-671. Work needed: Use one wording and one behaviour per the owner's decision
- **Mobile in-app purchase, receipt and restore are not switched on (two build switches plus a server switch)** Affects: Mobile users who want to subscribe on the phone. Evidence: apps/mobile/src/features/billing/storePurchases.json:2; apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:53-56. Work needed: Owner switch-on with live store products and a new store build
- **Docs say a downgrade is not a code path, but the code schedules one** Affects: Readers of commercial.md. Evidence: docs/product/commercial.md 'Plan Change...' vs apps/web/app/api/billing/downgrade-preview/route.ts:60-120. Work needed: Update the doc
- **The internal Tauri desktop handles a lower-plan choice through the billing portal, not the scheduled downgrade dialog** Affects: Internal Tauri build. Evidence: apps/desktop/src/features/pricing/PlansModal.tsx:80-98. Work needed: Align or retire
- **Paid upgrades are gated by waitlist and access code, which the brief does not mention** Affects: All new subscribers. Evidence: apps/web/lib/server/billing-waitlist-access.ts:11-55; docs/product/commercial.md line 24. Work needed: Add the gate to the area brief and the user-facing explanation

**Depends on**

- F081-01
- F081-04
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-observability-and-operations
- table:subscriptions
- table:beta_redemptions
- api:POST /api/upgrade
- api:POST /api/upgrade/preview
- api:GET /api/billing/downgrade-preview
- api:POST /api/billing/downgrade-preview
- api:POST /api/checkout

## Unknown

- Production values of checkout, waitlist and store switches
- Contents of the dialog and route tests listed as not read
- What the Android downgrade mode does once store purchase is on
- Audit log retention
- Whether the Electron app adds any plan screen beyond the hosted web pages
