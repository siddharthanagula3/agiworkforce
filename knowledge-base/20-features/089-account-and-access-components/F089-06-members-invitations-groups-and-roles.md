---
id: "F089-06"
type: "feature"
title: "Members, invitations, groups and roles"
aliases: ["Membership service", "Invitation service", "Group service", "Role and permission service", "Additional roles", "Workspace People and Roles console (S89.12 to S89.15)"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.12", "S89.13", "S89.14", "S89.15"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-connectors-plugins-and-skills", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:team", "plan:team_premium", "plan:enterprise", "table:organization_members", "table:organization_invitations", "table:organization_roles", "table:scim_groups", "api:POST /api/settings/organization/invitations", "api:PATCH /api/settings/team/{memberId}", "api:DELETE /api/settings/team/{memberId}", "api:POST /api/settings/team/invitations/accept", "F089-05", "F089-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-06 Members, invitations, groups and roles

Admins on a team plan invite people by email, change roles, remove members, manage groups, and build custom roles. Nobody can grant a permission they do not hold themselves. Removing a member also cuts off that member's workspace sessions, device tokens and API keys. Invitation tokens are stored only as hashes.

Area: [89. Account and access components](README.md). Requirement items: [S89.12](../../10-requirements/capabilities/089-account-and-access-components.md#s8912), [S89.13](../../10-requirements/capabilities/089-account-and-access-components.md#s8913), [S89.14](../../10-requirements/capabilities/089-account-and-access-components.md#s8914), [S89.15](../../10-requirements/capabilities/089-account-and-access-components.md#s8915).

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

**What it does.** Adds, changes and removes members; creates, resends, revokes and accepts invitations; manages workspace groups and group roles; defines built-in and custom roles and checks permissions with an escalation ceiling.

**Why it exists.** A team needs controlled access: who is in, what they can do, and a guarantee that delegation cannot raise anyone above the person delegating.

**Who uses it.** Workspace owners and admins; people holding custom roles; invitees.

**Problems it solves**

- A role holding only members.manage cannot promote someone to a role with more permissions than the actor (apps/web/app/api/settings/team/membership-role-ceiling.ts:22-36).
- A leaked invitation database does not reveal usable links (hash only) (apps/web/lib/services/organization-invitation-service.ts:20-37).
- A removed member loses live access, not only the seat (apps/web/lib/services/deprovision-service.ts:176-250).

**Use cases**

- An admin invites a colleague as viewer; the colleague accepts from the email link.
- An owner creates a custom role 'Billing reader' with a few permissions and gives it to a member.
- An admin builds a workspace group and sets its members and roles.
- An admin removes a leaver and sees how many sessions, device tokens and keys were revoked.

## 2. User experience

**Where to find it**

- Web: workspace console links 'Members' (/workspace/people), 'Roles' (/workspace/roles), 'Identity' (/workspace/identity) (WorkspaceConsoleNav.tsx:51-67); Settings, Team (/settings/team).
- Web Roles page cards 'Roles' and 'Additional roles' (apps/web/features/workspace-console/components/WorkspaceRoles.tsx:237-243, 482-486).
- Mobile: team administration for invitations, role change, remove, transfer (apps/mobile/src/features/team/administration.ts:98-187; service.ts:132-185).
- Desktop: cloud team section (apps/desktop/src/api/cloudAccountSettings.ts:723-773).

**Before you start**

- A team plan (team, team_premium, enterprise) for team administration (team-admin-access.ts:63-75).
- Admin or a role holding the needed permission (for example roles.manage, members.manage).
- An available licensed seat to add or accept (organization-seat-service.ts:76-83).

**Screens and controls**

- Role editor labels 'Role name', 'Permissions. You can only grant what your own role holds.', buttons 'Create role' and 'Save role' (WorkspaceRoles.tsx:158-211).
- Additional roles card text: 'A member keeps their membership role and gains every permission of each role checked here.' (WorkspaceRoles.tsx:484-486).
- Invitation roles allowed: admin, member, viewer (organization/invitations/route.ts:40-44).
- Group card: workspace groups are editable; groups from an identity provider are read-only with 'Change it there.' (organization-role-service.ts:530-537 conflict message).

**Journey**

1. Admin opens Members and enters an email and role.
2. Server checks the role ceiling, seat room, creates a 7 day invitation, emails the link.
3. Invitee opens the link and accepts or declines.
4. On accept the server adds the membership, makes that workspace active, and writes a member_joined audit event.
5. Admin later changes a role or removes the member; removal triggers deprovisioning.

**What the person sees and gets**

- Invitation created: 201 with invitation, inviteToken and delivery result (organization/invitations/route.ts:92-125).
- Refusals: 'The <Role> role carries permissions you do not hold yourself: ...' (membership-role-ceiling.ts:50-57); 'You cannot grant permissions you do not hold yourself: ...' and 'Only the Primary Owner can hold ..., so no role can carry it.' (organization-role-service.ts:86-107).
- Removal result lists revoked sessions, device tokens, API keys and warnings (team/[memberId]/route.ts:90-98).
- Card error line 'Could not complete this workspace role action. Try again.' (WorkspaceRoles.tsx:104).

**Settings**

- INVITATION_TTL_MS is 7 days; MAX_INVITATION_RESENDS is 10 (organization-invitation-service.ts:16-17).
- memberId has the form organizationId:userId (team/[memberId]/route.ts parseMemberId).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Two route families: /api/settings/team (list, add, role change, remove, invitations create, list, resend, revoke, accept) and /api/settings/organization/{members,invitations,groups,roles} which also accept workspace API-key callers (organization/invitations/route.ts:55-90).
- Invitation: random 32-byte token, SHA-256 hash stored, expiry, resend count, revoke, list pagination; accept supports decline (organization-invitation-service.ts:20-37; team/invitations/accept/route.ts:60-99).
- Role changes and removals need team admin access and CSRF; removal runs deprovisionMember (team/[memberId]/route.ts:38-100).
- Deprovision revokes provider sessions only when the workspace was the member's active one, workspace device refresh families, Ask-from-Siri tokens, and workspace API keys, reporting errors as warnings (deprovision-service.ts:100-250).
- Groups: workspace-source groups stored in scim_groups can be created, renamed, deleted, given members and roles; directory groups are read-only (organization-role-service.ts:516-640).
- Custom roles: create, update, delete with permission ceiling and primary-owner-only permission guard (organization-role-service.ts:86-250).
- Membership role ceiling check on invite and role change (membership-role-ceiling.ts:22-60).
- Seat ceiling and last-owner protection become friendly 409 errors (organization-seat-service.ts:76-100).

**Incomplete**

- Draft cites organization-permission-service.ts:95-108 as calling assertPermissionsWithinActor; that file's function at line 95 is requireMemberPermission and assertPermissionsWithinActor lives in organization-role-service.ts:86.
- Plan limits beyond the seat count were not verified in this area.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Group and role administration screens on Mobile, Desktop, CLI, VS Code, Chrome: not found (only team list, invite, role, remove, transfer on Mobile and Desktop clients).

## 4. Required behaviour

**Established requirements**

- A membership service adds, changes and removes members, and removal revokes that member's workspace access and credentials. (source: brief S89.12)
- An invitation service creates, lists, expires, revokes and accepts invitations with hashed tokens. (source: brief S89.13)
- A group service manages groups of members and maps groups to roles. (source: brief S89.14)
- A role/permission service defines built-in and custom roles, checks member permissions, and prevents escalation beyond the actor's own rights. (source: brief S89.15)
- Never weaken permissions or trust boundaries to make a change pass. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. An invitation token is never stored; only its SHA-256 hash is in organization_invitations.
2. An invitation older than 7 days cannot be accepted.
3. An 11th resend of one invitation is refused.
4. A member holding members.manage but not a role's permissions cannot assign that role (403 with the permission list).
5. Creating a custom role with a permission the actor lacks returns 403 naming it.
6. A permission only the primary owner may hold returns a validation error saying so.
7. Removing a member ends that member's workspace device tokens and API keys and reports counts.
8. Removing or demoting the last owner returns the 'Transfer ownership' conflict.
9. Adding a member beyond licensed seats returns the 409 seat message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Accepting needs a verified email match with the invitee; acceptInvitation receives userEmail, but the matching rule was not read [inferred; unknown].
- A member removed from workspace A keeps personal-account sessions [inferred from deprovision comment on sessionsBelongToWorkspace].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show role and group administration on Desktop and Mobile, or state it is web-only in the brief.
- [proposed] Show the revocation counts returned by removal in every app's confirmation.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | /api/settings/team (GET, POST) | `apps/web/app/api/settings/team/route.ts` | List and add members. |
| endpoint | /api/settings/team/{memberId} (PATCH, DELETE) | `apps/web/app/api/settings/team/[memberId]/route.ts` | Change role, remove member. |
| endpoint | /api/settings/team/invitations (GET, POST) and /{invitationId} (POST resend, DELETE revoke) | `apps/web/app/api/settings/team/invitations/route.ts` | Invitation lifecycle (resend and revoke in [invitationId]/route.ts). |
| endpoint | POST /api/settings/team/invitations/accept | `apps/web/app/api/settings/team/invitations/accept/route.ts` | Accept or decline. |
| endpoint | /api/settings/organization/invitations (GET, POST), /{invitationId} (DELETE) | `apps/web/app/api/settings/organization/invitations/route.ts` | Workspace-API-key capable invitations. |
| endpoint | /api/settings/organization/members and /{userId} | `apps/web/app/api/settings/organization/members/route.ts` | Member list, read, patch, delete. |
| endpoint | /api/settings/organization/groups, /{groupId}, /{groupId}/members, roles, managers | `apps/web/app/api/settings/organization/groups/route.ts` | Group management (members PUT sets members). |
| endpoint | /api/settings/organization/roles and /{roleId} | `apps/web/app/api/settings/organization/roles/route.ts` | Role list, create, update, delete. |
| service | organization-invitation-service | `apps/web/lib/services/organization-invitation-service.ts` | Token hashing, expiry, create, accept. |
| service | organization-role-service | `apps/web/lib/services/organization-role-service.ts` | Roles, groups, member role grants, escalation guard. |
| service | organization-permission-service | `apps/web/lib/services/organization-permission-service.ts` | Resolve member permissions; requireMemberPermission. |
| service | organization-member-admin-service | `apps/web/lib/services/organization-member-admin-service.ts` | changeMemberRole, removeMember, key role guard. |
| service | membership-role-ceiling | `apps/web/app/api/settings/team/membership-role-ceiling.ts` | Membership role ceiling and denied audit. |
| service | deprovision-service | `apps/web/lib/services/deprovision-service.ts` | Cuts off sessions, device tokens, intent tokens, API keys on removal. |
| service | organization-seat-service | `apps/web/lib/services/organization-seat-service.ts` | Seat ceiling errors. |
| component | WorkspaceRoles | `apps/web/features/workspace-console/components/WorkspaceRoles.tsx` | Roles, additional roles and group UI. |
| hook | use-workspace-roles | `apps/web/features/workspace-console/hooks/use-workspace-roles.ts` | Data hooks for roles and groups. |
| service | mobile team administration | `apps/mobile/src/features/team/administration.ts` | Invitation calls. |
| service | desktop team calls | `apps/desktop/src/api/cloudAccountSettings.ts` | Team list, add, role, remove. |
| table | organization_members, organization_invitations, organization_roles, organization_member_roles, organization_group_roles, scim_groups | `apps/web/lib/services/organization-role-service.ts` | Core tables (group members and managers in organization_group_members and organization_group_managers). |
| schema | organization permissions and built-in roles | `packages/contracts/types` | BUILT_IN_ORGANIZATION_ROLES, escalation detection (imported in membership-role-ceiling.ts:3-10). |
| event | member_invited, member_joined, member_role_changed, member removal audit events | `apps/web/app/api/settings/organization/invitations/route.ts` | Audit trail. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin submits an invite; the server checks CSRF, rate limit, caller, role ceiling. | our servers | organization/invitations/route.ts:60-92 |
| Server creates a token and stores its hash with a 7 day expiry; then sends the link by email through the email provider. | our servers | organization-invitation-service.ts:20-37; invitations/route.ts:101-110 (email sending) |
| Invitee posts the token; the server accepts inside a transaction with seat accounting, sets the active workspace, audits member_joined. | our servers | team/invitations/accept/route.ts:60-99; organization-invitation-service.ts:12 import of persistProvenActiveWorkspaceSelection |
| Role change or removal checks team admin access and CSRF; removal runs deprovisionMember and clears the member's active-organization cache. | our servers | team/[memberId]/route.ts:38-100, 140-146 |
| Provider sessions are revoked through the identity provider for members whose active workspace was this one. | outside service | deprovision-service.ts:100-150 |
| Role create or update checks every requested permission against the actor's set before writing. | our servers | organization-role-service.ts:86-117 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Invitation (email, role, status, token hash, expiry, resend count) | table organization_invitations | Server | Status moves pending, accepted, revoked, expired; row retention unknown. |
| Membership and role | table organization_members | Server | Deleted on removal. |
| Custom roles and grants | tables organization_roles, organization_member_roles, organization_group_roles | Server | Role delete is guarded when held (isHeld logic in WorkspaceRoles.tsx:227-229). |
| Workspace groups | table scim_groups (source 'workspace') with organization_group_members | Server | Deleted by deleteWorkspaceGroup. |

**Models and providers.** No AI model. Email provider sends invitations; identity provider ends member sessions.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account that is an active member of the workspace. |
| Permissions | Team admin access for team and member routes; console permissions such as roles.manage for roles, members.manage for membership, view levels for groups; Primary Owner only permissions are ungrantable to roles (organization-role-service.ts:86-107). |
| Subscription | Team administration requires a plan with team_admin: team, team_premium, enterprise; failure is SUBSCRIPTION_REQUIRED 403 (team-admin-access.ts:63-75). Seat availability from licensed seats. |
| Limits and metering | Licensed seats ceiling; invitation list page size 1 to 100, default 20; 10 resends; group name up to 255 characters (organization-role-service.ts:516). Rate limits 'settings-team-invitations-*', 'settings-team-patch', 'settings-team-delete'; values unknown. |
| Feature flags | none found in the code for these routes. |
| Model compatibility | Not model-dependent. |
| Provider restrictions | Invitations use the email provider; session cut-off uses the identity provider. |
| Local mode | Needs our servers. Local inference does not depend on workspace roles in the code read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Seat ceiling | 409 with seat message. | organization-seat-service.ts:76-83 |
| Last owner | 409 'Transfer ownership to another member before removing or demoting the organization owner.' | organization-seat-service.ts:84-88 |
| Second owner | 409 pointing to the transfer flow. | organization-seat-service.ts:89-93 |
| Provider group | Edit refused: 'This group comes from your identity provider. Change it there.' | organization-role-service.ts:530-537 |
| Escalation attempt | 403 and an audit row outcome 'denied' with severity critical on self-grant. | membership-role-ceiling.ts:38-48 |
| Partial deprovision | Removal succeeds with warnings; audit outcome failure and critical severity when errors exist. | team/[memberId]/route.ts:72-98 |
| Members read fails | Error line in the Additional roles card. | WorkspaceRoles.tsx:488-491 |
| Expired invitation | List expires pending invitations before returning. | organization/invitations/route.ts:67 |
| Offline / retry | not handled in the code read. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/organization-invitation-service.test.ts`: Invitation lifecycle and token hashing.
- `apps/web/app/api/settings/team/invitations/__tests__/route.lifecycle.test.ts`: Invitation route lifecycle.
- `apps/web/app/api/settings/team/invitations/__tests__/route.role-ceiling.test.ts`: Role ceiling on invites.
- `apps/web/app/api/settings/team/__tests__/route.authorization.test.ts`: Team route authorization.
- `apps/web/app/api/settings/team/__tests__/route.seat-ceiling.test.ts`: Seat ceiling.
- `apps/web/app/api/settings/team/__tests__/route.cross-org-isolation.test.ts`: Cross-workspace isolation.
- `apps/web/app/api/settings/team/__tests__/team-admin-access.test.ts`: Plan gate.
- `apps/web/lib/services/__tests__/organization-role-service.test.ts`: Roles, groups, escalation.
- `apps/web/lib/services/__tests__/organization-permission-service.test.ts`: Permission resolution.
- `apps/web/lib/services/__tests__/deprovision-service.test.ts`: Member cut-off.
- `apps/web/lib/services/__tests__/deprovision-coverage.test.ts`: Cut-off coverage of credential kinds.
- `apps/web/app/api/settings/organization/roles/__tests__/route.test.ts`: Roles route.
- `apps/web/app/api/settings/organization/groups/__tests__/route.view-level.test.ts`: Group view level.
- `apps/web/app/api/settings/organization/invitations/__tests__/route.test.ts`: Organization invitations route.

**Test scenarios**

- **Hashed token**
  1. Create an invitation
  2. Read the invitation row
  - Expected: Row has token_hash only; the raw token appears only in the response and email.
- **Escalation refused**
  1. Give a member a custom role with only members.manage
  2. As that member invite someone as admin
  - Expected: 403 'The Admin role carries permissions you do not hold yourself'.
- **Custom role ceiling**
  1. As a member lacking a permission, create a role including it
  - Expected: 403 'You cannot grant permissions you do not hold yourself'.
- **Removal cut-off**
  1. Give a member a workspace API key and a device token
  2. Remove the member
  - Expected: Both are revoked; response counts them.
- **Seat ceiling**
  1. Fill all licensed seats
  2. Invite or accept one more
  - Expected: 409 seat message.
- **Expiry**
  1. Age an invitation past 7 days
  2. Accept it
  - Expected: Refused.

**Where to look when it fails**

- Audit events member_invited, member_joined, member_invitation_declined, member_role_changed (denied) and removal events.
- Log 'Team member role updated'.
- Tables organization_invitations, organization_members, organization_roles, scim_groups.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Group and role administration exists only on web.** Affects: Desktop, Mobile and other apps. Evidence: only team list, invite, role and remove calls found in apps/mobile/src/features/team and apps/desktop/src/api/cloudAccountSettings.ts. Work needed: Decide scope; add or document web-only.
- **Citation in the first draft pointed at the wrong file for the escalation guard.** Affects: Documentation accuracy. Evidence: organization-role-service.ts:86 holds assertPermissionsWithinActor. Work needed: Use the corrected citation.
- **Plan limits other than seats not verified.** Affects: Team plans. Evidence: brief says 'not verified in this area'. Work needed: Trace entitlement checks for roles and groups.
- **Two parallel route families for invitations and members.** Affects: Maintenance and clients. Evidence: team/invitations and organization/invitations both exist. Work needed: Document which clients use which; consider consolidating [proposed].

**Depends on**

- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-connectors-plugins-and-skills
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:team
- plan:team_premium
- plan:enterprise
- table:organization_members
- table:organization_invitations
- table:organization_roles
- table:scim_groups
- api:POST /api/settings/organization/invitations
- api:PATCH /api/settings/team/{memberId}
- api:DELETE /api/settings/team/{memberId}
- api:POST /api/settings/team/invitations/accept
- F089-05
- F089-02

## Unknown

- Invitee email matching rule on accept (acceptInvitation body not read).
- Retention of invitation rows.
- Exact permission names beyond those seen (roles.manage, members.manage).
- Which clients use /api/settings/organization/members versus /api/settings/team.
- Plan limits on groups and roles.
