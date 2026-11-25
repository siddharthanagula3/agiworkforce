# Area 14. Attachment intake components

36 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S14.01 Device file picker.
- Should: The composer opens the device file chooser and the chosen file is attached to the next message.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:647; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5228; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1818; apps/web/features/chat/pages/WebChatPage.tsx:2022; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/hooks/use-attachments.ts:407; packages/contracts/cloud-contracts/src/chat-attachments.ts:321; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:382

## S14.02 Drag-and-drop intake.
- Should: Dropping files onto the chat attaches them to the next message.
- Status: web done, desktop done, mobile missing, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651; apps/web/features/chat/components/Composer/DragDropOverlay.tsx:50; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1818; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4982; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4911; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1258; apps/extension/src/side_panel.ts:11716

## S14.03 Paste-image intake.
- Should: Pasting an image from the clipboard into the composer attaches it as an image.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4297; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1935; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/cli/src/tui/tui_app.rs:2477; apps/cli/src/tui/tui_app.rs:494; apps/cli/src/tui/tui_app.rs:1801; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4992; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4911

## S14.04 Camera capture.
- Should: The composer offers a camera control that takes a photo and attaches it.
- Status: web missing, desktop missing, mobile done, chrome missing
- Code: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:366; apps/mobile/app/(app)/(tabs)/chat.tsx:584; apps/mobile/app/(app)/(tabs)/chat.tsx:927; apps/mobile/src/features/chat/components/ChatInput.tsx:247

## S14.05 Photo-library selection.
- Should: The user can pick one or more photos from the photo library and attach them.
- Status: web done, desktop done, mobile done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:71; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:647; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5228; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1818; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:375; apps/mobile/app/(app)/(tabs)/chat.tsx:612; apps/mobile/app/(app)/(tabs)/chat.tsx:927

## S14.06 Screenshot capture.
- Should: A composer control captures the screen and attaches the screenshot to the next message.
- Status: web done, desktop done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1104; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4971; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1106; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1952; apps/desktop/electron/main.ts:631; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:857; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4461; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1827

## S14.07 Window capture.
- Should: The user can pick a single application window and attach a capture of it.
- Status: web done, desktop done, cli missing, vscode missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1104; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4971; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1952; apps/desktop/electron/main.ts:631; apps/desktop/electron/main.ts:642; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:857

## S14.08 URL attachment.
- Should: The user can attach a web page by its URL so its content is used as context for the message.
- Status: cli done, vscode done, chrome done
- Code: apps/cli/src/tui/tui_app.rs:5397; apps/cli/src/repl/mod.rs:786; apps/extension-vscode/src/data/composerContext.ts:100; apps/extension/src/side_panel.ts:12193; apps/extension/src/side_panel.ts:12246; apps/extension/src/side_panel.ts:5834

## S14.09 Cloud-file picker.
- Should: The user can browse a cloud drive (Google Drive, OneDrive, Dropbox) from the composer and attach a file from it.
- Status: web missing, desktop missing, vscode missing, chrome missing

## S14.10 Library-file picker.
- Should: The user can pick a file already in their product Library and attach it to a message.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5312; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:170; apps/web/features/library/components/LibraryView.tsx:195; apps/web/features/chat/pages/WebChatPage.tsx:1152; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:212; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:229; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:111

## S14.11 Repository attachment.
- Should: The user can attach a code repository (e.g. a GitHub repo) as the context for a task.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/code/components/CodeComposer.tsx:590; apps/web/features/code/components/CodeComposer.tsx:486; apps/web/features/code/services/cloud-code-api.ts:363; apps/cli/src/lib.rs:417; apps/cli/src/tui/tui_app.rs:464; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2710; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:739

## S14.12 Folder attachment.
- Should: The user can attach a whole folder so the assistant can use the files inside it.
- Status: cli done, vscode done
- Code: apps/cli/src/claude_parity.rs:144; apps/cli/src/claude_parity.rs:238; apps/cli/src/tui/tui_app.rs:4090; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2710; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:739

