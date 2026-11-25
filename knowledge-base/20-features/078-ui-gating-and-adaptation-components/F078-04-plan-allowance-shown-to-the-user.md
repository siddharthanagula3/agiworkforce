---
id: "F078-04"
type: "feature"
title: "Plan allowance shown to the user"
aliases: ["Plan allowance", "Usage meter", "Remaining allowance", "Cloud usage screen", "agi usage", "Usage summary"]
area: "78 UI gating and adaptation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S78.08"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-observability-and-operations", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:GET /api/usage", "plan:free"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-04 Plan allowance shown to the user

Each app reads the plan allowance left from the server usage summary and shows it. Free plans on web see only an Upgrade prompt. A failed read shows 'Unavailable' or an error, not a real-looking zero. Local and own-key use is not metered.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.08](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7808).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not stated on this page | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Fetches the server usage summary (percent used in session, weekly and period windows, credits, reset times) and shows how much is left.

**Why it exists.** People should know before a limit stops them. The server owns the numbers so every app agrees (apps/cli/src/usage_summary.rs:1-5).

**Who uses it.** Paying subscribers on any app; support staff checking a limit complaint.

**Problems it solves**

- Surprise stop at a limit.
- Different numbers on different apps.

**Use cases**

- Web user opens Settings, Usage and sees percent used.
- Mobile user opens the cloud usage screen.
- CLI user runs the usage command and sees plan, windows and history.
- VS Code user sees usage in the sidebar.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Usage section; headings 'Plan usage limits', 'This month', 'Credit balances', 'Resets' (apps/web/features/settings/sections/UsageSection.tsx:411-414, 488-491, 839-841, 1313).
- Mobile: cloud usage screen (apps/mobile/src/features/settings/cloud-usage/index.tsx) with 'Included in your plan', 'Credit balances', 'This month'.
- CLI: the usage command and the in-session slash view (apps/cli/src/usage_summary.rs:505-554).
- VS Code: sidebar usage state (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:509, named in brief)
- Chrome: quota recovery labels in the side panel (apps/extension/src/side_panel.ts:725-748).

**Before you start**

- Signed in to AGI Cloud with a plan; the CLI needs an AGI credential.

**Screens and controls**

- Meters showing '<n>% used' with aria label '<label> usage' (UsageSection.tsx:321-327).
- 'Refresh usage data' button (UsageSection.tsx:1431).
- 'Upgrade' button for Free plans (UsageSection.tsx:1319-1328).

**Journey**

1. 1. Person opens the usage screen or command.
2. 2. The app fetches the usage summary.
3. 3. Meters and reset times are shown.
4. 4. If the read fails, the app says it is unavailable.
5. 5. On a Free plan the web shows 'Upgrade for higher capacity' and an Upgrade button instead of meters.

**What the person sees and gets**

- Percent used, credit balances, reset time.
- 'Unavailable' with 'Could not read your usage. Retry to load it.' (UsageSection.tsx:307, 321).
- CLI lines 'Account usage' and ' Unavailable: <reason>' (usage_summary.rs:557-562).

**Settings**

- Monthly spend limit and auto-reload cards on web (UsageSection.tsx:64-66, 707-710).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web hook shares one reading across components, polls every 300 seconds while the user is active, and keeps the last reading with a stale flag on a failed background poll (apps/web/lib/hooks/useManagedUsageSummary.ts:22, 53-82).
- Web shows an error 'Could not load usage' only on a foreground failure (useManagedUsageSummary.ts:74, 80).
- Web Usage section hides meters for Free plans and shows 'Upgrade for higher capacity' with an Upgrade button (UsageSection.tsx:1224, 1279, 1313-1328).
- Web unknown readings display 'Unavailable' with an aria label saying usage unavailable (UsageSection.tsx:321-327).
- Mobile fetches /api/usage and projects session, weekly, flagship weekly and period percentages and credits (apps/mobile/services/usage.ts:45-60, 89-91).
- Mobile usage screen shows per-card errors and 'Unavailable' with a retry hint (apps/mobile/src/features/settings/cloud-usage/index.tsx:352-356, 377, 398).
- CLI reads /api/usage with a 5 second timeout and prints 'Unavailable: <reason>' on failure or when the session is local or own-key (usage_summary.rs:12-13, 338-356, 527-562).
- VS Code reads usage percent, reset and remaining flag into its tier info (apps/extension-vscode/src/utils/api.ts:1249-1250, 1325-1344, 1380-1390).
- Billing info on web refetches on window focus with zero stale time so a plan change shows quickly (apps/web/features/billing/hooks/use-billing-queries.ts:106-108).

**Incomplete**

- Chrome usage display was not opened beyond quota recovery label code.

**Present but disconnected or switched off**

- nothing found

**Not available**

- No usage meter for Local or own-key use: CLI says provider spend is billed by the provider (usage_summary.rs:345-355).

## 4. Required behaviour

**Established requirements**

- Each surface shows how much of the plan allowance remains, read from the server. (source: brief S78.08)
- Free usage screens show only Upgrade, never meters. (source: doc: project memory (owner decision on free usage); matches UsageSection.tsx:1313-1328)

**Acceptance criteria**

