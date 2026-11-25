---
id: "GAPS-AREA-046"
type: "gap-list"
title: "Gaps: Video-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 46. Video-generation studio

67 open gaps that touch this area. Area page: [20-features/046-video-generation-studio](../../20-features/046-video-generation-studio/README.md).

## CMP-M48

**GIF creation from a prompt or sketch**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: Video generation is off and no GIF creation exists.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:videoGen=false

## CMP-W106

**GIF output from image generation**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: No GIF output. Searched gif in image options.
- Evidence: searched: gif in apps/web/features/chat/lib/imageGenerationOptions.ts

## CMP-WP87

**Image generation**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md), [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md), [F044-06](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md), [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md), [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Detail: Paid plans generate images; Free uses a limited free-media model where offered Paid plans generate images; Free uses a limited free-media model where offered.
- Evidence: packages/contracts/types/src/model-catalog.ts:1250,1275; apps/web/features/chat/lib/free-media-choice.ts:9-32

## GAP-AREA046-LW03

**The library's Try again button for a video job calls the image retry endpoint. The image retry route only loads image jobs, so a video job retry likely fails. Not run; based on reading the code.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-046
- Detail: Area 46. Video-generation studio
- Evidence: apps/mobile/src/features/library/libraryClient.ts:189-190; apps/mobile/src/features/library/MediaJobsSection.tsx:236-242; apps/web/app/api/media/image/retry/route.ts:18-21

## GAP-AREA046-LW06

**The web model picker is built from the catalog with a live-status filter, not from the provider release policy. A model whose provider is not admitted may still be offered and then refused by the server with a 503. Not verified in the running app.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-046
- Detail: Area 46. Video-generation studio
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:597-598, 1338-1353; apps/web/app/api/media/video/generate/route.ts:1189-1193; apps/web/lib/server/video-provider-release-policy.ts:16-18

## GAP-CAP-images-and-video-18

**Image generation usage limits and cost display: Free path fails with a retry notice and a credit-limit send fails silently, both seen in the browser.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-06](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md), [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Requirement items: S44.14, S44.15, S46.27
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-19

**Text-to-video generation: Ledger says Chrome video missing, comparison and code show a video mode. Mobile ledger says done but the flag is off. The old provider family slots still name shut-down rows (known flaw VIDEO-VEO-SLOTS-SHUTDOWN-2026-10-22). Neither leader offers video, so parity pressure is**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F046-01](../../20-features/046-video-generation-studio/F046-01-write-a-prompt-and-pick-the-clip-options.md), [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md), [F046-03](../../20-features/046-video-generation-studio/F046-03-progress-and-stop.md), [F046-04](../../20-features/046-video-generation-studio/F046-04-try-again-after-a-failure.md), [F046-05](../../20-features/046-video-generation-studio/F046-05-clip-library-playback-download-and-share.md)
- Requirement items: S46.01, S46.05, S46.06, S46.07, S46.08, S46.26, S46.27, S46.28, S46.29, S46.30, S46.31, S46.32
- Detail: Claude no, ChatGPT no; AGI partly built

## GAP-CAP-images-and-video-20

**Video editing, extension, storyboards and likeness controls: All of areas 46 and 47 beyond basic generation.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md), [F046-11](../../20-features/046-video-generation-studio/F046-11-remix-extend-and-regenerate-a-segment.md), [F047-01](../../20-features/047-video-editing-and-media-continuity/F047-01-trim-a-clip.md), [F047-02](../../20-features/047-video-editing-and-media-continuity/F047-02-join-clips-and-extend-a-scene.md), [F047-06](../../20-features/047-video-editing-and-media-continuity/F047-06-captions.md), [F047-10](../../20-features/047-video-editing-and-media-continuity/F047-10-likeness-avatar-or-cameo.md)
- Requirement items: S46.02, S46.03, S46.35, S46.36, S47.01, S47.02, S47.09, S47.13, S47.21, S47.22, S47.24
- Detail: Claude no, ChatGPT no; AGI not built

## GAP-CAP-images-and-video-21

**Animate an image: GIF and image-to-video: Not built.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Requirement items: S44.34, S46.02
- Detail: Claude no, ChatGPT yes; AGI not built

