---
id: "PLAN-vscode-006"
type: "test-plan"
title: "VS Code · 6. Visual foundations and spacing conventions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "6"
---
# VS Code · 6. Visual foundations and spacing conventions

35 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S6.01 Semantic background colors.

- **Expected:** The surface paints page and panel backgrounds from named semantic background tokens, per theme, not per-component literals.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:192; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:254
- **Where to find it:** no screen of its own. No in-app colour control was found; the colours come from the editor theme.
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Open the Command Palette and switch the editor colour theme to a light theme, then to a dark theme.
  3. Check that the panel page background and the raised panels change together with the editor theme.

## S6.02 Surface and elevated-surface colors.

- **Expected:** Raised surfaces (cards, menus, popovers, dialogs) use a named elevated-surface token distinct from the page ground in each theme.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:193; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:773
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the + button labelled Attach or use tools under the message box.
  3. Compare the menu surface with the panel page behind it; it should look raised and distinct.

## S6.03 Text and muted-text colors.

- **Expected:** Primary and muted text use named text tokens that meet 4.5:1 on every surface they land on, without opacity dilution.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:200; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:312
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Click the + button labelled Attach or use tools under the message box.
  2. Compare the bold item titles, such as Attach workspace files, with the grey description under each one.
  3. Check that both are easy to read against the menu background.

## S6.04 Border and divider colors.

- **Expected:** Borders and dividers use named border/rule tokens (subtle and strong) per theme.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:201; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:276
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Look at the border around the message box whose placeholder reads Describe a task…
  3. Open the + menu and compare its border with the message box border.

## S6.05 Accent and selection colors.

- **Expected:** Accent and selection colours have separate fill, text and on-fill roles that each meet contrast on the backgrounds they are drawn on.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:196; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:211; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1295
- **Where to find it:** no screen of its own. The highlight is set by the arrow keys in the slash menu code.
- **Steps:**
  1. Click the / button labelled Commands under the message box.
  2. Press the Down arrow key once.
  3. Check that the highlighted item has a clear fill and readable text.

## S6.06 Success, warning, error, and information colors.

- **Expected:** Success, warning, error and info each have text and fill roles, and status text meets 4.5:1 on its background in both themes.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:204; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:687
- **Where to find it:** no screen of its own. No single fixed control was found that always shows a status message; the tester needs an action that produces one.
- **Steps:**
  1. Trigger an error or warning message in the panel, such as sending a message with no sign-in or API key.
  2. Compare the red or yellow status text and its background with the normal panel text.

## S6.07 Typography families.

- **Expected:** The surface declares its UI (sans), editorial and monospace font families once and loads the faces it names.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:260; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1073 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** no screen of its own. The font comes from the editor setting; the app has no font control of its own.
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Compare the panel text font with the font in an open code editor tab.
  3. Confirm the panel uses the editor's UI font.

## S6.08 Heading scale.

- **Expected:** Headings use one defined heading scale (named levels pairing size, weight and line-height) applied across the surface.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1079 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** Settings button at the top of the AGI Code panel > General (labels found in the code)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the gear button titled Settings in the panel header.
  3. Click General in the left list.
  4. Compare the Model and reasoning card heading with the page title Settings and the other card headings.

## S6.09 Body-text scale.

- **Expected:** Body text uses a defined base size (and small variant) applied consistently, respecting the user's text-size preference where offered.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:136 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** no screen of its own. The app reads the editor font size and offers no text-size control of its own; no in-app text-size preference was found.
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Change the editor font size in the editor settings.
  3. Check that the panel body text grows or shrinks with it.

## S6.10 Caption and metadata scale.

- **Expected:** Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:242; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:160
- **Where to find it:** + button (Attach or use tools) > Attach workspace files (labels found in the code)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the + button labelled Attach or use tools under the message box.
  3. Look at the small grey text under each item title, such as the text under Attach workspace files.
  4. Check that the small text is readable and not smaller than about 12 pixels.

## S6.11 Monospace typography.

