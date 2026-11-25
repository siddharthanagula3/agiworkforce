---
id: "F005-02"
type: "feature"
title: "Switch between modes and workspaces"
aliases: ["Mode and workspace switcher", "Home and Code switch", "Workspace menu", "Personal and Enterprise workspaces", "Local and Cloud toggle (mobile)", "Account switcher (mobile)", "S5.02 S5.03 S5.04"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S5.02", "S5.03", "S5.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:local", "mode:cloud", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "api:PUT /api/settings/organization/active", "file:apps/web/features/workspaces/components/WorkspaceMenuItems.tsx", "F005-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-02 Switch between modes and workspaces

Controls that move the person between product areas and scopes. Web has a Home and Code switch and a workspace sub-menu (Personal or Enterprise). Mobile has a Local and Cloud toggle in the drawer, a workspace list in Settings, and a Switch account screen when sign-in allows several accounts. CLI, VS Code and Chrome have none found.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.02](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s502), [S5.03](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s503), [S5.04](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s504).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person change area (Chat or Code on Web and Desktop; Local or Cloud on Mobile), change which workspace owns their chats (Personal or an organisation), and on Mobile change which signed-in account is active. (packages/ui/ui/src/sidebar/Sidebar.tsx:612-641) (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:114-215) (apps/mobile/src/features/accounts/useDeviceAccounts.ts:118-141)

**Why it exists.** Work and personal content must stay apart. The web menu says personal and enterprise scope differ in who can read content. (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:78-82)

**Who uses it.** People with a team or enterprise workspace; people using both Chat and Code; Mobile users who run Local and Cloud or hold more than one account.

**Problems it solves**

- Pasting company text into a personal chat by mistake.
- Reaching the Code area without leaving the sidebar.
- Moving between Local on-device chat and Cloud chat on the phone.
- Changing account without signing out (Mobile).

**Use cases**

- A consultant switches from Personal to a client's Enterprise workspace before opening chats.
- A developer clicks Code in the sidebar to open the Code surface.
- A phone user taps Cloud in the drawer to leave on-device chat.
- A phone user opens Settings, Switch account, and taps the other account.

## 2. User experience

**Where to find it**

- Web and Desktop, Home and Code: a two-segment control under the sidebar header with group label 'Switch between Home and Code'; segments 'Home' and 'Code'. In the collapsed rail it is a single 'Code' button. (packages/ui/ui/src/sidebar/Sidebar.tsx:612-641, 513-516)
- Web and Desktop, workspace: account menu at the bottom of the sidebar, sub-menu labelled by key common:navWorkspaceSection (default 'Workspace'), rows 'Personal' (detail 'Only you'), 'Enterprise' group, and 'Manage workspaces'. (apps/web/shared/components/layout/AccountMenuItems.tsx:73-81) (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:184-215)
- Mobile, mode: toggle at the top of the drawer (ModeToggle) with Local and Cloud; drawer also lists a code destination named by CLOUD_CODE_SCREEN_TITLE. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:633-640, 123-128)
- Mobile, workspace: Settings, then the workspace screen (Cloud only); rows with accessibility label 'Switch to <name>'. (apps/mobile/src/features/settings/index.tsx:664) (apps/mobile/app/(app)/settings/workspace.tsx:446-451)
- Mobile, account: Settings, 'Switch account' view with an 'Add account' row; shown only when the sign-in service allows several sessions. (apps/mobile/src/features/settings/index.tsx:969-980) (apps/mobile/src/features/accounts/components/DeviceAccountsCard.tsx:139-163)
- CLI, VS Code, Chrome: none found.

**Before you start**

- Web workspaces need a signed-in account; the list loads from the server.
- Code button hidden if the workspace disables the code feature or the host passes no onOpenCode. (apps/web/shared/components/layout/WebAppShell.tsx:566) (packages/ui/ui/src/sidebar/Sidebar.tsx:71-75)
- Mobile Cloud mode needs sign-in; a signed-out Cloud tap goes to sign-in. (apps/mobile/__tests__/DrawerContent.test.tsx:292)
- Mobile workspace screen needs Cloud mode and a plan that includes workspaces. (apps/mobile/app/(app)/settings/workspace.tsx:480-505)

**Screens and controls**

