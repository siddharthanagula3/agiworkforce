---
id: "F082-09"
type: "feature"
title: "Limit warnings and blocked state"
aliases: ["Usage warning banner", "Paywall card", "Limit reached", "Blocked state", "Alternative model suggestion", "Wait until reset", "S82.24", "S82.25", "S82.26", "S82.27", "UsageWarningBanner", "InlinePaywallCard", "PaywallBottomSheet", "WorkUsageCard"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S82.24", "S82.25", "S82.26", "S82.27"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "F082-10", "F082-11", "F082-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-09 Limit warnings and blocked state

When a Cloud plan window is nearly used up, apps show a warning naming the binding limit and its reset time. When a request is refused, apps show which limit was hit, when it resets, a different model if one is allowed, and the recovery action the plan allows (add credits, upgrade, view usage, contact support).

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.24](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8224), [S82.25](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8225), [S82.26](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8226), [S82.27](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8227).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Warns when 25 percent or less of a usage window remains, then shows a blocked state with reason, reset time, an alternative model and a recovery action.

**Why it exists.** Users should not discover a limit through a silent failure. Briefs S82.24 to S82.27 ask for a warning, a clear blocked state, a model suggestion and a wait-until-reset option.

**Who uses it.** Cloud subscribers and Free users on all six apps.

**Problems it solves**

- Surprise refusal mid-task
- Not knowing which limit applies
- Not knowing when to come back
- No cheaper path when a flagship limit is spent

**Use cases**

- Web user at 20 percent left sees 'You have used X of Y' above the composer.
- User hits the weekly flagship limit and clicks 'Switch to <model>'.
- Mobile user sees a bottom sheet with the reset time and 'Choose a standard model'.
- CLI user gets text with 'It resets in ...' and a /model hint.

## 2. User experience

**Where to find it**

- Web and hosted desktop: banner above the composer (apps/web/features/chat/pages/WebChatPage.tsx:1859; component packages/ui/unified-chat/src/components/UsageWarningBanner.tsx), inline paywall card in the message list (apps/web/features/chat/components/messages/ChatMessageList.tsx:782), account-wide block card above the composer (ChatComposerNew.tsx:5075-5145).
- Mobile: banner above the composer and bottom sheet (apps/mobile/app/(app)/chat/[id].tsx:2708, 2852).
- CLI: notice lines 'You have used N% of your <window>. Run agi usage to see what is left.' (apps/cli/src/models/streaming.rs:230-258) and an error hint on refusal (apps/cli/src/errors.rs:687-708).
- VS Code: usage meter and warning in the sidebar webview, notification actions on a refusal (apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:146-175).
- Chrome side panel: banner '#sp-usage-warning' with one action (apps/extension/src/side_panel.ts:15654-15670).

**Before you start**

- Managed Cloud account with a usage window. Free: shown 'You're close to the Free limit for now' or 'You've reached the Free limit for now' with Upgrade only (packages/contracts/types/src/usage-vocabulary.ts:186, 187-229).

**Screens and controls**

- Banner: headline, reset text ('Resets in ...'), upgrade or 'Get more usage' link, 'Dismiss usage warning' button (UsageWarningBanner.tsx:17-85).
- Web paywall card: headline, reason, plan comparison line, 'Switch to <name>' with 'is not limited by this and can answer now', or 'Switching to a standard (non-flagship) model clears this now', reset text, primary action ('Buy credits', 'View usage', 'Manage billing', or Upgrade) and 'Try later' (InlinePaywallCard.tsx:181-190, 255-262, 456-480).
- Work card: 'Add credits' / 'Turn on usage credits' / 'Upgrade', or only 'Your usage comes back when it resets.' (packages/contracts/types/src/work-usage.ts:96-112).
- Mobile sheet: title, reason, reset label, primary button, 'Choose a standard model', 'Compare plans', 'Try later' or 'Close' (PaywallBottomSheet.tsx:128-160, 358, 403).
- VS Code actions: 'Use <model>', 'Add credits', 'Upgrade', 'View usage', 'Contact support' (cloudUtilityErrorActions.ts:59-64, 160-175).
- Chrome action labels: Add credits, Upgrade, Manage usage, Contact support (apps/extension/_locales/en/messages.json:125-143, 4043).

