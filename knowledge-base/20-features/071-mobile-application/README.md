---
id: "AREA-071"
type: "area"
title: "Mobile application"
features: ["F071-01", "F071-02", "F071-03", "F071-04", "F071-05", "F071-06", "F071-07", "F071-08", "F071-09", "F071-10", "F071-11", "F071-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 71. Mobile application

This area is the phone version of AGI. A person chats with a model, attaches photos, files and shared content, speaks to the assistant, and gets alerts when a cloud task needs them. Local mode runs a downloaded model on the phone with no cloud. The area also covers the phone's own features: home screen widgets, Siri and Spotlight actions, app lock and storage controls. It matters because the phone is where many people use AGI most, and these features are what a phone user expects from a chat app.

**Who uses it.** Every person who opens the phone app. Local mode features (chat on the device, model downloads, storage) work without a cloud account as far as the code shows. Cloud features (cloud tasks, live voice, push alerts, sync) need a signed-in account that has accepted the terms and passed the adult-age check (apps/mobile/app/_layout.tsx:527-534, 745-748). Some plan limits change what a paid or free plan may attach (apps/mobile/src/features/chat/utils/photoSelectionLimit.ts:3-5). Purchases are not live in this build, so no one can buy a plan in the phone app yet (apps/mobile/lib/v1FeatureFlags.ts:6). Developers and the owner switch parts on and off through the feature flag file and build settings.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F071-01](F071-01-moving-around-and-screen-layout.md) | Moving around and screen layout | n/a | n/a | built | n/a | n/a | n/a |
| [F071-02](F071-02-writing-a-message-in-the-composer.md) | Writing a message in the composer | n/a | n/a | built | n/a | n/a | n/a |
| [F071-03](F071-03-message-actions-tap-buttons-and-long-press-menu.md) | Message actions (tap buttons and long-press menu) | n/a | n/a | built | n/a | n/a | n/a |
| [F071-04](F071-04-attaching-photos-camera-files-and-shared-content.md) | Attaching photos, camera, files and shared content | n/a | n/a | built | n/a | n/a | n/a |
| [F071-05](F071-05-voice-conversation.md) | Voice conversation | n/a | n/a | built | n/a | n/a | n/a |
| [F071-06](F071-06-push-notifications.md) | Push notifications | n/a | n/a | built | n/a | n/a | n/a |
| [F071-07](F071-07-cloud-tasks-agent-answers-and-approvals.md) | Cloud tasks, agent answers and approvals | n/a | n/a | built | n/a | n/a | n/a |
| [F071-08](F071-08-home-screen-lock-screen-and-os-shortcuts.md) | Home screen, lock screen and OS shortcuts | n/a | n/a | partly | n/a | n/a | n/a |
| [F071-09](F071-09-local-models-and-device-storage.md) | Local models and device storage | n/a | n/a | built | n/a | n/a | n/a |
| [F071-10](F071-10-keeping-your-place-after-the-app-closes.md) | Keeping your place after the app closes | n/a | n/a | built | n/a | n/a | n/a |
| [F071-11](F071-11-buying-plans-and-credits-in-the-store.md) | Buying plans and credits in the store | n/a | n/a | partly | n/a | n/a | n/a |
| [F071-12](F071-12-app-lock-and-privacy-controls.md) | App lock and privacy controls | n/a | n/a | built | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/071-mobile-application.md](../../10-requirements/capabilities/071-mobile-application.md).

## How this area works in the code

