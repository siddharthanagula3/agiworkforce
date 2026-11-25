---
id: "PLAN-web-046"
type: "test-plan"
title: "Web · 46. Video-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "46"
---
# Web · 46. Video-generation studio

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S46.01 Text-to-video composer.

- **Expected:** User writes a text prompt in a video mode and gets a generated video clip back.
- **Code:** done. Evidence present: apps/web/app/api/media/video/generate/route.ts:55
- **Where to find it:** Composer > "Add attachments and tools" button (icon only, the plus) > Create video, then type in the box "Describe the video you want" and press send (labels found in the code)
- **Needs:** a plan that includes video (the code offers "Create video" only when video generation is available to the account; which plan is not confirmed)
- **Steps:**
  1. Sign in and open a new chat.
  2. Click the icon button labelled "Add attachments and tools" beside the message box.
  3. Click "Create video" in the menu. The composer switches to video mode.
  4. Type a prompt into the box that says "Describe the video you want" and press the send button.
  5. Wait for the chat reply. Look for a clip with the text "Your video is ready." to compare with Expected.

## S46.05 Video-model picker.

- **Expected:** User picks which video model generates the clip.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6857; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6885; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3888; apps/web/app/api/media/video/generate/route.ts:873
- **Where to find it:** Composer in video mode > the button showing the video model name (opens the list of video models) (labels found in the code)
- **Needs:** a plan that includes video with more than one video model in the catalog
- **Steps:**
  1. Turn on video mode as in S46.01 (Add attachments and tools > Create video).
  2. Look at the pill beside the composer. It shows the current video model name, or "Checking video models…" or "No video model available".
  3. Click that pill to open the model list.
  4. Click a different model name.
  5. Check that the pill now shows the new name and that the next video uses it.

## S46.06 Duration selector.

- **Expected:** User chooses the clip duration before generating.
- **Code:** done. Evidence present: packages/contracts/types/src/model-catalog.ts:2405; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1436; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6668; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3874
- **Where to find it:** Composer in video mode > the length pill that shows a number of seconds (for example "8s") > pick a "seconds" entry (labels found in the code)
- **Needs:** a plan that includes video; a model that offers more than one length
- **Steps:**
  1. Turn on video mode as in S46.01.
  2. Click the pill that shows a length such as "8s".
  3. Pick another length from the list, shown as for example "5 seconds".
  4. Check that the pill now shows the chosen length.
  5. Send the prompt and compare the clip length with Expected.

## S46.07 Aspect-ratio selector.

- **Expected:** User picks the aspect ratio of the clip.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6561; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3888; apps/web/app/api/media/video/generate/route.ts:873
- **Where to find it:** Composer in video mode > the aspect-ratio pill (for example "16:9") > pick an option (labels found in the code)
- **Needs:** a plan that includes video; a model that offers more than one aspect ratio
- **Steps:**
  1. Turn on video mode as in S46.01.
  2. Click the pill that shows a ratio such as "16:9".
  3. Pick another ratio from the list.
  4. Check that the pill shows the new ratio.
  5. Send the prompt and compare the clip's shape with Expected.

## S46.08 Resolution selector.

- **Expected:** User picks the output resolution of the clip and gets that resolution.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6614; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3888; apps/web/app/api/media/video/generate/route.ts:873
- **Where to find it:** Composer in video mode > the quality pill (shows the quality label for the resolution) > pick an option (labels found in the code)
- **Needs:** a plan that includes video; a model that offers more than one quality
- **Steps:**
  1. Turn on video mode as in S46.01.
  2. Click the pill that shows a quality label.
  3. Pick another quality from the list.
  4. Check that the pill shows the new quality.
  5. Send the prompt and compare the clip's resolution with Expected.

## S46.26 Progress display.

- **Expected:** User sees progress while the video is generated.
- **Code:** done. Evidence present: apps/web/lib/hooks/useMediaGeneration.ts:686
- **Where to find it:** Chat > the video message after sending, in the box "Your video is still being generated" (labels found in the code)
- **Needs:** a plan that includes video; a clip that is still generating
- **Steps:**
  1. Send a video prompt as in S46.01.
  2. Look at the chat message while it generates.
  3. Look for the box "Your video is still being generated" and the progress text.
  4. Look for a percentage and an elapsed time on the placeholder.
  5. Compare with Expected: progress should change while the video is made.

