---
id: "PLAN-chrome-007"
type: "test-plan"
title: "Chrome · 7. Layout systems"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "7"
---
# Chrome · 7. Layout systems

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S7.01 Centered new-chat layout.

- **Expected:** An empty new chat shows its start view (greeting, prompt entry or suggestions) centred in the available area rather than an empty transcript.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2282; apps/extension/src/side_panel.ts:13656; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Side panel > header icon "New chat" (or open the side panel with Command+Shift+K on a fresh start) (labels found in the code)
- **Needs:** a signed-in account (the greeting only shows when signed in)
- **Steps:**
  1. Open the AGI side panel with Command+Shift+K (Chrome shortcut "Open AGI side panel").
  2. If a chat already has messages, click the "New chat" icon in the header.
  3. Look at the empty chat: the greeting heading and the "How can I help you today?" box should sit in the middle of the open area, not at the top with an empty transcript above.

## S7.02 Reading-width conversation layout.

- **Expected:** Message text is constrained to a readable column width that stays centred when the window is wide.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5254 (quoted code not found in the file now); apps/extension/src/side_panel.ts:4683; apps/extension/src/side_panel.css:41
- **Where to find it:** Side panel > any chat that has a written reply (path not confirmed in the code; trust the screen)
- **Needs:** a chat with a long reply
- **Steps:**
  1. Open the AGI side panel with Command+Shift+K and open a chat with a long written reply.
  2. Widen the Chrome side panel by dragging its left edge as far as it goes.
  3. Look at the reply text: it should stay in a column that is centred and stops at a readable width instead of stretching to the full window.

## S7.03 Full-width data-analysis layout.

- **Expected:** Data work (tables, charts, spreadsheets) can be viewed in a layout that uses the full window width instead of the reading column.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Not found. Searched apps/extension/src for full width, data analysis, spreadsheet, wide layout and fullWidth: only a CSV/XLSX export helper (apps/extension/src/features/side-panel/artifactPanel.ts) and unrelated matches. No full-width data layout exists in the code.
- **Needs:** a file or table to view

## S7.06 Conversation plus browser split view.

- **Expected:** A live web page is shown beside the conversation, so the user can watch or use the page while chatting about it.
- **Code:** done. Evidence moved: apps/extension/manifest.json:83; apps/extension/src/side_panel.ts:10817; apps/extension/src/background.ts:1302 (quoted code not found in the file now)
- **Where to find it:** Command+Shift+K (Chrome shortcut named "Open AGI side panel"), with a normal web page open (labels found in the code)
- **Needs:** a Chrome window with a normal web page open
- **Steps:**
  1. Open an ordinary web page (https) in a Chrome tab.
  2. Press Command+Shift+K to open the AGI side panel.
  3. Look at the window: the AGI side panel should sit beside the web page, with the page still visible next to the conversation.

## S7.12 Collapsible secondary navigation.

- **Expected:** Secondary navigation (conversation list, menus) can be collapsed out of the way and reopened.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6379 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6590 (quoted code not found in the file now)
- **Where to find it:** Side panel > header clock icon "Recent chats" (labels found in the code)
- **Needs:** a signed-in account to see saved chats
- **Steps:**
  1. Open the AGI side panel and click the clock icon in the header (title "Recent chats").
  2. The Recent chats sheet opens over the chat. Click the X button labelled "Close recent chats".
  3. Click the clock icon again and check that the list opens again and the chat behind it is back in view after closing.

## S7.17 Full-screen media viewer.

- **Expected:** An image or video in the conversation can be opened in a full-screen viewer and dismissed back to the chat.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/mediaViewer.ts:11; apps/extension/src/features/side-panel/mediaViewer.ts:55; apps/extension/src/features/side-panel/bubbles.ts:428; apps/extension/src/features/side-panel/generatedFiles.ts:427
- **Where to find it:** Side panel > chat reply that shows an image > click the image (labels found in the code)
- **Needs:** a chat that contains an image
- **Steps:**
  1. Open a chat reply that contains an image (for example one an image tool made or one you attached).
  2. Click the image. A dark full-screen view with the picture should open.
  3. Press Escape, click the X at the top right, or click the dark background, and check that you are back at the chat.

## S7.18 Floating companion window.

