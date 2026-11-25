---
id: "PLAN-chrome-006"
type: "test-plan"
title: "Chrome · 6. Visual foundations and spacing conventions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "6"
---
# Chrome · 6. Visual foundations and spacing conventions

35 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S6.01 Semantic background colors.

- **Expected:** The surface paints page and panel backgrounds from named semantic background tokens, per theme, not per-component literals.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/index.ts:451 (quoted code not found in the file now); apps/extension/src/side_panel.ts:2069
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Click the More button (⋮) at the top right of the side panel, then click Extension settings to open the Options page.
  2. Click Options in the left list, find the Appearance section and the Theme select.
  3. Choose Light, then Dark, then System, and go back to the side panel after each choice.
  4. Compare the page background and panel backgrounds in each theme: each should change as a whole with no leftover fixed colours.

## S6.02 Surface and elevated-surface colors.

- **Expected:** Raised surfaces (cards, menus, popovers, dialogs) use a named elevated-surface token distinct from the page ground in each theme.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/index.ts:452 (quoted code not found in the file now); apps/extension/src/side_panel.ts:2101
- **Where to find it:** Click the More (⋮) button in the side panel header; the menu is the raised surface (labels found in the code)
- **Steps:**
  1. Click the More (⋮) button at the top right of the side panel.
  2. Look at the menu panel against the chat background behind it.
  3. Switch the theme to Light and then Dark under Extension settings > Options > Theme and open More again.
  4. Compare: the menu should look raised above the page in both themes, as a separate surface.

## S6.03 Text and muted-text colors.

- **Expected:** Primary and muted text use named text tokens that meet 4.5:1 on every surface they land on, without opacity dilution.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:2291 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. A 4.5:1 contrast ratio needs a colour meter; the tester can only check readability by eye.
- **Needs:** a chat reply (signed-in account not verified in code)
- **Steps:**
  1. Send any message in the chat and wait for a reply.
  2. Read the reply text and the small muted row under the message.
  3. Switch the theme to Light and then Dark under Extension settings > Options > Theme and look again.
  4. Compare: primary and muted text should both stay readable on the panel background in both themes.

## S6.04 Border and divider colors.

- **Expected:** Borders and dividers use named border/rule tokens (subtle and strong) per theme.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/index.ts:457 (quoted code not found in the file now); apps/extension/src/side_panel.ts:2184
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Click the More (⋮) button and look at the edge of the menu.
  2. Look at the edge of the message box at the bottom of the side panel.
  3. Switch the theme to Dark under Extension settings > Options > Theme and look at both edges again.
  4. Compare: both borders should be visible but subtle, in both themes.

## S6.05 Accent and selection colors.

- **Expected:** Accent and selection colours have separate fill, text and on-fill roles that each meet contrast on the backgrounds they are drawn on.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/index.ts:530 (quoted code not found in the file now); apps/extension/src/side_panel.ts:2121
- **Where to find it:** no screen of its own. The on-fill and text roles were read in the code, not measured.
- **Needs:** a chat reply
- **Steps:**
  1. Drag across a line of reply text to select it and look at the selection highlight.
  2. Look at the accent-tinted model selector button in the chat header.
  3. Switch the theme to Light and then Dark under Extension settings > Options > Theme and repeat.
  4. Compare: the selection and accent colours should stay readable with the text on them in both themes.

## S6.06 Success, warning, error, and information colors.

- **Expected:** Success, warning, error and info each have text and fill roles, and status text meets 4.5:1 on its background in both themes.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/index.ts:551 (quoted code not found in the file now); apps/web/shared/components/__tests__/theme-contrast.test.ts:1836
- **Where to find it:** no screen of its own. Triggering a real failure was not confirmed, and status colours for success, warning and info were not checked on screen.
- **Needs:** a way to make a copy or save fail (not found in code)
- **Steps:**
  1. Find a place where the panel shows a failure notice, such as a failed copy of a message.
  2. Read the notice text and check that it is readable on its background.
  3. Switch the theme to Dark under Extension settings > Options > Theme and look at the notice again.
  4. Compare: error and status text should stay readable in both themes.

