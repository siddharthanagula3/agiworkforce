---
id: "GAPS-AREA-047"
type: "gap-list"
title: "Gaps: Video editing and media continuity"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 47. Video editing and media continuity

58 open gaps that touch this area. Area page: [20-features/047-video-editing-and-media-continuity](../../20-features/047-video-editing-and-media-continuity/README.md).

## GAP-AREA047-LW03

**The thumbnail address comes back from the status route for mobile, but no thumbnail picker exists to use it for S47.15.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-047
- Detail: Area 47. Video editing and media continuity
- Evidence: apps/mobile/src/features/video/services/videogen.ts (status response type and generatedVideoFromStatus)

## GAP-AREA047-LW04

**The history and lineage draft is marked not applied, yet the audit note treats the feature as missing; the two agree, but nothing in the live code depends on the draft.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-047
- Detail: Area 47. Video editing and media continuity
- Evidence: apps/web/db/neon/0257_file_versions_and_lineage.sql:1-4

## GAP-CAP-images-and-video-20

**Video editing, extension, storyboards and likeness controls: All of areas 46 and 47 beyond basic generation.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md), [F046-11](../../20-features/046-video-generation-studio/F046-11-remix-extend-and-regenerate-a-segment.md), [F047-01](../../20-features/047-video-editing-and-media-continuity/F047-01-trim-a-clip.md), [F047-02](../../20-features/047-video-editing-and-media-continuity/F047-02-join-clips-and-extend-a-scene.md), [F047-06](../../20-features/047-video-editing-and-media-continuity/F047-06-captions.md), [F047-10](../../20-features/047-video-editing-and-media-continuity/F047-10-likeness-avatar-or-cameo.md)
- Requirement items: S46.02, S46.03, S46.35, S46.36, S47.01, S47.02, S47.09, S47.13, S47.21, S47.22, S47.24
- Detail: Claude no, ChatGPT no; AGI not built

## GAP-F047-01-01

**No trim feature in any app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-01](../../20-features/047-video-editing-and-media-continuity/F047-01-trim-a-clip.md)
- Detail: Affects: web, desktop, mobile, Chrome. Work needed: Owner decision first (docs/decisions/2026-09-27-founder-decisions.md:310), then a processing step, a parent link, UI and tests.
- Evidence: brief S47.01 missing on all four; no code found

## GAP-F047-01-02

**Plan limits undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-01](../../20-features/047-video-editing-and-media-continuity/F047-01-trim-a-clip.md)
- Detail: Affects: all apps. Work needed: Define the capability and plans.
- Evidence: billing-catalog.ts lists capabilities with no editing entry

## GAP-F047-01-03

**No version or parent field**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-01](../../20-features/047-video-editing-and-media-continuity/F047-01-trim-a-clip.md)
- Detail: Affects: all apps. Work needed: A migration adding a parent reference.
- Evidence: apps/web/db/neon/0036_media_assets.sql:7-24 and 0105 table have none

## GAP-F047-01-NOTBUILT

**Trim a clip: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F047-01](../../20-features/047-video-editing-and-media-continuity/F047-01-trim-a-clip.md)
- Requirement items: S47.01
- Detail: Web: S47.01; Desktop: S47.01; Mobile: S47.01; Chrome: S47.01

## GAP-F047-02-01

**No join feature**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-02](../../20-features/047-video-editing-and-media-continuity/F047-02-join-clips-and-extend-a-scene.md)
- Detail: Affects: web, desktop, mobile, Chrome. Work needed: A processing step, ordered selection UI, source links and tests.
- Evidence: brief S47.09 missing

## GAP-F047-02-02

**No extend or last-frame continuation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-02](../../20-features/047-video-editing-and-media-continuity/F047-02-join-clips-and-extend-a-scene.md)
- Detail: Affects: all creation apps. Work needed: Catalog flag, frame extraction and UI; confirm provider support.
- Evidence: request schema has first_frame_image only (managed-media.ts:209)

## GAP-F047-02-03

**No parent link between clips**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-02](../../20-features/047-video-editing-and-media-continuity/F047-02-join-clips-and-extend-a-scene.md)
- Detail: Affects: all. Work needed: Migration.
- Evidence: 0036 and 0105 tables

