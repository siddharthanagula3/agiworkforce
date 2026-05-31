# Batch 11 Audit: Code/Cowork Dashboard and Dev Tools

Auditor: Claude Opus 4.7 (1M context)
Date: 2026-05-24
Reference images: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/ and /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/
Web app root: /Users/siddhartha/Desktop/agiworkforce/apps/web

---

## IMG: 106_claude-max20x_design_research-preview.png

- **Feature**: Claude Design (Research Preview) -- a visual design tool with prototype/slide deck creation, design system selection, wireframe vs high-fidelity modes, and a project gallery showing recent designs
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/106_claude-max20x_design_research-preview.png
- **Implementation status**: missing
- **Primary files**: N/A -- no corresponding design tool feature exists in the web app
- **API endpoints**: N/A
- **Data flow**:
  - Claude Design is a standalone Anthropic product (separate from Chat/Code/Cowork)
  - No equivalent UI surface, prototype builder, or design gallery exists in the AGI web app
  - No design-system browser or wireframe/hi-fi mode toggle is present
- **Flaws**:
  - [critical] Claude Design is an entirely separate Anthropic product; building an equivalent is out of scope for AGI v1 unless product requirements change
- **Visual gaps**:
  - No prototype/slide deck creation flow
  - No design system selector dropdown
  - No wireframe vs high-fidelity mode toggle
  - No project gallery grid with thumbnail previews
  - No "Create" CTA button
  - N/A for v1 -- this is a separate Anthropic product, not a chat/code feature to mirror

---

## IMG: 108_claude-max20x_code_home.png

- **Feature**: Claude Code home dashboard -- three-tab mode switcher (Chat / Cowork / Code) in sidebar, usage overview dashboard with heatmap (Sessions, Messages, Total tokens, Active days, Current streak, Longest streak, Peak hour, Favorite model), recent sessions list, bottom bar with context pills (Local, repo, branch, worktree), and composer with model/plan info
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/108_claude-max20x_code_home.png
- **Implementation status**: partial
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebShellV3.tsx (V3Mode type, mode switcher)
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebSidebar.tsx (Chat/Cowork/Code tabs, nav items)
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx (greeting)
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Sidebar/ChatSidebar.tsx (production sidebar)
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/pages/WebChatPage.tsx (main page)
- **API endpoints**: N/A (no usage stats endpoint)
- **Data flow**:
  - WebShellV3 defines V3Mode = 'chat' | 'cowork' | 'code' and renders WebSidebar with mode switcher
  - WebSidebar has the 3-tab pill-style mode switcher (Chat/Cowork/Code) at line ~254-286
  - However, WebChatPage.tsx (the production page) uses ChatSidebar, NOT WebSidebar -- so the 3-tab switcher is not wired into the production route
  - No usage heatmap/dashboard stats component exists anywhere in the codebase
  - GreetingBanner shows "Good morning/afternoon, Name" but NOT "What's up next, Name?" as in reference
  - No context pills (Local, repo, branch, worktree) in the production composer footer
- **Flaws**:
  - [critical] Usage overview dashboard (heatmap, sessions/messages/tokens stats) is completely missing -- no component, no API @ N/A
  - [critical] Three-tab mode switcher (Chat/Cowork/Code) exists in WebSidebar (v3) but is not used in the production WebChatPage which uses ChatSidebar instead @ apps/web/features/chat/pages/WebChatPage.tsx:585
  - [major] Greeting text says "Good morning/afternoon" instead of "What's up next, [Name]?" as in Claude Code reference @ apps/web/features/chat/components/GreetingBanner/useGreeting.ts:51
  - [major] No context pills (Local, repo path, branch, worktree toggle) in bottom bar @ apps/web/features/chat/components/Composer/ComposerFooter.tsx
  - [major] No "Overview / Models" tab switcher for the dashboard stats area
  - [minor] Bottom bar shows "Cmd+Enter to send" hint but reference shows "Auto + 0 - Opus 4.7 fM - Max" model/plan info