- Home segment (calls the New chat handler) and Code segment. (packages/ui/ui/src/sidebar/Sidebar.tsx:618-640)
- Workspace rows with check mark on the selected one, role badge for organisations. (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:35-62)
- Confirm panel 'Switch anyway' / 'Stay in this workspace' listing work that will be lost. (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:120-155)
- Mobile ModeToggle, workspace radio rows, DeviceAccountsCard with an overlay 'Switching to <email>…'. (apps/mobile/src/features/accounts/components/DeviceAccountsCard.tsx:169-203)

**Journey**

1. Web: open the account menu, open the Workspace sub-menu, pick Personal or an Enterprise workspace.
2. If unsent drafts, uploads, a running reply, voice, computer control, approvals or unsaved artifacts exist, the menu first lists them and asks to confirm. (apps/web/features/workspaces/lib/workspace-switch-interruptions.ts:12-60)
3. The app sends the change to the server, re-reads the workspace list, and reloads into the new scope. (apps/web/features/workspaces/hooks/use-workspaces.ts:114-178)
4. Home and Code: click Code to open the Code route; click Home to start a new chat. (apps/web/shared/components/layout/WebAppShell.tsx:300-316)
5. Mobile workspace: tap a row; on success the chat list is reloaded. (apps/mobile/src/features/team/switchWorkspace.ts:5-18)
6. Mobile account: tap an account; if messages are waiting to send the app asks to discard them first. (apps/mobile/src/features/accounts/useDeviceAccounts.ts:143-164)

**What the person sees and gets**

- Web: 'Switching workspace' spinner row; error text 'We could not switch workspaces. Check your connection and try again.' with 'Try switching again'; 'Reload to resolve workspace status' when the outcome is uncertain. (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:166-208)
- Mobile: alert 'Could not switch workspace' / 'Workspace changed'; alert 'Could not switch accounts'. (apps/mobile/src/features/team/switchWorkspace.ts:8-15) (apps/mobile/src/features/accounts/useDeviceAccounts.ts:112-114)

**Settings**

- Mobile workspace administration lives on the same screen (members, roles, ownership transfer). (apps/mobile/app/(app)/settings/workspace.tsx:164-230)
- Web 'Manage workspaces' opens Settings, Team section. (apps/web/shared/components/layout/WebAppShell.tsx:487)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop Home and Code segment, hidden when onOpenCode is absent. (packages/ui/ui/src/sidebar/Sidebar.tsx:608-612) (packages/ui/ui/src/sidebar/__tests__/Sidebar.codeAction.test.tsx)
- Web workspace menu with Personal, Enterprise group, switch confirmation, pending, error and retry states. (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx)
- Switch uses an owner and epoch guard so a stale response cannot land in the wrong workspace. (apps/web/features/workspaces/hooks/use-workspaces.ts:125-178)
- Mobile Local and Cloud toggle in the drawer; selecting a mode opens a new chat. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:432-441)
- Mobile workspace switching in Settings. (apps/mobile/app/(app)/settings/workspace.tsx:164-175)
- Mobile account switching and adding, on instances that allow several sessions. (apps/mobile/src/features/accounts/deviceAccounts.ts:44-52) (apps/mobile/src/features/accounts/useDeviceAccounts.ts:118-175)

**Incomplete**

- Draft said the Mobile workspace switcher is in the drawer. It is not: the drawer has no workspace control; the switcher is in Settings. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:330-923) (apps/mobile/app/(app)/settings/workspace.tsx)
- Brief cites apps/mobile/src/features/team/useWorkspaceSwitcher.ts; that file does not exist. (listing of apps/mobile/src/features/team)
- Mobile account switching depends on the sign-in instance allowing several sessions; the code reads an internal setting and treats anything but an explicit false as single-session. (apps/mobile/src/features/accounts/deviceAccounts.ts:44-52)
- Chrome: the brief marks mode switching done for Chrome, but its line references are stale and nothing was found here. (doc: brief S5.02)

**Present but disconnected or switched off**

- The Home segment calls the new-chat handler rather than navigating to a separate home screen. (packages/ui/ui/src/sidebar/Sidebar.tsx:618-622)

**Not available**

- Account switching on Web, Desktop, CLI, VS Code and Chrome: no code found by search for multi-session handling. The brief lists it missing on all six; code shows Mobile has it. (apps/mobile/src/features/accounts/useDeviceAccounts.ts) (doc: brief S5.03)
- Workspace switching in CLI, VS Code and Chrome: no code found by search for the active-workspace call.
- Mode switch for CLI and VS Code: not applicable or not found.

