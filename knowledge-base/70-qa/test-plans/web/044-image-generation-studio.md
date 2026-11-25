---
id: "PLAN-web-044"
type: "test-plan"
title: "Web · 44. Image-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "44"
---
# Web · 44. Image-generation studio

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S44.01 Text-to-image composer.

- **Expected:** User enters an image mode, types a prompt, and gets a generated image back in the conversation.
- **Code:** done. Evidence moved: apps/web/app/api/media/image/generate/route.ts:177 (quoted code not found in the file now)
- **Where to find it:** Chat > message box: the + button > Create image; then type a prompt and press the send button (labels found in the code)
- **Needs:** an account with image generation enabled
- **Steps:**
  1. Open a chat and click the + button beside the message box, then click Create image.
  2. Type a prompt into the message box.
  3. Press the send button.
  4. Look for the Generating image card, then check that an image replaces it in the conversation, as Expected says.

## S44.02 Image-model picker.

- **Expected:** User picks which image model generates the image, from models the deployment can run.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6763; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1331; apps/web/app/api/media/image/generate/route.ts:422 (quoted code not found in the file now)
- **Where to find it:** Chat > message box: Create image mode on, then the button labelled Select image model (shows the model name) > pick a model (labels found in the code)
- **Needs:** an account with image generation enabled
- **Steps:**
  1. Click the + button beside the message box, then click Create image.
  2. Click the button with the current model name (aria-label Select image model).
  3. Pick a different model from the list.
  4. Send a prompt and compare the caption Generated with <model> on the result with Expected.

## S44.03 Style presets.

- **Expected:** User picks a style preset (photo, illustration, etc.) that changes the generated look.
- **Code:** done. Evidence present: apps/web/features/chat/lib/imageGenerationOptions.ts:95; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6332; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6344
- **Where to find it:** Chat > message box (Create image on) > Style > Image style menu > pick a preset such as Photorealistic (labels found in the code)
- **Needs:** an account with image generation enabled
- **Steps:**
  1. Turn on Create image from the + button.
  2. Click the button labelled Style (aria-label Add a style to the prompt).
  3. Click a preset such as Photorealistic in the Image style menu.
  4. Check the message box: the preset words were added to the prompt, then send and compare the look with Expected.

## S44.04 Reference-image slots.

- **Expected:** User attaches one or more reference images in dedicated slots that guide the generation.
- **Code:** done. Evidence moved: packages/contracts/cloud-contracts/src/managed-media.ts:86; packages/contracts/cloud-contracts/src/managed-media.ts:104; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3777; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4943 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-generation-provider.ts:486
- **Where to find it:** Chat > message box (Create image on) > + button > Add photos & files (labels found in the code)
- **Needs:** a file to upload (up to several images)
- **Steps:**
  1. Turn on Create image from the + button.
  2. Click + and choose Add photos & files, then attach images.
  3. Check that the first attached image is treated as the one to edit and the others as references (the code shows the notice Attach up to ... images: the first is edited and the others guide it.).
  4. Send and compare the result with Expected.

## S44.07 Aspect-ratio selector.

- **Expected:** User picks the aspect ratio of the generated image from ratios the model supports.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6283; apps/web/features/chat/lib/imageGenerationOptions.ts:164; apps/web/app/api/media/image/generate/route.ts:500 (quoted code not found in the file now)
- **Where to find it:** Chat > message box (Create image on) > button labelled Auto (aria-label Select aspect ratio) > pick a ratio (labels found in the code)
- **Needs:** an account with image generation enabled
- **Steps:**
  1. Turn on Create image from the + button.
  2. Click the button with the aspect ratio text (aria-label Select aspect ratio).
  3. Pick a ratio from the list.
  4. Send and check the picked ratio on the generated image.

## S44.11 Background transparency option.

- **Expected:** User asks for a transparent background on the generated image.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6439; apps/web/app/api/media/image/lib/image-generation-provider.ts:544; apps/web/app/api/media/image/lib/image-job-executor.ts:301
- **Where to find it:** Chat > message box (Create image on) > Transparent button (labels found in the code)
- **Needs:** an account with image generation enabled and a model that supports editing
- **Steps:**
  1. Turn on Create image and choose a model that supports editing.
  2. Click the button labelled Transparent (tooltip: Return the image on a transparent background).
  3. Check that the button shows as on, then send a prompt.
  4. Compare the background of the result with Expected.

## S44.18 Cancel generation.

