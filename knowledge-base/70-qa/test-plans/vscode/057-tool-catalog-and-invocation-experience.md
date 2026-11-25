---
id: "PLAN-vscode-057"
type: "test-plan"
title: "VS Code · 57. Tool catalog and invocation experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "57"
---
# VS Code · 57. Tool catalog and invocation experience

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S57.01 Search tool.

- **Expected:** The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1217
- **Where to find it:** AGI Code sidebar > + button (title "Attach or use tools") > Browse the web (labels found in the code)
- **Needs:** a web search key for Local or BYOK (the menu shows Set up web search when one is needed)
- **Steps:**
  1. Click the + button in the chat box and choose Browse the web (it turns on).
  2. Type a question that needs current web information and send it.
  3. Watch the transcript for a web search tool row with its own label and summary.
  4. Click the row to expand it, then look for an "N sources" line under the answer and check the sources are listed.

## S57.02 Fetch-page tool.

- **Expected:** The assistant can call a tool that fetches a given web page and reads its content, with the fetch shown in the transcript.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:568 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Choose Tools for This Session > Web pages (labels found in the code)
- **Needs:** a web connection and the Web pages tool ticked
- **Steps:**
  1. Run Code: Choose Tools for This Session from the Command Palette.
  2. Make sure Web pages (Read a page by its URL) is ticked and press Enter.
  3. In the chat box, paste a web page address and ask the assistant to read it and summarise it.
  4. Expand the new tool row in the transcript and check its request shows the address and its response shows the page text.

## S57.03 Source-reader tool.

- **Expected:** The assistant can call a tool that opens a cited source or document (PDF, Office file or page) by reference and reads its text.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/file_ops/mod.rs:684; apps/cli/src/documents.rs:115; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1476
- **Where to find it:** AGI Code sidebar > chat box: ask the assistant to read a PDF or Office file in the workspace (labels found in the code)
- **Needs:** a PDF or Office file in the open folder
- **Steps:**
  1. Open a folder that contains a PDF or Word file.
  2. In the chat box, ask the assistant to read that file and quote a sentence from it.
  3. Expand the file tool row in the transcript.
  4. Check the Snippet section shows text from the document.

## S57.04 File-search tool.

- **Expected:** The assistant can call a tool that searches the user's files (by name or content) and returns matching paths or snippets.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:501
- **Where to find it:** AGI Code sidebar > chat box: ask the assistant to find a phrase in the project (labels found in the code)
- **Needs:** a project folder with files containing a known phrase
- **Steps:**
  1. Open a project folder.
  2. In the chat box, ask the assistant to find where a given phrase or file name appears in the project.
  3. Expand the search tool row in the transcript.
  4. Check the request shows the search text and the response lists matching paths or lines.

## S57.05 File-read tool.

