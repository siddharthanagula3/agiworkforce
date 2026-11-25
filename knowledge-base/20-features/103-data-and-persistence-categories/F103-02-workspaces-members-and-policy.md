---
id: "F103-02"
type: "feature"
title: "Workspaces, members and policy"
aliases: ["Organizations and workspaces (S103.03)", "Memberships and roles (S103.04)", "Preferences and policy versions (S103.05)", "organizations", "organization_members", "organization_admin_policies", "workspace revision", "user_settings"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.03", "S103.04", "S103.05"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "surface:web", "table:organizations", "table:organization_members", "table:organization_admin_policies", "table:organization_policy_revisions", "table:user_settings"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-02 Workspaces, members and policy

The server records for workspaces (organizations), who belongs to each with which role, the workspace policy, and each person's personal preferences. Every change to policy, roles or role grants adds one revision to a per-workspace counter, so clients can tell whether they are looking at the latest state. All of it runs on our servers.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.03](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10303), [S103.04](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10304), [S103.05](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10305).

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

**What it does.** Stores organizations and their members with roles owner, admin, member or viewer (apps/web/db/neon/0015_organizations.sql:1), custom roles and grants, the admin policy and related policies, and a per-user preferences document (apps/web/db/neon/0028_user_settings.sql:7).

**Why it exists.** So a team can run under shared rules (privacy mode, sync per app, memory, sharing, retention) with a recorded history of rule changes, and so one person's personal settings follow them across apps. Brief items S103.03, S103.04 and S103.05 require durable storage and classification (doc: knowledge-base/data/area-briefs/103-data-and-persistence-categories.md).

**Who uses it.** Workspace owners and admins, members, and any person using personal settings.

**Problems it solves**

- Knowing who may change workspace rules (apps/web/app/api/settings/organization/policy/route.ts:226)
- Stopping two admins from silently overwriting each other, using one revision counter with If-Match (apps/web/lib/server/workspace-revision.ts)
- Finding every workspace table at workspace erasure (apps/web/lib/server/organization-erasure.ts:33)
- Keeping personal settings per account, grouped by page (apps/web/db/neon/0028_user_settings.sql:7)

**Use cases**

- A person creates a workspace and becomes its owner.
- An admin turns off memory for the workspace; the policy revision number goes up.
- An admin gives a member a custom role; the same counter records it.
- A person changes a personal setting on one app and the same value is read on another.

## 2. User experience

**Where to find it**

- Web: Settings pages /settings/team, /settings/general, /settings/privacy and the admin console (apps/web/app/settings; apps/web/features/admin/pages/AdminConsolePage.tsx). Exact visible labels of the workspace policy screens: unknown, not opened.
- Desktop, Mobile, CLI, VS Code, Chrome: they read workspace policy through the API (policy flags allow_cli_cloud_sync, allow_vscode_cloud_sync, allow_chrome_cloud_sync exist in apps/web/lib/services/organization-policy-service.ts:376). Visible screens: unknown.

**Before you start**

- Signed-in account.
- Creating a workspace: the person must not already own one (apps/web/app/api/settings/organization/route.ts:302).
- Changing policy needs the permission policy.manage (apps/web/app/api/settings/organization/policy/route.ts:226).

**Screens and controls**

- Create, rename, delete workspace (POST, PATCH, DELETE on /api/settings/organization).
- Members list and per-member role or removal (apps/web/app/api/settings/organization/members/[userId]/route.ts).
- Roles and groups screens (apps/web/app/api/settings/organization/roles).
- Policy read and patch (apps/web/app/api/settings/organization/policy/route.ts).
- Personal preferences read and save by namespace (apps/web/app/api/settings/preferences/route.ts).

**Journey**

1. 1. Person creates a workspace; the server inserts the organization and an owner membership and makes it the active workspace.
2. 2. Owner invites or manages members and assigns roles.
3. 3. Admin opens policy, reads it with its revision, edits and saves with the revision they saw.
4. 4. Server stores the new policy and the revision counter moves up.
5. 5. Other admins and clients see the new revision on their next read.

**What the person sees and gets**

- Creating a second workspace by the same owner returns: 'You already own a workspace. Switch to it from the account menu.' (apps/web/app/api/settings/organization/route.ts:302).
- A person without permission gets: 'Your workspace role does not allow changing workspace policy.' (apps/web/app/api/settings/organization/policy/route.ts:226).
- Policy responses carry canManagePolicy, currentUserRole and revision, and the x-workspace-revision header with an ETag like W/"wsrev-N" (policy/route.ts:192-206; apps/web/lib/server/workspace-revision.ts).
- Member role changes write the audit event 'member_role_changed' (apps/web/app/api/settings/organization/members/[userId]/route.ts).

**Settings**

- Admin policy fields: default privacy mode, allowed privacy modes, managed compute, chat sync surfaces, per-app cloud sync, audit export, retention days and enforcement, external sharing, memory (apps/web/lib/services/organization-policy-service.ts:376).
- Extra policy fields stored in metadata: secret handling, MFA, monthly spend cap, zero data retention, product analytics, IP allow list, controls (organization-policy-service.ts:376).
- Personal preferences by namespace, with a stored version number (apps/web/app/api/settings/preferences/route.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Workspace creation inserts organizations and an owner row in one transaction and sets the active workspace (apps/web/app/api/settings/organization/route.ts:321).
- upsertOrganizationPolicy writes the admin policy and clears the cached IP allow list for that workspace (apps/web/lib/services/organization-policy-service.ts:376).
- A database trigger appends one revision row for every write to the admin, model and connector policies, overrides, roles, member roles and group roles (apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql:112-165).
- The policy read reports the latest revision (apps/web/lib/services/organization-policy-service.ts:70; apps/web/lib/server/workspace-revision.ts).
- If-Match with the revision tag is honoured; a caller that sends none, or '*', is allowed (apps/web/lib/server/workspace-revision.ts).
- Custom roles are created, updated and deleted with a check that the actor cannot grant permissions they do not hold (apps/web/lib/services/organization-role-service.ts:86).
- Deleting a role can reassign its members and groups to a replacement role (apps/web/lib/services/organization-role-service.ts:236).
- Preferences are stored as one jsonb document per user in namespaces (apps/web/db/neon/0028_user_settings.sql:7).
- Workspace erasure lists members, policies, overrides and revisions (apps/web/lib/server/organization-erasure.ts:33,83,84).

**Incomplete**

- Preferences GET and PUT also gate on workspace memory and tool-approval policy, so a preference can be refused by workspace rules (apps/web/app/api/settings/preferences/route.ts). The full list of namespaces: unknown.

**Present but disconnected or switched off**

- Migration 0201 (revisions) carries the header 'NOT YET APPLIED : draft only' (apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql:4). Code reads organization_policy_revisions already, so a database without it would fail the policy read. Applied state: unknown.

**Not available**

- Revision history is only a counter with source table and actor; no stored copy of the old policy values was found (0201 table has revision, source, changed_by_user_id).

## 4. Required behaviour

**Established requirements**

- Organizations/workspaces are durably stored and classified. (source: S103.03)
- Memberships and role grants are durably stored and classified. (source: S103.04)
- User preferences and workspace policy (with revision history) are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.05)
- Every write to policy, roles or role grants appends one row to organization_policy_revisions. (source: apps/web/lib/server/workspace-revision.ts)
- Policy changes require the policy.manage permission. (source: apps/web/app/api/settings/organization/policy/route.ts:226)

**Acceptance criteria**

1. Create a workspace: one organization row and one owner member row exist and it is the active workspace.
2. A second create by the same owner is refused with the 'already own a workspace' message.
3. A member without policy.manage who patches policy gets a 403.
4. After a policy patch, the revision in the next read is higher by at least one.
5. A patch with an old If-Match tag is refused (behaviour on mismatch: confirm in the route test).
6. Workspace erasure removes member and policy rows (organization-erasure test).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A role change and a policy change both bump the same counter, so a client holding an old revision sees a conflict for either [inferred from workspace-revision.ts comment].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep the previous policy values with each revision so an admin can see what changed and restore it.
- [proposed] Show the revision number and author in the policy screen.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | organizations | `apps/web/db/neon/0015_organizations.sql` | Workspace row: name, unique slug, creator. |
| table | organization_members | `apps/web/db/neon/0015_organizations.sql` | Membership with role and provisioning source. |
| table | organization_admin_policies | `apps/web/lib/services/organization-policy-service.ts` | One admin policy row per workspace. |
| table | organization_policy_revisions | `apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql` | Append-only revision counter written by trigger. |
| table | organization_roles / organization_member_roles / organization_group_roles | `apps/web/lib/services/organization-role-service.ts` | Custom roles and their grants. |
| table | user_settings | `apps/web/db/neon/0028_user_settings.sql` | Per-user preferences document. |
| endpoint | /api/settings/organization | `apps/web/app/api/settings/organization/route.ts` | Get, create, rename, delete workspace. |
| endpoint | /api/settings/organization/members | `apps/web/app/api/settings/organization/members/route.ts` | Member list. |
| endpoint | /api/settings/organization/members/[userId] | `apps/web/app/api/settings/organization/members/[userId]/route.ts` | Read, change role, remove a member; writes audit events. |
| endpoint | /api/settings/organization/policy | `apps/web/app/api/settings/organization/policy/route.ts` | Read and patch workspace policy with revision. |
| endpoint | /api/settings/organization/roles | `apps/web/app/api/settings/organization/roles/route.ts` | Role management. |
| endpoint | /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Personal preferences read and write. |
| service | organization-policy-service | `apps/web/lib/services/organization-policy-service.ts` | Reads, layers, diffs, simulates and upserts policy. |
| service | organization-role-service | `apps/web/lib/services/organization-role-service.ts` | Roles, groups and grants. |
| service | workspace-revision | `apps/web/lib/server/workspace-revision.ts` | Reads the revision, builds and checks If-Match tags. |
| service | organization-erasure | `apps/web/lib/server/organization-erasure.ts` | Lists tables removed or anonymised on workspace erasure. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies workspace and policy tables (lines 188-208). |
| component | AdminConsolePage | `apps/web/features/admin/pages/AdminConsolePage.tsx` | Admin screen (labels not opened). |
| component | WorkspaceDeletionPage | `apps/web/features/admin/pages/WorkspaceDeletionPage.tsx` | Workspace deletion UI. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin app screen sends a policy patch with the revision tag it last saw. | device and our servers | apps/web/app/api/settings/organization/policy/route.ts:226 |
| Server checks policy.manage, merges and upserts the policy row. | our servers | apps/web/lib/services/organization-policy-service.ts:376 |
| Database trigger appends a revision row. | our servers | apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql:112 |
| Server returns the new policy and revision header. | our servers | apps/web/app/api/settings/organization/policy/route.ts:321-331 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Workspace, members, roles | organizations, organization_members and role tables | Read by all apps through the API; no device copy found. | Removed or anonymised at workspace erasure (apps/web/lib/server/organization-erasure.ts:33). |
| Policy and revisions | organization_admin_policies, organization_policy_revisions | Read through the policy endpoint. | Policy and revision tables are in the erasure list (apps/web/lib/server/organization-erasure.ts:38,84). |
| Personal preferences | user_settings | One document per account; apps read it by namespace. | Classified in the manifest (apps/web/lib/services/deletion-manifest.ts:189). |

**Models and providers.** No model takes part. Policy fields such as default privacy mode and allow_managed_compute decide where chats may run, covered by SYS-execution-boundaries.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required. |
| Permissions | Policy edit needs policy.manage. Roles cannot grant permissions the actor lacks (apps/web/lib/services/organization-role-service.ts:86). Member roles are owner, admin, member, viewer (apps/web/db/neon/0015_organizations.sql:10). |
| Subscription | Workspace creation passes purchased seats and plan tier into the organization row (apps/web/app/api/settings/organization/route.ts:302). Which plan allows a workspace: unknown. |
| Limits and metering | One owned workspace per person (apps/web/app/api/settings/organization/route.ts:302). Other limits: none found in the code opened. |
| Feature flags | none found in the code opened. |
| Model compatibility | Policy has a model policy table in the revision list; model limits are covered by SYS-model-catalog-and-routing. |
| Provider restrictions | Connector and model policies are revisioned with the admin policy (apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql:155-163). |
| Local mode | Workspace policy can restrict cloud sync per app and managed compute (apps/web/lib/services/organization-policy-service.ts:376). How Local mode on each app obeys it: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Second workspace by same owner | Conflict error with message. | apps/web/app/api/settings/organization/route.ts:302 |
| No permission | Forbidden error with message. | apps/web/app/api/settings/organization/policy/route.ts:226 |
| Caller sends no If-Match | Allowed, no conflict check. | apps/web/lib/server/workspace-revision.ts |
| Malformed If-Match | Validation error naming the expected format. | apps/web/lib/server/workspace-revision.ts |
| Preferences payload invalid | Validation error 'Invalid settings payload'. | apps/web/app/api/settings/preferences/route.ts |
| Role deleted with members | Members can move to a replacement role in the same transaction. | apps/web/lib/services/organization-role-service.ts:236 |
| Offline or timeout | not handled in the code opened (server side). | apps/web/app/api/settings/organization/policy/route.ts opened; no retry or offline logic seen |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/__tests__/route.creation.test.ts`: Workspace creation.
- `apps/web/app/api/settings/organization/__tests__/route.deletion.test.ts`: Workspace deletion.
- `apps/web/app/api/settings/organization/policy/__tests__/route.test.ts`: Policy read and patch.
- `apps/web/app/api/settings/organization/members/__tests__/route.test.ts`: Members.
- `apps/web/app/api/settings/organization/roles/__tests__/route.test.ts`: Roles.
- `apps/web/lib/services/__tests__/organization-owner-protection.test.ts`: Owner cannot be removed.
- `apps/web/lib/services/__tests__/organization-permission-service.test.ts`: Permission resolution.
- `apps/web/app/api/settings/preferences/__tests__`: Preferences route (folder exists).
- `apps/web/db/neon/organization-permission-grid-migration.test.ts`: Permission migration.

**Test scenarios**

- **Create workspace**
  1. Sign in a test account with no workspace.
  2. Create a workspace.
  3. Create a second one.
  - Expected: First succeeds with owner role; second refused with the 'already own' message.
- **Revision moves**
  1. Read policy and note revision.
  2. Patch the policy.
  3. Change a member role.
  4. Read policy again.
  - Expected: Revision increases after each write.
- **Permission refusal**
  1. Sign in as a member without policy.manage.
  2. Patch policy.
  - Expected: 403 with the role message.
- **Stale write**
  1. Read policy revision N.
  2. Patch from another session.
  3. Patch from the first with If-Match for N.
  - Expected: The stale write is refused; confirm exact status in the route test.
- **Preference round trip**
  1. Save a preference in a namespace on one app.
  2. Read it from another app.
  - Expected: Same value and a higher version.

**Where to look when it fails**

- organization_policy_revisions rows (source, changed_by_user_id).
- Audit event member_role_changed.
- Response header x-workspace-revision.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Revisions record that a change happened, not the old values.** Affects: Admins on web. Evidence: apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql:103-109. Work needed: Decide whether history of values is required and add it.
- **Migration 0201 marked not applied.** Affects: All apps. Evidence: apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql:4. Work needed: Confirm the ledger.
- **Per-app display of workspace policy not verified.** Affects: Desktop, Mobile, CLI, VS Code, Chrome. Evidence: Brief status 'platform' only. Work needed: Trace each app's policy reads.

**Depends on**

- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- surface:web
- table:organizations
- table:organization_members
- table:organization_admin_policies
- table:organization_policy_revisions
- table:user_settings

## Unknown

- Whether migration 0201 is applied in production.
- Visible labels of the workspace policy screens.
- The full list of preference namespaces.
- Which plans allow a workspace.
- Exact status code on a stale If-Match write.
- How desktop, mobile, CLI, VS Code and Chrome apply workspace policy.
