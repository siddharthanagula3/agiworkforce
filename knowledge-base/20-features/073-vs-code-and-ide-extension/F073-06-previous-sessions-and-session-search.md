---
id: "F073-06"
type: "feature"
title: "Previous sessions and session search"
aliases: ["Sessions list", "Session picker", "Code: Show Sessions History", "Recent conversations", "Session search", "Continue in Terminal", "Continue CLI Session Here", "S73.03", "S73.04", "S73.24"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.03", "S73.04", "S73.24"]
depends_on: ["surface:vscode", "surface:cli", "mode:local", "mode:cloud", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "SYS-memory-projects-and-context", "SYS-agents-tools-and-automation", "F073-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-06 Previous sessions and session search

In the VS Code extension, the person can list earlier chats for the open folder (local) and cloud chats and code sessions, reopen one, search local sessions by text, and move a session between VS Code and the terminal CLI. Local sessions belong to the folder whose runtime made them.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.03](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7303), [S73.04](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7304), [S73.24](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7324).

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

**What it does.** Shows recent conversations in the chat, a sessions sheet with local and cloud rows, a history picker command with text search, and commands to hand a session to the terminal or take over a CLI session.

**Why it exists.** Work continues across days and tools; sessions must be found again and tied to the right folder (brief S73.03, S73.04, S73.24).

**Who uses it.** Developers who use VS Code with the AGI CLI.

**Problems it solves**

- Losing a conversation after closing the window.
- Switching between editor and terminal without losing context.
- Finding an old chat by a word in it.

**Use cases**

- Reopen yesterday's chat for this repo.
- Search for 'migration' across local sessions.
- Continue a running chat in the terminal with the CLI.
- Open a cloud chat in VS Code.

## 2. User experience

**Where to find it**

- VS Code: recent conversations list in the AGI Code chat start screen (up to 5) (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:274, 2474-2490).
- VS Code: sessions sheet inside the chat webview with local and cloud sources (ChatStateManager.ts:2580-2640).
- VS Code command 'Code: Show Sessions History' (agi-workforce.showSessionsHistory) with a quick-pick and an Archived entry (apps/extension-vscode/package.json:216-219; apps/extension-vscode/src/features/trees/sessionPickers.ts:60-110).
- VS Code commands 'Code: Open Conversation', 'Code: Continue This Session in the Terminal', 'Code: Continue CLI Session Here' (package.json:192-195, 803-811).
- There is no separate Sessions view in the activity bar; the only contributed view is the AGI Code webview (package.json:962-970).

**Before you start**

- A folder open in VS Code, trusted; the local runtime must be running to list local sessions.
- Cloud rows need an AGI account sign-in (ChatStateManager.ts:2580).
- Continue in the terminal needs a thread id, an open folder and an installed AGI CLI (commandSetup.ts:466-496).

**Screens and controls**

- Search box in the sessions sheet posts searchSessions (webviewContent.ts:6480).
- Rows show title, age, unread, pinned, branch, origin and a snippet for search hits (ChatStateManager.ts:2664-2690).
- Quick-pick title from sessionSearch.title; search starts at 2 characters (sessionPickers.ts:15, 70-85).

**Journey**

1. Open the sessions sheet or run 'Code: Show Sessions History'.
2. Browse the list or type at least two characters.
3. Choose a row. A local row resumes in this chat; a cloud-code row opens the cloud session; a cloud chat is continued here or opened on the web (ChatStateManager.ts:1718-1739).
4. To move to the terminal run 'Continue This Session in the Terminal'; the extension releases the runtime and runs the CLI with --resume and the thread id in a new terminal (commandSetup.ts:466-496).

**What the person sees and gets**

- Rows, snippets, unavailable messages per folder.
- Info messages such as 'send a message first, then the terminal can pick this session up.' (commandSetup.ts:469-471).
- A terminal opened in the folder.

**Settings**

- agiWorkforce.archiveInactiveSessionsDays (package.json:74).
- Session groups and pins stored in workspace state (ChatStateManager.ts:2660-2663).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Local search runs against every open workspace folder's runtime and merges and sorts by date (apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:323-350).
- The chat's search turns hits into rows with snippets, unread, group and pin state (ChatStateManager.ts:2649-2700).
- Cloud list merges account chats and AGI Code sessions, filtered to the workspace's GitHub repositories when known (ChatStateManager.ts:2593-2630).
- Sign-out gives 'Sign in to AGI Cloud to see cloud chats and AGI Code sessions.' (ChatStateManager.ts:2580).
- Opening a row routes by source: local, cloud-code or cloud chat (ChatStateManager.ts:1718-1739).
- Sessions are tied to a folder: the runtime is chosen per folder and hits are kept only if their cwd equals the folder (conversationTreeProvider.ts:329-337).
- Recent conversations show the latest five with an age label (ChatStateManager.ts:274, 2474-2490).
- Continue in Terminal quotes the id for the shell and runs the CLI with --resume (commandSetup.ts:491-495).

**Incomplete**

- Search does not include cloud rows; it searches local threads only (ChatStateManager.ts:2649-2700 calls searchThreads on the local provider). The brief says search merges local and cloud; code differs.
- Active folder is undefined in a multi-root window with no active editor inside a folder, so terminal continue then asks to open the folder (workspaceFolders.ts:26-37; commandSetup.ts:474-480).

**Present but disconnected or switched off**

- None found.

**Not available**

- Web, Desktop, Mobile, CLI and Chrome do not have this VS Code feature as such; the CLI is the other end of the handoff.

## 4. Required behaviour

**Established requirements**

- The user can list previous sessions (local and cloud) and reopen one. (source: S73.03)
- Sessions are tied to the open workspace folder: the runtime runs in that folder and history is listed per folder. (source: S73.04)
- A session can move between VS Code and the terminal CLI. (source: S73.24)
- Local, BYOK and managed cloud are separate trust boundaries; nothing may silently route a Local chat or session to another. (source: doc: AGENTS.md section 6)
- An agent never destroys user data; chats are archived or moved to Recently deleted. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Start a chat in folder A, reload; the chat is in recent conversations for folder A and not for folder B.
2. Search for a word from an old chat; a row with a snippet appears.
3. Signed out, the cloud list shows the sign-in message.
4. 'Continue This Session in the Terminal' before any message shows the 'send a message first' note.
5. After continuing, the terminal runs the CLI with --resume for the same thread id.
6. A session id with shell characters is refused (tested in sessionHandoffCommands).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local session data lives in the CLI runtime so the terminal can resume it [inferred from the --resume handoff, commandSetup.ts:491-495].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Include cloud conversations in session search so one box finds both.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | ConversationTreeProvider | `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts` | Lists and searches threads per workspace folder. |
| service | sessionPickers | `apps/extension-vscode/src/features/trees/sessionPickers.ts` | Quick-pick history with search and archived entry. |
| store | ChatStateManager sessions | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | sessionsList, searchSessions, openSessionRow, recent conversations. |
| command | continueInTerminal | `apps/extension-vscode/src/core/commandSetup.ts` | continueThisSessionInTheTerminal (lines 466-496, 1494-1496). |
| command | continueCliSession | `apps/extension-vscode/src/core/commandSetup.ts` | Take over a CLI session (lines 546-600, 1482-1486). |
| service | LocalRuntimePool | `apps/extension-vscode/src/integrations/localRuntimePool.ts` | One runtime per workspace folder (forWorkspace). |
| service | localRuntimeClient.searchThreads | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Asks the runtime to search threads (line 1698). |
| service | workspaceFolders | `apps/extension-vscode/src/platform/workspaceFolders.ts` | Active folder, path alias, shell quoting for resume. |
| service | developerSessionHandoff | apps/extension-vscode/src/features/sidebar-webview/developerSessionHandoff.ts (not found) (not found) | Rules for taking over a CLI session. |
| service | sessionRows | apps/extension-vscode/src/features/sidebar-webview/sessionRows.ts (not found) (not found) | mergeSessionRows used by list and search. |
| integration | Account chat and code-session clients | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | listConversations and code session list for cloud rows (lines 2593-2615). |
| config | commands | `apps/extension-vscode/package.json` | Command titles (lines 192-219, 803-813). |
| test | recentConversations test | `apps/extension-vscode/src/__tests__/recentConversations.test.ts` | Recent conversations and sheet rows. |
| test | sessionHandoffCommands test | `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts` | Terminal handoff. |
| test | conversationTreeProvider test | `apps/extension-vscode/src/__tests__/conversationTreeProvider.test.ts` | Per-folder listing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the sessions sheet; webview posts a list request. | device | ChatStateManager.ts:2580-2640 |
| Host asks each folder's local runtime for threads. | device | conversationTreeProvider.ts:197-265 |
| For cloud rows, host calls the account chat and code-session APIs. | our servers | ChatStateManager.ts:2593-2615 |
| Search goes to each runtime; results merge and post back. | device | conversationTreeProvider.ts:323-350 |
| Opening a local row resumes the thread; a cloud chat is continued in the runtime or opened on the web. | device and our servers | ChatStateManager.ts:1718-1739 |
| Continue in terminal releases the runtime and runs the CLI with --resume. | device | commandSetup.ts:484-495 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Local threads | Local runtime store per folder; location unknown. | Not by this feature. | Auto-archive after configured days; Archived list and restore exist (sessionPickers.ts). |
| Unread, groups, pins | VS Code workspace state (ChatStateManager.ts:2493-2500, 2660). | No. | Per workspace. |
| Cloud conversations | AGI account service. | Yes, from our servers. | Server rules unknown. |

**Models and providers.** No model takes part in listing or search; the search is a text match done by the runtime (localRuntimeClient.ts:1698).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local rows: none found in the code that needs sign-in. Cloud rows need sign-in (ChatStateManager.ts:2580). |
| Permissions | Trusted workspace for pinning and runtime (ChatStateManager.ts:1752). |
| Subscription | None found in the code for listing. |
| Limits and metering | Cloud list limit 50 conversations (ChatStateManager.ts:2593); recent list 5; search min 2 characters in the picker (sessionPickers.ts:15). |
| Feature flags | None found. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Local sessions work with the local runtime; no cloud call is needed for them. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Quick-pick shows busy during search. | sessionPickers.ts:87-88 |
| Empty | Empty list posted; says why when listing failed rather than claiming none. | ChatStateManager.ts:2474-2485; recentConversations.test.ts |
| Error | Per-folder failure text 'sessionSearch.folderFailed'. | ChatStateManager.ts:2692-2699 |
| Signed out | Cloud list shows sign-in text. | ChatStateManager.ts:2580 |
| No provider | Search answers 'historyUnavailable'. | ChatStateManager.ts:2651-2657 |
| Partial cloud failure | Shows rows with a partial message. | ChatStateManager.ts:2603-2610 |
| Untrusted | Cloud chat continue says to trust the workspace and opens the web. | ChatStateManager.ts:1727-1738 |
| Stale search reply | Ignored if a newer search started. | sessionPickers.ts:90 |
| Offline | Cloud list shows error text; local list unaffected [inferred]. | ChatStateManager.ts:2630-2640 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/recentConversations.test.ts`: Five most recent, empty, failure and sheet rows, branch and origin.
- `apps/extension-vscode/src/__tests__/recentConversations.webview.test.ts`: Webview list.
- `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts`: Terminal resume, refusal of shell-like ids, new chat from selection, restricted folder.
- `apps/extension-vscode/src/__tests__/developerSessionHandoff.test.ts`: Taking over a CLI session.
- `apps/extension-vscode/src/__tests__/conversationTreeProvider.test.ts`: Per-folder listing.
- `apps/extension-vscode/src/__tests__/sessionPickers.test.ts`: Archived session recovery.
- `apps/extension-vscode/src/__tests__/cloudSessions.test.ts`: Cloud sessions.
- `apps/extension-vscode/src/__tests__/cloudSessionsSheet.test.ts`: Cloud sessions sheet.
- `apps/extension-vscode/src/__tests__/openConversationCommand.test.ts`: Open conversation command.
- `apps/extension-vscode/src/__tests__/workspaceFolders.test.ts`: Folder resolution.

**Test scenarios**

- **Per-folder history**
  1. Chat in repo A.
  2. Open repo B.
  3. Open recent conversations.
  - Expected: Repo A chat is not listed in B.
- **Search**
  1. Run Show Sessions History.
  2. Type a word from an old chat.
  - Expected: Row with a snippet appears.
- **Terminal handoff**
  1. Send a message.
  2. Run Continue This Session in the Terminal.
  - Expected: New terminal runs the CLI with --resume and the thread id.
- **No message yet**
  1. Open fresh chat.
  2. Run the continue command.
  - Expected: Info message to send a message first.
- **Signed out cloud**
  1. Sign out.
  2. Open cloud tab.
  - Expected: Sign-in text.
- **CLI missing**
  1. Remove the CLI.
  2. Run continue.
  - Expected: Warning with Install AGI CLI.

**Where to look when it fails**

- Per-folder listing failures surface as warnings (sessionPickers.ts reportFailures).
- describeListingFailure text in conversationTreeProvider.ts.

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **Search covers local sessions only.** Affects: VS Code users with cloud chats. Evidence: ChatStateManager.ts:2649-2700. Work needed: Add cloud search or label the box.
- **Brief says 'Sessions view in the activity bar'; no such view is contributed.** Affects: Docs and testers. Evidence: package.json:962-970. Work needed: Fix the brief and use the sheet and command.
- **Multi-root window with no active file cannot pick a folder for terminal continue.** Affects: Multi-root users. Evidence: workspaceFolders.ts:26-37; commandSetup.ts:474-480. Work needed: Ask which folder.

**Depends on**

- surface:vscode
- surface:cli
- mode:local
- mode:cloud
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- SYS-memory-projects-and-context
- SYS-agents-tools-and-automation
- F073-01

## Unknown

- Where local threads are stored on disk and how deletion works.
- Whether cloud search exists elsewhere in the account API.
- How continuing a cloud chat in the local runtime keeps the Cloud boundary visible.
- Retention of cloud chats.
