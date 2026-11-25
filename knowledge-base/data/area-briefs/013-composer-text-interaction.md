# Area 13. Composer text interaction

41 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S13.01 Plain-text entry.
- Should: The user can type a plain-text message into the composer and send it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerInput.tsx:128; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2287; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4290; apps/mobile/src/features/chat/components/ChatInput.tsx:1043; apps/mobile/src/features/chat/components/ChatInput.tsx:433

## S13.02 Multiline entry.
- Should: The composer accepts multi-line text (line breaks are kept in the sent message).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerInput.tsx:128; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3517; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4290; apps/mobile/src/features/chat/components/ChatInput.tsx:1043; apps/mobile/src/features/chat/components/ChatInput.tsx:1059

## S13.03 Automatic height growth.
- Should: The composer grows taller automatically as the text grows, up to a cap, then scrolls.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerInput.tsx:128; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2004; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4290; apps/mobile/src/features/chat/components/ChatInput.tsx:1043; apps/mobile/src/features/chat/components/ChatInput.tsx:612

## S13.04 Manual expansion.
- Should: The user can manually enlarge the composer (an expand control or resize handle) beyond its automatic height.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4477; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3680; apps/web/features/chat/components/Composer/ComposerInput.tsx:59; apps/mobile/src/features/chat/components/ChatInput.tsx:955; apps/mobile/src/features/chat/components/ChatInput.tsx:667; apps/mobile/app/(app)/(tabs)/chat.tsx:903

## S13.05 Full-screen prompt editing.
- Should: The user can open the draft in a full-screen (or external) editor and return it to the composer.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4477; apps/web/features/chat/components/Composer/ComposerInput.tsx:73; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3652; apps/mobile/src/features/chat/components/ChatInput.tsx:1248; apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx:21; apps/mobile/app/(app)/(tabs)/chat.tsx:903; apps/cli/src/tui/tui_app.rs:4774; apps/cli/src/tui/composer_edits.rs:140

## S13.06 Send button.
- Should: A visible send button submits the composed message (and is disabled with a reason when sending is blocked).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5186; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2706; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:1236; apps/mobile/src/features/chat/components/ChatInput.tsx:651; apps/mobile/app/(app)/(tabs)/chat.tsx:903

## S13.07 Stop button.
- Should: While a reply is generating, a stop control ends it (keeping what was produced).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5186; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2661; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:1236; apps/mobile/src/features/chat/components/ChatInput.tsx:651; apps/mobile/app/(app)/(tabs)/chat.tsx:903

## S13.08 Enter-to-send preference.
- Should: The user can choose in settings whether Enter sends or inserts a newline (e.g. Cmd/Ctrl+Enter to send).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S13.09 Newline shortcut.
- Should: A keyboard shortcut (e.g. Shift+Enter) inserts a newline without sending.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerInput.tsx:128; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3517; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4290; apps/mobile/src/features/chat/components/ChatInput.tsx:1043; apps/mobile/src/features/chat/components/ChatInput.tsx:1064

## S13.10 Undo and redo.
- Should: Standard undo/redo shortcuts (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) revert and reapply edits in the composer.
- Status: web done, desktop done, mobile unverified, cli done, vscode unverified, chrome done
- Code: packages/ui/unified-chat/src/composer-editor/extensions/index.ts:25; apps/web/features/chat/lib/composer-editor-gate.ts:46; apps/cli/src/tui/tui_app.rs:2538; apps/cli/src/tui/composer_edits.rs:38; apps/extension/src/features/side-panel/composerText.ts:1; apps/extension/src/features/side-panel/voice.ts:179; apps/extension/src/side_panel.ts:11779

## S13.11 Clipboard paste.
- Should: Pasting from the clipboard inserts text into the composer and turns pasted files/images into attachments.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerInput.tsx:128; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1935; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4290; apps/mobile/src/features/chat/components/ChatInput.tsx:1043; apps/mobile/src/features/chat/components/ChatInput.tsx:433

## S13.12 Rich-text paste normalization.
- Should: Pasting formatted (HTML/rich) text yields clean plain text in the composer, without styling or markup.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerInput.tsx:128; packages/platform/utils/src/composerPaste.ts:84; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4290; apps/mobile/src/features/chat/components/ChatInput.tsx:1043; apps/mobile/src/features/chat/components/ChatInput.tsx:433

## S13.13 Code-paste formatting.
- Should: Pasted source code is recognized and wrapped in a code block (with a way to paste it as plain text).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3700; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1945; packages/platform/utils/src/composerPaste.ts:156; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13

