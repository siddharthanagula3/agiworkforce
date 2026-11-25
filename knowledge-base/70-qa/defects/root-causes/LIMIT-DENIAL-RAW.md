---
id: "DOC-70-qa-defects-root-causes-limit-denial-raw"
type: "root-cause"
title: "LIMIT-DENIAL-RAW: limit and lapsed-plan refusals show as raw errors or a false banner"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# LIMIT-DENIAL-RAW: limit and lapsed-plan refusals show as raw errors or a false banner

Paths are relative to ~/.cache/agi-audit/worktrees/gap-read-main (origin/main) unless noted. Read only; nothing was run.

## 1. What the person sees today / what they should see

Today
- Paid account whose plan period ended (W-19, Premium test account): the turn shows "Response failed", then "Error: Your plan's billing period ended on Nov 19, 2026 and has not renewed yet, so there are no credits to use. If you just renewed, try again in a few minutes; otherwise check Settings > Billing." and "Try again, or start a new chat if this response is stuck." The same sentence repeats in a red banner with Retry. No Upgrade, Manage billing or support link. Usage says "No usage yet. Your full limits are available." Billing says Active with no dates.
- Free account (W-2, W-5): right after pressing Stop, a banner "You've reached the Free limit for now / Resets in 4 hr 59 min / Upgrade" appears above the composer, its bottom edge looks hidden behind the composer. The next message works and reload removes the banner.

Should see
- Lapsed plan: a recovery card, not an error turn. One sentence that says the plan period ended and was not renewed, and one button that goes somewhere useful: "Manage billing" for a plan billed through Stripe, "Contact support" for a plan with no Stripe subscription (comped or admin-set), because Settings > Billing offers no renewal path there. No "Error:" prefix, no "start a new chat" line, no second red banner with Retry (resending into the same refusal cannot work). The refusal survives reload like the other plan-limit cards.
- Free after Stop: no banner at all. A Free person who still has allowance must never be told they hit the limit. A banner appears only when settled usage really is at the limit, and then it shows the reset and Upgrade, fully visible above the composer.

## 2. Causes

1. Lapsed refusal rendered raw. Product defect.
   - The server refuses with code `billing_period_not_renewed` (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3043, built at 3058-3075, returned at 6016-6017).
   - The client only builds a card when `classifyManagedQuotaErrorCode` knows the code. The map `MANAGED_QUOTA_BLOCKS` (packages/contracts/types/src/billing-catalog.ts:884-992, lookup at 991-995) does not list it, and the free-slot resolvers do not claim it, so `resolveQuotaPaywallSlot` returns null (apps/web/features/chat/lib/quotaPaywallSlot.ts:76-77).
   - `useChatStream.ts:6239-6270` skips the paywall branch. The generic branch (6316-6322) calls `buildAssistantErrorContent` (685-690), which adds "Error: " and the "start a new chat" line, and sets the red banner with Retry.
   - Skeptic correction, confirmed: the server does call `quotaRecoveryFor(error.code, subscription)` at request-processor.ts:3074, but `resolveManagedQuotaRecovery` (apps/web/lib/services/managed-usage-request-service.ts:86-92) returns null for an unknown code (`classifyManagedQuotaErrorCode` is null). So today the refusal carries NO recovery. A catalog entry alone fixes both sides: the server then returns a recovery, and the client builds a slot.
   - Mobile already lists the code (apps/mobile/services/apiErrors.ts:108), so web is the gap.
   - Not only a test artifact: a comped or admin-set plan whose period ends is not renewed by a Stripe webhook, and a delayed or failed renewal also lapses. It is rare in production; the test data (period ended Nov 19, machine on Nov 24) made it look common. The seeded state is a test-machine limit; the raw rendering is a product defect.