## S6.07 Typography families.

- **Expected:** The surface declares its UI (sans), editorial and monospace font families once and loads the faces it names.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:2068; apps/extension/src/side_panel.ts:1446 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own. The editorial family was not confirmed on screen; the code declares UI and monospace families in side_panel.ts.
- **Needs:** a chat reply with code
- **Steps:**
  1. Send a message and read the reply text in the chat.
  2. Find a code block in a reply, or ask for one.
  3. Compare the sans-serif text with the monospace code text.
  4. Compare: the UI font, the editorial font and the monospace font should each look like one declared family.

## S6.08 Heading scale.

- **Expected:** Headings use one defined heading scale (named levels pairing size, weight and line-height) applied across the surface.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:1476 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own. Whether a reply returns headings depends on the model, and the sizes were read from tokens, not measured.
- **Needs:** a chat reply with headings
- **Steps:**
  1. Ask the chat for an answer with a heading, a sub-heading and a small heading.
  2. Look at the three heading levels in the reply.
  3. Compare: each level should have a clear step in size and weight, the same across replies.

## S6.09 Body-text scale.

- **Expected:** Body text uses a defined base size (and small variant) applied consistently, respecting the user's text-size preference where offered.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:1067 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own. No in-app text-size control was found in apps/extension/src; respect for the OS text-size setting was not confirmed.
- **Needs:** a chat reply
- **Steps:**
  1. Send a message and read the reply body text.
  2. Compare the body text with the smaller caption text under a message.
  3. Compare: body text should use one base size across replies.

## S6.10 Caption and metadata scale.

- **Expected:** Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.css:60 (quoted code not found in the file now); apps/extension/src/features/side-panel/computerUsePanel.ts:58
- **Where to find it:** no screen of its own. The caption token resolves to 14px in side_panel.css, which is the small body size, not a 12px role.
- **Needs:** a chat reply
- **Steps:**
  1. Send a message and find the small row under the reply.
  2. Read the caption text and compare its size with the body text.
  3. Compare: captions should stay readable and not smaller than the small text size set in the tokens.

## S6.11 Monospace typography.

- **Expected:** Code and technical text use a declared monospace family and size distinct from body text.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:1446 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own.
- **Needs:** a chat reply with code
- **Steps:**
  1. Ask the chat for a short code sample and wait for the reply.
  2. Compare the code text with the body text next to it.
  3. Compare: code should use a monospace font and a size of its own.

## S6.12 Line-height rules.

- **Expected:** Line height is defined per text role (paired with size) rather than set ad hoc per element.
- **Code:** done. Evidence present: apps/extension/src/side_panel.css:63; apps/extension/src/features/side-panel/computerUsePanel.ts:75; apps/extension/src/features/side-panel/schedulesSection.ts:55
- **Where to find it:** no screen of its own.
- **Needs:** a chat reply
- **Steps:**
  1. Send a message that gets a multi-line reply with a heading and a code block.
  2. Compare the line spacing of body text, heading and code.
  3. Compare: each text role should have its own line spacing that suits its size.

## S6.13 Paragraph spacing.

- **Expected:** Rendered paragraphs in responses are separated by a defined vertical gap set in one rule.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2963; apps/extension/src/side_panel.ts:2964
- **Where to find it:** no screen of its own.
- **Needs:** a chat reply with several paragraphs
- **Steps:**
  1. Ask the chat for an answer with at least three paragraphs.
  2. Look at the gap between the paragraphs.
  3. Compare: the gap should be the same between every pair of paragraphs.

## S6.14 List indentation.

- **Expected:** Lists in rendered content use a defined indentation (and nesting step).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2933; apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own. The list indent rule was read only by its line number in side_panel.ts.
- **Needs:** a chat reply with a list
- **Steps:**
  1. Ask the chat for a list with a nested sub-list.
  2. Look at the indent of the top list and the nested list.
  3. Compare: each nested level should step in by the same amount.

## S6.15 Code-block padding.

