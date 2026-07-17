# AGI Mobile — Volume 10 — AI Response Rendering

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: Grounds in `AGENTS.md` (repo root), `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and verified mobile paths: `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx`, `MathBlock.tsx`, `CodeBlockCopyButton.tsx`, `MessageBubble.tsx`, `StreamingIndicator.tsx`, `GeneratedImage.tsx`, `ImageFullScreen.tsx`, `ArtifactFullScreen.tsx`, `apps/mobile/services/streaming.ts`, and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Mobile turns an assistant response — a stream of model tokens — into legible, interactive UI: markdown, code, tables, images, citations, math, diagrams, incremental streaming, and copy affordances.

Rendering is **trust-agnostic by design**. The same renderer draws a Local (small on-device LLM) response and a Managed-Cloud response; the bytes are formatted on-device regardless of where the tokens came from. **Mobile has no BYOK** — there is no provider-key surface anywhere in this pipeline, and nothing here may add one. The only trust-sensitive seams are network-backed render helpers (KaTeX from a CDN; cloud-hosted image URLs): these must degrade gracefully so a Local/offline response still renders text correctly. Model IDs that decorate a response (provenance label) come only from `packages/contracts/types/src/models.json` — the renderer never invents one. Heavy rendering (live HTML/diagram execution, document/image generation) is **not** mobile's job first; mobile shows source or a cloud-backed result and defers execution to Desktop/host per `apps/mobile/AGENTS.md`.

## Markdown

✅ Built — `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx`. A dependency-free, regex-driven renderer (`renderMarkdownContent`) emits React Native `Text`/`View` nodes — no `react-native-markdown` or DOM. Supported: `**bold**`, `*italic*`, `~~strike~~`, `` `inline code` ``, `[links](url)` (gated through `isValidExternalHttpUrl` before `Linking.openURL`), headers H1–H4, blockquotes, ordered/unordered lists, horizontal rules, and theme-aware colors. Requirements: output must be `selectable`; links must reject non-http(s) schemes; nesting depth is bounded (no infinite recursion on malformed input). Gap to track (🔭): no nested-list indentation, no task-list checkboxes, no GFM autolinks.

## Code Blocks — syntax highlighting

🟡 Partial — `MessageContentRenderer.tsx` (fenced-block branch) + `CodeBlockCopyButton.tsx`. Triple-backtick blocks render in a horizontally scrollable `Menlo` monospace `Text` with a bordered surface and a floating copy button. **Syntax highlighting is NOT implemented** — there is no `shiki`/`prism`/`highlight.js` dependency in `apps/mobile/package.json`; the language tag in the fence is parsed but not colorized. Token-level highlighting is **🔭 Planned**. Requirements when built: tokenize on-device (no network), honor the fence language, fall back to plain monospace on unknown languages, and never block streaming on highlight work.

## Tables

✅ Built — `MessageContentRenderer.tsx` (`parseTableRow` + table branch). GFM pipe tables with a `|---|` separator render as a bordered flex grid with a shaded header row; interior empty cells are preserved. Gap (🟡): cell text is rendered plain — inline markdown **inside** cells is not re-parsed, and wide tables rely on column flex rather than horizontal scroll. Requirement: malformed/ragged rows must render without crashing (column count is the row max).

## Images

✅ Built. Inline generated images use `GeneratedImage.tsx` (expo-image, load/error states, long-press share); user attachments render in `MessageBubble.tsx`; full-screen pinch-zoom lives in `ImageFullScreen.tsx`. **Image generation is cloud-backed**, never on-device — mobile must not become the first heavy local image-gen surface (`apps/mobile/AGENTS.md`). Requirements: show a skeleton/progress state while loading, an explicit error state on failure, and bounded display width. Image URLs are Managed-Cloud assets; Local responses contain no remote image URLs.

## Citations

✅ Built — `MessageBubble.tsx` renders `message.citations` (from cloud web-search/server-tool runs streamed via `services/streaming.ts`); ≤3 citations render inline, more collapse into `CollapsibleSources`. Requirements: each citation links out only through the validated external-URL guard; citations appear only on Cloud responses that carry them (Local on-device responses have none) and must never be fabricated when absent.

## Math — LaTeX

🟡 Partial — `apps/mobile/src/features/chat/components/MathBlock.tsx`. Inline `$…$` and block `$$…$$` render via KaTeX inside a sandboxed `react-native-webview`; LaTeX is HTML-escaped as text content (not interpolated into the script) to block `</script>` injection, navigation is disabled, and a plain-text `MathFallback` covers WebView failure. Gap: KaTeX is loaded from a pinned **CDN** (`jsdelivr`, v0.16.21), so math does not render offline / in pure Local mode until the fallback shows source. Requirement to close (🔭): bundle KaTeX locally so on-device Local responses render math without network.

## Mermaid diagrams

🟡 Partial — `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx`. `mermaid` is a recognized previewable artifact kind, but **live diagram preview is deliberately gated off**: there is no DOMPurify-grade sanitizer or properly sandboxed execution WebView on mobile, so mermaid (and html/svg/jsx) render as **plain source text**, not as drawn diagrams. This is an intentional security posture, not a bug. Rendered mermaid is **🔭 Planned**, contingent on a hardened sandbox. Requirement: never execute untrusted diagram/markup in the bridge-exposing MathBlock WebView.

## Streaming Renderer — incremental updates

✅ Built — `services/streaming.ts` (SSE deltas) + `MessageBubble.tsx` (`message.isStreaming`, `useMemo` re-render of `renderMarkdownContent` on each content change) + `StreamingIndicator.tsx` (spinning `AgiMark`, `accessibilityRole="progressbar"`). The streaming bubble carries `testID="chat.message.assistant.streaming"`. Requirements: partial/unterminated markdown (an open code fence mid-stream) must render without crashing; the spinner clears on completion; reduced-motion disables animation. Cloud streaming routes through `guardedFetch`/`remoteChatGate`, which **fail closed** in Local mode — the renderer never silently pulls a Local turn through the cloud path. Performance gap (🔭): re-parsing the full message per delta is O(n²) on long replies; incremental/append-only parsing is planned.

## Copy Actions

✅ Built. Per-code-block copy via `CodeBlockCopyButton.tsx` (clipboard write + success haptic + 2s check state); whole-message copy via the long-press action sheet in `MessageBubble.tsx` ("Copy Message" → `copyToClipboard` from `@/lib/clipboard`), alongside Export/Retry/Edit/Delete. Requirements: copy must yield the raw markdown source (not stripped render text), confirm visibly/haptically, and respect the haptics setting.

## Repository map

- `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` — markdown/table/code/inline-math parser.
- `apps/mobile/src/features/chat/components/MathBlock.tsx` — KaTeX WebView + fallback.
- `apps/mobile/src/features/chat/components/CodeBlockCopyButton.tsx`, `MessageBubble.tsx` — copy actions, citations, action sheet.
- `apps/mobile/src/features/chat/components/StreamingIndicator.tsx`, `services/streaming.ts` — streaming pipeline.
- `apps/mobile/src/features/chat/components/GeneratedImage.tsx`, `ImageFullScreen.tsx` — image rendering.
- `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` — artifact/mermaid (preview-gated).
- `packages/contracts/types/src/models.json` — model IDs for provenance labels.

## Competitor notes

ChatGPT and Claude mobile ship polished markdown, syntax-highlighted code, rendered LaTeX, and (Claude) live artifact/mermaid previews — single-provider, cloud-only. AGI's deliberate divergence: one renderer serves **both** on-device Local and Managed-Cloud responses behind a strict **per-surface trust** model; **no BYOK on mobile** ever; image generation is cloud-backed (mobile is not the heavy-compute surface); and untrusted diagram/HTML execution is **gated off** until a hardened sandbox exists — we ship a security posture, not a parity checkbox. Where rivals execute, AGI shows verifiable source first.

## Acceptance / Definition of Done

Production-ready when the renderer handles malformed/partial streamed markdown without crashing, every label below is accurate to a cited path, and Local responses render fully offline (math/code degrade to source, never error).

Build / correctness

- [ ] Markdown, tables, code, images, citations, streaming verified against fixtures; partial/unterminated blocks render safely.
- [ ] Syntax highlighting + bundled-KaTeX + rendered-mermaid tracked as explicit 🔭 gaps, not claimed shipped.

Trust / security

- [ ] No provider-key/BYOK affordance anywhere in the render path.
- [ ] Links and citations pass the external-URL guard; LaTeX stays HTML-escaped; no untrusted markup runs in a bridge-exposing WebView.
- [ ] Cloud streaming honors fail-closed `remoteChatGate`; Local turns never route to cloud.

## Anti-patterns

- Adding any BYOK / API-key entry to a render setting — forbidden on mobile.
- Auto-sending or silently routing a Local response through the cloud render/stream path.
- Claiming syntax highlighting, rendered mermaid, or offline math as shipped without a real path.
- Executing untrusted HTML/SVG/mermaid in the MathBlock WebView (bridge-exposing, `originWhitelist=['*']`).
- Hardcoding or inventing a model ID for the provenance label instead of reading `packages/contracts/types/src/models.json`.
- Referencing Supabase, or any removed tier ("Plus", `pro_plus`, "Hobby"), anywhere in this surface.
