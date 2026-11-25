---
id: "PLAN-chrome-012"
type: "test-plan"
title: "Chrome · 12. New-chat experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "12"
---
# Chrome · 12. New-chat experience

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S12.01 Empty conversation canvas.

- **Expected:** Opening a new chat shows an empty conversation area (no prior messages) with a ready composer.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13656; apps/extension/src/side_panel.ts:5884; apps/extension/manifest.json:84
- **Where to find it:** Side panel > New chat (labels found in the code)
- **Needs:** a signed-in account to see the greeting; the empty area also appears when signed out
- **Steps:**
  1. Sign in and open the AGI side panel beside any page.
  2. Click the "New chat" button (it has no visible text; it is the button with that accessible name).
  3. Look: no earlier messages are shown, the AGI symbol and greeting appear in the empty area, and the message box is ready to type in.

## S12.04 Suggested prompts.

- **Expected:** The new-chat screen offers clickable suggested prompts that fill or send a message.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10674 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10684 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No clickable suggested-prompt chips on the new-chat screen were found. Searched apps/extension/src for suggest, starter, welcome, onboard, intro and tour; the only hits were the in-page action chips (Summarize, Key points) and the saved / shortcuts feature, neither of which is shown on the new-chat screen.

## S12.05 Task-category shortcuts.

- **Expected:** The new-chat screen offers one-tap task-category shortcuts (e.g. write, research, image) that set up the next message.
- **Code:** done. Evidence moved: apps/extension/src/features/content/in-page-panel/pageActions.ts:135; apps/extension/src/features/content/in-page-panel/panel.ts:536; apps/extension/src/side_panel.ts:10668 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No task-category shortcuts (write, research, image) on the side panel new-chat screen were found. Searched apps/extension/src for taskCategor, categor, spWrite, spResearch and spImage. The cited pageActions.ts and in-page-panel/panel.ts chips (Summarize, Key points) belong to the in-page panel on web pages, not to a category setup for the next message.

## S12.06 Recent Project shortcuts.

- **Expected:** The new-chat screen offers shortcuts to the user's recent projects that open the project or start a chat in it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5549 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5528 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5541 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No recent-projects shortcut list was found. The only project list found is the Projects group in the @ menu (see S12.20), which does not show recency. Searched side_panel.ts and apps/extension/src for recent plus project.

## S12.15 Agentic-work entry.

- **Expected:** From the new-chat screen the user can start agentic (multi-step, tool-using) work rather than a plain chat.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13507; apps/extension/src/side_panel.ts:13547; apps/extension/manifest.json:84
- **Where to find it:** AI Assistant button (header) > AGI Work toggle (labels found in the code)
- **Needs:** a paid account that includes AGI Work (other plans see a locked AGI Work row)
- **Steps:**
  1. Sign in on a paid account that includes AGI Work, open New chat.
  2. Click the "AI Assistant" button at the top of the side panel to open the model menu.
  3. Turn on the "AGI Work" row.
  4. Look: the header shows the "AGI Work" badge and the next message starts agentic work, not plain chat.

## S12.18 Default-model display.

- **Expected:** The new-chat screen shows which model the next message will use before the user sends.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:10914; apps/extension/src/side_panel.ts:9887; apps/extension/manifest.json:84
- **Where to find it:** AI Assistant button (header) (labels found in the code)
- **Needs:** a signed-in account to see the model list
- **Steps:**
  1. Sign in and open New chat.
  2. Look at the header button at the top: it reads "AI Assistant" until a model is chosen.
  3. Click the button, choose a model from the list, and close the menu.
  4. Look: the header button now shows that model's name before any message is sent.

## S12.20 Default-Project selection.

- **Expected:** Before sending, the user can pick the project a new chat will be created in.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:11571; apps/extension/src/side_panel.ts:11596; apps/extension/src/side_panel.ts:1300; apps/extension/manifest.json:84
- **Where to find it:** Message box > type @ > Projects > project name (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Sign in with an account that has at least one project, open New chat.
  2. Click the message box and type @. The @ menu opens.
  3. Under the "Projects" heading, click a project (its second line reads "Start the chat in this project").
  4. Look: a header chip reads "Project · <name>" with a × to stop using it, and the next chat is filed under that project.

## S12.21 Mode explanation and examples.

- **Expected:** The new-chat screen explains the available modes and gives examples of what each is for.
- **Code:** done. Evidence present: apps/extension/_locales/en/messages.json:820; apps/extension/_locales/en/messages.json:756; apps/extension/_locales/en/messages.json:764; apps/extension/_locales/en/messages.json:1890
- **Where to find it:** AI Assistant button (header) > model menu rows (labels found in the code)
- **Needs:** a signed-in account to see all rows
- **Steps:**
  1. Sign in and open New chat.
  2. Click the "AI Assistant" button at the top to open the model menu.
  3. Read the one-line description under each row: Auto, Quick, Extended thinking and AGI Work.
  4. Look: each mode has a description; only the AGI Work description gives an example (researching a topic and building a report). Compare with Expected, which places this on the new-chat screen.

## S12.22 First-use feature education.

- **Expected:** First-time users are shown a short introduction to the product's key features before or at their first chat.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10889 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5457 (quoted code not found in the file now); apps/extension/manifest.json:84
- **Where to find it:** Side panel (first open) > notice above the message box > Next > Let's go (labels found in the code)
- **Needs:** a fresh install or cleared AGI onboarding state
- **Steps:**
  1. Use a fresh install or a profile where AGI onboarding has not finished. On install, a "AGI in Chrome" welcome tab opens.
  2. Open the AGI side panel. A notice titled "Getting started with AGI" appears above the message box, reading "AGI reads a page only when you attach it or ask it to act there."
  3. Click "Next". The notice shows the keyboard shortcut text (or a message to set shortcuts).
  4. Click "Let's go" and look: the notice closes and the side panel is ready for a first chat.
