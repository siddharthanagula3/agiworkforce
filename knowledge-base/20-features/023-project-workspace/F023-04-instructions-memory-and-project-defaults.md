---
id: "F023-04"
type: "feature"
title: "Instructions, memory and project defaults"
aliases: ["Project instructions", "Project memory", "Default model", "New chats start with", "Use memories from outside this project", "Project-only context", "usesGlobalMemory"]
area: "23 Project workspace"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S23.09", "S23.11", "S23.16", "S23.17", "S23.33"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "mode:cloud", "mode:local", "table:user_projects", "api:PUT /api/projects/{id}", "F023-01", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-04 Instructions, memory and project defaults

A project can carry instructions added to its chats, its own memories, a default model, default chat tools and a Skill, and a switch to use only its own memories. Web has the full set. Mobile has instructions and a memory sheet. CLI applies instructions in managed mode. VS Code applies instructions and default model by choice.

Area: [23. Project workspace](README.md). Requirement items: [S23.09](../../10-requirements/capabilities/023-project-workspace.md#s2309), [S23.11](../../10-requirements/capabilities/023-project-workspace.md#s2311), [S23.16](../../10-requirements/capabilities/023-project-workspace.md#s2316), [S23.17](../../10-requirements/capabilities/023-project-workspace.md#s2317), [S23.33](../../10-requirements/capabilities/023-project-workspace.md#s2333).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built (this page lists unfinished parts) | partly built | partly seen (1 of 4) |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores per-project standing context and defaults, and applies them to chats in the project: instructions in the system prompt, project memories, a default model for new chats, and tool and Skill defaults (apps/web/lib/services/project-context-service.ts:585-610; apps/web/features/chat/pages/WebChatPage.tsx:2127-2149).

**Why it exists.** Brief items S23.09, S23.11, S23.16, S23.17 and S23.33 (doc: knowledge-base/data/area-briefs/023-project-workspace.md).

**Who uses it.** Signed-in users on Web, Desktop (hosted), Mobile, CLI and VS Code.

**Problems it solves**

- Retyping the same rules in each chat
- Keeping project knowledge from mixing with account memory
- Starting every chat on the right model and tools

**Use cases**

- Set instructions 'Respond in Spanish' for a language project.
- Turn off 'Use memories from outside this project' for a private client project.
- Set a default model and 'Run code' for a data project.
- Set instructions from the phone.

## 2. User experience

**Where to find it**

- Web: project menu 'Project options' then Settings, dialog 'Project settings' (apps/web/app/chat/projects/[id]/page.tsx:661; ProjectSettingsDialog.tsx).
- Mobile: project page instructions sheet and memory sheet (apps/mobile/src/features/projects/components/ProjectInstructionsSheet.tsx, ProjectMemorySheet.tsx).
- CLI: agi projects edit --instructions; agi projects link (apps/cli/src/lib.rs:1311, 1323).
- VS Code: project quick pick items Instructions, Default model, 'Use in this chat' (projectActions.ts:130-168).

**Before you start**

- Cloud project; owner or editor for edits. Editors cannot change owner-only fields (apps/web/app/api/projects/[id]/route.ts:262-270).

**Screens and controls**

- Web 'Instructions' textarea with hint 'Set context and customize how the assistant responds in this project.' and character count (ProjectSettingsDialog.tsx:311-335).
- Web 'Default model' select, option 'No default, use the model you last picked' (ProjectDefaultModelField.tsx:53-69).
- Web 'New chats start with': 'Run code', 'Research', 'Skill' select with 'No Skill' (ProjectChatDefaultsField.tsx:25-60).
- Web 'Personalization' checkboxes and 'Memory' checkbox 'Use memories from outside this project' (ProjectSettingsDialog.tsx:342-405).
- Web memory panel (ProjectMemoryPanel.tsx).

**Journey**

1. Open Project settings.
2. Edit instructions, choose a default model, tick tools, pick a Skill, set the memory checkbox.
3. Save; a toast 'Project updated' appears.
4. Start a new chat in the project: the default model and tools are applied and the server adds the instructions.

**What the person sees and gets**

- Toast 'Project updated' or an error toast (ProjectSettingsDialog.tsx:169-210).
- Unsaved changes guard when closing (ProjectSettingsDialog.tsx:105-130).
- The model select marks an unavailable stored model '(not available on your plan)' (ProjectDefaultModelField.tsx:63).

**Settings**

- Account instructions and response style toggles per project (ProjectSettingsDialog.tsx:342-375).
- VS Code: active project is per workspace (apps/extension-vscode/src/features/projects/activeProject.ts:5).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Update route accepts instructions, defaultModelId, chatDefaults, usesGlobalMemory, usesAccountInstructions, usesAccountStyle with trimming and version precondition (apps/web/app/api/projects/[id]/route.ts:145-230).
- Server adds 'Project instructions (set by the user; follow them for every reply in this project)' to chat turns of project chats (project-context-service.ts:606; request-processor.ts:3855).
- Memory scope: when usesGlobalMemory is false memory queries are limited to the project (apps/web/lib/services/managed-memory-context-service.ts:1087, 1269-1278).
- Web applies default model once to a new chat in a project and applies chat defaults through useProjectChatDefaults (WebChatPage.tsx:2127-2149).
- Web has default tools and Skill fields, although the brief says web missing (ProjectChatDefaultsField.tsx).
- Mobile Local turns prepend project instructions as a system message (apps/mobile/stores/chat/chatExecutionStore.ts:2772-2774); mobile Cloud turns use the server.
- CLI adds account project instructions to managed turns for a linked folder (apps/cli/src/cloud/mod.rs:963-990; apps/cli/src/agent/mod.rs:238-246) and the memory context is filtered by project (apps/cli/src/cloud/memory.rs:198).
- VS Code sends the active project's instructions as a prelude unless the server applies them (apps/extension-vscode/src/features/instructions/customInstructions.ts:104).

**Incomplete**

- CLI refuses to start a chat in a project that has tool defaults because it cannot honour them (apps/cli/src/cloud/projects/api.rs:100-111, can_start_chat).
- CLI project instructions apply only in Managed privacy mode (cloud/mod.rs:968-970).
- Mobile: usesGlobalMemory is set at create and patched; brief says memory missing but a memory sheet exists (store.ts:396-401; ProjectMemorySheet.tsx).
- VS Code and Chrome have no memory or project-only switch found.

**Present but disconnected or switched off**

- The CLI's skills.rs project 'disabled-skills.json' is a per-folder switch, not the account project's Skill default (apps/cli/src/skills.rs:111-125).

**Not available**

- Account project default tools and Skill on CLI, VS Code, Chrome (chatDefaults not read except to refuse).
- Project-only context switch on VS Code, Chrome; on CLI no toggle found.

## 4. Required behaviour

**Established requirements**

- Instructions saved on a project are applied to every chat in that project. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.09)
- A project keeps its own memories and the user chooses whether it also uses account memory. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.11)
- A project can set a default model that new chats start with. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.16)
- A project can set default tools and Skills for its chats. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.17)
- A user can switch a project to its own context only, excluding account-wide memory and other chats. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.33)
- An editor on a shared project can change name, description, instructions and appearance; other fields stay with the owner. (source: apps/web/app/api/projects/[id]/route.ts:262-270)

