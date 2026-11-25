---
id: "GAPS-AREA-005"
type: "gap-list"
title: "Gaps: Application shell and navigation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 5. Application shell and navigation components

59 open gaps that touch this area. Area page: [20-features/005-application-shell-and-navigation-components](../../20-features/005-application-shell-and-navigation-components/README.md).

## GAP-AREA005-LW04

**Empty-state label mismatch: the row fallback in SessionItem uses 'sidebar.untitled' while the Sidebar list uses 'sidebar.untitledChat' for the same untitled case, so translations can differ.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-005
- Detail: Area 5. Application shell and navigation components
- Evidence: packages/ui/ui/src/sidebar/SessionItem.tsx:122 and packages/ui/ui/src/sidebar/Sidebar.tsx:1530

## GAP-F005-01-01

**No sidebar resize handle**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-01](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)
- Detail: Affects: Web and Desktop users. Work needed: Decide if wanted; if yes add a handle, a width store, and persistence (the desktop window-state already holds panel width)
- Evidence: No drag handler in packages/ui/ui/src/sidebar/Sidebar.tsx; brief S5.06

## GAP-F005-01-02

**No bottom navigation bar**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-01](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)
- Detail: Affects: Web phone and Mobile users. Work needed: Product decision; otherwise retire the requirement
- Evidence: apps/mobile/app/(app)/(tabs)/_layout.tsx:9; brief S5.36

## GAP-F005-01-03

**Mobile and Web use different tablet breakpoints**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-01](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)
- Detail: Affects: Tablet users of the phone app versus the web. Work needed: Align or document
- Evidence: apps/mobile/src/shared/hooks/useResponsiveLayout.ts:7,22 versus apps/web/shared/components/layout/app-shell-layout.ts:5-6

## GAP-F005-01-04

**Layout of CLI, VS Code and Chrome not traced; brief code references are stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-01](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)
- Detail: Affects: Those three apps. Work needed: Re-trace and refresh the brief
- Evidence: brief S5.01 and S5.35 line numbers do not match apps/cli/src/tui/tui_app.rs or apps/extension/src/side_panel.ts

## GAP-F005-01-05

**Two copies of the drawer wiring (WebAppShell and WebChatPage)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-01](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)
- Detail: Affects: Engineers; risk of drift. Work needed: Extract one component
- Evidence: apps/web/shared/components/layout/WebAppShell.tsx:683-720 and apps/web/features/chat/pages/WebChatPage.tsx:7234-7262

## GAP-F005-01-NOTBUILT

**Header and layout by screen size: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F005-01](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)
- Requirement items: S5.06, S5.36
- Detail: Web: S5.06, S5.36; Desktop: S5.06; Mobile: S5.36

## GAP-F005-02-01

**No account switching on Web, Desktop, CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-02](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)
- Detail: Affects: Users with more than one account. Work needed: Product decision and per-surface build
- Evidence: No multi-session code found outside apps/mobile; brief S5.03

## GAP-F005-02-02

**Brief says Mobile account switching is missing; code has it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-02](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)
- Detail: Affects: Planning accuracy. Work needed: Correct the brief
- Evidence: apps/mobile/src/features/accounts/useDeviceAccounts.ts

## GAP-F005-02-03

**Mobile workspace switcher is in Settings, not in the shell**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-02](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)
- Detail: Affects: Mobile users who expect it in the drawer (brief S5.04 asks for shell access). Work needed: Add an active-workspace entry to the drawer or accept Settings
- Evidence: apps/mobile/src/features/drawer/components/DrawerContent.tsx has no workspace control

## GAP-F005-02-04

**No workspace switching on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-02](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)
- Detail: Affects: Team users of those apps. Work needed: Design and build, or document the workspace they follow
- Evidence: No call to the active-organisation endpoint under apps/cli, apps/extension, apps/extension-vscode

## GAP-F005-02-05

**Active workspace not visible without opening a menu on Web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-02](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)
- Detail: Affects: All Web users. Work needed: Optional label in the shell
- Evidence: Selected row only inside the account menu (apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:184-215)

## GAP-F005-02-NOTBUILT

**Switch between modes and workspaces: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F005-02](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)
- Requirement items: S5.02, S5.03, S5.04
- Detail: Web: S5.03; Desktop: S5.03; Mobile: S5.03; CLI: S5.03, S5.04; VS Code: S5.03, S5.04; Chrome: S5.02, S5.03, S5.04

