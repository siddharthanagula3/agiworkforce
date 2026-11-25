---
id: "PLAN-cli-008"
type: "test-plan"
title: "CLI · 8. Basic interactive elements"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "8"
---
# CLI · 8. Basic interactive elements

29 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S8.01 Primary buttons.

- **Expected:** The main action in a view uses a visually emphasised primary button style, applied in shipped UI, whose label meets contrast on its fill.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:647; apps/cli/src/tui/widgets/approval_overlay.rs:248 (quoted code not found in the file now)
- **Where to find it:** agi (chat screen, mode chip reads Default) > ask for a command that needs approval > Tool approval box > Yes (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Start agi and check the status bar chip reads Default (press Shift+Tab until it does).
  2. Ask the assistant to run a shell command, for example run pwd.
  3. When the approval box appears, look at the Yes button, which starts highlighted.
  4. Compare: Yes is the main choice with a warning-coloured fill. The code has no button named primary, so the tester should note how the main button looks.

## S8.02 Secondary buttons.

- **Expected:** A less prominent secondary (outline/ghost) button style exists and is used beside primary actions in shipped UI.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:203; apps/cli/src/tui/widgets/approval_overlay.rs:248 (quoted code not found in the file now)
- **Where to find it:** agi (chat screen, mode chip reads Default) > ask for a command that needs approval > Tool approval box > No and Allow Session (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Trigger the approval box as in S8.01 (Default mode, a command that needs approval).
  2. Look at the buttons beside Yes: No, Allow Session, Always allow, Deny All and Allow All.
  3. Press the Right arrow to move the highlight to No, then to Allow Session.
  4. Compare: the other buttons look less bold or muted than the highlighted one. The code has no outline or ghost style, so note what is seen.

## S8.03 Destructive buttons.

- **Expected:** Irreversible actions use a distinct destructive button style (danger colour before hover) whose label meets contrast.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:243 (quoted code not found in the file now)
- **Where to find it:** agi (chat screen, mode chip reads Default) > ask for a command that needs approval > Tool approval box > Deny All (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Trigger the approval box as in S8.01.
  2. Press the Right arrow until the Deny All button is highlighted.
  3. Look at the highlighted Deny All: it should have a red fill.
  4. Look at Deny All when not highlighted: its text should be red. Do not press Enter, because Deny All cancels the turn.

## S8.06 Toggle buttons.

- **Expected:** A toggle button (a button with an on/off pressed state announced to assistive tech) is used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/skills_toggle.rs:78; apps/cli/src/tui/widgets/skills_toggle.rs:92; apps/cli/src/tui/tui_app.rs:6553
- **Where to find it:** /skills-toggle > Space toggle on a skill (labels found in the code)
- **Needs:** at least one skill installed (otherwise the list says no skills discovered)
- **Steps:**
  1. Type /skills-toggle and press Enter.
  2. Move with the arrow keys to a skill and press Space.
  3. Look at the row: its box flips between [x] and [ ].
  4. Compare: the row shows a checkbox style, not a pressed-state button. Note this for the tester.

## S8.07 Button groups.

- **Expected:** Related buttons are grouped into a labelled button group in shipped UI.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:249 (quoted code not found in the file now); apps/cli/src/tui/widgets/approval_overlay.rs:256 (quoted code not found in the file now)
- **Where to find it:** agi (chat screen, mode chip reads Default) > ask for a command that needs approval > Tool approval box > row of buttons (Yes, No, Allow Session, Always allow, Deny All, Allow All) > Enter confirm (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Trigger the approval box as in S8.01.
  2. Look at the row of six buttons under the prompt.
  3. Read the hint line at the bottom of the box.
  4. Compare: the buttons sit in one row, and the hint line reads Enter confirm. The code does not draw a separate group label; the prompt above the buttons is the only text that names them.

## S8.08 Text links.

- **Expected:** Links in text are visibly styled as links and open their destination when activated.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:265
- **Where to find it:** agi (chat screen) > ask for a reply that contains a web link > type /links > type /links 1 (labels found in the code)
- **Needs:** a working agi session (signed in); the reply must contain a web link
- **Steps:**
  1. Ask the assistant a question whose answer includes a web link.
  2. Type /links and press Enter. The list shows each link with a number.
  3. Type /links 1 and press Enter.
  4. Compare: the link opens in your browser. The code runs the browser open for that number.

## S8.09 Text inputs.

- **Expected:** Single-line text inputs with a visible label or accessible name are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3107; apps/cli/src/tui/tui_app.rs:2016
- **Where to find it:** agi (chat screen) > bottom input line (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Start agi and look at the bottom input line.
  2. Read the grey text in the empty input line.
  3. Type a few words and watch them appear after the prompt character.
  4. Compare: the grey hint is the label for the input, and the typed words replace it.

## S8.10 Multiline inputs.

- **Expected:** A multi-line text area that accepts newlines is used in shipped UI (e.g. the composer).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4110; apps/cli/src/tui/widgets/screen_renderers.rs:995
- **Where to find it:** agi (chat screen) > bottom input line > Ctrl-J (or Shift+Enter) > /keybindings (path not confirmed in the code; trust the screen)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Type a first line in the bottom input line.
  2. Press Ctrl-J (or Shift+Enter if the terminal sends it).
  3. Type a second line.
  4. Compare: the input shows two lines and the text is kept. Type /keybindings to see the list, which includes Insert newline (multiline).

## S8.11 Search fields.

- **Expected:** A search field (search semantics, placeholder or label, filters as typed or on submit) is used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:487; apps/cli/src/tui/widgets/model_picker.rs:110
- **Where to find it:** /model > type to filter by name or provider... (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Type /model and press Enter to open the model list.
  2. Look at the search line, which shows the grey placeholder.
  3. Type part of a model name.
  4. Compare: the list narrows to matching models as you type.

## S8.12 Password fields.

- **Expected:** Secret entry (passwords, API keys, tokens) uses a masked field in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/elicitation_overlay.rs:82; apps/cli/src/tui/tui_app.rs:1768
- **Where to find it:** A connected MCP server's form (it opens when the server asks for input) > a field whose name contains key, token, secret or password (labels found in the code)
- **Needs:** a connected MCP server that asks for input
- **Steps:**
  1. Connect an MCP server that asks for a credential through a form.
  2. When the form opens, find the field whose name looks like a secret.
  3. Type a value in it.
  4. Compare: the field shows hidden and the typed text is not shown.

## S8.14 Checkboxes.

- **Expected:** Checkboxes (independent on/off choices in a list, with checked state exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/skills_toggle.rs:78; apps/cli/src/tui/widgets/skills_toggle.rs:92
- **Where to find it:** /skills-toggle > Space toggle (labels found in the code)
- **Needs:** at least one skill installed
- **Steps:**
  1. Type /skills-toggle and press Enter.
  2. Move down the list with the arrow keys.
  3. Press Space on a skill to tick or untick it.
  4. Compare: the box changes between [x] and [ ] and the list keeps all skills independent.

## S8.15 Radio groups.

- **Expected:** A radio group (mutually exclusive options, all visible, with checked state exposed) is used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/effort_picker.rs:186; apps/cli/src/tui/widgets/effort_picker.rs:148
- **Where to find it:** /effort (typed with no value) (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Type /effort and press Enter.
  2. Move with the arrow keys between the levels.
  3. Look at the bullet mark, which marks the current level.
  4. Compare: only one level is marked at a time, and each row shows its token budget or no thinking.

## S8.16 Switches.

- **Expected:** Switches (immediate on/off settings with switch semantics) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/elicitation_overlay.rs:65; apps/cli/src/tui/widgets/elicitation_overlay.rs:314
- **Where to find it:** A connected MCP server's form (it opens when the server asks for input) > a true or false field > Space to toggle (labels found in the code)
- **Needs:** a connected MCP server that asks for input
- **Steps:**
  1. Connect an MCP server whose form has a true or false field.
  2. Move to that field and press Space.
  3. Look at the value in the brackets, which flips.
  4. Compare: the switch changes on press. The form is submitted only when confirmed.

## S8.18 Single-select menus.

- **Expected:** A single-select menu (choose one value from a list) is used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:552; apps/cli/src/tui/tui_app.rs:2035
- **Where to find it:** /model > arrow keys > Enter (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Type /model and press Enter.
  2. Move the highlight with the up and down arrow keys.
  3. Press Enter on one model.
  4. Compare: only one model is chosen and the picker closes with that model in use.

## S8.19 Searchable comboboxes.

- **Expected:** A searchable combobox (type to filter a list, then pick one, with listbox semantics or keyboard navigation) is used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:487; apps/cli/src/tui/widgets/model_picker.rs:153
- **Where to find it:** /model > type to filter by name or provider... > arrow keys > Enter (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Type /model and press Enter.
  2. Type part of a model name in the search line.
  3. Use the up and down arrow keys to pick a match, then press Enter.
  4. Compare: the list filters as you type and the chosen model is used.

## S8.20 Multiselect controls.

- **Expected:** A multiselect control (pick several values from one list, each selection shown and removable) is used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/elicitation_overlay.rs:59; apps/cli/src/tui/tui_app.rs:1768
- **Where to find it:** A connected MCP server's form (it opens when the server asks for input) > a list field > Space toggle (labels found in the code)
- **Needs:** a connected MCP server that asks for input
- **Steps:**
  1. Connect an MCP server whose form has a list of choices.
  2. Move to the list field and use the arrow keys to move between choices.
  3. Press Space to pick a choice, then pick another.
  4. Compare: each pick stays marked and can be unpicked with Space.

## S8.29 File inputs.

- **Expected:** A file input (choose files from the device) is used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/mention_popup.rs:1; apps/cli/src/tui/tui_app.rs:4590
- **Where to find it:** agi chat > type @ in the bottom input line (file picker) > /attach (typed with no value) lists the ways to add context (labels found in the code)
- **Needs:** a file in the project folder, and an image or PDF for the /attach step
- **Steps:**
  1. Type @ in the bottom input line.
  2. Type part of a file name and use the arrow keys to pick a file, then press Enter.
  3. Type /attach and press Enter to see the menu.
  4. Compare: the file or image is added to the next message. Note that /attach takes a typed path; no system file dialog was found in the code.

## S8.31 Tabs.

- **Expected:** Tabs (a tablist switching between panels, with the selected tab exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/screen_renderers.rs:632; apps/cli/src/tui/tui_app.rs:6304
- **Where to find it:** /plugin > ←/→ switch tabs (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Type /plugin and press Enter.
  2. Read the tab names on the top row: Discover, Installed, Marketplaces, Errors.
  3. Press the Right and Left arrow keys to move between tabs.
  4. Compare: the list below changes with each tab and the footer reads ←/→ switch tabs.

## S8.33 Disclosure controls.

- **Expected:** A disclosure control (a toggle that shows or hides one block of detail, exposing its expanded state) is used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4048; apps/cli/src/tui/tui_app.rs:400
- **Where to find it:** agi chat > after a tool runs with output > Ctrl-O (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Ask agi to run a command that prints many lines, for example ls -la.
  2. Press Ctrl-O to expand the tool output.
  3. Read the status line.
  4. Compare: it reads showing full tool output, Ctrl-O to collapse, and more lines show. Press Ctrl-O again to collapse.

## S8.34 Dropdown menus.

- **Expected:** Dropdown menus (a button that opens a list of actions with menu keyboard behaviour) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/command_popup.rs:193; apps/cli/src/tui/tui_app.rs:4590
- **Where to find it:** agi chat > empty bottom input line > type / (some labels not found in the code; trust the screen)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Make sure the bottom input line is empty.
  2. Type / to open the Commands list.
  3. Use the up and down arrow keys to move through the commands, and type letters to filter.
  4. Compare: the list opens as a menu of actions. Press Esc to close it (the key help shows Esc as Close palette).

## S8.38 Popovers.

- **Expected:** Popovers (anchored floating panels that open from a trigger and dismiss on Escape or outside click) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/effort_picker.rs:163; apps/cli/src/tui/tui_app.rs:2025
- **Where to find it:** /effort (typed with no value) > Esc (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Type /effort and press Enter to open the picker over the chat.
  2. Look at the floating list with the current level marked.
  3. Press Esc.
  4. Compare: the picker closes and the chat is back. The code has no outside-click dismissal that was confirmed.

## S8.40 Badges.

- **Expected:** Badges (small status or count markers attached to an item) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3556; apps/cli/src/tui/tui_app.rs:146
- **Where to find it:** agi chat > bottom status bar > mode chip, then Shift+Tab to change it (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Start agi and look at the bottom status bar: a coloured chip shows the mode, Default.
  2. Press Shift+Tab.
  3. Look at the chip and the top banner that starts with Mode:.
  4. Compare: the chip now shows the next mode, Plan, and the banner shows it for about two seconds.

## S8.42 Avatars.

- **Expected:** Message authors are distinguished visually and for assistive technology (R-n: avatar or equivalent marker plus an accessible label).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2882; apps/cli/src/tui/tui_app.rs:2888; apps/cli/src/tui/tui_app.rs:1815
- **Where to find it:** agi chat > send any message > look at the marker before each line (path not confirmed in the code; trust the screen)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Type hi and press Enter.
  2. Look at the marker before your line, which is a > sign.
  3. Wait for the reply and look at its marker, which is a star sign.
  4. Compare: each author has a marker symbol. The code shows no image avatar and no accessible name for each marker.

## S8.43 Progress indicators.

- **Expected:** Progress indicators (determinate bars or indeterminate spinners with an accessible name) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3020; apps/cli/src/tui/tui_app.rs:2125
- **Where to find it:** agi chat > send a request > spinner line above the bottom input line (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Send a request that takes a few seconds.
  2. Look at the spinner line above the input: it shows a spinning symbol, a verb, and the elapsed time.
  3. Wait for a slow request.
  4. Compare: the line adds still working after the time. The spinner stops when the reply ends.

## S8.45 Toasts.

- **Expected:** Toasts (transient, non-blocking notifications that dismiss themselves) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3750; apps/cli/src/tui/tui_app.rs:2020
- **Where to find it:** agi chat > Shift+Tab (top banner that starts with Mode:) > Ctrl-O (status line notice showing full tool output, Ctrl-O to collapse) (labels found in the code)
- **Needs:** a working agi session (signed in)
- **Steps:**
  1. Press Shift+Tab and look at the banner at the top of the chat that starts with Mode:.
  2. Wait about two seconds and check the banner has gone.
  3. Run a command with output, then press Ctrl-O and read the status line notice.
  4. Compare: the notice disappears by itself after about two seconds, and nothing needs closing.

## S8.46 Inline alerts.

- **Expected:** Inline alerts (a message block inside the content, with alert or status semantics, for warnings or errors) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2902; apps/cli/src/tui/tui_app.rs:2737
- **Where to find it:** agi, then type /resume followed by a session reference that does not exist (for example /resume no-such-session) in the composer (labels found in the code)
- **Steps:**
  1. Start the app with agi in the terminal and wait for the composer.
  2. Type /resume no-such-session and press Enter.
  3. Look for a line in the chat that starts with the info mark and says No session matches, followed by the reference and the reason.
  4. Compare with Expected: a message block inside the chat that reports the failure. Note that it uses the plain info style, not an alert or status style.

## S8.47 Banners.

- **Expected:** Banners (a full-width strip at the top or bottom of a view for system or account messages) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3324; apps/cli/src/tui/tui_app.rs:2018
- **Where to find it:** agi, then press Shift+Tab in the composer (labels found in the code)
- **Steps:**
  1. Start the app with agi and wait for the composer.
  2. Press Shift+Tab once.
  3. Look at the top line of the chat area for a short strip that says Mode: with the current mode name and the cycle key hint, shown for about 2 seconds.
  4. Compare with Expected: a banner across the top of the view. Note that the strip is centred and only as wide as its text, not full width, and it is not an account or system message.

## S8.49 Empty states.

- **Expected:** Empty states (a message and next step shown when a list or view has no content) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2773; apps/cli/src/tui/tui_app.rs:6661
- **Where to find it:** agi, then type /resume in the composer when no saved sessions exist (labels found in the code)
- **Needs:** a clean state with no saved sessions
- **Steps:**
  1. Start the app with agi in a folder with no saved sessions, or use a fresh profile.
  2. Type /resume and press Enter.
  3. Look at the session list box for the line (no sessions to resume).
  4. Compare with Expected: a short message in the list area that says the list is empty. Note that the Expected text asks for a next step, and this message does not give one.

## S8.50 Error states.

- **Expected:** Error states (a view-level message with a recovery action when content fails to load or a request fails) are used in shipped UI.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2902; apps/cli/src/tui/tui_app.rs:2737
- **Where to find it:** agi, then type /mcp in the composer, then open a server whose status shows "✘ failed" (labels found in the code)
- **Needs:** an MCP server configured in the project that fails to connect
- **Steps:**
  1. Start the app with agi and wait for the composer.
  2. Type /mcp and press Enter to see the MCP server list.
  3. Choose a configured server whose status reads ✘ failed and open it.
  4. Look for the recovery item ❯ 1. Retry connection on the server screen.
  5. Compare with Expected: a view-level message with a recovery action. Note that the failed server screen shows the status and the Retry connection action, but no separate sentence explaining the load or request failure.
