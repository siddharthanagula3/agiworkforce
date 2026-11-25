---
id: "F047-06"
type: "feature"
title: "Captions"
aliases: ["Caption generation", "Caption editing", "Subtitles", "S47.13", "S47.14"]
area: "47 Video editing and media continuity"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.13", "S47.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "table:media_assets", "api:GET /api/media/video/status", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "F047-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-06 Captions

Making captions for a clip from its speech, and editing the lines afterwards, does not exist in any app. No caption, subtitle, speech-to-text-for-video or caption-file code was found. Plan limits are undefined. The founder also declined subtitle files for voice dictation.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.13](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4713), [S47.14](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4714).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Intended: generate captions from a clip's speech, let the person fix lines, and save them as text with the clip. Today nothing does this for video.

**Why it exists.** Brief items S47.13 and S47.14. Captions help people who cannot hear the clip and people who watch muted.

**Who uses it.** Intended: signed-in people on Ultra or Enterprise who made a clip. Nobody today.

**Problems it solves**

- Generated clips with speech have no text version.
- A person cannot correct a mis-heard word.

**Use cases**

- Add captions to a spoken clip.
- Fix a misspelled name in a caption line.
- Keep captions as text for later reuse.

## 2. User experience

**Where to find it**

- Web, desktop, mobile, Chrome: no caption control (searches for caption, subtitle, srt, webvtt found only unrelated interface text such as caption font sizes in mobile).
- CLI, VS Code: not applicable per brief.

**Before you start**

- A clip with speech; plan with video.

**Screens and controls**

- None exist. Brief draft: Generate captions button and an editable list of lines with Save. [proposed]

**Journey**

1. Open a clip [proposed].
2. Choose Generate captions [proposed].
3. Edit lines and save [proposed].

**What the person sees and gets**

- Intended: caption lines saved as text with the clip; on failure the clip still plays with no captions and the person is told. [proposed]
- Today: none.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- None for captions.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Mobile video creation flag is off (apps/mobile/lib/v1FeatureFlags.ts:28).

**Not available**

- Caption generation and editing on every app: no code (searched; only unrelated typography tokens matched, e.g. apps/mobile/src/ui/theme/tokens.ts).
- No caption storage: media_assets has a metadata json column only (apps/web/db/neon/0036_media_assets.sql:19).

## 4. Required behaviour

**Established requirements**

- User generates captions or subtitles for a clip (S47.13). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.13)
- User edits the captions of a clip (S47.14). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.14)
- Voice dictation has no saved reference sets or subtitle files, as in the leaders (related, voice only). (source: docs/decisions/2026-09-27-founder-decisions.md:126-129)

**Acceptance criteria**

1. Captions are made from the clip's speech.
2. Each line can be edited and saved.
3. Edits are stored as text with the clip, not burned into the picture unless asked.
4. If caption generation fails the clip still plays and the person is told.
5. A clip without speech reports that no speech was found.
6. Plan limits apply once defined.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Captions need a speech-to-text step on the clip's audio; the transcription capability is in the voice area [inferred from SYS-voice-and-media].

**Proposed improvements** (suggestions, not requirements)

- Store captions as a text track tied to the asset id.
- Export a caption file only if the owner reverses the subtitle-file decision.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Clip catalog with a metadata json column; no caption fields. |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Job rows; no caption fields. |
| endpoint | GET /api/media/video/status | `apps/web/app/api/media/video/status/route.ts` | Returns video_url and thumbnail; no captions. |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Creation only. |
| screen | LibraryView | `apps/web/features/library/components/LibraryView.tsx` | Where clips are listed; no caption action. |
| component | MessageBubble video rendering | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Shows generated video in chat; no caption track found. |
| service | mobile generatedVideoFromStatus | `apps/mobile/src/features/video/services/videogen.ts` | Maps status to video and thumbnail only. |
| service | desktop generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Returns a durable file address only. |
| service | Chrome videoGenerationClient | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Reads task id, status, video_url, progress, error. |
| hook | web useMediaGeneration | `apps/web/lib/hooks/useMediaGeneration.ts` | Video watch hook. |
| service | media-api-service | `apps/web/features/media/services/media-api-service.ts` | VideoStatusResponse has video_url and thumbnail_url only (lines 62-70). |
| component | Composer dictation | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Dictation exists for text input; not video captions. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Today: a finished clip is stored and shown with its address; no caption step. | our servers | apps/web/app/api/media/video/status/route.ts |
| Caption generation: no code. [proposed] A speech-to-text step on the clip audio, on a server, producing timed lines. | our servers | [proposed] no code exists |
| Caption editing: no code. [proposed] Edited lines saved as text beside the asset. | device and our servers | [proposed] no code exists |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Caption lines | Not stored; no field | not applicable | not applicable |
| Clip | Object storage and media_assets | User library | Soft delete |

**Models and providers.** No caption model route exists. Which speech model would be used is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in (creation requires adult verification, route.ts:889-896). No caption rule. |
| Permissions | none found in the code. |
| Subscription | Video: Ultra or Enterprise (billing-catalog.ts:357); no caption entitlement. |
| Limits and metering | none found in the code for captions. |
| Feature flags | none found in the code for captions. |
| Model compatibility | unknown. |
| Provider restrictions | none found in the code. |
| Local mode | No local video; no local caption path found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No speech | Not handled; no feature. | searched |
| Failure | Not handled for captions. | searched |
| Offline, cancel, timeout | Not handled for captions. | searched |
| Accessibility | Not handled: generated videos have no caption track in the status payload (media-api-service.ts:62-70). | apps/web/features/media/services/media-api-service.ts:62-70 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-status.test.ts`: Video status route; contents not opened.

**Test scenarios**

- **Absent today**
  1. Open a finished clip.
  2. Look for Generate captions.
  - Expected: None.
- **Generate captions (once built)**
  1. Choose Generate captions on a clip with speech.
  - Expected: List of timed lines.
- **Edit and save (once built)**
  1. Edit a line; save; reopen.
  - Expected: Edit remains; picture has no burned-in text.
- **Failure (once built)**
  1. Force failure.
  - Expected: Clip plays; person told.

**Where to look when it fails**

- No caption logs. Look at video_generation_jobs and media_assets for the clip.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No caption generation** Affects: web, desktop, mobile, Chrome. Evidence: brief S47.13 missing; no code. Work needed: Speech-to-text step, storage, UI.
- **No caption editing** Affects: all. Evidence: brief S47.14 missing. Work needed: Editor list, save, versioning.
- **No caption storage** Affects: all. Evidence: 0036 media_assets columns. Work needed: Schema or metadata convention.
- **Plan limits undefined** Affects: all. Evidence: billing-catalog.ts. Work needed: Owner decision.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- table:media_assets
- api:GET /api/media/video/status
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- F047-05

## Unknown

- Which speech model would produce captions.
- Whether captions would be device or server work.
- Plan rules.
- Whether the subtitle-file decision (voice) applies to video.
- Contents of media-video-status.test.ts; not opened.
