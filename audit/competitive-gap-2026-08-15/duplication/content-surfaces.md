# Duplication audit — Library / Artifacts / Gallery ("my generated stuff")

Date: 2026-08-15
Repo: `/Users/siddhartha/Desktop/agiworkforce` (branch `compliance/dpdp`)
Scope: every web surface that shows "things the user made" — `apps/web/app/gallery`,
`apps/web/app/chat/artifacts`, `apps/web/app/chat/library`, `apps/web/app/features/artifacts`,
`apps/web/app/shared-artifact/[token]`, `apps/web/app/qa-artifacts`, and the in-chat Artifacts
side panel.

## TL;DR

The founder's instinct is partially right and partially wrong, and the two halves matter
differently:

- **`/gallery` + `/chat/artifacts` are NOT duplicated code.** They mount the literal same
  `GalleryClient` component (one import, not a copy), verified by a test that asserts it. This
  is the deliberate "public SEO page / in-shell page share one component" pattern the task
  description described, and the claim holds under inspection.
- **Library and Artifacts ARE two disconnected products wearing one vocabulary.** Both are real,
  both are live, both sit as sibling entries in the same primary nav rail, and the code
  explicitly says this is deliberate ("Claude parity" for Artifacts, "ChatGPT-Library parity"
  for Library). But they are backed by three unrelated data stores with no bridge between them:
  a browser-localStorage artifact store (`agi-artifacts-store`) for chat-derived artifacts, a
  `web_artifacts` cloud-sync table that only pulls Desktop-authored artifacts one-way, and a
  server-durable `media_assets` table for tool-generated files. An artifact born from an
  assistant's fenced code block **never** reaches Library. A file born from a code-execution
  tool **never** reaches the Artifacts gallery, even though the backend already classifies some
  of those files as `surface: 'artifact'` — the exact taxonomy that would let it. The Artifacts
  gallery's own nav comment calls it "account-scoped"; the store it reads is not, for the
  majority of its content. That mismatch, not the nav rail's two-icon layout, is the real
  finding.

## Inventory: what each surface actually renders and reads

| #   | Route                                                              | Renders                                                                                             | Data source                                                                            | Auth                                                                                 | Linked from                                                     |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1   | `/gallery`                                                         | `GalleryClient` (marketing chrome: `Header` + `MarketingFooter`)                                    | `useArtifactsStore` (client-side, see below)                                           | Public, unauthenticated                                                              | `sitemap.ts` (priority 0.7), organic/SEO                        |
| 2   | `/chat/artifacts`                                                  | **Same** `GalleryClient` (`chrome="app"`), inside `WebAppShell`                                     | Same `useArtifactsStore`                                                               | Protected (`proxy.ts` + `chat/layout.tsx`)                                           | Primary nav rail, `app-nav-items.ts` id `artifacts`             |
| 3   | `/chat/library`                                                    | `LibraryView` (`@agiworkforce/unified-chat`, shared with Desktop)                                   | `/api/library` → `media_assets` (Postgres, R2-backed bytes)                            | Protected                                                                            | Primary nav rail, id `library`; also `GlobalSearchDialog`       |
| 4   | `/features/artifacts`                                              | Static marketing prose (six artifact types, lifecycle, CTA) — no data, no list                      | none                                                                                   | Public                                                                               | `MarketingFooter`, `MarketingLanding`                           |
| 5   | `/shared-artifact/[token]`                                         | `PublishedArtifactView` — single published artifact, public read-only                               | `/api/artifacts/publish/[token]` → `published_artifacts` table                         | Public (token-gated)                                                                 | Only reachable via a minted share link; not linked from any nav |
| 6   | `/qa-artifacts`                                                    | Dev-only harness seeding a fabricated chat message to exercise `ChatMessageList` + `ArtifactsPanel` | Hardcoded fixture data, no real store                                                  | `layout.tsx` calls `notFound()` in production; gitignored; disallowed in `robots.ts` | Not linked anywhere; typed-URL only, and 404s in prod           |
| 7   | In-chat `ArtifactsPanel` (`features/chat/components/artifacts/`)   | Docked right-side panel scoped to the **active conversation**                                       | Same `useArtifactsStore`, filtered by `getConversationArtifacts(activeConversationId)` | Protected (inside `/chat`)                                                           | Mounted directly in `WebChatPage.tsx:4497`, always present      |
| 8   | Settings → "Published artifacts" (`PublishedArtifactsSection.tsx`) | Revoke-list for public share links                                                                  | `/api/artifacts/publish` (GET) → `published_artifacts`                                 | Protected                                                                            | Settings → Shared links                                         |

