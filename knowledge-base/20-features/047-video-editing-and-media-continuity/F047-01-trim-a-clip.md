---
id: "F047-01"
type: "feature"
title: "Trim a clip"
aliases: ["Clip trimming", "Trim a clip", "S47.01", "Cut start or end of a generated clip"]
area: "47 Video editing and media continuity"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.01"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "table:video_generation_jobs", "table:media_assets", "api:POST /api/media/video/generate", "F047-02", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-voice-and-media"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-01 Trim a clip

Trimming would let a person cut the start or end off a finished generated video and save the result as a new version. No app has it. No trim control, route, table or library exists. Today a person can only create a clip from a prompt and cannot change its length afterwards. Plan rules are undefined. (brief S47.01)

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.01](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4701).

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

**What it does.** Intended: remove unwanted seconds from the start or end of a generated clip and keep the original. In the code today, nothing does this. The only video code creates a clip from a prompt (apps/web/app/api/media/video/generate/route.ts:880-1030).

**Why it exists.** The brief lists it as an expected capability (doc: knowledge-base/data/area-briefs/047-video-editing-and-media-continuity.md, S47.01). The founder decisions record that video editing is not built because neither leading product documents one (doc: docs/decisions/2026-09-27-founder-decisions.md:310). The owner has not decided to build it [inferred from the same document].

**Who uses it.** Intended: a signed-in person who has generated a clip on a plan that includes video. Today nobody can use it. Video creation needs the Ultra or Enterprise plan (packages/contracts/types/src/billing-catalog.ts:357).

**Problems it solves**

- A generated clip is a fixed length chosen before generation (apps/web/app/api/media/video/generate/route.ts:449-470), so a person who wants a shorter clip must pay for a new generation.
- A person cannot drop a bad first or last second without regenerating.

**Use cases**

- Cut the last two seconds of a clip where the subject drifts.
- Remove a slow start so the clip opens on the action.
- Save a shortened copy while keeping the full clip in the Library.

## 2. User experience

**Where to find it**

- Web: not present. No trim control exists in apps/web (search for trim, ffmpeg and caption terms in apps and packages found no video editing code).
- Desktop (public Electron build shows the hosted web app, so it follows web): not present (doc: AGENTS.md section 5; brief status missing).
- Desktop Tauri build: not present (apps/desktop/src-tauri/src/sys/commands/media.rs:242-252 builds a prompt-only request).
- Mobile: not present. Video creation is switched off in v1 (apps/mobile/lib/v1FeatureFlags.ts:28).
- Chrome extension: not present. Video mode takes words only (apps/extension/src/side_panel.ts:8779-8784).
- CLI and VS Code: not applicable per brief.

**Before you start**

- A completed generated clip.
- Account sign-in and a plan with video generation (billing-catalog.ts:357).
- Unknown: plan rules for editing are not defined anywhere.

**Screens and controls**

- None exist. Brief draft: a timeline with start and end handles, or start and end time fields, a preview, and a save button. [proposed]

**Journey**

1. Open a finished clip [proposed].
2. Drag the start or end handle or type times [proposed].
3. Preview the trimmed result [proposed].
4. Save as a new version, original kept [proposed].

**What the person sees and gets**

- Today: after generation the person sees the clip in the chat or Library with no edit options (apps/web/features/library/components/LibraryView.tsx).
- Intended: progress while the trimmed copy is made, an error naming that the trim did not save, the new version listed. [proposed]

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Creating a clip from a prompt works on web and is the base a trim would extend (apps/web/app/api/media/video/generate/route.ts:880-1030).
- Finished clips are stored as media assets and linked from video jobs (apps/web/db/neon/0036_media_assets.sql:7-24; apps/web/db/neon/0105_durable_video_generation_jobs.sql:74-130).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Mobile video creation is switched off by the video flag, so no clip can exist there to trim (apps/mobile/lib/v1FeatureFlags.ts:28).

**Not available**

- Trimming on web, desktop, mobile and the Chrome extension: no code found (brief S47.01 status missing; repository search for trim and video-processing terms found nothing).
- No video processing library or server step exists: no ffmpeg reference in apps, packages, crates or services (searched).

