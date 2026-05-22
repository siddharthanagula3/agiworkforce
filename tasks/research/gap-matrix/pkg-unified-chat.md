# Gap Matrix — `packages/unified-chat/` vs Anthropic Claude (web/desktop/mobile)

**Scope:** All 120 source files under `packages/unified-chat/src/` (75 components + 16 stores + 9 hooks + 10 lib modules + tests + styles).
**Reference:** `tasks/research/anthropic-claude-suite-may-2026.md` §1, §1.8, §1.9; deep-dives `m2-messages-attachments.md`, `c1..c4-components-chunk-*.md`, `ui-03-claude-artifacts.md`, `m5-screens-trio.md`.
**Counter-context:** This package targets a chat-app surface (the claude.ai web/Desktop equivalent), not a Code/CLI surface. Comparisons here are vs claude.ai web + Claude Desktop Chat tab. Code-tab features (parallel sessions, Git worktrees, file editor/diff) are out of scope for this package.

---

## Have

(One-line each — present in package.)

- `MessageBubble.tsx:410-515` — assistant/user bubbles with thinking, web-search, tool-call, citation, artifact-card, action-bar composition.
- `MessageBubble.tsx:107-348` — hand-rolled markdown renderer (fenced code, headings 1-6, ordered/unordered lists, tables, blockquotes, bold/italic/strikethrough/inline-code/links, ReDoS-hardened regex).
- `MessageBubble.tsx:35-41,300-319` — link-scheme allowlist `safeHref` blocking `javascript:`/`data:` against XSS.
- `MessageBubble.tsx:48-103` — `CodeBlock` with language label + copy button (no syntax highlighting).
- `MessageBubble.tsx:369-408` — inline `ToolCallRow` with `<details>` collapse + status pill (pending/running/completed/failed).
- `ThinkingBlock.tsx:1-265` — auto-compact >3 steps, expandable timeline, 11 step types (`thinking|reading|writing|terminal|search|link|complete|script|creating|tool|done`), elapsed-duration formatter.
- `ToolCallCard.tsx:1-254` — richer card with motion, MCP/Browser source-badge, live elapsed timer, collapsible Result/Error, status border colors.
- `ToolTimeline.tsx`, `TaskPhaseTimeline.tsx`, `TaskPhaseSection.tsx`, `SubtaskTimeline.tsx`, `AgentStepTimeline.tsx`, `ActionLogTimeline.tsx`, `StatusTrail.tsx` — agent-loop visualizers (port from UAC).
- `WebSearchCard.tsx:1-97` — collapsible search-result card with favicon + domain (≤5 visible).
- `CitationPill.tsx:1-52` — clickable source pill with truncated label + favicon + overflow `+N` count.
- `ArtifactPanel.tsx:1-378` — Preview/Code toggle, copy/download/publish dropdown, sandboxed iframe (`sandbox="allow-forms"`), SVG render via base64 `<img>`.
- `ArtifactRenderer.tsx:1-764` — typed sub-renderers: code, markdown, SVG (allow-list sanitizer at 162-201), Mermaid (lazy-import, strict security), HTML (CSP-injected sandbox iframe), JSON-table, React preview, spreadsheet, presentation. Native PDF/Word/Excel export hooks.
- `artifact-components/{ReactPreview,PresentationArtifact,SpreadsheetArtifact}.tsx` — React-in-iframe runner; markdown-deck slides; CSV grid.
- `ArtifactsSidebar.tsx:1-106` — 420px right-sidebar artifact viewer.
- `DownloadCard.tsx:1-97` — inline artifact download chip with type label (`Code · HTML`, `Document · Markdown`, `Code · React`).
- `ImageGenCard.tsx`, `VideoGenCard.tsx` — image/video generation cards with skeleton loader, progress bar.
- `ChatInput.tsx:1-329` — textarea autoresize, Enter-to-send/Shift+Enter newline, attached-files preview, `+` button, model selector chip, mic/stop button, voice dictation hook, agent-control row.
- `ChatInputToolbar.tsx:1-211` — model slot, thinking toggle, **incognito toggle**, auto/manual mode toggle, plan-mode toggle.
- `AttachmentMenu.tsx:1-328` — Plus-button popover with: Add files/photos, Take screenshot (via `getDisplayMedia`), Add to project (toast), Add from Google Drive/GitHub, Skills, Connectors, Research toggle, Web search toggle, Style submenu (Formal/Casual/Concise/Detailed).
- `AgentControl.tsx:1-394` — Mode chip (ask/auto/plan/bypass), Effort chip (low/medium/high/max — gated to providers with `supportsEffort`), Temp chip (temporary chat).
- `AgentModeSwitcher.tsx`, `AgenticLoopStatusBar.tsx`, `BriefStatus.tsx`, `CurrentActionBadge.tsx`, `BrowserActivityBadge.tsx` — status surfaces.
- `ModelSelector.tsx:1-675` — Popover with 13+ provider groups, `simple-icons` SVG logos, brand-color dot fallback, "Best (auto)" synthetic option, capability tier label, context-window pill, Pro+ provider-switch gate, thinking toggle inline on selected row, "Manage API Keys" footer.
- `Sidebar.tsx:1-284` — collapse/expand, New Chat/Search/Customize/Chats/Projects/Skills/Connectors nav items, scrollable recents grouped by `Pinned/Today/Yesterday/This Week/This Month/Older`, UserProfile pinned to bottom.
- `ConversationItem.tsx:1-61` — title row with active highlight, host-bridge `selectConversation`.
- `useVoiceInput.ts:1-96` — Web Speech API STT (`SpeechRecognition`/`webkitSpeechRecognition`, en-US, single-shot).
- `chatStore.ts:1-230` — Zustand+immer+persist (v2 schema migration `messages`→`messagesByConversation`); pin/archive/search; `activeMode` (`code|write|research|web|skills`); per-mode system prompt.
- `artifactStore.ts:1-135` — conversation-keyed artifact map, active artifact + viewMode, CRUD.
- `agentControlStore.ts` — three-tier agent control (project default → conversation override → global), source tag for "override" dot.
- `agentLoopStore.ts` — agent goal, action log, status, with selectors.
- `agentModeStore.ts`, `planModeStore.ts`, `mentionStore.ts`, `promptStashStore.ts`, `tierStore.ts`, `budgetStore.ts`, `checkpointStore.ts`, `modelStore.ts`, `projectStore.ts`, `settingsStore.ts`, `uiStore.ts` — full set.
- `tierStore.ts` + `ProPlusUpgradePrompt.tsx` — Pro+ tier gating for cross-provider mid-thread switch.
- `BudgetTracker.tsx`, `BudgetAlertsPanel.tsx`, `TokenCounter.tsx`, `UsageLimitBanner.tsx` — budget/limit surfaces (Phase A Slice 1).
- `CheckpointManager.tsx:1-460` + `BranchNavigator.tsx` + `RewindTimeline.tsx` — checkpoint CRUD, branch navigation, rewind timeline (Phase A Slice 3).
- `SidecarPanel.tsx:1-246` — generic sidecar shell with 30 panel types (terminal/browser/code/diff/canvas/computer-use/etc.), security badge, minimize/close.
- `SlashCommandMenu.tsx` + `lib/slashCommands.ts` — slash registry with 6 built-ins (`/rewind`, `/plan`, `/clear`, `/model`, `/memory`, `/help`); host-extensible.
- `SkillMentionPicker.tsx`, `FileMentionPicker.tsx` — `@skill` and `@file` autocomplete pickers (filterable, async file-search via `onSearch`, `MAX_RESULTS=8/12`).
- `PromptSuggestionsDropdown.tsx` — Gemini-CLI-style prompt continuation suggestions.
- `PromptStash.tsx` — bookmark-button save/restore prompts dropdown with `usePromptStashStore`.
- `KeyboardShortcutsDialog.tsx` + `KeyboardShortcutsOverlay.tsx` — shortcut help.
- `CommandPalette.tsx:1-261` — cmdk Cmd+K palette with New chat / Settings / Search / Toggle dark / Go to (chats/projects/skills/connectors).
- `ChatStream.tsx:1-465` — message virtualizer wrapper with auto-scroll, scroll-to-bottom FAB, **Cmd+F message search** with prev/next navigation + match-count, **j/k keyboard navigation** between messages, "Thinking..." / "Running..." indicators.
- `MessageList.tsx:1-176` — alt scroller with stick-to-bottom heuristic + unread badge ("New messages" pill at the bottom).
- `EmptyState.tsx`/`AdvancedEmptyState.tsx`/`BrandedGreeting.tsx` — three empty-state styles (greeting hero / minimal / branded).
- `ActionBar.tsx:1-91` — copy + thumbs-up/down + retry below the last assistant message.
- `runtime.ts:1-149` — `ChatRuntime` interface (sendMessage/stopGeneration/getMessages/createConversation/deleteConversation/listConversations/renameConversation/uploadFile/onStream); `StreamEvent` union (`content|thinking|tool_call|tool_result|artifact|search_results|done|error`); `StreamChunk` async-generator alt shape.
- `useChat.ts:1-421` — registers stream callback, builds full message history for multi-turn, **auto-routing classifier hook** (`buildRoutingDecision`).
- `lib/promptClassifier.ts` — classify-prompt → routing-decision (no LLM, regex/heuristic).
- `lib/connectorPermissionStore.ts` — connector-permission cache.
- `hooks/useHostBridgeSync.ts` + `lib/hostBridge.ts` — host-bridge for desktop/web wiring.

