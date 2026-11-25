---
id: "F046-12"
type: "feature"
title: "Items that do not apply"
aliases: ["Not-applicable video items", "Camera motion (S46.10)", "Scene and action text (S46.11)", "Dialogue (S46.12)", "Generated-audio option (S46.13)", "Generation queue (S46.25)", "Save to Project (S46.34)"]
area: "46 Video-generation studio"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.10", "S46.11", "S46.12", "S46.13", "S46.25", "S46.34"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "api:POST /api/media/video/generate", "table:video_generation_jobs", "file:apps/web/app/api/media/video/generate/route.ts", "provider:google", "provider:openrouter", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-12 Items that do not apply

Six brief items for the video-generation studio are marked not applicable on every app: camera-motion, scene text, dialogue, a generated-audio switch, a job queue view and save to Project. This page records what the code does for each, so every brief item has a home. No dedicated control exists for any of them.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.10](../../10-requirements/capabilities/046-video-generation-studio.md#s4610), [S46.11](../../10-requirements/capabilities/046-video-generation-studio.md#s4611), [S46.12](../../10-requirements/capabilities/046-video-generation-studio.md#s4612), [S46.13](../../10-requirements/capabilities/046-video-generation-studio.md#s4613), [S46.25](../../10-requirements/capabilities/046-video-generation-studio.md#s4625), [S46.34](../../10-requirements/capabilities/046-video-generation-studio.md#s4634).

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

**What it does.** Gives a home to brief items the owner marked not applicable: S46.10 camera-motion instructions, S46.11 scene and action instructions, S46.12 dialogue instructions, S46.13 generated-audio option, S46.25 generation queue and S46.34 save to Project (doc: knowledge-base/data/area-briefs/046-video-generation-studio.md).

**Why it exists.** Every brief item must be listed so none is lost, and the reason it does not apply can be checked.

**Who uses it.** Engineers and testers reading the video-studio scope; not an end-user feature.

**Problems it solves**

- Prevents a reader from treating these items as forgotten.
- Shows where the behaviour is covered by the prompt, a flag or another feature.

**Use cases**

- Check why there is no camera-motion control: motion is described in the prompt.
- Check how audio is chosen: the server picks it.
- Check there is no queue screen: jobs run server-side.

## 2. User experience

**Where to find it**

- Scene, action, camera motion and dialogue: typed into the single video prompt box (prompt up to 2000 characters, packages/contracts/cloud-contracts/src/managed-media.ts:195).
- Audio: no control on any app; the server decides (route.ts:1207-1208).
- Queue: no queue screen; progress shows inside the chat message (apps/web/features/chat/components/messages/MediaGenerationPlaceholder.tsx; apps/mobile/src/features/chat/components/VideoGenProgress.tsx).
- Save to Project: no video-specific action found; Library item menu has an add-to-project action gated by accepted attachment types (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1844-1845).

**Before you start**

- Signed-in account on a plan with video generation (route.ts:1102-1115).

**Screens and controls**

- Single prompt box and the model, aspect, quality and length menus (ChatComposerNew.tsx:6561-6857). No camera, dialogue, audio or queue control.

**Journey**

1. Person writes the scene, action, camera motion and dialogue as prose in the prompt.
2. They send; progress appears in the message.
3. The clip appears with play and download.

**What the person sees and gets**

- Progress display and a finished clip; credit estimate shown before sending (VideoCostEstimate.tsx:24-45).

**Settings**

- None for these items.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The prompt carries scene, action, camera and dialogue text as free text [inferred from a single prompt field].
- The server picks audio: request value, else the model's supportsAudio, else true for google (route.ts:1207-1208); audio on a model without support is refused (route.ts:469-471); audio-off on google is refused (route.ts:472-474).
- Server-side concurrency: one admission per user at a time, otherwise 409 video_generation_admission_busy (route.ts:1414-1432). Jobs are durable rows with statuses queued, processing, completed, failed (media-api-service.ts:62-64).

**Incomplete**

- generate_audio is accepted by the shared schema (managed-media.ts:199) but the Web, Desktop, Chrome and Mobile requests were not seen to send it (media-api-service.ts:41-51; cloudApi.ts:610-613; videoGenerationClient.ts:126).

**Present but disconnected or switched off**

- Library 'add to project' is shown only for accepted attachment types (LibraryView.tsx:1844); the accepted list in packages/contracts/types/src/chat.ts:97-159 has no video entry found, so a clip is probably not accepted [inferred].

**Not available**

- Dedicated camera-motion, dialogue and scene controls: all apps.
- User-visible queue or job list for pending videos: not seen in Web or Mobile.
- Save clip to Project: not seen for video.

## 4. Required behaviour

**Established requirements**

- Camera-motion instructions: not applicable anywhere. (source: S46.10)
- Scene/action instructions: not applicable anywhere. (source: S46.11)
- Dialogue instructions: not applicable anywhere. (source: S46.12)
- Generated-audio option: not applicable anywhere. (source: S46.13)
- Generation queue: not applicable anywhere. (source: S46.25)
- Save to Project: not applicable anywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.34)
- Unsupported configurations expose an honest disabled state; progress and cancellation settle transcript and usage consistently. (source: doc: docs/product/experience-contract.md (row W12))

