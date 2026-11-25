---
id: "F004-03"
type: "feature"
title: "Projects: list, overview, chats, instructions"
aliases: ["Projects index", "Project overview", "Project conversations", "Project instructions", "/chat/projects", "/chat/projects/[id]", "Project settings dialog", "S4.06", "S4.07", "S4.08", "S4.10", "Folders (plan limit copy)"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S4.06", "S4.07", "S4.08", "S4.10"]
depends_on: ["SYS-memory-projects-and-context", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "table:user_projects", "api:GET /api/projects", "api:POST /api/projects", "api:PUT /api/projects/{id}", "F004-01", "F004-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-03 Projects: list, overview, chats, instructions

Projects group chats, files and instructions for one piece of work. People list projects, create one, open it to see its Chats, Artifacts, Work, Sources and Scheduled tabs, and edit its instructions and settings. Web and mobile have full screens; the CLI and VS Code manage projects by commands.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.06](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s406), [S4.07](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s407), [S4.08](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s408), [S4.10](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s410).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps related chats, files and instructions together so every chat in the project follows the same instructions and sources.

**Why it exists.** Standing instructions and shared files save retyping; both leading products have projects [inferred from product context].

**Who uses it.** Signed-in people doing repeated work on one topic, on Web, Desktop, Mobile, CLI and VS Code.

**Problems it solves**

- Repeating context in every chat.
- Losing track of chats about one topic.
- Applying team instructions to many chats.

**Use cases**

- Create a 'Quarterly report' project with instructions 'Answer in short bullets' and start chats in it.
- Open a project to find all its chats and artifacts.
- Change a project's default model.
- Run 'agi projects create' from a terminal.

## 2. User experience

**Where to find it**

- Web: sidebar item 'Projects' to /chat/projects (apps/web/shared/components/layout/app-nav-items.ts:99); open one at /chat/projects/<id>.
- Web list: heading 'Projects', text 'Keep related chats, files and instructions together.', button 'New project', toggle 'Archived (N)' / 'Active projects', sort control 'Sort projects by' (apps/web/app/chat/projects/page.tsx:200-300).
- Web detail: tabs 'Chats', 'Artifacts', 'Work', 'Sources', 'Scheduled' (apps/web/app/chat/projects/[id]/page.tsx:51-60,1125-1160); project menu with Share and Settings (page.tsx:617-690); dialog titled 'Project settings' (ProjectSettingsDialog.tsx:242).
- Mobile: drawer item 'Projects' (DrawerContent.tsx:104-110) and the Projects tab (apps/mobile/app/(app)/(tabs)/projects.tsx); detail tabs 'Chats', 'Work', 'Sources', 'Artifacts', 'Routines' (apps/mobile/app/(app)/projects/[id].tsx:219-227); instructions sheet opens from the project header.
- CLI: 'agi projects' with list, recent, create, show, edit, link, add-file, delete, archive (apps/cli/src/lib.rs:1286-1352).
- VS Code: 'Code: Show Projects' and project detail, edit, create, delete via quick picks (commandSetup.ts:2593; projectActions.ts:208-500).
- Chrome: a project can be picked as the active project for a chat (side_panel.ts:912,5865); no projects manager found.

**Before you start**

- Signed in; Cloud account (projects are an account feature; web list is hydrated only when signed in, use-managed-cloud-projects.ts:44-55).
- Plan with projects capability: free and every paid tier (billing-catalog.ts:322-352); creation is also bounded by a per-plan count.

**Screens and controls**

- List: project cards, sort, archived toggle, 'Show more', 'New project'.
- Detail: back button 'Back to projects', star and pin controls, tab bar, composer that starts a chat in the project, capacity banner.
- Settings dialog fields: Name ('Project name'), description ('What is this project for?'), 'Instructions' (with a count), default model, chat defaults, 'Personalization' switches 'Use your profile and instructions for AGI' and 'Use your response style', 'Memory' switch 'Use memories from outside this project', memory panel, 'Files'.

**Journey**

1. 1. Open Projects from the sidebar.
2. 2. Click 'New project', give a name and optionally instructions, save.
3. 3. The new project opens; use the composer to start a chat in it, or open a tab.
4. 4. Open the menu > Settings to edit instructions, default model and personalisation switches; click save ('Project updated').
5. 5. New chats in the project follow its instructions; chats appear under the Chats tab.
6. 6. Archive or delete the project from the list or the settings dialog (delete asks to confirm).

**What the person sees and gets**

- List: 'Loading projects…', error text with Retry, 'No projects yet.' or 'No archived projects.'
- Toasts 'Project updated', 'Project deleted', 'Failed to archive project' and similar (ProjectSettingsDialog.tsx:153-221; page.tsx:107-153).
- Detail: 'Loading chats...', error with Retry, 'Project not found' page with 'Back to projects'.
- Capacity banner 'This project has N conversations. Consider archiving older ones for performance.' at 80 or more (page.tsx:97,1093-1111).
- Plan refusal text, e.g. 'Your <plan> plan includes N project folders. Upgrade your plan to add more, or delete an existing folder to make room.' (free-plan-entitlements.ts:66).

**Settings**

- Project default model and chat defaults.
- Personalisation: use account instructions, use account style, use memories from outside (columns uses_account_instructions, uses_global_memory; migrations 0310, 0135).
- Project allowed surfaces and default privacy and provider mode are accepted on create (apps/web/app/api/projects/route.ts:176-196).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web project list loads 50 per page with 'Show more' (use-managed-cloud-projects.ts:23; projects/page.tsx:491).
- POST /api/projects creates a project; the plan limit is read from the plan and a database guard function assert_user_resource_limit enforces it; the refusal text names the plan and the limit (apps/web/app/api/projects/route.ts:162-165,215,236-240; free-plan-entitlements.ts:54-67).
- Project detail has five tabs and a composer; tab switch asks for confirmation if there are unsaved notes (page.tsx:1136).
- Capacity banner at 80 or more chats (page.tsx:97,1093).
- Not found page text for a missing project with 'Back to projects'; signed-out text 'Sign in to view this cloud project.' (page.tsx:480-500).
- Instructions are saved with the project and read in the chat pipeline for project chats; account instructions are optional via uses_account_instructions (apps/web/lib/server/user-identity.ts:220; request-processor.ts mentions project instructions).
- Mobile list, detail with tabs, instructions sheet, local and cloud projects (apps/mobile/app/(app)/projects/[id].tsx:99-150,367-372).
- CLI create, show (description, instructions, knowledge files, conversation count), edit, archive, delete with a warning (apps/cli/src/lib.rs:1304-1352,3580-3633).
- VS Code create, edit (name, description, instructions, default model), delete, apply to chat (projectActions.ts:273-500).

**Incomplete**

- The brief says a CLI list of a project's conversations is missing (S4.08); the CLI 'show' prints a conversation count only (apps/cli/src/lib.rs:1304 doc comment).
- The brief says web page title for the project list and a not-found with retry: error with retry exists for list and chats; the not-found page has only 'Back to projects' (page.tsx:480-500).
- Chrome: projects is 'unverified'; only active-project selection found (side_panel.ts:5865).

**Present but disconnected or switched off**

- Mobile shows the Work tab and Artifacts and Routines tabs only for cloud projects (showWork={isCloudProject}, [id].tsx:542).

**Not available**

- Project list on Chrome: not found.
- Desktop has no separate project code; it shows the web app (apps/desktop/electron/config.ts:10-12).

## 4. Required behaviour

**Established requirements**

- A Projects destination lists the user's projects and lets them open or create one. (source: S4.06 Should)
- Opening a project shows its name, description/instructions summary and entry points to chats and files. (source: S4.07 Should)
- Within a project, a list of the project's conversations opens when selected. (source: S4.08 Should)
- A place to view and edit a project's instructions, which then apply to chats in that project. (source: S4.10 Should)
- Do not hardcode plans, limits or quotas that the repository models. (source: AGENTS.md section 4)
- Project allowance comes from plan limits. (source: packages/contracts/types/src/billing-catalog.ts (projects capability and limits))

**Acceptance criteria**

1. Signed in, /chat/projects lists projects 50 at a time and 'Show more' loads the rest.
2. Creating a project beyond the plan limit is refused with a message naming the plan and the limit.
3. Saving instructions in Project settings shows 'Project updated' and the next chat in the project follows them.
4. With the profile switch off, the switch text reads that chats follow only the project's instructions.
5. A project with 80 or more chats shows the capacity banner.
6. Opening /chat/projects/<unknown> shows 'Project not found' and a 'Back to projects' button.
7. On a failing network the list shows an error and Retry reloads it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A shared project opened by a non-owner must hide edit controls (canEditProject false, page.tsx:160).
- Project chats listed must be paged (hasMoreProjectChats, page.tsx:128).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a CLI command that lists conversations in a project.
- [proposed] Show the plan name in the New project dialog before the limit is hit.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Projects list | `apps/web/app/chat/projects/page.tsx` | List, sort, archive toggle, new project, load more |
| screen | Project detail | `apps/web/app/chat/projects/[id]/page.tsx` | Tabs, banner, menu, share and settings dialogs, not found |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Edit name, description, instructions, model, switches |
| hook | useManagedCloudProjects | `apps/web/features/projects/hooks/use-managed-cloud-projects.ts` | Hydrates and pages projects, page size 50 |
| store | project-store | `apps/web/features/projects/stores/project-store.ts` | Projects state and paging (imported by the hook) |
| service | managed-cloud-projects | `apps/web/features/projects/services/managed-cloud-projects.ts` | HTTP client for projects |
| endpoint | Projects collection | `apps/web/app/api/projects/route.ts` | GET paged list, POST create with plan limit |
| endpoint | One project | `apps/web/app/api/projects/[id]/route.ts` | GET, PUT, DELETE |
| service | free-plan-entitlements | `apps/web/lib/services/free-plan-entitlements.ts` | getProjectLimit and refusal messages |
| config | Plan limits | `packages/contracts/types/src/billing-catalog.ts` | Per-plan product limits |
| table | user_projects | `apps/web/app/api/projects/route.ts` | Row per project (insert at line ~212) |
| table | web_conversations.project_id | `apps/web/app/api/chat/conversations/route.ts` | Conversation to project link (project filter at line 87-90) |
| config | Sidebar nav | `apps/web/shared/components/layout/app-nav-items.ts` | Projects entry |
| screen | Mobile Projects tab | `apps/mobile/app/(app)/(tabs)/projects.tsx` | Project list, filter, create, edit |
| screen | Mobile project detail | `apps/mobile/app/(app)/projects/[id].tsx` | Overview, tabs, instructions and memory sheets |
| component | ProjectInstructionsSheet | `apps/mobile/src/features/projects/components/ProjectInstructionsSheet.tsx` | Edit instructions on mobile |
| store | Mobile project stores | `apps/mobile/src/features/projects/store.ts` | Local projects (device) |
| command | CLI projects | `apps/cli/src/lib.rs` | ProjectsSubcommand and handle_projects_command |
| service | VS Code project actions | `apps/extension-vscode/src/features/projects/projectActions.ts` | Detail, edit, create, delete via quick picks |
| test | Projects page test | `apps/web/app/chat/projects/page.test.tsx` | List page tests |
| test | Project detail test | `apps/web/app/chat/projects/[id]/page.test.tsx` | Detail page tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Opening Projects fetches a page of projects (limit 50) for the signed-in account. | device and our servers | use-managed-cloud-projects.ts:23,44-55; apps/web/app/api/projects/route.ts:55-70 |
| Create checks the plan, inserts a user_projects row and rechecks the limit in the same statement. | our servers | projects/route.ts:162-165,209-240 |
| Opening a project loads it from the store or by id and lists its chats. | device and our servers | projects/[id]/page.tsx:100-137 |
| Saving settings sends PUT to /api/projects/<id> with the changed fields. | our servers | apps/web/app/api/projects/[id]/route.ts:362 |
| When a chat in the project is sent, the pipeline reads the project's instructions and applies the account instructions only if the switch is on. | our servers | user-identity.ts:220; request-processor.ts [project instructions referenced] |
| Mobile Local projects are stored on the device; Cloud projects use the same API. | device | apps/mobile/app/(app)/(tabs)/projects.tsx:72-82 |
| CLI refreshes the account's projects and calls create, edit, archive or delete. | our servers | apps/cli/src/lib.rs:3580-3633 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project name, description, instructions, color, default model, chat defaults, switches | table:user_projects | Yes across web, desktop, mobile cloud, CLI, VS Code | Project delete removes knowledge files; conversations stay unfiled (CLI warning text lib.rs:3589-3594) |
| Conversation membership | web_conversations.project_id | Yes | Kept when project deleted, unfiled |
| Mobile Local projects | device store | No | Unknown |

**Models and providers.** Creating and listing projects needs no model. A project may name a default model (default_model_id), resolved by the model catalog (SYS-model-catalog-and-routing); VS Code does not offer a Local model as a project default (projectActions.ts:337). Chats in the project use whichever provider routing selects.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for the web list and for CLI; mobile Local projects need none. |
| Permissions | Owner can edit; a project shared with the user is read-only unless shared access is 'write' (page.tsx:152-160). Project routes use scoped DB with organization id. |
| Subscription | Projects capability lists free and all paid tiers (billing-catalog.ts:322-352); the count limit comes from productLimits.projects per plan; a limit of zero gives the message 'Your current subscription does not allow Managed Cloud Projects...' (free-plan-entitlements.ts:57-59). Plan values were not read here. |
| Limits and metering | Project count per plan (assert_user_resource_limit). Page size 50 on web. Per-project chat warning at 80. |
| Feature flags | Mobile FEATURES.projects is true (apps/mobile/lib/v1FeatureFlags.ts:2). Workspace feature gate 'projects' is checked on create (projects/route.ts:150-154). |
| Model compatibility | A project default model must be one the catalog offers; Local models excluded on VS Code. |
| Provider restrictions | None found for the project list. Project default provider mode is stored (default_provider_mode). |
| Local mode | Mobile Local mode shows device-stored projects. Web and Desktop have no Local mode. CLI projects are account projects only; with a non-managed privacy mode the CLI refuses for schedules (NotManaged error in schedules.rs); the same for projects is [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading list | 'Loading projects…' status | projects/page.tsx:325-333 |
| List error | Alert with message and Retry | projects/page.tsx:336-345 |
| Empty | 'No projects yet.' / 'No archived projects.' | projects/page.tsx:403 |
| Loading more | Button text 'Loading projects' then 'Show more' | projects/page.tsx:491 |
| Project not found or signed out | 'Project not found' with text per cause | [id]/page.tsx:496-505 |
| Chats load error | Error text with Retry | [id]/page.tsx:1182-1196 |
| Over plan limit | Validation error with plan message | projects/route.ts:236-240 |
| Unsaved notes when switching tabs | Confirmation before leaving | [id]/page.tsx:1136 |
| Archive, star, delete fail | Error toast | projects/page.tsx:107-153 |
| Offline | not handled beyond error and retry | use-managed-cloud-projects.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/projects/page.test.tsx`: Projects list page
- `apps/web/app/chat/projects/[id]/page.test.tsx`: Project detail page
- `apps/web/app/chat/projects/[id]/page.org-shared.test.tsx`: Detail page for a shared project
- `apps/web/app/api/projects/__tests__/route.keyset-pagination.test.ts`: Paging of GET /api/projects
- `apps/web/app/api/projects/__tests__/route.shared-editor.test.ts`: Shared editor access
- `apps/web/features/projects/__tests__/project-store-paging.test.ts`: Project store paging
- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.description.test.tsx`: Settings dialog description field
- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.save-ownership.test.tsx`: Save ownership in the dialog
- `apps/mobile/src/features/projects/__tests__/projectList.test.ts`: Mobile project list helpers
- `apps/mobile/src/features/projects/__tests__/ProjectInstructionsMemory.test.tsx`: Mobile instructions and memory

**Test scenarios**

- **Create and open**
  1. Click New project
  2. Name it
  3. Save
  4. Open it
  - Expected: Project page with five tabs and an empty Chats tab
- **Plan limit**
  1. On a plan with a project limit create projects until the limit
  2. Create one more
  - Expected: Refusal text names the plan and the limit
- **Instructions apply**
  1. Set instructions 'Reply only with the word OK'
  2. Start a chat in the project
  - Expected: Reply follows the instruction; switch off the profile switch and compare
- **Capacity banner**
  1. Open a project with 80 or more chats
  - Expected: Banner text with the count
- **Unknown project**
  1. Open /chat/projects/<random uuid>
  - Expected: 'Project not found' and Back to projects
- **CLI create**
  1. agi projects create <name>
  2. agi projects show <name>
  - Expected: Created in account; show prints description, instructions, files, count

**Where to look when it fails**

- Log 'Failed to create project'
- Error from assert_user_resource_limit mapped to the plan message
- Table user_projects
- Toast text 'Failed to update project'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)
- Chrome: [70-qa/test-plans/chrome/004-signed-in-application-destinations.md](../../70-qa/test-plans/chrome/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **CLI cannot list a project's conversations.** Affects: CLI. Evidence: Brief S4.08; lib.rs:1304 shows count only. Work needed: Add listing
- **Chrome has no projects manager; only active project selection.** Affects: Chrome. Evidence: side_panel.ts:912,5865. Work needed: Decide scope; verify
- **The plan numbers are not asserted by any test I could name.** Affects: Web. Evidence: No test by name found for getProjectLimit in this review. Work needed: Add or locate test
- **Mobile Local project behavior under limits is unknown.** Affects: Mobile Local. Evidence: projects.tsx:72-82. Work needed: Read local store rules

**Depends on**

- SYS-memory-projects-and-context
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- table:user_projects
- api:GET /api/projects
- api:POST /api/projects
- api:PUT /api/projects/{id}
- F004-01
- F004-04

## Unknown

- Per-plan project count numbers (not read).
- What happens to chats started in a project when its default model is no longer in the catalog.
- Whether Chrome offers any project list.
- Where web project page title comes from.
- Mobile Local project limits.
- Which migration created user_projects columns for chat defaults beyond 0375.
