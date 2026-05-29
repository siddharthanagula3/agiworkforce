# Batch 14 — Artifact Workflow Lifecycle Audit

Audited: 2026-05-24
Auditor: Claude Opus 4.7 (1M context)
Reference baseline: Claude Desktop (Max 20x + Free tier), 2026-05-15 screenshots
Target: AGI Web App (`apps/web`)

---

## IMG: 141_claude-max20x_artifact_prompt-ready.png
- Feature: Empty chat state with artifact-creation prompt typed in composer; greeting banner, model selector (Opus 4.7), "Adaptive" thinking toggle, send button, left sidebar icons
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/141_claude-max20x_artifact_prompt-ready.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/pages/WebChatPage.tsx
  - apps/web/features/chat/components/Composer/ChatComposerNew.tsx
  - apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx
- API endpoints: N/A (pre-submit state)
- Data flow:
  - User lands on `/chat` or `/chat/new`; WebChatPage renders empty-state branch
  - GreetingBanner displays time-based greeting with user's name
  - ChatComposerNew renders textarea, attachment "+", model selector, thinking toggle, send button
  - EMPTY_CHAT_CHIPS render below composer for quick-start prompts
- Flaws:
  - [minor] No "Adaptive" thinking mode label visible in AGI composer — Claude shows "Opus 4.7 Adaptive v" as a combined label; AGI uses separate model dropdown and thinking toggle @ apps/web/features/chat/components/Composer/ChatComposerNew.tsx
  - [cosmetic] Claude greeting uses full first+last name ("Siddhartha Nagula"); AGI greeting likely uses first name only based on GreetingBanner implementation @ apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx
- Visual gaps:
  - Claude has 8 sidebar icons (panel toggle, new chat, search, people, calendar, code, archive, integrations, chevron); AGI sidebar icon set differs
  - Claude has a user avatar circle at bottom-left; AGI may differ depending on auth integration

---

## IMG: 142_claude-max20x_artifact_generating.png
- Feature: Artifact generation in progress — chat title auto-set ("Interactive KPI dashboard card"), thinking indicator with animated sparkle icon, collapsible "Architecting interactive KPI dashboard..." summary, notification bar ("Want to be notified when Claude responds?" + Notify/dismiss), composer disabled during generation
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/142_claude-max20x_artifact_generating.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/pages/WebChatPage.tsx
  - apps/web/features/chat/components/messages/ChatMessageList.tsx
  - apps/web/features/chat/components/messages/ReasoningAccordion.tsx
  - apps/web/features/chat/components/messages/TypingIndicator.tsx
- API endpoints: /api/chat/conversations/[id]/messages (streaming)
- Data flow:
  - User submits prompt -> sendMessage fires SSE/streaming request
  - ChatMessageList shows user bubble + assistant streaming bubble
  - ReasoningAccordion displays thinking summary while streaming
  - TypingIndicator shows animated dots while waiting for first chunk
  - Auto-title effect in WebChatPage derives title from first user message
- Flaws:
  - [major] No notification bar component ("Want to be notified when Claude responds?" + Notify button + dismiss X) exists in AGI web — Claude shows this prominently during long generations; AGI has no browser Notification API integration for long-running responses @ apps/web/features/chat/pages/WebChatPage.tsx
  - [major] No collapsible thinking/reasoning summary line with chevron ("Architecting interactive KPI dashboard with toggle functionality >") — Claude shows a single-line expandable summary of the model's thinking; AGI's ReasoningAccordion exists but may not match this exact collapsed-summary UI pattern @ apps/web/features/chat/components/messages/ReasoningAccordion.tsx
  - [major] No conversation title displayed in the chat header bar — Claude shows "Interactive KPI dashboard card v" with a dropdown chevron at top-left. AGI's header (WebChatPage.tsx:599-623) contains only Share button + ArtifactsToggleButton with no title text @ apps/web/features/chat/pages/WebChatPage.tsx:599-623
  - [minor] Claude auto-generates a descriptive chat title; AGI auto-titles from first 60 chars of user message which may be less descriptive @ apps/web/features/chat/pages/WebChatPage.tsx:540
- Visual gaps:
  - Claude shows animated sparkle icon during thinking; AGI typing indicator style may differ
  - Claude send button changes to a stop-circle icon during generation; verify AGI matches

---

