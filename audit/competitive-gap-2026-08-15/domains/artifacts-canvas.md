# Artifacts, Canvas & Generative UI Objects — Competitive Gap Audit

**Date:** 2026-08-15
**Benchmark:** live-observed ChatGPT, Claude, Gemini, Manus (2026-08-15)
**Scope:** `apps/web/features/chat/components/artifacts/*`, artifact persistence/store, publish/share flow, gallery route, composer, image/video generation surfaces.

## Method note

I read the actual component/route source for every claim rather than trusting names. Chain traced
per claim: UI control → store/hook → client service → network route → DB/server handler → what
actually renders. Where I could not verify a link I say so explicitly rather than inferring.

## Headline

This is the strongest-built domain I've audited in this repo so far relative to the benchmark.
The web artifact system (`ArtifactsPanel.tsx` + `ArtifactPreview.tsx`) is a genuine, well-engineered
analogue of Claude's Artifacts feature — persistent right-side panel, in-place Preview/Code toggle,
auto title + type label, version history with Restore, a **real, end-to-end working publish flow**
(CSRF-guarded, rate-limited, RLS-scoped, with a hardened public render policy), and a
cross-origin/null-origin sandboxed iframe that is architecturally ahead of what the benchmark could
even confirm for ChatGPT/Claude (their sandboxing was "strongly inferred," ours is read directly
from the sanitizer/sandbox code and confirmed shipped in `docs/agent-context/known-flaws.md`).

Where we fall short is almost entirely in the **single-product, non-table-stakes differentiators**:
Gemini's dedicated Canvas composer entry, its Deep-Research-to-five-formats transform, its
first-class Videos surface, and ChatGPT's full-page pinned-annotation image editor. None of these
are things "all benchmarked products have" — they are one-off differentiators, and per the audit's
own severity rule that caps them at P3 rather than P1/P2. There is a real, actionable P3 gap in the
gallery (`/gallery`) missing search/filter/shared-tab that Claude's dedicated artifact gallery has,
and a smaller finding that our transcript's tool-call narration mechanism (`humanizeToolName`) is
generic infrastructure with no product-level "skill" bundled for design/UI work, so it cannot
currently reproduce Claude's "📋 Loaded frontend-design skill" narration even though the display
plumbing to show such a label already exists.

---

## Claim-by-claim findings

### artifacts-01 — Persistent side-panel rendering — **AT PARITY / STRENGTH**

`apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:399-581` renders a real inline
right-side panel (`sm:relative … md:w-1/2 lg:w-[480px]`, resizable via a drag handle at
`ArtifactsPanel.tsx:367-395` with a persisted width in `useChatUIStore`), distinct from the
transcript, that survives scroll and later turns (it's driven by `useArtifactsStore` keyed on
`activeConversationId`, not by message position). Below `sm` it becomes a real modal overlay with
focus trap and Escape handling (`ArtifactsPanel.tsx:308-362`, `role="dialog"` /
`aria-modal`). This is a strength — the panel here is materially more accessible (focus trap,
keyboard resize) than what the benchmark documented for Claude.

### artifacts-02 / artifacts-14 (ChatGPT negative claims) — not directly applicable to us

These describe ChatGPT's _inline, no-panel_ behavior and generic progress labels — not something we
need to match. Noted for context only.

### artifacts-03 — In-place Preview↔Source toggle — **AT PARITY**

`ArtifactPreview.tsx:1130-1160` — an Eye/Code segmented control in the panel header flips
`activeTab` state on the same mounted component; no navigation occurs. Confirmed for renderable
types (`canPreview`), shared-renderer types (spreadsheet/presentation/email), and markdown docs.

### artifacts-04 (ChatGPT negative claim) — **we do NOT have this problem**

Source view never requires leaving the conversation; it's the same in-panel toggle as artifacts-03.
Strength relative to ChatGPT's documented behavior.

### artifacts-05 — On-object publish/export actions — **AT PARITY, arguably AHEAD**