## The three backing stores, precisely

This is the load-bearing part of the audit — the surfaces above are thin, the stores underneath
are what actually diverge.

### Store A — `agi-artifacts-store` (localStorage, browser-scoped)

`apps/web/features/chat/stores/artifacts-store.ts` wraps a shared vanilla engine
(`createArtifactStore` from `@agiworkforce/artifacts`) with `zustand/persist`, serialized to
`localStorage` under key `agi-artifacts-store` (v3), capped at 200 artifacts
(`MAX_RETAINED_ARTIFACTS`). Artifacts are added by `MessageBubble.tsx` deriving them from
**fenced code blocks in an assistant reply** (`extractArtifacts` / `deriveArtifactsFromMessage`
in `@agiworkforce/artifacts`) — html/react/svg/mermaid/code/document kinds. This is the store
`GalleryClient`'s "Your artifacts" tab reads (`useArtifactsStore((s) => s.artifacts)`,
`apps/web/app/gallery/GalleryClient.tsx:1012`) and the store the in-chat `ArtifactsPanel` reads.

**Nothing in `addArtifact`/`upsertArtifact` calls a server API.** Grep across `artifacts-store.ts`
confirms zero `fetch`/network calls in the write path — every mutation is local. Persistence is
literally `localStorage.setItem`, with a quota-aware degrade-and-warn fallback
(`quotaAwareArtifactStorage`, lines 335–362) for when the payload won't fit.

### Store B — `web_artifacts` (Postgres, but pull-only on web)

`apps/web/features/chat/hooks/use-artifact-cloud-sync.ts` + `.../services/artifact-cloud-sync.ts`
poll `GET /api/chat/sync?since=<cursor>` every 30s and merge any `artifacts` deltas into an
**in-memory-only** overlay (`_cloudArtifacts` in `artifacts-store.ts`, reset to empty on every
mount — "starts from cursor zero for each authenticated mount"). The route's own SQL
(`app/api/chat/sync/route.ts:474-520`) reads/writes a `web_artifacts` table. Grepping the whole
monorepo for `web_artifacts` / `api/chat/sync` shows Desktop
(`apps/desktop/src/runtime/cloudMessageMetadata.ts`) and Mobile
(`apps/mobile/services/cloudSyncEngine.ts`, `apps/mobile/src/features/artifacts/store.ts`) are the
only clients that **push** artifact rows into this table (via `packages/client/sync`). Web's own
comment says why: _"Web conversations/messages already use their account-backed CRUD APIs; this
caller exists specifically so first-class Desktop Cloud artifacts are no longer stranded in
`web_artifacts`."_ Web reads what Desktop wrote. **Web never writes its own chat-derived
artifacts back to this table.** The sync is one-way (Desktop → Web), and the merge on Web is
memory-only, not persisted.

### Store C — `media_assets` (Postgres + R2 bytes, durable, per-user)

`apps/web/lib/server/generated-file-persist.ts` is "the shared persistence core for the
generated-file byte pipeline" — every source of **model tool-execution bytes** feeds it: E2B
sandbox files, E2B `runCode` rich results (matplotlib PNGs), OpenAI Code Interpreter container
files, Anthropic code-execution Files API outputs. It calls `classifyGeneratedFile(fileName,
mime)` (lines 156-180), which **already** buckets html/svg/markdown/mermaid/json/code source text
into `surface: 'artifact'` and everything else into `surface: 'file'` — literally the taxonomy
split the founder is asking about, already modeled in the schema. Rows land in `media_assets`,
served via `/api/library` (`apps/web/app/api/library/route.ts`), which supports real pagination
(`limit`+1 probe), filters (`kind`, `surface`, `origin`, `q`), and soft-delete/restore. This is
what `/chat/library` renders via the shared `LibraryView`
(`packages/ui/unified-chat/src/components/library/LibraryView.tsx`).