**Acceptance criteria**

1. Instructions saved in settings appear in the next project chat reply behaviour.
2. Saving with a stale version returns a changed-project message instead of overwriting.
3. With the memory box off, a fact remembered outside the project is not used in the project chat.
4. A new chat opened in a project with a default model starts on that model.
5. Run code and Research defaults are pre-ticked in a new project chat and can be turned off.
6. A stored default model not on the plan is shown as not available, not silently dropped.
7. CLI-linked folder: managed turn includes the project instructions.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'every chat' holds for Cloud project chats because the server loads context per turn (request-processor.ts:3855); not traced for every app [inferred].
- Project-only context equals usesGlobalMemory false; the brief's 'other chats' exclusion is not traced [inferred from project-context-service sibling chats and past-chat-context-service.ts:172].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the CLI honour chatDefaults instead of refusing.
- [proposed] Show the project-only switch on mobile and VS Code.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | PUT /api/projects/{id} | `apps/web/app/api/projects/[id]/route.ts` | Updates instructions, defaults and memory switches with version check. |
| schema | ProjectChatDefaultsSchema and update schema | `packages/contracts/cloud-contracts/src/projects.ts` | Shape of chatDefaults and usesGlobalMemory (lines 14-25, 114). |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Edit form for instructions, defaults, memory. |
| component | ProjectDefaultModelField | `apps/web/features/projects/components/ProjectDefaultModelField.tsx` | Default model select filtered by plan. |
| component | ProjectChatDefaultsField | `apps/web/features/projects/components/ProjectChatDefaultsField.tsx` | Run code, Research and Skill defaults. |
| component | ProjectMemoryPanel | `apps/web/features/projects/components/ProjectMemoryPanel.tsx` | List and edit project memories. |
| hook | useProjectChatDefaults | `apps/web/features/projects/hooks/use-project-chat-defaults.ts` | Applies tool defaults to a new chat. |
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | Renders instructions into the prompt. |
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Scopes memory by project and usesGlobalMemory. |
| endpoint | /api/projects/{id}/memory | `apps/web/app/api/projects/[id]/memory` | Project memory routes (edit folder). |
| service | chat turn project load | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads project context per turn. |
| component | ProjectInstructionsSheet | `apps/mobile/src/features/projects/components/ProjectInstructionsSheet.tsx` | Mobile instructions editor. |
| component | ProjectMemorySheet | `apps/mobile/src/features/projects/components/ProjectMemorySheet.tsx` | Mobile memory sheet. |
| service | updateCloudProjectDetails | `apps/mobile/src/features/projects/service.ts` | Patches usesGlobalMemory and appearance with rollback. |
| service | project_instructions_context | `apps/cli/src/cloud/mod.rs` | Instruction block for CLI turns. |
| component | applyProjectToChat | `apps/extension-vscode/src/features/projects/projectActions.ts` | Stores active project and offers its default model. |
| component | formatActiveProjectPrelude | `apps/extension-vscode/src/features/projects/activeProject.ts` | Prelude text with instructions. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Settings are saved with PUT and If-Match version; a conflict returns the latest project. | our servers | apps/web/app/api/projects/[id]/route.ts:145-175, 296-312 |
| Opening a new chat in the project selects the default model and tool defaults in the browser. | device | apps/web/features/chat/pages/WebChatPage.tsx:2127-2149 |
| Each turn loads the project, renders instructions and files into blocks and trims them to a character budget. | our servers | request-processor.ts:3855-3880; project-context-service.ts:585-650 |
| Memory lookup is limited to the project when usesGlobalMemory is false. | our servers | managed-memory-context-service.ts:1087, 1269-1278 |
| The assembled prompt goes to the chosen model provider. | outside service | [inferred] chat turn pipeline; not traced here |
| Mobile Local and CLI build the prompt on the device; the CLI reads the cached project row. | device | chatExecutionStore.ts:2772; cloud/mod.rs:972-990 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Instructions, defaultModelId, chat_defaults, uses_global_memory | table user_projects | Account wide | With the project |
| Project memories | Memory tables keyed by project id (managed-memory-context-service.ts:1087) | Account wide | Edited or forgotten by user in the memory panel |
| VS Code active project (id, name, instructions up to 8000 chars) | store:workspaceState key agiWorkforce.activeCloudProject | No, per workspace | Cleared on stop or delete |

