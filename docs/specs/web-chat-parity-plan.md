# Web Chat — Claude.ai Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make agiworkforce.com/chat a world-class claude.ai alternative by upgrading the chat UI with polished code blocks, improved message rendering, a claude.ai-style empty state, better streaming UX, and a model selector in the composer.

**Architecture:** Enhance existing Next.js web chat components (already 48K+ LOC of infrastructure). Port the best UI patterns from the desktop UnifiedAgenticChat (160 files). All changes are in `apps/web/` — no Rust/backend changes needed. Uses existing Zustand stores, Supabase persistence, and SSE streaming.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS 4, Zustand, react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight, framer-motion, lucide-react, Radix UI.

---

## File Structure

### New files to create:

| File                                                          | Responsibility                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `features/chat/components/CodeBlock.tsx`                      | Syntax-highlighted code block with language badge, copy, download buttons (port from desktop) |
| `features/chat/components/messages/ThinkingIndicator.tsx`     | Animated "thinking" shimmer while waiting for first token                                     |
| `features/chat/components/Composer/ModelSelectorDropdown.tsx` | Inline model picker dropdown for the composer area                                            |

### Existing files to modify:

| File                                                             | Changes                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `app/chat/page.tsx`                                              | New claude.ai-style empty state with categorized prompts, branding, model selector |
| `app/chat/[sessionId]/page.tsx`                                  | Move model selector from header into composer area, cleaner layout                 |
| `app/chat/ChatLayoutShell.tsx`                                   | Polish sidebar animations, mobile UX, gradient removal                             |
| `features/chat/components/messages/MessageBubble.tsx`            | Use new CodeBlock, better avatar/spacing, copy-all button, thinking block          |
| `features/chat/components/messages/EnhancedMarkdownRenderer.tsx` | Integrate new CodeBlock component, improve table/list styling                      |
| `features/chat/components/messages/ChatMessageList.tsx`          | Improve spacing between message groups, max-width constraint                       |
| `features/chat/components/Composer/ChatComposerNew.tsx`          | Add inline model selector, simplify toolbar, claude.ai-style border                |
| `features/chat/components/messages/TypingIndicator.tsx`          | Upgrade to pulsing dots animation matching claude.ai                               |
| `features/chat/components/Sidebar/ChatSidebarNew.tsx`            | New chat button polish, search improvements                                        |

---

## Task 1: CodeBlock Component (Port from Desktop)

**Files:**

- Create: `apps/web/features/chat/components/CodeBlock.tsx`
- Modify: `apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx`

**Why:** The current code blocks use raw rehype-highlight with a basic copy button. Claude.ai has polished code blocks with language badges, line numbers, copy/download actions. The desktop app has this solved in `Visualizations/CodeBlock.tsx` (231 LOC).

- [ ] **Step 1: Create CodeBlock component**

Create `apps/web/features/chat/components/CodeBlock.tsx` with:

- Language detection from className (e.g., `language-python`)
- Header bar with colored language badge + filename (if present) + line count
- Copy-to-clipboard button with checkmark feedback
- Download-as-file button
- Syntax highlighting via rehype-highlight (already in deps)
- Scrollable container for long code
- Dark theme matching the chat background
- Language color map (30+ languages): `typescript: #3178c6`, `python: #3776ab`, `rust: #ce422b`, `javascript: #f7df1e`, etc.
- Inline code variant (single backtick) — just rounded bg with monospace

- [ ] **Step 2: Integrate CodeBlock into EnhancedMarkdownRenderer**

In `EnhancedMarkdownRenderer.tsx`, replace the existing `CodeBlock` local component (lines 54-80) with an import of the new `CodeBlock` component. The `components.code` override in the ReactMarkdown config should delegate to the new component.

- [ ] **Step 3: Verify code blocks render correctly**

Run: `cd apps/web && pnpm dev`
Test: Send a message that includes a fenced code block (`python ... `) and verify:

