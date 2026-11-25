---
id: "PLAN-chrome-008"
type: "test-plan"
title: "Chrome · 8. Basic interactive elements"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "8"
---
# Chrome · 8. Basic interactive elements

34 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S8.01 Primary buttons.

- **Expected:** The main action in a view uses a visually emphasised primary button style, applied in shipped UI, whose label meets contrast on its fill.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/index.ts:535 (quoted code not found in the file now); apps/extension/src/side_panel.ts:3165
- **Where to find it:** Chat tab > More (the icon button labelled More, top right) > Extension settings > Account > open Autofill profile (optional) > Save profile (labels found in the code)
- **Steps:**
  1. Click the More button at the top right of the side panel and choose Extension settings.
  2. Click Account in the settings navigation.
  3. Open the Autofill profile (optional) section.
  4. Look at the Save profile button under the form: it is the filled primary-style button, and compare its label contrast with Expected.

## S8.02 Secondary buttons.

- **Expected:** A less prominent secondary (outline/ghost) button style exists and is used beside primary actions in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:2512 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8850 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8860 (quoted code not found in the file now)
- **Where to find it:** Extension settings > Options > Keyboard shortcuts > Configure (labels found in the code)
- **Steps:**
  1. Click More (top right of the side panel) and choose Extension settings.
  2. Click Options in the settings navigation.
  3. Scroll to the Keyboard shortcuts section.
  4. Look at the Configure button: it has the bordered secondary style with a hover fill, and compare with Expected.

## S8.03 Destructive buttons.

- **Expected:** Irreversible actions use a distinct destructive button style (danger colour before hover) whose label meets contrast.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:3825 (quoted code not found in the file now); apps/extension/src/side_panel.ts:3839 (quoted code not found in the file now)
- **Where to find it:** Extension settings > Account > Autofill profile (optional) > Delete profile (labels found in the code)
- **Steps:**
  1. Open More (top right) and choose Extension settings.
  2. Click Account, then open the Autofill profile (optional) section.
  3. Look at the Delete profile button next to Save profile: it uses the red danger style.
  4. Do not click it on a real profile; compare the red style and label contrast with Expected.

## S8.04 Icon-only buttons.

- **Expected:** Icon-only buttons exist in shipped UI and each carries an accessible name (aria-label or equivalent).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6379 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6590 (quoted code not found in the file now)
- **Where to find it:** Chat tab header (top right): the clock icon (Recent chats), the pen icon (New chat), and the More icon (labels found in the code)
- **Steps:**
  1. Look at the top right of the side panel: three icon-only buttons with no visible words.
  2. Click the clock icon; the Recent chats drawer opens.
  3. Click Back out and click the pen icon; it starts a new chat.
  4. Use a screen reader or hover to hear or see the name of each icon, and compare with Expected.

## S8.06 Toggle buttons.

- **Expected:** A toggle button (a button with an on/off pressed state announced to assistive tech) is used in shipped UI.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat tab header > clock icon (Recent chats) > Archived (labels found in the code)
- **Needs:** an account with at least one archived chat
- **Steps:**
  1. Click the clock icon at the top right to open Recent chats.
  2. Look for the Archived button under the Recent chats title; it appears only when at least one chat is archived.
  3. Click Archived and look at its pressed state (highlighted border) and the list, which switches to archived chats.
  4. Click Archived again and compare the pressed state and list with Expected.

## S8.07 Button groups.

- **Expected:** Related buttons are grouped into a labelled button group in shipped UI.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat tab header > Outputs > open a runnable output > Artifact view buttons Preview and Code (labels found in the code)
- **Needs:** a reply that produced a runnable artifact
- **Steps:**
  1. Look for the Outputs button in the top header of the chat view and click it.
  2. Open an output that runs in a sandbox (for example a small web page the assistant made).
  3. Look for the two buttons Preview and Code in the artifact panel.
  4. Compare the grouped pair and its selected state with Expected.

## S8.08 Text links.

