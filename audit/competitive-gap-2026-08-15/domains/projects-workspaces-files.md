# Projects, Workspaces, Notebooks & File Knowledge — Competitive Gap Audit

**Date: 2026-08-15**

Benchmarked against 20 live-observed claims from ChatGPT, Claude and Gemini
(Manus had no claims filed in this domain). Cross-referenced against the
same-day prior audit at `audit/parity-2026-08-15/gaps/domain-projects-files.json`
and `domain-memory.json`.

## Method note

I traced every claim through actual source files rather than trusting
component names. The most load-bearing single file in this domain is
`apps/web/app/chat/projects/[id]/page.tsx` (the project workspace itself) plus
`apps/web/features/projects/components/ProjectSettingsDialog.tsx` (the
settings modal reached from it) — together these define what a "project" in
this product actually bundles. I also read the DELETE/PUT route handlers in
`apps/web/app/api/projects/[id]/route.ts` and
`apps/web/app/api/chat/conversations/[id]/route.ts` directly rather than
inferring behavior from UI copy, since two of the benchmark claims
(projects-11, projects-20) are specifically about whether backend behavior
matches what the UI promises.

---

## Claim-by-claim findings

### projects-01 — Persistent named workspace bundling chats + files + instructions (ALL_PRODUCTS, tableStakes)

**PRESENT.** `/chat/projects/[id]` is a single named container with a
`Chats`/`Sources` tab bar (`page.tsx:587-611`), a persistent knowledge-file
store reachable from the `Sources` tab (`SourcesPanel.tsx`), and an
`Instructions` field one settings click away (`ProjectSettingsDialog.tsx:209-227`).
All three are the same object (`project.id`), not scattered features. This
satisfies the claim; see projects-05 for the one real UX difference from the
benchmark (front-loaded vs. deferred).

### projects-02 — Workspace-level memory scoping/isolation control (ALL_PRODUCTS, tableStakes)

**MISSING.** `ProjectSettingsDialog.tsx:229-251` renders a "Memory" section
that is a static, un-interactive sentence: _"This project can access memories
from outside chats, and vice versa."_ The code comment directly above it
documents that a scope `<select>` used to exist here and was deliberately
removed because it was decorative (one option, no `onChange`, no
persistence) — the team correctly chose honest static copy over a dead
control, but the underlying capability was never built. Confirmed at the data
layer: `apps/web/db/neon/0010_memory.sql` has no project column on
`user_memories`, and `managed-memory-context-service.ts` (per prior audit,
independently re-confirmed here) selects memory purely by `user_id`. See
"Cross-reference" below — this is the same root cause the prior audit already
filed as `MEMORY-004`.

### projects-03 — Cross-workspace memory isolation holds under live test (MAJORITY: ChatGPT, Claude)

**N/A / MISSING precondition.** This claim tests whether isolation _works_.
Since projects-02 confirms no isolation mechanism exists at all in this
product (memory is unconditionally account-wide in both directions by
design), there is nothing to live-test — a "write inside an isolated project,
query from outside" experiment cannot even be set up. This is the downstream
consequence of projects-02, not a separate defect; I have not filed it as its
own structured gap to avoid double-counting.

### projects-04 — Binary memory-mode choice at project-creation time (SINGLE_PRODUCT: ChatGPT)

**MISSING.** Grepped `CreateProjectDialog.tsx` and `ProjectGallery.tsx` (the
two project-creation entry points — see `PROJECTS-FILES-004` in the prior
audit for why there are two) for "memory"/"Memory" — zero matches in either.
Folded into the projects-02 gap below rather than filed separately, since the
fix is the same underlying capability.

### projects-05 — Persistent 4-capability rail (Instructions/Memory/Context/Scheduled) visible immediately (SINGLE_PRODUCT: Claude)