1. **Start and gate the app.** The root layout starts the encrypted local storage, waits for sign-in state and the terms and age answers, and puts the App Lock overlay over the app. Cloud features wait for the answers. (`apps/mobile/app/_layout.tsx:508-513 (storage status and launch)`, `apps/mobile/app/_layout.tsx:523-534 (age and terms state)`, `apps/mobile/app/_layout.tsx:563 (biometric gate)`, `apps/mobile/app/_layout.tsx:1020-1026 (lock overlay)`)
2. **Move around the app.** A drawer wraps the screens. Some screens hide the drawer or switch off its edge swipe. Tablets get a fixed side panel by width. (`apps/mobile/app/(app)/_layout.tsx:42-73 (drawer and options)`, `apps/mobile/app/(app)/_layout.tsx:20-28 (settings, camera and voice rules)`, `apps/mobile/src/shared/hooks/useTabletLayout.ts:29-52 (width and split view rules)`)
3. **Compose and send.** The composer tracks the text height, offers the full-screen editor, and calls the send handler. While a reply streams, a send is queued. (`apps/mobile/src/features/chat/components/ChatInput.tsx:1520-1533 (multi-line state)`, `apps/mobile/src/features/chat/components/ChatInput.tsx:1000-1022 (send call)`, `apps/mobile/src/features/chat/components/ChatInput.tsx:945-960 (queue while streaming)`)
4. **Attach files and photos.** The attach sheet calls the camera, library or file picker. Photos lose their metadata. Limits by plan and mode are applied. (`apps/mobile/app/(app)/chat/[id].tsx:1544-1556 (camera)`, `apps/mobile/app/(app)/chat/[id].tsx:1580-1599 (photos with plan limit)`, `apps/mobile/app/(app)/chat/[id].tsx:1606-1618 (files)`, `apps/mobile/src/features/media/photo-picker.ts:26-54 (metadata removed)`, `apps/mobile/src/features/chat/utils/attachmentValidation.ts:34-47 (limits)`)
5. **Choose local or cloud for the send.** The send reads the conversation's mode. A local chat needs a local model. A cloud chat needs a signed-in account and a cloud model. A mismatch shows a message and stops. (`apps/mobile/stores/chat/chatExecutionStore.ts:2258-2278 (mode and model checks)`, `apps/mobile/stores/chat/chatExecutionStore.ts:2287-2299 (cloud sign-in check)`)
6. **Run a local model on the device.** Local models are downloaded and kept in the app's document folder. Downloads follow the Wi-Fi-first rule and the cellular switch. The runtime resolves the chosen local model before it answers. (`apps/mobile/src/features/model-picker/installStore.ts:371-383 (store, cellular default)`, `apps/mobile/src/features/model-picker/installStore.ts:495-533 (download job)`, `apps/mobile/src/features/model-picker/localModelRuntime.ts:88-90 (resolve model)`, `apps/mobile/services/modelStoragePaths.ts:3-5 (folders)`)
7. **Start a live voice session.** The chat checks the mode, sign-in and device speech. In cloud mode it opens a live session with a server route that issues the session. Local mode gets the turn-based voice bar. (`apps/mobile/app/(app)/chat/[id].tsx:1698-1712 (voice start)`, `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:21-28 (availability)`, `apps/mobile/src/features/voice/services/liveVoiceSession.ts:263-343 (start and session request)`, `apps/mobile/src/features/voice/services/liveVoiceAuthority.ts:14 (session route path)`)
8. **Register the phone for push.** After the person taps Turn on, the app asks the OS for permission, gets an Expo push token, and sends it with its device id to the server. The server saves it in the device table. (`apps/mobile/services/notifications.ts:204-221 (permission and register)`, `apps/mobile/services/notifications.ts:237-285 (token and send)`, `apps/mobile/services/pushPreferenceSync.ts:29 (route path)`, `apps/web/app/api/mobile/push-token/route.ts:22-80 (server save)`)
9. **Send and show a push.** Server services decide when to send. A push goes to the Expo push service, which delivers it to the phone. The phone shows it with a priority-based sound. (`apps/web/lib/services/push-notification-service.ts:25 (Expo send endpoint)`, `apps/web/lib/services/push-notification-service.ts:149-160 (send to one user)`, `apps/web/lib/services/push-notification-service.ts:281 (public send)`, `apps/mobile/services/notifications.ts:101-156 (show rules by priority)`)
10. **Open the right screen on tap.** A tapped alert is mapped to a route from an allow list. Routes whose feature is off are dropped. Approvals open the companion screen only when that feature is on. (`apps/mobile/services/notifications.ts:339-351 (allow list)`, `apps/mobile/services/notifications.ts:414-464 (approval and task routes)`, `apps/mobile/services/notifications.ts:829-830 (tap listener)`)
11. **Keep the chat across restarts.** Messages and drafts are written to encrypted storage. On reload, a streaming reply is marked stopped and the server is asked for the final answer. (`apps/mobile/stores/chat/chatMessageStore.ts:1729-1745 (persisted store and reload rule)`, `apps/mobile/src/features/chat/draftStore.ts:180-200 (drafts)`, `apps/mobile/lib/mmkv.ts:173-194 (encryption key in secure storage)`, `apps/mobile/src/features/chat/inFlightTurnRecovery.ts:17-22 (server recheck)`)

## Files to know

