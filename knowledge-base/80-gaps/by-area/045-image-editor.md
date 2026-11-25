---
id: "GAPS-AREA-045"
type: "gap-list"
title: "Gaps: Image editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 45. Image editor

85 open gaps that touch this area. Area page: [20-features/045-image-editor](../../20-features/045-image-editor/README.md).

## CMP-D20

**Comment on parts of one or several images and send them with edit instructions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md), [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: The image edit panel takes a text request only; you cannot pin comments on an image area or select several images.
- Evidence: searched: imageComment, annotate, canvas comment in apps/web/features/chat/components

## CMP-DP23

**Generated image viewer with Focused and Canvas views and version choice**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md), [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: There is no grid of all chat images and no version picker Clicking an image opens a lightbox with previous, next, zoom and download; there is no grid of all chat images and no version picker.
- Evidence: apps/web/features/chat/components/ImageLightbox.tsx:5

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

## CMP-MP35

**Resize and remove controls on a generated image**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md), [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: There is no remove control Area edit and aspect-ratio reshape exist; there is no remove control.
- Evidence: apps/mobile/src/features/image/components/ImageChangeSheet.tsx:97,237; ImageAreaEditor.tsx

## CMP-MP36

**Saved reference images for later requests**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: Named saved references are not shown The Images page lets you attach reference photos to a request; named saved references are not shown.
- Evidence: apps/mobile/src/features/image/ImagesScreen.tsx:222 useImageReferences; searched: @name references in apps/mobile/src/features/image

## CMP-W105

**Comment on a generated image and share its prompt**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md), [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: The image card copies, downloads, shares and edits a region; it has no comments and no share or copy of the prompt.
- Evidence: searched: comment in apps/web/features/chat/components/ImageGenerationCard.tsx, ImageLightbox.tsx; Copy prompt, sharePrompt in apps/web/features, packages/ui/unified-chat/src

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

## CMP-W286

**Saved reference photos reused with @name**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: No saved reference photos or @name mention exist for images.
- Evidence: searched: reference photo, @name in apps/web, unified-chat

## CMP-WP86

**Image editor: undo and redo selections and regenerate in another aspect ratio**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F045-01](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md), [F045-02](../../20-features/045-image-editor/F045-02-remix-an-earlier-image.md), [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md), [F045-04](../../20-features/045-image-editor/F045-04-click-a-spot-to-comment.md), [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md), [F045-06](../../20-features/045-image-editor/F045-06-extend-and-reframe.md), [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md), [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: The editor has no undo or redo A region can be selected and edited and the aspect ratio is chosen per request, but the editor has no undo or redo.
- Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:706-708; searched: undo, redo in apps/web/features/media, apps/web/features/chat/components/ImageGenerationCard.tsx

## CMP-WP90

**Saved @name image references**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: They are not saved by name Reference images can be attached to one request; they are not saved by name.
- Evidence: apps/web/features/chat/lib/imageGenerationOptions.ts:145,153,182

## GAP-AREA045-LW05

**Mobile mask path is dormant: the runner can send a mask, but no mobile caller sets maskImageBase64.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-045
- Detail: Area 45. Image editor
- Evidence: apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:54, :214, :314-315

## GAP-AREA045-LW06

**Every edit operation (edit, variation, inpaint, outpaint) goes to the same provider edit endpoint; the operation only changes the label on the returned model name. The server does not send different instructions per operation.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-045
- Detail: Area 45. Image editor
- Evidence: apps/web/app/api/media/image/lib/image-generation-provider.ts:462-530 (model label at :528)

## GAP-AREA045-LW08

**Brush size is a fixed 5 percent of image width (minimum 8 pixels) with no control, no eraser and no undo, so brush and eraser items are missing.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-045
- Detail: Area 45. Image editor
- Evidence: apps/web/features/chat/components/RegionSelector.tsx:5, :37

## GAP-AREA045-LW09

**The Variation operation sends the source image with no mask and the same prompt, and it is labelled as a variation; the composer's Variation option is only offered when an image is attached.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-045
- Detail: Area 45. Image editor
- Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:549-572

## GAP-CAP-images-and-video-11

**Reference images and saved named references: No @name saving on web; mobile partial; no brand or avatar references.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F043-06](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md), [F044-03](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md), [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Requirement items: S43.17, S44.04, S45.22, S45.34, S45.35
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-12

**Edit an image by describing the change or selecting a region: A person saw the edit change unrelated shapes. No brush, eraser, overlay, click-to-comment, crop, resize, invert or multi-image combine. Marked Same in comparison but failed the unchanged-parts check in the browser.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F045-01](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md), [F045-02](../../20-features/045-image-editor/F045-02-remix-an-earlier-image.md), [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md), [F045-04](../../20-features/045-image-editor/F045-04-click-a-spot-to-comment.md), [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md), [F045-06](../../20-features/045-image-editor/F045-06-extend-and-reframe.md), [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Requirement items: S45.01, S45.02, S45.03, S45.04, S45.05, S45.06, S45.09, S45.15, S45.16, S45.19, S45.31
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-13

**Image editor tools: undo, redo, versions, comments, canvas: Missing undo, redo, before/after, Canvas view with comments, crop, resize, export format.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md), [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Requirement items: S45.17, S45.18, S45.28, S45.29, S45.30, S45.32
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-images-and-video-15

**Image templates, sketch to image and prompt sharing: Whole group absent; one owner decision against templates.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F044-08](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md), [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Requirement items: S44.32, S45.36, S45.37
- Detail: Claude no, ChatGPT yes; AGI off by decision

## GAP-F045-01-01

**The brief says Desktop is done but desktop edit lives only in the hosted web app; the retained Tauri client generates only from a prompt.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-01](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md)
- Detail: Affects: Desktop. Work needed: Record desktop as 'hosted web' in the matrix; no code work if Tauri stays internal.
- Evidence: apps/desktop/src/api/cloudApi.ts:457-480; apps/desktop/electron/main.ts:1065

