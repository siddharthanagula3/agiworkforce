# Batch 18: Inline Tool Use and Filesystem Results

Audit date: 2026-05-24
Auditor: Claude Opus 4.7
Reference: Claude Desktop screenshots vs AGI web app implementation
Branch: audit/preexisting-remediation-2026-05-23

---

## IMG: 02_inline-tool-use_filesystem-results-summary.png

- Feature: Inline filesystem tool use with collapsible summary header ("Used Filesystem Integration, loaded tools") and sequential step list (Loading tools, List Allowed Directories, List Directory x3, Done) each with a "Result" sub-label badge
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/02_inline-tool-use_filesystem-results-summary.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/messages/ToolTimeline.tsx
  - apps/web/features/chat/components/ToolCallCard.tsx
  - packages/unified-chat/src/components/InlineToolCall.tsx
- API endpoints: N/A (client-side rendering of tool call metadata)
- Data flow:
  - MessageBubble reads `message.metadata.tools` (ToolEntry[]) and renders ToolTimeline
  - ToolTimeline groups entries, computes compact summary string, renders collapsed/expanded views
  - Each ToolEntry maps to ToolCallCard which wraps unified-chat InlineToolCall with `iconStyle="badge"`
  - InlineToolCall badge mode renders round 24px letter/glyph badge + label + "Result" sub-label
  - Expand/collapse is controlled via `open`/`onOpenChange` props
  - Summary header builds a human-readable phrase (e.g. "ran 5 commands, read a file")
- Flaws:
  - [major] ToolTimeline summary header text format differs from Claude. Claude shows "Used Filesystem Integration, loaded tools v" with a descriptive phrase and tool count. ToolTimeline shows "ran 5 commands, created a file, read a file v" -- generic action counts rather than naming the integration. No concept of "loaded tools" as a distinct phase. @ apps/web/features/chat/components/messages/ToolTimeline.tsx:100-163
  - [major] Claude renders each step with a vertical connecting line between badge icons (left guideline). ToolTimeline only shows a vertical line for parallel groups (`border-l-2 border-blue-500/30`), not for sequential steps. Sequential steps render as stacked ToolCallCards without a continuous left rail. @ apps/web/features/chat/components/messages/ToolTimeline.tsx:301-353
  - [minor] Claude shows a search-glass icon for "Loading tools" and folder icons for "List Directory" steps. ToolTimeline delegates icon choice to InlineToolCall's `inferKindFromLabel()` heuristic which may not match -- "Loading tools" would resolve to `'unknown'` (letter "?"), not a search icon. @ packages/unified-chat/src/components/InlineToolCall.tsx:180-199
  - [minor] Claude shows a green circled checkmark for "Done" step. ToolTimeline has no explicit "Done" entry concept; the collapsed summary just shows total tool count. @ apps/web/features/chat/components/messages/ToolTimeline.tsx:217-237
- Visual gaps:
  - Missing continuous vertical guideline connecting all sequential steps (Claude uses a thin line from top to bottom)
  - Missing integration name in summary header (Claude says "Used Filesystem Integration" not "listed files 4 times")
  - Missing search-glass icon for "Loading tools" step
  - "Result" sub-label badge positioning differs -- Claude places it indented below each step label; our implementation shows it only when `status === 'success' && !body`

---

## IMG: 03_inline-tool-expanded-detail_json-request-response.png

- Feature: Expanded tool detail showing JSON request/response payloads. "Loading tools" step is expanded to reveal "Request" section with `{"query": "filesystem list directory"}` and "Response" section with "Loaded 5 Filesystem tools:" text.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/03_inline-tool-expanded-detail_json-request-response.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/ToolCallCard.tsx
  - packages/unified-chat/src/components/InlineToolCall.tsx
- API endpoints: N/A
- Data flow:
  - ToolCallCard passes `body` JSX to InlineToolCall which renders it in an expandable region
  - Body contains "Request" section (JSON.stringify of toolCall.parameters) and "Response" section (toolCall.result string)
  - Expand/collapse state managed via `open`/`onOpenChange` on InlineToolCall
  - Body is styled with bg-muted/50 and monospace pre blocks
  - Section headers use uppercase 10px tracking-wider labels
