# Artifacts / Split-View parity (P4) — plan + decisive verification

Status: IN PROGRESS (web first). Owner: this session. Last updated: 2026-06-21.

Goal (founder): full UX/feature parity with Claude.ai Artifacts + Split-View. Visual
source of truth: `~/Desktop/reference/claude_reference/` images **377–402** (the
`__artifacts__` set). Architectural source: `~/Desktop/reference`.

## Decisive verification (decides whether we touch the DB/sync at all)

Traced the LIVE web render path: `WebChatPage` → `ChatMessageList` → `MessageBubble`.

- **Artifacts are DERIVED, not first-class.** `MessageBubble` runs `extractArtifacts()`
  (`utils/artifact-detector.ts`) over message content and calls `addArtifactForMessage`
  into the conversation-scoped `artifacts-store` (keyed by messageId/conversationId).
- **The viewer is VIEW-ONLY.** `ArtifactsPanel` → `ArtifactPreview` has copy / download /
  refresh / fullscreen / version-nav, but **no edit-in-place** (no onSave/setContent).
  So artifact content NEVER diverges from the message it was extracted from.
- **⇒ Cloud persistence is ALREADY FREE.** Messages sync via the P2 managed-cloud engine
  (`/api/chat/sync`, managed-only, RLS). Each device deterministically re-extracts the
  artifact from synced message content. **No artifact table, no migration, no new route,
  no trust-boundary change.** The founder's pause condition (UI vs DB-sync constraints)
  is NOT triggered.

### Load-bearing constraint (keep the free path free)

Do **NOT** add edit-in-place, independent version history, or any artifact state that can
diverge from message content. If a future feature needs that, it becomes a schema task
(managed-only, on the existing gated sync path — never a new route, never Local/BYOK) and
must be converged with the founder first. Until then: **artifacts stay derived.**

## Trust boundary (unchanged, locked)

"Cloud mode" only. Local/BYOK artifacts stay on-device (their messages have no cloud_id
and never push/pull). Any future artifact sync rides the existing managed-only gated path.

## E2B caveat (carried from P3)

"Integrate E2B sandbox results into artifacts" — the render layer supports code-execution
results for **native providers** (Anthropic/Google/OpenAI) today. **E2B-tier providers
(DeepSeek/Kimi/GLM/MiniMax) execution is unreachable in prod** (see
`e2b-universal-execution-design-2026-06-21.md` §1.1). Build the render layer for both, but
do NOT represent E2B-tier execution as working.

## Slices

- **Slice 1 (web, IN PROGRESS): split-view artifact viewer fidelity.** Refs 387/388/391/
  393/394/395/396/399. `ArtifactPreview` gets `variant: 'card' | 'panel'` (default card =
  today's behavior; gallery unaffected) + `onClose`. Panel variant = full-height flex-fill
  - single reference toolbar: LEFT `[Eye=Preview | Code=Source]` segmented toggle then
    `Title · TYPE`; RIGHT Copy / Download / Refresh / Open-in-new-tab / Fullscreen / Close.
    `ArtifactsPanel` passes `variant='panel'`.
- **Slice 2 (web): inline tool-call → structured rendering fidelity. — ALREADY PRESENT.**
  Audited the live components: `ToolTimeline.tsx` is already built against these exact refs
  (its comments cite "image 381/383/385"): collapsed "Ran N commands, created a file, read a
  file" summary (383), per-step icon rows + filename chips (378/382/385), "✓ Done" row (378),
  inline web-search source cards w/ favicons (381). `InlineArtifactCards.tsx` renders in-thread
  cards (thumbnail + title + type badge + "+N more") that open the split-view panel on click
  (the parity equivalent of the refs' "Open in …" CTA). `CodeExecutionBlock.tsx` renders
  stdout/stderr/images. ⇒ No rebuild needed; the gap was the viewer (Slice 1). Remaining here
  is VISUAL QA + any polish that only a running-app pass reveals.
- **Slice 3+ (later, supervisor fan-out): desktop (canvas) + mobile (artifacts) parity.**

## Verification status

- Slice 1: web typecheck clean; artifacts + artifacts-store tests 7/7; card branch
  byte-identical (gallery unaffected).
- **Browser visual QA = DONE** (Playwright against the live dev server on :3000, via a
  throwaway `/artifact-qa` harness mounting the real `panel` variant — harness since
  deleted). Confirmed for both an HTML artifact (Eye/Code toggle + live preview iframe,
  full-height fill) and a Markdown document (`· MD` label, no toggle, source view): the
  single reference toolbar renders, conditional buttons gate correctly (Refresh/Open only
  when previewable), and the `flex-1 min-h-0` height chain fills with no collapse. Matches
  refs 388/393.

## Found during QA (NOT Slice 1 regressions — tracked for follow-up)

1. **Pre-existing SSR sanitizer quirk.** `buildSandboxSrcDoc` (html-sanitizer) throws
   `DOMPurify.addHook is not a function` when an HTML artifact is server-rendered (DOMPurify
   has no DOM under SSR). It **self-recovers to client rendering** and is harmless on real
   `/chat` (artifacts only ever render client-side, post-stream). Unchanged by Slice 1 (same
   in the card variant). Fix = make the sanitizer SSR-safe (guard `addHook`); it touches
   security code, so flag for a dedicated change, not folded into parity work.
2. **Polish: rendered document preview in panel.** A plain `document`/`md` artifact shows
   raw markdown source (no preview toggle), whereas ref 393 shows RENDERED markdown. Adding
   a markdown/document renderer to the panel preview is a Slice-2 polish item (keep derived;
   render-only, no edit).

## Blast-radius guardrails (web)

`ArtifactPreview` is also used inline at `app/gallery/GalleryClient.tsx:923` — the default
(`card`) variant must stay byte-identical in behavior. `ArtifactData` type is imported by
`artifacts-store`, `artifact-detector`, `InlineArtifactCards`, `MessageBubble` — do NOT
change its shape; only add optional component props.