- **Expected:** Code blocks have defined internal padding set in one shared rule.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2110; apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own.
- **Needs:** a chat reply with code
- **Steps:**
  1. Ask the chat for a code block.
  2. Look at the space between the code text and the edge of the code box on all sides.
  3. Compare: the padding should look the same on every side.

## S6.16 Table-cell padding.

- **Expected:** Table cells (in rendered content and data tables) have defined, consistent padding.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/markdown.ts:97 (quoted code not found in the file now); apps/extension/src/side_panel.ts:2972
- **Where to find it:** no screen of its own.
- **Needs:** a chat reply with a table
- **Steps:**
  1. Ask the chat for a small table with a header row.
  2. Look at the padding in each table cell.
  3. Compare: all cells should have the same padding and the table should not overflow the panel.

## S6.17 Conversation-turn spacing.

- **Expected:** Consecutive conversation turns are separated by one defined vertical spacing value.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2097; apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own.
- **Needs:** a chat reply
- **Steps:**
  1. Send two messages in a row and wait for both replies.
  2. Look at the space between each message and the next one.
  3. Compare: the space between turns should be the same each time.

## S6.18 Message-to-toolbar spacing.

- **Expected:** The per-message action toolbar sits a defined distance below the message it belongs to.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2332; apps/extension/src/side_panel.ts:2416; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chat: the action row directly under a message, with Copy message under your message and Copy response under a reply (labels found in the code)
- **Needs:** a chat reply
- **Steps:**
  1. Send a message and wait for a reply.
  2. Look at the row directly under your message and under the reply.
  3. Compare the distance from each message bubble to its action row.

## S6.19 Composer internal padding.

