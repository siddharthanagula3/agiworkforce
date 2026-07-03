# AGI Desktop — Volume 06 — AI Response Rendering

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`; grounded in `apps/desktop/src/features/chat/MessageBubble/MessageContent.tsx`, `apps/desktop/src/features/chat/Visualizations/CodeBlock.tsx`, `apps/desktop/src/features/chat/artifacts/MermaidArtifact.tsx`, `apps/desktop/src/features/chat/artifacts/SvgArtifact.tsx`, `apps/desktop/src/features/chat/MessageBubble/{MessageActions,MessageContextMenu,useMessageActions,ThinkingMessageBlock}.tsx`, `apps/desktop/src/features/chat/ChatStream.tsx`, `apps/desktop/src/utils/security.ts`, and `apps/desktop/package.json`.

## Overview & stance

This volume defines how AGI Desktop renders an assistant response — Markdown, code, tables, images, citations, math, diagrams, SVG — from first streamed token to final copyable artifact. Rendering itself is trust-mode-agnostic: the same React pipeline paints output whether the tokens came from a **Local** on-device model, a **BYOK** provider key, or **Managed Cloud**. What changes per trust mode is _provenance and safety context_, not the renderer. Because Desktop is the suite's **local-private compute host** — it runs `execute_code` and hosts the 127.0.0.1 bridge for Chrome/VS Code — untrusted model output is rendered next to real local capabilities, so sanitization is a hard requirement, not a nicety. The visible provider/trust label lives on the message chrome (Volume 05 / chat shell), and the renderer must never imply a different source than the one that produced the tokens. Local content stays local: rendering, copy, and export happen on-device and never round-trip to Cloud.

## Markdown

The chat renderer is `react-markdown@^10` with `remark-gfm@^4` and `remark-math@^6` remark plugins and `rehype-katex@^7` (`apps/desktop/src/features/chat/MessageBubble/MessageContent.tsx`). Custom component overrides handle `code`, `table`, `a`, `p`, `li`, and `img`. Links are hardened: only `https?:` URLs pass; `javascript:`/`data:` are coerced to `#` and every anchor gets `target="_blank" rel="noopener noreferrer"`. Raw tool-result JSON fences are stripped pre-render via `stripToolResultJsonBlocks` so they surface as rich inline cards instead. **✅ Built** (`MessageContent.tsx`). GFM autolinks, task lists, and strikethrough come from `remark-gfm`.

## Syntax Highlighting

Block code renders through `react-syntax-highlighter` Prism (`vscDarkPlus` dark / `vs` light) in `apps/desktop/src/features/chat/Visualizations/CodeBlock.tsx`, with a language badge, line numbers, line-count, word-wrap toggle, expand, download, and copy. Executable languages (python/js/ts/bash/sh/ruby/perl/r) get a Run affordance that calls the Desktop-local `execute_code` IPC; assistant blocks also get "Open in Canvas." **✅ Built**. Gap: theme is hardcoded to two Prism styles rather than the locked Appearance/theme setting — 🟡 (`CodeBlock.tsx`, prop `theme` defaults `'dark'`).

## Tables

GFM pipe tables parse via `remark-gfm`; the custom `table` override wraps output in an `overflow-x-auto` scroll container with divided rows for wide tables (`MessageContent.tsx`). **✅ Built.** Artifact/spreadsheet tables additionally support "copy as Markdown table" (`apps/desktop/src/features/chat/ArtifactRenderer.tsx`).

## Images

The `img` override enforces a scheme allowlist (`https:` or `data:image/` only — everything else renders nothing), lazy-loads, caps height, and overlays a hover Download button plus alt-text caption (`MessageContent.tsx`). **✅ Built.** Generated-image artifacts flow through the artifact panel with SVG/PNG export (`ArtifactRenderer.tsx`). Inline paste/thumbnail handling is covered in the attachments/composer volume.

## Citations

Assistant text is scanned for `[N]` markers; `parseCitations` (`apps/desktop/src/features/chat/CitationBadge.tsx`) turns them into interactive `CitationBadge` chips inside `p`/`li`, resolved against the store via `getCitationByIndex`. Resolved sources render as a `SourcePillRow` above content and a `SourcesFooter` below, in document order, http(s)-only (`MessageContent.tsx`). **✅ Built.** Deep provenance (per-claim highlight, hover-preview of source snippet) is 🔭.

## Math

`remark-math` + `rehype-katex` render inline (`$…$`) and block (`$$…$$`) math via KaTeX, with `katex/dist/katex.min.css` imported at the top of the renderer (`MessageContent.tsx`, `katex@^0.16`). The reasoning/thinking block reuses the same plugin set (`ThinkingMessageBlock.tsx`). **✅ Built.**

## Mermaid

`mermaid@^11` renders diagrams via dynamic import with `securityLevel: 'strict'`, theme following light/dark, and output run through `sanitizeHtml` (SVG-tag allowlist) before `dangerouslySetInnerHTML` (`apps/desktop/src/features/chat/artifacts/MermaidArtifact.tsx`). Errors fall back to a source-preview panel. This is wired for **artifact-panel** diagrams, so a ``mermaid fence inside chat text currently renders as a highlighted code block, not a live diagram. **🟡 Partial** — engine + safe render exist (`MermaidArtifact.tsx`); inline chat auto-detection/routing of ``mermaid fences to the renderer is the gap.

## SVG

