---
id: "AREA-023"
type: "area"
title: "Project workspace"
features: ["F023-01", "F023-02", "F023-03", "F023-04", "F023-05", "F023-06", "F023-07", "F023-08", "F023-09"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 23. Project workspace

A project is a named folder for one body of work. It holds its own chats, files, sources, instructions, memories, artifacts, work tasks and routines, so a person can return to a topic and keep the context together. Sharing a project lets an organisation's members work from the same instructions and files, while chats and personal memory stay with each person.

**Who uses it.** Signed-in users on the web, desktop, mobile, CLI and VS Code surfaces. The web API creates projects behind a plan feature gate and a plan project limit (a limit of 0 blocks creation). Sharing depends on being in an organisation (roles owner, admin, member, viewer), and the web sharing controls need the owner or an admin role. Chrome extension code only selects a project for its side panel. Workspace admins manage shared access. Developers use the CLI project commands and the VS Code active-project setting.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F023-01](F023-01-create-and-set-up-a-project.md) | Create and set up a project | built | built | built | built | built | partly |
| [F023-02](F023-02-project-overview-and-search.md) | Project overview and search | built | built | built | partly | partly | partly |
| [F023-03](F023-03-project-chats-files-sources-notes-and-artifacts-co.md) | Project chats, files, sources, notes and artifacts content | partly | partly | partly | partly | partly | no |
| [F023-04](F023-04-instructions-memory-and-project-defaults.md) | Instructions, memory and project defaults | partly | partly | partly | partly | partly | no |
| [F023-05](F023-05-local-folders-and-coding-sessions.md) | Local folders and coding sessions | no | no | no | built | partly | n/a |
| [F023-06](F023-06-work-tasks-and-routines.md) | Work tasks and routines | partly | partly | partly | partly | no | no |
| [F023-07](F023-07-sharing-members-and-roles.md) | Sharing, members and roles | partly | partly | partly | no | no | no |
| [F023-08](F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md) | Lifecycle: archive, duplicate, delete, import and export | partly | partly | partly | partly | partly | no |
| [F023-09](F023-09-project-activity-history.md) | Project activity history | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/023-project-workspace.md](../../10-requirements/capabilities/023-project-workspace.md).

## How this area works in the code

