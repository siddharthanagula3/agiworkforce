---
id: "PLAN-mobile-006"
type: "test-plan"
title: "Mobile · 6. Visual foundations and spacing conventions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "6"
---
# Mobile · 6. Visual foundations and spacing conventions

35 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S6.01 Semantic background colors.

- **Expected:** The surface paints page and panel backgrounds from named semantic background tokens, per theme, not per-component literals.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/tokens.ts:8 (quoted code not found in the file now); apps/mobile/src/ui/theme/ThemeVars.tsx:15
- **Where to find it:** no screen of its own. Token names are in apps/mobile/src/ui/theme/tokens.ts; the cited ThemeVars.tsx path was not checked for a UI effect.
- **Steps:**
  1. Sign in and open the side menu, then tap Settings.
  2. Open Device > Appearance.
  3. Tap Light, then Dark.
  4. Compare page background with the panel and card backgrounds in each theme with Expected.

## S6.02 Surface and elevated-surface colors.

- **Expected:** Raised surfaces (cards, menus, popovers, dialogs) use a named elevated-surface token distinct from the page ground in each theme.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/tokens.ts:10 (quoted code not found in the file now); apps/mobile/src/features/schedules/components/ScheduleForm.tsx:271
- **Where to find it:** no screen of its own. Only the visible result is checkable; the elevated token name is not shown in the UI.
- **Needs:** a chat in the side menu
- **Steps:**
  1. Sign in and open the side menu.
  2. Long-press a chat row.
  3. Compare the action sheet panel with the page behind it in Light and Dark.
  4. Open the Rename dialog from the sheet and compare its panel background.

## S6.03 Text and muted-text colors.

- **Expected:** Primary and muted text use named text tokens that meet 4.5:1 on every surface they land on, without opacity dilution.
- **Code:** done. Evidence moved: apps/mobile/components/ui/text.tsx:11 (quoted code not found in the file now); apps/web/shared/components/__tests__/theme-contrast.test.ts:1928
- **Where to find it:** no screen of its own. The 4.5:1 contrast claim needs a contrast meter; the tester can only judge visibly.
- **Steps:**
  1. Open Settings > Device > Appearance.
  2. Tap Dark.
  3. Read the bold option names and the grey description lines.
  4. Compare how readable the grey text is with Expected.

## S6.04 Border and divider colors.

- **Expected:** Borders and dividers use named border/rule tokens (subtle and strong) per theme.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/tokens.ts:16 (quoted code not found in the file now); apps/mobile/src/features/onboarding/components/FirstRunDisclosureModal.tsx:199
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Open Settings > Device > Appearance.
  2. Look at the thin lines between the System, Light and Dark rows.
  3. Switch Light and Dark and compare the line strength.
  4. Compare the lines with Expected (subtle, not heavy).

## S6.05 Accent and selection colors.

- **Expected:** Accent and selection colours have separate fill, text and on-fill roles that each meet contrast on the backgrounds they are drawn on.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/tokens.ts:229 (quoted code not found in the file now)
- **Where to find it:** Settings > Device > Accent Color, then pick a colour swatch (labels found in the code)
- **Steps:**
  1. Sign in and open the side menu, then tap Settings.
  2. Open Device > Accent Color.
  3. Tap a colour such as Blue or Rose.
  4. Check that the selected accent shows on the selected mark and on buttons, and that its text is readable.

## S6.06 Success, warning, error, and information colors.

- **Expected:** Success, warning, error and info each have text and fill roles, and status text meets 4.5:1 on its background in both themes.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/tokens.ts:23 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The labels are accessibility labels; the visible text was not confirmed.
- **Needs:** a phone you can turn offline
- **Steps:**
  1. Turn off Wi-Fi and mobile data on the phone.
  2. Send a chat message.
  3. Look for the status text under the message (Message queued offline or Message failed to send).
  4. Compare the success, warning and error colours with Expected in Light and Dark.

## S6.07 Typography families.

- **Expected:** The surface declares its UI (sans), editorial and monospace font families once and loads the faces it names.
- **Code:** done. Evidence moved: apps/mobile/tailwind.config.js:36; apps/mobile/app/_layout.tsx:197 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The font declarations are in apps/mobile/tailwind.config.js and apps/mobile/app/_layout.tsx; the editorial face was not confirmed in any screen.
- **Steps:**
  1. Open Settings > Device > Appearance and read the Theme heading and option names.
  2. Open a chat and read the reply text.
  3. Compare the font look with Expected (one sans, one editorial, one monospace).