- **Expected:** The composer has defined internal padding around the input and its controls.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:3829; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chat screen: the message box at the bottom of the side panel (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Look at the message box at the bottom of the side panel.
  2. Click in the box and type a few words.
  3. Compare the space between the typed text and the box edge, and around the send control.

## S6.20 Page-edge gutters.

- **Expected:** Pages use defined page-edge gutters that step with viewport width.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2272; apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own. The chat message list uses a fixed 12px 10px padding in side_panel.ts with no width step found in the lines read, so this may not be met; whether Chrome allows the side panel edge to be dragged was not confirmed.
- **Steps:**
  1. Drag the left edge of the side panel to make it wider, then narrower.
  2. Look at the margin between the content and the panel edge at each width.
  3. Compare: the margin should change in steps with the width, not drift.

## S6.21 Sidebar row height.

- **Expected:** Sidebar/history list rows have one defined row height.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:5313; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Click the Recent chats button (clock icon) in the chat header; the rows in the list are the sidebar history rows (labels found in the code)
- **Needs:** a few saved chats
- **Steps:**
  1. Click the clock icon in the chat header, labelled Recent chats.
  2. Look at the rows in the list.
  3. Compare: every row should have the same height, including rows with long titles.

## S6.22 Menu-item height.

- **Expected:** Menu items share one defined item height/padding across menus.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:4058; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Click the More (⋮) button in the side panel header; the menu items are Close tabs…, Extension settings, Shortcuts and Help (labels found in the code)
- **Steps:**
  1. Click the More (⋮) button in the side panel header.
  2. Look at the height of each menu item.
  3. Compare: every item should have the same height and padding.

## S6.23 Dialog padding.

- **Expected:** Dialogs and sheets share one defined inner padding.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2087; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Click the Recent chats button (clock icon) in the chat header; the Recent chats sheet is the dialog (labels found in the code)
- **Needs:** a few saved chats
- **Steps:**
  1. Click the clock icon in the chat header, labelled Recent chats.
  2. Look at the space between the sheet edges and its heading, search box and list.
  3. Compare the inner padding with the menu or other sheets you open.

## S6.24 Form-field spacing.

- **Expected:** Form fields share a defined label-to-input and field-to-field spacing.
- **Code:** done. Evidence present: apps/extension/src/options.ts:154; apps/extension/src/side_panel.ts:5518
- **Where to find it:** More (⋮) > Extension settings > Options page, left list Options, Appearance section, Theme field (labels found in the code)
- **Steps:**
  1. Click the More (⋮) button, then click Extension settings.
  2. In the Options page, click Options in the left list.
  3. Look at the Theme label, the select beneath it and the spacing between this row and the next form row.
  4. Compare: label-to-input and field-to-field spacing should match across the form rows.

## S6.25 Icon sizes and stroke conventions.

- **Expected:** Icons come from one family with a fixed grid and stroke width, sized from a small set.
- **Code:** done. Evidence present: apps/extension/src/assets/icons.ts:4; apps/extension/src/side_panel.ts:375; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Icons in the chat header, for example the clock icon for Recent chats (labels found in the code)
- **Steps:**
  1. Look at the clock icon in the chat header and other icon buttons in the panel.
  2. Compare their size and line weight with each other.
  3. Compare: icons should come from one family with the same stroke and size.

## S6.26 Button sizes and density variants.

- **Expected:** Buttons come in a defined set of sizes/densities from one component.
- **Code:** done. Evidence present: apps/extension/src/side_panel.css:37; apps/extension/src/features/side-panel/schedulesSection.ts:210
- **Where to find it:** no screen of its own. The code defines four fixed control heights, but no single screen shows all four at once, so the tester must compare several screens.
- **Steps:**
  1. Click the More (⋮) button in the side panel header.
  2. Click "Shortcuts" to open the settings page.
  3. Find the "Schedules" heading and look at "New schedule" and the other buttons beside it.
  4. Compare their heights and padding with the side panel buttons, and check they come from a few fixed sizes.

## S6.27 Border-radius scale.

- **Expected:** Corner radii come from one named radius ladder.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:153
- **Where to find it:** no screen of its own. Radius values come from the shared corner variables (for example var(--corner-control)); the tester only sees the result, not the scale itself.
- **Steps:**
  1. Click the More (⋮) button in the side panel header.
  2. Click "Shortcuts".
  3. Look at the corners of "New schedule" and the fields in the schedule form after clicking it.
  4. Compare the corner curves across buttons, inputs and cards.

## S6.28 Shadow and elevation scale.

- **Expected:** Shadows come from a small named elevation scale per theme.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:4321
- **Where to find it:** no screen of its own. The exact text of the model button was not found in the code I read, so the tester must find it by its position in the header; the shadow rule is in apps/extension/src/side_panel.ts.
- **Steps:**
  1. Open the side panel and open the model menu from the model button in the header.
  2. Look at the shadow under the open menu.
  3. Compare it with the shadow on the schedule form dialog or menus opened from More (⋮).

## S6.29 Layering and z-index rules.

- **Expected:** Stacking order uses one named z-index ladder; components never invent numeric layers.
- **Code:** done. Evidence present: apps/extension/src/side_panel.css:29; apps/extension/src/side_panel.ts:4321; apps/extension/src/side_panel.ts:2556
- **Where to find it:** no screen of its own. The layer numbers are in apps/extension/src/side_panel.css and apps/extension/src/side_panel.ts; the tester sees only the stacking result.
- **Needs:** a conversation with an image in a reply, for the image-viewer step
- **Steps:**
  1. Open the side panel and open a floating menu, such as the model menu from the header.
  2. Scroll the chat behind the open menu.
  3. Check that the menu stays above the chat text and buttons, and that a full-screen image viewer (opened from an image in a reply) covers the whole panel.

## S6.30 Motion durations and easing.

- **Expected:** Animations and transitions use named durations and easing curves.
- **Code:** done. Evidence present: apps/extension/src/side_panel.css:25; apps/extension/src/features/side-panel/schedulesSection.ts:155; apps/extension/src/features/side-panel/computerUsePanel.ts:159
- **Where to find it:** no screen of its own. Durations are named variables such as --duration-instant and --duration-spin in apps/extension/src/side_panel.css.
- **Steps:**
  1. Click the More (⋮) button in the side panel header.
  2. Click "Shortcuts" and find "New schedule".
  3. Move the pointer on and off "New schedule" and watch the colour and border change.
  4. Open a menu and check the open motion is short and smooth, not slow or bouncy.

## S6.31 Reduced-motion alternatives.

- **Expected:** When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:4622; apps/extension/src/features/content/in-page-panel/panelStyles.ts:269; apps/extension/src/side_panel.ts:5518
- **Where to find it:** no screen of its own. The code reads the operating system setting only; there is no in-app switch for reduced motion, and the loading indicator name was not confirmed.
- **Needs:** a Mac or another computer where the reduce-motion setting can be changed
- **Steps:**
  1. Turn on the reduce-motion setting in the operating system (find it under Accessibility in System Settings on a Mac; this path is not in the code).
  2. Open the side panel and send a message, then watch the loading indicator while the reply is being made.
  3. Open More (⋮) > Shortcuts and check that the page moves to a section without a long smooth scroll.

## S6.32 Light, dark, and system themes.

- **Expected:** The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it.
- **Code:** done. Evidence present: apps/extension/src/features/options/appearance-section.ts:57; apps/extension/src/features/appearance/themePreference.ts:21; apps/extension/src/side_panel.ts:16149; apps/extension/src/tokens.ts:32
- **Where to find it:** More (⋮) > Extension settings > Options > Appearance > Theme (choose System, Light or Dark) (labels found in the code)
- **Needs:** none (to test "System", change the computer's appearance in System Settings)
- **Steps:**
  1. Click the More (⋮) button in the side panel header.
  2. Click "Extension settings".
  3. Click "Options" in the left list.
  4. Under "Appearance", open the "Theme" menu and choose "Light", then "Dark", then "System".
  5. Look at the side panel and the settings page: they should switch colours each time, and "System" should follow the computer's light or dark setting.

## S6.33 High-contrast treatment.

- **Expected:** A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus.
- **Code:** done. Evidence present: apps/extension/src/tokens.ts:36; apps/extension/src/side_panel.ts:2035
- **Where to find it:** no screen of its own. Searched for 'high contrast' and 'prefers-contrast' in apps/extension/src; the only match is the forced-colors rule in apps/extension/src/tokens.ts and apps/extension/src/side_panel.ts. No in-app high-contrast option exists.
- **Needs:** a Windows computer with High Contrast available; a Mac tester cannot trigger this
- **Steps:**
  1. On Windows, turn on High Contrast in the system settings (the Windows path is not in the code).
  2. Open the side panel and then More (⋮) > Extension settings.
  3. Check that text, borders and the focus outline use the system high-contrast colours.

## S6.34 Selected, focused, hovered, pressed, and disabled states.

- **Expected:** Interactive controls show distinct selected, focused, hovered, pressed and disabled states.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2046
- **Where to find it:** no screen of its own. The state rules are in apps/extension/src/side_panel.ts; whether "Create schedule" is disabled when empty was not checked in the code.
- **Steps:**
  1. Click the More (⋮) button and then "Extension settings", then "Options".
  2. Move the pointer over a button in the left list and watch its hover state.
  3. Press Tab to move focus and check the visible focus outline.
  4. Press and hold a button with the mouse and check its pressed state; look for disabled buttons, such as "Create schedule" while the form is empty, and check they look different.

## S6.35 Brand assets and application icons.

- **Expected:** The surface ships its brand mark and application icons at the sizes the platform needs.
- **Code:** done. Evidence present: apps/extension/manifest.json:57; apps/extension/src/side_panel.ts:13657; apps/extension/src/side_panel.ts:5518
- **Where to find it:** Chrome toolbar: the "AGI Extension" icon. Inside the app: More (⋮) > Extension settings, then the brand mark and name at the top left of the Options page. (labels found in the code)
- **Steps:**
  1. Open Chrome and find the "AGI Extension" icon in the toolbar; if it is hidden, open the extensions menu (the puzzle-piece icon) and check its listing.
  2. Open chrome://extensions and look at the "AGI Extension" icon at its large size.
  3. Open the side panel, click More (⋮) > "Extension settings", and look at the brand mark and the name "AGI Extension" at the top left.
  4. Open an empty side panel with no conversation and check the large centred logo mark.
