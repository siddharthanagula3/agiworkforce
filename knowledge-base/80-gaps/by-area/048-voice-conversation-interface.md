---
id: "GAPS-AREA-048"
type: "gap-list"
title: "Gaps: Voice conversation interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 48. Voice conversation interface

111 open gaps that touch this area. Area page: [20-features/048-voice-conversation-interface](../../20-features/048-voice-conversation-interface/README.md).

## CMP-C714

**Auto-send the transcript on key release**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: After transcription we always ask to send, edit, re-record or discard; there is no auto-send option.
- Evidence: apps/cli/src/voice.rs:555-600

## CMP-C715

**Dictation inside agent view for background sessions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Voice works only in the main prompt, not a background-session panel.
- Evidence: searched: voice in apps/cli/src/repl, remote_control

## CMP-C716

**Rebind the dictation key**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: The dictation key is fixed to Space.
- Evidence: apps/cli/src/voice.rs:574

## CMP-C717

**Transcription tuned for code with project hints**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Transcription sends only audio and a language code, with no project or coding hints.
- Evidence: apps/cli/src/voice.rs:1015-1040

## CMP-CP20

**Push-to-talk voice dictation**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: It is a command, not a Space hold-to-talk key /voice records and transcribes a prompt; it is a command, not a Space hold-to-talk key.
- Evidence: apps/cli/src/voice.rs:1; apps/cli/src/tui/tui_app.rs:6293

## CMP-CP368

**Dictation does not count against usage**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: No code shows it is excluded from usage, so unverified Managed transcription runs on the signed-in account; no code shows it is excluded from usage, so unverified.
- Evidence: apps/cli/src/voice.rs:994

## CMP-CP369

**Linux audio fallback recorders and diagnostics**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Have no arecord or SoX fallback We capture through the system audio library with a device check and clear errors, but have no arecord or SoX fallback.
- Evidence: apps/cli/src/voice.rs:529,324

## CMP-CP370