- **Visual gaps**:
  - Missing heatmap grid (blue squares representing daily activity)
  - Missing stat cards: Sessions, Messages, Total tokens, Active days, Current streak, Longest streak, Peak hour, Favorite model
  - Missing "All / 30d / 7d" time-range filter tabs
  - Missing "You've used ~4000+ more tokens than The Little Prince" fun comparison text
  - Missing context bar with Local/repo/branch/worktree pills
  - Missing "Auto" permission mode selector in bottom-left

---

## IMG: 109_claude-max20x_code_sidebar-more-menu.png

- **Feature**: Sidebar "More" menu item showing a tooltip/popover with "Customize sidebar" option, revealed by hovering the "More" nav item
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/109_claude-max20x_code_sidebar-more-menu.png
- **Implementation status**: missing
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Sidebar/ChatSidebar.tsx
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebSidebar.tsx
- **API endpoints**: N/A
- **Data flow**:
  - Reference shows a "More" nav item in sidebar that reveals "Customize sidebar" on hover/click
  - ChatSidebar has fixed nav items (New chat, Projects, Artifacts, Customize) but no "More" item
  - WebSidebar (v3) has a "Customize" nav item that maps to 'customize-home' but no "More" dropdown
  - No sidebar customization UI exists (hide/show/reorder sidebar items)
- **Flaws**:
  - [major] No "More" nav item with "Customize sidebar" popover in either sidebar implementation @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx
  - [minor] No sidebar customization feature at all (ability to show/hide nav items)
- **Visual gaps**:
  - Missing "More" nav item with lightning bolt icon
  - Missing tooltip/popover showing "Customize sidebar" on hover

---

## IMG: 110_claude-max20x_code_permission-mode-menu.png

- **Feature**: Permission mode selector popover in the Code mode bottom bar -- showing a Mode menu with options: Ask permissions (1), Accept edits (2), Plan mode (3), Auto mode (4), Bypass permissions (5), each with keyboard shortcuts and radio-button selection
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/110_claude-max20x_code_permission-mode-menu.png
- **Implementation status**: missing
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Composer/ComposerFooter.tsx
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Composer/AgentModeSwitcher.tsx
- **API endpoints**: N/A
- **Data flow**:
  - Reference shows a permission mode popup anchored to bottom-left with 5 graduated autonomy levels
  - AgentModeSwitcher has modes (solo, engineer, research, team, race) which are agent collaboration modes, NOT permission/safety modes
  - No "Ask permissions" / "Accept edits" / "Plan mode" / "Auto mode" / "Bypass permissions" concept exists
  - No keyboard-shortcut-mapped permission levels (1-5)
  - The reference "Mode" popup includes both permission controls and context badges (main, worktree)
- **Flaws**:
  - [critical] No permission mode system (ask/accept/plan/auto/bypass) -- this is a core Claude Code safety feature missing entirely @ N/A
  - [major] AgentModeSwitcher conflates agent collaboration modes with what should be separate permission autonomy levels @ apps/web/features/chat/components/Composer/AgentModeSwitcher.tsx:18-52
  - [major] No keyboard shortcuts (1-5) for switching permission modes
- **Visual gaps**:
  - Missing Mode popover with graduated permission levels
  - Missing shield/lock icon variants per permission level
  - Missing keyboard shortcut indicators (1, 2, 3, 4, 5)
  - Missing "main" branch indicator and "worktree" toggle with checkbox in bottom bar

---

## IMG: 112_claude-max20x_code_usage-popover.png

- **Feature**: Plan usage popover showing rate limit status with multiple tiers: "5-hour limit" (30%, resets 34m), "Weekly - all models" (1.6%, resets 5d), "Weekly - Claude Design" (4%, resets 5d), "Sonnet only" (6%, resets 5d), each with progress bar and reset timer
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/112_claude-max20x_code_usage-popover.png
- **Implementation status**: partial
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Budget/BudgetTrackerDisplay.tsx
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/stores/unified/billingUsage.ts
- **API endpoints**:
  - GET /api/llm/v1/credits/balance (credit balance fetch)
  - GET /api/usage (cost overview)