- Flaws:
  - [minor] Claude's expanded detail shows Request/Response in a single continuous panel with clear section labels. Our ToolCallCard renders Request and Response as separate `<pre>` blocks with independent scroll. Claude uses a unified scrollable area. @ apps/web/features/chat/components/ToolCallCard.tsx:141-166
  - [cosmetic] Claude's expanded body background is a subtle code-background tone continuous with the step row. Our implementation uses `bg-muted/50` rounded blocks nested inside InlineToolCall's body which already has `bg-[color:var(--chat-code-bg)]` -- double nesting of backgrounds. @ apps/web/features/chat/components/ToolCallCard.tsx:108
- Visual gaps:
  - Request/Response labels in our implementation use uppercase tracking-wider style which matches Claude reasonably well
  - JSON formatting and monospace rendering match Claude's style
  - The expanded panel merges well with the badge bar, achieving near-parity on this specific feature

---

## IMG: 06_inline-web-search-results_with-favicons.png

- Feature: Inline web search results with favicons, titles, domain names, snippet text, and a result count badge ("10 results"). Each result shows a small colored dot/favicon, truncated title, and right-aligned domain (e.g., "resumeworded.com", "www.resumify.ai"). A "Show more" link appears at the bottom.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/06_inline-web-search-results_with-favicons.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/InlineToolResults/InlineSearchResults.tsx
  - apps/web/features/chat/components/search/SearchResults.tsx
- API endpoints: N/A (renders search result data from tool output)
- Data flow:
  - InlineToolResult routes `web_search`/`search_web` tool names to InlineSearchResults via TOOL_RENDERERS registry
  - InlineSearchResults extracts `results[]` from `result.data`, enriches with `extractDomain()` and `getFaviconUrl()`
  - Each result renders as a SearchResultCard with favicon, title link, domain, snippet, and position badge
  - First 3 results shown by default; "Show all (N)" button expands to full list
  - Header shows result count, provider badge, and optional duration
- Flaws:
  - [major] Claude renders search results in a compact list with title + domain on the same line (title left, domain right-aligned). Our InlineSearchResults renders each result as a full card with favicon, title, domain below title, and snippet -- significantly more vertical space per result. Claude fits ~5 results in the same height our implementation needs for ~2. @ apps/web/features/chat/components/InlineToolResults/InlineSearchResults.tsx:67-128
  - [major] Claude shows all results in a flat numbered list without cards/borders. Our implementation wraps each result in a bordered, hoverable card (`bg-muted/30 border border-border/30`). This is visually heavier than Claude's clean list. @ apps/web/features/chat/components/InlineToolResults/InlineSearchResults.tsx:75-80
  - [minor] Claude shows result count as "10 results" right-aligned at the top. Our implementation shows it left-aligned with a globe icon. @ apps/web/features/chat/components/InlineToolResults/InlineSearchResults.tsx:198-215
  - [minor] Claude uses small colored dots as favicons (likely Google favicon service). Our implementation uses 20x20px images from Google's favicon service -- same source but larger display size. @ apps/web/features/chat/components/InlineToolResults/InlineSearchResults.tsx:83-96
  - [cosmetic] Claude shows domain in green text after the title on the same line. Our implementation shows domain below the title in emerald color -- correct color but wrong position. @ apps/web/features/chat/components/InlineToolResults/InlineSearchResults.tsx:107-111
- Visual gaps:
  - Results should be a compact flat list, not individual bordered cards
  - Domain should be inline with title (right-aligned), not on a separate line
  - Default visible count should be higher (Claude shows ~5-6, we show 3)
  - Missing the compact row density Claude achieves (~24-28px per result row)
  - "Show more" text at bottom is correctly implemented

---

## IMG: 07_inline-tool-steps_file-creation-sequence.png

