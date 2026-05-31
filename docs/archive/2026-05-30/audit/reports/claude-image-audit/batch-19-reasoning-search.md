# Batch 19: Reasoning Blocks and Web Search Audit

Audited: 2026-05-24
Reference baseline: Claude desktop (claude.ai) screenshots
Target: AGI web app (`apps/web`)

---

## IMG: 11_inline-reasoning-steps_thinking-blocks-clock-icons.png

- **Feature:** Inline reasoning/thinking steps displayed as collapsible blocks within the chat, each with a clock icon and duration label. Multiple thinking blocks appear sequentially as the model reads, reasons, and prepares. Blocks use an expand/collapse chevron with a brief description text.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/11_inline-reasoning-steps_thinking-blocks-clock-icons.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/ThinkingBlock.tsx`
  - `apps/web/features/chat/components/messages/ReasoningAccordion.tsx`
  - `apps/web/features/chat/components/messages/MessageBubble.tsx`
- **API endpoints:**
  - `apps/web/lib/ai-sdk/stream-handler.ts` (reasoning-delta chunk handling)
  - `POST /api/chat` (server route forwarding reasoning tokens)
- **Data flow:**
  - AI SDK `streamText` emits `reasoning-delta` chunks via `onChunk`
  - `stream-handler.ts:114` forwards `chunk.text` to `onReasoning` callback
  - `onFinish` joins reasoning parts and populates `message.metadata.thinkingContent`
  - `MessageBubble.tsx:392-403` renders `<ThinkingBlock>` when `thinkingContent` is present
  - `ThinkingBlock.tsx` shows live timer, Brain icon, collapsible content
  - `ReasoningAccordion.tsx` exists as a separate component with slightly different API (steps array vs. raw content)
- **Flaws:**
  - [major] Claude reference shows a **clock icon** (circle with hands) as the left icon on each thinking step, but AGI uses a **Brain icon** (`lucide-react/Brain`). This diverges from the reference visual language. @ `ThinkingBlock.tsx:161`, `ReasoningAccordion.tsx:124`
  - [major] Claude shows **multiple sequential thinking blocks** within a single message (e.g., "Identified resume gaps...", "Prepared to solicit...", "Reading the uploaded resume PDF"), each as a separate collapsible row with its own chevron. AGI renders a **single ThinkingBlock** per message since `metadata.thinkingContent` is a single string, not an array of titled steps. @ `MessageBubble.tsx:392-403`
  - [major] Claude reference shows each thinking step has a **descriptive title/summary** (e.g., "Identified resume gaps and formulated targeted clarification questions"). AGI's ThinkingBlock only shows "Reasoning" as a label with no descriptive title -- the collapsed preview is just the first line of raw thinking text. @ `ThinkingBlock.tsx:127-133,172-174`
  - [minor] Claude reference step labels are left-aligned, plain text descriptions with a chevron on the left. AGI has a `[font-variant:small-caps]` "Reasoning" label followed by duration, which is a different visual pattern. @ `ThinkingBlock.tsx:172`
  - [minor] Two competing thinking components exist (`ThinkingBlock` and `ReasoningAccordion`) with overlapping purpose and different prop interfaces, creating code confusion. @ `ThinkingBlock.tsx`, `ReasoningAccordion.tsx`
- **Visual gaps:**
  - Claude: clock icon per step, multi-step titled list, each step independently expandable
  - AGI: Brain icon, single monolithic block, "Reasoning" small-caps label, single collapse/expand

---

## IMG: 15_inline-reasoning-flow_multiple-thought-blocks.png

- **Feature:** Multiple thinking blocks in a single assistant turn showing a reasoning flow: the model reads a skill, reasons about creating content, creates files, and presents them. Each block is individually expandable with a descriptive label.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/15_inline-reasoning-flow_multiple-thought-blocks.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/ThinkingBlock.tsx`
  - `apps/web/features/chat/components/messages/MessageBubble.tsx`
  - `apps/web/features/chat/components/messages/ToolTimeline.tsx`
  - `apps/web/features/chat/components/ActionTrail.tsx`
- **API endpoints:**
  - `apps/web/lib/ai-sdk/stream-handler.ts`
