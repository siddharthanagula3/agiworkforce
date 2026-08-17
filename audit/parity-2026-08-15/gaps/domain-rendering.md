# Domain audit: message rendering + response actions

Scope: §5 conversation rendering and §6 response actions — every response
part type (markdown, code, math, citations, artifacts, images, rich cards,
tool-call UI, approvals, code execution, file diffs) and every response
action (copy, regenerate, edit, share, fork, read aloud, feedback) across
web, desktop (Tauri), mobile, and the Chrome extension. Benchmarked against
the ChatGPT/Claude web, desktop, and Chrome-extension teardowns in
`research/shots-*.md` and `research/{chatgpt,claude}-web-desktop.md`.

## Summary

This is a domain with a very wide quality spread _within the same product_,
which is the headline finding. Web's local `MessageBubble.tsx` (2,254 lines,
`apps/web/features/chat/components/messages/MessageBubble.tsx`) is a mature,
carefully built renderer — real streaming/empty/error states, a genuine
branch/fork UI that Claude itself does not have, honest degradation paths,
and rich response actions. But it sits on top of three _independent_
markdown engines (web+desktop share a real remark/rehype pipeline; mobile
and the Chrome extension each hand-rolled their own regex-based parser), and
the "canonical shared" `packages/ui/unified-chat` package that desktop
actually renders through is measurably thinner than web's local
implementation in both response actions and response-part coverage. The
Chrome extension is the weakest surface in the entire audit for this
domain: one working response action (copy), no citation UI, no table/image/
math support at all.

None of this rises to P0 — every surface degrades to readable plain text
rather than crashing or corrupting output — but the desktop and extension
gaps are concrete, verified regressions relative to what this same codebase
already built for web, not aspirational asks.

## Strengths (confirmed, do not rebuild)

| Capability                                                                                                                               | Where                                                                                                            | Evidence                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real CommonMark+GFM+math pipeline (tables, footnotes, strikethrough, KaTeX, syntax highlighting, per-block copy) shared by web + desktop | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:1-297`                                     | `remark-gfm`+`remark-math`+`remarkBreaks` / `rehypeRaw`→`rehypeSanitize`→`rehypeKatex`→`rehypeHighlight`, memoized, with a documented plugin-order rationale                                                                                                                         |
| Image rendering with real loading/error states                                                                                           | `MarkdownContent.tsx:115-184` (`MarkdownImage`)                                                                  | Shimmer while loading, `ImageOff` fallback (not a browser broken-image glyph) on error, click-to-expand gated on navigable URL scheme (`AUDIT-FIX BUG-26`)                                                                                                                           |
| Tool-call UI state machine                                                                                                               | `packages/ui/unified-chat/src/components/ToolCallCard.tsx:23-183`                                                | `pending/running/complete/error/awaiting_approval/cancelled` + a distinct **expired-approval** state (`expired` prop) that renders a "no longer active, send a new message" notice instead of dead-looking live buttons — a real fix for stale in-memory approval state after reload |
| Deep-research activity UI                                                                                                                | `apps/web/features/chat/components/research/ResearchActivity.tsx`                                                | Full `planning/searching/synthesizing/complete/error/interrupted` state set, live elapsed clock anchored to server time, per-step plan list with status, and a real **Retry** for a failed/stopped run — matches or exceeds ChatGPT's Deep Research progress UX                      |
| Code-execution output rendering                                                                                                          | `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx`                                              | Executing/success/error, stdout, stderr (visually distinct), inline plot images, non-zero exit code — this exists on **web only**, see RENDERING-006                                                                                                                                 |
| Schema-versioned interactive-card system with honest fallback                                                                            | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:1-119`                                      | Explicitly built the degradation path (unknown kind / newer schemaVersion / failed validation / deliberately-unrendered kind) _before_ any card producer existed, so the fallback is exercised on every message, not just in an emergency                                            |
| Branch / fork conversation                                                                                                               | `apps/web/features/chat/components/messages/MessageBubble.tsx:369-374,1977-1981` (`onBranch`, `BranchNavigator`) | A visible branch switcher — Claude's own benchmark evidence says branching is **fully invisible** in claude.ai and is an actively-requested GitHub issue for Anthropic (`research/claude-web-desktop.md` §2, §15). Web here already beats that bar.                                  |
| Mobile response-action row                                                                                                               | `apps/mobile/src/features/chat/components/MessageBubble.tsx:1011-1064`                                           | Copy, Read aloud (toggling on-device TTS), Share/export, Regenerate, thumbs up/down, plus a Play-Store-mandated Report/flag button — richer than desktop's action row (see RENDERING-004)                                                                                            |
| Mobile citation chips                                                                                                                    | `apps/mobile/src/features/chat/components/CitationChip.tsx`, `CollapsibleSources.tsx`                            | Tap-to-open in an in-app browser sheet with a validated-URL gate, not a raw `Linking.openURL`                                                                                                                                                                                        |

