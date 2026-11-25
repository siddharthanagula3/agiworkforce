---
id: "PLAN-desktop-044"
type: "test-plan"
title: "Desktop · 44. Image-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "44"
---
# Desktop · 44. Image-generation studio

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S44.01 Text-to-image composer.

- **Expected:** User enters an image mode, types a prompt, and gets a generated image back in the conversation.
- **Code:** done. Evidence moved: apps/web/app/api/media/image/generate/route.ts:177 (quoted code not found in the file now)
- **Where to find it:** Composer plus menu > Create image, then type a prompt and send (labels found in the code)
- **Needs:** a paid account (plan not verified in code)
- **Steps:**
  1. Open the composer's plus menu and click Create image. The composer shows an Image chip with the button Exit image generation mode.
  2. Type a prompt in the message box.
  3. Press the send button.
  4. Look for the Generating image card in the conversation, then check that a generated image appears in the same conversation, matching Expected.

## S44.02 Image-model picker.

- **Expected:** User picks which image model generates the image, from models the deployment can run.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6763; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1331; apps/web/app/api/media/image/generate/route.ts:422 (quoted code not found in the file now)
- **Where to find it:** Create image (image mode) > Select image model button (labels found in the code)
- **Needs:** a paid account with more than one image model enabled
- **Steps:**
  1. Turn on image mode with Create image from the composer plus menu.
  2. Click the button labelled with the current model name (its aria-label is Select image model). The menu is titled Image model.
  3. Pick a different model from the list.
  4. Generate an image and check that the picked model is the one shown in the card caption (Generated with ...).

## S44.03 Style presets.

- **Expected:** User picks a style preset (photo, illustration, etc.) that changes the generated look.
- **Code:** done. Evidence present: apps/web/features/chat/lib/imageGenerationOptions.ts:95; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6332; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6344
- **Where to find it:** Create image (image mode) > Style button > pick a preset (labels found in the code)
- **Needs:** none beyond image mode access
- **Steps:**
  1. Turn on image mode with Create image.
  2. Click the Style button (aria-label Add a style to the prompt).
  3. Click a preset: Photorealistic, Illustration, Watercolor, Oil painting or 3D render.
  4. Check that the preset's wording is added to the message box, then generate and compare the look with Expected.

## S44.04 Reference-image slots.

- **Expected:** User attaches one or more reference images in dedicated slots that guide the generation.
- **Code:** done. Evidence moved: packages/contracts/cloud-contracts/src/managed-media.ts:86; packages/contracts/cloud-contracts/src/managed-media.ts:104; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3777; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4943 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-generation-provider.ts:486
- **Where to find it:** Create image (image mode) > attach a picture with the attach control, then What to do with the attached image (labels found in the code)
- **Needs:** one to several image files to upload
- **Steps:**
  1. Turn on image mode with Create image.
  2. Attach one or more pictures using the composer's attach control (File upload).
  3. Open the menu named by the button What to do with the attached image to choose the operation.
  4. Check that the first picture is edited and the others guide the result, as the send-time message says: Attach up to N images.

## S44.07 Aspect-ratio selector.

- **Expected:** User picks the aspect ratio of the generated image from ratios the model supports.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6283; apps/web/features/chat/lib/imageGenerationOptions.ts:164; apps/web/app/api/media/image/generate/route.ts:500 (quoted code not found in the file now)
- **Where to find it:** Create image (image mode) > Select aspect ratio button (labels found in the code)
- **Needs:** none beyond image mode access
- **Steps:**
  1. Turn on image mode with Create image.
  2. Click the button for the aspect ratio (aria-label Select aspect ratio; shows Auto by default).
  3. Pick a ratio from the menu titled Image aspect ratio.
  4. Generate an image and check the picture's shape against the ratio chosen.

## S44.11 Background transparency option.

- **Expected:** User asks for a transparent background on the generated image.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6439; apps/web/app/api/media/image/lib/image-generation-provider.ts:544; apps/web/app/api/media/image/lib/image-job-executor.ts:301
- **Where to find it:** Create image (image mode) > the button titled Return the image on a transparent background (labels found in the code)
- **Needs:** a paid account and a model that supports editing
- **Steps:**
  1. Turn on image mode with Create image and choose a model that can edit images.
  2. Hover the button titled Return the image on a transparent background to read its title.
  3. Turn it on (it shows as pressed), then generate an image.
  4. Check that the returned image has a transparent background, as Expected says.