- Language badge shows "Python" with blue color
- Copy button works
- Download button creates a .py file
- Inline `code` renders with background

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/chat/components/CodeBlock.tsx apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx
git commit -m "feat(web): add polished CodeBlock component with language badges and actions"
```

---

## Task 2: Upgrade Empty State (claude.ai-style)

**Files:**

- Modify: `apps/web/app/chat/page.tsx`

**Why:** The current empty state has a sparkles icon + 6 flat prompt cards. Claude.ai has a centered, minimal welcome with categorized suggestions and the model displayed. This is the first thing users see.

- [ ] **Step 1: Redesign empty state layout**

Replace the current empty state in `app/chat/page.tsx` with:

- Large centered "AGI Workforce" wordmark (text, not image)
- Subtitle: "How can I help you today?"
- 4 categorized suggestion pills in a centered flex row (not grid):
  - "Write code" (Code icon)
  - "Analyze data" (BarChart icon)
  - "Research" (Search icon)
  - "Create content" (PenTool icon)
- Each pill is a rounded button that, on click, pre-fills the composer (not auto-sends)
- Below: 2x3 grid of specific prompt cards (keep existing but restyle)
- Model selector badge below the title showing current model
- Keyboard shortcut hint: "Press / to start typing"

- [ ] **Step 2: Add model indicator to empty state**

Import `useModelStore` and `AVAILABLE_MODELS` from `@shared/stores/model-store`. Display current model name as a small badge below the subtitle. Clicking it opens model selector.

- [ ] **Step 3: Add pre-fill behavior to suggestion pills**

Instead of calling `handleSend()` directly, suggestion pills should focus the composer textarea and set its value. Use a ref or callback to the composer. Only the specific prompt cards should auto-send.

- [ ] **Step 4: Verify empty state**

Run: `cd apps/web && pnpm dev`
Navigate to `/chat`. Verify:

- Clean centered layout
- Category pills visible
- Clicking a pill focuses composer with pre-filled text
- Model badge shows current selection
- Prompt cards still auto-send and create sessions

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/chat/page.tsx
git commit -m "feat(web): claude.ai-style empty state with categorized suggestions"
```

---

## Task 3: Message Rendering Polish

**Files:**

- Modify: `apps/web/features/chat/components/messages/MessageBubble.tsx`
- Modify: `apps/web/features/chat/components/messages/ChatMessageList.tsx`

**Why:** Messages need better visual hierarchy — claude.ai uses full-width messages (not chat bubbles), clean avatars, and subtle separators. The current MessageBubble at 788 LOC has good features but the layout needs refinement.

- [ ] **Step 1: Update ChatMessageList max-width**

