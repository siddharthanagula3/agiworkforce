---
id: "F050-02"
type: "feature"
title: "Voice, language and speed for playback"
aliases: ["Backup read-aloud voice", "Read-aloud speed", "Voice & Language", "Speed (slider)", "Pitch", "Speech language", "Voice (settings row)", "Speaking style", "Read aloud settings (Chrome options)", "Voice Persona (desktop)", "S50.02", "S50.03"]
area: "50 Audio overviews, speech generation, and music"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.02", "S50.03"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "surface:desktop", "mode:local", "mode:cloud", "F050-01", "store:localStorage agiworkforce-web-settings", "store:localStorage agi:tts-voice-uri", "store:chrome.storage.local agi_read_aloud", "file:apps/mobile/stores/settingsStore.ts", "SYS-voice-and-media", "SYS-shared-ui-and-design", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-02 Voice, language and speed for playback

Settings that shape how read aloud sounds. Web has a device-voice picker and three speeds. Mobile has speed, pitch, voice and speech language. Chrome has a voice picker and five speeds. Tauri desktop has voice personas. The server voice on web cannot be picked, and on mobile it ignores the voice, pitch and language.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.02](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5002), [S50.03](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5003).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person pick the voice and the speed of read aloud, and on mobile the pitch and language. The settings are saved on the device and read each time speech starts. (apps/web/lib/hooks/useTTS.ts:355, 442; apps/mobile/src/features/voice/services/speechSettings.ts:48-56)

**Why it exists.** People differ in how fast they listen and in which language they hear. The brief requires voice, language and rate choice where the engine supports it. Voices differ per device, so the choice is stored per device. (S50.02, S50.03 Should; doc: docs/decisions/wire-or-cut.md:425)

**Who uses it.** Anyone using read aloud on Web, Mobile, Chrome or Tauri desktop.

**Problems it solves**

- A default voice too fast, too slow or in the wrong language.
- A voice that is not installed on a new machine silently being ignored.
- Hearing a preview before choosing.

**Use cases**

- A web user sets Read-aloud speed to Slow and the next reply plays slower.
- A phone user sets Speed to 1.25x and a French speech language.
- A Chrome user picks a specific browser voice and presses Preview.
- A desktop user picks the Calm persona so read aloud sounds slower and softer.

## 2. User experience

**Where to find it**

- Web: Settings > General, row 'Backup read-aloud voice' (a dropdown with 'Browser default' and installed voices, plus a Preview/Stop button) and row 'Read-aloud speed' with buttons Slow, Normal, Fast (apps/web/features/settings/sections/GeneralSection.tsx:733-768, 808-858). The row is titled 'Backup' because it applies only when the device voice speaks.
- Mobile: Settings > Voice has rows 'Speech language' and 'Voice' and two sliders 'Speed' and 'Pitch' (apps/mobile/src/features/settings/voice/index.tsx:415-460). The 'Voice' row opens the 'Voice & Language' screen with 'Speaking style' and a 'System default' voice row and a preview button per voice (apps/mobile/src/features/settings/voice-language/index.tsx:150-200, 296-330).
- Chrome: Options page, row 'Read aloud' with Voice and Speed selects (0.75x to 2x) and Preview (apps/extension/src/features/options/read-aloud-row.ts:28-66; apps/extension/src/features/read-aloud/index.ts:3).
- Tauri desktop: Settings > Voice, 'Voice Persona' (friendly, calm, energetic, storyteller, technical, professional) and 'Piper TTS Voices' downloads (apps/desktop/src/features/settings/VoiceSettings.tsx:754-762, 849-897; apps/desktop/src/features/settings/voicePersonaParams.ts:7-22).
- CLI and VS Code: none.

**Before you start**

- Web: the browser must expose speech voices for the picker; otherwise the row says 'This browser has no voices, so read-aloud has no backup.' (GeneralSection.tsx:811-816). The speed row is hidden when speech is unsupported (GeneralSection.tsx:738).
- Mobile: device has installed voices to list.
- Chrome: browser speech synthesis available, else controls are disabled with 'This browser cannot read text aloud.' (messages.json optReadAloudUnsupported).

