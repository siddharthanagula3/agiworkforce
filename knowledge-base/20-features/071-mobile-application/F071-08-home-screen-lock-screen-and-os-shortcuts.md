---
id: "F071-08"
type: "feature"
title: "Home screen, lock screen and OS shortcuts"
aliases: ["Quick Access", "Home screen widget", "AGI Mobile widget", "Open AGI Mobile control", "Siri and Shortcuts", "App Intents", "Ask from Siri", "Android app shortcuts", "Live Activity (not built)", "Default digital assistant (not built)"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.20", "S71.21", "S71.22", "S71.23", "S71.24"]
depends_on: ["surface:mobile", "mode:cloud", "mode:local", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "api:POST /api/mobile/intent/ask", "api:POST /api/mobile/intent-token", "store:ios-keychain-ask-intent-token", "table:web_conversations", "table:web_messages"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-08 Home screen, lock screen and OS shortcuts

AGI Mobile can be started from the iOS home screen widget, the iOS 18 control, Siri and Spotlight phrases, and the Android widget and icon shortcuts. Each opens the app on chat, camera, voice or another screen. Live Activity and Android default-assistant do not exist in the code.

Area: [71. Mobile application](README.md). Requirement items: [S71.20](../../10-requirements/capabilities/071-mobile-application.md#s7120), [S71.21](../../10-requirements/capabilities/071-mobile-application.md#s7121), [S71.22](../../10-requirements/capabilities/071-mobile-application.md#s7122), [S71.23](../../10-requirements/capabilities/071-mobile-application.md#s7123), [S71.24](../../10-requirements/capabilities/071-mobile-application.md#s7124).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives the phone operating system ways to start AGI without opening the app first: a home screen widget with New chat, Camera and Voice, a control for Control Center, the lock screen or the Action Button (iOS 18 and later), Siri and Spotlight phrases for eight actions, and Android launcher shortcuts and a widget (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift; apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift; apps/mobile/native/android/shortcuts/agi_shortcuts.xml).

**Why it exists.** The brief requires widgets, lock-screen widgets, Live Activity, system shortcuts and default-assistant integration (doc: knowledge-base/data/area-briefs/071-mobile-application.md S71.20-S71.24).

**Who uses it.** Everyday phone users who want one-tap or voice start; iOS users for Siri and Spotlight, iOS and Android users for widgets.

**Problems it solves**

- Starting a chat or the camera takes one tap from outside the app.
- Asking a question by voice without opening the app (Ask AGI, Cloud only).
- Setup help is in the app under Quick Access.

**Use cases**

- Tap Camera on the widget to ask about a photo.
- Say 'Summarize with AGI Mobile' to open the summary screen with text filled in.
- Long-press the Android icon and choose Voice.
- Add the iOS 18 control to the lock screen to open the app.

## 2. User experience

**Where to find it**

- Mobile iOS: widget named 'AGI Mobile' (small and medium) from the widget gallery; control 'Open AGI Mobile' on iOS 18 or later (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift).
- Mobile iOS: Siri and Spotlight short titles Start Chat, Ask AGI, Summarize, Analyze Image, Transcribe, Translate, Scan, Set Reminder (apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift).
- Mobile Android: widget labelled 'AGI Mobile' (home screen category) and long-press shortcuts New chat, Voice, Camera (apps/mobile/native/android/widget/agi_widget_values.xml; apps/mobile/native/android/shortcuts/agi_shortcut_values.xml).
- In the app: Settings row 'Quick Access' opens a 'Quick Access' page with steps (apps/mobile/src/features/settings/index.tsx:714-718; apps/mobile/src/features/widget-setup/index.tsx:142).
- Ask from Siri switch: Settings, Account security screen, iOS only (apps/mobile/src/features/settings/account-security/index.tsx:579; apps/mobile/src/features/siri/askIntentToken.ts:113-115).

**Before you start**

- A build that includes the widget and intents plugins (apps/mobile/app.config.js:478-482).
- Ask AGI also needs Cloud mode, a signed-in account and the Ask from Siri switch on (apps/mobile/src/features/siri/AskFromSiriSetting.tsx:36-60; apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:34-42).
- Voice from the widget needs on-device speech to be guaranteed, otherwise it opens chat (apps/mobile/app/_layout.tsx:219-225).

**Screens and controls**

- iOS widget small: tap anywhere for a new chat. Medium: three buttons New chat, Camera, Voice (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:46-72).
- Android widget: three buttons wired to the same links (apps/mobile/native/android/widget/AGIQuickActionsWidget.kt).
- Quick Access page sections Siri & Shortcuts, Share Sheet, Home Screen Widget, and on Android also Share From Any App, Act On Selected Text, App Shortcuts, Links Open In The App (apps/mobile/src/features/widget-setup/index.tsx:169-306).

**Journey**

1. Add the widget or control from the system, or ask Siri.
2. The system opens agiworkforce://intent/<verb> (apps/mobile/native/ios/AGIAppIntents/AGIIntentDispatch.swift:20-45).
3. The app root layout routes the verb to chat, camera, voice, summarize, translate, scan, analyze, transcribe or reminder screens (apps/mobile/app/_layout.tsx:202-330).
4. The person continues in that screen.

**What the person sees and gets**

- Ask AGI replies by Siri speech or text with the answer, or one of the messages 'Ask from Siri is off...', 'Ask from Siri needs to be set up again...', 'AGI Mobile could not answer right now. Try again in the app.', 'Ask a shorter question.' (apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:34-45).
- Ask AGI answers are saved as a chat tagged source siri (apps/web/lib/server/mobile-intent.ts:81).

**Settings**

- Ask from Siri switch (label 'Ask from Siri'; description 'Ask AGI through Siri and hear the answer, saved as a chat.') (apps/mobile/src/features/siri/AskFromSiriSetting.tsx:61-67).
- Quick Access page (help only).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- iOS widget extension with a quick actions widget (small, medium) and a control widget on iOS 18 or later (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:6-8, 66-72).
- Eight App Shortcuts with phrases (apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift).
- Intent dispatch builds agiworkforce://intent/<verb> URLs and opens them; files are staged into caches and images re-encoded (apps/mobile/native/ios/AGIAppIntents/AGIIntentDispatch.swift:20-45, 60-100).
- The root layout handles the verbs chat, camera, voice, ask, summarize, remind, share, translate, scan, analyze_image, transcribe (apps/mobile/app/_layout.tsx:202-330).
- Ask AGI runs without opening the app, calls POST /api/mobile/intent/ask with a stored token, and the server applies entitlements, safety checks and usage reservation (apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:11, 30-65; apps/web/app/api/mobile/intent/ask/route.ts; apps/web/lib/server/mobile-intent.ts:116-176).
- Intents are added to the iOS build and the widget target shares the open intent (apps/mobile/native/ios/withAGINativeModulesIOS.cjs:42-44, 109-125).
- Android shortcuts (New chat, Voice, Camera) and the widget are registered by config plugins (apps/mobile/app.config.js:478-482; apps/mobile/native/android/withAGIShortcuts.cjs:9-15; apps/mobile/native/android/withAGIWidget.cjs:9-12).

**Incomplete**

- The 'Camera' and 'Voice' widget buttons exist, but the brief status reads missing; the brief lags the code (doc: area brief S71.20-S71.23 against the files above).
- Android 'Summarize', 'Ask' and the other verbs have no Android shortcut or widget; only chat, camera, voice are exposed on Android (apps/mobile/native/android/shortcuts/agi_shortcuts.xml).

**Present but disconnected or switched off**

- Lock screen widgets by widget family are not defined: the quick actions widget supports only small and medium (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:90). Only the iOS 18 control is described as available on the Lock Screen (same file, control description).
- Whether the widget and control appear for a given build is determined by the plugin run at prebuild; no run was observed.

**Not available**

- Live Activity or ongoing notification for agent tasks or voice: no ActivityKit or equivalent code found (searched apps/mobile app, src, native, services, stores).
- Default digital assistant on Android: no assist or voice-command intent filter or service found (searched apps/mobile/native/android and apps/mobile/app.config.js).
- Android widget on the lock screen: widget category is home_screen only (apps/mobile/native/android/widget/agi_quick_actions_widget_info.xml).
- Desktop, Web, CLI, VS Code, Chrome: not part of this feature.

## 4. Required behaviour

**Established requirements**

- The user can add an AGI widget to the home screen that opens or starts a chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.20)
- Where the OS supports it the user can place an AGI widget on the lock screen. (source: S71.21)
- Where supported, a running agent task or voice session shows as a Live Activity or ongoing notification with progress. (source: S71.22)
- OS-level shortcuts (Siri/App Intents, Spotlight, launcher shortcuts) can start AGI actions such as ask or summarize. (source: S71.23)
- On Android the user can set AGI as the default digital assistant so the assist gesture opens it. (source: S71.24)
- The widget page and Siri use the same agiworkforce://intent scheme (code rank 2 over docs). (source: apps/mobile/native/ios/AGIAppIntents/AGIIntentDispatch.swift:20-45)

**Acceptance criteria**

1. The widget gallery lists the AGI widget; tapping New chat, Camera and Voice opens chat, camera and voice or chat when speech is not guaranteed.
2. On iOS 18 the control can be added and opens the app.
3. Each of the eight phrases triggers its intent from Siri or Spotlight.
4. Ask AGI with the switch off answers with the 'Ask from Siri is off' message.
5. Android icon long-press lists New chat, Voice and Camera.
6. No Live Activity and no assistant role is offered (matches code today).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Each iOS intent that opens the app must have a matching case in the root layout; the eight verbs do [inferred from AGIIntentDispatch.swift and app/_layout.tsx:202-330].
- Android needs no Ask equivalent until a similar token path exists [inferred: askFromSiriSupported returns true only on iOS].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add accessory widget families so the same buttons can sit on the iOS lock screen.
- [proposed] Decide whether Live Activity and default assistant remain requirements; if yes, plan the native work; if no, remove S71.22 and S71.24 from the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | iOS widget and control | `apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift` | Widget views, deep links, control widget. |
| config | Widget Info.plist and entitlements | `apps/mobile/native/ios/AGIWidgets/AGIWidgets-Info.plist` | Extension configuration (entitlements next to it). |
| config | iOS widget plugin | `apps/mobile/native/ios/withAGIWidgets.cjs` | Adds the widget extension target at prebuild. |
| config | iOS native modules plugin | `apps/mobile/native/ios/withAGINativeModulesIOS.cjs` | Copies and adds intent sources to the app and widget targets. |
| component | App Shortcuts provider | `apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift` | Phrases and short titles for eight shortcuts. |
| component | Intent dispatch | `apps/mobile/native/ios/AGIAppIntents/AGIIntentDispatch.swift` | Builds and opens deep links; stages files. |
| component | AskAGIIntent | `apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift` | Answers without opening the app via the server. |
| component | Other intents | `apps/mobile/native/ios/AGIAppIntents/SummarizeIntent.swift` | Summarize (siblings: StartChat, AnalyzeImage, Transcribe, Translate, Scan, SetReminder, OpenAGIWorkforce). |
| test | Swift intent tests | `apps/mobile/native/ios/AGIAppIntentsTests/AGIIntentDispatchTests.swift` | Native tests for dispatch and parameter extraction. |
| component | Android widget | `apps/mobile/native/android/widget/AGIQuickActionsWidget.kt` | Provider that sends the three links. |
| config | Android widget plugin | `apps/mobile/native/android/withAGIWidget.cjs` | Registers receiver and resources. |
| config | Android shortcuts plugin | `apps/mobile/native/android/withAGIShortcuts.cjs` | Registers the shortcuts resource on MainActivity. |
| config | Android shortcuts definition | `apps/mobile/native/android/shortcuts/agi_shortcuts.xml` | New chat, Voice, Camera shortcuts. |
| config | Plugin registration | `apps/mobile/app.config.js` | Registers all the plugins (lines 478-482). |
| screen | Root layout intent router | `apps/mobile/app/_layout.tsx` | openIntentLink handles each verb (lines 158-330). |
| screen | Quick Access page | `apps/mobile/src/features/widget-setup/index.tsx` | In-app setup help. |
| component | Ask from Siri setting | `apps/mobile/src/features/siri/AskFromSiriSetting.tsx` | Switch that creates or revokes the intent token. |
| service | Ask intent token | `apps/mobile/src/features/siri/askIntentToken.ts` | Creates, stores in the keychain and revokes the token. |
| endpoint | Ask intent endpoint | `apps/web/app/api/mobile/intent/ask/route.ts` | Authenticates by token, rate limits, answers. |
| service | Ask answer logic | `apps/web/lib/server/mobile-intent.ts` | Entitlement, safety, route selection, saves the chat. |
| endpoint | Intent token endpoint | `apps/web/app/api/mobile/intent-token` | Issues and revokes the token (path constant packages/contracts/cloud-contracts/src/mobile-intent.ts:3). |
| table | web_conversations and web_messages | `apps/web/lib/server/mobile-intent.ts` | Rows written for each Siri answer (lines 71-86). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person taps a widget button or says a phrase; the OS runs the widget link or intent. | device | apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:6-8; apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift |
| The intent opens agiworkforce://intent/<verb>?<params>; no network is used here. | device | apps/mobile/native/ios/AGIAppIntents/AGIIntentDispatch.swift:6-18, 33-45 |
| The root layout parses the link and pushes the matching screen. | device | apps/mobile/app/_layout.tsx:202-330 |
| For Ask AGI, the intent reads the keychain token and posts the prompt to /api/mobile/intent/ask with a 55 second timeout. | device and our servers | apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:39-65 |
| The server checks token, MFA and IP rules, age, safety, plan entitlement and usage, picks a route, generates the answer and saves a chat. | our servers | apps/web/app/api/mobile/intent/ask/route.ts:24-50; apps/web/lib/server/mobile-intent.ts:116-176 |
| The model call goes to the provider the route selects. | outside service | apps/web/lib/server/mobile-intent.ts:181-205 (provider not named here) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Ask intent token | iOS keychain, service com.agiworkforce.app.ask-intent (apps/mobile/src/features/siri/askIntentToken.ts:25-26) | Token record also on server | Removed when the switch is turned off or on sign-out (apps/mobile/src/features/siri/askIntentToken.ts:198, 331) |
| Staged intent files (images, audio) | App caches folder AGIIntentFiles | No | Stale after 24 hours (apps/mobile/native/ios/AGIAppIntents/AGIIntentDispatch.swift:60-64) |
| Siri question and answer | Server tables web_conversations and web_messages with metadata source siri | Appears in cloud chat history | unknown |

**Models and providers.** Ask AGI uses a server route chosen by the unattended route selector for the account's plan; models are not named in the intent code (apps/web/lib/server/mobile-intent.ts:181-205). Other verbs open the app and use whichever mode the app is in.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Widgets and shortcuts need no account to open the app. Ask AGI needs a signed-in Cloud account (apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:34-35). |
| Permissions | The Ask token is stored in the keychain. Camera and microphone permissions apply once the target screen opens (apps/mobile/src/features/settings/permissions/registry.ts). |
| Subscription | Ask AGI resolves the entitlement bundle and refuses when the plan does not allow it (apps/web/lib/server/mobile-intent.ts:155-176). |
| Limits and metering | Prompt max 2,000 characters on device (AskAGIIntent.swift:41); rate limit 'mobile-intent-ask' per token (apps/web/app/api/mobile/intent/ask/route.ts:28); usage is reserved and released (apps/web/lib/server/mobile-intent.ts:205-270). |
| Feature flags | Ask from Siri switch; the widget and shortcuts have no runtime flag. Plugins are always registered (apps/mobile/app.config.js:478-482). |
| Model compatibility | Server route only; Ask refuses when no model keeps chats out of training (apps/web/lib/server/mobile-intent.ts:41, 189). |
| Provider restrictions | Consent to cloud provider sharing is required to enable Ask (apps/mobile/src/features/siri/AskFromSiriSetting.tsx:37-40; apps/mobile/src/features/siri/askIntentToken.ts:191). |
| Local mode | Widget, control and shortcuts open the app in whichever mode it is in. Ask AGI is Cloud only: the switch is disabled in Local mode unless already on (apps/mobile/src/features/siri/AskFromSiriSetting.tsx:62-68). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| On-device speech not guaranteed | Voice link opens the chat tab. | apps/mobile/app/_layout.tsx:219-225 |
| Ask switch off | Spoken message names the Settings path. | apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:34-35 |
| Token rejected (401) | Asks the person to turn the switch off and on. | apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:36-37, 58 |
| Network failure | 'AGI Mobile could not answer right now. Try again in the app.' | apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:38, 62-64 |
| Unreadable image or audio | Error string telling the person to choose another file. | apps/mobile/native/ios/AGIAppIntents/AGIIntentDispatch.swift:48-55 |
| Android reminder verb | Goes to a share preview with the reminder text instead of the Apple Reminders review screen. | apps/mobile/app/_layout.tsx:249-262 |
| Offline | Opening links works offline; Ask fails with the generic message. | apps/mobile/native/ios/AGIAppIntents/AGIIntentDispatch.swift:6-8 |
| Accessibility | Widget buttons have accessibility labels equal to their titles. | apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:41 |
| Lock screen and Live Activity | not handled in the code | searched ActivityKit and widgetCategory terms; none found beyond the control and home_screen category |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/ios-app-intents-native.test.ts`: iOS intent sources and wiring (by name)
- `apps/mobile/__tests__/android-shortcuts-plugin.test.ts`: Android shortcuts plugin (describe 'withAGIShortcuts')
- `apps/mobile/__tests__/app-intents-deeplink.test.ts`: Intent deep links
- `apps/mobile/__tests__/RootLayoutIntentLink.test.tsx`: Root layout intent link handling
- `apps/mobile/__tests__/AppIntentPayloadDelivery.test.tsx`: Payload delivery from intents
- `apps/mobile/__tests__/WidgetSetupPage.test.tsx`: Quick Access page
- `apps/mobile/__tests__/AskFromSiriSetting.test.tsx`: Ask from Siri setting
- `apps/mobile/__tests__/ask-intent-token.test.ts`: Ask token handling
- `apps/mobile/native/ios/AGIAppIntentsTests/AGIIntentDispatchTests.swift`: Native dispatch tests
- `apps/web/app/api/mobile/intent/ask/__tests__/route.test.ts`: Ask endpoint

**Test scenarios**

- **Widget buttons**
  1. Add the widget (medium).
  2. Tap New chat, Camera, Voice in turn.
  - Expected: Chat tab, camera screen, voice screen (or chat if speech is not guaranteed).
- **Siri Start Chat**
  1. Say 'Start chat with AGI Mobile'.
  - Expected: The app opens on the chat tab.
- **Ask AGI off then on**
  1. Ask 'Ask AGI' with the switch off.
  2. Turn on Ask from Siri in Cloud mode and ask again.
  - Expected: First reply names the switch; second returns an answer and a Siri chat appears in history.
- **iOS 18 control**
  1. Add 'Open AGI Mobile' to Control Center.
  2. Tap it.
  - Expected: The app opens.
- **Android shortcuts**
  1. Long-press the app icon.
  2. Choose Voice.
  - Expected: Voice screen or chat when speech is not guaranteed.
- **Absent features**
  1. Search for Live Activity and an assistant role in system settings.
  - Expected: None offered, matching the code.

**Where to look when it fails**

- Server error codes intent_token_invalid, mfa_required, ip_not_allowed, invalid_request, account_unavailable, no_training_model_available (apps/web/app/api/mobile/intent/ask/route.ts; apps/web/lib/server/mobile-intent.ts).
- Tables web_conversations and web_messages for rows with metadata source siri.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **No Live Activity or ongoing notification for tasks or voice.** Affects: iOS and Android users. Evidence: No code found (brief S71.22 missing). Work needed: Product decision, then native ActivityKit and Android notification work.
- **No Android default digital assistant.** Affects: Android users. Evidence: No assist intent filter in apps/mobile/native/android. Work needed: Assist intent filter and service, or drop the requirement.
- **Lock screen widgets (accessory families) are not defined; only the iOS 18 control can be placed there.** Affects: iOS users before iOS 18 and users wanting widget content. Evidence: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:90. Work needed: Add accessory families.
- **The brief status for S71.20 and S71.23 is stale: the code exists.** Affects: Documentation readers. Evidence: AGIWidgets.swift; AppShortcuts.swift; brief lines S71.20, S71.23. Work needed: Update the brief.
- **Android has no Ask or summarize shortcut.** Affects: Android users. Evidence: apps/mobile/native/android/shortcuts/agi_shortcuts.xml. Work needed: Product decision.

**Depends on**

- surface:mobile
- mode:cloud
- mode:local
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- api:POST /api/mobile/intent/ask
- api:POST /api/mobile/intent-token
- store:ios-keychain-ask-intent-token
- table:web_conversations
- table:web_messages

## Unknown

- Whether the widget extension builds and shows correctly: prebuild output is not committed and no build was run.
- Whether the iOS 18 control appears on the lock screen on all devices (OS decides).
- Whether the Android widget layout renders correctly on all launchers.
- Server retention of Siri chats.
- Which provider the Ask route calls (selected at run time).