## GAP-F046-01-01

**Mobile video is built but switched off, so the S46.01/05/06/07/08 'mobile done' status in the brief is not user-reachable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-01](../../20-features/046-video-generation-studio/F046-01-write-a-prompt-and-pick-the-clip-options.md)
- Detail: Affects: Mobile users. Work needed: Owner decision to release; flip the flag; run a live phone check with the real provider; keep the paid-only rule.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:28; AddToChatSheet.tsx:337-342; MessageList.tsx:112-115

## GAP-F046-01-02

**Chrome has a prompt-only video flow but the brief and the surface matrix mark it missing/absent, and it has no model, shape, length or resolution control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-01](../../20-features/046-video-generation-studio/F046-01-write-a-prompt-and-pick-the-clip-options.md)
- Detail: Affects: Chrome users; anyone reading the brief or matrix. Work needed: Correct the brief and matrix source data; decide whether Chrome gets the pickers.
- Evidence: side_panel.ts:8779-8793; videoGenerationClient.ts:126; doc: docs/product/surface-feature-matrix.md:319

## GAP-F046-01-03

**The catalog's video slots still name models Google shut down on 2026-10-22; a live executable model in production is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-01](../../20-features/046-video-generation-studio/F046-01-write-a-prompt-and-pick-the-clip-options.md)
- Detail: Affects: All surfaces. Work needed: Move the slots through the model-families tool after the owner-approved probe and eval; run a live generation.
- Evidence: audit/registers/known-flaws.md row VIDEO-VEO-SLOTS-SHUTDOWN-2026-10-22; doc: docs/product/definition.md:352-357

## GAP-F046-01-04

**The route accepts n (up to 4 candidates) but no client sends it and the estimate ignores it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-01](../../20-features/046-video-generation-studio/F046-01-write-a-prompt-and-pick-the-clip-options.md)
- Detail: Affects: Web, mobile. Work needed: Either add a control and multiply the estimate, or remove the field.
- Evidence: managed-media.ts:160, 205-210; media-api-service.ts:41-52

## GAP-F046-01-05

**The brief's code anchors for S46.05-08 are out of date.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-01](../../20-features/046-video-generation-studio/F046-01-write-a-prompt-and-pick-the-clip-options.md)
- Detail: Affects: Engineers and testers. Work needed: Regenerate the brief anchors.
- Evidence: Brief cites ChatComposerNew.tsx:5081 etc; the menus are at 6549-6931

## GAP-F046-02-01

**No test covers VideoCostEstimate or the mobile estimate line.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Detail: Affects: Web, mobile. Work needed: Add component tests for normal, over-balance, no-price and no-usage cases.
- Evidence: Search of test folders for video-cost-estimate and estimateVideoCredits found no test

## GAP-F046-02-02

**Mobile does not warn when the estimate exceeds spendable credits.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Detail: Affects: Mobile (when released). Work needed: Reuse the spendable-credits comparison.
- Evidence: AddToChatSheet.tsx:1150-1164

## GAP-F046-02-03

**No place shows the actual settled cost after delivery, though the brief says 'estimated or actual'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Detail: Affects: Web, mobile. Work needed: Decide whether to show the actual cost in the clip details.
- Evidence: Searched composer, message bubble and library; none found

## GAP-F046-02-04

**Chrome sends a video with no estimate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Detail: Affects: Chrome. Work needed: Add the note or a fixed disclosure.
- Evidence: videoGenerationClient.ts:126; no cost note in side_panel.ts video path

## GAP-F046-02-05

**The estimate ignores the candidate count n and assumes audio.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Detail: Affects: Web. Work needed: Align with whatever options become selectable.
- Evidence: credit-estimates.ts:93-108; route.ts:1044, 1207

## GAP-F046-02-NOTBUILT

**Cost estimate: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Requirement items: S46.27
- Detail: Chrome: S46.27

## GAP-F046-03-01

