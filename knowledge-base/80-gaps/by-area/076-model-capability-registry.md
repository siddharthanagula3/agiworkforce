---
id: "GAPS-AREA-076"
type: "gap-list"
title: "Gaps: Model-capability registry"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 76. Model-capability registry

95 open gaps that touch this area. Area page: [20-features/076-model-capability-registry](../../20-features/076-model-capability-registry/README.md).

## CMP-CP127

**Fast mode command**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: There is no separate /ultrafast tier /fast toggles fast mode; there is no separate /ultrafast tier.
- Evidence: apps/cli/src/repl/slash_commands.rs:454; tui/tui_app.rs:5766

## CMP-CP266

**Extended thinking default and controls**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: No thinking on/off setting or token cap --effort and /effort set a thinking budget for Anthropic models only; no thinking on/off setting or token cap.
- Evidence: apps/cli/src/tui/tui_app.rs:8180

## CMP-D18

**Ultrafast tier above Fast**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: Only one fast tier exists.
- Evidence: searched: ultrafast in apps/web and packages

## CMP-DP71

**Fast mode for the top model (lower latency, higher cost)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: The code composer does not offer it Chat has fast mode; the code composer does not offer it.
- Evidence: apps/web/features/chat/hooks/use-fast-mode-availability.ts; searched: fast mode in apps/web/features/code/

## CMP-M41

**Show legacy models and auto-switch to thinking (Configure menu)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Detail: The picker has no legacy-model toggle or auto-switch setting.
- Evidence: searched: showLegacy, legacy models in apps/mobile/src/features/model-picker

## CMP-MP27

