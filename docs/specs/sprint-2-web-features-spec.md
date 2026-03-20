# Specification: Sprint 2 -- Web Medium-Effort Features
Generated: 2026-03-20T01:30:00Z

## Task Overview

Implement four medium-effort features from the Web Competitive Audit gap analysis:

| PRD # | Feature | Source Definition | Effort |
|-------|---------|-------------------|--------|
| #2 | Inline Citation Source Cards | `docs/WEB_COMPETITIVE_AUDIT.md` lines 444-449 | 1-2 days |
| #3 | Thinking/Reasoning Visualization | `docs/specs/PRD-003-thinking-reasoning-visualization.md` (full PRD, 31KB) | 2.5 days |
| #5 | Design System Token Formalization | `docs/WEB_COMPETITIVE_AUDIT.md` lines 583-595, `apps/web/app/globals.css` | 2 days |
| #8 | Rich Content Widget Cards | `apps/web/features/chat/components/cards/index.tsx` (exists, needs expansion) | 2 days |

These four features close the most visible competitive gaps against Claude.ai and Perplexity on the web surface without touching backend Rust code.

---

## Team Composition

- **Agent A (Citations)**: Builds `SearchSourceCard` component, inline citation markers in MessageBubble markdown renderer, and citation data extraction.
- **Agent B (Thinking Viz)**: Rewrites `ThinkingBlock.tsx`, adds SSE tag parsing to `chat-ai-service.ts`, and wires thinking store actions.
- **Agent C (Design System)**: Formalizes CSS custom property tokens, creates the `design-tokens.ts` manifest, adds component primitives (`ChatCard`, `StatusPill`).
- **Agent D (Rich Widgets)**: Expands the `cards/` system with new card types (weather, event, code-run, location) and hooks the card detector into MessageBubble rendering flow.

---

## File Allocation

### Agent A -- Citations

**Allowed Files (create or modify):**

| File | Action |
|------|--------|
| `apps/web/features/chat/components/citations/SearchSourceCard.tsx` | CREATE |
| `apps/web/features/chat/components/citations/CitationMarker.tsx` | CREATE |
| `apps/web/features/chat/components/citations/CitationTooltip.tsx` | CREATE |
| `apps/web/features/chat/components/citations/index.ts` | CREATE |
| `apps/web/features/chat/components/citations/types.ts` | CREATE |
| `apps/web/features/chat/components/messages/MessageBubble.tsx` | MODIFY (citation rendering inside markdown components only) |
| `apps/web/features/chat/components/search/SearchResults.tsx` | MODIFY (export `SearchResult` interface, add source-card variant) |

**Current State:**
- `SearchResults.tsx` (80 lines read) renders web search results as card list with favicon, title, domain, snippet. Already imports `SearchResponse` type from `@core/integrations/web-search-handler`.
- `InlineSearchResults.tsx` (in desktop, 80 lines read) has a `SearchResult` interface with: `title`, `url`, `snippet`, `favicon?`, `domain?`, `position?`. This is the shape to reuse.
- `MessageBubble.tsx` (line 56-61) already renders `<SearchResults>` for `metadata.searchResults` and uses `ReactMarkdown` with `remarkGfm`, `remarkMath`, `rehypeHighlight`, `rehypeRaw`. Citation markers `[1]`, `[2]`, etc. must be intercepted in the markdown `components` override for `a` or a custom remark plugin.
- The `Message` interface (MessageBubble.tsx line 101-155) has `metadata.searchResults?: SearchResponse` already. No new metadata fields are needed -- citations are rendered from the existing search results data.

**Will Produce:**
- `SearchSourceCard` component: a compact card (favicon + domain + title + snippet) used both standalone (in search results) and in tooltip (for inline citations).
- `CitationMarker` component: a superscript badge `[1]` that on hover shows a `CitationTooltip` with the source card.
- Export: `interface CitationSource { index: number; title: string; url: string; snippet: string; domain: string; favicon?: string; }`

**DO NOT TOUCH:**
- `apps/web/features/chat/stores/chat-store.ts` -- no store changes needed for citations
- `apps/web/features/chat/services/chat-ai-service.ts` -- Agent B owns this file
- `apps/web/app/globals.css` -- Agent C owns this file
- Any file in `apps/web/features/chat/components/cards/` -- Agent D owns this directory

