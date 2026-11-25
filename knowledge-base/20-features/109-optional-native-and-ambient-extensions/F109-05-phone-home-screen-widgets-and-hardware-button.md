---
id: "F109-05"
type: "feature"
title: "Phone home-screen widgets and hardware button"
aliases: ["AGI Mobile widget", "Quick Actions widget (AGIQuickActions)", "Open AGI Mobile control", "Quick Access (settings screen)", "Android launcher shortcuts", "S109.01 and S109.11"]
area: "109 Optional native and ambient extensions"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "missing", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.01", "S109.11"]
depends_on: ["surface:mobile", "file:apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift", "file:apps/mobile/native/android/widget/AGIQuickActionsWidget.kt", "file:apps/mobile/app/_layout.tsx", "SYS-voice-and-media", "SYS-shared-ui-and-design", "SYS-authentication-and-identity", "F109-04", "F109-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-05 Phone home-screen widgets and hardware button

On the phone, an AGI Mobile home-screen widget has New chat, Camera and Voice buttons (Android, and iOS medium size), and iOS 18 or later has an Open AGI Mobile control for Control Center, the Lock Screen or the Action Button. Every button opens a deep link into the app. The content is static.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.01](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10901), [S109.11](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10911).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Each widget button opens agiworkforce://intent/<chat|camera|voice>; the app routes the link to the chat tab, the camera screen or the voice screen (apps/mobile/app/_layout.tsx:202-224). The iOS control only opens the app (apps/mobile/native/ios/AGIAppIntents/OpenAGIWorkforceIntent.swift).

**Why it exists.** Brief items: a home-screen widget that starts an action (S109.01) and a hardware button such as the iPhone Action Button that triggers AGI actions (S109.11) (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md). The founder record names the home-screen widget and Siri shortcuts as ways the app is opened (doc: docs/decisions/2026-11-12-founder-decisions.md:23).

**Who uses it.** Phone users who want to reach chat, camera or voice in one tap.

**Problems it solves**

- Opening the app and then finding the right screen.
- Reaching AGI from the lock screen controls or Action Button on iOS 18 or later.

**Use cases**

- Tap Voice on the widget to start voice mode.
- Tap Camera to open the camera screen.
- Assign Open AGI Mobile to the Action Button.
- Long-press the Android icon and use the New chat, Voice or Camera launcher shortcut.

## 2. User experience

**Where to find it**

- iOS: Add Widget, then 'AGI Mobile' (small or medium) (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:83-85); control 'Open AGI Mobile' in Control Center, Lock Screen or Action Button (AGIWidgets.swift:90-99).
- Android: widget 'AGI Mobile', minimum 180dp by 40dp, 3 by 1 cells, resizable, home screen category (apps/mobile/native/android/widget/agi_quick_actions_widget_info.xml; agi_widget_values.xml). Launcher shortcuts new_chat, voice, camera (apps/mobile/native/android/shortcuts/agi_shortcuts.xml).
- Setup guide in the app: Settings, 'Quick Access' (apps/mobile/src/features/settings/index.tsx:715) opening the 'Quick Access' screen with 'Home Screen Widget' step (apps/mobile/src/features/widget-setup/index.tsx:129-240).
- Desktop and Chrome: none (brief: missing).

**Before you start**

- Phone app installed with the widget extension built in.
- iOS 17 or later for the widget extension (apps/mobile/native/ios/withAGIWidgets.cjs:23); iOS 18 or later for the control (AGIWidgets.swift:89).

**Screens and controls**

- iOS small: icon, 'New chat', 'AGI Mobile'; whole widget opens new chat (AGIWidgets.swift:54-67).
- iOS medium: three buttons 'New chat', 'Camera', 'Voice' (AGIWidgets.swift:68-73).
- Android widget: buttons New chat, Camera, Voice (AGIQuickActionsWidget.kt:16-18).
- Control: label 'AGI Mobile' with description 'Open AGI Mobile from Control Center, the Lock Screen or the Action Button.' (AGIWidgets.swift:90-99).

**Journey**

1. Add the widget or control as the setup screen explains.
2. Tap a button.
3. The app opens through the link; if onboarding, sign-in or terms are pending the link is held and opened afterwards (apps/mobile/app/_layout.tsx:866-877).
4. The chat tab, camera or voice screen opens.

**What the person sees and gets**

- Static widget face; no live data (iOS timeline policy never refreshes: AGIWidgets.swift:21-23; Android updatePeriodMillis 0).
- The target screen opens in the app.

**Settings**

