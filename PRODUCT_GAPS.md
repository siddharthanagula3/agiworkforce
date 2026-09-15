# Product gaps

Status: Current
Owner: Founder + platform lead
Last updated: 2026-09-14

The single product completeness register: what separates the shipped AGI
Workforce surfaces from a polished production assistant. It records the gap
between "implemented" and "production quality" across Web, Mobile, Desktop,
Chrome, VS Code and CLI, ranked, grouped by root cause, and ordered for
execution.

This file holds product findings and the plan to close them. It does not hold
row identity for anything another register already owns. Four registers stay
authoritative for their own rows because code, tests and CI cite their IDs:

| Register                            | Holds                                    | Enforced by                                 |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------- |
| `ACTIVE_ISSUES.md`                  | `AGI-*` root causes and the defect plan  | `check:doc-registry`, `check:doc-freshness` |
| `docs/agent-context/known-flaws.md` | one row per open defect, cited by ID     | PR template, `ci.yml`, tests                |
| `audit/ui-gaps.csv`                 | `GAP-*` reference-parity rows, monotonic | `check:ui-gaps`                             |
| `audit/capability-gaps.csv`         | `CAP-*` capability backlog               | `check:capability-gaps`                     |

An ID from one of those registers in this file is a pointer. The row it names
is authoritative and its evidence must be re-read before acting. A finding
here with its own `PG-*` id is new as of this audit and is tracked here until
it is fixed or promoted into one of the registers above. A closed finding is
deleted, not archived; git carries the history.

## 0. Audit method and evidence tiers

Audit date 2026-09-14, on commit `7f51bd4e` of `main` plus this checkout.

- **Runtime, verified on a binary**: the CLI was built (`cargo build -p
agiworkforce-cli`, 3m26s) and exercised with a throwaway home: help, misuse,
  auth, network loss through a dead proxy, resume, fork, JSON output, plugin
  and approvals listing, the npm wrapper. Every CLI finding below marked
  "runtime" was observed, not read.
- **Runtime, verified in a browser**: the web app ran on `:3100` with
  placeholder Clerk and database credentials, so only signed-out routes could
  be driven. Verified there: every alias route redirects, protected routes
  redirect to `/login?redirectTo=`, `/nonexistent` is a 404 with the marketing
  chrome, the command palette opens on `/pricing` for a signed-out visitor and
  offers "Go to Billing", "Switch AI Model" and every app destination, `/faq`
  renders no disclosure widgets, `/pricing`, `/help` and `/download` have no
  horizontal overflow at 375px, and `/dev/landing-preview` serves in
  development without the guard its three siblings carry.
- **Runtime, unit tests**: `apps/web/shared/components/__tests__/theme-contrast.test.ts`
  passes (270 cases). That test reads CSS custom properties only; it is blind
  to Tailwind palette literals, which is the whole of `PG-SHARED-01`.
- **Static, traced**: everything else. Each finding was traced from the
  control to its handler, store, API route and error path, and marked
  "Hypothesis" wherever the live effect was inferred rather than followed.
- **Not possible here**: a signed-in web session, a desktop build, a device or
  simulator, a Chrome or VS Code extension host, and a live provider turn.
  The "Verification" line of each finding says what a live run must show.

Ten scoped passes fed this file: web shell and navigation, web chat, web
settings and billing and projects and connectors, shared primitives and
accessibility and theme, desktop, mobile, Chrome and VS Code, CLI, a scripted
dead-UI scan, and a reconciliation of the existing registers. Every finding
was re-read against current source by the lead before it was kept.

## 1. Product completeness matrix

Legend: ✅ verified production-ready (runtime evidence) · 🟡 partial or minor
gaps · 🔴 broken or missing · ⚪ not applicable · ? not verified at runtime.
Static-only evidence never earns ✅ where a runtime check is reasonably
possible, so most web cells are 🟡 or ? even where the source reads well.

| Area           | Web | Mobile | Desktop | Chrome | VS Code | CLI |
| -------------- | --- | ------ | ------- | ------ | ------- | --- |
| Navigation     | 🟡  | 🟡     | 🟡      | 🟡     | 🟡      | 🟡  |
| Chat           | 🟡  | 🟡     | 🟡      | 🟡     | 🟡      | 🟡  |
| Search         | 🔴  | 🟡     | ?       | 🟡     | 🟡      | ✅  |
| Loading states | 🟡  | 🔴     | ?       | 🔴     | 🟡      | ✅  |
| Empty states   | 🟡  | 🟡     | ?       | 🔴     | 🟡      | 🟡  |
| Errors         | 🟡  | 🔴     | 🟡      | 🟡     | 🟡      | 🟡  |
| Offline        | 🟡  | 🟡     | 🟡      | 🟡     | ?       | 🟡  |
| Accessibility  | 🟡  | 🟡     | 🔴      | 🟡     | ?       | 🟡  |
| Files          | 🟡  | 🟡     | ?       | 🟡     | ?       | ⚪  |
| Projects       | 🟡  | 🔴     | ?       | ⚪     | ⚪      | ⚪  |
| Models         | 🟡  | 🟡     | 🔴      | ?      | 🟡      | 🔴  |
| Tools          | 🟡  | ?      | ?       | 🔴     | 🟡      | 🔴  |
| Connectors     | 🟡  | 🔴     | 🔴      | ⚪     | ⚪      | ?   |
| Billing        | 🟡  | 🟡     | 🟡      | ⚪     | 🟡      | ?   |
| Settings       | 🟡  | 🔴     | 🟡      | 🟡     | 🔴      | 🟡  |
| Theme          | 🟡  | ?      | 🔴      | ✅     | 🟡      | 🟡  |
| Keyboard       | 🔴  | ⚪     | 🟡      | 🟡     | 🟡      | ✅  |

Cell notes, by column:

- **Web**: Search 🔴 because the documented ⌘K search cannot fire and the
  palette never searches (`PG-WEB-02`, `PG-WEB-03`). Keyboard 🔴 because the
  shortcut set is inert on every shell route except `/chat` (`PG-WEB-01`).
- **Mobile**: Loading, Errors, Projects and Settings 🔴 for invisible failure
  (`PG-MOB-01` to `PG-MOB-04`, `PG-MOB-08`). Connectors 🔴 by
  `CUSTOM-CONNECTORS-DESKTOP-MOBILE-GAP-01`.
- **Desktop**: Accessibility and Theme 🔴 for the literal-colour and
  reduced-motion debt with no guard (`PG-SHARED-01` to `PG-SHARED-04`,
  `PG-SHARED-07`); Models 🔴 for the vanishing local-model section
  (`PG-DESK-05`); Connectors 🔴 by `CUSTOM-CONNECTORS-DESKTOP-MOBILE-GAP-01`.
- **Chrome**: Loading and Empty 🔴 for the runs panel painting both at once
  (`PG-CHROME-05`, `PG-CHROME-06`); Tools 🔴 for three dead context-menu
  items (`PG-CHROME-01`, `PG-CHROME-02`). Theme ✅: the token emitter handles
  light, dark and forced colours, and it is the only surface with zero literal
  colour classes.
- **VS Code**: Settings 🔴 for the memory copy that contradicts where memory
  now lives (`PG-VSCODE-01`).
- **CLI**: Models 🔴 for resume swapping provider (`PG-CLI-01`); Tools 🔴 for
  the approvals mock (`PG-CLI-03`). Search, Loading and Keyboard ✅ from the
  runtime pass.

## 2. Micro-polish matrix

| Pattern            | Coverage                                                                                                               | Problems                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search / Cmd+K     | Web command palette, web `GlobalSearchDialog`, desktop palette and search modal, Chrome history search, CLI `--search` | Web ⌘K is claimed twice and the search dialog has no key; palette filters five recents; palette live for signed-out visitors (`PG-WEB-02..04`, `PG-WEB-11`)                                                     |
| Undo               | None anywhere                                                                                                          | Zero undo affordances repo-wide; confirm dialogs are the only safety net (`PG-SHARED-06`)                                                                                                                       |
| Empty states       | Primitive exists; adopted in web, desktop, unified-chat, mobile                                                        | Several surfaces render empty for a failed load (`PG-WEBSET-03`, `PG-MOB-03`, `PG-CHROME-05/06`, `PG-VSCODE-03`); `agi plugin list` prints nothing (`PG-CLI-07`)                                                |
| Skeletons          | `app/chat/loading.tsx` real; `Skeleton` in 12 web and 12 desktop files                                                 | Root and settings `loading.tsx` are bare spinners; mobile Chats and Projects lists have none (`PG-WEB-17`, `PG-MOB-04`)                                                                                         |
| Drag/drop          | Web composer overlay, unified-chat `ChatInput`, Electron folder drop                                                   | Tauri sets `dragDropEnabled: false`; desktop `FileDropZone` is unreachable (`PG-DESK-DEAD`)                                                                                                                     |
| Autosave           | Web settings 400 ms debounce with unmount flush                                                                        | Full name is the one field on its pane that needs explicit Save and is discarded on close; flush failures swallowed (`PG-WEBSET-02`)                                                                            |
| Offline            | Web `OfflineIndicator`, mobile `OfflineBanner` + queue, Electron `did-fail-load` page                                  | Web chat has no proactive offline state or reconnect retry (`PG-CHAT-10`); Electron retry always lands on `/chat` (`PG-DESK-14`); no toast on Chrome                                                            |
| Focus rings        | Global `:focus-visible` on web and desktop                                                                             | 159 `outline-none` sites not individually checked (unverified)                                                                                                                                                  |
| Dark mode          | Blocking init script on web, `next-themes`, desktop theme settings, Chrome auto tokens, VS Code vars                   | ~2,700 Tailwind palette literals with no guard; light-theme failures in shared `ActionLogTimeline` (`PG-SHARED-01/02`)                                                                                          |
| Hover states       | Present throughout                                                                                                     | Web message actions are hover-only on touch for user and older assistant turns (`PG-CHAT-05`)                                                                                                                   |
| Sticky elements    | Sticky composer, virtualised transcript                                                                                | Web shell remounts per page so the rail loses state (`PG-WEB-06`)                                                                                                                                               |
| Scroll helpers     | Scroll-to-bottom on web and mobile                                                                                     | No new-message indicator (`PG-CHAT-08`); retry viewport jump (`AGI-20`, fixed on main, unobserved)                                                                                                              |
| Copy controls      | 46 independent implementations                                                                                         | Five with no failure path; no announcement in most; no shared primitive (`PG-SHARED-08`)                                                                                                                        |
| Help / FAQ         | `/help` from the account menu; `/faq` and `/support` from the marketing footer                                         | `/faq` is a flat page with no disclosure (verified in the browser); Support is not in the account menu (`PG-WEB-20`)                                                                                            |
| Progress           | Streaming, tool timeline, mobile model download                                                                        | No per-file upload progress anywhere; batch fails on first error (`PG-CHAT-03`); Electron update flow has no states (`PG-DESK-12`)                                                                              |
| Confirmations      | `useConfirmAction` on web (24) and unified-chat (4)                                                                    | Zero desktop adopters, seven global `confirm()` sites, one fails open; a second confirm primitive exists (`PG-SHARED-05`); project delete names no consequence (`PG-WEBSET-12`)                                 |
| Dates              | `packages/platform/utils/src/format.ts`                                                                                | `formatRelativeTime` pinned to English; three desktop re-implementations; billing hardcodes `en-US`; no timezone on instants (`PG-SHARED-11`, `PG-WEBSET-09`)                                                   |
| Support            | Support widget, `/support`, `/contact`                                                                                 | One hop further than the account menu (`PG-WEB-20`)                                                                                                                                                             |
| Success states     | Status lines on settings panes, toasts                                                                                 | Sidebar rename/pin/archive failures are silent, so "no change" reads as success (`PG-WEB-07`); mobile generation failure clears the composer (`PG-MOB-01`)                                                      |
| Error states       | Boundaries never leak stacks (verified); `network-error.ts` sanitiser is real                                          | Missing `error.tsx` on every signed-in shell route except `/chat` and `/billing` (`PG-WEB-16`); raw strings in dictation, mobile local runtime, Chrome page context (`PG-CHAT-06`, `PG-MOB-06`, `PG-CHROME-09`) |
| Disabled states    | Send-disabled reasons shown in the web composer                                                                        | Permanently disabled decorative controls in the shared Library composer (`PG-SHARED-10`)                                                                                                                        |
| Tooltips           | Radix tooltip primitive, shortcut labels in menus                                                                      | Account menu advertises ⌘/ on routes where it does nothing (`PG-WEB-01`)                                                                                                                                        |
| Keyboard shortcuts | One registry on web, desktop shortcut catalogue, VS Code keybindings, CLI REPL                                         | Web registry inert off `/chat`; VS Code Escape rejects a far-away diff unconfirmed (`PG-VSCODE-02`); Chrome `capture_page` unbound (`PG-CHROME-10`)                                                             |
| Responsive         | `Dialog` width is viewport-relative; public pages clean at 375px (verified)                                            | `100vh` in the dialog primitive; no virtual-keyboard handling on web (`PG-SHARED-12/13`); iPad multitasking on with portrait lock (`PG-MOB-10`)                                                                 |
| Reduced motion     | Web blanket rule plus in-app toggle; `Spinner` primitive correct                                                       | Desktop has no blanket rule and 215 bare spinners; mobile 0 of 51 Reanimated components read `useReduceMotion` (`PG-SHARED-07`, `PG-MOB-07`)                                                                    |
| Retry / recovery   | Web stream error keeps the partial and offers Continue; mobile `SendErrorBanner`                                       | Stopped turn cannot Continue (`PG-CHAT-07`); Capabilities drops the `retrySave` its hook provides (`PG-WEBSET-10`); expired connector has no Reconnect (`PG-WEBSET-04`)                                         |
| Optimistic updates | Web send, project pin, settings toggles all roll back                                                                  | Sidebar row mutations roll back silently (`PG-WEB-07`)                                                                                                                                                          |
| Connection state   | Web banner, mobile banner, CLI bounded timeouts (runtime)                                                              | Mobile cloud-sync error state has no renderer (`PG-MOB-02`); CLI proxy failure reads "builder error" (`PG-CLI-12`)                                                                                              |
| Draft preservation | Web per-conversation drafts in memory; mobile `draftStore`; parked failed sends on web                                 | Web drafts and parked sends die on refresh (`PG-CHAT-04`); VS Code webview persists no state (`PG-VSCODE-05`); Electron ⌘N reloads the page (`PG-DESK-13`)                                                      |

## 3. Root causes: one fix, many symptoms

These are the shared corrections. Each names the symptoms it retires so the
execution order in section 12 can be read as a short list rather than a long
one.

