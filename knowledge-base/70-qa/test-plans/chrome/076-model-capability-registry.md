---
id: "PLAN-chrome-076"
type: "test-plan"
title: "Chrome · 76. Model-capability registry"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "76"
---
# Chrome · 76. Model-capability registry

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S76.01 Text input.

- **Expected:** The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. Registry and routing rule only; no extension screen or setting exposes it.

## S76.02 Text output.

- **Expected:** The registry records text output per model and routing only admits models that produce text for chat tasks.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. Registry and routing rule only; no extension screen or setting exposes it.

## S76.03 Image understanding.

- **Expected:** The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Model selector button (shows the current model name) > Available models > All capabilities > Vision (labels found in the code)
- **Needs:** a signed-in account; a PNG or JPEG image file
- **Steps:**
  1. Click the model selector button that shows the current model name.
  2. In the menu labelled Available models, open the drop-down labelled All capabilities and choose Vision.
  3. Check that the list now shows only models with the Vision capability.
  4. Click Add attachment > Upload from device and choose a PNG or JPEG image, then send a message about it.
  5. Compare with Expected: the picker shows image support, and an image turn should not go to a model that cannot read images.

## S76.04 Multiple-image input.

- **Expected:** The registry records whether (and how many) images a model accepts in one request, and requests are checked against it.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelLimits.ts:8; apps/extension/src/side_panel.ts:10177; apps/extension/src/side_panel.ts:8793; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:736
- **Where to find it:** Add attachment > Upload from device (then Send) with a model that has an image limit (labels found in the code)
- **Needs:** a signed-in account with file uploads on; two or more image files; a model with a per-message image limit
- **Steps:**
  1. Choose a model in the model selector (Available models).
  2. Click Add attachment, then Upload from device, and pick two or more image files.
  3. Click Send.
  4. If the chosen model accepts fewer images, look for the notice that says it accepts up to a number of images and to remove some to send. The message should not send until the count is lowered.
  5. Compare with Expected: the request is checked against the model's image count.

## S76.06 Native PDF/document input.

- **Expected:** The registry records native PDF input per model and PDFs go natively to models that accept them.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:178
- **Where to find it:** Add attachment > Upload from device (then Send) (labels found in the code)
- **Needs:** a signed-in account with file uploads on; a PDF file
- **Steps:**
  1. Click Add attachment, then Upload from device.
  2. Pick a PDF file and check it is listed in the attachment preview.
  3. Click Send and ask a question that needs the PDF's content.
  4. Compare with Expected: the reply should use the PDF content. The native route versus text extraction is not shown on screen.

## S76.21 Function/tool calling.

- **Expected:** The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5406; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Model selector button (shows the current model name) > Available models > All capabilities > Tools (labels found in the code)
- **Steps:**
  1. Click the model selector button that shows the current model name.
  2. In the menu labelled Available models, open the drop-down labelled All capabilities and choose Tools.
  3. Check that only models with the Tools capability remain in the list.
  4. Compare with Expected: tool-using chat turns are offered only to tool-capable models.

## S76.22 Parallel tool calls.

- **Expected:** The registry records whether a model supports parallel tool calls and the tool loop uses it.
- **Code:** done. Evidence present: packages/ai/model-registry/catalog/harnesses.json:39; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5400; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts (text found, layout changed)
- **Where to find it:** no screen of its own. Parallel tool-call support is set in the harness catalog and the server tool loop; no extension setting.

## S76.23 Multi-round tool use.

- **Expected:** The registry records agentic (multi-round tool) capability and the request path uses it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. Multi-round tool use is handled by the request path; the cited provider file moved, and I did not verify the current location.

## S76.26 Reasoning-effort controls.

- **Expected:** The registry records per-model reasoning-effort levels and each surface offers and sends only those levels.
- **Code:** done. Evidence moved: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:127 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Model selector button (shows the current model name) > Effort (labels found in the code)
- **Needs:** a signed-in account; a model with effort levels; a Free or lower-plan account to see locked levels
- **Steps:**
  1. Click the model selector button and choose a model that has reasoning effort (its menu shows an Effort heading).
  2. Under the Effort heading, look at the rows. Each row name comes from the effort label list (Direct, Brief, Quick, Balanced, Deep, Extended, Maximum); only the levels the model supports appear.
  3. Click a different level and check the row shows as selected and the model badge shows that level.
  4. If a higher level is locked, check its row says Available on [plan] and higher plans.
  5. Compare with Expected: only the model's supported levels are offered and sent.

## S76.31 Streaming capabilities.

- **Expected:** The registry records streaming support per model and the request path picks a transport accordingly.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. No extension setting or screen exposes streaming support; the cited provider file moved, and I did not verify the current location.

## S76.32 Cache capabilities.

- **Expected:** The registry records prompt-cache capability and route cache class, and routing/caching decisions use them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1169; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2822
- **Where to find it:** no screen of its own. Cache class and routing decisions are server-side; nothing in the extension UI shows them.

## S76.34 Regional route availability.

- **Expected:** The registry records model and provider residency regions and routing refuses routes outside the required region.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1055
- **Where to find it:** no screen of its own. I searched the extension's English messages and side panel for region and route text and found none.

## S76.35 Retention/data-use constraints.

- **Expected:** The registry records provider/route data retention and routing honours zero-retention requirements.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1099
- **Where to find it:** no screen of its own. I searched the extension's English messages for retention and data-use text and found none.

## S76.37 Model lifecycle and retirement.

- **Expected:** The registry records lifecycle stage, deprecation and retirement, and pickers/routing exclude or label models accordingly.
- **Code:** done. Evidence moved: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:55 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1353
- **Where to find it:** no screen of its own. The picker drops models whose status is deprecated (apps/extension/src/features/cloud-bridge/managedModelPicker.ts); no stage or retirement label is shown, so the exclusion is only visible as an absence.

## S76.38 Route-specific differences.

- **Expected:** The registry records route-dependent capabilities, cache class, retention and price per provider route, and routing ranks routes by them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1099; packages/ai/routing/src/auto.ts:1169
- **Where to find it:** no screen of its own. No route picker or route-detail text was found in the extension; routing ranks routes internally.
