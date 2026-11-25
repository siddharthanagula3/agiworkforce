---
id: "F066-05"
type: "feature"
title: "Review the agent's changes"
aliases: ["Diff viewer", "File-change summary", "Inline review comments", "Hunk acceptance and rejection", "Changes panel", "Review pane", "Review code", "Review changes", "/diff-review", "S66.18", "S66.19", "S66.20", "S66.21"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.18", "S66.19", "S66.20", "S66.21"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "mode:local", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "F066-06", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-05 Review the agent's changes

Shows what the agent changed. On Desktop and web in Electron, a Changes panel lists changed files against the last commit with discard, and a Review pane shows each turn's hunks with Stage, Revert and line comments sent back to the agent. The CLI has /diff-review and VS Code has accept and reject diffs.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.18](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6618), [S66.19](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6619), [S66.20](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6620), [S66.21](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6621).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows line-level diffs and a summary of created, modified and deleted files, lets the person keep or undo single hunks, and send comments on lines back to the agent.

**Why it exists.** People must be able to check and steer what an agent did before it counts (S66.18 to S66.21; doc: docs/product/experience-contract.md:271).

**Who uses it.** Developers on Desktop, web (Electron and cloud), CLI, VS Code; mobile for read-only review when enabled.

**Problems it solves**

- Trusting changes without seeing them.
- All-or-nothing undo.
- Explaining a fix request in words instead of on the line.

**Use cases**

- Open Changes after a turn and read the diff of one file.
- Review a turn's hunks; stage the good ones and revert the rest.
- Write a comment on a line and send all comments back to the agent.
- In the CLI run /diff-review and press y or n per hunk.

## 2. User experience

**Where to find it**

- Desktop and web in Electron: side panel 'Changes' (aria-label 'Changes', LocalChangesPanel.tsx:141-165; code-surface.ts:174) with button 'Review code', and the 'Review' pane (shortcut Ctrl+Shift+G or Cmd+Shift+G, local-code.ts:'Review changes (Ctrl+Shift+G...)', LocalSessionPanel.tsx:700-712).
- Cloud session: changes panel with commit and discard (CodeChangesPanel.tsx).
- CLI: /diff-review (apps/cli/src/tui/tui_app.rs:6582-6670) and /diff.
- VS Code: 'Code: Accept Diff', 'Reject Diff', 'Accept All Diffs in File', 'Reject Current Diff', batch variants, 'Restore Discarded Changes' (package.json).
- Mobile: 'Changes' pill and changes sheet (CodeSessionView.tsx:448-490; CodeSessionChangesSheet.tsx), plus cloud changes sheet for cloud sessions.

**Before you start**

- A git repository folder (otherwise 'This folder is not a git repository, so there are no changes to show.' (local-code.ts:'changesNotRepository')).
- Review pane needs the CLI capabilities checkpoints and review and a session not archived or over SSH (LocalSessionPanel.tsx:432-440).
- Git permissions: git.read for diff, git.destructive for discard, git.write for stage and revert (dispatcher.ts:906-913,785-798).

**Screens and controls**

- Changes: filter box, file rows with state marker and +/- counts, pencil 'Edit <path>', undo icon 'Discard the changes to <path>' (LocalChangesPanel.tsx:33-110).
- Review: Turn list, per-file Stage file and Revert file, per-hunk Stage and Revert, comment field 'What should change here?', 'Send to the agent', 'Discard comments' (LocalReviewPane.tsx; local-code.ts:1518-1550).
- CLI diff overlay: ↑↓ file, ←→ hunk, y approve, n reject, s skip, Enter done, d twice discards an unstaged hunk (tui_app.rs:6660-6670).
- VS Code: inline diff decorations with accept and reject.

**Journey**

1. 1. After a turn, open Changes; the list refreshes when messages or terminal commands change.
2. 2. Click a file row to expand its diff.
3. 3. To undo one file, click the undo icon and confirm 'Discard these changes?'.
4. 4. For hunk control, press 'Review code' to open Review.
5. 5. Comment on lines, then 'Send to the agent'; or Stage or Revert hunks (a confirmation names the files).
6. 6. Close the panel; unsaved editor edits are confirmed first.

**What the person sees and gets**

- Diff body with added and removed lines; line counts +N and −N.
- 'Compared with HEAD <rev>' note; 'No changes to show'; 'The diff is too large to show in full.'
- 'The changes in this folder could not be read.' and 'That change could not be discarded.' as alerts.
- Review notice after revert or rewind (use-local-review.ts).

**Settings**

- Diff sign display on mobile (useShowDiffSigns, code appearance settings).
- Changes panel width toggle 'Widen the panel' (code-surface.ts:437).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Local Changes panel: reads working tree against HEAD through developer_session_changes, shows states, filter, counts, discard per file with confirmation (LocalChangesPanel.tsx:168-215; dispatcher.ts:3101-3104). The discard text says the file goes back to its last committed version and 'This cannot be undone' (code-surface.ts:192-193), so it also drops the person's own uncommitted edits to that file.
- Local Review pane: per-turn diff, Stage and Revert per file or hunk with a preview that names affected files, line comments sent as one turn, discard comments confirmation (LocalReviewPane.tsx:90-260,392-410; use-local-review.ts:97-300; local-code.ts:1518-1552). The brief says inline comments and hunk accept/reject are missing on web and Desktop; the code has both.
- Desktop host: developer_checkpoint_diff, developer_checkpoint_stage, developer_checkpoint_revert (dispatcher.ts:781-798, 2776-2785).
- CLI: /diff-review stages approved files or hunks, unstages rejected, double-d discards (tui_app.rs:6582-6670; diff_review.rs:1-10).
- VS Code: accept and reject for proposed diffs with a stale-edit guard (providers/diffDecorationProvider.ts:375-410; test diffStaleAccept.test.ts).
- Cloud: changes list with discard, commit and pull request checks (CodeChangesPanel.tsx; app/api/code/sessions/[sessionId]/changes/route.ts GET and POST).

**Incomplete**

- Diff truncation: very large diffs show a truncated notice.
- VS Code accept and reject operate on proposed edits; whether each unit is a hunk was not verified.
- Mobile review is read-only counts and diffs; it has no accept or reject.

**Present but disconnected or switched off**

- Mobile changes sheet for a computer session: companion flag off (v1FeatureFlags.ts:16).
- Review pane is hidden when the CLI lacks the checkpoints or review capability (LocalSessionPanel.tsx:437-439).
- Cloud changes need the sandbox switch (changes/route.ts:32-40).

**Not available**

- Inline comments and hunk accept/reject on mobile and cloud web sessions: none found.
- Chrome: not applicable.
- Inline comments in the CLI and VS Code: none found.

## 4. Required behaviour

**Established requirements**

- The user views a line-level diff of the changes the agent made. (source: S66.18)
- The user sees a summary of files created, modified or deleted. (source: S66.19)
- The user leaves review comments on specific lines and the agent can act on them. (source: S66.20)
- The user accepts or rejects individual hunks. (source: S66.21)
- Reverting a section asks first and names the files whose changes are lost. (source: doc: docs/decisions/wire-or-cut.md (2026-10-10 table, checkpoints row))
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)
- Diff review, apply and revert are required developer-screen functions. (source: doc: docs/product/experience-contract.md:271)

