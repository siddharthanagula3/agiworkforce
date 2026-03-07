# Web Chat — Desktop Interface Parity Design

**Date**: 2026-03-07
**Goal**: Bring `apps/web/app/chat` to full visual and functional parity with the desktop `UnifiedAgenticChat` interface.

---

## Current State vs Target

| Area                   | Current Web                                        | Target (Desktop-like)                                      |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Layout                 | Dashboard header + nav sidebar wraps chat          | Full-screen pure chat: own sidebar, no external chrome     |
| Chat sidebar           | Slides in over content                             | Collapsible left panel (280px ↔ 64px icon-only)            |
| Model selector         | Static "Auto" badge                                | Real dropdown — 18 models grouped by 7 providers           |
| Message rendering      | ReactMarkdown, basic bubbles                       | Thinking blocks, streaming cursor, model badge, tool cards |
| Composer               | Textarea + tools row                               | Model selector in footer, slash commands, drag-drop        |
| Multi-provider routing | Routes only to Anthropic via `/api/llm/completion` | Single `/api/llm/stream` handles all 7 providers via SSE   |
| Right panels           | Artifacts panel only                               | Artifacts + Memory + Research (lazy)                       |

---

## Architecture

```
app/chat/layout.tsx
  └── ChatLayoutShell (REWRITE)
        ├── Left: ChatSidebarNew [280px ↔ 64px]
        ├── Main: {children}
        │     ├── MessageListNew (enhanced)
        │     └── ChatComposerNew (enhanced)
        └── Right: panel slots [Artifacts | Memory | Research]

app/api/llm/stream/route.ts  (NEW)
  └── Routes by model prefix → OpenAI / Anthropic / Google /
                                DeepSeek / Perplexity / xAI / Mistral
  └── Returns SSE stream in unified delta format

features/chat/components/ModelPicker/  (NEW)
  └── ModelPicker.tsx — searchable dropdown grouped by provider

features/chat/components/messages/MessageListNew.tsx  (ENHANCE)
  └── ThinkingBlock, StreamingCursor, MessageMeta, ToolEventCard

features/chat/components/Composer/ChatComposerNew.tsx  (ENHANCE)
  └── Integrated ModelPicker, SlashCommandMenu, drag-drop
```

---

## 5 Parallel Work Tracks

### Track 1 — Chat Layout Overhaul (Agent layout-agent)

**Files**:

- `apps/web/app/chat/ChatLayoutShell.tsx` — full rewrite
- `apps/web/app/chat/layout.tsx` — auth guard only, no wrapper change

**What changes**:

- Remove `DashboardHeader` and `DashboardSidebar` from chat layout
- New layout: `flex h-screen overflow-hidden bg-[#faf9f7] dark:bg-[#0f0f13]`
- Left panel: `ChatSidebarNew` at 280px (expanded) / 64px (icon-only collapsed)
  - Toggle via `Cmd+Shift+S` (match desktop)
  - Persists collapse state to localStorage
- Right panel slot: rendered via `activeRightPanel` state (artifacts, memory, research)
- Bottom gradient fade (match desktop: `from-background to-transparent`)
- Responsive: sidebar hidden on mobile, slide-in overlay

**Does NOT break**: other dashboard routes (`/dashboard`, `/settings`, etc.) keep their layout

---

### Track 2 — Model Picker Component (Agent model-agent)

**Files**:

- NEW: `apps/web/features/chat/components/ModelPicker/ModelPicker.tsx`
- UPDATE: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- UPDATE: `apps/web/shared/stores/model-store.ts` (add provider colors)

**What changes**:

- Dropdown trigger: `[provider-dot] [ModelName] [chevron]` in composer footer
- Popover with search input + grouped list:
  - OpenAI (green dot): GPT-4o, GPT-4o Mini, o1, o3-mini, o4-mini
  - Anthropic (orange dot): Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
  - Google (blue dot): Gemini 2.5 Pro, 2.0 Flash, 2.0 Flash Lite
  - DeepSeek (purple dot): R1, V3
  - Perplexity (teal dot): Sonar Pro, Sonar
  - xAI (gray dot): Grok 3, Grok 2
  - Mistral (yellow dot): Mistral Large, Mistral Small