## 4. Required behaviour

**Established requirements**

- User trims the start or end of a generated clip (S47.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.01)
- Video editing is not built; neither leading product documents one (S104.08). (source: docs/decisions/2026-09-27-founder-decisions.md:310)
- Video is generated in chat and kept in the Library; there is no separate video studio. (source: docs/decisions/2026-09-27-founder-decisions.md:132-133)
- Image and video edit controls (including S47.11) are declined because the leaders edit by prompt. (source: docs/decisions/2026-09-27-founder-decisions.md:139-141)

**Acceptance criteria**

1. The original clip remains playable and unchanged after a trim.
2. The trimmed result appears as a separate item.
3. A clip with no edits shows its full length.
4. A progress state shows while the copy is made.
5. A failed trim keeps the original and says the trim did not save.
6. Trim limits follow the plan rules once defined.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A trim needs a server or device video-processing step that does not exist today [inferred from the absence of video processing code].
- Local mode could do trimming on the device because it needs no model [inferred].

**Proposed improvements** (suggestions, not requirements)

- Decide first whether trimming is wanted, since the founder decision defers editing.
- If built, add a parent link on the saved asset so the original and the trimmed version are related.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Only video-creating route; the closest base for any derived clip. No trim input exists. |
| endpoint | GET /api/media/video/status | `apps/web/app/api/media/video/status/route.ts` | Reports job state and the finished clip address. |
| endpoint | POST /api/media/video/cancel | `apps/web/app/api/media/video/cancel/route.ts` | Stops a running video job. |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Job rows with duration_secs and asset_id; no parent, start or end column. |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Stores the finished clip bytes address; has a metadata json column but no version fields. |
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Strict request shape; accepts no source clip or trim times. |
| service | media-api-service generateVideo and getVideoStatus | `apps/web/features/media/services/media-api-service.ts` | Web client calls for create and status. |
| hook | useMediaGeneration | `apps/web/lib/hooks/useMediaGeneration.ts` | Web hook that starts and watches video jobs. |
| screen | LibraryView | `apps/web/features/library/components/LibraryView.tsx` | Where finished videos are listed; no edit action found. |
| component | ChatComposerNew video mode | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer controls for creating a video; no edit controls. |
| service | mobile videogen | `apps/mobile/src/features/video/services/videogen.ts` | Mobile create, poll and cancel calls; switched off by flag. |
| service | desktop generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Desktop Tauri-build creation call; prompt and duration only. |
| service | Chrome videoGenerationClient | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome extension create and status calls. |
| config | BILLING_PLAN_CAPABILITY_TIERS video_generation | `packages/contracts/types/src/billing-catalog.ts` | Names the plans that include video. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Today the only flow is creation: the person sends a prompt in video mode and the web client posts it to the video route. | device and our servers | apps/web/features/media/services/media-api-service.ts:190-215 |
| The route checks sign-in, age gate, spend limit, subscription, plan and the video capability flag, then validates the request. | our servers | apps/web/app/api/media/video/generate/route.ts:880-1030 |
| The route submits the prompt to the chosen video provider and tracks a durable job. | outside service | apps/web/app/api/media/video/generate/route.ts:598-650; apps/web/lib/services/openrouter-video-provider-service.ts:119-150 |
| The finished clip is stored as a media asset and shown. | our servers | apps/web/db/neon/0105_durable_video_generation_jobs.sql:113 (asset_id) |
| Trim step: no code. [proposed] A server or device step would cut the clip and save a new asset linked to the original. | our servers | [proposed] no code exists |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated clip and its job row | Object storage with media_assets and video_generation_jobs rows | Web, desktop, mobile and CLI read the same user-owned library (apps/web/db/neon/0036_media_assets.sql:1-7) | Media rows carry deleted_at; jobs survive workspace deletion by design (apps/web/lib/server/organization-erasure.ts:158-159) |
| Trim start and end times | Not stored; no field exists | not applicable | not applicable |