## IMG: 143_claude-max20x_artifact_result-inline-widget.png
- Feature: Completed artifact rendered inline in chat — interactive KPI card with "Performance overview" widget showing Revenue/Active users/Conversion/Churn metrics with This month/Last month toggle, progress bar, collapsible thinking summary, response text explaining design choices, notification bar
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/143_claude-max20x_artifact_result-inline-widget.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/ArtifactBlock.tsx
  - apps/web/features/chat/components/SandboxedIframe.tsx
  - apps/web/lib/artifact-sandbox.ts
- API endpoints: N/A (client-side rendering)
- Data flow:
  - Assistant message content contains ```html fenced block
  - ArtifactBlock.extractCodeBlocks() parses the fenced blocks
  - For lang=html, HtmlBlock renders SandboxedIframe with artifact payload
  - SandboxedIframe either posts to cross-origin sandbox or uses srcDoc fallback
  - Live interactive widget renders inside iframe — user can click toggle, see animations
- Flaws:
  - [critical] Claude renders interactive artifacts inline at full chat-width with seamless integration — the widget appears as a natural part of the conversation flow. AGI's ArtifactBlock renders HTML in a fixed 340px-height iframe (`h-[340px]`) with a gray header bar ("html . live preview") that creates visual separation. The Claude reference shows no such header bar — the artifact is visually embedded directly @ apps/web/features/chat/components/ArtifactBlock.tsx:162
  - [major] Claude's artifact widget has no "html . live preview" label bar, no refresh/external-link/copy buttons above it — those controls are contextual (appear on hover or in menus). AGI always shows a toolbar header with Refresh, External Link, and Copy buttons @ apps/web/features/chat/components/ArtifactBlock.tsx:133-160
  - [minor] Claude shows a "Share" button in the top-right header bar; AGI ArtifactsPanel has no share-to-link feature (publish route returns waitlist-gated response) @ apps/web/lib/artifact-publisher.ts:81-86
- Visual gaps:
  - Claude's inline artifact has no visible iframe border — it blends into the chat. AGI wraps in `rounded-lg border border-border`
  - Notification bar with Notify button still visible in Claude; missing in AGI
  - Claude artifact expands to fill available width; AGI has constrained container

---

## IMG: 144_claude-max20x_artifact_widget-interacted-last-month.png
- Feature: Same artifact after user clicked "Last month" toggle — metrics update (Revenue $44.1k, Active Users 11,920, etc.), progress bar at 72%, text updates. Demonstrates live interactivity within the sandboxed artifact
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/144_claude-max20x_artifact_widget-interacted-last-month.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/ArtifactBlock.tsx
  - apps/web/features/chat/components/SandboxedIframe.tsx
- API endpoints: N/A (client-side interaction)
- Data flow:
  - User clicks "Last month" toggle inside sandboxed iframe
  - JavaScript inside the sandbox handles state change (all logic is self-contained in the LLM-generated HTML)
  - Iframe re-renders with updated metrics — no parent frame communication needed
  - SandboxedIframe sandbox="allow-scripts" permits script execution
- Flaws:
  - [major] Claude artifact shows a "..." overflow menu (top-right of the artifact widget card) for additional actions; AGI has no per-artifact overflow menu for inline artifacts @ apps/web/features/chat/components/ArtifactBlock.tsx
  - [minor] Interactivity works in AGI via allow-scripts sandbox, but the fixed 340px height may clip taller interactive artifacts. Claude appears to auto-size or use a larger viewport @ apps/web/features/chat/components/ArtifactBlock.tsx:162
- Visual gaps:
  - Claude's "Last mo..." tab is highlighted with orange underline; AGI styling depends on LLM-generated CSS inside the sandbox

---

## IMG: 061_claude-free_artifact_prompt-before-submit.png
- Feature: Free-tier Claude — empty chat with artifact prompt typed ("Create a tiny interactive task tracker artifact..."), "Free plan . Upgrade" banner at top, Sonnet 4.6 model, Adaptive toggle, light-mode sidebar
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/061_claude-free_artifact_prompt-before-submit.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/pages/WebChatPage.tsx
  - apps/web/features/chat/components/Composer/ChatComposerNew.tsx
- API endpoints: N/A
- Data flow:
  - Same as IMG 141 — empty chat state
  - Claude shows "Free plan . Upgrade" top banner
  - Model defaults to Sonnet 4.6 (free tier model)
- Flaws:
  - [major] No "Free plan . Upgrade" persistent banner in AGI web — Claude shows subscription tier + upgrade link at the top center of every chat page for free users; AGI has no equivalent persistent upsell banner @ apps/web/features/chat/pages/WebChatPage.tsx
  - [minor] Claude free-tier light-mode sidebar icons are green-tinted (active state); AGI sidebar color scheme may differ
- Visual gaps:
  - Claude shows full browser chrome (URL bar with claude.ai/new); AGI is a different domain
  - Claude has a globe/integrations icon in sidebar; AGI sidebar icons differ

---

## IMG: 062_claude-free_artifact_running.png
- Feature: Artifact generation running — "Thinking" label with sparkle icon, "Reading frontend design skill" status line with loading icon, animated orb/circle in middle of viewport, notification bar, Sonnet 4.6 Adaptive
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/062_claude-free_artifact_running.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/messages/ReasoningAccordion.tsx
  - apps/web/features/chat/components/messages/TypingIndicator.tsx
  - apps/web/features/chat/components/messages/ToolTimeline.tsx
- API endpoints: /api/chat/conversations/[id]/messages (streaming)
- Data flow:
  - Prompt submitted -> streaming starts
  - "Thinking" label rendered by ReasoningAccordion with sparkle
  - Tool use steps ("Reading frontend design skill") shown via ToolTimeline
  - Animated loading orb shown while waiting
- Flaws:
  - [major] Claude shows specific tool-use steps ("Reading frontend design skill") as individual status lines with distinct icons (book/page icon) during generation. AGI's ToolTimeline exists but may not surface individual skill/tool reads with granular status lines @ apps/web/features/chat/components/messages/ToolTimeline.tsx
  - [major] Claude shows a large animated orb/circle visual in the center of the viewport during generation — a distinctive visual treatment. AGI uses simpler typing indicators @ apps/web/features/chat/components/messages/TypingIndicator.tsx
  - [major] No notification bar ("Want to be notified when Claude responds?" + Notify + X dismiss) @ apps/web/features/chat/pages/WebChatPage.tsx
- Visual gaps:
  - Claude "Free plan . Upgrade x" banner persists during generation with dismiss X
  - Claude animated orb is gold/amber colored — distinctive branding element

---

## IMG: 063_claude-free_artifact_skill-running.png
- Feature: Artifact partially generated — thinking summary line ("Envisioned clean, playful task tracker with satisfying interactions >"), partially rendered inline task tracker widget showing 2/3 tasks with categories (work, urgent), animated sparkle indicating still generating, "Lining up tasks..." status text
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/063_claude-free_artifact_skill-running.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/ArtifactBlock.tsx
  - apps/web/features/chat/components/SandboxedIframe.tsx
  - apps/web/features/chat/components/messages/ReasoningAccordion.tsx
- API endpoints: /api/chat/conversations/[id]/messages (streaming)
- Data flow:
  - Streaming response in progress — HTML code block partially received
  - ArtifactBlock detects partial ```html block and renders incrementally
  - SandboxedIframe shows partial artifact render as code streams in
  - ReasoningAccordion shows collapsed thinking summary
  - "Lining up tasks..." text streams alongside the artifact
