# Chat shells and app shells — duplication map

Axis: how many parallel implementations of the main screen (chat surface, primary
left-nav rail, and the app-shell chrome around non-chat routes) exist on web, which
are live, which are dead, which are half-live.

Scope: `apps/web` (Next.js web app). Desktop's `apps/desktop/src/features/v3/DesktopShellV3.tsx`
and `packages/ui/unified-chat` are cited only as context for why a web-side component
is or isn't safe to delete — a full desktop duplication pass is a separate axis.

Repo state at time of audit: branch `compliance/dpdp`, working tree has today's
(2026-08-15) uncommitted changes. Several of the files below (`app-nav-items.ts` —
untracked/new; `WebAppShell.tsx`, `WebChatPage.tsx` — modified) are mid-edit in the
working tree, and the nav-item unification described in Finding 2 appears to be a
change made _today_, not settled history. Everything below reflects the current
working-tree contents, not the last commit.

---

## Summary of what's actually mounted

| Route                                                                                                    | Component tree mounted                                                                       | Shell wiring used                                                      |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/` (signed in)                                                                                          | `WebChatRoot` → dynamic-import → `WebChatPage.tsx`                                           | inline, in `WebChatPage.tsx`                                           |
| `/chat`                                                                                                  | `WebChatRoot` → dynamic-import → `WebChatPage.tsx`                                           | same file, same wiring                                                 |
| `/chat/[sessionId]`                                                                                      | own `dynamic()` wrapper → `WebChatPage.tsx`                                                  | same file, same wiring                                                 |
| `/chat/projects`, `/chat/projects/[id]`, `/chat/library`, `/chat/artifacts`, `/chat/schedules`, `/tasks` | page-specific view inside `WebAppShell.tsx`                                                  | `WebAppShell.tsx`                                                      |
| `/chat/code`                                                                                             | `CloudCodePage.tsx`                                                                          | **its own** shell div + v3's `WebSidebar.tsx` (bypasses `WebAppShell`) |
| `/gallery` (public)                                                                                      | `GalleryClient chrome="public"` inside marketing `Header`/`MarketingFooter`                  | marketing shell                                                        |
| — (unrouted)                                                                                             | `UnifiedChatPage.tsx` → `WebShellV3.tsx` → `ChatInterface` (from `packages/ui/unified-chat`) | v3's own everything                                                    |

There is **one** live chat-surface component (`WebChatPage.tsx`), **one** fully dead
parallel chat surface (`UnifiedChatPage.tsx`/`WebShellV3.tsx`), and **three** distinct
left-nav-rail implementations in the tree, of which one is fully dead, one is live in
two places via independently-maintained handler logic, and one escaped a dead shell
and is now the _only_ thing rendering the rail on a live, nav-linked route.

---

## Finding 1 — `UnifiedChatPage.tsx` / `WebShellV3` chat surface: fully dead

**What**: A second, complete chat-surface implementation — its own host-bridge adapter
(`useWebHostBridge`), its own runtime (`WebChatRuntime`), its own shell
(`WebShellV3.tsx`), its own sidebar (`WebSidebar.tsx`), its own empty state
(`WebEmptyChat.tsx`), its own command-K search modal (`WebSearchModalCmdK.tsx`), all
wrapping the shared `ChatInterface` from `packages/ui/unified-chat`.

**Copies**:

- `apps/web/features/chat/pages/UnifiedChatPage.tsx` (67 lines) — the page component.
- `apps/web/features/chat/v3/WebShellV3.tsx` (178 lines) — the shell.
- `apps/web/features/chat/v3/WebEmptyChat.tsx` (22 lines).
- `apps/web/features/chat/v3/WebSearchModalCmdK.tsx` (31 lines).

**Live copy**: none. `apps/web/features/chat/pages/WebChatPage.tsx` (4,565 lines) is
what every real route mounts (see the route table above).

**Evidence**:

- `grep -rn "UnifiedChatPage" apps/web` (excluding `.next/`) returns exactly two
  real hits, both non-production: a Vitest `vi.mock` in
  `apps/web/features/chat/pages/__tests__/chat-route.test.tsx:36-37`, and a
  code-comment string in `apps/web/shared/stores/web-chat-store.ts:6`
  (`* Used by: WebChatPage, useChatStream, useConversations, UnifiedChatPage, …`
  — a doc-comment listing consumers, not an import).
- No `app/**/page.tsx` imports `UnifiedChatPage` or `WebShellV3`.
- `apps/web/shared/components/layout/app-nav-items.ts:101-103` — a live file's own
  comment already states this explicitly: _"The only link to it in the tree pointed
  out of a dead shell (`WebShellV3`, zero mount points)…"_
- `UnifiedChatPage.tsx:49-54` self-documents its own status: _"Kept as an internal
  component while the Web chat implementation converges. Do not expose a second
  public chat route or query-param switch; `/chat` is the single public Web chat
  URL."_
- `scripts/config/surface-reachability-allowlist.json:303-318` already lists
  `apps/web/features/chat/pages/UnifiedChatPage.tsx` and roughly a dozen sibling
  files (`use-export-conversation.ts`, `use-unified-adapter.ts`,
  `useHelpTour.ts`, `conversation-export.ts`, `document-export.ts`, …) as accepted
  unreachable debt — a repo-owned reachability tool has already independently
  confirmed dead-ness of this cascade.
- Two prior same-day audit passes independently reached the identical conclusion:
  `audit/parity-2026-08-15/gaps/domain-dead-code.json:164-219` and
  `audit/competitive-gap-2026-08-15/fixes/01-web-chat-shell.json:8` (the latter
  explicitly retracting another domain agent's claim that this dead shell's
  `/gallery` link was a "strength").

**Not-quite-empty dead weight**: the cascade behind `UnifiedChatPage` is not just
scaffolding. `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx` is a
materially complete multi-format (Markdown/PDF/DOCX) conversation-export dialog,
reachable only through this dead tree (`dialogs/index.ts` re-exports it, but nothing
outside the dead cascade imports the barrel — verified: `grep -rn "from
'@features/chat/components/dialogs'" apps/web` returns zero real hits). The live
`WebChatPage.tsx` header ships only a Print action. This means a real, working feature
is invisible to every user and to product review, which is a materially different risk
from unused boilerplate.