**Models and providers.** Creation uses Google or OpenRouter video routes; Runway is withheld (apps/web/lib/server/video-provider-release-policy.ts:16-18). A trim itself needs no model [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Creation needs a signed-in, adult-verified account (apps/web/app/api/media/video/generate/route.ts:889-896). No account rule for trimming exists. |
| Permissions | none found in the code for trimming. |
| Subscription | Creation needs a plan with the video capability: Ultra or Enterprise (packages/contracts/types/src/billing-catalog.ts:357; doc: docs/product/definition.md:293-300). |
| Limits and metering | Creation is metered in video seconds per month (apps/web/lib/services/tier-unit-quota-service.ts:57,165). None found for trimming. |
| Feature flags | canUseVideoGeneration gates creation (apps/web/app/api/media/video/generate/route.ts:1008-1013). None for trimming. |
| Model compatibility | Not applicable to a cut; no catalog field about editing exists (packages/contracts/types/src/model-catalog.ts:213-219). |
| Provider restrictions | none found in the code for trimming. |
| Local mode | No video feature runs locally. Mobile refuses video unless the mode is cloud (apps/mobile/src/features/chat/actions/resolveMobileVideoGenerationRequest.ts:107). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty state | Not handled in the code; no trim UI exists. | searched apps/web, apps/mobile, apps/desktop, apps/extension |
| Waiting state | Not handled for trim. Creation shows progress by polling (apps/mobile/src/features/video/services/videogen.ts:128-166). | apps/mobile/src/features/video/services/videogen.ts:128 |
| Failure | Not handled for trim. A failed creation keeps the job row with public_error. | apps/web/db/neon/0105_durable_video_generation_jobs.sql:114 |
| Offline, cancel and timeout | Handled for creation only: polling timeout of five minutes and a cancel call (apps/mobile/src/features/video/services/videogen.ts:42-43,121-125). | same file |
| Accessibility | Not handled in the code for a timeline. | no timeline exists |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate.test.ts`: Creation route only; file name indicates generation tests; contents not opened.
- `apps/web/db/neon/durable-video-generation-jobs-migration.test.ts`: Job table migration shape (checks generate_audio column at line 31).

**Test scenarios**

- **Confirm trim is absent**
  1. Open a finished clip on web.
  2. Look for a trim control.
  3. Check the Library menu for edit actions.
  - Expected: No trim control exists today.
- **Trim keeps original (once built)**
  1. Trim a 8 second clip to 5 seconds.
  2. Open the Library.
  - Expected: Two items: original at 8 seconds, new version at 5 seconds.
- **Failed trim (once built)**
  1. Force the trim step to fail.
  2. Open the original.
  - Expected: Original plays; message says the trim did not save.
- **Plan limit (once defined)**
  1. Try trimming on a plan without video.
  - Expected: Upgrade message matching the plan rule.

**Where to look when it fails**

- No trim logs exist. For creation: logger.warn 'Video input image could not be resolved' (apps/web/app/api/media/video/generate/route.ts), table video_generation_jobs status and public_error.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No trim feature in any app** Affects: web, desktop, mobile, Chrome. Evidence: brief S47.01 missing on all four; no code found. Work needed: Owner decision first (docs/decisions/2026-09-27-founder-decisions.md:310), then a processing step, a parent link, UI and tests.
- **Plan limits undefined** Affects: all apps. Evidence: billing-catalog.ts lists capabilities with no editing entry. Work needed: Define the capability and plans.
- **No version or parent field** Affects: all apps. Evidence: apps/web/db/neon/0036_media_assets.sql:7-24 and 0105 table have none. Work needed: A migration adding a parent reference.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- table:video_generation_jobs
- table:media_assets
- api:POST /api/media/video/generate
- F047-02
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-voice-and-media

## Unknown

- Whether the owner will build trimming; docs/decisions/2026-09-27-founder-decisions.md:310 says editing is not built.
- Which plans would include editing.
- Whether trimming would run on the device or our servers.
- Whether the Electron desktop shows the same web Library actions; not opened beyond AGENTS.md section 5.
