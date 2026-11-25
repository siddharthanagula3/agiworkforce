---
id: "PLAN-mobile-046"
type: "test-plan"
title: "Mobile · 46. Video-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "46"
---
# Mobile · 46. Video-generation studio

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S46.01 Text-to-video composer.

- **Expected:** User writes a text prompt in a video mode and gets a generated video clip back.
- **Code:** done. Evidence present: apps/web/app/api/media/video/generate/route.ts:55
- **Where to find it:** Chat screen > Add to chat (+ button) > Create video > type a prompt in Message input and send (labels found in the code)
- **Needs:** a Cloud-mode account whose plan includes video generation
- **Steps:**
  1. Sign in and open a chat in Cloud mode.
  2. Tap the Add to chat button.
  3. Tap Create video. Under it, the Video model list appears.
  4. Type a text prompt in the message box and send it.
  5. Wait for the video card to appear in the chat.
  6. Compare: a video clip comes back in the chat after generating.

## S46.05 Video-model picker.

- **Expected:** User picks which video model generates the clip.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:966; apps/mobile/src/features/chat/actions/runVideoGenerationTurn.ts:140; apps/mobile/src/features/video/services/videogen.ts (text found, layout changed)
- **Where to find it:** Chat screen > Add to chat > Create video > Video model list (labels found in the code)
- **Needs:** a Cloud-mode account whose plan includes video generation
- **Steps:**
  1. Sign in and open a chat in Cloud mode.
  2. Tap Add to chat.
  3. Tap Create video.
  4. Look at the list under Video model.
  5. Tap a different model row.
  6. Compare: the tapped row shows as selected, and the next clip uses that model.

## S46.06 Duration selector.

- **Expected:** User chooses the clip duration before generating.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:307; apps/mobile/src/features/video/services/videogen.ts:74
- **Where to find it:** Chat screen > Add to chat > Create video > Length (labels found in the code)
- **Needs:** a Cloud-mode account whose plan includes video generation
- **Steps:**
  1. Sign in and open a chat in Cloud mode.
  2. Tap Add to chat, then Create video.
  3. Look under the Length heading for rows such as 5 seconds.
  4. Tap one of the Length rows.
  5. Read the line that starts with About under the list.
  6. Compare: the chosen length is marked selected and the About line changes for that length.

## S46.07 Aspect-ratio selector.

- **Expected:** User picks the aspect ratio of the clip.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1075; apps/mobile/src/features/chat/actions/runVideoGenerationTurn.ts:140; apps/mobile/src/features/video/services/videogen.ts (text found, layout changed)
- **Where to find it:** Chat screen > Add to chat > Create video > Aspect ratio (labels found in the code)
- **Needs:** a Cloud-mode account whose plan includes video generation
- **Steps:**
  1. Sign in and open a chat in Cloud mode.
  2. Tap Add to chat, then Create video.
  3. Find the Aspect ratio heading in the video options.
  4. Tap one of the aspect ratio rows.
  5. Compare: the tapped row is marked selected.

## S46.08 Resolution selector.

- **Expected:** User picks the output resolution of the clip and gets that resolution.
- **Code:** done. Evidence present: apps/mobile/src/features/video/services/videogen.ts:67; apps/mobile/src/features/video/services/videogen.ts:104
- **Where to find it:** Chat screen > Add to chat > Create video > Quality (labels found in the code)
- **Needs:** a Cloud-mode account whose plan includes video generation
- **Steps:**
  1. Sign in and open a chat in Cloud mode.
  2. Tap Add to chat, then Create video.
  3. Find the Quality heading in the video options.
  4. Tap one of the Quality rows.
  5. Compare: the tapped row is selected. Some rows show a hint like N/Ns only.
  6. Compare the clip's output resolution with the chosen row, if you can inspect the file.

## S46.26 Progress display.

- **Expected:** User sees progress while the video is generated.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/VideoGenProgress.tsx:93; apps/mobile/src/features/video/services/videogen.ts:163
- **Where to find it:** Chat screen > send a video prompt > video card in the chat shows Generating video (labels found in the code)
- **Needs:** a Cloud-mode account whose plan includes video generation
- **Steps:**
  1. Sign in and open a chat in Cloud mode with video mode selected.
  2. Send a video prompt.
  3. Look at the card in the chat.
  4. Compare: the card shows Generating video, a percentage and bar only if the provider reports one, and the line about a minute or two.