**Crucially, `surface: 'artifact'` rows in Library are NOT rendered through the rich
`ArtifactPreview` component** (the live sandboxed iframe, tabs, version history, "Iterate in
chat" affordance that both `/chat/artifacts` and the in-chat panel use). `LibraryView` renders
every row — file or artifact-surface alike — through the plain `GeneratedFileCard`: a
download/open-in-new-tab card. So even where the backend's own classification says "this is
artifact-shaped content," the Library UI degrades it to a static file link.

### Consequence: the same user intent lands in different, non-overlapping galleries

| User action                                                                                  | Where the bytes end up                                         | Where the user can find it                                                                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Asks the model to "build an HTML page" and it answers with a fenced ` ```html ` block        | Nowhere server-side — Store A only (localStorage)              | `/chat/artifacts`, in-chat panel. **Not** in `/chat/library`. Gone if localStorage is cleared, or on a different browser/device. |
| A code-execution tool call writes `report.html` to the sandbox and the harvester picks it up | Store C (`media_assets`, `surface: 'artifact'`)                | `/chat/library` only, as a plain download card. **Not** in `/chat/artifacts`, no live preview, no versions.                      |
| Same artifact is authored on Desktop                                                         | Store B (`web_artifacts`), pulled into Web's in-memory overlay | `/chat/artifacts` (session-scoped merge only — not persisted locally on web either)                                              |

Nothing reconciles these. There is no code path anywhere that writes a Store-A artifact into
`media_assets`, nor one that surfaces a Store-C `surface: 'artifact'` row through `ArtifactPreview`.

## Verified: `/gallery` + `/chat/artifacts` really do share one component

`apps/web/app/chat/artifacts/page.tsx:4` imports `GalleryClient` from
`@/app/gallery/GalleryClient` — the identical file `/gallery/page.tsx` imports. There is no
second copy anywhere (`find … -iname '*GalleryClient*'` returns exactly one file). The route's
own test (`apps/web/app/chat/artifacts/page.test.tsx:10-16, 26-31`) mocks that import and asserts
`gallery-client` renders with `data-chrome="app"`, explicitly commented _"Not a forked copy of
the gallery — the same component the public /gallery route renders."_ `metadata.robots` is
`{ index: false, follow: false }` with `alternates.canonical: '/gallery'`, so search engines are
told the in-shell copy is not the canonical URL. The nav rail (`app-nav-items.ts:100-119`) sends
authenticated users to `/chat/artifacts`, not `/gallery`, specifically so the primary rail keeps
them inside `WebAppShell` instead of dropping them into marketing chrome — also covered by a
dedicated test (`page.test.tsx:40-63`). **Claim confirmed: DELIBERATE, one component, two
mounts, correctly SEO-fenced.**

## Nav-rail duplication that was already fixed (context, not a new finding)

While tracing reachability I found `WebAppShell.tsx` and `WebChatPage.tsx` both used to
hand-maintain their own nav-item arrays (comment in `app-nav-items.ts:4-15`: _"the rail used to
be two hand-maintained arrays… They drifted. Verified live before this was extracted: `/chat`
rendered 6 entries and `/chat/library` rendered 7, so `Tasks` existed but was unreachable."_).
That drift has already been collapsed into one shared `buildAppNavItems()` that both shells call
(`WebAppShell.tsx:47,256-268`, `WebChatPage.tsx`) — confirmed current on disk, one source of nav
truth, `Artifacts` and `Library` both present as sibling rail entries. Noted for completeness;
not a live issue.

## `/features/artifacts`, `/shared-artifact/[token]`, `/qa-artifacts`, Settings → Published — not duplicates

- **`/features/artifacts`** is static marketing prose (six artifact types, a lifecycle ledger, a
  capability grid) with no data fetch and no list of anything — it _sells_ the capability the way
  a landing page sells a feature, the way `/gallery` _is_ the capability. Linked from
  `MarketingFooter.tsx:41` and `MarketingLanding.tsx:226`. Different job, not a gallery.
- **`/shared-artifact/[token]`** is a single-item, token-gated, public read view for one
  artifact a user explicitly published (`POST /api/artifacts/publish` → `published_artifacts`,
  a fourth, distinct table). It is not reachable by browsing — only by holding a minted link. Not
  a "my stuff" surface; it is the read side of a one-to-one share, structurally like a Google Docs
  "anyone with the link" page.
- **`/qa-artifacts`** is a dev-only manual-QA harness that seeds a fabricated assistant message
  (hand-written reasoning, tool timeline, search results) to exercise `ChatMessageList` +
  `ArtifactsPanel` without a live LLM call. `layout.tsx` (`apps/web/app/qa-artifacts/layout.tsx`)
  calls `notFound()` under `NODE_ENV=production`, the directory is gitignored (`.gitignore:246`,
  per its own header comment), and it's in `robots.ts`'s `DISALLOW_APP`. Unreachable by any real
  user; zero risk of confusion in production. Its own header comment says "Delete after QA" —
  worth a housekeeping pass, but it's inert, not a duplicated user-facing surface.
- **Settings → "Published artifacts"** (`PublishedArtifactsSection.tsx`) is explicitly modeled
  on `SharedLinksSection` — a revoke-list answering "what of mine is public right now," not a
  content browser. It reads the same `published_artifacts` table as `/shared-artifact/[token]`,
  which is correct and the only place that data needs to appear.

## The actual answer to "does Library overlap Artifacts, and should they be one surface?"

**Product-level answer:** having both is a defensible, deliberate choice, and the code says so in
plain English (`app-nav-items.ts:101-112`: _"Claude parity: artifacts are first-class,
independently addressable objects… not one row inside a generic Library"_ directly beside the
Library entry's _"ChatGPT-Library / mobile-LibraryScreen parity of concept"_). Claude's dedicated
Artifacts gallery and ChatGPT's unified Library are both real, successful patterns, and nothing
about running both is inherently wrong.

**Implementation-level answer: they are not actually the two clean patterns they're modeled on,
because they don't share provenance.** ChatGPT's Library shows a generated app as just another
entry because everything the model produces funnels through one storage path. Claude's Artifacts
gallery is durable and account-scoped because Claude persists artifacts server-side. This repo's
Artifacts gallery is **neither** — it is browser-local for the majority of its content (chat-fence
derived), with a bolt-on, one-way, session-scoped overlay for Desktop-authored items. Its own nav
comment claims "account-scoped," which the store it reads (`agi-artifacts-store.ts`) does not
support for web-originated content. That is the kind of mislabeled-capability bug CLAUDE.md
calls out explicitly ("stale provider/model labels, fake availability badges").

**What I would collapse / fix, in order of leverage:**

1. **Fix the false claim first, cheaply.** Either stop calling the Artifacts gallery
   "account-scoped" in the surrounding code/comments and product copy, or make it true by having
   web push its own chat-derived artifacts through the same `web_artifacts` sync path Desktop and
   Mobile already use (the POST side of `/api/chat/sync` already accepts an `artifacts` array —
   only the web client-side push is missing). This is the highest-leverage fix: it doesn't
   require picking a winner between Library and Artifacts, it just makes the existing promise true.
2. **Use the classification that already exists.** `classifyGeneratedFile`'s `surface: 'artifact'`
   rows in Library are exactly the content type the Artifacts gallery renders richly. Route
   `surface: 'artifact'` Library items through `ArtifactPreview` instead of the plain
   `GeneratedFileCard`, and/or backfill a link from a Library artifact-surface row into
   `/chat/artifacts`'s drawer. This closes the "tool-generated HTML never gets the good viewer"
   gap without merging the two galleries.
3. **Do not literally merge Library and Artifacts into one screen.** They still answer different
   questions today — "everything I've generated, with search/pagination/delete" (Library) vs.
   "the live, editable, versioned things I'm iterating on right now" (Artifacts) — and merging
   would just reproduce ChatGPT's pattern without the unified storage that makes ChatGPT's
   pattern work. The fix is data-layer unification (steps 1–2), not surface collapse.

## Duplication verdicts (see structured object for the machine-readable form)

- `/gallery` ↔ `/chat/artifacts`: **DELIBERATE**. One component, verified by test, correctly
  SEO-fenced. No action needed.
- Artifacts gallery ↔ Library: **DELIBERATE** as a product decision (both explicitly justified
  in code comments, both genuinely reachable and used for different jobs), but carrying a real,
  concrete **data-model gap** — no shared provenance between the two, and a false
  "account-scoped" claim on the Artifacts side. This is the finding that matches the founder's
  suspicion, just not in the "we built the same screen twice" shape he expected — it's "we built
  two different screens for the same underlying idea and never connected their storage."
- In-chat `ArtifactsPanel` ↔ `/chat/artifacts` (`GalleryClient`): **DELIBERATE**, not a
  duplicate — conversation-scoped docked panel vs. cross-conversation browse gallery, same store,
  same `ArtifactPreview` renderer reused (no renderer fork).
- `/features/artifacts`, `/shared-artifact/[token]`, `/qa-artifacts`, Settings → Published
  artifacts: **DELIBERATE**, distinct purposes, not duplicates of the browse surfaces.