- **Data flow:**
  - Claude emits multiple reasoning blocks interspersed with tool use (Read, Create, etc.)
  - AGI stream handler concatenates all reasoning-delta text into one `thinkingContent` string
  - `MessageBubble` renders one ThinkingBlock above the main content
  - Tool use steps render separately via `ToolTimeline` component
  - The interleaved pattern (think -> tool -> think -> tool) is not preserved in the UI
- **Flaws:**
  - [critical] Claude reference shows **interleaved reasoning and tool-use blocks** in temporal order within a single message. AGI renders thinking as a single block at the top, then content, then tools at the bottom. The temporal narrative of "think, act, think, act" is lost entirely. @ `MessageBubble.tsx:392-514`
  - [major] Claude shows tool-use blocks with descriptive action labels like "Reading frontend design skill", "Creating ideal resume HTML", "Presented file" alongside clock-icon reasoning blocks. AGI's ToolTimeline uses wrench icons and tool names (Read, Bash) without the descriptive narrative. @ `ToolTimeline.tsx:228-236`
  - [minor] Claude shows a "Done" step with a checkmark at the end of the reasoning flow. AGI has no explicit completion step in the rendering. @ `MessageBubble.tsx`
- **Visual gaps:**
  - Claude: interleaved timeline of clock-icon thinking + tool-icon steps in reading order
  - AGI: separate stacked sections (thinking block -> message text -> tool timeline)

---

## IMG: 25_inline-reasoning_design-skill-tool-use.png

- **Feature:** Interleaved reasoning and tool use -- model reads a design skill, then reasons about creating itinerary options, then creates files. Multiple thinking blocks with different clock durations, tool-use steps, and a final "Done" status.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/25_inline-reasoning_design-skill-tool-use.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/ThinkingBlock.tsx`
  - `apps/web/features/chat/components/messages/ToolTimeline.tsx`
  - `apps/web/features/chat/components/messages/MessageBubble.tsx`
- **API endpoints:**
  - `apps/web/lib/ai-sdk/stream-handler.ts`
- **Data flow:**
  - Same as IMG 15 above -- AI SDK reasoning-delta and tool-call events are collected
  - Reasoning goes to single `thinkingContent`; tool calls go to `metadata.tools`
  - MessageBubble renders them in separate sections, not interleaved
- **Flaws:**
  - [critical] Same interleaving issue as IMG 15. Claude shows "Architected four distinct travel itineraries" reasoning block followed by tool actions for reading/writing, then another reasoning block. AGI cannot represent this interleaved flow. @ `MessageBubble.tsx:392-514`
  - [major] Claude shows collapsible reasoning steps with titled summaries like "Architected four distinct travel itineraries with varying paces and destinations". AGI's ThinkingBlock shows raw thinking text, not a generated title/summary. @ `ThinkingBlock.tsx:127-133`
  - [major] Tool steps in Claude show descriptive labels ("Read design skill", "Creating ideal resume HTML for Anthropic Growth Engineer role") while AGI's ToolCallCard shows just the tool name. @ `ToolTimeline.tsx`, `ToolCallCard.tsx`
- **Visual gaps:**
  - Claude: rich, titled reasoning blocks interleaved with descriptive tool steps
  - AGI: flat thinking block at top, separated from ToolTimeline at bottom

---

## IMG: 26_inline-reasoning_multiple-markdown-artifacts.png

- **Feature:** Reasoning block showing model creating multiple markdown artifacts with filenames. Each artifact shows as a small file card with the .md filename. Includes a "Done" completion badge.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/26_inline-reasoning_multiple-markdown-artifacts.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/ThinkingBlock.tsx`
  - `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx`
  - `apps/web/features/chat/components/messages/MessageBubble.tsx`
- **API endpoints:**
  - `apps/web/lib/ai-sdk/stream-handler.ts`
- **Data flow:**
  - Reasoning text collected into `thinkingContent`
  - Artifacts extracted from content by `extractArtifacts()` and rendered via `InlineArtifactCards`
  - Individual file cards show artifact title and type
  - "Presented 3 files" / "Done" status messages come from reasoning flow
