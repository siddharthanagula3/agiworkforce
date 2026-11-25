---
id: "F051-09"
type: "feature"
title: "Call records: transcripts, recordings and outcomes"
aliases: ["Call records", "S51.17 Call transcripts", "S51.18 Call recordings and consent controls", "S51.19 Call outcome labels", "call log", "call history"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.17", "S51.18", "S51.19"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "F051-07", "F051-08", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-09 Call records: transcripts, recordings and outcomes

A planned feature that would keep a transcript for every voice-agent call, optionally record calls with announce, opt-out and retention controls, and label each call resolved, transferred, voicemail or failed. None of it is built on any app or in the API.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.17](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5117), [S51.18](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5118), [S51.19](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5119).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let an owner review each call: read the transcript, play a recording if one was made, and see one outcome label. Today no call data exists because no calls exist (audit/ledger/ecosystem-capability-ledger.jsonl:1677-1679).

**Why it exists.** Owners need to check what an agent said and whether it helped. The recording part carries consent rules, so the brief names announce, opt-out and retention (S51.18 in data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md).

**Who uses it.** Owners and admins of voice agents, and reviewers who check quality. Not CLI, VS Code or Chrome (ledger n/a).

**Problems it solves**

- No way to audit what an agent told a caller [inferred].
- No evidence of consent or of how a call ended [inferred].
- No way to sort successful calls from failed ones [inferred].

**Use cases**

- An owner opens yesterday's calls and reads one transcript [proposed].
- A manager filters calls by outcome 'failed' to find problems [proposed].
- An admin sets recordings to be deleted after a set time [proposed].

## 2. User experience

**Where to find it**

- Web: not present (audit/ledger/ecosystem-capability-ledger.jsonl:1677-1679).
- Desktop: not present; it shows the hosted web app.
- Mobile: not present.
- CLI, VS Code, Chrome: not applicable.

**Before you start**

- None can be met today.
- Intended [proposed]: a voice agent that has taken or placed calls (F051-07, F051-08).

**Screens and controls**

- No screen or control exists.
- Intended per brief [proposed]: a call list, a transcript view, an audio player, and recording settings for announce, opt-out and retention.

**Journey**

1. Today: not possible.
2. Intended [proposed]: 1 open an agent's Calls tab; 2 pick a call; 3 read the transcript; 4 play the recording if present; 5 see the outcome label; 6 change retention in settings.

**What the person sees and gets**

- Nothing today.
- Intended: transcript text, audio, one of four outcome labels (resolved, transferred, voicemail, failed) per S51.19.

**Settings**

- none found in the code. Intended: announce recording, caller opt-out, retention period (S51.18).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for calls. The nearest working thing is in-app live voice, which has session billing but no transcript list for owners (apps/web/lib/voice/live-voice-billing.ts); whether live voice keeps transcripts is unknown.

**Incomplete**

- none found in the code.

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Transcripts (S51.17), recordings and consent controls (S51.18) and outcome labels (S51.19) are missing on web, desktop, mobile and the API (audit/ledger/ecosystem-capability-ledger.jsonl:1677-1679).
- CLI, VS Code, Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- Each voice-agent call keeps a transcript the owner can review. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.17)
- Calls can be recorded, with recording-consent controls: announce, opt-out and retention. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.18)
- Each call is labelled with one outcome: resolved, transferred, voicemail or failed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.19)
- Security behaviour fails closed; collect the minimum data required. (source: AGENTS.md section 6)
- Permanent removal happens only from an explicit user action that names what is lost. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Every completed call produces a transcript the owner can open.
2. Recording is off unless enabled; when on, the caller is told at the start of the call.
3. A caller who opts out is not recorded and the call continues.
4. Recordings are deleted after the configured retention period; the owner sees the period.
5. Each call has exactly one outcome from the four labels.
6. Only authorised members of the workspace can open a transcript or recording.
7. Deleting a recording asks first and names what is lost.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Recording laws differ by place, so announce and opt-out defaults need legal review [inferred; no compliance document found for calls].
- Transcripts and recordings are personal data and fall under account erasure and privacy export rules [inferred from existing erasure code in apps/web/lib/server/account-erasure.ts].

**Proposed improvements** (suggestions, not requirements)

