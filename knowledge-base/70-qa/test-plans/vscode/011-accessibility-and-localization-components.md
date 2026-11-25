---
id: "PLAN-vscode-011"
type: "test-plan"
title: "VS Code · 11. Accessibility and localization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "11"
---
# VS Code · 11. Accessibility and localization components

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S11.01 Accessible control labels.

- **Expected:** Every interactive control exposes an accessible name (visible text, aria-label or platform equivalent) that says what it does.
- **Code:** done. Evidence present: apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts:90; apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts:94; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7135; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:129
- **Where to find it:** AGI Code icon in the VS Code Activity Bar > sidebar header buttons 'Sessions', 'Settings', 'New chat', 'More actions' (labels found in the code)
- **Needs:** VoiceOver turned on
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar to open the sidebar.
  2. Turn on VoiceOver and move across the header buttons 'Sessions', 'Settings', 'New chat' and 'More actions'.
  3. Check that each one is announced by its name and what it does, as in Expected.

## S11.02 Semantic heading hierarchy.

- **Expected:** Each screen has a top heading and sections use nested headings, so screen-reader users can jump by heading.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2591 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7129
- **Where to find it:** Settings (gear button) > page titled 'Settings' with section headings such as 'Model and reasoning'. The empty chat also has the heading 'Start a conversation'. (labels found in the code)
- **Needs:** VoiceOver turned on
- **Steps:**
  1. Click the 'Settings' button in the AGI Code sidebar header.
  2. Turn on VoiceOver and use its heading navigation to jump between headings.
  3. Check the top heading is 'Settings' and sections such as 'Model and reasoning' are headings below it.

## S11.03 Keyboard navigation.

- **Expected:** Everything can be reached and operated from the keyboard, including menus with arrow keys and Escape.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6106; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6016
- **Where to find it:** 'More actions' button (the ellipsis icon) in the AGI Code sidebar > menu items 'Output style', 'Next message effort', 'Focus view' (labels found in the code)
- **Steps:**
  1. Press Tab until the 'More actions' button has focus, then press Enter.
  2. Press the Down Arrow key to move between the menu items.
  3. Press Escape to close the menu and check the menu closes with no mouse.

## S11.04 Visible focus indicators.

- **Expected:** The focused control always shows a clearly visible focus indicator when navigating by keyboard.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:547; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:188
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Click in the 'Chat input' box, then press Tab repeatedly.
  2. Look at each focused button for a visible outline ring.
  3. Check the focused control is always clearly outlined, as in Expected.

## S11.05 Focus management across dialogs.

- **Expected:** Opening a dialog moves focus into it, Tab stays inside it, and Escape closes it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3726; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3843; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3071
- **Where to find it:** Command Palette > 'Code: Show Getting Started' opens the dialog 'Work with your code' (role dialog) (labels found in the code)
- **Steps:**
  1. Open the Command Palette and type 'Show Getting Started', then press Enter.
  2. Press Tab repeatedly and check focus stays inside the dialog (Next and links).
  3. Press Escape and check the dialog closes, as in Expected.

## S11.06 Focus restoration after panel closure.

- **Expected:** Closing a dialog, menu or panel returns focus to the control that opened it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6116; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6016
- **Where to find it:** 'More actions' button > menu, then Escape in the AGI Code sidebar (labels found in the code)
- **Steps:**
  1. Press Tab until 'More actions' has focus, then press Enter to open the menu.
  2. Press Escape to close the menu.
  3. Check focus is back on the 'More actions' button, as in Expected.

## S11.07 Screen-reader announcements for completed events.

- **Expected:** When something finishes (a reply, a tool step, a save, a connection), a screen reader hears a short announcement without moving focus.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3122; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2366 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3610
- **Where to find it:** no screen of its own. The code line cited for this item (webviewContent.ts:3122) is the developer runtime status region, not a reply-finished announcement; the completion announcement itself was not located.
- **Needs:** a signed-in account that can get a reply
- **Steps:**
  1. Turn on VoiceOver, click 'Chat input', type a short message and send it with Enter.
  2. Keep focus in the chat input while the reply runs.
  3. Listen for a short announcement when the reply finishes, and check focus did not move, as in Expected.

## S11.08 Non-spammy streaming announcements.

- **Expected:** A streaming reply is announced calmly (in word-bounded chunks or once when done), never token by token and never twice.
- **Code:** unverified. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2366 (quoted code not found in the file now)
- **Needs:** live-web
- **Where to find it:** no screen of its own. Code status unverified: the cited line no longer holds the quoted code. The transcript log region is aria-live polite with additions, which may announce every streamed chunk; not verified.
- **Needs:** a signed-in account with a live provider reply (live-web)
- **Steps:**
  1. Turn on VoiceOver and send a message that gets a long streamed reply.
  2. Listen while the reply streams and count how often it is announced.
  3. Check it is spoken calmly in chunks or once when done, not word by word, as in Expected.

## S11.09 Accessible tool and approval status.

