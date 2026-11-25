---
id: "PLAN-mobile-057"
type: "test-plan"
title: "Mobile · 57. Tool catalog and invocation experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "57"
---
# Mobile · 57. Tool catalog and invocation experience

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S57.01 Search tool.

- **Expected:** The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/capabilities/index.tsx:218; apps/mobile/stores/chat/chatExecutionStore.ts:1741 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341
- **Where to find it:** Settings > Assistant > Capabilities > Web search (then a Cloud chat) (labels found in the code)
- **Needs:** a signed-in account in Cloud mode; the Web search row appears only when the mobile release enables it
- **Steps:**
  1. Open the side menu, tap Settings, then tap Assistant > Capabilities.
  2. Under AGI Cloud, check the Web search row is on (its value reads Cloud).
  3. Go back to a Cloud chat and ask about a recent event or today's news.
  4. Look for a Search the web row in the reply and tap it to expand.
  5. Compare with Expected: the search and its sources (1 source or N sources, with links) should be shown.

## S57.02 Fetch-page tool.

- **Expected:** The assistant can call a tool that fetches a given web page and reads its content, with the fetch shown in the transcript.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:989; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2734
- **Where to find it:** Cloud chat: paste a web page address and ask what it says (labels found in the code)
- **Needs:** a Cloud account; a public web page address
- **Steps:**
  1. Open a Cloud chat (Settings > Assistant > Capabilities shows Cloud mode).
  2. Paste a full web page address and ask what the page says.
  3. Look for a tool row in the reply; a row named Web Fetch (generated from the tool name web_fetch) should appear.
  4. If the fetch fails, the row reads Failed to fetch: followed by the address; compare with Expected.

## S57.03 Source-reader tool.

- **Expected:** The assistant can call a tool that opens a cited source or document (PDF, Office file or page) by reference and reads its text.
- **Code:** partial. Evidence present: packages/ai/model-registry/catalog/routing-policies.json:161
- **Known to be unfinished:** switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval signal; server-only, the phone uses the same completions path
- **Where to find it:** not found in the code. Rollout flag in packages/ai/model-registry/catalog/routing-policies.json:161 is server-only, and no source-reader tool control was found in apps/mobile. The only source control found is the Open source link on search results (apps/mobile/src/features/chat/components/WebSearchResultCard.tsx), which is not a document reader.
- **Needs:** a Cloud chat

## S57.04 File-search tool.

- **Expected:** The assistant can call a tool that searches the user's files (by name or content) and returns matching paths or snippets.
- **Code:** done. Evidence present: apps/web/lib/server/tools/file-search-tool.ts:417; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1154; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2505
- **Where to find it:** not found in the code. Searched for search_files and open_file: found in apps/web/lib/server/tools/file-tool-names.ts and the web tool loop, but no mobile control or visible label was found in apps/mobile.
- **Needs:** a Cloud chat with files available to the account

## S57.05 File-read tool.

