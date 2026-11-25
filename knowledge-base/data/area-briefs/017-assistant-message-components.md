# Area 17. Assistant-message components

40 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S17.01 Assistant/model identity.
- Should: Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant/model (R-n).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:1641; apps/web/features/chat/components/messages/MessageBubble.tsx:3144; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:288; apps/mobile/src/features/chat/components/MessageBubble.tsx:676; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:1506; apps/cli/src/tui/tui_app.rs:5226

## S17.02 Streaming answer body.
- Should: The answer body renders incrementally as tokens arrive, with markdown formatting.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2075; apps/web/lib/hooks/useChatStream.ts:2573; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:861; apps/mobile/stores/chat/chatExecutionStore.ts:2534; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:1588; apps/cli/src/tui/tui_app.rs:5144

## S17.03 Working indicator.
- Should: While the assistant works and before/while text arrives, a visible (and announced) working indicator is shown.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/TypingIndicator.tsx:9; apps/web/features/chat/components/messages/ChatMessageList.tsx:1806; apps/web/features/chat/components/messages/ChatMessageList.tsx:1891; apps/web/features/chat/components/messages/ChatMessageList.tsx:1192; apps/mobile/src/features/chat/components/StreamingIndicator.tsx:4; apps/mobile/src/features/chat/components/MessageBubble.tsx:861; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:1561

## S17.04 Reasoning-summary or activity-summary disclosure.
- Should: An answer offers a collapsible summary of the model's reasoning and/or the work it did (steps, tools), expandable on demand.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2555; apps/web/features/chat/components/messages/MessageBubble.tsx:1860; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:796; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:1551; apps/cli/src/tui/tui_app.rs:4865; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5826

## S17.05 Tool-activity section.
- Should: Tool calls made for the answer appear in a tool-activity section with each tool's name, status and result.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:1925; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:833; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:169; apps/cli/src/tui/tui_app.rs:4865; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5096; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5107

## S17.06 Source citations.
- Should: Claims in an answer carry citation markers that link to the sources the answer used.
- Status: web done, desktop done, mobile done, cli missing, chrome done, api done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; apps/web/features/chat/components/messages/MessageBubble.tsx:2076; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1003; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:651; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:860; apps/extension/src/side_panel.ts:12370

## S17.07 Sources footer.
- Should: A finished answer that used sources ends with a sources footer/list the user can open.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2737; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1003; apps/mobile/src/features/chat/components/MessageBubble.tsx:999; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/extension/src/features/side-panel/sources.ts:136; apps/extension/src/features/side-panel/bubbles.ts:462; apps/extension/src/features/side-panel/chat-state.ts:233

## S17.08 Generated-file cards.
- Should: Files the assistant produced appear as cards on the answer with name/type and open/download.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2285; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:351; apps/mobile/src/features/chat/components/MessageBubble.tsx:1021; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:6019; apps/extension/src/features/side-panel/generatedFiles.ts:40; apps/extension/src/features/side-panel/generatedFiles.ts:180

## S17.09 Artifact launch cards.
- Should: An answer that created an artifact shows a card that opens the artifact viewer/panel.
- Status: web done, desktop done, mobile done, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2329; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1021; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/extension/src/features/side-panel/generatedFiles.ts:59; apps/extension/src/features/side-panel/generatedFiles.ts:151; apps/extension/src/features/side-panel/bubbles.ts:456

## S17.10 Image results.
- Should: Images the assistant generated or returned render inline in the answer (viewable/downloadable).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2360; apps/web/features/chat/pages/WebChatPage.tsx:5744; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:880; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:3278; apps/cli/src/tui/tui_app.rs:4676; apps/extension/src/features/side-panel/generatedFiles.ts:104

## S17.11 Audio results.
- Should: Audio the assistant produced (speech, music, clips) plays inline in the answer with playback controls.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S17.12 Video results.
- Should: Videos the assistant generated play inline in the answer with controls and download.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2514; apps/web/features/chat/pages/WebChatPage.tsx:5746; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:932; apps/mobile/src/features/chat/components/MessageList.tsx:92

## S17.13 Interactive widgets.
- Should: Answers can contain interactive widgets (cards with choices, maps, actions) the user operates in place.
- Status: web done, desktop done, mobile done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2019; apps/web/features/chat/components/messages/MessageBubble.tsx:2131; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:986; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/extension/src/features/side-panel/bubbles.ts:140; apps/extension/src/features/side-panel/bubbles.ts:704; apps/extension/src/side_panel.ts:4427

