---
id: "F083-05"
type: "feature"
title: "Trial terms"
aliases: ["Trial terms (S83.08)", "Free trial", "Trialing notice", "Referral trial", "Trial reminder", "Start free trial"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:pro", "api:POST /api/checkout", "api:GET /api/cron/remind-trials", "table:subscriptions", "table:referrals", "file:apps/web/lib/billing/trial-policy.ts", "F083-02", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-05 Trial terms

When a checkout offers a free trial, the hosted page states trial length, end date, the amount charged after, a reminder email and how to cancel. Today no plan in the catalog sets a trial; only a referral can give one, for Premium. Settings, Billing and the mobile plan screen show a Trialing notice with the end date.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.08](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8308).

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

**What it does.** Decides whether a buyer gets a free trial, writes the trial terms on the payment page, emails a reminder before conversion, and shows the trial state afterwards.

**Why it exists.** When a plan starts as a trial the user must see length, end date, what is charged after and how to cancel (S83.08). It protects the buyer from a surprise charge.

**Who uses it.** A new user who signed up through a referral and buys Premium; any buyer on a plan that later gets a catalog trial.

**Problems it solves**

- Surprise charge at trial end.
- Repeat trials for the same customer.
- Trial that would end with no card or no way to remind.

**Use cases**

- A referred friend buys Premium and gets a free trial with the terms on the payment page.
- A trialing user reads 'Your N-day free trial of Premium ends on <date>' in Billing.
- A trialing user cancels and sees that the trial will not turn into a paid plan.

## 2. User experience

**Where to find it**

- Hosted payment page: note above the pay button (apps/web/app/api/checkout/route.ts:73-96,446-457).
- Order screen /upgrade/<plan> when the account has no paid charge to credit: 'Due today', 'From <date>', '<N>-day free trial. Checkout asks for a card.' and button 'Start free trial' (apps/web/features/billing/components/UpgradeOrderPanel.tsx:356-376,582-583).
- Upgrade dialog: description via describeTrial and button 'Start free trial' (UpgradeConfirmDialog.tsx:59-75,421-422).
- Settings, Billing: a notice for status trialing (apps/web/features/billing/components/BillingPlanNotices.tsx:168-201).
- Mobile Subscription screen: row 'Trial ends' with a date (apps/mobile/src/features/settings/cloud-billing/index.tsx:370). The fuller text 'Free trial ends <date>, then renews unless you cancel.' is in the purchase-on branch only (index.tsx:520-523).

**Before you start**

- The server found a trial for this buyer: catalog trial or referral trial, no earlier subscription history, and billing notice email configured (apps/web/lib/billing/trial-policy.ts:13-18,54-85).

**Screens and controls**

- Hosted page note (trialDisclosure text).
- 'Start free trial' buttons.
- Billing notice 'Your N-day free trial of <plan> ends on <date>.' with renewal sentence and cancel in Billing; 'Continue <plan> after the trial' button if cancellation is scheduled (BillingPlanNotices.tsx:168-201).

**Journey**

1. Start checkout for a plan that has a trial for you.
2. Read the note on the payment page: trial days, end date, charge plus tax after, repeat each month or year, reminder email, cancel in Settings, Billing.
3. Enter a card (always required) and start the trial.
4. Two days before the end a reminder email with a one-click cancel link is sent.
5. In Settings, Billing read the Trialing notice; cancel any time.
6. If the trial ends with no card or cancelled, the account moves to Free.

**What the person sees and gets**

- Payment page text: 'Your N-day free trial ends on <date>. On that date your card is charged <price> plus any applicable tax, and again every month/year, unless you cancel before then. 2 days before the trial ends we email you a reminder with a one-click cancel link, and you can also cancel any time in Settings > Billing.' (route.ts:88-91).
- Referral terms link added for referral trials (route.ts:92-94).
- Billing notice when cancelled: 'The trial won't turn into a paid plan. After it ends, your account moves to Free; your chats, projects and files stay.' (BillingPlanNotices.tsx:190-191).

**Settings**

- Trial length per plan in the catalog field trialDays (packages/contracts/types/src/billing-catalog.ts:150,1048-1051), currently set on no plan entry.
- Referral trial days in apps/web/lib/services/referral-program.ts:9.
- Reminder lead time TRIAL_REMINDER_DAYS (apps/web/lib/services/trial-reminder-service.ts:15); cron schedule in apps/web/vercel.json:46.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server decides trial days: catalog trial or the referral trial (Premium only) (apps/web/lib/billing/trial-policy.ts:54-60; apps/web/lib/services/referral-service.ts:223-236).
- A customer with any earlier subscription, store or Stripe, or whose history cannot be read, gets no trial (trial-policy.ts:13-18,30-52).
- A trial is dropped (checkout continues without it) when billing notice email is not configured (trial-policy.ts:75-85).
- Checkout session with trial: payment method always collected, trial_settings end behaviour cancel when no method, session expires after 1 hour, trial terms in custom submit text (trial-policy.ts:20-35; route.ts:64,441-458).
- Reminder cron remind-trials sends reminders, up to 100 per run (apps/web/app/api/cron/remind-trials/route.ts:13-47; vercel.json:46).
- Order panel and dialog show trial terms when the preview says checkout_required with a trial (preview/route.ts:179-212).
- Billing notice handles trialing, scheduled cancel, and manual (organization) cases (BillingPlanNotices.tsx:168-201).
- Mobile shipped branch shows a 'Trial ends' row (cloud-billing/index.tsx:365-372).