## S46.27 Estimated or actual credit use.

- **Expected:** User sees the estimated or actual credit cost of a video before or after generating.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1483; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1514; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1152
- **Where to find it:** Chat screen > Add to chat > Create video > Video model rows and the About line under the options (labels found in the code)
- **Needs:** a Cloud-mode account whose plan includes video generation
- **Steps:**
  1. Sign in and open a chat in Cloud mode.
  2. Tap Add to chat, then Create video.
  3. Read the price text on each Video model row, such as per second.
  4. Pick a Length and read the About line below the options.
  5. Compare: the About line shows an estimated credit amount and says a failed video costs nothing.

## S46.28 Cancel request.

- **Expected:** User cancels a video generation in progress and the job stops.
- **Code:** done. Evidence present: apps/mobile/src/features/video/services/videogen.ts:125; apps/web/lib/services/video-job-reconciliation-service.ts:497
- **Where to find it:** Chat screen > send a video prompt > video card > Stop generating (labels found in the code)
- **Needs:** a Cloud-mode account whose plan includes video generation
- **Steps:**
  1. Send a video prompt and wait until the card shows Generating video.
  2. Tap Stop generating under the progress text.
  3. Look at the button while it works.
  4. Compare: the button shows Stopping and then the card shows Video generation stopped, and the clip is not delivered.

## S46.29 Retry failed job.

- **Expected:** User retries a failed video job with the same settings.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2570; apps/mobile/app/(app)/chat/[id].tsx:1956
- **Where to find it:** Chat screen > failed video card > Retry (labels found in the code)
- **Needs:** a Cloud-mode account and a video that failed or timed out
- **Steps:**
  1. Make a video that fails, or wait for a timeout.
  2. Look for the Retry button under the failed card.
  3. Tap Retry.
  4. Compare: the prompt is sent again as a video request and a new video card appears.

## S46.30 Completed clip gallery.

- **Expected:** User browses all completed clips together in a gallery.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:904; apps/mobile/src/features/library/index.tsx:216 (quoted code not found in the file now); apps/mobile/src/features/library/libraryClient.ts:107
- **Where to find it:** Side menu > Library > Videos (labels found in the code)
- **Needs:** a signed-in account with at least one finished clip
- **Steps:**
  1. Sign in and open the side menu.
  2. Tap Library.
  3. Tap the Videos filter chip.
  4. Look at the grid.
  5. Compare: completed clips are shown as tiles, or the text Videos you generate will appear here shows if there are none.

## S46.31 Playback controls.

- **Expected:** User plays, pauses and scrubs a finished clip in the product.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/GeneratedVideo.tsx:29 (quoted code not found in the file now); apps/mobile/src/features/chat/components/VideoPlayerModal.tsx:27
- **Where to find it:** Chat screen > video card > Play, or Side menu > Library > tap a video tile (labels found in the code)
- **Needs:** a finished video clip in the account
- **Steps:**
  1. Open a chat with a finished video card.
  2. Tap Play on the card, or tap the video in the Library grid.
  3. Look at the player screen that opens.
  4. Use the player's controls to play, pause and scrub.
  5. Compare: the clip plays, pauses and can be moved to another point.

## S46.32 Download.

- **Expected:** User downloads a finished clip as a file.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/GeneratedVideo.tsx:210; apps/mobile/src/features/chat/components/GeneratedVideo.tsx:52 (quoted code not found in the file now)
- **Where to find it:** Chat screen > video card > Save, or the player's Save video icon (labels found in the code)
- **Needs:** a finished video clip in the account
- **Steps:**
  1. Open a finished video card in a chat.
  2. Tap Save under the card.
  3. Wait for the share sheet to open.
  4. Compare: the share sheet lists a save or send option for the video file.

## S46.33 Share.

- **Expected:** User shares a finished clip with someone (link or file to another app).
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:445; apps/mobile/src/features/library/index.tsx:216 (quoted code not found in the file now)
- **Where to find it:** Side menu > Library > long-press a video tile > Share (labels found in the code)
- **Needs:** a signed-in account with at least one finished clip
- **Steps:**
  1. Open Library from the side menu.
  2. Tap the Videos filter.
  3. Long-press a video tile.
  4. Tap Share in the menu that opens, or tap Library options, Select saved files, pick one video, then tap Share.
  5. Compare: the share sheet opens with the video file.