- **Expected:** Code and technical text use a declared monospace family and size distinct from body text.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:244; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1418
- **Where to find it:** Message box (Describe a task…) > send a request that gets a code reply (labels found in the code)
- **Needs:** a signed-in AGI Cloud account or an API key (the reply needs one)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the message box with the placeholder Describe a task….
  3. Type a request that asks for a short code sample and send it.
  4. Look at the code in the reply and compare its font with the normal reply text.

## S6.12 Line-height rules.

- **Expected:** Line height is defined per text role (paired with size) rather than set ad hoc per element.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:237; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:161
- **Where to find it:** no screen of its own.
- **Needs:** a signed-in AGI Cloud account or an API key (the reply needs one)
- **Steps:**
  1. Send a request that gets a multi-line reply in AGI Code.
  2. Read the reply and check that the lines are evenly spaced and easy to read.

## S6.13 Paragraph spacing.

- **Expected:** Rendered paragraphs in responses are separated by a defined vertical gap set in one rule.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:613; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** Message box (Describe a task…) > send a message that gets a reply with two paragraphs (labels found in the code)
- **Needs:** a signed-in AGI Cloud account or an API key (the reply needs one)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the message box with the placeholder Describe a task….
  3. Send a request that asks for two short paragraphs.
  4. Check the gap between the two paragraphs in the reply.

## S6.14 List indentation.

- **Expected:** Lists in rendered content use a defined indentation (and nesting step).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1438; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** Message box (Describe a task…) > send a message that gets a bulleted list reply (labels found in the code)
- **Needs:** a signed-in AGI Cloud account or an API key (the reply needs one)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the message box with the placeholder Describe a task….
  3. Send a request that asks for a bulleted list with one nested item.
  4. Check the indent of the list and the step in from the parent item to the nested item.

## S6.15 Code-block padding.

- **Expected:** Code blocks have defined internal padding set in one shared rule.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1072 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** Message box (Describe a task…) > send a message that gets a code block reply (labels found in the code)
- **Needs:** a signed-in AGI Cloud account or an API key (the reply needs one)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the message box with the placeholder Describe a task….
  3. Send a request that asks for a short code block.
  4. Check the space inside the code block between its edge and the code text.

## S6.16 Table-cell padding.

- **Expected:** Table cells (in rendered content and data tables) have defined, consistent padding.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1180 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1436
- **Where to find it:** Message box (Describe a task…) > send a message that gets a table reply (labels found in the code)
- **Needs:** a signed-in AGI Cloud account or an API key (the reply needs one)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the message box with the placeholder Describe a task….
  3. Send a request that asks for a small table with three columns.
  4. Check the padding inside each table cell and that the cell spacing is even.

## S6.17 Conversation-turn spacing.

- **Expected:** Consecutive conversation turns are separated by one defined vertical spacing value.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:598; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** Message box (Describe a task…) > send two messages in a row (labels found in the code)
- **Needs:** a signed-in AGI Cloud account or an API key (the reply needs one)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the message box with the placeholder Describe a task….
  3. Send one message, wait for the reply, then send a second message.
  4. Compare the vertical gap between the first turn and the second turn.

## S6.18 Message-to-toolbar spacing.

- **Expected:** The per-message action toolbar sits a defined distance below the message it belongs to.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:698; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4793; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3590 (quoted code not found in the file now)
- **Where to find it:** Under a finished reply > Regenerate button (appears on hover) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account or an API key (the reply needs one)
- **Steps:**
  1. Send a message and wait for the reply to finish.
  2. Move the mouse over the reply.
  3. Look at the row of small buttons that appears under it, such as the one titled Regenerate.
  4. Compare the gap between the bottom of the reply and that row with the other spacing in the reply.

## S6.19 Composer internal padding.

- **Expected:** The composer has defined internal padding around the input and its controls.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1038; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Look at the space between the edge of the message box whose placeholder reads Describe a task… and its inner text and buttons.
  3. Type a long message and check the padding stays even.

## S6.20 Page-edge gutters.

- **Expected:** Pages use defined page-edge gutters that step with viewport width.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:468 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** no screen of its own. The panel width drag is done with the mouse on the VS Code sidebar border.
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Drag the edge of the AGI Code panel to make it narrower, then wider.
  3. Check the space between the panel edge and the chat content, which should step as the width changes.

