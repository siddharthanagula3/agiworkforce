# Area 19. Streaming and response-presentation states

29 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S19.01 Request accepted.
- Should: Right after sending, the surface shows that the request was accepted and work has started (before any output).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/TypingIndicator.tsx:9; apps/web/features/chat/components/messages/ChatMessageList.tsx:1192; apps/web/features/chat/components/messages/ChatMessageList.tsx:1891; apps/mobile/src/features/chat/components/MessageBubble.tsx:861; apps/mobile/src/features/chat/components/StreamingIndicator.tsx:4; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:1561; apps/cli/src/tui/tui_app.rs:4830

## S19.02 Waiting in queue.
- Should: A request that cannot start yet (queued behind a running turn or a server queue) is shown as waiting/queued.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/SendButton.tsx:113; apps/web/features/chat/components/Composer/SendButton.tsx:25; apps/mobile/src/features/chat/components/MessageBubble.tsx:684; apps/mobile/src/features/chat/components/ChatInput.tsx:154; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:505; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5031; apps/extension/src/side_panel.ts:6091; apps/extension/src/side_panel.ts:6120

## S19.03 Preparing context.
- Should: Before the model answers, the surface shows it is preparing (reading context/attachments/memory).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/TypingIndicator.tsx:9; apps/web/features/chat/components/messages/ChatMessageList.tsx:1192; apps/mobile/src/features/chat/components/MessageBubble.tsx:1272; apps/cli/src/tui/tui_app.rs:6445; apps/cli/src/agent/chat.rs:2196; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5081; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6037; apps/extension/src/side_panel.ts:5348

## S19.04 Searching sources.
- Should: While the assistant searches sources, the surface shows a searching state (ideally with the query).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:151; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:205; apps/web/lib/hooks/useChatStream.ts:1518; apps/mobile/src/features/chat/components/WebSearchToolCard.tsx:78; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:249; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:169; apps/cli/src/tui/tui_app.rs:4865

## S19.05 Running code.
- Should: While code runs, the surface shows a running-code state for that step.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:70; apps/web/features/chat/components/messages/MessageBubble.tsx:1994; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:831; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:169; apps/cli/src/tui/tui_app.rs:4865; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5643

## S19.06 Calling a connected service.
- Should: While a connected service (connector/MCP tool) is called, the surface names the service and shows the call in progress.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:392; apps/web/features/chat/components/messages/MessageBubble.tsx:1860; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:831; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:169; apps/cli/src/tui/tui_app.rs:4865; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5096

## S19.07 Waiting for approval.
- Should: When a step needs the user's approval, the turn visibly pauses in a waiting-for-approval state with approve/deny controls.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:329; apps/web/features/chat/components/messages/ChatMessageList.tsx:1035; apps/web/features/chat/components/messages/ChatMessageList.tsx:1567; apps/mobile/src/features/chat/components/MessageBubble.tsx:845; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:1573; apps/cli/src/tui/approval_broker.rs:200; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4636

## S19.08 Waiting for user input.
- Should: When the assistant needs information from the user mid-task, it shows a waiting-for-input state with a way to answer.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done, api done
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:78; apps/web/features/chat/components/messages/MessageBubble.tsx:2019; apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:593; apps/cli/src/tui/tui_app.rs:945; apps/cli/src/tui/tui_app.rs:1003; apps/extension/src/features/side-panel/connectorInputForm.ts:305; apps/extension/src/features/side-panel/bubbles.ts:1004; apps/extension/src/side_panel.ts:5993

## S19.09 Receiving first output.
- Should: The moment the first output arrives, the waiting indicator gives way to the answer.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/hooks/useChatStream.ts:1678; apps/web/features/chat/components/messages/ChatMessageList.tsx:1192; apps/mobile/src/features/chat/components/MessageBubble.tsx:859; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:1571; apps/cli/src/tui/tui_app.rs:1588; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5041; apps/extension/src/side_panel.ts:10808

## S19.10 Streaming text.
- Should: Text appears progressively while the model streams.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2075; apps/web/lib/hooks/useChatStream.ts:2573; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:859; apps/mobile/stores/chat/chatExecutionStore.ts:2534; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:1588; apps/cli/src/tui/tui_app.rs:5144

