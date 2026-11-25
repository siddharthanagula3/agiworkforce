---
id: "F064-01"
type: "feature"
title: "Ask about the page you are on"
aliases: ["Ask about the page you are on", "Current-page context (S64.01)", "Page summary (S64.05)", "Question about page (S64.06)", "Use the browser (web dialog in Desktop)", "Read the page", "Read the active tab (CLI status line)", "browser_read_page", "Ask AGI about this page", "Summarize this page", "Add the browser page"]
area: "64 Browser-assistant experience"
available_on: ["desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S64.01", "S64.05", "S64.06"]
depends_on: ["surface:desktop", "surface:chrome", "surface:cli", "surface:vscode", "surface:mobile", "surface:web", "mode:cloud", "mode:local", "file:apps/web/features/desktop-host/components/BrowserToolsDialog.tsx", "file:apps/extension/src/side_panel.ts", "file:apps/extension/src/features/native-bridge/desktopCommands.ts", "file:apps/desktop/electron/browser/commandGate.ts", "file:apps/cli/src/browser_bridge.rs", "file:apps/mobile/src/features/share-preview/index.tsx", "api:POST /api/llm/v1/chat/completions", "store:chrome.storage.session", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "F064-03", "F064-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-01 Ask about the page you are on

The person asks a question about the web page they have open, or asks for a summary, and the answer uses that page's text. Chrome reads the page itself. Desktop and the command line read the active tab of a paired Chrome. Mobile sends a shared link to chat, where AGI Cloud may fetch it.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.01](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6401), [S64.05](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6405), [S64.06](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6406).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the assistant the text of the page the person is looking at so a free-form question or a one-tap summary is answered from that page. Each app reaches the page differently: Chrome reads it directly; Desktop, CLI and VS Code ask a paired Chrome through the Desktop browser bridge; Mobile gets a link through the share sheet.

**Why it exists.** Brief items S64.01, S64.05 and S64.06 require that the assistant reads the page open in the browser and answers with it as context, with one action to summarize it. [inferred] It removes copy and paste of page text into a chat.

**Who uses it.** People who read articles, docs or pull requests in Chrome and want an answer about them; developers using the CLI or VS Code with a paired Chrome; phone users sharing a link into AGI Mobile.

**Problems it solves**

- Pasting page text by hand into a chat.
- Getting a quick summary of a long page.
- Letting a coding agent read the page the developer is looking at without a separate browser.

**Use cases**

- In Chrome, right-click a page and choose Summarize this page; the side panel opens, attaches the page and sends the summary request (apps/extension/src/background.ts:7452-7461, apps/extension/src/side_panel.ts:16400).
- In AGI Desktop, open the composer plus menu, choose Use the browser, press Read the page, Run, then Add to chat (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:324-338,396-409).
- In the CLI with a paired Chrome, ask a question; the model calls browser_read_page after the person approves (apps/cli/src/features/exec/tools/mod.rs:1459-1462).
- On a phone, share a link to AGI and tap Summarize this page (apps/mobile/src/features/share-preview/index.tsx:448-461).

## 2. User experience

**Where to find it**

- Chrome side panel: composer plus menu item 'Add the browser page' (message key spContextItem, apps/extension/_locales/en/messages.json:769; menu code apps/extension/src/side_panel.ts:9865-9880). Page right-click menu: 'Ask AGI about this page' and 'Summarize this page' (apps/extension/src/background.ts:7459-7460; labels apps/extension/_locales/en/messages.json:46,50).
- Chrome in-page panel: floating launcher button on approved pages, chips Summarize, Key points, Q&A, Translate and a box 'Ask one question about this page…' (apps/extension/src/features/content/in-page-panel/pageActions.ts GENERIC_ACTIONS; apps/extension/src/features/content/in-page-panel/panel.ts:351-368; apps/extension/src/inPagePanel/setup.ts:44-66).
- Desktop (hosted web app): composer plus menu row 'Use the browser', shown only when the web app runs inside the Desktop shell (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:179,1159-1171,1697-1699; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6019,6029-6032,7036-7040).
- CLI: no screen; the model's tool call is shown as 'Read the active tab' (apps/cli/src/platform/runtime/tool_catalog.rs:197).
- VS Code: session tools list has a 'Browser' entry described as 'Open, read and act on pages in the paired browser' (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1103-1115).
- Mobile: the share sheet of the phone; AGI shows a 'Shared Content' screen (apps/mobile/src/features/share-preview/index.tsx:297-305). iOS extension is titled 'Share with AGI' (apps/mobile/native/ios/AGIShareExtension/ShareViewController.swift:67).
- Web in an ordinary browser: not offered, because the row needs the Desktop host (ChatComposerNew.tsx:6019).

**Before you start**

- Chrome: the person is signed in to AGI (Managed Cloud); in-page and side panel prompts refuse with 'Sign in to use AGI Managed Cloud.' when signed out (apps/extension/src/background.ts:9135-9137). The site must be readable under the extension's site rules (apps/extension/src/side_panel.ts:6486-6510).
- Desktop, CLI and VS Code: Chrome with the AGI extension paired to Desktop. If not paired the dialog says 'No browser is paired yet. Open Settings, Capabilities to pair the Extension with this Mac.' (BrowserToolsDialog.tsx:33-34). Pairing is done from the extension side panel with 'Connect to Desktop' and a code Desktop shows (apps/web/features/desktop-host/components/BrowserPairingSection.tsx:14-18).
- CLI and VS Code also need the Desktop shell running; otherwise the browser tools are not offered (apps/cli/src/browser_bridge.rs:1-3, 67; apps/cli/src/platform/runtime/tool_catalog.rs:1343-1349).
- Mobile: a link or text shared from another app.

**Screens and controls**

- Desktop dialog 'Use the browser': action buttons (Read the page, Screenshot, Click, Type, Open a page, Stop loading, Read the console, Read network activity, Download a file), 'Choose a tab' button, 'Run', 'Add to chat', 'Close', result box labelled 'Browser result', 'Recent activity' list (BrowserToolsDialog.tsx:74-84,323-446).
- Chrome side panel: attach menu items and a page chip; the plus menu also has 'Add selected text' and 'Attach tabs' (side_panel.ts:14797-14809,14968-14975).
- Mobile share screen: buttons 'Dismiss', 'Summarize this page', 'Ask about this page', and the main button 'Send to Chat' (share-preview/index.tsx:448-475,495-537).

**Journey**

1. Chrome right-click: person chooses 'Summarize this page' -> background stores a pending 'summarize' request in session storage and opens the side panel (background.ts:7637-7650 region, 7677) -> side panel captures the active tab text, attaches it and sends the summary prompt (side_panel.ts:16400-16445).
2. Chrome free question: person opens the side panel, uses 'Add the browser page' or just asks; when the model needs the page it calls browser_read_page, the panel reads the tab (asking for site access if needed) and returns the text (side_panel.ts:8078-8150).
3. Chrome in-page: person opens the launcher, taps a chip or types a question, the panel sends the visible text of the main region to AGI Managed Cloud and shows the answer (in-page-panel/panel.ts:558-566; background.ts:9112-9190).
4. Desktop dialog: person opens 'Use the browser', keeps 'Read the page' selected, optionally presses 'Choose a tab', presses Run, Desktop asks before the action, the page text appears in the result box, 'Add to chat' attaches it as a text file named page-<time>.txt (BrowserToolsDialog.tsx:131-142,282-286,396-409; apps/desktop/electron/runtime/dispatcher.ts:2092-2110).
5. Desktop cloud turn: the model calls device_browser_read_page; Desktop runs it under its own permission prompt and returns title, address and text (packages/contracts/local-runtime/src/device-steps.ts:265-268; apps/desktop/electron/browser/browserSteps.ts:134-187).
6. CLI: model calls browser_read_page; CLI shows an approval 'The agent wants to read the page open in your signed-in Chrome.'; on yes the Desktop bridge asks the extension (mod.rs:1459-1462).
7. Mobile: person shares a link, the 'Shared Content' screen shows the text, person taps 'Summarize this page' (sends 'Summarize this page.' plus the shared text) or 'Ask about this page' (puts the text in the composer to add a question) (share-preview/index.tsx:227-248).

**What the person sees and gets**

- Desktop dialog: result text in 'Browser result'; a spinner labelled 'Running'; a role=alert error line; activity rows with time, client, action and 'running', 'done' or 'failed: ...' (BrowserToolsDialog.tsx:102-106,317-321,405-446).
- Chrome: an activity line 'Reading <host>' for each page read and 'done' on finish (side_panel.ts:8078-8100); the in-page panel shows a disclosure that up to 30,000 characters of visible text go to AGI Managed Cloud (in-page-panel/panel.ts:411-430).
- Chrome answers stream into the side panel; the in-page panel replaces each answer with the next (panel.ts:420-427).
- Mobile: the message goes to a new chat; the screen shows 'Opening chat…' then navigates to the chat (share-preview/index.tsx:274-282).

**Settings**

- Chrome: site approvals and blocked sites in Extension settings, Permissions; the in-page panel can be turned off there (apps/extension/src/inPagePanel/setup.ts:70-80 region; apps/extension/src/side_panel.ts:6500-6501).
- Desktop: pairing and unpairing in Settings (BrowserPairingSection.tsx) and the capability grant Desktop asks for once (BrowserToolsDialog.tsx:194-200 comment).
- VS Code: the 'Browser' tool can be switched off per session (capabilityManagement.ts:1103-1129).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome side panel reads the active tab, bounds it to 30,000 characters, strips secrets and refuses restricted or loading pages (apps/extension/src/side_panel.ts:6486-6537; apps/extension/src/features/content/in-page-panel/pageActions.ts:22).
- Chrome chat tool browser_read_page is offered at tier 'read' or 'act' depending on site policy (apps/extension/src/features/computer-use/chatBrowserTools.ts:79-90; side_panel.ts:7738-7757) and its result is fenced as untrusted data (side_panel.ts:8118-8125).
- Chrome right-click items 'Ask AGI about this page' and 'Summarize this page' exist and route through the side panel (background.ts:7452-7461; side_panel.ts:16400-16445).
- Chrome in-page panel reads the main region of the page and sends it with the prompt (in-page-panel/panel.ts:394-410,558-566).
- Desktop dialog reads the active page of a paired Chrome and can attach it as a text file (BrowserToolsDialog.tsx:131-142,282-286). The extension returns at most 20,000 characters (apps/extension/src/features/native-bridge/desktopCommands.ts:15,120-138).
- Desktop cloud turns can call device_browser_read_page (packages/contracts/local-runtime/src/device-steps.ts:52-59,265-268; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6359-6363).
- CLI offers browser_read_page when a browser is paired, marks it as read-only but never pre-approved, and caps its result at 100,000 characters (apps/cli/src/platform/runtime/tool_catalog.rs:1048-1056,1343-1349; apps/cli/src/features/exec/tools/mod.rs:4795-4830).
- Mobile share preview builds a summary or ask action from the first link in the shared text and bounds the text to 100 KB (share-preview/index.tsx:42-60,227-248). A cloud turn whose message holds a link sets web_fetch (apps/mobile/stores/chat/chatExecutionStore.ts:3393).

**Incomplete**

- Mobile does not read an open browser page; it only sends the shared text and link, so the answer depends on AGI Cloud fetching that link (share-preview/index.tsx:227-236; chatExecutionStore.ts:3393). The brief's wording 'does not read the open page' is true; the claim that nothing is fetched is not.
- VS Code: only the 'Browser' tool toggle was opened; VS Code spawns the CLI runtime, so page reads are the CLI's (apps/extension-vscode/src/integrations/localRuntimeClient.ts:2544-2575). No VS Code code that renders a page read was opened.
- The in-page panel and the Chrome page chip read visible text only; frames, PDFs and file URLs: not examined.

**Present but disconnected or switched off**

- Desktop dialog is hidden in a plain browser tab because the row needs the Desktop host (ChatComposerNew.tsx:6019).
- CLI and VS Code browser tools are withheld when no browser is paired (tool_catalog.rs:1343-1349; test at tool_catalog.rs:1553-1575).

**Not available**

- Web in an ordinary browser: no page reading (brief status n/a; ChatComposerNew.tsx:6019).
- Mobile: no way to read the page open in a phone browser; only share-in (share-preview/index.tsx).
- Local-mode Mobile fetch of a link: no fetch code found in the local path (not opened in depth) [inferred].

## 4. Required behaviour

**Established requirements**

- The assistant reads the page open in the user's browser and answers with it as context (S64.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.01)
- One action summarizes the page the user is viewing (S64.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.05)
- The user asks a free-form question and the answer uses the current page content (S64.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.06)
- Page content is untrusted. Browser data must not enter global memory or synced chat by default. (source: (doc: docs/product/requirements.md:1213-1214))
- Chrome must include page context capture, ask/act modes, per-site allow/deny prompts, prompt-injection defenses. (source: (doc: docs/product/requirements.md:1197-1212))

**Acceptance criteria**

1. In Chrome on an approved site, 'Summarize this page' opens the side panel and sends a summary request that includes that page's text.
2. In Chrome on a site the person blocked, the page is not read and a notice names the host.
3. In Desktop with a paired and connected Chrome, Read the page, Run returns title, address and text, and Add to chat attaches a file named page-<time>.txt.
4. In Desktop with no pairing, the dialog shows the 'No browser is paired yet' line and Run is disabled.
5. In the CLI with no paired browser, no browser_ tool is offered to the model.
6. In the CLI, browser_read_page asks for approval every time, even in a safe-reads mode.
7. On Mobile, a shared link shows 'Summarize this page' and 'Ask about this page'; text over 100 KB shows the truncation notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Answers should say when the page text was cut at the limit; Chrome does with an excerpt notice (pageActions.ts:23-24) [inferred].
- Mobile Local mode should say it cannot open a link, since the on-device model has no fetch tool [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show in the Mobile share screen whether the link will be fetched by AGI Cloud, so the person knows the page itself leaves the phone.
- [proposed] Let the CLI and the Desktop cloud tool take a tab id, as the Desktop dialog already does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | BrowserToolsDialog | `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | Desktop 'Use the browser' dialog; read-page action, tab picker, activity list, Add to chat. |
| component | ComposerPlusMenu BrowserRow | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Plus-menu row 'Use the browser' (lines 179, 1159-1171, 1697-1699). |
| service | runtime-client readPairedPage | `apps/web/features/desktop-host/lib/runtime-client.ts` | Calls the Desktop command browser_read_page (lines 514-519). |
| service | planBrowserCommand | `apps/desktop/electron/browser/commandGate.ts` | Validates a browser command and writes the approval text (line 114; read_page at 140). |
| service | runBrowserCommand | `apps/desktop/electron/runtime/dispatcher.ts` | Permission request, per-action approval, activity log, send to the bridge (lines 2092-2260). |
| service | runBrowserStep | `apps/desktop/electron/browser/browserSteps.ts` | Runs a browser step handed back by a cloud turn, with site rules (lines 134-187). |
| schema | DEVICE_STEP_TOOLS / device_browser_read_page | `packages/contracts/local-runtime/src/device-steps.ts` | Contract of steps a cloud turn may hand back to the device (lines 52-59, 265-268). |
| service | device-tools schema | `apps/web/lib/device-steps/device-tools.ts` | Tool schema for device_browser_read_page with no arguments (lines 361-363). |
| service | desktop device-steps runner | `apps/web/features/desktop-host/lib/device-steps.ts` | Turns the page result into text for the model (lines 183-189, 224-240). |
| endpoint | chat completions route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | POST route (line 1526); request-processor.ts adds device tools when the Desktop host declares browser capabilities (lines 3713-3716, 6359-6363). |
| service | runDesktopBrowserCommand | `apps/extension/src/features/native-bridge/desktopCommands.ts` | Chrome side of paired commands; read_page returns url, title, up to 20,000 chars (lines 15, 118-138, 306-375). |
| service | capturePageContext / readTabText | `apps/extension/src/side_panel.ts` | Reads the active tab for the side panel (lines 6486-6600). |
| service | runReadPageTool | `apps/extension/src/side_panel.ts` | Executes the chat tool browser_read_page (line 8078). |
| service | chatBrowserToolDefinitions | `apps/extension/src/features/computer-use/chatBrowserTools.ts` | Declares browser_read_page, browser_task, browser_fill_form for chat (lines 18-90). |
| service | attachPageForQuestion | `apps/extension/src/side_panel.ts` | Handles the right-click Ask about page and Summarize requests (line 16400). |
| config | CONTEXT_MENU_ITEMS | `apps/extension/src/background.ts` | Right-click items for page and selection (lines 7452-7461). |
| component | in-page panel | `apps/extension/src/features/content/in-page-panel/panel.ts` | Floating page assistant that sends page text with each prompt (lines 394-410, 558-566). |
| service | handleInPagePrompt | `apps/extension/src/background.ts` | Sends the in-page prompt to AGI Managed Cloud (line 9112). |
| config | BROWSER_TOOLS and browser_tool_definitions | `apps/cli/src/platform/runtime/tool_catalog.rs` | CLI browser tool names, definitions and status lines (lines 51-62, 197, 1048-1056, 1343-1349). |
| service | trust_boundary_approval | `apps/cli/src/features/exec/tools/mod.rs` | CLI approval text for browser_read_page (lines 1438-1462). |
| service | CLI browser bridge client | `apps/cli/src/browser_bridge.rs` | Talks to the Desktop shell's loopback bridge (lines 1-3, 67, 270). |
| screen | SharePreviewScreen | `apps/mobile/src/features/share-preview/index.tsx` | Mobile share screen with Summarize this page and Ask about this page (lines 70-541). |
| service | chatExecutionStore sendMessage | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sets web_fetch when the message holds a link (line 3393). |
| component | AGIShareExtension | `apps/mobile/native/ios/AGIShareExtension/ShareViewController.swift` | iOS share extension that stages shared text (lines 67, 141-145). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chrome: the person asks; the side panel reads the active tab's text in the browser and attaches it. | device | apps/extension/src/side_panel.ts:6486-6537 |
| Chrome: the page text, question and history go to AGI Managed Cloud for the answer. | our servers | apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/extension/src/background.ts:8061 |
| Desktop dialog: the web app asks the Desktop shell to run browser_read_page; Desktop asks permission and shows a per-action dialog. | device | apps/web/features/desktop-host/lib/runtime-client.ts:514-519; apps/desktop/electron/runtime/dispatcher.ts:2152-2210 |
| Desktop sends the command to the paired Chrome extension over the local bridge; the extension reads the tab and returns up to 20,000 characters. | device | apps/extension/src/features/native-bridge/desktopCommands.ts:118-138 |
| Desktop cloud turn: the chat request names device browser capabilities; the server adds device tools; the model asks for device_browser_read_page; the page text then goes back to the server as a tool result. | device and our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3713-3716,6359-6363; apps/web/features/desktop-host/lib/device-steps.ts:224-240 |
| CLI: the model calls browser_read_page; the person approves; the CLI sends the command to the Desktop shell, which uses the paired Chrome. The text goes to whichever model the CLI session uses. | device | apps/cli/src/features/exec/tools/mod.rs:1459-1462; apps/cli/src/browser_bridge.rs:1-3 |
| Mobile: shared text is bounded to 100 KB, wrapped in a shared_via_intent tag and sent as a chat message; in a cloud turn with a link the server may fetch the link. | device and our servers | apps/mobile/src/features/share-preview/index.tsx:55-68; apps/mobile/stores/chat/chatExecutionStore.ts:3393 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Page text attached to a Chrome message | In memory until sent; the saved chat keeps only page title and address (SidePanelPageReference) (apps/extension/src/features/side-panel/chat-state.ts:32-35; conversation-history.ts:107) | Chat history can sync to the cloud account; whether page text is in the synced body: unknown | Chat history is kept until the person deletes it; page text deletion: unknown |
| Desktop dialog result file page-<time>.txt | In the browser memory of the Desktop window as a File until attached (BrowserToolsDialog.tsx:135-140) | Goes with the chat message the person sends | Kept as a chat attachment under normal chat retention [inferred] |
| Browser activity entries (client, command, target, outcome) | Desktop memory; the dialog says 'Nothing has used the paired browser since Desktop opened.' when empty (BrowserToolsDialog.tsx:39) | No | Cleared when Desktop closes [inferred from the empty-state text] |
| Mobile shared text | iOS App Group inbox folder PendingShares for the extension hand-off (ShareViewController.swift:6-9) | Sent as a chat message | Inbox cleanup rules: not examined |

**Models and providers.** Chrome always uses AGI Managed Cloud with automatic model choice for in-page prompts (apps/extension/src/features/content/in-page-panel/panel.ts:93-96 provider pill; background.ts:9160-9163). Desktop cloud turns use the Cloud route. The CLI uses whatever model the session is configured for (not opened). No page read depends on a particular model; model-side tool support gates Chrome chat tools (apps/extension/src/side_panel.ts:8771).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome needs an AGI sign-in (apps/extension/src/background.ts:9135-9137). Desktop dialog: no account check found in the dialog code. Cloud turns need a signed-in Cloud account [inferred]. CLI and Mobile: not opened. |
| Permissions | Desktop asks for a capability grant once and shows a dialog 'Use the paired browser?' with Cancel and Allow once for each dialog action (dispatcher.ts:2092-2110, 2175-2205). Chrome acts only on sites approved in the extension (BrowserToolsDialog.tsx:31-32). CLI asks each time (mod.rs:1459-1462). |
| Subscription | none found in the code for the page read itself. Chrome returns 'plan_required' and 'quota_exceeded' outcomes from the server (apps/extension/src/background.ts:9041-9044); which plans: unknown. |
| Limits and metering | Page text: 30,000 characters in Chrome (pageActions.ts:22), 20,000 returned to Desktop (desktopCommands.ts:15), 100,000 for CLI result (tool_catalog.rs:1056), 4 chat tool calls per handoff and 64,000 characters per tool result in Chrome (chatBrowserTools.ts:22-24). Mobile share text 100 KB (share-preview/index.tsx:43). Usage metering of the chat turn: server side, not opened. |
| Feature flags | none found in the code for Chrome; Desktop row appears only with the Desktop host (ChatComposerNew.tsx:6019); CLI tools appear only when paired (tool_catalog.rs:1343). |
| Model compatibility | Chrome offers chat page tools only if the selected model supports tools (apps/extension/src/side_panel.ts:8769-8773 region). Others: none found in the code. |
| Provider restrictions | Chrome in-page: Managed Cloud only (panel.ts:93-96). Desktop dialog and CLI: no provider involved in reading. |
| Local mode | Desktop dialog works without any model because it only reads the page and attaches a file (BrowserToolsDialog.tsx:131-142). The CLI tool works with a local model if the session uses one [inferred, CLI model path not opened]. Chrome chat has no Local mode. Mobile Local mode sends the shared text to the on-device model; no fetch of the link was found [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Desktop: no browser paired | Shows 'No browser is paired yet...' and disables Choose a tab and Run. | BrowserToolsDialog.tsx:311-313,348,400 |
| Desktop: paired but Chrome not answering | Shows 'The paired browser is not answering. Open Chrome with the Extension enabled and try again.' | BrowserToolsDialog.tsx:35-36,314-316 |
| Desktop: action running | Spinner labelled Running; Run disabled while running; a stale result from a closed or changed view is dropped. | BrowserToolsDialog.tsx:262-280,400,410; apps/web/features/desktop-host/__tests__/BrowserToolsDialog.result.test.tsx:78-140 |
| Desktop: failure | A role=alert line shows the error text or 'That browser action did not run.'; a cancelled action shows nothing. | BrowserToolsDialog.tsx:37,108-113,317-321 |
| Desktop: person cancels the approval dialog | The command returns 'That browser action was not run.' | apps/desktop/electron/runtime/dispatcher.ts:2201-2204 |
| Chrome: restricted or loading page | Page not read; reason shown in the composer notice. | apps/extension/src/side_panel.ts:6497-6506 |
| Chrome: page changed while reading | Refuses with a page-changed reason. | side_panel.ts:6507-6523 |
| Chrome: site access refused | Tool returns a refusal text to the model. | side_panel.ts:8112-8121 |
| Chrome in-page: signed out, quota, rate limit, cancelled | Shows a titled state (for example 'Sign in to continue', 'Usage limit reached') with Retry or an open-side-panel button. | apps/extension/src/features/content/in-page-panel/panel.ts:292-346 |
| CLI: bridge lost or timed out | A failure message from the bridge; command timeout is 60 seconds. | apps/cli/src/browser_bridge.rs (COMMAND_TIMEOUT constant near line 30) |
| Mobile: preview no longer valid (mode or account changed) | Shows a role=alert message asking to dismiss and share again. | share-preview/index.tsx:317-328 |
| Mobile: shared text too long | Cut to 100 KB with a truncation notice. | share-preview/index.tsx:43-46,330-348 |
| Offline or reconnect on Desktop | not handled in the code beyond the 'not answering' line. | BrowserToolsDialog.tsx:35-36 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/desktop-host/__tests__/BrowserToolsDialog.result.test.tsx`: A read is shown only while its view is current; late or failed reads from a changed action, tab or reopened dialog are dropped.
- `apps/web/features/desktop-host/__tests__/BrowserToolsDialog.stop.test.tsx`: The Stop loading action.
- `apps/desktop/electron/__tests__/browserSteps.test.ts`: Browser steps from cloud turns, including read page.
- `apps/desktop/electron/__tests__/browserBridge.test.ts`: The Desktop browser bridge, including list tabs and read page commands.
- `apps/extension/__tests__/desktop-browser-commands.test.ts`: The extension's handling of Desktop browser commands.
- `apps/extension/__tests__/side-panel-page-context-capture.test.ts`: Side panel page capture: later article text, bounds, redaction, blocked site, document check.
- `apps/extension/__tests__/ask-about-page-menu.test.ts`: Right-click Ask AGI about this page and Summarize this page.
- `apps/extension/__tests__/in-page-panel-ui.test.ts`: In-page panel page capture: reads nothing until opened, main region, body fallback, cap.
- `apps/extension/__tests__/side-panel-chat-browser-tools.test.ts`: Chat browser tools in the side panel (the history cases are listed under F064-06).
- `apps/cli/src/platform/runtime/tool_catalog.rs`: Rust unit tests: browser tools offered only when paired; plan mode offers reads only (lines 1553-1600).
- `apps/cli/src/features/exec/tools/mod.rs`: Rust unit test: browser reads are never pre-approved (line 4795).
- `apps/mobile/__tests__/SharePreviewButtonNames.test.tsx`: Accessible names of the share preview buttons.
- `apps/mobile/__tests__/SharePreviewAdmission.test.ts`: Admission rules for sending shared content.
- `apps/mobile/__tests__/SharePreviewSizeCopy.test.ts`: Size copy of the share preview.

**Test scenarios**

- **Chrome summary from the right-click menu**
  1. Sign in to the extension; approve a news site.
  2. Open the site, right-click the page, choose 'Summarize this page'.
  3. Watch the side panel.
  - Expected: Side panel opens, a page chip appears, a summary request is sent and a streamed answer is shown.
- **Desktop read page with a paired Chrome**
  1. Pair Chrome with Desktop.
  2. Open a chat, plus menu, 'Use the browser', keep 'Read the page', press Run.
  3. Allow once in the Desktop dialog.
  4. Press Add to chat.
  - Expected: Result box shows title, address and text; a page-<time>.txt attachment appears; Recent activity lists the read as done.
- **Desktop with no pairing**
  1. Unpair Chrome.
  2. Open 'Use the browser'.
  - Expected: 'No browser is paired yet' line; Run disabled.
- **CLI approval**
  1. Start Desktop and pair Chrome.
  2. In the CLI ask 'what is on my current tab'.
  3. Observe the approval.
  - Expected: Approval 'The agent wants to read the page open in your signed-in Chrome.' appears every time; on yes the page text is used.
- **Mobile share a link**
  1. Share a URL from Safari to AGI.
  2. On 'Shared Content' tap 'Summarize this page'.
  - Expected: A new chat opens with the message 'Summarize this page.' and the shared link; in a cloud chat the answer is based on the fetched page.
- **Mobile oversize share**
  1. Share more than 100 KB of text.
  - Expected: Truncation notice shown and the sent text is cut.

**Where to look when it fails**

- Desktop: the 'Recent activity' list in the dialog shows the failed action and error.
- Chrome: the activity line 'Reading <host>' in the side panel; console log lines starting '[SidePanel]'.
- CLI: the bridge failure message and the availability states ShellNotRunning, NotPaired, PairedNotAnswering (apps/cli/src/browser_bridge.rs).
- Server: request-processor tool-metadata browser command test apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.browser-commands.test.ts.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/064-browser-assistant-experience.md](../../70-qa/test-plans/desktop/064-browser-assistant-experience.md)
- Mobile: [70-qa/test-plans/mobile/064-browser-assistant-experience.md](../../70-qa/test-plans/mobile/064-browser-assistant-experience.md)
- CLI: [70-qa/test-plans/cli/064-browser-assistant-experience.md](../../70-qa/test-plans/cli/064-browser-assistant-experience.md)
- VS Code: [70-qa/test-plans/vscode/064-browser-assistant-experience.md](../../70-qa/test-plans/vscode/064-browser-assistant-experience.md)
- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **Brief marks VS Code page reading done but only the toolbar toggle was verified.** Affects: VS Code. Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1103-1115. Work needed: Open the VS Code chat path that renders a browser read and add a test.
- **Mobile cannot read an open browser page and Local mode has no known way to fetch a shared link.** Affects: Mobile (Local mode). Evidence: share-preview/index.tsx:227-236; chatExecutionStore.ts:3393. Work needed: Tell Local-mode users plainly that only the link text is sent, or add a local fetch the person approves.
- **The Desktop cloud tool device_browser_read_page cannot choose a tab; only the manual dialog can.** Affects: Desktop. Evidence: apps/web/lib/device-steps/device-tools.ts:361-363; apps/web/features/desktop-host/lib/device-steps.ts:207-222. Work needed: Add an optional tab id to the step and to the schema.
- **Brief code pointers are stale (ComposerPlusMenu.tsx:745, BrowserToolsDialog.tsx:89, dispatcher.ts:594, tool_catalog.rs:961 were not the read-page code).** Affects: Knowledge base readers. Evidence: ComposerPlusMenu.tsx:179,1159; BrowserToolsDialog.tsx:131. Work needed: Update the brief pointers.
- **No Web-in-browser path; no test for the Desktop 'Read the page' end to end with a real Chrome.** Affects: Web, Desktop. Evidence: ChatComposerNew.tsx:6019. Work needed: Run the verification scenarios with a real paired Chrome and record the result.

**Depends on**

- surface:desktop
- surface:chrome
- surface:cli
- surface:vscode
- surface:mobile
- surface:web
- mode:cloud
- mode:local
- file:apps/web/features/desktop-host/components/BrowserToolsDialog.tsx
- file:apps/extension/src/side_panel.ts
- file:apps/extension/src/features/native-bridge/desktopCommands.ts
- file:apps/desktop/electron/browser/commandGate.ts
- file:apps/cli/src/browser_bridge.rs
- file:apps/mobile/src/features/share-preview/index.tsx
- api:POST /api/llm/v1/chat/completions
- store:chrome.storage.session
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- F064-03
- F064-04

## Unknown

- Whether page text from a Chrome message is stored or synced to the cloud copy of the chat.
- Which plans, if any, gate Chrome page chat or Desktop cloud-turn browser steps.
- CLI model and provider path for browser reads.
- Whether VS Code shows browser reads in its chat view.
- Whether the iOS share inbox deletes staged text after use.
- Local-mode Mobile behaviour for a shared link beyond sending the text.
