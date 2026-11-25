---
id: "F023-07"
type: "feature"
title: "Sharing, members and roles"
aliases: ["Share project", "Project sharing", "Share dialog", "Shared with you", "Project members and roles", "Who can open it", "Workspace sharing page", "organization_shared_projects", "S23.21 to S23.25 and S23.34 in the area brief"]
area: "23 Project workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S23.21", "S23.22", "S23.23", "S23.24", "S23.25", "S23.34"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "SYS-memory-projects-and-context", "table:organization_shared_projects", "table:organization_project_access", "api:PUT /api/settings/organization/shared/projects/[projectId]", "api:GET /api/settings/organization/shared"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-07 Sharing, members and roles

Lets a project owner share a project with people in the same workspace (organisation), choose who can open it, give each person Can view, Can edit or No access, copy a link, and stop sharing. Members see instructions and files; each person's chats and memories stay private. Access requests do not exist. Built on Web, Desktop (hosted web) and Mobile.

Area: [23. Project workspace](README.md). Requirement items: [S23.21](../../10-requirements/capabilities/023-project-workspace.md#s2321), [S23.22](../../10-requirements/capabilities/023-project-workspace.md#s2322), [S23.23](../../10-requirements/capabilities/023-project-workspace.md#s2323), [S23.24](../../10-requirements/capabilities/023-project-workspace.md#s2324), [S23.25](../../10-requirements/capabilities/023-project-workspace.md#s2325), [S23.34](../../10-requirements/capabilities/023-project-workspace.md#s2334).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shares one project inside an organisation. The share has an audience (everyone in the workspace can view, or only people the owner invites) and optional per-person grants (read, write, none). Members open the project and see its instructions and files. Editors may change name, description, instructions and appearance. Chats and memories stay with each person. (apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:25) (apps/web/features/projects/components/ProjectShareDialog.tsx:97) (apps/mobile/src/features/projects/projectSharing.ts:63)

**Why it exists.** Teams need one set of instructions and files without copying them. Migration 0315 says the model follows Claude's private projects: open only to invited people with Can view or Can edit each, with a whole-workspace project as the other choice. (apps/web/db/neon/0315_private_shared_projects.sql:3)

**Who uses it.** Project owners whose role holds content.share, people who hold sharing.manage (owners and admins by default), and members or viewers who open what is shared. A user with no organisation cannot share. (apps/web/lib/services/org-sharing-service.ts:91) (packages/contracts/types/src/enterprise/permissions.ts:310) (apps/web/features/projects/components/ProjectShareDialog.tsx:76)

**Problems it solves**

- Copying instructions and files by hand between colleagues.
- A shared project opening to the whole workspace when the owner wanted a few people (invited-only audience).
- Members editing things only the owner should change (owner-only fields are refused for editors).
- Not knowing what a member can see (shared versus personal explanation).

**Use cases**

- A team lead shares a research project with the workspace so everyone can view its instructions and files.
- An owner shares a project as invited-only and gives one colleague Can edit.
- A member opens a project shared with them and reads the note that their chats stay private.
- An owner clicks Stop sharing when the project is no longer needed by the team.

## 2. User experience

**Where to find it**

- Web and Desktop (the Desktop window shows the hosted web app, doc: AGENTS.md section 5): project page, the more menu, item 'Share' (data-testid project-detail-menu-share). (apps/web/app/chat/projects/[id]/page.tsx:623)
- Web and Desktop: Projects list, project card menu, item 'Share' (hidden for the Health space). (apps/web/app/chat/projects/page.tsx:454)
- Web and Desktop: workspace Sharing page, title 'Sharing' (OrganizationSharingSection). (apps/web/app/workspace/sharing/page.tsx:6) (apps/web/features/settings/sections/OrganizationSharingSection.tsx:171)
- Mobile: project settings screen, section 'SHARING', buttons 'Share with the workspace' and 'Share with people I choose'. (apps/mobile/src/features/projects/components/ProjectSettingsScreen.tsx:193) (apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:271)
- Mobile: Projects tab, filter 'Shared' and section 'Shared with you'. (apps/mobile/app/(app)/(tabs)/projects.tsx:206) (apps/mobile/src/features/projects/components/SharedProjectScreen.tsx:148)
- CLI, VS Code, Chrome: not available (no sharing code found).

**Before you start**

- Signed in with a Cloud account and an active organisation (workspace). Without one the Web dialog says 'Only you can open this project. Switch to a team workspace to share it.' (apps/web/features/projects/components/ProjectShareDialog.tsx:79)
- Owner of the project and role with content.share, or any role with sharing.manage. (apps/web/lib/services/org-sharing-service.ts:91)
- Organisation plan with a shared-project limit above zero. (apps/web/lib/services/org-sharing-service.ts:310)

**Screens and controls**

- Web dialog 'Share {project name}' with description 'Choose who can open this project and what they can do.' (apps/web/features/projects/components/ProjectShareDialog.tsx:149)
- Unshared state: note 'Instructions and files are shared. Each person's chats stay private.', a select 'Who can open it' with 'Everyone in the workspace can view' or 'Only people you invite', and a 'Share' button. (apps/web/features/projects/components/ProjectShareDialog.tsx:97) (apps/web/features/projects/components/ProjectSharingControls.tsx:105)
- Shared state: audience select, list 'People with access to {name}' with the owner marked 'Owner', a per-person select (Can view, Can edit, No access), 'Add people' picker with an access select and 'Add' button, and 'Stop sharing' (confirm dialog). (apps/web/features/projects/components/ProjectSharingControls.tsx:175) (apps/web/features/projects/components/ProjectShareDialog.tsx:130)
- 'Copy link' button copies the project page address and shows 'Project link copied. It opens only for people who have access.' (apps/web/features/projects/components/ProjectShareDialog.tsx:37)
- Member view of a shared project: badge 'Shared with you' or 'Shared with you · you can edit' and the text 'This project's instructions and files are shared with you. Your chats and memories here stay private to you.' (apps/web/app/chat/projects/[id]/page.tsx:1025) (apps/web/app/chat/projects/[id]/page.tsx:1039)
- Mobile members list rows show the person and 'Owner' or Can view, Can edit, No access; tapping opens an action sheet; 'Stop sharing' asks 'Stop sharing this project?'. (apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:176)

**Journey**

1. Owner opens the project and chooses Share (Web) or Project settings, SHARING (Mobile).
2. Owner picks the audience and presses Share. The server stores the share and returns the summary.
3. Owner adds people from the member picker, choosing Can view or Can edit (editing is offered only to people whose role can edit), then presses Add.
4. Owner changes a person's access in the list, or sets it back to the default which removes the override.
5. Owner presses Copy link and sends the address to a colleague.
6. The colleague opens the link. If they have access the project page opens with the Shared with you badge; if not, they see 'Project not found'.
7. Owner presses Stop sharing and confirms; everyone loses access, the project stays with the owner.

**What the person sees and gets**

- Toasts: 'Project shared with the people you invite' or 'Project shared with your workspace', 'Access updated', 'Access updated for {count} people', 'Project is no longer shared'. (apps/web/features/settings/hooks/use-settings-queries.ts:1766) (apps/web/features/settings/hooks/use-settings-queries.ts:1784)
- Errors are shown with the server's safe message, for example 'Your organization's plan does not include shared projects...' or 'Health cannot be shared.' (apps/web/lib/services/org-employment-placeholder)
- Audit events project_shared, project_unshared, project_member_access_changed are written for each change. (apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:89)

**Settings**

- Audience per project: workspace (default access read) or invited (default access none). (apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:83)
- Workspace roles Owner, Admin, Member, Viewer and custom roles decide who may share and edit. (packages/contracts/types/src/enterprise/permissions.ts:301)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Share, change audience and stop sharing through PUT and DELETE on the project share route, with CSRF, rate limit, a sharing-right check and audit events. (apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:216)
- Per-person grants read, write, none and inherit (inherit deletes the override) through PATCH. (apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:31)
- Read visibility is the person's grant or else the share default, and none hides the project. The database read policies apply the same rule. (apps/web/lib/services/org-sharing-service.ts:189) (apps/web/db/neon/0315_private_shared_projects.sql:30)
- Write needs an explicit write grant and a role that holds content.share, checked again at read time. (apps/web/lib/services/org-sharing-service.ts:216) (apps/web/lib/services/org-sharing-service.ts:264)
- Project update route lets an editor change name, description, instructions and appearance and refuses owner-only fields (isArchived, starred, defaultPrivacyMode, defaultProviderMode, allowedSurfaces, usesGlobalMemory, usesAccountInstructions, usesAccountStyle, importedFrom). (apps/web/app/api/projects/[id]/route.ts:33) (apps/web/app/api/projects/[id]/route.ts:261)
- A project not shared with the caller answers 404 'Project not found'. (apps/web/app/api/projects/[id]/route.ts:116)
- Member roster, with emails hidden unless the viewer may see them. (apps/web/app/api/settings/organization/shared/route.ts:66)
- Shared-project limit from the organisation plan, enforced in the database function assert_org_resource_limit. (apps/web/lib/services/org-sharing-service.ts:310)
- Mobile can share, change access, stop sharing and list projects shared with me. (apps/mobile/src/features/projects/projectSharing.ts:88) (apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:151)
- Shared versus personal explanation on Web and Mobile. (apps/web/app/chat/projects/[id]/page.tsx:1039) (apps/mobile/src/features/projects/projectSharing.ts:63)

**Incomplete**

- The brief lists Mobile as missing for S23.21 to S23.24, but the code has a members section, share calls and a Shared with you screen. The brief is behind the code. (doc: knowledge-base/data/area-briefs/023-project-workspace.md) (apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:81)
- Mobile shared-project screen shows access as read-only; mobile editing of a shared project is blocked in the project page (canEditInstructions is false when shared with me). (apps/mobile/app/(app)/projects/[id].tsx:372)
- The Web project settings dialog has no owner flag, so an editor sees Delete project, Duplicate and Export that the server answers with not found. [inferred] (apps/web/features/projects/components/ProjectSettingsDialog.tsx:34)
- The Web settings dialog save always sends usesGlobalMemory and the two account-context flags, which the server treats as owner-only, so an editor save from that dialog is likely refused. [inferred] (apps/web/features/projects/components/ProjectSettingsDialog.tsx:176) (apps/web/app/api/projects/[id]/route.ts:33)
- Add people sends one request per person in a loop, not one batch. (apps/web/features/settings/hooks/use-settings-queries.ts:1832)
- The draft says only owners and admins change sharing. The code allows sharing.manage holders or the project's own owner with content.share. (apps/web/lib/services/org-sharing-service.ts:91)

**Present but disconnected or switched off**

- requireSharingManager exists in the sharing service; the project share route uses requireProjectSharingRight instead. [inferred] (apps/web/lib/services/org-sharing-service.ts:72)
- The 0217 migration header says 'NOT YET APPLIED : draft only'; whether it is applied is not established here, although code relies on it. (apps/web/db/neon/0217_shared_project_editor_write.sql:3)

**Not available**

- Access requests (request, approve, deny): no code on any app. (doc: knowledge-base/data/area-briefs/023-project-workspace.md)
- Sharing on CLI, VS Code and Chrome: no sharing code found; the Chrome extension only lists non-archived projects. (apps/extension/src/features/cloud-bridge/projectsClient.ts:164)
- Sharing with people outside the organisation or a link that works by itself: none; the link is the plain project page address. (apps/web/features/projects/components/ProjectShareDialog.tsx:38)
- Health space cannot be shared (database constraint and hidden menu item). (apps/web/lib/services/org-sharing-service.ts:360) (apps/web/app/chat/projects/page.tsx:454)

## 4. Required behaviour

**Established requirements**

- A project shows who can access it (owner and members) and a member can see it is shared with them. (S23.21) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.21)
- Members hold distinct roles (owner, can edit, can view, no access) that the server enforces. (S23.22) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.22)
- An owner or manager can add a person to a specific project and remove them. (S23.23) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.23)
- A user can get a link that opens the project for the people it is shared with. (S23.24) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.24)
- A person who opens a project they cannot access can request access, and an owner or manager approves or denies. (S23.25) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.25)
- Where shared, the product explains which context is shared (instructions, files) and which stays personal (chats, memories). (S23.34) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.34)
- Editors cannot change owner-only fields; a project not shared with the user returns not found. (source: apps/web/app/api/projects/[id]/route.ts:33)

