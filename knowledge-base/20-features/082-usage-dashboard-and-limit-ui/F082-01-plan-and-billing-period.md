---
id: "F082-01"
type: "feature"
title: "Plan and billing period"
aliases: ["Current plan", "Plan label", "Billing period", "Plan and billing period", "S82.01", "S82.02", "plan_tier", "period_start / period_end", "Renews on / Current period ends"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S82.01", "S82.02"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-shared-ui-and-design", "api:GET /api/usage", "api:GET /api/me", "table:managed_usage_requests", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:apps/web/lib/services/managed-usage-summary-service.ts", "mode:cloud", "plan:free"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-01 Plan and billing period

Tells a signed-in person which plan their AGI Subscription account is on and when the current billing period ends or renews. The server computes the plan on every read. Web, mobile, CLI, VS Code and Chrome each show the plan in their own layout. Only web Billing and mobile Billing show period dates.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.01](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8201), [S82.02](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8202).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the plan name and the billing period or renewal date taken from the server. The managed usage summary endpoint returns plan_tier, effective_plan_tier, subscription_status, period_start and period_end (apps/web/lib/services/managed-usage-summary-service.ts:211-221). Each app turns those fields into its own labels.

**Why it exists.** A person must know what they are paying for and when it renews before they judge a limit or a charge. The brief says every signed-in surface shows the current plan read from the server and that users can see when it renews or ends (doc: knowledge-base/data/area-briefs/082-usage-dashboard-and-limit-ui.md, S82.01 and S82.02). The plan is never kept as a saved copy on the client.

**Who uses it.** Any signed-in account on Cloud mode. Free, paid individual and workspace-contract accounts all see it, in different forms.

**Problems it solves**

- A person cannot tell which plan limits apply to them.
- A lapsed or unpaid subscription looks like a working one. The CLI prints a status line and the reason (apps/cli/src/usage_summary.rs:639-671).
- Different apps could show different plans if each kept its own copy. All of them read the same server answer.

**Use cases**

- A subscriber opens Settings, Billing on web and reads 'Renews on' with the date (apps/web/features/settings/sections/BillingSection.tsx:822-826).
- A mobile user opens Usage and sees '<plan> plan' above the period meter (apps/mobile/src/features/settings/cloud-usage/index.tsx:1212).
- A CLI user runs the usage command and reads 'Plan:' and 'Subscription:' lines (apps/cli/src/usage_summary.rs:564-567).
- A VS Code user opens the account menu and sees the plan label in the usage group (apps/extension-vscode/src/core/commandSetup.ts:2236-2240).

## 2. User experience

**Where to find it**

- Web and desktop (the public Desktop shows the hosted web app, doc: AGENTS.md section 5): Settings, Usage shows the plan inside the allowance line under the heading 'Plan usage limits' (apps/web/features/settings/sections/UsageSection.tsx:1245-1254, 1313-1315). The plan card with 'Free plan' or '<plan> plan', and the rows 'Renews on', 'Ends on', 'Trial ends on' or 'Current period ends', are on Settings, Billing (apps/web/features/settings/sections/BillingSection.tsx:67-72, 737-739, 822-826).
- Mobile: Settings, Usage ('Usage' title) shows '<plan> plan' in a card header and 'Resets <date>' under the period meter (apps/mobile/src/features/settings/cloud-usage/index.tsx:937-939, 1212). Settings, Cloud billing shows 'Renews', 'Trial ends' or 'Access ends' with a date (apps/mobile/src/features/settings/cloud-billing/index.tsx:367-370).
- CLI: the usage command and the /usage slash command print 'Account usage', 'Plan: ...' and 'Subscription: ...' (apps/cli/src/lib.rs:1057, 7679-7685; apps/cli/src/usage_summary.rs:564-567).
- VS Code extension: the account quick pick and the settings panel show the plan label (apps/extension-vscode/src/core/commandSetup.ts:2236-2240; apps/extension-vscode/src/features/settings/SettingsPanel.ts:88-92).
- Chrome extension: the plan name comes from the account summary the side panel loads (apps/extension/src/side_panel.ts:13399-13408). No plan card or period date was found in the side panel [inferred from the missing render, see unknowns].

**Before you start**