- **Expected:** User stops an image generation in progress and the job is cancelled (not billed further).
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7678; apps/web/features/chat/pages/WebChatPage.tsx:4337; apps/web/lib/hooks/useMediaGeneration.ts:175; apps/web/lib/hooks/useMediaGeneration.ts:158 (quoted code not found in the file now); apps/web/app/api/media/image/cancel/route.ts:74
- **Where to find it:** Chat > message box: Stop generation (the send button turns into this while an image is generating) (labels found in the code)
- **Needs:** an account with image generation enabled and time to press stop before the image finishes
- **Steps:**
  1. Start an image from Create image with a prompt and send it.
  2. While the Generating image card shows, click the stop button (tooltip Stop generation).
  3. Look for the card Image generation stopped before a result was received.
  4. Compare with Expected: the job is cancelled and not billed further (billing cannot be seen on screen).

## S44.19 Retry generation.

- **Expected:** After a failed or stopped generation, user retries it in place with the same prompt.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:1277; apps/web/features/chat/pages/WebChatPage.tsx:3402
- **Where to find it:** Chat > the image card after a stop or failure > Try again (labels found in the code)
- **Needs:** an account with image generation enabled and a stopped or failed image
- **Steps:**
  1. Stop an image generation as in S44.18, or use one that failed.
  2. Click the Try again button on the card.
  3. Check that a new Generating image card appears with the same prompt.
  4. Compare with Expected.

## S44.20 Variation generation.

- **Expected:** User asks for variations of a generated image.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:549; apps/web/features/chat/components/ImageGenerationCard.tsx:555; packages/contracts/cloud-contracts/src/managed-media.ts:54
- **Where to find it:** Chat > generated image > Revise this image (pencil button) > Variation (labels found in the code)
- **Needs:** an account with image generation enabled and a model that supports editing
- **Steps:**
  1. Open a generated image in chat and click Revise this image.
  2. Click the Variation button in the panel.
  3. Look for a new image of the same prompt in the same card, with the earlier versions still reachable through the Previous version and Next version buttons.
  4. Compare with Expected.

## S44.21 Image grid.

- **Expected:** Generated images are browsable together in a grid.
- **Code:** done. Evidence present: apps/web/app/chat/library/page.tsx:4; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1471; apps/web/app/api/library/route.ts:170
- **Where to find it:** Sidebar: Library > Library page (grid view is the default); filter Images (labels found in the code)
- **Needs:** saved images in the Library
- **Steps:**
  1. Click Library in the sidebar.
  2. Look at the grid of saved items and click the Images filter if shown.
  3. Use the Grid view button to confirm the grid mode.
  4. Compare the saved images with Expected.

## S44.22 Full-screen image viewer.

- **Expected:** User opens a generated image in a full-screen viewer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1202; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1243
- **Where to find it:** Library > click an image to open its viewer (dialog named <name> viewer) (labels found in the code)
- **Needs:** saved images in the Library
- **Steps:**
  1. Open Library from the sidebar.
  2. Click an image in the grid.
  3. Check the full-screen viewer opens, and use Zoom in and Zoom out.
  4. Compare with Expected.

## S44.23 Prompt and settings inspection.

- **Expected:** User can see the prompt and generation settings (model, ratio, size, quality) used for an image.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:1160
- **Where to find it:** Chat > generated image card: the caption Generated with <model> · <ratio> (labels found in the code)
- **Needs:** a generated image in chat
- **Steps:**
  1. Look at the caption under a generated image in chat.
  2. Check that it shows the model name and the ratio when not Auto.
  3. Compare with Expected (prompt, ratio, size, quality).

## S44.24 Reuse prompt.

- **Expected:** User reuses the prompt of an earlier image in one action.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/library/LibraryView.tsx:293; apps/web/features/library/lib/library-chat-handoff.ts:33 (quoted code not found in the file now)
- **Where to find it:** Library > item menu > Remix (the prompt is loaded into the message box) (labels found in the code)
- **Needs:** a saved generated image in the Library
- **Steps:**
  1. Open Library and open the menu of a generated image.
  2. Click Remix.
  3. Check the message box now holds the image's prompt and the image is attached.
  4. Compare with Expected.

## S44.25 Reuse settings.