**Acceptance criteria**

1. An owner with content.share can share a project as workspace or invited-only; a Viewer-role user cannot and sees no controls.
2. With invited-only audience, a member with no grant gets 404 on the project; after the owner adds them with Can view they can open it but not edit it.
3. A Can edit grant is refused for a person whose role is Viewer, with the message about changing their role to Member.
4. An editor can save name, instructions and appearance but gets a refusal when sending isArchived.
5. Copy link produces the project page address and a signed-in member with access opens it; a person without access sees 'Project not found'.
6. Stop sharing removes access for everyone and the owner keeps the project; the audit log shows project_unshared.
7. Sharing beyond the plan's shared-project limit fails with the limit message; sharing the Health space fails.
8. A member opening a shared project sees the Shared with you badge and the note that chats and memories stay private.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Removing a member from the organisation removes their grants through the database cascade. [inferred] (apps/web/db/neon/0086_org_shared_ecosystem.sql:130)
- Editor controls on Web and Mobile should hide owner-only actions instead of letting the server refuse them. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build access requests: a request button on the Project not found screen for people in the same organisation, a pending list for owners and managers, and audit events.
- [proposed] Hide Delete, Duplicate and Export from editors and stop the settings dialog from sending owner-only fields for editors.
- [proposed] Offer a single batch call for adding several people.
- [proposed] Bring sharing to CLI and VS Code only if the product wants it there; decide first.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:PUT/PATCH/DELETE /api/settings/organization/shared/projects/[projectId] | `apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts` | Share or change audience, set or clear a person's access, stop sharing; audits each change. |
| endpoint | api:GET /api/settings/organization/shared | `apps/web/app/api/settings/organization/shared/route.ts` | Returns the member roster, shared projects with grants and permission flags canManageSharing and canShareOwnProjects. |
| service | org-sharing-service | `apps/web/lib/services/org-sharing-service.ts` | Membership, sharing right, readable and writable project ids, write access, share, unshare, grants. |
| endpoint | api:GET/PUT /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Opens a shared project for members and applies editor rules and owner-only fields. |
| endpoint | api:GET /api/projects | `apps/web/app/api/projects/route.ts` | Project list that includes shared projects and marks is_org_shared. |
| component | ProjectShareDialog | `apps/web/features/projects/components/ProjectShareDialog.tsx` | Web Share dialog, Copy link, Stop sharing. |
| component | ProjectSharingControls | `apps/web/features/projects/components/ProjectSharingControls.tsx` | Audience select, member list, Add people picker. |
| component | OrganizationSharingSection | `apps/web/features/settings/sections/OrganizationSharingSection.tsx` | Workspace Sharing page listing shared projects and own projects. |
| hook | use-settings-queries sharing hooks | `apps/web/features/settings/hooks/use-settings-queries.ts` | Mutations for share, unshare, member access with toasts and cache refresh. |
| screen | Project detail page | `apps/web/app/chat/projects/[id]/page.tsx` | Share menu item, Shared with you badge, shared versus personal explanation, Project not found. |
| screen | Projects list page | `apps/web/app/chat/projects/page.tsx` | Opens the Share dialog from a project card. |
| table | table:organization_shared_projects | `apps/web/db/neon/0086_org_shared_ecosystem.sql` | One row per shared project with default_access; 0315 adds 'none'. |
| table | table:organization_project_access | `apps/web/db/neon/0086_org_shared_ecosystem.sql` | Per-person grant read, write or none; cascades when the member leaves. |
| schema | Migration 0315 private shared projects | `apps/web/db/neon/0315_private_shared_projects.sql` | Allows invited-only audience and rewrites the read policies. |
| schema | Migration 0217 shared project editor write | `apps/web/db/neon/0217_shared_project_editor_write.sql` | Editor write policies on projects and knowledge files. |
| schema | Migration 0316 project owner sharing | `apps/web/db/neon/0316_project_owner_sharing.sql` | Lets a content.share owner share their own project. |
| config | Permission definitions and built-in roles | `packages/contracts/types/src/enterprise/permissions.ts` | content.share, sharing.manage and the Owner, Admin, Member, Viewer roles. |
| service | org-entitlements | `apps/web/lib/services/org-entitlements.ts` | sharedProjectLimit from the organisation's plan and the limit messages. |
| service | mobile projectSharing | `apps/mobile/src/features/projects/projectSharing.ts` | Mobile calls to the same share routes, access labels, shared-context copy. |
| component | ProjectMembersSection | `apps/mobile/src/features/projects/components/ProjectMembersSection.tsx` | Mobile share, access list and stop sharing. |
| component | SharedWithYouSection and SharedProjectScreen | `apps/mobile/src/features/projects/components/SharedWithYouSection.tsx` | Mobile list and read-only view of projects others shared. |
| service | security audit events | `apps/web/lib/security-audit.ts` | Defines project_shared, project_unshared, project_member_access_changed. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Owner presses Share; the app sends PUT with the audience to the share route. | device and our servers | apps/web/features/settings/hooks/use-settings-queries.ts:1759 |
| Server checks rate limit and CSRF, resolves the caller's organisation and checks the sharing right (sharing.manage, or content.share on a project they own). | our servers | apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:55 |
| Server reads the organisation's shared-project limit; zero blocks sharing. | our servers | apps/web/lib/services/org-sharing-service.ts:310 |
| One SQL statement inserts or updates organization_shared_projects for a project the caller owns and calls the limit guard; Health space violates a constraint and is refused. | our servers | apps/web/lib/services/org-sharing-service.ts:318 |
| Server writes an audit event and returns the shared project. | our servers | apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:86 |
| Owner adds people; each person gets one PATCH that upserts organization_project_access after checking a write grant can only go to a role that may edit. | our servers | apps/web/lib/services/org-sharing-service.ts:405 |
| A member opens the project; the server returns the project when it is theirs or in their readable shared set, marking write or read access. | our servers | apps/web/app/api/projects/[id]/route.ts:106 |
| An editor saves; the owner-only update misses, the server resolves editor access, refuses owner-only fields, then updates as non-owner. | our servers | apps/web/app/api/projects/[id]/route.ts:256 |
| Copy link writes the project page address to the clipboard; no server call. | device | apps/web/features/projects/components/ProjectShareDialog.tsx:37 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Share row (project, organisation, shared_by, default_access) | table:organization_shared_projects in the Neon database | Read by every app through the API; no device copy on Web | Deleted when the owner stops sharing, or when the project row is removed (cascade). |
| Per-person grant (read, write, none) | table:organization_project_access | Through the API | Cleared with 'inherit', cascades when the share or the member goes. |
| Audit events for share changes | security_audit_logs table | Server only | Retention follows the audit settings; not established here. |
| Mobile cached overview of sharing | unknown; fetched on screen load in the code read | Fetched each time | unknown |

