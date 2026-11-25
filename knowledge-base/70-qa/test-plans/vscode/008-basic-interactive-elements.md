---
id: "PLAN-vscode-008"
type: "test-plan"
title: "VS Code · 8. Basic interactive elements"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "8"
---
# VS Code · 8. Basic interactive elements

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S8.01 Primary buttons.

- **Expected:** The main action in a view uses a visually emphasised primary button style, applied in shipped UI, whose label meets contrast on its fill.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1163; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1581; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > Settings (gear) > Runtime > Open config.toml (labels found in the code)
- **Steps:**
  1. Click the gear icon named Settings in the chat header.
  2. Click Runtime in the left list.
  3. Look at the Open config.toml button and compare it with the other buttons on the page: it should look like the main action.

## S8.02 Secondary buttons.

- **Expected:** A less prominent secondary (outline/ghost) button style exists and is used beside primary actions in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:627; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1360; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > Settings (gear) > General > Model preference > Choose (labels found in the code)
- **Steps:**
  1. Click the gear icon named Settings in the chat header.
  2. Stay on General and find the row labelled Model preference.
  3. Look at the Choose button beside the model box. It should look less strong than the main buttons, such as Open config.toml under Runtime.

## S8.03 Destructive buttons.

- **Expected:** Irreversible actions use a distinct destructive button style (danger colour before hover) whose label meets contrast.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:982
- **Where to find it:** Chat > send a task that needs a tool approval > Deny on the approval card (labels found in the code)
- **Needs:** a workspace folder open; an AGI runtime that is set up so the agent asks for approval
- **Steps:**
  1. Open a workspace folder in VS Code and type a task that makes AGI change a file, such as creating a new text file, in the message box at the bottom of the chat.
  2. Press Enter and wait for an approval card to appear in the chat.
  3. Look at the Deny button. It should look red (a warning colour) and be clearly different from the approve button.

## S8.04 Icon-only buttons.

- **Expected:** Icon-only buttons exist in shipped UI and each carries an accessible name (aria-label or equivalent).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2934; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2928; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6455
- **Where to find it:** Chat header, top right: the icon buttons Sessions (clock), Settings (gear), New chat (plus), and More actions (three dots) (labels found in the code)
- **Needs:** none; VoiceOver for the name check
- **Steps:**
  1. Open the AGI chat view in the sidebar.
  2. Look at the row of icon-only buttons at the top right of the chat header.
  3. Turn on VoiceOver (Cmd+F5), move it over each icon, and listen for the name: Sessions, Settings, New chat, More actions.

## S8.07 Button groups.

- **Expected:** Related buttons are grouped into a labelled button group in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1273; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > Settings (gear) > left list with the group labels Workspace, Integrations and Account (labels found in the code)
- **Steps:**
  1. Click the gear icon named Settings in the chat header.
  2. Look at the left list. Under the label Workspace there are General, Runtime, Instructions & editor and Usage & billing.
  3. Under Integrations there are MCP servers, Hooks, Plugins and Skills. Under Account there is Cloud account. Each group has its own label.

## S8.08 Text links.

- **Expected:** Links in text are visibly styled as links and open their destination when activated.
- **Code:** done. Evidence present: apps/extension-vscode/src/webview/render.ts:18; apps/extension-vscode/src/webview/render.ts:166
- **Where to find it:** Chat > a reply that contains a web address shown as a link (path not confirmed in the code; trust the screen)
- **Needs:** a reply that contains a link (the agent decides this)
- **Steps:**
  1. Send a message that asks AGI for a web page address with a link in the answer.
  2. Look at the reply. A link should be underlined or coloured like a link.
  3. Click the link and check that the browser opens the page.

## S8.09 Text inputs.

- **Expected:** Single-line text inputs with a visible label or accessible name are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3041; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > Settings (gear) > General > Model preference (text box beside the Choose button) (labels found in the code)
- **Steps:**
  1. Click the gear icon named Settings in the chat header.
  2. Stay on General and look at the box under the label Model preference.
  3. Compare with Expected: the box is a single-line text box with a visible label. Click into it and try to type.

## S8.10 Multiline inputs.

