---
id: "F047-02"
type: "feature"
title: "Join clips and extend a scene"
aliases: ["Clip concatenation", "Join clips", "Scene extension", "Extend a scene", "Shot-to-shot continuity", "S47.09", "S47.02", "S47.07"]
area: "47 Video editing and media continuity"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.09", "S47.02", "S47.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "provider:google", "provider:openrouter", "table:video_generation_jobs", "table:media_assets", "api:POST /api/media/video/generate", "F047-04", "F047-01", "SYS-model-catalog-and-routing", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-02 Join clips and extend a scene

Joining would combine several clips into one video; extending would make a new shot that continues from the last frame of an earlier one. Neither exists in any app. The only video code creates one clip from a prompt, with an optional first-frame image on web. Plan limits are undefined.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.09](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4709), [S47.02](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4702), [S47.07](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4707).

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

**What it does.** Intended: play chosen clips in order as one video, and continue a scene with a new shot that starts where the previous one ended. Today nothing does this.

**Why it exists.** Each generated clip is short; the allowed durations come from the model catalog (apps/web/app/api/media/video/generate/route.ts:449-470). Longer stories need several shots. The brief lists join, extend and continuity (S47.09, S47.02, S47.07). Founder decisions say video editing is not built (docs/decisions/2026-09-27-founder-decisions.md:310).

**Who uses it.** Intended: signed-in people on a plan with video (Ultra or Enterprise, packages/contracts/types/src/billing-catalog.ts:357). Nobody can use it today.

**Problems it solves**

- Clips cannot be longer than one generation.
- A second shot does not know what the first looked like unless the person re-describes it.

**Use cases**

- Join three shots into one short film.
- Extend a scene with what happens next.
- Continue a shot from the final picture of the previous one.

## 2. User experience

**Where to find it**

- Web, desktop (Electron shows web), mobile, Chrome: not present (brief S47.09, S47.02, S47.07 missing; searches found no join, extend or last-frame code).
- CLI and VS Code: not applicable per brief.
- Closest existing control on web: First frame in the video composer, an image the clip opens on (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:605).

**Before you start**

- Two or more finished clips for joining; one finished clip for extending.
- Signed in, plan with video.

**Screens and controls**

- None exist for Join or Extend. Brief draft: select clips in a list, Join, reorder, confirm; Extend on a clip with a text box. [proposed]

**Journey**

1. Select two or more clips and choose Join [proposed].
2. Reorder and confirm [proposed].
3. Or choose Extend on a clip and describe what happens next [proposed].
4. Watch progress, then get a new clip with sources untouched [proposed].

**What the person sees and gets**

- Today: none for these actions.
- Intended: progress, a result that plays in the order shown, an error naming the failed step. [proposed]

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Creating one clip with an optional first-frame image works on web (apps/web/app/api/media/video/generate/route.ts:779-872; packages/contracts/cloud-contracts/src/managed-media.ts:209).
- A person could manually take a frame from a clip and use it as the next first frame by attaching it [inferred]; no frame-grab tool exists.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Mobile creation is switched off (apps/mobile/lib/v1FeatureFlags.ts:28).

**Not available**

- Join, reorder, extend: no code on any app (searched for concat, extend, last frame, ffmpeg).
- No field links a new clip to a source clip in the request schema (packages/contracts/cloud-contracts/src/managed-media.ts:193-217) or the job table (apps/web/db/neon/0105_durable_video_generation_jobs.sql:74-130).

## 4. Required behaviour

**Established requirements**

- User joins several clips into one video (S47.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.09)
- User extends a generated scene with a continuation of the same clip (S47.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.02)
- A new shot continues from the previous shot (S47.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.07)
- Video editing is not built. (source: docs/decisions/2026-09-27-founder-decisions.md:310)

**Acceptance criteria**

1. A joined video plays clips in the order shown.
2. An extended shot starts from the last frame of the previous shot.
3. Fewer than two clips cannot be joined, and the control says so.
4. Progress shows while the video is built.
5. A failure leaves source clips untouched and names the failed step.
6. Usage is counted under the plan rules once defined.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Join can be a non-model processing step; extend needs a video model that accepts a starting image or a source clip [inferred; catalog has no field for it].
- Extend by last frame can reuse the existing first-frame input once a frame is extracted [inferred from managed-media.ts:209].

**Proposed improvements** (suggestions, not requirements)