---

## Partial

### Markdown rendering — gaps vs Anthropic web

`MessageBubble.tsx:107-348` ships an in-house, dependency-free markdown renderer. It handles the common cases but is a deliberate subset of the GFM dialect Anthropic web ships (`apps/web/features/chat/components/messages/MessageBubble.tsx` uses `react-markdown + remark-gfm + remark-math + remark-breaks + rehype-highlight + rehype-raw` per `MEMORY.md` web-chat status). Specific gaps:

- **No syntax highlighting.** `CodeBlock` (`MessageBubble.tsx:48-103`) renders monochrome `<pre><code>{code}</code></pre>`. No `highlight.js`, `prism`, or `shiki`. Anthropic web uses `rehype-highlight`. Gap = **medium**; fix is one peer dep (~20 KB) + reading the language label that's already extracted.
- **No KaTeX/MathJax.** No `$inline$` or `$$display$$` math. Anthropic Settings → General has a "Latex render toggle" (suite §1.2). Gap = **medium**; needs `remark-math` + `rehype-katex` (or peer DOMPurify).
- **No GFM task-list checkboxes** (`- [ ]`/`- [x]`). The unordered-list path treats them as plain text.
- **No autolinks.** Bare `https://...` outside `[…](…)` won't become `<a>`. Anthropic web does autolink.
- **No emoji shortcodes** (`:smile:`).
- **No nested-list indentation tracking.** The `flushList` collapses every contiguous `- ` line into a single flat list.
- **No HTML-in-markdown.** `rehype-raw` on web preserves inline `<br>`, `<sub>`, etc. We don't.
- **No footnote definitions** (`[^1]: …`).

Effort: **3–4 days** to swap in `react-markdown + remark-gfm + remark-math + remark-breaks + rehype-highlight + rehype-katex` and replace the regex renderer. Risk: re-running existing `MessageBubble.test.tsx` snapshots; preserving `safeHref` link-scheme allowlist via custom `components.a`.