**Screens and controls**

- Web select 'Backup read-aloud voice' with option 'Browser default'; button 'Preview' / 'Stop' that speaks 'This is how read-aloud sounds when it falls back to this voice.' on the device voice (GeneralSection.tsx:824-850).
- Web button group 'Read-aloud speed' with aria-labels 'Slow read-aloud speed' etc. (GeneralSection.tsx:747-766).
- Web helper text: 'The AGI voice uses a few credits per reply. Audio plays on your system default output device.' (GeneralSection.tsx:853-856).
- Mobile sliders Speed and Pitch from 0.5 to 2 step 0.05, labelled like '1.00x' (voice/index.tsx:437-458).
- Mobile caption 'Replies use the current chat model; in Cloud Mode, your transcript goes to AGI Cloud.' (voice/index.tsx:431-435).

**Journey**

1. 1. Open settings (Web: Settings > General; Mobile: Settings > Voice; Chrome: Options; Desktop: Settings > Voice).
2. 2. Choose a voice or move the speed control.
3. 3. Press Preview where offered.
4. 4. Go back to chat and read a reply aloud; the new values apply to the next playback.

**What the person sees and gets**

- Selected state on speed buttons (aria-pressed) and the chosen option in the dropdown.
- Mobile shows the speed as text such as 1.25x.
- Chrome shows 'Saving' then clears; on failure the old value returns with a save-failed message (read-aloud-row.ts:94-110).
- Preview speaks a sample sentence.

**Settings**

- Web voiceSpeed saved in localStorage store 'agiworkforce-web-settings' (web-settings-store.ts:122, 210-211) and voice URI in localStorage agi:tts-voice-uri.
- Mobile selectedVoiceId, speechRate (clamped 0.5-2), speechPitch (clamped 0.5-2) in settingsStore (apps/mobile/stores/settingsStore.ts:49-51, 127-129, 149-150); speech language per Local or Cloud store.
- Chrome agi_read_aloud {voiceURI, rate}.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web speed: slow 0.8, normal 1.05, fast 1.35, read at speak time for both the device utterance and the server request (apps/web/shared/stores/web-settings-store.ts:46-50; useTTS.ts:354-356, 441-443).
- Web device voice choice is stored on the device and pushed to every live hook through a subscriber set (useTTS.ts:100-114, 235-253).
- Web falls back to the browser default if the stored voice is not installed (useTTS.test.ts:229-230 title).
- Mobile: every speaking surface reads one settings function with voice, rate, pitch, language; language comes from the Cloud or Local store by app mode (speechSettings.ts:17-23, 48-56).
- Mobile device voice receives voice, rate, pitch and language (tts.ts:83-87).
- Mobile server voice receives the rate, clamped 0.25-4 (serverSpeech.ts:46-51; voiceOutput.ts:135).
- Chrome voice and one of five rates, saved with rollback on failure (read-aloud-row.ts:94-117; read-aloud/index.ts:3, 12-22).
- Desktop Tauri persona sets rate, pitch and volume for the local and browser engines (useTTS.ts:52-65, 75-79; voicePersonaParams.ts:7-22).

**Incomplete**

- Language for read aloud on web is only what the chosen device voice carries; there is no language setting (useTTS.ts:359-362).
- Mobile Cloud server voice ignores the chosen voice, pitch and speech language (serverSpeech.ts:46-51).
- The Tauri desktop persona does not reach the configured native provider path: voiceTtsSpeakWithBargeIn sends only text (useTTS.ts:72).

**Present but disconnected or switched off**

- The speech route supports 13 named voices and a 'voice' field but no app offers a way to choose one (apps/web/lib/voice/speech-voices.ts:1-19; route.ts:54).
- A synced 'voice' preference was deliberately cut (doc: docs/decisions/wire-or-cut.md:425).

