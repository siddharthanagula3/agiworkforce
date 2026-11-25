---
id: "PLAN-mobile-004"
type: "test-plan"
title: "Mobile · 4. Signed-in application destinations"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "4"
---
# Mobile · 4. Signed-in application destinations

32 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S4.01 New-chat home.

- **Expected:** Signed-in user lands on (or opens) an empty new-chat screen with a ready composer from which a new conversation starts.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/chat.tsx:1283; apps/mobile/app/(app)/(tabs)/chat.tsx:1408; apps/mobile/src/features/drawer/components/DrawerContent.tsx:425
- **Where to find it:** Side menu > New chat (labels found in the code)
- **Steps:**
  1. Open the side menu.
  2. Tap New chat.
  3. Look for an empty chat screen with a message box ready to type in, not an old conversation.

## S4.02 Existing conversation.

- **Expected:** Opening a past conversation (from the list or a link) shows its transcript and lets the user continue it.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:476; apps/mobile/src/features/drawer/components/DrawerContent.tsx:509
- **Where to find it:** Side menu > Recents > tap a conversation title (labels found in the code)
- **Needs:** an existing conversation
- **Steps:**
  1. Open the side menu.
  2. Under Recents, tap a past conversation.
  3. Look for its earlier messages and a message box that lets you continue it.

## S4.03 Conversation search.

- **Expected:** A search destination where the user types a keyword, gets past conversations matching titles or message text, and opens one.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:304 (quoted code not found in the file now); apps/mobile/src/features/chat/ChatsListScreen.tsx:231
- **Where to find it:** Side menu > Search icon (Search) (labels found in the code)
- **Needs:** at least one past conversation containing the word
- **Steps:**
  1. Open the side menu.
  2. Tap the Search icon in the header.
  3. Type a word that appears in a conversation title or message.
  4. Look for matching past conversations and tap one to open it.

## S4.04 Archived conversations.

- **Expected:** A destination lists the user's archived conversations and lets them open, restore or delete them.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/archived-chats.tsx:49 (quoted code not found in the file now); apps/mobile/src/features/settings/index.tsx:559 (quoted code not found in the file now); apps/mobile/src/features/archived-chats/service.ts:44 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Archived Chats (labels found in the code)
- **Needs:** a signed-in Cloud account with at least one archived chat
- **Steps:**
  1. Open Settings.
  2. Find the Cloud group and tap Archived Chats.
  3. Look for a list of archived conversations.
  4. Try opening, restoring and deleting one, and compare with Expected.

## S4.05 Pinned conversations.

- **Expected:** Conversations the user pinned are shown together in a pinned section or filter and open from there.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/ChatsListScreen.tsx:135; apps/mobile/src/features/chat/ChatsListScreen.tsx:269; apps/mobile/src/features/conversation-actions/useConversationActions.ts:124 (quoted code not found in the file now)
- **Where to find it:** Side menu > Recents (pinned rows show a pin icon) (labels found in the code)
- **Needs:** a pinned conversation
- **Steps:**
  1. Open the side menu.
  2. Find a conversation that has been pinned, shown with a small pin icon.
  3. Tap it and confirm it opens the conversation.

## S4.06 Projects index.

- **Expected:** A Projects destination lists the user's projects and lets them open or create one.
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:109; apps/mobile/app/(app)/(tabs)/projects.tsx:397; apps/mobile/app/(app)/(tabs)/projects.tsx:73
- **Where to find it:** Side menu > Projects (labels found in the code)
- **Steps:**
  1. Open the side menu.
  2. Tap Projects.
  3. Look for the list of projects.
  4. Tap New project and check that a create form opens.

## S4.07 Project overview.

- **Expected:** Opening a project shows its home: name, description/instructions summary, and entry points to its chats and files.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/projects/[id].tsx:99 (quoted code not found in the file now); apps/mobile/app/(app)/projects/[id].tsx:111 (quoted code not found in the file now)
- **Where to find it:** Side menu > Projects > tap a project (labels found in the code)
- **Needs:** a project
- **Steps:**
  1. Open the side menu and tap Projects.
  2. Tap a project name.
  3. Look for the project name, its instructions entry, and tabs named Chats and Sources (Work, Artifacts and Routines appear only in some cases).

