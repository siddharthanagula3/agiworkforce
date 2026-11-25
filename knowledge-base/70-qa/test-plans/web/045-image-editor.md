---
id: "PLAN-web-045"
type: "test-plan"
title: "Web · 45. Image editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "45"
---
# Web · 45. Image editor

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S45.01 Upload an existing image.

- **Expected:** User uploads an image of their own and it becomes the source image that an edit changes.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:283; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1376; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3799; apps/web/app/api/media/image/generate/route.ts:591 (quoted code not found in the file now)
- **Where to find it:** Composer (message box) > + button > Add photos & files, then pick a picture. Turn on image mode with + > Create image first. (labels found in the code)
- **Needs:** an image file on the Mac and an account that can use image generation
- **Steps:**
  1. Click + at the left of the message box and turn on Create image (image mode).
  2. Click + again and click Add photos & files, then choose a picture from your Mac.
  3. Check that the picture appears as an attachment above the message box.
  4. Type a change in the message box and press send.
  5. Look that the result is an edit of your picture (the uploaded picture is the first attachment, and the composer shows the Edit option in the Attached image action menu).

## S45.02 Open a previously generated image.

- **Expected:** User opens an image generated earlier (this chat or an older one) into an editing state where changes apply to it.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:1036; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833; apps/web/features/library/lib/library-chat-handoff.ts:75; apps/web/features/chat/components/ImageGenerationCard.tsx:502
- **Where to find it:** A generated image in chat > hover it and click New version. From the Library: Library > Actions for <image name> > Remix. (labels found in the code)
- **Needs:** an image generated earlier, in this chat or an older one
- **Steps:**
  1. Open a chat with a generated image, or open Library from the sidebar.
  2. In chat, move the pointer over the image and click New version.
  3. In Library, click the Actions for the image's file name button and click Remix.
  4. Check that the Revise this image panel opens with the image and its original prompt (or that the composer is in image mode with the image attached).

## S45.03 Conversational edit instruction.

- **Expected:** User types a natural-language change for an image and the image itself is edited accordingly.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:731; apps/web/features/chat/components/ImageGenerationCard.tsx:502; apps/web/app/api/media/image/lib/image-generation-provider.ts:507
- **Where to find it:** Generated image > New version > type in the box Describe a change to this image... > click Apply this change to the image. (labels found in the code)
- **Needs:** a generated image in a chat
- **Steps:**
  1. Hover a generated image in chat and click New version.
  2. Click in the box that says Describe a change to this image...
  3. Type a change such as make the sky red.
  4. Click the send button labelled Apply this change to the image (or press Enter).
  5. Look that the image above is edited to match the change, and that a new version is added.

## S45.05 Region-selection tool.

- **Expected:** User selects a region of the image in the product and only that region is edited.
- **Code:** done. Evidence present: apps/web/features/chat/components/RegionSelector.tsx:17; apps/web/features/chat/components/RegionSelector.tsx:59; apps/web/features/chat/components/ImageGenerationCard.tsx:707; apps/web/features/chat/components/ImageGenerationCard.tsx:780; apps/web/features/chat/components/ImageGenerationCard.tsx:407
- **Where to find it:** Generated image > New version > Select area, then paint over the part of the image to change. (labels found in the code)
- **Needs:** a generated image in a chat and a model that supports editing
- **Steps:**
  1. Hover a generated image and click New version.
  2. Click Select area in the Revise this image panel.
  3. Drag the mouse over the part of the image to change.
  4. Click Apply this change to the image after typing a change, or look at the painted area before applying.
  5. Look that only the painted area is changed (the composer hint says nearby content may change too).

## S45.10 Clear selection.

- **Expected:** User clears the current selection or mask in one action.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:466; apps/web/features/chat/components/ImageGenerationCard.tsx:788
- **Where to find it:** Revise this image panel > Select area > paint something > Clear selection. (labels found in the code)
- **Needs:** a generated image in a chat and a model that supports editing
- **Steps:**
  1. Open New version on a generated image and click Select area.
  2. Paint over an area of the image with the mouse.
  3. Look for the Clear selection button that appears next to Cancel selection.
  4. Click Clear selection.
  5. Look that the painted area disappears in one click and the Clear selection button goes away.

## S45.15 Background removal.

- **Expected:** User removes the background of an image and gets the subject on a transparent background.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4778 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3799; apps/web/app/api/media/image/lib/image-job-executor.ts:301; apps/web/app/api/media/image/lib/image-generation-provider.ts:484
- **Where to find it:** Composer > Create image (image mode) > attach a picture > click Transparent > type a prompt > send. (labels found in the code)
- **Needs:** an image file on the Mac and an account that can use image generation
- **Steps:**
  1. Click + and turn on Create image.
  2. Attach a picture with + > Add photos & files.
  3. Click the Transparent button in the row under the message box so it is highlighted.
  4. Type a prompt such as remove the background and send.
  5. Look that the result shows the subject on a transparent background (checker pattern or transparent in Preview).

