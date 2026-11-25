---
id: "F047-09"
type: "feature"
title: "Export options"
aliases: ["Export/transcode options (S47.20)", "Export", "Save as", "format, resolution, codec", "Download video"]
area: "47 Video editing and media continuity"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "F047-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-09 Export options

Planned: save a clip in another format, resolution or codec as a new file. It is not built. A person can only download the generated clip as it is, from the chat player or the Library. No code in the apps or the server converts video.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.20](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4720).

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

**What it does.** Planned: open a clip, choose Export, pick format, resolution and codec, choose Save, and get a new file while the original stays.

**Why it exists.** Brief S47.20. People need clips in the shape another tool or platform accepts. The guidance asks that real downloads and exported derivatives work and are tracked (doc: docs/product/competitive-guidance.md:329,342).

**Who uses it.** Video creators on a plan that allows video, who need a different size or format for posting.

**Problems it solves**

- A clip can only be downloaded as generated, so a different size means another tool.
- Resolution is chosen only before generation, not after (packages/contracts/cloud-contracts/src/managed-media.ts:197).

**Use cases**

- Save a clip at a smaller size for a message.
- Save a clip in a format a video editor opens.
- Keep the original and a lower-resolution copy.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome extension: no Export control for video exists (brief S47.20 missing on these four; CLI and VS Code n/a).
- Today only: 'Download video' link in the web chat (apps/web/features/chat/components/messages/MessageBubble.tsx:3419-3458) and 'Download' in the Library item menu (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1795).

**Before you start**

- A finished clip; plan max_15x or enterprise to make one (packages/contracts/types/src/billing-catalog.ts:357).
- Cloud mode.

**Screens and controls**

- Not built. Planned from the brief: Export, then format, resolution, codec, Save [proposed labels].
- Built: a download icon over the web player with the name 'Download video' (apps/web/features/chat/components/messages/MessageBubble.tsx:3450-3458).

**Journey**

1. Planned: open a clip, choose Export, pick options, choose Save, receive a new file.
2. Today: open a clip, choose Download, receive the file as generated.

**What the person sees and gets**

- Planned failure: the person sees which option failed (brief).
- Today: browser download; downloads may spend a download allowance unless exempt (apps/web/app/api/files/[id]/route.ts:186,234-246).

**Settings**

- Pre-generation settings exist: duration, resolution, aspect ratio (packages/contracts/cloud-contracts/src/managed-media.ts:196-198). No export settings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Download of the generated file from chat and Library (apps/web/features/chat/components/messages/MessageBubble.tsx:3419; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1795).
- Resolution, duration and aspect ratio are chosen when asking for a video (packages/contracts/cloud-contracts/src/managed-media.ts:196-198; apps/mobile/src/features/video/services/videogen.ts:52-70).

**Incomplete**

- The only link between an export and its source is the generic derivation kind 'export' in the file model and lineage table (packages/contracts/types/src/file-model.ts:32; apps/web/db/neon/0257_file_versions_and_lineage.sql:92), with no exporter calling it.

**Present but disconnected or switched off**

- none found: no export code exists to be disabled.

**Not available**

- Format, resolution and codec conversion of an existing clip on web, desktop, mobile and Chrome (brief S47.20 missing). Searched apps/web, apps/desktop, apps/mobile/src, packages and crates for ffmpeg and transcode; the only matches are an unrelated iOS picker comment (apps/mobile/src/features/media/image-normalization.ts:49) and an observability test event name (apps/web/lib/observability/__tests__/refusal-and-turn-call-sites.test.ts:250).
- CLI and VS Code: not applicable.

## 4. Required behaviour

**Established requirements**

- User exports a clip in another format, resolution or codec. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.20)
- The original clip is kept and the export is a new file. (source: Draft use text in the task; same brief item S47.20 [inferred, the brief line has no more])
- Preview fidelity: test the actual exported file; report unsupported formats instead of a fake download. (source: doc: docs/product/competitive-guidance.md:338,342)
- Video editing is not built; edit controls are declined. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144,310)

**Acceptance criteria**

1. Export offers only options the source and the plan allow.
2. Saving creates a new file; the original is unchanged and still plays.
3. A failed option shows which option failed.
4. The exported file opens in a standard player with the chosen format and size.
5. Export of another account's clip is refused.
6. The new file appears in the Library with a link to its source.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Conversion needs a compute place: on device, on our servers or an outside service. The code does not choose one. unknown.
- Metering of conversion compute is not defined [inferred].

**Proposed improvements** (suggestions, not requirements)

