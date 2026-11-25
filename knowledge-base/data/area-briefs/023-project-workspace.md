# Area 23. Project workspace

38 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S23.01 Project creation.
- Should: A signed-in user can create a named project that is saved to their account and opens as its own workspace.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/chat/projects/page.tsx:397; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:70; apps/web/app/api/projects/route.ts:133; apps/web/app/api/projects/route.ts:199; apps/mobile/app/(app)/(tabs)/projects.tsx:443; apps/mobile/app/(app)/(tabs)/projects.tsx:186; apps/mobile/src/features/projects/store.ts:227; apps/web/app/api/projects/sync/route.ts:91

## S23.02 Project name and description.
- Should: A project has a name and an optional description that the user can set at creation and edit later.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:189; apps/web/features/projects/components/ProjectSettingsDialog.tsx:207; apps/web/features/projects/components/ProjectSettingsDialog.tsx:112; apps/web/app/api/projects/[id]/route.ts:167; apps/mobile/app/(app)/(tabs)/projects.tsx:232; apps/mobile/app/(app)/(tabs)/projects.tsx:548; apps/mobile/src/features/projects/store.ts:270; apps/cli/src/lib.rs:2168

## S23.03 Project icon and color.
- Should: The user can choose a project's icon and colour, and the choice is shown wherever the project appears.
- Status: web done, desktop done, mobile done, chrome missing
- Code: packages/ui/unified-chat/src/components/ProjectGallery.tsx:291; packages/ui/unified-chat/src/components/ProjectGallery.tsx:319; packages/ui/unified-chat/src/components/ProjectCard.tsx:188; apps/mobile/src/features/projects/components/CloudProjectOverview.tsx:162; apps/mobile/src/features/projects/components/ProjectCard.tsx:28; apps/mobile/src/features/projects/service.ts:66

## S23.04 Project cover or identity treatment.
- Should: A project carries a visual identity (cover image or tinted icon badge) that distinguishes it in lists and on its page.
- Status: not applicable anywhere

## S23.05 Project overview.
- Should: Opening a project shows an overview: its name, description, counts and its main sections (chats, files, instructions).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/chat/projects/[id]/page.tsx:995; apps/web/app/chat/projects/[id]/page.tsx:43; apps/web/app/chat/projects/[id]/page.tsx:303; apps/web/app/api/projects/[id]/route.ts:105; apps/mobile/src/features/projects/components/CloudProjectOverview.tsx:50; apps/mobile/src/features/projects/components/CloudProjectOverview.tsx:114; apps/cli/src/lib.rs:2101; apps/cli/src/cloud/mod.rs:287

## S23.06 Project conversations.
- Should: A project lists its conversations, opens them, and starts new chats that are filed under the project.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/chat/projects/[id]/page.tsx:1134; apps/web/app/chat/projects/[id]/page.tsx:1152; apps/web/app/chat/projects/[id]/page.tsx:234; apps/web/lib/hooks/useConversations.ts:762; apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:94; apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:67; apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:86; apps/cli/src/lib.rs:1893

## S23.07 Project files.
- Should: Users can upload files to a project, see them listed, preview/download and remove them, and project chats can use them.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227

## S23.08 Project sources.
- Should: A project's Sources tab lets the user add files, text or connected-service content that project chats use as reference.
- Status: web partial, desktop partial, mobile partial, cli missing, chrome missing
- Code: apps/web/app/api/connectors/google-drive/picker/route.ts:17; apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:264
- Unfinished: web: owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron | desktop: owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron | mobile: owner: files and text work on the phone; a Google Drive source waits on the owner's Google connector keys (Drive entry and GOOGLE_PICKER_API_KEY/APP