| Root cause                                                                                                                       | Symptoms it closes                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **RC-1 Load failure rendered as empty.** Stores swallow the error and screens branch only on `length === 0`.                     | `PG-WEBSET-03`, `PG-WEBSET-11`, `PG-MOB-02`, `PG-MOB-03`, `PG-MOB-08`, `PG-CHROME-05`, `PG-CHROME-06`, `PG-VSCODE-03` |
| **RC-2 Failure channel has no consumer.** A state or callback is computed and nothing renders it.                                | `PG-WEB-07`, `PG-MOB-01`, `PG-MOB-02`, `PG-DESK-06`, `PG-DESK-07`, `PG-CHROME-01`, `PG-CHROME-02`                     |
| **RC-3 Two web shells.** `WebAppShell` is mounted per page and duplicates `WebChatPage`'s sidebar wiring.                        | `PG-WEB-01`, `PG-WEB-06`, `PG-WEB-08`, `PG-WEB-09`, `PG-WEB-15`, `PG-WEB-16`                                          |
| **RC-4 One chord, two owners.** ⌘K is captured by the palette while the shortcut registry documents it as search.                | `PG-WEB-02`, `PG-WEB-03`, `PG-WEB-11`                                                                                 |
| **RC-5 Attachment client is batch-in, throw-on-first.** No progress channel, no per-file result, a second validator on web.      | `PG-CHAT-01`, `PG-CHAT-02`, `PG-CHAT-03`                                                                              |
| **RC-6 Persist config omits user text.** `partialize` on the web store keeps model choice but not drafts.                        | `PG-CHAT-04`                                                                                                          |
| **RC-7 No colour guard where the colour debt is.** `check:no-hex-*` skips desktop, VS Code, `packages/ui` and `apps/web/shared`. | `PG-SHARED-01`, `PG-SHARED-02`, `PG-SHARED-03`, `PG-WEBSET-13`, `PG-WEB-18`, `theme-only-text-colours` ratchet 152    |
| **RC-8 Feedback primitive has no defaults.** `SonnerToaster` sets classNames only, so 290 error toasts inherit 4 s.              | `PG-SHARED-06`, plus every "error vanished" report                                                                    |
| **RC-9 Two confirmation primitives, desktop uses neither.**                                                                      | `PG-SHARED-05`, `PG-DESK-10`, `PG-WEBSET-12`                                                                          |
| **RC-10 Reduced motion is a per-site decision.** No blanket rule on desktop, no adoption on mobile.                              | `PG-SHARED-07`, `PG-MOB-07`, `PG-WEB-17`, `PG-WEBSET-13`                                                              |
| **RC-11 Electron shell drives the web app by URL, not by message.** New chat, settings, retry and Quick Ask all `loadURL`.       | `PG-DESK-03`, `PG-DESK-13`, `PG-DESK-14`, `PG-DESK-16`                                                                |
| **RC-12 Local model availability collapses to "not running".** One boolean carries five states.                                  | `PG-DESK-05`, `PG-DESK-06`                                                                                            |
| **RC-13 Copy that outlived the code it described.**                                                                              | `PG-VSCODE-01`, `PG-WEBSET-07`, `PG-DESK-04` (comment), `PG-CLI-02`, `VSCODE-CLOUDONLY-DESC-CONFLICT-01`              |
| **RC-14 Catalog membership used as validity.** Non-catalog local model ids are treated as invalid.                               | `PG-CLI-01`, and the same predicate shape behind `AGI-23`                                                             |
| **RC-15 Register rot.** Roughly one row in five cited by the parity CSV is stale, and 47 "Open" rows are decisions.              | Section 11                                                                                                            |

## 4. Web findings

Static unless the Evidence line says otherwise. Existing IDs are cited where
they overlap; none of the `PG-WEB-*` rows below duplicates an open `AGI-*`,
`GAP-*` or known-flaws row.

### [PG-WEB-01] Keyboard shortcuts are mounted only on the chat page but advertised on every shell

Severity: P2
Surface: Web
Area: Navigation / Keyboard
Status: Broken
Evidence: `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts:185` registers the only keydown listener; its sole caller is `apps/web/features/chat/pages/WebChatPage.tsx:4255`. `apps/web/shared/components/layout/WebAppShell.tsx` opens `KeyboardShortcutsDialog` from the account menu and `apps/web/shared/components/layout/AccountMenuItems.tsx:90` renders a ⌘/ hint there.
Reproduction: open `/chat/library`, press ⌘B, ⇧⌘O, ⌘/ or Escape.
Expected: app-level shortcuts work on every signed-in surface.
Actual: on `/chat/projects`, `/chat/library`, `/chat/schedules`, `/models` and `/tasks` all eight documented shortcuts are inert while the dialog listing them is one click away.
Root cause: verified. Hook is page-scoped, dialog is shell-scoped (RC-3).
Recommended fix: call `useKeyboardShortcuts` in `WebAppShell` with the handlers it already owns; the hook skips unhandled ids.
Shared impact: any future host of `WebAppShell`.
Verification: Playwright on `/chat/library`: ⌘B collapses the sidebar, ⌘/ opens the dialog.

### [PG-WEB-02] The documented "⌘K → Open search" shortcut cannot fire

Severity: P2
Surface: Web
Area: Keyboard / Search
Status: Broken
Evidence: `KEYBOARD_SHORTCUT_DOCS[0]` in `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts:24` is `open-search` on ⌘K. `apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:9` captures ⌘K on `document` in the capture phase and stops propagation. `apps/web/e2e/command-palette-global-shortcut.spec.ts:26` asserts the palette opens and the search dialog does not.
Reproduction: press ⌘K anywhere; open the shortcuts dialog and read the first row.
Expected: the dialog the user is told ⌘K opens is the one ⌘K opens.
Actual: no keyboard route to `GlobalSearchDialog` exists, and the per-shortcut disable switch offers to disable a binding that is not the one the key runs.
Root cause: verified (RC-4).
Recommended fix: retitle the registry entry to the palette and make the palette its owner, or give search its own chord and wire it.
Shared impact: `disabledShortcutIds` claims authority over a dead id.
Verification: unit test that every `KEYBOARD_SHORTCUT_DOCS` id has a live handler on the surface that renders the dialog.

### [PG-WEB-03] The command palette never searches; it filters five in-memory recents

Severity: P2
Surface: Web
Area: Search
Status: Partial
Evidence: `apps/web/shared/components/CommandPalette/CommandPalette.tsx:53` `RECENTS_LIMIT = 5`; `filtered` at `:233` is a client `includes` over static commands. No call to `/api/search`, no loading state, no result count. Placeholder reads "Search chats and actions" (`:350`); empty state reads "No commands found." (`:395`).
Reproduction: ⌘K, type a word from the sixth-oldest chat title.
Expected: the palette queries the server or offers a "Search all chats" row.
Actual: the chat is not found and the user is told no command matched.
Root cause: verified (RC-4).
Recommended fix: add a debounced group backed by `apps/web/features/chat/services/global-search-service.ts`, or a permanent row that opens `GlobalSearchDialog` in place rather than `router.push('/chat?search=true')`.
Shared impact: none.
Verification: a query matching only a non-recent conversation appears in the palette.

### [PG-WEB-04] The palette is live on marketing routes for signed-out visitors

Severity: P2
Surface: Web
Area: Navigation
Status: UX Gap
Evidence: runtime, verified in the browser on `:3100`: on `/pricing` signed out, ⌘K opens a dialog listing New chat, New task, Chat, Projects, Library, Models, Schedules, AGI Code, Go to Settings, Go to Billing, Search Conversations, Switch AI Model. `apps/web/app/providers.tsx:38` mounts `CommandPaletteProvider` under the root layout and the command list reads no session.
Reproduction: signed out, `/pricing`, ⌘K, choose "Go to Billing".
Expected: no palette for anonymous visitors, or a public command set.
Actual: every entry bounces through `proxy.ts` to `/login?redirectTo=`; "Switch AI Model" mutates a store the visitor cannot use.
Root cause: verified.
Recommended fix: gate the command groups on the session the shell already reads, keeping a public set (Pricing, Docs, Sign in).
Shared impact: none.
Verification: repeat the runtime step; no authenticated destination is listed.

### [PG-WEB-05] `/tasks` is unreachable from any signed-in surface, and "New task" lands on `/chat`

Severity: P2
Surface: Web
Area: Navigation
Status: Broken
Evidence: `apps/web/shared/components/layout/app-nav-items.ts:80` has no Tasks destination. The palette's `new-task` action pushes `/agi-work` (`CommandPalette.tsx:113`), which `apps/web/proxy.ts:191` rewrites to `/chat` whenever a session cookie is present. `apps/web/app/tasks/layout.tsx:14` auth-gates the page.
Reproduction: signed in, ⌘K, "New task".
Expected: a shipped, gated surface is reachable from the rail or the palette.
Actual: `/tasks` is bookmark-only; "New task" opens the chat page.
Root cause: verified.
Recommended fix: add a `tasks` destination (hideable) and point `new-task` at `/tasks`, or delete `/tasks` if AGI Work replaced it.
Shared impact: `WebChatPage` and `WebAppShell` consume the same array, one edit fixes both.
Verification: `buildAppNavItems` contains a `/tasks` href; e2e clicks it.

### [PG-WEB-06] The app shell is mounted per page, so the sidebar remounts on every navigation

Severity: P2
Surface: Web
Area: Navigation / Performance
Status: UX Gap
Evidence: `WebAppShell` is rendered inside `apps/web/app/chat/projects/page.tsx:166`, `apps/web/app/chat/projects/[id]/page.tsx`, `apps/web/app/tasks/page.tsx:14`, `apps/web/app/chat/library/page.tsx:8` and `apps/web/app/models/page.tsx`; `apps/web/app/chat/layout.tsx` carries only the stream runtime provider. Sidebar UI state is component-local in `packages/ui/ui/src/sidebar/Sidebar.tsx:150`.
Reproduction: expand a project, scroll the recents list, click Library.
Expected: a persistent shell that survives route changes.
Actual: groups re-collapse, expanded projects close, pagination resets, scroll jumps to top; only `sidebarCollapsed` survives.
Root cause: verified (RC-3).
Recommended fix: move `WebAppShell` into a route-group layout; long term converge `WebChatPage`'s sidebar onto it.
Shared impact: `useConversations` remounts per navigation too (`AGI-30` residual).
Verification: navigate between two shell routes and assert the sidebar instance is not remounted.

### [PG-WEB-07] Sidebar rename, pin, archive and move failures are silently discarded

Severity: P2
Surface: Web
Area: Navigation / Chat list
Status: Broken (misleading success)
Evidence: row mutations route to `updateConversation`, whose failure path is `setError(msg, id)` (`apps/web/lib/hooks/useConversations.ts:629`). `apps/web/shared/stores/web-chat-store.ts:1602` drops the error unless the id is the active conversation; on `WebAppShell` routes there is no active conversation and nothing renders the field. When it is active, the value is consumed as a turn failure (`WebChatPage.tsx:4694`).
Reproduction: 500 on `PUT /api/chat/conversations/<id>`, rename a non-active row.
Expected: a toast naming the failed action; the row reverts visibly.
Actual: nothing happens, which reads as "the click missed"; when it is the active row a failed rename is presented as a failed message.
Root cause: verified (RC-2).
Recommended fix: surface the failure from the sidebar handlers with `toast.error(toUserMessage(...))`, the pattern `handleProjectPin` already uses at `WebChatPage.tsx:3432`. Do not widen `setError`.
Shared impact: both web shells.
Verification: mock a non-OK PUT, rename a non-active row, assert a toast and an unchanged title.

### [PG-WEB-08] "Share" on a non-active conversation navigates instead of sharing

Severity: P3
Surface: Web
Area: Sharing
Status: Partial
Evidence: `WebChatPage.tsx:3853` opens the share dialog only for the displayed conversation and otherwise pushes the route; `WebAppShell` passes no `onShare`, so `packages/ui/ui/src/sidebar/SessionItem.tsx:298` hides the item there.
Expected: Share from any row opens the dialog for that row.
Actual: a navigation on `/chat`; no control on the other shell.
Root cause: verified (RC-3).
Recommended fix: let the share dialog take a conversation id and pass `onShare` from both hosts.
Shared impact: none beyond the two hosts.
Verification: row menu on a non-active chat, Share, dialog names that chat.

### [PG-WEB-09] Two shells expose different row menus and list affordances

Severity: P3
Surface: Web
Area: Navigation
Status: Inconsistent
Evidence: `WebAppShell.tsx:473` passes `onMarkUnread`; `WebChatPage.tsx:4936` does not. `WebChatPage.tsx:4920` passes `hasMoreSessions` and `onLoadMoreSessions`; `WebAppShell` omits them, so on `/chat/projects` the recents list stops at page one (gate at `Sidebar.tsx:800`).
Expected: one sidebar, one menu, one pagination behaviour.
Actual: "Mark unread" exists on one shell, "Show more" on the other.
Root cause: verified (RC-3).
Recommended fix: one shared handler factory; with `PG-WEB-06` the second copy disappears.
Verification: snapshot the row-menu item ids on both routes and assert equality.

### [PG-WEB-10] Primary nav entries are buttons, not links

Severity: P3
Surface: Web
Area: Navigation / Accessibility
Status: Accessibility
Evidence: `packages/ui/ui/src/sidebar/Sidebar.tsx:405` `defaultRenderNavLink` renders `<button>`; `renderNavLink` is never supplied by a web host. Conversation rows correctly use an href via `SessionItem`.
Expected: destinations are anchors: middle-click, ⌘-click, status-bar URL, prefetch.
Actual: `router.push` swallows the click.
Recommended fix: pass `renderNavLink` from both hosts rendering `next/link`, keeping `aria-current="page"`.
Shared impact: desktop consumes the same component; the prop is optional.
Verification: the rail renders `a[href="/chat/library"]`.

### [PG-WEB-11] No arrow-key navigation of results in `GlobalSearchDialog`

Severity: P3
Surface: Web
Area: Search / Accessibility
Status: UX Gap
Evidence: `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:371` handles Enter only; results are flat buttons with no listbox role or roving index. The palette implements this correctly at `CommandPalette.tsx:262` but lacks `scrollIntoView` past about seven rows.
Expected: ↑/↓ move a highlighted result, Enter opens it.
Actual: keyboard users tab through every result; Enter re-runs the query.
Recommended fix: port the palette's `selectedIndex` and `aria-activedescendant` pattern, adding `scrollIntoView({block:'nearest'})` in both.
Verification: e2e: type, ArrowDown twice, Enter opens the third result.

### [PG-WEB-12] The sidebar's window-level arrow-key handler stays armed while dialogs are open

Severity: P3
Surface: Web
Area: Keyboard
Status: UX Gap
Evidence: `Sidebar.tsx:298` binds ArrowUp/Down/Home/End/Escape/Enter on `window`, guarded by `isMenuPanelOpen()` only. Hypothesis on the end state: Radix focus scope pulls focus back, so the visible symptom is flicker plus a moved sidebar highlight.
Recommended fix: extend the guard with an open `[role="dialog"]` check, or bind to the list container.
Shared impact: shared `Sidebar` (desktop too).
Verification: browser spec, open the search dialog, ArrowDown, focus stays inside and the sidebar's focused row is unchanged. jsdom cannot prove this, per `.claude/rules/ui-colour-and-interaction.md`.

### [PG-WEB-13] `/dev/landing-preview` ships to production ungated

Severity: P3
Surface: Web
Area: Navigation / Hygiene
Status: Inconsistent
Evidence: `apps/web/app/dev/token-probe/page.tsx`, `apps/web/app/dev/renderer-probe/page.tsx` and `apps/web/app/dev/inline-toolcall-demo/page.tsx` guard with `NODE_ENV === 'production'` → `notFound()`. `apps/web/app/dev/landing-preview/page.tsx` has no such guard (zero `NODE_ENV` matches, verified) and `proxy.ts` does not match `/dev`.
Recommended fix: add the same guard and a unit test over the `app/dev` glob.
Verification: the test.

