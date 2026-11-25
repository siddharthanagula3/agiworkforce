---
id: "DOC-70-qa-defects-root-causes-manual-plan-period"
type: "root-cause"
title: "MANUAL-PLAN-PERIOD: a hand-granted plan stops working when its period date passes"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# MANUAL-PLAN-PERIOD: a hand-granted plan stops working when its period date passes

Read-only design. Code traced in `~/.cache/agi-audit/worktrees/gap-read-main` (origin/main). Paths below are under `apps/web` unless they start with `docs/`. Nothing was run.

## 1. What the person sees today / what they should see

Today (testers s3, W-12, W-13, W-14, W-19; seeded Basic and Premium accounts):
- Every chat turn fails with a red reply: "Your plan's billing period ended on Nov 19, 2026 and has not renewed yet, so there are no credits to use. If you just renewed, try again in a few minutes; otherwise check Settings > Billing." Only Retry.
- Settings > Billing says Premium, Active, "set up for your account by AGI Workforce", no period, no renew action.
- Settings > Usage says "No usage yet. Your full limits are available.", 0% bars, while chat is refused.

They should see:
- A granted plan works every month, like a plan that renews. Chat answers with first words in seconds; Usage shows a real "resets on" date next month and a fresh allowance each month; it survives reload.
- Billing keeps its "set up for your account" text. Nothing asks them to renew a plan that cannot be renewed.
- If a plan really has ended (a grant set to end, or a Stripe/store plan whose renewal has not arrived), Usage says so in plain words (it is meant to; a bug hides it, see cause 3) and chat says the same.

## 2. Causes

1. **Granted plan's period date is enforced by chat but never advanced. Product defect (design gap), triggered by a test-setup limit.**
   - Chat gate: `app/api/llm/v1/chat/completions/lib/request-processor.ts:3046-3056` (`billingPeriodLapsed`), called at `:6016` after allocation at `:5967-6004`. It refuses when the balance has no `account_id` and `current_period_end <= now`.
   - Nothing rolls a manual row's period. Only Stripe webhook and mobile IAP services do (`app/api/stripe-webhook/lib/db.ts:889,1211,1224,1439`, `lib/services/mobile-iap-ledger-service.ts:653`, `mobile-iap-notification-service.ts:581`). The nightly cron `app/api/cron/reset-credits/route.ts:73-83` re-allocates with the row's own old dates, which makes an account for the already-ended period; `get_credit_balance_microusd` returns only accounts with `period_end > now()` (`db/neon/0182_managed_usage_microusd_ledger.sql:426-431`), so the balance stays empty.
   - Server log lines 1702-1704 and 3031: "No credit account found, allocating" then "Credits allocated successfully" on every request for the Basic user, and 10 `402` lines on `POST /api/llm/v1/chat/completions` (first at time 1795549623934, as the skeptic found; my earlier-diagnosis claim of "no 402 lines" was wrong).
   - The test cause: `scripts/dev-accounts/provision.ts:126-134,164` gives a one-month period from seed day, so the Basic account's period ended Nov 19. Production would hit it for any granted row with an end date in the past.
   - The code already says the intended behaviour: `features/billing/lib/subscription-owner-presentation.ts:32-35` ("a period end that nothing enforces") and `:44-48` (manual plans show no renewal or end date). The gate contradicts it. Apple/Google rows are different on purpose: `lib/server/subscription-billing-owner.ts:83-107` turns a lapsed store plan into `expired`; manual rows are skipped there (`:99`), so they stay entitled everywhere except chat.

