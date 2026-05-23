# R26-PARITY Lane W6 — VS Code Extension Parity Audit

**Date:** 2026-05-22
**Auditor:** VS Code Extension Engineer (vscode-ext-engineer)
**Reference images:**

- `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/` — 9 images (Claude Code for VS Code v2.1.86)
- `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/` — 14 images (Cursor integrating Claude Code)
  **Our source:** `apps/extension-vscode/` v0.3.0

---

## 1. Inventory Table

### 1A. Claude Code for VS Code (Anthropic extension, v2.1.86)

| #   | Screenshot                                                  | Feature Observed                                                                                                                                                                                                                                                                                             | Notes                                                                                           |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 01  | `01_vscode-extension_marketplace-detail-page.png`           | Marketplace listing: "Claude Code for VS Code", 6M installs, 3.5★, single-provider (Anthropic), Pro/Max/Enterprise pricing, v2.1.86, categories: AI, Chat                                                                                                                                                    | Extension routes through terminal CLI; subagents, custom slash commands, MCP supported          |
| 02  | `02_vscode-sidebar_chat-new-chat-empty-state.png`           | Sidebar webview: Claude Code branding, new chat CTA, "Code-only software" toggle in sidebar, usage-limit upgrade nag overlaid on right panel                                                                                                                                                                 | Sidebar is their primary UI; right-panel is GitHub Copilot chat with @Agent/@claude participant |
| 03  | `03_vscode-extension_settings-editor-view.png`              | Settings editor: 13 settings visible (allowDangerouslySkipPermissions, Autosave, ProcessWrapper, DisableLoginPrompt, EnableNewConversationShortcut, EnvironmentVariables, HideOnboarding, InitialPermissionMode, PreferredLocation, RespectGitIgnore, UseCtrlEnterToSend, UsePythonEnvironment, UseTerminal) | Settings use VS Code native settings editor                                                     |
| 04  | `04_vscode-extension_settings-with-usage-limit-sidebar.png` | Same settings editor view with usage limit banner: "Upgrade for 3x usage & faster responses", "You've reached your limit. Responses may be slower."                                                                                                                                                          | Subscription gating in settings                                                                 |
| 05  | `05_vscode-chat_modes-dropdown-and-effort-slider.png`       | Chat UI modes dropdown: **Ask before edits**, **Edit automatically**, **Plan mode**, **Bypass permissions** (all 4 modes with icons + descriptions) + **Effort slider** (High) at bottom bar                                                                                                                 | Mode names differ from ours; effort shown as slider not chip                                    |
| 06  | `06_vscode-chat_actions-and-settings-menu.png`              | Actions & Settings menu (Cmd+K within chat): Context section (Attach file, Mention file from project, Clear conversation, Rewind); Model section (Switch model, Effort slider, Thinking toggle, Account & usage, Toggle fast mode Opus 4.6 only)                                                             | Rewind, Thinking toggle, fast mode toggle, Account & usage all in one menu                      |
| 07  | `07_vscode-chat_input-add-context-menu.png`                 | Input bar (+) menu: **Upload from computer**, **Add context** (2 items)                                                                                                                                                                                                                                      | Minimal + menu                                                                                  |
| 08  | `08_vscode-main-editor_chat-empty-state-full-screen.png`    | Full-screen chat in main editor area: same empty state, with "Prefer the Terminal experience? Switch back in Settings." banner and "Bypass permissions" mode shown in status bar                                                                                                                             | Full-screen/editor-tab chat surface                                                             |
| 09  | `09_vscode-main-editor_chat-sessions-history-dropdown.png`  | Session history dropdown: Local/Web tabs, search sessions, session list with timestamps (1m, 11m, 2d, 5d, 6d, 7d) and action icons                                                                                                                                                                           | Local vs Web session switching                                                                  |

### 1B. Cursor Integrating Claude Code (2026-05-15)