## S23.09 Project instructions.
- Should: Instructions saved on a project are applied to every chat in that project.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/projects/components/ProjectSettingsDialog.tsx:229; apps/web/features/projects/components/ProjectSettingsDialog.tsx:105; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550; apps/web/lib/services/project-context-service.ts:566; apps/mobile/app/(app)/(tabs)/projects.tsx:565; apps/mobile/stores/chat/chatExecutionStore.ts:1338; apps/mobile/services/cloudSyncEngine.ts:674; apps/cli/src/cloud/mod.rs:589

## S23.10 Project notes.
- Should: Users can keep written notes in a project that they can view, edit and that project chats can draw on.
- Status: not applicable anywhere

## S23.11 Project Memory.
- Should: A project keeps its own memories, and the user can choose whether the project also draws on account-wide memory.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/contracts/cloud-contracts/src/projects.ts:22; apps/web/features/projects/services/managed-cloud-projects.ts:29; apps/web/app/api/memory/sync/route.ts:59; apps/cli/src/cloud/memory.rs:175; apps/cli/src/cloud/mod.rs:765; apps/cli/src/agent/mod.rs:628

## S23.12 Project artifacts.
- Should: A project shows the artifacts produced in its chats, and each opens from there.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/app/chat/projects/[id]/page.tsx:1238; apps/web/features/projects/components/ProjectArtifactsPanel.tsx:28; apps/web/features/chat/hooks/use-artifact-index.ts:76; apps/cli/src/lib.rs:1024; apps/cli/src/lib.rs:1904

## S23.13 Project coding sessions.
- Should: Coding sessions can belong to a project and are listed and reopened from it.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing
- Code: apps/cli/src/lib.rs:1893

## S23.14 Project work tasks.
- Should: Autonomous work tasks can be started in a project and the project lists their state.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectWorkPanel.tsx:55; apps/mobile/app/(app)/projects/[id].tsx:359; apps/mobile/src/features/projects/components/ProjectWorkTab.tsx:41; apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:167

## S23.15 Project routines.
- Should: Scheduled routines can be created inside a project and are listed on the project.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/chat/projects/[id]/page.tsx:1246; apps/web/features/schedules/components/SchedulesPage.tsx:326; apps/web/features/schedules/components/SchedulesPage.tsx:218

## S23.16 Default model/profile.
- Should: A project can set a default model (or profile) that new chats in it start with.
- Status: web done, desktop done, vscode done
- Code: apps/web/features/projects/components/ProjectDefaultModelField.tsx:53; apps/web/features/chat/pages/WebChatPage.tsx:1703; apps/extension-vscode/src/features/projects/projectActions.ts:156; apps/extension-vscode/src/features/projects/projectActions.ts:389

## S23.17 Default tools and Skills.
- Should: A project can set which tools and Skills are on by default for chats in it.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/skills.rs:110; apps/cli/src/skills.rs:307; apps/cli/src/lib.rs:4920

## S23.18 Local-folder association.
- Should: A project can be associated with a local folder so work in that folder uses the project.
- Status: cli done, vscode done
- Code: apps/cli/src/lib.rs:994; apps/cli/src/project_registry.rs:218; apps/cli/src/agent/mod.rs:1924; apps/extension-vscode/src/features/projects/activeProject.ts:30; apps/extension-vscode/src/core/commandSetup.ts:2265

## S23.19 Repository association.
- Should: A project can be associated with a code repository so coding work and context follow that repository.
- Status: not applicable anywhere

## S23.20 Project search.
- Should: Users can search their projects by name or description.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/ProjectGallery.tsx:229; packages/ui/unified-chat/src/components/ProjectGallery.tsx:116; apps/web/app/chat/projects/page.tsx:393; apps/mobile/app/(app)/(tabs)/projects.tsx:449; apps/mobile/app/(app)/(tabs)/projects.tsx:272

## S23.21 Project members.
- Should: A project shows who can access it (owner and members) and a member can see a project is shared with them.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectSharingControls.tsx:157; apps/web/features/projects/components/ProjectShareDialog.tsx:87; apps/web/app/api/settings/organization/shared/route.ts:89

## S23.22 Member roles.
- Should: Project members hold distinct roles (owner, can edit, can view, no access) that the server enforces.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/OrganizationSharingSection.tsx:317; apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:141; apps/web/lib/services/org-sharing-service.ts:238; apps/web/app/api/projects/[id]/route.ts:275; apps/web/lib/services/org-sharing-service.ts:146

## S23.23 Invite and remove members.
- Should: An owner or manager can add a person to a specific project and remove them from it.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/db/neon/0315_private_shared_projects.sql:41; apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:79; apps/web/features/projects/components/ProjectShareDialog.tsx:120; apps/web/lib/services/org-sharing-service.ts:155

## S23.24 Shared Project links.
- Should: A user can get a link to a project that opens it for the people it is shared with.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectShareDialog.tsx:101; apps/web/features/projects/components/ProjectShareDialog.tsx:161; apps/web/app/chat/projects/[id]/page.tsx:627; apps/web/app/chat/projects/page.tsx:540

## S23.25 Project-level access requests.
- Should: A person who opens a project they cannot access can request access, and an owner/manager can approve or deny it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S23.26 Move or copy conversations.
- Should: A user can move a conversation into (or out of) a project, or copy it into one.
- Status: not applicable anywhere

## S23.27 Add an answer to Project knowledge.
- Should: From a chat, a user can add an assistant answer (or its artifact) to a project's knowledge in one action.
- Status: not applicable anywhere

## S23.28 Import an existing Project.
- Should: A user can import an existing project (e.g. from another assistant or an export file) and get its name, instructions and files.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S23.29 Duplicate a Project.
- Should: A project owner can duplicate a project, getting a copy with its settings, instructions and files.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/projects/[id]/duplicate/route.ts:71

## S23.30 Archive and restore.
- Should: A project can be archived out of the active list and restored later with its contents intact.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/app/api/projects/[id]/route.ts:246; apps/web/app/api/projects/[id]/route.ts:248

## S23.31 Export.
- Should: A project owner can export a project (settings, instructions, files and conversations) as a downloadable file.
- Status: not applicable anywhere

## S23.32 Delete.
- Should: A project owner can delete a project after confirming; its files are removed and its chats are kept (unfiled).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/projects/components/ProjectSettingsDialog.tsx:143; packages/ui/unified-chat/src/components/ProjectCard.tsx:291; apps/web/app/chat/projects/page.tsx:488; apps/web/app/chat/projects/page.tsx:145; apps/web/app/api/projects/[id]/route.ts:326; apps/web/app/api/projects/sync/route.ts:212; apps/web/lib/server/project-deletion.ts:23; apps/cli/src/lib.rs:1779

## S23.33 Project-only context mode.
- Should: A user can switch a project to use only its own context (its memories, chats and files), excluding account-wide memory and other chats.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/contracts/cloud-contracts/src/projects.ts:22; apps/web/features/projects/services/managed-cloud-projects.ts:29

## S23.34 Shared versus personal-context explanation.
- Should: Where a project is shared, the product explains which context is shared with members (instructions, files) and which stays personal (chats, memories).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/chat/projects/[id]/page.tsx:995

## S23.35 Project activity history.
- Should: A project shows a history of what changed in it (files added/removed, settings and instruction edits, sharing changes, chats) with who and when.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S23.36 Coordinating conversation for parallel work, where offered.
- Should: Where offered, one coordinating conversation can split work into parallel child threads and bring their results back together.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/background.rs:251; apps/cli/src/background.rs:318; apps/cli/src/claude_parity.rs:140

## S23.37 Overview of child threads and blocked work.
- Should: A project (or coordinating thread) shows an overview of its child threads and which ones are blocked and why.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S23.38 Thread-specific steering without changing unrelated work.
- Should: A user can steer one child thread (redirect, answer, pause or stop it) without changing the other threads' work.
- Status: not applicable anywhere
