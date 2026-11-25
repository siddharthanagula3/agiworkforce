---
id: "F109-04"
type: "feature"
title: "Global dictation from anywhere (desktop and phone)"
aliases: ["Global dictation", "Dictation shortcut", "Voice shortcut", "Dictate into the app you are using", "Dictation bar", "S109.07", "onVoiceHotkey"]
area: "109 Optional native and ambient extensions"
available_on: ["desktop", "mobile"]
implementation: {web: "n/a", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.07"]
depends_on: ["surface:desktop", "surface:mobile", "surface:web", "mode:cloud", "mode:local", "file:apps/desktop/electron/voiceDictation.ts", "api:POST /api/voice/transcribe", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "F109-03", "F109-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-04 Global dictation from anywhere (desktop and phone)

On AGI Desktop, a global key starts and stops dictation from any app: it speaks into Quick Ask or the main window composer, or, if switched on, into the app in front. On mobile the only established route is a widget or shortcut that opens the in-app voice screen. Chrome has none.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.07](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10907).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Desktop routes the key press to Quick Ask if visible, else a visible main window, else raises Quick Ask, and sends a toggle message to the page, which records and transcribes (apps/desktop/electron/voiceDictation.ts:34-49,58-78). With the setting on, a press over another app opens a small bar and types the transcript into that app (apps/desktop/electron/main.ts:1921-1930; apps/desktop/electron/dictationElsewhere.ts:89-170).

**Why it exists.** Dictation should start from anywhere on the device without first opening the app (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md S109.07). The spec describes it as an OS-global dictation shortcut (doc: docs/specs/desktop-global-voice/spec.md).

**Who uses it.** Desktop users who prefer speaking to typing; phone users reaching voice mode from the home screen.

**Problems it solves**

- Opening AGI and clicking the microphone before speaking.
- Typing the spoken text into another app by hand (macOS, when the setting is on).

**Use cases**

- Press the key over a browser, say a question, press again, and the text lands in the Quick Ask composer.
- With 'Dictate into the app you are using' on, dictate an email sentence straight into the mail app.
- On the phone, tap Voice on the home-screen widget to start voice mode.
- Press the key while the main window is hidden: Quick Ask opens and starts listening.

## 2. User experience

**Where to find it**

- Desktop: key default 'Alt+Shift+V' (packages/contracts/local-runtime/src/host-bridge.ts:166); tray item 'Dictation' (F109-01); settings row 'Voice shortcut': 'Speak to AGI from anywhere on your desktop.' and row 'Dictate into the app you are using' with its hint (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:57-59,114-117).
- Dictation bar page: /quick-ask/dictate (apps/web/app/quick-ask/dictate/page.tsx).
- Mobile: widget button 'Voice', Android launcher shortcut 'voice', or link agiworkforce://intent/voice (see F109-05); Settings, Quick Access (apps/mobile/src/features/settings/index.tsx:715).
- Chrome: none (brief: missing).

**Before you start**

- Dictation must be on in settings: 'Dictation is off. Turn it on in Settings > Voice, then press the shortcut again.' (apps/web/features/desktop-host/components/DictationBar.tsx).
- Microphone permission for the page [inferred].
- Dictate-into-other-apps: the user confirms a prompt and macOS Accessibility is requested (apps/desktop/electron/main.ts:2251-2257); the app-in-front lookup uses the macOS helper [inferred from computerUseService.ts:226-235,340].

**Screens and controls**

- Composer microphone state (shared with the button).
- Dictation bar: waveform strip with Cancel, Stop, Send, Retry (DictationBar.tsx:98-110).
- Mobile voice screen (apps/mobile/app/(app)/voice.tsx).

**Journey**

1. Press the key.
2. If another app is in front and the setting is on, a bar opens over that app and starts recording (dictationElsewhere.ts:140-172).
3. Otherwise the composer of Quick Ask or the main window is focused and capture toggles (voiceDictation.ts:70-77).
4. Press again to stop; the page transcribes and the text lands in the composer, or is typed into the app in front once.
5. Text is typed only if that app is still in front and not asking for a password; otherwise it is copied with a notice (dictationElsewhere.ts:174-196).

**What the person sees and gets**

- Composer shows recording, transcribing and transcript states.
- Notification 'Dictation copied' with the reason when text is copied instead of typed (dictationElsewhere.ts:119-123).
- Notification 'Opening Desktop': 'Press the dictation shortcut again once the window is open.' only when no live window can be raised (voiceDictation.ts:10-11,62-68).
- Allowance message when voice minutes are used up (usageLimited from use-dictation.ts:303-306).

**Settings**

- voiceShortcut (default Alt+Shift+V).
- dictateIntoFocusedApp preference.
- dictationEnabled in web settings, 'Settings > Voice'.
- Session limit 10 minutes for the bar (dictationElsewhere.ts:51).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Target routing: Quick Ask visible, else visible main window, else raise Quick Ask (voiceDictation.ts:34-45).
- The panel and main window both attach the preload, so either receives the toggle (voiceDictation.ts:51-57; apps/desktop/electron/preload.ts:101-106).
- Composer receives it through useDesktopVoiceHotkey (apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts:12-20; ChatComposerNew.tsx:2103-2106).
- A hidden Quick Ask interrupts capture (ChatComposerNew.tsx:2107-2110).
- Telemetry events for ok, refused and failed (voiceDictation.ts:65,73,77).
- Dictate-elsewhere: typed once, into the same app, never into a secure field or password agent, line breaks become spaces (dictationElsewhere.ts:14-18,54-71,174-196).
- Mobile: link 'voice' opens /(app)/voice when on-device recognition is guaranteed, else the chat tab (apps/mobile/app/_layout.tsx:219-224; apps/mobile/src/features/voice/services/voiceInput.ts:291-293).

**Incomplete**

- The Desktop transcription path calls a server endpoint, so it needs network and account; no local transcription path was found on this route (apps/web/features/chat/stores/voice-input-store.ts:16,231).
- Hold-to-talk is not available; the press toggles (doc: docs/specs/desktop-global-voice/spec.md).

**Present but disconnected or switched off**

- Tauri system dictation is a compile-time false on every OS (doc: docs/specs/desktop-global-voice/spec.md 'Release gates'); flaw row DESKTOP-SYSTEM-DICTATION-UNWIRED-01 (doc: audit/registers/known-flaws.md:235).

**Not available**

- Chrome global dictation (brief: missing).
- Mobile 'say a phrase to dictate with the app closed': no such path found; the brief's cited apps/mobile/app/_layout.tsx:579 is the app-lock reset, not dictation (apps/mobile/app/_layout.tsx:567).
- Android voice assistant start: none found.

## 4. Required behaviour

**Established requirements**

- Dictation to AGI can be started from anywhere on the device (global shortcut or system voice command) without first opening the app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.07)
- A press while Quick Ask is up or the main window hidden must reach a receiver. (source: doc: docs/decisions/wire-or-cut.md:706)
- System-wide typing must not inject into the wrong field or a secure field. (source: doc: docs/specs/desktop-global-voice/spec.md 'Release gates')
- Settings must include a voice shortcut. (source: doc: docs/product/definition.md:406)

