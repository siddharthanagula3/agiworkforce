---
id: "F064-08"
type: "feature"
title: "Act on a website"
aliases: ["Website search", "Form filling", "Multi-step website task", "Structured site-tool invocation", "WebMCP", "browser_click", "browser_type", "browser_fill_form", "browser_find", "discover_site_tools", "call_site_tool", "Autofill", "Run Autofill"]
area: "64 Browser-assistant experience"
available_on: ["desktop", "cli", "vscode", "chrome"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "partial", vscode: "partial", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S64.14", "S64.15", "S64.16", "S64.17"]
depends_on: ["surface:chrome", "surface:desktop", "surface:cli", "surface:vscode", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "F064-07", "F064-10", "F064-11", "F064-12", "file:apps/extension/src/features/computer-use/agentLoop.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-08 Act on a website

The assistant works on a website for the person: it reads the page, clicks, types, fills several form fields at once, chains steps toward a goal, and calls tools a site declares (WebMCP) in Chrome. It never submits payment or password fields; the person does that. Chrome, Desktop chat, the CLI and VS Code reach it differently.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.14](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6414), [S64.15](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6415), [S64.16](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6416), [S64.17](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6417).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Carries out a goal on a website over several steps: search a site, fill forms, click through, and call structured tools that a page declares instead of clicking.

**Why it exists.** People want the assistant to do web chores, not just read pages. Page text is untrusted and forms hold sensitive data, so each step is verified and sensitive fields are left to the person.

**Who uses it.** Chrome extension users with a browser task; Desktop chat, CLI and VS Code users whose assistant drives their paired Chrome.

**Problems it solves**

- Repeating a form or search by hand.
- Model claims of success that did not happen: each click and typed field is read back and marked verified or not.
- Sending passwords or card numbers through a model.

**Use cases**

- In Chrome: 'Search this store for a 12 inch pan and list the first five prices.'
- In the CLI: the model lists the page's controls with browser_find, fills a contact form with browser_fill_form, and tells the person to press submit.
- In Chrome on a site that declares WebMCP tools: the model discovers them and calls one after the person approves.
- A multi-step goal: sign-in is handed to the person (F064-10), then the assistant continues.

## 2. User experience

**Where to find it**

- Chrome extension side panel: enter a goal for a browser task; the panel shows the step log (apps/extension/src/features/side-panel/computerUsePanel.ts:1880-2000).
- Chrome 'Run Autofill' button for job application forms (apps/extension/src/features/side-panel/computerUsePanel.ts:1208-1215).
- CLI and VS Code: the model uses browser_find, browser_click, browser_type, browser_fill_form; the terminal prints 'Click(<selector>)', 'Type(<selector>)', 'Fill in the form' (apps/cli/src/platform/runtime/tool_catalog.rs:181-205).
- Desktop inside the web app: 'Use the browser' dialog offers 'Click' and 'Type' with 'CSS selector' and 'Text' fields (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:77-78, 86-90). Cloud chat steps device_browser_click and device_browser_type exist (packages/contracts/local-runtime/src/device-steps.ts:273-280).

**Before you start**

- Chrome: signed-in AGI account, the site approved, browser control consented (apps/extension/src/features/computer-use/agentLoop.ts:268-281).
- Desktop, CLI, VS Code: Desktop running and Chrome paired; the site approved in the extension.

**Screens and controls**

- Chrome step log with icons and 'Completed', 'Skipped', 'Not verified' titles (apps/extension/src/features/side-panel/computerUsePanel.ts:1905-1926).
- Approval card 'Approve action: <tool>' (computerUsePanel.ts:879-912).
- 'You added details' guidance box to steer a run (computerUsePanel.ts:1900-1906, 1790-1822).
- Desktop dialog: Click, Type, Run and Add to chat.
- CLI approval prompts: 'The agent wants to fill in these fields in your signed-in Chrome.' with selector and value lines (apps/cli/src/features/exec/tools/mod.rs:1483-1502).

**Journey**

1. The person gives a goal (Chrome) or asks in chat (Desktop, CLI).
2. The extension reads the page into numbered elements (read_dom) and the model picks an element by index (apps/extension/src/features/computer-use/agentLoop.ts:1100-1127).
3. For a click the extension checks approval needs (purchase, sensitive site, file input, unidentified control), clicks, waits, reads the URL and the control state (agentLoop.ts:523-601).
4. For typing it sends the text and then verifies that the field kept it (agentLoop.ts:743-812).
5. For site tools the model calls discover_site_tools, then call_site_tool, which always asks (apps/extension/src/features/computer-use/browserToolDefinitions.ts:70-96; approvalPolicy.ts:365).
6. For CLI form fill the CLI pins the active tab, shows the fields for approval, and the extension fills them, refusing password and payment fields (apps/cli/src/features/exec/tools/mod.rs:1394-1430; apps/extension/src/features/content/pageElements.ts:245-250).
7. The model reports what it did and what remains.

**What the person sees and gets**

- Each tool result in the Chrome log is marked Completed (verified), Not verified, or Skipped (apps/extension/src/features/side-panel/computerUsePanel.ts:1905-1926).
- Click result text includes 'verified: page URL after click = ...' and the observed control state (agentLoop.ts:593-597).
- Type result states whether the field retained the input or could not be verified (agentLoop.ts:787-801).
- Fill form returns lists of filled and failed fields with reasons such as 'This is a password, payment or one-time code field; the user has to fill it in themselves.' (apps/extension/src/features/native-bridge/desktopCommands.ts:191-196; apps/extension/src/features/computer-use/approvalPolicy.ts:163-164).

**Settings**

- Chrome options 'Browser control': Auto, ask first, Full access, unattended (apps/extension/src/features/options/site-permission-policy.ts:57-89).
- Chrome approved and blocked sites.
- CLI tool permissions and domain rules (apps/cli/src/permissions.rs via url_blocked_by_domain_rule, used at apps/cli/src/features/exec/tools/mod.rs:1351-1356).
- VS Code 'Browser' tool group toggle (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1098-1114).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome: click, type, hover, press_key, scroll, drag, swipe, select_option, find, read_dom, screenshot, discover_site_tools and call_site_tool are defined (apps/extension/src/features/computer-use/browserToolDefinitions.ts).
- Chrome: after a click the loop waits, reads the URL, checks the allowlist, and reads the control state (apps/extension/src/features/computer-use/agentLoop.ts:523-601).
- Chrome: typed text is verified against the field and reported as verified, refused or unverifiable (agentLoop.ts:743-812).
- Chrome: site tools are offered only when a site-tool object exists; every call asks in every permission mode that can ask, and results are treated as untrusted (browserToolDefinitions.ts:35-43, 80-96; agentLoop.ts:383-409). In the unattended mode it is refused (apps/extension/src/background.ts:6506).
- Chrome: page text is scanned for prompt injection and the run aborts on a hit (agentLoop.ts:285-299).
- Chrome paired mode refuses typing into a password, payment or one-time-code field and a click that completes a purchase (apps/extension/src/features/computer-use/approvalPolicy.ts:333-351).
- Desktop-issued fill form: up to 50 fields, 10,000 characters each, nothing submitted, protected fields refused (apps/desktop/electron/browser/commandGate.ts:78-104, 242-256; apps/extension/src/features/content/pageElements.ts:245-250).
- CLI: browser_find, browser_click, browser_type, browser_fill_form exist; fill form pins the active tab and shows fields for approval (apps/cli/src/platform/runtime/tool_catalog.rs:46-57; apps/cli/src/features/exec/tools/mod.rs:1394-1430, 1483-1502).
- Desktop chat (cloud turn): device_browser_click and device_browser_type exist with an optional 'review' sentence that raises a 'Check this step' prompt (packages/contracts/local-runtime/src/device-steps.ts:273-280; apps/web/lib/device-steps/device-tools.ts:410-441; apps/desktop/electron/browser/browserSteps.ts:119-132, 161-167).

**Incomplete**

- Website search is not a tool of its own: it is done by typing and clicking on the site (brief S64.14 cites browser tools; no search-specific code found).
- Chrome fill is done by repeated type calls, not by a batch tool (tool list has type, not fill_form, in browserToolDefinitions.ts); a batch fill_form exists only in the paired-browser command set (apps/extension/src/features/native-bridge/desktopCommands.ts:191).
- Desktop cloud-chat steps have no browser_find and no fill_form (packages/contracts/local-runtime/src/device-steps.ts:52-59).
- The 'Failure: not fully verified' line in the draft: results that cannot be verified are labelled Not verified rather than failed (computerUsePanel.ts:1923).

**Present but disconnected or switched off**

- call_site_tool and discover_site_tools are hidden from the model unless the run provides a site-tool object (apps/extension/src/features/computer-use/browserToolDefinitions.ts:35-43; background.ts:6723 provides BrowserAgentSiteTools).

**Not available**

- Mobile and plain Web: no website action tools found.
- VS Code: no tools of its own; relies on the CLI engine [inferred].
- Site-tool invocation on Desktop, CLI, VS Code: not found (brief S64.17).

## 4. Required behaviour

**Established requirements**

- The assistant runs a search on a website and reads the results back. (source: brief S64.14)
- The assistant fills in a web form on the user's behalf. (source: brief S64.15)
- The user gives a goal and the assistant carries it out over several steps on websites. (source: brief S64.16)
- The assistant calls tools a website declares (for example WebMCP) instead of clicking through the page. (source: brief S64.17)
- No sensitive action without user approval; page content is untrusted; high-impact actions confirm. (source: doc: docs/product/requirements.md (sections 14 and 21.4))
- Prompt injection from browser content must be marked and defended. (source: doc: docs/decisions/wire-or-cut.md (row 'Browser content prompt-injection'))

**Acceptance criteria**

1. In Chrome, clicking a button is followed by a result line with the page URL after the click.
2. In Chrome, typing into a normal field reports 'Verified that field [n] retained the input.'
3. Typing into a password field in the paired-browser path returns the protected-field refusal and nothing is typed.
4. CLI browser_fill_form shows each selector and value in an approval prompt and submits nothing.
5. A site tool call always shows an approval card, even in Full access mode.
6. A page containing text that tells the model to ignore the user stops the run with a security warning.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Search on a site is expected to work through generic typing and clicking; a measure of success should read the results page [inferred].
- Desktop chat and Chrome should offer the same set of verbs, since the brief lists the same four items for all apps [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add browser_find and a batch fill step to Desktop chat.
- [proposed] Add a Chrome batch fill tool so forms need one approval rather than one per field.
- [proposed] Record whether a typed or clicked step was verified in the Desktop activity list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Chrome tool definitions | `apps/extension/src/features/computer-use/browserToolDefinitions.ts` | Tool list and schemas including type, click, find, discover_site_tools, call_site_tool. |
| service | Chrome agent loop | `apps/extension/src/features/computer-use/agentLoop.ts` | click (523), type (743), select_option (814), site tools (383-409), injection scan (285). |
| service | Chrome CDP driver | `apps/extension/src/features/computer-use/cdpDriver.ts` | Native input, target signatures, typed-field verification. |
| service | Approval policy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Classifies sensitive fields, purchases, sensitive sites; site_tool always asks. |
| service | Content page elements | `apps/extension/src/features/content/pageElements.ts` | fillPageFields and fillOne: refuses sensitive fields, sets values, fires events. |
| service | Desktop commands in Chrome | `apps/extension/src/features/native-bridge/desktopCommands.ts` | browser_click, browser_type, browser_find, browser_fill_form for Desktop and CLI. |
| service | WebMCP site tools | `apps/extension/src/background.ts` | BrowserAgentSiteTools provided to the loop (line 6723). |
| service | Cloud agent client | `apps/extension/src/features/computer-use/cloudAgentClient.ts` | Streams the model call to AGI Cloud with tool definitions. |
| component | Computer use panel | `apps/extension/src/features/side-panel/computerUsePanel.ts` | Step log, approval cards, guidance box. |
| service | Command planner | `apps/desktop/electron/browser/commandGate.ts` | Plans click, type, find and fill form with labelled approval text and limits. |
| service | Browser step runner | `apps/desktop/electron/browser/browserSteps.ts` | Runs cloud-chat click and type steps. |
| schema | Device step definitions | `packages/contracts/local-runtime/src/device-steps.ts` | device_browser_click and device_browser_type. |
| service | Web device tools | `apps/web/lib/device-steps/device-tools.ts` | JSON schemas for browser steps with the 'review' field. |
| service | Web device step runner | `apps/web/features/desktop-host/lib/device-steps.ts` | Calls browser_step and shapes the result text (runBrowserStep, line 196). |
| component | BrowserToolsDialog | `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | Manual Click and Type actions. |
| config | CLI tool catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Definitions for browser_find, click, type, fill_form (1048+). |
| service | CLI tool execution | `apps/cli/src/features/exec/tools/mod.rs` | Tab pinning and approval for fill form; command argument mapping (2178). |
| service | CLI bridge client | `apps/cli/src/browser_bridge.rs` | Posts commands to Desktop. |
| service | Desktop bridge server | `apps/desktop/electron/browser/bridgeServer.ts` | Queues commands for the paired Chrome, records activity. |
| test | WebMCP tests | `apps/extension/__tests__/webmcp-site-tools.test.ts` | Site tool tests (file name; contents not opened). |
| test | Site-tool effect test | `apps/extension/__tests__/computer-use-site-tool-effect.test.ts` | Site tool effect handling (file name). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chrome reads the page into a numbered element list and scans it for prompt injection. | device | apps/extension/src/features/computer-use/agentLoop.ts:285-299, 1100-1102 |
| The goal, page data and tool list go to AGI Cloud; the model answers with tool calls. | our servers | apps/extension/src/features/computer-use/cloudAgentClient.ts:306-320 |
| The extension computes the target's signature and decides whether approval is needed; shows a card if so. | device | apps/extension/src/features/computer-use/agentLoop.ts:1380-1440; apps/extension/src/features/computer-use/askBeforeActing.ts:40-52 |
| The click, type or site tool runs through the Chrome debugger on the page and the result is read back. | device | apps/extension/src/features/computer-use/agentLoop.ts:523-601, 743-812 |
| A site tool executes in the page and returns page-supplied text, which is treated as unverified. | outside service | apps/extension/src/features/computer-use/agentLoop.ts:396-409 (verification passed:false) |
| CLI/Desktop: the command goes through Desktop's loopback bridge to the paired Chrome, which acts under its approved-sites list. | device | apps/cli/src/browser_bridge.rs:284-340; apps/desktop/electron/runtime/dispatcher.ts:2139 |
| The tool result goes back to the model to decide the next step, until it reports or hits the step cap. | our servers | apps/extension/src/features/computer-use/agentLoop.ts:1149-1180, 1294-1296 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Page content read and tool results | in memory of the run and sent to AGI Cloud as model context | sent to the cloud as part of the model call; whether it is kept there was not traced | not established; the extension keeps the step log in the panel until cleared |
| Typed text of 'type' calls | not shown in the step arguments (toolArgs omitted for type) | sent to the page | apps/extension/src/features/computer-use/agentLoop.ts:1568 omits type arguments from progress |
| Desktop activity entries | Desktop main-process memory (200 entries) | no | lost on close (bridgeServer.ts:1142-1170) |

**Models and providers.** The Chrome loop uses a model from the account's admitted list that supports tools, vision and streaming, reached through AGI Cloud only (apps/extension/src/features/computer-use/cloudAgentClient.ts:62-103). Desktop chat, CLI and VS Code use the session's own model; the browser command layer does not name a model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome requires a signed-in AGI Cloud account (agentLoop.ts:268-281). CLI, Desktop: no account check in the browser command path. |
| Permissions | Per-site approval and browser-control consent in Chrome; browser.site capability in Desktop; CLI approval per tool when confirmation is on (apps/cli/src/features/exec/tools/mod.rs:1063-1080). Uploads and downloads have their own site capability (packages/contracts/types/src/site-policy.ts:5). |
| Subscription | Chrome model admission depends on the plan tier (cloudAgentClient.ts:62-103). No per-action plan gate found. |
| Limits and metering | Step cap per run (agentLoop.ts:55, 1294); fill form at most 50 fields and 10,000 characters per value (commandGate.ts:78-79); Chrome managed quota errors classified (cloudAgentClient.ts:370); command timeouts 45 s Desktop, 60 s CLI. |
| Feature flags | none found in the code |
| Model compatibility | Chrome: tools, vision and streaming required (cloudAgentClient.ts:96-101). |
| Provider restrictions | Chrome: managed traffic must be permitted for the model (cloudAgentClient.ts:73-80). |
| Local mode | Chrome has no Local or own-key mode for browser tasks (gateway call only). Desktop and CLI command layers run on the device, but the model that decides the steps follows the chat's mode; that mode path was not traced here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Success | Result marked Completed only when the outcome is verified and the verification passed. | apps/extension/src/features/side-panel/computerUsePanel.ts:1905-1926 |
| Field did not keep the text | Result says 'did not retain the requested input' and is marked not verified. | apps/extension/src/features/computer-use/agentLoop.ts:787-795 |
| Sensitive field | Approval always asks for sensitive_input; the paired path refuses. | apps/extension/src/features/computer-use/approvalPolicy.ts:340-349, 386-388 |
| Purchase | Chrome paired path refuses; the model prompt says call ask_user_to_take_over. | approvalPolicy.ts:166-167; agentLoop.ts:1133-1135 |
| Injection detected | Run aborts with InjectionDetectedError and a 'security warning' step. | agentLoop.ts:285-299; computerUsePanel.ts:1948-1954 |
| Unattended run | A step that needs approval is refused; the model is told to report it unfinished. | agentLoop.ts:1481-1486; background.ts:6506 |
| Step cap | 'Agent reached the maximum step limit (N). Partial progress may have been made.' | agentLoop.ts:1294-1296 |
| Fill with too many fields | Rejected with 'must list between 1 and 50 fields'. | apps/desktop/electron/browser/commandGate.ts:85-89 |
| Field hidden, disabled or read-only | Reported in the failed list with a reason. | apps/extension/src/features/content/pageElements.ts:253-274 |
| No active tab for CLI fill | 'No active tab is open in the paired Chrome, so no fields were filled.' | apps/cli/src/features/exec/tools/mod.rs:1411-1415 |
| Accessibility | Expandable details have role button, tabindex and aria-expanded; approval card is an alertdialog. | apps/extension/src/features/side-panel/computerUsePanel.ts:1866-1880, 884-888 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/computer-use-approval-policy.test.ts`: Approval policy for browser actions (name only; contents not opened).
- `apps/extension/__tests__/computer-use-site-tool-effect.test.ts`: Site-tool effect handling (name only).
- `apps/extension/__tests__/webmcp-site-tools.test.ts`: Site tools (name only).
- `apps/extension/__tests__/webmcp.test.ts`: WebMCP (name only).
- `apps/extension/__tests__/computer-use-stop-ui.test.ts`: Renders refused actions neutrally; one check only for verified success; never shows a failed verification as completed.
- `apps/extension/__tests__/browser-control-contract.test.ts`: One agent and one tool list that can describe every tool; element addressing tells the model to re-read the page; file inputs.
- `apps/extension/__tests__/desktop-browser-commands.test.ts`: Desktop-issued commands: unapproved sites refused, page read, native click failure carried back.
- `apps/desktop/electron/__tests__/browserCommandGate.test.ts`: Click, type, find and form fill approval text keeps sent values on labelled lines.
- `apps/cli/src/platform/runtime/tool_catalog.rs`: Inline tests of which browser tools are offered and which are read-only.

**Test scenarios**

- **Click verification**
  1. Approve a test page with a link.
  2. Ask the Chrome assistant to click the link.
  - Expected: Result includes 'verified: page URL after click = <new url>' and is marked Completed.
- **Type verification**
  1. Ask the assistant to type a name in a plain text field.
  - Expected: Result says the field retained the input; step marked Completed.
- **Password field refused**
  1. From the CLI ask the model to fill a login form including its password field.
  - Expected: Username filled, password in failed list with the protected-field reason; nothing submitted.
- **Site tool approval**
  1. Open a page that declares a WebMCP tool.
  2. Ask the assistant to use it.
  3. Set Full access mode.
  - Expected: Approval card appears ('supplied by the website') even in Full access; result is not marked verified.
- **Injection page**
  1. Open a page whose text tells the assistant to reveal secrets.
  2. Start a task on it.
  - Expected: Run stops with a security warning step.
- **CLI fill form approval**
  1. Pair Chrome with Desktop.
  2. Ask the CLI to fill two fields on the active tab.
  - Expected: Approval prompt lists tab and both selector/value lines; denial fills nothing.

**Where to look when it fails**

- Step log kinds: tool_call, tool_result, error, final, injection_blocked (apps/extension/src/features/side-panel/computerUsePanel.ts:1883-1962).
- Error names InjectionDetectedError, NavigationOffAllowlistError (agentLoop.ts).
- Desktop dialog 'Recent activity' with failed: <error>.
- CLI tool status lines in the terminal.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/064-browser-assistant-experience.md](../../70-qa/test-plans/desktop/064-browser-assistant-experience.md)
- CLI: [70-qa/test-plans/cli/064-browser-assistant-experience.md](../../70-qa/test-plans/cli/064-browser-assistant-experience.md)
- VS Code: [70-qa/test-plans/vscode/064-browser-assistant-experience.md](../../70-qa/test-plans/vscode/064-browser-assistant-experience.md)
- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **No batch form fill in the Chrome side panel agent; one approval per typed field in Ask first mode.** Affects: Chrome users. Evidence: browserToolDefinitions.ts tool list (type, select_option; no fill_form). Work needed: Add a fill tool with the same protected-field refusal.
- **Desktop cloud chat has no find, no fill form, no site tools.** Affects: Desktop and web-in-Desktop. Evidence: packages/contracts/local-runtime/src/device-steps.ts:52-59. Work needed: Extend the device step list and runner.
- **Site-tool invocation only in Chrome.** Affects: Desktop, CLI, VS Code. Evidence: brief S64.17; no site tool code under apps/desktop or apps/cli. Work needed: Decide whether the paired-browser path should expose discover and call.
- **Brief marks VS Code search and multi-step 'done' but cites unrelated lines.** Affects: VS Code. Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5654 and apps/extension-vscode/src/integrations/localRuntimeClient.ts:948 are not browser code. Work needed: Verify end to end with a paired Chrome and correct the brief.
- **Nothing records that a run succeeded across tests; verification claims rest on code only.** Affects: All. Evidence: no results file read. Work needed: Run the scenarios and record results.
- Not built on: Web, Mobile (from the capability ledger).

**Depends on**

- surface:chrome
- surface:desktop
- surface:cli
- surface:vscode
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- F064-07
- F064-10
- F064-11
- F064-12
- file:apps/extension/src/features/computer-use/agentLoop.ts

## Unknown

- Whether page content sent to AGI Cloud during a Chrome run is stored on the server, and for how long, was not traced.
- Whether VS Code runs browser tools end to end was not verified.
- What the Chrome 'Run Autofill' fast path covers beyond job applications was not read.
- Contents of the WebMCP tests were not opened.
- No test results were read.