**Incomplete**

- No catalog plan currently has trialDays, so only referral trials appear; test 'starts no trial while the catalog sets no trial length' records this (apps/web/app/api/checkout/route.trial.test.ts:131).

**Present but disconnected or switched off**

- Mobile text 'Free trial ends <date>, then renews unless you cancel.' sits in the purchase-on branch, compiled off (cloud-billing/index.tsx:351,520-523).

**Not available**

- Trials started in the mobile store flow in the shipped build.
- Trial wording on CLI, VS Code, Chrome (not found).

## 4. Required behaviour

**Established requirements**

- When a plan starts as a trial, the user sees length, end date, what is charged after and how to cancel. (source: S83.08)
- Server decides trial days (plan trial or referral trial); a customer with earlier history gets none. (source: S83.08 (apps/web/lib/billing/trial-policy.ts:13-18))
- Session expires after 1 hour when a trial is offered; payment method is always collected; no method at trial end cancels the subscription. (source: S83.08 (route.ts:64; trial-policy.ts:20-35))
- The referral program grants friends a trial; referral terms apply. (source: doc: apps/web/lib/services/referral-program.ts:9 (configuration))

**Acceptance criteria**

1. For an eligible referred user buying Premium, the payment page shows the trial note with days, date, price plus tax and the reminder and cancel text.
2. An account that ever had a subscription gets no trial and no trial text.
3. The checkout session requires a payment method for a trial.
4. A trial that ends without a card cancels and the account is Free.
5. Settings, Billing shows the trial end date while status is trialing.
6. After cancelling during the trial, Billing says it will not turn into a paid plan.
7. If billing email is not configured, no trial is offered and checkout still works.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Whether the reminder email actually sends depends on the notice email configuration, which is why the server drops the trial when it is missing [inferred from trial-policy.ts:75-85].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the trial note in the app before leaving for the hosted page in every entry point.
- [proposed] Add an end-to-end test of the reminder cron with a trialing subscription.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Trial policy | `apps/web/lib/billing/trial-policy.ts` | Eligibility, session trial parameters. |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Builds trial terms text and expiry. |
| service | Referral service | `apps/web/lib/services/referral-service.ts` | referralTrialDays for Premium. |
| config | Referral program | `apps/web/lib/services/referral-program.ts` | friendTrialDays value. |
| config | Billing catalog trial days | `packages/contracts/types/src/billing-catalog.ts` | trialDays field and getPlanTrialDays. |
| endpoint | Preview checkout trial | `apps/web/app/api/upgrade/preview/route.ts` | previewCheckoutTrial for the order screen. |
| service | Trial reminder service | `apps/web/lib/services/trial-reminder-service.ts` | Reminder timing and charge text. |
| job | remind-trials cron | `apps/web/app/api/cron/remind-trials/route.ts` | Sends reminders. |
| service | Trial cancel link | `apps/web/lib/services/trial-cancel-link.ts` | One-click cancel link. |
| config | Cron schedule | apps/web/vercel.json (not found) (not found) | Schedules /api/cron/remind-trials. |
| component | BillingPlanNotices | `apps/web/features/billing/components/BillingPlanNotices.tsx` | Trialing notice. |
| component | UpgradeOrderPanel | `apps/web/features/billing/components/UpgradeOrderPanel.tsx` | Trial order wording and button. |
| component | UpgradeConfirmDialog | `apps/web/features/billing/components/UpgradeConfirmDialog.tsx` | describeTrial and button. |
| screen | Mobile subscription screen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Trial ends row. |
| test | Trial checkout test | `apps/web/app/api/checkout/route.trial.test.ts` | Trial rules in checkout. |
| test | Trial policy test | `apps/web/lib/billing/trial-policy.test.ts` | Eligibility. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Checkout asks for trial days: catalog plan trial or referral trial for the user. | our servers | apps/web/app/api/checkout/route.ts:431-438; trial-policy.ts:54-60 |
| Server checks Stripe for earlier subscriptions of the customer. | outside service | apps/web/lib/billing/trial-policy.ts:37-52 |
| Session gets trial period, forced card collection, 1 hour expiry and the disclosure text. | our servers | route.ts:439-458,494-524 |
| Buyer reads the note and starts the trial on the hosted page. | outside service | route.ts:446-457 |
| A scheduled job finds converting trials and emails a reminder with a cancel link. | our servers | apps/web/app/api/cron/remind-trials/route.ts:24-47 |
| Settings, Billing reads the plan state (trial start and end) and shows the notice. | device and our servers | apps/web/features/billing/components/BillingPlanNotices.tsx:66-70,168-201 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Trial dates and status | Stripe subscription; status in table subscriptions | Read by apps through the account API | Per SYS-subscriptions-entitlements-and-usage |
| Referral row status signed_up | table referrals | Server only | Owned by the referral service |
| Reminder send record | unknown (reminder service not fully read) | unknown | unknown |

