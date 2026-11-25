---
id: "F009-08"
type: "feature"
title: "Run progress, task board, versions, diffs, widgets and layout"
aliases: ["Timeline", "Agent activity", "Task board", "Tasks page", "Task-progress card", "Work session panel", "Task dock", "Version history", "Diff viewer", "Changes panel", "Interactive result widget", "Interactive card", "Split pane", "Resize handle", "Docking layout", "S9.19 S9.21 S9.24-S9.27 S9.35 S9.36"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S9.19", "S9.21", "S9.35", "S9.26", "S9.27", "S9.36", "S9.24", "S9.25"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "file:packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx", "file:packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx", "file:apps/web/features/chat/components/SidePanelResizeHandle.tsx", "store:chat-ui-store", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-08 Run progress, task board, versions, diffs, widgets and layout

Compound parts that show and steer work: an activity timeline under answers, a task board by stage, a work-session progress panel, artifact version history with restore, a code diff panel with include and discard, interactive cards inside answers, and a resizable side panel. The docking manager exists only through VS Code itself.

Area: [9. Compound interface components](README.md). Requirement items: [S9.19](../../10-requirements/capabilities/009-compound-interface-components.md#s919), [S9.21](../../10-requirements/capabilities/009-compound-interface-components.md#s921), [S9.35](../../10-requirements/capabilities/009-compound-interface-components.md#s935), [S9.26](../../10-requirements/capabilities/009-compound-interface-components.md#s926), [S9.27](../../10-requirements/capabilities/009-compound-interface-components.md#s927), [S9.36](../../10-requirements/capabilities/009-compound-interface-components.md#s936), [S9.24](../../10-requirements/capabilities/009-compound-interface-components.md#s924), [S9.25](../../10-requirements/capabilities/009-compound-interface-components.md#s925).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows what a run is doing in time order (packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:679-905), lays cloud tasks out in stage columns with actions (packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx:46-80), lists artifact versions and restores one (apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:61-183), shows file diffs to include or discard (apps/web/features/code/components/CodeChangesPanel.tsx:39-118), renders cards the person operates inside answers (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:31-52) and lets the side panel be resized by pointer or keyboard (apps/web/features/chat/components/SidePanelResizeHandle.tsx:14-72).

**Why it exists.** Long agent runs and edits must be visible, reversible and reviewable before the person accepts them (doc: knowledge-base/data/area-briefs/009-compound-interface-components.md S9.19, S9.26, S9.27).

**Who uses it.** Anyone running agent work or editing artifacts and code on Web, the desktop window, Mobile, CLI, VS Code and Chrome.

**Problems it solves**

- Not knowing what an agent is doing or whether it stalled (AgentActivityTimeline.tsx:869-872).
- Losing an earlier artifact version (ArtifactPreview.tsx:1008-1029).
- Accepting changes unread (CodeChangesPanel.tsx:62-117).
- A cramped side panel (SidePanelResizeHandle.tsx:14-72).

**Use cases**

- Expand 'Agent activity' under an answer to read each tool step.
- Switch Tasks to Board, see Needs approval, press Approve on a card.
- Open Version history on an artifact, click Restore on Version 2.
- Open Changes, expand a file, untick it so it is not committed, or discard it.

## 2. User experience

**Where to find it**

- Web chat: button 'Show agent activity: <summary>' under an answer (AgentActivityTimeline.tsx:876-885); work session panel labelled 'Chat details' or the AGI Work session dock (apps/web/features/chat/lib/agi-work.ts:24, 46).
- Web and desktop: Tasks page with List and Board layout buttons (TasksPage.tsx:77-81; apps/web/app/tasks/page.tsx; apps/desktop/src/features/tasks/DesktopTasks.tsx).
- Artifact panel: button titled 'Version history' (ArtifactPreview.tsx:2667); restore also in the more menu (ArtifactPreview.tsx:2348).
- Code page: 'Changes' panel (apps/web/features/code/code-surface.ts:174).
- Side panel edge: separator labelled 'Resize artifacts panel' and similar (ArtifactsPanel.tsx:690).
- VS Code: view container 'AGI Code' in the activity bar (apps/extension-vscode/package.json:953-971) and a cloud tasks tree grouped Needs you, Working, Ready for review, Done, Stopped (apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:~35-55).
- Mobile: activity timeline in messages (apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx), artifact version sheet (ArtifactVersionHistorySheet.tsx), code session view (apps/mobile/src/features/companion/components/CodeSessionView.tsx:336-345).
- CLI: spinner with elapsed time (apps/cli/src/tui/tui_app.rs:3000-3006) and the 'Rewind' checkpoint picker (apps/cli/src/tui/widgets/checkpoint_picker.rs:11).

**Before you start**

- Cloud tasks need a signed-in account; the board takes cloud agent runs (TasksBoard.tsx:2, 26).
- Desktop Local mode sends Tasks to a separate 'agent-tasks' panel (DesktopShellV3.tsx:~614-617).

**Screens and controls**

- Timeline toggle with chevron, 'Show N earlier steps' button, live status line (AgentActivityTimeline.tsx:869-905).
- Board columns Queued, Running, Needs approval, Paused, Done, Failed, Cancelled, Archived; empty ones hidden except Queued, Running, Needs approval, Done (packages/contracts/types/src/cross-device.ts:398-411).
- Card actions: select, open conversation, approve, deny, pause, resume, cancel, archive (TasksBoard.tsx:32-47).
- Version history list: 'Version N', '· Latest', time and change summary, Restore button, close button (ArtifactVersionHistory.tsx:128-178).
- Changes panel: file checkbox 'Include in the commit:', expand chevron, discard button, refresh, wide toggle, close (CodeChangesPanel.tsx:73-110, 353-402).
- Resize separator with keyboard (SidePanelResizeHandle.tsx:54-72).
- Interactive cards: clarify, answer UI, image, itinerary, map search, places, product comparison, app card (InteractiveCardBlock.tsx:34-52).

**Journey**

1. Start a run in chat; the timeline row appears and updates live.
2. Expand it to read steps; approvals appear inline.
3. For tasks, open Tasks, choose Board; cards move between columns as states change (TasksBoard.tsx:76-79).
4. On an artifact, open Version history, click a version to view it, press Restore and confirm.
5. On a code task, open Changes, expand a file, include or discard it, then commit.
6. Drag the edge or focus it and press arrow keys to resize.

**What the person sees and gets**

- Screen reader announcement of activity changes through an aria-live span (AgentActivityTimeline.tsx:870-872).
- Run line such as 'Thinking · 12s' or the running step with elapsed time (AgentActivityTimeline.tsx:188-189, 359-361).
- Version summary 'N lines added, M removed', 'Same as version N', 'Line order changed' (ArtifactVersionHistory.tsx:45-66).
- Restore dialog 'Restore version N?' that says the version is added as the new latest (ArtifactPreview.tsx:1012-1019).
- Diff truncation note when the server cut the diff (CodeChangesPanel.tsx:439-441).
- Progress line with role status and 'completed/total' count in the task dock (WorkSessionPanel.tsx:795-806).

**Settings**

- Board or list choice stored in the browser (TasksPage.tsx:87-91).
- Side panel width kept in the persisted UI store 'chat-ui-store' (packages/ui/unified-chat/src/stores/uiStore.ts:74-82).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Timeline component with collapsed default, paging of earlier steps, approvals, failure line and screen reader announcement (AgentActivityTimeline.tsx:679-905).
- Board with stage grouping from run state and unread tracking (TasksBoard.tsx:76-80).
- List or Board toggle, default list (TasksPage.tsx:77-91, 612-619).
- Work session task dock with step list, active tool header and tabs (WorkSessionPanel.tsx:790-870).
- Version history newest first with restore through a confirm dialog (ArtifactVersionHistory.tsx:83-95; ArtifactPreview.tsx:1008-1029).
- Diff panel parses a unified diff into files and shows added and removed lines; include checkbox and confirmed discard (apps/web/features/code/code-diff.ts:13-58; CodeChangesPanel.tsx:305-319).
- Interactive cards feed answers back through a resume hook and an answer follow-up (InteractiveCardBlock.tsx:17-19, 55-57).
- Resize handle: role separator, vertical, min 280, max 900, current width, pointer drag, arrows by 24 px, Home and End (SidePanelResizeHandle.tsx:50-72; uiStore.ts:6-7).
- Handle used by the artifacts, research, work session and project sources panels (grep of SidePanelResizeHandle in apps/web).

**Incomplete**

- Per-step duration in the timeline was not found; only the run's elapsed time is formatted (AgentActivityTimeline.tsx:241-252, 359-361).
- VS Code 'task board' is a grouped tree with different stage names than the web board (cloudTasksTree.ts:~35-55).
- CLI has no task board; the checkpoint picker named Rewind restores prompts and code, not artifact versions [inferred] (checkpoint_picker.rs:11-20).
- Brief cites split-pane code in VS Code (apps/extension-vscode/src/platform/applyEdit.ts:78); the lines show an 'apply inline or view in new tab' choice, not a resizable split (applyEdit.ts:77-90). Real split behaviour in VS Code unknown.

**Present but disconnected or switched off**

- Chrome task board and progress card are unverified in the brief; no code was read for them.

**Not available**

- Docking layout manager on Web and desktop: none found (brief S9.25 missing).
- VS Code version history and Chrome version history (brief S9.26).
- CLI task board (brief S9.21).
- Chrome diff viewer (brief S9.27).

## 4. Required behaviour

**Established requirements**

- The steps of a run show in time order, each with its state and, where known, how long it took. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.19)
- Tasks lay out as a board with a column per status. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.21)
- A running task shows a card with current state and progress that updates while it runs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.35)
- The version panel lists saved versions (when, what) and lets the user open or restore one. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.26)
- Changes show as a diff with added and removed lines marked, readable before accepting. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.27)
- An answer can embed a widget operated in place; the choice or state feeds back into the conversation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.36)
- Two panes can be resized by pointer and by keyboard. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.24)
- Panels can be moved to left, right, bottom or floating and the layout keeps the arrangement. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.25)
- An action that cannot be undone asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Run an agent turn: the timeline lists steps in the order they started, and a screen reader hears status changes.
2. Switch Tasks to Board: each run appears in the column for its state; Queued, Running, Needs approval and Done always show.
3. On a card in Needs approval, Approve and Deny act on that run and focus stays sensible after it moves.
4. Edit an artifact twice: Version history shows three versions, newest first, with 'N lines added, M removed'.
5. Restore Version 1: a confirm dialog appears; after confirm a new latest version holds Version 1's content and versions in between remain.
6. Open Changes: expanding a file shows added lines and removed lines marked differently; Discard asks before acting.
7. Focus the resize separator and press Left: the panel widens by 24 px; Home sets 280, End sets 900; aria-valuenow follows.
8. Operate an interactive card: the choice appears in the conversation as the next input.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Timeline step durations should show per step when the data has a start and end [inferred from 'where known'].
- The board should keep the same stage names on every app [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align the VS Code tree group names with the web board stages.
- [proposed] Decide whether the docking manager is wanted for Web and desktop, or mark S9.25 not applicable because VS Code supplies it.
- [proposed] Add unit tests for ArtifactVersionHistory, SidePanelResizeHandle and CodeChangesPanel; none were found.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AgentActivityTimeline | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Shared run timeline. |
| component | MessageBubble timeline mount | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Mounts timeline, tool timeline and interactive cards in answers (lines 1860, 2020 per brief). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Feeds activity state and interactive card resume (brief 1436; InteractiveCardBlock.tsx:17). |
| component | TasksPage and TasksBoard | `packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx` | Board and card actions; page at TasksPage.tsx. |
| service | AGENT_TASK_BOARD_STAGES | `packages/contracts/types/src/cross-device.ts` | Stage list and state to stage map (lines 398-423). |
| screen | Web tasks page | `apps/web/features/tasks/components/TasksPage.tsx` | Web host for the shared page. |
| screen | DesktopTasks | `apps/desktop/src/features/tasks/DesktopTasks.tsx` | Desktop host. |
| component | WorkSessionPanel | `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx` | Task dock with progress, steps and resize. |
| component | ArtifactVersionHistory | `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx` | Version list and restore buttons. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Opens history, confirms restore (lines 1008-1029, 2667, 2981). |
| component | CodeChangesPanel | `apps/web/features/code/components/CodeChangesPanel.tsx` | Changes list, include, discard, diff body. |
| service | code-diff | `apps/web/features/code/code-diff.ts` | Parses unified diff into per-file bodies and line kinds. |
| component | InteractiveCardBlock (web) | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Card registry by kind. |
| component | InteractiveCardBlock (mobile) | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Mobile cards. |
| component | Chrome interactive cards | `apps/extension/src/features/side-panel/interactiveCards.ts` | Side panel cards. |
| component | SidePanelResizeHandle | `apps/web/features/chat/components/SidePanelResizeHandle.tsx` | Separator with pointer and keyboard resize. |
| store | uiStore | `packages/ui/unified-chat/src/stores/uiStore.ts` | Width state, clamp, persisted as chat-ui-store. |
| component | Mobile AgentActivityTimeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Mobile timeline. |
| component | ArtifactVersionHistorySheet | `apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx` | Mobile version list. |
| component | CodeSessionView | `apps/mobile/src/features/companion/components/CodeSessionView.tsx` | Mobile code session timeline and changes. |
| component | cloudTasksTree | `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts` | VS Code tree of cloud runs by group. |
| command | CLI checkpoint picker | `apps/cli/src/tui/widgets/checkpoint_picker.rs` | Rewind list of prompts and tracked files. |
| config | VS Code view container | `apps/extension-vscode/package.json` | Registers the AGI Code view container (lines 953-971). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chat streaming events build the activity state on the device; the timeline renders it. | device | AgentActivityTimeline.tsx:679-720; apps/web/lib/hooks/useChatStream.ts |
| The Tasks page loads cloud agent runs and groups them by stage on the device. | device and our servers | TasksBoard.tsx:76-80 (CloudAgentRun type imported at line 4) |
| Approve, deny, pause, resume, cancel and archive send a request for that run; the board updates when the state changes. | our servers | TasksBoard.tsx:32-47 (handlers passed in by TasksPage) |
| Version history reads the versions held in the artifact store; Restore adds a new latest version and removes the stored draft. | device | ArtifactPreview.tsx:1020-1027 |
| Changes panel receives the diff from the cloud code API, parses it and shows it; discard and commit are requests to that API. | device and our servers | CodeChangesPanel.tsx:119-134, 273; apps/web/features/code/services/cloud-code-api.ts per brief |
| A card choice is sent back to the conversation through the card resume hook or the answer follow-up. | device and our servers | InteractiveCardBlock.tsx:17-19, 55-57 |
| Resize writes the clamped width to the UI store, which saves it in the browser. | device | uiStore.ts:63, 74-82 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact versions | Artifact store in the app (versionsById) on the device; mobile uses its own artifact store | not established | Restoring keeps all versions (ArtifactPreview.tsx:1012-1014) |
| Task board layout choice | browser local storage (TASK_LAYOUT_STORAGE_KEY) | No | Until cleared (TasksPage.tsx:87-91) |
| Side panel width | browser local storage key chat-ui-store | No | Until cleared (uiStore.ts:74-82) |
| Task unread views | browser through loadTaskViews and markTaskViewed | No | not established (task-display.ts not read) |

**Models and providers.** The timeline and board display what the run reports; they do not choose a model. Provider and model labels in steps were not established.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Task board and cloud runs need an account; local agent tasks have a separate panel in desktop Local mode (DesktopShellV3.tsx:~614-617). |
| Permissions | Approve and deny act on tool approvals the run asked for; discard asks first (CodeChangesPanel.tsx:314-319). |
| Subscription | none found in the code for the board, timeline, version history or diff. |
| Limits and metering | Timeline shows a page of steps and lets the person load earlier ones (AgentActivityTimeline.tsx:883-899). Side panel width limited 280 to 900 (uiStore.ts:6-7). |
| Feature flags | none found in the code for these components. |
| Model compatibility | Interactive cards depend on the answer carrying a card of a known kind; unknown kinds are not rendered by the registry [inferred] (InteractiveCardBlock.tsx:34-52). |
| Provider restrictions | none found in the code. |
| Local mode | Desktop Local mode uses the 'agent-tasks' panel instead of the cloud board (DesktopShellV3.tsx:~614-617). Timeline and version history work from device state; whether Local mode feeds them was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Nothing to report | A completed or cancelled run with no reportable work renders nothing. | AgentActivityTimeline.tsx:862-867 |
| Running | Collapsed line names the running step with elapsed time in Work mode. | AgentActivityTimeline.tsx:352-361 |
| Awaiting approval or input | Treated as active; approval controls render inline with expiry check. | AgentActivityTimeline.tsx:61, 90-92, 695-700 |
| Failure | Reason and actions render on the summary line. | AgentActivityTimeline.tsx:78-90 |
| Board empty stage | Stages marked alwaysShown stay when showEmptyStages is true. | TasksBoard.tsx:79-81; cross-device.ts:403-411 |
| Restore with unsaved edits | Dialog says unsaved edits are discarded and marks the action destructive. | ArtifactPreview.tsx:1010-1019 |
| Diff truncated by the server | A note is shown. | CodeChangesPanel.tsx:439-441 |
| File without a diff body | Row shows no expand chevron. | CodeChangesPanel.tsx:83-99 |
| Keyboard | Escape closes version history; separator is focusable (tabIndex 0). | ArtifactVersionHistory.tsx:98-104; SidePanelResizeHandle.tsx:62 |
| Reduced motion | Transitions are disabled with motion-reduce classes on the handle and chevron. | SidePanelResizeHandle.tsx:66; AgentActivityTimeline.tsx:884-893 |
| Offline or reconnect | not handled in the code reviewed for these components. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/__tests__/AgentActivityTimeline.test.tsx`: Timeline rendering; sibling files cover agiWork, stopped, computerUse, connectorSteps, connectorLabel, sourceCount.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksBoard.unread.test.tsx`: Board unread markers; sibling TasksPage tests cover pause, archive, approvals, live, details, deep link.
- `apps/web/features/tasks/components/TasksPage.test.tsx`: Web tasks page.
- `apps/desktop/src/features/tasks/__tests__/DesktopTasks.test.tsx`: Desktop tasks.
- `apps/web/features/chat/components/work-session/WorkSessionPanel.test.tsx`: Work session panel.
- `apps/web/features/code/code-diff.test.ts`: Diff parsing.
- `apps/web/features/chat/components/messages/InteractiveCardBlock.test.tsx`: Cards; siblings cover answer-ui and respond.
- `apps/mobile/__tests__/ArtifactVersionHistory.test.tsx`: Mobile version history.
- `apps/mobile/__tests__/AgentActivityTimeline.test.tsx`: Mobile timeline; ToolTimelineCodeAndDiff.test.tsx covers diff in tool rows.

**Test scenarios**

- **Resize by keyboard**
  1. Open an artifact so the panel shows.
  2. Tab to 'Resize artifacts panel'.
  3. Press Left, then Home, then End.
  - Expected: Width grows 24 px, then 280, then 900; aria-valuenow matches; reload keeps the width.
- **Restore a version**
  1. Edit an artifact twice.
  2. Open Version history.
  3. Press Restore on Version 1 and confirm.
  - Expected: A new latest version equals Version 1; earlier versions remain.
- **Board actions**
  1. Open Tasks and choose Board.
  2. Pause a running card, then resume it.
  - Expected: The card moves to Paused then Running.
- **Diff review**
  1. Open a cloud code task with changes.
  2. Expand a file.
  3. Untick Include, then Discard another file.
  - Expected: Added and removed lines are marked; discard asks first; unticked file is left out of the commit.
- **Interactive card**
  1. Ask a question that returns a clarify card.
  2. Pick an option.
  - Expected: The choice is sent as the next turn.
- **Timeline accessibility**
  1. Start a run with a screen reader on.
  2. Listen while steps change.
  - Expected: Status changes are announced without moving focus.

**Where to look when it fails**

- Failure line text on the timeline summary (AgentActivityTimeline.tsx:78-90).
- Board state mapping in cross-device.ts:413-423.
- Cloud run list error text on the Tasks page (TasksPage.tsx, not fully read).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)
- VS Code: [70-qa/test-plans/vscode/009-compound-interface-components.md](../../70-qa/test-plans/vscode/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **No per-step duration in the timeline.** Affects: Web, desktop window, mobile.. Evidence: Only run elapsed time formatted, AgentActivityTimeline.tsx:241-252.. Work needed: Show step durations where start and end are known.
- **Docking layout manager missing on Web and desktop; VS Code relies on the host.** Affects: Web, desktop.. Evidence: Brief S9.25; package.json:953-971 only registers a view.. Work needed: Decide scope; update brief if VS Code only registers a view.
- **No unit tests found for ArtifactVersionHistory, SidePanelResizeHandle or CodeChangesPanel.** Affects: Web.. Evidence: Search of test files for these names found only the mobile version history test.. Work needed: Add component tests.
- **VS Code board groups differ from the web board stages.** Affects: VS Code.. Evidence: cloudTasksTree.ts stage groups versus cross-device.ts:403-410.. Work needed: Align or document.
- **Brief code anchors for CLI version history and VS Code split pane do not match the described feature.** Affects: Brief accuracy.. Evidence: tui_app.rs:3005 is spinner time; applyEdit.ts:77-90 is a choice prompt.. Work needed: Correct the ledger rows.
- **Chrome task board, progress card, version history and diff not built or unverified.** Affects: Chrome.. Evidence: Brief S9.21, S9.26, S9.27, S9.35.. Work needed: Verify or build.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- file:packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx
- file:packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx
- file:apps/web/features/chat/components/SidePanelResizeHandle.tsx
- store:chat-ui-store
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design

## Unknown

- Whether the VS Code extension has any resizable split pane; the cited lines show none.
- How mobile version history lists and restores (sheet not read beyond its name and test).
- Whether Chrome has a task board, progress card or diff; not read.
- Where unread task views are stored beyond the browser helper (task-display.ts not read).
- How per-step durations are carried in activity entries.
- Which product documents under docs/product describe these components; none were read.
