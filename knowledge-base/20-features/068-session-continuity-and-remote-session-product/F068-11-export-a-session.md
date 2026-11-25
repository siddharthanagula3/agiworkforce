---
id: "F068-11"
type: "feature"
title: "Export a session"
aliases: ["Export a session", "Export conversation", "/export", "agi-workforce.exportConversation", "Copy as Markdown", "Save as a Markdown file", "S68.27"]
area: "68 Session continuity and remote-session product"
available_on: ["cli", "vscode"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "partial", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S68.27"]
depends_on: ["surface:cli", "surface:vscode", "surface:web", "surface:desktop", "surface:mobile", "mode:local", "mode:own-key", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "F068-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-11 Export a session

The command line saves or prints the current coding conversation as Markdown, JSON or just the last answer. VS Code exports a developer session as Markdown by copy or save. Web, Desktop and phone have no coding-session export. Exports carry messages, model and token counts; they do not carry files, environment or branch.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.27](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6827).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Renders the open session's conversation to text and either shows it or writes a new file. Command line: '/export [markdown|json|answer] [path]'. VS Code: command 'Export Conversation' with 'Copy as Markdown' or 'Save as a Markdown file…'. [apps/cli/src/repl/registry.rs:433-481,573-624; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4070-4133]

**Why it exists.** The person can keep or share a transcript of a coding session (S68.27: 'exports a coding session (transcript and context) to a file from any client'). (doc: area brief 068)

**Who uses it.** Developers using the command line or VS Code. [inferred]

**Problems it solves**

- Keeping a record of what the agent did.
- Moving a transcript into an issue or a note.
- Handing only the last answer to someone.

**Use cases**

- '/export notes.md' to save the conversation next to the code.
- '/export json run.json' to feed another tool.
- '/export answer' to print only the last assistant answer.
- In VS Code, copy the conversation as Markdown to the clipboard.

## 2. User experience

**Where to find it**

- Command line: slash command '/export' in the full-screen interface and the plain line interface [apps/cli/src/tui/tui_app.rs:6033; apps/cli/src/repl/slash_commands.rs:186,716; command list at tui_app.rs:11379].
- VS Code: command 'agi-workforce.exportConversation' ('Code, Export Conversation'), also in the surface menu [apps/extension-vscode/src/core/commandSetup.ts:1386; apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:120].
- Web, Desktop, phone: none for coding sessions. Phone has a chat export sheet (PDF, text, Markdown, copy) for ordinary chats, not coding sessions [apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:1-40; apps/mobile/app/(app)/chat/[id].tsx].

**Before you start**

- A session with at least one non-system message; otherwise 'Nothing to export, no messages in session yet.' [apps/cli/src/repl/registry.rs:600-607].
- VS Code: an open developer session; otherwise 'open a developer session to export it.' [ChatStateManager.ts:4071-4076].

**Screens and controls**

- Command line argument forms: none (print Markdown), 'markdown' or 'md', 'json', 'answer' or 'last', a file path ('.json' picks JSON, anything else Markdown) [registry.rs:579-596].
- VS Code quick pick: 'Copy as Markdown', 'Save as a Markdown file…', then a save dialog and an 'Open' button [ChatStateManager.ts:4093-4132].

**Journey**

1. 1. Person runs '/export' (optionally with format and path).
2. 2. With a path the file is created in the workspace folder; without a path the text is shown in the terminal.
3. 3. The command line reports 'Exported the conversation to <path>.' or a warning/error.
4. 4. In VS Code the person picks copy or save and may open the saved file.

**What the person sees and gets**

- 'Exported the conversation to <path>.'; '<path> already exists, so nothing was written. Export to a new file name.'; 'Could not write <path>: <error>'; 'No answer to export yet.' [registry.rs:455-470,621].
- Markdown starts '# Conversation, <model>' then 'Tokens: <in> in / <out> out | <n> turns', then '## User' and '## Assistant' blocks with tool calls as blockquotes [apps/cli/src/conversations.rs:237-262].
- JSON holds model, exported_at, token totals, turn count and messages without the system prompt [conversations.rs:362-400].
- VS Code: 'copied the conversation as Markdown.' or 'saved the conversation to <file>.' [ChatStateManager.ts:4097-4129].

**Settings**

- None found. Export is not tied to a setting.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Command line '/export' in both interfaces with Markdown, JSON and answer-only output [registry.rs:433-624; tui_app.rs:6033-6045; slash_commands.rs:186-188].
- File writing refuses to overwrite (create_new) and writes relative to the session's workspace folder [registry.rs:440-470].
- Markdown output is cleaned of terminal control characters before display [registry.rs:611-613].
- VS Code export as Markdown by copy or save [ChatStateManager.ts:4070-4133; commandSetup.ts:1386].
- Command line tests for empty session and returning the export text [registry.rs:633-660].

**Incomplete**

- 'Context' (files, environment, branch) is not part of the output: it holds messages, model and token counts only [conversations.rs:237-262,362-400].
- Command line JSON export function is marked allow(dead_code) although the command calls it [conversations.rs:358-362].

**Present but disconnected or switched off**

- None found.

**Not available**

- Web, Desktop, phone: no coding-session export (brief: missing; a search of web features, desktop source and mobile cloud-code found none).
- Export of a computer session from the phone: none.

## 4. Required behaviour

**Established requirements**

- The user exports a coding session (transcript and context) to a file from any client. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S68.27)
- The command line export never overwrites an existing file. (source: apps/cli/src/repl/registry.rs:449-465)

