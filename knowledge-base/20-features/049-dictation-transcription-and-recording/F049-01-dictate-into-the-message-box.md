---
id: "F049-01"
type: "feature"
title: "Dictate into the message box"
aliases: ["Dictation", "Voice input", "Composer microphone", "Dictate into the message box", "Mic button", "/dictate (CLI)", "/voice push-to-talk (CLI)", "Dictate with AGI Cloud (VS Code button label)", "S49.01", "S49.02", "S49.04", "S49.05", "S49.30"]
area: "49 Dictation, transcription, and recording"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S49.01", "S49.02", "S49.04", "S49.05", "S49.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "mode:local", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-authentication-and-identity", "file:apps/web/app/api/llm/v1/audio/transcriptions/route.ts", "api:POST /api/voice/transcribe", "api:POST /api/llm/v1/audio/transcriptions", "provider:openai"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-01 Dictate into the message box

Lets a person speak a message into the composer instead of typing it. The speech becomes text in the message box, ready to edit, or is sent at once on web, desktop and phone. Web, desktop, CLI and VS Code upload the audio to AGI Cloud. The phone transcribes on the device. Chrome uses the browser's speech service.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.01](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4901), [S49.02](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4902), [S49.04](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4904), [S49.05](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4905), [S49.30](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4930).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns one spoken recording into text that lands in the message field (web, desktop, phone, Chrome, VS Code, and CLI /dictate) or is sent as a message (web send button, phone send, CLI /voice after confirmation). It is dictation, a single recording turned into text. It is not the live two-way voice conversation (see F049-05). (apps/web/features/chat/hooks/use-dictation.ts:189; apps/mobile/src/features/chat/components/ChatInput.tsx:1381; apps/cli/src/voice.rs:310)

**Why it exists.** Speaking is faster than typing and helps on phones and for people who cannot type easily. The project requirements ask for a mic control, a separate dictation versus live voice, and edit-before-send. (doc: docs/product/requirements.md:912-920; doc: docs/product/requirements.md:1001-1003)

**Who uses it.** Any signed-in person on web, desktop, phone, CLI, Chrome or VS Code who prefers to talk. Free-plan users get a monthly voice allowance on the cloud path. (apps/web/lib/voice/free-voice-allowance.ts:47)

**Problems it solves**

- Typing long messages on a phone or in a terminal is slow.
- A mis-heard dictation can be fixed before it is sent because the text lands in the editable field.
- Local-only users on phone get dictation with no upload and no payment.

**Use cases**

- Web user clicks the mic, speaks a paragraph, clicks stop, edits two words, presses send.
- Phone user holds the mic, speaks, releases, and the text is added to the draft.
- CLI user types /dictate, holds SPACE, speaks, and the text is placed in the composer without sending.
- VS Code user clicks the sidebar mic, records in a browser tab, and the text returns to the draft.

## 2. User experience

**Where to find it**

- Web and desktop (Electron shows the hosted web app): mic button in the composer, accessible name 'Start voice input' (apps/web/features/chat/components/Composer/VoiceInputButton.tsx:11); keyboard shortcut id composer-toggle-dictation (packages/ui/unified-chat/src/lib/shortcutRegistry.ts:229); desktop global shortcut routed to the composer (apps/desktop/electron/voiceDictation.ts:43).
- Phone: mic button in the chat composer, accessible name 'Tap to record, hold for push-to-talk' (apps/mobile/src/features/voice/components/VoiceInputButton.tsx).
- CLI: slash commands /dictate ('Dictate into the composer without sending') and /voice (apps/cli/src/tui/tui_app.rs:4523; apps/cli/src/repl/slash_commands.rs:761). Needs a build with the voice feature (apps/cli/Cargo.toml:126-132).
- Chrome extension side panel: mic button with tooltip from the i18n keys spVoiceTooltip (apps/extension/src/features/side-panel/voice.ts:119).
- VS Code sidebar: button titled 'Dictate with AGI Cloud', hidden until dictation is available (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3362).

**Before you start**

