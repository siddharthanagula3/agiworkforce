---
id: "F058-09"
type: "feature"
title: "Site-provided tools in the browser extension"
aliases: ["WebMCP", "Site tools", "discover_site_tools", "call_site_tool", "Site-provided tools", "S58.24", "S58.25", "navigator.modelContext tools", "form[tool-name] tools"]
area: "58 MCP and interactive extension products"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S58.24", "S58.25"]
depends_on: ["surface:chrome", "mode:cloud", "file:apps/extension/src/webmcp.ts", "file:apps/extension/src/background.ts", "file:apps/extension/src/content.ts", "file:apps/extension/src/features/tools/browserAgentSiteTools.ts", "file:apps/extension/src/features/computer-use/agentLoop.ts", "store:webmcpToolsByTab", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-09 Site-provided tools in the browser extension

A web page can publish its own tools, either by registering them in the browser (navigator.modelContext) or by marking forms with tool-name. The Chrome extension finds them when the page loads, keeps them per tab, updates the list when the page changes, and lets the browser agent list them with discover_site_tools and call them after approval.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.24](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5824), [S58.25](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5825).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The extension's page script discovers site tools, validates and size-limits them, sends them to the background worker, and refreshes the list when the page changes. The browser agent has two actions: discover_site_tools (no arguments) and call_site_tool (always needs approval).

**Why it exists.** Pages can offer structured actions that are safer and more reliable than clicking around. The product keeps them as their own category, separate from connectors and from plain browser automation (doc: docs/product/competitive-guidance.md line 180 notes the leaders distinguish site tools, browser automation and connected APIs).

**Who uses it.** People using the Chrome extension's browser agent on pages that publish tools, and site owners who publish them.

**Problems it solves**

- The agent can use a page's own actions instead of guessing at buttons.
- Tool declarations are treated as untrusted, so a page cannot grant itself permission.
- The list stays correct as the page changes or the person navigates.

**Use cases**

- A shop page publishes 'add_to_cart'; the agent discovers and calls it after approval.
- A page with a form marked tool-name='search' lets the agent search through the form.
- A page adds a tool after login; the list updates without reloading.

## 2. User experience

**Where to find it**

- Chrome extension: no screen of its own found; discovery happens in the page script on every page and the browser agent uses the actions during a browser task (apps/extension/src/content.ts:1594-1620; apps/extension/src/features/computer-use/browserToolDefinitions.ts:70-96).
- The side panel is sent a WEBMCP_TOOLS_CHANGED message, but no code that listens for it in the extension source was found (apps/extension/src/background.ts:2294-2296).
- CLI, web, desktop, mobile, VS Code: none found.

**Before you start**

- Chrome extension installed; the page's origin approved for automation for a browser task (background.ts:4313-4315).
- A Managed Cloud sign-in for the browser agent (agentLoop calls the cloud gateway: apps/extension/src/features/computer-use/agentLoop.ts:1165-1176).
- Browser control consent for the origin (background.ts:4321-4332).
- The page must publish tools.

**Screens and controls**