---

### Agent B -- Thinking Visualization

**Allowed Files (create or modify):**

| File | Action |
|------|--------|
| `apps/web/features/chat/components/ThinkingBlock.tsx` | REWRITE (163 lines currently, expand to full PRD-003 spec) |
| `apps/web/features/chat/services/chat-ai-service.ts` | MODIFY (SSE parsing to detect thinking tags) |
| `apps/web/features/chat/stores/chat-store.ts` | MODIFY (thinking actions only: `startThinking`, `appendThinkingContent`, `completeThinking`) |
| `apps/web/features/chat/components/messages/ChatMessageList.tsx` | MODIFY (memoization update for thinking metadata) |
| `apps/web/features/chat/components/ThinkingBlock.test.tsx` | CREATE |

**Current State:**

`ThinkingBlock.tsx` (163 lines, fully read):
- Functional but minimal: has Brain icon (pulse while streaming), ChevronDown toggle, content area with auto-scroll, collapsed preview.
- MISSING from PRD-003: live duration timer, "Thought for Xs" completion label, multi-segment support, `prefers-reduced-motion`, `aria-live="polite"` on duration, `role="region"` on content.
- Already has the right color scheme (`border-purple-500/40`, `bg-purple-950/10`).

`chat-store.ts` (fully read to line 240):
- `ThinkingSegment` interface ALREADY EXISTS (lines 15-28) with `id`, `content`, `isStreaming`, `startedAt`, `completedAt`, `durationSeconds`.
- `ChatMessage.metadata` ALREADY HAS thinking fields (lines 47-58): `thinkingContent`, `isThinkingStreaming`, `thinkingStartedAt`, `thinkingCompletedAt`, `thinkingDurationSeconds`, `thinkingSegments`.
- `ChatActions` ALREADY DECLARES (lines 104-109): `startThinking`, `appendThinkingContent`, `completeThinking`.
- UNKNOWN: whether the action implementations exist further in the file. Agent B must verify and implement if missing.

`chat-ai-service.ts` (read to line 280):
- `extractContentFromSSE()` (lines 101-128) parses SSE lines, returns raw content string.
- `sendMessage()` (lines 135-272) streams via `response.body.getReader()`, calls `onChunk(content_piece)` for each SSE delta.
- CRITICAL GAP: No thinking tag detection. All content (including `<thinking>...</thinking>` tags) is passed through as raw text. Agent B must add a tag-aware content splitter between `extractContentFromSSE()` and the `onChunk` callback.
- The `onChunk` callback in `sendMessage` currently only appends to `fullResponse`. The caller (in `apps/web/app/chat/[sessionId]/page.tsx` lines 1-100) uses `onChunk` to call `useChatStore.getState().appendToMessage()`.

**Will Produce:**
- Rewritten `ThinkingBlock` with: live duration timer (useEffect + setInterval), "Thought for Xm Ys" label, multi-segment rendering, accessibility attributes, reduced-motion support.
- SSE thinking tag parser that detects `<thinking>`, `</thinking>`, `<think>`, `</think>`, `<antthinking>`, `</antthinking>` and routes content to the correct store action.
- Modified `sendMessage()` that calls `startThinking`, `appendThinkingContent`, `completeThinking` on the chat store.
- Updated `ChatMessageList` memoization to track `metadata.isThinkingStreaming` and `metadata.thinkingContent?.length`.

**DO NOT TOUCH:**
- `apps/web/features/chat/components/messages/MessageBubble.tsx` -- Agent A modifies this (but only citation rendering); Agent B should NOT modify it. The existing ThinkingBlock import (line 60) and rendering logic already works.
- `apps/web/features/chat/components/messages/ReasoningAccordion.tsx` -- legacy component, no changes needed per PRD-003 section 5.1.
- `apps/web/app/globals.css` -- Agent C owns this file
- `apps/web/features/chat/stores/chat-preferences-store.ts` -- no changes needed (`thinkingEnabled` already exists at line 8)

---

### Agent C -- Design System Token Formalization

**Allowed Files (create or modify):**

