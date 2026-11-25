---
id: "F095-07"
type: "feature"
title: "Versions, sharing and access"
aliases: ["Versions, sharing and access", "File versions", "Version lineage", "Project sharing", "Shared projects", "Share project with organization", "Sharing page (workspace)", "Resource-sharing service (S95.27)", "File-version store (S95.15)"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.15", "S95.27"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "surface:web", "surface:mobile", "mode:cloud", "table:organization_shared_projects", "table:organization_project_access", "table:file_lineage", "table:media_assets", "table:project_knowledge_files", "table:published_artifact_versions"]
basis: "code inspection"
second_reader: "7 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-07 Versions, sharing and access

Keeps older versions of files (project knowledge files, published artifacts, and, in code only, generated files) and lets the owner of a project share it with their organisation as read-only or with named editors. Web and mobile have a sharing screen; versions have no per-file history screen found for files.

Area: [95. File and Library components](README.md). Requirement items: [S95.15](../../10-requirements/capabilities/095-file-and-library-components.md#s9515), [S95.27](../../10-requirements/capabilities/095-file-and-library-components.md#s9527).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Two linked jobs. First, versioning: a re-uploaded project file with the same name becomes a new version and the old one is marked superseded (apps/web/lib/server/project-knowledge-files.ts:394, :425); a published artifact keeps an append-only history that can be listed, read and restored (apps/web/lib/services/published-artifact-service.ts:871, :971, :500; apps/web/app/api/artifacts/publish/[token]/versions/route.ts:34); a generated file can point at the file it replaced and at the file it was made from (apps/web/lib/server/generated-file-persist.ts:95, :56). Second, sharing: a project owner or sharing manager shares a project with the organisation and sets per-person access (apps/web/lib/services/org-sharing-service.ts:305, :405).

**Why it exists.** Migration 0257 says a file had no history and no parent, a republish overwrote the earlier version, and nobody could answer where an export came from (apps/web/db/neon/0257_file_versions_and_lineage.sql:2-20). Sharing exists so a team can work from one project's instructions and files while chats stay private (apps/web/features/settings/sections/OrganizationSharingSection.tsx:196).

**Who uses it.** Project owners, organisation owners and admins, members with the share right, invited editors, and anyone who republishes an artifact. [inferred] from the permission checks (apps/web/lib/services/org-sharing-service.ts:91).

**Problems it solves**

- A newer upload of a same-named project file no longer destroys the old row; it is superseded, not deleted (apps/web/lib/resources/deletion-policies.ts:197-218).
- Raising a project's default access can never silently give the whole organisation edit rights; edit is a per-member grant (apps/web/lib/services/org-sharing-service.ts:213-217).
- A member later moved to Viewer cannot keep using an old edit grant, because the right is checked again on every read (apps/web/lib/services/org-sharing-service.ts:264-266).
- A health space cannot be shared (apps/web/lib/services/org-sharing-service.ts:361).

**Use cases**

- Owner shares a research project with the workspace so every member can read its files.
- Owner shares a project 'with people I choose' and grants two colleagues Can edit.
- User re-uploads a corrected spec with the same file name; the project uses the new one and the old is kept as a superseded version.
- User restores an earlier published version of an artifact.

## 2. User experience

**Where to find it**

- surface:web: workspace route /workspace/sharing, page title 'Sharing', section title 'Shared projects', button 'Share project with organization' (apps/web/app/workspace/sharing/page.tsx:8-17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:195, :241).
- surface:mobile: project settings, members section, buttons 'Share with the workspace' and 'Share with people I choose' (apps/mobile/src/features/projects/components/ProjectMembersSection.tsx:271, :279).
- surface:desktop: no sharing control found in apps/desktop/src (searched for the route; none). Not available in code found.
- surface:cli, surface:vscode, surface:chrome: no use of the sharing route found in apps/cli, apps/extension-vscode/src (VS Code) or apps/extension/src (Chrome); a search for 'organization/shared' in those folders and apps/desktop/src found no call. (apps/vscode and apps/chrome do not exist; the real folders are apps/extension-vscode and apps/extension.) [ls apps; grep of apps/extension/src, apps/extension-vscode/src, apps/cli, apps/desktop/src]
- Version history of a published artifact: API only is confirmed (GET /api/artifacts/publish/[token]/versions); the screen that calls it was not located.

**Before you start**

- Signed in, and an active organisation membership (apps/web/lib/services/org-sharing-service.ts:50-66, :120-125).
- Role right 'sharing.manage', or right 'content.share' and ownership of the project (apps/web/lib/services/org-sharing-service.ts:91-118).
- A plan whose project limit is not 0 (apps/web/lib/services/org-sharing-service.ts:310).
- Personal accounts see a note on how to get an organisation instead of an error (apps/web/features/settings/sections/OrganizationSharingSection.test.tsx test 'tells a personal account how to get an organization').

**Screens and controls**

- Project picker 'Select one of your projects…' (label 'Project to share'), audience picker (label 'Who can open it'), button 'Share project with organization' / 'Sharing…' (OrganizationSharingSection.tsx:209-241).
- Shared list rows show 'Visible to N of M members' and 'read-only' or 'N can edit', plus an unshare control for those who may manage the project (OrganizationSharingSection.tsx:260-300).
- Empty state text 'Nothing is shared yet.' (OrganizationSharingSection.tsx:247).

**Journey**

1. Open Sharing in the workspace.
2. Pick one of your projects not already shared.
3. Choose who can open it: the workspace (default access read) or only invited people (default access none) (apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:83).
4. Press 'Share project with organization'; the client sends PUT to the project route.
5. Optionally set a person to read, write, none or inherit (PATCH).
6. To stop, use unshare (DELETE).

**What the person sees and gets**

- Toast 'Project shared with your workspace' or 'Project shared with the people you invite' (apps/web/features/settings/hooks/use-settings-queries.ts:1765-1769).
- Toast 'Access updated' and 'Project is no longer shared' (use-settings-queries.ts:1787, :1813).
- Errors show a toast with a user-safe message, for example 'Only the project's owner or someone who manages sharing can change who can open it.' (org-sharing-service.ts:113-117).
- An audit event is recorded: project_shared, project_member_access_changed, project_unshared (route.ts:89, route.ts:114, route.ts:196).

**Settings**

- Organisation roles and permissions decide who may share (SYS-authorization-and-workspaces).
- Plan project limit (sharedProjectLimit) decides how many projects may be shared; it reuses the plan's general projects limit (apps/web/lib/services/org-entitlements.ts:120-130).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Share, per-member access and unshare routes exist with CSRF, rate limit, validation and audit (apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:216-218).
- Sharing quota is enforced inside the same SQL statement via assert_org_resource_limit (apps/web/lib/services/org-sharing-service.ts:305-345).
- Edit grant is checked against the current role on every read (org-sharing-service.ts:264, :276).
- Project knowledge file versions: version = max+1, supersedes_id set, older row marked superseded_at, under an advisory lock per project and file name (apps/web/lib/server/project-knowledge-files.ts:389-430).
- Published artifact version list, read and restore routes (apps/web/app/api/artifacts/publish/[token]/versions/route.ts:34; apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:46, :133).
- Published-artifact versions GET and restore POST are scoped to userId (owner only) via getUserScopedDb (apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:38, :64-71).
- Library helper groups files into newest version plus older ones and walks lineage (packages/platform/files/src/library.ts:20-128).

**Incomplete**

- Generated-file revisions: persistGeneratedFileBytes accepts supersedesFileId and parentFileId (apps/web/lib/server/generated-file-persist.ts:296-316), but no production caller was found that passes a provenance object; only the function definition and tests mention it. So media_assets rows get version 1 in practice [inferred from a code search of apps/web].
- Migration 0257 file header says 'NOT YET APPLIED : draft only' (apps/web/db/neon/0257_file_versions_and_lineage.sql:4). Whether it is applied is not recorded in the files read; the product memory notes a later migration number in production, so the header is probably stale [inferred].
- No restore route for an older project knowledge file version or an older generated file version was found (only DELETE and GET on the file route: apps/web/app/api/projects/[id]/knowledge-files/[fileId]/route.ts:96-97).

**Present but disconnected or switched off**

- file_lineage is written only when a caller passes parentFileId; no such caller found, so the lineage table is likely empty in practice [inferred].

**Not available**

- surface:desktop: no project sharing screen found.
- surface:cli: no sharing or version call found.
- surface:vscode and surface:chrome: the real folders are apps/extension-vscode and apps/extension; neither calls the organization shared-projects route (searched). apps/vscode and apps/chrome do not exist.
- Folder hierarchy and external references are out of this feature (brief S95.17, S95.18 marked platform missing).

## 4. Required behaviour

**Established requirements**

- File versions are kept (supersede chain, published versions, lineage). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.15)
- Files and file-bearing resources can be shared (org sharing, publish links) under access control. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.27)
- Sharing checks the organisation permission before a write. (source: apps/web/lib/services/org-sharing-service.ts:91-118)
- Shared projects: members with access read instructions and files; Can edit lets them change it; chats stay private. (source: apps/web/features/settings/sections/OrganizationSharingSection.tsx:196)