- Feature: Sequential file operation steps shown as a vertical timeline. Summary header "Ran 5 commands, created a file, read a file v" collapses to show individual steps: "Check if docx package is available" (Script badge), "Build Siddhartha's tailored DOCX resume..." (build_resume.js badge), "Build the DOCX resume" (Script), etc. Each step has a terminal/script icon badge and a sub-label. Final steps: "Copy to outputs" (Script), "Presented file", "Done" (checkmark).
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/07_inline-tool-steps_file-creation-sequence.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/messages/ToolTimeline.tsx
  - apps/web/features/chat/components/ToolCallCard.tsx
  - packages/unified-chat/src/components/InlineToolCall.tsx
- API endpoints: N/A
- Data flow:
  - MessageBubble passes `metadata.tools[]` to ToolTimeline
  - ToolTimeline computes compact summary via `buildCompactSummary()`
  - Each step becomes a ToolCallCard -> InlineToolCall(iconStyle="badge")
  - InlineToolCall infers kind from label: "Check if docx..." -> 'unknown', "Build..." -> 'unknown'
  - Badge renders with resolved letter/icon; sub-labels show "Script" or file name
- Flaws:
  - [major] Claude shows file-specific icon badges -- a terminal/script icon (rectangle with code lines) for script operations, a file icon for file creation. Our InlineToolCall badge system uses letter-based badges (F, >, ?) that don't differentiate between script execution and file creation at the visual level. The "Script" sub-label concept is missing entirely from our badge rendering. @ packages/unified-chat/src/components/InlineToolCall.tsx:163-177
  - [major] Claude renders each step description as a full sentence (e.g., "Build Siddhartha's tailored DOCX resume for Anthropic Growth Engineer role") with a file name sub-badge ("build_resume.js"). Our ToolCallCard only shows `toolCall.name` as the label, and `argSummary` as muted text, but doesn't render file-specific sub-badges below individual steps. @ apps/web/features/chat/components/ToolCallCard.tsx:182-195
  - [minor] Claude shows "Presented file" as a distinct step type with a document icon. No equivalent step type exists in our ToolEntry type system. @ apps/web/features/chat/components/messages/ToolTimeline.tsx:16-26
  - [minor] Claude's "Done" step renders a green circled checkmark. Our system has no automatic "Done" step injection -- it would need to be manually added to the tools array. @ packages/unified-chat/src/components/InlineToolCall.tsx:163 (done kind exists but is never auto-injected)
- Visual gaps:
  - Missing script/terminal-specific icon badges (Claude uses distinct icons per operation type)
  - Missing file name sub-badges below step descriptions (e.g., "build_resume.js")
  - Missing "Presented file" step type
  - Missing auto-injected "Done" terminal step with green check
  - Vertical connecting line between steps is missing for sequential (non-parallel) steps

---

## IMG: 08_stacked-tool-status-messages_compact.png

- Feature: Stacked compact tool status messages between response sections. Two collapsed summary bars: "Orchestrated resume framework integrating founder credentials and technical accomplishments >" and "Architected ATS-friendly resume synthesizing verified product achievements and founder credentials >". Below each, a plain text response. Then a third summary "Ran 5 commands, created a file, read a file >" with a chevron for expansion.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/08_stacked-tool-status-messages_compact.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/messages/ToolTimeline.tsx
  - apps/web/features/chat/components/messages/MessageBubble.tsx
- API endpoints: N/A
- Data flow:
  - Multiple tool batches render as separate ToolTimeline instances within a single message
  - Each ToolTimeline auto-compacts when steps > 3 and no running tools
  - Compact summary shows natural language phrase + optional duration + error count
  - Click expands to show individual steps
  - ToolTimeline integrates between prose sections of MessageBubble
