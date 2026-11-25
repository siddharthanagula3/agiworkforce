---
id: "PLAN-web-069"
type: "test-plan"
title: "Web · 69. Web application"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "69"
---
# Web · 69. Web application

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S69.01 Browser-based chat and work.

- **Expected:** Signed-in user opens the web app in a browser, chats, and switches the composer to AGI Work for multi-step tool runs.
- **Code:** done. Evidence moved: apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:238 (quoted code not found in the file now); apps/web/lib/hooks/useChatStream.ts:3488 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/route.ts:1332 (quoted code not found in the file now)
- **Where to find it:** Chat page (sign in, then Chat) > composer toggle at the right of the message box: click "Work" (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid account and open Chat.
  2. Look at the message box for the two-part switch with "Chat" and "Work" (at narrow widths only icons show).
  3. Click "Work" so it is pressed.
  4. Type a multi-step goal (for example "List three files in my project and summarise each") and send.
  5. Compare: the conversation runs in Work mode with a plan and tool steps, as in Expected.

## S69.02 Responsive desktop/tablet/mobile layouts.

- **Expected:** The web shell adapts to phone, tablet and desktop widths: drawer navigation below 768px, icon rail on portrait tablets, persistent sidebar on wide windows.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-shell-layout.ts:24; apps/web/shared/components/layout/WebAppShell.tsx:196; apps/web/shared/components/layout/WebAppShell.tsx:692
- **Earlier check in the running app:** PARTIAL: E092 [PARTIAL; Desktop and 390×844 mobile-width chat/Projects; tablet and other pages not covered]: 390×844 CSS viewport: chat composer fits, no horizontal document overflow (scrollWidth 390), hamburger opens drawer and Projects navigation closes it. Projects lists QA project with three conversations. Evidence mobile-chat.png and mobile-projects.png. Desktop browser emulation only.
- **Where to find it:** Resize the browser window: under 768px tap "Open navigation" in the header; 768px to 1023px in portrait uses the icon rail; 1024px and wider keeps the sidebar open (labels found in the code)
- **Needs:** a resizable browser window or phone width
- **Steps:**
  1. Open the web app and make the window narrower than 768px (or use a phone-width browser emulation).
  2. Click "Open navigation" in the header; the drawer slides in.
  3. Click any item in the drawer; the drawer closes.
  4. Widen the window to 1024px or more; the sidebar stays open beside the content.
  5. Compare: drawer below 768px, icon rail on portrait tablet widths, persistent sidebar on wide windows, as in Expected.

## S69.03 URL-addressable conversations and resources.

- **Expected:** Each conversation has its own URL (/chat/<id>), a new chat gets that URL after the first send, and opening the URL loads that conversation.
- **Code:** done. Evidence present: apps/web/app/chat/[sessionId]/page.tsx:14; apps/web/features/chat/pages/WebChatPage.tsx:1141; apps/web/features/chat/pages/WebChatPage.tsx:2369; apps/web/features/chat/pages/WebChatPage.tsx:2679
- **Where to find it:** Sidebar > New chat > send a first message, then read the address bar; open a conversation from the Sidebar and read the address bar (labels found in the code)
- **Steps:**
  1. Click "New chat" and type a first message, then send it.
  2. Read the address bar: it changes from /chat to /chat/<id> after the send.
  3. Open another conversation from the Sidebar, then copy the address.
  4. Open the copied address in a new tab.
  5. Compare: the same conversation loads from its own URL, as in Expected.

## S69.04 Browser history integration.

- **Expected:** Opening conversations pushes browser history, and Back/Forward reloads the conversation the URL names.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:4812; apps/web/features/chat/pages/WebChatPage.tsx:2361; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:638
- **Where to find it:** Sidebar > open conversation A, then open conversation B > browser Back and Forward buttons (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open conversation A from the Sidebar, then open conversation B.
  2. Click the browser Back button; conversation A should load.
  3. Click the browser Forward button; conversation B should load.
  4. Compare: each step opens the conversation its URL names, as in Expected.

## S69.05 Browser refresh restoration.

- **Expected:** Reloading the page restores the open conversation from its URL and the unsent composer draft.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:2369; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3184 (quoted code not found in the file now); apps/web/features/chat/components/Composer/composer-draft-storage.ts:221 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E042 [PASS; Conversation restored after browser reload]: Reload preserved Browser QA, Chat and rendering, exact answer marker and formatted response. This verifies reload in the same browser, not cross-device sync.
- **Where to find it:** Open a conversation, type an unsent draft in the message box, then reload the browser page (Cmd+R) (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open a conversation and type text in the message box without sending.
  2. Press Cmd+R to reload the page.
  3. Compare: the same conversation is open and the unsent text is back in the message box, as in Expected.
  4. Reload once more to confirm it still holds in the same browser.

## S69.06 Drag-and-drop uploads.

- **Expected:** Dragging files onto the chat page shows a drop overlay and attaches the dropped files to the composer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/components/Composer/DragDropOverlay.tsx:62
- **Where to find it:** Chat page > drag a file from Finder onto the chat window (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open Chat in the browser.
  2. In Finder, select a file and drag it over the chat window.
  3. Look for the overlay titled "Drop files here".
  4. Release the file over the window, then check the message box for an attached file.
  5. Compare: the overlay appeared and the dropped file is attached, as in Expected.

## S69.07 Clipboard integration.

- **Expected:** Pasting text, code or files into the composer is handled, and a message can be copied to the system clipboard.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5870; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2379; apps/web/features/chat/components/messages/MessageBubble.tsx:1592 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E041 [PASS; Rendered code label, copied code, and verified Markdown download]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Message box (composer) > paste with Cmd+V; reply under a message > hover and click "Copy message" (labels found in the code)
- **Needs:** a file to upload and a clipboard
- **Steps:**
  1. Copy a line of text in Notes, click the message box and press Cmd+V; the text appears.
  2. Copy a file in Finder and press Cmd+V in the message box; check that it is attached.
  3. Send any message, then hover over the reply and click "Copy message".
  4. Paste the result into Notes with Cmd+V.
  5. Compare: the pasted text and files appear, and the reply text is on the clipboard, as in Expected.

## S69.08 Camera and microphone permissions.

- **Expected:** The web app asks the browser for microphone and camera access when a feature needs them, explains a refusal, and recovers once access is granted.
- **Code:** done. Evidence present: apps/web/features/chat/stores/voice-input-store.ts:280; apps/web/features/chat/hooks/use-voice-session.ts:910
- **Where to find it:** Message box (composer) > microphone button "Start voice input" (click it) (labels found in the code)
- **Needs:** a microphone and a browser that asks for permission
- **Steps:**
  1. Click the microphone button next to the message box.
  2. Allow the browser's microphone prompt when it appears.
  3. Deny the prompt on a second try (or block it in site settings) and click the button again.
  4. Compare: a refusal shows "Microphone access was denied. Allow the microphone to use voice mode." and voice starts again after access is allowed, as in Expected.

## S69.10 Cloud code execution.

- **Expected:** From the browser a user turns on cloud code execution (/code or a skill) and the server runs code in a provider sandbox or E2B, with a Settings switch to refuse it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3247; apps/web/features/settings/sections/CapabilitiesSection.tsx:114; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4439 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > "Cloud code execution and file creation" switch; in Chat type /code in the message box and send (labels found in the code)
- **Needs:** a model that can run code on this deployment
- **Steps:**
  1. Open Settings and choose Capabilities.
  2. Turn on the switch "Cloud code execution and file creation".
  3. Go back to Chat, type /code followed by a request (for example "/code print the sum of 2 and 3") and send.
  4. Turn the switch off and repeat the /code request.
  5. Compare: with it on the code runs in the sandbox; with it off the server refuses, as in Expected.

## S69.13 Web notifications where supported.

- **Expected:** A user turns on browser notifications in Settings and gets a system notification when an agent run or long task finishes, even with the tab closed.
- **Code:** done. Evidence present: apps/web/features/settings/sections/NotificationsSection.tsx:440; apps/web/features/notifications/lib/web-push-client.ts:168; apps/web/app/api/web-push/route.ts:148; apps/web/public/sw.js:68
- **Where to find it:** Settings > Notifications > "Agent run updates" switch (labels found in the code)
- **Needs:** a browser that supports web push and a Work run
- **Steps:**
  1. Open Settings and choose Notifications.
  2. Turn on the switch "Agent run updates" and allow the browser notification prompt.
  3. Start a Work run that takes a while, then close the tab.
  4. Wait for the run to finish and watch for a system notification.
  5. Compare: a notification arrives after the run ends with the tab closed, as in Expected.

## S69.17 Downloads and export.

- **Expected:** A user exports a conversation from the chat header and the browser downloads it as Markdown, PDF, DOCX, HTML or JSON; files and artifacts download too.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7408; apps/web/features/chat/pages/WebChatPage.tsx:7934; apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:138
- **Earlier check in the running app:** PASS: E041 [PASS; Rendered code label, copied code, and verified Markdown download]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Open a conversation > "Conversation options" menu > "Export…" > choose a format > Export (labels found in the code)
- **Needs:** a conversation with messages
- **Steps:**
  1. Open a conversation with a few messages.
  2. Click "Conversation options" and choose "Export…".
  3. In the "Export Chat History" dialog, pick a format: Markdown, PDF, Word Document, HTML or JSON.
  4. Click the export button and check the file in Downloads.
  5. Compare: the file downloads in the chosen format with the conversation in it, as in Expected.

## S69.18 Browser capability detection.

- **Expected:** Before using a browser API the app checks the browser supports it and disables or explains the feature instead of failing.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/VoiceInputButton.tsx:26; apps/web/features/chat/components/Composer/VoiceInputButton.tsx:71; apps/web/features/notifications/lib/web-push-client.ts:34; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:96
- **Where to find it:** Message box (composer) > microphone button "Start voice input" in a browser without microphone support (click it) (labels found in the code)
- **Needs:** a browser that lacks microphone capture (hard to reach on a current browser)
- **Steps:**
  1. Open the app in a browser where navigator.mediaDevices.getUserMedia is missing.
  2. Look at the microphone button; it appears dimmed.
  3. Click it; a hint appears for a few seconds.
  4. Compare: the hint says "Voice input is not supported in this browser" instead of a failure, as in Expected.

## S69.19 Unsupported-browser explanation.

- **Expected:** A browser that cannot run the app gets a clear explanation (unsupported browser page or banner) with what to use instead.
- **Code:** done. Evidence present: apps/web/app/layout.tsx:144; apps/web/app/layout.tsx:153; apps/web/app/layout.tsx:154; apps/web/lib/browser-support.ts:1; apps/web/lib/browser-support.ts:11
- **Where to find it:** Open AGI in an unsupported browser (too old) or with JavaScript off; the notice appears at the top of the page (labels found in the code)
- **Needs:** an old browser or JavaScript turned off
- **Steps:**
  1. Open the app in a browser too old to meet the feature checks, or turn JavaScript off and reload.
  2. Look at the top of the page for the notice.
  3. Compare: the notice says to open AGI in a current Chrome, Edge, Firefox or Safari, or to turn JavaScript on, as in Expected.

## S69.20 Public share and preview experiences.

- **Expected:** A shared conversation or published artifact opens at a public URL for signed-out visitors, with a link preview title, expiry handling and a report link.
- **Code:** done. Evidence moved: apps/web/app/share/[token]/page.tsx:86 (quoted code not found in the file now); apps/web/app/share/[token]/page.tsx:31; apps/web/app/share/[token]/page.tsx:82; apps/web/app/shared-artifact/[token]/page.tsx:60
- **Where to find it:** Open a conversation > "Conversation options" > "Share…" > create the share link, copy it, then open it signed out (labels found in the code)
- **Needs:** a second browser profile or private window, and a shared conversation
- **Steps:**
  1. Open a conversation and click "Conversation options", then "Share…".
  2. Create a share link in "Share conversation" and copy it.
  3. Open the link in a private window (signed out); check the page loads with the conversation.
  4. Scroll to the bottom and find "Report infringement or impersonation".
  5. Open a link that has expired or was revoked; check for "Shared conversation unavailable". Compare with Expected.
