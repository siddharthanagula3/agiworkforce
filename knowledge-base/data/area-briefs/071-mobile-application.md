# Area 71. Mobile application

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S71.01 Native navigation.
- Should: The phone app navigates with native patterns: a swipeable drawer plus stack routes with back gestures.
- Status: mobile done
- Code: apps/mobile/app/(app)/_layout.tsx:13; apps/mobile/src/features/drawer/components/DrawerContent.tsx:285

## S71.02 Compact composer.
- Should: The composer starts as a one-line pill that grows up to a cap and can expand to a full-screen editor, then sends.
- Status: mobile done
- Code: apps/mobile/src/features/chat/components/ChatInput.tsx:1045; apps/mobile/src/features/chat/components/ChatInput.tsx:953; apps/mobile/src/features/chat/components/ChatInput.tsx:336

## S71.03 Keyboard-aware layout.
- Should: When the keyboard opens the chat screen and composer move above it rather than being covered.
- Status: mobile done
- Code: apps/mobile/app/(app)/chat/[id].tsx:1282; apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts:17

## S71.04 Touch message actions.
- Should: Assistant messages show tap targets (copy, read aloud, share, regenerate, rate) that act on the message.
- Status: mobile done
- Code: apps/mobile/src/features/chat/components/MessageBubble.tsx:1144; apps/mobile/src/features/chat/components/MessageBubble.tsx:519

## S71.05 Long-press menus.
- Should: Long-pressing a message opens a menu of actions (edit, retry, copy, export, delete) that run.
- Status: mobile done
- Code: apps/mobile/src/features/chat/components/MessageBubble.tsx:672; apps/mobile/src/features/chat/components/MessageBubble.tsx:555

## S71.06 Camera intake.
- Should: The user can take a photo with the phone camera and it is attached to (or sent in) a chat.
- Status: mobile done
- Code: apps/mobile/app/(app)/camera.tsx:74; apps/mobile/app/(app)/camera.tsx:121; apps/mobile/app/(app)/chat/[id].tsx:814

## S71.07 Photo-picker intake.
- Should: The user can pick up to several photos from the system photo library and they attach to the message.
- Status: mobile done
- Code: apps/mobile/app/(app)/chat/[id].tsx:828; apps/mobile/src/features/media/photo-picker.ts:16

## S71.08 File-provider intake.
- Should: The user can attach a file from the OS document picker (Files app / storage providers) to a chat.
- Status: mobile done
- Code: apps/mobile/app/(app)/chat/[id].tsx:849; apps/mobile/src/features/chat/components/ChatInput.tsx:336

## S71.09 Share-sheet intake.
- Should: Sharing text, links, images or PDFs to the app from another app opens a preview that starts a chat or stages the files.
- Status: mobile done
- Code: apps/mobile/app.config.js:166; apps/mobile/app/_layout.tsx:493; apps/mobile/app/_layout.tsx:583; apps/mobile/src/features/share-preview/index.tsx:93

## S71.10 Voice conversation.
- Should: The user can hold a full-duplex spoken conversation with the assistant inside a chat.
- Status: mobile done
- Code: apps/mobile/app/(app)/chat/[id].tsx:1587; apps/mobile/src/features/voice/services/liveVoiceSession.ts:187

## S71.11 Audio-route controls.
- Should: During voice the user can choose the audio output route (speaker, Bluetooth, headset) and the session switches.
- Status: not applicable anywhere

## S71.12 Push notifications.
- Should: The app registers for push, the server stores the token and sends pushes for agent, research and schedule events.
- Status: mobile done
- Code: apps/mobile/services/notifications.ts:141; apps/mobile/app/_layout.tsx:370

## S71.13 Notification deep links.
- Should: Tapping a notification opens the screen it is about (task, approval, schedule, chat).
- Status: mobile done
- Code: apps/mobile/services/notifications.ts:318; apps/mobile/services/notifications.ts:290

## S71.14 Quick reply to agent questions.
- Should: When an agent asks the user a question, the user can answer it from the phone (notification reply or quick answer field).
- Status: mobile done
- Code: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:275

## S71.15 Remote action approval.
- Should: The user can approve or deny a pending agent action from the phone and the run resumes accordingly.
- Status: mobile done
- Code: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:217; apps/mobile/src/features/tasks/service.ts:45; apps/mobile/src/features/companion/components/CodeSessionView.tsx:137

