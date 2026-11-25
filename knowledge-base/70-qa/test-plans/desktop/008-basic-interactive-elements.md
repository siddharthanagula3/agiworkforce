---
id: "PLAN-desktop-008"
type: "test-plan"
title: "Desktop · 8. Basic interactive elements"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "8"
---
# Desktop · 8. Basic interactive elements

47 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S8.01 Primary buttons.

- **Expected:** The main action in a view uses a visually emphasised primary button style, applied in shipped UI, whose label meets contrast on its fill.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Button.tsx:13; apps/web/features/chat/components/messages/EditableMessage.tsx:141; apps/web/features/chat/components/messages/EditableMessage.tsx:143
- **Where to find it:** Chat > hover your sent message > Edit message (pencil) > Save & Retry (labels found in the code)
- **Needs:** a chat with a sent message
- **Steps:**
  1. Open a chat that has a message you sent.
  2. Hover your sent message and click the pencil button labelled Edit message.
  3. Change the text and look for the Save & Retry button.
  4. Compare: it should look like the main filled action, with a readable label.

## S8.02 Secondary buttons.

- **Expected:** A less prominent secondary (outline/ghost) button style exists and is used beside primary actions in shipped UI.
- **Code:** done. Evidence moved: packages/ui/ui/src/primitives/Button.tsx:15 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:338; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:340
- **Where to find it:** not found in the code. Outline button found in ComposerFeedbackDialog, but I did not trace how a person opens that dialog, and no other outline button was confirmed.

## S8.03 Destructive buttons.

- **Expected:** Irreversible actions use a distinct destructive button style (danger colour before hover) whose label meets contrast.
- **Code:** done. Evidence moved: packages/ui/ui/src/primitives/Button.tsx:14 (quoted code not found in the file now); apps/web/features/chat/components/share/ShareConversationDialog.tsx:415; apps/web/features/chat/components/share/ShareConversationDialog.tsx:304; apps/web/shared/components/__tests__/theme-contrast.test.ts:374
- **Where to find it:** Share… (chat title menu) > Revoke every link (labels found in the code)
- **Needs:** a chat with shared links, so the button appears
- **Steps:**
  1. Open a chat and open its title menu, then choose Share….
  2. Look for the Revoke every link button in the dialog footer.
  3. Compare: it should be styled as a red destructive button with readable text.
  4. Do not click it unless you are ready to revoke links.

## S8.04 Icon-only buttons.

- **Expected:** Icon-only buttons exist in shipped UI and each carries an accessible name (aria-label or equivalent).
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Button.tsx:28; apps/web/features/chat/components/messages/MessageBubble.tsx:3713; apps/web/features/chat/components/messages/MessageBubble.tsx:3733
- **Where to find it:** Chat > hover your sent message > icon button Retry this message (labels found in the code)
- **Needs:** a chat with a sent message
- **Steps:**
  1. Open a chat and hover over a message you sent.
  2. Look for the small icon buttons that appear: Retry this message and Edit message.
  3. Hover each one to see its tooltip (Retry, Edit).
  4. Compare: each icon button should have a name for screen readers and a tooltip.

## S8.06 Toggle buttons.

- **Expected:** A toggle button (a button with an on/off pressed state announced to assistive tech) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5977; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > + button (Add attachments and tools) (labels found in the code)
- **Steps:**
  1. Open a chat and look at the message box at the bottom.
  2. Click the + button.
  3. Look at whether the + button shows a pressed state and the menu opens.
  4. Compare: the button should report pressed or expanded state, and its count badge shows active items.

## S8.07 Button groups.