**Stop does not stop a clip for any released provider; the brief says the job stops.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-03](../../20-features/046-video-generation-studio/F046-03-progress-and-stop.md)
- Detail: Affects: Web, mobile, library cancel on every surface. Work needed: Either change the promise and wording, or find a provider stop call; record who bears provider cost.
- Evidence: cancel/route.ts:56-57; video-job-reconciliation-service.ts:497-503; video-provider-release-policy.ts:17

## GAP-F046-03-02

**Mobile marks a job as failed after 5 minutes while the server job continues; Retry could create a second paid job.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-03](../../20-features/046-video-generation-studio/F046-03-progress-and-stop.md)
- Detail: Affects: Mobile (when released). Work needed: Adopt the web 'still being made' and resume model.
- Evidence: videogen.ts:170-175; runVideoGenerationTurn.ts:176-181

## GAP-F046-03-03

**Chrome has no stop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-03](../../20-features/046-video-generation-studio/F046-03-progress-and-stop.md)
- Detail: Affects: Chrome. Work needed: Add a stop or state the limit.
- Evidence: videoGenerationClient.ts (only start and status)

## GAP-F046-03-04

**Open register item: output visibility, failed-cleanup replay and observed-cost recovery are not coordinated with terminal settlement.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-03](../../20-features/046-video-generation-studio/F046-03-progress-and-stop.md)
- Detail: Affects: All surfaces. Work needed: As the row states.
- Evidence: audit/registers/known-flaws.md row WEB-VIDEO-DELIVERY-RECOVERY-01

## GAP-F046-03-05

**The Tauri desktop cancels the paid job when its 5 minute poll window closes, unlike web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-03](../../20-features/046-video-generation-studio/F046-03-progress-and-stop.md)
- Detail: Affects: Internal Tauri build. Work needed: Align or retire the internal path.
- Evidence: apps/desktop/src/api/cloudApi.ts:683-686

## GAP-F046-04-01

**Mobile retry does not reuse the failed attempt's model and options; it re-sends '/video <prompt>' with the current settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-04](../../20-features/046-video-generation-studio/F046-04-try-again-after-a-failure.md)
- Detail: Affects: Mobile (when released). Work needed: Persist options on the message or restate which settings apply.
- Evidence: apps/mobile/app/(app)/chat/[id].tsx:1954-1962

## GAP-F046-04-02

**Web client may offer retry for an unknown-outcome job until the transcript syncs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-04](../../20-features/046-video-generation-studio/F046-04-try-again-after-a-failure.md)
- Detail: Affects: Web. Work needed: Expose outcome_unknown (or a retryable flag) in the public status.
- Evidence: WebChatPage.tsx:3830-3845; video-job-reconciliation-service.ts:75-81; video-generation-transcript.ts:47

## GAP-F046-04-03

**Retry of image-conditioned videos is lost on reload.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-04](../../20-features/046-video-generation-studio/F046-04-try-again-after-a-failure.md)
- Detail: Affects: Web. Work needed: Accept, or store the images through a durable asset reference.
- Evidence: WebChatPage.tsx:3735; videoRetryInputs.ts:21-24

## GAP-F046-04-04

**Library hosts send video retries to the image retry endpoint; only a server flag prevents the wrong call.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-04](../../20-features/046-video-generation-studio/F046-04-try-again-after-a-failure.md)
- Detail: Affects: Mobile, web library, Tauri library. Work needed: Make the hosts video-aware or hide retry for video jobs in code.
- Evidence: libraryClient.ts:189-191; web LibraryView.tsx:253-258; DesktopLibrary.tsx:199-202; media-job-history.ts:176

## GAP-F046-04-05

**Mobile Retry is offered even for refused prompts that cannot pass.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-04](../../20-features/046-video-generation-studio/F046-04-try-again-after-a-failure.md)
- Detail: Affects: Mobile. Work needed: Add a failure category to the job status.
- Evidence: audit/registers/known-flaws.md row MOBILE-IMAGE-FAILURE-CATEGORY-01

## GAP-F046-05-01

**No web (or Electron desktop) share for a video.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-05](../../20-features/046-video-generation-studio/F046-05-clip-library-playback-download-and-share.md)
- Detail: Affects: Web, desktop. Work needed: Owner decision on form (link or file), then build with the shared library host.
- Evidence: No share control in MessageBubble.tsx video block (3393-3470); brief S46.33 web missing

