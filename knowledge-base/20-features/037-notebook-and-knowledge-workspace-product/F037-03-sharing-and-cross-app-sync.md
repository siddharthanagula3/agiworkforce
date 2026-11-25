---
id: "F037-03"
type: "feature"
title: "Sharing and cross-app sync"
aliases: ["Share project", "Project sharing", "Share dialog", "Shared with you", "Members section", "Cross-app notebook synchronization (S37.38)", "Notebook sharing (S37.34)", "Project sync"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.34", "S37.38"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "plan:team", "api:PUT /api/settings/organization/shared/projects/{projectId}", "api:GET /api/projects/sync", "table:organization_shared_projects", "table:organization_project_access", "table:user_projects", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "F037-01", "F037-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-03 Sharing and cross-app sync

A project owner in a team workspace can share a project with everyone in the workspace or only invited people, and give each person view or edit access. Members see instructions and files, but chats stay private. Separately, account projects sync across web, mobile and CLI through the same account routes.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.34](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3734), [S37.38](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3738).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets an owner or sharing manager share a project into a team workspace with an audience ('Everyone in the workspace can view' or 'Only people you invite') and per-member access (Can view, Can edit, No access). Also keeps one account's projects the same on every signed-in app (apps/web/features/projects/components/ProjectShareDialog.tsx:56-143; apps/web/features/projects/components/ProjectSharingControls.tsx:40-44, 105-106).

**Why it exists.** Teams need shared source material and rules without sharing private chats; individuals need the same workspace on each device. [inferred]

**Who uses it.** Team owners and admins, members with the content.share permission, and every person who uses more than one AGI app.

**Problems it solves**

- Sharing documents and instructions without copying them.
- Controlling who can only read and who can change sources.
- Seeing the same project on web, phone and terminal.

**Use cases**

- An owner shares 'Launch' with the whole workspace as view-only.
- An owner invites one colleague with Can edit so they can add sources.
- A member opens 'Shared with you' on the phone and reads the files.
- A user creates a project on the CLI and finds it on the web.

## 2. User experience

**Where to find it**

- Web: project card or project page menu item 'Share' opens the dialog 'Share <project>' with description 'Choose who can open this project and what they can do.' (ProjectShareDialog.tsx:150-153; apps/web/app/chat/projects/[id]/page.tsx:653, 1358).
- Desktop: same hosted web page (doc: AGENTS.md section 5).
- Mobile: Project settings screen, section for who can access (ProjectMembersSection mounted at ProjectSettingsScreen.tsx:193); Projects tab filter 'Shared with you' and screen 'Shared with you' (SharedWithYouScreen.tsx:267, 281); read-only 'Shared project' screen (SharedProjectScreen.tsx:99-171).
- CLI, VS Code, Chrome: no sharing screen found.

**Before you start**

- A team workspace (the dialog says 'Only you can open this project. Switch to a team workspace to share it.' otherwise) (ProjectShareDialog.tsx:76-81).
- Permission sharing.manage, or content.share on a project the person owns (apps/web/lib/services/org-sharing-service.ts:91-118).
- A plan whose shared-project limit is not 0 (org-sharing-service.ts:305-312).
- Edit access can only go to members whose workspace role can edit; Viewers can only get Can view.

**Screens and controls**

- Share dialog: audience select, 'Share' button ('Sharing…' while saving), member list with an access select per person labelled 'Access for <name>', add-people picker, 'Stop sharing', 'Copy link' (ProjectShareDialog.tsx:99-141, 161-164; ProjectSharingControls.tsx:196-200).
- Note text 'Instructions and files are shared. Each person's chats stay private.' (ProjectShareDialog.tsx:96-98).
- Access labels: Can view, Can edit, No access; viewer note 'Viewers can only get Can view. Change their role to Member to let them edit.' (ProjectSharingControls.tsx:40-48).
- Confirm dialog 'Stop sharing <project>?' with the consequence text (ProjectShareDialog.tsx:129-136).
- Mobile members section: owner row, per-member 'Change access', share buttons, alert 'Stop sharing' (ProjectMembersSection.tsx:199-284).

