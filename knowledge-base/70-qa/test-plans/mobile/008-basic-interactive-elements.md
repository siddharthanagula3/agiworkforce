---
id: "PLAN-mobile-008"
type: "test-plan"
title: "Mobile · 8. Basic interactive elements"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "8"
---
# Mobile · 8. Basic interactive elements

40 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S8.01 Primary buttons.

- **Expected:** The main action in a view uses a visually emphasised primary button style, applied in shipped UI, whose label meets contrast on its fill.
- **Code:** done. Evidence present: apps/mobile/components/ui/button.tsx:45; apps/mobile/components/ui/button.tsx:101; apps/mobile/app/(auth)/reset-password.tsx:74; apps/mobile/app/(auth)/reset-password.tsx:85
- **Where to find it:** Reset password screen (opened from a password recovery link, not from a menu) > Open Web Account button (labels found in the code)
- **Needs:** a password recovery link (or a way to open the reset-password route)
- **Steps:**
  1. Open the password recovery link so the Reset password screen opens (the app routes to (auth)/reset-password).
  2. Read the text: "Password recovery opens in your AGI web account."
  3. Look at the filled teal button "Open Web Account" (default primary style).
  4. Compare the label colour with the button fill: it should be readable.
  5. Compare with Expected: the main action has the emphasised primary style.

## S8.02 Secondary buttons.

- **Expected:** A less prominent secondary (outline/ghost) button style exists and is used beside primary actions in shipped UI.
- **Code:** done. Evidence present: apps/mobile/components/ui/button.tsx:82; apps/mobile/app/(auth)/reset-password.tsx:78; apps/mobile/app/(auth)/reset-password.tsx:85
- **Where to find it:** Reset password screen > Lost Your Email or Two-Factor Device? button (labels found in the code)
- **Needs:** a password recovery link
- **Steps:**
  1. Open the Reset password screen (same route as S8.01).
  2. Look at the buttons under the text: "Open Web Account" is filled, "Lost Your Email or Two-Factor Device?" and "Back to Sign In" have an outline style.
  3. Compare the outline buttons with the filled one: they should look less prominent.
  4. Check that the outline buttons sit beside the primary action.

## S8.03 Destructive buttons.

- **Expected:** Irreversible actions use a distinct destructive button style (danger colour before hover) whose label meets contrast.
- **Code:** done. Evidence present: apps/mobile/components/ui/button.tsx:111
- **Where to find it:** Schedule form for an existing schedule > Delete Schedule button (labels found in the code)
- **Needs:** a paid account with at least one scheduled task (Scheduled tasks need Basic)
- **Steps:**
  1. Open an existing scheduled task (the Schedules screen is opened from "Create schedule" or the schedule list; how Schedules is opened from the main menu was not traced).
  2. Open the edit form of that schedule.
  3. Scroll to the bottom and find the red "Delete Schedule" button.
  4. Look at the label colour (danger colour) and check it is readable.
  5. Compare with Expected: the irreversible action uses the distinct destructive style.

## S8.04 Icon-only buttons.

- **Expected:** Icon-only buttons exist in shipped UI and each carries an accessible name (aria-label or equivalent).
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2323; apps/mobile/app/(app)/chat/[id].tsx:2326; apps/mobile/app/(app)/chat/[id].tsx:2314
- **Where to find it:** Chat screen (phone width) > Open menu icon at the top left of the chat header (labels found in the code)
- **Needs:** a chat with messages; a phone-width layout (not the wide persistent drawer)
- **Steps:**
  1. Open any chat from the chat list.
  2. Find the icon-only button at the top left of the chat header (a menu icon, no words).
  3. Tap it: the side drawer should open.
  4. Check that the button has an accessible name "Open menu" (for example with VoiceOver, if the tester uses it).
  5. Compare with Expected: the icon-only button has an accessible name.

## S8.06 Toggle buttons.

