---
id: "REQ-AREA-009"
type: "requirements"
title: "Requirement items: Compound interface components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 9. Compound interface components

38 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S9.01

**Searchable resource picker.** A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F009-01 Model picker and file picker in the chat box](../../20-features/009-compound-interface-components/F009-01-model-picker-and-file-picker-in-the-chat-box.md)

## S9.02

**Model picker.** A control lists the available models and switches the conversation to the one the user picks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F009-01 Model picker and file picker in the chat box](../../20-features/009-compound-interface-components/F009-01-model-picker-and-file-picker-in-the-chat-box.md)

## S9.03

**Source picker.** Before or while asking, the user can choose which sources (specific sites, files, connected apps) the answer may draw on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F009-02 Source, project and connected-account pickers](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)
- Competitor trace: CAP-research-04

## S9.04

**Connected-account picker.** When a connector has more than one linked account, the user can pick which account a task or chat uses.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile done, CLI done
- Feature: [F009-02 Source, project and connected-account pickers](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)

## S9.05

**Workspace picker.** The user can see their personal and team workspaces in a list and switch the active one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F009-03 Workspace switcher and member picker](../../20-features/009-compound-interface-components/F009-03-workspace-switcher-and-member-picker.md)

## S9.06

**Project picker.** The user can pick one of their projects so the chat or task runs in that project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F009-02 Source, project and connected-account pickers](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md)

## S9.07

**Repository picker.** The user can choose which code repository a coding session works in, from a list or by URL/path.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F009-04 Repository and branch pickers (Code)](../../20-features/009-compound-interface-components/F009-04-repository-and-branch-pickers-code.md)

## S9.08

**Branch picker.** The user can pick the branch a coding session starts from or works on from a list of the repository's branches.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI missing
- Feature: [F009-04 Repository and branch pickers (Code)](../../20-features/009-compound-interface-components/F009-04-repository-and-branch-pickers-code.md)

## S9.09

**Device picker.** The user can pick which device is used (microphone, speaker, camera or paired computer) from a list.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, Chrome missing
- Feature: [F009-05 Device, permission-scope and approval controls](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)

## S9.10

**Permission-scope picker.** When granting access (an API key, tool approvals or site automation), the user chooses how far the permission reaches: which capabilities, or once versus always.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F009-05 Device, permission-scope and approval controls](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)

## S9.11

**Member and recipient picker.** The user can pick one or more people (workspace members or recipients) by name or email to share with, invite or assign.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F009-03 Workspace switcher and member picker](../../20-features/009-compound-interface-components/F009-03-workspace-switcher-and-member-picker.md)

## S9.12

**Recurrence editor.** When creating a scheduled task, the user sets how it repeats (once, daily, weekly, monthly or a custom rule) and the schedule runs on that cadence.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F009-06 Schedule recurrence, step indicator and setup wizard](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)

## S9.13

**File browser.** The user can browse their stored files (uploads and generated outputs) in a list or grid, open one, and filter or search it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F009-07 Library: file browser, folders, grid, gallery and image comparison](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)

## S9.14

**Folder tree.** Files are shown in a nested folder tree the user can expand and collapse to reach a file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F009-07 Library: file browser, folders, grid, gallery and image comparison](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)

## S9.15

**Data table.** Tabular data is shown in a table with column headers that the user can sort (and scroll) to inspect the rows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F009-07 Library: file browser, folders, grid, gallery and image comparison](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)

## S9.16

**Resource grid.** Resources (files, artifacts, projects) are shown as a grid of cards the user can scan and open.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F009-07 Library: file browser, folders, grid, gallery and image comparison](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)

## S9.17

**Media gallery.** The user can browse their images and videos as a gallery and open one in a larger viewer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F009-07 Library: file browser, folders, grid, gallery and image comparison](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)

## S9.18

**Image comparison slider.** After an image edit, the user can drag a slider over one frame to compare the original and edited images.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F009-07 Library: file browser, folders, grid, gallery and image comparison](../../20-features/009-compound-interface-components/F009-07-library-file-browser-folders-grid-gallery-and-imag.md)

## S9.19

**Timeline.** The steps of a run are shown in time order, each with its state and (where known) how long it took.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F009-08 Run progress, task board, versions, diffs, widgets and layout](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)

## S9.20

**Activity feed.** The user can see a feed of recent account events (sign-ins, changes, runs), newest first.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F009-11 Activity feed, notification inbox, command palette and integration cards](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)