## GAP-F047-02-04

**Plan limits undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-02](../../20-features/047-video-editing-and-media-continuity/F047-02-join-clips-and-extend-a-scene.md)
- Detail: Affects: all. Work needed: Owner decision.
- Evidence: billing-catalog.ts has no editing capability

## GAP-F047-02-NOTBUILT

**Join clips and extend a scene: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F047-02](../../20-features/047-video-editing-and-media-continuity/F047-02-join-clips-and-extend-a-scene.md)
- Requirement items: S47.02, S47.07, S47.09
- Detail: Web: S47.09, S47.02, S47.07; Desktop: S47.09, S47.02, S47.07; Mobile: S47.09, S47.02, S47.07; Chrome: S47.09, S47.02, S47.07

## GAP-F047-03-01

**No revise, style transfer or object/background change**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-03](../../20-features/047-video-editing-and-media-continuity/F047-03-change-a-clip-with-a-request.md)
- Detail: Affects: web, desktop, mobile, Chrome. Work needed: Source-clip input, model flags, chat action, parent link.
- Evidence: brief S47.03-S47.05 missing

## GAP-F047-03-02

**No version link**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-03](../../20-features/047-video-editing-and-media-continuity/F047-03-change-a-clip-with-a-request.md)
- Detail: Affects: all. Work needed: Migration.
- Evidence: 0105 and 0036 tables

## GAP-F047-03-03

**Model support unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-03](../../20-features/047-video-editing-and-media-continuity/F047-03-change-a-clip-with-a-request.md)
- Detail: Affects: all. Work needed: Probe providers, add flags.
- Evidence: model-catalog.ts:213-219 has no editing fields

## GAP-F047-03-04

**Plan limits undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-03](../../20-features/047-video-editing-and-media-continuity/F047-03-change-a-clip-with-a-request.md)
- Detail: Affects: all. Work needed: Owner decision.
- Evidence: billing-catalog.ts

## GAP-F047-03-NOTBUILT

**Change a clip with a request: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F047-03](../../20-features/047-video-editing-and-media-continuity/F047-03-change-a-clip-with-a-request.md)
- Requirement items: S47.03, S47.04, S47.05
- Detail: Web: S47.03, S47.04, S47.05; Desktop: S47.03, S47.04, S47.05; Mobile: S47.03, S47.04, S47.05; Chrome: S47.03, S47.04, S47.05

## GAP-F047-04-01

**Last-frame guidance missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-04](../../20-features/047-video-editing-and-media-continuity/F047-04-keep-characters-and-frames-consistent.md)
- Detail: Affects: all apps. Work needed: Contract field, catalog flag, provider mapping, UI, refusal message.
- Evidence: no last-frame field in managed-media.ts:193-217

## GAP-F047-04-02

**No cross-clip character reference**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-04](../../20-features/047-video-editing-and-media-continuity/F047-04-keep-characters-and-frames-consistent.md)
- Detail: Affects: all apps. Work needed: Reference store, linking and consent rules (likeness items S47.21-S47.24 are separate).
- Evidence: no saved reference store found

## GAP-F047-04-03

**Brief marks web missing though first-frame and reference inputs exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-04](../../20-features/047-video-editing-and-media-continuity/F047-04-keep-characters-and-frames-consistent.md)
- Detail: Affects: documentation accuracy. Work needed: Update the brief status for S47.08 first frame.
- Evidence: ChatComposerNew.tsx:605-606

## GAP-F047-04-04

**Desktop Tauri, mobile and Chrome send no images**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-04](../../20-features/047-video-editing-and-media-continuity/F047-04-keep-characters-and-frames-consistent.md)
- Detail: Affects: those apps. Work needed: Wire inputs after owner decision.
- Evidence: cloudApi.ts:610-613; side_panel.ts:8780

## GAP-F047-04-05

**Retained images are in memory only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-04](../../20-features/047-video-editing-and-media-continuity/F047-04-keep-characters-and-frames-consistent.md)
- Detail: Affects: web retry. Work needed: Optionally store asset ids for retry.
- Evidence: WebChatPage.tsx:3735

