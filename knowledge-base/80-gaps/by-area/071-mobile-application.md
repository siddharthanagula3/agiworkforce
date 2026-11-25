---
id: "GAPS-AREA-071"
type: "gap-list"
title: "Gaps: Mobile application"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 71. Mobile application

72 open gaps that touch this area. Area page: [20-features/071-mobile-application](../../20-features/071-mobile-application/README.md).

## CMP-C374

**Deep links that open the CLI with a prefilled prompt**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: No URL scheme is registered for the CLI.
- Evidence: searched: deep link, url scheme, handler registration in apps/cli/src

## CMP-C376

**disableDeepLinkRegistration: stop registering the CLI link handler**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: The CLI registers no link handler, so there is nothing to disable (the deep-link feature itself is Missing).
- Evidence: searched: deep.?link, agi://, register_protocol, url_scheme in apps/cli/src (6 hits, all curl scheme parsing in apps/cli/src/safety/network_target.rs:186-201; no handler registration)

## CMP-D94

**Deep link that starts a new chat with a prefilled prompt**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: A chat link must name an existing chat; the link parser keeps only a target and an id and drops any query, so no link opens a new chat with text in the box.
- Evidence: packages/contracts/local-runtime/src/host-bridge.ts:27-47 (parseDesktopDeepLink); apps/web/features/desktop-host/lib/deep-links.ts:40-56

## CMP-D96

**Admin switch to stop the app registering its link scheme**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: The app always registers its link scheme.
- Evidence: apps/desktop/electron/main.ts:2553

## CMP-D98

**Apple Intelligence, Siri, Writing Tools and Visual Intelligence**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: No Apple Intelligence or Siri integration exists.
- Evidence: searched: Siri, Apple Intelligence, Writing Tools in apps/desktop, apps/mobile

## CMP-DP102

**Deep links to Skills, the new scheduled task form and a plugin's install page**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: None opens the Skills page, the new-schedule form or a plugin install page Links open one existing schedule and any settings section; none opens the Skills page, the new-schedule form or a plugin install page.
- Evidence: packages/contracts/types/src/product-links.ts:1-9 (targets: chat, file, artifact, work, research, schedule, browser-task); apps/web/features/desktop-host/lib/deep-links.ts:40-56

## CMP-M143

**Apple Intelligence Writing Tools and Visual Intelligence**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: No Writing Tools or Visual Intelligence entry; the only mention is a code comment, with no search or image-query API.
- Evidence: searched: WritingTools, visualIntelligence, IntentValueQuery, SemanticContentDescriptor in apps/mobile/native, src, app.config.js

## CMP-M147

