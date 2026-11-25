---
id: "F005-04"
type: "feature"
title: "Sidebar lists: pinned, recents, projects and date groups"
aliases: ["Recents", "Pinned", "Projects section", "Organize chats", "Date groups", "S5.09 S5.10 S5.11 S5.12 S5.14"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (2 of 5)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S5.09", "S5.10", "S5.11", "S5.12", "S5.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "api:GET /api/chat/conversations", "table:web_conversations", "SYS-sync-and-continuity", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "F005-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-04 Sidebar lists: pinned, recents, projects and date groups

The lists inside the sidebar. Web and Desktop show a Projects section, Pinned chats and Recents grouped by date (six buckets). Mobile's drawer shows projects, Pinned and a flat Recents list; its date groups are on the All chats screen. CLI, VS Code and Chrome have partial equivalents.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.09](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s509), [S5.10](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s510), [S5.11](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s511), [S5.12](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s512), [S5.14](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s514).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (2 of 5) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists the person's chats and projects in the sidebar: pinned first, recents grouped by date or by project, projects with expandable chat lists. (packages/ui/ui/src/sidebar/Sidebar.tsx:210-263, 697-1000)

**Why it exists.** Most people return to a recent chat or a pinned project. The lists keep these one click away.

**Who uses it.** Everyone with more than a few chats.

**Problems it solves**

- Long flat lists hide old chats.
- Project work gets mixed with ordinary chats.
- Pinned chats need a fixed place.

**Use cases**

- Open a chat from Today.
- Pin a chat and find it at the top.
- Expand a project and open one of its chats.
- Switch Organize chats to 'In one list'.

## 2. User experience

**Where to find it**

- Web and Desktop: sidebar middle. Headings 'Projects', 'Pinned', 'Recents'; date headings 'Today', 'Yesterday', 'This Week', 'Last 7 Days', 'Last 30 Days', 'Older'. (packages/ui/ui/src/sidebar/Sidebar.tsx:721-735, 847-870, 1) (packages/ui/ui/src/sidebar/temporal.ts:4-10)
- Mobile drawer: sections 'Projects' (foldable), 'Pinned' (key chat:sidebar.pinned), 'Recents' (key drawer.recents) and 'See all chats'. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:680-880)
- Mobile All chats screen: groups 'Pinned', 'Today', 'Yesterday', 'This Week', 'Older' and filters 'All chats', 'Pinned', 'Unread'. (apps/mobile/src/features/chat/ChatsListScreen.tsx:112-116, 130-160)
- CLI: Sessions picker overlay; grouping helper with Today, Yesterday, This Week then dates. (apps/cli/src/tui/widgets/session_picker.rs:12-14) (apps/cli/src/sessions.rs:1167-1190)
- VS Code: Sessions sheet with Local and Cloud tabs, pinned marker, groups chosen by the person. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3036-3066)
- Chrome: history list in the side panel; pinned entries first, then newest. (apps/extension/src/side_panel.ts:12821-12830)

**Before you start**

- Web lists load after sign-in; recents are paged and more load with 'Show more'. (packages/ui/ui/src/sidebar/Sidebar.tsx:956-975)
- Project list shows only when the host passes project handlers. (packages/ui/ui/src/sidebar/Sidebar.tsx:203-205)

**Screens and controls**

- Date heading buttons toggling a group (aria-expanded). (packages/ui/ui/src/sidebar/Sidebar.tsx:926-950)
- Projects heading with chevron and a 'New project' plus button. (packages/ui/ui/src/sidebar/Sidebar.tsx:716-766)
- 'Organize chats' sliders button: 'In one list' or 'By project'. (packages/ui/ui/src/sidebar/Sidebar.tsx:860-911)
- Project row: click expands its chats; hover buttons 'New chat in <name>' and 'More options for <name>' (Share project, Rename project, Project settings, Project home, Pin project, Delete project). (packages/ui/ui/src/sidebar/Sidebar.tsx:1346-1480)
- 'Show more' and 'Show less' for projects beyond 5 and for chats beyond 5 inside a project. (packages/ui/ui/src/sidebar/Sidebar.tsx:228, 1288, 1330)
- Archive toggle appears when archived chats exist. (packages/ui/ui/src/sidebar/Sidebar.tsx:560-600)
- 'View all' link on the Recents heading opens the chats and tasks page. (packages/ui/ui/src/sidebar/Sidebar.tsx:911-920)

**Journey**

