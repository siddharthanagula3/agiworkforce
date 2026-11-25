---
id: "F049-10"
type: "feature"
title: "Desktop dictation into other apps"
aliases: ["Dictate into the app you are using", "System-wide dictation", "Global dictation", "Dictation bar", "dictateIntoFocusedApp", "Dictate into other apps", "S49.28", "DESKTOP-SYSTEM-DICTATION-UNWIRED-01"]
area: "49 Dictation, transcription, and recording"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.28"]
depends_on: ["SYS-voice-and-media", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "surface:desktop", "mode:cloud", "api:POST /api/voice/transcribe", "F049-09", "file:apps/desktop/electron/dictationElsewhere.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-10 Desktop dictation into other apps

On the Mac desktop app, when switched on, the dictation shortcut opens a small floating bar over the app in front. You speak, press the shortcut again, and the text is typed into that app. It never types into password prompts, and falls back to the clipboard with a notice. Off by default; macOS only.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.28](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4928).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not stated on this page | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not stated on this page | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person dictate text into any app, not just the product window, using the global dictation shortcut.

**Why it exists.** S49.28 requires a global desktop shortcut that dictates into the focused application. Competing assistants offer system-wide dictation.

**Who uses it.** Mac desktop users who write in other apps such as mail, notes or editors.

**Problems it solves**

- Having to dictate in the product window and copy text across
- Typing by hand in other apps

**Use cases**

- Dictate an email body into the mail app
- Dictate a note into a notes app
- Dictate a message into a chat app

## 2. User experience

**Where to find it**

- Desktop settings, row 'Dictate into the app you are using' with a switch (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:57, 380-386). The row is only offered when the host reports the preference, which main.ts does on macOS only (apps/desktop/electron/main.ts:1989-1991).
- Shortcut: 'Dictation' shortcut, default Alt+Shift+V, choices include CommandOrControl+Alt+V and CommandOrControl+Alt+D (packages/contracts/local-runtime/src/host-bridge.ts:166; apps/desktop/electron/garnishCore.ts:91). Spec table lists the default (doc: docs/specs/desktop-global-voice/spec.md).
- Web, phone, CLI, VS Code and Chrome: not applicable.

**Before you start**

- Desktop app on macOS (apps/desktop/electron/runtime/computerUseService.ts:226-232).
- The setting switched on and confirmed in the native dialog (main.ts:2078-2089, 2251-2258).
- macOS Accessibility access for the app (computerUseService.ts:331-338).
- Signed in and dictation switched on in Settings > Voice, otherwise the bar says 'Dictation is off. Turn it on in Settings > Voice, then press the shortcut again.' (apps/web/features/desktop-host/components/DictationBar.tsx:15-17).
- Microphone permission; the desktop grants audio-only requests from the trusted app origin (permissionPolicy.ts:60-70).

**Screens and controls**

- Native confirmation 'Dictate into other apps?' with buttons Cancel and 'Type into other apps' (main.ts:2081-2089).
- Floating bar, 440 by 72, bottom centre, always on top, never takes focus (apps/desktop/electron/dictationBar.ts:11, 62, 90).
- Bar shows the dictation strip with stop, send, cancel and retry controls (DictationBar.tsx:70-90).

**Journey**

1. Turn on the switch and confirm; allow Accessibility when macOS asks.
2. Click into a text field in another app.
3. Press the dictation shortcut; the bar opens and recording starts.
4. Speak.
5. Press the shortcut again; recording stops and the transcript is made.
6. The text is typed into the app that was in front.

**What the person sees and gets**

- Typed text appears in the other app.
- If it cannot be typed, a notification 'Dictation copied' says 'Paste it where you want it.' with the reason (apps/desktop/electron/dictationElsewhere.ts:101-105).
- Bar notices: 'What you said could not be typed.' on failure (DictationBar.tsx:18).

**Settings**