## GAP-F046-05-02

**Library download of a video reads the whole file into the page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-05](../../20-features/046-video-generation-studio/F046-05-clip-library-playback-download-and-share.md)
- Detail: Affects: Web, desktop. Work needed: Use a browser-native download for videos and check the allowance exemption holds.
- Evidence: LibraryView.tsx:259-263, 559-592

## GAP-F046-05-03

**Library storage breakdown ignores video bytes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-05](../../20-features/046-video-generation-studio/F046-05-clip-library-playback-download-and-share.md)
- Detail: Affects: Web library storage meter. Work needed: Add a videos bucket or document the omission.
- Evidence: apps/web/app/api/library/route.ts:117-130

## GAP-F046-05-04

**The 256 MB cap is not tied to the longest clip the models can make.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-05](../../20-features/046-video-generation-studio/F046-05-clip-library-playback-download-and-share.md)
- Detail: Affects: All surfaces. Work needed: Measure real output sizes and set the cap deliberately.
- Evidence: files route.ts:46; catalog durations up to 30 s

## GAP-F046-05-05

**The brief and the surface matrix list wrong code anchors and mark Chrome absent while a Chrome video player exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-05](../../20-features/046-video-generation-studio/F046-05-clip-library-playback-download-and-share.md)
- Detail: Affects: Engineers, testers. Work needed: Regenerate the matrix and brief.
- Evidence: generatedFiles.ts:341-392; doc: docs/product/surface-feature-matrix.md:312-320

## GAP-F046-05-NOTBUILT

**Clip library, playback, download and share: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F046-05](../../20-features/046-video-generation-studio/F046-05-clip-library-playback-download-and-share.md)
- Requirement items: S46.33
- Detail: Web: S46.33; Desktop: S46.33

## GAP-F046-06-01

**Brief marks image-to-video and references as missing on web, but they are built and tested.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: Affects: Engineers, testers, product. Work needed: Correct the brief status to web built, others missing.
- Evidence: ChatComposerNew.tsx:6482-6545; test files listed above; brief S46.02, S46.04

## GAP-F046-06-02

**Video-to-video does not exist anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: Affects: All apps. Work needed: Decide scope first; then add contract, UI and provider mapping.
- Evidence: managed-media.ts:193-217 (strict schema, no video field)

## GAP-F046-06-03

**Mobile and Chrome cannot send input images.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: Affects: Mobile, Chrome. Work needed: Add attachment path plus consent for sending images to a provider.
- Evidence: runVideoGenerationTurn.ts:132-146; side_panel.ts:8779-8784

## GAP-F046-06-04

**Image video retry is lost after reload.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: Affects: Web. Work needed: Store images durably if parity with 'same settings' is required.
- Evidence: WebChatPage.tsx:3735; videoRetryInputs.ts:21-24

## GAP-F046-06-05

**Server byte-size limit for input images was not confirmed, and the denylist content is not visible here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: Affects: Security review. Work needed: Read ManagedMediaImageRefSchema limits and add a test for the cap.
- Evidence: route.ts:803-861 reads MANAGED_MEDIA_IMAGE_REF_MAX_BYTES indirectly via the schema

## GAP-F046-06-06

**No frame-rate, style, character or per-shot reference controls (S46.09, S46.15, S46.17, S46.24).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: Affects: All apps. Work needed: Product decision per item.
- Evidence: Brief marks them missing; no code found

## GAP-F046-06-NOTBUILT

**Start from an image or video: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Requirement items: S46.02, S46.03, S46.04
- Detail: Mobile: S46.02, S46.03, S46.04; Chrome: S46.02, S46.03, S46.04

## GAP-F046-07-01

