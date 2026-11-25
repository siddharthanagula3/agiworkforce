---
id: "F037-01"
type: "feature"
title: "Notebook list and creation"
aliases: ["Projects", "Project list", "Project gallery", "New project", "Create project", "Project folders (plan-limit wording)", "Managed Cloud Projects (server wording)", "Notebook index and Notebook creation (brief S37.01, S37.02)", "Projects tree (VS Code)", "agi projects (CLI)"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S37.01", "S37.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "plan:free", "api:GET /api/projects", "api:POST /api/projects", "api:GET /api/projects/sync", "table:user_projects", "store:project-store", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "F037-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-01 Notebook list and creation

A project (the brief calls it a notebook) is a named workspace in the AGI account that holds instructions, source files and chats. This feature lists the projects a person can open and creates new ones. Web, Desktop (hosted web), Mobile, CLI and VS Code have it; Chrome only reads the list for two pickers.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.01](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3701), [S37.02](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3702).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the projects the signed-in person owns or that are shared with them, lets them open one, and creates a new project that is stored in the account. The product UI says 'project'; the brief says 'notebook'. [inferred from labels: 'New project', 'Create project'] (apps/web/app/chat/projects/page.tsx:247; packages/ui/unified-chat/src/components/ProjectGallery.tsx:264)

**Why it exists.** Chats need a home where instructions and source files are kept together, so answers can be grounded in the same material every time. The list is the way back into that home. [inferred]

**Who uses it.** Any signed-in person who wants a standing workspace: students, researchers, people who work with the same documents again and again.

**Problems it solves**

- Without it every chat starts with no memory of the user's documents and rules.
- Without a shared list the same workspace would have to be rebuilt on each app.
- Free accounts need a clear limit on how many workspaces they can make (5 on the free plan) (packages/contracts/types/src/billing-catalog.ts:618).

**Use cases**

- A student creates a project called 'Biology' on the web and later opens it on the phone.
- A developer runs 'agi projects create Launch' in the terminal, then sees it in VS Code.
- A team member opens a project a colleague shared with them (team workspace only).
- A person archives an old project and restores it later from the Archived view.

## 2. User experience

**Where to find it**

- Web: the Projects page at /chat/projects, titled 'Projects'; button 'New project'; sort menu 'Sort: Updated (newest) / Created (newest) / Name (A-Z) / Starred first'; link 'Archived (n)' (apps/web/app/chat/projects/page.tsx:27-32, 247, 274, 292).
- Desktop: the public Desktop window shows the hosted web app, so it is the same page (doc: AGENTS.md section 5). The retained Tauri build has its own list in apps/desktop/src/features/v3/AgiWorkProjects.tsx:61 but it is not the public Desktop (doc: AGENTS.md section 5).
- Mobile: the Projects tab (apps/mobile/app/(app)/(tabs)/projects.tsx). Controls: 'Search projects', 'Create new project', 'Sort projects', 'Filter projects' with All, Created by you, Shared with you, Archived (apps/mobile/src/features/projects/projectList.ts:24-29; projects.tsx:345, 445, 451).
- CLI: 'agi projects list', 'agi projects create <name> [--description]', 'agi projects show', 'agi projects recent', 'agi projects link' (apps/cli/src/lib.rs:1287-1340).
- VS Code: the Projects tree in the side bar, commands 'Code: Show Projects', 'Code: Refresh Projects', 'Code: Open Projects on Web' (apps/extension-vscode/package.json:650-661; projectsTree.ts:87-121).
- Chrome: no list screen found. The side panel fetches the project list only to fill the 'move chat to a project' picker and the @-mention list (apps/extension/src/side_panel.ts:12323, 14479).

**Before you start**

- An AGI account signed in on the app (web: signed-in session; CLI: signed in and Cloud privacy mode; VS Code: account token) (apps/cli/src/cloud/client.rs:368-381; apps/extension-vscode/src/features/projects/projectsClient.ts:77-83).
- Creating needs the 'projects' workspace feature to be allowed by the workspace policy and a plan that allows projects (apps/web/app/api/projects/route.ts:147-166).
- Mobile: Cloud mode for account projects; Local mode shows projects kept only on the device (apps/mobile/src/features/projects/store.ts:390-436).

