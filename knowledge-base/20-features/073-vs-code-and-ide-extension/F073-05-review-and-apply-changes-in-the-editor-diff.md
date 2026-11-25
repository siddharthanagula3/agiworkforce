---
id: "F073-05"
type: "feature"
title: "Review and apply changes in the editor diff"
aliases: ["Native diff review", "Proposed change diff", "Accept and reject diffs", "Diff CodeLens", "Apply patch", "S73.13", "S73.14", "S73.15"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.13", "S73.14", "S73.15"]
depends_on: ["surface:vscode", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "F073-01", "F073-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-05 Review and apply changes in the editor diff

In the VS Code extension, changes the assistant proposes open in VS Code's own diff editor, where the person can edit the text and accept or reject. Suggested code blocks become reviewable in-file diffs with Accept and Reject controls, shortcuts and confirmed bulk actions. Hunk-by-hunk partial acceptance was not found.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.13](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7313), [S73.14](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7314), [S73.15](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7315).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows what the agent wants to write before it writes it. An approval request for a file change opens a native two-sided diff whose right side is editable. A code block from chat can become an in-file diff with CodeLens Accept and Reject.

**Why it exists.** The person must stay in control of edits to their code (brief S73.13 to S73.15; doc: AGENTS.md section 9 says irreversible actions ask first).

**Who uses it.** Developers using agent mode or applying code blocks in the VS Code extension.

**Problems it solves**

- Blind file writes.
- Applying stale edits over newer text.

**Use cases**

- Review an agent's proposed file edit and tweak it before approving.
- Apply a chat code block to the open file as a diff.
- Reject every pending change at once.
- Restore changes rejected by mistake.

## 2. User experience

**Where to find it**

- VS Code: approval card in the chat with a review control (message reviewApprovalChange) (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1881-1889).
- VS Code: CodeLens above changed lines: '$(check) Accept', '$(close) Reject', 'Accept All in File', 'Reject All in File' (apps/extension-vscode/src/providers/diffDecorationProvider.ts:171-200).
- VS Code: commands acceptAllDiffsGlobal, rejectAllDiffsGlobal, restoreRejectedDiffs (package.json:385-410; commandSetup.ts:1075-1100).
- Shortcuts: Cmd+Shift+A accept current, Cmd+Shift+R reject current, Cmd+Shift+Enter accept, Escape reject, Cmd+Shift+Alt+Y accept all, Cmd+Shift+Alt+U reject all (package.json:1523-1565).

**Before you start**

- A pending proposal or a code block to apply; an open text editor for 'proposeDiff' (ChatStateManager.ts:2250-2262).
- Shortcuts only work while the cursor is in a change (context key diffUnderCursor) or any diff exists (hasDiff) (diffDecorationProvider.ts:285-291, 323).

**Screens and controls**

- Native diff tab titled '<file>: proposed change, edit it to change what is written' (proposedChangeReview.ts:107-113).
- CodeLens summary '+added, -removed, ~modified' and a confidence icon (diffDecorationProvider.ts:151-170).
- Modal confirmation for bulk accept or reject (commandSetup.ts:1054-1085).

**Journey**

1. Agent asks to change a file; the approval card appears.
2. Press review; the native diff opens.
3. Optionally edit the right side.
4. Allow or deny in the chat; on allow the edited text, if different, goes back to the runtime (ChatStateManager.ts:3436-3441).
5. For a code block, choose to apply it; an in-file diff with CodeLens appears.
6. Accept or reject one change, all in a file, a batch, or everything; bulk actions ask first.

**What the person sees and gets**

- Diff tab closes after the decision (proposedChangeReview.ts:116-125).
- Warning messages when stale or not applied: STALE_DIFF_MESSAGE and 'Could not apply diff, document may have changed.' (diffDecorationProvider.ts:375-396).
- Notice listing rejected changes with a restore path (commandSetup.ts:1086-1100).

**Settings**

- agiWorkforce.autoApplyFixes (package.json:1357).
- Agent mode and shell approval settings (package.json:75).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- openProposedChange writes the proposal to an in-memory file system under scheme agi-proposed and opens vscode.diff (apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:4-114).
- finishProposedChange returns the text only when the person changed it (proposedChangeReview.ts:142-146).
- discardProposedChange closes tabs and deletes the temporary files (proposedChangeReview.ts:148-150).
- In-file diff sessions accept or reject one change; accept first checks the text is still the text it was written against (diffDecorationProvider.ts:361-398).
- Bulk accept and reject are available per file, per batch and globally, with modal confirmation (commandSetup.ts:1049-1100).
- Rejected changes are stashed and can be restored (diffDecorationProvider.ts:400-405, 440-450; commandSetup.ts:1086-1100).
- Context keys hasDiff and diffUnderCursor are set (diffDecorationProvider.ts:285-291, 323, 451, 590, 609).

**Incomplete**

- Partial acceptance inside one change (individual hunks of a single multi-hunk proposal) was not found; each diff session is one range replace (diffDecorationProvider.ts:386-388). The brief claims hunk acceptance is done (S73.14).

**Present but disconnected or switched off**

- None found.

**Not available**

- Other apps do not have this editor diff feature.

## 4. Required behaviour

**Established requirements**

- Proposed or applied changes can be reviewed in VS Code's own diff editor. (source: S73.13)
- Individual hunks of a proposed change can be accepted or rejected separately. (source: S73.14)
- A suggested code block can be applied to the file as a reviewable patch and accepted. (source: S73.15)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. An agent edit request opens a native diff with an editable right side.
2. Editing the right side and allowing sends the edited text to the runtime.
3. Denying closes the diff and writes nothing.
4. Accepting a change after editing the same lines manually is refused with a stale warning and the diff remains.
5. Reject all asks for confirmation naming the files.
6. After rejecting, 'restore' brings the changes back.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Each range-level change acts as the hunk unit, so separate proposed ranges can be accepted separately [inferred from diffDecorationProvider.ts:129-200, 386-388].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Split a single multi-hunk proposal into separately acceptable hunks.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | proposedChangeReview | `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts` | Opens, finishes and discards native diffs for approval requests. |
| service | DiffDecorationProvider | `apps/extension-vscode/src/providers/diffDecorationProvider.ts` | In-file diff sessions, accept, reject, stash, context keys. |
| component | DiffCodeLensProvider | `apps/extension-vscode/src/providers/diffDecorationProvider.ts` | CodeLens Accept and Reject controls (lines 129-235). |
| command | diff commands | `apps/extension-vscode/src/core/commandSetup.ts` | accept, reject, current, global, batch, restore (lines 1049-1100). |
| store | approval and proposeDiff handling | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | reviewApprovalChange, proposeDiff, approval resolution (lines 1881-1889, 2250-2290, 3430-3450). |
| config | keybindings and when clauses | `apps/extension-vscode/package.json` | Diff shortcuts (lines 1523-1565). |
| service | codeBlockTarget | apps/extension-vscode/src/features/sidebar-webview/codeBlockTarget.ts (not found) (not found) | Decides whether a code block may target the open file (codeBlockTargetRefusal). |
| service | applyLlmEdit | `apps/extension-vscode/src/platform/applyEdit.ts` | Checks trust and document version before edit. |
| service | turnChanges | `apps/extension-vscode/src/features/sidebar-webview/turnChanges.ts` | Summary of changes made by a turn. |
| screen | Approval card | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Chat UI for approve, deny and review. |
| test | diffDecorationProvider test | `apps/extension-vscode/src/__tests__/diffDecorationProvider.test.ts` | Diff provider. |
| test | diffStaleAccept test | `apps/extension-vscode/src/__tests__/diffStaleAccept.test.ts` | Stale accept refused. |
| test | diffBatchSafety test | `apps/extension-vscode/src/__tests__/diffBatchSafety.test.ts` | Batch safety. |
| test | diffKeybindingCommands test | `apps/extension-vscode/src/__tests__/diffKeybindingCommands.test.ts` | Shortcut commands. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Runtime sends an approval request with proposed file content. | device | ChatStateManager.ts:1881-1889 |
| Host stores the proposal in a virtual file system and opens the native diff. | device | proposedChangeReview.ts:90-114 |
| Person edits or decides; host collects the edited text. | device | proposedChangeReview.ts:127-146 |
| Host answers the runtime with the decision and any edited content. | device | ChatStateManager.ts:3436-3450 |
| For code blocks, an in-file diff session is created and the person accepts or rejects. | device | ChatStateManager.ts:2250-2290; diffDecorationProvider.ts:375-398 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Proposed and original text | Memory file system with scheme agi-proposed | No | Deleted when review ends (proposedChangeReview.ts:137-138). |
| Rejected diff stash | Memory of the diff provider | No | Per session; restore command available. |

**Models and providers.** No model takes part in the review; it applies to whatever model produced the change.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code for the review itself. |
| Permissions | Edits refused in an untrusted workspace (applyEdit.ts:51-53). |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | autoApplyFixes (default off). |
| Model compatibility | Any. |
| Provider restrictions | None found in the code. |
| Local mode | Entirely local to the machine. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Stale text | Accept refused with a warning; diff kept. | diffDecorationProvider.ts:361-382 |
| Apply fails | Warning 'Could not apply diff, document may have changed.' | diffDecorationProvider.ts:392-396 |
| No editor | Warning, diffProposalFailed posted. | ChatStateManager.ts:2255-2262 |
| Nothing pending | Warning 'diff.nothingPending'. | commandSetup.ts:360 |
| No diff under cursor | Warning from warnNoDiffUnderCursor. | commandSetup.ts:1058-1066 |
| Request resolved while diff opening | Discards the proposal. | ChatStateManager.ts:1886-1888 |
| Unsaved notebook | Approval denied. | ChatStateManager.ts:3430-3436 |
| Keyboard | Escape rejects only when no widget needs Escape. | package.json:1543-1547 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/diffDecorationProvider.test.ts`: Diff sessions and decorations.
- `apps/extension-vscode/src/__tests__/diffStaleAccept.test.ts`: Refusal when the file moved on and batch reporting.
- `apps/extension-vscode/src/__tests__/diffBatchSafety.test.ts`: Bulk actions.
- `apps/extension-vscode/src/__tests__/diffKeybindingCommands.test.ts`: Shortcut commands.
- `apps/extension-vscode/src/__tests__/keybindingContextParity.test.ts`: Key binding contexts.
- `apps/extension-vscode/src/__tests__/codeBlockTarget.test.ts`: Code block targets.
- `apps/extension-vscode/src/__tests__/turnChanges.test.ts`: Changes summary.
- `apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts`: Approval card UI.
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: References proposedChangeReview flow.

**Test scenarios**

- **Edit before allow**
  1. Ask agent to change a file.
  2. Press review.
  3. Edit the right side.
  4. Allow.
  - Expected: File holds the edited text.
- **Stale**
  1. Apply a code block as diff.
  2. Edit the same lines by hand.
  3. Accept.
  - Expected: Warning; nothing written.
- **Reject all**
  1. Create two pending diffs.
  2. Run reject all.
  - Expected: Modal listing files; after yes both vanish; restore brings them back.
- **Shortcuts**
  1. Place cursor in a change.
  2. Press accept shortcut.
  - Expected: Change applies.
- **Untrusted**
  1. Open untrusted folder.
  2. Try Fix.
  - Expected: Not applied.

**Where to look when it fails**

- Warning texts above; no log lines found.

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **No partial hunk acceptance within one proposed change.** Affects: VS Code users. Evidence: diffDecorationProvider.ts:386-388 replaces one range. Work needed: Add hunk splitting or correct the brief.
- **No unit test file named for proposedChangeReview.** Affects: Testers. Evidence: Only chatStateManager.test.ts mentions it (grep). Work needed: Add direct tests.

**Depends on**

- surface:vscode
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- F073-01
- F073-04

## Unknown

- Whether any UI splits one proposal into hunks (webview diff rendering not fully read).
- Where the 'Apply' control for code blocks lives in the webview and its exact label.
- Whether Cmd+Shift+A clashes with the chat shortcut in some contexts (when clauses at package.json:1487-1491 and 1523-1527 differ by diff context).