### [PG-WEB-14] `/403`, `/maintenance` and `/offline` have no producer

Severity: P3
Surface: Web
Area: Error states
Status: Missing (dead routes)
Evidence: nothing in `proxy.ts`, `public/sw.js` (which deliberately performs no offline caching) or any handler navigates to them; authorization failures go to `/session-expired` or `/login`. Verified in the browser that all three render when typed.
Recommended fix: wire `/maintenance` to an env flag in `proxy.ts`; register a service-worker navigation fallback to `/offline` or delete it; delete `/403` or route real 403s to it.
Verification: set the flag, request any route, assert the rewrite.

### [PG-WEB-15] In-app 404s render the marketing site; the in-shell not-found is orphaned

Severity: P3
Surface: Web
Area: Error states
Status: Inconsistent
Evidence: `apps/web/app/not-found.tsx` renders the marketing header and footer (verified in the browser on `/nonexistent-page-zzz`). The only in-app `notFound()` outside share is `apps/web/app/settings/[section]/page.tsx:33` and there is no `app/settings/not-found.tsx`, so a stale `/settings/appearance` link drops a signed-in user onto the marketing 404. `apps/web/app/chat/not-found.tsx` exists and nothing under `app/chat` or `features/chat` calls `notFound()`.
Recommended fix: an in-shell `not-found.tsx` under the settings and shell segments; wire or delete the chat one.
Verification: `/settings/appearance` signed in shows no marketing header.

### [PG-WEB-16] No `error.tsx` on any authenticated shell route except `/chat` and `/billing`

Severity: P3
Surface: Web
Area: Error states
Status: Missing
Evidence: 20 `error.tsx` files, all marketing or auth plus `app/chat/error.tsx` and `app/billing/error.tsx`; none for `/settings`, `/workspace`, `/admin`, `/code`, `/tasks`, `/models`, `/connectors`, `/upgrade`, `/chat/projects`. The root boundary is marketing-styled and replaces the shell. Boundaries print only `error.digest`; no raw message or stack (verified by reading all three).
Recommended fix: one in-shell `error.tsx` re-exported under the shell segments, built on `ChatFailureNotice`.
Verification: throw in a shell page; the sidebar survives.

### [PG-WEB-17] Root and settings `loading.tsx` hand-roll a spinner

Severity: P4
Surface: Web
Area: Consistency
Status: Inconsistent
Evidence: `apps/web/app/loading.tsx:6` and `apps/web/app/settings/loading.tsx:6` render a bare `animate-spin` div (with `role="status"` and `motion-reduce`, so a11y is intact). The rule names `Spinner`.
Recommended fix: `<Spinner aria-label="Loading…" />`.
Verification: grep under `apps/web/app/**/loading.tsx` finds no `animate-spin`.

### [PG-WEB-18] The offline banner is off the token system and prints the raw error

Severity: P3
Surface: Web
Area: Global chrome
Status: Inconsistent
Evidence: `apps/web/shared/components/OfflineIndicator.tsx:75` builds its palette from Tailwind literals, is absent from `theme-contrast.test.ts`, renders `state.error.message` verbatim at `:148`, carries an inert `bg-opacity-50` at `:172`, and ignores `--agi-consent-inset` which both shells honour. `apps/web/shared/` is outside the hex guard's `SRC_DIRS` (RC-7).
Recommended fix: status tokens, a contrast case, `toUserMessage`, and the inset.
Verification: contrast test case; render an error state and assert the friendly string.

### [PG-WEB-19] Sidebar load-failure state prints whatever string the host hands it

Severity: P4
Surface: Shared
Area: Navigation
Status: UX Gap
Evidence: `Sidebar.tsx:832` renders `{error}` under "Couldn't load conversations"; the prop is an untyped `string | null` that desktop also fills.
Recommended fix: drop the raw line or document the prop as already user-facing and assert it in the hosts.

### [PG-WEB-20] `/faq` has no disclosure interaction and Support is not in the account menu

Severity: P4
Surface: Web
Area: Help
Status: UX Gap
Evidence: runtime: `/faq` renders zero `<details>` (the six `aria-expanded` elements on the page are the marketing nav). `apps/web/app/faq/page.tsx:128` renders `NoteList`. `AccountMenuItems.tsx:81` routes "Get help" to `/help`; `/faq` and `/support` are footer-only.
Recommended fix: `<details>` per question with an id anchor; a Support entry in the account menu.

### [PG-CHAT-01] Zero-byte attachments pass the composer and fail the whole send with a generic message

Severity: P2
Surface: Web
Area: Chat / Composer
Status: Broken
Evidence: `apps/web/features/chat/hooks/use-attachments.ts:141` checks size-too-large and `:149` type only (verified: no zero-size branch). The shared `validateAttachmentMeta` in `packages/contracts/types/src/chat.ts:186` rejects empties first and `packages/ui/unified-chat/src/components/ChatInput.tsx:630` uses it. The presign schema `packages/contracts/cloud-contracts/src/chat-attachments.ts:126` is `.positive()`, so a 0-byte file throws a `ZodError`, which `packages/ui/unified-chat/src/lib/network-error.ts:120` maps to the fallback, and `WebChatPage.tsx:1822` toasts "Could not attach the selected files." then abandons the send.
Reproduction: attach an empty file plus a valid one, type, Send.
Expected: the empty file is refused at pick time, named, with the rest intact.
Actual: accepted, previewed, then the entire send is abandoned naming no file.
Root cause: verified (RC-5).
Recommended fix: use `validateAttachmentFile` from the contracts package in `use-attachments.ts` and map its reason onto `apps/web/lib/chat-attachment-policy.ts`.
Shared impact: removes the second validator.
Verification: unit test: `new File([], 'e.txt')` is refused with a named reason.

### [PG-CHAT-02] Duplicate attachments are accepted silently

Severity: P3
Surface: Shared
Area: Chat / Composer
Status: Missing
Evidence: neither `use-attachments.ts:128` nor `ChatInput.tsx:620` checks identity; every pasted screenshot is named `image.png` by `packages/platform/utils/src/composerPaste.ts:52`.
Recommended fix: dedupe on name, size and lastModified in both `addFiles` and `appendFiles`.
Shared impact: unified-chat hosts.
Verification: add the same `File` twice; one attachment.

### [PG-CHAT-03] Attachment upload has no progress, no per-file outcome, no retry; one failure discards the batch

Severity: P2
Surface: Shared
Area: Chat / Composer
Status: Missing
Evidence: `packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:106` uploads sequentially, three round trips per file, and every failure `throw`s after earlier files already completed, orphaning stored assets. `apps/web/features/chat/services/chat-attachment-upload.ts` is one `await client.upload(files)` with no progress callback.
Expected: per-file progress and outcome, remove-or-retry on the failed one, successful files kept.
Actual: one indeterminate spinner; on any failure a single toast and the whole draft parked with every attachment re-staged.
Root cause: verified (RC-5).
Recommended fix: `onFileSettled` callback and an `allSettled` result on `upload()`; surface per-file state on the existing `AttachmentPreview` chip; use the existing `unavailableChatAttachmentNotes` machinery for the refusal.
Shared impact: every surface that attaches chat files.
Verification: mock one file's PUT to 500; the others upload and the send proceeds with a named refusal note.

### [PG-CHAT-04] Composer drafts and parked failed sends do not survive a refresh

Severity: P2
Surface: Web
Area: Chat / Composer
Status: Partial
Evidence: `apps/web/shared/stores/web-chat-store.ts:1912` `partialize` persists `selectedModel`, `selectedModelTier`, `sidebarCollapsed` and three per-conversation maps; it omits `draftsByConversation` and `parkedSendsByFingerprint` (verified). The comment at `WebChatPage.tsx:1674` states the opposite intent.
Reproduction: type in conversation A, reload.
Expected: a half-typed message and a send that never reached a model survive a reload.
Actual: both are gone.
Root cause: verified (RC-6).
Recommended fix: add both maps to `partialize` with a size cap and age prune in `migrate`; bump the version.
Shared impact: `packages/ui/unified-chat/src/stores/chatStore.ts` has its own persist config and should be checked for desktop and the extension.
Verification: set a draft, rehydrate a fresh store, the draft returns.

### [PG-CHAT-05] Message actions are hover-only on touch for user messages and older assistant turns

Severity: P2
Surface: Web
Area: Chat / Messages
Status: Accessibility
Evidence: `apps/web/features/chat/components/messages/MessageBubble.tsx:2612` hides the action row with `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100` and no `pointer-coarse:` variant (verified); the same file uses `pointer-coarse:opacity-100` at `:2952`.
Expected: on coarse pointers the row is visible.
Actual: invisible but still tappable, so undiscoverable and randomly triggerable.
Recommended fix: append `pointer-coarse:opacity-100` at `:2612` and on the video download affordance.
Shared impact: check `packages/ui/unified-chat/src/components/MessageBubble.tsx` for the same shape.
Verification: component test asserting the class, mirroring `MessageBubble.timestamp.test.tsx`.

### [PG-CHAT-06] Dictation leaks raw `DOMException` text and has no unsupported-browser state

Severity: P3
Surface: Web
Area: Chat / Voice
Status: Broken (raw error to user)
Evidence: `apps/web/features/chat/stores/voice-input-store.ts:280` returns `Microphone error: ${err.message}` and `:283` `Unexpected error: ${String(err)}`; `startListening` never checks `MediaRecorder`. The live voice path is correct (`live-voice-session.ts:111`). `audit/raw-error-to-user.json` reports `total: 0`, so that scanner does not see interpolated strings and is stale for this path.
Recommended fix: fall through to `toUserMessage`, and guard `MediaRecorder` and `navigator.mediaDevices` with the wording already in `LIVE_SESSION_MESSAGE`.
Verification: store test with `navigator.mediaDevices` deleted; the message contains no "TypeError". Extend the raw-error scanner to template literals.

### [PG-CHAT-07] A stopped turn can only be regenerated, never continued

Severity: P3
Surface: Web
Area: Chat / Streaming
Status: UX Gap
Evidence: `apps/web/features/chat/components/messages/ChatMessageList.tsx:1096` excludes stopped turns from Continue; `:1616` offers only "Try again". `useChatStream.ts` preserves the partial with `finishReason: 'stopped'` and `continueGeneration` can seed from it.
Expected: "Response stopped." with Continue and Try again.
Actual: the only offer discards the partial the user chose to keep.
Recommended fix: a second action wired to the existing `onContinue`.
Shared impact: `packages/ui/unified-chat/src/components/MessageList.tsx:122` gates Continue the same way.
Verification: stop, Continue, the row keeps its text and grows.

### [PG-CHAT-08] No new-message indicator on the scroll-to-bottom button

Severity: P3
Surface: Web
Area: Chat / Messages
Status: Missing
Evidence: `ChatMessageList.tsx:255` `ScrollToBottomButton` takes only `onClick`; shown purely on `userScrolledUp`.
Recommended fix: a `hasNewContent` flag from `lastMessageFingerprint` changing while scrolled up; a dot and an updated `aria-label`.
Verification: component test: scroll up, append, the accessible name changes.

### [PG-CHAT-09] ⌘F is captured page-wide and blocks browser find

Severity: P3
Surface: Web
Area: Chat / Keyboard
Status: UX Gap
Evidence: `ChatMessageList.tsx:1233` binds ⌘F on `window` unconditionally for the life of the transcript, including with the settings modal open.
Recommended fix: scope to the transcript container or check focus and `use-overlay-dialog.ts` before `preventDefault`.
Verification: e2e with a dialog open; ⌘F is not consumed.

### [PG-CHAT-10] Chat has no proactive offline state and no reconnect recovery

Severity: P3
Surface: Web
Area: Chat / Streaming
Status: Partial
Evidence: the only `navigator.onLine` handling is inside `apps/web/features/chat/components/ChatFailureNotice.tsx:25`, which runs only inside error boundaries. `useConversations.ts:679` and `use-artifact-cloud-sync.ts:116` retry on `online`; nothing does for a parked send. The stream is a `fetch` `ReadableStream` with no reconnect; a mid-stream drop keeps the partial and Continue applies, so recovery is manual.
Recommended fix: a `useOnlineStatus` hook in `packages/ui/unified-chat` beside `network-error.ts`, an annotation on Send, and an `online` retry for the parked send.
Shared impact: desktop and the extension get the same behaviour.
Verification: dispatch `offline`, assert the banner; dispatch `online`, the parked send is re-offered.
Overlaps: `AGI-34` (stalled server row, fixed on main) is the server axis; this is the client axis.

### [PG-WEBSET-01] A project past the first page of 50 reads as "Project not found"

Severity: P2
Surface: Web
Area: Projects
Status: Broken
Evidence: `apps/web/app/chat/projects/[id]/page.tsx:106` resolves the project from the paginated store only (verified); `useManagedCloudProjects` pages at 50; `GET /api/projects/[id]` exists (`apps/web/app/api/projects/[id]/route.ts`) and is never called by the page. `useProjectConversations(projectId)` fetches by id independently, so the chats load under a header that claims the project does not exist.
Reproduction: own more than 50 projects, deep-link one sorted past 50.
Expected: fetch by id, say not-found only on a real 404.
Actual: an existing, owned project is reported as deleted or inaccessible.
Recommended fix: in the `!project` branch call the single-record route before rendering not-found.
Verification: seed 60 projects, deep-link the 60th.

### [PG-WEBSET-02] Full name is discarded on close while the fields beside it autosave

Severity: P2
Surface: Web
Area: Settings
Status: Broken
Evidence: `apps/web/features/settings/sections/GeneralSection.tsx:222` `flushPendingSave` writes the preference and personalization namespaces only and ends in `.catch(() => {})` (verified); Full name is saved only by the "Save profile" button. The settings modal closes unconditionally (`packages/ui/ui/src/settings-modal/SettingsModal.tsx:2033`).
Expected: one save model per pane, or an unsaved-changes prompt on close.
Actual: the name reverts; a flush that fails while closing is swallowed.
Recommended fix: include `display_name` in the flush and route flush failures through the existing `saveError`.
Verification: component test that unmounts after typing a name and asserts the PATCH fired.

### [PG-WEBSET-03] A failed memory read renders as "0 saved memories"

Severity: P2
Surface: Shared
Area: Settings / Memory
Status: Broken
Evidence: `packages/ui/unified-chat/src/components/MemoryEditor.tsx:64` `hydrateFromServer().catch(() => undefined)`; `apps/web/features/settings/sections/MemorySection.tsx:182` prints the count with `role="status"` and disables Manage and Clear on zero. `UsageSection.tsx:46` documents and guards against exactly this failure mode.
Recommended fix: a `status` on the store, error plus retry in the editor, gate the count and buttons on `ready`.
Shared impact: desktop and mobile inherit the editor.
Verification: unit test with a rejecting hydrate; no "0 saved memories".

### [PG-WEBSET-04] An expired connector says "reconnect" and offers no Reconnect