**Live Activities for voice**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md), [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md), [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Detail: No Live Activity.
- Evidence: searched: ActivityKit, LiveActivity in apps/mobile/native, src, app.config.js

## CMP-M153

**Use the assistant inside Apple Intelligence without an account**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: No Apple Intelligence extension was found.
- Evidence: searched: Apple Intelligence in native/ios, src

## CMP-M158

**Live store listing**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Detail: AGI Mobile has no live App Store or Google Play listing; the release state says Coming soon and unpublished.
- Evidence: apps/mobile/src/features/release-state/mobileReleaseState.json:4; apps/mobile/src/features/release-state/mobileReleaseState.json:33

## CMP-MP74

**Ask by voice through Siri**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md), [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: AGI is not a Siri or Apple Intelligence extension App Shortcuts give Siri phrases such as Ask AGI, and Ask from Siri (in Security and login) answers without opening the app. AGI is not a Siri or Apple Intelligence extension.
- Evidence: apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift:27; apps/mobile/src/features/siri/AskFromSiriSetting.tsx:19

## CMP-MP76

**Lock Screen, Control Center and Action Button control**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md), [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Detail: No Analyze Photo control and no Lock Screen widget One 'Open AGI Mobile' control (iOS 18) for Control Center, Lock Screen or Action Button. No Analyze Photo control and no Lock Screen widget; widgets are small and medium only.
- Evidence: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:90; apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:85

## CMP-MP80

**Countries where the app is offered**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Detail: The draft listing offers all App Store territories except Mainland China, Russia, Iran, North Korea, Syria, Cuba and Cr… The draft listing offers all App Store territories except Mainland China, Russia, Iran, North Korea, Syria, Cuba and Crimea.
- Evidence: apps/mobile/store-listing/LISTING-METADATA-IOS.json:267

## CMP-MP81

**Languages on the store listing**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Detail: The draft listing is English (US) only for v1, with seven more planned The draft listing is English (US) only for v1, with seven more planned.
- Evidence: apps/mobile/store-listing/LISTING-METADATA-IOS.json:281

## CMP-MP82

**Minimum iPhone system version**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Detail: The main app's floor (Expo default) was not confirmed, so parity with the leaders' iOS 18 is unknown Unverified: extensions and native modules target iOS 17.0, but the main app's floor (Expo default) was not confirmed, so parity with the leaders' iOS 18 is unknown.
- Evidence: apps/mobile/native/ios/withAGIWidgets.cjs:23; apps/mobile/native/ios/withAGINativeModulesIOS.cjs:9

## CMP-VP60

**Link that opens the chat with a prefilled prompt or session**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: There is no general open link with a typed prompt Editor links work for browser handoff, cloud tasks and developer sessions from the desktop app; there is no general open link with a typed prompt.
- Evidence: apps/extension-vscode/src/features/context-handoff/index.ts:289-308

## GAP-AREA071-LW07

**On older Android, the voice button returns silently when on-device speech is not available and the local mode check fails. The person gets no message.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-071
- Detail: Area 71. Mobile application
- Evidence: apps/mobile/app/(app)/chat/[id].tsx:1702-1706

## GAP-AREA071-LW08

**Clear cache has no error handling. A failed delete is an unhandled promise error, and the total is then reset to zero anyway.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-071
- Detail: Area 71. Mobile application
- Evidence: apps/mobile/app/(app)/settings/storage.tsx:296-300

## GAP-AREA071-LW10

**The privacy cover on app switch only works when App Lock is on. With App Lock off, the app is not covered in the app switcher.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-071
- Detail: Area 71. Mobile application
- Evidence: apps/mobile/src/features/auth/hooks/useBiometricGate.ts:133

## GAP-AREA071-LW12

**Approval alerts are meant to open the approval screen, but with the companion flag off they open the notifications list. The alert's Review button also only opens the app; the answer is not typed in the alert.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-071
- Detail: Area 71. Mobile application
- Evidence: apps/mobile/services/notifications.ts:414-418, 441-447; apps/mobile/services/notificationCategories.ts:11-17

## GAP-CAP-apps-and-install-07

**Phone apps from the app stores: Not published. iOS minimum version not confirmed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Requirement items: S71.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-20

**Deep links: No prefilled-prompt links, no admin switch, no CLI links.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Requirement items: S70.30, S71.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-21

**iPhone widgets, Lock Screen control and Action button: No Live Activity; no Analyze Photo control. Ledger rows need correcting.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md), [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Requirement items: S109.01, S109.02, S71.20, S71.21, S71.22
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-apps-and-install-22

**Android widget, icon shortcuts and default assistant: No assistant role or tile; ledger S71.20 stale.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Requirement items: S71.20, S71.24
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-apps-and-install-23

**Siri, Shortcuts, Spotlight and Apple Intelligence: No Apple Intelligence integration. Ledger S71.23 says not applicable but shortcuts exist.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Requirement items: S109.13, S71.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-30

**Local model install and storage on the device: Desktop local model management and explicit cloud-escalation approval are missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md), [F071-09](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md), [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md), [F109-09](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md), [F109-11](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Requirement items: S109.18, S109.19, S109.20, S109.21, S109.22, S109.23, S109.24, S70.23, S71.28, S71.30
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-F071-01-01

**Phones cannot use landscape in chat although the brief wants landscape adaptation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-01](../../20-features/071-mobile-application/F071-01-moving-around-and-screen-layout.md)
- Detail: Affects: Mobile phones (iOS and Android).. Work needed: Product decision, then unlock rotation for chat and verify composer and thread layout, or correct the brief.
- Evidence: apps/mobile/app.config.js:158; apps/mobile/src/shared/hooks/useLandscapeWhileOpen.ts:23-25; S71.27

## GAP-F071-01-02

**No hinge or fold-state handling.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-01](../../20-features/071-mobile-application/F071-01-moving-around-and-screen-layout.md)
- Detail: Affects: Foldable devices on Android.. Work needed: Only if foldables are a target: add a window-info signal and layout rules.
- Evidence: No code found by search; test case name only in useTabletLayout.test.ts

## GAP-F071-01-03

**Brief names 768 and 1024 as the tablet switch, but the permanent drawer starts at 1000 points.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-01](../../20-features/071-mobile-application/F071-01-moving-around-and-screen-layout.md)
- Detail: Affects: Tablets 768-999 points wide (portrait iPad, small Android tablet).. Work needed: Decide if portrait tablets should get a permanent drawer; align the brief or the threshold.
- Evidence: apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3-9, 24-47

## GAP-F071-02-01

