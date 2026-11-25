---
id: "F082-06"
type: "feature"
title: "Credit balances: included, purchased, bonus and expiry"
aliases: ["Credit balances", "Bonus credits", "Purchased credits", "Included in your plan", "Promotional credits", "Credit expiry", "S82.13", "S82.14", "S82.15", "S82.16", "spendable credits", "Buy credits"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S82.13", "S82.14", "S82.15", "S82.16"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-observability-and-operations", "api:GET /api/usage", "api:GET /api/billing/overage", "table:managed_usage_requests", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "F082-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-06 Credit balances: included, purchased, bonus and expiry

Shows credits left and keeps three kinds apart: the plan's included credits, purchased credits and bonus credits from referrals or promotions, each with its expiry rule. Web shows bonus and purchased on a 'Credit balances' card. Mobile shows included credits, and bonus and purchased only when store purchases are on, which they are not now.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.13](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8213), [S82.14](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8214), [S82.15](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8215), [S82.16](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8216).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** The summary reply carries credit windows for the plan, a purchased balance that is null when unknown, bonus credits with their next expiry, and purchase expiry information (apps/web/lib/services/managed-usage-summary-service.ts:163-209). Apps render them in their own layouts.

**Why it exists.** Credits are spent in a set order and expire by different rules. A person needs to know what they hold and when it lapses. The brief requires remaining credits, purchased versus included, promotional credits and expiry (doc: knowledge-base/data/area-briefs/082-usage-dashboard-and-limit-ui.md, S82.13 to S82.16).

**Who uses it.** Subscribers who buy extra credits, get referral or promotional credits, or ask how much they can still spend.

**Problems it solves**

- Mistaking an unknown balance for zero. The server returns null when the read fails (apps/web/lib/services/managed-usage-summary-service.ts:56-66, 195).
- Not knowing which credits are used first. The card says bonus credits go first, soonest expiring, then bought credits (apps/web/features/settings/sections/UsageSection.tsx:425-427).
- Surprise credit loss. Each bonus grant shows its next expiry date.

**Use cases**

- A user with a referral reward reads 'Bonus credits 40' and 'Next expiry <date>' (apps/web/features/settings/sections/UsageSection.tsx:380-385).
- A buyer reads 'Purchased credits' and that some expire where local law requires (apps/web/features/settings/sections/UsageSection.tsx:398-404).
- A CLI user reads 'Purchased credits: 25, overage on' (apps/cli/src/usage_summary.rs:695-706).
- A VS Code user reads 'Credits' with a note on whether they can be spent (apps/extension-vscode/src/core/commandSetup.ts:2323-2329).

## 2. User experience

**Where to find it**

- Web and hosted Desktop: Settings, Usage, card 'Credit balances' with rows 'Bonus credits' and 'Purchased credits' and a 'Buy credits' link to Billing (apps/web/features/settings/sections/UsageSection.tsx:407-435). Included plan credits show in the plan bars and the allowance line (apps/web/features/settings/sections/UsageSection.tsx:1245-1254, 1393-1404).
- Mobile: Settings, Usage, card 'Credit balances' with 'Included in your plan'. 'Bonus credits' and 'Purchased credits' appear only when store purchases are available (apps/mobile/src/features/settings/cloud-usage/index.tsx:411-434).
- CLI: usage command line 'Purchased credits: <n>, overage on|off', and 'Add credits: <link>' (apps/cli/src/usage_summary.rs:695-706, 584-587).
- VS Code: row 'Credits' with a spendability note and 'Add credits' (apps/extension-vscode/src/features/settings/SettingsPanel.ts:99-108; apps/extension-vscode/src/core/commandSetup.ts:2323-2329).
- Chrome: no balance display found. The panel uses the purchased balance to decide whether work can continue and shows 'using purchased credits' (apps/extension/src/side_panel.ts:13222-13264).

**Before you start**

- Paid non-contract plan on web (apps/web/features/settings/sections/UsageSection.tsx:1445).
- Mobile: Cloud mode, signed in, not Free.

**Screens and controls**

- Web 'Buy credits' link opens Settings, Billing (apps/web/features/settings/sections/UsageSection.tsx:417-423).
- Web 'Resets' card with 'Use reset' when a limit reset is granted (apps/web/features/settings/sections/UsageSection.tsx:437-533).
- Web 'Monthly spend limit' card with 'Manage' and an auto-reload link (apps/web/features/settings/sections/UsageSection.tsx:694-761).
- Mobile 'Usage credits' switch and 'Current balance' row when the account has credits or the switch is on (apps/mobile/src/features/settings/cloud-usage/index.tsx:826-876, 931-935).

**Journey**

1. Open Usage.
2. Read the plan bars for included credits and reset times.
3. Read 'Credit balances' for bonus and purchased amounts.
4. Read the next expiry line under bonus credits.
5. Select 'Buy credits' to go to Billing (web).

**What the person sees and gets**

- Bonus row: amount and 'Next expiry <date>', or 'None' with a hint, or 'Unavailable' with 'Could not read your bonus credits. Refresh to retry.' (apps/web/features/settings/sections/UsageSection.tsx:370-386).
- Purchased row: amount or 'None'; 'Purchased credits don't expire.' or the local-law expiry sentence; 'Unavailable' on read failure (apps/web/features/settings/sections/UsageSection.tsx:388-405).
- Amounts in credits with up to two decimals under 10 (apps/web/features/settings/sections/UsageSection.tsx:176-178).

**Settings**

- Usage credits switch on mobile and 'Keep going after a usage limit' on Billing on web (apps/mobile/src/features/settings/cloud-usage/index.tsx:826-876; doc: apps/web/content/support/usage-and-credits.md).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- BONUS_CREDIT_EXPIRY_DAYS is 90 and bonusCreditExpiry adds it to the grant date (apps/web/lib/services/bonus-credit-service.ts:7, 66-68).
- Grant sources are referral_referrer, referral_friend and promo (apps/web/lib/services/bonus-credit-service.ts:11).
- getPrepaidCreditBalances reads two database functions for balances and lots and returns bonus, purchased, expiring purchased and next expiry dates (apps/web/lib/services/bonus-credit-service.ts:164-212).
- A failed prepaid read is logged and reported as null for purchased and bonus (apps/web/lib/services/managed-usage-summary-service.ts:56-66, 195-207).
- A daily cron expires due bonus lots, at most 500 accounts per run (apps/web/app/api/cron/expire-bonus-credits/route.ts; vercel.json:34-35; apps/web/app/api/cron/expire-bonus-credits/route.test.ts:55).
- The summary also returns credit_balance_cents (spendable) and overage_enabled (apps/web/lib/services/managed-usage-summary-service.ts:235-236).
- Web renders the Credit balances card with unknown, none and amount states (apps/web/features/settings/sections/UsageSection.tsx:370-435).
- Web helper spendableCreditsNow sums plan remaining, bonus and purchased (apps/web/lib/hooks/useManagedUsageSummary.ts:163-172).
- CLI prints a purchased line with 'unknown' when null (apps/cli/src/usage_summary.rs:695-706).
- VS Code shows the spendable balance and whether it will be spent (apps/extension-vscode/src/features/settings/SettingsPanel.ts:99-108).
- Chrome derives balance, overage and spendable from purchased credits (apps/extension/src/features/side-panel/usageWindows.ts:116-125).

**Incomplete**

- Mobile hides bonus and purchased rows when nativePurchases is false, which is the current setting (apps/mobile/src/features/settings/cloud-usage/index.tsx:419-421; apps/mobile/src/features/billing/storePurchases.json:2).
- The CLI struct has no bonus or purchase-expiry fields, so it shows no bonus credits or expiry (apps/cli/src/usage_summary.rs:41-48).
- VS Code shows one 'Credits' figure (credit_balance_cents), not the included, purchased and bonus split (apps/extension-vscode/src/utils/api.ts:1393-1394).
- Chrome computes a purchased balance string but no code that shows it was found (apps/extension/src/features/side-panel/usageWindows.ts:116-125; no use of .balance in side_panel.ts).
- The brief marks promotional credits and expiry done on desktop and mobile; mobile currently hides them (see above).

**Present but disconnected or switched off**

- Mobile bonus and purchased rows are compiled in but switched off by nativePurchases false (apps/mobile/src/features/settings/cloud-usage/index.tsx:419-421).

**Not available**

- CLI, VS Code and Chrome: no bonus credits or expiry display.
- Free plan on web and mobile: no credit balances (apps/web/features/settings/sections/UsageSection.tsx:1445).

## 4. Required behaviour

**Established requirements**

- Users can see how many credits remain (plan windows and purchased balance). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.13)
- Users can tell purchased credits apart from the plan's included allowance. (source: S82.14 (same brief))
- Users can see promotional or bonus credits, how much remains and when they lapse. (source: S82.15 (same brief))
- Users can see when each kind of credit expires: plan reset, purchased lifetime, bonus lapse. (source: S82.16 (same brief))
- Settings must show current balance and usage credits. (source: doc: docs/product/requirements.md:1326-1333)
- An unreadable balance is shown as unknown, not zero. (source: apps/web/lib/services/__tests__/managed-usage-summary.credits.test.ts:368; apps/web/app/api/usage/__tests__/route.test.ts:105)
- Past a plan limit, bonus credits are spent first (soonest to expire), then bought credits. (source: apps/web/features/settings/sections/UsageSection.tsx:425-427; apps/web/features/settings/sections/__tests__/UsageSection.test.tsx:447)
- Credits show in credits, never in currency. (source: apps/web/features/settings/sections/__tests__/UsageSection.test.tsx:447; apps/mobile/__tests__/UsageLimitsInfoAndCredits.test.tsx:256)