**Drift risk if left as-is**: low for the shell itself (nobody routes to it, so it
cannot diverge from the live chat page in a way a user would see) — but every day it
stays, someone might "fix" a bug only in the live `WebChatPage.tsx` while a
structurally similar bug (see the memory-injection gap noted in
`audit/parity-2026-08-15/gaps/domain-memory.json:205-215`: `WebChatRuntime.ts`
injects memory with no `isTemporary` guard, unlike the live
`request-processor.ts:976-996` path) sits latent in the unrouted twin, waiting for
someone to wire it up "for free" later and ship the gap with it.

**Verdict**: **DEAD_FORK**. The entire chat-surface cascade (`UnifiedChatPage.tsx`,
`WebShellV3.tsx`, `WebEmptyChat.tsx`, `WebSearchModalCmdK.tsx`, `WebChatRuntime.ts`,
the export dialog/hooks/services, `WebSidebar.test.tsx`,
`WebShellV3.navigation.test.ts`) has zero live importers and is safe to delete **except**
for two components that escaped through a side door — see Finding 3.

**Recommendation**: Delete the cascade, or make an explicit product call to finish and
mount it. Do not leave it half-alive. If deleting, extract `WebSidebar.tsx`'s reusable
parts and `resolveWebViewRoute` out first (Finding 3 depends on them) and re-home the
export dialog/hooks/services onto the live `WebChatPage.tsx` header before deleting
`dialogs/index.ts`, `conversation-export.ts`, `document-export.ts`,
`use-export-conversation.ts` — that feature is worth keeping, the shell it is
stranded inside is not.

---

## Finding 2 — Left-nav rail CRUD wiring duplicated between `WebChatPage.tsx` and `WebAppShell.tsx`

**What**: The primary left sidebar (session list, project list, new-chat, delete,
rename, pin, star, archive, move-to-project, delete-project, account footer) is the
same shared `@agiworkforce/ui` `<Sidebar>` primitive in both places, but the handler
logic around it — the actual calls into `useConversations()` /
`useManagedCloudProjects()` / `useConfirm()`, and the confirm-dialog copy — is written
twice, once per file.