**Context window size shown for the plan or model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md), [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md), [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md), [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Detail: The picker shows no per-model size Plans page shows plan context window; the picker shows no per-model size.
- Evidence: apps/mobile/src/features/settings/plans/index.tsx:71-74

## CMP-MP33

**PDF pages and embedded images read by the model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md), [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md), [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md), [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md), [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Detail: No page-count rule or image-reading promise is shown in the app PDFs upload within shared size and count limits; no page-count rule or image-reading promise is shown in the app.
- Evidence: apps/mobile/src/features/chat/utils/attachmentValidation.ts:26-46; searched: page limit in src

## CMP-V21

**Show the model reasoning summary**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: The engine streams reasoning deltas but the editor chat does not display thinking text.
- Evidence: apps/cli/src/app_server/developer_host.rs:6632; searched: reasoning delta in apps/extension-vscode/src

## CMP-V23

**Fast mode (/fast)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: No fast-mode switch.
- Evidence: searched: fast mode, fastMode, /fast in apps/extension-vscode/src

## CMP-V42

**Fast mode for quicker replies**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: The CLI lists /fast but the editor cannot run it and has no fast switch.
- Evidence: crates/agiworkforce-command-registry/src/lib.rs:164; searched: fastMode in apps/extension-vscode/src

## CMP-VP13

**Extended thinking toggle**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: Setting agent.thinking covers only editor utilities like Explain and Fix, not the chat composer Setting agent.thinking covers only editor utilities like Explain and Fix, not the chat composer.
- Evidence: apps/extension-vscode/package.json:agent.thinking

## CMP-W79

**Notice when thinking is cut for safety**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: No such notice exists in the thinking block.
- Evidence: searched: thinking unavailable in packages/ui/unified-chat/src/components/ThinkingBlock.tsx

## CMP-W90

**Show or hide older models**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md), [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Detail: The picker offers current catalog models only and labels retiring ones; there is no older-model switch.
- Evidence: apps/web/features/models/lib/model-presentation.ts:44-54

## CMP-W91

**Speed tiers beyond fast: Ultrafast**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: We have a fast mode switch but no faster tier.
- Evidence: searched: ultrafast in apps/web, packages

## GAP-AREA076-LW02

**Mobile passes a provider id to the image-edit check, which is documented to take an image API family. It gives the same answer today only because the one listed family value equals the provider value.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-076
- Detail: Area 76. Model-capability registry
- Evidence: apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:91, 176, 214; apps/mobile/src/features/image/imageReferenceModel.ts:14; contract at packages/contracts/cloud-contracts/src/managed-media.ts:71-73; the correct call is apps/mobile/stores/chat/imageEditSupport.ts:7

## GAP-AREA076-LW03

**A literal 64000 cap is used for one thinking case instead of the model's registry output limit. The schema also has a literal 64000 maximum.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-076
- Detail: Area 76. Model-capability registry
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5887-5893, 637-638

## GAP-AREA076-LW04

**Video audio default and some video checks branch on the provider id, not on the registry alone.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-076
- Detail: Area 76. Model-capability registry
- Evidence: apps/web/app/api/media/video/generate/route.ts:472 (provider id check), 1208 (default audio = registry flag, else provider id check)

## GAP-AREA076-LW07

**A response format is dropped silently when the model lacks the json flag on the canonical request path, while managed chat checks the json flag on a schema request.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-076
- Detail: Area 76. Model-capability registry
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:199-206; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5170

## GAP-AREA076-LW08

**Speech route hard-codes one provider and one model label; the speech text limit differs between mobile (3800) and the server (4000).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-076
- Detail: Area 76. Model-capability registry
- Evidence: apps/web/app/api/voice/speech/route.ts:48, 88, 103; apps/mobile/src/features/voice/services/serverSpeech.ts:11

## GAP-AREA076-LW09

**Mobile derives on-device output size from the context window with literal bounds 1024 and 8192 instead of a registry value.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-076
- Detail: Area 76. Model-capability registry
- Evidence: apps/mobile/src/features/model-picker/service.ts:152-154

## GAP-AREA076-LW11

**A model row names video editing as a capability, but the video route has no source-video input (the only video_url field is in the response type).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-076
- Detail: Area 76. Model-capability registry
- Evidence: packages/ai/model-registry/catalog/models.curation.json:3506-3510; apps/web/app/api/media/video/generate/route.ts:157

## GAP-CAP-model-selection-02

**Reasoning effort levels per model: Code sessions on cloud have no effort selector (DP69). Admin cap is one workspace-wide level, not per model (WP283). Top level stops at Max.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Requirement items: S15.22, S76.26
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-03

**Thinking switch and always-thinking models: CLI thinking on/off missing; VS Code chat does not display reasoning; no notice when thinking is cut for safety (W79). Seen: reasoning duration changes from 19s to 1s after reload.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Requirement items: S76.26
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-model-selection-10

**Fast speed tier: No same-model fast tier on the CLI; none in VS Code; code composer has no Fast; registry has no serving-speed tiers (S76.36 missing).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Requirement items: S15.23, S76.36
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-11

**Faster Ultrafast tier above Fast: No Ultrafast tier. Only one competitor documents it.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Requirement items: S76.36
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-model-selection-16

**Model cannot do what the message needs: Mobile, CLI and Chrome have no incompatibility dialog or attachment choice. Registry does not record maximum file, image, audio or video sizes (S76.30 missing). Output and tool badges missing on mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md), [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md), [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Requirement items: S15.34, S15.35, S76.01, S76.03, S76.06, S76.21, S76.30, S79.11, S79.21
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-model-selection-21

**Model retirement and replacement notices: No retiring notice on mobile, VS Code, Chrome. No older-model toggle (W90).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md), [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Requirement items: S15.20, S76.37, S91.05, S91.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-22

**Older models on request: No older-model toggle.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Requirement items: S76.37
- Detail: Claude partly, ChatGPT yes; AGI not built

## GAP-CAP-model-selection-23

**Context window shown per model: Comparison row notes the cited picker is not in web chat; mobile shows plan window only. No long-context variant pick (D15).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Requirement items: S15.15, S76.28, S76.29, S91.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-30

**Model choice inside voice mode and other fixed-model features: No in-call family switch found. Seen: voice typed turn showed Auto chose a model.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F076-03](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Requirement items: S76.08, S76.09, S76.11
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F076-01-01

**The text flags are implied, not shown, on Web and CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md)
- Detail: Affects: Web and CLI users; testers.. Work needed: Decide whether to show them; if yes add a chip or letter.
- Evidence: ModelCatalogue.tsx:308-312; provider.rs:176-215

