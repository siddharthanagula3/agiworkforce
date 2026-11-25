---
id: "GAPS-AREA-044"
type: "gap-list"
title: "Gaps: Image-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 44. Image-generation studio

95 open gaps that touch this area. Area page: [20-features/044-image-generation-studio](../../20-features/044-image-generation-studio/README.md).

## CMP-M161

**Add reference photos of yourself**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No profile reference photos for image creation; images can only take photos attached per request.
- Evidence: searched: reference photos, profile photo reference in apps/mobile/src/features/image, apps/mobile/src/features/settings; apps/mobile/src/features/image/useImageReferences.ts

## CMP-M205

**Share an image prompt as a template link**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: Images screen has no prompt template link.
- Evidence: searched: template, share in src/features/image

## CMP-M48

**GIF creation from a prompt or sketch**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: Video generation is off and no GIF creation exists.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:videoGen=false

## CMP-M49

**Images page with Templates and Trending ideas**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: The route renders <ImagesScreen /> with no props (apps/mobile/app/(app)/images.tsx:4). templates and ideas default to empty arrays (apps/mobile/src/features/image/ImagesScreen.tsx:197-199), the switch needs ideas.length > 0 (:299) and the tile grid needs tiles.length > 0 (:368). No other caller pass
- Evidence: apps/mobile/src/features/image/ImagesScreen.tsx:73 Templates / Ideas, :299 showSwitch

## CMP-M50

**Personalised sticker packs for iMessage and WhatsApp**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No sticker creation exists.
- Evidence: searched: sticker in app, src

## CMP-M51

**Sketch to image on mobile**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No drawing canvas feeds image creation.
- Evidence: searched: sketch in src/features/image, chat composer

## CMP-MP36

**Saved reference images for later requests**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: Named saved references are not shown The Images page lets you attach reference photos to a request; named saved references are not shown.
- Evidence: apps/mobile/src/features/image/ImagesScreen.tsx:222 useImageReferences; searched: @name references in apps/mobile/src/features/image

## CMP-MP94

**Provenance marks on generated images, audio and documents**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: Audio and exported files are not stated The Article 50 screen says generated images and video carry a provenance claim, but audio and exported files are not stated.
- Evidence: app/legal/article-50.tsx:113

## CMP-VP17