**No frame-rate selector**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-07](../../20-features/046-video-generation-studio/F046-07-reference-audio-and-frame-rate.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome users. Work needed: Add frame-rate data to the model catalog, request schema, server validation, composer control and job column; confirm provider support first.
- Evidence: managed-media.ts:193-217; model-catalog.ts:213-219

## GAP-F046-07-02

**No reference-audio input**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-07](../../20-features/046-video-generation-studio/F046-07-reference-audio-and-frame-rate.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome users. Work needed: New upload type, moderation, size limits, provider adapter fields, composer control, cost rules.
- Evidence: managed-media.ts:209-216 accepts images only

## GAP-F046-07-03

**generate_audio is accepted but no app exposes it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-07](../../20-features/046-video-generation-studio/F046-07-reference-audio-and-frame-rate.md)
- Detail: Affects: all video apps; S46.13 is marked not applicable. Work needed: Decide whether to expose an audio switch; see F046-12.
- Evidence: media-api-service.ts:41-51; videoGenerationClient.ts:126

## GAP-F046-07-NOTBUILT

**Reference audio and frame rate: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F046-07](../../20-features/046-video-generation-studio/F046-07-reference-audio-and-frame-rate.md)
- Requirement items: S46.09, S46.14
- Detail: Web: S46.09, S46.14; Desktop: S46.09, S46.14; Mobile: S46.09, S46.14; Chrome: S46.09, S46.14

## GAP-F046-08-01

**No video style presets**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-08](../../20-features/046-video-generation-studio/F046-08-style-presets-and-templates.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Shared preset list, composer control per app, prompt composition, tests.
- Evidence: managed-media.ts:193-217; ChatComposerNew.tsx:6344 is image-only

## GAP-F046-08-02

**No template gallery**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-08](../../20-features/046-video-generation-studio/F046-08-style-presets-and-templates.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Template data model, gallery screen, start-from-template action, per-app UI.
- Evidence: no template names in video code (searched apps/packages)

## GAP-F046-08-03

**Brief and audit mark these missing; project surface matrix says video absent on desktop, mobile and chrome though code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-08](../../20-features/046-video-generation-studio/F046-08-style-presets-and-templates.md)
- Detail: Affects: documentation accuracy. Work needed: Regenerate or correct the matrix (docs are rank 6; code wins).
- Evidence: docs/product/surface-feature-matrix.md:67 vs apps/desktop/src/api/cloudApi.ts:600, apps/mobile/src/features/video/services/videogen.ts:87, apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:109

## GAP-F046-08-NOTBUILT

**Style presets and templates: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F046-08](../../20-features/046-video-generation-studio/F046-08-style-presets-and-templates.md)
- Requirement items: S46.15, S46.16
- Detail: Web: S46.15, S46.16; Desktop: S46.15, S46.16; Mobile: S46.15, S46.16; Chrome: S46.15, S46.16

## GAP-F046-09-01

**No saved character store or picker**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-09](../../20-features/046-video-generation-studio/F046-09-saved-characters-and-references.md)
- Detail: Affects: all four video apps. Work needed: Storage model, picker, sync, delete flow with confirmation, tests.
- Evidence: no character code found; managed-media.ts:209-216 takes uploaded images only

## GAP-F046-09-02

**Reference images missing on Desktop, Mobile, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-09](../../20-features/046-video-generation-studio/F046-09-saved-characters-and-references.md)
- Detail: Affects: those apps. Work needed: Port the Web input control and send image fields.
- Evidence: cloudApi.ts:610-613; videogen.ts:13; videoGenerationClient.ts:126

## GAP-F046-09-03

**Brief marks S46.02 and S46.04 missing on Web, but Web code sends images**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-09](../../20-features/046-video-generation-studio/F046-09-saved-characters-and-references.md)
- Detail: Affects: brief accuracy. Work needed: Update the brief and ledger from code.
- Evidence: useMediaGeneration.ts:30-37

## GAP-F046-09-NOTBUILT

**Saved characters and references: not built on Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, Chrome
- Features: [F046-09](../../20-features/046-video-generation-studio/F046-09-saved-characters-and-references.md)
- Requirement items: S46.17
- Detail: Desktop: S46.17; Mobile: S46.17; Chrome: S46.17

## GAP-F046-10-01