## S19.11 Streaming structured output.
- Should: Structured output (markdown lists, tables, code blocks) renders correctly while it is still streaming.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2075; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/lib/hooks/useChatStream.ts:2573; apps/mobile/src/features/chat/components/MessageBubble.tsx:658; apps/mobile/stores/chat/chatExecutionStore.ts:2534; apps/cli/src/tui/tui_app.rs:3959; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5046; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051

## S19.12 Building an artifact.
- Should: While an artifact/file is being produced, the surface shows it is being built.
- Status: web done, desktop done, mobile missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2136; apps/web/features/chat/components/messages/ChatMessageList.tsx:731

## S19.13 Generating media.
- Should: While an image/video is generated, the surface shows generation progress.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2360; apps/web/features/chat/pages/WebChatPage.tsx:5744; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:867; apps/mobile/src/features/chat/components/MessageBubble.tsx:894; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:5327

## S19.14 Saving results.
- Should: After output completes, the surface shows results being saved/synced and when they are saved.
- Status: cli missing, vscode missing, chrome done
- Code: apps/extension/src/side_panel.ts:356; apps/extension/src/side_panel.ts:386

## S19.15 Completed.
- Should: A finished turn is clearly shown as completed (indicator stops; completion is announced/labelled).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1052; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:336; apps/web/features/chat/components/messages/ChatMessageList.tsx:1567; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:92; apps/mobile/src/features/chat/components/MessageBubble.tsx:1143; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:5226; apps/cli/src/tui/tui_app.rs:1506

## S19.16 Partially completed.
- Should: A run that finished with some steps failed is shown as partially completed, distinct from success and failure.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:335; apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; apps/web/features/chat/components/messages/MessageBubble.tsx:1860; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:111; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:384; apps/cli/src/tui/tui_app.rs:169; apps/cli/src/tui/tui_app.rs:4885; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5833

## S19.17 Cancel requested.
- Should: After the user presses stop, the surface shows the stop is in progress until it takes effect.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/lib/cancel-cloud-run.ts:7; apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:14; apps/web/lib/hooks/useChatStream.ts:4679; apps/web/lib/hooks/useChatStream.ts:4680; apps/web/lib/hooks/useChatStream.test.tsx:1271; apps/web/lib/hooks/useChatStream.ts:4285; apps/web/lib/hooks/useChatStream.ts:4299; apps/mobile/src/features/chat/components/MessageBubble.tsx:1021

## S19.18 Cancelled.
- Should: A stopped turn ends in a clear cancelled/stopped state that keeps what arrived.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1758; apps/web/features/chat/components/messages/ChatMessageList.tsx:1207; apps/web/lib/hooks/useChatStream.ts:4683; apps/web/lib/hooks/useChatStream.test.tsx:1646; apps/web/lib/workflows/cloud-agent-workflow.liveness.test.ts:259; apps/mobile/src/features/chat/components/MessageBubble.tsx:1528; apps/cli/src/tui/tui_app.rs:5240; apps/cli/src/tui/tui_app.rs:5244

## S19.19 Reconnecting.
- Should: When the connection drops mid-turn, the surface shows it is reconnecting and resumes when possible.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/stores/stream-phase-store.ts:3; apps/web/lib/hooks/useChatStream.ts:2464; apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:15; apps/web/features/chat/components/messages/MessageBubble.tsx:2969; apps/mobile/src/features/chat/components/MessageBubble.tsx:1021; apps/extension/src/side_panel.ts:5663; apps/extension/src/side_panel.ts:12253; apps/extension/src/features/side-panel/bubbles.ts:438

## S19.20 Resuming existing work.
- Should: Work that was already running is picked up again (after reconnect/reopen) and shown as resuming rather than restarting.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/lib/hooks/useChatStream.ts:2335; apps/web/lib/hooks/useChatStream.ts:2235; apps/web/features/chat/components/messages/MessageBubble.tsx:1860; apps/web/lib/hooks/useChatStream.ts:3670; apps/web/lib/hooks/useChatStream.ts:3665; apps/web/lib/hooks/useChatStream.test.tsx:1335; apps/web/lib/hooks/useChatStream.test.tsx:1358; apps/mobile/app/(app)/chat/[id].tsx:303

