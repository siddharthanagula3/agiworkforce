---
id: "F049-09"
type: "feature"
title: "Recording notice and consent"
aliases: ["Recording notice", "Microphone notice", "Voice onboarding sheet", "Recording consent", "agi.notice.microphone", "voice-recording-notice", "S49.17"]
area: "49 Dictation, transcription, and recording"
available_on: ["desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "missing", desktop: "partial", mobile: "built", cli: "built", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.17"]
depends_on: ["SYS-voice-and-media", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-local-inference", "surface:mobile", "surface:chrome", "surface:cli", "surface:vscode", "surface:web", "surface:desktop", "store:settings-store", "mode:local", "mode:own-key", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-09 Recording notice and consent

Before the first capture, some apps tell the person what is recorded and where it goes. Phone shows an introduction sheet with a Continue button. Chrome shows a note with Continue and Not now. Command line asks for ENTER or ESC. VS Code's capture page shows a sentence. Web and desktop show no notice in the code I opened.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.17](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4917).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows a short disclosure before microphone capture so a person knows if audio stays on the device or goes to a server or provider, and lets them continue or cancel.

**Why it exists.** S49.17 requires a notice of what is recorded and where it goes, with agreement, before audio is captured. AGENTS.md section 6 requires explicit consent for moves across trust boundaries.

**Who uses it.** Anyone using dictation for the first time in an app.

**Problems it solves**

- Surprise that speech leaves the device
- No record of agreement to record
- Different destinations (account, own key, local program) look the same without a notice

**Use cases**

- First tap on the phone microphone shows the introduction sheet
- First microphone click in Chrome side panel shows the note
- First /voice in the CLI shows the agreement line
- VS Code user sees the sentence on the browser capture page

## 2. User experience

**Where to find it**

- Phone: first tap of the dictation microphone shows a sheet titled 'Dictation' with button 'Continue' (apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx:63-95, 198-202).
- Chrome extension side panel: a note above the composer with buttons 'Not now' and 'Continue' (apps/extension/_locales/en/messages.json:828-842; apps/extension/src/features/side-panel/voice.ts:68-125).
- Command line: text starting 'voice:' with '[ENTER to agree, ESC to cancel]' (apps/cli/src/voice.rs:379-407).
- VS Code: browser page 'Dictate to ...' with the sentence about audio being sent to AGI Cloud and a 'Start recording' button (apps/extension-vscode/src/features/sidebar-webview/dictationCapturePage.ts:9-31).
- Web and desktop in-app dictation: no notice found.
- Desktop dictate into other apps: a native dialog 'Dictate into other apps?' when the setting is switched on (apps/desktop/electron/main.ts:2078-2089).

**Before you start**

- The person has not yet accepted on this device (phone, Chrome, CLI).
- CLI needs a transcription backend; with none it returns without a notice (apps/cli/src/voice.rs:383-384).

**Screens and controls**

- Phone sheet: close control labelled 'Close dictation introduction', pill 'Continue' with label 'Continue to dictation' (VoiceOnboardingSheet.tsx:198-202).
- Chrome note: role note, 'Not now', 'Continue'; Escape closes it (voice.ts:68-125).
- CLI: ENTER agrees, ESC cancels (voice.rs:405-406).

**Journey**

1. Person taps or presses the microphone for the first time.
2. The notice appears and capture does not start.
3. Person taps Continue (phone, Chrome) or presses ENTER (CLI).
4. The app remembers the answer and starts capture; the browser or OS may then ask for microphone permission.
5. Later presses start capture directly.

**What the person sees and gets**

- Phone disclosure text for on-device dictation: 'Your voice is transcribed on this device and never recorded.' (VoiceOnboardingSheet.tsx:68).
- Phone live voice text: 'Your audio streams directly between this device and the voice provider. The transcript is saved to the chat.' (VoiceOnboardingSheet.tsx:69).
- Chrome text says Chrome turns speech into text with its speech service and AGI receives only the text (messages.json:829).
- CLI text names the destination: your AGI account, the OpenAI transcription API with the person's key, or a program on this computer (voice.rs:381-388).

**Settings**

- Phone remembers acceptance in dictationOnboardingSeen (apps/mobile/stores/settingsStore.ts:56, 134, 155).
- Chrome remembers acceptance in browser local storage under agi.notice.microphone (voice.ts:25, 111).
- CLI remembers it in the file voice-recording-notice inside the config folder (voice.rs:377, 395-401).
- Desktop setting 'Dictate into the app you are using' (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:57, 380-386).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Phone: tapping the microphone before acceptance shows the sheet; hold-to-talk waits until accepted (apps/mobile/src/features/voice/components/VoiceInputButton.tsx:264-265, 303, 319). The sheet saves acceptance on Continue (VoiceOnboardingSheet.tsx:98-111). The sheet is built with mode on-device and purpose dictation (VoiceInputButton.tsx:435-438).
- Phone: acceptance persists under the store name settings-store (settingsStore.ts:166-170), so it lasts across launches [inferred]; the brief says once per install.
- Chrome: the notice shows unless microphone permission is already granted or the notice was acknowledged (voice.ts:272); Continue stores the acknowledgement (voice.ts:111).
- CLI: asks once per destination text; if the stored text matches, it does not ask again (voice.rs:392-394); it is called before recording and before retrying (voice.rs:154, 325).
- VS Code: the capture page states that audio goes to AGI Cloud before the person presses Start recording (dictationCapturePage.ts:21).

**Incomplete**

- VS Code shows a sentence but has no agree-and-remember step; Start recording is the action. (dictationCapturePage.ts:21-27)
- Phone uses a Continue button, not a tick-box agreement.
- Chrome and phone remember acceptance but there is no found screen to withdraw it; unknown.

**Present but disconnected or switched off**

- None found.

**Not available**

- Web composer dictation: no notice, consent or disclosure found in use-dictation.ts, voice-input-store.ts or DictationStrip.tsx (searched for consent, disclosure, notice, acknowledge, first-use, agree). ChatComposerNew.tsx was not searched for this; unknown there.
- Desktop in-app dictation uses the hosted web composer, so it has the same absence [inferred].
- The web privacy page does disclose that dictation sends the recording to a transcription endpoint and that audio is not stored (doc: apps/web/app/privacy/page.tsx:245-260), but that is a page, not a step before capture.

## 4. Required behaviour

**Established requirements**

- Before audio is captured, the user sees a notice of what is recorded and where it goes, and must agree. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.17)
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing may silently route Local audio to BYOK or cloud. (source: AGENTS.md section 6 (doc: AGENTS.md))
- The CLI notice must name the destination. (source: apps/cli/src/voice.rs:379-388)

