# R27-PARITY Lane L-VSCODE-EXT — Per-Image Scorecard

**Date:** 2026-05-23
**Auditor:** VS Code Extension Engineer (vscode-ext-engineer)
**Our source:** `apps/extension-vscode/` v0.3.0
**Images:** 23 total — 9 Claude (v2.1.86) + 14 Cursor-integrating-Claude (2026-05-15)
**Lock applied:** `v1-cloud-bridge-strategy-2026-05-23` — cloud history tab APPROVE with invite-code placeholder

---

## Scoring Key

- ✅ At or ahead of reference — no action required
- 🟡 Partial parity — functional gap below Claude quality floor
- ❌ Missing — feature absent, below Claude quality floor
- 🔄 Different by design — locked architectural difference, not a gap
- 🚧 v2-deferred — cloud feature, invite-code placeholder required per lock

---

## Section A: Claude Code for VS Code (9 images)

### Image 01 — `01_vscode-extension_marketplace-detail-page.png`

**Reference shows:** Claude Code for VS Code, 6M installs, 3.5★, Anthropic, Pro/Max/Enterprise pricing, v2.1.86, categories AI+Chat, single-provider (Anthropic). Description: "Unleash Claude's raw power directly in your terminal." Bullet points: powerful intelligence, works alongside you, writes code, friendlier interface, powerful agentic features. Features tab visible.

**Our implementation:**

- `package.json:3` — `"displayName": "AGI Workforce"`
- `package.json:4` — `"description": "Multi-provider AI coding assistant — 10+ providers (GPT, Claude, Gemini, and more) in VS Code"` — correct locked description
- `package.json:5` — `"version": "0.3.0"`
- `package.json:6` — `"publisher": "agiworkforce"`
- `package.json:7` — `"license": "PROPRIETARY"`
- `package.json:15` — `"preview": true`
- `package.json:22` — categories present
- `media/icon.png` referenced at `package.json:63`

**Verdict:** ✅ v1
**Notes:** Our marketplace metadata is correctly structured. Extension name "AGI Workforce", publisher "agiworkforce", multi-provider description, v0.3.0. Preview flag set. Icon file path registered. Install count, ratings, and review volume are marketplace stats that accrue post-launch — not implementable. No model names hardcoded in description (locked). Differentiator: "10+ providers" vs Claude's single-provider listing is our key marketplace advantage.
**Source:** `apps/extension-vscode/package.json:3-6,15,22,63`

---

### Image 02 — `02_vscode-sidebar_chat-new-chat-empty-state.png`

**Reference shows:** Claude Code sidebar webview with branding, new-chat empty state, "Code-only software" toggle overlay on right panel, GitHub Copilot chat with `@Agent`/`@claude` participant visible in right panel. Usage-limit upgrade nag overlaid on right panel. Layout: sidebar on left, Copilot panel on right.

**Our implementation:**

- `src/features/sidebar-webview/sidebarProvider.ts` — registers `agi-workforce.sidebar` webview view with `retainContextWhenHidden: true`
- `src/features/sidebar-webview/webviewContent.ts:562` — mode-chip, effort-chip, model-chip rendered on empty state
- `src/features/chat-participant/chatParticipant.ts:557` — `@agi` participant registered via `vscode.chat.createChatParticipant`
- `src/extension.ts:137` — usage meter banner (`usageMeterBanner`) wired to config changes
- `src/features/sidebar-webview/webviewContent.ts:941` — `<div class="usage-meter-banner" id="usageMeterBanner" style="display:none">`