**Tap-to-toggle recording mode and a saved voice setting**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-04](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md), [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: There is no tap mode or saved voice setting Our recording is hold Space or press Enter to stop, capped at 120 seconds; there is no tap mode or saved voice setting.
- Evidence: apps/cli/src/voice.rs:37,556,737-755

## CMP-CP51

**Dictation languages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md), [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Detail: It lacks Greek, Indonesian and Ukrainian that Claude lists Ours has 20 dictation languages set by --voice-lang or /voice; it lacks Greek, Indonesian and Ukrainian that Claude lists.
- Evidence: apps/cli/src/voice_languages.rs:8

## CMP-D161

**Screen context: voice sees your front window on request**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Live voice cannot capture your screen or front window; the screenshot shortcut goes to a chat, not to a voice session.
- Evidence: searched: appshot, screen context in apps/web/features/chat, apps/desktop/electron; apps/desktop/electron/garnishCore.ts:89

## CMP-D162

**Voice works while using other apps (Work with Apps)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Voice has no link to other apps' windows; only the dictation bar types into another app.
- Evidence: searched: work with apps in apps/desktop/electron, apps/web/features; apps/desktop/electron/dictationElsewhere.ts

## CMP-DP135

**Voice conversation that works across Chat, Work and Code**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: It does not exist in Code: grep for voice in apps/web/features/code/components/CodeComposer.tsx finds nothing, and the… Live voice runs in chat and can start a Work task (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:140; apps/web/features/chat/lib/live-voice-session.ts:541). It does not exist in Code: grep for voice in apps/web/features/code/components/CodeComposer.tsx finds nothing, and the voice ses
- Evidence: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:140; apps/web/features/chat/lib/live-voice-session.ts:541

## CMP-DP136

**Voice starts, checks and steers other tasks**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: It cannot check on or steer other existing tasks or switch to them Voice can start a Work task and see its result in the chat, but it cannot check on or steer other existing tasks or switch to them.
- Evidence: apps/web/features/chat/lib/live-voice-session.ts:741; apps/web/lib/voice/live-voice-tools.ts:44

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

## CMP-M190

**CarPlay opens straight into voice mode**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: No CarPlay entry exists.
- Evidence: searched: carplay in native/ios, app.config.js, src

## CMP-M216

**Background conversations switch**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Voice stops when the app leaves the screen or the device locks.
- Evidence: apps/mobile/src/features/settings/voice/index.tsx:380 Foreground conversations only

## CMP-M219

**Camera and screen share in voice**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: No video or screen share in a voice conversation.
- Evidence: searched: camera, screen share in src/features/voice, app/(app)/voice.tsx

## CMP-M222

**Live voice on Lock Screen and Dynamic Island**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: No Live Activity; voice stops when the app leaves the screen.
- Evidence: searched: ActivityKit, Live Activity in apps/mobile/native; settings/voice/index.tsx:380

## CMP-M224

**Phone gesture to start voice**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: No raise-to-ear gesture.
- Evidence: searched: proximity, 'raise to ear', phoneGesture in apps/mobile/src, app

## CMP-M229

**Voice inside a Project using its sources and instructions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Voice screen takes no project; it does not carry project instructions or sources.
- Evidence: searched: project in app/(app)/voice.tsx, src/features/voice

## CMP-MP110

**Add photos or files during a voice conversation**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: The full live voice screen in Cloud has none A plus button on the turn-based voice bar adds attachments; the full live voice screen in Cloud has none.
- Evidence: apps/mobile/src/features/voice/components/VoiceInlineBar.tsx:90; apps/mobile/app/(app)/chat/[id].tsx:2755; searched: attach in LiveVoiceBar.tsx

## CMP-MP114

**Voice starts and steers Work tasks**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: Cannot check or steer other threads Voice can start an agi_work task, but cannot check or steer other threads.
- Evidence: apps/mobile/src/features/voice/services/liveVoiceSession.ts:8; packages/contracts/cloud-contracts/src/live-voice-tools.ts:53

## CMP-MP74

**Ask by voice through Siri**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md), [F071-08](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md), [F109-06](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Detail: AGI is not a Siri or Apple Intelligence extension App Shortcuts give Siri phrases such as Ask AGI, and Ask from Siri (in Security and login) answers without opening the app. AGI is not a Siri or Apple Intelligence extension.
- Evidence: apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift:27; apps/mobile/src/features/siri/AskFromSiriSetting.tsx:19

## CMP-W470

**Screen and video sharing in voice**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Voice takes the microphone and attachments only; screen share is not wired to voice.
- Evidence: searched: getDisplayMedia in apps/web/features/chat (feedback dialog only)

## CMP-WP118

**Voice mode in many languages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md), [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Detail: Voice has a language picker, but it offers 17 languages Voice has a language picker, but it offers 17 languages.
- Evidence: apps/web/features/settings/sections/VoiceSection.tsx:50,94; packages/ui/i18n/src/languages.ts

## CMP-WP348

**Voice that creates documents, slides and spreadsheets (Voice in Work)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: No voice-started Work task handoff Voice calls tools with approval on screen, but no voice-started Work task handoff.
- Evidence: apps/web/lib/voice/live-voice-tools.ts:241,441

## CMP-WP349

**Hands-free and push-to-talk choices**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F048-04](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md), [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Detail: No push-to-talk Hands-free live sessions only; no push-to-talk.
- Evidence: searched: push to talk, hold to talk in apps/web/features/chat, packages/ui/unified-chat/src

## CMP-WP350

**Setting to run voice in its own separate screen instead of inside the chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md), [F048-02](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md), [F048-08](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)
- Detail: There is no setting for a separate voice screen Voice runs docked in the chat with captions; there is no setting for a separate voice screen.
- Evidence: apps/web/features/chat/components/Voice/VoiceChatDock.tsx:24-25; searched: separate, overlay, fullscreen in apps/web/features/settings/sections/VoiceSection.tsx

