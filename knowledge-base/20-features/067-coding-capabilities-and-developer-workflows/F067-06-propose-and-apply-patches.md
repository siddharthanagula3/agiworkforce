---
id: "F067-06"
type: "feature"
title: "Propose and apply patches"
aliases: ["Propose and apply patches", "Propose patches (S67.24)", "Apply selected patches (S67.25)", "Review changes", "Changes panel", "Apply to local", "Stage file", "Revert file", "Agi apply", "Include in the commit"]
area: "67 Coding capabilities and developer workflows"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S67.24", "S67.25"]
depends_on: ["surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "surface:web", "mode:local", "mode:own-key", "mode:cloud", "F067-02", "F067-05", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "api:GET /api/code/sessions/[sessionId]/changes", "api:POST /api/code/sessions/[sessionId]/changes", "api:POST /api/code/sessions/[sessionId]/commit", "file:apps/desktop/electron/runtime/gitService.ts", "file:apps/web/features/code/components/LocalReviewPane.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-06 Propose and apply patches

The agent's edits show up as reviewable changes. On Desktop the person reads each file's diff, stages or reverts single files or hunks, applies a worktree to the folder, or discards a file. In the CLI, a patch is approved before it applies and agi apply applies a stored diff. Mobile has a cloud changes sheet with a file tick-list.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.24](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6724), [S67.25](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6725).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows what the agent changed as diffs and lets the person choose what stays. Choices are per file or per hunk: stage, revert, discard, or include in a commit. A worktree session's changes can be applied to the main folder. Rewind goes back to before a turn.

**Why it exists.** The person stays in control of code that lands in their repository. The brief requires patches to be reviewable and that only the chosen ones are applied (doc: knowledge-base/data/area-briefs/067-coding-capabilities-and-developer-workflows.md S67.24, S67.25).

**Who uses it.** Anyone who lets an agent edit code on Desktop, CLI, VS Code or a cloud session.

**Problems it solves**

- Accepting a whole large change blindly.
- Undoing one bad edit without losing the good ones.
- Reviewing a phone-started change.

**Use cases**

- Stage only the files that look right and revert the rest.
- Revert one hunk the agent got wrong.
- Apply a worktree session's changes to the main folder.
- Pick files on the phone and press Commit and push.

## 2. User experience

**Where to find it**

- Desktop code page: the changes panel headed 'Changes' (apps/web/features/code/code-surface.ts changesHeading used at apps/web/features/code/components/LocalChangesPanel.tsx:241) and the review pane 'Review changes' with shortcut Ctrl+Shift+G or Cmd+Shift+G (apps/web/features/code/local-code.ts:1519-1521).
- CLI: agi apply, with an optional session id or --file; patch approval during apply_patch; Esc twice opens the rewind picker (apps/cli/src/lib.rs:799-815; apps/cli/src/tui/tui_app.rs:3974).
- VS Code: a read-only agi-proposed diff on approval and the per-turn checkpoint diff (apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:4; apps/extension-vscode/src/features/sidebar-webview/developerOutput.ts:137).
- Mobile, computer session: 'Changes' sheet with 'Files', 'Test results', read-only (apps/mobile/src/features/companion/components/codeSessionTimeline.ts:41-47). Mobile, cloud session: 'Changes' sheet with 'Include in the commit:' per file, discard, 'Commit and push', 'Create pull request' (apps/mobile/src/features/cloud-code/presentation.ts:303-322).
- Web in a plain browser: no local changes panel; cloud changes come from GET /api/code/sessions/[sessionId]/changes when the sandbox is on.

**Before you start**

- A git folder; otherwise 'This folder is not a git repository, so there are no changes to show.' (apps/web/features/code/local-code.ts:128).
- git.read to see changes, git.write to stage, revert or apply, git.destructive to discard (apps/desktop/electron/runtime/dispatcher.ts:775-805, 906-914).
- Cloud changes need the sandbox switch and a managed-compute access check (apps/web/app/api/code/sessions/[sessionId]/changes/route.ts:32-60).

**Screens and controls**

- Changes panel: file rows with status and +/- counts, a filter box, per-file Edit and 'Discard' buttons, Refresh, Close, 'Review code' (apps/web/features/code/components/LocalChangesPanel.tsx:60-135, 259).
- Review pane: turn buttons 'Turn N', 'Stage file', 'Revert file', hunk 'Stage' and 'Revert', 'Rewind to before this turn', worktree 'Apply to local', 'Keep this worktree', 'Remove worktree' (apps/web/features/code/local-code.ts:1526-1534, 1553, 1610, 1626-1629).
- Discard asks for confirmation with title and file name (apps/web/features/code/components/LocalChangesPanel.tsx:186-204).
- Discard is disabled for a conflicted file (apps/web/features/code/components/LocalChangesPanel.tsx:112).