**PARTIAL / architecturally different.** We do not have Claude's single
always-visible rail. Instead: Instructions and the memory-disclaimer sentence
live inside `ProjectSettingsDialog` (reached via a "..." menu → "Project
settings", `page.tsx:409-442`), Sources/Context has its own dedicated tab
(`page.tsx:587-611`), and — critically — there is no Scheduled card or
project-scoped task concept anywhere in the product (see projects-10). So even
setting aside the "single view vs. dialog" difference, we are missing one of
the four capabilities entirely, not just displaying it less prominently.

### projects-06 — Project-scoped custom instructions distinct from account-level (ALL_PRODUCTS, tableStakes)

**PRESENT.** Confirmed both layers exist independently: account-level
instructions live in Settings → General (`GeneralSection.test.tsx:130`,
`"Instructions for AGI"` field), and project-level instructions are a
separate field (`ProjectSettingsDialog.tsx:209-227`) that
`project-context-service.ts:305-309` injects into the system prompt as its
own labeled block ("Project instructions (set by the user; follow them for
every reply in this project)"), verified by reading the service source
directly rather than assuming from the component name.

### projects-07 — Project-scoped file/source area auto-referenced by every chat in the workspace (ALL_PRODUCTS, tableStakes)

**PRESENT.** `project-context-service.ts` (`loadProjectContext`) reads up to
`MAX_KNOWLEDGE_FILES=20` files and `formatProjectSystemPrompt()` injects their
extracted text into the system prompt on every turn for any conversation
whose `project_id` matches — a new chat started inside the project gets this
automatically, with no per-chat re-attachment. (The prior audit's
`PROJECTS-FILES-002` documents a real, separate silent-truncation issue in
the same budget-management code, worth a look but not a projects-07 defect.)

### projects-08 — Connector-backed (non-file) sources bindable to a project (SINGLE_PRODUCT: ChatGPT, STRONGLY_INFERRED)

**MISSING, but honestly disclosed.** `AddSourcesModal.tsx` shows the same
Upload / Google Drive / Slack icon row ChatGPT's empty state implies, but its
own code comment states plainly: _"We do NOT have a Drive import pipeline;
this is an explicit 'Connect in Settings' affordance."_ Clicking either
button routes to the fully generic, account-level `/connectors` page
(`handleConnectorRoute` → `router.push('/connectors')`), which has zero
project-scoping code anywhere (grepped `apps/web/app/connectors` and
`apps/web/features/connectors` for "project" — no hits outside unrelated
words like "projection"). So a user cannot actually bind a live Drive folder
or Slack channel to a specific project as an ongoing source; the icons are
signposting toward a future capability, not a working one. Since even the
benchmark evidence for this claim is itself only "strongly inferred" (not
exercised end-to-end for ChatGPT either), I am not inflating this beyond P3.

### projects-09 — Explicit numeric source-count ceiling advertised (SINGLE_PRODUCT: Gemini)

**Partially present, reactive not proactive.** `MAX_KNOWLEDGE_FILES=20` is a
real, enforced server-side ceiling
(`knowledge-files/route.ts:217-219`: _"This project already has the maximum
of 20 knowledge files. Remove a file before adding another."_) — so unlike
Gemini's proactive "Upload up to 300 sources" headline, we only tell the user
the number when they hit it. This is a minor, low-value gap and overlaps
`PROJECTS-FILES-002` from the prior audit (which is about the separate issue
of the smaller _content_ budget silently dropping files below the 20-file
cap). Not filed as its own structured gap.

### projects-10 — Scheduled/recurring tasks scoped directly to a project (MAJORITY: ChatGPT, Claude)

**MISSING.** Grepped the entire schedules feature — types
(`apps/web/features/schedules/types/index.ts`), the create/list route
(`apps/web/app/api/schedules/route.ts`), and the creation form
(`ScheduleForm.tsx`) — for `projectId`/`project_id`: zero matches anywhere.
The project detail page has exactly two tabs, `Chats` and `Sources`
(`page.tsx:587-611`); there is no third `Scheduled` tab and no project
selector inside the schedule-creation flow. This is a genuine, clean gap
against the majority of the benchmark.

### projects-11 — Deletion confirmation names every destroyed object type + escape hatch (SINGLE_PRODUCT: ChatGPT)

**Different by design, and better in one respect, worse in another.**
Verified in `apps/web/app/api/projects/[id]/route.ts:283-337`: project
deletion is a **soft delete** (`deleted_at` tombstone) and, critically,
**conversations are not destroyed** — the handler runs
`update web_conversations set project_id = null ... where project_id = $1`,
moving every chat out to "All Chats" rather than deleting it. The confirm
dialog copy matches this truthfully: _"Conversations in this project will be
moved to 'All Chats'."_ This is arguably safer than ChatGPT's
delete-everything-by-default pattern (no escape hatch is needed if nothing is
destroyed by default). However: the dialog says nothing about **knowledge
files**. `project_knowledge_files.project_id` has `on delete cascade`
(`0006_projects.sql:18`), but because the project row is soft-deleted (not
actually `DELETE`d), that cascade never fires — the files remain in Postgres
and R2 indefinitely, orphaned, with no project-restore endpoint anywhere in
`apps/web/app/api/projects` to get them back. A user reading "conversations
will be moved" has no way to know their uploaded files are neither deleted
nor recoverable. Filed below as a gap distinct from — and more concrete than
— the benchmark claim itself.

### projects-12 — Single Project object shared across Chat and agentic modes (SINGLE_PRODUCT: ChatGPT)

**PRESENT.** Confirmed via `ChatComposerNew.tsx`: the same project entity
backs both plain chat and "AGI Work" (this product's agentic mode, explicitly
labeled in code as _"claude.ai Chat/Cowork parity"_ at line 110). A
conversation's `project_id` and its `workMode` ('chat' | 'agiwork') are
independent fields — starting an AGI Work task from inside a project does not
require or create a second, parallel project system.

### projects-13 — Project composer retains the same conversational-vs-agentic toggle as the global composer (SINGLE_PRODUCT: Claude)

**Mostly present, with one real carve-out.** The segmented "Chat | AGI Work"
toggle (`ChatComposerNew.tsx:2902-2925`) only renders when a `projectPicker`
prop is supplied. `WebChatPage.tsx` passes `projectPicker={composerProjectPicker}`
to its live chat composer (lines 4251, 4332), so once a user is inside an
actual conversation belonging to a project, the toggle is there — this is the
claim's core case and it holds. The one carve-out: the project's own landing
composer (`page.tsx:542-547`, `"New chat in {project.name}"`) does **not**
pass `projectPicker`, so the toggle is invisible there, and its send handler
(`handleProjectSend`, `page.tsx:129-164`) unconditionally hard-codes
`workMode: 'agiwork'` regardless of what the (invisible) toggle would have
said — a user cannot start a plain chat from a project's own landing
composer, only from inside an already-open project conversation. Minor;
not filed as a separate structured gap.

### projects-14 — Visible "checking memory" reasoning step before answering about cross-chat recall (SINGLE_PRODUCT: Claude)

**MISSING, as a direct consequence of a larger existing gap.** The prior
audit's `MEMORY-002` already established that Web's live send path
(`request-processor.ts`) never searches or retrieves past-conversation
content at all — only a curated, manually-saved `MemoryFact` list is
injected. Since there is no cross-chat retrieval step in production, there is
nothing for the UI to narrate before answering. Not filed as a new gap;
folded into the existing `MEMORY-002` finding.

### projects-15 — Single dedicated nav destination aggregating all generated outputs (SINGLE_PRODUCT: Gemini, STRONGLY_INFERRED)

**PRESENT — genuine strength.** `Library` is a persistent, always-visible
top-level sidebar entry (`WebChatPage.tsx:3787-3796`, comment: _"browse
generated files without scrolling back to their origin message"_), reachable
regardless of item count (unlike the adjacent `Projects` nav item, whose
sidebar _section_ only appears once a project exists — Library's top-level
nav link has no such gate). `LibraryView.tsx` filters by `kind`
(all/image/video/file) and `origin` (all/uploaded/generated) across
`media_assets`, which is populated from every conversation, not scoped to
one. This functionally matches — and in the "always reachable regardless of
content" respect slightly exceeds — the benchmark claim.

### projects-16 — Video vs. image thumbnails visually distinguished via icon overlay (SINGLE_PRODUCT: Gemini)

**MISSING.** Read `GeneratedFileCard.tsx:159-175` in full: when a
`previewUri` exists, both image and video assets render as a plain `<img>`
with no overlay; the only differentiator is a small text label
(`presentation.kindLabel`, e.g. "Video") below the thumbnail, not an icon on
the thumbnail itself. A user scanning the grid at a glance cannot tell video
from image tiles the way Gemini's camera/film-strip overlay allows.

### projects-17 — First-party disclosure that project sources are excluded from training, independent of retention setting (SINGLE_PRODUCT: Gemini)

**Different framing, arguably stronger, but not surfaced at the point of
action.** `PrivacySection.tsx:370-372` makes a blanket, unconditional claim —
_"we do not train AGI-owned models on your prompts, responses or files...
There is no training opt-in, because that data path does not exist"_ — which
is a stronger guarantee than Gemini's conditional one (Gemini's disclosure is
scoped to notebook sources specifically and is tied to the Keep Activity
setting; ours applies to everything, unconditionally). The gap is narrower
than the benchmark claim suggests: our disclosure lives only in Settings →
Privacy, not inline at the point of adding a project source the way Gemini's
Notebooks intro screen shows it. Given the underlying guarantee is actually
stronger, I have not filed this as a structured gap — it reads as a copy/UX
placement nit, not a capability gap.

### projects-18 — Memory card shows an inline visibility/privacy badge (SINGLE_PRODUCT: Claude)

**MISSING**, same root cause as projects-02: there is no memory _card_ at
all, just the static disclaimer sentence in `ProjectSettingsDialog.tsx:244-251`
with no lock icon or "Only you"-style badge. Folded into the projects-02 gap.

### projects-19 — Pre-built example/tutorial project shipped on accounts (SINGLE_PRODUCT: Claude)

**MISSING.** Grepped for "Example project", "How to use", and any
onboarding/seed-project pattern across `apps/web/features/projects` and
`apps/web/db/neon` — no hits. Fresh accounts start with zero projects.
Single-product, non-table-stakes; low-value polish item.

### projects-20 — Existing standalone chat can be moved into a project after the fact (SINGLE_PRODUCT: ChatGPT, UNVERIFIED by the benchmark's own research)

**PRESENT and fully wired — verified end-to-end, exceeding the benchmark's own confidence.**
The benchmark explicitly flags this as `UNVERIFIED` even for ChatGPT (the
researchers saw the menu item but never exercised it). I traced our
equivalent all the way through:
`ConversationTitleMenu.tsx` "Move to project" submenu →
`handleMoveToProjectSession` (`WebChatPage.tsx:2979-2983`) →
`updateConversation(id, { projectId })` (`useConversations.ts:464-519`,
a real `PUT` to `managedCloudConversationPath(id)`) →
`apps/web/app/api/chat/conversations/[id]/route.ts:135-199`, which
persists `project_id` on the `web_conversations` row and returns the updated
record, which the client then uses to update both the chat store and
`useChatProjectStore.reassignConversation`. This is a genuine strength: a
capability the benchmark's own researchers could not confirm works in
ChatGPT, and ours demonstrably does, end to end.

---

## Cross-reference with the prior audit

- **CONFIRMS_PRIOR / SUPERSEDES_PRIOR**: `MEMORY-004` (prior audit, filed
  P2, "Project-scoped memory... architecture-gap") is the same defect as
  projects-02/03/04/18 here. This pass adds new information the prior audit
  did not have: **all three** benchmarked products (ChatGPT, Claude, Gemini)
  independently converge on workspace-level memory scoping as
  `tableStakes: true`, not just ChatGPT/Claude as the prior audit's
  `benchmarkRef` cited. I am filing this as `SUPERSEDES_PRIOR` and raising
  the severity from the prior audit's P2 to **P1** on that basis — this is
  no longer "a nice differentiator two competitors have," it is now
  confirmed table-stakes across the full observed set.
- **CONFIRMS_PRIOR**: `PROJECTS-FILES-002` (silent truncation, no capacity
  indicator) is corroborated by this pass's projects-09/-07 findings —
  same root cause (`MAX_KNOWLEDGE_FILES` / `MAX_TOTAL_FILE_CONTENT_CHARS` in
  `project-context-service.ts`), not re-filed here.
- **CONFIRMS_PRIOR**: `MEMORY-002` (no cross-chat retrieval in the live send
  path) is the reason projects-14 is unimplementable today; not re-filed.
- **No CONTRADICTS_PRIOR found in this domain.** I looked specifically for
  cases where the prior audit filed a gap this live research disproves, or
  claimed competitor behavior this research contradicts. I did not find one.
  The closest candidate — `PROJECTS-FILES-004`'s note that Duplicate/Export
  "shipped without a caller" — turned out to be **stale, not contradicted**:
  reading the current `ProjectSettingsDialog.tsx:283-309`, both buttons are
  now wired to real handlers (`handleDuplicate` calling
  `POST /api/projects/[id]/duplicate`, and a genuine `<a href>` download for
  export) with an explicit code comment referencing the exact prior-audit
  pattern by name. This looks like the team already fixed it since that
  audit ran earlier today — worth noting as evidence the team is actively
  closing these, not a live gap.

---

## Strengths (we are at or ahead of the benchmark)

1. **`Move to project` is real, not just a menu item** (projects-20) — see
   above. The benchmark's own researchers could not verify ChatGPT's
   equivalent; ours is traced end-to-end through a real PUT route.
2. **Project deletion preserves conversations by default** —
   `apps/web/app/api/projects/[id]/route.ts:316-322` moves chats to
   `project_id = null` instead of destroying them, which is safer than
   ChatGPT's delete-everything pattern (see `notWorthCopying` below).
3. **A persistent, always-reachable Library nav destination** exists
   (`WebChatPage.tsx:3787-3796`) that aggregates generated files across every
   conversation by kind and origin, matching (and in reachability slightly
   exceeding) Gemini's Library claim (projects-15).
4. **A single Project object genuinely spans both chat and agentic modes**
   (projects-12) via the shared `workMode` field on conversations, with the
   exact same composer toggle used globally re-used inside project
   conversations (projects-13, mostly).
5. **The training-data disclosure is unconditional and blanket**, not scoped
   or conditional on a retention toggle the way Gemini's is (projects-17) —
   a stronger privacy guarantee, just not surfaced at the point of adding a
   source.

## Not worth copying

- **ChatGPT's destroy-everything-by-default project deletion.** Our
  move-conversations-out-instead-of-deleting-them default is a better user
  outcome; adopting ChatGPT's pattern (destroy chats/tasks/files unless the
  user manually moves them out first) would be a regression, not parity.
- **Advertising a large numeric source ceiling as a headline feature**
  (Gemini's "Upload up to 300 sources") without first fixing the _effective_
  content budget behind it. Our own `MAX_TOTAL_FILE_CONTENT_CHARS=48,000`
  chars (~12k tokens combined across all files, per the prior audit's
  `PROJECTS-FILES-002`) means a proudly-advertised "up to 20 files" would be
  misleading in the same way — most of those files would be silently
  truncated out of context before the model ever sees them. Fix the budget
  disclosure first; the number is not the product.
- **A decorative privacy badge with no functional control behind it**
  (Claude's inline "Only you" lock badge on its memory card, projects-18).
  If/when we build project memory scoping, the badge should reflect a real,
  persisted, enforced setting — not ship as trust-signaling chrome ahead of
  the mechanism, which is close to what the _removed_ dead `<select>` in our
  own `ProjectSettingsDialog.tsx` used to be before the team correctly tore
  it out.

## Gaps not filed as structured entries (reasoning documented above)

- projects-03 (downstream of projects-02)
- projects-04, projects-18 (folded into the projects-02 memory-scoping gap)
- projects-09 (low-value, overlaps `PROJECTS-FILES-002`)
- projects-13 (mostly present; one narrow carve-out on the project landing
  composer only)
- projects-14 (downstream of `MEMORY-002`)
- projects-17 (copy/placement nit; underlying guarantee is actually stronger
  than the benchmark)