**Models and providers.** No AI model is involved. The payment provider (Stripe) runs the trial and the card collection.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; trial eligibility is per account and per payment customer. |
| Permissions | None found beyond sign-in. |
| Subscription | Trial is for a first paid subscription only; earlier store or Stripe subscription means no trial (trial-policy.ts:13-18). |
| Limits and metering | Reminder cron sends at most 100 per run (remind-trials/route.ts:13). Trial usage allowance during a trial: see SYS-subscriptions-entitlements-and-usage (not read). |
| Feature flags | Billing notice email configuration (isBillingNoticeEmailConfigured) gates trials; CRON secret verifies the cron (remind-trials/route.ts:17). |
| Model compatibility | None found in the code. |
| Provider restrictions | Stripe subscriptions only; store trials follow store rules, not read. |
| Local mode | Not applicable: Local and own-key need no trial. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Trial history unreadable | Checkout continues with no trial; warning logged. | trial-policy.ts:47-52 |
| Email not configured | No trial; error logged. | trial-policy.ts:75-85 |
| Session expires | Trial sessions last 1 hour. | route.ts:64,445 |
| Trial cancelled | Notice says it won't convert; account moves to Free after end. | BillingPlanNotices.tsx:188-192 |
| Organization-granted trial | Notice says it moves to Free and offers the plans page. | BillingPlanNotices.tsx:183-187 |
| Stripe not configured for cron | Returns reminded 0 with a reason. | remind-trials/route.ts:25-29 |
| Mobile | Shows 'Trial ends' with date in shipped build; no purchase of trials. | cloud-billing/index.tsx:365-372 |
| Accessibility | not handled in the code beyond normal text; the notice is plain paragraphs. | BillingPlanNotices.tsx:168-201 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/checkout/route.trial.test.ts`: No trial when the catalog sets none, catalog trial without card cancels, no second trial, history unreadable.
- `apps/web/lib/billing/trial-policy.test.ts`: Eligibility rules.
- `apps/web/app/api/cron/remind-trials/route.test.ts`: Reminder cron.
- `apps/web/features/billing/components/UpgradeOrderPanel.test.tsx`: Order panel states.
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: Mobile end-date wording without purchases.

**Test scenarios**

- **Referral trial note**
  1. Sign up through a referral link.
  2. Start Premium checkout.
  - Expected: Hosted page shows the trial note with days, end date, price plus tax, reminder and cancel text; card is required.
- **No second trial**
  1. Use an account that already had a subscription.
  2. Start checkout.
  - Expected: No trial note, normal first charge.
- **Cancel during trial**
  1. Open Settings, Billing while trialing.
  2. Click 'Cancel plan' and finish in the portal.
  - Expected: Notice says the trial won't turn into a paid plan; account moves to Free at the end.
- **Reminder**
  1. Run the cron with a trial ending in 2 days (test).
  - Expected: One reminder email with a cancel link.

**Where to look when it fails**

- Logs 'Trial eligibility could not be verified; checkout continues without a trial' and 'Billing notice email is not configured, so a trial could not be reminded' (trial-policy.ts:47,76).
- Cron summary logs 'Trial reminders completed' or 'failed' (remind-trials/route.ts:35-44).
- Table referrals and subscriptions.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **No catalog plan sets trialDays, so plan trials never appear; only referral trials for Premium.** Affects: Web, Desktop. Evidence: packages/contracts/types/src/billing-catalog.ts:150,1048 (type and reader only); apps/web/app/api/checkout/route.trial.test.ts:131. Work needed: Owner decision whether any plan should offer a trial.
- **The draft listed 'Free trial ends..., then renews unless you cancel' for mobile as live; it is compiled off.** Affects: Mobile. Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:351,520-523. Work needed: Correct the brief.
- **The reminder cron has no record of a live run.** Affects: Web. Evidence: No record found. Work needed: Run once in test mode and record.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:pro
- api:POST /api/checkout
- api:GET /api/cron/remind-trials
- table:subscriptions
- table:referrals
- file:apps/web/lib/billing/trial-policy.ts
- F083-02
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations

## Unknown

- Allowance and limits during a trial (not read).
- Where reminder sends are recorded, and the email text.
- Whether the cron runs in production on the schedule in vercel.json.
- Whether any plan will get a catalog trial.
- Trial wording on VS Code and Chrome (not found).
