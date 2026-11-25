---
id: "REQ-AREA-021"
type: "requirements"
title: "Requirement items: Code blocks and executable code presentation"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 21. Code blocks and executable code presentation

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S21.01

**Language label.** Each code block shows its language name in a header.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F021-01 Language label and syntax colours](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md)
- Competitor trace: CAP-rich-content-rendering-06, CAP-rich-content-rendering-25, CAP-tools-and-code-execution-09

## S21.02

**Syntax highlighting.** Code is syntax-highlighted according to its language.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F021-01 Language label and syntax colours](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md)
- Competitor trace: CAP-rich-content-rendering-06, CAP-rich-content-rendering-25, CAP-tools-and-code-execution-09

## S21.03

**Copy code.** Each code block has a copy control that copies exactly its code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F021-02 Copy and download a code block](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md)
- Competitor trace: CAP-rich-content-rendering-06, CAP-tools-and-code-execution-09

## S21.04

**Download source file.** A code block can be downloaded as a source file with a sensible extension.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-02 Copy and download a code block](../../20-features/021-code-blocks-and-executable-code-presentation/F021-02-copy-and-download-a-code-block.md)
- Competitor trace: CAP-rich-content-rendering-07, CAP-tools-and-code-execution-09

## S21.05

**Line numbers.** Code blocks can show line numbers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-11 Line numbers, line wrapping and collapsing long blocks](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Competitor trace: CAP-rich-content-rendering-06, CAP-tools-and-code-execution-09

## S21.06

**Line wrapping.** The reader can toggle long code lines between wrapping and horizontal scroll.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-11 Line numbers, line wrapping and collapsing long blocks](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Competitor trace: CAP-rich-content-rendering-06, CAP-tools-and-code-execution-09

## S21.07

**Expand/collapse.** Long code blocks are collapsed with a control to expand/collapse them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-11 Line numbers, line wrapping and collapsing long blocks](../../20-features/021-code-blocks-and-executable-code-presentation/F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md)
- Competitor trace: CAP-rich-content-rendering-06, CAP-tools-and-code-execution-09

## S21.08

**Full-screen code view.** A code block can be opened in a full-screen/expanded view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-03 Open a code block full screen](../../20-features/021-code-blocks-and-executable-code-presentation/F021-03-open-a-code-block-full-screen.md)
- Competitor trace: CAP-rich-content-rendering-06, CAP-rich-content-rendering-07, CAP-tools-and-code-execution-09

## S21.09

**Highlighted changed lines.** Changed lines in a code suggestion are visually highlighted (added/removed).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F021-04 Diff, changed lines and error-line highlight](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Competitor trace: CAP-rich-content-rendering-07

## S21.10

**Diff formatting.** Diffs render with diff formatting (+/- lines coloured, hunks readable).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F021-04 Diff, changed lines and error-line highlight](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Competitor trace: CAP-rich-content-rendering-07

## S21.11

**Error-line highlighting.** A line referenced by an execution error or diagnostic is highlighted in the code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-04 Diff, changed lines and error-line highlight](../../20-features/021-code-blocks-and-executable-code-presentation/F021-04-diff-changed-lines-and-error-line-highlight.md)
- Competitor trace: CAP-rich-content-rendering-07

## S21.12

**Run-code action.** The user can have code run (sandbox or local) from the chat and see it execute.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F021-07 Run code from the chat](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-01, CAP-tools-and-code-execution-07

## S21.13

**Runtime/language selection where offered.** Where multiple runtimes exist, the user can choose the runtime/language for execution.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-07 Run code from the chat](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-07

## S21.14

**Input parameters or stdin panel.** Before running, the user can supply input parameters or stdin.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-07 Run code from the chat](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Competitor trace: CAP-rich-content-rendering-09

## S21.15

**Output panel.** Execution stdout is shown in a dedicated output panel under the code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F021-08 Execution output panel](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-08

## S21.16

**Standard-error panel.** Standard error is shown separately (and visibly distinguished) from stdout.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F021-08 Execution output panel](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-08

## S21.17

**Execution-duration display.** Each execution shows how long it took.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F021-08 Execution output panel](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-08

## S21.18

**Exit-status display.** Each execution shows its outcome/exit status (success, failure with code).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F021-08 Execution output panel](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-08

## S21.19

**Generated-file output.** Files produced by execution are listed and can be opened or downloaded.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F021-09 Generated files and plots](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-08

## S21.20

**Plot output.** Plots/images produced by execution render inline.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-09 Generated files and plots](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-05, CAP-tools-and-code-execution-08

## S21.21

**Retry execution.** A failed or finished execution can be re-run in place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI missing, VS Code done, Chrome missing
- Feature: [F021-10 Retry, stop and reset a run](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Competitor trace: CAP-rich-content-rendering-09

## S21.22

**Stop execution.** A running execution can be stopped by the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, CLI done, VS Code done, Chrome missing
- Feature: [F021-10 Retry, stop and reset a run](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-26

## S21.23

**Reset runtime.** The user can reset the execution runtime/state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F021-10 Retry, stop and reset a run](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md)
- Competitor trace: CAP-rich-content-rendering-09

## S21.24

**Explain code.** A code block offers an Explain action that asks for an explanation of that code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F021-05 Explain, edit beside chat, and open in coding workspace](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)

## S21.25

**Edit in Canvas.** A code block can be opened in an editable canvas/editor next to the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-05 Explain, edit beside chat, and open in coding workspace](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)
- Competitor trace: CAP-rich-content-rendering-06, CAP-tools-and-code-execution-10

## S21.26

**Open in coding workspace.** A code block can be sent to/opened in the coding workspace (IDE, AGI Code).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done, Chrome missing
- Feature: [F021-05 Explain, edit beside chat, and open in coding workspace](../../20-features/021-code-blocks-and-executable-code-presentation/F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md)

## S21.27

**Apply to repository.** Suggested code can be applied to files in the user's repository after review.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F021-06 Apply suggested code to repository files](../../20-features/021-code-blocks-and-executable-code-presentation/F021-06-apply-suggested-code-to-repository-files.md)

## S21.28

**Dependency-installation status.** When execution installs dependencies, their installation status is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F021-08 Execution output panel](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md)

## S21.29

**Execution-permission explanation.** Before or when code runs, the user is told what permission it needs/what it can touch and why.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F021-07 Run code from the chat](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-02, CAP-tools-and-code-execution-27

## S21.30

**Unsupported-runtime state.** If the requested runtime/execution is unavailable, the UI states that clearly instead of failing silently.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F021-07 Run code from the chat](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md)
- Competitor trace: CAP-rich-content-rendering-09, CAP-tools-and-code-execution-08
