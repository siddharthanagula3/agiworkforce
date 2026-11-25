---
id: "PLAN-chrome-057"
type: "test-plan"
title: "Chrome · 57. Tool catalog and invocation experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "57"
---
# Chrome · 57. Tool catalog and invocation experience

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S57.01 Search tool.

- **Expected:** The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:537 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:866; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:983
- **Where to find it:** Chat > send a question that needs current web information > under the answer, click "Worked for …" > look for "Sources for …" and the "… sources" button (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account; whether a search runs depends on the model and account
- **Steps:**
  1. Open the side panel and send a question that needs current web information, such as today's news on a topic.
  2. When the answer appears, click the "Worked for …" line under it to open the steps.
  3. Look for a "Sources for …" step and check that it names the search query.
  4. Click the "… sources" button and compare the list under "Sources used for this answer" with Expected.

## S57.02 Fetch-page tool.

- **Expected:** The assistant can call a tool that fetches a given web page and reads its content, with the fetch shown in the transcript.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:537 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:989; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2734
- **Where to find it:** Chat > ask it to read a specific web page by its link > under the answer, click "Worked for …" > look at the step for that page (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a message that gives a full web page address and asks the assistant to read it and summarise it.
  2. When the answer appears, click the "Worked for …" line under it.
  3. Find the step about that page and click it to open the details.
  4. Compare the step with Expected: the fetch should appear with the page it read.

## S57.03 Source-reader tool.

- **Expected:** The assistant can call a tool that opens a cited source or document (PDF, Office file or page) by reference and reads its text.
- **Code:** partial. Evidence present: apps/web/lib/url-fetch/url-fetch-tool.ts:501
- **Known to be unfinished:** Same as web: url_fetch reads PDF and Office files by URL (d67ced36f), but the served tool description is still v1 until tool.url_fetch_description@2 advances to stable; uploaded files and connector sources are still not opened by reference.
- **Where to find it:** not found in the code. Searched apps/extension for source or document reader labels and found none. Only the server reads PDF and Office files by URL; no extension control was found. The "Add a web page by link" menu item is a different feature.

## S57.04 File-search tool.

- **Expected:** The assistant can call a tool that searches the user's files (by name or content) and returns matching paths or snippets.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1111; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1154
- **Where to find it:** not found in the code. Searched apps/extension for file search labels and found none. The file search runs on the server with no extension control found.

## S57.05 File-read tool.

- **Expected:** The assistant can call a tool that reads the contents of a file it names (in a sandbox or on the user's machine).
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1013; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802
- **Known to be unfinished:** The chat sandbox read_file tool runs only when AGI_E2B_EXECUTION=1 (default 0) with an E2B key and compute price set; until then the loop answers "not available".
- **Where to find it:** not found in the code. The sandbox file-read tool runs only when AGI_E2B_EXECUTION=1, which defaults to 0. No extension control for it was found.

## S57.06 File-write tool.

- **Expected:** The assistant can call a tool that creates or overwrites a file it names (in a sandbox or on the user's machine).
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1013; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802
- **Known to be unfinished:** The chat sandbox write_file tool runs only when AGI_E2B_EXECUTION=1 (default 0) with an E2B key and compute price set; until then the loop answers "not available".
- **Where to find it:** not found in the code. The sandbox file-write tool runs only when AGI_E2B_EXECUTION=1, which defaults to 0. No extension control for it was found; file outputs show as artifacts (see S57.07).

## S57.07 Spreadsheet tool.

- **Expected:** The assistant can call a tool that creates a spreadsheet file (xlsx) the user can open or download.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:891; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:997; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for an Excel spreadsheet > under the answer, click "Worked for …" > click "Open or download …" (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account; file creation depends on the account and server
- **Steps:**
  1. Send a request such as "Make an Excel spreadsheet of these five items with prices."
  2. When the answer appears, click the "Worked for …" line under it.
  3. Look for the step "Created …" and click its "Open or download …" link.
  4. Check that the .xlsx file opens or downloads, and compare with Expected.

## S57.08 Document tool.

- **Expected:** The assistant can call a tool that creates a document file (docx) the user can open or download.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:891; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:997; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a Word document > under the answer, click "Worked for …" > click "Open or download …" (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account; file creation depends on the account and server
- **Steps:**
  1. Send a request such as "Write a one-page Word document about this plan."
  2. When the answer appears, click the "Worked for …" line under it.
  3. Look for the step "Created …" and click its "Open or download …" link.
  4. Check that the .docx file opens or downloads, and compare with Expected.

## S57.09 Presentation tool.

- **Expected:** The assistant can call a tool that creates a presentation file (pptx) the user can open or download.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:891; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:997; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a slide presentation > under the answer, click "Worked for …" > click "Open or download …" (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account; file creation depends on the account and server
- **Steps:**
  1. Send a request such as "Make a five-slide presentation about this plan."
  2. When the answer appears, click the "Worked for …" line under it.
  3. Look for the step "Created …" and click its "Open or download …" link.
  4. Check that the .pptx file opens or downloads, and compare with Expected.

## S57.10 Code-execution tool.

- **Expected:** The assistant can call a tool that runs code it wrote and returns the output in the transcript.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/freeTrialClient.ts:879; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1799; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:876; apps/extension/src/side_panel.ts:16030; apps/extension/src/features/side-panel/bubbles.ts:660
- **Where to find it:** Chat > ask it to run a short piece of code and print a result > under the answer, look for the "Code execution" block and open it (path not confirmed in the code; trust the screen)
- **Needs:** a model and account that can run code; check the model picker's "Code execution" filter
- **Steps:**
  1. Send a message such as "Run this Python code and show the output: print(2 + 2)".
  2. Wait for the "Running code…" line to change.
  3. Open the "Code execution" block under the answer.
  4. Compare the "Output" text with the result the code should print, as Expected says.

## S57.12 Patch/edit tool.

- **Expected:** The assistant can call a tool that edits part of an existing file (targeted replace or patch) rather than rewriting it.
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1013; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802
- **Known to be unfinished:** The chat sandbox edit_file tool runs only when AGI_E2B_EXECUTION=1 (default 0) with an E2B key and compute price set; until then the loop answers "not available".
- **Where to find it:** not found in the code. The sandbox edit tool runs only when AGI_E2B_EXECUTION=1, which defaults to 0. No extension control for targeted file edits was found.

## S57.13 Browser-navigation tool.

- **Expected:** The assistant can call a tool that opens a URL in a real browser tab it controls.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:891; apps/extension/src/features/computer-use/agentLoop.ts:871; apps/extension/src/features/computer-use/agentLoop.ts:1037
- **Where to find it:** Chat > ask it to open a website in the browser > on the card "AGI wants to start a browser task", click "Start task" (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account allowed to run browser tasks, and a website to open
- **Steps:**
  1. Send a message such as "Open example.com in the browser."
  2. When the card "AGI wants to start a browser task" appears, click "Start task" (choose "Allow for this task" first if the site asks).
  3. Watch the step "Opening …" in the answer's steps.
  4. Check that a real browser tab opens to the site, and compare with Expected.

## S57.14 Browser-action tool.

- **Expected:** The assistant can call tools that click, type or read in a real browser page it controls.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:891; apps/extension/src/features/computer-use/agentLoop.ts:523; apps/extension/src/features/computer-use/agentLoop.ts:743
- **Where to find it:** Chat > start a browser task (as in S57.13) > watch the action steps on the page (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account allowed to run browser tasks, and a website with a form or links
- **Steps:**
  1. Send a task such as "Search this site for pricing and tell me the price." and click "Start task" on the card.
  2. Watch the steps shown in the answer, such as "Clicking", "Typing" and "Scrolling".
  3. Check that the page itself is clicked, typed in and scrolled.
  4. Compare with Expected: each action should appear as a step with its result.

## S57.21 Memory tool.

- **Expected:** The assistant can call a memory tool to save, recall or delete a remembered fact during a turn.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1111; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1123
- **Where to find it:** More > Memory (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Click "More" in the side panel and click "Memory".
  2. Type a fact into the box, click "Add", and check that it appears in the list.
  3. In a chat, ask AGI to forget that fact and check that the notice asks you to choose "Forget" or "Keep".
  4. Click "Forget" and reopen "Memory" to confirm the fact is gone.

## S57.22 Calendar tool.

- **Expected:** The assistant can call a calendar tool to read or create events in the user's calendar.
- **Code:** partial. Evidence none: the ledger gives no code location
- **Known to be unfinished:** Lane ruling (R-t clarification): an MCP endpoint that exists only through CONNECTOR_OAUTH_PROVIDERS_JSON is a feature gate, so the cell is partial/flag-off, not unverified. google-calendar, outlook and calendly are mcpConnector catalog entries (catalog.ts 154/164/174) with no MCP_ENDPOINTS record (0 hits), so getMcpEndpoint returns null (177-179) until the operator JSON supplies one. miss: flag-off. remaining: 'Calendar connectors ship no MCP endpoint; supply one in CONNECTOR_OAUTH_PROVIDERS_JSON (Codex queue: confirm the production env).'
- **Needs:** production-state
- **Where to find it:** not found in the code. Calendar connectors have no MCP endpoint set, so the tool is off. No calendar control was found in apps/extension; the Connectors item only opens the web page.
- **Needs:** production-state

## S57.23 Messaging tool.

- **Expected:** The assistant can call a messaging tool to read or send messages on a connected service (e.g. Slack) after approval.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:537 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:165; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Add attachment (+) > Connectors, then approve the request in the chat (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account with a messaging connector (for example Slack) connected
- **Steps:**
  1. Click the "Add attachment" (+) button and click "Connectors"; connect a messaging service on the web page that opens.
  2. Back in the chat, ask AGI to read or send a message on that service.
  3. When the approval card appears with "Approve" and "Decline", read it first.
  4. Click "Approve" and compare: the message should be read or sent only after approval.

## S57.24 Scheduling tool.

- **Expected:** The assistant can call a tool that creates, lists or deletes a scheduled task for the user.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1111; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1198
- **Where to find it:** More > Shortcuts > Schedules (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. In a chat, ask AGI to create a scheduled task, for example "Every weekday at 9am, summarise my notes."
  2. Click "More" and click "Shortcuts" to open the settings page.
  3. Find the "Schedules" section and check the new schedule appears with a "Next …" time.
  4. Click "More" > "Tasks" to see runs, and compare with Expected.

## S57.26 Clarification/input tool.

- **Expected:** The assistant can call a tool that asks the user a clarifying question (with choices) and waits for the answer.
- **Code:** done. Evidence moved: apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1182 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1279; apps/extension/src/features/side-panel/bubbles.ts:245; apps/extension/src/features/side-panel/interactiveCards.ts:394; apps/extension/src/side_panel.ts:5813; apps/extension/src/side_panel.ts:5850
- **Where to find it:** Chat > ask AGI to ask you questions before it answers > answer on the card and click "Send answers" (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Send a message that needs choices first, such as "Ask me questions before you plan a trip."
  2. When the question card appears, pick an option for each question.
  3. Click "Send answers" (or "I'll just type it" to answer in your own words).
  4. Check that the answer continues using your choices, and compare with Expected.

## S57.28 Tool discovery.

- **Expected:** When more tools are connected than fit in a turn, the model is told which others exist and can load them on demand.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:537 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3938; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:173
- **Where to find it:** no screen of its own. The server tells the model which other tools exist and loads them on demand; no extension screen shows this.

## S57.29 Tool search.

- **Expected:** The model or user can search the available tools by keyword and get matching tools with their descriptions.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3343 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:173; apps/extension/src/features/side-panel/bubbles.ts:1062
- **Where to find it:** not found in the code. Searched apps/extension for tool search and tool discovery labels. Only WebMCP page-tool discovery in src/content.ts was found, which is a different feature.

## S57.30 Tool descriptions and schemas.

- **Expected:** Each tool carries a readable description and typed parameter schema that the model uses and the user can inspect.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14829; apps/web/app/connectors/page.tsx:23; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:270
- **Where to find it:** Add attachment (+) > Connectors, then open a connector on the AGI web page and read its tools (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Click the "Add attachment" (+) button and click "Connectors"; a web tab opens.
  2. Open a connector in the list on that page.
  3. Look at its tool list: each tool should show a readable description and its parameters.
  4. Compare with Expected.

## S57.31 Tool argument preview.

- **Expected:** Each tool call in the transcript shows the arguments it was called with (command, file, query or JSON).
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:537 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Chat > ask a question that uses a tool > under the answer, click "Worked for …" > click a tool step (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a question that makes AGI use a tool, such as a web search.
  2. When the answer appears, click the "Worked for …" line under it.
  3. Click a tool step to open its details.
  4. Look for the "Request" heading and check the arguments shown (for example the search query).

## S57.32 Tool-call progress.

- **Expected:** While a tool runs the transcript shows it as running (with elapsed time), then completed or failed.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:1087; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Chat > ask a question that uses a tool > watch the "Working for …" line while it runs (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a question that makes AGI use a tool.
  2. While it runs, look at the "Working for …" line and the step's spinning icon with its elapsed time.
  3. When it ends, check the line changes to "Worked for …" and the step is marked done.
  4. If a step fails, check the line says "Failed after …" and compare with Expected.

## S57.33 Tool result preview.

- **Expected:** A finished tool call shows a short preview of its result in the transcript.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:538 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Chat > ask a question that uses a tool > under the answer, click "Worked for …" and read the step line (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a question that makes AGI use a tool.
  2. When the answer appears, click the "Worked for …" line under it.
  3. Read the short text on each finished tool step row.
  4. Click that row and check the "Result" heading shows the result, as Expected says.

## S57.34 Tool result expansion.

- **Expected:** The user can expand a tool call to see its full arguments and result, and collapse it again.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:1086; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Chat > ask a question that uses a tool > under the answer, click "Worked for …" > click a tool step row (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a question that makes AGI use a tool, then click the "Worked for …" line under the answer.
  2. Click a finished tool step row to expand it and check the "Request" and "Result" headings.
  3. Click the same row again to collapse it.
  4. Compare the expanded and collapsed states with Expected.

## S57.36 Large-result references.

- **Expected:** An oversized tool result is stored in full and replaced in context by a reference the model or user can open later.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:852; apps/extension/src/features/side-panel/bubbles.ts:1065; apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:44 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:339
- **Where to find it:** not found in the code. Code found: the result is kept in apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts and the reader is the model-facing tool read_tool_result (tool-result-store.ts:12). Its reference appears in the model's context notice, and the extension (apps/extension/src/features/side-panel/bubbles.ts:1065) has no control or wording for reading a stored result. Its only visible name is 'Read a stored tool result' in apps/web/lib/tool-copy.ts, which is web-only. The extension shows the output it receives, but the trimming happens server-side, so the user cannot see the stored reference. Searched apps/extension for read_tool_result, tool-result, reference, and the stored-result wording: none found.
- **Needs:** a chat where the assistant ran a tool with a long result

## S57.37 Tool receipt.

- **Expected:** After tool calls run, the user can later review a record of which tool ran, with what input, and its outcome.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:1062; apps/extension/src/features/side-panel/bubbles.ts:935 (quoted code not found in the file now); apps/extension/src/side_panel.ts:14829; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:377
- **Where to find it:** Side panel chat > the assistant's tool step (its summary row) > tap the row to expand it > read the 'Request' and 'Result' headings (labels found in the code)
- **Needs:** a chat where the assistant has run at least one tool
- **Steps:**
  1. Sign in and open the side panel, then start a chat that makes the assistant use a tool, for example ask it to open a web page.
  2. Wait until the tool step has finished and shows as completed.
  3. Tap the tool step's row to expand it.
  4. Look under the 'Request' heading for the input the tool received and under the 'Result' heading for what it returned, and compare with Expected: which tool ran, its input, and its outcome.
