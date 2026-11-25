---
id: "F073-02"
type: "feature"
title: "Context from the editor (open file, selection, problems, unsaved text)"
aliases: ["Editor context chips", "Auto-attach editor context", "Active file, selection and problems chips", "editorContext.autoAttach", "S73.05", "S73.06", "S73.07", "S73.10"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.05", "S73.06", "S73.07", "S73.10"]
depends_on: ["surface:vscode", "mode:local", "mode:own-key", "mode:cloud", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "SYS-execution-boundaries", "file:apps/extension-vscode/src/data/composerContext.ts", "file:apps/extension-vscode/src/data/contextExclusion.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-02 Context from the editor (open file, selection, problems, unsaved text)

In the VS Code extension, the chat adds what the person is looking at to each turn: the open file, the selected code and the file's problems, shown as removable chips. Unsaved and untitled text is read from the editor. Credential, ignored or excluded files are withheld.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.05](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7305), [S73.06](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7306), [S73.07](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7307), [S73.10](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7310).

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

**What it does.** Builds context from the active editor before each turn and shows it as chips above the composer. The person can dismiss a chip. The chat host reads unsaved text from the buffer, lists problems reported by language tools, and can add git changes and the latest terminal output from a menu.

**Why it exists.** So the assistant sees the code in front of the person without copy and paste, and sees unsaved edits instead of a stale file on disk (brief S73.05, S73.06, S73.07, S73.10).

**Who uses it.** Developers using the VS Code extension chat.

**Problems it solves**

- Pasting code into chat.
- The model reading an old saved file instead of current edits.
- Secret files being sent by mistake.

**Use cases**

- Ask 'why does this fail' with the file and its error list already attached.
- Select a function and ask for an explanation.
- Ask about a new untitled scratch file.
- Work in a repo where .env files must never be sent.

## 2. User experience

**Where to find it**

- VS Code: chips above the composer in the AGI Code chat or the AGI Chat tab (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3604-3616).
- VS Code: editor right-click menu 'Explain' when text is selected (apps/extension-vscode/package.json:980-985).
- VS Code: command 'Code: Send Selection to a New Chat' (agi-workforce.sendSelectionToNewSession) (apps/extension-vscode/package.json:810-813).
- VS Code: shortcut Cmd+Shift+Alt+E for Explain with a selection (package.json:1492-1497).

**Before you start**

- A text editor open in a trusted folder; settings default to on.
- The file must not be a credential file or excluded by files.exclude, search.exclude or git ignore, otherwise only its path and a withheld notice go (composerContext.ts:434-447).

**Screens and controls**

- Chip for the active file labelled with the file base name (composerContext.ts:564-569).
- Chip labelled '<name> selection' (composerContext.ts:582-586).
- Chip with a count of problems (composerContext.ts:592-598).
- A remove control per chip posts dismissEditorContext (ChatStateManager.ts:1938-1940).
- Context menu items for git changes, terminal output, open files and web pages with detail text such as 'Select code in an editor first' or 'Trust this workspace to read git' (composerContext.ts:106-109, 172-175).

**Journey**

1. Open a file, optionally select code.
2. Chips appear above the composer after a short debounce (ChatStateManager.ts:3600-3616).
3. Remove any chip that should not go.
4. Send the message; the chips become inputs to the turn (ChatStateManager.ts:5016, 5386-5395).
5. Chips reset after sending (ChatStateManager.ts:4228).

**What the person sees and gets**

- Chips before sending.
- A 'sent context' record of what went with the turn (sentEditorContext at ChatStateManager.ts:5384).
- Withheld notice text: '<file> is open in the editor. Its contents are withheld from this conversation because the file ...' (composerContext.ts:442-447).

**Settings**

- agiWorkforce.editorContext.autoAttach (default true; workspace can turn off, only user turns on) (package.json:1292-1297).
- agiWorkforce.editorContext.attachOpenFile and attachSelection (package.json:1298-1316).
- agiWorkforce.editorContext.saveOpenFileBeforeSend (default false) (package.json:1304-1309).
- agiWorkforce.respectGitIgnore (default true) (package.json:1317-1322).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- resolveEditorContext builds file, selection and problems chips and texts (apps/extension-vscode/src/data/composerContext.ts:548-609).
- Unsaved or untitled documents send their buffer text, clipped, instead of the file path (composerContext.ts:418-432, 570-572).
- Files on the credential policy, excluded or git-ignored are turned into a path-only chip with a notice (composerContext.ts:434-496).
- Git changes are read only when the workspace is trusted (composerContext.ts:165-170).
- Terminal output attachment is capped (composerContext.ts:177-188).
- Private developer-output documents are never attached (composerContext.ts:523-526).
- Failures while resolving a file return a path-only context, not an error (composerContext.ts:543-545).

**Incomplete**

- Brief says the attachment is built at lines 155-163 and 177-188; actual builders are at 126-188 and 548-609, so the brief's line numbers are stale (area brief vs code).

**Present but disconnected or switched off**

- Auto attach can be switched off by the user or by a workspace (package.json:1292-1297).

**Not available**

- Web, Desktop, Mobile, CLI, Chrome do not have editor chips; they are n/a in the brief.

## 4. Required behaviour

**Established requirements**

- The active editor file is attached to each turn as context, shown as a removable chip. (source: S73.05)
- Selected code is attached (chip) and Explain and Send Selection commands exist. (source: S73.06)
- Unsaved edits in open buffers, including untitled files, reach the model rather than the stale saved file. (source: S73.07)
- Editor diagnostics for the active file are attached as context. (source: S73.10)
- Security behaviour fails closed and collects the minimum data. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Open file with unsaved edits: the sent turn contains the edited text, not the disk text.
2. Untitled file with text: sent as 'Unsaved new file'.
3. Select lines 3-5: a chip 'name selection' appears and its text names lines 3-5.
4. A file with two errors shows a chip with 2 problems; removing it removes the text.
5. A .env file open in the editor shows a chip but no contents, with a withheld notice.
6. Untrusted workspace: git changes item says 'Trust this workspace to read git'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Dismissed chips stay dismissed until the next send because the dismissed set is cleared only at send or reset [inferred from ChatStateManager.ts:1578, 4228].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the withheld reason on the chip itself, not only in the sent text.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | composerContext | `apps/extension-vscode/src/data/composerContext.ts` | Builds chips and texts for file, selection, problems, git, terminal, web page. |
| service | contextExclusion | `apps/extension-vscode/src/data/contextExclusion.ts` | Decides whether a file may be sent: credential policy, excludes, git ignore, safe path. |
| service | contextBuilder | `apps/extension-vscode/src/data/contextBuilder.ts` | Reads active file context, diagnostics, open files and git state from the editor API. |
| service | lastTextEditor | `apps/extension-vscode/src/platform/lastTextEditor.ts` | Remembers the working editor when focus is in the chat. |
| service | terminalOutput | `apps/extension-vscode/src/data/terminalOutput.ts` | Holds the latest terminal command output. |
| store | ChatStateManager editor context tracking | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Debounced pushEditorContext, dismissal set, attaches context at send (lines 1106, 3600-3616, 5016). |
| service | sentContext | apps/extension-vscode/src/data/sentContext.ts (not found) (not found) | Builds the list of what was sent with a turn. |
| command | agi-workforce.explain and sendSelectionToNewSession | `apps/extension-vscode/src/core/commandSetup.ts` | Selection commands (lines 880-906, 1145-1147). |
| config | editorContext settings | `apps/extension-vscode/package.json` | Auto-attach and related switches (lines 1292-1322). |
| service | Config | `apps/extension-vscode/src/platform/config.ts` | Reads settings and applies the trust rule (user-only turn-on). |
| service | developerOutput | `apps/extension-vscode/src/features/sidebar-webview/developerOutput.ts` | Marks the extension's own output documents as private so they are never attached. |
| test | composerContext tests | `apps/extension-vscode/src/__tests__/composerContext.test.ts` | Context builder behaviour. |
| test | contextExclusion tests | `apps/extension-vscode/src/__tests__/contextExclusion.test.ts` | Withholding rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Editor selection or file changes; host debounces and recomputes chips. | device | ChatStateManager.ts:3600-3616 |
| The file is resolved and checked against credential, exclude and git-ignore rules. | device | composerContext.ts:85-104, 468-496 |
| On send, texts and file paths become turn inputs. | device | ChatStateManager.ts:5016, 5386-5395 |
| The runtime sends those inputs to the selected model: on-device, own-key provider or Managed Cloud. | device and our servers | ChatStateManager.ts:2034-2121 (boundaries). Network code not opened. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chip list and dismissed ids | In memory of the chat host. | No. | Cleared on send or conversation reset (ChatStateManager.ts:1578, 4228). |
| Attached text sent with the turn | Inside the thread in the local runtime (location unknown). | Unknown. | Follows the thread. |

**Models and providers.** Context is model neutral text; the chosen model decides how much fits (a context warning at agiWorkforce.context.warningPercent, package.json:1286-1291).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account is needed to build chips; sending follows the chat rules in F073-01. |
| Permissions | Git context requires a trusted workspace (composerContext.ts:166). |
| Subscription | None found in the code for chip building. |
| Limits and metering | Unsaved text clipped at MAX_TOTAL_REFERENCE_CHARS; terminal output tail-clipped (composerContext.ts:177-188, 426-429); open-file list capped at 60 (composerContext.ts:34). |
| Feature flags | Settings above; no remote feature flag found. |
| Model compatibility | Any model. |
| Provider restrictions | None found in the code. |
| Local mode | Chips are built on the device; with an on-device model the text stays in the local runtime. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No editor | Empty context, no chips. | composerContext.ts:523-529 |
| Credential or ignored file | Path-only chip plus withheld notice. | composerContext.ts:449-466 |
| Read failure | Path-only context with reason unavailable. | composerContext.ts:543-545 |
| Untitled | Buffer text sent; flagged untitled. | composerContext.ts:91, 430-431 |
| Selection empty | No selection chip; Send Selection warns to select code. | composerContext.ts:46; commandSetup.ts:881-887 |
| Turn in flight | Send Selection asks modal confirmation naming that the reply will be lost. | commandSetup.ts:889-899 |
| Offline, timeout, cancel | Not applicable to local chip building; web page fetch has a 15 s timeout and 2 MB cap. | composerContext.ts:250-251 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/composerContext.test.ts`: Context building.
- `apps/extension-vscode/src/__tests__/contextExclusion.test.ts`: Which files are withheld.
- `apps/extension-vscode/src/__tests__/contextFileSelection.test.ts`: File selection for context.
- `apps/extension-vscode/src/__tests__/editorContextTracking.test.ts`: Editor tracking and chip refresh.
- `apps/extension-vscode/src/__tests__/contextBuilderGit.test.ts`: Git context.
- `apps/extension-vscode/src/__tests__/sentContext.test.ts`: Record of sent context.
- `apps/extension-vscode/src/__tests__/composerContextMenu.webview.test.ts`: Context menu in the webview.
- `apps/extension-vscode/src/__tests__/configTrustBoundary.test.ts`: Workspace settings cannot loosen user opt-outs.

**Test scenarios**

- **Unsaved edit**
  1. Edit a file without saving.
  2. Ask what the file does.
  - Expected: Answer reflects the unsaved text.
- **Secret file**
  1. Open .env.
  2. Ask a question.
  - Expected: Chip shows, contents withheld notice appears.
- **Remove chip**
  1. Open file.
  2. Remove the file chip.
  3. Send.
  - Expected: Turn has no file attachment.
- **Problems**
  1. Open file with a type error.
  2. Check chips.
  - Expected: Problems chip with count.
- **Untrusted git**
  1. Open untrusted folder.
  2. Open context menu.
  - Expected: Git item says trust the workspace.

**Where to look when it fails**

- Sent-context list for the turn (sentContext.ts).
- Settings UI for agiWorkforce.editorContext.*

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **Brief line references for this feature are stale (155-163, 177-188).** Affects: Docs. Evidence: composerContext.ts builders at 126-188 and 548-609. Work needed: Refresh the area brief.
- **Saving the file before send is off by default, so disk and buffer can differ for the CLI tools the agent runs.** Affects: VS Code users. Evidence: package.json:1304-1309. Work needed: Decide the default.

**Depends on**

- surface:vscode
- mode:local
- mode:own-key
- mode:cloud
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- SYS-execution-boundaries
- file:apps/extension-vscode/src/data/composerContext.ts
- file:apps/extension-vscode/src/data/contextExclusion.ts

## Unknown

- Whether chips are re-evaluated when the editor loses focus to the chat (lastTextEditor behaviour not fully read).
- Where attached text is stored inside the thread.
- How MAX_TOTAL_REFERENCE_CHARS compares with model context sizes.