**Generate and edit images from the chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md), [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md), [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md), [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Detail: The chat shows no image preview and takes no reference image The agent has a generate_image tool on eligible paid plans and saves the file in the workspace, but the chat shows no image preview and takes no reference image.
- Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:1222; apps/cli/src/agent/mod.rs:1027-1034

## CMP-W106

**GIF output from image generation**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Detail: No GIF output. Searched gif in image options.
- Evidence: searched: gif in apps/web/features/chat/lib/imageGenerationOptions.ts

## CMP-W107

**Image templates (poster, logo) to fill in**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No image template picker exists.
- Evidence: searched: image template in apps/web/features, apps/web/app/chat/images

## CMP-W108

**Images with thinking and sketch input**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No reasoning-assisted image mode or sketch input exists.
- Evidence: searched: sketch, image thinking in apps/web/features/chat

## CMP-W111

**Provenance metadata on generated images and a verify page**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: No provenance metadata or checker was found.
- Evidence: searched: c2pa, content credentials in apps/web, packages/ui/unified-chat

## CMP-W268

**Admin permission to use image generation**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: The workspace feature list has no image generation switch.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:38-53

## CMP-W286

**Saved reference photos reused with @name**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No saved reference photos or @name mention exist for images.
- Evidence: searched: reference photo, @name in apps/web, unified-chat

## CMP-W306

**Matching uploaded images against known child-abuse image hashes, with reporting**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: Only a text classifier looks for such requests; no image hash matching or reporting pipeline was found.
- Evidence: apps/web/lib/moderation/text-classifier.ts:125; searched apps/web (app, features, lib, shared) and packages (ui, contracts, client), tests excluded: csam, ncmec, perceptual hash, photodna

## CMP-WP87

**Image generation**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md), [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md), [F044-06](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md), [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md), [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Detail: Paid plans generate images; Free uses a limited free-media model where offered Paid plans generate images; Free uses a limited free-media model where offered.
- Evidence: packages/contracts/types/src/model-catalog.ts:1250,1275; apps/web/features/chat/lib/free-media-choice.ts:9-32

## CMP-WP90

**Saved @name image references**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: They are not saved by name Reference images can be attached to one request; they are not saved by name.
- Evidence: apps/web/features/chat/lib/imageGenerationOptions.ts:145,153,182

## GAP-AREA044-LW04

**Composer contains a free-quota media path (limited image offer, free-quota media selection), while the server refuses accounts with no subscription and the plan table excludes free plans. The two do not obviously agree.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-044
- Detail: Area 44. Image-generation studio
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1304, 1506-1508; apps/web/app/api/media/image/lib/managed-image-generation.ts:157-171; packages/contracts/types/src/billing-catalog.ts:356

## GAP-AREA044-LW05

**Mobile flag comment says image generation is 'not available in v1' but the flag is set to true, so the guard text contradicts the value.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-044
- Detail: Area 44. Image-generation studio
- Evidence: apps/mobile/src/features/image/services/imagegen.ts:52; apps/mobile/lib/v1FeatureFlags.ts:26

## GAP-AREA044-LW06

**Server stores a style field and a transparency field for every request, but the style preset is only added as prompt text in the web composer. Whether the server uses the style field was not established.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-044
- Detail: Area 44. Image-generation studio
- Evidence: packages/contracts/cloud-contracts/src/managed-media.ts (style field); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6350

## GAP-CAP-images-and-video-09

**Text-to-image generation: Free web shows 'Free image availability could not be checked' with no upgrade or retry that works; at the credit limit an image send fails silently; Chrome has no image mode.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md), [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md), [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Requirement items: S44.01, S44.02, S44.07, S44.11, S44.18, S44.19
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-10

**Generation options: aspect ratio, transparency, style, size, quality, count: Style presets: decisions/wire-or-cut.md cut a desktop gallery and preset picker with no production path, while web has presets; the 2026-11-13 decision lists image style templates as not built. Prompt suggestions, prompt en**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md), [F044-04](../../20-features/044-image-generation-studio/F044-04-prompt-help.md), [F044-05](../../20-features/044-image-generation-studio/F044-05-repeatable-results-seed-and-negative-prompt.md)
- Requirement items: S44.03, S44.05, S44.06, S44.07, S44.08, S44.09, S44.10, S44.11, S44.12
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-11

**Reference images and saved named references: No @name saving on web; mobile partial; no brand or avatar references.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Requirement items: S43.17, S44.04, S45.22, S45.34, S45.35
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-14

**Images library, save, copy, share and delete: Owner decision text from 2026-11-13 contradicts the existing web Images page; favourites and share link missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-09](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md), [F044-10](../../20-features/044-image-generation-studio/F044-10-viewer-and-details.md), [F044-11](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Requirement items: S44.21, S44.22, S44.26, S44.27, S44.28, S44.29, S44.30, S44.31
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-15

**Image templates, sketch to image and prompt sharing: Whole group absent; one owner decision against templates.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Requirement items: S44.32, S45.36, S45.37
- Detail: Claude no, ChatGPT yes; AGI off by decision

## GAP-CAP-images-and-video-16

**Provenance marks on generated images: Ledger and comparison disagree on machine-readable marks. Code wins: the comparison searched for c2pa and content credentials and found none.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Requirement items: S44.36
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-17

**Safety, reporting and age rules for images: No image hash pipeline; no workspace switch for image generation.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Requirement items: S44.35
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-18

**Image generation usage limits and cost display: Free path fails with a retry notice and a credit-limit send fails silently, both seen in the browser.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-06](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md), [F046-02](../../20-features/046-video-generation-studio/F046-02-cost-estimate.md)
- Requirement items: S44.14, S44.15, S46.27
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-21

**Animate an image: GIF and image-to-video: Not built.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F046-06](../../20-features/046-video-generation-studio/F046-06-start-from-an-image-or-video.md)
- Requirement items: S44.34, S46.02
- Detail: Claude no, ChatGPT yes; AGI not built

## GAP-CAP-images-and-video-25