## Verified gaps

| ID            | Sev | Surface          | Gap                                                                                                                                                                                                      | Benchmark                                                                                  |
| ------------- | --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| RENDERING-001 | P1  | cross-surface    | Three independent, non-converged markdown/rendering engines exist in one product                                                                                                                         | Any single ChatGPT/Claude surface renders markdown identically everywhere                  |
| RENDERING-002 | P1  | extension-chrome | Side-panel markdown has no tables, no images, no math, no syntax highlighting, no per-code-block copy                                                                                                    | ChatGPT-for-Chrome / Claude-in-Chrome render full markdown                                 |
| RENDERING-003 | P2  | mobile           | Regex markdown parser silently drops nested-list structure and ignores inline formatting inside table cells                                                                                              | Web's own remark/rehype table+list rendering                                               |
| RENDERING-004 | P1  | desktop-tauri    | Desktop chat is missing thumbs feedback (dead wiring), user-message edit (dead store action), Share, Read Aloud, Branch, and Report                                                                      | Web's own response-action row; ChatGPT/Claude desktop apps all have feedback+edit          |
| RENDERING-005 | P1  | extension-chrome | Only response action anywhere in the side panel is whole-message Copy                                                                                                                                    | ChatGPT/Claude Chrome extensions' full action rows                                         |
| RENDERING-006 | P1  | desktop-tauri    | No renderer for code-execution stdout/stderr text — a print-only turn shows nothing                                                                                                                      | Web's own `CodeExecutionBlock`; ChatGPT Code Interpreter, Claude code execution tool       |
| RENDERING-007 | P2  | cross-surface    | No inline file-diff (red/green line) view anywhere in the chat transcript for file-edit tool results                                                                                                     | Claude Code / Codex diff review UI (`shots-claude-web.md` §169 "Files Changed 3" preview)  |
| RENDERING-008 | P2  | cross-surface    | Citations are a flat trailing chip row with a native tooltip, not claim-adjacent inline chips with a rich hover popover; extension has zero citation UI                                                  | ChatGPT's documented citation chip + popover + Sources panel (`chatgpt-web-desktop.md` §3) |
| RENDERING-009 | P2  | cross-surface    | Branch/fork conversation UI exists only on Web — Desktop, Mobile, Extension have no branch switcher at all                                                                                               | Internal consistency (own web surface already builds this)                                 |
| RENDERING-010 | P2  | web              | Two parallel, architecturally inconsistent mechanisms decide whether to render a rich card: a schema-versioned backend-emitted registry, and a regex heuristic that sniffs raw markdown prose            | n/a — internal architecture inconsistency                                                  |
| RENDERING-011 | P3  | web              | Only 2 of the declared `InteractiveCard` kinds have live producers (`clarify.v1`, `map-search.v1`); `itinerary.v1` and any weather/stocks/shopping/local-business/reservations/jobs kind are undelivered | ChatGPT/Claude rich-card support itself is unverified/thin per research — low bar          |
| RENDERING-012 | P3  | cross-surface    | No native/interactive chart or graph component anywhere; a generated chart only ever reaches the user as a static PNG via the code-execution image path                                                  | ChatGPT Code Interpreter inline charts                                                     |

## Evidence detail

### RENDERING-001 — three markdown engines

- **Web + Desktop** (share the same component): `apps/web/features/chat/components/messages/MessageBubble.tsx:65-66` dynamically imports `MarkdownContent` from `@agiworkforce/unified-chat`, which is `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` — a real `react-markdown` + `remark-gfm`/`remark-math`/`remarkBreaks` + `rehype-raw`→`rehype-sanitize`→`rehype-katex`→`rehype-highlight` pipeline.
- **Mobile**: `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` (642 lines) is a hand-written, line-by-line regex parser (`renderTextSegment`, `renderInlineMarkdown`) that reimplements headers, blockquotes, lists, tables, and math from scratch with no shared code path to the web/desktop engine.
- **Extension**: `apps/extension/src/features/side-panel/markdown.ts` (179 lines) is a _third_, independently written regex parser (`renderMarkdown`) with a much smaller feature set than mobile's.
- A fix to the shared `MarkdownContent.tsx` (e.g. a sanitizer-schema hole, a KaTeX rendering bug) does **not** reach mobile or the extension — confirmed by `grep -rn "MarkdownContent" apps/mobile apps/extension` returning zero hits. This mirrors the exact "four parallel renderers" architecture note in this domain's brief and is the root cause of RENDERING-002/003.