**Journey**

1. Owner opens Share on the project.
2. Chooses the audience and presses 'Share'.
3. Optionally adds people by name or email and picks Can edit or Can view.
4. Members open the project from their list (web) or 'Shared with you' (mobile); they see instructions and files.
5. To end it the owner presses 'Stop sharing' and confirms.

**What the person sees and gets**

- Toast 'Project link copied. It opens only for people who have access.' (ProjectShareDialog.tsx:41).
- Errors: 'Sharing could not be loaded. Try again.', 'Your workspace role does not allow changing what is shared.', 'Health cannot be shared.', shared-project limit message (ProjectShareDialog.tsx:73; org-sharing-service.ts:77-79, 361-368).
- Viewer edit refusal: 'This person's workspace role, such as Viewer, can open the project but not edit it. Change their role to Member to give them edit access.' (org-sharing-service.ts:408-414).
- Mobile: 'Could not change their access. Try again.', 'Could not share this project.' (ProjectMembersSection.tsx:167, 274).

**Settings**

- Audience: workspace or invited (ProjectSharingControls.tsx:52-54).
- Per-member access (read, write, none).
- Mobile hide and report actions for people who share with you (SharedWithYouScreen.tsx:146, 245).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: share, change audience, per-member access, stop sharing, copy link, read-only view for non-editors, editor view with content controls (ProjectShareDialog.tsx; apps/web/app/chat/projects/[id]/page.tsx:160, 1332-1338).
- Server: shareProject inserts organization_shared_projects with a quota guard, setProjectMemberAccess writes organization_project_access and refuses write for roles that cannot edit (org-sharing-service.ts:305-436).
- Server: shared projects appear in GET /api/projects with is_org_shared and a shared access of read or write (apps/web/app/api/projects/route.ts:74-114; [id]/route.ts:106-143).
- Mobile: sharing controls, shared-with-you list and read-only shared project screen exist (ProjectMembersSection.tsx; SharedWithYouSection.tsx:10-31; SharedProjectScreen.tsx).
- Sync: mobile Cloud mode pulls and pushes projects (cloudSyncEngine.ts:723, 1035-1038); CLI reads and writes through the same sync route and project routes (apps/cli/src/cloud/projects.rs:1-3; cloud/mod.rs:417-559).

**Incomplete**

- The brief lists a web and desktop 'ui' gap for sharing; its content was not identified in the code read (brief S37.34).
- Sync pull returns only projects where user_id matches the caller, so shared projects arrive on mobile and CLI through other routes, not the sync pull (apps/web/app/api/projects/sync/route.ts:44-56) [inferred].
- Mobile Local-mode projects are never synced (store.ts:421-436).

**Present but disconnected or switched off**

- Mobile sync runs only in Cloud mode and when signed in (cloudSyncEngine.ts:97-107). The brief says 'flag-off'; the only flag found, FEATURES.cloudChat, is true (apps/mobile/lib/v1FeatureFlags.ts:4), so the brief's flag was not found.
- The 'Share' item is hidden for health-space projects on the web list (page.tsx:454).

**Not available**

- CLI, VS Code and Chrome have no sharing controls; VS Code and Chrome are held to the reference product scope by owner decisions D-2026-09-28-25 and D-2026-09-28-23 (doc: docs/decisions/2026-09-27-founder-decisions.md).
- Sharing outside a team workspace (personal accounts).

## 4. Required behaviour

**Established requirements**

- The user can share a notebook with others with a chosen access level. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.34)
- A notebook and its sources and notes are available in every app the user signs into. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.38)
- A Viewer cannot be given edit access; the UI tells the owner to change their role to Member. (source: apps/web/features/projects/components/ProjectSharingControls.tsx:46-48; apps/web/lib/services/org-sharing-service.ts:408-414)
- Members see instructions and files, but each person's chats stay private. (source: apps/mobile/src/features/projects/projectSharing.ts:63-64)
- Sources can be added only by the owner or an editor. (source: apps/web/lib/server/project-knowledge-files.ts:203-233)
- For the VS Code and Chrome extensions, S37.38 is outside scope. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-23, D-2026-09-28-25))

