---
id: "F009-10"
type: "feature"
title: "Usage meter and credit balance"
aliases: ["Usage meter", "Plan usage limits", "Credit balance card", "Credit balances", "Usage", "Usage and billing", "Buy credits", "Use reset", "S9.29 S9.30"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S9.29", "S9.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:GET /api/usage", "api:GET /api/usage/limit-resets", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-local-inference", "file:apps/web/lib/hooks/useManagedUsageSummary.ts", "file:packages/contracts/types/src/usage-vocabulary.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-10 Usage meter and credit balance

Settings, Usage shows progress bars for each plan window with percent used and reset time, a Credit balances card listing bonus and purchased credits with a Buy credits link, and a Use reset action. The data refreshes in the background and goes stale, not blank, on failure. Free plans see an Upgrade prompt.

Area: [9. Compound interface components](README.md). Requirement items: [S9.29](../../10-requirements/capabilities/009-compound-interface-components.md#s929), [S9.30](../../10-requirements/capabilities/009-compound-interface-components.md#s930).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads the account's managed usage summary and shows the used share of the session, week, flagship week and billing period windows with reset times (apps/web/features/settings/sections/UsageSection.tsx:1303-1395), and the bonus and purchased credit balances (UsageSection.tsx:407-433).

**Why it exists.** People on a plan with limits need to see how close they are and what extra credits remain before a limit stops them (doc: knowledge-base/data/area-briefs/009-compound-interface-components.md S9.29, S9.30).

**Who uses it.** Signed-in paid and free people on Web and the desktop window, Mobile, CLI, VS Code and Chrome.

**Problems it solves**

- Surprise limits (UsageSection.tsx:320-336).
- Not knowing which credits are spent first (UsageSection.tsx:426).
- Blank meter after a failed refresh (apps/web/lib/hooks/useManagedUsageSummary.ts:67-85).

**Use cases**

- Open Settings, Usage; read 'This week 62% used' and its reset.
- See 'Next expiry <date>' under Bonus credits.
- Press 'Buy credits' to go to Billing.
- On Free, see 'Upgrade for higher capacity' with an Upgrade button.

## 2. User experience

**Where to find it**

- Web: Settings modal section Usage (route /settings/usage opens the modal, apps/web/app/settings/usage/page.tsx:6).
- Desktop: the Electron window shows the web app; the Tauri build has its own 'Usage' tab with progress bars and a Purchased credits card (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:395-470).
- Mobile: Cloud usage settings screen (apps/mobile/src/features/settings/cloud-usage/index.tsx).
- CLI: a block named 'Account usage' (apps/cli/src/usage_summary.rs:564).
- VS Code: Settings panel section 'Usage & billing' (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1278, 1988-2060).
- Chrome: side panel usage windows (apps/extension/src/features/side-panel/usageWindows.ts:97).

**Before you start**

- A signed-in AGI account; the meters read the managed usage summary (apps/web/lib/hooks/useManagedUsageSummary.ts:62).
- A paid plan that is not contract priced for the credit card (UsageSection.tsx:1445).

**Screens and controls**

- Bars labelled Current session, This week, Most capable models, This billing period (packages/contracts/types/src/usage-vocabulary.ts:32-55).
- Each bar: label, '<n>% used' or 'Unavailable', a progress bar, a detail line (UsageSection.tsx:316-337).
- 'Refresh usage data' button and 'Updated <time>' text, with '(refresh failed)' when stale (UsageSection.tsx:1262, 1431).
- Card 'Credit balances' with 'Buy credits' link, rows 'Bonus credits' and 'Purchased credits' (UsageSection.tsx:411-432).
- Card for limit resets with 'Use reset' and confirm (UsageSection.tsx:482-502).
- Free plan: heading 'Upgrade for higher capacity' and button 'Upgrade' (UsageSection.tsx:1313-1328).

**Journey**

1. Open Settings and choose Usage.
2. The page loads the summary, showing a spinner then the bars.
3. Read percent used and reset per window.
4. Look at Credit balances; press Buy credits to open Billing.
5. If a reset is offered, press Use reset and confirm.
6. Leave the page open; data refreshes about every 5 minutes while active.

**What the person sees and gets**

- Bar turns warning colour at 90 percent and critical colour at 95 percent (usage-vocabulary.ts:15-19; UsageSection.tsx:330-336).
- 'Unavailable' with 'Could not read your usage. Retry to load it.' when no data (UsageSection.tsx:301-321).
- Billing period lapsed message 'Your billing period ended and has not renewed yet...' (UsageSection.tsx:299-300).
- Error alert text on a failed first load (UsageSection.tsx:1300-1308).
- Credit expiry lines for bonus and purchased credits (UsageSection.tsx:370-405).

**Settings**

- none found in the code for the meter itself; spend limit and history cards live in the same page (UsageSection.tsx:707, 1095).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web usage page with bars, progress role, aria-label '<label> usage' and aria-valuetext of the detail text (UsageSection.tsx:325-328).
- Shared fetch of /api/usage with request joining and stale marking on failure (useManagedUsageSummary.ts:67-85).
- Background refresh every 300,000 ms only when the person is active, and on activity after the interval (useManagedUsageSummary.ts:22, 87-110).
- Free plan shows Upgrade, not meters (UsageSection.tsx:1313-1328).
- Contract priced plans show a link to workspace usage (UsageSection.tsx:1331-1340).
- Credit balances card hidden for Free and contract plans (UsageSection.tsx:1445).
- Bonus then purchased order is stated; expiry dates for both (UsageSection.tsx:370-405, 426).
- Server route reads the summary with a rate limit (apps/web/app/api/usage/route.ts:1-45).
- CLI prints per-window credit lines, purchased credits with overage state and an 'Add credits' link (apps/cli/src/usage_summary.rs:564-607, 695-706).
- VS Code settings show a progressbar role with aria-label 'AGI Cloud plan usage' plus window list and an 'Add credits' row (settingsWebviewContent.ts:2025-2045).
- Chrome builds window views and purchased credit view (usageWindows.ts:97-130).

**Incomplete**

- Unknown data shows a progress bar at value 0 plus the text 'Unavailable' (UsageSection.tsx:322-327); the spoken text says 'Unavailable', so it is not read as 0 percent.
- Mobile credit card shows only 'Included in your plan' while native purchases are off; bonus and purchased rows show only when they are on (apps/mobile/src/features/settings/cloud-usage/index.tsx:411-420; apps/mobile/src/features/billing/storePurchases.json sets nativePurchases false).
- Tauri desktop usage tab has its own bars with a role progressbar and a Purchased credits card; no stale handling, Free Upgrade prompt or bonus row was seen in the part read (DesktopCloudSettingsModal.tsx:395-470).
- CLI shows text lines, not bars, and no bonus credit row (usage_summary.rs:564-607).
- Mobile 'Use reset' and 'Buy credits' links: reset exists (cloud-usage/index.tsx:437-512); a Buy credits link was not found.

**Present but disconnected or switched off**

- Mobile bonus and purchased credit rows are switched off by the build setting nativePurchases false (storePurchases.json; nativePurchaseAvailability.ts:3).

**Not available**

- Mobile credit-balance card per the brief is 'missing'; the code has a reduced card, so the brief is out of date [inferred].

## 4. Required behaviour

**Established requirements**

- A meter shows how much of the plan allowance is used per window with reset time, readable by assistive tech. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.29)
- The user sees purchased credit balance in one place next to a way to add credits. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.30)
- Each bar is a progress bar with a name, percent and spoken text; colour changes at warning and critical levels. (source: UsageSection.tsx:316-337; usage-vocabulary.ts:15-19)
- If data cannot be read the bar says 'Unavailable' with a retry hint, not 0 percent. (source: UsageSection.tsx:301-321)
- Usage refreshes in the background while the person is active; a failed refresh marks it stale. (source: useManagedUsageSummary.ts:60-85)
- Credits are spent bonus first (soonest to expire), then bought; expiry dates are stated. (source: UsageSection.tsx:370-405, 426)
- Every subscription capability on every app connects to one AGI Subscription system for entitlements, usage accounting, quotas and limits. (source: Product context given for this task; code: apps/web/app/api/usage/route.ts:12)