## S4.08 Project conversations.

- **Expected:** Within a project, a list of the project's conversations that open when selected.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/projects/[id].tsx:546; apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:64 (quoted code not found in the file now)
- **Where to find it:** Side menu > Projects > tap a project > Chats (labels found in the code)
- **Needs:** a project with at least one conversation
- **Steps:**
  1. Open the project as in S4.07.
  2. Tap the Chats tab.
  3. Look for the project's conversations and tap one to open it.
  4. Compare with Expected.

## S4.09 Project files and sources.

- **Expected:** Within a project, a files/sources view lists the project's knowledge files and lets the user add and remove them.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now); apps/web/lib/services/entitlement-resolution.ts:431
- **Where to find it:** Side menu > Projects > tap a project > Sources (labels found in the code)
- **Needs:** a project and a file to upload
- **Steps:**
  1. Open the project as in S4.07.
  2. Tap the Sources tab.
  3. Look for the project's files and the controls to add or remove them.
  4. Compare with Expected.

## S4.10 Project instructions.

- **Expected:** A place to view and edit a project's instructions, which then apply to chats in that project.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:565 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/projects.tsx:170 (quoted code not found in the file now); apps/mobile/src/features/projects/store.ts:416
- **Where to find it:** Side menu > Projects > tap a project > instructions entry (labels found in the code)
- **Needs:** a project the account can edit (not archived or shared with it)
- **Steps:**
  1. Open the project as in S4.07.
  2. Tap the instructions entry on the project home (ProjectInstructionsEntry).
  3. Edit the instructions and save.
  4. Open a chat in that project and check the instructions apply.

## S4.13 Work-task home.

- **Expected:** A home for agentic work where the user states a goal for an autonomous multi-step (AGI Work) run and can reach their recent work.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:142; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:437 (quoted code not found in the file now); apps/mobile/src/features/tasks/startWork.ts:65
- **Where to find it:** Side menu > AGI Work (labels found in the code)
- **Needs:** a plan that includes AGI Work
- **Steps:**
  1. Open the side menu.
  2. Tap AGI Work (it may sit under the More item).
  3. Look for the New task button and a field to state a goal.
  4. Check that you can reach your recent work from this screen.

## S4.14 Active-task dashboard.

- **Expected:** A dashboard lists the user's active/running work tasks with their live status, filterable from finished ones.
- **Code:** done. Evidence moved: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:695; apps/mobile/src/features/tasks/runPresentation.ts:26; apps/mobile/src/features/tasks/service.ts:29 (quoted code not found in the file now)
- **Where to find it:** Side menu > AGI Work > filter Running (labels found in the code)
- **Needs:** a running AGI Work task
- **Steps:**
  1. Open AGI Work as in S4.13.
  2. Tap the Running filter.
  3. Look for tasks that are in progress and their live status.
  4. Tap Finished and check that only finished tasks remain.

## S4.15 Task details and transcript.

- **Expected:** Opening one task shows its status, step-by-step activity/transcript, outputs, and any pending decision.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:544; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:428; apps/mobile/src/features/tasks/service.ts:61
- **Where to find it:** Side menu > AGI Work > tap a task (labels found in the code)
- **Needs:** a task
- **Steps:**
  1. Open AGI Work and tap a task.
  2. Look for the status, Started on, Mode, Model, and the sections Latest output and Activity.
  3. Look for the action buttons (Pause this task, Resume this task, Stop this task) and any pending approval.

## S4.16 Approvals inbox.

- **Expected:** An approvals inbox gathers every pending approval across the user's tasks and lets them approve or reject each.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/runPresentation.ts:23; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:428; apps/mobile/src/features/tasks/service.ts:70
- **Where to find it:** not found in the code. No separate approvals inbox found. The nearest candidate is the Needs you filter in AGI Work (apps/mobile/src/features/tasks/runPresentation.ts), and approvals are resolved from the task sheet. I did not confirm that the filter gathers every pending approval.
- **Needs:** a task waiting for approval

## S4.17 Scheduled-task manager.

