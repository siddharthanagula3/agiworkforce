# Domain audit: Projects + Files/Library

Scope: `/chat/projects` (hub + detail), `/chat/library`, project knowledge-file
upload/extraction/retrieval, chat-attachment upload, and the shared
`ProjectGallery` / `LibraryView` components consumed by web and desktop.
Verified against code at commit `e15df56e3`, working tree clean.

**Method note.** Every claim below was verified by opening the cited file,
not inferred from the inventory docs or from naming. Where the web-backend
inventory (`inventory/web-backend.md`) had already independently reached the
same conclusion (the spreadsheet-parser gap), that's noted as corroboration,
not as the source of the finding.

## Summary

Projects and Library are two of the more mature surfaces in this repo. The
core loop — create a project, chat inside it, attach knowledge files, sort,
star, archive, duplicate, export, delete with server persistence — is real,
tested, and free of the "renders but does nothing" failure mode this audit
round is specifically hunting for. Knowledge-file ingestion in particular is
carefully engineered: per-file and per-project byte quotas, a 20-file cap
enforced identically at ingest and at retrieval, checksum-based dedup,
edit-as-new-version semantics with retained history, content moderation
before extraction, and honest degradation (Google Drive/Slack route to
`/connectors` instead of faking an import). The gaps that exist are mostly
about a bounded resource failing to communicate its own boundaries (silent
truncation, a stale "not supported" message for something that now works,
controls that vanish under specific but reachable UI states) rather than
missing plumbing. The one real capability hole — no spreadsheet or Office
document parser — is exactly what the audit brief flagged going in, and it's
confirmed at the code level, not just by inventory prose.

## What's already strong (don't re-litigate these)

