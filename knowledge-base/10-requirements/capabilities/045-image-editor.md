---
id: "REQ-AREA-045"
type: "requirements"
title: "Requirement items: Image editor"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 45. Image editor

37 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S45.01

**Upload an existing image.** User uploads an image of their own and it becomes the source image that an edit changes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F045-01 Attach a photo and describe a change](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md)
- Competitor trace: CAP-images-and-video-12

## S45.02

**Open a previously generated image.** User opens an image generated earlier (this chat or an older one) into an editing state where changes apply to it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-02 Remix an earlier image](../../20-features/045-image-editor/F045-02-remix-an-earlier-image.md)
- Competitor trace: CAP-images-and-video-12

## S45.03

**Conversational edit instruction.** User types a natural-language change for an image and the image itself is edited accordingly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F045-01 Attach a photo and describe a change](../../20-features/045-image-editor/F045-01-attach-a-photo-and-describe-a-change.md)
- Competitor trace: CAP-images-and-video-12

## S45.04

**Click-to-comment editing.** User clicks a spot on the image, leaves a comment there, and the edit targets that spot.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F045-04 Click a spot to comment](../../20-features/045-image-editor/F045-04-click-a-spot-to-comment.md)
- Competitor trace: CAP-images-and-video-12

## S45.05

**Region-selection tool.** User selects a region of the image in the product and only that region is edited.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome missing
- Feature: [F045-03 Paint the area to change (mask and selection)](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Competitor trace: CAP-images-and-video-12

## S45.06

**Brush selection.** User paints the area to change with a brush on the image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F045-03 Paint the area to change (mask and selection)](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Competitor trace: CAP-images-and-video-12

## S45.07

**Eraser.** User erases part of a painted selection with an eraser tool.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F045-03 Paint the area to change (mask and selection)](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)

## S45.08

**Brush-size control.** User changes the brush size used for painting a selection.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F045-03 Paint the area to change (mask and selection)](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)

## S45.09

**Selection overlay.** The selected or masked area is shown as an overlay on the image before the edit is sent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F045-03 Paint the area to change (mask and selection)](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)
- Competitor trace: CAP-images-and-video-12

## S45.10

**Clear selection.** User clears the current selection or mask in one action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome missing
- Feature: [F045-03 Paint the area to change (mask and selection)](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)

## S45.11

**Invert selection where offered.** User inverts the current selection so everything else is edited.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F045-03 Paint the area to change (mask and selection)](../../20-features/045-image-editor/F045-03-paint-the-area-to-change-mask-and-selection.md)

## S45.12

**Object addition.** User adds a new object to an existing image while the rest is kept.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F045-11 Operations no app offers](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)

## S45.13

**Object removal.** User removes an object from an existing image while the rest is kept.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F045-11 Operations no app offers](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)

## S45.14

**Background replacement.** User replaces the background of an existing image while the subject is kept.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F045-11 Operations no app offers](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)

## S45.15

**Background removal.** User removes the background of an image and gets the subject on a transparent background.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-05 Transparent background](../../20-features/045-image-editor/F045-05-transparent-background.md)
- Competitor trace: CAP-images-and-video-12

## S45.16

**Outpainting.** User extends an image beyond its borders (outpainting) and the new area is generated to match.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-06 Extend and reframe](../../20-features/045-image-editor/F045-06-extend-and-reframe.md)
- Competitor trace: CAP-images-and-video-12

## S45.17

**Crop.** User crops an image to a chosen area in the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-09 Crop, resize and export format](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Competitor trace: CAP-images-and-video-13

## S45.18

**Resize.** User resizes an existing image to new pixel dimensions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-09 Crop, resize and export format](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Competitor trace: CAP-images-and-video-13

## S45.19

**Reframe.** User changes the framing or aspect ratio of an existing image and gets the same scene reframed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-06 Extend and reframe](../../20-features/045-image-editor/F045-06-extend-and-reframe.md)
- Competitor trace: CAP-images-and-video-12

## S45.20

**Lighting adjustment.** User adjusts the lighting of an existing image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F045-11 Operations no app offers](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)

## S45.21

**Color/style transformation.** User transforms the colours or style of an existing image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F045-11 Operations no app offers](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)

## S45.22

**Reference-based composition.** User supplies a reference image and the result is composed from it (subject, layout or style carried over).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F045-07 Reference images](../../20-features/045-image-editor/F045-07-reference-images.md)
- Competitor trace: CAP-images-and-video-11

## S45.23

**Multi-image combination.** User combines several images into one result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-07 Reference images](../../20-features/045-image-editor/F045-07-reference-images.md)

## S45.24

**Pose/reference guidance.** User guides the pose or structure of a generated image with a reference (pose, depth, edges).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-07 Reference images](../../20-features/045-image-editor/F045-07-reference-images.md)

## S45.25

**Text-bearing image generation.** User generates an image containing specified legible text (sign, poster, label).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F045-11 Operations no app offers](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)

## S45.26

**Photo restoration.** User restores an old or damaged photo (scratches, fading) into a clean version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F045-11 Operations no app offers](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)

## S45.27

**Colorization.** User colourises a black-and-white photo.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F045-11 Operations no app offers](../../20-features/045-image-editor/F045-11-operations-no-app-offers.md)

## S45.28

**Before/after comparison.** User compares an edited image with its original side by side or with a slider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F045-08 Keep the original and see earlier versions](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Competitor trace: CAP-images-and-video-13

## S45.29

**Version history.** User sees the earlier versions of an edited image and can open any of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-08 Keep the original and see earlier versions](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Competitor trace: CAP-images-and-video-13

## S45.30

**Undo and redo.** User undoes an image edit (and redoes it) to step between states.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-08 Keep the original and see earlier versions](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Competitor trace: CAP-images-and-video-13

## S45.31

**Preserve-original action.** Editing keeps the original image available next to the result instead of overwriting it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F045-08 Keep the original and see earlier versions](../../20-features/045-image-editor/F045-08-keep-the-original-and-see-earlier-versions.md)
- Competitor trace: CAP-images-and-video-12

## S45.32

**Export format.** User picks the file format (PNG, JPEG, WebP) when saving or exporting an image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-09 Crop, resize and export format](../../20-features/045-image-editor/F045-09-crop-resize-and-export-format.md)
- Competitor trace: CAP-images-and-video-13

## S45.33

**Alpha-channel preservation.** A transparent (alpha) image keeps its transparency through editing, storage and download.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-05 Transparent background](../../20-features/045-image-editor/F045-05-transparent-background.md)

## S45.34

**Brand-reference reuse.** User saves brand references (logo, palette, style) and reuses them across image generations.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-10 Brand, avatar and sticker features](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Competitor trace: CAP-images-and-video-11

## S45.35

**Avatar-reference reuse.** User saves an avatar or character reference and reuses it across image generations.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-10 Brand, avatar and sticker features](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Competitor trace: CAP-images-and-video-11

## S45.36

**Sticker-pack creation.** User creates a set of stickers from a prompt or image in one flow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-10 Brand, avatar and sticker features](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Competitor trace: CAP-images-and-video-15

## S45.37

**Messaging-app sticker export.** User exports stickers in a messaging-app format (e.g. WhatsApp/Telegram packs).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F045-10 Brand, avatar and sticker features](../../20-features/045-image-editor/F045-10-brand-avatar-and-sticker-features.md)
- Competitor trace: CAP-images-and-video-15