**Screens and controls**

- Web list: search box 'Search projects...', 'New project', cards with pin/star, archive, delete, share, 'Show more' / 'Loading projects' pagination (ProjectGallery.tsx:247-264; page.tsx:491).
- Web create dialog 'Create project': 'Project name' field (required) and a description field (apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:135-190).
- Mobile: project cards, pull to refresh, retry buttons, empty states 'No archived projects' and 'Nothing is shared with you yet.' (projects.tsx:52, 421-426).
- VS Code: tree items; a notice item 'Sign in to see your projects' (projectsTree.ts:93), 'Projects could not be loaded' with Retry (107), 'No projects yet' that starts Create Project (118).

**Journey**

1. Open the app's project list (web Projects page, mobile Projects tab, CLI 'agi projects list', VS Code Projects tree).
2. Read the list. It shows the person's own projects and, in a team workspace, projects shared with them.
3. To open one, select it (web card, mobile card, VS Code tree item).
4. To create one, choose 'New project' (web, mobile) or run 'agi projects create <name>' or the VS Code create command, type a name, optionally a description and instructions, then confirm.
5. The new project appears in the list and, because it is saved to the account, in the other apps after their next refresh.

**What the person sees and gets**

- Web: toasts such as 'Failed to archive project', 'Failed to restore project', 'Failed to update star' on errors (page.tsx:108, 121, 130); inline text 'No projects yet.' (403); list error text 'Projects could not be loaded.' (338).
- CLI: 'No projects in your AGI account.' plus a hint to create one (lib.rs:3677-3680); 'Created ''<name>'' in your account (<id>).' (3791-3796).
- VS Code: information message after creation and an error message with the reason on failure (projectActions.ts:419-470).
- Server: 201 with the project on create; validation message 'Your current subscription does not allow Managed Cloud Projects...' or the plan limit text when over the limit (free-plan-entitlements.ts:54-67).

**Settings**

- Pagination: default 50, maximum 100 per page, offset capped at 10000 (packages/contracts/cloud-contracts/src/project-contract.json:6-8).
- Web sort mode (Updated, Created, Name, Starred first) and the Archived view toggle (page.tsx:27-32, 274).
- VS Code auto refresh of the tree (projectsTree.ts:70-78).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop (hosted web): list with search, sort, archive, star, pagination and create. GET /api/projects returns own and, in a team workspace, shared projects with an is_org_shared flag and a conversation count (apps/web/app/api/projects/route.ts:44-136); POST creates, enforces the plan project limit in the same statement and returns 201 (route.ts:138-253).
- Mobile: Projects tab with filters, sort, search and create; Cloud mode creates an account project and marks it for sync, Local mode creates a project kept in the on-device store (apps/mobile/src/features/projects/store.ts:390-436, 608).
- CLI: list, create, show, edit, link, add-file, archive, delete exist and are wired in the command handler (apps/cli/src/lib.rs:3673-3820).
- VS Code: tree with signed-out, error, empty and list states, and an interactive create flow (apps/extension-vscode/src/features/projects/projectsTree.ts:87-121; projectActions.ts:419-470).

**Incomplete**

- Chrome: only a fetch of non-archived projects for a history 'move to project' picker and the mention list; no list, open or create screen was found (apps/extension/src/features/cloud-bridge/projectsClient.ts:154-165; side_panel.ts:12323, 14479). The brief marks Chrome unverified; the live-check queue lists S37.01 and S37.02 for chrome (audit/live-check/037-notebook-and-knowledge-workspace-product.md).
- CLI list reads /api/projects/sync, which selects only projects whose user_id is the caller, so shared-with-me projects do not appear in the CLI list [inferred from the SQL] (apps/web/app/api/projects/sync/route.ts:44-56).

**Present but disconnected or switched off**