2. **The advised production grant ("give the row no end date") would not work either. Product defect (found while checking the skeptic's open question).**
   - `SubscriptionService.getSubscription` builds `new Date(data.current_period_start)` and `new Date(data.current_period_end)` (`lib/services/subscription-service.ts:136-137`). The columns are nullable (`db/neon/0003_subscriptions.sql:14-15`). `new Date(null)` is 1970-01-01, a finite date, so a null end reads as "ended in 1970": `billingPeriodLapsed` returns true (`request-processor.ts:3052-3055` only skips `!end` on the raw value, but the value it receives is already a `Date`). With both dates null, `resolveManagedUsagePeriod` throws "Invalid managed usage subscription period" (`lib/server/managed-usage-period.ts:37-44`, end not after start), and the chat path swallows that (`request-processor.ts:5999-6004`). The cron does the same per row (`route.ts:73-83`, counted as errors). The same `new Date(row.current_period_end)` is in `lib/services/entitlement-resolution.ts:156-157` for seat rows.
   - Not run; this is from reading the code. Mark it unverified until the test in section 4 runs.
   - The runbook (`docs/runbooks/mobile-store-first-release.md:1733-1750`) says "give the row no end date" and "How the server treats a granted plan whose period end has passed is unverified." Both statements are now answered.

3. **Usage says "No usage yet. Your full limits are available." while chat is refused. Product defect.**
   - `normalizeBalance` turns the all-null zero row into `period_end: ''` (`lib/services/credit-service.ts:145-147`). `lib/services/managed-usage-summary-service.ts:89` uses `balance?.period_end ?? subscription?.current_period_end`; `''` is not nullish, so the plan's real end never reaches the page. `toIsoTimestamp('')` returns `''` (`lib/server/iso-timestamps.ts:12-14`). `features/settings/sections/UsageSection.tsx:1211-1214` needs `Boolean(usage.period_end)` to call the period lapsed, so the lapse text (`:300`, `:1394-1395`) never shows and the "none" status line shows instead. (Skeptic corrected my line: `:89`, not `:76`.)
   - With cause 1 fixed this stops affecting granted plans, but the same bug hides a real lapse on a Stripe or store plan whose webhook is late. Fix it too.

4. **Billing shows Active, no period, no renew action. No change needed (by design).** A granted plan has nothing to renew; the sentence and "Contact support" are intended (`subscription-owner-presentation.ts:11-13,58-62`). Once cause 1 is fixed the error that sends the person to "check Settings > Billing" no longer fires for these plans. A true lapse on a Stripe plan still points to Billing, where Manage billing exists.

5. **Chat error shown as red "Error:" with only Retry.** Web has no special handling for `billing_period_not_renewed` (only `apps/mobile/services/apiErrors.ts` knows it). After the fix it fires only for a real lapse. I did not trace the web error renderer; left as is and listed as unverified. Not a test-machine limit.

Test-machine limits: only the one-month seed (cause 1). No provider or model limit.

## 3. Change

One owner for "what period is a granted plan in": `lib/server/managed-usage-period.ts` (it already owns period maths). One place that builds the subscription object: `SubscriptionService.getSubscription`. Everything downstream (chat gate, allocation, usage summary, entitlement) then sees a live period with no new write path and no stored-data change. Chosen over "write a new period into the row at lapse" because a read-time rule needs no migration, no job and no extra writes on the hot path, and stays correct if the cron is late. No refactor needed.

### `lib/server/managed-usage-period.ts`
Export `addCalendarMonths` use internally and add:
```ts
export function resolveGrantedPlanPeriod(input: {
  periodStart: Date | null;
  referenceAt?: Date;
}): ManagedUsagePeriod {
  const reference = input.referenceAt ?? new Date();
  const anchor =
    input.periodStart && Number.isFinite(input.periodStart.getTime())
      ? input.periodStart
      : new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  let offset = Math.max(
    0,
    (reference.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      reference.getUTCMonth() - anchor.getUTCMonth(),
  );
  if (offset > 0 && addCalendarMonths(anchor, offset).getTime() > reference.getTime()) offset -= 1;
  return {
    periodStart: addCalendarMonths(anchor, offset),
    periodEnd: addCalendarMonths(anchor, offset + 1),
  };
}
```
Why: monthly windows anchored on the grant day, stable between requests (same dates produce the same credit account via `get_or_create_credit_account_microusd`, so usage resets monthly and does not duplicate). Anchoring on the start date clamps month ends the same way the existing code does.

### `lib/services/subscription-service.ts`
- Add `stripe_customer_id, cancel_at_period_end` is already selected; add `stripe_customer_id` to the select at `:123-128` (needed by `resolveSubscriptionBillingSource`, `subscription-billing-owner.ts:62-66`).
- Add one static `SubscriptionService.resolvePeriod(row, now = new Date())` returning `{ start: Date; end: Date }`:
```ts
const rawStatus = row.status?.trim().toLowerCase();
const rolls =
  resolveSubscriptionBillingSource(row) === 'manual' &&
  rawStatus === 'active' &&
  row.cancel_at_period_end !== true &&
  !isContractPricedPlan(normalizeBillingPlanTier(row.plan_tier));
if (rolls) {
  const period = resolveGrantedPlanPeriod({
    periodStart: row.current_period_start ? new Date(row.current_period_start) : null,
    referenceAt: now,
  });
  return { start: period.periodStart, end: period.periodEnd };
}
return { start: new Date(row.current_period_start), end: new Date(row.current_period_end) };
```
and use it in `getSubscription` (`:136-137`). Fail closed: a granted plan that is canceled, set to end (`cancel_at_period_end`), contract-priced, or not `active` keeps its real end date and still lapses. Stripe, Apple and Google rows are untouched (their behaviour for null dates is left as is; out of scope).

### `app/api/cron/reset-credits/route.ts`
Add `stripe_subscription_id, apple_original_transaction_id, google_purchase_token, stripe_customer_id, cancel_at_period_end` to `PAGE_SQL` and `SubRow`, and replace the two `new Date(subscription.current_period_*)` uses (the allocation call and `provisionSeatMemberCreditAccounts`) with `SubscriptionService.resolvePeriod(subscription)`. Why: otherwise the nightly job allocates the stale ended period for granted plans, or errors every night on a null end. The keyset `(current_period_start, id)` still reads the raw column; a null start sorts unpredictably, so the runbook below asks for a start date (null start behaviour in the cron paging is unverified).

### `lib/services/entitlement-resolution.ts`
Optional, same helper at `:156-157` for seat rows. Seat rows come from an organization owner's row; I recommend leaving as is (team plans are not hand-granted personal plans, and `isContractPricedPlan` rows must keep their end date). No change.

### `lib/services/managed-usage-summary-service.ts:88-89`
```ts
const periodStart = balance?.account_id ? balance.period_start : (subscription?.current_period_start ?? null);
const periodEnd = balance?.account_id ? balance.period_end : (subscription?.current_period_end ?? null);
```
Why: an empty balance row must fall back to the subscription's dates so a real lapse shows its true text. Applies to every app that reads `/api/usage` (web, mobile, desktop, extension) without a client change.

### `docs/runbooks/mobile-store-first-release.md:1733-1750`
Replace "give the row no end date ... unverified" with: a granted plan is `status active`, `cancel_at_period_end` false, no store or Stripe ids, `current_period_start` set to the grant time, end date any value or null; the server then gives it a fresh monthly allowance forever, and to end a grant set `status` to `canceled` or set `cancel_at_period_end` with an end date. State this in the runbook only after the section 5 check passes.

### `scripts/dev-accounts/provision.ts:126-134`
No change. The seeded one-month end now proves the fix. For the lapse case use a row with a fake Stripe subscription id (section 5).

No client change in `packages/ui`, desktop, Chrome or VS Code: they read the same server data.

## 4. Regression check

This touches entitlement and stored credit periods, so add tests (existing homes: `lib/server/managed-usage-period.test.ts`, `lib/services/subscription-service.usage-period.test.ts`, the summary service tests, `request-processor.billing-period.test.ts`):
- `resolveGrantedPlanPeriod`: start 2026-10-19, reference 2026-11-24 gives 2026-11-19 to 2026-12-19; reference before the start gives the first month; start on the 31st clamps; null start gives the UTC calendar month; same reference gives the same dates twice.
- `getSubscription`: manual active row with end in the past returns a future end; manual with `cancel_at_period_end` and a past end keeps it; Stripe id row with a past end keeps it; null start and end on a manual row returns finite dates and `resolveManagedUsagePeriod` accepts them.
- Summary: an empty balance row plus a past subscription end gives `period_end` set and `usage_allocation: 'pending'`, so the page shows the lapse text.
- Keep the existing `billingPeriodLapsed` tests unchanged.

## 5. Person-style check

Rebuilt local compiled app, local DB, seeded accounts (Basic whose period ended Nov 19, Premium).
1. Sign in as the Basic account, open a new chat, type "Say hello in five words" and Enter. Must stream within seconds and finish; no red text. Reload: the reply is still there.
2. Settings > Usage: no lapse text; "This billing period" bar 0% to a small value after the turn; reset date shows 19 Dec 2026 (not Nov 19). Sidebar meter moves slightly. Repeat on Premium.
3. Settings > Billing: still "set up for your account by AGI Workforce. Contact support to change it.", no renew button.
4. Run the same chat a second time; the server log must show no new "No credit account found" line.
5. Null-date case: with the local DB, set the Premium account's `current_period_start` and `current_period_end` to null; chat must still work (answers cause 2).
6. Denied case: set the Basic account's `stripe_subscription_id` to `sub_test_lapsed` with the end date Nov 19. Chat must show the "billing period ended on Nov 19, 2026 and has not renewed" message in plain words, and Usage must now show the same lapse text, not "No usage yet". Also set a manual row to `cancel_at_period_end = true` with a past end: chat refuses the same way.
7. Restore the rows afterwards.

## 6. Compatibility and rollback

- No migration, no stored-data change; the row keeps its old dates. Credit accounts for new months are created lazily as today.
- Stripe, Apple, Google rows behave exactly as before. Free plans do not roll (`resolveSubscriptionBillingSource` returns `none` for free).
- Money effect: a granted plan now yields one allowance per month indefinitely. That is the intended grant. A grant meant to end must be set canceled or ending.
- Rollback: revert the commit; behaviour returns to refusing past-end granted plans. Accounts already created for later months are valid ledger accounts and harmless.
- Mobile reads the same `/api/usage`; no contract change.

## 7. Owner

Owner decision needed: confirm that a hand-granted plan never expires by date (recommended). Facts: the code comment at `subscription-owner-presentation.ts:32-35` and Apple's "must not expire" for the review account both point that way; only chat disagrees. The alternative (granted plans expire like store plans) would need a renewal path, a visible end date on Billing and a support action, none of which exist. Also, after merge, the owner runs the production statement for the review account; I did not and must not run it. Recommend `current_period_start = now()`, `current_period_end` null or one year out, no ids.

## 8. Overlap

- web-lane worktree edits none of the files above. Its only change to `request-processor.ts` is one line adding `organizationId` to the project-context call near `:3858`; I do not touch that file.
- The other agent's checkout shows no diff or unpushed commits on `subscription-service.ts`, `managed-usage-period.ts`, `managed-usage-summary-service.ts`, `reset-credits/route.ts`, `entitlement-resolution.ts`, `subscription-billing-owner.ts`, `UsageSection.tsx` or the runbook (checked with git diff and log, 0 each). Still re-check `docs/runbooks/mobile-store-first-release.md` before editing, since that agent works on the mobile release.
- Other design files that may share `managed-usage-summary-service.ts` or `UsageSection.tsx` should be applied after this one; the edits are two lines in each.
