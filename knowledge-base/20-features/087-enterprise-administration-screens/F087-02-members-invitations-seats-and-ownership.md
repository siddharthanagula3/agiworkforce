---
id: "F087-02"
type: "feature"
title: "Members, invitations, seats and ownership"
aliases: ["Members", "Workspace > People > Members", "Team settings", "Seats & billing", "Invite teammate", "Pending invitations", "Transfer ownership", "S87.02", "S87.03", "S87.07", "S87.08", "TeamSection"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.02", "S87.03", "S87.07", "S87.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "plan:team", "plan:enterprise", "api:GET /api/settings/team", "api:POST /api/settings/team/invitations", "api:POST /api/settings/team/invitations/accept", "api:PATCH /api/settings/team/[memberId]", "api:POST /api/settings/organization/transfer-ownership", "table:organization_invitations", "table:organization_members", "table:organizations", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "F087-03", "F087-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-02 Members, invitations, seats and ownership

Admins list workspace members, invite people by email with a role, renew or revoke pending invitations, see licensed, used and available seats, remove members and, as the Primary Owner, hand ownership to another member. Web and desktop use the hosted page; mobile has member, invitation and ownership controls.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.02](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8702), [S87.03](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8703), [S87.07](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8707), [S87.08](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8708).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists active members with role (TeamSection.tsx; api/settings/team/route.ts:68-122); creates invitations for admin, member or viewer with a 7-day link and tries to email it (invitations/route.ts:35,126-133; organization-invitation-service.ts:16); renews (resend) and revokes pending invitations ([invitationId]/route.ts:28); shows seat totals (organization-seat-service.ts:33); removes members and revokes their credentials ([memberId]/route.ts:66-98); and moves the single owner role in one database transaction (transfer-ownership/route.ts:55-94).

**Why it exists.** A shared workspace needs a controlled way to add and remove people within the seats paid for, and to hand over the one owner role without leaving the workspace ownerless.

**Who uses it.** Owners and admins; invitees accept through a link.

**Problems it solves**

- Adding someone without a seat is refused with a clear message.
- An ex-member keeps live sessions, device tokens or API keys.
- Ownership cannot be left without an owner.

**Use cases**

- Invite a colleague as viewer and copy the private link when email fails.
- Remove a departing member and read the cleanup report.
- Owner transfers ownership to an admin and becomes admin or member.
- Admin renews an expired invitation.

## 2. User experience

**Where to find it**

- Web: console 'People' > 'Members' (/workspace/people), hint 'Roles, invitations, seats' (WorkspaceConsoleNav.tsx:55-60; people/page.tsx:11-20). Also Settings > Team (TeamSection).
- Desktop: same hosted pages [inferred]; the internal desktop source also has member list, add, role and remove API calls (desktop/src/api/cloudAccountSettings.ts:723-773), UI use unknown.
- Mobile: Settings > Workspace: 'Members' list with 'Change role' and 'Remove', plus 'Seats' and 'Invite by email' (settings/workspace.tsx:596-663; WorkspaceAdministration.tsx:371-386).
- Invitee: /invite page, 'Team invitation' (app/invite/page.tsx).
- CLI, VS Code, Chrome: not available.

**Before you start**

- Team or Enterprise plan (TeamSection.tsx:676-681 shows 'Workspace administration requires a Team or Enterprise plan' otherwise).
- Invitations: members.manage permission (invitations/route.ts:54-58).
- Ownership transfer: Primary Owner, plus a fresh identity confirmation (step-up) (transfer-ownership/route.ts:41-47,77).

**Screens and controls**

- 'Seats & billing' card: licensed, used, available, premium seats, 'Change seats' or 'Review contract', 'Manage billing' (TeamSection.tsx:866-925).
- 'Invite teammate' card: 'Invitations expire after 7 days.', email box 'Invitee email', role select, send button disabled when no seats (TeamSection.tsx:976-1044).
- Private link panel with 'Copy link' and 'Dismiss invitation link'.
- 'Pending invitations' card with 'Renew invitation for <email>' and 'Revoke invitation for <email>'.
- Member rows with role, seat type select and remove.
- Ownership: 'Member to receive ownership', 'Your role after the transfer' (Member or Viewer), button 'Transfer ownership', confirm dialog 'Transfer ownership?' (TeamSection.tsx:1495-1498).
- Mobile: 'Email address', 'Send invitation', 'Resend invitation', 'Revoke invitation', RolePicker 'Transfer ownership' button (WorkspaceAdministration.tsx:150-194,303-310; RolePickerModal.tsx:121).