**Acceptance criteria**

1. '/export' with no argument prints Markdown of the conversation.
2. '/export json out.json' writes valid JSON with model, token counts and messages and no system message.
3. '/export out.md' twice: the second run writes nothing and says the file exists.
4. '/export' on an empty session says there is nothing to export.
5. '/export answer' prints only the last assistant answer.
6. VS Code 'Save as a Markdown file…' writes a .md file and offers 'Open'.
7. No export action is offered on web, Desktop or phone for coding sessions until built.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The exported text may contain secrets the agent saw; the command line cleans terminal control characters but secret redaction was not found [inferred; not found in registry.rs or conversations.rs].
- A destructive-looking action asks first (AGENTS.md section 9); export only creates a new file, so no confirmation is needed [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a context section (branch, changed files, environment summary) to the export.
- [proposed] Add export to web and Desktop code sessions and to a computer session on the phone.
- [proposed] Offer the same formats in VS Code as the command line.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | /export (TUI) | `apps/cli/src/tui/tui_app.rs` | Slash handler (6033) and command list (11379). |
| command | /export (line REPL) | `apps/cli/src/repl/slash_commands.rs` | Handler (186) and name list (716). |
| service | export_conversation_* and render_export | `apps/cli/src/repl/registry.rs` | Argument parsing, rendering, file write with no overwrite (433-624). |
| service | export_as_markdown / export_as_json | `apps/cli/src/conversations.rs` | Builds the Markdown and JSON text (237, 362). |
| service | exportConversation (VS Code) | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Reads the thread, builds Markdown, copies or saves (4070-4133). |
| command | agi-workforce.exportConversation | `apps/extension-vscode/src/core/commandSetup.ts` | Registers the command (1386). |
| component | surface menu entry | `apps/extension-vscode/src/features/surfaces/surfaceMenu.ts` | Lists the command (line 120). |
| test | CLI export tests | `apps/cli/src/repl/registry.rs` | export_tests module: empty session, returns text, compacted session (633-700). |
| test | VS Code chatStateManager tests | `apps/extension-vscode/src/__tests__/chatStateManager.test.ts` | Calls exportConversation (line 5850) and the command wiring (6118-6131). |
| component | ConversationExportSheet (chat only) | `apps/mobile/src/features/chat/components/ConversationExportSheet.tsx` | Adjacent: phone chat export, not coding sessions. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person runs the export action. | device | apps/cli/src/tui/tui_app.rs:6033; ChatStateManager.ts:4070 |
| The app reads the session's messages from memory (command line) or from the local runtime (VS Code). | device | registry.rs:598-624; ChatStateManager.ts:4083-4091 |
| Text is rendered as Markdown, JSON or the last answer. | device | conversations.rs:237,362 |
| The text is printed, copied, or written to a new file in the workspace. | device | registry.rs:440-470; ChatStateManager.ts:4103-4129 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported transcript file (Markdown or JSON) | The path the person chose, under the session workspace (command line) or a chosen location (VS Code) | No | Kept until the person deletes it. |

**Models and providers.** None. Export makes no model call. The model name is written into the file as text.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | The command line writes inside the session's workspace folder and refuses an existing file [registry.rs:446-453]; whether paths outside the folder are refused: not traced. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Works for whatever model the session used; model name printed. |
| Provider restrictions | none found in the code. |
| Local mode | Fully local: nothing leaves the device, so it works in Local, own-key and Cloud sessions alike. [inferred from the steps above; no network call in registry.rs:433-481 or ChatStateManager.ts:4070-4133] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty session | Warning 'Nothing to export, no messages in session yet.' | registry.rs:600-607 |
| File exists | Nothing written; asks for a new name. | registry.rs:459-465 |
| Write error | Error with the reason. | registry.rs:466-469 |
| No answer yet (answer mode) | Warning 'No answer to export yet.' | registry.rs:615-622 |
| VS Code no session | Information message to open a session first. | ChatStateManager.ts:4071-4076 |
| VS Code read or save fails | Error message with the reason. | ChatStateManager.ts:4087-4090,4112-4121 |
| Person cancels the VS Code quick pick or save dialog | Nothing happens. | ChatStateManager.ts:4105,4110 |
| Offline | Not affected; export has no network step. | No network call in registry.rs:433-481 or ChatStateManager.ts:4070-4133. |
| Accessibility | Not handled in the code beyond the standard terminal and VS Code interfaces. | Looked at registry.rs:433-481 and ChatStateManager.ts:4070-4133 and found no accessibility-specific code. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/repl/registry.rs`: export_tests: reports an empty session instead of an empty export; returns the export itself so a full-screen caller can show it; a compacted session.
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: exportConversation call (line 5850) and command routing (6118-6131); details not read.

**Test scenarios**

- **Markdown to a new file**
  1. Chat with the agent for two turns.
  2. Run '/export notes.md'.
  - Expected: File notes.md holds '# Conversation, <model>', token line and User and Assistant sections.
- **No overwrite**
  1. Run '/export notes.md' again.
  - Expected: Warning that the file exists; the file is unchanged.
- **JSON**
  1. Run '/export json run.json'.
  - Expected: Valid JSON with model, exported_at, token counts, messages; no system message.
- **Empty session**
  1. Start a fresh session and run '/export'.
  - Expected: 'Nothing to export, no messages in session yet.'
- **VS Code copy and save**
  1. Run Export Conversation, choose Copy; paste.
  2. Run again, choose Save, pick a path, press Open.
  - Expected: Markdown on the clipboard; a .md file saved and opened.
- **Other apps**
  1. Look for an export action on web, Desktop and phone coding sessions.
  - Expected: None present (code search).

**Where to look when it fails**

- Command line messages 'Could not write ...' and 'Export failed: ...'.
- VS Code error toast with reason (messageActions.failed text).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **No export on web, Desktop or phone for coding sessions.** Affects: Web, Desktop, Mobile users. Evidence: area brief S68.27; no export code found in apps/web/features/code, apps/desktop/src, apps/mobile/src/features/cloud-code. Work needed: Add an export action to each code session screen.
- **Export holds messages, model and token counts, not 'context' (files, environment, branch).** Affects: All exporting clients. Evidence: apps/cli/src/conversations.rs:237-262,362-400. Work needed: Define context fields and add them.
- **Brief says VS Code export is missing; code has it (Markdown only, no JSON).** Affects: Brief accuracy; VS Code users wanting JSON. Evidence: ChatStateManager.ts:4070-4133; commandSetup.ts:1386. Work needed: Correct the brief; decide on JSON.
- **Brief cites tui_app.rs:3887 and registry.rs:375 which are unrelated code; real locations differ.** Affects: Brief accuracy. Evidence: apps/cli/src/tui/tui_app.rs:6033; apps/cli/src/repl/registry.rs:433-481. Work needed: Fix the brief's code references.
- **No secret redaction found in the exported text.** Affects: Command line and VS Code users who share exports. Evidence: Not found in registry.rs or conversations.rs (absence). Work needed: Check and add redaction or a warning.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:cli
- surface:vscode
- surface:web
- surface:desktop
- surface:mobile
- mode:local
- mode:own-key
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- F068-07

## Unknown

- Whether export paths outside the workspace folder are refused.
- Whether any secret redaction applies to exported text.
- Whether Desktop has any export of a coding session outside the files searched.
- VS Code export contents beyond the helper conversationMarkdown (not opened).
- Why export_as_json carries allow(dead_code).
