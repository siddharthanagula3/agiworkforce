---
id: "GAPS-AREA-049"
type: "gap-list"
title: "Gaps: Dictation, transcription, and recording"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 49. Dictation, transcription, and recording

98 open gaps that touch this area. Area page: [20-features/049-dictation-transcription-and-recording](../../20-features/049-dictation-transcription-and-recording/README.md).

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

## CMP-D158

**Dictation cleanup and custom dictionary**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F049-11](../../20-features/049-dictation-transcription-and-recording/F049-11-spoken-rewrite-of-selected-text.md)
- Detail: Dictation inserts the transcript as heard and has no personal word list or cleanup setting.
- Evidence: apps/web/features/settings/sections/VoiceSection.tsx:128; searched: custom dictionary, vocabulary in apps/web/features, apps/web/app/api/voice

## CMP-D159

**Live dictation: text appears as you speak, no time limit**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md), [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Detail: The desktop dictation bar records and then transcribes, and ends after 10 minutes; nothing is typed while you speak.
- Evidence: apps/desktop/electron/dictationElsewhere.ts:45 (10-minute limit); apps/web/features/desktop-host/components/DictationBar.tsx:19-21

## CMP-D160

**Meeting recorder with summary canvas, speaker labels and calendar join**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md), [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md), [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: There is no meeting or voice-note recorder; dictation is limited to 10 minutes and gives text only.
- Evidence: searched: record meeting, diariz, speaker label in apps/web/features, apps/desktop/electron; apps/desktop/electron/dictationBar.ts

## CMP-D21

**Record meetings and voice notes into a summary (Record mode)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md), [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md), [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: Dictation types speech into the box, but there is no meeting recorder or transcript-and-summary flow.
- Evidence: searched: meeting record, transcript, recorder in apps/desktop/electron and apps/web/features (recorderOverlayWindow.ts is skill capture)

## CMP-D89

**Meetings plugin: notes and action items from meeting speech**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md), [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md), [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: No meeting capture or notes feature exists on desktop.
- Evidence: searched: Meetings, meeting notes in apps/web/features, apps/desktop

## CMP-DP133

**Dictation shortcut that works from any app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Detail: Caps Lock is not offered A global Dictation shortcut (default Option+Shift+V, three presets, or none) opens dictation in AGI; Caps Lock is not offered.
- Evidence: apps/desktop/electron/voiceDictation.ts:52-78; apps/desktop/electron/main.ts:1899-1910; packages/contracts/local-runtime/src/host-bridge.ts:166

## CMP-M181

**Voice data consent sheet (Allow, Not now, close)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md), [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md), [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: No consent sheet on first voice use; voice use for improvement is a switch in Privacy and is off by default.
- Evidence: apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx:64; searched: voice consent in apps/mobile/src/features/voice

## CMP-M227

**Voice data consent sheet**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md), [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Detail: This row and the row Voice data consent sheet (Allow, Not now, close) describe the same Claude sheet and disagree (Partial against Missing). The Meet Voice sheet is only an introduction: its text is Talk with AGI the way you would talk to anyone (apps/mobile/src/features/voice/components/VoiceOnboar
- Evidence: apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx:74

## CMP-MP111

**Privacy settings link from voice**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md), [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Detail: Voice settings link to a How voice works help page, not to privacy settings Voice settings link to a How voice works help page, not to privacy settings.
- Evidence: apps/mobile/src/features/settings/voice/index.tsx:373 help docId voice

## CMP-MP17

**No time limit on dictation**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md), [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Detail: Dictation stops on its own after 60 seconds of listening Dictation stops on its own after 60 seconds of listening.
- Evidence: apps/mobile/src/features/voice/services/voiceInput.ts:68 MAX_LISTEN_MS = 60_000, :443

## CMP-MP95

**Voice recording sharing: ask each time or always allow, and delete shared recordings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md), [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md), [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: There is no per-conversation ask and no button to delete recordings already shared Privacy has one Use my voice switch, off by default. There is no per-conversation ask and no button to delete recordings already shared.
- Evidence: apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx:63-67; searched: delete recording, shared recordings, voice data in apps/mobile/src/features/settings

## CMP-V100

**Voice dictation in the chat panel**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md), [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md), [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Detail: No dictation control in the panel.
- Evidence: searched: voice, dictat, speech, microphone in apps/extension-vscode/src

## CMP-W103

**Audio file upload and transcription**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Audio is not an attachable type in chat.
- Evidence: searched: audio types in packages/contracts/cloud-contracts/src/chat-attachment-policy.json:14-32

## CMP-W302

**Claude Meetings: transcript, summary and notes**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md), [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md), [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: We have no meeting recording, transcript or notes feature on the web.
- Evidence: searched: meeting, transcribe in apps/web/features, apps/web/app

## CMP-WP118

**Voice mode in many languages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md), [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Detail: Voice has a language picker, but it offers 17 languages Voice has a language picker, but it offers 17 languages.
- Evidence: apps/web/features/settings/sections/VoiceSection.tsx:50,94; packages/ui/i18n/src/languages.ts

## CMP-WP49

**Dictation fills the box as you speak (Live Dictation)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md), [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Detail: Text does not appear while speaking Dictation records, then transcribes after you stop; text does not appear while speaking.
- Evidence: apps/web/features/chat/hooks/use-dictation.ts:30-37,204; app/api/voice/transcribe/route.ts

## GAP-AREA049-LW10

**Chrome extension stop and discard: clicking the mic while listening stops and keeps the text; there is no discard that drops the text.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-049
- Detail: Area 49. Dictation, transcription, and recording
- Evidence: apps/extension/src/features/side-panel/voice.ts:136-283 (click handler stops recognition; onresult appends text)

## GAP-CAP-voice-07

**Voice and spoken language setting: Web lists 17 languages (WP118); CLI lacks Greek, Indonesian and Ukrainian (CP51); no voices tied to a language (MP113).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-06](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md), [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Requirement items: S48.17, S49.03
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-voice-17

**Composer dictation into editable text: VS Code has no dictation (V100). Whether web and desktop transcription works in Local mode was not established. A person saw web dictation return text in the wrong language with the test recording; the test instrument may be at fault.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md), [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md), [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Requirement items: S49.01, S49.02, S49.05, S49.06, S49.07, S49.09
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-voice-18

**Live dictation (text appears while speaking): Web and desktop show no text until the recording stops; mobile caps at 60 seconds.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md), [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Requirement items: S49.04, S49.10
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-voice-19

**Dictation languages: CLI lacks three Claude Code languages (CP51).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Requirement items: S49.03
- Detail: Claude yes, ChatGPT partly; AGI built

## GAP-CAP-voice-20

**Dictation controls in the CLI and coding tools: No tap mode, auto-send, key rebinding, coding hints, agent-view dictation, Linux fallback recorder; usage exclusion unverified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F048-05](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md), [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Requirement items: S48.12, S49.01
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-voice-21

**Dictation cleanup and custom dictionary: No custom dictionary or cleanup setting is shown to users.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F049-11](../../20-features/049-dictation-transcription-and-recording/F049-11-spoken-rewrite-of-selected-text.md)
- Requirement items: S49.29
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-voice-22

**System-wide dictation into any app: Sources disagree: the comparison says built, the contract and known-flaws row say unwired. Code wins per AGENTS.md rank 2, but no person has run it. Caps Lock not offered; Windows behaviour unknown.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Requirement items: S49.28
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-voice-24

**Voice recording privacy and training consent: No first-use consent sheet or per-call ask on mobile; no way to delete already-shared recordings; two comparison rows disagree about the consent sheet.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md), [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Requirement items: S49.17, S49.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-voice-27

**Meeting and voice-note recording with notes: No recorder, transcript, summary, speaker labels.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md), [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md), [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Requirement items: S49.12, S49.16, S49.18, S49.20, S49.21, S49.22, S49.23
- Detail: Claude partly, ChatGPT yes; AGI not built

## GAP-CAP-voice-28

**Audio file upload and transcription: Audio cannot be attached in chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Requirement items: S49.08
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-F049-01-01

**Undo of inserted text is not verified in any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Affects: Web, desktop, phone, Chrome. Work needed: Add a test per composer; fix if the inserted text is not undoable.
- Evidence: brief S49.30

## GAP-F049-01-02

**Brief says VS Code dictation missing but code and tests exist; the product matrix doc also says VS Code cannot record.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Affects: VS Code; brief and docs accuracy. Work needed: Correct brief and matrix; run a manual check of the browser-tab recorder.
- Evidence: brief S49.01; ChatStateManager.ts:5730; docs/product/surface-feature-matrix.md:328

## GAP-F049-01-03

**Brief says desktop dictation into another app is missing but it is wired behind a preference.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Affects: Desktop. Work needed: Update brief; verify on macOS with a live run (unknown if run).
- Evidence: apps/desktop/electron/main.ts:1896-1930; brief S49.28

## GAP-F049-01-04

**Web and desktop dictation cannot be used with Local or own-key models; no local speech option on web or desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Affects: Web, desktop users in Local or own-key mode. Work needed: Product decision; requirement says local inference should not need a paid plan [proposed: on-device recognizer on desktop].
- Evidence: ChatComposerNew.tsx:2055-2078

## GAP-F049-01-05

**Phone silently drops filler words and may replace the draft on command-like openings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Affects: Phone. Work needed: Confirm intended; at least avoid replacing typed text.
- Evidence: packages/platform/utils/src/voice.ts:11-50; ChatInput.tsx:166-171

## GAP-F049-01-06

**CLI voice is compiled out by default so most users of default builds cannot dictate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Affects: CLI. Work needed: Confirm which release artifacts carry the feature (release-cli.yml:240-278).
- Evidence: apps/cli/Cargo.toml:126-132

## GAP-F049-01-07

**No recording notice shown on web or desktop before first use (brief marks unverified).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Detail: Affects: Web, desktop. Work needed: Verify and add a notice if absent.
- Evidence: brief S49.17

## GAP-F049-01-PARTLY

**Dictate into the message box: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F049-01](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Requirement items: S49.30

## GAP-F049-02-01

**Brief says VS Code language selection is missing but code and tests exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Detail: Affects: VS Code; docs. Work needed: Update brief.
- Evidence: brief S49.03; dictationClient.ts:5

## GAP-F049-02-02

**Web has separate dictation and live-voice language settings; consistency is undecided.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Detail: Affects: Web, desktop. Work needed: Product decision.
- Evidence: VoiceSection.tsx:43-52

## GAP-F049-02-03

**Chrome language picker location not established; unclear if there is an in-panel control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Detail: Affects: Chrome. Work needed: Locate or add UI and test.
- Evidence: dictation-language.ts header comment only

## GAP-F049-02-04

**Different language lists per app (web list, CLI 20 codes, browser languages).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-02](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Detail: Affects: All apps. Work needed: Share one list or document differences.
- Evidence: voice_languages.rs:8-29; dictation-language.ts:12

## GAP-F049-03-01

**Pause and resume do not exist for dictation anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Detail: Affects: All apps. Work needed: Decide scope, then build for web MediaRecorder and the phone.
- Evidence: brief S49.18; no code found

## GAP-F049-03-02

**No elapsed-duration display on web, desktop, phone and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Detail: Affects: Web, desktop, phone, Chrome, VS Code. Work needed: Add a timer to the strip and composer.
- Evidence: brief S49.19; apps/mobile/__tests__/ChatInputDictation.test.tsx

## GAP-F049-03-03

**Phone retry re-records instead of re-sending the same audio.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Detail: Affects: Phone. Work needed: Decide if acceptable; update brief wording.
- Evidence: ChatInput.tsx:1373-1379

## GAP-F049-03-04

**Chrome has no discard control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Detail: Affects: Chrome. Work needed: Add or record as intentional (D-2026-09-28-23 covers retry only).
- Evidence: voice.ts:252-270; brief S49.07

## GAP-F049-03-05

**VS Code retry: after a failure the user must start again; no retry button found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Detail: Affects: VS Code. Work needed: Verify and decide.
- Evidence: ChatStateManager.ts:5798-5806

## GAP-F049-03-NOTBUILT

**Stop, discard and retry a recording: not built on Web, Desktop, Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI
- Features: [F049-03](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Requirement items: S49.18, S49.19
- Detail: Web: S49.18, S49.19; Desktop: S49.18, S49.19; Mobile: S49.18; CLI: S49.18

## GAP-F049-04-01

**No end-user screen to upload an audio file in any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Detail: Affects: Web, desktop, phone, CLI, VS Code, Chrome. Work needed: Product decision and UI.
- Evidence: brief S49.08

## GAP-F049-04-02

**Developer endpoint bypasses the dictation kill switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Detail: Affects: API users. Work needed: Decide whether a separate switch is wanted.
- Evidence: route.ts:858 vs voice/transcribe/route.ts:29

## GAP-F049-04-03

**Only plain text returned; no segments or timestamps requested.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Detail: Affects: All. Work needed: See F049-06.
- Evidence: route.ts:548-556

## GAP-F049-04-04

**No own-key or local server path for web and desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Detail: Affects: Web, desktop in own-key or Local mode. Work needed: Product decision.
- Evidence: ChatComposerNew.tsx:2055-2078

## GAP-F049-04-05

**Brief says VS Code batch missing; code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Detail: Affects: VS Code; docs. Work needed: Update brief.
- Evidence: brief S49.09; dictationClient.ts

## GAP-F049-04-NOTBUILT

**Batch and file transcription: not built on Web, Desktop, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, Chrome
- Features: [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Requirement items: S49.08
- Detail: Web: S49.08; Desktop: S49.08; CLI: S49.08; Chrome: S49.08

## GAP-F049-05-01

**Brief marks API streaming missing, yet a session API exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief or clarify the meaning.
- Evidence: apps/web/app/api/voice/live/sessions/route.ts:731

## GAP-F049-05-02

**No streaming dictation text in CLI, Chrome, VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Detail: Affects: CLI, Chrome, VS Code. Work needed: Product decision; founder decisions say leaders have no interim dictation text (docs/decisions/2026-09-27-founder-decisions.md:128).
- Evidence: brief S49.10

## GAP-F049-05-03

**Live voice is cloud only; no Local or own-key live mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Detail: Affects: Users in Local or own-key mode. Work needed: Product decision.
- Evidence: route.ts:533 provider call; mobile disclosure

## GAP-F049-05-04

**Which provider and models the live session uses is not documented in the pages read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Detail: Affects: Docs. Work needed: Read getVoiceLiveBackendModel to document.
- Evidence: route.ts:36-41

## GAP-F049-05-NOTBUILT

**Live voice with streaming text: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F049-05](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Requirement items: S49.10
- Detail: CLI: S49.10; VS Code: S49.10; Chrome: S49.10

## GAP-F049-06-01

**No timestamps, speaker labels, speaker rename, transcript search or click-to-seek.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)
- Detail: Affects: All six apps and the API. Work needed: Product decision, then provider output, storage, viewer and tests.
- Evidence: brief S49.11-S49.15

## GAP-F049-06-02

**No stored recording or transcript object exists for these to act on.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)
- Detail: Affects: All. Work needed: Design recordings storage and retention first (related S49.16, S49.24-S49.27).
- Evidence: voice-input-store.ts:438-443; ChatInput.tsx:1375

## GAP-F049-06-03

**No founder decision found requiring these features; D-2026-09-27-02 says features ChatGPT and Claude do not offer are not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)
- Detail: Affects: Planning. Work needed: Check leader behaviour and record the decision.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:73

