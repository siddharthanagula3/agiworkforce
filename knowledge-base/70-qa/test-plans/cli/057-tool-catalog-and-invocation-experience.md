---
id: "PLAN-cli-057"
type: "test-plan"
title: "CLI · 57. Tool catalog and invocation experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "57"
---
# CLI · 57. Tool catalog and invocation experience

29 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S57.01 Search tool.

- **Expected:** The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:896; apps/cli/src/agent/chat.rs:2764; apps/cli/src/models/streaming.rs:530; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:708
- **Where to find it:** agi, then type /search followed by a question that needs current web facts (labels found in the code)
- **Needs:** a web search key saved in the CLI (Brave or Tavily), or a model that can search the web
- **Steps:**
  1. Start agi in a terminal.
  2. Type /search and a question that needs current web facts, then press Enter.
  3. Look for a tool line for web_search that shows the query.
  4. Compare the answer and any listed sources with Expected.

## S57.02 Fetch-page tool.

- **Expected:** The assistant can call a tool that fetches a given web page and reads its content, with the fetch shown in the transcript.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:568 (quoted code not found in the file now)
- **Where to find it:** agi, then ask in chat for the content of a web page by its address (labels found in the code)
- **Needs:** a network connection
- **Steps:**
  1. Start agi.
  2. Type a request that gives a web page address and asks what the page says, then press Enter.
  3. Look for a tool line named web_fetch that shows the address.
  4. Check that the answer uses text from that page.

## S57.03 Source-reader tool.

- **Expected:** The assistant can call a tool that opens a cited source or document (PDF, Office file or page) by reference and reads its text.
- **Code:** done. Evidence present: apps/cli/src/documents.rs:134; apps/cli/src/documents.rs:189; apps/cli/src/documents.rs:62
- **Where to find it:** agi, then ask in chat to read a PDF or Office file by its path (labels found in the code)
- **Needs:** a PDF or Office file in the folder
- **Steps:**
  1. Start agi in a folder that holds a PDF, Word, PowerPoint or Excel file.
  2. Type a request that names the file and asks for part of its text, then press Enter.
  3. Look for a read_file tool line that shows the file path.
  4. Check that the answer quotes text from that file.

## S57.04 File-search tool.

- **Expected:** The assistant can call a tool that searches the user's files (by name or content) and returns matching paths or snippets.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:501
- **Where to find it:** agi, then ask in chat to find files by name or by text (labels found in the code)
- **Needs:** a folder with a few text files, one containing a known word
- **Steps:**
  1. Start agi in a folder with a few text files.
  2. Type a request to find files that contain a word you know is in one of them, then press Enter.
  3. Look for a search_files or grep_files tool line that shows the pattern.
  4. Check that the answer lists the matching paths.

## S57.05 File-read tool.