- Flaws:
  - [critical] Claude renders artifacts progressively/incrementally as the streaming response arrives — the widget appears and updates in real-time while the model is still generating. AGI's ArtifactBlock only parses complete ```html...``` fenced blocks (regex requires closing ```) and cannot render partial artifacts during streaming @ apps/web/features/chat/components/ArtifactBlock.tsx:49 (regex `/```(\w*)\n([\s\S]*?)```/g` requires both opening and closing fences)
  - [major] Claude shows artifact and response text simultaneously during streaming — text flows below the progressively-rendered artifact. AGI renders artifacts only after the full code block is complete
- Visual gaps:
  - Claude shows animated sparkle/loading icon inline next to "Lining up tasks..." text
  - The artifact is seamlessly inline, not in a bordered container with header bar

---

## IMG: 064_claude-free_artifact_widget-visible.png
- Feature: Completed artifact — full task tracker with 3 tasks (Review YC application draft/work, Fix TypeScript build errors/urgent, 30-min walk outside/personal), "0 of 3 done" counter, 0% progress bar, tooltip "visualize: Task tracker" on hover, "Share" button in header, response text below explaining design
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/064_claude-free_artifact_widget-visible.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/ArtifactBlock.tsx
  - apps/web/features/chat/components/SandboxedIframe.tsx
  - apps/web/features/chat/components/artifacts/ArtifactPreview.tsx
