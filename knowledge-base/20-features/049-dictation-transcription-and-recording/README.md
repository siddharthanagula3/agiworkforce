---
id: "AREA-049"
type: "area"
title: "Dictation, transcription, and recording"
features: ["F049-01", "F049-02", "F049-03", "F049-04", "F049-05", "F049-06", "F049-07", "F049-08", "F049-09", "F049-10", "F049-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 49. Dictation, transcription, and recording

A person speaks and the words land as text in the message box, so they can type less. The text can be checked and edited before it is sent. The same idea runs in the web app, the desktop app, the phone app, the command-line tool and the Chrome and VS Code extensions, but each app does the speech-to-text step in a different place. Most of the other items in the brief (meeting notes, speaker labels, timestamps, search, export of recordings) are not built yet.

**Who uses it.** Every signed-in user can dictate on web, desktop and CLI, subject to the dictation kill switch and the Voice setting. Web dictation is turned off in Local and own-key (BYOK) chats (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2052-2070). Free users get a monthly voice-minute allowance (apps/web/lib/voice/free-voice-allowance.ts:47-51). Paid plans use managed usage reservations (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:596-604). Workspace organisations can be blocked by their policy and spend cap (route.ts:336-355). Developers can call the transcription API with an inference:write key (route.ts:294-299). On phones, dictation runs on the device and does not use the server at all (apps/mobile/src/features/voice/services/voiceInput.ts:440-446). Whether a phone user must be signed in is not established (see not_sure).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F049-01](F049-01-dictate-into-the-message-box.md) | Dictate into the message box | partly | partly | partly | built | partly | partly |
| [F049-02](F049-02-choose-the-dictation-language.md) | Choose the dictation language | built | built | built | built | built | built |
| [F049-03](F049-03-stop-discard-and-retry-a-recording.md) | Stop, discard and retry a recording | partly | partly | partly | partly | partly | partly |
| [F049-04](F049-04-batch-and-file-transcription.md) | Batch and file transcription | partly | partly | built | partly | partly | no |
| [F049-05](F049-05-live-voice-with-streaming-text.md) | Live voice with streaming text | built | built | built | no | no | no |
| [F049-06](F049-06-transcript-timestamps-speakers-search-and-seek.md) | Transcript timestamps, speakers, search and seek | no | no | no | no | no | no |
| [F049-07](F049-07-meeting-recording-notes-and-follow-ups.md) | Meeting recording, notes and follow-ups | no | no | no | no | no | no |
| [F049-08](F049-08-transcript-export-audio-download-and-recording-ret.md) | Transcript export, audio download and recording retention | partly | partly | partly | partly | partly | no |
| [F049-09](F049-09-recording-notice-and-consent.md) | Recording notice and consent | no | partly | built | built | partly | built |
| [F049-10](F049-10-desktop-dictation-into-other-apps.md) | Desktop dictation into other apps | n/a | partly | no | n/a | n/a | no |
| [F049-11](F049-11-spoken-rewrite-of-selected-text.md) | Spoken rewrite of selected text | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/049-dictation-transcription-and-recording.md](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md).

## How this area works in the code