Severity: P2
Surface: Shared
Area: Connectors
Status: Missing
Evidence: `needsReauthorization` becomes the warning "Needs to be reconnected." (`apps/web/features/connectors/hooks/use-connectors-settings-adapter.tsx:497`). `SettingsModal.tsx:280` and `packages/ui/ui/src/directory/ConnectorDetailView.tsx:288` key the connect affordance on "has a row", so only Disconnect renders.
Expected: a Reconnect primary action re-entering the OAuth start flow.
Actual: the user must Disconnect, losing per-tool permissions, then find the connector again.
Recommended fix: thread `needsReauthorization` into both detail views; `connectConnector` already handles the 409 to `oauthStartPath` probe.
Verification: render the detail with a warning status and assert a Reconnect button.

### [PG-WEBSET-05] `POST /api/connectors` skips the org connector-policy gate its siblings run

Severity: P2
Surface: Web
Area: Connectors / Workspace policy
Status: Broken
Evidence: `apps/web/app/api/connectors/oauth/start/route.ts:203`, `apps/web/app/api/connectors/[connectorId]/credentials/route.ts:124` and `apps/web/app/api/connectors/custom/route.ts:85` call `evaluateConnectorPolicyForUser`; `apps/web/app/api/connectors/route.ts` `handleCreateConnector` does not, and inserts an active row for operator-mapped connectors. Hypothesis on the live effect; verified on the code path.
Recommended fix: the same gate at the top of `handleCreateConnector`.
Overlaps: `CONN-ROUTE-ORG-CONNECTOR-POLICY-CHECKED-01` is right that the hole exists but cites the wrong file and function name; repoint it at `apps/web/app/api/connectors/route.ts`.
Verification: route test asserting 403 for a policy-blocked operator-mapped connector.

### [PG-WEBSET-06] Deleted chats are kept forever with no permanent delete and no deletion date

Severity: P2
Surface: Web
Area: Settings / Privacy
Status: Missing
Evidence: `apps/web/features/settings/sections/DeletedChatsSection.tsx` offers Restore only; the only timestamp is `updatedAt`; no cron under `apps/web/app/api/cron/` sweeps a user's own `deleted_at` conversations (organization retention is scoped in `apps/web/lib/services/retention-service.ts`).
Expected: a stated retention window with a countdown, or a "Delete permanently" action, or both.
Actual: "Delete" is a rename to a hidden list that never empties.
Recommended fix: show `deleted_at`, add permanent delete behind `useConfirmAction`, state the rule in the header.
Verification: delete a chat; it shows its deletion date and can be purged.

### [PG-WEBSET-07] Workspace billing denies a usage read path the next nav item uses

Severity: P3
Surface: Web
Area: Billing
Status: Inconsistent
Evidence: `apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:156` says per-member and per-model attribution "has no admin read path yet"; `/workspace/usage` renders exactly that from `apps/web/app/api/settings/organization/usage-analytics/route.ts`.
Recommended fix: delete the paragraph and link `/workspace/usage` (RC-13).

### [PG-WEBSET-08] The "value unknown" placeholder renders as a stray comma

Severity: P3
Surface: Web
Area: Settings / Billing / Pricing
Status: Broken
Evidence: a dash placeholder became the string `", "` in `apps/web/features/settings/sections/TeamSection.tsx:563`, `apps/web/features/settings/sections/BillingSection.tsx:121`, `apps/web/features/settings/sections/AccountSection.tsx:35`, `apps/web/features/settings/sections/ReflectSection.tsx:27`, `apps/web/features/settings/components/LinkedDevicesPanel.tsx:29` and `apps/web/app/pricing/page.tsx:212`. The shared modal does it correctly with `UNKNOWN_VERSION_PLACEHOLDER`.
Recommended fix: one exported `UNKNOWN_VALUE` constant; real copy ("Not provisioned") for the seat rows.
Verification: grep for `?? ', '` returns nothing.

### [PG-WEBSET-09] Dates are formatted three ways inside one settings modal and never state a timezone

Severity: P3
Surface: Web
Area: Settings / Billing
Status: Inconsistent
Evidence: `BillingSection.tsx:106` hardcodes `en-US`; `UsageSection.tsx:23` and `DeletedChatsSection.tsx:15` use the browser locale; `SettingsModal.tsx:63` uses `dateStyle: 'medium'`. The usage reset instant prints hour and minute with no `timeZoneName`. The UI language is a synced preference the same modal exposes.
Recommended fix: one `formatSettingsDate`/`DateTime` reading the i18n locale with `timeZoneName: 'short'` on instants (RC: `PG-SHARED-11`).

### [PG-WEBSET-10] Capabilities drops the `retrySave` its own hook provides

Severity: P3
Surface: Web
Area: Settings
Status: Partial
Evidence: `apps/web/features/settings/hooks/use-capabilities-preferences.ts:152` returns `retrySave`; `MemorySection.tsx:137` renders it; `apps/web/features/settings/sections/CapabilitiesSection.tsx:11` does not destructure it, so its "Try again" only reloads and the rejected toggle is lost.
Recommended fix: render `retrySave` as Memory does.

### [PG-WEBSET-11] A settings read failure is returned as hardcoded defaults

Severity: P3
Surface: Web
Area: Settings / Security
Status: Broken
Evidence: `apps/web/features/settings/hooks/use-settings-queries.ts:64` catches any error and returns `{ two_factor_enabled: false, session_timeout: 60 }`, so the query never errors and Security paints 2FA off until the enrollment panel's own status call overrides it.
Recommended fix: throw from the queryFn and render `isError`; `useAPIKeys` in the same file models this correctly (RC-1).

### [PG-WEBSET-12] Deleting a project names none of its consequences

Severity: P3
Surface: Shared
Area: Projects
Status: UX Gap
Evidence: `packages/ui/unified-chat/src/components/ProjectCard.tsx:294` confirms with "This cannot be undone." `apps/web/app/api/projects/[id]/route.ts:270` detaches and keeps the conversations and permanently removes the knowledge objects.
Expected: "N uploaded files are permanently deleted; N chats are kept and move out of the project."
Recommended fix: pass the counts the list route already returns into the confirm description (RC-9).
Verification: render with counts and assert the copy.

### [PG-WEBSET-13] Settings bypasses the design tokens and the shared Spinner

Severity: P3
Surface: Web
Area: Settings
Status: Inconsistent
Evidence: `apps/web/features/settings/components/Settings/ApiKeys.tsx:100` `bg-green-700 text-white`, `:317` `bg-red-600`; `GeneralSection.tsx:569` `bg-amber-700`; `ApiKeys.tsx:114` and `UsageSection.tsx:311` hand-rolled spin animations ignoring reduced motion. The create-key form is nested inside `AlertDialogDescription`.
Recommended fix: tokens and `Spinner`; contrast cases (RC-7, RC-10).

### [PG-WEBSET-14] Projects has sort and archive but no search

Severity: P3
Surface: Web
Area: Projects
Status: Missing
Evidence: `apps/web/app/chat/projects/page.tsx` has a sort menu, an archived toggle and a pager; no text filter; the list route takes `limit` and `offset` only.
Recommended fix: a client filter now, a `q` parameter as the end state.
Overlaps: `GAP-161` is the mobile sibling and is now fixed there.

### [PG-WEBSET-15] "Adjust plan" leads to an upgrade-only page

Severity: P3
Surface: Web
Area: Billing
Status: UX Gap
Evidence: `BillingSection.tsx:706` labels the control "Adjust plan" and links `/upgrade`; `apps/web/app/upgrade/UpgradeChooser.tsx:74` offers only higher tiers. Downgrade exists only through the portal behind "Manage billing".
Recommended fix: downgrade targets via the existing `openBillingPortal(undefined, flow)`, or relabel to "Upgrade plan" plus a "Change or cancel" link.
Overlaps: `GAP-215`, `GAP-249` (desktop).

### [PG-WEBSET-16] Usage warns in colour but offers no way out

Severity: P3
Surface: Web
Area: Billing / Usage
Status: UX Gap
Evidence: `UsageSection.tsx:76` colours the bar at 90 and 95 percent; nothing links to Billing's `#top-up` anchor or the overage toggle at `BillingSection.tsx:938` and `:1051`.
Recommended fix: a `SettingsPageLink` to `/settings/billing#top-up` when urgency is not normal.
Overlaps: `GAP-332` (desktop sibling).

## 5. Shared and cross-surface findings

### [PG-SHARED-01] Shared unified-chat paints agent status colours with dark-only shades, failing light theme

Severity: P2
Surface: Shared
Area: Chat / Agent timeline
Status: Accessibility
Evidence: `packages/ui/unified-chat/src/components/ActionLogTimeline.tsx:43` `running: text-amber-300`, `failed: text-red-300`, `blocked: text-yellow-300` with no `dark:` pairing (verified); only `success` has a pair. Hand-computed against white: about 1.4:1, 2.0:1 and 1.3:1 against the rule's 4.5:1. `theme-contrast.test.ts` cannot see Tailwind literals, so it passes (270 cases, run) while this fails.
Expected: status text from a role token tuned per theme.
Actual: three of four agent-step statuses are illegible in light theme in the surface-neutral package.
Root cause: verified (RC-7).
Recommended fix: the existing `--chat-*` status tokens, plus cases in the contrast test. The same pattern recurs across about 298 literal usages in the package (`SidecarPanel.tsx`, `AgentStepTimeline.tsx`, `ToolCallCard.tsx`, `ChatStream.tsx`, `ArtifactRenderer.tsx`).
Shared impact: every host of unified-chat.
Verification: render each status under `data-theme="light"` and assert ≥4.5:1.

### [PG-SHARED-02] No guard catches Tailwind palette classes, and desktop has no colour guard at all

Severity: P3
Surface: Shared
Area: Theme / Tooling
Status: Guard gap
Evidence: `scripts/check-css-tokens.mjs` validates token resolvability only; `apps/web/scripts/check-no-hex-colors.mjs:31` matches hex, rgb and hsl only and scans `app`, `components`, `lib`, `features` (not `apps/web/shared`); `package.json` wires `check:no-hex` for web, mobile and the Chrome extension only; 207 web violations are grandfathered. Literal-class counts: `apps/desktop/src` about 2,381, `packages/ui/unified-chat` about 298, `apps/web/features` 322, `apps/extension/src` 0.
Recommended fix: extend the pattern list with a palette-class regex and add roots for desktop, VS Code and `packages/ui`, each with its own baseline so the count only falls (RC-7).
Verification: the extended guard flags `ActionLogTimeline.tsx:43` and passes on `apps/extension/src`.

### [PG-SHARED-03] Text tokens diluted with opacity modifiers on desktop

Severity: P3
Surface: Desktop
Area: Theme
Status: Accessibility
Evidence: `apps/desktop/src/App.tsx:1662` `text-[var(--chat-accent-primary-contrast)]/70` on the secondary accent, about 3.3:1; 63 `text-muted-foreground/NN` sites on desktop (densest in `apps/desktop/src/features/browser/BrowserDebugTabs.tsx`), against the explicit rule in `.claude/rules/ui-colour-and-interaction.md`.
Recommended fix: drop the modifiers; where a third weight is needed add a `--chat-text-subtle` token with a contrast case.
Verification: grep returns 0 for `text-muted-foreground/` and `-contrast)]/` under `apps/desktop`.

### [PG-SHARED-04] Desktop `role="menu"` panels do not honour the menu keyboard contract

Severity: P3
Surface: Desktop
Area: Accessibility
Status: Accessibility
Evidence: `useMenuKeyboard` has 8 web and 7 unified-chat adopters and zero desktop adopters. `apps/desktop/src/features/v3/Sidebar.tsx:860` (account menu: no Escape, no arrows, no focus return, closes only by backdrop click), `apps/desktop/src/features/v3/ConversationRow.tsx:260`, `apps/desktop/src/features/v3/ProjectRow.tsx:287`, `apps/desktop/src/features/code/FileTree.tsx:580` (Escape only).
Recommended fix: wire the primitive into all four.
Verification: a browser spec under `apps/desktop/` (jsdom cannot prove event order).

### [PG-SHARED-05] Desktop destructive actions bypass `useConfirmAction`; one fails open

Severity: P2
Surface: Desktop
Area: Settings / Privacy / MCP / Messaging
Status: Broken / Inconsistent
Evidence: `useConfirmAction` has 24 web and 4 unified-chat adopters and zero under `apps/desktop/src`. A second primitive, `useConfirm` in `packages/ui/ui/src/primitives/ConfirmDialog.tsx:88`, has five desktop adopters. Seven sites use the global `confirm()`: `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:612`, `apps/desktop/src/features/settings/tabs/Privacy/index.tsx:112` (clear all local data and credentials), `apps/desktop/src/features/settings/tabs/Memory.tsx:97`, `apps/desktop/src/features/messaging/MessagingIntegrations.tsx:154`, `apps/desktop/src/features/mcp/MCPServerManager.tsx:370`, `apps/desktop/src/features/screen-capture/CapturePreview.tsx:43`, `apps/desktop/src/features/execution/TimeoutWarningDialog.tsx:157`. `Memory.tsx:94` reads `typeof globalThis.confirm !== 'function' || globalThis.confirm(...)` (verified), so where `confirm` is unavailable every memory is cleared with no prompt. Whether either webview host returns `undefined` for `confirm` is unverified.
Expected: one in-app confirmation that names the consequence (AGENTS.md §9).
Actual: three mechanisms, one a blocking OS dialog, one that defaults to yes on an irreversible action.
Root cause: verified (RC-9).
Recommended fix: invert `Memory.tsx:95` to fail closed now; migrate the seven sites; retire one of the two primitives.
Verification: no bare `confirm(` under `apps/desktop/src`; a test that `adapter.clear` is not called when `globalThis.confirm` is deleted.

### [PG-SHARED-06] Errors auto-dismiss in about four seconds, with no dedupe and no close button on desktop

Severity: P2
Surface: Shared
Area: Feedback
Status: UX Gap
Evidence: 124 files call `toast.error(`; one call sets a `duration`; zero toast calls pass an `id` (verified). `packages/ui/ui/src/primitives/SonnerToaster.tsx` sets `classNames` only. `apps/web/app/providers.tsx:44` mounts with `closeButton`; `apps/desktop/src/NormalApplication.tsx:18` does not, in the opposite corner. No undo affordance exists anywhere. The Chrome extension has no toast system.
Expected: errors persist until dismissed or at least 8 to 10 s, repeated identical errors collapse, reversible actions offer Undo.
Actual: an error shown while the user is reading elsewhere is gone before it can be read and cannot be pinned on desktop.
Root cause: verified (RC-8).
Recommended fix: opinionated defaults in `SonnerToaster` (`closeButton`, per-type `duration`), same props on both mounts. Undo is separate, larger work.
Verification: `SonnerToaster.test.tsx` asserts the error default and `closeButton`.

### [PG-SHARED-07] `Spinner` is bypassed about 305 times; desktop has no blanket reduced-motion rule

Severity: P3
Surface: Shared
Area: Loading / Motion
Status: Accessibility
Evidence: `packages/ui/ui/src/primitives/Spinner.tsx:9` is correct. Bare `animate-spin`: desktop 215, web 53, unified-chat 37. `apps/web/app/globals.css` carries a blanket `[data-motion='reduced']` rule and a `prefers-reduced-motion` slow-down; `apps/desktop/src/styles/globals.css` has only two scoped blocks.
Recommended fix: port the two web blocks into the desktop stylesheet (one rule closes 215 sites), then migrate unified-chat's 37 (RC-10).
Verification: a CSS assertion test on both stylesheets; a guard rejecting new bare `animate-spin` outside `Spinner.tsx`.