**Journey**

1. Use Cloud chat normally; the managed usage summary refreshes.
2. When the tightest window has 25 percent or less left the banner appears; at 10 percent or less it turns critical (usage-vocabulary.ts:154-156, 206-214).
3. When a request is refused, the server answers with a code, message, reset time, alternative model and recovery (managed-usage-request-service.ts:106-124).
4. The app shows the paywall card or sheet with the reason and reset time.
5. Choose the alternative model, wait for the reset, or follow the recovery action.

**What the person sees and gets**

- Headline such as 'You have used X of <window limit>' (usage-vocabulary.ts:231-250).
- Reset text 'Resets in N hr M min' (usage-vocabulary.ts:140-146).
- Reason copy per code, for example 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.' (billing-catalog.ts:949-958).
- CLI hint 'It resets in X. Your plan also includes <model>, which this limit does not cover: switch with /model ...' (errors.rs:690-708).

**Settings**

- Banner can be dismissed per session (WebChatPage.tsx:1856).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Binding-limit warning logic shared by web, mobile, VS Code and Chrome (selectUsageWarning, packages/contracts/types/src/usage-vocabulary.ts:188-229); Free plans never get a credit or percent figure.
- Server refusal body with code, message, resets_at, alternative_model and recovery (managed-usage-request-service.ts:106-124). Reset time from the user's rolling usage or period end; alternative model from the plan's catalog (managed-usage-request-service.ts:473-583; apps/web/lib/server/plan-limit-alternative.ts:8-26).
- Recovery rules: top-up for a self-serve plan billed by a payment source when credits clear the block, contact support for contract-priced plans, upgrade when a higher tier exists, else view usage (managed-usage-request-service.ts:86-104).
- Web: resolveQuotaPaywallSlot builds the card data (apps/web/features/chat/lib/quotaPaywallSlot.ts:41-95).
- Mobile: PaywallBottomSheet and UsageLimitBanner; spend-cap code is treated as no model switch (apps/mobile/services/apiErrors.ts:104-114).
- CLI: streams a 'quota_warning' event and maps UsageLimit and Paywall errors to hints (streaming.rs:209-275; errors.rs:620-685).
- VS Code and Chrome have their own banners and recovery actions linking to the web.

**Incomplete**

- There is no separate 'wait' button. Waiting is offered as reset-time text and, on web and mobile, a 'Notify me when it resets' action (see F082-12).
- Spend-cap refusals (codes organization_spend_cap_reached and over_cap) are not in the shared quota classifier: a search of packages/contracts/types/src found neither code, so they do not get the paywall card with reset time (see F082-11).
- Mobile shows no 'Upgrade' primary button when native purchases are unavailable; it shows 'Not included in your plan' text instead (PaywallBottomSheet.tsx:128-160).
- The CLI computes reset time and alternative model with an extra account-usage fetch (streaming.rs:285-301, usage_summary.rs:247-272). Whether it also reads those fields from the refusal body is not established.

**Present but disconnected or switched off**

- Web composer hides the 'Notify me when it resets' button inside the desktop host (WebChatPage.tsx:1815-1817).

**Not available**

- Chrome: alternative model suggestion appears only as a 'switch-model' error action for flagship-limit codes (side_panel.ts:9758); no named model in the banner found.
- The Tauri desktop app was not checked for this feature.

## 4. Required behaviour

**Established requirements**

- Users are warned before they hit a usage limit. (source: S82.24 (brief))
- At a limit the user sees a clear blocked state naming the limit and what they can do. (source: S82.25 (brief))
- When a limit or plan blocks the chosen model, an eligible alternative model is offered. (source: S82.26 (brief))
- At a limit the user is offered waiting until the reset, with the reset time, as an alternative to paying. (source: S82.27 (brief))
- A blocked request returns a machine code and message, plus reset time and alternative model when known. (source: apps/web/lib/services/managed-usage-request-service.ts:106-124)
- Free usage screens show only Upgrade, never meters. (source: owner decision recorded in project memory (free-usage-upgrade-only); enforced by tests such as UsageSection.history.test.tsx 'never states a credit figure for a free account')