**Acceptance criteria**

1. After an agent edit, Changes lists the file with its state and +/- counts and expands to the diff.
2. Discard asks 'Discard these changes?' and says the file returns to its last committed version and this cannot be undone.
3. In a folder that is not a git repository the panel shows the not-a-repository text.
4. In Review, reverting one hunk first shows which files will change and only then applies.
5. A comment written on a line is sent with 'Send to the agent' as one turn and discarding written comments asks first.
6. In the CLI /diff-review with no changes says 'No changed files (working tree clean).'
7. In VS Code, accepting a diff after the person edited the same lines is refused and the diff stays.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Discarding a file removes the person's own uncommitted edits too, since it restores the committed version.
- [inferred] Staging in Review writes to the git index of the folder (git.write, dispatcher.ts:795-798).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer an undo checkpoint before a file discard.
- [proposed] Add hunk accept and reject to cloud sessions and mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalChangesPanel | `apps/web/features/code/components/LocalChangesPanel.tsx` | Working-tree changes list, diffs, discard, editor mount. |
| component | LocalReviewPane | `apps/web/features/code/components/LocalReviewPane.tsx` | Per-turn hunks, stage, revert, line comments, rewind buttons. |
| hook | useLocalReview | `apps/web/features/code/hooks/use-local-review.ts` | Review state, previews, confirmations and rewind. |
| service | local-review-client | `apps/web/features/code/services/local-review-client.ts` | Calls checkpoints, revert, stage, rewind on the desktop host (file name from import; not opened). |
| config | code-diff | `apps/web/features/code/code-diff.ts` | Diff parsing helpers (not read). |
| component | CodeChangesPanel and CodeDiffFile | `apps/web/features/code/components/CodeChangesPanel.tsx` | Cloud changes, commit, discard, PR checks. |
| endpoint | GET and POST /api/code/sessions/[sessionId]/changes | `apps/web/app/api/code/sessions/[sessionId]/changes/route.ts` | Cloud changes read and discard. |
| service | Desktop gitService | `apps/desktop/electron/runtime/gitService.ts` | readWorkingTreeChanges, discardWorkingTreeChanges. |
| service | Desktop dispatcher change commands | `apps/desktop/electron/runtime/dispatcher.ts` | developer_session_changes, _discard, checkpoint diff, stage, revert. |
| service | CLI app-server review | `apps/cli/src/app_server/review.rs` | Per-turn checkpoint diff, revert and stage sections. |
| service | CLI diff model | `apps/cli/src/diff_model.rs` | Diff parsing for hunks. |
| component | DiffReviewView | `apps/cli/src/tui/widgets/diff_review.rs` | Terminal hunk review overlay. |
| command | CLI /diff-review | `apps/cli/src/tui/tui_app.rs` | Collects status and diff, opens the overlay (line 6582). |
| component | DiffDecorationProvider | `apps/extension-vscode/src/providers/diffDecorationProvider.ts` | Inline diff with accept and reject. |
| service | VS Code sessionReceipt | `apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts` | File-change summary at the end of a session (brief cites line 47; not read). |
| component | CodeSessionChangesSheet | `apps/mobile/src/features/companion/components/CodeSessionChangesSheet.tsx` | Mobile created and modified file lists, diffs and tests. |
| component | CloudCodeChangesSheet | `apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx` | Mobile cloud session changes (not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Changes panel calls readDeveloperSessionChanges; the host reads git status and diff for the approved folder. | device | LocalChangesPanel.tsx:168-182; dispatcher.ts:3101-3102 |
| Discard asks the person, then restores the files from git. | device | LocalChangesPanel.tsx:187-205; dispatcher.ts:3103-3104 |
| Review loads per-turn checkpoints and diffs from the CLI app-server (git tree checkpoints recorded per turn). | device | use-local-review.ts:36-50; apps/cli/src/app_server/review.rs; doc: docs/decisions/wire-or-cut.md 2026-10-10 |
| Stage or Revert first runs a preview naming the files, then applies on confirmation. | device | use-local-review.ts:223-260 |
| Comments are formatted into one message and sent as a new agent turn through the chosen model. | device and our servers | LocalReviewPane.tsx:392-410; model route per SYS-chat-turn-pipeline |
| Cloud changes are read and discarded through our API against the sandbox. | our servers | changes/route.ts:32-134 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Per-turn git tree checkpoints | In the repository's git storage via the worktree crate (exact ref names not read) | no | unknown |
| Drafted review comments | Page state until sent or discarded | no | discard asks first |
| Cloud changes | Sandbox filesystem and cloud_code_sessions | server | sandbox lifetime (TTL from plan, getPlanSandboxTtlMs) |

**Models and providers.** Viewing a diff uses no model. Sending comments starts a turn on the session's chosen model (any provider that session can use).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local review needs no account call found; cloud changes need sign-in. |
| Permissions | git.read for changes, git.destructive for discard, git.write for stage, revert and thread revert (dispatcher.ts:785-798,906-913). |
| Subscription | Cloud changes check managed-compute access (changes/route.ts:37-60). Local review: none found. |
| Limits and metering | Diff output size limit with a truncation notice (gitService.test.ts 'marks the preview truncated'); checkpoint sections capped at 500 files per request (dispatcher.ts:1047). |
| Feature flags | CLI capabilities checkpoints, review; AGI_E2B_EXECUTION for cloud. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Mode:local diff, discard, stage and revert run on the device; no payment. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading changes' and 'Reading checkpoints'. | LocalChangesPanel.tsx; local-code.ts:1524 |
| Empty | 'No changes to show' and 'No turn in this session has changed a file yet.' | code-surface.ts:404; local-code.ts:1525 |
| Not a repository | Explicit text. | local-code.ts:changesNotRepository |
| Read failure | Alert 'The changes in this folder could not be read.' with a refresh button. | LocalChangesPanel.tsx:176-180 |
| Conflicted file | Discard button disabled. | LocalChangesPanel.tsx:98 |
| Binary file | 'Binary file, changed as a whole.' | local-code.ts:1530 |
| Turn running | 'Review code' button disabled while the session is busy. | LocalChangesPanel.tsx:262-268 |
| Request rejected by host | Review returns to a retryable state. | use-local-review.test.ts 'returns to a retryable state when the native request is rejected' |
| Stale VS Code accept | Refused, nothing written, diff kept. | diffStaleAccept.test.ts |
| Offline / timeout | not handled in the code beyond failure text. | not handled in the code (searched LocalChangesPanel.tsx) |
| Accessibility | File buttons carry state and path labels, counts have screen-reader text, expand uses aria-expanded. | LocalChangesPanel.tsx:68-86 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalChangesPanel.test.tsx`: Comparison base and counts with filter; truncated patch label; follows a terminal rewrite; asks before replacing unsaved edits; review turn request; button disabled while a turn runs; not offered when nothing changed.
- `apps/web/features/code/components/LocalReviewPane.test.tsx`: Opens on latest changed turn; totals; names file and line in comment field; sends comments as one turn; asks before discarding comments; asks before reverting a hunk; rewind confirmations.
- `apps/web/features/code/components/LocalSessionPanel.review.test.tsx`: Review pane inside the session panel (cases not read).
- `apps/web/features/code/hooks/use-local-review.test.ts`: Retryable state after rejected request; accepted run stays running until finished event.
- `apps/web/features/code/local-review.test.ts`: Review helpers (cases not read).
- `apps/desktop/electron/__tests__/gitService.test.ts`: Approved-subfolder scope for status and diff, mixed discard refusal, truncated preview, rename scope, repository root and git state.
- `apps/extension-vscode/src/__tests__/diffStaleAccept.test.ts`: Stale-edit refusal, batch reporting, multi-insertion cases.
- `apps/extension-vscode/src/__tests__/diffDecorationProvider.test.ts`: Diff decoration provider.
- `apps/cli/src/tui/widgets/diff_review.rs`: In-file tests including 'rejecting_a_hunk_never_discards_work' (line 865).

**Test scenarios**

- **Discard a file**
  1. Let the agent edit a tracked file.
  2. Open Changes, click the undo icon, confirm.
  - Expected: The file matches HEAD and disappears from the list; an error shows if git refuses.
- **Revert one hunk**
  1. Open Review, click Revert on one hunk.
  - Expected: A confirmation names the file; after confirming only that hunk is undone.
- **Send comments**
  1. Write comments on two lines, press 'Send to the agent'.
  - Expected: One turn starts that begins 'Address these review comments on your changes:' and lists both.
- **Non-repository folder**
  1. Open Changes on a folder without git.
  - Expected: The not-a-repository text appears.
- **CLI hunk review**
  1. Edit two hunks, run /diff-review, press y on one and n on the other, Enter.
  - Expected: The approved hunk is staged and the rejected one is unstaged, never discarded by n.
- **Stale accept in VS Code**
  1. Let the agent propose an edit, change those lines yourself, press Accept.
  - Expected: The edit is refused and the diff stays visible.

**Where to look when it fails**

- Strings changesFailed, discardFailed, LOCAL_REVIEW_COPY.readFailed.
- Host permission refusals (git.*).
- VS Code patch logs mentioned in doc: docs/decisions/wire-or-cut.md.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- Mobile: [70-qa/test-plans/mobile/066-coding-workspace-frontend.md](../../70-qa/test-plans/mobile/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **Brief says inline comments and hunk accept or reject are missing on web and Desktop, and CLI/VS Code comments missing; the Desktop/web code has both. Still missing on CLI and VS Code for comments.** Affects: Planning accuracy; CLI, VS Code comments. Evidence: LocalReviewPane.tsx:90-260; brief S66.20, S66.21. Work needed: Update brief; decide CLI and VS Code comments.
- **Discard also drops the person's own uncommitted edits and cannot be undone.** Affects: Web, Desktop. Evidence: code-surface.ts:192-193. Work needed: Consider checkpoint before discard (AGENTS.md section 9 'code gets a checkpoint').
- **Cloud web sessions and mobile have no hunk accept or reject.** Affects: Web cloud, mobile. Evidence: CodeChangesPanel.tsx has file-level discard only. Work needed: Add or document.
- **Mobile computer-session diff view is flag-off.** Affects: Mobile. Evidence: v1FeatureFlags.ts:16. Work needed: Enable with Remote Control.
- **Web status is 'partial' only for cloud gating, which the local Review does not depend on.** Affects: Inventory. Evidence: brief S66.18. Work needed: Split local and cloud statuses.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- mode:local
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- F066-06
- SYS-execution-boundaries

## Unknown

- How VS Code defines the unit it accepts or rejects.
- Where per-turn checkpoint refs are stored in git.
- How long cloud changes persist after the sandbox expires.
- What the mobile cloud changes sheet shows.
- Contents of local-review-client.ts.
