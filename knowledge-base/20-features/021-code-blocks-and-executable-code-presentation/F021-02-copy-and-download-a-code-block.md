---
id: "F021-02"
type: "feature"
title: "Copy and download a code block"
aliases: ["Copy code", "Download code", "Download source file", "S21.03", "S21.04", "Copy button", "Download {{fileName}}"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S21.03", "S21.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx", "file:packages/ui/unified-chat/src/components/markdown/codeFileName.ts", "F021-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-02 Copy and download a code block

Each code block has a Copy button that puts the block's exact code on the clipboard, and on web, desktop and mobile a Download button that saves it as a file named by language. The CLI copies the last block with /copy code; VS Code and Chrome copy only.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.03](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2103), [S21.04](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2104).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Copies a code block's own text to the clipboard and saves it as a source file with a fitting name and extension. Spreadsheet-type content is passed through a safe export so formulas cannot run when opened.

**Why it exists.** Brief items S21.03 and S21.04: people take code out of chat into their editor. Exact copy avoids retyping; a correct extension makes the file usable.

**Who uses it.** Developers and other users who reuse code from replies.

**Problems it solves**

- Selecting long code by mouse is error prone.
- A saved file needs a sensible name, such as Dockerfile for docker code.
- CSV or TSV downloads could carry spreadsheet formulas that execute when opened.

**Use cases**

- Click Copy on a web block and paste into an editor.
- Download a docker block and get a file called Dockerfile.
- Download a csv block on mobile and share the file.
- Type /copy code in the CLI to copy the last block.

## 2. User experience

**Where to find it**

- Web and hosted Desktop: header bar of a code block, 'Copy' text button and a download icon button (CodeBlock.tsx:134-164,179-194).
- Web expanded dialog: same Copy and download buttons (CodeBlock.tsx:251-253).
- Mobile: copy icon (accessibility label 'Copy code') and download icon ('Download <file name>') in the code card header (CodeCard.tsx:515-535; CodeBlockCopyButton.tsx:36).
- CLI: slash command /copy with targets code, block, snippet (apps/cli/src/tui/tui_app.rs:5915; apps/cli/src/claude_parity.rs:1123-1137).
- VS Code: 'Copy' button shown on hover or focus in the code block (apps/extension-vscode/src/webview/render.ts:36; webviewContent.ts:1454-1456).
- Chrome side panel: copy icon button in the code bar (apps/extension/src/features/side-panel/markdown.ts:314-347).

**Before you start**

- A completed or streaming code block. On mobile Download shows only when highlighting is on and the block has code (CodeCard.tsx:~529).
- Browser clipboard permission on web.

**Screens and controls**

- Copy button: text changes to 'Copied' for 2 seconds or 'Copy failed' for 4 seconds on web.
- Download icon button: tooltip and label 'Download <fileName>'.
- Both are normal buttons, reachable by Tab; on touch screens they are 44 px high (CodeBlock.tsx:61-70).

**Journey**

1. Read a reply with a code block.
2. Click Copy; button shows 'Copied'.
3. Or click the download icon; the browser saves code.<ext> (or Dockerfile / Makefile).
4. On mobile, the file is written then the system share sheet opens.

**What the person sees and gets**

- Button text 'Copied' or 'Copy failed'; screen reader label 'Code copied' or 'Copying code failed'.
- A saved file named from the language.
- Mobile: alert 'Download failed' with 'Could not save this code as a file. Try again.'
- CLI: system message 'Copied last code block to clipboard (N lines).' or the code itself when no clipboard (tui_app.rs:5935-5944).

**Settings**

- none found for copy or download.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web copy: navigator.clipboard.writeText(code) with 2000 ms and 4000 ms resets; failure reports class code_copy detail permission_denied (CodeBlock.tsx:33-34,93-104).
- Web download: codeFileFor(language) then spreadsheetSafeExport then downloadTextFile (CodeBlock.tsx:108-112; codeFileName.ts:113-125; downloadTextFile.ts:3-12). Docker and makefile blocks become Dockerfile and Makefile (codeFileName.ts:56-59,116-117); unknown languages give code.txt (codeFileName.ts:123-124).
- Web: shell blocks (bash, sh, shell, zsh) show 'These commands are examples only; they have not been executed.' (CodeBlock.tsx:31,229-239; test AnswerSurfaces.test.tsx:297).
- Mobile: download uses the same codeFileFor and spreadsheetSafeExport from the shared package, writes the file with exportSourceFile and opens shareFile (CodeCard.tsx:141-163; test MessageContentRenderer.codeCard.test.tsx:25-62). Mobile shows the same shell note (CodeCard.tsx:578).
- CLI: /copy code copies the last fenced block of the last assistant reply; /copy diff copies the last diff (claude_parity.rs:1149-1155; test claude_parity.rs:4525).
- VS Code: copy writes code text to the clipboard and shows 'Copied!' or a failure label for 1500 ms (webviewContent.ts:5498-5510; test codeBlockActions.webview.test.ts:106).
- Chrome: copy button with idle, copied and failed states (markdown.ts:314-347).

**Incomplete**

- Brief citations for mobile MessageContentRenderer.tsx:531 and CLI tui_app.rs:3492/3506 do not point at copy code (line 531 is table code; 3492 is status line code).

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI per-block copy or any download (brief says download missing; /copy has no file save).
- VS Code and Chrome download.
- No plan limit on download exists in the code; none found.

## 4. Required behaviour

**Established requirements**

- Each code block has a copy control that copies exactly its code. (source: S21.03 brief)
- A code block can be downloaded as a source file with a sensible extension. (source: S21.04 brief)
- Shell code is labelled as not executed. (source: CodeBlock.tsx:229-239)
- Spreadsheet content is exported through a safe helper. (source: CodeBlock.tsx:110)

**Acceptance criteria**

1. Click Copy on web: clipboard equals the block text without the trailing newline; button reads 'Copied' then reverts after 2 s.
2. Deny clipboard access: button reads 'Copy failed' and reverts after 4 s.
3. Download a python block: file code.py; docker block: Dockerfile; unknown language: code.txt.
4. Download a csv block containing =cmd cells: formulas are neutralised in the saved file.
5. A bash block shows the 'not executed' note on web and mobile.
6. CLI: /copy code with no block says 'The last response has no fenced code block to copy.'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The hosted Electron Desktop has the same buttons as web (AGENTS.md section 5) [inferred].
- Copy copies the displayed block text after one trailing newline is removed (CodeBlock.tsx:292) [inferred from code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a per-block copy and a save action to the CLI.
- [proposed] Add Download to VS Code and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FencedCodeBlock copy and download buttons | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | handleCopy, handleDownload, labels, shell notice. |
| service | codeFileFor | `packages/ui/unified-chat/src/components/markdown/codeFileName.ts` | Maps language to file name and extension. |
| service | downloadTextFile | `packages/ui/unified-chat/src/components/markdown/downloadTextFile.ts` | Creates a blob link and triggers the browser download. |
| service | spreadsheetSafeExport | `packages/ui/unified-chat/src/lib/tabular.ts` | Neutralises spreadsheet formulas for csv/tsv output. |
| config | highlightLanguages | `packages/ui/unified-chat/src/components/markdown/highlightLanguages.ts` | Language aliases used to pick extensions. |
| component | CodeBlockCopyButton | `apps/mobile/src/features/chat/components/CodeBlockCopyButton.tsx` | Mobile copy icon with status. |
| hook | useCopyAction | `apps/mobile/src/shared/hooks/useCopyAction.ts` | Copy state (copied, failed) used by the mobile button; file path inferred from import, not opened. |
| component | CodeCard download | `apps/mobile/src/features/chat/components/CodeCard.tsx` | codeDownloadFile, downloadCodeBlock, CodeDownloadButton. |
| service | fileCreation exportSourceFile / shareFile | `apps/mobile/services/fileCreation.ts` | Writes and shares the file; path inferred from the import '@/services/fileCreation', not opened. |
| command | /copy | `apps/cli/src/tui/tui_app.rs` | Copies response, last code block or diff with the arboard clipboard. |
| service | CopyTarget / last_code_block | `apps/cli/src/claude_parity.rs` | Parses /copy target and extracts the block. |
| component | renderCodeBlock copy button | `apps/extension-vscode/src/webview/render.ts` | Emits the Copy, Explain and Apply buttons. |
| component | bindCodeBlockActions | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Click handlers; copy path at lines 5498-5510. |
| component | buildCodeCopyButton | `apps/extension/src/features/side-panel/markdown.ts` | Chrome side panel copy bar. |
| service | client failure classes | `packages/contracts/types/src/client-failures.ts` | Defines code_copy failure class. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click on Copy calls the browser clipboard API with the block text. | device | CodeBlock.tsx:96 |
| Click on download picks the file name, runs the safe export, builds a Blob and clicks a hidden link. | device | CodeBlock.tsx:108-112; downloadTextFile.ts:3-12 |
| On clipboard refusal a code_copy failure is reported to the installed sink. | device and our servers | CodeBlock.tsx:100; sink destination not read; unknown |
| Mobile writes the file to device storage and opens the system share sheet. | device | CodeCard.tsx:156-163 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Clipboard text | operating system clipboard | not by this app; OS clipboard sync rules apply | controlled by the OS |
| Downloaded file | browser downloads folder; mobile app file area then share target | no | object URL released after 1000 ms (downloadTextFile.ts:1,11); file stays until the user deletes it |

**Models and providers.** No model or provider involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | Web needs clipboard write permission from the browser; refusal shows 'Copy failed'. Mobile uses the share sheet. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. Plan limits: not seen. |
| Feature flags | none found in the code. |
| Model compatibility | Independent of the model. |
| Provider restrictions | none found in the code. |
| Local mode | Works the same in Local mode; nothing leaves the device (copy and download are local actions). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Clipboard refused | 'Copy failed' for 4 s, failure reported. | CodeBlock.tsx:99-103; CodeBlock.test.tsx:110 |
| Long block | Copy still copies the whole source and stays at the top of the header. | CodeBlock.test.tsx:129 |
| Copy during streaming | Button present; copies the code so far [inferred; no stream guard on Copy]. | CodeBlock.tsx:134-150,181 |
| Unmount while timer runs | Timer cleared. | CodeBlock.tsx:86-91 |
| Unknown language download | code.txt. | codeFileName.ts:123 |
| Mobile download failure | Alert 'Download failed'. | CodeCard.tsx:160-162 |
| Mobile empty fence | No Download button. | MessageContentRenderer.codeCard.test.tsx:59 |
| CLI no clipboard | Prints contents in a system message. | tui_app.rs:5940-5943 |
| Offline | not handled in the code; copy and download need no network. | searched CodeBlock.tsx and downloadTextFile.ts; no network call found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/CodeBlock.test.tsx`: Copy success, failure, 200-line block copy.
- `packages/ui/unified-chat/src/components/markdown/__tests__/codeFileName.test.ts`: File names for mermaid, highlighted, whole-file and unknown languages.
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Copy of an overflowing table copies every character.
- `packages/ui/unified-chat/src/components/markdown/__tests__/AnswerSurfaces.test.tsx`: Shell block marked not executed.
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.codeCard.test.tsx`: Mobile csv neutralised, Download label, no Download for empty fence, shell note.
- `apps/mobile/__tests__/copy-system-contract.test.ts`: Copy controls follow the copy contract (title level).
- `apps/extension-vscode/src/__tests__/codeBlockActions.webview.test.ts`: Copy posts to clipboard in the VS Code webview.
- `apps/cli/src/claude_parity.rs`: Inline tests at line 4525 onward for /copy code, response and diff.

**Test scenarios**

- **Copy exact code**
  1. Open a reply with a block that ends with a newline.
  2. Click Copy.
  3. Paste into a text editor.
  - Expected: Pasted text equals the block without the final blank line; button said 'Copied'.
- **Denied clipboard**
  1. Block clipboard permission in the browser.
  2. Click Copy.
  - Expected: 'Copy failed' shows 4 s.
- **Download names**
  1. Ask for docker, python and an unlabelled-unknown block.
  2. Click download on each.
  - Expected: Dockerfile, code.py, code.txt.
- **CSV safety**
  1. Ask for a csv block with a cell =HYPERLINK(...).
  2. Download and open in a spreadsheet.
  - Expected: Cell is neutralised, not executed.
- **CLI copy**
  1. In the CLI, get a reply with two blocks.
  2. Run /copy code.
  - Expected: Only the last block is copied; message says N lines.

**Where to look when it fails**

- Client failure class code_copy detail permission_denied.
- Mobile alert 'Download failed'.
- CLI message 'Clipboard not available.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)
- CLI: [70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md)
- VS Code: [70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md)
- Chrome: [70-qa/test-plans/chrome/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/chrome/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **CLI has no per-block copy or file download; /copy takes only the last block.** Affects: CLI. Evidence: claude_parity.rs:1152; tui_app.rs:5915. Work needed: Add block selection and save-to-file.
- **VS Code and Chrome have no download.** Affects: VS Code, Chrome. Evidence: render.ts:36-41; markdown.ts:314-347. Work needed: Add a download action.
- **Plan limits for download: none established.** Affects: All. Evidence: none found in CodeBlock.tsx. Work needed: Owner decision if any limit is wanted.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx
- file:packages/ui/unified-chat/src/components/markdown/codeFileName.ts
- F021-01

## Unknown

- Whether any plan limit on download is intended.
- Where code_copy failure reports are sent on web.
- Exact file path of useCopyAction and fileCreation (inferred from imports).
- How the Tauri desktop renders the buttons.