**Only one queued follow-up is released per finished reply.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-02](../../20-features/071-mobile-application/F071-02-writing-a-message-in-the-composer.md)
- Detail: Affects: Mobile users who queue several messages.. Work needed: Confirm intent; either release all in order or tell the person.
- Evidence: apps/mobile/src/features/chat/components/ChatInput.tsx:1172-1180

## GAP-F071-02-02

**Queued follow-ups are held in memory; behaviour after the app is killed is not shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-02](../../20-features/071-mobile-application/F071-02-writing-a-message-in-the-composer.md)
- Detail: Affects: Mobile users when the OS ends the app during a reply.. Work needed: Verify on device; persist if lost.
- Evidence: ChatInput.tsx:383-395, 748-780

## GAP-F071-02-03

**The draft's cited line for the empty-send rule (1525) was wrong; the rule is at line 865.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-02](../../20-features/071-mobile-application/F071-02-writing-a-message-in-the-composer.md)
- Detail: Affects: Documentation only.. Work needed: None.
- Evidence: ChatInput.tsx:865

## GAP-F071-03-01

**No Share or Rate button in the tap row, although S71.04 lists them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-03](../../20-features/071-mobile-application/F071-03-message-actions-tap-buttons-and-long-press-menu.md)
- Detail: Affects: Mobile users who look for them under a reply.. Work needed: Add the buttons or change the brief text.
- Evidence: MessageBubble.tsx:3146-3196; S71.04

## GAP-F071-03-02

**Message delete is permanent with no Recently deleted step.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-03](../../20-features/071-mobile-application/F071-03-message-actions-tap-buttons-and-long-press-menu.md)
- Detail: Affects: Mobile users who delete a message by mistake.. Work needed: Decide whether single messages are covered by that rule; the alert names the loss, so this may be intended.
- Evidence: MessageBubble.tsx:1609-1623; AGENTS.md section 9 says chats are archived or moved to Recently deleted

## GAP-F071-03-03

**Whether delete uses the shared confirm component is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-03](../../20-features/071-mobile-application/F071-03-message-actions-tap-buttons-and-long-press-menu.md)
- Detail: Affects: Consistency only.. Work needed: Check useConfirmAction in the shared UI package against this alert.
- Evidence: MessageBubble.tsx:1609-1623 uses Alert.alert

## GAP-F071-04-01

**No automatic resume of interrupted uploads.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-04](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)
- Detail: Affects: Mobile users in Cloud mode who background the app during an upload.. Work needed: Restart failed-by-interruption uploads on foreground, or accept manual retry and update the brief.
- Evidence: apps/mobile/src/features/chat/upload/uploadLifecycle.ts:116-130; chatExecutionStore.ts:1144-1147; S71.18

## GAP-F071-04-02

**Two different camera paths exist; the in-app camera page has no visible entry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-04](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)
- Detail: Affects: Mobile users.. Work needed: Decide which path is the product; remove or expose the other.
- Evidence: app/_layout.tsx:216-217, 313-320; AddToChatSheet.tsx:697

## GAP-F071-04-03

**Local mode still caps photos by the plan limit even though nothing is uploaded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-04](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)
- Detail: Affects: Mobile Local users on low plans.. Work needed: Confirm intent against 'local inference is free of any paid subscription'.
- Evidence: chat/[id].tsx:1582-1586; test NewChatPhotoPickerLimit 'keeps the plan limit in Local'

## GAP-F071-04-04

**Where Cloud upload bytes are stored after presign was not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-04](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)
- Detail: Affects: Documentation of the data flow.. Work needed: Read the rest of api.uploadFile and the presign route.
- Evidence: services/api.ts after 730 not read

## GAP-F071-05-01

**The brief says audio route selection is not applicable, but it is built for iOS.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-05](../../20-features/071-mobile-application/F071-05-voice-conversation.md)
- Detail: Affects: Mobile iOS (built) and Android (absent).. Work needed: Update the brief status; decide on an Android route control.
- Evidence: apps/mobile/src/features/voice/services/audioRoute.ts:56-58; LiveVoiceBar.tsx:721

## GAP-F071-05-02

**The canUseVoice plan check applies to on-device voice too.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-05](../../20-features/071-mobile-application/F071-05-voice-conversation.md)
- Detail: Affects: Mobile Local-mode users on a plan whose capability document denies voice.. Work needed: Confirm whether any plan denies voice; if so, exempt on-device voice. Whether this can happen is unknown.
- Evidence: apps/mobile/app/(app)/chat/[id].tsx:1648, 1697-1700; apps/mobile/src/lib/Capabilities.tsx:126-134