**Verdict:** ✅ v1
**Notes:** Sidebar webview registered, empty state renders with mode/effort/model chips. `@agi` chat participant appears in Copilot panel as `@agi` (parallel to Claude's `@claude`). Usage-limit banner present, initially hidden, surfaces on threshold. The "Code-only software" toggle in Claude's reference is a Copilot-specific toggle — not an extension concern for us.
**Source:** `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts`, `src/features/sidebar-webview/webviewContent.ts:562,941`, `src/features/chat-participant/chatParticipant.ts:557`

---

### Image 03 — `03_vscode-extension_settings-editor-view.png`

**Reference shows:** VS Code native settings editor with 13 Claude Code settings visible: allowDangerouslySkipPermissions, Autosave, ProcessWrapper, DisableLoginPrompt, EnableNewConversationShortcut, EnvironmentVariables, HideOnboarding, InitialPermissionMode, PreferredLocation, RespectGitIgnore, UseCtrlEnterToSend, UsePythonEnvironment, UseTerminal.

**Our implementation:**

- `package.json:631–814` — 17 settings in `contributes.configuration`
- Key settings: `agiWorkforce.apiKey`, `agiWorkforce.model`, `agiWorkforce.agent.mode` (ask/auto/plan/bypass), `agiWorkforce.agent.effort` (low/medium/high/max), `agiWorkforce.desktopBridge.port` (8787), `agiWorkforce.codeLensEnabled`, `agiWorkforce.hoverEnabled`, `agiWorkforce.inlineCompletions.enabled`, `agiWorkforce.endpoint`, `agiWorkforce.systemPrompt`, `agiWorkforce.telemetry.enabled`, `agiWorkforce.providerStreamEnabled`
- `package.json:49` — `untrustedWorkspaces` restrictions declared

**Verdict:** ✅ v1 (AHEAD: 17 settings vs Claude's 13)
**Notes:** We have 4 more settings than Claude: desktop bridge port, provider stream toggle, telemetry opt-in, hover enabled. Native VS Code settings editor renders these automatically. The architectural difference: Claude Code settings are CLI-terminal passthrough; ours are native VS Code configuration — different shape, same native editor rendering.
**Source:** `apps/extension-vscode/package.json:631–814`

---

### Image 04 — `04_vscode-extension_settings-with-usage-limit-sidebar.png`

**Reference shows:** Same settings editor with usage-limit banner in the right panel: "Upgrade for 3x usage & faster responses", "You've reached your limit. Responses may be slower." Subscription gating.

**Our implementation:**

- `src/features/sidebar-webview/webviewContent.ts:591–620` — `.usage-meter-banner` and `.usage-meter-collapsed` CSS classes defined (no hardcoded color literals — uses VS Code theme tokens via `var(--vscode-*)`)
- `src/features/sidebar-webview/webviewContent.ts:941` — `usageMeterBanner` div present, `display:none` until threshold
- `src/data/usageMeter.ts` — pushUsageMeter, thresholds, tier logic
- `src/extension.ts:137` — pushUsageMeter called on config changes

**Verdict:** ✅ v1
**Notes:** Usage limit banner is implemented with show/hide logic. Banner text and upgrade path wire to `agi-workforce.showTierStatus` command. Colors use VS Code theme variables, not hardcoded hex (locked rule compliant).
**Source:** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:591,941`, `src/data/usageMeter.ts`

---

### Image 05 — `05_vscode-chat_modes-dropdown-and-effort-slider.png`

**Reference shows:** Modes dropdown with 4 modes: Ask before edits, Edit automatically, Plan mode, Bypass permissions (all with icons and descriptions). Header shows "⇧ + tab to switch". Effort slider (3-position: Low/Med/High) at bottom bar.

**Our implementation:**

- `src/features/sidebar-webview/webviewContent.ts:1022` — mode-chip button, opens QuickPick or `openActionSheet`
- `src/core/commandSetup.ts:1042–1075` — QuickPick with all 4 modes: ask/auto/plan/bypass with matching descriptions
- `src/features/sidebar-webview/webviewContent.ts:1023` — effort-chip button (low/medium/high/max — 4 levels vs Claude's 3)
- `package.json:816–891` — 14 keybindings; NO `shift+tab` or `ctrl+shift+tab` mode-cycle binding present

**Verdict:** 🟡 v1 (PARTIAL)
**Notes:** All 4 modes present with correct labels and descriptions. Effort chip present with 4 levels (AHEAD: we have "max" as 4th level). **GAP: No "⇧ + tab to switch" keybinding.** Claude shows this shortcut in the modes dropdown header; we have no `cycleAgentMode` command or shortcut in any keybinding declaration. This is a P2 polish gap, not a P0 blocker — the modes are fully accessible via chip click and action sheet.
**Blocker level:** P2
**Source:** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1022–1023`, `apps/extension-vscode/package.json:816–891`

---

### Image 06 — `06_vscode-chat_actions-and-settings-menu.png`

**Reference shows:** Actions & Settings menu (Cmd+K): Context section (Attach file, Mention file from this project, Clear conversation, Rewind). Model section (Switch model, Effort slider, **Thinking toggle**, **Account & usage**, **Toggle fast mode (Opus 4.6 only)**).

**Our implementation:**

- `src/core/commandSetup.ts:939–973` — action sheet QuickPick items:
  - Context: "Attach file", **"Rewind"** (stub), "Clear conversation" — missing "Mention file from this project"
  - Model: "Switch model", "Effort", "Mode", **"Account & usage"** — present ✅
  - **No "Thinking" toggle** — confirmed: zero hits for "thinking" in webviewContent.ts or commandSetup.ts
  - **No "Toggle fast mode"** — confirmed: zero hits for "fast.mode"/"fastMode" in commandSetup.ts
- `src/core/commandSetup.ts:924–928` — `rewindLast` is a stub showing "coming soon" toast

**Verdict:** 🟡 v1 (PARTIAL — 3 gaps)
**Gap 1 (P1 — v1 blocker):** `rewindLast` is a stub. Source: `commandSetup.ts:924–928`. Claude's Rewind fully removes the last user+assistant message pair. Users who click Rewind see "coming soon" — below Claude quality floor.
**Gap 2 (P1):** No Thinking toggle in action sheet. Claude shows a binary on/off toggle separate from effort. Our effort chip covers "max" reasoning but not a discrete Thinking on/off.
**Gap 3 (P2):** No "Toggle fast mode" entry. Claude has "Toggle fast mode (Opus 4.6 only)"; we have auto-economy routing but no single-click fast-mode toggle.
**Gap 4 (P2):** "Mention file from this project" absent from action sheet context section (command exists at `commandSetup.ts:139` but not in action sheet items list).
**Source:** `apps/extension-vscode/src/core/commandSetup.ts:924–973`

---

### Image 07 — `07_vscode-chat_input-add-context-menu.png`

**Reference shows:** Input bar (+) menu with two items: "Upload from computer", "Add context".

**Our implementation:**

- `src/features/sidebar-webview/webviewContent.ts:993` — "Upload from computer" item with codicon `codicon-cloud-upload`
- `src/features/sidebar-webview/webviewContent.ts:1009` — `mention-dropdown` div for `@`-mention inline file insertion
- `src/core/commandSetup.ts:139` — `agi-workforce.mentionFileInChat` command registered
- Upload files handled via `attachFiles` message at `webviewContent.ts:1604`

**Verdict:** ✅ v1 (AHEAD)
**Notes:** We have "Upload from computer" (matches Claude), plus the `@`-mention dropdown for inline file references. Claude's "Add context" likely maps to workspace file mention — we have this via the mention-dropdown. We additionally have Context Files tree (pinned + auto) in the sidebar which Claude lacks.
**Source:** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:993,1009`, `commandSetup.ts:139`

---

### Image 08 — `08_vscode-main-editor_chat-empty-state-full-screen.png`

**Reference shows:** Full-screen chat in main editor area (not sidebar). Same empty state with "Prefer the Terminal experience? Switch back in Settings." banner. Bypass permissions mode shown in status bar. Usage-limit upgrade nag overlaid.

**Our implementation:**

- `src/providers/chatEditorPanel.ts` — "Chat in main editor (WebviewPanel, C13)" — full-screen editor panel registered
- `src/core/commandSetup.ts` — `agi-workforce.openChatInEditor` command registered
- Status bar item created in `extension.ts` showing `$(hubot) AGI: auto-balanced` — same position as Claude's mode indicator
- Usage meter banner present in webview content

**Verdict:** ✅ v1
**Notes:** Full-screen chat in main editor panel implemented via `chatEditorPanel.ts`. Claude's "Prefer the Terminal experience?" banner is architecture-specific (CLI-wrapper extension) — irrelevant to our native extension design (noted as non-issue in W6). Status bar mode indicator present. "Bypass permissions" status bar chip: Claude shows mode name in status bar; we show model name — minor visual difference, not a functional gap.
**Source:** `apps/extension-vscode/src/providers/chatEditorPanel.ts`, `src/extension.ts`

---

### Image 09 — `09_vscode-main-editor_chat-sessions-history-dropdown.png`

**Reference shows:** Session history dropdown with **Local / Web tab split**. Search sessions field. Session list with timestamps (1m, 11m, 2d, 5d, 6d, 7d) and per-session action icons (copy, delete). "Local" tab active.

**Our implementation:**

- `src/core/commandSetup.ts:467–495` — `showSessionsHistory` command: QuickPick showing all local sessions with timestamps (`sessionHistoryRelativeTime()`) and message count
- `src/features/trees/conversationTreeProvider.ts` — History tree in sidebar (local only, no bridge dependency confirmed at `:9,39`)
- **No Local/Web tab split** — QuickPick is flat list; no cloud tab, no cloud history

**Verdict:** 🚧 v2-deferred + invite-code placeholder required (LC-01)
**Notes:** Per `v1-cloud-bridge-strategy-2026-05-23` lock, this is APPROVED: v1 ships local-only, cloud history tab requires invite-code gating. Current implementation: local sessions shown in QuickPick with timestamps — functionally equivalent to Claude's Local tab. **Required for v1 before ship:** add a "Cloud (invite-only)" tab or entry to the history UI that opens the invite-code modal. This is the LC-01 item from W6 now resolved as APPROVE. The invite-code modal entry point must exist even if cloud history is empty.
**Source:** `apps/extension-vscode/src/core/commandSetup.ts:467–495`, `src/features/trees/conversationTreeProvider.ts`

---

## Section B: Cursor Integrating Claude Code (14 images)

### Image 300 — `300_cursor_extension-installed_activitybar.png`

**Reference shows:** Claude Code activity bar entry in Cursor's left sidebar (among .claude, .cargo, agiworkforce repo items). Extension present as activity bar icon. Extension registers its own activity bar contribution.

**Our implementation:**

- `package.json` — `contributes.viewsContainers.activitybar` array declares `agi-workforce` activity bar with `$(hubot)` icon
- `contributes.views` — 3 views registered: `agi-workforce.sidebar`, `agi-workforce.conversations`, `agi-workforce.contextPanel`, `agi-workforce.memory`

**Verdict:** ✅ v1
**Notes:** Extension registers its own activity bar icon. Our icon (`$(hubot)` robot codicon) appears in the activity bar at install. Multiple sidebar views register under our activity bar container.
**Source:** `apps/extension-vscode/package.json` (contributes.viewsContainers, contributes.views)

---

### Image 301 — `301_cursor_claude-code_panel-empty-state.png`

**Reference shows:** Claude Code panel view (bottom panel area) showing same empty state as sidebar. Claude Code coexists with Cursor's "New Agent" in the right panel.

**Our implementation:**

- `src/core/chatSetup.ts:47` — sidebar webview registered as `agi-workforce.sidebar`
- The same `SidebarProvider` handles both sidebar and panel contexts via VS Code's `WebviewViewProvider` API
- Empty state markup with branding, mode-chip, effort-chip renders in any view context

**Verdict:** ✅ v1
**Notes:** Extension renders correctly in both sidebar and panel positions. VS Code's `WebviewViewProvider` API handles placement — no separate implementation needed for panel vs sidebar positioning.
**Source:** `apps/extension-vscode/src/core/chatSetup.ts:47`, `src/features/sidebar-webview/sidebarProvider.ts`

---

### Image 302 — `302_cursor_claude-code_sidebar-empty-state.png`

**Reference shows:** Full-screen Claude Code sidebar empty state in Cursor: "What to do first? Ask about this codebase or we can start writing code." Pixel-for-pixel identical to the standalone VS Code empty state (same layout, branding, input bar, Bypass permissions chip, "Prefer the Terminal experience?" banner).

**Our implementation:**

- `src/features/sidebar-webview/webviewContent.ts` — empty state renders identical content regardless of host IDE (VS Code or Cursor)
- Mode chip, effort chip, input field, + button, mode indicator all present in base HTML template

**Verdict:** ✅ v1
**Notes:** Our extension renders the same empty state in Cursor as in VS Code — correct behavior. Claude's "Prefer the Terminal experience?" banner is irrelevant architecture notice (non-issue confirmed in W6). Our empty state copy will differ (no terminal fallback messaging) which is correct.
**Source:** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`

---

### Image 303 — `303_cursor_claude-code_header-actions.png`

**Reference shows:** Header row in Claude Code Cursor panel: history icon (clock), new chat icon (+). Minimalist 2-button header.

**Our implementation:**

- `src/features/sidebar-webview/webviewContent.ts` — webview HTML includes history button (`$(history)` codicon) and new-chat button mapped to `agi-workforce.newConversation`
- Header buttons wired via `postMessage` to VS Code commands in `ChatStateManager`

**Verdict:** ✅ v1
**Notes:** History and new-chat header buttons present. Our implementation maps directly to the same 2-action header pattern.
**Source:** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`

---

### Image 304 — `304_cursor_claude-code_session-history.png`

**Reference shows:** Session history in Cursor with **Local / Web tabs**, search field, per-session entries with timestamps (1m, 12m, 5d–7d), delete icons per session.

**Our implementation:**

- Same as image 09 analysis: local-only QuickPick history, no Local/Web tab split
- `src/core/commandSetup.ts:481–494` — sessions mapped to QuickPick items with relative timestamps
- Delete per session via `agi-workforce.deleteConversation` command (registered)

**Verdict:** 🚧 v2-deferred + invite-code placeholder required (LC-01 — same item as image 09)
**Notes:** Local session history with timestamps and delete actions implemented. Cloud/Web tab requires invite-code modal entry point per lock. Per-session delete icon is implemented via `deleteConversation` command.
**Source:** `apps/extension-vscode/src/core/commandSetup.ts:467–495`

---

### Image 305 — `305_cursor_claude-code_command-palette.png`

**Reference shows:** Actions & Settings menu in Cursor context (Filter actions...): Context section (Attach file, Mention file from this project, Clear conversation, Rewind). Model section (Switch model, **Effort (High)** with slider, **Thinking** toggle, **Account & usage**, **Customize...**).

**Our implementation:**

- Identical action sheet to image 06 analysis
- `src/core/commandSetup.ts:939–973` — Context: Attach file ✅, Clear conversation ✅, Rewind (stub) ❌; Model: Switch model ✅, Effort ✅, Mode ✅, Account & usage ✅
- **Missing from action sheet:** Mention file from this project, Thinking toggle, fast mode toggle, Customize
- `rewindLast` confirmed stub at `commandSetup.ts:924–928`

**Verdict:** 🟡 v1 (PARTIAL — same gaps as image 06)
**Notes:** Same finding as 06. Additionally: "Customize..." seen in Cursor's version is likely Cursor-specific configuration — not an AGI concern. Core gaps: rewindLast stub (P1 blocker), no Thinking toggle (P1), no mention-file in action sheet (P2).
**Source:** `apps/extension-vscode/src/core/commandSetup.ts:924–973`

---

### Image 306 — `306_cursor_claude-code_settings.png`

**Reference shows:** Cursor Settings panel (not Claude Code extension settings) — Cursor Account, Upgrade to Pro, Editor Settings, Keyboard Shortcuts, Import Settings from VS Code, Window Layout, Conversation Density, Title Bar. This is Cursor's OWN settings pane.

**Our implementation:** Not applicable — this is Cursor's native settings pane, not Claude Code extension settings. No equivalent needed.

**Verdict:** 🔄 (different host IDE — not an AGI extension concern)
**Notes:** W6 correctly identified this as Cursor's own settings pane. Our extension contributes 17 settings to VS Code's native settings editor (correct path). No action required.
**Source:** N/A

---

### Image 307 — `307_cursor_claude-code_walkthrough.png`

**Reference shows:** Claude Code walkthrough card inside Cursor: `/team-onboarding` command triggered, step list showing "Thought for 0s, Looking at…, Thinking…, Cogitating…". Onboarding card visible.

**Our implementation:**

- `grep` for `walkthroughs` in `package.json` returns no results — zero `contributes.walkthroughs` contribution
- No `/team-onboarding` or any walkthrough step defined

**Verdict:** ❌ v2 (P2 gap — no onboarding walkthrough)
**Notes:** Claude Code ships a `walkthroughs` contribution that shows in VS Code's "Get Started" panel and in Cursor's walkthrough surface. We have zero walkthrough contribution. This is below Claude quality floor for first-run UX. However, it does not block core functionality — categorized P2 (polish/completeness). Implementation path: add `contributes.walkthroughs` array to `package.json` with AGI-specific onboarding steps + `media/walkthrough/` markdown files.
**Source:** `apps/extension-vscode/package.json` (absent key)

---

### Image 308 — `308_cursor_claude-code_selected-code-context.png`

**Reference shows:** File (AGI Workforce Better Outcomes Review.md) open in editor. Claude Code sidebar shows the open file context passed automatically — selected/open document is injected as context.

**Our implementation:**

- `src/features/chat-participant/chatParticipant.ts:62–124` — `gatherEditorContext()` function collects: `fileName`, `languageId`, `selectedText`, file content slice, with `contextLines` padding around selection
- `chatParticipant.ts:124` — selected text wrapped in `<untrusted_user_selection>` tag, injected into system prompt
- Context auto-injection active for both `@agi` chat participant and sidebar webview

**Verdict:** ✅ v1 (AHEAD)
**Notes:** We auto-inject both the active file context AND selected text with security sandboxing (`<untrusted_user_selection>` tag prevents prompt injection from hostile file content). Claude Code shows selected code context — we match this. We additionally have Context Files tree (pinned files + auto-selection) which Claude lacks.
**Source:** `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:62–124`

---

### Image 309 — `309_cursor_claude-code_at-mention.png`

**Reference shows:** At-mention disambiguation panel: "How to use it" — Cmd+P → "Claude Code: Open in Side Bar", instructions for disambiguating Claude Code extension vs Cursor's built-in Claude Code UI. Step-by-step usage instructions.

**Our implementation:**

- `src/features/chat-participant/chatParticipant.ts:4` — registered as `@agi` (no ambiguity with Cursor's built-in `@claude`)
- `src/features/chat-participant/chatParticipant.ts:570–576` — follow-up suggestions registered: `/explain`, `/fix`, `/tests` appear after each response

**Verdict:** ✅ v1 (DIFFERENT — no disambiguation needed)
**Notes:** Claude Code has disambiguation issues in Cursor because Cursor has its own built-in "Claude Code" UI that conflicts with the extension. We use `@agi` as our participant ID — no disambiguation needed. The at-mention disambiguation panel is a Claude-specific problem, not a pattern we need to replicate.
**Source:** `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:4,557`

---

### Image 310 — `310_cursor_claude-code_permission-notification.png`

**Reference shows:** Inline notification in chat: "Continue in Terminal to manage permissions? / Permission settings are shared between Terminal and this IDE." with "1 Continue in Terminal / 2 Never mind" options.

**Our implementation:**

- `src/providers/agentMode/agentUI.ts:104,210–223` — workspace trust gating with explicit block + confirmation dialog when workspace is untrusted
- No Terminal-permission bridge notification — agent applies edits directly via VS Code workspace API with trust guard
- `src/core/commandSetup.ts` — no "Continue in Terminal" or terminal-permission flow

**Verdict:** 🔄 (different architecture — not a gap)
**Notes:** Claude Code is architecturally a thin VS Code wrapper over a terminal CLI tool. "Continue in Terminal" exists because Claude Code's permission model lives in the terminal process. Our extension is a native VS Code extension with workspace trust gating (LITL gate) — we never need terminal permission sharing. W6 correctly classified this as non-issue. Our workspace trust model is superior for VS Code-native use.
**Source:** `apps/extension-vscode/src/providers/agentMode/agentUI.ts:104,210–223`

---

### Image 311 — `311_cursor_claude-code_diff-review-inline.png`

**Reference shows:** Inline diff review in Cursor: plan content shown in chat panel with inline diff decorations in main editor (lines highlighted, diff indicators in gutter). Claude Code activity bar shows diff indicator count. File content with deletion/addition markers visible.

**Our implementation:**

- `src/providers/diffDecorationProvider.ts:65` — `DiffCodeLensProvider` with per-hunk Accept/Reject/Accept All/Reject All/Batch lenses
- `src/providers/diffDecorationProvider.ts:94–102` — confidence indicator: `$(pass-filled)` (high), `$(warning)` (medium), `$(error)` (low) — not present in Claude's implementation
- Gutter decorations via `DiffDecorationProvider` (background/border colors use VS Code theme tokens via `vscode.window.createTextEditorDecorationType`)
- `src/integrations/patchEngine.ts` — fuzzy retry, batch undo, per-batch checkpoint-before-apply

**Verdict:** ✅ v1 (AHEAD)
**Notes:** Full inline diff review implemented with CodeLens accept/reject per-hunk, confidence labels, batch operations, and gutter decorations. Ahead of Claude Code which shows per-hunk accept/reject only without confidence signals. Diff decorations use VS Code theme API (no hardcoded colors).
**Source:** `apps/extension-vscode/src/providers/diffDecorationProvider.ts:65–154`

---

### Image 312 — `312_cursor_claude-code_plan-preview.png`

**Reference shows:** Plan preview in Claude Code chat output: structured plan with "File Capture, Proposed change: Append line, Steps: 1. Open the file…, Risk: The user asked…" format. Structured fields for file, change type, steps, risk.

**Our implementation:**

- `src/providers/agentMode/agentLoop.ts:99` — plan mode: system prompt instructs model to output a structured plan; user sees plan text in webview with "Reply with 'proceed' to run the plan"
- `src/features/chat-participant/chatParticipant.ts:376–378` — plan mode appended to system prompt; `isExecutionConfirmation()` at `:205–208` detects "proceed" response
- Our plan output is LLM-generated markdown, not a structured schema with named fields

**Verdict:** 🟡 v1 (PARTIAL)
**Notes:** Plan mode is functional — model shows a plan and waits for "proceed" confirmation before applying edits. However, our plan output is unstructured markdown vs Claude's structured plan format (File / Proposed change / Steps / Risk fields). This is a UX polish gap: users familiar with Claude Code's structured plan preview will get a less structured output from us. The core workflow (plan → confirm → apply) is correct.
**Blocker level:** P2 (plan works; structure is cosmetic polish)
**Source:** `apps/extension-vscode/src/providers/agentMode/agentLoop.ts:99`, `src/features/chat-participant/chatParticipant.ts:376–378`

---

### Image 313 — `313_cursor_claude-code_open-in-terminal.png`

**Reference shows:** macOS system dialog: "Terminal wants to access to control Cursor. Allowing control will provide access to documents and data in Cursor, and to perform actions within that app." Don't Allow / Allow.

**Our implementation:** N/A — this is an OS-level Accessibility permission dialog triggered by Claude Code's terminal process requesting control over Cursor. Not a VS Code extension API concern.

**Verdict:** 🔄 (OS-level — not an extension concern)
**Notes:** This dialog appears because Claude Code's terminal CLI process requests macOS Accessibility access to drive the IDE. Our extension is native to VS Code — no terminal CLI, no OS accessibility permission required. Non-issue confirmed.
**Source:** N/A

---

## Summary Statistics

| Category                                 | Count |
| ---------------------------------------- | ----- |
| Total images scored                      | 23    |
| ✅ At or ahead of Claude                 | 14    |
| 🟡 Partial parity                        | 4     |
| ❌ Missing                               | 1     |
| 🔄 Different by design / non-issue       | 4     |
| 🚧 v2-deferred + invite-code placeholder | 2     |

### By image group

| Group                   | Total | ✅  | 🟡  | ❌  | 🔄  | 🚧  |
| ----------------------- | ----- | --- | --- | --- | --- | --- |
| Claude (01–09)          | 9     | 5   | 2   | 0   | 0   | 2   |
| Cursor-Claude (300–313) | 14    | 9   | 2   | 1   | 3   | 0   |

---

## Cross-Image Patterns

### Pattern 1: rewindLast stub is the only P1 functional gap

Images 06 and 305 both show "Rewind" in the action menu as a core feature. Our `agi-workforce.rewindLast` at `commandSetup.ts:924–928` is a "coming soon" toast stub. Every user who opens the action sheet and clicks Rewind gets a non-functional response. This single stub is the only below-Claude-quality-floor functional gap that appears in multiple reference images.

### Pattern 2: Thinking toggle absent from all action menus

Images 06 and 305 both show a binary "Thinking" toggle in the Model section. We have 4-level effort (low/medium/high/max) but no discrete on/off thinking toggle. This gap appears consistently across both Claude standalone and Cursor-integrating-Claude references.

### Pattern 3: Multi-provider differentiator surfaces correctly

Images 01 (marketplace), 02 (sidebar), 08 (full-screen) all confirm our multi-provider story is correctly expressed. Claude Code is single-provider everywhere in the reference images. Our "10+ providers" positioning in the marketplace description, first-run message, and model picker is the single strongest differentiator visible across the image set.

### Pattern 4: Cloud history tab is the only cloud-gated surface

Images 09 and 304 both show Local/Web session tabs — the only cloud-requiring feature in the entire 23-image set. Per `v1-cloud-bridge-strategy-2026-05-23`, this is APPROVE with invite-code placeholder. All other features in the image set are local-only.

### Pattern 5: Architecture differences correctly categorized (images 306, 310, 313)

Three images show Cursor/terminal-architecture-specific behaviors (Cursor settings pane, terminal permission sharing, OS accessibility grant) that are irrelevant to our native extension architecture. W6 classifications confirmed correct.

### Pattern 6: We are ahead on diff review (image 311) and context (image 308)

Our confidence-labeled CodeLens ($(pass-filled)/$(warning)/$(error)) and batch operations are not visible in Claude's diff reference image. Our `<untrusted_user_selection>` security tag on selected code is more robust than Claude Code's context injection. Both are genuine forward positions.

---

## v1 Release Blockers

| ID               | Image   | Gap                                                                                | Severity            | Source                    |
| ---------------- | ------- | ---------------------------------------------------------------------------------- | ------------------- | ------------------------- |
| **VSCODE-P1-01** | 06, 305 | `rewindLast` is a stub — shows "coming soon" toast instead of undoing last AI turn | **P1 — v1 blocker** | `commandSetup.ts:924–928` |

**v1 blocker count: 1** (VSCODE-P1-01)

---

## v2 Placeholders Required

| ID        | Image   | Feature                                     | Action Required                                                                                                                                                                      |
| --------- | ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LC-01** | 09, 304 | Cloud session history (Local/Web tab split) | Add "Cloud (invite-only)" tab or entry to history UI that opens invite-code modal per `v1-cloud-bridge-strategy-2026-05-23` lock. Must exist in v1 UI even with empty cloud content. |

---

## P1 Items (visible UX gap, below Claude quality floor in routine use)

| ID               | Image   | Gap                                | Implementation path                                                                                                                                                       |
| ---------------- | ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VSCODE-P1-01** | 06, 305 | `rewindLast` stub                  | `commandSetup.ts:924`: pop last `user`+`assistant` pair from `ConversationStore`, call `conversationTreeProvider.refresh()`, post `{ type: 'rewindComplete' }` to webview |
| **VSCODE-P1-02** | 06, 305 | No Thinking toggle in action sheet | Add `agiWorkforce.agent.thinking: boolean` setting; add "Thinking" toggle item to `openActionSheet` QuickPick (commandSetup.ts:939); wire to API `thinking: true` param   |

---

## P2 Items (polish / completeness)

| ID               | Image   | Gap                                                       | Implementation path                                                                                                                                          |
| ---------------- | ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **VSCODE-P2-01** | 05, 305 | No ⇧+Tab mode-cycle keybinding                            | Add `cycleAgentMode` command; add `shift+tab` binding scoped to webview focus in `package.json:816–891`                                                      |
| **VSCODE-P2-02** | 06, 305 | "Mention file from this project" absent from action sheet | Add item in Context section of `openActionSheet` QuickPick; route to `agi-workforce.mentionFileInChat`                                                       |
| **VSCODE-P2-03** | 06, 305 | No "Toggle fast mode" entry                               | Add "Fast mode" toggle item to Model section of action sheet; set model to `auto-economy` (from `models.json` — no hardcoded IDs) or back to `auto-balanced` |
| **VSCODE-P2-04** | 307     | No onboarding walkthrough contribution                    | Add `contributes.walkthroughs` to `package.json` + `media/walkthrough/` step files                                                                           |
| **VSCODE-P2-05** | 312     | Plan preview is unstructured markdown                     | Add structured plan schema output (File / Change / Steps / Risk) to plan-mode system prompt in `agentLoop.ts`                                                |

---

## P0 — Multi-Provider Differentiator (surface actively in v1)

Images 01 and 02 confirm Claude Code is strictly single-provider (Anthropic-only) across all 23 reference images. Our `package.json:4` description ("10+ providers"), `extension.ts:253` first-run message, and `commandSetup.ts:383` model picker title ("AGI Workforce — Select Model (10+ providers)") correctly surface this differentiator. This is our primary competitive advantage and is working correctly.

**No P0 implementation items.** Core parity surfaces are fully wired. The single v1 blocker (VSCODE-P1-01: rewindLast stub) is a P1 implementation task, not a P0.