## GAP-F076-01-02

**The brief cites routing-policies.json:459 and ModelCatalogue.tsx:214 as the text-admission code; at those lines the files hold tier slot lists and ModelCatalogue code unrelated to text flags.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md)
- Detail: Affects: Engineers following the brief.. Work needed: Update the brief's code pointers to the lines listed in the implementation map.
- Evidence: routing-policies.json:440-480; ModelCatalogue.tsx:205-215

## GAP-F076-01-03

**No evidence was found of a server-side re-check of text flags for an explicitly chosen model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md)
- Detail: Affects: API and all apps when a non-chat model id is sent.. Work needed: Confirm by test, or add a check.
- Evidence: request-processor.ts searched for textInput; no hit

## GAP-F076-02-01

**No app can request high image detail; only the API can.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md)
- Detail: Affects: All six apps.. Work needed: Decide the product rule, add a detail choice or default high where supported.
- Evidence: brief S76.05 status; no detail control found in the apps

## GAP-F076-02-02

**VS Code and Chrome have no client-side vision or picture count check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md)
- Detail: Affects: VS Code, Chrome.. Work needed: Add the shared check before send.
- Evidence: no hit for capabilities.vision in apps/extension/src/side_panel.ts or VS Code attachment code; only cloudAgentClient.ts:101

## GAP-F076-02-03

**Registry has no per-model maximum file, image, audio or video size.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md)
- Detail: Affects: All apps and API.. Work needed: Add fields to the catalog and check them in every upload path.
- Evidence: brief S76.30 (missing on all)

## GAP-F076-02-04

**The brief's line pointers for the CLI (chat.rs:643, 832; lib.rs:7701) and for request-processor lines are stale; real lines are listed in the map.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md)
- Detail: Affects: Engineers.. Work needed: Refresh the brief.
- Evidence: agent/chat.rs:756-830

## GAP-F076-03-01

**Audio understanding by chat models has no consumer: flag and chip exist, but no path sends audio parts to a chat model was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-03](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Detail: Affects: All apps, API.. Work needed: Either build audio-part support in the chat path or document the flag as informational.
- Evidence: models/route.ts:62-70 publishes audio_input; grep input_audio only in voice/live/sessions/route.ts

## GAP-F076-03-02

**Mobile has no audio-input chip or filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-03](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Detail: Affects: Mobile.. Work needed: Add or declare out of scope.
- Evidence: modelFilters.ts:14-35

## GAP-F076-03-03

**CLI, VS Code, Chrome lack realtime voice; VS Code lacks transcription; CLI, VS Code, Chrome, API lack speech output.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-03](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Detail: Affects: Those apps.. Work needed: Build or mark not planned.
- Evidence: brief S76.08-S76.11 statuses

## GAP-F076-03-04

**Mobile dictation does not use the registry transcription slot.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-03](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Detail: Affects: Mobile.. Work needed: Decide whether the registry rule applies to on-device recognition.
- Evidence: voiceInput.ts:1-5

## GAP-F076-03-05

**CLI local whisper path does not use the registry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-03](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Detail: Affects: CLI Local.. Work needed: Likely acceptable for Local; record the decision.
- Evidence: voice.rs:1139-1185

## GAP-F076-03-NOTBUILT

**Voice input and spoken replies: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F076-03](../../20-features/076-model-capability-registry/F076-03-voice-input-and-spoken-replies.md)
- Requirement items: S76.07, S76.08, S76.09, S76.10, S76.11
- Detail: Mobile: S76.07; CLI: S76.09, S76.10, S76.11; VS Code: S76.07, S76.08, S76.09, S76.10, S76.11; Chrome: S76.07, S76.09, S76.10, S76.11