## 4. Required behaviour

**Established requirements**

- A control switches between product areas or modes from the shell. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.02)
- The user can switch between two or more signed-in accounts without signing out. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.03)
- The shell shows the active workspace and switches personal and team workspaces. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.04)
- Nothing may silently route a Local chat, file or session to BYOK or managed cloud; a move needs explicit consent and a visible label. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Web: the Code segment opens the Code route; with the code feature disabled the segment is absent.
2. Web: choosing a workspace with an unsent draft shows the warning list before switching.
3. Web: after a successful switch the chat list shows only that workspace's conversations.
4. Web: a failed switch shows the error text and a retry row, and the previous workspace stays selected.
5. Mobile: tapping Cloud while signed out opens sign-in and stays in Local.
6. Mobile: Settings, workspace shows the active workspace with a check; switching reloads chats.
7. Mobile: with two accounts allowed, one tap switches and shows progress; waiting messages require a discard confirmation.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A switch should leave no data of the old workspace readable in the new one; web code clears caches by owner and epoch. [inferred] from (apps/web/features/workspaces/lib/workspace-cache-scope.ts exists) and the mobile test title 'leaves nothing of the first account readable after a successful switch' (apps/mobile/src/features/accounts/__tests__/AccountSwitcher.test.tsx:464).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Put an active-workspace label in the header or sidebar so the scope is visible without opening the menu.
- [proposed] Update brief S5.03, S5.04 and the stale mobile references.
- [proposed] Decide whether Web should offer account switching.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Sidebar surface switch | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Home and Code segmented control and rail Code button |
| component | WebAppShell Code wiring | `apps/web/shared/components/layout/WebAppShell.tsx` | Passes onOpenCode unless the code feature is disabled |
| component | AccountMenuItems | `apps/web/shared/components/layout/AccountMenuItems.tsx` | Account menu with Workspace sub-menu |
| component | WorkspaceMenuItems | `apps/web/features/workspaces/components/WorkspaceMenuItems.tsx` | Workspace rows, confirm panel, error and retry |
| hook | useAccountWorkspaces and useSelectWorkspace | `apps/web/features/workspaces/hooks/use-workspaces.ts` | Reads the workspace list and sends the switch with owner and epoch guards |
| service | workspace-switch-interruptions | `apps/web/features/workspaces/lib/workspace-switch-interruptions.ts` | Lists work that would be lost on a switch |
| service | workspace-cache-scope and workspace-admission | `apps/web/features/workspaces/lib/workspace-cache-scope.ts` | Scopes caches to the active workspace |
| config | MANAGED_CLOUD_WORKSPACES_PATH | `packages/contracts/cloud-contracts/src/workspaces.ts` | Endpoint path constant for workspace read and select |
| component | DrawerContent ModeToggle | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | Local and Cloud toggle in the phone drawer |
| hook | useAppModeSwitch | `apps/mobile/src/features/chat/hooks/useAppModeSwitch.ts` | Switches Local and Cloud; path from import, file not opened |
| screen | Workspace screen | `apps/mobile/app/(app)/settings/workspace.tsx` | Workspace list, switch, administration |
| service | switchWorkspace | `apps/mobile/src/features/team/switchWorkspace.ts` | Calls setActiveWorkspace then reloads chats; alerts on failure |
| service | setActiveWorkspace | `apps/mobile/src/features/team/service.ts` | PUT /api/settings/organization/active |
| hook | useDeviceAccounts and useAccountSwitch | `apps/mobile/src/features/accounts/useDeviceAccounts.ts` | Lists, switches and adds accounts |
| service | deviceAccounts | `apps/mobile/src/features/accounts/deviceAccounts.ts` | Reads signed-in sessions and the multi-session setting |
| component | DeviceAccountsCard | `apps/mobile/src/features/accounts/components/DeviceAccountsCard.tsx` | Account list, Add account row and switching overlay |
| service | accountAddition | `apps/mobile/src/features/auth/services/accountAddition.ts` | Begins and ends the add-account sign-in |
| endpoint | PUT /api/settings/organization/active | `apps/mobile/src/features/team/service.ts` | Server call that sets the active organisation |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a workspace; the hook checks interruptions and may show the confirm panel. | device | apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:84-107 |
| The web sends a PUT with the workspace id (or the personal selector) to the managed workspaces path. | our servers | apps/web/features/workspaces/hooks/use-workspaces.ts:114-123, 164-170 |
| The web re-reads the workspace list and finalizes the switch, clearing scoped caches, then the app reloads in the new scope. | device and our servers | apps/web/features/workspaces/hooks/use-workspaces.ts:174-178 |
| On an error the hook re-reads the list; if the outcome cannot be proven it keeps admission closed and asks for a reload. | device and our servers | apps/web/features/workspaces/hooks/use-workspaces.ts:179-195 |
| Mobile workspace: PUT /api/settings/organization/active, then loads conversations again. | our servers | apps/mobile/src/features/team/service.ts:122-124; apps/mobile/src/features/team/switchWorkspace.ts:5-18 |
| Mobile account: asks the sign-in provider (Clerk) to switch the session, waits until the new account is adopted. | outside service | apps/mobile/src/features/accounts/useDeviceAccounts.ts:118-130; apps/mobile/src/features/auth/store.ts:282 |
| Mobile Local and Cloud toggle changes the app mode on the device; a Cloud switch for a signed-out person goes to sign-in. | device | apps/mobile/src/features/drawer/components/DrawerContent.tsx:432-441 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Active workspace | Server (account workspace record); web query cache keyed by owner | Yes, held by the server | Kept until changed |
| Signed-in sessions list | Sign-in provider's client on the phone | Not through AGI servers [inferred] | Until sign-out |
| Local or Cloud mode (Mobile) | Mobile settings store (not opened) | unknown | unknown |

