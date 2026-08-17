# Duplication audit — Settings & Navigation

Date: 2026-08-15
Branch: `compliance/dpdp`
Scope: primary nav rail definitions, `/settings/*` routes vs. the settings modal, and destructive account/data flows.
Method: every claim below is traced to file:line, importer counts, and (where the code makes it decidable) which copy a real navigation click actually reaches. Verdicts follow the rubric in the task: platform-split = deliberate, shell+content-wiring split = deliberate, independently-edited copies of the same intent = drift, two reachable paths to the same thing = redundant collapse.

---

## Summary

The nav-rail extraction (`app-nav-items.ts`) is real and correctly adopted by both of the surfaces it was built to fix (`WebChatPage`, `WebAppShell`) — that part of the fix is complete. But a **third, hand-rolled nav definition survives and is live**: `WebSidebar.tsx` (the "v3" sidebar), mounted by `CloudCodePage` at `/chat/code`, which is one of the eight destinations _on_ the very rail `app-nav-items.ts` centralized. Clicking "Code" from the canonical rail lands the user on a screen governed by a second, independently-coded nav model that shows only 2 items instead of 8, and whose own collapsed state shows _more_ links than its expanded state — a self-inconsistency, not just a cross-file one.

Settings is **not** two competing implementations. `/settings/*` route pages are almost all real `SettingsModalRedirect` shims into one canonical UI (`WebSettingsModal.tsx` wiring `@agiworkforce/ui`'s `SettingsModal` shell to `features/settings/sections/*`) — that architecture is deliberate and documented in `app/settings/layout.tsx` itself. The gap is narrower but real: two route folders (`byok`, `sync`) are genuine standalone pages with **zero equivalent in the modal and zero in-app link pointing at them** — orphaned settings, not duplicated ones. A third (`voice`) had the same problem until a same-day fix (`VoiceSection.tsx`, currently untracked in git status) mirrored it into the modal.

Account deletion is duplicated and has already drifted in a way that matters: `AccountSection.tsx` and `PrivacySection.tsx` both independently implement "Delete account" against the same endpoint, but only one of the two copies signs the user out afterward. A third, dead copy in `UserSettings.tsx` hits a _different_ endpoint entirely and would reintroduce a "deleted my account" message for an operation that actually only deletes data and keeps the login working, if that page were ever wired back up.

---

## 1. Primary nav rail

### 1a. The extraction is complete for its original two targets — VERIFIED

`apps/web/shared/components/layout/app-nav-items.ts` (untracked / new file per `git status`) exports `APP_NAV_DESTINATIONS` (8 entries: Chat, Code, Projects, Artifacts, Library, Tasks, Schedules, Customize) and `buildAppNavItems()`. Both original offenders now call it:

- `apps/web/features/chat/pages/WebChatPage.tsx:119` imports `buildAppNavItems`; used at `WebChatPage.tsx:3941-3949`. Comment at 3937-3940 documents the prior drift ("missing Tasks entirely, and hardcoded `isActive: true` for Chat").
- `apps/web/shared/components/layout/WebAppShell.tsx:47` imports it; used at `WebAppShell.tsx:256-267`. Comment at 253-255 confirms the same history.

Both call sites correctly route the `Customize` destination through `openSettings('general')` rather than `router.push('/settings/general')`, respecting the CRIT-008 constraint documented in `apps/web/__tests__/settings-navigation-loops.test.ts` (routing to a `SettingsModalRedirect` unmounts whatever page the shell wraps). **Verdict for this pair: DRIFT, now RESOLVED.**

### 1b. A third, independently-coded nav model is live at `/chat/code` — CONFIRMED DUPLICATE, DRIFTED

`apps/web/features/chat/v3/WebSidebar.tsx` defines its own nav model, completely separate from `app-nav-items.ts`:

```
apps/web/features/chat/v3/WebSidebar.tsx:93-115  navItemsForMode(mode)
apps/web/features/chat/v3/WebSidebar.tsx:119-125  RAIL_ITEMS (collapsed-state icons)
apps/web/features/chat/v3/WebSidebar.tsx:200-218  handleNavClick / viewMap
```

This is not dead code. `apps/web/features/code/CloudCodePage.tsx:29` imports `WebSidebar` directly and renders it as the **entire** left-hand navigation for the page (`CloudCodePage.tsx:274-287`, `<div className={styles['sidebar']}><WebSidebar mode="code" .../></div>`) — it does not wrap itself in `WebAppShell`. `CloudCodePage` is mounted at `app/chat/code/page.tsx`, which is exactly the route `app-nav-items.ts`'s "Code" destination points at (`href: '/chat/code'`, `app-nav-items.ts:88`). So the path is: click "Code" on the canonical 8-item rail → land on a page whose nav is governed by a second, hand-rolled model.

The drift is concrete, not cosmetic:

- **Expanded state, `mode='code'`** (`WebSidebar.tsx:103-108`): `navItemsForMode` returns exactly two items — "Desktop app" and "VS Code extension." No Projects, Artifacts, Library, Tasks, Schedules, or Customize link exists anywhere in the expanded view. The mode switcher at the top (`WebSidebar.tsx:291-295`) only toggles between Chat and Code — there is no way back to Projects/Library/Tasks/Schedules without first navigating to `/chat`.
- **Recents list is also suppressed in code mode** (`WebSidebar.tsx:448`, `mode !== 'code'` guard) — consistent with the sparse-by-design intent, but it compounds how little of the app is reachable from this screen.
- **Collapsed state shows MORE than expanded state**: `RAIL_ITEMS` (`WebSidebar.tsx:119-125`, rendered unconditionally by mode at `WebSidebar.tsx:528-565`) always renders Projects, Artifacts, Schedules, Customize, and Settings — regardless of `mode`. So collapsing the code-page sidebar surfaces five links that the expanded state hides. A collapsed rail showing a superset of the expanded rail is a self-inconsistency inside this one file, independent of any cross-file comparison — direct evidence the two lists (`navItemsForMode('code')` and `RAIL_ITEMS`) were maintained by hand and not kept in sync with each other, let alone with `app-nav-items.ts`.
- **The collapsed "Settings" icon is mislabeled behavior**: `RAIL_ITEMS` id `'settings'` maps through `viewMap['settings'] = 'voice-settings'` (`WebSidebar.tsx:210`) → `resolveWebViewRoute('voice-settings')` = `/settings/voice` (`WebShellV3.tsx:38`). A generic gear icon captioned "Settings" takes the user straight to the Voice sub-page, not general account settings — a plausible copy/paste artifact of maintaining a second view-routing table alongside the real one.

**Verdict: DRIFT (live).** `WebSidebar`'s per-mode nav model duplicates the _intent_ of `app-nav-items.ts` (primary destinations for the signed-in app) but was never updated to match it, and has already diverged from itself between its own collapsed/expanded states.

**Recommendation:** `CloudCodePage` should render inside `WebAppShell` (or `WebSidebar`'s `navItemsForMode('code')`/`RAIL_ITEMS` should be deleted and replaced with `buildAppNavItems`) so `/chat/code` shows the same 8-destination rail as every other signed-in screen. I have not made this change — it is a real product decision (the code page's sidebar is deliberately narrower/session-focused today) and not something to silently rewrite; flagging with concrete evidence per the task's "do not guess" instruction.

### 1c. `WebShellV3`'s chat/work-mode path — DEAD, not currently a live risk

`WebSidebar` also has `chat` and `work` mode branches (`WebSidebar.tsx:94-102, 109-114`) whose nav items route through `WebShellV3.tsx`'s `VIEW_ROUTES` map (`WebShellV3.tsx:31-43`), which sends `artifacts` → `/gallery` (`WebShellV3.tsx:33`) — the exact "wrong, out-of-shell" destination the `app-nav-items.ts` header comment (lines 108-112) explicitly documents fixing for the canonical rail (`/chat/artifacts`, not `/gallery`).

This _looks_ like the same class of bug reaching a second surface, but tracing importers shows it is not currently reachable:

- `WebShellV3` (the component, not just `resolveWebViewRoute`) is only rendered by `apps/web/features/chat/pages/UnifiedChatPage.tsx:63`.
- `UnifiedChatPage` has exactly two importers repo-wide: its own test (`UnifiedChatPage.tsx` itself) and `apps/web/features/chat/pages/__tests__/chat-route.test.tsx`, which mocks it out entirely (`vi.mock('@features/chat/pages/UnifiedChatPage', ...)`, `chat-route.test.tsx:36-38`) while asserting the real `/chat` route renders `WebChatPage` via `WebChatRoot` (`apps/web/features/chat/components/WebChatRoot.tsx:18,51`).
- No file under `apps/web/app/**` imports `UnifiedChatPage`.

**Verdict: DEAD_FORK.** `WebSidebar`'s `chat`/`work` nav branches and `WebShellV3`'s `VIEW_ROUTES` (including the stale `/gallery` artifacts route) are unreachable by any real user today. `CloudCodePage` only ever passes `mode="code"` (`CloudCodePage.tsx:278`) and only imports the standalone `resolveWebViewRoute` function from `WebShellV3.tsx`, not the component — so the code page cannot trigger the chat/work branches. **Risk if left alone:** none currently live, but the file is a landmine — if anyone ever re-wires `UnifiedChatPage` into a route (e.g. resurrecting a "v3" experiment), the stale `/gallery` artifacts route ships immediately, silently reintroducing the exact bug `app-nav-items.ts` was written to fix. Recommend deleting `UnifiedChatPage.tsx`/`WebShellV3.tsx`'s chat/work paths or updating `VIEW_ROUTES['artifacts']` to `/chat/artifacts` to match the canonical rail, whichever the team intends to keep.

### 1d. Mobile drawer — DELIBERATE platform split, not the extraction's concern

`apps/mobile/src/features/drawer/components/DrawerContent.tsx:57-110` defines its own nav array (`Chats`, `Projects`, `Library`, `Skills`, `Schedules`, `Remote`) using React Native routes (`/(app)/chats`, etc.) and RN-native drawer chrome. This is a separate app (`apps/mobile`), a separate framework, and cannot import `app-nav-items.ts` as-is (it imports `lucide-react`, a web icon package, and returns web `SidebarNavItem`/`onClick` handlers incompatible with RN navigation). **Verdict: DELIBERATE** (two platforms, genuinely different constraints) — consistent with the task's own example of what does _not_ count as bad duplication. Noted only for completeness: mobile's set has no "Code," "Artifacts," or "Tasks" entries, which may be a product-parity gap worth a separate ticket, but it is not evidence of accidental drift from a shared source — mobile never had one.

---

## 2. Settings: routes vs. modal

### 2a. Architecture — confirmed via source, not inferred

`apps/web/app/settings/layout.tsx:9-14` states the architecture directly: _"The actual settings UI is now the shared SettingsModal (packages/ui/ui) opened via SettingsModalProvider. Each child page under /settings/_ renders a SettingsModalRedirect that fires openSettings(section) and sends the user back to /chat with the modal open."\*

`apps/web/features/settings/components/SettingsModalRedirect.tsx` (full file read) does exactly that: on mount it calls `openSettings(section)` then `router.replace(returnTo)` (default `/chat`) and renders `null` (`SettingsModalRedirect.tsx:52-57`).

`packages/ui/ui/src/settings-modal/SettingsModal.tsx` (2,342 lines) is a **shared, cross-platform shell** — it is also imported by `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx` (confirmed by grep). `apps/web/features/settings/components/WebSettingsModal.tsx` (877 lines) is the web-specific wiring layer that binds that shell to real content from `features/settings/sections/*` (`WebSettingsModal.tsx:1-32` doc comment enumerates the wiring: general→GeneralSection, account→AccountSection, ... voice→VoiceSection, etc.). **Verdict: DELIBERATE** — shell package + per-app content wiring is a standard, intentional split (same pattern the task's own example calls out as fine), not a duplicate settings UI.

### 2b. Route-folder census — 24 folders checked, all-but-3 are pure shims

Read every `apps/web/app/settings/*/page.tsx` (17 files) directly:

| Route                                                                                                                                                                           | Implementation                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| account, archived, billing, capabilities, connections, deleted-chats, general, memory, notifications, privacy, reflect, safety, security, shared-links, team, time-focus, usage | `<SettingsModalRedirect section="…" />` only — confirmed shim, not duplicated content |
| profile                                                                                                                                                                         | `redirect('/settings/general')` — merge redirect, not a duplicate                     |
| skills                                                                                                                                                                          | `redirect('/skills')` — merge redirect, not a duplicate                               |
| byok                                                                                                                                                                            | **real standalone content**, no modal equivalent (§2c)                                |
| sync                                                                                                                                                                            | **real standalone content**, no modal equivalent (§2c)                                |
| voice                                                                                                                                                                           | real standalone content, **now also mirrored into the modal as of today** (§2c)       |

`_lib` is a helper directory (client fetch utilities for the preferences API), not a route.

### 2c. Settings that exist in only one place — CONFIRMED, this is the direct answer to "find any setting that exists in one but not the other"

**`/settings/byok`** (`apps/web/app/settings/byok/page.tsx`, full server component with its own header, status banner, and `EnvKeyStatusList`) has:

- No entry in `SECTION_TO_SEGMENT` / `WEB_SETTINGS_NAV_GROUPS` in `WebSettingsModal.tsx` (grepped for `byok`/`BYOK` in that file — zero matches beyond the file's own route).
- No entry in `packages/ui/ui/src/settings-nav.ts`'s `SETTINGS_NAV_GROUPS_WEB` (full list read at lines 279-305 — no `byok`/`models-keys` key present for the web group).
- No in-app `href`/`Link` pointing at `/settings/byok` anywhere in `apps/web` (grepped the whole app tree for the literal string; the only hits are the page's own file and its own internal `<Link href="/docs/byok-env">`). The public marketing page `/byok` (a different route, `app/byok/page.tsx`) is linked from many marketing pages, but `/settings/byok` itself is not linked from anywhere a signed-in user would see it.

**`/settings/sync`** (`apps/web/app/settings/sync/page.tsx`, full page describing cross-device sync status) has the identical shape of gap: no `WebSettingsModal.tsx` wiring, no `SETTINGS_NAV_GROUPS_WEB` entry, and grepping the app tree for `/settings/sync` finds only its own file, its own test, and unrelated `/api/settings/sync` backend-route hits.

Both pages are real, non-trivial, presumably-intentional content — not stubs — but a user can only reach either by already knowing the URL. **Verdict: UNCLEAR-leaning-DRIFT.** I can't tell from the code alone whether these were deliberately left out of the modal nav (e.g. "settings so rarely touched they don't need a nav slot") or simply forgotten when the modal became canonical — nothing in either file says which. What would settle it: ask the settings owner whether BYOK/env-key status and Sync status are meant to be nav-reachable; if yes, add `SettingsModalRedirect`-style entries to `SETTINGS_NAV_GROUPS_WEB` (or a link from an existing section, e.g. Privacy or Account) the way `voice` was just fixed.

**`/settings/voice`** was in the identical orphaned state until a same-day change: `apps/web/features/settings/sections/VoiceSection.tsx` is untracked in `git status` (brand new), and `WebSettingsModal.tsx` now imports it (`WebSettingsModal.tsx:66`) and injects a `voice` nav item via `WEB_SETTINGS_NAV_GROUPS` (`WebSettingsModal.tsx:186-216`) with an explicit comment explaining _why_ it's a web-only injection onto the shared array rather than an edit to `settings-nav.ts` directly — doing the latter would silently add a no-content "Voice" tab to Desktop Cloud's settings, which reuses the same shared array (`WebSettingsModal.tsx:187-196`, referencing `DESKTOP_CLOUD_SETTINGS_NAV`). This is exactly the "audit finding, then fixed with a documented reason" pattern the byok/sync gap is still missing. **This item: RESOLVED today, cited as evidence of what fixing byok/sync would look like.**

### 2d. A fourth, dead, pre-modal settings implementation — DEAD_FORK, self-documented

`apps/web/features/settings/pages/UserSettings.tsx` (584 lines) is a full alternate settings page (tabs, its own `useAllSettingsData`/`useUpdateProfile`/etc. hooks, its own delete-account handler — see §3). Its own header comment is unambiguous:

> "NOT MOUNTED BY ANY ROUTE. The reachable settings UI is the shared WebSettingsModal ... This full-page implementation predates that modal architecture ... Do not link to this page — it renders nowhere and will drift out of sync with the real settings surfaces." (`UserSettings.tsx:7-14`)

Confirmed by import search: no file under `apps/web/app/**` imports `UserSettings`; the only importers repo-wide are `SecuritySection.tsx` and `useSessionTimeout.ts`, both of which import unrelated named exports (`TwoFactor`/`ApiKeys` leaf components and a hook, not the page itself — verified these are separate items in the same directory tree, not the page component). **Verdict: DEAD_FORK**, correctly self-flagged by whoever wrote the comment. No action needed beyond eventual deletion; it is not presently misleading a user, only a future engineer who greps for "settings page" and finds two.

---

## 3. Destructive account/data flows

### 3a. "Delete account" — CONFIRMED live duplicate, CONFIRMED drift

Two independently-coded, currently-reachable implementations of full account deletion exist, both hitting `DELETE /api/user/delete-account`:

- **`AccountSection.tsx`** (Settings → Account): own state (`showDeleteDialog`, `deleteConfirmInput`, `isDeleting`, `deleteError`, `deleteSucceeded`, `deleteSuccessMessage` — `AccountSection.tsx:194-199`), own `handleDeleteAccount` using an `addCsrfHeaders()` helper (`AccountSection.tsx:201-228`), own confirm dialog (`AlertDialog`, `AccountSection.tsx:696-753`). Comment at line 193: _"Delete account (canonical, working flow on this surface)"_ — the word "canonical" here only claims canonical-_on-this-surface_, i.e. the author already knew there might be another copy elsewhere.
- **`PrivacySection.tsx`** (Settings → Privacy, "Danger zone"): separate state (`showDeleteConfirm`, `deleteInput`, `deleting`, `deleteError`, `deleteSuccess` — `PrivacySection.tsx:156-160`), separate `handleDeleteAccount` that fetches its own CSRF token by hand (`getCsrfToken()` + manual `x-csrf-token` header, `PrivacySection.tsx:305-326`), separate inline confirm UI (`PrivacySection.tsx:776-870`).

Both are wired into the same live modal (`WebSettingsModal.tsx:52,57` import both `AccountSection` and `PrivacySection`; both `account` and `privacy` are real nav entries in `SETTINGS_NAV_GROUPS_WEB`), so a signed-in user genuinely has two different UIs, in two different settings tabs, that each independently trigger the same irreversible operation.

**The drift is not hypothetical — it is already live:**

- `AccountSection.handleDeleteSuccessContinue` (`AccountSection.tsx:230-245`) calls `logout()` then `clerkSignOut({ redirectUrl: '/' })` — it actually signs the user out client-side after deletion.
- `PrivacySection.handleDeleteAccount` (`PrivacySection.tsx:305-326`) only sets `deleteSuccess = true` and shows a static message ("Account deletion scheduled... within 24 hours... email {CONTACT_EMAIL} to stop it," `PrivacySection.tsx:797-801`). **It never calls `logout()` or `clerkSignOut()` anywhere in the file.** A user who deletes their account from the Privacy tab is left in a fully-authenticated client session against a server-side account that is now scheduled for erasure, with no forced sign-out and no navigation away.

Neither flow has any test coverage (grepped all `.test.tsx` files under `apps/web` for `"Delete account"` / `handleDeleteAccount` / `delete-account` — zero hits), so nothing would catch this pair drifting further apart.

**Concrete drift-risk statement:** a fix applied to `AccountSection` (e.g., adding the sign-out-on-success behavior, changing the confirmation copy, adding analytics, fixing an edge case in error handling) will not reach `PrivacySection`, and vice versa — which is exactly what has already happened with the sign-out step.

**Verdict: DRIFT / REDUNDANT_COLLAPSE.** Same intent (delete the account), same backend endpoint, independently hand-coded twice, already diverged in observable behavior. Recommend collapsing to one implementation (a shared `useDeleteAccountFlow` hook or a single `<DeleteAccountDangerZone />` component rendered from both tabs, or simply cross-link one tab to the other the way `SecuritySection.tsx:147` already does for session management — "To review active sessions or sign out other devices, use \[Account]" — instead of re-implementing sessions there too). Not deleting anything myself here: both copies are live and reachable, so removing either without product sign-off on which UX (dialog+redirect vs. inline+no-signout) is correct would itself be a product decision, not a cleanup.

### 3b. A third, dead, differently-scoped "delete account" — evidence of what this duplication already cost

`UserSettings.tsx` (dead per §2d) has its own third `handleDeleteAccount` (`UserSettings.tsx:259-283`) — but it calls **`DELETE /api/user/data`**, not `/api/user/delete-account`. These are two genuinely different backend endpoints, confirmed by reading both route handlers:

- `apps/web/app/api/user/delete-account/route.ts:16-49` — full account deletion. Schedules erasure with a 24-hour grace window (`deletion_requested_at`/`deletion_scheduled_for`, consumed later by `/api/cron/purge-deleted-accounts`), and the response's own doc comment (lines 36-49) is explicit that no cancel endpoint and no confirmation email exist yet ("HONESTY CONTRACT").
- `apps/web/app/api/user/data/route.ts:16-52` — GDPR Article 17 data erasure that **explicitly retains the profile/auth account** (`eraseUserAccountData(userId, { retainProfile: true, scope: 'data' })`, `route.ts:192-195`, with an explicit comment: _"This endpoint erases application data but explicitly preserves the auth account... Use the separate expiring video fence; the account-purge flags belong only to DELETE /api/user/delete-account"_, lines 189-191).

Both share the same underlying erasure library (`lib/server/account-erasure.ts`) — that sharing is itself deliberate and well-documented (a `PER-24` comment in `delete-account/route.ts` explains the two paths used to disagree about _what_ "delete my data" meant until the shared inventory was extracted, `delete-account/route.ts:56-64`). So the backend is not duplicated logic — it is two distinct, intentionally-different operations (delete-everything-including-login vs. delete-data-keep-login) sharing a library. Good backend hygiene.

The problem is only that the dead `UserSettings.tsx` UI **mislabels the weaker operation as full account deletion**: its success toast says _"Account data deleted. You will be signed out"_ (`UserSettings.tsx:272`) and redirects to `/login` — for an endpoint that, per its own doc comment, does not touch the Clerk auth account at all. If this page were ever resurrected (e.g., linked from a new route by an engineer who finds it via search and doesn't read the header comment), it would present a call-to-action captioned "Delete account" that does not actually delete the account, immediately after a compliance-relevant confirmation flow, on the `compliance/dpdp` branch. **Verdict: DEAD_FORK, but flagging the semantic mismatch as the concrete reason not to resurrect this file without rewriting it** — it is not simply an old copy of the same feature, it is a stale UI over a different feature wearing the same label.

### 3c. Other destructive/account flows checked — not duplicated

- **Session revocation** (`DELETE /api/settings/sessions`, `AccountSection.tsx:101,140,163`): implemented once, in `AccountSection` only. `SecuritySection.tsx:147` explicitly tells the user to go to Account for this rather than re-implementing it — the cross-reference pattern the delete-account flows should have used. **DELIBERATE, single implementation.**
- **Export data** (GDPR Art. 20, `GET /api/user/data` → delegates to `/api/user/export`): implemented once, in `PrivacySection.tsx:216,704-738`. Not present in `AccountSection` or anywhere else. **Single implementation.**
- **Bulk "Delete all chats"**: implemented once, in `PrivacySection.tsx` only (`handleDeleteAllChats`, `PrivacySection.tsx:266-303`) — grepped the whole `apps/web` tree for `deleteAll`/`delete_all`/"Delete all chats" outside test files; only one hit. **Single implementation.**
- **Desktop account settings** (`apps/desktop/src/features/settings/AccountSettings.tsx`): grepped for any delete-account handling — none found. Desktop does not duplicate the web deletion flow; it is a different trust boundary (Desktop Cloud vs. Web) and simply doesn't implement this operation on that surface. **Not a duplicate** (nothing to collapse).

---

## Findings table

| #   | What                                                                                         | Copies                                                                             | Live copy                                                                            | Verdict                                   | Drift risk if left alone                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Primary nav rail definition                                                                  | `app-nav-items.ts` (canonical) vs. `WebSidebar.tsx` `navItemsForMode`/`RAIL_ITEMS` | Both — `app-nav-items.ts` via WebChatPage/WebAppShell; `WebSidebar` via `/chat/code` | DRIFT                                     | A rail change (new destination, reorder, relabel) made in `app-nav-items.ts` never reaches `/chat/code`; already missing 6 of 8 destinations there, and collapsed/expanded states of `WebSidebar` itself already disagree |
| 2   | Chat/work-mode nav path (`WebShellV3` `VIEW_ROUTES`, incl. stale `/gallery` artifacts route) | `WebShellV3.tsx`                                                                   | None — only reachable via dead `UnifiedChatPage`                                     | DEAD_FORK                                 | Zero today; reintroduces the exact `/gallery` bug `app-nav-items.ts` fixed if `UnifiedChatPage` is ever wired to a route again                                                                                            |
| 3   | Mobile drawer nav                                                                            | `DrawerContent.tsx` (RN) vs. `app-nav-items.ts` (web)                              | Both, different apps                                                                 | DELIBERATE                                | None — genuinely different platform/framework                                                                                                                                                                             |
| 4   | Settings UI (routes vs. modal)                                                               | `app/settings/*/page.tsx` (mostly) vs. `WebSettingsModal.tsx` + `sections/*`       | Modal is canonical; routes are shims                                                 | DELIBERATE                                | None — documented redirect-shim architecture                                                                                                                                                                              |
| 5   | `/settings/byok`, `/settings/sync`                                                           | Real standalone route content, no modal section, no in-app link                    | Route only                                                                           | UNCLEAR (orphaned, not proven accidental) | Users cannot discover these except by typed URL; unclear if intentional                                                                                                                                                   |
| 6   | `/settings/voice`                                                                            | Was route-only; now also in modal via `VoiceSection.tsx` (today)                   | Both, intentionally synced                                                           | DELIBERATE (just resolved)                | None — cited as the fix pattern for #5                                                                                                                                                                                    |
| 7   | Full-page settings implementation                                                            | `UserSettings.tsx` vs. `WebSettingsModal.tsx`+sections                             | Modal only                                                                           | DEAD_FORK (self-documented)               | None currently; confusion risk for future engineers                                                                                                                                                                       |
| 8   | "Delete account"                                                                             | `AccountSection.tsx` vs. `PrivacySection.tsx`                                      | Both — both are real modal tabs                                                      | DRIFT / REDUNDANT_COLLAPSE                | Already diverged: only `AccountSection` signs the user out post-deletion                                                                                                                                                  |
| 9   | "Delete account" (dead 3rd copy, different endpoint)                                         | `UserSettings.tsx` → `/api/user/data`                                              | Dead                                                                                 | DEAD_FORK                                 | Mislabels a weaker (data-only, keeps login) operation as full account deletion if resurrected                                                                                                                             |
| 10  | Session revocation, data export, bulk chat delete                                            | Each implemented once                                                              | Live, single copy                                                                    | N/A                                       | None found                                                                                                                                                                                                                |

---

## Files touched (read-only audit — no code changes made)

- `apps/web/shared/components/layout/app-nav-items.ts`
- `apps/web/features/chat/pages/WebChatPage.tsx`
- `apps/web/shared/components/layout/WebAppShell.tsx`
- `apps/web/features/chat/v3/WebSidebar.tsx`
- `apps/web/features/chat/v3/WebShellV3.tsx`
- `apps/web/features/code/CloudCodePage.tsx`, `apps/web/app/chat/code/page.tsx`
- `apps/web/features/chat/pages/UnifiedChatPage.tsx`, `apps/web/features/chat/pages/__tests__/chat-route.test.tsx`, `apps/web/features/chat/components/WebChatRoot.tsx`
- `apps/mobile/src/features/drawer/components/DrawerContent.tsx`
- `apps/web/app/settings/layout.tsx`, `apps/web/app/settings/page.tsx`, all `apps/web/app/settings/*/page.tsx`
- `apps/web/features/settings/components/SettingsModalRedirect.tsx`, `WebSettingsModal.tsx`
- `packages/ui/ui/src/settings-modal/SettingsModal.tsx`, `packages/ui/ui/src/settings-nav.ts`
- `apps/web/features/settings/pages/UserSettings.tsx`
- `apps/web/features/settings/sections/AccountSection.tsx`, `PrivacySection.tsx`, `SecuritySection.tsx`, `VoiceSection.tsx`
- `apps/web/app/api/user/delete-account/route.ts`, `apps/web/app/api/user/data/route.ts`
- `apps/desktop/src/features/settings/AccountSettings.tsx`, `DesktopCloudSettingsModal.tsx`
- `apps/web/__tests__/settings-navigation-loops.test.ts`

No live-browser verification was performed (dev server requests without an authenticated session cookie only return 307s to `/login`); all liveness conclusions above are from import-graph tracing (grep for importers, route-file mounts, and dead-code self-documentation), per the task's method.