`SvgArtifact` sanitizes model-authored SVG through `sanitizeHtml` with an explicit tag/attribute allowlist (paths, shapes, gradients, filters, `text`) before injection (`apps/desktop/src/features/chat/artifacts/SvgArtifact.tsx`; helpers in `apps/desktop/src/utils/security.ts`). Diagram/chart artifacts export to `.svg`/`.png` via `XMLSerializer` (`ArtifactRenderer.tsx`). **✅ Built** for the artifact path. Inline ```svg fences in chat body are not yet promoted to a sanitized live preview — 🔭.

## Incremental Rendering

`MessageContent` is `React.memo`'d and citation/pill computation is `useMemo`'d against `message.content`, so unchanged messages don't re-render while a sibling streams (`MessageContent.tsx`). There is currently no block-level/incremental Markdown parser — each content update re-parses the whole message string through `react-markdown`. That is acceptable at present message sizes but is the known scaling gap. **🟡 Partial** (`MessageContent.tsx`); a token-diffed / block-memoized parser is 🔭.

## Streaming Renderer

During streaming the renderer shows an animated caret and suppresses citation resolution and `SourcesFooter` until `isStreaming` clears (`MessageContent.tsx`). Autoscroll is batched through `requestAnimationFrame` with instant behavior while streaming and smooth after (`apps/desktop/src/features/chat/ChatStream.tsx`). **🟡 Partial** — visual streaming affordances and scroll batching are built; a throttled/coalesced parse cadence (e.g. rAF-gated re-parse) to bound cost on long fast streams is 🔭.

## Desktop Copy Actions

Message-level copy uses `navigator.clipboard.writeText(content)` behind `useMessageActions.handleCopy`, exposed as a hover Copy button (`MessageActions.tsx`), a "Copy message" context-menu item (`MessageContextMenu.tsx`), and on reasoning blocks (`ThinkingMessageBlock.tsx`). Code blocks copy their own body (`CodeBlock.tsx`); artifact tables copy as Markdown (`ArtifactRenderer.tsx`). **✅ Built** for plain-text copy. Gaps: copy currently emits raw Markdown/plain text only — "copy as rich text / rendered HTML" and use of the Tauri clipboard plugin for native rich payloads are 🔭; "copy without citation markers" is 🔭.

## Repository map

- `apps/desktop/src/features/chat/MessageBubble/MessageContent.tsx` — Markdown/math/citation/image/table/link renderer.
- `apps/desktop/src/features/chat/MessageBubble/{MessageActions,MessageContextMenu,useMessageActions,ThinkingMessageBlock}.tsx` — copy/actions and reasoning render.
- `apps/desktop/src/features/chat/Visualizations/CodeBlock.tsx` — Prism syntax highlighting + code copy/run.
- `apps/desktop/src/features/chat/artifacts/{MermaidArtifact,SvgArtifact,MarkdownArtifact,CodeArtifact}.tsx` — diagram/SVG/artifact renderers.
- `apps/desktop/src/features/chat/{CitationBadge,SourcePillRow,SourcesFooter}.tsx` — citation UI.
- `apps/desktop/src/features/chat/ChatStream.tsx` — streaming/scroll orchestration.
- `apps/desktop/src/utils/security.ts` — `sanitizeHtml`/`sanitizeMarkdownHtml`/`sanitizeSvg` (DOMPurify).
- `apps/desktop/package.json` — `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-highlight`, `katex`, `mermaid`, `dompurify`.

## Competitor notes

Claude, ChatGPT, and Codex all render GFM Markdown, highlighted code with copy, KaTeX math, and (Claude/ChatGPT) Mermaid + artifact panels — each bound to a single first-party model. AGI's divergence is deliberate: (1) the renderer is **provider-agnostic** and sits behind Local/BYOK/Managed Cloud, so the same pipeline serves an on-device model and a BYOK key with an honest visible provider label; (2) **local-first** — rendering, sanitization, code execution, and copy/export run on the host with no forced Cloud round-trip; (3) untrusted output is DOMPurify-sanitized before injection because Desktop is a real local compute host, not a sandboxed web tab; (4) code blocks integrate the Desktop-native `execute_code` and Canvas rather than a hosted sandbox only.

## Acceptance / Definition of Done

- [ ] **Build:** GFM Markdown, Prism code, GFM tables, KaTeX inline+block, images (scheme-allowlisted), citations, and message/code/table copy all render and function in `apps/desktop` chat; inline `mermaid and `svg fences route to their sanitized renderers (closes the 🟡/🔭 gaps).
- [ ] **Trust:** renderer never alters or fabricates the provider/trust label; Local content renders/copies/exports on-device with no Cloud call; rendering identical across Local/BYOK/Managed Cloud.
- [ ] **Security:** all model-authored HTML/SVG/Mermaid passes `sanitizeHtml`/`sanitizeSvg`; anchors http(s)-only with `rel="noopener noreferrer"`; `img` scheme allowlist enforced; Mermaid stays `securityLevel: 'strict'`; no `dangerouslySetInnerHTML` without sanitization.
- [ ] **Perf:** streaming a long response keeps the app responsive (batched scroll; bounded re-parse); memoization prevents re-render of settled messages.

## Anti-patterns

- Rendering raw model HTML/SVG/Mermaid without DOMPurify, or relaxing the `securityLevel`/scheme allowlists.
- Injecting `dangerouslySetInnerHTML` from streamed content on this local host.
- Showing a provider/trust label the renderer can't prove, or silently rendering Local output as if it were Cloud.
- Sending Local/BYOK message content to Cloud purely to render/format/export it.
- Hardcoding or inventing model IDs in renderer code — model IDs come only from `packages/types/src/models.json`.
- Referencing removed tiers (Plus/pro_plus/Hobby), inventing INR prices, or wiring credit top-ups into any render/export gate.
- Referencing Supabase or renaming Next.js `proxy.ts` to `middleware.ts` in any shared render path.
- Claiming inline Mermaid/SVG/rich-clipboard as shipped — they are 🟡/🔭 until the cited paths prove otherwise.