**Acceptance criteria**

1. Press the key with the main window visible: the composer focuses and recording starts; press again and a transcript appears.
2. Press the key with Quick Ask open: capture happens in the panel and the panel stays open.
3. Press the key with the main window hidden: Quick Ask is raised and recording starts.
4. With the dictate-elsewhere setting on and another app in front, a bar opens and the text is typed once into that app.
5. In a password prompt the text is copied and a notice explains it.
6. With dictation off in settings the bar or composer says it is off.
7. On a phone, tapping the widget Voice button opens the voice screen (chat tab on Android below API 33).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The doc table's 'No window at all' row is practically unreachable because surfaceQuickAsk always returns a window [inferred from voiceDictation.ts:44].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update docs/specs/desktop-global-voice/spec.md and docs/decisions/wire-or-cut.md:706, which still say the panel has no preload.
- [proposed] Offer a Local-mode transcription path or state plainly that it needs the cloud.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | toggleGlobalDictation / dictationTarget | `apps/desktop/electron/voiceDictation.ts` | Chooses the window and sends the toggle. |
| service | dictateFromShortcut | `apps/desktop/electron/main.ts` | Tries dictate-elsewhere first when on or listening (lines 1921-1930). |
| service | createDictationElsewhere | `apps/desktop/electron/dictationElsewhere.ts` | Guards and types text into the app in front. |
| service | openDictationBar | `apps/desktop/electron/dictationBar.ts` | The small bar window. |
| service | surfaceQuickAsk | `apps/desktop/electron/quickAsk.ts` | Raises the panel as a fallback target. |
| other | voiceHotkey channel / onVoiceHotkey | `apps/desktop/electron/preload.ts` | Delivers the toggle to the page (lines 101-106). |
| hook | useDesktopVoiceHotkey | `apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts` | Page hook receiving the toggle. |
| component | DictationBar | `apps/web/features/desktop-host/components/DictationBar.tsx` | The bar's page UI. |
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Recording state machine and allowance limits. |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Records audio and posts it to /api/voice/transcribe. |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation kill switch, then the shared transcription handler. |
| endpoint | transcriptions handler | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Rate limit, privacy check, plan and voice-minute allowance, provider call. |
| component | ChatComposerNew dictation wiring | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Calls the hook (lines 2103-2110). |
| screen | /quick-ask/dictate | `apps/web/app/quick-ask/dictate/page.tsx` | Hosts the dictation bar. |
| service | openIntentLink voice case | `apps/mobile/app/_layout.tsx` | Opens the voice screen from a widget link (lines 219-224). |
| screen | mobile voice screen | `apps/mobile/app/(app)/voice.tsx` | On-device voice mode. |
| service | onDeviceRecognizerGuaranteed | `apps/mobile/src/features/voice/services/voiceInput.ts` | Decides voice screen or chat tab (line 291). |
| test | voiceDictation tests | `apps/desktop/electron/__tests__/voiceDictation.test.ts` | Routing rules. |
| test | dictationElsewhere tests | `apps/desktop/electron/__tests__/dictationElsewhere.test.ts` | Typing guards. |
| test | DictationBar tests | `apps/web/features/desktop-host/__tests__/DictationBar.test.tsx` | Bar page behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Global key calls dictateFromShortcut. | device | apps/desktop/electron/main.ts:1939,1921-1930 |
| Target window is chosen and the composer focused; a toggle message is sent. | device | apps/desktop/electron/voiceDictation.ts:62-77 |
| The page records audio from the microphone. | device | apps/web/features/chat/hooks/use-dictation.ts:103-110 |
| The recording is posted to /api/voice/transcribe. | our servers | apps/web/features/chat/stores/voice-input-store.ts:16,231 |
| The server checks kill switch, rate limit, 25 MB size, privacy setting and plan allowance, then calls an OpenAI speech-to-text model and settles voice minutes. | outside service | apps/web/app/api/voice/transcribe/route.ts:19-27; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:294-295,398-416,495-509,574-601 |
| Text returns to the composer, or to the shell, which types it into the app in front once. | device | apps/desktop/electron/dictationElsewhere.ts:174-196 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audio recording | In memory in the page; sent to the server and the transcription provider, dropped afterwards (comment: 'nothing stores' it, apps/web/app/api/llm/v1/audio/transcriptions/route.ts:467) | No | Not kept per that comment |
| Transcript | Composer draft on the device; typed into another app or on the clipboard | Becomes chat content if sent | Clipboard copy remains until replaced |
| voice_shortcut telemetry event | Desktop telemetry service | unknown | unknown |

