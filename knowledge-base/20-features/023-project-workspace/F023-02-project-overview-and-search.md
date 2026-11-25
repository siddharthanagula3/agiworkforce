---
id: "F023-02"
type: "feature"
title: "Project overview and search"
aliases: ["Project overview", "Project page", "Project header", "Search projects", "Project gallery", "agi projects show"]
area: "23 Project workspace"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S23.05", "S23.20"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "mode:cloud", "mode:local", "api:GET /api/projects", "api:GET /api/projects/{id}", "table:user_projects", "F023-01", "SYS-shared-ui-and-design", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-02 Project overview and search

A project opens to an overview with its name, icon, description and sections (Chats, Artifacts, Work, Sources, Scheduled on web). People find projects by typing in a search box that matches name or description in the loaded list. The CLI and VS Code show detail but cannot search.

Area: [23. Project workspace](README.md). Requirement items: [S23.05](../../10-requirements/capabilities/023-project-workspace.md#s2305), [S23.20](../../10-requirements/capabilities/023-project-workspace.md#s2320).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 2) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows one project's identity and sections, and filters the project list by name or description (packages/ui/unified-chat/src/components/ProjectGallery.tsx:116-135).

**Why it exists.** People need to see what a project holds and to find one among many. Brief items S23.05 and S23.20 (doc: knowledge-base/data/area-briefs/023-project-workspace.md).

**Who uses it.** Signed-in users of Web, Desktop (hosted web), Mobile, CLI and VS Code; Chrome shows a project chip only.

**Problems it solves**

- Finding the right project quickly
- Seeing at a glance what is inside a project

**Use cases**

- Type 'brand' to find the Brand refresh project on web.
- Open a project on the phone and switch between Chats and Sources.
- Run agi projects show <name> to see instructions and files.
- Open a project in the VS Code quick pick to read about, files and recent conversations.

## 2. User experience

**Where to find it**

- Web: Projects page then a project card; route /chat/projects/{id} (apps/web/app/chat/projects/[id]/page.tsx).
- Mobile: Projects tab, search field 'Search projects' (apps/mobile/app/(app)/(tabs)/projects.tsx:451-452); tapping a card opens apps/mobile/app/(app)/projects/[id].tsx.
- CLI: agi projects list and agi projects show (apps/cli/src/lib.rs:3673, 3687).
- VS Code: Projects view and command 'Code: Open Project' (apps/extension-vscode/package.json:670).
- Chrome: project chip in the side panel (apps/extension/src/side_panel.ts:11563-11577).

**Before you start**

- Cloud mode and signed in; the list needs access to the workspace (apps/web/app/api/projects/route.ts:49-51).
- Mobile Local mode lists device projects (projects.tsx:79-82).

**Screens and controls**

- Web search input aria-label 'Search projects', placeholder 'Search projects...' (ProjectGallery.tsx:245-251) with button 'Clear search' (ProjectGallery.tsx:443-447).
- Web project tabs: Chats, Artifacts, Work, Sources, Scheduled (page.tsx:50-58) in a tab list named 'Project tabs' (page.tsx:1126).
- Web header: back button 'Back to projects', menu 'Project options' with Share and Settings (page.tsx:546, 574, 623, 661).
- Mobile tabs: Chats, Work, Sources, Artifacts, Routines; last three on Cloud projects only (apps/mobile/app/(app)/projects/[id].tsx:219-228).
- Mobile list Sort and Filter menus (projects.tsx:179-195, 241, 263).

**Journey**

1. Open the Projects list.
2. Optionally type in the search box; the list filters as you type.
3. Select a project.
4. Read the header and choose a section tab.
5. Use the composer on the page to start a chat in the project.

**What the person sees and gets**

- Empty list: 'No projects yet.' with 'Group conversations, attach files, and share instructions.' (apps/web/app/chat/projects/page.tsx:405-420).
- No match: 'No projects match "<query>".' and 'Try another name or description, or clear the search.' (ProjectGallery.tsx:430-440).
- When more pages exist: 'No match in the projects loaded so far.' (ProjectGallery.tsx:431).
- Loading: aria-label 'Loading project' (page.tsx:362); mobile 'Loading projects' and 'Try again' (projects.tsx:307-323).
- CLI shows description, conversation count, instructions and knowledge files (lib.rs:3715-3747).

**Settings**

- Mobile sort: recent or name (projects.tsx:179-190).
- Web starred projects sort first (ProjectGallery.tsx:124-127).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web search filters archived-out active projects by name or description, case-insensitive (ProjectGallery.tsx:116-135).
- Mobile search does the same with locale lower-casing (projects.tsx:163-172).
- GET /api/projects/{id} returns the project with conversationCount and a version ETag (apps/web/app/api/projects/[id]/route.ts:106-143).
- Web detail page loads the project from the store or fetches it, and shows a not-found or error state with retry (page.tsx:253-330).
- CLI show prints counts, instructions and knowledge files (apps/cli/src/lib.rs:3687-3747).
- VS Code detail quick pick groups About, Knowledge files, Recent conversations, Actions, Edit (apps/extension-vscode/src/features/projects/projectActions.ts:91-168).

**Incomplete**

- Search runs only over projects already loaded; more pages need 'Load more' (page.tsx:467-474; ProjectGallery.tsx:431).
- The server list and detail return conversationCount only; knowledgeFileCount and memberCount exist in the schema but were not found in the row mapper (apps/web/lib/projects.ts:50, 161; packages/contracts/cloud-contracts/src/projects.ts:61-63).
- CLI has no search and its list is cached (apps/cli/src/lib.rs:3673-3686).

**Present but disconnected or switched off**

- None found.

**Not available**

- Search on CLI, VS Code and Chrome (brief: missing).
- Server-side search of projects: no query parameter in GET /api/projects (route.ts:44-70).

## 4. Required behaviour

**Established requirements**

- Opening a project shows name, description, counts and main sections (chats, files, instructions). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.05)
- Users can search projects by name or description. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.20)
- Where a project is shared, the overview explains what is shared and what stays personal. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.34)

