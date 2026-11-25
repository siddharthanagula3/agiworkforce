---
id: "F046-10"
type: "feature"
title: "Storyboard and shots"
aliases: ["Storyboard creation (S46.18)", "Shot cards (S46.19)", "Shot ordering (S46.20)", "Shot duplication (S46.21)", "Shot deletion (S46.22)", "Per-shot duration (S46.23)", "Per-shot references (S46.24)", "Multi-shot video"]
area: "46 Video-generation studio"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.18", "S46.19", "S46.20", "S46.21", "S46.22", "S46.23", "S46.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "api:POST /api/media/video/generate", "api:GET /api/media/video/status", "api:POST /api/media/video/cancel", "table:video_generation_jobs", "file:apps/web/app/api/media/video/generate/route.ts", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-voice-and-media", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-10 Storyboard and shots

Video-generation studio has no storyboard. A person cannot build a multi-shot video from shot cards, reorder, duplicate or delete shots, or set duration and references per shot. Each request makes one clip from one prompt. All seven brief items are missing on Web, Desktop, Mobile and Chrome.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.18](../../10-requirements/capabilities/046-video-generation-studio.md#s4618), [S46.19](../../10-requirements/capabilities/046-video-generation-studio.md#s4619), [S46.20](../../10-requirements/capabilities/046-video-generation-studio.md#s4620), [S46.21](../../10-requirements/capabilities/046-video-generation-studio.md#s4621), [S46.22](../../10-requirements/capabilities/046-video-generation-studio.md#s4622), [S46.23](../../10-requirements/capabilities/046-video-generation-studio.md#s4623), [S46.24](../../10-requirements/capabilities/046-video-generation-studio.md#s4624).

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

**What it does.** Would let a person assemble a longer video from several shots, each an editable card with its own prompt, duration and references, and rearrange them. Not built. Today one request yields one clip (or up to four alternative candidates of the same prompt) (packages/contracts/cloud-contracts/src/managed-media.ts:160, :207).

**Why it exists.** The brief lists seven storyboard items S46.18 to S46.24 (doc: knowledge-base/data/area-briefs/046-video-generation-studio.md). Clips are short (duration limit 2 to 30 seconds, managed-media.ts:47), so longer stories need several shots.

**Who uses it.** People planning a short story, ad or explainer on Web, Desktop, Mobile and Chrome.

**Problems it solves**

- Today: a person must run separate prompts and join clips outside the product.
- If built: plan and generate a sequence in one place.

**Use cases**

- Build a three-shot product teaser (not possible today).
- Duplicate a shot and change its reference (not possible today).
- Reorder shots before generating (not possible today).

## 2. User experience

**Where to find it**

- Not available on Web, Desktop, Mobile or Chrome.
- The closest thing is the video-mode chat instruction that helps 'craft prompts and storyboards' as text (packages/ui/unified-chat/src/stores/chatStore.ts:49).

**Before you start**

- Not applicable. Single-clip video needs a signed-in account on a plan with video generation (route.ts:1102-1115).

**Screens and controls**

- No shot card, add-shot, reorder, duplicate or delete control exists. Video controls on Web are the model, aspect, quality and length menus (ChatComposerNew.tsx:6561-6857).

**Journey**

1. Person writes one prompt in video mode.
2. They pick settings and send.
3. One clip, or the candidates they asked for, comes back.

**What the person sees and gets**

- Single clip with progress display and a download action (MessageBubble.tsx:3396-3470). No storyboard output.

**Settings**

- None. The candidate count n (1 to 4) produces alternatives of one prompt, not shots (managed-media.ts:203-207).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- One-clip generation with durable jobs, one reservation and one settlement per candidate (managed-media.ts:200-207; route.ts:1352-1400).

**Incomplete**

- Candidate generation (n up to 4) makes parallel alternatives, not an ordered sequence (managed-media.ts:203-207).

**Present but disconnected or switched off**

- none found

**Not available**

- Storyboard, shot cards, ordering, duplication, deletion, per-shot duration and per-shot references: Web, Desktop, Mobile, Chrome.
- CLI and VS Code: no video mode.

## 4. Required behaviour

**Established requirements**

- A person builds a storyboard of several shots for one video. (source: S46.18)
- Each shot is an editable card. (source: S46.19)
- A person reorders shots. (source: S46.20)
- A person duplicates a shot. (source: S46.21)
- A person deletes a shot. (source: S46.22)
- A person sets a duration per shot. (source: S46.23)
- A person attaches references per shot. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.24)
- Deleting is a user-initiated action that asks first and names what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A person can add, edit, duplicate, delete and reorder shot cards before generating.
2. Each shot has its own prompt, duration chosen from the model's allowed durations, and references limited by the model's image limit.
3. A cost estimate covers the total of all shots before sending.
4. Generating a storyboard creates one job per shot with its own reservation, and the results are shown in order.
5. A failed shot can be retried alone without paying again for finished shots.
6. Deleting a shot with content asks first and can be undone or names what is lost.
7. The same flow works on Web, Desktop and Mobile, or shows an honest disabled state.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A per-shot design fits the existing durable job model, which already creates one job per candidate with its own idempotency key (route.ts:1140-1160) [inferred].
- Joining shots into one file would need a new server step; no join step exists in the code read [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Create storyboard as a parent record with ordered child jobs, so retry, cancel and refund stay per shot.
- [proposed] Reuse the library to hold finished shots and provide an in-product sequence playback first, before building a join step.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | One prompt and one duration per request (lines 1194-1295) |
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | No shots array (lines 193-217) |
| service | submitVideoCandidates | `apps/web/app/api/media/video/generate/route.ts` | Creates one durable job per candidate (line 1352) |
| service | createVideoGenerationJob | `apps/web/lib/server/video-generation-jobs.ts` | Inserts a job row; no parent or order column seen in lines 142 and 408-440 |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Job table migration |
| service | video-job-reconciliation-service | `apps/web/lib/services/video-job-reconciliation-service.ts` | Settles and cancels jobs |
| endpoint | GET /api/media/video/status | `apps/web/app/api/media/video/status` | Status polling for one task |
| endpoint | POST /api/media/video/cancel | `apps/web/app/api/media/video/cancel` | Cancels one task |
| hook | useMediaGeneration | `apps/web/lib/hooks/useMediaGeneration.ts` | Web start and poll for one video |
| component | ChatComposerNew video mode | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Single-prompt video composer (lines 1414-1443, 6561-6857) |
| component | MessageBubble video output | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Shows one finished clip (lines 3396-3470) |
| component | MediaGenerationPlaceholder | `apps/web/features/chat/components/messages/MediaGenerationPlaceholder.tsx` | Progress placeholder for one video |
| service | runVideoGenerationTurn | `apps/mobile/src/features/chat/actions/runVideoGenerationTurn.ts` | Mobile single-turn video flow (line 90) |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile 'Create video' options for one clip |
| service | CloudRuntime.sendManagedVideoTurn | `apps/desktop/src/runtime/CloudRuntime.ts` | Desktop single video turn (line 579) |
| service | startChromeVideo | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome single video start (line 109) |
| config | Video mode system prompt | `packages/ui/unified-chat/src/stores/chatStore.ts` | Mentions storyboards as text help (line 49) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person writes one prompt and settings in video mode. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1414-1443 |
| Client posts one request with an Idempotency-Key that identifies one video operation. | device and our servers | apps/web/app/api/media/video/generate/route.ts:1052-1075 |
| Server checks plan, allowance, storage and admission, reserves credit per candidate and starts durable workflow jobs. | our servers | route.ts:1194-1295, :1352-1400 |
| Provider renders; the status route and reconciler settle and store the video. | outside service | apps/web/lib/services/video-job-reconciliation-service.ts:475 |
| Client polls status and shows the clip. | device and our servers | apps/mobile/src/features/video/services/videogen.ts:50-51, :87 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| One job row per candidate | video_generation_jobs | server-side; clients poll | unknown |
| Finished video file | video storage checked by isVideoStorageConfigured (route.ts:1252) | served by URL | purge cron exists (apps/web/app/api/cron/purge-deleted-media) |

**Models and providers.** Duration and size limits come per model from the catalog (route.ts:446-481). A per-shot design would validate each shot the same way [inferred]. Providers: runway, google, openrouter.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for Cloud video. |
| Permissions | Workspace policy, model policy and spend limits apply per request (route.ts:925-945). |
| Subscription | Plans from billing capability video_generation (billing-catalog.ts:357). Per-shot entitlement: none found. |
| Limits and metering | Allowance counted in video_seconds as duration times candidate count (route.ts:1239-1246). One admission at a time per user: a second request while one is being set up gets 409 video_generation_admission_busy (route.ts:1430-1445). |
| Feature flags | canUseVideoGeneration (route.ts:1011). |
| Model compatibility | Duration list per model in catalog (model-catalog.ts:213-215). |
| Provider restrictions | Runway prompt max 1000 characters (route.ts:1210). |
| Local mode | No Local video path found. Storyboard in Local mode: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Second request while one is being admitted | 409 video_generation_admission_busy asking to try in about a minute | route.ts:1430-1445 |
| Idempotency key too long for several candidates | 400 invalid_media_idempotency_key | route.ts:1068-1080 |
| Cancel | Cancel route and reconciliation exist for one task | apps/web/lib/services/video-job-reconciliation-service.ts:475; apps/mobile/src/features/video/services/videogen.ts:107 |
| Shot-level loading, empty, retry, reorder | not handled in the code; no shots exist | searched apps and packages for storyboard and shot names; only the system prompt text at chatStore.ts:49 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate.test.ts`: Generate route (not opened)
- `apps/web/__tests__/api/media-video-cancel.test.ts`: Cancel route
- `apps/web/__tests__/api/media-video-status.test.ts`: Status route
- `apps/web/lib/services/video-job-reconciliation-service.test.ts`: Job settlement and reconciliation
- `apps/mobile/__tests__/video-generation-cancel.test.ts`: Mobile cancel

**Test scenarios**

- **No storyboard UI**
  1. Open video mode on Web, Mobile, Desktop, Chrome
  - Expected: Only a single prompt composer.
- **Candidates are not shots**
  1. Send with n=3
  - Expected: Three independent jobs for the same prompt.
- **Unknown field shots**
  1. POST with a shots array
  - Expected: Validation error from strict schema.
- **Concurrent request**
  1. Send two generate requests immediately
  - Expected: Second may get 409 admission busy.

**Where to look when it fails**

- Admission failures: log 'Video generation admission could not be acquired' (route.ts:1434).
- Job state in table video_generation_jobs; reconciler logs in video-job-reconciliation-service.ts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No storyboard, shot cards, reorder, duplicate, delete, per-shot duration or references** Affects: Web, Desktop, Mobile, Chrome. Evidence: managed-media.ts:193-217; route.ts:1194-1295. Work needed: New request shape, parent-child job model, migration, UI per app, cost and cancel logic, tests.
- **No way to join shots into one file** Affects: any future storyboard. Evidence: no join step found. Work needed: Server or on-device step to concatenate clips, or in-product sequence playback.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- api:POST /api/media/video/generate
- api:GET /api/media/video/status
- api:POST /api/media/video/cancel
- table:video_generation_jobs
- file:apps/web/app/api/media/video/generate/route.ts
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-voice-and-media
- SYS-files-artifacts-and-storage

## Unknown

- Whether providers support multi-shot input: not checked.
- Whether a concatenation tool exists elsewhere in the repo: not searched beyond video paths.
- Contents of the generate test: not opened.
