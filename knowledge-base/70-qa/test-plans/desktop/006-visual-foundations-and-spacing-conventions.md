---
id: "PLAN-desktop-006"
type: "test-plan"
title: "Desktop · 6. Visual foundations and spacing conventions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "6"
---
# Desktop · 6. Visual foundations and spacing conventions

35 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S6.01 Semantic background colors.

- **Expected:** The surface paints page and panel backgrounds from named semantic background tokens, per theme, not per-component literals.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:181; apps/web/app/globals.css:779
- **Where to find it:** no screen of its own. Colour tokens are defined in packages/ui/design-tokens/src/foundation.css; the effect is seen by switching Theme.
- **Steps:**
  1. Open Settings… from the Mac menu bar (AGI app menu) or press Cmd+,.
  2. Go to Appearance and click Light, then Dark, then System under Theme.
  3. Compare the page and panel backgrounds in each theme with Expected.

## S6.02 Surface and elevated-surface colors.

- **Expected:** Raised surfaces (cards, menus, popovers, dialogs) use a named elevated-surface token distinct from the page ground in each theme.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:183; packages/ui/design-tokens/src/chat.css:66; packages/ui/ui/src/primitives/Dialog.tsx:115
- **Where to find it:** no screen of its own. Raised-surface token is set in packages/ui/design-tokens/src/foundation.css; no visible control of its own.
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Switch Theme between Light and Dark.
  3. Compare cards, menus and dialogs with the page background in each theme; open a menu or the Settings dialog itself to see the raised surface.

## S6.03 Text and muted-text colors.

- **Expected:** Primary and muted text use named text tokens that meet 4.5:1 on every surface they land on, without opacity dilution.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/foundation.css:187; apps/web/shared/components/__tests__/theme-contrast.test.ts:1389; apps/web/app/globals.css:558 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Text tokens are in packages/ui/design-tokens/src/foundation.css; contrast is verified by apps/web/shared/components/__tests__/theme-contrast.test.ts, not by a person.
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Switch Theme to Light, then Dark.
  3. Read primary and muted text in chat and settings in each theme and compare with Expected.

## S6.04 Border and divider colors.

- **Expected:** Borders and dividers use named border/rule tokens (subtle and strong) per theme.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:191; apps/web/app/globals.css:768
- **Where to find it:** no screen of its own. Subtle and strong border tokens are in packages/ui/design-tokens/src/foundation.css; no separate control.
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Switch Theme between Light and Dark.
  3. Look at card edges, dividers and input borders in Settings > General and compare with Expected.

## S6.05 Accent and selection colors.

- **Expected:** Accent and selection colours have separate fill, text and on-fill roles that each meet contrast on the backgrounds they are drawn on.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/foundation.css:151 (quoted code not found in the file now); apps/web/app/globals.css:725; apps/web/shared/components/__tests__/theme-contrast.test.ts:606
- **Where to find it:** Settings… (Cmd+,) > Appearance > Accent colour (labels found in the code)
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Click a colour under Accent colour (AGI amber, Green, Blue, Violet or Rose).
  3. Look at selected controls and buttons, and check the text on them is readable, against Expected.

## S6.06 Success, warning, error, and information colors.

- **Expected:** Success, warning, error and info each have text and fill roles, and status text meets 4.5:1 on its background in both themes.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:223; apps/web/app/chat/projects/[id]/page.tsx:1098; apps/web/shared/components/__tests__/theme-contrast.test.ts:1736
- **Where to find it:** no screen of its own. Status colours are tokens in packages/ui/design-tokens/src/foundation.css; no single visible control, so the tester must find a screen that shows a status.
- **Steps:**
  1. Trigger a status message, for example a failed or warning state, in the chat or settings.
  2. Compare the success, warning, error or info text colour in Light and Dark Theme.

## S6.07 Typography families.

- **Expected:** The surface declares its UI (sans), editorial and monospace font families once and loads the faces it names.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/chat.css:28; apps/web/app/globals.css:115
- **Where to find it:** Settings… (Cmd+,) > Appearance > Chat font (labels found in the code)
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Click Chat font and pick Sans, Serif or Dyslexic friendly.
  3. Look at message text in a chat; code should stay monospace.

## S6.08 Heading scale.

- **Expected:** Headings use one defined heading scale (named levels pairing size, weight and line-height) applied across the surface.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/tailwind.css:7; packages/ui/ui/src/cn.ts:8
- **Where to find it:** no screen of its own. The heading scale is in packages/ui/design-tokens/src/tailwind.css; no control of its own.
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Compare the page title Appearance with the row labels such as Theme and Motion.

## S6.09 Body-text scale.