- API endpoints: N/A
- Data flow:
  - Full ```html block received and parsed
  - ArtifactBlock -> HtmlBlock -> SandboxedIframe renders the complete widget
  - Response text renders below the artifact
  - Claude shows "visualize: Task tracker" tooltip badge on the artifact
- Flaws:
  - [major] No artifact-type tooltip/badge ("visualize: Task tracker") appears on hover in AGI. Claude shows a labeled tooltip identifying the artifact type with a descriptive name; AGI shows "html . live preview" as a static header bar @ apps/web/features/chat/components/ArtifactBlock.tsx:134
  - [major] No "Share" button in AGI chat header that appears after first message — Claude conditionally shows Share button; AGI does have Share button but it shares conversation, not individual artifacts @ apps/web/features/chat/pages/WebChatPage.tsx:609-619
  - [minor] Claude shows message reaction icons (thumbs up, thumbs down, copy, retry) below the response text; AGI MessageActions may differ in placement/availability
- Visual gaps:
  - Claude artifact has no visible border — blends into chat flow
  - "tap a task to complete it" instruction text and "0%" progress bar are part of the LLM-generated artifact
  - Notification bar still present at bottom

---

## IMG: 065_claude-free_artifact_result.png
- Feature: Same completed artifact without tooltip visible — clean final state with all 3 tasks, progress bar at 0%, response text with bullet points. This is the idle result state
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/065_claude-free_artifact_result.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/ArtifactBlock.tsx
  - apps/web/features/chat/components/SandboxedIframe.tsx
- API endpoints: N/A
- Data flow:
  - Same as IMG 064 — completed render
  - User is not hovering over artifact, so no tooltip visible
- Flaws:
  - Same as IMG 064 — all structural issues carry over
  - [minor] Claude's response text formatting uses bold for key terms and inline code backticks; AGI's EnhancedMarkdownRenderer handles this but may have styling differences @ apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx
- Visual gaps:
  - Claude text below artifact has distinctive formatting with "tap a task to complete it" instruction line integrated with the progress bar

---

## IMG: 066_claude-free_artifact_widget-interacted.png
- Feature: User interacted with artifact — checked off "Review YC application draft" (strikethrough + green checkbox), counter updated to "1 of 3 done", progress bar at 33%, confetti/sparkle animation, "keep going!" encouragement text — demonstrates full interactivity in the sandbox
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/066_claude-free_artifact_widget-interacted.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/ArtifactBlock.tsx
  - apps/web/features/chat/components/SandboxedIframe.tsx
- API endpoints: N/A
- Data flow:
  - User clicks task checkbox inside sandboxed iframe
  - JavaScript inside sandbox updates state: strikethrough text, green check, counter, progress bar
  - Confetti/sparkle animation triggers on completion (part of LLM-generated JS)
  - All state is ephemeral — lives only in the iframe's JS runtime
- Flaws:
  - [major] AGI's "Open in new tab" creates blob with `type: 'text/plain'` MIME type instead of `text/html` — the artifact downloads or shows as raw source text instead of rendering as an interactive page. Same bug exists in ArtifactPreview.tsx:354. Claude opens artifacts in a new tab as fully interactive HTML @ apps/web/features/chat/components/ArtifactBlock.tsx:150 and apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:354
  - [major] Artifact state is ephemeral in both Claude and AGI — no persistence of interactive state. But Claude appears to open the artifact in a separate browser tab ("about:blank" tab visible) which could allow extended interaction; AGI's broken MIME type prevents even this workaround
- Visual gaps:
  - Claude shows the artifact spanning near-full width with about:blank tab visible
  - The "..." overflow menu is visible at top-right of the artifact card header

---

## IMG: 157_claude-max20x_artifact_copy-export-menu.png
- Feature: Artifact viewer in split-pane mode — left side shows chat conversation with collapsible thinking summary and inline artifact reference; right side shows a full document/artifact viewer with title, table of contents, copy/export controls. The right panel is a dedicated artifact viewing area
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/157_claude-max20x_artifact_copy-export-menu.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx
  - apps/web/features/chat/components/artifacts/ArtifactPreview.tsx
  - apps/web/features/chat/components/artifacts/DocumentActions.tsx
- API endpoints: N/A
- Data flow:
  - User clicks artifact reference in chat -> ArtifactsPanel opens as side panel
  - ArtifactsPanel renders at 400px width on desktop with artifact tabs and viewer
  - ArtifactViewer shows syntax-highlighted code with Copy/Download action bar
  - For documents, DocumentActions provides export to MD/PDF/DOCX
- Flaws:
  - [critical] Claude's right-panel artifact viewer is a rich document renderer — it shows the artifact as a formatted, readable document with title, table of contents, structured headings, and prose. AGI's ArtifactsPanel only shows syntax-highlighted code (SyntaxHighlighter with vscDarkPlus theme) with no rendered preview in the panel itself — it's a code-only viewer @ apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:113-136
  - [major] Claude's split-pane view fills roughly 50% of the viewport for the artifact panel. AGI's ArtifactsPanel is hardcoded to 400px width on desktop (`sm:w-[400px]`), which is narrow for document viewing @ apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:194
  - [major] No Preview/Code tab toggle in ArtifactsPanel — the panel only shows code. The ArtifactPreview component does have preview/code tabs but is not used inside ArtifactsPanel (it's a separate component). The panel uses ArtifactViewer which only renders code @ apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:67-163
  - [minor] Claude shows a chevron on the artifact reference in chat ("Architecting...") to expand/collapse thinking; AGI ReasoningAccordion may handle this differently
- Visual gaps:
  - Claude's right panel has a clean document layout with proper typography (headings, numbered lists, prose paragraphs)
  - AGI panel has dark code-editor aesthetic (vscDarkPlus) which is inappropriate for document-type artifacts
  - Claude appears to use a resizable split-pane divider; AGI uses fixed-width panel

---

## IMG: 156_claude-max20x_artifact_viewer_split-pane.png
- Feature: Full split-pane artifact viewer — left side shows chat with thinking summary and inline artifact reference card; right side shows the same document artifact in a rendered document view with title, table of contents, numbered sections. This is the primary artifact viewing experience in Claude
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/156_claude-max20x_artifact_viewer_split-pane.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx
  - apps/web/features/chat/components/artifacts/ArtifactPreview.tsx
  - apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx
- API endpoints: N/A
- Data flow:
  - Artifact detected in message -> InlineArtifactCards renders clickable card in chat
  - Click card -> selectArtifact(id) + setPanelOpen(true) in artifacts-store
  - ArtifactsPanel renders as side panel with tabs and viewer
  - Content renders in ArtifactViewer (code-only in AGI)
- Flaws:
  - [critical] Claude shows an inline artifact reference card in the chat message — a compact, styled card with artifact title, type badge, and click-to-open behavior. AGI has InlineArtifactCards but they are tiny 80px-wide thumbnail cards, not the full-width reference cards Claude uses. Claude's reference card is a prominent, full-width element in the message flow @ apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:124-126 (w-[80px])
  - [critical] Same as IMG 157 — right panel only shows code, not rendered document. The ArtifactPreview component exists with Preview/Code tabs and SandboxedIframe rendering, but it is NOT integrated into ArtifactsPanel. The two are independent components that don't connect @ apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx vs apps/web/features/chat/components/artifacts/ArtifactPreview.tsx
  - [major] No resizable split-pane divider — AGI panel is fixed 400px, not draggable to resize like Claude's appears to be
- Visual gaps:
  - Claude left pane shows a compact artifact reference card with icon + title + "Click to open"
  - Claude right pane is a fully rendered document with table of contents
  - AGI has no table-of-contents generation for document artifacts

---

## Summary of Cross-Cutting Flaws

### Critical (6)
1. **No progressive/streaming artifact rendering** — Claude renders artifacts incrementally as the response streams; AGI requires complete fenced code blocks before rendering. MessageBubble passes streaming `content` to ArtifactBlock; `extractCodeBlocks` regex requires closing ``` fence, so partial blocks during streaming return empty array and render nothing @ ArtifactBlock.tsx:49, MessageBubble.tsx:442
2. **Inline artifacts have header bar + border** — Claude renders artifacts seamlessly inline; AGI wraps them in bordered containers with "html . live preview" toolbar @ ArtifactBlock.tsx:132-171
3. **ArtifactsPanel is code-only** — Claude's right panel renders documents/previews; AGI panel only shows syntax-highlighted code. ArtifactPreview exists but is disconnected from ArtifactsPanel @ ArtifactsPanel.tsx:67-163
4. **Inline artifact reference cards are 80px thumbnails** — Claude shows full-width, prominent reference cards in chat; AGI uses tiny 80px thumbnail cards @ InlineArtifactCards.tsx:124
5. **ArtifactPreview not wired into ArtifactsPanel** — The Preview/Code tabbed viewer component exists but is not used inside the side panel. These are two independent, disconnected components with different store APIs
6. **Three disconnected artifact stores** — `features/chat/stores/artifacts-store.ts` (panel), `shared/stores/artifact-store.ts` (Supabase sharing), and `stores/unified/artifactStore.ts` (desktop stubs) create confusion about canonical state. The panel store and the shared store have incompatible APIs, which explains why ArtifactPreview is disconnected from ArtifactsPanel