**Copies**:

- `apps/web/features/chat/pages/WebChatPage.tsx` — `handleNewChat`, `handleSelectSession`,
  `handleDeleteSession`, plus project handlers, around lines 2929–3150+.
- `apps/web/shared/components/layout/WebAppShell.tsx` — the same handler set,
  `handleNewChat` (line 159) through `handleProjectCreate` (line 251).

**Live copy**: both, simultaneously — `WebChatPage.tsx` for `/chat` and
`/chat/[sessionId]`; `WebAppShell.tsx` for `/chat/projects`, `/chat/projects/[id]`,
`/chat/library`, `/chat/artifacts`, `/chat/schedules`, `/tasks`, and (per its own
importer list) `PrivacySection.tsx`.

**Evidence of the authors' own awareness**:

- `WebAppShell.tsx:14-16`: _"The chat page (`WebChatPage`) keeps its own richer
  Sidebar wiring (streaming state, dialogs, etc.) and is intentionally NOT refactored
  onto this shell — this is the light-weight, navigation-focused variant."_ This is a
  deliberate choice, not an accident.
- `WebAppShell.tsx:229-232`: _"Same dialog and same copy the chat shell uses — delete-conversation
  is the app's most frequent destructive action and must not look like a browser
  alert on one route and a product dialog on another."_ — the sameness is currently
  hand-maintained, not enforced. Compare the actual strings:
  `WebChatPage.tsx:2997-3000` (`title: 'Delete conversation?'`, `confirmText: 'Delete
conversation'`) vs. `WebAppShell.tsx:171-176` (`title: 'Delete conversation?'`,
  `confirmText: 'Delete conversation'`) — identical today, by manual copy, with
  nothing that would catch the next edit landing in only one file.
- The rail _items themselves_ (Chat/Code/Projects/Artifacts/Library/Tasks/Schedules/Customize)
  already drifted once and were just unified today: `app-nav-items.ts:1-19`
  documents that `WebChatPage` and `WebAppShell` each kept a hand-maintained nav array
  that diverged — `/chat` had 6 entries, `/chat/library` had 7 (Tasks was missing from
  chat), and `WebChatPage` hardcoded `isActive: true` for Chat regardless of route.
  `app-nav-items.ts` is untracked/new in the working tree (`git status --short` shows
  `?? apps/web/shared/components/layout/app-nav-items.ts`), i.e. this fix landed
  _today_. It fixes the nav-**items** duplication but does not touch the CRUD-**handler**
  duplication described here, which remains two independent copies.

**Drift risk**: concrete and already demonstrated once (the nav-array split above). A
fix to, say, the delete-conversation copy, the archive semantics, or adding a new
guard before `handleProjectDelete` in `WebChatPage.tsx` has no mechanism forcing the
same change into `WebAppShell.tsx`, or vice versa. The two files already needed a
human to notice and hand-sync the dialog copy once; nothing stops the next divergence.

**Verdict**: **DRIFT**. Same intent (session/project CRUD wiring around the shared
`<Sidebar>`), same underlying data hooks, independently hand-maintained in two files,
with one class of this exact duplication (nav items) having already drifted and just
been fixed today.

**Recommendation**: Extract the session/project handler set into a single hook (e.g.
`useSidebarSessionActions()` returning the same shape `sharedSidebarProps` needs in
both files) the way `buildAppNavItems()` was just extracted for nav items. Low risk,
same pattern the codebase already applied once this session.

---

## Finding 3 — v3's `WebSidebar.tsx` escaped the dead shell and is now the _only_ rail on `/chat/code`

**What**: `apps/web/features/chat/v3/WebSidebar.tsx` (643 lines) is a **third**,
structurally independent left-nav-rail implementation — its own conversation grouping
(`groupConversations`/`normalizeConversations`, lines 57-82), its own hardcoded
nav-item table per mode (`navItemsForMode`, lines 93-115), its own collapsed-rail item
list (`RAIL_ITEMS`, lines 119-125), its own markup. It imports nothing from
`@agiworkforce/ui` except a small `shortcutLabel` helper — it does not wrap the shared
`<Sidebar>` that `WebChatPage.tsx` and `WebAppShell.tsx` both use.

