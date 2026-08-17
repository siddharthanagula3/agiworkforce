# Domain audit: Artifacts + creation workspaces

Scope: `packages/platform/artifacts`, `infrastructure/sandbox`, web artifact
components/store/API routes, `/shared-artifact/[token]`, mobile and desktop
artifact viewers, office-file generation tools. Benchmarked against Claude
Artifacts (web/desktop/Cowork) and ChatGPT Canvas.

## Summary

This is one of the stronger domains in the repository. The web implementation
(`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`, 1851
lines) is not a thin clone of Claude Artifacts — it covers more artifact
_types_ than Claude documents (spreadsheet/table/csv, presentation, email,
image, PDF, DOCX-via-mammoth, in addition to html/react/svg/mermaid/code/
markdown), has a real content-keyed version history with Restore, a working
Publish-to-public-URL flow with CSRF/rate-limiting/forced RLS, a resizable
split-view panel with keyboard-operable resize and correct mobile modal
semantics, a streamed "writing…" view for in-flight artifacts, and a
cross-conversation Artifacts gallery (`/gallery`) with a curated-inspiration
tab. The cross-origin sandbox renderer (`infrastructure/sandbox/index.html`)
is a genuinely careful piece of security engineering with documented
provenance for every mitigation (DOMPurify with pinned SRI, null-origin
`srcdoc`, CSP with `connect-src 'none'`).

The gaps are real but narrower than the strengths: artifacts created on Web
don't sync to other devices (the sync endpoint supports push, the client only
pulls), Desktop can't publish to a public link at all (local file export
only), nothing in the product supports direct/manual editing of an artifact's
source (every revision requires a new LLM turn), Mobile's viewer is missing
version history and publish, and the security-blocked "AI-powered artifacts"
capability (GAP-P0-009) remains correctly absent rather than shipped unsafely.

## What's already strong (do not rebuild)

| Capability                                       | Where                                                                     | Evidence                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split view, resizable panel (pointer + keyboard) | `ArtifactsPanel.tsx:367-395`                                              | AUDIT-FIX ART-23 wires `artifactPanelWidth`/`setArtifactPanelWidth` to a real drag handle with `role="separator"` and arrow-key resize                                                                                            |
| Correct mobile modal semantics                   | `ArtifactsPanel.tsx:308-362`                                              | `role="dialog"`, focus trap, Escape handling, focus restore — explicitly fixed from a bare `fixed inset-0` div (AUDIT-FIX ART-22)                                                                                                 |
| Preview/Code toggle + version stepper + Restore  | `ArtifactPreview.tsx:1116-1219`                                           | Content-keyed version history with prev/next and a Restore action that appends rather than destructively rewinds                                                                                                                  |
| Publish to a public URL                          | `apps/web/app/api/artifacts/publish/route.ts`, `publishArtifactClient.ts` | CSRF-guarded, rate-limited (`share-create`, 5/min), owner-scoped via `getUserScopedDb` + forced RLS (`0095_published_artifacts.sql`), honest 400 on unpublishable kinds (pdf/docx/image/spreadsheet) rather than a silent failure |
| Cross-origin sandbox renderer                    | `infrastructure/sandbox/index.html`                                       | Real `<iframe srcdoc>` document load (not `innerHTML`) so `DOMContentLoaded`/viewport/`position:fixed` behave correctly; DOMPurify pinned by SRI hash for SVG; parent-origin allowlist including desktop's `tauri://localhost`    |
| Streamed "writing…" artifact view                | `StreamingArtifactView.tsx`                                               | Auto-scroll-to-bottom that respects manual scroll-up, swaps to the persisted artifact once the fence closes                                                                                                                       |
| Cross-conversation Artifacts gallery             | `apps/web/app/gallery/GalleryClient.tsx`                                  | "Your artifacts" (all conversations, sorted newest-first) + "Inspiration" tabs, empty state with a CTA, skeleton loading state                                                                                                    |
| Download all as zip / per-artifact downloads     | `downloadArtifacts.ts`, `ArtifactPreview.tsx:713-866`                     | Filename sanitization, correct binary handling for PDF/DOCX (`application/octet-stream` to force download, not inline-execute)                                                                                                    |
| Additional artifact types beyond the benchmark   | `ArtifactPreview.tsx:96-119, 960-981`                                     | Spreadsheet/table/csv, presentation, email, image, and DOCX (via mammoth) render in-panel — Claude's own docs don't enumerate this breadth                                                                                        |
| Office file generation (docx/pptx)               | `apps/web/lib/services/managed-office-file-service.ts`                    | Real `docx`/`pptxgenjs` generation wired into the tool loop; honestly scopes xlsx to the sandbox path rather than advertising a capability it can't deliver (see `capability-preamble.ts:40-45`)                                  |
| Production-safe QA harness gating                | `apps/web/app/qa-artifacts/layout.tsx`                                    | `notFound()` in production, gitignored source, paired with `robots.ts` disallow                                                                                                                                                   |

