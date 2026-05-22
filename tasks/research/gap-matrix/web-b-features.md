# GAP-WEB-B — `apps/web/features/` (chat surface + workflows) vs claude.ai chat

> **Scope.** 232 `.tsx`/`.ts` files under `apps/web/features/{chat,connectors,projects,billing,settings,schedules,teams,analytics,media,support,pages}`. **Heavy chat focus** — `apps/web/features/chat/` is 162 files (the active web chat per CLAUDE.md). All citations are absolute paths with line numbers. Reference baselines: `tasks/research/anthropic-claude-suite-may-2026.md` §1.1–§1.10 (claude.ai), §1.8 tool-use rendering, §1.9 artifacts, §E.1 Skills, §E.2 Memory, §E.3 Projects, §E.4 Connectors; `tasks/research/ui-03-claude-artifacts.md` (27-screenshot Claude chat surface teardown); `tasks/research/ui-07-chatgpt-gemini.md` (composer-as-everything pattern).
>
> **Method.** Read every file in `chat/` end-to-end; spot-checked sibling features. Grepped repeatedly for: `incognito`, `Memory`, `MemoryBanner`, `Plugin`, `Connector`, `extractArtifacts`, `getToolRenderer`, `Live Artifact`, `publish`, `embed`, `Open in Comet`, `tool approval`, `MCP_`, `Schedule`, `cron`. Cross-referenced `MessageListNew` (the production renderer wired in `WebChatPage.tsx:296-302`) vs the legacy `MessageBubble.tsx` (still present, _partly_ wired via different paths in unified flows). Did not run code; this is a paper audit.

---

## Have

(One-line each, verified by file:line.)