### RENDERING-002 — extension markdown gaps

`apps/extension/src/features/side-panel/markdown.ts:96-179` (`renderMarkdown`):

- No `|...|` table handling anywhere in the function — a markdown table in an assistant response renders as a run of literal pipe characters in a paragraph.
- No `![alt](src)` image handling, and `sanitizeHtml` (`markdown.ts:30-94`) explicitly puts `img` in `FORBID_TAGS` and `src` in `FORBID_ATTR` — even a raw `<img>` in trusted content would be stripped. Chat responses containing images are unreadable in the extension.
- No `$...$`/`$$...$$` math handling anywhere.
- Code fences render via a bare string replace to `<pre><code>{code}</code></pre>` (`markdown.ts:99-101`) with no language class and no highlighting library — every code block is unstyled black-on-white/white-on-black text.
- Confirmed via `apps/extension/src/features/side-panel/bubbles.ts` that no post-processing step (no `querySelectorAll('pre')`, no highlight.js call) runs after `sanitizeHtml(renderMarkdown(...))` is assigned to `bubble.innerHTML` (`bubbles.ts:231,677`) — so this is the complete code-rendering path, not a partial view.

### RENDERING-003 — mobile markdown correctness bugs

`apps/mobile/src/features/chat/components/MessageContentRenderer.tsx`:

- List detection regexes (`ulMatch`/`olMatch`, lines 262-263, 307) are anchored `^[-*]\s+`/`^(\d+)\.\s+` with **no leading-whitespace tolerance**. A nested/indented sub-item (`  - nested point`) matches none of the header/blockquote/list/table branches and falls through to the plain-paragraph branch (line 490-499), silently losing its bullet, indentation, and list semantics — it just becomes a run of text.
- Table-cell rendering (line 449-461, inside the `ScrollView`/table block) renders `{row[colIdx] || ''}` as a bare string — it never calls `renderInlineMarkdown` on cell contents, unlike every other text-bearing branch in the same file (headers, list items, blockquotes, and plain paragraphs all call it). A table cell containing `**Yes**` or `` `code` `` or a link renders the literal markdown syntax characters instead of formatted text.
- Both are real, reproducible divergences from the web/desktop `remark-gfm` table+list implementation, not stylistic choices.

### RENDERING-004 — desktop response actions

`packages/ui/unified-chat/src/components/ActionBar.tsx` is the sole response-action row rendered on Desktop (via `MessageBubble.tsx` in the same package). Its own inline comments document the gap:

- Line 54-57: _"Thumbs feedback is only rendered when the host wires `onFeedback`... Desktop does not yet persist message reactions; this is a tracked delta."_
- Line 88-90: _"Retry only renders when a regenerate handler is wired... Desktop does not yet wire regenerate through the runtime; tracked delta."_ (Retry is in fact wired — see below — but feedback is not.)
- `packages/ui/unified-chat/src/components/MessageList.tsx:210-216` — the only prop passed into `MessageBubble` from the list is `onRetry={onRegenerateMessage}` (plus tool-approval callbacks). `onFeedback` is never passed anywhere in `MessageList.tsx` or `ChatInterface.tsx` (confirmed via `grep -n "onFeedback" packages/ui/unified-chat/src/components/ChatInterface.tsx packages/ui/unified-chat/src/components/MessageList.tsx` → zero hits), so the entire thumbs-up/down block in `ActionBar.tsx:58-86` can never render in production — dead UI code, not a partial rollout.
- Message **editing**: `apps/desktop/src/stores/chat/chatStore.ts:271,1360` defines a fully implemented `editMessage(messageId, newContent)` action (dispatches `'chat/editMessage'`). `grep -rn "editMessage(" apps/desktop/src --include="*.ts" --include="*.tsx"` outside the store file itself returns **zero callers** — no button, menu item, or gesture anywhere in the desktop UI invokes it. This is dead code implementing a real capability nothing can reach.
- Share, Read Aloud, Branch/Fork, and Report — all present on Web's `MessageBubble.tsx` (`onReadAloud`, `onBranch`, `Flag`/report at `:1964-1975`) — have no equivalent prop, callback, or UI anywhere in `packages/ui/unified-chat/src/components/{ActionBar,MessageBubble}.tsx`.
- Net result: Desktop's per-message action row is Copy + (conditionally) Retry. Every other action web has is either unwired or non-existent on the surface most competitor products treat as their flagship.