### Major (13)
1. No notification bar ("Want to be notified when Claude responds?" + Notify button) during long generations
2. No "Free plan . Upgrade" persistent banner for free-tier users
3. No progressive thinking summary line with collapsible chevron matching Claude's exact pattern
4. No conversation title displayed in chat header bar — Claude shows title + dropdown chevron; AGI header has only Share + ArtifactsToggle
5. No per-artifact overflow menu ("...") on inline artifacts
6. No artifact-type tooltip/badge ("visualize: Task tracker") on hover
7. ArtifactsPanel fixed at 400px width, not resizable like Claude's ~50% split
8. No granular tool-use status lines ("Reading frontend design skill") during generation
9. No large animated orb/circle visual during generation
10. **"Open in new tab" uses `text/plain` MIME type** instead of `text/html` — artifacts download as raw source instead of rendering interactively. Same bug in both ArtifactBlock.tsx:150 and ArtifactPreview.tsx:354
11. No table-of-contents generation for document-type artifacts in panel
12. Artifact state is ephemeral with no persistence; broken blob-URL MIME prevents even "open in tab" workaround
13. Claude renders artifact + response text simultaneously during streaming; AGI cannot

### Minor (5)
1. Fixed 340px iframe height may clip taller artifacts; no auto-resize
2. Auto-title uses first 60 chars of user message — less descriptive than Claude's AI-generated titles
3. "Adaptive" thinking mode not shown as combined label with model name
4. Greeting banner may show first-name-only vs Claude's full name
5. Message reaction icon placement may differ from Claude