## S13.14 Long-prompt handling.
- Should: Very long input is handled deliberately (turned into an attachment, collapsed, or clearly limited with feedback) instead of flooding the composer.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3665; packages/platform/utils/src/composerPaste.ts:38; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:209; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:433; apps/mobile/src/features/chat/components/ChatInput.tsx:774

## S13.15 Character or token indicators where useful.
- Should: Where length matters, the composer shows a character or token/context indicator before sending.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4325; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3574; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/app/(app)/chat/[id].tsx:1457; apps/mobile/src/features/chat/components/ContextWarningChip.tsx:14; apps/cli/src/tui/tui_app.rs:2019

## S13.16 Draft autosave.
- Should: The unsent composer text is saved automatically while typing, so it survives a reload or crash.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome partial
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3283; apps/web/features/chat/components/Composer/composer-draft-storage.ts:188; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3315; apps/mobile/src/features/chat/components/ChatInput.tsx:1043; apps/mobile/src/features/chat/components/ChatInput.tsx:280; apps/mobile/src/features/chat/draftStore.ts:1; apps/mobile/app/(app)/(tabs)/chat.tsx:903; apps/extension/src/side_panel.ts:14187
- Unfinished: chrome: Chrome keeps text in the current browser session. Recovery after Chrome restarts and across devices is open.

## S13.17 Draft recovery.
- Should: After a reload, crash or failed send, the unsent text is put back in the composer (with a notice).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome partial
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3315; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:581; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:167; apps/mobile/src/features/chat/components/ChatInput.tsx:143; apps/mobile/src/features/chat/components/ChatInput.tsx:399; apps/mobile/app/(app)/(tabs)/chat.tsx:903; apps/extension/src/side_panel.ts:9914; apps/extension/src/side_panel.ts:9324
- Unfinished: chrome: Same-session panel reopen, reload, and delayed-read handling verified with a Chromium extension fixture. Authenticated side-panel acceptance and recovery after Chrome restarts remain open.

## S13.18 Draft isolation by conversation.
- Should: Each conversation keeps its own unsent draft; switching chats never carries text into another chat.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome partial
- Code: apps/web/features/chat/components/Composer/ComposerInput.tsx:128; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3158; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4290; apps/mobile/app/(app)/chat/[id].tsx:1510; apps/mobile/src/features/chat/components/ChatInput.tsx:164
- Unfinished: chrome: Text is keyed by chat, account, and login session. Chromium verified isolation, including keyboard undo and Temporary Chat, in an extension fixture. Authenticated history navigation in the side panel remains unverified.

## S13.19 Prompt history in terminal interfaces.
- Should: In the terminal, Up/Down (and a search key) recall previously sent prompts into the composer.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:2661; apps/cli/src/tui/prompt_history.rs:43

## S13.20 Prompt suggestions.
- Should: The product offers prompt suggestions (e.g. follow-up questions) that the user can pick to fill or send the next message.
- Status: web partial, desktop partial, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:637
- Unfinished: web: switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built | desktop: switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built

## S13.21 Prompt-template insertion.
- Should: The user can insert a saved prompt template (e.g. a custom command) into the composer, filling in their own text.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome done
- Code: apps/web/features/settings/components/CustomCommandsSettings.tsx:85; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:160; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2489; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4131; apps/web/features/settings/sections/GeneralSection.tsx:887

## S13.22 Slash-command autocomplete.
- Should: Typing "/" opens a filtered list of commands that can be chosen with keyboard or pointer.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4129; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2249; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:783; apps/mobile/src/features/chat/components/ChatInput.tsx:619; apps/mobile/app/(app)/(tabs)/chat.tsx:903

## S13.23 Skill invocation.
- Should: The user can explicitly invoke a Skill from the composer so the next message runs with it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3814; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2607; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2972; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/app/(app)/(tabs)/chat.tsx:1062; apps/mobile/app/(app)/chat/[id].tsx:1928

## S13.24 Agent or assistant mention.
- Should: The user can address a message to a specific agent or assistant by mentioning or selecting it in the composer.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:2974; apps/cli/src/mentions.rs:364; apps/extension-vscode/package.json:724; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:586; apps/extension-vscode/src/core/chatSetup.ts:46

## S13.25 Project mention.
- Should: Typing a mention in the composer can reference a project, scoping the message to it.
- Status: web done, desktop done, mobile missing, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4205; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2420; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/extension/src/side_panel.ts:11848; apps/extension/src/side_panel.ts:11977; apps/extension/src/side_panel.ts:11990

## S13.26 File mention.
- Should: Typing a mention in the composer can reference a file, whose contents are included with the message.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2501; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2512; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2657; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4638; apps/cli/src/tui/tui_app.rs:2509; apps/cli/src/mentions.rs:251; apps/cli/src/lib.rs:4636; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5485

