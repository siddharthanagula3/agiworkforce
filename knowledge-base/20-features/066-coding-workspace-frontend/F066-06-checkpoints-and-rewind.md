---
id: "F066-06"
type: "feature"
title: "Checkpoints and rewind"
aliases: ["Checkpoint list", "Restore checkpoint", "Rewind", "Rewind to before this turn", "/rewind", "Code: Checkpoints", "Restore code and conversation", "S66.22", "S66.23"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "missing", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.22", "S66.23"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "mode:local", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-execution-boundaries", "F066-05", "F066-01", "file:apps/cli/src/agent/checkpoints.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-06 Checkpoints and rewind

Each prompt or turn saves a point the person can go back to. On Desktop (web UI in Electron) the Review pane rewinds code, conversation or both after a preview. The CLI has /rewind and a Rewind picker. VS Code has a Checkpoints quick-pick. Web in a browser tab and mobile have none.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.22](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6622), [S66.23](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6623).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Saves the code state and conversation position before each prompt or turn and lets the person restore code, conversation or both, after confirming what will change.

**Why it exists.** Agents sometimes go the wrong way. Going back to a known point is safer than manual undo (S66.22, S66.23; doc: docs/product/experience-contract.md:274).

**Who uses it.** Developers on Desktop, CLI and VS Code.

**Problems it solves**

- An agent turn broke the project.
- Wanting to retry a prompt from the same starting point.
- Fear of letting the agent edit.

**Use cases**

- Rewind to before the last turn after a bad refactor.
- Restore only the conversation to retry with a different prompt.
- In the CLI run /rewind list then /rewind 2 code.
- In VS Code pick a checkpoint and choose 'fork and code'.

## 2. User experience

**Where to find it**

- Desktop and web in Electron: Review pane button 'Rewind to before this turn' per turn and 'Rewind to here' on transcript messages (local-code.ts:1553-1556; LocalReviewPane.tsx:510-520). A chooser dialog titled 'Rewind to before this turn' offers 'Restore code and conversation', 'Restore conversation', 'Restore code' and 'Never mind' (LocalRewindChooser.tsx; local-code.ts:1566-1583).
- CLI: /rewind [list] and /rewind <n> [both|conversation|code] (registry.rs:1130-1135); the TUI picker titled 'Rewind' (checkpoint_picker.rs:6-12; tui_app.rs:4401).
- VS Code: command 'Code: Checkpoints' (ChatStateManager.ts:3692-3760).
- Web in a browser tab and mobile: none.

**Before you start**

- Desktop: CLI reports checkpoints (and review, rewind_choice) and the session is not archived or over SSH (LocalSessionPanel.tsx:437-439; developerSessionService.ts:485-505).
- A turn that changed files for Review; a checkpoint is made for every prompt in the CLI (checkpoint_picker.rs:12; agent/checkpoints.rs:15-17).
- VS Code: an open developer session.

**Screens and controls**

- Review pane turn rows with 'Rewind' and 'Summarize from here' options.
- Rewind chooser with explanation per choice (local-code.ts:1574-1578).
- CLI picker: Pick stage then action stage with 'Never mind' (checkpoint_picker.rs:20-60).
- VS Code: quick-pick of prompts newest first with file counts, second quick-pick for what to restore, then a warning confirmation.

**Journey**

1. 1. Open Review (or /rewind list, or Code: Checkpoints).
2. 2. Choose the turn or prompt to go back to.
3. 3. Choose what to restore: code, conversation or both.
4. 4. Read the preview: files that go back and messages removed.
5. 5. Confirm.
6. 6. The session reloads at that point; the prompt may return to the message box.

**What the person sees and gets**

- Confirmation text from localRewindConsequence / localRestoreConsequence naming files and message counts (use-local-review.ts:276-300).
- Notices: 'Every file already matches how it was before this turn...' and 'The conversation was condensed after this turn, so it can no longer rewind with the files.'
- CLI prints a description of the rewind and warns if the rewound conversation could not be saved (registry.rs:1159-1170).
- VS Code message 'this session has no checkpoints yet. One is saved with each prompt.'

