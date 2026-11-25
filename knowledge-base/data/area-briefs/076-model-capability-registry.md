# Area 76. Model-capability registry

38 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S76.01 Text input.
- Should: The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:214; packages/ai/routing/src/auto.ts:1344; packages/ai/model-registry/catalog/routing-policies.json:459; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S76.02 Text output.
- Should: The registry records text output per model and routing only admits models that produce text for chat tasks.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:214; packages/ai/routing/src/auto.ts:1344; packages/ai/model-registry/catalog/routing-policies.json:459; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S76.03 Image understanding.
- Should: The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:64; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3611; packages/ai/routing/src/auto.ts:1344; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:264; apps/cli/src/models/streaming.rs:234; crates/agiworkforce-model-registry/src/lib.rs:848

## S76.04 Multiple-image input.
- Should: The registry records whether (and how many) images a model accepts in one request, and requests are checked against it.
- Status: web done, desktop done, mobile done, cli done, chrome done, api done
- Code: packages/ai/model-registry/catalog/harnesses.json:125; packages/ai/model-registry/catalog/models.curation.json:1465; apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:37; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4042; apps/mobile/stores/chat/chatExecutionStore.ts:1429; apps/mobile/src/features/chat/utils/attachmentValidation.ts:93; apps/cli/src/agent/chat.rs:643; apps/cli/src/agent/chat.rs:832

## S76.05 High-resolution image inspection.
- Should: The registry records which models support high-detail image inspection and the product requests high detail where supported.
- Status: api done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts:25; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:391; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3963; packages/ai/provider-protocol/src/openai-wire-compat.ts:125; packages/ai/providers/openai/src/translate.ts:51; apps/web/app/api/llm/v1/models/route.ts:91

## S76.06 Native PDF/document input.
- Should: The registry records native PDF input per model and PDFs go natively to models that accept them.
- Status: web done, desktop done, mobile done, cli done, chrome done, api done
- Code: packages/ai/model-registry/catalog/models.curation.json:1465; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:489; apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:57; apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:136; packages/ai/providers/openai/src/translate.ts:58; apps/cli/src/agent/chat.rs:639; apps/cli/src/cloud/attachments.rs:32; apps/cli/src/lib.rs:7701

## S76.07 Audio understanding.
- Should: The registry records audio input per model and the product uses it to show or gate audio understanding.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:154; apps/cli/src/provider.rs:305; apps/cli/src/tui/tui_app.rs:4448; apps/cli/src/tui/tui_app.rs:4486; apps/cli/src/repl/slash_commands.rs:186; apps/web/app/api/llm/v1/models/route.ts:51; apps/web/app/api/llm/v1/models/route.ts:98

## S76.08 Audio transcription.
- Should: The registry names the transcription model(s) and dictation/transcription requests use that registry choice.
- Status: web done, desktop done, cli done, vscode missing, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1628; apps/web/features/chat/stores/voice-input-store.ts:7; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:442

## S76.09 Realtime audio input.
- Should: The registry names the realtime audio-input model and live voice sessions start on that registry model.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:82; apps/web/app/api/voice/live/sessions/route.ts:140; apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx:33; apps/mobile/src/features/voice/services/liveVoiceSession.ts:11

## S76.10 Speech output.
- Should: The registry records which models produce speech and spoken output uses a registry-chosen model.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing, api missing
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1169; apps/web/lib/hooks/useTTS.ts:31; apps/web/app/api/voice/speech/route.ts:98; apps/web/app/api/voice/speech/route.ts:220; apps/mobile/src/features/voice/services/serverSpeech.ts:6; apps/mobile/src/features/voice/services/voiceOutput.ts:15

## S76.11 Realtime speech-to-speech.
- Should: The registry names the realtime speech-to-speech model/route and live voice uses it for spoken replies.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:82; apps/web/app/api/voice/live/sessions/route.ts:140; apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx:33; apps/mobile/src/features/voice/services/liveVoiceSession.ts:11

## S76.12 Video understanding.
- Should: The registry records video input per model and the product uses it to show or route video understanding.
- Status: not applicable anywhere

## S76.13 Timestamped video processing.
- Should: The registry records which models can return timestamped video analysis and the product uses it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S76.14 Image generation.
- Should: The registry records image-generation models and image requests are admitted only for models that generate images.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:79; apps/web/app/api/media/image/generate/route.ts:423; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:152; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:228; apps/cli/src/lib.rs:943; apps/cli/src/lib.rs:1745; apps/cli/src/cloud/image.rs:4

## S76.15 Image editing.
- Should: The registry determines which image models accept a source image, and edit requests are refused for models that cannot edit.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1115; apps/web/app/api/media/image/generate/route.ts:698; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:152; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:177

## S76.16 Multi-reference image editing.
- Should: The registry records which models accept several reference images for one edit, and the product uses it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S76.17 Video generation.
- Should: The registry records video-generation models and their durations/sizes, and video requests are validated against them.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:84; apps/web/features/media/services/media-api-service.ts:195; apps/web/app/api/media/video/generate/route.ts:411; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:157; apps/mobile/src/features/chat/actions/resolveMobileVideoGenerationRequest.ts:110; apps/mobile/src/features/video/services/videogen.ts:65