## GAP-F076-04-01

**Brief says parallel support is per model; code reads it per route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md)
- Detail: Affects: Engineers, testers.. Work needed: Correct the brief or add a per-model flag if intended.
- Evidence: tool-loop.ts:5395-5404; chat.rs:756-761

## GAP-F076-04-02

**A caller's tools array on a no-tools model has no explicit refusal found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md)
- Detail: Affects: API.. Work needed: Test and add a clear error.
- Evidence: route.ts:791-807 handles connector/MCP tools only

## GAP-F076-04-03

**The step limit's user-visible message was not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md)
- Detail: Affects: All apps.. Work needed: Verify by scenario.
- Evidence: tool-loop.ts:9-12

## GAP-F076-05-01

**json_object on a non-flag model is dropped without a refusal in the canonical path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-05](../../20-features/076-model-capability-registry/F076-05-structured-json-and-schema-answers.md)
- Detail: Affects: API callers.. Work needed: Verify the final behaviour and align with json_schema.
- Evidence: canonical-request.ts:199-206

## GAP-F076-05-02

**No app exposes structured output.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-05](../../20-features/076-model-capability-registry/F076-05-structured-json-and-schema-answers.md)
- Detail: Affects: All six apps.. Work needed: Decide whether apps need it.
- Evidence: brief S76.24-25 status API only

## GAP-F076-05-03

**Models API does not publish which formats a route accepts, only structured_output.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-05](../../20-features/076-model-capability-registry/F076-05-structured-json-and-schema-answers.md)
- Detail: Affects: API developers.. Work needed: Optionally add formats.
- Evidence: models/route.ts:62-112

## GAP-F076-06-01

**Server silently ignores an invalid or unsupported effort.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: Affects: API callers.. Work needed: Optionally surface an ignored-effort notice.
- Evidence: request-processor.ts:1824-1840

## GAP-F076-06-02

**Sampling controls exist only in CLI and API.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: Affects: Web, Desktop, Mobile, VS Code, Chrome.. Work needed: Decide if apps need them.
- Evidence: brief S76.27

## GAP-F076-06-03

**Temperature is dropped, not refused, while top_p is refused; behaviour differs by parameter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: Affects: API callers.. Work needed: Document or unify.
- Evidence: request-parameters.ts:47-70 versus anthropic translate.ts:396

## GAP-F076-06-04

**Brief code pointers for VS Code effort (modelConstants.ts:322-332) and CLI (model_catalog.rs:1740-1763) are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: Affects: Engineers.. Work needed: Refresh brief.
- Evidence: modelConstants.ts:370-377; model_catalog.rs:1443-1459

## GAP-F076-06-05

**Local model effort on Mobile is absent by design (supportsThinking false).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Detail: Affects: Mobile Local.. Work needed: Confirm intended.
- Evidence: service.ts:162

## GAP-F076-07-01

**Per-model file, image, audio and video size limits do not exist; only plan-level byte limits are checked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Detail: Affects: All apps and the API. Work needed: Add catalog fields, fill them from provider docs, check them in composer, upload routes and API.
- Evidence: doc: knowledge-base/data/area-briefs/076-model-capability-registry.md S76.30; ChatComposerNew.tsx:944-955

## GAP-F076-07-02

**Caller max_tokens is not clamped to the model maximum for fixed models on the API surface.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Detail: Affects: API callers. Work needed: Clamp in one place before provider translation; add a test.
- Evidence: request-processor.ts:5879-5882 (requested value wins); adaptive clamp only for Auto, router, promotion (3675-3680)

## GAP-F076-07-03

**Mobile model row does not show context or output sizes although the brief marks Mobile done and cites ModelRow.tsx.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Detail: Affects: Mobile. Work needed: Show the limits on the row or card, or correct the brief.
- Evidence: No context or output reference in apps/mobile/src/features/model-picker/components/ModelRow.tsx; formatContextWindow unused (apps/mobile/lib/models.ts:147)