- None for the widget itself. The Quick Access screen is guidance only.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Android receiver sets three PendingIntents to agiworkforce://intent/chat, camera and voice (AGIQuickActionsWidget.kt:12-33).
- iOS widget and control exist and are added through config plugins listed in app.config.js (apps/mobile/app.config.js:475,481-482; plugin apps/mobile/native/ios/withAGIWidgets.cjs).
- The root layout parses the link and routes 'chat', 'camera', 'voice' (apps/mobile/app/_layout.tsx:202-224); +native-intent.ts hands 'intent' links to the root layout (apps/mobile/app/+native-intent.ts:6-12).
- Held links are opened after onboarding and sign-in (_layout.tsx:866-883).

**Incomplete**

- The iOS small widget has only one action (New chat) (AGIWidgets.swift:54-67).
- Release gate: the build config may not list the widget target for EAS signing (doc: audit/registers/known-flaws.md:315 MOBILE-EAS-APP-EXTENSIONS-01).

**Present but disconnected or switched off**

- Brief marks home-screen as missing for mobile but code exists; the brief status is stale or based on unverified runs.

**Not available**

- Desktop widgets, Stream Deck or macropad integration: none found (brief missing).
- Chrome: none.
- Live-data widgets and lock-screen widgets with content: none found; only the iOS control.

## 4. Required behaviour

**Established requirements**

- The user can add an AGI widget to the phone or desktop home screen that shows content or starts an action. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.01)
- A hardware button or macropad (Stream Deck, iPhone Action Button) can trigger AGI actions through a supported integration. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.11)
- The lock screen can show an AGI widget or start an action without unlocking. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.02)
- iOS native changes go through config plugins, never hand edits of generated output. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. After adding the iOS medium widget, tapping Camera opens the camera screen.
2. Tapping Voice opens the voice screen (chat tab on Android below API 33).
3. Tapping the small iOS widget opens a new chat.
4. On iOS 18 or later, the Open AGI Mobile control opens the app from Control Center and the Action Button.
5. On Android the widget can be added and resized and its three buttons open the three screens.
6. A link tapped before sign-in is held and opened after sign-in.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The widget and control need no network; they only open the app (no network code in AGIWidgets.swift or AGIQuickActionsWidget.kt) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Camera and Voice to the iOS small widget or state the limit in setup copy.
- [proposed] Record EAS signing result for the widget target and close MOBILE-EAS-APP-EXTENSIONS-01.
- [proposed] Decide on lock screen content widgets (S109.02).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | iOS widget and control | `apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift` | AGIQuickActions widget, AGIOpenControl, widget bundle. |
| service | OpenAGIWorkforceIntent | `apps/mobile/native/ios/AGIAppIntents/OpenAGIWorkforceIntent.swift` | Intent the control runs; opens the app. |
| config | iOS widgets plugin | `apps/mobile/native/ios/withAGIWidgets.cjs` | Adds the widget extension target to the Xcode project. |
| config | Widget entitlements | `apps/mobile/native/ios/AGIWidgets/AGIWidgets.entitlements` | Entitlements for the extension. |
| component | Android widget provider | `apps/mobile/native/android/widget/AGIQuickActionsWidget.kt` | Builds the three deep-link buttons. |
| config | Android widget plugin | `apps/mobile/native/android/withAGIWidget.cjs` | Copies sources and registers the receiver. |
| config | Android widget info | `apps/mobile/native/android/widget/agi_quick_actions_widget_info.xml` | Size and category. |
| config | Android shortcuts | `apps/mobile/native/android/shortcuts/agi_shortcuts.xml` | Launcher shortcuts new_chat, voice, camera. |
| config | Android shortcuts plugin | `apps/mobile/native/android/withAGIShortcuts.cjs` | Installs the shortcuts. |
| config | plugin registration | `apps/mobile/app.config.js` | Lists the plugins (lines 475-482). |
| service | openIntentLink | `apps/mobile/app/_layout.tsx` | Routes intent verbs to screens (lines 202-260). |
| service | redirectSystemPath | `apps/mobile/app/+native-intent.ts` | Lets the root layout take 'intent' links. |
| store | pending intent link | `apps/mobile/src/features/auth/services/postAuthIntent.ts` | Holds a link until the person reaches the app. |
| screen | Quick Access setup screen | `apps/mobile/src/features/widget-setup/index.tsx` | Explains adding the widget and control. |
| screen | camera screen | `apps/mobile/app/(app)/camera.tsx` | Target of the camera link. |
| screen | voice screen | `apps/mobile/app/(app)/voice.tsx` | Target of the voice link. |
| test | Android shortcuts plugin test | `apps/mobile/__tests__/android-shortcuts-plugin.test.ts` | Widget and shortcuts use the same links (line 58). |
| test | link routing tests | `apps/mobile/__tests__/RootLayoutIntentLink.test.tsx` | Intent link opening and holding. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person taps a widget button or the control. | device | apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:36-52; AGIQuickActionsWidget.kt:23-33 |
| The OS opens the app with agiworkforce://intent/<verb>. | device | AGIWidgets.swift:5-9 |
| Root layout parses the link and holds it if the app is not ready, then pushes the screen. | device | apps/mobile/app/_layout.tsx:866-883,202-224 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending intent link | Held in the app's post-auth intent service until opened | No | Cleared once handed over; not carried into a fresh process (apps/mobile/__tests__/pending-intent-link.test.ts:10-31) |

