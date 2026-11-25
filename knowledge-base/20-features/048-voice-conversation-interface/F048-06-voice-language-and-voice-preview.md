---
id: "F048-06"
type: "feature"
title: "Voice, language and voice preview"
aliases: ["Voice picker", "Voice settings", "Voice & Language", "Speech language", "Speaking pace", "Voice reasoning", "Play sample", "Preview voice", "Voice carousel"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.15", "S48.16", "S48.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "F048-01", "F048-04", "SYS-voice-and-media", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "SYS-api-and-contracts", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-06 Voice, language and voice preview

The person picks the assistant's voice, spoken language, pace and, on web, voice reasoning. The choices travel to the server when a call starts; language and pace can change mid-call, a voice change waits for the next call. The web 'Play sample' button is hidden because the sample list is empty; mobile can preview device voices.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.15](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4815), [S48.16](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4816), [S48.17](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4817).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets people choose how the assistant sounds and which language it speaks and listens in, and hear a voice before choosing.

**Why it exists.** Leading assistants offer several voices and languages; people need one they understand and like.

**Who uses it.** Anyone using voice, and people who speak languages other than English.

**Problems it solves**

- Wrong language heard or spoken.
- Voice too fast or too slow.
- Not knowing what a voice sounds like before picking it.

**Use cases**

- Open 'Voice settings' on web and move to the next voice.
- Set Language to a specific language instead of Auto-detect.
- Set Speaking pace to Slower.
- On mobile choose a voice in the picker sheet or preview a system voice in Voice & Language.

## 2. User experience

**Where to find it**

- Web/Desktop: gear button labelled 'Voice settings' in the header while voice is on (VoiceHeaderLabel.tsx:12-35; testid voice-settings-trigger) opens a dialog titled 'Voice settings' (VoiceSettingsModal.tsx:40-45, 350).
- Mobile: a bottom sheet voice picker (VoicePickerSheet.tsx) shown at first voice use and from the live bar 'Voice settings' button (LiveVoiceBar.tsx:325); Settings > Voice rows 'Speech language' and 'Voice' (settings/voice/index.tsx:416-422); the 'Voice & Language' screen with 'Voice mode' and 'Speaking style' sections (apps/mobile/src/features/settings/voice-language/index.tsx:104-130).
- CLI: --voice-lang and /voice <lang> (apps/cli/src/lib.rs:354, 5950-5955); supported languages are a fixed list of 20 codes (apps/cli/src/voice_languages.rs:8-29).

**Before you start**

- Web: voice session active to open the dialog (VoiceHeaderLabel only renders when voice is active, WebChatPage.tsx:7339).

**Screens and controls**

- Web dialog rows: voice carousel with 'Previous voice' and 'Next voice' and dots (13 voices); 'Voice reasoning' Instant or Thinking; 'Language' Auto-detect plus the app's supported languages; 'Speaking pace' Slower 0.75x, Normal 1x, Faster 1.25x, Fastest 1.5x; 'Chat intelligence' only when the Auto model is in use (VoiceSettingsModal.tsx:40-75, 282-283, 360-404).
- Thinking option hint: 'Thinks longer on harder questions. Paid plans, from your next voice session' (VoiceSettingsModal.tsx:59-65).
- Web audio output picker inside the dialog (VoiceModeSurface.tsx:652).
- Web 'Play sample' button under the carousel, rendered only when a sample exists (VoiceSampleButton.tsx:58-61, 98-119).
- Mobile 'Play sample' button and per-voice 'Preview <name>' buttons (VoicePickerSheet.tsx:70-110; voice-language/index.tsx:30-60).

**Journey**

1. 1. During a call open 'Voice settings'.
2. 2. Move through voices with the arrows or dots; a sample button appears if a sample exists.
3. 3. Pick a language; pick a pace.
4. 4. Language and pace are sent to the running call at once; the voice change applies from the next call.
5. 5. Choices are remembered in the browser for the next call.

**What the person sees and gets**

- Web: the dialog says the voice, reasoning, language and pace can be chosen; with 'Chat intelligence' it adds the intelligence for typed replies (VoiceSettingsModal.tsx:42-44).
- Web sample error text: 'The sample could not play. Try again later.' (VoiceSampleButton.tsx:70-76).
- Mobile preview sentence: 'This is how AGI will sound.' (useVoicePreview.ts:9).

**Settings**

- Web store agi-web-voice-session persists voice, language, pace and reasoning (voice-session-store.ts:28, 206-212).
- Mobile: liveVoice (the live voice id) and system voice, speed, pitch, speech language per Local or Cloud mode (settingsStore.ts:53; speechSettings.ts:15-56).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server validates the voice and falls back to the default when invalid; trims the language or stores null; clamps pace to 0.5 to 2 (route.ts:264-267, 148-160; voice-session-store.ts:35-41).
- The voice goes into the provider session audio output; language and pace go into the instructions (route.ts:520-530; live-voices.ts in packages/contracts/types/src:38-48).
- Web updateSettings sends an instructions-append event and PATCHes the session settings; a voice change waits for the next session (live-voice-session.ts:673-707; settings/route.ts:20-90).
- The settings are stored in the voice_sessions row and echoed in the create response (route.ts:723; settings/route.ts:84-93).
- Web reasoning level is chosen by the user within what the plan allows (route.ts:337-340 via resolveLiveVoiceReasoning).
- Mobile live start sends the chosen live voice id and the two-letter language (useLiveVoiceSession.ts:~300; liveVoiceSession.ts:345-350).
- Mobile preview of system voices plays on the device through the speech owner (voice-language/index.tsx:199-290; test VoiceLanguagePreview.test.tsx:96).
- CLI validates the language against its fixed list (voice.rs:84-97; voice_languages.rs).

**Incomplete**

- Voice preview from the sample manifest is empty, so 'Play sample' never shows on web and desktop, and mobile reads the same manifest (apps/web/public/voice-samples/manifest.json:1-3; VoiceSampleButton.tsx:61; apps/mobile/src/features/voice/services/voiceSamples.ts:20-27). The generator script exists at scripts/generate-voice-samples.mjs and needs a server key run by the owner.
- Language is applied as a text instruction to the model, not as a separate recognition setting, on web (live-voices.ts:38-41; live-voice-session.ts:681-690), and mobile sends only the first part of the language tag (useLiveVoiceSession.ts:~302).

**Present but disconnected or switched off**

- 'Chat intelligence' row appears only for the Auto model and eligible plans (WebChatPage.tsx:6838-6846).
- Web 'Thinking' reasoning is for paid plans only per its hint; the exact enforcement is in resolveLiveVoiceReasoning, not opened [see unknowns].

**Not available**

- Changing the voice mid-call on web: not possible by design of the provider (live-voice-session.ts:664-672).
- VS Code and Chrome: none.

## 4. Required behaviour

**Established requirements**

- The user picks the assistant voice, and the chosen voice is the one the conversation speaks with. (source: brief S48.15)
- The user can hear a sample of a voice before choosing it. (source: brief S48.16)
- The user can choose the spoken language, and it is applied to recognition. (source: brief S48.17)
- Provide voice choice among the voice controls. (source: doc: docs/product/competitive-guidance.md:404)
- General settings must include voice and voice speed. (source: doc: docs/product/definition.md:277)

**Acceptance criteria**

1. The voice chosen before the call is the voice heard; an invalid voice id falls back to the default.
2. A language chosen mid-call changes the assistant's spoken language from the next turn.
3. A pace change is heard and recorded on the session row.
4. With an empty manifest no 'Play sample' button is shown and nothing errors.
5. With a populated manifest 'Play sample' plays and 'Stop' stops it.
6. Mobile system voice preview does not change the saved voice.
7. CLI rejects an unsupported language with the list.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'applied to recognition' should be restated as 'applied by instruction to the model' unless a provider setting is found [inferred from live-voices.ts:38-41].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Run the sample generator and commit the files, then add a test that the manifest is non-empty.
- [proposed] Allow a voice change without losing the call by offering a quick restart.
- [proposed] Show on mobile live voice the same pace choice as web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceSettingsModal | `apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx` | Dialog with voice, reasoning, language, pace. |
| component | VoiceHeaderLabel | `apps/web/features/chat/components/Voice/VoiceHeaderLabel.tsx` | 'Voice settings' gear. |
| component | VoiceSampleButton | `apps/web/features/chat/components/Voice/VoiceSampleButton.tsx` | Play sample; hidden without a manifest entry. |
| config | voice samples manifest | `apps/web/public/voice-samples/manifest.json` | Empty list of samples. |
| service | live-voices | `packages/contracts/types/src/live-voices.ts` | Voice list, default, language and pace instructions, reasoning levels. |
| store | useVoiceSessionStore | `apps/web/features/chat/stores/voice-session-store.ts` | Persists voice, language, pace, reasoning. |
| service | LiveVoiceSession.updateSettings | `apps/web/features/chat/lib/live-voice-session.ts` | Mid-call language and pace change. |
| endpoint | PATCH /api/voice/live/sessions/{sessionId}/settings | `apps/web/app/api/voice/live/sessions/[sessionId]/settings/route.ts` | Updates the stored session settings. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Reads voice, language, pace, reasoning at start. |
| service | live-voice-reasoning | `apps/web/lib/voice/live-voice-reasoning.ts` | Resolves reasoning by plan. |
| table | voice_sessions | `apps/web/db/neon/0260_voice_sessions.sql` | Stores voice, language, pace per session. |
| component | VoicePickerSheet | `apps/mobile/src/features/voice/components/VoicePickerSheet.tsx` | Mobile voice carousel and sample button. |
| screen | Voice & Language | `apps/mobile/src/features/settings/voice-language/index.tsx` | System voice preview, live voice choice. |
| screen | Voice settings | `apps/mobile/src/features/settings/voice/index.tsx` | Speech language picker, speed and pitch. |
| service | voiceSamples | `apps/mobile/src/features/voice/services/voiceSamples.ts` | Reads the web manifest and plays samples. |
| hook | useVoicePreview | `apps/mobile/src/features/voice/hooks/useVoicePreview.ts` | On-device preview of a voice. |
| command | voice_languages | `apps/cli/src/voice_languages.rs` | CLI language list and validation. |
| command | generate-voice-samples | `scripts/generate-voice-samples.mjs` | Owner script that fills the manifest. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person chooses voice, language, pace; the store saves them in the browser. | device | voice-session-store.ts:206-212 |
| At call start the browser posts voice, language, pace and reasoning to the server. | device and our servers | live-voice-session.ts:533-545 |
| The server checks the voice id, normalises language and clamps pace, then builds the provider instructions with language and pace and sets the audio voice. | our servers | route.ts:264-267, 520-530 |
| The provider speaks with that voice. | outside service | route.ts:520-523 |
| Mid-call language or pace: the browser sends an instruction event and PATCHes the record. | device and our servers | live-voice-session.ts:673-707 |
| Preview: the page fetches the sample manifest and plays a file if one is listed. | device | VoiceSampleButton.tsx:12-48 |
| Mobile device voices are previewed by the operating system speech engine. | device | useVoicePreview.ts:9-30 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice, language, pace, reasoning choices | browser local storage (web); mobile settings stores; voice_sessions row for the running call | Row is readable by other devices; local choices are not synced | Browser keys cleared on logout (voice-session-store.ts:131-147) |
| Sample audio and manifest | apps/web/public/voice-samples | Served by the web app | Manifest currently empty |

**Models and providers.** The voice is a feature of the voice_live slot's session; names are a fixed list of 13 voices in the shared contracts package (packages/contracts/types/src/live-voices.ts:7-21). Reasoning applies to the backend model by plan. Sample files are generated with a server key by a script and never at runtime. No model identifiers recorded here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs a signed-in session to call the settings endpoint. Mobile on-device voice choice needs no account. |
| Permissions | CSRF and rate limit on the settings endpoint (settings/route.ts:23-32). |
| Subscription | Voice choice and language are open to any plan that can use voice; the 'Thinking' reasoning level is for paid plans per its on-screen hint (VoiceSettingsModal.tsx:62-65). |
| Limits and metering | Pace bounds 0.5 to 2 with 0.05 steps (voice-session-store.ts:31-41). Voice id max 64 characters, language 2 to 32 characters (route.ts:150-153). |
| Feature flags | none found in the code for voice or language choice. |
| Model compatibility | Only the 13 listed voices are accepted; others fall back to the default (route.ts:264; settings/route.ts:50-56 returns 400). |
| Provider restrictions | Voice list is fixed by the contracts package, tied to what the managed provider offers [inferred]. |
| Local mode | Web: no voice in Local. Mobile Local mode: the voice is a system voice with speed and pitch chosen on the device, and the speech language is stored per Local or Cloud mode (speechSettings.ts:15-56; voice-language/index.tsx:199-290). CLI: language only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty manifest | No sample button. | VoiceSampleButton.tsx:61; manifest.json:1-3 |
| Sample fails to play | Message 'The sample could not play. Try again later.' | VoiceSampleButton.tsx:70-76 |
| Voice changed mid-call | No change until the next call. | live-voice-session.ts:664-672 |
| Settings PATCH fails | Ignored silently; the instruction was already sent. | live-voice-session.ts:703-706 |
| Unknown session on PATCH | 404 'No open voice session was found.' | settings/route.ts:70-76 |
| Invalid voice on PATCH | 400 'That voice is not available.' | settings/route.ts:50-56 |
| Speech language inventory not loaded on mobile | Messages 'Couldn't load installed voices' or 'No installed voices returned'. | voice-language/index.tsx:253-257 |
| Accessibility | Voice dots are buttons with the voice name and aria-current; the settings orb is decoration. | VoiceSettingsModal.tsx:246-255; VoiceSettingsModal.test.tsx:49-117 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Voice/VoiceSettingsModal.test.tsx`: Orb is decoration, voice dots select and mark active, intelligence control scope.
- `apps/web/features/chat/components/Voice/VoiceSampleButton.test.tsx`: Retired voice play and error events are ignored; current failure reported.
- `apps/web/app/api/voice/live/sessions/route.test.ts`: Session creation request body including reasoning.
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Asks the server for the chosen reasoning level.
- `apps/web/features/settings/sections/__tests__/voice-speed-wired.test.ts`: Voice speed wiring in settings.
- `apps/mobile/__tests__/VoicePickerSheet.test.tsx`: Sheet behaviour and voice position announcement.
- `apps/mobile/__tests__/VoiceLanguagePreview.test.tsx`: System voice preview and presets.
- `apps/mobile/__tests__/VoiceLanguageInventory.test.tsx`: Voice inventory states.
- `apps/mobile/__tests__/VoiceSettings.test.tsx`: Voice settings screen rows and explanations.
- `apps/cli/src/voice.rs`: Inline tests for backend choice and gate; language validation test not seen.

**Test scenarios**

- **Voice applies**
  1. Pick a different voice in 'Voice settings'.
  2. End the call and start a new one.
  3. Listen.
  - Expected: The new call speaks with the chosen voice; the voice_sessions row records it.
- **Language mid-call**
  1. During a call switch Language to another language.
  2. Ask a question.
  - Expected: The assistant answers in that language; the row's language column changes.
- **Empty manifest**
  1. Open Voice settings.
  - Expected: No 'Play sample' button and no console error.
- **Populated manifest**
  1. Run the sample generator and commit files.
  2. Open Voice settings.
  - Expected: 'Play sample' appears and plays a clip; pressing again says 'Stop'.
- **Mobile preview**
  1. Open Settings > Voice > Voice.
  2. Press Preview on a system voice.
  - Expected: The device speaks 'This is how AGI will sound.' and the saved voice is unchanged.
- **Invalid CLI language**
  1. Run /voice xx.
  - Expected: Error listing supported codes.

**Where to look when it fails**

- voice_sessions row columns voice, language, pace.
- Settings route returns 404 or 400 bodies.
- Network request to /voice-samples/manifest.json.
- CLI error 'Unsupported voice language'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)
- CLI: [70-qa/test-plans/cli/048-voice-conversation-interface.md](../../70-qa/test-plans/cli/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **Sample manifest is empty so voice preview is hidden on web, desktop and the mobile live picker.** Affects: Web, Desktop, Mobile live voice users choosing a voice.. Evidence: manifest.json:1-3; VoiceSampleButton.tsx:61; voiceSamples.ts:20-27.. Work needed: Owner runs scripts/generate-voice-samples.mjs and commits the output; add a test that the manifest has all 13 voices.
- **A voice change cannot take effect mid-call.** Affects: All live voice users.. Evidence: live-voice-session.ts:664-672.. Work needed: Explain in the dialog or offer a restart.
- **Language is only an instruction, not a recognition setting; brief says applied to recognition.** Affects: Accuracy for non-English speech.. Evidence: live-voices.ts:38-41; route.ts:520-530.. Work needed: Check provider options for an input language setting and measure.
- **Mobile live voice has no pace control.** Affects: Mobile users.. Evidence: liveVoiceSession.ts:345-350 sends voice and language only.. Work needed: Add pace or document.
- **CLI voice setting is language only and has no spoken voice.** Affects: CLI.. Evidence: voice.rs:84-97.. Work needed: None until CLI has spoken replies.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- F048-01
- F048-04
- SYS-voice-and-media
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- SYS-api-and-contracts
- SYS-data-model-and-migrations

## Unknown

- Whether the provider offers a separate input-language setting that the server does not use.
- The exact plan rule inside resolveLiveVoiceReasoning (file not opened).
- Whether Free users can pick the Thinking level and what happens on selection.
- Which languages the app's SUPPORTED_LANGUAGES list contains for web (import alias only).
- Whether the mobile live bar's voice-settings button opens the picker sheet or the settings screen (label only was read).
- Whether the sample generator output would also need a mobile build change (mobile reads the web manifest at runtime).
