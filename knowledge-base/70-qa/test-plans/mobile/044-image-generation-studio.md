---
id: "PLAN-mobile-044"
type: "test-plan"
title: "Mobile · 44. Image-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "44"
---
# Mobile · 44. Image-generation studio

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S44.01 Text-to-image composer.

- **Expected:** User enters an image mode, types a prompt, and gets a generated image back in the conversation.
- **Code:** done. Evidence moved: apps/web/app/api/media/image/generate/route.ts:177 (quoted code not found in the file now)
- **Where to find it:** Chat > Add to chat (+) > Create image, then type a prompt and send. Or Drawer > Images > Describe an image, then Create image. (path not confirmed in the code; trust the screen)
- **Needs:** A signed-in Cloud account with image access (a paid plan or free daily image quota)
- **Steps:**
  1. Sign in and open a chat in Cloud mode (image creation must be available on the account).
  2. Tap the + button labelled Add to chat, then tap Create image.
  3. Type a prompt in the message box and send.
  4. Wait for the card Generating Image to finish, then check that a generated image appears in the conversation and matches Expected.

## S44.02 Image-model picker.

- **Expected:** User picks which image model generates the image, from models the deployment can run.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:966; apps/mobile/src/features/chat/actions/mediaMode.ts:46; apps/mobile/src/features/image/services/imagegen.ts:49 (quoted code not found in the file now)
- **Where to find it:** Chat > Add to chat (+) > Create image > Image model (path not confirmed in the code; trust the screen)
- **Needs:** A Cloud account with image access and at least two image models offered
- **Steps:**
  1. Open a chat in Cloud mode and tap the + button labelled Add to chat.
  2. Tap Create image.
  3. Under the heading Image model, look at the list of models and tap a different model.
  4. Check that the tapped row is now marked selected, then send a prompt.
  5. Open the generated image and read the caption Generated with <model name> to compare with the model you picked.

## S44.04 Reference-image slots.

- **Expected:** User attaches one or more reference images in dedicated slots that guide the generation.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:288; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:318
- **Where to find it:** Drawer > Images > Attach photos (paperclip). Or Chat > Add to chat (+) > Create image > Photos. (path not confirmed in the code; trust the screen)
- **Needs:** A photo to upload; a model that accepts reference photos (the chat sheet shows a note when it does not)
- **Steps:**
  1. Open Images from the drawer, or open a chat, tap the + button, then tap Create image.
  2. On Images, tap the button labelled Attach photos and choose a photo.
  3. In the chat sheet, tap Photos and choose up to 4 photos (shown in the hint text under Image model).
  4. Check that the chosen photos appear as attachments above the prompt box.
  5. Send the prompt and check that the first photo is edited and the others guide the result.

## S44.07 Aspect-ratio selector.

- **Expected:** User picks the aspect ratio of the generated image from ratios the model supports.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1003; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:276
- **Where to find it:** Chat > Add to chat (+) > Create image > Aspect ratio (path not confirmed in the code; trust the screen)
- **Needs:** A Cloud account with image access; a model that offers more than one ratio (the section is hidden otherwise)
- **Steps:**
  1. Open a chat in Cloud mode, tap the + button, then tap Create image.
  2. Under the heading Aspect ratio, tap a different ratio.
  3. Check that the tapped row is marked selected.
  4. Send a prompt and open the generated image.
  5. Compare the image shape with the ratio you picked.

## S44.11 Background transparency option.

- **Expected:** User asks for a transparent background on the generated image.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1036; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:310
- **Where to find it:** Chat > Add to chat (+) > Create image > Transparent background (path not confirmed in the code; trust the screen)
- **Needs:** A Cloud account with image access and an editing-capable image model
- **Steps:**
  1. Open a chat in Cloud mode, tap the + button, then tap Create image.
  2. Pick an image model that accepts reference photos (the row only appears for those models).
  3. Tap Transparent background so the row is marked selected.
  4. Send a prompt and open the generated image.
  5. Check that the background is removed (transparent) in the result.

## S44.18 Cancel generation.