## GAP-F076-07-04

**Chrome extension shows no limits and does no trimming.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Detail: Affects: Chrome. Work needed: Decide whether Chrome needs it; Cloud trimming already covers Cloud turns.
- Evidence: No contextWindow or maxOutputTokens in apps/extension

## GAP-F076-07-05

**Brief's 'reduced by the request' wording is only true for Auto turns; for a fixed model the request value is not reduced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Detail: Affects: Docs and API users. Work needed: Correct the brief or implement the clamp.
- Evidence: request-processor.ts:5879-5882

## GAP-F076-07-06

**Local-mode overflow handling and Desktop local inference limits are not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Detail: Affects: Mobile and Desktop local users. Work needed: Trace the local runtime and document or fix.
- Evidence: contextBudgeter.ts:92-96 only sets a status

## GAP-F076-07-NOTBUILT

**Context window and output limits: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md)
- Requirement items: S76.30
- Detail: Web: S76.30; Desktop: S76.30; Mobile: S76.30; CLI: S76.30; VS Code: S76.30; Chrome: S76.30

## GAP-F076-08-01

**Brief says multi-reference editing is missing everywhere, but the API, Web and Mobile support up to three references.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-08](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)
- Detail: Affects: Docs and test planning. Work needed: Update the brief; add a registry flag so support is per model, not per API family.
- Evidence: managed-media.ts:104-108; ChatComposerNew.tsx:3776-3803; resolveMobileImageGenerationRequest.ts:195

## GAP-F076-08-02

**Edit capability is one list (only 'openai'); no per-model flag for editing, masks, references or transparency.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-08](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)
- Detail: Affects: All apps. Work needed: Add catalog fields and generate the list from them.
- Evidence: managed-media.ts:69-74

## GAP-F076-08-03

**Mobile reads edit support from provider, not image API.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-08](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)
- Detail: Affects: Mobile. Work needed: Use the availability endpoint's supports_edit.
- Evidence: resolveMobileImageGenerationRequest.ts:171-175, 191

## GAP-F076-08-04

**CLI cannot edit or use reference pictures; VS Code and Chrome have no image generation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-08](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Add edit flags to the CLI; decide scope for VS Code and Chrome.
- Evidence: apps/cli/src/cloud/image.rs:44-60

## GAP-F076-08-05

**No own-key or Local image generation path found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-08](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)
- Detail: Affects: Own-key and Local users. Work needed: Decide product direction; local image models are not established in the code read.
- Evidence: getApiKey server keys (image-generation-provider.ts:463); requires_cloud on Mobile

## GAP-F076-08-06

**Brief cites apps/cli/src/lib.rs:943 and :1745 for the CLI image command; those lines hold other commands. The real command is at lib.rs:1110 and 3468.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-08](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)
- Detail: Affects: Docs. Work needed: Fix the brief citations.
- Evidence: apps/cli/src/lib.rs:935-950, 1110

## GAP-F076-08-NOTBUILT

**Image creation and editing: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F076-08](../../20-features/076-model-capability-registry/F076-08-image-creation-and-editing.md)
- Requirement items: S76.14, S76.15, S76.16
- Detail: Web: S76.16; Desktop: S76.16; Mobile: S76.16; CLI: S76.15, S76.16; VS Code: S76.14, S76.15, S76.16; Chrome: S76.14, S76.15, S76.16

## GAP-F076-09-01

**No product path sends video to a model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-09](../../20-features/076-model-capability-registry/F076-09-video-understanding-and-timestamps.md)
- Detail: Affects: All apps and the API. Work needed: Design upload, limits, pipeline part type, provider translation and pricing.
- Evidence: media-input.ts counts only image_url parts (68-77)

## GAP-F076-09-02

**No registry field or product path for timestamped video analysis.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-09](../../20-features/076-model-capability-registry/F076-09-video-understanding-and-timestamps.md)
- Detail: Affects: All apps and the API. Work needed: Add field and output contract.
- Evidence: No timestamp field in registry.schema.json (searched)

