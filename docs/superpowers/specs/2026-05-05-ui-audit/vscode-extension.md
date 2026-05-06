# VSCode Extension UI/UX Gap Audit — 2026-05-05

## Surface

- App path: `apps/extension-vscode/`
- Refs studied: 9 screenshots from `claude/claude-vscode-extension/`
- Engineer: vscode-ext-engineer

## A. Current state inventory

1. **Sidebar webview chat** — custom HTML/CSS/JS panel with header, messages list, model select dropdown, textarea + send button (`src/providers/sidebarProvider.ts:86-490`)
2. **@agi chat participant** — registered in VS Code Chat panel with 6 slash commands: /explain /fix /refactor /tests /docs /model (`src/providers/chatParticipant.ts`, `package.json:337-384`)
3. **History tree view** — native VS Code TreeView listing saved conversations with open/delete inline actions (`src/providers/conversationTreeProvider.ts`, `package.json:405-416`)
4. **Context Files tree view** — collapsed-by-default TreeView for pinned files, add/remove via context menu and editor title (`src/providers/contextPanelProvider.ts`, `package.json:408-415`)
5. **Model picker** — QuickPick with auto-balanced/economy/premium + full manual catalog from `@agiworkforce/types`; current model surfaced in status bar (`src/extension.ts:498-531`, `src/services/modelConstants.ts:48-73`)
6. **CodeLens** — "Ask AI / Tests / Docs" lenses above functions/classes, toggle via setting (`src/providers/codeLensProvider.ts`, `package.json:558-560`)
7. **Editor context menu** — 9 items in `agi-workforce` group: explain, fix, refactor, tests, docs, code review, ask about code, explain error, add to context (`package.json:453-495`)
8. **Agent mode panel** — separate webview panel opened via `agi-workforce.agentMode` with plan-mode support (`src/providers/agentModeProvider.ts`)

## B. Pattern audit

### 1. Marketplace detail page

- Reference: `01_vscode-extension_marketplace-detail-page.png` — Claude Code page: bold hero headline, bullet-point feature list, version/publisher metadata in sidebar
- Ours: `package.json:4` description = "Multi-provider AI coding assistant — 10+ providers (GPT, Claude, Gemini, and more) in VS Code"; no `README.md` content visible in screenshots
- Gap: No rich marketplace README with feature screenshots, bullet highlights, or capability sections; description alone won't convert installs
- Verdict: ADD
- Impact: 4
- Effort: S
- Priority: P1

### 2. Sidebar chat empty state

- Reference: `02_vscode-sidebar_chat-new-chat-empty-state.png` — Claude Code sidebar: centered brand mark, "New Chat" button top-right, clock history icon, minimal empty state with no instructional text
- Ours: `src/providers/sidebarProvider.ts:464` — system message "Ask anything about your code. Use @agi in VS Code Chat for richer context." rendered as a chat bubble in the messages list; header shows plain "AGI Workforce" text with icon buttons (diag, clear, settings)
- Gap: Empty state is a text-bubble rather than a visually distinct centered state with icon + headline; missing new-chat (+) button and history clock button in the header toolbar matching the ref's top-right icons
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P1

### 3. Settings editor view

- Reference: `03_vscode-extension_settings-editor-view.png` — Claude Code Settings: flat list of settings with titles, descriptions, and inline controls (dropdowns, checkboxes); settings filtered under extension namespace shown in left tree
- Ours: `package.json:516-650` — 19 settings declared across multiple nested keys; `openSettings` webview message fires `vscode.commands.executeCommand('workbench.action.openSettings', ...)` opening native settings editor
- Gap: No custom settings grouping or ordering hints beyond alphabetical; advanced settings (providerStreamProvider, gatewayUrl, useProviderStream) surface at top which is confusing; no markdown descriptions with links
- Verdict: ADJUST
- Impact: 3
- Effort: S
- Priority: P2

### 4. Settings with usage-limit sidebar

- Reference: `04_vscode-extension_settings-with-usage-limit-sidebar.png` — Claude Code: right-side usage/upgrade banner appears alongside the settings list; "Upgrade for 3x usage" CTA with a "Set new limit" button; model selector showing "Auto" with agent/local dropdowns
- Ours: No usage display or upgrade CTA in the extension; `agiWorkforce.model` default is `auto-balanced` but there's no in-UI usage meter or tier indicator; token counter exists (`src/services/tokenCounter.ts`) but surfaced only in status bar
- Gap: No usage meter, no upgrade nudge, no tier/plan indicator visible to user inside the extension UI
- Verdict: ADD
- Impact: 4
- Effort: M
- Priority: P1

### 5. Modes dropdown and effort slider

- Reference: `05_vscode-chat_modes-dropdown-and-effort-slider.png` — Claude Code: modal picker with four modes (Ask before edits, Edit automatically, Plan mode, Bypass permissions); "Effort (High)" slider with toggle at the bottom of the chat input
- Ours: `package.json:585-590` — `agiWorkforce.agent.planMode` boolean setting; `agi-workforce.agentMode` command opens a separate AgentModePanel webview; no in-composer mode picker or effort slider
- Gap: Mode switching requires a separate command/panel rather than an inline dropdown in the chat input; no effort/thinking level slider exposed in the UI at all
- Verdict: ADD
- Impact: 5
- Effort: L
- Priority: P0

### 6. Actions and settings menu (slash-menu from + button)

- Reference: `06_vscode-chat_actions-and-settings-menu.png` — Claude Code: filterable action sheet with sections Context (Attach file, Mention file from this project, Clear conversation, Rewind) and Model (Switch model, Effort slider, Thinking toggle, Account & usage, Toggle fast mode)
- Ours: `src/providers/sidebarProvider.ts:444-448` — header has three icon buttons (⚡ diag, ✕ clear, ⚙ settings); no filterable action sheet; no "Rewind" / conversation rollback; no Thinking toggle
- Gap: No unified action sheet accessible from the input area; key actions (rewind, thinking toggle, account) are absent from the UI entirely
- Verdict: REBUILD
- Impact: 5
- Effort: L
- Priority: P0

### 7. Input "Add context" menu

- Reference: `07_vscode-chat_input-add-context-menu.png` — Claude Code: "+" button in input toolbar opens two-item popup: "Upload from computer" and "Add context"
- Ours: `src/providers/sidebarProvider.ts:478-483` — textarea placeholder says "use @ to reference files"; @mention dropdown (`sidebarProvider.ts:406-435`) searches workspace files; no explicit "+" button in the input bar with a context menu
- Gap: No visible "+" attachment button in the composer; context attachment relies on hidden @ trigger with no affordance; the Context Files tree exists but is separate from the composer and collapsed by default
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 8. Full-screen chat in main editor

- Reference: `08_vscode-main-editor_chat-empty-state-full-screen.png` — Claude Code opens a full-width chat tab in the editor area with the same empty-state mascot, input bar with "+" and slash buttons, Bypass permissions indicator, and "Prefer the Terminal?" dismissable notice
- Ours: `src/providers/agentModeProvider.ts` — `AgentModePanel.createOrShow()` opens a separate webview panel; `agi-workforce.chat` command tries `workbench.action.chat.open` (VS Code native chat) not a custom full-screen editor tab
- Gap: No dedicated full-screen editor-area chat tab; agent mode and chat are split across two different panel types; no "Prefer the Terminal?" or equivalent onboarding tip; no consistent mascot/branding in the editor chat view
- Verdict: ADJUST
- Impact: 3
- Effort: L
- Priority: P2

### 9. Chat sessions history dropdown

- Reference: `09_vscode-main-editor_chat-sessions-history-dropdown.png` — Claude Code: dropdown from the clock icon listing recent sessions with timestamps and a "Local / Web" tab toggle at the top; search box to filter sessions
- Ours: `src/providers/conversationTreeProvider.ts` — TreeView in the sidebar lists conversations; no dropdown overlay in the editor chat view; no search within history; no Local/Web tab (we do have cloud sync but no toggle)
- Gap: History is a sidebar tree, not a searchable dropdown accessible from the chat header; no session search; no cross-device sync toggle in the UI
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P2

### 10. @agi chat participant slash commands

- Reference: (no direct screenshot, but ref shows Claude participant in VS Code Chat with mode/effort controls)
- Ours: `package.json:337-384` — 6 commands declared: /explain /fix /refactor /tests /docs /model; disambiguation categories: coding and architecture
- Gap: No /search, /agent, /plan, /rewind, or /context slash commands; /model switches model but does not surface the full multi-provider picker inline; disambiguation covers only 2 categories
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P2

### 11. Inline completions

- Reference: (not shown in ref screenshots, inferred from extension capability)
- Ours: `package.json:566-577` — `agiWorkforce.inlineCompletions.enabled` default false; `src/providers/inlineCompletionProvider.ts` implements ghost-text; opt-in only
- Gap: Inline completions are opt-in and disabled by default; Claude Code ships them on by default as a core value proposition; our off-by-default stance hurts first-run impressions
- Verdict: ADJUST
- Impact: 4
- Effort: S
- Priority: P1

### 12. Code lens

- Reference: (not shown in ref; standard pattern across AI extensions)
- Ours: `package.json:557-560` — `agiWorkforce.codeLensEnabled` default true; shows "Ask AI / Tests / Docs" above functions; `src/providers/codeLensProvider.ts`
- Gap: Labels are generic; ref shows more contextual actions (Explain, Fix) that respond to diagnostics; our lenses do not highlight when there are errors in range
- Verdict: KEEP
- Impact: 2
- Effort: S
- Priority: P2

### 13. Model picker (auto-balanced)

- Reference: `06_vscode-chat_actions-and-settings-menu.png` — "Switch model... Default (recommended)" in the action menu; effort slider inline
- Ours: `src/services/modelConstants.ts:48-73` — 3 auto-tiers + full multi-provider manual catalog; QuickPick with label/description/detail; status bar shows current model with click-to-change
- Gap: Provider picker is a flat QuickPick with no grouping by provider; no inline model badge visible inside the chat window itself (only status bar); our differentiator (10+ providers) is not visually prominent in the picker
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 14. Hover provider

- Reference: (not shown in ref)
- Ours: `package.json:551-554` — `agiWorkforce.hoverEnabled` default false; `src/providers/hoverProvider.ts`
- Gap: Hover actions are disabled by default; no discoverability mechanism
- Verdict: KEEP
- Impact: 1
- Effort: S
- Priority: P2

### 15. Desktop bridge indicator

- Reference: (no ref screenshot)
- Ours: `src/extension.ts:1030-1031` — status bar shows `bridge:8787` chip when enabled; bridge reconnect command available
- Gap: Bridge connection state is not surfaced in the sidebar UI or chat header; users with a failed bridge get no in-chat nudge
- Verdict: ADJUST
- Impact: 2
- Effort: S
- Priority: P2

## C. Top 10 priority gaps (ranked, P0 first then Impact/Effort)

1. **Modes dropdown in chat composer** — Ref: `05_vscode-chat_modes-dropdown-and-effort-slider.png` — Ours: `package.json:585-590` (boolean setting only) — Add inline mode picker (Ask/Auto/Plan/Bypass) + effort slider to the sidebar chat input toolbar — P0 (Impact 5, Effort L)

2. **Unified action/settings sheet** — Ref: `06_vscode-chat_actions-and-settings-menu.png` — Ours: `src/providers/sidebarProvider.ts:444-448` (3 icon buttons) — Replace/augment header buttons with filterable action sheet covering context, model, thinking, rewind, account — P0 (Impact 5, Effort L)

3. **Usage meter + upgrade CTA** — Ref: `04_vscode-extension_settings-with-usage-limit-sidebar.png` — Ours: no usage display — Add token/credit usage indicator panel or banner with tier-aware upgrade nudge using existing tokenCounter data — P1 (Impact 4, Effort M)

4. **"+" context attachment button in composer** — Ref: `07_vscode-chat_input-add-context-menu.png` — Ours: `sidebarProvider.ts:478-483` (@-mention only) — Add explicit "+" button to input toolbar with popup: "Upload file / Add context" — P1 (Impact 4, Effort M)

5. **Model picker with provider grouping and inline badge** — Ref: `06_vscode-chat_actions-and-settings-menu.png` — Ours: `src/services/modelConstants.ts:48-73` (flat QuickPick) — Group picker by provider (Anthropic / OpenAI / Google / Local / etc.) and show current provider badge inside the chat header — P1 (Impact 4, Effort M)