## Verified gaps

| ID            | Sev | Surface       | Gap                                                                                                             | Benchmark                                                   |
| ------------- | --- | ------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ARTIFACTS-001 | P1  | cross-surface | Web-authored artifacts never push to the cloud sync endpoint (pull-only client against a full push/pull server) | Claude unified Artifacts view across the account            |
| ARTIFACTS-002 | P2  | desktop-tauri | Desktop's Publish action is hardcoded to a local `file://` export; no `CloudPublisher` exists for Desktop       | Claude — Publish is a platform action, not web-only         |
| ARTIFACTS-003 | P2  | cross-surface | No direct/manual editing of artifact source anywhere; "New Artifact" always routes through a chat prompt        | ChatGPT Canvas — direct editing + inline AI popover         |
| ARTIFACTS-004 | P2  | mobile        | Mobile artifact viewer has no version history and no publish action                                             | Web's own `ArtifactPreview` panel-variant toolbar           |
| ARTIFACTS-005 | P2  | cross-surface | AI-powered / model-calling artifacts entirely absent (correctly, per GAP-P0-009)                                | Claude "AI-powered apps"                                    |
| ARTIFACTS-006 | P3  | web           | No embed-code / domain-allowlist for published artifacts                                                        | Claude — "Get embed code"                                   |
| ARTIFACTS-007 | P3  | web           | No keyboard shortcut to toggle the Artifacts panel                                                              | Same class as tracked GAP-227 (desktop)                     |
| ARTIFACTS-008 | P3  | cross-surface | "Live artifacts" nav label points at the same static gallery — no self-updating artifact concept exists         | Claude Cowork Live artifacts (desktop-only beta even there) |

Full detail with file:line evidence for each row is in `domain-artifacts.json`.

### ARTIFACTS-001 — the one that matters most

`apps/web/app/api/chat/sync/route.ts` is a complete, bidirectional
cross-device sync endpoint — `POST` upserts conversations, messages, _and_
artifacts with server-version compare-and-swap (`route.ts:444-530`). But the
only artifact-sync consumer in the web app,
`useArtifactCloudSync()` (`use-artifact-cloud-sync.ts:20-99`), calls
`pullArtifactCloudChanges()` and nothing else — there is no push call site
anywhere under `apps/web`. Desktop's Rust `cloud_sync.rs` does push its
artifacts (confirmed via `shared-packages.md`'s description of the
cursor-compare golden-fixture setup), so a Desktop-authored artifact does
reach Web. A Web-authored artifact does not reach anywhere: it lives only in
that one browser's `localStorage` under `agi-artifacts-store`
(`artifacts-store.ts:36-38`). This is backend work that's already done and
simply not wired to its second caller — the smallest complete slice is a push
hook on the existing store, reusing the schema `ArtifactWireDelta` the pull
side already parses.