- **Expected:** Body text uses a defined base size (and small variant) applied consistently, respecting the user's text-size preference where offered.
- **Code:** done. Evidence present: apps/web/app/globals.css:932; apps/web/shared/components/AppearancePreferences.tsx:20; apps/web/app/globals.css:856
- **Where to find it:** Settings… (Cmd+,) > Appearance > Chat text size (labels found in the code)
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Choose Small, then Large under Chat text size.
  3. Look at chat message text and compare with Default and Expected.

## S6.10 Caption and metadata scale.

- **Expected:** Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/tailwind.css:32; packages/ui/ui/src/primitives/TrustBadge.tsx:33; apps/web/shared/components/__tests__/theme-contrast.test.ts:1460
- **Where to find it:** no screen of its own. The caption role is defined in packages/ui/design-tokens/src/tailwind.css; no single control of its own.
- **Steps:**
  1. Open a chat and look at small metadata text such as timestamps or hint text under a Settings row, for example the hint under Contrast.

## S6.11 Monospace typography.

- **Expected:** Code and technical text use a declared monospace family and size distinct from body text.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/chat.css:40; apps/web/app/globals.css:905
- **Where to find it:** Settings… (Cmd+,) > Appearance > Chat font (labels found in the code)
- **Needs:** a chat that contains a code block
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Set Chat font to Serif, then return to Default.
  3. Open a chat with a code block and compare the code text with the body text.

## S6.12 Line-height rules.

- **Expected:** Line height is defined per text role (paired with size) rather than set ad hoc per element.
- **Code:** done. Evidence present: apps/web/app/globals.css:788; apps/web/app/globals.css:124; packages/ui/design-tokens/src/tailwind.css:33
- **Where to find it:** no screen of its own. Line-height is set per text role in apps/web/app/globals.css; no control of its own.
- **Needs:** a chat reply with several lines
- **Steps:**
  1. Read a multi-line chat reply and compare line spacing between lines of the same paragraph and in headings.

## S6.13 Paragraph spacing.

- **Expected:** Rendered paragraphs in responses are separated by a defined vertical gap set in one rule.
- **Code:** done. Evidence present: apps/web/app/globals.css:1117; apps/web/features/chat/components/messages/MessageBubble.tsx:2844; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Paragraph gap is set in apps/web/app/globals.css; no control of its own.
- **Needs:** a chat reply with several paragraphs
- **Steps:**
  1. Ask for a reply with several paragraphs in a chat.
  2. Look at the vertical gap between paragraphs and compare with Expected.

## S6.14 List indentation.

- **Expected:** Lists in rendered content use a defined indentation (and nesting step).
- **Code:** done. Evidence present: apps/web/app/globals.css:1143; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. List indentation is set in apps/web/app/globals.css; no control of its own.
- **Needs:** a chat reply with a list
- **Steps:**
  1. Ask for a reply containing a bulleted or numbered list, with a nested item.
  2. Look at the indent of the list and the nested list.

## S6.15 Code-block padding.

- **Expected:** Code blocks have defined internal padding set in one shared rule.
- **Code:** done. Evidence moved: apps/web/app/globals.css:913; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:96 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** Settings… (Cmd+,) > Appearance > Wrap long code lines (labels found in the code)
- **Needs:** a chat that contains a code block with a long line
- **Steps:**
  1. Open Settings… (Cmd+,) and go to Appearance.
  2. Turn on Wrap long code lines, then turn it off.
  3. Open a chat with a long code line and look at the code block padding and whether the line wraps.

## S6.16 Table-cell padding.

- **Expected:** Table cells (in rendered content and data tables) have defined, consistent padding.
- **Code:** done. Evidence present: apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Table-cell padding is applied in the shared layout rules; no control of its own.
- **Needs:** a chat reply with a table
- **Steps:**
  1. Open a chat reply or a data table that contains a table.
  2. Compare the padding inside table cells.

## S6.17 Conversation-turn spacing.

- **Expected:** Consecutive conversation turns are separated by one defined vertical spacing value.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:988 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Turn spacing is set in apps/web/features/chat/components/messages/ChatMessageList.tsx; no control of its own.
- **Needs:** a chat with several turns
- **Steps:**
  1. Send two or more messages in one chat.
  2. Look at the vertical space between one turn and the next.

## S6.18 Message-to-toolbar spacing.

- **Expected:** The per-message action toolbar sits a defined distance below the message it belongs to.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3683; apps/web/features/chat/components/messages/messageActionRow.ts:13 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Spacing is in apps/web/features/chat/components/messages/messageActionRow.ts; the toolbar appears on hover.
- **Needs:** a chat with a reply
- **Steps:**
  1. Hover over a chat message to show its action toolbar.
  2. Look at the distance between the message and its toolbar.

## S6.19 Composer internal padding.