`ArtifactPreview.tsx:1291-1344` — Download (dropdown: HTML/txt/Markdown/CSV/generated-file per
type) and Publish (`Globe` icon button) both live directly in the panel toolbar, one click, visible
from creation. Unlike Claude's benchmark note ("publish action's end-to-end result was not
exercised in this research"), ours is **verified fully wired end-to-end**:
`apps/web/app/api/artifacts/publish/route.ts` (CSRF via `requireCsrfToken`, rate-limited via
`withRateLimit(..., 'share-create')`, Zod-validated, `getUserScopedDb` RLS), backed by
`published_artifacts` (migration 0095, forced RLS, owner-only) per
`docs/agent-context/known-flaws.md:396-411`. Public page is `/shared-artifact/[token]`, renders
html/react/mermaid **only** through the sandboxed iframe, svg as inert `data:` image, everything
else escaped/rejected by both application code and a DB CHECK constraint. This is a genuinely
strong result — better-verified than the benchmark's own note about Claude.

One structural difference from Claude's exact chrome: Claude combines Download+Publish under one
chevron dropdown; we use two separate toolbar buttons (a Download dropdown and a standalone Publish
button). Functionally equivalent (both one click, both on-object), so not filed as a gap.

### artifacts-06 / artifacts-07 (ChatGPT negative claims) — **we do NOT have this problem**

We have a visible Publish action (05) and it produces a real, separately-persisted public artifact
(list surfaced in Settings → Shared Links, see below). Strength relative to ChatGPT.

### artifacts-08 — Auto title + type badge — **AT PARITY**

`ArtifactPreview.tsx:1163-1176` — `TypeIcon` + `artifact.title || 'Artifact'` + a muted
`· {typeLabel}` (uppercased language or type) render in the header from first paint. Confirmed the
title itself is real content (not empty), sourced from `artifact.title` set at creation time by the
extraction pipeline (not audited line-by-line here, but the render path unconditionally consumes it).

### artifacts-09 — Dedicated artifact gallery with nav, filters, search, "New artifact" — **PARTIAL — real gap**

We do have a dedicated, artifact-typed gallery, reachable from the left nav (`WebSidebar.tsx:112`
`{ id: 'artifacts', label: 'Artifacts', icon: Box }` → `WebShellV3.tsx:33` `artifacts: '/gallery'`),
which is meaningfully **better than the ChatGPT/Gemini pattern** described in artifacts-10 (generic
multi-type Library). `GalleryClient.tsx` pulls real data (`useArtifactsStore((s) => s.artifacts)`,
`GalleryClient.tsx:987-992`), has a "New Artifact" entry point with a category picker + guided
creation wizard (`GalleryClient.tsx:1061-1089`, `184-, 480-, 608-`), and a real empty state.

What's missing relative to Claude's documented `/artifacts` gallery:

- **No search** — grepped the whole file for `search`/`Search`, zero hits.
- **No filter-by control** — grepped for `filter`/`Filter`, only an unrelated `.filter(Boolean)`
  call at `GalleryClient.tsx:630`.
- **No "Shared with you" tab** — only two tabs exist: `'yours' | 'inspiration'`
  (`GalleryClient.tsx:970`), vs Claude's All/Yours/Shared-with-you.
- **"New Artifact" never opens a blank, directly-editable canvas** — `handleCategorySelect`
  (`GalleryClient.tsx:994-1000`) either `router.push('/chat')` (blank chat) or opens the wizard,
  which calls `handleLaunch` → `router.push('/chat?prompt=...')` (`GalleryClient.tsx:1002-1005`).
  Every path routes through a chat prompt; there is no artifact editor you can type directly into.
  This corroborates the prior audit's `ARTIFACTS-003` finding (`audit/parity-2026-08-15/gaps/domain-artifacts.json:44-61`)
  almost exactly — same conclusion, independently reached from the gallery side rather than the
  Code-tab side.

Filed as a P3 gap (single-product Claude differentiator, tableStakes:false per the claim), but the
"New Artifact never opens a blank canvas" half is a repeat confirmation of an existing P2 prior-audit
finding, not a new severity input.

### artifacts-10 (ChatGPT/Gemini negative claim) — **we are AHEAD**