- Signed in to an AGI account. Mobile must be in Cloud mode (apps/mobile/src/features/settings/cloud-usage/index.tsx:901-903, 1038).
- CLI needs a stored AGI login. Without one, or in Local or own-key (BYOK) mode, it prints an 'Unavailable' reason (apps/cli/src/usage_summary.rs:343-357, 557-562).

**Screens and controls**

- Web Usage page: heading 'Usage', a 'Billing history' link, a 'Refresh' button and a 'Last updated' line (apps/web/features/settings/sections/UsageSection.tsx:1268-1297, 1423-1436).
- Web Billing page: plan card with 'Compare plans' and 'Upgrade plan' or 'Adjust plan' buttons (apps/web/features/settings/sections/BillingSection.tsx:766-796).
- Mobile Usage screen: 'Refresh usage' and 'Retry loading usage' buttons (apps/mobile/src/features/settings/cloud-usage/index.tsx:1062-1066, 1265-1270).

**Journey**

1. Open Settings on the app.
2. Open Usage (or Billing on web, Cloud billing on mobile).
3. The app asks the server for the account summary. Web: GET /api/usage through a shared hook (apps/web/lib/hooks/useManagedUsageSummary.ts:73). Mobile: GET /api/usage (apps/mobile/services/usage.ts:88-91).
4. While it loads, web shows bars as 'Unavailable' and mobile shows a spinner (apps/web/features/settings/sections/UsageSection.tsx:321; apps/mobile/src/features/settings/cloud-usage/index.tsx:1042-1046).
5. Read the plan name and, on Billing, the renewal date.

**What the person sees and gets**

- Web: 'Last updated: <time>' with '(refresh failed)' when the last refresh failed (apps/web/features/settings/sections/UsageSection.tsx:1256-1263).
- Web: an alert box with the error text when the first read fails (apps/web/features/settings/sections/UsageSection.tsx:1301-1308).
- Web: when a paid period ended and has not renewed, the period meter says 'Your billing period ended and has not renewed yet, so there are no credits to use. Check Billing.' (apps/web/features/settings/sections/UsageSection.tsx:299-300, 1211-1214, 1393-1395).
- Mobile: 'Updated <time>' and a red error box with 'Retry' (apps/mobile/src/features/settings/cloud-usage/index.tsx:1214-1217, 1048-1088).
- CLI: 'Unavailable: <reason>' or 'session expired, run `agi login`' (apps/cli/src/usage_summary.rs:303-312, 557-562).

**Settings**

- None specific to this feature. Plan changes happen on Billing (apps/web/features/settings/sections/BillingSection.tsx:766-796).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The server builds plan_tier from the subscription row and effective_plan_tier from the entitlement bundle, plus seat type, period_start, period_end and subscription_status (apps/web/lib/services/managed-usage-summary-service.ts:68-90, 211-221).
- GET /api/usage is authenticated, rate limited under the 'credits-balance' key and accepts API keys with the usage:read scope (apps/web/app/api/usage/route.ts:15-40).
- Web reads the summary through one shared hook for all components on a page and re-reads it every 5 minutes while the user is active (apps/web/lib/hooks/useManagedUsageSummary.ts:22, 44-108).
- Web Billing shows the plan card and the period row with trial, ends, renews or period wording (apps/web/features/settings/sections/BillingSection.tsx:67-72, 616-620, 822-826).
- Mobile Usage shows the plan label from the summary (apps/mobile/src/features/settings/cloud-usage/index.tsx:937, 1212) and Cloud billing shows the renewal date from the tier store, which reads /api/me?surface=mobile (apps/mobile/src/features/billing/store.ts:67-80; apps/mobile/src/features/settings/cloud-billing/index.tsx:126, 173-185).
- CLI prints plan and subscription status, and explains payment-failed, paused and ended subscriptions (apps/cli/src/usage_summary.rs:564-567, 639-671).
- VS Code builds a plan label from account identity or the tier (apps/extension-vscode/src/features/settings/SettingsPanel.ts:88-92; apps/extension-vscode/src/core/commandSetup.ts:2236-2240).
- Chrome reads /api/usage together with its account call and keeps subscriptionTier and accountPlanTier from the summary (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:116, 267-355).

**Incomplete**