**Acceptance criteria**

1. Web 'Credit balances' shows Bonus credits and Purchased credits as separate rows.
2. A grant of bonus credits shows its next expiry date, 90 days after the grant.
3. When the prepaid read fails, both rows read 'Unavailable', not 'None' or zero.
4. Purchased credits that expire show the amount and next date; others say they do not expire.
5. After the daily cron, expired bonus credits disappear from the card.
6. Mobile with store purchases off shows only 'Included in your plan'.
7. CLI shows 'unknown' for a purchased balance it cannot read.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Included credits reset with the plan period, so their expiry is the reset time on the monthly bar [inferred from creditWindow(..., usageResetAt) at managed-usage-summary-service.ts:165-171].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show bonus credits and expiry in CLI, VS Code and Chrome.
- [proposed] Let mobile show bonus credits and their expiry even when it sells nothing, since they are read-only account facts.
- [proposed] Add one line on the web card stating the plan credits and reset date next to bonus and purchased.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | getManagedUsageSummary credits block | `apps/web/lib/services/managed-usage-summary-service.ts` | Builds credit windows, purchased, bonus and purchase_expiry. |
| service | bonus-credit-service | `apps/web/lib/services/bonus-credit-service.ts` | Grant, revoke, expire and read prepaid balances and lots. |
| table | prepaid_credit_balances_microusd and prepaid_credit_lots_microusd (database functions) | `apps/web/lib/services/bonus-credit-service.ts` | Read model for balances and lots (lines 169-181). |
| job | expire-bonus-credits cron | `apps/web/app/api/cron/expire-bonus-credits/route.ts` | Daily sweep of lapsed bonus lots (schedule in vercel.json:34-35). |
| service | spendable-credits | `apps/web/lib/server/spendable-credits.ts` | Spendable cents and overage flags (imported at summary service line 35). |
| service | credit-service | `apps/web/lib/services/credit-service.ts` | Plan credit balance for the period. |
| other | usage-credits | `apps/web/lib/billing/usage-credits.ts` | creditWindow and resolvePlanCreditAllowance. |
| schema | ManagedUsageCredits | `packages/contracts/types/src/managed-usage-balance.ts` | Wire type with bonus, purchased and purchase_expiry (lines 45-76). |
| component | CreditBalancesCard, bonusRow, purchasedRow | `apps/web/features/settings/sections/UsageSection.tsx` | Web credit card. |
| hook | spendableCreditsNow | `apps/web/lib/hooks/useManagedUsageSummary.ts` | Helper that sums spendable credits. |
| component | CreditBalancesCard (mobile) | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile credit card with the nativePurchases gate (lines 411-434). |
| config | storePurchases.json | `apps/mobile/src/features/billing/storePurchases.json` | nativePurchases flag, currently false. |
| service | saveUsageOverage and fetchUsageOverage | `apps/mobile/services/usage.ts` | Mobile usage credits switch against /api/billing/overage. |
| service | purchased_line | `apps/cli/src/usage_summary.rs` | CLI purchased credits line. |
| other | buildPlanUsage credits block | `apps/extension-vscode/src/features/settings/SettingsPanel.ts` | VS Code credits balance row. |
| other | purchasedCreditsView | `apps/extension/src/features/side-panel/usageWindows.ts` | Chrome balance and spendable flag. |
| component | BillingSection credits area | `apps/web/features/settings/sections/BillingSection.tsx` | Credit history and keep-going switch (calls /api/billing/credit-history and /api/billing/overage). |
| test | bonus cron test | `apps/web/app/api/cron/expire-bonus-credits/route.test.ts` | Cron behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Usage page reads GET /api/usage. | device | apps/web/lib/hooks/useManagedUsageSummary.ts:73 |
| Server reads the prepaid balances and lots through two database functions. On failure it logs and treats balances as unknown. | our servers | apps/web/lib/services/bonus-credit-service.ts:164-181; apps/web/lib/services/managed-usage-summary-service.ts:56-66 |
| Server returns purchased.remaining (null when unknown), bonus.remaining and next_expiry_at, and purchase_expiry. | our servers | apps/web/lib/services/managed-usage-summary-service.ts:194-207 |
| Client renders the rows, with 'Unavailable', 'None' or an amount. | device | apps/web/features/settings/sections/UsageSection.tsx:370-405 |
| Each day the cron expires bonus lots past their date. | our servers | apps/web/app/api/cron/expire-bonus-credits/route.ts:21; vercel.json:34-35 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Bonus grants and purchased credit lots | Server database lots read by prepaid_credit_lots_microusd; exact table names not opened. | Server is the source. Apps read it. | Bonus lots expire 90 days after grant and the daily sweep takes back lapsed amounts (apps/web/lib/services/bonus-credit-service.ts:7, 125-160). Purchased credits may expire where local law requires (apps/web/features/settings/sections/UsageSection.tsx:402). |

