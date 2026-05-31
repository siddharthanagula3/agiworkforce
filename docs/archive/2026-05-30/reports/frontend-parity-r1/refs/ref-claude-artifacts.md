# Claude Artifacts & Cursor Patterns

**Image set covered**:

- `/Users/siddhartha/Desktop/reference/ui/claude/claude-chat-artifacts-and-tools/` — 27 files (all read)
- `/Users/siddhartha/Desktop/reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/claude-cursor/` — 15 top files read

**Total images read**: 22 core reference images

---

## Mislabel report

- None found. Filenames accurately describe content.

---

## Per-competitor pattern inventory

### Claude (chat.claude.ai)

#### 4. COMPOSER

- Text input box sits at bottom of chat pane, spans full width with minimal padding
- Attachment menu icon (paperclip) within composer, expandable to file/photo/screenshot options
- Model selector in top bar (not in composer) — shows active model + provider badge
- Reasoning effort selector accessible (low/med/high) — shown in top bar or as inline toggle
- Send button prominent, becomes "Stop" during streaming, "Cancel" during tool use
- Voice not visible in screenshot set (no push-to-talk UI captured)
- Slash commands palette available via "/" prefix
- @ mentions for context injection (seen in Cursor Claude Code screenshots)

#### 5. CHAT / MESSAGES

- **Thinking blocks**: collapsible gray panels with clock icon + elapsed time label (e.g., "Sonnet 4.6, Extended")
  - Expanded state shows bullet-point thoughts, nested reasoning steps
  - Collapsed state shows only header + duration
- **Inline tool use**:
  - Status chip badges (e.g., "Request", "Response", "Result", "Done")
  - Expandable JSON request/response pairs in gray code blocks
  - Tool execution shown as sequential steps with icons (file-ops, list-directories, etc.)
  - Tool results collapsible with summary + "Show more" link
- **Web search results**: inline with favicon per source, clickable links, result snippets
- **Citations**: footnote-style references with source attribution
- **Copy/regenerate/branch actions**: visible in message footer (icons row)
- **Scroll-to-bottom FAB**: orange/accent button floating at bottom right when chat scrolls
- **Comparison A/B**: appears as "Options A / Builder-Focused" badge in chat, toggleable
- **Message threading**: user messages show as plain text, AI responses in styled blocks
- **Artifact thumbnails**: inline preview of HTML/MD/PDF artifacts in chat flow

#### 6. ARTIFACTS / SIDEBAR

- **Layout**: Right-side split pane (not popout modal by default), resizable edge
- **Tabs**: Preview | Source (code) | Data (optional, context-dependent)
  - Preview tab shows rendered artifact (HTML in live browser, MD rendered, PDF viewer, rich text)
  - Source tab shows syntax-highlighted code with line numbers, copy button
  - Dark mode preview backgrounds for HTML artifacts (dark gray vs light)
- **Toolbar** (top of artifact pane):
  - Copy button (copies full artifact content)
  - Refresh/reload button
  - Print button
  - Download button (downloads as file with extension)
  - Close/dismiss button (X) — collapses sidebar
  - Artifact filename/title displayed in toolbar
- **Artifact types supported**:
  - HTML (live preview in browser, syntax highlight in source)
  - Markdown (rendered with headers, bullet lists, code blocks)
  - PDF (viewer with page navigation, fits to width/height)
  - Plain text (MD)
  - JSON/code (syntax highlight)
- **Multi-artifact cards**: when response has 3+ artifacts, shown as stacked cards in chat with "Download all" button
- **Visual affordances**:
  - Artifact cards have subtle shadow/elevation
  - Tabs have active underline indicator
  - Hover states on buttons (opacity/color change)
  - Resize handle visible on split pane edge

#### 11. MODEL / MODE FEATURES

- **Reasoning effort slider**: Low | Medium | High (labeled in UI, in top bar or settings)
- **Extended thinking indicator**: badge shows "Extended" when selected (e.g., "Sonnet 4.6, Extended")
- **Plan mode**: shown as toggle or button in top bar, activates planning step before response
- **Model switcher**: dropdown in top bar showing "Code with Claude application" or model name, supports mid-conversation swap
- **Quick mode**: modal or dropdown available (mentioned in Cursor extension docs)
- **Auto vs manual model selection**: manual selection via dropdown, auto-routing not visible in these screenshots
- **Region/routing toggles**: not visible in chat screenshots (likely in settings)