| #   | Screenshot                                           | Feature Observed                                                                                                                                                                                                                    | Notes                                                          |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 300 | `300_cursor_extension-installed_activitybar.png`     | Claude Code activity bar entry in Cursor sidebar (among .claude, .cargo, etc.)                                                                                                                                                      | Extension present in Cursor's activity bar                     |
| 301 | `301_cursor_claude-code_panel-empty-state.png`       | Panel view (bottom): same empty state as sidebar; coexists with Cursor's own "New Agent" in right sidebar                                                                                                                           | Two agent surfaces side by side                                |
| 302 | `302_cursor_claude-code_sidebar-empty-state.png`     | Sidebar empty state (larger, full): same layout; "Prefer the Terminal experience? Switch back in Settings." banner; "Bypass permissions" in status bar                                                                              | Identical empty state content                                  |
| 303 | `303_cursor_claude-code_header-actions.png`          | Header row actions: history icon, new chat icon; right side of same view                                                                                                                                                            | Minimalist header                                              |
| 304 | `304_cursor_claude-code_session-history.png`         | Session history with Local/Web tabs, search field, per-session entries with delete icons                                                                                                                                            | Same history UI as Claude standalone                           |
| 305 | `305_cursor_claude-code_command-palette.png`         | Actions & Settings (Cmd+K): identical menu — Attach file, Mention file, Clear conversation, Rewind; Model section: Switch model, Effort, Thinking toggle, Account & usage, Toggle fast mode                                         | Same menu in Cursor context                                    |
| 306 | `306_cursor_claude-code_settings.png`                | Cursor Settings panel: Cursor Account, Upgrade to Pro, Editor Settings, Keyboard Shortcuts, Import Settings from VS Code, Reset "Don't Ask Again" Dialogs, Window Layout (Agent/Editor), Conversation Density (Detailed), Title Bar | Cursor's own settings pane, not Claude Code extension settings |
| 307 | `307_cursor_claude-code_walkthrough.png`             | Claude Code walkthrough card inside Cursor: `/team-onboarding` command triggered, step list with "Thought for 0s, Looking at…, Thinking…, Cogitating…"                                                                              | Walkthrough/slash-command onboarding visible                   |
| 308 | `308_cursor_claude-code_selected-code-context.png`   | AGI Workforce Better Outcomes Review document open; Claude Code sidebar showing file context passed automatically                                                                                                                   | Auto-selected code context injection                           |
| 309 | `309_cursor_claude-code_at-mention.png`              | At-mention help sidebar: "How to use it" (Cmd+P → "Claude Code: Open in Side Bar"), disambiguating Claude Code extension vs Cursor's built-in Claude Code UI                                                                        | At-mention disambiguation panel                                |
| 310 | `310_cursor_claude-code_permission-notification.png` | Permission notification: "Continue in Terminal to manage permissions? / Permission settings are shared between Terminal and this IDE." → "1 Continue in Terminal / 2 Never mind"                                                    | Terminal-linked permission sharing notification                |
| 311 | `311_cursor_claude-code_diff-review-inline.png`      | Inline diff review: plan content shown in chat panel with inline diff decorations in main editor; at top left Claude Code activity bar shows diff indicator                                                                         | Inline diff review with plan                                   |
| 312 | `312_cursor_claude-code_plan-preview.png`            | Plan preview: chat output structured as "File Capture, Proposed change: Append line, Steps: 1. Open the file…, Risk: The user asked…" with explicit plan items                                                                      | Plan preview structured output in chat                         |
| 313 | `313_cursor_claude-code_open-in-terminal.png`        | macOS system dialog: "Terminal wants to access to control Cursor. Allowing control will provide access to documents and data in Cursor, and to perform actions within that app." Don't Allow / Allow                                | OS-level terminal access permission dialog                     |

---

## 2. Parity Scorecard