**Images in the coding tools: VS Code chat surface for generated images partial; CLI has no inline image preview.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-01](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md), [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Requirement items: S43.01, S44.01
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F044-01-01

**Only the first image of a multi-image result is shown on Web, Desktop and Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Render all returned images or document that clients always request one.
- Evidence: apps/web/lib/hooks/useMediaGeneration.ts:535-537; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:329

## GAP-F044-01-02

**No local on-device image generation, though local inference is required to be free of subscriptions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Detail: Affects: Mobile, Desktop, CLI. Work needed: Decide whether a local image model is in scope; if so build the path and entitlement rules.
- Evidence: apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:252; apps/cli/src/cloud/image.rs:833-835

## GAP-F044-01-03

**No own-key (BYOK) image path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Detail: Affects: CLI and all apps. Work needed: Decide the own-key image design and its explicit consent.
- Evidence: apps/cli/src/cloud/image.rs:833-835; managed-image-generation.ts:791-802

## GAP-F044-01-04

**Chrome extension has no image mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Detail: Affects: Chrome extension. Work needed: Add image mode or record it as out of scope.
- Evidence: brief S44.01; docs/product/surface-feature-matrix.md:309

## GAP-F044-01-05

**Tauri media_generate_image lacks an Idempotency-Key header.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Detail: Affects: Internal Tauri desktop build. Work needed: Add the header or retire the command; then run it to confirm.
- Evidence: apps/desktop/src-tauri/src/sys/commands/media.rs:258-285 vs managed-image-generation.ts:709-717

## GAP-F044-01-NOTBUILT

**Make an image from a prompt: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F044-01](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Requirement items: S44.01, S44.02
- Detail: Chrome: S44.01, S44.02

## GAP-F044-02-01

**Size, quality and count are not offered on Web, Desktop or Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add controls from the model's published limits, or mark them out of scope.
- Evidence: brief S44.08-S44.10 (cli done only); ChatComposerNew.tsx:3762-3770

## GAP-F044-02-02

**Style preset missing on Mobile and CLI; on Web it is only text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Detail: Affects: Mobile, CLI. Work needed: Share the preset list and add a picker.
- Evidence: brief S44.03

## GAP-F044-02-03

**style field accepted but not applied; quality ignored by the Google adapter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Detail: Affects: All clients that send them. Work needed: Apply or remove, and document per-model support.
- Evidence: image-generation-provider.ts:570,873

## GAP-F044-02-04

**Web ratio picker omits four ratios the server accepts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Detail: Affects: Web, Desktop. Work needed: Decide whether to expose or document the omission.
- Evidence: imageGenerationOptions.ts:48-92 vs managed-media.ts:19-35

## GAP-F044-02-05

**Chrome extension has none of these settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Detail: Affects: Chrome extension. Work needed: Follows the decision on an image mode there.
- Evidence: brief S44.03-S44.11

## GAP-F044-02-NOTBUILT

**Image settings: style, shape and count: not built on Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, Chrome
- Features: [F044-02](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Requirement items: S44.03, S44.07, S44.11
- Detail: Mobile: S44.03; CLI: S44.03; Chrome: S44.03, S44.07, S44.11

## GAP-F044-03-01

**CLI cannot attach a source or references.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md)
- Detail: Affects: CLI. Work needed: Add flags or record as out of scope.
- Evidence: apps/cli/src/lib.rs:1110-1172; brief S44.04 and S44.33

## GAP-F044-03-02

**Chrome extension has no edit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md)
- Detail: Affects: Chrome extension. Work needed: Follows the image-mode decision.
- Evidence: brief

## GAP-F044-03-03

**Edit-capable models are limited to one image API.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md)
- Detail: Affects: All edit users. Work needed: Add edit adapters for other image APIs if the product needs them.
- Evidence: managed-media.ts:69

## GAP-F044-03-04

**Mobile edit retry survives only 3 turns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md)
- Detail: Affects: Mobile. Work needed: Store inputs durably or accept and document the limit.
- Evidence: runImageGenerationTurn.ts:164-181

## GAP-F044-03-05

**Web composer cannot author an outpaint.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md)
- Detail: Affects: Web, Desktop. Work needed: Design a canvas and mask tool or keep card-only reframe.
- Evidence: ChatComposerNew.tsx:276-281

## GAP-F044-03-NOTBUILT

**Reference images and edits: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md)
- Requirement items: S44.04, S44.33
- Detail: CLI: S44.04, S44.33; Chrome: S44.04, S44.33

## GAP-F044-04-01