| File | Role |
|---|---|
| `apps/mobile/app/_layout.tsx` | Root layout: storage start, sign-in and terms gates, App Lock overlay, share and widget link intake, push and deep link handling. |
| `apps/mobile/app/(app)/_layout.tsx` | Drawer and the list of screens, with the rules for which screens hide the drawer or switch off its swipe. |
| `apps/mobile/src/features/chat/components/ChatInput.tsx` | The composer: one-line growth, full-screen editor, send, queue while streaming, draft hand-off. |
| `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Message actions: tap row, long-press menu, delete confirmation, double-tap rating. |
| `apps/mobile/app/(app)/chat/[id].tsx` | The chat screen: attach sheet (camera, photos, files, paste), voice entry, keyboard layout. |
| `apps/mobile/stores/chat/chatExecutionStore.ts` | Send path that picks local or cloud by the chat's mode and checks the model and sign-in. |
| `apps/mobile/services/notifications.ts` | Push permission, token registration, how alerts show, and where a tapped alert opens. |
| `apps/web/app/api/mobile/push-token/route.ts` | Server route that saves a phone's push token and preferences, and refuses a device id held by another account. |
| `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | The cloud live voice session: connection, timeouts, tool calls, errors. |
| `apps/mobile/src/features/model-picker/installStore.ts` | Local model status and downloads, with the Wi-Fi default and cellular switch. |
| `apps/mobile/src/features/auth/hooks/useBiometricGate.ts` | App Lock state: prompts on return, covers the app while away, fails closed. |
| `apps/mobile/lib/v1FeatureFlags.ts` | The switches for this build (billing, companion, dispatch, cloud tasks and others). |
| `apps/mobile/app.config.js` | Build settings: orientation, permissions, plugins, widget and intent wiring, production checks. |

## What is stored

- Local chat messages (encrypted): Device encrypted key-value store (MMKV), store name chat-message-store-local: apps/mobile/stores/chat/chatMessageStore.ts:1729-1730
- Cloud chat messages cached on the phone (encrypted): Device encrypted store, name chat-message-store-cloud: apps/mobile/stores/chat/chatCloudMessageStore.ts:313-314
- Drafts, with text and attachment references: Device encrypted store, keys starting with composer-draft: apps/mobile/src/features/chat/draftStore.ts:5, 186
- Key that opens the encrypted store: Device secure storage (SecureStore) under the MMKV key id: apps/mobile/lib/mmkv.ts:173-194
- App Lock on or off, and whether it was offered: Device secure storage, keys agi_biometric_lock_enabled_v1 and agi_biometric_lock_prompted_v1: apps/mobile/lib/biometricFlagStore.ts:4-5, 33
- Downloaded local model files: App documents folder under models/ and react-native-executorch/: apps/mobile/services/modelStoragePaths.ts:3-5
- Picked files copied for sending: App cache folder (copyToCacheDirectory): apps/mobile/app/(app)/chat/[id].tsx:1608; removed by Clear cache at apps/mobile/app/(app)/settings/storage.tsx:297-299
- Push token, device name, platform and push preferences: Server database table public.mobile_devices: apps/web/app/api/mobile/push-token/route.ts:43-65
- Share extension data shared with the app: iOS app group named group.com.agiworkforce.app.share: apps/mobile/app.config.js:6
- SQLite database with encryption: Configured by the expo-sqlite plugin with SQLCipher: apps/mobile/app.config.js:454. What writes to it was not established.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **FEATURES.billing (false)**: Turns off purchases and the billing portal in this build. (Set in apps/mobile/lib/v1FeatureFlags.ts:6. Read by apps/mobile/src/features/billing/service.ts:9 and apps/mobile/src/features/settings/cloud-billing/index.tsx:199.)
- **FEATURES.dispatch (false)**: Turns off background tasks and the remote pairing features. (apps/mobile/lib/v1FeatureFlags.ts:12. Read by apps/mobile/app.config.js:31-32, apps/mobile/app/_layout.tsx:713 and 812, apps/mobile/services/companion.ts:133-134, apps/mobile/stores/connectionStore.ts:267.)
- **FEATURES.companion (false)**: Turns off the remote coding and agent detail screens. Approval alerts open the notifications list instead. (apps/mobile/lib/v1FeatureFlags.ts:16. Read by apps/mobile/services/notifications.ts:340, 414-418, apps/mobile/app/(app)/companion/index.tsx:108-121, apps/mobile/src/features/tasks/CloudTasksScreen.tsx:69.)
- **FEATURES.cloudTasks (true)**: Shows the Tasks screen. When off, it shows a feature unavailable message. (apps/mobile/lib/v1FeatureFlags.ts:10. Read by apps/mobile/src/features/tasks/CloudTasksScreen.tsx:423, 655.)
- **FEATURES.schedules (true)**: Allows schedule routes for tapped alerts. (apps/mobile/lib/v1FeatureFlags.ts:14. Read by apps/mobile/services/notifications.ts:344.)
- **APP_ENV, EXPO_PUBLIC_API_URL, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY**: Production and preview builds fail unless the sign-in key is live and the API address is https. (apps/mobile/app.config.js:2-4, 48-62.)
- **EXPO_ENABLE_PRODUCTION_IOS_ENTITLEMENTS and EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS**: Turn the app-link domains and push and sign-in entitlements on or off. (apps/mobile/app.config.js:128-134.)
- **EXPO_ENABLE_DETOX**: Adds the end-to-end test harness plugin to the build. (apps/mobile/app.config.js:491.)
- **EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC**: Development only: skips App Lock for visual checks. (apps/mobile/src/features/auth/hooks/useBiometricGate.ts:22-23.)
- **App Lock switch**: Turns the device-lock prompt on or off. Turning it on needs a device lock. (Switch in apps/mobile/src/features/settings/safety-security/index.tsx:103-110. Stored in SecureStore (apps/mobile/lib/biometricFlagStore.ts:4).)
- **Reduce sensitive content switch**: Stricter content filter in Local and Cloud chats. Forced on in minor mode. (apps/mobile/src/features/settings/safety-security/index.tsx:27-34, 82-94.)
- **Download over cellular switch**: Lets model downloads use mobile data. Off by default. (apps/mobile/app/(public)/onboarding.tsx:746-756 (switch); apps/mobile/src/features/model-picker/installStore.ts:379, 382-383, 521.)
- **Plan limit on attachments and photos per message**: Caps how many files or photos one message can hold, by plan. (apps/mobile/src/features/chat/utils/photoSelectionLimit.ts:3-5; apps/mobile/src/features/chat/utils/attachmentValidation.ts:34-47.)
- **Composer line limit (6 lines, 160 points high)**: Sets when the composer stops growing and starts scrolling. (apps/mobile/lib/constants.ts:25; apps/mobile/src/features/chat/components/ChatInput.tsx:2107, 2120-2126.)
- **Shared text limit (100 KB)**: Cuts shared text and shows a notice. (apps/mobile/src/features/share-preview/index.tsx:43.)
- **Tablet breakpoints (768 and 1024 points)**: Choose the tablet and wide layouts and the split-view check. (apps/mobile/src/shared/hooks/useTabletLayout.ts:5-6.)
- **Phone orientation**: Keeps iPhone in portrait. Android phones with a narrow screen are held in portrait. (apps/mobile/app.config.js:158, 181-186; apps/mobile/native/android/withAGITabletOrientation.cjs:18-30.)
- **MOBILE_IAP_ENABLED (server)**: Turns on the server product catalog for store purchases. Off by default. (apps/web/lib/server/mobile-iap-catalog.ts:53-56. Product id maps come from MOBILE_IAP_APPLE_PRODUCT_IDS_JSON and MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON (lines 42-45).)