1. The percent shown equals the server /api/usage value for the same account.
2. A failed read shows 'Unavailable' or an error and never shows 0% used.
3. A Free plan on web shows 'Upgrade for higher capacity' and no meters.
4. A background poll failure keeps the last reading and marks it stale.
5. The CLI usage command on an own-key session says why usage is not shown.
6. After a plan change the web plan label updates on the next focus.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The mobile Free-plan view should follow the same Upgrade-only rule; not confirmed in the files opened [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the stale flag to the person on web when a background poll has failed.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useManagedUsageSummary | `apps/web/lib/hooks/useManagedUsageSummary.ts` | Shared usage reading with poll and stale state. |
| component | UsageSection (web) | `apps/web/features/settings/sections/UsageSection.tsx` | Meters, Free-plan Upgrade view, errors. |
| hook | use-billing-queries | `apps/web/features/billing/hooks/use-billing-queries.ts` | Billing info refetch on focus. |
| endpoint | GET /api/usage | `apps/web/app/api/usage/route.ts` | Server usage summary; path used by all clients, route file not opened. |
| service | Mobile usage service | `apps/mobile/services/usage.ts` | Fetches and projects the usage summary. |
| screen | Mobile cloud usage screen | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Usage cards and errors. |
| service | CLI usage summary | `apps/cli/src/usage_summary.rs` | Fetch, render and unavailable text. |
| service | VS Code API client | `apps/extension-vscode/src/utils/api.ts` | Reads usage fields into tier info. |
| service | VS Code ChatStateManager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Sidebar usage state (named in brief; not opened). |
| service | Chrome side panel recovery labels | `apps/extension/src/side_panel.ts` | Upgrade and usage labels on quota stop. |
| schema | Managed usage summary contract | `packages/contracts/types/src/managed-usage-balance.ts` | Response schema shared by clients (named in CLI header comment). |
| test | useManagedUsageSummary test | `apps/web/lib/hooks/__tests__/useManagedUsageSummary.test.tsx` | Covers the shared hook. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App calls GET /api/usage with the person's session or token. | device and our servers | useManagedUsageSummary.ts:73; apps/mobile/services/usage.ts:89-91; usage_summary.rs:13 |
| Server returns the summary from its ledger. | our servers | apps/cli/src/usage_summary.rs:1-5 |
| Client parses it with the shared parser and renders meters. | device | useManagedUsageSummary.ts:75; usage.ts:91 |
| Web re-polls every 300 s while the user is active. | device | useManagedUsageSummary.ts:22, 88-97 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage reading | Module memory on web; component state on mobile; not stored on CLI | Read-only copy of the server value | Lost on reload |

**Models and providers.** Usage is computed server side from managed model calls; no provider is chosen by this feature. Own-key provider spend is outside this summary.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in required; CLI needs an AGI credential (usage_summary.rs:343-356). |
| Permissions | none found in the code. |
| Subscription | Allowance differs by plan; Free web view is Upgrade-only (UsageSection.tsx:1313-1328). |
| Limits and metering | Windows shown: session, weekly, flagship weekly, period, credits (usage.ts:19-35). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | Only managed Cloud use is metered. |
| Local mode | Local and own-key use produces no account usage; the CLI prints the reason (usage_summary.rs:345-355). Mobile and web local mode behaviour for this screen unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web sets loading true on a foreground fetch | useManagedUsageSummary.ts:51 |
| Foreground failure | Error string 'Could not load usage' | useManagedUsageSummary.ts:74, 80 |
| Background failure | Keeps last reading, stale true | useManagedUsageSummary.ts:46-48, 79 |
| Unknown meter | Shows 'Unavailable' | UsageSection.tsx:321-327 |
| Credit read fails | 'Could not read your bonus credits. Refresh to retry.' | UsageSection.tsx:372, 394 |
| Timeout (CLI) | 5 second limit, then unavailable text | usage_summary.rs:12 |
| Offline | Same as a failed read; no separate offline state found | useManagedUsageSummary.ts:77-82 |
| Free plan | Upgrade view only on web | UsageSection.tsx:1224, 1313-1328 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/hooks/__tests__/useManagedUsageSummary.test.tsx`: Shared usage hook.
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Mobile cloud usage page.
- `apps/mobile/__tests__/cloud-usage-store.test.ts`: Mobile usage store.

**Test scenarios**

- **Meter matches server**
  1. Call /api/usage for an account.
  2. Open web Usage and mobile cloud usage for the same account.
  - Expected: Both show the same percent used.
- **Failed read**
  1. Block /api/usage.
  2. Open the usage screen.
  - Expected: Error or 'Unavailable' is shown, never 0% used.
- **Free plan**
  1. Sign in on a Free plan.
  2. Open web Settings, Usage.
  - Expected: 'Upgrade for higher capacity' and an Upgrade button; no meters.
- **CLI own key**
  1. Use the CLI without an AGI login.
  2. Run the usage command.
  - Expected: 'Unavailable' with the local or BYOK reason.
- **Background poll failure**
  1. Open web Usage.
  2. Block the network for one 300 second poll.
  - Expected: The last reading stays on screen.

**Where to look when it fails**

- Web error 'Could not load usage'.
- CLI error text after 'Unavailable:'.
- Mobile resource.error in the usage cards.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md)
- Desktop: [70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md)
- Mobile: [70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md)
- CLI: [70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md)
- VS Code: [70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md)
- Chrome: [70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md)

## 10. Gaps and dependencies

- **Web marks a failed poll stale but no visible stale notice was found.** Affects: Web, Desktop. Evidence: useManagedUsageSummary.ts:46-48. Work needed: Show a stale note or confirm the stale flag is read.
- **Chrome and VS Code meters were not opened in code.** Affects: Chrome, VS Code. Evidence: brief S78.08 only. Work needed: Read and test these views.
- **Mobile Free-plan view was not checked against the Upgrade-only rule.** Affects: Mobile. Evidence: cloud-usage/index.tsx not fully read. Work needed: Verify.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-observability-and-operations
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:GET /api/usage
- plan:free

## Unknown

- How Chrome shows usage.
- Whether Desktop shows extra native usage beyond the hosted web page.
- Whether Local usage is shown anywhere on mobile or desktop.
- Free-plan behaviour on mobile and VS Code.