- **Expected:** User regenerates with the same settings (model, ratio) as an earlier image.
- **Code:** done. Evidence moved: apps/web/features/library/lib/library-chat-handoff.ts:60 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1457; apps/web/shared/stores/web-chat-store.ts:99
- **Where to find it:** Library > item menu > Remix (the same action also sets the model and ratio) (labels found in the code)
- **Needs:** a saved generated image in the Library
- **Steps:**
  1. Open Library and open the menu of a generated image.
  2. Click Remix.
  3. Check the model and the ratio shown in the composer match the original image.
  4. Compare with Expected.

## S44.27 Save to Library.

- **Expected:** Generated images are saved to the user's Library and reappear there later.
- **Code:** done. Evidence present: apps/web/app/chat/library/page.tsx:4; apps/web/features/chat/pages/WebChatPage.tsx:3166; apps/web/app/api/media/image/lib/image-job-executor.ts:493
- **Where to find it:** Chat > generated image > More actions > Save to Library (labels found in the code)
- **Needs:** an account with image generation enabled
- **Steps:**
  1. Click More actions on a generated image card.
  2. Click Save to Library.
  3. Look for the toast Saved to your Library. It stays after this chat is gone.
  4. Open Library from the sidebar and check the image is there.

## S44.28 Add to Project.

- **Expected:** User adds a generated image to a Project.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Library > item menu > Add to project > dialog Add to project (labels found in the code)
- **Needs:** a Project and a generated image in the Library
- **Steps:**
  1. Open Library and open the menu of a generated image.
  2. Click Add to project.
  3. Choose a project in the dialog titled Add to project.
  4. Open that project and check the image is listed.

## S44.29 Download full-quality image.

- **Expected:** User downloads the generated image at full quality.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:1094; apps/web/features/chat/components/ImageGenerationCard.tsx:108
- **Where to find it:** Chat > generated image > More actions > Download (labels found in the code)
- **Needs:** an account with image generation enabled
- **Steps:**
  1. Click More actions on a generated image card.
  2. Click Download.
  3. Open the file that downloads and check its size and sharpness.
  4. Compare with Expected.

## S44.30 Copy image.

- **Expected:** User copies the image itself to the clipboard.
- **Code:** done. Evidence present: apps/web/features/chat/components/ImageGenerationCard.tsx:146; apps/web/features/chat/components/ImageGenerationCard.tsx:938
- **Where to find it:** Chat > generated image > Copy (tooltip and label Copy image) (labels found in the code)
- **Needs:** an account with image generation enabled
- **Steps:**
  1. Click Copy on a generated image.
  2. Look for the Copied text on the button.
  3. Paste into another app and check that the image itself is pasted, as Expected says.
  4. Compare with Expected.

## S44.33 Edit image.

- **Expected:** User edits a generated or uploaded image by describing the change, and the source pixels are edited.
- **Code:** done. Evidence moved: apps/web/features/chat/components/ImageGenerationCard.tsx:861; apps/web/features/chat/components/ImageGenerationCard.tsx:457 (quoted code not found in the file now); apps/web/app/api/media/image/lib/image-generation-provider.ts:484
- **Where to find it:** Chat > generated image > Revise this image (pencil button) > describe the change and send (labels found in the code)
- **Needs:** an account with image generation enabled and a model that supports editing
- **Steps:**
  1. Click Revise this image on a generated image.
  2. Type the change in the box and press the send control.
  3. For a masked edit, click Select area, then Mask image, and paint the area.
  4. Compare the result with the source image and Expected.

## S44.35 Report generated output.

- **Expected:** User reports a generated image as harmful or wrong to trust and safety.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4072; apps/web/features/chat/components/messages/MessageBubble.tsx:1174
- **Where to find it:** Chat > assistant message > message menu > Report this response (labels found in the code)
- **Needs:** an account with image generation enabled
- **Steps:**
  1. Open the menu of a generated image's assistant message.
  2. Click Report this response.
  3. Look for the text Reporting… then Reported, and the toast Reported. Thank you: our trust and safety team will review it.
  4. Compare with Expected.

## S44.36 Content/provenance labeling.

- **Expected:** Generated images are labelled as AI-generated (visibly and in machine-readable provenance).
- **Code:** done. Evidence moved: apps/web/features/chat/components/ImageGenerationCard.tsx:968 (quoted code not found in the file now); apps/web/app/api/files/[id]/route.ts:250
- **Where to find it:** no screen of its own. No visible text saying AI-generated was found in ImageGenerationCard.tsx; the only visible attribution is the Generated with caption. Provenance is in the file route's response headers (route.ts:250).
