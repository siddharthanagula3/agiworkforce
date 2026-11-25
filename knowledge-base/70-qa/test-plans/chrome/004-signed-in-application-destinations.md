---
id: "PLAN-chrome-004"
type: "test-plan"
title: "Chrome · 4. Signed-in application destinations"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "4"
---
# Chrome · 4. Signed-in application destinations

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S4.01 New-chat home.

- **Expected:** Signed-in user lands on (or opens) an empty new-chat screen with a ready composer from which a new conversation starts.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13656; apps/extension/src/side_panel.ts:11533; apps/extension/src/side_panel.ts:8968
- **Where to find it:** Side panel header > New chat (pen icon) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel while signed in.
  2. Click the pen icon in the header whose tooltip and accessible name is New chat.
  3. Look for an empty chat with the composer ready to type in.

## S4.02 Existing conversation.

- **Expected:** Opening a past conversation (from the list or a link) shows its transcript and lets the user continue it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6728 (quoted code not found in the file now); apps/extension/src/side_panel.ts:12901
- **Where to find it:** Side panel header > Recent chats (clock icon) (labels found in the code)
- **Needs:** a signed-in account with at least one saved chat
- **Steps:**
  1. Click the clock icon in the header to open Recent chats.
  2. Click a chat title in the list.
  3. Look for that chat's transcript and check that the composer lets you send a new message to continue it.

## S4.03 Conversation search.

- **Expected:** A search destination where the user types a keyword, gets past conversations matching titles or message text, and opens one.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6700 (quoted code not found in the file now); apps/extension/src/features/background/conversation-history.ts:1597
- **Where to find it:** Side panel header > Recent chats (clock icon) > Search recent chats (labels found in the code)
- **Needs:** a signed-in account with several saved chats
- **Steps:**
  1. Click the clock icon in the header to open Recent chats.
  2. Click the Search recent chats field and type a word from a past chat title or message.
  3. Check that only matching past chats are listed.
  4. Click one of them and check that its transcript opens.

## S4.06 Projects index.

- **Expected:** A Projects destination lists the user's projects and lets them open or create one.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No Projects index screen found in apps/extension. Project choices appear only in the chat history menu (Move to project, Add to project) and as a Projects group when typing @ in the composer. Searched the locale file and src for Projects, project list and project keys.
- **Needs:** a signed-in account with projects

## S4.07 Project overview.

- **Expected:** Opening a project shows its home: name, description/instructions summary, and entry points to its chats and files.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No project overview screen found in apps/extension. The only project element is the chip that reads "Project · NAME" with a clear button, shown after a project is selected. Searched the locale file and src for project keys.
- **Needs:** a signed-in account with a project

## S4.08 Project conversations.

- **Expected:** Within a project, a list of the project's conversations that open when selected.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No list of project conversations found in apps/extension. Searched the locale file and src for project keys.
- **Needs:** a signed-in account with a project that has chats

## S4.10 Project instructions.

- **Expected:** A place to view and edit a project's instructions, which then apply to chats in that project.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No project instructions editor found in apps/extension. Searched the locale file for instruction and project keys and src for project screens.
- **Needs:** a signed-in account with a project

## S4.13 Work-task home.

- **Expected:** A home for agentic work where the user states a goal for an autonomous multi-step (AGI Work) run and can reach their recent work.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:11163; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:776
- **Where to find it:** AI Assistant button above the composer > AGI Work switch; recent work under More (...) > Tasks (labels found in the code)
- **Needs:** a paid account with the AGI Work capability (a Free account sees a gated note instead)
- **Steps:**
  1. Click the AI Assistant button above the composer to open the model menu.
  2. Turn on the AGI Work switch.
  3. Type a goal in the composer and send it. Check that a multi-step AGI Work run starts.
  4. Click More (...) > Tasks and check that the run appears in the list of recent work.

## S4.14 Active-task dashboard.

- **Expected:** A dashboard lists the user's active/running work tasks with their live status, filterable from finished ones.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (...) > Tasks (labels found in the code)
- **Needs:** a signed-in account with at least one running or finished task
- **Steps:**
  1. Click More (...) in the header, then click Tasks.
  2. Look at the list: each row shows a title, a state label and a time.
  3. Check whether any finished tasks can be hidden or filtered out.
  4. Click All tasks on the web at the bottom to compare the full list.

## S4.15 Task details and transcript.