- **Flaws:**
  - [major] Claude shows inline artifact file cards with `.md` filename badges directly within the reasoning flow timeline. AGI renders artifacts separately below the message content via `InlineArtifactCards`. @ `MessageBubble.tsx:447`
  - [major] Claude reasoning step has a summary label "Refined markdown formatting and ensured content completeness" with a chevron. AGI renders all thinking as a single raw text block. @ `ThinkingBlock.tsx`
  - [minor] Claude shows "Presented 3 files" and "Done. Clean, proper markdown..." as distinct steps in the timeline. AGI has no concept of "presentation" steps or final done summary. @ `MessageBubble.tsx`
- **Visual gaps:**
  - Claude: file cards embedded in the reasoning flow, with filenames in small badges
  - AGI: artifacts rendered below message text as thumbnail cards, disconnected from thinking

---

## IMG: 071_claude-free_web-search_prompt-before-submit.png

- **Feature:** Empty chat state with a web search query typed into the composer. Shows the greeting banner ("It's late-night sid"), model selector showing "Sonnet 4.6 Adaptive", and suggestion chips below the composer. The sidebar is collapsed to an icon rail.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/071_claude-free_web-search_prompt-before-submit.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx`
  - `apps/web/features/chat/components/GreetingBanner/useGreeting.ts`
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/chat/pages/WebChatPage.tsx`
- **API endpoints:** N/A (empty state, no API call yet)
- **Data flow:**
  - `useGreeting()` computes time-band and user name for the greeting
  - `GreetingBanner` renders sparkle icon + headline
  - `ChatComposerNew` renders the input area with model selector and send button
  - `WebChatPage` renders chips via `EMPTY_CHAT_CHIPS` constant
- **Flaws:**
  - [minor] Claude greeting strips the name to lowercase first-name only ("sid"). AGI `useGreeting.ts:53` strips hyphens and spaces with regex replace but does not lower-case or extract first name -- it uses the full `userName`. @ `useGreeting.ts:53-54`
  - [minor] Claude model selector shows "Sonnet 4.6 Adaptive" as a combined model + style badge. AGI's `InputFooter` / `ComposerFooter` renders model and style separately. Layout may not match the Claude single-line format.
  - [cosmetic] Claude uses a clean amber/orange sparkle icon inline with the greeting. AGI uses a custom SVG sparkle in the `GreetingBanner.tsx:76-78` that is close but should be verified for exact visual match.
- **Visual gaps:**
  - Claude: greeting uses lowercase first name, one-line model+style selector
  - AGI: greeting may use full name, model and style may render as separate elements

---

## IMG: 072_claude-free_web-search_running.png

- **Feature:** Web search in progress. The assistant message shows "Assembled comprehensive tier information for presentation" as a thinking step, and the response is streaming below. A "Notify" badge appears for push notification opt-in. The disclaimer reads "Claude is AI and can make mistakes."
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/072_claude-free_web-search_running.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/ThinkingBlock.tsx`
  - `apps/web/features/chat/components/search/SearchResults.tsx`
  - `apps/web/features/chat/components/messages/InlineCitation.tsx`
  - `apps/web/features/chat/components/messages/MessageBubble.tsx`
- **API endpoints:**
  - `apps/web/core/integrations/web-search-handler.ts`
  - `apps/web/lib/ai-sdk/stream-handler.ts`
- **Data flow:**
  - User sends message, backend triggers web search tool
  - Search results flow back as tool results or metadata
  - Reasoning block shows "Assembled comprehensive tier information..."
  - Response streams with inline citations (small superscript source badges)
  - CitationFooter renders source links at bottom
- **Flaws:**
  - [major] Claude shows **inline source badges** next to cited text (e.g., "Tygart Media" as a small grey badge right after the cited sentence). AGI has `InlineCitation` component with numbered circle badges (`[1]`, `[2]`) but these are **not integrated into the markdown renderer** -- they only appear as a footer via `CitationFooter`. @ `MessageBubble.tsx:517-531`, `InlineCitation.tsx`
  - [major] Claude's thinking step is rendered as a single-line collapsible with a triangle chevron and counter ("Assembled comprehensive tier information for presentation 1"). AGI uses the ThinkingBlock with Brain icon, which is a visually different pattern. @ `ThinkingBlock.tsx`
  - [minor] Claude shows a "Notify" push notification opt-in banner. AGI has no equivalent push notification prompt for web. @ N/A (missing feature)
  - [cosmetic] Claude disclaimer says "Claude is AI and can make mistakes. Please double-check responses." AGI disclaimer text should be reviewed for parity.
- **Visual gaps:**
  - Claude: inline source name badges within paragraph text, thin thinking step
  - AGI: numbered citation circles in footer only, Brain icon thinking block

---

## IMG: 073_claude-free_web-search_sources-visible.png

- **Feature:** Web search results complete. Inline source citations ("Tygart Media", "Blockchain Council") appear as small grey text badges directly after cited sentences. Bullet points with factual claims each have source attribution inline.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/073_claude-free_web-search_sources-visible.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/messages/InlineCitation.tsx`
  - `apps/web/features/chat/components/messages/MessageBubble.tsx`
  - `apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx`
  - `apps/web/features/chat/components/messages/MarkdownContent.tsx`