Its designed home is the dead `WebShellV3.tsx` (`WebShellV3.tsx:11,140` mounts it), but
`apps/web/features/code/CloudCodePage.tsx` — the component `app/chat/code/page.tsx`
mounts for the live, nav-linked `/chat/code` route — imports it directly:

```
apps/web/features/code/CloudCodePage.tsx:29  import { WebSidebar } from '@/features/chat/v3/WebSidebar';
apps/web/features/code/CloudCodePage.tsx:30  import { resolveWebViewRoute } from '@/features/chat/v3/WebShellV3';
apps/web/features/code/CloudCodePage.tsx:277 <WebSidebar mode="code" onModeChange={handleSidebarMode} ... />
```

`CloudCodePage.tsx` also does not use `WebAppShell` — it builds its own
`<div className={styles.shell}><div className={styles.sidebar}>…` wrapper (line 275)
around this borrowed component, a fourth distinct pattern for "the chrome around a
page."

**Copies of "the primary left rail" concept**: (1) `@agiworkforce/ui`'s `<Sidebar>`,
wired in `WebChatPage.tsx`; (2) the same `<Sidebar>`, wired independently in
`WebAppShell.tsx` (Finding 2); (3) v3's `WebSidebar.tsx`, wired directly by
`CloudCodePage.tsx`.

**Live copy**: (1) and (2) for every route except `/chat/code`; (3) — the dead
shell's component — for `/chat/code` specifically.

**This is not just code duplication — the rendered rail is visibly different**:
`APP_NAV_DESTINATIONS` in `app-nav-items.ts:76-153` is documented as _"The rail, in
render order. Every signed-in surface shows all of these"_ (Chat, Code, Projects,
Artifacts, Library, Tasks, Schedules, Customize). But `WebSidebar.tsx`'s
`navItemsForMode('code')` (line 103-107) returns only:

```js
[
  { id: 'code-desktop', label: 'Desktop app', icon: Download },
  { id: 'code-vscode', label: 'VS Code extension', icon: Blocks },
];
```

A user who navigates to `/chat/code` from the nav rail sees a rail that does not
contain Projects, Artifacts, Library, Tasks, or Schedules — it contains "Desktop app"
and "VS Code extension" links instead, with different iconography and different
collapse mechanics than the persistent rail on every other route. "Every signed-in
surface shows all of these" (the comment's claim) is false for this one route today.

**Evidence**:

- `grep -rln "WebShellV3" apps/web` (excluding tests/`.next/`) →
  `WebShellV3.tsx` itself, `WebSearchModalCmdK.tsx`, `WebSidebar.tsx`,
  `UnifiedChatPage.tsx` (dead), and `CloudCodePage.tsx` (imports only the
  `resolveWebViewRoute` function, not the `WebShellV3` component).
- `grep -rln "features/chat/v3/WebSidebar" apps/web` → `WebShellV3.tsx`,
  `WebSidebar.test.tsx`, and `CloudCodePage.tsx`.
- `apps/web/shared/components/layout/app-nav-items.ts:39-46` (`CHAT_SECTION_PREFIXES`
  includes `/chat/code`) confirms Code is meant to be a first-class rail destination
  driven by the same source of truth as everything else — but the component actually
  rendering that surface's rail doesn't consume that source of truth at all.

**Verdict**: **DRIFT**, with a DEAD_FORK origin. The component was built for a shell
that never shipped, was never migrated onto the live `<Sidebar>`/`buildAppNavItems`
pattern the rest of the app converged on, and is now the sole rail implementation for
one live route — silently diverging from the rest of the product's navigation
surface. Not safe to delete outright (Finding 1's blanket "delete the v3 cascade"
recommendation does not apply to this file or to `WebShellV3.tsx`'s exported
`resolveWebViewRoute` function — both have a live consumer).

**Recommendation**: Before deleting the rest of the v3 cascade (Finding 1), migrate
`/chat/code` onto `WebAppShell` + `buildAppNavItems`, the same as every other secondary
surface, so Code gets the real, current rail (and any future rail change lands there
automatically). Then `WebSidebar.tsx`, `resolveWebViewRoute`, and the rest of v3 can be
deleted as a unit with nothing left depending on them.