- **Expected:** Opening one task shows its status, step-by-step activity/transcript, outputs, and any pending decision.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (...) > Tasks > Open on a task row (labels found in the code)
- **Needs:** a signed-in account with a task that has a conversation
- **Steps:**
  1. Click More (...) in the header, then click Tasks.
  2. Click Open on a task row.
  3. Look for a new browser tab on the AGI web app at that task's chat.

## S4.16 Approvals inbox.

- **Expected:** An approvals inbox gathers every pending approval across the user's tasks and lets them approve or reject each.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No approvals inbox found in apps/extension. Approvals appear inside a chat (Approve / Decline) and in the Schedules list for paused steps (Approve / Deny). Searched the locale file and src for approval and inbox keys.
- **Needs:** a signed-in account with pending approvals

## S4.17 Scheduled-task manager.

- **Expected:** A scheduled-task manager lists the user's schedules with cadence/status and lets them create, edit, pause/resume, run now and delete.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:9190 (quoted code not found in the file now); apps/extension/src/side_panel.ts:9283 (quoted code not found in the file now); apps/extension/src/features/side-panel/schedulesSection.ts:916; apps/extension/src/features/side-panel/schedulesSection.ts:1195
- **Where to find it:** More (...) > Shortcuts > Schedules (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (...) in the header, then click Shortcuts. This opens the settings page on Shortcuts.
  2. Scroll to the Schedules heading.
  3. Click New schedule, fill in Name, Instructions and Repeat, then click Create schedule.
  4. In the list, use Pause or Resume, Run now, Edit and Delete on a row, and check each result against Expected.

## S4.18 Routine details.

- **Expected:** Opening one routine/schedule shows its configuration (prompt, cadence, next run) and its run history.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/schedulesSection.ts:1090; apps/extension/src/features/side-panel/schedulesSection.ts:1118; apps/extension/src/features/side-panel/schedulesSection.ts:876; apps/extension/src/features/side-panel/schedulesSection.ts:893
- **Where to find it:** More (...) > Shortcuts > Schedules > a schedule row > Runs (labels found in the code)
- **Needs:** a schedule that has at least one run
- **Steps:**
  1. Open the Schedules section as in S4.17.
  2. Click Runs on a schedule row.
  3. Look for the Instructions text (shown under Prompt), the Next and Last times on the row, and the list of past runs under Runs.

## S4.25 Artifact gallery.

- **Expected:** An artifact gallery lists the user's generated artifacts and opens any of them.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No artifact gallery found in apps/extension. Artifacts appear as cards inside a chat reply (Artifacts in this reply, with Open and Hide). Searched the locale file and src for gallery and artifact list keys.
- **Needs:** a signed-in account with generated artifacts

## S4.39 Usage dashboard.

- **Expected:** A usage dashboard shows current usage against plan limits per window (session/weekly/credits), reset times and recent usage history.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:678 (quoted code not found in the file now); apps/extension/src/side_panel.ts:11238 (quoted code not found in the file now); apps/extension/src/side_panel.ts:13218
- **Where to find it:** More (...) > Usage, or Options > Account > Plan and usage > Open (labels found in the code)
- **Needs:** a paid account (the Usage row is hidden on the Free plan)
- **Steps:**
  1. Click More (...) in the header and read the Usage row, which shows a percent meter.
  2. Click Usage. A new tab opens the AGI web usage page.
  3. Compare the usage windows, reset times and history on that page with Expected.

## S4.41 Personal settings.

- **Expected:** A personal settings destination lets the signed-in user view and change their own preferences (profile, appearance, personalization, notifications) and saves them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6590 (quoted code not found in the file now); apps/extension/src/side_panel.ts:7392 (quoted code not found in the file now)
- **Where to find it:** More (...) > Extension settings > Options (left menu); Account for the autofill profile (labels found in the code)
- **Steps:**
  1. Click More (...) in the header, then click Extension settings. This opens the Permissions page.
  2. Click Options in the left menu. Change a notification setting or the Theme under Appearance.
  3. Click Account in the left menu and open Autofill profile (optional). Change a field and save it.
  4. Reopen the page and check that the changes were kept.

## S4.44 Help and feedback.

- **Expected:** A help-and-feedback destination links to help/docs/status and lets the user send product feedback or a bug report from inside the product.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (...) > Help (labels found in the code)
- **Steps:**
  1. Click More (...) in the header, then click Help. This opens the settings page on Help.
  2. Check the Help center, Documentation and Contact support rows. Each has an Open link that opens the AGI web app in a new tab.
  3. Look for a way to send product feedback or a bug report inside the product.