- **API endpoints:**
  - `apps/web/core/integrations/web-search-handler.ts`
- **Data flow:**
  - Server-side web search returns citations with `cited_text`, `title`, and `url`
  - `metadata.citations` array is populated on the message
  - `CitationFooter` renders all citations as a list at the bottom
  - `InlineCitation` component exists for inline rendering but is not wired into markdown
- **Flaws:**
  - [critical] Claude renders **source name badges inline with the text** (e.g., "rolling usage limits. Tygart Media" where "Tygart Media" is a small muted badge after the sentence). AGI has the `InlineCitation` component but it renders **numbered circles**, not source names, and is only used in the footer -- not embedded in the response text flow. The markdown renderer does not parse citation markers to inject inline components. @ `MarkdownContent.tsx`, `InlineCitation.tsx`
  - [major] Claude shows a "Source:" link with a link icon at the end of each tier section (e.g., "Source: claude.com/pricing"). AGI's CitationFooter lists all sources at the bottom but does not place per-section source links. @ `MessageBubble.tsx:517-531`
  - [minor] Claude disclaimer now says "Please double-check cited sources" (acknowledging citations). AGI disclaimer should adapt when citations are present.
- **Visual gaps:**
  - Claude: inline source-name badges woven into paragraph text, per-section source links
  - AGI: numbered badges in footer only, no inline source names in text body

---

## IMG: 074_claude-free_web-search_result.png

- **Feature:** Completed web search response showing structured pricing tiers. Each tier has emoji bullet prefix, bold title with price, bullet list of features, and inline source citations. A "Share" button appears in the top-right header.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/074_claude-free_web-search_result.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/messages/MessageBubble.tsx`
  - `apps/web/features/chat/components/messages/MarkdownContent.tsx`
  - `apps/web/features/chat/components/messages/InlineCitation.tsx`
- **API endpoints:**
  - `apps/web/core/integrations/web-search-handler.ts`
- **Data flow:**
  - Same as IMG 073 -- the response is fully rendered markdown with inline citations
  - "Share" button functionality exists in `use-share-conversation.ts` hook
- **Flaws:**
  - [critical] Same inline citation gap as IMG 073 -- source names not embedded in text. @ `MarkdownContent.tsx`
  - [minor] Claude shows a "Share" button in the top bar of the conversation. AGI has share functionality via `useShareConversation` hook but the button placement/visibility should be verified. @ `WebChatPage.tsx`
- **Visual gaps:**
  - Same as IMG 073

---

## IMG: 075_claude-free_web-search_result-lower.png

- **Feature:** Lower portion of web search result showing Team and Enterprise tiers. Each has source links with link icons. A "Quick pick guide" section at the bottom with simplified recommendations. Disclaimer reads "Please double-check cited sources."
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/075_claude-free_web-search_result-lower.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/messages/MessageBubble.tsx`
  - `apps/web/features/chat/components/messages/InlineCitation.tsx`
  - `apps/web/features/chat/components/messages/MarkdownContent.tsx`
- **API endpoints:**
  - `apps/web/core/integrations/web-search-handler.ts`