- **Expected:** User stops an image generation in progress and the job is cancelled (not billed further).
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatMessageStore.ts:1131 (quoted code not found in the file now); apps/mobile/src/features/image/services/imagegen.ts:94 (quoted code not found in the file now)
- **Where to find it:** Chat > send an image prompt > tap Stop generating on the image card (path not confirmed in the code; trust the screen)
- **Needs:** A Cloud account with image access; a fast enough moment to tap before the image finishes
- **Steps:**
  1. Send an image prompt in Cloud mode.
  2. While the card shows Generating Image, tap the button labelled Stop generating.
  3. Check that the card stops progressing and no image is added to the conversation.
  4. Check whether a charge or credit use appears afterwards (not verifiable from the code).

## S44.19 Retry generation.

- **Expected:** After a failed or stopped generation, user retries it in place with the same prompt.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:2528; apps/mobile/src/features/chat/components/MessageBubble.tsx:328 (quoted code not found in the file now)
- **Where to find it:** Chat > failed image card > Retry (path not confirmed in the code; trust the screen)
- **Needs:** A Cloud account with image access and a way to produce a failed generation
- **Steps:**
  1. Make an image generation fail, or use one that shows Image Generation Failed.
  2. Tap the button labelled Retry on the card.
  3. Check that a new generation starts with the same prompt in the same place in the chat.

## S44.21 Image grid.

- **Expected:** Generated images are browsable together in a grid.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:947; apps/mobile/src/features/library/index.tsx:337
- **Where to find it:** Drawer > Library > Images (some labels not found in the code; trust the screen)
- **Needs:** At least one image created earlier on the account
- **Steps:**
  1. Open the drawer and tap Library.
  2. Tap the filter chip labelled Images.
  3. Look for the images in a grid of tiles.
  4. Tap a tile to open it, then compare with Expected.

## S44.22 Full-screen image viewer.

- **Expected:** User opens a generated image in a full-screen viewer.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:881 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ImageFullScreen.tsx:56 (quoted code not found in the file now)
- **Where to find it:** Chat > tap a generated image. Or Drawer > Library > Images > tap a tile. (path not confirmed in the code; trust the screen)
- **Needs:** A generated image
- **Steps:**
  1. Tap a generated image in a chat, or an image tile in Library.
  2. Check that it opens full screen on a black background.
  3. Use the zoom controls (Zoom in, Zoom out) or pinch to zoom.
  4. Tap Close in the top bar to return.

## S44.23 Prompt and settings inspection.

- **Expected:** User can see the prompt and generation settings (model, ratio, size, quality) used for an image.
- **Code:** done. Evidence moved: apps/mobile/src/features/image/imageSettingsCaption.ts:7; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:43 (quoted code not found in the file now)
- **Where to find it:** Chat > tap a generated image > read the text under the picture (path not confirmed in the code; trust the screen)
- **Needs:** A generated image made with a prompt
- **Steps:**
  1. Tap a generated image in a chat to open the full-screen viewer.
  2. Read the prompt text shown under the image.
  3. Read the caption that starts with Generated with, which shows the model name and the aspect ratio.
  4. Compare with Expected: check whether quality and size are shown.

## S44.25 Reuse settings.

- **Expected:** User regenerates with the same settings (model, ratio) as an earlier image.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:545; apps/mobile/src/features/library/index.tsx:388 (quoted code not found in the file now)
- **Where to find it:** Drawer > Library > Images > long-press an image > Remix (path not confirmed in the code; trust the screen)
- **Needs:** A Cloud account with a previously generated image
- **Steps:**
  1. Open Library from the drawer and tap the Images chip.
  2. Long-press an image tile to open its menu.
  3. Tap Remix.
  4. Check that the chat opens in image mode with the earlier prompt and model selected, and compare with Expected (ratio is not clearly set by this path).

## S44.27 Save to Library.