**Acceptance criteria**

1. Re-uploading a same-named file to a project makes the newest row version N+1, the previous row has superseded_at set, and the file list shows only the newest.
2. Sharing a project as a member without sharing.manage who does not own it returns 403 'Only the project's owner or someone who manages sharing...'.
3. Sharing with audience 'invited' sets default access none; 'workspace' sets read.
4. Granting write to a Viewer-role member is refused with the Viewer message.
5. A plan with project limit 0 refuses sharing with a validation error; at the limit, sharing returns a conflict.
6. Unsharing a project that is not shared returns 404 'That project is not shared with your organization'.
7. Each share, access change and unshare writes an audit event.
8. Republishing an artifact adds a version row and restore creates a new version rather than editing history.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Generated files should get versions when the model edits an earlier file, which needs callers to pass supersedesFileId [inferred from the unused parameter].
- Shared project file access should also hide files of a deleted or archived project (see archived retrieval rules, apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass supersedesFileId and parentFileId from the tool loop and sandbox file sweep so edits and exports record versions and lineage.
- [proposed] Add a per-file version history screen and restore route for project knowledge files and generated files.
- [proposed] Correct or remove the 'NOT YET APPLIED' header in migration 0257 once its state is confirmed.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:PUT/PATCH/DELETE /api/settings/organization/shared/projects/[projectId] | `apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts` | Share, set a member's access, unshare; audits each change. |
| service | org-sharing-service | `apps/web/lib/services/org-sharing-service.ts` | Membership, sharing rights, shareProject, setProjectMemberAccess, clearProjectMemberAccess, resolveProjectWriteAccess, readable/writable project ids. |
| service | org-entitlements | `apps/web/lib/services/org-entitlements.ts` | Maps the plan's general projects limit to sharedProjectLimit. |
| table | organization_shared_projects | `apps/web/lib/services/org-sharing-service.ts` | One row per shared project with default_access (queries at :189, :305). |
| table | organization_project_access | `apps/web/lib/services/org-sharing-service.ts` | Per-member read, write or none grant. |
| screen | OrganizationSharingSection (web Sharing page) | `apps/web/features/settings/sections/OrganizationSharingSection.tsx` | Share, list and unshare projects. |
| screen | WorkspaceSharingPage | `apps/web/app/workspace/sharing/page.tsx` | Hosts the section at /workspace/sharing. |
| hook | useShareProjectWithOrganization and related mutations | `apps/web/features/settings/hooks/use-settings-queries.ts` | Calls PUT, PATCH, DELETE and shows toasts (:1751-1845). |
| screen | ProjectMembersSection (mobile) | `apps/mobile/src/features/projects/components/ProjectMembersSection.tsx` | Mobile share controls. |
| service | mobile project sharing client | `apps/mobile/src/features/projects/projectSharing.ts` | Reads the shared overview and calls the sharing route. |
| service | persistGeneratedFileBytes | `apps/web/lib/server/generated-file-persist.ts` | Stores generated bytes, records version and lineage when provenance is passed. |
| service | registerProjectKnowledgeFile | `apps/web/lib/server/project-knowledge-files.ts` | Inserts a new version and supersedes the old row. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Publish, restore and list artifact versions. |
| endpoint | api:GET /api/artifacts/publish/[token]/versions | `apps/web/app/api/artifacts/publish/[token]/versions/route.ts` | Lists versions. |
| endpoint | api:GET,POST /api/artifacts/publish/[token]/versions/[version] | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts` | Reads or restores a version; scoped to the owner's userId via getUserScopedDb (:38, :64-71). |
| schema | 0257_file_versions_and_lineage | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Adds version and parent_version_id, published_artifact_versions, file_lineage. |
| table | file_lineage | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Derivation edges (edit, export, conversion, extraction, copy). |
| table | published_artifact_versions | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Append-only version history. |
| service | library version grouping | `packages/platform/files/src/library.ts` | Groups versions and walks lineage for desktop, mobile and web. |
| config | FILE_DERIVATIONS | `packages/contracts/types/src/file-model.ts` | Allowed derivation names, kept in step with the table check. |
| service | security-audit | `apps/web/lib/security-audit.ts` | recordAuditEvent used by the sharing route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses share in the Sharing page; the browser sends PUT with the audience. | device | apps/web/features/settings/hooks/use-settings-queries.ts:1757-1761 |
| Server checks rate limit and CSRF, resolves membership, and requires sharing.manage or content.share plus ownership. | our servers | apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:46-70; apps/web/lib/services/org-sharing-service.ts:91-118 |
| shareProject reads the plan limit, then one SQL statement checks ownership, upserts the share row and asserts the quota. | our servers | apps/web/lib/services/org-sharing-service.ts:305-345 |
| Audit event is recorded and the shared project summary returned. | our servers | route.ts:86-103 |
| Later reads include shared projects the member can read; write is allowed only for owner or a current-role-valid write grant. | our servers | org-sharing-service.ts:189-300 |
| Version flow: a new project file registration locks per project and name, inserts version max+1 and marks the older row superseded. | our servers | apps/web/lib/server/project-knowledge-files.ts:389-430 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Share row and member grants | table:organization_shared_projects, table:organization_project_access (Neon Postgres) | Server only; clients re-read it. | Removed on unshare; not otherwise covered in the files read (unknown for project purge). |
| File version fields and superseded marker | table:project_knowledge_files (version, supersedes_id, superseded_at); table:media_assets (version, parent_version_id) | Server only. | Superseded is not deleted: only deleted_at starts the recovery window (RESOURCE_RECOVERY_WINDOW_DAYS; the day count was not verified as 30) (apps/web/lib/resources/deletion-policies.ts:216-217). Purging an old version detaches supersedes_id on the newer row (rule 'detach'); it does not delete the newer row (deletion-policies.ts:197-218). |
| Lineage edges | table:file_lineage | Server only. | Deleted when either file is purged (child_file_id or parent_file_id) (deletion-policies.ts:246-251). |
| Artifact version history | table:published_artifact_versions | Server only. | No update policy; deleted with owner rows (0257 migration policies). |

**Models and providers.** No model or provider takes part in sharing or versioning itself. Generated-file versions are produced by tool output from a chat turn, so the model decides when a file is generated; the sandbox provider is recorded as the provider field on the file (apps/web/lib/server/generated-file-persist.ts:217-260).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account and active organisation membership required for sharing (org-sharing-service.ts:120-125). Versions need a signed-in owner; the published-artifact versions GET and the restore POST are scoped to userId (owner only) via getUserScopedDb (apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:38, :64-71). |
| Permissions | sharing.manage, or content.share plus project ownership. Edit grants need content.share held by the target (org-sharing-service.ts:91-118, :264, :405). |
| Subscription | The shared-project cap reuses the plan's general projects limit (sharedProjectLimit = limits?.projects through toEnforceableBillingPlanLimit): Free 5, most paid and max plans 'unlimited', one plan custom; 'unlimited' and 'custom' become null (no cap), so most paid organisations have no sharing limit. A limit of 0 (or non-numeric undefined) blocks sharing (org-sharing-service.ts:310; apps/web/lib/services/org-entitlements.ts:120-130; packages/contracts/types/src/billing-catalog.ts:618, :563, :584, :714, :787-790). |
| Limits and metering | Shared project count limited by plan; rate limit key 'settings-org-patch' (route.ts:47). Storage metering of versions: superseded rows are excluded from the project file list (knowledge-files route list query) [inferred], storage meter rules not read in full. |
| Feature flags | none found in the code for sharing; the routes read no feature flag. |
| Model compatibility | none found in the code; independent of model. |
| Provider restrictions | none found in the code. |
| Local mode | Sharing and server versions need the Cloud service and an organisation; mode:local has no sharing rule in the code read. Local desktop files and versions: unknown (not searched). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Personal account (no organisation) | Page explains how to get an organisation; mobile shows 'Only you can open this project. Workspace projects can be shared.' | OrganizationSharingSection.test.tsx; apps/mobile/src/features/projects/__tests__/ProjectSettings.test.tsx:340-346 |
| Viewer role | All mutation controls hidden; edit never offered to view-only members. | OrganizationSharingSection.test.tsx |
| Plan limit reached or zero | Conflict or validation error with a limit message. | org-sharing-service.ts:310-313, :351-356 |
| Health space project | Conflict 'Health cannot be shared.' | org-sharing-service.ts:361 |
| Project not owned or deleted | Share statement returns no row, 404 'Project not found'. | org-sharing-service.ts:366-368 |
| Unshare of something not shared | 404. | route.ts:200-202 |
| Project list fails to load | Error with retry. | OrganizationSharingSection.tsx:198-207 |
| Sharing request fails | Toast with user-safe message; no automatic retry. | use-settings-queries.ts:1771-1772 |
| Offline, timeout, cancel | not handled in the code beyond the generic toast on failure. | searched the sharing hooks and section; none found |
| Two uploads of the same file name at once | Serialised by an advisory lock so versions do not collide. | apps/web/lib/server/project-knowledge-files.ts:389 |
| Accessibility | Hidden but present labels for the two selects. | OrganizationSharingSection.tsx:209, :225 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/generated-file-persist.test.ts`: Persist, catalog, wire shape, size cap, cleanup on failure; revision and lineage helpers are in the same module.
- `apps/web/lib/services/__tests__/org-sharing-service.test.ts`: Admin roles, membership predicate, 403 on missing membership, custom role with sharing.manage.
- `apps/web/app/api/settings/organization/shared/projects/[projectId]/__tests__/route.audit.test.ts`: Audit events for share, member grant, clear, unshare.
- `apps/web/features/settings/sections/OrganizationSharingSection.test.tsx`: Page states, viewer limits, editor counts, share mutation.
- `apps/web/app/api/projects/[id]/__tests__/knowledge-files.org-shared.test.ts`: Knowledge files of an organisation-shared project.
- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/route.test.ts`: Knowledge files route.
- `apps/web/lib/services/__tests__/published-artifact-service.transactions.test.ts`: Published artifact version transactions.
- `apps/web/app/api/settings/organization/shared/__tests__/route.cross-org-isolation.test.ts`: Cross-organisation isolation of the shared overview.
- `apps/mobile/src/features/projects/__tests__/ProjectSettings.test.tsx`: Mobile share, list and change access calls.
- `apps/web/db/neon/retrieval-index-migration.test.ts`: Retrieval index migration, which tracks superseded rows.

**Test scenarios**

- **Share to workspace**
  1. Sign in as a member with content.share who owns a project.
  2. Open Sharing, pick the project, choose the workspace audience, press Share.
  3. Sign in as another member and open the project.
  - Expected: The second member can read the project and its files but not edit; an audit row project_shared exists.
- **Invited only and Can edit**
  1. Share with 'invited'.
  2. Grant write to a Member and to a Viewer.
  - Expected: Member is granted; Viewer grant is refused with the role message.
- **Role downgrade**
  1. Grant write to a member.
  2. Change their role to Viewer.
  3. They try to save the project.
  - Expected: Write is refused because the right is re-checked on read.
- **Plan limit**
  1. Use a plan at its shared-project limit.
  2. Share one more project.
  - Expected: Conflict message about the limit; nothing shared.
- **File version supersede**
  1. Upload a.pdf to a project, then upload a different a.pdf.
  - Expected: List shows one a.pdf; the old row has superseded_at and the new has version 2.
- **Artifact restore**
  1. Publish an artifact, change it, republish, then restore version 1 through the versions route.
  - Expected: A new latest version holds version 1's content; history keeps all rows.

**Where to look when it fails**

- Audit events project_shared, project_member_access_changed, project_unshared in security audit logs.
- Logger errors 'Failed to record file lineage for a generated file' and 'Failed to record a generated file revision' (apps/web/lib/server/generated-file-persist.ts:77, :115).
- Tables organization_shared_projects, organization_project_access, file_lineage, published_artifact_versions.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Generated files never get a version or a lineage edge because no caller passes provenance.** Affects: surface:web, surface:desktop, surface:mobile users who edit or export generated files.. Evidence: apps/web/lib/server/generated-file-persist.ts:296-316 versus no caller passing provenance in apps/web (code search).. Work needed: Pass supersedesFileId, parentFileId and derivation from the tool loop and sandbox sweep; add tests.
- **No visible history or restore for project file versions or generated file versions.** Affects: All apps.. Evidence: Only DELETE and GET on the project file route (knowledge-files/[fileId]/route.ts:96-97); library.ts groups versions in a helper but a screen using it was not confirmed.. Work needed: Add restore routes and a version list in the Library and project file views.
- **Desktop and CLI have no sharing control.** Affects: surface:desktop, surface:cli.. Evidence: No call to the sharing route found outside web and mobile (apps/extension, apps/extension-vscode, apps/cli and apps/desktop/src searched).. Work needed: Decide whether the Desktop (which shows the hosted web app) already covers it, and add parity otherwise.
- **Migration 0257 header says not applied.** Affects: Engineers and testers.. Evidence: apps/web/db/neon/0257_file_versions_and_lineage.sql:4. Work needed: Confirm applied state with pnpm db:migrate status and fix the header.

**Depends on**

- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- surface:web
- surface:mobile
- mode:cloud
- table:organization_shared_projects
- table:organization_project_access
- table:file_lineage
- table:media_assets
- table:project_knowledge_files
- table:published_artifact_versions

## Unknown

- Whether migration 0257 is applied in each environment.
- The numeric limit for the one plan whose projects limit is custom (Free is 5, most paid plans unlimited).
- Whether any screen calls the artifact version routes.
- Whether apps/cli uses sharing or versions beyond the searched route (the VS Code extension at apps/extension-vscode and Chrome extension at apps/extension do not call the sharing route).
- Whether the Library UI shows version history; the grouping helper exists but its use in a screen was not confirmed.
- How local desktop files handle versions in mode:local.
- Whether RESOURCE_RECOVERY_WINDOW_DAYS equals 30.

## Second reader's check

A second reader checked 10 statements of this page against the code: 7 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7):** "Subscription: Plan project limit via sharedProjectLimit; 0 blocks sharing (org-entitlements.ts:128)" The code shows: sharedProjectLimit is the plan's general 'projects' limit (limits?.projects) run through toEnforceableBillingPlanLimit, not a dedicated sharing limit. 'unlimited' and 'custom' become null (no cap). The page says the numbers were not read, but they are in the catalog: Free is 5, paid and max plans are 'unlimited'. (apps/web/lib/services/org-entitlements.ts:120-130; packages/contracts/types/src/billing-catalog.ts:618 (free projects: 5), :563, :584, :714; :787-790). **Corrected:** The shared-project cap reuses the plan's projects limit (Free 5, most paid plans unlimited, one plan custom); a limit of 0 (or non-numeric undefined) blocks sharing.
- **Partly wrong (section 3/8):** "surface:vscode and surface:chrome: apps/vscode and apps/chrome do not exist; unknown" The code shows: The paths are indeed absent, but the real folders are apps/extension (Chrome) and apps/extension-vscode. The page never searched them. A grep of apps/extension/src, apps/extension-vscode/src, apps/cli and apps/desktop/src for 'organization/shared' found no sharing-route call. (ls apps -> cli, desktop, extension, extension-vscode, mobile, web). **Corrected:** Chrome is apps/extension and VS Code is apps/extension-vscode. Neither calls the organization shared-projects route (searched). They are not 'unknown' for sharing.
- **Partly wrong (section 8):** "Deletion: Superseded is not deleted: only deleted_at starts the 30-day window (deletion-policies.ts:216-217); lineage deleted when either file is purged (:246-251)" The code shows: The 'only deleted_at starts the window' text is at the cited place. The window length comes from RESOURCE_RECOVERY_WINDOW_DAYS, not a literal 30 in these lines, so 30 days is not shown at these lines. The lineage deletion matches (columns child_file_id and parent_file_id). The supersedes_id child rule is 'detach', which the page omits. (apps/web/lib/resources/deletion-policies.ts:197-218, :246-251). **Corrected:** Say 'the recovery window (RESOURCE_RECOVERY_WINDOW_DAYS)' unless the constant is verified as 30. Purging an old version detaches supersedes_id on the newer row; it does not delete the newer row.

**Facts the page missed**

- The shared-project cap is the plan's general projects limit (Free 5, most paid plans unlimited, one plan custom), so most paid orgs have no sharing limit. packages/contracts/types/src/billing-catalog.ts:618,563,584,714,787-790; apps/web/lib/services/org-entitlements.ts:128.
- Chrome and VS Code live in apps/extension and apps/extension-vscode; the page searched non-existent paths and left them unknown. Neither calls the sharing route.
- The published-artifact versions GET and the restore POST are scoped to userId (owner only) via getUserScopedDb. apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:38,64-71.