- **Expected:** The assistant can call a tool that reads the contents of a file it names (in a sandbox or on the user's machine).
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:20
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 with E2B_API_KEY and the compute price; the phone reaches the same sandbox tools
- **Where to find it:** not found in the code. Only the sandbox gate (apps/web/lib/e2b/gate.ts:20) and the Code execution and file creation row (apps/mobile/src/features/settings/capabilities/index.tsx) were found; no file-read tool name or phone control was located. Plan says the server switch AGI_E2B_EXECUTION=1 is needed.
- **Needs:** a Cloud account with code execution enabled on the server

## S57.06 File-write tool.

- **Expected:** The assistant can call a tool that creates or overwrites a file it names (in a sandbox or on the user's machine).
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:20
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 with E2B_API_KEY and the compute price; the phone reaches the same sandbox tools
- **Where to find it:** not found in the code. Same as S57.05: only the sandbox gate (apps/web/lib/e2b/gate.ts:20) was found; no file-write tool name or phone control was located.
- **Needs:** a Cloud account with code execution enabled on the server

## S57.07 Spreadsheet tool.

- **Expected:** The assistant can call a tool that creates a spreadsheet file (xlsx) the user can open or download.
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:1755 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341; apps/web/lib/services/managed-office-file-service.ts:151
- **Where to find it:** Settings > Assistant > Capabilities > Code execution and file creation, then a Cloud chat that asks for a spreadsheet (labels found in the code)
- **Needs:** a Cloud account; the Code execution and file creation row must not show Off
- **Steps:**
  1. Open Settings > Assistant > Capabilities and check Code execution and file creation is not Off.
  2. In a Cloud chat, ask for a spreadsheet (for example a three-month budget in Excel format).
  3. When the file card appears in the reply, tap it to open the file.
  4. Tap the download control (Download artifact) and confirm an .xlsx file can be opened or shared, as Expected says.

## S57.08 Document tool.

- **Expected:** The assistant can call a tool that creates a document file (docx) the user can open or download.
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:1755 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341; apps/web/lib/services/managed-office-file-service.ts:129
- **Where to find it:** Settings > Assistant > Capabilities > Code execution and file creation, then a Cloud chat that asks for a Word document (labels found in the code)
- **Needs:** a Cloud account; the Code execution and file creation row must not show Off
- **Steps:**
  1. Open Settings > Assistant > Capabilities and check Code execution and file creation is not Off.
  2. In a Cloud chat, ask for a Word document (docx) on a topic.
  3. When the file card appears, tap it to open the document.
  4. Tap the download control (Download artifact) and confirm a .docx file opens or can be shared.

## S57.09 Presentation tool.

- **Expected:** The assistant can call a tool that creates a presentation file (pptx) the user can open or download.
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:1755 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341; apps/web/lib/services/managed-office-file-service.ts:142
- **Where to find it:** Settings > Assistant > Capabilities > Code execution and file creation, then a Cloud chat that asks for a slide deck (labels found in the code)
- **Needs:** a Cloud account; the Code execution and file creation row must not show Off
- **Steps:**
  1. Open Settings > Assistant > Capabilities and check Code execution and file creation is not Off.
  2. In a Cloud chat, ask for a short presentation (pptx) on a topic.
  3. When the file card appears, tap it to open the deck.
  4. Tap the download control (Download artifact) and confirm a .pptx file opens or can be shared.

## S57.10 Code-execution tool.

- **Expected:** The assistant can call a tool that runs code it wrote and returns the output in the transcript.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/capabilities/index.tsx:181; apps/mobile/stores/chat/chatExecutionStore.ts:1754 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341
- **Where to find it:** Settings > Assistant > Capabilities > Code execution and file creation, then a Cloud chat with a Run code row (labels found in the code)
- **Needs:** a Cloud account; the Code execution and file creation row must not show Off
- **Steps:**
  1. Open Settings > Assistant > Capabilities and check Code execution and file creation is not Off.
  2. In a Cloud chat, ask for a short Python program that prints a result (for example the first ten square numbers).
  3. Look for a Run code row in the reply and tap it to expand.
  4. Check the Code heading shows the code and the Output heading shows the printed result.
  5. Optionally tap Run again under the code and compare the new output with Expected.

## S57.12 Patch/edit tool.

- **Expected:** The assistant can call a tool that edits part of an existing file (targeted replace or patch) rather than rewriting it.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:20
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 with E2B_API_KEY and the compute price; the phone reaches the same sandbox tools
- **Where to find it:** not found in the code. Only the sandbox gate (apps/web/lib/e2b/gate.ts:20) was found; no patch or edit tool name or phone control was located in apps/mobile.
- **Needs:** a Cloud account with code execution enabled on the server

## S57.16 Image-generation tool.

- **Expected:** The assistant can call an image-generation tool during a turn and the generated image appears in the transcript.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/clarifyCard.ts:10 (quoted code not found in the file now); apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1127
- **Where to find it:** Settings > Assistant > Capabilities > Image generation, then a Cloud chat (labels found in the code)
- **Needs:** a Cloud account; the Image generation row must be on (eligible chats only)
- **Steps:**
  1. Open Settings > Assistant > Capabilities and check the Image generation row is on (its value reads Cloud).
  2. Go back to a Cloud chat and ask for a picture (for example a lighthouse at dusk).
  3. Look in the reply for the generated image card.
  4. Compare with Expected: the image should appear in the transcript.

## S57.17 Image-editing tool.

- **Expected:** The assistant can call a tool that edits a supplied image (edit, inpaint, variation) and shows the result.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/clarifyCard.ts:10 (quoted code not found in the file now); apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1127
- **Where to find it:** not found in the code. Image-card rendering is in apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx, but no phone control to supply or attach an image for editing was found, and the edit tool name was not located.
- **Needs:** a Cloud chat with an image to change

## S57.21 Memory tool.

- **Expected:** The assistant can call a memory tool to save, recall or delete a remembered fact during a turn.
- **Code:** done. Evidence present: apps/web/lib/server/tools/memory-tools.ts:257; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1123; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2524
- **Where to find it:** Settings > Assistant > Memory, then a Cloud chat (labels found in the code)
- **Needs:** a Cloud account (memory is used in Cloud chats)
- **Steps:**
  1. Open Settings > Assistant > Memory and note what is listed.
  2. In a Cloud chat, type: Remember that my favourite colour is green.
  3. Look for a memory tool row in the reply and tap it to expand if it has details.
  4. Go back to Settings > Assistant > Memory and check the new fact is listed; then ask the chat to forget it and check it is removed.

## S57.22 Calendar tool.

- **Expected:** The assistant can call a calendar tool to read or create events in the user's calendar.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own calendar tool already works
- **Needs:** production-state
- **Where to find it:** Settings > Device > Permissions (calendar access), then a chat that asks about your calendar (labels found in the code)
- **Needs:** a phone with calendar access granted and some events on the day
- **Steps:**
  1. Open Settings > Device > Permissions and confirm calendar access is allowed for the phone.
  2. In a chat, ask: What is on my calendar today?
  3. Look for a Read your calendar row in the reply and tap it to expand.
  4. Compare the events shown with your phone Calendar app, as Expected says.

## S57.23 Messaging tool.

- **Expected:** The assistant can call a messaging tool to read or send messages on a connected service (e.g. Slack) after approval.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341; apps/web/lib/connectors/mcp-endpoints.ts:165; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** not found in the code. Searched apps/mobile for Slack and messaging tool names: no match. The Connectors page (Settings > Cloud > Connectors, apps/mobile/src/features/settings/cloud-connectors/index.tsx) exists, but no messaging tool or Slack entry was located in the phone code.
- **Needs:** a connected messaging service

## S57.24 Scheduling tool.

- **Expected:** The assistant can call a tool that creates, lists or deletes a scheduled task for the user.
- **Code:** done. Evidence present: apps/web/lib/server/tools/schedule-tool.ts:116; apps/web/lib/server/tools/schedule-tool.ts:154; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1198; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2482
- **Where to find it:** Schedules > Create Schedule (from the side menu), and the create_schedule tool in a Cloud chat (labels found in the code)
- **Needs:** a plan that includes scheduled tasks (the screen says Scheduled tasks require Basic on lower plans)
- **Steps:**
  1. Open the side menu and tap Schedules.
  2. Tap Create Schedule, enter a name, the prompt and how often it runs, then save.
  3. Check the new schedule appears in the Schedules list and is active.
  4. Optionally, in a Cloud chat ask for a reminder schedule and look for the create tool row.

## S57.26 Clarification/input tool.

- **Expected:** The assistant can call a tool that asks the user a clarifying question (with choices) and waits for the answer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1079; apps/mobile/stores/chat/chatExecutionStore.ts:3442
- **Where to find it:** Cloud chat: a question card with choices and a Send answers button (labels found in the code)
- **Needs:** a Cloud chat (the assistant decides when to ask)
- **Steps:**
  1. In a Cloud chat, send a vague request that needs choices, for example: Help me plan a trip.
  2. Look for a card with questions and options in the reply.
  3. Pick an option, or type in the Something else box, then tap Send answers.
  4. Check the assistant continues using your answer, as Expected says.

## S57.28 Tool discovery.

- **Expected:** When more tools are connected than fit in a turn, the model is told which others exist and can load them on demand.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3938; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:173
- **Where to find it:** no screen of its own. Tool discovery is server-side: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts and tool-schema-loader.ts. No phone control or visible label was found.
- **Needs:** several connected tools

## S57.29 Tool search.

- **Expected:** The model or user can search the available tools by keyword and get matching tools with their descriptions.
- **Code:** done. Evidence moved: apps/web/lib/connectors/tool-search.ts:35; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:190; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3156 (quoted code not found in the file now); apps/web/public/openapi.json:946
- **Where to find it:** not found in the code. Server-side tool search exists (apps/web/lib/connectors/tool-search.ts, tool-schema-loader.ts). No user-facing tool search control in apps/mobile was found, so the user-side part of Expected could not be located.

## S57.31 Tool argument preview.

- **Expected:** Each tool call in the transcript shows the arguments it was called with (command, file, query or JSON).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:368 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2523 (quoted code not found in the file now)
- **Where to find it:** Any tool row in a chat (for example Search the web): tap the row (labels found in the code)
- **Needs:** a Cloud account with Web search on
- **Steps:**
  1. In a Cloud chat with Web search on, ask a question that needs a web search.
  2. Tap the Search the web row to expand it.
  3. Look under the Request heading for the query or the arguments the tool was called with.
  4. Compare with Expected: the arguments (query, command, file or JSON) are shown.

## S57.32 Tool-call progress.

- **Expected:** While a tool runs the transcript shows it as running (with elapsed time), then completed or failed.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:284; apps/mobile/stores/chat/chatExecutionStore.ts:2523 (quoted code not found in the file now)
- **Where to find it:** Any running tool row in a Cloud chat (for example Search the web) (labels found in the code)
- **Needs:** a Cloud account with Web search on
- **Steps:**
  1. In a Cloud chat with Web search on, ask a question about current events.
  2. While the search runs, watch the row: it reads the running form (for example Searching the web…) with a shimmer.
  3. When it finishes, the row changes to Searched the web and a duration chip appears.
  4. Compare with Expected: an elapsed-time counter while running is not in the code; only the duration after it finishes.

## S57.33 Tool result preview.

- **Expected:** A finished tool call shows a short preview of its result in the transcript.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:389 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2523 (quoted code not found in the file now)
- **Where to find it:** Any finished tool row in a Cloud chat: tap it, then read the Response heading (labels found in the code)
- **Needs:** a Cloud account with a finished tool call
- **Steps:**
  1. In a Cloud chat with Web search on, ask a question that needs a web search.
  2. Look at the finished row's right side for a short chip (a duration or a results count).
  3. Tap the row and read the text under the Response heading.
  4. Compare with Expected: a short preview of the result is shown.

## S57.34 Tool result expansion.

- **Expected:** The user can expand a tool call to see its full arguments and result, and collapse it again.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:550; apps/mobile/stores/chat/chatExecutionStore.ts:2523 (quoted code not found in the file now)
- **Where to find it:** Any tool row in a Cloud chat: tap to expand, tap again to collapse (labels found in the code)
- **Needs:** a Cloud account with a finished tool call
- **Steps:**
  1. In a Cloud chat, run a tool (for example a web search) and wait until the row is finished.
  2. Tap the row; the chevron turns down and the Request and Response sections appear.
  3. Tap the row again to collapse it.
  4. For a long result, tap View full output to open the full-screen sheet, then close it and compare with Expected.

## S57.36 Large-result references.

- **Expected:** An oversized tool result is stored in full and replaced in context by a reference the model or user can open later.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5583 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1657; apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:77 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2848; apps/web/lib/e2b/execution-tools.ts:410; apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:44 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3385 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5490; apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.test.ts:1
- **Where to find it:** A long tool result in a Cloud chat: expand the row, then tap View full output (labels found in the code)
- **Needs:** a Cloud account with code execution enabled
- **Steps:**
  1. In a Cloud chat with code execution on, ask for a program that prints many lines (for example 100 numbers).
  2. Tap the Run code row to expand it.
  3. Tap View full output to open the complete result in a full-screen sheet.
  4. Compare with Expected: the full text is kept and can be opened later; the context reference itself is server-side and not visible.