**Journey**

1. The agent finishes a turn; the changes panel lists changed files with a comparison base.
2. Open a file to read its diff; the line counts show.
3. In the review pane choose Stage or Revert for a file or a hunk, after a preview.
4. For a worktree session, press 'Apply to local' to copy the changes into the main folder.
5. Optionally open the pull request control in the panel to push and open a pull request.

**What the person sees and gets**

- Preview of what a revert, stage, apply or rewind would change before it runs; the actions are listed as previewable (apps/desktop/electron/runtime/dispatcher.ts:964-971; apps/web/features/code/hooks/use-local-review.ts:223-234).
- Truncated diffs are labelled and line counts withheld (apps/web/features/code/components/LocalChangesPanel.test.tsx:70).
- 'The conversation was condensed after this turn, so it can no longer rewind with the files.' (apps/web/features/code/local-code.ts:1560-1561).

**Settings**

- 'Preview first', 'Create pull request automatically' and 'Autofix pull request' are listed among AGI Code settings in the product requirements (doc: docs/product/requirements.md:1369-1385); whether each is built was not checked.
- Worktree preferences and settings components exist (apps/web/features/code/components/LocalWorktreePreferences.tsx, LocalWorktreeSettings.tsx).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop reads the working tree against HEAD, limited to the approved folder, with truncation flags (apps/desktop/electron/runtime/gitService.ts:575-620).
- Per-file discard restores tracked files to HEAD, removes added files, cleans untracked files, and refuses conflicted files and files outside the folder (apps/desktop/electron/runtime/gitService.ts:623-678).
- Discard requires the git.destructive capability and is answered by the app's own git, without starting an agent (apps/desktop/electron/runtime/dispatcher.ts:906-914, 954-960).
- Review pane stage, revert (file or hunk), rewind and worktree apply go through the folder CLI checkpoints, each with a preview step (apps/web/features/code/services/local-review-client.ts:45-70; apps/web/features/code/hooks/use-local-review.ts:223-234).
- Line comments left in the review pane are sent to the agent as one turn (apps/web/features/code/components/LocalReviewPane.test.tsx:198).
- CLI apply_patch asks for approval naming every target file; agi apply applies a session diff or a file and exits non-zero on conflicts (apps/cli/src/features/exec/tools/mod.rs:4243-4290; apps/cli/src/lib.rs:6525-6555; apps/cli/src/apply_patch.rs:577-640).
- CLI has a rewind picker opened by pressing Esc twice (apps/cli/src/tui/tui_app.rs:3974, 4401).
- VS Code shows proposed edits as read-only diff documents and per-turn diffs (apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:4; apps/extension-vscode/src/features/sidebar-webview/developerOutput.ts:137-160).
- Mobile cloud sheet has a per-file include tick, discard with confirmation text and commit of the chosen files, and requires at least one file chosen (apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx:178, 533, 573; apps/mobile/src/features/cloud-code/presentation.ts:312-321).
- Web cloud changes route reads the session's changes and a POST discards (apps/web/app/api/code/sessions/[sessionId]/changes/route.ts:133-134).

**Incomplete**

- The changes panel has no select-and-apply: it offers view, edit, discard per file and a Review code button. Selection by file and hunk is in the review pane. The first draft's 'select the changes to keep in the changes panel' was wrong (apps/web/features/code/components/LocalChangesPanel.tsx:60-135).
- Mobile for computer sessions is read-only: the sheet shows counts, files and test results, and the diff is cut for phone size (apps/mobile/src/features/companion/components/codeSessionTimeline.ts:41-47).
- Discarding an added or untracked file removes it with git rm -f or git clean -f, not into the operating system Trash (apps/desktop/electron/runtime/gitService.ts:662, 676); the repository rule says removed files go to Trash first (doc: AGENTS.md section 9). Whether a checkpoint covers it is unknown.

**Present but disconnected or switched off**

- Cloud changes: off unless the sandbox is ready and the managed-compute gate passes (apps/web/app/api/code/sessions/[sessionId]/changes/route.ts:32-40).

**Not available**

- Web in a plain browser has no local patch panel.
- Chrome extension: no code session (doc: docs/product/surface-feature-matrix.md:419).

## 4. Required behaviour