- Mobile account projects are only listed and synced when the app is in Cloud mode and signed in (apps/mobile/services/cloudSyncEngine.ts:97-107); in Local mode the Projects tab shows device-only projects (store.ts:421-436).
- The dev-only route /api/uploads/local-project-knowledge returns 404 outside development (apps/web/app/api/uploads/local-project-knowledge/route.ts:48); not part of project listing.

**Not available**

- Chrome: creating a project and opening one are not available (no code found). The Chrome extension is held to the scope of the reference browser assistant by owner decision D-2026-09-28-23 (doc: docs/decisions/2026-09-27-founder-decisions.md).
- CLI and Chrome: no 'shared with you' view found.
- The word 'notebook' does not appear as a label on the web Projects page; it is a brief term (page.tsx:247).

## 4. Required behaviour

**Established requirements**

- The user sees a list of their notebooks (knowledge workspaces) and can open one. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.01)
- The user can create a new notebook that is saved to the account. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.02)
- Signed-out VS Code users see a sign-in prompt, not an empty list. (source: apps/extension-vscode/src/features/projects/projectsTree.ts:87-100)
- Projects are shared across apps through the account (the CLI header says the list is shared with the web app and mobile). (source: apps/cli/src/cloud/projects.rs:1-3)
- One Subscription system governs project limits: a plan sets the number of projects and a 0 limit refuses creation. (source: apps/web/app/api/projects/route.ts:162-166)
- Projects is a general-availability feature present on all surfaces per the matrix. (source: doc: docs/product/surface-feature-matrix.md:48)

**Acceptance criteria**