- **Expected:** A multi-line text area that accepts newlines is used in shipped UI (e.g. the composer).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5140
- **Where to find it:** Chat > message box at the bottom (placeholder Describe a task…) (labels found in the code)
- **Steps:**
  1. Click in the message box, which says Describe a task….
  2. Type one line of text, then press Cmd+Enter.
  3. Type a second line and look for it on a new line in the box. The box should grow up to a limit.

## S8.11 Search fields.

- **Expected:** A search field (search semantics, placeholder or label, filters as typed or on submit) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3041; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3043; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > Sessions (clock) > search box Search sessions (labels found in the code)
- **Needs:** a few saved chats
- **Steps:**
  1. Click the Sessions icon in the chat header.
  2. Click the box named Search sessions at the top of the sheet.
  3. Type part of the title of an older chat and look at the list. Only matching sessions should stay.

## S8.12 Password fields.

- **Expected:** Secret entry (passwords, API keys, tokens) uses a masked field in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1267; apps/extension-vscode/src/core/commandSetup.ts:1259
- **Where to find it:** Command Palette (Cmd+Shift+P) > Code: Set API Key (labels found in the code)
- **Needs:** none; use a test string, not a real key
- **Steps:**
  1. Open the Command Palette with Cmd+Shift+P.
  2. Type Set API Key and choose Code: Set API Key.
  3. Type a short test string (not a real key) and look at the box. The typed characters should be hidden.

## S8.16 Switches.

- **Expected:** Switches (immediate on/off settings with switch semantics) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1407; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1411
- **Where to find it:** Chat header > Settings (gear) > General > Extended thinking (labels found in the code)
- **Steps:**
  1. Click the gear icon named Settings in the chat header.
  2. Stay on General and find the row labelled Extended thinking.
  3. Click its switch once. Look at the switch: it should slide to the other state. Close and reopen Settings to see whether the new state stayed.

## S8.17 Segmented controls.

- **Expected:** A segmented control (a small set of mutually exclusive options shown as joined segments) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3036; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2376; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > Sessions (clock) > Local | Cloud at the top of the sheet (labels found in the code)
- **Needs:** a Cloud account to see Cloud sessions (I did not check what the Cloud list shows without one)
- **Steps:**
  1. Click the Sessions icon in the chat header.
  2. Look at the two joined buttons Local and Cloud at the top.
  3. Click Cloud, then look at which one looks selected and at the list below. Click Local to go back.

## S8.18 Single-select menus.

- **Expected:** A single-select menu (choose one value from a list) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1375; apps/extension-vscode/src/core/commandSetup.ts:816
- **Where to find it:** Chat header > Settings (gear) > General > Agent mode (labels found in the code)
- **Steps:**
  1. Click the gear icon named Settings in the chat header.
  2. Stay on General and find the row labelled Agent mode.
  3. Click its dropdown, choose a different mode, and check that the shown value changes. Close and reopen Settings to see whether it stayed.

## S8.19 Searchable comboboxes.

- **Expected:** A searchable combobox (type to filter a list, then pick one, with listbox semantics or keyboard navigation) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:816; apps/extension-vscode/src/core/commandSetup.ts:839
- **Where to find it:** Chat > message box at the bottom > type @ (labels found in the code)
- **Needs:** a workspace folder open
- **Steps:**
  1. Open a workspace folder and click the message box.
  2. Type @. A list with the title Workspace files and symbols opens above the box.
  3. Type a few letters to narrow the list, press the Down arrow to move, and press Enter to pick one. Check that the picked item appears in the message.

## S8.22 Numeric steppers.

- **Expected:** A numeric stepper (number field with increment/decrement) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1491; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > Settings (gear) > General > Context lines (labels found in the code)
- **Steps:**
  1. Click the gear icon named Settings in the chat header.
  2. Stay on General and find the box labelled Context lines.
  3. Click the box, then use the Up and Down arrow keys or the small spinner arrows. The number should change, and it should stop at 0 and at 500.

## S8.29 File inputs.

- **Expected:** A file input (choose files from the device) is used in shipped UI.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1243 (quoted code not found in the file now); apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat > + (Attach or use tools) at the bottom left of the message box > Attach workspace files (labels found in the code)
- **Needs:** a workspace folder open; a file to attach
- **Steps:**
  1. Open a workspace folder, then click the + button named Attach or use tools.
  2. Look at the menu titled Add context and click Attach workspace files.
  3. Check that a way to choose files opens (a file dialog or a list). Compare with Expected: choosing files from the device.

