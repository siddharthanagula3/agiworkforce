---
id: "PLAN-cli-076"
type: "test-plan"
title: "CLI · 76. Model-capability registry"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "76"
---
# CLI · 76. Model-capability registry

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S76.01 Text input.

- **Expected:** The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. The CLI model list and /models show no text-input field, and provider.rs:184 holds no text flag; the registry crate was not checked.

## S76.02 Text output.

- **Expected:** The registry records text output per model and routing only admits models that produce text for chat tasks.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. The CLI model list and /models show no text-output field, and provider.rs:184 holds no text flag; the registry crate was not checked.

## S76.03 Image understanding.

- **Expected:** The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:185; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); crates/agiworkforce-model-registry/src/lib.rs:1056
- **Where to find it:** agi (chat), then /models <model id> (row Vision:), then /attach <image file> (labels found in the code)
- **Needs:** an image file
- **Steps:**
  1. Start agi in a terminal and type /models <id> for a model whose Vision: row says no.
  2. Type /attach and the path of an image file.
  3. Read the refusal line: does not accept images; switch to a vision model with /model first.
  4. Type /model, pick a vision model, then /attach the same image again and check it is attached.

## S76.04 Multiple-image input.

- **Expected:** The registry records whether (and how many) images a model accepts in one request, and requests are checked against it.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:787; apps/cli/src/agent/chat.rs:1169; apps/cli/src/model_catalog.rs:1520; crates/agiworkforce-model-registry/src/lib.rs:752
- **Where to find it:** agi (chat), then /attach <image file> several times, then send a message (labels found in the code)
- **Needs:** several image files
- **Steps:**
  1. Pick a model and attach more images than that model allows, using /attach <image file> for each.
  2. Type a question and press Enter to send.
  3. Read the refusal: can read up to N images in one message. Remove N images to send it.
  4. Compare N with the model's limit in the catalog; the CLI does not show the limit on /models.

## S76.06 Native PDF/document input.

- **Expected:** The registry records native PDF input per model and PDFs go natively to models that accept them.
- **Code:** done. Evidence moved: apps/cli/src/agent/chat.rs:763; apps/cli/src/cloud/attachments.rs:32 (quoted code not found in the file now); apps/cli/src/lib.rs:1742; crates/agiworkforce-llm/src/serialize.rs:98; crates/agiworkforce-llm/src/serialize.rs:276; apps/cli/src/provider.rs:229
- **Where to find it:** agi (chat), then /attach <file>, then send a message (labels found in the code)
- **Needs:** a PDF file
- **Steps:**
  1. Pick a model that shows P in the model list (row shows PDF: yes on /models <model id>).
  2. Type /attach and the path of a PDF file, and read the attached confirmation.
  3. Type a question about a specific page or passage in the PDF and press Enter.
  4. Check the answer uses the PDF content.

## S76.07 Audio understanding.

- **Expected:** The registry records audio input per model and the product uses it to show or gate audio understanding.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:229; apps/cli/src/tui/tui_app.rs:866; apps/cli/src/tui/tui_app.rs:5729; apps/cli/src/repl/slash_commands.rs:209
- **Where to find it:** agi (chat), then /models <model id> (row Audio in/out:) (labels found in the code)
- **Needs:** an audio file
- **Steps:**
  1. Type /models <model id> for a model.
  2. Read the Audio in/out: row, yes or no for input and output.
  3. Type /attach and an audio file path to see whether audio can be attached.
  4. Compare: the attach command rejects anything that is not an image, PDF or Office file, and no code gates audio input.

## S76.08 Audio transcription.

- **Expected:** The registry names the transcription model(s) and dictation/transcription requests use that registry choice.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi (chat), then /dictate (labels found in the code)
- **Needs:** a microphone and either OPENAI_API_KEY set or a local whisper binary on PATH
- **Steps:**
  1. Type /dictate and press Enter.
  2. Speak one short sentence into the microphone.
  3. Stop and check that the spoken words appear as text in the input.

## S76.14 Image generation.

- **Expected:** The registry records image-generation models and image requests are admitted only for models that generate images.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1110; apps/cli/src/lib.rs:1745 (quoted code not found in the file now); apps/cli/src/cloud/image.rs:4
- **Where to find it:** agi image --list-models in a terminal, then agi image "<prompt>" --count N (labels found in the code)
- **Needs:** a signed-in AGI account in Managed privacy mode
- **Steps:**
  1. Run agi image --list-models in a terminal.
  2. Read the image model names listed for the account.
  3. Run agi image "a red bicycle" --count N with N above the model's per-request maximum.
  4. Read the refusal: makes at most N image per request, and check the image is not generated.

## S76.21 Function/tool calling.

- **Expected:** The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); crates/agiworkforce-model-registry/src/lib.rs:1056
- **Where to find it:** agi (chat), then /models <model id> (row Tool use:) (labels found in the code)
- **Steps:**
  1. Type /models <model id> for a model.
  2. Read the Tool use: row, yes or no.
  3. Compare with the T flag in the list from agi --list-models.

## S76.22 Parallel tool calls.

