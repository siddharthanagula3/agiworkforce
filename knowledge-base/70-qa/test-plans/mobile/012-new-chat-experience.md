---
id: "PLAN-mobile-012"
type: "test-plan"
title: "Mobile · 12. New-chat experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "12"
---
# Mobile · 12. New-chat experience

20 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S12.01 Empty conversation canvas.

- **Expected:** Opening a new chat shows an empty conversation area (no prior messages) with a ready composer.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/chat.tsx:1283; apps/mobile/app/(app)/(tabs)/chat.tsx:1408
- **Where to find it:** Drawer (top-left menu) > New chat (labels found in the code)
- **Steps:**
  1. Sign in, or stay on the chat tab if it is already open.
  2. Tap the menu button at the top left to open the drawer, then tap New chat.
  3. Look for an empty conversation area with no earlier messages, a greeting at the top, and the composer at the bottom with its text field.

## S12.02 Personalized greeting where appropriate.

- **Expected:** The new-chat screen greets the signed-in user by their (preferred) name when one is known.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatEmptyState.tsx:59
- **Where to find it:** Drawer > Settings > Personalization > Nickname (type your name), then Drawer > New chat (labels found in the code)
- **Needs:** a signed-in account, or a local chat (no account needed), and a name to type
- **Steps:**
  1. Open the drawer and tap Settings, then tap Personalization.
  2. Type a name in the Nickname field and leave the screen so it saves.
  3. Open the drawer and tap New chat.
  4. Look at the greeting at the top of the new chat, which should read with your name, for example Good morning, <name>.

## S12.03 Neutral greeting when personalization is disabled.

- **Expected:** When personalization is off (or no name is known), the new-chat greeting is neutral and shows no personal details.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatEmptyState.tsx:35 (quoted code not found in the file now); apps/mobile/services/cloudSettingsMapping.ts:226
- **Where to find it:** Drawer > Settings > Personalization > Nickname (clear the field), then Drawer > New chat (labels found in the code)
- **Needs:** none (a local chat works without an account)
- **Steps:**
  1. Open the drawer, tap Settings, then tap Personalization.
  2. Clear the Nickname field (leave it empty) and leave the screen so it saves.
  3. Open the drawer and tap New chat.
  4. Look at the greeting: it should be a plain time-of-day phrase such as Good morning with no name and no personal details.

## S12.05 Task-category shortcuts.

- **Expected:** The new-chat screen offers one-tap task-category shortcuts (e.g. write, research, image) that set up the next message.
- **Code:** done. Evidence gone: apps/mobile/src/features/chat/components/TaskChips.tsx:33 (file no longer exists); apps/mobile/app/(app)/(tabs)/chat.tsx:484 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:417 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:891 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/mobile (src, app, components) for TaskChip, taskChip, Quick task and Task categor: nothing found. TaskChips.tsx does not exist. The + sheet has Create image, Create video and Create file rows, which are not one-tap task shortcuts that set up the next message.

## S12.07 Recent-file suggestions.

- **Expected:** When starting a chat the user is offered their recently used files to attach in one step.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:760; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:171 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1426
- **Where to find it:** New chat > + (Add to chat, left of the composer text field) > Attach from Library (labels found in the code)
- **Needs:** a file to upload in an earlier chat (so there is a recent file to offer)
- **Steps:**
  1. On the new-chat screen, tap the + button at the left of the composer.
  2. Look at the Add to Chat sheet, under the Camera, Photos and File cards, for the Attach from Library section.
  3. If recent files are listed there, tap one to attach it to the next message.
  4. Compare with Expected: the recently used files should be offered in one step.

## S12.09 Recommended connected apps.

- **Expected:** The new-chat screen recommends apps/connectors worth connecting or using for the next message.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatEmptyState.tsx:158; apps/mobile/src/features/chat/components/NewChatConnectorSuggestions.tsx:39
- **Where to find it:** not found in the code. The connector suggestion chips (NewChatConnectorSuggestions.tsx) render only inside ChatEmptyState, which MessageList shows for a saved conversation with zero messages (chat/[id]), not on the new-chat screen. The new-chat + sheet has a Connectors row (Manage connectors), which lists connectors but does not recommend them. Searched apps/mobile for NewChatConnectorSuggestions and ChatEmptyState usage.
- **Needs:** a signed-in Cloud account that can use connectors

## S12.10 Search entry.

- **Expected:** From the new-chat screen the user can explicitly start a web search for the next message.
- **Code:** done. Evidence gone: apps/mobile/src/features/chat/components/TaskChips.tsx:33 (file no longer exists)
- **Where to find it:** New chat > + (Add to chat) > Web search toggle (labels found in the code)
- **Needs:** a Cloud account granted web search, and a model that supports search
- **Steps:**
  1. Switch to Cloud (Drawer > Cloud), then open the new-chat screen.
  2. Tap the + button at the left of the composer to open the Add to Chat sheet.
  3. Turn on the Web search switch row.
  4. Close the sheet, type a question that needs current facts, send it, and check that the answer uses web results.