---

## Finding 4 (minor) — two independent `dynamic()` wrappers around the same `WebChatPage`

**What**: `WebChatRoot.tsx` (`/` and `/chat`) and `app/chat/[sessionId]/page.tsx`
(`/chat/[sessionId]`) each independently call
`dynamic(() => import('@features/chat/pages/WebChatPage'), { ssr: false, loading: … })`
with a different loading fallback — an inline spinner (`WebChatSkeleton`, defined in
`WebChatRoot.tsx:23-48`) versus the segment's own `ChatLoading` component
(`app/chat/loading.tsx`, reused by `[sessionId]/page.tsx:4,14`).

**Live copy**: both — same underlying component, two different cold-load skeletons
depending which of the three routes is hit first.

**Verdict**: **DRIFT**, low severity — purely cosmetic (which skeleton a first-time
visitor sees during the client-chunk fetch), not a functional fork. `[sessionId]/page.tsx`
even carries a comment (`GOV-25`) that mirrors word-for-word the comment in
`WebChatRoot.tsx`, i.e. the same fix was applied twice by hand.

**Recommendation**: Low priority. If touched, route `[sessionId]/page.tsx` through
`WebChatRoot` (or export one shared loading component both wrappers reference) so the
cold-load experience is identical across all three entry points.

---

## Finding 5 (contrast case) — `/gallery` vs `/chat/artifacts`: correctly DELIBERATE

Included for contrast, since the founder's prompt named "gallery" as a suspect.
`apps/web/app/gallery/page.tsx` (public, marketing-chrome, SEO-indexed, has a
`sitemap.ts` entry) and `apps/web/app/chat/artifacts/page.tsx` (in-app,
`WebAppShell`-wrapped, `robots: noindex`, `alternates: canonical: '/gallery'`) both
render the same `GalleryClient` component with a `chrome` prop
(`chrome="public"` / `chrome="app"`) — one component, two mount points, explicit
`robots`/`canonical` metadata so search engines see one canonical page. The route
comment (`app/chat/artifacts/page.tsx:6-24`) explains exactly why `/gallery` could not
simply be moved into the app shell (it must stay reachable and indexable
signed-out). This is the "public SEO page + in-app page sharing one component" pattern
called out as DELIBERATE in the task brief, and the code matches that description
precisely — no drift risk here beyond the ordinary one component always carries.

**Verdict**: **DELIBERATE**. Not a defect; no action needed.

---

## Answering the founder's question

"Duplicated chat/app shells" is real, but not in the naive "four copies of the same
screen" sense — three of the four historically-parallel chat implementations have
already collapsed to one live copy (`WebChatPage.tsx`) mounted three ways, and the
fourth (`UnifiedChatPage`/`WebShellV3`) is confirmed, triple-corroborated dead code
(this audit + two same-day sibling audits + the repo's own reachability allowlist).

The real, live risk is one level down, in the **left-nav rail**: the same conceptual
surface has three different implementations in the tree today (shared `<Sidebar>` in
`WebChatPage`, the same shared `<Sidebar>` independently wired in `WebAppShell`, and
v3's home-grown `WebSidebar` wired directly into `CloudCodePage`), and one of the three
is visibly showing users a different, stale set of navigation destinations on
`/chat/code` right now. The nav-_items_ half of this was just unified today
(`app-nav-items.ts`); the CRUD-handler half (Finding 2) and the v3-escape half
(Finding 3) were not.

## Files referenced (absolute paths)

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/page.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/chat/page.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/chat/[sessionId]/page.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/chat/code/page.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/chat/artifacts/page.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/gallery/page.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/WebChatRoot.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/pages/WebChatPage.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/pages/UnifiedChatPage.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebShellV3.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebSidebar.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebEmptyChat.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/v3/WebSearchModalCmdK.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/code/CloudCodePage.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/shared/components/layout/WebAppShell.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/shared/components/layout/app-nav-items.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/scripts/config/surface-reachability-allowlist.json`