### [PG-SHARED-08] No shared copy control: 46 implementations, five with no failure path

Severity: P3
Surface: Shared
Area: Copy controls
Status: Inconsistent
Evidence: 46 files call `navigator.clipboard.writeText` directly; no `catch` in `packages/ui/unified-chat/src/components/ToolCallCard.tsx`, `apps/desktop/src/features/settings/MCPServerSettings.tsx`, `apps/desktop/src/features/cloud/CloudStoragePanel.tsx`, `apps/desktop/src/features/artifacts/ArtifactToolbar.tsx`, `apps/web/features/code/components/CodeTranscript.tsx`; most have no `aria-live` announcement; three never clear the copied state.
Recommended fix: `useCopyToClipboard` beside the primitives and migrate unified-chat first. This is the one new abstraction this audit recommends, because no canonical implementation exists to consolidate onto.
Verification: a primitive test covering rejection and reset; no direct `writeText` under `packages/ui` outside the primitive.

### [PG-SHARED-09] Keyboard-unreachable expanders with dead nested chevron buttons on desktop

Severity: P3
Surface: Desktop
Area: Execution panels
Status: Accessibility / Broken
Evidence: `apps/desktop/src/features/execution/BrowserPanel.tsx:160` toggles on a `div` with no role; `:208` is a real `<button>` with no handler and no name. Identical pair in `apps/desktop/src/features/execution/ThinkingPanel.tsx:170`. Three more unnamed icon buttons in `apps/desktop/src/features/feedback/MessageFeedbackButtons.tsx:114`. These five are the only unnamed icon-only buttons in the repo.
Recommended fix: the row becomes `<button aria-expanded>`, the chevron `aria-hidden`; labels on the three feedback controls.
Overlaps: `DESKTOP-ICON-BUTTON-ARIA-LABEL-GAP-01` is stale: its cited `ArtifactToolbar.tsx` now uses three labelled `<Button>`s. Repoint it here or close it.

### [PG-SHARED-10] Permanently disabled, `aria-hidden` controls decorate the shared Library composer

Severity: P3
Surface: Shared
Area: Library
Status: Dead UI
Evidence: `packages/ui/unified-chat/src/components/library/LibraryView.tsx:971` and `:996` render `<button disabled aria-hidden tabIndex={-1}>` with no handler, flanking an `aria-hidden` "Auto" pill styled as a model chip.
Recommended fix: remove them or wire them to the main composer's handlers.

### [PG-SHARED-11] `formatRelativeTime` hardcodes English and desktop re-implements it three times

Severity: P3
Surface: Shared
Area: Dates
Status: Inconsistent
Evidence: `packages/platform/utils/src/format.ts:92` `new Intl.RelativeTimeFormat('en', …)` while `formatDate` and `formatDateTime` in the same file accept a locale. Hand-rolled copies in `apps/desktop/src/features/chat/CommandPalette.tsx:88`, `apps/desktop/src/features/notifications/NotificationCenter.tsx:91`, `apps/desktop/src/features/settings/UpdateSettings.tsx:42`. No stale "Updated recently" placeholders exist.
Recommended fix: an optional `locale` on `formatRelativeTime` defaulting to the user locale; replace the three copies.
Verification: a non-English case in `packages/platform/utils/src/__tests__/format.test.ts`.

### [PG-SHARED-12] `DialogContent` caps height with `100vh`, not `100dvh`

Severity: P4
Surface: Shared
Area: Dialogs / Responsive
Status: UX Gap
Evidence: `packages/ui/ui/src/primitives/Dialog.tsx:110`; two feature dialogs already override it with `100dvh` (`apps/web/features/schedules/components/SchedulesPage.tsx:897`, `apps/web/features/projects/components/ProjectSettingsDialog.tsx:137`).
Recommended fix: change the primitive and drop the overrides.

### [PG-SHARED-13] Virtual-keyboard handling is not implemented on web

Severity: P3
Surface: Web
Area: Chat shell / Responsive
Status: Missing
Evidence: `visualViewport` appears nowhere in `apps/web` or `packages/ui`; `env(safe-area-inset-*)` in five places, one in the app shell. `dvh` handles URL-bar collapse but not keyboard occlusion on iOS.
Recommended fix: a `useVisualViewport` hook on the chat shell's bottom bar.
Verification: mobile-emulation Playwright, or manual on iOS Safari.

### [PG-SHARED-14] No `<main>` or labelled `<nav>` landmarks on the chat page

Severity: P3
Surface: Web
Area: Accessibility
Status: Accessibility
Evidence: `apps/web/features/chat/pages/WebChatPage.tsx` contains no `<main` (verified by grep); the only nav-ish label is the open-navigation control. Carried forward from the 2026-09-04 parity matrix as the one row there that is still verifiably open.
Recommended fix: `<main>` around the transcript and composer, `<nav aria-label>` on the rail.

## 6. Desktop findings

Desktop ships two shells deliberately (`apps/desktop/electron-builder.yml:1`): the Tauri "AGI" app is the local-capable product and the Electron "AGI Cloud" shell loads the web app remotely, so its renderer is `apps/web` and half its UX lives in `apps/web/features/desktop-host`. The Tauri side's dead-UI hygiene is good: `apps/desktop/check-wiring.sh` passes with 1,278 registrations and zero unregistered `invoke`s, and 51 orphans carry WIRE or DELETE verdicts in `apps/desktop/wiring-allowlist.json`.

Register corrections found while spot-checking: `DESKTOP-SINGLE-INSTANCE-MISSING-01` (plugin at `apps/desktop/src-tauri/Cargo.toml:67`, verified), `DESKTOP-SETTINGS-SYNC-GAP-01` (`apps/desktop/src/services/managedCloudSettingsSync.ts`), `DESKTOP-SHORTCUTS-DEFAULTS-DUPLICATE-AND-DISCONNECTED-01` (`apps/desktop/src/constants/shortcuts.ts`), `DESKTOP-MEMORY-DECAY-BRIDGE-HARDCODED-01` (`apps/desktop/src/stores/bridge/stateBridge.ts:262`) and `DESKTOP-NOTIFICATIONS-SETTINGS-IGNORED-AND-CENTER-UNREACHABLE-01` are fixed and should be deleted from `known-flaws.md`. `DESKTOP-REGENERATE-NO-COMPLETION-01` is half fixed (Cloud mode yes, Local mode no, `PG-DESK-04`). `DESKTOP-GIT-PANEL-UNREACHABLE-01` and `DESKTOP-PR-AUTOMATION-DEAD-CODE-01` are still true.

### [PG-DESK-01] The Electron shell still ships a renderer mode its own source calls broken

Severity: P2
Surface: Desktop
Area: Build
Status: Broken
Evidence: `apps/desktop/electron/config.ts:31` states the `bundled` renderer answers 10 of 946 invoke commands and keeps it as an env-var opt-out (`AGI_CLOUD_RENDERER=bundled`), fully wired through `apps/desktop/electron/main.ts`.
Recommended fix: delete the branch and the `agi://` handler, or compile it out under `app.isPackaged`.

### [PG-DESK-02] Native notifications ignore the notification preference in the Electron shell

Severity: P2
Surface: Desktop
Area: Settings / Chat
Status: Broken
Evidence: `apps/web/features/desktop-host/lib/notify.ts:20` gates on the host bridge and `document.hidden` only; the `browserReplyReady` preference in `apps/web/features/settings/sections/NotificationsSection.tsx:28` is never read. Three call sites in `WebChatPage.tsx`.
Recommended fix: read the namespace once and short-circuit in `notifyJobComplete`.
Overlaps: the Tauri twin of this class is fixed; this path is distinct.
Verification: unit test in `apps/web/features/desktop-host/__tests__/desktop-host.test.tsx`.

### [PG-DESK-03] The Quick Ask panel has no preload, so the dictation hotkey silently does nothing there

Severity: P2
Surface: Desktop
Area: Voice / Shortcuts
Status: Broken
Evidence: `apps/desktop/electron/quickAsk.ts:16` creates the panel without `preload`; `apps/desktop/electron/voiceDictation.ts:35` routes the hotkey to it; the only listener is in `apps/desktop/electron/preload.ts:65`.
Recommended fix: the same preload and `additionalArguments` as the main window (RC-11).

### [PG-DESK-04] Regenerate is absent in Local (Tauri) mode, and the shared comment explaining why is stale

Severity: P2
Surface: Desktop / Shared
Area: Chat
Status: Missing
Evidence: `packages/ui/unified-chat/src/components/ChatInterface.tsx:755` gates retry on `runtime?.deleteMessages`; `apps/desktop/src/runtime/CloudRuntime.ts:1628` implements it, `apps/desktop/src/runtime/TauriRuntime.ts` does not. `packages/ui/unified-chat/src/components/ActionBar.tsx:88` still says desktop does not wire regenerate.
Recommended fix: `deleteMessages` on `TauriRuntime`; correct the comment (RC-13).
Overlaps: the surviving half of `DESKTOP-REGENERATE-NO-COMPLETION-01`.

### [PG-DESK-05] With no local inference server running, the "On this device" section vanishes from the picker

Severity: P2
Surface: Desktop
Area: Local models
Status: Missing state
Evidence: `apps/web/features/chat/components/Composer/ComposerFooter.tsx:483` `if (!state.available) return null;` (verified); `available` is host present and at least one reachable server (`apps/web/features/desktop-host/hooks/use-local-models.ts:77`).
Expected: a "Run models on this device" row saying no runtime was detected, with install guidance. This is the only discovery path for the capability.
Actual: no section, no badge, no hint.
Recommended fix: render whenever `host !== null` with a not-detected row (RC-12).
Verification: extend `ComposerFooter.localModels.test.tsx` with a zero-reachable case.

### [PG-DESK-06] Three more local-model states are computed but never shown, and there is no probing state

Severity: P3
Surface: Desktop
Area: Local models
Status: Missing state
Evidence: `apps/desktop/electron/runtime/localInferenceService.ts:71` builds a running-but-empty `message` nobody reads; `use-local-models.ts:35` starts with a null snapshot so a running Ollama reads "Not running" for up to 1.5 s per server; the refresh `catch` at `:49` sets no error.
Recommended fix: a `status` of probing, ready or failed on the hook; render `server.message` (RC-12).

### [PG-DESK-07] Denied local-runtime permissions cannot be reviewed, revoked or re-requested from the app

Severity: P2
Surface: Desktop
Area: Permissions
Status: Missing
Evidence: `apps/desktop/electron/runtime/permissionManager.ts:161` returns early for any non-prompt state; `listPermissions`, `revokePermission` and `clearSessionPermissions` exist with no dispatcher command and no UI. A denial is session-scoped (`permissionCore.ts:77`) and nothing tells the user that; the failure string is "Permission to filesystem write in <root> was not granted."
Recommended fix: expose list and revoke through `dispatcher.ts` into `LocalAccessSection`; append the restart hint to the denial (RC-2).

### [PG-DESK-08] macOS microphone permission is never checked, unlike screen recording

Severity: P3
Surface: Desktop
Area: Voice / Permissions
Status: Missing state
Evidence: `apps/desktop/electron/screenshot.ts:33` does it correctly for `'screen'`; there is no `getMediaAccessStatus('microphone')` anywhere in `apps/desktop/electron`.
Recommended fix: reuse the screenshot shape in `voiceDictation.ts` and offer `askForMediaAccess`.
Overlaps: `GAP-254` covers the Tauri recorder's screen preflight, not this.

### [PG-DESK-09] The Tauri app never requests OS notification permission and has no denied state

Severity: P2
Surface: Desktop
Area: Notifications
Status: Missing
Evidence: `apps/desktop/src/stores/notificationStore.ts:180` implements `checkPermission` and `requestPermission` with no `.tsx` caller; `apps/desktop/src/stores/chat/agentWorkflowEvents.ts:385` calls `sendNotification` after only the app-level settings check.
Recommended fix: check on mount of the notifications tab, request on toggle, render "Blocked in System Settings" from `permissionGranted`, the pattern `NotificationsSection.density.test.tsx` already tests on web.

### [PG-DESK-10] Five destructive desktop actions use blocking `window.confirm`

Severity: P2
Surface: Desktop
Area: Settings / Chat / MCP / Schedules
Status: Inconsistent
Evidence: see `PG-SHARED-05`. Recorded here so the desktop lane owns the migration.

### [PG-DESK-11] The Electron shell forgets window size and position on every launch

Severity: P3
Surface: Desktop
Area: Lifecycle
Status: Missing
Evidence: `apps/desktop/electron/main.ts:504` hardcodes 1280×800 with no bounds persistence; the Tauri app uses `tauri-plugin-window-state` (`apps/desktop/src-tauri/Cargo.toml:61`).
Recommended fix: persist `getBounds()` on close into the existing `settingsStore`, clamp on restore.

### [PG-DESK-12] The Electron update flow has no in-app surface, no automatic check and no progress states

Severity: P2
Surface: Desktop
Area: Updates
Status: Partial
Evidence: `apps/desktop/electron/preload.ts:103` exposes `checkForUpdate` and `openUpdateInstaller` with zero callers in `apps/web`; the only path is the tray item to a modal dialog that opens a browser download (`apps/desktop/electron/main.ts:591`). No startup or periodic check. `relaunch`, `windowControl` and `dialog` in the preload are likewise uncalled.
Recommended fix: startup plus daily check with an in-app banner using the exposed bridge; `electron-updater` with the DMG feed as the proper fix.

### [PG-DESK-13] Tray "New Chat" and menu "Settings" hard-navigate, discarding an in-flight turn and the draft

Severity: P2
Surface: Desktop
Area: Chat
Status: Broken
Evidence: `apps/desktop/electron/main.ts:576` and `:585` call `loadURL`; bound to ⌘N and ⌘, in `apps/desktop/electron/appMenu.ts:50`.
Expected: an in-place navigation over the existing deep-link IPC (`preload.ts:56`, `apps/web/features/desktop-host/hooks/use-desktop-deep-links.ts`).
Actual: a full document reload; a streaming turn is aborted and the draft is gone.
Recommended fix: send `agiworkforce://chat/new` and `agiworkforce://settings` over the deep-link channel (RC-11).
Overlaps: `DESKTOP-NEWCHAT-DRAFT-NOT-CLEARED-01` is the opposite problem on Tauri.

### [PG-DESK-14] The Electron offline screen always returns to `/chat`

Severity: P3
Surface: Desktop
Area: Offline
Status: Partial
Evidence: `apps/desktop/electron/main.ts:472` builds the offline page with a retry to the constant entry URL; `validatedURL` at `:549` is available and unused; only `did-fail-load` on the main frame triggers it.
Recommended fix: pass `validatedURL` as the retry target (RC-11).

### [PG-DESK-15] Global-shortcut conflicts are announced once per process lifetime

Severity: P3
Surface: Desktop
Area: Shortcuts
Status: Partial
Evidence: `apps/desktop/electron/shortcuts.ts:40` `warnOnce` never resets, not even in `unregisterGarnishShortcuts`.
Recommended fix: reset on unregister or scope per accelerator.