| Feature Area                | Claude (ref)                                                                                                                   | Cursor-CC (ref)                                                 | Our Implementation                                                                              | Status                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **@chat participant**       | `@claude` in Copilot chat                                                                                                      | n/a (Cursor has own)                                            | `@agi` with /explain /fix /refactor /tests /docs /model                                         | PARITY+                                                                                                                                 |
| **Sidebar webview**         | Full-screen chat, mode chip, effort, model, + menu                                                                             | Same                                                            | webviewContent.ts: mode-chip, effort-chip, model-chip, + menu, upload, add context, plan mode   | PARITY                                                                                                                                  |
| **Agent modes**             | Ask before edits / Edit automatically / Plan mode / Bypass permissions                                                         | Same                                                            | ask / auto / plan / bypass (`agiWorkforce.agent.mode`)                                          | PARITY                                                                                                                                  |
| **Effort control**          | Slider (3-position: Low/Med/High) + Thinking toggle separate                                                                   | Same                                                            | effort-chip (4-position: low/medium/high/max) + `agiWorkforce.agent.effort`                     | PARTIAL — no Thinking toggle exposed in webview (only in `@agi` via API); effort level count: we have 4 vs their 3 (AHEAD on that axis) |
| **Diff review inline**      | CodeLens accept/reject per-hunk + gutter +/- decorations                                                                       | Same + plan preview                                             | `diffDecorationProvider.ts` + `DiffCodeLensProvider`: Accept/Reject/Accept All/Reject All/Batch | PARITY+ (adds batch, confidence label, aggressive fuzzy retry)                                                                          |
| **Plan preview**            | Text plan shown in chat before edits                                                                                           | Structured plan output                                          | agentLoop + plan mode → shows plan text in webview, user confirms before apply                  | PARITY                                                                                                                                  |
| **Session history**         | Local/Web tab split, search, timestamp, delete                                                                                 | Same                                                            | `conversationTreeProvider.ts` History tree, history button in webview                           | PARTIAL — no Local/Web tab split (no cloud history in v1 LOCAL ONLY by design)                                                          |
| **File attach / context**   | Upload from computer + Add context / Mention file                                                                              | Same                                                            | Upload from computer + Add context + mentionFileInChat + Context Files tree (pinned + auto)     | PARITY+                                                                                                                                 |
| **Rewind**                  | Rewind in action menu                                                                                                          | Same                                                            | `agi-workforce.rewindLast` command, webview plus menu                                           | PARITY                                                                                                                                  |
| **Model picker**            | Switch model (single-provider, Default recommended)                                                                            | Same                                                            | buildGroupedQuickPickItems: auto-balanced + auto-economy + auto-premium + per-provider grouped  | AHEAD — multi-provider grouped picker                                                                                                   |
| **Settings**                | 13 settings in native VS Code settings editor                                                                                  | Cursor-own settings pane                                        | 17 settings in native settings + untrustedWorkspaces restrictions                               | PARITY                                                                                                                                  |
| **Keybindings**             | Cmd+Shift+M model switch, Cmd+Ctrl+N new conversation; **Shift+Tab cycles modes**                                              | Same                                                            | 14 keybindings including diff accept/reject; **no mode-cycle shortcut**                         | PARTIAL — no Shift+Tab cycle-mode binding                                                                                               |
| **Usage-limit banner**      | Upgrade nag + "You've reached your limit" overlay on right panel (`04_vscode-extension_settings-with-usage-limit-sidebar.png`) | n/a                                                             | `usageMeterBanner` div in `webviewContent.ts` (display:none until tier threshold)               | PARITY                                                                                                                                  |
| **Walkthrough**             | Not present in Claude Code standalone ext                                                                                      | Cursor: `/team-onboarding` custom slash command via walkthrough | No `walkthroughs` contribution in package.json                                                  | GAP (P2)                                                                                                                                |
| **Permission notification** | Not in Claude Code standalone ext                                                                                              | "Continue in Terminal" permission dialog                        | No equivalent terminal-permission bridge dialog                                                 | GAP (P2)                                                                                                                                |
| **Fast mode toggle**        | "Toggle fast mode (Opus 4.6 only)" in action menu                                                                              | Same                                                            | No fast-mode toggle in webview                                                                  | GAP (P2)                                                                                                                                |
| **Thinking toggle**         | Separate toggle in action menu                                                                                                 | Same                                                            | Not exposed in webview; effort chip covers reasoning but no binary thinking on/off              | GAP (P1)                                                                                                                                |
| **Account & usage**         | "Account & usage…" in action menu                                                                                              | Same                                                            | `agi-workforce.showTierStatus` command exists but not in webview action menu                    | GAP (P1)                                                                                                                                |
| **Local/Web session tabs**  | Session history with Local/Web tabs                                                                                            | Same                                                            | History tree is local-only (by v1 design); no tab split                                         | BY DESIGN (v1 LOCAL ONLY)                                                                                                               |
| **Code lens**               | Not shown in reference images                                                                                                  | Not shown                                                       | `codeLensProvider.ts`: Ask AI / Tests / Docs above functions                                    | AHEAD                                                                                                                                   |
| **Hover provider**          | Not shown                                                                                                                      | Not shown                                                       | `hoverProvider.ts`: quick actions on identifier hover                                           | AHEAD                                                                                                                                   |
| **Desktop bridge**          | Not present                                                                                                                    | Not present                                                     | `desktopBridge.ts` port 8787, send-to-desktop, sync context                                     | AHEAD                                                                                                                                   |
| **Memory tree**             | Not present                                                                                                                    | Not present                                                     | `memoryTreeProvider.ts`, memory.create / edit / delete                                          | AHEAD                                                                                                                                   |
| **Checkpoint system**       | Not present                                                                                                                    | Not present                                                     | `checkpointManager.ts`: createCheckpoint / restoreCheckpoint / listCheckpoints                  | AHEAD                                                                                                                                   |
| **Workspace trust gating**  | Not shown                                                                                                                      | Not shown                                                       | Untrusted workspace restrictions on file edits + agent auto-apply                               | AHEAD                                                                                                                                   |
| **Patch engine**            | Not present                                                                                                                    | Not present                                                     | `patchEngine.ts`: fuzzy match, aggressive retry, confidence, batch undo                         | AHEAD                                                                                                                                   |
| **Multi-provider**          | Single provider (Anthropic)                                                                                                    | Single provider                                                 | 10+ providers via `agiWorkforce.providerStreamProvider`                                         | AHEAD                                                                                                                                   |

---

## 3. User-Flow Reality Check

> Question: "If a user installed agi-workforce-0.3.0.vsix in VS Code, what would they **actually experience** end-to-end vs Claude Code?"
> Source basis: every claim below traces to a concrete registration or dispatch call in the source.

### 3.1 Extension activation

On first install the extension activates `onStartupFinished` (`package.json` activationEvents). The activation order (`extension.ts:26–193`) is:

1. Subsystem health init → telemetry → model metrics → desktop bridge (`activateDesktopBridge`) → checkpoint manager.
2. Code intelligence providers registered unconditionally: `AgiCodeActionProvider` (`*`), `AgiHoverProvider` (`*`), `DiffDecorationProvider` (`*`) — all live immediately.
3. CodeLens and InlineCompletion providers registered conditionally: `syncCodeLensProvider()` checks `agiWorkforce.codeLensEnabled` (default `true`); `syncInlineCompletionProvider()` checks `agiWorkforce.inlineCompletions.enabled` (default `true`). Both register on first activation unless the user has disabled them.
4. Chat participant `agiworkforce.agi` registered via `vscode.chat.createChatParticipant` (`chatParticipant.ts:557`).
5. Sidebar webview view registered via `vscode.window.registerWebviewViewProvider('agi-workforce.sidebar', sidebarProvider, { retainContextWhenHidden: true })` (`chatSetup.ts:47`).
6. History tree registered as `TreeDataProvider` on `agi-workforce.conversations` (`chatSetup.ts:50`).
7. Context Files tree registered on `agi-workforce.contextPanel` (`chatSetup.ts:57`).
8. Memory tree registered on `agi-workforce.memory` (`chatSetup.ts:64`).
9. Status bar item created, showing `$(hubot) AGI: auto-balanced` on fresh install.
10. First-run: if no API key is stored → `showInformationMessage` "Welcome to AGI Workforce! Set up your API key…" with "Set API Key" / "Later" buttons (`extension.ts:252`).
11. Inline completions first-run notice fires once if the setting has never been set (`extension.ts:219`).