- **Expected:** A toggle button (a button with an on/off pressed state announced to assistive tech) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/app/(app)/camera.tsx:334; apps/mobile/app/(app)/camera.tsx:331
- **Where to find it:** Add to chat (plus button under the composer) > Camera > camera screen > torch icon at the bottom (labels found in the code)
- **Needs:** a phone with a back camera and a torch; camera permission (not possible on a Mac without a camera)
- **Steps:**
  1. Open a chat and tap the "Add to chat" button next to the message box.
  2. Tap "Camera" in the sheet and allow camera access.
  3. On the camera screen, tap the torch button (only shown on the back camera); its label is "Turn torch on".
  4. Tap it again: the label should change to "Turn torch off" and the torch should toggle.
  5. Compare with Expected: a button that shows an on or off pressed state.

## S8.07 Button groups.

- **Expected:** Related buttons are grouped into a labelled button group in shipped UI.
- **Code:** partial. Evidence none: the ledger gives no code location
- **Known to be unfinished:** The approve and deny row of the tool approval controls (CloudToolApprovalControls.tsx) is not exposed as a labelled button group.
- **Where to find it:** Chat reply that asks for tool approval > Allow / Deny buttons under the request (labels found in the code)
- **Needs:** a cloud account and a request that needs tool approval
- **Steps:**
  1. Start a cloud chat whose agent asks to use a tool (the tool approval card appears).
  2. Look at the row of buttons for the decision (Allow and Deny).
  3. Check whether the row is announced as one labelled group (it is not, per the code).
  4. Compare with Expected: related buttons are grouped under one label.

## S8.08 Text links.

- **Expected:** Links in text are visibly styled as links and open their destination when activated.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:133 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:23 (quoted code not found in the file now)
- **Where to find it:** Chat > ask a question whose answer contains a web link > tap the link in the reply (path not confirmed in the code; trust the screen)
- **Needs:** a cloud or local chat that returns links
- **Steps:**
  1. Open a chat and ask for an answer that includes a web address or link (for example, a question that needs sources).
  2. Look at the reply: links should be styled as links (coloured text).
  3. Tap a link and check that its destination opens.
  4. Compare with Expected: the link is styled as a link and opens its destination.

## S8.09 Text inputs.

- **Expected:** Single-line text inputs with a visible label or accessible name are used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/projects.tsx:451; apps/mobile/app/(app)/(tabs)/projects.tsx:450
- **Where to find it:** Projects tab > Search projects field; or Settings > Personalization > Full Name field (labels found in the code)
- **Needs:** none for the Projects search; the Personalization field needs a signed-in account
- **Steps:**
  1. Tap the Projects tab at the bottom.
  2. Tap the search field with the text "Search projects" and type a word.
  3. Check the list filters as you type, and that the field has a clear button.
  4. Alternatively open Personalization and tap the "Full Name" field, then type a name.
  5. Compare with Expected: a single-line field with a visible label or accessible name.

## S8.10 Multiline inputs.

- **Expected:** A multi-line text area that accepts newlines is used in shipped UI (e.g. the composer).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:429; apps/mobile/src/features/chat/components/ChatInput.tsx:1059 (quoted code not found in the file now)
- **Where to find it:** Chat tab > message box at the bottom (placeholder "Type or hold to talk") (labels found in the code)
- **Needs:** none; the placeholder may differ when offline
- **Steps:**
  1. Open the Chat tab and tap the message box at the bottom.
  2. Type one line, then press the Return key on the keyboard.
  3. Check that the cursor moves to a new line inside the same box and the text is not sent.
  4. Compare with Expected: a multi-line text area that accepts new lines is used.

## S8.11 Search fields.

- **Expected:** A search field (search semantics, placeholder or label, filters as typed or on submit) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/ChatsListScreen.tsx:930; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:814; apps/mobile/src/features/chat/ChatsListScreen.tsx:929
- **Where to find it:** Search icon in the drawer (opened from the Open menu icon) > Search field with placeholder "Search" (labels found in the code)
- **Needs:** a few chats to search
- **Steps:**
  1. Open the side drawer from the menu icon at the top left of the chat screen.
  2. Tap the search icon in the drawer (its word is a translation key "search"; no visible word was found).
  3. Type text in the field with placeholder "Search".
  4. Check that the list of chats, projects, files and artifacts filters as you type.
  5. Compare with Expected: a search field that filters the list.

## S8.12 Password fields.