- **Expected:** A scheduled-task manager lists the user's schedules with cadence/status and lets them create, edit, pause/resume, run now and delete.
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:134; apps/mobile/app/(app)/schedules/index.tsx:83; apps/mobile/src/features/schedules/service.ts:148
- **Where to find it:** Side menu > Schedules (labels found in the code)
- **Needs:** a schedule (create one first if none exists)
- **Steps:**
  1. Open the side menu and tap Schedules.
  2. Look for the list of schedules and the Create schedule button.
  3. Open a schedule's actions and check for Run now, Pause or Resume, and Delete.
  4. Compare the cadence and status shown on each card with Expected.

## S4.18 Routine details.

- **Expected:** Opening one routine/schedule shows its configuration (prompt, cadence, next run) and its run history.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleCard.tsx:354; apps/mobile/src/features/schedules/service.ts:244
- **Where to find it:** Side menu > Schedules > tap a schedule (labels found in the code)
- **Needs:** a schedule that has run at least once
- **Steps:**
  1. Open Schedules and tap a schedule card.
  2. Look for the prompt, the cadence and the next run.
  3. Expand the run history on the card and check it lists past runs.

## S4.19 Coding-session home.

- **Expected:** A coding home lists the user's coding sessions and starts a new one on a repository or runtime.
- **Code:** done. Evidence present: apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx:403
- **Where to find it:** Side menu > AGI Code (labels found in the code)
- **Needs:** a Cloud account allowed to use AGI Code
- **Steps:**
  1. Open the side menu and tap AGI Code.
  2. Look for the list of coding sessions.
  3. Start a new session and check that a sheet offers Task, Repository and Network access.

## S4.20 Coding-session workspace.

- **Expected:** A coding-session workspace shows the session transcript, file changes/diffs and a composer to steer the next turn.
- **Code:** done. Evidence present: apps/mobile/app/(app)/companion/code/[threadId].tsx:86; apps/mobile/src/features/companion/components/CodeSessionView.tsx:135
- **Where to find it:** Side menu > AGI Code > tap a session (labels found in the code)
- **Needs:** an existing coding session
- **Steps:**
  1. Open AGI Code and tap a session.
  2. Look for the transcript and any file changes or diffs.
  3. Type a message in the composer at the bottom and check that it steers the next turn.

## S4.21 Remote devices.

- **Expected:** A devices destination lists the user's linked devices with status/last activity and lets them manage (rename, unlink, pair) them.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:129 (quoted code not found in the file now); apps/mobile/app/(app)/companion/index.tsx:151; apps/mobile/app/(app)/companion/index.tsx:292
- **Where to find it:** AGI Code > Add device (devices section) (labels found in the code)
- **Needs:** a second device or the desktop app to pair
- **Steps:**
  1. Open AGI Code and find the devices section.
  2. Tap Add device to pair a new device, or open the Remote screen.
  3. Look for linked devices with status, and the Disconnect control.

## S4.22 Remote-session viewer.

- **Expected:** A viewer opens a session running on another of the user's devices and shows its live transcript/state with controls.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/companion/code/[threadId].tsx:86; apps/mobile/src/features/companion/remote-code/service.ts:33 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The viewer route is apps/mobile/app/(app)/companion/code/[threadId].tsx, the same as S4.20. I did not find how a remote session is opened from a device.
- **Needs:** a session running on a second linked device

## S4.23 Library.

- **Expected:** A Library destination lists everything the account produced or uploaded (files, images, videos, documents, artifacts) with filters and open/download actions.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:115; apps/mobile/src/features/library/index.tsx:42 (quoted code not found in the file now); apps/mobile/src/features/library/libraryClient.ts:107
- **Where to find it:** Side menu > Library (labels found in the code)
- **Needs:** some generated or uploaded files
- **Steps:**
  1. Open the side menu and tap Library.
  2. Look for files, images, videos and documents, and the filter chips.
  3. Tap a filter such as Images and check that the list narrows.
  4. Open an item and look for open or download actions.

## S4.25 Artifact gallery.

- **Expected:** An artifact gallery lists the user's generated artifacts and opens any of them.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:925; apps/mobile/src/features/library/index.tsx:322
- **Where to find it:** Side menu > Library > Artifacts (labels found in the code)
- **Needs:** at least one generated artifact
- **Steps:**
  1. Open Library.
  2. Tap the Artifacts filter chip.
  3. Look for the list of artifacts.
  4. Tap one and check it opens (its label starts with Open artifact).

## S4.27 Image studio.