**Acceptance criteria**

1. An owner in a team workspace shares a project as 'Only people you invite', adds one member with Can view; that member sees it and cannot edit the name.
2. Giving Can edit to a person whose workspace role is Viewer is refused with the Viewer message.
3. After 'Stop sharing', the member no longer sees the project or its files.
4. A member with Can edit can add a source on web; a member with Can view sees the Sources tab read-only.
5. A project created on web appears on mobile (Cloud mode) after sync and on the CLI list.
6. The Share dialog in a personal workspace shows the 'Switch to a team workspace' text and no share button.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A member's own chats in the shared project stay private to them [inferred from the dialog note and mobile copy].
- Sharing is meant to hold for projects only, not for each conversation [inferred from the note].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a CLI or VS Code read of 'shared with me' or state that sharing is web and mobile only.
- [proposed] Add a live check of a shared member chat with the project's instructions and files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProjectShareDialog | `apps/web/features/projects/components/ProjectShareDialog.tsx` | Web share dialog states and actions. |
| component | ProjectSharingControls | `apps/web/features/projects/components/ProjectSharingControls.tsx` | Access labels, audience select, member access list and picker. |
| hook | sharing queries | `apps/web/features/settings/hooks/use-settings-queries.ts` | useShareProjectWithOrganization and member access mutations calling /api/settings/organization/shared/projects/{id} (lines 1759-1834). |
| endpoint | /api/settings/organization/shared/projects/[projectId] | `apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts` | Share (PUT), unshare (DELETE), member access (PATCH). |
| service | org-sharing-service | `apps/web/lib/services/org-sharing-service.ts` | Rights, share, unshare, member access, shared scope, write access. |
| table | organization_shared_projects | `apps/web/lib/services/org-sharing-service.ts` | One row per shared project with default_access (insert at line 322). |
| table | organization_project_access | `apps/web/lib/services/org-sharing-service.ts` | Per-member access rows (insert at line 418). |
| service | org-entitlements | `apps/web/lib/services/org-entitlements.ts` | sharedProjectLimit from the plan (line 128). |
| endpoint | GET /api/projects (shared scope) | `apps/web/app/api/projects/route.ts` | Returns shared projects in the active team workspace. |
| screen | Web project page | `apps/web/app/chat/projects/[id]/page.tsx` | canEditProject (line 160) and the ProjectShareDialog mount (1358). |
| component | ProjectMembersSection | `apps/mobile/src/features/projects/components/ProjectMembersSection.tsx` | Mobile sharing controls inside project settings. |
| service | projectSharing | `apps/mobile/src/features/projects/projectSharing.ts` | Mobile calls to /api/settings/organization/shared and labels. |
| screen | SharedWithYouScreen / SharedProjectScreen | `apps/mobile/src/features/projects/components/SharedWithYouScreen.tsx` | What others shared with the person; read-only shared project view. |
| service | cloudSyncEngine | `apps/mobile/services/cloudSyncEngine.ts` | isManagedSyncEnabled (97) and the projects sync step (1035). |
| endpoint | GET/POST /api/projects/sync | `apps/web/app/api/projects/sync/route.ts` | Delta sync with server_version cursor. |
| service | CLI project cache | `apps/cli/src/cloud/projects.rs` | Account project list shared with web and mobile. |
| config | mobile feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | projects and cloudChat flags (lines 2, 4). |
| test | org-sharing-service tests | `apps/web/lib/services/__tests__/org-sharing-service.test.ts` | Role gates, shared list, readable and writable ids. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Owner opens Share; the dialog reads the workspace sharing overview. | device and our servers | ProjectShareDialog.tsx:56; use-settings-queries.ts:1759 |
| Owner presses Share; the app sends PUT to the shared-projects route; server checks sharing right, the plan's shared-project limit and the health-space rule, then upserts organization_shared_projects. | our servers | org-sharing-service.ts:91-118, 305-380 |
| Owner sets a member's access; server refuses write for roles that cannot edit and upserts organization_project_access. | our servers | org-sharing-service.ts:405-436 |
| Member lists projects; the server adds the project ids readable by the member in the active workspace. | our servers | apps/web/app/api/projects/route.ts:74-77, 114 |
| Member opens the project; the page sets read-only unless sharedAccess is write. | device | apps/web/app/chat/projects/[id]/page.tsx:160, 1332-1338 |
| For sync, mobile (Cloud mode, signed in) pushes dirty projects and pulls changes since a cursor; the CLI does the same through the sync route. | device and our servers | cloudSyncEngine.ts:1035-1038; apps/cli/src/cloud/projects.rs:260-300 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Share record (project, workspace, who shared, default access) | table organization_shared_projects | Server-side; clients read it through the overview and list routes | Deleted by 'Stop sharing' (org-sharing-service.ts:382-395) |
| Per-member access | table organization_project_access | Server-side | Cleared per member (org-sharing-service.ts:438-453) |
| Sync cursor and dirty marks | Mobile sync-state stores on the phone; CLI SyncState file | Cursor tracks the server_version | Reset when the account scope changes (apps/cli/src/cloud/projects.rs:207-225) |