2. Usage page says full limits available while sends are refused. Product defect (small).
   - `allocateCreditsForPeriod` makes an account for the ended period, `get_credit_balance_microusd` only returns accounts with `period_end > now()` (apps/web/db/neon/0182_managed_usage_microusd_ledger.sql:429), so the re-read at request-processor.ts:5996 still has no account and `billingPeriodLapsed` (3046-3056) stays true. server.log lines 1702-1706 show the allocation then the 402. The Usage summary comes from the plan allowance, so it reads 0 of 50.
   - The line at server.log:1707 ("Usage budget exhausted for this billing period") is the conversation-title call (managed-usage-request-service.ts:426), not the chat turn.
   - Scope for this change: the refusal card tells the truth; the Usage and Billing page wording for a lapsed period is a separate surface and is listed for the owner below, not fixed here.
3. Test account was lapsed instead of "five-hour window 95% used". Test-machine limit. The real five-hour refusal and its card were never exercised in this run.
4. Free banner after Stop. Product defect, cause inferred and not yet reproduced.
   - A Free turn with no estimate reserves the whole remaining window (apps/web/lib/services/free-trial-service.ts:661-690). The snapshot counts `coalesce(actual_cost_microusd, reserved_microusd)` (free-trial-service.ts:150-153), so an unsettled turn reads as all used.
   - The same snapshot feeds both enforcement and the public display: `getFreeTrialPublicUsage` (521-557) reads `readFreeUsageSnapshot`.
   - The client refetches the instant `isStreaming` turns false (WebChatPage.tsx:2297-2303). On Stop that happens before the server settles the cancelled turn (stream-transform.ts:728-750). `selectUsageWarning` maps 0% remaining on Free to "You've reached the Free limit for now" (packages/contracts/types/src/usage-vocabulary.ts:188-222). The poll is 300 s, so it stays until reload.
   - Log: for user_3KuZVYSjnsiU43riHZbfdpa0VZb, `sse_stream_disconnected` at time 1795549646671 (server.log:1905) and GET /api/usage at 1795549646733 (server.log:2040), 62 ms later, with no settlement line between them.
   - The same display reading would also flash the banner while a turn is still running in another tab.
5. Banner clipped behind the composer. Product defect, not established. `UsageWarningBanner` is a tab (`rounded-t-xl border-x border-t`, packages/ui/unified-chat/src/components/UsageWarningBanner.tsx:30-37) meant to sit on the composer's top edge, in a stack above it (WebChatPage.tsx:7779-7790). The screenshot shows the composer's focus ring over its bottom edge. Because the banner is false in this state, fixing cause 4 removes the symptom for Free after Stop; the real-limit case must be checked by eye (section 5).
6. Provider or model limits. None. Both refusals are decided before any provider call.

## 3. Change

### 3.1 packages/contracts/types/src/billing-catalog.ts (shared by web, mobile, desktop, extension)
Add one entry to `MANAGED_QUOTA_BLOCKS` and move the code string here.
```ts
export const BILLING_PERIOD_NOT_RENEWED_CODE = 'billing_period_not_renewed';
// in MANAGED_QUOTA_BLOCKS:
[BILLING_PERIOD_NOT_RENEWED_CODE]: {
  kind: 'billing_period',
  feature: 'token_cap',
  showUpgradeCta: true,
  showResetTime: false,
  suggestStandardModel: false,
  clearedByCredits: false,
  reason: "Your plan's billing period has ended and has not renewed yet.",
},
```
Why `token_cap`: it is account-wide (`ACCOUNT_WIDE_USAGE_FEATURES`, work-usage.ts:11-14), so `isAccountWideUsageBlock` (apps/web/features/chat/stores/account-usage-block.ts:17) raises it to the composer and useChatStream deletes the empty reply and skips the red banner (useChatStream.ts:6262-6320).
Why `showUpgradeCta: true` (changed after review): in this code base `showUpgradeCta` is what keeps the button alive. WebChatPage.tsx:1823 drops `actionLabel` and `onRecover` when it is false, and quotaPaywallSlot copies it into the slot. The button here is not an upgrade, but the flag is the existing "this block offers one button" switch, so the lapsed block sets it true and the resolver does not let the `nextTier` test turn it off (3.3). `showResetTime: false` (no reset time) and `clearedByCredits: false` (no top-up) stay.
Contracts tests (also pins the other hosts, 3.6): `classifyManagedQuotaErrorCode(BILLING_PERIOD_NOT_RENEWED_CODE)` is non-null, account-wide, `kind` `billing_period`.