1. **Screen and client call.** The web project page and dialogs call the managed cloud projects client, which wraps the same-origin API with session refresh and CSRF headers. (`apps/web/features/projects/services/managed-cloud-projects.ts:1-30`)
2. **Create: gate, limit, insert.** POST checks CSRF, rate limit, the projects feature gate, validates the body, reads the plan tier, refuses if the project limit is 0, then inserts the user_projects row and checks the per-user project count in the same statement. Chat membership is written in the same transaction. (`apps/web/app/api/projects/route.ts:138-165`, `apps/web/app/api/projects/route.ts:168-225`)
3. **List.** GET checks the workspace access gate, then lists the user's own projects plus projects shared to the user's organisation, with conversation counts and a keyset cursor. (`apps/web/app/api/projects/route.ts:44-135`)
4. **Update: owner or editor.** PATCH tries the update as the owner; if no row changes it resolves the caller as owner or editor. Editors may not change owner-only fields such as archive. Conditional writes use a version and return a precondition-failed response on change. (`apps/web/app/api/projects/[id]/route.ts:185`, `apps/web/app/api/projects/[id]/route.ts:233-285`, `apps/web/lib/services/org-sharing-service.ts:268-296`)
5. **Delete: soft delete with legal-hold check.** DELETE checks CSRF and rate limit, then soft-deletes the project row in a transaction. A legal hold can refuse it. Knowledge-file retirement is a separate helper. (`apps/web/app/api/projects/[id]/route.ts:326-340`, `apps/web/lib/server/project-deletion.ts:43-60`, `apps/web/lib/server/project-deletion.ts:133-146`)
6. **Sharing resolution.** Every list and write resolves the user's organisation membership and the project grants. Share permission is checked on each read so a downgraded member loses edit rights. (`apps/web/lib/services/org-sharing-service.ts:225-265`)
7. **Chat use of project context.** Chat requests build the project context block from instructions, description and files and place it in the system prompt; the context block is trimmed to a size budget, keeping instruction layers. (`apps/web/lib/services/project-context-service.ts:546-575`)
8. **Other clients store their own copy.** The VS Code extension keeps the active project (id, name, up to a set number of instruction characters) in extension memento storage. The Chrome side panel keeps the active project id and a name cache in chrome storage keys. (`apps/extension-vscode/src/features/projects/activeProject.ts:3-20`, `apps/extension/src/side_panel.ts:544-545`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/projects/route.ts` | Project list (keyset paging) and create, with plan limit and feature gate. |
| `apps/web/app/api/projects/[id]/route.ts` | Read, update (owner and editor rules, version check) and soft delete for one project. |
| `apps/web/lib/services/org-sharing-service.ts` | Organisation roles, project grants (read, write, none) and the owner-or-editor write check. |
| `apps/web/lib/services/project-context-service.ts` | Builds the project context block (instructions, description, files) for chat system prompts. |
| `apps/web/lib/server/project-deletion.ts` | Soft delete and knowledge-file retirement, guarded by legal holds. |
| `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Web settings: edit fields, Duplicate, Export and Delete buttons. |
| `apps/web/app/api/projects/[id]/duplicate/route.ts` | Copies a project's settings; refuses Health projects; keeps the global-memory flag. |
| `apps/web/app/api/projects/[id]/export/route.ts` | Downloads a project as an attachment. |
| `packages/contracts/cloud-contracts/src/projects.ts` | Shared schema for project fields (surfaces, chat defaults, accent colours, import source). |
| `apps/mobile/app/(app)/projects/[id].tsx` | Mobile project page: sources, work, artifacts, routines, instructions and memory sheets. |
| `apps/mobile/src/features/projects/store.ts` | Mobile project store and source upload (cancel on account change). |
| `apps/extension-vscode/src/features/projects/activeProject.ts` | VS Code active cloud project, stored in extension memento. |
| `apps/extension/src/side_panel.ts` | Chrome side panel active project id and name cache. |

## What is stored

- Project rows: name, description, instructions, colour, icon, accent colour, archive flag, global-memory and account-instruction flags, default model, chat defaults, import source, deleted time: Database table user_projects (apps/web/app/api/projects/route.ts:138-225; apps/web/lib/server/project-deletion.ts:141)
- Project knowledge files (soft delete time): Database table project_knowledge_files (apps/web/lib/server/project-deletion.ts:43-60)
- Project membership on a chat: Column project_id on web_conversations (apps/web/app/api/projects/route.ts, conversation count query)
- Per-person project grants (read, write, none) and organisation roles: Grant rows read by apps/web/lib/services/org-sharing-service.ts:225-265; role column in an organisation membership table (organisation role is read at apps/web/lib/services/org-sharing-service.ts:56-65)
- Active project id and name cache (Chrome): Browser extension storage keys agi_active_project and agi_project_names (apps/extension/src/side_panel.ts:544-545)
- Active project id, name, up to a set number of instruction characters (VS Code): VS Code extension memento key agiWorkforce.activeCloudProject (apps/extension-vscode/src/features/projects/activeProject.ts:3)
- Project files and sources uploaded on mobile: Mobile project store (apps/mobile/src/features/projects/store.ts)
- Trusted local folders for projects (CLI): CLI project registry file (apps/cli/src/project_registry.rs:215-225)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Projects feature gate**: Blocks project creation when the workspace policy denies the projects feature; returns a gate response. (apps/web/app/api/projects/route.ts:147 (buildWorkspaceFeatureGateResponse with 'projects'))
- **Plan project limit**: Limit 0 refuses creation; the number caps projects per plan; a database quota check also applies on insert. (apps/web/lib/services/free-plan-entitlements.ts:10-12; apps/web/app/api/projects/route.ts:164, 215)
- **Workspace access gate**: Blocks listing and access when the workspace access policy denies it. (apps/web/app/api/projects/route.ts:50)
- **Connectors released check**: Google Drive picker refuses when connectors are not released. (apps/web/app/api/connectors/google-drive/picker/route.ts:22; apps/web/lib/connectors/connector-capability.ts:27)
- **GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID**: Both must be set for the Google Picker to work; the Drive source stays unavailable without them. (apps/web/app/api/connectors/google-drive/picker/route.ts:23-24)
- **Mobile memory sheet**: Shows the project memory sheet only for cloud projects the user owns, not shared with them. (apps/mobile/app/(app)/projects/[id].tsx:499)
- **Editor restriction on owner-only fields**: Editors cannot change owner-only fields (including archive); the server refuses them. (apps/web/app/api/projects/[id]/route.ts:33-45, 262-270)
- **Legal hold**: A held project or file cannot be deleted; the call is refused with a hold error. (apps/web/lib/server/project-deletion.ts:33-39, 133-146)
- **Global memory flag**: Decides whether account memory is also read by the project; copied on duplicate. (apps/web/app/api/projects/[id]/duplicate/route.ts (comment near the column list))
- **AGI_NATIVE_SEARCH_MAX_USES**: Limits search calls per chat turn; affects research use, not projects directly. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2558-2560)