## GAP-F071-05-03

**Android below API 33 gets no explanation when turn-based voice cannot start.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-05](../../20-features/071-mobile-application/F071-05-voice-conversation.md)
- Detail: Affects: Older Android phones.. Work needed: Show the 'On-device voice recognition is not available on this device.' message or a settings hint.
- Evidence: chat/[id].tsx:1706; voiceInput.ts:289-292

## GAP-F071-05-04

**Voice entry from the intent link 'voice' falls back to the chat on older Android, with no message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-05](../../20-features/071-mobile-application/F071-05-voice-conversation.md)
- Detail: Affects: Older Android users using shortcuts.. Work needed: Add an explanation.
- Evidence: apps/mobile/app/_layout.tsx:218-224

## GAP-F071-06-01

**Approval alerts do not open the approval screens because companion is off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: Affects: Mobile Cloud users who get approval alerts.. Work needed: Decide the intended landing (Tasks with run id works when the alert carries a run id) and test it.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:16; apps/mobile/services/notifications.ts:414-466

## GAP-F071-06-02

**Stale comment says schedule_run is the only server producer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: Affects: Engineers reading the code.. Work needed: Correct the comment.
- Evidence: apps/mobile/services/notificationEventTypes.ts:14-18

## GAP-F071-06-03

**Server sends sound 'default' on every push while the phone's priority table only applies to what the foreground handler shows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: Affects: Low-priority alerts when the app is closed (the OS plays the sound).. Work needed: Check on device whether low-priority pushes are silent when the app is closed.
- Evidence: apps/web/lib/services/push-notification-service.ts:189; apps/mobile/services/notifications.ts:101-160

## GAP-F071-06-04

**No live run of delivery is recorded here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: Affects: All.. Work needed: Run the scenarios on real devices.
- Evidence: No result file was read

## GAP-F071-07-01

**No answer from the notification; the brief allows 'notification reply or quick answer field' and only the in-app field exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-07](../../20-features/071-mobile-application/F071-07-cloud-tasks-agent-answers-and-approvals.md)
- Detail: Affects: Mobile users, both OS. Work needed: Decide whether the in-app field alone meets the requirement, and amend the brief or add a reply action.
- Evidence: apps/mobile/services/notificationCategories.ts:11-17

## GAP-F071-07-02

**Remote coding review and remote approval are off; the brief status says 'mobile done'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-07](../../20-features/071-mobile-application/F071-07-cloud-tasks-agent-answers-and-approvals.md)
- Detail: Affects: Mobile users with a paired desktop. Work needed: Owner decision to switch on, then live validation with a paired desktop.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:12, 16; apps/mobile/app/(app)/companion/code/[threadId].tsx:81

## GAP-F071-07-03

**The drawer entry and New task depend on a capability list; a user without it sees an empty screen or no entry with no explanation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-07](../../20-features/071-mobile-application/F071-07-cloud-tasks-agent-answers-and-approvals.md)
- Detail: Affects: Cloud users on plans without AGI Work. Work needed: Check the product intent for the no-capability state.
- Evidence: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:667, 815-822

## GAP-F071-07-04

**Where a notification with several pending approvals leads is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-07](../../20-features/071-mobile-application/F071-07-cloud-tasks-agent-answers-and-approvals.md)
- Detail: Affects: Mobile users. Work needed: Trace handleNotificationResponse for runId-less approvals (companion off).
- Evidence: apps/mobile/services/backgroundFetch.ts:107-111

## GAP-F071-08-01

**No Live Activity or ongoing notification for tasks or voice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Detail: Affects: iOS and Android users. Work needed: Product decision, then native ActivityKit and Android notification work.
- Evidence: No code found (brief S71.22 missing)

## GAP-F071-08-02

**No Android default digital assistant.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Detail: Affects: Android users. Work needed: Assist intent filter and service, or drop the requirement.
- Evidence: No assist intent filter in apps/mobile/native/android

## GAP-F071-08-03

**Lock screen widgets (accessory families) are not defined; only the iOS 18 control can be placed there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Detail: Affects: iOS users before iOS 18 and users wanting widget content. Work needed: Add accessory families.
- Evidence: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:90

## GAP-F071-08-04

**The brief status for S71.20 and S71.23 is stale: the code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Detail: Affects: Documentation readers. Work needed: Update the brief.
- Evidence: AGIWidgets.swift; AppShortcuts.swift; brief lines S71.20, S71.23

## GAP-F071-08-05

**Android has no Ask or summarize shortcut.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Detail: Affects: Android users. Work needed: Product decision.
- Evidence: apps/mobile/native/android/shortcuts/agi_shortcuts.xml