## GAP-AREA048-LW02

**Pause ends the live link on web, while the Should says pause keeps the conversation without ending it. The resume path is not fully traced.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-048
- Detail: Area 48. Voice conversation interface
- Evidence: apps/web/features/chat/hooks/use-voice-session.ts:942-955

## GAP-AREA048-LW05

**Live voice always uses the default microphone. A microphone choice exists for dictation, but the live session does not pass a device id.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-048
- Detail: Area 48. Voice conversation interface
- Evidence: apps/web/features/chat/lib/live-voice-session.ts:480-483; apps/web/features/chat/stores/voice-input-store.ts:282

## GAP-AREA048-LW06

**Mobile and web end the live session when the app or page goes to the background. This matches the missing background setting, but it means voice cannot continue in background at all.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-048
- Detail: Area 48. Voice conversation interface
- Evidence: apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:486-490; apps/web/features/chat/hooks/use-voice-session.ts:926

## GAP-AREA048-LW07

**A session cannot start without a conversation id. The Should says a new conversation is created for the control, so the client must create it first.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-048
- Detail: Area 48. Voice conversation interface
- Evidence: apps/web/app/api/voice/live/sessions/route.ts:254-262

## GAP-CAP-voice-01

**Live voice conversation: Live voice is cloud-only with one managed provider; no BYOK or Local path; VS Code absent (the product matrix says a VS Code webview has no microphone); Chrome has dictation but no conversation. The ledger says CLI done for S48.01-03; the comparison row describes only dictat**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md), [F048-02](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Requirement items: S48.01, S48.02, S48.03, S48.04
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-voice-02

**Voice and text in one thread: No setting for a separate voice screen on web (WP350). The ledger marks 'type while speaking' not applicable, while the comparison and the browser run show typing in voice works; the ledger row is out of date.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md), [F048-02](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md), [F048-08](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)
- Requirement items: S48.03, S48.22, S48.38, S48.39
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-voice-03

**Hands-free and push-to-talk modes: No push-to-talk on web or desktop live voice; CLI has no tap mode or saved voice setting.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-04](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md), [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Requirement items: S48.12, S48.13
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-voice-04

**Interrupt the assistant while it speaks: Not verified by a person; interruption delay never measured (W13 asks for it).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Requirement items: S48.14, S48.41
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-voice-05

**Voice choice with preview: Sample manifest is empty until the owner runs scripts/generate-voice-samples.mjs and commits the files (ledger S48.16).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Requirement items: S48.15, S48.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-voice-07

**Voice and spoken language setting: Web lists 17 languages (WP118); CLI lacks Greek, Indonesian and Ukrainian (CP51); no voices tied to a language (MP113).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md), [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Requirement items: S48.17, S49.03
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-voice-09

**Tools, search and connectors inside voice, with on-screen approval: Mobile cannot open a generated document from voice (S48.28).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-09](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Requirement items: S48.26, S48.27, S48.28
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-voice-10

**Files, images and Projects in voice: Mobile live screen lacks attachments (MP110) and Projects (M229). Voice replies cannot show images or maps (S48.25). The ledger still lists attach-image as missing on web and desktop, which the code now contradicts.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Requirement items: S48.25, S48.29
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-voice-12

**Voice usage limits and metering: A person saw the Settings > Usage Voice row say 'No voice left until a limit above resets' while limits were not used (defect W-19, Basic and Premium accounts). Per-minute rate was not read from a catalog value in the comparison note.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-10](../../20-features/048-voice-conversation-interface/F048-10-reconnection-and-usage-limit.md)
- Requirement items: S48.37
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-voice-13

**Voice that starts and steers tasks: No voice check or steer of existing tasks; not in Code (DP135).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Requirement items: S48.40
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-voice-14

**Screen, camera and video sharing in voice: No screen or camera in voice; no desktop screen context.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Requirement items: S48.30, S48.31, S48.32, S48.33
- Detail: Claude unknown, ChatGPT partly; AGI not built