Our artifacts are NOT filed inside a generic multi-content-type file manager — they have their own
typed store (`useArtifactsStore`) and their own gallery route, distinct from any generic
document/upload library. Genuine strength; cite in the strengths list.

### artifacts-11 — Dual presentation (panel + inline transcript card) — **AT PARITY, broader than Claude's documented scope**

`InlineArtifactCards.tsx` renders a "Presented file"-style card (icon, title, `{Kind} · {EXT}`
subtitle, Download) inline in the transcript, used unconditionally at
`MessageBubble.tsx:1444` (`<InlineArtifactCards artifacts={inlineArtifacts} />`) for **every**
artifact type — not gated to document/markdown artifacts the way the benchmark describes Claude
doing (Claude's inline card was only confirmed for the MD artifact test; the HTML artifact test
showed no inline card). Whether showing this card for HTML/code artifacts too is a net positive vs
Claude's more minimal HTML presentation is a design judgment call, not a functional gap — flagging
as a behavioral difference, not filing as a defect.

### artifacts-12 — Same panel chrome across types — **AT PARITY**

One `ArtifactPreview` component (`ArtifactPreview.tsx`) drives every content type via `artifact.type`
branches (`TypeIcon`, `typeLabel`, `canPreview`/`isSharedRendered`/`isMarkdownDoc`/`isPdf`/`isDocx`/
`isImage` gates around line 1090-1372) — confirmed a single unified component, not type-specific UI
surfaces.

### artifacts-13 / artifacts-14 — Named skill/tool disclosure during generation — **PARTIAL — real gap**

The **display mechanism** for this exists and is more general-purpose than Claude's: `ToolTimeline.tsx`
renders a per-step icon (`getToolIcon`, `ToolTimeline.tsx:61-104`, including a dedicated `BookOpen`
glyph "Claude reference... uses an open-book glyph for skills" for any tool name containing
`'skill'`/`'learn'`) and a human label via `humanizeToolName` (`ToolTimeline.tsx:145-196`) that
falls through to the tool's real name for anything not in its short alias map — so if a backend tool
call is literally named e.g. `Load frontend-design skill`, it **would** render verbatim.

What I could not find: any product-level bundled skill analogous to Claude's "frontend-design skill"
that the artifact-generation path would auto-select before building UI. There is a real, working
skills subsystem (`packages/tools/skills`, `apps/web/lib/services/skill-catalog-service.ts`,
`executeSkillTool`), but grepping every `SKILL.md` under the repo (excluding
`.vscode-test`/IDE-extension fixtures and this repo's own `.agents/skills/*` dev-tooling skills,
which are Claude Code environment skills, not product skills) turned up **no product-shipped
design/UI skill** that a chat generation turn would load. So: the disclosure _plumbing_ is built and
would work; the specific behavior of "artifact generation auto-selects and narrates a named UI-design
skill" is unverified/likely absent. This is a nuanced finding, not a hard MISSING — recorded as
`PARTIAL` / `BUILT_NOT_WIRED`-adjacent: the display link exists, the generation-time skill-selection
link to feed it a specific "frontend design" skill name does not have positive evidence.

### artifacts-15 (ChatGPT negative claim) — **we are AHEAD**

