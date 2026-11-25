---
id: "F047-05"
type: "feature"
title: "Sound and dialogue"
aliases: ["Audio replacement", "Dialogue regeneration", "Generated sound effects", "Sound and dialogue", "S47.10", "S47.12", "S47.11"]
area: "47 Video editing and media continuity"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.10", "S47.12", "S47.11"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "provider:google", "provider:openrouter", "table:video_generation_jobs", "api:POST /api/media/video/generate", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-05 Sound and dialogue

Replacing a clip's audio, or regenerating its dialogue without redoing the picture, does not exist in any app. A clip can be created with or without generated audio, depending on the model. Sound effects (S47.11) were declined by the founder. Plan limits are undefined.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.10](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4710), [S47.12](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4712), [S47.11](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4711).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Intended: swap the audio track for a chosen file, or regenerate spoken lines while keeping the picture. Today audio is only a creation setting decided with the video.

**Why it exists.** Brief items S47.10 and S47.12. Sound effects (S47.11) are marked not applicable, and founder decisions list S47.11 among declined edit controls (docs/decisions/2026-09-27-founder-decisions.md:139-141).

**Who uses it.** Intended: signed-in people on Ultra or Enterprise. Nobody today.

**Problems it solves**

- A person who dislikes the generated voice must regenerate the whole clip.
- A person cannot add their own narration to a clip.

**Use cases**

- Replace the sound with a music track.
- Fix a line of dialogue.
- Add narration to a silent clip.

## 2. User experience

**Where to find it**

- Web, desktop, mobile, Chrome: no audio control. The creation request has a generate_audio field in the contract, but no composer control for it was found (searched generate_audio in apps/web non-test code: used only in server and cost code).
- CLI, VS Code: not applicable per brief.

**Before you start**

- A finished clip; plan with video; a file to use as audio (for replace).

**Screens and controls**

- None exist. Brief draft: Replace audio with a file picker; Regenerate dialogue with an editable line. [proposed]

**Journey**

1. Open a clip [proposed].
2. Choose Replace audio and pick a file, or Regenerate dialogue and edit the line [proposed].
3. Wait, then play a clip whose picture is unchanged [proposed].

**What the person sees and gets**

- Intended: new version, original audio kept on failure. [proposed]
- Today: none.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Creation can request audio: contract field generate_audio, default taken from the model's supportsAudio or true for Google (apps/web/app/api/media/video/generate/route.ts:1207-1209; packages/contracts/cloud-contracts/src/managed-media.ts:198).
- Audio support is advertised per model in availability (managed-media.ts:274 supports_audio).

**Incomplete**

- No composer control for audio found in the web composer search; the field is accepted by the API [inferred from search results].

**Present but disconnected or switched off**

- Mobile video creation flag is off (apps/mobile/lib/v1FeatureFlags.ts:28).

**Not available**

- Audio replacement: no code on any app.
- Dialogue regeneration: no code on any app.
- Generated sound effects: not built, and declined by decision (docs/decisions/2026-09-27-founder-decisions.md:139-141).

## 4. Required behaviour

**Established requirements**

- User replaces the audio track of a clip (S47.10). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.10)
- User regenerates the spoken dialogue of a clip without redoing the picture (S47.12). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.12)
- Generated sound effects: not applicable anywhere (S47.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.11)
- S47.11 is among declined edit controls. (source: docs/decisions/2026-09-27-founder-decisions.md:139-141)

**Acceptance criteria**

1. Replacing audio leaves the picture unchanged frame for frame.
2. Regenerating dialogue leaves the picture unchanged.
3. On failure the original audio is kept.
4. The result is a new version; the original remains.
5. A file that is not audio is refused with a message.
6. Sound effects controls do not appear.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Audio replacement is a muxing step, not a model call [inferred]; no muxing code exists.
- Dialogue regeneration needs a speech model plus a mix; the voice area (SYS-voice-and-media) may supply one [inferred].

**Proposed improvements** (suggestions, not requirements)

