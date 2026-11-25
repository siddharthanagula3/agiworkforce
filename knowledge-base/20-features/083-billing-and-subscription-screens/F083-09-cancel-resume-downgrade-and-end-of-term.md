---
id: "F083-09"
type: "feature"
title: "Cancel, resume, downgrade and end-of-term"
aliases: ["Cancel plan", "Resume plan", "Keep plan", "Switch to a smaller plan", "Downgrade review", "Scheduled cancellation", "End of term", "S83.04", "S83.21", "S83.22", "S83.23", "S83.24", "POST /api/billing/resume-cancellation", "downgrade-preview"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S83.04", "S83.21", "S83.22", "S83.23", "S83.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "mode:cloud", "api:POST /api/billing/resume-cancellation", "api:GET /api/billing/downgrade-preview", "api:POST /api/billing/downgrade-preview", "api:POST /api/portal", "table:subscriptions", "file:apps/web/lib/server/stripe-plan-change.ts", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-09 Cancel, resume, downgrade and end-of-term

A person on a web-billed paid plan can cancel at the end of the period, undo that, or schedule a switch to a smaller plan after reviewing price, usage and limits. Web and Desktop (hosted web app) do all of it. Mobile and VS Code only show the end date; CLI and Chrome show nothing.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.04](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8304), [S83.21](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8321), [S83.22](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8322), [S83.23](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8323), [S83.24](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8324).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Cancel opens the hosted portal's cancel step; the plan ends at period end. Resume calls POST /api/billing/resume-cancellation to keep the plan. 'Switch to a smaller plan' loads a preview from GET /api/billing/downgrade-preview, then POST schedules the switch for the end of the term. Notices explain what the person keeps until then. (apps/web/features/settings/sections/BillingSection.tsx:339-350,895-918; apps/web/app/api/billing/downgrade-preview/route.ts:49-98)

**Why it exists.** People must be able to leave or shrink without contacting support, and must know what happens next (S83.04, S83.21-S83.24).

**Who uses it.** Individual paying subscribers on web billing, on Web and Desktop. Mobile and VS Code users read the end date.

**Problems it solves**

- Surprise loss of access.
- Cannot undo a cancel.
- Cannot move to a smaller plan without losing the account.
- Unclear what is kept after the end.

**Use cases**

- A user clicks 'Cancel plan' and finishes the cancel in the portal; Settings then says the plan ends on a date.
- A user changes their mind and clicks 'Resume <plan>'.
- A user clicks 'Switch to a smaller plan', reads price, usage and limits, and confirms 'Switch on <date>'.
- A VS Code user sees 'Access ends <date>; review or resume the plan on Web'.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Billing: buttons 'Cancel plan', 'Switch to a smaller plan' and the notice buttons 'Resume <plan>' and 'Keep <plan>' (apps/web/features/settings/sections/BillingSection.tsx:895-918; apps/web/features/billing/components/BillingPlanNotices.tsx:196-258).
- Mobile: rows 'Access ends' (reduced screen) or the text 'Access ends <date>. You keep <plan> until then.' (full screen) (apps/mobile/src/features/settings/cloud-billing/index.tsx:370,519).
- VS Code: 'Manage billing & subscription' with the description 'Access ends <date>; review or resume the plan on Web' (apps/extension-vscode/src/core/commandSetup.ts:2418-2420).

**Before you start**

- Cancel and downgrade controls need a web-billed (Stripe) plan (BillingSection.tsx:453,874-918).
- Cancel plan also needs status active or trialing, no scheduled cancel and no scheduled change (BillingSection.tsx:424,903-905).
- Switch to a smaller plan needs a smaller self-serve target and no scheduled change (BillingSection.tsx:462-466,896).

**Screens and controls**

- 'Cancel plan' (red text) opens the portal's cancel step (openPortal('cancel')).
- Notice 'Your <plan> plan ends on <date>.' with 'You keep <plan> features and credits until then. After that, your account moves to Free; your chats, projects and files stay.' and 'Resume <plan>' (BillingPlanNotices.tsx:204-222).
- Trial notice offers 'Continue <plan> after the trial' (BillingPlanNotices.tsx:~165-190).
- 'Switch to a smaller plan' opens the review dialog with Price, Usage and Limits rows, the confirm button 'Switch on <date>' (or 'Switch to <plan>') and a close button 'Keep <plan>' (DowngradeReviewDialog.tsx:156,215,236-237,275-279).
- Scheduled notice 'Your plan switches to <plan> on <date>, at <price> plus tax' with button 'Keep <plan>' (BillingPlanNotices.tsx:225-262).
- For yearly plans a 'Switch to monthly' confirm dialog (BillingSection.tsx:352-376).

