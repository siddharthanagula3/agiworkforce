# PRD-003: Thinking/Reasoning Visualization for agiworkforce.com/chat

**Status**: Draft
**Author**: Engineering
**Date**: 2026-03-20
**Surface**: Web (`apps/web`)
**Priority**: P1 -- Core chat experience gap

---

## 1. Problem Statement

When a user sends a complex prompt to a model that supports extended thinking (Claude with `thinking` blocks, OpenAI with `reasoning_effort`, DeepSeek R1), the web chat at agiworkforce.com/chat currently provides no visual feedback during the reasoning phase. The user sees either a blank space or a generic "Thinking..." pulsing dot (the `TypingIndicator` component) with no indication of what the model is doing, how long it has been thinking, or what it thought about once it finishes.

This creates three concrete problems:

1. **Perceived latency**: Extended thinking can take 10-60+ seconds. Without feedback, users assume the system is broken and refresh or abandon the session.
2. **Lost transparency**: The reasoning chain is a valuable artifact. Competitors surface it; we discard it. Power users want to inspect reasoning to judge answer quality and catch errors.
3. **Competitive gap**: Claude.ai, ChatGPT, and Gemini all visualize the thinking phase. Our web chat is the only surface that lacks parity -- the desktop app already has `ReasoningAccordion` and `ThinkingMessageBlock` components that are significantly more mature.

---

## 2. User Stories

| ID   | As a...                             | I want to...                                                                    | So that...                                                                 |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| US-1 | User waiting for a complex analysis | See a live indicator showing the model is actively thinking, with elapsed time  | I know the system is working and can estimate when it will finish          |
| US-2 | User reviewing a completed response | Expand a collapsible block to read the full reasoning chain                     | I can verify the model's logic and catch errors before trusting the answer |
| US-3 | Power user comparing models         | See how long each model spent thinking and how many reasoning steps it used     | I can evaluate cost/quality tradeoffs between models                       |
| US-4 | User on a slow connection           | See thinking text stream in real-time as it arrives                             | I am not staring at a spinner for 30 seconds with zero feedback            |
| US-5 | User who sent a simple prompt       | NOT see a thinking block when the model answered without reasoning              | My chat is not cluttered with unnecessary UI for trivial responses         |
| US-6 | Mobile-web user                     | See a compact thinking indicator that does not consume excessive vertical space | The experience is usable on small viewports                                |

---

## 3. Competitive Analysis

### 3.1 Claude.ai (Anthropic)

- **Active state**: Teal-tinted container with Brain icon and animated "Thinking..." label. Clock icon displays live elapsed seconds ("Thinking... 12s").
- **Completion state**: Clock transitions to a checkmark. Label changes to "Thought for Xm Xs" (e.g., "Thought for 2m 13s").
- **Content**: Collapsible. Clicking the header reveals the full reasoning text in monospace font inside a scrollable container with a max height.
- **Auto behavior**: Expands automatically while streaming, collapses when complete.
- **Multiple blocks**: A single response can contain multiple sequential thinking blocks (chain of thought segments interleaved with content).
- **Empty thinking**: If the model returns an empty thinking block, it is hidden entirely.

### 3.2 ChatGPT (OpenAI)

- **Active state**: Text reads "Thought for..." with an animated ellipsis. No icon.
- **Completion state**: "Thought for Xm Xs" -- becomes a collapsible disclosure.
- **Content**: Expanding reveals a simple paragraph of summarized reasoning. OpenAI does not stream raw thinking tokens to the client; it sends a summary post-completion.
- **Styling**: Minimal -- no background tint, just slightly muted text. Indented under the response header.
- **Duration only**: No step count or word count metadata.

### 3.3 Gemini (Google)

- **Active state**: Three animated dots with "Thinking..." label. Brief thinking phase, rarely exceeds a few seconds for most prompts.
- **Completion state**: Thinking indicator disappears entirely. No collapsible reasoning block.
- **Content**: Gemini does not expose reasoning chains to end users as of March 2026.

### 3.4 Summary and Our Position