- **Expected:** A small always-on-top companion window can float over other apps or pages and be summoned without switching to the main app.
- **Code:** done. Evidence moved: apps/extension/src/inPagePanel/setup.ts:48; apps/extension/src/features/content/in-page-panel/panel.ts:4; apps/extension/src/inPagePanel/setup.ts:53 (quoted code not found in the file now)
- **Where to find it:** Any approved web page (https) > round AGI button at the bottom right of the page (hover tooltip "Ask AGI") (labels found in the code)
- **Needs:** an approved website; the "Page assistant overlay" setting is on by default
- **Steps:**
  1. Open an https web page on a site you have approved for AGI (AGI asks when needed).
  2. Look at the bottom right of the page for the round AGI button; hover it to see "Ask AGI".
  3. Switch to another app and check: the button only exists inside that web page and does not float over other apps as its own window.

## S7.19 Compact companion mode.

- **Expected:** A compact companion mode shows a reduced chat UI (no sidebar or side panels) sized for quick questions.
- **Code:** done. Evidence present: apps/extension/src/features/content/in-page-panel/panel.ts:4; apps/extension/src/inPagePanel/setup.ts:45
- **Where to find it:** Any approved web page > click the round AGI button > "AGI page assistant" panel (labels found in the code)
- **Needs:** an approved website
- **Steps:**
  1. Open an approved web page and click the round AGI button.
  2. Look at the panel titled "AGI page assistant": it shows a single question box with "Ask one question about this page…" and an "Open in side panel" button.
  3. Ask one question and check there is no conversation list or sidebar and that only one prompt and response show at a time.

## S7.20 Persistent bottom composer.

- **Expected:** The composer stays anchored at the bottom of the chat while the transcript scrolls above it.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2269; apps/extension/src/side_panel.ts:3829; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Side panel > any chat (labels found in the code)
- **Needs:** a chat with enough messages to scroll
- **Steps:**
  1. Open a chat with a long reply in the AGI side panel.
  2. Look at the box "How can I help you today?" at the bottom of the panel.
  3. Scroll the reply up and down and check the box stays at the bottom while only the reply moves.

## S7.21 Composer expansion for long prompts.

- **Expected:** The composer grows (or opens a larger editor) as a long prompt is typed, instead of staying one line.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5406 (quoted code not found in the file now); apps/extension/src/side_panel.ts:3864
- **Where to find it:** Side panel > click the box "How can I help you today?" (labels found in the code)
- **Steps:**
  1. Click the message box at the bottom of the side panel.
  2. Type a long prompt, pressing Return for new lines so it goes several lines long.
  3. Check that the box grows taller as lines are added, and that after it reaches its limit it scrolls inside instead of growing further.

## S7.22 Scrollable transcript independent from side panels.

- **Expected:** The transcript scrolls in its own region, so scrolling it does not move side panels, header or composer (and vice versa).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:2269; apps/extension/src/side_panel.ts:2735 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6590 (quoted code not found in the file now)
- **Where to find it:** Side panel > any long chat (path not confirmed in the code; trust the screen)
- **Needs:** a chat long enough to scroll
- **Steps:**
  1. Open a chat long enough to scroll.
  2. Scroll the reply area with the mouse wheel or trackpad.
  3. Check that the header, the side panel controls and the message box do not move while the reply scrolls.

## S7.23 Sticky artifact toolbar.

- **Expected:** The artifact toolbar (copy, download, view toggles, close) stays visible while the artifact content scrolls.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel > a reply with an artifact card > "Open" on the card (labels found in the code)
- **Needs:** a chat reply that creates an artifact
- **Steps:**
  1. Ask for something that creates an artifact (for example a short web page or code file) and wait for the artifact card.
  2. Click "Open" on the card; the artifact panel opens above the chat with its header.
  3. Scroll the artifact body and check that the header with "Preview", "Code" and the copy, download and close buttons stays in place.

## S7.25 Responsive panel stacking.

- **Expected:** On narrow windows, side panels stop sitting beside the conversation and stack over it (overlay or sheet), then return beside it when wide.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Not found. The only width rules are padding changes at 390px and 340px in apps/extension/src/side_panel.ts. The artifact panel always stacks above the chat and Recent chats is always an overlay, so there is no side-by-side panel to stack.
- **Needs:** a narrow Chrome side panel

## S7.29 Minimum and maximum panel widths.

- **Expected:** Resizable or responsive panels enforce minimum and maximum widths so neither the panel nor the conversation collapses.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Not found. Searched apps/extension/src for min-width, max-width and resize handles: no minimum or maximum width for the panel. The side panel width is set by Chrome, and manifest.json sets none.
- **Needs:** a Chrome side panel you can resize
