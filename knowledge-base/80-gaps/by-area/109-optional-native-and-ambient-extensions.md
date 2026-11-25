---
id: "GAPS-AREA-109"
type: "gap-list"
title: "Gaps: Optional native and ambient extensions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 109. Optional native and ambient extensions

86 open gaps that touch this area. Area page: [20-features/109-optional-native-and-ambient-extensions](../../20-features/109-optional-native-and-ambient-extensions/README.md).

## CMP-D101

**Hardware control keys: Work Louder Micro keyboard**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Detail: No hardware keyboard support exists.
- Evidence: searched: Work Louder, Micro, agent keys in apps/desktop

## CMP-D95

**Admin switch to disable window sharing (Appshots)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: The governed features list has no switch for sharing the front window.
- Evidence: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:35-50

## CMP-D98

**Apple Intelligence, Siri, Writing Tools and Visual Intelligence**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: No Apple Intelligence or Siri integration exists.
- Evidence: searched: Siri, Apple Intelligence, Writing Tools in apps/desktop, apps/mobile

## CMP-DP100

**Attach a screenshot from the quick shortcut**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md), [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: You cannot drag a region, and it hides Quick Ask instead of attaching there Screenshot to Chat captures the whole display under the pointer and pastes it into the main chat; you cannot drag a region, and it hides Quick Ask instead of attaching there.
- Evidence: apps/desktop/electron/screenshot.ts:111-175 (captureToChat); apps/desktop/electron/main.ts:1916

## CMP-DP97

**Share the front window with chat (Appshot, click a window)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: Only on Mac (it needs the computer-use input helper) and pastes into the main window Window to Chat grabs the front app window with a chord, but only on Mac (it needs the computer-use input helper) and pastes into the main window.
- Evidence: apps/desktop/electron/screenshot.ts:63-110; apps/desktop/electron/runtime/computerUseService.ts:392-401; apps/desktop/electron/main.ts:1917

## CMP-M143

**Apple Intelligence Writing Tools and Visual Intelligence**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: No Writing Tools or Visual Intelligence entry; the only mention is a code comment, with no search or image-query API.
- Evidence: searched: WritingTools, visualIntelligence, IntentValueQuery, SemanticContentDescriptor in apps/mobile/native, src, app.config.js

## CMP-M145

**CarPlay voice**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md), [F109-99](../../20-features/109-optional-native-and-ambient-extensions/F109-99-other-items.md)
- Detail: No CarPlay support.
- Evidence: searched: CarPlay, CPTemplate in apps/mobile/native, src, app.config.js

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

## GAP-CAP-apps-and-install-15

**Global shortcut quick chat: none known on Mac; unverified elsewhere.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-03](../../20-features/070-desktop-application/F070-03-global-shortcuts.md), [F070-04](../../20-features/070-desktop-application/F070-04-window-management.md), [F109-03](../../20-features/109-optional-native-and-ambient-extensions/F109-03-compact-floating-quick-ask-panel.md)
- Requirement items: S109.05, S70.05, S70.06, S70.07
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-apps-and-install-17

**Screenshot and window sharing to chat: Window capture Mac only; no admin switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Requirement items: S109.09, S109.10, S70.19
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-21

**iPhone widgets, Lock Screen control and Action button: No Live Activity; no Analyze Photo control. Ledger rows need correcting.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md), [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Requirement items: S109.01, S109.02, S71.20, S71.21, S71.22
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-apps-and-install-23

**Siri, Shortcuts, Spotlight and Apple Intelligence: No Apple Intelligence integration. Ledger S71.23 says not applicable but shortcuts exist.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Requirement items: S109.13, S71.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-26

**Car and in-car voice: Not built by design or not decided.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F109-99](../../20-features/109-optional-native-and-ambient-extensions/F109-99-other-items.md)
- Requirement items: S109.14
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-apps-and-install-29

**Hardware controls and macropads: Desktop hardware not built; decision pending.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Requirement items: S109.11
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-30

