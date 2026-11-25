---
id: "F048-07"
type: "feature"
title: "Audio devices (microphone and speaker)"
aliases: ["Audio devices", "Audio output picker", "AudioRoutePicker", "Audio route", "Input-device selection (S48.18)", "Output-device selection (S48.19)", "Speaker/Bluetooth routing (S48.20)", "Microphone setting"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.18", "S48.19", "S48.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "provider:openai", "plan:free", "SYS-voice-and-media", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "F048-10", "F048-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-07 Audio devices (microphone and speaker)

Lets a person choose where the assistant's voice plays. On web and the public Desktop (which shows the web app) it is an 'Audio output' menu inside Voice settings. On iPhone it is an 'Audio route' sheet (Automatic, Speaker, Bluetooth, Headset). Live voice always records from the default microphone; a microphone choice exists only for dictation.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.18](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4818), [S48.19](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4819), [S48.20](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4820).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Controls which speaker or headset plays live voice replies (web, Desktop, iPhone) and records which microphone is in use. A web Settings > Voice page also has a 'Microphone' choice, but the code uses it for dictation only, not for live voice (apps/web/features/settings/sections/VoiceSection.tsx:125-168; apps/web/features/chat/lib/live-voice-session.ts:480-482).

**Why it exists.** People use headsets, Bluetooth speakers and several microphones. A voice call that cannot be rerouted forces them to change the whole system output. The brief lists input choice, output choice and speaker/Bluetooth routing as separate items (doc: knowledge-base/data/area-briefs/048-voice-conversation-interface.md S48.18-S48.20).

**Who uses it.** Anyone on web, Desktop or iPhone who starts a live voice conversation and has more than one audio device.

**Problems it solves**

- Voice plays through the wrong speaker.
- On iPhone, voice plays out loud when a headset is wanted, or the reverse.
- The person cannot tell which microphone the call is using (the mute button tooltip names it on web).

**Use cases**

- On web, switch the reply voice from laptop speakers to a USB headset during a call.
- On iPhone, force the call to the loud speaker, or prefer a paired Bluetooth headset.
- On web, check which microphone the call opened by hovering the mute button.
- In Settings > Voice, pick the microphone that dictation records from.

## 2. User experience

**Where to find it**

- Web and public Desktop: start voice with the 'Start voice mode' button in the chat composer (apps/web/features/chat/components/Composer/VoiceEntryButton.tsx:9), tap the gear named 'Voice settings' (apps/web/features/chat/components/Voice/VoiceHeaderLabel.tsx:10-27), then use the 'Audio output' control at the bottom of the dialog (apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:407; apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:10-15).
- Web and Desktop dictation microphone: Settings > Voice > 'Microphone', described 'Used for dictation' (apps/web/features/settings/sections/VoiceSection.tsx:136-150).
- iPhone: the route button in the live voice bar, accessibility label 'Audio route, <name>' (apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:54; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:721).
- Android: no route control (apps/mobile/src/features/voice/services/audioRoute.ts:59-61).
- CLI: no device control; the default input device is used (apps/cli/src/voice.rs:528-533, 623-629).

**Before you start**

- Web output menu: a signed-in Cloud chat where voice is allowed, a browser that can set the audio sink, and at least two output devices (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:24-28, 103).
- Device names show only after the browser has granted some audio access; before that an entry reads 'Audio output' (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:30-33, 51-53).
- iPhone: a Cloud chat with live voice available (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:21-27).

**Screens and controls**

- Web: menu button 'Audio output, <device>' (data-testid voice-audio-route-trigger) opening a radio menu 'Audio output device'; first entry shows 'System default' (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:109-127, 130-134).
- Web: mute button titled 'Turn off microphone, <microphone name>' so the active microphone is visible (apps/web/features/chat/components/Voice/VoiceComposer.tsx:54-55).
- iPhone: sheet titled 'AUDIO ROUTE' with Automatic, Speaker, Bluetooth, Headset and a hint under each (apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:114, 130-163; apps/mobile/src/features/voice/services/audioRoute.ts:12-24).

**Journey**

1. 1. Start a live voice conversation (web: 'Start voice mode'; iPhone: live voice from the chat).
2. 2. Open the output control (web: gear 'Voice settings', then 'Audio output'; iPhone: route button).
3. 3. Pick a device or route.
4. 4. Web: the browser is asked to move the reply audio element to that device and the menu closes (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:87-100). iPhone: the choice is saved and applied to the audio session (apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:34-42).
5. 5. Keep talking; replies play on the new device.

**What the person sees and gets**

- Web: the trigger label changes to the chosen device and a check mark shows in the menu (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:125, 141, 155).
- Web: if the browser refuses the switch nothing is shown and the old route stays (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:92-95; test: apps/web/features/chat/components/Voice/AudioRoutePicker.test.tsx:73).
- iPhone: if the route cannot be applied, the sheet stays open with a polite message 'Could not switch audio to <route>. This call may use a different output.' (apps/mobile/src/features/voice/services/audioRoute.ts:73-75; apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:116-129). At call start an unapplied saved route shows the same notice (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:314-317).

**Settings**

- Web/Desktop: Settings > Voice > 'Microphone' (device id kept in the persisted voice input store, dictation only) (apps/web/features/chat/stores/voice-input-store.ts:280-282, 438-441).
- iPhone: saved audio route preference, default 'auto' (apps/mobile/stores/settingsStore.ts:58, 136, 157, 183).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web output switching through the browser's audio-sink call on the live reply element, with keyboard menu support and a menu that disappears when fewer than two outputs exist (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:34-103).
- Web device list refreshes on the browser's device-change event (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:61-65).
- Web microphone name shown on the mute button (apps/web/features/chat/hooks/use-voice-session.ts:748, 839; apps/web/features/chat/lib/live-voice-session.ts:612-614).
- Web Settings > Voice microphone choice is stored and used by dictation (apps/web/features/chat/stores/voice-input-store.ts:280-282).
- iPhone route sheet and call-start application of the saved route (apps/mobile/src/features/voice/services/audioRoute.ts:37-71; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:314-317).
- Public Desktop shows the hosted web app, so it carries the same web picker (doc: AGENTS.md section 5) [inferred for Electron audio-sink support].

**Incomplete**

- Live voice microphone choice: the live session asks the browser for the default microphone only (apps/web/features/chat/lib/live-voice-session.ts:480-482); iPhone asks for default audio (apps/mobile/src/features/voice/services/liveVoiceSession.ts:298).
- Web output choice is held in component state and not saved (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:79) [inferred: no store write]; each session builds a new reply audio element (apps/web/features/chat/lib/live-voice-session.ts:489) and nothing re-applies the choice [inferred], so after a reconnect or pause/resume the menu may still show the old device while audio plays on the default.
- Web refusal of a switch is silent (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:92-95).

**Present but disconnected or switched off**

- Web Settings > Voice 'Microphone' is not read by the live voice session; it feeds only dictation (apps/web/features/settings/sections/VoiceSection.tsx:139; apps/web/features/chat/lib/live-voice-session.ts:480-482).

**Not available**

- Microphone choice for live voice on web, Desktop, iPhone and CLI.
- Android route switching: the picker returns nothing off iOS (apps/mobile/src/features/voice/services/audioRoute.ts:59-61).
- CLI output device: voice mode only records and prints text; it plays no audio (apps/cli/src/voice.rs:75-300).
- VS Code and Chrome extension: no live voice.

## 4. Required behaviour

**Established requirements**

- The user can choose which microphone voice uses. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S48.18)
- The user can choose which speaker voice plays through. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S48.19)
- On devices with a speaker and Bluetooth the user can route audio between speaker, earpiece/headset and Bluetooth. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S48.20)
- Voice must have recoverable states for absent microphone and permission denial, and exit must release capture and playback. (source: doc: docs/product/experience-contract.md:786 (W13))

