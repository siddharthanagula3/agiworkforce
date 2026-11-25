---
id: "AREA-057"
type: "area"
title: "Tool catalog and invocation experience"
features: ["F057-01", "F057-02", "F057-03", "F057-04", "F057-05", "F057-06", "F057-07", "F057-08", "F057-09", "F057-10", "F057-11", "F057-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 57. Tool catalog and invocation experience

A tool is an action the assistant can take during a reply, such as searching the web, reading a file, running code, creating a document or saving a memory. This area is how the assistant calls those tools, how the person sees each call and its result, and how the person finds out which tools exist. It matters because the assistant is only as useful as the actions it can actually take, and the person must be able to see and trust each action.

**Who uses it.** Every signed-in person on the web, desktop, mobile, CLI, VS Code and Chrome apps sees the tool calls in a chat. Web search, page fetch and memory are offered by the server to the chat as a whole, with per-turn limits that depend on the mode of the turn (ordinary or agent work). Scheduled tasks are blocked in temporary chats and limited by plan tier. Sandbox execution tools are off unless the server has the sandbox switch on and the account passes the code-execution policy check. Desktop device steps need the desktop app and a folder or screen the person has granted. Workspace admin rules were not established in the code I opened.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F057-01](F057-01-web-search-and-page-reading.md) | Web search and page reading | partly | partly | partly | built | built | partly |
| [F057-02](F057-02-your-files-find-read-write-and-edit.md) | Your files: find, read, write and edit | partly | built | partly | built | built | partly |
| [F057-03](F057-03-running-code-and-shell-commands.md) | Running code and shell commands | partly | built | partly | built | built | partly |
| [F057-04](F057-04-browser-and-computer-control.md) | Browser and computer control | no | built | no | partly | partly | built |
| [F057-05](F057-05-office-documents-and-spreadsheets.md) | Office documents and spreadsheets | built | built | built | no | no | built |
| [F057-06](F057-06-images-and-video.md) | Images and video | built | built | built | partly | no | no |
| [F057-07](F057-07-speech-in-and-out.md) | Speech in and out | n/a | n/a | n/a | n/a | n/a | n/a |
| [F057-08](F057-08-memory-and-scheduled-tasks.md) | Memory and scheduled tasks | built | built | built | built | built | built |
| [F057-09](F057-09-connected-services-calendar-and-messages.md) | Connected services: calendar and messages | partly | partly | partly | built | built | partly |
| [F057-10](F057-10-agents-questions-and-approvals.md) | Agents, questions and approvals | built | built | built | partly | built | built |
| [F057-11](F057-11-finding-tools.md) | Finding tools | built | built | built | built | built | built |
| [F057-12](F057-12-tool-call-records-cards-details-errors-and-receipt.md) | Tool call records: cards, details, errors and receipts | built | built | built | built | built | built |

Requirement items for this area: [10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md).

## How this area works in the code