**Acceptance criteria**

1. A prompt containing scene, action, camera and dialogue text is sent unchanged to the model apart from safety checks.
2. A request that asks for audio on a model without audio support is refused with a clear message.
3. A google-provider request with audio off is refused with a clear message.
4. A second request during admission gets the busy message, not a silent failure.
5. Progress is visible while a clip is generating on Web and Mobile.
6. No control labelled camera, dialogue, queue or save to project appears for video, so there is no dead control.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Not applicable here most likely means folded into the prompt or the server, rather than a missing feature, since the brief gives no 'missing' status for these items [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] If a visible audio switch is wanted, send generate_audio from the composer only for models with supportsAudio and hide it for models that always generate audio.
- [proposed] Re-evaluate Save to Project for clips once video is an accepted attachment type.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | prompt and generate_audio fields | `packages/contracts/cloud-contracts/src/managed-media.ts` | Prompt up to 2000 characters (line 195); audio flag (line 199) |
| service | validateProviderVideoRequest | `apps/web/app/api/media/video/generate/route.ts` | Audio and duration checks (lines 446-481) |
| service | Audio resolution | `apps/web/app/api/media/video/generate/route.ts` | Default audio choice (lines 1207-1208) |
| service | acquireVideoGenerationAdmission use | `apps/web/app/api/media/video/generate/route.ts` | One-at-a-time admission and 409 busy response (lines 1414-1432) |
| service | video-generation-jobs | `apps/web/lib/server/video-generation-jobs.ts` | Job rows and statuses (lines 142, 408-440) |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Durable job table |
| service | VideoGenerationRequest | `apps/web/features/media/services/media-api-service.ts` | Web request type; status values (lines 41-64) |
| component | MediaGenerationPlaceholder | `apps/web/features/chat/components/messages/MediaGenerationPlaceholder.tsx` | Web progress placeholder |
| component | VideoGenProgress | `apps/mobile/src/features/chat/components/VideoGenProgress.tsx` | Mobile progress display |
| component | VideoCostEstimate | `apps/web/features/chat/components/Composer/VideoCostEstimate.tsx` | Credit estimate before sending |
| service | credit-estimates | `apps/web/lib/billing/credit-estimates.ts` | Estimate with audio assumption (line 106) |
| component | LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Add-to-project gate by attachment type (lines 1844-1845) |
| config | Accepted attachment types | `packages/contracts/types/src/chat.ts` | isAcceptedAttachmentType (line 148) |
| service | openrouter video submit | `apps/web/lib/services/openrouter-video-provider-service.ts` | Passes prompt and generate_audio to the provider (line 147) |
| service | generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Desktop request with prompt only (line 610) |
| service | startChromeVideo | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome request body is the prompt (line 126) |
| service | startVideoGeneration | `apps/mobile/src/features/video/services/videogen.ts` | Mobile request (line 87) |
| config | Video mode system prompt | `packages/ui/unified-chat/src/stores/chatStore.ts` | Prompt-craft instruction for video mode (line 49) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types scene, action, camera and dialogue as one prompt. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6561-6857 |
| The client sends the request; the server moderates the prompt first. | device and our servers | apps/web/app/api/media/video/generate/route.ts:1141-1165 |
| The server picks the audio setting and validates it against the model. | our servers | route.ts:1207-1231 |
| Admission is acquired so only one set-up runs per user at a time, then durable jobs start. | our servers | route.ts:1414-1432 |
| The provider renders with the prompt and the audio setting. | outside service | apps/web/lib/services/openrouter-video-provider-service.ts:137-150 |
| The client polls status and shows progress and the clip. | device and our servers | apps/mobile/src/features/video/services/videogen.ts:100-103 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Job row with generate_audio and source surface | video_generation_jobs | server-side | unknown |
| Prompt text | job row and chat message | per conversation | user export includes video job fields (apps/web/app/api/user/export/route.ts:1020) |

