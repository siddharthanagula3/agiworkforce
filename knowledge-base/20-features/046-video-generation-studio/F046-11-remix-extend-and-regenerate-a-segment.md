---
id: "F046-11"
type: "feature"
title: "Remix, extend and regenerate a segment"
aliases: ["Remix (S46.35)", "Extend (S46.36)", "Regenerate a selected segment (S46.37)", "Continue a clip", "Video remix"]
area: "46 Video-generation studio"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.35", "S46.36", "S46.37"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "api:POST /api/media/video/generate", "table:video_generation_jobs", "file:packages/ui/unified-chat/src/components/library/LibraryView.tsx", "file:apps/web/features/library/lib/library-chat-handoff.ts", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-voice-and-media", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-11 Remix, extend and regenerate a segment

Video-generation studio cannot remix a finished clip, extend it, or regenerate one segment on any app. A finished clip offers play, download and (on Mobile) share. Remix exists only for saved images in the library, on Web and Mobile, and does not apply to video.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.35](../../10-requirements/capabilities/046-video-generation-studio.md#s4635), [S46.36](../../10-requirements/capabilities/046-video-generation-studio.md#s4636), [S46.37](../../10-requirements/capabilities/046-video-generation-studio.md#s4637).

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

**What it does.** Would let a person start a new generation from a finished clip (remix), add more seconds to it (extend), or redo only a chosen part (regenerate a segment). Not built for video.

**Why it exists.** Brief items S46.35, S46.36 and S46.37 (doc: knowledge-base/data/area-briefs/046-video-generation-studio.md). Competitor guidance names continuation and editing in video workflows (doc: docs/product/competitive-guidance.md section 5.17 item 132).

**Who uses it.** People iterating on a clip on Web, Desktop, Mobile and Chrome.

**Problems it solves**

- Today: to change a clip a person must write a new prompt and generate from scratch.
- If built: keep what works in a clip and change only the rest.

**Use cases**

- Extend a 6-second clip by 4 seconds (not possible today).
- Remix a clip with a changed prompt (not possible today).
- Redo seconds 3 to 5 only (not possible today).

## 2. User experience

**Where to find it**

- Web finished clip: a video player with a 'Download video' button; error state offers 'Retry' and a download link (apps/web/features/chat/components/messages/MessageBubble.tsx:3396-3470).
- Web Library: item menu has 'Remix' only for images (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833).
- Mobile Library: action menu has 'Remix' only for image assets (apps/mobile/src/features/library/index.tsx:629-631); 'Add to chat' is hidden for video (line 626).
- Mobile clip: play, download and share (apps/mobile/src/features/chat/components/GeneratedVideo.tsx).

**Before you start**

- A finished clip in the chat or library; signed-in account on a plan with video generation.

**Screens and controls**

- No remix, extend or segment control exists for video on any app. Retry on a failed job exists (S46.29) and re-sends the same settings; it is not a remix.

**Journey**

1. Person generates a clip.
2. They watch it and may download it.
3. To change it they must start a new video prompt by hand.

**What the person sees and gets**

- 'Your video is ready.' with the player (MessageBubble.tsx:3438 area); on failure 'Video failed to load' with Retry and 'Download video'.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Image remix: Web library stages an image and its prompt into the image composer (apps/web/features/library/lib/library-chat-handoff.ts:75-92) and refuses non-images ('Only an image can be remixed.'). Mobile does the same for images (library/index.tsx:545-560).

**Incomplete**

- Library 'Add to chat' excludes videos on Mobile (library/index.tsx:625).

**Present but disconnected or switched off**

- LibraryView only renders Remix when the item is an image (LibraryView.tsx:1833).

**Not available**

- Video remix, extend and segment regeneration: Web, Desktop, Mobile, Chrome.
- Link from a finished clip to a new job: none found; the request has no source-video field (managed-media.ts:193-217).

## 4. Required behaviour

**Established requirements**

- A person remixes a finished clip into a new generation. (source: S46.35)
- A person extends a finished clip with more seconds. (source: S46.36)
- A person regenerates only a selected segment where supported. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.37)
- Media management should keep version relationships and provenance. (source: doc: docs/product/competitive-guidance.md section 5.17 item 134)

**Acceptance criteria**

