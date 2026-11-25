# Area 57. Tool catalog and invocation experience

38 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S57.01 Search tool.
- Should: The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2636; apps/web/lib/hooks/useChatStream.ts:3511; apps/web/lib/web-search/web-search-tool.ts:56; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1968; apps/web/features/chat/components/messages/ToolTimeline.tsx:441; apps/mobile/src/features/settings/capabilities/index.tsx:160; apps/mobile/stores/chat/chatExecutionStore.ts:1741; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249

## S57.02 Fetch-page tool.
- Should: The assistant can call a tool that fetches a given web page and reads its content, with the fetch shown in the transcript.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/url-fetch/url-fetch-tool.ts:69; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1945; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:568; apps/web/features/chat/components/messages/ToolTimeline.tsx:441; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:568; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836

## S57.03 Source-reader tool.
- Should: The assistant can call a tool that opens a cited source or document (PDF, Office file or page) by reference and reads its text.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome partial, api partial
- Code: apps/web/lib/prompts/prompt-manifest.ts:97; packages/ai/model-registry/catalog/routing-policies.json:161; apps/cli/src/documents.rs:125; apps/cli/src/documents.rs:181; apps/cli/src/documents.rs:56; apps/cli/src/features/exec/tools/file_ops/mod.rs:463; apps/cli/src/documents.rs:107; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2028
- Unfinished: web: switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval quality signal (packages/ai/model-registry/catalog/routing-policies.json:161) | desktop: switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval quality signal (packages/ai/model-registry/catalog/routing-policies.json:161) | mobile: switch-on (lead): advance tool.url_fetch_description@2 from internal to canary with an eval signal; server-only, the phone uses the same completions path | chrome: Same as web: url_fetch reads PDF and Office files by URL (d67ced36f),

## S57.04 File-search tool.
- Should: The assistant can call a tool that searches the user's files (by name or content) and returns matching paths or snippets.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/server/tools/file-search-tool.ts:64; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:793; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1952; packages/contracts/local-runtime/src/device-steps.ts:131; packages/contracts/local-runtime/src/device-steps.ts:138; packages/contracts/local-runtime/src/device-steps.ts:864; apps/web/lib/device-steps/device-tools.ts:118; apps/web/lib/device-steps/device-tools.ts:136