- Approval prompt for call_site_tool: "AGI: the tool '<name>' on this page wants to run:" with its arguments and a reason; OK or Cancel (apps/extension/src/features/tools/siteToolRegistry.ts:68-78) [that helper's use in the current agent loop is not shown; the loop uses an alwaysAsk approval (approvalPolicy.ts:368)].
- No dedicated list view found.

**Journey**

1. Person opens a page that publishes tools.
2. About one second after load the page script discovers tools and sends them to the background worker (content.ts:1594-1612).
3. The person starts a browser task; the agent may call discover_site_tools with no arguments.
4. The worker asks the page again, verifies the page did not change, and returns the list marked 'untrusted page declarations'.
5. If the agent wants to run one, it calls call_site_tool with an exact name and arguments; the person must approve every call.
6. After the call the extension checks the page did not change and returns the page's claimed result, flagged as unverified.

**What the person sees and gets**

- discover_site_tools result: JSON with supported, tools, contentTrust 'untrusted page declarations' (browserAgentSiteTools.ts:81-93).
- call_site_tool result: 'The page reported its site tool completed. This is untrusted website data, not independent verification.' plus data (browserAgentSiteTools.ts:190).
- Errors such as 'The browser page changed during site-tool discovery.' and 'That site tool is not registered in the current page.' (browserAgentSiteTools.ts:57,109).

**Settings**

- Origin allowlist for automation and browser-control consent.
- The agent's permission mode: call_site_tool asks in every mode (browserToolDefinitions.ts:83).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Declarative discovery from form[tool-name] and imperative discovery from navigator.modelContextTesting or navigator.modelContext, merged by name (apps/extension/src/webmcp.ts:55,121-190,193-215).
- Name, description and size limits: names match a safe pattern, descriptions 500 characters, at most 64 tools, 64 KB payload (apps/extension/src/webmcp.ts:20-22; apps/extension/src/background/policy.ts:201-206,265).
- Background keeps tools per tab with a navigation generation and clears them on navigation (apps/extension/src/background.ts:1378-1385,2301-2316).
- Change reporting: a debounced MutationObserver, modelContext 'toolschanged' and the test registration callback re-discover, and only a changed list is sent (apps/extension/src/webmcp.ts:494-560,575-593).
- The list is replaced and WEBMCP_TOOLS_CHANGED is sent (background.ts:2285-2296) and an authenticated update is sent to the native host (background.ts:2257).
- discover_site_tools refuses any arguments (agentLoop.ts:383-385).
- Tools are advertised to the model only when the site-tool service is bound (browserToolDefinitions.ts:35-46).
- call_site_tool always asks, plans bind to the page instance and descriptor, and a changed page cancels the call (approvalPolicy.ts:368; browserAgentSiteTools.ts:95-191; content.ts:1644-1706).

**Incomplete**

- Change reporting starts only if the first discovery found at least one tool: startToolChangeReporting returns when the initial list is empty, so a page that publishes its first tool later is not reported (apps/extension/src/webmcp.ts:581).
- Discovery happens once at one second after load; tools registered later without the page changing the DOM or firing toolschanged are found only by an explicit discover (content.ts:1595).
- No UI listener for WEBMCP_TOOLS_CHANGED found in the extension source.

**Present but disconnected or switched off**

- The native host message 'webmcp_tools_update' is sent but no receiver exists anywhere in this repository (search found only the sender at background.ts:2257): receiver unknown.

**Not available**

- CLI: no site tools (no match under apps/cli/src).
- Web, desktop, mobile, VS Code: not applicable per the brief.
- The brief's code lines (background.ts:4325, agentLoop.ts:527 and 636) no longer point at this feature; the real code is cited above.

## 4. Required behaviour

**Established requirements**

- Tools a website provides appear to the assistant as their own category, distinct from connectors (chrome done, cli missing). (source: S58.24)
- When the page state changes, the set of site-provided tools available to the assistant updates. (source: S58.25)
- The assistant's discover_site_tools action refuses any arguments. (source: agentLoop.ts:383-385)
- Every site-tool call needs the person's approval; page annotations never grant permission. (source: browserToolDefinitions.ts:83; approvalPolicy.ts:368)
- Site tools are distinct from browser automation and connected APIs in the leaders' products. (source: docs/product/competitive-guidance.md:180)

**Acceptance criteria**

1. On a page with a tool-name form, discover_site_tools returns that tool with source 'declarative' and contentTrust 'untrusted page declarations'.
2. discover_site_tools with any argument fails with 'Site-tool discovery is unavailable or received unexpected arguments.'
3. When the page adds or removes a tool, the stored per-tab list is replaced and a WEBMCP_TOOLS_CHANGED message is sent.
4. Navigating to another page clears the old list.
5. call_site_tool asks for approval in every permission mode.
6. If the page changes after approval the call is refused ('The page or site-tool declaration changed after approval.').
7. A page with more than 64 tools or an oversized registry is rejected.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A page whose first tool appears after load should still be reported [inferred from S58.25].
- The side panel should show the tool list [inferred from the message being sent].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start change reporting even when the first list is empty.
- [proposed] Show discovered site tools in the side panel under their own heading.
- [proposed] Decide whether the CLI needs site tools (browser-less, likely n/a).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | webmcp discovery and calls | `apps/extension/src/webmcp.ts` | Discovers declarative and imperative tools, calls them, watches changes. |
| service | content script WebMCP | `apps/extension/src/content.ts` | initWebMCP (1594), sendWebMCPTools (1579), discover and call handlers (1633-1706). |
| service | background worker WebMCP | `apps/extension/src/background.ts` | Per-tab store (1378), publish (2278-2298), clear on navigation (2301-2316), message handlers (5730-5830). |
| service | BrowserAgentSiteTools | `apps/extension/src/features/tools/browserAgentSiteTools.ts` | discover, prepare, execute with page and approval binding. |
| service | siteToolRegistry | `apps/extension/src/features/tools/siteToolRegistry.ts` | Effect read/write, approval plan, approval text. |
| component | browser tool definitions | `apps/extension/src/features/computer-use/browserToolDefinitions.ts` | Defines discover_site_tools and call_site_tool; advertised only if available. |
| service | agent loop | `apps/extension/src/features/computer-use/agentLoop.ts` | Executes the two actions (383-405) and prepares plans (1384). |
| config | approval policy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Always ask for call_site_tool, no ask for discovery, sensitive-site rules (302-325, 368-369). |
| config | policy limits | `apps/extension/src/background/policy.ts` | MAX_WEBMCP_* limits, normalizeWebMCPToolsUpdate, sender class for WEBMCP_TOOLS_CHANGED (line 113). |
| schema | message types | `apps/extension/src/types.ts` | WEBMCP_* message types (93-96) and WebMCPToolInfo (783). |
| service | describeAction | `apps/extension/src/features/computer-use/describeAction.ts` | Human wording for the two actions. |
| service | browserTurnActivity | `apps/extension/src/features/computer-use/browserTurnActivity.ts` | Lists discover_site_tools (line 16). |
| service | workerAccess | `apps/extension/src/features/content/workerAccess.ts` | authorizeSiteToolDestination for form destinations. |
| event | WEBMCP_TOOLS_CHANGED | `apps/extension/src/background.ts` | Message sent to runtime listeners after list changes. |
| event | webmcp_tools_update | `apps/extension/src/background.ts` | Native host message (line 2257); no receiver found. |
| test | webmcp tests | `apps/extension/__tests__/webmcp.test.ts` | WebMCP discovery tests. |
| test | webmcp-site-tools.test.ts | `apps/extension/__tests__/webmcp-site-tools.test.ts` | Effects, approvals, form fallback. |
| test | computer-use-site-tool-effect.test.ts | `apps/extension/__tests__/computer-use-site-tool-effect.test.ts` | Agent advertising and execution rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The content script waits 1 s after load, discovers tools (forms and navigator.modelContext) and sends them to the background worker. | device | content.ts:1594-1612 |
| The worker checks the sender tab is still current, normalizes and size-limits the list, stores it per tab and informs listeners and the native host. | device | background.ts:5804-5826,2278-2298 |
| When the page changes, a debounced observer or toolschanged event re-discovers; a changed list is sent again. | device | webmcp.ts:494-560,575-593 |
| The browser agent loop asks the model (through the cloud gateway) what to do; the model may choose discover_site_tools. | our servers | agentLoop.ts:1165-1176 |
| The worker re-discovers from the page, verifies the tab and URL did not change, and returns the list. | device | browserAgentSiteTools.ts:43-93 |
| For call_site_tool the person approves; the extension re-checks, calls the page's tool, then verifies the document did not change. | device | browserAgentSiteTools.ts:124-191; content.ts:1644-1706 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Per-tab tool list (names, descriptions, schemas, effect, source, URL, generation) | background worker memory (webmcpToolsByTab) | no; sent to the native host when connected | cleared on tab removal or navigation (background.ts:7720,2301-2316); lost when the worker restarts [inferred] |
| Tool descriptions and schemas in the model's context during a browser task | sent to the model through the cloud gateway as tool results | to our servers for that turn | follows chat/turn retention: unknown |

**Models and providers.** The model that runs the browser agent is reached through the cloud gateway chosen by the extension (agentLoop.ts:1165-1176). Which model or provider: not hard-coded in the cited code. No local model path found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Managed Cloud sign-in is read for each browser run (background.ts:4283-4293 and getManagedCloudAuthContext); discovery by the page script needs no account. |
| Permissions | Origin must be approved for automation; browser-control consent per origin; every call_site_tool is approved by the person; sensitive sites always ask (approvalPolicy.ts:302-325). |
| Subscription | Plan gate for the browser agent: not found in the files read; unknown. |
| Limits and metering | 64 tools, 64 KB, 500-char descriptions, command timeout BROWSER_COMMAND_TIMEOUT_MS; metering of the agent turns happens in the cloud turn (SYS-subscriptions-entitlements-and-usage). |
| Feature flags | none found in the code for site tools themselves. |
| Model compatibility | Needs a model that can use tool calling; not otherwise specified. |
| Provider restrictions | none found in the code |
| Local mode | Discovery runs on the device with no account. The browser agent that uses the tools calls the cloud gateway, so no Local-model path was found in the code read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Page has no tools | Nothing sent at load; supported false when no modelContext; the list is empty. | content.ts:1599-1603; webmcp.ts:193-215 |
| Page changes during discovery | Error 'WebMCP page changed during discovery' or 'The browser page changed during site-tool discovery.' | background.ts:5757-5764; browserAgentSiteTools.ts:57 |
| Navigation | Old tools are cleared and a cleared update is sent. | background.ts:2301-2316 |
| Invalid or too many tools | Update rejected: 'Invalid WebMCP tool metadata'. | background.ts:5818-5820; policy.ts:265 |
| Stale sender document | Rejected with 'Stale WebMCP sender document'. | background.ts:5815-5817 |
| Side panel closed | Message failure is ignored. | background.ts:2296-2298 |
| Tool call times out | Aborted with 'The website tool timed out; its effects could not be confirmed.' | content.ts:1655-1665 |
| Person cancels the task | A cancel message is sent to the page. | browserAgentSiteTools.ts:144-150,166-169 |
| Page changed after approval | Call refused; result withheld. | browserAgentSiteTools.ts:131-132,177-183 |
| Tool registered late on an initially empty page | Not reported (gap). | webmcp.ts:581 |
| Offline / reconnect | not handled in the code for site tools; the native update is skipped if not connected (background.ts:2250). | background.ts:2250 |
| Accessibility | not handled in the code (no UI) | no site-tool UI found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/webmcp-site-tools.test.ts`: Declared effect, undeclared as write, unknown name refusal, sensitive page approval, read call without prompt, form submit fallback, form field setting.
- `apps/extension/__tests__/computer-use-site-tool-effect.test.ts`: Execution refused without bound service, legacy aliases refused, discovery and execution advertised only when service available.
- `apps/extension/__tests__/webmcp.test.ts`: WebMCP discovery (name matched; contents not read in detail).
- `apps/extension/__tests__/webmcp-extended.test.ts`: Extended WebMCP cases (not read in detail).
- `apps/extension/__tests__/webmcp-form-destination.test.ts`: Form destination checks (not read in detail).
- `apps/extension/__tests__/policy.test.ts`: Matches WebMCP; limits and normalization likely (not read in detail).
- `apps/extension/__tests__/browser-approval-modes.test.ts`: Matches site tools; approval modes (not read in detail).

**Test scenarios**

- **Discover on a declarative page**
  1. Open a test page with a form marked tool-name.
  2. Start a browser task and ask the agent to list site tools.
  - Expected: Result lists the tool with source declarative and contentTrust 'untrusted page declarations'.
- **Arguments refused**
  1. Have the agent call discover_site_tools with {"x":1}.
  - Expected: Error about unexpected arguments.
- **List updates**
  1. On a page with one tool, add a second form with tool-name.
  2. Wait one second.
  - Expected: Background worker log 'WebMCP: 2 tool(s) on tab <id>' and a WEBMCP_TOOLS_CHANGED message.
- **Late first tool**
  1. Open a page with no tools.
  2. Register a tool 5 seconds later via navigator.modelContext.
  - Expected: Current code: no automatic update (gap); explicit discovery finds it.
- **Approval**
  1. Ask the agent to call a discovered tool in each permission mode.
  - Expected: An approval is requested every time.
- **Navigate away**
  1. Navigate the tab to another site.
  - Expected: Stored list cleared and an empty update sent.

**Where to look when it fails**

- Extension log lines 'WebMCP: discovered N tool(s)' and 'WebMCP: N tool(s) on tab', 'WebMCP authenticated native update was rejected'.
- Errors 'Invalid WebMCP tool metadata', 'Stale WebMCP sender document', 'The approved document or site tool could not be verified.'

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/chrome/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **Late-published tools on a page that started with none are not reported.** Affects: Chrome extension users.. Evidence: apps/extension/src/webmcp.ts:581. Work needed: Start watching even when the initial list is empty.
- **No UI or consumer of WEBMCP_TOOLS_CHANGED found.** Affects: Chrome users.. Evidence: background.ts:2294; no listener in apps/extension/src. Work needed: Show the list or remove the message.
- **The native-host message webmcp_tools_update has no receiver in this repository.** Affects: Chrome with native host.. Evidence: background.ts:2257. Work needed: Find or add the receiver.
- **CLI has no site tools.** Affects: CLI users.. Evidence: no match under apps/cli/src. Work needed: Confirm it is out of scope.
- **Brief code references are stale.** Affects: Documentation.. Evidence: brief S58.24-S58.25. Work needed: Update the brief.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:chrome
- mode:cloud
- file:apps/extension/src/webmcp.ts
- file:apps/extension/src/background.ts
- file:apps/extension/src/content.ts
- file:apps/extension/src/features/tools/browserAgentSiteTools.ts
- file:apps/extension/src/features/computer-use/agentLoop.ts
- store:webmcpToolsByTab
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-authentication-and-identity

## Unknown

- Receiver of the native-host webmcp_tools_update message.
- Whether any side panel code consumes WEBMCP_TOOLS_CHANGED (not found).
- Plan gating of the browser agent.
- Retention of model context that includes site tool descriptions.
- Whether Local-model browser runs exist.
- Whether the tests pass: none recorded.