### [PG-DESK-16] Quick Ask loads the full `/chat` page into a 480×620 frameless panel

Severity: P3
Surface: Desktop
Area: Chat
Status: Partial
Evidence: `apps/desktop/electron/quickAsk.ts:7` and `:54`; no quick-ask route exists in `apps/web/app`; the composer is found heuristically by `composerFocus.ts`.
Recommended fix: a `/quick-ask` route on web (RC-11).

### [PG-DESK-17] `computer.use` is a declared capability with no command behind it in the Electron shell

Severity: P3
Surface: Desktop
Area: Permissions
Status: Missing
Evidence: `apps/desktop/electron/runtime/permissionManager.ts:137` labels it; no entry in the dispatcher's capability tables uses it.
Recommended fix: drop the label from the Electron map until a command needs it.

### [PG-DESK-DEAD] Unreachable desktop components and uncalled bridge surface

Severity: P3
Surface: Desktop
Area: Dead UI
Status: Unreachable
Evidence: `apps/desktop/src/features/mcp/MCPServerManager.tsx` (597 lines, never imported outside its barrel; its "Browse Registry" button at `:495` and `apps/desktop/src/features/mcp/MCPToolExplorer.tsx:212` "View Schema" have no handler), `apps/desktop/src/features/workflows/WorkflowPanel.tsx` (706 lines, never imported, while its sibling `AutomationBuilder` is mounted; its disabled "Schedule" item at `:598` has no explanation), `apps/desktop/src/features/file-upload/FileDropZone.tsx` (barrel only), plus the bridge methods in `PG-DESK-12` and the permission methods in `PG-DESK-07`.
Recommended fix: mount or delete each; do not leave a second MCP manager beside the live `MCPConnectionStatus`.
Overlaps: `DESKTOP-GIT-PANEL-UNREACHABLE-01`, `DESKTOP-PR-AUTOMATION-DEAD-CODE-01` (both still true, not re-filed).

## 7. Mobile findings

The mobile app is mature on the states a checklist usually finds missing: safe
areas in 82 files, keyboard avoidance on 20 screens, an offline banner and
account-scoped queue, permission deep links on every denied surface except the
microphone, a paywall that says plan changes are not available in the app
rather than a dead upgrade button, and a global Android back policy. The gaps
concentrate in failure visibility.

Register corrections from spot-checks: `GAP-161`, `GAP-177`, `GAP-192`, `GAP-141` are fixed (`apps/mobile/app/(app)/(tabs)/projects.tsx:449` search, `apps/mobile/src/features/settings/data-controls/index.tsx` archive and delete all, `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:160` "Type instead", `apps/mobile/app/(app)/(tabs)/chat.tsx:839` task chips). `GAP-191` is half stale (the cap is real, the "no path to history" half is false: `apps/mobile/src/features/chat/DrawerContent.tsx:68` routes to the full list). `GAP-155` rests on a false premise (neither screen exists). `GAP-158` and `GAP-307` hold.

### [PG-MOB-01] Image and video generation can fail silently while the composer reports success

Severity: P1
Surface: Mobile
Area: Chat / Media generation
Status: Broken (misleading success)
Evidence: `apps/mobile/app/(app)/chat/[id].tsx:382` and `:432` pass `onUnexpectedError: console.warn` (verified). `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:83` returns `{ status: 'failed', assistantMessageId: null }` when the account epoch is missing or changed, without creating a message (verified); `runVideoGenerationTurn.ts:79` is the same shape. The screen returns `true` (`chat/[id].tsx:440`), and `apps/mobile/src/features/chat/components/ChatInput.tsx:320` clears the draft on anything not `false` (verified).
Reproduction: cloud mode, image mode, let the session lapse or switch account between typing and send.
Expected: the composer keeps the text and a banner names the cause with a sign-in action.
Actual: composer clears, nothing in the transcript, a `console.warn` invisible in release.
Root cause: verified (RC-2).
Recommended fix: call the existing `setSendError` (already wired to `SendErrorBanner`) from both handlers and return `false` for the failed-with-no-message case so the draft is restored.
Verification: mock `captureCloudAccountEpoch` to null, send, assert the banner and unchanged text.

### [PG-MOB-02] Cloud sync failure is tracked but rendered nowhere

Severity: P1
Surface: Mobile
Area: Chat / Projects / Settings / Memory
Status: Missing
Evidence: `apps/mobile/stores/chat/cloudSyncStateStore.ts` models `idle | syncing | error` with `lastError`; `apps/mobile/services/cloudSyncEngine.ts:861` sets `error` on throw; zero `.tsx` files import the store (verified by grep).
Expected: a stale badge, banner or settings row naming the last failure with a retry.
Actual: settings toggles look saved (local MMKV) while never reaching the account; the user discovers it on another device.
Root cause: verified (RC-1, RC-2).
Recommended fix: a dismissible banner in the `OfflineBanner` slot of `apps/mobile/app/_layout.tsx` on `error`, plus a "Last synced" row on the cloud account screen.
Verification: force `pushSettings` to reject; the banner renders and retry re-runs the engine.

### [PG-MOB-03] `loadConversations` swallows every error, so a failed history fetch renders "No chats yet"

Severity: P2
Surface: Mobile
Area: Chat / Navigation
Status: Broken
Evidence: `apps/mobile/stores/chat/chatMessageStore.ts:184` has a bare `catch { return; }`; `apps/mobile/src/features/chat/ChatsListScreen.tsx:147` never reads `isLoadingConversations` or `error`, so `ListEmptyComponent` at `:466` renders for network failure, expired session and an empty account alike.
Recommended fix: set the error in the catch; branch on loading (the existing `MessageSkeleton`) and error before the empty state (RC-1).
Verification: reject `listConversations`; the list shows an error state.

### [PG-MOB-04] The Chats and Projects lists have no pull-to-refresh, loading or error state

Severity: P2
Surface: Mobile
Area: Chat / Projects
Status: Missing
Evidence: `ChatsListScreen.tsx:433` and `apps/mobile/app/(app)/(tabs)/projects.tsx` mount no `RefreshControl`; seven sibling screens do. Projects never triggers a fetch; cloud projects arrive only from the sync engine's pull.
Recommended fix: `RefreshControl` on both, reusing `apps/mobile/src/features/library/index.tsx`.

### [PG-MOB-05] The in-chat Chinese-HQ provider consent banner records consent without stating what is consented to

Severity: P2
Surface: Mobile
Area: Chat / Compliance
Status: UX Gap
Evidence: `apps/mobile/src/features/chat/components/ProviderConsentBanner.tsx:27` writes `setChineseHqProviderConsent(providerId, true)` on one tap of "Turn on"; the copy from `apps/mobile/src/features/chat/utils/providerConsentRecovery.ts:39` names no jurisdiction; `apps/mobile/services/providerConsent.ts:14` stamps `disclosureVersion: 'unrecorded'` when no disclosure was read. The onboarding and privacy paths are correct.
Recommended fix: "Turn on" opens the existing disclosure sheet and consent is recorded from its confirm; never stamp `'unrecorded'` on an accepted consent.
Overlaps: `AGI-22` is the missing server-side record; this is the client capture.
Verification: `recordNamedProviderConsent` is not called before the disclosure is acknowledged.

### [PG-MOB-06] Local runtime failures fall through to raw native error text as the assistant message

Severity: P2
Surface: Mobile
Area: Chat / Local models
Status: UX Gap
Evidence: `apps/mobile/stores/chat/chatExecutionStore.ts:496` `localSetupMessage` matches five error strings and otherwise returns `raw`; `:2105` writes it into the assistant message body. `:975` shows internal router reason codes verbatim. `audit/raw-error-to-user.json` has no mobile entries.
Recommended fix: typed errors from `apps/mobile/src/features/model-picker/localModelRuntime.ts` (as `VoiceCaptureError` already does), map by code, route the CTA to `/(app)/models`.

### [PG-MOB-07] Reduced motion is ignored by every Reanimated component

Severity: P3
Surface: Mobile
Area: Accessibility
Status: Accessibility
Evidence: `apps/mobile/src/ui/theme/useReduceMotion.ts` is correct and has two consumers; 51 files import Reanimated and none imports it; 14 run unbounded `withRepeat` loops (voice orb, waveform, skeleton, generation progress, pairing status).
Recommended fix: adopt the hook in the 14 loops first (RC-10). Name `useReduceMotion` in the colour-and-interaction rule as the mobile counterpart of `Spinner`.

### [PG-MOB-08] Project detail claims "Local project" when a cloud fetch fails, and the fetch is dead under shipped flags

Severity: P2
Surface: Mobile
Area: Projects
Status: Broken / Inconsistent
Evidence: `apps/mobile/lib/v1FeatureFlags.ts:30` ships `crossDeviceSync: false`; `apps/mobile/app/(app)/projects/[id].tsx:170` renders `LocalOnlyFallback` ("Local project. Details, chats, and sources stay on this device.") for both `local-only` and `fetch-failed`, with no retry. `apps/mobile/src/features/projects/service.ts:5` `fetchProject` is unreachable while the flag is off.
Recommended fix: split the two states; give `fetch-failed` a retry; gate or delete the unreachable success path (RC-1).

### [PG-MOB-09] Microphone-denied copy tells the user to open Settings but offers no way to

Severity: P3
Surface: Mobile
Area: Voice / Permissions
Status: UX Gap
Evidence: `apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:31` and `apps/mobile/src/features/chat/components/VoiceInputButton.tsx:123` return a plain string; every other denied surface calls `Linking.openSettings()`.
Recommended fix: an Alert with Open Settings, as `apps/mobile/src/features/reminders/index.tsx:64` does.

### [PG-MOB-10] iPad multitasking is enabled while the app is locked to portrait

Severity: P2 (hypothesis)
Surface: Mobile
Area: Platform
Status: Inconsistent
Evidence: `apps/mobile/app.config.js:60` `orientation: 'portrait'` with `supportsTablet: true` and `requireFullScreen: false`, asserted by `apps/mobile/__tests__/ipad-multitasking-config.test.ts`. Apple requires all four iPad orientations when full screen is not required, and nothing has a wide layout. Not verified with a build.
Recommended fix: `requireFullScreen: true`, or declare the iPad orientations and give the primary screens a wide layout; change the test to assert the chosen pair.
Verification: `expo prebuild` then Xcode Validate App.

### [PG-MOB-11] Four modals drift from the house modal pattern

Severity: P3
Surface: Mobile
Area: Accessibility
Status: Accessibility
Evidence: `apps/mobile/app/(app)/chat/[id].tsx:1467` rename modal lacks `accessibilityViewIsModal` and scrim suppression; `apps/mobile/src/features/chat/components/ModeSwitchModal.tsx:89` buttons have no `accessibilityRole`; `apps/mobile/src/features/edge-cases/components/ModelLoadingFirstRunModal.tsx` and `apps/mobile/src/features/onboarding/components/FirstRunDisclosureModal.tsx` mount `<Modal>` with no `onRequestClose`, so Android back is inert (state whether that is intentional).
Recommended fix: extract the pattern from `apps/mobile/src/features/settings/notifications/index.tsx:163` into a `ModalShell` and migrate the four.

### [PG-MOB-12] `loadConversations` paginates the entire cloud history before first paint

Severity: P3
Surface: Mobile
Area: Chat / Performance
Status: Performance
Evidence: `chatMessageStore.ts:187` loops `while (hasMore)` sequentially and writes the store once at the end; the screen shows the empty state for the whole duration (`PG-MOB-03`).
Recommended fix: write the first page immediately; page the rest behind `onEndReached`.

### [PG-MOB-13] A client for three deleted API routes still ships

Severity: P4
Surface: Mobile
Area: Dead code
Status: Unreachable
Evidence: `apps/mobile/services/autotag.ts` posts to `/api/autotag/*`, which `apps/web/app/api/__tests__/autotag-surface-removed.test.ts` asserts are gone; nothing imports it; `apps/mobile/lib/tagUtils.ts` carries eight hex colours.
Recommended fix: delete both and extend the web test to assert the mobile client is gone.

## 8. Chrome extension findings

Command and keybinding parity is guarded on VS Code by `apps/extension-vscode/src/__tests__/commandParity.test.ts`; the Chrome side has no equivalent, which is where the dead items below come from.

### [PG-CHROME-01] Two context-menu items compute a result and discard it

Severity: P2
Surface: Chrome
Area: Page tools
Status: Broken (dead UI)
Evidence: `apps/extension/src/background.ts:4771` and `:4779` send `CAPTURE_ELEMENT` and `GET_ELEMENT_INFO` with a `.catch` and no `.then` (verified); the content script returns a payload nothing consumes.
Recommended fix: write the payload to `chrome.storage.session` under the context-handoff key and open the side panel, reusing `checkPendingContextHandoff()`; or delete the items (RC-2).

### [PG-CHROME-02] "Discover WebMCP tools" has no in-browser outcome

Severity: P3
Surface: Chrome
Area: Browser tools
Status: Missing consumer
Evidence: `background.ts:1044` broadcasts `WEBMCP_TOOLS_CHANGED`; no extension page subscribes; the only consumer is the paired desktop.
Recommended fix: show the item only when the desktop is paired, or render the tools in the Page panel.

### [PG-CHROME-03] First run silently drops a selected-text or summarize handoff

Severity: P2
Surface: Chrome
Area: Onboarding / Chat
Status: Broken
Evidence: `apps/extension/src/side_panel.ts:10700` returns after showing onboarding, before `checkPendingChat()`; the completion callback at `:9968` only re-probes the bridge; the pending payload expires after 30 s (`:10763`) while onboarding is five steps.
Recommended fix: run the pending checks in the completion callback and clear the TTL once surfaced.

### [PG-CHROME-04] Web Store, devtools and view-source pages get a recovery instruction that cannot work

Severity: P2
Surface: Chrome
Area: Page context
Status: Misleading recovery
Evidence: `side_panel.ts:5328` `RESTRICTED` omits the Web Store hosts, `devtools://` and `view-source:`; `describePageContextFailure` at `:4471` then tells the user to add the site under Approved sites, which Chrome never grants for the Web Store.
Recommended fix: extend the list; split the denied copy into grantable and never-grantable.

### [PG-CHROME-05] Signed-out Work runs panel shows an empty state and an error at once, with no sign-in

Severity: P2
Surface: Chrome
Area: Cloud runs / Auth
Status: UX Gap
Evidence: `apps/extension/src/features/cloud-bridge/managedRunControl.ts:242` returns `auth_required`; `apps/extension/src/features/side-panel/cloudRunsPanel.ts:866` paints it red while `renderList()` at `:723` also paints "No active runs". The only sign-in control is inside the settings drawer. Reachable signed-out from the tab bar and the new Automate drawer row.
Recommended fix: branch on the status kind, suppress the empty state while a status shows, and render a sign-in button for `auth_required` (RC-1).

### [PG-CHROME-06] Work runs panel shows "no runs" while loading and after a failure; raw gateway strings reach the user

Severity: P3
Surface: Chrome
Area: Cloud runs
Status: Missing states
Evidence: `cloudRunsPanel.ts:803` always calls `renderList()`; `managedRunControl.ts:88` returns `error.message` verbatim for non-auth errors.
Recommended fix: a `phase` beside `runs`; fixed copy for non-HTTP errors. Check `computerUsePanel.ts` and `browserToolsPanel.ts` for the same shape.

