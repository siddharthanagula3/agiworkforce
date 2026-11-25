---
id: "AREA-076"
type: "area"
title: "Model-capability registry"
features: ["F076-01", "F076-02", "F076-03", "F076-04", "F076-05", "F076-06", "F076-07", "F076-08", "F076-09", "F076-10", "F076-11", "F076-12", "F076-13"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 76. Model-capability registry

Each AI model in AGI Workforce has a row in one catalog that says what it can read and write (text, pictures, PDFs, audio, video), what it can make (pictures, video), its size limits, its reasoning levels, its cache, its data-retention and region rules, and whether it is current or retired. The apps and the server read that one catalog, so a person only sees models that can do the job they asked for, and a request that a model cannot serve is refused with a clear message instead of failing later. This matters because the same model list is shown on six apps and the API, and one wrong capability would break a turn on all of them.

**Who uses it.** Every person who opens the model picker or sends a chat or media request on any of the six apps (Web, Desktop, Mobile, CLI, VS Code extension, Chrome extension). The list shown depends on the plan tier, on the training opt-out setting (a privacy setting that hides models that may train on inputs), and on the developer region rule. Paid plans get the higher-tier models; the code gates by plan in the catalog and in auto routing. Image, video and voice generation also need a feature flag (the code checks canUseImages for images) and can be stopped by a workspace admin's organization policy or spend limit. Developers using the managed chat API get the registry's limits and error codes. Mobile on-device models use a separate local list.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F076-01](F076-01-text-chat-input-and-output.md) | Text chat input and output | built | built | built | built | built | built |
| [F076-02](F076-02-picture-and-document-input.md) | Picture and document input | built | built | built | built | built | built |
| [F076-03](F076-03-voice-input-and-spoken-replies.md) | Voice input and spoken replies | built | built | partly | partly | no | no |
| [F076-04](F076-04-tool-calls-and-multi-step-tool-use.md) | Tool calls and multi-step tool use | built | built | built | built | built | built |
| [F076-05](F076-05-structured-json-and-schema-answers.md) | Structured JSON and schema answers | n/a | n/a | n/a | n/a | n/a | n/a |
| [F076-06](F076-06-reasoning-effort-and-sampling-controls.md) | Reasoning effort and sampling controls | built | built | built | built | built | built |
| [F076-07](F076-07-context-window-and-output-limits.md) | Context window and output limits | partly | partly | partly | partly | partly | no |
| [F076-08](F076-08-image-creation-and-editing.md) | Image creation and editing | partly | partly | partly | partly | no | no |
| [F076-09](F076-09-video-understanding-and-timestamps.md) | Video understanding and timestamps | no | no | no | no | no | no |
| [F076-10](F076-10-video-and-music-creation.md) | Video and music creation | partly | partly | partly | no | no | no |
| [F076-11](F076-11-streaming-and-prompt-caching.md) | Streaming and prompt caching | built | built | built | built | built | built |
| [F076-12](F076-12-serving-speed-and-batch.md) | Serving speed and batch | partly | partly | partly | no | no | no |
| [F076-13](F076-13-regions-data-retention-routes-and-model-lifecycle.md) | Regions, data retention, routes and model lifecycle | built | built | built | built | built | built |

Requirement items for this area: [10-requirements/capabilities/076-model-capability-registry.md](../../10-requirements/capabilities/076-model-capability-registry.md).

## How this area works in the code

1. **1. Curated catalog rows.** Each model is one row in a curated file. A row holds its name, provider, model type, input and output types (inputModalities, outputModalities), limits, prices, reasoning levels (supportedEfforts), cache policy, lifecycle stage and an optional capabilitiesOverride block of yes/no flags. Changes go in this file, then the catalog is regenerated (AGENTS.md section 4). (`packages/ai/model-registry/catalog/models.curation.json:1-60`)
2. **2. Compile into one capability record per model.** The compiler turns each row into a fixed list of capability names. Input and output types decide textInput, imageInput, audioInput, videoInput, textOutput, imageOutput, audioOutput and videoOutput. The yes/no flags (vision, tools, json, thinking, search, and so on) map to functionCalling, structuredOutput, reasoning, webSearch, codeExecution, computerUse, agentic, promptCaching. capabilitiesOverride, when present, replaces the base flags. (`packages/ai/model-registry/scripts/compile.mjs:1537-1553 (capability names)`, `packages/ai/model-registry/scripts/compile.mjs:1572-1584 (flag-to-capability map)`, `packages/ai/model-registry/scripts/compile.mjs:1603-1643 (normalizeCapabilities)`, `packages/ai/model-registry/scripts/compile.mjs:102, 408 (capabilitiesOverride)`)
3. **3. Typed lookups used by code.** Code never reads the raw file. It calls typed functions: getModelMetadataById finds a row, isModelLive checks the lifecycle, resolveMaxOutputTokens caps output, getRoutingSlotModel returns the model in a named slot such as voice transcription. (`packages/contracts/types/src/model-catalog.ts:1454 (getModelMetadataById)`, `packages/contracts/types/src/model-catalog.ts:1539 (resolveMaxOutputTokens)`, `packages/contracts/types/src/model-catalog.ts:1753 (getRoutingSlotModel)`, `packages/contracts/types/src/model-catalog.ts:2285 (isModelLive)`)
4. **4. Picker list per plan on the server.** The web catalogue endpoint resolves the viewer's plan and training opt-out, builds the list, drops models that may train when the viewer opted out, and returns the rows with a private 15-second cache header. Each row keeps only the picker capability flags (imageInput, reasoning, functionCalling, webSearch, codeExecution, imageOutput, videoOutput, audioInput, audioOutput). (`apps/web/app/api/models/catalogue/route.ts:71-86`, `apps/web/lib/server/model-catalogue.ts:204-210 (projectCapabilities)`, `apps/web/lib/server/model-catalogue.ts:294-302 (buildCatalogueEntries)`, `packages/ai/routing/src/model-picker.ts:126-134 (listPickerChatModels: current models only)`)
5. **5. The picker card on screen.** The web picker shows a chip for each capability (Vision, Reasoning, Tools, Search, Code execution, Image out, Video out, Audio in, Audio out), the context ceiling, the output ceiling and the release date. A model with no chips shows Text only. (`apps/web/features/chat/components/Composer/ModelCatalogue.tsx:129 (Vision chip)`, `apps/web/features/chat/components/Composer/ModelCatalogue.tsx:155 (Audio in chip)`, `apps/web/features/chat/components/Composer/ModelCatalogue.tsx:263-264 (context and output ceilings)`, `apps/web/features/chat/components/Composer/ModelCatalogue.tsx:310 (Text only)`)
6. **6. Auto routing admits or refuses a model.** When the person picks Auto, the router checks each model: it must be live, not deprecated, allowed by the plan tier, allowed by organization policy and region, and must have every capability the task needs (for example textInput and textOutput for chat). Routes are then ranked by health, credential, cost and default route. Retention and cache class also affect the ranking. (`packages/ai/routing/src/auto.ts:689 (tierAdmissionRejection)`, `packages/ai/routing/src/auto.ts:1340-1358 (evaluateEligibility)`, `packages/ai/routing/src/auto.ts:1405-1413 (required capabilities check)`, `packages/ai/routing/src/auto.ts:1101-1105 (zero-retention filter)`, `packages/ai/routing/src/auto.ts:1166-1169 (cache-class affinity)`)
7. **7. Server checks each managed chat turn.** Before the request is sent, the server refuses a turn with pictures for a model that cannot read them, refuses too many pictures for the route, refuses unsupported sampling parameters, and refuses a message that is too long. Older chat history is compacted to fit the window first. Response formats are kept only when the model and the route allow them. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5099-5108 (model_no_vision)`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5131-5143 (too_many_images)`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5153-5165 (unsupported parameter)`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6702-6712 (compaction)`, `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:199-206 (response format)`, `apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:60-66 (picture limit lookup)`)
8. **8. Media routes check model rows.** Video generation checks the duration, size, ratio and audio choice against the model's video block. Image generation counts pictures by image API family, refuses an edit for a family that cannot edit, and checks the feature flag, organization policy and spend limit first. (`apps/web/app/api/media/video/generate/route.ts:454-475 (duration, size, audio checks)`, `apps/web/app/api/media/image/lib/managed-image-generation.ts:441-449 (picture count)`, `apps/web/app/api/media/image/lib/managed-image-generation.ts:684-690 (edit refusal)`, `apps/web/app/api/media/image/generate/route.ts:98-112 (canUseImages gate at line 109)`)
9. **9. Voice routes use named slots.** Dictation, read-aloud and live voice each read a named slot from the catalog and refuse if the slot model is not live or has the wrong type. Dictation is behind a kill switch and a privacy check. (`apps/web/app/api/llm/v1/audio/transcriptions/route.ts:496-510 (slot model check)`, `apps/web/app/api/voice/transcribe/route.ts:29 (dictation entry)`, `apps/web/app/api/voice/speech/route.ts:102-104 (speech slot check)`, `apps/web/app/api/voice/live/sessions/route.ts:189-195 (live slot check)`)
10. **10. Each client applies its own view.** Mobile builds its own filters (Images, Files, Economy) and a client-side picture count check. VS Code warns when a switch loses tools, pictures or context. Chrome builds its own capability filter from a fixed list with no audio entry. Mobile on-device models come from a separate local list. (`apps/mobile/src/features/model-picker/modelFilters.ts:20-45 (filters)`, `apps/mobile/src/features/chat/utils/attachmentValidation.ts:180-192 (picture count)`, `apps/mobile/src/features/model-picker/service.ts:147-164 (local model detail and vision flag)`, `apps/extension-vscode/src/features/model-picker/modelConstants.ts:352-364 (switch warnings)`, `apps/extension/src/side_panel.ts:11287-11296 (capability filter labels)`)