## GAP-F047-04-NOTBUILT

**Keep characters and frames consistent: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F047-04](../../20-features/047-video-editing-and-media-continuity/F047-04-keep-characters-and-frames-consistent.md)
- Requirement items: S47.06, S47.08
- Detail: Mobile: S47.06, S47.08; Chrome: S47.06, S47.08

## GAP-F047-05-01

**No audio replacement**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-05](../../20-features/047-video-editing-and-media-continuity/F047-05-sound-and-dialogue.md)
- Detail: Affects: web, desktop, mobile, Chrome. Work needed: Mux step, UI, file intake, parent link.
- Evidence: brief S47.10 missing

## GAP-F047-05-02

**No dialogue regeneration**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-05](../../20-features/047-video-editing-and-media-continuity/F047-05-sound-and-dialogue.md)
- Detail: Affects: all. Work needed: Speech model route, catalog flag, UI.
- Evidence: brief S47.12 missing

## GAP-F047-05-03

**No composer control for generate_audio**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-05](../../20-features/047-video-editing-and-media-continuity/F047-05-sound-and-dialogue.md)
- Detail: Affects: web. Work needed: Optional control.
- Evidence: no non-test use outside server

## GAP-F047-05-04

**Plan limits undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-05](../../20-features/047-video-editing-and-media-continuity/F047-05-sound-and-dialogue.md)
- Detail: Affects: all. Work needed: Owner decision.
- Evidence: billing-catalog.ts

## GAP-F047-05-NOTBUILT

**Sound and dialogue: not built on Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, Chrome
- Features: [F047-05](../../20-features/047-video-editing-and-media-continuity/F047-05-sound-and-dialogue.md)
- Requirement items: S47.10, S47.12
- Detail: Desktop: S47.10, S47.12; Mobile: S47.10, S47.12; Chrome: S47.10, S47.12

## GAP-F047-06-01

**No caption generation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-06](../../20-features/047-video-editing-and-media-continuity/F047-06-captions.md)
- Detail: Affects: web, desktop, mobile, Chrome. Work needed: Speech-to-text step, storage, UI.
- Evidence: brief S47.13 missing; no code

## GAP-F047-06-02

**No caption editing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-06](../../20-features/047-video-editing-and-media-continuity/F047-06-captions.md)
- Detail: Affects: all. Work needed: Editor list, save, versioning.
- Evidence: brief S47.14 missing

## GAP-F047-06-03

**No caption storage**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-06](../../20-features/047-video-editing-and-media-continuity/F047-06-captions.md)
- Detail: Affects: all. Work needed: Schema or metadata convention.
- Evidence: 0036 media_assets columns

## GAP-F047-06-04

**Plan limits undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-06](../../20-features/047-video-editing-and-media-continuity/F047-06-captions.md)
- Detail: Affects: all. Work needed: Owner decision.
- Evidence: billing-catalog.ts

## GAP-F047-06-NOTBUILT

**Captions: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F047-06](../../20-features/047-video-editing-and-media-continuity/F047-06-captions.md)
- Requirement items: S47.13, S47.14
- Detail: Web: S47.13, S47.14; Desktop: S47.13, S47.14; Mobile: S47.13, S47.14; Chrome: S47.13, S47.14

## GAP-F047-07-01

**No way to choose a frame or upload a cover**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-07](../../20-features/047-video-editing-and-media-continuity/F047-07-thumbnail-and-cover-image.md)
- Detail: Affects: All users of web, desktop, mobile, Chrome. Work needed: Design the control, a storage place for the chosen picture, an API and the display in chat and Library
- Evidence: Brief S47.15, S47.16 missing; no picker code found

## GAP-F047-07-02

**Status response never carries a poster although its type declares one**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-07](../../20-features/047-video-editing-and-media-continuity/F047-07-thumbnail-and-cover-image.md)
- Detail: Affects: Web, mobile, desktop and Chrome users watching a finished video. Work needed: Produce a poster from the stored asset and return it, or remove the dead field
- Evidence: apps/web/app/api/media/video/status/route.ts:33 versus apps/web/lib/services/video-job-reconciliation-service.ts:63-110

## GAP-F047-07-03