- **Chat shell + sidebar.** `chat/pages/WebChatPage.tsx:251-318` mounts `ChatSidebar` (left) + `MessageListNew` (center) + `ChatComposerNew` (bottom).
- **Sidebar with time-grouped sessions.** `chat/components/Sidebar/ChatSidebar.tsx:70-107` groups by Today/Yesterday/Last 7 Days/Last 30 Days/Older.
- **Empty state with category pills.** `chat/pages/WebChatPage.tsx:269-294` renders the 4 starter pills ("Explain a complex concept" / "Help me write code" / "Summarize a document" / "Brainstorm ideas") with hot-fire send.
- **Composer + button overflow menu.** `chat/components/Composer/ChatComposerNew.tsx:625-721` opens a popover with Focus Mode, Agent Mode, Project Context, and a Tools list (image/video/document/search/code-execution).
- **Composer focus-mode tags.** `chat/components/Composer/FocusModeButtons.tsx` + `ActiveModeTags.tsx` + `ChatComposerNew.tsx:83-96` (5 modes: web/academic/code/writing/research with auto-tags).
- **Slash command menu.** `chat/components/Composer/SlashCommandMenu.tsx:14-20` ships 5 commands: `/search /think /image /doc /code` with arrow-key nav + Tab accept.
- **`@`-mention skill picker.** `ChatComposerNew.tsx:339-361, 581-621` filters skills by query and inserts `@<name>` into textarea.
- **Voice input.** `chat/components/Composer/VoiceInputButton.tsx:42-240` covers idle / listening / transcribing with a pulsing red ring, elapsed timer, error tooltip, and overlay; uses Web Speech API + server transcription fallback via `voice-input-store.ts`.
- **Drag-and-drop file overlay.** `chat/components/Composer/DragDropOverlay.tsx` + `chat/components/messages/DropZoneOverlay.tsx`.
- **Image attachment preview thumbnails.** `chat/components/Composer/AttachmentPreview.tsx`, `chat/components/artifacts/ImageAttachmentPreview.tsx:23-130`.
- **File upload + base64 image inline.** `WebChatPage.tsx:120-142` reads images via `FileReader.readAsDataURL` so vision providers can consume them.
- **Send / Stop / Queue tri-state button.** `chat/components/Composer/SendButton.tsx` + `ChatComposerNew.tsx:481` (`'stop' | 'queue' | 'send'` derived from `isLoading`/`isGenerating`/`hasContent`).
- **Ghost-text prompt completion.** `ChatComposerNew.tsx:188-195, 441-450` accepts via Tab/ArrowRight at end of input.
- **Style picker (preset + custom).** `chat/components/Composer/StyleSelector.tsx:23-281` ships Default/Concise/Detailed/Technical/Creative + create-custom-style with writing sample + instruction; persists via `style-store.ts`.
- **Model picker grouped by provider.** `chat/components/Composer/ComposerFooter.tsx:204-285` lists 10+ providers with brand logos and sub-grouped models; "managed_cloud" auto-bucket pinned first.
- **Thinking-effort selector (low/medium/high/max) for providers that support it.** `ComposerFooter.tsx:147-198` with `thinkingBudget` mapped to {4096,16384,32768,65536}.
- **`ThinkingBlock` (extended-reasoning accordion).** `chat/components/ThinkingBlock.tsx:46-247`: live timer, "Thinking… Xs" → "Thought for Xs", brain-icon pulse, prefers-reduced-motion respect, single-line preview when collapsed, auto-scroll, full ARIA. Wired into `MessageBubble.tsx:407-417`.
- **`ReasoningAccordion` (alt path for streamed thinking-step arrays).** `chat/components/messages/ReasoningAccordion.tsx:55-100+`. Wired in `MessageListNew.tsx:357-365`.
- **Tool timeline (collapsed summary line).** `chat/components/messages/ToolTimeline.tsx:100-164` builds Claude-style "ran 5 commands, created a file" past-tense summary; `tools.length > 3` auto-compacts.
- **`ToolCallCard` (per-call expanded detail).** `chat/components/ToolCallCard.tsx:62-360+` with status badges, parameters JSON, copy, **Approve / Reject** buttons (`:319-347`) for `awaiting_approval` state.
- **Inline tool-result registry.** `chat/components/InlineToolResults/index.tsx:62-179` maps 40+ tool names (web_search, file_edit, Bash, Git, mcp**filesystem**\*, mcp**supabase**execute_sql, etc.) to one of: `InlineSearchResults`, `InlineCodeDiff` (red/green hunks + line numbers), `InlineFileRead`, `InlineTerminalOutput`, `ToolResultCard` fallback.
- **Web search result list.** `chat/components/search/SearchResults.tsx`, `CompactSearchResults`, `SearchingIndicator` — wired in `MessageListNew.tsx:368-387` and `MessageBubble.tsx:521-526`.
- **Numbered citation pills + footer.** `chat/components/messages/InlineCitation.tsx:18-95` (`[1]` button with hover preview tooltip; `CitationFooter` shows the source list at message bottom). Wired in `MessageListNew.tsx:426-441` and `MessageBubble.tsx:528-543`.
- **Markdown body with full plug stack.** `MessageBubble.tsx:435-441` (`remark-gfm + remark-math + remark-breaks + rehype-highlight + rehype-raw`) and `MessageListNew.tsx:415` (lighter `remark-gfm` only).
- **Code block + copy + line numbers + diff stats.** `MessageListNew.tsx:69-212` (header bar, language label, additions/deletions counts, collapsed `>10` lines).
- **Streaming animated cursor.** `MessageListNew.tsx:418-420` (`▋` after content) and `MessageBubble.tsx:442-444` (`<span class="...animate-pulse bg-primary"/>` strip).
- **Auto-scroll on new messages / during stream.** `MessageListNew.tsx:619-622` (`bottomRef.scrollIntoView`).
- **Typing indicator (3-dot bouncing).** `MessageListNew.tsx:581-596`.
- **Per-message hover actions.** Copy / 👍 / 👎 / Regenerate / Delete / More menu — `MessageListNew.tsx:462-555` + `MessageBubble.tsx:649-771`.
- **Reaction persistence to backend.** `MessageListNew.tsx:276-292` PATCHes `/api/chat/conversations/:id/messages/:id`.
- **Edit / Pin / Branch / Token-usage popout.** `MessageBubble.tsx:711-768` (More dropdown).
- **Inline `ArtifactBlock` (HTML / Mermaid / CSV / JSON / generic).** `chat/components/ArtifactBlock.tsx:23, 276-330` with `MermaidRenderer`.
- **Sandboxed `ArtifactPreview` (Preview/Code tabs, iframe + sandboxed CSP).** `chat/components/artifacts/ArtifactPreview.tsx:68-462` supports html/react/svg/mermaid/code; ships **version dropdown** (`:316-342`), Copy / Download (HTML/TXT/MD via dropdown) / Share / Refresh / Open-in-new-tab / Fullscreen / Security warning when `hasXSSRisk(content)`.
- **Tabbed `ArtifactsPanel` slide-in.** `chat/components/artifacts/ArtifactsPanel.tsx:169-247` — tab bar across the top, mobile backdrop, `slide-in-from-right duration-300` animation. Has the `ArtifactsToggleButton` with badge count (`:254-278`).
- **Inline artifact thumbnail cards in chat.** `chat/components/artifacts/InlineArtifactCards.tsx`.
- **Image lightbox.** `chat/components/ImageLightbox.tsx` consumed by `MediaDisplay.tsx:182`.
- **Image / video result rendering with error fallback.** `MessageBubble.tsx:469-519`.
- **Branching navigator (tree visualization).** `chat/components/BranchNavigator.tsx:46-480+` + `dialogs/CreateBranchDialog.tsx` + `hooks/use-conversation-branches.ts`.
- **Search across conversations.** `chat/components/search/SearchResultCard.tsx`, `dialogs/GlobalSearchDialog.tsx`, `services/global-search-service.ts`, `hooks/use-search-history.ts`.
- **Bookmarks dialog + service.** `chat/components/dialogs/BookmarksDialog.tsx` + `services/message-bookmarks-service.ts`.
- **Export conversation (multi-format).** `dialogs/EnhancedExportDialog.tsx` + `services/conversation-export.ts` + `services/document-export-service.ts`.
- **Keyboard shortcuts dialog + custom-shortcut binder.** `dialogs/KeyboardShortcutsDialog.tsx` + `dialogs/CustomShortcutDialog.tsx` + `hooks/use-keyboard-shortcuts.ts`.
- **Token analytics dashboard + budget tracker.** `dialogs/TokenAnalyticsDialog.tsx`, `tokens/TokenAnalyticsDashboard.tsx`, `tokens/TokenBalanceDisplay.tsx`, `Budget/BudgetTrackerDisplay.tsx`.
- **Inline paywall card.** `chat/components/InlinePaywallCard.tsx` (mcp/deep_research gated upsell rendered in chat).
- **Follow-up suggestion pills (4 types).** `chat/components/FollowUpSuggestions.tsx:32-65+` (deeper / alternative / apply / discover) — fades on user typing.
- **Connector directory (sister surface).** `connectors/pages/ConnectorsPage.tsx:60-466` lists 70+ connectors (Gmail, Drive, Notion, Slack, Linear, GitHub, Stripe…) with phased rollout, auth-type tagging, `+ Add custom connector` dialog (`:489-630`) that POSTs to `/api/connectors/mcp`.
- **Projects feature.** `projects/components/ProjectSidebar.tsx`, `ProjectSettingsDialog.tsx`, `stores/project-store.ts`. Composer surfaces a `FolderContextSelector` (`Composer/FolderContextSelector.tsx`) labeled "Project Context" — but it's folder-scoped, not full-Project (see Partial below).
- **Schedules feature.** `schedules/components/ScheduleForm.tsx:120, 192` (daily/weekly/monthly/custom-cron), `ScheduleCard`, `ScheduleRunHistory`, `ScheduleNotificationSettings`. Distinct surface, not in chat composer.
- **Teams.** `teams/components/TeamSwitcher.tsx`, `TeamSettingsPanel.tsx`, `stores/team-store.ts`.
- **Analytics.** `analytics/pages/AnalyticsDashboard.tsx`, `ActivityTable`, `SimpleBarChart`, `SimpleLineChart`, `AnalyticsSummaryCard`.
- **Billing dashboard + Stripe.** `billing/pages/BillingDashboard.tsx`, `services/stripe-payments.ts`, `usage-monitor.ts`, `token-pack-purchase.ts`.
- **Settings page with multi-tab.** `settings/pages/SettingsPage.tsx`, `UserSettings.tsx`, `AIConfiguration.tsx`, `services/user-preferences.ts`, `totp-2fa.test.ts`.
- **Code execution block.** `messages/CodeExecutionBlock.tsx` + `services/code-execution-service.ts` (50 MB JS / 100 MB Python memory caps).
- **Document generation service.** `services/document-generation-service.ts`, `document-export.ts`.
- **Per-greeting banner hook.** `chat/components/GreetingBanner/useGreeting.ts` (time-aware "Good morning/afternoon"). **Not consumed** in current `WebChatPage.tsx` empty state — see Partial.
- **Mention/employee/agent variants.** `agents/EmployeeSelector.tsx`, `EmployeeWorkStream.tsx`, `AgentParticipantPanel.tsx`, `AgentStatusBar.tsx`, `Main/MultiAgentChatInterface.tsx` (multi-agent collaboration mode, beyond Claude scope).
- **Workflow display.** `workflows/WorkflowDisplay.tsx`, `WorkingProcess.tsx`, `ToolProgressIndicator.tsx`, `CollaborativeTaskView.tsx`.
- **Cards (Calculation/Comparison/Recipe/Steps).** `chat/components/cards/*` — domain-specific display blocks.
- **Inline code executor.** `chat/components/InlineCodeExecutor.tsx`.
- **Action trail.** `chat/components/ActionTrail.tsx`.
- **Hooks suite (15 chat hooks).** `chat/hooks/` covers attachments, persistence, queries, branches, history, export, shortcuts, reactions, search, session-tokens, voice-recording, helpTour, etc.

