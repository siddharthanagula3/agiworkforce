---
id: "PLAN-desktop-057"
type: "test-plan"
title: "Desktop · 57. Tool catalog and invocation experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "57"
---
# Desktop · 57. Tool catalog and invocation experience

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S57.01 Search tool.

- **Expected:** The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3409; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2767
- **Where to find it:** New chat > composer attach menu > Search the web, or the composer's Web search option; ask a question that needs current facts (labels found in the code)
- **Needs:** a signed-in account where web search is available on the plan; the tester should confirm the plan first
- **Steps:**
  1. Sign in and open a new chat.
  2. Open the attach menu in the composer and choose Search the web (or turn on Web search if the composer shows it).
  3. Type a question that needs current facts, such as today's news, and send.
  4. Look for a row or card that starts with 'Web search:' followed by the query and a result count, with sources listed under the answer. Compare with Expected: the search and its sources are shown.

## S57.02 Fetch-page tool.

- **Expected:** The assistant can call a tool that fetches a given web page and reads its content, with the fetch shown in the transcript.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2734
- **Where to find it:** no screen of its own. The model decides when to fetch, so there is no button for this tool; the tester can only prompt for it.
- **Needs:** a signed-in account
- **Steps:**
  1. Open a new chat.
  2. Type: Read https://example.com and tell me what the page says. Send.
  3. Look for a tool row in the reply; expand it with the 'Expand tool details' control if it is collapsed.
  4. Compare with Expected: a fetch of the page is shown in the transcript.

## S57.03 Source-reader tool.

- **Expected:** The assistant can call a tool that opens a cited source or document (PDF, Office file or page) by reference and reads its text.
- **Code:** partial. Evidence present: apps/web/lib/prompts/prompt-manifest.ts:147; packages/ai/model-registry/catalog/routing-policies.json:161
- **Known to be unfinished:** switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval quality signal (packages/ai/model-registry/catalog/routing-policies.json:161)
- **Where to find it:** not found in the code. Searched the Code evidence files for a visible control; found only the prompt manifest and routing policy entries, which are not user controls. Known unfinished switch-on is a routing setting, not a screen.

## S57.04 File-search tool.

- **Expected:** The assistant can call a tool that searches the user's files (by name or content) and returns matching paths or snippets.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:158; packages/contracts/local-runtime/src/device-steps.ts:165; packages/contracts/local-runtime/src/device-steps.ts:997; apps/web/lib/device-steps/device-tools.ts:138; apps/web/lib/device-steps/device-tools.ts:156; apps/web/features/desktop-host/lib/device-steps.ts:365; apps/web/features/desktop-host/lib/device-steps.ts:373; apps/desktop/electron/runtime/dispatcher.ts:2364; apps/desktop/electron/runtime/dispatcher.ts:2371; apps/desktop/electron/runtime/dispatcher.ts:670
- **Where to find it:** not found in the code. Device-step contracts and the Electron dispatcher exist, but I did not find the visible wording or the screen that starts a file search from the app.
- **Needs:** a paired desktop with local folders

## S57.05 File-read tool.

