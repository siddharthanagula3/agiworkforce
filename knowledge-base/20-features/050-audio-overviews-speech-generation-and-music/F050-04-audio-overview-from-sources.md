---
id: "F050-04"
type: "feature"
title: "Audio overview from sources"
aliases: ["Audio overview", "Audio Overviews", "Source-to-audio overview", "Podcast-style overview", "Single-narrator overview", "Multi-host overview", "Regenerate overview", "S50.05", "S50.06", "S50.07", "S50.08", "S50.09", "S50.10", "S50.13"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.05", "S50.06", "S50.07", "S50.08", "S50.09", "S50.10", "S50.13"]
depends_on: ["surface:web", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-model-catalog-and-routing", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "F050-01", "F050-05", "F050-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-04 Audio overview from sources

A planned feature that turns chosen sources into a spoken overview with one narrator or two hosts, brief or detailed, shaped by instructions, and regenerable. No code exists on any app. Only the plain read-aloud speech route and its usage metering exist as nearby building blocks.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.05](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5005), [S50.06](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5006), [S50.07](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5007), [S50.08](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5008), [S50.09](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5009), [S50.10](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5010), [S50.13](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5013).

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

**What it does.** Would let a person choose sources, pick one narrator or a multi-host talk, pick brief or detailed length, add instructions, and get audio, then regenerate it. Nothing of this is built. (S50.05-S50.10, S50.13 Should, brief)

**Why it exists.** Leading products offer audio summaries of a person's material (for example a research report that can become an Audio Overview). (doc: docs/research/competitor-surfaces-2026-10-24.md:299)

**Who uses it.** Students and researchers with many documents; people who prefer to listen to a digest [inferred].

**Problems it solves**

- Absorbing long source material while away from a screen.
- Getting a quick listen to a set of documents.

**Use cases**

- Turn three uploaded papers into a five-minute spoken brief.
- Create a two-host conversation about a project's notes.
- Regenerate with a new instruction such as 'focus on risks'.

## 2. User experience

**Where to find it**

- Not built on Web, Desktop, Mobile, CLI, VS Code or Chrome. No control, screen or route exists (search of apps, packages and services for overview, podcast, narrator and multi-host terms found only unrelated matches: apps/web/lib/connectors/directory/categorize.ts, packages/contracts/context/src/memory-content-policy.ts and report-triage tests).

**Before you start**

- not applicable

**Screens and controls**

- none exist. Required by the brief: source selection, single or multi-host choice, brief or detailed choice, instruction field, regenerate.

**Journey**

1. Not applicable today. [proposed] Select sources, choose style, add instructions, generate, listen, regenerate.

**What the person sees and gets**

- none exist.

**Settings**

- none exist.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature. Adjacent only: single-voice speech of a text via POST /api/voice/speech could play a generated script (apps/web/app/api/voice/speech/route.ts:48-247). That route limits one request to 4,000 characters (route.ts:48).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Source selection, script generation, narrator or host choice, length choice, instruction field, regenerate: not available on Web, Desktop, Mobile, CLI, VS Code, Chrome (ledger rows S50.05-S50.13 all missing: audit/ledger/ecosystem-capability-ledger.jsonl:1633-1641).
- No API endpoint for it.

## 4. Required behaviour

**Established requirements**

- The user turns chosen sources into a spoken audio overview. (source: S50.05 Should (brief))
- An overview can be generated with a single narrator. (source: S50.06 Should (brief))
- An overview can be generated as a multi-host conversation. (source: S50.07 Should (brief))
- The user chooses brief or detailed length. (source: S50.08 Should (brief))
- The user selects which sources the overview covers. (source: S50.09 Should (brief))
- The user gives instructions that shape the overview. (source: S50.10 Should (brief))
- The user can regenerate an overview. (source: S50.13 Should (brief))
- Audio workflows must be evaluated for speech, music, supported languages, timing, file formats and usage restrictions against the leaders. (source: doc: docs/product/competitive-guidance.md:416)

**Acceptance criteria**

1. A person can select at least two sources and start an overview.
2. Single narrator and multi-host options both produce audio with the chosen number of voices.
3. Brief and detailed produce clearly different lengths.
4. Instructions typed by the person change the content of the overview.
5. Regenerate produces a new overview and keeps or replaces the old one as the product decides.
6. The overview respects Local, own-key and Cloud boundaries and usage metering.
7. Failure shows a retryable error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Needs a script-writing model step and a speech step; the speech step can reuse the existing managed speech path but its 4,000 character cap would need chunking [inferred from route.ts:48].
- A Local-mode overview would need a local language model and local speech voices [inferred from the Local rule].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build on the sources of the notebook and research workspaces (areas 035 and 037 of the knowledge base briefs).
- [proposed] Meter each overview as a managed call with a reservation, as the speech route does.
- [proposed] Offer multi-host only where two clearly different voices exist.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | area brief 050 | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | Lists items S50.05-S50.14 as missing on every app. |
| other | ecosystem ledger | `audit/ledger/ecosystem-capability-ledger.jsonl` | Rows 1633-1642 record every cell missing. |
| endpoint | POST /api/voice/speech (adjacent, not an overview) | `apps/web/app/api/voice/speech/route.ts` | Reusable single-voice speech with metering. |
| service | managed usage reservation (adjacent) | `apps/web/lib/services/managed-usage-request-service.ts` | Metering pattern an overview call would reuse. |
| service | managed compute access (adjacent) | `apps/web/lib/services/managed-compute-access.ts` | Plan and workspace gate pattern. |
| config | voice_speech slot (adjacent) | `packages/ai/model-registry/catalog/routing-policies.json` | Speech model slot; no overview slot exists. |
| config | speech voices (adjacent) | `apps/web/lib/voice/speech-voices.ts` | Voices available for a narrator. |
| hook | useTTS (adjacent) | `apps/web/lib/hooks/useTTS.ts` | Playback client for generated speech. |
| service | mobile serverSpeech (adjacent) | `apps/mobile/src/features/voice/services/serverSpeech.ts` | Mobile playback of server speech. |
| other | research source note | `docs/research/competitor-surfaces-2026-10-24.md` | Dated record that a leader turns a research report into an Audio Overview (line 299). |
| other | notebook area brief | `knowledge-base/data/area-briefs/037-notebook-and-knowledge-workspace-product.md` | Likely source of 'chosen sources' (content not opened: unknown). |
| other | research workspace brief | `knowledge-base/data/area-briefs/035-research-workspace.md` | Likely source of reports (content not opened: unknown). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. Nothing is called when a person asks for an overview because there is no control. | device | Search found no overview code (see where_to_find_it). |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created. | not applicable | not applicable | not applicable |

**Models and providers.** No model or provider is wired. A required design choice is open: which model writes the script and which voices speak it. [proposed] Go through the model catalog slot system (doc: AGENTS.md section 4) rather than a named model.

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
| Local mode | Not built. Local behaviour is undefined. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, empty, error, cancel, offline) | not handled in the code; the feature does not exist. | no overview code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence on Web**
  1. Open a project or chat with sources.
  2. Look for any overview or audio summary control.
  - Expected: No such control exists.
