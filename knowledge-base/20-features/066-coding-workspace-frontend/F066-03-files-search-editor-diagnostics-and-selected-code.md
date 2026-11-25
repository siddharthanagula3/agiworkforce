---
id: "F066-03"
type: "feature"
title: "Files, search, editor, diagnostics and selected-code context"
aliases: ["File tree", "File search", "Code editor", "Editor tabs", "Selected-code context", "Diagnostics panel", "Symbol search", "Files panel", "Context files", "S66.08", "S66.09", "S66.10", "S66.11", "S66.12", "S66.13", "S66.14"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "partial", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.08", "S66.09", "S66.10", "S66.11", "S66.12", "S66.13", "S66.14"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "mode:local", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "F066-01", "file:apps/web/features/code/components/LocalFilesPanel.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-03 Files, search, editor, diagnostics and selected-code context

Browse the session folder's files, find a file by name, open several files in tabs and edit them (Desktop and web in Electron), attach files to a message, send a selection to the agent (CLI, VS Code), and explain editor errors (VS Code). The brief's 'missing' for tree and tabs is out of date.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.08](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6608), [S66.09](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6609), [S66.10](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6610), [S66.11](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6611), [S66.12](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6612), [S66.13](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6613), [S66.14](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6614).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person see and change the project's files from the coding surface and give the agent specific files, code ranges or error context.

**Why it exists.** The agent works better and the person trusts it more when they can point at exact code and fix small things without leaving the surface (S66.08 to S66.14).

**Who uses it.** Developers on Desktop and web (Electron), CLI, VS Code.

**Problems it solves**

- Opening another editor just to check or tweak a file.
- Describing code in words instead of pointing at it.
- Errors in the editor that the agent does not know about.

**Use cases**

- Press the Files shortcut, type part of a file name, open it, fix a typo, press Save.
- Attach two files with the paperclip so the agent reads them first.
- In the CLI type @src/app.ts#L10-20 to give the agent a range.
- In VS Code run 'Code: Explain Error' on a red squiggle.

## 2. User experience

**Where to find it**

- Desktop and web in Electron: session side panel shortcut 'Files' with badge (LocalSessionPanel.tsx:705-725; local-code.ts 'Files (⌘P)' filesShortcut); also app commands find-in-files and toggle-files (LocalSessionPanel.tsx:786-796).
- Editor opens from a Files tab or from a changed file's pencil button 'Edit <path>' in Changes (LocalChangesPanel.tsx:83-93,370).
- Context files: paperclip 'Add a file from this folder' under the message box with chips (LocalContextFiles.tsx:60-100; LocalSessionPanel.tsx:1756).
- CLI: type @ in the prompt for a file popup (apps/cli/src/tui/widgets/mention_popup.rs).
- VS Code: 'Code: Mention File in Chat', 'Code: Add File to Context', 'Code: Explain Selection', 'Code: Ask About Code', 'Code: Explain Error', 'Code: Send Selection to a New Chat' (package.json).
- Mobile: none.

**Before you start**

- Electron Desktop with an approved folder and command access (LocalSessionPanel.tsx:662).
- Files panel is hidden for remote SSH sessions (LocalSessionPanel.tsx:775-780).
- Context files need the 'context_files' capability and a non-SSH session (LocalSessionPanel.tsx:435).

**Screens and controls**

- Files panel: search box 'Search files by name', tree with folders first, a 'Delete file' button per file, close button 'Close files' (LocalFilesPanel.tsx:240-300).
- Open files tab strip with role tablist 'Open files', dirty dot on unsaved tabs, 'Close <name>' buttons (LocalFilesPanel.tsx:340-380).
- Editor: Save, Reload, Overwrite, Discard, 'Close the file' (LocalFileEditor.tsx; local-code.ts:150-164).
- VS Code: command palette and editor context menu entries.

**Journey**

1. 1. Open a session; open Files from the side panel.
2. 2. Expand folders or type a name; results show up to 200 files.
3. 3. Click a file; it opens in a tab; edit the text.
4. 4. Press Save. If the file changed on disk, choose Reload or Overwrite.
5. 5. Close the tab; if unsaved, confirm 'Discard your edits?'.
6. 6. To give the agent a file, use the paperclip and send the message.

**What the person sees and gets**

- Spinner 'Listing files' while loading.
- 'This folder is empty.' and 'No file names match.'
- 'The files in this folder could not be listed.' as an alert.
- 'This file is not UTF-8. Open it in your editor to change it.' and 'This file is too large to edit here. Open it in your editor instead.'
- 'This file changed on disk since you opened it.' and the deleted-on-disk message.

**Settings**

