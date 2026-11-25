---
id: "F082-02"
type: "feature"
title: "Usage meters and reset times"
aliases: ["Usage meters", "Reset countdown", "Usage windows", "Current session", "This week", "Most capable models", "This billing period", "Plan usage limits", "S82.03", "S82.17", "How usage limits work"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S82.03", "S82.17"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing", "api:GET /api/usage", "file:packages/contracts/types/src/usage-vocabulary.ts", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "mode:cloud", "plan:free"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-02 Usage meters and reset times

Shows how full each usage window is and when it resets. The windows are a rolling session window, a rolling week, a weekly share for the most capable models, and the billing period. Web, mobile, CLI and VS Code show them. Chrome uses the same readings for warnings and a blocked state, not for meters.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.03](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8203), [S82.17](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8217).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns the server's usage percentages, credit windows and reset times into bars, text and warnings. The window labels are 'Current session', 'This week', 'Most capable models' and 'This billing period' (packages/contracts/types/src/usage-vocabulary.ts:34-62).

**Why it exists.** A person on a metered plan needs to see how close they are to a limit and how long until it frees up, before work is blocked. The brief requires an overall usage meter and a reset countdown for each window (doc: knowledge-base/data/area-briefs/082-usage-dashboard-and-limit-ui.md, S82.03 and S82.17).

**Who uses it.** Paid subscribers (not contract-priced workspace plans) using Cloud mode who ask how much they have left and when it resets.

**Problems it solves**

- Surprise blocks mid-task.
- Not knowing whether to wait or buy credits.
- Mixed readings in one page when four components each fetched their own copy (apps/web/lib/hooks/useManagedUsageSummary.ts:24-35).

**Use cases**

- A web user reads 'Getting close. Some limits are nearly used up.' and decides to pause heavy work (apps/web/features/settings/sections/UsageSection.tsx:164).
- A mobile user taps the info button beside a meter and reads how each window refills (apps/mobile/src/features/settings/cloud-usage/index.tsx:746-820).
- A CLI user reads '5-hour window: 120 of 500 credits used, 380 left, resets in 2h 10m' (format at apps/cli/src/usage_summary.rs:673-684).
- A Chrome user hits a limit and the side panel says which window was used up and when it resets (apps/extension/src/side_panel.ts:13235-13247).

## 2. User experience

**Where to find it**

- Web and hosted Desktop: Settings, Usage, card 'Plan usage limits' (apps/web/features/settings/sections/UsageSection.tsx:1310-1313).
- Mobile: Settings, Usage. Session meter, 'Weekly limits' group and a plan card with the period meter (apps/mobile/src/features/settings/cloud-usage/index.tsx:1109-1241).
- CLI: usage command or /usage, lines '5-hour window', 'Weekly', 'Monthly', 'Flagship weekly' (apps/cli/src/usage_summary.rs:575-583).
- VS Code: account quick pick group '<plan> plan usage' and the settings webview (apps/extension-vscode/src/core/commandSetup.ts:2293-2299; apps/extension-vscode/src/features/settings/SettingsPanel.ts:94-98).
- Chrome: no meter page. A warning banner or a blocked chat state in the side panel (apps/extension/src/side_panel.ts:13207-13273).

**Before you start**

- Cloud mode and a paid, non-contract plan for the web meters (apps/web/features/settings/sections/UsageSection.tsx:1319-1341).
- Mobile: Cloud mode, signed in, not Free (apps/mobile/src/features/settings/cloud-usage/index.tsx:956-969, 1040).

**Screens and controls**

- Web: four bars with the label, '<n>% used', a progress bar and a detail line; a status sentence above; 'Refresh' button (apps/web/features/settings/sections/UsageSection.tsx:302-341, 1342-1436).
- Mobile: bars with credit text and reset text; an info button labelled 'About usage limits' next to the session, weekly and period bars (apps/mobile/src/features/settings/cloud-usage/index.tsx:82-178, 1120-1126, 1155-1161, 1235-1241); a 'Refresh usage' button; a sheet 'How usage limits work' with a 'Done' button (apps/mobile/src/features/settings/cloud-usage/index.tsx:746-820).

**Journey**

