---
id: "F049-03"
type: "feature"
title: "Stop, discard and retry a recording"
aliases: ["Stop recording", "Discard recording", "Retry transcription", "Try again", "Cancel recording", "Recording timer", "Pause and resume", "S49.06", "S49.07", "S49.18", "S49.19"]
area: "49 Dictation, transcription, and recording"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.06", "S49.07", "S49.18", "S49.19"]
depends_on: ["F049-01", "F049-04", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "surface:vscode", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-03 Stop, discard and retry a recording

Controls to end, throw away or redo a dictation. Web keeps a failed recording in memory so Try again re-sends it. The CLI offers R to retry. The phone cancels with X and re-records on failure. Pause, resume and a timer are not built for dictation, except a whole-seconds counter in the CLI.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.06](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4906), [S49.07](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4907), [S49.18](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4918), [S49.19](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4919).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stops a recording and gets its text, discards it without inserting anything, retries a failed transcription, and shows how long a recording has run. (apps/web/features/chat/stores/voice-input-store.ts:385-436; apps/cli/src/voice.rs:357-377, 762-771)

**Why it exists.** A long dictation should not be lost because the network blinked, and a person must be able to back out. The brief requires retry (S49.06), discard (S49.07), pause and resume (S49.18) and a duration display (S49.19).

**Who uses it.** Anyone dictating, especially long or noisy recordings.

**Problems it solves**

- Losing a long recording after a temporary error.
- Accidental recordings inserting junk text.
- Not knowing how long recording has run (CLI only).

**Use cases**

- Web: transcription fails with a 5xx error; the user clicks Try again and the same audio is re-sent.
- Web: user presses Escape to discard.
- CLI: transcription fails; user presses R to retry the same recording.
- Phone: user taps X to cancel.

## 2. User experience

**Where to find it**

- Web and desktop: the dictation strip: X 'Discard recording' (becomes 'Dismiss voice input error' on failure), square stop, 'Try again' on failure (DictationStrip.tsx:16-24, 128-170).
- Phone: X 'Cancel recording' on the composer while dictating (ChatInput.tsx:1947-1951); 'Try again' in the 'Didn't catch that' alert (ChatInput.tsx:1373-1379).
- CLI: '[R to retry this recording, any other key to drop it]' after an error; ESC to discard after the text is shown; REC line with elapsed seconds (voice.rs:357-377, 762-771).
- Chrome: no discard or retry control found (voice.ts:252-270); this follows decision D-2026-09-28-23 listing retry of a failed dictation as outside the side panel's scope.
- VS Code: 'Cancel' on the recorder page and a cancelDictation message (dictationPage.ts:91; ChatStateManager.ts:1648-1650).

**Before you start**

- An active recording or a failed transcription.

**Screens and controls**

- Web strip: X, stop, send, and on error the message with Try again (or Upgrade when the plan can be upgraded after a plan or allowance refusal) (DictationStrip.tsx:146-170).
- Phone: X, stop, send.
- CLI: keyboard only.

**Journey**

1. Recording is running.
2. Person presses stop, discard or send.
3. If transcription fails on web, the strip shows the error and Try again.
4. Person clicks Try again; the same audio is sent again; on success the text is inserted with the original intent (insert or send).
5. If the refusal was a plan or allowance one, the recording is dropped and only Upgrade (or nothing) is offered.

**What the person sees and gets**

- Web announcement 'Recording discarded' (use-dictation.ts:33).
- Web error messages by cause (voice-input-store.ts:125-184).
- CLI '(discarded)', '(recording cancelled)', 'REC ... Ns' (voice.rs:117-125, 770).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web retry: failed blob kept in module memory; retryTranscription re-uploads it and reports the result (voice-input-store.ts:375, 385-412).
- Web does not keep the recording after a plan or organization refusal (voice-input-store.ts:374-376, 406-407).
- Web discard: cancelListening releases the microphone, drops chunks and the failed recording (voice-input-store.ts:414-428; use-dictation.ts:125-135).
- CLI retry loop and discard (voice.rs:203-226, 357-377).
- CLI duration: elapsed whole seconds in the REC line (voice.rs:762-771).
- Phone cancel via X (ChatInput.tsx:1422-1427); phone re-record via 'Try again' alert that starts a new recording (ChatInput.tsx:1373-1379).
- VS Code cancel aborts the controller and closes the local page (ChatStateManager.ts:1648-1650; dictationCapturePage.ts:45-52).

**Incomplete**