## S14.13 Audio attachment.
- Should: The user can attach an audio file (e.g. MP3, M4A, WAV) and the model receives it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S14.14 Video attachment.
- Should: The user can attach a video file and the model receives it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S14.15 Multiple-file selection.
- Should: One pick action can select several files, and all of them are attached.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5231; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5228; apps/web/features/chat/hooks/use-attachments.ts:148; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/mobile/app/(app)/(tabs)/chat.tsx:697; apps/mobile/app/(app)/chat/[id].tsx:1054; apps/cli/src/claude_parity.rs:145; apps/cli/src/claude_parity.rs:277

## S14.16 Attachment thumbnail.
- Should: An attached image shows a small visual thumbnail in the composer before sending.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:191; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3891; apps/web/features/chat/hooks/use-attachments.ts:148; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:101; apps/mobile/src/features/chat/components/ChatInput.tsx:773; apps/mobile/src/features/chat/components/ChatInput.tsx:247; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5344

## S14.17 File-type icon.
- Should: Each non-image attachment shows an icon matching its file type (PDF, spreadsheet, code, other).
- Status: web done, desktop done, mobile done, cli missing, vscode done
- Code: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:38; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:226; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3891; apps/web/features/chat/hooks/use-attachments.ts:148; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:85; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:218; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5322

## S14.18 Filename and file-size metadata.
- Should: Each attachment shows its file name and size before sending.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:200; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:267; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:187; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:240; apps/cli/src/tui/tui_app.rs:592; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5385

## S14.19 Upload progress.
- Should: While a file uploads, its chip shows that the upload is in progress.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:109; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3879; apps/web/features/chat/pages/WebChatPage.tsx:2024; packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:175; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:182; apps/mobile/src/features/chat/upload/uploadAttachment.ts:17; apps/mobile/src/features/chat/components/ChatInput.tsx:773

## S14.20 Parsing progress.
- Should: After upload, the attachment shows that its content is being read or extracted, until it is ready.
- Status: web missing, desktop missing, mobile missing

## S14.21 Indexing progress.
- Should: A file added to searchable knowledge shows indexing progress and whether indexing finished or failed.
- Status: web done, desktop done, mobile missing
- Code: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:557; apps/web/features/projects/components/KnowledgeFilesPanel.tsx:118; apps/web/features/projects/components/ProjectSettingsDialog.tsx:283

## S14.22 Ready-to-use state.
- Should: The composer makes clear when an attachment is ready and the message can be sent with it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1904; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:118; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3891; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:182; apps/mobile/src/features/chat/components/ChatInput.tsx:299; apps/mobile/src/features/chat/components/ChatInput.tsx:773; apps/cli/src/tui/tui_app.rs:3744; apps/cli/src/tui/tui_app.rs:3704

## S14.23 Partial-extraction notice.
- Should: When only part of a file could be read or it was cut to a size limit, the user is told.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:473; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:542; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3182; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:873; apps/web/lib/hooks/useChatStream.ts:3880; apps/web/features/chat/components/messages/MessageBubble.tsx:2514; apps/mobile/services/streaming.ts:37; apps/cli/src/claude_parity.rs:278

## S14.24 Unsupported-file notice.
- Should: Adding a file type the chat cannot read shows a notice naming the file and why.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/hooks/use-attachments.ts:185; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:778; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3655; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/mobile/src/features/chat/utils/attachmentValidation.ts:61; apps/mobile/src/features/chat/components/ChatInput.tsx:247; apps/mobile/src/features/chat/components/ChatInput.tsx:248; apps/cli/src/tui/tui_app.rs:471

## S14.25 Password-protected-file notice.
- Should: A password-protected file produces a notice that says it is locked and how to fix it.
- Status: web done, desktop done, mobile done
- Code: apps/web/lib/server/pdf-attachment-content.ts:264; apps/web/lib/server/pdf-attachment-content.ts:40; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:456; apps/mobile/services/attachmentContext.ts:27