| Feature             | Claude.ai        | ChatGPT          | Gemini | AGI Workforce (current) | AGI Workforce (target)     |
| ------------------- | ---------------- | ---------------- | ------ | ----------------------- | -------------------------- |
| Active indicator    | Teal + timer     | Text + ellipsis  | Dots   | Generic dot pulse       | Brain icon + timer         |
| Elapsed duration    | Live seconds     | Post-hoc only    | None   | None                    | Live seconds               |
| Completion label    | "Thought for Xs" | "Thought for Xs" | None   | None                    | "Thought for Xs"           |
| Collapsible content | Yes (full text)  | Yes (summary)    | No     | No                      | Yes (full text, streaming) |
| Real-time streaming | Yes              | No               | No     | No                      | Yes                        |
| Multiple blocks     | Yes              | No               | No     | No                      | Yes                        |
| Styling distinction | Teal tint        | Subtle indent    | N/A    | N/A                     | Purple tint (brand)        |

**Target**: Match or exceed Claude.ai's implementation. Beat ChatGPT by streaming thinking content in real-time instead of showing only a post-hoc summary.

---

## 4. Detailed Requirements

### 4.1 ThinkingBlock Component

A self-contained, collapsible component rendered inside the `MessageBubble` above the main response content.

#### 4.1.1 Active State (model is thinking)

- **Icon**: Lucide `Brain` icon (14x14), purple/teal tint (`text-purple-400`), `animate-pulse` while active.
- **Label**: "Thinking..." with animated trailing ellipsis.
- **Duration counter**: Live-updating elapsed timer displayed inline next to the label. Format: "Xs" under 60 seconds, "Xm Ys" at 60+ seconds. Timer starts when the first thinking token arrives and stops when thinking completes.
- **Content area**: Expanded by default during streaming. Shows thinking text as it arrives in real-time, monospace font (`font-mono`), muted color (`text-zinc-400`), scrollable with max height of 24rem (384px).
- **Blinking cursor**: A small purple cursor block at the end of streamed text to indicate live output.
- **Auto-scroll**: Content container scrolls to bottom as new text arrives, unless the user has manually scrolled up within the container.
- **Border**: Purple-tinted border with subtle shadow (`border-purple-500/40 shadow-purple-500/10`).

#### 4.1.2 Completion State (thinking finished)

- **Icon**: Lucide `Brain` icon, static (no animation), muted color (`text-zinc-400`).
- **Label**: "Thought for Xs" (or "Xm Ys" for durations over 60 seconds). Duration is calculated from thinking start to thinking end.
- **Content area**: Collapsed by default after completion. User can click the header to expand and read the full reasoning chain.
- **Border**: Neutral border (`border-zinc-700/40`), no shadow.
- **Chevron**: Animated chevron (rotates 180 degrees when expanded/collapsed).

#### 4.1.3 Collapsed State

- **Preview**: First meaningful line of thinking content truncated to 80 characters, shown in italic monospace to the right of the label (hidden on mobile/small viewports).
- **Accessibility**: `aria-expanded` attribute on the header button. `aria-label` describes the action ("Expand reasoning block" / "Collapse reasoning block").

#### 4.1.4 Styling Specification

```
Container:   rounded-lg, overflow-hidden
Active:      bg-purple-950/10 dark:bg-purple-950/20, border-purple-500/40
Inactive:    bg-zinc-950/30 dark:bg-zinc-900/20, border-zinc-700/40
Header:      px-3 py-2, hover:bg-black/10 dark:hover:bg-white/5
Content:     px-4 py-3, max-h-96 overflow-y-auto
Font:        text-xs font-mono for content, text-xs for header labels
Scrollbar:   thin scrollbar, semi-transparent track
```

### 4.2 Chat Store Changes

The `ChatMessage` interface in `apps/web/features/chat/stores/chat-store.ts` must be extended to carry thinking data.

#### 4.2.1 New Metadata Fields

```typescript
interface ChatMessage {
  // ... existing fields ...
  metadata?: {
    // ... existing fields ...

    /** Raw extended thinking text, accumulated from streaming deltas */
    thinkingContent?: string;

    /** True while thinking tokens are actively being received */
    isThinkingStreaming?: boolean;

    /** ISO timestamp when thinking started (first thinking token received) */
    thinkingStartedAt?: string;

    /** ISO timestamp when thinking completed (thinking block closed) */
    thinkingCompletedAt?: string;

    /** Duration of thinking phase in seconds (computed from timestamps) */
    thinkingDurationSeconds?: number;
  };
}
```

#### 4.2.2 New Store Actions