**Models and providers.** The transcription slot must resolve to a live OpenAI speech-to-text model, else the route throws (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:495-503). The provider folder is packages/ai/providers/openai. The model is chosen by the catalog slot, not by this feature. Mobile voice recognition runs on the device (voiceInput.ts:306-311); the reply model follows the app's mode (apps/mobile/app/(app)/voice.tsx:201,442).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop: signed-in account needed for the hosted page and for transcription. Mobile: voice screen is in the (app) area; sign-in need for Local mode was not traced. |
| Permissions | Microphone; macOS Accessibility for typing into other apps (main.ts:2256); the app-in-front lookup depends on the macOS helper [inferred]. |
| Subscription | Voice minutes are metered per plan with a free allowance (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-601). Exact per-plan numbers: unknown (not read). |
| Limits and metering | Rate limit 'audio-transcription' (route.ts:294); 25 MB per file (route.ts:398); 10-minute bar session (dictationElsewhere.ts:51); voice_minutes allowance. |
| Feature flags | DICTATION_CAPABILITY kill switch (apps/web/app/api/voice/transcribe/route.ts:19-26); dictationEnabled setting; dictateIntoFocusedApp preference. |
| Model compatibility | Speech-to-text model only; the slot must be an OpenAI STT model. |
| Provider restrictions | The user's privacy setting can refuse the provider: 'Voice transcription uses a provider that may train on what you send...' (transcriptions/route.ts:506-515). |
| Local mode | Desktop: this path posts to the server, so it needs the cloud; no local alternative found on this route (unknown for other desktop paths). Mobile: recognition is on the device, with a refusal rather than a quiet switch to server recognition (voiceInput.ts:306-311). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No live window can be raised | Main window opened, 'refused' event, notice to press again | voiceDictation.ts:62-68 |
| Target destroyed while focusing | 'failed' event, nothing sent | voiceDictation.ts:72-75 |
| Quick Ask hidden while recording | Capture interrupted with a note | ChatComposerNew.tsx:2107-2110 |
| Dictation switched off in settings | Bar shows the off message | DictationBar.tsx |
| Voice allowance exhausted | usageLimited with upgrade hint | use-dictation.ts:303-306 |
| App in front changed before typing | Copied to clipboard with a notice | dictationElsewhere.ts:174-196 |
| Bar runs over 10 minutes | Closed or text copied | dictationElsewhere.ts:51,140-144,176-179 |
| Android below API 33 on voice link | Opens the chat tab | apps/mobile/app/_layout.tsx:219-224 |
| Offline desktop | Transcription fails with a retryable message | voice-input-store.ts:182 |
| Screen reader | Announcements 'Recording stopped, transcribing', 'Transcript ready' | use-dictation.ts:31-32 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/voiceDictation.test.ts`: Routing to main window, Quick Ask, hidden or minimised window, destroyed windows.
- `apps/desktop/electron/__tests__/dictationElsewhere.test.ts`: Typing guards and outcomes.
- `apps/web/features/desktop-host/__tests__/DictationBar.test.tsx`: Dictation bar page.
- `apps/web/features/desktop-host/__tests__/DesktopWindowHidden.test.tsx`: Interrupt when the window is hidden.
- `apps/web/app/api/voice/transcribe/__tests__/route.kill-switch.test.ts`: Dictation kill switch.
- `apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts`: Transcription handler.
- `apps/mobile/__tests__/RootLayoutIntentLink.test.tsx`: Voice link to chat tab on Android API 32 (line 490).

**Test scenarios**

- **Press with main window visible**
  1. Focus main window, press the key, speak, press again.
  - Expected: Transcript appears in the composer.
- **Press with Quick Ask open**
  1. Open Quick Ask, press the key.
  - Expected: Panel stays open and records.
- **Hidden main window**
  1. Hide the main window, press the key.
  - Expected: Quick Ask appears and records.
- **Dictate into another app**
  1. Turn on 'Dictate into the app you are using', focus a text editor, press, speak, press.
  - Expected: Text typed once into the editor.
- **Password prompt**
  1. Bring a password prompt in front and repeat.
  - Expected: Text copied with a notice, nothing typed.
- **Phone widget voice**
  1. Tap Voice on the widget.
  - Expected: Voice screen opens (chat tab on Android 12L or lower).

**Where to look when it fails**

- Telemetry domain voice_shortcut with outcomes ok, refused, failed (voiceDictation.ts:65,73,77).
- Console '[dictation] the app in front could not be read' (main.ts:1925).
- Route errors from /api/voice/transcribe including quota and rate limit.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md)
- Mobile: [70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **Docs say the Quick Ask panel has no preload and that no window means a tray-open notice; code now attaches the preload and surfaces Quick Ask** Affects: Engineers and testers reading docs. Evidence: docs/specs/desktop-global-voice/spec.md; docs/decisions/wire-or-cut.md:706 versus apps/desktop/electron/voiceDictation.ts:51-57. Work needed: Correct both documents.
- **Mobile has no system-level dictation start; only a widget or shortcut opens the voice screen** Affects: Mobile users. Evidence: apps/mobile/app/_layout.tsx:219-224. Work needed: Product decision on a Siri or hardware path.
- **Desktop dictation needs cloud transcription; no Local path found** Affects: Local-mode desktop users. Evidence: apps/web/features/chat/stores/voice-input-store.ts:231. Work needed: Establish and document Local behaviour.
- **Chrome has no global dictation** Affects: Chrome users. Evidence: brief S109.07. Work needed: Product decision.
- **Brief cites a wrong mobile file** Affects: Brief readers. Evidence: apps/mobile/app/_layout.tsx:567-579 is app lock reset. Work needed: Correct the brief.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:desktop
- surface:mobile
- surface:web
- mode:cloud
- mode:local
- file:apps/desktop/electron/voiceDictation.ts
- api:POST /api/voice/transcribe
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- F109-03
- F109-05

## Unknown

- Per-plan voice-minute allowances.
- Whether the Electron desktop has any local transcription route.
- Whether the dictate-elsewhere path works off macOS (helper is macOS only).
- Whether telemetry events sync to a server.
- Sign-in needs of the mobile voice screen in Local mode.
