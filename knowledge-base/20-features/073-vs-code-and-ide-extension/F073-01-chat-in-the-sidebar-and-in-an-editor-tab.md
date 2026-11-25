---
id: "F073-01"
type: "feature"
title: "Chat in the sidebar and in an editor tab"
aliases: ["AGI Code sidebar chat", "AGI Code view (agi-workforce.sidebar)", "Code: Open Chat", "Code: Open Chat in Editor", "AGI Chat editor tab (ChatEditorPanel)", "S73.01", "S73.02", "S73.28"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.01", "S73.02", "S73.28"]
depends_on: ["surface:vscode", "mode:local", "mode:own-key", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-inference-providers", "SYS-local-inference", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "file:apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts", "file:apps/extension-vscode/src/integrations/localRuntimeClient.ts"]
basis: "code inspection"
second_reader: "7 of 12 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-01 Chat in the sidebar and in an editor tab

Main chat of the AGI Workforce VS Code extension. It lives in the AGI Code activity-bar view or in an editor tab titled AGI Chat. It sends turns to a local developer runtime on the machine and shows loading, setup-needed, trust and error states with retry. Only the VS Code app has it.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.01](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7301), [S73.02](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7302), [S73.28](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7328).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the VS Code extension a graphical chat. A person types a request, the extension starts a turn on a local runtime (the AGI CLI run as an app server) for the open folder, and the reply streams back into the panel. The same chat can sit in the side panel or open as a tab beside code. It also shows what the runtime is doing: checking, needing setup, waiting for a folder, or blocked by workspace trust.

**Why it exists.** Developers want to talk to the assistant without leaving the editor, with the code and the folder they already have open. The brief requires a sidebar chat, an editor-adjacent chat and clear loading, setup-needed and error states with retry (brief S73.01, S73.02, S73.28).

**Who uses it.** Developers using the AGI Workforce VS Code extension. Testers of the extension. Not available in Web, Desktop, Mobile, CLI or Chrome as this feature.

**Problems it solves**

- No need to switch to a browser or terminal to ask about code.
- A setup problem (no CLI, no folder, untrusted folder) is shown as a state with a button instead of a silent failure.
- A failed turn gets an error category and a retry when resending could work.

**Use cases**

- Open the AGI Code view and ask how a function works.
- Open the chat in an editor tab beside the file being changed.
- Open a folder that is not trusted yet and be told to trust it before chat can start.
- Hit a rate limit or provider error and press retry.

## 2. User experience

**Where to find it**

- VS Code: activity-bar container titled 'AGI Code' with one webview view named 'AGI Code' (apps/extension-vscode/package.json:953-970).
- VS Code: command palette titles 'Code: Open Chat' (agi-workforce.chat) and 'Code: Open Chat in Editor' (agi-workforce.openChatInEditor) (apps/extension-vscode/package.json:88-96).
- VS Code: keyboard shortcut Cmd+Shift+A (Ctrl+Shift+A on Windows/Linux) runs agi-workforce.chat when no AGI diff is under the cursor (apps/extension-vscode/package.json:1487-1491).
- VS Code: the editor-tab chat is titled 'AGI Chat', then 'AGI Chat 2' and so on (apps/extension-vscode/src/providers/chatEditorPanel.ts:63).
- VS Code native Chat: participant named 'agi' (full name 'AGI Code') (apps/extension-vscode/package.json:891-896).
- Web, Desktop, Mobile, CLI, Chrome: not part of this feature.

**Before you start**

- A folder open in VS Code (runtime status 'workspace-required' otherwise) (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4341-4350).
- A trusted workspace; the local runtime is not started in an untrusted one (apps/extension-vscode/package.json:54-57).
- The AGI CLI available on the machine; if missing the panel offers an install button (webviewContent.ts:4356-4359).
- Not virtual workspaces; a real filesystem is needed (apps/extension-vscode/package.json:78-80).
- Sign-in or a provider key is needed only for non-Local models; in the Local tier the model picker says 'Sign in or add a provider key to unlock these models' (shown only when tier === 'local'; for plan-blocked tiers the text is 'Your plan uses Auto; upgrade to <plan> to choose these models') (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2105-2123; apps/extension-vscode/src/features/model-picker/modelConstants.ts:100-103).

**Screens and controls**

- Composer with send; Enter behaviour setting agiWorkforce.composer.enterBehavior with values enter (default), modifierIfMultiline, modifier (apps/extension-vscode/package.json:1251-1265; webviewContent.ts:5944-5955).
- Stop control; cancel message handled in ChatStateManager.ts:1537-1545. Escape can stop if agiWorkforce.composer.escapeStops is on (package.json:1266-1269; webviewContent.ts:5939-5942).
- Runtime status block with a title, a message and one action button: Open folder, Manage Trust, Install CLI or Open setup (webviewContent.ts:4344-4361).
- Start-of-chat headline 'Start a conversation' and 'Ask about your code or describe a change.' (webviewContent.ts:4337-4339).
- Start suggestions and the five most recent conversations pushed when the view opens (ChatStateManager.ts:2463-2490).
- Model picker grouped 'On this device', 'Your providers', 'Managed Cloud', 'Unavailable' (ChatStateManager.ts:2034-2121).

**Journey**

1. Click the 'AGI Code' icon in the activity bar, or run 'Code: Open Chat'. With setting chatLocation 'editor' the command opens the tab instead (apps/extension-vscode/src/core/commandSetup.ts:1111-1125; package.json:1456-1465).
2. Wait while the panel shows 'Checking the developer runtime…' (webviewContent.ts:4303-4307).
3. If a status block shows, use its button (open folder, manage trust, install CLI, setup).
4. When ready, type a message and send with Enter (or the key chosen in settings).
5. Watch the reply stream; press stop to cancel (ChatStateManager.ts:1537).
6. If an error block shows, press retry when offered; the host handles 'retryRuntime' for runtime problems (ChatStateManager.ts:1509-1521).

**What the person sees and gets**

- Streamed reply in the chat; 'done' message when finished.
- Error block with a category (for example rate-limit, provider, sign-in, subscription, network, runtime, tool, permission) and a retry flag (apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:58-80).
- Runtime status block with text and a button.
- Screen-reader live region: the runtime status element has role=status and aria-live=polite (webviewContent.ts:3122).

**Settings**

- agiWorkforce.chatLocation: sidebar or editor (package.json:1456-1465).
- agiWorkforce.chat.lockEditorGroups (package.json:1466).
- agiWorkforce.useTerminal: opens the CLI in a terminal instead of graphical chat; defaults to false (commandSetup.ts:1112-1115; package.json:1472-1476).
- agiWorkforce.composer.enterBehavior and agiWorkforce.composer.escapeStops (package.json:1251-1269).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Sidebar webview provider is registered with retainContextWhenHidden true (apps/extension-vscode/src/core/chatSetup.ts:61-64).
- Editor-tab chat panels are created with retainContextWhenHidden true and can be opened several times (apps/extension-vscode/src/providers/chatEditorPanel.ts:63-72).
- sendMessage hands the text to _handleSendMessage, which calls runtime.startTurn with the folder as cwd (ChatStateManager.ts:1523-1534, 5386-5392).
- Cancel interrupts the active turn and records a 'generation_stopped' product event (ChatStateManager.ts:1537-1545).
- Runtime states probing, ready, workspace-required, workspace-untrusted, needs-setup are rendered (webviewContent.ts:4303-4361).
- Error text is mapped to categories with a retryable flag (errorPresentation.ts:110-150, 533-549).
- Model picker data is grouped by boundary and managed models are marked unavailable when the plan blocks them (ChatStateManager.ts:2034-2121).

**Incomplete**

- The exact screen text for every error category and its translation was not read in full; only the mapping code was opened (errorPresentation.ts:110-150).

**Present but disconnected or switched off**

- agiWorkforce.useTerminal (default false, package.json:1472-1476) routes 'Code: Open Chat' to a terminal session instead of the webview when turned on (commandSetup.ts:1111-1115).

**Not available**

- Web, Desktop, Mobile, CLI and Chrome do not have this feature; the brief marks only vscode (area brief S73.01, S73.02, S73.28).
- Virtual workspaces are unsupported (package.json:78-80).
- Untrusted workspaces: chat is unavailable until trusted (package.json:54-57).

## 4. Required behaviour

**Established requirements**

- An AGI Workforce view in the VS Code sidebar hosts a chat that sends turns and streams replies. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S73.01)
- Chat can open as an editor tab beside code, and @agi works in VS Code native Chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S73.02)
- The chat webview shows loading, setup-needed and error states with a retry. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S73.28)
- Model agnostic and provider agnostic; Local, own key and Cloud are separate boundaries and nothing may silently move a Local chat to another boundary. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. With a trusted folder open and the CLI installed, clicking the AGI Code icon shows the chat and the status block disappears.
2. Sending a message streams a reply; pressing stop ends it and the composer is usable again.
3. Opening 'Code: Open Chat in Editor' twice gives tabs 'AGI Chat' and 'AGI Chat 2'.
4. Opening a window with no folder shows 'Open a workspace' style text and an Open folder button.
5. Opening an untrusted folder shows a Manage Trust button and sends nothing.
6. A simulated 429 shows a rate-limit error with a retry control; a 402 shows a subscription error without a plain retry.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Switching the sidebar to another view and back keeps typed draft and scroll position because the webview context is retained [inferred from retainContextWhenHidden true, chatSetup.ts:61-64].
- Local-boundary chats run with no payment because the picker has an 'On this device' group that stays inside the local runtime (ChatStateManager.ts:2034-2038) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document the exact keyboard accept for retry so keyboard users do not need the mouse.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | viewsContainers and views | `apps/extension-vscode/package.json` | Declares the AGI Code activity-bar container and the webview view agi-workforce.sidebar (lines 953-970). |
| command | agi-workforce.chat | `apps/extension-vscode/src/core/commandSetup.ts` | Opens chat in the sidebar, the editor tab or a terminal depending on settings (lines 1111-1125). |
| command | agi-workforce.openChatInEditor | `apps/extension-vscode/src/core/commandSetup.ts` | Creates a new editor-tab chat panel (lines 1130-1140). |
| service | setupChat | `apps/extension-vscode/src/core/chatSetup.ts` | Registers the sidebar view provider with retainContextWhenHidden and the native chat participant (lines 40-66). |
| component | SidebarProvider | `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts` | Hosts the sidebar webview and owns a ChatStateManager. |
| component | ChatEditorPanel | `apps/extension-vscode/src/providers/chatEditorPanel.ts` | Editor-tab webview panel with title numbering and optional editor-group lock. |
| store | ChatStateManager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Host-side brain of the chat: message handling, turn start, cancel, retryRuntime, model picker data, recent conversations. |
| screen | Chat webview HTML and script | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Renders composer, runtime status block, start copy, Enter handling and mention popover. |
| service | errorPresentation | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | Turns provider and runtime failures into a category, headline and retryable flag. |
| service | LocalRuntimeClient | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Spawns the AGI CLI with the app-server argument and speaks to it over stdio (lines 2544-2579). The spawn passes --workspace-consent with the folder and consent time, may add --no-memory when memory is disabled, and may add --allow-dangerously-skip-permissions (localRuntimeClient.ts:2553-2579). |
| service | startSuggestions | `apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts` | Resolves the empty-state suggestion list pushed on open. |
| integration | Chat participant @agi | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` | Same runtime through VS Code native Chat (startTurn at line ~591). |
| config | composer settings | `apps/extension-vscode/package.json` | enterBehavior, escapeStops, chatLocation, lockEditorGroups, useTerminal (lines 1251-1272, 1456-1476). |
| test | chat and shell tests | `apps/extension-vscode/src/__tests__/chatStateManager.test.ts` | Host chat behaviour tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the AGI Code view; VS Code resolves the webview provider. | device | apps/extension-vscode/src/core/chatSetup.ts:61-64 |
| Host probes the local runtime for the active workspace folder and posts runtimeStatus to the webview. The runtime is spawned with --workspace-consent (folder and consent time), optionally --no-memory when memory is disabled, and optionally --allow-dangerously-skip-permissions. | device | ChatStateManager.ts:1509-1521; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2544-2579 (spawn flags at 2553-2579) |
| Person sends text; webview posts sendMessage; host calls _handleSendMessage then runtime.startTurn with cwd and inputs. | device | ChatStateManager.ts:1523-1534, 5386-5392 |
| The runtime sends the prompt to the selected model. For an on-device model this stays on the machine; for own-key it goes to that provider; for Managed Cloud to AGI infrastructure (picker descriptions). | device and our servers | ChatStateManager.ts:2034-2121 (group descriptions). The runtime's own network code is not in this repo path and was not opened. |
| Reply events stream back and are posted to the webview; on failure errorPresentation maps the error. | device | errorPresentation.ts:110-150 |
| Stop posts cancel and interrupts the active turn. | device | ChatStateManager.ts:1537-1545 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chat thread and messages for the folder | Held by the local runtime per workspace folder; exact on-disk location not opened (unknown). | Not synced by this feature; cloud chats are a separate list (see F073-06). | Auto-archive of inactive sessions is off by default (agiWorkforce.archiveInactiveSessionsDays defaults to 0, 'Set to 0 to keep the feature off'). When set to 1-365 days it archives closed Local sessions and needs a CLI that supports inactivity checks (package.json:1224-1231); deletion rules unknown. |
| Composer drafts per thread | Webview state (vscode.setState) (webviewContent.ts:5972-5979). | No. | Lives with the webview state. |

**Models and providers.** The picker lists on-device models (Ollama and LM Studio), the person's own providers and Managed Cloud models; a model is chosen per thread and revalidated before every turn (ChatStateManager.ts:2034-2121). No model names are recorded here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local models: no code was found that forces sign-in for them. The 'Sign in or add a provider key to unlock these models' hint is shown only for the Local tier, where isManagedModelAccessBlocked returns true so every managed model is blocked (ChatStateManager.ts:2105-2123; apps/extension-vscode/src/features/model-picker/modelConstants.ts:100-103). Cloud models need a browser sign-in or API key [inferred]. |
| Permissions | Workspace must be trusted; agent mode and shell approval are separate settings (package.json:54-75). |
| Subscription | Managed models are shown as 'Unavailable · <heading>' when isManagedModelAccessBlocked(tier) is true (ChatStateManager.ts:2105-2123). The upgrade text comes from manualModelUnlockText ('Your plan uses Auto; upgrade to <plan> to choose these models'), generated from the plan ladder rather than static (ChatStateManager.ts:983-990). Access is gated by the 'developer_surfaces' plan capability (modelConstants.ts:100-103). |
| Limits and metering | Rate-limit and plan errors surface as rate-limit and subscription categories (errorPresentation.ts:119-140). A usage meter is posted from managed-plan data (ChatStateManager.ts:925-962), which is a call to a server by the host. |
| Feature flags | None found in the code beyond settings listed above. |
| Model compatibility | Any model offered by the picker; none-in-picker models are not selectable. |
| Provider restrictions | Own-key requests go directly to the provider with the person's key (ChatStateManager.ts:2112-2114). |
| Local mode | Chat runs through the local runtime on an on-device model. The 'no AGI Cloud call by this host' claim is not proven by the cited lines: the host also calls a server for the usage meter (ChatStateManager.ts:925-962) and Export Diagnostics sends data to the cloud web origin (commandSetup.ts:1504-1530). The group text only says Ollama and LM Studio stay inside the local runtime. The picker shows a disabled 'No local models found' item only when neither local models nor local servers are found; if servers were detected it shows one disabled setup row per server with its health text (ChatStateManager.ts:2034-2061). The Local privacy boundary can refuse network access for web search; the web-search request text tells the model to state that limitation (ChatStateManager.ts:~283, WEB_SEARCH_REQUEST). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Checking the developer runtime…' with status block shown. | webviewContent.ts:4303-4307 |
| Empty | Headline 'Start a conversation', start suggestions, recent conversations. | webviewContent.ts:4337-4339; ChatStateManager.ts:2463-2490 |
| No folder | Title from openWorkspaceToBegin, Open folder button. | webviewContent.ts:4341-4358 |
| Untrusted workspace | Restricted mode text and Manage Trust button; runtime not started. | webviewContent.ts:4344-4358; package.json:54-57 |
| CLI missing | Install CLI button. | webviewContent.ts:4356-4359 |
| Error and retry | Category plus retryable flag; retry resends only when flagged. | errorPresentation.ts:119-146; ChatStateManager.ts:287-296 |
| Cancel | Interrupts the turn; if none active posts done. | ChatStateManager.ts:1537-1545 |
| Hidden view | State kept. | chatSetup.ts:61-64 |
| Offline | Network category exists; offline wording not read. | errorPresentation.ts:229 |
| Accessibility | Status block is a polite live region and its title takes focus on recovery. | webviewContent.ts:3122, 3698-3699 |
| No local models | Disabled 'No local models found' item only when neither models nor local servers are found; otherwise one disabled row per detected server with its health text. | ChatStateManager.ts:2034-2061 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: Host message handling for the chat.
- `apps/extension-vscode/src/__tests__/chatEditorPanel.test.ts`: Editor-tab chat panel.
- `apps/extension-vscode/src/__tests__/chatRetry.test.ts`: Retry of the last message and refusal while streaming.
- `apps/extension-vscode/src/__tests__/errorPresentation.webview.test.ts`: Error block rendering.
- `apps/extension-vscode/src/__tests__/sidebarShell.webview.test.ts`: Sidebar shell rendering.
- `apps/extension-vscode/src/__tests__/viewContainerContribution.test.ts`: Activity-bar container contribution.
- `apps/extension-vscode/src/__tests__/runtimePill.webview.test.ts`: Runtime status display.
- `apps/extension-vscode/src/__tests__/composerControls.send.webview.test.ts`: Send controls.
- `apps/extension-vscode/src/__tests__/lazyActivation.test.ts`: Activation behaviour.

**Test scenarios**

- **First chat**
  1. Open a trusted folder with the CLI installed.
  2. Click the AGI Code icon.
  3. Send a short question.
  - Expected: Reply streams and ends; no status block remains.
- **No folder**
  1. Open VS Code with no folder.
  2. Open the AGI Code view.
  - Expected: Open a workspace text and an Open folder button.
- **Untrusted**
  1. Open a folder in Restricted Mode.
  2. Open the view.
  - Expected: Manage Trust button; no message can start a turn.
- **Editor tab**
  1. Run 'Code: Open Chat in Editor' twice.
  - Expected: Two tabs, AGI Chat and AGI Chat 2.
- **Stop**
  1. Send a long request.
  2. Press stop.
  - Expected: Streaming ends and the composer is ready.
- **Rate limit**
  1. Cause a provider 429 on an own-key model.
  - Expected: Rate-limit error with retry.

**Where to look when it fails**

- Developer output channel registered by registerDeveloperOutput (chatSetup.ts:45).
- Command 'Code: Export Diagnostics' (agi-workforce.exportDiagnostics) requires sign-in and sends diagnostics to the cloud web origin, so it is a server call (commandSetup.ts:1504-1530).
- Runtime spawn failures logged from localRuntimeClient.ts around line 2573.

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **No recorded run proves the full flow in a real VS Code window in this knowledge base.** Affects: Testers, VS Code app. Evidence: No result file read; only unit test files exist.. Work needed: Run the integration suite (package.json test:integration) and record results.
- **Where the local runtime stores threads on disk was not established.** Affects: Privacy review. Evidence: Not opened.. Work needed: Read the CLI thread store and document it.

**Depends on**

- surface:vscode
- mode:local
- mode:own-key
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-inference-providers
- SYS-local-inference
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- file:apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts
- file:apps/extension-vscode/src/integrations/localRuntimeClient.ts

## Unknown

- Where the local runtime stores thread data on disk.
- Whether Local chat works fully signed out; no code was found requiring sign-in but this was not exercised.
- Which exact cloud route the runtime uses for Managed Cloud models.

## Second reader's check

A second reader checked 12 statements of this page against the code: 7 correct, 5 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "agiWorkforce.useTerminal is off by default per its restricted-configuration entry, value not read" The code shows: The default is declared as false, and the restricted-configuration list is only about untrusted workspaces, not defaults. commandSetup.ts:1111-1115 does route to the terminal when the setting is on. (apps/extension-vscode/package.json:1472-1476 (default false); commandSetup.ts:1111-1115). **Corrected:** agiWorkforce.useTerminal defaults to false. The 'Unknown: exact default' item can be removed.
- **Partly wrong (section 6):** "Data table: auto-archive of inactive sessions after agiWorkforce.archiveInactiveSessionsDays (package.json:74)" The code shows: package.json:74 is only the restricted-configuration list entry. The setting itself defaults to 0, which keeps archiving off. It archives closed Local sessions, needs a CLI that supports inactivity checks, and has a 365-day maximum. (apps/extension-vscode/package.json:1224-1231 (default 0, 'Set to 0 to keep the feature off')). **Corrected:** Auto-archive is off by default (0). When set to 1-365 days it archives closed Local sessions. Cite package.json:1224-1231.
- **Partly wrong (section 7):** "Account: Local models need no sign-in; picker text implies sign-in or a key unlocks other models (ChatStateManager.ts:2119-2121)" The code shows: The 'Sign in or add a provider key to unlock these models' text is shown only when tier === 'local'. isManagedModelAccessBlocked returns true for tier 'local', so every managed model is blocked in the Local tier. For other blocked tiers the text is manualModelUnlockText ('Your plan uses Auto; upgrade ...'). The code does not require sign-in for local models, but the page's 'Unknown: whether Local works signed out' is hedged more than needed. (ChatStateManager.ts:2105-2123; apps/extension-vscode/src/features/model-picker/modelConstants.ts:100-103). **Corrected:** The 'Sign in or add a provider key' hint is shown only for the Local tier. The text for plan-blocked tiers is 'Your plan uses Auto; upgrade to <plan> to choose these models'.
- **Partly wrong (section 7):** "Subscription: managed models shown 'Unavailable' when the plan blocks them; text says to upgrade (ChatStateManager.ts:2100-2121, 1000-1010)" The code shows: 2105-2123 is correct: group boundary 'unavailable' with label 'Unavailable · <heading>' when isManagedModelAccessBlocked(tier), and the upgrade text comes from manualModelUnlockText at :983-990. Lines 1000-1010 are unrelated constants (ReplyBookmark, storage keys). Access depends on the 'developer_surfaces' billing capability. (ChatStateManager.ts:983-990, 2105-2123; modelConstants.ts:100-103). **Corrected:** Cite ChatStateManager.ts:983-990 for the upgrade text. Add that access is gated by the developer_surfaces plan capability, and that this text is generated from the plan ladder rather than being static.
- **Partly wrong (section 7):** "Local mode: chat runs through the local runtime on an on-device model with no AGI Cloud call by this host; 'No local models found' item when none is running (ChatStateManager.ts:2043-2056)" The code shows: The disabled 'No local models found' item appears only when localModels is empty AND no local servers were detected. If servers were detected, per-server disabled setup items are shown instead (health text). Separately, the host does call a server for the usage meter and Export Diagnostics, so 'no AGI Cloud call by this host' is not shown by the cited lines. The group text only says Ollama and LM Studio stay inside the local runtime. (ChatStateManager.ts:2034-2061; commandSetup.ts:1504-1530 (diagnostics sent to the cloud web origin)). **Corrected:** 'No local models found' shows only when neither models nor local servers are found. Otherwise the picker shows one disabled row per detected server with its health text. The 'no AGI Cloud call' claim is not proven by these lines.

**Facts the page missed**

- Export Diagnostics (agi-workforce.exportDiagnostics) is sign-in gated and sends data to the cloud web origin, so it is one server call that the page leaves out of the Local mode rule. The page mentions the sign-in gate but not the server call. apps/extension-vscode/src/core/commandSetup.ts:1504-1530
- The Local privacy boundary can refuse network access for web search. The web-search request text tells the model to state that limitation, so Local mode has a documented network restriction. apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:~283 (WEB_SEARCH_REQUEST)
- The localRuntimeClient spawn passes --workspace-consent with the folder and consent time, may add --no-memory when memory is disabled, and may add --allow-dangerously-skip-permissions. The page's data flow omits these. apps/extension-vscode/src/integrations/localRuntimeClient.ts:2553-2579