- **Expected:** Links in text are visibly styled as links and open their destination when activated.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2932
- **Where to find it:** Chat tab > a reply that contains a web link (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Ask AGI a question whose answer contains a link (for example, ask it to name a website and give its address).
  2. Look at the link in the reply: it should look different from the surrounding text.
  3. Click the link and check that it opens its destination in a new tab.

## S8.09 Text inputs.

- **Expected:** Single-line text inputs with a visible label or accessible name are used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:11269; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Extension settings > Account > Autofill profile (optional) > Email (labels found in the code)
- **Steps:**
  1. Open More (top right) and choose Extension settings.
  2. Click Account and open the Autofill profile (optional) section.
  3. Click into the field labelled Email.
  4. Type some text and look: the field shows the text and the label stays visible above it.

## S8.10 Multiline inputs.

- **Expected:** A multi-line text area that accepts newlines is used in shipped UI (e.g. the composer).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:3853; apps/extension/src/side_panel.ts:5406 (quoted code not found in the file now)
- **Where to find it:** Chat tab > the composer box with the placeholder How can I help you today? (labels found in the code)
- **Steps:**
  1. Click in the composer box at the bottom of the Chat tab.
  2. Type one line of text.
  3. Press Shift+Enter to start a new line. Enter alone sends the message, so do not press it unless you want to send.
  4. Look at the box: the cursor is on a second line and the box grows, and compare with Expected.

## S8.11 Search fields.

- **Expected:** A search field (search semantics, placeholder or label, filters as typed or on submit) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:11269; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chat tab header > clock icon (Recent chats) > Search recent chats (labels found in the code)
- **Needs:** more than 10 recent chats (the search field is hidden below that)
- **Steps:**
  1. Click the clock icon to open Recent chats.
  2. Click the field labelled Search recent chats.
  3. Type part of the title of a chat you have.
  4. Look at the list: it narrows to matching chats as you type, and compare with Expected.

## S8.12 Password fields.

- **Expected:** Secret entry (passwords, API keys, tokens) uses a masked field in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7213 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** not found in the code. Searched for password input types in the app code. The only masked field found is a password input for a Clerk JWT in apps/extension/src/options.ts, which sits behind import.meta.env.DEV, so it is not in the shipped UI. No masked API-key or token field was found in the shipped side panel or settings.

## S8.13 One-time-code fields.

- **Expected:** A one-time-code field (short numeric code, one-time-code autofill or paste) is used where the product asks for a code.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7189 (quoted code not found in the file now); apps/extension/src/side_panel.ts:7205 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched the app for one-time-code, autocomplete one-time-code, OTP and verification code fields. The extension has no code-entry field in its own UI. It only detects one-time-code fields on other websites (apps/extension/src/features/content/elementReader.ts) and leaves them to the person (apps/extension/src/features/computer-use/approvalPolicy.ts).

## S8.14 Checkboxes.

- **Expected:** Checkboxes (independent on/off choices in a list, with checked state exposed) are used in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/options.ts:1033 (quoted code not found in the file now); apps/extension/src/features/side-panel/computerUsePanel.ts:143; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Extension settings > Shortcuts > Schedules > New schedule > choose the repeat option for chosen days of the week, then the weekday checkboxes (labels found in the code)
- **Needs:** possibly a signed-in account (the Schedules section says No schedules on this account when empty)
- **Steps:**
  1. Open More (top right) and choose Extension settings.
  2. Click Shortcuts in the settings navigation and find the Schedules section.
  3. Click New schedule to open the form.
  4. Set Repeat to On chosen days of the week and look at the row of weekday checkboxes; tick and untick one and compare with Expected.

## S8.16 Switches.

- **Expected:** Switches (immediate on/off settings with switch semantics) are used in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:3126 (quoted code not found in the file now); apps/extension/src/side_panel.ts:7376 (quoted code not found in the file now); apps/extension/src/side_panel.ts:7381 (quoted code not found in the file now)
- **Where to find it:** Extension settings > Options > Task completion notifications (labels found in the code)
- **Steps:**
  1. Open More (top right) and choose Extension settings.
  2. Click Options in the settings navigation.
  3. Find the row labelled Task completion notifications.
  4. Click its toggle and look: the toggle slides to on or off and the status line under it changes; compare with Expected.

## S8.17 Segmented controls.

- **Expected:** A segmented control (a small set of mutually exclusive options shown as joined segments) is used in shipped UI.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat tab header > Outputs > open a runnable output > Preview and Code toggle (labels found in the code)
- **Needs:** a reply that produced a runnable artifact
- **Steps:**
  1. Click Outputs in the top header of the chat view.
  2. Open an output that runs in a sandbox.
  3. Click Code, then Preview, and look at which one shows the pressed state.
  4. Compare the two joined segments and their selected state with Expected.

## S8.18 Single-select menus.

- **Expected:** A single-select menu (choose one value from a list) is used in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7430 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** Extension settings > Shortcuts > Schedules > New schedule > Repeat (labels found in the code)
- **Needs:** possibly a signed-in account
- **Steps:**
  1. Open More (top right) and choose Extension settings.
  2. Click Shortcuts and then New schedule.
  3. Open the Repeat drop-down and look at its options: Once, Every day, On chosen days of the week, Once a month.
  4. Choose one option and look at the value the drop-down now shows; compare with Expected.

## S8.22 Numeric steppers.

- **Expected:** A numeric stepper (number field with increment/decrement) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/options.ts:1787; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Extension settings > Account > Autofill profile (optional) > Years of experience (labels found in the code)
- **Steps:**
  1. Open More (top right) and choose Extension settings.
  2. Click Account and open the Autofill profile (optional) section.
  3. Click into the Years of experience field.
  4. Press the up and down arrow keys or click the spin buttons and look: the number goes up and down by one.

## S8.29 File inputs.

- **Expected:** A file input (choose files from the device) is used in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14679; apps/extension/src/side_panel.ts:9850 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chat tab > Add attachment button in the composer > Upload from device (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Click the Add attachment button at the bottom of the Chat tab.
  2. Click Upload from device.
  3. Choose a file in the system file picker.
  4. Look above the composer for the attached file, and compare with Expected.

## S8.30 Upload dropzones.

- **Expected:** An upload drop zone accepts files dragged onto it and shows a drag-over state.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:15818; apps/extension/src/side_panel.ts:3844
- **Where to find it:** Chat tab > drag a file over the composer box (the box with the placeholder How can I help you today?) (labels found in the code)
- **Needs:** a file on the Mac
- **Steps:**
  1. Open Finder and pick a file.
  2. Drag the file over the composer box at the bottom of the Chat tab.
  3. Look for the drag-over state: the border turns the accent colour and gets a glow.
  4. Drop the file and check that it appears as an attachment; compare with Expected.

## S8.31 Tabs.

- **Expected:** Tabs (a tablist switching between panels, with the selected tab exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13489; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Top tab bar with Chat and Computer Use, shown after a browser task starts (Chat tab > send a browser task) (labels found in the code)
- **Needs:** a browser task that starts a Computer Use run
- **Steps:**
  1. Send a browser task in the Chat tab so the view switches to Computer Use.
  2. Look for the tab bar at the top with the tabs Chat and Computer Use.
  3. Click Chat, then Computer Use, and look at which tab is underlined and selected.
  4. Compare the selected tab with Expected.

## S8.33 Disclosure controls.

- **Expected:** A disclosure control (a toggle that shows or hides one block of detail, exposing its expanded state) is used in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:601 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** Computer Use tab > Assistant steps (labels found in the code)
- **Needs:** a Computer Use run that has steps
- **Steps:**
  1. Send a browser task and wait for it to run, or open the Computer Use tab after a run.
  2. Click Assistant steps.
  3. Look at the chevron: it turns and the step list opens.
  4. Click Assistant steps again and compare the open and closed states with Expected.

## S8.34 Dropdown menus.

- **Expected:** Dropdown menus (a button that opens a list of actions with menu keyboard behaviour) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:10925; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chat tab header > More (the icon button labelled More) (labels found in the code)
- **Steps:**
  1. Click the More button at the top right.
  2. Look at the menu: it lists Close tabs, Extension settings, Shortcuts and Help.
  3. Press the Down arrow key to move through the items.
  4. Compare the list and keyboard movement with Expected.

## S8.35 Context menus.

- **Expected:** A context menu (right-click or long-press opens actions for the item under the pointer) is used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/background.ts:7452; apps/extension/src/background.ts:7675
- **Where to find it:** Any web page > select some text > right-click the selection > Explain this (labels found in the code)
- **Needs:** a web page with text to select
- **Steps:**
  1. On a web page, select a few words of text.
  2. Right-click the selected text.
  3. Look at the menu: it includes Ask AGI about the selected text, Explain this, Translate this and Send selected text to a local app.
  4. Click Explain this and check that AGI opens with the selection; compare with Expected.

## S8.37 Tooltips.

- **Expected:** Tooltips (short labels shown on hover or focus for controls) are used in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5330 (quoted code not found in the file now); apps/extension/src/features/content/in-page-panel/launcher.ts:50; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chat tab header > hover over the pen icon (New chat) (labels found in the code)
- **Steps:**
  1. Move the mouse over the pen icon at the top right of the Chat tab and wait about a second.
  2. Look for the tooltip reading New chat.
  3. Repeat with the More icon and the clock icon.
  4. Compare the tooltips with Expected.

## S8.38 Popovers.

- **Expected:** Popovers (anchored floating panels that open from a trigger and dismiss on Escape or outside click) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:4802; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chat tab header > More (popover menu) (labels found in the code)
- **Steps:**
  1. Click the More button to open the menu.
  2. Press Escape and check the menu closes and focus returns to the More button.
  3. Open the menu again and click an empty area of the page outside it.
  4. Check the menu closes on the outside click; compare with Expected.

## S8.40 Badges.

- **Expected:** Badges (small status or count markers attached to an item) are used in shipped UI.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Options page > Shortcuts > Schedules (each schedule row shows its name and a status word beside it) (labels found in the code)
- **Needs:** a signed-in account that has at least one schedule
- **Steps:**
  1. Open the AGI extension's Options page (how it is opened was not traced in the code)
  2. Go to the Shortcuts section and find the Schedules list
  3. Look at the small status word beside a schedule name, for example active or failed
  4. Compare with Expected: the status word is a small marker attached to that schedule row

## S8.41 Tags.

- **Expected:** Tags (small labels that categorise or describe an item, distinct from status badges) are used in shipped UI.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. A header chip 'Project · $NAME$' with a 'Stop using this project' button exists in apps/extension/src/side_panel.ts (around line 11563), but no in-extension control that files a chat into a project was found; searched 'project', 'chip' and 'tag' in apps/extension/src.
- **Needs:** a chat filed under a project

## S8.42 Avatars.

- **Expected:** Message authors are distinguished visually and for assistive technology (R-n: avatar or equivalent marker plus an accessible label).
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:245 (quoted code not found in the file now)
- **Where to find it:** Side panel > type a message in the composer and press send > the 'Preparing' row before the answer starts (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the side panel
  2. Type any message in the composer and press send
  3. Look at the row that says Preparing; it shows the AGI symbol mark beside the thinking dots
  4. Compare with Expected: the assistant side is marked by the AGI symbol, and screen readers hear the headings 'You said:' and 'AGI said:' before each message

## S8.43 Progress indicators.

- **Expected:** Progress indicators (determinate bars or indeterminate spinners with an accessible name) are used in shipped UI.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5709 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** Side panel > type a message in the composer and press send > the 'Preparing' row with spinning dots (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the side panel
  2. Type a message and press send
  3. Watch the row that says Preparing; its dots spin while the answer is prepared
  4. Compare with Expected: an indeterminate spinner with a visible label; the row is a status region, so the label is read aloud

## S8.46 Inline alerts.

- **Expected:** Inline alerts (a message block inside the content, with alert or status semantics, for warnings or errors) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:316; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Side panel > send a message and let the answer fail > the error text under the failed answer, with Retry (labels found in the code)
- **Needs:** a way to make a request fail, such as going offline
- **Steps:**
  1. Sign in and open the side panel
  2. Send a message that gets no answer or fails (for example while offline)
  3. Look under the failed answer for the error text in a block with alert semantics
  4. Compare with Expected: the block shows the message with a Retry button, and Switch model when the model menu applies

## S8.47 Banners.

- **Expected:** Banners (a full-width strip at the top or bottom of a view for system or account messages) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2312; apps/extension/src/side_panel.ts:781
- **Where to find it:** Side panel while signed out > strip above the composer that reads 'Sign in to start chatting in Chrome.' with a 'Sign in' button (labels found in the code)
- **Needs:** a signed-out account
- **Steps:**
  1. Open the side panel without signing in
  2. Look at the strip just above the message box
  3. Read the text and check the Sign in button beside it
  4. Compare with Expected: a full-width strip with a system message and an action

## S8.48 Pagination controls.

- **Expected:** Pagination controls (next/previous, page numbers or an explicit "Load more") let the user move through a long list.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension/src for 'pagination', 'loadMore', 'load-more', 'show more', 'hasMore' and 'cursor'; the only hit is apps/extension/src/background.ts (line 6096) returning hasMore for memories, and no side panel or options control reads it.

## S8.49 Empty states.

- **Expected:** Empty states (a message and next step shown when a list or view has no content) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13656; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Side panel > first screen after signing in, with no messages yet (the empty chat) (labels found in the code)
- **Needs:** a signed-in account and an empty chat
- **Steps:**
  1. Sign in and open the side panel with a new, empty chat
  2. Look above the message box for a greeting line (it changes with the time of day and your name)
  3. Look at the message box placeholder
  4. Compare with Expected: a greeting and a next step (the placeholder invites a request)

## S8.50 Error states.

- **Expected:** Error states (a view-level message with a recovery action when content fails to load or a request fails) are used in shipped UI.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:316; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Open a Chrome page the extension cannot read (for example chrome://extensions) > side panel > 'Page access unavailable' card with 'Retry' (labels found in the code)
- **Needs:** a Chrome page the extension cannot read, such as chrome://extensions
- **Steps:**
  1. Make the active tab a Chrome page such as chrome://extensions or the Chrome Web Store
  2. Open the AGI side panel
  3. Look at the card titled 'Page access unavailable' at the top of the messages area
  4. Press Retry and compare with Expected: the card gives a recovery action