1. Open Usage.
2. The app reads /api/usage.
3. Read the status sentence on web (none, on track, close, limit).
4. Read each bar: percent used, credits used of allowance, time left to reset.
5. On mobile, tap the info button to open the explainer sheet; tap Done.
6. Press Refresh to re-read, or wait: web re-reads every 5 minutes while active.

**What the person sees and gets**

- Web status sentences: 'No usage yet. Your full limits are available.', 'On track. You should reach the next reset with room to spare.', 'Getting close. Some limits are nearly used up.', 'Limit reached. Use credits or wait for the reset below.' (apps/web/features/settings/sections/UsageSection.tsx:161-166).
- Bar detail: '<used> of <allowance> credits used · Resets in <time> (<date>)' or 'Resets at <time>' when none is left (apps/web/features/settings/sections/UsageSection.tsx:343-356).
- Bar colour turns warning and critical by urgency (apps/web/features/settings/sections/UsageSection.tsx:315, 329-335).
- Reset moment today shows a time, later shows a weekday and time (apps/web/features/settings/sections/UsageSection.tsx:148-157).

**Settings**

- None. The explainer copy and bucket descriptions come from the shared vocabulary (packages/contracts/types/src/usage-vocabulary.ts:34-62).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server computes percentages with toPublicUsagePercentage and rolling windows for the session (5 hours) and week (7 days) from real usage, and returns reset times (apps/web/lib/services/managed-usage-summary-service.ts:118-156, 222-234).
- Credit windows monthly, weekly, five_hour and flagship_weekly carry allowance, used, remaining and reset_at (apps/web/lib/services/managed-usage-summary-service.ts:158-193).
- The web hook shares one reading, joins in-flight reads, and on a failed background read marks it stale instead of clearing (apps/web/lib/hooks/useManagedUsageSummary.ts:67-89).
- Web hides the session bar when the plan has no five-hour cap and hides the flagship bar when the plan has none (apps/web/features/settings/sections/UsageSection.tsx:1226, 1356).
- Web sets the status line from the highest percentage with thresholds 90 and 100 (apps/web/features/settings/sections/UsageSection.tsx:168-174).
- Web ticks its 'now' clock every minute so countdowns advance (apps/web/features/settings/sections/UsageSection.tsx:1204-1208).
- Mobile shows credit usage text or percent, reset label from formatUsageResetIn, and hides a window whose reset is null (apps/mobile/src/features/settings/cloud-usage/index.tsx:165-175, 1109, 1132, 1163).
- CLI prints credit lines with 'resets in <duration>' or 'resetting now' (apps/cli/src/usage_summary.rs:673-730).
- VS Code lists windows with usage text and reset text and drops windows with no allowance (apps/extension-vscode/src/data/usagePresentation.ts:60-77).
- Chrome builds window views, picks the blocking window and schedules a re-read at the reset time (apps/extension/src/features/side-panel/usageWindows.ts:64-161; apps/extension/src/side_panel.ts:13203-13218).

**Incomplete**

- Mobile has no timer re-read. It loads on screen entry and on Refresh (apps/mobile/src/features/settings/cloud-usage/index.tsx:901-903).
- The mobile info button sits on the session, weekly and period bars but not the flagship bar (apps/mobile/src/features/settings/cloud-usage/index.tsx:1171-1176).
- A window with no cap is hidden on web and mobile, not shown without a bar (apps/web/features/settings/sections/UsageSection.tsx:1356, 1380).
- Chrome shows no meter bars or a usage page (apps/extension/src/side_panel.ts:13207-13273).

**Present but disconnected or switched off**

- limit_promotions (uplift lines and resets) appear only when the server returns them and are absent while promotions are off (packages/contracts/types/src/managed-usage-balance.ts:105-106).

**Not available**

- Free plan on web and mobile: no meters, upgrade prompt only (apps/web/features/settings/sections/UsageSection.tsx:1319-1329).
- Contract-priced plan on web: no meters, workspace link (apps/web/features/settings/sections/UsageSection.tsx:1330-1339).
- Local and own-key modes: no managed meters on CLI (apps/cli/src/usage_summary.rs:343-357).

## 4. Required behaviour