## S6.08 Heading scale.

- **Expected:** Headings use one defined heading scale (named levels pairing size, weight and line-height) applied across the surface.
- **Code:** done. Evidence present: apps/mobile/src/ui/theme/tokens.ts:77; eslint.config.mjs:80
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Open Settings > Device > Appearance.
  2. Compare the size and weight of the screen title with the Theme heading.
  3. Open another settings screen, such as Accent Color, and compare the title style.
  4. Check the headings match across screens.

## S6.09 Body-text scale.

- **Expected:** Body text uses a defined base size (and small variant) applied consistently, respecting the user's text-size preference where offered.
- **Code:** done. Evidence present: apps/mobile/src/ui/theme/tokens.ts:77; eslint.config.mjs:80
- **Where to find it:** no screen of its own. No in-app text-size setting was found; the code reads the device font scale (apps/mobile/src/shared/components/TextScaleBoundary.tsx).
- **Needs:** a phone where you can change text size
- **Steps:**
  1. Open Settings > Device > Appearance and read the description lines.
  2. Change the phone's text size in the phone's own settings.
  3. Reopen the app and compare the body text size.

## S6.10 Caption and metadata scale.

- **Expected:** Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/tokens.ts:77; apps/mobile/__tests__/mobile-shell-chrome.test.ts:13 (quoted code not found in the file now)
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Open Settings > Device > Appearance.
  2. Read the grey line under Light: Bright neutral interface.
  3. Compare its size with the bold option name above it.
  4. Check it is at least as large as 12 px and easy to read.

## S6.11 Monospace typography.

- **Expected:** Code and technical text use a declared monospace family and size distinct from body text.
- **Code:** done. Evidence present: apps/mobile/tailwind.config.js:37; apps/mobile/components/ui/text.tsx:16
- **Where to find it:** no screen of its own. The monospace family is declared in apps/mobile/tailwind.config.js; the code block copy control was not matched to a visible label.
- **Needs:** a Free or paid account
- **Steps:**
  1. Ask the chat for a short code sample.
  2. Wait for the reply to finish.
  3. Compare the code text with the body text around it.
  4. Check the code uses a monospace face and a different size.

## S6.12 Line-height rules.

- **Expected:** Line height is defined per text role (paired with size) rather than set ad hoc per element.
- **Code:** done. Evidence present: apps/mobile/components/ui/text.tsx:53; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** no screen of its own.
- **Needs:** a Free or paid account
- **Steps:**
  1. Ask the chat a question that gets a multi-line answer.
  2. Wait for the reply to finish.
  3. Look at the gap between lines in one paragraph.
  4. Compare the line spacing with Expected.

## S6.13 Paragraph spacing.

- **Expected:** Rendered paragraphs in responses are separated by a defined vertical gap set in one rule.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1096; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** no screen of its own.
- **Needs:** a Free or paid account
- **Steps:**
  1. Ask the chat for a reply with three or more paragraphs.
  2. Wait for the reply to finish.
  3. Measure the gap between two paragraphs by eye.
  4. Check the gap is the same between every pair.

## S6.14 List indentation.

- **Expected:** Lists in rendered content use a defined indentation (and nesting step).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1215; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** no screen of its own.
- **Needs:** a Free or paid account
- **Steps:**
  1. Ask the chat for a nested bullet list.
  2. Wait for the reply to finish.
  3. Look at the indent of the first and second levels.
  4. Check each level indents by the same step.

## S6.15 Code-block padding.

- **Expected:** Code blocks have defined internal padding set in one shared rule.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2304; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** no screen of its own. The copy control label for code blocks was not confirmed.
- **Needs:** a Free or paid account
- **Steps:**
  1. Ask the chat for a short code sample.
  2. Wait for the reply to finish.
  3. Look at the space between the code text and the edge of its box.
  4. Compare the padding on the top, bottom and sides.

## S6.16 Table-cell padding.