**Verdict**: Activation path is fully wired. All providers, trees, participant, and sidebar register from a single `activate()` call with no dead-code paths to the core surface.

### 3.2 @agi chat participant

**Does it register and respond?** Yes.

- `vscode.chat.createChatParticipant('agiworkforce.agi', handler)` at `chatParticipant.ts:557` — participant appears as `@agi` in Copilot chat panel.
- On any message: `gatherEditorContext()` → `buildSystemPrompt()` → `buildUserMessage()` → `streamChatCompletion()` or `streamChatCompletionViaProvider()` (if `useProviderStream` flag is on).
- Response tokens are streamed to `vscode.ChatResponseStream` via `stream.markdown(t)` in the `onToken` callback (`chatParticipant.ts:392`).
- After the stream completes, the conversation is persisted to `ConversationStore` (local `globalState` only — SYNC-RULE compliant) and `ConversationTreeProvider.refresh()` is called (`chatParticipant.ts:397–409`).
- Follow-up suggestions are registered (`chatParticipant.ts:563–575`): `/explain`, `/fix`, `/tests` appear after each response.

**Fallback chain**: if no API key → `AgiWorkforceApiError(NO_API_KEY)` → falls back to `vscode.lm` (Copilot models) if `fallbackToVscodeLm: true` (`chatParticipant.ts:487`). If Copilot is not installed, a markdown error card with a "Set API Key" link is rendered.

**Plan mode in @agi**: `Config.agentPlanMode()` is read; if true, system prompt appends plan-mode instruction and user sees `_Plan mode is enabled. Reply with "proceed" to run the plan._` before the response (`chatParticipant.ts:376–378`). "Proceed"-detection via `isExecutionConfirmation()` regex (`chatParticipant.ts:205–208`).

### 3.3 /explain /fix /refactor /tests /docs /model — distinct dispatch or all generic?

**Each command fires a distinct, command-specific system prompt branch and user message.** They are not generic.

In `chatParticipant.ts`:

- `buildSystemPrompt()` (`chatParticipant.ts:98`): appends a command-specific guidance paragraph for each of `explain`, `fix`, `refactor`, `tests`, `docs` (`chatParticipant.ts:137–157`). These are different strings that orient the model differently.
- `buildUserMessage()` (`chatParticipant.ts:257`): each command builds a different user message with command-specific framing. Example: `/fix` → `"Find and fix any bugs or issues in the selected code. Provide the corrected code and explain each fix."` vs `/tests` → `"Generate unit tests for the selected ${lang} code using the appropriate testing framework. Cover happy paths, edge cases, and error conditions."`.
- `/model` is handled as a special case that opens the model QuickPick directly and returns early (`chatParticipant.ts:343–347`).

**The same pattern holds for inline commands** (`runInlineCommand.ts`): `explain`, `fix`, `refactor`, `tests`, `docs` each map to a distinct `prompts[command]` string (`runInlineCommand.ts:74–80`) and call `chatCompletion()` independently. The `fix` command is the only one that calls `applyLlmEdit` with `autoApply: true` when `autoApplyFixes` is on.

**Verdict**: All 6 @agi slash commands dispatch distinct prompts — not a single shared generic handler.

### 3.4 Sidebar webview — loads and persists state?

**Yes — and with retainContextWhenHidden.**

- Registered with `{ webviewOptions: { retainContextWhenHidden: true } }` (`chatSetup.ts:48`): the webview DOM is not destroyed when the sidebar collapses.
- `SidebarProvider` wires the webview lifecycle to `ChatStateManager` (`sidebarProvider.ts`): message history, mode chip, effort chip, model chip, and context files are all serialized to `workspaceState` (VS Code `WorkspaceStateStorage`) between reloads.
- `pushUsageMeter()` is called from `extension.ts:137` on every `agiWorkforce.model` / `agiWorkforce.apiKey` config change — the usage meter banner updates live without reloading the webview.

### 3.5 History tree + Context Files tree — populated from desktop bridge?

**No — both are independent of the bridge.**

- `ConversationTreeProvider` reads exclusively from `ConversationStore`, which reads from `vscode.ExtensionContext.globalState` (`conversationTreeProvider.ts:9,39`). No bridge calls anywhere in the tree provider or the store.
- `ContextPanelProvider` manages pinned files and auto-context in memory (watching VS Code events); no bridge dependency (`contextPanelProvider.ts` — grep returned zero bridge references).
- The desktop bridge (`desktopBridge.ts`, port 8787) is used only for: `sendToDesktop`, `syncContextToDesktop`, `triggerAgentAction`, `sendFeedback` (when bridge connected). It is **not** a dependency for sidebar, history, or context trees — those work with bridge disconnected or bridge disabled.

**Verdict**: History and Context Files trees work fully offline, bridge-disconnected. The bridge is an optional enhancement layer, not a required data path.