---

## Partial

Each entry: claim → gap → effort estimate (engineering days, single dev).

### P-1. `+` button menu lacks Connectors / Skills browser / Plugins / Code Execution / Extended Thinking / Research entries

The `+` overflow popover in `ChatComposerNew.tsx:625-721` exposes Focus Mode (web/academic/code/writing/research), Agent Mode (solo/engineer/research/team/race), Project Context (folder selector), and a fixed `TOOLS` array (image, video, document, search, code-execution). Per `anthropic-claude-suite-may-2026.md:38`, claude.ai's `+` is a _unified menu_ with: **Connectors, file upload, Skills, Plugins, Web Search toggle, Code Execution toggle, Extended Thinking toggle, Research mode**.

- **Missing in our `+` menu:** dedicated Connectors entry (Gmail/Drive/Notion etc. picker — currently buried at `/connectors`); Skills browser entry (only @-mention textbox); Plugins (no concept); Web Search toggle is on the row outside the menu (OK), Extended Thinking toggle is also outside (OK — actually called `Think`); Research toggle is also a separate row pill (OK — labeled `Research`).
- **Effort:** 2 d to add 3 menu sections to the popover (Connectors / Skills browser / Plugins) and wire them to existing `/connectors` page + the `chat-ai-service.getAvailableSkills()`. Real Plugin marketplace is missing entirely (see M-9).

### P-2. Slash menu has only 5 commands, no full Claude-Code-style suite

`SlashCommandMenu.tsx:14-20`: `/search /think /image /doc /code`. claude.ai's slash bar mirrors the `+` menu (per §1.1) but Claude Code CLI also exposes `/help /clear /compact /rewind /fork /resume /model /effort /plan /agents /skills /mcp /plugins /init /usage /cost /context /doctor` (§5.2) — many of which apply to chat (`/clear`, `/compact`, `/rewind`, `/fork`, `/agents`, `/skills`, `/model`).

- **Missing:** `/clear`, `/new`, `/fork`, `/branch` (we have BranchNavigator but no slash entry), `/model` (the picker is in footer only), `/style`, `/skills` browser, `/mcp` connector list, `/agents`, `/help`, `/recent` (search-history is a separate dialog), `/regenerate`.
- **Effort:** 3 d to add 12+ commands and wire each to existing dialogs/stores.

### P-3. Tool-result registry exists but is **dead code in features**

`InlineToolResults/index.tsx:62-179` defines a complete renderer registry. **No file in `apps/web/features/` imports `InlineToolResult` / `getToolRenderer` / `hasInlineRenderer`** (verified: `grep` returns only the definition site). `MessageListNew.tsx` and `MessageBubble.tsx` instead render via `ToolTimeline` (which delegates to `ToolCallCard` — see `ToolTimeline.tsx:316-353`) — and `ToolCallCard.tsx` does **not** dispatch into the per-tool inline components. Result: WebSearch, WebFetch, file_write, Bash, etc. all render as the _generic_ `ToolCallCard` accordion with raw JSON params — not as red/green diffs / favicon search lists / terminal output.

- **Gap detail:** the registry is nominally complete (40+ entries) but unrouted. Claude.ai's "Used Filesystem integration / Loaded tools / Result pill" pattern (`ui-03-claude-artifacts.md:32-74`) is therefore _not_ reachable in the production rendering path.
- **Effort:** 2 d to wire `getToolRenderer(toolName)` from inside `ToolCallCard` (or alongside `ToolTimeline` group expansion) and add e2e tests.

### P-4. Web search results don't match Claude's grouped-card pattern