**Library thumbnails exclude videos**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-07](../../20-features/047-video-editing-and-media-continuity/F047-07-thumbnail-and-cover-image.md)
- Detail: Affects: Web, desktop, mobile Library users. Work needed: Extend the thumbnail source types or add a video poster
- Evidence: apps/web/lib/server/library-thumbnail.ts:26-38

## GAP-F047-07-04

**Scope is contested: founder decisions decline image and video edit controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-07](../../20-features/047-video-editing-and-media-continuity/F047-07-thumbnail-and-cover-image.md)
- Detail: Affects: Planning. Work needed: Owner to confirm whether S47.15 and S47.16 stay in scope
- Evidence: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144

## GAP-F047-07-NOTBUILT

**Thumbnail and cover image: not built on Desktop, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Chrome
- Features: [F047-07](../../20-features/047-video-editing-and-media-continuity/F047-07-thumbnail-and-cover-image.md)
- Requirement items: S47.15, S47.16
- Detail: Desktop: S47.15, S47.16; Chrome: S47.15, S47.16

## GAP-F047-08-01

**No compare, lineage or version screen for video**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-08](../../20-features/047-video-editing-and-media-continuity/F047-08-compare-and-history.md)
- Detail: Affects: All users on web, desktop, mobile, Chrome. Work needed: API to read versions and parents, Library details, compare view
- Evidence: Brief S47.17-S47.19 missing

## GAP-F047-08-02

**Nothing creates derived or revised videos**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-08](../../20-features/047-video-editing-and-media-continuity/F047-08-compare-and-history.md)
- Detail: Affects: All users. Work needed: Call persistGeneratedFile with provenance when a clip is regenerated or edited
- Evidence: Brief S47.01-S47.05 missing; no caller passes parentFileId or supersedesFileId outside tests

## GAP-F047-08-03

**Migration header says draft while config lists it as applied**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-08](../../20-features/047-video-editing-and-media-continuity/F047-08-compare-and-history.md)
- Detail: Affects: Engineers and testers. Work needed: Confirm production state with the migration status command and fix the header
- Evidence: apps/web/db/neon/0257_file_versions_and_lineage.sql:4 versus scripts/config/applied-migration-checksums.json:258

## GAP-F047-08-04

**Library item contract lacks version and parent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-08](../../20-features/047-video-editing-and-media-continuity/F047-08-compare-and-history.md)
- Detail: Affects: All Library clients. Work needed: Add fields and populate them in the library route
- Evidence: packages/contracts/cloud-contracts/src/library.ts:62-81

## GAP-F047-08-NOTBUILT

**Compare and history: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F047-08](../../20-features/047-video-editing-and-media-continuity/F047-08-compare-and-history.md)
- Requirement items: S47.17, S47.18, S47.19
- Detail: Web: S47.17, S47.18, S47.19; Desktop: S47.17, S47.18, S47.19; Mobile: S47.17, S47.18, S47.19; Chrome: S47.17, S47.18, S47.19

## GAP-F047-09-01

**No export or transcode on any app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-09](../../20-features/047-video-editing-and-media-continuity/F047-09-export-options.md)
- Detail: Affects: All video users on web, desktop, mobile, Chrome. Work needed: Choose where conversion runs, build the options screen, store the new file with lineage
- Evidence: Brief S47.20 missing; no ffmpeg or transcode code

## GAP-F047-09-02

**Plan rule for export options is undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-09](../../20-features/047-video-editing-and-media-continuity/F047-09-export-options.md)
- Detail: Affects: Subscription design. Work needed: Owner defines the rule and it is added to the one subscription system
- Evidence: Task brief states plan rule not defined in code; no export tier in billing-catalog.ts:343-360

## GAP-F047-09-03

**Founder decision declines video edit controls; export is unaddressed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-09](../../20-features/047-video-editing-and-media-continuity/F047-09-export-options.md)
- Detail: Affects: Scope. Work needed: Owner confirms scope
- Evidence: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144

## GAP-F047-09-NOTBUILT

**Export options: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F047-09](../../20-features/047-video-editing-and-media-continuity/F047-09-export-options.md)
- Requirement items: S47.20
- Detail: Web: S47.20; Desktop: S47.20; Mobile: S47.20; Chrome: S47.20