- **Expected:** Secret entry (passwords, API keys, tokens) uses a masked field in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:204; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:198
- **Where to find it:** Connectors > Add custom MCP > Auth token (optional) field (labels found in the code)
- **Needs:** a signed-in account (cloud connectors)
- **Steps:**
  1. Open Connectors from the Settings screen.
  2. Tap "Add custom MCP".
  3. In the modal, tap the "Auth token (optional)" field and type a few characters.
  4. Check that the characters show as dots (masked), not plain text.
  5. Compare with Expected: secret entry uses a masked field.

## S8.13 One-time-code fields.

- **Expected:** A one-time-code field (short numeric code, one-time-code autofill or paste) is used where the product asks for a code.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** Sign-in screen > type email > Continue > Use an email code instead > Verification code field (labels found in the code)
- **Needs:** an email inbox you can read (the code is sent by an outside email service)
- **Steps:**
  1. On the sign-in screen, tap "Email address" and type your email.
  2. Tap "Continue".
  3. Tap "Use an email code instead" if it is shown.
  4. Look for the field labelled "Verification code" with the text "Enter the code sent to" and your email.
  5. Type the code from your email (or paste it) and check that it accepts a one-time code.

## S8.14 Checkboxes.

- **Expected:** Checkboxes (independent on/off choices in a list, with checked state exposed) are used in shipped UI.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/notifications/index.tsx:637 (quoted code not found in the file now); apps/mobile/src/features/settings/notifications/index.tsx:636 (quoted code not found in the file now)
- **Where to find it:** Settings > Notifications > Quiet hours > Days row (Sunday to Saturday) (labels found in the code)
- **Steps:**
  1. Open Notifications from Settings and tap "Quiet hours".
  2. Open the time and focus screen and find the "Days" row with one letter per day.
  3. Tap a day letter and check that it toggles on or off.
  4. Check the day shows as checked (selected).
  5. Compare with Expected: independent on or off choices with checked state.

## S8.15 Radio groups.

- **Expected:** A radio group (mutually exclusive options, all visible, with checked state exposed) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/StyleSelector.tsx:172; apps/mobile/src/features/chat/components/StyleSelector.tsx:159
- **Where to find it:** Chat > Add to chat > style row (opens the style selector) > Normal, Concise, Explanatory, Learning, Formal (labels found in the code)
- **Steps:**
  1. Open a chat and tap the "Add to chat" button.
  2. Find the style entry in the sheet and tap it (its visible label was not found in the code).
  3. In the style list, tap "Concise" and check that the selected row is marked selected.
  4. Tap "Formal" and check that the selection moves.
  5. Compare with Expected: one choice at a time, all options visible, with checked state.

## S8.16 Switches.

- **Expected:** Switches (immediate on/off settings with switch semantics) are used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/integrations.tsx:209; apps/mobile/app/(app)/settings/integrations.tsx:211; apps/mobile/components/ui/switch.tsx:13
- **Where to find it:** Settings > Device Integrations > calendar row switch (labels found in the code)
- **Needs:** a device with calendar access (the switch asks for permission)
- **Steps:**
  1. Open Device Integrations from Settings.
  2. Find the calendar row with a switch on its right.
  3. Tap the switch and check it turns on or off immediately.
  4. Compare with Expected: an immediate on or off setting with switch semantics.

## S8.17 Segmented controls.

- **Expected:** A segmented control (a small set of mutually exclusive options shown as joined segments) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ModeToggle.tsx:115; apps/mobile/src/features/chat/components/ModeToggle.tsx:123
- **Where to find it:** Open menu (top left of a chat) > drawer > Local | Cloud segmented control (labels found in the code)
- **Needs:** a Cloud-enabled account to change to Cloud (Cloud is disabled otherwise)
- **Steps:**
  1. Open the side drawer from the menu icon.
  2. Find the two-part control with the segments "Local" and "Cloud".
  3. Tap "Local" and check it is highlighted; tap "Cloud" and check the highlight moves.
  4. Compare with Expected: a small set of exclusive options shown as joined segments.

## S8.18 Single-select menus.