## S14.26 Upload retry.
- Should: A failed upload offers Retry on that file, which uploads it again.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:125; apps/web/features/chat/pages/WebChatPage.tsx:2145; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3879; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:209; apps/mobile/src/features/chat/components/ChatInput.tsx:491; apps/mobile/src/features/chat/components/ChatInput.tsx:773

## S14.27 Upload cancellation.
- Should: While a file is uploading the user can cancel that upload.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:2045; apps/web/features/chat/pages/WebChatPage.tsx:2344; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4032; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:100; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:68; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:172; apps/mobile/src/features/chat/upload/uploadAttachment.ts:17

## S14.28 Attachment removal.
- Should: Each attachment can be removed before sending, and a removed file is not sent.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:185; apps/web/features/chat/hooks/use-attachments.ts:226; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3891; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:68; apps/mobile/src/features/chat/components/ChatInput.tsx:486; apps/mobile/src/features/chat/components/ChatInput.tsx:773; apps/cli/src/tui/tui_app.rs:3704; apps/cli/src/tui/tui_app.rs:513

## S14.29 Attachment replacement.
- Should: An attached file can be replaced with another in place, keeping its position, without removing and re-adding.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S14.30 Attachment preview.
- Should: Before sending, the user can open an attachment to view it at full size or read its content.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S14.31 Duplicate-file treatment.
- Should: Adding the same file twice is detected and handled visibly (skipped, merged or flagged) rather than sent twice silently.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/hooks/use-attachments.ts:258; apps/web/features/chat/hooks/use-attachments.ts:143; apps/mobile/src/features/chat/components/ChatInput.tsx:289; apps/cli/src/tui/tui_app.rs:594

## S14.32 Per-file error display.
- Should: When a file fails, the error is shown against that file (name and reason), not as one generic message.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/AttachmentPreview.tsx:119; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3879; apps/web/features/chat/hooks/use-attachments.ts:178; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3655; apps/mobile/src/features/chat/components/ChatInput.tsx:248; apps/mobile/src/features/chat/components/AttachmentPreview.tsx:238; apps/mobile/src/features/chat/components/ChatInput.tsx:247; apps/cli/src/claude_parity.rs:288

## S14.33 Batch-upload summary.
- Should: After adding several files at once the user sees one summary of what was attached and what was refused.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/hooks/use-attachments.ts:165; apps/web/features/chat/hooks/use-attachments.ts:282; apps/mobile/src/features/chat/components/ChatInput.tsx:248; apps/mobile/src/features/chat/components/ChatInput.tsx:247; apps/mobile/app/(app)/(tabs)/chat.tsx:612; apps/cli/src/claude_parity.rs:277; apps/cli/src/claude_parity.rs:145; apps/cli/src/tui/tui_app.rs:4090

## S14.34 File-retention explanation.
- Should: The composer explains whether and how long attached files are kept.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:670; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:461; apps/extension/_locales/en/messages.json:593; apps/extension/src/side_panel.ts:5376; apps/extension/src/side_panel.ts:5301; apps/extension/src/side_panel.ts:5258

## S14.35 Selected-model compatibility warning.
- Should: If the selected model cannot read an attached file type, the composer warns before sending and offers a fix.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4031; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4017; apps/web/features/chat/pages/WebChatPage.tsx:5668

## S14.36 Alternative processing-path explanation.
- Should: When a file cannot go the normal way, the user is told the alternative (switch model or mode, convert, or what is sent instead).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3934; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4036; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3945; apps/mobile/src/features/chat/utils/attachmentValidation.ts:47; apps/mobile/src/features/chat/utils/attachmentValidation.ts:55; apps/mobile/src/features/chat/components/ChatInput.tsx:247; apps/cli/src/mentions.rs:288