- **Data flow**:
  - BudgetTrackerDisplay shows: tokens used, cost this session, daily remaining, and optional credit balance
  - billingUsage store tracks sessionCost_cents, dailyBudget_cents, monthlyBudget_cents
  - fetchCreditBalance() calls /api/llm/v1/credits/balance for monthly_remaining/allocated and daily_remaining/limit
  - loadCostOverview() calls /api/usage for daily/monthly cost and limits
  - Store generates budget alerts at 80%/95%/100% thresholds
- **Flaws**:
  - [critical] No multi-tier rate limit display (5-hour, weekly all-models, weekly per-model, model-specific) -- BudgetTrackerDisplay shows only session cost and daily remaining, not the tiered rate limit structure Claude uses @ apps/web/features/chat/components/Budget/BudgetTrackerDisplay.tsx:91-172
  - [major] No progress bars for each limit tier -- reference shows horizontal fill bars with percentage and reset timers
  - [major] No per-model rate limits (e.g., "Sonnet only" or "Claude Design" tiers)
  - [major] No reset timer display ("resets 34m", "resets 5d")
  - [minor] BudgetTrackerDisplay is embedded inline below the composer, not as a popover anchored to the status bar as in reference
  - [cosmetic] No minimize/expand toggle icon in the popover header (reference shows a collapse arrow)
- **Visual gaps**:
  - Missing "Plan usage" header with collapse/expand icon
  - Missing horizontal progress bars with percentage fill
  - Missing "resets Xm/Xd" countdown text per tier
  - Missing tiered limit rows (5-hour, weekly, per-model)
  - Missing popover positioning anchored to status bar

---

## IMG: 113_claude-max20x_code_repo-selector.png

- **Feature**: Repository selector dropdown in the Code mode bottom bar showing recently used repos (agiworkforce with checkmark, cli, claw-code, src, homebrew-tap) and an "Open folder..." option
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/113_claude-max20x_code_repo-selector.png
- **Implementation status**: missing
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Composer/FolderContextSelector.tsx (closest analog)
- **API endpoints**: N/A
- **Data flow**:
  - Reference shows a repo/folder selector anchored to a bottom-bar pill showing the current repo name
  - FolderContextSelector exists but works with chat folders (user-created organizational folders), not filesystem repositories
  - FolderContextSelector fetches from folderManagementService.getUserFolders(), not from a local filesystem or git repo list
  - No "Open folder..." action that would open a native file picker for local directory selection
  - No concept of "recent repos" tracking in the web app
- **Flaws**:
  - [critical] No repository/project directory selector -- FolderContextSelector manages chat organization folders, not code repositories @ apps/web/features/chat/components/Composer/FolderContextSelector.tsx
  - [major] No "Recent" repos list with checkmark for current selection
  - [major] No "Open folder..." action for selecting local directories
  - [minor] No git-aware context (branch, worktree) associated with selected repo
- **Visual gaps**:
  - Missing bottom-bar repo pill with dropdown
  - Missing "Recent" header with repo list
  - Missing folder icon prefix and checkmark for active repo
  - Missing "Open folder..." item with folder icon

---

## IMG: 114_claude-max20x_code_add-menu.png

- **Feature**: Add menu (attached to "+" button in Code mode bottom bar) showing options: Add files or photos, Add folder, Import GitHub issue, Slash commands, Connectors (with submenu arrow), Plugins (with submenu arrow)
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/114_claude-max20x_code_add-menu.png
- **Implementation status**: partial
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Composer/ChatComposerNew.tsx (overflow menu)
- **API endpoints**: N/A
- **Data flow**:
  - ChatComposerNew has a "+" overflow menu (line ~691-873) that opens a popover
  - The overflow menu contains: Focus Mode, Agent Mode, Project Context (folder), Skills, Response Style, Tools
  - The reference add menu has a different set: Add files, Add folder, Import GitHub issue, Slash commands, Connectors, Plugins
  - File attachment exists via the separate paperclip button, not in the "+" menu
  - No "Import GitHub issue" integration exists
  - SlashCommandMenu exists but is triggered by typing "/" not from this menu
  - No "Connectors" submenu (MCP/tool connectors) in the overflow menu
  - No "Plugins" submenu in the overflow menu