## GAP-F005-03-01

**Key bindings across apps not compared**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-03](../../20-features/005-application-shell-and-navigation-components/F005-03-search-and-new-chat-in-the-sidebar.md)
- Detail: Affects: CLI and VS Code users. Work needed: Trace and tabulate bindings
- Evidence: Draft said differences unchecked; brief code lines stale

## GAP-F005-03-02

**Search empty and failure states not documented for the dialog**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-03](../../20-features/005-application-shell-and-navigation-components/F005-03-search-and-new-chat-in-the-sidebar.md)
- Detail: Affects: All apps. Work needed: Document and test in the dialog
- Evidence: Not in the shell code

## GAP-F005-03-03

**CLI search of past sessions not found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-03](../../20-features/005-application-shell-and-navigation-components/F005-03-search-and-new-chat-in-the-sidebar.md)
- Detail: Affects: CLI users. Work needed: Confirm or build
- Evidence: Only /history and /resume picker found

## GAP-F005-03-04

**Chrome search hidden below 10 chats**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-03](../../20-features/005-application-shell-and-navigation-components/F005-03-search-and-new-chat-in-the-sidebar.md)
- Detail: Affects: Chrome users with few chats. Work needed: Likely intended; confirm
- Evidence: apps/extension/src/side_panel.ts:1131

## GAP-F005-04-01

**Brief lists four date buckets; code has six on Web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-04](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)
- Detail: Affects: Docs and testers. Work needed: Update brief S5.12
- Evidence: packages/ui/ui/src/sidebar/temporal.ts:4-10

## GAP-F005-04-02

**Mobile drawer has no date groups**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-04](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)
- Detail: Affects: Mobile users. Work needed: Decide if needed in the drawer
- Evidence: apps/mobile/src/features/drawer/components/DrawerContent.tsx:844-870

## GAP-F005-04-03

**Web organize mode and group state not persisted**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-04](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)
- Detail: Affects: Web and Desktop users. Work needed: Optional persistence
- Evidence: packages/ui/ui/src/sidebar/Sidebar.tsx:212, 207

## GAP-F005-04-04

**CLI lacks projects and pinned; VS Code lacks projects and date groups; Chrome project rows unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-04](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)
- Detail: Affects: Those apps. Work needed: Build or mark not applicable
- Evidence: No matching code found; brief S5.09, S5.11, S5.12, S5.14

## GAP-F005-04-05

**Draft assumed project click opens the project**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-04](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)
- Detail: Affects: Docs. Work needed: Correct docs; consider if click should open
- Evidence: packages/ui/ui/src/sidebar/Sidebar.tsx:1350

## GAP-F005-04-NOTBUILT

**Sidebar lists: pinned, recents, projects and date groups: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F005-04](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)
- Requirement items: S5.09, S5.11, S5.12
- Detail: CLI: S5.09, S5.11; VS Code: S5.09, S5.11, S5.12; Chrome: S5.09, S5.12

## GAP-F005-04-PARTLY

**Sidebar lists: pinned, recents, projects and date groups: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F005-04](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)
- Requirement items: S5.14

## GAP-F005-05-01

**Web unread is manual and local; brief wants new-result unread that clears on open**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-05](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)
- Detail: Affects: Web and Desktop users. Work needed: Server flag set on new assistant output, cleared on open
- Evidence: apps/web/shared/stores/unread-conversations-store.ts:1-10

## GAP-F005-05-02

**Mobile drawer rows lack running, needs-you and task markers**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-05](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)
- Detail: Affects: Mobile users. Work needed: Pass run state to rows
- Evidence: apps/mobile/src/features/drawer/components/DrawerContent.tsx:501-556

## GAP-F005-05-03

**No unread indicator on CLI and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-05](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)
- Detail: Affects: CLI and Chrome users. Work needed: Decide scope
- Evidence: doc: brief S5.19

## GAP-F005-05-04

**Resource-type icons not on sidebar rows**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-05](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)
- Detail: Affects: All apps. Work needed: Optional
- Evidence: Icons only in palette and mobile search

## GAP-F005-05-05

**Brief code references for CLI, VS Code and Chrome rows are stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-05](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)
- Detail: Affects: Docs. Work needed: Re-trace
- Evidence: tui_app.rs and side_panel.ts lines do not match

## GAP-F005-05-NOTBUILT

