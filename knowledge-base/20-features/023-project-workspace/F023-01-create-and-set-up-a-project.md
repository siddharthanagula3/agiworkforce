---
id: "F023-01"
type: "feature"
title: "Create and set up a project"
aliases: ["New project", "Create project dialog", "Managed Cloud Projects", "agi projects create", "Code: New Project", "project_created event"]
area: "23 Project workspace"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "partly seen (2 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S23.01", "S23.02", "S23.03", "S23.04"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "surface:chrome", "mode:cloud", "mode:local", "table:user_projects", "api:POST /api/projects", "api:POST /api/projects/sync", "store:project-store", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-01 Create and set up a project

A person creates a project: a named workspace that groups chats, files and instructions. Web, mobile, CLI and VS Code can create one. Chrome only lists existing projects. In Cloud the project is saved to the account and checked against the plan project limit. Mobile Local mode keeps it on the phone.

Area: [23. Project workspace](README.md). Requirement items: [S23.01](../../10-requirements/capabilities/023-project-workspace.md#s2301), [S23.02](../../10-requirements/capabilities/023-project-workspace.md#s2302), [S23.03](../../10-requirements/capabilities/023-project-workspace.md#s2303), [S23.04](../../10-requirements/capabilities/023-project-workspace.md#s2304).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (2 of 3) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a project with a name and optional description, instructions, colour, icon emoji, accent colour and defaults, then opens it as its own workspace. On the server it is a row in user_projects owned by the signed-in user (apps/web/app/api/projects/route.ts:138-252).

**Why it exists.** Chats, files and standing instructions need one home so each chat starts with the same context. Brief items S23.01 to S23.03 require a signed-in user to create a named project saved to the account (doc: knowledge-base/data/area-briefs/023-project-workspace.md).

**Who uses it.** Signed-in people on Web, Desktop (hosted web app in Electron), Mobile, CLI and VS Code. On the phone in Local mode no account is needed (apps/mobile/src/features/projects/store.ts:420-433).

**Problems it solves**

- Repeating the same background in every chat
- Keeping related chats and files together
- Having the same project on every app that uses the account

**Use cases**

- A designer makes 'Brand refresh' on the web and later picks it on the phone.
- A developer runs agi projects create in a terminal, then links a folder to it.
- A VS Code user creates a project with starting instructions from the command palette.
- A phone user in Local mode makes a project that never leaves the device.

## 2. User experience

**Where to find it**

- Web: Projects page (apps/web/app/chat/projects/page.tsx), button 'New project' (page.tsx:247), also the empty-state button (page.tsx:432) and the query ?new=1 (page.tsx:76).
- Mobile: Projects tab, controls 'Create new project' (apps/mobile/app/(app)/(tabs)/projects.tsx:445) and 'Create project' in the empty state (projects.tsx:345).
- CLI: agi projects create <name> --description (apps/cli/src/lib.rs:1297).
- VS Code: command 'Code: New Project' (apps/extension-vscode/package.json:665).
- Desktop: the public Electron window shows the hosted web app, so it is the web flow (doc: AGENTS.md section 5).
- Chrome: no create control found; the side panel lists and picks projects (apps/extension/src/features/cloud-bridge/projectsClient.ts:154).

**Before you start**

- Cloud mode: a signed-in account on a plan whose capabilities include projects (packages/contracts/types/src/billing-catalog.ts:348).
- Free plan: at most 5 projects (billing-catalog.ts:618).
- Mobile Local mode: none beyond the app.

**Screens and controls**

- Web dialog 'Create project' with fields 'Project name' and 'Description' and a template choice (apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:62-190).
- Web gallery quick form: icon button 'Choose project icon', name input 'Project name', colour group 'Project colour', presets Coding, Writing, Research, Learning (packages/ui/unified-chat/src/components/ProjectGallery.tsx:23-28, 281, 337).
- VS Code: two input boxes, name then optional instructions (apps/extension-vscode/src/features/projects/projectActions.ts:421-455).

**Journey**

1. Open the app and the projects list.
2. Choose New project.
3. Type a name; add description or instructions where the surface offers it.
4. Confirm (Enter or the create button).
5. The server stores the project and the app navigates to the new project page (CreateProjectDialog.tsx:62-85 pushes /chat/projects/{id}).

**What the person sees and gets**

- Web: dialog closes and the project page opens; errors show in an alert under the name field (CreateProjectDialog.tsx:75-77, 172-176).
- CLI prints: Created '<name>' in your account (<id>) (apps/cli/src/lib.rs:3787-3799).
- VS Code shows a notice that the project is on the account, or an error that it was not created (projectActions.ts:457-477).
- Mobile: the new project appears in the list at once and syncs later (store.ts:394-417).

**Settings**

- Plan project limit comes from billing catalog, not a user setting (apps/web/lib/services/free-plan-entitlements.ts:10).
- Allowed surfaces, default model and chat defaults can be sent at create time (apps/web/app/api/projects/route.ts:182-205).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/projects validates the body, requires CSRF and rate limit, applies the 'projects' feature gate, refuses when the plan limit is 0, trims name, description and instructions, defaults colour, stores iconEmoji and accentColor when sent, and returns 201 (apps/web/app/api/projects/route.ts:138-252).
- A positive plan limit is enforced inside the insert transaction by the database function assert_user_resource_limit, and a limit hit returns the plan message (route.ts:213-241).
- POST /api/projects/sync also refuses a project limit of 0 (apps/web/app/api/projects/sync/route.ts:104-107); the CLI and mobile create through this sync push (apps/cli/src/cloud/mod.rs:442-455).
- Mobile Cloud mode creates an optimistic row with a uuid and marks it for sync; Local mode saves it to device storage named project-store (store.ts:390-433, 608).
- VS Code creates through the shared cloud-contracts projects client (apps/extension-vscode/src/features/projects/projectsClient.ts:66-75).

**Incomplete**

- The web create dialog sends only name, description and template instructions; it sends no colour or icon (CreateProjectDialog.tsx:62-70). Icon and colour are set only in the gallery quick form or later on the project page (ProjectGallery.tsx:185-205, apps/web/app/chat/projects/[id]/page.tsx:797-975).
- CLI create takes only name and description (apps/cli/src/lib.rs:1297-1304).
- Mobile Cloud create sends color null and no icon (store.ts:402-415).
- Chrome has no create path found (projectsClient.ts exports only listChromeProjects).

**Present but disconnected or switched off**

- None found for creation itself.

**Not available**

- Cover image or tinted badge (S23.04): no code path; the brief marks it not applicable on every app (doc: area brief S23.04).
- Chrome create, icon and colour: no code found.

## 4. Required behaviour

**Established requirements**

- A signed-in user can create a named project saved to the account that opens as its own workspace. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.01)
- A project has a name and an optional description set at creation and editable later. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.02)
- The user can choose a project icon and colour and the choice shows wherever the project appears. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.03)
- Cover image or identity badge is not applicable. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.04)
- Projects are present on all seven technical surfaces of the product. (source: doc: docs/product/surface-feature-matrix.md:48)
- Signed-in projects belong to the Cloud continuity domain and must converge across Web, Mobile, Desktop and Chrome. (source: doc: docs/product/definition.md:118)