**Local model install and storage on the device: Desktop local model management and explicit cloud-escalation approval are missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md), [F071-09](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md), [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md), [F109-09](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md), [F109-11](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Requirement items: S109.18, S109.19, S109.20, S109.21, S109.22, S109.23, S109.24, S70.23, S71.28, S71.30
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-F109-01-01

**Top-level menu shows keys for four items only; New Chat and Stop Agents show none**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-01](../../20-features/109-optional-native-and-ambient-extensions/F109-01-menu-bar-quick-menu-desktop.md)
- Detail: Affects: Desktop users reading the menu. Work needed: Add accelerator display to New Chat and Stop item or document it.
- Evidence: apps/desktop/electron/tray.ts:169-196

## GAP-F109-01-02

**Conflict notification is sent once per pass, so a second failed key is silent beyond its heading**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-01](../../20-features/109-optional-native-and-ambient-extensions/F109-01-menu-bar-quick-menu-desktop.md)
- Detail: Affects: Desktop users with several clashing keys. Work needed: Decide whether one notice is enough; brief says 'a notification explains it'.
- Evidence: apps/desktop/electron/shortcuts.ts:42,56-57

## GAP-F109-01-03

**Tauri tray not checked**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-01](../../20-features/109-optional-native-and-ambient-extensions/F109-01-menu-bar-quick-menu-desktop.md)
- Detail: Affects: Retained internal Tauri build. Work needed: Read and record parity or retire it.
- Evidence: apps/desktop/src-tauri/src/ui/tray.rs:11

## GAP-F109-01-04

**Windows and Linux tray not recorded as run by any file**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-01](../../20-features/109-optional-native-and-ambient-extensions/F109-01-menu-bar-quick-menu-desktop.md)
- Detail: Affects: Desktop on Windows and Linux. Work needed: Run on each OS and record.
- Evidence: no run record found

## GAP-F109-01-NOTBUILT

**Menu-bar quick menu (desktop): not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F109-01](../../20-features/109-optional-native-and-ambient-extensions/F109-01-menu-bar-quick-menu-desktop.md)
- Requirement items: S109.03
- Detail: Mobile: S109.03

## GAP-F109-02-01

**Window to Chat is macOS-only in practice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: Affects: Desktop on Windows and Linux. Work needed: Implement a window source lookup or hide the control and say so in settings.
- Evidence: apps/desktop/electron/runtime/computerUseService.ts:226-235,392-394

## GAP-F109-02-02

**No window picker; the brief wording is 'one chosen window'**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: Affects: Desktop users. Work needed: Product decision: front-window is acceptable or add a picker.
- Evidence: apps/desktop/electron/screenshot.ts:157

## GAP-F109-02-03

**Chrome key captures the visible tab, not the screen, and needs paired Desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: Affects: Chrome users without Desktop. Work needed: Document or add a stand-alone path.
- Evidence: apps/extension/src/background.ts:7765,7792

## GAP-F109-02-04

**No run record of any capture on a real machine**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: Affects: all. Work needed: Drive the app and record results.
- Evidence: no verification file found

## GAP-F109-03-01

**No error UI when the panel page fails to load**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-03](../../20-features/109-optional-native-and-ambient-extensions/F109-03-compact-floating-quick-ask-panel.md)
- Detail: Affects: Desktop users offline. Work needed: Show a retry message in the panel or on the window.
- Evidence: apps/desktop/electron/quickAsk.ts:93-95,152-156

## GAP-F109-03-02

**Mobile has no floating assistant**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-03](../../20-features/109-optional-native-and-ambient-extensions/F109-03-compact-floating-quick-ask-panel.md)
- Detail: Affects: Mobile users. Work needed: Product decision; not traced by code search.
- Evidence: brief S109.05 status

## GAP-F109-03-03

**Local inference not reachable from the Quick Ask panel in the code read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-03](../../20-features/109-optional-native-and-ambient-extensions/F109-03-compact-floating-quick-ask-panel.md)
- Detail: Affects: Desktop users in Local mode. Work needed: Trace the compact chat for Local mode and fix or document.
- Evidence: apps/desktop/electron/quickAsk.ts:9-10

## GAP-F109-03-NOTBUILT

