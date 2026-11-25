---
id: "F010-05"
type: "feature"
title: "Team and roles"
aliases: ["Invite member", "Invite teammate", "Change member role", "Transfer ownership", "Workspace ownership", "Team settings", "S10.13", "S10.14", "S10.15"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S10.13", "S10.14", "S10.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:team", "plan:enterprise", "api:POST /api/settings/team/invitations", "api:PATCH /api/settings/team/[memberId]", "api:POST /api/settings/organization/transfer-ownership", "table:organization_members", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-05 Team and roles

Lets a workspace admin invite people by email with a role, renew or revoke pending invitations, change a member's role after confirmation, and lets the owner hand ownership to another member after a fresh identity check. Needs a Team or Enterprise plan. Web and mobile have all three; CLI none found.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.13](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1013), [S10.14](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1014), [S10.15](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1015).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Invites people to a workspace, manages pending invitations, changes roles (Viewer, Member, Admin, Owner), and transfers the owner role while the old owner keeps a seat with a chosen lower role.

**Why it exists.** Teams need controlled access. The brief requires invite with email and role, role change with confirmation and server enforcement, and a transfer that checks identity and refuses transfer to self (doc: knowledge-base/data/area-briefs/010-modal-and-dialog-inventory.md, S10.13 to S10.15).

**Who uses it.** Workspace owners and admins on a Team or Enterprise plan.

**Problems it solves**

- Adding colleagues safely.
- Limiting what each person can do.
- Handing over a workspace when the owner leaves.

**Use cases**

- Admin invites a colleague as Member from Team settings.
- Admin renews an expired invitation.
- Admin changes a Viewer to Admin and confirms.
- Owner transfers ownership and becomes Admin.

## 2. User experience

**Where to find it**

- Web: Settings, Team section; cards 'Invite teammate' (description 'Invitations expire after 7 days.'), member list, pending invitations, and 'Workspace ownership' (apps/web/features/settings/sections/TeamSection.tsx:976,1190-1215,1405-1510).
- Desktop public window: the same web Team settings (doc: AGENTS.md section 5).
- Desktop internal Tauri CloudTeamSection has add-member and role select; not the public window (apps/desktop/src/features/settings/cloud/CloudTeamSection.tsx:45-130).
- Mobile: Settings, Workspace screen with 'Invite by email', 'Send invitation', member row role picker 'Role for <name>', 'Remove from workspace?' (apps/mobile/src/features/team/WorkspaceAdministration.tsx:112-200; apps/mobile/src/features/team/RolePickerModal.tsx:60-110; apps/mobile/app/(app)/settings/workspace.tsx:270-320).

**Before you start**

- Signed in; an admin or owner role in the workspace (TeamSection.tsx canAdminister; workspace.tsx:340-342).
- An active Team or Enterprise subscription; otherwise the server answers SUBSCRIPTION_REQUIRED (apps/web/app/api/settings/team/team-admin-access.ts:70-82).
- Free seats; web shows 'No seats are available. Revoke an invitation, remove a member, or buy more seats.' (TeamSection.tsx:1040-1046).
- Ownership transfer: only the Primary Owner, plus a step-up identity check (apps/web/app/api/settings/organization/transfer-ownership/route.ts:44-80).

**Screens and controls**

- Web invite form: field labelled 'Invitee email', select 'Invitation role' with Member role, Viewer role, Admin role (TeamSection.tsx:998-1024).
- Pending rows: 'Renew invitation for <email>' and 'Revoke invitation for <email>' buttons (TeamSection.tsx:1186-1215).
- Member row: role select, then confirm dialog 'Change member role?' with the text '<name> will become <Role>. The workspace must always retain at least one owner.' and button 'Change role' (TeamSection.tsx:1349-1362,1640-1665).
- Ownership card: 'New owner' select, 'Your role afterwards' select (Admin, Member, Viewer), button 'Transfer ownership', confirm 'Transfer ownership?' (TeamSection.tsx:1405-1510).
- Mobile role picker: radio options with permission list, a warning for ownership, buttons Cancel and 'Save role' or 'Transfer ownership' (RolePickerModal.tsx:70-130).

**Journey**

1. 1. Admin opens Team settings or the Workspace screen.
2. 2. Enters an email and role and sends the invitation; a link and delivery status are shown (web).
3. 3. Pending invitations list with Renew and Revoke.
4. 4. For a role change, picks a new role and confirms.
5. 5. For ownership, the owner picks a member and their own new role, confirms, and completes a step-up identity check.
6. 6. A success message shows ('Ownership was transferred. Your role is now ...').

**What the person sees and gets**

- Web: success status 'Ownership was transferred. Your role is now <Role>' and inline errors via role=alert (TeamSection.tsx:340-365).
- Web: invitation link with delivery status and a copy button (TeamSection.tsx:600-625).
- Mobile: invitation receipt notice and alerts such as 'The invitation was not sent', 'Could not change role', 'Could not transfer ownership' (WorkspaceAdministration.tsx:60-100,260-265; workspace.tsx:172-210).
- Server returns 'Role updated' and 'Ownership transferred' messages (apps/web/app/api/settings/team/[memberId]/route.ts:153; transfer-ownership/route.ts:112-118).

**Settings**

- Seats and the plan (Team or Enterprise) decide who can be invited (team-admin-access.ts:70-82; TeamSection.tsx:1040-1046).
- Role after transfer chosen by the owner: Admin, Member or Viewer (TeamSection.tsx:1461-1480).
- Workspace switcher to pick which workspace to administer (TeamSection.tsx:500-540).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web invite posts organization id, email and role; the server requires team admin access, creates the invitation and sends an email; renew calls resend and returns a link and delivery result (apps/web/app/api/settings/team/invitations/route.ts:92-140; TeamSection.tsx:566-640).
- Revoke asks for confirmation ('Revoke invitation?') (TeamSection.tsx:1640-1662).
- Role change: confirm dialog then PATCH /api/settings/team/[memberId] which calls changeMemberRole, audits the change and invalidates the cached active organization (apps/web/app/api/settings/team/[memberId]/route.ts:100-153).
- Ownership transfer: POST /api/settings/organization/transfer-ownership runs rate limit, CSRF, schema parse, refuses self-transfer ('You are already the owner of this organization'), requires a step-up, checks Primary Owner, locks the member list, validates the successor, then swaps roles in one transaction and writes an audit event (route.ts:19-125).
- Mobile has invite (with resend, revoke through an alert), role change and ownership transfer through the role picker with a step-up (WorkspaceAdministration.tsx:250-330; workspace.tsx:175-300).
- Non-admins: web controls need canAdminister; mobile shows a notice when the user cannot manage the team (TeamSection.tsx:1258; workspace.tsx:340-345,480).

**Incomplete**

- Mobile ownership transfer goes through the role picker choosing Owner, not a separate Transfer ownership screen (workspace.tsx:270-290).
- Brief says mobile transfer is missing; code has it. Brief says Desktop transfer not listed; the public desktop is the web page, which has it.
- Mobile role change applies without a separate confirm after the picker; the picker is the confirmation (workspace.tsx:262-290).

**Present but disconnected or switched off**

- Desktop internal CloudTeamSection (apps/desktop/src/features/settings/cloud/CloudTeamSection.tsx) posts to /api/settings/team to add a member directly; not the public window and no transfer.

**Not available**

- CLI: no team, invite, role or ownership command was found in the CLI command list read.
- VS Code and Chrome: not applicable per brief; the VS Code 'Code: Invite Friends' command was not opened and is not counted as workspace invites.

## 4. Required behaviour

**Established requirements**

- An invite dialog takes an email and role, sends the invitation, and lists pending invites to revoke or renew. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.13)
- A role dialog changes a member's role after confirmation, and the server enforces the new role. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.14)
- The owner picks another member and confirms, and ownership moves to them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.15)
- Owner/admin/member permissions are enforced through direct API requests and the UI; invite acceptance, expiry, seat limits and role changes preserve isolation. (source: (doc: docs/product/experience-contract.md, row W22))