- **Expected:** A dedicated image studio where the user writes a prompt, picks style/size options, generates images and sees results/history in one place.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ImageFullScreen.tsx:233 (quoted code not found in the file now); apps/mobile/src/features/image/components/ImageAreaEditor.tsx:293; apps/mobile/src/features/image/components/ImageAreaEditor.tsx:147; apps/mobile/src/features/image/services/imageMask.ts:187; apps/mobile/app/(app)/chat/[id].tsx:2106; apps/mobile/app/(app)/chat/[id].tsx:2123; apps/mobile/src/features/library/index.tsx:421; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:271 (quoted code not found in the file now); apps/mobile/services/fileCreation.ts:684
- **Where to find it:** Side menu > Images (labels found in the code)
- **Needs:** a Cloud account allowed to create images
- **Steps:**
  1. Open the side menu and tap Images.
  2. Look for the Create an image section with the Describe an image box.
  3. Type a prompt, check the style and size options, and tap Create image.
  4. Look for the new image and the list of your images.

## S4.28 Image collection.

- **Expected:** An image collection view shows all images the user generated or uploaded, with open/download/remix actions.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:337; apps/mobile/src/features/library/libraryClient.ts:107
- **Where to find it:** Side menu > Images (Your images), or Library > Images (labels found in the code)
- **Needs:** some images
- **Steps:**
  1. Open the side menu and tap Images, and look for Your images.
  2. Or open Library and tap the Images filter chip.
  3. Check that generated and uploaded images both appear.
  4. Open one and look for download and remix actions.

## S4.30 Media job history.

- **Expected:** A media job history lists image/video generation jobs with their status (queued, running, failed, done) and links to results.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:1008; apps/mobile/src/features/library/libraryClient.ts:178; apps/mobile/src/features/library/MediaJobsSection.tsx:77
- **Where to find it:** Side menu > Library > Images (media jobs list) (labels found in the code)
- **Needs:** at least one image or video generation job
- **Steps:**
  1. Open Library and choose a generation filter such as Images.
  2. Look for the media jobs list.
  3. Check each job's status: Queued, Generating, Failed or Done.
  4. Tap a finished job and check it links to its result.

## S4.32 Research report reader.

- **Expected:** A research report reader lists the user's research reports and opens one with its sections and cited sources.
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:163; apps/mobile/src/features/research/ReportsScreen.tsx:517; apps/mobile/src/features/research/service.ts:134
- **Where to find it:** Open menu > More > Reports (labels found in the code)
- **Needs:** a signed-in account in Managed Cloud mode, with at least one research report (run Research from the composer first)
- **Steps:**
  1. Tap the "Open menu" button to open the side drawer.
  2. Tap "More" to expand the folded items, then tap "Reports".
  3. Look for the "Reports" title and a list of report rows, each showing its title, date, source count and model.
  4. Tap one report row to open it, then check for its sections, the "Sources retrieved" line and the sources appendix, as in Expected.

## S4.37 Connected accounts.

- **Expected:** A connected-accounts destination lists the third-party services the user has connected and lets them connect, reconnect and disconnect each.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/connectors/index.tsx:4; apps/mobile/src/features/settings/cloud-connectors/index.tsx:695 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:684; apps/mobile/services/connectors.ts:61 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Connectors (labels found in the code)
- **Needs:** a signed-in Managed Cloud account; a third-party account (for example Google) to complete a real connection
- **Steps:**
  1. Tap "Open menu", then tap "Settings" at the bottom of the drawer.
  2. Scroll to the "Cloud" section and tap "Connectors".
  3. Look for the heading "Connect your tools to AGI Cloud", the "Connected" filter and one card per connector showing its status.
  4. Tap a connector, then check for the "Connect" or "Disconnect" button and the "Reconnect" button when a connection needs it.

## S4.38 Model catalog.

- **Expected:** A model catalog lists the models the user can reach with capabilities/context/price and lets them pick one or set a default.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:880 (quoted code not found in the file now); apps/mobile/app/(app)/models.tsx:100 (quoted code not found in the file now); apps/mobile/app/(app)/models.tsx:244
- **Where to find it:** Settings > General > Models, then "Change model" or "Browse Models" (labels found in the code)
- **Needs:** none for the picker; the Cloud models need a plan that includes them
- **Steps:**
  1. Tap "Open menu", then "Settings", then "General".
  2. Tap the "Models" row. The screen titled "Models" opens.
  3. Tap "Change model" at the top card, or "Browse Models" at the bottom, to open the model picker.
  4. Look for the picker groups "Recent", "Favorites" and "On device", then pick a model and check that it becomes the selected model, as in Expected.

