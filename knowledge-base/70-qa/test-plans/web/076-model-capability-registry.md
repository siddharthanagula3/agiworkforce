---
id: "PLAN-web-076"
type: "test-plan"
title: "Web · 76. Model-capability registry"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "76"
---
# Web · 76. Model-capability registry

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S76.01 Text input.

- **Expected:** The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:310; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** Model name button in the composer footer > All models > info button on a model row > Capabilities (labels found in the code)
- **Steps:**
  1. Sign in and look at the composer at the bottom of a chat.
  2. Click the model name button in the composer footer.
  3. Click All models.
  4. Open the info button of a model row (its name is "About" followed by the model name).
  5. Read the Capabilities section. A model with no other capability shows "Text only". Compare with Expected: text input is recorded per model, and chat models accept text.

## S76.02 Text output.

- **Expected:** The registry records text output per model and routing only admits models that produce text for chat tasks.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:310; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. No screen shows a text-output value. The only related word is "Text only" (apps/web/features/chat/components/Composer/ModelCatalogue.tsx), which describes capability chips, not output.
- **Steps:**
  1. Send a plain text message to any model.
  2. Check that a text answer appears in the chat, as Expected says models produce text for chat tasks.

## S76.03 Image understanding.

- **Expected:** The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:129; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Model name button in the composer footer > All models > Vision chip under Filter by capability (labels found in the code)
- **Needs:** a photo file (PNG or JPEG) and a chat with a model that cannot read images
- **Steps:**
  1. Click the model name button in the composer footer, then click All models.
  2. Click the Vision chip under Filter by capability. Each listed model should show Vision under Capabilities.
  3. Pick a model that does not show Vision, click the round + button at the left of the composer, and click Add photos & files.
  4. Choose a photo, type a question about it, and send.
  5. Compare with Expected: the app should refuse the image turn or reroute it. The server refusal text is "The selected model cannot read images. Choose a vision-capable model."

## S76.04 Multiple-image input.

- **Expected:** The registry records whether (and how many) images a model accepts in one request, and requests are checked against it.
- **Code:** done. Evidence moved: packages/ai/model-registry/catalog/harnesses.json:35; packages/ai/model-registry/catalog/models.curation.json:1465 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:60; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5131
- **Where to find it:** Round + button at the left of the composer > Add photos & files, then send (labels found in the code)
- **Needs:** several image files and a model with an image limit (the limit is not shown on screen)
- **Steps:**
  1. Pick a model in the composer footer.
  2. Click the round + button at the left of the composer.
  3. Click Add photos & files and choose more images than the model accepts.
  4. Send the message and read the error. Expected: the request is checked against the model's image limit.
  5. The server error reads "The selected model takes up to N images in one request. Remove some images or split the request."

## S76.06 Native PDF/document input.

- **Expected:** The registry records native PDF input per model and PDFs go natively to models that accept them.
- **Code:** done. Evidence moved: packages/ai/model-registry/catalog/models.curation.json:1465 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:725; apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:80; apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:178; packages/ai/providers/openai/src/translate.ts:60
- **Where to find it:** Round + button at the left of the composer > Add photos & files, then send a question about the PDF (labels found in the code)
- **Needs:** a PDF file and a chat model
- **Steps:**
  1. Click the round + button at the left of the composer.
  2. Click Add photos & files and choose a PDF.
  3. Ask a question that only the PDF's text can answer, then send.
  4. Check that the answer uses the PDF content, which Expected says goes to models that accept PDFs natively.

## S76.07 Audio understanding.

- **Expected:** The registry records audio input per model and the product uses it to show or gate audio understanding.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:153
- **Where to find it:** Model name button in the composer footer > All models > Audio in chip (labels found in the code)
- **Steps:**
  1. Click the model name button in the composer footer, then click All models.
  2. Click the Audio in chip under Filter by capability.
  3. Open the info button of a listed model and read Capabilities. It should show Audio in.
  4. Compare with Expected: the list shows only models that accept audio input.

## S76.08 Audio transcription.