**Journey**

1. Open Members.
2. Type an email, choose a role, send.
3. If email was not sent, copy the private link and send it yourself.
4. Watch the invitation under 'Pending invitations'; Renew or Revoke from its row.
5. Invitee signs in with the invited address and opens the link to accept.
6. To hand over ownership: choose the successor and your role after transfer, press 'Transfer ownership', confirm; sign-in confirmation may be asked.
7. To remove a member: use the remove control and read the cleanup result.

**What the person sees and gets**

- Invitation delivery note: email sent or the reason it was not (TeamSection.tsx:1066-1085).
- 'No pending invitations.' empty state; 'Invitations could not be loaded.' with 'Try again'.
- Ownership result: 'Ownership transferred' with your new role (TeamSection.tsx:330-360).
- Removal result lists revoked sessions, device tokens and API keys and any warnings ([memberId]/route.ts:90-98).
- Mobile alerts: 'The invitation was not sent', 'Revoke this invitation?', 'Could not change role', 'Could not transfer ownership', 'Remove from workspace?'.

**Settings**

- Seat count follows billing; changing it goes through pricing and billing pages (TeamSection.tsx:915-935).
- Invitation lifetime is fixed at 7 days in code (organization-invitation-service.ts:16).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Invitation create, list, resend, revoke with role ceiling and audit event member_invited (invitations/route.ts:92-160).
- Pending invitations expire on every list and create call and by a scheduled job (organization-invitation-service.ts:65-85; vercel.json:122).
- Accept requires the signed-in email to match the invited email and creates the member inside a transaction (organization-invitation-service.ts:306-380).
- Seats: licensed and consumed counts come from the organizations row, consumption maintained by database triggers (organization-seat-service.ts:33-60; 0085_organization_seats_lifecycle.sql:24-26).
- Remove member: membership removed, then credentials revoked, with a warnings list (team/[memberId]/route.ts:46-98).
- Ownership transfer: advisory lock, Primary Owner check, successor eligibility check, two role updates in one transaction, audit event (transfer-ownership/route.ts:55-123).
- Mobile: invitations, seats, role change, removal and ownership transfer with step-up (settings/workspace.tsx:195-222).

**Incomplete**

- Pending invitations do not appear to consume a seat; the seat is consumed on acceptance (organization-invitation-service.ts:349-370; seats_consumed counts members, 0085:139-143), yet the UI says 'Revoke an invitation ... to free a seat' (TeamSection.tsx:1044) [inferred mismatch].
- Seat purchase is a link to pricing, not an in-page add (TeamSection.tsx:915-925).

**Present but disconnected or switched off**

- POST /api/settings/team adds an existing account directly as a member; whether any screen calls it was not checked (team/route.ts:94-228).

**Not available**

- CLI: no members, invitation or ownership commands found.
- Mobile: seats can be viewed (WorkspaceAdministration.tsx:371) but no purchase control was found in the files read.

## 4. Required behaviour

**Established requirements**

- An administrator can list the workspace members with name, email and role. (source: S87.02 Should)
- Invite by email with a role, see pending invitations, renew and revoke them, and the invitee can accept. (source: S87.03 Should)
- See licensed, used and available seats; members consume and release seats; seats can be added. (source: S87.07 Should)
- The owner can hand ownership to another member after confirmation, with the server moving the owner role atomically. (source: S87.08 Should)
- Invite acceptance, expiry, seat limits, role changes and member removal preserve isolation; removing access closes later reads. (source: docs/product/experience-contract.md:795 (W22))

**Acceptance criteria**