### [PG-CHROME-07] The autonomy popover claims `role="menu"` without arrow navigation

Severity: P3
Surface: Chrome
Area: Accessibility
Status: Accessibility
Evidence: `side_panel.ts:9624` creates the popover with `role: 'menu'`; its only key handler is Escape (`:9717`); the model and attach menus in the same file implement arrows and Home/End.
Recommended fix: lift the arrow block written twice in this file into one helper in `apps/extension/src/features/side-panel/dom.ts` and apply it to all three.

### [PG-CHROME-08] No `chrome.runtime.onInstalled`, so install has no first-run surface

Severity: P3
Surface: Chrome
Area: Onboarding
Status: Missing
Evidence: no `onInstalled` in `apps/extension/src`; onboarding runs only when the user finds and opens the side panel.
Recommended fix: an `onInstalled` listener that opens the options page or side panel, guarded by `ONBOARDING_COMPLETE_KEY`.

### [PG-CHROME-09] Raw Chrome API strings reach the user on page-context failure

Severity: P3
Surface: Chrome
Area: Page context
Status: UX Gap
Evidence: `side_panel.ts:4471` else branch renders `The page could not be read: ${chrome.runtime.lastError.message}`.
Recommended fix: log the raw text, show one fixed sentence.

### [PG-CHROME-10] `capture_page` has no default key and silently requires the desktop app

Severity: P3
Surface: Chrome
Area: Desktop bridge
Status: Partial
Evidence: `apps/extension/manifest.json` `commands.capture_page` has no `suggested_key` and nothing points at `chrome://extensions/shortcuts`; the handler at `background.ts:4968` no-ops into a notification when unpaired.
Overlaps: `GAP-339` is the VS Code twin.

### [PG-CHROME-11] Web sign-in completion tells the user to reopen a panel that already listens for auth

Severity: P4
Surface: Chrome / Web
Area: Auth
Status: Inconsistent (hypothesis)
Evidence: `apps/web/app/auth/chrome-extension/page.tsx` says close and reopen the side panel; `side_panel.ts:8029` registers `observeClerkAuth`. Whether the cookie sync reaches an open panel without reload is unverified.
Verification: sign in with the panel open; if the account row updates, change the copy.

## 9. VS Code extension findings

### [PG-VSCODE-01] Memory is account-synced but the UI still promises workspace-local, never-shared memory

Severity: P1
Surface: VS Code
Area: Settings / Privacy
Status: Broken (misleading claim)
Evidence: commit `db4c07a9` moved memory to `/api/memory/sync` through `apps/extension-vscode/src/memory/accountMemoryClient.ts`; `apps/extension-vscode/package.json:673` still reads "Memory facts apply only to this workspace and are never added to consumer chat history" and `:1000` describes "workspace memory facts" (verified). The data leaves the machine.
Recommended fix: rewrite both strings; add a case to `apps/extension-vscode/src/__tests__/privacy-control-claims.test.ts` (RC-13).
Shared impact: check the scope copy on web, CLI and mobile for the same memory.

### [PG-VSCODE-02] Escape discards a pending diff, unconfirmed, from any editor, with no distance bound

Severity: P2
Surface: VS Code
Area: Diff review
Status: UX Gap
Evidence: `apps/extension-vscode/package.json` binds `escape` to `agi-workforce.rejectDiff` on the global `agi-workforce.hasDiff` context; `apps/extension-vscode/src/providers/diffDecorationProvider.ts:375` `currentSession()` picks the nearest hunk at any distance; the bulk siblings confirm through `confirmDiffBulkAction` (`apps/extension-vscode/src/core/commandSetup.ts:514`). `acceptCurrentDiff` shares the same looseness and writes.
Recommended fix: bound `currentSession()` to a hunk containing the cursor (fall back to `warnNoDiffUnderCursor`), and a `hasDiffInActiveEditor` context for the `when` clause.
Verification: extend `apps/extension-vscode/src/__tests__/diffKeybindingCommands.test.ts` with a cursor-far-from-hunk case.

### [PG-VSCODE-03] The sidebar "Chats" block turns a history failure into "no chats"

Severity: P2
Surface: VS Code
Area: Chat / History
Status: Inconsistent
Evidence: `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1214` `catch { threads = []; }`; the History tree built from the same call renders retryable error rows (`apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:88`). `getThreads()` also resets `listingFailures` as a side effect, so a webview-driven call can erase the tree's error rows (hypothesis on whether the race is hit).
Recommended fix: return `{threads, failures}` instead of mutating shared state; a `recentConversationsError` message with a Retry row, as `schedulesTree.ts` does (RC-1).

### [PG-VSCODE-04] The status bar never reflects auth or in-flight state

Severity: P3
Surface: VS Code
Area: Navigation / Auth
Status: Missing
Evidence: `apps/extension-vscode/src/extension.ts:154` refreshes the item only on model, mode and effort configuration changes; nothing shows busy or signed-out.
Recommended fix: emit turn start and stop from `ChatStateManager` and reuse the account state from `apps/extension-vscode/src/utils/api.ts`.

### [PG-VSCODE-05] The sidebar webview persists no view state

Severity: P3
Surface: VS Code
Area: Chat / Composer
Status: Missing
Evidence: `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2082` acquires the API and never calls `setState`; `retainContextWhenHidden` is set (`apps/extension-vscode/src/core/chatSetup.ts:56`) so hide and show are safe, but window reload, host restart and update lose the typed draft, pending attachments and an uncompleted first turn.
Recommended fix: debounced `setState({draft, scroll})` and restore on load; the extension side already has a `composerDraft` message.

### [PG-VSCODE-06] The "Chats" block is unreachable once a conversation starts and has no loading state

Severity: P3
Surface: VS Code
Area: Chat / History
Status: Partial
Evidence: `webviewContent.ts:4686` `syncRecentChats()` inserts into `emptyStateEl`, which is nulled as soon as a message renders.
Recommended fix: mount the block in a collapsible header region.
Overlaps: the partially shipped state of `GAP-286` and `GAP-287`.

Spot-checks of Open VS Code rows: `GAP-284` is stale as a UI claim (the rewind sender is gone; `ChatStateManager.ts:1531`, `sidebarProvider.ts:160` and the `rewindComplete` handler are orphans to delete), `GAP-292` is true and worse than stated (`showQuickPick` ignores `picked` without `canPickMany`, so there is provably no checkmark), `GAP-295` and `GAP-296` are half shipped, `GAP-294` and `GAP-339` hold. `VSCODE-CLOUDONLY-DESC-CONFLICT-01` holds.

## 10. CLI findings

All runtime unless stated. Baseline quality is high: clap misuse exits 2 on stderr with "did you mean", `NO_COLOR` and pipe detection work, provider and auth errors name the exact fix command, SIGINT races the turn and exits 130 with history reconciliation, the streaming client has a 10 s connect and an idle read bound, and no panic, stack trace or debug-format dump was observed on any path. `audit/ui-gaps.csv` has no CLI rows, so every item below is new. `DESKTOP-CLI-HARNESS-FRAGMENTATION-01` is still true.

### [PG-CLI-01] `agi resume` silently substitutes the session's model and provider

Severity: P1
Surface: CLI
Area: Sessions / Trust boundary
Status: Broken
Evidence: runtime. `apps/cli/src/lib.rs:1310` `resumed_model` keeps the recorded model only if `model_catalog::find` knows it, so every local Ollama or LM Studio tag falls back to the global default with no warning. A session recorded with a local Ollama model tag via `ollama` with `privacy_mode: local` reopened as the default cloud model via `anthropic` while printing "local privacy mode keeps this conversation on this device". The same helper serves `Fork`.
Expected: restore the recorded model, or refuse and say it is unavailable. AGENTS.md §6 forbids silently moving a Local conversation to a cloud provider.
Actual: the next turn goes to a cloud provider under a local-privacy banner.
Root cause: verified (RC-14).
Recommended fix: fall back only when the field is empty; let the existing unknown-model error report the rest; if a fallback is unavoidable, warn on stderr.
Verification: repeat; the banner names the recorded local model via `ollama` or the command exits non-zero naming the model.

### [PG-CLI-02] The npm wrapper's only failure message advertises install paths that do not exist

Severity: P2
Surface: CLI
Area: Install
Status: Broken
Evidence: runtime. `apps/cli/npm/bin/agi.js:80` prints `curl -fsSL https://agiworkforce.com/install.sh | bash` first; that URL returns 404, which `apps/cli/npm/scripts/package-check.mjs:57` already forbids the README from mentioning for that reason. `@agiworkforce/cli` and all six platform packages in `apps/cli/npm/package.json:52` are unpublished, so the wrapper's primary path cannot succeed for any installer today; only `cargo install` works.
Recommended fix: extend the README guard to `bin/agi.js`; replace option one with the npm command once `release-cli.yml` publishes (RC-13).

### [PG-CLI-03] `agi approvals list` prints a static mock of an interactive picker

Severity: P2
Surface: CLI
Area: Approvals
Status: Dead UI
Evidence: runtime. `apps/cli/src/permissions.rs:407` `display_tab` emits "Search…", "1. Add a new rule…" and a keystroke legend from a `println!` that reads no input; called four times by `apps/cli/src/lib.rs:1921` and by the REPL `/permissions` command. The "Recently denied" tab is in every header and never rendered.
Recommended fix: a plain `display_rules()` with an explicit empty-state line, as `agi mcp list` does; keep or delete `display_tab` (no TUI caller exists).

### [PG-CLI-04] The project-trust gate blocks read-only top-level flags the equivalent subcommand allows

Severity: P2
Surface: CLI
Area: Trust
Status: Inconsistent
Evidence: runtime. `apps/cli/src/lib.rs:986` requires trust for any invocation with no subcommand, so `agi --list-models`, `agi --config`, `--cost`, `--stats`, `--search`, `--completions` fail in an untrusted checkout while `agi models list` returns the same data.
Recommended fix: exempt the read-only flag set the way `dump_system_prompt` is exempted; keep `--config` on `load_without_project()`.

### [PG-CLI-05] A turn that fails before the first token is persisted as a resumable session

Severity: P2
Surface: CLI
Area: Sessions
Status: Broken
Evidence: runtime. After an auth failure the managed session file ends on a lone user message, listed in `agi history` as "2 msgs"; the SIGINT arm at `apps/cli/src/lib.rs:2521` repairs exactly this shape and the error arm at `:2594` does not.
Recommended fix: the same `finalize_cancelled_turn` and persist pair in the error arm, or delete a session with no assistant turn; exclude system messages from the message count.

### [PG-CLI-06] `agi login` runs the whole browser flow before discovering stdin is not a terminal

Severity: P3
Surface: CLI
Area: Auth
Status: UX Gap
Evidence: runtime. `agi login anthropic < /dev/null` prints the PKCE URL twice then dies on "not a terminal"; `agi login < /dev/null` polls the device flow for five minutes (`apps/cli/src/auth.rs:491`).
Recommended fix: an `is_terminal()` precheck naming the env-var alternative.

### [PG-CLI-07] `agi plugin list` prints nothing when no plugins are installed

Severity: P3
Surface: CLI
Area: Plugins
Status: Missing empty state
Evidence: runtime: exit 0, zero bytes on both streams. `apps/cli/src/lib.rs:2853` has no empty branch; `agi mcp list` gets it right.

### [PG-CLI-08] A mistyped subcommand is silently sent to the model as a prompt

Severity: P3
Surface: CLI
Area: Navigation
Status: UX Gap
Evidence: runtime. `apps/cli/src/lib.rs:176` pairs an optional subcommand with a bare positional prompt, so `agi modles` becomes a paid turn.
Recommended fix: refuse a single-token prompt within edit distance 2 of a subcommand with a suggestion.

### [PG-CLI-09] `--json` error payloads go to stderr while success payloads go to stdout

Severity: P3
Surface: CLI
Area: Scripting
Status: Inconsistent
Evidence: runtime. `apps/cli/src/lib.rs:2580` prints success to stdout and `:2600` prints the `{"type":"result","is_error":true}` envelope to stderr; `--json-events` already emits errors on stdout.
Recommended fix: print the error envelope on stdout; keep stderr for the human line.

### [PG-CLI-10] `agi resume` with no TTY drops into the REPL, reads EOF and exits 0

Severity: P3
Surface: CLI
Area: Non-interactive
Status: Inconsistent
Evidence: runtime. `apps/cli/src/lib.rs:2618` calls `run_repl` unconditionally; the bare `agi` path guards at `:3688` with "No input received from stdin." and exit 1. `Fork` has the same shape.

### [PG-CLI-11] `agi resume <bad-id>` leads with the fallback's failure, not the user's mistake

Severity: P3
Surface: CLI
Area: Error messaging
Status: UX Gap
Evidence: runtime: "Error: Legacy JSON conversation fallback also failed: …". Two-step resolution at `apps/cli/src/lib.rs:2619`.
Recommended fix: one headline naming the id and `agi session list`; the two lookups as `Caused by`.

### [PG-CLI-12] An unusable proxy surfaces as "builder error"

Severity: P3
Surface: CLI
Area: Networking
Status: UX Gap
Evidence: runtime with a dead `HTTPS_PROXY`: "Network error (…): builder error", one retry, exit 1 in 2.1 s (bounded, good). `apps/cli/src/models/streaming.rs:54` formats with `{}` and falls back to `Client::new()`, which also drops the connect and idle timeouts.
Recommended fix: `{:#}` at the sink; name the proxy variables; do not silently degrade the client.

### [PG-CLI-13] `agi doctor` renders every severity in plain text, even on a TTY

Severity: P3
Surface: CLI
Area: Diagnostics
Status: UX Gap
Evidence: runtime under a pty: no ANSI sequences; `[Warn]` and `overall: Warn` are as loud as `[Pass]`. `terminal_style` already sanitises and honours `NO_COLOR`.

### [PG-CLI-14] `--stream` is an inert flag advertised in `--help`

Severity: P4
Surface: CLI
Area: Flags
Status: Dead UI
Evidence: `apps/cli/src/lib.rs:197` `default_value_t = true` on a `SetTrue` bool; only `--no-stream` acts, so a config default of `stream = false` cannot be overridden for one run.

### [PG-CLI-15] No man page; no PowerShell or Elvish completions

Severity: P4
Surface: CLI
Area: Distribution
Status: Missing
Evidence: runtime: `agi completion powershell` exits 2; `apps/cli/src/lib.rs:660` maps bash, zsh and fish only, while Windows platform packages are declared.

### [PG-CLI-16] i18n is wired but covers ten strings

Severity: P4
Surface: CLI
Area: i18n
Status: Partial
Evidence: `apps/cli/src/tui/widgets/i18n.rs:28` embeds 12 catalogs declaring 10 keys; the module's own header says the migration is partial and nothing ties the list to `packages/ui/i18n`.
Recommended fix: either the CI parity check the module asks for, or stop shipping 12 catalogs for 10 strings.

`agi mcp-server` advertises no tools (`apps/cli/src/app_server.rs:32`) and says so in `--help`; the honest labelling is the right pattern and it is recorded only so it is not re-filed.