- None found for the editor.
- VS Code context exclusion rules (apps/extension-vscode/src/data/contextExclusion.ts) decide which files may be sent out; setting names not read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web inside Electron: lazy file tree with symlinks hidden, name search with 200 ms debounce and 200 results, tabs, per-file delete with confirmation, dirty-tab close confirmation (LocalFilesPanel.tsx:19-32,150-300). The brief marks web file tree, search and tabs missing; the code has them.
- Editor: UTF-8 text, size limit, version check via sha256 on save, reload and overwrite on conflict, line ending kept (LocalFileEditor.tsx:35-52,88-100; dispatcher.ts:2343-2350 passes expectedSha256).
- Desktop host commands file_list, file_read_text, file_write_text, file_delete, file_glob, file_grep with permission reasons (dispatcher.ts:669-694, 2335-2377).
- Context file attach for a folder, paths only; the CLI reads them (LocalContextFiles.tsx:30-35).
- CLI: file mentions using git ls-files with bounded fallback, fuzzy ranking, 256 KiB inline limit and #L line ranges (apps/cli/src/mentions.rs:1-60,435-460).
- VS Code: file and symbol mentions (data/mentionSearch.ts:102), send selection as a path plus range reference (core/commandSetup.ts:274-300,880-899), Explain Error reads editor diagnostics (features/editor-utilities/editorUtilities.ts:75-110), edit apply (platform/applyEdit.ts).

**Incomplete**

- Selected-code context does not exist on web or Desktop: no selection hook was found in LocalFileEditor.tsx or LocalChangesPanel.tsx (grep for selection found none).
- VS Code diagnostics: only a per-line Explain Error exists; there is no list of all problems. 'Export Diagnostics' is a support log, not code diagnostics (package.json; unverified).

**Present but disconnected or switched off**

- Files and terminal tools are hidden when the folder is unavailable, command access is withheld or the session is SSH (LocalSessionPanel.tsx:662,705).
- Context file picker is off without the context_files capability (always true when the handshake finished, developerSessionService.ts:496).

**Not available**

- Mobile: no files, search or editor.
- Chrome: not applicable.
- Web in a browser tab: no local files.
- Symbol search on web, Desktop, CLI: none found.
- CLI file tree and editor: none.

## 4. Required behaviour

**Established requirements**