**Models and providers.** No model or provider is called for sharing or sync. Members' chats use their own model choices; the shared part is instructions and files.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required; sharing needs membership in a team workspace (org-sharing-service.ts:120-125). |
| Permissions | requireProjectSharingRight: sharing.manage, or content.share for the owner of the project (org-sharing-service.ts:91-118). Roles: owner, admin, member, viewer (line 15). Edit grants need a role that can hold write (lines 405-415). |
| Subscription | sharedProjectLimit comes from the plan's projects limit; 0 refuses sharing and over-limit returns a conflict (org-entitlements.ts:128; org-sharing-service.ts:305-312, 361-368). |
| Limits and metering | Shared-project count limit through assert_org_resource_limit('org_shared_projects') (org-sharing-service.ts:340-343). No model metering. |
| Feature flags | Mobile cloudChat true; mobile sync needs Cloud mode (cloudSyncEngine.ts:97-103). Health space cannot be shared (org-sharing-service.ts:370-372). |
| Model compatibility | Not applicable; none found in the code. |
| Provider restrictions | None found in the code. |
| Local mode | Sharing is not available in Local mode: mobile Local-mode projects are device-only and have no share path found (store.ts:421-436). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Dialog shows a spinner; mobile shows 'Loading who can access this project'. | ProjectShareDialog.tsx:68-69; ProjectMembersSection.tsx:127 |
| Error | Dialog role=alert 'Sharing could not be loaded. Try again.'; mobile 'Could not load who can access this project.' | ProjectShareDialog.tsx:70-75; ProjectMembersSection.tsx:101 |
| Personal workspace | Dialog says only you can open the project and to switch to a team workspace. | ProjectShareDialog.tsx:76-81 |
| Not allowed to manage | Members see the access list read-only with 'Only the project's owner changes who can open it.' or 'This project is not shared. Only its owner can share it.' | ProjectShareDialog.tsx:82-92 |
| Viewer given edit | Refused; option labelled 'Can edit (their role can only view)'. | ProjectSharingControls.tsx:46; org-sharing-service.ts:408-414 |
| Unshare | Confirmation names the loss of access; project stays with the owner. | ProjectShareDialog.tsx:129-136 |
| Read-only member in sources | Sources panel hides upload and delete and shows 'The owner of this project has not added any sources yet. Only they can add or remove them.' when empty. | SourcesPanel.tsx:63-67 (readOnly prop), empty text near line 500-505 |
| Offline or stale sync | Sync failures are collected per step and reported; stale account operations are dropped. | cloudSyncEngine.ts:1016-1034 |
| Hidden sharer (mobile) | A hidden sharer shows 'You hid this sharer.' | SharedProjectScreen.tsx:116 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/org-sharing-service.test.ts`: Role gates fail closed, membership lookups, listing shared projects, readable and writable shared ids (it titles opened).
- `apps/web/app/api/projects/__tests__/route.org-shared.test.ts`: Shared projects through the project route (file name).
- `apps/web/app/api/projects/__tests__/route.shared-editor.test.ts`: Editor update of a shared project (file name).
- `apps/web/app/api/projects/[id]/__tests__/knowledge-files.org-shared.test.ts`: Source routes on a shared project (file name).
- `apps/web/app/chat/projects/[id]/page.org-shared.test.tsx`: Web page for a shared project (file name).
- `apps/web/features/projects/components/__tests__/SourcesPanel.org-shared.test.tsx`: Sources panel read-only for shared (file name).
- `apps/mobile/src/features/projects/__tests__/ProjectSharedWithYou.test.tsx`: Mobile shared with you (file name).
- `apps/mobile/__tests__/cloud-projects-sync.test.ts`: Mobile project sync (file name).
- `apps/web/app/api/projects/sync/__tests__/route.contract.test.ts`: Sync route contract (file name).

**Test scenarios**

- **Share invited-only**
  1. In a team workspace owner shares a project as 'Only people you invite'.
  2. Add member B with Can view.
  3. Sign in as B.
  - Expected: B sees the project, cannot change its name, sees instructions and files.
- **Viewer edit refusal**
  1. Pick a member whose workspace role is Viewer.
  2. Try to set Can edit.
  - Expected: The change is refused with the Viewer message.
- **Stop sharing**
  1. Owner presses 'Stop sharing' and confirms.
  2. Member reloads.
  - Expected: The project is gone from the member's list.
- **Cross-app**
  1. Create and edit a project on web.
  2. Open mobile in Cloud mode and sync; run 'agi projects show'.
  - Expected: Name and instructions match on all three.
- **Shared member chat**
  1. As a member start a chat in a shared project with instructions set.
  - Expected: Record whether the reply follows the owner's instructions (not verified).

**Where to look when it fails**

- Server errors from org-sharing-service: 'Your workspace role does not allow changing what is shared.', shared-project limit conflict.
- Mobile sync failures list the step name 'projects' (cloudSyncEngine.ts:1035).
- Tables organization_shared_projects and organization_project_access.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)
- CLI: [70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **Which part of sharing is the 'ui' gap the brief lists for web and desktop is not identified.** Affects: Web and Desktop. Evidence: Brief S37.34 Unfinished; ProjectShareDialog.tsx reads complete for its states. Work needed: Ask the audit owner or run the live check, then name the gap.
- **Brief says mobile sync is 'flag-off'; the code shows the flag true.** Affects: Mobile. Evidence: apps/mobile/lib/v1FeatureFlags.ts:4. Work needed: Update the brief or find the intended flag.
- **Sync pull omits shared projects.** Affects: CLI, mobile sync. Evidence: apps/web/app/api/projects/sync/route.ts:44-56. Work needed: Confirm mobile gets shared projects from the sharing overview only (SharedWithYouSection) and document it.
- **No sharing on CLI, VS Code and Chrome.** Affects: Those apps. Evidence: No code found; decisions D-2026-09-28-23, -25. Work needed: None required by decision; list in the matrix.
- **Shared member chat grounding may be blocked (owner-only project query).** Affects: Shared members. Evidence: project-context-service.ts:205-210. Work needed: Run and fix if broken.
- **Web editor sees a 'Retry indexing' button that the server refuses for non-owners.** Affects: Editors on shared projects. Evidence: SourcesPanel.tsx:746 (canRetry={!readOnly}) vs reindex/route.ts:36 (p.user_id = $3). Work needed: Hide the retry for editors or allow it server-side.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- plan:team
- api:PUT /api/settings/organization/shared/projects/{projectId}
- api:GET /api/projects/sync
- table:organization_shared_projects
- table:organization_project_access
- table:user_projects
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- F037-01
- F037-05

## Unknown

- The 'ui' gap in the brief for web and desktop sharing.
- What flag the brief calls 'flag-off' for mobile sync (cloudChat is true).
- Whether a shared member's chat is grounded in the project (not run).
- Whether mobile Cloud mode lists shared projects in its main list or only in 'Shared with you'.
- Whether Desktop (Electron) behaves differently from the web page.
