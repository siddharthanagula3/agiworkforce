# AGI Web — Volume 05 — AI Response Rendering

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/web/AGENTS.md`. Grounded in real repo paths: `apps/web/features/chat/components/messages/MarkdownContent.tsx`, `apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx`, `apps/web/features/chat/components/messages/preprocessMath.ts`, `apps/web/features/chat/components/messages/markdownSanitizeSchema.ts`, `apps/web/features/chat/components/messages/InlineCitation.tsx`, `apps/web/features/chat/components/MermaidRenderer.tsx`, `apps/web/features/chat/components/ArtifactBlock.tsx`, `apps/web/features/chat/components/ToolCallCard.tsx`, `apps/web/lib/hooks/useChatStream.ts`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Web turns model output — Markdown, code, tables, images, citations, math, diagrams — into safe, styled, streaming DOM. AGI Web is the **cloud-only** surface: no Local runtime, no BYOK. Every token rendered here arrives over `/api/llm/v1/chat/completions` from a Managed-Cloud session tied to Neon/account state. There is no on-device model and no user-key provider path to render from, so the renderer never has to branch on trust mode — but it MUST treat all model/tool output as **untrusted input** and sanitize before it reaches the DOM. Model IDs referenced anywhere in rendering (e.g. per-model capability hints) come only from `packages/types/src/models.json`; the renderer itself is model-agnostic and never hardcodes an ID. Rendering is plan-agnostic: Free through Enterprise see the same renderer; entitlement gating lives upstream, not in the render layer.

## Markdown

✅ Built — `apps/web/features/chat/components/messages/MarkdownContent.tsx` and `apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx` render assistant Markdown with `react-markdown` plus `remark-gfm` (GFM: autolinks, task lists, strikethrough), `remark-breaks` (soft line breaks), and custom element components for headings (H1–H6), paragraphs, lists, blockquotes, and horizontal rules. Requirements: GFM must be honored; raw HTML is parsed via `rehype-raw` but MUST be sanitized (see Streaming Renderer / anti-patterns); task-list items render as read-only checkboxes; heading and prose spacing follow the `prose` typography classes. Testable: a message with headings, nested lists, task items, and inline emphasis renders each element with its mapped component and produces no React hydration warning.

## Code

✅ Built — the `CodeBlock` component in both renderers renders fenced code with a language label header and a copy-to-clipboard button (with copied-state feedback), and syntax highlighting via `rehype-highlight` (highlight.js `github-dark` theme). Inline code (no language match) renders as a styled `<code>` span. Tool/agent code (e.g. `execute_code`) is highlighted separately by `detectCodeBlock` in `apps/web/features/chat/components/ToolCallCard.tsx`, applying the same global highlight CSS. Requirements: language label reflects the fence info string; copy copies the exact source minus the trailing newline; long lines scroll horizontally, never overflow the bubble. 🔭 Planned: per-block "run"/"insert into artifact" affordances and diff-aware code rendering.

## Tables

✅ Built — GFM tables are parsed by `remark-gfm` and mapped to custom `table`/`thead`/`tbody`/`tr`/`th`/`td` components in `EnhancedMarkdownRenderer.tsx` (with a lighter variant in `MarkdownContent.tsx`), each wrapped in an `overflow-x-auto` container with bordered, hover-highlighted styling. Requirements: wide tables scroll within their container rather than breaking layout; header cells are visually distinct; empty cells still render bordered. 🔭 Planned: column sort, CSV/Markdown copy-table export, and sticky headers.

## Images

✅ Built — the `ImageComponent` in `EnhancedMarkdownRenderer.tsx` renders Markdown images through `next/image` with lazy loading, but only after validating the `src` is an `http:`/`https:` URL; any other/invalid `src` degrades to italic alt text (`[image: …]`) instead of crashing the message render. Requirements: non-http protocols (`javascript:`, disallowed `data:`, malformed URLs) MUST NOT reach the DOM as a live image; missing alt yields no broken node. 🔭 Planned: click-to-zoom/lightbox and served-image domain allowlisting at the loader.

## Citations

✅ Built — web-search/research answers carry a `searchResults` metadata array on the assistant message (populated in `apps/web/lib/hooks/useChatStream.ts` from `x_search_results` deltas). `apps/web/features/chat/components/messages/InlineCitation.tsx` renders numbered, hover-preview source chips (title + snippet, external-link out with `rel="noopener noreferrer"`), while `apps/web/features/chat/components/search/SearchResults.tsx` / `SearchResultCard.tsx` render the source list and `apps/web/features/chat/components/research/ResearchPanel.tsx` renders the deep-research sources view. Requirements: every citation chip resolves to a real source URL from message metadata (never fabricated); previews open in a new tab; citation numbering is stable within a message. 🟡 Partial: inline citation markers are not yet auto-woven into arbitrary streamed prose positions for every provider — coverage depends on the provider emitting search-result deltas.

## Math

✅ Built — `remark-math` + `rehype-katex` render LaTeX with KaTeX (`katex/dist/katex.min.css` imported alongside). `apps/web/features/chat/components/messages/preprocessMath.ts` normalizes `\[ … \]` → block `$$…$$` and `\( … \)` → inline `$…$` before `remark-math` runs, while passing fenced/inline code through unchanged so regex and shell snippets are never mangled; block math is wrapped in blank lines to avoid a `div`-in-`<p>` hydration error. Requirements: inline vs display math render distinctly; math inside code fences stays literal; plugin order keeps `rehype-katex` before `rehype-highlight` so `language-math` blocks are not mis-highlighted (see `MarkdownContent.tsx`).

## Mermaid

✅ Built — `apps/web/features/chat/components/MermaidRenderer.tsx` renders Mermaid DSL to SVG via dynamic `import('mermaid')` (lazy-loaded — the library is ~250 KB — so it loads only when a `mermaid` block appears), with `securityLevel: 'strict'`, `DOMPurify.sanitize` on the SVG output, theme following light/dark, and a toolbar for zoom, pan, reset, fullscreen, download-SVG, and copy-source. Dispatch happens through `apps/web/features/chat/components/ArtifactBlock.tsx` (`case 'mermaid'` → `MermaidBlock`). Requirements: a render failure shows an error panel with the raw source (never a blank crash); the sanitized SVG is the only value injected via `dangerouslySetInnerHTML`.

## Streaming Renderer

✅ Built — `apps/web/lib/hooks/useChatStream.ts` consumes the SSE stream, parsing both OpenAI-compatible (`choices[0].delta.content`) and Anthropic (`content_block_delta`) shapes. It splits reasoning from answer text via a `contentBuffer` that holds back bytes so a `<thinking>`/`</thinking>` marker split across chunks is detected correctly, routing reasoning to `appendToThinking` and answer text to `appendToMessage`. Tool-status, code-execution results, and search results are surfaced as timeline/metadata during the stream. `MarkdownContent` shows a pulsing caret while `isStreaming`. Requirements: partial Markdown MUST render progressively without throwing on unterminated fences/tables; abort (user stop) preserves partial content; `[DONE]` flushes the buffer and persists idempotently.

## Incremental Rendering

🟡 Partial — `EnhancedMarkdownRenderer` is wrapped in `React.memo` with module-level memoized `remark`/`rehype` plugin arrays and memoized element components to cut re-render cost (`apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx`). The gap: the streaming path re-parses the **entire accumulated string** on each token via `MarkdownContent` — there is no block-level/append-only incremental parser (stable keys per finished block, or a streaming-aware Markdown parser). Long responses re-tokenize O(n) per chunk. 🔭 Planned: block-segmented rendering that memoizes completed blocks and only re-parses the trailing open block, plus virtualization for very long transcripts.

## Repository map

- `apps/web/features/chat/components/messages/MarkdownContent.tsx` — streaming Markdown renderer + caret.
- `apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx` — full-feature memoized renderer.
- `apps/web/features/chat/components/messages/preprocessMath.ts` — LaTeX delimiter normalization.
- `apps/web/features/chat/components/messages/markdownSanitizeSchema.ts` — shared `rehype-sanitize` schema.
- `apps/web/features/chat/components/messages/InlineCitation.tsx` — numbered source chips.
- `apps/web/features/chat/components/MermaidRenderer.tsx`, `ArtifactBlock.tsx`, `ToolCallCard.tsx` — diagrams, artifact/code dispatch.
- `apps/web/features/chat/components/search/`, `research/ResearchPanel.tsx` — sources/citations UI.
- `apps/web/lib/hooks/useChatStream.ts` — SSE stream parsing and dispatch.

## Competitor notes

Claude, ChatGPT, and Codex all ship rich Markdown + KaTeX + syntax-highlighted code + streaming; ChatGPT and Claude render inline citations for web search and do artifact/canvas-style diagram rendering. AGI Web matches the feature envelope (GFM, math, Mermaid, citations, streaming) but diverges deliberately: (1) the renderer is **provider-neutral**, parsing both OpenAI- and Anthropic-shaped streams from one component so multi-provider Managed-Cloud output renders identically; (2) sanitization is explicit and shared (`markdownSanitizeSchema.ts`, DOMPurify for SVG) rather than trusting provider HTML; (3) per-surface trust holds — the same shared rendering components are reused on Mobile/Desktop, but Web renders only cloud content, with no Local/BYOK branch. Competitor implementations are parity references only; no competitor code or branding is copied.

## Acceptance / Definition of Done

The domain is production-ready when a streamed response containing headings, lists, tables, inline + block math, a highlighted code block, a Mermaid diagram, an image, and web citations renders correctly and incrementally, with no hydration warnings, no console errors, and no unsanitized HTML in the DOM.

- [ ] Build: GFM, KaTeX, highlight, Mermaid, and citations all render from a single streamed message; partial/unterminated Markdown never throws.
- [ ] Trust: renderer displays only Managed-Cloud content; no Local/BYOK affordance or provider-key path exists in the render layer; citations resolve to real source URLs from message metadata.
- [ ] Security: `rehype-raw` is always followed by `rehypeSanitize(MARKDOWN_SANITIZE_SCHEMA)`; Mermaid SVG passes through `DOMPurify`; image `src` is protocol-validated; XSS regression tests (e.g. `markdownXss.test.tsx`) pass.

## Anti-patterns

- Running `rehype-raw` without the sanitize schema, or injecting model/tool HTML/SVG via `dangerouslySetInnerHTML` without DOMPurify — a live XSS path on the chat surface.
- Rendering images or links from non-`http(s)` (`javascript:`, untrusted `data:`) URLs, or from unvalidated `src`.
- Adding any Local or BYOK rendering branch, provider-key affordance, or "run locally" control to AGI Web — Web is cloud-only.
- Hardcoding or inventing a model ID in rendering logic instead of reading `packages/types/src/models.json`.
- Fabricating citations, source counts, or availability badges not backed by message metadata.
- Blocking rendering on eager `mermaid`/KaTeX imports instead of lazy-loading; re-parsing the full transcript per token once block-incremental rendering exists.
- Referencing removed tiers ("Plus"/`pro_plus`/"Hobby"), credit top-ups, or Supabase; using `middleware.ts` instead of `proxy.ts`.
