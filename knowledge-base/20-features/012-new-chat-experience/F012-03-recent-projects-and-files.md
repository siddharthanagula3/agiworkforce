---
id: "F012-03"
type: "feature"
title: "Recent projects and files"
aliases: ["Recent projects", "Recent files", "Attach from Library", "Add from library", "@ mentions", "Projects list", "Recent activity"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S12.06", "S12.07"]
depends_on: ["SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:cloud", "api:GET /api/projects", "table:web_conversations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-03 Recent projects and files

Gets a person into earlier work in one step. Web and Desktop list projects in the sidebar (five at first) and library files in the plus menu. Mobile offers recent files in 'Attach from Library'. CLI ranks recently modified files first in @ mentions and lists recent sessions. VS Code lists three projects.

Area: [12. New-chat experience](README.md). Requirement items: [S12.06](../../10-requirements/capabilities/012-new-chat-experience.md#s1206), [S12.07](../../10-requirements/capabilities/012-new-chat-experience.md#s1207).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Offers recent projects and recently used files so the next message can start inside a project or carry a file without searching.

**Why it exists.** Most chats continue earlier work; shortcuts cut the steps to resume (brief S12.06, S12.07).

**Who uses it.** Returning people who keep projects and attach the same files often.

**Problems it solves**

- Finding a project in a long list.
- Re-attaching a file from an earlier chat.
- Starting a chat in the right project.

**Use cases**

- Open the web sidebar and click a project.
- On mobile open 'Add to chat' and choose a file under 'Attach from Library'.
- In the CLI type @ and see the ten most recently modified files first.
- In VS Code tap a project under 'Projects' to open it.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron): sidebar section 'Projects' with expand and 'See all' controls (packages/ui/ui/src/sidebar/Sidebar.tsx:727; WebChatPage.tsx:7392); composer plus menu row 'Add from library' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:159).
- Mobile: 'Add to chat' sheet, section 'Attach from Library' and row 'Project' (AddToChatSheet.tsx:760,1272).
- CLI: type @ in the composer; start panel 'Recent activity' (mentions.rs:32; tui_app.rs:2773-2830).
- VS Code: start panel group 'Projects' (webviewContent.ts:9348).
- Chrome: not found in the code read.

**Before you start**

- Signed in for web projects (list read from /api/projects) and mobile Cloud library.
- Mobile Local mode lists files from local conversations only (AddToChatSheet.tsx:368-385).

**Screens and controls**

- Web sidebar: pinned projects first, then others, first five shown, 'See all' expands (Sidebar.tsx:228-234,818-836).
- Web plus menu: expandable 'Add from library' group with a browse link and per-file attach buttons.
- Mobile sheet: horizontal list of library items with file name and the chat or source as subtitle; 'Project' row shows the active project or 'Choose'.
- CLI: mention picker over git-tracked and untracked files, newest ten first.
- VS Code rows: project name and 'Use in this chat'.

**Journey**

1. Open a new chat.
2. Open the sidebar, plus menu, Add to chat sheet, @ picker or start panel.
3. Pick a project or file.
4. The project becomes the chat's project, or the file is attached to the draft.
5. Send.

**What the person sees and gets**

- Attachment chips in the composer.
- Project label on the composer or sheet.
- Errors: web library attach shows 'could not attach' copy; mobile cloud library shows a loading or error state.

**Settings**

- Mobile project scope follows Local or Cloud mode.
- Web projects page; project defaults (model, privacy).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web sidebar project list built from the project store (WebChatPage.tsx:1658-1670) with a limit of 5 before 'See all' (Sidebar.tsx:228).
- Web projects API returns a paged list with conversation counts and org-shared flags (apps/web/app/api/projects/route.ts:255 GET; query lines 85-125).
- Web library attach from the plus menu (ComposerPlusMenu.tsx:1020-1060).
- Mobile recent files: Local from local conversations, newest first, images excluded (AddToChatSheet.tsx:368-385; mobileGlobalSearch.ts:139-155); Cloud from library page of images and files, videos excluded (AddToChatSheet.tsx:399-421).
- CLI mention ranking puts the ten most recently modified files first (mentions.rs:32,82-95) and the start panel lists up to 3 sessions from the current folder, pinned first (tui_app.rs:2245,2289-2312).
- VS Code lists 3 projects (startSuggestions.ts:9-25).

**Incomplete**

- Web: 'recent' projects are the project store order with pinned (starred) first; whether that is last-used order was not established.
- Mobile: no recent-projects shortcut; only a 'Project' picker row.

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI project shortcuts: mentions.rs handles files only; the brief's lib.rs line 2585 is unrelated code (confirmed by reading it).
- Chrome recent projects: the side panel has a chooseChatProject hook (side_panel.ts:13673) but no list on the empty state was found.
- Recent-file offer on the empty new-chat screen itself for Web: it lives in the plus menu.

## 4. Required behaviour

**Established requirements**

- The new-chat screen offers shortcuts to recent projects that open the project or start a chat in it. (source: brief S12.06)
- When starting a chat the user is offered recently used files to attach in one step. (source: brief S12.07)
- Mobile library files that are videos are not offered; images are excluded from local recents. (source: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:373-407)
- The sidebar shows five unpinned projects before 'See all'. (source: packages/ui/ui/src/sidebar/Sidebar.tsx:228)

**Acceptance criteria**

1. With 7 unpinned projects the web sidebar shows 5 and a control to show all.
2. Clicking a project opens it.
3. Mobile Local with earlier attachments lists non-image files newest first in 'Attach from Library'.
4. Mobile Cloud shows a loading state then picks, or an error state if the library fails.
5. CLI @ with no query lists the ten most recently modified files before shorter paths.
6. VS Code signed out shows no 'Projects' group.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Recent should mean last used; the API returns last_used_at, which may be intended for ordering [inferred from route.ts select list].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Order projects by last use and show the top few on the new-chat screen.
- [proposed] Add a recent-projects shortcut to Mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Sidebar projects section | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Pinned and unpinned projects, limit 5, 'See all'. |
| screen | WebChatPage sidebarProjects | `apps/web/features/chat/pages/WebChatPage.tsx` | Maps project store entries to sidebar rows. |
| endpoint | GET /api/projects | `apps/web/app/api/projects/route.ts` | Paged project list with conversation counts and shared-project scope. |
| table | web_conversations | `apps/web/app/api/projects/route.ts` | Counted per project in the list query; the projects table name was not seen. |
| component | ComposerPlusMenu library group | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | 'Add from library' with attach and browse link. |
| component | ChatComposerNew project picker | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Project picker and mention list with projects and files. |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Attach from Library list, Project row. |
| service | recentMobileFiles | `apps/mobile/src/features/search/mobileGlobalSearch.ts` | Orders local attachments by message time. |
| store | mobile project stores | `apps/mobile/src/features/projects/store.ts` | Local projects; cloud projects in apps/mobile/stores/projects/cloudProjectStore.ts. |
| component | CLI mentions | `apps/cli/src/mentions.rs` | File candidates (git ls-files or bounded walk), recency first, ranking, expansion. |
| screen | CLI StartPanel | `apps/cli/src/tui/tui_app.rs` | Recent sessions rows for the current folder. |
| service | VS Code startSuggestions | `apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts` | recentProjects with limit 3. |
| component | VS Code project rows | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Rows that post openSuggestedProject. |
| command | openSuggestedProject handler | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Runs the open-project command. |
| hook | use-project-chat-defaults | `apps/web/features/projects/hooks/use-project-chat-defaults.ts` | Applies project defaults to chats (imported by WebChatPage). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web loads projects into a store from the projects API and draws the sidebar. | our servers | apps/web/app/api/projects/route.ts:255; WebChatPage.tsx:1636-1655 |
| Picking a project sets it as the active project for the next chat. | device | WebChatPage.tsx:1651-1655 (setActiveProject from URL); composer picker in ChatComposerNew.tsx |
| Mobile Local builds the file list from stored conversations on the device. | device | AddToChatSheet.tsx:368-385 |
| Mobile Cloud requests a library page when the sheet opens. | our servers | AddToChatSheet.tsx:399-436 |
| CLI lists files with git, falling back to a bounded directory walk, and reads session rows from the local session database. | device | mentions.rs:2-12,60-100; tui_app.rs:2260-2282 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Projects | Our database through the projects route; mobile has local and cloud project stores | Web and Cloud mobile through the server; Local mobile projects stay on device | unknown |
| Mention file list | Memory only in the CLI | No | Rebuilt per session |

**Models and providers.** None; no model is used to list or rank.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web projects and Mobile Cloud library need sign-in. CLI and Mobile Local file lists do not. |
| Permissions | Project list limited to the user's projects and shared organisation projects (route.ts:60-72). |
| Subscription | none found in the code for the lists. |
| Limits and metering | Page size and max offset are constants imported in route.ts; sidebar limit 5; VS Code 3; CLI start panel 3 sessions; mention candidates capped at 20,000 and files over 256 KiB are named but not inlined (mentions.rs:20-26). |
| Feature flags | none found |
| Model compatibility | not applicable |
| Provider restrictions | none found |
| Local mode | Mobile Local lists attachments from local conversations only. CLI always works on device. Local projects exist on mobile (store:local projects). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web plus menu shows a spinner; mobile shows a loading state. | ComposerPlusMenu.tsx:1061; AddToChatSheet.tsx:752-760 |
| Error | Web shows attach failed copy; mobile shows an error state; CLI start panel shows 'No recent activity' when empty. | ComposerPlusMenu.tsx:1024-1031; AddToChatSheet.tsx:424-427; tui_app.rs:2815-2820 |
| Empty | Sections hidden when nothing to list. | AddToChatSheet.tsx:752-756; Sidebar.tsx:230 |
| git not available or slow (CLI) | 3 second timeout then bounded walk. | mentions.rs:38-40 |
| Deleted project (mobile) | Projects with deletedAt are ignored. | AddToChatSheet.tsx:363-367 |
| Offline | not handled in the code beyond error states. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ComposerPlusMenu.test.tsx`: Plus menu rows (body not opened).
- `apps/cli/src/mentions.rs`: Inline unit tests: ranking, limit, cursor, gitignore fallback in bounded time, '@' inside a word.
- `apps/mobile/__tests__/ChatThreadProjectOrigin.test.tsx`: Matched a search for AddToChatSheet or recent files; body not opened.

**Test scenarios**

- **Sidebar limit**
  1. Create 7 unpinned projects.
  2. Open the sidebar.
  - Expected: 5 shown with a control to expand.
- **Mobile local recent file**
  1. Attach a PDF in a Local chat.
  2. Open a new chat and the Add to chat sheet.
  - Expected: The PDF appears first under 'Attach from Library'.
- **Mobile cloud library error**
  1. Go offline in Cloud mode.
  2. Open the sheet.
  - Expected: Error state in the library block.
- **CLI recency**
  1. Touch a file.
  2. Type @ in the CLI.
  - Expected: The touched file is among the first ten.
- **VS Code signed out**
  1. Sign out.
  2. Open a new chat.
  - Expected: No 'Projects' group.

**Where to look when it fails**

- Web: network call to /api/projects.
- Mobile: library request errors set status 'error' (AddToChatSheet.tsx:424).
- CLI: git failure falls back silently.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)
- VS Code: [70-qa/test-plans/vscode/012-new-chat-experience.md](../../70-qa/test-plans/vscode/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **No recent-projects shortcut on the new-chat screen itself** Affects: Web, Desktop, Mobile, Chrome. Evidence: Projects appear in the sidebar (Sidebar.tsx:710) and pickers, not in the empty-state area (WebChatPage.tsx:7646-7710). Work needed: Decide whether the sidebar counts; if not add a short list.
- **CLI project shortcuts not established** Affects: CLI. Evidence: mentions.rs covers files only. Work needed: Verify or implement.
- **Recency of projects not proven** Affects: Web. Evidence: sidebarProjects order follows the store (WebChatPage.tsx:1658). Work needed: Confirm order or sort by last_used_at.
- **Chrome not read** Affects: Chrome. Evidence: Brief says done; no code opened. Work needed: Read side_panel.ts selectActiveProject and the project chooser.
- **Brief line pointers are stale** Affects: All. Evidence: e.g. WebChatPage.tsx:5313 no longer matches. Work needed: Regenerate the brief.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:cloud
- api:GET /api/projects
- table:web_conversations

## Unknown

- Name of the projects table and the order in which the projects store sorts.
- Endpoint for the web library list and mobile fetchLibraryPage.
- Chrome project shortcuts.
- Behaviour on Desktop Electron beyond loading the web app.
- Whether recent files on Web are ordered by use.