## Shared between apps

Mobile logic lives in apps/mobile (features under apps/mobile/src/features, stores under apps/mobile/stores, services under apps/mobile/services). It is separate from the web and desktop apps. Shared packages used by this code: @agiworkforce/cloud-contracts (push route path, push account binding, used in apps/mobile/services/notifications.ts and pushPreferenceSync.ts); @agiworkforce/types (plan attachment limit in apps/mobile/src/features/chat/utils/photoSelectionLimit.ts, and the store product definitions used by apps/web/lib/server/mobile-iap-catalog.ts); @agiworkforce/utils/voice (apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:4). Server code for mobile push is in apps/web/app/api/mobile/push-token and apps/web/lib/services/push-notification-service.ts. That service is also used by web push (apps/web/lib/services/web-push-service.ts:21), so it is shared between mobile and web. Native code is separate per platform: apps/mobile/native/ios and apps/mobile/native/android. Not checked: whether the chat UI is shared with other surfaces (packages/ui/unified-chat was not opened).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief says phones rotate to landscape and re-lay out the chat. The code keeps iPhone in portrait, and holds narrow Android screens in portrait. Only tablets can rotate. The brief's cited lines (app.config.js:73 and :91) are not orientation code. (apps/mobile/app.config.js:158, 181-186; apps/mobile/native/android/withAGITabletOrientation.cjs:18-30)
- The brief says purchases and restore are built. The purchase hook is not mounted in any screen. Only tests import it. The billing flag is also off. (apps/mobile/src/features/billing/useMobileIap.ts:726 (no screen imports it); apps/mobile/lib/v1FeatureFlags.ts:6)
- The brief says remote approval and remote coding review are done. Both sit behind the companion and dispatch flags, which are both off, so they cannot be reached in this build. (apps/mobile/lib/v1FeatureFlags.ts:12, 16; apps/mobile/app/(app)/companion/index.tsx:108-121; apps/mobile/src/features/companion/components/CodeSessionView.tsx)
- The brief says home-screen widgets and lock-screen controls are missing. The code has an iOS widget with New chat, Camera and Voice buttons, an iOS control, and an Android widget. (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77-100; apps/mobile/app.config.js:475, 481; apps/mobile/native/android/withAGIWidget.cjs:9-12)
- The brief says Siri and Spotlight shortcuts are not applicable. The code has App Intents for eight actions, and the iOS build plugin copies them in. (apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift:13; apps/mobile/native/ios/withAGINativeModulesIOS.cjs:42-44, 109-125)
- The brief says cellular data preferences are not applicable. The code has a Wi-Fi-first default and a Download over cellular switch during onboarding. The error text in the native code points to a Settings path (Settings, Storage, Download over cellular), but no such control was found outside onboarding. (apps/mobile/app/(public)/onboarding.tsx:746-756; apps/mobile/src/features/model-picker/installStore.ts:379, 521; apps/mobile/services/modelDownload.ts:191; apps/mobile/native/android/AGIAICoreModule.kt:158)
- On older Android, the voice button returns silently when on-device speech is not available and the local mode check fails. The person gets no message. (apps/mobile/app/(app)/chat/[id].tsx:1702-1706)
- Clear cache has no error handling. A failed delete is an unhandled promise error, and the total is then reset to zero anyway. (apps/mobile/app/(app)/settings/storage.tsx:296-300)
- The brief lists share and rate among the tap targets under a reply. The tap row has copy, read aloud, regenerate and the three-dot button only. Share sits in the Export sheet, and rating is a double-tap or a menu item. (apps/mobile/src/features/chat/components/MessageBubble.tsx:3146-3196; apps/mobile/src/features/chat/components/FileExportButton.tsx:59-66)
- The privacy cover on app switch only works when App Lock is on. With App Lock off, the app is not covered in the app switcher. (apps/mobile/src/features/auth/hooks/useBiometricGate.ts:133)
- After a restart, a reply that was still streaming is marked stopped locally. It is not continued by the phone. The app asks the server for the result, and shows a waiting or stopped message. This is weaker than the brief's wording about an in-flight reply. (apps/mobile/stores/chat/chatMessageStore.ts:411-417, 1745; apps/mobile/src/features/chat/inFlightTurnRecovery.ts:17-22)
- Approval alerts are meant to open the approval screen, but with the companion flag off they open the notifications list. The alert's Review button also only opens the app; the answer is not typed in the alert. (apps/mobile/services/notifications.ts:414-418, 441-447; apps/mobile/services/notificationCategories.ts:11-17)
- Several brief line references do not match the code. S71.09 cites _layout.tsx:493 and :583, but the share listener is at :827-840. S71.32 cites _layout.tsx:726, which is background fetch registration; the lock overlay is at :1020-1026. S71.19 cites MessageBubble.tsx:1110, which is not restoration code. (apps/mobile/app/_layout.tsx:726, 827-840, 1020-1026; apps/mobile/src/features/chat/components/MessageBubble.tsx:1110)

