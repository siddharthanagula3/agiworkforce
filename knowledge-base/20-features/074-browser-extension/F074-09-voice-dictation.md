---
id: "F074-09"
type: "feature"
title: "Voice dictation"
aliases: ["Voice dictation", "Voice input", "Microphone button", "Dictation language", "Microphone access", "S74.21 Voice entry where supported"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.21"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-shared-ui-and-design", "api:GET /api/me", "store:chrome-storage-local", "store:chrome-storage-sync", "file:apps/extension/src/features/side-panel/voice.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-09 Voice dictation

A microphone button in the Chrome extension's chat composer turns speech into text using the browser's built-in speech recognition, and adds the words to the message box. It shows only when the account allows voice, asks the person to agree before first use, and gives a specific message for each speech error.

Area: [74. Browser extension](README.md). Requirement items: [S74.21](../../10-requirements/capabilities/074-browser-extension.md#s7421).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Adds the spoken sentence to the composer text. The browser's speech service does the recognition; the extension receives only the resulting text (_locales/en/messages.json key spVoiceNotice; apps/extension/src/features/side-panel/voice.ts).

**Why it exists.** Claude and ChatGPT let people dictate messages. The brief requires that the user dictates a message by voice where the browser supports it (doc: knowledge-base/data/area-briefs/074-browser-extension.md:101-104; doc: docs/product/surface-feature-matrix.md:68 lists Voice as present on chrome).

**Who uses it.** Extension users who prefer speaking to typing, with a microphone and a Chrome that supports speech recognition.

**Problems it solves**

- Typing long messages in a narrow side panel
- Hands-busy use

**Use cases**

- Dictate a question about the open page
- Dictate in a non-English language chosen in Options
- Retry after a 'No speech was heard' message

## 2. User experience

**Where to find it**

- surface:chrome: microphone button (tooltip 'Voice input' or 'Voice input · <language>') in the composer button row, beside Send (apps/extension/src/side_panel.ts:14099-14105, 15633).
- surface:chrome: Options page, row 'Dictation' (language select) and row 'Microphone access' with button 'Allow microphone access' (features/options/preference-rows.ts:86-100; microphone-section.ts:33-60).
- Other apps: not part of this feature. Voice exists elsewhere as separate features (doc: docs/product/surface-feature-matrix.md:68).

**Before you start**

- The account capability canUseVoice is allowed; otherwise the button is hidden (side_panel.ts:15242).
- A browser with SpeechRecognition or webkitSpeechRecognition; otherwise the button is disabled with 'Voice input is not supported in this browser' (voice.ts:131-140).
- Microphone permission for the extension, unless already granted.

**Screens and controls**

- Microphone button: idle icon, active pulse while listening, aria-pressed state, tooltip 'Listening… click to stop'.
- First-use notice above the composer, named 'Before you dictate', with buttons 'Not now' and 'Continue'; Escape closes it (voice.ts:68-120).
- Options: 'Dictation' language select with help 'The microphone transcribes in this language. The list is the languages this browser is set up for; add more in Chrome's language settings.'

**Journey**

1. Click the microphone.
2. First time and permission not yet granted: read the notice and press 'Continue' (the answer is stored); 'Not now' closes it.
3. Chrome may ask for microphone access; allow it.
4. Speak one sentence; the button pulses while listening.
5. The recognised words are added to the composer text, after any text already typed.
6. Click the button again to stop early, or fix an error message shown above the composer.

**What the person sees and gets**

- Words appended to the composer text.
- Error messages: microphone blocked ('Microphone access is blocked. Allow the microphone for AGI in Chrome site settings, then try again.'), service not allowed ('Voice recognition is not available in this browser profile.'), no microphone ('No microphone was found.'), no speech ('No speech was heard. Try again and speak after the button starts pulsing.'), network ('Voice recognition needs a network connection.'), generic ('Voice input failed. Try again.'). Aborted shows nothing (voice.ts:27-41).

**Settings**

- Dictation language, stored under key agi_dictation_language in store:chrome-storage-sync; empty means the browser default (dictation-language.ts).
- Microphone notice acknowledgement under key agi.notice.microphone in store:chrome-storage-local (voice.ts:25-26).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Capability gate: the button is hidden unless capabilityAllowed(capabilityDocument, 'canUseVoice') is true; without a loaded document the answer is false, so the button is hidden when signed out or the account document did not load (side_panel.ts:15242; apps/extension/src/features/cloud-bridge/capabilityDocument.ts:87-92; packages/contracts/types/src/capability-handshake/evaluator.ts:120-125).
- Unsupported browsers get a disabled button with a tooltip (voice.ts:131-140).
- Permission check first: if the permission state is denied, the blocked message shows without starting; if granted, or the notice was acknowledged, listening starts; otherwise the notice appears (voice.ts:230-262).
- Result handling: only the first result and first alternative are used; interim results are off; the text is appended with appendComposerText (voice.ts:185-200).
- Ending without text and without the person pressing stop shows the generic error (voice.ts:215-222).
- Chat reset or panel switch aborts the session and ignores late callbacks through a generation counter (voice.ts:150-175).
- Language comes from the stored dictation language and updates when it changes in sync storage (voice.ts:177-185).

**Incomplete**

- Recognition is single-shot: continuous mode is not set, so each press captures one utterance [inferred from voice.ts:190-200, no continuous flag].
- Which capability row applies to the Chrome extension is not visible: the extension asks /api/me with surface=web (capabilityDocument.ts:15) and the shared capability table has rows for web, desktop and mobile only (packages/contracts/types/src/capabilities.ts:40, 73, 106). How the server decides canUseVoice for the extension: unknown.

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- surface:web, surface:desktop, surface:mobile, surface:cli, surface:vscode: not part of this feature.
- Local on-device speech models: none in the extension; recognition is the browser's.

## 4. Required behaviour

**Established requirements**

- The user dictates a message by voice where the browser supports it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.21)
- The button is hidden unless canUseVoice is allowed. (source: code: apps/extension/src/side_panel.ts:15242)
- Dictation never starts without the person's agreement to the microphone notice or an already granted permission. (source: code: apps/extension/src/features/side-panel/voice.ts:230-262)

**Acceptance criteria**

1. With canUseVoice denied or no account document, no microphone button is visible.
2. In a browser without speech recognition the button is disabled and its tooltip reads 'Voice input is not supported in this browser'.
3. First click with permission not granted shows the notice; 'Not now' starts nothing; Escape closes the notice and returns focus to the button.
4. After 'Continue', the notice does not appear again.
5. With microphone blocked in Chrome, the blocked message appears and no listening starts.
6. A spoken sentence is added to the end of existing composer text without erasing it.
7. Each of the five error kinds shows its own message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Audio must not be sent to AGI servers; only text enters the chat [inferred from notice text spVoiceNotice].
- The microphone notice must say that Chrome's speech service processes the audio [from locale text].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer continuous dictation with interim text.
- [proposed] Offer a local speech model where the product requires free local inference, subject to a product decision.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | setupVoiceInput | `apps/extension/src/features/side-panel/voice.ts` | Wires the microphone button to SpeechRecognition, permission, notice and errors. |
| component | buildMicrophoneNotice | `apps/extension/src/features/side-panel/voice.ts` | First-use notice with Not now, Continue and Escape. |
| service | describeVoiceError | `apps/extension/src/features/side-panel/voice.ts` | Maps speech error codes to messages. |
| component | Composer microphone button and wiring | `apps/extension/src/side_panel.ts` | Creates sp-mic-btn (14099), hides it by capability (15242), mounts the notice and calls setupVoiceInput (15777-15833). |
| service | Dictation language | `apps/extension/src/features/side-panel/dictation-language.ts` | Reads and writes the language choice and lists browser languages. |
| component | Dictation language row | `apps/extension/src/features/options/preference-rows.ts` | Options select and help text (createDictationLanguageRow). |
| component | Microphone access row | `apps/extension/src/features/options/microphone-section.ts` | Reads and requests microphone permission from Options. |
| service | Composer text append | `apps/extension/src/features/side-panel/composerText.ts` | appendComposerText adds the transcript to the textarea. |
| service | Capability document client | `apps/extension/src/features/cloud-bridge/capabilityDocument.ts` | Fetches /api/me?surface=web and answers capabilityAllowed. |
| schema | PlatformCapability canUseVoice | `packages/contracts/types/src/capabilities.ts` | Defines the canUseVoice capability name used by the gate. |
| endpoint | GET /api/me | `apps/web/app/api/me/route.ts` | Returns the account and capability handshake the gate reads. |
| config | Locale strings | `apps/extension/_locales/en/messages.json` | Keys spVoice*, optMicrophone*, spDictation*. |
| test | voice-input.test.ts | `apps/extension/__tests__/voice-input.test.ts` | 'voice input lifetime' cases. |
| test | dictation-language.test.ts | `apps/extension/__tests__/dictation-language.test.ts` | Dictation language preference, row and tooltip. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person clicks the microphone; the extension reads the microphone permission state. | device | voice.ts:230-262 |
| If needed the notice is shown; Continue stores the acknowledgement and starts recognition. | device | voice.ts:95-120 |
| The browser's SpeechRecognition captures audio and turns it into text using the browser vendor's speech service. | outside service | _locales/en/messages.json spVoiceNotice: 'Chrome turns your speech into text with its speech service'; error spVoiceErrorNetwork |
| The transcript is appended to the composer; it leaves the device only when the person sends the message. | device | voice.ts:190-200 |
| The capability gate decision came from the account document fetched earlier from AGI servers. | our servers | capabilityDocument.ts:55-75; side_panel.ts:13401 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Spoken audio | not stored by the extension; handled by the browser's speech service | not by AGI | governed by the browser vendor: unknown |
| Transcript text | composer text box, then the chat if sent | as any chat message | as the chat |
| Notice acknowledgement | store:chrome-storage-local key agi.notice.microphone | no | kept |
| Dictation language | store:chrome-storage-sync key agi_dictation_language | through the Chrome profile | kept until changed |

**Models and providers.** No AGI model or provider is used. Recognition is done by the browser's own engine.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The button depends on the account capability document, which needs a signed-in account; without it the button is hidden (side_panel.ts:15242; capabilityDocument.ts:87-92). |
| Permissions | Chrome microphone permission for the extension; shown in Options, Microphone access. |
| Subscription | Governed by the canUseVoice capability from /api/me. Which plans deny it: unknown. The shared capability table lists canUseVoice true for web, desktop and mobile rows (capabilities.ts:44, 77, 110); no Chrome row was found. |
| Limits and metering | none found in the code. No AGI usage is counted for dictation. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Needs a browser that provides speech recognition; a browser profile may refuse it ('Voice recognition is not available in this browser profile.'). |
| Local mode | Speech recognition does not use AGI Cloud, but the browser's speech service may need the network (error 'Voice recognition needs a network connection.'). No offline or on-device AGI speech model found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsupported browser | Button disabled with tooltip; reset only closes the notice. | voice.ts:131-140 |
| Capability denied | Button hidden. | side_panel.ts:15242 |
| Permission denied | Blocked message, no start. | voice.ts:238-243 |
| Second click before start | Treated as stop, not a second recognition. | voice.ts:226-236; test 'treats a second click before onstart as Stop instead of a second recognition' |
| Start throws | Generic error and a later attempt is allowed. | voice.ts:218-224 |
| Chat reset while listening or waiting for permission | Session aborted, late callbacks ignored, notice cleared. | voice.ts:150-175 |
| Offline | Network error message. | voice.ts:27-41 |
| Accessibility | aria-pressed on the button, aria-disabled when unsupported, notice role note with a label, focus returns to the button on close. | voice.ts:68-120, 131-140 |
| Right-to-left or composer disabled | If the composer is disabled the start is skipped silently; right-to-left not handled in this file. | voice.ts:178-182 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/voice-input.test.ts`: 'voice input lifetime': appends a current transcript and keeps the draft; aborts a reset session and ignores late callbacks; does not start after a late permission answer for a reset chat; clears a pending notice and makes old Continue inert; allows retry after controls were disabled; second click before onstart acts as Stop; synchronous start failure reports and allows retry.
- `apps/extension/__tests__/dictation-language.test.ts`: 'dictation language preference', 'dictation language row', 'microphone tooltip'.

**Test scenarios**

- **First use with notice**
  1. Sign in, open the side panel on a normal page.
  2. Click the microphone.
  3. Press 'Continue', allow the microphone in Chrome, say a sentence.
  - Expected: Sentence appears in the composer; the notice is not shown on the next click.
- **Blocked microphone**
  1. Block the microphone for the extension in Chrome settings.
  2. Click the microphone.
  - Expected: Blocked message, no listening.
- **Unsupported browser**
  1. Open the side panel in a browser without speech recognition.
  - Expected: Button disabled with 'Voice input is not supported in this browser'.
- **Voice denied by account**
  1. Use an account whose capability document denies canUseVoice.
  - Expected: No microphone button.
- **Language**
  1. Choose another language in Options, Dictation.
  2. Hover the microphone.
  - Expected: Tooltip names the language and recognition uses it.
- **No speech**
  1. Click the microphone and stay silent.
  - Expected: 'No speech was heard...' message.

**Where to look when it fails**

- Side panel console for speech errors; the error codes not-allowed, service-not-allowed, audio-capture, no-speech, network map to messages in voice.ts.
- Storage keys agi.notice.microphone and agi_dictation_language.
- Chrome site settings for the microphone.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **Capability gate uses a web-surface account document; the rule for Chrome is not visible.** Affects: surface:chrome users on plans that deny or allow voice.. Evidence: capabilityDocument.ts:15 (surface=web); capabilities.ts has no Chrome row.. Work needed: Read the server rule and the handshake builder; decide if the extension needs its own surface.
- **One utterance per press, no interim text.** Affects: Long dictation on surface:chrome.. Evidence: voice.ts:190-200 sets interimResults false and no continuous mode.. Work needed: Product decision, then enable continuous recognition.
- **No on-device or AGI speech option; depends on the browser vendor service and network.** Affects: Offline users; the product goal of free local inference.. Evidence: spVoiceNotice, spVoiceErrorNetwork.. Work needed: Decide whether extension dictation should have a local engine.

**Depends on**

- surface:chrome
- mode:cloud
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-shared-ui-and-design
- api:GET /api/me
- store:chrome-storage-local
- store:chrome-storage-sync
- file:apps/extension/src/features/side-panel/voice.ts

## Unknown

- Which plans deny canUseVoice for the extension.
- How the browser vendor handles the audio.
- Whether the Options microphone row is visible in all builds (mounted by options.ts; not traced).
- Whether right-to-left languages work in the composer.