## GAP-F045-01-02

**CLI and Chrome cannot edit an existing picture.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-01](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md)
- Detail: Affects: CLI, Chrome extension. Work needed: Add a source-image option to the CLI command; design a Chrome entry.
- Evidence: apps/cli/src/lib.rs:1110-1135; docs/product/surface-feature-matrix.md:306-309

## GAP-F045-01-03

**Mobile attach path has no operation choice; Variation and mask exist only in the viewer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-01](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md)
- Detail: Affects: Mobile. Work needed: Decide whether to expose Variation at attach time.
- Evidence: resolveMobileImageGenerationRequest.ts:286; ImageFullScreen.tsx:641-647

## GAP-F045-01-04

**The brief's code references for route.ts:591 and similar are out of date.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-01](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief's code column.
- Evidence: apps/web/app/api/media/image/generate/route.ts has 128 lines

## GAP-F045-01-05

**Web composer can send the mask file as a guide image if the person switches back to Edit after painting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-01](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md)
- Detail: Affects: Web, Desktop. Work needed: Drop the mask attachment when the operation leaves Mask edit, or confirm intended.
- Evidence: ChatComposerNew.tsx:3777

## GAP-F045-01-NOTBUILT

**Attach a photo and describe a change: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F045-01](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md)
- Requirement items: S45.01, S45.03
- Detail: CLI: S45.01, S45.03; Chrome: S45.01, S45.03

## GAP-F045-02-01

**The brief marks mobile Remix missing but code has a Remix action.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-02](../../20-features/045-image-editor/F045-02-remix-an-earlier-image.md)
- Detail: Affects: Mobile. Work needed: Update the brief and run it on a device.
- Evidence: apps/mobile/src/features/library/index.tsx:545-560, 630

## GAP-F045-02-02

**Desktop marked done only through the hosted web app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-02](../../20-features/045-image-editor/F045-02-remix-an-earlier-image.md)
- Detail: Affects: Desktop. Work needed: None in code; verify in the Electron window.
- Evidence: apps/desktop/electron/main.ts:1065

## GAP-F045-02-03

**CLI and Chrome have no remix.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-02](../../20-features/045-image-editor/F045-02-remix-an-earlier-image.md)
- Detail: Affects: CLI, Chrome. Work needed: Decide scope.
- Evidence: apps/cli/src/cloud/image.rs has no image-source option

## GAP-F045-02-04

**The web card button reads 'New version', not Edit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-02](../../20-features/045-image-editor/F045-02-remix-an-earlier-image.md)
- Detail: Affects: Web docs. Work needed: Use the real label in user docs.
- Evidence: ImageGenerationCard.tsx:1036

## GAP-F045-02-NOTBUILT

**Remix an earlier image: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F045-02](../../20-features/045-image-editor/F045-02-remix-an-earlier-image.md)
- Requirement items: S45.02
- Detail: CLI: S45.02; Chrome: S45.02