```typescript
interface ChatActions {
  // ... existing actions ...

  /** Append a thinking content delta to the specified message */
  appendThinkingContent: (sessionId: string, messageId: string, delta: string) => void;

  /** Mark thinking as started for a message */
  startThinking: (sessionId: string, messageId: string) => void;

  /** Mark thinking as completed for a message, recording final duration */
  completeThinking: (sessionId: string, messageId: string) => void;
}
```

### 4.3 SSE Stream Parsing

#### 4.3.1 Protocol: How Thinking Tokens Arrive

The web app calls `POST /api/llm/v1/chat/completions` (or `/v2/chat`) with `stream: true` and `thinking_mode: true`. The server-side route handler (`apps/web/app/api/llm/v1/chat/completions/route.ts`) already transforms Anthropic's native SSE events into an OpenAI-compatible format:

1. **Thinking start**: Anthropic `content_block_start` with `type: "thinking"` is transformed to `data: {"choices":[{"delta":{"content":"<thinking>"}}]}`.
2. **Thinking delta**: Anthropic `content_block_delta` with `type: "thinking_delta"` is transformed to `data: {"choices":[{"delta":{"content":"[thinking text]"}}]}`.
3. **Thinking stop**: Anthropic `content_block_stop` for a thinking block is transformed to `data: {"choices":[{"delta":{"content":"</thinking>"}}]}`.

For OpenAI models with `reasoning_effort`, thinking content may arrive as a `reasoning_content` field or as inline `<think>...</think>` tags depending on the model.

#### 4.3.2 Client-Side Parsing Requirements

The SSE consumer on the web client must:

1. **Detect thinking start**: When a `<thinking>` tag is encountered in the streamed content delta, transition the message into thinking state (`isThinkingStreaming: true`, record `thinkingStartedAt`).
2. **Accumulate thinking content**: All content between `<thinking>` and `</thinking>` tags is appended to `thinkingContent` on the message metadata (NOT to the main `content` field).
3. **Detect thinking end**: When `</thinking>` is encountered, transition out of thinking state (`isThinkingStreaming: false`, record `thinkingCompletedAt`, compute `thinkingDurationSeconds`).
4. **Resume normal content**: Content after `</thinking>` is appended to the main `content` field as usual.
5. **Handle multiple thinking blocks**: A response may contain multiple `<thinking>...</thinking>` blocks interleaved with content. Each one generates a separate ThinkingBlock in the UI.
6. **Tag pattern support**: Recognize all patterns used across providers: `<thinking>`, `<antthinking>`, `<think>`, `[THINKING]`, `<reasoning>`, `<cot>`.

### 4.4 User Preferences

The existing `chat-preferences-store.ts` already has a `thinkingEnabled: boolean` field. This controls whether the `thinking_mode` parameter is sent in the API request. No new preference fields are needed for visualization -- the ThinkingBlock renders whenever thinking content is present in the message metadata, regardless of the preference setting (the user may receive thinking content from a model that always reasons).

### 4.5 Multiple Thinking Blocks Per Response

Some models produce interleaved reasoning: think, then write some content, then think again, then write more. The implementation must support rendering multiple ThinkingBlock components within a single MessageBubble, each corresponding to one `<thinking>...</thinking>` segment. The blocks appear in order, interspersed with regular content sections.

Data model approach: Store an array of thinking segments rather than a single string.

```typescript
interface ThinkingSegment {
  /** Unique ID for React key stability */
  id: string;
  /** The raw thinking text */
  content: string;
  /** True while this segment is actively streaming */
  isStreaming: boolean;
  /** When this segment's thinking started */
  startedAt: string;
  /** When this segment's thinking completed (null if streaming) */
  completedAt: string | null;
  /** Duration in seconds */
  durationSeconds?: number;
}
```

The `metadata.thinkingSegments: ThinkingSegment[]` array replaces the single `thinkingContent` string for the multi-block case. For backward compatibility and simplicity, `metadata.thinkingContent` is retained as a convenience accessor that returns the concatenation of all segments.

### 4.6 Accessibility Requirements

- ThinkingBlock header must be a `<button>` with `aria-expanded`.
- Content region must have `role="region"` and `aria-labelledby` pointing to the header.
- Duration counter must use `aria-live="polite"` so screen readers announce elapsed time periodically (every 10 seconds, not every 1 second -- to avoid excessive announcements).
- Keyboard: Enter/Space toggles expanded state. Focus ring visible on the header.
- Reduced motion: When `prefers-reduced-motion` is active, disable the pulse animation on the Brain icon and use instant expand/collapse instead of height transition.