- **Expected:** Table cells (in rendered content and data tables) have defined, consistent padding.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:360 (quoted code not found in the file now); apps/mobile/app/_layout.tsx:1003
- **Where to find it:** no screen of its own. Cell padding is in apps/mobile/src/features/chat/components/MessageContentRenderer.tsx.
- **Needs:** a Free or paid account
- **Steps:**
  1. Ask the chat for a small table, such as three columns and three rows.
  2. Wait for the reply to finish.
  3. Look at the space inside each cell.
  4. Compare the padding across cells.

## S6.17 Conversation-turn spacing.

- **Expected:** Consecutive conversation turns are separated by one defined vertical spacing value.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageList.tsx:471; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** no screen of its own.
- **Needs:** a Free or paid account
- **Steps:**
  1. Send a first message in a chat and wait for the reply.
  2. Send a second message.
  3. Measure the gap between the turns.
  4. Check it matches the gap used between other turns.

## S6.18 Message-to-toolbar spacing.

- **Expected:** The per-message action toolbar sits a defined distance below the message it belongs to.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2574; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** Chat: under an AI reply, its action row (Good response, Bad response, Copy Message) (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Send a message and wait for the reply.
  2. Look at the action row below the reply.
  3. Compare the gap between the reply text and the action row with Expected.
  4. Check the row sits the same distance below each reply.

## S6.19 Composer internal padding.

- **Expected:** The composer has defined internal padding around the input and its controls.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:943 (quoted code not found in the file now); apps/mobile/app/_layout.tsx:1003
- **Where to find it:** Chat screen: the message box at the bottom of the screen (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Sign in and open the chat screen.
  2. Tap into the message box.
  3. Look at the space between the box edge and the typed text and buttons.
  4. Compare the padding with Expected.

## S6.20 Page-edge gutters.

- **Expected:** Pages use defined page-edge gutters that step with viewport width.
- **Code:** done. Evidence present: apps/mobile/src/shared/layout/contentColumn.ts:5; apps/mobile/src/features/chat/components/MessageBubble.tsx:368
- **Where to find it:** no screen of its own. The rule is in apps/mobile/src/shared/layout/contentColumn.ts.
- **Needs:** a phone, optionally a wider device
- **Steps:**
  1. Open the chat screen on a phone.
  2. Look at the left and right margins of the messages.
  3. Repeat on a wider screen (rotate or use a larger device) if available.
  4. Compare the margins with Expected (margins grow with width).

## S6.21 Sidebar row height.

- **Expected:** Sidebar/history list rows have one defined row height.
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:519; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** Side menu: the chat list rows (path not confirmed in the code; trust the screen)
- **Needs:** a few chats in the side menu
- **Steps:**
  1. Sign in and open the side menu.
  2. Look at the chat rows.
  3. Compare the height of each row with the others.
  4. Check all rows have the same height.

## S6.22 Menu-item height.

- **Expected:** Menu items share one defined item height/padding across menus.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/appearance/index.tsx:49; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** Settings > Device: each menu row, and the Appearance options (labels found in the code)
- **Steps:**
  1. Sign in and open the side menu, then tap Settings.
  2. Look at the rows under Device (Appearance, Accent Color, General).
  3. Open Device > Appearance and look at its option rows.
  4. Compare the row heights with Expected (one row height across menus).

## S6.23 Dialog padding.

- **Expected:** Dialogs and sheets share one defined inner padding.
- **Code:** done. Evidence present: apps/mobile/src/features/auth/components/StepUpModal.tsx:400; apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx:233
- **Where to find it:** Side menu: long-press a chat > Rename, then the Rename chat dialog (labels found in the code)
- **Needs:** a chat in the side menu
- **Steps:**
  1. Sign in and open the side menu.
  2. Long-press a chat row.
  3. Tap Rename.
  4. Look at the inner space around the Rename chat title, the field and the Cancel button.

## S6.24 Form-field spacing.

- **Expected:** Form fields share a defined label-to-input and field-to-field spacing.
- **Code:** done. Evidence present: apps/mobile/components/ui/input.tsx:18; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** Schedules > Create Schedule: the form fields and their labels (labels found in the code)
- **Needs:** a plan that allows schedules
- **Steps:**
  1. Sign in and open the side menu.
  2. Tap the Schedules row and then Create Schedule.
  3. Look at the space between each field label and its input.
  4. Compare the gap between fields with Expected.

## S6.25 Icon sizes and stroke conventions.

- **Expected:** Icons come from one family with a fixed grid and stroke width, sized from a small set.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/appearance/index.tsx:39; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** Settings > Device > Appearance: the icons beside System, Light and Dark (labels found in the code)
- **Steps:**
  1. Sign in and open the side menu, then tap Settings.
  2. Open Device > Appearance.
  3. Look at the icons on the left of the System, Light and Dark rows.
  4. Check the icons look like one family with the same stroke weight and size.

## S6.26 Button sizes and density variants.

- **Expected:** Buttons come in a defined set of sizes/densities from one component.
- **Code:** done. Evidence moved: apps/mobile/components/ui/button.tsx:21 (quoted code not found in the file now); apps/mobile/app/_layout.tsx:1003
- **Where to find it:** no screen of its own. Plan file button.tsx is now apps/mobile/components/ui/Button.tsx (sizes sm 36px, md 44px, lg 52px min height). Large buttons appear on screens such as apps/mobile/app/(auth)/reset-password.tsx, which a tester reaches only by a password-reset link, so the effect is hard to see from the UI.

## S6.27 Border-radius scale.

- **Expected:** Corner radii come from one named radius ladder.
- **Code:** done. Evidence present: apps/mobile/src/ui/theme/tokens.ts:61; apps/mobile/src/features/chat/components/ChatInput.tsx:1718
- **Where to find it:** no screen of its own. No label; the radius ladder itself is only visible through the shapes on screen.
- **Steps:**
  1. Sign in and open a chat.
  2. Look at the corners of the message box at the bottom and the round send control.
  3. Compare with the radius values in apps/mobile/src/ui/theme/tokens.ts (radii scale) and the use of radii.full in apps/mobile/src/features/chat/components/ChatInput.tsx.

## S6.28 Shadow and elevation scale.

- **Expected:** Shadows come from a small named elevation scale per theme.
- **Code:** done. Evidence present: apps/mobile/src/ui/theme/tokens.ts:144
- **Where to find it:** no screen of its own. The toast trigger is not verified in the code; the shadow scale is defined in tokens.ts and used by Toast.tsx line 93.
- **Steps:**
  1. Sign in, then trigger a short message such as copying text from a message.
  2. Look for the soft shadow under the toast that appears near the bottom.
  3. Compare with the shadow values in apps/mobile/src/ui/theme/tokens.ts (elevation e1 to e4) and the toast use at apps/mobile/src/shared/components/Toast.tsx.

## S6.29 Layering and z-index rules.

- **Expected:** Stacking order uses one named z-index ladder; components never invent numeric layers.
- **Code:** done. Evidence gone: apps/mobile/src/features/edge-cases/components/CloudSyncErrorBanner.tsx:48 (file no longer exists); apps/mobile/src/features/library/index.tsx:1509
- **Where to find it:** no screen of its own. The plan's CloudSyncErrorBanner.tsx file no longer exists; toasts (zIndex.notification) and the app lock overlay (zIndex.fullscreen in apps/mobile/src/features/auth/components/AppLockOverlay.tsx) are the current users.
- **Steps:**
  1. Sign in and open a chat with text on screen.
  2. Trigger a toast message and check it sits above the chat content.
  3. Compare with the named layers in apps/mobile/src/ui/theme/tokens.ts (zIndex: control, overlay, modal, notification, fullscreen).

## S6.30 Motion durations and easing.

- **Expected:** Animations and transitions use named durations and easing curves.
- **Code:** done. Evidence present: apps/mobile/src/ui/theme/tokens.ts:132; apps/mobile/src/features/voice/components/VoiceOrb.tsx:79
- **Where to find it:** no screen of its own. Named easing curves are in tokens.ts (motionCurves) and are not visible as a control.
- **Steps:**
  1. Sign in and trigger a toast message.
  2. Watch the toast slide in and out and note it is quick, not slow.
  3. Compare with the named durations in apps/mobile/src/ui/theme/tokens.ts (motion: instant 90, quick 160, moved 260, reveal 700, ambient 2000, orbit 3000 ms) and the use of motion.quick in apps/mobile/src/shared/components/Toast.tsx.

## S6.31 Reduced-motion alternatives.

- **Expected:** When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/useReduceMotion.ts:22; apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx:19 (quoted code not found in the file now); apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts:78
- **Where to find it:** Reduce Motion is a phone setting outside the app, read by the app at startup and live. There is no in-app switch in apps/mobile. (path not confirmed in the code; trust the screen)
- **Needs:** a phone or simulator where the Reduce Motion setting can be changed
- **Steps:**
  1. On the phone or simulator, turn on the system Reduce Motion setting (iOS path: Settings > Accessibility > Motion > Reduce Motion; this path is the phone's own and is not in the repo).
  2. Open AGI Mobile and go to a chat where the loading spinner shows (apps/mobile/components/ui/LoadingIndicator.tsx uses a spinning AgiMark).
  3. Look at the spinner and any looping mark: it should stop or be replaced by a gentle change.
  4. Compare with the rule in apps/mobile/src/ui/theme/useReduceMotion.ts and the check in apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts.

## S6.32 Light, dark, and system themes.

- **Expected:** The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/appearance/index.tsx:44; apps/mobile/src/ui/theme/tokens.ts:39
- **Where to find it:** Drawer > Settings > Device > Appearance, then choose System, Light or Dark. (labels found in the code)
- **Needs:** a Mac or phone where the system light or dark setting can be changed
- **Steps:**
  1. Sign in and tap Open menu to open the side drawer, then tap Settings.
  2. Under the Device group, tap Appearance.
  3. Tap Dark and look at the whole app, including code blocks in a chat, for a dark background.
  4. Tap Light, then System, and check the app follows the device's light or dark setting.

## S6.33 High-contrast treatment.

- **Expected:** A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus.
- **Code:** done. Evidence moved: apps/mobile/src/ui/theme/tokens.ts:149 (quoted code not found in the file now); apps/mobile/src/ui/theme/useSystemHighContrast.ts:40; apps/mobile/src/ui/theme/useTheme.ts:31
- **Where to find it:** Phone setting outside the app: high contrast is read from the system. There is no in-app switch. (path not confirmed in the code; trust the screen)
- **Needs:** a phone or simulator where the system contrast setting can be changed
- **Steps:**
  1. On the phone, turn on the high-contrast setting (iOS: the Darker Colors setting, which the code reads as isDarkerSystemColorsEnabled; Android: the high text contrast setting, read as isHighTextContrastEnabled). These device paths are not in the repo.
  2. Open AGI Mobile and check text and borders look stronger.
  3. Check the accent colour is replaced by neutral colours, as in apps/mobile/src/ui/theme/useTheme.ts (accent is null when high contrast is on).

## S6.34 Selected, focused, hovered, pressed, and disabled states.

- **Expected:** Interactive controls show distinct selected, focused, hovered, pressed and disabled states.
- **Code:** done. Evidence gone: apps/mobile/src/features/settings/appearance/index.tsx:46; apps/mobile/components/ui/pressable-box.tsx:42 (file no longer exists); apps/mobile/app/_layout.tsx:1003
- **Where to find it:** Drawer > Settings > Device > Appearance (selected row shows a check mark; pressing a row shows a pressed state). (labels found in the code)
- **Steps:**
  1. Sign in, tap Open menu, then Settings, then Appearance.
  2. Press and hold the System row and check it shows a pressed state.
  3. Release and check the row you picked now shows a check mark and is marked selected.
  4. Look for a disabled state on a greyed-out control elsewhere, and compare with the pressed and selected states in apps/mobile/components/ui/PressableBox.tsx.

## S6.35 Brand assets and application icons.

- **Expected:** The surface ships its brand mark and application icons at the sizes the platform needs.
- **Code:** done. Evidence present: apps/mobile/app.config.js:159; apps/mobile/app.config.js:296; apps/mobile/components/ui/AgiMark.tsx:128; apps/mobile/app/_layout.tsx:1003
- **Where to find it:** Drawer > Settings > About for the brand mark. The app icon is on the phone's home screen. (labels found in the code)
- **Needs:** a phone or simulator with the app installed
- **Steps:**
  1. Sign in, tap Open menu, then Settings, then About.
  2. Look at the brand symbol at the top of the About screen (apps/mobile/app/(app)/about.tsx).
  3. Close AGI Mobile and look at its icon on the home screen.
  4. Compare with the icon files named in apps/mobile/app.config.js (icon ./assets/icon.png and the Android adaptive icon).
