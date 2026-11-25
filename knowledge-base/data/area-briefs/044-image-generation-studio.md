# Area 44. Image-generation studio

36 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S44.01 Text-to-image composer.
- Should: User enters an image mode, types a prompt, and gets a generated image back in the conversation.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/app/api/media/image/generate/route.ts:177

## S44.02 Image-model picker.
- Should: User picks which image model generates the image, from models the deployment can run.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4982; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1068; apps/web/app/api/media/image/generate/route.ts:422; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:560; apps/mobile/src/features/chat/actions/mediaMode.ts:48; apps/mobile/src/features/image/services/imagegen.ts:49; apps/cli/src/lib.rs:958; apps/cli/src/cloud/image.rs:107

## S44.03 Style presets.
- Should: User picks a style preset (photo, illustration, etc.) that changes the generated look.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/chat/lib/imageGenerationOptions.ts:95; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4785; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4797

## S44.04 Reference-image slots.
- Should: User attaches one or more reference images in dedicated slots that guide the generation.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: packages/contracts/cloud-contracts/src/managed-media.ts:85; packages/contracts/cloud-contracts/src/managed-media.ts:102; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2935; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4943; apps/web/app/api/media/image/lib/image-generation-provider.ts:474; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:283; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:194

## S44.05 Prompt suggestions.
- Should: Image mode offers example or suggested prompts the user can pick.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S44.06 Prompt enhancement with user control.
- Should: User can have the product rewrite/enhance the image prompt and review or reject the rewrite before generating.
- Status: web missing, desktop missing, cli missing, chrome missing

## S44.07 Aspect-ratio selector.
- Should: User picks the aspect ratio of the generated image from ratios the model supports.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4661; apps/web/features/chat/lib/imageGenerationOptions.ts:144; apps/web/app/api/media/image/generate/route.ts:500; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:602; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:232; apps/cli/src/lib.rs:999; apps/cli/src/cloud/image.rs:46; apps/cli/src/cloud/image.rs:1042

## S44.08 Size/resolution selector.
- Should: User picks the output size or resolution of the image.
- Status: cli done
- Code: apps/cli/src/lib.rs:950; apps/cli/src/cloud/image.rs:277

## S44.09 Quality selector.
- Should: User picks a quality level (standard/HD) for the image.
- Status: cli done
- Code: apps/cli/src/lib.rs:953; apps/cli/src/cloud/image.rs:278

## S44.10 Output-count selector.
- Should: User picks how many images to generate and sees all of them.
- Status: cli done
- Code: apps/cli/src/lib.rs:956; apps/cli/src/cloud/image.rs:304

## S44.11 Background transparency option.
- Should: User asks for a transparent background on the generated image.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4921; apps/web/app/api/media/image/lib/image-generation-provider.ts:532; apps/web/app/api/media/image/lib/image-job-executor.ts:608; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:831; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:189; apps/cli/src/lib.rs:1009; apps/cli/src/cloud/image.rs:52; apps/cli/src/cloud/image.rs:446

## S44.12 Supported seed control.
- Should: User sets a seed (on models that support it) to reproduce an image.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S44.13 Supported negative-prompt control.
- Should: User enters a negative prompt (what to avoid) on models that support it.
- Status: not applicable anywhere

## S44.14 Generation-cost indication.
- Should: Before or after generating, the user sees what the image costs (credits or money).
- Status: not applicable anywhere

## S44.15 Remaining-generation allowance.
- Should: User sees how many image generations remain in their allowance before hitting a limit.
- Status: not applicable anywhere

## S44.16 Generation queue.
- Should: User can queue several image generations and see their status in a queue view.
- Status: not applicable anywhere

## S44.17 In-progress previews where supported.
- Should: While generating, partial/preview images appear before the final one (where the model supports it).
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S44.18 Cancel generation.
- Should: User stops an image generation in progress and the job is cancelled (not billed further).
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5891; apps/web/features/chat/pages/WebChatPage.tsx:3519; apps/web/lib/hooks/useMediaGeneration.ts:152; apps/web/lib/hooks/useMediaGeneration.ts:158; apps/web/app/api/media/image/cancel/route.ts:80; apps/mobile/stores/chat/chatMessageStore.ts:1131; apps/mobile/src/features/image/services/imagegen.ts:94; apps/cli/src/cloud/image.rs:987

## S44.19 Retry generation.
- Should: After a failed or stopped generation, user retries it in place with the same prompt.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:1076; apps/web/features/chat/pages/WebChatPage.tsx:2570; apps/mobile/src/features/chat/components/MessageBubble.tsx:869; apps/mobile/src/features/chat/components/MessageBubble.tsx:328; apps/cli/src/cloud/image.rs:839; apps/cli/src/cloud/image.rs:870; apps/cli/src/lib.rs:1023; apps/cli/src/cloud/image.rs:1176

## S44.20 Variation generation.
- Should: User asks for variations of a generated image.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:661; apps/web/features/chat/components/ImageGenerationCard.tsx:484; packages/contracts/cloud-contracts/src/managed-media.ts:52