In `ChatMessageList.tsx`, wrap the message groups in a container with `max-w-3xl mx-auto` (like claude.ai's centered narrow column). Add `px-4` padding.

Change the space between groups from `space-y-0.5` to `space-y-6` for clearer separation.

- [ ] **Step 2: Simplify MessageBubble layout**

In `MessageBubble.tsx`:

- Remove bubble backgrounds for assistant messages (claude.ai uses flat text, no bubble bg)
- Keep subtle bg only for user messages (light gray rounded pill)
- Move avatar to the left margin (32px avatar, then content)
- Show "AGI Workforce" label for assistant, "You" for user
- Hide timestamp by default (show on hover)
- Add "Copy" button that copies entire message content (visible on hover)
- Reduce bottom padding between messages in the same group

- [ ] **Step 3: Add hover action bar**

When hovering over an assistant message, show a floating action bar below the message with:

- Copy (copies full content)
- Retry (regenerate)
- Thumbs up / Thumbs down (feedback)
  These should appear with a subtle fade-in animation.

- [ ] **Step 4: Verify message rendering**

Run dev server, send a few messages. Verify:

- Messages are centered in a narrow column
- No background on assistant messages
- User messages have subtle pill background
- Hover shows action bar
- Copy works

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/chat/components/messages/MessageBubble.tsx apps/web/features/chat/components/messages/ChatMessageList.tsx
git commit -m "feat(web): claude.ai-style message rendering with hover actions"
```

---

## Task 4: Thinking/Streaming Indicator

**Files:**

- Create: `apps/web/features/chat/components/messages/ThinkingIndicator.tsx`
- Modify: `apps/web/features/chat/components/messages/TypingIndicator.tsx`

**Why:** Claude.ai shows a "Thinking..." shimmer with an animated gradient while the model processes. The current typing indicator is basic dots. The desktop has `ThinkingMessageBlock.tsx` with a sparkle animation.

- [ ] **Step 1: Create ThinkingIndicator component**

Create a component that shows:

- "AGI Workforce is thinking..." text with a shimmer gradient animation
- Small sparkle icon (animated rotation)
- Elapsed time counter (starts from 0s, increments every second)
- Uses `prefers-reduced-motion` to disable animations for accessibility

- [ ] **Step 2: Update TypingIndicator**

Replace the existing typing dots in `TypingIndicator.tsx` with the new `ThinkingIndicator`. The parent `ChatMessageList.tsx` already conditionally renders `<TypingIndicator />` when `showTypingIndicator` is true — no parent changes needed.

- [ ] **Step 3: Add streaming cursor to messages**

In `MessageBubble.tsx`, when `message.isStreaming` is true, append a blinking cursor (`▊`) after the last character of the content. This gives visual feedback that text is still arriving.

- [ ] **Step 4: Verify streaming UX**

Send a message and observe:

- "Thinking..." shimmer appears before first token
- Once streaming starts, the shimmer disappears and text streams in with a blinking cursor
- When streaming completes, cursor disappears

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/chat/components/messages/ThinkingIndicator.tsx apps/web/features/chat/components/messages/TypingIndicator.tsx apps/web/features/chat/components/messages/MessageBubble.tsx
git commit -m "feat(web): thinking shimmer + streaming cursor for claude.ai-style UX"
```

---

## Task 5: Composer Model Selector

**Files:**

- Create: `apps/web/features/chat/components/Composer/ModelSelectorDropdown.tsx`
- Modify: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- Modify: `apps/web/app/chat/[sessionId]/page.tsx`

**Why:** Claude.ai shows the model name right above the composer input. Currently the model selector is in the session page header. Moving it to the composer area makes it more discoverable and matches claude.ai's pattern.

- [ ] **Step 1: Create ModelSelectorDropdown**

Create a Radix UI `DropdownMenu` component that:

- Shows the current model name as a clickable button (small, subtle)
- Opens a dropdown with model groups: "Auto", "Anthropic", "OpenAI", "Google", "Other"
- Each model shows: name, description, tier badge (Economy/Pro/Max)
- Uses `useModelStore` for state
- Matches the desktop's `QuickModelSelector.tsx` pattern

- [ ] **Step 2: Integrate into ChatComposerNew**

In `ChatComposerNew.tsx`:

- Add `<ModelSelectorDropdown />` above the textarea, left-aligned
- Position: between the top of the composer area and the textarea
- Style: small text, muted color, with a chevron-down icon

- [ ] **Step 3: Remove model selector from session header**

In `app/chat/[sessionId]/page.tsx`:

- Remove the `ModelSelectorButton` from the header bar
- Keep the session title in the header
- The header becomes: just the session title (clean, minimal)

- [ ] **Step 4: Verify model selector**

Run dev server, navigate to a chat session. Verify:

- Model name appears above composer input
- Clicking opens dropdown with all models
- Selecting a model updates the store
- Header is cleaner without the model selector

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/chat/components/Composer/ModelSelectorDropdown.tsx apps/web/features/chat/components/Composer/ChatComposerNew.tsx apps/web/app/chat/[sessionId]/page.tsx
git commit -m "feat(web): model selector in composer area (claude.ai pattern)"
```

---

## Task 6: Composer Visual Polish

**Files:**

- Modify: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`

**Why:** The composer has many features (672 LOC) but the visual design needs refinement. Claude.ai's composer is a clean rounded rectangle with minimal chrome — just the textarea + send button, with tools tucked away.

- [ ] **Step 1: Simplify composer chrome**

In `ChatComposerNew.tsx`:

- Remove or collapse the focus mode buttons, agent mode switcher, and folder selector into a "+" overflow menu
- Keep visible: textarea, send button, attach button (paperclip icon)
- The model selector (from Task 5) sits above the textarea
- Border: 1px rounded-xl border that highlights on focus (like claude.ai)
- Background: slightly elevated from the page background
- Max-width: match the message column (max-w-3xl mx-auto)

- [ ] **Step 2: Improve textarea behavior**

- Placeholder: "Message AGI Workforce..." (like "Message Claude...")
- Auto-resize: min 1 line, max 12 lines
- Cmd+Enter to send (alongside Enter without shift)
- Character count (subtle, bottom-right, only shows > 1000 chars)

- [ ] **Step 3: Polish send button**

- Arrow-up icon when ready to send (like claude.ai)
- Stop icon (square) when generating (clicking stops generation)
- Disabled state when textarea is empty
- Smooth transition between states

- [ ] **Step 4: Verify composer UX**

Run dev server. Verify:

- Clean, centered composer
- Textarea auto-resizes
- Send button transitions between arrow-up and stop
- Overflow menu contains advanced features
- Focus highlight on the border

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/chat/components/Composer/ChatComposerNew.tsx
git commit -m "feat(web): polished composer with claude.ai-style minimal design"
```

---

## Task 7: Sidebar Polish

**Files:**

- Modify: `apps/web/features/chat/components/Sidebar/ChatSidebarNew.tsx`
- Modify: `apps/web/app/chat/ChatLayoutShell.tsx`

**Why:** The sidebar is functional but needs visual polish. Claude.ai has a clean sidebar with hover states, smooth transitions, and a prominent "New chat" button.

- [ ] **Step 1: Polish sidebar header**

In `ChatSidebarNew.tsx`:

- "New chat" button: full-width, prominent, with a + icon and "New chat" text
- Below: search input (always visible, not toggled)
- Below: session list with time grouping

- [ ] **Step 2: Improve session item hover states**

Each session in the list should:

- Show a subtle background on hover
- Show a "..." menu button on hover (right side)
- Active session: bold text + accent left border
- Truncate long titles with ellipsis

- [ ] **Step 3: Polish ChatLayoutShell transitions**

In `ChatLayoutShell.tsx`:

- Sidebar collapse: smooth width transition (200ms ease)
- Remove the gradient overlay at the bottom of the main content area (it obscures content)
- Mobile sidebar: slide in from left with backdrop blur

- [ ] **Step 4: Verify sidebar**

Run dev server. Verify:

- New chat button is prominent
- Search is always visible
- Sessions show hover states
- Collapse animation is smooth
- Mobile overlay works

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/chat/components/Sidebar/ChatSidebarNew.tsx apps/web/app/chat/ChatLayoutShell.tsx
git commit -m "feat(web): polished sidebar with smooth transitions and hover states"
```

---

## Task 8: Dark/Light Theme Consistency

**Files:**

- Modify: `apps/web/app/chat/ChatLayoutShell.tsx` (CSS variables)
- Possibly modify: `apps/web/app/globals.css` or theme config

**Why:** The chat uses CSS custom properties (`--chat-bg`, `--chat-border-subtle`) that need to be defined for both dark and light themes. Claude.ai has excellent dark mode support.

- [ ] **Step 1: Audit CSS variables**

Check that all `--chat-*` variables are defined in both `:root` and `[data-theme="dark"]` / `.dark` selectors. Key variables:

- `--chat-bg`: main background
- `--chat-border-subtle`: borders
- `--chat-input-bg`: composer background
- `--chat-code-bg`: code block background

- [ ] **Step 2: Add missing variable definitions**

If any are missing, add them to the global CSS. Dark theme should use the desktop app's design tokens:

- Background: `#0f0f0f` (base), `#1a1a1a` (elevated)
- Accent: `#21808d` (teal)
- Text: `rgba(255, 255, 255, 0.92)` (primary), `rgba(255, 255, 255, 0.55)` (secondary)

Light theme:

- Background: `#ffffff` (base), `#f9fafb` (elevated)
- Text: standard gray-900/gray-500

- [ ] **Step 3: Verify both themes**

Toggle between light and dark mode. Verify all chat components render correctly in both themes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css apps/web/app/chat/ChatLayoutShell.tsx
git commit -m "feat(web): consistent dark/light theme for chat interface"
```

---

## Execution Order

Tasks 1-4 are independent and can be parallelized. Tasks 5-6 are sequential (model selector then composer polish). Task 7 is independent. Task 8 depends on all others being done.

**Recommended parallel execution:**

- Agent A: Task 1 (CodeBlock) + Task 2 (Empty State)
- Agent B: Task 3 (Message Rendering) + Task 4 (Thinking Indicator)
- Agent C: Task 5 (Model Selector) + Task 6 (Composer Polish)
- Agent D: Task 7 (Sidebar Polish)
- Final: Task 8 (Theme Consistency) — run after all others merge

**Estimated total effort:** 8 tasks, each 15-30 minutes = ~3-4 hours of focused work.