---

### Cursor (Claude Code extension)

#### 4. COMPOSER

- **Text input**: full-width at bottom of chat panel in VS Code sidebar
- **Slash commands palette**: "/" prefix opens inline suggestions (similar to chat.claude.ai)
- **@ mentions**: inline mention system for files, symbols, code references
  - Shows file path suggestions as user types "@"
  - Context from selected code auto-injected after @-mention
- **Model picker**: top bar or inline, swappable mid-conversation
- **Reasoning effort selector**: available (Low/Med/High)
- **Send button**: prominent, changes to Stop during execution
- **Attachment menu**: file attachment via + icon, screenshot option not visible (likely in settings)
- **Permission notification**: banner shown when granting file/context access (screenshot shows permission flow)

#### 5. CHAT / MESSAGES

- **Plan mode output**: formatted as block with "Work Plan" header, bullet-point action items
- **Code context display**: selected code shown in collapsible panel before chat message
- **Inline thinking blocks**: same clock-icon + duration pattern as chat.claude.ai
- **Inline tool results**: similar status chips and expandable JSON as chat.claude.ai
- **Diff review inline**: shows side-by-side diff of proposed changes, editable
  - Expand/collapse UI for large diffs
  - Accept/reject buttons visible
  - Line-by-line review capability
- **Terminal output**: shown in collapsible block if command executed

#### 6. ARTIFACTS / SIDEBAR

- **Not primary in Cursor** — artifacts generated are shown in chat flow or in side panel
- **Plan preview**: shown as collapsible section in chat (not separate sidebar)
- **Diff panel**: takes sidebar space when reviewing code changes

#### 11. MODEL / MODE FEATURES

- **Plan mode**: toggle button visible in Cursor UI, shows planning before execution
- **Reasoning effort**: accessible, same Low/Med/High pattern
- **Model selection**: dropdown in header, shows "Claude Code (Open in Side Bar)"
- **Extended thinking**: not explicitly highlighted in these screenshots but available per settings
- **Command palette**: slash commands for "/" prefix
- **Quick mode**: available via keyboard shortcut or menu

---

## Standout patterns worth copying

Prioritized by impact on AGI Workforce chat surfaces (Desktop, Web, Mobile):

1. **Collapsible thinking blocks with clock icon + elapsed time** — observed in `11_inline-reasoning-steps_thinking-blocks-clock-icons.png`, `15_inline-reasoning-flow_multiple-thought-blocks.png`. Users understand reasoning cost at a glance. Implement in all surfaces' MessageBubble component.

2. **Split-pane artifact sidebar with tabs (Preview | Source | optional Data)** — observed in `12_artifact-sidebar_html-resume-preview.png`, `18_artifact-sidebar_markdown-preview-split-view.png`, `19_artifact-sidebar_markdown-source-code-view.png`. Users can switch between rendered output and code without modal context-switch. Desktop/Web should adopt this; Mobile can popout to fullscreen tab view.

3. **Tool use as status chips + expandable JSON blocks** — observed in `02_inline-tool-use_filesystem-results-summary.png`, `03_inline-tool-expanded-detail_json-request-response.png`, `07_inline-tool-steps_file-creation-sequence.png`. Compact by default (Request/Response/Result chips), expand on click to see full JSON. Users don't get buried in tool verbosity.

4. **Scroll-to-bottom floating action button** — observed in `04_chat-layout_scroll-to-bottom-floating-button.png`. Orange/accent color, appears when user scrolls up, disappears when scrolled to bottom. Essential for long conversations; implement in Web and Desktop chat.

5. **"Download all" batch action for multi-artifact responses** — observed in `17_chat-response_multiple-artifact-cards-download-all.png`. Single button downloads all 3+ artifacts at once. Zip file or sequential downloads. Reduces friction for artifact collection.

