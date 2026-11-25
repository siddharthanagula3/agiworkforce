---
id: "F049-02"
type: "feature"
title: "Choose the dictation language"
aliases: ["Dictation language", "Speech language", "Spoken language", "Voice language", "--voice-lang", "S49.03"]
area: "49 Dictation, transcription, and recording"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S49.03"]
depends_on: ["F049-01", "surface:web", "surface:mobile", "surface:cli", "surface:chrome", "surface:vscode", "SYS-voice-and-media", "SYS-shared-ui-and-design", "file:apps/web/features/settings/sections/VoiceSection.tsx", "file:apps/cli/src/voice_languages.rs", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-02 Choose the dictation language

Sets which language the speech recognizer listens for. Web sends a two-letter code or lets the server detect the language. The phone picks a language per mode (Local or Cloud) and needs an installed on-device model. The CLI checks a fixed list of 20 languages. Chrome and VS Code store their own choice.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.03](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4903).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Tells transcription which language is spoken so non-English speech is recognised properly. (apps/web/features/chat/stores/voice-input-store.ts:213-217; apps/mobile/src/features/voice/services/speechSettings.ts:17-23)

**Why it exists.** Recognition quality depends on the language, and the brief requires that the user can choose it and recognition uses it (brief S49.03).

**Who uses it.** People who speak a language other than their browser or device default, or who switch languages.

**Problems it solves**

- Wrong-language transcripts.
- Provider rejection of region-qualified codes such as en-US.
- On phone, a failed recognizer mid-capture when the language model is not installed.

**Use cases**

- Web user picks German in Settings > Voice and dictates in German.
- Phone user in Cloud mode picks Spanish while Local mode stays Automatic.
- CLI user runs with --voice-lang fr.
- VS Code user picks the spoken language on the recorder page, which is remembered.

## 2. User experience

**Where to find it**

- Web and desktop: Settings > Voice > 'Dictation language' select (apps/web/features/settings/sections/VoiceSection.tsx:184-189).
- Phone: Settings > Voice > 'Speech language' row (apps/mobile/src/features/settings/voice/index.tsx:236, 416); the picker offers 'Automatic' first then languages by English name (test:apps/mobile/__tests__/VoiceSettingsSpeechLanguage.test.tsx).
- CLI: --voice-lang flag, default 'en' (apps/cli/src/lib.rs:354); /voice and /dictate accept a language (apps/cli/src/voice_languages.rs:32-44).
- Chrome side panel: language choice stored in chrome.storage.sync under agi_dictation_language; the mic tooltip shows it (apps/extension/src/features/side-panel/dictation-language.ts:14; voice.ts:119). Where in the panel the choice is made was not located.
- VS Code: 'Spoken language' select with 'Detect automatically' on the recorder page (dictationCapturePage.ts:17-23).

**Before you start**

- Web: Dictation on. Phone: Voice on and on-device language model installed for the chosen language. CLI: a build with the voice feature. VS Code: dictation available.

**Screens and controls**

- Web: select list built from the supported languages list; the stored browser tag is reduced to its first part for display (VoiceSection.tsx:53-57).
- Phone: row 'Speech language' opening a picker; a second screen 'Voice & Language' controls spoken replies, not dictation (apps/mobile/src/features/settings/voice-language/index.tsx:296).
- CLI: error 'Unsupported voice language' listing supported codes (apps/cli/src/voice.rs:87-100).

**Journey**

1. Person opens the language setting.
2. Picks a language or Automatic.
3. Starts a dictation as in F049-01.
4. The recognizer uses the chosen language; on web the upload carries only the two-letter code or none.

**What the person sees and gets**

- Phone with a missing model: '<Language> has no on-device speech model installed. Install it in your device's speech settings, or pick another speech language.' (voiceInput.ts:322-326).
- CLI warns '--voice-lang X is not a supported language, so /voice and /dictate use <default>.' (apps/cli/src/lib.rs:5953-5957).
- Chrome tooltip shows the language label when set.

**Settings**

- Web store key language in agi-web-voice-input; phone localSettingsStore.speechLanguage and cloudSettingsStore.speechLanguage; CLI --voice-lang; Chrome storage.sync agi_dictation_language; VS Code global state key agiWorkforce.dictationLanguage.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: default is the browser language; upload sends the main code only and drops codes not in the supported list so the server detects the language (voice-input-store.ts:20-23, 212-217, 225-228).
- Phone: language chosen per mode; 'auto' means device language; the locale resolver keeps the device region when the base language matches (speechSettings.ts:17-23; speechLanguage.ts:1-8; voiceInput.ts around resolveRecognitionLocale).
- Phone refuses a language with no on-device model and names it (voiceInput.ts:300-330).
- CLI validates against 20 codes, English through Czech (voice_languages.rs:8-29) and passes the code to the backend (voice.rs:1015-1022, 1140-1160).
- Chrome sets SpeechRecognition.lang from storage when a language is stored (voice.ts:205); the list offered comes from the browser (dictation-language.ts:1-12).
- VS Code: language code saved and sent as the 'language' form field (dictationClient.ts:7-10, 28-29; ChatStateManager.ts:5796).

