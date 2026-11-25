---
id: "PLAN-mobile-076"
type: "test-plan"
title: "Mobile · 76. Model-capability registry"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "76"
---
# Mobile · 76. Model-capability registry

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S76.01 Text input.

- **Expected:** The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. Text-input admission is routing logic in packages/ai/routing/src/auto.ts and the web request path; no mobile screen shows it. The quoted line at apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 no longer exists.

## S76.02 Text output.

- **Expected:** The registry records text output per model and routing only admits models that produce text for chat tasks.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. Text-output admission is routing logic (packages/ai/routing/src/auto.ts); no mobile screen shows it. The quoted ModelRow.tsx:166 line is gone.

## S76.03 Image understanding.

- **Expected:** The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Chat > Choose model > Images chip; then Chat > Add to chat > Photos (labels found in the code)
- **Needs:** a picture in the photo library; a signed-in account
- **Steps:**
  1. Open an existing chat and tap Choose model.
  2. Tap the Images chip and check that only models able to read images stay in the list.
  3. Tap Add to chat, then Photos, and choose a picture.
  4. Pick a model that is not in the Images list and send the message.
  5. Look for a refusal or a switch to an image model, and compare with Expected.

## S76.04 Multiple-image input.

- **Expected:** The registry records whether (and how many) images a model accepts in one request, and requests are checked against it.
- **Code:** done. Evidence present: apps/mobile/stores/chat/chatExecutionStore.ts:2455; apps/mobile/src/features/chat/utils/attachmentValidation.ts:188
- **Where to find it:** Chat > Add to chat > Photos (labels found in the code)
- **Needs:** several pictures; a model with a small image limit
- **Steps:**
  1. Tap Add to chat, then Photos.
  2. Select several pictures.
  3. Pick a model with a low image limit and send.
  4. Read the message shown if the count is over the limit, and compare with Expected.

## S76.06 Native PDF/document input.

- **Expected:** The registry records native PDF input per model and PDFs go natively to models that accept them.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:178
- **Where to find it:** Chat > Choose model > Files chip; then Chat > Add to chat > File (labels found in the code)
- **Needs:** a PDF file; a cloud account
- **Steps:**
  1. Tap Choose model and tap the Files chip; note which models remain.
  2. Tap Add to chat, then File, and choose a PDF.
  3. Send the PDF with a model that is not in the Files list.
  4. Compare the result with Expected.

## S76.09 Realtime audio input.

- **Expected:** The registry names the realtime audio-input model and live voice sessions start on that registry model.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx:44; apps/mobile/src/features/voice/services/liveVoiceSession.ts:11 (quoted code not found in the file now); apps/web/app/api/voice/live/sessions/route.ts:189
- **Where to find it:** Chat > Start voice mode (labels found in the code)
- **Needs:** a microphone; a native build of the app; a signed-in AGI Cloud account
- **Steps:**
  1. Tap the Start voice mode button in the chat composer.
  2. Allow the microphone when asked.
  3. Say a short question.
  4. Listen for a spoken reply and watch the live voice bar.
  5. Compare with Expected.

## S76.10 Speech output.

- **Expected:** The registry records which models produce speech and spoken output uses a registry-chosen model.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/services/serverSpeech.ts:10; apps/mobile/src/features/voice/services/voiceOutput.ts:15 (quoted code not found in the file now)
- **Where to find it:** Chat > (assistant reply) > Read aloud (labels found in the code)
- **Needs:** a device with sound on; a speech voice installed on the device
- **Steps:**
  1. Send a message and wait for the reply.
  2. Tap Read aloud under the reply.
  3. Listen to the spoken reply.
  4. Tap Stop reading aloud to stop it, then compare with Expected.

## S76.11 Realtime speech-to-speech.

