---
id: "PLAN-mobile-071"
type: "test-plan"
title: "Mobile · 71. Mobile application"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "71"
---
# Mobile · 71. Mobile application

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S71.01 Native navigation.

- **Expected:** The phone app navigates with native patterns: a swipeable drawer plus stack routes with back gestures.
- **Code:** done. Evidence present: apps/mobile/app/(app)/_layout.tsx:69; apps/mobile/src/features/drawer/components/DrawerContent.tsx:417
- **Where to find it:** Any main screen > swipe right from the left edge to open the drawer, then tap "New chat" or "Library" (labels found in the code)
- **Steps:**
  1. Open AGI Mobile and sign in. Swipe right from the left edge of the screen.
  2. Look: a drawer slides in from the left over the screen.
  3. Tap "Library" in the drawer.
  4. Look: the Library screen opens as a new page on top of the drawer's screen.
  5. Swipe from the left edge of the Library screen (or tap the back control at the top left).
  6. Look: you return to the previous screen, the way a stack route with a back gesture should.

## S71.02 Compact composer.

- **Expected:** The composer starts as a one-line pill that grows up to a cap and can expand to a full-screen editor, then sends.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:2107; apps/mobile/src/features/chat/components/ChatInput.tsx:2150; apps/mobile/src/features/chat/components/ChatInput.tsx:1019
- **Where to find it:** Chat screen > message box (placeholder "Type or hold to talk") > "Expand message" button at its top-right corner once the text wraps (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open a chat, or tap "New chat" in the drawer.
  2. Tap the message box and type one short line. Look: a single-line pill.
  3. Keep typing until the text wraps onto a second line. Look: the box grows taller, up to a limit, and a small expand button appears at its top-right.
  4. Tap "Expand message". Look: a full-screen editor titled by the field "Expanded message input" opens.
  5. Type a little more, then tap "Send message" (the send button). Look: the message is sent and the editor closes.

## S71.03 Keyboard-aware layout.

- **Expected:** When the keyboard opens the chat screen and composer move above it rather than being covered.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2286; apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts:18
- **Where to find it:** Chat screen > tap "Message input" (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open any chat.
  2. Tap "Message input" at the bottom of the screen. The software keyboard rises.
  3. Look: the message box and send controls sit above the keyboard, not under it.
  4. Look: the last message in the chat stays visible above the composer.
  5. Dismiss the keyboard and check that the layout returns to its normal place.

## S71.04 Touch message actions.

- **Expected:** Assistant messages show tap targets (copy, read aloud, share, regenerate, rate) that act on the message.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:3180; apps/mobile/src/features/chat/components/MessageBubble.tsx:519 (quoted code not found in the file now)
- **Where to find it:** Chat screen > below an assistant reply: the row of buttons "Copy", "Read aloud", "Regenerate response" and "More message actions" (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open a chat that has an assistant reply.
  2. Look under the reply for a small row of icon buttons.
  3. Tap the copy button. Look: it shows a check mark, and the text is on the clipboard.
  4. Tap "Read aloud". Look: the reply is spoken, and the button changes to "Stop reading aloud".
  5. Tap "Regenerate response". Look: a new answer to the same question appears.
  6. Compare with Expected: the row has copy, read aloud and regenerate; share and rate are not on this row. Rate is in the long-press menu as "Good Response" and "Bad Response".

## S71.05 Long-press menus.

- **Expected:** Long-pressing a message opens a menu of actions (edit, retry, copy, export, delete) that run.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2212; apps/mobile/src/features/chat/components/MessageBubble.tsx:1761
- **Where to find it:** Chat screen > long-press (press and hold) a message bubble > menu with "Edit Message", "Retry", "Copy Message", "Export Message", "Delete Message", "Good Response", "Bad Response" (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open a chat with one of your messages and one assistant reply.
  2. Press and hold your message for about half a second. Look: a menu of actions opens.
  3. Tap "Edit Message", change a word and submit the edit. Look: the edited message and a new answer appear.
  4. Press and hold the assistant reply, tap "Copy Message". Look: the text is copied.
  5. Press and hold the reply again, tap "Export Message". Look: the export sheet opens.
  6. Compare with Expected: each menu item should run what its name says.

## S71.06 Camera intake.

- **Expected:** The user can take a photo with the phone camera and it is attached to (or sent in) a chat.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/camera.tsx:73; apps/mobile/app/(app)/camera.tsx:121 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:814 (quoted code not found in the file now)
- **Where to find it:** Chat screen > "Add to chat" (the + beside the message box) > "Camera" > "Take photo" (path not confirmed in the code; trust the screen)
- **Needs:** a real iPhone with a camera (the Mac Simulator has no camera)
- **Steps:**
  1. Open a chat and tap "Add to chat".
  2. Tap "Camera" in the sheet. Allow camera access if the phone asks.
  3. Tap "Take photo" on the camera screen.
  4. Look: the camera screen closes and the photo appears as an attachment above the message box.
  5. Send a message and check that the photo goes with it.

## S71.07 Photo-picker intake.

- **Expected:** The user can pick up to several photos from the system photo library and they attach to the message.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:1580; apps/mobile/src/features/media/photo-picker.ts:35
- **Where to find it:** Chat screen > "Add to chat" > "Photos" (path not confirmed in the code; trust the screen)
- **Needs:** a photo library with at least two photos
- **Steps:**
  1. Open a chat and tap "Add to chat".
  2. Tap "Photos". Allow access to the photo library if asked.
  3. Select two or more photos in the system picker and confirm.
  4. Look: each selected photo appears as an attachment above the message box, in the order picked.
  5. Send the message and check the photos are attached.

## S71.08 File-provider intake.

- **Expected:** The user can attach a file from the OS document picker (Files app / storage providers) to a chat.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:1606; apps/mobile/src/features/chat/components/ChatInput.tsx:1019
- **Where to find it:** Chat screen > "Add to chat" > "File" (path not confirmed in the code; trust the screen)
- **Needs:** a file to upload, for example a PDF in Files
- **Steps:**
  1. Open a chat and tap "Add to chat".
  2. Tap "File". The system document picker opens.
  3. Choose one or more files (for example a PDF) and confirm.
  4. Look: each file appears as an attachment chip above the message box.
  5. Send the message and check the file is attached.

## S71.09 Share-sheet intake.

- **Expected:** Sharing text, links, images or PDFs to the app from another app opens a preview that starts a chat or stages the files.
- **Code:** done. Evidence moved: apps/mobile/app.config.js:320; apps/mobile/app/_layout.tsx:829; apps/mobile/app/_layout.tsx:276; apps/mobile/src/features/share-preview/index.tsx:93 (quoted code not found in the file now)
- **Where to find it:** Another app (for example Safari) > Share > the AGI app in the share sheet > the preview screen with "Send to Chat" or "Add to chat" (path not confirmed in the code; trust the screen)
- **Needs:** a phone with the app installed; a web page, an image or a PDF to share
- **Steps:**
  1. On a phone with the app installed, open Safari and go to any web page.
  2. Tap Share, then choose the AGI app from the share sheet.
  3. Look: the share preview screen opens with the shared content shown.
  4. For a link, check for "Summarize this page" and "Ask about this page".
  5. Tap "Send to Chat" (or "Add to chat" if files are staged). Look: a chat starts or the files are attached.

## S71.10 Voice conversation.

- **Expected:** The user can hold a full-duplex spoken conversation with the assistant inside a chat.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:2826; apps/mobile/src/features/voice/services/liveVoiceSession.ts:187 (quoted code not found in the file now)
- **Where to find it:** Chat screen > "Start voice mode" (round button at the right of the composer) (path not confirmed in the code; trust the screen)
- **Needs:** a microphone, and a phone that supports live voice
- **Steps:**
  1. Open a chat and tap "Start voice mode". Allow microphone access if asked.
  2. Look: the voice bar replaces the composer.
  3. Say a question and pause. Look: the assistant answers out loud.
  4. Ask a follow-up in the same voice session and check it continues without tapping.
  5. Tap "Exit voice mode" to stop. Look: the normal composer returns.

## S71.12 Push notifications.

- **Expected:** The app registers for push, the server stores the token and sends pushes for agent, research and schedule events.
- **Code:** done. Evidence moved: apps/mobile/services/notifications.ts:257; apps/mobile/app/_layout.tsx:370 (quoted code not found in the file now)
- **Where to find it:** Settings > Device > Notifications (path not confirmed in the code; trust the screen)
- **Needs:** a real iPhone; an AGI Cloud account; a running agent task for the push test
- **Steps:**
  1. Tap Settings, then find the "Device" section and tap "Notifications".
  2. Read the status card at the top: "Turn on notifications", "Your device is delivering notifications" or "Your device is blocking notifications".
  3. If the card says "Turn on notifications", tap it or the allow control and accept the iOS prompt.
  4. Look: the card changes to "Your device is delivering notifications" and the list below shows which alerts AGI sends.
  5. The server-side token storage and the pushes themselves cannot be seen on the phone; check that alerts arrive when an agent task finishes.

## S71.13 Notification deep links.

- **Expected:** Tapping a notification opens the screen it is about (task, approval, schedule, chat).
- **Code:** done. Evidence present: apps/mobile/services/notifications.ts:572; apps/mobile/services/notifications.ts:436
- **Where to find it:** Notification banner on the phone, or the bell button ("Open notifications") > tap a row in the Notifications list (path not confirmed in the code; trust the screen)
- **Needs:** an AGI Cloud account; a notification that links to a task, approval, schedule or chat
- **Steps:**
  1. Trigger a notification, for example by finishing an agent task or a schedule.
  2. Tap the banner on the phone. Or tap the bell button ("Open notifications, N unread") at the top of the drawer header.
  3. Tap the row in the Notifications list.
  4. Look: the screen opens that the notification is about (task, approval, schedule or chat).
  5. Compare with Expected: the right screen opens, not the home screen.

## S71.14 Quick reply to agent questions.

- **Expected:** When an agent asks the user a question, the user can answer it from the phone (notification reply or quick answer field).
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:460
- **Where to find it:** AGI Work > tap a task that is waiting for an answer > fill the question form > "Send answer" (path not confirmed in the code; trust the screen)
- **Needs:** a Cloud task that is waiting for an answer
- **Steps:**
  1. Open the drawer (swipe right from the left edge) and tap "AGI Work".
  2. Tap a Cloud task that shows a question from the agent.
  3. Fill in the answer form that appears under the task details.
  4. Tap "Send answer".
  5. Look: the question disappears and the task status moves on from waiting for input.

## S71.15 Remote action approval.

- **Expected:** The user can approve or deny a pending agent action from the phone and the run resumes accordingly.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:428; apps/mobile/src/features/tasks/service.ts:70; apps/mobile/src/features/companion/components/CodeSessionView.tsx:399
- **Where to find it:** AGI Work > tap a task that is waiting for approval > "Approve" or "Deny" (some labels not found in the code; trust the screen)
- **Needs:** a Cloud task that is waiting for an approval
- **Steps:**
  1. Open the drawer and tap "AGI Work".
  2. Tap a Cloud task that shows a pending action needing approval.
  3. Read the tool call listed in the task.
  4. Tap "Approve" (or "Deny").
  5. Look: the pending approval disappears and the task resumes (or stops, after deny).

## S71.16 Remote coding review.

- **Expected:** The user can follow a coding session running elsewhere and review its changed files and diffs, then steer or approve.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionView.tsx:311 (quoted code not found in the file now); apps/mobile/src/features/companion/remote-code/service.ts:90
- **Where to find it:** not found in the code. The remote code session screens are gated by FEATURES.companion = false (apps/mobile/lib/v1FeatureFlags.ts line 16) and show a "Remote" unavailable message (app/(app)/companion/code/[threadId].tsx). The Remote control settings row is also hidden. I searched the app folder for the remote code session screens and Remote control entry points.
- **Needs:** a paid account and a paired computer (the Remote feature is off in v1)

## S71.17 Cloud-task initiation.

- **Expected:** The user can start a cloud agent task from the phone and follow it in the task list.
- **Code:** done. Evidence moved: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:574; apps/mobile/src/features/tasks/startWork.ts:65; apps/mobile/stores/chat/chatExecutionStore.ts:1707 (quoted code not found in the file now)
- **Where to find it:** AGI Work > "New task" (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the drawer and tap "AGI Work".
  2. Tap "New task".
  3. Type what the task should do and start it.
  4. Look: the new task appears at the top of the AGI Work task list with a status.
  5. Tap it to open the task and check its activity.

## S71.19 Conversation restoration after process death.

- **Expected:** After the OS kills the app, relaunching returns the user to their conversation with messages, draft and any in-flight reply.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2206
- **Where to find it:** no screen of its own. The Code line points at a line in MessageBubble.tsx that is now an animation setting; the draft store is src/features/chat/draftStore.ts and in-flight recovery is src/features/chat/inFlightTurnRecovery.ts.
- **Needs:** a signed-in account with a chat that has messages
- **Steps:**
  1. Open a chat, type a draft in the message box, but do not send it.
  2. Force-quit AGI Mobile (on the Simulator: Cmd+Shift+H twice, then swipe the app card up).
  3. Open the app again from the home screen.
  4. Look: the same chat opens with the draft still in the message box and the earlier messages still shown.
  5. If a reply was in progress, check that it resumes or shows as finished, as Expected says.

## S71.25 Tablet layout.

- **Expected:** On tablets the app uses a wider layout (persistent drawer, multi-column grids) and adapts to split view.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageList.tsx:137 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ChatInput.tsx:1678; apps/mobile/src/shared/hooks/useTabletLayout.ts:50; apps/mobile/app/(app)/_layout.tsx:44
- **Where to find it:** no screen of its own. The layout switches at 768 px (TABLET_MIN_WIDTH) and 1024 px (REGULAR_MIN_WIDTH) in src/shared/hooks/useTabletLayout.ts.
- **Needs:** an iPad or iPad Simulator
- **Steps:**
  1. Open the app on an iPad (the app is set to support tablets in app.config.js).
  2. Look: the drawer stays on the left side as a fixed panel, not a slide-out.
  3. Look: the chat area is wider and the message grid is laid out in more columns.
  4. Turn the iPad or change split view width and check the layout adapts.
  5. Compare with Expected: persistent drawer and wider layout on tablets.

## S71.27 Landscape adaptation.

- **Expected:** Rotating the phone to landscape re-lays out the chat usefully.
- **Code:** done. Evidence moved: apps/mobile/app.config.js:91 (quoted code not found in the file now); apps/mobile/app.config.js:164
- **Where to find it:** no screen of its own. Phones are locked to portrait (app/_layout.tsx calls lockPhonePortrait; app.config.js sets orientation portrait). Landscape is only used while a video player or presentation viewer is open. The iPad behaviour was not checked.
- **Needs:** a phone or Simulator that can rotate
- **Steps:**
  1. Open a chat on a phone.
  2. Turn the phone sideways (on the Simulator, use Cmd+Left or Cmd+Right).
  3. Look: the chat stays in portrait layout.
  4. Compare with Expected: Expected says landscape re-lays out the chat usefully, but the code locks phones to portrait.

## S71.28 Offline data management.

- **Expected:** The user can see how much data is stored on the device and delete models, cache or all local data.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/storage.tsx:298; apps/mobile/app/(app)/settings/storage.tsx:528; apps/mobile/app/(app)/settings/storage.tsx:112 (quoted code not found in the file now)
- **Where to find it:** Settings > Device > Storage (path not confirmed in the code; trust the screen)
- **Needs:** a downloaded model (for the model delete step, see S71.30); a test account for the delete-all step
- **Steps:**
  1. Tap Settings, go to the "Device" section, tap "Storage".
  2. Look at "Downloaded models (estimated)", "Cache" and "Free space" figures.
  3. Tap "Clear cache" and confirm. Look: the cache figure drops and conversations and models stay.
  4. If a downloaded model is listed, tap "Delete <model name>" and confirm. Look: the model is removed from the list.
  5. Tap "Delete all local data" only on a test account, since it wipes conversations, memory and models from this device.

## S71.30 Local inference where intentionally implemented.

- **Expected:** In Local mode the user can download a model and chat with it on the device without the cloud.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:793 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:3098; apps/mobile/src/features/model-picker/installStore.ts:344 (quoted code not found in the file now)
- **Where to find it:** Chat screen > "Model:" button beside the + in the composer (opens the model picker) > "On device" group > download a model (path not confirmed in the code; trust the screen)
- **Needs:** Wi-Fi for the download; enough free storage; a phone (Simulator may not run on-device models)
- **Steps:**
  1. Open a new chat. Tap the model button beside the + (it reads "Model:" followed by the model name).
  2. In the model picker, find the "On device" group and tap a model to download it.
  3. Tap "Download" in the confirmation. Look: the download starts and the storage size is shown.
  4. When the download finishes, pick that model, type a message and send it.
  5. Look: a reply comes from the model on the device. Turn Wi-Fi and cellular off on the phone to check it needs no cloud.

## S71.31 App-store purchase and restoration.

- **Expected:** The user can buy a plan or credits through the App Store / Google Play and restore purchases.
- **Code:** partial. Evidence present: apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:54
- **Known to be unfinished:** switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built
- **Where to find it:** Settings > Account > Subscription > "Restore purchases" (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in AGI Cloud account; an App Store or Google Play test account for a real restore
- **Steps:**
  1. Tap Settings, go to the "Account" section, tap "Subscription".
  2. Look: if the store is not live you will see "Purchases are not available right now".
  3. Tap "Restore purchases". Look: a message appears such as "No purchases to restore" or "Restore purchases needs the store".
  4. Compare with Expected: buying a plan or credits is not switched on in v1, so the buy path cannot be tested yet.

## S71.32 Mobile-specific privacy controls.

- **Expected:** Mobile-only privacy controls exist: biometric app lock, privacy cover on app switch, and OS permission management.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/safety-security/index.tsx:104; apps/mobile/src/features/settings/safety-security/index.tsx:44; apps/mobile/app/_layout.tsx:985
- **Where to find it:** Settings > Device > Safety & Security > "App Lock" and "Permissions" (path not confirmed in the code; trust the screen)
- **Needs:** a device with Face ID or Touch ID set up (not checked on the Simulator)
- **Steps:**
  1. Tap Settings, go to the "Device" section, tap "Safety & Security".
  2. Under "Device boundary", turn on the "App Lock" switch and follow the device prompt.
  3. Close the app and open it again. Look: an app lock screen asks you to unlock before the chat shows.
  4. Tap "Permissions" and look at the list of phone permissions (camera, microphone, photos, notifications).
  5. Compare with Expected: App Lock and OS permission management are present; no privacy cover on app switch was found in the code.
