# Duplicated Components — Library, Artifacts, Gallery, and What Causes Them

Axis: same UI built more than once. Scope: `apps/web`, `apps/mobile`, `apps/desktop`,
`packages/ui`. Method: every claim below is grep-verified against actual import graphs and
route mounts on branch `compliance/dpdp`, not inferred from file names.

## Headline

The founder's instinct is right, but the mechanism is bigger than copy-pasted components: web
never cut over to the shared chat shell (`ChatInterface` in `packages/ui/unified-chat`) that
desktop already uses. `apps/web/features/chat/pages/UnifiedChatPage.tsx` — a fully built,
tested adapter that wires the shared shell to web's own runtime — exists in the tree and is
explicitly **locked out** by a regression test (`chat-route.test.tsx`: _"always renders the
canonical WebChatPage… `unified-chat-page` toBeNull()"_). Web's real `/chat` route renders a
4,565-line bespoke page (`WebChatPage.tsx`) instead. Because that page's whole subtree —
message list, message bubble, artifact panel — was independently built rather than reusing the
shared shell's subtree, every component nested inside `ChatInterface` now has a shadow twin in
web's own tree. That is the root cause of the `MessageBubble` split the founder already found,
and it repeats for the artifact panel. Meanwhile Library and the public/app Gallery pages show
the codebase _can_ do this correctly — they are genuinely shared, well-documented, single
implementations. The duplication is concentrated in the surfaces that never got the same
treatment.

Separately, on desktop specifically, two full "AgiWork\*" gallery components (artifacts,
projects) were built from scratch instead of reusing the shared package's `ProjectGallery`
equivalent, and one of them — `ArtifactsGallery.tsx`, 580 lines with its own search, category
filter and inspiration tab — has **zero importers** anywhere in the app. It was fully built,
then superseded by `AgiWorkArtifacts.tsx`, and never deleted.

---

## 1. MessageBubble — three implementations, one platform-justified, two not

| Copy                                                           | Lines        | Live?                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/features/chat/components/messages/MessageBubble.tsx` | ~2250        | **Live** — reached via `app/chat/page.tsx` → `WebChatRoot` → `WebChatPage.tsx` → `ChatMessageList.tsx` → `MessageBubble`                                                                                                                                                          |
| `packages/ui/unified-chat/src/components/MessageBubble.tsx`    | ~925         | **Live for desktop only** — reached via `App.tsx` → `DesktopShellV3.tsx` → `ChatInterface` (feature flag `desktop_chat_v3`, defaults `enabled: true`). Web's route to the same component (`UnifiedChatPage.tsx` → `WebShellV3` → `ChatInterface`) is built but unrouted (see §6). |
| `apps/mobile/src/features/chat/components/MessageBubble.tsx`   | not measured | **Live** — React Native rendering (Views/Text), cannot share a DOM-based package.                                                                                                                                                                                                 |

**Verdict: DRIFT** (web vs. shared), **DELIBERATE** (mobile vs. the other two — real platform
constraint, React Native vs. DOM).

**Evidence of drift already realized**: a code-block copy button was hover-gated in one copy and
not the other; fixed today only in the shared markdown renderer, so the web copy still has the
old behavior unless it independently imports the same renderer fix. Confirmed both files
diverge in size by >2x, meaning they are not thin wrappers around one core — they are two
independently-maintained message-rendering engines.

**Drift risk**: any bug fix or UX change landed in one `MessageBubble` (retry affordance, edit
flow, citation rendering, tool-call card layout, etc.) does not reach the other unless someone
remembers to port it by hand. There is no compiler or test that catches this — they are
different files with different prop contracts.

**Recommendation**: this is not fixable by deleting a file — the underlying cause is web's route
not consuming `ChatInterface` (§6). Until that is resolved, treat the two `MessageBubble`
copies as permanently forked and require any behavior fix to be applied to both, the same way
today's copy-button fix should have been.

---

## 2. MessageMetadata — three diverging type definitions in web alone (not two)

The founder's note said this was duplicated between `web-chat-store.ts` and `MessageBubble.tsx`.
Tracing every declaration shows it is worse: there are **three independent `interface
MessageMetadata`** declarations in `apps/web`, with non-overlapping field sets — these are not
copies of the same shape, they have diverged into different shapes that happen to share a name.

| File                                              | Distinctive fields                                                                               | Who imports it                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/shared/stores/web-chat-store.ts:164`    | `privacyMode`, `providerMode`, `handoffDraftId`, `handoffPreviewHashSha256`, `cachedInputTokens` | **Live path**: `apps/web/lib/hooks/useChatStream.ts` (the real send/persist hook) and `MessageBubble.tsx` (imported aliased as `StoreMessageMetadata`) |
| `apps/web/shared/types/common.ts:86`              | `employeeId`, `employeeName`, `employeeAvatar`, `selectionReason`, `thinkingProcess`             | `apps/web/shared/types/index.ts` re-export                                                                                                             |
| `apps/web/shared/stores/unified-chat-types.ts:20` | `tokenCount`, `widgets` (`ChatWidgetData[]`), `taskId`, `edited`/`editedAt`/`originalContent`    | `apps/web/lib/hooks/useSessionPersistence.ts`, `apps/web/lib/session/sessionStorage.ts`                                                                |

**Verdict: DRIFT.** `web-chat-store.ts`'s version is the one actually written to and read from
during a real chat turn (confirmed via `useChatStream.ts`'s `saveMessageToDb()`). The other two
are reached by adjacent-but-different code paths (session persistence / restore, and a legacy
common-types file), so a field added to support a new feature in one does not typecheck-fail
against the others unless something explicitly imports both — which is exactly the trap the
founder hit today (had to add the same field in two files to get past `tsc`).

**Recommendation**: pick `web-chat-store.ts`'s `MessageMetadata` as canonical (it is the one on
the live write path) and have the other two either import/extend it or be renamed so the
identical name stops implying interchangeability.

---

## 3. Desktop's `ArtifactsGallery.tsx` — a full component with zero live importers

`apps/desktop/src/features/artifacts/ArtifactsGallery.tsx` (580 lines) is a complete
"Your Artifacts" + "Inspiration" tabbed gallery: search bar, category filter row, 3-column card
grid, hardcoded inspiration items, hover actions (copy/delete). It is exported from
`apps/desktop/src/features/artifacts/index.ts`, and that barrel file itself has **zero
importers** anywhere in `apps/desktop/src` (confirmed: no other file imports
`@/features/artifacts` or the relative barrel path). There is also no `<ArtifactsGallery`
JSX anywhere outside its own definition and its own test file.

The component it was superseded by is live and mounted twice:

```
apps/desktop/src/features/v3/AgiWorkArtifacts.tsx
  → exported from features/v3/index.ts
  → imported and rendered at DesktopShellV3.tsx:854 (<AgiWorkArtifacts onNewChat=... />)
```

`AgiWorkArtifacts.tsx` reads from the same `artifactStore` as the rest of the v3 shell and is
the thing a user in the running desktop app actually sees when they open the Artifacts panel.

**Also dead as a consequence**: `ArtifactCategoryFilter.tsx` (`apps/desktop/src/features/artifacts/ArtifactCategoryFilter.tsx`)
has exactly one consumer in the whole tree — the dead `ArtifactsGallery.tsx`. It dies with it.

By contrast, the _other_ five exports from that same barrel are genuinely live, just reached by
direct file import rather than the barrel: `ArtifactPanel` (`App.tsx`,
`DesktopShellV3.tsx:911`), `ArtifactRendererView`/`ArtifactVersionHistory`/`InlineArtifactEditor`/
`ShareArtifactDialog` (all consumed inside `ArtifactPanel.tsx`). So this is not "the whole
artifacts feature is dead" — it is specifically the gallery-browsing surface that was rebuilt
under a new name and the old one left in place.

**Verdict: DEAD_FORK.**

**Evidence**:

- `grep -rn "<ArtifactsGallery" apps/desktop/src --include="*.tsx"` → zero results outside its own file.
- `grep -rln "features/artifacts'" apps/desktop/src` (the barrel that exports it) → zero results outside the barrel itself.
- `apps/desktop/vite.config.ts:450` explicitly excludes a _different_ directory (`archive/`) as "superseded implementations kept for reference" — `ArtifactsGallery.tsx` is not in that excluded directory, so it still compiles into the app bundle even though nothing renders it. It is dead code that still ships.

**Recommendation**: delete `ArtifactsGallery.tsx` and `ArtifactCategoryFilter.tsx`, or move them
into `archive/` (which is already excluded from the build) if there's a reason to keep them for
reference. Either is safe — zero live importers means zero behavior change.

---

## 4. Gallery (web) — a genuinely correct DELIBERATE pattern, worth naming as the target to copy

`apps/web/app/gallery/GalleryClient.tsx` (1,279 lines) is mounted at **two** routes:

- `/gallery` (`apps/web/app/gallery/page.tsx`) — public, unauthenticated, real SEO metadata, in `sitemap.ts`, marketing chrome (Header + MarketingFooter).
- `/chat/artifacts` (`apps/web/app/chat/artifacts/page.tsx`) — signed-in, inside `WebAppShell`, `robots: noindex` with `alternates.canonical: '/gallery'` pointing back at the public URL.

The in-app route's own doc comment states the reasoning explicitly and correctly: _"So the
surface gets two mounts of ONE component... There is no forked copy — a change to the gallery
lands on both."_ This is exactly the founder's own definition of an acceptable pattern (a public
SEO page and an in-app page sharing one component). Verified: `<GalleryClient chrome="app" />`
and the public page both import the same file; no second implementation exists.

