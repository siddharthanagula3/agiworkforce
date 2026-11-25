---
id: "PLAN-desktop-045"
type: "test-plan"
title: "Desktop · 45. Image editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "45"
---
# Desktop · 45. Image editor

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S45.01 Upload an existing image.

- **Expected:** User uploads an image of their own and it becomes the source image that an edit changes.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:283; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1376; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3799; apps/web/app/api/media/image/generate/route.ts:591 (quoted code not found in the file now)
- **Where to find it:** Chat composer > + menu > Add photos & files (attach your picture), then + menu > Create image, then type a change and send (labels found in the code)
- **Needs:** a file to upload and a model that supports edit
- **Steps:**
  1. Sign in and open a new chat.
  2. Click the + button in the composer and choose Add photos & files, then pick a PNG or JPG from your computer.
  3. Click the + button again and choose Create image; the Image pill appears.
  4. Type an instruction such as 'make the sky red' and press send.
  5. Compare: the result is an edit of your uploaded picture, not a brand-new unrelated image.

## S45.02 Open a previously generated image.

- **Expected:** User opens an image generated earlier (this chat or an older one) into an editing state where changes apply to it.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:1036; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833; apps/web/features/library/lib/library-chat-handoff.ts:75; apps/web/features/chat/components/ImageGenerationCard.tsx:502
- **Where to find it:** Sidebar > Library > open an image item's menu > Remix (opens the image in image mode); or open the chat that made it and use New version on the image (labels found in the code)
- **Needs:** an image generated in an earlier chat or in the Library
- **Steps:**
  1. Click Library in the left sidebar.
  2. Find an earlier image and open its menu.
  3. Click Remix.
  4. Look at the composer: the image is attached and the Image pill is on.
  5. Compare: the image is ready to be changed by the next message.

## S45.03 Conversational edit instruction.

- **Expected:** User types a natural-language change for an image and the image itself is edited accordingly.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:731; apps/web/features/chat/components/ImageGenerationCard.tsx:502; apps/web/app/api/media/image/lib/image-generation-provider.ts:507
- **Where to find it:** Chat with a generated image > hover the image > New version > type in the box 'Describe a change to generate a new version...' > click the send button labelled Apply this change to the image (labels found in the code)
- **Needs:** a generated image and a model that supports edit
- **Steps:**
  1. Open a chat that contains a generated image.
  2. Hover over the image and click New version.
  3. Type a change, for example 'add a hat'.
  4. Click the send button (Apply this change to the image).
  5. Compare: the image above is edited to match the change.

## S45.05 Region-selection tool.

- **Expected:** User selects a region of the image in the product and only that region is edited.
- **Code:** done. Evidence present: apps/web/features/chat/components/RegionSelector.tsx:17; apps/web/features/chat/components/RegionSelector.tsx:59; apps/web/features/chat/components/ImageGenerationCard.tsx:707; apps/web/features/chat/components/ImageGenerationCard.tsx:780; apps/web/features/chat/components/ImageGenerationCard.tsx:407
- **Where to find it:** Chat with a generated image > hover the image > New version > Select area (labels found in the code)
- **Needs:** a generated image and a model that supports edit
- **Steps:**
  1. Open a chat with a generated image and click New version.
  2. Click Select area.
  3. Paint over the part of the image to change.
  4. Type a change and send it (Apply this change to the image).
  5. Compare: only the painted area is meant to change, though the guide notes nearby content may change too.

## S45.10 Clear selection.

- **Expected:** User clears the current selection or mask in one action.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:466; apps/web/features/chat/components/ImageGenerationCard.tsx:788
- **Where to find it:** Chat with a generated image > New version > Select area > paint an area > Clear selection (labels found in the code)
- **Needs:** a generated image and a model that supports edit
- **Steps:**
  1. Open New version on a generated image.
  2. Click Select area and paint a part of the image.
  3. Click Clear selection.
  4. Compare: the painted area disappears and the selection is empty; the Clear selection button goes away.

## S45.15 Background removal.