6. **Inline completions on by default** — Ref: (standard) — Ours: `package.json:567` (`default: false`) — Flip default to true; add first-run explainer dismissing to settings — P1 (Impact 4, Effort S)

7. **Marketplace README** — Ref: `01_vscode-extension_marketplace-detail-page.png` — Ours: package.json description only — Author a full README.md with screenshots, feature bullets, provider list, BYOK instructions — P1 (Impact 4, Effort S)

8. **Empty state upgrade to visual hero** — Ref: `02_vscode-sidebar_chat-new-chat-empty-state.png` — Ours: `sidebarProvider.ts:464` (system text bubble) — Replace system bubble with centered brand mark + headline + new-chat button in header — P1 (Impact 3, Effort M)

9. **History session search / dropdown** — Ref: `09_vscode-main-editor_chat-sessions-history-dropdown.png` — Ours: `src/providers/conversationTreeProvider.ts` (tree only) — Add search filter to history tree; add clock-icon dropdown in editor chat header — P2 (Impact 3, Effort M)

10. **Full-screen editor chat tab with consistent branding** — Ref: `08_vscode-main-editor_chat-empty-state-full-screen.png` — Ours: `src/extension.ts:323-334` (falls back to native chat) — Implement a dedicated editor-area webview tab for chat with same styling as sidebar — P2 (Impact 3, Effort L)

## D. Anti-patterns from refs we should NOT copy

1. **Single-provider model selector** — `05_vscode-chat_modes-dropdown-and-effort-slider.png` / `06_...actions-menu.png` show "Switch model... Default (recommended)" with Claude-only models. We have 10+ providers; copying a flat single-list picker would bury our differentiator. Use grouped picker by provider instead.

2. **"Upgrade to Pro" as primary CTA** — `04_vscode-extension_settings-with-usage-limit-sidebar.png` shows Anthropic's "Upgrade for 3x usage & faster responses" banner hard-coded to Pro. We support BYOK and local LLM (free forever) — pushing a paid upgrade as the primary action conflicts with our value prop. Use a tiered nudge: BYOK setup first, then paid tiers.

3. **"Prefer the Terminal?" migration notice** — `08_vscode-main-editor_chat-empty-state-full-screen.png` shows Claude's "Prefer the Terminal experience? Switch back in Settings" notice — this is specific to Claude Code's CLI/extension duality and is meaningless for our product. Do not include this pattern.

4. **Claude-brand mascot** — The pixelated robot mascot in refs `05`, `06`, `07`, `08` is Anthropic's brand asset. We need our own visual mark for the empty state, not a generic robot or copy of theirs.

5. **"Bypass permissions" as a visible persistent footer element** — Refs show "Bypass permissions" as a persistent clickable chip in the chat input footer. This is appropriate for a developer-trust model where Anthropic has established that expectation. For our 10+ provider surface, surfacing a raw "bypass" label without contextual framing could confuse non-Claude users and creates a trust mismatch.

## E. Open product questions (need user decision)

1. **Inline completions default**: Should `agiWorkforce.inlineCompletions.enabled` flip to `true` by default? This helps first-run impressions but increases API cost and noise for users not expecting it.

2. **Modes implementation surface**: Should the mode picker (Ask/Auto/Plan/Bypass) live in (a) the sidebar chat toolbar, (b) the @agi chat participant's composer, or (c) both? Currently the sidebar and the @agi participant are separate UX surfaces with different state.

3. **Usage meter data source**: The token counter tracks usage locally. Should the usage CTA pull from (a) local token counts only, (b) the AGI Workforce cloud account API, or (c) both with fallback? This affects whether the meter is accurate for BYOK users.

4. **Full-screen editor chat tab**: Should `agi-workforce.chat` open our own custom editor tab (matching ref pattern 8) or continue to delegate to VS Code's native chat panel (`workbench.action.chat.open`)? Custom tab gives full control but requires maintaining two separate HTML/CSS surfaces.

5. **History sync indicator**: Should the History tree show a Local/Cloud tab toggle (matching ref pattern 9) tied to `agiWorkforce.useProviderStream` / Supabase auth state? If yes, what happens when the user is not signed in?

6. **Marketplace README**: Who owns writing and maintaining this? It requires screenshots of the live product and should be updated with each provider addition.