| File | Action |
|------|--------|
| `apps/web/app/globals.css` | MODIFY (organize existing tokens, add missing semantic tokens) |
| `apps/web/lib/design-tokens.ts` | CREATE (TypeScript manifest of all CSS custom properties) |
| `apps/web/shared/components/ui/chat-card.tsx` | CREATE (compound card primitive for chat surfaces) |
| `apps/web/shared/components/ui/status-pill.tsx` | CREATE (status badge with semantic color tokens) |
| `apps/web/shared/components/ui/section-header.tsx` | CREATE (reusable section header with icon slot) |
| `apps/web/lib/design-tokens.test.ts` | CREATE (validates token manifest matches CSS) |

**Current State:**

`globals.css` (read to line 200):
- Tailwind v4 `@theme` block defines 190+ CSS custom properties.
- Custom color ramps: cream (3 stops), charcoal (3 stops), terra-cotta (10 stops), warm-peach (10 stops), teal (10 stops).
- Agent status colors: `--color-agent-thinking`, `--color-agent-active`, `--color-agent-success`, `--color-agent-error`, `--color-agent-warning`.
- Surface colors: `--color-surface-floating`, `--color-surface-base`, `--color-surface-elevated`, `--color-surface-overlay`, `--color-surface-hover`.
- Chat surface aliases: `--color-chat-bg`, `--color-chat-bg-elevated`, `--color-chat-sidebar`, `--color-chat-input-bg`, `--color-chat-code-bg`, `--color-chat-accent`, `--color-chat-accent-secondary`, `--color-chat-glass`, `--color-chat-glass-border`.
- Font families: `--font-sans` (FK Grotesk/Inter), `--font-mono` (Berkeley Mono).
- Border radii: `--radius-sm` through `--radius-3xl`.
- Box shadows: `--shadow-floating-input`, `--shadow-halo-focus`.
- Animations: `--animate-accordion-down/up`, `--animate-fade-in/out`, `--animate-slide-up/down`, `--animate-pulse`, `--animate-shimmer`.

Existing UI primitives in `apps/web/shared/components/ui/`: avatar, badge, button, collapsible, input, progress, scroll-area, select, separator. (9 files).