1. Signed in on web, the Projects page lists every project created on another app within one refresh, and shows 'No projects yet.' only when none exist.
2. Creating a project with an empty name is refused; a valid name creates it and it appears in the list on a second app after refresh.
3. On the free plan, creating a sixth project is refused with a message naming the plan limit; the project count does not change.
4. In VS Code signed out, the tree shows 'Sign in to see your projects'; signed in with no projects it shows 'No projects yet'.
5. In the CLI with a signed-out account, 'agi projects list' fails with a sign-in error and does not print an empty list.
6. In a team workspace, a project shared with the user appears in the web list marked as shared and opens read-only unless they have edit access.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The mobile Local-mode project list is a separate device-only list; creating a project in Local mode must not appear on other apps [inferred from store.ts:421-436].
- Shared projects should appear on every app that lists projects; today only web, mobile and VS Code request the full list [inferred from the sync route SQL and listAllManagedCloudProjects use].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show shared projects in the CLI list, or print a line saying shared projects are web-only.
- [proposed] Give Chrome a read-only project list screen, or record in the matrix that Chrome only uses projects as a picker.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/projects | `apps/web/app/api/projects/route.ts` | List own and shared projects (keyset or offset paging); create a project with plan limit, CSRF and rate limit. |
| endpoint | GET/PUT/DELETE /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Read one project (own, or shared in a team workspace), update it, soft-delete it. |
| endpoint | GET/POST /api/projects/sync | `apps/web/app/api/projects/sync/route.ts` | Delta pull and push used by CLI and mobile; pull selects the caller's own projects. |
| screen | Projects page | `apps/web/app/chat/projects/page.tsx` | Web list, sort, archive view, create, share and delete handlers. |
| component | ProjectGallery | `packages/ui/unified-chat/src/components/ProjectGallery.tsx` | Shared gallery with search box, 'New project' button and empty text. |
| component | CreateProjectDialog | `apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx` | Web 'Create project' dialog (name, description). |
| service | webManagedCloudProjects | `apps/web/features/projects/services/managed-cloud-projects.ts` | Web client for the project routes. |
| service | plan limit helpers | `apps/web/lib/services/free-plan-entitlements.ts` | Project limit per plan tier and the limit error text. |
| config | project contract | `packages/contracts/cloud-contracts/src/project-contract.json` | Route path, name/description/instruction limits and page sizes shared by all clients. |
| screen | Mobile Projects tab | `apps/mobile/app/(app)/(tabs)/projects.tsx` | Mobile list, filters, search, create. |
| store | useProjectStore | `apps/mobile/src/features/projects/store.ts` | On-device project store (persisted as 'project-store') and Cloud-mode create that marks sync. |
| service | cloudSyncEngine projects step | `apps/mobile/services/cloudSyncEngine.ts` | Pushes and pulls projects in Cloud mode (pullProjects line 723, step line 1035). |
| other | project list helpers | `apps/mobile/src/features/projects/projectList.ts` | Filter and sort labels and display mapping. |
| command | agi projects | `apps/cli/src/lib.rs` | Subcommand enum (1287-1340) and handler (3573-3820). |
| service | CLI project cache and sync | `apps/cli/src/cloud/projects.rs` | Local cache of the account project list, delta apply, find by id or name. |
| service | CLI cloud client | `apps/cli/src/cloud/mod.rs` | refresh_projects (417), create_project (442), project_detail (525), update_project (548). |
| component | Projects tree | `apps/extension-vscode/src/features/projects/projectsTree.ts` | VS Code tree with signed-out, error, empty and list states. |
| command | createProjectInteractively | `apps/extension-vscode/src/features/projects/projectActions.ts` | VS Code create flow (input boxes, progress, messages). |
| service | Chrome projects client | `apps/extension/src/features/cloud-bridge/projectsClient.ts` | listChromeProjects with refusal mapping, used by the side panel pickers. |
| table | user_projects | `apps/web/app/api/projects/route.ts` | Table that stores projects (insert at line 212, select at line 111). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the list; the app calls GET /api/projects with the account session (CLI uses the sync route). | device and our servers | apps/web/app/api/projects/route.ts:44-136; apps/cli/src/cloud/mod.rs:417 |
| Server checks rate limit and workspace access, reads the caller's projects plus projects shared into the active team workspace, counts non-temporary conversations, and pages the result. | our servers | apps/web/app/api/projects/route.ts:45-51, 74-125 |
| Person creates a project; server validates the body, checks the CSRF token, the 'projects' workspace feature and the plan limit, then inserts the row and a quota guard in one statement inside a transaction. | our servers | apps/web/app/api/projects/route.ts:138-245 |
| Server records a 'project_created' analytics event and returns 201 with the project. | our servers | apps/web/app/api/projects/route.ts:247-252 |
| Mobile in Local mode writes the project into the on-device store and never calls the server; in Cloud mode it writes the cloud store, marks it dirty and the sync engine pushes it. | device | apps/mobile/src/features/projects/store.ts:390-436; apps/mobile/services/cloudSyncEngine.ts:1035-1038 |
| Other apps pick the new project up on their next list or sync pull. | device and our servers | apps/mobile/services/cloudSyncEngine.ts:723; apps/cli/src/cloud/projects.rs:1-3 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project row (name, description, instructions, colour, archive flag, defaults, timestamps, server_version) | table user_projects in the account database | Yes, through the account routes for every app that signs in; mobile Local-mode projects are not synced | DELETE retires the project (soft delete, deleted_at); content under a legal hold refuses deletion (apps/web/app/api/projects/[id]/route.ts:326-359) |
| Mobile Local-mode project and its source metadata | store:project-store (MMKV storage on the phone) | No | Removed when the person deletes the project on the device (store.ts:455-466) |
| CLI cached project list | A cache file in the CLI config folder | Refreshed from the account on each command | Entries leave the cache when the server marks them deleted (apps/cli/src/cloud/projects.rs:111-120, test at 334-338) |