## GAP-CAP-voice-15

**Background voice, lock screen and car entry: No background setting, lock-screen controls, CarPlay, Live Activity or raise-to-ear.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Requirement items: S48.34, S48.35
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-voice-16

**Voice reliability and error states: Four defects seen in browser: no message when the microphone is denied (W-10 free, major); misleading 'conversation unavailable' toast on microphone failure (subscribed, major, unclear); reload leaves a session open on the server (minor); call time does not reset **

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-10](../../20-features/048-voice-conversation-interface/F048-10-reconnection-and-usage-limit.md)
- Requirement items: S48.36, S48.37
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-voice-20

**Dictation controls in the CLI and coding tools: No tap mode, auto-send, key rebinding, coding hints, agent-view dictation, Linux fallback recorder; usage exclusion unverified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Requirement items: S48.12, S49.01
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-voice-30

**Microphone and speaker choice: Sources disagree for web microphone choice; CLI has none.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-07](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Requirement items: S48.18, S48.19, S48.20
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-F048-01-01

**CLI is not a live voice conversation although the brief marks start and resume as done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Detail: Affects: CLI users; the surface matrix.. Work needed: Correct the brief and matrix, or build a CLI live path.
- Evidence: apps/cli/src/voice.rs:1-12, 176-300; brief S48.01, S48.02, S48.39 cite .github/workflows/release-cli.yml:229 which is a repository checkout step.

## GAP-F048-01-02

**Web and desktop offer no voice for Local or own-key chats.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Detail: Affects: Web, Desktop users in Local or own-key modes.. Work needed: Decide the product answer: stay Cloud only and explain why, or add a consented fork.
- Evidence: WebChatPage.tsx:5906-5910.

## GAP-F048-01-03

**The rejoin choice does not reattach to the earlier session.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Detail: Affects: Web users with two devices.. Work needed: Reword the dialog or reattach.
- Evidence: use-voice-session.ts:868-883; route.ts:642-665.

## GAP-F048-01-04

**VS Code and Chrome have no live voice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Detail: Affects: VS Code and Chrome users.. Work needed: Product decision and build, or mark not planned.
- Evidence: No live voice file found in apps/extension-vscode or apps/extension.

## GAP-F048-01-05

**Docs drift: experience-contract.md lists web voice as dictation only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Detail: Affects: Anyone reading the contract.. Work needed: Update the historical table or its caption.
- Evidence: docs/product/experience-contract.md:641 versus ChatComposerNew.tsx:6955.

## GAP-F048-01-NOTBUILT

**Start or resume a voice conversation: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F048-01](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Requirement items: S48.01, S48.02
- Detail: VS Code: S48.01, S48.02; Chrome: S48.01, S48.02

## GAP-F048-02-01

**CLI captions and transcript are not live; brief says done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-02](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Detail: Affects: CLI users.. Work needed: Correct the brief or add streaming display.
- Evidence: apps/cli/src/voice.rs:226-262.

## GAP-F048-02-02

**Web has no true full-screen voice layout; only an in-page focus fade.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-02](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Detail: Affects: Web and desktop users wanting a separate screen.. Work needed: Decide whether the fade meets S48.04 or build a dedicated view.
- Evidence: WebChatPage.tsx:7664-7672, 7717.

## GAP-F048-02-03

**Captions are limited to four lines and not kept.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-02](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Detail: Affects: People relying on captions for access.. Work needed: Longer history or a scrollable log.
- Evidence: voice-captions.ts:3.

## GAP-F048-02-04

**Offline save of web voice turns is not handled.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-02](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Detail: Affects: Web users with flaky networks.. Work needed: Queue and retry.
- Evidence: WebChatPage.tsx:6760-6780.

## GAP-F048-03-01

**Reduced-motion behaviour of the orb is not verified end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-03](../../20-features/048-voice-conversation-interface/F048-03-listening-speaking-and-working-indicators.md)
- Detail: Affects: Users sensitive to motion.. Work needed: Open the shared orb and add a test.
- Evidence: VoiceModeSurface.tsx:290-299; use-voice-session.ts:742.