1. Open the app; the sidebar shows loading placeholders, then the lists.
2. Today, Yesterday and This Week open by default; others are closed. (packages/ui/ui/src/sidebar/Sidebar.tsx:114)
3. Click a date heading to open or close it.
4. Click a project row to expand it; click 'Project home' in its menu to open the project page. The draft said a click opens the project; the click only expands.
5. Use the Organize menu to choose By project (chats that belong to a project leave the date list) or In one list. (packages/ui/ui/src/sidebar/Sidebar.tsx:263-271)
6. Click 'Show more' to load the next page of chats.

**What the person sees and gets**

- Skeleton rows while loading; failure card 'Couldn't load conversations' with Retry; empty copy 'No conversations yet' with 'Start a new chat'; 'No archived conversations'. (packages/ui/ui/src/sidebar/Sidebar.tsx:984-1050)
- Mobile empty copy key drawer.noRecentChats. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:872)

**Settings**

- Organize mode is held in component state only on Web (resets on reload). (packages/ui/ui/src/sidebar/Sidebar.tsx:212)
- Mobile persists listArrangement, sidePanelProjectsFolded and sidePanelMoreOpen in the settings store. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:353-358)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop: pinned, six date groups, projects with pinned sub-list, 5-project limit, per-project 5-chat limit, Organize by project or one list. (packages/ui/ui/src/sidebar/Sidebar.tsx:210-263, 697-1000) (packages/ui/ui/src/sidebar/temporal.ts:12-37)
- Paging: 'Show more' loads further conversations. (apps/web/shared/components/layout/WebAppShell.tsx:479-481)
- Failure never claims empty: a failed list with no rows shows the failure card; a failed refresh keeps existing rows. (packages/ui/ui/src/sidebar/Sidebar.tsx:296-304) (packages/ui/ui/src/sidebar/__tests__/Sidebar.loadFailure.test.tsx)
- Keyboard: arrow keys, Home, End, Enter and Escape move through rows with a roving tab stop. (packages/ui/ui/src/sidebar/Sidebar.tsx:330-410)
- Mobile drawer: up to 30 chats, pinned apart, up to 6 projects, expandable project chat lists (5 then 'See all'), Organize sheet. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:169, 457-474, 765-805)
- Mobile All chats: pinned plus four age groups. (apps/mobile/src/features/chat/ChatsListScreen.tsx:130-160)

**Incomplete**

- Draft said four date groups; code has six on Web (adds Last 7 Days and Last 30 Days). Mobile and CLI use fewer. (packages/ui/ui/src/sidebar/temporal.ts:4-10) (apps/mobile/src/features/chat/ChatsListScreen.tsx:158) (apps/cli/src/sessions.rs:1177-1186)
- Mobile drawer does not show date groups; they are on the All chats screen. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:844-870)
- CLI: only the picker with date grouping; no project or pinned lists found. VS Code: pin and user-defined groups but no date groups or project rows in the sheet. Chrome: pinned first; project rows not traced.
- 'Click the Projects heading arrow' works as written; the draft's other claims about project click were wrong (see journey).

**Present but disconnected or switched off**

- Mobile projects section requires FEATURES.projects and the mode to show projects. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:679)
- The old project filter was removed because nothing wired it. (packages/ui/ui/src/sidebar/Sidebar.tsx:535-540 comment)

**Not available**

- Persisting the Web Organize choice or open date groups across reloads: not handled in the code.
- Project rows in CLI and VS Code Sessions sheet: not found.
- Pinned list in Chrome: pinned entries sort first but there is no separate section heading found. (apps/extension/src/side_panel.ts:12821-12830) [inferred]

## 4. Required behaviour

**Established requirements**

- Pinned items appear in their own section at the top of navigation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.09)
- Navigation shows a list of recent conversations that open on selection. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.10)
- Recent conversations can be shown grouped under their projects. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.11)
- Recents are grouped by date buckets (Today, Yesterday, This week, Older). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.12)
- Navigation shows project rows that open the project and expose its actions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.14)

**Acceptance criteria**