## GAP-F045-03-01

**Brief says web brush selection and overlay are missing, but the code has a brush and a tint.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Detail: Affects: Web, Desktop. Work needed: Correct the brief; add brush-size control.
- Evidence: RegionSelector.tsx:37, 111

## GAP-F045-03-02

**Brief says mobile has no painting; code has full painting with undo, redo, clear and size.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Detail: Affects: Mobile. Work needed: Correct the brief; add device verification.
- Evidence: ImageAreaEditor.tsx; ImageFullScreen.tsx:647

## GAP-F045-03-03

**Eraser and invert are missing everywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Design and build both.
- Evidence: no eraser or invert in RegionSelector.tsx or ImageAreaEditor.tsx

## GAP-F045-03-04

**No test covers the mask checks in edit-mask.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Detail: Affects: Web, Desktop. Work needed: Add server unit tests.
- Evidence: grep found no test naming editMaskProblem or invalid_mask_image

## GAP-F045-03-05

**No test for the web RegionSelector itself (the desktop screen-capture RegionSelector test is a different component).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Detail: Affects: Web. Work needed: Add a component test.
- Evidence: apps/desktop/src/features/screen-capture/RegionSelector.test.tsx is separate

## GAP-F045-03-06

**Mask is a hint; nearby content can change.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Detail: Affects: All. Work needed: Consider a post-edit blend that keeps unmasked pixels.
- Evidence: ImageGenerationCard.tsx:730

## GAP-F045-03-NOTBUILT

**Paint the area to change (mask and selection): not built on Web, Desktop, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F045-03](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Requirement items: S45.05, S45.06, S45.07, S45.08, S45.09, S45.10, S45.11
- Detail: Web: S45.06, S45.07, S45.08, S45.09, S45.11; Desktop: S45.06, S45.07, S45.08, S45.09, S45.11; Chrome: S45.05, S45.06, S45.07, S45.08, S45.09, S45.10, S45.11

## GAP-F045-04-01

**Click-to-comment is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-04](../../20-features/045-image-editor/F045-04-click-a-spot-to-comment.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome (CLI not applicable). Work needed: Product decision first; then design, contract change or mask-based approach, UI and tests.
- Evidence: doc: knowledge-base/data/area-briefs/045-image-editor.md S45.04; no code found

## GAP-F045-04-NOTBUILT

**Click a spot to comment: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F045-04](../../20-features/045-image-editor/F045-04-click-a-spot-to-comment.md)
- Requirement items: S45.04
- Detail: Web: S45.04; Desktop: S45.04; Mobile: S45.04; Chrome: S45.04

## GAP-F045-05-01

**The code never verifies output transparency.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md)
- Detail: Affects: All apps. Work needed: Add a result check and a warning.
- Evidence: pngHasAlpha used only in edit-mask.ts

## GAP-F045-05-02

**Panel 'New version' drops the transparency option.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md)
- Detail: Affects: Web, Desktop. Work needed: Decide and implement.
- Evidence: ImageGenerationCard.tsx:449-466; WebChatPage.tsx:3410-3414

## GAP-F045-05-03

**The brief calls this background removal; the code is an option on generation or edit, not a removal tool.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md)
- Detail: Affects: All. Work needed: Rename in the brief or build a dedicated tool.
- Evidence: image-generation-provider.ts:484, 544

## GAP-F045-05-04

**The brief says mobile missing; the code has a toggle.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md)
- Detail: Affects: Mobile. Work needed: Update the brief and test on a device.
- Evidence: AddToChatSheet.tsx:1034-1045

## GAP-F045-05-05

**Edit calls do not set a PNG output format.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md)
- Detail: Affects: Web, Mobile. Work needed: Confirm provider default or set it.
- Evidence: image-generation-provider.ts:484 versus 544

## GAP-F045-05-06

**Mobile reads .provider while web reads .imageApi for the same edit-support check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md)
- Detail: Affects: Mobile. Work needed: Use one helper.
- Evidence: resolveMobileImageGenerationRequest.ts:91 vs imageEditSupport.ts:7

## GAP-F045-05-NOTBUILT

**Transparent background: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F045-05](../../20-features/045-image-editor/F045-05-transparent-background.md)
- Requirement items: S45.15, S45.33
- Detail: Chrome: S45.15, S45.33

## GAP-F045-06-01

