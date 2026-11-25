---
id: "F050-05"
type: "feature"
title: "Overview transcript and source links"
aliases: ["Overview transcript", "Audio transcript", "Source-linked transcript", "Transcript references", "S50.11", "S50.12"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.11", "S50.12"]
depends_on: ["F050-04", "surface:web", "surface:mobile", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-api-and-contracts", "SYS-voice-and-media"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-05 Overview transcript and source links

A planned text transcript of an audio overview, with each line linked back to the sources it came from. Not built on any app. It depends on the audio overview feature F050-04, which does not exist either.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.11](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5011), [S50.12](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5012).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would show the words of an audio overview as text and link each line to the source passages it used. (S50.11, S50.12 Should, brief)

**Why it exists.** A transcript lets people read, search and check claims. Source links let them verify what the hosts said.

**Who uses it.** People who listen to overviews and want to check or skim them [inferred].

**Problems it solves**

- Cannot verify spoken claims.
- Cannot skim audio.

**Use cases**

- Open the transcript of an overview and tap a line to open the source page.
- Search the transcript for a name.
- Copy a line with its citation.

## 2. User experience

**Where to find it**

- Not built on any app. No transcript view, screen or control exists (no overview code found).

**Before you start**

- An audio overview (F050-04), which is not built.

**Screens and controls**

- none exist.

**Journey**

1. Not applicable today. [proposed] Generate overview, open Transcript, tap a line to jump to its source.

**What the person sees and gets**

- none exist.

**Settings**

- none exist.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature. Adjacent: the mobile chat already links numeric citations in answers to sources (apps/mobile/src/features/chat/components/MessageBubble.tsx:1995-2000), which shows a citation pattern exists for text answers.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Transcript and source-linked references on Web, Desktop, Mobile, CLI, VS Code, Chrome (ledger rows S50.11-S50.12 missing: audit/ledger/ecosystem-capability-ledger.jsonl:1639-1640).

## 4. Required behaviour

**Established requirements**

- A transcript of the audio overview is available. (source: S50.11 Should (brief))
- Transcript lines link back to the sources they draw on. (source: S50.12 Should (brief))

**Acceptance criteria**

1. Every generated overview has a text transcript.
2. Each transcript line that uses a source shows a link that opens that source.
3. The transcript matches what was spoken.
4. The transcript is available to screen readers.
5. Regenerating an overview replaces or versions the transcript with it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The script written for speech is the natural transcript source, so storing it with the audio makes the transcript free [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the citation component and data model of answers with sources.
- [proposed] Keep the transcript as a message or artifact so export and deletion follow existing chat rules (doc: docs/decisions/2026-09-27-founder-decisions.md:250-256 says voice transcripts are ordinary chat messages).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | area brief 050 | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | Lists S50.11 and S50.12 as missing. |
| other | ecosystem ledger | `audit/ledger/ecosystem-capability-ledger.jsonl` | Rows 1639-1640 mark every cell missing. |
| component | mobile answer citations (adjacent) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Existing numeric citation linking in answers (around 1995-2000). |
| other | voice transcript decision | `docs/decisions/2026-09-27-founder-decisions.md` | Voice transcripts are chat messages (250-256). |
| other | feature F050-04 page | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | Parent feature; same brief. |
| endpoint | POST /api/voice/speech (adjacent) | `apps/web/app/api/voice/speech/route.ts` | Speech step that would speak the transcript text. |
| hook | web useTTS (adjacent) | `apps/web/lib/hooks/useTTS.ts` | Playback only; has no transcript output. |
| other | competitor note | `docs/research/competitor-surfaces-2026-10-24.md` | Dated mention of Audio Overview at a leader (line 299). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. | device | no transcript code found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created. | not applicable | not applicable | not applicable |

**Models and providers.** None wired. A transcript would come from the same model that writes the overview script [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Not built. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code; the feature does not exist. | no transcript code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Look for a Transcript control on any audio or voice output on Web and Mobile.
  - Expected: No overview transcript exists.
- **Ledger check**
  1. Read ledger rows S50.11 and S50.12.
  - Expected: All cells missing.
- **Future: line to source**
  1. Open a generated transcript.
  2. Tap a cited line.
  - Expected: The source opens at the cited passage.

**Where to look when it fails**

- Not applicable.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Transcript and source links missing.** Affects: All apps. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1639-1640. Work needed: Build after F050-04; store script with provenance.
- **No data model for per-line source provenance.** Affects: Future feature. Evidence: No schema found in searches. Work needed: Design the schema in the data model and contracts packages.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F050-04
- surface:web
- surface:mobile
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-api-and-contracts
- SYS-voice-and-media

## Unknown

- Whether source links would use the existing citation data model.
- Where transcripts would be stored.
- Whether the product will build overviews at all.