1. A pinned chat appears under 'Pinned' and not in a date group.
2. With By project selected, a chat that belongs to a project is not in the date list and appears under its project.
3. Chats from yesterday show under 'Yesterday'; chats from 20 days ago under 'Last 30 Days'.
4. Collapsing every date group does not show the empty state.
5. A failed first load shows 'Couldn't load conversations' and Retry; a failed refresh keeps the rows.
6. With 7 unpinned projects, 5 show with 'Show more'.
7. A project's menu has 'Project home' and it opens the project page.
8. Mobile drawer: pinned chats are listed apart from Recents; with By project, project chats are under their project.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local and Cloud chats must stay in separate lists on Mobile; the drawer filters by app mode. [inferred] from (apps/mobile/src/features/drawer/components/DrawerContent.tsx:446-456).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update brief S5.12 to six buckets.
- [proposed] Persist the organize choice on Web like Mobile does.
- [proposed] Add date groups to the Mobile drawer or state that the All chats screen owns them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Sidebar lists | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Pinned, date groups, Projects, Organize menu, load more, empty and failure states |
| service | getTemporalGroup | `packages/ui/ui/src/sidebar/temporal.ts` | Maps a date to one of six groups; labels |
| service | order helpers | `packages/ui/ui/src/sidebar/order.ts` | Pinned first then newest; adjacent chat lookup |
| config | types | `packages/ui/ui/src/sidebar/types.ts` | SidebarSession, SidebarProject, SidebarTemporalGroup |
| service | toSidebarSessions | `apps/web/shared/components/layout/sidebar-session-rows.ts` | Maps conversations to rows; drops temporary chats |
| hook | useConversations | `apps/web/lib/hooks/useConversations.ts` | Fetches, pages and updates conversations; GET /api/chat/conversations |
| hook | useManagedCloudProjects | `apps/web/features/projects` | Project list for the sidebar (import path only) |
| component | WebAppShell list wiring | `apps/web/shared/components/layout/WebAppShell.tsx` | Builds rows and projects, passes handlers |
| component | WebChatPage list wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Chat route's own rows and projects |
| component | DrawerContent lists | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | Mobile projects, pinned and recents |
| screen | ChatsListScreen | `apps/mobile/src/features/chat/ChatsListScreen.tsx` | Mobile All chats: groups and filters |
| store | settingsStore list arrangement | `apps/mobile/stores/settingsStore.ts` | listArrangement and folded flags (path from import) |
| service | date_group_sessions | `apps/cli/src/sessions.rs` | CLI date grouping |
| component | Sessions sheet | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code list with pin and groups |
| component | Chrome history list | `apps/extension/src/side_panel.ts` | Recents with pinned first and search |
| endpoint | GET /api/chat/conversations | `apps/web/app/api/chat/conversations` | Paged list with limit and offset |
| table | web_conversations | `apps/web/lib/server/neon-chat.ts` | Source table for rows (name from SQL in the file) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| After sign-in the hook requests the first page of conversations; later pages load on 'Show more'. | our servers | apps/web/lib/hooks/useConversations.ts:196, 552 |
| The shell maps conversations to rows and adds run state, work mode and unread. | device | apps/web/shared/components/layout/WebAppShell.tsx:271-285 |
| The Sidebar filters archived, splits pinned, groups by date, sorts newest first. | device | packages/ui/ui/src/sidebar/Sidebar.tsx:240-263 |
| Projects come from the project store loaded from the managed cloud projects service. | our servers | apps/web/shared/components/layout/WebAppShell.tsx:258-259 |
| Mobile drawer reads Local or Cloud stores and filters by app mode. | device | apps/mobile/src/features/drawer/components/DrawerContent.tsx:446-456 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation and project lists | Server database for Cloud; chat store in memory on Web; Local chats on the phone | Cloud yes; Local no | Per chat; see F005-06 |
| Expanded groups, organize mode, show-all flags | Component state (Web) | No | Lost on reload |
| Mobile list arrangement and folded flags | Mobile settings store | unknown | unknown |