## S17.14 Follow-up suggestions.
- Should: After an answer the product offers relevant follow-up prompts the user can pick.
- Status: web partial, desktop partial, mobile missing, cli missing, chrome missing
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1048
- Unfinished: web: switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built | desktop: switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built

## S17.15 Copy plain text.
- Should: One action copies the whole answer's text to the clipboard.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2830; apps/web/features/chat/components/messages/MessageBubble.tsx:1592; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1149; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/cli/src/tui/tui_app.rs:3492; apps/cli/src/tui/tui_app.rs:3512; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:586

## S17.16 Copy formatted answer.
- Should: A copy action places the answer on the clipboard with its formatting (rich text/HTML) so it pastes formatted into documents.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S17.17 Read aloud.
- Should: An answer can be read aloud with text-to-speech from a control on the answer.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3046; apps/web/features/chat/components/messages/ChatMessageList.tsx:1596; apps/web/lib/hooks/useTTS.ts:141; apps/mobile/src/features/chat/components/MessageBubble.tsx:1162; apps/mobile/src/features/chat/components/MessageBubble.tsx:427; apps/mobile/src/features/chat/components/MessageList.tsx:92

## S17.18 Stop read-aloud playback.
- Should: While an answer is being read aloud, the user can stop playback from the same place.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3046; apps/web/features/chat/components/messages/ChatMessageList.tsx:1598; apps/mobile/src/features/chat/components/MessageBubble.tsx:1162; apps/mobile/src/features/chat/components/MessageBubble.tsx:427; apps/mobile/src/features/chat/components/MessageList.tsx:92

## S17.19 Regenerate answer.
- Should: A completed answer can be regenerated in place, producing a new attempt for the same prompt.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2936; apps/web/features/chat/pages/WebChatPage.tsx:4437; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1177; apps/mobile/app/(app)/chat/[id].tsx:1085; apps/mobile/stores/chat/chatExecutionStore.ts:2931; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3655; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1008

## S17.20 Retry failed answer.
- Should: A failed answer shows a Retry control that re-runs the turn and replaces the failure with the new outcome.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/lib/hooks/useChatStream.ts:4966; apps/web/lib/hooks/useChatStream.ts:4973; apps/web/lib/hooks/useChatStream.ts:5043; apps/mobile/src/features/chat/components/MessageBubble.tsx:1045; apps/mobile/app/(app)/chat/[id].tsx:1085; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3343; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3417; apps/extension/src/features/side-panel/bubbles.ts:198

## S17.21 Continue truncated answer.
- Should: An answer cut off by the output limit offers Continue, which resumes the same answer.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1744; apps/web/features/chat/components/messages/ChatMessageList.tsx:1196; apps/web/features/chat/pages/WebChatPage.tsx:5728; apps/mobile/src/features/chat/utils/continuableAnswer.ts:19; apps/mobile/stores/chat/chatExecutionStore.ts:3897; apps/mobile/src/features/chat/components/MessageBubble.tsx:1886; apps/cli/src/claude_parity.rs:131

## S17.22 Rewrite with another model.
- Should: From an answer, the user can regenerate it with a different model in one step.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2959; apps/web/features/chat/pages/WebChatPage.tsx:4580; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:855; apps/extension/src/features/side-panel/bubbles.ts:396; apps/extension/src/side_panel.ts:5318; apps/extension/src/side_panel.ts:5981; apps/extension/src/side_panel.ts:5301

## S17.23 Shorten answer.
- Should: One action rewrites an answer shorter.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S17.24 Expand answer.
- Should: One action rewrites an answer longer/more detailed.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S17.25 Change tone.
- Should: One action rewrites an answer in a different tone.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S17.26 Revise selected text.
- Should: The user can select part of an answer and ask for that span to be revised or asked about.
- Status: web missing, desktop missing, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/src/features/chat/components/SelectTextSheet.tsx:116

## S17.27 Branch from answer.
- Should: From any answer, the user can branch a new conversation that keeps history up to that point and leaves the original unchanged.
- Status: web done, desktop done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2990; apps/web/features/chat/pages/WebChatPage.tsx:5737; apps/web/features/chat/hooks/use-conversation-branches.ts:105; apps/cli/src/lib.rs:1242; apps/cli/src/lib.rs:2754; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4053; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3656

## S17.28 Navigate answer variants.
- Should: When an answer has several attempts, the user can page between them (e.g. '2 of 3').
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:875; apps/web/features/chat/pages/WebChatPage.tsx:5739; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1620