**Acceptance criteria**

1. At 25 percent remaining or less on any window a banner appears; at 10 percent it is critical; at more than 25 percent no banner.
2. The banner names the binding window and shows its reset time.
3. A refused request shows a card or sheet with the reason, the reset time when the code has one, and a recovery action that matches the plan.
4. For the flagship weekly limit the card offers 'Switch to <model>' (web) or 'Choose a standard model' (mobile).
5. A contract-priced plan sees contact support, not a purchase button.
6. Free plan sees Upgrade only and no credit figure.
7. Dismiss hides the banner for the session; a new refusal still shows the blocked card.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The banner and the card should not show at the same time; web hides the banner when an account usage block is active (WebChatPage.tsx:1857) [inferred as intended].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add spend-cap codes to the shared classifier so every app shows the same card.
- [proposed] Add a named 'Wait' choice that simply dismisses the card and shows the reset time.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | selectUsageWarning | `packages/contracts/types/src/usage-vocabulary.ts` | Chooses the binding bucket and builds headline and reset label |
| service | classifyManagedQuotaErrorCode / managedQuotaResetAt | `packages/contracts/types/src/billing-catalog.ts` | Per-code presentation (reason, show reset, suggest standard model, cleared by credits) |
| service | managed-usage-request-service (refusal) | `apps/web/lib/services/managed-usage-request-service.ts` | Reservation decisions, error body, recovery, limit context |
| service | plan-limit-alternative | `apps/web/lib/server/plan-limit-alternative.ts` | Picks an eligible alternative model |
| component | UsageWarningBanner | `packages/ui/unified-chat/src/components/UsageWarningBanner.tsx` | Shared banner used by web and unified chat |
| component | WebChatPage usage warning wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Computes warning, account usage block, passes reminder callback |
| component | InlinePaywallCard | `apps/web/features/chat/components/InlinePaywallCard.tsx` | Blocked card with alternative model, reset time and actions |
| service | resolveQuotaPaywallSlot | `apps/web/features/chat/lib/quotaPaywallSlot.ts` | Turns an error into a paywall slot |
| component | WorkUsageCard | `apps/web/features/chat/components/WorkUsageCard.tsx` | Account-wide block card above the composer for Work usage |
| store | useChatStore.accountUsageBlock | `apps/web/features/chat/pages/WebChatPage.tsx:1805` | Holds the account-wide block between turns |
| component | UsageLimitBanner (mobile) | `apps/mobile/src/features/chat/components/UsageLimitBanner.tsx` | Mobile warning banner |
| component | PaywallBottomSheet | `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` | Mobile blocked sheet |
| command | CLI quota warning and usage limit hints | `apps/cli/src/models/streaming.rs` | quota_warning notice and limit context |
| command | CliError::UsageLimit hints | `apps/cli/src/errors.rs` | Text for refusals including alternative model |
| service | cloudUtilityErrorActions | `apps/extension-vscode/src/core/cloudUtilityErrorActions.ts` | VS Code notification actions on a limit |
| component | Chrome usage banner | `apps/extension/src/side_panel.ts` | renderUsageBanner, openQuotaRecovery, handleStreamError |
| test | InlinePaywallCard tests | `apps/web/features/chat/components/__tests__/InlinePaywallCard.test.tsx` | Card behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client reads the managed usage summary (windows, percentages, reset times) and runs selectUsageWarning. | device and our servers | WebChatPage.tsx:1847-1855; mobile UsageLimitBanner.tsx:60-64 |
| When a managed request is made, the server reserves usage. On refusal it builds a body with code, message, resets_at, alternative_model, recovery. | our servers | managed-usage-request-service.ts:424-432, 560-583, 106-124 |
| The server also streams a quota warning header on chat completions that CLI reads as a 'quota_warning' event. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:416; apps/cli/src/models/streaming.rs:209 |
| The app classifies the code, picks the card variant and recovery label, and shows it. | device | quotaPaywallSlot.ts:41-95; PaywallBottomSheet.tsx:128-160 |
| Recovery opens billing, upgrade, usage or support pages on the web (VS Code, Chrome) or in-app (web, mobile). | device | ChatStateManager.ts:1986-1996; side_panel.ts:751-753 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage windows and reset times | Computed server-side from managed_usage_requests and credit balances | Fetched per app | unknown |
| Dismissed banner flag | Component state in the page | No | Lost on reload |
| Account usage block | store:useChatStore (web) | No | Cleared when a send is accepted (WebChatPage.tsx:1798-1803) |