**Verdict: DELIBERATE.** No action needed — flagged here only to make clear the audit did not
miss it, and because it is the pattern the desktop-side duplication in §3/§5 should have
followed.

---

## 5. Gallery / Projects — desktop independently rebuilt what the shared package already has

`packages/ui/unified-chat` ships two shared, cross-platform gallery-style components:

- `ProjectGallery.tsx` (452 lines) — list/grid of projects with search + create flow. **Only imported by web** (`apps/web/app/chat/projects/page.tsx`).
- The artifacts-browsing concept (via `ArtifactPanel`/`ArtifactRenderer`/`ArtifactsSidebar`, see §7).

Desktop does not use `ProjectGallery` at all. Instead it has its own, independently built and
live component:

```
apps/desktop/src/features/v3/AgiWorkProjects.tsx   (462 lines)
  → DesktopShellV3.tsx:815 and :882 (mounted in two render contexts)
```

`AgiWorkProjects.tsx` implements the same concept — list/search/create/star/archive projects —
against `apps/desktop/src/stores/projectStore.ts`, a completely separate store from whatever
`ProjectGallery` uses on web. Same story as artifacts: web reuses the shared package, desktop
reimplemented the same surface under its own "AgiWork\*" naming convention.

**Verdict: DRIFT at the cross-platform architecture level.** Neither copy is "wrong" in
isolation — both are live and presumably necessary — but they are two independently maintained
implementations of the same product concept (project gallery) where the codebase already has a
shared component built for exactly this. A UX change to project cards, search, or the create
flow made in `ProjectGallery.tsx` will not reach desktop's `AgiWorkProjects.tsx`, and vice
versa.

