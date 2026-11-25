---
id: "F037-02"
type: "feature"
title: "Title, description and instructions"
aliases: ["Project settings", "Project instructions", "Custom instructions for a project", "Edit project", "Notebook title and description (S37.03)", "Notebook instructions (S37.15)", "agi projects edit", "Rename project, Project description, Project instructions (VS Code)"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S37.03", "S37.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:PUT /api/projects/{id}", "table:user_projects", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "F037-01", "F037-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-02 Title, description and instructions

Each project has a name, a description and instructions. The person can change them at any time on web, mobile, CLI and VS Code. Instructions and description are added to the model's context in every chat in that project, so the person does not repeat the rules in each chat.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.03](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3703), [S37.15](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3715).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores a name (up to 200 characters), a description (up to 2000) and instructions (up to 10000) per project and sends them with every chat in the project (packages/contracts/cloud-contracts/src/project-contract.json:3-5; apps/web/lib/services/project-context-service.ts:585-610).

**Why it exists.** People want a workspace to behave the same way every time, for example 'answer in Spanish', without typing it again. It also lets a project be recognised by name. [inferred]

**Who uses it.** Project owners; on a shared project, people granted edit access may change name, description, instructions and appearance (apps/web/app/api/projects/[id]/route.ts:262-271).

**Problems it solves**

- Repeating the same guidance in every chat.
- Telling projects apart in a long list.
- Keeping edits safe when two people or two apps change the project at once (If-Match version check).

**Use cases**

- Write 'Keep answers short and cite the file name' as instructions for a research project.
- Rename a project from the CLI: agi projects edit Launch --name Launch-2.
- Add a description on mobile so the project card explains its purpose.
- An editor on a shared project fixes a typo in the instructions.

## 2. User experience

**Where to find it**

- Web: project page, 'Project options' menu then the settings item (Settings2 icon), which opens the project settings dialog with Name, description, instructions, memory switches and a 'Files' section (apps/web/app/chat/projects/[id]/page.tsx:574, 664; ProjectSettingsDialog.tsx:253-330, 406-414). Button 'Save'.
- Desktop: same hosted web page (doc: AGENTS.md section 5).
- Mobile: project detail, 'Project settings' button (projects/[id].tsx:451) and the instructions sheet 'Add instructions' / 'Project instructions' (ProjectInstructionsSheet.tsx:38, 256); Edit through ProjectEditorModal.
- CLI: 'agi projects edit <project> [--name] [--description] [--instructions]' (apps/cli/src/lib.rs:1311-1316).
- VS Code: open a project, then pick 'Rename project', 'Project description', 'Project instructions' (projectActions.ts:275-318).
- Chrome: not found.

**Before you start**

- Signed in; the project must be owned by the person, or shared with Can edit for content fields.
- Archived and ownership-only fields (archive, star, privacy defaults, allowed surfaces, memory switches) are owner-only (apps/web/app/api/projects/[id]/route.ts:33-43).

**Screens and controls**

- Web dialog: 'Project name' (Enter saves), 'What is this project for?' description, instructions area with the example 'Respond in Spanish. Reference the latest documentation...', three switches for memory and account instructions and style, default model, chat defaults, 'Files' panel, Duplicate, Delete, Save (ProjectSettingsDialog.tsx:275-325, 344-401, 467-474).
- Mobile instructions sheet with 'Keep editing' / 'Discard' alert on cancel (ProjectInstructionsSheet.tsx:187-189).
- VS Code input boxes titled '<product>, Rename project', 'Project description', 'Project instructions' (projectActions.ts:278-308).

**Journey**

1. Open the project and its settings (web dialog, mobile settings or instructions sheet, VS Code project detail, or the CLI edit command).
2. Change the name, description or instructions.
3. Save. Web closes the dialog and shows 'Project updated'; CLI prints 'Updated project <id>.'; VS Code shows an information message.
4. Start or continue a chat in the project: the new instructions apply to the next reply.

**What the person sees and gets**

- Web toasts 'Project name is required', 'Project updated', 'Failed to update project' (ProjectSettingsDialog.tsx:172, 200, 204).
- Web unsaved-changes prompt: 'Your changes to this project have not been saved. If you leave now, they will be lost.' (ProjectSettingsDialog.tsx:118-122).
- Server 412-style answer 'This project changed. Review the latest project before saving again.' when the version no longer matches (apps/web/app/api/projects/[id]/route.ts:303-311).
- Editor refused on owner-only fields with a message naming the fields (route.ts:262-271).
- CLI errors: 'A project needs a name', 'Nothing to change: pass --name, --description or --instructions.' (lib.rs:3763-3772).

**Settings**

- Switches: use account memory, use account instructions, use account style (ProjectSettingsDialog.tsx:344-401).
- Default model and chat defaults for the project (ProjectSettingsDialog.tsx:96-97).
- VS Code 'Use in this chat' adds the project and its instructions to VS Code turns (projectActions.ts:132-136).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: edit in a dialog with dirty detection and discard guard, save through PUT /api/projects/[id] with optimistic version (apps/web/features/projects/components/ProjectSettingsDialog.tsx:108-122, 169-205; route.ts:145-324).
- Server applies name, description, instructions and colour edits for the owner, and for an editor on a shared project, with an owner-only field list (route.ts:33-43, 257-279).
- Chat context: the project's name, description and instructions are rendered into the system prompt (project-context-service.ts:585-610) and loaded for each project chat in the chat completions request processor (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855-3860).
- CLI edit sends a PUT and refreshes the cache (apps/cli/src/lib.rs:3750-3786; cloud/mod.rs:548-559).
- VS Code edit through input boxes with progress and error messages (projectActions.ts:275-380).
- Mobile: Local-mode instructions are added as a system message from the on-device project (apps/mobile/stores/chat/chatExecutionStore.ts:2772-2774); Cloud-mode edits go through updateCloudProjectDetails and sync (apps/mobile/src/features/projects/service.ts:95).

**Incomplete**

- loadProjectContext reads only projects where user_id is the asker, so a shared member's chat may not receive the owner's instructions; the effect was not run (project-context-service.ts:205-210; request-processor.ts:3868-3880) [inferred].

**Present but disconnected or switched off**

- None found.

**Not available**

- Chrome: no screen to edit a project was found.
- Failure messages for mobile save beyond 'Could not save the instructions. Try again.' were not fully read (ProjectInstructionsSheet.tsx:198).

## 4. Required behaviour

**Established requirements**

- A notebook has a title and description the user can set and later edit. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.03)
- The notebook has instructions that apply to every chat in it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.15)
- Project instructions are applied to every chat in the project, on every client (VS Code prompt text). (source: apps/extension-vscode/src/features/projects/projectActions.ts:306-308)
- An editor on a shared project can change name, description, instructions and appearance; the rest stays with the owner. (source: apps/web/app/api/projects/[id]/route.ts:268)
- Unsaved web edits are guarded before the dialog closes. (source: apps/web/features/projects/components/ProjectSettingsDialog.tsx:118-131)

