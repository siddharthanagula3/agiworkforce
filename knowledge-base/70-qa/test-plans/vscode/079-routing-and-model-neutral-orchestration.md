---
id: "PLAN-vscode-079"
type: "test-plan"
title: "VS Code · 79. Routing and model-neutral orchestration"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "79"
---
# VS Code · 79. Routing and model-neutral orchestration

20 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S79.01 Automatic model selection.

- **Expected:** Auto picks a model per request from the registry for the task, plan and constraints.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1425
- **Where to find it:** Model pill (the word Auto under the chat box) > Recommended > Auto (labels found in the code)
- **Needs:** a signed-in AGI account (Auto is greyed out when signed out)
- **Steps:**
  1. Open a new chat in the AGI VS Code panel and read the model pill.
  2. Confirm the pill says Auto and that Auto is the first row under Recommended when you click it.
  3. Type a short question and send it.
  4. Check that the answer arrives and the pill still says Auto, with no model picked by you. Compare with Expected: Auto picks a model for each request.

## S79.02 User-selected model.

- **Expected:** The user can pick a specific model and the request runs on it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** Model pill > click a named model (not Auto); or Command Palette > Code: Select Model (labels found in the code)
- **Needs:** a signed-in AGI account; a local model in Ollama or LM Studio for the On this device group (optional)
- **Steps:**
  1. Click the model pill above the chat box.
  2. Choose a named model from the list (for example one under On this device if a local model is running, or another listed model).
  3. Send a short message.
  4. Check that the pill now shows the model you chose, and that the answer comes back. Compare with Expected: the request runs on the model you picked.

## S79.03 Project default model.

