# Batch 28: Cursor Claude Code Extension Marketing Accuracy Audit

Audit date: 2026-05-24
Auditor: Claude Code (automated)
Image base: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/
Marketing page: apps/web/app/vscode-extension/page.tsx
Prior audit: batch-26-vscode-cli-marketing.md (9 VS Code images from `vscode-extension/claude/`)

CRITICAL CONTEXT: These 14 screenshots show **Claude Code running inside Cursor** (a VS Code fork), not vanilla VS Code. Evidence: "Cursor Tab" in status bar, "Upgrade to Pro" (Cursor Pro), "Cursor Settings" tab, "New Agent" panel (Cursor's built-in agent), "Import Settings from VS Code" in settings. The AGI marketing page at `apps/web/app/vscode-extension/page.tsx` is titled "VS Code Extension" and **never mentions Cursor compatibility**. This is the primary NEW finding in batch 28.

---

## PAGE-LEVEL FINDINGS (Cursor-specific, new vs batch 26)

| Check | Result |
|-------|--------|
| Cursor mentioned anywhere on page | **MISSING** -- title, lede, metadata, install link all say "VS Code" only; Cursor is not acknowledged |
| Coexistence with Cursor's built-in agent | **MISSING** -- screenshots show Claude Code panel running alongside Cursor's own "New Agent" sidebar; marketing does not address how AGI's extension coexists with Cursor's native agent |
| Import-from-VS-Code path | **MISSING** -- Cursor settings show "Import Settings from VS Code" option; marketing does not mention cross-IDE migration |
| Cursor-specific layout modes | **MISSING** -- settings show Agent vs Editor layout toggle, Title Bar toggle, Conversation Density; none described |
| Terminal-based permission management | **MISSING** -- image 310 shows a two-step prompt "Continue in Terminal to manage permissions?"; not on marketing page |
| Walkthrough / onboarding slash command | **MISSING** -- image 307 shows `/team-onboarding` running a guided onboarding flow; AGI lists only 6 slash commands, none for onboarding |
| @mention file references in chat | **MISSING** -- images 308-309 show file context selection and @mention into the chat panel; page mentions "code lens + hover" but not @mention-into-chat |
| Plan preview with diff | **MISSING** -- image 312 shows a plan preview with proposed changes and diff before apply; page has no plan mode at all (also flagged in batch 26) |
| Inline diff review with image attachments | **MISSING** -- image 311 shows inline diff review with embedded screenshot attachments in the diff turn; image attachments to chat not on page |
| macOS Automation permission for open-in-terminal | **MISSING** -- image 313 shows macOS Automation dialog ("Terminal wants access to control Cursor"); entire computer-use/automation surface absent from page |

---

## IMG: 300_cursor_extension-installed_activitybar.png
- Feature depicted: Claude Code extension installed in Cursor showing the main panel with Claude Code branding, empty state mascot, chat input with "Ask Claude to edit..." placeholder, Bypass permissions toggle, and Cursor's own "New Agent" sidebar panel running simultaneously on the right
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/300_cursor_extension-installed_activitybar.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Page does not mention Cursor as a supported host IDE at all
  - Coexistence with Cursor's built-in "New Agent" panel is not addressed -- users need to know which agent surface to use
  - Claude Code panel tab appears alongside Cursor Settings tab; dual-agent environment not explained
  - "Prefer the Terminal experience? Switch back in Settings" banner not mentioned

## IMG: 301_cursor_claude-code_panel-empty-state.png
- Feature depicted: Same as 300 -- Claude Code panel empty state in Cursor with chat input, Bypass permissions, and New Agent sidebar visible. Identical layout to 300.
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/301_cursor_claude-code_panel-empty-state.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Same as 300. Panel empty state with "What to do first? Ask about this codebase or we can start writing code." not described
  - Input toolbar icons (+ button, file/image icon, Bypass permissions indicator, send button) not documented

## IMG: 302_cursor_claude-code_sidebar-empty-state.png
- Feature depicted: Claude Code in Cursor at full resolution showing the same empty state but with more visible detail: Claude Code panel tab with close button, history (clock) and new-chat icons in top-right, Agent mode selector with "Auto" lock toggle in the New Agent sidebar, image attachment button, and status bar showing "agiworkforce" repo context
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/302_cursor_claude-code_sidebar-empty-state.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Agent mode selector (Agent dropdown with "Auto" lock) not described on marketing page (see also batch 26 IMG 05 for modes gap)
  - Image attachment button in sidebar input not mentioned
  - History and new-chat header icons not documented
  - Status bar repo context display not mentioned

## IMG: 303_cursor_claude-code_header-actions.png
- Feature depicted: Same as 302 at full resolution -- header action icons visible: history (clock icon), new-chat (circular arrow icon) in upper right of Claude Code panel, plus the split-editor and pin-panel icons in the panel title bar
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/303_cursor_claude-code_header-actions.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Panel header action icons (history, new chat, split editor, pin/dock) not documented
  - These provide session navigation without the command palette -- not mentioned as UX affordances

## IMG: 304_cursor_claude-code_session-history.png
- Feature depicted: Session history dropdown showing **Local / Web** tabs, search bar ("Search sessions..."), and a list of past sessions with titles and timestamps: "Untitled" (1m), "post-foundation-roadmap-planning" (12m), "Create research prompt for agiworkforce redesign" (5d), "cross-surface-bug-remediation" (5d), "agi-workforce-platform-roadmap" (5d), "agi-workforce-auto-routing" (6d), plus older entries at 7d
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/304_cursor_claude-code_session-history.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Session history browsing not mentioned at all (same gap as batch 26 IMG 09)
  - Local vs Web session tabs not mentioned -- this is a key feature for understanding where conversations are stored
  - Session search not mentioned
  - Session naming and relative timestamps not described

## IMG: 305_cursor_claude-code_command-palette.png
- Feature depicted: Claude Code actions/settings menu opened from the "+" icon in the chat input, showing: **Context** section (Attach file..., Mention file from this project..., Clear conversation, Rewind), **Model** section (Switch model... with "Default (recommended)" label, Effort toggle showing High, Thinking toggle showing blue active dot), **Account & usage...**, and a **Customize...** section below
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/305_cursor_claude-code_command-palette.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Actions menu with context/model/customize sections not described (same gap as batch 26 IMG 06)
  - Effort slider (Low/Medium/High) not mentioned
  - Thinking mode toggle not mentioned
  - Rewind capability not mentioned
  - File attachment and project file mention not described
  - Account & usage link not mentioned
  - "Customize..." section not described

## IMG: 306_cursor_claude-code_settings.png
- Feature depicted: **Cursor Settings page** (not just Claude Code settings) showing: General section with Cursor Account, Upgrade to Pro, Preferences (Editor Settings, Keyboard Shortcuts, Import Settings from VS Code, Reset dialogs), Layout section (Window Layout with Agent vs Editor thumbnails, Conversation Density chooser, Title Bar toggle). Left sidebar navigation: General, VS Code Settings, Agents, Tab, Models, Cloud Agents, Plugins, Rules/Skills/Subagents, Tools & MCPs, Hooks, Indexing & Docs, Network, Beta, Marketplace, Docs
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/306_cursor_claude-code_settings.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - This is primarily **Cursor host settings**, not Claude Code extension settings, but shows the categories the extension integrates with
  - Cursor-specific settings categories (Cloud Agents, Tab, Indexing & Docs, Marketplace) not relevant to AGI's own extension, but the depth of integration surface is not described
  - Agent vs Editor layout mode not mentioned on AGI page
  - Title Bar toggle not mentioned
  - Conversation Density control not mentioned
  - Import from VS Code migration path not mentioned
  - Settings depth overall remains a gap (see also batch 26 IMG 03/04)

## IMG: 307_cursor_claude-code_walkthrough.png
- Feature depicted: Claude Code running the `/team-onboarding` slash command inside Cursor, showing a **live session** titled "Team onboarding setup" with thinking indicators ("Thought for 0s", "Looking at how you've used Claude over the last 30 days to put together an onboarding guide for teammates new to Claude Code", "Thinking...", "Cogitating..."). Input shows "Queue another message..." placeholder with red stop button. New Agent sidebar visible on right.
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/307_cursor_claude-code_walkthrough.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - `/team-onboarding` slash command not listed -- AGI's page lists only 6 slash commands (/explain, /fix, /refactor, /tests, /docs, /model); onboarding/walkthrough is absent
  - Thinking/cogitating progress indicators not described
  - "Queue another message" capability during active processing not mentioned
  - Stop button (red square) for interrupting generation not mentioned
  - Named session tabs ("Team onboarding setup") not described

## IMG: 308_cursor_claude-code_selected-code-context.png
- Feature depicted: Claude Code open alongside a markdown file (`mvo_gas_review_r523c395.plan.md`) in the Cursor editor, showing the document content ("AGI Workforce Better Outcomes Review" with Scope, Initial Findings, Work Plan sections). The Claude Code panel on the left shows the empty state. The New Agent sidebar on the right displays instructions for using the extension: "How to use it: 1. Open the Command Palette... 2. Type Claude Code: Open in Side Bar... 3. Run the command." Also shows "AGI Workforce VS Code extension" instructions explaining that the workspace extension is AGI Workforce's, not Anthropic's Claude Code UI.
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/308_cursor_claude-code_selected-code-context.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Code context from open editor files flowing into the chat panel not explicitly described (page mentions "code lens" but not editor-file-as-context)
  - The New Agent sidebar showing AGI-specific usage instructions ("This workspace's extension is AGI Workforce's apps/extension-vscode, not Anthropic's Claude Code UI") reveals that the project has its own VS Code extension separate from Claude Code -- marketing page should disambiguate
  - Side-by-side panel + editor + sidebar layout not described as a supported workflow

## IMG: 309_cursor_claude-code_at-mention.png
- Feature depicted: Same as 308 -- Claude Code alongside the markdown plan file in Cursor with the AGI Workforce VS Code extension instructions visible in the New Agent sidebar. The sidebar instructions explain: "Confirm Claude Code is installed and enabled (Extensions > search 'Claude Code')" and "On Cursor, also check Cursor's own docs/settings for where Claude Code is registered; naming can vary slightly by version."
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/309_cursor_claude-code_at-mention.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - @mention file references into the chat context not explicitly described on the marketing page
  - The New Agent sidebar content confirms AGI has its own VS Code extension (`apps/extension-vscode`) distinct from Anthropic's Claude Code -- marketing page does not explain this distinction
  - Cursor-specific installation notes ("check Cursor's own docs/settings for where Claude Code is registered") not on the page
  - The distinction between AGI's extension and Claude Code's extension is a potential user confusion point not addressed

## IMG: 310_cursor_claude-code_permission-notification.png
- Feature depicted: Claude Code panel showing a **permission management prompt**: "Continue in Terminal to manage permissions?" with subtext "Permission settings are shared between Terminal and this IDE." Two options: "1. Continue in Terminal" (highlighted) and "2. Never mind". Input field still shows "Ask Claude to edit..." at bottom.
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/310_cursor_claude-code_permission-notification.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Terminal-based permission management fallback not described
  - Permission sharing between Terminal and IDE not mentioned -- this is an important security/UX detail
  - The two-step consent flow for switching to terminal is not documented
  - Permission management is entirely absent from the marketing page (same gap as batch 26, but this shows a Cursor-specific permission UX)

## IMG: 311_cursor_claude-code_diff-review-inline.png
- Feature depicted: Claude Code running inside Cursor with a **macOS system dialog** overlaid: "Are you sure you want to quit all applications and log out?" with Cancel/Log Out buttons. Behind the dialog, the Claude Code panel on the left shows an active session ("Append line to capture demo pl...") with thinking indicators, processed diff output, and embedded screenshot references ("[Image #1] [Image #2]"). The editor shows the markdown plan file. The New Agent sidebar shows AGI extension instructions.
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/311_cursor_claude-code_diff-review-inline.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Inline diff review with proposed changes is not described on the marketing page
  - Image/screenshot attachments embedded in chat turns ("[Image #1] [Image #2]") not mentioned -- this is a multimodal input capability absent from the page
  - Diff processing output ("Processed diff (git applied)") not described
  - The session shows Claude Code performing file edits with before/after diffs -- this agentic editing capability goes well beyond "code lens + hover" described on the page

## IMG: 312_cursor_claude-code_plan-preview.png
- Feature depicted: Claude Code running in Cursor with the same macOS logout dialog overlaid. Behind it, the Claude Code panel shows a **plan preview** with proposed changes: "Proposed changes: Capture (diff): ... Can you provide a plan preview for editing the line 'Capture diff requested'..." with step-by-step change descriptions, file paths, and diff context. The editor shows the plan file.
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/312_cursor_claude-code_plan-preview.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Plan preview capability not mentioned on the page (also flagged in batch 26 as a gap)
  - Proposed changes with diff context before apply not described
  - The plan-then-apply workflow (review proposed changes before executing) is a key trust/safety feature absent from the marketing page
  - Step-by-step change descriptions not mentioned

## IMG: 313_cursor_claude-code_open-in-terminal.png
- Feature depicted: Cursor with Claude Code visible, plus a **macOS Automation permission dialog** in the foreground: "'Terminal' wants access to control 'Cursor'. Allowing control will provide access to documents and data in 'Cursor', and to perform actions within that app." with "Don't Allow" and "Allow" buttons. The Claude Code New Agent sidebar is visible. A separate Terminal window is also visible showing Claude Code running in terminal mode.
- Image path: ~/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/313_cursor_claude-code_open-in-terminal.png
- Client type: vscode-ext (cursor)
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Open-in-terminal capability not mentioned on the marketing page
  - macOS Automation permission requirement for Terminal-to-Cursor control not documented -- this is a platform-specific setup step users need to know about
  - Terminal-IDE bridge (Terminal controlling Cursor via Accessibility/Automation) not described
  - The "Desktop bridge" row on the page mentions "connects to desktop on localhost:8787 for full computer use" but does not describe the macOS permission flow required

---

## Summary

### Images audited: 14
- **Accurate:** 0
- **Inaccurate:** 0
- **Missing from marketing:** 14

### Primary finding: Cursor compatibility is undocumented

The marketing page at `apps/web/app/vscode-extension/page.tsx` does not mention Cursor anywhere -- not in the title, metadata, lede, feature list, or distribution table. All 14 screenshots in this batch show Claude Code running inside Cursor, demonstrating full compatibility. Users searching for Cursor-compatible coding assistants will not find this page.

### New gaps unique to batch 28 (not covered in batch 26)

1. **Cursor as a supported host IDE** -- entirely absent from page (0 mentions)
2. **Coexistence with Cursor's built-in Agent** -- screenshots show Claude Code panel alongside Cursor's "New Agent" sidebar; no guidance on which to use
3. **Terminal permission management fallback** -- two-step prompt to manage permissions in terminal, with shared permission settings between Terminal and IDE
4. **`/team-onboarding` walkthrough** -- onboarding slash command not in the 6-command list
5. **Image/screenshot attachments in chat** -- multimodal input capability ([Image #1][Image #2] in diff turns)
6. **macOS Automation permission for Terminal-to-Cursor control** -- platform-specific setup step for open-in-terminal
7. **AGI extension vs Claude Code extension disambiguation** -- screenshots reveal AGI has its own VS Code extension (`apps/extension-vscode`) distinct from Claude Code; marketing page does not explain the relationship
8. **Agent vs Editor layout modes** -- Cursor settings show layout switching; not mentioned
9. **Thinking/cogitating progress indicators** -- visible during active generation
10. **Stop button and queue-another-message** -- generation control UI not described

### Gaps confirmed from batch 26 (still present)

- Session history with Local/Web tabs (batch 26 IMG 09)
- Operating modes and effort slider (batch 26 IMG 05)
- Context attachment and file mention (batch 26 IMG 06/07)
- Settings depth (batch 26 IMG 03/04)
- Plan mode / plan preview (batch 26 IMG 05)
- Rewind and clear conversation (batch 26 IMG 06)
- Thinking toggle (batch 26 IMG 06)

### Recommendations

1. **Add Cursor to page title and metadata** -- e.g. "VS Code & Cursor Extension" or list Cursor as a supported host
2. **Add a "Supported IDEs" section** listing VS Code, Cursor, and any other VS Code forks
3. **Document the permission management flow** including terminal fallback and macOS Automation requirements
4. **Expand slash command list** beyond 6 to include onboarding, plan, and other agentic commands
5. **Add a "How it works in Cursor" section** addressing coexistence with Cursor's native agent panel
6. **Disambiguate AGI's extension from Claude Code** on the marketing page to avoid user confusion