**Established requirements**

- The agent proposes a change as a reviewable patch before or as it applies it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.24)
- The user picks which proposed patches are applied, and only those are applied. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.25)
- An action a user cannot undo asks first and names the consequence. (source: (doc: AGENTS.md section 9))
- A file an agent removes goes to the operating system Trash first. (source: (doc: AGENTS.md section 9))

**Acceptance criteria**

1. After an agent edit, the changes panel lists the file with its status and counts.
2. Discard asks first, names the file, and then restores it to the committed version.
3. A conflicted file cannot be discarded.
4. In the review pane, staging one hunk stages only that hunk.
5. Revert shows which files change before it runs.
6. Apply to local copies the worktree changes into the main folder and leaves files the person changed since alone.
7. agi apply with a bad patch exits non-zero and lists conflicts.
8. On the phone cloud sheet, committing with no file chosen is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Conflicts should be shown, not overwritten; discard refuses conflicted files, apply says files changed since are left alone (apps/desktop/electron/runtime/dispatcher.ts:785-789). [inferred]
- Every destructive action here should use the confirm component; the discard path does (apps/web/features/code/components/LocalChangesPanel.tsx:186). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move removed files to the operating system Trash, or confirm a checkpoint covers them.
- [proposed] Add a select-and-apply control to the changes panel so one place does both.
- [proposed] Give Mobile computer sessions a way to approve or revert a file.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalChangesPanel | `apps/web/features/code/components/LocalChangesPanel.tsx` | File list, diff, edit, discard, Review code. |
| component | LocalReviewPane | `apps/web/features/code/components/LocalReviewPane.tsx` | Per-turn diff, stage and revert by file or hunk, comments, worktree apply. |
| hook | useLocalReview | `apps/web/features/code/hooks/use-local-review.ts` | Checkpoint state and actions with previews and confirmations. |
| service | local-review-client | `apps/web/features/code/services/local-review-client.ts` | Calls to list, diff, stage, revert, rewind, apply, pin, delete. |
| config | LOCAL_REVIEW_COPY | `apps/web/features/code/local-code.ts` | Labels and confirmation texts (line 1518). |
| component | CodeDiffFile | `apps/web/features/code/components/CodeDiffFile.tsx` | Renders a diff body. |
| service | code-diff | `apps/web/features/code/code-diff.ts` | Splits a diff by file and counts lines. |
| component | LocalPullRequest | `apps/web/features/code/components/LocalPullRequest.tsx` | Pull request control inside the changes panel. |
| service | gitService | `apps/desktop/electron/runtime/gitService.ts` | Working tree changes, discard, branches, push. |
| service | dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Capability table: git.read, git.write, git.destructive; previewable actions. |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Checkpoint and worktree commands via the folder CLI. |
| service | apply_patch | `apps/cli/src/apply_patch.rs` | git apply based application with applied, skipped, conflicted lists. |
| command | agi apply | `apps/cli/src/lib.rs` | Apply subcommand and exit code on conflict (lines 799, 6525). |
| component | TUI rewind picker | `apps/cli/src/tui/tui_app.rs` | Esc twice opens the checkpoint picker (lines 3974, 4401). |
| component | proposedChangeReview | `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts` | agi-proposed read-only documents for diffs. |
| component | developerOutput showTurnCheckpointDiff | `apps/extension-vscode/src/features/sidebar-webview/developerOutput.ts` | Shows a turn's diff as a patch document. |
| component | CloudCodeChangesSheet | `apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx` | Mobile cloud changes with include ticks, discard, commit, pull request. |
| component | CodeSessionChangesSheet | `apps/mobile/src/features/companion/components/CodeSessionChangesSheet.tsx` | Read-only changes and test results for a computer session. |
| endpoint | GET and POST /api/code/sessions/[sessionId]/changes | `apps/web/app/api/code/sessions/[sessionId]/changes/route.ts` | Read and discard cloud session changes. |
| endpoint | POST /api/code/sessions/[sessionId]/commit | `apps/web/app/api/code/sessions/[sessionId]/commit/route.ts` | Commit chosen files in a cloud session. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| After a turn the changes panel asks the desktop shell for the working tree changes; the shell runs git inside the approved folder. | device | apps/web/features/code/components/LocalChangesPanel.tsx:166-180; apps/desktop/electron/runtime/gitService.ts:575 |
| The person previews and picks a stage, revert or apply; the desktop checks git.write and asks the folder CLI to do it with a preview first. | device | apps/desktop/electron/runtime/dispatcher.ts:785-800, 964-971 |
| Discard: the person confirms, the shell checks git.destructive and restores, removes or cleans the chosen files. | device | apps/web/features/code/components/LocalChangesPanel.tsx:186-204; apps/desktop/electron/runtime/gitService.ts:623-678 |
| CLI: the agent calls apply_patch; the person approves the file list; the patch is applied with git apply in the folder. | device | apps/cli/src/features/exec/tools/mod.rs:4243-4290; apps/cli/src/apply_patch.rs:577 |
| Mobile cloud sheet: the phone calls our server to read changes, discard files, commit chosen files, and open a pull request. | our servers | apps/web/app/api/code/sessions/[sessionId]/changes/route.ts:133-134; apps/web/app/api/code/sessions/[sessionId]/commit/route.ts:92 |
| Commit and push of a cloud session talk to GitHub through the installation. | outside service | apps/web/lib/services/cloud-code-github-task.ts:330-341 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Per-turn checkpoints | By the folder CLI on the device (apps/web/features/code/hooks/use-local-review.ts:46-48). | No. | Rewind possible until the conversation is condensed; retention otherwise unknown. |
| Worktree copy of the session | A git worktree on the device; 'Remove worktree' keeps a snapshot ref (apps/web/features/code/hooks/use-local-review.ts:25-30). | No. | Pin 'Keep this worktree' stops cleanup; removal returns a snapshot reference. |
| Cloud session workspace and diff | Sandbox on our servers. | Server record. | Plan TTL (packages/contracts/types/src/billing-catalog.ts:808). |