- **Expected:** Generated images are saved to the user's Library and reappear there later.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:337; apps/mobile/src/features/chat/components/MessageBubble.tsx:2640; apps/mobile/src/features/image/services/imagegen.ts:49 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-job-executor.ts:493
- **Where to find it:** Chat (temporary chat) > long-press a generated image > Save to Library (some labels not found in the code; trust the screen)
- **Needs:** A Cloud account with image access; a temporary chat for the Save to Library option
- **Steps:**
  1. Open a temporary chat in Cloud mode and generate an image.
  2. Long-press the image.
  3. Tap Save to Library and wait for the message Saved to your Library.
  4. Open Drawer > Library > Images and check that the image is there.

## S44.29 Download full-quality image.

- **Expected:** User downloads the generated image at full quality.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ImageFullScreen.tsx:199 (quoted code not found in the file now); apps/mobile/services/fileCreation.ts:643
- **Where to find it:** Chat > tap a generated image > Save image to Photos (path not confirmed in the code; trust the screen)
- **Needs:** A phone or simulator with Photos access allowed
- **Steps:**
  1. Tap a generated image to open the full-screen viewer.
  2. Tap the download icon labelled Save image to Photos.
  3. Allow Photos access if the system asks.
  4. Open the Photos app and find the saved image, then compare its size with Expected.

## S44.30 Copy image.

- **Expected:** User copies the image itself to the clipboard.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ImageFullScreen.tsx:212 (quoted code not found in the file now); apps/mobile/services/fileCreation.ts:729
- **Where to find it:** Chat > tap a generated image > Copy image (path not confirmed in the code; trust the screen)
- **Needs:** A phone with a text field in another app
- **Steps:**
  1. Tap a generated image to open the full-screen viewer.
  2. Tap the button labelled Copy image.
  3. Check that the icon changes and the label reads Image copied.
  4. Paste into a text field in another app and check that the image pastes.

## S44.31 Share image.

- **Expected:** User shares a generated image with someone else (link or file to another app).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ImageFullScreen.tsx:175 (quoted code not found in the file now); apps/mobile/services/fileCreation.ts:671
- **Where to find it:** Chat > tap a generated image > Share image (path not confirmed in the code; trust the screen)
- **Needs:** A phone with at least one other app that accepts images
- **Steps:**
  1. Tap a generated image to open the full-screen viewer.
  2. Tap the button labelled Share image.
  3. Choose another app from the share sheet, such as Messages or Mail.
  4. Check that the image is attached in that app before sending.

## S44.33 Edit image.

- **Expected:** User edits a generated or uploaded image by describing the change, and the source pixels are edited.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:705; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:235 (quoted code not found in the file now); apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:312
- **Where to find it:** Chat > tap a generated image > Change this image (path not confirmed in the code; trust the screen)
- **Needs:** A generated image from an image model that can edit; the button is hidden for models that cannot
- **Steps:**
  1. Tap a generated image in a chat whose model can edit images.
  2. Tap the button labelled Change this image.
  3. Type the change in the box labelled Describe the change, for example a colour change, and submit.
  4. Compare the new image with the original and check that the same picture was changed.

## S44.35 Report generated output.

- **Expected:** User reports a generated image as harmful or wrong to trust and safety.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1126 (quoted code not found in the file now); apps/mobile/stores/chat/chatMessageStore.ts:1274
- **Where to find it:** Chat > tap a generated image > Report this image (path not confirmed in the code; trust the screen)
- **Needs:** A generated image; a test image only, since a report is sent to trust and safety
- **Steps:**
  1. Tap a generated image to open the full-screen viewer.
  2. Tap the flag button labelled Report this image.
  3. Choose a reason in the report sheet and submit it (use a test image only).
  4. Read the confirmation and check it says what happened to the report.

## S44.36 Content/provenance labeling.

- **Expected:** Generated images are labelled as AI-generated (visibly and in machine-readable provenance).
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatMessageStore.ts:1274; apps/web/app/api/files/[id]/route.ts:250; apps/mobile/src/features/image/services/imagegen.ts:49 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. No visible AI-generated label was found in apps/mobile (searched AI-generated, AI generated, provenance). The legal screen EU AI Act Article 50 describes a C2PA-style claim; the file route sets the claim headers (apps/web/app/api/files/[id]/route.ts).