- **Flaws**:
  - [major] "+" menu content diverges significantly from reference -- shows Focus Mode/Agent Mode/Style/Tools instead of Add files/Add folder/GitHub/Slash commands/Connectors/Plugins @ apps/web/features/chat/components/Composer/ChatComposerNew.tsx:712-873
  - [major] No "Import GitHub issue" action anywhere in the chat composer
  - [major] No "Connectors" submenu for MCP/tool-use connections
  - [major] No "Plugins" submenu for plugin management
  - [minor] "Add files or photos" is handled by a separate paperclip button instead of being in the "+" menu
  - [minor] "Add folder" as a directory-level attachment is not supported (only individual files)
- **Visual gaps**:
  - Missing "Add files or photos" with paperclip icon as first menu item
  - Missing "Add folder" with folder icon
  - Missing "Import GitHub issue" with GitHub icon
  - Missing "Slash commands" item
  - Missing "Connectors" with right-arrow submenu indicator
  - Missing "Plugins" with right-arrow submenu indicator

---

## IMG: 207_claude-desktop_cowork-or-code-entry.png

- **Feature**: Claude Desktop Cowork mode entry -- three-tab switcher (Chat / Cowork / Code), sidebar with New task, Projects, Scheduled, Live artifacts, Dispatch (Beta), Customize, Recents list; main area with "Let's knock something off your list" greeting, composer with "Work in a project" context, model picker; Active tasks section; "Get to know Cowork" tutorial cards; "Your to-dos on autopilot" CTA
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/207_claude-desktop_cowork-or-code-entry.png
- **Implementation status**: partial
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebShellV3.tsx
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebSidebar.tsx (cowork nav items at line ~79-87)
- **API endpoints**: N/A
- **Data flow**:
  - WebSidebar defines cowork nav items: Projects, Scheduled, Live artifacts, Dispatch (beta), Customize (line 79-87)
  - WebShellV3 renders different views based on mode but only 'chat' mode has ChatInterface wired up (line 98-99)
  - Cowork mode rendering is not implemented in WebShellV3 -- only the sidebar nav items exist
  - No "Let's knock something off your list" greeting for cowork mode
  - No "Work in a project" context selector in composer
  - No "Active" tasks list
  - No "Get to know Cowork" tutorial cards
  - No "Schedule a task" CTA
- **Flaws**:
  - [critical] Cowork mode main content area is completely unimplemented -- sidebar nav items defined but no rendering @ apps/web/features/chat/v3/WebShellV3.tsx:98
  - [critical] No task management (create/view/schedule) for Cowork mode
  - [major] No "Work in a project" project-scoped context for cowork tasks
  - [major] No tutorial/onboarding cards ("Get to know Cowork")
  - [major] No "Active" tasks section with task status indicators
  - [major] No "Schedule a task" CTA or scheduling UI
  - [minor] Sidebar nav items exist but clicking them fires onNavigateView with unmapped view IDs that go nowhere
- **Visual gaps**:
  - Missing "Let's knock something off your list" hero greeting
  - Missing task composer with "Work in a project" dropdown and "Ask" mode selector
  - Missing active tasks list with status badges and timestamps
  - Missing "Get to know Cowork" onboarding cards (Connect everyday tools, Customize Claude, Ask Claude to make something)
  - Missing "Your to-dos on autopilot" CTA with "Schedule a task" button
  - Missing "Clear active" button for active tasks

---

## IMG: 208_claude-desktop_handoff-result-from-code.png

