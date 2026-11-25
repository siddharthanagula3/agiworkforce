---
id: "F081-02"
type: "feature"
title: "Usage allowance and the multiplier baseline (5x, 15x)"
aliases: ["Usage allowance", "Managed usage limits", "Credits per 5 hours, week and month", "Multiplier baseline (5x, 15x)", "'x more usage than' line", "Flagship weekly cap", "MANAGED_USAGE_LIMITS", "S81.07 S81.08 S81.15"]
area: "81 Free / Basic / Pro / Max 5x / Max 20x planning structure"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S81.07", "S81.08", "S81.15"]
depends_on: ["F081-01", "F081-04", "F081-05", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "table:token_credits", "api:GET /api/usage", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F081-02 Usage allowance and the multiplier baseline (5x, 15x)

Each plan has a managed-usage allowance counted in credits over a rolling 5-hour window, a rolling week and the billing month. Paid plans state how many times more usage they give than the plan below. A separate weekly cap, 30% of the week, covers the most capable models. Ultra has no 5-hour cap.

Area: [81. Free / Basic / Pro / Max 5x / Max 20x planning structure](README.md). Requirement items: [S81.07](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8107), [S81.08](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8108), [S81.15](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8115).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Defines credit allowances per plan and window (packages/contracts/types/src/managed-usage-limits.ts:31-87), derives the 'N times more usage than <plan>' copy from those numbers (lines 123-215), and refuses a Cloud request that would pass a window with a reset time (apps/web/lib/services/managed-usage-request-service.ts:442-460, 473).

**Why it exists.** So the plans differ in a stated, checkable amount of usage, and a person who hits a limit is told which window and when it refills.

**Who uses it.** People on a paid or Free Cloud plan; support staff explaining a refusal; engineers changing allowances; testers.

**Problems it solves**

- Vague plan copy such as 'more usage' with no baseline
- A multiplier that does not match the real allowance ratio
- One heavy burst emptying a whole month
- Flagship-class models using the whole weekly budget

**Use cases**

- Read '5x more usage than Basic' under Premium on the pricing page
- Open Settings > Usage on web to see used and remaining credits per window
- Run the CLI usage command to see 5-hour, weekly, monthly and flagship weekly lines
- Hit the flagship weekly cap and be told to choose a standard model, wait or upgrade

## 2. User experience

**Where to find it**

- Web: Pricing page, usage comparison line on each plan card and row 'Cloud usage' in the table (apps/web/app/pricing/page.tsx:793; apps/web/features/billing/lib/plan-card-copy.ts:107)
- Web: Settings > Usage; card heading 'Plan usage limits' on paid plans, 'Upgrade for higher capacity' with an Upgrade button on Free (apps/web/features/settings/sections/UsageSection.tsx:1313,1224)
- Desktop (public Electron app): same web pages
- Mobile: plans screen usage line; Settings > Subscription > 'Usage' row (apps/mobile/src/features/settings/plans/index.tsx:62; apps/mobile/src/features/settings/cloud-billing/index.tsx:392)
- CLI: commands 'usage' and 'plans' (apps/cli/src/lib.rs:1057-1060; apps/cli/src/usage_summary.rs:564)
- VS Code: command 'Code: Compare Plans' and account usage command (apps/extension-vscode/src/core/commandSetup.ts:2175)
- Chrome: usage shown in the side panel via the managed usage endpoint (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:121 constant MANAGED_USAGE_ENDPOINT); pricing copy unverified

**Before you start**

- Signed-in AGI account with Cloud chat
- A plan with a managed allowance; Local and own-key tiers have none (managed-usage-limits.ts:31-34)

**Screens and controls**

- Web usage meters for 5-hour, weekly, flagship weekly and monthly windows with 'Resets ...' text (UsageSection.tsx:1226,1363-1383)
- Web 'Resets' card with 'Use reset' button, confirm 'Use your reset?' (UsageSection.tsx:437-506)
- Web pricing footnote '*' on Ultra explaining other limits still apply (apps/web/app/pricing/page.tsx:905)
- CLI lines '5-hour window', 'Weekly', 'Monthly', 'Flagship weekly' with used, allowance, remaining and reset time (apps/cli/src/usage_summary.rs:564-590)

**Journey**

1. Open the pricing or plans view and read the usage line under a plan
2. Use Cloud chat; the server reserves credits against the 5-hour, weekly, flagship and monthly windows
3. As usage nears the limit the response carries a quota warning header at 80% and 95% (apps/web/lib/server/managed-usage-policy.ts:248-291)
4. When a window is full the request is refused with a code and a reset time; the app shows the message and an upgrade option

**What the person sees and gets**

- Refusal messages: 'Your rolling 5-hour usage limit is reached...', 'Your rolling weekly usage limit is reached...', 'Your rolling flagship weekly usage limit is reached. Choose a standard model, wait for earlier usage to leave the window, or upgrade for a higher limit.' with HTTP 429 (apps/web/lib/services/managed-usage-request-service.ts:442-460)
- Catalog card messages per code with upgrade and reset flags (packages/contracts/types/src/billing-catalog.ts:884-990)
- Reset time for each code chosen by managedQuotaResetAt (billing-catalog.ts:1005)

**Settings**

- Extra usage credits switch and monthly cap on web Billing (see other areas); refusal text changes when purchased credits are on (managed-usage-request-service.ts:524-540)
- Reset grants card on Usage (UsageSection.tsx:437)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Allowance table (credits: 5-hour / week / month): Free 200/1,500/2,000; Basic 10/100/400; Premium 50/500/2,000; Max 250/2,500/10,000; Ultra no cap/5,000/20,000; Team equals Premium per seat; Team Premium equals Max per seat; Enterprise unlimited (managed-usage-limits.ts:31-87)
- Comparison copy is computed from the table: Premium '5x more usage than Basic', Max '5x more usage than Premium', Ultra '10x more weekly usage than Premium', Team 'Same usage as Premium for every seat' (managed-usage-limits.ts:158-215; test managed-usage-limits.test.ts:98-120)
- A multiplier is shown only if it is a whole number that holds window by window; otherwise nothing or only the windows that qualify (managed-usage-limits.ts:179-196)
- Server computes the three windows and the flagship weekly cap (30% of the weekly allowance) and passes them to the reservation (managed-usage-policy.ts:117-135; managed-usage-request-service.ts:794-798)
- Refusal codes and messages for 5-hour, weekly and flagship windows, each with the reset time (managed-usage-request-service.ts:442-460,473-500)
- Ultra has a null 5-hour cap, passed as no session ceiling (managed-usage-policy.ts:121-125; doc: docs/product/commercial.md 'Plan Presentation And Usage Windows')
- Web usage section, CLI usage and plans, VS Code usage and comparison, mobile plans usage line all read the shared table or the server usage endpoint (see implementation map)

**Incomplete**

- Allowance numbers are scaled by revenue ratio for non-USD web payers and store channels, so an INR or store subscriber's real windows can differ from the base-table multiplier text (packages/contracts/types/src/billing-revenue.ts:113-145; apps/web/lib/server/managed-usage-policy.ts:45-60)
- The flagship weekly cap is computed for any plan with a weekly budget, while display shows a flagship meter only for Premium, Max, Ultra and seat plans (managed-usage-policy.ts:117-119; managed-usage-limits.ts:254-262); whether Premium can ever hit it is not established
- Chrome pricing and usage copy is marked unverified in the brief and was not traced here

**Present but disconnected or switched off**

- Mobile shows the 'x more usage' line only when store purchases are on; otherwise it prints nothing for paid plans (apps/mobile/src/features/settings/plans/index.tsx:62-68)

**Not available**

- No multiplier is shown for Free or Basic (no baseline) and none for Enterprise (managed-usage-limits.ts:158-166; test managed-usage-limits.test.ts:110-124)
- Web Usage hides all meters on Free and shows only an Upgrade button (UsageSection.tsx:1224-1330)

## 4. Required behaviour

**Established requirements**

- Pricing states what 1x means: the baseline plan behind 5x and 15x and its concrete allowance. (source: S81.07 (brief))
- Plan copy names which allowance a multiplier scales (managed-usage credits per 5-hour, weekly and monthly window). (source: S81.08 (brief))
- Plans carry caps specific to a model class (flagship models get their own weekly cap), shown to users and enforced on admission. (source: S81.15 (brief))
- Ultra has no rolling 5-hour cap; its weekly and monthly allowances stay enforced; a zero ceiling means zero usage. (source: doc: docs/product/commercial.md 'Plan Presentation And Usage Windows')
- A plan's worst-case month of usage costs at most half its price. (source: doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-01 (test managed-usage-limits.test.ts:27))
- The turn that crosses a cap finishes on the plan; the billing period has a hard edge. (source: doc: docs/product/commercial.md lines 243-247)

**Acceptance criteria**

1. Premium card shows '5x more usage than Basic'; Max shows '5x more usage than Premium'; Ultra shows '10x more weekly usage than Premium' and 'No session limit'
2. Team shows 'Same usage as Premium for every seat'; Team Premium seat shows 5x the usage of a Standard seat
3. Spending past the 5-hour allowance on Premium returns HTTP 429 with code rolling_five_hour_limit_reached and a reset time
4. Ultra is never refused with rolling_five_hour_limit_reached
5. Spending flagship-class usage past 30% of the weekly allowance returns flagship_weekly_limit_reached with a standard-model suggestion
6. Free and Basic show no multiplier line
7. Web Usage on Free shows an Upgrade button and no meters

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The multiplier copy should be computed from the same revenue-scaled limit the person is held to, or be labelled as the base table; today it uses the base table only [inferred from managed-usage-limits.ts:123-145 and billing-revenue.ts:128-145]
- The 5-hour and weekly windows are rolling and the monthly window is the billing period, from window hours 5 and 168 and the credit period (apps/web/lib/server/capability-limit-resets.ts:7-8) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Name Ultra by its real ratio (10x weekly and monthly, no session cap) in every doc and in the knowledge base, and stop calling it 15x or 20x
- [proposed] Show the person's own scaled numbers on the usage screen, so a store or INR subscriber sees what they actually hold
- [proposed] Make the flagship cap apply only where hasFlagshipWeeklyAllowance is true, or document why it applies to every plan

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | MANAGED_USAGE_LIMITS | `packages/contracts/types/src/managed-usage-limits.ts` | Credits per window per plan (lines 31-87) |
| service | compareManagedUsage and managedUsageComparisonLines | `packages/contracts/types/src/managed-usage-limits.ts` | Multiplier baseline map and copy (lines 158-215) |
| service | hasFlagshipWeeklyAllowance and getPlanCreditAllowance | `packages/contracts/types/src/managed-usage-limits.ts` | Which plans display a flagship weekly allowance (lines 254-262, 304) |
| service | effectiveManagedUsageLimit | `packages/contracts/types/src/billing-revenue.ts` | Scales allowances by revenue ratio (lines 113-145) |
| service | managed-usage-policy | `apps/web/lib/server/managed-usage-policy.ts` | Per-plan window caps in cents and microusd, flagship cap, quota warning header |
| service | managed-usage-request-service | `apps/web/lib/services/managed-usage-request-service.ts` | Reservation with caps and refusal codes and messages (lines 442-500, 794-798) |
| config | MANAGED_QUOTA_BLOCKS and managedQuotaResetAt | `packages/contracts/types/src/billing-catalog.ts` | Card text, flags and reset field per refusal code (lines 884-1020) |
| config | capability-limit-resets | `apps/web/lib/server/capability-limit-resets.ts` | Window hours 5 and 168 (lines 7-8) |
| service | free-trial-service | `apps/web/lib/services/free-trial-service.ts` | Free plan windows use the same budgets (lines 36-42) |
| screen | UsageSection | `apps/web/features/settings/sections/UsageSection.tsx` | Web meters, resets, free upsell (lines 1224-1451) |
| service | plan-card-copy usageComparisonCopy | `apps/web/features/billing/lib/plan-card-copy.ts` | Web card usage lines (line 107) and explainer (line 366) |
| screen | PricingPage usage row | `apps/web/app/pricing/page.tsx` | 'Cloud usage' row, Ultra footnote (lines 793-805, 905) |
| endpoint | GET /api/usage | `apps/web/app/api/usage/route.ts` | Account usage for clients (CLI path constant apps/cli/src/usage_summary.rs:15) |
| command | CLI usage_summary | `apps/cli/src/usage_summary.rs` | Account usage lines incl. flagship weekly (line 564-590) |
| command | CLI plans | `apps/cli/src/plans.rs` | Credits per window per plan parsed from the contract file (lines 15-60, 176-196) |
| command | VS Code planUsagePhrase | `apps/extension-vscode/src/features/account-auth/planComparison.ts` | Usage phrase per plan (line 35) |
| screen | Mobile plans usageLine | `apps/mobile/src/features/settings/plans/index.tsx` | Usage line per plan (line 62) |
| test | managed-usage-limits tests | `packages/contracts/types/src/__tests__/managed-usage-limits.test.ts` | Economics, Free window numbers, Ultra no session cap, multiplier copy |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends a Cloud chat turn with the account token. | device | apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:139 |
| The auth gate resolves the plan and entitlement; a lapsed paid plan is served as Free. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:341-352 |
| The reservation builds the 5-hour, weekly and flagship caps for the plan and its sold-under catalog version, scaled by the revenue ratio. | our servers | apps/web/lib/server/managed-usage-policy.ts:45-60; apps/web/lib/services/managed-usage-request-service.ts:794-798 |
| The database reserves credits for the turn or declines with a reason (session, weekly, flagship, monthly). | our servers | apps/web/lib/services/managed-usage-request-service.ts:442-460,797 |
| On decline the server returns 429 or 402 with a code and reset time; the client shows the message. | our servers | apps/web/lib/services/managed-usage-request-service.ts:442-460; packages/contracts/types/src/billing-catalog.ts:1005-1020 |
| Clients read usage and windows from the usage endpoint and render meters. | device and our servers | apps/cli/src/usage_summary.rs:15,564; apps/web/features/settings/sections/UsageSection.tsx:1217-1260 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Credit period ledger with used credits and the catalog version | table token_credits | Server; read by all apps through usage endpoints | One row per billing period (apps/web/db/neon/0300_plan_catalog_version.sql) |
| Per-request usage reservations | managed usage request records in the database (table name not read) | Server only | unknown |

**Models and providers.** Credits are charged from provider cost of the model used. A model's class (flagship or standard) decides whether the flagship weekly window also applies (apps/web/lib/services/managed-usage-request-service.ts:797). Credits are spent the same whichever provider serves the model; per-provider rates are in the model catalog (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account on a Cloud plan. Local and own-key use has no AGI allowance. |
| Permissions | Anyone on the plan can see their own usage. Team seat members see their own allowance; the workspace spend cap is set by an admin (see F081-05). |
| Subscription | All plans from Free up have an allowance. Enterprise is unlimited under contract (managed-usage-limits.ts:84). |
| Limits and metering | Windows: 5 hours rolling, 7 days rolling, billing month; flagship weekly = 30% of weekly credits (managed-usage-limits.ts:27). Quota warnings at 80% and 95% (managed-usage-policy.ts:243-244). A reset grant can refill the 5-hour and weekly windows (UsageSection.tsx:479-482). |
| Feature flags | None found in the code that turn the windows on or off per environment; extra-usage credits are a separate opt-in (see other areas). |
| Model compatibility | Flagship-class models are the only ones counted in the flagship weekly window; they need Max, Ultra, Team Premium or Enterprise to select (packages/contracts/types/src/model-catalog.ts:2196-2243). |
| Provider restrictions | None found in the code; allowances are provider agnostic. |
| Local mode | No AGI plan limit applies to Local or own-key requests (apps/extension-vscode/src/core/commandSetup.ts:2318-2319). The catalog gives local-only and byok zero managed usage (managed-usage-limits.ts:31-34). The CLI 'usage' command reports the usage as unavailable in local-only mode (apps/cli/src/usage_summary.rs:340-352,523). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Over the 5-hour limit | HTTP 429 code rolling_five_hour_limit_reached with reset time from the oldest usage in the window | apps/web/lib/services/managed-usage-request-service.ts:442-447,473-515 |
| Over the flagship cap | 429 flagship_weekly_limit_reached with a suggestion to pick a standard model | apps/web/lib/services/managed-usage-request-service.ts:454-459; billing-catalog.ts:942 |
| Unlimited plan | No multiplier shown and caps are null | packages/contracts/types/src/managed-usage-limits.ts:123-135; apps/web/lib/server/managed-usage-policy.ts:121-135 |
| Ultra session window | Usage views omit the session meter and add 'No session limit' | apps/web/features/billing/lib/plan-card-copy.ts:107-110; doc: docs/product/commercial.md |
| Free plan on web | No meters, only 'Upgrade for higher capacity' | apps/web/features/settings/sections/UsageSection.tsx:1313-1330 |
| Free plan in CLI plans | CLI prints the Free credit numbers with 'free models only' | apps/cli/src/plans.rs:176-190 |
| Usage not provisioned yet | CLI prints 'Allowance: not provisioned yet' | apps/cli/src/usage_summary.rs:571-573 |
| Retry | Not handled in the code beyond waiting for the reset time; the 'free_pool' alternative offered after a paid-plan refusal is not traced | apps/web/lib/services/managed-usage-request-service.ts:473-500 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/managed-usage-limits.test.ts`: Plan economics ceiling, Free window numbers, same table for versions 1 to 4, Ultra no session cap, '5x' and '10x weekly' copy, baselines (test titles read)
- `packages/contracts/types/src/__tests__/billing-revenue.test.ts`: Revenue scaling; contents not read
- `apps/web/lib/server/managed-usage-policy.test.ts`: Server policy caps; contents not read
- `apps/web/lib/server/__tests__/managed-usage-policy.revenue.test.ts`: Revenue-scaled caps; contents not read
- `apps/web/lib/services/managed-usage-request-service.test.ts`: Reservation and refusals; contents not read
- `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx`: Usage section; contents not read
- `apps/web/features/billing/lib/__tests__/plan-display-revenue.test.ts`: Plan display with revenue context; contents not read
- `apps/cli/src/plans.rs`: Credits per window and Ultra no 5-hour limit (lines 418-437)
- `apps/web/app/pricing/__tests__/free-plan-allowance-locale-claims.test.ts`: Free allowance claims in locales; contents not read

**Test scenarios**

- **Multiplier copy**
  1. Open /pricing individual tab
  2. Read the usage line on Premium, Max and Ultra
  - Expected: 5x more usage than Basic; 5x more usage than Premium; 10x more weekly usage than Premium plus 'No session limit'
- **5-hour refusal**
  1. On a Premium test account, send Cloud turns until the 5-hour allowance is spent
  - Expected: 429 with rolling_five_hour_limit_reached, message names the window, reset time shown
- **Ultra has no session cap**
  1. On an Ultra test account fill what a Premium account would exhaust in 5 hours
  - Expected: Not refused by the 5-hour window; weekly cap still applies
- **Flagship cap**
  1. On a Max test account, use only a flagship-class model until about 30% of the weekly allowance is used
  - Expected: 429 flagship_weekly_limit_reached and a prompt to choose a standard model
- **Store or INR scaling**
  1. Compare usage allowances on a USD web subscription and an INR subscription of the same plan
  - Expected: Shows whether the allowance is scaled and whether the on-screen multiplier still matches

**Where to look when it fails**

- Error codes rolling_five_hour_limit_reached, rolling_weekly_limit_reached, flagship_weekly_limit_reached, insufficient_credits (managed-usage-request-service.ts:410-460)
- Response header X-Quota-Warning (apps/web/lib/cors.ts:83; managed-usage-policy.ts:248)
- table token_credits rows for the user
- GET /api/usage output

**Hands-on test plans**

- Web: [70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Desktop: [70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Mobile: [70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- CLI: [70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- VS Code: [70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Chrome: [70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md)

## 10. Gaps and dependencies

- **Ultra's real multiple is 10x weekly and monthly with no session cap, which matches neither the id max_15x nor the area name 'Max 20x'** Affects: Docs, support, testers; all apps that show the copy. Evidence: packages/contracts/types/src/managed-usage-limits.ts:63-69; __tests__/managed-usage-limits.test.ts:103-108. Work needed: Standardise the name used in docs and tests; the on-screen copy is already correct
- **Multiplier copy is computed from the base table, while INR and store subscribers get scaled allowances** Affects: Non-USD web and store subscribers. Evidence: packages/contracts/types/src/billing-revenue.ts:113-145; apps/web/lib/server/managed-usage-policy.ts:45-60. Work needed: Decide whether to scale the copy or state that it is for the base price
- **Flagship weekly cap is enforced for every plan with a weekly budget but displayed only for Premium and up** Affects: Free and Basic users if they can reach a flagship-class route; Premium users. Evidence: apps/web/lib/server/managed-usage-policy.ts:117-119; packages/contracts/types/src/managed-usage-limits.ts:254-262. Work needed: Establish whether Free and Basic can ever route to flagship-class models; align code and display
- **Free plan shows credit numbers in the CLI and a hidden meter on web** Affects: Free users on CLI versus web. Evidence: apps/cli/src/plans.rs:176-190; apps/web/features/settings/sections/UsageSection.tsx:1313. Work needed: Owner decision on what Free usage screens show, then align apps
- **Free credit numbers are larger than Basic in every window by design, so there is no multiplier from Free to Basic** Affects: Pricing comprehension. Evidence: packages/contracts/types/src/__tests__/managed-usage-limits.test.ts:120-124. Work needed: Make sure pricing copy explains Free is free models only (mobile does: plans/index.tsx:64)
- **Chrome plan and usage copy unverified; reset behaviour for the 'free_pool' alternative not traced** Affects: Chrome users; people hitting a limit on a paid plan. Evidence: brief S81.07, S81.08; apps/web/lib/services/managed-usage-request-service.ts:473-500. Work needed: Verify Chrome side panel copy; trace plan-limit-alternative.ts

**Depends on**

- F081-01
- F081-04
- F081-05
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- table:token_credits
- api:GET /api/usage
- mode:cloud

## Unknown

- Whether Free and Basic can reach flagship-class routes
- What the free_pool alternative does after a paid-plan refusal
- Name of the table that stores per-request reservations
- Real INR and store ratios in production
- Chrome side panel usage and pricing copy