**Journey**

1. 1. Open Settings, Billing.
2. 2. Cancel: click 'Cancel plan', finish in the hosted portal, return; the 'ends on' notice shows.
3. 3. Resume: click 'Resume <plan>'; the app calls the server and shows the new state.
4. 4. Downgrade: click 'Switch to a smaller plan', pick a target if more than one, review the rows, click 'Switch on <date>'.
5. 5. Undo a scheduled switch: click 'Keep <plan>'.
6. 6. At the end date the account moves to Free (cancel) or to the smaller plan (switch).

**What the person sees and gets**

- Resume failure: 'Your plan could not be resumed. Nothing was changed.' (BillingSection.tsx:347).
- Downgrade failure: 'The plan change could not be scheduled. Nothing was changed.' (DowngradeReviewDialog.tsx:140).
- Portal cancel unavailable: 'Cancellation is not enabled in the billing portal, so we could not take you straight there. Open Manage billing, or contact support and we will cancel it for you.' (apps/web/app/api/portal/route.ts:416).
- Preview load failure: 'Your plan options could not be loaded.' (DowngradeReviewDialog.tsx:103).

**Settings**

- None found in the code beyond the portal's own configuration, which lives at the payment provider and is not in the repository (doc: docs/product/commercial.md:160-166).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Resume route: needs CSRF, rate limit and an Idempotency-Key; keeps the plan in the provider, updates cancel_at_period_end and canceled_at on the subscriptions row, records an audit event, returns fresh plan state (apps/web/app/api/billing/resume-cancellation/route.ts:25-119).
- Downgrade route: GET returns plan options; POST schedules the switch under an idempotency key, audits it and returns state (apps/web/app/api/billing/downgrade-preview/route.ts:49-125).
- Notices for ending, trial and scheduled change (apps/web/features/billing/components/BillingPlanNotices.tsx:179-262).
- Portal cancel deep link with fallback message (apps/web/app/api/portal/route.ts:397-416).
- Web and Desktop buttons and dialog (BillingSection.tsx:895-918,1345-1352; DowngradeReviewDialog.tsx).
- Scheduled cancellation date on VS Code (apps/extension-vscode/src/features/account-auth/accountPresentation.ts:9-12) and Mobile (apps/mobile/src/features/billing/store.ts:67).

**Incomplete**

- If the schedule was released but the plan not fully resumed, the route tells the user to refresh and try again (resume-cancellation/route.ts:55-73).
- If only the stored flag write fails, it waits for the provider webhook (resume-cancellation/route.ts:86-90).

**Present but disconnected or switched off**

- Mobile full-screen text about changes, 'Changing to <plan> at renewal' and store downgrades is unreachable in the shipped build because native purchases are off (apps/mobile/src/features/billing/storePurchases.json:2; cloud-billing/index.tsx:351,626-637).

**Not available**

- Mobile: no resume and no downgrade review; people go to the store or web (brief S83.04, S83.22; apps/mobile/src/features/settings/cloud-billing/index.tsx:287-337).
- CLI and Chrome: no cancellation display found.
- VS Code: no resume action; only the date and a link to web (commandSetup.ts:2418-2420).
- Team and Enterprise plans: no self-serve downgrade (apps/mobile/__tests__/CloudBillingPage.test.tsx:398 'does not offer Team or Enterprise customers a fake downgrade'; web downgrade ladder is individual plans only, apps/web/app/api/billing/downgrade-preview/route.ts:30-32).

## 4. Required behaviour

**Established requirements**

- Users can cancel their subscription themselves. (source: S83.21)
- A user who scheduled a cancellation can resume before it ends. (source: S83.22)
- A scheduled end-of-period cancellation is shown with its date. (source: S83.23)
- After cancelling the user is told what they keep until the end and what happens after. (source: S83.24)
- Before a downgrade the user reviews price, features, limits and when it applies, and confirms. (source: S83.04)
- Mid-period tier changes do not claw back the already granted allowance; the smaller allowance applies at next renewal. (source: doc: docs/product/commercial.md:160-170)
- Cancellation stays with the channel that sold the subscription. (source: doc: docs/product/commercial.md:98-99)