### ARTIFACTS-005 — reconciling GAP-P0-009

`docs/current/gap-audit-2026-08-08.md` GAP-P0-009 says AI-powered artifacts
are "security-blocked and must not ship as currently designed," citing a
red-team NO-GO (anonymous wallet DoS, opaque-origin auth contradiction,
copied capability state enabling repeated billing, fail-open concurrency
limiter). Verified: there is no trace of this capability anywhere in the
repo — not a stub, not a disabled flag, nothing under
`packages/platform/artifacts` or `apps/web/app/api/artifacts` references an
artifact-scoped model-call bridge. The finding is accurate and current. This
audit's position: the capability is a real gap against the benchmark (it's
one of Claude's headline recent features), but the correct fix is not "copy
Claude's design" — the NO-GO's required redesign properties (viewer-scoped
short-lived capability tokens, server-enforced fail-closed budget/concurrency,
immutable published snapshots, strong idempotency) are the bar to build to
when this is prioritized, not the shortcut around it.

## What NOT to copy from the benchmark

- **Claude's hard settings dependency.** Claude's artifacts silently stop
  working if "Code execution and file creation" is toggled off in Settings,
  with (per the fetched docs) no clear error path back to the toggle
  (`research/claude-web-desktop.md` §3, "Requirement gotcha"). This repo's
  artifact detection/rendering has no such single point of silent failure —
  keep it that way rather than introducing an equivalent global kill switch.
- **ChatGPT Canvas's contested execution story.** The two sources in
  `chatgpt-web-desktop.md` §5 can't agree on whether Canvas actually executes
  Python in-browser or is markup-only. Don't chase an ambiguous, possibly
  regressed feature; this repo's sandboxed HTML/React/SVG/Mermaid execution
  via `infrastructure/sandbox/index.html` is already unambiguous and
  documented.
- **Claude's one-way unpublish.** Claude states republishing the exact same
  artifact after unpublishing isn't possible — you have to create anew
  (`research/claude-web-desktop.md` §13). This repo's `unique (user_id,
artifact_id)` constraint (`0095_published_artifacts.sql`) already makes
  republish an upsert that keeps the same URL — a better design than the
  benchmark's, worth keeping as-is rather than "fixing" toward parity.

## Method notes

Verified in code, not from inventory docs alone: read
`packages/platform/artifacts/src/{artifacts,artifact-store,artifact-sync,
artifact-derivation}.ts`, `infrastructure/sandbox/index.html` in full,
`apps/web/lib/artifact-sandbox.ts`, `ArtifactsPanel.tsx` and
`ArtifactPreview.tsx` (to line 1368) in full, `GalleryClient.tsx`,
`publishArtifactClient.ts`, `apps/web/app/api/artifacts/publish/route.ts` and
`[token]/route.ts`, `apps/web/db/neon/0095_published_artifacts.sql`,
`apps/web/app/qa-artifacts/layout.tsx`, `use-artifact-cloud-sync.ts` +
`artifact-cloud-sync.ts`, `apps/web/app/api/chat/sync/route.ts`,
`apps/desktop/src/features/artifacts/publishAdapter.ts` and the surrounding
`ArtifactPanel.tsx` handler, `apps/mobile/src/features/chat/components/
ArtifactFullScreen.tsx` and `SafeArtifactPreview.tsx`,
`managed-office-file-service.ts`, `capability-preamble.ts`, and
`docs/current/gap-audit-2026-08-08.md` GAP-P0-009. Cross-checked
`audit/ui-gaps.csv` for every row mentioning "artifact" or "canvas" (27
matches) — none duplicate the findings above; one (GAP-230, "Shared
artifacts" management row, tracked Open) appears to already be resolved in
current code (`SharedLinksSection.tsx` mounts `PublishedArtifactsSection`
with Copy/Unpublish, reachable from `WebSettingsModal.tsx`'s `shared-links`
tab) — flagging this as a stale tracker row rather than re-filing it.