- Store recordings in private signed storage, as media jobs do [proposed].
- Decide who can open a transcript and the default retention before building; the brief leaves both open [proposed].
- Make 'unknown' an internal state when an outcome cannot be classified [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | S51.17, S51.18, S51.19 with status missing. |
| other | Capability ledger rows | `audit/ledger/ecosystem-capability-ledger.jsonl` | Lines 1677-1679 for the three items. |
| other | Missing-work list | `audit/missing/051-voice-agent-builder-and-telephony-extensions.md` | Open items, wave 4. |
| service | Live voice billing | `apps/web/lib/voice/live-voice-billing.ts` | Adjacent: session time accounting for in-app live voice. |
| endpoint | Live voice sessions routes | `apps/web/app/api/voice/live/sessions/route.ts` | Adjacent: starts in-app live voice sessions; not phone. |
| endpoint | Voice transcribe route | `apps/web/app/api/voice/transcribe/route.ts` | Adjacent: server speech-to-text for dictation; a building block for transcripts [inferred]. |
| endpoint | Voice speech route | `apps/web/app/api/voice/speech/route.ts` | Adjacent: server speech output route for in-app voice. |
| service | Account erasure | `apps/web/lib/server/account-erasure.ts` | Existing erasure path any call data must join [inferred]. |
| table | usage_events | `apps/web/db/neon/0016_misc.sql` | Generic usage event table (line 48); not a call table. |
| other | Overview statement | `audit/overview.md` | Line 161: telephony and voice-agent builder not built. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No call is captured, transcribed, recorded or labelled by any code today. | our servers | audit/ledger/ecosystem-capability-ledger.jsonl:1677-1679 |
| Intended [proposed]: during a call our servers stream audio to speech-to-text, append turns to a transcript, optionally write audio to private storage after an announcement, and set an outcome when the call ends. | our servers | none; proposed, no code |
| Speech-to-text and the model may be outside services chosen by the model catalog [inferred]. | outside service | apps/web/app/api/voice/transcribe/route.ts (adjacent route exists; its provider was not opened) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Transcript, recording audio, outcome label, consent flags | none found in the code; no table or bucket exists | not applicable | not applicable; intended retention is owner-configured (S51.18) |

**Models and providers.** No model takes part today. Transcripts would need speech-to-text and a model; the choice would come from the model catalog (SYS-model-catalog-and-routing), not be hard-coded (AGENTS.md section 4).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. Who can open a transcript is unspecified in the brief. |
| Subscription | none found in the code for call records. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable today. |
| Provider restrictions | unknown. |
| Local mode | Not available; nothing exists. Transcripts of phone calls would be produced by our servers in a Cloud feature [inferred]. Local dictation exists elsewhere but is a separate feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No loading, empty, error, retry or offline state exists. | audit/ledger/ecosystem-capability-ledger.jsonl:1677-1679 |
| Recording consent, partial transcript after a dropped call, retention expiry, deletion | not handled in the code; no code exists. | searched repository, no call-record source files |
| Accessibility of transcript and player | not handled in the code. | no UI exists |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/voice/__tests__/live-voice-billing.test.ts`: Adjacent only: in-app live voice billing, no call records.

**Test scenarios**

- **Confirm absence**
  1. Search the web app and API for a Calls list or transcript view.
  - Expected: None found.
- **When built: transcript**
  1. Complete a test call.
  2. Open the call.
  - Expected: Full transcript with speaker turns and times.
- **When built: announce and opt-out**
  1. Enable recording.
  2. Call and say you opt out.
  - Expected: Announcement heard; no audio stored; call continues.
- **When built: retention**
  1. Set a short retention.
  2. Wait past it.
  - Expected: Recording removed; transcript behaviour as configured.
- **When built: access**
  1. Open a transcript link as a non-member.
  - Expected: Refused.

**Where to look when it fails**

- Check ledger rows S51.17-S51.19.
- Nothing was run for this page; no result is claimed.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No transcripts, recordings, consent controls or outcome labels exist.** Affects: Owners on web, desktop, mobile and API. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1677-1679. Work needed: Call data tables, storage, API, owner screens, retention job, erasure integration.
- **Access rules and retention length are unspecified.** Affects: All future owners and callers. Evidence: S51.17 and S51.18 give no values. Work needed: Decide in docs/product and docs/compliance.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- F051-07
- F051-08
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- mode:cloud

## Unknown

- Who can open a transcript.
- Default and maximum recording retention.
- Where recordings would be stored.
- Whether in-app live voice keeps transcripts anywhere owners can read.
- Legal wording for the recording announcement.
- HTTP methods of the voice transcribe route.