1. **1. Choosing which tools the model sees.** The server ranks all connected tools for the turn and keeps the ones that fit the count and byte budget; the rest are listed as deferred. Budgets depend on the mode, and a mode may allow zero tools. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:32-41 (budget per mode)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:116-159 (selectToolSchemas: rank, admit, defer)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:173-200 (directory tool listing the model can call)`)
2. **2. The model asks for a tool by name.** Deferred tools are loaded by exact name or by keyword. Keyword search scores matches and returns up to 8. (`apps/web/lib/connectors/tool-search.ts:4 (TOOL_SEARCH_MAX_RESULTS = 8)`, `apps/web/lib/connectors/tool-search.ts:35-48 (searchToolsByKeyword)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3985 (keyword lookup in the loop)`)
3. **3. The server routes the call.** Search and fetch calls are routed to their own code. Sandbox execution tools are refused unless the sandbox switch is on, and then the per-account code-execution policy is checked. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2798-2809 (execution tools: refused unless AGI_E2B_EXECUTION=1)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2814-2827 (per-account execution policy)`)
4. **4. Web search runs.** The search tool sends the query to the search provider with a 15 second timeout, asks for up to 5 results, and returns titles, links and snippets. The per-turn budget is applied before the call. (`apps/web/lib/web-search/web-search-tool.ts:39 (15 second timeout)`, `apps/web/lib/web-search/web-search-tool.ts:54-57 (result and call limits)`, `apps/web/lib/web-search/web-search-tool.ts:61-93 (tool description the model reads)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4666-4677 (per-turn budgets)`)
5. **5. Device steps run on the desktop.** Desktop file, browser and screen steps are described in a shared contract with scopes (workspace, screen, browser, phone), limits and a 15 minute time constant. The desktop dispatcher performs them (the brief lists the dispatcher; I did not open it). (`packages/contracts/local-runtime/src/device-steps.ts:31 (DEVICE_STEP_TOOLS list)`, `packages/contracts/local-runtime/src/device-steps.ts:87-88 (scope types)`, `packages/contracts/local-runtime/src/device-steps.ts:424-430 (step limits and 15 minute constant)`)
6. **6. Large results are stored and referenced.** A result too big for the reply is saved under the user and conversation with a random reference, kept 24 hours, and the reply gets a reference. A reader tool pages through it 40000 characters at a time. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:14-17 (key prefix and 24 hour TTL)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:60-61 (storage key)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:9 (read_tool_result name)`)
7. **7. Memory and scheduled tasks.** Memory tools save one sentence or delete matching memories; deletion waits for the person's approval. The schedule tool checks temporary-chat status, takes a database lock, checks the plan quota, and creates the task. (`apps/web/lib/server/tools/memory-tools.ts:49-93 (save and forget definitions)`, `apps/web/lib/server/tools/schedule-tool.ts:116-131 (temporary chat refusal)`, `apps/web/lib/server/tools/schedule-tool.ts:150-156 (lock, quota, create)`)
8. **8. The transcript draws each call.** The web transcript shows each call as a timeline with a retry control for the whole turn. Each shared card shows the arguments and the result preview and can expand. (`apps/web/features/chat/components/messages/ToolTimeline.tsx:200 (onRetryTurn prop)`, `apps/web/features/chat/components/messages/ToolTimeline.tsx:582 (ToolTimeline component)`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Server loop that runs tool calls in a turn: budgets, routing of execution tools, results and events. |
| `apps/web/lib/web-search/web-search-tool.ts` | Definition and execution of the web search tool, with its result and call limits. |
| `apps/web/lib/e2b/gate.ts` | The sandbox switches: AGI_E2B_EXECUTION, E2B_API_KEY and the provisioning check. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts` | Chooses which tool schemas the model sees each turn and lists the rest as deferred. |
| `apps/web/lib/connectors/tool-search.ts` | Keyword search across tools, returning up to 8 matches. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | Stores oversized tool results for 24 hours and gives back a reference. |
| `apps/web/lib/server/tools/schedule-tool.ts` | Creates scheduled tasks for the person, with temporary-chat refusal and plan quota. |
| `apps/web/lib/server/tools/memory-tools.ts` | Defines the save and forget memory tools; forget needs the person's approval. |
| `packages/contracts/local-runtime/src/device-steps.ts` | Shared contract for desktop, phone and browser steps: names, scopes, limits and time constant. |
| `packages/ai/model-registry/catalog/routing-policies.json` | Rollout ledger: shows the url_fetch description entry is on internal and takes no traffic. |
| `apps/web/lib/prompts/prompt-manifest.ts` | Holds the text of the url_fetch tool description the model reads (line 282). |
| `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Web transcript view of tool calls, with the whole-turn retry control. |

## What is stored

- Oversized tool results, kept whole for 24 hours, keyed by user, conversation and a random reference: Key-value store from apps/web/lib/server/key-value (accessed in apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:14-17, 60-61). The backend behind it was not opened.
- Scheduled tasks created by the schedule tool: Written through createSchedule inside a database transaction (apps/web/lib/server/tools/schedule-tool.ts:150-156). The table name was not confirmed.
- Saved memories (save and forget): Through apps/web/lib/server/tools/memory-tools.ts. The storage table was not confirmed.
- Device step results: Time constant only (packages/contracts/local-runtime/src/device-steps.ts:428, 15 minutes). Where results are kept was not confirmed.
- Web search results and their retrieval time: Returned in the search outcome (apps/web/lib/web-search/web-search-tool.ts:111-120). Whether they are saved with the chat was not confirmed.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION**: Set to 1 to allow sandbox execution tools (file read, write, edit, shell, code execution) on the server. (apps/web/lib/e2b/gate.ts:6 and 16-18; checked in apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802.)
- **E2B_API_KEY**: Key for the sandbox service. With the flag it makes the sandbox provisioning check pass; alone it also makes e2bExecutionEnabled true. (apps/web/lib/e2b/gate.ts:7, 9-13, 20-28.)
- **Compute price for the sandbox**: Sandbox provisioning is ready only when a price is set. (sandboxComputeIsPriceable imported in apps/web/lib/e2b/gate.ts:4 and used at gate.ts:20-28.)
- **AGI_MANAGED_COMPUTE_PRIVATE_BETA**: Separate managed-compute private-beta gate; the brief says it is on when unset. (Imported in apps/web/lib/e2b/gate.ts:3 and read by managedComputeBetaEnabled at gate.ts:35-37. The default was not opened.)
- **web_search request field**: Lets the client turn web search on or off for a request. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:708.)
- **memory_enabled request field**: False skips memory reads and writes for the turn; also hides the memory tools. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:711-712 and 1139-1150.)
- **code_execution request field**: Lets the client turn code execution on or off for a request. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:777.)
- **schedulesAllowed**: Schedule tool is offered only when schedules are allowed for the account. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1205-1209.)
- **Plan tier for schedules**: Sets the schedule quota. (resolveEntitledPlanTier and assertScheduleQuota in apps/web/lib/server/tools/schedule-tool.ts:146-154.)
- **Work mode (agiwork)**: Raises the search budget from 3 to 10 calls per turn and the fetch budget likewise. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4667-4671.)
- **Temporary chat**: Blocks scheduled task creation. (apps/web/lib/server/tools/schedule-tool.ts:131.)
- **Prompt rollout channel for url_fetch description**: Keeps the PDF and Office reading text on internal; it takes no traffic until advanced. (packages/ai/model-registry/catalog/routing-policies.json:161-165 and apps/web/lib/prompts/prompt-manifest.ts:282.)
- **Desktop device step limits**: Caps coordinates, waits, click repeats, typed text, roots and result length. (packages/contracts/local-runtime/src/device-steps.ts:386-430.)

## Shared between apps

Shared across apps: the tool-call card (packages/ui/unified-chat/src/components/ToolCallCard.tsx, named in the brief; I did not open it), the device-step contract (packages/contracts/local-runtime/src/device-steps.ts, which I opened and which is in the shared contracts package), and the server tool loop and search, fetch and memory code under apps/web, which the web, desktop, mobile and API paths all call. Separate per app: the web transcript (apps/web/features/chat/components/messages/ToolTimeline.tsx), the mobile tool timeline and store (apps/mobile, named in the brief, not opened), the CLI tool registry and TUI (apps/cli, not opened), the VS Code chat state (apps/extension-vscode, not opened), and the Chrome side panel (apps/extension, not opened).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Three different sandbox checks. e2bExecutionEnabled is true with the key alone; e2bCutoverEnabled needs the flag only; e2bProvisioningReady needs the flag, the key and a price. The execution tool check in the tool loop uses only the flag, so the flag on with no key or no price passes that check. (apps/web/lib/e2b/gate.ts:9-13, 16-18, 20-28; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802)
- The source reader (PDF and Office reading) is written in the prompt manifest but the entry is on the internal channel and takes no traffic, so the model is not told about the reading on the live channel. The brief points at prompt-manifest.ts:97; the text is at line 282. (packages/ai/model-registry/catalog/routing-policies.json:161-165; apps/web/lib/prompts/prompt-manifest.ts:282)
- The web transcript offers only a retry for the whole turn, not for one failed tool call. The brief marks per-tool error and retry as done only on the CLI. (apps/web/features/chat/components/messages/ToolTimeline.tsx:200, 440)

## Not established

- I did not open any file in the CLI (apps/cli), the VS Code extension (apps/extension-vscode), the Chrome extension (apps/extension), the mobile app (apps/mobile) or the desktop dispatcher (apps/desktop/electron/runtime/dispatcher.ts). Their status claims come from the brief only.
- I did not open the URL fetch tool (apps/web/lib/url-fetch/url-fetch-tool.ts), so I cannot say whether it reads PDF or Office files.
- The plan rule that limits web search, if any, was not established. The result count is the same for free and paid (apps/web/lib/web-search/web-search-tool.ts:54-55).
- The storage backend behind the key-value store and the table names for memory and scheduled tasks were not confirmed.
- Whether the image tools, the calendar and messaging connectors, and the office file builder behave as the brief says was not checked; those files were not opened.
- The default value of AGI_MANAGED_COMPUTE_PRIVATE_BETA was not read.
- The desktop approval UI and the device-step review list (DEVICE_REVIEWED_STEP_TOOLS, device-steps.ts:734) were not read in full.
- I did not run anything, as the task forbids; no test or build result is claimed.
- I did not open the Mobile or Chrome code paths, so the claims about their cards are from the brief only.
