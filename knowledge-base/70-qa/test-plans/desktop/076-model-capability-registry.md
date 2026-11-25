---
id: "PLAN-desktop-076"
type: "test-plan"
title: "Desktop · 76. Model-capability registry"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "76"
---
# Desktop · 76. Model-capability registry

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S76.01 Text input.

- **Expected:** The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:310; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. Text input is not listed as its own item; the only visible sign is the absence of a chip and the Text only label, and routing to text-only handling was not confirmed in the UI.
- **Steps:**
  1. Click the model name button in the composer footer (its label ends in Change model).
  2. In the Models dialog, click the About button on any model row.
  3. Read the Capabilities line on the card.
  4. Compare: every model accepts text, so text input has no chip of its own; a model with no other chip shows Text only.

## S76.02 Text output.

- **Expected:** The registry records text output per model and routing only admits models that produce text for chat tasks.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:310; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. No separate text-output control or chip exists; text output is shown only by replies appearing in the chat.
- **Steps:**
  1. Click the model name button in the composer footer.
  2. Click About on a model row.
  3. Read the Capabilities line and check that a chat reply comes back as text.

## S76.03 Image understanding.

- **Expected:** The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:129; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Composer > More composer options > Add photos & files, then pick a picture; Models > About <model name> > Capabilities > Vision (labels found in the code)
- **Needs:** a picture file to upload, a model without Vision and one with Vision
- **Steps:**
  1. Click the model name button in the composer footer and click About on a model without a Vision chip.
  2. Close the picker, click More composer options and choose Add photos & files, then pick a JPG or PNG file.
  3. Click Send or look at the composer alert.
  4. Compare: the alert should read The selected model can't read the attached image. Switch to Auto, choose an image-capable model, or remove the image. Switch to a model with the Vision chip and the alert should not appear.

## S76.04 Multiple-image input.

- **Expected:** The registry records whether (and how many) images a model accepts in one request, and requests are checked against it.
- **Code:** done. Evidence moved: packages/ai/model-registry/catalog/harnesses.json:35; packages/ai/model-registry/catalog/models.curation.json:1465 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:60; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5131
- **Where to find it:** no screen of its own. Per-request image count limits are enforced in apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts; no visible image-count message was found in the web composer.
- **Needs:** several picture files to upload
- **Steps:**
  1. Click More composer options and choose Add photos & files.
  2. Select several pictures in one go and click Send.
  3. Compare: the request should go through or fail with a message about the image limit.

## S76.06 Native PDF/document input.

- **Expected:** The registry records native PDF input per model and PDFs go natively to models that accept them.
- **Code:** done. Evidence moved: packages/ai/model-registry/catalog/models.curation.json:1465 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:725; apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:80; apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:178; packages/ai/providers/openai/src/translate.ts:60
- **Where to find it:** Composer > More composer options > Add photos & files, then pick a PDF file (labels found in the code)
- **Needs:** a PDF file to upload
- **Steps:**
  1. Click the model name button and pick a model that cannot read documents.
  2. Click More composer options and choose Add photos & files, then pick a PDF.
  3. Click Send or look at the composer alert.
  4. Compare: the alert should read The selected model can't read the attached document. Switch to Auto, choose a document-capable model, or remove the file. Switching to a document-capable model should remove the alert.

## S76.07 Audio understanding.

- **Expected:** The registry records audio input per model and the product uses it to show or gate audio understanding.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:153
- **Where to find it:** Models picker > About <model name> > Capabilities > Audio in (labels found in the code)
- **Steps:**
  1. Click the model name button in the composer footer.
  2. Click About on a model row.
  3. Look at the Capabilities chips on the card.
  4. Compare: a model that accepts audio input shows an Audio in chip; other models do not.

## S76.08 Audio transcription.

- **Expected:** The registry names the transcription model(s) and dictation/transcription requests use that registry choice.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2048; apps/web/features/chat/stores/voice-input-store.ts:11
- **Where to find it:** Settings > Voice > Dictation; then the composer microphone button Start voice input (labels found in the code)
- **Needs:** a microphone; a Free account may have dictation limits
- **Steps:**
  1. Open Settings and click Voice.
  2. Turn on the Dictation switch and check Dictation language.
  3. Close Settings, click the microphone button labelled Start voice input in the composer, and speak.
  4. Compare: the spoken words should be added to the message text after transcription.

## S76.09 Realtime audio input.

- **Expected:** The registry names the realtime audio-input model and live voice sessions start on that registry model.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:179; apps/web/app/api/voice/live/sessions/route.ts:189
- **Where to find it:** Composer > Start voice mode (icon button with a waveform) (labels found in the code)
- **Needs:** a microphone and a signed-in account
- **Steps:**
  1. Click the button labelled Start voice mode in the composer.
  2. Allow microphone access when asked.
  3. Speak a short sentence and wait for a reply.
  4. Compare: a live voice session should start and show the transcript turns of your speech.

## S76.10 Speech output.