**Conversation and task rows: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F005-05](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)
- Requirement items: S5.16, S5.19
- Detail: CLI: S5.16, S5.19; VS Code: S5.19; Chrome: S5.16, S5.19

## GAP-F005-05-PARTLY

**Conversation and task rows: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F005-05](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)
- Requirement items: S5.15, S5.17, S5.18

## GAP-F005-06-01

**Drag to reorder not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-06](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)
- Detail: Affects: All apps. Work needed: Decide and build or retire
- Evidence: No drag handlers in packages/ui/ui/src/sidebar; brief S5.22

## GAP-F005-06-02

**Drag a chat onto a project not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-06](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)
- Detail: Affects: All apps. Work needed: Decide and build or retire
- Evidence: Move to project sub-menu only; brief S5.23

## GAP-F005-06-03

**VS Code Sessions sheet has no rename, archive, share or delete**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-06](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)
- Detail: Affects: VS Code users. Work needed: Add row menu or confirm out of scope
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6351-6405

## GAP-F005-06-04

**Brief marks Chrome rename and pin missing but code has them**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-06](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)
- Detail: Affects: Docs. Work needed: Correct the brief
- Evidence: apps/extension/src/side_panel.ts:12736, 12756

## GAP-F005-06-05

**Shared row Delete has no confirmation of its own**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-06](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)
- Detail: Affects: Any new host of SessionItem. Work needed: Move confirm into the shared component or add a test that each host confirms
- Evidence: packages/ui/ui/src/sidebar/SessionItem.tsx:395-399

## GAP-F005-06-06

**Mobile drawer menu reachable only by long press**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-06](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)
- Detail: Affects: Mobile users and assistive tech. Work needed: Add a visible control or a custom accessibility action
- Evidence: apps/mobile/src/features/drawer/components/DrawerContent.tsx:510-516

## GAP-F005-06-NOTBUILT

**Row actions: menu, rename, reorder and move: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F005-06](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)
- Requirement items: S5.21, S5.22, S5.23
- Detail: Web: S5.22, S5.23; Desktop: S5.22, S5.23; Mobile: S5.22, S5.23; Chrome: S5.21, S5.22, S5.23

## GAP-F005-07-01

**Breadcrumbs not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-07](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)
- Detail: Affects: Web and Desktop. Work needed: Design and build a breadcrumb trail for nested views
- Evidence: S5.24 status in the brief

## GAP-F005-07-02

**/open reads Personal scope only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-07](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)
- Detail: Affects: People with team workspaces on Web and Desktop. Work needed: Resolve against the person's workspace or try each workspace
- Evidence: page.tsx:31-37

## GAP-F005-07-03

**No Back/Forward control on web outside Desktop macOS**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-07](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)
- Detail: Affects: Web users in a browser with no browser buttons (e.g. installed web app). Work needed: Decide whether the shell needs its own control [proposed]
- Evidence: DesktopHistoryControls.tsx:57-65 draws only on macOS desktop

## GAP-F005-07-04

**Link opening not documented for CLI and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-07](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)
- Detail: Affects: CLI and Chrome. Work needed: Decide if links should open in these apps
- Evidence: Brief has no status for them

## GAP-F005-07-NOTBUILT

**Breadcrumbs, back and forward, and links: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F005-07](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)
- Requirement items: S5.24
- Detail: Web: S5.24; Desktop: S5.24

## GAP-F005-08-01

**Palette search failure and empty-loading states not traced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-08](../../20-features/005-application-shell-and-navigation-components/F005-08-command-palette-and-keyboard-shortcut-help.md)
- Detail: Affects: Web, Desktop. Work needed: Read CommandPalette.tsx search flow and test failure
- Evidence: not found in the code read

## GAP-F005-08-02

**No palette or shortcut help on Mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-08](../../20-features/005-application-shell-and-navigation-components/F005-08-command-palette-and-keyboard-shortcut-help.md)
- Detail: Affects: Mobile. Work needed: Decide if required
- Evidence: Brief lists no mobile status

## GAP-F005-09-01

**Single mark-read failure is silent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-09](../../20-features/005-application-shell-and-navigation-components/F005-09-notification-center.md)
- Detail: Affects: Web, Desktop. Work needed: Show an error or revert
- Evidence: use-notification-feed.ts:90-98

## GAP-F005-09-02

**No notification center on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-09](../../20-features/005-application-shell-and-navigation-components/F005-09-notification-center.md)
- Detail: Affects: Those apps. Work needed: Decide scope, then build
- Evidence: Brief S5.28