**Compact floating Quick Ask panel: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F109-03](../../20-features/109-optional-native-and-ambient-extensions/F109-03-compact-floating-quick-ask-panel.md)
- Requirement items: S109.05
- Detail: Mobile: S109.05

## GAP-F109-04-01

**Docs say the Quick Ask panel has no preload and that no window means a tray-open notice; code now attaches the preload and surfaces Quick Ask**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-04](../../20-features/109-optional-native-and-ambient-extensions/F109-04-global-dictation-from-anywhere-desktop-and-phone.md)
- Detail: Affects: Engineers and testers reading docs. Work needed: Correct both documents.
- Evidence: docs/specs/desktop-global-voice/spec.md; docs/decisions/wire-or-cut.md:706 versus apps/desktop/electron/voiceDictation.ts:51-57

## GAP-F109-04-02

**Mobile has no system-level dictation start; only a widget or shortcut opens the voice screen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-04](../../20-features/109-optional-native-and-ambient-extensions/F109-04-global-dictation-from-anywhere-desktop-and-phone.md)
- Detail: Affects: Mobile users. Work needed: Product decision on a Siri or hardware path.
- Evidence: apps/mobile/app/_layout.tsx:219-224

## GAP-F109-04-03

**Desktop dictation needs cloud transcription; no Local path found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-04](../../20-features/109-optional-native-and-ambient-extensions/F109-04-global-dictation-from-anywhere-desktop-and-phone.md)
- Detail: Affects: Local-mode desktop users. Work needed: Establish and document Local behaviour.
- Evidence: apps/web/features/chat/stores/voice-input-store.ts:231

## GAP-F109-04-04

**Chrome has no global dictation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-04](../../20-features/109-optional-native-and-ambient-extensions/F109-04-global-dictation-from-anywhere-desktop-and-phone.md)
- Detail: Affects: Chrome users. Work needed: Product decision.
- Evidence: brief S109.07

## GAP-F109-04-05

**Brief cites a wrong mobile file**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-04](../../20-features/109-optional-native-and-ambient-extensions/F109-04-global-dictation-from-anywhere-desktop-and-phone.md)
- Detail: Affects: Brief readers. Work needed: Correct the brief.
- Evidence: apps/mobile/app/_layout.tsx:567-579 is app lock reset

## GAP-F109-04-NOTBUILT

**Global dictation from anywhere (desktop and phone): not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F109-04](../../20-features/109-optional-native-and-ambient-extensions/F109-04-global-dictation-from-anywhere-desktop-and-phone.md)
- Requirement items: S109.07
- Detail: Chrome: S109.07

## GAP-F109-05-01

**Brief says home-screen widget missing on mobile, but widgets exist in code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Detail: Affects: Brief and status readers. Work needed: Correct the brief after a device check.
- Evidence: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift; AGIQuickActionsWidget.kt

## GAP-F109-05-02

**Widget target signing under EAS unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Detail: Affects: Mobile release. Work needed: Device build and record.
- Evidence: audit/registers/known-flaws.md:315

## GAP-F109-05-03

**No lock-screen content widget; only the iOS control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Detail: Affects: iOS users. Work needed: Decide scope for S109.02.
- Evidence: AGIWidgets.swift:90-99

## GAP-F109-05-04

**No desktop widget or macropad support**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Detail: Affects: Desktop. Work needed: Product decision.
- Evidence: brief S109.01, S109.11

## GAP-F109-05-05

**No file records a device run of the widgets**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Detail: Affects: all mobile. Work needed: Drive on device and record.
- Evidence: none found

## GAP-F109-05-NOTBUILT