- dictateIntoFocusedApp, default false (apps/desktop/electron/garnishCore.ts:575).
- Dictation shortcut in the tray Shortcuts submenu (doc: docs/specs/desktop-global-voice/spec.md).
- Settings > Voice dictation switch and language (apps/web/features/settings/sections/VoiceSection.tsx:113-121, 184-189).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- A press with the setting on and another app in front opens the bar there; a second press stops it (apps/desktop/electron/dictationElsewhere.ts:116-127).
- With the setting off, or AGI Desktop in front, or the front app unreadable, the press dictates into the desktop app as before (apps/desktop/electron/main.ts:1921-1930; dictationElsewhere.ts:113-114).
- Text cleaning: line breaks become spaces, invisible and direction characters are removed, empty text or text over 10,000 characters is refused (dictationElsewhere.ts:61-71; packages/contracts/local-runtime/src/host-bridge.ts:443).
- Sessions longer than 10 minutes end on the next press, and a finish after that copies instead of typing (dictationElsewhere.ts:45, 118-121, 149-151).
- Never types into password or keychain windows, secure input fields, a changed front app or the product itself; it copies instead (dictationElsewhere.ts:17-27, 153-163).
- If typing fails it copies and notifies (dictationElsewhere.ts:165-170).
- Only the bar window can hand back text, via a bridge present only in that window (apps/desktop/electron/preload.ts:182-191; main.ts:586-594).
- Turning the setting off closes any bar and cancels pending work (main.ts:2257; dictationElsewhere.ts:173-176).

**Incomplete**

- macOS only: other platforms never get the setting and typing needs the macOS helper (computerUseService.ts:226-232).
- Product documents still say system dictation is unbuilt, so they are stale (doc: docs/product/experience-contract.md:667-674; audit/registers/known-flaws.md:235).

**Present but disconnected or switched off**

- Off by default (garnishCore.ts:575).
- The retained Tauri dictation module is separate; the spec says its system dictation availability is false (doc: docs/specs/desktop-global-voice/spec.md).

**Not available**

- Windows and Linux: not available.
- Phone and Chrome extension: not applicable (brief marks missing).

## 4. Required behaviour

**Established requirements**

- A global desktop shortcut dictates into whatever application is focused, not only the product window. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.28)
- System-wide dictation is a separate native subsystem, not a composer-only microphone. (source: docs/product/experience-contract.md:587)
- Turning it on needs a confirmation from native code, not a page. (source: apps/desktop/electron/main.ts:2073-2077)

**Acceptance criteria**

1. With the setting off, pressing the dictation shortcut over another app does not open the bar.
2. With the setting on, pressing it over a text field in another app opens the bar without taking focus; pressing again types the transcript there.
3. A transcript containing line breaks is typed as one line.
4. Pressing the shortcut over a macOS password prompt does not type; the text is copied and a notification explains.
5. If the user switches to another app before the second press, nothing is typed into the new app; the text is copied.
6. After 10 minutes the dictation is not typed; it is copied.
7. Turning the setting off while a bar is open closes it and types nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The bar needs the hosted app to load, so it fails offline [inferred from dictationBar.ts:100 loading CLOUD_APP_ORIGIN].
- Transcription for this path runs through the web transcription route, so it needs sign-in and is metered like web dictation. [inferred from DictationBar.tsx using useDictation]

**Proposed improvements** (suggestions, not requirements)

