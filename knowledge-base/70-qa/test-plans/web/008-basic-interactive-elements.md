---
id: "PLAN-web-008"
type: "test-plan"
title: "Web · 8. Basic interactive elements"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "8"
---
# Web · 8. Basic interactive elements

47 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S8.01 Primary buttons.

- **Expected:** The main action in a view uses a visually emphasised primary button style, applied in shipped UI, whose label meets contrast on its fill.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Button.tsx:13; apps/web/features/chat/components/messages/EditableMessage.tsx:141; apps/web/features/chat/components/messages/EditableMessage.tsx:143
- **Where to find it:** Chat > hover one of your sent messages > Edit message (pencil icon) > Save & Retry (labels found in the code)
- **Needs:** a conversation with a message you sent
- **Steps:**
  1. Sign in and open a conversation that has a message you sent.
  2. Hover your sent message and click the pencil icon (Edit message).
  3. Change the text in the edit box.
  4. Look at the Save & Retry button: it should look like the emphasised main action, with readable label text, compared with Cancel.

## S8.02 Secondary buttons.

- **Expected:** A less prominent secondary (outline/ghost) button style exists and is used beside primary actions in shipped UI.
- **Code:** done. Evidence moved: packages/ui/ui/src/primitives/Button.tsx:15 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:338; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:340
- **Where to find it:** Chat > conversation title menu > Share… > Copy (next to the Conversation link box) (labels found in the code)
- **Needs:** a conversation you can share
- **Steps:**
  1. Open a conversation and open its title menu.
  2. Click Share….
  3. Create a link if the dialog asks, then look at the Copy button beside the Conversation link box.
  4. Compare: Copy should look like a lighter outline button, not the filled primary style.

## S8.03 Destructive buttons.

- **Expected:** Irreversible actions use a distinct destructive button style (danger colour before hover) whose label meets contrast.
- **Code:** done. Evidence moved: packages/ui/ui/src/primitives/Button.tsx:14 (quoted code not found in the file now); apps/web/features/chat/components/share/ShareConversationDialog.tsx:415; apps/web/features/chat/components/share/ShareConversationDialog.tsx:304; apps/web/shared/components/__tests__/theme-contrast.test.ts:374
- **Where to find it:** Chat > conversation title menu > Share… > Revoke every link (red button, shown only when the link list is incomplete and no link is active) (labels found in the code)
- **Needs:** a shared conversation whose link list is incomplete (hard to create by hand)
- **Steps:**
  1. Open a conversation title menu and click Share….
  2. Look for the Revoke every link button in the dialog footer.
  3. If it is missing, the link list is complete, so the button is not shown; note that.
  4. If it appears, hover and compare its red danger colour with the other buttons.

## S8.04 Icon-only buttons.

- **Expected:** Icon-only buttons exist in shipped UI and each carries an accessible name (aria-label or equivalent).
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Button.tsx:28; apps/web/features/chat/components/messages/MessageBubble.tsx:3713; apps/web/features/chat/components/messages/MessageBubble.tsx:3733
- **Where to find it:** Chat > hover one of your sent messages > the icon-only Retry and Edit buttons (tooltips Retry and Edit) (labels found in the code)
- **Needs:** a conversation with a message you sent
- **Steps:**
  1. Sign in and open a conversation with a message you sent.
  2. Hover the sent message so the action icons appear.
  3. Hover the icon buttons to see the tooltips Retry and Edit.
  4. Check that each icon button has a name for screen readers (aria-label Retry this message and Edit message) using a screen reader or accessibility inspector.

## S8.06 Toggle buttons.

- **Expected:** A toggle button (a button with an on/off pressed state announced to assistive tech) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5977; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > the + button at the left of the message box (Add attachments and tools) (labels found in the code)
- **Steps:**
  1. Open a chat and find the + button beside the message box.
  2. Click it and see whether a menu opens.
  3. If a tool or attachment is active, check that the + button shows a count badge.
  4. Look at the button's pressed state in an accessibility inspector: it should expose aria-pressed and aria-expanded.

## S8.07 Button groups.

- **Expected:** Related buttons are grouped into a labelled button group in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/DictationStrip.tsx:89; apps/web/features/chat/components/Composer/DictationStrip.tsx:100
- **Where to find it:** Chat > composer > start voice dictation > the Voice dictation strip with its Discard recording button (labels found in the code)
- **Needs:** a microphone and microphone permission
- **Steps:**
  1. Open a chat and start voice dictation from the composer.
  2. Look at the strip that appears above the message box.
  3. Hover or focus the round X button to see its name Discard recording.
  4. Compare the grouped controls with the group name Voice dictation in an accessibility inspector.