**Mobile has no true extend; 'Another shape' makes a new picture.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-06](../../20-features/045-image-editor/F045-06-extend-and-reframe.md)
- Detail: Affects: Mobile. Work needed: Build canvas and mask on device or accept the difference.
- Evidence: ImageChangeSheet.tsx:22; wholeImageEdit.ts:46-56

## GAP-F045-06-02

**Web always centres and only pads.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-06](../../20-features/045-image-editor/F045-06-extend-and-reframe.md)
- Detail: Affects: Web, Desktop. Work needed: Add placement and crop.
- Evidence: imageGenerationOptions.ts:268-274

## GAP-F045-06-03

**No test found for buildReframeEdit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-06](../../20-features/045-image-editor/F045-06-extend-and-reframe.md)
- Detail: Affects: Web. Work needed: Add unit tests.
- Evidence: no test file by name

## GAP-F045-06-04

**CLI and Chrome cannot reframe an existing picture.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-06](../../20-features/045-image-editor/F045-06-extend-and-reframe.md)
- Detail: Affects: CLI, Chrome. Work needed: Decide scope.
- Evidence: apps/cli/src/cloud/image.rs has no source option

## GAP-F045-06-05

**Brief marks crop and resize missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-06](../../20-features/045-image-editor/F045-06-extend-and-reframe.md)
- Detail: Affects: All. Work needed: Separate decision.
- Evidence: doc: knowledge-base/data/area-briefs/045-image-editor.md S45.17, S45.18

## GAP-F045-06-NOTBUILT

**Extend and reframe: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F045-06](../../20-features/045-image-editor/F045-06-extend-and-reframe.md)
- Requirement items: S45.16, S45.19
- Detail: CLI: S45.16, S45.19; Chrome: S45.16, S45.19

## GAP-F045-07-01

**No test found that sends reference images through the web composer or the generate route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md)
- Detail: Affects: Web and Desktop (hosted web). Work needed: Add composer and route tests for guide count and operation rules.
- Evidence: Search of apps/web tests for reference_images and referenceImagesBase64 found only video tests.

## GAP-F045-07-02

**Card edit panel cannot attach guides.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md)
- Detail: Affects: Web, Desktop. Work needed: Add guide attachment to the panel or document the limit.
- Evidence: ImageGenerationCard.tsx:450-466 builds source and mask only.

## GAP-F045-07-03

**Multi-image combination and pose/depth guidance have no code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md)
- Detail: Affects: All apps. Work needed: Product decision, then provider route and UI.
- Evidence: S45.23, S45.24 in the brief; no code found.

## GAP-F045-07-04

**CLI and Chrome cannot use references.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md)
- Detail: Affects: CLI, Chrome. Work needed: Add source and reference flags or mark not applicable.
- Evidence: Brief; apps/cli/src/cloud/image.rs has no source option found.

## GAP-F045-07-05

**Only one provider image API takes edits.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md)
- Detail: Affects: All apps. Work needed: Add another edit-capable route or state the limit in product copy.
- Evidence: managed-media.ts:62

## GAP-F045-07-06

**No Local or own-key route for references.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md)
- Detail: Affects: Mobile, Desktop. Work needed: Decision on local image models (see SYS-local-inference).
- Evidence: requires_cloud block; no local image path found.

## GAP-F045-07-NOTBUILT

**Reference images: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F045-07](../../20-features/045-image-editor/F045-07-reference-images.md)
- Requirement items: S45.22, S45.23, S45.24
- Detail: Web: S45.23, S45.24; Desktop: S45.23, S45.24; Mobile: S45.23, S45.24; CLI: S45.22, S45.23, S45.24; Chrome: S45.22, S45.23, S45.24

## GAP-F045-08-01

**No before/after comparison.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Design and build a compare view.
- Evidence: S45.28 missing in the brief; no slider code found.

## GAP-F045-08-02

**No undo or redo.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Detail: Affects: All apps. Work needed: Define state model on top of imageVersions.
- Evidence: S45.30 missing.

## GAP-F045-08-03

**Mobile never writes versions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Detail: Affects: Mobile. Work needed: Append previous image on revise or state the rule.
- Evidence: No write of imageVersions in apps/mobile.

## GAP-F045-08-04

**Brief says version history missing though a pager exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Detail: Affects: Documentation. Work needed: Update the brief status to partial.
- Evidence: S45.29 vs ImageGenerationCard.tsx:1132.

## GAP-F045-08-05