**Models and providers.** The default model id is chosen from the plan-filtered model list; a Local model is not offered as a project default in VS Code (projectActions.ts:337). Model identity is resolved by the model catalog, not this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud signed in; mobile Local needs none. |
| Permissions | Owner may change all fields; an editor of a shared project only name, description, instructions, appearance (route.ts:262-270). |
| Subscription | Projects capability; default model list excludes models not allowed for the tier (ProjectDefaultModelField.tsx:25-45); Skills capability tiers apply (billing-catalog.ts:350). |
| Limits and metering | Instruction and description length limits come from project-contract.json (projects.ts:93-95). Prompt context has a character budget (request-processor.ts:3880). |
| Feature flags | None found. |
| Model compatibility | Default model must be selectable for the plan; unavailable ones show a warning label. |
| Provider restrictions | Managed route modes only (projects.ts:21). |
| Local mode | Mobile Local project instructions apply to local turns on the device (chatExecutionStore.ts:2772). CLI account project instructions are skipped unless privacy mode is Managed (cloud/mod.rs:968). VS Code does not offer a Local model as default. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsaved edits | Confirm-discard dialog. | ProjectSettingsDialog.tsx:105-130 |
| Name empty on save | Toast 'Project name is required'. | ProjectSettingsDialog.tsx:170-173 |
| Version conflict | 412 style reply 'This project changed. Review the latest project before saving again.' | apps/web/app/api/projects/[id]/route.ts:304-311 |
| Archived project | Chats get 409 until restored. | request-processor.ts:3860-3872 |
| Stored model not available | Shown with '(not available on your plan)'. | ProjectDefaultModelField.tsx:63 |
| Skill removed | Shown '(no longer in your Skills)'. | ProjectChatDefaultsField.tsx:55 |
| Mobile save fails | Patch rolled back to baseline. | apps/mobile/src/features/projects/service.ts:121-143 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.chat-defaults.test.tsx`: Chat defaults in settings (by name).
- `apps/web/features/projects/hooks/use-project-chat-defaults.test.ts`: Applying defaults (by name).
- `apps/web/features/projects/lib/project-chat-defaults.test.ts`: Defaults helper.
- `apps/web/features/projects/components/__tests__/ProjectMemoryPanel.edit.test.tsx`: Memory panel edit.
- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.save-ownership.test.tsx`: Save ownership.
- `apps/web/app/api/projects/[id]/route.revision.test.ts`: Version precondition.
- `apps/mobile/src/features/projects/__tests__/ProjectInstructionsMemory.test.tsx`: Mobile instructions and memory.
- `apps/mobile/src/features/projects/__tests__/updateCloudProjectDetails.test.ts`: Details patch.
- `apps/desktop/src/features/chat/__tests__/ProjectSettingsDialog.test.tsx`: Internal Tauri settings dialog.