1. **1. Press the microphone in the web composer.** The composer renders the mic button, which calls the dictation start function. The start function is wired from the dictation hook. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6942-6950`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2048-2083`, `apps/web/features/chat/components/Composer/VoiceInputButton.tsx:39-50`)
2. **2. The hook checks whether dictation may run.** It stops if the Voice setting is off, if the billing data switches dictation off, or if the chat is Local or own-key. It then creates a request owner so late results from an old recording are dropped, and asks the store to start. (`apps/web/features/chat/hooks/use-dictation.ts:146-185`, `apps/web/features/chat/hooks/use-dictation.ts:44-52`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2052-2070`)
3. **3. Capture the microphone.** The store asks for the microphone with echo cancellation and noise suppression, then records in short 100 ms chunks. The stream also feeds the waveform (use-dictation.ts:263-297). (`apps/web/features/chat/stores/voice-input-store.ts:61-127`, `apps/web/features/chat/stores/voice-input-store.ts:17`)
4. **4. Stop and upload the whole recording.** Stopping ends the recorder, joins the chunks into one audio blob, and posts it as a form with the model and the language code to the web transcription endpoint. (`apps/web/features/chat/stores/voice-input-store.ts:129-184`, `apps/web/features/chat/stores/voice-input-store.ts:19-44`)
5. **5. Server admits the request.** The web endpoint checks the dictation switch, then the shared handler checks region, CSRF token, rate limit, sign-in, organisation policy and workspace spend cap, and the file size (25 MB). (`apps/web/app/api/voice/transcribe/route.ts:18-29`, `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:273-299`, `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:336-355`, `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:398-412`)
6. **6. Charge the allowance and transcribe.** Free plans draw from a monthly voice-second grant; paid plans reserve managed usage first. The transcription is sent to the provider, then usage is settled with the actual cost. (`apps/web/app/api/llm/v1/audio/transcriptions/route.ts:580-640`, `apps/web/lib/voice/free-voice-allowance.ts:47-51`, `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:694-700`, `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:780-790`)
7. **7. Insert or send the text.** An empty result shows a message. Otherwise the text goes to the composer (insert) or is appended and sent (send). Send runs on the next render after the message is set. (`apps/web/features/chat/hooks/use-dictation.ts:189-208`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2023-2046`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4072-4080`)
8. **8. Failure and retry.** Each failure code is mapped to a message. A plan or allowance refusal shows Upgrade and drops the recording; other failures keep the recording for Try again. (`apps/web/features/chat/stores/voice-input-store.ts:135-183`, `apps/web/features/chat/stores/voice-input-store.ts:186-213`, `apps/web/features/chat/components/Composer/DictationStrip.tsx:139-174`)
9. **9. The other apps take their own paths.** Phone: on-device speech recognition only, with a 60-second cap, no upload. Chrome extension: the browser's speech engine, text appended to the box. Command line: records to a WAV file, asks for consent, then sends to the managed account, a provider key, or a local program. VS Code: records, base64-encodes, posts to the same web endpoint with surface=vscode. Desktop shortcut: a separate floating window and typing path. (`apps/mobile/src/features/voice/services/voiceInput.ts:415-466`, `apps/mobile/src/features/chat/components/ChatInput.tsx:1381-1395`, `apps/extension/src/features/side-panel/voice.ts:136-283`, `apps/cli/src/voice.rs:623-792`, `apps/cli/src/voice.rs:968-1010`, `apps/extension-vscode/src/webview/dictation.ts:12-77`, `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts:12-43`, `apps/desktop/electron/main.ts:1919-1939`, `apps/desktop/electron/dictationElsewhere.ts:89`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/hooks/use-dictation.ts` | State machine for web dictation: start, stop, send, retry, cancel; checks switches; drives the waveform. |
| `apps/web/features/chat/stores/voice-input-store.ts` | Microphone capture, upload to the web endpoint, failure messages, retry, language code handling. |
| `apps/web/app/api/voice/transcribe/route.ts` | Web entry point for dictation; checks the dictation kill switch and reuses the shared transcription handler. |
| `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Shared server handler: limits, sign-in, policy and spend gates, allowance and billing, provider call. |
| `apps/web/features/chat/components/Composer/DictationStrip.tsx` | The recording bar: waveform, stop, send, discard, transcribing spinner, error with retry or upgrade. |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Connects dictation to the composer: insert and send handlers, Local and own-key gate, desktop hotkey, mic button. |
| `apps/mobile/src/features/voice/services/voiceInput.ts` | Phone speech capture using the device's own recognizer (on-device only), 60-second cap, file transcription. |
| `apps/mobile/src/features/voice/components/VoiceInputButton.tsx` | Phone mic button: tap or hold, first-use intro, finish and cancel, error handling. |
| `apps/cli/src/voice.rs` | Command-line recording (120 s cap), consent notice, backend choice and privacy gate, retry and confirm prompts. |
| `apps/extension/src/features/side-panel/voice.ts` | Chrome extension mic using the browser's speech engine and a first-use notice. |
| `apps/extension-vscode/src/webview/dictation.ts` | VS Code recording with a 3 MB and 120-second limit; sends audio to the shared endpoint through dictationClient.ts. |
| `apps/desktop/electron/dictationElsewhere.ts` | Desktop dictate-into-other-apps: front-app checks, guarded apps, text cleaning, 10-minute limit. |

## What is stored

- Dictated text, once sent or inserted: Saved as the message text in the chat, the same as typed text (conversation route apps/web/app/api/chat/conversations/[id]/route.ts).
- Recording audio on web while it is being used: Browser memory only (apps/web/features/chat/stores/voice-input-store.ts:49, 157-158, 176). Not written to disk by the web code I read. Server-side storage of the upload was not established.
- Web voice language and microphone choice: Browser local storage under key agi-web-voice-input (apps/web/features/chat/stores/voice-input-store.ts:13, 239-242). The transcript itself is not stored.
- Usage and allowance records (seconds, cost, reservations): Database, written through the scoped database handle in the transcription route (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-790). Table names not checked.
- Phone: first-use intro seen flag and voice on/off setting: Phone settings store (apps/mobile/stores/settingsStore.ts:46, 56, 124, 134). No audio kept by the app; recognition runs on the device.
- Command line: recordings in a temporary folder, swept after one hour: Config data folder subfolder voice-recordings (apps/cli/src/voice.rs:879-899, 916).
- Command line: consent marker per destination: Config folder file voice-recording-notice (apps/cli/src/voice.rs:377-407).
- Chrome extension: consent acknowledged, dictation language: chrome.storage.local key agi.notice.microphone (apps/extension/src/features/side-panel/voice.ts:25, 61-68) and chrome.storage.sync key agi_dictation_language (apps/extension/src/features/side-panel/dictation-language.ts:14).
- VS Code: dictation language: Editor setting agiWorkforce.dictationLanguage (apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts:5; ChatStateManager.ts:5796).
- Desktop: dictate-into-apps preference: Desktop saved settings via saveSettingsDurably (apps/desktop/electron/main.ts:2255).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Dictation setting (on or off)**: Turns the microphone button off; the button shows 'Dictation is off in Voice settings'. (apps/web/shared/stores/web-settings-store.ts:73, 129, 160; read at apps/web/features/chat/hooks/use-dictation.ts:113, 147; toggle at apps/web/features/settings/sections/VoiceSection.tsx:113-123.)
- **Dictation kill switch (capability 'dictation')**: Server and client turn dictation off for everyone for a release or incident, with an optional version reason. (apps/web/lib/feature-flags/kill-switches.ts:19, 33; enforced at apps/web/app/api/voice/transcribe/route.ts:18-26; client message at apps/web/features/chat/hooks/use-dictation.ts:39-52, 118-121.)
- **Plan voice-minute allowance**: Free plans get a monthly number of voice minutes (converted to seconds); the value is set per plan in the model catalog file, one plan shows 10. (apps/web/lib/voice/free-voice-allowance.ts:47-51; packages/contracts/types/src/model-catalog.ts:1118, 1256.)
- **Paid plan managed usage**: Paid plans reserve and check voice minutes against their tier unit quota before transcribing. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:580-604.)
- **Organisation policy and spend cap**: Blocks transcription when the workspace policy or spend cap refuses it. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:336-355.)
- **Rate limit 'audio-transcription'**: Limits how many transcription requests one user can make. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:294.)
- **Upload size limit 25 MB**: Refuses larger audio files. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:398, 412.)
- **Phone voice on or off, and first-use flag**: Turns phone dictation off; the first tap shows the intro sheet until it is seen. (apps/mobile/stores/settingsStore.ts:46, 56; read at apps/mobile/src/features/voice/components/VoiceInputButton.tsx:91, 126.)
- **Phone 60-second listen cap**: Stops a phone recording after 60 seconds. (apps/mobile/src/features/voice/services/voiceInput.ts:68.)
- **Command line 'voice' build feature**: Builds without the voice feature refuse dictation with a message. Linux release builds leave it out. (apps/cli/Cargo.toml:132 (feature list); apps/cli/src/lib.rs:77-100; .github/workflows/release-cli.yml:240-241.)
- **Command line 120-second cap**: Stops a command-line recording. (apps/cli/src/voice.rs:37.)
- **Command line privacy gate and provider key**: In Local mode, an environment variable (AGIWORKFORCE_VOICE_ALLOW_CLOUD) must be set before audio goes to the provider. The provider key is read from an environment variable and selects the provider backend. (apps/cli/src/voice.rs:427-433 (backend choice), 458-490 (gate), 493-508 (fallback to local program).)
- **Chrome extension browser speech and language**: Button is disabled when the browser has no speech recognition. Language comes from the stored choice, else the browser languages. (apps/extension/src/features/side-panel/voice.ts:136-150; apps/extension/src/features/side-panel/dictation-language.ts:14, 36-47.)
- **VS Code 3 MB and 120-second limits**: Stops or refuses an overlong or oversized recording. (apps/extension-vscode/src/protocol/dictationLimits.ts (MAX_DICTATION_BYTES, MAX_DICTATION_MS).)
- **Desktop 'dictate into the app you are using'**: Turns on the dictate-into-other-apps path; turning it on asks for confirmation and needs accessibility access. (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:380-384; apps/desktop/electron/main.ts:2251-2256, 2078.)
- **Desktop dictation session limit**: Ends a dictate-into-other-apps session after 10 minutes. (apps/desktop/electron/dictationElsewhere.ts:45.)

## Shared between apps

Shared: the web composer dictation code (use-dictation, voice-input-store, DictationStrip, the transcription route) is used by web and by the desktop window, which loads the hosted web app. The desktop dictation-bar window (apps/desktop/electron/dictationBar.ts) is desktop-only. The web transcription endpoint is also used by the VS Code extension (surface=vscode) and by the public API. The dictation state names and messages come from apps/web/features/chat/lib/dictation-machine (imported, not opened). Separate per app: phone speech capture (on-device, apps/mobile/src/features/voice), command-line recording (apps/cli/src/voice.rs, Rust), Chrome extension speech (apps/extension/src/features/side-panel/voice.ts, browser speech engine), VS Code recording (apps/extension-vscode/src/webview), and desktop dictate-into-apps (apps/desktop/electron). Live voice conversations use a separate server path (apps/web/app/api/voice/live/sessions).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says desktop 'dictate into other apps' is missing; code exists and is behind a preference. (apps/desktop/electron/main.ts:1896-1939; apps/desktop/electron/dictationElsewhere.ts:89; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:380-384)
- Brief says VS Code dictation is missing; the VS Code extension records audio and posts it to the shared endpoint. (apps/extension-vscode/src/webview/dictation.ts:12-77; apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts:12-43; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5779-5796)
- Brief says interim (partial) text is not applicable, but the phone app shows a live transcript line and the speech engine reports partial results. (apps/mobile/src/features/chat/components/ChatInput.tsx:1976; apps/mobile/src/features/voice/services/voiceInput.ts:369-371)
- Brief says phone retry is done, but no retry control was found; a failed phone transcription returns to idle with an error and no audio is kept. (apps/mobile/src/features/voice/components/VoiceInputButton.tsx:186-194; apps/mobile/src/features/chat/components/ChatInput.tsx:595 (cited by brief, is tool-menu code, not retry))
- Brief says recordings have retention settings (done on web, desktop, phone). No recording retention exists: the web store keeps no audio or transcript after insert, and the cited line is only an import. (apps/web/features/chat/stores/voice-input-store.ts:1, 239-242)
- Brief says streaming is missing in the API, but a live voice session endpoint exists in the web app. (apps/web/app/api/voice/live/sessions/route.ts; apps/web/features/chat/lib/live-voice-session.ts:41)
- Consent: the brief requires the user to agree before capture. The phone sheet has only a Continue button shown once, and no web consent step was found. (apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx:137-143; apps/mobile/stores/settingsStore.ts:56)
- Several brief code citations point at unrelated code. Web ChatComposerNew.tsx:1613 is search code; the insert handler is at 2031. Phone ChatInput.tsx:237 and 595 are attachment and tool code; the dictation handler is at 1381. Extension side_panel.ts:10170 and 7466 are attachment and upload code; the voice wiring is at 15777-15826. release-cli.yml:229 is a toolchain install; the voice-feature note is at 240. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1613, 2031; apps/mobile/src/features/chat/components/ChatInput.tsx:237, 595, 1381; apps/extension/src/side_panel.ts:10170, 7466, 15777, 15826; .github/workflows/release-cli.yml:229, 240)
- Transcript export: the brief cites a page-props line; the export is a whole-conversation export, not a transcript export. (apps/web/features/chat/pages/WebChatPage.tsx:5851; apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:96)
- Chrome extension stop and discard: clicking the mic while listening stops and keeps the text; there is no discard that drops the text. (apps/extension/src/features/side-panel/voice.ts:136-283 (click handler stops recognition; onresult appends text))
- Web voice store persists only language and microphone, but a web composer may still show the old 'Voice input not supported' tooltip path depending on the browser; the brief's undo item is unverified. (apps/web/features/chat/stores/voice-input-store.ts:239-242; apps/web/features/chat/components/Composer/VoiceInputButton.tsx:36-50)

## Not established

- No tests were run and no app was started: the task was read-only. The brief's owner asked that everything be tested on localhost, one surface at a time; QA must do that, and the brief's 'done' and 'missing' statuses in the places noted above need a live check.
- Whether phone dictation needs a signed-in account is not established.
- Whether the web upload is stored on the server (audio retention) was not checked; only the request flow was read.
- Whether the transcription route returns word or segment timestamps was not checked, so the timestamp item (S49.11) may be partly possible at the provider level.
- No code for speaker labels, meeting notes, action items, decisions, follow-up email, project linking, spoken rewrite, pause or audio download was found in the files opened. The whole repository was not searched exhaustively.
- Undo of dictated text (S49.30) was not traced to any undo stack.
- Whether the desktop global shortcut key is set by default was not checked (apps/desktop/electron/shortcuts.ts holds the registration).
- Which plan gets 10 voice minutes is not confirmed; the catalog value at packages/contracts/types/src/model-catalog.ts:1256 was seen without its tier name.
- The VS Code and Chrome extension behaviour on failure and the exact VS Code UI were only read, not run.
- Mobile microphone-button behaviour on hold (push to talk) was read in code only; device behaviour is not verified.
- The web composer dictation strip's keyboard handling was read in code only; event order with other listeners is untested (see the project rule about event-order tests).