**Acceptance criteria**

1. Changing the instructions on web and starting a new chat in that project makes the reply follow them.
2. Saving an empty name is refused with 'Project name is required' and nothing changes.
3. Closing the web dialog with edits shows the discard prompt; choosing keep editing leaves the edits.
4. Two apps editing from the same version: the second save is refused with the 'This project changed' message and returns the latest project.
5. An editor tries to archive a shared project: refused with a message that names the owner-only field.
6. CLI 'agi projects edit' with no flags exits with the 'Nothing to change' message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Edits on one app appear on the others after refresh because all use the same row [inferred from the shared route].
- Instructions longer than 10000 characters are refused by validation [inferred from project-contract.json:5; schema code not opened].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the length limits next to the fields.
- [proposed] Confirm in a test that a shared member's chat receives the owner's instructions, or document that it does not.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Web edit dialog, dirty check, save, duplicate, delete, Files panel. |
| endpoint | PUT /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Update fields; owner/editor split; If-Match version check. |
| schema | ManagedCloudProjectUpdateRequestSchema | `packages/contracts/cloud-contracts/src/projects.ts` | Request validation for create and update. |
| config | project contract limits | `packages/contracts/cloud-contracts/src/project-contract.json` | Length limits 200, 2000 and 10000. |
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | loadProjectContext (line 188) and renderProjectContextBlocks (585): turns name, description and instructions into prompt blocks. |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads the project context for a project conversation and returns 409 project_context_unavailable when it cannot. |
| service | managed-cloud-projects | `apps/web/features/projects/services/managed-cloud-projects.ts` | Web client used by the dialog. |
| component | ProjectInstructionsSheet | `apps/mobile/src/features/projects/components/ProjectInstructionsSheet.tsx` | Mobile instructions editor with discard alert. |
| component | ProjectEditorModal | `apps/mobile/src/features/projects/components/ProjectEditorModal.tsx` | Mobile name, description editor. |
| service | updateCloudProjectDetails | `apps/mobile/src/features/projects/service.ts` | Mobile Cloud-mode edit to the account. |
| store | useProjectStore.updateProject | `apps/mobile/src/features/projects/store.ts` | Local and Cloud edit branches (store.ts:438-466). |
| service | chatExecutionStore project context | `apps/mobile/stores/chat/chatExecutionStore.ts` | Adds instructions and sources as system messages in Local mode (2755-2775). |
| command | agi projects edit | `apps/cli/src/lib.rs` | Edit subcommand (1311-1316) and handler (3750-3786). |
| service | update_project | `apps/cli/src/cloud/mod.rs` | PUT of the patch to the project route. |
| command | VS Code edit actions | `apps/extension-vscode/src/features/projects/projectActions.ts` | edit-name, edit-description, edit-instructions, edit-default-model (275-380). |
| table | user_projects | `apps/web/app/api/projects/[id]/route.ts` | Update statement with server_version predicate (lines 216-234). |
| test | ProjectSettingsDialog tests | `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.save-ownership.test.tsx` | Save behaviour of the dialog (file name). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person edits a field in the app and saves; the app sends PUT /api/projects/[id] with the project version in If-Match. | device and our servers | ProjectSettingsDialog.tsx:169-205; route.ts:156-160 |
| Server verifies CSRF, rate limit and body, builds the update, and matches by owner and version; on a miss it checks if the caller is an editor. | our servers | route.ts:145-280 |
| Server returns the new project with a new ETag, or the latest copy with a precondition-failed answer. | our servers | route.ts:303-323 |
| On the next project chat turn the server loads the project row and renders name, description and instructions into prompt blocks. | our servers | project-context-service.ts:188-215, 585-610; request-processor.ts:3855-3860 |
| In mobile Local mode the phone adds the instructions as a system message before sending to the on-device model. | device | apps/mobile/stores/chat/chatExecutionStore.ts:2755-2775 |
| Mobile Cloud mode edits the cloud store, marks the project dirty and the sync engine pushes it. | device and our servers | store.ts:438-455; cloudSyncEngine.ts:1109-1111 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| name, description, instructions columns | table user_projects | Yes for account projects; no for mobile Local-mode projects | Kept until the project is deleted; deletion is a soft delete (route.ts:326-359) |
| Prompt text built from the project | Built per request; not stored as a separate row [inferred; renderer is a pure function] | No | Lives for the turn, subject to the chat's own storage |