## S6.21 Sidebar row height.

- **Expected:** Sidebar/history list rows have one defined row height.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1884 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** Sessions button at the top of the AGI Code panel > session list (labels found in the code)
- **Needs:** at least two saved sessions
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the button titled Sessions in the panel header.
  3. Look at the list of sessions in the Sessions sheet.
  4. Compare the height of each session row, and check that all rows have the same height.

## S6.22 Menu-item height.

- **Expected:** Menu items share one defined item height/padding across menus.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:945; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** + button (Attach or use tools) > menu items; also / button (Commands) (labels found in the code)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the + button labelled Attach or use tools.
  3. Look at the height of each item in the Add context menu.
  4. Press Escape, click the / button labelled Commands, and compare its item height with the + menu items.

## S6.23 Dialog padding.

- **Expected:** Dialogs and sheets share one defined inner padding.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1407; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** not found in the code. The only dialog found is the onboarding dialog titled Work with your code (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts), opened by sidebarProvider.showOnboarding; I did not find the user action that calls it, so its trigger is unverified.

## S6.24 Form-field spacing.

- **Expected:** Form fields share a defined label-to-input and field-to-field spacing.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:143
- **Where to find it:** Settings button at the top of the AGI Code panel > Runtime (labels found in the code)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Click the gear button titled Settings in the panel header.
  3. Click Runtime in the left list.
  4. Look at the label AGI CLI path and its input box, then the label Open chat in below it.
  5. Compare the gap between the label and its input with the gap between fields.

## S6.25 Icon sizes and stroke conventions.

- **Expected:** Icons come from one family with a fixed grid and stroke width, sized from a small set.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:187; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** Header icon buttons at the top of the AGI Code panel: Sessions, Settings, New chat (labels found in the code)
- **Steps:**
  1. Click AGI Code in the activity bar.
  2. Look at the row of icon buttons at the top right of the panel.
  3. Hover over each icon and read its tooltip: Sessions, Settings, New chat.
  4. Compare the icon sizes and line thickness across the three icons.

## S6.26 Button sizes and density variants.

- **Expected:** Buttons come in a defined set of sizes/densities from one component.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:225; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:140
- **Where to find it:** AGI Code side panel > header buttons Sessions, Settings, New chat (28px squares); then Sessions > hover a session row for its small icon buttons (labels found in the code)
- **Needs:** a signed-in account with at least one session
- **Steps:**
  1. Open the AGI Code side panel from the left activity bar.
  2. Look at the three square icon buttons at the top of the panel (Sessions, Settings, New chat) and note they are the same size.
  3. Click Sessions and hover a session row to show its small icon buttons on the right.
  4. Compare the small row buttons (24px) with the header buttons (28px): one defined set of sizes, as Expected.

## S6.27 Border-radius scale.

- **Expected:** Corner radii come from one named radius ladder.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:214; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:136
- **Where to find it:** no screen of its own. Radius tokens are defined in the shared design-tokens package (agiCornerCssVars), applied in webviewContent.ts (line 214) and settingsWebviewContent.ts (line 136). No control sets them.
- **Steps:**
  1. Open the AGI Code side panel and look at the composer box, the plus menu (+) and the model menu.
  2. Compare the corner rounding across them: they should come from a small set of radius steps, as Expected.

## S6.28 Shadow and elevation scale.

- **Expected:** Shadows come from a small named elevation scale per theme.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:218
- **Where to find it:** AGI Code side panel > Attach or use tools (+ button, bottom left of the composer) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI Code side panel and click the + button labelled Attach or use tools.
  2. Look at the edge of the menu that opens: it should sit above the chat with a soft shadow that differs from the page.
  3. Click the Auto model button (title Model) and compare its popover shadow with the plus menu.
  4. Switch VS Code between a light and a dark colour theme and check the shadows still show.

## S6.29 Layering and z-index rules.