- Add a shared parent reference so joined and extended clips list their sources.
- Add a catalog flag per video model for continuation support, so the app can say when it is unsupported.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Creates one clip; accepts first_frame_image, which an extend flow could reuse. |
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Strict request contract: prompt, duration, resolution, first_frame_image, reference_images; no source clip. |
| service | resolveVideoInputImages | `apps/web/app/api/media/video/generate/route.ts` | Reads, scans and sizes input images before provider calls. |
| service | submitOpenRouterVideo | `apps/web/lib/services/openrouter-video-provider-service.ts` | Sends frame_images or input_references to the provider. |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Durable job rows; no parent job column. |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Finished clip catalog. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Video mode with First frame and Reference image choices. |
| service | video-input-images | `apps/web/features/chat/components/Composer/video-input-images.ts` | Limits and encoding of image inputs for video. |
| hook | useMediaGeneration | `apps/web/lib/hooks/useMediaGeneration.ts` | Starts and watches video jobs on web. |
| service | mobile videogen | `apps/mobile/src/features/video/services/videogen.ts` | Mobile create/poll/cancel; flag off. |
| service | desktop generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Tauri-build creation call; prompt and duration only. |
| service | Chrome videoGenerationClient | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome create and status calls. |
| config | video-provider-release-policy | `apps/web/lib/server/video-provider-release-policy.ts` | Admits only Google and OpenRouter video providers. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Today: person sends a prompt (and optional first-frame image) from the web composer. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3860-3892 |
| Web client posts to the video route with an idempotency key. | device and our servers | apps/web/features/media/services/media-api-service.ts:190-215 |
| Route checks access, scans images, reserves usage, and submits to the provider. | our servers | apps/web/app/api/media/video/generate/route.ts:880-1030,1194-1205 |
| Provider renders one clip; a durable job tracks it and stores the result. | outside service | apps/web/lib/services/openrouter-video-provider-service.ts:119-150 |
| Join or extend: no code. [proposed] Join would assemble stored assets in order on a server or device step; extend would take the last frame of a source and call the creation route. | our servers | [proposed] no code exists |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source and result clips | Object storage with media_assets rows | User-owned library shared by web, desktop, mobile, CLI (apps/web/db/neon/0036_media_assets.sql:1-7) | Soft delete via deleted_at |
| Order list and parent links | Not stored; no field exists | not applicable | not applicable |

**Models and providers.** Existing creation uses Google and OpenRouter routes (apps/web/app/api/media/video/generate/route.ts:598-650). Whether any catalog model supports continuation is unknown; the catalog video block lists durations, output sizes, audio, seed and pricing only (packages/contracts/types/src/model-catalog.ts:213-219).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in and adult-verified for creation (apps/web/app/api/media/video/generate/route.ts:889-896). |
| Permissions | none found in the code for join or extend. |
| Subscription | Video capability: Ultra or Enterprise (packages/contracts/types/src/billing-catalog.ts:357). |
| Limits and metering | Creation counts video seconds per month (apps/web/lib/services/tier-unit-quota-service.ts:57,165). An extend would be a new creation and count the same [inferred]. Join: none found. |
| Feature flags | canUseVideoGeneration (route.ts:1008-1013). None specific. |
| Model compatibility | Unknown for continuation; first-frame input limit comes from the catalog image-input field (packages/contracts/cloud-contracts/src/managed-media.ts:176-187). |
| Provider restrictions | Only Google and OpenRouter take images (managed-media.ts:168-170); Runway is withheld. |
| Local mode | No local video. Mobile refuses video when mode is not cloud (apps/mobile/src/features/chat/actions/resolveMobileVideoGenerationRequest.ts:107). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty state (fewer than two clips) | Not handled in the code; no join UI. | searched apps |
| Waiting | Not handled for join or extend. Creation polls every 5 seconds up to 5 minutes (apps/mobile/src/features/video/services/videogen.ts:42-43). | same |
| Failure | Not handled for join or extend. Creation failures store public_error (0105 migration:114). | apps/web/db/neon/0105_durable_video_generation_jobs.sql:114 |
| Retry | Creation retry on web reuses retained input images or tells the person to attach them again (apps/web/features/chat/lib/videoRetryInputs.ts:12-24). | same |
| Cancel | Creation cancel exists (apps/web/app/api/media/video/cancel/route.ts); none for join. | same |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate-input-images.test.ts`: First-frame and reference images sent to providers, refusal of both together, refusal for models without image input, unreadable or denylisted images, too many images.
- `apps/web/features/chat/lib/videoRetryInputs.test.ts`: Retry input resolution; file name indicates, contents not opened.

**Test scenarios**

- **Join absent today**
  1. Open the Library with two clips.
  2. Select both.
  - Expected: No Join action.
- **Join order (once built)**
  1. Join clip B then A.
  2. Play result.
  - Expected: B plays first, then A.
- **Extend continuity (once built)**
  1. Extend a clip with a prompt.
  2. Compare last frame of source to first frame of new shot.
  - Expected: They match.
- **Single clip join (once built)**
  1. Select one clip.
  - Expected: Join disabled with explanation.
- **Join failure (once built)**
  1. Force a failure on the second clip.
  - Expected: Sources untouched; message names the step.

**Where to look when it fails**

- No join or extend logs exist. For creation: video_generation_jobs.status and public_error; error codes invalid_input_image, content_policy_violation (route.ts).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No join feature** Affects: web, desktop, mobile, Chrome. Evidence: brief S47.09 missing. Work needed: A processing step, ordered selection UI, source links and tests.
- **No extend or last-frame continuation** Affects: all creation apps. Evidence: request schema has first_frame_image only (managed-media.ts:209). Work needed: Catalog flag, frame extraction and UI; confirm provider support.
- **No parent link between clips** Affects: all. Evidence: 0036 and 0105 tables. Work needed: Migration.
- **Plan limits undefined** Affects: all. Evidence: billing-catalog.ts has no editing capability. Work needed: Owner decision.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

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
- table:media_assets
- api:POST /api/media/video/generate
- F047-04
- F047-01
- SYS-model-catalog-and-routing
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether any catalog video model can continue a clip.
- Whether join would run on the device or our servers.
- Whether the owner will build editing.
- Plan rules for join and extend.
- Maximum joined length.