## S4.39 Usage dashboard.

- **Expected:** A usage dashboard shows current usage against plan limits per window (session/weekly/credits), reset times and recent usage history.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/index.tsx:578 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-usage/index.tsx:176 (quoted code not found in the file now); apps/mobile/services/usage.ts:89
- **Where to find it:** Settings > Cloud > Usage (labels found in the code)
- **Needs:** a signed-in Managed Cloud account; a paid account to see plan limits
- **Steps:**
  1. Tap "Open menu", then "Settings", then scroll to the "Cloud" section and tap "Usage".
  2. Look for the "Plan usage" section with its limit buckets and reset times.
  3. Check the "Credit balances" card for the included, bonus and purchased credit amounts.
  4. Scroll to "Where your usage went" and try the day, week and month options, then compare with Expected.

## S4.40 Billing settings.

- **Expected:** A billing settings destination shows the current plan, renewal, payment method and invoices, and lets the user change or cancel the plan.
- **Code:** partial. Evidence moved: apps/mobile/src/features/settings/index.tsx:434 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-billing/index.tsx:199; apps/mobile/lib/v1FeatureFlags.ts:6
- **Known to be unfinished:** D-2026-09-28-27: web-billed plans are managed on the web; invoices, card and plan change link out. FEATURES.billing and the waitlist are owner-held.
- **Where to find it:** Settings > Account > Subscription (labels found in the code)
- **Needs:** a signed-in account; a paid store-billed account to see renewal and manage rows
- **Steps:**
  1. Tap "Open menu", then "Settings", then the "Account" section, and tap "Subscription".
  2. Check the "Your plan" card for the "Current plan" value, the "Renews" or "Access ends" line, and the "Billing" row.
  3. For a paid plan, look for the "Manage billing" row. Its presence depends on the portal flag.
  4. Check the plan buttons ("Upgrade plan", "Adjust plan" or "Choose plan") and compare with Expected. Invoices and card details were not found in the code.

## S4.41 Personal settings.

- **Expected:** A personal settings destination lets the signed-in user view and change their own preferences (profile, appearance, personalization, notifications) and saves them.
- **Code:** done. Evidence gone: apps/mobile/app/(app)/(tabs)/settings.tsx:1 (file no longer exists); apps/mobile/src/features/settings/index.tsx:476 (quoted code not found in the file now); apps/mobile/src/features/settings/index.tsx:499
- **Where to find it:** Settings > Profile card, or Settings > Device > Appearance / Notifications, or Settings > Assistant > Personalization (labels found in the code)
- **Needs:** a signed-in account to see cloud rows such as Personalization
- **Steps:**
  1. Tap "Open menu", then "Settings".
  2. Tap the profile card at the top of the page to open the "Profile" screen, then look at the name and details shown there.
  3. Back in "Settings", tap "Appearance" under "Device", change a theme option, and go back to check that the choice stays.
  4. Tap "Notifications" under "Device" or "Personalization" under "Assistant", change one setting, then reopen it and compare with Expected.

## S4.44 Help and feedback.

- **Expected:** A help-and-feedback destination links to help/docs/status and lets the user send product feedback or a bug report from inside the product.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/index.tsx:598 (quoted code not found in the file now); apps/mobile/src/features/feedback/index.tsx:45 (quoted code not found in the file now)
- **Where to find it:** Settings > Support > Report App Issue, and Settings > Support > Help Center (labels found in the code)
- **Needs:** none for the form; a network connection to submit
- **Steps:**
  1. Tap "Open menu", then "Settings", then scroll to the "Support" section.
  2. Tap "Report App Issue", then choose a type among "Bug Report", "Feature Request" or "General Feedback".
  3. Type a message into the text box and check that the button reads "Submit Feedback" or "Email Feedback" as Expected describes.
  4. Go back, tap "Help Center" and check that it opens the help page in the browser.