**Will Produce:**
- `design-tokens.ts`: TypeScript object exporting all token names grouped by category (color, spacing, typography, animation, shadow, radius). Used for autocomplete and documentation, NOT for runtime CSS injection.
- MISSING TOKENS to add to `globals.css`:
  - Citation colors: `--color-citation-bg`, `--color-citation-border`, `--color-citation-text` (needed by Agent A)
  - Thinking colors: `--color-thinking-active`, `--color-thinking-border`, `--color-thinking-bg` (confirms Agent B's existing purple values)
  - Widget card colors: `--color-card-recipe`, `--color-card-comparison`, `--color-card-steps`, `--color-card-calculation` (needed by Agent D)
  - Spacing tokens: `--space-message-gap`, `--space-card-padding`, `--space-section-gap`
  - Typography tokens: `--font-size-chat-body`, `--font-size-chat-meta`, `--font-size-chat-code`, `--line-height-chat`
- `chat-card.tsx`: A compound component (`ChatCard`, `ChatCard.Header`, `ChatCard.Content`, `ChatCard.Footer`) that other agents use as a base for citation cards, widget cards, etc.
- `status-pill.tsx`: A pill component with `variant` prop mapped to semantic tokens (thinking, active, success, error, warning).
- `section-header.tsx`: Reusable header with icon slot + label + optional action button.

**DO NOT TOUCH:**
- `apps/web/features/chat/` (anything) -- Agents A, B, D own feature code
- `apps/web/features/chat/stores/` -- Agent B owns store changes
- `apps/web/features/chat/services/` -- Agent B owns service changes
- Existing UI primitives in `apps/web/shared/components/ui/` (avatar.tsx, badge.tsx, button.tsx, etc.) -- do not modify existing files, only create new ones

---

### Agent D -- Rich Content Widget Cards

**Allowed Files (create or modify):**

| File | Action |
|------|--------|
| `apps/web/features/chat/components/cards/index.tsx` | MODIFY (add new card types to registry + detector) |
| `apps/web/features/chat/components/cards/WeatherCard.tsx` | CREATE |
| `apps/web/features/chat/components/cards/EventCard.tsx` | CREATE |
| `apps/web/features/chat/components/cards/CodeRunCard.tsx` | CREATE |
| `apps/web/features/chat/components/cards/LocationCard.tsx` | CREATE |
| `apps/web/features/chat/components/cards/types.ts` | CREATE (shared card types) |
| `apps/web/features/chat/components/cards/card-utils.ts` | CREATE (shared parsing utilities) |
| `apps/web/features/chat/components/messages/MessageBubble.tsx` | MODIFY (wire `MessageCardRenderer` call, ONLY the card-rendering section) |

**Current State:**

`cards/index.tsx` (108 lines, fully read):
- Exports `CardType = 'recipe' | 'comparison' | 'calculation' | 'steps' | null`.
- `detectCardType(content)` function uses regex patterns to detect structured content.
- `MessageCardRenderer({ content, cardType })` renders the appropriate card component.
- Four card components already exist: `RecipeCard`, `ComparisonCard`, `StepsCard`, `CalculationCard`.

`CalculationCard.tsx` (read first 50 lines): Uses `Card`, `CardContent`, `CardHeader` from `@shared/ui/card`, `Badge`, `Button`, `Collapsible`. Pattern to follow for new cards.

`MessageBubble.tsx` (features/chat version, lines 100-200):
- The `Message` interface (line 101-155) has extensive metadata fields.
- Already imports `ThinkingBlock` (line 60) and `ArtifactBlock` (line 61).
- Does NOT currently import `MessageCardRenderer` from `cards/`. Agent D must add this import and call `detectCardType()` + `MessageCardRenderer` as a rendering branch.

**Will Produce:**
- Expanded `CardType`: `'recipe' | 'comparison' | 'calculation' | 'steps' | 'weather' | 'event' | 'code-run' | 'location' | null`
- `WeatherCard`: Renders weather forecasts (temperature, conditions, multi-day). Detects: "current weather", "forecast", temperature patterns.
- `EventCard`: Renders calendar events/schedules (date, time, location, attendees). Detects: "event", "schedule", date/time patterns with venue.
- `CodeRunCard`: Renders code execution results (input code, output, execution time). Detects: "```output", "execution result", "stdout".
- `LocationCard`: Renders place/address information (name, address, hours, rating). Detects: "address:", "hours:", rating patterns.
- `types.ts`: Shared types: `interface ParsedCard { type: CardType; sections: CardSection[] }`.
- `card-utils.ts`: Shared helpers for content parsing (extract sections, strip markdown headers, format numbers).

**DO NOT TOUCH:**
- Existing card files: `RecipeCard.tsx`, `ComparisonCard.tsx`, `StepsCard.tsx`, `CalculationCard.tsx` -- only modify `index.tsx` to register new types
- `apps/web/features/chat/stores/` -- no store changes needed
- `apps/web/features/chat/services/` -- Agent B owns services
- `apps/web/features/chat/components/citations/` -- Agent A owns this directory
- `apps/web/app/globals.css` -- Agent C owns this file
- `apps/web/features/chat/components/ThinkingBlock.tsx` -- Agent B owns this file

---

## Interface Contracts

### Contract 1: Agent C --> Agent A (Citation Tokens)

Agent C creates CSS custom properties that Agent A consumes:

```css
/* In globals.css -- Agent C creates these */
--color-citation-bg: rgba(33, 128, 141, 0.08);      /* teal-tinted background */
--color-citation-border: rgba(33, 128, 141, 0.25);   /* teal border */
--color-citation-text: var(--color-teal-500);          /* teal text for [n] markers */
--color-citation-hover-bg: rgba(33, 128, 141, 0.15);  /* hover state */
```

Agent A uses these via Tailwind classes: `bg-citation-bg`, `border-citation-border`, `text-citation-text`.

### Contract 2: Agent C --> Agent B (Thinking Tokens)

Agent C codifies the existing thinking colors as named tokens:

```css
/* In globals.css -- Agent C creates these */
--color-thinking-active: rgba(168, 85, 247, 0.4);     /* purple-500/40 */
--color-thinking-bg: rgba(88, 28, 135, 0.1);           /* purple-950/10 */
--color-thinking-bg-dark: rgba(88, 28, 135, 0.2);      /* purple-950/20 for dark mode */
--color-thinking-border: rgba(168, 85, 247, 0.4);      /* purple-500/40 */
--color-thinking-cursor: rgba(168, 85, 247, 0.6);      /* purple-400/60 cursor */
```

Agent B may continue using the existing Tailwind purple classes (backward compatible) OR adopt the new tokens. Both are valid. The tokens exist for consistency documentation, not as a mandatory migration.

### Contract 3: Agent C --> Agent D (Widget Card Tokens)

Agent C creates category tokens that Agent D consumes:

```css
/* In globals.css -- Agent C creates these */
--color-card-recipe: rgba(249, 115, 22, 0.08);         /* orange tint */
--color-card-comparison: rgba(59, 130, 246, 0.08);     /* blue tint */
--color-card-steps: rgba(16, 185, 129, 0.08);          /* green tint */
--color-card-calculation: rgba(168, 85, 247, 0.08);    /* purple tint */
--color-card-weather: rgba(14, 165, 233, 0.08);        /* sky tint */
--color-card-event: rgba(244, 63, 94, 0.08);           /* rose tint */
--color-card-code-run: rgba(34, 197, 94, 0.08);        /* green tint */
--color-card-location: rgba(251, 146, 60, 0.08);       /* amber tint */
```

### Contract 4: Agent A + Agent D --> MessageBubble.tsx Coordination

Both Agent A and Agent D need to modify `apps/web/features/chat/components/messages/MessageBubble.tsx`. To prevent merge conflicts:

**Agent A** modifies ONLY the ReactMarkdown `components` override (the `a` or custom component handler) to intercept `[n]` citation patterns. Agent A adds imports at the top and a citation rendering section inside the existing markdown renderer.

**Agent D** modifies ONLY the top-level rendering logic to add a `MessageCardRenderer` call BEFORE the ReactMarkdown block. Agent D adds the `cards/` import and a conditional branch:

```
// Agent D adds this structure (pseudocode):
const cardType = useMemo(() => detectCardType(message.content), [message.content]);

// In render:
{cardType ? (
  <MessageCardRenderer content={message.content} cardType={cardType} />
) : (
  // Existing ReactMarkdown block (Agent A modifies inside this)
  <ReactMarkdown ... />
)}
```

**Conflict avoidance rule**: Agent A touches lines INSIDE the ReactMarkdown `components` prop. Agent D touches lines OUTSIDE/ABOVE the ReactMarkdown block. They do not overlap.

### Contract 5: Agent B --> Chat Store (Thinking Actions)

Agent B implements the thinking actions declared in `chat-store.ts` lines 104-109. The store already declares:

```typescript
// Already in chat-store.ts ChatActions interface:
startThinking: (sessionId: string, messageId: string) => void;
appendThinkingContent: (sessionId: string, messageId: string, delta: string) => void;
completeThinking: (sessionId: string, messageId: string) => void;
```

Agent B must verify these are implemented in the store body (the `immer` callback). If not, implement them following the existing `appendToMessage` pattern.

### Contract 6: Agent B --> ChatAIService.sendMessage

Agent B modifies the `sendMessage` method to add thinking-aware SSE parsing. The contract is:

- The `onChunk` callback signature does NOT change (still `(chunk: string) => void`).
- A NEW callback `onThinkingChunk?: (chunk: string) => void` is added to the `sendMessage` params.
- A NEW callback `onThinkingStart?: () => void` is added.
- A NEW callback `onThinkingEnd?: (durationMs: number) => void` is added.
- The caller in `apps/web/app/chat/[sessionId]/page.tsx` wires these to the store actions.

### Contract 7: Shared Type -- CitationSource

Created by Agent A in `apps/web/features/chat/components/citations/types.ts`:

```typescript
export interface CitationSource {
  /** 1-based index matching the [n] marker in text */
  index: number;
  /** Page/article title */
  title: string;
  /** Full URL to the source */
  url: string;
  /** Brief excerpt/snippet from the source */
  snippet: string;
  /** Domain name (e.g., "github.com") */
  domain: string;
  /** Favicon URL (Google favicon service) */
  favicon?: string;
}
```

This type is used ONLY within Agent A's citation components. No other agent consumes it.

### Contract 8: Shared Type -- CardType Extension

Agent D extends the existing `CardType` union in `cards/index.tsx`:

```typescript
// Before (current):
export type CardType = 'recipe' | 'comparison' | 'calculation' | 'steps' | null;

// After (Agent D):
export type CardType =
  | 'recipe'
  | 'comparison'
  | 'calculation'
  | 'steps'
  | 'weather'
  | 'event'
  | 'code-run'
  | 'location'
  | null;
```

No other agent imports `CardType`, so this is safe.

---

## DO NOT TOUCH Sections

These files and directories must NOT be modified by ANY agent in this sprint:

| File/Directory | Reason |
|----------------|--------|
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | Server-side API route. SSE transformation layer. Changes here affect ALL clients (desktop, mobile). Out of scope. |
| `apps/web/features/chat/stores/chat-preferences-store.ts` | Already has `thinkingEnabled` and `connectorBarDismissed`. No changes needed. |
| `apps/web/features/chat/components/messages/ReasoningAccordion.tsx` | Legacy component for `thinkingSteps` (string array). Retained per PRD-003. |
| `apps/web/features/chat/components/ConnectorDiscoveryBar.tsx` | Just shipped in sprint 1. Do not modify. |
| `apps/web/features/chat/components/GreetingBanner/` | Just shipped in sprint 1. Do not modify. |
| `apps/web/features/chat/components/FollowUpSuggestions.tsx` | Just shipped in sprint 1. Do not modify. |
| `apps/web/features/chat/components/SuggestedPrompts.tsx` | Stable. No changes needed. |
| `apps/web/app/chat/page.tsx` | Empty-state page. Only modified if absolutely needed for wiring. |
| `apps/web/shared/stores/` | Shared stores. Out of scope. |
| `packages/types/` | Cross-surface shared types. Do not add web-only types here. |
| `apps/desktop/` | Desktop surface. Completely out of scope. |
| `apps/mobile/` | Mobile surface. Completely out of scope. |
| `apps/cli/` | CLI surface. Completely out of scope. |
| `services/` | Backend services. Completely out of scope. |

---

## Conflict Zones and Resolution

### Zone 1: `MessageBubble.tsx` (features/chat version)

**Agents involved**: A (citations) and D (widgets)

**Resolution**: Agents work on non-overlapping sections.
- Agent D adds imports and a conditional card-type branch ABOVE the ReactMarkdown block.
- Agent A adds citation handling INSIDE the ReactMarkdown `components` override.
- If both agents edit simultaneously, Agent D's changes go first (wrapping conditional), then Agent A's changes (within the markdown renderer).
- Merging strategy: sequential application -- D first, then A.

### Zone 2: `globals.css`

**Agent involved**: Only Agent C.

No conflict. Agent C is the sole owner.

### Zone 3: `chat-store.ts`

**Agent involved**: Only Agent B.

Agent B modifies only the thinking action implementations. No other agent touches this file.

### Zone 4: `chat-ai-service.ts`

**Agent involved**: Only Agent B.

Agent B modifies `sendMessage()` to add thinking tag detection. No other agent touches this file.

---

## Build and Test Verification Steps

### Pre-implementation baseline (run once before agents start):

```bash
cd apps/web && pnpm typecheck          # Must pass: 0 errors
cd apps/web && pnpm lint               # Must pass: 0 errors, <=5 warnings
cd apps/web && pnpm build              # Must succeed (Next.js production build)
```

### Per-agent verification (each agent runs after completing their work):

```bash
# TypeScript compilation
cd apps/web && pnpm typecheck

# ESLint
cd apps/web && pnpm lint

# Format check
pnpm format:check
```

### Integration verification (run after all four agents merge):

```bash
# Full typecheck
pnpm typecheck:all

# Full lint
pnpm lint

# Production build
cd apps/web && pnpm build

# Run existing tests to verify no regressions
cd apps/web && pnpm test -- --run
```

### Manual verification checklist:

- [ ] **Citations**: Navigate to `/chat/{sessionId}` with a message containing search results. Verify `[1]`, `[2]` markers appear as teal superscript badges. Hover to see source card tooltip.
- [ ] **Thinking**: Send a complex prompt to a thinking-capable model (Claude Sonnet 4.6). Verify Brain icon pulses, live timer ticks, thinking content streams, block collapses on completion with "Thought for Xs" label.
- [ ] **Design tokens**: Verify `apps/web/lib/design-tokens.ts` exports all categories. Verify new CSS custom properties appear in browser DevTools on the `:root` element.
- [ ] **Rich widgets**: Send a prompt that triggers a recipe response. Verify `RecipeCard` renders instead of plain markdown. Send a prompt with a comparison ("X vs Y"). Verify `ComparisonCard` renders.
- [ ] **Dark mode**: All four features render correctly in dark mode.
- [ ] **Mobile viewport**: All four features render correctly at 375px width.
- [ ] **No regressions**: Existing chat flow (send message, stream response, stop generation, artifact extraction) works unchanged.

---

## Key File Paths Summary

### Files to CREATE (11 new files):

```
apps/web/features/chat/components/citations/SearchSourceCard.tsx
apps/web/features/chat/components/citations/CitationMarker.tsx
apps/web/features/chat/components/citations/CitationTooltip.tsx
apps/web/features/chat/components/citations/index.ts
apps/web/features/chat/components/citations/types.ts
apps/web/features/chat/components/ThinkingBlock.test.tsx
apps/web/lib/design-tokens.ts
apps/web/lib/design-tokens.test.ts
apps/web/shared/components/ui/chat-card.tsx
apps/web/shared/components/ui/status-pill.tsx
apps/web/shared/components/ui/section-header.tsx
apps/web/features/chat/components/cards/WeatherCard.tsx
apps/web/features/chat/components/cards/EventCard.tsx
apps/web/features/chat/components/cards/CodeRunCard.tsx
apps/web/features/chat/components/cards/LocationCard.tsx
apps/web/features/chat/components/cards/types.ts
apps/web/features/chat/components/cards/card-utils.ts
```

### Files to MODIFY (7 existing files):

```
apps/web/features/chat/components/messages/MessageBubble.tsx   (Agent A + Agent D)
apps/web/features/chat/components/search/SearchResults.tsx     (Agent A)
apps/web/features/chat/components/ThinkingBlock.tsx            (Agent B)
apps/web/features/chat/services/chat-ai-service.ts            (Agent B)
apps/web/features/chat/stores/chat-store.ts                   (Agent B)
apps/web/features/chat/components/messages/ChatMessageList.tsx (Agent B)
apps/web/app/globals.css                                       (Agent C)
apps/web/features/chat/components/cards/index.tsx              (Agent D)
```

---

## Dependencies Between Agents

```
Agent C (Design System)  -- produces tokens -->  Agent A (Citations)
Agent C (Design System)  -- produces tokens -->  Agent B (Thinking) [optional adoption]
Agent C (Design System)  -- produces tokens -->  Agent D (Widgets)
Agent B (Thinking)       -- independent (no downstream consumers this sprint)
Agent A (Citations)      -- independent of Agent B and D
Agent D (Widgets)        -- independent of Agent A and B
```

**Recommended execution order**:
1. Agent C starts first (produces tokens that others may consume).
2. Agents A, B, D start in parallel after Agent C completes `globals.css` token additions (they can start component work immediately; token values are backward-compatible with inline Tailwind classes).
3. MessageBubble.tsx integration: Agent D merges first, then Agent A merges on top.

**In practice, all four agents CAN run fully in parallel** because:
- Agent A can use inline Tailwind color classes (`bg-teal-500/10`) and adopt named tokens later.
- Agent B already has working purple classes in the existing ThinkingBlock.
- Agent D can use inline Tailwind classes and adopt named tokens later.
- The token formalization is additive, not breaking.

---

## Appendix: PRD Source Cross-Reference

| Feature | Full PRD Location | Competitive Reference |
|---------|------------------|-----------------------|
| Citations | `docs/WEB_COMPETITIVE_AUDIT.md` lines 444-449 | Perplexity source cards, Claude.ai inline citations |
| Thinking Viz | `docs/specs/PRD-003-thinking-reasoning-visualization.md` (31KB, 529 lines) | Claude.ai teal thinking blocks, ChatGPT "Thought for Xs" |
| Design System | `docs/WEB_COMPETITIVE_AUDIT.md` lines 583-595 (Claude.ai design system extract) | Claude.ai: Purple/Teal/Coral, Anthropic Sans, no gradients |
| Rich Widgets | Existing: `apps/web/features/chat/components/cards/index.tsx` | ChatGPT Canvas cards, Claude.ai artifact rendering |