## S8.30 Upload dropzones.

- **Expected:** An upload drop zone accepts files dragged onto it and shows a drag-over state.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7720; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2817
- **Where to find it:** Chat > drag a file from Finder onto the message box at the bottom (placeholder Describe a task…) (labels found in the code)
- **Needs:** a file to upload; a workspace folder open
- **Steps:**
  1. Open a file in Finder and slowly drag it over the message box.
  2. Look for the box border to turn teal and the box to get a thicker ring while the file is over it.
  3. Drop the file and look for a file chip in the strip above the box.

## S8.31 Tabs.

- **Expected:** Tabs (a tablist switching between panels, with the selected tab exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3037; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > Sessions (clock) > Local and Cloud tabs (labels found in the code)
- **Needs:** a Cloud account for the Cloud list to have content
- **Steps:**
  1. Click the Sessions icon in the chat header.
  2. Look at the Local and Cloud tabs at the top of the sheet.
  3. Click Cloud and check that the selected tab looks active and that the list changes. Click Local to go back.

## S8.33 Disclosure controls.

- **Expected:** A disclosure control (a toggle that shows or hides one block of detail, exposing its expanded state) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4573; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat > a message that shows an error > Details (labels found in the code)
- **Needs:** an error message in the chat (I did not find a fixed way to cause one)
- **Steps:**
  1. Find a chat message that shows an error with extra text.
  2. Click the row labelled Details and check that the extra text opens below it.
  3. Click it again and check that the text hides and the arrow turns back.

## S8.34 Dropdown menus.

- **Expected:** Dropdown menus (a button that opens a list of actions with menu keyboard behaviour) are used in shipped UI.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2210 (quoted code not found in the file now); apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat > + (Attach or use tools) at the bottom left of the message box (labels found in the code)
- **Needs:** a workspace folder open
- **Steps:**
  1. Click the + button named Attach or use tools.
  2. Check that a menu titled Add context opens above the box with items such as Attach workspace files, Selection and Open editors.
  3. Press Escape or click outside the menu and check that it closes.

## S8.35 Context menus.

- **Expected:** A context menu (right-click or long-press opens actions for the item under the pointer) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:980; apps/extension-vscode/src/core/commandSetup.ts:1145; apps/extension-vscode/package.json:137
- **Where to find it:** Editor > select some code > right-click the selection > Code: Explain Selection (labels found in the code)
- **Needs:** a code file open with text selected; an AGI runtime set up for a real answer
- **Steps:**
  1. Open a code file in the editor and select a few lines.
  2. Right-click (or Control-click on a Mac trackpad) inside the selection.
  3. Look for Code: Explain Selection in the menu and click it. Check that the chat opens with an explanation request.

## S8.37 Tooltips.

- **Expected:** Tooltips (short labels shown on hover or focus for controls) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2934; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat header > hover over the icon buttons Sessions, Settings and New chat (labels found in the code)
- **Needs:** a mouse or trackpad
- **Steps:**
  1. Move the mouse over the gear icon in the chat header and wait about one second.
  2. Check that a small label Settings appears.
  3. Repeat on the plus icon (New chat) and the clock icon (Sessions).

## S8.38 Popovers.

- **Expected:** Popovers (anchored floating panels that open from a trigger and dismiss on Escape or outside click) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3289; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1250; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Chat composer, bottom row > the model name button (default Auto) and the Mode and reasoning effort button (labels found in the code)
- **Steps:**
  1. Click the model name button, which shows Auto by default.
  2. Check that a menu labelled Select model opens above the box.
  3. Press Escape, then click outside the menu, and check that it closes each time.

## S8.40 Badges.

- **Expected:** Badges (small status or count markers attached to an item) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:188; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Activity Bar (left edge of VS Code) > the AGI chat icon, which can show a count badge (path not confirmed in the code; trust the screen)
- **Needs:** a running task that sets the attention state
- **Steps:**
  1. Hide the AGI chat view, or open another Activity Bar view so the AGI view is not visible.
  2. Start a task that needs your attention, such as one that ends or asks for approval.
  3. Look at the AGI icon in the Activity Bar for a small count badge, then open the AGI view and check that the badge clears.

## S8.42 Avatars.

- **Expected:** Message authors are distinguished visually and for assistive technology (R-n: avatar or equivalent marker plus an accessible label).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4934
- **Where to find it:** no screen of its own. I found no visible avatar in the code. The only author marker is visually hidden text (prependAuthor, webviewContent.ts line 4934), so Expected's visual part may not be met.
- **Needs:** VoiceOver turned on
- **Steps:**
  1. Turn on VoiceOver (Cmd+F5).
  2. Send a short message in the chat, then wait for the reply.
  3. Move VoiceOver over your message and then the reply. Listen for You said: and AGI replied: before each message text.

## S8.43 Progress indicators.

- **Expected:** Progress indicators (determinate bars or indeterminate spinners with an accessible name) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1175; apps/extension-vscode/src/core/commandSetup.ts:1179
- **Where to find it:** Select code in an editor, right-click the selection > Code: Code Review (also in the Command Palette as Code: Code Review). While it runs, a notification titled Code: Running Code Review… shows progress. A second progress bar is at Code: Open Settings > Usage & billing > Plan usage (role progressbar, aria-label "AGI Cloud plan usage"). (labels found in the code)
- **Needs:** none; the review may ask for sign-in first (not checked in code)
- **Steps:**
  1. Open any code file and select a few lines.
  2. Right-click the selection and choose Code: Code Review.
  3. Look at the notification titled Code: Running Code Review… in the corner: it should show progress and a cancel option.
  4. Optional: open the settings with Code: Open Settings, click Usage & billing, and look at the Plan usage bar.

## S8.45 Toasts.

- **Expected:** Toasts (transient, non-blocking notifications that dismiss themselves) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:254; apps/extension-vscode/src/core/commandSetup.ts:410
- **Where to find it:** Command Palette > Code: Reject All Diffs (All Files), then confirm; a notification with a Restore discarded button appears. (labels found in the code)
- **Needs:** a pending change from the assistant
- **Steps:**
  1. Make sure the assistant has a pending change waiting for review in a file.
  2. Open the Command Palette and run Code: Reject All Diffs (All Files).
  3. Confirm the dialog that asks about the reject.
  4. Look for a transient notification with the message about the discarded changes and a Restore discarded button; it should go away on its own and not block the editor.

## S8.46 Inline alerts.

- **Expected:** Inline alerts (a message block inside the content, with alert or status semantics, for warnings or errors) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4569; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code (Activity Bar icon) > Chat > the note above the message box, once a chat is long. (labels found in the code)
- **Needs:** a long chat that reaches the context warning level
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar and open Chat.
  2. Keep sending messages in one chat until it uses a large share of the model's context.
  3. Look just above the message box for the note that starts with: This chat has used N% of the model's context.
  4. Check that the note is announced as a status message (it has role status) and that it disappears when the chat is cleared.

## S8.47 Banners.

- **Expected:** Banners (a full-width strip at the top or bottom of a view for system or account messages) are used in shipped UI.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2338 (quoted code not found in the file now); apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code (Activity Bar icon) > Chat > the usage strip with the cloud icon, meter text and an Upgrade button. (labels found in the code)
- **Needs:** an account at its Managed Cloud limit or on a plan without Cloud access
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar and open Chat.
  2. Find the full-width usage strip with a cloud icon, meter and an Upgrade button.
  3. Check that the strip shows the plan usage text and the Upgrade button, and that its text matches the account's plan state.
  4. Optional: collapse it with its close control and check that it becomes a small pill.

## S8.49 Empty states.

- **Expected:** Empty states (a message and next step shown when a list or view has no content) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3168; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code (Activity Bar icon) > Chat, with no messages in a new chat. (labels found in the code)
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar.
  2. Open Chat with no messages yet (start a new chat).
  3. Look in the message area for the heading Start a conversation.
  4. Read the line under it: Ask about your code or describe a change.

## S8.50 Error states.

- **Expected:** Error states (a view-level message with a recovery action when content fails to load or a request fails) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4572; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code (Activity Bar icon) > Chat > send a message while the connection is down; an error block appears in the transcript with a Retry button. (labels found in the code)
- **Needs:** a way to switch off the network connection
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar and open Chat.
  2. Turn off the Wi-Fi or network connection.
  3. Type a short message and send it.
  4. Look in the transcript for an error block with a headline and a Retry button; turn the network back on, press Retry and compare with Expected.