## S9.21

**Task board.** Tasks are laid out as a board with a column per status so the user sees and manages work by stage.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code done, Chrome unverified
- Feature: [F009-08 Run progress, task board, versions, diffs, widgets and layout](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)

## S9.22

**Stepper.** A multi-step flow shows which step the user is on out of how many (e.g. dots or "Step 2 of 4") and advances or goes back with it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F009-06 Schedule recurrence, step indicator and setup wizard](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)

## S9.23

**Multi-step setup wizard.** A guided setup runs as ordered steps that collect the user's choices (name, model, sign-in) and saves them when it finishes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F009-06 Schedule recurrence, step indicator and setup wizard](../../20-features/009-compound-interface-components/F009-06-schedule-recurrence-step-indicator-and-setup-wizar.md)

## S9.24

**Split-pane container.** Two panes sit side by side (e.g. chat and artifact) and the user can resize the split, by pointer and by keyboard.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code done
- Feature: [F009-08 Run progress, task board, versions, diffs, widgets and layout](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)

## S9.25

**Docking layout manager.** The user can move panels to different positions (left, right, bottom, floating) and the layout keeps that arrangement.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, VS Code done
- Feature: [F009-08 Run progress, task board, versions, diffs, widgets and layout](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)

## S9.26

**Version-history panel.** A panel lists a resource's saved versions (when, what) and lets the user open or restore one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F009-08 Run progress, task board, versions, diffs, widgets and layout](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)

## S9.27

**Diff viewer.** Changes to a file are shown as a diff (added and removed lines marked) that the user can read before accepting.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F009-08 Run progress, task board, versions, diffs, widgets and layout](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)

## S9.28

**Source inspector.** The user can open an answer's sources and see each one's title, origin and the excerpt it contributed, then open it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F009-09 Source inspector and model warning](../../20-features/009-compound-interface-components/F009-09-source-inspector-and-model-warning.md)

## S9.29

**Usage meter.** A meter shows how much of the plan allowance is used (per window) with the reset time, readable by assistive tech.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F009-10 Usage meter and credit balance](../../20-features/009-compound-interface-components/F009-10-usage-meter-and-credit-balance.md)

## S9.30

**Credit-balance card.** The user sees their purchased credit balance in one place, next to a way to add credits.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F009-10 Usage meter and credit balance](../../20-features/009-compound-interface-components/F009-10-usage-meter-and-credit-balance.md)

## S9.31

**Permission summary.** One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F009-05 Device, permission-scope and approval controls](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)

## S9.32

**Approval card.** When an action needs consent, an inline card names the action and offers approve and deny, and the choice resumes or stops the run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F009-05 Device, permission-scope and approval controls](../../20-features/009-compound-interface-components/F009-05-device-permission-scope-and-approval-controls.md)

## S9.33

**Integration connection card.** Each integration shows a card with its connection state (connected, expired, not connected) and the action to connect or disconnect.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F009-11 Activity feed, notification inbox, command palette and integration cards](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)

## S9.34

**Capability-warning card.** Before sending, a visible notice warns when the chosen model cannot handle something in the request (images, tools, attachments, context size).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F009-09 Source inspector and model warning](../../20-features/009-compound-interface-components/F009-09-source-inspector-and-model-warning.md)

## S9.35

**Task-progress card.** A running task shows a card with its current state and progress (steps done, latest action) that updates while it runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F009-08 Run progress, task board, versions, diffs, widgets and layout](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)

## S9.36

**Interactive result widget.** An answer can embed a widget the user operates in place (choices, map, app card), and the choice or state feeds back into the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F009-08 Run progress, task board, versions, diffs, widgets and layout](../../20-features/009-compound-interface-components/F009-08-run-progress-task-board-versions-diffs-widgets-and.md)

## S9.37

**Notification inbox.** An inbox lists the user's notifications newest first, marks which are unread (visibly and for screen readers), and lets them open or mark them read.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F009-11 Activity feed, notification inbox, command palette and integration cards](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)

## S9.38

**Keyboard-command palette.** A keyboard shortcut opens a searchable list of commands and destinations; typing filters it and Enter runs the choice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F009-11 Activity feed, notification inbox, command palette and integration cards](../../20-features/009-compound-interface-components/F009-11-activity-feed-notification-inbox-command-palette-a.md)