- **Expected:** The composer has defined internal padding around the input and its controls.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4123 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Composer padding is in apps/web/features/chat/components/Composer/ChatComposerNew.tsx; no control of its own.
- **Steps:**
  1. Open a chat and click into the message box at the bottom.
  2. Look at the space around the typed text and the send and attach controls.

## S6.20 Page-edge gutters.

- **Expected:** Pages use defined page-edge gutters that step with viewport width.
- **Code:** done. Evidence moved: apps/web/app/globals.css:843; apps/web/features/chat/pages/WebChatPage.tsx:7651; apps/web/app/settings/voice/page.tsx:7 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Gutters are in apps/web/app/globals.css and apps/web/features/chat/pages/WebChatPage.tsx; visible through window resize.
- **Needs:** a window that can be resized
- **Steps:**
  1. Open a chat page and resize the window width from wide to narrow.
  2. Look at the space between the page edge and the content.

## S6.21 Sidebar row height.

- **Expected:** Sidebar/history list rows have one defined row height.
- **Code:** done. Evidence moved: packages/ui/ui/src/sidebar/SessionItem.tsx:205; packages/ui/ui/src/sidebar/Sidebar.tsx:441 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Row height is set in packages/ui/ui/src/sidebar/SessionItem.tsx; no control of its own.
- **Needs:** a few chats in the sidebar
- **Steps:**
  1. Open the sidebar and look at a row of the chat history list.
  2. Look at the height of several rows and compare them.

## S6.22 Menu-item height.

- **Expected:** Menu items share one defined item height/padding across menus.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/DropdownMenu.tsx:160; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Menu item height is in packages/ui/ui/src/primitives/DropdownMenu.tsx; no control of its own.
- **Needs:** a chat in the sidebar
- **Steps:**
  1. Click a menu button, for example the menu on a chat row in the sidebar.
  2. Compare the height of the menu items with the other menus.

## S6.23 Dialog padding.

- **Expected:** Dialogs and sheets share one defined inner padding.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Dialog.tsx:115; packages/ui/ui/src/primitives/AlertDialog.tsx:104; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Dialog padding is set in packages/ui/ui/src/primitives/Dialog.tsx and AlertDialog.tsx.
- **Steps:**
  1. Open Settings… (Cmd+,) and look at the inner padding of the dialog.
  2. Open a confirmation dialog, for example a delete prompt, and compare its inner padding.

## S6.24 Form-field spacing.

- **Expected:** Form fields share a defined label-to-input and field-to-field spacing.
- **Code:** done. Evidence present: apps/web/app/layout.tsx:11
- **Where to find it:** Settings… (Cmd+,) > General > Full name (labels found in the code)
- **Steps:**
  1. Open Settings… (Cmd+,) and go to General.
  2. Look at the Full name label and its input under Profile.
  3. Look at the gap between the label and the input and between fields, and compare with Expected.

## S6.25 Icon sizes and stroke conventions.

- **Expected:** Icons come from one family with a fixed grid and stroke width, sized from a small set.
- **Code:** done. Evidence present: packages/ui/icons/src/grid.ts:4; packages/ui/icons/src/CreateIcon.tsx:18
- **Where to find it:** no screen of its own. Icon grid and stroke are set in packages/ui/icons/src/grid.ts and CreateIcon.tsx; no control of its own.
- **Steps:**
  1. Look at the icons in the sidebar and in the settings navigation.
  2. Compare the stroke weight and size of icons across rows.

## S6.26 Button sizes and density variants.

- **Expected:** Buttons come in a defined set of sizes/densities from one component.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Button.tsx:23; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Button sizes (xs, sm, default, lg, icon) are set in code by the Button primitive, and a tester cannot pick one. Checked packages/ui/ui/src/primitives/Button.tsx.

## S6.27 Border-radius scale.

- **Expected:** Corner radii come from one named radius ladder.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:270; apps/web/shared/components/__tests__/theme-contrast.test.ts:1535; packages/ui/ui/src/primitives/Button.tsx:25
- **Where to find it:** not found in the code. Not in this range. Outside S6.26 to S6.35, so not handled.

## S6.28 Shadow and elevation scale.

- **Expected:** Shadows come from a small named elevation scale per theme.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/tailwind.css:65; packages/ui/ui/src/primitives/Dialog.tsx:115; packages/ui/ui/src/primitives/AlertDialog.tsx:104
- **Where to find it:** not found in the code. Not in this range. Outside S6.26 to S6.35, so not handled.

## S6.29 Layering and z-index rules.