**Phone home-screen widgets and hardware button: not built on Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, Chrome
- Features: [F109-05](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Requirement items: S109.01, S109.11
- Detail: Desktop: S109.01, S109.11; Mobile: S109.01; Chrome: S109.11

## GAP-F109-06-01

**Local-mode leftover: Ask from Siri still reaches AGI Cloud after switching to Local**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: Affects: Mobile iOS users who care about the Local trust boundary. Work needed: Owner decision, then turn off or revoke on mode change.
- Evidence: audit/registers/known-flaws.md:342; AskAGIIntent.swift (does not know the app mode)

## GAP-F109-06-02

**Server does not check or record the provider-sharing permission**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: Affects: Mobile iOS users who withdraw sharing. Work needed: Store the permission server-side and check it on the ask route.
- Evidence: audit/registers/known-flaws.md:205

## GAP-F109-06-03

**No headset or earbud button code; only Siri voice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: Affects: Users wanting a button start. Work needed: Product decision and native work.
- Evidence: no media-button handling under apps/mobile/native

## GAP-F109-06-04

**No Android, desktop or Chrome equivalent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: Affects: Android, Desktop, Chrome users. Work needed: Product decision.
- Evidence: brief S109.13

## GAP-F109-06-05

**Token rotation and revoke races only source-reviewed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: Affects: Mobile iOS sign-out and switching. Work needed: Device acceptance run.
- Evidence: audit/registers/known-flaws.md:292-293,343

## GAP-F109-06-06

**No file records a real Siri run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: Affects: all. Work needed: Run on device and record.
- Evidence: none found

## GAP-F109-06-NOTBUILT

**Siri and headset invocation (phone): not built on Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Requirement items: S109.13
- Detail: Desktop: S109.13

## GAP-F109-07-01

**Phone side is switched off, so the feature cannot be used end to end in the shipped build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-07](../../20-features/109-optional-native-and-ambient-extensions/F109-07-desktop-companion-pairing-phone-controls-desktop-w.md)
- Detail: Affects: Mobile users and the Desktop/VS Code owners who pair.. Work needed: Decide the release, turn on both flags, then run the full pairing on a real phone.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:12,16

## GAP-F109-07-02

**The brief says mobile is 'done' for S109.04 but the flags are false; the brief's DrawerContent citation is not a companion entry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-07](../../20-features/109-optional-native-and-ambient-extensions/F109-07-desktop-companion-pairing-phone-controls-desktop-w.md)
- Detail: Affects: Anyone reading the brief status.. Work needed: Correct the brief status to hidden.
- Evidence: area brief S109.04; DrawerContent.tsx:130, :585

## GAP-F109-07-03

**No list of paired phones or per-phone revoke was found; only Stop or Disconnect.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-07](../../20-features/109-optional-native-and-ambient-extensions/F109-07-desktop-companion-pairing-phone-controls-desktop-w.md)
- Detail: Affects: Users with more than one phone.. Work needed: Add device list and revoke if required.
- Evidence: RemoteControlSection.tsx:296-316

## GAP-F109-07-04

**No evidence the revoke 'takes effect on the next request' as the registry requires; only the standing recheck route exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-07](../../20-features/109-optional-native-and-ambient-extensions/F109-07-desktop-companion-pairing-phone-controls-desktop-w.md)
- Detail: Affects: All paired users.. Work needed: Verify with a live test.
- Evidence: feature-registry.json:175-198; apps/web/app/api/pair/standing/route.ts

## GAP-F109-07-05

**No Chrome or CLI initiator; Chrome and CLI are n/a in the brief.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-07](../../20-features/109-optional-native-and-ambient-extensions/F109-07-desktop-companion-pairing-phone-controls-desktop-w.md)
- Detail: Affects: CLI and Chrome users.. Work needed: None unless product wants it.
- Evidence: area brief status

## GAP-F109-08-01

**Resume after cancel is not proven; the resume file is written only on error.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md)
- Detail: Affects: Mobile users cancelling large downloads.. Work needed: Test cancel then retry on a device and fix if it restarts.
- Evidence: modelDownload.ts:303-311, :341-388

## GAP-F109-08-02

**No in-use check before deleting a GGUF model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md)
- Detail: Affects: Mobile users deleting a loaded model.. Work needed: Check loadedLocalModel() and block with the busy message.
- Evidence: modelDownload.ts:633-670

## GAP-F109-08-03

**No CLI or VS Code on-device model library.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md)
- Detail: Affects: CLI and VS Code users.. Work needed: Decide whether on-device models belong to these surfaces; otherwise record the brief as n/a.
- Evidence: area brief S109.18, S109.19; apps/cli/src/lib.rs:1861-1887