**Not available**

- CLI and VS Code: no voice or speed settings for playback.
- No server voice choice on any app.
- Web has no pitch control; Chrome has no pitch control.

## 4. Required behaviour

**Established requirements**

- The user can choose the voice and language used for spoken playback. (source: S50.02 Should (brief))
- Where supported, the user can set the speaking rate of playback. (source: S50.03 Should (brief))
- Installed voices are a property of the device, so the voice choice is stored on the device, not synced. (source: doc: docs/decisions/wire-or-cut.md:425)
- Claude offers preset voices only and no custom voice creation; OpenAI preset voices stay. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:250-258)

**Acceptance criteria**

1. Changing Read-aloud speed on Web changes the rate of the next read aloud without a reload.
2. Picking a backup voice in Settings > General is used by a chat read aloud already open in another tab or component without a reload.
3. With no browser voices the Web row shows 'This browser has no voices, so read-aloud has no backup.'
4. On Mobile, moving the Speed slider to 1.5x makes the device voice faster on the next Read aloud.
5. On Mobile, changing Speech language clears the language-specific voice and is stored separately for Local and Cloud.
6. Chrome saved voice and rate survive a reload of the Options page; a failed save restores the previous values.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The person should be told which engine a setting affects, since web voice affects only the fallback [inferred from the row title and helper text].
- Server voice choice would need the client to send the voice field the route already accepts [inferred from route.ts:54].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the person choose a server voice from the allowed list on Web and Mobile.
- [proposed] Send language and voice on Mobile Cloud so settings match the heard voice.
- [proposed] Use the same speed steps on every app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ReadAloudVoiceRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Backup voice dropdown and Preview (808-858). |
| component | VoiceSpeedRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Slow, Normal, Fast buttons (733-768). |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | voiceSpeed, VOICE_SPEED_RATES, persisted in localStorage. |
| hook | useTTS voice state | `apps/web/lib/hooks/useTTS.ts` | voices, voiceUri, setVoiceUri, subscriber broadcast (100-114, 235-258). |
| config | speech voices | `apps/web/lib/voice/speech-voices.ts` | Server voice allow-list and default (not user-selectable). |
| test | voice-speed-wired test | `apps/web/features/settings/sections/__tests__/voice-speed-wired.test.ts` | Checks speed table and that it is read at speak time. |
| screen | Mobile Voice settings | `apps/mobile/src/features/settings/voice/index.tsx` | Speech language row, Voice row, Speed and Pitch sliders. |
| screen | Mobile Voice & Language | `apps/mobile/src/features/settings/voice-language/index.tsx` | Voice list, System default, preview. |
| store | mobile settingsStore | `apps/mobile/stores/settingsStore.ts` | selectedVoiceId, speechRate, speechPitch with clamping. |
| service | speechSettings | `apps/mobile/src/features/voice/services/speechSettings.ts` | Single reader of voice, rate, pitch, language. |
| service | speechLanguage | `apps/mobile/src/features/voice/speechLanguage.ts` | Automatic value and legacy conversion. |
| store | local and cloud settings stores | `apps/mobile/stores/settings/localSettingsStore.ts` | Per-mode speechLanguage (cloud twin: apps/mobile/stores/settings/cloudSettingsStore.ts). |
| service | mobile tts | `apps/mobile/src/features/voice/services/tts.ts` | Lists installed voices; applies voice, rate, pitch, language. |
| service | mobile serverSpeech | `apps/mobile/src/features/voice/services/serverSpeech.ts` | Applies only rate to the server voice. |
| component | Chrome read-aloud row | `apps/extension/src/features/options/read-aloud-row.ts` | Voice and speed selects, preview, save with rollback. |
| service | Chrome read-aloud settings | `apps/extension/src/features/read-aloud/index.ts` | Rates, parse, load, speak with voice and rate. |
| component | Desktop VoiceSettings | `apps/desktop/src/features/settings/VoiceSettings.tsx` | Voice persona, Piper voice downloads, speak replies toggle. |
| config | voicePersonaParams | `apps/desktop/src/features/settings/voicePersonaParams.ts` | Rate, pitch, volume per persona. |
| test | Mobile speech language test | `apps/mobile/__tests__/VoiceSettingsSpeechLanguage.test.tsx` | Language picker behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person changes a setting; the app writes it to a local store (web localStorage, mobile persisted store, chrome.storage.local). | device | web-settings-store.ts:144, 210; settingsStore.ts:148-150; read-aloud-row.ts:99-101 |
| At the next read aloud the app reads the setting at call time. | device | useTTS.ts:354-356, 441-443; speechSettings.ts:48-56 |
| Web sends the speed number to /api/voice/speech; the provider applies it. | our servers | useTTS.ts:58; route.ts:207 |
| Mobile Cloud sends only rate to the server; the device voice receives voice, rate, pitch, language. | device and our servers | serverSpeech.ts:46-51; tts.ts:83-87 |
| The speech provider applies the speed in its own synthesis. | outside service | route.ts:196-208 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web speed and voice choice | localStorage (agiworkforce-web-settings; agi:tts-voice-uri) | No; voice deliberately device-local (doc: docs/decisions/wire-or-cut.md:425). Whether voiceSpeed syncs to the account: no sync code seen in the store. | Until browser data is cleared. |
| Mobile voice, rate, pitch | Persisted mobile settings store | unknown | unknown |
| Mobile speech language | Separate Local and Cloud settings stores | unknown | unknown |
| Chrome voiceURI and rate | chrome.storage.local agi_read_aloud | No | Until cleared. |