- **Expected:** A single-select menu (choose one value from a list) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:814; apps/mobile/app/(app)/models.tsx:250; apps/mobile/app/(app)/models.tsx:244
- **Where to find it:** Settings > Models (row shows the current model) > model list; or the Choose a model control in the chat (labels found in the code)
- **Needs:** none; some models need a paid plan
- **Steps:**
  1. Open the Models row from Settings (the row is labelled "Models").
  2. Tap a model in the list.
  3. Check the chosen model is marked selected and the row value updates.
  4. Compare with Expected: one value chosen from a list.

## S8.19 Searchable comboboxes.

- **Expected:** A searchable combobox (type to filter a list, then pick one, with listbox semantics or keyboard navigation) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:806; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:814; apps/mobile/app/(app)/chat/[id].tsx:2282
- **Where to find it:** Settings > Models, or Choose a model > search field "Search models…" (labels found in the code)
- **Steps:**
  1. Open the model picker (Models row or Choose a model).
  2. Tap the field with the placeholder "Search models…" and type part of a model name.
  3. Check the list filters as you type.
  4. Tap a result and check it is chosen.
  5. Compare with Expected: type to filter, then pick one.

## S8.23 Sliders.

- **Expected:** A slider (drag or arrow keys to set one value on a scale) is used in shipped UI.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/personalization/index.tsx:123 (quoted code not found in the file now); apps/mobile/src/features/settings/personalization/index.tsx:128 (quoted code not found in the file now)
- **Where to find it:** Settings > Voice > Speed slider (also Pitch) (labels found in the code)
- **Steps:**
  1. Open Voice from Settings.
  2. Find the row labelled "Speed" with a value such as 1.00x.
  3. Drag the slider or tap near its ends, and check the value changes in steps.
  4. Compare with Expected: one value set on a scale by dragging.

## S8.25 Date pickers.

- **Expected:** A date picker (calendar or native date control) is used where a date is entered in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleDateTimeField.tsx:123
- **Where to find it:** Schedules > Create schedule > Repeat set to once > Date field "Choose a date" (labels found in the code)
- **Needs:** a paid account that allows scheduled tasks (Basic or higher)
- **Steps:**
  1. Open the schedules screen and tap the "Create schedule" button.
  2. Choose the once recurrence option (its word was not found in the code).
  3. Tap the "Date" field showing "Choose a date".
  4. Pick a date on the calendar and check the field shows that date.
  5. Compare with Expected: a date picker is used where a date is entered.

## S8.26 Time pickers.

- **Expected:** A time picker (native or custom time control) is used where a time is entered in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleDateTimeField.tsx:123
- **Where to find it:** Schedules > Create schedule > recurrence with a time > "Preferred time" field "Choose a time" (labels found in the code)
- **Needs:** a paid account that allows scheduled tasks
- **Steps:**
  1. Open "Create schedule" and choose a recurrence that shows a time (the time row appears for supported recurrences).
  2. Tap the "Preferred time" field showing "Choose a time" or its value (default 09:00).
  3. Change the time in the spinner and tap done if shown.
  4. Check the field shows the new time.
  5. Compare with Expected: a time control is used where a time is entered.

## S8.27 Timezone pickers.

- **Expected:** A time zone picker (searchable list of zones, defaulting to the device zone) is used where schedules take a zone.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/TimezonePickerField.tsx:36; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:319
- **Where to find it:** Schedules > Create schedule > Time zone row (shows the current zone) > search field "Search time zones" (labels found in the code)
- **Needs:** a paid account that allows scheduled tasks
- **Steps:**
  1. Open "Create schedule" and scroll to the zone row labelled with "Time zone:" and the zone name.
  2. Tap the row to open the time zone list.
  3. Type part of a zone name in the "Search time zones" field.
  4. Check the list filters, and that the device zone is the default.
  5. Compare with Expected: a searchable list of zones, defaulting to the device zone.

## S8.28 Color pickers.

- **Expected:** A colour picker (swatches or a colour input) is used where the user chooses a colour.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/accent-color/index.tsx:51; apps/mobile/src/features/settings/accent-color/index.tsx:54; apps/mobile/src/features/settings/index.tsx:474 (quoted code not found in the file now)
- **Where to find it:** Settings > Accent Color > colour swatches (Neutral, Blue, Cyan, Green, Lime) (some labels not found in the code; trust the screen)
- **Steps:**
  1. Open Settings and tap "Accent Color".
  2. Tap a swatch such as "Blue" and check the swatch is selected.
  3. Check the accent colour changes in the app (for example, buttons turn blue).
  4. Compare with Expected: a colour choice from swatches.