**Models and providers.** No model is called. The switch decides which workspace's policy, model access and history apply afterwards; that is covered by SYS-authorization-and-workspaces.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web workspace menu and Mobile Cloud need a signed-in account. |
| Permissions | Role badge per organisation shown on rows; workspace administration on Mobile needs an admin role. (apps/mobile/app/(app)/settings/workspace.tsx:340-342) |
| Subscription | Mobile says a Team or Enterprise plan is needed to administer workspaces; otherwise 'Workspaces aren't included in your plan.' when native purchases are off. (apps/mobile/app/(app)/settings/workspace.tsx:480-505) Web: no plan check found in WorkspaceMenuItems. |
| Limits and metering | none found in the code for switching. Member limits exist (maxMembers) for administration. (apps/mobile/src/features/team/service.ts:112) |
| Feature flags | Code segment follows the workspace's disabledFeatures list. (apps/web/shared/components/layout/WebAppShell.tsx:566) Mobile drawer items follow FEATURES flags. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:516-520) |
| Model compatibility | Not applicable. |
| Provider restrictions | Mobile account switching depends on the sign-in provider's multi-session setting. (apps/mobile/src/features/accounts/deviceAccounts.ts:44-52) |
| Local mode | Mobile Local mode: the drawer shows only what lives on the phone; workspace and account switching sit behind Cloud sign-in (workspace route uses the cloud gate). (apps/mobile/__tests__/DrawerContent.test.tsx:396) (apps/mobile/src/features/settings/index.tsx:664) Web: no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading workspaces | Disabled row with spinner 'Loading workspaces'. | apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:157-162 |
| Workspace list failed | One row to retry or reload. | apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:163-176 |
| Empty organisations | Only Personal is listed and the Enterprise heading is hidden. | apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:196-199 |
| Switch in flight | All rows disabled; selecting the active row does nothing. | apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:45-48, 188 |
| Switch failed or uncertain | Error alert text with retry, or reload prompt. | apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:203-228 |
| Mobile switch fails | Alert; chats not reloaded if the change failed; if reload fails, tells the person to refresh. | apps/mobile/src/features/team/switchWorkspace.ts:5-18 |
| Mobile switch with queued messages | Asks to discard before switching accounts. | apps/mobile/src/features/accounts/useDeviceAccounts.ts:143-164 |
| Offline | Surfaces as the generic error; no offline-specific path. | apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:203-208 |
| Account switch cancel or timeout | Adoption wait times out to 'pending'; cancel only in the discard prompt. | apps/mobile/src/features/accounts/useDeviceAccounts.ts:62-95 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/workspaces/components/WorkspaceMenuItems.test.tsx`: Workspace menu (contents not read in detail)
- `apps/web/features/workspaces/hooks/useWorkspaces.test.tsx`: Workspace hooks (contents not read in detail)
- `apps/web/features/workspaces/lib/workspace-switch-interruptions.test.ts`: Interruption list
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.codeAction.test.tsx`: Home and Code control, rail Code button, absent without a Code destination
- `apps/web/shared/components/layout/WebAppShell.test.tsx`: Code destination handed to sidebar (line 715)
- `apps/mobile/__tests__/DrawerContent.test.tsx`: Local and Cloud toggle, sign-in redirect, switch back to Local
- `apps/mobile/__tests__/WorkspaceSwitcher.test.tsx`: Mobile workspace screen with mocked workspace service and chat reload
- `apps/mobile/__tests__/workspace-service.test.ts`: Mobile workspace service (contents not read)
- `apps/mobile/src/features/accounts/__tests__/AccountSwitcher.test.tsx`: Account list, one-tap switch, push release, discard prompt, no list in Local mode
- `apps/mobile/src/features/accounts/__tests__/deviceAccounts.test.ts`: Device account reading