- Update the product contract and flaw register to match the code. [proposed]
- Add a Local on-device transcription option so the bar works without a subscription. [proposed]
- Add a Windows typing helper if Windows is in scope. [proposed]

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | createDictationElsewhere | `apps/desktop/electron/dictationElsewhere.ts` | Decides when and where text may be typed; cleaning, limits, guards. |
| service | openDictationBar | `apps/desktop/electron/dictationBar.ts` | Creates the floating non-focusable bar window loading /quick-ask/dictate. |
| service | main wiring | `apps/desktop/electron/main.ts` | Creates the controller (1896), shortcut routing (1921), IPC handlers (586-594), confirmation (2078) and preference patch (2251). |
| service | toggleGlobalDictation | `apps/desktop/electron/voiceDictation.ts` | Fallback: dictate into the desktop app composer. |
| service | typeForUser, applicationTakingInput | `apps/desktop/electron/runtime/computerUseService.ts` | macOS helper calls that read the front app and type text (lines 340, 374). |
| config | host preferences | `apps/desktop/electron/garnishCore.ts` | dictateIntoFocusedApp default and normalisation (575, 632). |
| config | host bridge contract | `packages/contracts/local-runtime/src/host-bridge.ts` | HostDictationOutcome, MAX_DICTATION_TEXT_LENGTH, finishDictation (441, 443, 660) and shortcut choices (166). |
| config | bridge channels | `apps/desktop/src/lib/tauri-electron/bridgeContract.ts` | dictationFinish, dictationCancel and DICTATION_BAR_ARGUMENT (27, 45-46). |
| service | preload bridge | `apps/desktop/electron/preload.ts` | Exposes finishDictation and cancelDictation only to the bar window (182-191). |
| component | DictationBar | `apps/web/features/desktop-host/components/DictationBar.tsx` | Page in the bar: records, transcribes, hands text to the shell. |
| screen | dictate page | `apps/web/app/quick-ask/dictate/page.tsx` | Route /quick-ask/dictate. |
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | The switch row. |
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Shared capture and transcription controller. |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Uploads recording to /api/voice/transcribe. |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation kill switch then shared transcription handler. |
| hook | useDesktopVoiceHotkey | `apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts` | Receives the shell's shortcut press in the page. |
| config | permission policy | `apps/desktop/electron/permissionPolicy.ts` | Audio-only media permission for the trusted origin. |
| service | Tauri dictation module (retained) | `apps/desktop/src-tauri/src/features/speech/dictation/mod.rs` | Internal build only; not the public path. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Global shortcut fires; main checks the setting and asks the macOS helper for the front app. | device | apps/desktop/electron/main.ts:1921-1925; computerUseService.ts:340-351 |
| Bar window opens over the display under the pointer and loads the hosted page. | device | apps/desktop/electron/dictationBar.ts:55-100 |
| The page records audio and uploads it for transcription. | device and our servers | DictationBar.tsx:39-46; apps/web/features/chat/stores/voice-input-store.ts:16, 231 |
| The server checks flags, age gate, policy, quota or free allowance, then forwards audio to the provider and settles usage. | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-731 |
| The provider returns text. | outside service | route.ts:722 |
| The page hands the text to the shell, which cleans it, re-reads the front app, and types it or copies it. | device | preload.ts:184-188; dictationElsewhere.ts:140-171 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Setting dictateIntoFocusedApp | desktop settings.json in the app's user data folder | no | kept until changed |
| Recording audio | in browser memory in the bar window; not stored by the server | no | lost when the bar closes [inferred]; server keeps no audio (doc: apps/web/app/privacy/page.tsx:255-257) |
| Transcript | typed into the other app or placed on the system clipboard on fallback | no | clipboard content stays until replaced; the product does not clear it |