- **Expected:** The registry names the realtime speech-to-speech model/route and live voice uses it for spoken replies.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx:44; apps/mobile/src/features/voice/services/liveVoiceSession.ts:11 (quoted code not found in the file now); apps/web/app/api/voice/live/sessions/route.ts:189
- **Where to find it:** Chat > Start voice mode (labels found in the code)
- **Needs:** a microphone; a native build; a signed-in AGI Cloud account
- **Steps:**
  1. Tap Start voice mode in the composer.
  2. Allow the microphone.
  3. Ask a question out loud.
  4. Check that the reply is spoken and the live voice bar shows the session.
  5. Compare with Expected.

## S76.14 Image generation.

- **Expected:** The registry records image-generation models and image requests are admitted only for models that generate images.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:336; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:269
- **Where to find it:** Chat > Add to chat > Create image (labels found in the code)
- **Needs:** cloud mode; a plan that includes image generation
- **Steps:**
  1. Tap Add to chat.
  2. Tap Create image (only shown in cloud mode when an image model is granted).
  3. Type a prompt and send.
  4. Check that the image is made and compare with Expected.

## S76.15 Image editing.

- **Expected:** The registry determines which image models accept a source image, and edit requests are refused for models that cannot edit.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:336; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:214
- **Where to find it:** Chat > Add to chat > Create image > Photos (labels found in the code)
- **Needs:** cloud mode; a picture to use as the reference
- **Steps:**
  1. Tap Add to chat, then Create image.
  2. Tap Add to chat again and then Photos to add a reference picture.
  3. Pick an image model that cannot use a reference image, then send.
  4. Check for the message in the code and compare with Expected.

## S76.17 Video generation.

- **Expected:** The registry records video-generation models and their durations/sizes, and video requests are validated against them.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:342; apps/mobile/src/features/chat/actions/resolveMobileVideoGenerationRequest.ts:118; apps/mobile/src/features/video/services/videogen.ts (text found, layout changed)
- **Where to find it:** Chat > Add to chat > Create video (labels found in the code)
- **Needs:** cloud mode; a plan that includes video generation
- **Steps:**
  1. Tap Add to chat, then Create video (only in cloud mode with a video model granted).
  2. Look at the duration choices offered, then type a prompt.
  3. Choose a duration and send.
  4. Check the video length and size against the choices, and compare with Expected.

## S76.19 Generated video audio.

- **Expected:** The registry records whether a video model generates audio, and generated videos include audio only where the model supports it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:342; apps/mobile/src/features/video/services/videogen.ts (text found, layout changed); apps/web/app/api/media/video/generate/route.ts:1208
- **Where to find it:** no screen of its own. There is no audio toggle. The audio flag is set from the model's supportsAudio in AddToChatSheet.tsx near line 319, so the effect is only seen as sound or silence in the result.
- **Needs:** cloud mode; a video-capable plan
- **Steps:**
  1. Create a video with Create video (Chat > Add to chat > Create video).
  2. Play the finished video.
  3. Listen for sound and compare with Expected.

## S76.21 Function/tool calling.

- **Expected:** The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5406; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Chat > Add to chat (Run code and Web search rows) (labels found in the code)
- **Needs:** a model that supports tools and one that does not
- **Steps:**
  1. Choose a model that supports tools from Choose model.
  2. Tap Add to chat and look for the Run code and Web search rows.
  3. Choose a model without tool support, reopen Add to chat, and check the rows again.
  4. Compare with Expected.

## S76.22 Parallel tool calls.

- **Expected:** The registry records whether a model supports parallel tool calls and the tool loop uses it.
- **Code:** done. Evidence present: packages/ai/model-registry/catalog/harnesses.json:39; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5400; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts (text found, layout changed)
- **Where to find it:** no screen of its own. Parallel tool calls run in the server tool loop (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts); the app has no control and no visible effect was identified.

## S76.23 Multi-round tool use.