- The web Usage page does not render the plan name as its own line or the period start and end dates. Dates are on Billing only (apps/web/features/settings/sections/UsageSection.tsx:1268-1315 has no period_start or period_end render).
- The CLI response type has no period_start or period_end fields, so the CLI shows no period dates (apps/cli/src/usage_summary.rs:66-93).
- On mobile, the Usage screen shows the period reset date for the meter, and Billing shows the renewal date. The two are on separate screens (apps/mobile/src/features/settings/cloud-usage/index.tsx:938-939; apps/mobile/src/features/settings/cloud-billing/index.tsx:367-370).
- Chrome shows no persistent plan card or period date that was found. The brief marks Chrome 'done' but the product matrix marks it unverified (doc: docs/product/surface-feature-matrix.md:249).

**Present but disconnected or switched off**

- The Tauri desktop settings has its own UsageDashboard built from local stores (apps/desktop/src/features/settings/UsageDashboard.tsx:1-20). It is retained internal code, not the public Desktop (doc: AGENTS.md section 5). No read of /api/usage was found in that file.

**Not available**

- Free plan on web and mobile: the Usage page shows only 'Upgrade for higher capacity' and an Upgrade button, no plan line or dates (apps/web/features/settings/sections/UsageSection.tsx:1313, 1319-1329; apps/mobile/src/features/settings/cloud-usage/index.tsx:969-1021).
- Workspace contract-priced plans on web: the Usage page says allowances are set by the contract and links to 'View workspace usage' (apps/web/features/settings/sections/UsageSection.tsx:1330-1339).
- Local and own-key modes have no AGI plan to show on CLI (apps/cli/src/usage_summary.rs:343-357) or mobile Usage (apps/mobile/src/features/settings/cloud-usage/index.tsx:1038).

## 4. Required behaviour

**Established requirements**

- Every signed-in surface shows the account's current plan, read from the server. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.01)
- Users can see the current billing period: when it renews or ends. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.02)
- Settings must include usage settings with current session, weekly limits and current balance. (source: doc: docs/product/requirements.md:1324-1334)
- Plan, usage, invoices and limits must reconcile with authoritative records. (source: doc: docs/product/experience-contract.md:793)
- A failed read must not claim a full allowance; the last good reading stays and is marked stale. (source: apps/web/lib/hooks/useManagedUsageSummary.ts:77-81; apps/web/features/settings/sections/__tests__/UsageFailsHonest.test.tsx:35-48)

**Acceptance criteria**