- **Expected:** The assistant can call a tool that reads the contents of a file it names (in a sandbox or on the user's machine).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:500
- **Where to find it:** AGI Code sidebar > chat box: ask the assistant to read a named file (labels found in the code)
- **Needs:** a text file in the open folder
- **Steps:**
  1. Open a folder that contains a text file.
  2. In the chat box, ask the assistant to read that file by name and tell you one line from it.
  3. Expand the file tool row in the transcript.
  4. Check the File section shows the path and the Snippet section shows the file text.

## S57.06 File-write tool.

- **Expected:** The assistant can call a tool that creates or overwrites a file it names (in a sandbox or on the user's machine).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:1085
- **Where to find it:** AGI Code sidebar > chat box: ask the assistant to create a new file (labels found in the code)
- **Needs:** a folder open in VS Code and an approval if asked
- **Steps:**
  1. Open a folder in VS Code.
  2. In the chat box, ask the assistant to create a new file with a given name and one line of text.
  3. Approve the request if the assistant asks for permission.
  4. Expand the file tool row and check the Wrote section shows the file path, and that the file exists in the folder.

## S57.10 Code-execution tool.

- **Expected:** The assistant can call a tool that runs code it wrote and returns the output in the transcript.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:1088
- **Where to find it:** not found in the code. No dedicated code-execution tool was found in the tool catalog (apps/cli/src/platform/runtime/tool_catalog.rs). The nearest is the shell tool (Shell commands), which can run a script the assistant wrote. Searched the extension and CLI for a code-run tool name.

## S57.11 Shell tool.

- **Expected:** The assistant can call a tool that runs a shell command and returns its output and exit code.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:1088
- **Where to find it:** Command Palette > Code: Choose Tools for This Session > Shell commands, then AGI Code sidebar > chat box (labels found in the code)
- **Needs:** a shell available on the machine and the Shell commands tool ticked
- **Steps:**
  1. Run Code: Choose Tools for This Session and make sure Shell commands is ticked.
  2. In the chat box, ask the assistant to run a harmless command such as node --version.
  3. Expand the command tool row.
  4. Check the Command section shows the command with a $ prefix, and the Output section shows the result with an exit code.

## S57.12 Patch/edit tool.

- **Expected:** The assistant can call a tool that edits part of an existing file (targeted replace or patch) rather than rewriting it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:1125
- **Where to find it:** Command Palette > Code: Choose Tools for This Session > File edits, then AGI Code sidebar > chat box (labels found in the code)
- **Needs:** an existing file in the open folder
- **Steps:**
  1. Make sure File edits is ticked in Code: Choose Tools for This Session.
  2. In the chat box, ask the assistant to change one line in an existing file and leave the rest alone.
  3. Expand the edit tool row and click Open diff.
  4. Check the diff changes only the requested line and the row shows a diff summary.

## S57.13 Browser-navigation tool.

- **Expected:** The assistant can call a tool that opens a URL in a real browser tab it controls.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Choose Tools for This Session > Browser, then AGI Code sidebar > chat box (labels found in the code)
- **Needs:** a paired browser; the pairing steps were not found in the extension code
- **Steps:**
  1. Make sure Browser is ticked in Code: Choose Tools for This Session.
  2. In the chat box, ask the assistant to open a web address in the browser.
  3. Expand the browser tool row to see the address it used.
  4. Check that a real browser tab opened at that address.

## S57.14 Browser-action tool.

- **Expected:** The assistant can call tools that click, type or read in a real browser page it controls.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Choose Tools for This Session > Browser, then AGI Code sidebar > chat box (labels found in the code)
- **Needs:** a paired browser with a page open; the pairing steps were not found in the extension code
- **Steps:**
  1. Make sure Browser is ticked in Code: Choose Tools for This Session.
  2. With a page open in the paired browser, ask the assistant to read the page and then click or type in it.
  3. Expand each browser tool row in the transcript.
  4. Check the page in the browser changed as the row describes.

## S57.21 Memory tool.

- **Expected:** The assistant can call a memory tool to save, recall or delete a remembered fact during a turn.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:826
- **Where to find it:** AGI Code sidebar > chat box: ask the assistant to remember a fact; Command Palette > Code: Memory to check it (labels found in the code)
- **Steps:**
  1. In the chat box, ask the assistant to remember a fact, such as a preferred test framework.
  2. Approve the save if the assistant asks first.
  3. Run Code: Memory from the Command Palette and check the fact is listed.
  4. In a new chat, ask the assistant what it remembers and check the memory tool row appears with the fact.

## S57.22 Calendar tool.

- **Expected:** The assistant can call a calendar tool to read or create events in the user's calendar.
- **Code:** done. Evidence present: apps/cli/src/models/managed_approvals.rs:132; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6606
- **Where to find it:** not found in the code. No calendar tool was found in the extension or the CLI tool catalog. Calendar appears only as a connector event source for scheduled triggers (apps/cli/src/schedules/triggers.rs) and in the generic connector approval text (apps/cli/src/models/managed_approvals.rs).

## S57.23 Messaging tool.

- **Expected:** The assistant can call a messaging tool to read or send messages on a connected service (e.g. Slack) after approval.
- **Code:** done. Evidence present: apps/cli/src/models/managed_approvals.rs:132; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6606
- **Where to find it:** not found in the code. No Slack messaging tool was found. send_message in the CLI catalog is for agent-team teammates, not a connected service. Slack appears only as a schedule trigger source (apps/cli/src/schedules/triggers.rs) and the generic connector approval text.

## S57.24 Scheduling tool.

- **Expected:** The assistant can call a tool that creates, lists or deletes a scheduled task for the user.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:627 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Show Schedules; or AGI Code sidebar > chat box: ask the assistant to schedule a task (labels found in the code)
- **Needs:** a signed-in AGI account (scheduled work runs in the AGI cloud and cannot be local-only)
- **Steps:**
  1. Run Code: Show Schedules from the Command Palette and note the list.
  2. In the chat box, ask the assistant to schedule a short task every day at nine.
  3. Run Code: Show Schedules again and check the new schedule is listed.
  4. Use Code: Pause Schedule or Code: Run Schedule Now on it and check its state changes.

## S57.25 Agent-delegation tool.

- **Expected:** The assistant can call a tool that delegates a sub-task to another agent and uses its result.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/agent/chat.rs:2769
- **Where to find it:** AGI Code sidebar > chat box: ask for a sub-task to be handed to a subagent (labels found in the code)
- **Steps:**
  1. In the chat box, ask the assistant to hand one sub-task, such as summarising a file, to a subagent and use its answer.
  2. Watch the Subagents panel appear above the transcript and its count change.
  3. Open the subagent transcript if the panel offers it.
  4. Check the main answer uses the subagent result.

## S57.26 Clarification/input tool.

- **Expected:** The assistant can call a tool that asks the user a clarifying question (with choices) and waits for the answer.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7262; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1849; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1098
- **Where to find it:** AGI Code sidebar > chat box: ask a request that needs a choice first (labels found in the code)
- **Steps:**
  1. In the chat box, ask the assistant to pick a setting for you, and to ask you before it starts.
  2. Check an AGI asks card appears with the question and choice buttons.
  3. Click one choice button.
  4. Check the card closes and the assistant continues with your choice.

## S57.28 Tool discovery.

- **Expected:** When more tools are connected than fit in a turn, the model is told which others exist and can load them on demand.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:1143
- **Where to find it:** no screen of its own. The effect shows only as a tool search row in the transcript, whose label is built from the tool name. Tool discovery is in apps/cli/src/features/exec/tools/mod.rs.
- **Needs:** several tools available to the session
- **Steps:**
  1. Connect more tools than fit in one turn, for example by ticking many groups in Code: Choose Tools for This Session.
  2. Ask a task that needs a tool outside the first set.
  3. Check a tool search row appears in the transcript when the assistant loads that tool.

## S57.29 Tool search.

- **Expected:** The model or user can search the available tools by keyword and get matching tools with their descriptions.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/mod.rs:1143
- **Where to find it:** Command Palette > Code: Choose Tools for This Session, then type a word in the list (labels found in the code)
- **Steps:**
  1. Run Code: Choose Tools for This Session from the Command Palette.
  2. Type a word such as browser or web into the list.
  3. Check only the matching tool groups stay in the list and each shows its description.
  4. Press Escape to close without changing anything.

## S57.31 Tool argument preview.

- **Expected:** Each tool call in the transcript shows the arguments it was called with (command, file, query or JSON).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:9082; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6693
- **Where to find it:** AGI Code sidebar > chat box: ask for a shell command, then click its tool row (labels found in the code)
- **Needs:** a folder open in VS Code
- **Steps:**
  1. In the chat box, ask the assistant to run a shell command such as ls.
  2. Wait for the tool row to appear in the transcript.
  3. Click the tool row to open it.
  4. Check the Command section shows the command with a $ prefix, or the Request section shows the arguments for other tools.

## S57.32 Tool-call progress.

- **Expected:** While a tool runs the transcript shows it as running (with elapsed time), then completed or failed.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7968; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6693
- **Where to find it:** AGI Code sidebar > chat box: ask for a shell command that takes a few seconds; watch the activity line above the tool rows (labels found in the code)
- **Needs:** a folder open in VS Code
- **Steps:**
  1. In the chat box, ask the assistant to run a command that waits about 10 seconds, such as sleep 10.
  2. While it runs, check the tool row shows a spinning icon and the activity line counts the action.
  3. When it ends, check the row changes to done, or to an error state.
  4. Check the row summary ends with an elapsed time.

## S57.33 Tool result preview.

- **Expected:** A finished tool call shows a short preview of its result in the transcript.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7961; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6693
- **Where to find it:** AGI Code sidebar > chat box: ask for a shell command, then look at the finished tool row (labels found in the code)
- **Needs:** a folder open in VS Code
- **Steps:**
  1. In the chat box, ask the assistant to run a short command such as echo hello.
  2. When the row finishes, look at the row without clicking it.
  3. Click the row and check the Output section shows the result text.
  4. Compare the shown text with the command output.

## S57.34 Tool result expansion.

- **Expected:** The user can expand a tool call to see its full arguments and result, and collapse it again.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:9187; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6693
- **Where to find it:** AGI Code sidebar > chat box: click any finished tool row (labels found in the code)
- **Needs:** a folder open in VS Code
- **Steps:**
  1. Ask the assistant to run a shell command and wait for its row to finish.
  2. Click the row once and check the Command and Output sections appear.
  3. Click the row again and check it collapses.
  4. Compare what is shown with the request and result.

## S57.36 Large-result references.

- **Expected:** An oversized tool result is stored in full and replaced in context by a reference the model or user can open later.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6682; apps/cli/src/features/exec/tools/common/mod.rs:153
- **Where to find it:** AGI Code sidebar > chat box: ask for a command with a very long output, then expand its row (labels found in the code)
- **Needs:** a folder open in VS Code and an approval if asked
- **Steps:**
  1. In the chat box, ask the assistant to run a command with a very long output, such as seq 1 200000.
  2. Approve the command if asked.
  3. Expand the finished tool row and scroll to the end of the Output section.
  4. Check the text says the full output was saved and gives a file path to open.

## S57.37 Tool receipt.

- **Expected:** After tool calls run, the user can later review a record of which tool ran, with what input, and its outcome.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:60; apps/extension-vscode/src/extension.ts:254; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3824
- **Where to find it:** Command Palette > Code: Show Session Activity (labels found in the code)
- **Needs:** a chat session that has run tools
- **Steps:**
  1. Use an AGI Code chat that ran at least one tool.
  2. Run Code: Show Session Activity from the Command Palette.
  3. Read the list: Details, then Files changed, then Approvals.
  4. Check each file change and approval matches what the tools did in the chat.