### RENDERING-005 — extension response actions

`apps/extension/src/features/side-panel/bubbles.ts` — the entire response-action surface for an assistant message is a single copy button, duplicated at two render sites:

- Lines 241-262 (`buildBubbleWithTools` path): "Action row: timestamp + copy button (assistant only)".
- Lines 705-724 (a second bubble-builder path): identical copy-only pattern.
- `grep -n "onRegenerate\|onEdit\|onShare\|onReadAloud\|onFeedback\|onFork\|thumbsUp" apps/extension/src/features/side-panel/bubbles.ts` returns zero hits. No regenerate, no edit, no share, no read-aloud, no thumbs feedback, no fork, and no report exist anywhere in the side panel.
- Tool-call approve/reject _does_ exist and is reasonably built (icons, decisions, error state) — this gap is specific to per-message response actions, not the whole extension experience.

### RENDERING-006 — desktop code-execution output

- Web's `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` renders `isExecuting`, `stdout`, `stderr` (visually distinct, red-tinted), inline plot images, and a non-zero exit-code line.
- Desktop's shared `packages/ui/unified-chat/src/components/MessageGeneratedFiles.tsx` (imported by the desktop `MessageBubble.tsx`) has a running/pending state (`hasRunningExecutionTool`, lines 126-138) and file cards, but **`grep -n "stdout\|stderr" packages/ui/unified-chat/src/components/MessageGeneratedFiles.tsx` returns zero hits** — there is no component anywhere in the package that renders raw execution output text.
- Concretely: a Python turn that does `print("done")` with no file output produces a visible "Output" block on Web and **nothing but the generic tool-call name** on Desktop, since the only other place a tool `result` string could render is the generic JSON/text dump inside `ToolCallCard`'s collapsed "Response" section, which is not surfaced by default and reads as raw JSON, not a console.

### RENDERING-007 — no inline file-diff view

- The only place a tool's `result` renders in the shared `ToolCallCard.tsx` is a generic `<pre>{result}</pre>` block (`packages/ui/unified-chat/src/components/ToolCallCard.tsx:333-342`) or the equivalent in web's own `ToolCallCard`/`ToolTimeline.tsx` — no red/green line-diff renderer exists in either.
- Desktop _does_ have real diff viewers — `apps/desktop/src/features/editing/EnhancedDiffViewer.tsx` and `apps/desktop/src/features/git/GitDiffViewer.tsx` — but per `audit/parity-2026-08-15/inventory/desktop-tauri.md`, these live in the separate Code/Git workspace views, not the chat transcript. A file-edit tool call surfaced inside a chat turn (e.g. an AGI Work session editing a file) has no path to either diff viewer.
- Benchmark: `research/shots-claude-web.md` screen 169 shows Claude Code's own setup screen previewing "Files Changed 3" with an inline diff card; Codex's PR/diff review UI is documented similarly in `research/chatgpt-web-desktop.md` §3.

### RENDERING-008 — citation UX

- `apps/web/features/chat/components/messages/InlineSourceTags.tsx` (54 lines, full file read): every citation renders as a small pill in a single `flex flex-wrap` row _after_ the message body, with only a native `title` attribute for extra detail (no popover component, no favicon, no snippet preview beyond the raw tooltip, no pagination for multi-source claims).
- `apps/mobile/src/features/chat/components/CitationChip.tsx` (47 lines): same shape — a tap-to-open pill, no rich preview.
- Neither includes claim-adjacent positioning (the citation always sits in a trailing row for the whole message, never inline after the specific sentence it supports).
- The extension has **no** citation component at all — `grep -rliE "citation|source.card" apps/extension/src` returns zero files. Any citation in an extension-rendered response is whatever raw markdown link the model happened to emit, styled like any other link.
- Benchmark (`research/chatgpt-web-desktop.md` §3): ChatGPT's citation chips are claim-adjacent, collapse via a "+N" badge, and open a hover popover with publisher/headline/snippet and 1/N pagination, plus a separate persistent "Sources" panel.

### RENDERING-009 — branch UI is web-only

- `grep -n "onBranch\|BranchNavigator" apps/mobile/src/features/chat/components/MessageBubble.tsx apps/extension/src/features/side-panel/bubbles.ts packages/ui/unified-chat/src/components/MessageBubble.tsx` returns zero hits across all three. Only `apps/web/features/chat/components/messages/MessageBubble.tsx` has this feature (props at `:369-374`, UI at `:1062-1069,1977-1981`).
- This is a genuine strength relative to Claude (see Strengths table) but an internal inconsistency: a user who edits an earlier message on Desktop or Mobile creates the same implicit branch web does, with no way to see or switch it on that surface.