- **Expected:** The registry names the transcription model(s) and dictation/transcription requests use that registry choice.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2048; apps/web/features/chat/stores/voice-input-store.ts:11
- **Where to find it:** Composer microphone button labelled Start voice input (labels found in the code)
- **Needs:** a microphone and a browser that allows microphone access (the app suggests Chrome or Edge)
- **Steps:**
  1. Click the microphone button labelled Start voice input in the composer.
  2. Allow microphone access when the browser asks.
  3. Say a short sentence, then click the button again to stop.
  4. Check that the spoken words appear in the message box, as Expected says dictation uses the registry transcription model.

## S76.09 Realtime audio input.

- **Expected:** The registry names the realtime audio-input model and live voice sessions start on that registry model.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:179; apps/web/app/api/voice/live/sessions/route.ts:189
- **Where to find it:** Composer button labelled Start voice mode (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Click the button labelled Start voice mode in the composer.
  2. Allow microphone access when the browser asks.
  3. Say a short sentence out loud.
  4. Check that captions or a transcript of your words appear on the voice screen, as Expected says live voice starts on the registry model.

## S76.10 Speech output.

- **Expected:** The registry records which models produce speech and spoken output uses a registry-chosen model.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1169 (quoted code not found in the file now); apps/web/lib/hooks/useTTS.ts:31 (quoted code not found in the file now); apps/web/app/api/voice/speech/route.ts:102; apps/web/app/api/voice/speech/route.ts:183
- **Where to find it:** Read message aloud button under an assistant reply (labels found in the code)
- **Needs:** speakers or headphones
- **Steps:**
  1. Send a message and wait until the full reply is finished.
  2. Hover over the reply and find the button labelled Read message aloud.
  3. Click it and listen for speech from the speakers or headphones.
  4. Click the button again, now labelled Stop reading message, to stop.
  5. Check that the speech comes from a model the registry chose, as Expected says. The model is not named on screen.

## S76.11 Realtime speech-to-speech.

- **Expected:** The registry names the realtime speech-to-speech model/route and live voice uses it for spoken replies.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:179; apps/web/app/api/voice/live/sessions/route.ts:189
- **Where to find it:** Composer button labelled Start voice mode, then ask a question out loud (labels found in the code)
- **Needs:** a microphone and speakers or headphones
- **Steps:**
  1. Click Start voice mode in the composer.
  2. Allow microphone access.
  3. Ask a spoken question.
  4. Listen for the spoken reply and compare with Expected: live voice uses a speech-to-speech model for spoken replies.

## S76.14 Image generation.

- **Expected:** The registry records image-generation models and image requests are admitted only for models that generate images.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:144; apps/web/app/api/media/image/generate/route.ts:423 (quoted code not found in the file now)
- **Where to find it:** Round + button at the left of the composer > Create image (labels found in the code)
- **Needs:** none (plan limits, if any, were not checked)
- **Steps:**
  1. Click the round + button at the left of the composer.
  2. Click Create image.
  3. Type a picture prompt and send.
  4. Check that an image appears in the reply.
  5. Open All models and click the Image out chip to see which models make images, then compare with Expected.

## S76.15 Image editing.

- **Expected:** The registry determines which image models accept a source image, and edit requests are refused for models that cannot edit.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1371; apps/web/app/api/media/image/generate/route.ts:698 (quoted code not found in the file now)
- **Where to find it:** Round + button > Add photos & files (attach a picture) > Create image > Image model menu > Attached image action menu (labels found in the code)
- **Needs:** a picture file; a model list that includes an edit-capable model
- **Steps:**
  1. Click the round + button, then Add photos & files, and attach one picture.
  2. Click Create image.
  3. Open the Image model menu and choose a model.
  4. Open the Attached image action menu and pick Edit (Mask edit appears only with a second mask image).
  5. Type the change, send, and compare with Expected: a model that cannot edit should show the notice "... cannot edit an attached image."

## S76.17 Video generation.

- **Expected:** The registry records video-generation models and their durations/sizes, and video requests are validated against them.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:149; apps/web/features/media/services/media-api-service.ts:195 (quoted code not found in the file now); apps/web/app/api/media/video/generate/route.ts:454
- **Where to find it:** Round + button at the left of the composer > Create video (labels found in the code)
- **Needs:** none (plan limits, if any, were not checked)
- **Steps:**
  1. Click the round + button, then click Create video.
  2. Type a short prompt.
  3. Open the Video length, Video quality and Video aspect ratio menus and pick values.
  4. Send and wait for the job to finish.
  5. Compare the length and aspect ratio of the result with what you picked. Expected: video requests are checked against the model's durations and sizes.

## S76.19 Generated video audio.

- **Expected:** The registry records whether a video model generates audio, and generated videos include audio only where the model supports it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:149; apps/web/features/media/services/media-api-service.ts:195 (quoted code not found in the file now); apps/web/app/api/media/video/generate/route.ts:1208; apps/web/app/api/media/video/generate/route.ts:469
- **Where to find it:** no screen of its own. I found no audio switch in apps/web/features. The server decides generateAudio from the model or the request (apps/web/app/api/media/video/generate/route.ts, line 1208).
- **Needs:** a generated video and speakers or headphones
- **Steps:**
  1. Generate a video (see S76.17).
  2. Play the finished video with the speakers on.
  3. Check whether the video has sound, and compare with Expected: it has audio only where the model supports it.

## S76.21 Function/tool calling.

- **Expected:** The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:135; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5406; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Model name button in the composer footer > All models > Tools chip under Filter by capability (labels found in the code)
- **Steps:**
  1. Click the model name button in the composer footer, then click All models.
  2. Click the Tools chip under Filter by capability.
  3. Open the info button of a listed model and read Capabilities. It should show Tools.
  4. Compare with Expected: tool-dependent turns go only to tool-capable models. A model without tools shows the refusal "The selected model cannot load skills. Choose a tool-capable model." when a skill is used.

## S76.22 Parallel tool calls.

- **Expected:** The registry records whether a model supports parallel tool calls and the tool loop uses it.
- **Code:** done. Evidence present: packages/ai/model-registry/catalog/harnesses.json:39; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5400; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts (text found, layout changed)
- **Where to find it:** no screen of its own. No control or label shows parallel tool support. It is set in the registry (packages/ai/model-registry/catalog/harnesses.json) and used in apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts.
- **Needs:** tools connected to the account
- **Steps:**
  1. Send a request that needs two independent tools (for example a search and a file lookup, if connected).
  2. Look at the tool cards in the reply and check whether the calls ran together, as Expected says the tool loop uses parallel support.

## S76.23 Multi-round tool use.

- **Expected:** The registry records agentic (multi-round tool) capability and the request path uses it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:135; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. No screen says agentic or multi-round. The closest visible word is the Tools chip (apps/web/features/chat/components/Composer/ModelCatalogue.tsx), which only shows tool calling.
- **Needs:** tools connected to the account
- **Steps:**
  1. Send a request that needs a second tool call after the first one's result.
  2. Check that the reply shows a second tool step after the first.

## S76.26 Reasoning-effort controls.

- **Expected:** The registry records per-model reasoning-effort levels and each surface offers and sends only those levels.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1313; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Model name button in the composer footer > Reasoning effort panel (labels found in the code)
- **Needs:** a paid account to see levels marked "not included"
- **Steps:**
  1. Click the model name button in the composer footer.
  2. Open the Reasoning effort panel and look at the levels offered.
  3. Levels are named Direct, Brief, Quick, Balanced, Deep, Extended and Maximum. Only the levels the model supports should appear.
  4. Pick a level, send a message, and compare with Expected: each surface offers and sends only the levels the registry records.

## S76.28 Context-window limit.

- **Expected:** The registry records each model context window; the product shows it and trims or refuses over-long requests accordingly.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:185 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:330; packages/ai/routing/src/auto.ts:1417
- **Where to find it:** Model name button in the composer footer > All models > info button on a model row > Context ceiling (labels found in the code)
- **Steps:**
  1. Click the model name button in the composer footer, then click All models.
  2. Open the info button of a model row.
  3. Read the Context ceiling value (for example in K or M).
  4. Compare with Expected: the value shows the model's context window.

## S76.29 Output-token limit.

- **Expected:** The registry records each model output-token limit; requests are capped by it and it is shown.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:189 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5874
- **Where to find it:** Model name button in the composer footer > All models > info button on a model row > Output ceiling (labels found in the code)
- **Steps:**
  1. Click the model name button in the composer footer, then click All models.
  2. Open the info button of a model row.
  3. Read the Output ceiling value.
  4. Compare with Expected: the value shows the model's output-token limit.

## S76.31 Streaming capabilities.

- **Expected:** The registry records streaming support per model and the request path picks a transport accordingly.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. No streaming control or label appears on screen. The transport is chosen in the provider code.
- **Steps:**
  1. Send a prompt that asks for a long answer.
  2. Watch whether text appears before the answer is finished, as Expected says streaming depends on the model.

## S76.32 Cache capabilities.

- **Expected:** The registry records prompt-cache capability and route cache class, and routing/caching decisions use them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/routing/src/auto.ts:1169; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2822
- **Where to find it:** Model name button in the composer footer, in a chat that already has replies > choose a different model (labels found in the code)
- **Needs:** an existing chat with earlier replies
- **Steps:**
  1. Open a chat that already has at least one earlier reply.
  2. Click the model name button in the composer footer and choose a different model.
  3. Read the note under the picker: "Switching models here starts a new prompt cache".
  4. Compare with Expected: the app shows the cache effect of switching models.

## S76.34 Regional route availability.

- **Expected:** The registry records model and provider residency regions and routing refuses routes outside the required region.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/routing/src/auto.ts:1055
- **Where to find it:** no screen of its own. I searched ModelCatalogue, ComposerFooter, ChatComposerNew and packages/ui/unified-chat for region or residency wording and found nothing per model. Public pages such as apps/web/app/data-use/page.tsx are general, not per model.

## S76.35 Retention/data-use constraints.

- **Expected:** The registry records provider/route data retention and routing honours zero-retention requirements.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/routing/src/auto.ts:1099
- **Where to find it:** no screen of its own. I searched the picker and settings for retention wording and found no per-model retention label. Routing uses retention in apps/web/features/chat/components/Composer/ComposerFooter.tsx and packages/ai/routing/src/auto.ts; effects are not visible on screen.

## S76.37 Model lifecycle and retirement.

- **Expected:** The registry records lifecycle stage, deprecation and retirement, and pickers/routing exclude or label models accordingly.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:193 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1353
- **Where to find it:** Model name button in the composer footer > All models, then look at row tags and the "Leaving" note (labels found in the code)
- **Needs:** none (a model in its last 30 days before retirement may not exist)
- **Steps:**
  1. Click the model name button in the composer footer, then click All models.
  2. Look at each row's tags for Preview, Experimental, Beta or Alpha, and for Coming soon.
  3. Look for grey text "Leaving <date>" under a row name. It appears only within 30 days before retirement.
  4. Try to pick a "Coming soon" model and check it does not start, as Expected says pickers exclude or label such models.

## S76.38 Route-specific differences.

- **Expected:** The registry records route-dependent capabilities, cache class, retention and price per provider route, and routing ranks routes by them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/routing/src/auto.ts:1099; packages/ai/routing/src/auto.ts:1169
- **Where to find it:** Open the /operator page (platform admin account only), then click the tab labelled Routes (the tab text is lowercase "routes" and is shown capitalised). The heading on the panel reads Routes. (labels found in the code)
- **Needs:** a platform admin account (not a normal Free or paid account)
- **Steps:**
  1. Sign in with a platform admin account and go to /operator.
  2. Click the Routes tab.
  3. Read the heading Routes and the line below it, which says every route the registry declares is listed with what it costs.
  4. Click a route row to expand it.
  5. Look for the detail labels Cache class and Data retention on the expanded row, and compare with Expected (cache class and data retention per provider route).