6. **@ mention system for code/file context in chat** — observed in `309_cursor_claude-code_at-mention.png`. User types "@" to inject file paths, selected code blocks, or symbols into message. Autocomplete suggestions. Essential for IDE-class chat (Desktop, VS Code ext, Mobile developer mode).

7. **Inline diff review with side-by-side comparison** — observed in `311_cursor_claude-code_diff-review-inline.png`. Shows proposed changes inline in chat, editable, accept/reject buttons. Not applicable to pure-chat surfaces but critical for code-focused modes.

8. **Top-bar model badge with extended-thinking indicator** — observed in `01_chat-response_comparison-options-ab.png` (model shown in header), `11_inline-reasoning-steps_thinking-blocks-clock-icons.png` ("Sonnet 4.6, Extended" label). Users see active model + mode at all times. Implement in all surfaces' top bar or chat header.

9. **Artifact type-specific toolbar (Copy | Refresh | Print | Download | Close)** — observed in `13_artifact-viewer_toolbar-copy-refresh-close.png`, `24_artifact-viewer_tabbed-content-with-print-button.png`. Consistent buttons across artifact types. Copy is most-used; others are nice-to-have. Essential for artifact sidebar.

10. **Plan mode as collapsible block in chat** — observed in `312_cursor_claude-code_plan-preview.png`. Shows reasoning + bullet-point plan before execution. Separate from thinking blocks (plan is user-facing, thinking is internal). Desktop/Web should show plan in chat; Mobile can collapse to header badge.

---

## Anti-patterns or design choices to avoid

1. **Modal artifact viewer** — Claude uses split-pane, not modal popout. Modals break chat scroll context and require dismiss action. Sticky sidebar is better UX for referencing while typing.

2. **Artifact list sidebar (left side)** — Claude doesn't show artifact inventory in a left sidebar. Artifacts live inline in chat flow. Don't add a separate artifact gallery on the left; keep them in context.

3. **Hiding tool results by default** — Claude shows tool status chips (Request/Response/Done) inline. Some platforms hide raw tool output entirely, which breaks transparency for debugging. Always show at least the summary; expand for details.

4. **Top-level model/reasoning toggle above chat** — don't clutter composer with reasoning/effort UI. Claude puts this in top bar (persistent, not per-message). Keep composer focused on input.

5. **Artifact-only view (no chat context)** — Claude's artifact sidebar always shows alongside chat. Don't implement "artifact view hides chat" mode. Users need both for context switching.

---

## Summary for engineering handoff

### Key takeaways for each surface:

**Desktop (Tauri React)**

- Implement split-pane artifact sidebar with Preview | Source | Data tabs
- Add scroll-to-bottom FAB (orange, toggles on scroll)
- Thinking block collapsibles with clock + duration
- Tool use as compact status chips + expandable JSON
- @ mention system for selected code injection
- Top-bar model badge + extended-thinking indicator

**Web (Next.js)**

- Same as Desktop (shared components from `packages/unified-chat`)
- Artifact sidebar responsive — collapses on mobile breakpoint
- "Download all" batch action for multi-artifact responses
- Plan mode inline in chat, collapsible

**Mobile (React Native Expo)**

- Artifact sidebar → fullscreen tab-based modal (Preview/Source swipe)
- Thinking blocks: same collapsible pattern, optimized for touch
- Tool use: swipe to expand JSON blocks
- @ mention: autocomplete dropdown anchored to input
- Scroll-to-bottom FAB: larger tap target for mobile
- Download button per artifact (batch download deferred to web/desktop)

**VS Code Extension**

- Plan preview inline in chat (observed, keep as-is)
- Inline diff review with side-by-side (keep as-is)
- @ mention system (keep as-is, already wired)
- Tool use status chips (already present)

**Chrome Extension**

- Minimal artifact support (likely inline only, no sidebar)
- Thinking blocks: collapsed by default (space constrained)
- Tool use: summary-only, no expandable JSON (badge UX)
- @ mention: file selectors from DOM context

**CLI / TUI**

- Thinking blocks: ASCII-art collapsible boxes with timers
- Artifact display: inline via `less` pager or terminal preview
- Tool use: stacked log lines with status prefix
- @ mention: file path completion via readline
