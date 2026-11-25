---
id: "PLAN-mobile-007"
type: "test-plan"
title: "Mobile · 7. Layout systems"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "7"
---
# Mobile · 7. Layout systems

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S7.01 Centered new-chat layout.

- **Expected:** An empty new chat shows its start view (greeting, prompt entry or suggestions) centred in the available area rather than an empty transcript.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:1283; apps/mobile/src/features/chat/components/ChatEmptyState.tsx:55 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:2282
- **Where to find it:** First screen after sign-in (the new chat). On a phone, tap "Open menu" then "New chat" from a conversation. (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in with a signed-in account.
  2. Look at the first screen before typing: it should open on the new chat, not a chat that already has messages.
  3. If a conversation is open, tap "Open menu" (top left), then tap "New chat" in the sidebar.
  4. Compare: the greeting and the message box sit in the middle of the empty area, not at the top of an empty transcript.

## S7.02 Reading-width conversation layout.

- **Expected:** Message text is constrained to a readable column width that stays centred when the window is wide.
- **Code:** done. Evidence moved: apps/mobile/src/shared/layout/contentColumn.ts:5; apps/mobile/src/features/chat/components/MessageList.tsx:90 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No reading-width cap found for chat messages. MessageBubble.tsx uses maxWidth '85%' (lines 686, 2301), and MessageList.tsx does not use contentColumn. contentColumn('reading') in apps/mobile/src/shared/layout/contentColumn.ts is used only by other screens (Toast, ApprovalModal, AgentsScreen, CustomizeScreen and similar) and MemoryUsedChip/ConversationExportSheet. Searched apps/mobile for contentColumn( and READING_COLUMN_MAX_WIDTH.

## S7.12 Collapsible secondary navigation.

- **Expected:** Secondary navigation (conversation list, menus) can be collapsed out of the way and reopened.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2314; apps/mobile/app/(app)/chat/[id].tsx:1659; apps/mobile/src/features/shell/drawerGestures.ts:39
- **Where to find it:** Conversation screen on a phone-width window: tap "Open menu" at the top left to open the sidebar, and close it again. (labels found in the code)
- **Steps:**
  1. Sign in and open any chat from the list.
  2. Tap "Open menu" at the top left of the chat header.
  3. Look: the sidebar slides over the chat.
  4. Tap the dimmed area beside the sidebar, or swipe it left, to close it.
  5. Tap "Open menu" again and compare: the sidebar reopens.

## S7.15 Full-screen editor.

- **Expected:** An editor (prompt, document or source) can take over the whole screen for focused editing and return to the chat.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2151; apps/mobile/src/features/chat/components/ChatInput.tsx:2399; apps/mobile/src/features/chat/components/ChatInput.tsx:2406
- **Where to find it:** Chat message box: tap "Expand message" at its top right corner after typing a long message. (labels found in the code)
- **Steps:**
  1. Open a chat, or tap "New chat".
  2. Type several lines into the message box until it grows.
  3. Tap the "Expand message" button at the top right of the box.
  4. Look: a full-screen editor covers the screen with the same text and a send control.
  5. Close the editor and check you are back in the chat with your text kept.

## S7.16 Full-screen report reader.

- **Expected:** A long report (e.g. a research report) can be read in a full-screen reading view.
- **Code:** done. Evidence present: apps/mobile/src/features/research/ReportsScreen.tsx:616; apps/mobile/src/features/research/ReportsScreen.tsx:278; apps/mobile/src/features/drawer/components/DrawerContent.tsx:565; apps/mobile/src/features/research/ReportsScreen.tsx:291
- **Where to find it:** Sidebar > Reports > tap a report in the list. (labels found in the code)
- **Needs:** a saved research report on the account
- **Steps:**
  1. Tap "Open menu" (top left) in a chat to open the sidebar.
  2. Tap "Reports".
  3. Tap a report in the list.
  4. Look: the report opens on a full screen with a "Reports" header and a back control, and the report text fills the screen.

## S7.17 Full-screen media viewer.

- **Expected:** An image or video in the conversation can be opened in a full-screen viewer and dismissed back to the chat.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:3217; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:609; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:29 (quoted code not found in the file now)
- **Where to find it:** A chat that contains an image: tap the image in the message. (path not confirmed in the code; trust the screen)
- **Needs:** a chat with an image in it
- **Steps:**
  1. Open a chat that has an image in it (a photo you sent, or a generated image).
  2. Tap the image.
  3. Look: the image opens over the chat on a full-screen dark viewer.
  4. Use the viewer's close control, or swipe it away, and check you are back in the chat.

## S7.20 Persistent bottom composer.

- **Expected:** The composer stays anchored at the bottom of the chat while the transcript scrolls above it.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:1004; apps/mobile/app/(app)/chat/[id].tsx:2577; apps/mobile/app/(app)/chat/[id].tsx:2282
- **Where to find it:** no screen of its own.
- **Needs:** a chat with enough messages to scroll
- **Steps:**
  1. Open a chat with many messages.
  2. Scroll the transcript up and down.
  3. Look: the message box stays fixed at the bottom while the messages move above it.

## S7.21 Composer expansion for long prompts.

- **Expected:** The composer grows (or opens a larger editor) as a long prompt is typed, instead of staying one line.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:2149; apps/mobile/src/features/chat/components/ChatInput.tsx:1059 (quoted code not found in the file now)
- **Where to find it:** Chat message box: type a long prompt; the box grows and shows "Expand message" at its top right. (labels found in the code)
- **Steps:**
  1. Open a chat, or tap "New chat".
  2. Type a long prompt of several sentences into the message box.
  3. Look: the box grows taller as you type instead of staying one line.
  4. Once it is multi-line, check the "Expand message" button appears at the top right of the box.

## S7.22 Scrollable transcript independent from side panels.

- **Expected:** The transcript scrolls in its own region, so scrolling it does not move side panels, header or composer (and vice versa).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageList.tsx:239; apps/mobile/src/features/chat/components/MessageList.tsx:239
- **Where to find it:** no screen of its own.
- **Needs:** a chat with a long transcript
- **Steps:**
  1. Open a chat with a long history.
  2. Scroll the messages up and down.
  3. Look: the header at the top and the message box at the bottom do not move while the messages scroll.

## S7.23 Sticky artifact toolbar.

- **Expected:** The artifact toolbar (copy, download, view toggles, close) stays visible while the artifact content scrolls.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:340 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1080; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:373
- **Where to find it:** An artifact card in a chat reply: tap the card, then look at the toolbar at the top of the full-screen artifact. (labels found in the code)
- **Needs:** a chat that has an artifact in it
- **Steps:**
  1. Open a chat where the assistant made an artifact (a document or code).
  2. Tap the artifact card in the reply.
  3. Look at the top toolbar: "Download artifact", "Copy content" and "More artifact actions" should be visible.
  4. Scroll the artifact body down.
  5. Compare: the toolbar stays at the top while the content scrolls.

## S7.25 Responsive panel stacking.

- **Expected:** On narrow windows, side panels stop sitting beside the conversation and stack over it (overlay or sheet), then return beside it when wide.
- **Code:** done. Evidence present: apps/mobile/app/(app)/_layout.tsx:58; apps/mobile/src/features/shell/drawerGestures.ts:36; apps/mobile/src/shared/hooks/useResponsiveLayout.ts:23
- **Where to find it:** no screen of its own. The threshold is in apps/mobile/src/shared/hooks/useResponsiveLayout.ts (280 sidebar plus 720 content). The app's _layout.tsx uses useTabletLayout, which was not opened.
- **Needs:** a window that can be resized (tablet or wide simulator)
- **Steps:**
  1. Open a chat in a narrow window (phone size).
  2. Tap "Open menu": the sidebar slides over the chat.
  3. Widen the window (iPad or wide simulator) past about 1000 points.
  4. Look: the sidebar now stays beside the chat and "Open menu" is gone.

## S7.26 Mobile bottom-sheet adaptation.

- **Expected:** On phone-sized screens, menus and pickers open as bottom sheets instead of desktop popovers.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:13; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:14; apps/mobile/app/(app)/chat/[id].tsx:1111
- **Where to find it:** Chat message box: tap "Add to chat" to open a bottom sheet. (labels found in the code)
- **Steps:**
  1. Open a chat, or tap "New chat".
  2. Tap "Add to chat" beside the message box.
  3. Look: a sheet rises from the bottom of the screen with attachment, mode and feature options.
  4. Drag the sheet down, or tap outside it, to close.
  5. Compare: the options appear as a bottom sheet, not a small popover.

## S7.27 Tablet two-column adaptation.

- **Expected:** On tablet widths the app shows two columns (navigation plus content) instead of the phone single column.
- **Code:** done. Evidence present: apps/mobile/app/(app)/_layout.tsx:44; apps/mobile/src/features/shell/drawerGestures.ts:36
- **Where to find it:** no screen of its own. Threshold in apps/mobile/src/shared/hooks/useResponsiveLayout.ts. The sidebar is a permanent drawer in apps/mobile/app/(app)/_layout.tsx.
- **Needs:** a tablet-width window
- **Steps:**
  1. Open the app on an iPad simulator, or widen the window past about 1000 points.
  2. Open a chat.
  3. Look: the sidebar stays on the left as a fixed column and the chat sits beside it.
  4. Tap a different chat in the sidebar and check the chat on the right changes.

## S7.28 Safe-area and virtual-keyboard accommodation.

- **Expected:** Content and the composer stay clear of notches/home indicators, and the layout adjusts when the on-screen keyboard opens.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2278; apps/mobile/app/(app)/chat/[id].tsx:2287; apps/mobile/app/(app)/chat/[id].tsx:1649
- **Where to find it:** no screen of its own.
- **Needs:** a phone-size simulator
- **Steps:**
  1. Open a chat on an iPhone simulator.
  2. Look: the header sits below the notch and the message box above the home indicator.
  3. Tap the message box so the keyboard opens.
  4. Look: the message box rises above the keyboard and the latest message stays visible.

## S7.29 Minimum and maximum panel widths.

- **Expected:** Resizable or responsive panels enforce minimum and maximum widths so neither the panel nor the conversation collapses.
- **Code:** done. Evidence present: apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3; apps/mobile/src/shared/hooks/useResponsiveLayout.ts:28; apps/mobile/app/(app)/_layout.tsx:63; apps/mobile/src/shared/layout/contentColumn.ts:26
- **Where to find it:** no screen of its own. Limits are constants in apps/mobile/src/shared/hooks/useResponsiveLayout.ts. A minimum width for the chat column is not a separate control.
- **Needs:** a window that can be resized
- **Steps:**
  1. Open a chat in a narrow window and tap "Open menu" to show the sidebar.
  2. Look: the sidebar is at most 300 points wide and no more than 88 percent of the window.
  3. Widen the window past about 1000 points and look: the sidebar is a fixed 280 points beside the chat.

## S7.32 Print-specific layouts.

- **Expected:** Printing a conversation or report produces a print-specific layout: no app chrome, the whole content, paper-friendly colours and sensible page breaks.
- **Code:** done. Evidence present: apps/mobile/services/fileCreation.ts:825; apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:55; apps/mobile/services/exportMarkdownHtml.ts:60
- **Where to find it:** Conversation menu > Export > Print (top right of a chat). (labels found in the code)
- **Needs:** a chat with messages (a printer is optional)
- **Steps:**
  1. Open a chat that has messages.
  2. Tap "Conversation menu" at the top right.
  3. Tap "Export".
  4. Tap "Print" in the export sheet.
  5. Look: the system print preview shows the conversation text without the app's buttons. Cancel the dialog.