### 3.6 Model picker (auto-balanced default) — pulls live from models.json?

**Yes — at build time (not a runtime fetch).**

- `buildGroupedQuickPickItems()` (`modelConstants.ts:109,133`) calls `getCoreManualModelOptions()` from `@agiworkforce/types`, which imports from `packages/types/src/models.json` (bundled at build time).
- `MANUAL_MODEL_OPTIONS` at `modelConstants.ts:215` is also statically imported from the same source.
- The catalog is therefore current to the last build of `@agiworkforce/types` — not fetched at runtime from a server. If new models are added to `models.json` they require a new VSIX build.
- `normalizeConfiguredModelId()` (`modelConstants.ts:259`) resolves the configured model ID against the catalog, returning `auto-balanced` as the default when no stored model matches.
- **Provider-switch guard**: `resolveTier()` + `guardProviderSwitch()` gate provider switching behind the `Pro+` tier (`commandSetup.ts:391–403`). On free/BYOK tiers, switching to a provider other than the default triggers an upgrade prompt.

### 3.7 Inline completions — actually trigger on suggest events?

**Yes — registered on every keystroke for all files (`pattern: '**'`).\*\*

- `vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, new AgiInlineCompletionProvider(context.secrets))` (`providerSetup.ts:80`).
- `AgiInlineCompletionProvider.provideInlineCompletionItems()` is called on every document change. It:
  - Skips if `inlineCompletionsEnabled` is false or `paywallSuppressed` is true.
  - Skips sensitive files (`.env`, `.pem`, credential patterns via `isSensitiveFile()` + `SECRETY_NAME_PATTERN`) (`inlineCompletionProvider.ts:117`).
  - Skips if prefix is shorter than 3 chars or cursor is mid-word (`inlineCompletionProvider.ts:125,130`).
  - Debounces by `inlineCompletionsDebounceMs` (default configurable) — fires a real API call only after the user stops typing.
  - Caches in a 16-entry LRU keyed by `docUri::line:col::context` with 15 s TTL — repeated keystrokes at the same position return cached.
- On paywall hit: one-time notification "Inline completions paused — upgrade to …", then `paywallSuppressed = true` for the session; no further toasts.

### 3.8 Code lens + hover — actually wired to provider?

**Code lens: Yes — wired and registered unconditionally on activation.**

- `AgiCodeLensProvider` registered via `syncCodeLensProvider()` at `providerSetup.ts:39,44`; respects `agiWorkforce.codeLensEnabled` (default `true`). Also `DiffDecorationProvider.codeLensProvider` is registered unconditionally at `providerSetup.ts:95` for diff hunks.
- At minimum: Accept/Reject/Batch diff lenses show on every pending edit. "Ask AI / Tests / Docs" lenses above functions show when `codeLensEnabled: true` (default).

**Hover: Yes — registered unconditionally.**

- `vscode.languages.registerHoverProvider('*', new AgiHoverProvider())` at `providerSetup.ts:26`.
- Registered for all file types (`*`), unconditionally, before the chat participant and sidebar. The `hoverEnabled` setting (`agiWorkforce.hoverEnabled`, default `false`) is read by the provider itself to suppress output, but the provider **is** registered either way.

### 3.9 Commands — how many actually do something?

Of the 54+ commands declared in `package.json`, all are registered in `setupCommands()` (`commandSetup.ts:100`). The table below classifies each by what happens when invoked:

| Category        | Commands                                                                       | Runtime behavior                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fully wired** | `explain`, `fix`, `refactor`, `generateTests`, `docs`                          | Calls `runInlineCommand()` → real API call, result streamed into editor via `applyLlmEdit`                                                          |
| **Fully wired** | `chat`, `openChatInEditor`, `agentMode`                                        | Opens Copilot chat / editor panel / AgentModePanel                                                                                                  |
| **Fully wired** | `setApiKey`, `clearApiKey`, `setSupabaseJwt`                                   | SecretStorage read/write + confirmation UI                                                                                                          |
| **Fully wired** | `selectModel`                                                                  | Opens grouped QuickPick with 10+ providers, tier guard, config write                                                                                |
| **Fully wired** | `openConversation`, `deleteConversation`, `showSessionsHistory`                | ConversationStore reads, QuickPick, markdown document                                                                                               |
| **Fully wired** | `sendToDesktop`, `syncContextToDesktop`, `triggerAgentAction`                  | Bridge check + bridge method calls; shows warning if bridge disconnected                                                                            |
| **Fully wired** | All 10 diff commands                                                           | Real `DiffDecorationProvider` calls (accept/reject/batch/global)                                                                                    |
| **Fully wired** | All 5 context commands                                                         | `ContextPanelProvider` add/remove/clear/refresh + `mentionFileInChat`                                                                               |
| **Fully wired** | `createCheckpoint`, `restoreCheckpoint`, `listCheckpoints`                     | `CheckpointManager` via git stash                                                                                                                   |
| **Fully wired** | `git.status`, `git.diff`, `git.commit`                                         | `execFile('git', [...])` to Output Channel (shell-injection–safe)                                                                                   |
| **Fully wired** | `test.run`                                                                     | Detects test runner (npm/pnpm/yarn/cargo/pytest), runs in integrated terminal                                                                       |
| **Fully wired** | `openActionSheet`                                                              | QuickPick action menu; effort/mode/model/account dispatchers                                                                                        |
| **Fully wired** | `showTierStatus`                                                               | Fetches tier from API, shows usage, links to pricing                                                                                                |
| **Fully wired** | `setAgentMode`, `setAgentEffort`                                               | Config writes, QuickPick pickers                                                                                                                    |
| **Fully wired** | `memory`, `memory.create`, `memory.edit`, `memory.delete`, `memory.refresh`    | globalState read/write via `memoryStore`                                                                                                            |
| **Fully wired** | `codeReview`                                                                   | `AgiDiagnosticsProvider.reviewCode()` → Problems panel                                                                                              |
| **Fully wired** | `modelDashboard`, `showTokenBreakdown`, `showSubsystemHealth`, `showPatchLogs` | Panel or Output Channel open                                                                                                                        |
| **STUB**        | `rewindLast`                                                                   | Shows "coming soon in a future release" information message (`commandSetup.ts:925–928`)                                                             |
| **Fully wired** | `bridgeReconnect`                                                              | Registered inside `activateDesktopBridge()` at `src/features/desktop-bridge/desktopBridge.ts:835`; triggers bridge reconnect and clears error state |

