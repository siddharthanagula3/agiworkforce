# Area 69. Web application

20 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S69.01 Browser-based chat and work.
- Should: Signed-in user opens the web app in a browser, chats, and switches the composer to AGI Work for multi-step tool runs.
- Status: web done
- Code: apps/web/app/chat/page.tsx:7; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:238; apps/web/lib/hooks/useChatStream.ts:3488; apps/web/app/api/llm/v1/chat/completions/route.ts:1332

## S69.02 Responsive desktop/tablet/mobile layouts.
- Should: The web shell adapts to phone, tablet and desktop widths: drawer navigation below 768px, icon rail on portrait tablets, persistent sidebar on wide windows.
- Status: web done
- Code: apps/web/shared/components/layout/app-shell-layout.ts:24; apps/web/shared/components/layout/WebAppShell.tsx:190; apps/web/shared/components/layout/WebAppShell.tsx:691

## S69.03 URL-addressable conversations and resources.
- Should: Each conversation has its own URL (/chat/<id>), a new chat gets that URL after the first send, and opening the URL loads that conversation.
- Status: web done
- Code: apps/web/app/chat/[sessionId]/page.tsx:1; apps/web/features/chat/pages/WebChatPage.tsx:888; apps/web/features/chat/pages/WebChatPage.tsx:1785; apps/web/features/chat/pages/WebChatPage.tsx:2012

## S69.04 Browser history integration.
- Should: Opening conversations pushes browser history, and Back/Forward reloads the conversation the URL names.
- Status: web done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:3705; apps/web/features/chat/pages/WebChatPage.tsx:1784; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:383

## S69.05 Browser refresh restoration.
- Should: Reloading the page restores the open conversation from its URL and the unsent composer draft.
- Status: web done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:1785; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3184; apps/web/features/chat/components/Composer/composer-draft-storage.ts:221

## S69.06 Drag-and-drop uploads.
- Should: Dragging files onto the chat page shows a drop overlay and attaches the dropped files to the composer.
- Status: web done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1818; apps/web/features/chat/components/Composer/DragDropOverlay.tsx:73

## S69.07 Clipboard integration.
- Should: Pasting text, code or files into the composer is handled, and a message can be copied to the system clipboard.
- Status: web done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4297; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1940; apps/web/features/chat/components/messages/MessageBubble.tsx:1592

## S69.08 Camera and microphone permissions.
- Should: The web app asks the browser for microphone and camera access when a feature needs them, explains a refusal, and recovers once access is granted.
- Status: web done
- Code: apps/web/features/chat/stores/voice-input-store.ts:190; apps/web/features/chat/hooks/use-voice-session.ts:608

## S69.09 Screen/tab sharing.
- Should: A user can share a screen, window or tab with the assistant from the browser (capture a screenshot or stream it into chat or voice).
- Status: not applicable anywhere

## S69.10 Cloud code execution.
- Should: From the browser a user turns on cloud code execution (/code or a skill) and the server runs code in a provider sandbox or E2B, with a Settings switch to refuse it.
- Status: web done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2550; apps/web/features/settings/sections/CapabilitiesSection.tsx:79; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4439

## S69.11 Cloud browser execution.
- Should: The assistant can drive a browser that runs in the cloud (navigate, click, read pages) for a web user, without a local desktop or extension.
- Status: web missing

## S69.12 Remote desktop-host control.
- Should: From a normal browser tab a user can control their own paired desktop host (send it work, approve steps, see its screen).
- Status: web missing

## S69.13 Web notifications where supported.
- Should: A user turns on browser notifications in Settings and gets a system notification when an agent run or long task finishes, even with the tab closed.
- Status: web done
- Code: apps/web/features/settings/sections/NotificationsSection.tsx:267; apps/web/features/notifications/lib/web-push-client.ts:127; apps/web/app/api/web-push/route.ts:148; apps/web/public/sw.js:61

## S69.14 Installable web application where offered.
- Should: The site can be installed as a standalone web app whose launch opens the working product.
- Status: not applicable anywhere

## S69.15 Offline/read-only fallback.
- Should: When the connection drops the app says so and previously loaded content stays readable, with an offline page for navigations.
- Status: not applicable anywhere

## S69.16 Multi-tab coordination.
- Should: Several open tabs stay consistent: a chat created, renamed or answered in one tab appears in the others, and shared state does not clobber across tabs.
- Status: not applicable anywhere

## S69.17 Downloads and export.
- Should: A user exports a conversation from the chat header and the browser downloads it as Markdown, PDF, DOCX, HTML or JSON; files and artifacts download too.
- Status: web done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5468; apps/web/features/chat/pages/WebChatPage.tsx:5851; apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:128

## S69.18 Browser capability detection.
- Should: Before using a browser API the app checks the browser supports it and disables or explains the feature instead of failing.
- Status: web done
- Code: apps/web/features/chat/components/Composer/VoiceInputButton.tsx:24; apps/web/features/chat/components/Composer/VoiceInputButton.tsx:65; apps/web/features/notifications/lib/web-push-client.ts:10; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:94

## S69.19 Unsupported-browser explanation.
- Should: A browser that cannot run the app gets a clear explanation (unsupported browser page or banner) with what to use instead.
- Status: web done
- Code: apps/web/app/layout.tsx:154; apps/web/app/layout.tsx:163; apps/web/app/layout.tsx:164; apps/web/lib/browser-support.ts:1; apps/web/lib/browser-support.ts:11

## S69.20 Public share and preview experiences.
- Should: A shared conversation or published artifact opens at a public URL for signed-out visitors, with a link preview title, expiry handling and a report link.
- Status: web done
- Code: apps/web/app/share/[token]/page.tsx:86; apps/web/app/share/[token]/page.tsx:32; apps/web/app/share/[token]/page.tsx:55; apps/web/app/shared-artifact/[token]/page.tsx:54