- Microphone permission. Web asks the browser (apps/web/features/chat/stores/voice-input-store.ts:278-287). Phone asks for microphone and speech access (apps/mobile/src/features/voice/services/voiceInput.ts:100-110 area).
- Web, desktop, VS Code, CLI managed backend: signed in to an AGI account. Web refuses with 'Sign in again to use voice input. Your recording was not saved.' on 401 or 403 (apps/web/features/chat/stores/voice-input-store.ts:153-160).
- Web: a cloud destination. Dictation is refused when a Local model or a direct own-key model is selected, with 'Cloud dictation is unavailable for this destination. Type instead.' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2055-2060; apps/web/features/chat/hooks/use-dictation.ts:146-160).
- Web: Settings > Voice 'Dictation' switch on (default on) (apps/web/features/settings/sections/VoiceSection.tsx:113; apps/web/shared/stores/web-settings-store.ts:129).
- Phone: the Voice setting on, and on Android a version where the on-device recognizer is guaranteed (API 33 or later) (apps/mobile/src/features/voice/services/voiceInput.ts:291-293).
- VS Code: trusted workspace, not a remote window, a cloud (managed) session or an Auto draft, and not a local model (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5710-5722).

**Screens and controls**

- Web/desktop dictation strip: X 'Discard recording', waveform, square 'Stop recording and edit the transcript', send button, 'Transcribing' spinner, error with 'Try again' or 'Upgrade' (apps/web/features/chat/components/Composer/DictationStrip.tsx:16-24, 72-80, 150-170).
- Web/desktop keyboard in the strip: Escape discards, Enter while recording stops and sends (DictationStrip.tsx:72-83).
- Phone: mic toggles; holding past 300 ms is push-to-talk (apps/mobile/src/features/voice/holdToTalk.ts:1); first use opens an intro sheet titled 'Dictation' with Continue (apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx); while recording the composer shows X 'Cancel recording' (ChatInput.tsx:1947-1951), waveform, stop and send; a live transcript line shows what is heard (ChatInput.tsx:1976).
- CLI /voice: SPACE to start; stop by releasing SPACE or ENTER; then ENTER send, e edit, r re-record, ESC discard (apps/cli/src/voice.rs:140-190, 586-618, 731-760). CLI /dictate: SPACE to record, ESC cancels, text goes into the composer, not sent (voice.rs:310-355; tui_app.rs:7520-7540).
- Chrome: mic toggles on click; pulsing indicator while listening; a microphone notice with Continue and decline buttons first time (voice.ts:76-100).
- VS Code: the button opens a local recorder page in the browser with 'Start recording', 'Stop and transcribe' and 'Cancel' (apps/extension-vscode/src/features/sidebar-webview/dictationCapturePage.ts:9-33; apps/extension-vscode/src/webview/dictationPage.ts:43-91).

**Journey**

1. Person clicks or taps the mic (or uses the shortcut / slash command).
2. The app checks it is allowed (setting on, kill switch off, cloud destination on web; phone Voice setting and on-device support).
3. The app asks for microphone permission if needed. Phone shows the intro sheet on first use.
4. Recording starts. Web and desktop draw a waveform; phone shows a pulsing ring and live transcript; CLI shows REC, a level meter and elapsed seconds.
5. Person stops: web stop square (insert) or send/Enter (send); phone tap again or release hold; CLI release SPACE or ENTER; Chrome click again; VS Code 'Stop and transcribe'.
6. A 'Transcribing' state shows on web and desktop. Phone shows processing. CLI shows a 'Transcribing...' spinner.
7. Text is added after the existing message with a single space and the field is focused (web: ChatComposerNew.tsx:2023-2036; phone: ChatInput.tsx:166-171, 608-617). CLI /voice shows the text and waits for ENTER/e/r/ESC.
8. Person edits and sends, or the send path sends it.

**What the person sees and gets**

- Screen-reader announcements on web: 'Recording started', 'Recording stopped, transcribing', 'Transcript ready', 'Recording discarded' (use-dictation.ts:29-34).
- Empty result on web: 'Nothing was heard in that recording. Try again.' (use-dictation.ts:38).
- Phone empty or failed capture: alert 'Didn't catch that' with 'Audio isn't saved, so say it again.' and Cancel / Try again (ChatInput.tsx:1373-1379).
- CLI: '(no speech detected)', 'Transcription failed: ...' (voice.rs:208-225).
- Web usage refusals: 'This month's voice minutes are used up. Type instead.' etc. (voice-input-store.ts:125-130).