**Acceptance criteria**

1. An admin can invite an email with a role and sees it in Pending invitations.
2. A pending invitation can be renewed and revoked; revoke asks first.
3. A role change needs confirmation and a direct API call by a non-admin is refused.
4. Transfer needs a step-up check, refuses self, and after it the new owner has owner role and the old owner the chosen role.
5. A workspace always keeps at least one owner.
6. Without a Team or Enterprise plan the controls return a subscription-required message.
7. Non-admins do not see invite or role controls.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A fresh identity check is the step-up prompt shown by StepUpDialog [inferred from requireStepUp in transfer-ownership/route.ts:44-52 and apps/web/features/auth/StepUpDialog.tsx].
- Seat accounting limits invitations [inferred from withSeatAccountingErrors and seat-ceiling test name].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document that transfer is a hidden path in the mobile role picker, or add an explicit Transfer ownership control.
- [proposed] Add CLI commands for team administration or record them as out of scope.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | TeamSection | `apps/web/features/settings/sections/TeamSection.tsx` | Web invite form, pending list, role change, ownership transfer |
| endpoint | /api/settings/team/invitations | `apps/web/app/api/settings/team/invitations/route.ts` | List (GET) and create (POST) invitations |
| endpoint | /api/settings/team/invitations/[invitationId] | `apps/web/app/api/settings/team/invitations/[invitationId]/route.ts` | Revoke and resend invitation |
| service | invitation-email | `apps/web/app/api/settings/team/invitations/invitation-email.ts` | Sends the invitation email |
| endpoint | /api/settings/team/[memberId] | `apps/web/app/api/settings/team/[memberId]/route.ts` | PATCH role, DELETE remove member |
| service | team-admin-access | `apps/web/app/api/settings/team/team-admin-access.ts` | Requires membership and a Team or Enterprise plan |
| endpoint | /api/settings/organization/transfer-ownership | `apps/web/app/api/settings/organization/transfer-ownership/route.ts` | Ownership transfer in a transaction with step-up |
| table | organization_members | `apps/web/app/api/settings/organization/transfer-ownership/route.ts` | Role column updated |
| component | StepUpDialog | `apps/web/features/auth/StepUpDialog.tsx` | Fresh identity prompt before sensitive actions |
| hook | useStepUp | `apps/web/features/settings/hooks/useStepUp.tsx` | Runs the step-up flow for settings mutations |
| component | WorkspaceRoles | `apps/web/features/workspace-console/components/WorkspaceRoles.tsx` | Workspace console role views (role change entry named in the brief; contents not read) |
| screen | Mobile Workspace screen | `apps/mobile/app/(app)/settings/workspace.tsx` | Role change, ownership transfer with step-up, remove member |
| component | WorkspaceAdministration (mobile) | `apps/mobile/src/features/team/WorkspaceAdministration.tsx` | Invite by email modal, invitation actions |
| component | RolePickerModal | `apps/mobile/src/features/team/RolePickerModal.tsx` | Role choice and ownership warning |
| service | team service (mobile) | `apps/mobile/src/features/team/service.ts` | Calls invite, role, transfer endpoints |
| component | CloudTeamSection | `apps/desktop/src/features/settings/cloud/CloudTeamSection.tsx` | Internal Tauri team settings |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin submits the invite form; the client posts organization id, email and role. | device | TeamSection.tsx:566-585 |
| Server checks rate limit, team admin access and plan, creates the invitation, sends an email and returns the token delivery status. | our servers | apps/web/app/api/settings/team/invitations/route.ts:92-140 |
| Role change PATCH is validated, access-checked, applied by changeMemberRole, audited at warning level for owner or admin roles. | our servers | apps/web/app/api/settings/team/[memberId]/route.ts:100-153 |
| Transfer: step-up identity verification, then a transaction swaps owner and outgoing roles under an advisory lock. | our servers | apps/web/app/api/settings/organization/transfer-ownership/route.ts:44-100 |
| The invitation email goes through an outside email service. | outside service | sendInvitationEmail import (invitations/route.ts:26); provider name: unknown |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Invitation (email, role, token, expiry 7 days) | invitation rows managed by the invitations route (table name unknown) | Server-side | Expires after 7 days per UI text (TeamSection.tsx:976) |
| Member role | table organization_members | Server-side | Changed in place |
| Audit events member_role_changed, member_removed | security audit log | Server-side | unknown |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account in a workspace. |
| Permissions | Admin or owner for invite and role change; Primary Owner only for transfer (transfer-ownership/route.ts:70-80). A role ceiling applies (membership-role-ceiling.ts exists; rules not read). |
| Subscription | Team or Enterprise plan required: SUBSCRIPTION_REQUIRED with requiredPlans team and enterprise (team-admin-access.ts:70-82). Seats are limited (TeamSection.tsx:1040-1046). |
| Limits and metering | Rate buckets settings-team-invitations-write, settings-team-patch, settings-org-transfer-ownership; seat accounting (invitations/route.ts:93; [memberId]/route.ts:70; transfer-ownership/route.ts:20). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable: workspace administration needs the account. Mobile shows a sign-in prompt when signed out (workspace.tsx:325-345). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No seats | Message 'No seats are available...' and invite blocked. | TeamSection.tsx:1040-1046 |
| Invite pending delivery | Link and delivery status shown with a copy button; copy failure shows a failed status. | TeamSection.tsx:600-625 |
| Self transfer | Server validation error 'You are already the owner of this organization'. | transfer-ownership/route.ts:34-37 |
| Transfer failure (mobile) | Alert 'Could not transfer ownership. Check the workspace before retrying.' | workspace.tsx:205-210 |
| Step-up cancelled | Mobile ignores the cancel and keeps the workspace unchanged. | workspace.tsx:203-207 |
| Role change failure (mobile) | Alert 'Could not change role'. | workspace.tsx:172-176 |
| Leaving as sole owner | Web offers 'Transfer and leave'. | TeamSection.tsx:296-302 |
| Account changed mid-transfer | Mobile aborts if the account epoch changed. | workspace.tsx:178-196 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/TeamSection.test.tsx`: Web team section (inferred from file name)
- `apps/web/features/settings/sections/TeamSection.membership-ownership.test.tsx`: Ownership transfer UI (inferred)
- `apps/web/app/api/settings/organization/transfer-ownership/__tests__`: Transfer route (folder exists; files not listed)
- `apps/web/app/api/settings/team/invitations/__tests__/route.lifecycle.test.ts`: Invitation lifecycle (inferred)
- `apps/web/app/api/settings/team/invitations/__tests__/route.role-ceiling.test.ts`: Role ceiling on invites (inferred)
- `apps/web/app/api/settings/team/__tests__/route.authorization.test.ts`: Team route authorization (inferred)
- `apps/web/app/api/settings/team/__tests__/route.seat-ceiling.test.ts`: Seat ceiling (inferred)
- `apps/mobile/__tests__/WorkspaceInvitationReceipt.test.tsx`: Mobile invitation receipt (inferred)
- `apps/mobile/__tests__/SecurityMutationAccountEpoch.test.ts`: Account epoch checks on mutations such as transfer (inferred)

**Test scenarios**

- **Invite and revoke**
  1. Open Team settings as admin.
  2. Invite an email as Member.
  3. Revoke the invitation and confirm.
  - Expected: Appears in pending list then disappears.
- **Role change by a non-admin**
  1. Call PATCH /api/settings/team/<id> as a Member.
  - Expected: Refused with a forbidden or subscription error.
- **Transfer ownership**
  1. As owner choose a member and Admin as your role.
  2. Confirm and pass step-up.
  - Expected: New owner has owner role; you are Admin; audit event written.
- **Transfer to self**
  1. POST the transfer with your own user id.
  - Expected: Validation error.
- **No plan**
  1. Use a Free account and open the invitations endpoint.
  - Expected: Subscription-required error naming team and enterprise.
- **Mobile role change**
  1. Open Workspace, tap a member, pick Admin, Save role.
  - Expected: Role updated after refresh.

**Where to look when it fails**

- Error code SUBSCRIPTION_REQUIRED.
- Audit event types member_role_changed and member_removed.
- Table organization_members.role.
- Log line 'Organization ownership transferred'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **CLI has no team administration commands.** Affects: CLI users. Evidence: Command list in apps/cli/src/lib.rs searched for team and invite; only agent-team flags found (lib.rs:341). Work needed: Build commands or record as out of scope.
- **Brief marks mobile transfer missing and desktop transfer unlisted; code has transfer on mobile and web.** Affects: Documentation. Evidence: apps/mobile/app/(app)/settings/workspace.tsx:175-210. Work needed: Update the brief.
- **Mobile transfer is reached only by picking Owner in the role picker; its confirmation is the picker, not a dedicated dialog.** Affects: Mobile. Evidence: workspace.tsx:270-290. Work needed: Confirm the ownership warning meets the brief's confirm rule.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:team
- plan:enterprise
- api:POST /api/settings/team/invitations
- api:PATCH /api/settings/team/[memberId]
- api:POST /api/settings/organization/transfer-ownership
- table:organization_members
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy

## Unknown

- Name of the invitation table.
- Email delivery provider.
- Whether WorkspaceRoles.tsx is a separate role-change dialog or a read view (not read).
- Role ceiling rules in membership-role-ceiling.ts.
- Test contents (only names seen).
- Whether the mobile role picker shows a second confirmation after Save role.
