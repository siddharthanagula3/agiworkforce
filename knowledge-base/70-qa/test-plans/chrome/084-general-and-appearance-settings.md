---
id: "PLAN-chrome-084"
type: "test-plan"
title: "Chrome · 84. General and appearance settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "84"
---
# Chrome · 84. General and appearance settings

7 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S84.03 Theme.

- **Expected:** The user can choose light, dark or system theme and it applies and persists.
- **Code:** done. Evidence present: apps/extension/src/features/options/appearance-section.ts:89; apps/extension/src/features/appearance/themePreference.ts:29
- **Where to find it:** More (⋮) > Extension settings, then the Options item in the left navigation > Appearance > Theme (System, Light, Dark) (labels found in the code)
- **Steps:**
  1. Open the AGI side panel and click the ⋮ button in its header (named More).
  2. Click Extension settings. The options page opens.
  3. In the left navigation click Options, then scroll to the Appearance section.
  4. Open the Theme drop-down and choose Dark. Check that the options page and the side panel turn dark and the status line reads Always dark.
  5. Choose Light, then System. Check the colours follow the choice, then close and reopen the options page and check the choice is still selected.

## S84.07 Reduced motion.

- **Expected:** The user can reduce animation (in-app setting or honouring the OS reduce-motion preference).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:4622
- **Where to find it:** no screen of its own. The repository has no in-app reduce-motion control. The rule is a CSS media query in apps/extension/src/side_panel.ts and apps/extension/src/options.ts, and the Expected line's in-app option is not present. The Mac settings path is not confirmed in the repo.
- **Needs:** a Mac with the Reduce motion setting available
- **Steps:**
  1. Turn on Reduce motion in the operating system's display accessibility settings.
  2. Open the AGI side panel and send a message so that the typing dots or a spinner appears.
  3. Look at the loading dots and spinners: they should stop or hold still instead of looping, while the reply still appears.

## S84.10 Default model.

- **Expected:** The user can set a default model that new conversations start with.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6055 (quoted code not found in the file now)
- **Where to find it:** Side panel > model button in the composer (shows the model name) > choose a model, then New chat (button named New chat in the header) (labels found in the code)
- **Needs:** a Free account or a paid account (the model list depends on the plan)
- **Steps:**
  1. Open the AGI side panel and click the model button in the composer.
  2. Pick a model other than Auto from the list.
  3. Click New chat in the side panel header.
  4. Look at the composer model button: it should show the model you picked, not Auto.

## S84.11 Default effort.

- **Expected:** The user can set a default reasoning effort used for new turns.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:1796; apps/extension/src/side_panel.ts:1830; apps/extension/src/side_panel.ts:11110; apps/extension/src/side_panel.ts:11501
- **Where to find it:** Side panel > model button in the composer > Effort section (heading Effort) > choose a level such as Quick, then New chat (labels found in the code)
- **Needs:** a model that offers effort levels (Auto does not; some levels need a higher plan)
- **Steps:**
  1. Open the AGI side panel and click the model button in the composer. Pick a model other than Auto.
  2. In the menu, under the Effort heading, click one level, for example Quick.
  3. Close the menu and click New chat in the side panel header.
  4. Open the model menu again and check that the Effort level you chose is still selected.

## S84.12 Default mode.

- **Expected:** The user can choose the default mode new conversations start in (e.g. chat vs agent/work, ask vs auto).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:15311 (quoted code not found in the file now); apps/extension/src/background.ts:4200 (quoted code not found in the file now)
- **Where to find it:** Side panel > composer permission chip > choose Ask first or Auto or Full access under the heading How should AGI act in your browser? (labels found in the code)
- **Steps:**
  1. Open the AGI side panel and click the permission chip in the composer.
  2. Choose Ask first, then close the menu.
  3. Click New chat in the side panel header.
  4. Open the permission chip again and check that Ask first is still selected.

## S84.15 Keyboard shortcuts.

- **Expected:** Settings let the user view and customise (disable or rebind) keyboard shortcuts.
- **Code:** done. Evidence moved: apps/extension/src/options.ts:1724 (quoted code not found in the file now); apps/extension/src/options.ts:1778 (quoted code not found in the file now)
- **Where to find it:** More (⋮) > Extension settings, then Options in the left navigation > Keyboard shortcuts > Configure (opens Chrome's shortcut page) (labels found in the code)
- **Steps:**
  1. Open the AGI side panel, click the ⋮ button (More), then click Extension settings.
  2. In the left navigation click Options and scroll to Keyboard shortcuts.
  3. Look at the list: Open side panel and Send page screenshot to Desktop, with their keys.
  4. Click Configure. Chrome's shortcut page opens. Change one key, return to the options page and check the row shows the new key.

## S84.22 Companion-window preference.

- **Expected:** The user can configure the companion/quick-access window (enable, shortcut, where it appears).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7392 (quoted code not found in the file now); apps/extension/src/side_panel.ts:7386 (quoted code not found in the file now)
- **Where to find it:** More (⋮) > Extension settings, then Options in the left navigation > Page assistant overlay (toggle) (labels found in the code)
- **Needs:** a site already approved for AGI
- **Steps:**
  1. Open the AGI side panel, click the ⋮ button (More), then click Extension settings.
  2. In the left navigation click Options and find the row Page assistant overlay.
  3. Read the hint: One prompt and response at a time. Turn the toggle off, read the status Page assistant disabled., then turn it on and read Page assistant enabled. It now shows on your approved sites.
  4. Open a site you have approved for AGI and check whether the compact assistant appears (or disappears when off).