**Settings**

- Web: Settings > Voice 'Dictation' switch, 'Microphone' picker, 'Dictation language' (VoiceSection.tsx:113, 150, 184).
- Phone: Settings > Voice, Voice on/off and 'Speech language' (apps/mobile/src/features/settings/voice/index.tsx:416).
- Desktop: 'dictateIntoFocusedApp' preference switch in desktop settings (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:380-384).
- CLI: --voice-lang flag, env AGIWORKFORCE_VOICE_ALLOW_CLOUD, OPENAI_API_KEY (names only) (apps/cli/src/lib.rs:354; apps/cli/src/voice.rs:87-92).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: full record, upload, insert/send flow with state machine, waveform, retry and usage-limit messages (apps/web/features/chat/hooks/use-dictation.ts; apps/web/features/chat/stores/voice-input-store.ts:260-446; DictationStrip.tsx).
- Server transcription endpoints with auth, rate limit, size and type checks, content scan, quota and billing (apps/web/app/api/voice/transcribe/route.ts:29; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:273-858).
- Desktop (Electron): shows the hosted web app, so the same composer flow works; global shortcut focuses the composer and toggles dictation (apps/desktop/electron/voiceDictation.ts:43-74; apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts:12-22).
- Desktop: dictation into another app exists in code and is wired when the dictateIntoFocusedApp preference is on, with a 10 minute session limit and protection for password apps (apps/desktop/electron/main.ts:1896-1930; apps/desktop/electron/dictationElsewhere.ts:11-45). The brief marks S49.28 desktop missing, so the brief is out of date (apps/desktop/electron/__tests__/dictationElsewhere.test.ts exists).
- Phone: on-device recognition with partial text, 60 second cap, push-to-talk, intro sheet, language check, cancel, stop, send (apps/mobile/src/features/voice/services/voiceInput.ts:415-440; VoiceInputButton.tsx; ChatInput.tsx).
- CLI: three backends (AGI account, user's OpenAI key, local whisper program), recording notice that must be agreed, 120 second cap, minimum 300 ms, confirmation step (apps/cli/src/voice.rs:37-40, 379-415, 968-1010).
- Chrome: browser SpeechRecognition appended to composer, microphone notice, permission pre-check (apps/extension/src/features/side-panel/voice.ts:136-283).
- VS Code: capture in a local browser page, upload to managed endpoint, result posted to the draft (ChatStateManager.ts:5730-5810; dictationClient.ts:12-43). The brief says missing; the code and tests exist, so the brief is out of date (apps/extension-vscode/src/__tests__/dictationClient.test.ts). The matrix doc says VS Code cannot record audio (doc: docs/product/surface-feature-matrix.md:328), which the browser-page design works around.

**Incomplete**

- Interim text while speaking: not required (brief S49.04 n/a; doc: docs/decisions/2026-09-27-founder-decisions.md:128). Only phone shows it (ChatInput.tsx:1976); Chrome sets interimResults false (voice.ts:206); web, CLI, VS Code show none.
- Undo of inserted text: unverified in every app (brief S49.30). Web appends through appendComposerMessage (ChatComposerNew.tsx:2023); whether the browser undo stack keeps it was not established. CLI records composer undo (tui_app.rs:7527-7531).
- Phone filler-word cleanup removes words such as 'like' and 'actually' and replaces the draft when the transcript starts with a command-like phrase (packages/platform/utils/src/voice.ts:11-44; ChatInput.tsx:166-171). Whether this is wanted is not documented.

**Present but disconnected or switched off**

- CLI voice code is compiled out by default; builds without the voice feature report that audio capture is unavailable (apps/cli/src/lib.rs:77-100; apps/cli/Cargo.toml:126-132). The release workflow adds it for some targets (.github/workflows/release-cli.yml:240-278).
- Web kill switch 'dictation' can close the feature server-side and per version (use-dictation.ts:44-52; apps/web/app/api/voice/transcribe/route.ts:18-26).
- Old Tauri desktop code (apps/desktop/src) has its own voice hooks; not examined (unknown).

**Not available**

- Web and desktop: no dictation with a Local model or own-key model selected (ChatComposerNew.tsx:2055-2060).
- VS Code: not available in untrusted, remote, or local-model sessions (ChatStateManager.ts:5710-5722).
- Phone: no cloud transcription path in dictation; unsupported Android below API 33 hides the mic (VoiceInputButton.tsx:91-92; voiceInput.ts:291).

## 4. Required behaviour

**Established requirements**

- A microphone control in the composer turns speech into text in the message field. (source: brief S49.01)
- The transcript lands in the message field where the user can edit it before sending. (source: brief S49.02)
- While dictating, interim text should appear before the recording ends, but the brief marks this n/a everywhere and the founder decisions say ChatGPT and Claude have no interim dictation text. (source: brief S49.04; docs/decisions/2026-09-27-founder-decisions.md:128)
- When dictation ends, the final transcript is produced and delivered. (source: brief S49.05)
- Text inserted by dictation can be undone with the normal undo action (unverified). (source: brief S49.30)
- Dictation is separate from live voice. Mobile mic requests native permission, text is editable, user can cancel or send, and voice privacy says whether audio is local or cloud. (source: docs/product/requirements.md:912-920; docs/product/requirements.md:1001-1005)
- Nothing may silently route a Local chat, file or session to own-key or managed cloud. (source: AGENTS.md section 6)

**Acceptance criteria**

1. On web with a cloud model selected and microphone allowed, click mic, speak, click stop: text appears at the end of the message field, cursor in field, nothing sent.
2. On web, click send (or Enter) while recording: the transcript is added and the message is sent.
3. On web with a Local or own-key model selected, the mic gives the message 'Cloud dictation is unavailable for this destination. Type instead.' and no audio is recorded or uploaded.
4. On phone, with airplane mode on and the language model installed, dictation still produces text.
5. On CLI /dictate, the text is placed in the composer and is not sent until ENTER.
6. With the dictation kill switch closed, web refuses to record and shows the reason.
7. A silent recording shows an empty-result message, not an inserted blank.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The phone text should also be editable before sending when stopped with stop rather than send [inferred from ChatInputDictation test 'delegates stop as review and inserts without sending' (apps/mobile/__tests__/ChatInputDictation.test.tsx)].
- Chrome audio goes to the browser vendor's speech service, but whether it is on-device was not established in code [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Verify undo (S49.30) with a test in each composer and record the result.
- [proposed] Show a visible provider label on web when audio is uploaded to AGI Cloud, matching the phone and CLI notices.
- [proposed] Update the brief rows for VS Code and desktop dictation elsewhere.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceInputButton (web) | `apps/web/features/chat/components/Composer/VoiceInputButton.tsx` | Mic button, label 'Start voice input', checks getUserMedia support |
| component | DictationStrip | `apps/web/features/chat/components/Composer/DictationStrip.tsx` | Recording bar: discard, waveform, stop, send, transcribing, error, retry, upgrade |
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Controller: start, stop, send, cancel, retry, admission checks, waveform, announcements |
| store | useVoiceInputStore | `apps/web/features/chat/stores/voice-input-store.ts` | Records with MediaRecorder, uploads to /api/voice/transcribe, error mapping, keeps failed recording in memory |
| other | dictation-machine | `apps/web/features/chat/lib/dictation-machine.ts` | State machine idle/recording/transcribing/error/cancelled and waveform helpers |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Hosts the mic, decides availability by destination, appends text, handles send intent and shortcut |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation entry that checks the dictation kill switch then runs the shared transcription handler |
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Auth, limits, scan, quota, provider call and usage settlement |
| service | free-voice-allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Monthly free voice seconds grant and settle |
| config | dictation kill switch | `apps/web/lib/feature-flags/kill-switches.ts` | DICTATION_CAPABILITY 'dictation' |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | dictationEnabled setting (default true) |
| other | desktop voice hotkey | `apps/desktop/electron/voiceDictation.ts` | Global shortcut raises a window, focuses the composer and sends the toggle event |
| hook | use-desktop-voice-hotkey | `apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts` | Web code receives the shell's shortcut and window-hidden events |
| other | dictationElsewhere | `apps/desktop/electron/dictationElsewhere.ts` | Dictate into the focused app of another program, with guards |
| component | VoiceInputButton (mobile) | `apps/mobile/src/features/voice/components/VoiceInputButton.tsx` | Tap and hold-to-talk mic with state machine, ring animation and intro sheet |
| service | voiceInput (mobile) | `apps/mobile/src/features/voice/services/voiceInput.ts` | On-device recognition via expo-speech-recognition, 60 s cap, locale checks, errors |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Composer UI while dictating, merge of transcript, failure alert, cancel |
| component | VoiceOnboardingSheet | `apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx` | First-use intro and disclosure |
| other | voice utils | `packages/platform/utils/src/voice.ts` | Filler-word cleanup, command-prefix detection, metering scale |
| service | CLI voice module | `apps/cli/src/voice.rs` | cpal capture, WAV encode, three backends, notice, retry, confirmation, privacy gate |
| command | /voice and /dictate | `apps/cli/src/tui/tui_app.rs` | Slash command handling for RunVoice and RunDictate |
| component | Chrome voice module | `apps/extension/src/features/side-panel/voice.ts` | Browser SpeechRecognition, microphone notice, errors |
| service | VS Code dictation | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | _canDictate, _startDictation, capture page, upload |
| service | VS Code dictationClient | `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts` | Uploads audio to /api/voice/transcribe?surface=vscode |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web/desktop: click mic; useDictation checks the setting, the kill switch and the destination, then asks the store to record with MediaRecorder (100 ms slices). | device | apps/web/features/chat/hooks/use-dictation.ts:146-190; apps/web/features/chat/stores/voice-input-store.ts:260-326 |
| On stop, the whole clip is sent as multipart (file, model from the voice_transcription routing slot, optional two-letter language) to /api/voice/transcribe. | device and our servers | apps/web/features/chat/stores/voice-input-store.ts:218-245 |
| Server checks region, CSRF, rate limit, sign-in or key, age gate, organization and spend policy, size, type, content scan, privacy setting, plan and quota, then reserves usage (or a free-allowance grant). | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:273-640 |
| Server forwards the audio to the speech provider with a 60 second timeout; the audio is not stored. | outside service | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:466-468, 722-729 |
| Server settles usage and cost and returns the provider JSON; the client trims the text and appends it to the composer. | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:760-850; ChatComposerNew.tsx:2023-2036 |
| Phone: native recognizer is started with on-device required, partial text streams to the composer, final text returned on stop. | device | apps/mobile/src/features/voice/services/voiceInput.ts:430-440 |
| CLI: cpal records 16 kHz mono, writes a WAV in a private folder, sends it to the chosen backend (AGI account endpoint, OpenAI Whisper with the user's key, or local whisper program), then deletes the folder. | device and our servers | apps/cli/src/voice.rs:623-680, 968-1010, 1025-1076, 1089-1136, 1140-1205 |
| Chrome: browser SpeechRecognition produces text; where the browser processes audio is decided by the browser. | outside service | apps/extension/src/features/side-panel/voice.ts:155-215 [inferred: the browser's speech service] |
| VS Code: the extension serves a one-time local page, the user records in the browser, the extension uploads the audio with the account token to the managed endpoint. | device and our servers | apps/extension-vscode/src/features/sidebar-webview/dictationCapturePage.ts:36-60; ChatStateManager.ts:5764-5790 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Recording audio (web) | Browser memory only; failed recording kept in module memory for retry | No | Dropped on cancel, success, plan refusal; not persisted (voice-input-store.ts:438-443 persists only language and microphone) |
| Recording audio (server) | Not stored; bytes go to the provider and are dropped | No | Comment in route says nothing stores or serves them (route.ts:466-468). Provider retention is unknown. |
| Usage and cost rows | Managed usage reservations and cost ledger tables (table names not opened) | Server side | unknown |
| CLI temporary WAV | Private folder under the CLI config directory | No | Removed after each transcription; stale folders swept (voice.rs:884-927, 1000-1004) |
| CLI recording consent marker | File 'voice-recording-notice' in CLI config directory holding the destination text | No | Kept until the destination changes (voice.rs:379-415) |
| Chrome microphone notice acknowledgement | store:chrome.storage.local key agi.notice.microphone | No (local storage) | Kept (voice.ts:25, 97) |
| Dictation language | Web localStorage 'agi-web-voice-input'; phone settings stores; Chrome storage.sync; VS Code global state | Chrome sync only | Kept until changed |

**Models and providers.** Web, desktop, VS Code and CLI managed use the catalog routing slot 'voice_transcription', resolved by getRoutingSlotModel; the server requires it to be a live speech-to-text model from the openai provider, else it throws (route.ts:487-504). A client-requested model is honored only if it is a live openai speech-to-text catalog entry (route.ts:517-527). The server key is a server environment variable OPENAI_API_KEY (name only) (route.ts:725). The CLI own-key path posts to OpenAI directly with the user's OPENAI_API_KEY (voice.rs:1089-1100). Phone uses the operating system recognizer. No other provider is wired for dictation.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, desktop, VS Code and CLI managed backend need sign-in (route.ts:297; ChatStateManager.ts:5762). Phone on-device dictation: none found in the code requiring sign-in. CLI own-key and local backends: no AGI sign-in needed (voice.rs:427-441). Chrome: none found. |
| Permissions | Microphone permission everywhere. Phone also speech recognition access (VoiceInputButton.tsx reportError 'Voice input needs microphone and speech access'). Desktop only grants audio media permission to the trusted cloud origin (apps/desktop/electron/permissionPolicy.ts:43-53). CLI and Chrome show a recording notice before first use (voice.rs:379-415; voice.ts:76-100). Age gate: adults only for session users (route.ts:307-316). |
| Subscription | Free plan has a monthly voice allowance of 10 minutes (apps/web/lib/voice/free-voice-allowance.ts:47-58; packages/contracts/types/src/model-catalog.ts:1256). Paid plans use assertTierUnitAllowance for voice_minutes and a usage reservation (route.ts:594-620). CLI also checks the canUseVoice capability before managed transcription (voice.rs:978-986; apps/cli/src/tier_cache.rs:282). Web hides nothing behind a plan; the code comment says voice input remains capability-neutral (ChatComposerNew.tsx:6937). |
| Limits and metering | Rate limit 'audio-transcription' (route.ts:294). Upload cap 25 MB, types listed in route.ts:399-411. Seconds estimated from file size (route.ts:560-570 area). Phone 60 s (voiceInput.ts:68). CLI 120 s with a 300 ms minimum (voice.rs:37-40). VS Code 120 s and 3 MB (apps/extension-vscode/src/protocol/dictationLimits.ts:1-3). Web client sets no time limit that was found. |
| Feature flags | Server kill switch 'dictation' (kill-switches.ts:33). Web setting dictationEnabled. Phone voiceEnabled setting. CLI Cargo feature 'voice'. Desktop dictateIntoFocusedApp preference. |
| Model compatibility | Dictation is independent of the chat model, except the web and VS Code gate by destination: Local and own-key chat models block cloud dictation (ChatComposerNew.tsx:2055-2078; ChatStateManager.ts:5710-5722). |
| Provider restrictions | Server refuses with 'model_may_train' 403 when the user's privacy setting keeps content away from providers that may train (route.ts:506-529). Provider must be openai in the route (route.ts:487-504). |
| Local mode | Phone: dictation always uses on-device recognition and refuses if the model is missing, with no fallback upload (voiceInput.ts:300-330 comment and code). Web/desktop: refused for Local or own-key destinations. CLI: in a Local session, the managed and OpenAI backends are blocked unless AGIWORKFORCE_VOICE_ALLOW_CLOUD=1; a local whisper program is allowed (voice.rs:458-505). VS Code: not available with a local model. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading / transcribing | Web 'Transcribing' spinner with progressbar role; phone shows processing; CLI spinner. | DictationStrip.tsx:109-122; VoiceInputButton.tsx finish; voice.rs:203 |
| Empty result | Web: 'Nothing was heard in that recording. Try again.' Phone: 'Didn't catch that' alert. CLI: '(no speech detected)'. | use-dictation.ts:38,201; ChatInput.tsx:1373; voice.rs:208 |
| Permission denied | Web: 'Microphone permission denied. Please allow access in your browser settings.' Phone: message to enable microphone permission. Chrome: 'spVoiceMicBlocked' text. | voice-input-store.ts:446-455; voiceFailure.ts:14-15; voice.ts:30-33 |
| Network or server error | Web maps 401/403, 402, 413, 429, 5xx to distinct messages and keeps the recording for retry unless the plan refused it. | voice-input-store.ts:153-184, 368-383 |
| Cancel | Web discards audio and inserts nothing; phone X cancels; CLI ESC discards. | use-dictation.ts:125-135; ChatInput.tsx:1422-1427; voice.rs:117-125 |
| Timeout / maximum length | Phone stops at 60 s and keeps what was heard, or errors if nothing; CLI stops at 120 s; server upload 60 s timeout; web no client limit found. | voiceInput.ts:68, 195-225; voice.rs:731; route.ts:728 |
| Offline | Web: 'Could not reach transcription. Check your connection and try again.' Phone: works on device. Chrome: 'network' error text. | voice-input-store.ts:153-156; voice.ts:39-40 |
| Destination or account change mid-recording | Web drops the in-flight transcript when its destination changes; phone cancels on account change or scope change. | useDictation.test.tsx 'drops an in-flight transcript when its destination changes'; VoiceInputButton.tsx useEffect cancelActiveRecording |
| Desktop window hidden while recording | Quick Ask dictation is interrupted with a note because the global shortcut would reach the wrong window. | apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts:26-45; ChatComposerNew.tsx:2107 |
| Reduced motion | Waveform replaced by a flat line when the person prefers reduced motion. | DictationStrip.tsx:91-100 |
| Undo | not verified in the code for web, desktop, phone, Chrome; CLI records composer undo. | brief S49.30; tui_app.rs:7527-7531 |
| Terminal escape characters in a transcript | CLI strips them before display and send. | apps/cli/src/voice.rs:1224-1262 (tests); heard_text at voice.rs:1212 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `test:apps/web/features/chat/stores/voice-input-store.test.ts` (not found): Record start/stop, language subtag, error mapping, retry, plan refusal drops recording, cancellation
- `test:apps/web/features/chat/hooks/useDictation.test.tsx` (not found): Controller states, kill switch, settings off, destination change, send intent
- `test:apps/web/features/chat/components/Composer/DictationStrip.test.tsx` (not found): Controls, waveform bars, discard, stop, send, focus
- `test:apps/web/features/chat/lib/dictation-machine.test.ts` (not found): State transitions
- `test:apps/web/__tests__/api/voice-transcribe.test.ts` (not found): Auth 401s, missing file 400, success, forwarding language and model, upstream errors
- `test:apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts` (not found): Credit reservation, settlement, void on failure, API key billing
- `test:apps/mobile/__tests__/ChatInputDictation.test.tsx` (not found): Phone composer controls, stop vs send, merge of edits, cancel
- `test:apps/mobile/__tests__/VoiceInputButtonFailure.test.tsx` (not found): Phone failure messages and retry prompt
- `test:apps/mobile/__tests__/voice-recognition-locale-and-timeout.test.ts` (not found): On-device locale and 60 s cap
- `test:apps/mobile/__tests__/VoiceOnboarding.test.tsx` (not found): Intro and disclosure sheet
- `test:apps/extension/__tests__/voice-input.test.ts` (not found): Chrome append, reset, notice and click behaviours
- `test:apps/extension-vscode/src/__tests__/dictationClient.test.ts` (not found): VS Code upload to managed endpoint and wire checks
- `test:apps/extension-vscode/src/__tests__/dictationCapturePage.test.ts` (not found): Local recorder page and cancel
- `test:apps/desktop/electron/__tests__/voiceDictation.test.ts` (not found): Global shortcut routing to main window or Quick Ask
- `test:apps/desktop/electron/__tests__/dictationElsewhere.test.ts` (not found): Dictation into another app
- `test:apps/cli/src/voice.rs` (not found): Inline Rust tests for transcript sanitising and the privacy gate (module tests at line 1224)

**Test scenarios**

- **Web insert without send**
  1. Sign in on web with a cloud model selected
  2. Click 'Start voice input', say a sentence, click the square stop
  3. Look at the message field
  - Expected: Sentence appended after any existing text with one space, field focused, nothing sent.
- **Web blocked for Local model**
  1. Select an on-device or own-key model
  2. Click the mic
  - Expected: Error 'Cloud dictation is unavailable for this destination. Type instead.' and no network request to /api/voice/transcribe.
- **Phone offline dictation**
  1. Install the speech model for the language
  2. Turn on airplane mode
  3. Tap the mic, speak, tap again
  - Expected: Live transcript line, then text in the field, no network use.
- **CLI /dictate in Local session**
  1. Build with voice feature
  2. Start a Local session with no whisper program and no opt-in env
  3. Run /dictate
  - Expected: Message that no backend is available or that the privacy boundary blocked cloud audio; no audio uploaded.
- **Kill switch**
  1. Close the dictation switch for the user
  2. Open web composer, click mic
  - Expected: Mic disabled with 'Dictation is temporarily switched off while we investigate a problem with it.'
- **Undo after dictation**
  1. Dictate into web composer
  2. Press the browser undo shortcut
  - Expected: Not established. Run and record the result (S49.30 is unverified).

**Where to look when it fails**

- Server log lines 'Transcription settled' and 'transcription_reservation_failed' (route.ts:122-135 area and 560-600).
- Web error codes voice_minutes_monthly_limit_reached, organization_spend_cap_reached, model_may_train.
- CLI prints 'Transcription failed: ...' with HTTP status.
- Desktop telemetry domain 'voice_shortcut' outcomes (voiceDictation.ts:58-72).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/web/049-dictation-transcription-and-recording.md)
- Desktop: [70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md)
- Mobile: [70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md)
- CLI: [70-qa/test-plans/cli/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/cli/049-dictation-transcription-and-recording.md)
- Chrome: [70-qa/test-plans/chrome/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/chrome/049-dictation-transcription-and-recording.md)
- No hands-on plan yet for VS Code: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Undo of inserted text is not verified in any app.** Affects: Web, desktop, phone, Chrome. Evidence: brief S49.30. Work needed: Add a test per composer; fix if the inserted text is not undoable.
- **Brief says VS Code dictation missing but code and tests exist; the product matrix doc also says VS Code cannot record.** Affects: VS Code; brief and docs accuracy. Evidence: brief S49.01; ChatStateManager.ts:5730; docs/product/surface-feature-matrix.md:328. Work needed: Correct brief and matrix; run a manual check of the browser-tab recorder.
- **Brief says desktop dictation into another app is missing but it is wired behind a preference.** Affects: Desktop. Evidence: apps/desktop/electron/main.ts:1896-1930; brief S49.28. Work needed: Update brief; verify on macOS with a live run (unknown if run).
- **Web and desktop dictation cannot be used with Local or own-key models; no local speech option on web or desktop.** Affects: Web, desktop users in Local or own-key mode. Evidence: ChatComposerNew.tsx:2055-2078. Work needed: Product decision; requirement says local inference should not need a paid plan [proposed: on-device recognizer on desktop].
- **Phone silently drops filler words and may replace the draft on command-like openings.** Affects: Phone. Evidence: packages/platform/utils/src/voice.ts:11-50; ChatInput.tsx:166-171. Work needed: Confirm intended; at least avoid replacing typed text.
- **CLI voice is compiled out by default so most users of default builds cannot dictate.** Affects: CLI. Evidence: apps/cli/Cargo.toml:126-132. Work needed: Confirm which release artifacts carry the feature (release-cli.yml:240-278).
- **No recording notice shown on web or desktop before first use (brief marks unverified).** Affects: Web, desktop. Evidence: brief S49.17. Work needed: Verify and add a notice if absent.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- mode:local
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-authentication-and-identity
- file:apps/web/app/api/llm/v1/audio/transcriptions/route.ts
- api:POST /api/voice/transcribe
- api:POST /api/llm/v1/audio/transcriptions
- provider:openai

## Unknown

- Whether web undo restores the text before dictation (S49.30).
- Whether Chrome's speech service processes audio on the device or sends it to the browser vendor.
- Provider retention of uploaded audio.
- Which usage and ledger table names record transcription cost.
- Whether the old Tauri desktop voice hooks (apps/desktop/src) are still shipped.
- Which CLI release builds include the voice feature.