## S44.18 Cancel generation.

- **Expected:** User stops an image generation in progress and the job is cancelled (not billed further).
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7678; apps/web/features/chat/pages/WebChatPage.tsx:4337; apps/web/lib/hooks/useMediaGeneration.ts:175; apps/web/lib/hooks/useMediaGeneration.ts:158 (quoted code not found in the file now); apps/web/app/api/media/image/cancel/route.ts:74
- **Where to find it:** Composer send button (turns into stop) while an image generation runs (labels found in the code)
- **Needs:** a paid account, and time to click before the image finishes
- **Steps:**
  1. Start an image generation with a prompt.
  2. While the Generating image card shows, click the composer's send button, which becomes the stop control during a turn.
  3. Check that the Generating image card ends with Image generation stopped and that no image is added.
  4. Check the card offers Try again.

## S44.19 Retry generation.

- **Expected:** After a failed or stopped generation, user retries it in place with the same prompt.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:1277; apps/web/features/chat/pages/WebChatPage.tsx:3402
- **Where to find it:** A stopped or failed image card > Try again (labels found in the code)
- **Needs:** a way to cause a failure or stop
- **Steps:**
  1. Make an image generation fail or stop it (see S44.18).
  2. Find the card labelled Image generation stopped or the error card.
  3. Click Try again (it may show a countdown such as Try again in 30s first).
  4. Check that a new generation starts with the same prompt in the same place.

## S44.20 Variation generation.

- **Expected:** User asks for variations of a generated image.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:549; apps/web/features/chat/components/ImageGenerationCard.tsx:555; packages/contracts/cloud-contracts/src/managed-media.ts:54
- **Where to find it:** A generated image card > Variation button under the image (labels found in the code)
- **Needs:** a paid account and a generated image
- **Steps:**
  1. Generate an image so its card shows under the chat.
  2. Click the Variation button below the image card.
  3. Wait for the new generation to appear.
  4. Check that a new image is made from the same picture, as Expected says.

## S44.21 Image grid.

- **Expected:** Generated images are browsable together in a grid.
- **Code:** done. Evidence present: apps/web/app/chat/library/page.tsx:4; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1471; apps/web/app/api/library/route.ts:170
- **Where to find it:** Library (/chat/library) > Images tab (labels found in the code)
- **Needs:** a few generated images in the account
- **Steps:**
  1. Open the Library page from the app's navigation.
  2. Click the Images tab.
  3. Check that generated images show together as a grid of thumbnails.
  4. Use the Library layout control to switch view if you want to compare.

## S44.22 Full-screen image viewer.

- **Expected:** User opens a generated image in a full-screen viewer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1202; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1243
- **Where to find it:** Library > Images > click a picture to open the file viewer (labels found in the code)
- **Needs:** a generated image in the Library
- **Steps:**
  1. Open Library > Images.
  2. Click a generated image.
  3. Check that the viewer opens over the page with Zoom in, Zoom out and Download, and a Close file viewer button.
  4. Use Zoom in to confirm it enlarges the picture.

## S44.23 Prompt and settings inspection.

- **Expected:** User can see the prompt and generation settings (model, ratio, size, quality) used for an image.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:1160
- **Where to find it:** A generated image card in chat > the caption under the image Generated with (labels found in the code)
- **Needs:** a generated image
- **Steps:**
  1. Generate or open an image card in a conversation.
  2. Read the caption under the image.
  3. Check that it shows the model and the aspect ratio (for example Generated with ... · 16:9).
  4. Look for the prompt and any size or quality setting, and compare with Expected.

## S44.24 Reuse prompt.

- **Expected:** User reuses the prompt of an earlier image in one action.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/library/LibraryView.tsx:293; apps/web/features/library/lib/library-chat-handoff.ts:33 (quoted code not found in the file now)
- **Where to find it:** Library > Images > item menu > Remix (labels found in the code)
- **Needs:** a saved generated image in the Library
- **Steps:**
  1. Open Library > Images.
  2. Open the menu of a generated image.
  3. Click Remix.
  4. Check that the composer opens in image mode with the image's prompt filled in.

## S44.25 Reuse settings.