- **Feature**: Code mode session notification -- "Welcome back, [Name]" greeting, Sessions section showing an "Unread" badge on a completed code session with title, user email, recency (1w), and "Mark all read" action; sidebar with New session, Routines, Customize, More nav items
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/208_claude-desktop_handoff-result-from-code.png
- **Implementation status**: partial
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/Sidebar/ChatSidebar.tsx
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/pages/WebChatPage.tsx
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/shared/stores/notification-store.ts
- **API endpoints**: N/A
- **Data flow**:
  - Reference shows a dedicated "Sessions" section in Code mode with unread session notifications
  - notification-store.ts has unread tracking (unreadCount, getUnreadNotifications) but is not connected to code sessions
  - ChatSidebar shows a flat "Recents" list, not a "Sessions" section with read/unread badges
  - No "Mark all read" action exists in the sidebar
  - No "Unread" badge on session items
  - GreetingBanner uses "Good morning/afternoon" not "Welcome back"
  - No "Routines" nav item in the production sidebar (only in WebSidebar v3 for code mode)
  - "Relaunch to update v1.7fn.0" version banner exists in reference but no update mechanism in web app
- **Flaws**:
  - [critical] No session notification system with read/unread tracking for Code mode sessions @ N/A
  - [major] No "Unread" badge on session items in sidebar @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:170-257
  - [major] No "Mark all read" action @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx
  - [major] Greeting says "Good morning" not "Welcome back" for returning users @ apps/web/features/chat/components/GreetingBanner/useGreeting.ts:14-21
  - [major] No "Routines" nav item in production sidebar @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:563-597
  - [minor] No app update banner ("Relaunch to update") in web app -- not applicable for web but should have equivalent release notification
- **Visual gaps**:
  - Missing "Sessions" section header with notification grouping
  - Missing "Unread" orange badge per session
  - Missing "Mark all read" action button
  - Missing session detail row (email, timestamp, arrow)
  - Missing "Relaunch to update" bottom banner
  - Missing "New session" label (sidebar shows "New chat" instead)

---

## IMG: 209_claude-desktop_updated-code-dashboard.png

- **Feature**: Updated Code mode dashboard -- same usage overview heatmap as IMG 108 but with slightly different stats (Sessions: 604, Messages: 692,873, Total tokens: 122.3M, Active days: 69, Favorite model: Opus 4.7), sidebar with New session, Routines, Customize, More; bottom bar with context pills
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/209_claude-desktop_updated-code-dashboard.png
- **Implementation status**: partial (same as IMG 108)
- **Primary files**: Same as IMG 108
- **API endpoints**: N/A
- **Data flow**: Same as IMG 108 -- usage heatmap dashboard does not exist
- **Flaws**:
  - [critical] Usage heatmap dashboard completely missing (same as IMG 108 analysis) @ N/A
  - [major] Code mode sidebar nav (New session, Routines, Customize, More) not in production sidebar
  - [major] No "Overview / Models" tab switcher
  - [major] No context pills bar (Local, repo, branch, worktree)
  - [minor] "Ask permissions" mode indicator in bottom-left not present
- **Visual gaps**: Same as IMG 108 -- missing heatmap, stat cards, time filters, fun comparison text, context bar

---

## IMG: 213_claude-desktop_filesystem-tool-permission-prompt.png

- **Feature**: Filesystem tool permission prompt -- inline permission dialog showing "Claude wants to use List Directory from Filesystem" with an expandable tool call detail, "Always allow" dropdown (with options), and "Deny" button; rendered mid-conversation as an interruptive consent card
- **Image path**: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/213_claude-desktop_filesystem-tool-permission-prompt.png
- **Implementation status**: partial
- **Primary files**:
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/ToolCallCard.tsx
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/core/ai/tools/tool-registry-manager.ts
  - /Users/siddhartha/Desktop/agiworkforce/apps/web/core/ai/tools/types.ts
- **API endpoints**: N/A
- **Data flow**:
  - ToolCallCard has an 'awaiting_approval' status and onApprove/onReject callbacks (line 16, 37-38)
  - When toolCall.requiresApproval is true, the card shows approve/reject buttons
  - Tool registry (tool-registry-manager.ts) has permission concepts in types
  - However, the UI is a simple approve/reject inline card, NOT the reference pattern of "Always allow" dropdown with tiered persistence options
  - No "Always allow" with dropdown (Always allow this tool, Allow once, Allow for this session)
  - No "Deny" styled as a destructive action with ESC shortcut
  - No tool-name-specific consent string ("Claude wants to use List Directory from Filesystem")
  - No expandable tool call detail with thinking indicator ("Thinking about listing...")
