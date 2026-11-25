---
id: "F073-03"
type: "feature"
title: "File and symbol mentions with @"
aliases: ["@ mentions", "File mention", "Symbol mention", "fileSearch", "mentionSearch", "S73.08", "S73.09"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.08", "S73.09"]
depends_on: ["surface:vscode", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "F073-01", "file:apps/extension-vscode/src/data/mentionSearch.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-03 File and symbol mentions with @

In the VS Code chat composer, typing @ and a name searches workspace files, folders and code symbols. Picking a result attaches that file or that symbol's line range to the turn. Credential and git-ignored paths are not offered. Only the VS Code extension has it.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.08](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7308), [S73.09](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7309).

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

**What it does.** Offers a list while the person types @query. Results are symbols from language servers, folders and files. The chosen item travels as a workspace reference carrying a relative path and an optional line range.

**Why it exists.** To point the assistant at exact code without pasting it, and to send only a symbol's lines instead of a whole file (brief S73.08, S73.09).

**Who uses it.** Developers using the VS Code chat.

**Problems it solves**

- Finding the right file name to share.
- Sending too much code when only one function matters.

**Use cases**

- Type @Router to attach a class by its lines.
- Type @package to attach a manifest file.
- Attach a folder by name.
- Select code then @file to attach the same file with the selection range.

## 2. User experience

**Where to find it**

- VS Code: chat composer in the AGI Code view or AGI Chat tab; type @ followed by at least one character (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8537-8547).

**Before you start**

- A workspace folder open; results come from workspace search (apps/extension-vscode/src/data/mentionSearch.ts:49-67).
- A language server with a workspace symbol provider for symbols; forks without one get files only (mentionSearch.ts:5-9).

**Screens and controls**

- Dropdown of results labelled like 'path · lines 4-12', 'name · kind · path · lines', 'folder/ · folder' (mentionSearch.ts:29-34, 85, 130).
- Enter or Tab picks the highlighted item (webviewContent.ts:5895, 5922).
- Chosen items show as references with a #L<start>-L<end> suffix (webviewContent.ts:8268-8275).

**Journey**

1. Click in the composer and type @.
2. Type a few letters; the host searches (webviewContent.ts:8545).
3. Pick a result with the keyboard or mouse.
4. Send; the reference becomes a turn input (ChatStateManager.ts:5120, 5394).

**What the person sees and gets**

- Result list.
- The reference appears in the composer and in the sent context.

**Settings**

- agiWorkforce.respectGitIgnore (package.json:1317-1322).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- searchMentionTargets runs symbol, file and folder searches in parallel and merges them (mentionSearch.ts:138-168).
- Limits: 8 symbols, 5 folders, 15 files (mentionSearch.ts:24-26). node_modules is excluded for file and folder search (mentionSearch.ts:51, 73).
- Every candidate path is checked with resolveContextFile, so credential or ignored paths are dropped (mentionSearch.ts:144-154).
- Symbols outrank files; duplicates are removed by path and line range (mentionSearch.ts:155-166).
- Search failure posts an empty list (ChatStateManager.ts:1550-1558).
- If the person has a selection in the matching file, the file result carries the selection range (mentionSearch.ts:36-47).

**Incomplete**

- No visible empty-state text for 'no results' was found in the code opened (webviewContent.ts:8243-8245 only shows results).

**Present but disconnected or switched off**

- None found.

**Not available**

- Other apps have no @ file search in this feature.

## 4. Required behaviour

**Established requirements**

- Typing @ in the composer searches workspace files and attaches the chosen file content to the turn. (source: S73.08)
- @ search also offers workspace symbols, attaching only the symbol's file range. (source: S73.09)

**Acceptance criteria**

1. Typing @ plus a letter shows files matching the letter.
2. A function name offers a symbol result with its line range when a language server runs.
3. A .env file never appears in results.
4. A git-ignored file never appears when respectGitIgnore is on.
5. Picking a symbol and sending attaches only those lines.
6. In an editor without a symbol provider, files still appear.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mention attachment content is read from the file by the host at send time through promptReferences [inferred from imports in mentionSearch.ts:12 and promptReferences usage in the brief].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a 'no matches' row when the list is empty.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | searchMentionTargets | `apps/extension-vscode/src/data/mentionSearch.ts` | Builds file, folder and symbol results. |
| service | contextExclusion.resolveContextFile | `apps/extension-vscode/src/data/contextExclusion.ts` | Filters out withheld paths. |
| service | promptReferences | `apps/extension-vscode/src/features/chat-participant/promptReferences.ts` | Defines WorkspaceFileReference and turns references into turn input. |
| store | fileSearch handler | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Receives fileSearch and posts fileSearchResults (lines 1550-1558). |
| screen | Mention dropdown | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Detects @, posts the query, shows results (lines 8537-8547, 8243-8245). |
| event | fileSearch / fileSearchResults messages | `apps/extension-vscode/src/protocol/webviewMessages.ts` | Message contract between webview and host. |
| service | VS Code workspace symbol provider command | `apps/extension-vscode/src/data/mentionSearch.ts` | Calls vscode.executeWorkspaceSymbolProvider (lines 102-112). |
| config | respectGitIgnore | `apps/extension-vscode/package.json` | Setting for ignored files (line 1317). |
| test | mentionSearch tests | `apps/extension-vscode/src/__tests__/mentionSearch.test.ts` | Search behaviour. |
| test | fileMention webview test | `apps/extension-vscode/src/__tests__/fileMention.webview.test.ts` | Dropdown behaviour. |
| test | mentionFileInChat test | `apps/extension-vscode/src/__tests__/mentionFileInChat.test.ts` | Mention flow in chat. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Webview detects @query and posts fileSearch. | device | webviewContent.ts:8537-8547 |
| Host runs workspace symbol search and file and folder find. | device | mentionSearch.ts:138-143 |
| Each candidate is checked against exclusion rules. | device | mentionSearch.ts:144-154 |
| Results post back; the person chooses one. | device | ChatStateManager.ts:1550-1558 |
| On send the reference goes to the runtime and then to the selected model. | device and our servers | ChatStateManager.ts:5394; boundary per model picker |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Query and result list | Memory only. | No. | Dropped after use. |
| Chosen reference | In the composer and then the thread. | Unknown. | Follows the thread. |

**Models and providers.** No model takes part in search; search is by editor language servers and file names only (mentionSearch.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code for searching. |
| Permissions | Exclusion rules apply; workspace trust not checked in this file (not handled in the code opened). |
| Subscription | None found in the code. |
| Limits and metering | Result caps 8, 5, 15 (mentionSearch.ts:24-26). |
| Feature flags | respectGitIgnore. |
| Model compatibility | Any. |
| Provider restrictions | None found in the code. |
| Local mode | Search runs on the device; with an on-device model the content stays local. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Not handled in the code opened (no spinner seen). | webviewContent.ts:8243-8245 |
| Empty | Not handled in the code opened; empty list returned. | mentionSearch.ts:167 |
| Error | Each search branch catches and returns empty; whole handler posts empty. | mentionSearch.ts:139-143; ChatStateManager.ts:1556-1558 |
| Stale answer | A reply is shown only if its query matches the current query. | webviewContent.ts:8243-8245 |
| No symbol provider | Symbols empty, files still offered. | mentionSearch.ts:109-113 |
| Keyboard | Enter and Tab accept. | webviewContent.ts:5895, 5922 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/mentionSearch.test.ts`: Symbols with line ranges, folders, ignored files withheld, symbols above files, files without symbol provider, credential symlink.
- `apps/extension-vscode/src/__tests__/fileMention.webview.test.ts`: @ dropdown in the webview.
- `apps/extension-vscode/src/__tests__/mentionFileInChat.test.ts`: Mention in the chat flow.
- `apps/extension-vscode/src/__tests__/promptReferences.test.ts`: Reference to input conversion.

**Test scenarios**

- **Symbol range**
  1. Type @ and a function name.
  2. Pick the symbol.
  3. Send.
  - Expected: Turn carries that file with its lines only.
- **Secret hidden**
  1. Create .env.
  2. Type @env.
  - Expected: .env not listed.
- **Folder**
  1. Type @ and a folder name.
  - Expected: Folder entry ending in /.
- **No language server**
  1. Open a plain folder with no extension.
  2. Type @ and a file name.
  - Expected: Files listed, no symbols.
- **No match**
  1. Type @zzzzzz.
  - Expected: Dropdown empty or closed; no error.

**Where to look when it fails**

- No log lines found; failures are swallowed to empty lists (mentionSearch.ts:139-143).

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **No empty or loading state for the list.** Affects: VS Code users. Evidence: webviewContent.ts:8243-8245, mentionSearch.ts:167. Work needed: Add a no-results row and a busy indicator.
- **Failures are silent.** Affects: Testers. Evidence: ChatStateManager.ts:1556-1558. Work needed: Log to the developer output channel.

**Depends on**

- surface:vscode
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- F073-01
- file:apps/extension-vscode/src/data/mentionSearch.ts

## Unknown

- How a reference with a range is read into text at send time (promptReferences body not opened).
- Whether Windows path separators matter in folder matching (split on '/', mentionSearch.ts:78).
- Whether the dropdown shows a loading state.