We do not have ChatGPT's split architecture (separate Run panel vs. inline app surface). One
`ArtifactData` type union (`ArtifactPreview.tsx:96-119`) and one `ArtifactPreview` component cover
html/react/svg/mermaid/code/document/spreadsheet/table/csv/presentation/email/image uniformly.
Genuine strength; also the basis for a `notWorthCopying` entry (don't fragment this later).

### artifacts-16 — Sandboxed iframe isolation for interactive artifacts — **AT PARITY, well-evidenced**

`apps/web/features/chat/components/SandboxedIframe.tsx` confirms real cross-origin sandboxing: a
configurable separate `NEXT_PUBLIC_SANDBOX_ORIGIN`, and a same-origin **fallback** iframe that
explicitly uses `allow-scripts` **without** `allow-same-origin` (null origin), authenticated by
window identity rather than origin string (`SandboxedIframe.tsx:16-24`). The publish path additionally
enforces `connect-src 'none'` on the public render (`docs/agent-context/known-flaws.md:404-406`).
Since this is a real `allow-scripts` sandbox (not a blocked/disabled-JS iframe), ordinary DOM state
changes (e.g. a stepper `+` button) should work for a real user click — the benchmark's own inferred
failure for ChatGPT/Claude was attributed to automated-coordinate-click tooling limits, not to
sandboxes disabling interactivity, and nothing in our sandbox implementation disables script
execution. I did not click-test this myself (no browser tool session was run in this pass), so I'm
not marking this fully OBSERVED — recorded as AT PARITY on architecture grounds with the caveat that
a live click-test was not performed in this pass.

### artifacts-17 — Composer "Canvas" tool entry — **MISSING**

Grepped `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` for `canvas`/`Canvas`: the
only hits are an HTML `<canvas>` element used for camera-capture image processing
(`ChatComposerNew.tsx:1063-1075`), unrelated to artifact/canvas creation. There is no discrete named
composer entry for "create a canvas/artifact." Artifact creation is implicit (triggered by prompt
content) or via the Gallery's "New Artifact" button (which itself just routes to a prefilled chat
prompt, see artifacts-09). Single-product Gemini differentiator, and the benchmark's own evidence
label for Gemini here is `UNVERIFIED` (never exercised even by the benchmark). Low-priority, P3.

### artifacts-18 — Research report → 5 derivative formats — **MISSING**

Grepped `ResearchReportView.tsx`/`ResearchPanel.tsx`/`ResearchActivity.tsx` for
`infographic`/`flashcard`/`quiz`/`audio overview`/a "Create" transform menu: zero hits. No equivalent
surface. Single-product Gemini, P3.

### artifacts-19 — Full-page image editor with pinned annotations — **PARTIAL**

We do have real inline image-edit affordances in `ImageGenerationCard.tsx`: a natural-language edit
composer (`editText` state, `ImageGenerationCard.tsx:367-424`, wired to `onRegenerate`) and an
aspect-ratio dropdown scoped per model (`getImageAspectOptionsForModel`,
`normalizeImageAspectRatioForModel`, `ImageGenerationCard.tsx:478-488`). This is not nothing — it's a
working "describe edits" loop. What's absent: it is inline in the chat message, not a full-page
dedicated editor, and there is no pinned/located annotation mechanism (click-a-point-on-the-image to
scope an edit) — grepped for `pin`/`annotation`/`comment` near the image card, no hits. Single-product
ChatGPT differentiator, P3, but worth noting we're not starting from zero here.

### artifacts-20 — Dedicated top-level video-generation surface — **PARTIAL**