**Models and providers.** No model or provider reads this. Credits are an account balance. Spend is priced per model by the rate card elsewhere (see SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Credits belong to the user account (apps/web/lib/services/bonus-credit-service.ts:164-165). |
| Permissions | User-scoped read. Granting bonus credits is a server and admin action, not part of this page (apps/web/app/api/admin/usage-promotions/__tests__/route.test.ts exists; contents not opened). |
| Subscription | Paid non-contract plans on web. A purchase needs a plan that can buy credits; the CLI and others point to web billing. Billing sales are limited by the owner's decisions (see unknowns). |
| Limits and metering | Bonus expiry 90 days. Cron processes at most 500 accounts per run (apps/web/app/api/cron/expire-bonus-credits/route.test.ts:55). Purchased expiry follows the account's region rules. |
| Feature flags | Mobile nativePurchases false (apps/mobile/src/features/billing/storePurchases.json:2). Summary field self_serve says whether the holder buys credits themselves (packages/contracts/types/src/managed-usage-balance.ts:53-55). |
| Model compatibility | none found in the code. |
| Provider restrictions | Purchases go through the billing provider or app stores; purchase detail is outside this feature (see SYS-subscriptions-entitlements-and-usage). |
| Local mode | Local mode uses no credits. CLI refuses the read in Local and own-key modes (apps/cli/src/usage_summary.rs:343-357). The support article says Local mode and own key do not draw on a managed allowance (doc: apps/web/content/support/usage-and-credits.md). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Card is not drawn until the summary has credits. | apps/web/features/settings/sections/UsageSection.tsx:1445 |
| Prepaid read fails | Rows read 'Unavailable' with a refresh hint. CLI prints 'unknown'. | apps/web/features/settings/sections/UsageSection.tsx:371-373, 392-396; apps/cli/src/usage_summary.rs:696-699 |
| No bonus credits | 'None' with 'Credits from referrals and promotions show here with the date they expire.' | apps/web/features/settings/sections/UsageSection.tsx:374-379 |
| Bonus with no expiry date | 'No expiry date recorded.' | apps/web/features/settings/sections/UsageSection.tsx:380-385 |
| Purchased credits that expire | Amount and next date shown, the rest 'don't expire'. | apps/web/features/settings/sections/UsageSection.tsx:398-404 |
| Period unallocated | Monthly remaining shows 0 and usage_allocation is 'pending'. | apps/web/lib/services/managed-usage-summary-service.ts:138, 165-167, 237 |
| Cron hits its ceiling or fails some accounts | The route reports it rather than hiding it. | apps/web/app/api/cron/expire-bonus-credits/route.test.ts:68 |
| Duplicate grants | Grants carry a referenceId. Duplicate handling not read. | apps/web/lib/services/bonus-credit-service.ts:13-21 |
| Accessibility | Balances use a definition list (dt, dd) on web. | apps/web/features/settings/sections/UsageSection.tsx:358-368, 429-432 |
| Offline | not handled in the code beyond error handling. | searched apps/web/features/settings/sections/UsageSection.tsx and apps/mobile/src/features/settings/cloud-usage/index.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/managed-usage-summary.credits.test.ts`: Credit windows per plan, regional budgets, lapsed plan, unreadable bonus and purchased balances as unknown.
- `apps/web/app/api/usage/__tests__/route.test.ts`: Spendable balance and unknown on lookup failure.
- `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx`: Bonus and purchased in spend order, no currency, local-law expiry wording.
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Purchased and bonus shown to a paid account while the store sells credits.
- `apps/mobile/__tests__/UsageLimitsInfoAndCredits.test.tsx`: Usage credits card: balance in credits, optimistic switch, revert on failure.
- `apps/web/app/api/cron/expire-bonus-credits/route.test.ts`: Secret check, 500-account ceiling, failure reporting.
- `apps/extension/__tests__/usage-windows.test.ts`: Chrome purchased balance and spendable flag, unknown not zero.
- `apps/cli/src/usage_summary.rs`: Inline tests of render, including purchased line (individual cases not verified).

**Test scenarios**

- **Bonus credit grant**
  1. Grant a promo credit to a paid test account.
  2. Open web Usage.
  - Expected: 'Bonus credits' shows the amount with 'Next expiry' 90 days after the grant.
- **Bonus lapse**
  1. Move a bonus lot past its expiry in a test database.
  2. Run the cron with the secret.
  3. Reload Usage.
  - Expected: Bonus credits no longer include the lot.
- **Unknown balance**
  1. Make the prepaid database function fail.
  2. Open Usage.
  - Expected: Both rows read 'Unavailable'; the log shows 'Prepaid credit lookup failed; reporting unknown balances'.
- **Mobile with purchases off**
  1. Open mobile Usage as a paid user on the current build.
  - Expected: Only 'Included in your plan' appears in Credit balances.
- **CLI purchased line**
  1. Run the usage command as a paid user with purchased credits.
  - Expected: 'Purchased credits: <n>, overage on' or 'off'.
- **Spend order**
  1. Hold bonus and purchased credits.
  2. Exhaust a plan window and use the product.
  - Expected: Bonus credits fall first, then purchased, matching the note on the card.

**Where to look when it fails**

- Log 'Prepaid credit lookup failed; reporting unknown balances' (apps/web/lib/services/managed-usage-summary-service.ts:63).
- Cron response summary users, expiredMicrousd, failed, remaining.
- Database functions prepaid_credit_balances_microusd and prepaid_credit_lots_microusd.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)
- CLI: [70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md)
- VS Code: [70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **Mobile hides bonus and purchased credits while store purchases are off.** Affects: Mobile users with bonus credits. Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:419-421; apps/mobile/src/features/billing/storePurchases.json:2. Work needed: Decide whether read-only bonus credits should show even without sales.
- **CLI, VS Code and Chrome do not show bonus credits or expiry.** Affects: CLI, VS Code, Chrome users. Evidence: apps/cli/src/usage_summary.rs:41-48; apps/extension-vscode/src/features/settings/SettingsPanel.ts:99-108; apps/extension/src/features/side-panel/usageWindows.ts:116-125. Work needed: Add the bonus and purchase_expiry fields and render them.
- **Brief marks Chrome 'done' for credits, but no balance is shown there.** Affects: Chrome users, brief readers. Evidence: no use of the balance string found in apps/extension/src/side_panel.ts. Work needed: Correct the brief or add the display.
- **Draft says purchased credits have an expiry date of their own. Code says they usually do not expire, with expiring amounts only where local law requires.** Affects: Testers. Evidence: apps/web/features/settings/sections/UsageSection.tsx:398-404. Work needed: Correct wording.
- **VS Code shows a single spendable total, not the included, purchased and bonus split.** Affects: VS Code users. Evidence: apps/extension-vscode/src/utils/api.ts:1393-1394. Work needed: Read credits.purchased and credits.bonus and show them.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-observability-and-operations
- api:GET /api/usage
- api:GET /api/billing/overage
- table:managed_usage_requests
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- F082-02

## Unknown

- Names of the tables behind the prepaid database functions.
- How duplicate bonus grants with the same reference are handled.
- Which purchased credits expire and in which regions (the rule is hidden in the database function).
- Whether the Chrome side panel shows a balance elsewhere (searched side_panel.ts only for .balance).
- Current commercial status of credit sales on each surface; owner decisions on subscription sales are not in files opened here.
- What admin usage-promotions route test asserts.