**Models and providers.** No model is chosen by these settings. The server provider applies speed only; the web and mobile apps do not pick a server voice. Device voices come from the browser, phone or OS.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None needed to change a setting; settings are local to the device. |
| Permissions | none found in the code. |
| Subscription | none found in the code for the settings themselves; the server voice they influence is metered (see F050-01). |
| Limits and metering | Web speed fixed at three steps; server speed accepted 0.25-4 (route.ts:55); mobile slider 0.5-2; Chrome 0.75-2 (read-aloud/index.ts:3). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | Server voice choice is not exposed; only OpenAI voices exist in the allow-list (speech-voices.ts). |
| Local mode | Mobile Local uses the full set of voice, speed, pitch and language settings on the device voice. Web backup voice and speed apply to device speech with no account. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No voices installed (web) | Row shows an explanatory message instead of a dropdown. | GeneralSection.tsx:811-816 |
| Stored voice missing on this device | Web speaks with the browser default. | useTTS.ts:255-258, 359-362; useTTS.test.ts:229-230 |
| Unknown stored speed (web) | Falls back to normal. | useTTS.ts:355-356; voice-speed-wired.test.ts:47 |
| Storage blocked | Voice choice is kept in memory for the session. | useTTS.ts:244-253 |
| Chrome save fails | Previous values restored with a save-failed message. | read-aloud-row.ts:104-109 |
| Chrome settings cannot load | Message 'Your read-aloud settings could not be loaded. Reopen this page to try again.' controls stay disabled. | read-aloud-row.ts:79-80, 148-150; messages.json optReadAloudLoadFailed |
| Speed change while speaking | Applies to the next playback only (web reads it at speak time). | useTTS.ts:354-356 |
| Offline | Settings changes work offline; not handled differently in the code. | stores are local |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/voice-speed-wired.test.ts`: Speed table values, ordering, valid range, read at speak time, fallback.
- `apps/web/features/settings/sections/GeneralSection.test.tsx`: General settings section (read-aloud rows coverage not opened: unknown).
- `apps/web/lib/hooks/useTTS.test.ts`: Voice selection, persistence, live update, clear to default.
- `apps/mobile/__tests__/VoiceSettingsSpeechLanguage.test.tsx`: Speech language picker, Local versus Cloud store, clearing the language-specific voice.
- `apps/extension/__tests__/read-aloud.test.ts`: Settings parsing and applying voice and rate.
- `apps/extension/__tests__/options-sections.test.ts`: Options sections (read-aloud row coverage not opened: unknown).

**Test scenarios**

- **Web speed**
  1. Set Read-aloud speed to Fast.
  2. Read a reply aloud and time it; set Slow and repeat.
  - Expected: Fast finishes noticeably sooner; the request body speed is 1.35 then 0.8.
- **Web backup voice live update**
  1. Open a chat and Settings in two panes.
  2. Pick a different backup voice and press Preview.
  - Expected: Preview uses it; later device-voice reads use it without reload.
- **Mobile speed in Local**
  1. Switch to Local mode.
  2. Set Speed to 2.00x; tap Read aloud.
  - Expected: Device voice speaks faster; clamped at 2.
- **Mobile Cloud ignores voice**
  1. In Cloud mode choose a non-default voice and pitch.
  2. Read aloud while online, then offline.
  - Expected: Online uses the server voice without that voice or pitch; offline fallback uses the chosen device voice and pitch.
- **Chrome rate persistence**
  1. Set rate 1.5x and a voice in Options.
  2. Reload Options and read a reply aloud.
  - Expected: Values persist and apply.

**Where to look when it fails**

- Browser localStorage keys agiworkforce-web-settings and agi:tts-voice-uri.
- chrome.storage.local key agi_read_aloud.
- Mobile console warning '[tts] speech callback failed' (tts.ts:93).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/050-audio-overviews-speech-generation-and-music.md](../../70-qa/test-plans/web/050-audio-overviews-speech-generation-and-music.md)
- Desktop: [70-qa/test-plans/desktop/050-audio-overviews-speech-generation-and-music.md](../../70-qa/test-plans/desktop/050-audio-overviews-speech-generation-and-music.md)
- Mobile: [70-qa/test-plans/mobile/050-audio-overviews-speech-generation-and-music.md](../../70-qa/test-plans/mobile/050-audio-overviews-speech-generation-and-music.md)
- No hands-on plan yet for Chrome: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No way to choose the server voice; the person hears a fixed default.** Affects: Web, public Desktop, Mobile Cloud. Evidence: apps/web/lib/voice/speech-voices.ts:19; useTTS.ts:58. Work needed: Add a picker and send the voice field.
- **Mobile Cloud ignores chosen voice, pitch and language on the server voice.** Affects: Mobile Cloud. Evidence: apps/mobile/src/features/voice/services/serverSpeech.ts:46-51. Work needed: Send the settings the route supports, or tell the person which settings apply.
- **No read-aloud language setting on Web.** Affects: Web. Evidence: GeneralSection.tsx:808-858 has voice only. Work needed: Decide whether language is derived from the voice; document it.
- **Speed ranges differ per app (web 0.8-1.35, mobile 0.5-2, Chrome 0.75-2).** Affects: All. Evidence: web-settings-store.ts:46-50; voice/index.tsx:437-444; read-aloud/index.ts:3. Work needed: Pick one scale or label them consistently.
- **Whether settings sync across a person's devices is not established.** Affects: All. Evidence: no sync code found for these keys in files opened. Work needed: Confirm with the sync system owner.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- surface:desktop
- mode:local
- mode:cloud
- F050-01
- store:localStorage agiworkforce-web-settings
- store:localStorage agi:tts-voice-uri
- store:chrome.storage.local agi_read_aloud
- file:apps/mobile/stores/settingsStore.ts
- SYS-voice-and-media
- SYS-shared-ui-and-design
- SYS-sync-and-continuity

## Unknown

- Whether mobile voice, speed, pitch or language sync to the account.
- Whether the Web voiceSpeed syncs to the server (PreferenceSyncNotice content not read).
- GeneralSection.test.tsx coverage of the read-aloud rows.
- Exact Tauri desktop behaviour of persona on the configured native provider.
- How the Voice row label on Mobile 'selectedVoiceLabel' is computed (not opened).