- **Expected:** The assistant can call a tool that reads the contents of a file it names (in a sandbox or on the user's machine).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; packages/contracts/local-runtime/src/device-steps.ts:130; apps/desktop/electron/runtime/dispatcher.ts:2337
- **Where to find it:** not found in the code. Device-step and dispatcher code exist for file reads, but no visible control or label was found in the cited files.
- **Needs:** a paired desktop with local folders

## S57.06 File-write tool.

- **Expected:** The assistant can call a tool that creates or overwrites a file it names (in a sandbox or on the user's machine).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; packages/contracts/local-runtime/src/device-steps.ts:144; apps/desktop/electron/runtime/dispatcher.ts:2343
- **Where to find it:** not found in the code. Device-step and dispatcher code exist for file writes, but no visible control or label was found in the cited files.
- **Needs:** a paired desktop with local folders

## S57.07 Spreadsheet tool.

- **Expected:** The assistant can call a tool that creates a spreadsheet file (xlsx) the user can open or download.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat composer > attach or output menu > 'Office files' option (the chosen format label), then ask for a spreadsheet (labels found in the code)
- **Needs:** a signed-in account where office creation is enabled
- **Steps:**
  1. Open a new chat.
  2. Turn on the Office files option in the composer and choose the spreadsheet format.
  3. Ask: Make a spreadsheet of monthly expenses for 3 months.
  4. Look for a file card the user can open or download. Compare with Expected: an xlsx file is offered.

## S57.08 Document tool.

- **Expected:** The assistant can call a tool that creates a document file (docx) the user can open or download.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat composer > attach or output menu > 'Office files' option (the chosen format label), then ask for a document (labels found in the code)
- **Needs:** a signed-in account where office creation is enabled
- **Steps:**
  1. Open a new chat.
  2. Turn on the Office files option and choose the document format.
  3. Ask: Write a one-page memo about a trip plan as a Word file.
  4. Look for a file card the user can open or download. Compare with Expected: a docx file is offered.

## S57.09 Presentation tool.

- **Expected:** The assistant can call a tool that creates a presentation file (pptx) the user can open or download.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875 (quoted code not found in the file now)
- **Where to find it:** Chat composer > attach or output menu > 'Office files' option (the chosen format label), then ask for a presentation (labels found in the code)
- **Needs:** a signed-in account where office creation is enabled
- **Steps:**
  1. Open a new chat.
  2. Turn on the Office files option and choose the presentation format.
  3. Ask: Make a 3-slide deck about a product launch.
  4. Look for a file card the user can open or download. Compare with Expected: a pptx file is offered.

## S57.10 Code-execution tool.

- **Expected:** The assistant can call a tool that runs code it wrote and returns the output in the transcript.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3411; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6419
- **Where to find it:** Chat composer > tools menu > Run code, then send a request that needs computing (labels found in the code)
- **Needs:** a signed-in account on a model that can run code
- **Steps:**
  1. Open a new chat.
  2. Open the composer's tools menu and choose Run code.
  3. Ask: Compute the first 20 prime numbers with code and show the output.
  4. Look for the code run and its output in the transcript. Compare with Expected: the output appears in the transcript.

## S57.11 Shell tool.

- **Expected:** The assistant can call a tool that runs a shell command and returns its output and exit code.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; packages/contracts/local-runtime/src/device-steps.ts:172; apps/desktop/electron/runtime/dispatcher.ts:2378
- **Where to find it:** not found in the code. Shell tool contracts and dispatcher code exist, but I did not find the visible wording or the control that shows a shell command from the app.
- **Needs:** a paired desktop

## S57.12 Patch/edit tool.

- **Expected:** The assistant can call a tool that edits part of an existing file (targeted replace or patch) rather than rewriting it.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:151; apps/web/lib/device-steps/device-tools.ts:120; apps/web/features/desktop-host/lib/device-steps.ts:355; apps/desktop/electron/runtime/filesystemService.ts:812; apps/desktop/electron/runtime/dispatcher.ts:2350
- **Where to find it:** not found in the code. Patch device-step and filesystem service code exist, but no visible control or label was found in the cited files.
- **Needs:** a paired desktop with local folders

## S57.13 Browser-navigation tool.

- **Expected:** The assistant can call a tool that opens a URL in a real browser tab it controls.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:269; apps/desktop/electron/browser/browserSteps.ts:134; apps/desktop/electron/runtime/dispatcher.ts:2633; apps/web/features/desktop-host/lib/device-steps.ts:226
- **Where to find it:** not found in the code. Browser step code exists in the Electron browser steps file, but I did not find the visible label or the screen that starts it.
- **Needs:** a paired desktop with the built-in browser

## S57.14 Browser-action tool.

- **Expected:** The assistant can call tools that click, type or read in a real browser page it controls.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:273; packages/contracts/local-runtime/src/device-steps.ts:277; apps/desktop/electron/browser/browserSteps.ts:134; apps/web/lib/device-steps/device-tools.ts:422
- **Where to find it:** not found in the code. Browser action code exists, but I did not find the visible labels or the screen that starts them.
- **Needs:** a paired desktop with the built-in browser

## S57.15 Computer-action tool.

- **Expected:** The assistant can call tools that see the screen and move, click and type on the user's computer.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; packages/contracts/local-runtime/src/device-steps.ts:219; apps/desktop/electron/runtime/dispatcher.ts:2565; apps/desktop/electron/runtime/dispatcher.ts:2555
- **Where to find it:** not found in the code. Computer-action dispatcher code exists; the only visible text found is 'Running on this device. Approve it if your desktop asks.' in ToolCallCard.tsx, and no start control was located.
- **Needs:** a paired desktop with computer use granted

## S57.16 Image-generation tool.

- **Expected:** The assistant can call an image-generation tool during a turn and the generated image appears in the transcript.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5041 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2676; apps/web/app/api/media/image/lib/image-chat-tools.ts:352; apps/web/app/api/media/image/lib/image-chat-tools.ts:419; apps/web/app/api/media/image/lib/managed-image-generation.ts:150; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:45
- **Where to find it:** not found in the code. Composer image mode (setImageMode) and image tool code exist, but I did not confirm the visible label of the image control.
- **Needs:** a signed-in account where image generation is available

## S57.17 Image-editing tool.

- **Expected:** The assistant can call a tool that edits a supplied image (edit, inpaint, variation) and shows the result.
- **Code:** done. Evidence moved: apps/web/app/api/media/image/lib/image-chat-tools.ts:353 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5601; apps/web/app/api/media/image/lib/managed-image-generation.ts:150; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:45
- **Where to find it:** not found in the code. Image-edit operations are defined in ChatComposerNew.tsx and ImageMaskDialog, but I did not confirm the visible labels or the path to open them.
- **Needs:** a signed-in account and an image to upload

## S57.21 Memory tool.

- **Expected:** The assistant can call a memory tool to save, recall or delete a remembered fact during a turn.
- **Code:** done. Evidence present: apps/web/lib/server/tools/memory-tools.ts:257; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1123; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2524
- **Where to find it:** not found in the code. Memory tool code exists in apps/web/lib/server/tools/memory-tools.ts, but I did not find the visible label of the settings screen that shows remembered facts.
- **Needs:** a signed-in account

## S57.22 Calendar tool.

- **Expected:** The assistant can call a calendar tool to read or create events in the user's calendar.
- **Code:** partial. Evidence present: apps/web/lib/connectors/mcp-endpoints.ts:183
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json; Outlook calendar needs the Microsoft OAuth app credentials (microsoft-graph.ts:360 is wired)
- **Needs:** production-state
- **Where to find it:** not found in the code. Connector tool code exists, but the Code audit says Google Calendar OAuth is not set up in production and Outlook needs Microsoft credentials, so the feature may not be reachable.
- **Needs:** a connected calendar account; production state needed

## S57.23 Messaging tool.

- **Expected:** The assistant can call a messaging tool to read or send messages on a connected service (e.g. Slack) after approval.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; apps/web/lib/connectors/mcp-endpoints.ts:165; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** not found in the code. Connector code and the tool-call approval card exist, but I did not confirm the connector screen path or the exact approve button wording.
- **Needs:** a connected messaging service such as Slack

## S57.24 Scheduling tool.

- **Expected:** The assistant can call a tool that creates, lists or deletes a scheduled task for the user.
- **Code:** done. Evidence present: apps/web/lib/server/tools/schedule-tool.ts:116; apps/web/lib/server/tools/schedule-tool.ts:154; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1198; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2482
- **Where to find it:** not found in the code. Schedule tool code and a schedules feature exist, but I did not confirm the menu path or label that lets a user open scheduled tasks.
- **Needs:** a signed-in account

## S57.26 Clarification/input tool.

- **Expected:** The assistant can call a tool that asks the user a clarifying question (with choices) and waits for the answer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:42; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1935 (quoted code not found in the file now)
- **Where to find it:** not found in the code. ClarifyCard is rendered in the chat (apps/web/features/chat/components/messages/cards/ClarifyCard.tsx via InteractiveCardBlock.tsx), but I did not extract its visible wording or choice buttons.
- **Needs:** a signed-in account

## S57.28 Tool discovery.

- **Expected:** When more tools are connected than fit in a turn, the model is told which others exist and can load them on demand.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:490; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3938; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:173
- **Where to find it:** no screen of its own. The model is told which other tools exist and loads them itself; there is no control to test.

## S57.29 Tool search.

- **Expected:** The model or user can search the available tools by keyword and get matching tools with their descriptions.
- **Code:** done. Evidence moved: apps/web/lib/connectors/tool-search.ts:35; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:190; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3156 (quoted code not found in the file now); apps/web/public/openapi.json:946
- **Where to find it:** not found in the code. Searched for a visible tool search control: the only match is the placeholder 'Search tools...' in apps/desktop/src/features/mcp/MCPWorkspace.tsx, but I did not trace the menu path that opens it.
- **Needs:** a signed-in account

## S57.30 Tool descriptions and schemas.

- **Expected:** Each tool carries a readable description and typed parameter schema that the model uses and the user can inspect.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:270; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:90
- **Where to find it:** not found in the code. ConnectorCapabilitiesPanel.tsx shows a 'Tools' section, but I did not trace the screen path that opens it.
- **Needs:** a connected connector with tools

## S57.31 Tool argument preview.

- **Expected:** Each tool call in the transcript shows the arguments it was called with (command, file, query or JSON).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:461; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3833
- **Where to find it:** Chat reply > the row "Tool run complete" (click to open) > click a tool call row > "Request" block (labels found in the code)
- **Needs:** an account that can run a tool in chat (a web search is enough)
- **Steps:**
  1. Start a chat and send a message that makes the assistant use a tool, for example a web search.
  2. When the reply shows the tool row, click the row that reads "Tool run complete" to open the list.
  3. Click one tool call row to open it.
  4. Look for the "Request" heading; the block under it should show the command, file, query or JSON the tool was called with, and compare it with Expected.

## S57.32 Tool-call progress.

- **Expected:** While a tool runs the transcript shows it as running (with elapsed time), then completed or failed.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:560; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5846
- **Where to find it:** Chat: send a message that makes the assistant use a tool, then watch the tool row above the reply while it runs (labels found in the code)
- **Needs:** an account that can run a tool in chat (a web search is enough)
- **Steps:**
  1. Send a message that makes the assistant run a tool, for example a web search or a file read.
  2. While the reply is still coming, look at the tool row; it should show a running phrase such as "Working..." in blue, and the tool card shows a live elapsed time.
  3. Wait for the run to finish.
  4. Look at the row again: it should read "Tool run complete" with no running phrase, and a finished tool card shows its duration; compare with Expected.

## S57.33 Tool result preview.

- **Expected:** A finished tool call shows a short preview of its result in the transcript.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:482; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3833
- **Where to find it:** Chat reply > the row "Tool run complete" (click to open) > click a finished tool call row > "Response" block (labels found in the code)
- **Needs:** an account that can run a tool in chat (a web search is enough)
- **Steps:**
  1. Send a message that makes the assistant use a tool that returns a result, for example a web search.
  2. When the run finishes, click the row that reads "Tool run complete".
  3. Click a finished tool call row.
  4. Look at the "Response" block; it should show a short preview of the result in a box that scrolls, and compare with Expected.

## S57.34 Tool result expansion.

- **Expected:** The user can expand a tool call to see its full arguments and result, and collapse it again.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:597; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3833
- **Where to find it:** Chat reply > the row "Tool run complete" (click to open and close) > click a tool call row to open or close its "Request" and "Response" blocks (labels found in the code)
- **Needs:** an account that can run a tool in chat (a web search is enough)
- **Steps:**
  1. Send a message that makes the assistant use a tool.
  2. Click the row "Tool run complete" to open the list of tool calls.
  3. Click a tool call row; its "Request" and "Response" blocks should appear.
  4. Click the same row again; the blocks should close. Compare with Expected.

## S57.36 Large-result references.

- **Expected:** An oversized tool result is stored in full and replaced in context by a reference the model or user can open later.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:109; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3964; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3406 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. I searched for "stored result", "Full result" and "Show more" and found no user-facing control to open a stored result; the reference is for the model, so the tester cannot open it from the screen.

## S57.37 Tool receipt.

- **Expected:** After tool calls run, the user can later review a record of which tool ran, with what input, and its outcome.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:377; apps/web/app/api/connectors/calls/route.ts:34
- **Where to find it:** Settings > Connectors > [a connected connector] > "Tool permissions" > "Recent calls" (labels found in the code)
- **Needs:** a connected connector that has been called before, for example from a chat
- **Steps:**
  1. Open Settings and click "Connectors".
  2. Open a connector that is already connected and has been used in a chat.
  3. Click "Tool permissions" in its details.
  4. Scroll to "Recent calls" and look at each entry's status ("Worked", "Failed" or "Blocked here") and its time; compare with Expected.