## 11. Register reconciliation

What the existing registers hold, and what to do with them.

**Staleness in `audit/ui-gaps.csv`.** Of 36 Open rows read against current code, eight are fixed and should be flipped to Done (`GAP-119`, `GAP-139`, `GAP-161`, `GAP-167`, `GAP-235`, `GAP-242`, `GAP-283`, `GAP-297`; two of them say "Shipped" in their own evidence field), four more from the mobile pass (`GAP-141`, `GAP-177`, `GAP-192`, plus the reachable half of `GAP-191`), and eight cite files that no longer exist (`GAP-141`, `GAP-153`, `GAP-155`, `GAP-164`, `GAP-177`, `GAP-192`, `GAP-193`, `GAP-320`: the mobile voice screen and sidebar directories are gone). Expect the same one-in-five rate across the 132 unchecked rows.

**47 Open rows are decisions, not gaps.** Their own titles read "is declined until X exists" (`GAP-023`, `024`, `025`, `027`, `029`, `036`, `040`, `043`, `047`, `049`, `052`, `054`, `055`, `059`, `061`, `062`, `063`, `065`, `066`, `067`, `069`, `070`, `072`, `078`, `079`, `080`, `081`, `082`, `084`, `087`, `089`, `091`, `093`, `094`, `095`, `097`, `098`, `099`, `100`, `102`, `105`, `108`, `113`, `115`, `116`, `128`, `131`, `133`, `134`, `135`, `137`), and `GAP-160` and `GAP-280` are locked product rules. They account for nearly every Open P1. Re-statusing them to Not Planned or Deferred is guard-safe (`check:ui-gaps --monotonic` fails only when the unresolved count rises) and takes the honest Open count from 219 to about 161 with Open P1 near zero. This file excludes all of them.

**`known-flaws.md` rows to delete or repoint**, with the evidence in this file: `DESKTOP-SINGLE-INSTANCE-MISSING-01`, `DESKTOP-SETTINGS-SYNC-GAP-01`, `DESKTOP-SHORTCUTS-DEFAULTS-DUPLICATE-AND-DISCONNECTED-01`, `DESKTOP-MEMORY-DECAY-BRIDGE-HARDCODED-01`, `DESKTOP-NOTIFICATIONS-SETTINGS-IGNORED-AND-CENTER-UNREACHABLE-01` (fixed), `CONNECTOR-PERMISSIONS-CLIENT-ONLY-01` (stale: permissions persist to `connector_tool_permissions` and the tool loop reads them at `apps/web/app/api/llm/v1/chat/completions/route.ts`), `DESKTOP-ICON-BUTTON-ARIA-LABEL-GAP-01` (repoint to `PG-SHARED-09`), `DESKTOP-REGENERATE-NO-COMPLETION-01` (narrow to Local mode), `CONN-ROUTE-ORG-CONNECTOR-POLICY-CHECKED-01` (repoint to `apps/web/app/api/connectors/route.ts`).

**`ACTIVE_ISSUES.md` rows that are user-visible and still open**: `AGI-3`, `AGI-16`, `AGI-17`, `AGI-20`, `AGI-23`, `AGI-29`, `AGI-30`, `AGI-34`; the rest are internal, code-fixed awaiting live validation, or blocked on decisions. Two of its "Needs live validation" notes are user-visible and belong on the launch list: the public pages that claimed things the code does not do, and every published release predating its own signing.

**`audit/raw-error-to-user.json` is stale in its premise.** It reports zero because the scanner does not see template-literal interpolation; `PG-CHAT-06`, `PG-MOB-06`, `PG-CHROME-06` and `PG-CHROME-09` are raw strings it cannot see. Extend the scanner before trusting the ratchet.

**Documents folded into this file.** `docs/development/ui-truth-map.md` (2026-09-05 route classification) is deleted with this commit; its still-true content is the route inventory in section 0 and `PG-WEB-05`, `PG-WEB-13` to `PG-WEB-16`. Every "fix in flight" deep link it listed now has an e2e spec (`apps/web/e2e/settings-deep-links.spec.ts`). `docs/research/chat-parity-gap-matrix-2026-09-04.md` stays as dated research because a skill pins it; its two still-open rows are `PG-SHARED-14` and the vendor-branch capability flag (`supportsCodeExecution` has zero matches repo-wide). `docs/research/chat-ui-parity-2026-08-30.md` is superseded by `docs/research/leader-ui-measurements-2026-09-04.md` and is a deletion candidate once `docs/agent-context/non-md-artifact-status.json` stops citing it. `docs/work/restructure-execution-queue.md` and `docs/work/release-readiness-2026-08-25.md` are self-licensed for deletion by `docs/work/README.md` once their branch and phase close.

## 12. Cross-surface feature and state matrix

SHARED means one implementation in a shared package; PLATFORM-SPECIFIC means a
native implementation that is correct for the platform; INTENTIONALLY DIFFERENT
means a documented decision; the rest are gaps.

| Capability                       | Web               | Mobile                    | Desktop                      | Chrome           | VS Code                   | CLI                       |
| -------------------------------- | ----------------- | ------------------------- | ---------------------------- | ---------------- | ------------------------- | ------------------------- |
| Chat composer + messages         | PARTIAL           | PLATFORM-SPECIFIC         | SHARED (unified-chat)        | SHARED           | SHARED                    | PLATFORM-SPECIFIC         |
| Regenerate / retry               | SHARED            | PLATFORM-SPECIFIC         | PARTIAL (Local mode missing) | UNVERIFIED       | UNVERIFIED                | INTENTIONALLY DIFFERENT   |
| Continue a stopped turn          | MISSING           | UNVERIFIED                | MISSING (shared list)        | UNVERIFIED       | UNVERIFIED                | ⚪                        |
| Draft survives restart           | BROKEN            | SHARED-equivalent (works) | UNVERIFIED                   | UNVERIFIED       | BROKEN                    | ⚪                        |
| Attachment progress + per-file   | MISSING (shared)  | PARTIAL                   | MISSING (shared)             | MISSING (shared) | MISSING (shared)          | ⚪                        |
| Offline banner + reconnect       | PARTIAL           | PLATFORM-SPECIFIC (works) | PARTIAL                      | MISSING          | UNVERIFIED                | PLATFORM-SPECIFIC (works) |
| Sync failure visible             | ⚪                | BROKEN                    | UNVERIFIED                   | ⚪               | ⚪                        | PLATFORM-SPECIFIC (works) |
| Global search / ⌘K               | BROKEN            | PARTIAL                   | UNVERIFIED                   | PARTIAL          | INTENTIONALLY DIFFERENT   | PLATFORM-SPECIFIC (works) |
| Keyboard shortcut registry       | PARTIAL           | ⚪                        | PARTIAL                      | PARTIAL          | PARTIAL                   | PLATFORM-SPECIFIC (works) |
| Confirmation primitive           | SHARED            | PLATFORM-SPECIFIC (Alert) | MISSING                      | UNVERIFIED       | PLATFORM-SPECIFIC (works) | INTENTIONALLY DIFFERENT   |
| Toast defaults (duration, close) | PARTIAL           | PLATFORM-SPECIFIC         | PARTIAL                      | MISSING          | PLATFORM-SPECIFIC (works) | ⚪                        |
| Reduced motion                   | SHARED (works)    | BROKEN                    | BROKEN                       | UNVERIFIED       | INTENTIONALLY DIFFERENT   | ⚪                        |
| Theme tokens, no literals        | PARTIAL           | PARTIAL                   | BROKEN                       | SHARED (works)   | PLATFORM-SPECIFIC (works) | ⚪                        |
| Copy control                     | 46 ad hoc         | PLATFORM-SPECIFIC         | ad hoc                       | ad hoc           | PLATFORM-SPECIFIC         | ⚪                        |
| Memory scope copy                | UNVERIFIED        | UNVERIFIED                | UNVERIFIED                   | ⚪               | BROKEN                    | UNVERIFIED                |
| Custom MCP connectors            | SHARED (works)    | MISSING                   | MISSING                      | ⚪               | ⚪                        | UNVERIFIED                |
| Local model discovery            | ⚪                | PLATFORM-SPECIFIC (works) | BROKEN                       | ⚪               | ⚪                        | BROKEN (resume)           |
| Notification permission state    | SHARED (works)    | PLATFORM-SPECIFIC (works) | MISSING                      | ⚪               | ⚪                        | ⚪                        |
| Update flow                      | ⚪                | store                     | PARTIAL (Electron)           | store            | marketplace               | npm (BROKEN)              |
| Approval policy reaches runtime  | SHARED (verified) | UNVERIFIED                | UNVERIFIED                   | UNVERIFIED       | UNVERIFIED                | PARTIAL (mock list)       |

## 13. Execution sequence

Dependency-aware and grouped by root cause. A phase is done when its
verification lines pass, not when its code lands.

**Phase 0, data and trust.**

1. `PG-CLI-01` resume must not move a local session to a cloud provider (RC-14).
2. `PG-SHARED-05` invert the memory reset guard to fail closed; then the seven `confirm()` sites (RC-9).
3. `PG-MOB-01` generation failure must not clear the composer (RC-2).
4. `PG-VSCODE-01` memory scope copy (RC-13). Same pass: `VSCODE-CLOUDONLY-DESC-CONFLICT-01`, `PG-CLI-02`, `PG-WEBSET-07`.
5. `PG-WEBSET-05` connector policy gate on the fourth writer; repoint the known-flaws row.
6. `PG-CHAT-04` drafts and parked sends in `partialize` (RC-6).

**Phase 1, broken core workflows.** 7. RC-3 the web shell: `PG-WEB-06` first, which retires `PG-WEB-01`, `PG-WEB-08`, `PG-WEB-09`; then `PG-WEB-05` and `PG-WEB-16`. 8. RC-4 ⌘K ownership: `PG-WEB-02`, `PG-WEB-03`, `PG-WEB-04`, `PG-WEB-11`. 9. `PG-WEBSET-01` project by id. `PG-WEBSET-02` full name in the flush. 10. RC-5 attachments: `PG-CHAT-01`, `PG-CHAT-03`, `PG-CHAT-02`. 11. `PG-DESK-13`, `PG-DESK-03` (RC-11), `PG-DESK-04`, `PG-DESK-01`. 12. `PG-CHROME-01`, `PG-CHROME-03`, `PG-CHROME-04`. `PG-VSCODE-02`. 13. `PG-CLI-03`, `PG-CLI-04`, `PG-CLI-05`.

**Phase 2, misleading, failure and recovery states.** 14. RC-1 and RC-2 as one sweep: `PG-WEB-07`, `PG-WEBSET-03`, `PG-WEBSET-11`, `PG-MOB-02`, `PG-MOB-03`, `PG-MOB-08`, `PG-CHROME-05`, `PG-CHROME-06`, `PG-VSCODE-03`, `PG-DESK-07`. 15. `PG-WEBSET-04` Reconnect, `PG-WEBSET-10` retrySave, `PG-CHAT-07` Continue, `PG-CHAT-10` offline hook (shared). 16. Raw strings: `PG-CHAT-06`, `PG-MOB-06`, `PG-CHROME-09`; extend the raw-error scanner to template literals. 17. `PG-WEBSET-06` deleted chats, `PG-WEBSET-12` consequence copy, `PG-MOB-05` consent capture.

**Phase 3, cross-app inconsistencies.** 18. RC-8 `SonnerToaster` defaults (`PG-SHARED-06`); RC-9 one confirm primitive. 19. `PG-SHARED-08` copy primitive, unified-chat first. `PG-SHARED-11` dates, then `PG-WEBSET-09`. `PG-WEBSET-08` placeholder constant. 20. `CUSTOM-CONNECTORS-DESKTOP-MOBILE-GAP-01`, `PG-WEBSET-14`, `PG-WEBSET-15`, `PG-WEBSET-16`.

**Phase 4, loading, empty, offline and system states.** 21. RC-12 `PG-DESK-05`, `PG-DESK-06`. `PG-DESK-09`, `PG-DESK-02`, `PG-DESK-12`, `PG-DESK-14`, `PG-DESK-11`. 22. `PG-MOB-04`, `PG-MOB-12`. `PG-CLI-07`, `PG-CLI-10`, `PG-CLI-06`, `PG-CLI-09`, `PG-CLI-11`, `PG-CLI-12`. 23. `PG-WEB-14`, `PG-WEB-15`, `PG-CHROME-08`, `PG-VSCODE-04`, `PG-VSCODE-05`, `PG-VSCODE-06`.

**Phase 5, accessibility, responsive, keyboard.** 24. RC-7 colour guard extension (`PG-SHARED-02`), then `PG-SHARED-01`, `PG-SHARED-03`, `PG-WEBSET-13`, `PG-WEB-18`. 25. RC-10 reduced motion: desktop blanket rule (`PG-SHARED-07`), mobile 14 loops (`PG-MOB-07`), then spinner migration. 26. `PG-CHAT-05`, `PG-SHARED-04`, `PG-SHARED-09`, `PG-SHARED-14`, `PG-WEB-10`, `PG-WEB-12`, `PG-CHAT-09`, `PG-CHROME-07`, `PG-MOB-09`, `PG-MOB-11`, `PG-SHARED-13`, `PG-MOB-10`.

**Phase 6, microinteractions and final polish.** 27. `PG-CHAT-08`, `PG-SHARED-10`, `PG-SHARED-12`, `PG-WEB-13`, `PG-WEB-17`, `PG-WEB-19`, `PG-WEB-20`, `PG-DESK-15`, `PG-DESK-16`, `PG-DESK-17`, `PG-DESK-DEAD`, `PG-CHROME-02`, `PG-CHROME-10`, `PG-CHROME-11`, `PG-MOB-13`, `PG-CLI-08`, `PG-CLI-13` to `PG-CLI-16`. 28. Register hygiene from section 11: flip the fixed `GAP-*` rows, re-status the 47 declined rows, delete or repoint the nine known-flaws rows.

**Before public launch**, in addition to Phase 0 and Phase 1: the Chrome extension `CHROME-SURFACE-LOST-TURN-01` and `EXT-CRX-KEY-MISSING-BLOCKS-CLERK-SYNC-01`, the CLI npm publication (`PG-CLI-02`), `AGI-34` confirmed on a deployment, and the two live-validation notes in `ACTIVE_ISSUES.md` that are user-visible.

## 14. What still needs runtime verification

- A signed-in web session for every `PG-WEB-*`, `PG-CHAT-*` and `PG-WEBSET-*` row; the existing `apps/web/e2e/qa-*.spec.ts` sweeps are the harness, and per `.claude/rules/ui-colour-and-interaction.md` a jsdom pass proves nothing for `PG-WEB-12` and `PG-CHAT-09`.
- A desktop build on macOS for `PG-DESK-03`, `PG-DESK-08`, `PG-DESK-13`, and whether `window.confirm` is ever unavailable in either webview host (`PG-SHARED-05`).
- A device or simulator for `PG-MOB-07`, `PG-MOB-10`, `PG-MOB-11`, screen-reader order and dynamic type.
- An extension host for `PG-CHROME-11` and the `PG-VSCODE-03` race.
- A live provider turn for the CLI's SIGINT path, which the crate itself notes has no harness (`apps/cli/src/agent/chat.rs`).