`SearchResults` / `CompactSearchResults` (in `chat/components/search/`) render results, but they are _not_ the single dark-bordered container with `[favicon] [title] [domain]` rows + "10 results" right-aligned count described in `ui-03-claude-artifacts.md:101-119`. Cards are individual rows; no grouped header card. CitationFooter (`InlineCitation.tsx:65-94`) does add a "Sources" footer below messages, which Claude does NOT show — Claude just shows the result card _once_ and lets the prose stand alone (`:120-122`).

- **Gap:** layout drift from Claude pattern (cosmetic but visible).
- **Effort:** 1 d to restyle.

### P-5. Tool group header microcopy is engineering-style, not Claude's past-tense English

`ToolTimeline.tsx:100-164`'s `buildCompactSummary` produces "ran 5 commands, created a file, read 3 files" which is **close** to Claude's `Used Filesystem integration, loaded tools v` / `Ran 5 commands, created a file, read a file v` (`ui-03-claude-artifacts.md:22-27`). However:

- We omit the "Used <integration name>" framing entirely — there is no "Used GitHub MCP" or "Used Slack connector" header line.
- The word "Wrench"/`Wrench` lucide icon (`:228, :270`) replaces Claude's family of file/magnifier/document glyphs (`ui-03-claude-artifacts.md:50, :89`).
- `Wrench` icon + "X tools" non-natural-language fallback (`:275-285`) is a regression when `buildCompactSummary` returns "X tools" because all phrases dropped through to the default branch.
- **Effort:** 1 d to add per-integration header and swap glyphs.

### P-6. Reasoning blocks default to **collapsed** for the `MessageBubble` thinkingSteps array but **expanded while streaming** for the `ThinkingBlock`