**Test scenarios**

- **Web workspace switch with a draft**
  1. Sign in to an account with an organisation.
  2. Type an unsent message.
  3. Open account menu, Workspace, pick the organisation.
  - Expected: A warning lists the unsent message; 'Switch anyway' switches and reloads; the organisation shows a check.
- **Web switch fails**
  1. Block the workspace request in dev tools.
  2. Pick a workspace.
  - Expected: Error text and 'Try switching again'; the previous workspace stays selected.
- **Code hidden**
  1. Use a workspace that disables the code feature.
  - Expected: No Code segment and no Code rail button.
- **Mobile mode toggle**
  1. Open the drawer signed out.
  2. Tap Cloud.
  - Expected: Sign-in opens; the app stays in Local.
- **Mobile workspace**
  1. Signed in on a team plan, Cloud mode: Settings, workspace.
  2. Tap another workspace.
  - Expected: Check mark moves; chat list reloads.
- **Mobile accounts**
  1. On an instance with several sessions: Settings, Switch account.
  2. Tap the other account.
  - Expected: Overlay 'Switching to <email>…' then the other account is active.

**Where to look when it fails**

- Web: error text with role alert in the workspace menu; requiresReload flag when owner phase is uncertain. (apps/web/features/workspaces/hooks/use-workspaces.ts:216-217)
- Mobile: alerts 'Could not switch workspace', 'Could not switch accounts'; DeviceAccountError name. (apps/mobile/src/features/accounts/deviceAccounts.ts:30-35)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **No account switching on Web, Desktop, CLI, VS Code, Chrome** Affects: Users with more than one account. Evidence: No multi-session code found outside apps/mobile; brief S5.03. Work needed: Product decision and per-surface build
- **Brief says Mobile account switching is missing; code has it** Affects: Planning accuracy. Evidence: apps/mobile/src/features/accounts/useDeviceAccounts.ts. Work needed: Correct the brief
- **Mobile workspace switcher is in Settings, not in the shell** Affects: Mobile users who expect it in the drawer (brief S5.04 asks for shell access). Evidence: apps/mobile/src/features/drawer/components/DrawerContent.tsx has no workspace control. Work needed: Add an active-workspace entry to the drawer or accept Settings
- **No workspace switching on CLI, VS Code, Chrome** Affects: Team users of those apps. Evidence: No call to the active-organisation endpoint under apps/cli, apps/extension, apps/extension-vscode. Work needed: Design and build, or document the workspace they follow
- **Active workspace not visible without opening a menu on Web** Affects: All Web users. Evidence: Selected row only inside the account menu (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:184-215). Work needed: Optional label in the shell
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:local
- mode:cloud
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- api:PUT /api/settings/organization/active
- file:apps/web/features/workspaces/components/WorkspaceMenuItems.tsx
- F005-01

## Unknown

- Where the web workspace path constant resolves to as a literal URL.
- What useAppModeSwitch stores and whether Local or Cloud choice syncs.
- Chrome mode switching: the brief says done; nothing was verified.
- Whether Desktop has any workspace-switching difference beyond the shared web menu.
- Whether the Mobile workspace screen has a Personal row (the rows come from overview.workspaces).
