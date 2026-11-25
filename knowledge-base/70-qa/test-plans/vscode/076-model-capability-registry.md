---
id: "PLAN-vscode-076"
type: "test-plan"
title: "VS Code · 76. Model-capability registry"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "76"
---
# VS Code · 76. Model-capability registry

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S76.01 Text input.

- **Expected:** The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. Searched apps/extension-vscode for text input; the rule lives in the model registry and routing, not in a screen.

## S76.02 Text output.

- **Expected:** The registry records text output per model and routing only admits models that produce text for chat tasks.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1406; packages/ai/model-registry/catalog/routing-policies.json:693
- **Where to find it:** no screen of its own. Searched apps/extension-vscode for text output; the rule lives in the model registry and routing, not in a screen.

## S76.03 Image understanding.

- **Expected:** The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108; packages/ai/routing/src/auto.ts:1406; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2212; apps/cli/src/app_server/developer_host.rs:1672; apps/cli/src/models/streaming.rs:226 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Select Model > pick a model that cannot read images while the current model can (labels found in the code)
- **Needs:** a model that reads images and one that does not (the app does not label this)
- **Steps:**
  1. Press Cmd+Shift+P, type Code: Select Model, press Enter.
  2. Click a model that cannot read images (the app does not label which models read images).
  3. Look for the modal "Switch to ...?" whose detail says it "cannot read images you attach"; compare with Expected.

## S76.21 Function/tool calling.

- **Expected:** The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5406; packages/ai/routing/src/auto.ts:1406; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5386; apps/cli/src/models/streaming.rs:226 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Select Model > pick a model without tools while the current model has tools (labels found in the code)
- **Needs:** a model with tools and one without (the app does not label this)
- **Steps:**
  1. Press Cmd+Shift+P, type Code: Select Model, press Enter.
  2. Click a model that cannot use tools (the picker does not show tool support).
  3. Look for the modal "Switch to ...?" whose detail says it "cannot use tools, so it cannot read or edit files or run commands"; compare with Expected.

## S76.22 Parallel tool calls.

- **Expected:** The registry records whether a model supports parallel tool calls and the tool loop uses it.
- **Code:** done. Evidence present: packages/ai/model-registry/catalog/harnesses.json:39; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5400; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts (text found, layout changed)
- **Where to find it:** no screen of its own. Searched for a parallel tool-call setting in the extension; none is shown to a person.

## S76.23 Multi-round tool use.

- **Expected:** The registry records agentic (multi-round tool) capability and the request path uses it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; packages/ai/providers/openai/src/index.ts:167; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5386; apps/cli/src/models/streaming.rs:226 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. No screen names multi-round tool use; the registry value is not shown to a person.

## S76.26 Reasoning-effort controls.

- **Expected:** The registry records per-model reasoning-effort levels and each surface offers and sends only those levels.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:329 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5235
- **Where to find it:** Chat composer > Mode and reasoning effort button > Reasoning effort group (labels found in the code)
- **Steps:**
  1. In the chat composer, click the button labelled Mode and reasoning effort.
  2. Read the Reasoning effort group in the popover.
  3. Click the model pill (Auto) and choose a model; reopen Mode and reasoning effort.
  4. Compare: the group lists only the levels that model takes, or shows This model does not take a reasoning effort. when it takes none.

## S76.28 Context-window limit.

- **Expected:** The registry records each model context window; the product shows it and trims or refuses over-long requests accordingly.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:291
- **Where to find it:** Command Palette > Code: Select Model (the N context figure), and the context figure in the chat composer after a reply (labels found in the code)
- **Steps:**
  1. Press Cmd+Shift+P, type Code: Select Model, press Enter.
  2. Read the grey detail line under a model: its id, then N context and N output.
  3. Close the picker, send a message in chat, then hover over the context figure in the composer.
  4. Compare the tooltip text Context after the last turn with Expected and with the context figure from the picker.

## S76.29 Output-token limit.

- **Expected:** The registry records each model output-token limit; requests are capped by it and it is shown.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:294
- **Where to find it:** Command Palette > Code: Select Model (the N output figure on each model's detail line) (labels found in the code)
- **Steps:**
  1. Press Cmd+Shift+P, type Code: Select Model, press Enter.
  2. Read the detail line under a model: its id, N context, then N output.
  3. Compare the N output figure with Expected.

## S76.31 Streaming capabilities.

- **Expected:** The registry records streaming support per model and the request path picks a transport accordingly.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/providers/openai/src/index.ts:167
- **Where to find it:** no screen of its own. Searched the extension for a streaming setting; none is shown to a person.

## S76.32 Cache capabilities.

- **Expected:** The registry records prompt-cache capability and route cache class, and routing/caching decisions use them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1169; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2822
- **Where to find it:** Chat reply > Prompt cache line under the reply (after a second message in the same chat) (labels found in the code)
- **Needs:** a chat whose route reports prompt-cache tokens (the app does not say which routes do)
- **Steps:**
  1. Sign in, open a chat and send a message; wait for the reply.
  2. Send a second message in the same chat and wait for the reply.
  3. Look under the second reply for a line starting Prompt cache with reused or written token counts.
  4. Compare with Expected; the line appears only when the reply reports cache tokens.

## S76.34 Regional route availability.

- **Expected:** The registry records model and provider residency regions and routing refuses routes outside the required region.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1055
- **Where to find it:** no screen of its own. Searched apps/extension-vscode/src for region and residency; no region setting or region text was found.

## S76.35 Retention/data-use constraints.

- **Expected:** The registry records provider/route data retention and routing honours zero-retention requirements.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1099
- **Where to find it:** no screen of its own. Searched apps/extension-vscode/src for retention; none found. Local privacy mode concerns network access, not retention.

## S76.37 Model lifecycle and retirement.

- **Expected:** The registry records lifecycle stage, deprecation and retirement, and pickers/routing exclude or label models accordingly.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1353
- **Where to find it:** Command Palette > Code: Select Model (labels found in the code)
- **Steps:**
  1. Press Cmd+Shift+P, type Code: Select Model, press Enter.
  2. Scroll through every provider group in the list.
  3. Compare the models listed with Expected: models whose availability is not live are left out of the list.

## S76.38 Route-specific differences.

- **Expected:** The registry records route-dependent capabilities, cache class, retention and price per provider route, and routing ranks routes by them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1099; packages/ai/routing/src/auto.ts:1169
- **Where to find it:** Command Palette > Code: Select Model (locked group headings at the bottom of the list) (labels found in the code)
- **Needs:** a session whose route locks some models (for example a signed-out or Free session)
- **Steps:**
  1. Press Cmd+Shift+P, type Code: Select Model, press Enter.
  2. Scroll to the bottom and read the locked group headings.
  3. Click a locked model and read the message that explains it cannot run on this session's route.
  4. Compare the headings and message with Expected.