**Acceptance criteria**

1. Cancel plan appears only for a web-billed active or trialing plan with no pending change.
2. After cancel is scheduled the notice shows the end date and the sentence about moving to Free with chats, projects and files kept.
3. Resume sends POST /api/billing/resume-cancellation with an Idempotency-Key and the notice disappears with fresh state.
4. The downgrade dialog shows price, usage and limits and the date it applies before the confirm button is enabled.
5. Confirming schedules the switch; a failure shows a message that nothing changed.
6. A scheduled switch shows 'Keep <plan>' and clicking it removes the switch.
7. Apple, Google and organization-managed plans show no Cancel or Switch buttons.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Resume while a payment is overdue should not be offered; the code shows the Cancel button only when the status is active or trialing [inferred from BillingSection.tsx:424,903].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give mobile and VS Code a resume action that opens web billing at the right section.
- [proposed] Update docs/product/commercial.md, which says downgrade is not a code path, to describe the scheduled downgrade.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Buttons Cancel plan, Switch to a smaller plan; resumePlan and openPortal functions. |
| component | BillingPlanNotices | `apps/web/features/billing/components/BillingPlanNotices.tsx` | Ending, trial and scheduled-change notices with Resume/Keep buttons. |
| component | DowngradeReviewDialog | `apps/web/features/billing/components/DowngradeReviewDialog.tsx` | Loads the preview, shows Price, Usage and Limits, confirms the switch. |
| endpoint | POST /api/billing/resume-cancellation | `apps/web/app/api/billing/resume-cancellation/route.ts` | Resumes the plan at the provider, updates subscriptions, audits. |
| endpoint | GET and POST /api/billing/downgrade-preview | `apps/web/app/api/billing/downgrade-preview/route.ts` | Plan options and scheduling of the smaller plan. |
| service | stripe-plan-change | `apps/web/lib/server/stripe-plan-change.ts` | readPlanChangeState, scheduleDowngrade and keepCurrentPlan against the provider. |
| service | billing-account client | `apps/web/features/billing/services/billing-account.ts` | fetchPlanChangeState, scheduleDowngrade, keepCurrentPlan call the routes (lines 21,83). |
| endpoint | POST /api/portal | `apps/web/app/api/portal/route.ts` | Portal session; flow 'cancel' deep link; fallback message when cancellation disabled. |
| service | openBillingPortal | `apps/web/features/billing/services/stripe-payments.ts` | Browser hand-off to the portal. |
| table | subscriptions | `apps/web/app/api/billing/resume-cancellation/route.ts` | cancel_at_period_end and canceled_at columns updated on resume. |
| service | subscription-service | `apps/web/lib/services/subscription-service.ts` | Named in the brief for scheduled cancellation state (S83.23); not opened. |
| store | useTierStore | `apps/mobile/src/features/billing/store.ts` | billingCancelsAtPeriodEnd and billingPeriodEnd for the mobile date. |
| screen | Mobile plan screen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | 'Access ends' row and text. |
| service | scheduledCancellationDate | `apps/extension-vscode/src/features/account-auth/accountPresentation.ts` | Formats the VS Code cancel date. |
| service | fetchAccountIdentity parse | `apps/extension-vscode/src/utils/api.ts` | Reads cancel_at_period_end and period end into cancelAtPeriodEnd (line 1307). |
| command | VS Code manage-billing menu item | `apps/extension-vscode/src/core/commandSetup.ts` | Description with end date. |
| config | Idempotency header policy | `apps/web/lib/api-gateway-policy.ts` | IDEMPOTENCY_KEY_HEADER used by resume and downgrade routes. |
| test | resume-cancellation route test | `apps/web/app/api/billing/resume-cancellation/route.test.ts` | Route behaviour. |
| test | downgrade-preview route test | `apps/web/app/api/billing/downgrade-preview/route.test.ts` | Route behaviour. |
| config | Hosted app on Desktop | `apps/desktop/electron/config.ts` | Desktop shows these web screens. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Settings loads plan state (GET /api/billing/downgrade-preview) for a web-billed active or trialing plan. | device and our servers | BillingSection.tsx:457,487-507; billing-account.ts:21 |
| 'Cancel plan' posts to /api/portal with flow cancel; the server creates a portal session with a cancel deep link; the browser opens the hosted portal. | device and our servers | stripe-payments.ts:171-189; apps/web/app/api/portal/route.ts:397-401 |
| The person confirms the cancel in the provider's portal, which sets cancel at period end. | outside service | apps/web/app/api/portal/route.ts:399-401 |
| Resume posts with an Idempotency-Key; the server keeps the plan at the provider, writes cancel_at_period_end to subscriptions, audits and returns plan state. | our servers | apps/web/app/api/billing/resume-cancellation/route.ts:42-119 |
| Downgrade confirm posts the target plan; the server schedules the change at the provider under a user-bound idempotency key and returns state. | our servers | apps/web/app/api/billing/downgrade-preview/route.ts:70-98 |
| The browser adopts the returned state and re-renders the notices. | device | BillingSection.tsx:342,1346-1349 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| cancel_at_period_end, canceled_at, scheduled plan change | table:subscriptions and the payment provider's subscription schedule | Webhook keeps the row in line if the direct write fails (resume-cancellation/route.ts:86-90) | Chats, projects and files stay after the plan ends (BillingPlanNotices.tsx:216); credit retention rules: unknown |
| Audit event plan_changed (resumed, scheduled, schedule_released) | security audit log via recordAuditEvent | Server side | unknown |

