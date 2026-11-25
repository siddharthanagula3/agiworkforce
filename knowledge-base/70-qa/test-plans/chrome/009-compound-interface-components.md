---
id: "PLAN-chrome-009"
type: "test-plan"
title: "Chrome · 9. Compound interface components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "9"
---
# Chrome · 9. Compound interface components

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S9.01 Searchable resource picker.

- **Expected:** A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14350; apps/extension/src/side_panel.ts:14426; apps/extension/src/side_panel.ts:13209 (quoted code not found in the file now)
- **Where to find it:** Chat composer > type @ > the list under the heading "Projects" (open tabs are listed above it); type part of a project name to narrow the list (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Sign in and open a chat in the side panel.
  2. Click the message box and type @.
  3. Look for the "Projects" heading and the project rows under it, each with "Start the chat in this project".
  4. Type part of a project name after the @ and check that the list narrows to matches.

## S9.02 Model picker.

- **Expected:** A control lists the available models and switches the conversation to the one the user picks.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10967; apps/extension/src/side_panel.ts:6045 (quoted code not found in the file now)
- **Where to find it:** Chat, top of the composer > model button showing "AI Assistant" (or the current model name) > "All models (n)" > type in "Search models" > click a model row (labels found in the code)
- **Needs:** a signed-in account (without it the menu shows "Sign in for models")
- **Steps:**
  1. Sign in and open a chat in the side panel.
  2. Click the model button at the top of the chat.
  3. Click "All models" and type part of a model name in "Search models".
  4. Click a model row and check the model button now shows the model you picked.

## S9.06 Project picker.

- **Expected:** The user can pick one of their projects so the chat or task runs in that project.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:11596; apps/extension/src/side_panel.ts:6172 (quoted code not found in the file now); apps/extension/src/side_panel.ts:1300
- **Where to find it:** Recent chats (clock icon in the side panel header) > "More actions" on a chat > "Move to project" > pick a project in the list labelled "Project for this chat" (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Sign in and click the clock icon labelled "Recent chats".
  2. Click "More actions" on a chat row.
  3. Click "Move to project".
  4. Open the list "Project for this chat" and pick a project.
  5. Check the status line "Moved to [project name]." and compare with Expected.

## S9.10 Permission-scope picker.

- **Expected:** When granting access (an API key, tool approvals or site automation), the user chooses how far the permission reaches: which capabilities, or once versus always.
- **Code:** done. Evidence moved: apps/extension/src/features/options/site-permission-policy.ts:236 (quoted code not found in the file now); apps/extension/src/background.ts:4040 (quoted code not found in the file now); apps/extension/src/options.ts:1324
- **Where to find it:** More (button in the side panel header) > "Extension settings" (opens the Permissions page) > "Browser control" menu with Auto, Ask first, Full access, YOLO (labels found in the code)
- **Steps:**
  1. Click "More" in the side panel header.
  2. Click "Extension settings"; a new tab opens on the Permissions page.
  3. Find "Browser control" and open its menu.
  4. Pick "Ask first" or "Full access" and read the line under the menu.
  5. Compare what is shown with Expected.

## S9.12 Recurrence editor.

- **Expected:** When creating a scheduled task, the user sets how it repeats (once, daily, weekly, monthly or a custom rule) and the schedule runs on that cadence.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:9230 (quoted code not found in the file now); apps/extension/src/features/background/tasks.ts:190; apps/extension/src/side_panel.ts:9303 (quoted code not found in the file now)
- **Where to find it:** More > "Shortcuts" (opens the Shortcuts page) > "Schedules" section > "New schedule" > "Repeat" menu (labels found in the code)
- **Steps:**
  1. Click "More" in the side panel header, then "Shortcuts".
  2. In the Schedules section, click "New schedule".
  3. Open "Repeat" and read its choices: Once, Every day, On chosen days of the week, Once a month.
  4. Fill in the form and save; check the new schedule shows its next run time.

## S9.19 Timeline.

- **Expected:** The steps of a run are shown in time order, each with its state and (where known) how long it took.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:1125; apps/extension/src/side_panel.ts:5934
- **Where to find it:** Chat, above an assistant reply that ran several steps: the summary line starting "Working for" or "Worked for" (click it to expand the step list) (labels found in the code)
- **Needs:** a request that runs several steps
- **Steps:**
  1. Send a request that makes AGI run several steps, such as a browser task.
  2. While it runs, look at the summary line that starts "Working for" above the reply.
  3. Click the summary and read the steps from top to bottom.
  4. Compare the step order and each step's time with Expected.

## S9.21 Task board.

- **Expected:** Tasks are laid out as a board with a column per status so the user sees and manages work by stage.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. I searched apps/extension for board, kanban and column layouts and found none; the only task view is a list sheet opened from "Tasks".
- **Needs:** live-web

## S9.22 Stepper.

- **Expected:** A multi-step flow shows which step the user is on out of how many (e.g. dots or "Step 2 of 4") and advances or goes back with it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5714 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5781 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10147 (quoted code not found in the file now)
- **Where to find it:** Side panel on first open (before the tour is finished) > card "Getting started with AGI" > "Next" > "Let's go" (labels found in the code)
- **Needs:** a profile where the side panel tour is not done
- **Steps:**
  1. Open the side panel for the first time, on a profile where the tour has not been finished.
  2. Read the card titled "Getting started with AGI" and click "Next".
  3. Read the second card and click "Let's go".
  4. Check whether a step count or a Back button appears, and compare with Expected.

## S9.23 Multi-step setup wizard.

- **Expected:** A guided setup runs as ordered steps that collect the user's choices (name, model, sign-in) and saves them when it finishes.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8402 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8490 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8565 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/capabilityDocument.ts:56 (quoted code not found in the file now)
- **Where to find it:** not found in the code. I searched the onboarding and side panel code for an ordered setup flow; the only setup screen is a welcome page with a sign-in button and a start button, with no name or model step.

## S9.28 Source inspector.

- **Expected:** The user can open an answer's sources and see each one's title, origin and the excerpt it contributed, then open it.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:42
- **Where to find it:** Chat, an answer that used web sources: the source chip under the answer (shows a site name, or "$SITE$ +$COUNT$" when there are several) > hover or focus it to open the source card (labels found in the code)
- **Needs:** a question that returns web sources (live web)
- **Steps:**
  1. Sign in and ask a question that needs web sources.
  2. Find the source chip in the answer and hover over it (tap it on touch).
  3. Read each source's title, site and excerpt in the card.
  4. Click a source title to open it in a new tab and compare with Expected.

## S9.29 Usage meter.

- **Expected:** A meter shows how much of the plan allowance is used (per window) with the reset time, readable by assistive tech.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:678 (quoted code not found in the file now); apps/extension/src/side_panel.ts:688 (quoted code not found in the file now)
- **Where to find it:** More (button in the side panel header) > "Usage" row with a thin bar and a percent (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in to a paid account; the Usage row is not shown on Free.
  2. Click "More" in the side panel header.
  3. Find the "Usage" row and read its bar and percent.
  4. Compare the percent with Expected; the reset time is not on this row.

## S9.31 Permission summary.

- **Expected:** One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools).
- **Code:** done. Evidence moved: apps/extension/src/options.ts:1405; apps/extension/src/features/options/site-permission-policy.ts:330 (quoted code not found in the file now); apps/extension/src/options.ts:1324
- **Where to find it:** More > "Extension settings" (opens the Permissions page) > "Browser access" text, then "Browser control" and the approved-sites list (labels found in the code)
- **Steps:**
  1. Click "More" in the side panel header, then "Extension settings".
  2. On the Permissions page, read the "Browser access" text.
  3. Read "Browser control" and its hint about what AGI may do.
  4. Scroll to the approved sites and blocked sites sections and compare with Expected.

## S9.32 Approval card.

- **Expected:** When an action needs consent, an inline card names the action and offers approve and deny, and the choice resumes or stops the run.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat, an activity summary that needs approval (it opens by itself): click the step row that says "Your approval is required before this tool can run." > "Approve" or "Decline" (labels found in the code)
- **Needs:** a signed-in account and a run that asks for approval
- **Steps:**
  1. Send a request that makes AGI run a tool step needing approval.
  2. Look for the activity block that opens by itself with the approval message.
  3. Click the step row if its buttons are not visible.
  4. Click "Approve" or "Decline" and check the recorded message and whether the run continues or stops.

## S9.35 Task-progress card.

- **Expected:** A running task shows a card with its current state and progress (steps done, latest action) that updates while it runs.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat, the activity summary above the reply that starts "Working for" and shows the step count; it updates while the run is active (labels found in the code)
- **Needs:** a request that runs a multi-step task
- **Steps:**
  1. Send a request that makes AGI run a multi-step task.
  2. Watch the summary line "Working for [time]" with its step count.
  3. Wait and check that the time and step count change while it runs.
  4. Click "More" then "Tasks" and check the running task's state.

## S9.36 Interactive result widget.

- **Expected:** An answer can embed a widget the user operates in place (choices, map, app card), and the choice or state feeds back into the conversation.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/interactiveCards.ts:394; apps/extension/src/side_panel.ts:5813; apps/extension/src/features/side-panel/bubbles.ts:161
- **Where to find it:** Chat, a reply that shows a choice card (clarifying question with choices): pick answers in the card > "Send answers" (labels found in the code)
- **Needs:** a signed-in account and a question that makes AGI show a choice card
- **Steps:**
  1. Sign in and ask a question that leads AGI to offer choices.
  2. In the card, pick one or more answers.
  3. Click "Send answers".
  4. Check that your answers appear as a new message in the chat.

## S9.38 Keyboard-command palette.

- **Expected:** A keyboard shortcut opens a searchable list of commands and destinations; typing filters it and Enter runs the choice.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/commandPalette.ts:116; apps/extension/src/features/side-panel/commandPalette.ts:278; apps/extension/src/side_panel.ts:13635
- **Where to find it:** Side panel, with focus inside it: press Command+K > type in "Search commands and chats" > Enter on a result (labels found in the code)
- **Steps:**
  1. Click inside the side panel.
  2. Press Command+K.
  3. Type part of a command name or chat title.
  4. Use the arrow keys to move the highlight, then press Enter.
  5. Check the chosen command or chat runs, and that a word with no match shows "No command or chat matches."