## S71.16 Remote coding review.
- Should: The user can follow a coding session running elsewhere and review its changed files and diffs, then steer or approve.
- Status: mobile done
- Code: apps/mobile/src/features/companion/components/CodeSessionView.tsx:311; apps/mobile/src/features/companion/remote-code/service.ts:60

## S71.17 Cloud-task initiation.
- Should: The user can start a cloud agent task from the phone and follow it in the task list.
- Status: mobile done
- Code: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:384; apps/mobile/src/features/tasks/startWork.ts:38; apps/mobile/stores/chat/chatExecutionStore.ts:1707

## S71.18 Background upload recovery.
- Should: An attachment upload interrupted by backgrounding continues or resumes automatically when the app returns.
- Status: not applicable anywhere

## S71.19 Conversation restoration after process death.
- Should: After the OS kills the app, relaunching returns the user to their conversation with messages, draft and any in-flight reply.
- Status: mobile done
- Code: apps/mobile/src/features/chat/components/MessageBubble.tsx:1110

## S71.20 Home-screen widgets.
- Should: The user can add an AGI widget to the phone home screen that opens or starts a chat.
- Status: mobile missing

## S71.21 Lock-screen widgets where supported.
- Should: Where the OS supports it, the user can place an AGI widget on the lock screen.
- Status: mobile missing

## S71.22 Live activity where supported.
- Should: Where supported, a running agent task or voice session shows as a Live Activity / ongoing notification with progress.
- Status: mobile missing

## S71.23 System shortcuts/App Intents.
- Should: OS-level shortcuts (Siri/App Intents, Spotlight, launcher shortcuts) can start AGI actions such as ask or summarize.
- Status: not applicable anywhere

## S71.24 Default-assistant integration where supported.
- Should: On Android the user can set AGI as the default digital assistant so the assist gesture opens it.
- Status: mobile missing

## S71.25 Tablet layout.
- Should: On tablets the app uses a wider layout (persistent drawer, multi-column grids) and adapts to split view.
- Status: mobile done
- Code: apps/mobile/src/features/chat/components/MessageList.tsx:137; apps/mobile/src/features/chat/components/ChatInput.tsx:802; apps/mobile/src/shared/hooks/useTabletLayout.ts:50; apps/mobile/app/(app)/_layout.tsx:17

## S71.26 Foldable adaptation.
- Should: On foldables the layout adapts when the device folds or unfolds (and ideally around the hinge).
- Status: not applicable anywhere

## S71.27 Landscape adaptation.
- Should: Rotating the phone to landscape re-lays out the chat usefully.
- Status: mobile done
- Code: apps/mobile/app.config.js:91; apps/mobile/app.config.js:73

## S71.28 Offline data management.
- Should: The user can see how much data is stored on the device and delete models, cache or all local data.
- Status: mobile done
- Code: apps/mobile/app/(app)/settings/storage.tsx:136; apps/mobile/app/(app)/settings/storage.tsx:438; apps/mobile/app/(app)/settings/storage.tsx:112

## S71.29 Cellular-data preferences.
- Should: The user can choose whether large transfers use cellular data, and the app obeys it.
- Status: not applicable anywhere

## S71.30 Local inference where intentionally implemented.
- Should: In Local mode the user can download a model and chat with it on the device without the cloud.
- Status: mobile done
- Code: apps/mobile/app/(app)/(tabs)/chat.tsx:793; apps/mobile/stores/chat/chatExecutionStore.ts:1561; apps/mobile/src/features/model-picker/installStore.ts:344

## S71.31 App-store purchase and restoration.
- Should: The user can buy a plan or credits through the App Store / Google Play and restore purchases.
- Status: mobile partial
- Code: apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:26
- Unfinished: mobile: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## S71.32 Mobile-specific privacy controls.
- Should: Mobile-only privacy controls exist: biometric app lock, privacy cover on app switch, and OS permission management.
- Status: mobile done
- Code: apps/mobile/src/features/settings/safety-security/index.tsx:99; apps/mobile/src/features/settings/safety-security/index.tsx:28; apps/mobile/app/_layout.tsx:726