## S13.27 Folder mention.
- Should: Typing a mention in the composer can reference a folder, whose contents are made available to the message.
- Status: web missing, desktop done, mobile missing, cli done, vscode missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2525; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2664; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4722; apps/web/features/chat/hooks/use-mention-folders.ts:48; apps/cli/src/mentions.rs:285; apps/cli/src/mentions.rs:372; apps/cli/src/mentions.rs:65

## S13.28 Repository mention.
- Should: Typing a mention in the composer can reference a code repository (e.g. a connected GitHub repo) as context.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S13.29 Browser-tab mention.
- Should: The user can reference an open browser tab (choosing which one) as context for the message.
- Status: desktop done, chrome done
- Code: apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:332; apps/desktop/electron/browser/commandGate.ts:89; apps/extension/src/side_panel.ts:11848; apps/extension/src/side_panel.ts:11993; apps/extension/src/side_panel.ts:5791; apps/extension/src/side_panel.ts:11813

## S13.30 Connected-app mention.
- Should: The user can reference a connected app (connector/MCP server) or one of its resources inline in the composer.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2475; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2594; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2537; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4489; apps/cli/src/agent/mod.rs:847; apps/cli/src/tui/tui_app.rs:5919

## S13.31 Context chips.
- Should: Context attached to the next message (skill, project, folder, files, page) shows as removable chips in the composer.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3814; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:735; apps/mobile/src/features/chat/components/ChatInput.tsx:731; apps/mobile/app/(app)/(tabs)/chat.tsx:920; apps/cli/src/tui/tui_app.rs:1700

## S13.32 Selected-source chips.
- Should: Sources chosen for the next message (e.g. web search, connector resources, a page) are shown as chips before sending.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3830; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3845; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:826; apps/mobile/src/features/chat/components/ChatInput.tsx:218; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2466

## S13.33 Selected-tool chips.
- Should: Tools switched on for the next message (e.g. research, code, office files) are shown as chips near the composer.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4617; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3618; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:794; apps/mobile/src/features/chat/components/ChatInput.tsx:210; apps/mobile/app/(app)/(tabs)/chat.tsx:903

## S13.34 Output-format selection.
- Should: Before sending, the user can choose the output format for the reply (e.g. table, document, code, slides).
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:726; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:762; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2203; apps/web/lib/hooks/useChatStream.ts:3806; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5240; apps/web/lib/chat-output-format.ts:23; apps/mobile/stores/chat/chatExecutionStore.ts:2243

## S13.35 Attachment menu.
- Should: A "+" (attach) menu in the composer lists the ways to add files, media and context.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4408; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4358; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:984; apps/mobile/src/features/chat/components/ChatInput.tsx:659; apps/mobile/app/(app)/(tabs)/chat.tsx:903

## S13.36 Dictation control.
- Should: A microphone control dictates speech into the composer text (without sending) for review.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5165; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1603; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:1133; apps/mobile/src/features/chat/components/ChatInput.tsx:558; apps/mobile/app/(app)/(tabs)/chat.tsx:903

## S13.37 Voice-conversation control.
- Should: A control starts a hands-free voice conversation (speak, hear the reply) from the composer.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5181; apps/web/features/chat/pages/WebChatPage.tsx:5662; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1640; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:1216; apps/mobile/app/(app)/(tabs)/chat.tsx:763

## S13.38 Queued next prompt.
- Should: While a reply is still generating, the user can type and queue the next message, which sends when the reply finishes.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3732; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2996; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3349; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:1204; apps/mobile/src/features/chat/components/ChatInput.tsx:313

## S13.39 Edit or cancel queued prompt.
- Should: A queued message can be edited or cancelled before it is sent.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3753; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3398; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:975; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4276; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1041

## S13.40 Mid-task steering input.
- Should: While an agent is working, the user can send guidance that steers the running task without stopping it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:567; apps/web/features/chat/components/research/ResearchActivity.tsx:580; apps/web/features/chat/pages/WebChatPage.tsx:5057; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:447; apps/mobile/src/features/chat/components/RunSteerInput.tsx:25; apps/cli/src/tui/tui_app.rs:3023; apps/cli/src/tui/tui_app.rs:5519; apps/cli/src/tui/tui_app.rs:4755

## S13.41 Separate side question that does not modify the main task.
- Should: The user can ask a side question that is answered without being added to (or changing) the main task.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:5048; apps/cli/src/tui/tui_app.rs:3053; apps/cli/src/agent/chat.rs:1152