**Models and providers.** Transcription uses the transcription slot model chosen by the catalog and the openai endpoint (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:496, 722). No chat model is used on this path.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the bar loads the hosted app and the transcribe route requires an account (route.ts getClerkAuthUser). |
| Permissions | macOS Accessibility, microphone, and the native confirmation. Only the bar window may call finishDictation (main.ts:586-594). |
| Subscription | Same as web dictation: free plan monthly free voice seconds, paid plans voice minutes (route.ts:594-600; free-voice-allowance.ts:47). The bar shows usage-limited state through DictationStrip (DictationBar.tsx:75-76). |
| Limits and metering | Text up to 10,000 characters; session 10 minutes; server file 25 MB; per-call provider timeout 60 s. |
| Feature flags | Capability kill switch dictation (apps/web/app/api/voice/transcribe/route.ts:22-27; kill-switches.ts:33). Setting dictateIntoFocusedApp. |
| Model compatibility | Not applicable beyond the transcription slot. |
| Provider restrictions | Transcription endpoint is openai only today (route.ts:722). |
| Local mode | No on-device transcription path was found for the bar; it needs the hosted app and server transcription. So it does not work offline or without sign-in. [inferred] Local mode as a chat mode is not addressed by this path. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Opened outside the desktop shell | The page says 'This bar opens from Desktop, over the app you dictate into.' | DictationBar.tsx:14 |
| Dictation switched off in Settings | Bar says 'Dictation is off...' and records nothing. | DictationBar.tsx:15, 69-71 |
| Accessibility not granted | Reading the front app throws a refusal; main logs a warning and falls back to the desktop composer. | main.ts:1923-1927; computerUseService.ts:331-338 |
| Front app changed | Copy and notify instead of typing. | dictationElsewhere.ts:153-155 |
| Password field or guarded app | Copy and notify. | dictationElsewhere.ts:157-159 |
| Shortcut pressed twice before the front app is known | Only one bar opens. | dictationElsewhere.ts:123-125 |
| Setting turned off during a session | No typing and no clipboard copy. | dictationElsewhere.ts:151-152, 166-168 |
| Offline | Not handled in the code; the bar needs the hosted page. unknown behaviour. | dictationBar.ts:100 |
| Retry after failure | The strip offers retry through useDictation. | DictationBar.tsx:88 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/dictationElsewhere.test.ts`: Text cleaning, press handling, typing once, copy fallbacks, password guards, switch-off races.
- `apps/web/features/desktop-host/__tests__/DictationBar.test.tsx`: Bar starts, stops on shortcut, hands text once, discard, no recording outside shell.
- `apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx`: The switch writes dictateIntoFocusedApp.
- `apps/desktop/electron/__tests__/hostPreferences.test.ts`: Native confirmation before turning on.
- `apps/desktop/electron/__tests__/voiceDictation.test.ts`: Fallback global dictation into the app.
- `apps/desktop/electron/__tests__/shortcuts.test.ts`: Global shortcut registration.
- `apps/web/app/api/voice/transcribe/__tests__/route.kill-switch.test.ts`: Dictation kill switch.

**Test scenarios**

- **Type into a notes app**
  1. Turn on the switch and confirm; grant Accessibility
  2. Click into a note
  3. Press the shortcut, speak, press again
  - Expected: Text appears at the cursor in the note.
- **Password prompt**
  1. Open a macOS password prompt
  2. Press the shortcut, speak, press again
  - Expected: Nothing typed; clipboard holds the text; notification explains.
- **Front app changes**
  1. Start dictation over app A
  2. Switch to app B before the second press
  - Expected: Nothing typed into B; text copied.
- **Setting off**
  1. Turn the switch off
  2. Press the shortcut over another app
  - Expected: Dictation goes into the AGI desktop composer, or the window opens and notifies.
- **Multi-line speech**
  1. Dictate two sentences with a pause that the provider returns on two lines
  - Expected: One line typed; no Return pressed.
- **Quota exhausted on free plan**
  1. Use up the free voice allowance
  2. Use the bar
  - Expected: The strip shows a usage-limited message.

**Where to look when it fails**

- Console warning '[dictation] the app in front could not be read:'.
- Desktop telemetry events with domain voice_shortcut (voiceDictation.ts).
- Server log 'Transcription proxy failed' and reservation events.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md)

## 10. Gaps and dependencies

- **Product contract and flaw register say unbuilt** Affects: Docs, planning. Evidence: docs/product/experience-contract.md:667-674; audit/registers/known-flaws.md:235 versus the code in dictationElsewhere.ts. Work needed: Update both to describe the built, macOS-only, default-off feature.
- **Brief marks desktop missing** Affects: Brief accuracy. Evidence: S49.28 (area brief) versus main.ts:1896-1930. Work needed: Correct the status to partial.
- **macOS only** Affects: Windows and Linux desktop. Evidence: computerUseService.ts:226-232. Work needed: Platform helpers or a decision to stay macOS only.
- **Needs server transcription** Affects: Offline users, Local mode. Evidence: DictationBar.tsx:39-46; voice-input-store.ts:16. Work needed: On-device transcription option.
- **No tested end to end run recorded** Affects: All. Evidence: No result file found; only unit tests exist. Work needed: Human check on a real Mac with Accessibility granted.
- **No notice for first capture** Affects: Desktop. Evidence: see F049-09. Work needed: Add notice.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- surface:desktop
- mode:cloud
- api:POST /api/voice/transcribe
- F049-09
- file:apps/desktop/electron/dictationElsewhere.ts

## Unknown

- Whether it has been run end to end on a real Mac; no record found.
- Whether the helper binary ships in every packaged build.
- What the web page does when the shortcut is pressed while the transcription is still running.
- Whether the dictation bar respects a custom language set in Settings > Voice; the shared store has a language setting but I did not trace the bar.
- Whether Windows or Linux are planned.
