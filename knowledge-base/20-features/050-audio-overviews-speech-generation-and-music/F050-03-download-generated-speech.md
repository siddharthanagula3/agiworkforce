---
id: "F050-03"
type: "feature"
title: "Download generated speech"
aliases: ["Download generated speech", "Save speech as audio file", "S50.04"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.04"]
depends_on: ["surface:web", "surface:mobile", "F050-01", "api:POST /api/voice/speech", "file:apps/mobile/src/features/voice/services/serverSpeech.ts", "SYS-files-artifacts-and-storage", "SYS-voice-and-media"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-03 Download generated speech

A way to save generated speech as an audio file. It is intentionally not built on any app. The founders declined it to match Claude, which offers no download of spoken replies. Mobile writes a temporary file only to play it and deletes it afterwards.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.04](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5004).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. The planned capability would let a person keep the audio of a read-aloud reply as a file. (S50.04 Should, brief)

**Why it exists.** The brief lists it for parity checking. The decision record declined it because Claude offers no download of spoken replies. (doc: docs/decisions/2026-09-27-founder-decisions.md:250-258)

**Who uses it.** No one. Marked not applicable on all apps.

**Problems it solves**

- Would have let people share or archive spoken replies; the product chose not to.

**Use cases**

- None offered. A tester uses this page to confirm that no download control exists and that temporary audio is cleaned up.

## 2. User experience

**Where to find it**

- No control exists on Web, Desktop, Mobile, CLI, VS Code or Chrome (no download code in useTTS.ts, serverSpeech.ts, or the extension read-aloud module; the server route returns audio with Cache-Control no-store: apps/web/app/api/voice/speech/route.ts:243-246).

**Before you start**

- not applicable

**Screens and controls**

- none

**Journey**

1. Not applicable. A person who wants audio hears it play and cannot save it.

**What the person sees and gets**

- No file output. On Mobile a temporary mp3 exists in the cache while it plays and is removed after (apps/mobile/src/features/voice/services/serverSpeech.ts:66, 71-88).

**Settings**

- none

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web audio bytes are decoded and played in memory and not kept (apps/web/lib/hooks/useTTS.ts:61-64, 94, 474-481).
- Mobile temporary file is deleted when playback finishes, fails or is stopped (serverSpeech.ts:71-88, 95-101).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Download on every app: declined by decision (doc: docs/decisions/2026-09-27-founder-decisions.md:250-258; ledger row S50.04 marks all cells n/a: audit/ledger/ecosystem-capability-ledger.jsonl).

## 4. Required behaviour

**Established requirements**

- Generated speech download is not built; leader parity declined it. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:250-258 (D-2026-09-28-12))
- Brief status is not applicable on every app. (source: S50.04 (brief))
- Anything the agent removes or overwrites must go to Trash first and permanent deletion needs an explicit user action; temporary playback files are the app's own scratch, not user data. (source: doc: AGENTS.md section 9 [inferred applicability to cache files])

**Acceptance criteria**

1. No Download, Save audio or Share audio control appears next to Read aloud on any app.
2. After a read aloud on Mobile finishes or is stopped, no read-aloud-*.mp3 file remains in the cache folder.
3. The speech route response is sent with Cache-Control no-store.
4. Stopping Mobile playback mid-chunk removes the temporary file.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- If the decision is reversed, downloads on Cloud would need metering and a consent-free preset voice only [inferred from D-2026-09-28-12 mention of preset voices].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep this page as a record of a deliberate decline; do not build unless the leaders add the feature (re-check per doc: AGENTS.md section 10).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | serverSpeech play() | `apps/mobile/src/features/voice/services/serverSpeech.ts` | Writes the temporary mp3 and always deletes it (65-116). |
| endpoint | POST /api/voice/speech | `apps/web/app/api/voice/speech/route.ts` | Returns audio as bytes with no-store; no file endpoint. |
| hook | useTTS fetchSpeech and decodeSpeech | `apps/web/lib/hooks/useTTS.ts` | Holds audio in memory only (41-66, 89-98). |
| config | decision D-2026-09-28-12 | `docs/decisions/2026-09-27-founder-decisions.md` | Records the decline. |
| other | ecosystem ledger row S50.04 | `audit/ledger/ecosystem-capability-ledger.jsonl` | Marks all apps n/a with the reason. |
| other | area brief 050 | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | States S50.04 not applicable anywhere. |
| test | mobile server read-aloud test | `apps/mobile/__tests__/server-read-aloud.test.ts` | Covers playback lifecycle (temp file cleanup assertions not opened: unknown). |
| test | web speech route test | `apps/web/app/api/voice/speech/__tests__/route.test.ts` | Success returns audio (content type assertion not opened: unknown). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Audio arrives from the server as bytes. | our servers | route.ts:225, 243-246 |
| Web decodes it in memory and plays it; nothing is written. | device | useTTS.ts:61-64, 464-481 |
| Mobile writes the bytes to a cache file, plays it, deletes it. | device | serverSpeech.ts:66, 103-109, 71-88 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Temporary mp3 on mobile | App cache folder | No | Deleted on finish, error or stop (serverSpeech.ts:71-88). A crash before cleanup could leave a file: not handled in the code that I opened. |

**Models and providers.** Not applicable; no download feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | not applicable |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable |
| Provider restrictions | not applicable |
| Local mode | Not applicable. Mobile Local uses the device voice, which produces no file. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Playback stopped mid-way (mobile) | Temp file removed. | serverSpeech.ts:115 |
| File write or player error (mobile) | Error propagates and cleanup runs. | serverSpeech.ts:112-114 |
| App killed during playback | Not handled in the code; leftover files in the cache folder are possible. | no startup sweep found in files opened |
| Web | No file exists, so no cleanup is needed. | useTTS.ts:94 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/server-read-aloud.test.ts`: Server playback lifecycle on mobile; temp-file assertions unknown.
- `apps/web/app/api/voice/speech/__tests__/route.test.ts`: Route returns audio on success.

**Test scenarios**

- **No download control**
  1. Open a reply's actions on Web, Mobile and Chrome.
  - Expected: No Download or Save audio item exists.
- **Mobile cache clean after play**
  1. In Cloud mode read a reply aloud to the end.
  2. Inspect the app cache folder.
  - Expected: No read-aloud-*.mp3 remains.
- **Mobile cache clean after stop**
  1. Start read aloud, tap Stop after two seconds.
  2. Inspect the cache folder.
  - Expected: No read-aloud-*.mp3 remains.
- **No-store header**
  1. Call the speech route with a valid session and read the response headers.
  - Expected: Cache-Control: no-store and Content-Type audio/mpeg.

**Where to look when it fails**

- Mobile console '[serverSpeech] playback cleanup failed' (serverSpeech.ts:85).
- Cache folder listing for read-aloud-*.mp3.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No startup cleanup for temporary mp3 files left by a crash.** Affects: Mobile Cloud. Evidence: serverSpeech.ts:65-88 cleans only in the live session. Work needed: Sweep stale read-aloud-* files on start, or confirm the OS clears cache.
- **None between decision and code; the decline matches the code.** Affects: none. Evidence: doc: docs/decisions/2026-09-27-founder-decisions.md:250-258. Work needed: none

**Depends on**

- surface:web
- surface:mobile
- F050-01
- api:POST /api/voice/speech
- file:apps/mobile/src/features/voice/services/serverSpeech.ts
- SYS-files-artifacts-and-storage
- SYS-voice-and-media

## Unknown

- Whether the mobile test asserts temp-file deletion.
- Whether the OS cleans the cache folder after a crash.
- Whether the leaders have changed their position since the decision was dated 2026-09-28.