**Models and providers.** Whatever model the chat uses receives the project text as system context; the notebook feature does not pick a model. Project text is trimmed to a character budget and dropped by layer when the context is full (project-context-service.ts:554-568). In Local mode the on-device model gets the instructions; no provider is called by the edit itself.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required for account projects on web, CLI, VS Code. Mobile Local-mode projects need none (store.ts:421-466). |
| Permissions | Owner may edit everything; an editor may edit name, description, instructions, appearance; a viewer cannot (route.ts:33-43, 257-279; ProjectSharingControls.tsx:40-48). |
| Subscription | No plan gate on editing text found in the code; the project itself is limited by plan (see F037-01). |
| Limits and metering | Length limits 200 / 2000 / 10000 (project-contract.json:3-5). Prompt budget caps how much project text enters a turn (project-context-service.ts:93, 554-568). Rate limit class 'chat-conversation' (route.ts:151). |
| Feature flags | None found for editing. Mobile FEATURES.projects true. |
| Model compatibility | Instructions are plain text for any model; none found in the code that varies by model. |
| Provider restrictions | None found in the code. |
| Local mode | Mobile Local mode: instructions live on the device and are sent only to the on-device model (chatExecutionStore.ts:2755-2775). Web, CLI, VS Code: no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsaved changes | Web dirty flag compares saved and edited values and prompts before closing; mobile instructions sheet asks 'Discard changes to the instructions?'. | ProjectSettingsDialog.tsx:108-131; ProjectInstructionsSheet.tsx:187-189 |
| Saving | A save-pending guard blocks closing during a save. | ProjectSettingsDialog.tsx:127 |
| Empty name | Refused with 'Project name is required' (web) or 'A project needs a name' (CLI). | ProjectSettingsDialog.tsx:172; lib.rs:3763 |
| Conflict | Version mismatch returns the latest project and a 'This project changed' message. | route.ts:303-311 |
| Editor on owner-only field | 403 with the field names. | route.ts:262-271 |
| Archived or deleted project in chat | Chat returns 409 project_context_unavailable: 'This project is archived, deleted, or unavailable...'. | request-processor.ts:3868-3880; project-context-service.ts:206-209 |
| Save error | Web toast 'Failed to update project'; mobile 'Could not save the instructions. Try again.' | ProjectSettingsDialog.tsx:204; ProjectInstructionsSheet.tsx:198 |
| Offline | Not handled in the code for web; mobile Cloud mode keeps the edit dirty for the next sync [inferred from markProjectForSync]. | store.ts:438-455 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.save-ownership.test.tsx`: Web save ownership (file name).
- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.description.test.tsx`: Description field in the dialog (file name).
- `apps/web/app/api/projects/[id]/route.revision.test.ts`: Version / If-Match behaviour of the project route (file name).
- `apps/web/app/api/projects/__tests__/route.shared-editor.test.ts`: Editor edits on a shared project (file name).
- `apps/web/lib/services/__tests__/project-context-service.test.ts`: Prompt rendering of the project context (file name).
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.project-precedence.test.ts`: Order of project instructions against other instructions (file name).
- `apps/mobile/src/features/projects/__tests__/ProjectInstructionsMemory.test.tsx`: Mobile instructions sheet (file name).
- `apps/mobile/src/features/projects/__tests__/updateCloudProjectDetails.test.ts`: Mobile Cloud edit (file name).
- `apps/mobile/src/features/projects/__tests__/ProjectSettings.test.tsx`: Mobile settings screen (file name).

**Test scenarios**

- **Instructions reach the reply**
  1. On web set instructions 'Always answer in French'.
  2. Start a new chat inside the project and ask a question in English.
  - Expected: The reply is in French.
- **Discard guard**
  1. Open settings, type in the description, press Escape or close.
  - Expected: A prompt about unsaved changes appears; 'discard' restores the saved text.
- **Concurrent edit**
  1. Open the project on web and mobile.
  2. Save a name on mobile, then save a different name on web without refreshing.
  - Expected: The second save is refused with the 'This project changed' message.
- **Editor limits**
  1. As an editor of a shared project change the instructions, then try to archive it.
  - Expected: Instructions save; archiving is refused naming 'isArchived'.
- **CLI edit**
  1. Run 'agi projects edit Launch --instructions Be brief'.
  2. Open the project on web.
  - Expected: The instructions show 'Be brief'.

**Where to look when it fails**

- Server log 'Failed to delete project' / update errors via withErrorHandler; response code 'project_context_unavailable' (request-processor.ts:3878).
- Web toast text 'Failed to update project'.
- CLI exit message 'No project ''x'' in your AGI account' (lib.rs:3764).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)
- CLI: [70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md)
- VS Code: [70-qa/test-plans/vscode/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/vscode/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **A shared member's chat may fail or lack the owner's instructions because loadProjectContext only matches the project owner.** Affects: Members of shared projects on web and every app that chats through the server. Evidence: apps/web/lib/services/project-context-service.ts:205-210; request-processor.ts:3855-3880. Work needed: Run a shared-member chat to see the result; if broken, authorize the project through the shared scope and add a test.
- **Chrome has no way to edit a project.** Affects: Chrome users. Evidence: No code found in apps/extension/src/features/cloud-bridge/projectsClient.ts (list only). Work needed: Record as out of scope (D-2026-09-28-23) or build.
- **CLI chat use of instructions (brief cites apps/cli/src/cloud/mod.rs:589 and agent/mod.rs:605) was not opened.** Affects: CLI users. Evidence: Brief S37.15 code list. Work needed: Open and confirm, then add test coverage.
- **No visible length counter for the 200/2000/10000 limits was found.** Affects: All edit surfaces. Evidence: ProjectSettingsDialog.tsx:275-325 shows placeholders only. Work needed: Add counters or inline errors.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- api:PUT /api/projects/{id}
- table:user_projects
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- F037-01
- F037-03

## Unknown

- Whether a shared member's project chat receives the owner's instructions (not run).
- CLI chat use of instructions (files in the brief not opened).
- Chrome use of project instructions (side_panel.ts:7359 per brief, not opened).
- Exact validation message when an over-length value is sent.