### 3.2 apps/web/lib/services/managed-usage-request-service.ts (server recovery)
`ManagedQuotaRecovery.action` already includes `contact_support` (managed-usage-request-service.ts:82). Add `'manage_billing'` and answer the lapsed code first in `resolveManagedQuotaRecovery` (lines 86-92 today return null for an unknown code):
```ts
if (input.code?.trim().toLowerCase() === BILLING_PERIOD_NOT_RENEWED_CODE) {
  return input.billedByStripe
    ? { action: 'manage_billing', href: TOP_UP_HREF }
    : { action: 'contact_support', href: BLOCK_APPEAL_PATH };
}
```
Import `BILLING_PERIOD_NOT_RENEWED_CODE` from contracts in request-processor.ts (it is exported from line 3043 today and imported by request-processor.billing-period.test.ts:6; keep a re-export or update that import). `TOP_UP_HREF` is `/settings/billing`; for a Stripe plan that is the payment-method path. `contact_support` goes to `BLOCK_APPEAL_PATH` = `/support` (apps/web/lib/security-audit.ts:147).

### 3.3 Web recovery path, every site (added after review)
`contact_support` is a new renderable action in the web client. One shared type, every site named:
1. apps/web/features/chat/types/message-metadata.ts:128: define and export `PaywallRecoveryAction = 'upgrade' | 'subscribe' | 'manage_billing' | 'view_usage' | 'top_up' | 'contact_support'` and use it for `PaywallSlot.recoveryAction`.
2. apps/web/features/chat/components/InlinePaywallCard.tsx:52-53: delete the local union and import the shared type (keep the `PaywallRecoveryAction` export as a re-export if other files import it from here).
3. apps/web/features/chat/components/messages/MessageBubble.tsx:656: replace the inline union with the shared type.
4. apps/web/lib/hooks/useMediaGeneration.ts:125-126: make `MediaPaywallRecoveryAction` an alias of the shared type. `mediaPaywallRecoveryAction` (line ~208) returns `view_usage` for any classified code; add a first branch so the lapsed code returns `manage_billing` (the media call has no server recovery to read; a person on a comped plan then lands on Settings > Billing, which is the best the media path can name, and the chat path covers the rest).
5. apps/web/features/chat/lib/mediaPaywallRecovery.ts: `MediaPaywallRecoveryHandlers` (lines 32-35) gains `openSupport: () => void`. `runMediaPaywallRecovery` (lines 201-222) gets `if (recoveryAction === 'contact_support') { handlers.openSupport(); return; }` before the tier fallthrough. `resolveMediaPaywallSlot` (lines 168-180) gets an early branch for the lapsed code (recovery `manage_billing`, `showUpgradeCta: true`), so the media card is not built as "view usage".
6. apps/web/features/chat/pages/WebChatPage.tsx:1787 (`handlePaywallRecovery`) and :1828 (composer notice): pass `openSupport` (navigate to `/support` the way other in-app links navigate; read the file for the router helper before writing).
7. apps/web/features/chat/components/InlinePaywallCard.tsx: `paywallRecoveryLabel` (182-189) gets `'Contact support'`; the headline chain (~400-410) gets a `contact_support` branch ("Contact support to continue") so it does not fall to the "Upgrade to ..." text; the TierBadge test (~441-446) also excludes `contact_support`; `sellsPlan` already excludes it.
8. apps/web/features/chat/lib/quotaPaywallSlot.ts: `SERVER_RECOVERY_ACTIONS` (18-22) gains `manage_billing` and `contact_support`. Add a lapsed branch before the generic return: for the lapsed code take the server's `manage_billing` or `contact_support`, default to `manage_billing` when the server sent none, and set `showUpgradeCta: true` without the `nextTier !== null` test (that test would turn it off for a top-tier plan). Result for the owner's W-19 case: `recoveryAction: 'contact_support'`, `showUpgradeCta: true`.
9. apps/web/features/chat/pages/WebChatPage.tsx:2175-2196 (model switch override): today only `manage_billing` skips `pickFreePoolModel`, so a `contact_support` block would get "Use <model>" replacing the button (lines 2183-2196). A lapsed refusal comes before any model choice (request-processor.ts:3043-3075, check at ~5996), so no model works. Key it on the block, not one action string: add `blockRefusesEveryModel(slot)` next to `isAccountWideUsageBlock` in account-usage-block.ts (true for `manage_billing` and `contact_support`) and use it at 2177. `view_usage` is left as today: it is the five-hour and weekly window block, where a Free-pool model is a real way out.
10. Composer notice tests (WebChatPage composer test or the composer's own test): for a lapsed slot with `contact_support`, the notice shows the label "Contact support" and clicking it calls `openSupport`; with `manage_billing`, "Manage billing" opens Settings > Billing; neither shows "Use <model>". `runMediaPaywallRecovery` test for `contact_support`. InlinePaywallCard test for both labels and headlines.

No change to useChatStream.ts. Once the slot is non-null the paywall branch (6239-6320) runs. If the assistant already streamed text the card is saved inline (6262-6270 else branch); that is the card in item 7. Reload: account-wide blocks live in the composer store, not in messages (only `paywall.freeLimit` turns are saved, 6279-6300), so the notice returns on the next refused send, like the five-hour block today. Check this by eye (section 5).
Work-usage: `resolveWorkUsageRecovery` (work-usage.ts:22-33) would return `upgrade` or `wait` for the new block. Add an early return so the Work surfaces do not offer Upgrade: return null for the lapsed code (no Work recovery card; the chat notice carries it).

### 3.4 apps/web/lib/services/free-trial-service.ts (false Free banner): HOLD until reproduced
Do not ship this part until the banner is reproduced (section 5 step 4 on the compiled build, with the Free account, and the `/api/usage` response read in the network panel right after Stop). The cause above is inferred: the 62 ms gap (server.log:1905 vs 2040) shows the poll ran before settlement, but nothing in the log shows a whole-window hold was in place. A reproduction must show the `/api/usage` Free percentage jumping to 100 after Stop.
Known cost of the server variant below: `/api/usage` and the summary would show 0% used while enforcement still refuses on the hold (free-trial-service.ts:150-153, 661-690) until the lease clears (free-trial-service.ts:978-991), which brings back the "Usage says available but sends are refused" mismatch for the length of the lease.
Lower-risk alternative to try first (client only): after a turn ends (WebChatPage.tsx:2297-2303), refetch usage again once settlement has had time to land (and on the next focus), and do not turn a 0%-remaining reading into the "reached the Free limit" banner for a short window after a Stop or error. It changes nothing stored and cannot cause the mismatch. Pick the client variant unless the reproduction shows the server hold is still read after settlement.
Server variant, only if the reproduction requires it:
Make the display reading ignore unsettled holds, keep enforcement exactly as it is.
```ts
function freeUsageSnapshotSql(unsettled: 'hold' | 'ignore'): string
// relevant_usage.used_microusd:
//   hold:   coalesce(reservation.actual_cost_microusd, reservation.reserved_microusd)
//   ignore: coalesce(reservation.actual_cost_microusd, 0)
async function readFreeUsageSnapshot(db, userId, unsettled = 'hold')
```
`getFreeTrialPublicUsage` calls it with `'ignore'`; `reserveFreeTrial`, `freeTrialResetAt` and the other enforcement callers stay on `'hold'`. Result: a Stop, a second tab, or a running turn no longer paints the account as used up; once settlement writes `actual_cost_microusd` the real number appears on the next poll. A real limit (settled usage at budget) still shows the banner. Cost: one SQL variant, no schema change. Refactor note: the SQL is a constant string today; turning it into a function of one flag is the smallest way to share it, and a copy of the whole statement would break "one owner".
Also check `hasUsageRemaining` (line 546) is only displayed, not used to refuse; enforcement uses `remainingFromSnapshot` on the `'hold'` read.
If a reproduction (section 5) shows the banner still appears after this change, the next suspect is the client ordering at WebChatPage.tsx:2297-2303; do not guess a client delay before then.

### 3.5 Banner clipping
No code change proposed until seen on a real limit. If the real limit also clips, adjust the stack in WebChatPage.tsx:7779-7790 or give the banner `relative z-10` so the composer's focus ring does not cover it. The other agent's commit 52530d34f9 touches this file, so do it in a separate small commit after theirs.

### 3.6 Other consumers of the catalog (added after review)
The new entry changes every caller of `classifyManagedQuotaErrorCode`. Each was read at origin/main; behavior with the new code, and the action:
- packages/ui/unified-chat/src/hooks/useChat.ts:808-830 (desktop Tauri and other shared-chat hosts): builds a paywall from the block with `showUpgradeCta: quotaBlock.showUpgradeCta && nextTier !== null` and no `recoveryAction`. Today the lapsed code falls to the generic error path; after the change it becomes a card with the server sentence and, with `showUpgradeCta: true`, an upgrade button where a next tier exists. Wrong button for a lapsed plan. Action: in this hook, for the lapsed code set `recoveryAction` from `event.recovery` when the stream error event carries it, else leave the card without a button (`showUpgradeCta: false`). Check whether the stream error event carries `recovery`; if it does not, say so in the commit and ship the sentence-only card on those hosts. Add a useChat test.
- apps/extension/src/side_panel.ts:9413: uses `showResetTime` (false here) and builds error text; the sentence shows, no reset line. Accepted; add one assertion.
- apps/extension/src/features/cloud-bridge/freeTrialClient.ts:997-1004: maps any non-rate-limit block to `plan_required` or `quota_exceeded`; read `accountLimitFailureCode` to confirm which one a `billing_period` kind with `token_cap` gets. Accepted if it reads as quota; add a test.
- apps/extension/src/features/computer-use/cloudAgentClient.ts:171,347: uses `block.reason` as fallback text only when the server message is missing. Accepted.
- apps/extension-vscode/src/utils/api.ts:749-755: throws `AgiWorkforceUsageLimitError` with the server message and the block. Check the copy of that error class for upgrade or wait wording before shipping; add a test that a lapsed 402 does not say "upgrade".
- apps/web/features/chat/stores/voice-input-store.ts:149-168: `allowanceBlock` returns the block and the person gets `USAGE_LIMIT_MESSAGE` ("usage limit"), wrong for a lapsed plan. Action: return null from `allowanceBlock` for the lapsed code so it falls to the 402 branch (`PLAN_REQUIRED_MESSAGE`), or add a lapsed message; pick the 402 branch (smaller). Add a test.
- apps/web/lib/hooks/useMediaGeneration.ts:208: maps any classified code to `view_usage`; fixed in 3.3 item 4.
- apps/web/features/chat/stores/freeTrialStore.ts:13: tests `kind === 'free_trial'`; unaffected.
- apps/mobile/app/(app)/chat/[id].tsx:507 and apps/mobile/services/failureCopy.ts:60: failureCopy returns null unless `kind === 'free_trial'`; unaffected. [id].tsx:507 uses the presentation for reset time only, and `showResetTime` is false. Mobile builds its paywall action by code in apps/mobile/services/apiErrors.ts:25-29 (`subscription_required` gives subscribe, `subscription_inactive` gives manage_billing, everything else upgrade), so a lapsed refusal on the phone offers Upgrade today and keeps doing so. Not changed by this work and not confirmed on a device. Action for mobile: import `BILLING_PERIOD_NOT_RENEWED_CODE` in apiErrors.ts:108 instead of the literal, and map the lapsed code to `manage_billing` in `recoveryActionForPaywallCode`; read the mobile body parsing before adding `contact_support`, and leave the phone with the sentence if the action union there has no such value.

## 4. Regression check
- Money and permissions are touched (what is refused, what recovery is offered), so add tests:
  - packages/contracts/types: `classifyManagedQuotaErrorCode('billing_period_not_renewed')` is non-null and account-wide.
  - apps/web/lib/services/managed-usage-request-service.test.ts: Stripe-billed gives `manage_billing` to `/settings/billing`; no Stripe id gives `contact_support` to `/support`; unknown code still null.
  - apps/web/features/chat/lib/quotaPaywallSlot.test.ts: the lapsed code with a server recovery of `contact_support` and of `manage_billing` gives a slot with that action, `showUpgradeCta: true` (also on the top tier, where `nextTier` is null), and `isAccountWideUsageBlock` true.
  - Composer, `runMediaPaywallRecovery`, InlinePaywallCard, voice store, useChat and the other hosts: the tests named in 3.3 item 10 and 3.6.
  - request-processor.budget-admission.test.ts already pins the 402 and code (line 172); add an assertion that the body carries `recovery`.
  - free-trial-service test (only if 3.4 server variant ships): with an unsettled whole-window reservation, `getFreeTrialPublicUsage` shows no usage from it, while a new reservation is still refused (`reserve` sees the hold). Real DB or the existing fake that refuses nested transactions; do not weaken the existing enforcement tests.
- Run `pnpm check:mock-exports` implications: none expected (no new mock factory).

## 5. Person-style check (rebuilt local app, seeded accounts)
1. Sign in as the Premium test account whose period ended (the W-19 subscribed account). Open chat, type "hello", press Enter. Must see: no "Error:" text, no red Retry banner, no "start a new chat" line; a composer notice (not an inline card) saying the plan period ended and has not renewed, with one button. For this account (no Stripe) the button reads "Contact support" and opens /support; with a Stripe-billed lapsed account it reads "Manage billing" and opens /settings/billing. Reload the page: the notice is still shown after the next send, and the earlier turn is not a "Response failed" row.
2. Repeat on the phone-width window: the button is visible and tappable above the composer.
3. Sign in as a Premium account with a current period, send a normal message: it answers as before (no regression).
4. Sign in as Free (W-2 style account with allowance left). Send a prompt that streams for several seconds, press Stop mid-answer. Must see: no limit banner, composer usable, next message works. Wait 10 seconds and reload: still no banner.
5. Same with a second tab: start a long answer in tab A, open tab B and wait 5 minutes (poll) or reload: no banner in B while A streams.
6. Denied case: use the seeded Free account at its real limit (settled usage at budget, or the five-hour account at 95%): the banner "You've reached the Free limit for now", the reset and Upgrade are fully visible above the composer, not clipped by the composer's focus ring. Click Upgrade: goes to pricing or the waitlist per current owner rule.
7. (3.4 reproduction) Watch /api/usage in the network panel after Stop: the Free percentage must not jump to 100.

## 6. Compatibility and rollback
- The server only adds a `recovery` field to an existing 402 body; clients that ignore it behave as now. The action `manage_billing` is new to the `recovery` union and `contact_support` is new to the web client: web and desktop are rebuilt together with the contract; mobile and any store-released client that switches strictly on the action must ignore or fall back on unknown actions (check before release).
- Free display change (if shipped) is read-only and changes no stored data. Rollback: revert the `'ignore'` argument.
- No migration. Each part reverts on its own.

## 7. Owner
- Decision (recommendation given): what a person on a comped or admin-set plan should do when the period lapses. Fact: such a plan has no Stripe subscription, so Settings > Billing offers no renewal (tester screenshot 13). Recommendation: "Contact support" (/support) as designed above; alternative is to renew comped periods automatically on the server, which is a product and money decision and is not part of this fix.
- Decision: wording of Billing and Usage pages for a lapsed period (they say Active, no dates, "full limits available"). Recommendation: show "Plan period ended on <date>" in both and hide the allowance meter; not included here, needs the owner's copy.
- No credential or production setting needed.

## 8. Overlap
- web-lane worktree: no diff in billing-catalog.ts, InlinePaywallCard.tsx, mediaPaywallRecovery.ts, useMediaGeneration.ts, managed-usage-request-service.ts, quotaPaywallSlot.ts, useChatStream.ts, WebChatPage.tsx or UsageWarningBanner.tsx (git diff --stat empty for each).
- Other agent's checkout (~/Desktop/agiworkforce): commit 52530d34f9 "fix(web): distinguish service configuration failures in chat" touches apps/web/lib/hooks/useChatStream.ts and apps/web/features/chat/pages/WebChatPage.tsx. This design needs no edit to useChatStream.ts; keep any banner-position edit (3.5) for after that commit lands. No other agent changes to the other files were found.
- Avoid conflicts: land the contracts catalog entry, server recovery and web slot allowlist in one commit; the Free display SQL in a second; touch InlinePaywallCard.tsx only for the `contact_support` label.

## Review response
Blocker 1 (button removed by `showUpgradeCta: false`): right. WebChatPage.tsx:1823 drops `actionLabel` and `onRecover` on `false`, quotaPaywallSlot copies the flag, and useChatStream.ts:6262-6320 deletes the reply and skips the banner for an account-wide block, so the person would have seen a sentence and nothing to press. Changed: catalog `showUpgradeCta: true`, the resolver forces it true for this code even on a top tier (3.1, 3.3 item 8), and InlinePaywallCard gets its own headline and badge handling for `contact_support` so the flag no longer means "sell a plan" for this block (3.3 item 7). I kept the flag instead of adding a new field because it is the existing switch for "this block shows one button"; a second flag would be an unused abstraction elsewhere. Composer test for the button label added (3.3 item 10).
Blocker 2 (button replaced by a model switch): right. WebChatPage.tsx:2175-2181 skips `pickFreePoolModel` only for `manage_billing`; lines 2183-2196 then overwrite label and `onRecover`. Changed: a block-keyed helper `blockRefusesEveryModel` covers `manage_billing` and `contact_support` (3.3 item 9). Partly not taken: `view_usage` keeps its alternative, because that action belongs to the five-hour and weekly window blocks where a Free-pool model works, and the lapsed block never carries it.
Blocker 3 (`contact_support` not wired): right. The union is repeated in message-metadata.ts:128, InlinePaywallCard.tsx:53, MessageBubble.tsx:656 and useMediaGeneration.ts:125-126, and `runMediaPaywallRecovery` has no branch (mediaPaywallRecovery.ts:201-222). Changed: one shared type, every site listed, a new `openSupport` handler, a branch and tests (3.3). One correction to the old design: `ManagedQuotaRecovery.action` on the server already has `contact_support` (managed-usage-request-service.ts:82); only `manage_billing` is new there.
Suggestions: the mobile literal is replaced by the shared constant (3.6); every consumer is checked and has an action or an accepted note (3.6), with the mobile result marked unconfirmed on a device; section 3.4 is on hold until the banner is reproduced, the client refetch is the first option, and the mismatch cost of the server variant is stated.
Unverified: I did not run anything. Whether the stream error event for desktop (useChat.ts) carries `recovery`, the copy inside `AgiWorkforceUsageLimitError`, the extension `accountLimitFailureCode` result, and the router helper in WebChatPage for `/support` were not read and are marked as read-first steps above.