## S19.21 Rate-limited.
- Should: A rate-limited turn says so, with when to retry if known.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/lib/turn-error-notice.ts:102; apps/web/features/chat/lib/turn-error-notice.ts:72; apps/mobile/src/features/chat/utils/messageStreamError.ts:170; apps/mobile/src/features/chat/utils/messageStreamError.ts:128; apps/cli/src/errors.rs:322; apps/cli/src/errors.rs:375; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:308; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:244

## S19.22 Budget exhausted.
- Should: A turn blocked by an exhausted budget/plan limit says so and points to the fix (upgrade/usage).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/lib/turn-error-notice.ts:125; apps/web/features/chat/lib/turn-error-notice.ts:95; apps/mobile/app/(app)/chat/[id].tsx:1605; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/errors.rs:347; apps/cli/src/errors.rs:461; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:300; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:243

## S19.23 Authentication expired.
- Should: A turn that fails because sign-in expired says so and offers to sign in again.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/lib/turn-error-notice.ts:124; apps/web/features/chat/lib/turn-error-notice.ts:94; apps/mobile/stores/chat/chatExecutionStore.ts:996; apps/mobile/stores/chat/chatExecutionStore.ts:1170; apps/cli/src/errors.rs:282; apps/cli/src/errors.rs:448; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:295; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:240

## S19.24 Required device unavailable.
- Should: When a step needs a device that is offline (e.g. the user's desktop or local runtime), the turn shows it is waiting for / cannot reach that device.
- Status: web done, desktop done, mobile done, vscode done, chrome done, api done
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:356; apps/web/features/chat/components/messages/MessageBubble.tsx:1860; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:102; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:150; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:383; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3199; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5218; apps/extension/src/features/side-panel/bubbles.ts:840

## S19.25 Provider unavailable.
- Should: When the model provider is down/unavailable, the turn says so and offers retry or another model.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/lib/turn-error-notice.ts:104; apps/web/features/chat/lib/turn-error-notice.ts:76; apps/mobile/src/features/chat/components/MessageBubble.tsx:1081; apps/mobile/src/features/chat/components/MessageBubble.tsx:1045; apps/cli/src/errors.rs:344; apps/cli/src/errors.rs:776; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:316; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5126

## S19.26 Failed with recoverable input.
- Should: A turn that fails because of the user's input (too long, bad attachment) explains what to change so the user can fix and resend.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/lib/turn-error-notice.ts:110; apps/web/features/chat/lib/turn-error-notice.ts:84; apps/mobile/src/features/chat/components/MessageBubble.tsx:1071; apps/mobile/src/features/chat/utils/messageStreamError.ts:30; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:330; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:380; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:424; apps/cli/src/errors.rs:313

## S19.27 Failed after useful partial output.
- Should: A turn that fails after producing useful output keeps that output and marks the failure.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:85; apps/web/features/chat/components/messages/ChatMessageList.tsx:1628; apps/mobile/src/features/chat/utils/messageStreamError.ts:64; apps/mobile/src/features/chat/utils/messageStreamError.ts:160; apps/cli/src/errors.rs:86; apps/cli/src/agent/chat.rs:1499; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:318; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5126

## S19.28 Session restored after app restart.
- Should: After the app restarts, the conversation and each turn's final state (done/failed/stopped) come back as they were.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:245; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:160; apps/mobile/stores/chat/chatMessageStore.ts:1150; apps/mobile/app/(app)/chat/[id].tsx:1432; apps/cli/src/tui/tui_app.rs:3550; apps/cli/src/tui/tui_app.rs:2708; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5275; apps/extension-vscode/src/core/commandSetup.ts:1162

## S19.29 Background work continuing after UI closure.
- Should: Work keeps running after the UI is closed and its result is there (or resumes) when the user returns.
- Status: web done, desktop done, mobile unverified, cli done, vscode unverified, chrome done, api done
- Code: apps/web/app/api/llm/v1/chat/completions/route.ts:860; apps/web/lib/hooks/useChatStream.ts:2335; apps/web/features/chat/components/messages/MessageBubble.tsx:1860; apps/cli/src/background.rs:153; apps/cli/src/background.rs:383; apps/cli/src/background.rs:212; apps/cli/src/lib.rs:1536; apps/cli/src/lib.rs:7610
