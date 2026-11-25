# Area 46. Video-generation studio

37 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S46.01 Text-to-video composer.
- Should: User writes a text prompt in a video mode and gets a generated video clip back.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/app/api/media/video/generate/route.ts:757

## S46.02 Image-to-video input.
- Should: User supplies an image as the first frame or source of a video (image-to-video).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.03 Video-to-video input.
- Should: User supplies a video as the input to generate a new video (video-to-video).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.04 Multiple reference slots.
- Should: User fills several reference slots (images, characters, styles) for one video.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.05 Video-model picker.
- Should: User picks which video model generates the clip.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5081; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5110; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2929; apps/web/app/api/media/video/generate/route.ts:699; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:564; apps/mobile/src/features/chat/actions/runVideoGenerationTurn.ts:103; apps/mobile/src/features/video/services/videogen.ts:64

## S46.06 Duration selector.
- Should: User chooses the clip duration before generating.
- Status: web done, desktop done, mobile done, chrome missing
- Code: packages/contracts/types/src/model-catalog.ts:2304; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1190; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5057; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2996; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:197; apps/mobile/src/features/video/services/videogen.ts:63

## S46.07 Aspect-ratio selector.
- Should: User picks the aspect ratio of the clip.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4838; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2929; apps/web/app/api/media/video/generate/route.ts:699; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:656; apps/mobile/src/features/chat/actions/runVideoGenerationTurn.ts:103; apps/mobile/src/features/video/services/videogen.ts:64

## S46.08 Resolution selector.
- Should: User picks the output resolution of the clip and gets that resolution.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4890; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2929; apps/web/app/api/media/video/generate/route.ts:699; apps/mobile/src/features/video/services/videogen.ts:45; apps/mobile/src/features/video/services/videogen.ts:80

## S46.09 Supported frame-rate selector.
- Should: User picks the frame rate of the clip where the model supports it.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.10 Camera-motion instructions.
- Should: User gives camera-motion instructions (pan, dolly, zoom) for the clip.
- Status: not applicable anywhere

## S46.11 Scene/action instructions.
- Should: User describes the scene and action the clip should show.
- Status: not applicable anywhere

## S46.12 Dialogue instructions.
- Should: User writes dialogue lines the characters should speak.
- Status: not applicable anywhere

## S46.13 Generated-audio option.
- Should: User chooses whether the clip is generated with audio.
- Status: not applicable anywhere

## S46.14 Reference-audio option where supported.
- Should: User supplies reference audio (voice or music) for the clip where supported.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.15 Style presets.
- Should: User applies a style preset (cinematic, anime, etc.) to a video.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.16 Template gallery.
- Should: User starts a video from a template gallery.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.17 Character/reference selection.
- Should: User selects a saved character or reference to appear in the video.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.18 Storyboard creation.
- Should: User builds a storyboard of several shots for one video.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.19 Shot cards.
- Should: Each shot is shown as an editable card.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.20 Shot ordering.
- Should: User reorders shots.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.21 Shot duplication.
- Should: User duplicates a shot.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.22 Shot deletion.
- Should: User deletes a shot.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.23 Per-shot duration.
- Should: User sets a duration per shot.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.24 Per-shot references.
- Should: User attaches references per shot.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.25 Generation queue.
- Should: User sees a queue of pending video jobs and their order.
- Status: not applicable anywhere

## S46.26 Progress display.
- Should: User sees progress while the video is generated.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/lib/hooks/useMediaGeneration.ts:461; apps/mobile/src/features/chat/components/VideoGenProgress.tsx:89; apps/mobile/src/features/video/services/videogen.ts:112

## S46.27 Estimated or actual credit use.
- Should: User sees the estimated or actual credit cost of a video before or after generating.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5094; apps/web/features/chat/components/Composer/VideoCostEstimate.tsx:24; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1114; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1145; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:887

## S46.28 Cancel request.
- Should: User cancels a video generation in progress and the job stops.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/lib/services/video-job-reconciliation-service.ts:475; apps/mobile/src/features/video/services/videogen.ts:86

## S46.29 Retry failed job.
- Should: User retries a failed video job with the same settings.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:3192; apps/web/features/chat/pages/WebChatPage.tsx:3489; apps/mobile/src/features/chat/components/MessageBubble.tsx:1324; apps/mobile/app/(app)/chat/[id].tsx:1326

## S46.30 Completed clip gallery.
- Should: User browses all completed clips together in a gallery.
- Status: web done, desktop done, mobile done, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:82; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1104; apps/web/app/api/library/route.ts:89; apps/mobile/src/features/library/index.tsx:255; apps/mobile/src/features/library/index.tsx:216; apps/mobile/src/features/library/libraryClient.ts:62

## S46.31 Playback controls.
- Should: User plays, pauses and scrubs a finished clip in the product.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2517; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1104; apps/web/app/api/files/[id]/route.ts:130; apps/mobile/src/features/chat/components/GeneratedVideo.tsx:29; apps/mobile/src/features/chat/components/VideoPlayerModal.tsx:17

## S46.32 Download.
- Should: User downloads a finished clip as a file.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2532; apps/web/features/chat/components/messages/MessageBubble.tsx:2517; apps/web/app/api/files/[id]/route.ts:163; apps/mobile/src/features/chat/components/GeneratedVideo.tsx:131; apps/mobile/src/features/chat/components/GeneratedVideo.tsx:52

## S46.33 Share.
- Should: User shares a finished clip with someone (link or file to another app).
- Status: web missing, desktop missing, mobile done, chrome missing
- Code: apps/mobile/src/features/library/index.tsx:144; apps/mobile/src/features/library/index.tsx:216

## S46.34 Save to Project.
- Should: User saves a finished clip to a Project.
- Status: not applicable anywhere

## S46.35 Remix.
- Should: User remixes a finished clip into a new generation.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.36 Extend.
- Should: User extends a finished clip with more seconds of continuation.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S46.37 Regenerate a selected segment where supported.
- Should: User regenerates only a selected segment of a clip where supported.
- Status: web missing, desktop missing, mobile missing, chrome missing