**Established requirements**

- An overall usage meter shows how much of the plan allowance is used. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.03)
- Each usage window shows how long until it resets. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.17)
- Usage settings include current session and weekly limits. (source: doc: docs/product/requirements.md:1326-1328)
- The meter keeps its last value and is marked stale when a background read fails. (source: apps/web/lib/hooks/useManagedUsageSummary.ts:57-89)
- Meters never show dollars, tokens or internal ledger operands; values are in credits. (source: apps/web/features/settings/sections/__tests__/UsageSection.test.tsx:346; apps/mobile/__tests__/CloudUsagePage.test.tsx:160)

**Acceptance criteria**

1. Each shown window displays percent or credits used and a reset time.
2. The status sentence changes to 'Getting close' at 90 percent and 'Limit reached' at 100 percent.
3. A plan with no session cap shows no session bar.
4. A failed refresh leaves the last numbers on screen with '(refresh failed)' on web.
5. After 5 minutes of activity, web re-reads /api/usage without a click; a hidden tab does not poll.
6. On mobile the info button opens a sheet that lists the window descriptions and closes with Done.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI and VS Code reset text should agree with the web text for the same instant, since all use shared formatters [inferred from packages/contracts/types/src/usage-vocabulary.ts:113].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Auto-refresh mobile every few minutes while the screen is focused.
- [proposed] Add a usage meter page or compact meter to Chrome so the brief's 'done' status matches what is visible.
- [proposed] Put the info button on the flagship bar too.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | getManagedUsageSummary | `apps/web/lib/services/managed-usage-summary-service.ts` | Builds percentages, credit windows and reset times. |
| other | managed-usage-policy | `apps/web/lib/server/managed-usage-policy.ts` | Plan caps and toPublicUsagePercentage (imported at summary service lines 17-26). |
| other | rolling-usage | `apps/web/lib/server/rolling-usage.ts` | getRollingUsage for the 5-hour and 7-day windows. |
| other | capability-limit-resets | `apps/web/lib/server/capability-limit-resets.ts` | rollingResetAt and window hour constants. |
| service | free-trial-service getFreeTrialPublicUsage | `apps/web/lib/services/free-trial-service.ts` | Free plan readings and reset times (used at summary service line 92). |
| service | usage-limit-promotion-service | `apps/web/lib/services/usage-limit-promotion-service.ts` | Uplifts and refreshed amounts that change caps and used amounts. |
| endpoint | GET /api/usage | `apps/web/app/api/usage/route.ts` | Serves the summary. |
| hook | useManagedUsageSummary and helpers | `apps/web/lib/hooks/useManagedUsageSummary.ts` | Shared state, 5 minute re-read, getWorstUsagePercent, readManagedUsageBuckets. |
| component | UsageBar, usageDetail, usageStatus | `apps/web/features/settings/sections/UsageSection.tsx` | Web bars, detail text and status sentence. |
| other | usage-vocabulary | `packages/contracts/types/src/usage-vocabulary.ts` | Bucket labels, descriptions, formatUsageResetIn, formatCreditWindowUsage. |
| component | UsagePercentBar and UsageLimitsSheet | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile bars and the explainer sheet. |
| service | fetchUsageSnapshot and tightestUsageWindow | `apps/mobile/services/usage.ts` | Mobile read and tightest-window label. |
| store | useCloudUsageStore | `apps/mobile/src/features/settings/cloud-usage/store.ts` | Mobile snapshot, loading, error, updatedAt. |
| service | render_account_usage and reset_suffix | `apps/cli/src/usage_summary.rs` | CLI window lines and reset text. |
| other | creditWindowRows | `apps/extension-vscode/src/data/usagePresentation.ts` | VS Code window rows. |
| other | usageWindows | `apps/extension/src/features/side-panel/usageWindows.ts` | Chrome window views, blocking window, warning selection. |
| component | presentManagedUsage | `apps/extension/src/side_panel.ts` | Chrome gate, banner and reset-time re-read timer. |
| test | UsageSection tests | `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx` | Web meter behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page mounts the shared hook, which starts one read and a 5 minute timer that only fires while the browser is active. | device | apps/web/lib/hooks/useManagedUsageSummary.ts:102-139 |
| Server reads rolling session and weekly usage, applies uplifts, computes percentages and reset times from the oldest usage in each window. | our servers | apps/web/lib/services/managed-usage-summary-service.ts:118-156 |
| For a Free plan the server uses the free-trial reading and its reset times. | our servers | apps/web/lib/services/managed-usage-summary-service.ts:92-97, 146-152 |
| Client parses, clamps percent to 0 to 100 and renders bars and text. | device | apps/web/features/settings/sections/UsageSection.tsx:321; packages/contracts/types/src/managed-usage-balance.ts:114 |
| Client formats time to reset with the shared formatter. | device | packages/contracts/types/src/usage-vocabulary.ts:113-140 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage reading (percentages, credit windows, reset times) | Computed from the server usage ledger rows (table managed_usage_requests is used by history; the rolling store was not opened). Client: module memory on web, zustand store on mobile. | No. Re-read per app. | Client copy is dropped on close or account change. |