**Acceptance criteria**

1. Open Usage on a paid plan: one bar per window with label, percent used and a reset time.
2. At 90 percent the bar uses the warning colour; at 95 percent the critical colour and critical text.
3. Block the usage request on first load: bars show 'Unavailable' and an alert appears; Refresh retries.
4. With data shown, make a later refresh fail: the numbers stay and the update text says '(refresh failed)'.
5. On a Free plan: no meters, only 'Upgrade for higher capacity' and Upgrade.
6. Credit balances lists Bonus credits with next expiry and Purchased credits with expiry text; Buy credits opens Billing.
7. A screen reader reads each bar as '<label> usage' with the detail as its value text.
8. CLI: run the account usage command signed in and see each window with credits used and left.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A failed refresh with data present should not show the error alert [inferred from background mode skipping the error, useManagedUsageSummary.ts:77-80].
- Mobile should show bonus and purchased balances once purchasing is allowed [inferred from the nativePurchases switch].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the Tauri desktop usage tab reuse the shared usage section so stale handling and Free Upgrade behave the same.
- [proposed] Show bonus credits in the CLI block.
- [proposed] Give the unknown state a distinct bar style (not an empty bar).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | UsageSection | `apps/web/features/settings/sections/UsageSection.tsx` | Bars, credit balances, resets, spend limit, history. |
| hook | useManagedUsageSummary | `apps/web/lib/hooks/useManagedUsageSummary.ts` | Shared fetch, polling, stale flag, bucket readings. |
| screen | Usage settings page | `apps/web/app/settings/usage/page.tsx` | Redirects to the settings modal section usage. |
| endpoint | GET /api/usage | `apps/web/app/api/usage/route.ts` | Returns the managed usage summary. |
| service | getManagedUsageSummary | `apps/web/lib/services/managed-usage-summary-service.ts` | Builds the summary (imported at route.ts:12). |
| config | usage vocabulary | `packages/contracts/types/src/usage-vocabulary.ts` | Bucket labels, urgency thresholds 90 and 95. |
| component | DesktopUsageSection | `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx` | Tauri desktop usage bars and Purchased credits card (lines 395-470). |
| component | UsageDashboard | `apps/desktop/src/features/settings/UsageDashboard.tsx` | Tauri desktop activity dashboard in the Usage tab. |
| screen | Mobile cloud usage | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile bars, credit balances, resets, history. |
| service | mobile usage service | `apps/mobile/services/usage.ts` | Fetch and map usage snapshot. |
| service | CLI usage summary | `apps/cli/src/usage_summary.rs` | Parses usage, renders lines, picks managed or local-only mode. |
| component | VS Code settings usage section | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | Plan usage progress bar, windows list, credits row. |
| service | VS Code usage response schema | `apps/extension-vscode/src/protocol/apiResponses.ts` | Validates the usage payload. |
| service | Chrome usage windows | `apps/extension/src/features/side-panel/usageWindows.ts` | Window views, purchased credits view, limit notices. |
| config | nativePurchases switch | `apps/mobile/src/features/billing/storePurchases.json` | Turns mobile purchase UI on or off. |
| table | usage and credit tables | `apps/web/lib/services/managed-usage-summary-service.ts` | Tables behind the summary were not read. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page mounts the hook, which requests /api/usage with the session cookie unless one is already in flight. | device | useManagedUsageSummary.ts:67-72 |
| The server rate limits, resolves the user and builds the managed usage summary from the subscription system. | our servers | apps/web/app/api/usage/route.ts:1-45 |
| The client parses the response with a typed parser and publishes it to every subscriber. | device | useManagedUsageSummary.ts:73-75 |
| Every five minutes, or when the person becomes active after that time, a background request refreshes; failure sets stale only. | device and our servers | useManagedUsageSummary.ts:22, 87-110 |
| Percent and reset text are computed from the response; a minute timer re-renders reset countdowns. | device | UsageSection.tsx:1203-1209 |
| Use reset sends a request to the limit resets API and refreshes. | our servers | UsageSection.tsx:437-502; apps/web/app/api/usage/limit-resets exists |
| The CLI reads a stored sign-in token and requests the account usage; with no credential or bring-your-own-key it prints a local-only note. | device and our servers | apps/cli/src/usage_summary.rs:343-360 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage summary (percentages, resets, credit windows, bonus, purchased, expiry) | Server-side subscription and usage data; client keeps it in memory only | Read on demand; shared across components in one tab | Not kept on the device by the web hook |
| Mobile snapshot | mobile usage store (cloud-usage-store test exists) | Fetched from the same server | not established |

