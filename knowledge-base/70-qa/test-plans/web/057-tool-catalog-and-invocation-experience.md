---
id: "PLAN-web-057"
type: "test-plan"
title: "Web · 57. Tool catalog and invocation experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "57"
---
# Web · 57. Tool catalog and invocation experience

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S57.01 Search tool.

- **Expected:** The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3409; apps/web/lib/hooks/useChatStream.ts:3511 (quoted code not found in the file now); apps/web/lib/web-search/web-search-tool.ts:61; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2767; apps/web/features/chat/components/messages/ToolTimeline.tsx:490
- **Where to find it:** Chat screen > message box > type /search latest AI news > Send. The web search also runs on its own when the model decides it needs current information. (labels found in the code)
- **Steps:**
  1. On the chat screen, click the message box and type /search latest AI news.
  2. Press Send.
  3. Watch the reply: a tool row shows 'Search the web' or 'Searched the web' and a 'Web search' card lists the results.
  4. Click the 'Used tools' row to expand it and check that the searches and their sources are listed.

## S57.02 Fetch-page tool.

- **Expected:** The assistant can call a tool that fetches a given web page and reads its content, with the fetch shown in the transcript.
- **Code:** done. Evidence present: apps/web/lib/url-fetch/url-fetch-tool.ts:60; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2734; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:989; apps/web/features/chat/components/messages/ToolTimeline.tsx:490
- **Where to find it:** Chat screen > message box > paste a page address (https://...) and ask 'read this page and tell me what it says' > Send. (labels found in the code)
- **Steps:**
  1. Click the message box and paste a full page address such as https://example.com.
  2. Type: read this page and tell me what it says.
  3. Press Send.
  4. Look for a tool row that reads 'Fetching' followed by the host name, then check that the reply uses the page's content.

## S57.03 Source-reader tool.

- **Expected:** The assistant can call a tool that opens a cited source or document (PDF, Office file or page) by reference and reads its text.
- **Code:** partial. Evidence present: apps/web/lib/prompts/prompt-manifest.ts:147; packages/ai/model-registry/catalog/routing-policies.json:161
- **Known to be unfinished:** switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval quality signal (packages/ai/model-registry/catalog/routing-policies.json:161)
- **Where to find it:** not found in the code. The plan says this is unfinished (switch-on of the url-fetch description in routing-policies.json is pending) and I found no user control for opening a cited PDF, Office file or page by reference; searched apps/web for the fetch tool name and the source-reader wording and found only the fetch tool.

## S57.04 File-search tool.

- **Expected:** The assistant can call a tool that searches the user's files (by name or content) and returns matching paths or snippets.
- **Code:** done. Evidence present: apps/web/lib/server/tools/file-search-tool.ts:417; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1154; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2505
- **Where to find it:** Chat screen > + (Add attachments and tools) > Add photos & files > attach two or more files > message box: ask which file mentions a word > Send. (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Click + and choose Add photos & files, then attach two or more files.
  2. Type a question such as: which of these files mentions invoices?
  3. Press Send.
  4. Look for a tool row for the file search and check that the reply names matching files or shows snippets.

## S57.05 File-read tool.

- **Expected:** The assistant can call a tool that reads the contents of a file it names (in a sandbox or on the user's machine).
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. The plan says the sandbox file-read tool is switched off until AGI_E2B_EXECUTION and E2B_API_KEY are set in production; I found the gate in apps/web/lib/e2b/gate.ts but no user control that reads a named file.

## S57.06 File-write tool.

- **Expected:** The assistant can call a tool that creates or overwrites a file it names (in a sandbox or on the user's machine).
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. The plan says the sandbox file-write tool is switched off until AGI_E2B_EXECUTION and E2B_API_KEY are set in production; I found the gate in apps/web/lib/e2b/gate.ts but no user control that writes a named file.

## S57.07 Spreadsheet tool.

- **Expected:** The assistant can call a tool that creates a spreadsheet file (xlsx) the user can open or download.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639 (quoted code not found in the file now); apps/web/lib/hooks/useChatStream.ts:4641; apps/web/lib/services/managed-office-file-service.ts:151; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat screen > + (Add attachments and tools) > Output > Spreadsheet, then ask for a spreadsheet and press Send. (labels found in the code)
- **Steps:**
  1. Click + and open the Output group.
  2. Click Spreadsheet so it is checked.
  3. Type: make a spreadsheet of three months of expenses.
  4. Press Send and look for a file card for an .xlsx file with a download or open control.

## S57.08 Document tool.

- **Expected:** The assistant can call a tool that creates a document file (docx) the user can open or download.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639 (quoted code not found in the file now); apps/web/lib/hooks/useChatStream.ts:4641; apps/web/lib/services/managed-office-file-service.ts:129; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat screen > + (Add attachments and tools) > Output > Document, then ask for a document and press Send. (labels found in the code)
- **Steps:**
  1. Click + and open the Output group.
  2. Click Document so it is checked.
  3. Type: write a one-page letter thanking a customer.
  4. Press Send and look for a file card for a .docx file with a download or open control.

## S57.09 Presentation tool.

- **Expected:** The assistant can call a tool that creates a presentation file (pptx) the user can open or download.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639 (quoted code not found in the file now); apps/web/lib/hooks/useChatStream.ts:4641; apps/web/lib/services/managed-office-file-service.ts:142; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat screen > + (Add attachments and tools) > Output > Presentation, then ask for a presentation and press Send. (labels found in the code)
- **Steps:**
  1. Click + and open the Output group.
  2. Click Presentation so it is checked.
  3. Type: make a five-slide deck about our quarterly results.
  4. Press Send and look for a file card for a .pptx file with a download or open control.

## S57.10 Code-execution tool.

- **Expected:** The assistant can call a tool that runs code it wrote and returns the output in the transcript.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3411; apps/web/lib/hooks/useChatStream.ts:4640; apps/web/lib/e2b/execution-tools.ts:216; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6419
- **Where to find it:** Chat screen > message box > type /code chart the first 20 prime numbers > Send. (labels found in the code)
- **Steps:**
  1. Click the message box and type /code chart the first 20 prime numbers.
  2. Press Send.
  3. Watch the tool row: it reads 'Running code' while it runs and 'Ran code' when done.
  4. Expand the row and check that the output of the code appears in the transcript.

## S57.11 Shell tool.

- **Expected:** The assistant can call a tool that runs a shell command and returns its output and exit code.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. The plan says the sandbox shell tool is switched off until the production E2B switch is set; the + menu has a 'Run a local command' row (ComposerPlusMenu.tsx) that may be a desktop-only shell, not verified.

## S57.12 Patch/edit tool.

- **Expected:** The assistant can call a tool that edits part of an existing file (targeted replace or patch) rather than rewriting it.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. The plan says the sandbox patch tool is switched off until the production E2B switch is set; I found no user control for targeted edits of an existing file.

## S57.16 Image-generation tool.

- **Expected:** The assistant can call an image-generation tool during a turn and the generated image appears in the transcript.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5041 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2676; apps/web/app/api/media/image/lib/image-chat-tools.ts:352; apps/web/app/api/media/image/lib/image-chat-tools.ts:419; apps/web/app/api/media/image/lib/managed-image-generation.ts:150; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:45
- **Where to find it:** Chat screen > + (Add attachments and tools) > Create image, then type a picture description > Send. Or type /image a futuristic city at dusk > Send. (labels found in the code)
- **Steps:**
  1. Click + and choose Create image, or click the message box and type /image a futuristic city at dusk.
  2. Type or keep a short picture description.
  3. Press Send.
  4. Look for the generated image in the reply, under the tool row that shows image creation.

## S57.17 Image-editing tool.

- **Expected:** The assistant can call a tool that edits a supplied image (edit, inpaint, variation) and shows the result.
- **Code:** done. Evidence moved: apps/web/app/api/media/image/lib/image-chat-tools.ts:353 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5601; apps/web/app/api/media/image/lib/managed-image-generation.ts:150; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:45
- **Where to find it:** Chat screen > + (Add attachments and tools) > Add photos & files > attach one image > click the button 'What to do with the attached image' > choose Edit > type a change > Send. (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Click + and choose Add photos & files, then attach one image.
  2. Click the button labelled 'What to do with the attached image' and choose Edit.
  3. Type the change you want, for example: make the sky red.
  4. Press Send and look for the edited image in the reply.

## S57.21 Memory tool.

- **Expected:** The assistant can call a memory tool to save, recall or delete a remembered fact during a turn.
- **Code:** done. Evidence present: apps/web/lib/server/tools/memory-tools.ts:257; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1123; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2524
- **Where to find it:** Chat screen > message box > type 'remember that I like short answers' > Send. Then Settings > Personalization > Persistent memory. (labels found in the code)
- **Steps:**
  1. Click the message box and type: remember that I like short answers.
  2. Press Send.
  3. Open Settings and click Personalization, then Persistent memory.
  4. Check that the saved fact appears in the memory list, and that Save memories from chats is on.

## S57.22 Calendar tool.

- **Expected:** The assistant can call a calendar tool to read or create events in the user's calendar.
- **Code:** partial. Evidence present: apps/web/lib/connectors/mcp-endpoints.ts:183
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json; Outlook calendar needs the Microsoft OAuth app credentials (microsoft-graph.ts:360 is wired)
- **Needs:** production-state
- **Where to find it:** Settings > Connectors > Google Calendar (connect it), then chat: ask what is on my calendar today. (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Open Settings and click Connectors.
  2. Find Google Calendar and connect it with your account.
  3. Back in a chat, type: what is on my calendar today?
  4. Press Send and look for a tool row that reads the calendar, then check the reply lists the events.

## S57.23 Messaging tool.

- **Expected:** The assistant can call a messaging tool to read or send messages on a connected service (e.g. Slack) after approval.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; apps/web/lib/connectors/mcp-endpoints.ts:165; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Settings > Connectors > Slack (connect it), then chat: ask the assistant to send a message to a channel and approve it when asked. (labels found in the code)
- **Needs:** an outside account (Slack)
- **Steps:**
  1. Open Settings, click Connectors, and connect Slack.
  2. Back in a chat, type: send 'hello from QA' to a Slack channel you own.
  3. Press Send and wait for the approval card.
  4. Approve it and check that the tool row shows completed and the message arrives in Slack.

## S57.24 Scheduling tool.

- **Expected:** The assistant can call a tool that creates, lists or deletes a scheduled task for the user.
- **Code:** done. Evidence present: apps/web/lib/server/tools/schedule-tool.ts:116; apps/web/lib/server/tools/schedule-tool.ts:154; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1198; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2482
- **Where to find it:** Tasks > New task (scheduled page), or chat: type 'remind me every day at 9am to check the report' > Send. (labels found in the code)
- **Steps:**
  1. In the sidebar, open Tasks and then the scheduled page.
  2. Click New task, fill in a name and what it should do, choose a time, and save.
  3. Check the page lists the new task under Scheduled.
  4. Optionally, in a chat, ask the assistant to schedule a task and check it appears on the same page.

## S57.26 Clarification/input tool.

- **Expected:** The assistant can call a tool that asks the user a clarifying question (with choices) and waits for the answer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:42; apps/web/lib/hooks/useChatStream.ts:1336; apps/web/lib/services/clarify-tool-service.ts:12; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1935 (quoted code not found in the file now)
- **Where to find it:** Chat screen > message box > send a vague request such as 'plan my trip' > look for the question card with the 'Send answers' button. (labels found in the code)
- **Steps:**
  1. Click the message box and type a vague request such as: plan my trip.
  2. Press Send.
  3. When the assistant asks a question with choices, pick one or type in 'Other answer for' the question.
  4. Press Send answers and check that the reply continues from your answer.

## S57.28 Tool discovery.

- **Expected:** When more tools are connected than fit in a turn, the model is told which others exist and can load them on demand.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3938; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:173
- **Where to find it:** Settings > Capabilities > Tool access > On demand, then chat with a connected app and ask for a task that needs its tools. (labels found in the code)
- **Needs:** a connected app (Connectors)
- **Steps:**
  1. Open Settings, click Capabilities, and find Tool access.
  2. Choose On demand.
  3. Back in a chat with a connected app, ask for a task that needs one of its tools.
  4. Look for a 'Load connector tools' row in the tool timeline and check the reply uses a loaded tool.

## S57.29 Tool search.

- **Expected:** The model or user can search the available tools by keyword and get matching tools with their descriptions.
- **Code:** done. Evidence moved: apps/web/lib/connectors/tool-search.ts:35; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:190; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3156 (quoted code not found in the file now); apps/web/public/openapi.json:946
- **Where to find it:** no screen of its own. No search box was found in the UI; the keyword search runs inside the model's load call (apps/web/lib/connectors/tool-search.ts), so the tester sees only its results.
- **Needs:** a connected app (Connectors)
- **Steps:**
  1. Set Settings > Capabilities > Tool access to On demand.
  2. In a chat with a connected app, ask for a task that needs a tool you did not name.
  3. Open the tool timeline and look for the 'Load connector tools' row and the tools it lists.

## S57.30 Tool descriptions and schemas.

- **Expected:** Each tool carries a readable description and typed parameter schema that the model uses and the user can inspect.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:270; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:90
- **Where to find it:** Settings > Connectors > [a connected connector] > capabilities panel > click a name under Tools. (labels found in the code)
- **Needs:** a connected app (Connectors)
- **Steps:**
  1. Open Settings and click Connectors.
  2. Open a connector that is connected.
  3. In the panel with the heading Tools, click a tool name.
  4. Check the description and the parameter list (name, type, required or optional) under the tool, then click Close.

## S57.31 Tool argument preview.

- **Expected:** Each tool call in the transcript shows the arguments it was called with (command, file, query or JSON).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:461; apps/web/features/chat/components/messages/ToolTimeline.tsx:490; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3833
- **Where to find it:** Chat screen > send a message that uses a tool (for example /search latest AI news) > click the tool row to expand it > look under Request. (labels found in the code)
- **Steps:**
  1. Send /search latest AI news.
  2. Click the 'Used tools' row to expand it.
  3. Click the tool row to open its details.
  4. Check the Request block shows the query or the JSON arguments the tool was called with.

## S57.32 Tool-call progress.

- **Expected:** While a tool runs the transcript shows it as running (with elapsed time), then completed or failed.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:560; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5846
- **Where to find it:** Chat screen > send a message that uses a tool > watch the tool timeline while it runs and after it finishes. (labels found in the code)
- **Steps:**
  1. Send /search latest AI news and watch the reply area.
  2. While the tool runs, look for the row text 'Running:' or 'Working...' in the timeline header.
  3. Wait for it to finish and check the header changes away from running.
  4. Open the row and check the status of the call.

## S57.33 Tool result preview.

- **Expected:** A finished tool call shows a short preview of its result in the transcript.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:482; apps/web/features/chat/components/messages/ToolTimeline.tsx:490; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3833
- **Where to find it:** Chat screen > send a message that uses a tool > open the finished tool row and read the Response block. (labels found in the code)
- **Steps:**
  1. Send /search latest AI news and wait for the reply.
  2. Click the 'Used tools' row to expand it.
  3. Click the finished tool row to open its details.
  4. Check the Response block shows the result (a short preview of the output).

## S57.34 Tool result expansion.

- **Expected:** The user can expand a tool call to see its full arguments and result, and collapse it again.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:597; packages/ui/unified-chat/src/components/ToolCallCard.tsx:482; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3833
- **Where to find it:** Chat > a reply that used tools > the tool summary line (for example "Tool run complete") > click one tool row (labels found in the code)
- **Needs:** a chat where the assistant has used a tool
- **Steps:**
  1. Open a chat where the assistant has used at least one tool.
  2. Click the tool summary line, such as "Tool run complete", to open the tool list.
  3. Click one tool row to expand it.
  4. Look for the "Request" block (the arguments) and the "Response" block (the result) and compare with Expected.
  5. Click the same tool row again and check that the Request and Response blocks disappear.

## S57.36 Large-result references.

- **Expected:** An oversized tool result is stored in full and replaced in context by a reference the model or user can open later.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:109; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3964; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3406 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. No control for the user was found. The stored copy is read back by the assistant through the read_tool_result tool (apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts); the Expected phrase that the user can open it later is not confirmed by the code. Stored copies are kept for 24 hours.
- **Needs:** a chat where a tool returns a very long result
- **Steps:**
  1. Ask the assistant to run a tool that returns a very long result, such as reading a long file.
  2. Open the tool list and look for a tool row labelled "Read a stored tool result" when the assistant reads an earlier result back, and compare with Expected.

## S57.37 Tool receipt.

- **Expected:** After tool calls run, the user can later review a record of which tool ran, with what input, and its outcome.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:377; apps/web/app/api/connectors/calls/route.ts:34; packages/ui/unified-chat/src/components/ToolCallCard.tsx:461
- **Where to find it:** Settings > Connectors > [a connected connector] > Tool permissions > Recent calls (labels found in the code)
- **Needs:** a connected connector that the assistant has already called
- **Steps:**
  1. Open Settings and choose Connectors.
  2. Click a connected connector, then click "Tool permissions".
  3. Scroll to the "Recent calls" section.
  4. Read the rows: each shows an outcome word such as "Worked", "Failed" or "Blocked here".
  5. Compare with Expected. The section text says "Arguments and results are never recorded", so the input part of Expected is not met by this screen.