## GAP-F048-03-02

**CLI has no speaking or thinking indicator beyond a spinner; brief says done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-03](../../20-features/048-voice-conversation-interface/F048-03-listening-speaking-and-working-indicators.md)
- Detail: Affects: CLI users.. Work needed: Correct the brief.
- Evidence: voice.rs:203, 261, 766.

## GAP-F048-03-03

**Mobile companion speaking level is a constant.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-03](../../20-features/048-voice-conversation-interface/F048-03-listening-speaking-and-working-indicators.md)
- Detail: Affects: Mobile on-device voice users.. Work needed: Drive the level from audio output if available.
- Evidence: useVoiceConversation.ts:setAudioLevel(0.5) in speech start callback.

## GAP-F048-03-04

**No Android announcement path found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-03](../../20-features/048-voice-conversation-interface/F048-03-listening-speaking-and-working-indicators.md)
- Detail: Affects: Android TalkBack users.. Work needed: Verify and add.
- Evidence: voice.tsx:236-239 only iOS.

## GAP-F048-04-01

**Pause closes the call and resume opens a new session, which re-runs admission and billing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-04](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)
- Detail: Affects: Web and mobile live users.. Work needed: Decide whether to keep the brief wording or hold the connection; at minimum disclose it (the web hint does).
- Evidence: use-voice-session.ts:942-959; LiveVoiceComposer.tsx:25-43; route.ts:373-418.

## GAP-F048-04-02

**Mobile pause is not recorded in the brief (it says missing) though the code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-04](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)
- Detail: Affects: Brief accuracy.. Work needed: Update the brief.
- Evidence: LiveVoiceComposer.tsx:25-43; LiveVoiceBar.tsx:231-232.

## GAP-F048-04-03

**No hands-free mode or mute in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-04](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)
- Detail: Affects: CLI.. Work needed: Not applicable until live voice exists.
- Evidence: voice.rs:563-580.

## GAP-F048-04-04

**No background or lock-screen control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-04](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)
- Detail: Affects: Web and mobile.. Work needed: Product decision (brief S48.34, S48.35).
- Evidence: use-voice-session.ts:926-927; useLiveVoiceSession.ts:480-486.

## GAP-F048-04-NOTBUILT

**Microphone and call controls: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F048-04](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)
- Requirement items: S48.13
- Detail: CLI: S48.13

## GAP-F048-05-01

**Web and desktop have no push-to-talk.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Detail: Affects: Web and Desktop users in noisy places.. Work needed: Design and build, or mark not planned.
- Evidence: No code found; brief S48.12.

## GAP-F048-05-02

**Barge-in is not verified on any surface; the web reducer path is unused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Detail: Affects: All live voice users.. Work needed: Run a real call and record whether reply audio stops; wire or remove the helper.
- Evidence: voice-session-machine.ts:156, 301 with no caller; liveVoiceSession.ts:726-731 only reports it.

## GAP-F048-05-03

**No separate 'stop speaking' control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Detail: Affects: Web and mobile live.. Work needed: Add the control or document that mute and stop-task are the only options.
- Evidence: VoiceModeSurface.tsx, LiveVoiceBar.tsx have only stop-task and mute.

## GAP-F048-05-04

**Push-to-talk exists only in the on-device companion, not live voice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Detail: Affects: Mobile live users.. Work needed: Decide scope.
- Evidence: useLiveVoiceSession.ts has no hold handling.

## GAP-F048-05-NOTBUILT

**Push-to-talk and interrupting the reply: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Requirement items: S48.12
- Detail: Web: S48.12; Desktop: S48.12

## GAP-F048-05-PARTLY