`ThinkingBlock.tsx:54` uses `defaultExpanded ?? isStreaming` (good — matches Claude's "Default = open while streaming") and `:91-99` auto-collapses on stream end. `ReasoningAccordion.tsx:61-77` does the same. _However_, `MessageBubble.tsx:301, 546-579` renders `thinkingSteps` via `Collapsible` with `showThinking=false` initial state — i.e. **collapsed by default, even when complete**. Claude's UX is **expanded by default** post-completion (`ui-03-claude-artifacts.md:192-196`). Whichever path the production stream takes (depends on whether the metadata sets `thinkingContent` vs `thinkingSteps`), behavior is inconsistent.

- **Effort:** 0.5 d to unify default-open behavior in `MessageBubble`.

### P-7. Artifact panel is tabbed (chrome-heavy) — Claude's panel is **single-artifact-at-a-time, no tabs**

`ArtifactsPanel.tsx:225-237` renders a horizontal tab bar above the artifact viewer. `ui-03-claude-artifacts.md:268-270`: _"No tab bar across the sidebar top. The sidebar shows one artifact at a time. To switch to a different artifact, you click its card in chat."_ Our implementation goes with the ChatGPT-Canvas/Cursor pattern, not Claude's pattern. Functionally fine, stylistically off-baseline.

- **Effort:** 1 d to flip to single-artifact-with-`<` `>` arrows or 0 d to keep (this might be a deliberate differentiation — flag to PM).

### P-8. Artifact toolbar lacks type-aware "Open in" button

Per `ui-03-claude-artifacts.md:227-238`, Claude's chat-card right-side button reads `Open in Comet` (HTML), `Open in Antigravity` (Markdown), `Open in TextEdit` (DOCX), `Open in Preview` (PDF) — _type-aware_ host-app launcher. `ArtifactPreview.tsx:390-392` has only a generic `ExternalLink` icon button (`handleOpenInNewTab` — opens a Blob URL). Inline cards in `InlineArtifactCards.tsx` similarly use a fixed "Open" affordance.

- **Effort:** 0.5 d for the label; 2 d if we also detect host apps via mime-type and `protocol://` URLs (probably skip).

### P-9. Project picker in composer scopes folders, not full Claude Projects

`Composer/FolderContextSelector.tsx:84, 97` is labeled "Project Context" but `:97` (`ChatComposerNew.tsx:681`) and the underlying `projects/stores/project-store.ts` show folders, not Project workspaces with system prompts + knowledge files + scoped Connectors/Skills (`anthropic-claude-suite-may-2026.md:62-69`). The project surface (`projects/components/ProjectSettingsDialog.tsx`) does have system-prompt + knowledge fields, but the _composer surface_ exposes only the folder picker.

- **Effort:** 2 d to wire ProjectPicker into the `+` menu and inject the project's system-prompt/files into the request.

### P-10. Memory: store fragments exist but no UI in chat

`grep -rn "memory\|Memory"` returned only **utility-level memory** (browser tab memoization, `code-execution-service.ts:31` memory limits). No `MemoryBanner`, no Settings → Capabilities Memory toggle (per §1.6). No "Pause" / "Reset memory" buttons. No per-fact list editor. No memory-injection UI.

- **Effort:** 5 d to ship a Settings → Capabilities Memory tab with toggle + fact list + reset, plus an inline banner when memory contributes to a reply.

### P-11. Connectors are a separate page, not surfaced in chat composer

`ConnectorsPage.tsx` is a complete directory at `/connectors`. But the chat composer's `+` menu has no "Connectors" entry, no "Connect Gmail / Calendar / Slack" inline path, no per-message "this answer used Gmail" attribution chip. Claude's `+ → Connectors → Browse Directory → Connect → OAuth → token` flow (`anthropic-claude-suite-may-2026.md:74-75`) is unreachable from chat.

- **Effort:** 2 d to add the menu link + in-chat connector-attribution chip.

### P-12. Artifact panel never auto-opens; no client-side persistence; no cross-tab sync; no "Live Artifacts"

`ArtifactsPanel.tsx:175` requires `panelOpen` to be `true`; the toggle button (`:254-278`) is the only way to open. Claude's panel auto-opens on first artifact creation in some flows. No persistent storage mode (per §1.9 _"Persistent storage 20 MB per artifact, only on published artifacts"_); no Publish button (`grep` for "Publish" returned 0); no embed code (§1.7); no MCP-connected/Live Artifacts (auto-refresh against an MCP server, §1.9).

- **Effort:** 1 d auto-open. Persistent / Publish / Live = M-3 (Missing).

### P-13. Streaming UX missing scroll-to-bottom-on-demand chevron

`MessageListNew.tsx:619-622` auto-scrolls on streaming, but if user scrolls up there is no floating "scroll to bottom" chevron (Claude's pattern, `ui-03-claude-artifacts.md:155-158`). User has to manually scroll or stop reading.

- **Effort:** 0.5 d.

### P-14. Voice mode (full-duplex spoken conversation) — only **voice input** shipped, not Voice Mode

`VoiceInputButton.tsx` is _transcription_ (Web Speech API → text → submit). claude.ai's separate sound-wave icon (`anthropic-claude-suite-may-2026.md:41`) opens **Voice mode (beta on web, English-only)** — full-duplex spoken conversation. ChatGPT also has the hollow-circle Live Mode. We have neither.

- **Effort:** 5–8 d (Realtime API or WebRTC + audio playback + interruption).

### P-15. Permission/approval prompt UI: built into `ToolCallCard` but unwired in agentic loop

`ToolCallCard.tsx:62, 193, 200, 319-347` ships a yellow "This tool requires your approval before execution" banner with Approve/Reject buttons gated on `awaiting_approval` status. **No code path** in `apps/web/features/` actually emits an `awaiting_approval` tool-call status in chat metadata; the `agentMode` types (`types/agentMode.ts:9-10`) hint at `safe`/`standard` modes but there's no streaming logic that pauses on writes. So the UI exists; the contract doesn't.

- **Effort:** 5 d to plumb a server-issued "pause for approval" SSE event into the chat-stream and resume on Approve.

### P-16. Greeting banner exists, not consumed

`chat/components/GreetingBanner/useGreeting.ts` provides a time-aware greeting hook. `WebChatPage.tsx:269-294` empty state hardcodes `What can I help with?` instead of "Good morning, Sid" / "Welcome back". Trivial.

- **Effort:** 0.5 d.

### P-17. Sidebar lacks Projects / Artifacts / Customize entry points

Claude's sidebar lists Chats, **Projects**, **Artifacts space**, **Customize entry-point** (per `anthropic-claude-suite-may-2026.md:36`). `ChatSidebar.tsx` shows only Chats (sessions). Settings, LogOut, and ChevronUp are present (`:13-17`) but no Projects / Artifacts links.

- **Effort:** 1 d.

### P-18. Tool-rendering: no inline `Open in <Editor>` chip on artifact cards

`InlineArtifactCards.tsx` renders thumbnail cards; per Claude's `ui-03-claude-artifacts.md:227-238`, each card has a type-aware right-side button. We render `ArtifactPreview` blocks instead, full-width, which is more chrome-heavy than Claude's lightweight chip.

- **Effort:** 1 d.

### P-19. No "Used Filesystem integration / Loaded tools" pre-tool group banner

`ToolTimeline.tsx:255-285` only shows "X tools / Yms total / Z failed" or `buildCompactSummary` output. No "Used <integration> integration, loaded tools" verbal pre-banner that Claude shows when first surfacing a tool group (`ui-03-claude-artifacts.md:22-30`).

- **Effort:** 0.5 d (just a different summary template).

### P-20. Artifact panel: no source/preview toggle for **non-renderable** types

`ArtifactPreview.tsx:419-430` only shows the Tabs (Preview / Code) when `canPreview = ['html', 'react', 'svg', 'mermaid']`. For markdown / DOCX / PDF / xlsx artifacts (Claude renders all of these per §1.9), we have no preview path; we show only the Code tab. No PDF rendering pipeline, no DOCX preview.

- **Effort:** 5 d to ship native md preview + DOCX-via-mammoth + PDF-via-pdf.js.

### P-21. Multi-version artifact UI exists but **no auto-versioning** on chat update

`ArtifactPreview.tsx:316-342` shows a version dropdown when `artifact.versions.length > 1`. `artifact-detector.ts:163-171` initializes `[v1]` once. There is **no flow that appends v2/v3** when the user asks to mutate the artifact in-chat.

- **Effort:** 2 d.

### P-22. Composer "Tools" group and Web Search / Think / Research toggles are **redundant** (5 ways to enable web search)

`ChatComposerNew.tsx`: (a) Focus Mode "web" tag (`:84-85, 264-282`), (b) `+` menu Tools list contains "Web Search" (`:75-81`), (c) Quick toggle pill `Search` (`:738-754`), (d) Slash `/search` (`SlashCommandMenu.tsx:15`), (e) Focus Mode "research" auto-includes `web-search-r` tag (`:91-95`). Each toggles a different state variable; only `webSearchEnabled` is forwarded to `onSend` (`:394`). Risk of UX confusion — Claude has exactly **one** Web Search toggle (`+` menu).

- **Effort:** 0.5 d to consolidate. Mostly a design call.

### P-23. JSON in tool results: no syntax weighting (matches Claude's "minimal" stance, but our `ToolCallCard` is even more minimal)

Claude shows `Request` / `Response` headers above monospace blocks (`ui-03-claude-artifacts.md:55-74`). `ToolCallCard.tsx` shows raw JSON in expanded body. No `Request` / `Response` framing. Minor cosmetic.

- **Effort:** 0.5 d.

### P-24. No "Used Filesystem", "Used GitHub" integration-attribution chip per tool group

Same as P-5/P-19 — Claude attributes the tool group to a connector by name in the verbal banner. We don't track which connector emitted which tool.

- **Effort:** 1 d (requires server-side tagging too).

### P-25. Iframe sandbox is `allow-scripts allow-same-origin` (looser than Claude's expected sandbox)

`ArtifactPreview.tsx:439`. Claude artifacts run in a more restrictive sandbox per their published security model (per `anthropic-claude-suite-may-2026.md:F.1`). Not a feature gap, a security delta.

- **Effort:** Risk-only; remediation depends on security review.

---

## Missing — by category

### Chat surface

- **M-1. Memory banner ("Saved to memory: …" / "This reply used your saved memory")** — neither inline nor in settings. Per `anthropic-claude-suite-may-2026.md:E.2` Memory is a first-class capability with daily synthesis, fact-list editor, Pause/Reset. Zero implementation in `apps/web/features/`.
- **M-2. Incognito mode (`Cmd/Ctrl+Shift+I`, profile menu entry)** — `grep` for "incognito" / "Incognito" returned 0 hits. Claude has it (§1.1).
- **M-3. Live Artifacts / Persistent storage / Publish-to-public-link / Embed code** — `grep` for `Publish`, `Live`, `embed` returned 0. Per §1.9 (Apr 2026 features).
- **M-4. Cowork / autonomous-task tab** — chat is single-session, single-user; no autonomous task runner with VM. (Out of scope for web — chat-only — but Claude's parity story requires either Cowork-equivalent or explicit "Cowork is desktop-only" copy.)
- **M-5. Dispatch (mobile→desktop tasking)** — N/A web; cross-surface.

### Composer

- **M-6. "Connectors" entry in `+` menu** (P-1, M-13).
- **M-7. "Browse Skills" entry in `+` menu** — `@`-mention exists, but no full directory browser.
- **M-8. "Plugins" entry in `+` menu / Plugin marketplace** — no concept.
- **M-9. Plugin marketplace at `claude.com/plugins`-equivalent** — not present anywhere.
- **M-10. Slash `/help /clear /compact /rewind /fork /resume /model /effort /plan /agents /skills /mcp` (P-2)**.
- **M-11. Voice mode (full-duplex)** (P-14).
- **M-12. Model picker in composer chip ("Sonnet 4.6 Extended" right-side label)** — we have it in **footer**, Claude has it in **upper-right of composer**. Cosmetic positional drift.

### Tool-result rendering

- **M-13. Wired inline tool renderers (P-3)** — biggest gap; the registry is dead.
- **M-14. "Used Filesystem integration, loaded tools v" pre-banner with chevron** (P-19, P-24).
- **M-15. Filesystem-write inline diff with **Apply / Reject** buttons** — `ui-03-claude-artifacts.md:84` notes Claude _does not_ render diffs in chat for writes; we ship `InlineCodeDiff` (`InlineToolResults/InlineCodeDiff.tsx`) but it's not wired (P-3). If we wire it we _exceed_ Claude here.
- **M-16. Permission prompt for tool calls (P-15)** — UI exists, contract doesn't.

### Artifact pane

- **M-17. Type-aware "Open in Comet / Antigravity / TextEdit / Preview" chip** (P-8).
- **M-18. PDF / DOCX / XLSX rendering** (P-20).
- **M-19. Multi-version auto-creation on edit** (P-21).
- **M-20. Single-artifact (no-tab) Claude-style sidebar** (P-7).
- **M-21. Persistent published-artifact link** (M-3).
- **M-22. Direct Claude-API calls from artifact** (per §1.9: "artifacts can call Claude's API without the user supplying keys; usage counts against the _viewer's_ subscription") — zero impl.

### Reasoning blocks

- **M-23. Reasoning blocks **expanded by default** post-completion** (P-6).
- **M-24. Per-block clock icon (currently using `Brain` icon)** — `ui-03-claude-artifacts.md:178-181`. Cosmetic.
- **M-25. Multiple reasoning blocks interleaved with tool calls in the same turn** — our model assumes one reasoning block before content, no interleaved pattern.

### Citations

- **M-26. Footer "Sources" list is a _delta_ from Claude (Claude shows just the result card, no footer)** (P-4). Decide: keep or remove.
- **M-27. Hover preview on inline `[1]` `[2]` pills** (✓ already exist via `InlineCitation.tsx:32-58`) — need to verify integration with Anthropic's `web_search_20250305` `cited_text` schema.

### Streaming UX

- **M-28. Floating scroll-to-bottom chevron** (P-13).
- **M-29. Resume-on-disconnect** — per §1.10 Claude resumes long-running tasks on reconnect; our `WebChatPage` simply re-mounts and re-streams. Effort: 5 d server+client.

### Image upload

- **M-30. Multi-image grid in user message bubble** — `MessageBubble.tsx` doesn't render an attachment grid; only `imageUrl` (single, generated). Composer accepts multi-file but we don't have a native upload-image-grid in user messages.
- **M-31. Image annotation / bounding boxes** — N/A; Claude doesn't ship this either, but worth tracking.

### Voice

- **M-32. Voice Mode (P-14, M-11)**.
- **M-33. Per-message audio playback** — we have `AudioPlayer.tsx`, `AudioVisualizer.tsx` but no voice TTS playback of assistant replies.

### Memory banner

- **M-34. (P-10, M-1)** — entire Memory feature is missing.

### Project picker

- **M-35. Project picker as in `anthropic-claude-suite-may-2026.md:36` "Projects sidebar entry → enter project context"** (P-9). We have a folder picker.

### Style picker

- ✓ Have it. No gap.

### Connector menu

- **M-36. Inline connector attribution on tool calls** ("This used Gmail") — zero.
- **M-37. Connector OAuth flow accessible from `+` menu** (M-6).
- **M-38. Per-connector tool-access permission editor (Auto / On-demand modes)** — Claude has Settings → Connectors permission editor (§1.4). We have the Connectors page but not the permission scope editor.

### Skills menu

- **M-39. Browse Skills directory in chat (P-1)**.
- **M-40. Skills `progressive disclosure` description-loading + body-on-demand** — `chat-ai-service.ts:316-325` returns the full SkillInfo list synchronously; no metadata-first model.
- **M-41. Skill creator UI** — no equivalent of Claude's official `skill-creator` meta-skill in our web.

### Plugins menu

- **M-42 — M-44.** Plugin concept does not exist in web. Claude Code has it; claude.ai chat does not surface plugins directly, but the Claude marketplace ecosystem is implied.

### `+` button menu

- (Covered by P-1, M-6, M-7, M-8.)

### Slash commands

- (Covered by P-2, M-10.)

### Other Claude features absent in `apps/web/features/`

- **M-45. Cmd/Ctrl+Shift+I incognito chat hotkey** (M-2).
- **M-46. "Customize" sidebar entry** opening a system-prompt + traits editor — Claude's Profile/Personalization tab (§1.2 last row).
- **M-47. Multi-conversation tab bar** — claude.ai web ships a session tab list (sidebar handles this; ours does too) but no multi-tab open at once.
- **M-48. "Pause Claude" button to interrupt streaming with steering message** — `MessageListNew.tsx` has Stop only; no inline "steer" textbox like Cowork has (§3.3). Out of scope for chat probably.
- **M-49. Audit logs / Compliance API surfaces in admin** — Settings → Privacy export request exists in Anthropic but not in our `settings/`. Out of pure chat scope.
- **M-50. "Custom visuals" toggle (charts / diagrams) in Settings** — Claude ships a separate Mermaid render toggle and Latex render toggle. We always render both.
- **M-51. Claude Code OAuth token surfacing** ("Claude Code" tab in Settings, §1.2) — not in our chat surface; we have settings but not this tab.
- **M-52. "Tool access mode" Auto vs On-demand** for environments with 10+ connectors (§1.4 last sentence) — no impl.
- **M-53. Forced-choice memory training-opt-in prompt** (per §E.2) — N/A until M-1 ships.
- **M-54. `Open in Comet` / `Open in Antigravity` artifact chip type-awareness** (M-17).
- **M-55. Sandboxed artifact "Direct API calls from artifact"** (M-22).

---

## Per-axis percentage

(Methodology: 100% = full Claude parity per the references; partial counts as the implemented fraction.)

| Axis                                   | Have                                                                                                                                                                                                 | Partial                                                                                                            | Missing                                                                                  | %       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------- |
| **Tools (registry / dispatch)**        | InlineToolResults registry exists with 40+ entries                                                                                                                                                   | Registry unwired in production paths (P-3)                                                                         | Permission prompt unwired (P-15)                                                         | **30%** |
| **Web search**                         | Result list, citation pills, hover preview, footer                                                                                                                                                   | Card layout drift (P-4); footer is non-Claude (M-26)                                                               | Single grouped card with `N results` count not exact                                     | **70%** |
| **Answering / streaming-text quality** | Markdown + math + breaks + highlight + raw HTML; cursor; auto-scroll                                                                                                                                 | Scroll-to-bottom chevron (P-13); resume-on-disconnect (M-29)                                                       | —                                                                                        | **80%** |
| **MCP**                                | Inline tool registry recognizes `mcp__filesystem__*`, `mcp__supabase__*`                                                                                                                             | Not routed (P-3); no per-MCP-server header                                                                         | No MCP server config UI in chat (M-52); no Auto/On-demand tool-access mode               | **35%** |
| **Plugins**                            | —                                                                                                                                                                                                    | —                                                                                                                  | Entire concept missing (M-8, M-9)                                                        | **0%**  |
| **Skills**                             | `@`-mention picker; `chat-ai-service.getAvailableSkills`                                                                                                                                             | No body-loading / progressive disclosure (M-40); no browser (M-39)                                                 | Skill-creator UI (M-41); marketplace; org-defaults                                       | **20%** |
| **Memory**                             | —                                                                                                                                                                                                    | —                                                                                                                  | Entire feature (M-1, P-10, M-34)                                                         | **0%**  |
| **Artifacts**                          | iframe sandbox, version dropdown, Mermaid, HTML, React, SVG, Code; tabbed panel; thumbnail cards; security warning                                                                                   | Tabbed panel (P-7); type-aware Open-in (P-8); auto-version on edit (P-21); preview for non-renderable types (P-20) | Live Artifacts (M-3, M-21); Publish + persistent storage; embed; direct API calls (M-22) | **55%** |
| **Voice**                              | Voice **input** (transcription) — Web Speech + server fallback; recording overlay                                                                                                                    | —                                                                                                                  | Full-duplex Voice Mode (P-14, M-32); TTS playback (M-33)                                 | **35%** |
| **Composer**                           | `+` menu, focus modes, agent modes, project context, tools list, slash menu, @-mention, ghost text, voice input, attach paperclip, drag-and-drop, send/stop/queue button, style picker, model picker | Slash command roster (P-2); 5-way web-search redundancy (P-22); composer's `+` content (P-1, M-6/7/8)              | Voice Mode in composer (P-14); model picker chip in composer header (M-12)               | **70%** |
| **Tool rendering**                     | `ToolTimeline` collapsed summary, `ToolCallCard` expanded JSON, status badges, parallel-group rendering, copy, approve/reject UI                                                                     | Microcopy drift (P-5); registry unwired (P-3); no integration-name banner (P-19); JSON formatting (P-23)           | "Used <integration>" banner (M-14, M-24); Permission contract (M-16)                     | **40%** |
| **Streaming UX**                       | Cursor caret, auto-scroll, typing indicator, `Thinking…` placeholder, ThinkingBlock live timer, reduced-motion respect                                                                               | Scroll-to-bottom chevron (P-13, M-28); reasoning default-state inconsistency (P-6)                                 | Resume-on-disconnect (M-29)                                                              | **75%** |

**Per-axis weighted average.** With even weighting across 12 axes:
`(30 + 70 + 80 + 35 + 0 + 20 + 0 + 55 + 35 + 70 + 40 + 75) / 12 = 510 / 12 ≈ 43%`.

---

## Surface percentage for `apps/web/features/`

**Approximately 50% Claude-chat parity.** The chat surface has **all the pieces** for a Claude-level experience — `ThinkingBlock`, `ReasoningAccordion`, `InlineToolResults` registry (40+ tools), `ArtifactPreview`/`ArtifactsPanel`, `CitationFooter`, `ToolCallCard` with approval gates, voice transcription, slash menu, `@`-mention, ghost-text completion, branching, search, bookmarks, export, token analytics, BudgetTracker, follow-up pills, sandboxed iframe artifacts. **What's missing is the wiring** (tool-renderer dispatch into `ToolCallCard`/`ToolTimeline`), the **second-tier features** (Memory, Plugins, Live Artifacts, full-duplex Voice Mode, Incognito, Connectors-in-`+`-menu, Skill browser, slash-command roster), and the **microcopy/style alignment** (past-tense Used-X banner, type-aware Open-in chips, single-artifact panel, scroll-to-bottom chevron).

The sister surfaces (`connectors/`, `projects/`, `schedules/`, `teams/`, `analytics/`, `billing/`, `settings/`, `media/`) are roughly **60–80%** of equivalent Claude-suite features but are **not chat-surface gaps** — they're separate routes. The biggest cross-surface gap is that none of them feed back into the chat composer (`+` menu), which is why the chat parity drops to ~50%.

---

## Effort to reach 100% (engineering days, single dev)

| Priority                               | Bucket                                                            | Items                 | Days                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| **P0 (week 1) — wiring & microcopy**   | Tool-result registry dispatch                                     | P-3                   | 2                                                                                        |
|                                        | Slash command roster (12 entries)                                 | P-2, M-10             | 3                                                                                        |
|                                        | `+` menu Connectors/Skills/Plugins entries                        | P-1, M-6/7            | 2                                                                                        |
|                                        | Project picker (full Project, not folder)                         | P-9, M-35             | 2                                                                                        |
|                                        | Reasoning default-open consistency                                | P-6, M-23             | 0.5                                                                                      |
|                                        | Scroll-to-bottom chevron                                          | P-13, M-28            | 0.5                                                                                      |
|                                        | Web-search 5-way consolidation                                    | P-22                  | 0.5                                                                                      |
|                                        | Used-X banner + integration attribution                           | P-5, P-19, P-24, M-14 | 1.5                                                                                      |
|                                        | Greeting banner consume                                           | P-16                  | 0.5                                                                                      |
|                                        | Sidebar Projects/Artifacts/Customize                              | P-17                  | 1                                                                                        |
| **P0 subtotal**                        |                                                                   |                       | **13.5 d**                                                                               |
| **P1 (weeks 2–3) — core feature gaps** | Memory feature (toggle, list, banner)                             | M-1, P-10, M-34, M-53 | 5                                                                                        |
|                                        | Voice Mode (full-duplex)                                          | P-14, M-32            | 7                                                                                        |
|                                        | Permission/approval streaming contract                            | P-15, M-16            | 5                                                                                        |
|                                        | Plugin marketplace concept                                        | M-8, M-9              | 8                                                                                        |
|                                        | PDF/DOCX/XLSX artifact preview                                    | P-20, M-18            | 5                                                                                        |
|                                        | Multi-version artifact auto-creation                              | P-21, M-19            | 2                                                                                        |
|                                        | Skill browser + progressive disclosure                            | M-39, M-40, M-41      | 5                                                                                        |
|                                        | Auto-open artifact panel on first artifact + single-artifact mode | P-12, P-7, M-20       | 1.5                                                                                      |
|                                        | Type-aware Open-in chip                                           | P-8, M-17, M-54       | 0.5                                                                                      |
| **P1 subtotal**                        |                                                                   |                       | **39 d**                                                                                 |
| **P2 (weeks 4–6) — premium parity**    | Incognito mode                                                    | M-2, M-45             | 2                                                                                        |
|                                        | Live Artifacts (MCP refresh)                                      | M-3 first half        | 6                                                                                        |
|                                        | Persistent published artifacts + embed                            | M-3 second half, M-21 | 5                                                                                        |
|                                        | Direct API calls from artifact                                    | M-22, M-55            | 4                                                                                        |
|                                        | Resume-on-disconnect                                              | M-29                  | 5                                                                                        |
|                                        | Per-connector permission scope editor (Auto/On-demand)            | M-38, M-52            | 3                                                                                        |
|                                        | TTS playback of assistant replies                                 | M-33                  | 3                                                                                        |
|                                        | Multi-image grid in user message                                  | M-30                  | 1                                                                                        |
|                                        | Customize tab (Profile/Personalization)                           | M-46                  | 2                                                                                        |
|                                        | Custom visuals toggle (Mermaid/Latex on/off)                      | M-50                  | 1                                                                                        |
|                                        | Connector attribution chip on tool calls                          | M-36                  | 1                                                                                        |
| **P2 subtotal**                        |                                                                   |                       | **33 d**                                                                                 |
| **TOTAL to 100%**                      |                                                                   |                       | **~85.5 engineering days** (≈ 17 working weeks for 1 dev, or 5 weeks for a 4-dev squad). |

If we focus only on visible-to-user chat parity (drop Voice Mode, Plugins, Live Artifacts, resume-on-disconnect — the ambitious P1/P2 items) the budget collapses to **~22 days** (P0 + Memory + Permission contract + Skill browser + auto-artifact-panel) which gets us to ~80% Claude-chat parity.

---

End of GAP-WEB-B.