**Acceptance criteria**

1. On a fresh phone install, the first dictation tap shows the sheet with the on-device sentence and does not record until Continue is tapped.
2. After Continue on phone, the next tap records straight away, including after the app is restarted.
3. In Chrome, the first microphone click shows 'Not now' and 'Continue'; 'Not now' starts nothing.
4. In the CLI, the first /voice shows the destination and ENTER agrees; ESC cancels and no recording is made.
5. In the CLI, changing the destination (for example from a key to a managed account) asks again.
6. On web and desktop, a notice or an accepted decision exists before first capture (currently fails).
7. VS Code's capture page states the destination before recording.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web should show a notice because audio goes to the server and on to a provider. [inferred from route.ts:722 and AGENTS.md section 6]

**Proposed improvements** (suggestions, not requirements)

- Add a one-time notice with Continue to the web dictation microphone and share it with desktop. [proposed]
- Give VS Code a remembered Continue step. [proposed]
- Add a place in settings to review or reset the acceptance. [proposed]

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceOnboardingSheet | `apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx` | Phone disclosure sheet and Continue button. |
| component | VoiceInputButton | `apps/mobile/src/features/voice/components/VoiceInputButton.tsx` | Shows the sheet before first dictation and gates hold-to-talk. |
| store | settingsStore (dictationOnboardingSeen) | `apps/mobile/stores/settingsStore.ts` | Persisted acceptance flag. |
| service | voiceInput | `apps/mobile/src/features/voice/services/voiceInput.ts` | On-device recognition that makes the on-device sentence true. |
| hook | buildMicrophoneNotice / setupVoiceInput | `apps/extension/src/features/side-panel/voice.ts` | Chrome notice and acknowledgement in local storage. |
| config | Chrome notice strings | `apps/extension/_locales/en/messages.json` | spVoiceNotice, spVoiceNoticeContinue, spVoiceNoticeDecline ('Not now'). |
| service | accept_recording_notice | `apps/cli/src/voice.rs` | CLI destination notice and marker file. |
| component | dictationCapturePage | `apps/extension-vscode/src/features/sidebar-webview/dictationCapturePage.ts` | VS Code browser capture page with the destination sentence. |
| service | confirmDictateIntoApps | `apps/desktop/electron/main.ts` | Native confirmation when dictation into other apps is switched on (line 2078). |
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Switch 'Dictate into the app you are using'. |
| component | DictationStrip | `apps/web/features/chat/components/Composer/DictationStrip.tsx` | Web recording strip; no notice found. |
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Web capture controller; no notice found. |
| config | permission policy | `apps/desktop/electron/permissionPolicy.ts` | Desktop grants audio-only media permission to the trusted cloud app origin without a prompt (lines 43-70). |
| other | privacy page | `apps/web/app/privacy/page.tsx` | Public disclosure that audio is not stored (lines 245-260). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person starts capture; the app checks whether the notice was accepted. | device | VoiceInputButton.tsx:264-265; voice.ts:272; voice.rs:392-394 |
| If not accepted, the notice is shown and capture waits. | device | VoiceOnboardingSheet.tsx:98-111; voice.ts:99-125; voice.rs:396-406 |
| On agree, the answer is saved locally and capture starts. | device | settingsStore.ts:155; voice.ts:111; voice.rs:399-402 |
| Phone recognition runs on the device; Chrome uses the browser's speech service; CLI sends to the chosen backend; VS Code and web send audio to our servers. | device and our servers | voiceInput.ts:309-321; voice.ts:143-145; voice.rs:379-388; dictationClient.ts:30 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Acceptance flag (phone) | phone settings store settings-store | no sync found | kept until app data is cleared [inferred] |
| Acknowledgement (Chrome) | browser local extension storage key agi.notice.microphone | not synced by this code | kept until extension data cleared [inferred] |
| Notice marker (CLI) | file voice-recording-notice in the CLI config folder, holding the destination text | no | overwritten when a new destination is agreed (voice.rs:395-401) |