**Acceptance criteria**

1. Creating with an empty or blank name is refused on every app.
2. A created project shows after reload on web and in agi projects list.
3. A project created with no colour gets the default colour; one created with iconEmoji and accentColor returns both.
4. On a plan whose project limit is 0 the create call returns a plan message and creates nothing.
5. On the free plan the sixth project is refused with the plan message.
6. A mobile Local project is absent from the account and a Cloud project is absent from device-only storage.
7. Description and instructions are saved trimmed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The web create dialog should offer icon and colour like the gallery form so S23.03 holds on first create [inferred from CreateProjectDialog.tsx:62-70 versus ProjectGallery.tsx:185-205].
- Chrome should be able to create a project or the brief should mark it not applicable [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add --icon, --color and --instructions flags to agi projects create.
- [proposed] Show the plan project count (for example 3 of 5) in the create dialog before the limit is hit.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/projects | `apps/web/app/api/projects/route.ts` | Creates the project row, applies gate, limit and analytics event. |
| endpoint | POST /api/projects/sync | `apps/web/app/api/projects/sync/route.ts` | Push path used by CLI and mobile; refuses limit 0. |
| schema | ManagedCloudProjectCreateRequestSchema | `packages/contracts/cloud-contracts/src/projects.ts` | Shared request shape and accent colour list (line 11). |
| table | user_projects | `apps/web/lib/projects.ts` | Row mapping for projects (mapProjectRow, DEFAULT_PROJECT_COLOR at line 117). |
| service | free-plan-entitlements | `apps/web/lib/services/free-plan-entitlements.ts` | getProjectLimit and the plan limit message. |
| config | billing catalog project limits | `packages/contracts/types/src/billing-catalog.ts` | Per-plan project limits (free 5) and capability tiers. |
| component | CreateProjectDialog | `apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx` | Web dialog that creates and navigates. |
| component | ProjectGallery | `packages/ui/unified-chat/src/components/ProjectGallery.tsx` | Shared list with quick-create form, icon and colour pickers. |
| screen | Web projects page | `apps/web/app/chat/projects/page.tsx` | Hosts the gallery and dialog. |
| screen | Mobile Projects tab | `apps/mobile/app/(app)/(tabs)/projects.tsx` | List, create entry points and search. |
| store | mobile project store | `apps/mobile/src/features/projects/store.ts` | createProject for Cloud (synced) and Local (device) modes. |
| hook | useProjectEditor | `apps/mobile/src/features/projects/useProjectEditor.ts` | Create and edit sheet state. |
| command | agi projects create | `apps/cli/src/lib.rs` | CLI command (enum line 1297, handler line 3787). |
| service | cloud::create_project | `apps/cli/src/cloud/mod.rs` | Pushes the new project and caches it (line 442). |
| command | agi-workforce.createProject | `apps/extension-vscode/src/features/projects/projectActions.ts` | Interactive create (line 421). |
| store | desktop projectStore | `apps/desktop/src/stores/projectStore.ts` | Retained internal Tauri app: cloud or local create (line 206). |
| service | Chrome projects client | `apps/extension/src/features/cloud-bridge/projectsClient.ts` | Lists projects only. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person fills the form and submits; the web client calls the managed-cloud projects client. | device | apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:62-70 |
| The server checks CSRF, rate limit, the projects feature gate, the plan tier and the limit. | our servers | apps/web/app/api/projects/route.ts:138-168 |
| The server inserts the row and the quota guard in one transaction, then records a project_created event. | our servers | apps/web/app/api/projects/route.ts:207-252 |
| On mobile Cloud mode and CLI the project is first made on the device and pushed by sync. | device and our servers | apps/mobile/src/features/projects/store.ts:394-417; apps/cli/src/cloud/mod.rs:442-455 |
| Mobile Local mode writes the project to device storage only. | device | apps/mobile/src/features/projects/store.ts:420-433 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project row: name, description, instructions, colour, icon, accent, defaults | table user_projects on our servers (apps/web/app/api/projects/route.ts:171-205) | Yes across account clients; sync cursor by server_version (apps/web/app/api/projects/sync/route.ts:50-54) | Deleted by owner action; chats are unfiled, not deleted (apps/web/app/api/projects/[id]/route.ts:326-358) |
| Mobile Local project | store:project-store in device MMKV (apps/mobile/src/features/projects/store.ts:608) | No; Local data stays on the device | Removed on delete from the device |
| CLI project cache | local cache file via save_project_cache (apps/cli/src/cloud/mod.rs:102) | Pulled from the account | Cleared by forget_account_data (cloud/mod.rs:127) |

**Models and providers.** Creating a project calls no model. Project rows can carry a default model id, a provider mode (ManagedGateway or ManagedNative) and allowed surfaces, but creation itself uses no provider (packages/contracts/cloud-contracts/src/projects.ts:55-60).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud: signed-in account required (getUserScopedDb, apps/web/app/api/projects/route.ts:139). Mobile Local: none. |
| Permissions | Create needs CSRF, rate limit 'chat-conversation' and workspace policy for feature 'projects' (route.ts:141-156). Org workspace rows carry organization_id (route.ts:170). |
| Subscription | Projects capability needs a cloud-chat tier (billing-catalog.ts:348). Plan limit 0 refuses with a plan message (route.ts:164-166). |
| Limits and metering | Free plan 5 projects; local-only, byok and basic tiers unlimited (billing-catalog.ts:584, 601, 618, 635). Enforced by assert_user_resource_limit (route.ts:213-216). Rate limit per request class. |
| Feature flags | None found for creation. A connectors release flag exists for Drive only. |
| Model compatibility | Not model dependent. |
| Provider restrictions | Project defaultProviderMode accepts only ManagedGateway or ManagedNative (projects.ts:21). |
| Local mode | Web has no Local mode for projects. Mobile Local mode creates device-only projects (store.ts:420-433). CLI project commands call the account (cloud/mod.rs:442) so need sign-in. VS Code needs the account token (projectsClient.ts:76-82). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty name | Web submit is disabled until a name exists (canSubmit); VS Code shows 'A project needs a name.'; CLI bails with 'A project needs a name'. | CreateProjectDialog.tsx:62-64; projectActions.ts:429-434; apps/cli/src/lib.rs:3788 |
| Submitting | Web dialog cannot be closed while submitting. | CreateProjectDialog.tsx:98-104 |
| Error | Web shows a user message and returns to editable state; user can retry by pressing create again. | CreateProjectDialog.tsx:86-90 |
| Plan limit reached | Validation error with the plan limit message. | apps/web/app/api/projects/route.ts:237-239; apps/web/lib/services/free-plan-entitlements.ts:54-67 |
| Duplicate id on push | CLI reports 409 when the account holds a different project under that id. | apps/cli/src/cloud/mod.rs:457-466 |
| Offline | Mobile Cloud create is saved on the device first and synced later; web offline handling not handled in the code looked at. | apps/mobile/src/features/projects/store.ts:402-417 |
| Keyboard and screen reader | Web inputs have labels and an alert region; Enter submits and skips IME composition. | CreateProjectDialog.tsx:106-113, 172-176 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/projects/__tests__/round10-fields.test.ts`: Project fields on the route (by name and location; contents not opened).
- `apps/web/app/api/projects/__tests__/route.keyset-pagination.test.ts`: Project list paging (by name).
- `apps/web/app/chat/projects/page.test.tsx`: Web projects page (by name).
- `apps/mobile/src/features/projects/__tests__/ProjectEditorLimits.test.tsx`: Mobile editor limits (by name).
- `apps/mobile/src/features/projects/__tests__/NewProjectSettings.test.tsx`: Mobile new project settings (by name).
- `apps/desktop/src/stores/__tests__/projectStore.boundaryRollback.test.ts`: Internal desktop store boundary rollback (by name).
- `apps/extension-vscode/src/__tests__/projectsView.test.ts`: VS Code projects view (by name).
- `apps/cli/src/project_registry.rs`: Folder registry unit tests inline (not account create).

**Test scenarios**

- **Create on web**
  1. Sign in on web
  2. Open Projects, choose New project
  3. Enter a name, submit
  - Expected: Project page opens; reload shows the project in the list.
- **Free plan limit**
  1. Use a free account with 5 projects
  2. Try to create a sixth
  - Expected: Refused with the plan message; no new row.
- **CLI create**
  1. Run agi projects create Demo --description x
  2. Run agi projects list
  - Expected: Receipt with id; list shows Demo; web shows it after refresh.
- **Mobile Local**
  1. Switch the app to Local mode
  2. Create a project
  3. Switch to Cloud
  - Expected: Project exists only in Local mode and not on the account.
- **Icon and colour at create**
  1. On web use the gallery quick form, pick icon and colour
  2. Create
  - Expected: Card shows chosen icon and colour on web and mobile.

**Where to look when it fails**

- Server log 'Failed to create project' with userId (route.ts:243).
- Plan refusals use the validation error from getProjectLimitErrorMessage.
- Table user_projects, column deleted_at and server_version.
- CLI warns 'could not cache the project list' (cloud/mod.rs:473).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/023-project-workspace.md](../../70-qa/test-plans/web/023-project-workspace.md)
- Desktop: [70-qa/test-plans/desktop/023-project-workspace.md](../../70-qa/test-plans/desktop/023-project-workspace.md)
- Mobile: [70-qa/test-plans/mobile/023-project-workspace.md](../../70-qa/test-plans/mobile/023-project-workspace.md)
- CLI: [70-qa/test-plans/cli/023-project-workspace.md](../../70-qa/test-plans/cli/023-project-workspace.md)
- VS Code: [70-qa/test-plans/vscode/023-project-workspace.md](../../70-qa/test-plans/vscode/023-project-workspace.md)
- Chrome: [70-qa/test-plans/chrome/023-project-workspace.md](../../70-qa/test-plans/chrome/023-project-workspace.md)

## 10. Gaps and dependencies

- **Web create dialog cannot set icon or colour.** Affects: Web and Desktop users. Evidence: CreateProjectDialog.tsx:62-70 sends only name, description, instructions. Work needed: Add icon and colour pickers to the dialog or drop the dialog for the gallery form.
- **Chrome cannot create projects and the brief says icon and colour missing.** Affects: Chrome users. Evidence: apps/extension/src/features/cloud-bridge/projectsClient.ts:154. Work needed: Add create or mark not applicable.
- **CLI create cannot set instructions, icon or colour.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1297-1304. Work needed: Add flags; instructions can be set later with agi projects edit.
- **Brief says web, desktop, mobile, CLI, VS Code done; no run record exists.** Affects: All apps. Evidence: No result file found in this review. Work needed: Run the scenarios and record results.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- surface:chrome
- mode:cloud
- mode:local
- table:user_projects
- api:POST /api/projects
- api:POST /api/projects/sync
- store:project-store
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-sync-and-continuity

## Unknown

- Whether a test covers the free-plan 5-project refusal end to end (test contents not opened).
- Whether the desktop Electron window adds any project UI beyond the hosted web app (only AGENTS.md section 5 read).
- The actual project limit for plans other than free beyond the catalog lines read.