1. After a plan change on the server, a fresh read of Usage on web shows the new plan within one refresh, with no reinstall or re-login.
2. A paid account sees a renewal, end or trial date on web Billing and on mobile Cloud billing.
3. A failed read shows an error and a retry action. No bar shows a full allowance.
4. A lapsed paid period shows the 'has not renewed yet' message instead of a full meter.
5. A Free account on web and mobile sees only the upgrade prompt on Usage.
6. In Local or own-key mode the CLI refuses the read with a reason and sends no request.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- All apps should show the same plan name for the same account, because all read the same fields [inferred from the shared service and shared type].
- Chrome needs a visible plan or period element to match the other apps [inferred from the matrix marking Chrome unverified].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show plan name and period dates in one block at the top of the web and mobile Usage pages, so a reader does not have to switch to Billing.
- [proposed] Add period_start and period_end to the CLI AccountUsage type and print 'Period: <start> to <end>'.
- [proposed] Add a read-only plan line to the Chrome side panel account area.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/usage | `apps/web/app/api/usage/route.ts` | Authenticated read of the managed usage summary, rate limited as 'credits-balance', CORS enabled. |
| service | getManagedUsageSummary | `apps/web/lib/services/managed-usage-summary-service.ts` | Builds plan_tier, effective_plan_tier, seat type, period dates, subscription_status and the usage windows. |
| schema | ManagedUsageSummaryResponse | `packages/contracts/types/src/managed-usage-balance.ts` | Shared wire type and parser used by web, mobile, Chrome and VS Code. |
| hook | useManagedUsageSummary | `apps/web/lib/hooks/useManagedUsageSummary.ts` | Shared web client state, loading, error, stale flag and 5 minute re-read. |
| screen | UsageSection | `apps/web/features/settings/sections/UsageSection.tsx` | Web and hosted-desktop Usage settings page. |
| screen | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Web plan card and period-end row. |
| other | subscription-owner-presentation | `apps/web/features/billing/lib/subscription-owner-presentation.ts` | planPeriodEndKind decides the trial, ends, renews or period wording (imported at BillingSection.tsx:60-65). |
| screen | CloudUsageScreen | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile Usage screen with plan header. |
| store | useCloudUsageStore | `apps/mobile/src/features/settings/cloud-usage/store.ts` | Mobile snapshot cache keyed by account, with coalesced reads. |
| service | fetchUsageSnapshot | `apps/mobile/services/usage.ts` | Mobile GET /api/usage and projection to UsageSnapshot. |
| screen | Mobile cloud billing | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Renews, Trial ends or Access ends row. |
| store | useTierStore | `apps/mobile/src/features/billing/store.ts` | Holds tier and billingPeriodEnd, refreshed from /api/me?surface=mobile. |
| service | usage_summary | `apps/cli/src/usage_summary.rs` | CLI fetch, mode check and text render of plan and subscription. |
| command | agi usage and /usage | `apps/cli/src/lib.rs` | Top-level Usage command (line 1057, 7679) and slash commands (apps/cli/src/repl/slash_commands.rs:315). |
| service | fetchTierInfo | `apps/extension-vscode/src/utils/api.ts` | VS Code read of /api/usage (line 1544) and parse into TierInfo. |
| component | SettingsPanel buildPlanUsage | `apps/extension-vscode/src/features/settings/SettingsPanel.ts` | Builds the plan label and windows for the settings webview. |
| service | freeTrialClient | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Chrome read of /api/usage and the account call. |
| component | side_panel presentManagedUsage | `apps/extension/src/side_panel.ts` | Chrome side panel gate and banner driven by the summary. |
| config | wirePlanOf and seatTypeField | `packages/contracts/types/src` | Map the stored tier to the public plan tier and seat type (imported at managed-usage-summary-service.ts:12-13). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Usage or Billing in an app. | device | apps/web/features/settings/sections/UsageSection.tsx:1200-1201 |
| The app sends GET /api/usage with the session cookie (web) or bearer token (CLI, mobile, VS Code, Chrome). | device | apps/web/lib/hooks/useManagedUsageSummary.ts:73; apps/cli/src/usage_summary.rs:455-478 |
| The server resolves the user, reads the credit balance, entitlement bundle, spendable credits and prepaid balances in parallel, and builds the summary. | our servers | apps/web/lib/services/managed-usage-summary-service.ts:72-77 |
| The server returns plan_tier, effective_plan_tier, seat type, period_start, period_end and subscription_status. | our servers | apps/web/lib/services/managed-usage-summary-service.ts:211-221 |
| The app parses the body with the shared parser (web, mobile, VS Code, Chrome) or a Rust struct (CLI) and renders labels. | device | apps/web/lib/hooks/useManagedUsageSummary.ts:75; apps/cli/src/usage_summary.rs:62-64 |
| Mobile Cloud billing separately reads /api/me?surface=mobile for the renewal date. | device and our servers | apps/mobile/src/features/billing/store.ts:79 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plan and period fields in the summary reply | Server database (subscription and credit balance rows, table names not opened). Client keeps it in memory only on web (module state) and in a zustand store on mobile. | Not synced between devices. Each app re-reads from the server. | Client copy lives until the page or app closes. Mobile clears it on account change (apps/mobile/src/features/settings/cloud-usage/store.ts:70-73). |
| CLI tier cache | CLI local tier cache file (apps/cli/src/tier_cache.rs) | No. The CLI adopts the server plan after each read (apps/cli/src/usage_summary.rs:367). | Invalidated when the server answers 401, 402 or 403 (apps/cli/src/usage_summary.rs:480-490). |

