---
id: "PLAN-web-006"
type: "test-plan"
title: "Web · 6. Visual foundations and spacing conventions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "6"
---
# Web · 6. Visual foundations and spacing conventions

35 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S6.01 Semantic background colors.

- **Expected:** The surface paints page and panel backgrounds from named semantic background tokens, per theme, not per-component literals.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:181; apps/web/app/globals.css:779
- **Where to find it:** no screen of its own. The per-token naming is inner code; only the Theme switch is a visible control.
- **Steps:**
  1. Click Account menu at the bottom of the sidebar, then Settings.
  2. Click Appearance in the Settings list, then Light under Theme.
  3. Look at the page background, sidebar and panels.
  4. Click Dark under Theme and compare the backgrounds again with Expected.

## S6.02 Surface and elevated-surface colors.

- **Expected:** Raised surfaces (cards, menus, popovers, dialogs) use a named elevated-surface token distinct from the page ground in each theme.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:183; packages/ui/design-tokens/src/chat.css:66; packages/ui/ui/src/primitives/Dialog.tsx:115
- **Where to find it:** no screen of its own. Surface token names are inner; the visible check is the contrast between menu/dialog and page.
- **Steps:**
  1. Click the Account menu button at the bottom of the sidebar.
  2. Compare the menu panel with the page behind it.
  3. Click Settings to open the Settings dialog and compare its surface with the page.
  4. Switch Theme between Light and Dark and check the raised surfaces still stand out from the page.

## S6.03 Text and muted-text colors.

- **Expected:** Primary and muted text use named text tokens that meet 4.5:1 on every surface they land on, without opacity dilution.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/foundation.css:187; apps/web/shared/components/__tests__/theme-contrast.test.ts:1389; apps/web/app/globals.css:558 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Text tokens are defined in CSS; I did not open a specific screen that shows only muted text.
- **Steps:**
  1. Open the sidebar and read the conversation titles.
  2. Compare primary text with muted text such as hints in Settings > Appearance.
  3. Switch Theme between Light and Dark and check both stay readable.

## S6.04 Border and divider colors.

- **Expected:** Borders and dividers use named border/rule tokens (subtle and strong) per theme.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:191; apps/web/app/globals.css:768
- **Where to find it:** no screen of its own. Subtle and strong rule tokens are inner CSS names; the check is visual.
- **Steps:**
  1. Click Settings from the Account menu, then Appearance.
  2. Look at the borders around the Theme buttons.
  3. Switch between Light and Dark and compare the border strength.
  4. Compare with the border on the selected Theme button.

## S6.05 Accent and selection colors.

- **Expected:** Accent and selection colours have separate fill, text and on-fill roles that each meet contrast on the backgrounds they are drawn on.
- **Code:** done. Evidence moved: packages/ui/design-tokens/src/foundation.css:151 (quoted code not found in the file now); apps/web/app/globals.css:725; apps/web/shared/components/__tests__/theme-contrast.test.ts:606
- **Where to find it:** Settings > Appearance > Accent colour (labels found in the code)
- **Steps:**
  1. Click Account menu, then Settings, then Appearance.
  2. Click each colour swatch under Accent colour.
  3. Check the selected swatch shows a ring and a check mark.
  4. Look at buttons and selected controls: their fill changes with the accent, and text on them stays readable.

## S6.06 Success, warning, error, and information colors.

- **Expected:** Success, warning, error and info each have text and fill roles, and status text meets 4.5:1 on its background in both themes.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:223; apps/web/app/chat/projects/[id]/page.tsx:1098; apps/web/shared/components/__tests__/theme-contrast.test.ts:1736
- **Where to find it:** no screen of its own. I did not locate one specific screen that shows all four status colours.
- **Steps:**
  1. Trigger a status message in the app, for example a failed or completed action.
  2. Read its text and compare the contrast with the background in Light and in Dark theme.

## S6.07 Typography families.

- **Expected:** The surface declares its UI (sans), editorial and monospace font families once and loads the faces it names.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/chat.css:28; apps/web/app/globals.css:115
- **Where to find it:** Settings > Appearance > Chat font (labels found in the code)
- **Steps:**
  1. Click Account menu, then Settings, then Appearance.
  2. Choose Serif under Chat font (options are Default, Sans, Serif, Dyslexic friendly).
  3. Send a message and read the reply text.
  4. Compare the reply text with the font before the change, and check code in the reply stays monospace.

## S6.08 Heading scale.

- **Expected:** Headings use one defined heading scale (named levels pairing size, weight and line-height) applied across the surface.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/tailwind.css:7; packages/ui/ui/src/cn.ts:8
- **Where to find it:** no screen of its own. The Appearance page h1 is hidden on wide screens (md:hidden), so the title may be seen only at phone width.
- **Steps:**
  1. Open Settings, then Appearance.
  2. Compare the size and weight of the page title and section titles.
  3. Open another Settings section and check its headings use the same sizes.