## S46.27 Estimated or actual credit use.

- **Expected:** User sees the estimated or actual credit cost of a video before or after generating.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6705; apps/web/features/chat/components/Composer/VideoCostEstimate.tsx:24
- **Where to find it:** Composer in video mode > the small text "About" followed by a credit amount, next to the length, ratio and quality pills (labels found in the code)
- **Needs:** a plan that includes video; a signed-in account with a credit balance
- **Steps:**
  1. Turn on video mode as in S46.01.
  2. Choose a length, ratio and quality.
  3. Look at the small text beside the pills, for example "About 12 credits".
  4. Hover over it to read the full sentence, which says whether the cost settles when delivered.
  5. Compare with Expected: the estimate should change when the options change.

## S46.28 Cancel request.

- **Expected:** User cancels a video generation in progress and the job stops.
- **Code:** done. Evidence present: apps/web/lib/services/video-job-reconciliation-service.ts:497
- **Where to find it:** Chat > the video placeholder while it generates > "Stop generating" (labels found in the code)
- **Needs:** a plan that includes video; a clip that is still generating when the tester clicks
- **Steps:**
  1. Send a video prompt as in S46.01.
  2. While the placeholder shows its percentage, look for the button "Stop generating".
  3. Click "Stop generating".
  4. Watch the button change to "Stopping…" and then a note.
  5. Compare with Expected: the job should stop and the clip should not be delivered.

## S46.29 Retry failed job.

- **Expected:** User retries a failed video job with the same settings.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:3973; apps/web/features/chat/pages/WebChatPage.tsx:4308
- **Where to find it:** Chat > the failed video message > "Try video again" (labels found in the code)
- **Needs:** a video job that has failed and is allowed to be retried (hard to produce on demand)
- **Steps:**
  1. Find a video message that failed, with the text "Video generation ended".
  2. Read the line below it. It says "Trying again starts a new generation." if a retry is allowed.
  3. Click "Try video again".
  4. Look for a new placeholder with "Your video is still being generated".
  5. Compare with Expected: the new job should use the same length, ratio and quality as the failed one.

## S46.30 Completed clip gallery.

- **Expected:** User browses all completed clips together in a gallery.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:95; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1295; apps/web/app/api/library/route.ts:170
- **Where to find it:** Sidebar > Library > Videos tab (labels found in the code)
- **Needs:** at least one finished video in the account
- **Steps:**
  1. Click "Library" in the left navigation.
  2. Click the "Videos" tab.
  3. Look at the list of finished clips.
  4. Click one clip to open it.
  5. Compare with Expected: all finished clips should be together in one place.

## S46.31 Playback controls.

- **Expected:** User plays, pauses and scrubs a finished clip in the product.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3444; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1295; apps/web/app/api/files/[id]/route.ts:262
- **Where to find it:** Chat > the finished video message, under "Your video is ready." (native player controls); or Library > Videos > open a clip (labels found in the code)
- **Needs:** a finished clip
- **Steps:**
  1. Open a chat where a clip shows "Your video is ready."
  2. Click the play control on the clip.
  3. Click again to pause.
  4. Drag the timeline to a new point and check the clip jumps there.
  5. Repeat in Library > Videos to compare with Expected.

## S46.32 Download.

- **Expected:** User downloads a finished clip as a file.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3456; apps/web/features/chat/components/messages/MessageBubble.tsx:3444; apps/web/app/api/files/[id]/route.ts:302
- **Where to find it:** Chat > the finished video message > hover over the clip and click "Download video" (icon at the top right of the clip) (labels found in the code)
- **Needs:** a finished clip; a Mac with a browser that saves downloads
- **Steps:**
  1. Open a chat where a clip shows "Your video is ready.".
  2. Move the mouse over the clip, or press Tab until the icon is focused.
  3. Click the icon labelled "Download video" at the top right.
  4. Check the file saved to the Downloads folder as a video file.
  5. Compare with Expected: the saved file should be the finished clip.