- **Confirm absence on Mobile**
  1. Open a chat with attached files; open the action sheets.
  - Expected: No audio overview action exists.
- **Repository search**
  1. Search apps, packages and services for audio overview, podcast, narrator, multi-host.
  - Expected: Only unrelated matches.

**Where to look when it fails**

- Not applicable; ledger rows 1633-1641 record the missing status.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Whole feature missing: sources, narrator or hosts, length, instructions, regenerate.** Affects: Web, Desktop, Mobile, CLI, VS Code, Chrome, API. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1633-1641. Work needed: Product decision to build; design script generation, speech, metering and Local behaviour.
- **No speech route for long text: one request is capped at 4,000 characters.** Affects: A future overview. Evidence: apps/web/app/api/voice/speech/route.ts:48. Work needed: Chunking is already done in clients; a server pipeline would need its own.
- **No decision record says whether the feature will be built.** Affects: Planning. Evidence: search of docs/decisions found no S50.05-S50.14 entry. Work needed: Record a decision.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-model-catalog-and-routing
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- F050-01
- F050-05
- F050-06

## Unknown

- Whether any notebook or research feature already produces a source list that an overview could use.
- Whether the product will build this and on which apps.
- Which model would write the script.
- Whether multi-voice speech is available in the chosen provider path.