## S8.29 File inputs.

- **Expected:** A file input (choose files from the device) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:1606; apps/mobile/app/(app)/chat/[id].tsx:1601
- **Where to find it:** Chat > Add to chat > File (labels found in the code)
- **Needs:** a file to upload on the device
- **Steps:**
  1. Open a chat and tap the "Add to chat" button.
  2. Tap "File" in the sheet.
  3. Pick a file from the device document picker and confirm.
  4. Check that the file appears as an attachment above the message box.
  5. Compare with Expected: a file input chooses files from the device.

## S8.31 Tabs.

- **Expected:** Tabs (a tablist switching between panels, with the selected tab exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/app/(app)/projects/[id].tsx:258; apps/mobile/app/(app)/projects/[id].tsx:250
- **Where to find it:** Projects tab > open a project > tabs "Chats", "Sources", "Artifacts", "Routines" ("Work" when shown) (labels found in the code)
- **Needs:** a project (create one first if none exists)
- **Steps:**
  1. Tap the Projects tab at the bottom and open any project.
  2. Look at the row of tabs at the top of the project.
  3. Tap "Sources" and check its panel appears and its tab is marked selected.
  4. Tap "Artifacts" and then "Routines", checking each panel changes.
  5. Compare with Expected: a tab row that switches panels, with the selected tab marked.

## S8.32 Accordions.

- **Expected:** An accordion (a stack of sections that expand and collapse, each with a labelled header) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:1044; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:1037
- **Where to find it:** Open menu > New chat > send a message that makes the assistant use a tool (for example a web search) > tap the Agent activity row under the reply (labels found in the code)
- **Needs:** a signed-in account that can send chat messages that use tools
- **Steps:**
  1. Tap Open menu, then tap the new-chat button in the chat header (New chat).
  2. Send a question that needs a tool, such as a web search.
  3. Find the Agent activity row under the assistant reply.
  4. Tap the row; it should expand to show the activity and collapse on a second tap.
  5. Compare with Expected: the row's expanded state changes on each tap and the header is labelled as a button.

## S8.33 Disclosure controls.

- **Expected:** A disclosure control (a toggle that shows or hides one block of detail, exposing its expanded state) is used in shipped UI.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CollapsibleSources.tsx:90 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1017 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:2282
- **Where to find it:** Open menu > New chat > ask a question that returns web sources > tap View N sources under the reply (labels found in the code)
- **Needs:** a signed-in account and a question that returns web sources
- **Steps:**
  1. Tap Open menu, then the new-chat button (New chat).
  2. Ask a question that returns web sources.
  3. Under the reply, tap the View N sources row (N is the number of sources).
  4. Look for the expanded list titled Sources (or Sources so far while the answer is still streaming).
  5. Compare with Expected: the block shows and hides, and the expanded state changes on each tap.

## S8.34 Dropdown menus.

- **Expected:** Dropdown menus (a button that opens a list of actions with menu keyboard behaviour) are used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:92; apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:91
- **Where to find it:** Settings > Voice > open the voice call screen > tap the audio route button in the live voice bar (Audio route, Automatic) (labels found in the code)
- **Needs:** a microphone and a device that supports switching the audio route
- **Steps:**
  1. Open Settings and tap Voice.
  2. Start a voice call from the voice screen (the start control was not confirmed in the code).
  3. In the live voice bar, tap the audio route button, labelled Audio route followed by the current route.
  4. See whether a list of routes opens (Automatic, Speaker, Bluetooth, Headset) and choose one.
  5. Compare with Expected: the list opens, and the button label changes to the chosen route.

## S8.35 Context menus.

- **Expected:** A context menu (right-click or long-press opens actions for the item under the pointer) is used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/projects.tsx:401; apps/mobile/app/(app)/(tabs)/projects.tsx:400
- **Where to find it:** Open menu > long-press a chat in the list > choose from the menu (Rename, Archive, Delete and others) (labels found in the code)
- **Needs:** a chat in the list
- **Steps:**
  1. Tap Open menu to open the side list of chats.
  2. Long-press a chat title.
  3. Look for the action menu that opens for that chat, listing actions such as Rename.
  4. Compare with Expected: the menu opens for the chat you pressed and lists its actions; tapping outside closes it.

## S8.40 Badges.

- **Expected:** Badges (small status or count markers attached to an item) are used in shipped UI.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:312 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:2282
- **Where to find it:** Open menu > Notifications, then look at the priority tag on each notification (labels found in the code)
- **Needs:** a notification with High or Critical priority (not every account has one)
- **Steps:**
  1. Tap Open menu.
  2. Tap the notifications link (its accessible name reads Open notifications with the unread count).
  3. Look at the small tag on each notification row, such as High or Critical.
  4. Compare with Expected: each notification shows a small status or priority marker attached to it.
  5. Also open Agents, tap an agent, and look for the status badge at the top of the agent screen.

## S8.41 Tags.

- **Expected:** Tags (small labels that categorise or describe an item, distinct from status badges) are used in shipped UI.
- **Code:** done. Evidence moved: apps/mobile/src/features/artifacts/index.tsx:327 (quoted code not found in the file now); apps/mobile/src/features/artifacts/index.tsx:26 (quoted code not found in the file now)
- **Where to find it:** Search > type Artifacts > tap Artifacts > look at the small label on each artifact card (labels found in the code)
- **Needs:** at least one artifact in the account
- **Steps:**
  1. Tap Search (the search icon in the side menu).
  2. Type Artifacts and tap the Artifacts result under Go to.
  3. Look at the small label on each non-image artifact card; it shows the artifact's language or kind.
  4. Compare with Expected: the label names what the item is; it is a type label, not a free tag the user adds.

## S8.42 Avatars.

- **Expected:** Message authors are distinguished visually and for assistive technology (R-n: avatar or equivalent marker plus an accessible label).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:676 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1129
- **Where to find it:** Open menu > New chat > send any message > look at the author name for your message (You) and for the reply (the model name or AGI) (labels found in the code)
- **Needs:** a signed-in account that can get a reply
- **Steps:**
  1. Tap Open menu, then the new-chat button (New chat).
  2. Send any message and wait for the reply.
  3. Look at who wrote each message: your message is marked You, the reply uses the model name or AGI.
  4. Compare with Expected: the two authors are told apart, and a screen reader hears the author label on the message.

## S8.43 Progress indicators.

- **Expected:** Progress indicators (determinate bars or indeterminate spinners with an accessible name) are used in shipped UI.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/companion/agent/[id].tsx:252; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1102 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:2282
- **Where to find it:** Open menu > Agents > tap an agent that is running > look at the bar and the Step N of M line under it (labels found in the code)
- **Needs:** a running cloud agent
- **Steps:**
  1. Tap Open menu; if Agents is not listed, tap More first.
  2. Tap Agents, then tap an agent whose status is running or waiting.
  3. Look at the progress bar and the line that reads Step N of M, when both counts are known.
  4. Compare with Expected: the bar fills as steps complete and the line changes.
  5. For a spinner, open Projects while cloud projects are syncing and look for Loading projects.

## S8.44 Skeleton loaders.

- **Expected:** Skeleton placeholders stand in for content while it loads.
- **Code:** done. Evidence present: apps/mobile/app/(app)/schedules/index.tsx:206; apps/mobile/app/(app)/chat/[id].tsx:2282
- **Where to find it:** Open menu > More > Schedules, while the list is loading for the first time (labels found in the code)
- **Needs:** a signed-in account; a slow connection makes the placeholders easier to see
- **Steps:**
  1. Tap Open menu.
  2. Tap More if Schedules is folded, then tap Schedules.
  3. Look during the first load: three grey placeholder cards appear before the list.
  4. Compare with Expected: the placeholders stand in for schedule cards and are replaced when the data arrives.

## S8.45 Toasts.

- **Expected:** Toasts (transient, non-blocking notifications that dismiss themselves) are used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/shared/components/Toast.tsx:14
- **Where to find it:** Open menu > long-press a chat > Archive > look at the bar at the bottom: Chat archived. Find it in Settings, Archived chats. with Undo (labels found in the code)
- **Needs:** an AGI Cloud chat (signed in)
- **Steps:**
  1. Tap Open menu.
  2. Long-press an AGI Cloud chat, then tap Archive.
  3. Look for the bar that appears above the bottom edge with the archive message and an Undo button.
  4. Wait and watch: it should leave by itself after about 5 seconds (about 8 seconds when it has a button).
  5. Compare with Expected: it does not block the screen and it dismisses itself.

## S8.46 Inline alerts.

- **Expected:** Inline alerts (a message block inside the content, with alert or status semantics, for warnings or errors) are used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/app/(public)/onboarding.tsx:891; apps/mobile/app/(public)/onboarding.tsx:790
- **Where to find it:** Open menu > New chat > turn on airplane mode > send a message > look at the alert above the message box: Message failed to send: (labels found in the code)
- **Needs:** a way to make sending fail, such as airplane mode
- **Steps:**
  1. Tap Open menu, then the new-chat button (New chat).
  2. Turn on airplane mode.
  3. Type a message and send it.
  4. Look at the alert above the message box; it has alert semantics and starts with Message failed to send:.
  5. Compare with Expected: a clear error appears inline with the cause, and the reply can be retried from the banner.

## S8.47 Banners.

- **Expected:** Banners (a full-width strip at the top or bottom of a view for system or account messages) are used in shipped UI.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:1467 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:2718
- **Where to find it:** Open menu > New chat > send a message to a provider that needs consent > look at the strip above the message box with the Review button (labels found in the code)
- **Needs:** an account and a provider that triggers the consent strip
- **Steps:**
  1. Tap Open menu, then the new-chat button (New chat).
  2. Send a message to a provider whose use is not yet approved.
  3. Look at the full-width strip above the message box; it has a globe icon, a message and a Review button.
  4. Tap Review or the dismiss control to confirm they respond.
  5. Compare with Expected: the strip sits in its own band, does not cover the chat, and can be dismissed.

## S8.48 Pagination controls.

- **Expected:** Pagination controls (next/previous, page numbers or an explicit "Load more") let the user move through a long list.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/archived-chats.tsx:588; apps/mobile/src/features/library/index.tsx:964
- **Where to find it:** Open menu > scroll to the bottom of the chat list > tap Load older chats (also Settings > Data Controls > Archived chats > Load more) (labels found in the code)
- **Needs:** an AGI Cloud account with more chats than one page
- **Steps:**
  1. Tap Open menu.
  2. Scroll to the bottom of the chat list.
  3. Tap Load older chats and wait for the next page.
  4. Compare with Expected: the next page of chats appears, and the button goes away when no older chats remain.
  5. Optionally open Settings > Data Controls > Archived chats and tap Load more.

## S8.49 Empty states.

- **Expected:** Empty states (a message and next step shown when a list or view has no content) are used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/app/(app)/schedules/index.tsx:352; apps/mobile/app/(app)/chat/[id].tsx:2282
- **Where to find it:** Open menu > More > Schedules, with no schedules in the account (labels found in the code)
- **Needs:** a paid account that can create schedules (a Free account sees the locked title instead)
- **Steps:**
  1. Tap Open menu, then More if needed, then Schedules.
  2. Look at the empty state: it shows the title No Schedules and a short description.
  3. Look for the Try a template section and the Create Schedule button.
  4. Compare with Expected: the message says what the view is for and gives a next step.

## S8.50 Error states.

- **Expected:** Error states (a view-level message with a recovery action when content fails to load or a request fails) are used in shipped UI.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/ChatsListScreen.tsx:816
- **Where to find it:** Open menu > (the chat list fails to load on an AGI Cloud account) > tap Retry under the error text (labels found in the code)
- **Needs:** an AGI Cloud account and a network failure (airplane mode)
- **Steps:**
  1. Turn on airplane mode, then tap Open menu to open the chat list.
  2. Look for the red error text and the Retry button in the list.
  3. Turn off airplane mode, tap Retry, and check that the chats load.
  4. Compare with Expected: the error sits in the list with a recovery button, and the list fills once Retry works.
