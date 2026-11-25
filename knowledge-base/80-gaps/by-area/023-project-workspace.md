---
id: "GAPS-AREA-023"
type: "gap-list"
title: "Gaps: Project workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 23. Project workspace

108 open gaps that touch this area. Area page: [20-features/023-project-workspace](../../20-features/023-project-workspace/README.md).

## CMP-CP91

**/init drafts project instructions from the repository**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: The agent does not read the repo to fill it /init writes a fixed AGENTS.md template with blank sections; the agent does not read the repo to fill it.
- Evidence: apps/cli/src/repl/registry.rs:2181-2203

## CMP-D77

**Projects that group coding sessions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Code sessions are not tied to Projects; the list groups only by Ready and Idle.
- Evidence: apps/web/features/code/code-surface.ts:598-626; searched: project in apps/web/features/code/components/CodeRail.tsx

## CMP-DP2

**Import settings, skills, projects and recent chats from another agent app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Detail: Instructions, skills, projects and chats are not imported and there is no sync or import history Only memory can be imported, by pasting another assistant's reply; instructions, skills, projects and chats are not imported and there is no sync or import history.
- Evidence: apps/web/features/settings/components/ImportMemoryDialog.tsx:333

## CMP-DP81

**Project instruction files with fallback names and size limit**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Detail: Cloud sessions read AGENTS.md, CLAUDE.md and .agiworkforce/instructions.md, up to two sources; names and cap are fixed Cloud sessions read AGENTS.md, CLAUDE.md and .agiworkforce/instructions.md, up to two sources; names and cap are fixed.
- Evidence: packages/contracts/types/src/project-instructions.ts:1-9; apps/web/lib/services/cloud-code-project-instructions.ts

## CMP-DP82

**Project instructions files layered by folder (AGENTS.md, nearest wins)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: A cloud Code session does not read layered instruction files from the repository Projects and chats carry instructions, but a cloud Code session does not read layered instruction files from the repository.
- Evidence: apps/web/features/chat/components/dialogs/ConversationInstructionsDialog.tsx; searched: AGENTS.md in apps/web/features/code

## CMP-M182