**Models and providers.** No model is used to build these lists. Auto titles come from elsewhere (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for Web and Cloud lists. |
| Permissions | Workspace scope decides which conversations are listed. (apps/web/app/api/chat/conversations/__tests__ has route.organization-scope.test.ts) |
| Subscription | none found for the lists. A usage meter in the sidebar footer appears only for paid plans. (packages/ui/ui/src/sidebar/Sidebar.tsx:1066) |
| Limits and metering | Page size comes from MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE; drawer limit 30 on Mobile; 5 projects and 5 chats shown first on Web. (apps/web/lib/hooks/useConversations.ts:55) |
| Feature flags | Mobile FEATURES.projects. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:679) |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Mobile Local mode shows only Local chats and Local projects. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:446-474) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Five pulsing skeleton rows with status role, only while the list is empty. | packages/ui/ui/src/sidebar/Sidebar.tsx:985-1000 |
| Empty | 'No conversations yet' with 'Start a new chat'; archived view says 'No archived conversations'. | packages/ui/ui/src/sidebar/Sidebar.tsx:1031-1055 |
| Error | Failure card with the error text and Retry only when no rows were ever loaded. | packages/ui/ui/src/sidebar/Sidebar.tsx:296-304, 1003-1029 |
| Load more in flight | Button disabled with a spinner. | packages/ui/ui/src/sidebar/Sidebar.tsx:956-975 |
| All groups collapsed | Empty state does not show. | packages/ui/ui/src/sidebar/Sidebar.tsx:284-292 |
| Archived chats | Hidden from lists; shown through the archive toggle. | packages/ui/ui/src/sidebar/Sidebar.tsx:226-262 |
| Date edge | Invalid dates are treated as the epoch so they fall in Older. | packages/ui/ui/src/sidebar/temporal.ts:40-47 |
| Accessibility | aria-expanded on group and project buttons; hover-only actions also show on focus and on touch. | packages/ui/ui/src/sidebar/Sidebar.tsx:926-950, 740-744 |
| Offline | not handled in the code beyond the failure card. | packages/ui/ui/src/sidebar/Sidebar.tsx:1003 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/sidebar/__tests__/Sidebar.pinnedAndSearch.test.tsx`: Pinned section: lifted out of groups, stable order, archived pins only in archived view
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.projects.test.tsx`: Project header actions, expand inline, Show more, open a chat from a project
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.recentsHeader.test.tsx`: Recents label and View all link
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.emptyState.test.tsx`: Empty state with collapsed groups
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.loadFailure.test.tsx`: Failure card versus empty state, retry
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.loadMore.test.tsx`: Load more control
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.recentsReconciliation.test.tsx`: Recents reconciliation (contents not read)
- `packages/ui/ui/src/sidebar/__tests__/order.test.ts`: Ordering helpers
- `apps/mobile/__tests__/DrawerContent.test.tsx`: Projects fold, pinned apart from Recents, organize by project or one list
- `apps/mobile/__tests__/ChatsListScreen.test.tsx`: All chats screen (contents not read)
- `apps/mobile/__tests__/ChatsListRecents.test.tsx`: Mobile recents (contents not read)

**Test scenarios**

- **Six date buckets**
  1. Use an account with chats from today, yesterday, 3, 10 and 40 days ago.
  2. Open the sidebar.
  - Expected: Groups appear under matching headings; first three open by default.
- **Pin**
  1. Pin a chat from its row menu.
  - Expected: It moves to 'Pinned'.
- **Projects limit**
  1. Create 7 projects.
  2. Open the sidebar.
  - Expected: 5 listed plus 'Show more'.
- **Organize**
  1. Open Organize chats.
  2. Choose In one list.
  - Expected: Project chats join the date lists.
- **Failure**
  1. Block /api/chat/conversations on first load.
  - Expected: Failure card with Retry; Retry reloads.
- **Mobile drawer**
  1. Open the drawer in Cloud mode with projects and pinned chats.
  - Expected: Projects, Pinned and Recents sections as described; All chats screen shows date groups.

**Where to look when it fails**

- Row test ids session-running-<id>, session-needs-you-<id>.
- Network log for GET /api/chat/conversations?limit&offset.
- Mobile: alert text and drawer.scroll test id.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)
- CLI: [70-qa/test-plans/cli/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/cli/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)
- Chrome: [70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **Brief lists four date buckets; code has six on Web** Affects: Docs and testers. Evidence: packages/ui/ui/src/sidebar/temporal.ts:4-10. Work needed: Update brief S5.12
- **Mobile drawer has no date groups** Affects: Mobile users. Evidence: apps/mobile/src/features/drawer/components/DrawerContent.tsx:844-870. Work needed: Decide if needed in the drawer
- **Web organize mode and group state not persisted** Affects: Web and Desktop users. Evidence: packages/ui/ui/src/sidebar/Sidebar.tsx:212, 207. Work needed: Optional persistence
- **CLI lacks projects and pinned; VS Code lacks projects and date groups; Chrome project rows unverified** Affects: Those apps. Evidence: No matching code found; brief S5.09, S5.11, S5.12, S5.14. Work needed: Build or mark not applicable
- **Draft assumed project click opens the project** Affects: Docs. Evidence: packages/ui/ui/src/sidebar/Sidebar.tsx:1350. Work needed: Correct docs; consider if click should open

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- api:GET /api/chat/conversations
- table:web_conversations
- SYS-sync-and-continuity
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- F005-05

## Unknown

- Whether Chrome shows project rows.
- Mobile settings store persistence and sync.
- How the managed projects store loads (path from import only).
- How the CLI picker is populated and sorted beyond date_group_sessions.
- Page size constant value.