### Cosmetic (2)
1. AGI dark sidebar icon set differs from Claude's icon set
2. Code viewer uses vscDarkPlus theme for all artifact types including documents — inappropriate for non-code content

---

## Stores Architecture Note

There are **three** separate artifact stores in the codebase:
1. `apps/web/features/chat/stores/artifacts-store.ts` — Zustand + persist + immer, used by ArtifactsPanel
2. `apps/web/shared/stores/artifact-store.ts` — Zustand + devtools + immer, uses Supabase for sharing, message-keyed
3. `apps/web/stores/unified/artifactStore.ts` — re-exports desktop stubs

This creates confusion about which store is canonical. The first is used by the actual UI; the second has Supabase sharing logic but references a `shared_artifacts` table that may not exist. The third is a stub.

---

## File Index

| File | Role |
|------|------|
| apps/web/features/chat/components/ArtifactBlock.tsx | Inline code-block renderer (html/csv/json/mermaid/generic) |
| apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx | Side panel with tabs + code viewer |
| apps/web/features/chat/components/artifacts/ArtifactPreview.tsx | Full preview/code tabbed viewer (NOT wired to panel) |
| apps/web/features/chat/components/artifacts/DocumentActions.tsx | Copy/download/enhance actions for documents |
| apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx | Tiny 80px thumbnail cards for inline artifact references |
| apps/web/features/chat/components/artifacts/DocumentMessage.tsx | Document display with expand/collapse + actions |
| apps/web/features/chat/components/SandboxedIframe.tsx | Cross-origin or srcDoc sandbox for HTML rendering |
| apps/web/features/chat/stores/artifacts-store.ts | Primary Zustand store (persisted, used by panel) |
| apps/web/features/chat/utils/artifact-detector.ts | Detection + extraction utility for code blocks |
| apps/web/lib/artifact-sandbox.ts | Sandbox origin helpers + postMessage protocol |
| apps/web/lib/artifact-publisher.ts | Publish adapter (v1 waitlist-gated, no DB) |
| apps/web/app/api/artifacts/publish/route.ts | POST route (returns waitlist result) |
| apps/web/shared/stores/artifact-store.ts | Secondary store with Supabase sharing (possibly unused) |
| apps/web/features/chat/pages/WebChatPage.tsx | Main chat page integrating panel + toggle |
| apps/web/features/pages/ArtifactGallery.tsx | Community gallery (empty state, no backend) |