**Models and providers.** No model or provider takes part in sharing. A shared project's instructions apply to chats of members through the normal chat pipeline, which uses whatever model the member chooses. (doc: apps/web/lib/services/project-context-service.ts is cited by the brief for S23.09) [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs a signed-in Cloud account and an organisation; the overview route answers forbidden for a non-member. (apps/web/lib/services/org-sharing-service.ts:109) |
| Permissions | Sharing: sharing.manage, or content.share and owning the project. Edit grant: only for roles holding content.share (Member, Admin, Owner), not Viewer. Read: content.read. (apps/web/lib/services/org-sharing-service.ts:91) (packages/contracts/types/src/enterprise/permissions.ts:321) |
| Subscription | The organisation plan sets a shared-project limit; zero shows 'Your organization's plan does not include shared projects. Upgrade...'. The plan names are not established in this page. (apps/web/lib/services/org-entitlements.ts:155) |
| Limits and metering | Count of shared projects per organisation, enforced in the database function assert_org_resource_limit. Rate limit class settings-org-patch on the share route. (apps/web/lib/services/org-sharing-service.ts:318) (apps/web/lib/rate-limit.ts:504) |
| Feature flags | none found in the code for sharing itself. |
| Model compatibility | none found in the code; sharing does not depend on a model. |
| Provider restrictions | none found in the code. |
| Local mode | Not available. Sharing needs the Cloud account and database. Mobile local projects are device-only and the share section depends on the Cloud overview; with no overview it says only you can open the project. (apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:145) Local use is not tied to a subscription, but this feature needs sign-in. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web dialog shows a spinner; Mobile shows a loading indicator 'Loading who can access this project'. | apps/web/features/projects/components/ProjectShareDialog.tsx:68; apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:123 |
| Load error | Web shows an alert 'Sharing could not be loaded. Try again.'; Mobile Shared with you shows 'Shared projects could not be loaded.' with Retry. | apps/web/features/projects/components/ProjectShareDialog.tsx:70; apps/mobile/src/features/projects/components/SharedWithYouSection.tsx:55 |
| No organisation | Web: 'Only you can open this project. Switch to a team workspace to share it.' Mobile: 'Only you can open this project. Workspace projects can be shared.' | apps/web/features/projects/components/ProjectShareDialog.tsx:79; apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:145 |
| Not allowed to manage | Web: 'This project is not shared. Only its owner can share it.' Mobile: 'Not shared. Your workspace role doesn't allow sharing.' | apps/web/features/projects/components/ProjectShareDialog.tsx:90; apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:289 |
| Viewer-role person | Can edit is disabled and labelled 'Can edit (their role can only view)'; the server refuses a write grant. | apps/web/features/projects/components/ProjectSharingControls.tsx:222; apps/web/lib/services/org-sharing-service.ts:405 |
| Plan limit reached or zero | Conflict or validation error with the limit message. | apps/web/lib/services/org-sharing-service.ts:310 |
| Role lowered after grant | An old write grant stops working at read time. | apps/web/lib/services/org-sharing-service.ts:264 |
| Project deleted | Deleted projects are left out of the shared list. | apps/web/lib/services/org-sharing-service.ts:140 |
| Concurrent edit | If-Match version mismatch returns a precondition failure with the latest project. | apps/web/app/api/projects/[id]/route.ts:306 |
| Offline, timeout, retry | Web has no retry control in the dialog beyond closing and reopening; offline handling for sharing is not handled in the code. Mobile offers Retry on the shared list only. | apps/web/features/projects/components/ProjectShareDialog.tsx:57 |
| Accessibility | Member list has an aria-label, selects have screen-reader labels, error text uses role alert; Mobile rows carry accessibility labels such as 'Change access'. | apps/web/features/projects/components/ProjectSharingControls.tsx:175; apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:233 |
| Access denied to a link | The page shows 'Project not found' with no way to ask for access. | apps/web/app/chat/projects/[id]/page.tsx:496 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/org-sharing-service.test.ts`: Membership rules, sharing manager check, readable and writable ids, editor grant, role lowered to Viewer.
- `apps/web/app/api/settings/organization/shared/projects/[projectId]/__tests__/route.audit.test.ts`: Audit events for share, access change and unshare.
- `apps/web/app/api/settings/organization/shared/__tests__/route.test.ts`: Shared overview route.
- `apps/web/app/api/settings/organization/shared/__tests__/route.cross-org-isolation.test.ts`: No leakage between organisations.
- `apps/web/app/api/projects/__tests__/route.shared-editor.test.ts`: Editor saves instructions, no-grant member gets 404, editor cannot archive.
- `apps/web/app/api/projects/__tests__/route.org-shared.test.ts`: Project list and open for shared projects.
- `apps/web/features/settings/sections/OrganizationSharingSection.test.tsx`: Workspace Sharing page.
- `apps/mobile/src/features/projects/__tests__/ProjectSettings.test.tsx`: Mobile share, access list and stop sharing with confirmation, shared-context text.
- `apps/mobile/src/features/projects/__tests__/ProjectSharedWithYou.test.tsx`: Mobile Shared with you list, empty message and retry.

**Test scenarios**

- **Invited-only share**
  1. As an owner with Member role, open a project and choose Share.
  2. Select 'Only people you invite' and press Share.
  3. Add a colleague with Can view.
  4. As the colleague open the link; as a second member without a grant open the same link.
  - Expected: The colleague opens it with the Shared with you badge; the second member sees Project not found.
- **Editor limits**
  1. Give a Member Can edit.
  2. As that member change the instructions and save through the API.
  3. Send isArchived true.
  - Expected: Instructions save; the archive request is refused with the editor message.
- **Viewer cannot edit**
  1. Try to give a Viewer-role person Can edit.
  - Expected: The option is disabled in the UI and the server returns a forbidden message.
- **Stop sharing**
  1. Press Stop sharing and confirm.
  2. As a member reload the link.
  - Expected: Member sees Project not found; owner still has the project; audit shows project_unshared.
- **Plan limit**
  1. On an organisation whose plan limit is reached, share another project.
  - Expected: Share is refused with the limit message.
- **Mobile sharing**
  1. On Mobile in Cloud mode open project settings, choose Share with people I choose, change a person's access.
  - Expected: Access label updates and Web shows the same grant.

**Where to look when it fails**

- Audit rows in security_audit_logs with event types project_shared, project_unshared, project_member_access_changed.
- Error text 'Your workspace role does not allow changing what is shared.' or 'Only the project's owner or someone who manages sharing can change who can open it.'
- Rows in organization_shared_projects and organization_project_access for the project id.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/023-project-workspace.md](../../70-qa/test-plans/web/023-project-workspace.md)
- Desktop: [70-qa/test-plans/desktop/023-project-workspace.md](../../70-qa/test-plans/desktop/023-project-workspace.md)
- Mobile: [70-qa/test-plans/mobile/023-project-workspace.md](../../70-qa/test-plans/mobile/023-project-workspace.md)

## 10. Gaps and dependencies

- **Access requests are not built.** Affects: All users on all six apps who open a project they cannot access. Evidence: doc: knowledge-base/data/area-briefs/023-project-workspace.md (S23.25); apps/web/app/chat/projects/[id]/page.tsx:496. Work needed: Design request, approve and deny flow, store, audit and notify.
- **Brief says Mobile is missing for sharing, roles, invite and link; code has sharing on Mobile (no link or copy control found).** Affects: Mobile users and anyone reading the brief. Evidence: apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:151. Work needed: Update the brief; decide whether Mobile needs a Copy link.
- **Editors see owner-only actions and an editor save from the Web settings dialog is likely refused.** Affects: Editors on Web and Desktop. Evidence: apps/web/features/projects/components/ProjectSettingsDialog.tsx:176; apps/web/app/api/projects/[id]/route.ts:33. Work needed: Pass an owner flag, send only editor fields, test it.
- **Sharing is missing on CLI, VS Code and Chrome.** Affects: CLI, VS Code and Chrome users. Evidence: doc: knowledge-base/data/area-briefs/023-project-workspace.md. Work needed: Product decision, then calls to the existing routes.
- **No Local mode path; sharing only inside an organisation.** Affects: Local-only users. Evidence: apps/web/lib/services/org-sharing-service.ts:109. Work needed: None required unless the product wants peer sharing.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- SYS-memory-projects-and-context
- table:organization_shared_projects
- table:organization_project_access
- api:PUT /api/settings/organization/shared/projects/[projectId]
- api:GET /api/settings/organization/shared

## Unknown

- Whether migration 0217 is applied in production (header says draft; code relies on it).
- Whether the Desktop (Tauri build) has any sharing UI; only the hosted-web path was established.
- How long audit rows are kept.
- Which plans give a non-zero shared-project limit (not read here).
- Whether Mobile caches the sharing overview on the device.
- Whether the editor save from the Web settings dialog fails in practice (inferred from code, not run).