**No prompt suggestions in image mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-04](../../20-features/044-image-generation-studio/F044-04-prompt-help.md)
- Detail: Affects: Web, Desktop, Mobile, CLI, Chrome. Work needed: Design, build and test a suggestion list per app.
- Evidence: brief S44.05 status all missing

## GAP-F044-04-02

**No prompt enhancement with user control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-04](../../20-features/044-image-generation-studio/F044-04-prompt-help.md)
- Detail: Affects: Web, Desktop, CLI, Chrome (and Mobile by code search). Work needed: Design a review step, choose the model route per mode, and enforce consent.
- Evidence: brief S44.06

## GAP-F044-04-03

**Brief lists no Mobile status for S44.06.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-04](../../20-features/044-image-generation-studio/F044-04-prompt-help.md)
- Detail: Affects: Mobile. Work needed: Record the Mobile status.
- Evidence: brief S44.06 line has web, desktop, cli, chrome only

## GAP-F044-04-NOTBUILT

**Prompt help: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F044-04](../../20-features/044-image-generation-studio/F044-04-prompt-help.md)
- Requirement items: S44.05, S44.06
- Detail: Web: S44.05, S44.06; Desktop: S44.05, S44.06; Mobile: S44.05; CLI: S44.05, S44.06; Chrome: S44.05, S44.06

## GAP-F044-05-01

**No seed support anywhere (schema, server, UI).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-05](../../20-features/044-image-generation-studio/F044-05-repeatable-results-seed-and-negative-prompt.md)
- Detail: Affects: All apps. Work needed: Decide scope; then add schema field, per-model support flag, adapter wiring, UI and tests.
- Evidence: brief S44.12; managed-media.ts:89-118

## GAP-F044-05-02

**Negative prompt exists on the server for one API but no client sends it, and the brief calls it not applicable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-05](../../20-features/044-image-generation-studio/F044-05-repeatable-results-seed-and-negative-prompt.md)
- Detail: Affects: All apps; dead server path. Work needed: Either add UI gated on per-model support or remove the unused path.
- Evidence: managed-media.ts:100; brief S44.13; media_tools.rs:47-55

## GAP-F044-05-03

**Models that ignore a negative prompt do not say so.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-05](../../20-features/044-image-generation-studio/F044-05-repeatable-results-seed-and-negative-prompt.md)
- Detail: Affects: Any future UI. Work needed: Publish support in the availability payload.
- Evidence: image-generation-provider.ts:456-545

## GAP-F044-05-NOTBUILT

**Repeatable results: seed and negative prompt: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F044-05](../../20-features/044-image-generation-studio/F044-05-repeatable-results-seed-and-negative-prompt.md)
- Requirement items: S44.12
- Detail: Web: S44.12; Desktop: S44.12; Mobile: S44.12; CLI: S44.12; Chrome: S44.12

## GAP-F044-06-01

**No cost indication on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-06](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md)
- Detail: Affects: Web, Desktop, Mobile, CLI, Chrome. Work needed: Decide policy, return settled cost, display it, test it.
- Evidence: brief S44.14; managed-image-generation.ts:949-969 returns no cost

## GAP-F044-06-02

**No remaining-allowance display; image monthly quota is null on every plan.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-06](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md)
- Detail: Affects: All apps. Work needed: Define whether an image allowance exists in the subscription system, then display it.
- Evidence: model-catalog.ts:1292,1338,1389; brief S44.15

## GAP-F044-06-03

**Mobile type declares cost_estimate that the server never returns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-06](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md)
- Detail: Affects: Mobile. Work needed: Remove the field or populate it.
- Evidence: imagegen.ts:25 vs managed-image-generation.ts:949-969

## GAP-F044-06-04

**Brief marks S44.14 and S44.15 'not applicable' while the Should lines describe user-facing needs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-06](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md)
- Detail: Affects: Planning. Work needed: Owner to confirm the intended status.
- Evidence: brief S44.14, S44.15

## GAP-F044-07-01

**Cancel of an in-flight attempt completes and charges the image, while the brief says cancelled means not billed further.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Detail: Affects: Web, Mobile, CLI, Desktop users who stop late. Work needed: Decide the rule, then either release on cancel after the provider call or change the copy; add a test for the live-claim cancel.
- Evidence: apps/web/app/api/media/image/lib/image-job-executor.ts:210-213 and 576-860 (no cancel check); apps/web/lib/server/image-generation-jobs.ts:450-480