- The workspace shows a browsable tree of the repository's files. (source: S66.08)
- The user searches the workspace for files by name from the coding surface. (source: S66.09)
- The user searches code symbols by name. (source: S66.10)
- The user can open and edit a source file inside the coding surface. (source: S66.11)
- Several files can be open at once in editor tabs. (source: S66.12)
- The user sends a selection to the agent as context. (source: S66.13)
- The workspace shows compiler and linter diagnostics and lets the user act on them. (source: S66.14)
- Discarding unsaved edits asks first and says they cannot be recovered; files and diagnostics belong on every developer screen. (source: local-code.ts:150-170 strings; doc: docs/product/experience-contract.md:269 'Files/context/diagnostics')
- A file the agent or tool removes goes to Trash first; permanent removal needs an explicit user action naming what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Opening Files lists the folder with directories first and no symlinks.
2. Typing in the search box shows only files whose names match, at most 200.
3. Two files opened show two tabs; closing a dirty tab asks 'Discard your edits?'.
4. Saving a file changed on disk since opening shows Reload and Overwrite, and Overwrite names that unrecovered changes are lost.
5. A non-UTF-8 or oversize file shows the refusal text and is not editable.
6. Deleting a file asks 'Delete file?' and removes it from tree, results and tabs.
7. In VS Code, Send Selection to a New Chat prefills '@path' with the selected range; in the CLI '@file#L1-5' attaches that range.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The Delete file button removes the file permanently via file_delete; whether it goes to Trash first, as AGENTS.md section 9 requires, was not verified (deleteRegularFile in the desktop host not read).
- [inferred] The Files panel closes the Changes panel and vice versa (LocalSessionPanel.tsx:577-595).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'Send selection to the agent' in the web editor.
- [proposed] Add a diagnostics list on Desktop using the language tools of the folder.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalFilesPanel | `apps/web/features/code/components/LocalFilesPanel.tsx` | Tree, search, tabs, delete file. |
| component | LocalFileEditor | `apps/web/features/code/components/LocalFileEditor.tsx` | Edit, save with version, conflict handling. |
| component | LocalContextFiles | `apps/web/features/code/components/LocalContextFiles.tsx` | Paperclip picker and chips. |
| component | LocalChangesPanel | `apps/web/features/code/components/LocalChangesPanel.tsx` | Mounts the editor for a changed file. |
| component | LocalSessionPanel | `apps/web/features/code/components/LocalSessionPanel.tsx` | Side panel shortcuts, keyboard shortcut, mounts panels (lines 577-796,1905-1950). |
| service | desktop-host client functions | `apps/web/features/desktop-host/index.ts` | listWorkspaceFiles, findWorkspaceFilesByName, readWorkspaceText, writeWorkspaceText, deleteWorkspaceFile. |
| service | Desktop dispatcher file commands | `apps/desktop/electron/runtime/dispatcher.ts` | file_list, file_read_text, file_write_text, file_delete, file_glob, file_grep. |
| config | MAX_TEXT_READ_BYTES and FileTextContent | `packages/contracts/local-runtime/src/` | Contract for text file reads and writes (file name not read). |
| service | CLI mentions | `apps/cli/src/mentions.rs` | workspace_file_candidates, rank, expand_mentions, split_line_range. |
| component | CLI mention popup | `apps/cli/src/tui/widgets/mention_popup.rs` | @ popup in the composer. |
| service | VS Code mentionSearch | `apps/extension-vscode/src/data/mentionSearch.ts` | File and workspace-symbol mention search. |
| command | VS Code selection and reference commands | `apps/extension-vscode/src/core/commandSetup.ts` | buildSidebarReferenceDraft (line 274), sendSelectionToNewSession (line 880). |
| service | VS Code editor utilities | `apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts` | Explain selection and Explain error prompts using diagnostics. |
| component | VS Code errorExplainerProvider | `apps/extension-vscode/src/providers/errorExplainerProvider.ts` | Registers explainError and askAboutCode. |
| service | VS Code contextExclusion | `apps/extension-vscode/src/data/contextExclusion.ts` | Refuses to send excluded files out. |
| service | VS Code applyEdit | `apps/extension-vscode/src/platform/applyEdit.ts` | Applies agent edits to editor documents. |
| store | local-session-memory | `apps/web/features/code/local-session-memory.ts` | Keeps draft text and context files per session in page memory. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Files panel asks the desktop host to list a folder. | device | LocalFilesPanel.tsx:150-168; dispatcher.ts:2335 |
| Host checks the file permission for the folder (filesystem.read) then reads the directory. | device | dispatcher.ts:669-684 |
| Opening a file reads text with its sha256; Save writes with expectedSha256 so a changed file is detected. | device | LocalFileEditor.tsx:88-100; dispatcher.ts:2343-2350 |
| Context files travel as paths; the CLI reads them inside the folder when the turn starts. | device | LocalContextFiles.tsx:30-35; local-code.ts:'filesQueued' |
| The agent turn runs through the chosen model; file content reaches the model only through that turn (local model on the device, or the account/own-key route). | device and our servers | model route not read for this feature; see SYS-chat-turn-pipeline |
| VS Code reads selection and diagnostics from the editor and forwards a prompt or reference. | device | commandSetup.ts:274-300; editorUtilities.ts:75-110 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Edited file text | The user's folder on disk | no | overwrite loses disk changes unless committed (local-code.ts:'overwriteFileDescription') |
| Open tabs, dirty flags | Page memory | no | lost on reload |
| Context file paths and drafts | local-session-memory (page memory) | no | page lifetime; storage kind unknown |

