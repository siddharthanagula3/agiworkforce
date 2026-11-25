# Area 45. Image editor

37 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S45.01 Upload an existing image.
- Should: User uploads an image of their own and it becomes the source image that an edit changes.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:191; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1117; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2868; apps/web/app/api/media/image/generate/route.ts:591; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:376; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:235; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:146

## S45.02 Open a previously generated image.
- Should: User opens an image generated earlier (this chat or an older one) into an editing state where changes apply to it.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:880; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1619; apps/web/features/library/lib/library-chat-handoff.ts:28; apps/web/features/chat/components/ImageGenerationCard.tsx:448

## S45.03 Conversational edit instruction.
- Should: User types a natural-language change for an image and the image itself is edited accordingly.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:664; apps/web/features/chat/components/ImageGenerationCard.tsx:448; apps/web/app/api/media/image/lib/image-generation-provider.ts:459; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:376; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:235; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:146

## S45.04 Click-to-comment editing.
- Should: User clicks a spot on the image, leaves a comment there, and the edit targets that spot.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S45.05 Region-selection tool.
- Should: User selects a region of the image in the product and only that region is edited.
- Status: web done, desktop done, mobile missing, chrome missing
- Code: apps/web/features/chat/components/RegionSelector.tsx:17; apps/web/features/chat/components/RegionSelector.tsx:59; apps/web/features/chat/components/ImageGenerationCard.tsx:731; apps/web/features/chat/components/ImageGenerationCard.tsx:799; apps/web/features/chat/components/ImageGenerationCard.tsx:441

## S45.06 Brush selection.
- Should: User paints the area to change with a brush on the image.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S45.07 Eraser.
- Should: User erases part of a painted selection with an eraser tool.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S45.08 Brush-size control.
- Should: User changes the brush size used for painting a selection.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S45.09 Selection overlay.
- Should: The selected or masked area is shown as an overlay on the image before the edit is sent.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S45.10 Clear selection.
- Should: User clears the current selection or mask in one action.
- Status: web done, desktop done, mobile missing, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:498; apps/web/features/chat/components/ImageGenerationCard.tsx:807

## S45.11 Invert selection where offered.
- Should: User inverts the current selection so everything else is edited.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S45.12 Object addition.
- Should: User adds a new object to an existing image while the rest is kept.
- Status: not applicable anywhere

## S45.13 Object removal.
- Should: User removes an object from an existing image while the rest is kept.
- Status: not applicable anywhere

## S45.14 Background replacement.
- Should: User replaces the background of an existing image while the subject is kept.
- Status: not applicable anywhere

## S45.15 Background removal.
- Should: User removes the background of an image and gets the subject on a transparent background.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4778; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2868; apps/web/app/api/media/image/lib/image-job-executor.ts:262; apps/web/app/api/media/image/lib/image-generation-provider.ts:458

## S45.16 Outpainting.
- Should: User extends an image beyond its borders (outpainting) and the new area is generated to match.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/chat/lib/imageGenerationOptions.ts:254; apps/web/features/chat/lib/imageGenerationOptions.ts:295; apps/web/features/chat/components/ImageGenerationCard.tsx:510

## S45.17 Crop.
- Should: User crops an image to a chosen area in the product.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.18 Resize.
- Should: User resizes an existing image to new pixel dimensions.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.19 Reframe.
- Should: User changes the framing or aspect ratio of an existing image and gets the same scene reframed.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:510; apps/web/features/chat/lib/imageGenerationOptions.ts:254

## S45.20 Lighting adjustment.
- Should: User adjusts the lighting of an existing image.
- Status: not applicable anywhere

## S45.21 Color/style transformation.
- Should: User transforms the colours or style of an existing image.
- Status: not applicable anywhere

## S45.22 Reference-based composition.
- Should: User supplies a reference image and the result is composed from it (subject, layout or style carried over).
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/app/api/media/image/generate/route.ts:605; apps/web/app/api/media/image/generate/route.ts:643; apps/web/app/api/media/image/generate/route.ts:707; apps/web/app/api/media/image/lib/image-generation-provider.ts:829; apps/web/app/api/media/image/lib/image-job-executor.ts:290; apps/web/app/api/media/image/retry/route.ts:120; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:281; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:194

## S45.23 Multi-image combination.
- Should: User combines several images into one result.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.24 Pose/reference guidance.
- Should: User guides the pose or structure of a generated image with a reference (pose, depth, edges).
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.25 Text-bearing image generation.
- Should: User generates an image containing specified legible text (sign, poster, label).
- Status: not applicable anywhere

## S45.26 Photo restoration.
- Should: User restores an old or damaged photo (scratches, fading) into a clean version.
- Status: not applicable anywhere

## S45.27 Colorization.
- Should: User colourises a black-and-white photo.
- Status: not applicable anywhere

## S45.28 Before/after comparison.
- Should: User compares an edited image with its original side by side or with a slider.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S45.29 Version history.
- Should: User sees the earlier versions of an edited image and can open any of them.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.30 Undo and redo.
- Should: User undoes an image edit (and redoes it) to step between states.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.31 Preserve-original action.
- Should: Editing keeps the original image available next to the result instead of overwriting it.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:2732; apps/web/features/chat/components/ImageGenerationCard.tsx:1051; apps/web/features/chat/components/ImageGenerationCard.tsx:1223; apps/web/features/chat/components/messages/MessageBubble.tsx:2497; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:376; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:130; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:146

## S45.32 Export format.
- Should: User picks the file format (PNG, JPEG, WebP) when saving or exporting an image.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.33 Alpha-channel preservation.
- Should: A transparent (alpha) image keeps its transparency through editing, storage and download.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4778; apps/web/app/api/media/image/lib/image-generation-provider.ts:458; apps/web/app/api/media/image/lib/image-job-executor.ts:318; apps/web/features/chat/components/ImageGenerationCard.tsx:86

## S45.34 Brand-reference reuse.
- Should: User saves brand references (logo, palette, style) and reuses them across image generations.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.35 Avatar-reference reuse.
- Should: User saves an avatar or character reference and reuses it across image generations.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.36 Sticker-pack creation.
- Should: User creates a set of stickers from a prompt or image in one flow.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S45.37 Messaging-app sticker export.
- Should: User exports stickers in a messaging-app format (e.g. WhatsApp/Telegram packs).
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing
