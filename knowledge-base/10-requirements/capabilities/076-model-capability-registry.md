---
id: "REQ-AREA-076"
type: "requirements"
title: "Requirement items: Model-capability registry"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 76. Model-capability registry

38 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S76.01

**Text input.** The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-01 Text chat input and output](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md)
- Competitor trace: CAP-model-selection-16

## S76.02

**Text output.** The registry records text output per model and routing only admits models that produce text for chat tasks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-01 Text chat input and output](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md)

## S76.03

**Image understanding.** The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-02 Picture and document input](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md)
- Competitor trace: CAP-model-selection-16

## S76.04

**Multiple-image input.** The registry records whether (and how many) images a model accepts in one request, and requests are checked against it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F076-02 Picture and document input](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md)

## S76.05

**High-resolution image inspection.** The registry records which models support high-detail image inspection and the product requests high detail where supported.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F076-02 Picture and document input](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md)

## S76.06

**Native PDF/document input.** The registry records native PDF input per model and PDFs go natively to models that accept them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F076-02 Picture and document input](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md)
- Competitor trace: CAP-model-selection-16

## S76.07

**Audio understanding.** The registry records audio input per model and the product uses it to show or gate audio understanding.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F076-03 Voice input and spoken replies](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)

## S76.08

**Audio transcription.** The registry names the transcription model(s) and dictation/transcription requests use that registry choice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code missing
- Feature: [F076-03 Voice input and spoken replies](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Competitor trace: CAP-model-selection-30

## S76.09

**Realtime audio input.** The registry names the realtime audio-input model and live voice sessions start on that registry model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-03 Voice input and spoken replies](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Competitor trace: CAP-model-selection-30

## S76.10

**Speech output.** The registry records which models produce speech and spoken output uses a registry-chosen model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-03 Voice input and spoken replies](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)

## S76.11

**Realtime speech-to-speech.** The registry names the realtime speech-to-speech model/route and live voice uses it for spoken replies.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-03 Voice input and spoken replies](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Competitor trace: CAP-model-selection-30

## S76.12

**Video understanding.** The registry records video input per model and the product uses it to show or route video understanding.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F076-09 Video understanding and timestamps](../../20-features/076-model-capability-registry/F076-09-video-understanding-and-timestamps.md)

## S76.13

**Timestamped video processing.** The registry records which models can return timestamped video analysis and the product uses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-09 Video understanding and timestamps](../../20-features/076-model-capability-registry/F076-09-video-understanding-and-timestamps.md)

## S76.14

**Image generation.** The registry records image-generation models and image requests are admitted only for models that generate images.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F076-08 Image creation and editing](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)

## S76.15

**Image editing.** The registry determines which image models accept a source image, and edit requests are refused for models that cannot edit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-08 Image creation and editing](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)

## S76.16

**Multi-reference image editing.** The registry records which models accept several reference images for one edit, and the product uses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-08 Image creation and editing](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)

## S76.17

**Video generation.** The registry records video-generation models and their durations/sizes, and video requests are validated against them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-10 Video and music creation](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)

## S76.18

**Video editing.** The registry records which models can edit an existing video and the product uses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-10 Video and music creation](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)

## S76.19

**Generated video audio.** The registry records whether a video model generates audio, and generated videos include audio only where the model supports it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-10 Video and music creation](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)

## S76.20

**Music generation.** The registry records music-generation models and the product can route music requests to them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-10 Video and music creation](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)

## S76.21

**Function/tool calling.** The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-04 Tool calls and multi-step tool use](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md)
- Competitor trace: CAP-model-selection-16

## S76.22

**Parallel tool calls.** The registry records whether a model supports parallel tool calls and the tool loop uses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-04 Tool calls and multi-step tool use](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md)

## S76.23

**Multi-round tool use.** The registry records agentic (multi-round tool) capability and the request path uses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-04 Tool calls and multi-step tool use](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md)

## S76.24

**Structured JSON output.** The registry records native structured JSON output per model and JSON requests use it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F076-05 Structured JSON and schema answers](../../20-features/076-model-capability-registry/F076-05-structured-json-and-schema-answers.md)

## S76.25

**Schema-constrained output.** The registry records schema-constrained output support and schema requests are honoured on supporting models.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F076-05 Structured JSON and schema answers](../../20-features/076-model-capability-registry/F076-05-structured-json-and-schema-answers.md)

## S76.26

**Reasoning-effort controls.** The registry records per-model reasoning-effort levels and each surface offers and sends only those levels.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-06 Reasoning effort and sampling controls](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Competitor trace: CAP-model-selection-02, CAP-model-selection-03

## S76.27

**Supported sampling parameters.** The registry records which models reject sampling parameters and requests drop them for those models.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F076-06 Reasoning effort and sampling controls](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)

## S76.28

**Context-window limit.** The registry records each model context window; the product shows it and trims or refuses over-long requests accordingly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F076-07 Context window and output limits](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Competitor trace: CAP-model-selection-23

## S76.29

**Output-token limit.** The registry records each model output-token limit; requests are capped by it and it is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F076-07 Context window and output limits](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Competitor trace: CAP-model-selection-23

## S76.30

**Maximum file/image/audio/video sizes.** The registry records per-model maximum file, image, audio and video sizes and uploads are checked against the chosen model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-07 Context window and output limits](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Competitor trace: CAP-model-selection-16

## S76.31

**Streaming capabilities.** The registry records streaming support per model and the request path picks a transport accordingly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-11 Streaming and prompt caching](../../20-features/076-model-capability-registry/F076-11-streaming-and-prompt-caching.md)

## S76.32

**Cache capabilities.** The registry records prompt-cache capability and route cache class, and routing/caching decisions use them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-11 Streaming and prompt caching](../../20-features/076-model-capability-registry/F076-11-streaming-and-prompt-caching.md)

## S76.33

**Batch/deferred processing.** The registry records batch/deferred processing availability and pricing per route and the product can submit batch work.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-12 Serving speed and batch](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)

## S76.34

**Regional route availability.** The registry records model and provider residency regions and routing refuses routes outside the required region.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-13 Regions, data retention, routes and model lifecycle](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)

## S76.35

**Retention/data-use constraints.** The registry records provider/route data retention and routing honours zero-retention requirements.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-13 Regions, data retention, routes and model lifecycle](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)

## S76.36

**Serving-speed options.** The registry records serving-speed options (priority/flex/standard tiers) per route and requests can choose one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F076-12 Serving speed and batch](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Competitor trace: CAP-model-selection-10, CAP-model-selection-11

## S76.37

**Model lifecycle and retirement.** The registry records lifecycle stage, deprecation and retirement, and pickers/routing exclude or label models accordingly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-13 Regions, data retention, routes and model lifecycle](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Competitor trace: CAP-model-selection-21, CAP-model-selection-22

## S76.38

**Route-specific differences.** The registry records route-dependent capabilities, cache class, retention and price per provider route, and routing ranks routes by them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F076-13 Regions, data retention, routes and model lifecycle](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