## S12.11 Research entry.

- **Expected:** From the new-chat screen the user can switch on a deep-research mode for the next message.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1235; apps/mobile/stores/chat/chatExecutionStore.ts:3264; apps/mobile/stores/chat/chatExecutionStore.ts:3395; apps/mobile/app/(app)/(tabs)/chat.tsx:1426
- **Where to find it:** New chat > + (Add to chat) > Deep research switch (labels found in the code)
- **Needs:** a Cloud account whose plan grants deep research, and a model that supports research and search (which plan includes it was not verified)
- **Steps:**
  1. Switch to Cloud, then open the new-chat screen.
  2. Tap the + button and find the Deep research row in the Add to Chat sheet.
  3. Turn on the Deep research switch and close the sheet.
  4. Send a question and look for the Research chip above the composer (accessibility label Deep Research active).

## S12.12 Image-creation entry.

- **Expected:** From the new-chat screen the user can enter an image-creation mode whose send generates an image.
- **Code:** done. Evidence gone: apps/mobile/src/features/chat/components/TaskChips.tsx:34 (file no longer exists); apps/mobile/src/features/chat/components/AddToChatSheet.tsx:515 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:485 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:891 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1426
- **Where to find it:** New chat > + (Add to chat) > Create image (some labels not found in the code; trust the screen)
- **Needs:** a Cloud account granted image creation (canUseImages) and an image model in the catalogue
- **Steps:**
  1. Switch to Cloud, then open the new-chat screen.
  2. Tap the + button and tap Create image in the Add to Chat sheet.
  3. Look at the new-chat heading: it should change to Create an image, and the composer is now in image mode.
  4. Type a prompt and tap send; look for a generated image in the reply.

## S12.13 Video-creation entry.

- **Expected:** From the new-chat screen the user can enter a video-creation mode whose send starts a video generation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:532 (quoted code not found in the file now); apps/mobile/src/features/chat/components/AddToChatSheet.tsx:569; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:337; apps/mobile/app/(app)/(tabs)/chat.tsx:1426
- **Where to find it:** New chat > + (Add to chat) > Create video (some labels not found in the code; trust the screen)
- **Needs:** a Cloud account granted video generation (canUseVideoGeneration)
- **Steps:**
  1. Switch to Cloud, then open the new-chat screen.
  2. Tap the + button and tap Create video in the Add to Chat sheet.
  3. Look at the new-chat heading: it should change to Create a video, with duration and aspect options.
  4. Type a prompt and send; look for the video generation start (a notice may appear if the request is blocked).

## S12.14 Voice entry.

- **Expected:** From the new-chat screen the user can start a spoken (voice-mode) conversation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:1215 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:903 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:187
- **Where to find it:** New chat > empty composer > Start voice mode (round button at the right end of the composer) (labels found in the code)
- **Needs:** a microphone, microphone permission, and a plan with voice (canUseVoice)
- **Steps:**
  1. Open the new-chat screen and leave the composer text field empty.
  2. Look at the right end of the composer for the round button with the voice action.
  3. Tap it. A voice intro sheet may show first; continue through it.
  4. Look for the voice conversation screen (hands-free voice mode) and compare with Expected.

## S12.15 Agentic-work entry.

- **Expected:** From the new-chat screen the user can start agentic (multi-step, tool-using) work rather than a plain chat.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:852 (quoted code not found in the file now)
- **Where to find it:** New chat > header switch Chat or Work > Work (labels found in the code)
- **Needs:** a signed-in Cloud account (if signed out, tapping Work opens sign-in)
- **Steps:**
  1. Open the new-chat screen and look at the header switch with the words Chat and Work.
  2. Tap Work.
  3. Look for the Work state: an approval mode control appears above the composer.
  4. Send a task that needs several steps and tools, then compare with Expected (planned, multi-step work).

## S12.16 Coding entry.

- **Expected:** From the new-chat surface the user can start a coding session (a repository/workspace-aware coding agent).
- **Code:** done. Evidence moved: apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx:198; apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:163 (quoted code not found in the file now); apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:317
- **Where to find it:** Drawer > AGI Code > New session (labels found in the code)
- **Needs:** a signed-in Cloud account; a GitHub repository is needed to pick a repository
- **Steps:**
  1. Sign in and open the drawer.
  2. Tap AGI Code.
  3. Tap New session on the AGI Code screen.
  4. Look at the New session sheet: Task, Repository, Network access and Start session sections should appear, which is the coding-agent setup.

## S12.17 Temporary-chat control.

