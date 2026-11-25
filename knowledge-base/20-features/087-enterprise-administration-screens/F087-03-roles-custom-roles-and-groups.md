---
id: "F087-03"
type: "feature"
title: "Roles, custom roles and groups"
aliases: ["Roles", "Workspace > People > Roles", "Additional roles", "Custom roles", "Groups", "Directory groups", "Role picker", "Change role", "S87.04", "S87.05", "S87.06", "WorkspaceRoles"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.04", "S87.05", "S87.06"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "plan:team", "plan:enterprise", "api:GET /api/settings/organization/roles", "api:PATCH /api/settings/team/[memberId]", "api:GET /api/scim/v2/Groups", "table:organization_roles", "table:organization_member_roles", "table:organization_group_roles", "table:scim_groups", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "F087-02", "F087-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-03 Roles, custom roles and groups

Admins see built-in and custom roles with what each allows, change a member's role, build custom roles from permission sets, grant extra roles to members, and manage groups. Workspace-made groups are edited in the console; identity-provider groups are read-only and synced by SCIM. Server checks stop granting more than one holds.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.04](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8704), [S87.05](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8705), [S87.06](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8706).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The Roles page lists roles and who holds them, creates, edits and deletes custom roles (max 50), grants additional roles to members, and creates, renames, deletes workspace groups, sets group members, group roles and group managers (roles/route.ts; organization-role-service.ts:39,126,236,390,546,621,739). Basic role change (admin, member, viewer) is done from the Members screen and the mobile role picker through PATCH team/[memberId] (team/[memberId]/route.ts:22-25).

**Why it exists.** Enterprises need least privilege beyond three fixed roles, and need directory groups to carry access.

**Who uses it.** Owners and admins with roles.manage or groups.manage.

**Problems it solves**

- Giving a person narrow admin rights without full admin.
- Granting access by group rather than person.
- An admin handing out permissions they do not hold.

**Use cases**

- Create an 'Auditor' role with audit view permission and give it to a member.
- Create a workspace group and give it a role.
- Change a member from viewer to member on the phone.
- Move holders to another role before deleting a custom role.

## 2. User experience

**Where to find it**

- Web: console 'People' > 'Roles' (/workspace/roles), hint 'Permissions, custom roles, groups' (WorkspaceConsoleNav.tsx:61-66; roles/page.tsx).
- Role change: member rows in Members (TeamSection.tsx:1315 region) and mobile 'Change role' (settings/workspace.tsx:630).
- Desktop: hosted web pages [inferred].
- Mobile: role picker only; no custom roles or groups.
- CLI, VS Code, Chrome: not available.

**Before you start**

- Team or Enterprise plan, owner/admin console access (workspace-access.ts:29-30).
- roles.manage to create, edit, delete roles and grant them; groups.manage for groups (roles/route.ts:76-79; groups/route.ts:54-57).

**Screens and controls**

- 'Roles' card with 'How roles and groups work' link; custom role form with permission checkboxes, 'Create role' or 'Save role', 'Delete role' confirm (WorkspaceRoles.tsx:239-302,211).
- 'Additional roles' card with 'Save roles' (WorkspaceRoles.tsx:484,466).
- 'Groups' card with 'New group name', 'Create group', 'Rename', 'Delete group', members editor and 'Save group' (WorkspaceRoles.tsx:556-639,783).
- Mobile 'Change role' opens the role picker with 'Save role' or 'Transfer ownership' (RolePickerModal.tsx:121).

**Journey**

1. Open Roles; read built-in roles and permission descriptions.
2. Create a custom role: name, description, tick permissions, 'Create role'.
3. Open Additional roles, choose a member, tick roles, 'Save roles'.
4. Create a group, add members, give it roles.
5. For a basic change use Members, pick the new role.

**What the person sees and gets**

- 'Loading roles…' spinner, error line with 'Try again'.
- Delete confirm names the role and refuses while held unless a replacement is chosen (organization-role-service.ts:236-260).
- Refusal messages such as 'You cannot grant or remove a role carrying permissions you do not hold: ...'.
- Mobile alert 'Could not change role'.

**Settings**

- Permission list shown is the grantable set; Primary Owner only permissions are listed separately and cannot be put in custom roles (roles/route.ts:57-58).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Roles list with grantable permissions and holders (roles/route.ts:38-63).
- Create, update, delete custom roles with idempotency key, optimistic version and audit event (roles/route.ts:74-134; role-schema.ts).
- Escalation checks: actor must hold every permission being granted (organization-role-service.ts:326-370).
- Permissions take effect: the database function organization_member_permissions unions the built-in role, custom member roles and SCIM group roles (0200_organization_permission_grid.sql:272-324, redefined later in 0234, 0248, 0272).
- Workspace-managed groups: create, rename, delete, set members; directory groups refuse edits with 'This group comes from your identity provider. Change it there.' (organization-role-service.ts:541).
- Group role grants allowed to groups.manage or a group manager (groups/[groupId]/roles/route.ts:36-45).
- Mobile role picker calls the same PATCH route.

**Incomplete**

- Role change at the API accepts the value owner but rejects it with a conflict pointing to transfer (organization-member-admin-service.ts:283-286).
- Custom roles are not assignable from the mobile app.

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI: no roles or groups commands found.
- Chrome, VS Code: not applicable.

## 4. Required behaviour

**Established requirements**

- An administrator can see workspace groups with their members, create or sync groups, and grant roles or permissions to a group. (source: S87.04 Should)
- An administrator sees roles with permissions and can change a member's role, enforced by the server. (source: S87.05 Should)
- An administrator can create, edit and delete a custom role and assign it to members or groups, and the permissions take effect. (source: S87.06 Should)
- Permission checks hold through direct API calls and the UI. (source: docs/product/experience-contract.md:795 (W22))

**Acceptance criteria**

1. A custom role carrying members.manage alone cannot promote its holder to admin.
2. A member with the new custom role can call an endpoint that needs its permission and cannot call others.
3. Deleting a role held by someone is refused until a replacement role is named.
4. Renaming a directory group is refused with the identity-provider message.
5. Creating a 51st custom role returns a conflict.
6. PATCH role owner returns a conflict that points to ownership transfer.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Group membership by SCIM must also confer the group's roles; the SQL function joins scim_group_members, so it does [inferred from the function].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the mobile role picker show custom roles read-only.
- [proposed] Show the effective permission list for a member in the picker.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Roles page | `apps/web/app/workspace/roles/page.tsx` | Console page for roles. |
| component | WorkspaceRoles | `apps/web/features/workspace-console/components/WorkspaceRoles.tsx` | Roles, additional roles and groups UI. |
| hook | use-workspace-roles | `apps/web/features/workspace-console/hooks/use-workspace-roles.ts` | Queries and mutations for roles, groups and diagnosis. |
| endpoint | GET/POST /api/settings/organization/roles | `apps/web/app/api/settings/organization/roles/route.ts` | List and create roles. |
| endpoint | PATCH/DELETE /api/settings/organization/roles/[roleId] | `apps/web/app/api/settings/organization/roles/[roleId]/route.ts` | Edit and delete a custom role. |
| schema | CustomRoleSchema | `apps/web/app/api/settings/organization/roles/role-schema.ts` | Validation of role body, permission list and version. |
| endpoint | PUT /api/settings/organization/members/[userId]/roles | `apps/web/app/api/settings/organization/members/[userId]/roles/route.ts` | Set a member's additional roles. |
| endpoint | GET/POST /api/settings/organization/groups | `apps/web/app/api/settings/organization/groups/route.ts` | List and create groups. |
| endpoint | PATCH/DELETE groups/[groupId] | `apps/web/app/api/settings/organization/groups/[groupId]/route.ts` | Rename and delete workspace groups. |
| endpoint | GET/PUT groups/[groupId]/members | `apps/web/app/api/settings/organization/groups/[groupId]/members/route.ts` | Read and set group members. |
| endpoint | PUT groups/[groupId]/roles | `apps/web/app/api/settings/organization/groups/[groupId]/roles/route.ts` | Set group roles. |
| endpoint | PUT groups/[groupId]/managers | `apps/web/app/api/settings/organization/groups/[groupId]/managers/route.ts` | Set group managers. |
| service | organization-role-service | `apps/web/lib/services/organization-role-service.ts` | Role and group logic, escalation check. |
| service | membership-role-ceiling | `apps/web/app/api/settings/team/membership-role-ceiling.ts` | Role ceiling for membership roles. |
| endpoint | PATCH /api/settings/team/[memberId] | `apps/web/app/api/settings/team/[memberId]/route.ts` | Basic role change. |
| schema | Permission catalogue | `packages/contracts/types/src/enterprise/permissions.ts` | Permission names, grantable set, Primary Owner only set, built-in roles. |
| table | organization_roles / organization_member_roles / organization_group_roles | `apps/web/db/neon/0200_organization_permission_grid.sql` | Role storage and permission function. |
| table | scim_groups / organization_group_members | `apps/web/db/neon/0314_workspace_managed_groups.sql` | Workspace-managed groups and members. |
| endpoint | SCIM Groups | `apps/web/app/api/scim/v2/Groups/route.ts` | Identity provider group sync. |
| component | Mobile RolePickerModal | `apps/mobile/src/features/team/RolePickerModal.tsx` | Role choice on the phone. |
| screen | Mobile workspace screen | `apps/mobile/app/(app)/settings/workspace.tsx` | Applies role changes (lines 179-190). |
| component | TeamSection role control | `apps/web/features/settings/sections/TeamSection.tsx` | Role select on member rows. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page loads roles; route needs console access and returns roles, holders (if view level), revision and grantable permissions. | our servers | roles/route.ts:38-63 |
| Create or edit role: CSRF, permission roles.manage, validated body, optional idempotency key, escalation check, audit event admin_policy_changed. | our servers | roles/route.ts:74-134 |
| Grant roles to member or group: transaction compares what is added or removed to the actor's own permissions; a refused attempt is reported. | our servers | organization-role-service.ts:326-370,621-700 |
| Effective permissions are computed in the database from role, extra roles and SCIM group roles on every permission check. | our servers | 0200_organization_permission_grid.sql:272-324; organization-permission-service.ts:48-60 |
| Basic role change: lock, authority and ceiling checks, owner invariant, update. | our servers | organization-member-admin-service.ts:268-322 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Custom roles, member role grants, group role grants | tables organization_roles, organization_member_roles, organization_group_roles | Server only | Deleting a role reassigns or requires reassignment first (organization-role-service.ts:236-260) |
| Workspace groups and members | tables scim_groups (source workspace) and organization_group_members | Server only; directory groups synced from the provider | Workspace groups deleted on request |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace member with console access. |
| Permissions | roles.manage, groups.manage, members.manage; a group manager may set the roles of their group; actor must hold the permissions being granted; Primary Owner only permissions cannot be granted (roles/route.ts:57-58; organization-role-service.ts:326-370). |
| Subscription | Team or Enterprise (requireTeamAdminAccess in workspace-access.ts:29). Directory-sourced groups need Enterprise SCIM (see F087-04). |
| Limits and metering | At most 50 custom roles per workspace (organization-role-service.ts:39); group name 1 to 255 characters (organization-role-service.ts:516). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable; roles are cloud workspace data. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading roles…' | WorkspaceRoles.tsx:810 |
| Error | Error line and 'Try again'. | WorkspaceRoles.tsx:814-826 |
| Concurrent edit | Role version conflict: 'The role changed while this write was in flight.' | organization-role-service.ts:224-231 |
| Role still held | Delete refused until replacement named. | organization-role-service.ts:248-256 |
| Duplicate group name | Conflict 'A group with that name already exists.' | organization-role-service.ts:561 |
| Escalation attempt | 403 with the missing permissions, reported as an alert event. | organization-role-service.ts:355-370 |
| Empty roles/groups | not established in this pass. | WorkspaceRoles.tsx groups section was not read to its empty branch |
| Offline / retry | not handled beyond Try again. | WorkspaceRoles.tsx:814-826 shows only a refetch button |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/workspace-console/components/__tests__/WorkspaceRoles.test.tsx`: Roles UI.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceRoles.groupMembers.test.tsx`: Group member editing.
- `apps/web/app/api/settings/organization/roles/__tests__/route.test.ts`: Roles route.
- `apps/web/app/api/settings/organization/roles/__tests__/role-version-and-deletion.test.ts`: Versioning and deletion.
- `apps/web/app/api/settings/organization/roles/__tests__/permission-alias-migration.test.ts`: Permission alias migration.
- `apps/web/app/api/settings/organization/groups/__tests__/route.view-level.test.ts`: Group listing by view level.
- `apps/web/lib/services/__tests__/organization-role-service.test.ts`: Role service.
- `apps/web/app/api/settings/team/[memberId]/__tests__/route.role-ceiling.test.ts`: Role ceiling on role change.
- `packages/contracts/types/src/__tests__/enterprise-permissions.test.ts`: Permission catalogue.
- `apps/web/app/api/scim/v2/__tests__/scim-group-credential-revocation.test.ts`: SCIM group effects.

**Test scenarios**

- **No self-promotion**
  1. Create a custom role with members.manage only.
  2. As its holder PATCH another member to admin.
  - Expected: 403 listing permissions beyond the holder's.
- **Custom role takes effect**
  1. Create a role with audit view.
  2. Grant it to a member.
  3. As that member read the audit trail, then try changing policy.
  - Expected: Audit read works; policy change is refused.
- **Delete held role**
  1. Delete a role held by a member without naming a replacement.
  - Expected: Conflict message with holder counts.
- **Directory group is read-only**
  1. Try to rename a SCIM-sourced group.
  - Expected: Refused with the identity-provider message.
- **Group grants access**
  1. Create a workspace group with a role, add a member, then check the member's permissions.
  - Expected: Member gains the role's permissions; removal from the group removes them.
- **Mobile role change**
  1. On mobile open Members, Change role, pick viewer.
  - Expected: Role updates; error alert on refusal.

**Where to look when it fails**

- Audit events admin_policy_changed, member_role_changed (denied), scim_group_role_mapping_changed.
- Role grant escalation alert via role-grant-escalation-alert.
- Tables listed in implementation map.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)
- Mobile: [70-qa/test-plans/mobile/087-enterprise-administration-screens.md](../../70-qa/test-plans/mobile/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **Mobile has no custom role or group management.** Affects: Mobile admins. Evidence: mobile team files only call PATCH role (team/service.ts:155-160). Work needed: Product decision.
- **CLI has none.** Affects: CLI. Evidence: no references. Work needed: Product decision.
- **Empty and failure states for groups not confirmed.** Affects: Web. Evidence: not read. Work needed: Check WorkspaceRoles groups section.
- **The brief names 'sync groups'; sync is only through the SCIM endpoint, with no console sync button found.** Affects: Admins. Evidence: groups/route.ts has create; sync via scim/v2/Groups/route.ts. Work needed: Clarify brief wording.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- plan:team
- plan:enterprise
- api:GET /api/settings/organization/roles
- api:PATCH /api/settings/team/[memberId]
- api:GET /api/scim/v2/Groups
- table:organization_roles
- table:organization_member_roles
- table:organization_group_roles
- table:scim_groups
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- F087-02
- F087-04

## Unknown

- The exact built-in role permission lists (not printed here).
- Empty-state copy for groups and roles.
- Whether the Members screen role select blocks 'owner' in the UI.
- Test assertions were not opened.