## S6.09 Body-text scale.

- **Expected:** Body text uses a defined base size (and small variant) applied consistently, respecting the user's text-size preference where offered.
- **Code:** done. Evidence present: apps/web/app/globals.css:932; apps/web/shared/components/AppearancePreferences.tsx:20; apps/web/app/globals.css:856
- **Where to find it:** Settings > Appearance > Chat text size (labels found in the code)
- **Steps:**
  1. Click Account menu, then Settings, then Appearance.
  2. Choose Large under Chat text size.
  3. Open or send a chat and read a reply.
  4. Choose Small, read the reply again, and compare the size with Default and Large.

## S6.10 Caption and metadata scale.

- **Expected:** Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/tailwind.css:32; packages/ui/ui/src/primitives/TrustBadge.tsx:33; apps/web/shared/components/__tests__/theme-contrast.test.ts:1460
- **Where to find it:** no screen of its own. The 12px floor and AA contrast are inner rules; the visible check is the hint text.
- **Steps:**
  1. Open Settings, then Appearance.
  2. Read the hint text under Contrast, for example System follows your device setting.
  3. Compare the hint text size and contrast with the row labels above it.

## S6.11 Monospace typography.

- **Expected:** Code and technical text use a declared monospace family and size distinct from body text.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/chat.css:40; apps/web/app/globals.css:905
- **Where to find it:** Settings > Appearance > Code theme (code is shown in a chat reply) (labels found in the code)
- **Steps:**
  1. Click Account menu, then Settings, then Appearance.
  2. Look at Code theme and pick a different theme if you want to compare.
  3. Ask the chat for a short code snippet and read the code block.
  4. Compare the code font with the reply text font, and change Chat font to Serif to check code stays monospace.

## S6.12 Line-height rules.

- **Expected:** Line height is defined per text role (paired with size) rather than set ad hoc per element.
- **Code:** done. Evidence present: apps/web/app/globals.css:788; apps/web/app/globals.css:124; packages/ui/design-tokens/src/tailwind.css:33
- **Where to find it:** no screen of its own. Line-height rules are inner CSS; the check is visual.
- **Steps:**
  1. Ask the chat for a reply with a heading and three or four lines of text.
  2. Compare the spacing between the lines of one paragraph.
  3. Compare the line spacing of the heading with the text under it.

## S6.13 Paragraph spacing.

- **Expected:** Rendered paragraphs in responses are separated by a defined vertical gap set in one rule.
- **Code:** done. Evidence present: apps/web/app/globals.css:1117; apps/web/features/chat/components/messages/MessageBubble.tsx:2844; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. The paragraph gap rule is inner CSS.
- **Steps:**
  1. Ask the chat for an answer with three separate paragraphs.
  2. Measure the gap between paragraphs and compare the gaps.

## S6.14 List indentation.

- **Expected:** Lists in rendered content use a defined indentation (and nesting step).
- **Code:** done. Evidence present: apps/web/app/globals.css:1143; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. List indentation is an inner CSS rule.
- **Steps:**
  1. Ask the chat for a list with nested sub-items.
  2. Compare the indent of the first level with the indent of the nested level.

## S6.15 Code-block padding.

- **Expected:** Code blocks have defined internal padding set in one shared rule.
- **Code:** done. Evidence moved: apps/web/app/globals.css:913; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:96 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. The padding value is inner CSS; the visible check is the space around code text.
- **Steps:**
  1. Ask the chat for a code snippet and look at the space inside the code block edges.
  2. Open Settings, then Appearance, and turn Wrap long code lines on.
  3. Ask for a code line that is long and compare how it wraps inside the block padding.

## S6.16 Table-cell padding.

- **Expected:** Table cells (in rendered content and data tables) have defined, consistent padding.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:509 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:529 (quoted code not found in the file now); apps/web/features/docs/docs.css:704
- **Where to find it:** no screen of its own. Table padding is an inner CSS rule; I did not confirm a data table outside chat.
- **Steps:**
  1. Ask the chat for a table with three columns and three rows.
  2. Compare the space around the text in each cell.
  3. Check cells in every row use the same padding.

## S6.17 Conversation-turn spacing.

- **Expected:** Consecutive conversation turns are separated by one defined vertical spacing value.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:988 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. The turn spacing value is inner CSS.
- **Steps:**
  1. Send two messages in one chat.
  2. Measure the gap between the first reply and the next user message.
  3. Compare that gap with the gap between the next user message and its reply.

## S6.18 Message-to-toolbar spacing.