- Selecting a model calls `useModelStore.setSelectedModelId()`
- Selected model displayed in composer bottom-left area

---

### Track 3 — Message Rendering Enhancement (Agent messages-agent)

**Files**:

- `apps/web/features/chat/components/messages/MessageListNew.tsx` — enhance

**What changes**:

- **ThinkingBlock**: If message metadata has `thinkingSteps[]`, render a collapsible `<details>` block above the main response (matches desktop `ReasoningAccordion`)
- **StreamingCursor**: Blinking `▋` appended while `isStreaming === true`
- **MessageMeta row** (on assistant messages): model badge pill (e.g., `claude-sonnet-4-6`), timestamp, copy-to-clipboard button — visible on hover
- **User bubble**: Right-aligned, `bg-primary/10` rounded pill
- **Assistant bubble**: Left-aligned, full-width prose
- **Smooth auto-scroll**: `scrollIntoView({ behavior: 'smooth' })` on new content

---

### Track 4 — Composer Enhancement (Agent composer-agent)

**Files**:

- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` — enhance

**What changes**:

- **Model selector** in composer footer bar (left side, uses Track 2 ModelPicker)
- **Slash command menu**: `/search`, `/think`, `/image`, `/doc` — shows floating menu above composer when `/` typed
- **Keyboard**: `Enter` = send (already works), `Shift+Enter` = newline (already works), `Escape` = close slash menu
- **File drag-and-drop**: visual drop zone overlay when dragging files over composer
- **Focus mode buttons** (right side of footer): Web, Think, Creative, Precise — toggles that add system prompt prefix

---

### Track 5 — Multi-Provider API Route (Agent api-agent)

**Files**:

- NEW: `apps/web/app/api/llm/stream/route.ts`
- UPDATE: `apps/web/features/chat/services/chat-ai-service.ts`

**What changes**:

- `POST /api/llm/stream` accepts `{ model, messages, stream: true, apiKey? }`
- Auth via Supabase session (existing pattern)
- Rate limiting (existing `withRateLimit`)
- CSRF check (existing `requireCsrfToken`)
- Provider routing by model ID prefix:
  - `gpt-*`, `o1`, `o3-*`, `o4-*` → OpenAI API (`api.openai.com/v1/chat/completions`)
  - `claude-*` → Anthropic API (`api.anthropic.com/v1/messages`)
  - `gemini-*` → Google AI API (`generativelanguage.googleapis.com`)
  - `deepseek-*` → DeepSeek API (`api.deepseek.com/v1/chat/completions`)
  - `sonar*` → Perplexity API (`api.perplexity.ai/chat/completions`)
  - `grok-*` → xAI API (`api.x.ai/v1/chat/completions`)
  - `mistral-*` → Mistral API (`api.mistral.ai/v1/chat/completions`)
- Streams back in unified SSE format: `data: {"delta": "...", "done": false}`
- `ChatAIService.sendMessage()` updated to use `/api/llm/stream` with selected model

---

## Provider API Key Strategy

- Server-side: use env vars `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`
- Client BYOK (future): user supplies key in settings → encrypted in Supabase → passed as `apiKey` in request body
- Missing key → 402 error with message "Set PROVIDER_API_KEY in environment"

---

## Design Tokens (match desktop)

```css
/* Light */
--bg-main: #faf9f7 /* cream-50 */ --bg-sidebar: #f5f4f1 /* cream-100 */
  --border: rgba(0, 0, 0, 0.08) /* Dark */ --bg-main: #0f0f13 /* charcoal-900 */
  --bg-sidebar: #0b0c14 --border: rgba(255, 255, 255, 0.07);
```

---

## Agent Assignments

| Agent            | Track                       | Zone |
| ---------------- | --------------------------- | ---- |
| `layout-agent`   | Track 1: Layout overhaul    | A    |
| `model-agent`    | Track 2: Model picker       | A    |
| `messages-agent` | Track 3: Message rendering  | A    |
| `composer-agent` | Track 4: Composer           | A    |
| `api-agent`      | Track 5: Multi-provider API | B    |

All tracks are independent. No inter-agent dependencies. Execute fully in parallel.