---

## 5. Technical Specification

### 5.1 New/Modified Files

| File                                                                | Action        | Description                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/features/chat/components/ThinkingBlock.tsx`               | **Rewrite**   | Replace the minimal existing implementation with the full-featured version described in Section 4.1. Add duration timer, streaming content, auto-scroll, preview, accessibility.                                                                    |
| `apps/web/features/chat/stores/chat-store.ts`                       | **Modify**    | Add `thinkingContent`, `isThinkingStreaming`, `thinkingStartedAt`, `thinkingCompletedAt`, `thinkingDurationSeconds`, `thinkingSegments` fields to `ChatMessage.metadata`. Add `appendThinkingContent`, `startThinking`, `completeThinking` actions. |
| `apps/web/features/chat/components/messages/MessageBubble.tsx`      | **Modify**    | Already imports and renders `ThinkingBlock`. Verify it correctly passes the new metadata fields. Add support for rendering multiple `ThinkingSegment` blocks when `thinkingSegments` array is present.                                              |
| `apps/web/features/chat/hooks/use-chat-interface.ts`                | **Modify**    | Update the SSE stream consumer to detect `<thinking>` / `</thinking>` tags, separate thinking content from main content, and call the new store actions.                                                                                            |
| `apps/web/features/chat/components/messages/ReasoningAccordion.tsx` | **No change** | Retained for the `thinkingSteps` (legacy string array) display. The new ThinkingBlock handles the extended thinking content use case. Both can coexist: ThinkingBlock for raw thinking streams, ReasoningAccordion for structured step arrays.      |
| `apps/web/features/chat/components/messages/ChatMessageList.tsx`    | **Modify**    | Update the memoization comparison to also track `metadata.isThinkingStreaming` and `metadata.thinkingContent` length changes so the list re-renders when thinking updates arrive.                                                                   |
| `apps/web/features/chat/stores/chat-preferences-store.ts`           | **No change** | `thinkingEnabled` already exists.                                                                                                                                                                                                                   |

### 5.2 Component Architecture

```
MessageBubble
  |
  +-- ThinkingBlock (0..N per message)
  |     |-- Header (icon + label + duration + chevron)
  |     +-- Content (collapsible, monospace, scrollable)
  |
  +-- Main content (ReactMarkdown)
  +-- ArtifactBlock
  +-- ReasoningAccordion (legacy thinkingSteps, if present)
```

### 5.3 State Machine for a Single ThinkingBlock

```
[idle] ---(first thinking token)---> [streaming]
  |                                       |
  |                                       +---(</thinking> tag)---> [completed]
  |                                       |
  |                                       +---(stream error/abort)---> [completed_partial]
  |
  +---(message loaded from DB with thinkingContent)---> [completed]
```

States:

- **idle**: No thinking content. ThinkingBlock is not rendered.
- **streaming**: `isThinkingStreaming === true`. Brain pulses, duration ticks, content streams.
- **completed**: `isThinkingStreaming === false`, `thinkingContent` is non-empty. Brain static, "Thought for Xs", collapsed.
- **completed_partial**: Stream was interrupted. Same visual as completed but content may be truncated.

### 5.4 Duration Calculation

Two sources of truth for duration, in priority order:

1. **Client-side timer** (primary): `startedAt` is recorded when the first thinking delta arrives. `completedAt` is recorded when `</thinking>` is parsed. Duration = `completedAt - startedAt` in seconds, rounded to nearest integer.
2. **Server-reported** (fallback): If the API response includes a `usage.thinking_time_ms` or similar field in the final SSE event, prefer it over the client timer for accuracy.

The client-side timer is the live display source during streaming. It is updated every 1000ms via `setInterval`, cleaned up on unmount or completion.

### 5.5 SSE Parsing Algorithm (Pseudocode)

```
state = { inThinking: false, thinkingBuffer: "", contentBuffer: "" }