**Models and providers.** The panel itself calls no model. The VS Code Explain commands send a prompt to the configured model route (editorUtilities.ts; route not read). File mentions in the CLI inline file text into the prompt of whichever model is selected (mentions.rs:1-20).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | File browsing and editing need no account call found. |
| Permissions | Per folder: filesystem.read for list, glob, read; filesystem.write for write and delete (dispatcher.ts:669-694). VS Code uses contextExclusion to refuse outbound content (editorUtilities.ts describeOutboundRefusal). |
| Subscription | none found in the code for the panel; sending context to an account model follows the plan rules of the model route. |
| Limits and metering | Search shows at most 200 results (LocalFilesPanel.tsx:20); mention inline limit 256 KiB and up to 20,000 candidates (mentions.rs:27-35); editor size limit MAX_TEXT_READ_BYTES. |
| Feature flags | capability 'context_files' (always true after handshake). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Mode:local: browse and edit run fully on the device with no payment; file content leaves the device only when included in a turn that uses an account or own-key model. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Listing files'. | LocalFilesPanel.tsx:262-266 |
| Empty | 'This folder is empty.' / 'No file names match.' | LocalFilesPanel.tsx:255-258 |
| Error | Alert with 'The files in this folder could not be listed.' | LocalFilesPanel.tsx:164-166,243-247 |
| Non-UTF-8 or too large | Refusal text, no editing. | local-code.ts:150-152; LocalFileEditor.tsx:52 |
| File changed or deleted on disk | Conflict banner with Reload and Overwrite. | LocalFileEditor.tsx:55-80 |
| Unsaved edits when closing | Confirmation 'Discard your edits?' that says they cannot be recovered. | LocalFilesPanel.tsx:117-130 |
| Delete | Destructive confirmation 'Delete file?'. | LocalFilesPanel.tsx:147-160 |
| Remote SSH | Files shortcut and context files are off. | LocalSessionPanel.tsx:435,775-780 |
| Offline / timeout | not handled in the code beyond generic failure text. | not handled in the code (searched LocalFilesPanel.tsx) |
| Accessibility | Search has a screen-reader label; tabs use role tablist/tab/tabpanel; tree uses aria-expanded. | LocalFilesPanel.tsx:57-62,278-284,345-370 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalFilesPanel.test.tsx`: Directories first and symlinks hidden; name search opens files in tabs; asks before closing a dirty tab; focuses the search field; deletes a file after confirmation.
- `apps/web/features/code/components/LocalFileEditor.test.tsx`: Sends and receives file versions, refuses unreadable text, overwrite and reload on conflict, deleted-on-disk, discard confirmation.
- `apps/web/features/code/components/LocalChangesPanel.test.tsx`: Editor mounted from Changes: follows a terminal rewrite, asks before another file replaces unsaved edits.
- `apps/extension-vscode/src/__tests__/mentionSearch.test.ts`: File and symbol mention search.
- `apps/extension-vscode/src/__tests__/contextExclusion.test.ts`: Context exclusion rules.
- `apps/extension-vscode/src/__tests__/editorUtilities.test.ts`: Editor utility prompts (cases not read).
- `apps/extension-vscode/src/__tests__/mentionFileInChat.test.ts`: Mention file in chat command.
- `apps/extension-vscode/src/__tests__/contextFileSelection.test.ts`: Context file selection.
- `apps/cli/src/mentions.rs`: In-file mention tests (cases not read).

**Test scenarios**

- **Edit and save**
  1. Open Files, open a text file, change a line, press Save, check the file on disk.
  - Expected: The disk file has the change; no dirty dot remains.
- **Disk conflict**
  1. Open a file in a tab.
  2. Change it in another editor.
  3. Edit in the tab and Save.
  - Expected: The banner says it changed on disk; Reload drops your edit, Overwrite replaces the disk version.
- **Binary or huge file**
  1. Open an image or a file over the size limit.
  - Expected: A refusal message tells you to use your editor.
- **Tabs and discard**
  1. Open two files, edit one, click its tab close.
  - Expected: A confirmation names the file and says edits cannot be recovered.
- **Range mention in the CLI**
  1. Type @src/lib.rs#L1-5 and a question, send.
  - Expected: Only lines 1 to 5 reach the model as a file block.
- **Explain Error in VS Code**
  1. Put the cursor on a line with a red squiggle, run Code: Explain Error.
  - Expected: A prompt with the problems and surrounding code is sent; with no problem it says 'No errors on this line.'

**Where to look when it fails**

- Strings fileReadFailed, fileSaveFailed, filesFailed.
- DesktopRuntimeError code 'not-found' handled as deleted-on-disk (LocalFileEditor.tsx:76-82).
- VS Code outbound refusal message from describeOutboundRefusal.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **Brief says web file tree, search, editor and tabs are missing; Desktop tree and search missing. The code has all of them in the Electron web app.** Affects: Web, Desktop planning. Evidence: LocalFilesPanel.tsx; brief S66.08, S66.09, S66.12. Work needed: Update the brief; live-verify.
- **No selected-code context on web or Desktop.** Affects: Web, Desktop. Evidence: No selection code in LocalFileEditor.tsx. Work needed: Add a send-selection action with a range reference.
- **No diagnostics list or code-action surface; only Explain Error per line in VS Code.** Affects: All apps. Evidence: editorUtilities.ts:75. Work needed: Design a diagnostics panel per app.
- **File delete may not use the Trash as AGENTS.md section 9 requires.** Affects: Desktop. Evidence: LocalFilesPanel.tsx:147-160; deleteRegularFile not read. Work needed: Read host implementation and route through Trash.
- **No symbol search outside VS Code.** Affects: Web, Desktop, CLI. Evidence: mentionSearch.ts:102 only. Work needed: Decide scope.
- **The Files tool lives under the terminal gate, so a folder without terminal access also loses files.** Affects: Desktop. Evidence: LocalSessionPanel.tsx:662,705-725. Work needed: Check whether intentional.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- mode:local
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- F066-01
- file:apps/web/features/code/components/LocalFilesPanel.tsx

## Unknown

- Whether file delete uses Trash.
- Where the contract for MAX_TEXT_READ_BYTES lives and its value.
- Which VS Code settings control context exclusion.
- Whether CLI mention tests cover line ranges.
- Whether the VS Code 'Export Diagnostics' command has any code-diagnostics content.