## S44.21 Image grid.
- Should: Generated images are browsable together in a grid.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/app/chat/library/page.tsx:3; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1268; apps/web/app/api/library/route.ts:88; apps/mobile/src/features/library/index.tsx:273; apps/mobile/src/features/library/index.tsx:97

## S44.22 Full-screen image viewer.
- Should: User opens a generated image in a full-screen viewer.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1021; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1064; apps/mobile/src/features/chat/components/MessageBubble.tsx:881; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:56; apps/cli/src/tui/tui_app.rs:3292; apps/cli/src/tui/tui_app.rs:3297

## S44.23 Prompt and settings inspection.
- Should: User can see the prompt and generation settings (model, ratio, size, quality) used for an image.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:1078; apps/mobile/src/features/image/imageSettingsCaption.ts:7; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:43; apps/cli/src/cloud/image.rs:208; apps/cli/src/cloud/image.rs:604; apps/cli/src/cloud/image.rs:694; apps/cli/src/lib.rs:2091; apps/cli/src/tui/tui_app.rs:3817

## S44.24 Reuse prompt.
- Should: User reuses the prompt of an earlier image in one action.
- Status: web done, desktop done, mobile missing, cli done, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1621; apps/web/features/library/lib/library-chat-handoff.ts:33; apps/cli/src/lib.rs:1019; apps/cli/src/cloud/image.rs:737; apps/cli/src/cloud/image.rs:1170

## S44.25 Reuse settings.
- Should: User regenerates with the same settings (model, ratio) as an earlier image.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/library/lib/library-chat-handoff.ts:60; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1211; apps/web/shared/stores/web-chat-store.ts:96; apps/mobile/src/features/library/index.tsx:303; apps/mobile/src/features/library/index.tsx:388; apps/cli/src/cloud/image.rs:737; apps/cli/src/cloud/image.rs:667; apps/cli/src/cloud/image.rs:750

## S44.26 Favorite image.
- Should: User marks a generated image as a favorite and can find favorites later.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S44.27 Save to Library.
- Should: Generated images are saved to the user's Library and reappear there later.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/app/chat/library/page.tsx:3; apps/web/features/chat/pages/WebChatPage.tsx:2353; apps/web/app/api/media/image/lib/image-job-executor.ts:420; apps/mobile/src/features/library/index.tsx:97; apps/mobile/src/features/chat/components/MessageBubble.tsx:967; apps/mobile/src/features/image/services/imagegen.ts:49; apps/cli/src/lib.rs:940; apps/cli/src/cloud/image.rs:261

## S44.28 Add to Project.
- Should: User adds a generated image to a Project.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227; apps/web/app/api/projects/[id]/knowledge-files/route.ts:380; apps/web/app/api/projects/[id]/knowledge-files/route.ts:381

## S44.29 Download full-quality image.
- Should: User downloads the generated image at full quality.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:939; apps/web/features/chat/components/ImageGenerationCard.tsx:85; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:199; apps/mobile/services/fileCreation.ts:427; apps/cli/src/lib.rs:946; apps/cli/src/cloud/image.rs:305

## S44.30 Copy image.
- Should: User copies the image itself to the clipboard.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:163; apps/web/features/chat/components/ImageGenerationCard.tsx:880; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:212; apps/mobile/services/fileCreation.ts:464

## S44.31 Share image.
- Should: User shares a generated image with someone else (link or file to another app).
- Status: mobile done
- Code: apps/mobile/src/features/chat/components/ImageFullScreen.tsx:175; apps/mobile/services/fileCreation.ts:412

## S44.32 Share prompt.
- Should: User shares or copies the prompt of a generated image as a reusable recipe.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S44.33 Edit image.
- Should: User edits a generated or uploaded image by describing the change, and the source pixels are edited.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:759; apps/web/features/chat/components/ImageGenerationCard.tsx:457; apps/web/app/api/media/image/lib/image-generation-provider.ts:458; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:376; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:235; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:142

## S44.34 Animate image into video.
- Should: User turns a generated image into a video (image-to-video).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S44.35 Report generated output.
- Should: User reports a generated image as harmful or wrong to trust and safety.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3085; apps/web/features/chat/components/messages/MessageBubble.tsx:936; apps/mobile/src/features/chat/components/MessageBubble.tsx:1126; apps/mobile/stores/chat/chatMessageStore.ts:753

## S44.36 Content/provenance labeling.
- Should: Generated images are labelled as AI-generated (visibly and in machine-readable provenance).
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/components/ImageGenerationCard.tsx:968; apps/web/app/api/files/[id]/route.ts:115; apps/mobile/stores/chat/chatMessageStore.ts:753; apps/mobile/src/features/image/services/imagegen.ts:49; apps/cli/src/cloud/image.rs:1086; apps/cli/src/cloud/image_provenance.rs:51; apps/cli/src/cloud/image_provenance.rs:81; apps/cli/src/cloud/image_provenance.rs:4