- **Expected:** The per-message action toolbar sits a defined distance below the message it belongs to.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3683; apps/web/features/chat/components/messages/messageActionRow.ts:13 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** Chat reply > hover the reply (action toolbar with Copy message, Good response, Bad response, Regenerate response) (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Send a message and wait for the reply.
  2. Move the pointer over the reply, or tap it on a phone.
  3. Look at the gap between the reply text and the toolbar below it.
  4. Compare that gap with the spacing used by other replies.

## S6.19 Composer internal padding.

- **Expected:** The composer has defined internal padding around the input and its controls.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4123 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Composer padding is an inner CSS rule; I did not confirm exact visible label text for the composer.
- **Steps:**
  1. Click New chat.
  2. Look at the space between the box edge and the text, and between the box edge and its buttons.
  3. Type a long line and compare the padding with the empty box.

## S6.20 Page-edge gutters.

- **Expected:** Pages use defined page-edge gutters that step with viewport width.
- **Code:** done. Evidence moved: apps/web/app/globals.css:843; apps/web/features/chat/pages/WebChatPage.tsx:7651; apps/web/app/settings/voice/page.tsx:7 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Gutter values are inner CSS; the check is the visible margin.
- **Steps:**
  1. Open Settings, then Appearance.
  2. Resize the browser window to a wide width and note the left and right margin.
  3. Narrow the window to phone width and check the margin gets smaller in steps, not jumps.

## S6.21 Sidebar row height.

- **Expected:** Sidebar/history list rows have one defined row height.
- **Code:** done. Evidence moved: packages/ui/ui/src/sidebar/SessionItem.tsx:205; packages/ui/ui/src/sidebar/Sidebar.tsx:441 (quoted code not found in the file now); apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. The row height is inner CSS; I did not verify the exact row height.
- **Needs:** a few conversations in the account
- **Steps:**
  1. Open the sidebar with several conversations listed.
  2. Measure the height of each row.
  3. Compare the rows: each should be the same height.

## S6.22 Menu-item height.

- **Expected:** Menu items share one defined item height/padding across menus.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/DropdownMenu.tsx:160; apps/web/app/layout.tsx:11
- **Where to find it:** Account menu > Settings (menu items are in the Account menu list) (labels found in the code)
- **Steps:**
  1. Click the Account menu button at the bottom of the sidebar.
  2. Read the menu items, such as Settings.
  3. Measure or compare the row height and padding of each item.
  4. Open another dropdown menu in the app and compare item heights.

## S6.23 Dialog padding.

- **Expected:** Dialogs and sheets share one defined inner padding.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Dialog.tsx:115; packages/ui/ui/src/primitives/AlertDialog.tsx:104; apps/web/app/layout.tsx:11
- **Where to find it:** Account menu > Settings (the Settings dialog) and any confirmation dialog (labels found in the code)
- **Steps:**
  1. Click the Account menu button, then Settings.
  2. Measure the inner padding around the title and the content.
  3. Open a confirmation or sheet dialog from another place in the app and compare its padding.

## S6.24 Form-field spacing.

- **Expected:** Form fields share a defined label-to-input and field-to-field spacing.
- **Code:** done. Evidence present: apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. The form-field spacing rule is inner CSS; the General section was the form I located.
- **Steps:**
  1. Click Account menu, then Settings, then General.
  2. Measure the gap between a field label and its control.
  3. Measure the gap between two fields.
  4. Compare the gaps across rows.

## S6.25 Icon sizes and stroke conventions.

- **Expected:** Icons come from one family with a fixed grid and stroke width, sized from a small set.
- **Code:** done. Evidence present: packages/ui/icons/src/grid.ts:4; packages/ui/icons/src/CreateIcon.tsx:18
- **Where to find it:** no screen of its own. The icon grid and stroke are inner code values.
- **Steps:**
  1. Open the Account menu.
  2. Compare the icon size and stroke weight of Settings with other menu icons.
  3. Open the sidebar and compare its icons with the menu icons.

## S6.26 Button sizes and density variants.

- **Expected:** Buttons come in a defined set of sizes/densities from one component.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Button.tsx:23; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Button sizes (default, xs, sm, lg, icon) are defined in packages/ui/ui/src/primitives/Button.tsx and there is no in-app density setting. Nothing for the tester to switch.

## S6.27 Border-radius scale.

- **Expected:** Corner radii come from one named radius ladder.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:270; apps/web/shared/components/__tests__/theme-contrast.test.ts:1535; packages/ui/ui/src/primitives/Button.tsx:25
- **Where to find it:** no screen of its own. Radius values come from the design tokens and Button.tsx; there is no setting for them.
- **Steps:**
  1. Open any menu or dialog in the app.
  2. Compare the corner rounding of its panel and buttons with the page around it, then compare with Expected.

## S6.28 Shadow and elevation scale.

- **Expected:** Shadows come from a small named elevation scale per theme.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/tailwind.css:65; packages/ui/ui/src/primitives/Dialog.tsx:115; packages/ui/ui/src/primitives/AlertDialog.tsx:104
- **Where to find it:** no screen of its own. Shadow scale is set in design tokens and primitives such as Dialog.tsx; no in-app control.
- **Steps:**
  1. Open any menu or dialog in the app.
  2. Look at the edge and shadow of the raised panel against the page, then compare with Expected.

## S6.29 Layering and z-index rules.

- **Expected:** Stacking order uses one named z-index ladder; components never invent numeric layers.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:318; packages/ui/ui/src/primitives/Dialog.tsx:28
- **Where to find it:** no screen of its own. The z-index ladder is in the design tokens and Dialog.tsx; a tester can only see its effect in stacking.
- **Steps:**
  1. Open a menu, then open a dialog from the app.
  2. Check the dialog sits above the menu and the page, and that the menu does not show through, then compare with Expected.

## S6.30 Motion durations and easing.

- **Expected:** Animations and transitions use named durations and easing curves.
- **Code:** done. Evidence present: packages/ui/design-tokens/src/foundation.css:345; packages/ui/ui/src/primitives/Sheet.tsx:36
- **Where to find it:** no screen of its own. Durations are set in the design tokens and Sheet.tsx; there is no in-app setting for them.
- **Steps:**
  1. Open a menu or dialog, then close it.
  2. Watch the timing and easing of the open and close, then compare with Expected.

## S6.31 Reduced-motion alternatives.

- **Expected:** When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent.
- **Code:** done. Evidence moved: apps/web/app/globals.css:1928; apps/web/shared/components/AppearancePreferences.tsx:51; apps/web/features/settings/sections/GeneralSection.tsx:1091 (quoted code not found in the file now)
- **Where to find it:** Settings > Appearance > Motion > Reduced (labels found in the code)
- **Steps:**
  1. Open Settings from the account menu and choose Appearance.
  2. Under Motion, click Reduced.
  3. Open a chat and send a message, then watch the reply and any loading animation.
  4. Compare what moves with Expected: looping or travelling animation should stop or become gentle. Set Motion back to System afterwards.

## S6.32 Light, dark, and system themes.

- **Expected:** The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:47 (quoted code not found in the file now); apps/web/features/settings/sections/GeneralSection.tsx:831 (quoted code not found in the file now)
- **Where to find it:** Settings > Appearance > Theme > Light, Dark or System (labels found in the code)
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Under Theme, click Light and look at the whole page, including a code block in a reply.
  3. Click Dark and look again, then click System.
  4. Compare with Expected: each choice should change the whole surface, including code.

## S6.33 High-contrast treatment.

- **Expected:** A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus.
- **Code:** done. Evidence present: apps/web/app/globals.css:1298; apps/web/app/globals.css:1322; apps/web/shared/components/AppearancePreferences.tsx:41
- **Where to find it:** Settings > Appearance > Contrast > High (labels found in the code)
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Set Contrast to High.
  3. Look at text, borders and dividers on the chat page and in a menu.
  4. Press Tab to move focus across buttons and compare the focus ring with Expected. Set Contrast back to System afterwards.

## S6.34 Selected, focused, hovered, pressed, and disabled states.

- **Expected:** Interactive controls show distinct selected, focused, hovered, pressed and disabled states.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/Button.tsx:13; packages/ui/ui/src/primitives/Button.tsx:17; packages/ui/ui/src/primitives/Button.tsx:20
- **Where to find it:** no screen of its own. States are styled in packages/ui/ui/src/primitives/Button.tsx; there is no separate control for them.
- **Steps:**
  1. Open Settings and choose Appearance.
  2. Move the pointer over a Theme button, then press Tab to focus one.
  3. Click and hold a button to see its pressed look, then compare the states with Expected.

## S6.35 Brand assets and application icons.

- **Expected:** The surface ships its brand mark and application icons at the sizes the platform needs.
- **Code:** done. Evidence present: apps/web/app/manifest.ts:16; apps/web/shared/components/layout/SidebarBrandRow.tsx:6; apps/web/app/layout.tsx:11
- **Where to find it:** no screen of its own. Icons are set in apps/web/app/manifest.ts and the sidebar wordmark in apps/web/shared/components/agi/SidebarWordmark.tsx; the visible wording of the wordmark was not read.
- **Steps:**
  1. After signing in, look at the top of the sidebar for the brand mark.
  2. Compare the mark and the app icon with Expected.