## GAP-F044-07-02

**Web stop message never tells the person the image may still finish.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Detail: Affects: Web and Desktop. Work needed: Use the cancel snapshot status (202) to show the CLI/Mobile style note.
- Evidence: apps/web/lib/hooks/useMediaGeneration.ts:140

## GAP-F044-07-03

**Mobile chat Retry creates a new generation instead of retrying the job.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Detail: Affects: Mobile. Work needed: Call the retry endpoint with the stored job id; keep the edit fallback.
- Evidence: apps/mobile/app/(app)/chat/[id].tsx:1965-1980

## GAP-F044-07-04

**No partial previews anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Detail: Affects: All apps. Work needed: Needs provider streaming support and a preview field in the job snapshot contract; do not promise it until a model supports it.
- Evidence: apps/web/lib/server/media-job-history.ts:129

## GAP-F044-07-05

**No queue-ahead of several prompts, and the Generations list is Library-only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Detail: Affects: Web, Mobile, Desktop. Work needed: Product decision; the brief marks S44.16 not applicable.
- Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:974

## GAP-F044-07-06

**Chrome extension has no stop or retry for images.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Detail: Affects: Chrome. Work needed: Confirm whether the extension can start images at all (migration 0366 says it can) and add the controls.
- Evidence: apps/extension/src/side_panel.ts

## GAP-F044-07-NOTBUILT

**Progress, cancel and retry: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F044-07](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Requirement items: S44.17, S44.18, S44.19
- Detail: Web: S44.17; Desktop: S44.17; Mobile: S44.17; CLI: S44.17; Chrome: S44.17, S44.18, S44.19

## GAP-F044-08-01

**No share-prompt recipe action anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)
- Detail: Affects: All apps. Work needed: Define the recipe format and add a copy or share action.
- Evidence: No symbol found; brief S44.32 status missing everywhere

## GAP-F044-08-02

**No image-to-video action from a generated image.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add an Animate action that opens video mode with the image as first frame.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3887 is composer-only

## GAP-F044-08-03

**Brief says Mobile has no variation or reuse prompt; code has both in the viewer sheet and Library Remix. The brief is out of date.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)
- Detail: Affects: Documentation and testers. Work needed: Correct the brief rows S44.20, S44.24.
- Evidence: apps/mobile/src/features/image/components/ImageChangeSheet.tsx:211; apps/mobile/src/features/library/index.tsx:630

## GAP-F044-08-04

**CLI cannot make a variation of an image.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)
- Detail: Affects: CLI. Work needed: Add a source-image option to the CLI request.
- Evidence: apps/cli/src/cloud/image.rs:41-56

## GAP-F044-08-05

**Reused settings omit quality and size on Web and Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)
- Detail: Affects: Web, Mobile. Work needed: Store quality and size on the job or asset and carry them.
- Evidence: apps/web/features/library/lib/library-chat-handoff.ts:87

## GAP-F044-08-NOTBUILT

**Variations, remix and reuse: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)
- Requirement items: S44.20, S44.24, S44.25, S44.32, S44.34
- Detail: Web: S44.32, S44.34; Desktop: S44.32, S44.34; Mobile: S44.20, S44.24, S44.32, S44.34; CLI: S44.20, S44.32; Chrome: S44.20, S44.24, S44.25, S44.32, S44.34

## GAP-F044-09-01