## GAP-F076-09-03

**The registry flag is not used by any picker chip or composer check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-09](../../20-features/076-model-capability-registry/F076-09-video-understanding-and-timestamps.md)
- Detail: Affects: Web, Mobile, CLI, VS Code. Work needed: Add a chip and a refusal when video support is built.
- Evidence: Only models route and admin read it

## GAP-F076-09-NOTBUILT

**Video understanding and timestamps: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F076-09](../../20-features/076-model-capability-registry/F076-09-video-understanding-and-timestamps.md)
- Requirement items: S76.13
- Detail: Web: S76.13; Desktop: S76.13; Mobile: S76.13; CLI: S76.13; VS Code: S76.13; Chrome: S76.13

## GAP-F076-10-01

**No audio choice on any app; the server decides from the catalog and provider.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-10](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)
- Detail: Affects: Web, Mobile, CLI. Work needed: Add the control or document that audio follows the model.
- Evidence: No generate_audio in client request builders (searched apps/web/features, apps/mobile/src); route.ts:1207-1208

## GAP-F076-10-02

**Audio default depends on provider id, not only the registry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-10](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)
- Detail: Affects: API callers. Work needed: Move the rule into the catalog.
- Evidence: route.ts:1207-1208

## GAP-F076-10-03

**Video editing and music generation have no registry field, route or UI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-10](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)
- Detail: Affects: All apps. Work needed: Decide scope, add fields and routes.
- Evidence: Only image and video routes under apps/web/app/api/media

## GAP-F076-10-04

**Mobile cannot send input pictures; CLI, VS Code, Chrome have no video generation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-10](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome. Work needed: Add per product decision.
- Evidence: resolveMobileVideoGenerationRequest.ts:124-137

## GAP-F076-10-05

**The brief's line citations for route.ts (398-425, 454-475, 1208) are close but the real ranges are 380-420, 445-479 and 1207-1208.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-10](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)
- Detail: Affects: Docs. Work needed: Refresh the brief.
- Evidence: route.ts

## GAP-F076-10-NOTBUILT

**Video and music creation: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F076-10](../../20-features/076-model-capability-registry/F076-10-video-and-music-creation.md)
- Requirement items: S76.17, S76.18, S76.19, S76.20
- Detail: Web: S76.18, S76.20; Desktop: S76.18, S76.20; Mobile: S76.18, S76.20; CLI: S76.17, S76.18, S76.19, S76.20; VS Code: S76.17, S76.18, S76.19, S76.20; Chrome: S76.17, S76.18, S76.19, S76.20

## GAP-F076-11-01

**Streaming support flag is not used to choose transport, except in the Chrome browser-action check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-11](../../20-features/076-model-capability-registry/F076-11-streaming-and-prompt-caching.md)
- Detail: Affects: All apps. Work needed: Decide: use the flag, or drop the claim.
- Evidence: Only apps/extension/src/features/computer-use/cloudAgentClient.ts:98-103 reads it

## GAP-F076-11-02

**Brief describes cache-aware routing as prefix-based; code is last-route affinity with a cost allowance.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-11](../../20-features/076-model-capability-registry/F076-11-streaming-and-prompt-caching.md)
- Detail: Affects: Docs, routing owners. Work needed: Fix the brief or implement prefix-aware choice.
- Evidence: auto.ts:1165-1180

## GAP-F076-11-03

**Chrome is marked done for streaming and caching, but only the browser-action client was found; no cache control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-11](../../20-features/076-model-capability-registry/F076-11-streaming-and-prompt-caching.md)
- Detail: Affects: Chrome. Work needed: Verify chat streaming in the extension side panel.
- Evidence: cloudAgentClient.ts

## GAP-F076-11-04

**Local and own-key streaming and caching not documented.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-11](../../20-features/076-model-capability-registry/F076-11-streaming-and-prompt-caching.md)
- Detail: Affects: Mobile, Desktop, CLI own-key. Work needed: Trace each runtime.
- Evidence: Not read