## GAP-F109-08-04

**Sizes are catalog estimates, not measured per model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md)
- Detail: Affects: Mobile users.. Work needed: Measure folders.
- Evidence: storage.tsx:409-440

## GAP-F109-08-05

**No evidence of background or foreground-service downloads on app close.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md)
- Detail: Affects: Mobile users.. Work needed: Verify on device.
- Evidence: modelDownload.ts (no background task code)

## GAP-F109-08-NOTBUILT

**On-device model library (download, storage, delete): not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md)
- Requirement items: S109.18, S109.19
- Detail: CLI: S109.18, S109.19; VS Code: S109.18, S109.19

## GAP-F109-09-01

**No on-device load, unload or hardware panel in CLI or VS Code, and the brief marks health as done there from lines that are about local servers or chat state.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-09](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md)
- Detail: Affects: CLI and VS Code users and the accuracy of the brief.. Work needed: Correct the brief; decide product scope.
- Evidence: apps/cli/src/local_models.rs:175-290; apps/extension-vscode ChatStateManager.ts:1441, :3863

## GAP-F109-09-02

**Thermal state has two values only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-09](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md)
- Detail: Affects: Mobile users.. Work needed: Read the OS level.
- Evidence: performanceMonitor.ts:42-44

## GAP-F109-09-03

**No accelerator list beyond runtime names (the brief asks for accelerators).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-09](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md)
- Detail: Affects: Mobile users.. Work needed: Decide what to show.
- Evidence: performance.tsx:680-690

## GAP-F109-09-04

**No explicit runtime health or last-error view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-09](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md)
- Detail: Affects: Mobile users diagnosing failures.. Work needed: Add or accept the current status text.
- Evidence: performance.tsx (no such section)

## GAP-F109-09-NOTBUILT

**On-device runtime controls and health: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F109-09](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md)
- Requirement items: S109.20, S109.21, S109.22
- Detail: CLI: S109.20, S109.21, S109.22; VS Code: S109.20, S109.21, S109.22

## GAP-F109-10-01

**No CLI or VS Code dashboard.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-10](../../20-features/109-optional-native-and-ambient-extensions/F109-10-on-device-performance-dashboard.md)
- Detail: Affects: CLI and VS Code users.. Work needed: Decide scope; local-server speed could be shown for Ollama and LM Studio.
- Evidence: area brief S109.25

## GAP-F109-10-02

**No model id per event, no per-model view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-10](../../20-features/109-optional-native-and-ambient-extensions/F109-10-on-device-performance-dashboard.md)
- Detail: Affects: Mobile users comparing models.. Work needed: Add the field.
- Evidence: performanceMonitor.ts:6-12

## GAP-F109-10-03

**Memory is the whole-app figure.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-10](../../20-features/109-optional-native-and-ambient-extensions/F109-10-on-device-performance-dashboard.md)
- Detail: Affects: Mobile users reading the number as model cost.. Work needed: Label it or measure the runtime.
- Evidence: AGIFoundationModels.swift:117-129; AGIAICoreModule.kt:85-89

## GAP-F109-10-04

**Brief says peak memory stays 0; code now samples it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-10](../../20-features/109-optional-native-and-ambient-extensions/F109-10-on-device-performance-dashboard.md)
- Detail: Affects: Accuracy of the brief.. Work needed: Update the brief and verify on a real device.
- Evidence: chatExecutionStore.ts:3094

## GAP-F109-10-05

**No way to clear data.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-10](../../20-features/109-optional-native-and-ambient-extensions/F109-10-on-device-performance-dashboard.md)
- Detail: Affects: Mobile users.. Work needed: Add control or confirm 'Delete everything' covers it.
- Evidence: performanceMonitor.ts:116 (no caller)

## GAP-F109-10-NOTBUILT

**On-device performance dashboard: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F109-10](../../20-features/109-optional-native-and-ambient-extensions/F109-10-on-device-performance-dashboard.md)
- Requirement items: S109.25
- Detail: CLI: S109.25; VS Code: S109.25

## GAP-F109-10-PARTLY