**Models and providers.** Audio support is per model in the catalog (model-catalog.ts:216). The google provider always generates audio (route.ts:472-474).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required. |
| Permissions | Workspace policy and spend gates (route.ts:925-945). |
| Subscription | Plans in billing capability video_generation (billing-catalog.ts:357); no separate entitlement for audio, queue or project save. |
| Limits and metering | Video seconds allowance (route.ts:1239); estimate assumes the model's audio support (credit-estimates.ts:106). |
| Feature flags | canUseVideoGeneration (route.ts:1011). |
| Model compatibility | supportsAudio per model decides whether audio is allowed (route.ts:469). |
| Provider restrictions | google: audio always on (route.ts:472-474). Runway prompt limit 1000 characters (route.ts:1210). |
| Local mode | No Local video path found; these items in Local mode: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Audio on for a model without support | Validation error | route.ts:469-471 |
| Audio off on google | Validation error | route.ts:472-474 |
| Admission busy | 409 with message to retry in about a minute | route.ts:1430-1445 |
| Prompt blocked by safety | 422 content_policy_violation | route.ts:1141-1165 |
| Queue position or job list | not handled in the code | searched Web and Mobile video UI for a job list; none seen |
| Mobile polling | Polls every 5 seconds and times out after 5 minutes | apps/mobile/src/features/video/services/videogen.ts:50-51 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate.test.ts`: Generate route (not opened)
- `apps/web/__tests__/api/media-video-paywall-contract.test.ts`: Plan gate responses for video
- `apps/web/__tests__/api/ai-act-video-provenance.test.ts`: Video provenance labelling
- `apps/mobile/__tests__/ChatTabVideoDuration.test.tsx`: Mobile video duration handling
- `apps/extension/__tests__/side-panel-media.test.ts`: Chrome side panel media

**Test scenarios**

- **Audio refused on unsupported model**
  1. POST generate_audio true for a model with supportsAudio false
  - Expected: Validation error naming the model.
- **Audio-off on google**
  1. POST generate_audio false on a google model
  - Expected: Validation error.
- **Concurrent starts**
  1. Send two generate requests in quick succession
  - Expected: Second may return 409 video_generation_admission_busy.
- **Progress visible**
  1. Start a clip on Web
  2. watch the message
  - Expected: Progress placeholder until the clip appears.
- **Save clip to Project**
  1. Open Library menu of a video item
  - Expected: Confirm whether add to project is offered; code suggests not.

**Where to look when it fails**

- Error codes: video_generation_admission_busy, invalid_media_idempotency_key, content_policy_violation (route.ts).
- Table video_generation_jobs; media-telemetry diagnostic header.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **generate_audio accepted by the server but no app sends it** Affects: all video apps. Evidence: media-api-service.ts:41-51; videoGenerationClient.ts:126; cloudApi.ts:610. Work needed: Decide whether to expose an audio switch; the brief says not applicable.
- **Brief and project matrix disagree with the code on video presence** Affects: docs accuracy. Evidence: docs/product/surface-feature-matrix.md:67 marks Desktop, Mobile, Chrome absent; code exists in cloudApi.ts:600, videogen.ts:87, videoGenerationClient.ts:109. Work needed: Regenerate the matrix.
- **No visible queue of pending video jobs** Affects: Web, Mobile users with several jobs. Evidence: no job list UI found. Work needed: Only if the owner changes S46.25 from not applicable.
- **Save clip to Project not available** Affects: Library users. Evidence: chat.ts:97-159 has no video type [inferred]. Work needed: Confirm in the app; decide scope.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- api:POST /api/media/video/generate
- table:video_generation_jobs
- file:apps/web/app/api/media/video/generate/route.ts
- provider:google
- provider:openrouter
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage

## Unknown

- Whether Save to Project is blocked for video: inferred from the attachment type list, not run.
- Contents of the video tests listed: not opened.
- Whether Desktop shows a queue anywhere: Tauri UI not read.