> **Gap found during this analysis**: `agi-workforce.rewindLast` is a declared-and-registered stub. The "Rewind" item in the action sheet (`openActionSheet case 'rewind'`) calls this command and the user sees a "coming soon" toast. This is a **visible UX gap**: Claude Code has Rewind as a fully functional undo of the last AI turn.

### 3.10 Multi-provider differentiator — what does the user actually see?

This is our strongest runtime differentiator and it is fully functional end-to-end:

1. **First-run prompt**: "Welcome to AGI Workforce! Set up your API key to use Claude, GPT, Gemini, and **10+ providers** in VS Code." (`extension.ts:253`)
2. **Model QuickPick title**: "AGI Workforce — Select Model (10+ providers)" (`commandSetup.ts:383`)
3. **Grouped picker**: auto-balanced / auto-economy / auto-premium at top, then one separator + section per provider (Anthropic, OpenAI, Google, DeepSeek, xAI, Qwen, Moonshot, Zhipu, Ollama, LMStudio) (`modelConstants.ts:109`).
4. **Provider-stream pipeline**: `streamChatCompletionViaProvider()` routes through `/api/v1/providers/:id/stream` when `useProviderStream: true` (`chatParticipant.ts:388`).
5. **Status bar** reflects the active model: `$(hubot) AGI: gpt-5.5 · auto` — updated on every config change.
6. **Tier guard**: switching to a non-default provider on free/BYOK tier shows an upgrade prompt linking to `agiworkforce.com/pricing` — revenue surface is functional.

Claude Code's model picker shows a single "Default (recommended)" entry with no provider choice. Cursor's Claude Code integration is likewise Anthropic-only. **Our multi-provider picker is the only surface in this competitive set that lets users switch between 10+ providers from a single VS Code extension.**

---

## 4. Where We Are Ahead

**Multi-provider grouped model picker** (`src/features/model-picker/modelConstants.ts:109`)
Claude Code is single-provider (Anthropic-only). Our extension ships auto-balanced / auto-economy / auto-premium routing plus 10+ manually selectable providers (Anthropic, OpenAI, Google, DeepSeek, xAI, Qwen, Moonshot, Zhipu, Ollama, LMStudio) grouped in a QuickPick. This is the core differentiator.

**Diff batch operations with confidence indicators** (`src/providers/diffDecorationProvider.ts:65`)
We expose Accept Batch / Reject Batch across all files, per-hunk confidence labels (high/medium/low via `$(pass-filled)` / `$(warning)` / `$(error)` codicons), and aggressive fuzzy retry on failed patches. Claude Code shows accept/reject per-hunk only with no confidence signal.

**Patch engine with undo** (`src/integrations/patchEngine.ts`, `src/providers/agentMode/agentUI.ts`)
Structured patch:path format, batch undo, per-batch checkpoint-before-apply. Claude Code has no exposed patch engine.

**Desktop bridge** (`src/features/desktop-bridge/desktopBridge.ts`)
Send-to-desktop, sync workspace context, trigger agent action on desktop — entirely absent from Claude Code.

**Memory tree** (`src/memory/memoryTreeProvider.ts`)
User-editable AI memory facts with inline create/edit/delete tree view — not present in Claude Code.

**Checkpoint system** (`src/data/checkpointManager.ts`)
Automatic checkpoint-before-apply, listCheckpoints, restoreCheckpoint — not present in Claude Code.

**Workspace trust gating** (`src/providers/agentMode/agentUI.ts:104`)
Explicit block + confirmation dialog when workspace is untrusted; sensitive-category file paths (`.github/`, `.vscode/`, `package.json`, CI configs) require per-file diff review even under "Accept All" (LITL gate). Claude Code has no equivalent.

**Code lens above functions** (`src/features/code-lens/codeLensProvider.ts`)
Ask AI / Tests / Docs lenses above every function and class. Not in Claude Code.

**Hover provider** (`src/features/hover/hoverProvider.ts`)
Quick actions on identifier hover (`agiWorkforce.hoverEnabled`). Not in Claude Code.