| Capability                                                                                              | Evidence                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real server persistence for every Projects CRUD op (create/rename/delete/archive/star/duplicate/export) | `apps/web/app/chat/projects/page.tsx`, `features/projects/services/managed-cloud-projects.ts`, `app/api/projects/*`                                  |
| Knowledge-file versioning, dedup, and quota enforcement                                                 | `app/api/projects/[id]/knowledge-files/route.ts:191-410` — active-count cap, checksum dedup, aggregate storage quota, supersede-on-edit              |
| Content moderation before extraction (hash denylist + structural scan)                                  | `lib/server/project-knowledge-extraction.ts:235-280`                                                                                                 |
| Honest degradation for unbuilt connectors                                                               | `AddSourcesModal.tsx:12-15` — Google Drive/Slack route to `/connectors` rather than a fake import affordance                                         |
| Library soft-delete with 30-day recoverable bin                                                         | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` `handleDelete`/`handleRestore`/`handlePermanentDelete`                             |
| Project-scoped starter templates (name/description/instructions)                                        | `features/projects/data/project-templates.ts` — deliberately not a second CRUD system; documents _why_ (duplicate already covers "save as template") |
| Sibling-chat retrieval is relevance-ranked, not just recency-stuffed                                    | `lib/services/project-context-service.ts:217-262`                                                                                                    |
| Real cross-device project sync                                                                          | `app/api/projects/sync/route.ts`, mirrored on mobile per `inventory/mobile.md` §12                                                                   |

## Gaps

| ID                 | Sev | Type                   | Feature                             | One-line                                                                                   |
| ------------------ | --- | ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| PROJECTS-FILES-001 | P1  | missing-capability     | Spreadsheet/Office document parsing | No xlsx/docx/pptx parser exists, and the file picker doesn't even offer these extensions   |
| PROJECTS-FILES-002 | P2  | reliability-gap        | Knowledge-file context budget       | Older files silently drop out of the prompt once the 48k-char budget fills; no capacity UI |
| PROJECTS-FILES-003 | P2  | ux-gap                 | Projects hub search/create          | Both vanish when sort ≠ "Updated" or when viewing Archived                                 |
| PROJECTS-FILES-004 | P2  | architecture-gap       | Project-creation quick-start        | Two drifted, non-overlapping template pickers depending on entry point                     |
| PROJECTS-FILES-005 | P2  | ux-gap                 | Library "Uploaded" filter copy      | Claims uploads aren't cataloged; the writer code says otherwise                            |
| PROJECTS-FILES-006 | P3  | partial-implementation | Knowledge-file version history      | Backend tracks it fully; zero UI surfaces it                                               |
| PROJECTS-FILES-007 | P1  | parity-gap             | "Reuse file in new chat"            | Mobile shipped it (GAP-020, Done); web/desktop's shared Library never got it               |
| PROJECTS-FILES-008 | P3  | dead-code              | Mobile file-error modals            | Three fully-built, tested modals with zero import sites                                    |

Full JSON: `audit/parity-2026-08-15/gaps/domain-projects-files.json`

---

### PROJECTS-FILES-001 — No spreadsheet or Office document parser (P1)

This is the gap the audit brief pointed at directly, and it holds up.

`extractProjectKnowledgeFile()` (`apps/web/lib/server/project-knowledge-extraction.ts:209-301`)
only produces usable content for three shapes: `application/pdf` (via
`pdfjs-dist`'s text layer), `application/x-ipynb+json` (a hand-written
notebook-cell walker), and anything `isTextAttachmentMeta()` classifies as
plain text (txt/md/csv/json/xml and a handful of source-code extensions).
Everything else — `.xlsx`, `.xls`, `.docx`, `.pptx` — falls through to
`{ extractedText: null }`.

It's worse than "extraction is a no-op" though: the file simply cannot be
selected. `AddSourcesModal.tsx:329` and `SourcesPanel.tsx:521,538` both build
their `<input accept>` from the shared `ALLOWED_ATTACHMENT_ACCEPT`
(`packages/contracts/types/src/chat.ts:222-229`), which is assembled from
image MIME types, `application/pdf`, `text/*`, and
`TEXT_ATTACHMENT_EXTENSIONS` (`chat.ts:191-207`) — no `xlsx`/`docx`/`pptx`
anywhere in that list. Even if a file slipped through some other path (e.g.
drag-and-drop, which doesn't respect `accept`), the server-side
`validateAttachmentMeta()` call in `knowledge-files/route.ts:166-173` would
reject it with `unsupported-type` before extraction ever runs. CSV is the one
partial exception — it's accepted, but only as raw delimited text, with no
sheet/cell awareness.

One more sharp edge from the same root cause: **images** _are_ in the accept
list (they're valid chat attachments), so a user can add a screenshot or
photo as a project "source." It uploads successfully, appears in the file
list — and produces `extractedText: null`, exactly like an unsupported
format would, with no OCR or vision pass and no UI signal that the image
contributes nothing to the model's answers. It silently degrades to
"filename only."

`inventory/web-backend.md:326-370` independently reaches the identical
conclusion from a different read of the same code, which is corroboration,
not the source of this finding.

**Recommendation:** add xlsx (bounded row/column extraction, same spirit as
the existing `MAX_PDF_PAGES` cap) and docx/pptx (paragraph/slide text)
branches to `extractProjectKnowledgeFile()`, extend the allowed-extensions
list so the picker actually offers them, and either wire a vision/OCR pass
for image sources or label them "identified by filename only" in the UI so
the gap is honest rather than silent.

### PROJECTS-FILES-002 — Silent truncation, no capacity indicator (P2)

`project-context-service.ts` is genuinely well-engineered — every cap is a
named constant, the sibling-chat cross-reference is relevance-ranked against
the current query, and duplicate/superseded files are excluded at the SQL
level. But the knowledge-file content injection itself
(`formatProjectSystemPrompt()`, lines 314-341) is pure context-stuffing in
upload-recency order, bounded by `MAX_TOTAL_FILE_CONTENT_CHARS = 48_000`
characters (~12k tokens) shared across up to `MAX_KNOWLEDGE_FILES = 20`
files. The loop (`lines 325-333`) does:

```ts
for (const file of context.knowledgeFiles) {
  const content = file.extractedText?.trim();
  if (!content || remainingChars <= 0) continue;
  ...
}
```

Files are iterated most-recently-added-first (the SQL `order by added_at
desc` at `project-context-service.ts:161`), so once the shared budget is
spent, **older** files drop out first — silently. Their filename still shows
up in the "Project knowledge files:" manifest line, so nothing _looks_
missing; their content is just absent from that turn's reasoning. A project
with five real documents (a few PDFs of any real length will exceed 48k
characters combined) will have some subset of files that never actually
inform any answer, and there is no way for the user to know which ones.

`KnowledgeFilesPanel.tsx:131` and `SourcesPanel.tsx:355` both render only a
bare `{n} files · {n} KB` total — no `X of 20` cap indicator, no
percentage/capacity bar, no per-file "in context" marker.

**Recommendation:** have `loadProjectContext()` return which files were
included vs. excluded by the budget walk (it already computes this — it just
throws the information away), surface it as a lightweight indicator near
Sources, and mark excluded files inline. This is pure bookkeeping on data
already in hand; no new extraction or provider-call work required.

### PROJECTS-FILES-003 — Search and Create vanish outside the default sort (P2)

`apps/web/app/chat/projects/page.tsx:150` defines:

```ts
const useGallery = sortMode === 'updated' && !showArchived;
```

When `useGallery` is true, the page delegates to the shared `<ProjectGallery>`,
which is the _only_ place that owns a search box and an inline "Create
project" form (`packages/ui/unified-chat/src/components/ProjectGallery.tsx:261-274,292-412`).
When it's false — i.e. the user picked "Created (newest)", "Name (A-Z)", or
"Starred first" from the sort menu, **or** toggled to the Archived view — the
page falls back to its own custom `<ProjectCard>` grid, which has no search
input and no create button of any kind.

The empty-state copy for that fallback branch says so outright
(`page.tsx:406-411`):

> Switch to "Updated (newest)" sort to create one.

That's the product telling the user to change an unrelated dropdown before
it will let them create a project. This is exactly the "dead or duplicate
controls" / "unexpected... confusing" failure class `CLAUDE.md` asks to flag
immediately when reproducible — it's a one-line conditional, not a deep
architectural problem, but it's a real, currently-shipping interaction bug.

**Recommendation:** hoist the search box and "New project" trigger out of
`ProjectGallery`'s inline form into the page-level header so they render
unconditionally, and have `ProjectGallery`'s own search only filter its own
default-sort subset.

### PROJECTS-FILES-004 — Two drifted project-creation quick-start UIs (P2)

Two independently-built "help the user start a project" flows exist, reachable
from different entry points, with non-overlapping feature sets:

| Entry point                               | Component                                                                                                                       | What it seeds                     | What it's missing            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------- |
| Sidebar "New project" (`WebChatPage.tsx`) | `CreateProjectDialog.tsx` → `PROJECT_TEMPLATES` (`features/projects/data/project-templates.ts:34-60`, Blank/Research/Writing/…) | name + description + instructions | no emoji/accent-color picker |
| `/chat/projects` hub inline form          | shared `ProjectGallery.tsx:20-25,356-376` → `PROJECT_PRESETS` (Coding/Writing/Research/Learning)                                | emoji + accent color              | no instructions field at all |

A user who creates from the sidebar gets a well-seeded system prompt on a
generic folder icon; a user who creates from the hub page gets a colorful
identity and a blank instructions box. The two category lists even overlap
partially ("Research", "Writing" in both) while diverging elsewhere
("Coding"/"Learning" only in one), so a user who has seen both pickers
doesn't experience them as the same feature done twice — they read as two
different, half-finished features.

**Recommendation:** merge `PROJECT_TEMPLATES` and `PROJECT_PRESETS` into one
shared list carrying emoji + accent color + name + description + instructions
together, consumed by both entry points.

### PROJECTS-FILES-005 — Library "Uploaded" copy contradicts a live pipeline (P2)

`LibraryView.tsx`'s own header comment states:

> Uploads are not cataloged into the Library today (chat uploads stay with
> their conversation).

And its empty-state copy for the Uploaded filter repeats it:

> Uploaded files aren't cataloged in the Library yet — files you upload stay
> with their conversation.

`media-assets.ts:434-436` makes the identical claim in a code comment: _"No
writer emits them yet (every current pipeline is generation)."_

All three statements are contradicted by a real, reachable code path traced
end to end:

1. Composer upload → `chat-attachment-upload.ts` → `createManagedCloudChatAttachmentsClient().upload()`
2. → `POST /api/uploads/chat-attachment/presign`, direct-to-R2 `PUT`, then
   `POST /api/uploads/chat-attachment/complete`
3. → `complete/route.ts:162-179` calls `insertMediaAsset({ ..., metadata: { origin: 'upload', ... } })`

And `/api/library`'s own `listLibraryAssets()` filters exactly on that field
(`media-assets.ts:487-489`), a behavior pinned by its own test
(`library/__tests__/route.test.ts:149-157`).

Git history rules out "the copy predates the feature": the writer
(`insertMediaAsset` with `origin: 'upload'`, commit `a7044ecc9`) sits
hundreds of commits _before_ the most recent touch to `LibraryView.tsx`
(commit `98b490c84`) in the branch's history — the comment was left stale (or
never verified) well after the capability existed. Production has a live R2
media bucket provisioned (`inventory/deployment-state.md:42-46`), so this
isn't a case of the pipeline being unprovisioned either.

**This needs a live check, not just a copy fix.** Either the pipeline works
and the copy is simply wrong — in which case delete the disclaimer and let
the filter show real results — or something else (an RLS policy, an
`organization_id` mismatch, a client-side filter bug) is quietly swallowing
uploaded rows despite the writer looking correct on paper, which would be a
more serious, currently-undiagnosed bug hiding behind reassuring-sounding
"not supported yet" copy.

### PROJECTS-FILES-006 — Knowledge-file version history has no UI (P3)

The backend does real version tracking: re-uploading a file under the same
name with a different checksum is treated as an edit rather than a duplicate
(`knowledge-files/route.ts:290-410`), the prior row is marked
`superseded_at` (retained, not deleted), and each row carries a `version`
counter and `supersedes_id`. None of it reaches the UI —
`KnowledgeFilesPanel.tsx`, `SourcesPanel.tsx`, and `FilePreviewModal.tsx` were
all grepped for `version`/`supersede` and none contain the words. A user who
corrects a file by re-uploading it just sees it silently replace the old
one, with no "v2" badge and no way to see or recover the prior version
through the product, even though the data is sitting there.

**Recommendation:** surface a `v{n}` badge (the API already returns
`version`) and a simple read-only "prior versions" expansion — no restore
action needed for a first slice.

### PROJECTS-FILES-007 — No "reuse this Library file in a new chat" on web/desktop (P1)

The shared `LibraryTransport` interface that both web and desktop's Library
implement (`packages/ui/unified-chat/src/components/library/LibraryView.tsx:120-148`)
exposes `listPage` / `fetchAsset` / `deleteItem` / `permanentlyDeleteItem` /
`restoreItem` / `openPreview` / `startChat` — and nothing that attaches a
Library item to a new (or existing) conversation. The rendered
`GeneratedFileCard` (lines 540-559) only wires `onDownload` / `onPreview` /
`onPreviewError`. The only path from "I generated this file three chats ago"
to "use it now" on web or desktop is: download it to disk, then manually
re-attach it through the composer's file picker — a redundant round trip for
data the server already has.

This isn't a benchmark-only complaint — **this repo already shipped the
correct pattern on a different surface.** `audit/ui-gaps.csv` row `GAP-020`
(status `Done`) documents mobile's `AddToChatSheet.tsx` "Attach from Library"
action, which forwards an existing Cloud asset id into the composer without
re-uploading bytes, backed by `apps/mobile/src/features/library/index.tsx`
and covered by `add-to-chat.test.tsx`. Web and desktop's shared Library
component never got the equivalent.

**Recommendation:** add an `onAttach` (or similar) callback to
`LibraryTransport`, wire it on web to forward the item's existing asset id
into the composer's attachment state the same way mobile's `AddToChatSheet`
already does, and render an "Attach to chat" action on the card when the
callback is present. Desktop inherits it for free since it consumes the same
shared component.

### PROJECTS-FILES-008 — Mobile file-error modals: built, tested, unreachable (P3)

`FileTooLargeModal.tsx`, `ImageTooLargeModal.tsx`, and `FileUnreadableModal.tsx`
(`apps/mobile/src/features/edge-cases/components/`) are fully implemented,
exported from the edge-cases barrel, have locked copy in `copy.ts`, and are
covered by `edge-cases.test.tsx` (renders in isolation, asserts the CTA
fires) — but nothing outside their own directory and test files imports any
of them:

```
$ grep -rln "FileTooLargeModal\|ImageTooLargeModal\|FileUnreadableModal" apps/mobile \
    --include="*.tsx" --include="*.ts" | grep -v "__tests__|edge-cases/components|edge-cases/index"
(no output)
```

The real file-too-large failure path (`attachmentValidation.ts`) surfaces
inline composer error text instead, confirming these are a superseded,
orphaned second implementation rather than work still in flight.
`inventory/mobile.md` §14 independently reaches the same conclusion.

**Recommendation:** wire `FileUnreadableModal` into the actual
unreadable-attachment path (the one case not already covered by inline
composer text today); delete `FileTooLargeModal` and `ImageTooLargeModal`
along with their tests and copy entries, since the inline error already
covers that case and a second, unreachable presentation adds maintenance
cost for zero user benefit.

---

## What NOT to copy from the benchmark

- **Do not add a numeric "% of project capacity used" meter just because
  Claude might have one.** The research pass for this audit round could not
  confirm Claude's exact project-capacity UI mechanic first-party
  (`research/claude-web-desktop.md:92`, marked UNVERIFIED). PROJECTS-FILES-002
  is filed on this repo's own silent-truncation behavior — a real, verified
  defect independent of what any competitor's UI looks like — not on
  cloning a specific competitor widget from secondary sources.
- **Do not build a second, competing "Environments"/setup-script concept for
  web Projects** just because desktop's parity matrix names one
  (`GAP-241`, Codex-style per-project environment config). Web Projects'
  existing Instructions + Knowledge Files model already covers the "give the
  assistant durable per-project context" job; a setup-script/worktree concept
  belongs with a coding-session product (desktop/Codex-class), not bolted
  onto the chat-project surface where the audit found none of that
  infrastructure exists.
- **Do not fake a Google Drive / Slack knowledge-source import to match
  ChatGPT/Claude's connector-backed sources.** `AddSourcesModal.tsx`'s
  current behavior — route to `/connectors` and say plainly that Drive/Slack
  need a connector — is the correct choice given `/connectors` itself is
  honestly labeled "not yet available on web" for most providers today. A
  fake "Connect" button that 501s would be strictly worse than the current
  honest deferral.