**Recommendation**: if desktop's version has Tauri-specific needs (e.g., different storage,
different privacy-mode gating — `AgiWorkProjects.tsx` does gate on `privacyMode` via
`appModeStore`), that's a legitimate reason to diverge, but it should be documented the way
`DesktopLibrary.tsx` documents its divergence from the shared `LibraryView` (see §8). Today
there is no such comment on `AgiWorkProjects.tsx` explaining why it isn't the shared
`ProjectGallery` with a desktop transport, which makes it impossible to tell, from the code
alone, whether this is intentional or an accident of two teams building the same thing at
different times.

---

## 6. The actual mechanism: web's shared chat shell is fully built and explicitly unrouted

This is the finding that explains §1 and is a prerequisite for fixing it, so it's called out on
its own.

`packages/ui/unified-chat/src/components/ChatInterface.tsx` is a complete, self-contained chat
shell — sidebar, message list, composer, and (per §7) its own artifact panel — meant to be the
one chat UI shared across platforms. It is:

- **Live for desktop**: `App.tsx` → `DesktopShellV3.tsx` mounts `<ChatInterface ...>` at
  `DesktopShellV3.tsx:749`, feature-flagged `desktop_chat_v3` defaulting to `enabled: true`
  (per `docs/agent-context/known-flaws.md`'s 2026-07-19 desktop-shell audit entry).
- **Built for web, but unrouted**: `apps/web/features/chat/pages/UnifiedChatPage.tsx` adapts
  web's `web-chat-store` into the shell's `ChatHostBridge` contract and renders
  `<WebShellV3>` → `<ChatInterface>`. It has zero importers from any `app/**/page.tsx` route.
  `apps/web/features/chat/pages/__tests__/chat-route.test.tsx` pins this explicitly:

  ```
  describe('/chat route', () => {
    it('always renders the canonical WebChatPage', async () => {
      ...
      expect(screen.getByTestId('web-chat-page')).toBeDefined();
      expect(screen.queryByTestId('unified-chat-page')).toBeNull();
    });
  ```

- **Confirmed already tracked**: `docs/agent-context/known-flaws.md` independently reached the
  same conclusion while investigating an unrelated desktop cloud-mode gap: _"`UnifiedChatPage.tsx`,
  which no `app/**/page.tsx` route renders... an orphaned, unrouted duplicate implementation,
  not production code."_ So this is not new information to the team, but it has not been acted
  on, and its consequence (the component-level duplication in §1 and §7) had not previously been
  traced out.

**Verdict: DEAD_FORK at the route level**, with live downstream consequences: because web's real
page (`WebChatPage.tsx`, 4,565 lines) never mounts `ChatInterface`, everything inside
`ChatInterface`'s tree needed a hand-built twin in `WebChatPage.tsx`'s own tree to exist on web
at all — that twin is where `MessageBubble` (§1) and the web-only `ArtifactsPanel.tsx` (§7)
came from.

**What would settle whether to delete `UnifiedChatPage.tsx`/`WebShellV3` or finish routing to
it**: this is a product/architecture decision, not something greppable. `WebShellV3` +
`ChatInterface` is feature-complete enough that desktop runs on it daily; the blocker for web is
unknown from the code alone (no `known-flaws.md` entry explains _why_ web wasn't cut over, only
_that_ it wasn't). Do not delete `UnifiedChatPage.tsx` without asking — it is fully wired and
tested, and represents real, recent, working effort toward eliminating exactly this
duplication.

---

## 7. ArtifactPanel / ArtifactRenderer — desktop's own vs. the shared one, plausible trust-boundary split, unverified at runtime

| Copy                                                        | Lines | Mounted when                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`     | 1,089 | `DesktopShellV3.tsx:911`, gated `privacyMode === 'local' && artifactPanelOpen`                                                                                                                                                                              |
| `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` | 1,175 | Internally by `ChatInterface` (`ChatInterface.tsx:1040`), whenever its own `useArtifact()` hook reports `artifactOpen` — reachable from desktop any time `ChatInterface` is on screen (i.e., always, since it's the chat shell itself, not gated to a mode) |

These are two full, independent implementations of the same concept (artifact tabs, Preview/
Code/Versions inner tabs, version history, streaming updates) with **two separate Zustand
stores of the same name**: `apps/desktop/src/stores/artifactStore.ts` (desktop's own) vs.
`packages/ui/unified-chat/src/stores/artifactStore.ts` (the shared package's own, driving
`ChatInterface`'s internal panel via `useArtifact()`). `AgiWorkArtifacts.tsx` and desktop's
`ArtifactPanel.tsx` both read desktop's store; `ChatInterface`'s built-in panel reads the
package's store — these do not share state.

Desktop's own panel imports Tauri-only capability (`@tauri-apps/plugin-shell`'s `shellOpen`, for
"open in file explorer") that the shared, web-compatible package genuinely cannot have — a real
platform constraint, consistent with this repo's stated Local/BYOK/Managed-Cloud trust-boundary
separation. Desktop's own panel is also gated `privacyMode === 'local'` specifically, which is
suggestive of an intentional split (local artifacts get the Tauri-native panel; anything routed
through `ChatInterface` — including, per code comment `DES-C05`, cloud-derived artifacts — gets
the shared, web-parity panel).

**Verdict: UNCLEAR, leaning DELIBERATE, but undocumented and not runtime-verified.** Two things
would settle it:

1. Unlike `DesktopLibrary.tsx`, which has an explicit doc comment explaining exactly why it
   doesn't just use the shared component's default transport, neither `ArtifactPanel.tsx`
   (desktop) nor `ChatInterface.tsx`'s internal panel has a comment explaining the split. Given
   this codebase's demonstrated habit of documenting exactly this kind of decision elsewhere
   (§4, §8), its absence here is notable.
2. Nobody in this pass opened a managed-cloud artifact on a running desktop build to confirm the
   shared panel actually renders (and that desktop's own panel does NOT also render
   simultaneously, since both are theoretically mountable inside the same `DesktopShellV3` tree
   at different z-index/regions). The dev server available for this task was the web app, not
   desktop, so this could not be checked live. This should be verified by hand before trusting
   the "deliberate split" reading — if it's wrong, this is a REDUNDANT_COLLAPSE (both panels
   have live paths to render for the same artifact, whichever fires first wins, and the UI
   forked without anyone deciding to fork it).

**Related dead code found while tracing this**: `packages/ui/unified-chat/src/components/ArtifactsSidebar.tsx`
(uses `ArtifactRenderer` internally) is exported from the package's `index.ts` and fully tested,
but has **zero non-test importers anywhere in the repo** — not web, not desktop, not mobile. It
is inert code shipped in the shared package with no consumer.

**A drift admission already in the code**: `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`
contains its own comment acknowledging the exact failure mode this report is about, _within a
single file_: _"the sibling `ArtifactRenderer.HtmlArtifact` uses... drift between `ArtifactPanel`
and `ArtifactRenderer.HtmlArtifact`"_ — two HTML-artifact rendering code paths inside the same
package, kept in sync only by a comment telling the next editor to remember to update both.

---

## 8. Library — the counter-example: how this is done correctly

`packages/ui/unified-chat/src/components/library/LibraryView.tsx` is the single implementation.
Web and desktop each ship a thin adapter, not a second implementation:

- `apps/web/features/library/components/LibraryView.tsx` — doc comment: _"The view itself lives
  in `@agiworkforce/unified-chat` so Desktop renders the same Library rather than a second
  implementation of it. This file supplies only what differs on web..."_ Supplies Clerk auth
  state, same-origin cookie fetch, CSRF header.
- `apps/desktop/src/features/library/DesktopLibrary.tsx` — matching doc comment: _"Desktop shows
  the same Library rather than a second implementation that would drift. This file supplies only
  what differs here: absolute Cloud URLs, an account-pinned bearer transport... and an in-app
  preview built from authenticated response bytes."_

Both adapters implement a shared `LibraryTransport` interface and pass it into the one shared
`LibraryView`. A UI or logic fix to `LibraryView` lands on both platforms automatically — the
thing `MessageBubble` and the artifact-gallery pattern above fail to do.

**Verdict: DELIBERATE, and done well.** No action needed. Referenced here because it is the
concrete template for how `ChatInterface`/`MessageBubble`/`ArtifactPanel` should end up working
once §6 is resolved — a shared core plus thin, documented, platform-specific transports, not
independent reimplementations.

---

## Summary table

| #   | What                           | Copies                                                                      | Live copy                                    | Verdict                                      | Real cost if unresolved                                                                                                      |
| --- | ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | MessageBubble                  | web / unified-chat(desktop) / mobile                                        | web: own; desktop: unified-chat; mobile: own | DRIFT (web↔shared) / DELIBERATE (mobile)     | Behavior fixes (already happened once today) silently miss one platform                                                      |
| 2   | MessageMetadata type           | 3 in web alone                                                              | `web-chat-store.ts` (live write path)        | DRIFT                                        | Field additions require manual double/triple-patching to typecheck; already happened                                         |
| 3   | Artifacts gallery (desktop)    | `ArtifactsGallery.tsx` vs `AgiWorkArtifacts.tsx`                            | `AgiWorkArtifacts.tsx` only                  | DEAD_FORK                                    | None functionally (dead code), but it still ships in the bundle and can mislead the next engineer into editing the wrong one |
| 4   | Gallery (web, public + in-app) | 1 component, 2 mounts                                                       | both mounts, same file                       | DELIBERATE                                   | none                                                                                                                         |
| 5   | Project gallery                | web: `ProjectGallery` (shared) vs desktop: `AgiWorkProjects.tsx` (own)      | both live, independently                     | DRIFT                                        | Project-list UX changes don't propagate across platforms                                                                     |
| 6   | Chat shell itself              | `WebChatPage.tsx` (web, own) vs `ChatInterface` (shared, desktop-only live) | web: own; desktop: shared                    | DEAD_FORK (route) causing DRIFT (components) | Root cause of #1 and half of #7                                                                                              |
| 7   | Artifact panel                 | desktop's own vs unified-chat's (inside `ChatInterface`)                    | both plausibly live, different modes         | UNCLEAR (leaning DELIBERATE)                 | Unverified — could be REDUNDANT_COLLAPSE if both can render at once                                                          |
| 8   | Library                        | 1 shared component, 2 thin adapters                                         | both adapters, same core                     | DELIBERATE                                   | none — template to copy                                                                                                      |

## What would need to happen to actually collapse the real duplication

1. Decide, at the product level, whether web ever cuts over `/chat` to `UnifiedChatPage.tsx` /
   `ChatInterface` (§6). Everything else in §1 and §7 is downstream of this one decision — file
   deletions elsewhere are cosmetic until this is resolved.
2. Delete `apps/desktop/src/features/artifacts/ArtifactsGallery.tsx` and
   `ArtifactCategoryFilter.tsx` (§3) — zero-risk, zero live importers, verified.
3. Runtime-verify §7's trust-boundary hypothesis on an actual desktop build before trusting it;
   if confirmed, add the same kind of doc comment `DesktopLibrary.tsx` has, so the next person
   doesn't have to re-derive this from grep the way this audit did.
4. Consolidate the three `MessageMetadata` interfaces (§2) onto `web-chat-store.ts`'s shape,
   which is already the one on the live write path.