## GAP-F005-09-03

**Polling every 60 s only, no push to the open page**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-09](../../20-features/005-application-shell-and-navigation-components/F005-09-notification-center.md)
- Detail: Affects: Web, Desktop. Work needed: Optional [proposed]
- Evidence: use-notification-feed.ts:13

## GAP-F005-09-NOTBUILT

**Notification center: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F005-09](../../20-features/005-application-shell-and-navigation-components/F005-09-notification-center.md)
- Requirement items: S5.28
- Detail: CLI: S5.28; VS Code: S5.28; Chrome: S5.28

## GAP-F005-10-01

**Paid upgrade held by owner decision**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-10](../../20-features/005-application-shell-and-navigation-components/F005-10-profile-help-and-upgrade-menus.md)
- Detail: Affects: Web, Desktop, Mobile, VS Code, Chrome. Work needed: Owner opens upgrades (set env or run-time flag)
- Evidence: brief S5.31 Unfinished; billing-waitlist-access.ts:28-53; v1FeatureFlags.ts:6

## GAP-F005-10-02

**Mobile Upgrade entry not confirmed in the profile page**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-10](../../20-features/005-application-shell-and-navigation-components/F005-10-profile-help-and-upgrade-menus.md)
- Detail: Affects: Mobile. Work needed: Trace PaywallBottomSheet entry points
- Evidence: profile/index.tsx rows read

## GAP-F005-10-03

**CLI Upgrade done per brief but not opened here**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-10](../../20-features/005-application-shell-and-navigation-components/F005-10-profile-help-and-upgrade-menus.md)
- Detail: Affects: CLI. Work needed: Re-verify
- Evidence: brief cites claude_parity.rs:685, which prints model data in the lines read

## GAP-F005-10-PARTLY

**Profile, help and upgrade menus: partly built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F005-10](../../20-features/005-application-shell-and-navigation-components/F005-10-profile-help-and-upgrade-menus.md)
- Requirement items: S5.31
- Detail: Web S5.31: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | Desktop S5.31: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | Mobile S5.31: Owner hold: billing waitlist stays on (rulings, w-auth sweep); Upgrade leads to the subscription screen until FEATURES.billing is on. | VS Code S5.31: Upgrade button opens web pricing, where checkout sits behind the beta_redemptions waitlist gate. | Chrome S5.31: Quota upgrade button opens web pricing/billing, where checkout

## GAP-F005-11-01

**No reconnect action when offline**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-11](../../20-features/005-application-shell-and-navigation-components/F005-11-connection-offline-and-release-status.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add Reconnect/Retry when offline [proposed]
- Evidence: OfflineIndicator.tsx:176 only in error; OfflineBanner.tsx

## GAP-F005-11-02

**No release indicator on Web and Mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-11](../../20-features/005-application-shell-and-navigation-components/F005-11-connection-offline-and-release-status.md)
- Detail: Affects: Web, Mobile. Work needed: Decide how a web deploy or store update is announced
- Evidence: brief S5.34

## GAP-F005-11-03

**No offline indicator on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-11](../../20-features/005-application-shell-and-navigation-components/F005-11-connection-offline-and-release-status.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Add per app
- Evidence: brief S5.33

## GAP-F005-11-04

**Web bar does not say whether Local chat still works offline**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F005-11](../../20-features/005-application-shell-and-navigation-components/F005-11-connection-offline-and-release-status.md)
- Detail: Affects: Web, Desktop. Work needed: Establish behaviour then add text [proposed]
- Evidence: Mobile copy says so (copy.ts:21); Web message from manager has no such text

## GAP-F005-11-NOTBUILT

**Connection, offline and release status: not built on Web, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile, CLI, VS Code, Chrome
- Features: [F005-11](../../20-features/005-application-shell-and-navigation-components/F005-11-connection-offline-and-release-status.md)
- Requirement items: S5.33, S5.34
- Detail: Web: S5.34; Mobile: S5.34; CLI: S5.33; VS Code: S5.33, S5.34; Chrome: S5.33, S5.34

## GAP-F005-99-NOTBUILT

**Other items in Application shell and navigation components: not built on Web**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web
- Features: [F005-99](../../20-features/005-application-shell-and-navigation-components/F005-99-other-items.md)
- Requirement items: S5.40
- Detail: Web: S5.40