- **Expected:** The registry records agentic (multi-round tool) capability and the request path uses it.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. Multi-round tool use is server-side; Deep research is the closest visible feature, and the link to the registry flag was not traced.
- **Needs:** a plan that includes Deep research
- **Steps:**
  1. Turn on Deep research from Chat > Add to chat.
  2. Send a question that needs research.
  3. Watch the answer build up over several steps and compare with Expected.

## S76.26 Reasoning-effort controls.

- **Expected:** The registry records per-model reasoning-effort levels and each surface offers and sends only those levels.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/EffortSlider.tsx:38; apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Chat > Choose model > Effort slider (labels found in the code)
- **Needs:** a cloud account; a model that supports reasoning effort
- **Steps:**
  1. Tap Choose model in a cloud chat.
  2. Pick a model that shows an Effort section.
  3. Move the Effort slider across its steps.
  4. Pick a model without the Effort section and check it disappears.
  5. Compare with Expected.

## S76.28 Context-window limit.

- **Expected:** The registry records each model context window; the product shows it and trims or refuses over-long requests accordingly.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:173 (quoted code not found in the file now)
- **Where to find it:** Chat > Chat is getting long. View what is in context (labels found in the code)
- **Needs:** a long chat near the context limit
- **Steps:**
  1. Open a long chat that uses most of the model's context window.
  2. Look for the warning banner.
  3. Tap View what is in context.
  4. Read the About X of Y tokens line and compare with Expected.

## S76.29 Output-token limit.

- **Expected:** The registry records each model output-token limit; requests are capped by it and it is shown.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:174 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/mobile for maxOutput, Max output and output limit. The field appears only in apps/mobile/src/features/model-picker/service.ts and no visible text was found.

## S76.31 Streaming capabilities.

- **Expected:** The registry records streaming support per model and the request path picks a transport accordingly.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. The transport choice is in apps/mobile/services/streaming.ts; the visible effect is the reply filling in gradually.
- **Needs:** a signed-in account
- **Steps:**
  1. Send a message in a cloud chat.
  2. Watch the reply appear while it is being written.
  3. Compare with Expected.

## S76.32 Cache capabilities.

- **Expected:** The registry records prompt-cache capability and route cache class, and routing/caching decisions use them.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1169; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2822
- **Where to find it:** no screen of its own. Prompt-cache capability and cache class drive routing (packages/ai/routing/src/auto.ts); the mobile app shows no control or visible effect.

## S76.34 Regional route availability.

- **Expected:** The registry records model and provider residency regions and routing refuses routes outside the required region.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1055
- **Where to find it:** no screen of its own. Route residency is enforced in routing (packages/ai/routing/src/auto.ts); the mobile model picker and privacy screens have no region control or text.

## S76.35 Retention/data-use constraints.

- **Expected:** The registry records provider/route data retention and routing honours zero-retention requirements.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1099
- **Where to find it:** Settings > Privacy > Chat privacy (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and tap Privacy.
  2. Tap Chat privacy.
  3. Read the footnote about cloud chat retention.
  4. Compare with Expected.

## S76.37 Model lifecycle and retirement.

- **Expected:** The registry records lifecycle stage, deprecation and retirement, and pickers/routing exclude or label models accordingly.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1353
- **Where to find it:** Chat > Choose model > Retires badge; Chat > (retired chat) notice (labels found in the code)
- **Needs:** a chat on a retired model, or a model with a retirement date within 30 days
- **Steps:**
  1. Tap Choose model and look for a Retires badge next to a model in the list.
  2. Open a chat that used a retired model, if one exists.
  3. Read the notice at the top of the chat.
  4. Compare with Expected.

## S76.38 Route-specific differences.

- **Expected:** The registry records route-dependent capabilities, cache class, retention and price per provider route, and routing ranks routes by them.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1099; packages/ai/routing/src/auto.ts:1169
- **Where to find it:** no screen of its own. Route ranking, cache class, retention and price per route are applied in packages/ai/routing/src/auto.ts and the web request path; no mobile control or visible effect was identified.