Video generation is real and functionally complete end-to-end: backend routes
(`apps/web/app/api/media/video/{generate,status,cancel,openrouter-webhook}/route.ts`), a durable
workflow (`apps/web/lib/workflows/video-generation-workflow.ts`), and full in-chat lifecycle UI —
`VideoGenerationPlaceholder.tsx` (elapsed-time counter, explicit unconditional "Generating your
video…" label, not motion-gated) through to a completed state at `MessageBubble.tsx:1586`
("Your video is ready!") with a Download control (`MessageBubble.tsx:1604`). What's missing is
Gemini's specific _chrome_: a dedicated top-level nav item, a specialized composer (aspect-ratio +
image-attach + model picker outside the main chat composer), and a template gallery. Grepped
`WebSidebar.tsx` for `Videos`: no hits — video generation is chat-prompt-triggered only, not a
first-class surface. Single-product Gemini, P3 — but flagging that the underlying capability is real
and working is itself worth recording (this is much closer to "different chrome" than "missing
capability").

### artifacts-21 — Design-rationale prose accompanying generated artifacts — **not independently verifiable from static code**

This is a model-output-quality behavior (whether the LLM's own response text narrates its design
choices), not a UI/wiring question this pass can resolve by reading component code — it depends on
system-prompt content and model behavior at generation time, which I did not exercise live in this
pass. Recorded as **unverified**, not claimed either way.

### artifacts-22 — Model name disclosure in image-gen UI copy — **likely MISSING, low-confidence**

Grepped `ImageGenerationCard.tsx` for user-visible `modelId` text: the identifier is threaded through
function calls (`normalizeImageAspectRatioForModel(modelId, ...)` etc.) but I found no rendered
`{modelId}`-derived label akin to Gemini's "Create images with Nano Banana 2" copy near the entry
point. This is a shallow grep-based check, not a full UI audit of every image-generation entry point
in the app, so confidence is lower than the other findings here. Single-product Gemini, P3.

---

## Strengths (AT or AHEAD of the four-product benchmark)

1. **Publish is genuinely end-to-end and hardened**, not just UI-present. `apps/web/app/api/artifacts/publish/route.ts`
   (CSRF + rate limit + Zod + RLS) + `published_artifacts` migration 0095 (forced RLS, owner-only) +
   a public render policy enforced in _both_ application code and a DB CHECK constraint
   (`docs/agent-context/known-flaws.md:396-411`). The benchmark explicitly notes Claude's publish
   "end-to-end result was not exercised in this research" — ours is verified shipped.
2. **Sandboxed, cross-origin/null-origin iframe rendering** (`SandboxedIframe.tsx`) is read directly
   from the sanitizer code, not inferred from a failed click the way the benchmark had to for
   ChatGPT/Claude. `connect-src 'none'` additionally enforced on published pages.
3. **One unified artifact object model** across 12 content types (html/react/svg/mermaid/code/
   document/spreadsheet/table/csv/presentation/email/image) through a single `ArtifactPreview`
   component (`ArtifactPreview.tsx:96-119`), avoiding ChatGPT's documented fragmentation between a
   Run panel and an inline-app surface (artifacts-15).
4. **A dedicated, artifact-typed gallery with its own nav entry** (`/gallery`, `WebSidebar.tsx:112`),
   ahead of ChatGPT/Gemini's generic-Library pattern (artifacts-10) — even though it lacks
   search/filter (artifacts-09 gap above).
5. **Version history with Restore**, exposed directly in the panel header (`ArtifactPreview.tsx:1177-1237`)
   — not called for by name in any of the 22 claims, but a real capability beyond what the benchmark
   documented for ChatGPT.
6. **Accessible mobile overlay**: real `role="dialog"`/`aria-modal`/focus-trap/Escape handling
   (`ArtifactsPanel.tsx:308-362`) — a level of a11y rigor the benchmark's screenshots-based research
   could not have assessed for competitors either way.

## notWorthCopying

- **Claude's naive "AI-powered artifacts" (artifact calls the model directly on the viewer's
  quota).** The prior audit already red-teamed this exact feature (`GAP-P0-009` /
  `docs/current/gap-audit-2026-08-08.md`) and found an anonymous-wallet DoS, an opaque-origin auth
  contradiction, and a fail-open concurrency limiter. Correctly un-shipped; do not clone Claude's
  current design. This is out of this audit's 22 claims (not benchmarked live this pass) but is
  directly adjacent to this domain and worth restating here since a reader of this file will be
  tempted to "catch up" on it.
- **ChatGPT's silent, undiscoverable export-to-Library with no on-object publish control**
  (artifacts-06/07). We already do better (a visible Publish button that actually works) — don't
  regress toward ChatGPT's pattern in the name of "simplicity."
- **ChatGPT's two-surface fragmentation** (separate Run panel vs. inline app rendering, artifacts-15).
  Keep the single unified `ArtifactPreview` component as new artifact types are added rather than
  spinning up type-specific chrome.

## Gaps not filed (explicitly out of scope / insufficient evidence)

- artifacts-21 (design-rationale prose) — model-behavior question, not a code-wiring question; not
  filed as a structured gap because there is no file-level evidence to cite either way.
- artifacts-16 interactivity — architecturally sound (real `allow-scripts` sandbox), but I did not
  run a live click-test in this pass, so I'm not filing a false-positive "it's broken" gap the
  benchmark itself was unsure about, nor claiming full OBSERVED parity.