- **Expected:** Stacking order uses one named z-index ladder; components never invent numeric layers.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:318; packages/ui/ui/src/primitives/Dialog.tsx:28
- **Where to find it:** no screen of its own. Layer values come from named z-index tokens in packages/ui/design-tokens/src/foundation.css (--z-control, --z-modal); the dialog uses var(--z-modal) in packages/ui/ui/src/primitives/Dialog.tsx.
- **Steps:**
  1. Click the button whose name starts with Account menu for.
  2. Click Settings in the menu.
  3. Look: the Settings dialog sits above the chat and the sidebar, and the menu closes.

## S6.30 Motion durations and easing.

- **Expected:** Animations and transitions use named durations and easing curves.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:345; packages/ui/ui/src/primitives/Sheet.tsx:36
- **Where to find it:** no screen of its own. Named durations are in packages/ui/design-tokens/src/foundation.css (--duration-instant 90ms, --duration-quick 160ms, --duration-moved 260ms). Sheets use them in packages/ui/ui/src/primitives/Sheet.tsx.
- **Steps:**
  1. Click the button whose name starts with Account menu for and watch the menu open.
  2. Click Settings and watch the Settings dialog open.
  3. Look: the menu opens and closes with a short fade, and the dialog fades and slides in without a long pause.

## S6.31 Reduced-motion alternatives.

- **Expected:** When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent.
- **Code:** done. Evidence moved: apps/web/app/globals.css:1928; apps/web/shared/components/AppearancePreferences.tsx:51; apps/web/features/settings/sections/GeneralSection.tsx:1091 (quoted code not found in the file now)
- **Where to find it:** Settings… > Appearance > Motion > Reduced (Settings… is in the app menu on the Mac) (labels found in the code)
- **Needs:** none (optional: to test the OS setting, turn on Reduce motion in macOS System Settings > Accessibility > Display)
- **Steps:**
  1. Click the app menu, then Settings…, or press Command+,.
  2. Click Appearance in the left list.
  3. Find the row labelled Motion and click Reduced.
  4. Look: the Motion row shows Reduced as pressed, and looping or moving animation in the chat and interface stops or becomes gentle. Click System to return.

## S6.32 Light, dark, and system themes.

- **Expected:** The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:831 (quoted code not found in the file now); apps/desktop/electron/main.ts:616
- **Where to find it:** Settings… > Appearance > Theme > Light, Dark or System (labels found in the code)
- **Needs:** none (for System: access to macOS System Settings > Appearance)
- **Steps:**
  1. Click the app menu, then Settings…, or press Command+,.
  2. Click Appearance in the left list.
  3. In the row labelled Theme, click Light. Look: the window, chat and code blocks turn light.
  4. Click Dark, then System. Look: the window follows the choice; with System, change the Mac's appearance in System Settings > Appearance and check the window changes too.

## S6.33 High-contrast treatment.

- **Expected:** A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus.
- **Code:** done. Evidence present: apps/web/app/globals.css:1298; apps/web/app/globals.css:1322; apps/web/shared/components/AppearancePreferences.tsx:41
- **Where to find it:** Settings… > Appearance > Contrast > High (labels found in the code)
- **Needs:** none (optional: macOS System Settings > Accessibility > Display > Increase contrast for the System choice)
- **Steps:**
  1. Click the app menu, then Settings…, or press Command+,.
  2. Click Appearance in the left list.
  3. In the row labelled Contrast, open the drop-down and choose High.
  4. Look: text, borders and focus rings look stronger than before. Choose System to return.

## S6.34 Selected, focused, hovered, pressed, and disabled states.

- **Expected:** Interactive controls show distinct selected, focused, hovered, pressed and disabled states.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Button.tsx:13; packages/ui/ui/src/primitives/Button.tsx:17; packages/ui/ui/src/primitives/Button.tsx:20
- **Where to find it:** no screen of its own. States are set in packages/ui/ui/src/primitives/Button.tsx (hover:, active:, focus-visible:, disabled:). The exact button that is disabled depends on the screen.
- **Steps:**
  1. Move the mouse over a button in the chat or Settings and look for a colour change.
  2. Press and hold the mouse on a button and look for a slight shrink and darker fill.
  3. Press the Tab key until a button has a focus ring, and look for the ring.
  4. Find a button that is greyed out and look that it is faded and cannot be clicked.

## S6.35 Brand assets and application icons.

- **Expected:** The surface ships its brand mark and application icons at the sizes the platform needs.
- **Code:** done. Evidence present: apps/desktop/electron-builder.yml:18
- **Where to find it:** The app menu (first menu, named Desktop) > About Desktop (opens the About panel that shows the app icon); the Dock shows the app icon. (labels found in the code)
- **Steps:**
  1. Click the first menu in the menu bar, the one named Desktop.
  2. Click the About item (its label is set by Electron and reads About Desktop).
  3. Look: the About panel shows the Desktop icon, name and version.
  4. Look at the Dock: the Desktop app icon is shown there.