- Record each export with derivation 'export' and the source id in file_lineage.
- Limit offered options by source dimensions so no upscale is offered.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble video block | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Web: player and 'Download video' link |
| component | LibraryView item menu | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared Library with Download action |
| endpoint | GET /api/files/{id} | `apps/web/app/api/files/[id]/route.ts` | Serves stored bytes; counts download allowance |
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Resolution, duration, aspect ratio before generation |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Creates a video; the only place format and size are set |
| service | videogen (mobile) | `apps/mobile/src/features/video/services/videogen.ts` | Mobile request builder with supported durations |
| service | generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Desktop cloud video request |
| service | videoGenerationClient (Chrome) | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome request and poll |
| other | file-model derivations | `packages/contracts/types/src/file-model.ts` | Defines 'export' and 'conversion' derivation kinds |
| table | file_lineage | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Would link an export to its source |
| service | persistGeneratedFile | `apps/web/lib/server/generated-file-persist.ts` | Saves a generated file with parent and derivation |
| config | BILLING_PLAN_CAPABILITY_TIERS | `packages/contracts/types/src/billing-catalog.ts` | Plans that include video generation |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Where an exported file would be catalogued |
| test | media-video-generate test | `apps/web/__tests__/api/media-video-generate.test.ts` | Covers generation request handling |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Planned: the person chooses export options for a clip. | device | Not built (brief S47.20) |
| Today: the person chooses Download; the browser requests the stored bytes. | device and our servers | apps/web/features/chat/components/messages/MessageBubble.tsx:3419; apps/web/app/api/files/[id]/route.ts:186-246 |
| The server checks the account and workspace, may count the download allowance, and streams the file. | our servers | apps/web/app/api/files/[id]/route.ts:186,234-246,294 |
| Conversion of format, size or codec: no step exists. | our servers | No transcode code found in repo (searched ffmpeg, transcode) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Original clip | Object storage and media_assets (apps/web/db/neon/0036_media_assets.sql:9-25) | Yes across Cloud surfaces | Soft delete (deleted_at) |
| Exported file | Not implemented | not applicable | not applicable |

**Models and providers.** Conversion would need no model [inferred]. Today's resolution choice is passed to the video provider at generation time (apps/web/app/api/media/video/generate/route.ts:1137-1175).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for the file route (apps/web/app/api/files/[id]/route.ts). |
| Permissions | Workspace-scoped asset lookup (apps/web/app/api/files/[id]/thumbnail/route.ts:60 shows the same pattern); export permission: none found in the code. |
| Subscription | Brief says options follow source and plan, 'plan rule not defined in code yet'. Video creation is plan max_15x or enterprise (packages/contracts/types/src/billing-catalog.ts:357). |
| Limits and metering | Download may spend a download allowance (apps/web/app/api/files/[id]/route.ts:234-246). No export limits: none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. Available resolutions and durations depend on the video model (apps/mobile/src/features/video/services/videogen.ts:52-70). |
| Provider restrictions | Generation provider limits what resolution can be made; export has no provider. |
| Local mode | No local video generation or conversion found in the code; unknown for desktop Local. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Download link while video fails to load | Chat shows 'Video failed to load', Retry (max 2) and Download video | apps/web/features/chat/components/messages/MessageBubble.tsx:389,3402-3425 |
| Export option fails | not handled in the code (no export) | none |
| Offline, cancel, timeout of export | not handled in the code | none |
| Original deleted | Library delete moves it to deleted items; export of it not defined | apps/mobile/src/features/library/index.tsx:557 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate.test.ts`: Video generation request route
- `apps/web/__tests__/api/ai-act-video-provenance.test.ts`: AI-generated provenance on video responses
- `apps/web/lib/server/generated-file-persist.test.ts`: Saving a generated file with a parent (lineage edge)
- `apps/mobile/__tests__/ChatTabVideoDuration.test.tsx`: Mobile video duration choice before generation

**Test scenarios**

- **Today's download**
  1. Generate a clip
  2. Choose Download video
  - Expected: File saves as generated, no option to change format
- **No Export control**
  1. Open a finished clip on web, desktop, mobile and the Chrome panel
  2. Look for Export
  - Expected: No control exists (confirms the gap)
- **Export keeps original (after built)**
  1. Export at lower resolution
  2. Open the Library
  - Expected: Two files; the original still plays; the new one links to it
- **Option failure (after built)**
  1. Choose an unsupported codec for the source
  - Expected: Option not offered, or the failed option is named
- **Plan limit (after defined)**
  1. Sign in on a plan outside the allowed list
  2. Open a clip
  - Expected: Only allowed options shown

**Where to look when it fails**

- Download spending: allowance checks in apps/web/app/api/files/[id]/route.ts.
- Tables media_assets and file_lineage for new files and links.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No export or transcode on any app** Affects: All video users on web, desktop, mobile, Chrome. Evidence: Brief S47.20 missing; no ffmpeg or transcode code. Work needed: Choose where conversion runs, build the options screen, store the new file with lineage
- **Plan rule for export options is undefined** Affects: Subscription design. Evidence: Task brief states plan rule not defined in code; no export tier in billing-catalog.ts:343-360. Work needed: Owner defines the rule and it is added to the one subscription system
- **Founder decision declines video edit controls; export is unaddressed** Affects: Scope. Evidence: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144. Work needed: Owner confirms scope
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- F047-08

## Unknown

- Where conversion would run (device, our servers or outside service).
- The plan rule for export options.
- Whether the owner wants export in scope given declined edit controls.
- Whether desktop or mobile local save offers any conversion natively (not found).