**Models and providers.** The reading counts spend across models. The flagship window covers the most capable models only (packages/contracts/types/src/usage-vocabulary.ts:49-54). No provider is called to read it.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. API key scope usage:read also works (apps/web/app/api/usage/route.ts:18). |
| Permissions | User-scoped database read of own data. |
| Subscription | Paid, non-contract plans see meters on web. Free sees upgrade only. Contract plans see a workspace link (apps/web/features/settings/sections/UsageSection.tsx:1319-1339). |
| Limits and metering | Windows: 5-hour rolling session, 7-day rolling week, weekly flagship share, billing period (apps/web/lib/services/managed-usage-summary-service.ts:118-156). Caps come from the plan policy (managed-usage-policy.ts). Refresh interval 300000 ms (apps/web/lib/hooks/useManagedUsageSummary.ts:22). |
| Feature flags | limit_promotions presence; usage_allocation 'pending' or 'provisioned' (packages/contracts/types/src/managed-usage-balance.ts:90-106). |
| Model compatibility | Flagship bucket concerns the most capable models. Which models count is decided in the model catalog and policy, not here (see SYS-model-catalog-and-routing). |
| Provider restrictions | None found in the code for display. |
| Local mode | Local mode is not metered. CLI refuses in Local and own-key modes (apps/cli/src/usage_summary.rs:343-357). Mobile says 'Local mode keeps working' in the explainer (apps/mobile/src/features/settings/cloud-usage/index.tsx:737-738). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Bars read 'Unavailable'. Mobile shows a spinner. | apps/web/features/settings/sections/UsageSection.tsx:321; apps/mobile/src/features/settings/cloud-usage/index.tsx:1042 |
| Empty or zero usage | Status 'No usage yet. Your full limits are available.' | apps/web/features/settings/sections/UsageSection.tsx:162, 172 |
| Limit reached | Bar detail switches to 'Resets at <time>' and status says 'Limit reached'. | apps/web/features/settings/sections/UsageSection.tsx:349, 165, 170 |
| Error | Alert on first read; stale mark on later reads. Mobile keeps the snapshot and shows a Retry box. | apps/web/lib/hooks/useManagedUsageSummary.ts:77-81; apps/mobile/src/features/settings/cloud-usage/store.ts:55-60 |
| Retry | Web Refresh calls refresh and reloads limits. Mobile Retry calls load. | apps/web/features/settings/sections/UsageSection.tsx:1424-1430; apps/mobile/src/features/settings/cloud-usage/index.tsx:1064 |
| Hidden tab | No polling while hidden. One re-read on return if the reading is older than 5 minutes. | apps/web/lib/hooks/useManagedUsageSummary.ts:91-100; apps/web/lib/hooks/__tests__/useManagedUsageSummary.test.tsx:71 |
| Reset time passes while page is open | Web countdown ticks each minute. Chrome schedules a refresh at the reset moment. Web does not refetch at the reset moment (only on its 5 minute timer). | apps/web/features/settings/sections/UsageSection.tsx:1204-1208; apps/extension/src/side_panel.ts:13203-13218 |
| Timeout | CLI fetch has a 5 second timeout. Web and mobile have no explicit timeout found. | apps/cli/src/usage_summary.rs:14 |
| Accessibility | Progress bars have aria labels and value text, with different text when unknown. | apps/web/features/settings/sections/UsageSection.tsx:324-328 |
| Offline | not handled in the code beyond the error path. | searched hook and mobile store |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx`: Labels, percentage fill, neutral colour below warning, Ultra without session meter, stale marking.
- `apps/web/features/settings/sections/__tests__/UsageFailsHonest.test.tsx`: No claim of a full allowance on failure or loading.
- `apps/web/lib/hooks/__tests__/useManagedUsageSummary.test.tsx`: Polling while active, no polling when hidden, single read for four components.
- `apps/web/app/api/usage/__tests__/route.test.ts`: Rolling-window fields, Free windows, null reset when no usage, exhausted shared window, flagship-only exhaustion.
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Percent-not-dollars, reset countdown captions, session and weekly meters.
- `apps/mobile/__tests__/UsageLimitsInfoAndCredits.test.tsx`: Info button, sheet content, Done and swipe close.
- `apps/mobile/__tests__/usage-tightest-window.test.ts`: tightestUsageWindow.
- `apps/extension/__tests__/usage-windows.test.ts`: Chrome window views, exhaustion, binding window, warnings.
- `apps/extension-vscode/src/__tests__/usagePresentation.test.ts`: VS Code window rows with resets, omitted windows.
- `apps/cli/src/usage_summary.rs`: Inline tests for render and parse.

**Test scenarios**

- **Approach a limit**
  1. Use an account near 90 percent of a window.
  2. Open web Usage.
  - Expected: Status sentence 'Getting close...' and the bar in the warning colour.
- **Reach a limit**
  1. Use an account at 100 percent of the session window.
  2. Open web Usage.
  - Expected: 'Limit reached' sentence, detail reads 'Resets at <time>'.
- **Plan without session cap**
  1. Open Usage with a plan that has no five-hour cap.
  - Expected: No session bar; weekly and period bars show.
- **Background failure**
  1. Open Usage and wait.
  2. Break the network and wait for the 5 minute timer.
  - Expected: Numbers stay, footer reads '(refresh failed)'.
- **Mobile explainer**
  1. Open mobile Usage as a paid user.
  2. Tap 'About usage limits'.
  3. Tap Done.
  - Expected: Sheet lists each window description and the line 'Local mode keeps working.', then closes.
- **CLI reset text**
  1. Run the usage command as a paid user.
  - Expected: Each window line ends with 'resets in <d h or h m>'.

**Where to look when it fails**

- Server log 'Failed to fetch usage data'.
- Browser network tab: /api/usage status.
- CLI: 'usage API returned HTTP <status>'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)
- CLI: [70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md)
- VS Code: [70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **The draft says a window with no cap is shown without a bar. In code it is hidden.** Affects: Web and mobile testers. Evidence: apps/web/features/settings/sections/UsageSection.tsx:1356, 1380; apps/mobile/src/features/settings/cloud-usage/index.tsx:1109, 1132. Work needed: Correct the brief wording or show a no-cap line.
- **Mobile never re-reads on a timer.** Affects: Mobile users who leave Usage open. Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:901-903. Work needed: Add a focused-screen interval or reuse the web policy.
- **Chrome has no meter UI.** Affects: Chrome users. Evidence: apps/extension/src/side_panel.ts:13207-13273. Work needed: Decide whether a meter is required; if so build it from usageWindowViews.
- **Web does not re-read at the exact reset moment.** Affects: Web users waiting for a reset. Evidence: apps/web/lib/hooks/useManagedUsageSummary.ts:104-108. Work needed: Schedule a refresh at the earliest reset like Chrome does.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing
- api:GET /api/usage
- file:packages/contracts/types/src/usage-vocabulary.ts
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- mode:cloud
- plan:free

## Unknown

- Where rolling usage is stored and read (rolling-usage.ts not opened).
- Exact plan caps (managed-usage-policy.ts not opened).
- Whether the Electron Desktop window shows the web Usage page exactly as the browser does (not run).
- Whether mobile or Chrome apply a timeout to the /api/usage read.
