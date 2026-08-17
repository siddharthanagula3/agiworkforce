# Duplicated Surfaces — what got built more than once

**Date:** 2026-08-15 · **Branch:** `compliance/dpdp`
**Question asked:** _"i think we built duplicated things like library, artifacts, gallery, etc"_

**32 duplicate sets across 6 axes** — 10 DELIBERATE · 11 DRIFT · 8 DEAD_FORK ·
1 REDUNDANT_COLLAPSE · 2 UNCLEAR. Structured data in `all-axes.json`, per-axis
detail in the sibling `.md` files.

Duplication is not automatically bad. The classification is what matters:

- **DELIBERATE** — two surfaces, one implementation, justified. Leave alone.
- **DRIFT** — same intent, independently edited. _A bug fixed in one copy does not
  reach the other._ This is the expensive kind.
- **DEAD_FORK** — one copy is unreachable. Cheap to delete, but confusing to read.
- **REDUNDANT_COLLAPSE** — a user reaches the same thing two ways for no reason.

---

## The headline: gallery/artifacts is the one that's fine

`/gallery` and `/chat/artifacts` are **not** duplicated code. Both import the
literal same `GalleryClient` (`app/chat/artifacts/page.tsx:4`), with `noindex` +
`canonical → /gallery` on the in-shell copy, and a regression test that asserts
"not a forked copy." Public SEO page and in-shell page, one component. Correct.

**The real Library/Artifacts problem is the data underneath, not the UI.**
Three disconnected stores back what a user thinks of as "my stuff":

| Store                                  | Holds                                  | Reaches                                       |
| -------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `localStorage` (`agi-artifacts-store`) | artifacts parsed from chat code fences | Artifacts gallery only                        |
| `web_artifacts` table                  | Desktop-authored artifacts             | pulled one-way into web; **web never pushes** |
| `media_assets` table                   | tool-generated files                   | Library only                                  |

Consequences, each verified in code:

1. **Web-created artifacts live only in the browser.** `artifacts-store.ts`'s
   `addArtifact`/`upsertArtifact` make **zero network calls**. Clear site data or
   switch machines and they are gone.
2. **The nav copy is false.** `app-nav-items.ts` describes the gallery as
   "account-scoped." For web-originated artifacts it is device-scoped.
3. **Tool-generated HTML never gets the rich viewer.** `generated-file-persist.ts`
   already classifies html/svg/md/mermaid as `surface: 'artifact'`, but
   `LibraryView` renders every row through the plain `GeneratedFileCard`
   (download / open-in-tab) instead of `ArtifactPreview` (sandboxed iframe,
   versions, iterate).

Keeping Artifacts and Library as two surfaces is defensible — they answer different
questions, and it matches the Claude-vs-ChatGPT split deliberately. Merging them
would copy ChatGPT's pattern _without_ ChatGPT's unified storage. Fix the storage.

---

## The one to fix first: account deletion is duplicated and has already drifted

Three implementations, and the drift is user-visible:

| Copy                         | Endpoint                             | Signs the user out?                     |
| ---------------------------- | ------------------------------------ | --------------------------------------- |
| `AccountSection.tsx:201-245` | `DELETE /api/user/delete-account`    | **Yes** — `logout()` + `clerkSignOut()` |
| `PrivacySection.tsx:305-326` | `DELETE /api/user/delete-account`    | **No**                                  |
| `UserSettings.tsx` (dead)    | `/api/user/data` (data-only erasure) | n/a — and its UI says "delete account"  |

Delete your account from **Privacy** and you are left with a fully authenticated
client session against an account scheduled for erasure. Both live paths have
**zero test coverage** (grepped every `.test.tsx` for `delete-account` — no hits).

The dead third copy is worse in kind: it calls a _data-only_ endpoint that
explicitly preserves the login while its UI claims full account deletion. Harmless
while unmounted; a compliance mislabel if anyone rewires it.

---

## Live drift worth closing

- **`/chat/code` runs a third nav rail.** `CloudCodePage` mounts `WebSidebar` (v3)
  instead of `WebAppShell`, so it shows **2 nav items where every other signed-in
  screen shows 8** — and its _collapsed_ state shows more links than its _expanded_
  state. Its collapsed "Settings" icon points at `/settings/voice`, not general
  settings. Today's `app-nav-items.ts` extraction covered the two shells it
  targeted; this third one survived.
- **`MessageBubble` ×2** (web ~2250 lines vs shared ~925) and a **`MessageMetadata`
  interface duplicated** between `web-chat-store.ts` and `MessageBubble.tsx` — a
  fix today had to add the same field in both or typecheck failed.
- **`WorkSessionPanel` vs `TaskDetailPanel`** independently map the _same_ agent
  events to rows, off the same shared reducer. The same tool call can render with
  different labels and colors depending on which surface you look at.
- **Desktop shows one scheduled-jobs list through two hand-coded renderers** off the
  same `useSchedulerStore`, reachable from two nav paths.
- **Connector browse/connect/disconnect** implemented twice, with two different
  confirm-dialog patterns.

## Dead forks (safe to delete, each traced to zero live importers)

`UnifiedChatPage` → `WebShellV3` (the whole v3 chat surface, though `WebSidebar` is
still live via `CloudCodePage`) · `UserSettings.tsx` (584 lines, self-flagged "NOT
MOUNTED BY ANY ROUTE") · desktop legacy `SchedulerPanel`/`JobCreationDialog`
(self-labelled "legacy", zero importers) · `BackgroundTasksPanel` (a _fourth_ task
concept, mounted nowhere) · desktop artifacts gallery · skill detail route.

`WebShellV3`'s dead `VIEW_ROUTES` still maps `artifacts → /gallery` — the exact bug
`app-nav-items.ts` was written to fix. If that code is ever resurrected it
reintroduces it.

## Settings with no way in

`/settings/byok` and `/settings/sync` are real pages with real content and **no nav
entry anywhere** — reachable only by typing the URL. Same class as the voice page
fixed earlier today, which is the template for wiring them in. Marked UNCLEAR
rather than filed as a defect: whether they are _meant_ to be reachable is a product
call, not a cleanup call.

## Not duplication

Tasks vs Schedules are genuinely different backends — `cloud_agent_runs` (full
tool-using agent harness) vs `scheduled_tasks` (capped single-shot, **no tools**,
disclosed honestly in the form's own copy). No shared implementation exists to
diverge. The risk is legibility, not code: four distinct types (`Task`,
`ScheduleTask`, `AgentTaskStore` goal, `ScheduledTask`) surface to users as two
disconnected nav lists, where every benchmarked competitor keeps one automation
list with a real-tasks/templates split.

The `/features/*` marketing pages, redirect stubs (`/marketplace`, `/ai-skills`,
`/connectors/new`), the public `shared-artifact/[token]` view, and the dev-only
`qa-artifacts` harness are all correctly scoped and were verified, not assumed.