- Make replace audio a device step in Local mode so it costs no usage.
- Expose a catalog flag for models that can regenerate dialogue only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ManagedMediaVideoGenerationRequestSchema generate_audio | `packages/contracts/cloud-contracts/src/managed-media.ts` | Creation-time audio switch. |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Applies generate_audio; default from the model. |
| schema | VideoGenerationMetadata supportsAudio | `packages/contracts/types/src/model-catalog.ts` | Per-model audio flag. |
| table | video_generation_jobs generate_audio | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Stores whether the job asked for audio. |
| service | credit-estimates generateAudio | `apps/web/lib/billing/credit-estimates.ts` | Audio affects the estimate (line 106). |
| service | submitOpenRouterVideo generateAudio | `apps/web/lib/services/openrouter-video-provider-service.ts` | Passes generate_audio to the provider. |
| endpoint | GET /api/media/availability | `apps/web/app/api/media/availability/route.ts` | Reports supports_audio per model. |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Finished clip catalog. |
| component | ChatComposerNew video mode | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | No audio control found. |
| service | mobile videogen | `apps/mobile/src/features/video/services/videogen.ts` | Flag-off create path. |
| service | desktop generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Prompt and duration only. |
| service | Chrome videoGenerationClient | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Create and status. |
| test | openrouter-video-provider-service test | `apps/web/lib/services/openrouter-video-provider-service.test.ts` | Provider service test; passes generateAudio true at line 70. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Creation request may carry generate_audio; the server resolves the default from the model. | our servers | apps/web/app/api/media/video/generate/route.ts:1207-1209 |
| Provider returns a clip with or without sound as requested. | outside service | apps/web/lib/services/openrouter-video-provider-service.ts:119-150 |
| Replace audio or regenerate dialogue: no code. [proposed] A mux step on a server or the device would swap the track; a speech model would redo lines. | our servers | [proposed] no code exists |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| generate_audio setting per job | video_generation_jobs | Server only | Job rows survive workspace deletion (organization-erasure.ts:158-159) |
| Replacement audio file or dialogue text | Not stored; no feature | not applicable | not applicable |

**Models and providers.** Audio support is per model in the catalog (model-catalog.ts:213-219). Provider capability to regenerate dialogue is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in and adult-verified (route.ts:889-896). |
| Permissions | Uploading a file would need file access; not built. |
| Subscription | Video: Ultra or Enterprise (billing-catalog.ts:357). |
| Limits and metering | Creation counts video seconds (tier-unit-quota-service.ts:57,165); none for audio edits. |
| Feature flags | canUseVideoGeneration. |
| Model compatibility | supportsAudio per model. |
| Provider restrictions | none found in the code for audio edits. |
| Local mode | No local video or audio editing; mobile requires cloud mode (resolveMobileVideoGenerationRequest.ts:107). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Audio edit failure | Not handled in the code; no feature. | searched |
| Model without audio | Request default is from supportsAudio; nothing tells the person in the composer [inferred from absence of control]. | route.ts:1207-1209 |
| Waiting, cancel, timeout | Creation only. | apps/web/app/api/media/video/cancel/route.ts |
| Accessibility | Not handled; no audio UI. | searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/db/neon/durable-video-generation-jobs-migration.test.ts`: Checks the generate_audio column exists (line 31).
- `apps/web/lib/services/openrouter-video-provider-service.test.ts`: Provider request including generate_audio (lines 70, 78).
- `apps/web/__tests__/api/media-video-generate.test.ts`: Creation route including generate_audio false cases (lines 576-623).

**Test scenarios**

- **Absent today**
  1. Open a clip.
  2. Look for Replace audio.
  - Expected: None.
- **Replace audio keeps picture (once built)**
  1. Replace audio with a file.
  2. Compare frames.
  - Expected: Identical picture, new sound.
- **Non-audio file (once built)**
  1. Pick a text file.
  - Expected: Refused with a message.
- **Failure (once built)**
  1. Force failure.
  - Expected: Original audio kept.

**Where to look when it fails**

- No audio edit logs. Creation: video_generation_jobs.generate_audio, public_error.

**Hands-on test plans**

- none: not built on any app
- No hands-on plan yet for Web: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No audio replacement** Affects: web, desktop, mobile, Chrome. Evidence: brief S47.10 missing. Work needed: Mux step, UI, file intake, parent link.
- **No dialogue regeneration** Affects: all. Evidence: brief S47.12 missing. Work needed: Speech model route, catalog flag, UI.
- **No composer control for generate_audio** Affects: web. Evidence: no non-test use outside server. Work needed: Optional control.
- **Plan limits undefined** Affects: all. Evidence: billing-catalog.ts. Work needed: Owner decision.
- Not built on: Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- provider:google
- provider:openrouter
- table:video_generation_jobs
- api:POST /api/media/video/generate
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing

## Unknown

- Whether any provider can regenerate dialogue on an existing clip.
- Whether replace audio would run on the device.
- Plan rules.
- Why no composer control exists for generate_audio.