- **Expected:** The registry records which models produce speech and spoken output uses a registry-chosen model.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1169 (quoted code not found in the file now); apps/web/lib/hooks/useTTS.ts:31 (quoted code not found in the file now); apps/web/app/api/voice/speech/route.ts:102; apps/web/app/api/voice/speech/route.ts:183
- **Where to find it:** Assistant reply > More message actions > Read message aloud (labels found in the code)
- **Needs:** a speaker and a browser with built-in voices
- **Steps:**
  1. Get a text reply from the assistant.
  2. Click the More message actions button under the reply.
  3. Click Read message aloud.
  4. Compare: the reply should be read aloud, and the menu item should change to Stop reading message while speaking.

## S76.11 Realtime speech-to-speech.

- **Expected:** The registry names the realtime speech-to-speech model/route and live voice uses it for spoken replies.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:179; apps/web/app/api/voice/live/sessions/route.ts:189
- **Where to find it:** Composer > Start voice mode, then speak and listen for the spoken reply (labels found in the code)
- **Needs:** a microphone, speakers and a signed-in account
- **Steps:**
  1. Click Start voice mode in the composer.
  2. Allow the microphone and ask a question out loud.
  3. Listen for the spoken answer.
  4. Compare: the reply should be spoken back during the live session, not only written in the chat.

## S76.14 Image generation.

- **Expected:** The registry records image-generation models and image requests are admitted only for models that generate images.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:144; apps/web/app/api/media/image/generate/route.ts:423 (quoted code not found in the file now)
- **Where to find it:** Composer > More composer options > Create image (labels found in the code)
- **Needs:** none; a plan may limit image creation
- **Steps:**
  1. Click More composer options in the composer.
  2. Click Create image.
  3. Type a short picture prompt and send it.
  4. Compare: an image should be generated; if the chosen model cannot make images, the image mode should not start.

## S76.15 Image editing.

- **Expected:** The registry determines which image models accept a source image, and edit requests are refused for models that cannot edit.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1371; apps/web/app/api/media/image/generate/route.ts:698 (quoted code not found in the file now)
- **Where to find it:** Composer > More composer options > Create image, then Add photos & files to attach a picture (labels found in the code)
- **Needs:** a picture file to upload
- **Steps:**
  1. Click More composer options and choose Create image.
  2. Click More composer options again and choose Add photos & files, then pick a picture.
  3. Type an edit instruction and send.
  4. Compare: the edited picture should come back; the composer should warn if the file is not a picture.

## S76.17 Video generation.

- **Expected:** The registry records video-generation models and their durations/sizes, and video requests are validated against them.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:149; apps/web/features/media/services/media-api-service.ts:195 (quoted code not found in the file now); apps/web/app/api/media/video/generate/route.ts:454
- **Where to find it:** Composer > More composer options > Create video (labels found in the code)
- **Needs:** none; a plan may limit video creation
- **Steps:**
  1. Click More composer options and choose Create video.
  2. Type a short video prompt and check the duration or size controls.
  3. Send the request.
  4. Compare: the video should match the duration and size offered for the chosen model.

## S76.19 Generated video audio.

- **Expected:** The registry records whether a video model generates audio, and generated videos include audio only where the model supports it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:149; apps/web/features/media/services/media-api-service.ts:195 (quoted code not found in the file now); apps/web/app/api/media/video/generate/route.ts:1208; apps/web/app/api/media/video/generate/route.ts:469
- **Where to find it:** no screen of its own. No audio on/off control was found; the effect is only visible in the finished video file.
- **Needs:** a finished generated video
- **Steps:**
  1. Create a short video with Create video.
  2. Download or open the finished video.
  3. Compare: the video should have a sound track only if the model that made it supports audio.

## S76.21 Function/tool calling.

- **Expected:** The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:135; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5406; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Models picker > About <model name> > Capabilities > Tools (labels found in the code)
- **Steps:**
  1. Click the model name button in the composer footer.
  2. Click About on a model row.
  3. Look for the Tools chip in Capabilities.
  4. Compare: a model with function calling shows Tools; a model without it does not.

## S76.22 Parallel tool calls.

- **Expected:** The registry records whether a model supports parallel tool calls and the tool loop uses it.
- **Code:** done. Evidence present: packages/ai/model-registry/catalog/harnesses.json:39; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5400; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts (text found, layout changed)
- **Where to find it:** no screen of its own. No visible setting for parallel tool calls was found.
- **Needs:** a Connector or tool that the model can use
- **Steps:**
  1. Ask a question that needs two tools at once, such as a search plus a file lookup.
  2. Watch the tool steps shown under the reply.
  3. Compare: the tool steps should run together when the model supports parallel tool calls.

## S76.23 Multi-round tool use.

- **Expected:** The registry records agentic (multi-round tool) capability and the request path uses it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:135; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. The only visible label is the Tools chip on the model card, which is function calling rather than agentic rounds.
- **Needs:** a Connector or tool that the model can use
- **Steps:**
  1. Ask a question that needs a search, then a follow-up tool use, such as a file lookup.
  2. Watch the reply for several tool rounds before the final answer.
  3. Compare: the model should use more than one tool round when needed.

## S76.26 Reasoning-effort controls.