**Models and providers.** No model is called. Which models a downgraded account may use follows the new plan after the end date through the model access rules in SYS-model-catalog-and-routing [inferred]. The payment provider is Stripe, not a folder under packages/ai/providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in web account; the resume route uses the user-scoped database (resume-cancellation/route.ts:25). |
| Permissions | Own subscription only; CSRF token and rate limit key 'upgrade' required on writes (resume-cancellation/route.ts:26-29; downgrade-preview/route.ts:72-76). Whether a workspace role is checked: not found for personal billing. |
| Subscription | Needs a Stripe-billed individual plan. Plan ladder for downgrade targets is SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER (downgrade-preview/route.ts:30-32). |
| Limits and metering | Idempotency key required; allowance already granted stays until renewal (doc: docs/product/commercial.md:160-170). |
| Feature flags | Cancel deep link depends on the portal configuration at the provider, outside the repository (portal/route.ts:407-416). |
| Model compatibility | None found in the code. |
| Provider restrictions | Only plans billed by the web payment provider. Apple and Google plans are cancelled in the stores, and organization plans by an administrator (BillingSection.tsx:431-450). |
| Local mode | Local inference needs no plan and is unaffected by cancel or downgrade. These screens need sign-in and cloud account access; Mobile does not read the account unless chat is in Cloud mode (apps/mobile/src/features/billing/store.ts:73). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading plan state | Dialog shows a loading state while the preview loads; plan state errors show with 'Try again'. | DowngradeReviewDialog.tsx:100-110; BillingSection.tsx:853-863 |
| Resume fails | Message says nothing was changed; buttons stay. | BillingSection.tsx:345-349 |
| Schedule released but plan not resumed | 503 with 'refresh to see your current plan, then try again'. | resume-cancellation/route.ts:55-73 |
| Plan resumed but state read fails | Message that the plan was resumed and details could not be loaded. | resume-cancellation/route.ts:109-118 |
| Stale older read arrives after resume | Revision counter keeps the newer state. | BillingSection.tsx:299-302; test BillingSection.test.tsx:356 |
| Portal cancel disabled | Returns error 'cancellation_unavailable' with contact-support text. | portal/route.ts:407-416 |
| Pending change | Cancel and Switch buttons hidden while a scheduled change exists. | BillingSection.tsx:896,903 |
| Offline or timeout | Billing routes have a deadline and circuit name; user-facing offline copy: not handled in the code. | resume-cancellation/route.ts:~120 (deadlineMs, circuit); no offline text found |
| Accessibility | Notices use role=alert only for the destructive tone; buttons get larger targets on touch. | BillingPlanNotices.tsx:41,99 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/billing/resume-cancellation/route.test.ts`: Keeps plan, clears stored cancel and audits (line 93); no session; CSRF; idempotency key required; billing unavailable; no plan to resume; provider refuses; schedule-already-released message; webhook-waits case; state-read failure.
- `apps/web/app/api/billing/downgrade-preview/route.test.ts`: GET plan options; no session; billing unavailable; no web-billed plan; 503 on read failure; POST schedules with bound key and audit; key required; CSRF; refusal relay; failure says nothing changed; audit kept when refresh fails.
- `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx`: Yearly subscriber kept or switched to monthly after confirm (lines 310, 324); resume keeps newer state (356); scheduled cancellation distinct from renewal (624).
- `apps/web/__tests__/api/stripe-downgrade.test.ts`: Downgrade logic; individual cases not read.
- `apps/web/app/api/portal/route.test.ts`: Portal route; individual cases not read.
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: Plan end date kept for a plan set to end (line 183); web-billed plan end date labelled a renewal (192).
- `apps/extension-vscode/src/__tests__/accountPresentation.test.ts`: Account presentation helpers; cancel date cases not confirmed.

**Test scenarios**

- **Cancel at end of period**
  1. Sign in as a web-billed active user.
  2. Click 'Cancel plan', complete the portal cancel, return to Settings, Billing.
  - Expected: Notice 'Your <plan> plan ends on <date>' with the keep-until-then text; Cancel plan button gone; 'Resume <plan>' shown.
- **Resume**
  1. From the previous state click 'Resume <plan>'.
  - Expected: POST /api/billing/resume-cancellation returns state; the notice disappears; subscriptions.cancel_at_period_end is false.
- **Schedule a downgrade**
  1. Click 'Switch to a smaller plan'.
  2. Check Price, Usage, Limits and date.
  3. Click 'Switch on <date>'.
  - Expected: Dialog closes; notice 'Your plan switches to <plan> on <date>' with 'Keep <plan>'.
- **Undo scheduled switch**
  1. Click 'Keep <plan>' in the notice.
  - Expected: The scheduled change is removed and the notice goes.
- **Store-billed plan**
  1. Open Settings, Billing as an Apple-billed user.
  - Expected: 'Manage in the App Store' is shown; no Cancel plan or Switch buttons.
- **Resume failure**
  1. Block the provider call and click Resume.
  - Expected: 'Your plan could not be resumed. Nothing was changed.'

**Where to look when it fails**

- Logs 'Keeping the current plan failed in Stripe', 'Resuming the plan stopped after the schedule release', 'Scheduling a downgrade failed' (route files).
- Audit events of type plan_changed with status resumed, scheduled or schedule_released.
- Table subscriptions columns cancel_at_period_end and canceled_at.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)
- VS Code: [70-qa/test-plans/vscode/083-billing-and-subscription-screens.md](../../70-qa/test-plans/vscode/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **Mobile and VS Code have no resume or downgrade review; they show a date only.** Affects: Mobile, VS Code. Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:519; apps/extension-vscode/src/core/commandSetup.ts:2418-2420. Work needed: Link each to the exact web action, or add native review where store rules allow.
- **Mobile cancel/resume text and rows are not reachable in the shipped build.** Affects: Mobile. Evidence: apps/mobile/src/features/billing/storePurchases.json:2; cloud-billing/index.tsx:351. Work needed: Owner decision on native purchases; until then, the reduced screen shows 'Access ends' only.
- **docs/product/commercial.md says downgrade is not a code path, but the code has a scheduled downgrade.** Affects: Documentation. Evidence: doc: docs/product/commercial.md:160; apps/web/app/api/billing/downgrade-preview/route.ts:70-98. Work needed: Rewrite that paragraph; code wins.
- **Team and Enterprise plans have no self-serve cancel or downgrade review.** Affects: Workspace owners. Evidence: downgrade-preview/route.ts:30-32; mobile test CloudBillingPage.test.tsx:398. Work needed: Decide the intended path (contact sales or portal).
- **CLI and Chrome show no scheduled-cancellation information.** Affects: CLI, Chrome. Evidence: No cancel_at_period_end use found in apps/cli/src/usage_summary.rs or apps/extension/src (search done for cancel text in side_panel only). Work needed: Decide whether they need a one-line notice.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- mode:cloud
- api:POST /api/billing/resume-cancellation
- api:GET /api/billing/downgrade-preview
- api:POST /api/billing/downgrade-preview
- api:POST /api/portal
- table:subscriptions
- file:apps/web/lib/server/stripe-plan-change.ts
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy

## Unknown

- Contents of lib/server/stripe-plan-change.ts and the downgrade price and limit rows were not opened line by line.
- Whether the portal configuration in production allows cancellation: it is outside the repository.
- What happens to unused credits on Free after the end: the notice says credits are kept until then only.
- Whether Team or Enterprise users can cancel through the portal.
- Whether the CLI or Chrome show scheduled cancellation anywhere not searched.