## GAP-F049-06-NOTBUILT

**Transcript timestamps, speakers, search and seek: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F049-06](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)
- Requirement items: S49.11, S49.12, S49.13, S49.14, S49.15
- Detail: Web: S49.11, S49.12, S49.13, S49.14, S49.15; Desktop: S49.11, S49.12, S49.13, S49.14, S49.15; Mobile: S49.11, S49.12, S49.13, S49.14, S49.15; CLI: S49.11, S49.12, S49.13, S49.14, S49.15; VS Code: S49.11, S49.12, S49.13, S49.14, S49.15; Chrome: S49.11, S49.12, S49.13, S49.14, S49.15

## GAP-F049-07-01

**No meeting recorder in any app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: Affects: All six apps. Work needed: Design a long-recording capture per app, with chunking, a notice and a visible timer.
- Evidence: S49.16 status missing everywhere (area brief)

## GAP-F049-07-02

**No summary, action items, decisions or email draft from a transcript**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: Affects: All six apps. Work needed: Add chat-turn templates or tools that take a transcript and return the four outputs.
- Evidence: S49.20-S49.23 missing everywhere (area brief)

## GAP-F049-07-03

**No link between a recording and a project**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Decide the storage record and project association, then add a migration through the numbered chain.
- Evidence: S49.24 missing (area brief)