**Settings**

- None found for checkpoints. Settings fields enableCheckpointing and checkpointInterval were cut (doc: docs/decisions/wire-or-cut.md).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop Review: per-turn checkpoint diff, preview-then-confirm rewind with restore choice and fork rewind, 'Summarize from here' (use-local-review.ts:223-310; LocalRewindChooser.tsx; dispatcher.ts:777-803,2771-2800). The brief marks web and Desktop missing; the code has it for the Electron Desktop.
- CLI: CheckpointLog saved with each prompt, max 100, file snapshots and message count (apps/cli/src/agent/checkpoints.rs:15-17,31-47); /rewind and TUI picker (registry.rs:1130-1200; tui_app.rs:4401-4427).
- VS Code: lists checkpoints from the CLI app-server (developer_host.rs:3661-3698), quick-pick, restore choices and a confirmation (ChatStateManager.ts:3692-3760).

**Incomplete**

- CLI typed command /rewind <n> <mode> applies with no confirmation prompt in the code read (registry.rs:1136-1170); the picker has a 'Never mind' step.
- Rewind requires a git tree checkpoint on Desktop and a CheckpointLog in the CLI; two separate systems exist (see unknowns).

**Present but disconnected or switched off**

- Rewind controls hide when the CLI does not report checkpoints or rewind_choice; without rewind_choice only the 'both' option is offered (LocalRewindChooser.tsx:48-52).
- Mobile: no checkpoint UI.

**Not available**

- Web in a browser tab and cloud sessions: no checkpoints found.
- Mobile: none.
- Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- The user sees a list of checkpoints (saved states of code and conversation) for the session. (source: S66.22)
- The user restores the session's code and conversation to an earlier checkpoint. (source: S66.23)
- Reverting a section asks first and names the files whose changes are lost; the host advertises checkpoints true only when the RPC exists. (source: doc: docs/decisions/wire-or-cut.md (2026-10-10 table))
- Checkpoint/rewind is a required developer-screen function. (source: doc: docs/product/experience-contract.md:274)
- Code gets a checkpoint; an agent never destroys user data on its own. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Each prompt or turn that changed files appears as a checkpoint with a short label and file count.
2. Choosing a rewind first shows which files go back and how many messages are removed, and nothing changes until the person confirms.
3. 'Restore conversation' leaves files unchanged and says so; 'Restore code' leaves the conversation unchanged.
4. A checkpoint whose conversation was compacted offers code only.
5. /rewind list in the CLI shows checkpoints newest first.
6. In VS Code a session with no checkpoints says so instead of opening an empty list.
7. After a rewind of code, the files in the folder match their state before that turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The two checkpoint systems answer different callers: CLI/VS Code use CheckpointLog; the Desktop Review pane uses per-turn git tree checkpoints (developer_host.rs:3661 vs review.rs).
- [inferred] The old VS Code boundary note that cuts its checkpoint UI is stale, because showCheckpoints exists.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a confirmation to the typed /rewind command.
- [proposed] Bring checkpoint list and restore to web cloud sessions and mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalRewindChooser | `apps/web/features/code/components/LocalRewindChooser.tsx` | Dialog to choose restore code, conversation or both. |
| hook | useLocalReview | `apps/web/features/code/hooks/use-local-review.ts` | List checkpoints, preview rewind, confirm and apply. |
| component | LocalReviewPane | `apps/web/features/code/components/LocalReviewPane.tsx` | Rewind buttons per turn (lines 510-520). |
| config | LOCAL_REVIEW_COPY | `apps/web/features/code/local-code.ts` | Rewind and restore labels (lines 1553-1590). |
| service | Desktop dispatcher checkpoint commands | `apps/desktop/electron/runtime/dispatcher.ts` | developer_checkpoint_list, diff, revert, stage, developer_thread_revert. |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Maps checkpoints, review and rewind_choice capabilities (lines 485-505). |
| service | CLI app-server host | `apps/cli/src/app_server/developer_host.rs` | list_checkpoints (3661), checkpoint_diff, revert_thread, capabilities (1058). |
| service | CLI app-server review | `apps/cli/src/app_server/review.rs` | Per-turn checkpoint diff and section revert. |
| service | CLI CheckpointLog | `apps/cli/src/agent/checkpoints.rs` | Per-prompt snapshots, max 100, stored beside the session. |
| service | CLI agent history | `apps/cli/src/agent/history.rs` | Rewind of conversation history (brief cites lines 92 and 105; not read). |
| component | CheckpointPickerView | `apps/cli/src/tui/widgets/checkpoint_picker.rs` | CLI Rewind picker. |
| command | CLI /rewind | `apps/cli/src/repl/registry.rs` | rewind_session and checkpoint_list (lines 1130-1200). |
| command | VS Code showCheckpoints | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Quick-pick flow (line 3692). |
| command | VS Code command registration | `apps/extension-vscode/src/core/commandSetup.ts` | agi-workforce.showCheckpoints (line 1381). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A checkpoint is recorded before each prompt (CLI log) or turn (host git tree). | device | checkpoints.rs:15-17; developer_host.rs:1020-1025; doc: docs/decisions/wire-or-cut.md 2026-10-10 |
| The page lists checkpoints from the host. | device | use-local-review.ts (listLocalCheckpoints); dispatcher.ts:2771 |
| The person picks a point and what to restore; the page asks the host for a preview. | device | use-local-review.ts:276-285 |
| After confirmation the host puts files back and/or truncates the conversation. | device | dispatcher.ts:2786-2797 (developer_thread_revert); reason text 'Rewinding puts the files... back' (dispatcher.ts:799-803) |
| The session reloads; the next turn uses the rewound conversation with the chosen model. | device and our servers | callbacks onRewound (LocalSessionPanel.tsx:735-745) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI checkpoint index and file blobs | beside the session file on the device (CheckpointLog::beside, storage module blobs/ and index.json) | no | capped at 100 checkpoints; files over 8 MiB are skipped (checkpoints.rs:15-17) |
| Per-turn git tree checkpoints | the repository's git storage (ref layout not read) | no | unknown |
| Rewound conversation | the managed session file; CLI warns when saving it fails (registry.rs:1163-1168) | no | removed messages are not recoverable (local-code.ts:'say a conversation-only rewind cannot be recovered') |