- **Data flow:**
  - Continued markdown rendering of the structured response
  - Per-section "Source:" links with link icons and clickable URLs
  - Source name badges ("Tygart Media", "VantagePoint", "Gitter") inline after cited claims
- **Flaws:**
  - [critical] Same inline citation system gap. Claude shows "Source: vantagepoint.io -- Enterprise AI Tiers Explained" as a formatted link with icon at the end of each section. AGI does not produce per-section source links. @ `MessageBubble.tsx`, `MarkdownContent.tsx`
  - [major] Claude's disclaimer adapts to "Please double-check cited sources" when citations are present. AGI disclaimer is static and does not change based on citation presence. @ `ComposerFooter.tsx` or equivalent
  - [minor] Multiple source name badges appear inline ("Tygart Media", "VantagePoint") as small grey text. AGI's InlineCitation renders numbered circles only. @ `InlineCitation.tsx:27-28`
- **Visual gaps:**
  - Claude: per-section source link with icon, inline source name badges, adaptive disclaimer
  - AGI: numbered citation footer only, static disclaimer

---

## IMG: 158_claude-max20x_research-panel_sources-trace.png

- **Feature:** Research panel (Max 20x) with a sources trace. Left panel shows a research report with citations. Right panel shows a "Sources" sidebar listing all referenced sources with metadata (title, snippet, domain). This is a deep-research / extended output mode.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/158_claude-max20x_research-panel_sources-trace.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/features/chat/components/search/SearchResults.tsx` (closest equivalent)
  - `apps/web/features/chat/components/search/SearchResultCard.tsx`
  - `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`
- **API endpoints:**
  - N/A (research panel not implemented)
- **Data flow:**
  - Claude Max 20x provides a dedicated "Research" mode with split-panel display
  - Left panel: full research report with numbered citations
  - Right panel: scrollable list of all sources with title, domain, snippet
  - Sources panel has a "Research report is ready" status footer
  - No equivalent in AGI -- neither split-panel research view nor sources sidebar
- **Flaws:**
  - [critical] Research panel with split-view (report + sources sidebar) does not exist in AGI. This is a Max-tier feature but the UI scaffolding is entirely absent. @ N/A (no matching component)
  - [major] Sources trace sidebar (right panel listing all sources with metadata) has no AGI equivalent. The closest is `SearchResults.tsx` but it renders inline, not as a panel. @ `SearchResults.tsx`
  - [major] Research mode with extended generation, progress tracking, and dedicated output formatting is not implemented. @ N/A
- **Visual gaps:**
  - Claude: split-panel layout, sources sidebar, research progress indicator, numbered citations
  - AGI: no research mode, no sources panel, no split-view for research

---

## IMG: 01_empty-state_new-chat-collapsed-sidebar.png

- **Feature:** Empty new chat state with collapsed sidebar (icon rail). Shows "Free plan - Upgrade" badge, time-aware greeting ("Golden hour thinking"), model selector ("Sonnet 4.6 Extended"), placeholder text "How can I help you today?", and suggestion chips (Code, Write, Learn, From Drive, From Gmail). Microphone button visible.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/01_empty-state_new-chat-collapsed-sidebar.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx`
  - `apps/web/features/chat/components/GreetingBanner/useGreeting.ts`
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/chat/pages/WebChatPage.tsx`
  - `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`
- **API endpoints:** N/A (empty state)
- **Data flow:**
  - `useGreeting()` computes time band and builds headline
  - `GreetingBanner` renders sparkle + headline + chips
  - `ChatComposerNew` renders input with model selector and voice button
  - `ChatSidebar` renders collapsed icon rail
- **Flaws:**
  - [major] Claude shows a "Free plan - Upgrade" badge centered above the greeting. AGI does not render a plan badge or upgrade CTA on the empty chat state. @ `WebChatPage.tsx`, `GreetingBanner.tsx`
  - [major] Claude shows "From Drive" and "From Gmail" as suggestion chips with Google Drive and Gmail icons. AGI has "From Gmail" chip but no "From Drive" chip, and neither chip actually integrates with Google services. @ `GreetingBanner.tsx:26-51`, `WebChatPage.tsx:60-65`
  - [minor] Claude empty state placeholder reads "How can I help you today?" inside the composer. AGI composer placeholder is configurable via props and should match. @ `ChatComposerNew.tsx`
  - [minor] Claude shows a microphone button in the composer. AGI has `VoiceInputButton` component that renders a mic icon, which appears to match. @ `ChatComposerNew.tsx`
  - [minor] Claude sidebar collapsed state shows 7 icon buttons (new chat, search, projects, chat history, projects folder, integrations, developer). AGI sidebar icon rail should be compared for icon count and ordering. @ `ChatSidebar.tsx`
  - [cosmetic] Claude greeting "Golden hour thinking" is a poetic time-of-day phrase. AGI uses standard greetings ("Good morning", "Good afternoon", etc.) which are simpler but functional. @ `useGreeting.ts:14-21`
- **Visual gaps:**
  - Claude: plan badge above greeting, poetic greeting phrases, Drive+Gmail chips, 7-icon sidebar rail
  - AGI: no plan badge, standard greetings, partial chip set, sidebar needs icon count verification

---

## Summary of Critical and Major Flaws

### Critical (4)

| # | Description | Location |
|---|-------------|----------|
| C1 | **No interleaved reasoning+tool flow** -- Claude shows thinking blocks and tool-use steps in temporal order within a single message; AGI renders thinking as one block at top and tools as a separate list at bottom, losing the narrative flow | `MessageBubble.tsx:392-514` |
| C2 | **No inline source-name citations** -- Claude embeds source names (e.g., "Tygart Media") as small badges inline with the response text; AGI only renders numbered circles in a footer, not woven into paragraph text | `MarkdownContent.tsx`, `InlineCitation.tsx` |
| C3 | **No per-section source links** -- Claude places "Source: url" links at the end of each section in web search responses; AGI aggregates all sources in a single footer | `MessageBubble.tsx:517-531` |
| C4 | **Research panel missing entirely** -- Claude Max shows a split-panel research view with sources sidebar; AGI has no research mode or sources panel | N/A (no component) |

### Major (10)

| # | Description | Location |
|---|-------------|----------|
| M1 | Clock icon vs. Brain icon for thinking steps | `ThinkingBlock.tsx:161` |
| M2 | Single thinking block per message instead of multiple titled steps | `MessageBubble.tsx:392-403` |
| M3 | No descriptive titles on thinking blocks (uses raw first-line preview) | `ThinkingBlock.tsx:127-133` |
| M4 | Tool steps lack descriptive action labels (show tool name only) | `ToolTimeline.tsx:228-236` |
| M5 | Artifacts not embedded in reasoning flow timeline | `MessageBubble.tsx:447` |
| M6 | Thinking step visual pattern differs (Claude: thin inline collapsible; AGI: bordered card) | `ThinkingBlock.tsx:142-150` |
| M7 | No plan badge / upgrade CTA on empty state | `WebChatPage.tsx` |
| M8 | Missing "From Drive" suggestion chip | `GreetingBanner.tsx:26-51` |
| M9 | Sources trace sidebar not implemented | `SearchResults.tsx` |
| M10 | Disclaimer does not adapt when citations are present | `ComposerFooter.tsx` |

### Minor (8)

| # | Description | Location |
|---|-------------|----------|
| m1 | Two competing thinking components (ThinkingBlock + ReasoningAccordion) | Both files |
| m2 | No "Done" completion step in reasoning flow | `MessageBubble.tsx` |
| m3 | Greeting uses full name instead of lowercase first name only | `useGreeting.ts:53-54` |
| m4 | No push notification "Notify" banner | N/A |
| m5 | Model+style selector format differs from Claude single-line display | `ComposerFooter.tsx` |
| m6 | Sidebar icon count/ordering not verified against Claude 7-icon rail | `ChatSidebar.tsx` |
| m7 | Static greetings ("Good morning") vs. Claude poetic phrases ("Golden hour thinking") | `useGreeting.ts:14-21` |
| m8 | `small-caps` "Reasoning" label vs. Claude plain-text step descriptions | `ThinkingBlock.tsx:172` |