**Acceptance criteria**

1. Typing part of a project name shows only matching active projects.
2. Typing part of a description matches too.
3. A query with no match shows the no-match message and a working 'Clear search'.
4. Opening a project shows its name, description and the section tabs.
5. Archived projects are not in the default list (ProjectGallery.tsx:118).
6. Mobile Local shows only device projects and Cloud shows only account projects.
7. Deep link to a missing project shows a not-found state, not a blank page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Counts for files and members should appear on the overview as the brief says; the server does not return them [inferred from route and mapper reading].
- Search should cover unloaded pages or say clearly it does not [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a server-side q parameter to GET /api/projects.
- [proposed] Add a text filter to agi projects list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProjectGallery | `packages/ui/unified-chat/src/components/ProjectGallery.tsx` | Search box, filtering, empty states. |
| component | ProjectCard | `packages/ui/unified-chat/src/components/ProjectCard.tsx` | Card showing icon and colour. |
| screen | Web projects list | `apps/web/app/chat/projects/page.tsx` | Paging, load more, empty states. |
| screen | Web project page | `apps/web/app/chat/projects/[id]/page.tsx` | Overview header, tabs, composer. |
| endpoint | GET /api/projects | `apps/web/app/api/projects/route.ts` | Keyset-paged list with conversation count. |
| endpoint | GET /api/projects/{id} | `apps/web/app/api/projects/[id]/route.ts` | One project with version ETag. |
| hook | useManagedCloudProjects | `apps/web/features/projects/index.ts` | Loads and retries the project list on web. |
| service | managed-cloud-projects | `apps/web/features/projects/services/managed-cloud-projects.ts` | Web client for the projects routes. |
| screen | Mobile Projects tab | `apps/mobile/app/(app)/(tabs)/projects.tsx` | List, search, sort, filter. |
| screen | Mobile project page | `apps/mobile/app/(app)/projects/[id].tsx` | Tab bar and tab content. |
| component | CloudProjectOverview | `apps/mobile/src/features/projects/components/CloudProjectOverview.tsx` | Mobile overview header. |
| command | agi projects list/show | `apps/cli/src/lib.rs` | CLI list and detail. |
| service | project_detail | `apps/cli/src/cloud/mod.rs` | Fetches project and knowledge files (line 525). |
| component | projectsTree and showProjectDetail | `apps/extension-vscode/src/features/projects/projectsTree.ts` | VS Code project list view. |
| component | project chip | `apps/extension/src/side_panel.ts` | Chrome active project chip with stop control. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The web page reads the project list from the store and the list route, keyset paged. | our servers | apps/web/app/api/projects/route.ts:44-134 |
| The search text filters the loaded list in the browser. | device | packages/ui/unified-chat/src/components/ProjectGallery.tsx:116-135 |
| Opening a project not in the store fetches it by id; 404 shows not found. | our servers | apps/web/app/chat/projects/[id]/page.tsx:285-312 |
| Chats tab fetches /api/chat/conversations?projectId=... | our servers | apps/web/lib/hooks/useConversations.ts:1066 |
| CLI refreshes the project list from the account, caches it, and prints from the cache. | device and our servers | apps/cli/src/cloud/mod.rs:417-440 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project list pages and the project row | Server table user_projects; in memory in the web store | Read from the account | Not stored by this feature beyond caches |
| CLI project cache | local cache file (apps/cli/src/cloud/mod.rs:90-102) | Refreshed on each list or show | Cleared on sign-out (cloud/mod.rs:127) |
| Mobile cloud details | cloud project store on device | Pulled by refreshCloudProjectDetails (apps/mobile/src/features/projects/service.ts:56-64) | Per account epoch |

**Models and providers.** No model or provider takes part in overview or search.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud: signed in. Mobile Local: none. |
| Permissions | List applies the workspace access gate (route.ts:49-51) and includes projects shared by organization scope (route.ts:74-79). A project the user cannot see returns 404 (apps/web/app/api/projects/[id]/route.ts:129-131). |
| Subscription | Projects capability needs a cloud-chat tier (billing-catalog.ts:348). The list route applies the access gate, not the limit. |
| Limits and metering | Page size and offset are capped by contract values (route.ts:55-72). Rate limit 'chat-conversation'. |
| Feature flags | None found. |
| Model compatibility | Not model dependent. |
| Provider restrictions | None found. |
| Local mode | Web: not available. Mobile Local lists device projects (projects.tsx:79-82). CLI list needs the account. Chrome and VS Code need the account. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner region labelled 'Loading project' on web; 'Loading projects' on mobile. | page.tsx:362; projects.tsx:307-308 |
| Error | Web: 'Project could not be loaded.' with retry; mobile 'Try again' button. | page.tsx:304-312; projects.tsx:320-323 |
| Not found | 404 resolves to not-found state on web. | page.tsx:303-307 |
| Empty | 'No projects yet.' or 'No archived projects.' | apps/web/app/chat/projects/page.tsx:405-420 |
| Offline | Mobile detects connection failure and shows retry text; web: not handled in the code looked at. | projects.tsx:73-79 |
| Large projects | Web warns at 80 chats: 'Consider archiving older ones for performance.' | page.tsx:97, 1100-1115 |
| Accessibility | Tab list uses role tablist, tab and tabpanel with ids. | page.tsx:1126-1170 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/projects/page.test.tsx`: Web projects list page (by name).
- `apps/web/app/chat/projects/[id]/page.test.tsx`: Web project page (by name).
- `apps/web/app/chat/projects/[id]/page.org-shared.test.tsx`: Shared project page (by name).
- `apps/web/features/projects/components/__tests__/ProjectLists.test.tsx`: Project list components (by name).
- `apps/mobile/src/features/projects/__tests__/projectList.test.ts`: Mobile list helpers (by name).
- `apps/mobile/src/features/projects/__tests__/ProjectsListPinFilter.test.tsx`: Mobile pin and filter (by name).
- `apps/extension-vscode/src/__tests__/projectsView.test.ts`: VS Code view (by name).

**Test scenarios**

- **Search by name**
  1. Have three projects
  2. Type part of one name
  - Expected: Only matching projects show.
- **Search by description**
  1. Type a word only in one description
  - Expected: That project shows.
- **No match**
  1. Type nonsense
  2. Choose Clear search
  - Expected: No-match text then full list.
- **Open missing project**
  1. Open /chat/projects/<unknown uuid>
  - Expected: Not-found state.
- **CLI show**
  1. Run agi projects show <name>
  - Expected: Shows description, conversations, instructions and files.

**Where to look when it fails**

- Server log 'Failed to fetch projects' (route.ts:128).
- Not found comes from createError.notFound 'Project not found'.
- Table user_projects and web_conversations (project_id).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/023-project-workspace.md](../../70-qa/test-plans/web/023-project-workspace.md)
- Desktop: [70-qa/test-plans/desktop/023-project-workspace.md](../../70-qa/test-plans/desktop/023-project-workspace.md)
- Mobile: [70-qa/test-plans/mobile/023-project-workspace.md](../../70-qa/test-plans/mobile/023-project-workspace.md)
- CLI: [70-qa/test-plans/cli/023-project-workspace.md](../../70-qa/test-plans/cli/023-project-workspace.md)
- VS Code: [70-qa/test-plans/vscode/023-project-workspace.md](../../70-qa/test-plans/vscode/023-project-workspace.md)
- Chrome: [70-qa/test-plans/chrome/023-project-workspace.md](../../70-qa/test-plans/chrome/023-project-workspace.md)

## 10. Gaps and dependencies

- **Overview counts for files and members are not returned by the server mapper.** Affects: Web, Mobile. Evidence: apps/web/lib/projects.ts:50,161 (only conversationCount); contracts projects.ts:61-63. Work needed: Return knowledgeFileCount and memberCount or remove them from the brief.
- **Search only covers loaded pages.** Affects: Web, Mobile users with many projects. Evidence: ProjectGallery.tsx:431. Work needed: Server-side query.
- **No search on CLI, VS Code, Chrome.** Affects: Those apps. Evidence: Brief S23.20. Work needed: Add filter or mark not applicable.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- mode:cloud
- mode:local
- api:GET /api/projects
- api:GET /api/projects/{id}
- table:user_projects
- F023-01
- SYS-shared-ui-and-design
- SYS-sync-and-continuity

## Unknown

- Whether Desktop Electron search differs from web (hosted app assumed).
- Test contents were not opened, so coverage of search is unknown.
- Where memberCount is meant to be filled.