## S57.05 File-read tool.
- Should: The assistant can call a tool that reads the contents of a file it names (in a sandbox or on the user's machine).
- Status: web partial, desktop done, mobile partial, cli done, vscode done, chrome partial, api partial
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/chat/components/messages/ToolTimeline.tsx:441; packages/contracts/local-runtime/src/device-steps.ts:71; apps/desktop/electron/runtime/dispatcher.ts:724; apps/web/lib/e2b/gate.ts:20; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:365; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | mobile: switch-on: set AGI_E2B_EXECUTION=1 with E2B_API_KEY and the compute price; the phone reaches the same sandbox tools | chrome: The chat sandbox read_file tool runs only when AGI_E2B_EXECUTION=1 (default 0) with an E2B key and compute price set; until then the l

## S57.06 File-write tool.
- Should: The assistant can call a tool that creates or overwrites a file it names (in a sandbox or on the user's machine).
- Status: web partial, desktop done, mobile partial, cli done, vscode done, chrome partial, api partial
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/chat/components/messages/ToolTimeline.tsx:441; packages/contracts/local-runtime/src/device-steps.ts:85; apps/desktop/electron/runtime/dispatcher.ts:728; apps/web/lib/e2b/gate.ts:20; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:549; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | mobile: switch-on: set AGI_E2B_EXECUTION=1 with E2B_API_KEY and the compute price; the phone reaches the same sandbox tools | chrome: The chat sandbox write_file tool runs only when AGI_E2B_EXECUTION=1 (default 0) with an E2B key and compute price set; until then the

## S57.07 Spreadsheet tool.
- Should: The assistant can call a tool that creates a spreadsheet file (xlsx) the user can open or download.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639; apps/web/lib/hooks/useChatStream.ts:3541; apps/web/lib/services/managed-office-file-service.ts:106; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875; apps/mobile/stores/chat/chatExecutionStore.ts:1755; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249; apps/extension/src/features/side-panel/bubbles.ts:434; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:576

## S57.08 Document tool.
- Should: The assistant can call a tool that creates a document file (docx) the user can open or download.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639; apps/web/lib/hooks/useChatStream.ts:3541; apps/web/lib/services/managed-office-file-service.ts:94; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875; apps/mobile/stores/chat/chatExecutionStore.ts:1755; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249; apps/extension/src/features/side-panel/bubbles.ts:434; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:576

## S57.09 Presentation tool.
- Should: The assistant can call a tool that creates a presentation file (pptx) the user can open or download.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2639; apps/web/lib/hooks/useChatStream.ts:3541; apps/web/lib/services/managed-office-file-service.ts:100; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1875; apps/mobile/stores/chat/chatExecutionStore.ts:1755; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249; apps/extension/src/features/side-panel/bubbles.ts:434; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:576

## S57.10 Code-execution tool.
- Should: The assistant can call a tool that runs code it wrote and returns the output in the transcript.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2638; apps/web/lib/hooks/useChatStream.ts:3540; apps/web/lib/e2b/execution-tools.ts:194; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4440; apps/mobile/src/features/settings/capabilities/index.tsx:126; apps/mobile/stores/chat/chatExecutionStore.ts:1754; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249; apps/cli/src/tui/tui_app.rs:4865

## S57.11 Shell tool.
- Should: The assistant can call a tool that runs a shell command and returns its output and exit code.
- Status: web partial, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/chat/components/messages/ToolTimeline.tsx:441; packages/contracts/local-runtime/src/device-steps.ts:92; apps/desktop/electron/runtime/dispatcher.ts:748; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:552; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S57.12 Patch/edit tool.
- Should: The assistant can call a tool that edits part of an existing file (targeted replace or patch) rather than rewriting it.
- Status: web partial, desktop done, mobile partial, cli done, vscode done, chrome partial, api partial
- Code: apps/web/lib/e2b/gate.ts:16; packages/contracts/local-runtime/src/device-steps.ts:95; apps/web/lib/device-steps/device-tools.ts:99; apps/web/features/desktop-host/lib/device-steps.ts:215; apps/desktop/electron/runtime/filesystemService.ts:198; apps/desktop/electron/runtime/dispatcher.ts:871; apps/web/lib/e2b/gate.ts:20; apps/cli/src/tui/tui_app.rs:4865
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | mobile: switch-on: set AGI_E2B_EXECUTION=1 with E2B_API_KEY and the compute price; the phone reaches the same sandbox tools | chrome: The chat sandbox edit_file tool runs only when AGI_E2B_EXECUTION=1 (default 0) with an E2B key and compute price set; until then the l

## S57.13 Browser-navigation tool.
- Should: The assistant can call a tool that opens a URL in a real browser tab it controls.
- Status: web missing, desktop done, mobile missing, cli done, vscode done, chrome done
- Code: packages/contracts/local-runtime/src/device-steps.ts:205; apps/desktop/electron/browser/browserSteps.ts:71; apps/desktop/electron/runtime/dispatcher.ts:1072; apps/web/features/desktop-host/lib/device-steps.ts:186; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:565; apps/cli/src/features/exec/tools/mod.rs:702; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836

## S57.14 Browser-action tool.
- Should: The assistant can call tools that click, type or read in a real browser page it controls.
- Status: web missing, desktop done, mobile missing, cli done, vscode done, chrome done
- Code: packages/contracts/local-runtime/src/device-steps.ts:209; packages/contracts/local-runtime/src/device-steps.ts:213; apps/desktop/electron/browser/browserSteps.ts:71; apps/web/lib/device-steps/device-tools.ts:324; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:565; apps/cli/src/features/exec/tools/mod.rs:694; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836

## S57.15 Computer-action tool.
- Should: The assistant can call tools that see the screen and move, click and type on the user's computer.
- Status: web missing, desktop done, cli missing, vscode missing
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:441; packages/contracts/local-runtime/src/device-steps.ts:118; apps/desktop/electron/runtime/dispatcher.ts:837; apps/desktop/electron/runtime/dispatcher.ts:829

## S57.16 Image-generation tool.
- Should: The assistant can call an image-generation tool during a turn and the generated image appears in the transcript.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing, api missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5041; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2181; apps/web/app/api/media/image/lib/image-chat-tools.ts:317; apps/web/app/api/media/image/lib/image-chat-tools.ts:357; apps/web/app/api/media/image/lib/managed-image-generation.ts:117; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:39; apps/mobile/src/features/chat/utils/clarifyCard.ts:10; apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:607

## S57.17 Image-editing tool.
- Should: The assistant can call a tool that edits a supplied image (edit, inpaint, variation) and shows the result.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing, api missing
- Code: apps/web/app/api/media/image/lib/image-chat-tools.ts:353; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4550; apps/web/app/api/media/image/lib/managed-image-generation.ts:117; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:39; apps/mobile/src/features/chat/utils/clarifyCard.ts:10; apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:607

## S57.18 Video-generation tool.
- Should: The assistant can call a video-generation tool and the generated video appears in the conversation.
- Status: not applicable anywhere

## S57.19 Transcription tool.
- Should: The assistant can transcribe an audio recording into text (a transcription tool or endpoint), beyond composer dictation.
- Status: api done
- Code: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:697; apps/web/public/openapi.json:1249

## S57.20 Speech-generation tool.
- Should: The assistant can generate spoken audio from text (a speech tool or endpoint) and play or return it.
- Status: not applicable anywhere

## S57.21 Memory tool.
- Should: The assistant can call a memory tool to save, recall or delete a remembered fact during a turn.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/server/tools/memory-tools.ts:221; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:764; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1967; apps/cli/src/features/exec/tools/memory_tool.rs:61; apps/cli/src/features/exec/tools/memory_tool.rs:89; apps/cli/src/features/exec/tools/memory_tool.rs:121; apps/cli/src/features/exec/tools/mod.rs:641; apps/cli/src/platform/runtime/tool_catalog.rs:766

## S57.22 Calendar tool.
- Should: The assistant can call a calendar tool to read or create events in the user's calendar.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome partial, api partial
- Code: apps/web/lib/connectors/mcp-endpoints.ts:183; apps/web/lib/connectors/oauth-registry.ts:21; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/managed_approvals.rs:135; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2956
- Unfinished: web: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json; Outlook calendar needs the Microsoft OAuth app credentials (microsoft-graph.ts:360 is wired) | desktop: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json; Outlook calendar needs the Microsoft OAuth app cred

## S57.23 Messaging tool.
- Should: The assistant can call a messaging tool to read or send messages on a connected service (e.g. Slack) after approval.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:441; apps/web/lib/connectors/mcp-endpoints.ts:157; apps/web/app/api/llm/v1/chat/completions/route.ts:733; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/managed_approvals.rs:135; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2956

## S57.24 Scheduling tool.
- Should: The assistant can call a tool that creates, lists or deletes a scheduled task for the user.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/server/tools/schedule-tool.ts:115; apps/web/lib/server/tools/schedule-tool.ts:149; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:819; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1937; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:627; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:835

## S57.25 Agent-delegation tool.
- Should: The assistant can call a tool that delegates a sub-task to another agent and uses its result.
- Status: cli done, vscode done
- Code: apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/agent/chat.rs:1710; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836

## S57.26 Clarification/input tool.
- Should: The assistant can call a tool that asks the user a clarifying question (with choices) and waits for the answer.
- Status: web done, desktop done, mobile done, cli unverified, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:34; apps/web/lib/hooks/useChatStream.ts:821; apps/web/lib/services/clarify-tool-service.ts:11; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1935; apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:595; apps/mobile/stores/chat/chatExecutionStore.ts:2244; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5757; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1317

## S57.27 Approval-request tool.
- Should: The assistant can call a tool that explicitly asks the user to approve a plan or decision and waits for the answer.
- Status: cli done
- Code: apps/cli/src/features/exec/tools/task_registry/mod.rs:494

## S57.28 Tool discovery.
- Should: When more tools are connected than fit in a turn, the model is told which others exist and can load them on demand.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:441; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2690; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:152; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:581; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836; apps/extension/src/features/side-panel/bubbles.ts:537

## S57.29 Tool search.
- Should: The model or user can search the available tools by keyword and get matching tools with their descriptions.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/connectors/tool-search.ts:35; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:169; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3156; apps/web/public/openapi.json:758; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:581; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3343

## S57.30 Tool descriptions and schemas.
- Should: Each tool carries a readable description and typed parameter schema that the model uses and the user can inspect.
- Status: web done, desktop done, cli done, chrome done, api done
- Code: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:264; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:87; apps/cli/src/claude_parity.rs:1034; apps/cli/src/claude_parity.rs:127; apps/extension/src/side_panel.ts:12682; apps/web/app/connectors/page.tsx:13; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:354; apps/web/public/openapi.json:400

## S57.31 Tool argument preview.
- Should: Each tool call in the transcript shows the arguments it was called with (command, file, query or JSON).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:499; apps/web/features/chat/components/messages/ToolTimeline.tsx:441; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2614; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:368; apps/mobile/stores/chat/chatExecutionStore.ts:2523; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/tui/widgets/approval_overlay.rs:106; apps/cli/src/features/exec/tools/mod.rs:567

## S57.32 Tool-call progress.
- Should: While a tool runs the transcript shows it as running (with elapsed time), then completed or failed.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:561; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4048; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:179; apps/mobile/stores/chat/chatExecutionStore.ts:2523; apps/cli/src/tui/tui_app.rs:184; apps/cli/src/tui/tui_app.rs:5329; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5108; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2836

## S57.33 Tool result preview.
- Should: A finished tool call shows a short preview of its result in the transcript.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:521; apps/web/features/chat/components/messages/ToolTimeline.tsx:441; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2614; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:389; apps/mobile/stores/chat/chatExecutionStore.ts:2523; apps/cli/src/tui/tui_app.rs:4890; apps/cli/src/features/exec/tools/mod.rs:549; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5109

## S57.34 Tool result expansion.
- Should: The user can expand a tool call to see its full arguments and result, and collapse it again.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:587; packages/ui/unified-chat/src/components/ToolCallCard.tsx:521; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2614; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:411; apps/mobile/stores/chat/chatExecutionStore.ts:2523; apps/cli/src/tui/tui_app.rs:2605; apps/cli/src/tui/tui_app.rs:278; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6011

## S57.35 Tool error and retry.
- Should: A failed tool call shows its error, the error goes back to the model so it can retry or explain, and the user can retry.
- Status: cli done
- Code: apps/cli/src/claude_parity.rs:1098

## S57.36 Large-result references.
- Should: An oversized tool result is stored in full and replaced in context by a reference the model or user can open later.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:91; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3391; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3406; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5583; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1459; apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:77; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2416; apps/web/lib/e2b/execution-tools.ts:386

## S57.37 Tool receipt.
- Should: After tool calls run, the user can later review a record of which tool ran, with what input, and its outcome.
- Status: web done, desktop done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:247; apps/web/app/api/connectors/calls/route.ts:33; packages/ui/unified-chat/src/components/ToolCallCard.tsx:499; apps/cli/src/claude_parity.rs:1057; apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:41; apps/extension-vscode/src/extension.ts:209; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2041; apps/extension/src/features/side-panel/bubbles.ts:932

## S57.38 Per-tool cost and usage where exposed.
- Should: Where the product exposes costs, the user can see the cost or usage attributable to each tool call.
- Status: not applicable anywhere
