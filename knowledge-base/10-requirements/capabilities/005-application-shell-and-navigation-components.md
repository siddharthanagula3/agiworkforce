---
id: "REQ-AREA-005"
type: "requirements"
title: "Requirement items: Application shell and navigation components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 5. Application shell and navigation components

39 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S5.01

**Application header.** A persistent top header shows where the user is (brand/conversation title) and the primary actions for the current view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F005-01 Header and layout by screen size](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)

## S5.02

**Product or mode switcher.** A control lets the user switch between product areas or modes (chat, projects, code, work, etc.) from the shell.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome done
- Feature: [F005-02 Switch between modes and workspaces](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)

## S5.03

**Account switcher.** The user can switch between two or more signed-in accounts without signing out.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F005-02 Switch between modes and workspaces](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)

## S5.04

**Workspace switcher.** From the shell, the user can see the active workspace and switch between personal and team workspaces.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F005-02 Switch between modes and workspaces](../../20-features/005-application-shell-and-navigation-components/F005-02-switch-between-modes-and-workspaces.md)

## S5.05

**Sidebar expand/collapse control.** A control collapses the navigation sidebar to a rail (or hides it) and expands it again.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Seen in a real run: Web PASS
- Feature: [F005-01 Header and layout by screen size](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)

## S5.06

**Sidebar resize handle.** A drag handle lets the user resize the navigation sidebar width, and the width persists.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F005-01 Header and layout by screen size](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)

## S5.07

**Sidebar search input.** The navigation sidebar has a search entry that filters or searches conversations.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F005-03 Search and new chat in the sidebar](../../20-features/005-application-shell-and-navigation-components/F005-03-search-and-new-chat-in-the-sidebar.md)

## S5.08

**New-chat action.** A persistent New chat action starts a fresh conversation from anywhere in the shell.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F005-03 Search and new chat in the sidebar](../../20-features/005-application-shell-and-navigation-components/F005-03-search-and-new-chat-in-the-sidebar.md)

## S5.09

**Pinned-item section.** Pinned items appear in their own section at the top of navigation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F005-04 Sidebar lists: pinned, recents, projects and date groups](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)

## S5.10

**Recent-item section.** Navigation shows a list of recent conversations that open on selection.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F005-04 Sidebar lists: pinned, recents, projects and date groups](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)

## S5.11

**Project-grouped recents.** Recent conversations can be shown grouped under their projects in navigation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing
- Feature: [F005-04 Sidebar lists: pinned, recents, projects and date groups](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)

## S5.12

**Date-grouped recents.** Recent conversations are grouped by date buckets (Today, Yesterday, This week, Older).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F005-04 Sidebar lists: pinned, recents, projects and date groups](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)

## S5.13

**Conversation row.** Each conversation row shows its title, indicates the active one, and opens the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F005-05 Conversation and task rows](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)

## S5.14

**Project row.** Navigation shows project rows that open the project (and expose its actions).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F005-04 Sidebar lists: pinned, recents, projects and date groups](../../20-features/005-application-shell-and-navigation-components/F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md)

## S5.15

**Task row.** Background work/tasks appear as rows marked as tasks (distinct from chats) with their state, and open on selection.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F005-05 Conversation and task rows](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)

## S5.16

**Resource-type icon.** Rows in mixed lists carry an icon (or equivalent marker) that tells the resource type apart (chat, project, task, file) visually and for assistive tech.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F005-05 Conversation and task rows](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)

## S5.17

**Running-task indicator.** Navigation marks items whose task or response is still running, visually and for screen readers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F005-05 Conversation and task rows](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)

## S5.18

**Needs-input indicator.** Navigation marks items that are blocked waiting for the user (approval or input).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F005-05 Conversation and task rows](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)

## S5.19

**Unread-result indicator.** Items with new results the user has not seen are marked unread (visually and for assistive tech) and clear when opened.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F005-05 Conversation and task rows](../../20-features/005-application-shell-and-navigation-components/F005-05-conversation-and-task-rows.md)

## S5.20

**Item overflow menu.** Each row has an overflow (⋯) menu with its actions (share, rename, pin, archive, move, delete).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F005-06 Row actions: menu, rename, reorder and move](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)

## S5.21

**Inline rename field.** A row can be renamed in place (inline field, Enter to save, Escape to cancel) and the new title persists.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F005-06 Row actions: menu, rename, reorder and move](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)

## S5.22