- Flaws:
  - [major] Claude interleaves tool status summaries within prose text. The summary appears inline between paragraphs as a muted-text clickable line. Our ToolTimeline renders after all message content (in a `mt-3` div), not interleaved within prose. There is no mechanism to split message content around tool invocations. @ apps/web/features/chat/components/messages/MessageBubble.tsx:510-514
  - [major] Claude's stacked summaries use descriptive natural-language titles ("Orchestrated resume framework integrating founder credentials...") rather than action counts ("ran 5 commands"). This implies Claude sends a human-written summary string per tool batch, while our `buildCompactSummary()` computes generic action phrases. @ apps/web/features/chat/components/messages/ToolTimeline.tsx:100-163
  - [minor] Claude's compact summary text color is a lighter muted gold/tan. Our implementation uses `text-muted-foreground` which may not match the warm-toned muted color from the reference. @ apps/web/features/chat/components/messages/ToolTimeline.tsx:226-229
  - [cosmetic] Claude's chevron on compact summaries is a right-pointing angle bracket (>). Our implementation uses a rotated ChevronDown (`-rotate-90`), which achieves the same visual. @ apps/web/features/chat/components/messages/ToolTimeline.tsx:234
- Visual gaps:
  - Tool status summaries should be interleaved within prose, not appended after message content
  - Summary text should be AI-generated descriptive phrases, not computed action counts
  - Multiple tool batches per message are not supported -- MessageBubble renders a single ToolTimeline for all tools

---

## IMG: 10_inline-tool-steps_file-operations-html.png

- Feature: Expanded tool step list showing file operations for HTML generation. Summary header "Viewed a file, created a file, read a file v" with three steps below: "Reading frontend design skill for resume aesthetics" (document read icon), "Siddhartha's tailored resume for Anthropic Growth Engineer role" (HTML file icon with file name badge "Siddhartha_Nagula_Anthropic_GrowthEngineer.html"), "Presented file" (document icon), and "Done" (green check).
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/10_inline-tool-steps_file-operations-html.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/messages/ToolTimeline.tsx
  - packages/unified-chat/src/components/InlineToolCall.tsx
- API endpoints: N/A
- Data flow:
  - Same as IMG 07 -- ToolTimeline -> ToolCallCard -> InlineToolCall(badge)
  - File type detection would use InlineToolCall's `inferKindFromLabel()` for icon selection
  - File name sub-badge requires custom rendering not present in current InlineToolCall
- Flaws:
  - [major] Claude shows an "HTML" file type icon badge (rectangle with "HTML" text inside) for the HTML file creation step. Our InlineToolCall badge system has no file-type-specific badges -- it would show a generic "F" letter badge for any file operation. @ packages/unified-chat/src/components/InlineToolCall.tsx:163-177
  - [major] Claude shows the filename "Siddhartha_Nagula_Anthropic_GrowthEngineer.html" as a rounded pill/tag below the step description. Our InlineToolCall has `resultLabel` (defaults to "Result") but no mechanism for file-name pill badges below step descriptions. @ packages/unified-chat/src/components/InlineToolCall.tsx:447-454
  - [minor] Claude uses distinct icons for read vs create vs present operations. Our badge system maps read/write/edit/fs-list all to "F", losing visual differentiation between operation types. @ packages/unified-chat/src/components/InlineToolCall.tsx:164-168
  - [minor] Vertical connecting line between steps is a thin continuous line in Claude. Not present in our sequential step rendering. @ apps/web/features/chat/components/messages/ToolTimeline.tsx:301-353
- Visual gaps:
  - Missing file-type icon badges (HTML, JS, etc.) -- should show language/format in the badge
  - Missing filename pill/tag below step descriptions
  - Missing distinct icon differentiation between read/create/present operations
  - Missing continuous vertical step connector line
  - Missing "Presented file" and "Done" as auto-injected terminal steps

---

## IMG: 214_claude-desktop_filesystem-tool-result-table.png