**Incomplete**

- Web client has two separate language settings, the dictation language and a live voice language; they do not share state (VoiceSection.tsx:43-52).
- The brief marks VS Code missing; the code exists.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- CLI: languages outside the 20-code list; web: a language outside the supported list falls back to auto-detect rather than failing.

## 4. Required behaviour

**Established requirements**

- The user can choose the dictation language, and recognition uses it. (source: brief S49.03)
- The transcription provider takes a bare two-letter code and rejects region-qualified codes, so the app sends the primary subtag only. (source: apps/web/features/chat/stores/voice-input-store.ts:207-217 (code comment))
- On-device speech must not quietly fall back to server recognition when the model is missing. (source: apps/mobile/src/features/voice/services/voiceInput.ts:300-303 (code comment))

**Acceptance criteria**

1. Pick German on web: the upload form carries language=de and not de-DE.
2. Store an unsupported tag on web: the upload has no language field.
3. Pick a language with no installed on-device model on phone: dictation refuses with the install message and does not upload.
4. Run CLI with an unsupported code: it stops and lists supported codes.
5. Phone Cloud and Local modes keep separate speech languages.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Phone 'Automatic' should follow device locale changes without user action [inferred from deviceSpeechLocale at speechSettings.ts:25-31].

**Proposed improvements** (suggestions, not requirements)

- [proposed] One shared language list across apps instead of per-app lists.
- [proposed] Show the active dictation language on the web recording strip.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceSection | `apps/web/features/settings/sections/VoiceSection.tsx` | Dictation switch, microphone and language selects |
| store | useVoiceInputStore.language | `apps/web/features/chat/stores/voice-input-store.ts` | Holds the language tag; toProviderLanguage reduces it |
| other | supported languages | packages/i18n (not found) (not found) | isSupportedLanguage list used by web and VS Code (imports in voice-input-store.ts:6 and dictationClient.ts:2) |
| service | speechSettings | `apps/mobile/src/features/voice/services/speechSettings.ts` | activeSpeechLanguage per trust domain and device locale |
| other | speechLanguage | `apps/mobile/src/features/voice/speechLanguage.ts` | 'auto' value and legacy conversion |
| screen | Voice settings | `apps/mobile/src/features/settings/voice/index.tsx` | 'Speech language' row and picker |
| store | local and cloud settings stores | `apps/mobile/stores/settings/localSettingsStore.ts` | speechLanguage for Local mode (cloud store sibling file cloudSettingsStore.ts) |
| service | voiceInput locale checks | `apps/mobile/src/features/voice/services/voiceInput.ts` | resolveRecognitionLocale, isOnDeviceLocaleAvailable, assertOnDeviceRecognition |
| config | CLI language table | `apps/cli/src/voice_languages.rs` | 20 supported codes, validation and default |
| command | --voice-lang | `apps/cli/src/lib.rs` | Flag that sets the default language |
| service | CLI transcription calls | `apps/cli/src/voice.rs` | Passes language to managed, OpenAI and local backends |
| service | Chrome dictation-language | `apps/extension/src/features/side-panel/dictation-language.ts` | Reads and stores the language, offers browser languages |
| service | Chrome voice | `apps/extension/src/features/side-panel/voice.ts` | Applies language to SpeechRecognition.lang |
| service | VS Code dictationClient | `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts` | dictationLanguageCode and upload language field |
| component | VS Code recorder page | `apps/extension-vscode/src/features/sidebar-webview/dictationCapturePage.ts` | Spoken language select with automatic option |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a language; it is saved on the device (web localStorage, phone settings stores, Chrome sync storage, VS Code global state). | device | voice-input-store.ts:436-443; speechSettings.ts:17-23; dictation-language.ts:14; ChatStateManager.ts:5796 |
| At dictation start the app reads it. Web reduces it to a two-letter code, or none. | device | voice-input-store.ts:213-217, 225-228 |
| The server forwards a non-empty language to the speech provider. | our servers | route.ts:546-550 (language form field forwarded) |
| Phone checks the installed on-device models before starting. | device | voiceInput.ts:264-278, 300-330 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Language preference | Device settings (see steps); Chrome uses storage.sync | Chrome profile sync only; others not found | Kept until changed |