### Tool-result rendering — collapsed-by-default group header missing

`ui-03-claude-artifacts.md:21-31` documents Anthropic's canonical inline pattern: a single line **"Used Filesystem integration, loaded tools v"** or **"Ran 5 commands, created a file, read a file v"** as a _grouped_ summary that hides sub-steps until expanded. We render every tool call as its own card (`ToolCallCard.tsx`) or row (`MessageBubble.tsx:489-495`) — never grouped at the assistant-turn level.

- **Missing group-header chevron** above stacked tool calls.
- **Missing past-tense, comma-separated summary** copy ("Ran 5 commands, created a file, read a file").
- **Default collapsed state is wrong.** Our `<details>` defaults to closed for the tool _result_, but the _card itself_ is always expanded — Claude collapses everything behind the chevron.
- **Request/Response two-section panel missing.** Claude expands a tool to show `Request` + `Response` headers (`ui-03-claude-artifacts.md:55-74`); we show `args` JSON above the result with no headers.
- **Per-tool-source badge** ✓ partial — we have MCP/Browser badges (`ToolCallCard.tsx:25-65`), but not "Filesystem integration", "Web search", "Code execution" labels keyed to Anthropic's published catalog.

Effort: **2 days** to add a `ToolCallGroup` that aggregates `message.toolCalls` into one collapsed summary line by default + restructure the expanded panel into Request/Response sections.

### Artifact pane — close to spec but missing version tabs + persistent storage features

`ArtifactPanel.tsx` + `ArtifactsSidebar.tsx` cover most of suite §1.9:

- ✓ Preview/Code toggle.
- ✓ Copy / Download / Publish (no-op stub).
- ✓ Sandboxed iframe for HTML/React.
- ✓ Native export hooks (PDF/Word/Excel) via `onExportNative` prop.
- ✓ ReactPreview, SpreadsheetArtifact, PresentationArtifact, MermaidArtifact, SvgArtifact.

Gaps:

- **No multi-version tabs.** Suite §1.9 last paragraph: "when multiple artifacts exist in a chat, the right pane shows tabs with version arrows". Our `ArtifactsSidebar.tsx:42-105` shows only the active artifact via `selectActiveArtifact`. The store keeps an array per conversation but there's no tab UI or `‹ ›` version arrow.
- **Publish is a no-op.** `ArtifactPanel.tsx:225-227` `handlePublish` is `// no-op for now`. Anthropic published-artifact features (suite §1.9): persistent storage 20 MB per artifact, public link, embed code with allowed-domains list, direct API calls, Live Artifacts (auto-refresh against MCP), MCP-connected artifacts (Asana/Calendar/Slack).
- **No versioning model.** `Artifact` type (in `@agiworkforce/types`) has `id`, `title`, `content`, `type`, `language` but no `version` / `parentArtifactId` / `lineage`.
- **No "Open in Comet"** chip we observed in Claude (image `12` in `ui-03`).

Effort: **5 days** for tabs + version arrows + minimal publish stub; **2-3 weeks** for the full Live Artifacts + MCP-connected + persistent-storage suite (server-side work, not in this package).

### Streaming protocol — discriminated union present, missing Anthropic-API wire shape

`runtime.ts:132-148` defines `StreamEvent` with 8 variants (`content|thinking|tool_call|tool_result|artifact|search_results|done|error`). This matches our internal protocol but does **not** mirror the Anthropic SSE event taxonomy that `m2-messages-attachments.md:43-44` documents:

- Anthropic emits `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`, plus deltas of types `text_delta`, `input_json_delta`, `thinking_delta`, `signature_delta`.
- Anthropic content blocks include `text`, `thinking`, `redacted_thinking`, `tool_use`, `server_tool_use`, `tool_result`, `mcp_tool_use`, `mcp_tool_result`, `web_search_tool_result`, `web_fetch_tool_result`, `code_execution_tool_result`, `bash_code_execution_tool_result`, `text_editor_code_execution_tool_result`, `tool_search_tool_result`, `compaction`, `container_upload`, `connector_text`, `advisor_tool_result`. We collapse all into `tool_call` + `tool_result`.
- We model `thinking` as a single string but Anthropic blocks carry a `signature_delta` for cryptographic signatures; we drop signatures (`useChat.ts:92-150` only stores `content`).

Implication: **cross-provider session continuity** (the locked differentiator) won't survive an Anthropic→OpenAI→Anthropic round-trip if the user resumes a conversation containing `redacted_thinking` or `code_execution_tool_result` blocks — we have no place to put them. This is largely a `packages/llm-normalize/` problem, but it surfaces here as **schema gap** in `ChatMessage` (`lib/types.ts:25-46`) which has flat `thinking: string`, `toolCalls: ToolCall[]`, `webSearchResults: WebSearchResult[]` — not the Anthropic-style `content: ContentBlock[]`.

Effort: **1 week** to introduce a discriminated `ContentBlock` union mirroring Anthropic's, with a backwards-compatibility shim that flattens to the current shape for components that haven't migrated.

### Composer / @-mentions / slash commands

✓ Slash menu (`SlashCommandMenu.tsx`) and registry (`slashCommands.ts`) with 6 built-ins.
✓ `@file` and `@skill` mention pickers.
✓ Prompt-suggestions dropdown (Tab to accept).
✓ Voice dictation (Web Speech API).
✓ Style submenu (Formal/Casual/Concise/Detailed).
✓ Plus-menu Connectors / Skills / Web search / Research toggles.

Gaps:

- **`@agent` / `@agent-<type>` mentions missing.** Suite §5.7 + `m2-messages-attachments.md:94-95` document `@agent-asana:project-status-updater` style — we have skill but not agent picker.
- **`@server:resource` MCP-resource mentions missing.** `m2:94-95` notes MCP resources resolve via `client.readResource()`. We have `connectorPermissionStore` but no `@<server>:<uri>` autocomplete picker.
- **No quoted-path syntax.** `@"with spaces.txt"` isn't tokenized by `FileMentionPicker.tsx`.
- **No `#L10-20` line-range syntax** that Claude Code IDE plugins emit.
- **Slash registry only has 6 commands** vs Anthropic's "60+ built-ins" (suite §5.2). Missing: `/help`, `/clear` ✓, `/compact`, `/rewind` ✓, `/fork`, `/resume`, `/continue`, `/rename`, `/desktop`, `/exit`, `/effort`, `/fast`, `/auto-mode`, `/sandbox`, `/output-style`, `/keybindings`, `/color`, `/btw`, `/mcp`, `/plugins`, `/agents`, `/skills`, `/hooks`, `/init`, `/team-onboarding`, `/security-review`, `/loop`, `/simplify`, `/debug`, `/batch`, `/claude-api`, `/status`, `/usage`, `/cost`, `/context`, `/doctor`. (Many of these are CLI-only; web Chat tab gets a smaller subset, but the count is closer to ~10–15.)
- **Style picker present in AttachmentMenu but missing user-authored custom styles.** Suite §1.1 says Anthropic exposes "Normal, Concise, Explanatory, Formal, and any user-authored custom Style". We have 4 builtins + no custom-style CRUD.
- **No keyboard shortcut to type `/`** — Anthropic web treats `/` and `+`-button click as opening the same menu. We open AttachmentMenu only via `+`-click, and SlashCommandMenu only when user types `/` at start of textarea (slash detection is host-driven via `parseSlashCommand`).

Effort: **2 days** for `@agent` + `@server:` pickers; **1 day** for quoted-path + line-range; **2 days** to expand slash registry to ~15 web-relevant commands; **3 days** for custom-style CRUD.

### Search — Cmd+F in ChatStream is good; sidebar conversation search is partial

✓ `ChatStream.tsx:130-186` — Cmd+F message search with prev/next navigation, match count, ring-highlight on current match.
✓ `chatStore.ts:148, 174-195` — `searchQuery` filters conversations in sidebar.

Gaps:

- **No global search modal** — `useUIStore.toggleSearchModal()` is referenced in `Sidebar.tsx:48,85` and `CommandPalette.tsx:71` but the **component is not exported from this package**. `ChatInterface.tsx:97-100` declares `SearchOverlayProps` for a modal but the file may not implement it (we read line 1-100; would need full read).
- **Search is title-only** (`chatStore.ts:177-178`). Anthropic offers full-text body search behind the `chatSearch` toggle (suite §1.2 "Capabilities" tab includes "Chat search toggle"). We don't index message bodies.
- **No search-result preview snippets**.
- **No filter chips** (date range, model, project, has-attachment).

Effort: **1 day** to expose a global search modal; **3-5 days** for full-text indexing (likely host-side work — depends on how the package surfaces an `IndexAdapter`).

### Conversation history & sidebar

✓ `Sidebar.tsx` covers New Chat / Search / Customize / Chats / Projects / Skills / Connectors.
✓ Temporal grouping (Pinned, Today, Yesterday, This Week, This Month, Older).
✓ Pin/Archive store actions.
✓ UserProfile pinned to bottom.

Gaps:

- **No "Artifacts" sidebar entry** — Suite §1.1 says Anthropic shows "Chats, Projects, Artifacts space, Customize". Our nav has no Artifacts entry; artifacts surface only via right-sidebar viewer.
- **No projects detail view.** `useUIStore.activeView` knows `'projects' | 'project-detail'` but no `ProjectDetail.tsx` exists in the package.
- **No drag-to-reorder pinned items.**
- **No right-click context menu on conversation items** (Rename / Pin / Archive / Delete / Move to project / Share).
- **No `ConversationItem` archive toggle UI.** Store has `archiveConversation` but the row component (`ConversationItem.tsx:1-61`) doesn't expose it.
- **No bulk select** for archive/delete.
- **No "Customize" panel** — sidebar fires `chat:action` event with `tab: 'mcp-skills'` but no in-package Customize component.

Effort: **3-4 days** to add Artifacts gallery view + project detail view + context menu + archive UI.

### Markdown code blocks