- Feature: Filesystem tool result rendered as a structured table with columns (#, Filename, Implied UI State). Shows numbered rows (200-206) with filenames (e.g., "home-empty-or-last-chat", "sidebar-expanded", "account-menu") and corresponding descriptions of implied UI states. Claude renders this as a formatted table within the chat response, not as a raw tool result card.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/214_claude-desktop_filesystem-tool-result-table.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/InlineToolResults/InlineFileRead.tsx
  - apps/web/features/chat/components/InlineToolResults/ToolResultCard.tsx
  - apps/web/features/chat/components/messages/MarkdownContent.tsx
- API endpoints: N/A
- Data flow:
  - If the model reads file content and then generates a table in its response, the table renders via MarkdownContent (markdown table -> HTML table)
  - If the tool result itself contains tabular data, ToolResultCard renders it as raw JSON
  - InlineFileRead renders file content as numbered code lines, not as a formatted table
  - No automatic table detection/formatting exists for tool result payloads
- Flaws:
  - [major] Claude renders structured data from filesystem tool results as formatted tables within the response prose. Our InlineFileRead renders file content as raw monospace text with line numbers. There is no table-detection heuristic that could format CSV/TSV/tabular tool output as an HTML table. @ apps/web/features/chat/components/InlineToolResults/InlineFileRead.tsx:220-241
  - [major] ToolResultCard renders all non-specialized tool results as raw JSON text (`JSON.stringify(result.data, null, 2)`). No smart formatting for arrays-of-objects, CSV, or other tabular structures. @ apps/web/features/chat/components/InlineToolResults/ToolResultCard.tsx:57-63
  - [minor] The table in Claude's screenshot has proper column headers, row numbers, alternating visual structure. Our MarkdownContent can render markdown tables if the model generates them in its response text, but there's no automatic bridging from tool result data to table rendering. @ apps/web/features/chat/components/messages/MarkdownContent.tsx (renders markdown, does not auto-tabulate tool results)
- Visual gaps:
  - Missing smart formatting for tabular tool result data (arrays-of-objects, CSV)
  - No auto-detection of tabular data patterns in tool results
  - File content rendered as code lines, not as structured tables when data is tabular
  - Missing table styling (header row, borders, alternating row colors) for tool result display

---

## IMG: 06_chats-history-management-view.png

- Feature: Chats history management view showing a full-page overlay or dedicated section with: header "Chats" + create-new-chat button (+), search bar "Search your chats...", "Your chats with Claude" label + "Select" link, and a chronological list of conversations with titles and "Last message X hours/days ago" timestamps. Left sidebar shows navigation: New chat, Search, Chats (active), Projects, Artifacts, Customize. User profile at bottom.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/06_chats-history-management-view.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/Sidebar/ChatSidebar.tsx
  - apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx
- API endpoints: N/A (client-side rendering from chat store)
- Data flow:
  - ChatSidebar renders session list from `sessions` prop
  - Sessions are grouped by time (Today, Yesterday, Last 7 Days, etc.)
  - Search filters sessions by title/preview match
  - Bulk mode enables multi-select with Select All/Delete
  - UserProfileArea renders at the bottom with logout
  - Navigation items: New chat, Projects, Artifacts, Customize
- Flaws:
  - [major] Claude shows a dedicated full-width "Chats" management view as a main content area with a search bar, "Select" link, and chronological list with "Last message X ago" timestamps per entry. Our ChatSidebar renders conversations in a 260px sidebar, not as a full-page view. There is no dedicated chats management page/route. @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:511
  - [major] Claude shows "Last message 15 hours ago", "Last message 2 days ago" as explicit timestamp text below each conversation title. Our SessionItem shows timestamps only on hover (`opacity-0 group-hover:opacity-100`) and uses compact format (15h, 2d) not "Last message X ago". @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:216-219
  - [major] Claude has a prominent search bar at the top of the chats view ("Search your chats...") with full-width input field. Our sidebar has a search icon button that is not functional (no search input field is rendered in expanded mode). @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:543-548
  - [minor] Claude shows "Your chats with Claude" + "Select" as inline text above the list. Our sidebar has bulk mode entry via a CheckSquare icon button, and the label text is "Recents" not "Your chats with Claude". @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:599-602
  - [minor] Claude's "+" button for new chat is in the top-right of the Chats header. Our "New chat" is a text button in the nav section, not in the header area. @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:565-572
  - [cosmetic] Claude sidebar nav shows "Code" as a nav item. Our sidebar shows "Customize" instead (which maps to Settings). No "Code" entry exists. @ apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:588-597
- Visual gaps:
  - No dedicated full-page chats management view (Claude shows it as main content, we only have sidebar)
  - Search bar is non-functional in expanded sidebar (icon only, no input)
  - Timestamps should always be visible below titles, not hover-only
  - Missing "Last message X ago" format -- using compact time format instead
  - Missing "Your chats with Claude" / "Select" header text pattern
  - Missing "Code" navigation item (we have "Customize" instead)

---

## Cross-Cutting Issues

### Critical (0)
None.

### Major (14 total across all images)

1. **No vertical connector line for sequential tool steps** -- Claude uses a continuous thin left line connecting all steps. Our ToolTimeline only shows connector lines for parallel groups. (IMG 02, 07, 10)
2. **Summary header uses computed action counts instead of descriptive integration names** -- Claude says "Used Filesystem Integration, loaded tools" while we say "listed files 4 times". (IMG 02, 08)
3. **Search results rendered as heavy bordered cards instead of compact flat list** -- Each result takes 3-4x more vertical space than Claude's compact rows. (IMG 06)
4. **Tool status summaries not interleaved within prose** -- Always appended after message content. (IMG 08)
5. **No AI-generated descriptive summary for tool batches** -- Only computed action counts. (IMG 08)
6. **Missing file-type icon badges** (HTML, JS, Script) in tool step badges. (IMG 07, 10)
7. **Missing filename pill/tag sub-badges** below tool step descriptions. (IMG 07, 10)
8. **No tabular data detection or smart formatting** for tool results. (IMG 214)
9. **No dedicated chats management view** -- only sidebar list. (IMG chats-history)
10. **Sidebar search is non-functional** -- icon button only, no search input. (IMG chats-history)
11. **Timestamps hidden by default** -- Claude always shows them. (IMG chats-history)
12. **Missing "Presented file" and "Done" auto-injected terminal steps**. (IMG 07, 10)
13. **Domain text positioned below title instead of inline-right**. (IMG 06)
14. **Search result count shown left instead of right-aligned at top**. (IMG 06)

### Minor (11 total)

1. Icon heuristic `inferKindFromLabel()` does not cover all Claude step names (IMG 02)
2. No "Done" step auto-injection in ToolTimeline (IMG 02, 07, 10)
3. Request/Response sections use separate scroll areas instead of unified panel (IMG 03)
4. Default visible search results count is 3 vs Claude's ~5-6 (IMG 06)
5. Favicon display size 20x20px vs Claude's smaller dots (IMG 06)
6. Compact summary text color may not match Claude's warm muted tone (IMG 08)
7. read/write/edit all map to same "F" badge letter, losing differentiation (IMG 10)
8. No auto-bridging from tool result data to table rendering (IMG 214)
9. "Recents" label instead of "Your chats with Claude" (IMG chats-history)
10. New chat button placement differs from Claude (IMG chats-history)
11. Missing "Code" nav item (IMG chats-history)

### Cosmetic (3 total)

1. Double-nested background in expanded ToolCallCard body (IMG 03)
2. Domain in emerald color correct but wrong position (IMG 06)
3. Missing "Code" sidebar nav -- have "Customize" instead (IMG chats-history)

---

## Priority Remediation Recommendations

1. **P0 -- Tool step vertical connector**: Add a continuous left border to sequential ToolTimeline steps (not just parallel groups). This is the most visible difference between our tool rendering and Claude's.

2. **P0 -- Compact search results**: Refactor InlineSearchResults to use a flat list layout (title + domain inline, no card borders) matching Claude's dense result display.

3. **P1 -- Interleave tool summaries in prose**: Requires splitting message content around tool invocations. This is an architectural change to MessageBubble's rendering pipeline.

4. **P1 -- Chats management view**: Create a `/chats` route with full-page chat history, search bar, and "Last message X ago" timestamps.

5. **P1 -- File-type badges and filename pills**: Extend InlineToolCall badge system to support file-type icons (HTML, JS, Script) and filename pill sub-labels.

6. **P2 -- Smart tabular rendering**: Add heuristic detection for arrays-of-objects in tool results and render as formatted tables.

7. **P2 -- Sidebar search**: Wire up the search icon to reveal an inline search input with filtering.