## Files to know

| File | Role |
|---|---|
| `packages/ai/model-registry/catalog/models.curation.json` | Source of truth: one row per model with input and output types, limits, reasoning levels, cache, lifecycle and capability flags. |
| `packages/ai/model-registry/scripts/compile.mjs` | Compiles the catalog into the capability names and the per-model capability record (lines 1537-1643). |
| `packages/contracts/types/src/model-catalog.ts` | Typed lookups every surface and server route uses (getModelMetadataById, isModelLive, resolveMaxOutputTokens, getRoutingSlotModel). |
| `packages/ai/routing/src/auto.ts` | Auto routing: admits models by lifecycle, plan, policy, region, required capabilities; ranks routes by retention and cache class. |
| `packages/ai/routing/src/model-picker.ts` | Picker rules: current-model filter and the capability list the picker can filter on. |
| `apps/web/lib/server/model-catalogue.ts` | Builds the per-plan picker list served to apps; keeps only the picker capability flags. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Managed chat turn checks: picture refusal, picture count, unsupported parameters, message too long, compaction. |
| `apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts` | Picture count lookup (model row first, then route) and native PDF admission. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts` | Which request parameters a model and route accept (sampling rejection, parameter lists). |
| `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Web model picker card: capability chips, context and output ceilings, Text only fallback. |
| `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Image generation: picture count by image API family, edit refusal, plan and spend checks. |
| `apps/mobile/src/features/model-picker/modelFilters.ts` | Mobile picker filters (Images, Files, Economy) built on the registry. |
| `crates/agiworkforce-model-registry/src/lib.rs` | Rust mirror of the capability enum (IntrinsicCapability at line 79) and the harness picture-limit lookup used by the CLI. |
| `packages/ai/model-registry/catalog/harnesses.json` | Per-route settings: picture count, PDF types and page limits, response formats, and which features each route implements. |

## What is stored

- Curated model rows (capabilities, limits, prices, lifecycle): Repository file packages/ai/model-registry/catalog/models.curation.json; generated copies are not read by the apps directly (AGENTS.md section 4)
- Per-route media limits and response formats: Repository file packages/ai/model-registry/catalog/harnesses.json
- Effort and fast-mode choice on web: Browser localStorage key agi-thinking-store (apps/web/shared/stores/thinking-store.ts:120-130)
- Dictation language and voice input state on web: Browser storage under the zustand persist key agi-web-voice-input (apps/web/features/chat/stores/voice-input-store.ts:13)
- Installed on-device models with a JSON capabilities column (vision, structured output, and so on): Phone database table installed_models (apps/mobile/storage/migrations.ts:49); written by apps/mobile/services/modelDownload.ts:552-565
- Picker catalogue response: Not stored on the server; the browser keeps it briefly under a private 15-second Cache-Control header (apps/web/app/api/models/catalogue/route.ts:71-116)
- Usage records for speech, transcription and image jobs: Written through the managed usage call in apps/web/app/api/voice/speech/route.ts:160-187 and 231-233; the storage table was not traced

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_CONTEXT_COMPACTION_ENABLED**: Turns chat history compaction on or off. On unless the value is 0, false or off. (apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:38, 59-62)
- **Plan tier and minimum tier per model**: Chooses which models the picker lists and which models Auto may use; a model above the plan is locked or refused. (apps/web/app/api/models/catalogue/route.ts:81; packages/ai/routing/src/auto.ts:689 (tierAdmissionRejection); tierPolicy.minTier in models.curation.json)
- **Training opt-out**: Hides models that may train on inputs when the viewer has opted out. (apps/web/app/api/models/catalogue/route.ts:82-86)
- **Zero data retention**: Requests that need no retention are sent only to routes that keep no data. (apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:209-210; packages/ai/routing/src/auto.ts:1101-1105)
- **canUseImages feature flag**: Blocks image generation for accounts without the capability. (apps/web/app/api/media/image/generate/route.ts:101-111)
- **Organization policy, spend limit and managed compute gates**: Workspace admin rules can block a model or a provider, or stop spending, before a media or chat job starts. (apps/web/app/api/media/image/generate/route.ts:56-89; packages/ai/routing/src/auto.ts (organizationPolicy check near 1063-1080))
- **Dictation kill switch**: Turns dictation off through the capability gate. (apps/web/app/api/voice/transcribe/route.ts:7, 29)
- **Routing slots voice_transcription, voice_speech, voice_live**: Name the model each voice feature uses; the slot must be live and the right type. (packages/contracts/types/src/model-catalog.ts:1753; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:496; apps/web/app/api/voice/speech/route.ts:102; apps/web/app/api/voice/live/sessions/route.ts:189)
- **Speed-first routing profile**: When the request asks for the speed profile, Auto uses the speed-first slots. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4769; packages/ai/routing/src/speed-first-slots.ts:6)
- **Fast mode toggle and workspace block**: Shows and sends fast mode for models with a fast tier; a workspace can turn it off. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:845, 1033; request-processor.ts:5825)
- **Developer-surface plan capability (VS Code)**: Turns the developer model options on or off for the plan. (apps/extension-vscode/src/features/model-picker/modelConstants.ts:70)
- **Plan attachment byte limit (web)**: Caps the size of attached files and pictures by plan. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:949-951)
- **Per-route picture and PDF limits**: Sets the picture count and PDF page limits that apply when a model row has none. (packages/ai/model-registry/catalog/harnesses.json (mediaInput); read in apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:60-66)

## Shared between apps

Shared across apps and server: the catalog file (packages/ai/model-registry/catalog), the compiler (packages/ai/model-registry/scripts/compile.mjs), the typed lookups (packages/contracts/types/src/model-catalog.ts), auto routing and picker rules (packages/ai/routing/src), and the Rust mirror (crates/agiworkforce-model-registry). The VS Code extension imports the routing package (apps/extension-vscode/src/features/model-picker/modelConstants.ts:29). The web catalogue and the managed chat, media and voice routes are server code used by the web app and the API. The public Desktop shows the hosted web app (AGENTS.md section 5), so it shares the web code. Separate per app: Mobile has its own picker filters, its own on-device model list and its own client-side picture count check (apps/mobile/src/features/model-picker, apps/mobile/src/features/chat/utils/attachmentValidation.ts). The CLI has its own Rust catalog reader (apps/cli/src/model_catalog.rs) and its own streaming code. Chrome has its own picker in apps/extension/src/side_panel.ts with a fixed label list.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief marks serving speed (S76.36) missing on every app, but the managed chat request accepts a fast speed with a price multiplier for models that declare a fast tier, and the web composer shows a fast toggle. Only the fast tier exists; priority and flex tiers do not. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:806, 1868-1873, 5825, 5923-5924; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1322; packages/ai/model-registry/catalog/models.curation.json:1448-1450)
- Mobile passes a provider id to the image-edit check, which is documented to take an image API family. It gives the same answer today only because the one listed family value equals the provider value. (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:91, 176, 214; apps/mobile/src/features/image/imageReferenceModel.ts:14; contract at packages/contracts/cloud-contracts/src/managed-media.ts:71-73; the correct call is apps/mobile/stores/chat/imageEditSupport.ts:7)
- A literal 64000 cap is used for one thinking case instead of the model's registry output limit. The schema also has a literal 64000 maximum. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5887-5893, 637-638)
- Video audio default and some video checks branch on the provider id, not on the registry alone. (apps/web/app/api/media/video/generate/route.ts:472 (provider id check), 1208 (default audio = registry flag, else provider id check))
- Brief says requests drop sampling parameters for models that reject them. On the managed API, a top_p sent to such a model is refused with 400; only the CLI drops temperature. (apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts:47-67; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5153-5165; apps/cli/src/models/streaming.rs:684-692)
- Brief says image turns are refused or rerouted. The server refuses the turn for the resolved model; Auto routing does not check picture input when it picks a model. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5099-5108; packages/ai/routing/src/auto.ts (no picture-input check; only the task's required capabilities at 1405-1413))
- A response format is dropped silently when the model lacks the json flag on the canonical request path, while managed chat checks the json flag on a schema request. (apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:199-206; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5170)
- Speech route hard-codes one provider and one model label; the speech text limit differs between mobile (3800) and the server (4000). (apps/web/app/api/voice/speech/route.ts:48, 88, 103; apps/mobile/src/features/voice/services/serverSpeech.ts:11)
- Mobile derives on-device output size from the context window with literal bounds 1024 and 8192 instead of a registry value. (apps/mobile/src/features/model-picker/service.ts:152-154)
- Per-model picture count exists on only two rows. Most image limits come from the route or the image API family, so the brief's per-model claim is only partly true. (packages/ai/model-registry/catalog/models.curation.json:2425, 3506; apps/web/app/api/media/image/lib/image-generation-provider.ts:228-230)
- A model row names video editing as a capability, but the video route has no source-video input (the only video_url field is in the response type). (packages/ai/model-registry/catalog/models.curation.json:3506-3510; apps/web/app/api/media/video/generate/route.ts:157)
- Parallel tool calls are gated by the route's harness feature, not per model as the brief says. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5401-5403)

## Not established

- Brief line references are stale: apps/web/app/api/media/image/generate/route.ts has 128 lines, so the brief's 423 and 698 point past the end. The image logic is in managed-image-generation.ts. Several brief lines in request-processor.ts (3611, 3874, 3884, 4042) point at other code; the refusals sit at 5099-5108 and 5131-5143 here.
- Empty, waiting and failure states of the web picker, mobile picker and CLI model list were not established from the code read.
- No desktop file was opened. Desktop behaviour is taken from AGENTS.md section 5 (the public Desktop shows the hosted web app) and from the brief's Status lines.
- No file for the Chrome extension catalogue source was traced; the side panel fetches its list through code not opened.
- Whether temperature is refused or dropped for models that reject sampling parameters on the managed API (request-processor.ts parameter path not fully read).
- Auto routing's step limit for multi-round tool use and the exact tool-loop limit (MAX_PARALLEL_TOOL_CALLS) were not read.
- Context-window budget formula for the web composer is at apps/web/features/chat/components/Composer/model-compatibility.ts:47-52; the server trimming in context-window.ts was not read in full, and the output-cap path (resolveMaxOutputTokens) was read only in its header.
- image-detail.ts, the speech and transcription usage storage table and the managed usage ledger were not traced.
- Batch and flex: the registry lists a batch endpoint on some rows, and an adapter can send a flex service tier, but no product path was found. Not confirmed by search of every app.
- Music generation and video editing: no code found in the media routes; a full repository search was not run.
- The brief's Status lines are not all matched to code. Where the brief says missing (for example serving speed, audio input on Mobile) the code read agrees for most items, with the exceptions in things_that_look_wrong.
- Tests and builds were not run, per the instruction that this read is read-only. Tests must be run one app at a time on localhost by the QA step, per the relayed request.