## S45.16 Outpainting.

- **Expected:** User extends an image beyond its borders (outpainting) and the new area is generated to match.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/imageGenerationOptions.ts:257; apps/web/features/chat/lib/imageGenerationOptions.ts:295 (quoted code not found in the file now); apps/web/features/chat/components/ImageGenerationCard.tsx:510 (quoted code not found in the file now)
- **Where to find it:** Generated image > New version > Aspect ratio > choose a wider ratio. (labels found in the code)
- **Needs:** a generated image in a chat and a model that supports editing
- **Steps:**
  1. Hover a generated image and click New version.
  2. Click the Aspect ratio button at the top of the Revise this image panel.
  3. Choose a wider option such as 16:9.
  4. Wait for the new version to generate.
  5. Look that the picture is larger and the new side areas match the original scene.

## S45.19 Reframe.

- **Expected:** User changes the framing or aspect ratio of an existing image and gets the same scene reframed.
- **Code:** done. Evidence moved: apps/web/features/chat/components/ImageGenerationCard.tsx:510 (quoted code not found in the file now); apps/web/features/chat/lib/imageGenerationOptions.ts:257
- **Where to find it:** Generated image > New version > Aspect ratio > choose a different ratio. (labels found in the code)
- **Needs:** a generated image in a chat and a model that supports editing
- **Steps:**
  1. Hover a generated image and click New version.
  2. Click the Aspect ratio button (its hover text is Generate this image with a different aspect ratio).
  3. Choose a different ratio such as 1:1 or 9:16.
  4. Wait for the new version.
  5. Look that the same scene is reframed to the new shape rather than a new unrelated picture.

## S45.22 Reference-based composition.

- **Expected:** User supplies a reference image and the result is composed from it (subject, layout or style carried over).
- **Code:** done. Evidence moved: apps/web/app/api/media/image/generate/route.ts:605 (quoted code not found in the file now); apps/web/app/api/media/image/generate/route.ts:643 (quoted code not found in the file now); apps/web/app/api/media/image/generate/route.ts:707 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-generation-provider.ts:836; apps/web/app/api/media/image/lib/image-job-executor.ts:324; apps/web/app/api/media/image/retry/route.ts:124
- **Where to find it:** Composer > + > Create image (image mode) > + > Add photos & files for a second picture (the first picture is edited, the others guide it). (labels found in the code)
- **Needs:** two image files on the Mac and an account that can use image generation
- **Steps:**
  1. Turn on Create image from the + menu.
  2. Attach the source picture with + > Add photos & files.
  3. Attach a second picture the same way.
  4. Type a prompt that asks for the subject or layout of the second picture, and send.
  5. Look that the result uses the subject, layout or style of the reference picture.

## S45.31 Preserve-original action.

- **Expected:** Editing keeps the original image available next to the result instead of overwriting it.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:3473; apps/web/features/chat/components/ImageGenerationCard.tsx:1133; apps/web/features/chat/components/ImageGenerationCard.tsx:1287; apps/web/features/chat/components/messages/MessageBubble.tsx:3295
- **Where to find it:** Generated image > New version > the Image versions arrows (Previous version / Next version) under the image. (labels found in the code)
- **Needs:** a generated image that has been edited at least once
- **Steps:**
  1. Hover a generated image and click New version, then close the panel.
  2. Look for the Image versions group under the image with the counter, for example 1 / 2.
  3. Click Previous version to see the original.
  4. Check that the original image still exists next to the new version.

## S45.33 Alpha-channel preservation.

- **Expected:** A transparent (alpha) image keeps its transparency through editing, storage and download.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4778 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-generation-provider.ts:484; apps/web/app/api/media/image/lib/image-job-executor.ts:368; apps/web/features/chat/components/ImageGenerationCard.tsx:108
- **Where to find it:** Composer > Create image > Transparent on, attach a transparent PNG, send; then the Download button on the result. (labels found in the code)
- **Needs:** a transparent PNG file on the Mac and an account that can use image generation
- **Steps:**
  1. Turn on Create image and attach a transparent PNG with + > Add photos & files.
  2. Click Transparent so it is highlighted, type a prompt and send.
  3. Click the Download button on the result image card.
  4. Open the downloaded file in Preview and look for a transparent background (checker pattern).