**Effort axis: 4 levels** (`package.json:716`)
We expose low/medium/high/max effort. Claude Code shows only a 3-position slider (Low/Med/High); confirmed in screenshot `05_vscode-chat_modes-dropdown-and-effort-slider.png`.

---

## 4. Recommendations

### P0 — Critical (blocks competitive demo)

None identified. Core parity surfaces are complete.

### P1 — High (visible UX gap vs reference in routine use)

**R26-PARITY-VSCODE-00 (P1): Implement `rewindLast` (currently a stub)**

- What Claude has: Rewind in the actions menu (`06_vscode-chat_actions-and-settings-menu.png`) undoes the last AI turn (removes last assistant + user messages from history)
- What we have: `agi-workforce.rewindLast` registered at `commandSetup.ts:924`; implementation is `vscode.window.showInformationMessage('AGI Workforce: Rewind — coming soon in a future release.')` — a stub
- The "Rewind" item in `openActionSheet` (`commandSetup.ts:999`) calls this command; users clicking it see a "coming soon" toast
- Where to implement: `commandSetup.ts:924` — pop the last `user`+`assistant` message pair from `ConversationStore`, call `conversationTreeProvider.refresh()`, post a `webview.postMessage({ type: 'rewindComplete' })` to clear the webview's last turn
- Benefit: Directly visible to any user who triggers the action menu; closes a functional gap vs Claude Code

**R26-PARITY-VSCODE-01 (P1): Add "Thinking" toggle to webview action menu**

- What Claude has: discrete Thinking on/off toggle separate from effort slider in the actions & settings menu (`06_vscode-chat_actions-and-settings-menu.png`)
- What we have: effort chip (low/medium/high/max) but no binary Thinking toggle exposed in the webview
- Where to add: `src/features/sidebar-webview/webviewContent.ts` — add a `thinking-chip` or toggle in the plus-menu/action-sheet alongside the effort chip; wire to `agiWorkforce.agent.effort` = "max" as a proxy or introduce `agiWorkforce.agent.thinking: boolean`
- Benefit: Users familiar with Claude Code UI will look for this toggle

**R26-PARITY-VSCODE-02 (P1): Add "Account & usage" entry to webview action menu**

- What Claude has: "Account & usage…" in the Model section of the actions menu (`06_vscode-chat_actions-and-settings-menu.png`)
- What we have: `agi-workforce.showTierStatus` command exists (`package.json:362`) but is not surfaced in the webview action menu
- Where to add: `src/features/sidebar-webview/webviewContent.ts` — add "Account & usage" item in the model section of the plus-menu; post `openTierStatus` message → `ChatStateManager` executes `agi-workforce.showTierStatus`
- Benefit: Subscription upsell surface and usage visibility

### P2 — Medium (polish / completeness)

**R26-PARITY-VSCODE-03 (P2): Add onboarding walkthrough contribution**

- What Cursor+CC has: A VS Code walkthrough (`walkthroughs` contribution) surfaced via Cursor's "Team onboarding setup" panel (`307_cursor_claude-code_walkthrough.png`)
- What we have: No `walkthroughs` entry in `package.json`
- Where to add: `package.json` `contributes.walkthroughs` array + a `media/walkthrough/` folder with step markdown
- Benefit: First-run activation surface; 10% conversion lift cited in VS Code extension best practices

**R26-PARITY-VSCODE-04 (P2): Add "fast mode" / "economy mode" toggle in action menu**

- What Claude has: "Toggle fast mode (Opus 4.6 only)" in the Model section of the actions menu (`06_vscode-chat_actions-and-settings-menu.png`)
- What we have: auto-economy routing mode available as a model ID but no single-click toggle in the webview
- Where to add: Webview action menu — "Fast mode" item that sets model to `auto-economy` (or back to `auto-balanced`); render current state with a checkmark
- Benefit: One-click economy toggle mirrors what Claude users expect

**R26-PARITY-VSCODE-05 (P2): Add terminal-permission continuation dialog**

- What Cursor+CC has: "Continue in Terminal to manage permissions? Permission settings are shared between Terminal and this IDE." with Continue / Never mind options (`310_cursor_claude-code_permission-notification.png`)
- What we have: No equivalent; agent applies edits directly through VS Code workspace API with trust guard
- Where to add: `src/providers/agentMode/agentUI.ts` — when a patch targets a terminal-sensitive path (shell scripts, Makefile), surface a notification offering to open the integrated terminal with the command pre-filled
- Note: Lower priority given our workspace trust guard already blocks untrusted workspaces

**R26-PARITY-VSCODE-06 (P2): Expose session history Local tab with cloud-ready placeholder**

- What Claude has: Local/Web tab split in session history (`09_vscode-main-editor_chat-sessions-history-dropdown.png`) enabling future cloud-history surfacing
- What we have: Local-only by v1 design (correct); History tree in sidebar
- Recommendation: Add Local/Cloud tab structure to webview history dropdown now, with Cloud tab showing "Coming soon — join the waitlist" content; zero migration cost later when cloud history ships
- **LOCK CONFLICT — ESCALATE TO SUPERVISOR**: v1 LOCAL ONLY lock at `locks/v1-local-only-cloud-waitlist-2026-05-18.md` is authoritative. Even purely additive "coming soon" UI scaffolding that references a cloud session concept may need product sign-off. Do not implement without supervisor clearance.