**Push-to-talk and interrupting the reply: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Requirement items: S48.14

## GAP-F048-06-01

**Sample manifest is empty so voice preview is hidden on web, desktop and the mobile live picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Detail: Affects: Web, Desktop, Mobile live voice users choosing a voice.. Work needed: Owner runs scripts/generate-voice-samples.mjs and commits the output; add a test that the manifest has all 13 voices.
- Evidence: manifest.json:1-3; VoiceSampleButton.tsx:61; voiceSamples.ts:20-27.

## GAP-F048-06-02

**A voice change cannot take effect mid-call.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Detail: Affects: All live voice users.. Work needed: Explain in the dialog or offer a restart.
- Evidence: live-voice-session.ts:664-672.

## GAP-F048-06-03

**Language is only an instruction, not a recognition setting; brief says applied to recognition.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Detail: Affects: Accuracy for non-English speech.. Work needed: Check provider options for an input language setting and measure.
- Evidence: live-voices.ts:38-41; route.ts:520-530.

## GAP-F048-06-04

**Mobile live voice has no pace control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Detail: Affects: Mobile users.. Work needed: Add pace or document.
- Evidence: liveVoiceSession.ts:345-350 sends voice and language only.

## GAP-F048-06-05

**CLI voice setting is language only and has no spoken voice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Detail: Affects: CLI.. Work needed: None until CLI has spoken replies.
- Evidence: voice.rs:84-97.

## GAP-F048-06-PARTLY

**Voice, language and voice preview: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Requirement items: S48.16
- Detail: Web S48.16: owner: run OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs from the repo root and commit apps/web/public/voice-samples (the manifest is empty, so Play sample stays hidden) | Desktop S48.16: owner: run OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs from the repo root and commit apps/web/public/voice-samples (the manifest is empty, so Play sample stays hidden) | Mobile S48.16: Play sample is built and reads the web manifest; same owner step as web: run scripts/generate-voice-samples.mjs and commit apps/web/public/voice-samples

## GAP-F048-07-01

**No microphone choice for live voice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-07](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Detail: Affects: Web, Desktop, iPhone, CLI users with more than one microphone. Work needed: Pass the saved microphone id into the session's microphone request and add a visible control in voice mode.
- Evidence: apps/web/features/chat/lib/live-voice-session.ts:480-482; apps/mobile/src/features/voice/services/liveVoiceSession.ts:298; apps/cli/src/voice.rs:623-629

## GAP-F048-07-02

**The brief marks Speaker/Bluetooth routing as not applicable everywhere, but iPhone has it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-07](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Detail: Affects: Documentation, testers. Work needed: Correct S48.19/S48.20 statuses in the brief; add Android routing if wanted.
- Evidence: apps/mobile/src/features/voice/services/audioRoute.ts:8-31; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:721

## GAP-F048-07-03

**Web output choice may be lost after reconnect or pause/resume, and refusal is silent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-07](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Detail: Affects: Web and Desktop users on headsets. Work needed: Re-apply the sink on every new session and show a notice on refusal.
- Evidence: apps/web/features/chat/lib/live-voice-session.ts:489; apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:79, 92-95

## GAP-F048-07-04

**The output control lives inside the settings dialog, not on the call screen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-07](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Detail: Affects: Web users. Work needed: Decide whether it should sit on the voice composer; first draft of this page wrongly placed it in VoiceComposer.
- Evidence: apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:407

## GAP-F048-07-05

**CLI has no input device choice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-07](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Detail: Affects: CLI users. Work needed: Add a flag or setting naming an input device.
- Evidence: apps/cli/src/voice.rs:623-629 (error text 'Try specifying an input device explicitly' at 660-661 offers no way to)

## GAP-F048-07-NOTBUILT

**Audio devices (microphone and speaker): not built on Web, Desktop, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI
- Features: [F048-07](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Requirement items: S48.18
- Detail: Web: S48.18; Desktop: S48.18; CLI: S48.18

## GAP-F048-08-01

**Brief says typing during voice and transcript editing are not applicable, but web has a typed field and the CLI has transcript edit**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-08](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)
- Detail: Affects: Testers and documentation. Work needed: Correct S48.23 and S48.24 in the brief.
- Evidence: apps/web/features/chat/components/Voice/VoiceComposer.tsx:101-110; apps/cli/src/voice.rs:238-246

## GAP-F048-08-02

**iPhone live voice cannot be typed into while the call is open**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-08](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)
- Detail: Affects: iPhone users. Work needed: Decide whether the same typed field should exist; otherwise record as intended.
- Evidence: apps/mobile/__tests__/LiveVoiceBar.test.tsx:558; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:704-718