## GAP-F071-09-01

**Clear cache has no error handling; a failed delete still shows 0.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-09](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md)
- Detail: Affects: Mobile users. Work needed: Catch, report, re-measure.
- Evidence: apps/mobile/app/(app)/settings/storage.tsx:292-299

## GAP-F071-09-02

**Brief marks the cellular preference not applicable although it is built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-09](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: area brief S71.29; modelDownload.ts:194-209

## GAP-F071-09-03

**Model sizes and the 'Downloaded models' total are estimates.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-09](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md)
- Detail: Affects: Mobile users. Work needed: Measure real file sizes if exact figures are wanted.
- Evidence: storage.tsx:395-410

## GAP-F071-09-04

**Delete everything uses plain alerts; whether the shared confirm surface is required on mobile is not stated.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-09](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md)
- Detail: Affects: Mobile users. Work needed: Owner call.
- Evidence: useEraseDeviceData.ts:9-44; AGENTS.md section 9

## GAP-F071-10-01

**No automatic return to the last open chat after a cold start.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-10](../../20-features/071-mobile-application/F071-10-keeping-your-place-after-the-app-closes.md)
- Detail: Affects: Mobile users. Work needed: Persist and restore the last route, or update the brief.
- Evidence: apps/mobile/app/(app)/index.tsx:4; apps/mobile/app/(app)/chat/[id].tsx:571-577

## GAP-F071-10-02

**The brief's code reference (MessageBubble.tsx:1110) points to an image attachment block, not to restoration.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-10](../../20-features/071-mobile-application/F071-10-keeping-your-place-after-the-app-closes.md)
- Detail: Affects: Documentation. Work needed: Correct the brief reference.
- Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:1100-1125

## GAP-F071-10-03

**Local interrupted replies cannot be resumed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-10](../../20-features/071-mobile-application/F071-10-keeping-your-place-after-the-app-closes.md)
- Detail: Affects: Local mode users. Work needed: Product decision on a Retry affordance.
- Evidence: apps/mobile/stores/chat/chatMessageStore.ts:411-417

## GAP-F071-11-01

**The brief names FEATURES.billing and MOBILE_IAP_ENABLED as the switch but omits the build-time storePurchases.json value, which really decides whether the purchase UI exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Detail: Affects: Owner doing the switch-on. Work needed: Update the brief and runbook cross-reference.
- Evidence: apps/mobile/src/features/billing/storePurchases.json; area brief S71.31

## GAP-F071-11-02

**The brief says no screen mounts the hook; the Subscription screen does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:133

## GAP-F071-11-03

**Purchases are untested against live stores in this repository record.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Detail: Affects: Future paid users on iOS and Android. Work needed: Live validation with approved products.
- Evidence: No run record found

## GAP-F071-11-04

**Mobile status 'partial' with sales postponed to 2027.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Detail: Affects: Owner. Work needed: Owner decision on timing.
- Evidence: apps/mobile/store-listing/REVIEWER-NOTES-IOS.md:42

## GAP-F071-11-PARTLY

**Buying plans and credits in the store: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F071-11](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Requirement items: S71.31
- Detail: Mobile S71.31: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## GAP-F071-12-01

**The privacy cover works only while App Lock is on; the brief lists it as a separate control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-12](../../20-features/071-mobile-application/F071-12-app-lock-and-privacy-controls.md)
- Detail: Affects: Users who do not use App Lock. Work needed: Decide whether to cover without App Lock.
- Evidence: apps/mobile/src/features/auth/hooks/useBiometricGate.ts:119-125

## GAP-F071-12-02

**Android recents behaviour is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-12](../../20-features/071-mobile-application/F071-12-app-lock-and-privacy-controls.md)
- Detail: Affects: Android users. Work needed: Verify on a device, then add a secure flag if needed.
- Evidence: No secure-window flag found

## GAP-F071-12-03

**The brief's code references (index.tsx:99, 28; _layout.tsx:726) do not point at the gate code; lines moved.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-12](../../20-features/071-mobile-application/F071-12-app-lock-and-privacy-controls.md)
- Detail: Affects: Documentation. Work needed: Refresh references.
- Evidence: apps/mobile/app/_layout.tsx:604-609 shows unrelated code

## GAP-F071-12-04

**Draft names the screen 'Safety and Security'; the label is 'Safety & Security'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F071-12](../../20-features/071-mobile-application/F071-12-app-lock-and-privacy-controls.md)
- Detail: Affects: Documentation. Work needed: Use the exact label.
- Evidence: safety-security/index.tsx:78