- **Expected:** Stacking order uses one named z-index ladder; components never invent numeric layers.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:220
- **Where to find it:** no screen of its own. The layer ladder is the z-content, z-dropdown, z-popover, z-overlay and z-sheet tokens at webviewContent.ts lines 220-224.
- **Needs:** a conversation with several messages
- **Steps:**
  1. Open a conversation with several messages and click the + button so its menu opens over the messages.
  2. Scroll the chat behind the open menu and check the menu stays on top.
  3. Click Sessions and check the Sessions sheet covers the chat above the composer.
  4. Compare with Expected: the layers stack in one order and nothing overlaps wrongly.

## S6.30 Motion durations and easing.

- **Expected:** Animations and transitions use named durations and easing curves.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:215; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:382
- **Where to find it:** no screen of its own. Durations and curves are tokens (duration-spin 1000ms, duration-pulse 1200ms, webviewContent.ts lines 215 and 382). Exact timing was not measured on screen.
- **Needs:** a signed-in account that can send a message
- **Steps:**
  1. Open the AGI Code side panel and hover over the header buttons and the Send button to see the quick colour fade.
  2. Send a short message and watch the loading indicator while the reply runs.
  3. Compare the speed and easing of the fades and spinner with Expected: one set of named durations and curves.

## S6.31 Reduced-motion alternatives.

- **Expected:** When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2774; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** no screen of its own. There is no in-app motion setting; the only control is the macOS Reduce motion switch, which the webview reads through the prefers-reduced-motion media query (webviewContent.ts line 2774; settingsWebviewContent.ts line 1254).
- **Needs:** a Mac with the Reduce motion setting available
- **Steps:**
  1. Turn on macOS Reduce motion (System Settings > Accessibility > Display). This is outside the app.
  2. Open the AGI Code side panel and send a message.
  3. Watch the loading spinner: it should stop looping after one turn rather than keep spinning, as Expected.

## S6.32 Light, dark, and system themes.

- **Expected:** The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:190; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:254
- **Where to find it:** no screen of its own. The app has no light, dark or system choice of its own: the surface uses VS Code's theme tokens with AGI fallbacks (webviewContent.ts lines 190 and 254). The follow-the-system option is VS Code's own theme setting and was not checked. Code block colours were not verified on screen.
- **Needs:** a signed-in account with a chat that includes a code block
- **Steps:**
  1. Open VS Code and set a light colour theme, then open the AGI Code side panel.
  2. Switch to a dark colour theme with the same panel open.
  3. Check the panel, the composer and a code block in the chat all change together, as Expected.

## S6.33 High-contrast treatment.

- **Expected:** A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2783; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** no screen of its own. A forced-colors block exists at webviewContent.ts line 2783, but forced colours are a Windows high-contrast mode and may not switch on for a Mac tester. The in-app effect is reached only through VS Code's theme.
- **Needs:** VS Code with a high contrast theme available
- **Steps:**
  1. Set VS Code to a high contrast colour theme (outside the app).
  2. Open the AGI Code side panel and look at the header buttons and the composer border.
  3. Press Tab through the header buttons and check the focus outline is clear, as Expected.

## S6.34 Selected, focused, hovered, pressed, and disabled states.

- **Expected:** Interactive controls show distinct selected, focused, hovered, pressed and disabled states.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:553; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:213
- **Where to find it:** AGI Code side panel > header button Settings (hover, press), and the composer Send button (disabled when empty) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI Code side panel and move the pointer over the Settings button; the hover state should show.
  2. Press and hold the Settings button; the pressed state should show, then release.
  3. Press Tab to move focus to the buttons and check the focus ring.
  4. With the composer empty, look at the Send button: it should look disabled. Type text and check it looks active, as Expected.

## S6.35 Brand assets and application icons.

- **Expected:** The surface ships its brand mark and application icons at the sizes the platform needs.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:84; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:163 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80
- **Where to find it:** VS Code left activity bar > AGI Code icon (title AGI Code); the extension icon is in the Extensions view (labels found in the code)
- **Steps:**
  1. Look at the left activity bar in VS Code and find the AGI Code icon.
  2. Zoom or compare it with the Extensions view listing for the AGI Code extension.
  3. Check the icon is sharp and matches the brand mark used in the panel, as Expected.
