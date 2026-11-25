---
id: "F021-04"
type: "feature"
title: "Diff, changed lines and error-line highlight"
aliases: ["Diff view", "Changed lines", "Diff formatting", "Error-line highlight", "Artifact changes view", "S21.09", "S21.10", "S21.11", "data-diff-kind", "ArtifactChangesView"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S21.09", "S21.10", "S21.11"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "F021-01", "file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx", "file:apps/cli/src/tui/widgets/diff_review.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-04 Diff, changed lines and error-line highlight

A diff block shows added lines in green and removed lines in red. Web, mobile, the CLI diff review and VS Code do this; web and mobile also have an artifact change view between versions. Marking the line an error points at is not in any app. Chrome has no diff colouring.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.09](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2109), [S21.10](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2110), [S21.11](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2111).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Colours lines of a suggested change: added, removed, and context. The artifact change view compares two versions of an artifact by line or word. The CLI review shows git changes per file and hunk.

**Why it exists.** Brief items S21.09 to S21.11: a reader must see what a suggestion changes. The error-line item wants the line named by an error to stand out, but nothing implements it.

**Who uses it.** Developers reviewing suggested changes.

**Problems it solves**

- A plain diff is hard to scan.
- Versions of an artifact need a readable comparison.

**Use cases**

- Read a diff block in web chat.
- Open the changes view of an artifact on web or mobile.
- Review changed files with /diff-review in the CLI.
- Read a patch block in the VS Code sidebar with hunk headers.

## 2. User experience

**Where to find it**

- Web and hosted Desktop: any fence labelled diff (CodeBlock.tsx:225). Artifact changes view in the artifact panel (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3209-3217).
- Mobile: diff, patch or udiff fence in the code card (CodeCard.tsx DIFF_FENCE_LANGUAGES), and the artifact changes view (apps/mobile/src/features/chat/components/ArtifactChangesView.tsx).
- CLI: /diff-review overlay and /diff summary (apps/cli/src/tui/tui_app.rs:6582-6667,5902-5914).
- VS Code: diff or patch fence in the webview (apps/extension-vscode/src/webview/render.ts:30-42).
- Chrome: none.

**Before you start**

- A reply with a diff fence, or two artifact versions, or git changes for the CLI.

**Screens and controls**

- Web diff body: each line a row with data-diff-kind add, remove or context.
- Artifact changes view: summary line such as 'No changes since version N' or counts of added and removed lines.
- CLI diff review keys: Up/Down file, Left/Right hunk, y approve, n reject, s skip, d twice discard, Enter done, Esc close.

**Journey**

1. Receive a reply with a diff block.
2. Read green added and red removed lines.
3. For artifacts, open the changes view to compare versions.
4. For the CLI, run /diff-review and decide per file or hunk.

**What the person sees and gets**

- Row backgrounds and plus/minus signs.
- Screen readers get 'Added: ... End of addition.' text in the web artifact view and 'Added line:' on mobile.

**Settings**

- Mobile can hide plus and minus signs in diffs (useShowDiffSigns; apps/mobile/__tests__/CodeCardAppearance.test.tsx:87).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: DiffLines classifies each line by its first character: plus is add, minus is remove, else context, with tinted backgrounds from chat success and destructive colours (CodeBlock.tsx:36-59). It shows even while streaming (CodeBlock.tsx:225 has no stream guard). Test AnswerSurfaces.test.tsx:297-316 checks remove and add rows.
- Web: the Shiki highlighted copy of a diff is kept in a screen-reader-only span next to the coloured lines (CodeBlock.tsx:226) [observed; effect on screen readers not verified].
- Web: ArtifactChangesView compares previous and next with artifactChanges and shows ins/del runs with a summary; tests ArtifactChangesView.test.tsx:18,27.
- Mobile: DiffCodeLines with 'Added line' and 'Removed line' labels (CodeCard.tsx:73-139); ArtifactChangesView with summary (apps/mobile/src/features/chat/components/ArtifactChangesView.tsx:60-181); test ArtifactChangesView.summary.test.tsx.
- CLI: DiffReviewView marks lines hunk, added, removed or context by first characters (apps/cli/src/tui/widgets/diff_review.rs:41-52) with tinted bands when true colour is available (diff_review.rs:54-60).
- VS Code: diffLineClass gives diff-file, diff-hunk, diff-add, diff-del, diff-context (apps/extension-vscode/src/webview/render.ts:30-35).

**Incomplete**