1. A finished clip offers a Remix action that opens video mode with the original prompt and settings.
2. Extend offers only the extra durations the model supports and shows a cost estimate first.
3. Segment regeneration is offered only on models that declare support, otherwise it is hidden or disabled with a reason.
4. The new clip records which clip it came from.
5. Remix and extend work from both chat and library on Web and Mobile.
6. Failure or cancel leaves the original clip untouched.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Extend and segment regeneration need video input, and the request has no video-input field (S46.03 is also missing); this is a dependency [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with Remix from the library for video, reusing the image remix hand-off (library-chat-handoff.ts) to fill the video composer with the prompt and model.
- [proposed] Record a source-clip id on the job row for provenance.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble video output | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Finished clip: player, download, retry (lines 3396-3470) |
| component | GeneratedVideo | `apps/mobile/src/features/chat/components/GeneratedVideo.tsx` | Mobile clip card with play, download, share |
| component | VideoPlayerModal | `apps/mobile/src/features/chat/components/VideoPlayerModal.tsx` | Mobile fullscreen player |
| component | LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared library; Remix shown for images only (line 1833) |
| service | stageLibraryItemForImageRemix | `apps/web/features/library/lib/library-chat-handoff.ts` | Image-only remix hand-off (lines 75-92) |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Wires remixItem to the image hand-off (line 230) |
| component | Mobile library screen | `apps/mobile/src/features/library/index.tsx` | handleRemix for images (line 545); menu rules (lines 625-631) |
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | No source clip or segment fields (lines 193-217) |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Always creates new jobs from a prompt (line 1194+) |
| service | resolveVideoRetryInputs | `apps/web/features/chat/lib/videoRetryInputs.ts` | Retry of a failed video with the same inputs |
| service | video-job-reconciliation-service | `apps/web/lib/services/video-job-reconciliation-service.ts` | Settlement and cancel; no lineage |
| table | video_generation_jobs | `apps/web/lib/server/video-generation-jobs.ts` | Job row without a source-clip column (line 142) |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Library listing feeding the clip gallery |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Serves clip bytes for playback and download |
| service | cloudApi generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Desktop new-video request only |
| service | startChromeVideo | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome new-video request only |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person views a finished clip and can only play or download it. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:3438-3470 |
| Image remix (not video): library reads the image file, sets the image composer toggles and the original prompt. | device | apps/web/features/library/lib/library-chat-handoff.ts:75-92 |
| Any new video is a fresh POST with a prompt and no link to the earlier clip. | device and our servers | managed-media.ts:193-217; route.ts:1194-1295 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Clip file | video storage; served via /api/files/[id] | URL access across devices on the same account | purge cron exists (apps/web/app/api/cron/purge-deleted-media); details unknown |

**Models and providers.** Extend or segment regeneration would depend on the provider offering a continuation or edit operation; this was not checked, so unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Library items belong to the owner; Mobile Add-to-chat and Remix only appear in cloud mode (library/index.tsx:625-630). |
| Subscription | Video generation plans (billing-catalog.ts:357). No separate remix or extend entitlement exists. |
| Limits and metering | A remix would be a new generation billed in video_seconds like any other (route.ts:1239) [inferred]. |
| Feature flags | canUseVideoGeneration (route.ts:1011). |
| Model compatibility | Segment regeneration 'where supported' needs a catalog capability that does not exist (model-catalog.ts:213-219). |
| Provider restrictions | Unknown. |
| Local mode | No Local video. In Mobile Local mode the Remix and Add to chat actions are hidden because they require cloud mode (library/index.tsx:625-630). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Remix on a non-image | Throws 'Only an image can be remixed.' | apps/web/features/library/lib/library-chat-handoff.ts:76-78 |
| Mobile remix with no image model | Alert 'Image generation is unavailable' | apps/mobile/src/features/library/index.tsx:548-551 |
| Video fails to load | 'Video failed to load' with Retry up to a maximum and a download link | MessageBubble.tsx:3402-3427 |
| Extend, segment retry, cancel of a continuation | not handled in the code; features absent | searched apps and packages |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Remix of a saved image (line 971)
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web library Remix menu item (line 537)
- `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts`: Image remix hand-off

**Test scenarios**

- **Clip actions**
  1. Generate a clip on Web
  2. Inspect controls on the clip
  - Expected: Play and Download only.
- **Library menu for video**
  1. Open Library
  2. Open the menu of a video item
  - Expected: No Remix item.
- **Mobile library menu**
  1. Open Mobile Library in cloud mode
  2. open menu on a video
  - Expected: No Add to chat and no Remix.
- **Image remix control case**
  1. Open menu of an image
  2. Choose Remix
  - Expected: Image composer opens with prompt.

**Where to look when it fails**

- Library handoff errors surface through runHostAction (LibraryView.tsx:698-703).
- Job state in video_generation_jobs.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No video remix** Affects: Web, Desktop, Mobile, Chrome. Evidence: LibraryView.tsx:1833; library/index.tsx:629. Work needed: Extend hand-off to video, fill video composer, add UI.
- **No extend** Affects: all video apps. Evidence: no source-video field in schema. Work needed: Provider capability check, request fields, catalog flag, UI, billing.
- **No segment regeneration** Affects: all video apps. Evidence: same. Work needed: Segment selector UI, provider support, new job type.
- **No clip lineage** Affects: provenance. Evidence: video-generation-jobs.ts:142 has no source column. Work needed: Additive migration for a source id.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- api:POST /api/media/video/generate
- table:video_generation_jobs
- file:packages/ui/unified-chat/src/components/library/LibraryView.tsx
- file:apps/web/features/library/lib/library-chat-handoff.ts
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-voice-and-media
- SYS-model-catalog-and-routing

## Unknown

- Whether any provider offers extend or segment edit: not checked.
- Whether Chrome offers any library remix: not searched.
- Exact Desktop clip controls: Desktop shows the hosted web app in Electron per AGENTS.md; Tauri CloudRuntime clip UI not read.