**No version-list or grid view; only stepwise paging.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Detail: Affects: Web, Mobile. Work needed: Optional list view.
- Evidence: Pager only.

## GAP-F045-08-06

**Web composer upload source not clearly preserved as a message attachment.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Detail: Affects: Web, Desktop. Work needed: Verify and, if absent, store the original.
- Evidence: composer sends base64 and clears state (ChatComposerNew.tsx:3786-3805).

## GAP-F045-08-NOTBUILT

**Keep the original and see earlier versions: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F045-08](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Requirement items: S45.28, S45.29, S45.30, S45.31
- Detail: Web: S45.28, S45.29, S45.30; Desktop: S45.28, S45.29, S45.30; Mobile: S45.28, S45.29, S45.30; CLI: S45.29, S45.30, S45.31; Chrome: S45.28, S45.29, S45.30, S45.31

## GAP-F045-09-01

**No crop tool.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: Affects: All apps. Work needed: Design crop UI and server or client crop.
- Evidence: S45.17

## GAP-F045-09-02

**No resize.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: Affects: All apps. Work needed: Pixel size input and resampling.
- Evidence: S45.18

## GAP-F045-09-03

**No export format choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: Affects: All apps. Work needed: Client conversion and menu.
- Evidence: S45.32; downloadImage keeps blob type

## GAP-F045-09-04

**Mobile save/export behaviour not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: Affects: Mobile. Work needed: Read and document.
- Evidence: viewerImageActions.ts not read

## GAP-F045-09-05

**Alpha-preservation under conversion would need care.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Detail: Affects: Web, Desktop. Work needed: Warn when converting to JPEG.
- Evidence: Transparent toggle at ChatComposerNew.tsx:6439

## GAP-F045-09-NOTBUILT

**Crop, resize and export format: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F045-09](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Requirement items: S45.17, S45.18, S45.32
- Detail: Web: S45.17, S45.18, S45.32; Desktop: S45.17, S45.18, S45.32; Mobile: S45.17, S45.18, S45.32; CLI: S45.17, S45.18, S45.32; Chrome: S45.17, S45.18, S45.32

## GAP-F045-10-01

**No saved brand or avatar reference library.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: Affects: All apps. Work needed: Storage, picker, entitlement and cross-app sync.
- Evidence: S45.34, S45.35

## GAP-F045-10-02

**No sticker-pack flow.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: Affects: All apps. Work needed: Batch generation, transparent output, pack UI.
- Evidence: S45.36

## GAP-F045-10-03

**No messaging-app export.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: Affects: All apps. Work needed: Current format research per app, then export.
- Evidence: S45.37

## GAP-F045-10-04

**Requires a decision on where saved references live (Library, Projects or memory).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Detail: Affects: Product. Work needed: Ownership decision per doc: AGENTS.md section 3.
- Evidence: No existing owner found

## GAP-F045-10-NOTBUILT

**Brand, avatar and sticker features: not built on Web, Desktop, Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, Chrome
- Features: [F045-10](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Requirement items: S45.34, S45.35, S45.36, S45.37
- Detail: Web: S45.34, S45.35, S45.36, S45.37; Desktop: S45.34, S45.35, S45.36, S45.37; Mobile: S45.34, S45.35, S45.36, S45.37; CLI: S45.34, S45.35, S45.36, S45.37; Chrome: S45.34, S45.35, S45.36, S45.37

## GAP-F045-11-01

**No guarantee or test that free-text edits perform object, background, lighting, style, text, restoration or colour work.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-11](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)
- Detail: Affects: All apps with image mode. Work needed: Decide whether to add evaluated prompts or dedicated controls.
- Evidence: No code path or tests for these operations.

## GAP-F045-11-02

**No guidance text telling people to describe such changes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-11](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)
- Detail: Affects: Web, Mobile. Work needed: Add help copy if wanted.
- Evidence: Hints in AddToChatSheet.tsx:994 and operation menu mention only edit, variation, mask edit.

## GAP-F045-11-03

**CLI and Chrome have no edit at all.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-11](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)
- Detail: Affects: CLI, Chrome. Work needed: Product decision.
- Evidence: apps/cli/src/cloud/image.rs; no image code in apps/extension

## GAP-F045-11-04

**Brief marks these as not applicable, so no tracking row exists to promote them if the product decides to offer them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F045-11](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)
- Detail: Affects: Planning. Work needed: Update the brief status if a decision is made.
- Evidence: Brief status 'not applicable anywhere'