- Web colours only the exact fence word diff; a patch fence is highlighted through the alias but not run through DiffLines (CodeBlock.tsx:225 compares language === 'diff'; highlightLanguages.ts:89 maps patch to diff). Mobile accepts diff, patch and udiff.
- Web and mobile treat '--- a/file' and '+++ b/file' header lines as removed and added because they only test the first character (CodeBlock.tsx:40; CodeCard.tsx:73-77). VS Code separates file headers and hunk headers.
- Web artifact view counts and mobile view use different wording; not compared in detail.

**Present but disconnected or switched off**

- Brief code citations tui_app.rs:3974 and render.ts:18 do not point at diff code (render.ts:18 is an import; tui_app.rs:3974 was not confirmed as diff code).

**Not available**

- Error-line highlight: no code found in any app. A search for errorLine, error-line and highlightLines in apps and packages found only unrelated results (a form error row and the editor's current-line setting at apps/desktop/src/features/code/CodeEditor.tsx:267).
- Chrome side panel diff colouring: none found in apps/extension/src/features/side-panel/markdown.ts.
- Empty or failing diff behaviour: not established.

## 4. Required behaviour

**Established requirements**

- Changed lines in a code suggestion are visually highlighted as added or removed. (source: S21.09 brief)
- Diffs render with diff formatting: plus and minus lines coloured, hunks readable. (source: S21.10 brief)
- A line referenced by an execution error or diagnostic is highlighted in the code. (source: S21.11 brief (not met in any app))

**Acceptance criteria**

1. A diff fence on web shows green rows for lines starting with + and red for -.
2. A patch fence is coloured the same way on web (currently fails; see gaps).
3. File header lines (---, +++) are not shown as ordinary add or remove rows (met on VS Code only).
4. Artifact changes view says 'No changes since version N' only when versions are identical.
5. CLI /diff-review lists each changed file and lets the user step through hunks.
6. Error line highlight marks the referenced line (not implemented; will fail).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The hosted Desktop has the same diff colouring as web [inferred].
- The CLI model-reply diff fence is coloured by syntect only if its syntax set includes a diff grammar; unknown.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Treat patch and udiff like diff on web.
- [proposed] Distinguish file and hunk header lines on web and mobile.
- [proposed] Design error-line highlight tied to execution output.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DiffLines | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Web diff row colouring and data-diff-kind. |
| component | ArtifactChangesView (web) | `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Version comparison with ins/del and screen-reader markers. |
| component | ArtifactPreview changes tab | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Mounts ArtifactChangesView with previous and next version. |
| service | artifactChanges | `packages (package @agiworkforce/artifacts)` | Computes added and removed runs; source path not opened; unknown. |
| component | DiffCodeLines / diffLineKind | `apps/mobile/src/features/chat/components/CodeCard.tsx` | Mobile diff rows with labels. |
| component | ArtifactChangesView (mobile) | `apps/mobile/src/features/chat/components/ArtifactChangesView.tsx` | Mobile version comparison. |
| service | codeAppearance diffLineText | `apps/mobile/src/features/settings/code/codeAppearance.ts` | Optional plus/minus signs; path inferred from import. |
| component | DiffReviewView | `apps/cli/src/tui/widgets/diff_review.rs` | Per file and hunk diff review overlay and Mark classification. |
| command | /diff-review, /diff | `apps/cli/src/tui/tui_app.rs` | Collects git changes and opens the overlay or prints a summary. |
| service | diff_model::Diff | `apps/cli/src/diff_model.rs` | Parses git diff text; path inferred from crate::diff_model, not opened. |
| component | diffLineClass / renderCodeBody | `apps/extension-vscode/src/webview/render.ts` | VS Code diff line classes. |
| config | diff styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | CSS for diff classes; exact lines not read; unknown. |
| component | ToolCallCard file diff | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Related tool-call file diff with data-diff-line (line 144); not a fenced block. |
| test | ToolCallCard.fileDiff test | `packages/ui/unified-chat/src/components/__tests__/ToolCallCard.fileDiff.test.tsx` | Covers the tool-call diff card. |
| config | diff colour tokens | `packages/ui (tokens diff-added-fill, diff-removed-text)` | Colours used by web and mobile; defining file not opened; unknown. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Reply text arrives; Markdown parser yields a fence with language diff. | device | MarkdownContent.tsx:772 |
| CodeBlock splits code on newlines and tags each row add, remove or context. | device | CodeBlock.tsx:36-59 |
| For the CLI review, git status and git diff run in the working directory and the output is parsed. | device | apps/cli/src/tui/tui_app.rs:6592-6647 |
| For artifact changes, two stored versions are compared in the client. | device | ArtifactChangesView.tsx:75 (useMemo artifactChanges) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Diff text | inside the message text; nothing new is stored by colouring | with the conversation by the chat system | as the conversation |
| Artifact versions | artifact store; persistence not read; unknown | unknown | unknown |

**Models and providers.** The model writes the diff text. Colouring runs on the device and does not depend on which model or provider produced it.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for fenced diff colouring. |
| Permissions | CLI /diff-review reads the git repository in the working folder and checks the repository configuration first (tui_app.rs:6584-6591). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Any model; the diff must be valid-looking text. |
| Provider restrictions | none found in the code. |
| Local mode | Everything shown here is local rendering; the CLI review works with git on the device in any mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty diff text | not established; split of an empty string gives one blank row shown as a space. | CodeBlock.tsx:53 |
| Identical artifact versions | 'No changes since version N'. | ArtifactChangesView.tsx:74-77; test ArtifactChangesView.test.tsx:27 |
| Punctuation-only change | Not reported as 'No changes'. | ArtifactChangesView.test.tsx:18 |
| Clean working tree in CLI | 'No changed files (working tree clean).' | tui_app.rs:6660 |
| git failure in CLI | Shows git status failed message instead of an empty view. | tui_app.rs:6603-6622 |
| Colour-blind or no colour | Plus and minus signs stay (web artifact view, CLI gutter); mobile can hide signs by setting. | ArtifactChangesView.tsx:34; diff_review.rs:54-60; CodeCardAppearance.test.tsx:87 |
| Offline | not handled in the code; not applicable. | searched the diff code paths; no network call found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/AnswerSurfaces.test.tsx`: Diff fence rows tagged remove and add (line 297-316).
- `apps/web/features/chat/components/artifacts/ArtifactChangesView.test.tsx`: No-change wording.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactChangesView.summary.test.tsx`: Mobile change summary.
- `apps/mobile/__tests__/CodeCardAppearance.test.tsx`: Diff font and optional signs.
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.codeCard.test.tsx`: Tabs in diff lines.
- `apps/cli/src/tui/widgets/diff_review.rs`: Inline tests for decisions, hunk staging and discard (lines 800-920).
- `apps/extension-vscode/src/__tests__/codeBlockActions.webview.test.ts`: Rendered code-block actions in VS Code; diff class coverage not confirmed.
- `packages/ui/unified-chat/src/components/__tests__/ToolCallCard.fileDiff.test.tsx`: Tool-call file diff card.

**Test scenarios**

- **Colour a diff**
  1. Ask for a change as a unified diff.
  2. View on web.
  - Expected: Green and red rows; header lines also coloured (known quirk).
- **Patch fence**
  1. Ask for a patch block on web and mobile.
  - Expected: Mobile colours; web currently does not (gap).
- **Artifact changes**
  1. Edit an artifact to make version 2.
  2. Open the changes view.
  - Expected: Summary and marked lines; identical versions say no changes.
- **CLI review**
  1. Change two files in a repo.
  2. Run /diff-review, press y on one and n on the other, Enter.
  - Expected: First staged, second unstaged; result message lists counts.
- **Error line**
  1. Run code that fails with a line number.
  - Expected: Today nothing is highlighted in any app.

**Where to look when it fails**

- CLI messages 'git status failed' and 'No changed files'.
- No log lines for web diff colouring.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)
- CLI: [70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md)
- VS Code: [70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **Error-line highlight is not built in any app.** Affects: All apps. Evidence: search for errorLine and related names returned no code. Work needed: Define input (execution error with line) and a line mark in CodeBlock, CodeCard, and others.
- **Web treats only fence word 'diff' as a diff.** Affects: Web, Desktop. Evidence: CodeBlock.tsx:225 vs CodeCard.tsx diff, patch, udiff. Work needed: Use the language alias resolution.
- **File header lines are coloured as add or remove on web and mobile.** Affects: Web, Desktop, Mobile. Evidence: CodeBlock.tsx:40; CodeCard.tsx:73-77. Work needed: Treat ---, +++ and @@ lines separately as VS Code does.
- **Chrome shows diffs as plain code.** Affects: Chrome. Evidence: no diff code in markdown.ts. Work needed: Add diff rows to the side panel.
- **Diffs are not coloured in the web expanded dialog.** Affects: Web, Desktop. Evidence: CodeBlock.tsx:274. Work needed: Reuse DiffLines.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- F021-01
- file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx
- file:apps/cli/src/tui/widgets/diff_review.rs

## Unknown

- Where artifactChanges is implemented.
- Whether CLI replies with a diff fence are coloured as diff by syntect.
- Empty and failing diff behaviour.
- Tauri desktop diff rendering.
- Persistence of artifact versions.