**Models and providers.** The alternative model is chosen from the plan's live model catalog: flagship-weekly limits offer a standard model, other windows offer a free-pool model, preferring the same developer (plan-limit-alternative.ts:8-26; managed-usage-request-service.ts:473-507). No model name is fixed in the UI. Windows are credit-based regardless of provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account for the usage summary and refusals. |
| Permissions | Anyone on the account sees their own limits. Top-up and billing actions need a plan that can buy credits (managed-usage-request-service.ts:86-104). |
| Subscription | Recovery depends on plan: top-up for self-serve paid plans billed by Stripe/Apple/Google, contact support for contract-priced plans, upgrade when a higher tier exists, otherwise view usage. Free: Upgrade only. Mobile without native purchases shows 'Not included in your plan' wording (PaywallBottomSheet.tsx:128). |
| Limits and metering | Windows: 5-hour, weekly, flagship weekly, billing period (usage-vocabulary buckets). Warning threshold 25 percent remaining, critical 10 percent (usage-vocabulary.ts:154-156). |
| Feature flags | Free promoted model hides the banner on web (WebChatPage.tsx:1843-1850). Other flags: none found. |
| Model compatibility | The flagship weekly limit only affects flagship models; the suggestion is a non-flagship model. |
| Provider restrictions | none found in the code |
| Local mode | Local mode has no managed limits, so no banner or card. CLI in BYOK says provider spend is billed by the provider (usage_summary.rs:340-343). Mobile banner reads the cloud usage store only for the signed-in owner (UsageLimitBanner.tsx:111-114). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading or unknown usage | No banner when no reading is finite (selectUsageWarning returns null). | usage-vocabulary.ts:195-206 |
| Blocked, reset known | Reset text shown if the code shows reset time and a time was sent. | ChatMessageList.tsx:631-640, InlinePaywallCard.tsx:476 |
| Blocked, no alternative | Generic text 'Switching to a standard (non-flagship) model clears this now.' when suggestion applies without a named model. | InlinePaywallCard.tsx:471-474 |
| Rate limit | Code rate_limit_exceeded: no upgrade button; wait and retry. | billing-catalog.ts:970-977 |
| Free capacity or Free limit | Separate cards with countdown 'Try again in ...' (free-capacity) and Free limit actions. | InlinePaywallCard.tsx:293-362 |
| Allocation pending / billing unavailable | Server returns 503 billing_unavailable; Chrome shows a pending-allocation notice string. | managed-usage-request-service.ts:305-308; messages.json spQuotaAllocationPending |
| Offline | not handled in the code for this feature specifically (generic send errors apply) | none found |
| Accessibility | Banner role=status; mobile banner role summary and 44 point targets; Chrome banner aria-live polite; web work card role=alert. | UsageWarningBanner.tsx:30; UsageLimitBanner.tsx:164, 191; side_panel.ts:15654; WorkUsageCard.tsx:34 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/__tests__/UsageWarningBanner.test.tsx`: Banner rendering
- `packages/contracts/types/src/__tests__/usage-vocabulary.test.ts`: Warning selection logic
- `apps/web/features/chat/components/__tests__/InlinePaywallCard.test.tsx`: Paywall card
- `apps/web/features/chat/components/__tests__/InlinePaywallCard.freeLimit.test.tsx`: Free limit variant
- `apps/web/features/chat/components/__tests__/InlinePaywallCard.freeCapacity.test.tsx`: Free capacity variant
- `apps/web/features/chat/lib/quotaPaywallSlot.test.ts`: Slot resolution
- `apps/web/lib/services/managed-usage-request-service.test.ts`: Refusal and reservation behaviour
- `apps/mobile/__tests__/PaywallBottomSheet.test.tsx`: Mobile sheet
- `apps/mobile/__tests__/UsageLimitsInfoAndCredits.test.tsx`: Mobile limits info
- `apps/extension-vscode/src/__tests__/cloudUtilityErrorActions.test.ts`: VS Code limit actions
- `apps/extension/__tests__/usage-windows.test.ts`: Chrome usage windows
- `apps/cli/src/errors.rs`: In-file CLI error tests (86 test markers)

**Test scenarios**

- **Warning threshold**
  1. Use a test account with a window at 30 percent, then 20 percent, then 8 percent remaining.
  - Expected: No banner, normal banner, critical banner. The banner names the window and the reset.
- **Flagship weekly block**
  1. Exhaust the flagship weekly window on a paid test account.
  2. Send with a flagship model.
  - Expected: 402-style refusal with alternative_model; web shows 'Switch to <name>'; clicking switches and resends.
- **Contract plan**
  1. Trigger a block on a contract-priced test account.
  - Expected: Recovery is contact support.
- **Free plan**
  1. Run a Free account to its limit.
  - Expected: Free-limit headline, Upgrade only, no credit numbers.
- **CLI refusal**
  1. Run the CLI signed in to a spent account.
  - Expected: Error text with reset time and /model hint; a quota_warning notice appears once per scope and level before the limit.
- **Mobile sheet**
  1. Cause a refusal in mobile Cloud mode.
  - Expected: Bottom sheet with reason and reset label and 'Choose a standard model' when suggested.

**Where to look when it fails**

- Refusal body fields code, resets_at, alternative_model, recovery in the HTTP response.
- Server log 'Plan limit refusal context could not be read; the refusal is sent without it' (managed-usage-request-service.ts:577-580).
- Reset header X-Quota-Warning (apps/web/lib/cors.ts:83).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)
- CLI: [70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md)
- VS Code: [70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md)
- Chrome: [70-qa/test-plans/chrome/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/chrome/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **Spend-cap refusals are not classified, so no shared paywall card or reset time.** Affects: All apps, workspace members. Evidence: No match for organization_spend_cap_reached in packages/contracts/types/src; handled only in apps/mobile/services/apiErrors.ts:109 and apps/web/features/chat/lib/live-voice-session.ts:251. Work needed: Add the codes to the shared classifier with reason copy.
- **No explicit 'wait' choice; waiting is only implied by reset text.** Affects: Web, mobile. Evidence: InlinePaywallCard.tsx:476; PaywallBottomSheet.tsx:403 shows only Try later/Close. Work needed: Optional: label the dismiss action around the reset time.
- **Brief cites UsageSection.tsx:753 as the wait option; that line is the personal monthly spend limit text, not the plan-limit wait option.** Affects: Documentation. Evidence: apps/web/features/settings/sections/UsageSection.tsx:707-755. Work needed: Correct the brief.
- **Whether the CLI reads reset and alternative from the response body is unclear.** Affects: CLI. Evidence: errors.rs:995-1000 versus streaming.rs:285-301. Work needed: Confirm and avoid the extra fetch.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- F082-10
- F082-11
- F082-12

## Unknown

- Whether the CLI reads resets_at and alternative_model from the refusal body.
- How the Tauri desktop app presents limits.
- Exact Chrome alternative-model behaviour for non-flagship limits.
- Whether VS Code shows a banner or only the meter for the 25 percent warning (meter code in ChatStateManager.ts:885-940 not read in full).
- Whether native-purchase availability on mobile is currently false (nativePurchaseAvailability.ts not opened); memory notes say no subscription sales before 2027-01-01.