✓ Fenced code with language label and copy button.
✓ Monochrome typesetting matches the Anthropic-cream aesthetic for prose `ui-03:139-149` (we go further by adding language label which Anthropic itself doesn't show inline).

Gaps:

- **No syntax highlighting** (covered above).
- **No "Open in editor" / "Apply to file" button** in chat-bubble code blocks. `ArtifactRenderer.tsx:585-597` exposes Apply-to-file for _artifacts_, not for inline `<CodeBlock>`.
- **No streaming line-by-line render.** Streaming code today appends a character at a time to the same `<code>` blob; Anthropic web (and Claude Desktop) render line-by-line with a "currently streaming" indicator on the trailing line.
- **No line numbers** in chat code blocks (artifact CodeView has them; chat does not).

Effort: **1 day** to add line numbers + 2 days to add streaming-line indicator.

### Diff view

`SidecarPanel.tsx:55-67` declares `'diff'` as a `SidecarPanelType` and the icon map (`SidecarPanel.tsx:117`) maps it to a generic `<FileText>` icon. **There is no diff renderer in the package.** No `DiffView.tsx`, no `git-diff` parser, no red/green hunks, no `diff2html`/`react-diff-view` peer dep, no side-by-side mode.

`ui-03-claude-artifacts.md:76-83` notes Anthropic's chat surface itself **does not show inline diffs** ("conclusion: Claude.ai's chat UX as captured here treats writes/edits as opaque 'I wrote a file' events, not as inline diffs"). So diff is _not_ a parity gap with Anthropic chat — but Anthropic Code-tab + CLI render diffs (suite §4.2 — "diff view (red/green inline)"), and `ui-03:84` flags this as a place "AGI Workforce should _exceed_ Claude.ai. If we ship inline red/green hunks with Apply/Reject in chat, we beat them on a feature they don't render at all."

Status: **Missing entirely**. Effort: **3-5 days** for unified-diff parser + side-by-side renderer + Apply/Reject hooks (delegate file-write to host via `onApplyHunk`).

### Citations — we have pills, not Anthropic-style numbered footnotes

✓ `CitationPill.tsx` renders an inline pill with favicon + truncated label + overflow `+N`.

Gaps:

- **No numbered footnote markers in prose.** Suite §1.8: "Inline citation chips with hover preview; numbered footnotes underneath the answer". `MessageBubble.tsx:480-487` renders citations _as a flat row at the bottom_ of the assistant message — not inline `[1]` superscripts in the prose body.
- **No hover preview on the pill** — currently `title=` browser tooltip only; Anthropic shows a rich card with title, snippet, domain, "Open" button on hover.
- **No grouped-domain de-dup.** `CitationPill.additionalCount` field exists in the type (`lib/types.ts:58`) but no UI logic groups citations by domain.
- **No citation-source mapping back to text spans.** `Citation` type has no `startOffset`/`endOffset` to link prose to source.

Effort: **3 days** to add `[N]` superscripts + hover-card + offset-mapped highlighting (host runtime needs to emit offsets).

### Image attachments — upload yes, paste/drag/extraction no

✓ `ChatInput.tsx:229-242` — file `<input type="file" multiple accept="image/*,..." />` with chip preview.
✓ `AttachmentMenu.tsx:120-164` — `Take a screenshot` via `getDisplayMedia`.
✓ `runtime.ts:50` — `uploadFile(file)` interface.

Gaps:

- **No drag-and-drop onto the composer.** No `onDrop`/`onDragOver` handlers anywhere. `grep -rE "onDrop|onDragOver"` returned no matches.
- **No paste-image handler.** `m2-messages-attachments.md:67-73` documents Anthropic's image-paste pipeline (`pastedContents`, `imagePasteId`, `buildImageContentBlocks`, `maybeResizeAndDownsampleImageBlock` with progressive ladder format-preserve→palette-quantize→progressive-resize→JPEG-fallback). We have none of this.
- **No client-side resize/downsample.** Anthropic enforces 2000×2000 px / 3.75 MB cap (`apiLimits.ts:42-43`); we send raw bytes.
- **No image preview thumbnail in chip** — the chip shows only filename (`ChatInput.tsx:188-204`); Anthropic shows a 64×64 thumbnail.
- **No PDF page-extraction path.** Suite §1.3 + `m2:75-83` document three PDF paths (Inline ≤10 pages, Reference 10–100 pages, Page-extracted >3 MB). Our `accept` MIME list (`ChatInput.tsx:234`) accepts `.pdf` but the runtime is opaque to us.
- **No image annotation / crop tools.**
- **No camera capture on mobile.** Suite §6.1 documents camera + photo library + voice + connectors in mobile composer; this package doesn't expose `accept="image/*;capture=environment"`.

Effort: **2 days** for drag-drop + paste; **3 days** for client-side resize ladder (port `m2:67-73` heuristics); **2 days** for thumbnail chip; **1 day** for camera capture attribute.

### Voice — STT only, no TTS / full-duplex voice mode

✓ `useVoiceInput.ts` — Web Speech API STT, en-US, single-shot dictation.
✓ `cleanupVoiceDictation` + `detectVoiceCommand` from `@agiworkforce/utils` (`ChatInput.tsx:81-92`).

Gaps:

- **No full-duplex voice mode.** Suite §1.1 describes a sound-wave icon that opens a "spoken voice mode" with multiple voices (mobile §6.2). We only have a microphone-icon for STT input; clicking it transcribes once, sends nothing.
- **No TTS** for assistant responses.
- **No interim-results transcript bubble.** `useVoiceInput.ts:60` sets `interimResults = false`.
- **No Voice mode preferences** UI (suite §1.2 Capabilities tab).

Effort: **1 week** for full-duplex voice (Web Audio + Realtime API streaming + barge-in + visual-waveform).

### Settings modal

`SettingsModal.tsx:1-22` is a stub — it dispatches `chat:action` with `tab: settingsTab || 'general'` and closes itself. The actual settings UI is host-side. So this is intentionally lightweight; it doesn't ship the 9-tab settings panel suite §1.2 documents (General / Appearance / Account / Privacy / Billing / Usage / Capabilities / Connectors / Profile / Personalization).

Status: **By design — host renders the settings UI.** Not a gap if the host (web/desktop) ships it. Verified for Web in `MEMORY.md` web-chat status.

---

## Missing

### Message schema

- **No `ContentBlock` discriminated union.** `ChatMessage` (`lib/types.ts:25-46`) has flat `content: string`, `thinking?: string`, `toolCalls?: ToolCall[]`, `webSearchResults?: WebSearchResult[]`. Anthropic's wire shape is `content: ContentBlock[]` per `m2:14-22`. Cross-provider continuity is at risk for `redacted_thinking`, `signature_delta`, `mcp_tool_result`, `code_execution_tool_result`.
- **No `imagePasteIds`** envelope field for correlating composer paste UI to message blocks (`m2:71`).
- **No `isMeta`/`isVirtual`/`isVisibleInTranscriptOnly`/`isCompactSummary`** message flags. We can't distinguish synthetic system reminders from real prose. Implications for `<system-reminder>` smooshing (`m2:65`).
- **No `usage` block.** Anthropic carries `{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, server_tool_use.{web_search_requests, web_fetch_requests}, service_tier, cache_creation.*}`. Without it we can't show prompt-cache hit rate, cost, or per-message tier.
- **No `stop_reason`/`stop_sequence`/`container`/`context_management`** envelope. We can't display "Cap reached → click to continue" hints.
- **No `SystemMessage` subtype model.** Anthropic ships `informational | compact_boundary | microcompact_boundary | local_command | api_error | api_metrics | agents_killed | away_summary | bridge_status | memory_saved | permission_retry | scheduled_task_fire | stop_hook_summary | turn_duration` (`m2:20-21`).
- **No `SYNTHETIC_MODEL` marker** + no submission-time gate to prevent synthetic-tool-result placeholders being sent upstream (`m2:18`).

### Tool-result rendering

- **No grouped tool-call summary header** ("Used Filesystem integration, loaded tools v") — `ui-03:21-31`.
- **No Request/Response two-section panel** in expanded tool view (`ui-03:55-74`).
- **No `tool_use ↔ tool_result` pairing enforcer** in the package (the `m2:24-39` `ensureToolResultPairing` invariant must live in `packages/llm-normalize/`, but the _display_ must respect orphan/missing markers; we don't render any).
- **No `tool_search_tool_result`, `code_execution_tool_result`, `bash_code_execution_tool_result`, `text_editor_code_execution_tool_result`, `compaction`, `connector_text`, `advisor_tool_result`** typed renderers.
- **No "Always-allow for project" / "Allow for this session" / "Deny" approval-prompt UX** (suite §3.2 documents 5 variants).
- **No streaming `input_json_delta` accumulation visualization** ("Tool args being typed live" indicator).

### Artifact pane

- **No version tabs / `‹ ›` arrows** when multiple artifacts coexist.
- **No publish flow** (URL minting, allowed-domains list, embed code).
- **No persistent-storage indicator** (suite §1.9: 20 MB per artifact).
- **No "Direct API calls" for artifacts** (artifact-side billing meter).
- **No Live Artifacts** (auto-refresh against MCP).
- **No MCP-connected artifacts** (Asana / Calendar / Slack interactive blocks).
- **No `unpublish` UI** (suite §1.7: "Once unpublished, an artifact cannot be republished").

### Reasoning blocks

- **No `redacted_thinking` block type** (`m2:14, 16`) — model emits these when the session is incognito or when guardrails truncate; we'd render them as missing thinking.
- **No `signature_delta` storage** — required for resuming a thinking block with a different API key (`m2:5066-5099`).
- **No `effort` rendering** in the thinking header (the thinking block knows it ran but not how hard — we have `durationMs` but not `effort: 'low|medium|high|max'`).
- **No "skipped — too long" or "redacted by safety classifier" affordance.**
- **No "thinking budget remaining"** progress bar.

### Streaming protocol

- **No `message_start` / `message_stop` / `content_block_start` / `content_block_stop` / `message_delta`** wire-event taxonomy. Our `StreamEvent` is internal and doesn't surface block boundaries.
- **No `ttftMs`** (time-to-first-token) capture.
- **No "atomic switch"** trick (`m2:45-46`) to swap streaming-text→persisted-message in one render batch — we just append until `done`. Susceptible to flicker.
- **No `tombstone` envelope** for removing optimistic in-flight messages (used when generation aborts mid-stream).
- **No `tool_use_summary`** human-readable progress envelope (`m2:43`).

### Composer

- **No PDF page-extracted path** UI (drop-down letting user pick page range).
- **No screenshot-region-select.** `getDisplayMedia` captures a whole display; Anthropic doesn't either (corpus gap), but selection would be a polish win.
- **No `@quoted` and `@file#L10-20`** mention syntax.
- **No `@agent-<type>`** mention picker.
- **No `@server:resource`** MCP-resource mention picker.
- **No "context-window remaining" indicator** in the composer footer.
- **No `Cmd+Enter` to submit** (we only handle `Enter` — `ChatInput.tsx:163`).
- **No "shift the composer up when keyboard opens"** mobile behavior.
- **No prompt history navigation** (Up/Down arrow to recall previous prompts when textarea empty).
- **No multi-file `accept` MIME for video/audio.** Current `accept` (`ChatInput.tsx:234`) is `image/* + .pdf,.txt,.md,.csv,.json,.{js,ts,py,rs,go,java,html,css}` — no `audio/*`, `video/*`, `.docx`, `.pptx`, `.xlsx`. Suite §1.3 says claude.ai accepts 30 MB / file with PDF/Word/Excel/PowerPoint full support.

### Slash commands

- See Partial above. Need ~10 more (`/compact`, `/fork`, `/resume`, `/effort`, `/output-style`, `/mcp`, `/agents`, `/skills`, `/init`, `/team-onboarding`).

### @-mentions

- See Composer.

### Image attachment pipeline

- See Partial above. Largest gap: **drag-drop + paste-image + client-side resize ladder + thumbnail chip**.

### Voice

- See Partial — no TTS, no full-duplex, no interim transcripts, no voice preferences.

### Markdown rendering

- See Partial — KaTeX/highlighting/footnotes/autolinks/checkboxes/HTML-in-MD missing.

### Code blocks

- Line numbers in chat (artifact has them; chat does not).
- Streaming-line indicator.
- Per-language icon (Python snake / Rust crab / etc.).

### Diff view

- **Missing entirely.** Sidecar declares the type but no renderer exists.

### Citations

- See Partial — numbered superscripts, hover-card, domain grouping, offset-spans missing.

### Conversation history

- **No archive UI** in `ConversationItem`.
- **No share dialog** ("Share to org" / "Publish").
- **No conversation export** (markdown / JSON download).
- **No bulk select.**
- **No "move to project" gesture.**
- **No "rename inline" input** (just title display).
- **No timestamps on conversation rows** (sidebar shows only title).
- **No unread / has-error / has-pending-approval indicators** on rows.
- **No conversation-color-coding** by mode.

### Sidebar

- **No Artifacts gallery entry.**
- **No Memory entry.** Suite §1.6 makes Memory a Settings → Capabilities toggle, but the import-memory CTA / "X memories saved" badge are first-class on Anthropic.
- **No Health connector entry** (mobile-only on Anthropic — irrelevant to this package, but flagging for completeness).
- **No "What's new"** drawer.
- **No org/team switcher.**
- **No "Sign out from CLI" affordance.**

### Search

- **No global search modal component exported.**
- **No body-text search.**
- **No filter chips.**

### Other

- **No "Incognito mode" entry-point UI.** `ChatInputToolbar.tsx:147-164` has the toggle but the host must wire `onIncognitoToggle`. There's no `Cmd+Shift+I` shortcut, no `Incognito` badge in `ConversationHeader`, no purple banner across the chat surface.
- **No "Ask before acting" / "Act without asking" mode picker** (Suite §7.3 — Chrome-extension specific, so likely out-of-scope for this package).
- **No Style picker on the Settings panel.** `AttachmentMenu` has it but the persisted, account-wide Style is a Settings concern.
- **No Memory viewer** (`/memory` slash registers a `openMemoryView` host hook but no in-package implementation).
- **No "Model usage / cost" footer** (`TokenCounter.tsx` is a component but not wired into a session-wide footer that mirrors Anthropic's per-conversation token bar).
- **No "Connector permissions" UI** — the `connectorPermissionStore` exists but no `ConnectorPermissions.tsx`.
- **No "Retry with different model" affordance.** `ActionBar.tsx:84-89` has a Retry button but doesn't show a model picker — it just calls `onRetry(messageId)`. Anthropic web shows a "Try again with…" submenu.

---

## Per-axis percentage

| Axis           | Have                                                                                                                                                                                 | Partial                                                                              | Missing                                                                                                  | Score    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------- |
| Message-schema | flat `ChatMessage`, citations, tool calls, artifacts, attachments, web-search results, thinkingBlock                                                                                 | no `ContentBlock[]` union; no `usage`/`stop_reason`/`isMeta`; no `redacted_thinking` | no SystemMessage subtype; no signature/cache-block                                                       | **35 %** |
| Tool-rendering | `ToolCallCard`, `ToolCallRow`, badges, status pills, MCP/Browser source                                                                                                              | grouped-summary header, Request/Response panel                                       | approval prompts, `tool_use_summary`, server-tool blocks, pairing-enforcer hooks, allow-for-project flow | **45 %** |
| Artifact       | full `ArtifactRenderer` (10+ types), Mermaid, ReactPreview, sidebar viewer, native exports, copy/download/publish-stub, dropdown menu                                                | publish is no-op; one-at-a-time                                                      | version tabs, persistent storage, MCP-connected, Live Artifacts, embed code, share-link                  | **65 %** |
| Composer       | textarea, +-menu, model selector, agent control, voice STT, slash menu, mention pickers, prompt-stash, prompt-suggestions, screenshot, attachment chips, plan/incognito/auto toggles | drag-drop, paste, resize, thumbnails, agent/MCP-resource mentions                    | line-range syntax, history nav, audio/video/docx accept, mobile camera capture, region-select            | **60 %** |
| Streaming      | discriminated `StreamEvent` union, host-bridge wiring, `useChat` callback, artifact accumulation, search-results events                                                              | matches our internal protocol but not Anthropic SSE shape                            | block_start/stop/delta granularity, ttftMs, tombstone, tool_use_summary, atomic-switch flicker fix       | **40 %** |
| Markdown       | hand-rolled renderer (code/headings/lists/tables/blockquotes/inline marks), ReDoS-hardened, link-scheme allowlist                                                                    | no GFM lib, no syntax highlighting, no math                                          | KaTeX, autolinks, task-checkboxes, footnotes, HTML-in-MD, emoji shortcodes, nested lists                 | **50 %** |
| Diff           | sidecar type declared (`'diff'`)                                                                                                                                                     | nothing else                                                                         | no renderer, no parser, no Apply/Reject, no side-by-side, no language-aware                              | **5 %**  |
| Citations      | `CitationPill`, favicon, domain, additionalCount field                                                                                                                               | flat row, no inline `[N]` markers                                                    | hover-card, span-mapping, grouped-by-domain dedup, alpine view at bottom                                 | **35 %** |
| Search         | Cmd+F message search with prev/next/match-count, j/k nav, sidebar conversation title-search                                                                                          | no exported modal; title-only                                                        | full-text, filters, snippets, search-history, search-result-jump                                         | **40 %** |
| Sidebar        | collapsible, 7 nav items, temporal grouping (6 buckets), pin/archive store, UserProfile, host-bridge integration                                                                     | no Artifacts/Memory entry, no detail view for projects                               | context menu, bulk actions, share, export, color-code, timestamps, unread indicators, org/team switcher  | **55 %** |

**Weighted average (equal weights):** ≈ **43 %**.

---

## Surface percentage (this package)

`packages/unified-chat/` covers roughly **45 % of the Anthropic claude.ai web Chat surface**. Strengths: provider-rich model selector (we beat Anthropic on the **13+ Providers** badge), agent-control row (Mode/Effort/Temp), sidecar shell, agent-loop visualizers, checkpoint/branch/rewind, and the artifact renderer's typed sub-renderers (Mermaid + React + Spreadsheet + Presentation).

Weakest areas (in priority order):

1. **Diff renderer (5 %)** — must ship to leverage the `ui-03:84` opportunity to _exceed_ Claude.
2. **Message schema (35 %)** — flat shape blocks Anthropic-compliant cross-provider continuity.
3. **Citations (35 %)** — pills exist but no inline footnotes / hover preview / span mapping.
4. **Streaming protocol (40 %)** — collapses block taxonomy; risks data loss on resume.
5. **Search (40 %)** — title-only sidebar search; no full-text.
6. **Tool-rendering (45 %)** — no grouped-summary chevron, no Request/Response panels, no server-tool blocks.

Strongest area: **Artifact (65 %)** — the renderer covers 10 types and matches the desktop UAC port; only versioning and publish stand between us and parity.

---

## Effort to reach 100 % (days)

Conservative engineering estimate, parallelizable across 2 engineers. Days are **engineer-days** of focused IC work, excluding review and shake-out.

| Workstream                                                                                                                               | Days           | Notes                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| Message schema migration to `ContentBlock[]` discriminated union                                                                         | **5**          | Backwards-compat shim flattens to current shape until consumers migrate.                 |
| `SystemMessage` subtype + `usage` + `stop_reason` envelope                                                                               | **3**          | Mostly type plumbing; UI consumer can lag.                                               |
| Tool-call group header + Request/Response panel + 4 missing server-tool renderers                                                        | **5**          | Mostly Tailwind + state machine; pairing-enforcer hook is a separate `llm-normalize` PR. |
| `redacted_thinking` + signature persistence + thinking effort badge                                                                      | **3**          | Storage-layer is small; rendering is one branch in `ThinkingBlock`.                      |
| Stream taxonomy: `message_start`/`block_start`/`tombstone`/`tool_use_summary` + `ttftMs` capture                                         | **4**          | Touches `runtime.ts` + `useChat.ts`.                                                     |
| Markdown: swap to `react-markdown + remark-gfm + remark-math + remark-breaks + rehype-highlight + rehype-katex`                          | **4**          | Includes preserving `safeHref` allowlist; re-snapshot tests.                             |
| Code-block: line numbers + streaming-line indicator                                                                                      | **2**          |                                                                                          |
| Diff renderer (unified-diff parser + side-by-side + Apply/Reject)                                                                        | **5**          |                                                                                          |
| Citations: inline `[N]` superscripts + hover-card + span-mapping + grouped dedup                                                         | **4**          | Runtime must emit offsets — coordinate with `packages/api`.                              |
| Search: global modal + full-text body indexing (delegate to host adapter)                                                                | **5**          | Filter chips + snippet preview.                                                          |
| Composer: drag-drop + paste + client-side resize ladder + thumbnail chip                                                                 | **5**          | Direct port of `m2:67-73` heuristics.                                                    |
| Composer: `@agent` + `@server:` mention pickers + line-range/quoted-path syntax                                                          | **3**          |                                                                                          |
| Composer: prompt-history nav + audio/video accept + mobile camera capture + Cmd+Enter                                                    | **2**          |                                                                                          |
| Slash registry: 10 additional commands (`/compact`, `/fork`, `/resume`, `/effort`, …)                                                    | **2**          |                                                                                          |
| Sidebar: Artifacts gallery view + Project detail view + context menu + archive UI + bulk actions                                         | **5**          |                                                                                          |
| Sidebar: row timestamps + indicators (unread/error/pending) + share/export/move                                                          | **3**          |                                                                                          |
| Conversation rename inline + share dialog + conversation export                                                                          | **2**          |                                                                                          |
| Voice: full-duplex mode (Web Audio + Realtime API + barge-in + waveform)                                                                 | **7**          | Major new feature; depends on host runtime.                                              |
| Voice: TTS + interim transcripts + voice preferences UI                                                                                  | **3**          |                                                                                          |
| Artifact: version tabs + `‹ ›` arrows + tab UI in `ArtifactsSidebar`                                                                     | **3**          |                                                                                          |
| Artifact: publish/unpublish flow + persistent-storage indicator + embed code                                                             | **5**          | Server-side scope, but UI is here.                                                       |
| Artifact: Live Artifacts + MCP-connected blocks (Asana/Calendar/Slack)                                                                   | **8**          | Largely interactive-MCP work; UI is the hookpoint.                                       |
| Approval prompt UX (5 variants from suite §3.2)                                                                                          | **3**          |                                                                                          |
| Settings tabs (10): General, Appearance, Account, Privacy, Billing, Usage, Capabilities, Connectors, Profile, Personalization            | **8**          | Currently host-rendered; if package owns it, big lift.                                   |
| Polish: numbered footnotes, retry-with-different-model menu, `Cmd+Shift+I` incognito shortcut + banner, "Customize" panel, Memory viewer | **3**          |                                                                                          |
| Test backfill (snapshot + a11y + integration for new components)                                                                         | **5**          |                                                                                          |
| **TOTAL**                                                                                                                                | **≈ 102 days** | ≈ **5 calendar months for one engineer** or **2.5 months for two** with parallelism.     |

A pragmatic **80 % MVP** (close all P0 / common-path gaps but skip Live-Artifacts, full-duplex voice, persistent-storage, settings-tabs-in-package) is **~55 engineer-days** ≈ **2.5 months for one engineer**.

---

_Authored 2026-05-08 by GAP-PKG-UNIFIED. File-cited evidence from `packages/unified-chat/src/` files; Anthropic feature inventory from `tasks/research/anthropic-claude-suite-may-2026.md` (May 2026 snapshot)._