1. Inviting with role owner is refused by the schema (400).
2. A second invitation to an address with a pending one returns a conflict telling the admin to resend.
3. An invitation older than 7 days cannot be accepted and shows as expired.
4. Accepting while signed in as a different email is refused.
5. With no seats available, creating or accepting is refused with the seat message.
6. Removing a member returns a revoked-credentials summary and the member's next request is refused.
7. Ownership transfer leaves exactly one owner; a non-Primary-Owner gets 403.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Revoking a pending invitation frees nothing if invitations hold no seat; the hint text should match behaviour [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the seat hint match the real rule, or reserve a seat per pending invitation.
- [proposed] Show cleanup warnings on mobile removal instead of only a generic alert.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Members page | `apps/web/app/workspace/people/page.tsx` | Console page hosting TeamSection. |
| component | TeamSection | `apps/web/features/settings/sections/TeamSection.tsx` | Seats, invite form, pending list, member list, ownership and leave flows. |
| endpoint | GET/POST /api/settings/team | `apps/web/app/api/settings/team/route.ts` | Member list (emails hidden without permission) and direct add. |
| endpoint | GET/POST /api/settings/team/invitations | `apps/web/app/api/settings/team/invitations/route.ts` | List with seats; create invitation and email. |
| endpoint | POST/DELETE /api/settings/team/invitations/[invitationId] | `apps/web/app/api/settings/team/invitations/[invitationId]/route.ts` | Resend (renew) and revoke. |
| endpoint | POST /api/settings/team/invitations/accept | `apps/web/app/api/settings/team/invitations/accept/route.ts` | Invitee accepts. |
| endpoint | PATCH/DELETE /api/settings/team/[memberId] | `apps/web/app/api/settings/team/[memberId]/route.ts` | Change role and remove member with credential cleanup. |
| endpoint | POST /api/settings/organization/transfer-ownership | `apps/web/app/api/settings/organization/transfer-ownership/route.ts` | Atomic ownership move with step-up. |
| service | organization-invitation-service | `apps/web/lib/services/organization-invitation-service.ts` | Create, expire, resend, revoke, accept, decline. |
| service | organization-seat-service | `apps/web/lib/services/organization-seat-service.ts` | Seat state and seat or owner error translation. |
| service | organization-member-admin-service | `apps/web/lib/services/organization-member-admin-service.ts` | changeMemberRole, removeMember, owner invariant. |
| service | deprovision-service | `apps/web/lib/services/deprovision-service.ts` | Revokes sessions, device tokens and API keys on removal. |
| service | membership role ceiling | `apps/web/app/api/settings/team/membership-role-ceiling.ts` | Blocks granting a role above the actor's own permissions. |
| component | TeamInvitationAcceptance | `apps/web/features/teams/components/TeamInvitationAcceptance.tsx` | Invitee accept or decline page. |
| job | expire-organization-invitations cron | `apps/web/app/api/cron/expire-organization-invitations` | Scheduled expiry of pending invitations. |
| table | organization_invitations | `apps/web/db/neon/0085_organization_seats_lifecycle.sql` | Invitation rows with token hash and status. |
| table | organization_members | `apps/web/db/neon/0085_organization_seats_lifecycle.sql` | Membership, role, seats trigger source. |
| screen | Mobile workspace screen | `apps/mobile/app/(app)/settings/workspace.tsx` | Member list, role change, removal, ownership transfer. |
| component | Mobile WorkspaceAdministration | `apps/mobile/src/features/team/WorkspaceAdministration.tsx` | Invite sheet, pending list, seats. |
| component | Mobile RolePickerModal | `apps/mobile/src/features/team/RolePickerModal.tsx` | Role choice and ownership consequence text. |
| service | Mobile team service | `apps/mobile/src/features/team/service.ts` | Member list, role patch, ownership transfer, removal calls. |
| service | Mobile administration client | `apps/mobile/src/features/team/administration.ts` | Invitation calls and link builder. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin submits email and role; the route validates (role admin, member or viewer), checks Team plan and members.manage, applies the role ceiling. | our servers | invitations/route.ts:96-117 |
| A transaction locks the workspace members, expires old invitations, refuses existing members and duplicate pending invitations, and inserts a hashed token with a 7-day expiry. | our servers | organization-invitation-service.ts:149-214 |
| An email is sent through an outside email service when possible; the response carries the token and delivery result so the admin can copy the link. | our servers | invitations/route.ts:126-160 (email provider not read: unknown) |
| Invitee opens the link, signs in with the invited address; accept updates the invitation and inserts the member in one transaction, then provisions the seat's usage ledger. | our servers | organization-invitation-service.ts:306-395 |
| Role change or removal: lock, authority check, owner invariant, update or delete; removal then revokes credentials. | our servers | organization-member-admin-service.ts:268-340; team/[memberId]/route.ts:46-98 |
| Ownership transfer: step-up check, lock, Primary Owner check, successor check, owner role moved atomically, audit event. | our servers | transfer-ownership/route.ts:41-123 |
| Mobile calls the same endpoints, wrapping the transfer in a step-up prompt. | device and our servers | apps/mobile/app/(app)/settings/workspace.tsx:211-222 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Invitation (email, role, token hash, status, expiry) | table organization_invitations | Server only | Status changes to expired, revoked, accepted or declined; deletion policy unknown |
| Membership and seat count | tables organization_members and organizations | Server only | Row removed on member removal; seat count follows by trigger |
| Audit events member_invited, member_removed, member_role_changed | audit trail via recordAuditEvent (table enterprise_audit_events read by posture) | Server only | Per audit retention; not read here |

**Models and providers.** No model or provider takes part. An outside email service sends the invitation; its identity was not read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in member of the workspace; invitee must sign in with the invited email. |
| Permissions | members.manage for invitations and role changes; Primary Owner for ownership transfer; member list readable by any active member with emails hidden unless the permission allows (team/route.ts:94-110). A role-ceiling check stops granting roles above one's own permissions (membership-role-ceiling.ts:27-52). Owner cannot be set through role change (organization-member-admin-service.ts:285). |
| Subscription | Team, Team premium or Enterprise plan for every admin route (team-admin-access.ts:70-84). Seats come from the billing agreement or an unprovisioned default. |
| Limits and metering | Rate-limit buckets settings-team-invitations-list, -write, settings-team-list, -delete, -patch. Seat ceiling enforced by a database constraint (organization-seat-service.ts:61-66). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable. Membership is a cloud workspace feature; Local inference needs neither seats nor a workspace. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not on Team plan | Card 'Workspace administration requires a Team or Enterprise plan' with 'Choose Team seats'. | TeamSection.tsx:676-693 |
| No seats | Invite button disabled; text 'No seats are available. Revoke an invitation, remove a member, or buy more seats.' | TeamSection.tsx:1029-1044 |
| Empty | 'No pending invitations.' | TeamSection.tsx:1155 |
| Invitations load error / retry | 'Invitations could not be loaded.' with 'Try again'. | TeamSection.tsx:1046-1155 (pending card) |
| Email not delivered | Private link shown with reason; mobile shows 'Invitation created, email not sent' with Copy and Share. | TeamSection.tsx:1066-1085; WorkspaceAdministration.tsx:71-106 |
| Clipboard blocked | 'Copy is unavailable in this browser.' | TeamSection.tsx:1046-1110 (copy status) |
| Expired or reused link | 404 'This invitation link is invalid, expired, or already used'. | organization-invitation-service.ts:324-326 |
| Credential cleanup partial | Removal succeeds but warnings are returned; audit outcome failure, severity critical. | team/[memberId]/route.ts:76-98 |
| Ownership outcome uncertain | Web shows 'Workspace outcome unconfirmed'. | TeamSection.tsx:330-333 |
| Offline | not handled in the code beyond error alerts. | searched TeamSection.tsx and WorkspaceAdministration.tsx; no offline handling found |
| Accessibility | Controls carry aria-labels such as 'Invitee email' and 'Revoke invitation for <email>'; mobile buttons have accessibilityLabel. | TeamSection.tsx:998,1204; settings/workspace.tsx:630 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/team/invitations/__tests__/route.lifecycle.test.ts`: Invitation lifecycle, by file name.
- `apps/web/app/api/settings/team/invitations/__tests__/route.role-ceiling.test.ts`: Role ceiling on invite, by file name.
- `apps/web/app/api/settings/team/[memberId]/__tests__/route.owner-invariant.test.ts`: Owner invariant, by file name.
- `apps/web/app/api/settings/team/[memberId]/__tests__/route.role-ceiling.test.ts`: Role ceiling on role change.
- `apps/web/app/api/settings/team/__tests__/route.seat-ceiling.test.ts`: Seat ceiling.
- `apps/web/app/api/settings/team/__tests__/route.authorization.test.ts`: Authorization.
- `apps/web/app/api/settings/team/__tests__/route.cross-org-isolation.test.ts`: Isolation between workspaces.
- `apps/web/lib/services/__tests__/organization-invitation-service.test.ts`: Invitation service.
- `apps/web/lib/services/__tests__/organization-member-admin-service.test.ts`: Member admin service.
- `apps/web/features/settings/sections/TeamSection.test.tsx`: Team screen.
- `apps/web/features/settings/sections/TeamSection.membership-ownership.test.tsx`: Leave and ownership flows.
- `apps/web/app/api/settings/organization/__tests__/route.self-leave-step-up.test.ts`: Step-up on leave.
- `apps/web/features/teams/components/TeamInvitationAcceptance.test.tsx`: Accept page.
- `apps/web/db/neon/organization-seats-lifecycle-migration.test.ts`: Seat migration.
- `apps/mobile/__tests__/WorkspaceInvitationReceipt.test.tsx`: Mobile undelivered invitation notice.
- `apps/mobile/__tests__/WorkspaceSwitcher.test.tsx`: Workspace switching.

**Test scenarios**

- **Invite and accept**
  1. As admin invite a new email as viewer.
  2. Sign in as that email and open the link.
  - Expected: Member appears with role viewer; pending list empties; seats used rises by one.
- **Wrong email accepts**
  1. Open an invitation link signed in as another address.
  - Expected: Refusal asking to sign in with the invited address.
- **Seat limit**
  1. Fill all licensed seats.
  2. Try to invite.
  - Expected: Button disabled; direct API call returns the seat conflict.
- **Removal cleanup**
  1. Give a member a device token and API key.
  2. Remove the member.
  - Expected: Response lists revoked counts; their next request is refused.
- **Ownership transfer**
  1. As Primary Owner open Transfer ownership, pick an admin, confirm, complete step-up.
  - Expected: Chosen member is owner, you hold the chosen role, exactly one owner; as a non-owner the call returns 403.
- **Expiry**
  1. Create an invitation, advance time past 7 days, list invitations.
  - Expected: Status becomes expired and acceptance fails.

**Where to look when it fails**

- Log 'Organization invitation created', 'Team member removed', 'Organization ownership transferred'.
- Errors: seat ceiling and ownerless messages in organization-seat-service.ts:89-110.
- Tables: organization_invitations, organization_members, organizations (seats_consumed).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)
- Mobile: [70-qa/test-plans/mobile/087-enterprise-administration-screens.md](../../70-qa/test-plans/mobile/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **Seat hint says revoking an invitation frees a seat, but invitations seem not to hold seats.** Affects: Admins on web. Evidence: TeamSection.tsx:1044 versus seats_consumed counting members at 0085:139-143. Work needed: Verify in the database and align text or behaviour.
- **No CLI support for any of these actions.** Affects: CLI users. Evidence: no CLI references found. Work needed: Product decision.
- **Mobile removal cannot show which credentials were not cleaned.** Affects: Mobile admins. Evidence: team/service.ts:179-187 returns only cleanupComplete. Work needed: Surface warning detail.
- **Seat purchase is not in-page on web and not found on mobile.** Affects: Admins. Evidence: TeamSection.tsx:915-925 links to pricing. Work needed: Confirm the intended path for 'seats can be added'.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- plan:team
- plan:enterprise
- api:GET /api/settings/team
- api:POST /api/settings/team/invitations
- api:POST /api/settings/team/invitations/accept
- api:PATCH /api/settings/team/[memberId]
- api:POST /api/settings/organization/transfer-ownership
- table:organization_invitations
- table:organization_members
- table:organizations
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- F087-03
- F087-01

## Unknown

- Which email service sends invitation mail and how failures are retried.
- Whether POST /api/settings/team has any UI caller.
- Retention of invitation rows after acceptance or expiry.
- Whether pending invitations hold seats in the database (counting rule seen only for members).
- Tests were identified by name; their assertions were not opened.