**Models and providers.** Patch handling and git actions use no model. The model only creates the edits (F067-02). Stage, revert and apply work with on-device models and without a plan.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop and CLI: none for the git actions. Cloud sheet: signed-in account. |
| Permissions | git.read, git.write, git.destructive capabilities by action (apps/desktop/electron/runtime/dispatcher.ts:775-805, 906-914); the discard is a host-git command that starts no agent (apps/desktop/electron/runtime/dispatcher.ts:954-960). |
| Subscription | No plan gate on local stage, revert, apply or discard found. Cloud changes follow the sandbox rules: plan:basic and above (packages/contracts/types/src/billing-catalog.ts:839; 645). |
| Limits and metering | Diff truncated beyond a limit (WORKING_TREE_DIFF_LIMIT in apps/desktop/electron/runtime/gitService.ts:617); checkpoint sections capped at 500 per request (apps/desktop/electron/runtime/dispatcher.ts:975). |
| Feature flags | Sandbox switch for cloud changes (apps/web/lib/e2b/gate.ts:20-30). |
| Model compatibility | Not model dependent. |
| Provider restrictions | None found. |
| Local mode | Fully available with no plan and no network: working tree reads, stage, revert, apply and discard run on the device (apps/desktop/electron/runtime/gitService.ts:575-678). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner labelled 'Loading changes'. | apps/web/features/code/components/LocalChangesPanel.tsx:287-291 |
| Not a git repository | Message that there are no changes to show. | apps/web/features/code/components/LocalChangesPanel.tsx:293-295 |
| No changes | Empty text. | apps/web/features/code/components/LocalChangesPanel.tsx:299-301 |
| Diff truncated or unavailable | Status lines; counts hidden when truncated. | apps/web/features/code/components/LocalChangesPanel.tsx:318-328 |
| Conflicted file | Discard disabled; host refuses with 'Resolve it before discarding it.' | apps/web/features/code/components/LocalChangesPanel.tsx:112; apps/desktop/electron/runtime/gitService.ts:640-644 |
| Discard fails | Alert text 'That change could not be discarded.' | apps/web/features/code/local-code.ts:129; apps/web/features/code/components/LocalChangesPanel.tsx:198-199 |
| Unsaved editor edits | Asks before another file or closing replaces them. | apps/web/features/code/components/LocalChangesPanel.test.tsx:137-156 |
| Rename touching outside folder | Refused. | apps/desktop/electron/runtime/gitService.ts:645-647 |
| Busy session | 'Review code' disabled while a turn runs. | apps/web/features/code/components/LocalChangesPanel.tsx:255-258 |
| Mobile no file chosen | 'Choose at least one file to commit.' | apps/mobile/src/features/cloud-code/presentation.ts:321 |
| Accessibility | Diff file buttons carry aria-expanded and labels with status and path; sr-only line counts. | apps/web/features/code/components/LocalChangesPanel.tsx:72-86 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalChangesPanel.test.tsx`: Comparison base and counts, filter, truncated patch labels, editor follows terminal rewrite, unsaved edit prompts, Review code asks one turn, hidden when nothing changed.
- `apps/web/features/code/components/LocalReviewPane.test.tsx`: Latest turn, totals, line comments sent as one turn, confirm before reverting a hunk, rewind choices and consequence text.
- `apps/desktop/electron/__tests__/gitService.test.ts`: Status and diff only for the approved folder, mixed discard refused before anything is restored, truncated preview, rename sibling not exposed.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Developer session commands through the dispatcher (discard mocked at line 315).
- `apps/web/app/api/code/sessions/[sessionId]/changes/route.test.ts`: Cloud changes route (titles not read).
- `apps/web/app/api/code/sessions/[sessionId]/commit/route.test.ts`: Cloud commit route (titles not read).
- `apps/cli/src/features/exec/tools/mod.rs`: In-file test: patch approval lists every target and the changes.
- `apps/mobile/src/features/companion/components/__tests__/CodeSessionView.test.tsx`: Session view drafts and refusals, not the changes sheet.

**Test scenarios**

- **Discard one file**
  1. Let the agent edit two files.
  2. Open the changes panel.
  3. Discard one and confirm.
  - Expected: That file returns to the committed version; the other stays.
- **Conflicted file**
  1. Create a merge conflict.
  2. Look at its discard control.
  - Expected: Discard is disabled.
- **Stage one hunk**
  1. Open the review pane.
  2. Press Stage on one hunk.
  - Expected: Only that hunk is staged.
- **Apply worktree**
  1. Run a session in a worktree.
  2. Press Apply to local.
  - Expected: Changes copied; files changed locally since are left alone.
- **CLI bad patch**
  1. Run agi apply --file with a patch that does not fit.
  - Expected: Conflicts listed; non-zero exit.
- **Untracked discard recoverability**
  1. Have the agent create a new file.
  2. Discard it.
  - Expected: Record whether it can be recovered from the Trash; per the code it is removed by git clean.

**Where to look when it fails**

- Error messages from gitService such as 'has no changes to discard' (apps/desktop/electron/runtime/gitService.ts:641).
- Capability prompts naming git.destructive (apps/desktop/electron/runtime/dispatcher.ts:910-913).
- apply_patch result lists applied, skipped, conflicted and an exit code (apps/cli/src/apply_patch.rs:14-24).
- Nothing was run; no result recorded.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md)
- Desktop: [70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md)
- Mobile: [70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)
- VS Code: [70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **Discard of an added or untracked file permanently removes it with git, not through the Trash.** Affects: Desktop users.. Evidence: apps/desktop/electron/runtime/gitService.ts:662, 676; doc: AGENTS.md section 9. Work needed: Trash first, or prove a checkpoint can restore it; add a test.
- **The changes panel does not select and apply; the person must use the review pane for per-hunk choices.** Affects: Desktop.. Evidence: apps/web/features/code/components/LocalChangesPanel.tsx:60-135. Work needed: Decide whether this meets 'user picks which patches'; if not, add selection.
- **Mobile computer sessions cannot accept or reject a file.** Affects: Mobile.. Evidence: apps/mobile/src/features/companion/components/CodeSessionChangesSheet.tsx:45-100 has only a close control. Work needed: Add an action path or state the limit.
- **Web in a plain browser and cloud patch flow depend on the sandbox switch.** Affects: Web.. Evidence: apps/web/lib/e2b/gate.ts:20-30. Work needed: Owner switch-on and live check.
- **Whether 'Preview first' from the requirements is built was not checked.** Affects: All apps.. Evidence: doc: docs/product/requirements.md:1369-1385. Work needed: Search settings code for it.

**Depends on**

- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- surface:web
- mode:local
- mode:own-key
- mode:cloud
- F067-02
- F067-05
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- api:GET /api/code/sessions/[sessionId]/changes
- api:POST /api/code/sessions/[sessionId]/changes
- api:POST /api/code/sessions/[sessionId]/commit
- file:apps/desktop/electron/runtime/gitService.ts
- file:apps/web/features/code/components/LocalReviewPane.tsx

## Unknown

- Whether a checkpoint can restore a discarded untracked file.
- Whether 'Preview first' and 'Autofix pull request' settings are implemented.
- Content of the Mobile cloud changes sheet commit flow beyond labels.
- Retention of worktree snapshots.
- Whether VS Code can apply or reject a proposed edit per hunk beyond viewing the diff.
- Titles of the cloud changes and commit route tests.