**Acceptance criteria**

1. On web with two or more outputs and a browser that supports setting the audio sink, the Voice settings dialog shows an 'Audio output' control; choosing a device moves the reply audio to it and marks it.
2. With one output, or a browser that cannot switch, no output control is shown.
3. If the browser refuses a switch the previously selected device stays marked.
4. On iPhone the route sheet lists Automatic, Speaker, Bluetooth, Headset; choosing one is saved and applied, and an unappliable route shows the 'Could not switch audio' message.
5. On Android and CLI no route control appears.
6. Live voice starts on the microphone the person chose (currently fails: default microphone only).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The output choice should survive reconnect and pause/resume inside one call [inferred from the new audio element at apps/web/features/chat/lib/live-voice-session.ts:489].
- A refused switch should tell the person, as iPhone does [inferred from apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:116-129].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass the Settings > Voice microphone id to the live session's microphone request and show a microphone control next to 'Audio output'.
- [proposed] Re-apply the chosen sink whenever a new session creates its reply element.
- [proposed] Show a one-line notice when the browser refuses an output switch.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AudioRoutePicker (web) | `apps/web/features/chat/components/Voice/AudioRoutePicker.tsx` | Lists audio outputs, sets the audio sink on the live reply element, hides itself with fewer than two outputs. |
| hook | useAudioOutputDevices | `apps/web/features/chat/components/Voice/AudioRoutePicker.tsx` | Enumerates audio outputs and refreshes on device change. |
| component | VoiceSettingsModal | `apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx` | Dialog titled 'Voice settings' that renders the audioOutput slot (line 407). |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Passes AudioRoutePicker with the live output ref into the settings dialog (line 659). |
| component | VoiceComposer | `apps/web/features/chat/components/Voice/VoiceComposer.tsx` | Mute button whose tooltip names the active microphone (lines 54-55). |
| hook | useVoiceSession / liveVoiceOutputRef | `apps/web/features/chat/hooks/use-voice-session.ts` | Publishes the live reply audio element (line 201, 690) and the microphone label (line 748). |
| service | LiveVoiceSession.start | `apps/web/features/chat/lib/live-voice-session.ts` | Requests the default microphone (480-482) and creates the reply audio element (489). |
| component | VoiceSection (Settings > Voice) | `apps/web/features/settings/sections/VoiceSection.tsx` | 'Microphone' select used by dictation. |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Persists microphoneId and applies it to dictation capture (280-282, 438-441). |
| component | AudioRoutePicker (mobile) | `apps/mobile/src/features/voice/components/AudioRoutePicker.tsx` | iPhone route sheet. |
| service | audioRoute | `apps/mobile/src/features/voice/services/audioRoute.ts` | Route names, hints, iOS audio-session category options, support check (iOS only). |
| store | settingsStore audioRoute | `apps/mobile/stores/settingsStore.ts` | Saves the chosen route, default 'auto'. |
| hook | useLiveVoiceSession | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Applies the saved route at call start and reports a notice when it fails (314-317). |
| component | LiveVoiceBar | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Hosts the compact route button (line 721) and the route notice (363-376). |
| service | live voice microphone request (mobile) | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | getUserMedia with default audio (line 298). |
| component | CLI audio capture | `apps/cli/src/voice.rs` | Default input device only (528-533, 623-629). |
| config | desktop media permission policy | `apps/desktop/electron/permissionPolicy.ts` | Grants audio-only media to the trusted app origin (46-68). |
| test | AudioRoutePicker web test | `apps/web/features/chat/components/Voice/AudioRoutePicker.test.tsx` | Covers the web output menu. |
| test | AudioRoutePicker mobile test | `apps/mobile/__tests__/AudioRoutePicker.test.tsx` | Covers route contract and sheet. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the browser lists audio outputs and the person picks one. | device | apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:41-65, 87-100 |
| Web: the reply audio element, fed by the realtime connection's remote track, is told to play on the chosen device. | device | apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:89-96; apps/web/features/chat/lib/live-voice-session.ts:489-505 |
| Live voice asks the browser for the default microphone with echo cancellation, noise suppression and gain control, and streams it to the voice provider over a realtime connection set up through our server. | device and our servers | apps/web/features/chat/lib/live-voice-session.ts:480-482, 528-548 |
| The provider session is created by our server with a provider key; audio then flows between the browser and the provider. | outside service | apps/web/app/api/voice/live/sessions/route.ts:235, 533; apps/web/app/subprocessors/page.tsx:115 |
| iPhone: the chosen route becomes an iOS audio-session category with options and is applied through the speech-recognition module. | device | apps/mobile/src/features/voice/services/audioRoute.ts:26-71 |
| Dictation (not live voice) asks for the saved microphone as an ideal device id. | device | apps/web/features/chat/stores/voice-input-store.ts:280-284 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web output device choice | Component state only, not saved [inferred] | No | Lost when the picker unmounts (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:79) |
| Web dictation microphone id | store:voice-input-store (persisted browser storage, fields language and microphoneId) | No sync path found in the store (apps/web/features/chat/stores/voice-input-store.ts:438-441) | Kept in the browser until cleared |
| iPhone audio route | store:settingsStore (persisted) | unknown | Reset to 'auto' if the stored value is not a known route (apps/mobile/stores/settingsStore.ts:183) |