**Models and providers.** Meters are accounted for managed Cloud use. Model choice affects which allowance windows are drawn on (flagship window 'Most capable models', usage-vocabulary.ts:46-52). Provider-specific behaviour is not involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; the CLI shows a local-only note without a credential (usage_summary.rs:343-360). |
| Permissions | The usage endpoint may refuse API keys without the right scope (apps/web/app/api/usage/route.ts:13, isApiKeyScopeError). |
| Subscription | Plan tier selects the display: Free shows Upgrade, contract plans show a workspace usage link, others show bars (UsageSection.tsx:1224-1340). |
| Limits and metering | Windows: session (5-hour), weekly, weekly flagship, billing period; credits per window; purchased credits and overage flag (usage-vocabulary.ts:32-55; usage_summary.rs:564-607). |
| Feature flags | Mobile build switch nativePurchases (storePurchases.json). Other flags none found. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. CLI own-key accounts see 'provider spend is billed by the provider' (usage_summary.rs:346-349). |
| Local mode | Local inference is free and metered by no AGI plan; the web meter shows managed Cloud use only. CLI says 'no AGI credential, so this session runs local or BYOK' (usage_summary.rs:353-356). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | A status spinner shows during the first load. | UsageSection.tsx:288-296 |
| Unknown data | 'Unavailable', bar value 0, hint text, aria-valuetext 'Unavailable'. | UsageSection.tsx:301-327 |
| Error first load | Alert with message and Refresh. | UsageSection.tsx:1300-1308, 1431 |
| Stale | Last data kept, '(refresh failed)' appended. | useManagedUsageSummary.ts:77-81; UsageSection.tsx:1262 |
| Period lapsed | Period bar unknown with explanation. | UsageSection.tsx:1213-1218, 299-300 |
| Free plan | Upgrade only. | UsageSection.tsx:1313-1328 |
| Bonus unreadable | Row shows 'Unavailable' and 'Refresh to retry'. | UsageSection.tsx:370-373 |
| Tab hidden or idle | No background refresh while the person is inactive. | useManagedUsageSummary.ts:60-62, 87-96 |
| Accessibility | Cards are sections labelled by headings; progress has aria-label and valuetext. | UsageSection.tsx:411, 325-328 |
| Offline | A failed request is treated as a failed refresh; no separate offline notice found. | useManagedUsageSummary.ts:76-81 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx`: Usage section rendering.
- `apps/web/features/settings/sections/__tests__/UsageFailsHonest.test.tsx`: Unavailable and failure behaviour.
- `apps/web/features/settings/sections/__tests__/UsageSection.history.test.tsx`: History card.
- `apps/web/app/api/usage/__tests__/route.test.ts`: Usage endpoint.
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Mobile usage page.
- `apps/mobile/__tests__/NoPurchasesUsageNavigation.test.tsx`: Mobile usage navigation with purchases off.
- `apps/extension/__tests__/usage-windows.test.ts`: Chrome usage windows.
- `apps/desktop/src/features/settings/UsageDashboard.test.tsx`: Tauri desktop dashboard.
- `apps/cli/src/usage_summary.rs`: Unit tests inside the file (about 25 test attributes).

**Test scenarios**

- **Warning colours**
  1. Use an account at 91 percent then 96 percent of a window.
  2. Open Usage each time.
  - Expected: Warning colour at 91, critical colour and text at 96.
- **Stale not blank**
  1. Open Usage with data.
  2. Block /api/usage and wait for a background refresh.
  - Expected: Bars stay; update text ends '(refresh failed)'.
- **First load failure**
  1. Block /api/usage.
  2. Open Usage fresh.
  - Expected: Bars read Unavailable with a retry hint and an alert shows.
- **Free plan**
  1. Sign in on Free.
  2. Open Usage.
  - Expected: Only Upgrade for higher capacity and an Upgrade button.
- **Credits order**
  1. Use an account with bonus and purchased credits.
  2. Open Usage.
  - Expected: Text says bonus first, soonest to expire; both rows show expiry.
- **CLI Local**
  1. Run the CLI signed out and ask for account usage.
  - Expected: Local-only note telling the person to run agi login.

**Where to look when it fails**

- Error text 'Could not load usage' (useManagedUsageSummary.ts:76-79).
- Server route logger and API key scope error in apps/web/app/api/usage/route.ts.
- CLI 'Unavailable: <reason>' line (usage_summary.rs:557-562).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)
- VS Code: [70-qa/test-plans/vscode/009-compound-interface-components.md](../../70-qa/test-plans/vscode/009-compound-interface-components.md)
- Chrome: [70-qa/test-plans/chrome/009-compound-interface-components.md](../../70-qa/test-plans/chrome/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **Tauri desktop usage tab is a separate implementation without stale handling or Free Upgrade behaviour seen.** Affects: Desktop Tauri build.. Evidence: DesktopCloudSettingsModal.tsx:395-470.. Work needed: Reuse the shared section or add the same states.
- **Mobile shows no bonus or purchased credits while purchases are off.** Affects: Mobile.. Evidence: cloud-usage/index.tsx:416-418; storePurchases.json.. Work needed: Decide whether bonus credits should show without store purchases.
- **Brief says mobile credit-balance card missing, but a reduced card exists.** Affects: Brief accuracy.. Evidence: cloud-usage/index.tsx:411-432.. Work needed: Update the ledger.
- **Unknown state draws an empty bar, not a distinct style.** Affects: Web.. Evidence: UsageSection.tsx:322-327.. Work needed: Consider a hatched or hidden bar.
- **CLI has no bonus credits line and no bars.** Affects: CLI.. Evidence: usage_summary.rs:564-607.. Work needed: Add bonus if the API reports it.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:GET /api/usage
- api:GET /api/usage/limit-resets
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-local-inference
- file:apps/web/lib/hooks/useManagedUsageSummary.ts
- file:packages/contracts/types/src/usage-vocabulary.ts

## Unknown

- Which database tables hold usage and credits (service not read).
- How the Chrome side panel draws the bars (only the helper file was read).
- How Tauri desktop Free plans are handled; only part of the settings modal was read.
- Whether mobile Free plans' Upgrade button leads anywhere while purchases are off (cloud-usage/index.tsx:985-1013 not fully read).
- What the VS Code script that fills the usage rows does on failure.
- Which docs/product pages describe credits and expiry; none were read.
