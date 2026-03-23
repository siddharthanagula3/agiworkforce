# Web Chat (/chat) — Bugs & Implementation Gaps

Tested via Chrome on agiworkforce.com/chat on 2026-03-22.
Compared against Claude.ai, ChatGPT.com, Gemini.google.com, Perplexity.ai UX patterns.

## P0 — Blocking (Must Fix for Demo)

### BUG-1: Chat input disabled — cannot send messages

- **What**: Input shows "Connect to start chatting" and is disabled. Cannot type or send.
- **Root cause**: `ChatInterface` receives `runtime={null}` in web mode. The `disabled={!runtime}` prop prevents all input.
- **Fix needed**: Implement a `WebRuntime` class that connects to the cloud API gateway (`api.agiworkforce.com/v1/chat/completions`) for chat streaming. The runtime should use `cloudChatStream.ts` (already exists in desktop) to handle SSE streaming.
- **Files**: `packages/chat/src/components/ChatInput.tsx`, `apps/desktop/src/App.tsx`, NEW `apps/desktop/src/runtime/WebRuntime.ts`
- **Effort**: 4-6 hours
- **Comparison**: Claude.ai, ChatGPT, Gemini all have working chat on first load.

### BUG-2: "Select model" opens Settings instead of inline model dropdown

- **What**: Clicking "Select model" opens the full Settings modal on "Models & Keys" tab instead of showing an inline model picker dropdown.
- **Root cause**: `onModelSelectorClick` in `App.tsx` calls `openSettingsDialog('models-keys')` — this was designed for desktop where model selection lives in Settings.
- **Fix needed**: Create an inline model dropdown (like Claude.ai's model selector at top of chat). Show available models grouped by provider. When a model is selected, update the chatStore's active model.
- **Files**: `packages/chat/src/components/ChatInput.tsx`, `packages/chat/src/components/ModelSelector.tsx` (NEW)
- **Effort**: 3-4 hours
- **Comparison**: Claude.ai has dropdown at top. ChatGPT has dropdown in input area. Gemini has toggle buttons.

## P1 — Important (Should Fix)

### BUG-3: Desktop-only settings shown in web mode

- **What**: Settings > General shows "Window Preferences" and "Global Hotkey" sections which are desktop-only features irrelevant in the browser.
- **Root cause**: SettingsModal renders all sections unconditionally. No `isTauri` check to hide desktop-only sections.
- **Fix needed**: Wrap Window Preferences and Global Hotkey sections with `{isTauri && (...)}` conditionals.
- **Files**: `packages/chat/src/components/SettingsModal.tsx` or the desktop SettingsPanel component
- **Effort**: 30 min

### BUG-4: "Customize" shows stub card instead of settings

- **What**: Clicking "Customize" in sidebar shows a card "Settings are managed by the host application" instead of opening the Customize tab in Settings.
- **Root cause**: The sidebar's `onNavigateView('customize')` dispatches to the settings but the SettingsModal intercepts it incorrectly or shows a fallback view.
- **Fix needed**: Wire "Customize" click to open Settings modal on the "Customize" tab directly.
- **Files**: `packages/chat/src/components/Sidebar.tsx`, `packages/chat/src/components/SettingsModal.tsx`
- **Effort**: 1 hour

### BUG-5: "Skills" sidebar click does nothing

- **What**: Clicking "Skills" in sidebar has no visible effect.
- **Root cause**: `onNavigateView('skills')` dispatches but nothing handles it in web mode. In desktop, it opens the MCP/Skills settings tab.
- **Fix needed**: Open Settings on "Customize" or "MCP Skills" tab, or show a Skills browsing view.
- **Files**: `packages/chat/src/components/Sidebar.tsx`
- **Effort**: 1 hour

### BUG-6: "Connectors" shows stub card

- **What**: Same as BUG-4 — shows "Settings are managed by the host application."
- **Fix needed**: Same as BUG-4 — wire to open Settings on Connectors/Integrations tab.
- **Files**: `packages/chat/src/components/Sidebar.tsx`
- **Effort**: 30 min

### BUG-7: "Projects" sidebar click does nothing

- **What**: Clicking "Projects" has no visible effect.
- **Fix needed**: Show a projects list view or open Settings on Account tab.
- **Files**: `packages/chat/src/components/Sidebar.tsx`
- **Effort**: 1 hour

### BUG-8: "Chats" sidebar click does nothing

- **What**: Clicking "Chats" should show conversation history list but nothing happens.
- **Root cause**: No conversation list panel implemented. The sidebar just has nav items without views.
- **Fix needed**: Show conversation history in the sidebar area (like Claude.ai's left panel). Load from chatStore's persisted conversations.
- **Files**: `packages/chat/src/components/Sidebar.tsx`, `packages/chat/src/components/ConversationItem.tsx`
- **Effort**: 2-3 hours
- **Comparison**: Claude.ai shows conversation list in sidebar. ChatGPT shows in sidebar. Gemini shows in sidebar.

### BUG-9: "Search" sidebar click does nothing

- **What**: Clicking "Search" should open a search overlay/modal to search conversation history but nothing happens.
- **Fix needed**: Open a search modal with text input that filters conversations by title/content.
- **Files**: `packages/chat/src/components/Sidebar.tsx`, `packages/chat/src/components/CommandPalette.tsx`
- **Effort**: 2 hours

### BUG-10: + button only opens file picker — missing connector menu

- **What**: The + button opens a basic file picker. On Claude.ai, the + button shows a rich menu with: Upload files, Google Drive, GitHub, GitLab, Notion, Web URL paste, etc. On ChatGPT, it shows: Upload file, Take photo, Browse web. On Perplexity, it shows: Upload file, Add URL, Connect source.
- **Root cause**: `ChatInput.tsx` wires the + button directly to a hidden `<input type="file">`. No menu/popover with connector options.
- **Fix needed**: Replace the direct file input trigger with a popover menu showing:
  - Upload from device (existing file picker)
  - Paste URL (input field to add web URLs as context)
  - Google Drive (OAuth connector — opens file picker in Drive)
  - GitHub (OAuth connector — select repo/file)
  - Notion (OAuth connector — select page)
    These connectors are already configured in Settings > Apps & Integrations. The + menu should surface them inline.
- **Files**: `packages/chat/src/components/ChatInput.tsx`, NEW `packages/chat/src/components/AttachmentMenu.tsx`
- **Effort**: 4-6 hours (menu + URL paste), 2-3 days (full OAuth connector integration)
- **Comparison**: Claude.ai has the richest + menu with 6+ sources. ChatGPT has 3. Perplexity has 3. AGI Workforce currently has 1 (file only).

## P2 — Nice to Have

### GAP-11: User profile shows "Free plan" instead of "Hobby"

- **What**: Bottom-left shows "agiautomationllc / Free plan" but the Account settings page correctly shows "HOBBY" badge.
- **Root cause**: The UserProfile component reads plan from a different source than Account settings.
- **Fix needed**: Sync plan tier display between UserProfile and Account.
- **Files**: `packages/chat/src/components/UserProfile.tsx`
- **Effort**: 30 min

### GAP-12: No conversation list shown in sidebar

- **What**: Even after clicking "Chats", no conversation list appears. In Claude.ai/ChatGPT, the sidebar always shows recent conversations.
- **Fix needed**: Show recent conversations below the nav items in the sidebar, grouped by date (Today, Yesterday, Previous 7 days).
- **Files**: `packages/chat/src/components/Sidebar.tsx`
- **Effort**: 3 hours

### GAP-13: Voice input button (mic icon) does nothing

- **What**: Microphone icon next to model selector is present but clicking it has no effect in web mode.
- **Fix needed**: Either hide in web mode or implement Web Speech API for voice input.
- **Files**: `packages/chat/src/components/ChatInput.tsx`
- **Effort**: 2 hours (hide) or 8 hours (implement)

### GAP-14: "Download Desktop App" button has no link

- **What**: The header button "Download Desktop App" may not link anywhere.
- **Fix needed**: Link to `/download` page or GitHub releases.
- **Files**: Header component in the chat SPA
- **Effort**: 15 min

### GAP-15: Mode pills (Code/Write/Research/Web Search/Skills) only change placeholder

- **What**: Clicking "Code" changes placeholder to "Help me write code for" but doesn't actually switch any mode. Should set system prompt context for the selected mode.
- **Fix needed**: Each mode should set a system prompt prefix and possibly different default model.
- **Files**: `packages/chat/src/components/QuickChips.tsx`, `packages/chat/src/stores/chatStore.ts`
- **Effort**: 2 hours

## Working Features (Verified)

- [x] Landing page renders at agiworkforce.com
- [x] Login page with GitHub/Google/Email auth
- [x] Chat UI renders with sidebar, input area, mode pills
- [x] Sidebar collapse/expand toggle works perfectly
- [x] User profile dropdown menu renders all items
- [x] Settings modal opens with all 9 tabs
- [x] Settings > Account shows correct user + HOBBY badge
- [x] Settings > Appearance shows personalization fields
- [x] Settings > Models & Keys shows API key inputs for 9+ providers
- [x] Mode pills change input placeholder text
- [x] Billing page at /billing renders
- [x] Custom domains (agiworkforce.com, chat.agiworkforce.com, api.agiworkforce.com) all resolve
- [x] Dark theme renders correctly
- [x] "AI can make mistakes" disclaimer at bottom

## Implementation Priority Order

1. **BUG-1** (WebRuntime) — unlocks ALL chat functionality
2. **BUG-2** (Model selector) — users need to pick models
3. **BUG-8** (Chats list) — users need conversation history
4. **BUG-3** (Hide desktop settings) — polish
5. **BUG-4/5/6/7** (Sidebar nav wiring) — polish
6. **BUG-9** (Search) — polish
7. **GAP-11-15** (Minor gaps) — polish