- **Expected:** The registry records whether a model supports parallel tool calls and the tool loop uses it.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:756; apps/cli/src/agent/chat.rs:1389; crates/agiworkforce-model-registry/src/lib.rs:703; crates/agiworkforce-model-registry/src/lib.rs:737
- **Where to find it:** no screen of its own. The parallel-tool flag is read from the registry harness; the CLI shows no setting for it.
- **Needs:** a few files in the project folder
- **Steps:**
  1. Ask agi to read three different files in one request.
  2. Watch whether the three read steps start together or one after another.

## S76.23 Multi-round tool use.

- **Expected:** The registry records agentic (multi-round tool) capability and the request path uses it.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. No CLI control for multi-round tool use was found; the effect is visible only through the tool steps.
- **Steps:**
  1. Ask agi a question that needs a search, then a file read, before answering.
  2. Count the tool steps shown before the final answer.

## S76.26 Reasoning-effort controls.

- **Expected:** The registry records per-model reasoning-effort levels and each surface offers and sends only those levels.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:485 (quoted code not found in the file now); apps/cli/src/model_catalog.rs:1443; apps/cli/src/model_catalog.rs:1493
- **Where to find it:** agi (chat), then /effort (labels found in the code)
- **Needs:** two models, one with effort support and one without
- **Steps:**
  1. Type /effort and press Enter to open the effort picker.
  2. Read the levels the picker offers for the current model.
  3. Pick one level and read the reply Effort set to ...
  4. Type /model to switch to a model with no effort setting and read: This model takes no effort setting on this route, so the level applies once you switch to one that does.

## S76.27 Supported sampling parameters.

- **Expected:** The registry records which models reject sampling parameters and requests drop them for those models.
- **Code:** done. Evidence present: apps/cli/src/config.rs:190; apps/cli/src/models/streaming.rs:688
- **Where to find it:** agi -t 0.5 (chat), then /model <model id that rejects sampling> (labels found in the code)
- **Needs:** a model that rejects sampling parameters
- **Steps:**
  1. Start agi with a temperature, for example agi -t 0.5.
  2. Switch with /model to a model that rejects sampling parameters.
  3. Read the chat line: does not accept a temperature, so your configured 0.5 is not sent to it.

## S76.28 Context-window limit.

- **Expected:** The registry records each model context window; the product shows it and trims or refuses over-long requests accordingly.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); crates/agiworkforce-model-registry/src/lib.rs:1069
- **Where to find it:** agi (chat), then /models <model id> (row Context window:) and /status (Context:) (labels found in the code)
- **Steps:**
  1. Type /models <model id> and read Context window: in tokens.
  2. Type /status and read the Context: percentage.
  3. Compare with Expected: the tester should check whether a request over the limit is trimmed or refused.

## S76.29 Output-token limit.

- **Expected:** The registry records each model output-token limit; requests are capped by it and it is shown.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now)
- **Where to find it:** agi (chat), then /models <model id> (row Max output:) (labels found in the code)
- **Steps:**
  1. Type /models <model id> and read Max output: in tokens.
  2. Compare the figure with the catalog's output limit.

## S76.31 Streaming capabilities.

- **Expected:** The registry records streaming support per model and the request path picks a transport accordingly.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. The transport choice per model is not shown in the CLI.
- **Steps:**
  1. Ask agi a long question in chat.
  2. Watch whether the answer text appears in pieces while it arrives.

## S76.32 Cache capabilities.

- **Expected:** The registry records prompt-cache capability and route cache class, and routing/caching decisions use them.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1169; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2822
- **Where to find it:** no screen of its own. No cache field was found in the /cost or /models output.

## S76.34 Regional route availability.

- **Expected:** The registry records model and provider residency regions and routing refuses routes outside the required region.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1055
- **Where to find it:** no screen of its own. No region setting or display was found in the CLI; routing that refuses routes is in packages/ai/routing/src/auto.ts (server side).

## S76.35 Retention/data-use constraints.

- **Expected:** The registry records provider/route data retention and routing honours zero-retention requirements.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1099
- **Where to find it:** no screen of its own. No retention field was found in the CLI; zero-retention routing is in packages/ai/routing/src/auto.ts (server side).

## S76.37 Model lifecycle and retirement.

- **Expected:** The registry records lifecycle stage, deprecation and retirement, and pickers/routing exclude or label models accordingly.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:181; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); crates/agiworkforce-model-registry/src/lib.rs:981
- **Where to find it:** agi --list-models in a terminal, or /models in chat (labels found in the code)
- **Steps:**
  1. Run agi --list-models in a terminal, or type /models in chat.
  2. Find a row marked ! (deprecated) or B (beta).
  3. Read the line under it: deprecated, leaves the catalog <date>.
  4. Type /model and check the picker shows the same deprecated, leaves date label.

## S76.38 Route-specific differences.

- **Expected:** The registry records route-dependent capabilities, cache class, retention and price per provider route, and routing ranks routes by them.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1099; packages/ai/routing/src/auto.ts:1169
- **Where to find it:** no screen of its own. Route ranking by price, cache class and retention is in packages/ai/routing/src/auto.ts on the server; the CLI list shows catalog and gateway models only.