**On-device performance dashboard: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F109-10](../../20-features/109-optional-native-and-ambient-extensions/F109-10-on-device-performance-dashboard.md)
- Requirement items: S109.25
- Detail: Mobile S109.25: tok/s, first-token latency and thermal state now recorded for every local reply; peak memory stays 0 because no runtime reports it and no memory sampler is installed (needs a native module or an approved dependency)

## GAP-F109-11-01

**Hybrid local and cloud mode is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-11](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Detail: Affects: Mobile, CLI and VS Code local-model users.. Work needed: Design the run split, routing, metering and transcript labelling.
- Evidence: area brief S109.23

## GAP-F109-11-02

**Cloud-escalation approval is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-11](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Detail: Affects: Same users.. Work needed: Build a consent dialog meeting AGENTS.md sections 6 and 9, with a record of consent.
- Evidence: area brief S109.24

## GAP-F109-11-03

**No product decision found on which surface goes first.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-11](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Detail: Affects: Planning.. Work needed: Search docs/product and docs/decisions and decide.
- Evidence: no document under docs/product or docs/decisions was read for this

## GAP-F109-11-NOTBUILT

**Hybrid local and cloud task, and approval before cloud escalation: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F109-11](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Requirement items: S109.23, S109.24
- Detail: Mobile: S109.23, S109.24; CLI: S109.23, S109.24; VS Code: S109.23, S109.24

## GAP-F109-12-01

**Slack is built in code but not usable until the owner creates the Slack app, sets secrets and applies migrations.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Detail: Affects: All web users; Slack teams.. Work needed: Owner setup, then a live run.
- Evidence: area brief S109.16; docs/runbooks/connector-oauth-apps.md:296-320; slack-config.ts:62-70

## GAP-F109-12-02

**Brief evidence for S109.16 points to the GitHub review webhook, not Slack.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Detail: Affects: Accuracy of the brief.. Work needed: Correct the brief to cite the Slack route and lib.
- Evidence: apps/web/app/api/github/webhook/route.ts:253

## GAP-F109-12-03

**No Teams, WhatsApp or Telegram access.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Detail: Affects: Web users on those platforms.. Work needed: Product decision and build.
- Evidence: no route found

## GAP-F109-12-04

**No lock-screen widget, selected-text rewrite, wearable voice, telephone or spatial interface.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Detail: Affects: Mobile and Desktop users.. Work needed: Product decision and build; the iOS 18 control is a starting point for the lock screen.
- Evidence: area brief S109.02, S109.08, S109.12, S109.15, S109.17

## GAP-F109-12-05

**Brief says home-screen widgets are missing on mobile (S109.01) while the iOS widget code exists; the brief rates it differently from code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Detail: Affects: Accuracy of the brief (outside this feature's item list).. Work needed: Recheck S109.01 status.
- Evidence: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77-87

## GAP-F109-12-NOTBUILT

**Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial): not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Requirement items: S109.02, S109.08, S109.12, S109.15, S109.17
- Detail: Web: S109.15; Desktop: S109.08; Mobile: S109.02, S109.12, S109.17

## GAP-F109-12-PARTLY

**Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial): partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F109-12](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Requirement items: S109.16
- Detail: Web S109.16: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy

## GAP-F109-99-01

**No animated pet or companion character**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-99](../../20-features/109-optional-native-and-ambient-extensions/F109-99-other-items.md)
- Detail: Affects: All six apps; users who want a personalised character (competitor ChatGPT has one). Work needed: Deliberately declined; only reopen on an owner decision, then design, build in shared UI and add a setting.
- Evidence: audit/registers/ui-gaps.csv:340

## GAP-F109-99-02

**No CarPlay or Android Auto voice surface**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F109-99](../../20-features/109-optional-native-and-ambient-extensions/F109-99-other-items.md)
- Detail: Affects: Mobile users (iOS and Android) who drive. Work needed: Strategy decision, platform entitlements, a voice-only driving UI, and safety review.
- Evidence: audit/registers/capability-gaps.csv:3; doc: docs/research/claude-chatgpt-comparison-2026-11-18.md