- **Expected:** Before or during a new chat the user can switch it to a temporary chat that is not kept in history.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:1255; apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:10 (quoted code not found in the file now); apps/mobile/stores/chat/chatMessageStore.ts:1969
- **Where to find it:** New chat > top-right eye-off icon (Enable temporary chat) > Turn on (labels found in the code)
- **Steps:**
  1. Open the new-chat screen and look at the top-right corner for the eye-off icon.
  2. Tap it. An alert titled Turn on temporary chat? appears.
  3. Tap Turn on. The icon now shows a Temporary label in purple.
  4. Send a message, then check that the chat does not appear in your chat history after it finishes (compare with Expected).

## S12.18 Default-model display.

- **Expected:** The new-chat screen shows which model the next message will use before the user sends.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2236; apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:28; apps/mobile/app/(app)/(tabs)/chat.tsx:1407
- **Where to find it:** New chat > composer bottom row, the model name beside the + button (labels found in the code)
- **Steps:**
  1. Open the new-chat screen.
  2. Look at the bottom row of the composer, next to the + button: the model name is shown there.
  3. Tap the model name. The model picker sheet opens.
  4. Close the picker without changing anything and compare the name shown with the model you expected.

## S12.19 Default-workspace display.

- **Expected:** The new-chat screen shows which workspace (personal or organization) the new chat will belong to.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/chat.tsx:1347
- **Where to find it:** Drawer > Cloud (mode toggle) > New chat, read the line under the greeting (labels found in the code)
- **Needs:** a signed-in Cloud account; a second account in the same organization to check an organization workspace
- **Steps:**
  1. Open the drawer and tap Cloud in the mode toggle.
  2. Tap New chat.
  3. Look just under the greeting for a line that reads Workspace: <name>, with a building icon (organization) or a person icon (personal).
  4. Compare the name with the workspace you expected.

## S12.20 Default-Project selection.

- **Expected:** Before sending, the user can pick the project a new chat will be created in.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1272; apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:89 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1426; apps/mobile/app/(app)/(tabs)/chat.tsx:1395
- **Where to find it:** New chat > + (Add to chat) > Project, then pick a project in the Projects picker (some labels not found in the code; trust the screen)
- **Needs:** at least one project already created
- **Steps:**
  1. Make sure at least one project exists (create one from the drawer if needed).
  2. On the new-chat screen, tap the + button and tap Project in the Add to Chat sheet.
  3. Choose a project in the Projects list.
  4. Look for the line In <project name> under the greeting, with an X to start outside it (compare with Expected).

## S12.22 First-use feature education.

- **Expected:** First-time users are shown a short introduction to the product's key features before or at their first chat.
- **Code:** done. Evidence moved: apps/mobile/app/index.tsx:4 (quoted code not found in the file now); apps/mobile/app/(public)/onboarding.tsx:804
- **Where to find it:** First launch after sign-up or install: the onboarding hero screen (shown when onboarding-done is not set) (path not confirmed in the code; trust the screen)
- **Needs:** a fresh install or a reset of the first-run flag
- **Steps:**
  1. Start from a fresh install, or reset the onboarding flag, and open the app past the age check.
  2. Read the hero screen: it shows the tagline Your AI workspace for everyday work. and the list of key notices.
  3. Tap the main button at the bottom of the hero screen to continue.
  4. Compare the intro with Expected: a short overview of the key features before the first chat.

## S12.23 Resumption of an unsent draft.

- **Expected:** An unsent draft typed in a new chat is restored when the user returns (after navigation or reload).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:462; apps/mobile/src/features/chat/components/ChatInput.tsx:280 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1416
- **Where to find it:** New chat > type in the Message input > switch to another screen > back to New chat (labels found in the code)
- **Steps:**
  1. Open the new-chat screen and type a few words into the Message input field, without sending.
  2. Open the drawer and go to another screen (for example Settings), then go back to New chat.
  3. Look at the composer: the typed words should be back in the field.
  4. Optionally fully close and reopen the app and compare the field again (persistence across reload is not confirmed in code).

## S12.24 Guest limitations and sign-in conversion.

- **Expected:** A signed-out visitor can use the product within stated guest limits and is prompted to sign in to lift them.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:553 (quoted code not found in the file now); apps/mobile/app/(public)/onboarding.tsx:804; apps/mobile/app/(app)/(tabs)/chat.tsx:1535; apps/mobile/app/(public)/onboarding.tsx:345 (quoted code not found in the file now)
- **Where to find it:** New chat > header switch Chat or Work > Work while signed out (opens sign-in); or Drawer > Cloud while signed out (path not confirmed in the code; trust the screen)
- **Needs:** a signed-out or Free account
- **Steps:**
  1. Sign out (or use a fresh install) and open the new-chat screen in Local mode.
  2. Look for the line Run AI privately on this device, no account needed. in the download-model banner.
  3. Tap Work in the header switch; a sign-in step opens instead of Work.
  4. Compare with Expected: local use works without an account, and Cloud use prompts sign-in.
