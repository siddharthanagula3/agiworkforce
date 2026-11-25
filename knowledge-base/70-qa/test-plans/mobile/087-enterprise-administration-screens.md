---
id: "PLAN-mobile-087"
type: "test-plan"
title: "Mobile · 87. Enterprise administration screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "87"
---
# Mobile · 87. Enterprise administration screens

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S87.01 Organization overview.

- **Expected:** An administrator opens an organization overview that summarises the workspace (name, plan, members/seats, security posture) from live data.
- **Code:** done. Evidence present: apps/mobile/src/features/team/WorkspaceAdministration.tsx:392; apps/mobile/src/features/team/WorkspaceAdministration.tsx:416; apps/mobile/src/features/team/administration.ts:185; apps/mobile/app/(app)/settings/workspace.tsx:666
- **Where to find it:** Settings > Account > Workspace (the row labelled "Workspace"), then the screen titled "Workspace" (labels found in the code)
- **Needs:** a cloud account that is an owner or admin of a Team or Enterprise workspace; phone width
- **Steps:**
  1. Sign in with a cloud account that is an owner or admin of a Team or Enterprise workspace.
  2. Open Settings and tap the row "Workspace" in the "Account" section.
  3. On the "Workspace" screen, look at the top card: the workspace name, its plan label, the line "N of M seats used" and the line "You are <role>".
  4. Scroll down to the "Workspace administration" block and look at the "Seats and invitations" section and the security groups below it.
  5. Compare with Expected: name, plan, members/seats and security posture should all be on screen and match the live workspace.

## S87.02 Member directory.

- **Expected:** An administrator can list the workspace members with name, email and role.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/workspace.tsx:600; apps/mobile/src/features/team/service.ts:132; apps/mobile/src/features/settings/index.tsx:450 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Workspace, then the "Members" list on the "Workspace" screen (labels found in the code)
- **Needs:** an owner or admin account in a workspace with at least two members (a second account in the same workspace helps); phone width
- **Steps:**
  1. Sign in with an owner or admin account in a workspace that has more than one member.
  2. Open Settings, tap "Workspace" in the "Account" section.
  3. Scroll to the "Members" heading.
  4. Check each member row shows the name (your own row ends with " (you)"), the email under it, and the role title such as "Owner".
  5. Compare with Expected: every member should appear with name, email and role.

## S87.03 Invitations.

- **Expected:** An administrator can invite people by email with a role, see pending invitations, renew and revoke them, and the invitee can accept.
- **Code:** done. Evidence present: apps/mobile/src/features/team/WorkspaceAdministration.tsx:150; apps/mobile/src/features/team/WorkspaceAdministration.tsx:304; apps/mobile/src/features/team/administration.ts:151; apps/mobile/src/features/team/administration.ts:176
- **Where to find it:** Settings > Account > Workspace > "Workspace administration" block > "Invite by email" row. Pending invitations are the rows under "Seats and invitations" (labels found in the code)
- **Needs:** an owner or admin account; a second email address for the invitee; a seat available in the workspace
- **Steps:**
  1. Sign in with an owner or admin account and open Settings > "Workspace".
  2. Scroll to "Workspace administration" and tap the row "Invite by email".
  3. In the "Invite by email" sheet, type an email address, pick a role, then tap "Send invitation".
  4. Look at the "Seats and invitations" list: the new invitation appears as a row with the email, and its value shows the role and expiry (for example "Member · <date>").
  5. Tap a pending invitation row: choose "Resend invitation" or "Revoke invitation". Revoke asks "Revoke this invitation?" with "Cancel" and "Revoke". Compare with Expected: invite, see pending, renew, revoke.
  6. Accepting is done by the invitee: open the invitation email on a second account and follow the link. The acceptance step was not traced in this scope.

## S87.05 Roles.

- **Expected:** An administrator sees the workspace roles with their permissions and can change a member's role, enforced by the server.
- **Code:** done. Evidence moved: apps/mobile/src/features/team/RolePickerModal.tsx:46; apps/mobile/app/(app)/settings/workspace.tsx:233; apps/mobile/app/(app)/settings/workspace.tsx:160 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Workspace > Members list > "Change role" under a member > role picker titled "Role for <name>" (labels found in the code)
- **Needs:** an owner or admin account and a second member in the same workspace
- **Steps:**
  1. Sign in with an owner or admin account in a workspace with another member.
  2. Open Settings > "Workspace" and find a member row that is not yourself.
  3. Tap "Change role" under that member, then look at the sheet titled "Role for <name>" and read the radio options and the permissions list shown under the chosen role.
  4. Pick a different role and tap "Save role". Look at the member row: the role title should now show the new role.
  5. Compare with Expected: the roles and their permissions are shown, and the change sticks after reloading the screen. Owner is only offered to the current owner.

## S87.08 Owner transfer.

- **Expected:** The owner can hand ownership to another member after confirmation, with the server moving the owner role atomically.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/workspace.tsx:203 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Workspace > Members list > "Change role" under another member > choose Owner > "Transfer ownership" (labels found in the code)
- **Needs:** the current owner account of a Team or Enterprise workspace and a second member; a way to complete the verification step
- **Steps:**
  1. Sign in as the current owner of a workspace that has another member.
  2. Open Settings > "Workspace", tap "Change role" under another member.
  3. In "Role for <name>", tap the Owner option. Read the warning text that appears: it says the member takes over billing and every admin control, and that only they can give ownership back.
  4. Tap "Transfer ownership" and complete the verification step if one appears.
  5. Compare with Expected: after confirmation, the member row shows the role "Owner", and your own row no longer shows the owner role.