## S76.18 Video editing.
- Should: The registry records which models can edit an existing video and the product uses it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S76.19 Generated video audio.
- Should: The registry records whether a video model generates audio, and generated videos include audio only where the model supports it.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:84; apps/web/features/media/services/media-api-service.ts:195; apps/web/app/api/media/video/generate/route.ts:983; apps/web/app/api/media/video/generate/route.ts:425; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:157; apps/mobile/src/features/video/services/videogen.ts:65

## S76.20 Music generation.
- Should: The registry records music-generation models and the product can route music requests to them.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S76.21 Function/tool calling.
- Should: The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:70; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3708; packages/ai/routing/src/auto.ts:1344; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; crates/agiworkforce-model-registry/src/lib.rs:848

## S76.22 Parallel tool calls.
- Should: The registry records whether a model supports parallel tool calls and the tool loop uses it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: packages/ai/model-registry/catalog/harnesses.json:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4477; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4718; apps/cli/src/agent/chat.rs:636; apps/cli/src/agent/chat.rs:1045; crates/agiworkforce-model-registry/src/lib.rs:685; crates/agiworkforce-model-registry/src/lib.rs:719

## S76.23 Multi-round tool use.
- Should: The registry records agentic (multi-round tool) capability and the request path uses it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:70; packages/ai/providers/openai/src/index.ts:186; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2656

## S76.24 Structured JSON output.
- Should: The registry records native structured JSON output per model and JSON requests use it.
- Status: api done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:154; packages/ai/model-registry/catalog/harnesses.json:34; packages/ai/model-registry/catalog/harnesses.json:127; packages/ai/providers/openai/src/translate.ts:279; packages/ai/providers/anthropic/src/translate.ts:297; packages/ai/providers/google/src/translate.ts:170

## S76.25 Schema-constrained output.
- Should: The registry records schema-constrained output support and schema requests are honoured on supporting models.
- Status: api done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3874; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3884; apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:314

## S76.26 Reasoning-effort controls.
- Should: The registry records per-model reasoning-effort levels and each surface offers and sends only those levels.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1168; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1033; apps/mobile/src/features/model-picker/components/EffortSlider.tsx:33; apps/mobile/services/streaming.ts:167; apps/cli/src/models/streaming.rs:485; apps/cli/src/model_catalog.rs:1740; apps/cli/src/model_catalog.rs:1763; apps/extension-vscode/src/features/model-picker/modelConstants.ts:329

## S76.27 Supported sampling parameters.
- Should: The registry records which models reject sampling parameters and requests drop them for those models.
- Status: cli done, api done
- Code: apps/cli/src/config.rs:89; apps/cli/src/models/streaming.rs:301; packages/ai/model-registry/catalog/models.curation.json:1387; apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts:47; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4007

## S76.28 Context-window limit.
- Should: The registry records each model context window; the product shows it and trims or refuses over-long requests accordingly.
- Status: web done, desktop done, mobile done, cli done, vscode done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:185; apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:170; packages/ai/routing/src/auto.ts:1354; apps/mobile/src/features/model-picker/components/ModelRow.tsx:173; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; crates/agiworkforce-model-registry/src/lib.rs:868; apps/extension-vscode/src/features/model-picker/modelConstants.ts:247

## S76.29 Output-token limit.
- Should: The registry records each model output-token limit; requests are capped by it and it is shown.
- Status: web done, desktop done, mobile done, cli done, vscode done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:189; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4034; apps/mobile/src/features/model-picker/components/ModelRow.tsx:174; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:250; apps/web/app/api/llm/v1/models/route.ts:74

## S76.30 Maximum file/image/audio/video sizes.
- Should: The registry records per-model maximum file, image, audio and video sizes and uploads are checked against the chosen model.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S76.31 Streaming capabilities.
- Should: The registry records streaming support per model and the request path picks a transport accordingly.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; packages/ai/providers/openai/src/index.ts:186; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S76.32 Cache capabilities.
- Should: The registry records prompt-cache capability and route cache class, and routing/caching decisions use them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; packages/ai/routing/src/auto.ts:1134; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1857; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S76.33 Batch/deferred processing.
- Should: The registry records batch/deferred processing availability and pricing per route and the product can submit batch work.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S76.34 Regional route availability.
- Should: The registry records model and provider residency regions and routing refuses routes outside the required region.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; packages/ai/routing/src/auto.ts:1024; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S76.35 Retention/data-use constraints.
- Should: The registry records provider/route data retention and routing honours zero-retention requirements.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; packages/ai/routing/src/auto.ts:1070; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S76.36 Serving-speed options.
- Should: The registry records serving-speed options (priority/flex/standard tiers) per route and requests can choose one.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S76.37 Model lifecycle and retirement.
- Should: The registry records lifecycle stage, deprecation and retirement, and pickers/routing exclude or label models accordingly.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:193; packages/ai/routing/src/auto.ts:1302; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; crates/agiworkforce-model-registry/src/lib.rs:779; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S76.38 Route-specific differences.
- Should: The registry records route-dependent capabilities, cache class, retention and price per provider route, and routing ranks routes by them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; packages/ai/routing/src/auto.ts:1070; packages/ai/routing/src/auto.ts:1134; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239