## GAP-F049-07-04

**Clip limits and the 25 MB cap do not fit meeting length audio**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: Affects: Phone, CLI, VS Code, web upload. Work needed: Chunk and join, or stream, with quota rules for long minutes.
- Evidence: voiceInput.ts:68; voice.rs:37; dictationLimits.ts:1-3; route.ts:398

## GAP-F049-07-05

**Transcription path is single provider**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Detail: Affects: Any future meeting feature on managed cloud. Work needed: Route transcription through the provider-agnostic layer.
- Evidence: route.ts:722

## GAP-F049-07-NOTBUILT

**Meeting recording, notes and follow-ups: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F049-07](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Requirement items: S49.16, S49.20, S49.21, S49.22, S49.23, S49.24
- Detail: Web: S49.16, S49.20, S49.21, S49.22, S49.23, S49.24; Desktop: S49.16, S49.20, S49.21, S49.22, S49.23, S49.24; Mobile: S49.16, S49.20, S49.21, S49.22, S49.23, S49.24; CLI: S49.16, S49.20, S49.21, S49.22, S49.23, S49.24; VS Code: S49.16, S49.20, S49.21, S49.22, S49.23, S49.24; Chrome: S49.16, S49.20, S49.21, S49.22, S49.23, S49.24

## GAP-F049-08-01

**Audio download does not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)
- Detail: Affects: All apps. Work needed: Decide whether audio should ever be kept; if yes add consent, storage, retention and download.
- Evidence: S49.26 missing; no audio stored (route.ts:722-800)