**Models and providers.** Rewind itself calls no model. Summarize-from-here asks the session's model to condense messages (local-code.ts compactBody). Any model the session can use applies.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account call found for rewind. |
| Permissions | git.write for thread revert and checkpoint revert (dispatcher.ts:785-803); shell.execute for checkpoint list and diff. |
| Subscription | none found in the code for rewind. Summarize uses the session model and follows its plan rules. |
| Limits and metering | CLI keeps at most 100 checkpoints and skips snapshot files larger than 8 MiB (checkpoints.rs:15-17); sections per request max 500 (dispatcher.ts:1047). |
| Feature flags | CLI capabilities checkpoints, review, rewind_choice, fork_and_rewind (developer_host.rs:1058,1102; developerSessionService.ts:485-505). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Mode:local rewind runs entirely on the device with no payment. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No checkpoints | CLI '(no checkpoints yet: each prompt you send makes one)'; VS Code information message; web 'No turn in this session has changed a file yet.' | checkpoint_picker.rs:9; ChatStateManager.ts:3715-3719; local-code.ts:1525 |
| Conversation compacted | Only code can come back; chooser says the conversation can no longer rewind. | checkpoint_picker.rs:11-12; local-code.ts:1560-1561 |
| Nothing to restore | Notice instead of an empty confirmation. | local-code.ts:1562-1565; ChatStateManager.ts:3739-3743 |
| Large files with no snapshot | Rewind skips them and says which. | use-local-review.ts:295-300 (localRewindSkippedConsequence) |
| Save of rewound conversation fails | CLI warns that resuming later brings back later messages. | registry.rs:1163-1168 |
| Archived or SSH session | Rewind controls absent. | LocalSessionPanel.tsx:437 |
| Cancel | 'Never mind' or Esc closes without change. | checkpoint_picker.rs:20-60; LOCAL_REVIEW_COPY.chooseCancel |
| Offline / timeout | not handled in the code beyond error text. | not handled in the code (searched use-local-review.ts) |
| Accessibility | Chooser is a dialog with title and description; CLI has plain mode. | LocalRewindChooser.tsx:20-30 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalReviewPane.test.tsx`: Rewinds files and conversation only after the reader sees which files go; restores code alone after choosing it; says a conversation-only rewind cannot be recovered and leaves files.
- `apps/web/features/code/hooks/use-local-review.test.ts`: Retryable state when a native request is rejected.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher; mentions worktree or checkpoint on 39 lines (cases not itemised).
- `apps/desktop/electron/__tests__/developerSessionService.test.ts`: Developer session service; 129 lines mention worktree or checkpoint (cases not itemised).
- `apps/cli/src/agent/checkpoints/boundary_tests.rs`: Checkpoint boundary tests (module declared at checkpoints.rs:19; file not opened).
- `apps/cli/tests/developer_session_host.rs`: App-server host (checkpoint cases not read).

**Test scenarios**

- **Rewind code only**
  1. Let the agent edit two files in one turn.
  2. Open Review, Rewind that turn, choose 'Restore code', read the file list, confirm.
  - Expected: Both files return to their earlier content; the conversation is unchanged.
- **Rewind both**
  1. Choose 'Restore code and conversation' for a turn.
  - Expected: Files and later messages are removed; the prompt can be sent again.
- **CLI list and rewind**
  1. Send two prompts that edit files.
  2. Run /rewind list, then /rewind 1 code.
  - Expected: List shows two entries newest first; code returns to before the latest prompt.
- **Compacted history**
  1. Summarize the conversation, then try to rewind to an earlier turn.
  - Expected: Only code can be restored and the chooser says why.
- **VS Code no checkpoint**
  1. Open a new session and run Code: Checkpoints.
  - Expected: An information message says no checkpoints yet.
- **Cancel**
  1. Open the chooser and press 'Never mind'.
  - Expected: Nothing changes.

**Where to look when it fails**

- Strings 'Rewind: ...' errors from list_checkpoints (developer_host.rs:3677).
- 'Could not rewind: ...' (registry.rs:1169).
- Desktop permission refusals for git.write.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **Brief says Desktop missing; the code has checkpoint list, diff, revert, stage and rewind on Desktop.** Affects: Desktop planning. Evidence: dispatcher.ts:777-803; LocalRewindChooser.tsx. Work needed: Update brief; live check.
- **doc: docs/decisions/wire-or-cut.md (2026-07-30) still says the VS Code checkpoint UI is cut, but showCheckpoints exists.** Affects: VS Code, docs. Evidence: ChatStateManager.ts:3692; commandSetup.ts:1381. Work needed: Update the decision record.
- **Typed /rewind <n> <mode> shows no confirmation.** Affects: CLI. Evidence: registry.rs:1136-1170. Work needed: Add a confirmation naming what is lost.
- **Two checkpoint systems with different data and limits.** Affects: All apps. Evidence: checkpoints.rs vs app_server/review.rs. Work needed: Document or unify ownership.
- **No checkpoints on web cloud sessions and mobile.** Affects: Web cloud, mobile. Evidence: no code found. Work needed: Decide scope.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- mode:local
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-execution-boundaries
- F066-05
- F066-01
- file:apps/cli/src/agent/checkpoints.rs

## Unknown

- Where per-turn git checkpoints live and how long they are kept.
- Whether the CLI typed rewind is confirmed elsewhere (for example in the TUI wrapper at tui_app.rs:6045).
- What boundary_tests.rs covers.
- How Desktop and CLI checkpoint systems relate in practice.
- Whether VS Code offers fork-and-rewind against every runtime (it checks offers('forkAndRewind')).