- **Expected:** The assistant can call a tool that reads the contents of a file it names (in a sandbox or on the user's machine).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:500
- **Where to find it:** agi, then ask in chat to read a named file (labels found in the code)
- **Needs:** a text file in the folder
- **Steps:**
  1. Start agi in a folder with a text file.
  2. Type a request to read that file by name, then press Enter.
  3. Look for a read_file tool line that shows the path.
  4. Check that the answer matches the file's contents.

## S57.06 File-write tool.

- **Expected:** The assistant can call a tool that creates or overwrites a file it names (in a sandbox or on the user's machine).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:1085
- **Where to find it:** agi, then ask in chat to create a file (labels found in the code)
- **Needs:** a folder agi may write to
- **Steps:**
  1. Start agi in a folder that agi may write to.
  2. Type a request to create a file named notes.txt with one line of text, then press Enter.
  3. If the Tool Approval box appears, choose Yes.
  4. Look for a write_file tool line that shows the path, then check that notes.txt exists in the folder.

## S57.10 Code-execution tool.

- **Expected:** The assistant can call a tool that runs code it wrote and returns the output in the transcript.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:1088
- **Where to find it:** agi, then ask in chat to write and run a short Python script (labels found in the code)
- **Needs:** Python installed on the machine
- **Steps:**
  1. Start agi.
  2. Type a request to write a short Python script that prints 2 plus 2 and to run it, then press Enter.
  3. If the Tool Approval box appears, choose Yes.
  4. Look for a line starting with $ and the printed result, and an exit line.

## S57.11 Shell tool.

- **Expected:** The assistant can call a tool that runs a shell command and returns its output and exit code.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:1088
- **Where to find it:** agi, then ask in chat to run a shell command (labels found in the code)
- **Needs:** a Mac or Linux shell with ls
- **Steps:**
  1. Start agi in a folder with some files.
  2. Type a request to run the command ls -la in this folder, then press Enter.
  3. If the Tool Approval box appears, choose Yes.
  4. Look for a line starting with $ ls -la, the listing, and an exit 0 line.

## S57.12 Patch/edit tool.

- **Expected:** The assistant can call a tool that edits part of an existing file (targeted replace or patch) rather than rewriting it.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:1125; apps/cli/src/features/exec/tools/mod.rs:1104; apps/cli/src/apply_patch.rs:10 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:509; apps/cli/src/tui/approval_broker.rs:470; apps/cli/src/path_security.rs:19; apps/cli/src/platform/lsp/client.rs:489; apps/cli/src/features/exec/tools/bash/mod.rs:895
- **Where to find it:** agi, then ask in chat to change one line of an existing file (labels found in the code)
- **Needs:** a text file with three lines
- **Steps:**
  1. Create a text file with three lines in the folder.
  2. Type a request to change the second line of that file to say hello, then press Enter.
  3. If the Tool Approval box appears, choose Yes.
  4. Look for the edit tool line and the changed line, and check the other lines are unchanged.

## S57.13 Browser-navigation tool.

- **Expected:** The assistant can call a tool that opens a URL in a real browser tab it controls.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1475
- **Where to find it:** agi, then type /chrome, then ask in chat to open a web page in the browser (labels found in the code)
- **Needs:** AGI Desktop with its Chrome extension paired
- **Steps:**
  1. Start agi.
  2. Type /chrome and press Enter.
  3. Look for the Chrome integration text and a Paired line.
  4. Type a request to open https://example.com in the browser, then press Enter.
  5. Look for an Open line in the transcript that shows the address.

## S57.14 Browser-action tool.

- **Expected:** The assistant can call tools that click, type or read in a real browser page it controls.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1467
- **Where to find it:** agi, then type /chrome, then ask in chat to read the page open in the browser (labels found in the code)
- **Needs:** AGI Desktop with its Chrome extension paired and a page open
- **Steps:**
  1. Start agi with the browser paired (see /chrome).
  2. Type a request to read the text of the page open in the browser, then press Enter.
  3. Look for a transcript line that says Read the active tab.
  4. Compare the answer with the text on the page.

## S57.16 Image-generation tool.

- **Expected:** The assistant can call an image-generation tool during a turn and the generated image appears in the transcript.
- **Code:** done. Evidence moved: apps/cli/src/agent/mod.rs:820 (quoted code not found in the file now); apps/cli/src/platform/runtime/tool_catalog.rs:1261; apps/cli/src/features/exec/tools/mod.rs:1124; apps/cli/src/features/exec/tools/mod.rs:1272; apps/cli/src/plans.rs:144
- **Where to find it:** agi, then type /image followed by a short description (labels found in the code)
- **Needs:** an account that can generate images
- **Steps:**
  1. Start agi.
  2. Type /image a red bicycle on a beach, then press Enter.
  3. Wait for the generation to finish; a chip appears.
  4. Type /image open to view the image.
  5. Compare the image with the prompt.

## S57.21 Memory tool.

- **Expected:** The assistant can call a memory tool to save, recall or delete a remembered fact during a turn.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/memory_tool.rs:57; apps/cli/src/features/exec/tools/memory_tool.rs:86; apps/cli/src/features/exec/tools/memory_tool.rs:121; apps/cli/src/features/exec/tools/mod.rs:1231
- **Where to find it:** agi, then type /memory (labels found in the code)
- **Steps:**
  1. Start agi.
  2. Type /memory and press Enter to see saved facts.
  3. Type /memory add local and a short test fact, then press Enter.
  4. Type /memory again and check that the new fact is listed.

## S57.22 Calendar tool.

- **Expected:** The assistant can call a calendar tool to read or create events in the user's calendar.
- **Code:** done. Evidence present: apps/cli/src/models/streaming.rs:988; apps/cli/src/models/managed_approvals.rs:139
- **Where to find it:** agi, then type /connectors (labels found in the code)
- **Needs:** a managed account with Google Calendar connected on the connectors page
- **Steps:**
  1. Start agi on a managed account.
  2. Type /connectors and press Enter.
  3. Check that the text says connectors are offered to this session's turns.
  4. Ask in chat about today's calendar events, then check for a tool line and an approval box before it runs.

## S57.23 Messaging tool.

- **Expected:** The assistant can call a messaging tool to read or send messages on a connected service (e.g. Slack) after approval.
- **Code:** done. Evidence present: apps/cli/src/models/streaming.rs:988; apps/cli/src/models/managed_approvals.rs:139
- **Where to find it:** agi, then type /connectors (labels found in the code)
- **Needs:** a managed account with Slack connected on the connectors page
- **Steps:**
  1. Start agi on a managed account.
  2. Type /connectors and press Enter.
  3. Check that the text lists the connectors offered to this session.
  4. Ask in chat to read the latest Slack message, then check for a tool line and an approval box before it runs.

## S57.24 Scheduling tool.

- **Expected:** The assistant can call a tool that creates, lists or deletes a scheduled task for the user.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:627 (quoted code not found in the file now)
- **Where to find it:** agi, then type /schedule followed by what to run and when (labels found in the code)
- **Needs:** a managed account that can use cloud schedules
- **Steps:**
  1. Start agi on an account that can use cloud schedules.
  2. Type /schedule every day at 9am summarize today's notes, then press Enter.
  3. Approve the schedule creation if asked.
  4. Look for a cron_create tool line and confirm the new schedule is listed when you ask for your schedules.

## S57.25 Agent-delegation tool.

- **Expected:** The assistant can call a tool that delegates a sub-task to another agent and uses its result.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/agent/chat.rs:2769
- **Where to find it:** agi, then type /agents (labels found in the code)
- **Needs:** at least one agent file, made with /agents create
- **Steps:**
  1. Start agi.
  2. Type /agents and press Enter; an agent picker opens.
  3. Pick an agent, or press Esc to close the picker.
  4. Ask in chat to use a named agent, then look for an agent tool line that shows its name.

## S57.26 Clarification/input tool.

- **Expected:** The assistant can call a tool that asks the user a clarifying question (with choices) and waits for the answer.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** agi, then ask in chat for a question with choices (path not confirmed in the code; trust the screen)
- **Needs:** an interactive terminal
- **Steps:**
  1. Start agi in an interactive terminal.
  2. Type a request asking the assistant to ask you which of two options you want, then press Enter.
  3. Look for a question box that shows the choices.
  4. Pick one and check that the assistant continues with that choice.

## S57.27 Approval-request tool.

- **Expected:** The assistant can call a tool that explicitly asks the user to approve a plan or decision and waits for the answer.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/task_registry/mod.rs:593
- **Where to find it:** agi, then ask in chat for approval of a plan (labels found in the code)
- **Steps:**
  1. Start agi.
  2. Type a request asking the assistant to get my approval of a plan before doing anything, then press Enter.
  3. Look for the Tool Approval box with a question.
  4. Choose Yes and check that the assistant continues; choose No and check that it stops.

## S57.28 Tool discovery.

- **Expected:** When more tools are connected than fit in a turn, the model is told which others exist and can load them on demand.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:1143
- **Where to find it:** no screen of its own. The note to the model about on-demand tools is in the system prompt and is not shown to the user.
- **Steps:**
  1. Start agi.
  2. Type /tools and press Enter.
  3. Check the line that says Tools the model can call in this session with a count.
  4. Ask a request that needs a tool not on that list and look for a tool_search line in the transcript.

## S57.29 Tool search.

- **Expected:** The model or user can search the available tools by keyword and get matching tools with their descriptions.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:1143
- **Where to find it:** agi, then ask in chat for a tool by topic (labels found in the code)
- **Steps:**
  1. Start agi.
  2. Type a request that asks the assistant to find tools about files, then press Enter.
  3. Look for a tool_search tool line in the transcript.
  4. Check that the result lists matching tool names with descriptions.

## S57.30 Tool descriptions and schemas.

- **Expected:** Each tool carries a readable description and typed parameter schema that the model uses and the user can inspect.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:1512; apps/cli/src/claude_parity.rs:183
- **Where to find it:** agi, then type /tools, then /tools <name> (labels found in the code)
- **Steps:**
  1. Start agi.
  2. Type /tools and press Enter to see the list of tools with descriptions.
  3. Type /tools read_file and press Enter.
  4. Check that the name, description, and a Parameters: section with the schema appear.

## S57.31 Tool argument preview.

- **Expected:** Each tool call in the transcript shows the arguments it was called with (command, file, query or JSON).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/tui/widgets/approval_overlay.rs:241; apps/cli/src/features/exec/tools/mod.rs:1115
- **Where to find it:** agi, then ask in chat to run a command or change a file (labels found in the code)
- **Steps:**
  1. Start agi.
  2. Type a request to run the command echo hello, then press Enter.
  3. Look at the tool line; it should show the command after a $ sign.
  4. If the Tool Approval box appears, check it shows the command before you choose Yes or No.

## S57.32 Tool-call progress.

- **Expected:** While a tool runs the transcript shows it as running (with elapsed time), then completed or failed.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:218; apps/cli/src/tui/tui_app.rs:8015
- **Where to find it:** agi, then ask in chat for any request that runs a tool (labels found in the code)
- **Steps:**
  1. Start agi.
  2. Type a request to run the command sleep 5, then press Enter.
  3. While it runs, look for a spinner on the tool line and the elapsed time in brackets.
  4. When it finishes, look for a check mark for completed or a cross for failed, and the counts with working and completed.

## S57.33 Tool result preview.

- **Expected:** A finished tool call shows a short preview of its result in the transcript.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:4890 (quoted code not found in the file now); apps/cli/src/features/exec/tools/mod.rs:1085
- **Where to find it:** agi, then ask in chat for any request that runs a tool (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Start agi in a folder with a few files.
  2. Type a request to list the files in this folder, then press Enter.
  3. Look for a short preview line under the tool line.
  4. Check that the preview shows the first non-empty line of the result, shortened if long.

## S57.34 Tool result expansion.

- **Expected:** The user can expand a tool call to see its full arguments and result, and collapse it again.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4057; apps/cli/src/tui/tui_app.rs:403
- **Where to find it:** agi (chat screen), then press Ctrl-O; the key list in "/help" shows "Show or hide full tool output" (labels found in the code)
- **Needs:** a Free account or paid account with a model that can call a shell tool
- **Steps:**
  1. Run agi and start a chat that makes a tool call (for example a shell command with several lines of output).
  2. Find the finished tool call in the transcript and note its short result preview.
  3. Press Ctrl-O. The status line shows "showing full tool output, Ctrl-O to collapse" and the output lines appear, up to 200, then "… N more lines" if longer.
  4. Press Ctrl-O again. The status line shows "tool output collapsed" and the preview returns. Compare with Expected: the call expands and collapses.

## S57.35 Tool error and retry.

- **Expected:** A failed tool call shows its error, the error goes back to the model so it can retry or explain, and the user can retry.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:1576
- **Where to find it:** agi (chat screen), then type /tools retry; the list shown by "/tools" says "/tools retry reruns the last failed call" (labels found in the code)
- **Needs:** a Free account or paid account with a model; a way to make a tool call fail
- **Steps:**
  1. Run agi and ask the assistant for a tool call that fails (for example reading a file that does not exist).
  2. Look for the failed call in the transcript; its state shows as a red failed mark with the error.
  3. Type /tools retry and press Enter. The assistant is sent a prompt to run the failed call again and report the result.
  4. If no call failed, look for the message "No failed tool call in this session to retry." Compare with Expected: the error is shown, and the retry runs.

## S57.36 Large-result references.

- **Expected:** An oversized tool result is stored in full and replaced in context by a reference the model or user can open later.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/common/mod.rs:153
- **Where to find it:** agi (chat screen): a long tool result shows a notice at its end that begins "[full output saved for the user to" and gives a file path under the config folder's tool-output directory (labels found in the code)
- **Needs:** a Free account or paid account with a model that can run a shell command; a command with large output
- **Steps:**
  1. Run agi and ask the assistant to run a shell command that prints a very large amount of text (thousands of lines).
  2. Look at the end of that tool result in the transcript for the notice that begins "[full output saved for the user to".
  3. Open the path shown in the notice (in Finder or Terminal) and check that the full output is there.
  4. Try asking the assistant to read that path with its file-read tool. Compare with Expected: the full text is stored and a reference is given; the code says the file-read tool cannot open it, so the reference is for the user only.

## S57.37 Tool receipt.

- **Expected:** After tool calls run, the user can later review a record of which tool ran, with what input, and its outcome.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:1535
- **Where to find it:** agi (chat screen), then type /tools log; then /tools log <n> for one call in full (labels found in the code)
- **Needs:** a Free account or paid account with a model; the calls must be made in the same session
- **Steps:**
  1. Run agi and make two or three tool calls in the chat (for example a shell command and a file read).
  2. Type /tools log and press Enter. A numbered list shows each call with its name, input and outcome.
  3. Type /tools log 1 (or another number) and press Enter. It shows the call's name, its input as JSON, and its result, marked "(failed)" if it failed.
  4. Compare with Expected: each call's tool, input and outcome can be reviewed afterwards.