## GAP-F048-08-03

**No way to edit a spoken sentence on web or iPhone**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-08](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)
- Detail: Affects: Web, Desktop, iPhone. Work needed: Optional: edit before send.
- Evidence: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:383-401 only cancels

## GAP-F048-08-04

**Typed submit is forwarded even if the voice state ignores it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-08](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)
- Detail: Affects: Web edge case. Work needed: Confirm and guard if wrong.
- Evidence: apps/web/features/chat/hooks/use-voice-session.ts:1008-1013

## GAP-F048-08-05

**VS Code and Chrome have no live voice, so there is nothing to type alongside**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-08](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)
- Detail: Affects: VS Code, Chrome. Work needed: None unless live voice is planned there.
- Evidence: S48.01 statuses in the brief

## GAP-F048-09-01

**The brief says document open is missing on iPhone, but it exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-09](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Detail: Affects: iPhone, documentation. Work needed: Correct S48.28 to done on iPhone.
- Evidence: apps/mobile/src/features/voice/components/VoiceToolFiles.tsx:37-60; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:505

## GAP-F048-09-02

**The first draft said approvals should be answerable by voice or tap; the code makes them tap only on purpose**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-09](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Detail: Affects: All live voice surfaces. Work needed: Confirm that tap-only is the product decision and update the requirement.
- Evidence: apps/web/lib/voice/live-voice-tools.ts:441-444

## GAP-F048-09-03

**Unverified-claim check is defined but not used by the voice hook**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-09](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Detail: Affects: Web voice users. Work needed: Wire to the UI or delete.
- Evidence: apps/web/features/chat/lib/live-voice-session.ts:144-155, 167; apps/web/features/chat/hooks/use-voice-session.ts:605-679

## GAP-F048-09-04

**Tools the approvals setting asks about every time are withheld in voice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-09](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Detail: Affects: People with strict approval policies. Work needed: Decide whether approvals through the card should apply to them too.
- Evidence: apps/web/lib/voice/live-voice-tools.ts:447-462

## GAP-F048-09-05

**CLI approval and document behaviour in voice not traced; brief cites unrelated lines**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-09](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Detail: Affects: CLI. Work needed: Trace the agent session approval path and record it.
- Evidence: Brief cites .github/workflows/release-cli.yml:229 and apps/cli/src/voice.rs:956 which are a checkout step and a WAV write

## GAP-F048-09-NOTBUILT

**Tool activity, approvals and documents during voice: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F048-09](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Requirement items: S48.28
- Detail: Mobile: S48.28

## GAP-F048-10-01

**iPhone shows no reset time and no Upgrade control in the voice limit notice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-10](../../20-features/048-voice-conversation-interface/F048-10-reconnection-and-usage-limit.md)
- Detail: Affects: iPhone users at a limit. Work needed: Read resets_at and show the same sentence; decide the upgrade path on iPhone.
- Evidence: apps/mobile/src/features/voice/services/liveVoiceSession.ts:158-168 vs apps/web/features/chat/lib/live-voice-session.ts:265-288

## GAP-F048-10-02