- **Expected:** Tool steps and approval requests expose their state (running, done, failed, waiting for approval) to assistive tech, with labelled approve and deny controls.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7122; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7158; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8440
- **Where to find it:** Chat > send a request that needs approval (for example a file edit or shell command) > card titled 'Approval needed' with status and approve or deny buttons (labels found in the code)
- **Needs:** a signed-in account and a workspace folder open
- **Steps:**
  1. Make sure a workspace folder is open and send a request that asks AGI to change a file or run a command.
  2. When the card 'Approval needed' appears, turn on VoiceOver and move through it.
  3. Check the card announces its summary and state, and that the approve and deny buttons have names, as in Expected.

## S11.11 Alternatives to drag-only operations.

- **Expected:** Every drag operation (drop files, resize, reorder) has a non-drag alternative such as a button, menu or arrow keys.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7720; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8545
- **Where to find it:** '+' button ('Attach or use tools') in the composer > 'Attach workspace files' (labels found in the code)
- **Needs:** a workspace with a text file
- **Steps:**
  1. Click the '+' button labelled 'Attach or use tools' next to the chat input.
  2. Click 'Attach workspace files' and pick a text file, instead of dragging.
  3. Check the file is attached without any drag, as in Expected.

## S11.14 Reduced motion.

- **Expected:** With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2774; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** no screen of its own. The rule is a CSS media query for prefers-reduced-motion in webviewContent.ts; the app has no own setting for it.
- **Needs:** a Mac with Reduce motion on and a reply in progress
- **Steps:**
  1. Turn on the Mac's Reduce motion setting.
  2. Open AGI Code, send a message and watch the spinning icon while the reply is pending.
  3. Check the spinner stops or is replaced, as in Expected.

## S11.21 Input-method composition support.

- **Expected:** Typing with an input method (Japanese, Chinese, Korean) never sends the message when Enter confirms a composition.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5876
- **Where to find it:** 'Chat input' box in the AGI Code composer (labels found in the code)
- **Needs:** a Japanese, Chinese or Korean input method on the Mac
- **Steps:**
  1. Switch the Mac to a Japanese input method (or Chinese or Korean).
  2. Click 'Chat input' and type a word so the text is still being composed.
  3. Press Enter to confirm the conversion and check the message is NOT sent, the text stays in the box.

## S11.22 Locale-aware dates and numbers.

- **Expected:** Dates, times and numbers are formatted for the user's locale rather than a fixed US format.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/account-auth/accountPresentation.ts:18; apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:83 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:398 (quoted code not found in the file now)
- **Where to find it:** Settings > 'Usage & billing' (plan usage line such as '% used · resets <date>') (labels found in the code)
- **Needs:** a paid account with a usage meter (Free shows no meters)
- **Steps:**
  1. Change VS Code's display language to another language and restart VS Code.
  2. Open Settings from the AGI Code sidebar and click 'Usage & billing'.
  3. Compare the reset date and numbers with your system format, as in Expected.

## S11.24 Pluralization.

- **Expected:** Counted phrases follow each language's plural rules rather than an English "s" suffix.
- **Code:** done. Evidence present: apps/extension-vscode/src/l10n/index.ts:57; apps/extension-vscode/src/core/commandSetup.ts:329; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8995
- **Where to find it:** A chat reply that runs several tool steps shows a count such as '3 actions' (the activity summary) (labels found in the code)
- **Needs:** a signed-in account and a prompt that runs tools
- **Steps:**
  1. Change VS Code's display language to Spanish or French and restart VS Code.
  2. Send a request that makes AGI run several tool steps.
  3. Read the count, and compare one step ('1 acción') with several ('3 acciones'), as in Expected.

## S11.25 Translated error messages.

- **Expected:** Error messages appear in the user's chosen language.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:439; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:72; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5038; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3387; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4524
- **Where to find it:** Chat > a failed reply shows the error text in the reply area, with a 'Retry' button (labels found in the code)
- **Needs:** a way to make a reply fail
- **Steps:**
  1. Change VS Code's display language to Spanish or French and restart VS Code.
  2. Cause a failed reply (for example a provider timeout or an invalid request).
  3. Read the error text and check it is in that language, as in Expected.

## S11.26 Platform-specific shortcut notation.

- **Expected:** Shortcut hints use the platform's notation (⌘ on Apple, Ctrl elsewhere).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4458
- **Where to find it:** Settings > 'Send key' (composer.enterBehavior), then the 'Send' button in the composer (tooltip 'Send (Enter)') (labels found in the code)
- **Steps:**
  1. Open Settings and set 'Send key' to the modifier option.
  2. Go back to the chat and check the send hint or tooltip.
  3. Compare the modifier text with Expected: it should show Cmd on Mac and Ctrl elsewhere.

## S11.27 Long-label and translated-copy layouts.

- **Expected:** Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** no screen of its own. The plan gives no code location. CSS overflow and ellipsis rules exist in apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts, but per-control behaviour was not verified.
- **Needs:** a narrow sidebar and another display language
- **Steps:**
  1. Change VS Code's display language to German and restart VS Code.
  2. Narrow the AGI Code sidebar and open Settings > 'Usage & billing'.
  3. Check long labels wrap or truncate without overlapping or clipping controls, as in Expected.