**No favorites.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-09](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Detail: Affects: All apps. Work needed: Flag column, API and filter.
- Evidence: No symbol; brief S44.26

## GAP-F044-09-02

**No Add to Project on Mobile or CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-09](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Detail: Affects: Mobile, CLI. Work needed: Mobile action and a project knowledge upload call.
- Evidence: apps/mobile/src/features/library/index.tsx:620-655

## GAP-F044-09-03

**Library items carry no size or quality.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-09](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Detail: Affects: Web, Mobile. Work needed: Persist width, height and quality on media_assets.
- Evidence: apps/web/app/api/library/route.ts:60-85

## GAP-F044-09-04

**Dev deployments return an unsaved inline image when storage is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-09](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Detail: Affects: Local development only. Work needed: None for production; note for testers.
- Evidence: apps/web/app/api/media/image/lib/image-job-executor.ts:445-453

## GAP-F044-09-NOTBUILT

**Library: grid and save: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F044-09](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Requirement items: S44.21, S44.26, S44.27, S44.28
- Detail: Web: S44.26; Desktop: S44.26; Mobile: S44.26, S44.28; CLI: S44.26, S44.28; Chrome: S44.21, S44.26, S44.27, S44.28

## GAP-F044-10-01

**Web has no prompt and settings details view; size and quality are not shown on Web or Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-10](../../20-features/044-image-generation-studio/F044-10-viewer-and-details.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Persist and show full settings in a details panel; brief marks Web and Mobile built, which overstates this.
- Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:1157-1162

## GAP-F044-10-02

**CLI opens the system viewer, and only for this terminal session.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-10](../../20-features/044-image-generation-studio/F044-10-viewer-and-details.md)
- Detail: Affects: CLI. Work needed: Offer `agi library show` for images or an inline terminal preview.
- Evidence: apps/cli/src/tui/tui_app.rs:5596-5611

## GAP-F044-10-03

**Web Library viewer hides model and ratio.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-10](../../20-features/044-image-generation-studio/F044-10-viewer-and-details.md)
- Detail: Affects: Web, Desktop. Work needed: Show provider, model and ratio from the item.
- Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1212-1300

## GAP-F044-10-04

**Chrome extension has no viewer for generated images.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-10](../../20-features/044-image-generation-studio/F044-10-viewer-and-details.md)
- Detail: Affects: Chrome. Work needed: Confirm scope, then add.
- Evidence: apps/extension/src/side_panel.ts

## GAP-F044-10-NOTBUILT

**Viewer and details: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F044-10](../../20-features/044-image-generation-studio/F044-10-viewer-and-details.md)
- Requirement items: S44.22, S44.23
- Detail: Chrome: S44.22, S44.23

## GAP-F044-11-01

**Web and Desktop have no system share of the image file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-11](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Detail: Affects: Web, Desktop, CLI. Work needed: Use the Web Share API for files; CLI could print a share path or hand to an OS share.
- Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:254-360

## GAP-F044-11-02

**Web Copy likely loses the embedded AI claim for non-PNG images.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-11](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Detail: Affects: Web, Desktop. Work needed: Test, then copy original bytes when the browser accepts the type.
- Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:125-148

## GAP-F044-11-03

**CLI cannot copy to the clipboard.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-11](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Detail: Affects: CLI. Work needed: Optional; low priority.
- Evidence: no clipboard code in apps/cli/src/cloud/image.rs

## GAP-F044-11-04

**Brief says Share is Mobile only, but Web has a Share dialog that only copies a workspace link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-11](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Detail: Affects: Documentation, Web users. Work needed: Update the brief and make the dialog's limits clear.
- Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:254

## GAP-F044-11-NOTBUILT

**Save, download, copy and share: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F044-11](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Requirement items: S44.29, S44.30
- Detail: CLI: S44.30; Chrome: S44.29, S44.30

## GAP-F044-12-01

**No visible 'AI-generated' label in the Web, Desktop or Mobile UI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add a visible mark to the card and viewer; the brief marks these apps done for the machine-readable part only.
- Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:1160; apps/mobile/src/features/image/imageSettingsCaption.ts:7

## GAP-F044-12-02

**Web report does not identify the image and fixes the category to harmful.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: Affects: Web, Desktop. Work needed: Send the asset reference and let the person pick a category, as Mobile does.
- Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:1176-1184

## GAP-F044-12-03

**Claim is unsigned.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: Affects: All apps. Work needed: Decide whether signing is required; verify what the web claim carries (not opened).
- Evidence: apps/cli/src/cloud/image_provenance.rs:31

## GAP-F044-12-04

**CLI has no report action.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: Affects: CLI. Work needed: Add a report command that posts to the same intake.
- Evidence: no report command found in apps/cli/src/lib.rs

## GAP-F044-12-05

**Chrome extension has no safety or label code for images.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Detail: Affects: Chrome. Work needed: Check the server-side chat tool path with the chrome surface and add the controls.
- Evidence: apps/extension/src/side_panel.ts

## GAP-F044-12-NOTBUILT

**Safety, reporting and AI labels: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F044-12](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Requirement items: S44.35, S44.36
- Detail: CLI: S44.35; Chrome: S44.35, S44.36