## GAP-F047-10-01

**No cameo, consent, reuse permission or revoke**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-10](../../20-features/047-video-editing-and-media-continuity/F047-10-likeness-avatar-or-cameo.md)
- Detail: Affects: All users on web, desktop, mobile, Chrome. Work needed: Design consent text and legal review, storage with row security, permission check in generation, revoke flow and screens
- Evidence: Briefs S47.21-S47.24 missing; no code

## GAP-F047-10-02

**Consent is claimed by a word in the prompt**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-10](../../20-features/047-video-editing-and-media-continuity/F047-10-likeness-avatar-or-cameo.md)
- Detail: Affects: Safety of real people. Work needed: Replace with stored consent for any real-person likeness
- Evidence: apps/web/lib/moderation/text-classifier.ts:164

## GAP-F047-10-03

**Legal and policy text must be written by Opus only (repo rule)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-10](../../20-features/047-video-editing-and-media-continuity/F047-10-likeness-avatar-or-cameo.md)
- Detail: Affects: Consent text. Work needed: Route consent copy accordingly
- Evidence: doc: CLAUDE.md Delegation section

## GAP-F047-10-04

**Plan limits undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-10](../../20-features/047-video-editing-and-media-continuity/F047-10-likeness-avatar-or-cameo.md)
- Detail: Affects: Subscription design. Work needed: Owner decides
- Evidence: Task brief; no entry in billing-catalog.ts

## GAP-F047-10-NOTBUILT

**Likeness: avatar or cameo: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F047-10](../../20-features/047-video-editing-and-media-continuity/F047-10-likeness-avatar-or-cameo.md)
- Requirement items: S47.21, S47.22, S47.23, S47.24
- Detail: Web: S47.21, S47.22, S47.23, S47.24; Desktop: S47.21, S47.22, S47.23, S47.24; Mobile: S47.21, S47.22, S47.23, S47.24; Chrome: S47.21, S47.22, S47.23, S47.24

## GAP-F047-11-01

**No public or private control for media collections**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-11](../../20-features/047-video-editing-and-media-continuity/F047-11-collection-privacy-and-remix.md)
- Detail: Affects: All users on web, desktop, mobile, Chrome. Work needed: Collection model, default Private, API and screens
- Evidence: Brief S47.25 missing; media_assets has no visibility column

## GAP-F047-11-02

**No remix permission and no social remix**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-11](../../20-features/047-video-editing-and-media-continuity/F047-11-collection-privacy-and-remix.md)
- Detail: Affects: All users. Work needed: Permission model and checks
- Evidence: Brief S47.26 missing; Library Remix is personal only (apps/web/features/library/lib/library-chat-handoff.ts:75)

## GAP-F047-11-03

**No Discover feed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-11](../../20-features/047-video-editing-and-media-continuity/F047-11-collection-privacy-and-remix.md)
- Detail: Affects: All users. Work needed: Feed with moderation, reporting and empty state
- Evidence: Brief S47.27 missing; /gallery shows artifacts and curated examples only

## GAP-F047-11-04

**Publishing of media blocked by kind list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-11](../../20-features/047-video-editing-and-media-continuity/F047-11-collection-privacy-and-remix.md)
- Detail: Affects: Anyone sharing images or video. Work needed: Add media serving path and moderation
- Evidence: apps/web/lib/services/published-artifact-service.ts:61-69

## GAP-F047-11-05

**Founder decisions decline external image sharing and edit controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F047-11](../../20-features/047-video-editing-and-media-continuity/F047-11-collection-privacy-and-remix.md)
- Detail: Affects: Scope. Work needed: Owner confirms scope
- Evidence: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144

## GAP-F047-11-NOTBUILT

**Collection privacy and remix: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F047-11](../../20-features/047-video-editing-and-media-continuity/F047-11-collection-privacy-and-remix.md)
- Requirement items: S47.25, S47.26, S47.27
- Detail: Web: S47.25, S47.26, S47.27; Desktop: S47.25, S47.26, S47.27; Mobile: S47.25, S47.26, S47.27; Chrome: S47.25, S47.26, S47.27
