---
id: "PLAN-desktop-046"
type: "test-plan"
title: "Desktop · 46. Video-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "46"
---
# Desktop · 46. Video-generation studio

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S46.01 Text-to-video composer.

- **Expected:** User writes a text prompt in a video mode and gets a generated video clip back.
- **Code:** done. Evidence present: apps/web/app/api/media/video/generate/route.ts:55
- **Where to find it:** Composer > + menu > Create video, then type a prompt and send (labels found in the code)
- **Needs:** a paid account (Create video is offered only to an entitled tier)
- **Steps:**
  1. Sign in and open a new chat.
  2. Click the + button in the composer and click Create video.
  3. Type a text prompt in the composer and press send.
  4. Look for a video placeholder in the chat that becomes a playable clip, and compare with Expected.

## S46.05 Video-model picker.

- **Expected:** User picks which video model generates the clip.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6857; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6885; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3888; apps/web/app/api/media/video/generate/route.ts:873
- **Where to find it:** Composer (video mode on) > Select video model button (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Turn on video mode with Composer > + menu > Create video.
  2. Click the model button in the composer that shows a model name (aria-label Select video model).
  3. Look at the list of video models that opens and pick one.
  4. Check that the button now shows the chosen model name.

## S46.06 Duration selector.

- **Expected:** User chooses the clip duration before generating.
- **Code:** done. Evidence present: packages/contracts/types/src/model-catalog.ts:2405; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1436; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6668; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3874
- **Where to find it:** Composer (video mode on) > Select video length button (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Turn on video mode with Composer > + menu > Create video.
  2. Click the pill button that shows a length such as 5s (aria-label Select video length).
  3. Look at the menu of options, each shown as N seconds, and pick one.
  4. Check that the pill now shows the chosen length before sending.

## S46.07 Aspect-ratio selector.

- **Expected:** User picks the aspect ratio of the clip.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6561; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3888; apps/web/app/api/media/video/generate/route.ts:873
- **Where to find it:** Composer (video mode on) > Select video aspect ratio button (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Turn on video mode with Composer > + menu > Create video.
  2. Click the pill that shows a ratio such as 16:9 (aria-label Select video aspect ratio).
  3. Pick another ratio from the menu labelled Video aspect ratio.
  4. Check that the pill shows the new ratio and the menu closes.

## S46.08 Resolution selector.

- **Expected:** User picks the output resolution of the clip and gets that resolution.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6614; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3888; apps/web/app/api/media/video/generate/route.ts:873
- **Where to find it:** Composer (video mode on) > Select video quality button (labels found in the code)
- **Needs:** a paid account, a finished clip to check the resolution
- **Steps:**
  1. Turn on video mode with Composer > + menu > Create video.
  2. Click the pill that shows a quality label (aria-label Select video quality).
  3. Pick another quality from the menu labelled Video quality.
  4. Send a prompt and compare the clip's resolution with the chosen quality.

## S46.26 Progress display.

- **Expected:** User sees progress while the video is generated.
- **Code:** done. Evidence present: apps/web/lib/hooks/useMediaGeneration.ts:686
- **Where to find it:** Chat, after sending a video prompt > progress placeholder in the reply (labels found in the code)
- **Needs:** a paid account, a video generation in progress
- **Steps:**
  1. Send a video prompt in video mode.
  2. Look at the placeholder that appears in the reply, with a progress bar named Video progress and a percentage.
  3. Watch the percentage and the elapsed time change while the clip is generated.
  4. Compare with Expected: the user sees progress until the clip is ready.

## S46.27 Estimated or actual credit use.

- **Expected:** User sees the estimated or actual credit cost of a video before or after generating.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6705; apps/web/features/chat/components/Composer/VideoCostEstimate.tsx:24
- **Where to find it:** Composer (video mode on, a video model selected) > estimate note near the video pills (labels found in the code)
- **Needs:** a paid account with credits
- **Steps:**
  1. Turn on video mode with Composer > + menu > Create video and pick a video model.
  2. Choose a length, ratio and quality.
  3. Look for the note that starts with This video is estimated at near the video pills; hover it to see the full text in the tooltip.
  4. Compare the amount with your available credits, and after sending check the cost once the clip is done.

## S46.28 Cancel request.

- **Expected:** User cancels a video generation in progress and the job stops.
- **Code:** done. Evidence present: apps/web/lib/services/video-job-reconciliation-service.ts:497
- **Where to find it:** Chat, during a video generation > Stop generating button on the progress placeholder (labels found in the code)
- **Needs:** a paid account, a video generation still in progress
- **Steps:**
  1. Start a video generation in video mode.
  2. While the progress placeholder is shown, click Stop generating at its top-right.
  3. Look for the button to change to Stopping… and then for the note Cancellation requested.
  4. Check that the placeholder stops progressing and the job ends, and compare with Expected.

## S46.29 Retry failed job.

- **Expected:** User retries a failed video job with the same settings.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:3973; apps/web/features/chat/pages/WebChatPage.tsx:4308
- **Where to find it:** Chat, a failed video reply > Try video again button (labels found in the code)
- **Needs:** a failed video job marked retryable (hard to produce on demand)
- **Steps:**
  1. Find a failed video reply titled Video generation ended.
  2. Read the text under it; the button shows only when the job is marked as retryable.
  3. Click Try video again.
  4. Check that a new video starts with the same model, ratio, quality and length as before.

## S46.30 Completed clip gallery.

- **Expected:** User browses all completed clips together in a gallery.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:95; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1295; apps/web/app/api/library/route.ts:170
- **Where to find it:** Sidebar > Library > Videos tab (labels found in the code)
- **Needs:** a Free or paid account with at least one finished clip
- **Steps:**
  1. Click Library in the sidebar.
  2. Click the Videos tab.
  3. Look for all finished clips listed together in the gallery.

## S46.31 Playback controls.

- **Expected:** User plays, pauses and scrubs a finished clip in the product.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3444; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1295; apps/web/app/api/files/[id]/route.ts:262
- **Where to find it:** Library > Videos tab > click a clip; or the clip in the chat reply (labels found in the code)
- **Needs:** a finished clip in the account
- **Steps:**
  1. Open Library > Videos.
  2. Click a clip to open it in the viewer.
  3. Use the player controls to play, pause and drag the timeline.
  4. Compare with Expected: the clip plays, pauses and scrubs.

## S46.32 Download.

- **Expected:** User downloads a finished clip as a file.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3456; apps/web/features/chat/components/messages/MessageBubble.tsx:3444; apps/web/app/api/files/[id]/route.ts:302
- **Where to find it:** Chat, finished video reply > Download video button (top-right of the clip) (labels found in the code)
- **Needs:** a finished clip in a chat
- **Steps:**
  1. Open a finished clip in a chat reply.
  2. Hover over the clip, or Tab to it, so the round Download video button shows at its top-right.
  3. Click Download video.
  4. Check that the file saves to the Downloads folder as a playable video.