**Drag-to-reorder interaction.** The user can drag rows (e.g. pinned items or projects) to reorder them, and the order persists.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F005-06 Row actions: menu, rename, reorder and move](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)

## S5.23

**Drag-to-move-into-Project interaction.** The user can drag a conversation onto a project in navigation to move it there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F005-06 Row actions: menu, rename, reorder and move](../../20-features/005-application-shell-and-navigation-components/F005-06-row-actions-menu-rename-reorder-and-move.md)

## S5.24

**Breadcrumb navigation.** Nested app views show a breadcrumb trail back to their parents (e.g. Projects / Project / Chat).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F005-07 Breadcrumbs, back and forward, and links](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)

## S5.25

**Back and forward navigation.** Back and forward navigation move through the user's in-app history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F005-07 Breadcrumbs, back and forward, and links](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)

## S5.26

**Global command palette.** A global command palette (keyboard-invoked) searches and runs app commands and destinations.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F005-08 Command palette and keyboard shortcut help](../../20-features/005-application-shell-and-navigation-components/F005-08-command-palette-and-keyboard-shortcut-help.md)

## S5.27

**Keyboard-shortcut help.** A keyboard-shortcut help view lists the available shortcuts and is reachable from the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PARTIAL
- Feature: [F005-08 Command palette and keyboard shortcut help](../../20-features/005-application-shell-and-navigation-components/F005-08-command-palette-and-keyboard-shortcut-help.md)

## S5.28

**Notification center.** A notification center lists account notifications, shows an unread count, and lets the user open and mark them read.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F005-09 Notification center](../../20-features/005-application-shell-and-navigation-components/F005-09-notification-center.md)

## S5.29

**User/profile menu.** A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F005-10 Profile, help and upgrade menus](../../20-features/005-application-shell-and-navigation-components/F005-10-profile-help-and-upgrade-menus.md)

## S5.30

**Help menu.** A help menu gathers help centre, support contact, feedback and shortcuts in one place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F005-10 Profile, help and upgrade menus](../../20-features/005-application-shell-and-navigation-components/F005-10-profile-help-and-upgrade-menus.md)

## S5.31

**Upgrade entry.** A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code partial, Chrome partial
- Seen in a real run: Web UI_ONLY
- Feature: [F005-10 Profile, help and upgrade menus](../../20-features/005-application-shell-and-navigation-components/F005-10-profile-help-and-upgrade-menus.md)

## S5.32

**Connection-status indicator.** A status indicator shows whether the app is connected to its backend/runtime and offers reconnect when not.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F005-11 Connection, offline and release status](../../20-features/005-application-shell-and-navigation-components/F005-11-connection-offline-and-release-status.md)

## S5.33

**Offline indicator.** When the device loses network, a visible offline indicator appears and clears when back online.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F005-11 Connection, offline and release status](../../20-features/005-application-shell-and-navigation-components/F005-11-connection-offline-and-release-status.md)

## S5.34

**Release/update indicator.** The app tells the user when a new release is available (or just installed) and how to get it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F005-11 Connection, offline and release status](../../20-features/005-application-shell-and-navigation-components/F005-11-connection-offline-and-release-status.md)

## S5.35

**Mobile navigation drawer.** On narrow screens navigation lives in a slide-in drawer opened from a header button, with focus management and dismissal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome done
- Feature: [F005-01 Header and layout by screen size](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)

## S5.36

**Mobile bottom navigation.** On phones a persistent bottom navigation bar switches between the main areas.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Mobile missing
- Feature: [F005-01 Header and layout by screen size](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)
- An owner decision is open on this item.

## S5.37

**Tablet split-navigation layout.** On tablet widths navigation and content sit side by side (persistent or rail sidebar) instead of a phone drawer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F005-01 Header and layout by screen size](../../20-features/005-application-shell-and-navigation-components/F005-01-header-and-layout-by-screen-size.md)

## S5.38

**Resource deep links.** Each resource (conversation, project, task) has a stable link that opens it directly in the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done
- Seen in a real run: Web PASS
- Feature: [F005-07 Breadcrumbs, back and forward, and links](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)

## S5.39

**Route-level loading and unavailable-resource screens.** Routes show a loading state while resolving and a clear not-found/unavailable screen for missing or forbidden resources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F005-07 Breadcrumbs, back and forward, and links](../../20-features/005-application-shell-and-navigation-components/F005-07-breadcrumbs-back-and-forward-and-links.md)
