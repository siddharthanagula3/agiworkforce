---
id: "F066-08"
type: "feature"
title: "Usage and context-window indicator"
aliases: ["Usage ring", "UsageRing", "Usage menu", "Context window bar", "Plan usage limits", "CodeUsageWarning", "CodeUsageDashboard", "Context-usage indicator (S66.27)", "Usage/cost indicator (S66.28)", "token counter"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.27", "S66.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-observability-and-operations", "api:GET /api/usage", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-08 Usage and context-window indicator

Shows how much plan usage and how much of the model's context window a coding session has used. Web and desktop show a ring beside the composer with a popover and a warning banner. The CLI shows a context meter and token counts. VS Code shows a status-bar token and credit counter. Mobile shows plan usage and, for cloud tasks, context.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.27](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6627), [S66.28](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6628).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the person a quick read on two limits: the plan's usage limits (five-hour, weekly) and how full the model's context window is for the session. On the web ring, the arc shows plan usage, and the popover adds a context bar when both numbers are known (apps/web/features/code/components/CodeComposer.tsx:1521-1650).

**Why it exists.** A coding session can run long. People need warning before a limit stops them or the context is full. For Free accounts the product shows only an Upgrade prompt, never meters (doc: owner product decision recorded in project memory 'Free usage = Upgrade only'; code: CodeComposer.tsx:1611-1618; test apps/web/features/code/components/CodeUsageRing.test.tsx:64).

**Who uses it.** Anyone running coding sessions who is on a metered paid plan or wants to see context fill.

**Problems it solves**

- Surprise rate-limit stops.
- Sessions that silently slow down as the context fills.
- Not knowing when limits reset.

**Use cases**

- See the weekly bar at 90 percent and a warning banner with the reset time.
- Open the ring popover to check 'Context window' fill during a long local session.
- On a Free plan, open the ring and tap Upgrade.
- In the CLI, watch the 'ctx' meter go from green to red.

## 2. User experience

**Where to find it**

- Web Code page (cloud): ring button labelled 'Usage' in the composer controls row (CodeComposer.tsx:2162); context numbers come from the selected cloud session (apps/web/features/code/CloudCodePage.tsx:2861-2866).
- Web Code page (local session, desktop): the same ring in the local session panel (apps/web/features/code/components/LocalSessionPanel.tsx:1885-1887).
- Usage dashboard: a collapsible block on the Code page (CloudCodePage.tsx:2762, component CodeUsageDashboard.tsx). The popover link 'See detailed breakdown' goes to Settings, Usage (CodeComposer.tsx:1640-1646; code-surface.ts:29).
- Mobile: in the cloud task options sheet, rows for 'Context window' and the managed usage buckets (apps/mobile/src/features/cloud-code/components/CloudCodeTaskOptionsSheet.tsx:149,215-250); in the remote code session menu, an action to the cloud usage settings (apps/mobile/src/features/companion/components/CodeSessionView.tsx:296-298).
- CLI: header meter 'context [bar] N%' and 'ctx' bar, with 'catalog est.' wording when the session is Local (apps/cli/src/tui/tui_app.rs:2573-2580,3513-3530); token counts 'in X · out Y' (tui_app.rs:3419-3425).
- VS Code: status bar token counter (apps/extension-vscode/src/data/tokenCounter.ts) and a context usage line in the chat panel (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4478-4500).

**Before you start**

- Web usage numbers need a signed-in account and a recognised paid plan (CodeComposer.tsx:1530-1532).
- Context numbers need a known context size for the model (getModelMetadata(...).contextWindow, LocalSessionPanel.tsx:1887) and a token count from the session.

**Screens and controls**

- Ring button with aria-label 'Usage'.
- Popover: 'Context window' bar with 'used / window (percent)' text, 'Plan usage limits' heading, bars 'Five hour limit', 'Weekly, all models', 'Weekly, top model' with reset time, 'See detailed breakdown' link (code-surface.ts:249-257).
- Free plan: only an 'Upgrade' button.
- Warning banner for a bucket near its limit with Upgrade and dismiss (CodeComposer.tsx:1654-1680).

**Journey**

1. 1. Open a coding session.
2. 2. Look at the ring beside the composer; on a paid plan the arc fills with plan usage.
3. 3. Click or tap the ring.
4. 4. Read the context bar and plan bars with reset times.
5. 5. Follow 'See detailed breakdown' for history, or tap Upgrade on Free.
6. 6. If a bucket nears its limit a banner appears; dismiss it or Upgrade.

**What the person sees and gets**

- Spinner while usage loads.
- 'Usage is not available right now.' when no bars could be read (code-surface.ts:257).
- Context text such as '12K / 200K (6%)' from contextWindowLabel (code-surface.ts:669-672).

**Settings**

- Usage settings section reached by the breakdown link (code-surface.ts:29).
- VS Code context warning percent setting is read (contextWarningPercent, webviewContent.ts:4495); its configuration name was not opened.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: ring, popover, plan bars, free-plan Upgrade-only, warning banner and dashboard (CodeComposer.tsx:1521-1680; CodeUsageDashboard.tsx).
- Web: usage is fetched from GET /api/usage and shared between components, revalidated every 300000 ms while the user is active, and a failed background poll keeps the old reading and marks it stale (apps/web/lib/hooks/useManagedUsageSummary.ts:22,31-64).
- Web local: context tokens arrive in the CLI turn event and are stored by the session hook (apps/web/features/code/hooks/use-local-session.ts:759-760; apps/cli/src/app_server/developer_host.rs:4667-4829).
- Web cloud: context uses the session's stored input and output token totals (apps/web/features/code/CloudCodePage.tsx:2861-2864; apps/web/lib/services/cloud-code-agent-service.ts:462).
- CLI: context meter with colour steps and Local-mode estimate wording; token counts (tui_app.rs:3513-3530,3419).
- VS Code: counter of tokens, billed credits and an estimated cost; settles billed credits from the server (apps/extension-vscode/src/data/tokenCounter.ts:79-120).
- Mobile: usage rows and a context row for cloud code tasks (CloudCodeTaskOptionsSheet.tsx:149,215-250).

**Incomplete**

- The ring arc shows plan usage only, not context; context appears only inside the popover and only if both numbers exist (CodeComposer.tsx:1594-1608). The brief describes the ring as the context indicator.
- Mobile remote code sessions (companion view) show no context or cost; only a menu link to usage (CodeSessionView.tsx:296-298). The brief says cost is done for mobile; not found in the lines it cites.
- VS Code estimated cost uses a rate table imported from modelConstants (tokenCounter.ts:3,115) while the project forbids hardcoded prices (doc: AGENTS.md section 4); the table contents were not opened.

**Present but disconnected or switched off**

- none found: no switched-off code was found for this item.

**Not available**

- Chrome extension: not applicable per the brief.
- Dollar spend on the web ring: not found; the web shows percentages and resets, not money.

## 4. Required behaviour

**Established requirements**

- The workspace shows how much of the model's context window the session has used. (source: S66.27 Should)
- The coding surface shows how much plan usage or money the user has spent. (source: S66.28 Should)
- Free usage screens show only Upgrade, never meters. (source: apps/web/features/code/components/CodeUsageRing.test.tsx:64-76)
- Usage numbers come from the managed usage summary. (source: apps/web/lib/hooks/useManagedUsageSummary.ts)
- A warning appears when usage is near a limit. (source: apps/web/features/code/components/CodeUsageWarning.test.tsx)

**Acceptance criteria**

1. Paid plan: the ring arc matches usage_percentage and the popover lists the buckets that have a percentage, each with a reset time.
2. Free plan: the popover shows only 'Upgrade' and no percentage.
3. Unrecognised plan: no meter and 'Usage is not available right now.'
4. With context tokens and a known window, the popover shows 'Context window' with the right percentage and bar width capped at 100.
5. At 90 percent weekly usage the banner appears with 'Resets' text; Upgrade opens the plan flow; below the threshold it stays hidden.
6. A failed background refresh keeps the previous numbers visible.
7. CLI: the context meter colour escalates as percent rises and reads 'est.' in Local mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The ring should probably show context fill when plan usage is unavailable, to match the brief's wording [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a money or credit figure next to the percentage for plans that meter by credits.
- [proposed] Add a context meter to the mobile code-session view.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | UsageRing | `apps/web/features/code/components/CodeComposer.tsx` | Ring, popover, context bar, plan bars (line 1521). |
| component | CodeUsageWarning | `apps/web/features/code/components/CodeComposer.tsx` | Warning banner (line 1654); mounted at line 1897. |
| component | CodeUsageDashboard | `apps/web/features/code/components/CodeUsageDashboard.tsx` | Usage history block on the Code page; fetches /api/usage/history. |
| hook | useManagedUsageSummary | `apps/web/lib/hooks/useManagedUsageSummary.ts` | Shared fetch and revalidation of /api/usage. |
| endpoint | GET /api/usage | `apps/web/app/api/usage/route.ts` | Returns the managed usage summary; scope usage:read for API keys. |
| service | getManagedUsageSummary | `apps/web/lib/services/managed-usage-summary-service.ts` | Builds the summary returned by the route. |
| hook | useLocalSession | `apps/web/features/code/hooks/use-local-session.ts` | Holds contextTokens from turn events (lines 186,759). |
| component | LocalSessionPanel | `apps/web/features/code/components/LocalSessionPanel.tsx` | Mounts the ring with the local context numbers (line 1885). |
| component | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Passes cloud session context totals and the model window. |
| service | cloud-code-agent-service | `apps/web/lib/services/cloud-code-agent-service.ts` | Writes context_input_tokens totals (line 462). |
| service | Developer host turn event | `apps/cli/src/app_server/developer_host.rs` | Computes context_tokens after each turn (line 4667). |
| schema | developer session event contextTokens | `crates/agiworkforce-protocol/src/developer_session.rs` | Event field context_tokens (line 2590). |
| component | CLI header meters | `apps/cli/src/tui/tui_app.rs` | Context meter and token counts. |
| service | TokenCounter | `apps/extension-vscode/src/data/tokenCounter.ts` | VS Code status-bar counter, billed credits settlement. |
| component | VS Code context usage line | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | renderContextUsage (line 4478). |
| component | CloudCodeTaskOptionsSheet | `apps/mobile/src/features/cloud-code/components/CloudCodeTaskOptionsSheet.tsx` | Mobile context and usage rows. |
| component | CodeSessionView menu | `apps/mobile/src/features/companion/components/CodeSessionView.tsx` | Menu action to cloud usage settings (line 296). |
| config | CODE_COPY usage strings | `apps/web/features/code/code-surface.ts` | Labels and contextWindowLabel. |
| test | CodeUsageRing test | `apps/web/features/code/components/CodeUsageRing.test.tsx` | Ring behaviour by plan. |
| test | CodeUsageWarning test | `apps/web/features/code/components/CodeUsageWarning.test.tsx` | Banner behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The ring hook fetches the usage summary from the web API with the signed-in cookie and shares it across components. | device and our servers | apps/web/lib/hooks/useManagedUsageSummary.ts:31-45; apps/web/app/api/usage/route.ts |
| The server builds the summary from the account's usage records for the user. | our servers | apps/web/app/api/usage/route.ts:20-28 |
| The hook revalidates every 300 seconds while the page is active. | device | useManagedUsageSummary.ts:22,56-64 |
| Local: after each turn the CLI computes context tokens and sends them in the turn event; the page stores the number. | device | apps/cli/src/app_server/developer_host.rs:4667-4829; use-local-session.ts:759-760 |
| Cloud: the server adds each turn's token totals to the session row and the page reads them with the session. | our servers | apps/web/lib/services/cloud-code-agent-service.ts:462; apps/web/lib/services/cloud-code-session-service.ts:433 |
| The page divides tokens by the model's context window from the model catalog and draws the bar. | device | LocalSessionPanel.tsx:1887; code-surface.ts:669-672 |
| VS Code settles billed credits by asking the server for each request's cost. | device and our servers | apps/extension-vscode/src/data/tokenCounter.ts:79-92 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Managed usage summary (percentages, reset times) | server usage records; shared in memory on the page | Fetched per page | Page memory only; server retention unknown |
| Context token totals per cloud session | cloud code session row (columns context_input_tokens and output counterpart) | Server | With the session |
| Local context token count | page state from CLI event | No | Lost when the page reloads until the next turn event [inferred] |

**Models and providers.** The context window size comes from the generated model catalog (SYS-model-catalog-and-routing); the token count comes from the provider's usage report for cloud and from the CLI's own estimator locally. Which provider runs the turn does not change the display.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web usage ring needs a signed-in account (GET /api/usage requires authentication, apps/web/app/api/usage/route.ts:15-23). |
| Permissions | API key access needs the usage:read scope (route.ts:15). |
| Subscription | Meters appear only on recognised paid plans; Free sees Upgrade only (CodeComposer.tsx:1530-1532,1611-1618). Per-plan limits come from SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | The route is rate limited under the 'credits-balance' bucket (route.ts:37-39). Buckets shown: five hour, weekly all models, weekly top model. |
| Feature flags | none found in the code. |
| Model compatibility | If the model has no known context window the context bar is not drawn (CodeComposer.tsx:1594). |
| Provider restrictions | none found in the code. |
| Local mode | In a Local session context tokens still come from the on-device CLI; the CLI labels the meter 'catalog est.' because the window comes from the catalog (tui_app.rs:3517-3526). The web ring still asks the account usage API, so a signed-out Local user shows no plan bars [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner inside the popover. | CodeComposer.tsx:1609 |
| Empty or unrecognised plan | 'Usage is not available right now.' and no ring fill. | CodeComposer.tsx:1621-1623 |
| Free plan | Upgrade button only. | CodeComposer.tsx:1611-1618 |
| Error on background refresh | Old numbers stay, marked stale. | useManagedUsageSummary.ts:42-50 |
| Error on first load | error text kept in shared state; the popover shows the unavailable line. | useManagedUsageSummary.ts:46-48 |
| Banner dismissed | Hidden until the page reloads. | CodeComposer.tsx:1656,1668 |
| Offline, retry, timeout | not handled in the code beyond the 5-minute re-poll. | useManagedUsageSummary.ts:56-64 |
| Accessibility | Ring button has an aria-label; the ring svg is hidden from assistive tech. | CodeComposer.tsx:1553-1560 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/CodeUsageRing.test.tsx`: Paid plan meters with reset times; Free plan Upgrade only; unrecognised plan shows no meter.
- `apps/web/features/code/components/CodeUsageWarning.test.tsx`: Hidden while comfortable; warns near a limit with reset text; Upgrade opens plan flow.
- `apps/web/features/code/components/CodeUsageDashboard.test.tsx`: Usage dashboard block.
- `packages/ui/unified-chat/src/components/__tests__/UsageWarningBanner.test.tsx`: Shared banner component.
- `packages/contracts/types/src/__tests__/usage-vocabulary.test.ts`: Shared usage wording and warning selection.
- `apps/extension-vscode/src/__tests__/tokenCounter.test.ts`: VS Code token counter.

**Test scenarios**

- **Paid plan meters**
  1. Sign in on a paid plan.
  2. Open /code and click the 'Usage' ring.
  - Expected: Context bar when a session is open, plus plan bars with resets and a breakdown link.
- **Free plan**
  1. Sign in as a Free account.
  2. Open the ring.
  - Expected: Only 'Upgrade'; no numbers.
- **Near limit**
  1. Use an account with weekly usage at or above the warning threshold.
  - Expected: Banner with reset time; dismiss hides it.
- **Local context growth**
  1. On the desktop run several turns in a local session.
  2. Open the ring after each.
  - Expected: Context percentage rises with each turn.
- **CLI meter**
  1. Run the CLI terminal interface and a long chat.
  - Expected: Meter colour escalates; 'est.' wording in Local mode.

**Where to look when it fails**

- Network call GET /api/usage; log text 'Failed to fetch usage data' (apps/web/app/api/usage/route.ts:31).
- Page error text 'Could not load usage' (useManagedUsageSummary.ts:39).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- Mobile: [70-qa/test-plans/mobile/066-coding-workspace-frontend.md](../../70-qa/test-plans/mobile/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **Web ring arc ignores context fill.** Affects: surface:web and surface:desktop. Evidence: CodeComposer.tsx:1521-1590. Work needed: Decide if the arc should show context; update the brief or code.
- **Mobile remote code sessions have no context or cost indicator.** Affects: surface:mobile. Evidence: CodeSessionView.tsx:296-298 only links to usage. Work needed: Add context and spend to the companion code session.
- **No money amount on the web or mobile for the coding surface; only percentages.** Affects: S66.28 'money' part. Evidence: CodeComposer.tsx:1594-1650. Work needed: Add a credit or money line where the plan allows.
- **VS Code cost uses a rate table imported from modelConstants.** Affects: surface:vscode. Evidence: tokenCounter.ts:3,115. Work needed: Source rates from the model catalog or billed credits only.
- **Brief line references are stale (for example CodeSessionView.tsx:108 and :272 show no usage code).** Affects: Brief readers. Evidence: Files opened. Work needed: Refresh references.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-observability-and-operations
- api:GET /api/usage
- mode:local
- mode:cloud

## Unknown

- Exact table and column names behind the usage summary service (service file not opened).
- Whether the CLI shows money spend; only token counts and context percent were read.
- What VS Code's contextWarningPercent setting is called in configuration.
- Whether the Tauri desktop app has its own indicator; only the Electron path (hosted web page) was read.
