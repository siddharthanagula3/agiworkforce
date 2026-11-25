---
id: "F004-04"
type: "feature"
title: "Project sources, members, memory and notebook"
aliases: ["Project sources", "Project knowledge files", "Project members", "Project sharing", "Project memory", "Notebook workspace", "Sources tab", "ProjectStudio", "S4.09", "S4.11", "S4.12", "S4.31"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S4.09", "S4.11", "S4.12", "S4.31"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "table:project_knowledge_files", "table:user_projects", "api:GET /api/projects/{id}/knowledge-files", "api:POST /api/projects/{id}/knowledge-files", "F004-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-04 Project sources, members, memory and notebook

Gives a project its own files (Sources), lets an owner share it with people in a team workspace with view or edit rights, keeps what the assistant remembered in a project apart from account memory, and offers a notebook-like Sources tab with notes and a studio. Web and Desktop have all of it; mobile has most; the CLI has file add and project memory.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.09](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s409), [S4.11](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s411), [S4.12](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s412), [S4.31](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s431).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a project hold knowledge files that every chat in it can use, controls who can open it, and scopes memory to the project.

**Why it exists.** Project chats need reliable source material, team sharing and memory that does not leak across topics [inferred from the Should lines].

**Who uses it.** People with projects: owners, team members, and anyone adding sources or memories.

**Problems it solves**

- Chats cannot see files unless added.
- Teams need shared project context with controlled rights.
- Account memory should not spill into unrelated work.

**Use cases**

- Upload a style guide to a project's Sources.
- Share a project with a teammate as 'Can view'.
- Turn off use of memories from outside the project.
- Add a project-linked memory from the CLI.

## 2. User experience

**Where to find it**

- Web: project page > tab 'Sources' (ProjectStudio, ProjectNotes, SourcesPanel) (apps/web/app/chat/projects/[id]/page.tsx:1319-1343); 'Files' section inside the Project settings dialog (ProjectSettingsDialog.tsx:404-420).
- Web: project menu > 'Share' opens the 'Share <project>' dialog (page.tsx:626-653; ProjectShareDialog.tsx:150).
- Web: Project settings dialog shows the project memory panel (ProjectSettingsDialog.tsx:404) and the memory switch (ProjectSettingsDialog.tsx:384-401).
- Web: a 'Sources' side panel component exists (apps/web/features/projects/components/ProjectSourcesPanel.tsx; web-chat-layout.ts).
- Mobile: project tab 'Sources'; settings screen includes the members section; memory sheet (apps/mobile/app/(app)/projects/[id].tsx:219-227,122-155; ProjectSettingsScreen.tsx:193).
- CLI: 'agi projects add-file <project> <path>'; 'agi memory add --project' (apps/cli/src/lib.rs:1328,1443-1448).

**Before you start**

- Signed in with an account.
- Sharing requires a team workspace: the dialog says 'Only you can open this project. Switch to a team workspace to share it.' otherwise (ProjectShareDialog.tsx:76-80).
- Changing sharing requires being the owner with the share right or a manager (ProjectShareDialog.tsx:65).

**Screens and controls**

- Sources: add sources modal (AddSourcesModal), file list with index state, remove, storage meter.
- Share dialog: audience select 'Who can open it', 'Share' button, per-member access select 'Can view' / 'Can edit' / 'No access', 'Stop sharing' with a confirmation.
- Memory panel: list of project facts, add field, edit and delete with confirmation.
- Switch 'Use memories from outside this project'.

**Journey**

1. 1. Open the project > Sources.
2. 2. Add files; the app uploads, registers them and shows index state.
3. 3. For sharing: menu > Share > choose audience > Share; then set each member to Can view or Can edit.
4. 4. For memory: open Project settings; add a memory or edit one; toggle the outside-memory switch.
5. 5. Start a chat in the project; it draws on sources and memory.

**What the person sees and gets**

- File list with index status and the account's storage use returned by the list route (knowledge-files/route.ts:52-66).
- Storage refusal: '<Plan> accounts include X of file storage, shared by your Library and project sources. Delete a file or upgrade to add another.' (free-plan-entitlements.ts:37-51).
- Share dialog notes: 'Instructions and files are shared. Each person's chats stay private.' (ProjectShareDialog.tsx:98-100); 'Viewers can only get Can view. Change their role to Member to let them edit.' (ProjectSharingControls.tsx:46-48).
- Memory error texts 'Could not save this memory. Try again.' and 'Could not delete this memory. Try again.' (ProjectMemoryPanel.tsx:13-14).
- 'Cloud memory is unavailable until your account and workspace are ready.' (ProjectMemoryPanel.tsx:28).