- **Flaws**:
  - [critical] No "Always allow" dropdown with persistence tiers (always/once/session) -- only binary approve/reject @ apps/web/features/chat/components/ToolCallCard.tsx:37-38
  - [major] No tool-name-specific consent string format ("Claude wants to use [Tool] from [Source]")
  - [major] No expandable thinking/detail section in the permission prompt
  - [major] No "Deny" with ESC keyboard shortcut
  - [minor] Permission card visual style does not match reference (reference has a distinct blue accent card with pill-shaped buttons)
  - [minor] No "Adaptive" / "Sonnet 4.6" model badge shown alongside permission prompt
- **Visual gaps**:
  - Missing "[Tool icon] Claude wants to use [Tool] from [Source]" header format
  - Missing expandable chevron for tool call detail
  - Missing "Thinking about..." status indicator
  - Missing "Always allow" dropdown button with chevron
  - Missing "Deny esc" button with keyboard shortcut hint
  - Missing model badge (Sonnet 4.6 / Adaptive) next to tool call
  - Missing blue accent styling on the permission consent card

---

## Summary of Critical Findings

### Missing Features (no implementation)
1. **Claude Design tool** (IMG 106) -- separate Anthropic product, out of scope
2. **Usage overview heatmap dashboard** (IMGs 108, 209) -- no stats, no heatmap, no API
3. **Permission mode system** (IMG 110) -- no ask/accept/plan/auto/bypass graduated autonomy levels
4. **Repository/directory selector** (IMG 113) -- FolderContextSelector manages chat folders, not code repos
5. **Cowork mode main content** (IMG 207) -- sidebar nav defined but no task management UI
6. **Session notification system** (IMG 208) -- no unread badges, no "mark all read"

### Partially Implemented
7. **Three-tab mode switcher** (IMGs 108, 207, 208, 209) -- exists in WebSidebar v3 but NOT wired into production WebChatPage
8. **Budget/usage popover** (IMG 112) -- BudgetTrackerDisplay shows basic stats but no multi-tier rate limits, progress bars, or reset timers
9. **"+" add menu** (IMG 114) -- exists but shows Focus Mode/Agent Mode/Style instead of Add files/GitHub/Connectors/Plugins
10. **Tool permission prompt** (IMG 213) -- ToolCallCard has approve/reject but no "Always allow" dropdown or tiered persistence

### Architecture Gap
The v3 shell (WebShellV3 + WebSidebar) implements the Chat/Cowork/Code mode switcher and per-mode nav items, but the production chat page (WebChatPage) uses ChatSidebar which has none of this. There is a clear disconnect between the v3 prototype and production routing.

### Files Requiring Attention
| Priority | File | Issue |
|----------|------|-------|
| P0 | apps/web/features/chat/pages/WebChatPage.tsx | Wire v3 shell or add mode switcher to production |
| P0 | (new) | Create usage dashboard component with heatmap and stats |
| P0 | (new) | Create permission mode system (ask/accept/plan/auto/bypass) |
| P0 | apps/web/features/chat/components/ToolCallCard.tsx | Add "Always allow" dropdown with persistence tiers |
| P1 | apps/web/features/chat/components/Budget/BudgetTrackerDisplay.tsx | Add multi-tier rate limits, progress bars, reset timers |
| P1 | apps/web/features/chat/components/Composer/ChatComposerNew.tsx | Restructure "+" menu to match reference (files/folder/GitHub/connectors/plugins) |
| P1 | apps/web/features/chat/components/Sidebar/ChatSidebar.tsx | Add unread badges, "Mark all read", mode-specific nav |
| P2 | apps/web/features/chat/components/GreetingBanner/useGreeting.ts | Support "Welcome back" and "What's up next" greeting variants |
| P2 | apps/web/features/chat/components/Composer/ComposerFooter.tsx | Add context pills bar (local/repo/branch/worktree) |