## GAP-F049-08-02

**No recording retention setting**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)
- Detail: Affects: All apps. Work needed: Document that audio is not kept, or add a setting if it becomes kept.
- Evidence: None found; CLI has a fixed one hour sweep (voice.rs:882)

## GAP-F049-08-03

**Purge may not run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)
- Detail: Affects: Web and any synced chat. Work needed: Confirm in the database and ledger whether 0239 is applied and the purge removes rows.
- Evidence: 0239 header says not applied (apps/web/db/neon/0239_resource_deletion_semantics.sql:3); cron scheduled at vercel.json:86

## GAP-F049-08-04

**Brief says CLI and VS Code export missing but code has them**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief and the status values.
- Evidence: apps/cli/src/repl/slash_commands.rs:186; apps/extension-vscode/package.json:234

## GAP-F049-08-05

**Chrome extension has no found export or delete**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)
- Detail: Affects: Chrome extension. Work needed: Confirm and decide.
- Evidence: not found

## GAP-F049-08-NOTBUILT

**Transcript export, audio download and recording retention: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)
- Requirement items: S49.25, S49.26
- Detail: Web: S49.26; Desktop: S49.26; Mobile: S49.26; Chrome: S49.25, S49.26

## GAP-F049-09-01

**No notice before first web dictation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Detail: Affects: Web and desktop in-app dictation. Work needed: Add a shared notice and remembered acceptance to the web composer.
- Evidence: no match in use-dictation.ts, voice-input-store.ts, DictationStrip.tsx