### RENDERING-010 — dual card-detection architecture

- `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:33-42` is a clean, schema-versioned system: the backend emits a typed `InteractiveCard` object with a `kind`, `body`, and `fallback`, and the frontend looks up a renderer by `kind` via `resolveInteractiveCardRenderer`.
- `apps/web/features/chat/components/cards/index.tsx:26-77` (`detectCardType`) is a completely separate mechanism for a different set of card types (recipe/comparison/steps/calculation): it regex-scans the raw markdown **text** of the message for structural signals (`#+\s*ingredients`, `vs\.?`, `step\s+\d+`, etc.) with no backend signal at all.
- These two systems coexist in the same message-render path (`MessageBubble.tsx` calls both `InteractiveCardBlock` for `message.interactiveCards` and `MessageFormatCard`/`detectCardType` for `cleanedContent`, `:1267-1274`) with different reliability characteristics — the regex path can misfire on ordinary prose that happens to contain "ingredients" and "instructions," while the schema path cannot false-positive by construction. `detectCardType`'s own comment concedes this ("intentionally conservative... to avoid false positives").

### RENDERING-011 — sparse interactive-card coverage

`apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:33-36`: the registry comment states plainly that `itinerary.v1` "still has no resolver-backed producer, so it keeps falling back rather than pretending model-authored place names are verified places" — an honest, deliberate non-implementation, not a bug. `grep -rliE "WeatherCard|StockCard|SportsCard|ShoppingCard|ProductCard|LocalBusinessCard|TravelCard|ReservationCard|JobCard"` across `apps/web`, `apps/mobile`, `apps/desktop`, `packages/ui`, `packages/platform` returns nothing outside build artifacts. Only `clarify.v1` and `map-search.v1` have live producers.

### RENDERING-012 — no native chart rendering

`grep -rln "recharts|Chart\b" apps/web/features/chat/components` returns nothing (confirmed independently, matching `audit/parity-2026-08-15/inventory/web-frontend.md` §3.3's own finding). The only path a generated chart can reach the user through is `CodeExecutionBlock.tsx:112-122`'s base64 image rendering — functional but always a static raster image, never an interactive/native chart component.

## What NOT to copy

- **Do not build a claim-adjacent inline-citation-chip system that is "decorative."** ChatGPT's own model-switch-per-turn UX is documented in `research/chatgpt-web-desktop.md` §4/§17 as feeling "decorative" to users (selected model doesn't visibly change behavior) — if RENDERING-008's citation fix or any "regenerate with a different model" feature is built, make sure the visible affordance actually changes verifiable behavior, not just a label.
- **Do not chase weather/stocks/sports/shopping rich cards as a priority.** The research explicitly marks ChatGPT's own support for these UNVERIFIED, and Claude shows no evidence of having them at all (`research/cross-cutting-and-complaints.md` §1). RENDERING-011 is correctly P3, not P1 — the schema-versioned registry with honest fallback (RENDERING-010's better half) is the right foundation to extend later, not a gap to panic-fix now.
- **Do not "fix" the mobile/extension markdown gap by porting the regex parsers to be more feature-complete.** Both mobile (RN, no DOM) and extension (vanilla DOM, no React) have real platform constraints that stopped them from using `react-markdown` directly, but the fix that actually closes RENDERING-001 for good is converging on a single AST-based parser (e.g. a shared `micromark`/`mdast` core with per-platform renderers), not adding more regex branches to two already-fragile hand-rolled parsers.

## Prior-art cross-check

`audit/ui-gaps.csv` has no rows matching message-rendering internals (markdown engines, tool-call state machines, citation UX, response-action wiring) at this level of granularity — its gap-type vocabulary (`missing-control/screen/ia/copy/state/interaction/feature`, `visual-polish`) is screen-scoped, not code-path-scoped, so it could not have produced RENDERING-001 through 012. The one adjacent row is **GAP-245** (P2, desktop, Open): "No copy-deeplink / copy-session-id / copy-chat-as-Markdown actions for a conversation" — a _conversation_-level action, distinct from the _message_-level action gaps here (RENDERING-004/005), cited for completeness but not duplicated. `audit/parity-2026-08-15/gaps/domain-artifacts.md` (a sibling domain) covers the full Artifacts panel/viewer/publish/sync surface; this domain intentionally stops at the inline `InteractiveCardBlock`/`InlineArtifactCards` message-level rendering and does not re-file panel-level artifact gaps.