**Models and providers.** No model or provider takes part. The plan is account data from our servers. Plan rules decide which models are allowed, but this feature only displays the plan name and dates.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account is required. API keys work for GET /api/usage with the usage:read scope (apps/web/app/api/usage/route.ts:18). |
| Permissions | Reads run on a user-scoped database connection so a person sees only their own account (apps/web/app/api/usage/route.ts:9, 18). |
| Subscription | All plans can read the plan. Free sees only an upgrade prompt on web and mobile. Contract-priced plans see a workspace link on web (apps/web/features/settings/sections/UsageSection.tsx:1319-1339). |
| Limits and metering | The endpoint is rate limited under the 'credits-balance' key (apps/web/app/api/usage/route.ts:39). The exact limit is configuration and was not opened (unknown). |
| Feature flags | Mobile: NATIVE_PURCHASES_AVAILABLE, read from storePurchases.json, is false in the current file and hides purchase and upgrade controls (apps/mobile/src/features/billing/storePurchases.json:2; apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3). |
| Model compatibility | None found in the code. Plan display does not depend on a model. |
| Provider restrictions | None found in the code for display. |
| Local mode | Local mode has no AGI plan. The CLI refuses the read before any request in Local and own-key modes (apps/cli/src/usage_summary.rs:343-357, 913-935). Mobile Usage in Local mode shows a banner offering to switch to Cloud and sends no request (apps/mobile/src/features/settings/cloud-usage/index.tsx:901-903, 1038). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web bars show 'Unavailable' and 'Could not read your usage. Retry to load it.' until data arrives. The last-updated label reads 'Loading…'. | apps/web/features/settings/sections/UsageSection.tsx:302-307, 1256-1257 |
| Error on first read | Web shows an alert with the message from toUserMessage. Mobile shows a red box and Retry. | apps/web/lib/hooks/useManagedUsageSummary.ts:77-81; apps/mobile/src/features/settings/cloud-usage/store.ts:55-60 |
| Background refresh fails | Web keeps the last reading, sets stale, and the footer says '(refresh failed)'. No error box. | apps/web/lib/hooks/useManagedUsageSummary.ts:77-81; apps/web/features/settings/sections/UsageSection.tsx:1262 |
| Period ended and not renewed | Web period meter shows the not-renewed message and the status line is hidden. | apps/web/features/settings/sections/UsageSection.tsx:1211-1214, 1233-1235 |
| Allowance not yet provisioned | Server marks usage_allocation 'pending'. CLI prints 'Allowance: not provisioned yet'. Chrome shows an allocation-pending state with retry. | apps/web/lib/services/managed-usage-summary-service.ts:237; apps/cli/src/usage_summary.rs:571-573; apps/extension/src/side_panel.ts:13228-13234 |
| Subscription past due, paused or ended | CLI prints the status and says the account runs on Free until fixed. | apps/cli/src/usage_summary.rs:639-671 |
| Signed out | Mobile shows a sign-in prompt. CLI says 'session expired, run `agi login`' on 401. | apps/mobile/src/features/settings/cloud-usage/index.tsx:948-953; apps/cli/src/usage_summary.rs:303-312 |
| Account switch | Mobile drops a late answer from the previous account. | apps/mobile/src/features/settings/cloud-usage/store.ts:46-60; apps/mobile/__tests__/cloud-usage-store.test.ts:53 |
| Offline | not handled in the code beyond the generic error and retry paths above (no offline-specific state found). | searched apps/web/lib/hooks/useManagedUsageSummary.ts and apps/mobile/src/features/settings/cloud-usage/index.tsx |
| Accessibility | Web bars carry aria labels and 'usage unavailable' text when unknown. The error box uses role alert. Mobile Info button has a 44 point target and the label 'About usage limits'. | apps/web/features/settings/sections/UsageSection.tsx:324-328, 1301-1303; apps/mobile/src/features/settings/cloud-usage/index.tsx:118-134 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/usage/__tests__/route.test.ts`: GET /api/usage: balance, windows, Free windows, 401, 403 lockdown, 503 retry hint, API-key scope.
- `apps/web/lib/services/__tests__/managed-usage-summary.credits.test.ts`: Plan tier versus entitled tier, lapsed plan on Free ledger, unreadable balances reported as unknown.
- `apps/web/lib/hooks/__tests__/useManagedUsageSummary.test.tsx`: Shared single read, 5 minute re-read, stale flag on failed background read.
- `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx`: Free upgrade-only view, lapsed period message, never-loaded reading, stale marking, plan allowance line.
- `apps/web/features/settings/sections/__tests__/UsageFailsHonest.test.tsx`: No full-allowance claim on failure or while loading, aria text for unavailable bars.
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Mobile plan label for each tier, free upgrade prompt, account switch, retry.
- `apps/mobile/__tests__/cloud-usage-store.test.ts`: Late response from previous account ignored, coalesced reads.
- `apps/cli/src/usage_summary.rs`: Inline tests: Local and own-key refusal, contract fixture parse, rendering (module tests at line 910).
- `apps/extension-vscode/src/__tests__/accountUsageCommands.test.ts`: VS Code account usage commands (file named; contents not opened).

**Test scenarios**

- **Paid plan on web**
  1. Sign in as a paid account.
  2. Open Settings, Usage and read the allowance line.
  3. Open Settings, Billing and read the period row.
  - Expected: Usage shows the plan label in the allowance line. Billing shows 'Renews on' or 'Ends on' with a date.
- **Plan changed on server**
  1. Change the account plan on the server.
  2. Press Refresh on Usage.
  - Expected: The new plan appears without sign-out.
- **Failed read**
  1. Block /api/usage in the network tool.
  2. Open Usage, then restore it and press Refresh.
  - Expected: An error shows first, no full allowance is claimed, and Refresh recovers.
- **CLI Local mode**
  1. Run the CLI in Local mode.
  2. Run the usage command.
  - Expected: A refusal line, and no request in the server log.
- **Mobile Free plan**
  1. Sign in as a Free account in Cloud mode.
  2. Open Settings, Usage.
  - Expected: Only 'Upgrade for higher capacity' (or the Free info text when purchases are off).
- **Lapsed period**
  1. Use an account whose period_end is past with allocation pending.
  2. Open web Usage.
  - Expected: The 'has not renewed yet' message and no status line.

**Where to look when it fails**

- Server log 'Failed to fetch usage data' (apps/web/app/api/usage/route.ts:33).
- API error 'Authentication required' on a 401 (apps/web/app/api/usage/route.ts:23).
- CLI messages 'session expired, run `agi login`' and 'usage API returned HTTP <n>' (apps/cli/src/usage_summary.rs:303-312, 492-495).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)
- CLI: [70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md)
- VS Code: [70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md)
- Chrome: [70-qa/test-plans/chrome/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/chrome/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **The web Usage page does not show the plan as a title line or the billing period dates.** Affects: Web and hosted Desktop users. Evidence: apps/web/features/settings/sections/UsageSection.tsx:1268-1315 renders no period_start or period_end; dates are in apps/web/features/settings/sections/BillingSection.tsx:822-826.. Work needed: Add a plan and period header to the Usage page, or link clearly to Billing.
- **CLI cannot show period dates because its type omits them.** Affects: CLI users. Evidence: apps/cli/src/usage_summary.rs:66-93.. Work needed: Add the two optional fields and a render line, plus a test in the module.
- **Chrome has no confirmed visible plan or period display.** Affects: Chrome extension users. Evidence: doc: docs/product/surface-feature-matrix.md:249; apps/extension/src/side_panel.ts:13399-13408 only stores plan name.. Work needed: Find or add the element that shows the plan, then update the matrix.
- **Free plan reset times exist in the API but web and mobile Free views hide them.** Affects: Free users on web and mobile. Evidence: apps/web/lib/services/managed-usage-summary-service.ts:92-97 builds free reset times; apps/web/features/settings/sections/UsageSection.tsx:1319-1329 shows only Upgrade.. Work needed: Product decision recorded in memory says Free shows only Upgrade, so no work unless the decision changes.
- **The brief's first-draft claim that Free plans show a next reset time on the Usage page is not what web or mobile do.** Affects: Testers using the brief. Evidence: apps/web/features/settings/sections/UsageSection.tsx:1319-1329.. Work needed: Correct the brief text.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-shared-ui-and-design
- api:GET /api/usage
- api:GET /api/me
- table:managed_usage_requests
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:apps/web/lib/services/managed-usage-summary-service.ts
- mode:cloud
- plan:free

## Unknown

- Whether the Chrome side panel shows the plan name anywhere visible (only the load into accountIdentity was read).
- Which endpoint fetchAccountSummary calls in Chrome (not opened).
- Whether the Electron Desktop window reaches the web Usage settings page (inferred from the hosted-app rule, not run).
- The exact rate limit for the 'credits-balance' key.
- The database table names behind the credit balance and subscription rows.