**No storyboard, shot cards, reorder, duplicate, delete, per-shot duration or references**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-10](../../20-features/046-video-generation-studio/F046-10-storyboard-and-shots.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: New request shape, parent-child job model, migration, UI per app, cost and cancel logic, tests.
- Evidence: managed-media.ts:193-217; route.ts:1194-1295

## GAP-F046-10-02

**No way to join shots into one file**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-10](../../20-features/046-video-generation-studio/F046-10-storyboard-and-shots.md)
- Detail: Affects: any future storyboard. Work needed: Server or on-device step to concatenate clips, or in-product sequence playback.
- Evidence: no join step found

## GAP-F046-10-NOTBUILT

**Storyboard and shots: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F046-10](../../20-features/046-video-generation-studio/F046-10-storyboard-and-shots.md)
- Requirement items: S46.18, S46.19, S46.20, S46.21, S46.22, S46.23, S46.24
- Detail: Web: S46.18, S46.19, S46.20, S46.21, S46.22, S46.23, S46.24; Desktop: S46.18, S46.19, S46.20, S46.21, S46.22, S46.23, S46.24; Mobile: S46.18, S46.19, S46.20, S46.21, S46.22, S46.23, S46.24; Chrome: S46.18, S46.19, S46.20, S46.21, S46.22, S46.23, S46.24

## GAP-F046-11-01

**No video remix**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-11](../../20-features/046-video-generation-studio/F046-11-remix-extend-and-regenerate-a-segment.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Extend hand-off to video, fill video composer, add UI.
- Evidence: LibraryView.tsx:1833; library/index.tsx:629

## GAP-F046-11-02

**No extend**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-11](../../20-features/046-video-generation-studio/F046-11-remix-extend-and-regenerate-a-segment.md)
- Detail: Affects: all video apps. Work needed: Provider capability check, request fields, catalog flag, UI, billing.
- Evidence: no source-video field in schema

## GAP-F046-11-03

**No segment regeneration**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-11](../../20-features/046-video-generation-studio/F046-11-remix-extend-and-regenerate-a-segment.md)
- Detail: Affects: all video apps. Work needed: Segment selector UI, provider support, new job type.
- Evidence: same

## GAP-F046-11-04

**No clip lineage**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-11](../../20-features/046-video-generation-studio/F046-11-remix-extend-and-regenerate-a-segment.md)
- Detail: Affects: provenance. Work needed: Additive migration for a source id.
- Evidence: video-generation-jobs.ts:142 has no source column

## GAP-F046-11-NOTBUILT

**Remix, extend and regenerate a segment: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F046-11](../../20-features/046-video-generation-studio/F046-11-remix-extend-and-regenerate-a-segment.md)
- Requirement items: S46.35, S46.36, S46.37
- Detail: Web: S46.35, S46.36, S46.37; Desktop: S46.35, S46.36, S46.37; Mobile: S46.35, S46.36, S46.37; Chrome: S46.35, S46.36, S46.37

## GAP-F046-12-01

**generate_audio accepted by the server but no app sends it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-12](../../20-features/046-video-generation-studio/F046-12-items-that-do-not-apply.md)
- Detail: Affects: all video apps. Work needed: Decide whether to expose an audio switch; the brief says not applicable.
- Evidence: media-api-service.ts:41-51; videoGenerationClient.ts:126; cloudApi.ts:610

## GAP-F046-12-02

**Brief and project matrix disagree with the code on video presence**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-12](../../20-features/046-video-generation-studio/F046-12-items-that-do-not-apply.md)
- Detail: Affects: docs accuracy. Work needed: Regenerate the matrix.
- Evidence: docs/product/surface-feature-matrix.md:67 marks Desktop, Mobile, Chrome absent; code exists in cloudApi.ts:600, videogen.ts:87, videoGenerationClient.ts:109

## GAP-F046-12-03

**No visible queue of pending video jobs**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-12](../../20-features/046-video-generation-studio/F046-12-items-that-do-not-apply.md)
- Detail: Affects: Web, Mobile users with several jobs. Work needed: Only if the owner changes S46.25 from not applicable.
- Evidence: no job list UI found

## GAP-F046-12-04

**Save clip to Project not available**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F046-12](../../20-features/046-video-generation-studio/F046-12-items-that-do-not-apply.md)
- Detail: Affects: Library users. Work needed: Confirm in the app; decide scope.
- Evidence: chat.ts:97-159 has no video type [inferred]