## S17.29 Positive feedback.
- Should: A thumbs-up on an answer records positive feedback tied to that message.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2858; apps/web/features/chat/components/messages/MessageBubble.tsx:1022; apps/web/features/chat/components/messages/MessageBubble.tsx:976; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1188; apps/mobile/stores/chat/chatMessageStore.ts:597; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:618

## S17.30 Negative feedback.
- Should: A thumbs-down on an answer records negative feedback tied to that message.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2886; apps/web/features/chat/components/messages/MessageBubble.tsx:1022; apps/web/features/chat/components/messages/MessageBubble.tsx:976; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1194; apps/mobile/stores/chat/chatMessageStore.ts:597; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:618

## S17.31 Report answer.
- Should: An answer can be reported (e.g. harmful/incorrect) to the trust-and-safety intake from the answer itself.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3083; apps/web/features/chat/components/messages/MessageBubble.tsx:935; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1126; apps/mobile/src/features/chat/components/ReportFlagButton.tsx:31; apps/mobile/src/features/chat/components/MessageList.tsx:92

## S17.32 Share answer or conversation.
- Should: The user can share an answer or the conversation (link or system share sheet).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5535; apps/web/features/chat/pages/WebChatPage.tsx:5844; apps/web/features/chat/hooks/use-share-conversation.ts:177; apps/mobile/src/features/chat/components/MessageBubble.tsx:1172; apps/mobile/src/features/chat/components/FileExportButton.tsx:110; apps/mobile/src/features/chat/components/MessageList.tsx:92

## S17.33 Save answer to Project knowledge.
- Should: From an answer, the user can save it into a Project's knowledge/sources.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S17.34 Save answer as a document.
- Should: From an answer, the user can save it as an editable document inside the product.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S17.35 Export answer.
- Should: A single answer can be exported to a file (e.g. PDF, Markdown, text).
- Status: mobile done, cli done, vscode missing, chrome missing
- Code: apps/mobile/src/features/chat/components/FileExportButton.tsx:30; apps/mobile/src/features/chat/components/FileExportButton.tsx:95; apps/mobile/src/features/chat/components/MessageBubble.tsx:1226; apps/cli/src/repl/registry.rs:481; apps/cli/src/repl/registry.rs:510

## S17.36 Actual-model and usage details.
- Should: For each answer the user can see which model actually answered and its usage (tokens/cost/time).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3095; apps/web/features/chat/components/messages/MessageBubble.tsx:3144; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:330; apps/cli/src/tui/tui_app.rs:1586; apps/cli/src/tui/tui_app.rs:6527; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3675; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3028

## S17.37 Partial-result state.
- Should: When an answer fails after producing some output, the partial output is kept and visibly marked incomplete, with the reason.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:85; apps/web/features/chat/components/messages/ChatMessageList.tsx:1628; apps/web/features/chat/components/messages/MessageBubble.tsx:1886; apps/mobile/src/features/chat/utils/messageStreamError.ts:64; apps/mobile/src/features/chat/utils/messageStreamError.ts:160; apps/mobile/src/features/chat/components/MessageBubble.tsx:1045; apps/cli/src/agent/chat.rs:1499; apps/cli/src/errors.rs:86

## S17.38 Refusal state.
- Should: When the model/safety layer refuses, the answer shows a distinct refusal state (not a generic error or a normal answer), with a next step.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1774; apps/web/features/chat/components/messages/ChatMessageList.tsx:1238; apps/mobile/src/features/chat/components/MessageBubble.tsx:268; apps/cli/src/agent/chat.rs:315; apps/cli/src/errors.rs:91; apps/cli/src/tui/tui_app.rs:5234; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:324; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5126

## S17.39 Interrupted state.
- Should: An answer the user stopped (or that was interrupted) is marked as stopped, keeps what arrived, and offers to try again.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1758; apps/web/features/chat/components/messages/ChatMessageList.tsx:1207; apps/mobile/src/features/chat/components/MessageBubble.tsx:1528; apps/cli/src/tui/tui_app.rs:5240; apps/cli/src/tui/tui_app.rs:5244; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:330; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5126; apps/extension/src/features/side-panel/bubbles.ts:185

## S17.40 Empty-output error state.
- Should: A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:94; apps/web/lib/hooks/useChatStream.ts:1079; apps/web/features/chat/components/messages/MessageBubble.tsx:1886; apps/mobile/src/features/chat/utils/messageStreamError.ts:57; apps/mobile/stores/chat/chatExecutionStore.ts:1940; apps/cli/src/agent/chat.rs:324; apps/cli/src/errors.rs:90; apps/cli/src/tui/tui_app.rs:5234
