---
id: "F009-03"
type: "feature"
title: "Workspace switcher and member picker"
aliases: ["Workspace switcher", "Workspace picker", "Account menu Workspace section", "Active workspace (mobile)", "Member picker", "Recipient picker", "Search by name or email", "S9.05", "S9.11"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S9.05", "S9.11"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "api:PUT /api/settings/organization/active", "api:GET /api/settings/team"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-03 Workspace switcher and member picker

Lets a person switch between their Personal space and team workspaces (Web, Desktop, Mobile), and pick workspace members by name or email when sharing a project or placing a legal hold (Web, Desktop). CLI, VS Code and Chrome have neither. Web asks first when switching would end running work.

Area: [9. Compound interface components](README.md). Requirement items: [S9.05](../../10-requirements/capabilities/009-compound-interface-components.md#s905), [S9.11](../../10-requirements/capabilities/009-compound-interface-components.md#s911).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Workspace switcher: lists 'Personal' (Only you) and an 'Enterprise' group of organization workspaces, marks the active one, and changes it. Member picker: a search field that finds workspace members by name or email, supports one or many, and accepts pasted emails.

**Why it exists.** Personal and enterprise content differ in who can read it, so the switch must be explicit and visible. Sharing and holds need a safe way to name people (brief S9.05, S9.11).

**Who uses it.** Members of team or enterprise workspaces; workspace admins; project owners sharing a project.

**Problems it solves**

- Pasting into the wrong workspace.
- Losing a half-written reply or unsaved work on a switch.
- Typing member ids or emails by hand when sharing.

**Use cases**

- Open the account menu on Web and switch from Personal to an enterprise workspace.
- On Mobile open Settings, Workspace, tap a workspace.
- Add people to a project in project sharing with 'Add people'.
- Choose 'One member' for a legal hold and pick the held member.

## 2. User experience

**Where to find it**

- Web/Desktop: account menu, submenu 'Workspace' (apps/web/shared/components/layout/AccountMenuItems.tsx:76-85; apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:129-243).
- Mobile: Settings, Workspace screen, section 'ACTIVE WORKSPACE' (apps/mobile/app/(app)/settings/workspace.tsx:420-470).
- Member picker: project sharing controls ('Add people') and workspace data controls (legal holds, 'Held member') (apps/web/features/projects/components/ProjectSharingControls.tsx:243; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:407).

**Before you start**

- Signed in.
- Organization workspaces need a team or enterprise plan: the Mobile screen says 'This needs a provisioned Team or Enterprise plan' or 'Workspaces aren't included in your plan.' (apps/mobile/app/(app)/settings/workspace.tsx:497-503).
- Member picker: manage rights in the workspace (ProjectSharingControls.tsx:243 is inside the canManage branch).

**Screens and controls**

- Web rows: 'Personal' with badge 'Only you', group label 'Enterprise', rows with the organization name and role badge, a check labelled 'Selected', row 'Manage workspaces' (WorkspaceMenuItems.tsx:28-244).
- Web confirmation: text 'Switching reloads the app in this workspace. This work does not come with you:' with a list, buttons 'Switch anyway' and 'Stay in this workspace' (WorkspaceMenuItems.tsx:112-157).
- Mobile rows as radio buttons labelled 'Switch to <name>' (workspace.tsx:441-451).
- MemberPicker: input with placeholder 'Search by name or email', option list, selected chips, paste of several emails (apps/web/shared/components/people/MemberPicker.tsx:15, :85-105, :197).

**Journey**

1. Web: open the account menu, open Workspace, click a row. If anything would be interrupted a confirmation lists it; otherwise the switch starts at once. While it runs a disabled 'Switching workspace' row shows. On success the app clears caches and reloads in the new workspace.
2. Mobile: tap a row; the app calls the server, then reloads the conversation list.
3. Member picker: type to narrow, click or press Enter to pick, remove chips to unpick; confirm with the form's own button (Add, Place hold).

**What the person sees and gets**

- 'Loading workspaces' row while the list loads (WorkspaceMenuItems.tsx:159-163).
- Failure copy 'We could not switch workspaces. Check your connection and try again.' with 'Try switching again' or 'Reload to resolve workspace status' (WorkspaceMenuItems.tsx:218-235).
- Mobile alerts 'Could not switch workspace' and 'Workspace changed' with 'Refresh your chats' (apps/mobile/src/features/team/switchWorkspace.ts:5-17).
- Member picker reports a paste notice when emails do not match any member (MemberPicker.tsx:197).

**Settings**

- None specific; workspace admission and cache scope are internal (apps/web/features/workspaces/lib/workspace-admission.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop switcher with grouping, active mark, loading and retry rows, in-progress disable, confirmation of interrupted work, cache clear and reload (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:112-243; apps/web/features/workspaces/lib/workspace-cache-scope.ts:42-62).
- Interruption kinds: unsent drafts, uploads, a reply being written, a live voice session, a browser or computer action, pending approvals, an unsaved artifact (apps/web/features/workspaces/lib/workspace-switch-interruptions.ts:54-105).
- Mobile switcher with radio rows and conversation reload (workspace.tsx:164-176; switchWorkspace.ts).
- MemberPicker used by project sharing and legal holds (ProjectSharingControls.tsx:243; WorkspaceDataControls.tsx:407).

**Incomplete**

- Mobile has no confirmation that lists work a switch would end; it switches directly (workspace.tsx:164-176).
- Mobile screen is a management screen where the switcher shows only when the account has workspaces; the entitlement card replaces management for lower plans (workspace.tsx:482-505).

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Workspace picker on CLI, VS Code, Chrome (brief S9.05; audit/partial/009-compound-interface-components.md).
- Member and recipient picker on Mobile, CLI, VS Code, Chrome (brief S9.11).

## 4. Required behaviour

**Established requirements**

- The user can see their personal and team workspaces in a list and switch the active one. (source: brief S9.05)
- The user can pick one or more people (workspace members or recipients) by name or email to share with, invite or assign. (source: brief S9.11)
- Account and workspace switching invalidates cached preferences and removes the previous account's visible and cached data. (source: doc: docs/product/experience-contract.md:774, :792)
- The active workspace is marked; a switch that would lose running work asks first and lists what will not come along; confirming reloads in the new workspace. (source: apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:112-157 (first-draft requirement, confirmed))

**Acceptance criteria**

1. The active workspace row carries the check 'Selected'; Personal is marked when scope is personal.
2. With an unsent draft, clicking another workspace shows the confirmation naming the draft; 'Stay in this workspace' changes nothing.
3. While a switch runs, every workspace row is disabled.
4. A failed list read shows a retry row; a read that cannot be trusted shows 'Reload to resolve workspace status'.
5. After a successful switch the page reloads and shows the new workspace's data only.
6. MemberPicker narrows by name or email, supports multiple selection and removing a selected person.
7. On Mobile switching to the already active workspace sends nothing (test WorkspaceSwitcher.test.tsx:175).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should warn about running work before switching, as Web does [inferred; Mobile code at workspace.tsx:164 has no check].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a MemberPicker on Mobile for sharing.
- [proposed] Add a MemberPicker test file; none was found.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | WorkspaceMenuItems | `apps/web/features/workspaces/components/WorkspaceMenuItems.tsx` | Switcher rows, confirmation, loading, retry. |
| component | AccountMenuItems | `apps/web/shared/components/layout/AccountMenuItems.tsx` | Hosts the Workspace submenu. |
| hook | useAccountWorkspaces / useSelectWorkspace | `apps/web/features/workspaces/hooks/use-workspaces.ts` | Reads workspaces, runs the guarded PUT, handles uncertain state. |
| service | workspace-switch-interruptions | `apps/web/features/workspaces/lib/workspace-switch-interruptions.ts` | Collects the list of work a switch would end. |
| service | workspace-cache-scope | `apps/web/features/workspaces/lib/workspace-cache-scope.ts` | Cancels queries, rescopes caches, clears, reloads or redirects. |
| service | workspace-admission | `apps/web/features/workspaces/lib/workspace-admission.ts` | Gates reads while the owner or workspace is unresolved. |
| schema | MANAGED_CLOUD_WORKSPACES_PATH | `packages/contracts/cloud-contracts/src/workspaces.ts` | Workspace list and select path used by the Web hook. |
| endpoint | PUT /api/settings/organization/active | `apps/web/features/workspaces/hooks/use-workspaces.ts` | Organization variant of the select request; also used by Mobile. |
| screen | Mobile Workspace settings | `apps/mobile/app/(app)/settings/workspace.tsx` | ACTIVE WORKSPACE rows, members, roles. |
| service | switchWorkspace | `apps/mobile/src/features/team/switchWorkspace.ts` | Calls setActiveWorkspace then reloads conversations. |
| service | team service | `apps/mobile/src/features/team/service.ts` | fetchWorkspaceOverview, setActiveWorkspace, fetchWorkspaceMembers. |
| component | MemberPicker | `apps/web/shared/components/people/MemberPicker.tsx` | Searchable multi or single member selector with paste of emails. |
| component | ProjectSharingControls | `apps/web/features/projects/components/ProjectSharingControls.tsx` | Uses MemberPicker label 'Add people' with an access level. |
| component | WorkspaceDataControls | `apps/web/features/workspace-console/components/WorkspaceDataControls.tsx` | Uses MemberPicker label 'Held member' for member-scope legal holds. |
| endpoint | GET/POST /api/settings/team | `apps/mobile/src/features/team/service.ts` | Member list and add used by Mobile (path seen in the client). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web loads the account's workspaces and marks the active one. | our servers | apps/web/features/workspaces/hooks/use-workspaces.ts:54 |
| Person clicks a row; the app checks for interrupting work in the browser. | device | apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:92-106 |
| After confirmation the app sends a PUT with the chosen workspace (Personal uses a selector constant) and re-reads the list. | our servers | use-workspaces.ts:114-130, :163-178 |
| The app cancels queries, rescopes caches to account and workspace, clears the query cache, and reloads or redirects. | device | apps/web/features/workspaces/lib/workspace-cache-scope.ts:42-62, :34-40 |
| Mobile PUTs the organization id then reloads conversations. | device and our servers | apps/mobile/src/features/team/service.ts:118-120; switchWorkspace.ts:5-17 |
| Member picker filters a list of members already loaded; no request while typing. | device | apps/web/shared/components/people/MemberPicker.tsx:85-87, :127 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Active workspace | Server side account state (set by the PUT) | Yes, all apps read it from the server | Persists until changed |
| Cached queries and previews per workspace | Browser query cache and scoped cache | no | Cleared on every switch (workspace-cache-scope.ts:60) |
| Member list | Loaded from the team endpoint into memory | Read-only here | Not kept after the page |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; the switch is bound to the current session owner and refuses a changed account (apps/web/features/workspaces/hooks/use-workspaces.ts:142-150; test apps/mobile/__tests__/WorkspaceSwitcher.test.tsx:183-201). |
| Permissions | Role of the person is shown on each row. Member picker is offered only to people who can manage sharing; admins manage members on Mobile (workspace.tsx:432-436). |
| Subscription | Organization workspaces need a team or enterprise plan; Mobile states this on screen (workspace.tsx:494-503). The unified AGI Subscription decision for workspaces was not traced. |
| Limits and metering | Member count and max members come back in the workspace overview (apps/mobile/src/features/team/service.ts:109-113). No other limit found. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable. |
| Provider restrictions | not applicable. |
| Local mode | Mobile shows a banner that cloud sync is blocked and offers to switch to Cloud when the app is not in cloud mode (workspace.tsx:407-411). Workspaces are a Cloud feature; Local mode has none. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading workspaces' row (Web); 'Loading your workspace…' (Mobile). | WorkspaceMenuItems.tsx:159-163; workspace.tsx:413-418 |
| Error | Retry row on Web; 'Could not load your workspace' with Retry on Mobile. | WorkspaceMenuItems.tsx:164-176; workspace.tsx:420-446 |
| Uncertain switch | Admission closes and 'Reload to resolve workspace status' replaces retry. | use-workspaces.ts:100-113, :188-200 |
| Switch in progress | Rows disabled; 'Switching workspace' row. | WorkspaceMenuItems.tsx:183, :211-217 |
| Cancel | 'Stay in this workspace' leaves everything unchanged. | WorkspaceMenuItems.tsx:147-155 |
| Already active | Click does nothing. | WorkspaceMenuItems.tsx:44-47; workspace.tsx:446 |
| Mobile chats fail to refresh | 'Workspace changed' alert; the switch is not reported as failed. | switchWorkspace.ts:12-15 |
| Accessibility | Mobile rows are radio items with checked state; Web check has aria-label 'Selected'; MemberPicker has listbox, status id and label. | workspace.tsx:447-451; WorkspaceMenuItems.tsx:61; MemberPicker.tsx:112-114 |
| Offline | not handled in the code beyond the failure rows above. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/workspaces/components/WorkspaceMenuItems.test.tsx`: Personal selected, grouping and roles, switch only when different, retry row, loading, no confirm when nothing interrupted, interruption list, decline, in-progress, failure.
- `apps/web/features/workspaces/hooks/useWorkspaces.test.tsx`: Workspace hook behaviour (not itemised).
- `apps/web/features/workspaces/lib/workspace-switch-interruptions.test.ts`: Interruption collection.
- `apps/web/features/workspaces/lib/workspace-cache-scope.test.ts`: Cache scoping on switch.
- `apps/mobile/__tests__/WorkspaceSwitcher.test.tsx`: Personal and memberships listed with active mark, persist then reload chats, partial failure, no resend of active workspace, account replacement guards.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceDataControls.release.test.tsx`: Legal hold release confirmation (member picker is on the same screen).

**Test scenarios**

- **Switch with a draft**
  1. Type an unsent message on Web.
  2. Open Workspace and click an enterprise workspace.
  - Expected: Confirmation lists the unsent message; 'Switch anyway' reloads in the new workspace.
- **Failure then retry**
  1. Block the PUT.
  2. Click a workspace.
  - Expected: Alert text and 'Try switching again'; the old workspace stays marked.
- **Mobile switch**
  1. Open Settings, Workspace.
  2. Tap a workspace.
  - Expected: Row shows the check; chat list reloads for that workspace.
- **Member search**
  1. Open project sharing as an owner.
  2. Type part of an email in 'Add people'.
  - Expected: List narrows; selecting adds a chip; Add is enabled.
- **Paste emails**
  1. Paste three emails, one not a member.
  - Expected: Two members selected and a notice about the third.

**Where to look when it fails**

- Web network: PUT workspaces path and the following GET.
- Mobile alerts 'Could not switch workspace'.
- Mobile test file names above for guarded epochs.
- No MemberPicker-specific log found.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **Mobile switches workspaces without warning about running work.** Affects: Mobile. Evidence: apps/mobile/app/(app)/settings/workspace.tsx:164-176. Work needed: Show the same kind of list of work that will not come along, or confirm there is none.
- **No workspace picker on CLI, VS Code, Chrome.** Affects: CLI, VS Code and Chrome users in team workspaces. Evidence: audit/partial/009-compound-interface-components.md (S9.05). Work needed: Decide whether those apps follow the account's active workspace and show it, or let the person switch.
- **No member picker on Mobile, CLI, VS Code, Chrome.** Affects: Mobile users sharing projects. Evidence: audit/partial/009-compound-interface-components.md (S9.11). Work needed: Build or declare Web-only.
- **MemberPicker has no test file of its own.** Affects: Web, Desktop. Evidence: No test found for apps/web/shared/components/people/MemberPicker.tsx. Work needed: Add keyboard, paste and single versus multiple tests.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- api:PUT /api/settings/organization/active
- api:GET /api/settings/team

## Unknown

- The literal path behind MANAGED_CLOUD_WORKSPACES_PATH (set from conversationContract.workspacesPath, not opened).
- Whether Mobile reaches the Workspace screen through a visible Settings row labelled 'Workspace' (apps/mobile/src/features/settings/index.tsx:451 was not opened).
- Plan names that unlock workspaces in the AGI Subscription system.
- Whether Desktop has any separate switcher; it shows the web app (doc: AGENTS.md section 5).