**Models and providers.** The language is a parameter to the same speech-to-text model as F049-01; no model choice depends on it in the code read. Phone uses the OS recognizer.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Setting itself needs no account (web setting is local). Dictation use follows F049-01. |
| Permissions | none found in the code beyond F049-01. |
| Subscription | none found in the code for the language setting. |
| Limits and metering | CLI limited to 20 codes. Web limited to the supported languages list. |
| Feature flags | none found in the code. |
| Model compatibility | The OS must have the on-device language model installed (phone). |
| Provider restrictions | Provider needs a two-letter code (voice-input-store.ts:207-211). |
| Local mode | Phone: separate Local-mode language setting, on-device only. CLI local whisper receives the same code (voice.rs:1148-1153). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsupported language (web) | Omitted so the server detects it | voice-input-store.ts:213-217; test 'omits the language when the stored tag is not one the catalog supports' |
| Unsupported language (CLI) | Stops with the supported list | voice.rs:87-100 |
| Model not installed (phone) | Refusal with install guidance | voiceInput.ts:322-326 |
| Platform cannot list installed locales (phone) | Keeps on-device request without upload | voiceInput.ts:260-278; test 'keeps the on-device request when the platform cannot list installed locales' |
| Browser reports no language (Chrome) | Leaves SpeechRecognition.lang unset | dictation-language.ts:47-50; test 'leaves the language unset when the browser names none' |
| Offline | Setting still changes; not applicable to recognition | not handled in the code beyond local storage |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `test:apps/web/features/chat/stores/voice-input-store.test.ts` (not found): Primary subtag sent; unsupported tag omitted; setLanguage
- `test:apps/web/features/settings/sections/VoiceSection.test.tsx` (not found): Voice settings section
- `test:apps/mobile/__tests__/VoiceSettingsSpeechLanguage.test.tsx` (not found): Picker, Automatic, per-mode stores
- `test:apps/mobile/__tests__/voice-recognition-locale-and-timeout.test.ts` (not found): Installed-model check and device-region rule
- `test:apps/extension/__tests__/dictation-language.test.ts` (not found): Browser languages, fallbacks, stored choice
- `test:apps/extension-vscode/src/__tests__/dictationClient.test.ts` (not found): Omits language in automatic mode
- `test:apps/extension-vscode/src/__tests__/dictationCapturePage.test.ts` (not found): Saved language only kept when supported

**Test scenarios**

- **Web two-letter code**
  1. Set Dictation language to German
  2. Dictate and watch the request in dev tools
  - Expected: Form field language=de.
- **Phone missing model**
  1. Choose a language with no installed speech model
  2. Tap the mic
  - Expected: Install-model message; nothing uploaded.
- **CLI bad code**
  1. Run with --voice-lang xx then /dictate
  - Expected: Warning at start, and a refusal listing supported codes.
- **Phone per-mode language**
  1. Set Spanish in Cloud mode and Automatic in Local mode
  2. Switch modes and dictate
  - Expected: Each mode uses its own language.

**Where to look when it fails**

- Phone errors with code on-device-recognition-unavailable (voiceInput.ts:16-24).
- CLI message 'Unsupported voice language' (voice.rs:93-99).
- Network panel form field language on /api/voice/transcribe.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/web/049-dictation-transcription-and-recording.md)
- Desktop: [70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md)
- Mobile: [70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md)
- CLI: [70-qa/test-plans/cli/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/cli/049-dictation-transcription-and-recording.md)
- Chrome: [70-qa/test-plans/chrome/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/chrome/049-dictation-transcription-and-recording.md)
- No hands-on plan yet for VS Code: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Brief says VS Code language selection is missing but code and tests exist.** Affects: VS Code; docs. Evidence: brief S49.03; dictationClient.ts:5. Work needed: Update brief.
- **Web has separate dictation and live-voice language settings; consistency is undecided.** Affects: Web, desktop. Evidence: VoiceSection.tsx:43-52. Work needed: Product decision.
- **Chrome language picker location not established; unclear if there is an in-panel control.** Affects: Chrome. Evidence: dictation-language.ts header comment only. Work needed: Locate or add UI and test.
- **Different language lists per app (web list, CLI 20 codes, browser languages).** Affects: All apps. Evidence: voice_languages.rs:8-29; dictation-language.ts:12. Work needed: Share one list or document differences.

**Depends on**

- F049-01
- surface:web
- surface:mobile
- surface:cli
- surface:chrome
- surface:vscode
- SYS-voice-and-media
- SYS-shared-ui-and-design
- file:apps/web/features/settings/sections/VoiceSection.tsx
- file:apps/cli/src/voice_languages.rs
- mode:local
- mode:cloud

## Unknown

- Where the Chrome side panel exposes its language choice.
- Whether the supported languages list in packages/i18n matches what the provider accepts (not opened).
- How phone 'Automatic' behaves when the device language has no installed model beyond the refusal path.