- Phone retry starts a fresh recording instead of re-sending the same audio, because audio is not saved ('Audio isn't saved, so say it again.') (ChatInput.tsx:1373-1376). The brief says retry done; this is retry by re-recording.
- Web and desktop and phone show no elapsed timer. The phone test is named 'renders cancel, waveform, stop and send without an elapsed timer' (apps/mobile/__tests__/ChatInputDictation.test.tsx).
- Chrome has no discard: stopping keeps the text (voice.ts:260-262).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Pause and resume for dictation recording: none found in web, desktop, phone, CLI, Chrome or VS Code. The phone live-voice bar does have pause and a call timer, but that is F049-05 (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:231-232).

## 4. Required behaviour

**Established requirements**

- After a failed transcription the user can retry without starting over. (source: brief S49.06)
- The user can discard a recording without inserting or sending anything. (source: brief S49.07)
- The user can pause and resume a recording in progress. (source: brief S49.18)
- While recording, the elapsed duration is shown. (source: brief S49.19)
- Retry of a failed dictation is not part of the Chrome side panel scope. (source: docs/decisions/2026-09-27-founder-decisions.md:370-375 (D-2026-09-28-23))

**Acceptance criteria**

1. Web: force a 500 from the transcription endpoint; Try again re-sends the same audio without recording again.
2. Web: force a plan refusal; no Try again is offered and no recording is retained.
3. Web: press Escape while recording; no text inserted and the microphone indicator turns off.
4. CLI: force a transcription error; pressing R retries the same WAV; any other key drops it.
5. Phone: tap X while recording; no text inserted.
6. CLI: the REC line shows elapsed seconds.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Timer and pause may be added without new server work because capture is local [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show elapsed time on web, desktop and phone dictation bars.
- [proposed] Add pause and resume to dictation (web MediaRecorder supports pause) after a product decision.
- [proposed] Keep the phone's last audio in memory long enough for a same-audio retry, only if on-device privacy rules allow.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | retryTranscription | `apps/web/features/chat/stores/voice-input-store.ts` | Re-sends failedRecording; clears it on success or refusal |
| store | cancelListening | `apps/web/features/chat/stores/voice-input-store.ts` | Releases microphone and drops audio |
| hook | useDictation retry/cancel | `apps/web/features/chat/hooks/use-dictation.ts` | Wires retry and cancel to the state machine and announcements |
| component | DictationStrip | `apps/web/features/chat/components/Composer/DictationStrip.tsx` | X, stop, Try again and Upgrade buttons; Escape key |
| other | dictation-machine | `apps/web/features/chat/lib/dictation-machine.ts` | Allowed state transitions for cancel and fail |
| hook | use-desktop-voice-hotkey | `apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts` | Interrupts a recording left in a hidden desktop window |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Cancel X, failure alert with Try again |
| component | VoiceInputButton (mobile) | `apps/mobile/src/features/voice/components/VoiceInputButton.tsx` | cancelActiveRecording and failure handling |
| service | voiceFailure | `apps/mobile/src/features/voice/services/voiceFailure.ts` | Classifies failures into user messages |
| service | CLI offer_transcription_retry | `apps/cli/src/voice.rs` | R to retry, other key to drop |
| service | CLI record_audio | `apps/cli/src/voice.rs` | Elapsed seconds display, ENTER/release stop, ESC cancel |
| service | VS Code cancelDictation | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Aborts a dictation in progress |
| service | Chrome voice | `apps/extension/src/features/side-panel/voice.ts` | Click-to-stop; reset aborts without inserting |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Stop: web stops MediaRecorder, builds a Blob from chunks, uploads it. | device and our servers | voice-input-store.ts:328-370 |
| Failure: the error is mapped; the blob is kept in memory unless the refusal was plan or organization. | device | voice-input-store.ts:371-383 |
| Retry: the same blob is posted again with the same language. | device and our servers | voice-input-store.ts:385-412 |
| Discard: owner is retired, recorder stopped, microphone tracks stopped, chunks cleared. | device | voice-input-store.ts:414-428; releaseCapture lines 190-205 |
| CLI retry re-sends the same WAV path content; WAV folder removed afterwards. | device and our servers | voice.rs:203-226, 968-1004 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Failed web recording | Module memory only | No | Cleared on success, cancel, plan refusal or page reload |
| CLI recording | Temp WAV in private config folder | No | Deleted after each attempt; the in-memory samples are reused for retry (voice.rs:203-226, 1000-1004) |

**Models and providers.** Retry uses the same speech model as the first attempt; there is no model switch on retry in the code read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Same as F049-01. |
| Permissions | Same as F049-01. |
| Subscription | A plan or allowance refusal makes the recording non-retryable on web (voice-input-store.ts:374-376). Retried requests do not carry a client-chosen idempotency key on web [inferred: web code builds no Idempotency-Key header; the server mints one if absent (route.ts:575-579)], so a retry may count again; server marks failed calls as refunded (route.ts:680-715). |
| Limits and metering | Rate limit may answer 429 'Too many recordings just now. Wait a moment, then try again.' (voice-input-store.ts:174-176). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Phone: nothing to retry because audio never leaves the device and is not kept. CLI local backend retry re-runs the local program. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Retry while already transcribing | Ignored | voice-input-store.ts:392-393; use-dictation.ts:237 |
| Retry after destination changed | Owner no longer current, so cancelled | voice-input-store.ts:386-390 |
| Plan or allowance refusal | No retry; Upgrade shown when plan can be upgraded | use-dictation.ts:69-73; DictationStrip.tsx:146-160 |
| Recording too long (413) | 'That recording was too long to transcribe. Try a shorter one.' still retryable | voice-input-store.ts:171-173 |
| CLI recording shorter than 300 ms | Skipped as too short | voice.rs:39, 168-175 |
| Phone cancel while transcribing | Cancel stays available while its owner transcribes | test ChatInputDictation 'keeps cancellation available while its owner transcribes' |
| Accessibility | Strip is a labelled group and announcements are spoken; error uses role alert | DictationStrip.tsx:96-104, 128-135 |
| Pause / resume / timer on web, desktop, phone | not handled in the code | no references in files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `test:apps/web/features/chat/stores/voice-input-store.test.ts` (not found): Retryable failures, spent-plan drop, retry stops offering after refusal, cancellation drops audio
- `test:apps/web/features/chat/components/Composer/DictationStrip.test.tsx` (not found): Discard and stop buttons
- `test:apps/web/features/chat/hooks/useDictation.test.tsx` (not found): Retry blocked when dictation disabled
- `test:apps/mobile/__tests__/VoiceInputButtonFailure.test.tsx` (not found): Phone retry prompt vs plain unavailable
- `test:apps/mobile/__tests__/ChatInputDictation.test.tsx` (not found): Cancel while transcribing; no timer
- `test:apps/cli/src/voice.rs` (not found): Inline tests; whether any covers retry was not established

**Test scenarios**

- **Web retry same audio**
  1. Block the network after stop so upload fails
  2. Click Try again with the network restored
  - Expected: Transcript inserted; no second recording needed.
- **Web plan refusal**
  1. Use a Free account with allowance used
  2. Dictate
  - Expected: Message 'This month's voice minutes are used up. Type instead.' with Upgrade only if upgradable; no Try again.
- **Discard**
  1. Start recording
  2. Press Escape
  - Expected: Strip closes, field unchanged, microphone indicator off.
- **CLI retry**
  1. Run /voice with an unreachable backend
  2. Record
  3. Press R at the prompt
  - Expected: Same recording is sent again.
- **Phone cancel**
  1. Start dictation
  2. Tap X
  - Expected: No text added.

**Where to look when it fails**

- Web error strings listed in voice-input-store.ts:125-184.
- CLI 'Transcription failed:' output.
- Browser console for MediaRecorder errors (not logged by the store).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/web/049-dictation-transcription-and-recording.md)
- Desktop: [70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md)
- Mobile: [70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md)
- CLI: [70-qa/test-plans/cli/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/cli/049-dictation-transcription-and-recording.md)
- Chrome: [70-qa/test-plans/chrome/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/chrome/049-dictation-transcription-and-recording.md)
- No hands-on plan yet for VS Code: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Pause and resume do not exist for dictation anywhere.** Affects: All apps. Evidence: brief S49.18; no code found. Work needed: Decide scope, then build for web MediaRecorder and the phone.
- **No elapsed-duration display on web, desktop, phone and Chrome.** Affects: Web, desktop, phone, Chrome, VS Code. Evidence: brief S49.19; apps/mobile/__tests__/ChatInputDictation.test.tsx. Work needed: Add a timer to the strip and composer.
- **Phone retry re-records instead of re-sending the same audio.** Affects: Phone. Evidence: ChatInput.tsx:1373-1379. Work needed: Decide if acceptable; update brief wording.
- **Chrome has no discard control.** Affects: Chrome. Evidence: voice.ts:252-270; brief S49.07. Work needed: Add or record as intentional (D-2026-09-28-23 covers retry only).
- **VS Code retry: after a failure the user must start again; no retry button found.** Affects: VS Code. Evidence: ChatStateManager.ts:5798-5806. Work needed: Verify and decide.

**Depends on**

- F049-01
- F049-04
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- surface:vscode
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design

## Unknown

- Whether any CLI inline test covers the retry loop.
- Whether the web retry sends a new Idempotency-Key and can double-count minutes.
- Whether VS Code offers retry after an error.
- Whether Chrome stop-versus-discard behaviour is intended.