**Models and providers.** No model is called to list or create a project. Project instructions later reach a chat model through the chat pipeline (see F037-02). Own-key and Local modes do not change the project routes: they need the account (none found in the code for a BYOK-only path).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required for all server-backed lists: web session, CLI Cloud privacy mode with a stored sign-in (apps/cli/src/cloud/client.rs:368-381), VS Code account token (projectsClient.ts:77-83), Chrome auth token (projectsClient.ts:140-150). Mobile Local mode needs no account for device-only projects [inferred from store.ts:421-436; whether the Projects tab itself requires sign-in in Local mode was not checked]. |
| Permissions | Rows are read through a user-scoped database; a team workspace adds projects shared into it. Workspace policy can deny the 'projects' feature on create (route.ts:147-153). |
| Subscription | Plan decides how many projects can exist: free 5, other listed tiers unlimited (billing-catalog.ts:563, 618, 635, 654); a limit of 0 refuses creation (route.ts:162-166). Plan names are the code keys (plan:free, plan:basic, plan:pro, plan:max, plan:team). |
| Limits and metering | Rate limit class 'chat-conversation' on list and create (route.ts:45, 144); project count limit enforced in the insert by assert_user_resource_limit (route.ts:215). Listing and creating are not metered as model usage (none found in the code). |
| Feature flags | Mobile FEATURES.projects is true (apps/mobile/lib/v1FeatureFlags.ts:2); FEATURES.cloudChat is true and gates Cloud-mode sync (v1FeatureFlags.ts:4; cloudSyncEngine.ts:97-103). Workspace feature policy 'projects' on the server. |
| Model compatibility | Not applicable to listing or creating; none found in the code. |
| Provider restrictions | None found in the code for this feature. |
| Local mode | Web, Desktop, CLI, VS Code, Chrome: no Local mode for projects; they call the account (CLI refuses with a not-managed error unless in Managed privacy mode, client.rs:368-373). Mobile Local mode keeps projects on the device and does not sync them (store.ts:421-436). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows a loading state and 'Loading projects' for the next page; mobile shows 'Loading projects'; VS Code progress notification when creating. | page.tsx:491; projects.tsx:307; projectActions.ts:457 |
| Empty | Web 'No projects yet.' or 'No archived projects.'; CLI prints a hint to create one; VS Code 'No projects yet' item starts creation; mobile 'No archived projects' with explanatory text. | page.tsx:403; lib.rs:3677-3680; projectsTree.ts:118; projects.tsx:421-426 |
| Error | Web 'Projects could not be loaded.' with retry; mobile 'Retry loading projects'; VS Code 'Projects could not be loaded' item with Retry; server returns 'Failed to fetch projects' on a database error. | page.tsx:338; projects.tsx:320, 381; projectsTree.ts:105-115; route.ts:121-124 |
| Signed out | VS Code shows 'Sign in to see your projects'; CLI returns a signed-out error; Chrome returns an auth_required result. | projectsTree.ts:87-100; client.rs:376-379; projectsClient.ts:100-112 |
| Over plan limit | Create is refused with the plan limit message; nothing is saved. | route.ts:162-166, 237-239 |
| Paging | Cursor paging with offset fallback; 'Show more' loads the next page. | route.ts:70-72, 126-135; page.tsx:488-491 |
| Offline | Mobile Local-mode projects keep working; Cloud mode shows refresh failure text 'Projects could not be refreshed.' Other apps: not handled in the code beyond the error states above. | projects.tsx:53 |
| Accessibility | Web search and sort controls have aria-labels ('Search projects', 'Sort projects by'); mobile buttons carry accessibilityLabel values ('Create project', 'Sort projects. <current>', 'Filter projects. <current>'). | ProjectGallery.tsx:247; page.tsx:292; projects.tsx:241, 263, 345 |
| Health space | A project in the health space has no share action on the web card. | page.tsx:454 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/projects/page.test.tsx`: Web Projects page behaviour (file name; contents not opened).
- `apps/web/app/api/projects/__tests__/route.keyset-pagination.test.ts`: List paging by cursor (file name).
- `apps/web/app/api/projects/__tests__/route.org-shared.test.ts`: Shared projects in the list (file name).
- `apps/web/features/projects/__tests__/project-store-paging.test.ts`: Client paging of the project store (file name).
- `apps/web/app/api/projects/sync/__tests__/route.contract.test.ts`: Sync route contract (file name).
- `apps/mobile/src/features/projects/__tests__/projectList.test.ts`: Mobile filter and sort helpers (file name).
- `apps/mobile/src/features/projects/__tests__/ProjectsListPinFilter.test.tsx`: Mobile list pin and filter (file name).
- `apps/mobile/__tests__/cloud-projects-sync.test.ts`: Mobile project sync (file name).
- `apps/extension-vscode/src/__tests__/projectsView.test.ts`: VS Code projects view (file name).
- `apps/cli/src/cloud/projects.rs`: Unit tests inside the file: newest copy wins, tombstoned project leaves cache, find by id or name (lines 325-345).

**Test scenarios**

- **Create on web, see on mobile**
  1. Sign in to the same account on web and mobile (Cloud mode).
  2. On web choose 'New project', enter 'Biology', save.
  3. On mobile pull to refresh the Projects tab.
  - Expected: 'Biology' appears on both apps with the same name.
- **Free plan limit**
  1. Use a free account with 5 projects.
  2. Try to create a sixth on web.
  - Expected: Creation is refused with the plan limit message and the list still shows 5.
- **Signed-out VS Code**
  1. Sign out of the extension.
  2. Open the Projects tree.
  - Expected: One item 'Sign in to see your projects' that starts sign-in.
- **CLI create and list**
  1. Run 'agi projects create Launch --description Test'.
  2. Run 'agi projects list'.
  - Expected: Launch is printed with its id; the same project shows on web.
- **Mobile Local mode isolation**
  1. Switch mobile to Local mode and create 'Notes'.
  2. Open web and the CLI list.
  - Expected: 'Notes' does not appear on web or CLI.

**Where to look when it fails**

- Server log 'Failed to fetch projects' and 'Failed to create project' (apps/web/app/api/projects/route.ts:122, 243).
- Plan limit refusal from assert_user_resource_limit (isUserResourceLimitError).
- Mobile console warning '[projectStore] Hydration failed' (store.ts:610).
- CLI prints 'could not record the account sync position' if the state file cannot be saved (cloud/mod.rs:160).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)
- CLI: [70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md)
- VS Code: [70-qa/test-plans/vscode/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/vscode/037-notebook-and-knowledge-workspace-product.md)
- Chrome: [70-qa/test-plans/chrome/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/chrome/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **Chrome has no project list or create screen; the brief status 'unverified' is not settled and live checks are queued.** Affects: Chrome users. Evidence: apps/extension/src/side_panel.ts:12323, 14479; audit/live-check/037-notebook-and-knowledge-workspace-product.md. Work needed: Decide the Chrome scope (picker only, per D-2026-09-28-23) and record it in the surface matrix, or build a read-only list; run the queued live-web check.
- **CLI list does not include projects shared with the user.** Affects: CLI users in team workspaces. Evidence: apps/web/app/api/projects/sync/route.ts:44-56. Work needed: Either list shared projects through GET /api/projects or state the limit in the command help.
- **Projects created in mobile Local mode are not in the account, so the claim 'every app sees the same notebook' holds only for Cloud mode.** Affects: Mobile Local-mode users. Evidence: apps/mobile/src/features/projects/store.ts:421-436. Work needed: Keep it as the Local boundary but label it in the UI; consider an explicit 'move to account' action.
- **Term mismatch: the product says Project, the brief says Notebook.** Affects: Testers and docs. Evidence: apps/web/app/chat/projects/page.tsx:247. Work needed: Pick one term in the knowledge base and the product copy.
- **Failure state for the create dialog on web was not read.** Affects: Web users. Evidence: CreateProjectDialog.tsx:70-100 (submit state exists; message text not opened). Work needed: Read and test the failure message.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- plan:free
- api:GET /api/projects
- api:POST /api/projects
- api:GET /api/projects/sync
- table:user_projects
- store:project-store
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- F037-03

## Unknown

- Whether the mobile Projects tab can be opened in Local mode while signed out.
- Message text on a failed create in the web CreateProjectDialog.
- Whether the VS Code list includes shared projects (it calls listAllManagedCloudProjects, which reads GET /api/projects; the client body was not opened).
- Whether Desktop adds anything beyond the hosted web page (Electron main process not read for this).
- Chrome live behaviour (queued live check).