## S8.08 Text links.

- **Expected:** Links in text are visibly styled as links and open their destination when activated.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:267 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:804
- **Where to find it:** Chat > any assistant reply that contains a web link (path not confirmed in the code; trust the screen)
- **Needs:** a Free account or a paid account; an internet connection
- **Steps:**
  1. Send a message that asks for a reply with a web link, such as a website address.
  2. Find a link in the reply.
  3. Check it is styled as a link (coloured, underlined or otherwise marked).
  4. Click it and see that it opens its destination.

## S8.09 Text inputs.

- **Expected:** Single-line text inputs with a visible label or accessible name are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:156; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:168
- **Where to find it:** Projects > Create project > Project name (labels found in the code)
- **Steps:**
  1. Open Projects from the sidebar and click Create project.
  2. Click into the Project name box.
  3. Type a name and check the box has a visible label or placeholder.
  4. Click elsewhere and check the box is still announced with its name.

## S8.10 Multiline inputs.

- **Expected:** A multi-line text area that accepts newlines is used in shipped UI (e.g. the composer).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2461; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:374; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:377
- **Where to find it:** Chat > the message box at the bottom (placeholder Ask anything. Type / for commands) (labels found in the code)
- **Steps:**
  1. Open a chat and click into the message box.
  2. Type a first line, press Return, type a second line.
  3. Check the box keeps both lines and grows in height.
  4. Note which key adds a new line and which key sends the message; the code did not confirm the newline key.

## S8.11 Search fields.

- **Expected:** A search field (search semantics, placeholder or label, filters as typed or on submit) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:639; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:295; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:297
- **Earlier check in the running app:** PASS: E003 [PASS; interaction]: Searching QA_CHECKLIST_OK returned three matching messages across two conversations with highlighted matches.
- **Where to find it:** Chat > the model name at the bottom of the composer (Models picker) > Search models (labels found in the code)
- **Steps:**
  1. Open a chat and click the model name to open the Models picker.
  2. Click into the Search models box.
  3. Type a model name and check the list filters as you type.
  4. Clear the box and check the full list comes back.

## S8.12 Password fields.

- **Expected:** Secret entry (passwords, API keys, tokens) uses a masked field in shipped UI.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorApiKeyForm.tsx:194; apps/web/features/connectors/components/ConnectorApiKeyForm.tsx:198
- **Where to find it:** Connectors > pick a connector that uses an API key > Add API key (labels found in the code)
- **Needs:** a connector that uses an API key
- **Steps:**
  1. Open Connectors and pick a connector that takes an API key.
  2. Click Add API key.
  3. Type a value into the API key box.
  4. Check the text is hidden as dots (masked) instead of shown in clear text.

## S8.13 One-time-code fields.

- **Expected:** A one-time-code field (short numeric code, one-time-code autofill or paste) is used where the product asks for a code.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthCodeStep.tsx:154; apps/web/features/auth/AuthCodeStep.tsx:66 (quoted code not found in the file now)
- **Where to find it:** Sign-in > enter your email > Continue > Check your inbox (code box) (labels found in the code)
- **Needs:** an email inbox that receives the sign-in code
- **Steps:**
  1. Start sign-in with an email address and click Continue.
  2. On the Check your inbox screen, look for the code box.
  3. Paste or type the numeric code from the email.
  4. Check the box accepts numbers and offers one-time-code autofill where the browser supports it.

## S8.14 Checkboxes.