**Models and providers.** The notice itself uses no model. The destination it names can be the managed account, the person's own provider key or a local program, which maps to Cloud, own key and Local modes. (apps/cli/src/voice.rs:381-388)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found for the notice. CLI managed destination needs a signed-in token (voice.rs detect_backend). |
| Permissions | Microphone permission is separate: Chrome checks navigator.permissions (voice.ts:54), phone requests speech and microphone permission (voiceInput.ts:231-239), desktop grants audio-only media for the trusted app origin (permissionPolicy.ts:60-70). |
| Subscription | None found for the notice. |
| Limits and metering | None found for the notice. |
| Feature flags | None found for the notice. |
| Model compatibility | Not applicable. |
| Provider restrictions | The CLI notice names the openai transcription API when that backend is used (voice.rs:383). |
| Local mode | Phone on-device dictation says nothing leaves the device and the code refuses to fall back to a server if the on-device model is missing (voiceInput.ts:307-321). CLI local program says it does not leave the computer (voice.rs:384-385). CLI Local privacy mode also gates cloud egress (voice.rs:975-980). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person declines | Phone closes the sheet (onDismiss); Chrome 'Not now' closes and returns focus; CLI ESC returns false and nothing records. | VoiceOnboardingSheet.tsx:98; voice.ts:101-104; voice.rs:405-409 |
| Microphone permission blocked | Chrome shows a blocked message (spVoiceMicBlocked); phone maps to mic-permission-denied. | voice.ts:33-34; voiceInput.ts:12 |
| Storage unavailable | Chrome treats a storage failure as not acknowledged and shows the notice again. | voice.ts:61-67 |
| No CLI backend | accept_recording_notice returns false without a notice. | voice.rs:383-384 |
| Accessibility | Chrome note has an aria-label, role note and focus moves to Continue; phone Continue has an accessibility label. | voice.ts:76-125; VoiceOnboardingSheet.tsx:198 |
| Offline | Not handled in the code for the notice itself. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/VoiceOnboarding.test.tsx`: Phone voice onboarding sheet.
- `apps/mobile/__tests__/VoiceInputButtonHoldTranscript.test.tsx`: Phone microphone hold behaviour.
- `apps/extension/__tests__/voice-input.test.ts`: Chrome voice input including the notice and Continue.
- `apps/extension-vscode/src/__tests__/dictationCapturePage.test.ts`: VS Code capture page.
- `apps/desktop/electron/__tests__/hostPreferences.test.ts`: Confirmation before dictation into other apps is turned on.

**Test scenarios**

- **Phone first dictation**
  1. Install fresh or clear app data
  2. Open chat and tap the dictation microphone
  - Expected: Sheet 'Dictation' with the on-device sentence; no recording until Continue.
- **Chrome decline**
  1. Clear extension storage
  2. Click the microphone and choose Not now
  - Expected: No microphone prompt; note closes; clicking again shows it again.
- **CLI destination change**
  1. Run /voice with a managed account and press ENTER
  2. Switch to a local program backend and run /voice again
  - Expected: A new notice appears naming the new destination.
- **Web first dictation**
  1. Open web chat as a new user
  2. Click the dictation microphone
  - Expected: Today recording starts with no notice; this is the known gap.
- **VS Code page**
  1. Click 'Dictate with AGI Cloud'
  2. Read the browser page
  - Expected: The page says audio goes to AGI Cloud; recording starts only on Start recording.

**Where to look when it fails**

- CLI marker file voice-recording-notice in the config folder.
- Chrome storage key agi.notice.microphone.
- Phone persisted store settings-store key dictationOnboardingSeen.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md)
- Mobile: [70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md)
- CLI: [70-qa/test-plans/cli/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/cli/049-dictation-transcription-and-recording.md)
- Chrome: [70-qa/test-plans/chrome/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/chrome/049-dictation-transcription-and-recording.md)
- No hands-on plan yet for VS Code: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No notice before first web dictation** Affects: Web and desktop in-app dictation. Evidence: no match in use-dictation.ts, voice-input-store.ts, DictationStrip.tsx. Work needed: Add a shared notice and remembered acceptance to the web composer.
- **VS Code has a sentence but no agreement step** Affects: VS Code. Evidence: dictationCapturePage.ts:21-27. Work needed: Add Continue and remember it, if the requirement is agreement.
- **Brief lists Chrome and VS Code as missing but code exists** Affects: Brief accuracy. Evidence: voice.ts:68-125; dictationCapturePage.ts:21. Work needed: Correct statuses.
- **No way found to review or withdraw acceptance** Affects: Phone, Chrome, CLI. Evidence: not found. Work needed: Add reset in settings.
- **Phone uses Continue, not an explicit agree tick** Affects: Phone. Evidence: VoiceOnboardingSheet.tsx:202. Work needed: Decide whether Continue satisfies 'must agree'.
- Not built on: Web (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-local-inference
- surface:mobile
- surface:chrome
- surface:cli
- surface:vscode
- surface:web
- surface:desktop
- store:settings-store
- mode:local
- mode:own-key
- mode:cloud

## Unknown

- Whether ChatComposerNew.tsx shows any consent step before dictation.
- Whether the phone sheet persistence uses a device storage engine that survives reinstall; stated 'once per install' in the brief only.
- Whether Desktop Tauri build shows any notice (retained internal build).
- Whether acceptance can be reset in any app.