**Test scenarios**

- **Instructions apply**
  1. Set instruction 'End every reply with OK'
  2. Start a project chat
  - Expected: Replies follow the instruction.
- **Project-only memory**
  1. Remember a fact outside the project
  2. Untick the memory box
  3. Ask in a project chat
  - Expected: Fact not used.
- **Default model**
  1. Set a default model
  2. Open a new chat in the project
  - Expected: Model picker shows the default.
- **Tool defaults**
  1. Tick Run code, set a Skill
  2. Open a new project chat
  - Expected: Tool and Skill pre-selected.
- **CLI link**
  1. agi projects link <name> in a folder
  2. Run a managed turn
  - Expected: Instructions in effect; CLI refuses projects with tool defaults.

**Where to look when it fails**

- Log 'Project context load failed'.
- Error code project_context_unavailable.
- Column user_projects.uses_global_memory, chat_defaults, default_model_id, server_version.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/023-project-workspace.md](../../70-qa/test-plans/web/023-project-workspace.md)
- Desktop: [70-qa/test-plans/desktop/023-project-workspace.md](../../70-qa/test-plans/desktop/023-project-workspace.md)
- Mobile: [70-qa/test-plans/mobile/023-project-workspace.md](../../70-qa/test-plans/mobile/023-project-workspace.md)
- CLI: [70-qa/test-plans/cli/023-project-workspace.md](../../70-qa/test-plans/cli/023-project-workspace.md)
- VS Code: [70-qa/test-plans/vscode/023-project-workspace.md](../../70-qa/test-plans/vscode/023-project-workspace.md)

## 10. Gaps and dependencies

- **CLI cannot start chats in projects that have tool defaults.** Affects: CLI users. Evidence: apps/cli/src/cloud/projects/api.rs:100-111. Work needed: Apply defaults or explain.
- **Brief says web default tools missing but code exists.** Affects: Documentation. Evidence: ProjectChatDefaultsField.tsx. Work needed: Update brief.
- **No project-only switch on mobile (after create), CLI, VS Code, Chrome.** Affects: Those apps. Evidence: Brief S23.33; mobile store.ts:396. Work needed: Add or mark not applicable.
- **VS Code and Chrome have no project memory.** Affects: VS Code, Chrome. Evidence: Brief S23.11. Work needed: Add or mark.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- mode:cloud
- mode:local
- table:user_projects
- api:PUT /api/projects/{id}
- F023-01
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether sibling chats are excluded when usesGlobalMemory is false (past-chat-context-service.ts:172 suggests yes, not traced).
- Which providers are used for memory extraction.
- Whether the desktop Tauri build still ships (internal only per AGENTS.md).