## Not established

- Whether the widget, the control, the App Intents and the Android widget actually appear and work on a device. Nothing was built or run, as the task required.
- The numbers behind the plan attachment limits (defined in the shared types package, which was not opened).
- What wipeAllLocalData in apps/mobile/services/dsarExport does beyond the in-memory reset, and which server data a wipe reaches.
- How shared text and files are staged between the share extension and the app (apps/mobile/src/features/share-preview/sharedAttachments and iosShareInbox were not opened).
- What writes to the SQLCipher database (expo-sqlite) in apps/mobile, if anything.
- Tablet layout details in apps/mobile/src/features/chat/components/MessageList.tsx and DrawerContent.tsx, which the brief cites. Those files were not opened.
- Which server events call sendPushToUser beyond the callers found by search (agent, schedule, chat reply, product update, usage reset, video notice, web push). Not all callers were read.
- Whether cloud chats keep their messages on the server during a phone restart. The server chat store was not opened.
- What the empty states look like on each screen. Only the code paths named above were read.
- Whether the composer send button is disabled when the box is empty. The code computes hasContent (ChatInput.tsx:1525), but the disabled prop was not confirmed.
- Failure messages for a failed model download beyond installFailureMessage (apps/mobile/src/features/model-picker/installStore.ts:71-76).