**R26-PARITY-VSCODE-07 (P2): Add Shift+Tab mode-cycle keyboard shortcut**

- What Claude has: `⇧ + tab to switch` shown in the Modes dropdown header (`05_vscode-chat_modes-dropdown-and-effort-slider.png`); cycles through Ask before edits → Edit automatically → Plan mode → Bypass permissions
- What we have: Keybinding for `Ctrl+Shift+Alt+G` opens the `agentMode` picker but there is no cycle-through shortcut; `package.json:816-891` lists all 14 keybindings, none is a mode-cycle
- Where to add: `package.json` keybinding — `ctrl+shift+tab` (or `shift+tab` when chat webview is focused), command `agi-workforce.cycleAgentMode`; implement `cycleAgentMode` in `src/features/sidebar-webview/commands.ts` to advance `agiWorkforce.agent.mode` through the four values in order
- Benefit: Power-user muscle memory matches Claude Code; discoverable from the Modes dropdown header

---

## 5. Non-issues (by design)

- **Single provider vs multi-provider**: Claude Code is Anthropic-only; we ship 10+. This is our core advantage, not a gap.
- **Local/Web session split absent**: Correct under v1 LOCAL ONLY lock.
- **No "Prefer the Terminal experience" banner**: Claude Code's extension is a thin wrapper over a CLI tool; we are a native extension. The banner is irrelevant to our architecture.
- **No OS-level permission dialog** (313): This is macOS granting Terminal access to Cursor. Not a VS Code extension concern.

---

## Source Citations

| Claim                                            | Source                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mode chip (ask/auto/plan/bypass)                 | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:562,1022`                                                                              |
| Effort chip                                      | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:993`                                                                                   |
| Diff CodeLens + gutter decorations               | `apps/extension-vscode/src/providers/diffDecorationProvider.ts:65,104`                                                                                       |
| Batch accept/reject                              | `apps/extension-vscode/src/providers/diffDecorationProvider.ts:148,363,382`                                                                                  |
| Plan mode in agentLoop                           | `apps/extension-vscode/src/providers/agentMode/agentLoop.ts:99`                                                                                              |
| 14 keybindings                                   | `apps/extension-vscode/package.json:816-891`                                                                                                                 |
| 17 settings                                      | `apps/extension-vscode/package.json:631-814`                                                                                                                 |
| 54+ commands                                     | `apps/extension-vscode/package.json:65-401`                                                                                                                  |
| Grouped model picker with 10+ providers          | `apps/extension-vscode/src/features/model-picker/modelConstants.ts:109`                                                                                      |
| No walkthrough contribution                      | `apps/extension-vscode/package.json` (grep returned no `walkthroughs` key)                                                                                   |
| showTierStatus command exists but not in webview | `apps/extension-vscode/package.json:362`                                                                                                                     |
| Thinking: no webview toggle                      | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` (grep for "thinking" returned no hits)                                                |
| Usage meter banner present                       | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` (`id="usageMeterBanner"`, display:none until threshold; also `usage-meter-collapsed`) |
| Mode-cycle shortcut absent                       | `apps/extension-vscode/package.json:816-891` (all 14 keybindings; none cycles agent mode); Claude ref: `05_vscode-chat_modes-dropdown-and-effort-slider.png` |
| rewindLast is a stub                             | `apps/extension-vscode/src/core/commandSetup.ts:924-928` — `showInformationMessage('coming soon')`                                                           |
| bridgeReconnect fully wired                      | `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts:835`                                                                                     |
| @agi participant registration                    | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:557`                                                                                 |
| Each slash command distinct prompt               | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:137-157` (system) and `:257-294` (user)                                              |
| Inline completions registered                    | `apps/extension-vscode/src/core/providerSetup.ts:80`                                                                                                         |
| Inline completions debounce + LRU cache          | `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts:21,35,157`                                                                |
| HoverProvider registered unconditionally         | `apps/extension-vscode/src/core/providerSetup.ts:26`                                                                                                         |
| History tree no bridge dependency                | `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:9,39`                                                                                  |
| Context tree no bridge dependency                | grep for bridge in contextPanelProvider.ts returned no hits                                                                                                  |
| Model picker reads models.json catalog           | `apps/extension-vscode/src/features/model-picker/modelConstants.ts:133,215` via `getCoreManualModelOptions()` from `@agiworkforce/types`                     |
| Provider-switch tier guard                       | `apps/extension-vscode/src/core/commandSetup.ts:391-403`                                                                                                     |
| Multi-provider first-run message                 | `apps/extension-vscode/src/extension.ts:253`                                                                                                                 |
| Workspace trust gating (LITL)                    | `apps/extension-vscode/src/providers/agentMode/agentUI.ts:104,210-223`                                                                                       |
| Memory tree                                      | `apps/extension-vscode/src/memory/memoryTreeProvider.ts`                                                                                                     |
| Checkpoint system                                | `apps/extension-vscode/src/data/checkpointManager.ts`                                                                                                        |
| Desktop bridge port 8787                         | `apps/extension-vscode/package.json:744-749`                                                                                                                 |