**Settings**

- uses_global_memory per project.
- Share audience: workspace or invited (ProjectSharingControls.tsx projectShareAudience).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET knowledge-files lists files with index state and the storage meter for readable projects; 404 'Project not found' otherwise (apps/web/app/api/projects/[id]/knowledge-files/route.ts:23-66).
- POST registers a file after validating metadata and checking the storage allowance (route.ts:68-106; apps/web/lib/server/project-knowledge-files.ts:264-268; file-storage.ts:73).
- Org sharing service checks roles: manager or owner with share right; refuses editing for viewer role (org-sharing-service.ts:72-120,405-433; ProjectSharingControls.tsx:46-48).
- Share dialog covers not shared, shared by owner, shared with you read-only, stop sharing with a named consequence (ProjectShareDialog.tsx:60-140).
- Project memory is scoped by project id and the outside-memory flag (apps/web/lib/services/managed-memory-context-service.ts:1087,1269-1278; memory-tools.ts:345).
- Web Sources tab shows studio, notes and sources with read-only mode for non-editors (page.tsx:1319-1343).
- Mobile has sources tab, members section in project settings and a memory sheet (ProjectMembersSection.tsx:81-130; ProjectMemorySheet.tsx:27; [id].tsx:499).
- CLI adds a file to a project's knowledge and can record a project-linked memory with the flag --project (lib.rs:3800-3820,1443-1448).

**Incomplete**

- The brief says mobile members and memory are missing, but mobile code has ProjectMembersSection and ProjectMemorySheet wired in (ProjectSettingsScreen.tsx:193; [id].tsx:151-155). The brief is stale.
- The brief names the CLI flag 'agi memory add --project-scoped'; the actual flag is --project (lib.rs:1447-1448).
- The brief says CLI sources are missing; 'agi projects add-file' exists, listing is via 'agi projects show' (lib.rs:1304,1328).
- Notebook workspace is the Sources tab studio and notes; whether it supports annotation and generated outputs beyond ProjectStudio create is unknown (ProjectStudio.tsx not read).

**Present but disconnected or switched off**

- Sharing is only usable in a team (organization) workspace; personal workspace gets a note instead (ProjectShareDialog.tsx:76-80).

**Not available**

- Members UI on CLI, VS Code and Chrome: not found.
- Project memory on VS Code and Chrome: not found.

## 4. Required behaviour

**Established requirements**

- Within a project, a files/sources view lists the knowledge files and lets the user add and remove them. (source: S4.09 Should)
- A members view shows who has access and lets the owner add or remove people. (source: S4.11 Should)
- A project memory view shows what has been remembered for the project, with scope controls, separately from account memory. (source: S4.12 Should)
- A notebook workspace holds sources and notes the user reads, annotates and chats over, with generated outputs. (source: S4.31 Should)
- Local, BYOK and Managed Cloud are separate trust boundaries. (source: AGENTS.md section 6)

**Acceptance criteria**