- **Expected:** The registry records per-model reasoning-effort levels and each surface offers and sends only those levels.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1313; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Composer footer > Reasoning effort control; Settings > General > Reasoning effort (labels found in the code)
- **Needs:** a Free or paid account; a model with reasoning effort levels
- **Steps:**
  1. Open the model picker from the composer footer and pick a model that supports reasoning effort.
  2. Click the Reasoning effort control in the composer footer and look at the levels offered.
  3. Open Settings > General and find Reasoning effort.
  4. Compare: only the levels that the chosen model supports should appear; Off should show a note if the model cannot turn reasoning off.

## S76.28 Context-window limit.

- **Expected:** The registry records each model context window; the product shows it and trims or refuses over-long requests accordingly.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:185 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:330; packages/ai/routing/src/auto.ts:1417
- **Where to find it:** Models picker > About <model name> > Context ceiling (labels found in the code)
- **Steps:**
  1. Click the model name button in the composer footer.
  2. Click About on a model row.
  3. Read the Context ceiling value in the grid of facts.
  4. Compare: the value should match the model's context window; a very long chat should be trimmed or refused.

## S76.29 Output-token limit.

- **Expected:** The registry records each model output-token limit; requests are capped by it and it is shown.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:189 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5874
- **Where to find it:** Models picker > About <model name> > Output ceiling (labels found in the code)
- **Steps:**
  1. Click the model name button in the composer footer.
  2. Click About on a model row.
  3. Read the Output ceiling value.
  4. Compare: the value should match the model's output limit, and a very long reply should stop at that size.

## S76.31 Streaming capabilities.

- **Expected:** The registry records streaming support per model and the request path picks a transport accordingly.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. No streaming on/off control was found; the transport choice is inside the request path.
- **Steps:**
  1. Send a long question to a model.
  2. Watch the reply text while it is still arriving.
  3. Compare: the text should appear piece by piece rather than all at once.

## S76.32 Cache capabilities.

- **Expected:** The registry records prompt-cache capability and route cache class, and routing/caching decisions use them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/routing/src/auto.ts:1169; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2822
- **Where to find it:** Composer, after at least one reply in the chat: switch model with the model name button (labels found in the code)
- **Needs:** a chat with at least one reply
- **Steps:**
  1. Send a message and wait for a reply in a chat.
  2. Click the model name button in the composer footer and pick a different model.
  3. Look at the line just above the composer footer.
  4. Compare: the line Switching models here starts a new prompt cache should appear once there are earlier turns.

## S76.34 Regional route availability.

- **Expected:** The registry records model and provider residency regions and routing refuses routes outside the required region.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/routing/src/auto.ts:1055
- **Where to find it:** not found in the code. Searched for region, residency and countries; the only match was Allowed countries in apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx, which is not shown as model or provider residency in the picker.
- **Needs:** a workspace admin account

## S76.35 Retention/data-use constraints.

- **Expected:** The registry records provider/route data retention and routing honours zero-retention requirements.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/routing/src/auto.ts:1099
- **Where to find it:** Workspace policy page (Workspace policy link) > Zero data retention only (labels found in the code)
- **Needs:** a workspace admin account
- **Steps:**
  1. Open the Workspace policy page (the link is labelled Workspace policy; address /workspace/policy).
  2. Find the Zero data retention only switch.
  3. Turn it on and save.
  4. Compare: routes that keep data should be excluded for chats in this workspace; this routing effect is not shown on the page itself.

## S76.37 Model lifecycle and retirement.

- **Expected:** The registry records lifecycle stage, deprecation and retirement, and pickers/routing exclude or label models accordingly.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:193 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1353
- **Where to find it:** Models picker: model row status text (Leaving <date> or Unavailable right now) (labels found in the code)
- **Needs:** none; the Leaving text appears only in the warning window before retirement
- **Steps:**
  1. Click the model name button in the composer footer to open the Models dialog.
  2. Look at the status text on each model row.
  3. Compare: a model with a scheduled retirement shows Leaving <date>; a model that is down shows Unavailable right now, and it cannot be picked.

## S76.38 Route-specific differences.

- **Expected:** The registry records route-dependent capabilities, cache class, retention and price per provider route, and routing ranks routes by them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; packages/ai/routing/src/auto.ts:1099; packages/ai/routing/src/auto.ts:1169
- **Where to find it:** no screen of its own. Expected asks for per-route cache class, retention, price and routing rank. The Code line cites ComposerFooter.tsx:1571 (the catalogue open branch, no route text) and auto.ts:1099 and 1169 (route rejection reasons and cache-affinity ranking, internal only). Searched for route, cacheClass and cache text in apps/web, apps/desktop, packages/ui and packages/ai; the route data lives in the generated model registry (packages/ai/model-registry), not in any visible control. The plan note says "not written yet".
- **Needs:** a Free account or a paid account, and a chat with at least one reply
- **Steps:**
  1. Sign in and open a chat that already has at least one reply.
  2. Open the model picker in the composer footer and look at its bottom area.
  3. Check that the line "Switching models here starts a new prompt cache" is shown, and that it is absent on a new empty chat. This line is about cache reset on model switch, not per-route differences; the route ranking itself has no visible effect in the UI.