- **Expected:** User regenerates with the same settings (model, ratio) as an earlier image.
- **Code:** done. Evidence moved: apps/web/features/library/lib/library-chat-handoff.ts:60 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1457; apps/web/shared/stores/web-chat-store.ts:99
- **Where to find it:** Library > Images > item menu > Remix (settings carry over) (labels found in the code)
- **Needs:** a saved image made with a non-default model or ratio
- **Steps:**
  1. Open Library > Images and pick an image made with a specific model and aspect ratio.
  2. Click Remix in its menu.
  3. Check that the composer's model and aspect ratio match that image before generating.
  4. Generate again and compare with Expected.

## S44.27 Save to Library.

- **Expected:** Generated images are saved to the user's Library and reappear there later.
- **Code:** done. Evidence present: apps/web/app/chat/library/page.tsx:4; apps/web/features/chat/pages/WebChatPage.tsx:3166; apps/web/app/api/media/image/lib/image-job-executor.ts:493
- **Where to find it:** A generated image card > More actions > Save to Library (labels found in the code)
- **Needs:** a generated image
- **Steps:**
  1. Generate an image so its card shows.
  2. Click the More actions button on the card.
  3. Click Save to Library.
  4. Open Library from the app and check that the image is listed, and still there after a reload.

## S44.28 Add to Project.

- **Expected:** User adds a generated image to a Project.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:380 (quoted code not found in the file now); apps/web/app/api/projects/[id]/knowledge-files/route.ts:381 (quoted code not found in the file now)
- **Where to find it:** Library > Images > item menu > Add to project (labels found in the code)
- **Needs:** a Project and a generated image in the Library
- **Steps:**
  1. Open Library > Images.
  2. Open the menu of a generated image.
  3. Click Add to project.
  4. In the dialog titled Add to project, pick a project folder and check that the image shows up in that project.

## S44.29 Download full-quality image.

- **Expected:** User downloads the generated image at full quality.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:1094; apps/web/features/chat/components/ImageGenerationCard.tsx:108
- **Where to find it:** A generated image card > More actions > Download (labels found in the code)
- **Needs:** a generated image
- **Steps:**
  1. Click the More actions button on the image card.
  2. Click Download.
  3. Open the downloaded file in Preview and check its size and sharpness against Expected.
  4. Compare with the Download button on the image's hover bar.

## S44.30 Copy image.

- **Expected:** User copies the image itself to the clipboard.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:146; apps/web/features/chat/components/ImageGenerationCard.tsx:938
- **Where to find it:** A generated image card > Copy image (labels found in the code)
- **Needs:** a generated image
- **Steps:**
  1. Generate an image so its card shows.
  2. Click the Copy button under the image (its title is Copy image).
  3. Paste into another app such as Notes or a chat box.
  4. Check that the picture itself pastes, not only a link.

## S44.33 Edit image.

- **Expected:** User edits a generated or uploaded image by describing the change, and the source pixels are edited.
- **Code:** done. Evidence moved: apps/web/features/chat/components/ImageGenerationCard.tsx:861; apps/web/features/chat/components/ImageGenerationCard.tsx:457 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-generation-provider.ts:484
- **Where to find it:** A generated image card > New version (labels found in the code)
- **Needs:** a generated image, or a picture you upload in image mode
- **Steps:**
  1. Click the New version button on the generated image.
  2. In the Revise this image panel, type a change to describe.
  3. Click send and wait for the new version.
  4. Check that the new image keeps the source picture and applies the change, as Expected says.

## S44.35 Report generated output.

- **Expected:** User reports a generated image as harmful or wrong to trust and safety.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4072; apps/web/features/chat/components/messages/MessageBubble.tsx:1174
- **Where to find it:** A generated image reply > message menu > Report this response (labels found in the code)
- **Needs:** a generated image reply in a conversation
- **Steps:**
  1. Find the image reply in the conversation.
  2. Open the message's menu.
  3. Click Report this response.
  4. Check that the menu shows Reported and a toast says Reported. Thank you: our trust and safety team will review it.

## S44.36 Content/provenance labeling.

- **Expected:** Generated images are labelled as AI-generated (visibly and in machine-readable provenance).
- **Code:** done. Evidence moved: apps/web/features/chat/components/ImageGenerationCard.tsx:968 (quoted code not found in the file now); apps/web/app/api/files/[id]/route.ts:250
- **Where to find it:** A generated image card > caption Generated with (labels found in the code)
- **Needs:** a generated image; a file inspection tool for the metadata check
- **Steps:**
  1. Look at the caption under any generated image card.
  2. Check whether it says the image is AI-generated.
  3. Download the image and check whether AI-generation metadata exists in the file (provenance is set by the server in the file route).
