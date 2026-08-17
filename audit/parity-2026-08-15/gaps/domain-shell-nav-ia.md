# Domain audit: Shell + Navigation + Information Architecture

Commit `e15df56e3`, working tree clean. Domain key `shell-nav-ia`, id prefix `SHELL-NAV-IA`.

## Method and scope

This domain covers the application chrome across all six surfaces — web,
mobile, desktop (Tauri + Electron), CLI, and the two extensions — plus the
information-architecture question of what belongs in global nav vs. sidebar
vs. composer vs. settings vs. a directory vs. progressive disclosure.

`audit/ui-gaps.csv` already carries **~200+ rows in this exact territory**
(auth, sidebar, drawer nav, settings trees, workspace/pairing flows) across
its 341 rows, and `gaps/done-claim-verification.md` already re-verified 71
`Done` claims, three of which are shell/nav findings I would otherwise have
rediscovered independently (GAP-001 mobile Skills drawer removal, GAP-083
Desktop Connections/Connectors naming collision, GAP-210 cross-surface
pairing-instruction copy drift). Rather than re-litigate that ground, this
pass:

1. Verified the three specific "known leads" named in the brief, in source.
2. Independently re-derived GAP-001 / GAP-083 / GAP-210 before discovering
   they were already tracked (evidence below is my own, cross-checked
   against the tracker's).
3. Searched for genuinely new findings not present anywhere in the existing
   341-row tracker, using grep sweeps of the CSV for the topics I found.
4. Answered §26 (nav/sidebar/composer/settings/directory placement + click
   counts) as an analytical section, since that question has no existing
   tracker row to check against.

CLI (`apps/cli`) has **zero rows** in `ui-gaps.csv` — it was not covered by
the prior 341-row audit at all. I did a light pass (slash-command palette:
`/plan`, `/model`, `/resume`, `/theme`, `/doctor`, `/status`,
`/keybindings`) and found nothing alarming, but this is lower-confidence
coverage than every other surface in this report and should get a dedicated
pass in a future round. `extension-chrome`'s side panel is intentionally
un-chromed (vanilla-JS DOM, no settings/nav UI of its own — it deep-links to
the web app for settings, matching Claude in Chrome's own pattern of an
"App settings" external-link row rather than in-panel settings); I found no
nav defect there but also did not exhaustively verify it.

---

## 1. The three "known leads" — verified

### 1a. "3 sign-in routes and 3 sign-up routes" — **verified as NOT a bug**

The route sweep (`web-route-sweep-findings.md` Finding 1) is technically
correct that 15 auth URLs return HTTP 200 with no visible redirect chain in
a `curl` trace, but this is a sweep-methodology artifact, not a product
defect. Reading every file in the cluster:

| Route                                                                                                                                            | What it is                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`, `/signup`                                                                                                                              | The two real, canonical Clerk screens                                                                                                                                                                                                                                         |
| `/sign-in` → `/login`, `/sign-up` → `/signup`, `/register` → `/signup`, `/auth/login` → `/login`                                                 | Documented `redirect()` aliases — `apps/web/app/sign-in/page.tsx:1-25` has an inline comment naming exactly which caller needs it (desktop's cloud-auth handoff opens `/sign-in?...`, matching Clerk's own default convention, while the actual Clerk page lives at `/login`) |
| `/device-auth` → `/auth/device`                                                                                                                  | Same pattern, own comment                                                                                                                                                                                                                                                     |
| `/login/complete`, `/signup/complete`                                                                                                            | Distinct post-auth terms-acceptance steps, not sign-in duplicates                                                                                                                                                                                                             |
| `/forgot-password`, `/auth/reset-password`, `/auth/update-password`, `/auth/error`, `/auth/chrome-extension`, `/verify`, `/connect/[deviceType]` | Distinct, non-overlapping steps in password-recovery / device-pairing / verification flows                                                                                                                                                                                    |

`redirect()` in Next.js issues a 307; a `curl -L`-following sweep reports
the _final_ URL's 200 and silently absorbs the redirect, which is exactly
what produced the sweep's "none redirects to a single canonical
implementation" claim. There are **two** live sign-in/sign-up
implementations, not three, and every alias exists for a named, real
external caller. **No gap filed.** (See `web-frontend.md` §1.1 for the full
per-file trace, independently corroborated by directly reading
`sign-in/page.tsx` and `register/page.tsx` myself.)

### 1b. "/tasks renders the authenticated shell unauthenticated while /chat/schedules is gated" — **verified as a real, source-level bug**

Confirmed at the source, not just via the live sweep. `apps/web/proxy.ts:145-152`:

```ts
const isProtectedAppRoute = createRouteMatcher([
  '/chat(.*)',
  '/library(.*)',
  '/schedules(.*)',
  '/settings(.*)',
  '/billing(.*)',
  '/admin(.*)',
]);
```

`/chat/schedules` is gated only because it also matches `/chat(.*)` —
`/tasks` matches nothing in this list, so the sign-out redirect at
`proxy.ts:232-234` never fires for it, and `WebAppShell.tsx` (which wraps
both routes) has zero auth logic of its own to fall back on. This is
**SHELL-NAV-IA-001** below — see the gap table.

### 1c. "Desktop settings has adjacent tabs named 'Connections' AND 'Connectors'" — **verified, and already tracked**

Confirmed in `packages/ui/ui/src/settings-nav.ts:149-161`: two real,
differently-wired tabs — `Connections` (mobile-companion device pairing)
and `Connectors` (MCP/OAuth integration catalog) — three list positions
apart, sharing a near-identical name. I independently re-derived this
before discovering `done-claim-verification.md`'s GAP-083 had already found
it while investigating an unrelated claim. See **SHELL-NAV-IA-002**.

---

## 2. Current nav structure by surface (as verified in source)

| Surface                          | Primary nav (verified file)                                                                                            | Structure                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                              | `apps/web/shared/components/layout/WebAppShell.tsx:242-304` (secondary shell) + `WebChatPage.tsx` (own sidebar wiring) | Chat, Code, Projects, Library, Tasks, Schedules, Customize — flat list, no grouping into "core" vs. "power-user"                                                                                                                                                                                                                        |
| Web sidebar (conversations)      | `packages/ui/ui/src/sidebar/Sidebar.tsx:1-320`                                                                         | Pinned section + temporal grouping (Today/Yesterday/This Week/…), collapsible groups, pinned + unpinned Projects sub-sections — genuinely on par with ChatGPT macOS's Pinned/Projects/Recents pattern                                                                                                                                   |
| Desktop (Tauri, Managed mode)    | `apps/desktop/src/features/v3/Sidebar.tsx:154-160`                                                                     | Library, Tasks, Scheduled, Customize                                                                                                                                                                                                                                                                                                    |
| Desktop (Tauri, Local/BYOK mode) | `apps/desktop/src/features/v3/Sidebar.tsx:168-179`                                                                     | Artifacts, Code, Design, Research, Automation, Tasks, Scheduled, Customize — richer, because Local-workspace-only capabilities (device-file code editing, an on-device canvas, a research swarm, workflow automation) simply don't exist in a Managed-Cloud session on _either_ Desktop or Web (see §5, "what I checked and ruled out") |
| Desktop (Electron/Cloud shell)   | `apps/desktop/electron/*`                                                                                              | No native nav of its own — it's a thin Chromium wrapper around the hosted web app in its default configuration (`apps/desktop/AGENTS.md` "one Desktop surface, two shells"); the fallback bundled renderer reuses the Tauri app's own `src/` tree                                                                                       |
| Mobile                           | `apps/mobile/src/features/drawer/components/DrawerContent.tsx:62-100`                                                  | Chats, Projects, Library, Schedules (cloud), Remote, + conditional AGI Work — `expo-router/drawer`, no bottom tab bar (the legacy `Tabs` bar is explicitly hidden, kept only for route compatibility)                                                                                                                                   |
| Extension (Chrome)               | side panel (`apps/extension/src/features/side-panel/*`)                                                                | Chat-only composer + task history dropdown; Settings deep-links to the web app externally, matching Claude in Chrome's own pattern                                                                                                                                                                                                      |
| Extension (VS Code)              | `apps/extension-vscode/package.json:526-540`                                                                           | Standard activity-bar icon + webview sidebar, matching Claude Code's VS Code extension shape                                                                                                                                                                                                                                            |
| CLI                              | `apps/cli/src/command_registry.rs`, `apps/cli/src/repl/slash_commands.rs`                                              | Slash-command palette (`/plan`, `/model`, `/resume`, `/theme`, `/doctor`, `/status`, `/keybindings`, `/`) — not independently deep-audited this round (see Method)                                                                                                                                                                      |

---

## 3. §26 — what belongs where

**Global nav (sidebar, always visible):** the small set of destinations a
user returns to constantly — new conversation, search, the primary
work-surfaces (Chat/Code/Projects/Library/Tasks/Schedules), and one
settings entry point ("Customize"). Web and Desktop both get this right:
neither buries "New Chat" or "Search" a click deep, and both keep the list
short (6-8 items) rather than the ChatGPT macOS internal-build pattern of
14+ flat items (Sites/Scheduled/Hooks/Connections/Git/Environments/
Worktrees/Computer use/Appshots) that `cross-cutting-and-complaints.md`'s
own review calls out as approaching "Microsoft and Facebook" settings
complexity.

**Sidebar (secondary list within a nav destination):** conversation and
project lists, correctly implemented with pinned + temporal grouping
(`Sidebar.tsx` §2 above) — this is the right place for "recent" and
"pinned," and it already matches the competitive bar.

**Composer (point-of-use controls):** mode toggles that change what a
_single message or turn_ does — Research mode, Agent/AGI Work mode, code
execution, image/video generation, model + reasoning-effort picker — are
correctly kept in the composer footer (`ComposerFooter.tsx`, per
`web-frontend.md` §3.2) rather than promoted to global nav. This matches
Claude's own explicit design principle (shots-claude-web.md's "Notable
design decisions" #5: "a permission/approval-mode control is always
adjacent to the model picker in agentic contexts, never buried in a
settings screen") — a case where this repo's existing IA choice is already
correct and should **not** be changed to imitate ChatGPT's separate
Chat/Work mode-switch-as-navigation pattern, which `cross-cutting-and-
complaints.md` §6 documents as having shipped with an actual "Chat mode
went missing entirely on desktop" regression.

**Settings (durable, cross-session preferences):** correctly hosts Billing,
Usage, Security, Privacy, Notifications _preferences_, and — the choice
worth calling out explicitly — Skills/Connectors/Plugins. Putting the
integration catalog inside Settings → Customize rather than a bare top-level
sidebar item (as ChatGPT does with "Plugins") is a defensible, Claude-shaped
decision, not a gap: `/connectors` in this repo (`ConnectorsPage.tsx:65-
1100`) is a full directory page with search, category filter, and a
connected/ready/request-access tri-state filter — genuinely comparable
depth to Claude's dedicated "Directory" modal, just one settings-click
deeper than ChatGPT's sidebar-resident "Plugins" item.

**Directory (browse-and-install surfaces):** Skills, Connectors, Plugins
each get their own reachable page (`/skills`, `/connectors`, `/apps`) with
real search/filter — this is real depth, not a stub. The gap here is
narrow and cosmetic (SHELL-NAV-IA-007: these pages carry no distinct
`<title>`), not structural.

**Progressive disclosure:** the repo already uses this well in a few
places — the Local/BYOK-only nav richness (Artifacts/Code/Design/Research/
Automation) correctly disappears rather than showing broken/greyed
controls in Managed Cloud mode (verified: the panel-render conditions in
`DesktopShellV3.tsx:853-878` gate on the exact same `privacyMode` value the
nav-list function does, so there is no "visible but broken" state here —
see §5). Mobile's decision to fold "Artifacts" into "Library" rather than
ship a second, thumbnail-less grid (`DrawerContent.tsx:75-80`, explicit
2026-08-13 founder-decision comment) is a good, recent, self-aware
consolidation — a strength worth calling out, not a gap to fix by
re-adding a duplicate destination.

### Click-count table for common workflows

| Workflow                         | Web                                                         | Desktop                                                                                                                               | Mobile                                                                                               |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Start a new conversation         | 1 click (sidebar "New Chat")                                | 1 click                                                                                                                               | 1 tap (drawer footer pill, always visible)                                                           |
| Open global search               | 1 click (⌘K or sidebar search icon)                         | 1 click                                                                                                                               | Per-screen search field, not a single global overlay                                                 |
| Reach Settings                   | 1 click ("Customize")                                       | 1 click (account menu → Settings)                                                                                                     | 1 tap (drawer avatar → Settings sheet)                                                               |
| Reach the Skills catalog         | 2 actions (Customize → Skills tab, or direct `/skills` URL) | 2 actions (account menu → Apps & Extensions is actually Connectors, not Skills — Skills lives under Settings → Skills tab, 2 actions) | **0** — no path exists; screen built, unreachable (SHELL-NAV-IA-003)                                 |
| Switch Personal ↔ Team workspace | 1 click (account menu → workspace row)                      | **Not possible** (SHELL-NAV-IA-005)                                                                                                   | **Not possible** (SHELL-NAV-IA-005)                                                                  |
| Pair phone to control this Mac   | 1 click (Settings → Connections) then follow on-screen copy | —                                                                                                                                     | Copy names a destination ("Desktop Companion") that doesn't exist on this surface (SHELL-NAV-IA-004) |

---

## 4. Gaps found (new + re-confirmed prior-art)

| id               | severity | surface       | summary                                                                                                                                    | priorArtId |
| ---------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| SHELL-NAV-IA-001 | P1       | web           | `/tasks` renders the full authenticated shell to signed-out visitors — `isProtectedAppRoute` omits it                                      | — (new)    |
| SHELL-NAV-IA-002 | P2       | desktop-tauri | "Connections" and "Connectors" settings tabs share a near-identical name for unrelated features                                            | GAP-083    |
| SHELL-NAV-IA-003 | P1       | mobile        | Skills screen is fully built and completely unreachable — drawer entry was removed, nothing else links to it                               | GAP-001    |
| SHELL-NAV-IA-004 | P1       | cross-surface | Desktop's pairing instructions send the user to a Mobile destination ("Desktop Companion") that doesn't exist — the real label is "Remote" | GAP-210    |
| SHELL-NAV-IA-005 | P2       | cross-surface | Only Web has a Personal/Team workspace switcher; Desktop and Mobile have none, despite Team being a real shared feature                    | — (new)    |
| SHELL-NAV-IA-006 | P3       | web           | The lighter `WebAppShell` (Tasks/Library/Projects/Schedules) omits the free-plan upgrade nudge that `WebChatPage`'s shell shows            | — (new)    |
| SHELL-NAV-IA-007 | P3       | web           | `/skills`, `/connectors`, `/apps`, `/device-auth`, `/user` have no page-specific `<title>`                                                 | — (new)    |

Full evidence, current/expected state, and recommendations for each are in
`domain-shell-nav-ia.json`.

---

## 5. What I checked and ruled out (avoiding false positives)

- **Desktop nav richness (Artifacts/Code/Design/Research/Automation) missing
  from Web.** I initially suspected this was a cross-surface capability gap.
  Verified it is not: Desktop's _own_ Managed-Cloud nav (the mode Web is
  permanently in) excludes exactly the same five items
  (`Sidebar.tsx:154-160` vs. `:168-179`), and the panel-render conditions in
  `DesktopShellV3.tsx:853-878` gate on `privacyMode === 'local'` precisely,
  not `!== 'managed'` — so there is no broken click path, and the
  richer nav is consistently a Local-workspace-only feature set on Desktop
  itself, not something Web is being denied that Desktop's own
  Managed-Cloud users get. No gap filed.
- **A hypothesized BYOK-mode broken-nav bug on Desktop.** The nav-list
  builder's type signature accepts `'local' | 'byok' | 'managed'`, which
  looked like it could produce a nav item (`design`/`research`/etc.) that
  then fails its stricter `=== 'local'` panel-render check. Traced
  `selectPrivacyMode` (`apps/desktop/src/stores/appModeStore.ts:174-176`)
  and found an explicit comment: "BYOK is deliberately absent here. It is a
  per-conversation `executionMode` inside the Local workspace... must never
  be inferred from global provider settings." The shell-level `privacyMode`
  never actually emits `'byok'` — it is always `'local'` or `'managed'`; the
  `'byok'` type-union member is vestigial in this function. No gap filed.
- **A hypothesized "no rich Skills/Connectors discovery surface" gap.** The
  Settings-modal section looked thin (no search bar, no badges). Checked
  the actual dedicated page (`/connectors` → `ConnectorsPage.tsx`) rather
  than only the modal section, and found full search + category filter +
  connected/ready/request-access tri-state filtering — genuinely
  comparable to Claude's Directory modal. No gap filed.
- **A hypothesized "no in-app notification center" gap.** Verified this
  repo has none (only per-category preference toggles in Settings →
  Notifications, plus a one-off browser-permission banner during long
  generations — `web-frontend.md` §2.6). But re-reading every shots-\*
  document, I found no evidence either competitor has an in-app
  notification bell/feed either — both vendors' "Notifications" settings
  pages are also just Push/Email preference toggles for an external
  delivery channel, not an in-product feed. Without competitor evidence,
  this would not be a benchmark gap; not filed, to avoid inventing a
  comparison the evidence doesn't support.

---

## Strengths (things this domain already does well)

- **Global search is broader than it looks.** `apps/web/app/api/search/
route.ts` indexes sessions, messages, projects, _and_ files in one query,
  plus recent/popular/suggestion endpoints — matching or exceeding
  ChatGPT's "Search chats, files, and projects" (shots-chatgpt-ios-shell-
  settings.md screen 078).
- **Sidebar pinning + temporal grouping** (`Sidebar.tsx`) is genuinely
  sophisticated — Pinned section, Today/Yesterday/This Week groups, and a
  parallel pinned/unpinned split for Projects — on par with ChatGPT
  macOS's Pinned/Projects/Recents sidebar.
- **The web workspace switcher** (`WorkspaceMenuItems.tsx`) is a complete,
  correct Personal/Team picker with live-selection state — better than what
  I found any competitor screenshot showing (neither ChatGPT nor Claude's
  captured account rows show an in-place org switcher).
- **Auth-alias hygiene is actually good**, not the mess the raw HTTP sweep
  suggested — every non-canonical `/sign-in`, `/sign-up`, `/register`,
  `/auth/login` route is a documented, single-purpose redirect with an
  inline comment naming its real caller (§1a).
- **Honest unavailability labeling.** The connector catalog correctly shows
  `'Not yet available on web'` rather than a Connect button that 501s
  (`WebSettingsModal.tsx:180-203`), and mobile's connector screen shows the
  same honest "Coming soon" for the 19/21 providers not yet wired
  server-side — exactly the pattern CLAUDE.md asks for ("a validated
  parameter no caller can send" is a failure; an honestly-labeled
  not-yet-available control is not).
- **Desktop's own IPC/nav-parity test discipline.** `Sidebar.navParity.
test.tsx` exists specifically because the team already caught one nav
  drift bug (collapsed rail missing Scheduled in Local mode) and wrote a
  regression test for the _class_ of bug, not just the instance — this is
  exactly the kind of self-correcting engineering discipline that makes
  future shell/nav audits find fewer real defects over time.

## What NOT to copy from the benchmark

- **Don't collapse Chat into a secondary mode behind Work/Codex**, the way
  ChatGPT's rebuilt macOS app reportedly did (`cross-cutting-and-
complaints.md` §6: "Chat mode went missing entirely on desktop for some
  users... how can a product called ChatGPT not default to chat mode?").
  This repo's Chat nav item is always present and never conditionally
  hidden behind another mode — keep it that way.
- **Don't chase ChatGPT's flat, ungrouped 16-item web settings list** just
  to look more feature-dense; this repo's Settings groups (Personal /
  Product / Desktop app-only where relevant) are already closer to Claude's
  more legible grouped rail than to ChatGPT's flat one.
- **Don't add a sidebar-customize toggle modal purely to imitate Claude's
  "Customize sidebar"** (GAP-258, already tracked as Open/lower priority) —
  this repo's nav lists are short enough (6-8 items) that hide/show
  customization solves a problem Claude has (14+ item Code-tab rail) that
  this repo doesn't yet have.