- **Expected:** Related buttons are grouped into a labelled button group in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/DictationStrip.tsx:89; apps/web/features/chat/components/Composer/DictationStrip.tsx:100
- **Where to find it:** Composer > dictation (microphone) button > the Voice dictation strip (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Start voice dictation from the message box.
  2. Look at the strip that appears next to the composer.
  3. Hover or tab through its two round buttons.
  4. Compare: the strip should be one labelled group with a cancel (discard) button.

## S8.08 Text links.

- **Expected:** Links in text are visibly styled as links and open their destination when activated.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:267 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:804
- **Where to find it:** Chat > any assistant reply that contains a web link > click the link (path not confirmed in the code; trust the screen)
- **Needs:** a reply that contains a link
- **Steps:**
  1. Send a message that asks for a web page or source.
  2. Find a link inside the assistant's reply.
  3. Click the link.
  4. Compare: it should look like a link and open its destination.

## S8.09 Text inputs.

- **Expected:** Single-line text inputs with a visible label or accessible name are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:156; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:168
- **Where to find it:** not found in the code. Single-line input found in CreateProjectDialog, but I did not trace how a person opens that dialog.

## S8.10 Multiline inputs.

- **Expected:** A multi-line text area that accepts newlines is used in shipped UI (e.g. the composer).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2461; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:374; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:377
- **Where to find it:** Chat > the message box at the bottom of the screen (labels found in the code)
- **Steps:**
  1. Open a chat and click into the message box.
  2. Type a line, then add a new line.
  3. Compare: the box should accept several lines and grow taller as you type.

## S8.11 Search fields.

- **Expected:** A search field (search semantics, placeholder or label, filters as typed or on submit) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:639; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:295; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:297
- **Where to find it:** Composer > model picker > Search models (labels found in the code)
- **Steps:**
  1. Open the model picker in the message box area.
  2. Click the Search models field.
  3. Type part of a model name.
  4. Compare: the list should narrow to matching models.

## S8.12 Password fields.

- **Expected:** Secret entry (passwords, API keys, tokens) uses a masked field in shipped UI.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorApiKeyForm.tsx:194; apps/web/features/connectors/components/ConnectorApiKeyForm.tsx:198
- **Where to find it:** not found in the code. Masked password field found in ConnectorApiKeyForm, but the screen path that shows this form was not traced.

## S8.13 One-time-code fields.

- **Expected:** A one-time-code field (short numeric code, one-time-code autofill or paste) is used where the product asks for a code.
- **Code:** done. Evidence moved: apps/web/features/auth/AuthCodeStep.tsx:154; apps/web/features/auth/AuthCodeStep.tsx:66 (quoted code not found in the file now)
- **Where to find it:** not found in the code. AuthCodeStep.tsx has a numeric one-time-code field (autocomplete one-time-code), but the sign-in path that shows it was not traced.
- **Needs:** an email sign-in that asks for a code

## S8.14 Checkboxes.

- **Expected:** Checkboxes (independent on/off choices in a list, with checked state exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:237; apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:239
- **Where to find it:** Chat title menu > Export (opens Export Chat History) > Include metadata checkbox (labels found in the code)
- **Steps:**
  1. Open a chat and open its title menu.
  2. Choose Export.
  3. Look for the checkbox Include metadata (title, date, message count) and click it.
  4. Compare: the box should toggle and its checked state should change.

## S8.15 Radio groups.

- **Expected:** A radio group (mutually exclusive options, all visible, with checked state exposed) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/onboarding/components/OnboardingWizard.tsx:216; apps/web/features/onboarding/components/OnboardingWizard.tsx:151
- **Where to find it:** Onboarding wizard, step 1 (first-run setup) (labels found in the code)
- **Needs:** a new account that sees onboarding
- **Steps:**
  1. Start the onboarding wizard on first sign-in, or reopen it.
  2. Look at the group of choices for what you want to do first.
  3. Click one choice and check that only that choice is selected.
  4. Compare: only one option is selected at a time.

## S8.16 Switches.

- **Expected:** Switches (immediate on/off settings with switch semantics) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1914; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1916
- **Where to find it:** Composer > Effort (reasoning button) > Toggle extended thinking switch (labels found in the code)
- **Needs:** a model that supports extended thinking
- **Steps:**
  1. Click the reasoning or Effort control in the message box.
  2. Look at the Effort row in the popover.
  3. Click the switch and watch it turn on or off.
  4. Compare: the switch should change state immediately.

## S8.17 Segmented controls.

- **Expected:** A segmented control (a small set of mutually exclusive options shown as joined segments) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.module.css:82; apps/web/features/code/components/CodeRail.tsx:375; apps/web/app/chat/page.tsx:16
- **Where to find it:** Code screen > top of the left rail > two-part icon control (chat icon and code icon) (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open the Code screen.
  2. Look at the small two-part control at the top of the side rail.
  3. Click the chat icon and check that the chat screen opens.
  4. Compare: the active part should look selected.

## S8.18 Single-select menus.

- **Expected:** A single-select menu (choose one value from a list) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:561; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:563
- **Where to find it:** Global search dialog > Message Type (labels found in the code)
- **Needs:** some conversations to search
- **Steps:**
  1. Open global search from the app.
  2. Look for the Message Type field with its value (all, user, assistant, system).
  3. Pick one value and check the list narrows.
  4. Compare: exactly one value should be selected.

## S8.19 Searchable comboboxes.

- **Expected:** A searchable combobox (type to filter a list, then pick one, with listbox semantics or keyboard navigation) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/shared/components/CommandPalette/CommandPalette.tsx:440; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:639
- **Where to find it:** not found in the code. Searchable combobox found in CommandPalette.tsx; the keyboard shortcut or menu that opens it was not traced.

## S8.20 Multiselect controls.

- **Expected:** A multiselect control (pick several values from one list, each selection shown and removable) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeChangesPanel.tsx:372; apps/web/features/code/components/CodeChangesPanel.tsx:374
- **Where to find it:** not found in the code. The panel uses a checkbox menu, not chips; no clear several-value chip list was confirmed, and the Changes panel path was not traced.
- **Needs:** a Code session with changes

## S8.21 Token/chip inputs.

- **Expected:** A token/chip input (typed entries become removable chips inside or beside the field) is used in shipped UI.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/ChipInput.tsx:34; apps/web/features/settings/sections/WorkspacePolicySection.tsx:690; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:275
- **Where to find it:** Workspace settings > Workspace policy > IP allow list field (Add an IP address or CIDR block) (labels found in the code)
- **Needs:** a workspace admin account
- **Steps:**
  1. Open the workspace policy section as a workspace admin.
  2. Click into the IP allow list field and type an address, then press Enter.
  3. Look for the new chip and its remove control.
  4. Compare: the entry should appear as a removable chip.

## S8.22 Numeric steppers.

- **Expected:** A numeric stepper (number field with increment/decrement) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:346; apps/web/features/schedules/components/ScheduleForm.tsx:352
- **Where to find it:** Schedules > new schedule form > Repeat Every field (labels found in the code)
- **Needs:** a Free or paid account with Schedules
- **Steps:**
  1. Open the Schedules page and start a new schedule.
  2. Find Repeat Every and click its up and down arrows, or type a number.
  3. Compare: the value should go up and down by one and stay at least 1.
  4. Check the helper text below it.

## S8.23 Sliders.

- **Expected:** A slider (drag or arrow keys to set one value on a scale) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1950; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1955
- **Where to find it:** Composer > Effort (reasoning button) > slider under the Effort label (labels found in the code)
- **Needs:** a model that supports several effort levels
- **Steps:**
  1. Click the reasoning control in the message box.
  2. Find the Effort row and drag the slider.
  3. Try the arrow keys after clicking the slider.
  4. Compare: the value changes between effort levels.

## S8.25 Date pickers.

- **Expected:** A date picker (calendar or native date control) is used where a date is entered in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:590; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:591; apps/web/app/chat/page.tsx:16
- **Where to find it:** Global search dialog > Start date > Select date (labels found in the code)
- **Steps:**
  1. Open global search.
  2. Click the Select date button for the start date.
  3. Pick a day in the calendar and check the button shows that date.
  4. Compare: the calendar should close and the chosen date should show.

## S8.26 Time pickers.

- **Expected:** A time picker (native or custom time control) is used where a time is entered in shipped UI.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:391; apps/web/features/schedules/components/ScheduleForm.tsx:394
- **Where to find it:** Schedules > new schedule form > Local Time field (labels found in the code)
- **Needs:** a schedule form that shows Local Time
- **Steps:**
  1. Open the new schedule form and choose a daily, weekly or monthly repeat.
  2. Find the Local Time field.
  3. Click it and set a time.
  4. Compare: the chosen time should show in the field.

## S8.27 Timezone pickers.

- **Expected:** A time zone picker (searchable list of zones, defaulting to the device zone) is used where schedules take a zone.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:64; apps/web/features/schedules/components/ScheduleForm.tsx:122; apps/web/features/schedules/components/ScheduleForm.tsx:514; apps/web/features/schedules/components/ScheduleForm.tsx:523; apps/web/features/schedules/lib/schedule-form.ts:77
- **Where to find it:** Schedules > new schedule form > Time Zone field (labels found in the code)
- **Steps:**
  1. Open the new schedule form.
  2. Click the Time Zone field and type a city or region.
  3. Pick a suggested zone from the list.
  4. Compare: the field should show the picked zone and default to the device zone.

## S8.28 Color pickers.

- **Expected:** A colour picker (swatches or a colour input) is used where the user chooses a colour.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:891; apps/web/app/chat/projects/[id]/page.tsx:893
- **Where to find it:** Settings > Appearance > Themes > Create Theme (the colour squares next to Background, Foreground and the other colour names in the Create Custom Theme dialog) (labels found in the code)
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Scroll to the Themes heading and click Create Theme.
  3. In Create Custom Theme, click the small colour square next to Background.
  4. Look for a colour chooser that opens and changes the swatch and the hex text beside it.

## S8.29 File inputs.

- **Expected:** A file input (choose files from the device) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7016
- **Where to find it:** Chat composer > the add button (aria-label 'Add attachments and tools') > Add photos & files; or the composer Files menu > Upload from device (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open a chat and click the add button at the bottom-left of the composer.
  2. Click Add photos & files.
  3. Choose a file in the system file chooser and confirm.
  4. Look for the chosen file to appear as a preview above the message box.

## S8.30 Upload dropzones.

- **Expected:** An upload drop zone accepts files dragged onto it and shows a drag-over state.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301
- **Where to find it:** Chat > drag a file from Finder over the chat window (the composer area) (labels found in the code)
- **Needs:** a file to upload, a mouse or trackpad drag
- **Steps:**
  1. Open a chat in the desktop app.
  2. Drag a file from Finder over the chat window and hold it there.
  3. Look for the overlay with the heading Drop files here and the line Release to attach to your message.
  4. Release the file and check it appears as an attachment in the composer.

## S8.31 Tabs.

- **Expected:** Tabs (a tablist switching between panels, with the selected tab exposed) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPanel.tsx:403; apps/web/features/chat/components/research/ResearchPanel.tsx:408
- **Where to find it:** Chat > after an answer with web research, click the Globe button titled Research sources > tabs Sources, Report, Library (labels found in the code)
- **Needs:** a chat with a research or web-sources answer
- **Steps:**
  1. Open a chat that produced research sources.
  2. Click the button with the title Research sources to open the panel.
  3. Click the Report tab, then the Library tab.
  4. Look for the selected tab to change and for the panel content to switch with it.

## S8.32 Accordions.

- **Expected:** An accordion (a stack of sections that expand and collapse, each with a labelled header) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/cards/StepsCard.tsx:203; apps/web/features/chat/components/cards/StepsCard.tsx:207
- **Where to find it:** Chat > a reply shown as a steps card > click a step row to expand its details (labels found in the code)
- **Needs:** a chat where the model returns a steps card (not directly controllable by the tester)
- **Steps:**
  1. Open a chat that returns a steps card.
  2. Click a step row or its arrow.
  3. Look for the details to open below the step and the arrow state to change.
  4. Click again and check the details close.

## S8.33 Disclosure controls.

- **Expected:** A disclosure control (a toggle that shows or hides one block of detail, exposing its expanded state) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3477; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > a reply with thinking steps > the button Thinking process (N steps) under the reply (labels found in the code)
- **Needs:** a model that returns thinking steps
- **Steps:**
  1. Open a chat whose reply includes thinking steps.
  2. Click Thinking process under the reply.
  3. Look for the list of thinking steps to open and the arrow to turn down.
  4. Click again and check the list closes.

## S8.34 Dropdown menus.

- **Expected:** Dropdown menus (a button that opens a list of actions with menu keyboard behaviour) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:152; apps/web/features/chat/components/ConversationTitleMenu.tsx:153
- **Where to find it:** Chat > click the conversation title at the top (aria-label Conversation options) > menu items Rename, Add chat instructions (labels found in the code)
- **Needs:** a saved chat
- **Steps:**
  1. Open any saved chat.
  2. Click the chat title at the top with its small down arrow.
  3. Look for a menu with Rename and Add chat instructions or Edit chat instructions.
  4. Press the down arrow key, then Escape, and check the menu closes and focus returns to the title.

## S8.36 Nested menus.

- **Expected:** A nested menu (a menu item that opens a submenu) is used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:165; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > click the conversation title > Move to project (opens a submenu of projects) (labels found in the code)
- **Needs:** at least one project
- **Steps:**
  1. Open a saved chat and click its title to open the menu.
  2. Hover or click Move to project.
  3. Look for a submenu listing your projects.
  4. Click a project name and check the chat moves into it (the item changes to Change project).

## S8.37 Tooltips.

- **Expected:** Tooltips (short labels shown on hover or focus for controls) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3739; apps/web/features/chat/components/messages/MessageBubble.tsx:3733
- **Where to find it:** Chat > hover over the pencil icon (aria-label Edit message) under one of your sent messages (labels found in the code)
- **Needs:** a sent message in a chat
- **Steps:**
  1. Open a chat and find one of your sent messages.
  2. Move the mouse onto the pencil icon under it, or focus it with the keyboard.
  3. Look for a small label Edit to appear.
  4. Move the mouse away and check the label goes away.

## S8.38 Popovers.

- **Expected:** Popovers (anchored floating panels that open from a trigger and dismiss on Escape or outside click) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:280; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:274
- **Where to find it:** Chat > composer Files menu (trigger aria-label Files) > panel with Search library files and Upload from device (labels found in the code)
- **Steps:**
  1. Open a chat and click the composer Files button.
  2. Look for a floating panel above the composer with a search field and Upload from device.
  3. Press Escape, and check the panel closes.
  4. Open it again, click outside it, and check it closes.

## S8.39 Hover cards.

- **Expected:** Hover cards (a rich preview that appears when hovering a link, mention or citation) are used in shipped UI.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:179; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat > an answer with web citations > hover a small source chip under the answer (labels found in the code)
- **Needs:** an answer with web citations
- **Steps:**
  1. Open a chat with a web-search answer that shows source chips.
  2. Hover over a source chip.
  3. Look for a card listing the source rows with the site name and a snippet.
  4. Move the mouse away and check the card closes.

## S8.40 Badges.

- **Expected:** Badges (small status or count markers attached to an item) are used in shipped UI.
- **Code:** done. Evidence moved: apps/web/features/chat/components/InlinePaywallCard.tsx:208 (quoted code not found in the file now); apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > Research sources button (Globe icon) > count badge when sources exist and the panel is closed (labels found in the code)
- **Needs:** a chat with research sources
- **Steps:**
  1. Open a chat with research sources and keep the sources panel closed.
  2. Look at the Globe button in the top bar.
  3. Check for a small count bubble on its corner.
  4. Open the panel and check the bubble disappears.

## S8.41 Tags.

- **Expected:** Tags (small labels that categorise or describe an item, distinct from status badges) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/cards/CalculationCard.tsx:169; apps/web/features/chat/components/cards/CalculationCard.tsx:177
- **Where to find it:** not found in the code. CalculationCard renders the unit as a Badge with dynamic text (apps/web/features/chat/components/cards/CalculationCard.tsx line 169-177), with no fixed visible label. I could not confirm this is a distinct tag rather than a status badge.
- **Needs:** a chat with a calculation answer

## S8.42 Avatars.

- **Expected:** Message authors are distinguished visually and for assistive technology (R-n: avatar or equivalent marker plus an accessible label).
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:1906 (quoted code not found in the file now); packages/ui/unified-chat/src/components/MessageBubble.tsx:733; packages/ui/unified-chat/src/components/MessageBubble.tsx:767 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. apps/web/features/chat/components/messages/MessageBubble.tsx says the web chat shows no avatars, so the distinction is by layout and the hidden heading, not a picture.
- **Needs:** a screen reader for the accessible-label step
- **Steps:**
  1. Open a chat with one message from you and one reply.
  2. Look for the two messages to look different (your message in a bubble, the reply as plain text).
  3. Turn on VoiceOver and move through the two messages; check each is announced with You said: or Assistant said:.

## S8.43 Progress indicators.

- **Expected:** Progress indicators (determinate bars or indeterminate spinners with an accessible name) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/cards/StepsCard.tsx:174; apps/web/features/chat/components/cards/StepsCard.tsx:187; apps/web/features/chat/components/ChatLoadingSkeleton.tsx:15
- **Where to find it:** Chat > a steps card > progress bar and percent text under its title; the loading spinner appears when a chat opens (labels found in the code)
- **Needs:** a steps card in a chat
- **Steps:**
  1. Open a chat that returns a steps card.
  2. Tick off steps and watch the progress bar and the text N% complete.
  3. Check the text changes to All steps completed! when all are done.
  4. Open a chat and watch for the loading spinner labelled Loading chat.

## S8.44 Skeleton loaders.

- **Expected:** Skeleton placeholders stand in for content while it loads.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubbleSkeleton.tsx:40; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > open a conversation on a slow connection; grey placeholder message bubbles show before the messages load (labels found in the code)
- **Needs:** a saved chat and a slow connection
- **Steps:**
  1. Throttle the network in the browser developer tools if available, or use a slow connection.
  2. Open a saved chat.
  3. Look for grey animated placeholder message bubbles before the real messages appear.
  4. Check the placeholders are replaced by the real messages.

## S8.45 Toasts.

- **Expected:** Toasts (transient, non-blocking notifications that dismiss themselves) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1156; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1144
- **Where to find it:** Chat > composer model picker > choose another model while the save fails (toast at the bottom) (labels found in the code)
- **Needs:** a way to make the save fail (network off)
- **Steps:**
  1. Open a chat and turn off the network connection.
  2. Open the model picker in the composer and choose a different model.
  3. Look for the error toast with the message about the model not being saved.
  4. Wait a few seconds and check the toast goes away on its own.

## S8.46 Inline alerts.

- **Expected:** Inline alerts (a message block inside the content, with alert or status semantics, for warnings or errors) are used in shipped UI.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1733 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:6888; apps/web/app/chat/page.tsx:16
- **Where to find it:** Chat > a turn that fails shows an inline alert in the transcript with a recovery action (labels found in the code)
- **Needs:** a way to make a turn fail (network off)
- **Steps:**
  1. Open a chat and send a message while the network is off.
  2. Look for a red alert block in the conversation with an explanation.
  3. Check that the alert offers a recovery action where one applies (for example a retry link).

## S8.47 Banners.

- **Expected:** Banners (a full-width strip at the top or bottom of a view for system or account messages) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7607; apps/web/features/chat/pages/WebChatPage.tsx:7613
- **Where to find it:** Chat > send a long message > the strip at the top of the chat: Get notified when the response is ready. with Enable (labels found in the code)
- **Needs:** a long reply and notification permission not yet granted
- **Steps:**
  1. Open a chat in a browser that has not granted notifications.
  2. Send a message that takes a while to answer.
  3. Look for the strip Get notified when the response is ready. with an Enable button.
  4. Click Enable or the dismiss control and check the strip reacts.

## S8.48 Pagination controls.

- **Expected:** Pagination controls (next/previous, page numbers or an explicit "Load more") let the user move through a long list.
- **Code:** done. Evidence present: apps/web/app/chat/projects/page.tsx:474; apps/web/app/chat/projects/page.tsx:70
- **Where to find it:** Projects > the Projects list at the bottom > Show more (labels found in the code)
- **Needs:** an account with more projects than one page
- **Steps:**
  1. Open Projects from the sidebar.
  2. Scroll to the bottom of the list.
  3. Click Show more.
  4. Look for the Loading projects text while loading, then more projects appear.

## S8.49 Empty states.

- **Expected:** Empty states (a message and next step shown when a list or view has no content) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:162; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:174
- **Where to find it:** Chat > Artifacts panel with no artifacts yet (labels found in the code)
- **Needs:** an account or chat with no artifacts
- **Steps:**
  1. Open a chat with no artifacts.
  2. Open the Artifacts panel.
  3. Look for the empty message No artifacts yet with the line Renderable code and generated files will appear here.

## S8.50 Error states.

- **Expected:** Error states (a view-level message with a recovery action when content fails to load or a request fails) are used in shipped UI.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7556; apps/web/features/chat/pages/WebChatPage.tsx:5902
- **Where to find it:** Projects > the Projects list fails to load > Retry (labels found in the code)
- **Needs:** a way to make the list fail (network off)
- **Steps:**
  1. Open Projects while the network is off or the list cannot load.
  2. Look for the error message and the Retry button.
  3. Turn the network back on, click Retry, and check the list loads.