## GAP-F076-11-05

**No user-visible cache or savings readout.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-11](../../20-features/076-model-capability-registry/F076-11-streaming-and-prompt-caching.md)
- Detail: Affects: All apps. Work needed: Proposed only.
- Evidence: No UI found

## GAP-F076-12-01

**Batch or deferred submission does not exist; registry lists a batch endpoint on some rows with no price field.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: Affects: All apps and API. Work needed: Design submit, status, price and credit handling per route.
- Evidence: models.curation.json:135, 1102; no caller of service_tier or batch in apps/web/app

## GAP-F076-12-02

**Priority and flex tiers are not recorded as per-route options and not offered.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: Affects: All apps and API. Work needed: Add registry fields and a request field.
- Evidence: request-processor.ts:806 enum has only standard and fast; OpenAI adapter flex unused (index.ts:62)

## GAP-F076-12-03

**Brief says serving speed is missing everywhere, but fast mode exists on Web, Desktop (hosted), Mobile and the API.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: Affects: Docs. Work needed: Update S76.36 status to partial.
- Evidence: ComposerFooter.tsx:2059; SpeedControl.tsx; request-processor.ts:806

## GAP-F076-12-04

**Fast mode is Anthropic-only with a single curated model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: Affects: People on other models. Work needed: Only if other providers publish a tier.
- Evidence: request-processor.ts:1868-1874; one fastTier row

## GAP-F076-12-05

**CLI, VS Code and Chrome have no fast mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Product decision.
- Evidence: No speed handling found in those apps

## GAP-F076-12-NOTBUILT

**Serving speed and batch: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Requirement items: S76.33, S76.36
- Detail: CLI: S76.33, S76.36; VS Code: S76.33, S76.36; Chrome: S76.33, S76.36

## GAP-F076-13-01

**The Rust resolver has no region, zero retention, no-training, retired-date or health ranking checks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Detail: Affects: CLI and Tauri desktop code that resolve routes in Rust (surface:cli, surface:desktop internal build).. Work needed: Port the rules or state they belong to the server path only, and update the conformance fixture.
- Evidence: crates/agiworkforce-model-registry/src/lib.rs:788-856, 976-983 versus packages/ai/routing/src/auto.ts:1040-1115, 1137-1170

## GAP-F076-13-02

**The brief's 'done' for every app is not backed by per-app enforcement in the files opened; the cited files for most apps are generic picker or streaming files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome. Work needed: Confirm each app's cloud calls reach the managed path and the picker reflects the setting.
- Evidence: brief S76.34, S76.35, S76.38 code lists; server enforcement at apps/web/lib/server/managed-cloud-routing/routing-request.ts:96-125

## GAP-F076-13-03

**Own-key and Local routes do not carry these rules in the code opened.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Detail: Affects: mode:own-key users who set a retention, region or training preference. Work needed: Decide the requirement for own-key and either implement or state the exception.
- Evidence: rules built only in apps/web/lib/server/managed-cloud-routing/routing-request.ts:96-125

## GAP-F076-13-04

**Draft picker claim: retired models are 'not listed' conflicts with the models page helper that labels 'Retired' on an entry that is still selectable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Detail: Affects: surface:web models page. Work needed: Confirm which entries reach that label and align the copy.
- Evidence: apps/web/features/models/lib/model-presentation.ts:36-41

## GAP-F076-13-05

**The privacy toggle description says it affects Free only, but the code applies it on all plans.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Detail: Affects: All plans, surface:web and surface:mobile. Work needed: Correct the description or limit the rule.
- Evidence: apps/web/features/settings/sections/PrivacySection.tsx:64; apps/web/app/api/models/catalogue/route.ts:81-86

## GAP-F076-13-06

**No recorded run of any scenario for this feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md)
- Detail: Affects: All. Work needed: Run the scenarios on localhost, one app at a time.
- Evidence: no result file read