for each SSE delta:
  text = delta.choices[0].delta.content

  while text is not empty:
    if state.inThinking:
      endIdx = text.indexOf("</thinking>")
      if endIdx >= 0:
        state.thinkingBuffer += text.slice(0, endIdx)
        store.appendThinkingContent(sessionId, messageId, text.slice(0, endIdx))
        store.completeThinking(sessionId, messageId)
        state.inThinking = false
        text = text.slice(endIdx + "</thinking>".length)
      else:
        state.thinkingBuffer += text
        store.appendThinkingContent(sessionId, messageId, text)
        text = ""
    else:
      startIdx = text.indexOf("<thinking>")
      if startIdx >= 0:
        // Content before <thinking> tag goes to main content
        if startIdx > 0:
          store.appendToMessage(sessionId, messageId, text.slice(0, startIdx))
        store.startThinking(sessionId, messageId)
        state.inThinking = true
        text = text.slice(startIdx + "<thinking>".length)
      else:
        store.appendToMessage(sessionId, messageId, text)
        text = ""
```

This handles:

- Tags split across SSE chunks (partial `<think` in one delta, `ing>` in the next) -- requires buffering partial tags.
- Multiple thinking blocks in one response.
- Content interleaved between thinking blocks.

**Partial tag buffering**: If a delta ends with a partial tag (e.g., `<think`), buffer the last N characters (where N = max tag length) and defer processing until the next delta confirms or refutes a tag match.

---

## 6. Data Flow

### 6.1 End-to-End Flow

```
User sends message
       |
       v
[ChatInput] --onSubmit--> [use-chat-interface hook]
       |
       v
POST /api/llm/v1/chat/completions (stream: true, thinking_mode: true)
       |
       v
[API Route] --- forwards to LLM provider (Anthropic / OpenAI / etc.)
       |
       v
Provider returns SSE stream with thinking blocks
       |
       v
[API Route TransformStream] --- transforms Anthropic format to OpenAI format
  - content_block_start (thinking) --> {"delta":{"content":"<thinking>"}}
  - content_block_delta (thinking_delta) --> {"delta":{"content":"[text]"}}
  - content_block_stop (thinking) --> {"delta":{"content":"</thinking>"}}
       |
       v
SSE stream reaches client
       |
       v
[use-chat-interface hook] --- parses SSE events
  - Detects <thinking> tag --> calls store.startThinking()
  - Accumulates thinking text --> calls store.appendThinkingContent()
  - Detects </thinking> tag --> calls store.completeThinking()
  - Regular content --> calls store.appendToMessage()
       |
       v
[chat-store] --- Zustand state update (immer)
  - message.metadata.thinkingContent updated
  - message.metadata.isThinkingStreaming toggled
  - message.metadata.thinkingStartedAt / completedAt set
       |
       v
[MessageBubble] --- re-renders (memoization checks metadata changes)
       |
       v
[ThinkingBlock] --- renders based on metadata
  - isThinkingStreaming=true: live timer, expanded, streaming content
  - isThinkingStreaming=false: "Thought for Xs", collapsed, full content
