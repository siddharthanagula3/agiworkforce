# VS Code Extension current state

**Frontend tree root**: `apps/extension-vscode/src/`
**Approximate component count / file count**: 39 non-test source files, 20 test files (59 total). No shared React components — all UI is a single self-contained HTML/CSS/JS webview in `src/providers/sidebar/webviewContent.ts`.

---

## Per-category inventory

#### 1. APP SHELL

HAS:

- Sidebar webview panel (`SidebarProvider`, view id `agi-workforce.sidebar`) registered in activity bar
- Header bar inside webview: AGI Workforce title, provider badge (colored pill with brand dot showing active provider), actions button (opens QuickPick action sheet)
- Three sidebar tree views: sidebar webview (chat), History tree (`conversationTreeProvider`), Context Files tree (`contextPanelProvider`)
- Full-screen chat in main editor via `ChatEditorPanel.createOrShow` — singleton, reuses same HTML/protocol as sidebar
- Usage meter banner (collapsible) at top of sidebar; collapsed pill restores it
- No multi-window support; no popout/mini mode

#### 2. ONBOARDING / AUTH

HAS:

- API key banner shown when no key is stored (`api-key-banner` div, inline in sidebar HTML)
- Password-type input + Save button to store key in VS Code SecretStorage
- `agi-workforce.setApiKey` command (QuickInput) as secondary entry point
- `agi-workforce.clearApiKey` command
- On `ready` message, extension sends `apiKeyStatus` to webview to show/hide banner

MISSING:

- OAuth / SSO / device-flow sign-in — only API key auth supported
- Post-signin permissions overview
- Mode/profile selection at onboarding

#### 3. EMPTY STATE

HAS:

- `empty-state` div with headline "Ask about your code"
- Three prompt chips: `</> Explain`, `>_ Fix`, `✓ Tests` — clicking fills textarea and focuses it
- Empty state hides on first message sent; re-rendered on conversation clear

MISSING:

- Productivity-first hero (current framing is coding-first only)
- Model badge placement in empty state
- Illustration / icon beyond text chips

#### 4. COMPOSER

HAS:

- Auto-resizing `textarea` (max 140px, scrolls beyond), Shift+Enter for newline, Enter to send
- `+` (plus) button opens popover menu with: "Add file or image" and "Plan mode" items
- Model pill (shows current model label, opens model QuickPick on click)
- Mode chip (ask/auto/plan/bypass, opens mode picker)
- Effort chip (low/medium/high/max, hidden for models that don't support effort, opens effort picker)
- Send/Stop button: circular, terracotta when idle (up-arrow icon), overlay square when streaming (stop icon)
- `@` mention autocomplete: typing `@<query>` fires `fileSearch` — extension searches workspace files — dropdown shows up to 15 results, keyboard-navigable (arrow keys, Enter/Tab to insert, Escape to dismiss)
- `@file` reference injection: file content read, truncated at 5KB each / 20KB total, injected as user-role message in `<file_content>` tags (VSCODE-06 security hardening)
- Plan mode toggle via plus-menu; mode chip reflects state
- Streaming cancel: stop button sends `cancel` message; cancellation token fired

MISSING:

- Photo/screenshot attachment (plus-menu "Add file or image" fires `openFilePicker` but no extension-side handler returns file content to webview — not end-to-end wired)
- Voice (push-to-talk / microphone) — not present anywhere in extension source
- Cloud-drive / notebook attachment options
- Slash command palette in sidebar (typed `/` does not open a picker; slash commands exist only for the @agi chat participant)
- Citations toggle

#### 5. CHAT / MESSAGES

HAS:

- User message bubbles (right-aligned, overlay background, border)
- Assistant message bubbles (left-aligned, teal left-border accent)
- Error message bubbles (red tint)
- System/info messages (centered, muted)
- Typing indicator (3-dot animated bounce, teal dots)
- Inline Markdown rendering: fenced code blocks with language label + copy button, inline code, bold, italic, strikethrough, headers (h2-h4), horizontal rules, unordered lists, blockquotes
- Copy-code button per code block (clipboard API, label changes to "Copied!" then restores)
- Inline tool-call rendering: expandable cards with pending/done states, spinning icon when pending, chevron expand/collapse, JSON body display with pretty-print on completion, per-tool codicon icons (bash, read, write, edit, search, web_fetch, list_dir, mcp, etc.)
- Tool call stack container with "Done" row when finalized
- Smooth scroll-to-bottom on new tokens
- Conversation persistence: completed conversations saved to `ConversationStore`, visible in History tree
- Conversation clear: wipes messages, resets state, re-shows empty state

MISSING:

- Thinking/reasoning blocks (collapsed/expanded with duration indicator) — no UI for extended thinking
- Inline web search results with favicons/citations
- Copy / rate / regenerate / branch actions on individual messages
- Scroll-to-bottom FAB (scroll is automatic but no manual floating button)
- A/B comparison layout

#### 6. ARTIFACTS / SIDEBAR

MISSING: No artifact sidebar or panel. No artifact types (HTML preview, spreadsheet, PDF, image viewer, etc.). Code responses render inline in chat as fenced Markdown blocks only.

#### 7. PROJECTS / SPACES

MISSING: No project/space concept. Extension operates on the active VS Code workspace folder only. No gallery, no project-level system prompt UI, no knowledge management.

#### 8. CONNECTORS / TOOLS / SKILLS

PARTIAL:

- MCP enabled/disabled toggle (`agiWorkforce.mcp.enabled` setting). When enabled, system prompt includes MCP context note; backend MCP call routing exists in `providerStreamClient.ts`
- Desktop bridge integration (`agiWorkforce.desktopBridge.enabled`, port 8787): when enabled, system prompt notes desktop context preference; relay to localhost:8787 via `desktopBridge.ts`
- `shareDiagnostics` action: sends active file VS Code diagnostics as structured context to the model

MISSING:

- Connector/skills directory or gallery UI
- Per-permission toggles for individual tools
- OAuth grant modal
- Skills library categorized by domain
- Inline slash-command routing to installed skills
- Plugin/connector toggles in sidebar submenu

#### 9. SETTINGS

HAS:

- 23 settings under `agiWorkforce.*` namespace exposed in VS Code Settings UI:
  - `model` (string, default `auto-balanced`)
  - `agent.mode` (enum: ask/auto/plan/bypass)
  - `agent.effort` (enum: low/medium/high/max)
  - `agent.planMode` (bool, deprecated alias)
  - `agent.maxIterations` (number, default 25)
  - `codeLensEnabled`, `hoverEnabled`, `inlineCompletions.enabled`, `inlineCompletions.debounceMs`, `inlineCompletions.maxLength`
  - `streamingEnabled`, `contextLines`, `fallbackToVscodeLm`
  - `mcp.enabled`, `desktopBridge.enabled`, `desktopBridge.port`
  - `telemetryEnabled`, `telemetryEndpoint`
  - `useProviderStream`, `providerStreamProvider` (feature flags)
  - `tier`, `currentTier`
- `openSettings` webview message opens VS Code settings filtered to `agiWorkforce`

MISSING:

- Dedicated settings editor view within the extension (uses native VS Code settings UI only)
- Appearance / privacy / billing / notifications / MCP-server list sections in a custom UI

#### 10. PROFILE / USER POPOVER

PARTIAL:

- Provider badge (colored pill in sidebar header) shows active provider + brand color
- Usage meter banner shows tier source, usage label, reset countdown, Upgrade CTA button

MISSING:

- Account info row, plan/tier badge in a popover
- Log out action
- Zoom / font size controls
- Full profile popover component

#### 11. MODEL / MODE FEATURES

HAS:

- Model picker QuickPick (`agi-workforce.selectModel`): lists `MODEL_PICKER_OPTIONS` from `modelConstants.ts` — full multi-provider catalog from `@agiworkforce/types`, `auto-balanced` default
- Model pill in composer bottom bar: shows current model label, opens picker on click
- Mode chip: shows current mode (ask/auto/plan/bypass), opens mode QuickPick
- Effort chip: shows current effort (low/medium/high/max), hidden when model doesn't support effort (checked via `PROVIDER_DISPLAY[providerId].supportsEffort`), opens effort QuickPick
- Per-conversation mode and effort overrides (reset on conversation clear to workspace setting defaults)
- Provider badge updates on model change (brand color from `PROVIDER_DISPLAY`)
- `normalizeConfiguredModelId` normalizes model IDs against catalog — no hardcoding
- Provider-switch paywall guard (`providerSwitchGuard.ts`): blocks mid-conversation provider switch for tiers below Pro+; surfaces upgrade error message
- Auto-fallback chain in `modelConstants.ts`: gpt-5.5 > gpt-5.5-mini > claude-opus-4-6
- `fallbackToVscodeLm`: falls back to VS Code built-in LM API (GitHub Copilot) when no API key configured

MISSING:

- Reasoning effort as a visual slider (current: QuickPick enum only)
- "Quick mode" modal pattern
- Region/routing toggle (US-only flag)
- Per-mode model changed banner in chat area

#### 12. PRICING / UPGRADE

HAS:

- Usage meter banner with progress bar (fill color: teal > amber > terracotta based on remaining %), usage label ("X/50k tokens"), reset countdown ("resets in Xd"), Upgrade button
- Upgrade button opens `https://agiworkforce.com/pricing` via `vscode.env.openExternal`
- Paywall inline card in @agi chat participant: rendered as trusted MarkdownString with https: upgrade link, tier name, feature name, reason + `showInformationMessage` with "Upgrade" button
- `tierResolver.ts`: resolves current tier (explicit setting > Supabase JWT > default byok)
- `providerSwitchGuard.ts`: enforces Pro+ requirement for mid-conversation provider switch
- `usageMeter.ts`: resolves usage state (unbounded/user-api-key/managed-plan)

MISSING:

- Plans comparison modal
- Individual vs team/enterprise tabs
- Credit balance / auto-refill UI

#### 13. ADMIN / ENTERPRISE

N/A: No admin console, audit log, SSO setup, seat management, or org-wide model availability. Enterprise features are web-only.

#### 14. MOBILE / COMPACT MODE

N/A: VS Code extension runs in desktop IDE only.

#### 15. AGENTIC / COMPUTER USE

HAS:

- Agent loop (`agentMode/agentLoop.ts`, `agentModeProvider.ts`): iterative tool-use loop, configurable max iterations (default 25)
- Approval dialogs for file edits (`AgentUI.handleEditRequests`): QuickPick with Accept All / Reject All / per-file selection; diff editor (`vscode.diff`) shown per-file for review before apply
- Approval dialogs for patch requests (`AgentUI.handlePatchRequests`): same pattern — QuickPick, Accept/Reject All, per-file granularity
- Workspace trust gate: untrusted workspaces block auto-apply with modal warning + "Trust Workspace and Proceed" confirmation (VSCODE-02 security fix)
- Checkpoint manager (`checkpointManager.ts`): named checkpoints before edits/patches; `agi-workforce.undoBatch` reverts
- Failed patch recovery: "Show Failed Patch" / "Apply Manually" / "Retry with Fuzzy" / "Show Logs" options; fuzzy match shows confidence level (high/medium/low)
- Agent mode: ask / auto / plan / bypass (bypass = no approval prompts)
- Plan mode: model responds with numbered plan only; "proceed" triggers execution
- Tool-call status rendering in sidebar (pending spinner, done checkmark, expandable JSON input body)

MISSING:

- Status bar item showing current agentic action in real time
- Action log / replay UI (checkpoint restore exists but no list/replay view in the sidebar)
- Computer use (GUI automation, screenshot-based control) — not present

#### 16. BROWSER EXTENSION UX

N/A: This is the VS Code extension. Chrome extension patterns belong to `apps/extension/`.

#### 17. VSCODE EXTENSION UX

HAS:

- Sidebar chat empty state: "Ask about your code" headline + 3 prompt chips (Explain / Fix / Tests)
- Mode chip + effort chip in composer bottom bar, single-click to change via QuickPick
- `@agi` chat participant in VS Code Chat panel (GitHub Copilot chat view):
  - Subcommands: `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model`
  - Follow-up suggestion chips after each response
  - Chat history maintained via VS Code Chat turn history
  - vscode.lm fallback to Copilot models when no AGI key
- Full-screen chat in main editor column (`ChatEditorPanel`), singleton, `agi-workforce.openChatPanel` command
- Session history: `ConversationStore` (JSON in globalStoragePath), `ConversationTreeProvider` sidebar tree — shows past conversations by title, loadable on click
- 56 unique commands registered
- 13 keybindings (Ctrl+Shift+A for chat/accept-diff with `when` clause guard, Ctrl+Shift+E explain, Ctrl+Shift+F fix, etc.)
- 8-item editor context menu group under "AGI Workforce" heading
- Code lens provider: "AGI: Explain" / "AGI: Fix" / "AGI: Refactor" lenses on function declarations (configurable, default on)
- Hover provider: AI explanation hover on symbols (configurable, default off)
- Inline completion provider: ghost-text completions (debounced, configurable max length)
- Diagnostics integration: `shareDiagnostics` sends active file errors/warnings to chat
- Workspace indexer: git status, diagnostics summary, open file list injected into every system prompt
- Terminal integration (`terminalProvider.ts`): run commands, send output to chat
- Actions button in sidebar header opens QuickPick action sheet

MISSING:

- Dedicated "actions menu" panel (current: QuickPick only — no persistent panel)
- "Add context" as a labeled button (only accessible via `@` typing trigger in textarea)
- Sessions history dropdown in the sidebar composer area (current: separate tree view, not inline dropdown)
- Effort selector as a slider (enum QuickPick only)

#### 18. CLI / TUI UX

N/A: CLI/TUI patterns belong to `apps/cli/`.

---

## Component reuse opportunities

- **No shared React/Svelte components used.** The entire webview UI is a single monolithic HTML/CSS/JS string in `webviewContent.ts` (~1,600 lines including inline JavaScript). This is the primary technical debt for UI parity work.
- **Design tokens used**: `agiVsCodeCssVars` and `cssVarsToString` from `@agiworkforce/design-tokens` are imported and injected into the webview `<style>` block — teal `#21808d` and terracotta `#da7756` are represented as CSS custom properties.
- **`@agiworkforce/types`**: `AgentMode`, `Effort`, `AGENT_MODE_LABEL`, `EFFORT_LABEL`, `PROVIDER_DISPLAY`, `MANUAL_MODEL_OPTIONS` all imported — model catalog is not hardcoded in any production path.
- **`@agiworkforce/runtime`**: `QueueFullError` and `getVSCodeSendQueue` used for send-queue management.
- **Migration opportunity**: The inline tool-call renderer, Markdown renderer, and composer bottom bar could be extracted into a shared webview bundle package (alongside `packages/unified-chat` or a new `packages/webview-ui`) enabling reuse with the Chrome extension sidebar.

---

## Known gaps the surface owner already knows about

1. **Ghost command P0** (`agi-workforce.showSubsystemHealth` registered at runtime in `subsystemHealth.ts:38` but `commandParity.test.ts` gives false GREEN due to module-level state pollution — open FINAL_AUDIT P0).
2. **Voice input absent** — no microphone, push-to-talk, or Whisper transcription wired anywhere in the extension source.
3. **Artifact sidebar absent** — code output is inline Markdown only; no split-pane preview, no HTML/CSV/image artifact viewer.
4. **File attachment not end-to-end wired** — plus-menu "Add file or image" fires `openFilePicker` webview message but no extension-side handler processes the response and returns file content back into the composer.
5. **Webview is a monolithic HTML string** — no component framework, no hot-reload, no shared UI primitives; migrating to a React-based webview bundle would unify UI with other surfaces and unlock artifact sidebar capability.