## GAP-F049-09-02

**VS Code has a sentence but no agreement step**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Detail: Affects: VS Code. Work needed: Add Continue and remember it, if the requirement is agreement.
- Evidence: dictationCapturePage.ts:21-27

## GAP-F049-09-03

**Brief lists Chrome and VS Code as missing but code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Detail: Affects: Brief accuracy. Work needed: Correct statuses.
- Evidence: voice.ts:68-125; dictationCapturePage.ts:21

## GAP-F049-09-04

**No way found to review or withdraw acceptance**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Detail: Affects: Phone, Chrome, CLI. Work needed: Add reset in settings.
- Evidence: not found

## GAP-F049-09-05

**Phone uses Continue, not an explicit agree tick**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Detail: Affects: Phone. Work needed: Decide whether Continue satisfies 'must agree'.
- Evidence: VoiceOnboardingSheet.tsx:202

## GAP-F049-09-NOTBUILT

**Recording notice and consent: not built on Web**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web
- Features: [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Requirement items: S49.17
- Detail: Web: S49.17

## GAP-F049-09-PARTLY

**Recording notice and consent: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Requirement items: S49.17

## GAP-F049-10-01

**Product contract and flaw register say unbuilt**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Detail: Affects: Docs, planning. Work needed: Update both to describe the built, macOS-only, default-off feature.
- Evidence: docs/product/experience-contract.md:667-674; audit/registers/known-flaws.md:235 versus the code in dictationElsewhere.ts

## GAP-F049-10-02

**Brief marks desktop missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the status to partial.
- Evidence: S49.28 (area brief) versus main.ts:1896-1930

## GAP-F049-10-03

**macOS only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Detail: Affects: Windows and Linux desktop. Work needed: Platform helpers or a decision to stay macOS only.
- Evidence: computerUseService.ts:226-232

## GAP-F049-10-04

**Needs server transcription**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Detail: Affects: Offline users, Local mode. Work needed: On-device transcription option.
- Evidence: DictationBar.tsx:39-46; voice-input-store.ts:16

## GAP-F049-10-05

**No tested end to end run recorded**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Detail: Affects: All. Work needed: Human check on a real Mac with Accessibility granted.
- Evidence: No result file found; only unit tests exist

## GAP-F049-10-06

**No notice for first capture**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Detail: Affects: Desktop. Work needed: Add notice.
- Evidence: see F049-09

## GAP-F049-10-NOTBUILT

**Desktop dictation into other apps: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F049-10](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Requirement items: S49.28
- Detail: Mobile: S49.28; Chrome: S49.28

## GAP-F049-11-01

**No spoken rewrite of selected text**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-11](../../20-features/049-dictation-transcription-and-recording/F049-11-spoken-rewrite-of-selected-text.md)
- Detail: Affects: All six apps. Work needed: Design selection capture, voice instruction, rewrite turn, replace and undo.
- Evidence: S49.29 missing in every app (area brief)

## GAP-F049-11-02

**Brief has no code reference for adjacent typed rewrite in Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F049-11](../../20-features/049-dictation-transcription-and-recording/F049-11-spoken-rewrite-of-selected-text.md)
- Detail: Affects: Planning. Work needed: Decide whether to reuse it.
- Evidence: apps/extension/src/features/side-panel/editableRewrite.ts exists

## GAP-F049-11-NOTBUILT

**Spoken rewrite of selected text: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F049-11](../../20-features/049-dictation-transcription-and-recording/F049-11-spoken-rewrite-of-selected-text.md)
- Requirement items: S49.29
- Detail: Web: S49.29; Desktop: S49.29; Mobile: S49.29; CLI: S49.29; VS Code: S49.29; Chrome: S49.29