1. Adding a file shows it in the list with an index state and updates the storage meter.
2. Adding a file over the plan's storage limit is refused with the 'Delete a file or upgrade' message.
3. A non-owner without the share right sees 'This project is not shared. Only its owner can share it.' and cannot change access.
4. A Viewer-role member cannot be set to Can edit.
5. A memory added in a project appears in that project's panel and not in the account memory list for other projects.
6. With 'Use memories from outside this project' off, chats there use only project memories.
7. With no account/workspace ready, the memory panel shows 'Cloud memory is unavailable until your account and workspace are ready.'
8. Stop sharing asks first and names that everyone loses access.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Removing a source must remove it from retrieval for new chats [inferred from delete tests names 'delete-purges-knowledge-files'].
- Mobile members screen must require the same rights as web [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the storage meter on the Sources tab header on every app.
- [proposed] Correct the brief for mobile members and memory and for the CLI flag.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | Knowledge files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | GET list with storage meter, POST register file |
| endpoint | One knowledge file | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/route.ts` | Read, delete one file; subroutes refresh, reindex, text |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Register file with storage check and indexing |
| service | file-storage | `apps/web/lib/server/file-storage.ts` | Storage meter and allowance |
| service | entitlement-resolution | `apps/web/lib/services/entitlement-resolution.ts` | Resolves plan tier for limits |
| table | project_knowledge_files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | File rows with deleted_at and superseded_at |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Sources list and removal |
| component | AddSourcesModal | `apps/web/features/projects/components/AddSourcesModal.tsx` | Add sources |
| component | ProjectStudio and ProjectNotes | `apps/web/features/projects/components/ProjectStudio.tsx` | Notebook-style studio and notes on the Sources tab |
| component | ProjectShareDialog | `apps/web/features/projects/components/ProjectShareDialog.tsx` | Share, audience, stop sharing |
| component | ProjectSharingControls | `apps/web/features/projects/components/ProjectSharingControls.tsx` | Audience and member access list with labels |
| service | org-sharing-service | `apps/web/lib/services/org-sharing-service.ts` | shareProject, setProjectMemberAccess, rights checks |
| endpoint | Organization shared overview | `apps/web/app/api/settings/organization/shared/route.ts` | Shared items overview used by the dialog |
| schema | Project owner sharing migration | `apps/web/db/neon/0316_project_owner_sharing.sql` | Schema for project owner sharing |
| component | ProjectMemoryPanel | `apps/web/features/projects/components/ProjectMemoryPanel.tsx` | Project memory list, add, edit, delete |
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Memory scope with project id and outside-memory flag |
| schema | Project scoped memory migration | `apps/web/db/neon/0135_project_scoped_memory.sql` | Adds project scoped memory columns |
| endpoint | Project memory edit | `apps/web/app/api/projects/[id]/memory/edit/route.ts` | GET and POST memory edit |
| component | Mobile members section | `apps/mobile/src/features/projects/components/ProjectMembersSection.tsx` | Who can access on mobile |
| component | Mobile memory sheet | `apps/mobile/src/features/projects/components/ProjectMemorySheet.tsx` | Project memory on mobile |
| component | Mobile sources tab | `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx` | Sources on mobile |
| command | CLI add-file and memory add | `apps/cli/src/lib.rs` | projects add-file; memory add --project |
| service | CLI memory | `apps/cli/src/memory.rs` | Account memory client |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person adds a file; the app uploads it to object storage and registers metadata with POST knowledge-files. | device and our servers | project-knowledge-files.ts:264-356; knowledge-files/route.ts:68-106 |
| Server checks the storage allowance of the plan before registering. | our servers | project-knowledge-files.ts:264-268; file-storage.ts:73 |
| File is indexed so chats can search it; state is returned on list. | our servers | knowledge-files/route.ts:54-62 (readIndexStates); cron index-retrieval-documents exists in apps/web/app/api/cron |
| Share: owner picks audience; service writes shared project and member grants; viewers cannot be raised to edit. | our servers | org-sharing-service.ts:305-433; ProjectSharingControls.tsx:46-48 |
| Memory: panel reads and writes facts with projectId through the cloud memory controller; chat pipeline filters memory by project and flag. | device and our servers | ProjectMemoryPanel.tsx:52-70; managed-memory-context-service.ts:1087 |
| CLI uploads a file to the project via the cloud knowledge client. | our servers | apps/cli/src/lib.rs:3810-3812 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Knowledge files (bytes) | object storage; metadata in table:project_knowledge_files | Yes | Deleting a project purges its files (test name delete-purges-knowledge-files.test.ts); file delete retries object removal (project-knowledge-files.ts:130-140) |
| Sharing grants | organization shared project tables from migration 0316 | Yes | Stop sharing removes access; project kept |
| Project memories | memory tables with project_id (migration 0135) | Yes across apps using cloud memory | Edit and delete from panel; expiry cron expire-memories exists |
| Notes on Sources tab | unknown (ProjectNotes not read) | unknown | unknown |

**Models and providers.** Registering a file does not call a chat model. Indexing may use an embedding model chosen by the retrieval service; this was not read, so unknown (SYS-memory-projects-and-context). Memory capture is performed by the chat pipeline model, not this page.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; sharing needs a team workspace. |
| Permissions | Read needs readable-project access; write needs owner or shared 'write'; sharing changes need owner with share right or workspace manager; viewers capped at read (org-sharing-service.ts:72-120,405-433). |
| Subscription | Storage limit comes from the plan's knowledgeStorageBytes (free-plan-entitlements.ts:18-22); with no storage the message says the plan 'does not include file storage'. Shared-project limit message exists (org-sharing-service.ts:311). Values not read. |
| Limits and metering | Storage meter shared with the Library (file-storage.ts). Number of shared projects limited by getSharedProjectLimitErrorMessage. |
| Feature flags | None found for sources and members on web. |
| Model compatibility | None found. |
| Provider restrictions | None found; indexing provider unknown. |
| Local mode | Mobile Local projects keep sources on the device [inferred from the separate local project store]; whether Local sources are indexed on device is unknown. Web and Desktop have no Local mode. Project memory in the CLI is an account feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Project not readable | 404 'Project not found' | knowledge-files/route.ts:33 |
| List fetch fails | 500 'Failed to fetch knowledge files' | knowledge-files/route.ts:49 |
| Bad registration body | Validation error with first issue | route.ts:86-92 |
| Over storage | Validation error with upgrade text | file-storage.ts:73 |
| Memory not ready | Status text 'Cloud memory is unavailable...' | ProjectMemoryPanel.tsx:28 |
| Memory save or delete fails | Inline error text | ProjectMemoryPanel.tsx:13-14 |
| Sharing overview error | Alert 'Sharing could not be loaded. Try again.' | ProjectShareDialog.tsx:72-75 |
| Personal workspace | Note to switch to a team workspace | ProjectShareDialog.tsx:76-80 |
| Stop sharing | Confirm dialog names loss of access | ProjectShareDialog.tsx:128-135 |
| Offline upload | not handled in the code I opened | nothing found in knowledge-files/route.ts or project-knowledge-files.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/route.test.ts`: Knowledge files route
- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/storage-meter-matches-cap.test.ts`: Storage meter equals the cap (name)
- `apps/web/app/api/projects/[id]/__tests__/knowledge-files.org-shared.test.ts`: Shared project knowledge files
- `apps/web/app/api/projects/[id]/__tests__/delete-purges-knowledge-files.test.ts`: Project delete purges files (name)
- `apps/web/features/projects/components/__tests__/SourcesPanel.org-shared.test.tsx`: Sources panel for shared projects
- `apps/web/features/projects/components/__tests__/KnowledgeCapacityVisible.test.tsx`: Capacity shown
- `apps/web/features/projects/components/__tests__/ProjectMemoryPanel.edit.test.tsx`: Editing project memory
- `apps/web/features/projects/components/__tests__/Notebook.test.tsx`: Notebook component (name only)
- `apps/mobile/src/features/projects/__tests__/ProjectSharedWithYou.test.tsx`: Mobile shared projects
- `apps/mobile/src/features/projects/__tests__/ProjectMemoryEdit.test.tsx`: Mobile project memory edit
- `apps/mobile/src/features/projects/__tests__/ProjectSourcesViewer.test.tsx`: Mobile sources viewer

**Test scenarios**

- **Add and remove a source**
  1. Open project > Sources
  2. Add a small text file
  3. Wait for index state
  4. Remove it
  - Expected: File appears with state then disappears; meter updates
- **Storage limit**
  1. Use an account near its plan storage
  2. Add a file that exceeds it
  - Expected: Refusal text says delete a file or upgrade
- **Viewer cannot edit**
  1. In a team workspace share a project
  2. Set a Viewer-role member to Can edit
  - Expected: Option shows 'Can edit (their role can only view)' and access stays view
- **Memory separation**
  1. Add a memory in project A settings
  2. Open project B settings
  - Expected: B does not list it
- **Outside-memory switch**
  1. Switch off 'Use memories from outside this project'
  2. Ask a question that depends on an account memory
  - Expected: Answer ignores account memory
- **CLI add-file**
  1. agi projects add-file <project> ./notes.txt
  2. agi projects show <project>
  - Expected: File receipt printed and listed in show

**Where to look when it fails**

- Logs 'Failed to fetch knowledge files'; '[knowledge-files] could not delete an uploaded object from storage; queued for retry'
- Tables project_knowledge_files and organization sharing tables
- Forbidden errors from org-sharing-service.ts:79-120

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Brief is stale for mobile members, mobile memory, CLI sources and the CLI flag name.** Affects: Mobile, CLI. Evidence: ProjectSettingsScreen.tsx:193; lib.rs:1328,1447. Work needed: Update the brief and verify these screens by use
- **Notebook annotation and generated outputs were not confirmed.** Affects: Web, Desktop. Evidence: ProjectStudio.tsx not read. Work needed: Read and verify against S4.31
- **Chrome and VS Code have no sources, members or memory.** Affects: Chrome, VS Code. Evidence: Brief marks missing; none found. Work needed: Decide scope
- **CLI cannot remove a source or list project sources except via show.** Affects: CLI. Evidence: ProjectsSubcommand list in lib.rs:1286-1352 has no remove-file. Work needed: Add remove-file if required
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- table:project_knowledge_files
- table:user_projects
- api:GET /api/projects/{id}/knowledge-files
- api:POST /api/projects/{id}/knowledge-files
- F004-03

## Unknown

- Where project notes are stored and how they sync.
- Which model indexes project files and where that runs.
- Plan values for storage and shared-project limits.
- What ProjectStudio generates and whether annotation exists.
- Whether mobile Local projects index sources on the device.
- Whether the mobile Members section shows for non-team accounts.