```

### 6.2 Persistence

When the SSE stream completes and the final message is saved to Supabase (`saveMessageToDb`), the `metadata` field (JSONB column) includes the thinking fields. On reload (`loadMessagesFromDb`), messages with `thinkingContent` will render ThinkingBlocks in completed state.

### 6.3 Non-Thinking-Capable Models

If the model does not support thinking (e.g., GPT-5.4-nano, Gemini Flash Lite), no `<thinking>` tags will appear in the stream. The ThinkingBlock is never rendered. The existing `TypingIndicator` continues to show during the pre-first-token phase.

---

## 7. Implementation Plan

### Phase 1: Store Layer (Estimated: 2 hours)

1. Extend `ChatMessage.metadata` type in `chat-store.ts` with thinking fields.
2. Implement `appendThinkingContent`, `startThinking`, `completeThinking` actions.
3. Unit test the store actions in isolation.

### Phase 2: SSE Parser Update (Estimated: 3 hours)

1. Modify `use-chat-interface.ts` SSE consumer to detect thinking tags.
2. Implement the tag-aware content splitter (handle partial tags across chunks).
3. Wire thinking content to the new store actions.
4. Handle all tag variants: `<thinking>`, `<antthinking>`, `<think>`, `[THINKING]`, `<reasoning>`, `<cot>`.
5. Unit test with mock SSE streams containing thinking blocks.

### Phase 3: ThinkingBlock Component Rewrite (Estimated: 4 hours)

1. Rewrite `apps/web/features/chat/components/ThinkingBlock.tsx` with all features from Section 4.1.
2. Implement live duration timer with `useEffect` + `setInterval`.
3. Implement auto-scroll with scroll-position detection.
4. Implement collapsed preview extraction.
5. Add `prefers-reduced-motion` support.
6. Add full ARIA attributes.

### Phase 4: MessageBubble Integration (Estimated: 2 hours)

1. Update `MessageBubble.tsx` to render ThinkingBlock from `metadata.thinkingContent` (already partially wired -- verify and extend).
2. Support multiple `ThinkingSegment` blocks: render N ThinkingBlock components interleaved with content sections.
3. Update memoization comparison function to track thinking metadata.

### Phase 5: ChatMessageList Memoization (Estimated: 1 hour)

1. Update `ChatMessageList` and `MessageGroupRow` memo comparisons to include `metadata.isThinkingStreaming` and `metadata.thinkingContent?.length` in the equality check.
2. Ensure thinking content streaming causes re-renders of only the affected message bubble.

### Phase 6: Testing (Estimated: 3 hours)

1. Unit tests for ThinkingBlock component (render states, toggle, timer, accessibility).
2. Unit tests for SSE tag parser (single block, multiple blocks, split tags, empty thinking, malformed tags).
3. Unit tests for store actions.
4. Integration test: mock SSE stream triggers ThinkingBlock render with correct content.
5. Manual test matrix (see Section 9).

### Phase 7: Polish and Edge Cases (Estimated: 2 hours)

1. Handle edge cases from Section 8.
2. Performance profiling: ensure high-frequency store updates during thinking streaming do not cause jank.
3. Dark mode verification.
4. Mobile viewport testing.

**Total estimated effort**: 17 hours (~2.5 engineering days).

---

## 8. Edge Cases

### 8.1 Very Long Thinking (10+ minutes)

- Duration format handles large values: "12m 34s".
- ThinkingBlock content area remains scrollable; max-height prevents it from consuming the entire viewport.
- No timeout on the client -- the timer continues until `</thinking>` arrives or the stream errors/closes.
- If the stream connection is lost during thinking, the ThinkingBlock transitions to `completed_partial` state showing whatever content was received with a "(stream interrupted)" suffix.

### 8.2 Empty Thinking Block

- `<thinking></thinking>` with no content between the tags.
- ThinkingBlock is NOT rendered when `thinkingContent` is empty or whitespace-only.
- Duration is still recorded (may be 0s) but the block is hidden.

### 8.3 Thinking Without Final Answer

- The model produces a thinking block but the stream ends (via `[DONE]` or connection close) before any content tokens arrive.
- Display: The ThinkingBlock shows in completed state. Below it, a subtle message: "The model finished thinking but did not produce a response." This prevents the user from seeing an empty chat bubble.

### 8.4 Thinking Tags Split Across SSE Chunks

- A delta might end with `<think` and the next delta starts with `ing>text...`.
- The parser must buffer potential partial tags (up to 14 characters, the length of `</antthinking>`) and re-evaluate on the next delta.
- If the buffer does not complete a valid tag within 2 deltas, flush it as regular content.

### 8.5 Nested or Malformed Tags

- `<thinking>some <thinking>nested</thinking> content</thinking>` -- treat as a single block. The inner `<thinking>` is literal text within the thinking content.
- `<thinking>unclosed content` (stream ends without `</thinking>`) -- treat as completed_partial. Show the content, note the incomplete state.
- Tags with attributes (`<thinking type="extended">`) -- strip attributes, recognize as thinking tag.

### 8.6 Non-Streaming Responses

- If the user (or API) requests `stream: false`, the complete response arrives at once.
- The full response content is scanned for `<thinking>...</thinking>` blocks.
- ThinkingBlocks are rendered in completed state immediately (no streaming animation, duration from server metadata if available).

### 8.7 Rapid Model Switching

- User switches models mid-conversation. The new model may or may not support thinking.
- No special handling needed -- ThinkingBlock renders only when `thinkingContent` is present in the message metadata.

### 8.8 Message Edit / Regenerate

- If the user regenerates a response that originally had thinking content, the old thinking content is discarded when the new message replaces it.
- The regenerated response may or may not produce new thinking content.

### 8.9 Copy to Clipboard

- When the user copies the message content (via the copy button), thinking content is NOT included by default.
- A future enhancement (out of scope for this PRD) may add a "Copy with reasoning" option.

### 8.10 Persistence Across Page Reload

- Thinking metadata is persisted in the Zustand persist layer (localStorage) and in Supabase (JSONB column).
- On page reload, ThinkingBlocks render in completed state from persisted data.
- The live timer is NOT restored -- it shows the final duration from `thinkingDurationSeconds`.

---

## 9. Test Matrix

| Scenario                                | Model                             | Expected Behavior                                                            |
| --------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Simple prompt, no thinking              | Any                               | No ThinkingBlock rendered                                                    |
| Complex prompt, thinking enabled        | Claude Sonnet 4.6                 | ThinkingBlock streams content, shows duration, collapses on completion       |
| Complex prompt, thinking enabled        | Claude Opus 4                     | Same as above, potentially longer duration                                   |
| Thinking mode off, model reasons anyway | DeepSeek R1                       | ThinkingBlock still renders (tag-based detection, independent of preference) |
| Multiple thinking blocks                | Claude with interleaved reasoning | Multiple ThinkingBlock components rendered in order                          |
| Empty thinking block                    | Anthropic (edge case)             | No ThinkingBlock rendered                                                    |
| Stream interrupted mid-thinking         | Any                               | ThinkingBlock shows partial content, completed_partial state                 |
| Non-streaming response with thinking    | Any                               | ThinkingBlock rendered in completed state immediately                        |
| Page reload after thinking response     | Any                               | ThinkingBlock rendered from persisted metadata                               |
| Mobile viewport (320px-768px)           | Any                               | Collapsed preview hidden, compact layout                                     |

---

## 10. Success Metrics

| Metric                                  | Current               | Target                           | Measurement                                                                 |
| --------------------------------------- | --------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| Users who abandon during thinking phase | Unknown (no tracking) | < 5%                             | Analytics event: "thinking_started" without subsequent "response_completed" |
| ThinkingBlock expand rate               | N/A                   | > 30% of thinking responses      | Click tracking on ThinkingBlock toggle                                      |
| Time-to-first-byte perception           | Poor (no feedback)    | Good (immediate visual feedback) | User satisfaction survey                                                    |
| Competitive parity score (thinking viz) | 0/5                   | 5/5                              | Internal audit against Claude.ai/ChatGPT                                    |

---

## 11. Out of Scope

The following are explicitly NOT part of this PRD and should be tracked as follow-up work:

1. **Thinking budget UI**: Letting users configure thinking token budget (low/medium/high) from the chat input. The `thinkingEnabled` toggle in preferences exists but budget controls are separate work.
2. **Thinking cost display**: Showing the token cost of the thinking phase separately from the response cost.
3. **Thinking content search**: Searching across thinking content in chat history.
4. **Thinking content export**: Exporting reasoning chains as standalone documents.
5. **Desktop parity audit**: The desktop app has `ReasoningAccordion` and `ThinkingMessageBlock` with additional features (syntax highlighting via Prism, simple-mode toggle, widget integration). Porting those enhancements to web is separate work.
6. **Thinking for non-streaming models**: Some local models (Ollama) may support thinking but not streaming. Batch thinking visualization is a separate enhancement.

---

## 12. Dependencies

| Dependency                                          | Status                                                                                   | Risk                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Server-side thinking tag transformation (API route) | Already implemented in `apps/web/app/api/llm/v1/chat/completions/route.ts` lines 776-868 | Low -- working for Anthropic. Other providers may need similar transforms. |
| `framer-motion` for animations                      | Already in web app dependencies                                                          | None                                                                       |
| Lucide `Brain` icon                                 | Already imported in `MessageBubble.tsx`                                                  | None                                                                       |
| Radix UI `Collapsible`                              | Already used in `MessageBubble.tsx` for thinking steps                                   | None                                                                       |
| Zustand immer middleware                            | Already used in `chat-store.ts`                                                          | None                                                                       |

---

## 13. References

- **Desktop ThinkingMessageBlock**: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/ThinkingMessageBlock.tsx`
- **Desktop ReasoningAccordion**: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ReasoningAccordion.tsx`
- **Desktop thinkingStore**: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/thinkingStore.ts`
- **Web ThinkingBlock (current)**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/ThinkingBlock.tsx`
- **Web MessageBubble**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/messages/MessageBubble.tsx`
- **Web ReasoningAccordion**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/messages/ReasoningAccordion.tsx`
- **Web chat store**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/stores/chat-store.ts`
- **Web chat preferences**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/stores/chat-preferences-store.ts`
- **API route (SSE transform)**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/llm/v1/chat/completions/route.ts`
- **LLM provider base interface**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/llm-providers/base.ts`
- **Desktop MessageBubble types**: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/types.ts`