- **Expected:** Checkboxes (independent on/off choices in a list, with checked state exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:237; apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:239
- **Where to find it:** not found in the code. The checkbox is in EnhancedExportDialog.tsx and mounted from WebChatPage.tsx:7934, but the menu item that opens the export dialog was not found, so the path is unverified. Searched for the dialog's trigger in the chat title menu.
- **Needs:** a conversation you can export

## S8.15 Radio groups.

- **Expected:** A radio group (mutually exclusive options, all visible, with checked state exposed) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:216; apps/web/features/onboarding/components/OnboardingWizard.tsx:151
- **Where to find it:** First sign-in onboarding > Step 2 of 2 > What do you want to do first? (labels found in the code)
- **Needs:** a new account that has not finished onboarding
- **Steps:**
  1. Start a new account or one that has not finished onboarding.
  2. On Step 1 type a name and continue.
  3. On Step 2, read the question What do you want to do first? and pick one option.
  4. Check only one option is selected at a time and the selected one shows as checked.

## S8.16 Switches.

- **Expected:** Switches (immediate on/off settings with switch semantics) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1914; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1916
- **Where to find it:** Chat > the Effort button next to the model name in the composer > the Effort row switch (aria-label Toggle extended thinking) (labels found in the code)
- **Needs:** a model that supports extended thinking
- **Steps:**
  1. Choose a model that supports extended thinking and open the Effort button next to the model name.
  2. Find the row labelled Effort with a switch.
  3. Click the switch and see it turn on or off immediately.
  4. Check that the switch state matches the Effort button text (Off or the effort name).

## S8.17 Segmented controls.

- **Expected:** A segmented control (a small set of mutually exclusive options shown as joined segments) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.module.css:82; apps/web/features/code/components/CodeRail.tsx:375; apps/web/app/chat/page.tsx:16
- **Where to find it:** Code > top of the left rail: the two-part icon control (Code and Go to chat) (labels found in the code)
- **Needs:** access to the Code area
- **Steps:**
  1. Open the Code area from the app.
  2. Look at the top row of the left rail for the two-part control.
  3. Hover each part; the current one (Code) is marked as the current page.
  4. Click the Go to chat part and check it opens chat.

## S8.18 Single-select menus.

- **Expected:** A single-select menu (choose one value from a list) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:561; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:563
- **Where to find it:** Search (the search dialog) > filter toggle > Message Type (labels found in the code)
- **Needs:** a conversation with several messages from you and the assistant
- **Steps:**
  1. Open the search dialog from the app.
  2. Open the filter panel using its toggle (the toggle has no visible text in code).
  3. Click the Message Type box and pick each option: All messages, My messages, AI responses, System messages.
  4. Check the list of results changes to match the chosen type.

## S8.19 Searchable comboboxes.

- **Expected:** A searchable combobox (type to filter a list, then pick one, with listbox semantics or keyboard navigation) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/shared/components/CommandPalette/CommandPalette.tsx:440; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:639
- **Where to find it:** Press Cmd+K (command palette) > Search chats and actions (labels found in the code)
- **Steps:**
  1. Press Cmd+K.
  2. Type part of a chat title or an action name into the box.
  3. Use the arrow keys to move through the list and press Return to pick one.
  4. Check the list filters as you type and the highlighted item is the one picked.

## S8.20 Multiselect controls.

- **Expected:** A multiselect control (pick several values from one list, each selection shown and removable) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeChangesPanel.tsx:372; apps/web/features/code/components/CodeChangesPanel.tsx:374
- **Where to find it:** Code > Changes panel > the More button (...) > Changes settings > Terminal (labels found in the code)
- **Needs:** access to the Code area
- **Steps:**
  1. Open Code and open the Changes panel.
  2. Click the More button (...).
  3. Tick or untick Terminal and Exit codes (if shown) under Changes settings.
  4. Check each choice shows as checked or unchecked, and the panel changes to match.

## S8.21 Token/chip inputs.

- **Expected:** A token/chip input (typed entries become removable chips inside or beside the field) is used in shipped UI.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/ChipInput.tsx:34; apps/web/features/settings/sections/WorkspacePolicySection.tsx:690; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:275
- **Where to find it:** Workspace console > Policy > IP allow list (labels found in the code)
- **Needs:** a workspace admin account
- **Steps:**
  1. Sign in as a workspace admin and open the Policy page in the workspace console.
  2. Find the IP allow list section.
  3. Type an address or block such as 203.0.113.0/24 and press Return or type a comma.
  4. Check the entry becomes a removable chip, and click its remove control to check it is removed.

## S8.22 Numeric steppers.

- **Expected:** A numeric stepper (number field with increment/decrement) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:346; apps/web/features/schedules/components/ScheduleForm.tsx:352
- **Where to find it:** Scheduled > New task > Repeat Every (labels found in the code)
- **Steps:**
  1. Open Scheduled from the sidebar and click New task.
  2. Find the Repeat Every box with an interval recurrence.
  3. Click the box and use the up and down arrows or type a number.
  4. Check the value changes by one per step and cannot go below 1.

## S8.23 Sliders.

- **Expected:** A slider (drag or arrow keys to set one value on a scale) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1950; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1955
- **Where to find it:** Chat > the Effort button next to the model name in the composer > Effort slider (labels found in the code)
- **Needs:** a model that has several effort levels
- **Steps:**
  1. Choose a model that offers several effort levels and open the Effort button beside the model name.
  2. Drag the slider or press the left and right arrow keys.
  3. Check the selected level label updates as the slider moves.
  4. Compare the label with the Effort row text.

## S8.25 Date pickers.

- **Expected:** A date picker (calendar or native date control) is used where a date is entered in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:590; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:591; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** UI_ONLY: E004 [UI_ONLY; visible UI]: Date-range, message-type and archived filters are exposed; filtered-result accuracy was not yet exercised.
- **Where to find it:** Search (the search dialog) > filter toggle > From Date > Select date (labels found in the code)
- **Needs:** a conversation with messages on several dates
- **Steps:**
  1. Open the search dialog and open its filter panel.
  2. Click the From Date button labelled Select date.
  3. Pick a day in the calendar that opens.
  4. Check the button shows the chosen date in the format Month day, year.

## S8.26 Time pickers.

- **Expected:** A time picker (native or custom time control) is used where a time is entered in shipped UI.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:391; apps/web/features/schedules/components/ScheduleForm.tsx:394
- **Where to find it:** Scheduled > New task > Local Time (labels found in the code)
- **Steps:**
  1. Open Scheduled and click New task.
  2. Choose a recurrence of daily, weekly or monthly.
  3. Click the Local Time field and set a time.
  4. Check the field shows the chosen time in the browser's native time control.

## S8.27 Timezone pickers.

- **Expected:** A time zone picker (searchable list of zones, defaulting to the device zone) is used where schedules take a zone.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:64; apps/web/features/schedules/components/ScheduleForm.tsx:122; apps/web/features/schedules/components/ScheduleForm.tsx:514; apps/web/features/schedules/components/ScheduleForm.tsx:523; apps/web/features/schedules/lib/schedule-form.ts:77
- **Where to find it:** Scheduled > New task > Time Zone (labels found in the code)
- **Steps:**
  1. Open Scheduled and click New task.
  2. Check the Time Zone box already holds your device zone (the code uses the browser's zone, with UTC as fallback).
  3. Click the box, type a city or region such as Lon and pick a suggestion.
  4. Check the suggestion list is searchable and the chosen zone stays in the box.

## S8.28 Color pickers.

- **Expected:** A colour picker (swatches or a colour input) is used where the user chooses a colour.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:891; apps/web/app/chat/projects/[id]/page.tsx:893
- **Where to find it:** Projects > open a project > Colour (labels found in the code)
- **Needs:** a project to open (a Free account can create one)
- **Steps:**
  1. Open the Projects page and open one of your projects.
  2. Find the section headed Colour.
  3. Click one of the colour circles and check that the project's colour changes.
  4. Click the dashed circle labelled Custom colour, pick a colour, and check that the chosen colour is used.

## S8.29 File inputs.

- **Expected:** A file input (choose files from the device) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7016
- **Where to find it:** Chat composer > files button > Upload from device (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open a new chat.
  2. Click the files button in the message box (its exact label was not found in the code).
  3. Click Upload from device.
  4. Choose a file in the system file picker and check that the file appears as an attachment in the message box.

## S8.30 Upload dropzones.

- **Expected:** An upload drop zone accepts files dragged onto it and shows a drag-over state.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301
- **Where to find it:** Chat > drag a file from Finder over the app window (path not confirmed in the code; trust the screen)
- **Needs:** a file to upload
- **Steps:**
  1. Open a chat in the browser or desktop app.
  2. Drag a file from Finder over the window and hold it there.
  3. Check that a full-screen overlay with a dimmed background appears while the file is over the window.
  4. Drop the file and check that it is added as an attachment.

## S8.31 Tabs.

- **Expected:** Tabs (a tablist switching between panels, with the selected tab exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPanel.tsx:403; apps/web/features/chat/components/research/ResearchPanel.tsx:408
- **Where to find it:** not found in the code. ResearchPanel has a tablist labelled Research views with a Sources tab; I did not find how a person opens the research panel, and the second tab's label was not captured.

## S8.32 Accordions.

- **Expected:** An accordion (a stack of sections that expand and collapse, each with a labelled header) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/cards/StepsCard.tsx:203; apps/web/features/chat/components/cards/StepsCard.tsx:207
- **Where to find it:** Chat > a reply that shows a numbered list of steps > steps card (labels found in the code)
- **Steps:**
  1. Ask the assistant for a step-by-step plan so that a steps card appears in the reply.
  2. Look at the list of steps inside the card; the first step should be open.
  3. Click another step row and check that it opens while the previous one closes.
  4. Click the circle beside a step and check that the progress count changes.

## S8.33 Disclosure controls.

- **Expected:** A disclosure control (a toggle that shows or hides one block of detail, exposing its expanded state) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3477; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > a reply that has thinking steps > thinking toggle under the reply (labels found in the code)
- **Needs:** a model that returns thinking steps
- **Steps:**
  1. Send a message to a model that returns thinking steps.
  2. Find the small button with a brain icon under the reply.
  3. Click it and check that the thinking steps appear, with the chevron turning down.
  4. Click it again and check that the steps hide.

## S8.34 Dropdown menus.

- **Expected:** Dropdown menus (a button that opens a list of actions with menu keyboard behaviour) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:152; apps/web/features/chat/components/ConversationTitleMenu.tsx:153
- **Where to find it:** Chat > title at the top of the conversation (the button with a down arrow) > menu (labels found in the code)
- **Steps:**
  1. Open a conversation.
  2. Click the conversation title at the top.
  3. Check that a menu opens with Rename and Add chat instructions (or Edit chat instructions).
  4. Press Escape or click outside and check that the menu closes.

## S8.36 Nested menus.

- **Expected:** A nested menu (a menu item that opens a submenu) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:165; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > title at the top of the conversation > Move to project (labels found in the code)
- **Needs:** at least one project
- **Steps:**
  1. Open a conversation while you have at least one project.
  2. Click the conversation title, then choose Move to project.
  3. Check that a sub-menu opens with the list of projects.
  4. Hover or press the arrow key on the item, then check that the sub-menu opens.

## S8.37 Tooltips.

- **Expected:** Tooltips (short labels shown on hover or focus for controls) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3739; apps/web/features/chat/components/messages/MessageBubble.tsx:3733
- **Where to find it:** Chat > hover over the pencil icon under your message (labels found in the code)
- **Steps:**
  1. Open a conversation that has a sent message.
  2. Hover over the pencil icon under the message.
  3. Check that a small label Edit appears above it.
  4. Move the pointer away and check that the label disappears.

## S8.38 Popovers.

- **Expected:** Popovers (anchored floating panels that open from a trigger and dismiss on Escape or outside click) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:280; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:274
- **Where to find it:** Chat composer > files button > menu (labels found in the code)
- **Steps:**
  1. Open a new chat.
  2. Click the files button in the message box (its label was not found in the code).
  3. Check that a floating menu opens above the box with a search field and Upload from device.
  4. Press Escape, then check that the menu closes; click the outside of the menu and check it closes too.

## S8.39 Hover cards.

- **Expected:** Hover cards (a rich preview that appears when hovering a link, mention or citation) are used in shipped UI.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:179; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** not found in the code. A citation chip component exists in packages/ui/unified-chat/src/components/markdown/CitationChip.tsx, but I did not read its hover-card content, so I cannot say which visible words a person sees.

## S8.40 Badges.

- **Expected:** Badges (small status or count markers attached to an item) are used in shipped UI.
- **Code:** done. Evidence moved: apps/web/features/chat/components/InlinePaywallCard.tsx:208 (quoted code not found in the file now); apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > ask for a calculation > result card > unit badge (labels found in the code)
- **Steps:**
  1. Ask the assistant for a calculation that has a unit, such as a measurement.
  2. Look at the result card under the large result number.
  3. Check that the unit appears as a small grey badge beside the result.
  4. Compare with the result card's Copy result button to confirm the card layout.

## S8.41 Tags.

- **Expected:** Tags (small labels that categorise or describe an item, distinct from status badges) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/cards/CalculationCard.tsx:169; apps/web/features/chat/components/cards/CalculationCard.tsx:177
- **Where to find it:** not found in the code. The calculation card uses the same Badge component for units; I did not find a separate tag component that is distinct from status badges.

## S8.42 Avatars.

- **Expected:** Message authors are distinguished visually and for assistive technology (R-n: avatar or equivalent marker plus an accessible label).
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:1906 (quoted code not found in the file now); packages/ui/unified-chat/src/components/MessageBubble.tsx:733; packages/ui/unified-chat/src/components/MessageBubble.tsx:767 (quoted code not found in the file now)
- **Where to find it:** not found in the code. I did not find a visible avatar or author marker in apps/web/features/chat/components/messages/MessageBubble.tsx; the line cited is a step-number circle. The unified-chat MessageBubble lines cited were not read.

## S8.43 Progress indicators.

- **Expected:** Progress indicators (determinate bars or indeterminate spinners with an accessible name) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/cards/StepsCard.tsx:174; apps/web/features/chat/components/cards/StepsCard.tsx:187; apps/web/features/chat/components/ChatLoadingSkeleton.tsx:15
- **Where to find it:** Chat > reply with a numbered step list > progress line at the top of the steps card (labels found in the code)
- **Steps:**
  1. Open a reply that shows a steps card.
  2. Look at the progress line at the top, which shows a count such as 0/3 and a percentage.
  3. Click the circle beside each step to complete it.
  4. Check that the count and percentage go up, and that All steps completed! appears when every step is done.

## S8.44 Skeleton loaders.

- **Expected:** Skeleton placeholders stand in for content while it loads.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubbleSkeleton.tsx:40; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > open an existing conversation > loading placeholder (labels found in the code)
- **Needs:** a slow connection helps
- **Steps:**
  1. Open an existing conversation, or reload the page with a slow connection.
  2. Watch the area where messages will appear.
  3. Check that grey placeholder bars stand in for messages before the real messages appear.
  4. Compare what replaces the placeholders with what you saw before loading.

## S8.45 Toasts.

- **Expected:** Toasts (transient, non-blocking notifications that dismiss themselves) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1156; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1144
- **Where to find it:** not found in the code. The toast text is in ComposerFooter.tsx, but I did not find a normal way to make the save fail, and I did not check how the toast dismisses itself.
- **Needs:** a conversation whose model change fails to save

## S8.46 Inline alerts.

- **Expected:** Inline alerts (a message block inside the content, with alert or status semantics, for warnings or errors) are used in shipped UI.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1733 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:6888; apps/web/app/chat/page.tsx:16
- **Where to find it:** not found in the code. Inline alert blocks exist in the chat page (a role alert banner in apps/web/features/chat/pages/WebChatPage.tsx) and a status notice in MessageBubble, but I did not read the visible words of these blocks, so I cannot name one.

## S8.47 Banners.

- **Expected:** Banners (a full-width strip at the top or bottom of a view for system or account messages) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7607; apps/web/features/chat/pages/WebChatPage.tsx:7613
- **Where to find it:** Chat > send a message that takes a long time > banner at the top (labels found in the code)
- **Needs:** a browser that allows notifications
- **Steps:**
  1. Send a message that generates a long response.
  2. Look at the strip under the header; it should say Get notified when the response is ready.
  3. Click Enable and check the browser's permission prompt appears.
  4. Click the close button on the strip and check that it goes away.

## S8.48 Pagination controls.

- **Expected:** Pagination controls (next/previous, page numbers or an explicit "Load more") let the user move through a long list.
- **Code:** done. Evidence present: apps/web/app/chat/projects/page.tsx:474; apps/web/app/chat/projects/page.tsx:70
- **Where to find it:** Projects > scroll to the bottom of the list > Show more (labels found in the code)
- **Needs:** more projects than fit on one page
- **Steps:**
  1. Open the Projects page with more projects than one page holds.
  2. Scroll to the bottom of the list.
  3. Click Show more and watch the spinner and the Loading projects text.
  4. Check that more projects are added to the list.

## S8.49 Empty states.

- **Expected:** Empty states (a message and next step shown when a list or view has no content) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:162; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:174
- **Earlier check in the running app:** PASS: E005 [PASS; interaction]: A unique nonexistent query produces an explicit no-results state, rather than retaining prior matches.
- **Where to find it:** Artifacts panel with no artifacts yet > No artifacts yet (labels found in the code)
- **Steps:**
  1. Open the Artifacts panel in a chat with no generated files.
  2. Check that the title No artifacts yet appears.
  3. Read the description under it and compare it with what you expected.
  4. Create a file or code artifact and check that the empty state goes away.

## S8.50 Error states.

- **Expected:** Error states (a view-level message with a recovery action when content fails to load or a request fails) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7556; apps/web/features/chat/pages/WebChatPage.tsx:5902
- **Where to find it:** Projects > if the projects list fails to load > Retry (labels found in the code)
- **Needs:** a way to make the request fail (such as turning off the network)
- **Steps:**
  1. Make the projects list fail to load, for example by going offline.
  2. Check that an error message appears in place of the list.
  3. Click Retry.
  4. Check that the list loads when the connection comes back.