**Models and providers.** The widget uses no model. The screens it opens use the app's mode, model and provider (F109-04 for voice).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Widget works without an account; the opened screen follows app rules, and a link is held until onboarding, sign-in and terms are done (_layout.tsx:866-877). |
| Permissions | Camera and microphone permissions are asked by the target screens, not the widget [inferred]. |
| Subscription | none found in the code for the widget; see SYS-subscriptions-entitlements-and-usage for the app. |
| Limits and metering | none found in the code |
| Feature flags | none found |
| Model compatibility | Not applicable. |
| Provider restrictions | none found |
| Local mode | The widget needs no network and works in Local mode; the target screens depend on app mode (voice screen: apps/mobile/app/(app)/voice.tsx:201,442). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| App not onboarded or signed out | Link held, opened after reaching the app | apps/mobile/app/_layout.tsx:870-883 |
| Clerk not loaded | Waits | apps/mobile/app/_layout.tsx:872 |
| Android below API 33 | Voice link opens the chat tab | apps/mobile/app/_layout.tsx:219-224 |
| iOS below 18 | Control not offered | AGIWidgets.swift:89,99-110 |
| Widget shows stale content | Not applicable: static | AGIWidgets.swift:21-23 |
| Accessibility | Buttons carry an accessibility label equal to the title | AGIWidgets.swift:46 |
| Offline | Widget opens the app; screens decide | not handled in the widget code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/android-shortcuts-plugin.test.ts`: Shortcuts and widget open chat, voice, camera through the same links.
- `apps/mobile/__tests__/release-configuration.test.ts`: Extension plugin list includes withAGIWidgets (line 91).
- `apps/mobile/__tests__/WidgetSetupPage.test.tsx`: Quick Access setup screen text for iOS and Android.
- `apps/mobile/__tests__/RootLayoutIntentLink.test.tsx`: Opening and holding intent links.
- `apps/mobile/__tests__/pending-intent-link.test.ts`: Held link handover.
- `apps/mobile/__tests__/app-intents-deeplink.test.ts`: Intent URL shapes.

**Test scenarios**

- **iOS medium widget**
  1. Add the medium widget, tap each button.
  - Expected: Chat, camera and voice screens open.
- **Action Button**
  1. On iOS 18 or later assign Open AGI Mobile to the Action Button and press it.
  - Expected: The app opens.
- **Android widget**
  1. Add and resize the widget, tap Voice.
  - Expected: Voice screen opens on API 33 or later; chat tab below.
- **Signed out tap**
  1. Sign out, tap Camera.
  - Expected: Sign-in appears; after sign-in the camera screen opens.
- **Release build**
  1. Build for a device and check the widget target is signed.
  - Expected: Widget extension installs (closes MOBILE-EAS-APP-EXTENSIONS-01).

**Where to look when it fails**

- Xcode plugin errors prefixed 'agi-widgets-ios-plugin:' (withAGIWidgets.cjs).
- Android: receiver '.native.AGIQuickActionsWidget' in the manifest (withAGIWidget.cjs).

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **Brief says home-screen widget missing on mobile, but widgets exist in code** Affects: Brief and status readers. Evidence: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift; AGIQuickActionsWidget.kt. Work needed: Correct the brief after a device check.
- **Widget target signing under EAS unverified** Affects: Mobile release. Evidence: audit/registers/known-flaws.md:315. Work needed: Device build and record.
- **No lock-screen content widget; only the iOS control** Affects: iOS users. Evidence: AGIWidgets.swift:90-99. Work needed: Decide scope for S109.02.
- **No desktop widget or macropad support** Affects: Desktop. Evidence: brief S109.01, S109.11. Work needed: Product decision.
- **No file records a device run of the widgets** Affects: all mobile. Evidence: none found. Work needed: Drive on device and record.
- Not built on: Desktop, Chrome (from the capability ledger).

**Depends on**

- surface:mobile
- file:apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift
- file:apps/mobile/native/android/widget/AGIQuickActionsWidget.kt
- file:apps/mobile/app/_layout.tsx
- SYS-voice-and-media
- SYS-shared-ui-and-design
- SYS-authentication-and-identity
- F109-04
- F109-06

## Unknown

- Whether the widget builds and installs through EAS (no run record).
- Whether Android widget appears on all launchers.
- Camera screen behaviour in Local mode (not read).
- Whether the iOS display name resolves to 'AGI Mobile' on device (Info.plist copy step only read).