**Models and providers.** Device choice does not involve a model. The live reply audio comes from the realtime voice model resolved from the voice_live routing slot on our managed OpenAI route (apps/web/app/api/voice/live/sessions/route.ts:189-195, 235; doc: apps/web/app/subprocessors/page.tsx:115). The person cannot change that model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Live voice needs a signed-in account (apps/web/app/api/voice/live/sessions/route.ts:231-236 reads the signed-in user; mobile asks the same, apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:19-26). The device picker itself has no separate account rule. |
| Permissions | Browser microphone permission is required for the call; denial gives 'Microphone access was denied. Allow the microphone to use voice mode.' (apps/web/features/chat/lib/live-voice-session.ts:62). The Desktop shell grants audio-only media to the trusted app origin and refuses camera (apps/desktop/electron/permissionPolicy.ts:46-57). |
| Subscription | Voice needs a plan that allows it (allowVoice) (apps/web/app/api/voice/live/sessions/route.ts:311); the Free plan gets 10 voice minutes a month (packages/contracts/types/src/model-catalog.ts:1255-1256). The device picker has no plan rule. |
| Limits and metering | None found in the code for the picker. Voice minutes are metered separately (see F048-10). |
| Feature flags | Voice entry needs the canUseVoice capability on the client and server (apps/web/features/chat/pages/WebChatPage.tsx:5905; apps/web/app/api/voice/live/sessions/route.ts:300-306). |
| Model compatibility | Not applicable: output and microphone handling is independent of the chat model. The voice entry button is hidden for chats on a local model or non-managed provider (apps/web/features/chat/pages/WebChatPage.tsx:5907-5911). |
| Provider restrictions | Live voice uses the managed OpenAI route only; the slot must resolve to a managed provider or the session fails (apps/web/app/api/voice/live/sessions/route.ts:194-196). Own-key chats cannot start live voice from the web app (apps/web/features/chat/pages/WebChatPage.tsx:5907-5911). |
| Local mode | Web: with a local model selected the voice entry is not offered and the output picker is unreachable (apps/web/features/chat/pages/WebChatPage.tsx:5907-5911, 7672). iPhone: live voice answers 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' so the route button is not shown in Local (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17-18, 25). Microphone choice for dictation works without a plan [inferred; dictation itself goes to a Cloud transcription route]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Fewer than two outputs, or browser cannot set the audio sink | The web picker renders nothing, no dead control. | apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:24-28, 103; test apps/web/features/chat/components/Voice/AudioRoutePicker.test.tsx:134-141 |
| Browser refuses the switch | Old device stays marked; no message on web. iPhone shows a polite notice. | apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:92-95; apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:116-129 |
| Device labels hidden before audio permission | Entries show 'Audio output' or 'System default'. | apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:30-33, 51-53 |
| Keyboard use | Arrow keys, Escape and focus return are handled. | apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:85; test lines 88-132 |
| Reconnect or resume inside a call | A new reply element is created; re-applying the old choice is not handled in the code. | apps/web/features/chat/lib/live-voice-session.ts:489; no sink call found there |
| Android | No route control. | apps/mobile/src/features/voice/services/audioRoute.ts:59-61 |
| Microphone missing or denied | Start fails with a message; permission granted later retries automatically on web. | apps/web/features/chat/lib/live-voice-session.ts:290-302; apps/web/features/chat/hooks/use-voice-session.ts:898-922 |
| Offline | not handled in the code for the picker. | searched AudioRoutePicker.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Voice/AudioRoutePicker.test.tsx`: Trigger names active output, switching and marking, refused switch keeps old route, keyboard focus and Escape, hidden with one output or no support.
- `apps/web/features/chat/components/Voice/VoiceComposer.test.tsx`: Microphone tooltip names the input device (line 41).
- `apps/web/features/settings/sections/VoiceSection.test.tsx`: Settings > Voice section; whether it checks the microphone select was not read.
- `apps/mobile/__tests__/AudioRoutePicker.test.tsx`: Route-to-category contract, reading a route back, unsupported platform, sheet switch and 'not applied' state, width cap.
- `apps/mobile/__tests__/LiveVoiceAudioRouteNotice.test.tsx`: Call starts with a notice when the saved route cannot be applied; none when applied or unsupported.

**Test scenarios**

- **Web output switch**
  1. Sign in on web with a Cloud chat and a headset plugged in.
  2. Tap 'Start voice mode', open 'Voice settings'.
  3. Open 'Audio output' and choose the headset.
  4. Speak a question.
  - Expected: The reply plays in the headset and the menu shows it checked.
- **Reconnect keeps output**
  1. Choose a non-default output.
  2. Turn off the network until 'Reconnecting, attempt' appears, then turn it back on.
  3. Ask another question.
  - Expected: Required: the reply still plays on the chosen device. Unverified: the code does not re-apply the sink.
- **Live microphone choice**
  1. In Settings > Voice choose a second microphone.
  2. Start voice mode and hover the mute button.
  - Expected: Required: the tooltip names the chosen microphone. Current code is expected to name the default microphone.
- **iPhone route**
  1. Open a Cloud chat on iPhone and start live voice.
  2. Tap the route button and choose Speaker, then Bluetooth with no Bluetooth device.
  - Expected: Speaker applies. For an unappliable route the sheet shows 'Could not switch audio to bluetooth...'.
- **Single output**
  1. Use a machine with one output on web.
  - Expected: No 'Audio output' control appears.

**Where to look when it fails**

- Browser console: enumerateDevices and sink errors are swallowed on web (AudioRoutePicker.tsx:57, 95), so inspect device list in browser media settings.
- Mobile: the route notice text 'Could not switch audio to' in the live bar.
- Server: log event live_voice_not_configured when the provider key is missing (apps/web/app/api/voice/live/sessions/route.ts:237).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **No microphone choice for live voice** Affects: Web, Desktop, iPhone, CLI users with more than one microphone. Evidence: apps/web/features/chat/lib/live-voice-session.ts:480-482; apps/mobile/src/features/voice/services/liveVoiceSession.ts:298; apps/cli/src/voice.rs:623-629. Work needed: Pass the saved microphone id into the session's microphone request and add a visible control in voice mode.
- **The brief marks Speaker/Bluetooth routing as not applicable everywhere, but iPhone has it** Affects: Documentation, testers. Evidence: apps/mobile/src/features/voice/services/audioRoute.ts:8-31; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:721. Work needed: Correct S48.19/S48.20 statuses in the brief; add Android routing if wanted.
- **Web output choice may be lost after reconnect or pause/resume, and refusal is silent** Affects: Web and Desktop users on headsets. Evidence: apps/web/features/chat/lib/live-voice-session.ts:489; apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:79, 92-95. Work needed: Re-apply the sink on every new session and show a notice on refusal.
- **The output control lives inside the settings dialog, not on the call screen** Affects: Web users. Evidence: apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:407. Work needed: Decide whether it should sit on the voice composer; first draft of this page wrongly placed it in VoiceComposer.
- **CLI has no input device choice** Affects: CLI users. Evidence: apps/cli/src/voice.rs:623-629 (error text 'Try specifying an input device explicitly' at 660-661 offers no way to). Work needed: Add a flag or setting naming an input device.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- provider:openai
- plan:free
- SYS-voice-and-media
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- F048-10
- F048-08

## Unknown

- Whether the Electron Desktop window supports setting the audio sink; not tested and no Electron-specific code found.
- Which desktop and mobile browsers lack audio-sink support; not checked against current browser documentation.
- Whether the microphone choice in Settings > Voice is meant to later feed live voice.
- Whether iPhone speech-recognition category changes affect the realtime call audio path as intended; no run recorded.
- Whether apps/mobile/src/features/voice/services/serverSpeech.ts sets background or output audio modes; not opened.