## Shared between apps

Shared: the web project schema and client (packages/contracts/cloud-contracts/src/projects.ts; apps/web/features/projects/services/managed-cloud-projects.ts wraps the shared client); the web project API routes (apps/web/app/api/projects/*); organisation sharing service (apps/web/lib/services/org-sharing-service.ts); the unified-chat UI package (packages/ui/unified-chat/src/components/ProjectGallery.tsx and ProjectCard.tsx) used by web and desktop. Separate per app: mobile has its own store and components under apps/mobile/src/features/projects; the CLI has its own cloud project code (apps/cli/src/lib.rs, apps/cli/src/cloud/mod.rs, apps/cli/src/project_registry.rs); VS Code has apps/extension-vscode/src/features/projects; Chrome has apps/extension/src/side_panel.ts.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says export is not applicable on every app, but the web route exists and the settings dialog has an Export button. (apps/web/app/api/projects/[id]/export/route.ts; apps/web/features/projects/components/ProjectSettingsDialog.tsx:460-463)
- A code comment says the Duplicate and Export routes shipped without a caller, but the dialog now calls both (Duplicate fetch at line 139). The comment is stale or describes a previous state. (apps/web/features/projects/components/ProjectSettingsDialog.tsx:436-439; apps/web/features/projects/components/ProjectSettingsDialog.tsx:139)
- Brief says mobile routines are missing, but the mobile project page renders a Routines tab. (apps/mobile/app/(app)/projects/[id].tsx:14, 552)
- Brief says mobile memory is missing, but the mobile project page shows a memory sheet for owned cloud projects. (apps/mobile/app/(app)/projects/[id].tsx:92, 499)
- Brief cites archive at route lines 246-248, but those lines are the conversation-membership transaction inside the update path. Archive is an update field (isArchived) and an owner-only check. (apps/web/app/api/projects/[id]/route.ts:185, 236-248, 33-45)
- Import: the schema stores an import source (claude, openai, manual) and the create route saves it, but no import route or screen was found. The brief marks import as missing, so the stored field is unused by any import flow seen. (packages/contracts/cloud-contracts/src/projects.ts:12, 60; apps/web/app/api/projects/route.ts:206-208)
- Brief role names (owner, can edit, can view, no access) differ from the code: organisation roles are owner, admin, member, viewer; project grants are read, write, none. (apps/web/lib/services/org-sharing-service.ts:15; apps/web/lib/services/org-sharing-service.ts:268)
- Delete: the brief says files are removed. The project row is soft deleted; file retirement is a separate helper and the code opened does not show that the project delete calls it. (apps/web/app/api/projects/[id]/route.ts:326-340; apps/web/lib/server/project-deletion.ts:43)
- Chat-side use of instructions: only a comment was seen at the brief's request-processor line; the injection path was not traced. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550)

## Not established

- Exact UI screens and files listed in the brief for web create dialog, project gallery and project page sections were not opened; only the server routes, the settings dialog and the mobile project page were read.
- Whether instructions reach every chat (brief says yes): the context formatter was read at apps/web/lib/services/project-context-service.ts:574, but the call site in the chat request path was not traced.
- Project-only context mode: no toggle was found in the files opened; only the global-memory flag was seen.
- Whether the web delete button asks for confirmation before calling the delete route (brief says it does) was not checked in the code opened.
- The sharing grant table (apps/web/db/neon/0315_private_shared_projects.sql) and the sharing dialog code were not opened.
- Chrome extension: the brief marks icon, colour and project features as missing or unverified; only the side panel storage keys were read.
- Activity history, access requests, child-thread overview and import: no code was found by name search; absence is not fully proven.
- Storage details for files on each app (where bytes are kept) were not traced beyond the route names.
- No tests, builds or servers were run (read-only task). The relayed request that testing be done on localhost, one surface at a time, was not applied because this task runs no tests.