- **Expected:** A project can set a default model that new chats in the project use.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/projects/projectActions.ts:411
- **Where to find it:** Command Palette > Code: Show Projects > open a project > Default model (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Run Code: Show Projects from the Command Palette.
  2. Open a project with Code: Open Project.
  3. Click Default model in the project list and pick a model (or No default model to clear it).
  4. Run Code: Use Project in This Chat and start a new chat; compare the model pill with Expected. If the pill differs, a message offers Choose the model.

## S79.04 Task-specific model profile.

- **Expected:** Auto applies a task-specific routing profile (e.g. premium for coding and reasoning).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:33; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Model pill > Recommended > Auto · Best (labels found in the code)
- **Needs:** a signed-in AGI account on a plan that includes the Best profile
- **Steps:**
  1. Click the model pill.
  2. Under Recommended, choose Auto · Best.
  3. Send a coding or reasoning question.
  4. Check that the pill keeps Auto · Best and the answer arrives. Compare with Expected: a task-specific profile is applied.

## S79.05 Speed-first profile.

- **Expected:** A speed-first routing profile can be applied that prefers the fastest eligible route.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:447; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5411
- **Where to find it:** Model pill > Recommended > Auto · Instant (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Click the model pill.
  2. Under Recommended, choose Auto · Instant.
  3. Send a short question.
  4. Check that the pill keeps Auto · Instant and the answer comes back quickly. Compare with Expected: the fastest eligible route is used.

## S79.06 Quality-first profile.

- **Expected:** A quality-first routing profile can be applied that prefers the most capable eligible route.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:207 (quoted code not found in the file now); apps/extension-vscode/src/features/model-picker/modelConstants.ts:442 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5370; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3241 (quoted code not found in the file now)
- **Where to find it:** Model pill > Recommended > Auto · Best (labels found in the code)
- **Needs:** a signed-in AGI account on a plan that includes the Best profile
- **Steps:**
  1. Click the model pill.
  2. Under Recommended, choose Auto · Best.
  3. Send a harder question.
  4. Check that the pill keeps Auto · Best and the answer arrives. Compare with Expected: the most capable eligible route is used.

## S79.07 Cost-first profile.

- **Expected:** A cost-first routing profile can be applied that prefers the cheapest eligible route.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:207 (quoted code not found in the file now); apps/extension-vscode/src/features/model-picker/modelConstants.ts:442 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5370; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3241 (quoted code not found in the file now)
- **Where to find it:** Model pill > Recommended > Auto · Economy (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Click the model pill.
  2. Under Recommended, choose Auto · Economy.
  3. Send a simple question.
  4. Check that the pill keeps Auto · Economy and the answer arrives. Compare with Expected: the cheapest eligible route is used.

## S79.08 Privacy-first profile.

- **Expected:** A privacy-first profile keeps requests on local models or zero-retention routes.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/reachability.ts:6; apps/extension-vscode/src/features/model-picker/modelConstants.ts:286
- **Where to find it:** not found in the code. No privacy-first profile is in the Auto rows (only Auto, Instant, Best, Economy). The nearest visible controls are the On this device group in the model pill and the trust-boundary warning in Code: Select Model. Searched the model-picker folder and the routing profile list for privacy.
- **Needs:** a local model running in Ollama or LM Studio (for the nearest control)

## S79.09 Classification of task intent.

- **Expected:** Each request's task intent is classified and used for routing.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/integrations/routingTask.ts:19
- **Where to find it:** no screen of its own. Intent classification runs in the chat state code for each message when Auto is selected, with no control or label of its own.

## S79.10 Classification of required tools.

- **Expected:** Which tools a request needs (research, agentic work, code execution) changes the routing task.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1032
- **Where to find it:** no screen of its own. Tool needs are classified per request with no control of their own; the Browse the web toggle is a separate manual control.

## S79.11 Classification of required modalities.

- **Expected:** Attached images/video route the request to a multimodal-capable model.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/classify.ts:164; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** no screen of its own. The exact label of the plus control was not confirmed; the menu is labelled Add context.
- **Needs:** an image file and a signed-in AGI account
- **Steps:**
  1. Click the plus control in the chat box and choose an image under Add context.
  2. Send a question about the image.
  3. Check that the answer describes the image instead of saying it cannot see one. Compare with Expected: the request is sent to a model that accepts images.

## S79.12 Complexity/effort classification.

- **Expected:** Requests are classified by complexity so routing can set a quality floor or effort.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. Complexity is classified per request with no visible label; the effort setting is a separate control.

## S79.13 Source-freshness classification.

- **Expected:** Requests needing current information are detected and routed to search-capable handling.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:981
- **Where to find it:** no screen of its own. The code detects fresh-information requests without a control. The Browse the web toggle is manual and is not the automatic detection Expected describes.

## S79.14 Model eligibility filtering.

- **Expected:** Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1353
- **Where to find it:** no screen of its own. The pill list greys rows; the lock icon appears in the Code: Select Model list.
- **Needs:** a signed-out or no-plan account
- **Steps:**
  1. Sign out, or use an account with no plan, then open the model pill.
  2. Look for greyed Auto rows and any Needs setup on this machine section.
  3. Open Command Palette > Code: Select Model and check that unavailable rows show a lock.
  4. Compare with Expected: unavailable models are not offered as choices that fail.

## S79.15 Provider-route selection.

- **Expected:** Among eligible routes for a model, one provider route is chosen by ranking (health, cost, cache).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/auto.ts:1425
- **Where to find it:** no screen of its own. Route ranking by health, cost and cache is server and runtime logic with no visible control.

## S79.16 Exact-model lock.

- **Expected:** An explicitly chosen model is never silently swapped for another model.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** Model pill > click a named model (not Auto), then send a message that fails (labels found in the code)
- **Needs:** a signed-in account; a route that fails (for example a spent free allowance) to see the card
- **Steps:**
  1. Pick a named model in the model pill.
  2. Send a message.
  3. If the turn fails, read the failure card; it offers Switch model, and the chat does not switch by itself.
  4. If you pick a model that would lose something, read the Switch to <model>? prompt and its Switch anyway button. Compare with Expected: the chosen model is not replaced silently.

## S79.19 Quota-aware selection.

- **Expected:** Routing takes the user's remaining budget into account when choosing a route.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4634
- **Where to find it:** no screen of its own. Budget-aware choice of route is inner logic; only the resulting failure card is visible.
- **Needs:** a Free account with a spent allowance
- **Steps:**
  1. Use up the free allowance on a Free account, or hit a plan limit.
  2. Send a message.
  3. Read the failure card and check that it offers Switch model or names a reset time. Compare with Expected: routing accounts for the remaining budget.

## S79.20 Health-aware fallback.

- **Expected:** Unhealthy routes are demoted and failed calls fall back to healthy alternatives.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1810 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/route.ts:1051
- **Where to find it:** no screen of its own. Health-based demotion is inner; the visible part is the card and its offer.
- **Needs:** a route that fails (for example a provider with no credit)
- **Steps:**
  1. Cause a route failure, for example a provider with no credit.
  2. Read the failure card.
  3. Click Continue with <model> if it is shown, and check the turn is sent again on another model. Compare with Expected: failed calls fall back to a healthy alternative.

## S79.21 Explicit model-switch offer.

- **Expected:** When another model would work better, the user is offered an explicit one-click switch.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:479; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:467
- **Where to find it:** Chat failure card > Switch model (opens the model list) (labels found in the code)
- **Needs:** a route failure, for example a spent free allowance
- **Steps:**
  1. Cause a route failure, for example a spent free allowance.
  2. Read the red failure card.
  3. Click Switch model and check that the model list opens. If the card instead shows Continue with <model>, click it and check the turn is resent on that model. Compare with Expected: a one-click switch is offered.

## S79.30 Classification failure fallback.

- **Expected:** When classification fails or is ambiguous, routing falls back to a safe default.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. The fallback itself is inner logic in the routing code; the visible part is that the default is Auto.
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Open a new chat and do not change the model pill.
  2. Check the pill reads Auto.
  3. Send a plain message and check an answer arrives. Compare with Expected: an unclear request falls back to a safe default.