- **Expected:** User removes the background of an image and gets the subject on a transparent background.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4778 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3799; apps/web/app/api/media/image/lib/image-job-executor.ts:301; apps/web/app/api/media/image/lib/image-generation-provider.ts:484
- **Where to find it:** not found in the code. No Remove background control was found. Searched for 'Remove background', 'background removal' and 'transparent background' in apps/web/features/chat/components/Composer/ChatComposerNew.tsx and apps/web/features/chat/components/ImageGenerationCard.tsx. The only related control is the Transparent pill, which asks for a transparent background on a newly generated image, not removal from a chosen picture.
- **Needs:** a picture file

## S45.16 Outpainting.

- **Expected:** User extends an image beyond its borders (outpainting) and the new area is generated to match.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/imageGenerationOptions.ts:257; apps/web/features/chat/lib/imageGenerationOptions.ts:295 (quoted code not found in the file now); apps/web/features/chat/components/ImageGenerationCard.tsx:510 (quoted code not found in the file now)
- **Where to find it:** Chat with a generated image > New version > change the aspect ratio of the image > apply the change (labels found in the code)
- **Needs:** a generated image and a model that supports edit
- **Steps:**
  1. Open New version on a generated image.
  2. Choose a different aspect ratio (the aspect control is inside the New version panel).
  3. Apply the change with the send button (Apply this change to the image).
  4. Compare: the image is extended to the new frame and the new area is generated to match.

## S45.19 Reframe.

- **Expected:** User changes the framing or aspect ratio of an existing image and gets the same scene reframed.
- **Code:** done. Evidence moved: apps/web/features/chat/components/ImageGenerationCard.tsx:510 (quoted code not found in the file now); apps/web/features/chat/lib/imageGenerationOptions.ts:257
- **Where to find it:** Chat with a generated image > New version > change the aspect ratio > apply the change (labels found in the code)
- **Needs:** a generated image and a model that supports edit
- **Steps:**
  1. Open New version on a generated image.
  2. Choose a different aspect ratio.
  3. Apply the change with the send button.
  4. Compare: the same scene now fills the new frame, with no change to the content beyond the reframe.

## S45.22 Reference-based composition.

- **Expected:** User supplies a reference image and the result is composed from it (subject, layout or style carried over).
- **Code:** done. Evidence moved: apps/web/app/api/media/image/generate/route.ts:605 (quoted code not found in the file now); apps/web/app/api/media/image/generate/route.ts:643 (quoted code not found in the file now); apps/web/app/api/media/image/generate/route.ts:707 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-generation-provider.ts:836; apps/web/app/api/media/image/lib/image-job-executor.ts:324; apps/web/app/api/media/image/retry/route.ts:124
- **Where to find it:** not found in the code. Searched for 'Reference' in apps/web/features/chat/components/Composer/ChatComposerNew.tsx. Visible reference labels found ('Reference images', 'Reference image') belong to video mode only; the image-mode reference path (readReferenceImageAsBase64) has no visible label located.
- **Needs:** a reference picture file and a model that supports edit

## S45.31 Preserve-original action.

- **Expected:** Editing keeps the original image available next to the result instead of overwriting it.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:3473; apps/web/features/chat/components/ImageGenerationCard.tsx:1133; apps/web/features/chat/components/ImageGenerationCard.tsx:1287; apps/web/features/chat/components/messages/MessageBubble.tsx:3295
- **Where to find it:** Chat with a generated image > New version > send a change > use the Previous version arrow to see the earlier image (labels found in the code)
- **Needs:** a generated image and a model that supports edit
- **Steps:**
  1. Open New version on a generated image and send a change.
  2. When the new version appears, look for the group of version arrows under the image.
  3. Click Previous version to see the earlier image.
  4. Compare: the original image is still there next to the new result.

## S45.33 Alpha-channel preservation.

- **Expected:** A transparent (alpha) image keeps its transparency through editing, storage and download.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4778 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-generation-provider.ts:484; apps/web/app/api/media/image/lib/image-job-executor.ts:368; apps/web/features/chat/components/ImageGenerationCard.tsx:108
- **Where to find it:** no screen of its own. The Transparent pill appears only when the image model supports edit; the alpha path through storage and download was not traced end to end.
- **Needs:** a model that supports edit
- **Steps:**
  1. Click + > Create image, then turn on the Transparent pill and type a prompt.
  2. Send it and wait for the image.
  3. Download the image from the card.
  4. Compare: the background is see-through, not white or filled.