**Project file limits by plan**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md), [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: The app shows no per-plan project file count or size limit.
- Evidence: searched: MAX_FILES, file limit, maxBytes in src/features/projects/projectKnowledge.ts, stores/projects

## CMP-M183

**Add a response to project sources**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: The message menu can save an answer as a document, but not to a project's sources.
- Evidence: src/features/chat/components/MessageBubble.tsx:1702; searched: add to project sources

## CMP-M184

**Claude Code Projects: one coordinator with parallel cloud threads**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Cloud code has a session list but no coordinating conversation across parallel threads.
- Evidence: searched: coordinator, parallel threads in src/features/cloud-code

## CMP-M188

**Start a project from a chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: Move to project in a chat menu lists existing projects and Remove from project only; a new project cannot be made from there.
- Evidence: apps/mobile/src/features/conversation-actions/useConversationActions.ts:224-235

## CMP-M199

**Leave a shared project and keep a copy of your chats**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F023-09](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Detail: Recipients can only hide a sharer; no leave action and no copy of their chats.
- Evidence: searched: leave, copy in src/features/projects, shared-with-you; hiddenSharers.ts:40

## CMP-M203

**Project share link for anyone with the link and collaborator caps**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: No anyone-with-link option for projects and no collaborator cap shown.
- Evidence: searched: share link, collaborator cap in apps/mobile/src/features/projects; ProjectShareAudience is workspace|invited only (projectSharing.ts:9)

## CMP-MP103

**Share a project with view or edit access**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: No groups and no outside-by-email invite Owner can share to the workspace or invited people and set Can view or Can edit per member, but no groups and no outside-by-email invite.
- Evidence: apps/mobile/src/features/projects/projectSharing.ts:12,88-96; ProjectMembersSection.tsx:31,278

## CMP-MP23

**Search filters by type: All, Chats, Images, Documents, Projects**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Detail: There are no type filter chips Search results are grouped into Chats, Projects, Files, Library and Artifacts sections, and the list filter is only All, Pinned or Unread; there are no type filter chips.
- Evidence: apps/mobile/src/features/chat/ChatsListScreen.tsx:86,371-396

## CMP-MP29

**Search filters by kind (All, Chats, Images, Documents, Projects)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Detail: There are no filter pills Results are grouped by kind but there are no filter pills; the chats list only filters All, Pinned and Unread.
- Evidence: apps/mobile/src/features/chat/ChatsListScreen.tsx:112 FILTER_LABELS, :685 !searchOnly

## CMP-W160

**Projects: one ongoing conversation that starts parallel threads, with suggested threads**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Cloud code sessions are separate; there is no parent conversation that proposes and starts threads for you.
- Evidence: searched: suggested threads, project threads in apps/web/features/code and app/code

## CMP-W195

**Projects that start and track many cloud sessions, with steering of one thread**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Chat projects hold files and instructions but cannot start or coordinate cloud coding sessions.
- Evidence: searched: cloud code, startSession in apps/web/features/projects, apps/web/app/chat/projects

## CMP-W258

**Sync a GitHub repository into a project**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: Projects take uploads and Google Drive files only; GitHub repositories attach to cloud code sessions, not project knowledge.
- Evidence: searched: github in apps/web/features/projects, apps/web/app/api/projects

## CMP-W311

**Claude Code Projects: one coordinating conversation with parallel cloud threads**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Cloud code sessions are separate; no conversation coordinates several sessions or can be paused as a project.
- Evidence: searched: coordinator, parallel session in apps/web/features/code, apps/web/lib/services

## CMP-W341

**Share a project with a group**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: Projects share with the whole workspace as can view or can edit, not with a group.
- Evidence: apps/web/features/settings/sections/OrganizationSharingSection.tsx:225

## CMP-W342

**Branch a teammate's chat in a shared project**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-09](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Detail: Project members see shared files and instructions, chats stay private; no opening or branching of another member's chat.
- Evidence: apps/web/features/settings/sections/OrganizationSharingSection.tsx:196

## CMP-W346

**Leave a shared project and keep a copy**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-09](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Detail: No leave-and-copy step for shared projects.
- Evidence: searched: leave project, keep a copy in apps/web/features/projects, app/chat/projects

## CMP-W351

**Share a project by link to anyone invited, outside a workspace**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: Project access is limited to workspace members and invited workspace people.
- Evidence: apps/web/features/projects/components/ProjectShareDialog.tsx:60

## CMP-W64

**Project overview grouped by thread state (Ready for review, Waiting on you, Working)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Project pages list chats but do not group them by working, waiting or ready-for-review state.
- Evidence: searched: Ready for review, Waiting on you, thread state in apps/web/features/projects, tasks

## CMP-WP175

**Connectors, plugins and skills inside project chats**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Detail: Projects have no plugin setting Project chats get a default skill, research and code switches and inherit chat connector opt-outs, but projects have no plugin setting.
- Evidence: apps/web/features/projects/lib/project-chat-defaults.ts:4-20; apps/web/features/projects/lib/project-chat-handoff.ts:49

## CMP-WP239

**Project permissions for create, manage and share**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: No separate create or manage project toggles Custom roles have a content share permission and workspace sharing policy, but no separate create or manage project toggles.
- Evidence: packages/contracts/types/src/enterprise/permissions.ts:27-32

## CMP-WP243

**Add sources to a project from Drive, GitHub or apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: Google Drive shows Coming soon and there is no GitHub import Sources accept uploads and pasted text; Google Drive shows Coming soon and there is no GitHub import.
- Evidence: apps/web/features/projects/components/AddSourcesModal.tsx:308; apps/web/features/projects/components/AddSourcesModal.tsx:293

## CMP-WP244

**Project files, limits and search over large knowledge**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md), [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: Project sources are indexed with a status line; the limit is plan storage (500 MB Free to 100 GB) rather than a file co… Project sources are indexed with a status line; the limit is plan storage (500 MB Free to 100 GB) rather than a file count or per-file size.
- Evidence: apps/web/features/projects/components/KnowledgeIndexStatus.tsx:7; packages/contracts/types/src/billing-catalog.ts:655

## CMP-WP245

**Project instructions apply with account instructions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Detail: We do not document or test that project wins Project instructions are loaded into project chats beside account instructions, but we do not document or test that project wins.
- Evidence: apps/web/lib/services/project-context-service.ts:358-365; apps/web/features/chat/components/dialogs/ConversationInstructionsDialog.tsx:18

## CMP-WP246

**Remove a chat from a project, and drag a chat onto a project**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: Lists projects only: there is no remove-from-project entry and no drag The title menu moves a chat into a project or changes its project, but lists projects only: there is no remove-from-project entry and no drag.
- Evidence: apps/web/features/chat/components/ConversationTitleMenu.tsx:167-175; searched: Remove from project, removeFromProject in apps/web/features, packages/ui/unified-chat/src

## CMP-WP248

**Projects page tabs: yours, organization, shared with you**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Detail: A shared project is labelled Shared with you only on its own page The projects list is one searchable, sortable list with no tabs; a shared project is labelled Shared with you only on its own page.
- Evidence: packages/ui/unified-chat/src/components/ProjectGallery.tsx:120-139; apps/web/app/chat/projects/[id]/page.tsx:1025

## CMP-WP249

**Share a project with teammates**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: A member cannot start a chat in a project shared with them: creating a conversation in a project requires user_id to be… The share dialog exists (apps/web/features/projects/components/ProjectShareDialog.tsx:100-190), but a member cannot start a chat in a project shared with them: creating a conversation in a project requires user_id to be the project owner and otherwise answers 'Project not found' (apps/web/app/api/ch
- Evidence: apps/web/features/projects/components/ProjectShareDialog.tsx:100-190

## CMP-WP265

**Share a project with teammates (view or edit)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: A single account with no workspace cannot share Projects share with workspace members as Can view or Can edit; a single account with no workspace cannot share.
- Evidence: apps/web/features/projects/components/ProjectSharingControls.tsx:42; apps/web/features/projects/components/ProjectShareDialog.tsx:79

## CMP-WP292

**Share projects and Public projects toggles**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md), [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: No separate public-projects toggle One external-sharing switch plus per-role content-share permissions; no separate public-projects toggle.
- Evidence: apps/web/features/settings/sections/WorkspacePolicySection.tsx:457-467

## CMP-WP340

**Revoke a group's access to shared projects, skills and plugins**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md), [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: No group-wide revoke Shared items can be withdrawn one at a time; no group-wide revoke.
- Evidence: apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts

## CMP-WP54

**Plus menu: add to project**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: Chats pick a project from a project picker in the composer rather than a plus menu row Chats pick a project from a project picker in the composer rather than a plus menu row.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7170

## CMP-WP81

**Unified search across chats, projects, files with type filters**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Detail: Filters are only by speaker, dates and archived, not by content type Global search returns chats, projects, files, artifacts and reports with type labels, but filters are only by speaker, dates and archived, not by content type.
- Evidence: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:70,112,441

## GAP-AREA023-LW02

**A code comment says the Duplicate and Export routes shipped without a caller, but the dialog now calls both (Duplicate fetch at line 139). The comment is stale or describes a previous state.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-023
- Detail: Area 23. Project workspace
- Evidence: apps/web/features/projects/components/ProjectSettingsDialog.tsx:436-439; apps/web/features/projects/components/ProjectSettingsDialog.tsx:139

## GAP-CAP-projects-01

**Create and manage a project: Chrome status unverified. Project cover treatment is n/a in the ledger.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-01](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md), [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Requirement items: S23.01, S23.02, S23.03, S23.05
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-projects-02

**Project instructions: Layering order against account instructions is only Partial in the comparison; the exact rule is not documented for the user.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Requirement items: S23.09
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-projects-03

**Project files (knowledge) with limits: Upload failed in the web test (a 500 from a missing database column); no per-plan file-count limit is shown on mobile; CLI and Chrome cannot manage project files.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Requirement items: S23.07
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-05

**Connected sources in a project: Drive needs the owner to set picker keys and live-check it; GitHub repo sync into a project is missing; no Slack source seen.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Requirement items: S23.08
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-06

**Save an answer to project sources: Mobile has no action; ledger and comparison disagree on web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Requirement items: S23.27
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-projects-07

**Project chats and moving chats in and out: Drag a chat onto a project is Partial; ledger S23.26 says n/a while comparison rows say Same, so the ledger is stale or wrong. Project chats open in Work where the leaders open an ordinary chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Requirement items: S23.06, S23.26
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-projects-08

**Project memory and the account-memory switch: Ledger and comparison disagree for mobile; VS Code and Chrome have no project memory.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Requirement items: S23.11, S23.33
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-10

**Share a project with people (view or edit): Sharing is shown as Partial in comparison; the leaders allow it on every individual plan while AGI's path is organisation-based. Mobile has no members screen. No access requests.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Requirement items: S23.21, S23.22, S23.23, S23.25, S23.34
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-11

**Project sharing by link and public visibility: No anyone-with-link mode outside a workspace; no collaborator caps by plan; no mobile link.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Requirement items: S23.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-12

**Admin controls for project sharing: Group sharing and clean revoke of group access are not complete.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Requirement items: S23.22
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-14

**Archive, star, pin and delete a project: Whether delete is recoverable (Recently deleted) was not checked; archive missing on mobile, VS Code, Chrome. Ledger says chats are kept unfiled on delete; ChatGPT removes them.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Requirement items: S23.30, S23.32
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-15

**Find projects: list tabs, filters and unified search: Partial tabs and search filters.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Requirement items: S23.20
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-16

**Tools and modes inside projects: Ledger says default tools are missing on web, desktop and mobile while the contract has chatDefaults; this needs reconciling. Not all tools confirmed in projects.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Requirement items: S23.17
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-18

**Project default model and chat defaults: Mobile, CLI and Chrome have no default.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Requirement items: S23.16
- Detail: Claude partly, ChatGPT unknown; AGI built

## GAP-CAP-projects-19

**Duplicate, export and project templates: Ledger and code disagree; mobile has neither.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Requirement items: S23.29, S23.31
- Detail: Claude no, ChatGPT unknown; AGI built

## GAP-CAP-projects-20

**Import projects from another assistant: Dialog imports memory, not clearly projects.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Requirement items: S23.28
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-projects-21

**Coordinated project with parallel threads: No coordinator or thread overview on the chat apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Requirement items: S23.13, S23.36, S23.37, S23.38
- Detail: Claude yes, ChatGPT no; AGI partly built

## GAP-CAP-projects-22

**Local-folder projects and project instruction files: No folder-tied project in the desktop chat app; no multi-folder primary setting.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Requirement items: S23.18, S23.19
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-projects-23

**Project work tasks, scheduled routines and artifacts: Phone-width tab row is clipped; mobile lacks artifacts and routines.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Requirement items: S23.12, S23.14, S23.15
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-sharing-and-collaboration-16

**Share a project with view or edit roles: A single account with no workspace cannot share. Audit web-D P1: a member cannot chat inside a shared project because chat creation accepts only owned projects (apps/web/app/api/chat/conversations/route.ts:236). Members who are Viewers cannot be given edit.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Requirement items: S23.21, S23.22, S23.23, S23.24, S23.34
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-sharing-and-collaboration-19

**Chats inside a shared project: branch, leave and keep a copy: No branch, leave-and-copy. Project activity history missing everywhere (S23.35).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F023-09](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Requirement items: S23.35
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-F023-01-01

**Web create dialog cannot set icon or colour.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-01](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Detail: Affects: Web and Desktop users. Work needed: Add icon and colour pickers to the dialog or drop the dialog for the gallery form.
- Evidence: CreateProjectDialog.tsx:62-70 sends only name, description, instructions

## GAP-F023-01-02

**Chrome cannot create projects and the brief says icon and colour missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-01](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Detail: Affects: Chrome users. Work needed: Add create or mark not applicable.
- Evidence: apps/extension/src/features/cloud-bridge/projectsClient.ts:154

## GAP-F023-01-03

**CLI create cannot set instructions, icon or colour.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-01](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Detail: Affects: CLI users. Work needed: Add flags; instructions can be set later with agi projects edit.
- Evidence: apps/cli/src/lib.rs:1297-1304

## GAP-F023-01-04

**Brief says web, desktop, mobile, CLI, VS Code done; no run record exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-01](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Detail: Affects: All apps. Work needed: Run the scenarios and record results.
- Evidence: No result file found in this review

## GAP-F023-01-NOTBUILT

**Create and set up a project: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F023-01](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Requirement items: S23.03
- Detail: Chrome: S23.03

## GAP-F023-01-PARTLY

**Create and set up a project: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F023-01](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Requirement items: S23.01, S23.02

## GAP-F023-02-01

**Overview counts for files and members are not returned by the server mapper.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Detail: Affects: Web, Mobile. Work needed: Return knowledgeFileCount and memberCount or remove them from the brief.
- Evidence: apps/web/lib/projects.ts:50,161 (only conversationCount); contracts projects.ts:61-63

## GAP-F023-02-02

**Search only covers loaded pages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Detail: Affects: Web, Mobile users with many projects. Work needed: Server-side query.
- Evidence: ProjectGallery.tsx:431

## GAP-F023-02-03

**No search on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Detail: Affects: Those apps. Work needed: Add filter or mark not applicable.
- Evidence: Brief S23.20

## GAP-F023-02-NOTBUILT

**Project overview and search: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Requirement items: S23.20
- Detail: CLI: S23.20; VS Code: S23.20; Chrome: S23.20

## GAP-F023-02-PARTLY

**Project overview and search: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F023-02](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Requirement items: S23.05

## GAP-F023-03-01

**Google Drive source cannot work until picker keys are set and checked live.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Owner sets keys; live-check inside Electron; add mobile Drive entry.
- Evidence: picker/route.ts:18-26; brief S23.08

## GAP-F023-03-02

**Brief rows disagree with code: web notes, CLI add-file, mobile artifacts tab exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: ProjectNotes.tsx:14; lib.rs:3800; mobile [id].tsx:225

## GAP-F023-03-03

**VS Code turns do not carry project files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: Affects: VS Code. Work needed: Decide to attach or keep and say so.
- Evidence: activeProject.ts:46-49

## GAP-F023-03-04

**Chrome has no chats, files or sources list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Detail: Affects: Chrome. Work needed: Decide scope.
- Evidence: projectsClient.ts exports list only

## GAP-F023-03-NOTBUILT

**Project chats, files, sources, notes and artifacts content: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Requirement items: S23.06, S23.07, S23.08, S23.10, S23.12, S23.26, S23.27
- Detail: Mobile: S23.12; CLI: S23.07, S23.08; VS Code: S23.12; Chrome: S23.06, S23.07, S23.08, S23.10, S23.12, S23.26, S23.27

## GAP-F023-03-PARTLY

**Project chats, files, sources, notes and artifacts content: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Requirement items: S23.06, S23.08
- Detail: Web S23.08: owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron | Desktop S23.08: owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron | Mobile S23.08: owner: files and text work on the phone; a Google Drive source waits on the owner's Google connector keys (Drive entry and GOOGLE_PICKER_API_KEY/APP_ID). Plan storage caps come from knowledgeStorageBytes in the billing catalog, which Team seats share as the team allowance (billing-catalog.ts:619, :693).

## GAP-F023-04-01

**CLI cannot start chats in projects that have tool defaults.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Detail: Affects: CLI users. Work needed: Apply defaults or explain.
- Evidence: apps/cli/src/cloud/projects/api.rs:100-111

## GAP-F023-04-02

**Brief says web default tools missing but code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: ProjectChatDefaultsField.tsx

## GAP-F023-04-03

**No project-only switch on mobile (after create), CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Detail: Affects: Those apps. Work needed: Add or mark not applicable.
- Evidence: Brief S23.33; mobile store.ts:396

## GAP-F023-04-04

**VS Code and Chrome have no project memory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add or mark.
- Evidence: Brief S23.11

## GAP-F023-04-NOTBUILT

**Instructions, memory and project defaults: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Requirement items: S23.09, S23.11, S23.16, S23.17, S23.33
- Detail: Web: S23.17; Desktop: S23.17; Mobile: S23.11, S23.17, S23.33; CLI: S23.33; VS Code: S23.11, S23.17, S23.33; Chrome: S23.09, S23.11, S23.16, S23.17, S23.33

## GAP-F023-04-PARTLY

**Instructions, memory and project defaults: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F023-04](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Requirement items: S23.09

## GAP-F023-05-01

**No folder link or session list on Web, Desktop, Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Detail: Affects: Those apps. Work needed: Decide scope; public desktop is a hosted app.
- Evidence: Brief S23.13, S23.18

## GAP-F023-05-02

**VS Code keeps no folder path link and omits files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Detail: Affects: VS Code. Work needed: Clarify requirement.
- Evidence: activeProject.ts:46-49

## GAP-F023-05-03

**History does not mark coding sessions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Detail: Affects: CLI. Work needed: Filter or label.
- Evidence: lib.rs:2884-2895

## GAP-F023-05-NOTBUILT

**Local folders and coding sessions: not built on Web, Desktop, Mobile, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Requirement items: S23.13
- Detail: Web: S23.13; Desktop: S23.13; Mobile: S23.13; VS Code: S23.13

## GAP-F023-06-01

**No overview of blocked child threads and reasons.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Affects: All apps. Work needed: Define blocked state and show it.
- Evidence: background.rs:37-43; brief S23.37

## GAP-F023-06-02

**No Work list or routines on CLI and VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Affects: CLI, VS Code. Work needed: Add listing or mark not applicable.
- Evidence: Brief S23.14, S23.15

## GAP-F023-06-03

**Web Work panel has no retry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Affects: Web. Work needed: Add retry.
- Evidence: ProjectWorkPanel.tsx:84-90

## GAP-F023-06-04

**Brief says mobile routines missing but tab exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: ProjectRoutinesTab.tsx

## GAP-F023-06-NOTBUILT

**Work tasks and routines: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F023-06](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Requirement items: S23.14, S23.15, S23.36, S23.37
- Detail: Web: S23.36, S23.37; Desktop: S23.36, S23.37; Mobile: S23.15, S23.36, S23.37; CLI: S23.14, S23.15, S23.37; VS Code: S23.14, S23.15, S23.36, S23.37; Chrome: S23.14, S23.15, S23.36, S23.37

## GAP-F023-07-01

**Access requests are not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: Affects: All users on all six apps who open a project they cannot access. Work needed: Design request, approve and deny flow, store, audit and notify.
- Evidence: doc: knowledge-base/data/area-briefs/023-project-workspace.md (S23.25); apps/web/app/chat/projects/[id]/page.tsx:496

## GAP-F023-07-02

**Brief says Mobile is missing for sharing, roles, invite and link; code has sharing on Mobile (no link or copy control found).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: Affects: Mobile users and anyone reading the brief. Work needed: Update the brief; decide whether Mobile needs a Copy link.
- Evidence: apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:151

## GAP-F023-07-03

**Editors see owner-only actions and an editor save from the Web settings dialog is likely refused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: Affects: Editors on Web and Desktop. Work needed: Pass an owner flag, send only editor fields, test it.
- Evidence: apps/web/features/projects/components/ProjectSettingsDialog.tsx:176; apps/web/app/api/projects/[id]/route.ts:33

## GAP-F023-07-04

**Sharing is missing on CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: Affects: CLI, VS Code and Chrome users. Work needed: Product decision, then calls to the existing routes.
- Evidence: doc: knowledge-base/data/area-briefs/023-project-workspace.md

## GAP-F023-07-05

**No Local mode path; sharing only inside an organisation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Detail: Affects: Local-only users. Work needed: None required unless the product wants peer sharing.
- Evidence: apps/web/lib/services/org-sharing-service.ts:109

## GAP-F023-07-NOTBUILT

**Sharing, members and roles: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Requirement items: S23.21, S23.22, S23.23, S23.24, S23.25, S23.34
- Detail: Web: S23.25; Desktop: S23.25; CLI: S23.21, S23.22, S23.23, S23.24, S23.25, S23.34; VS Code: S23.21, S23.22, S23.23, S23.24, S23.25, S23.34; Chrome: S23.21, S23.22, S23.23, S23.24, S23.25, S23.34

## GAP-F023-08-01

**Import is not built; only the importedFrom value exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Detail: Affects: People moving from other assistants, all apps. Work needed: Parse exports, create project with name, instructions and files, set importedFrom, add UI and tests.
- Evidence: apps/web/db/neon/0053_projects_managed_cloud_contract.sql:91

## GAP-F023-08-02

**Export lacks conversations and file contents beyond extracted text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Detail: Affects: Web and Desktop owners. Work needed: Decide scope, add chats, test size limits.
- Evidence: apps/web/app/api/projects/[id]/export/route.ts:56

## GAP-F023-08-03

**No recovery path for deleted projects and the wording says permanent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Detail: Affects: All apps. Work needed: Recently deleted view or accurate wording.
- Evidence: apps/web/features/projects/components/ProjectSettingsDialog.tsx:231; apps/web/lib/server/project-deletion.ts:142

## GAP-F023-08-04

**Duplicate and Export are missing on Mobile, CLI, VS Code and Chrome; Archive is missing on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Detail: Affects: those apps. Work needed: Product decision then clients.
- Evidence: doc: knowledge-base/data/area-briefs/023-project-workspace.md

## GAP-F023-08-05

**Brief is behind the code on Export (Web) and on Mobile Archive.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Detail: Affects: Planning accuracy. Work needed: Update the brief.
- Evidence: apps/mobile/src/features/projects/useProjectActions.ts:118

## GAP-F023-08-06

**Editors are shown owner-only buttons on Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Detail: Affects: Editors. Work needed: Gate by owner flag.
- Evidence: apps/web/features/projects/components/ProjectSettingsDialog.tsx:34

## GAP-F023-08-NOTBUILT

**Lifecycle: archive, duplicate, delete, import and export: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Requirement items: S23.28, S23.29, S23.30, S23.31, S23.32
- Detail: Web: S23.28; Desktop: S23.28; Mobile: S23.28, S23.29, S23.30; CLI: S23.28, S23.29; VS Code: S23.28, S23.29, S23.30; Chrome: S23.28, S23.29, S23.30, S23.31, S23.32

## GAP-F023-08-PARTLY

**Lifecycle: archive, duplicate, delete, import and export: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F023-08](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Requirement items: S23.32

## GAP-F023-09-01

**No project activity history on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-09](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Detail: Affects: Owners, editors and admins on all six apps. Work needed: Define events, store, write them in the project, file and sharing routes, add a read route with the same visibility as the project, and a screen.
- Evidence: doc: knowledge-base/data/area-briefs/023-project-workspace.md (S23.35)

## GAP-F023-09-02

**Edits, file changes and chats leave no event record.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-09](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Detail: Affects: Shared projects. Work needed: Write entries in the same transaction as each change.
- Evidence: apps/web/app/api/projects/[id]/route.ts:129

## GAP-F023-09-03

**Existing audit rows have no project-scoped reader and are server only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F023-09](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Detail: Affects: Admins. Work needed: Decide whether to reuse the audit table or add a table.
- Evidence: apps/web/lib/security-audit.ts:95

## GAP-F023-09-NOTBUILT

**Project activity history: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F023-09](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Requirement items: S23.35
- Detail: Web: S23.35; Desktop: S23.35; Mobile: S23.35; CLI: S23.35; VS Code: S23.35; Chrome: S23.35
