---
id: "F021-06"
type: "feature"
title: "Apply suggested code to repository files"
aliases: ["Apply to repository", "Apply code changes", "Apply suggested code", "Diff review", "S21.27", "proposeDiff", "Accept diff"]
area: "21 Code blocks and executable code presentation"
available_on: ["cli", "vscode"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S21.27"]
depends_on: ["surface:vscode", "surface:cli", "mode:local", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "F021-04", "F021-05", "file:apps/extension-vscode/src/providers/diffDecorationProvider.ts", "file:apps/cli/src/tui/widgets/diff_review.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-06 Apply suggested code to repository files

VS Code has an Apply button on each code block that opens a proposed change in the active editor, with Accept and Reject controls and a stale-file check. The CLI has /diff-review, which stages, unstages or discards changes already on disk. Web, Desktop, Mobile and Chrome cannot apply code to files.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.27](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2127).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the user turn a suggestion into a real file change only after reviewing it. In VS Code the block is shown as a diff against the editor and applied on Accept. In the CLI the user reviews git changes per file and hunk.

**Why it exists.** Brief item S21.27: suggested code should reach the user's files, but never without review.

**Who uses it.** Developers using VS Code or the CLI on their own repository.

**Problems it solves**

- Copy and paste into the right place is error prone.
- Silent overwrite of edited files must be avoided.

**Use cases**

- Click Apply on a TypeScript block while a .ts file is open; review; Accept.
- Run /diff-review in the CLI, approve one file, reject another.
- Press d twice in the CLI review to discard an unstaged hunk.

## 2. User experience

**Where to find it**

- VS Code: 'Apply' button (label 'Apply code changes') in the code block hover actions (render.ts:36-41; webviewContent.ts:1454-1460); then CodeLens 'Accept', 'Reject', 'Accept All in File' in the editor (apps/extension-vscode/src/providers/diffDecorationProvider.ts:165-190).
- CLI: /diff-review (apps/cli/src/tui/tui_app.rs:6582-6667) and /diff panel (tui_app.rs:5899-5909).
- Web, Desktop, Mobile, Chrome: none.

**Before you start**

- VS Code: an open text editor, a diff provider available, the block's language fits the file's language, and the file is inside the folder the conversation works in (ChatStateManager.ts:2250-2272; platform/codeBlockTarget.ts:38-58).
- CLI: a git repository with changes; repository config is checked first (tui_app.rs:6584-6591).

**Screens and controls**

- VS Code Apply button text changes to 'Opening…', then 'Review opened' or the failed label (webviewContent.ts:5490-5495,8413-8420).
- A side-by-side tab titled '<file>: proposed change' opens beside the editor (diffDecorationProvider.ts:325-331).
- Accept and Reject with keyboard hints Ctrl+Shift+A and Ctrl+Shift+R (diffDecorationProvider.ts:176,182).
- CLI overlay keys y, n, s, arrows, d d, Enter, Esc.

**Journey**

1. VS Code: open the target file, optionally select the lines to replace.
2. Click Apply on the block.
3. Review the proposed change tab and decorations.
4. Click Accept to apply, or Reject.
5. CLI: run /diff-review, step through files and hunks, press Enter to finish and read the summary.

**What the person sees and gets**

- VS Code warnings: open a file first (chatNotice.openFileForDiff), diff unavailable, language mismatch message, outside-folder message (codeBlockTarget.ts:43-52), stale-edit message on Accept (diffDecorationProvider.ts:381-385), 'Could not apply diff, document may have changed.'
- CLI result message: 'Staged N file(s) and N hunk(s); unstaged ...; discarded N hunk(s) from the working tree.' (tui_app.rs:1367).

**Settings**

- none found for Apply. VS Code keybindings exist for accept and reject (core/commandSetup.ts:1034-1046).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- VS Code: Apply posts proposeDiff with code and language (webviewContent.ts:5486-5496); the extension validates, builds a session over the selection or the cursor point, shows the diff and posts diffProposed or diffProposalFailed (ChatStateManager.ts:2250-2292). When the selection is empty, the block is proposed as an insertion at the cursor, not a whole-file replacement (ChatStateManager.ts:2275-2277).
- VS Code: acceptDiff refuses if the text changed since the proposal and otherwise applies a WorkspaceEdit replace (diffDecorationProvider.ts:375-398). Reject stashes the session and removes it (diffDecorationProvider.ts:400-405).
- VS Code: a second Apply while one is pending marks the earlier one failed with 'newerDiffReplaced' (webviewContent.ts:5486-5489).
- CLI: the review overlay stages approved files and hunks, unstages rejected ones, and discards an unstaged hunk only after a second d press (diff_review.rs:1-9,878-905; tui_app.rs:1298-1381). Skipped files are untouched (tui_app.rs:1381 comment).

**Incomplete**

- The CLI /diff-review reviews changes already written to disk by tools or the user; it does not take a code block from the reply and write it. So the brief's CLI 'apply suggested code' is met only as review of existing changes. [inferred from tui_app.rs:6582-6667]
- VS Code Accept applies the edit to the editor document; saving the file is a separate step not performed by this code [inferred].

**Present but disconnected or switched off**

- Brief citations tui_app.rs:3974, tui_app.rs:880, render.ts:18 and ChatStateManager.ts:1350 do not point at apply code. The real code is ChatStateManager.ts:2250 and tui_app.rs:6582.

**Not available**

- Web, Desktop, Mobile and Chrome have no apply-to-files action for code blocks (brief S21.27; no control found in CodeBlock.tsx or CodeCard.tsx).
- CLI per-block apply from chat: none found.

## 4. Required behaviour

**Established requirements**

- Suggested code can be applied to files in the user's repository after review. (source: S21.27 brief)
- An agent never destroys a user's data on its own; removal needs an explicit user action that names what is lost. (source: AGENTS.md section 9)
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. VS Code: Apply with no editor open shows 'open a file' warning and the button shows failed.
2. VS Code: Apply a python block while a .ts file is open is refused with a message naming both languages.
3. VS Code: Apply opens a proposed-change tab; Accept changes the editor text; Reject leaves it unchanged.
4. VS Code: edit the file after Apply; Accept refuses with the stale message and does not change text.
5. CLI: /diff-review y stages a file; n unstages it; skip leaves it; one d press does not discard; two do.
6. Web, Mobile, Chrome: no Apply control exists (current state).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI's discard of an unstaged hunk is permanent for that hunk; AGENTS.md section 9 asks that removal go through the OS Trash or a checkpoint; whether the CLI does so was not read [inferred concern; unknown].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a reviewed apply path for Web and Desktop code or project sessions.
- [proposed] In the CLI, allow applying a reply code block into a file with the same review overlay.
- [proposed] Correct the brief citations.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | renderCodeBlock Apply button | `apps/extension-vscode/src/webview/render.ts` | Emits Apply, Explain, Copy buttons. |
| component | bindCodeBlockActions | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Apply click posts proposeDiff; settleApplyButton states. |
| schema | proposeDiff message | `apps/extension-vscode/src/protocol/webviewMessages.ts` | Zod schema for the webview message (line 227). |
| service | ChatStateManager proposeDiff handler | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Validates and opens the proposal (lines 2250-2292). |
| service | codeBlockTargetRefusal | `apps/extension-vscode/src/platform/codeBlockTarget.ts` | Refuses wrong language or out-of-folder file. |
| service | DiffDecorationProvider | `apps/extension-vscode/src/providers/diffDecorationProvider.ts` | showDiff, acceptDiff, rejectDiff, stale check, CodeLens. |
| command | agi-workforce.acceptDiff / rejectDiff / acceptAllDiffs | `apps/extension-vscode/src/core/commandSetup.ts` | Commands behind Accept and Reject. |
| command | /diff-review | `apps/cli/src/tui/tui_app.rs` | Collects git changes and opens DiffReviewView. |
| component | DiffReviewView | `apps/cli/src/tui/widgets/diff_review.rs` | Decisions per file and hunk, outcome lists. |
| service | OverlayResult::DiffReviewed handler | `apps/cli/src/tui/tui_app.rs` | Runs stage, unstage and discard (lines 1298-1381). |
| service | diff_review_files | `apps/cli/src/tui/tui_app.rs` | Builds file list from HEAD, staged and unstaged diffs (line 6768). |
| service | git host helpers | `apps/cli/src/platform/runtime/git.rs` | host_git_output; path inferred from crate::platform::runtime::git, not opened. |
| test | codeBlockActions webview test | `apps/extension-vscode/src/__tests__/codeBlockActions.webview.test.ts` | Apply posts the proposal with the rendered language. |
| test | codeBlockTarget test | `apps/extension-vscode/src/__tests__/codeBlockTarget.test.ts` | Refusal rules. |
| test | diffStaleAccept test | `apps/extension-vscode/src/__tests__/diffStaleAccept.test.ts` | Stale accept refusal (title level). |
| test | diffDecorationProvider test | `apps/extension-vscode/src/__tests__/diffDecorationProvider.test.ts` | Provider behaviour (title level). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Apply click sends the code and language from the webview to the extension host. | device | webviewContent.ts:5490-5495 |
| The host checks an editor is open, the provider exists, and the language and folder fit. | device | ChatStateManager.ts:2253-2272 |
| The provider records the original text and shows a diff tab with Accept and Reject. | device | diffDecorationProvider.ts:294-332 |
| Accept checks the document is unchanged, then applies a WorkspaceEdit. | device | diffDecorationProvider.ts:375-398 |
| CLI: git status and git diff run locally; decisions run git staging and discard commands on the repository. | device | tui_app.rs:6592-6647,1298-1381 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Diff session (original text, new text, range, document version) | memory in the VS Code extension host | no | removed on accept or reject; rejected proposals are stashed (diffDecorationProvider.ts, _stashRejected) |
| Changed repository files and git index | the user's repository on disk | not by this feature | CLI discard removes a hunk from the working tree; recovery depends on git or editor undo; not established |

**Models and providers.** No model is called by Apply or by the CLI review. The suggestion came from a model of any provider; the apply step is local.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for Apply or /diff-review themselves. |
| Permissions | VS Code: edits only a file inside the conversation folder and matching language (codeBlockTarget.ts:38-58). CLI: reads and changes the repository in the working folder; checks repository config first (tui_app.rs:6584). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Independent of the model. |
| Provider restrictions | none found in the code. |
| Local mode | Works in Local mode since it only touches local files. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No open editor | Warning and Apply shows failed. | ChatStateManager.ts:2253-2258 |
| Diff provider missing | Warning 'diffUnavailable'. | ChatStateManager.ts:2259-2263 |
| Wrong language or outside folder | Refusal message; nothing proposed. | codeBlockTarget.ts:43-52 |
| Second Apply while pending | Earlier button marked failed with newer-diff note. | webviewContent.ts:5486-5489 |
| Edited after proposal | Accept refused with stale warning. | diffDecorationProvider.ts:379-386 |
| applyEdit fails | Warning 'Could not apply diff, document may have changed.' | diffDecorationProvider.ts:392-395 |
| Exception while showing diff | Error message and failed button. | ChatStateManager.ts:2290-2294 |
| CLI git failure | Shows git error text. | tui_app.rs:6603-6622 |
| CLI partial failure | Result message counts failed items. | tui_app.rs:1362-1366 |
| Offline, timeout | not handled in the code; not applicable to local file edits. | searched the apply paths; no network call found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/codeBlockActions.webview.test.ts`: Apply posts proposeDiff using the rendered language; action markup is sanitizable.
- `apps/extension-vscode/src/__tests__/codeBlockTarget.test.ts`: Language and folder refusal and acceptance.
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: proposeDiff handling (lines 444, 783, 825).
- `apps/extension-vscode/src/__tests__/diffStaleAccept.test.ts`: Stale accept (title level).
- `apps/extension-vscode/src/__tests__/diffBatchSafety.test.ts`: Batch safety (title level).
- `apps/extension-vscode/src/__tests__/diffKeybindingCommands.test.ts`: Accept and reject commands (title level).
- `apps/cli/src/tui/widgets/diff_review.rs`: Inline tests: decisions, hunk stage and unstage, discard needs second press, staged hunk cannot be discarded.
- `apps/cli/src/tui/tui_app.rs`: Inline tests diff_review_files at lines 9004 and 9021.

**Test scenarios**

- **Apply and accept**
  1. In VS Code open a .ts file.
  2. Ask for a TypeScript function; click Apply.
  3. Review; click Accept.
  - Expected: Text inserted at the cursor or replaces the selection; button said 'Review opened'.
- **Wrong file type**
  1. Open a .md file.
  2. Click Apply on a python block.
  - Expected: Refusal naming python and markdown; nothing changes.
- **Stale file**
  1. Click Apply.
  2. Type in the file.
  3. Click Accept.
  - Expected: Stale warning; text unchanged.
- **CLI review**
  1. Edit two files in a repo.
  2. Run /diff-review.
  3. Approve one, reject one, finish.
  - Expected: Summary lists staged and unstaged counts.
- **CLI discard**
  1. In /diff-review press d on an unstaged hunk once, then again.
  - Expected: First press asks again; second discards the hunk from the working tree.
- **Other apps**
  1. Look for an Apply control on web, mobile and Chrome.
  - Expected: None exists.

**Where to look when it fails**

- VS Code warning toasts listed above and 'diffProposalFailed' message.
- CLI system message from DiffReviewed.
- No tables or server logs.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md)
- VS Code: [70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **No apply-to-files for Web, Desktop, Mobile and Chrome.** Affects: those apps. Evidence: brief S21.27; no control in CodeBlock.tsx or CodeCard.tsx. Work needed: Decide scope per surface; hosted Desktop and web have no local file access except through Code sessions.
- **CLI does not apply a reply code block; it reviews changes already made.** Affects: CLI. Evidence: tui_app.rs:6582-6667. Work needed: Clarify the requirement or add block-to-file apply.
- **VS Code Apply on an empty selection inserts at the cursor, not replacing a whole file.** Affects: VS Code. Evidence: ChatStateManager.ts:2275-2277. Work needed: Decide if a whole-file target is wanted.
- **Discard in the CLI review is permanent for the hunk; OS Trash or checkpoint use was not found.** Affects: CLI. Evidence: tui_app.rs:1357-1367; AGENTS.md section 9. Work needed: Read the discard code and add a checkpoint if missing.
- **Brief code citations are stale.** Affects: Documentation. Evidence: ChatStateManager.ts:1350 and tui_app.rs:3974 do not match. Work needed: Update the brief.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:vscode
- surface:cli
- mode:local
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- F021-04
- F021-05
- file:apps/extension-vscode/src/providers/diffDecorationProvider.ts
- file:apps/cli/src/tui/widgets/diff_review.rs

## Unknown

- Whether the CLI discard goes to Trash or a checkpoint first.
- Whether VS Code Accept saves the file.
- What the brief's cited tui_app.rs and ChatStateManager lines were meant to be.
- How the CLI approval overlay and agent edit tools apply changes (not read).
- Whether a Web or Desktop Code session has any reviewed apply path outside code blocks.