**The first draft's mobile citations (LiveVoiceBar.tsx:115, liveVoiceSession.ts:107) do not point at limit or reconnect code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-10](../../20-features/048-voice-conversation-interface/F048-10-reconnection-and-usage-limit.md)
- Detail: Affects: Documentation. Work needed: Use the corrected lines in this page.
- Evidence: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:115 is inside the call clock; reconnect label is at line 173

## GAP-F048-10-03

**No background continuation: calls end on page hide or app background**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-10](../../20-features/048-voice-conversation-interface/F048-10-reconnection-and-usage-limit.md)
- Detail: Affects: All live voice users who switch away. Work needed: Covered by F048-11 (background preference).
- Evidence: apps/web/features/chat/hooks/use-voice-session.ts:926; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:486-490

## GAP-F048-10-04

**Whether usage counted when a call ends by crash is exact depends on the lease and cron; not verified by a run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-10](../../20-features/048-voice-conversation-interface/F048-10-reconnection-and-usage-limit.md)
- Detail: Affects: Billing accuracy. Work needed: Run the abandoned-session scenario and record.
- Evidence: apps/web/lib/voice/live-voice-billing.ts:24-28

## GAP-F048-11-01

**Camera sharing is built but never connected on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Affects: Web users. Work needed: Wire a frame sink (and decide how frames reach the model) or delete the control.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:6841-6854; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:524

## GAP-F048-11-02

**Screen sharing, camera switching, maps, picture-in-picture, background preference, lock-screen controls missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Affects: Web, Desktop, iPhone. Work needed: Design and build per item; each needs usage and privacy decisions.
- Evidence: searches described under not_available; brief S48.25, S48.31-S48.35

## GAP-F048-11-03

**The brief marks attach image missing on web and Desktop, but it exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Affects: Documentation. Work needed: Update S48.29 and S48.25 (images from tools).
- Evidence: apps/web/features/chat/components/Voice/VoiceChatDock.tsx:21; apps/web/features/chat/lib/live-voice-session.ts:709

## GAP-F048-11-04

**iPhone live bar has no attachment control although a founder decision lists photo/file during voice as built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Affects: iPhone live voice users. Work needed: Clarify scope (inline turn-based voice only) or add to live bar.
- Evidence: apps/mobile/__tests__/LiveVoiceBar.test.tsx:558; doc: docs/decisions/2026-11-13-founder-decisions.md:27-30

## GAP-F048-11-05

**Calls always end in the background**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-11](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Detail: Affects: All live voice users. Work needed: Needs a preference and platform audio modes.
- Evidence: use-voice-session.ts:926; useLiveVoiceSession.ts:486-490

## GAP-F048-12-01

**The feature is dictation, not live voice, but the brief describes it as voice control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: Affects: Documentation and testers. Work needed: Reword S48.40.
- Evidence: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:31, 283-299

## GAP-F048-12-02

**Mic button on the remote page may do nothing when dictation is switched off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: Affects: Web users with dictation off. Work needed: Disable with a reason or explain.
- Evidence: apps/web/features/chat/hooks/use-dictation.ts:147; RemoteComputerPage.tsx:383-392

## GAP-F048-12-03

**No mobile control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: Affects: iPhone. Work needed: Decide whether needed; feature is off on mobile in v1.
- Evidence: no remote-dispatch usage in apps/mobile; doc: docs/product/experience-contract.md:641-642

## GAP-F048-12-04

**Remote dictation on the pairing page ignores Local/Cloud mode in the checks read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: Affects: Local-mode users. Work needed: Confirm that audio leaving the device on this page is acceptable and labelled.
- Evidence: RemoteComputerPage.tsx:283-291

## GAP-F048-12-05

**Voice commands are text only; the code does not parse spoken commands specially**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Detail: Affects: Spec wording. Work needed: Not traced further beyond dictation.
- Evidence: RemoteComputerPage.tsx:292-298

## GAP-F048-12-NOTBUILT

**Remote coding session voice control: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F048-12](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Requirement items: S48.40
- Detail: Mobile: S48.40
