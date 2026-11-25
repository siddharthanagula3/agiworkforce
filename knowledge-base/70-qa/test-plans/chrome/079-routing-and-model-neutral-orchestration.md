---
id: "PLAN-chrome-079"
type: "test-plan"
title: "Chrome · 79. Routing and model-neutral orchestration"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "79"
---
# Chrome · 79. Routing and model-neutral orchestration

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S79.01 Automatic model selection.

- **Expected:** Auto picks a model per request from the registry for the task, plan and constraints.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1425
- **Where to find it:** Composer model button (reads "Auto" by default) > first row "Auto" in the menu (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in to the AGI Chrome side panel.
  2. Look at the button under the message box; it reads "Auto" when Auto is selected.
  3. Click that button and read the first row, "Auto", with its line "Picks the best model for each message".
  4. Send a short chat question, then a coding question.
  5. Look under each answer for a small line with a model name; compare it with Expected: Auto picks a model per request.

## S79.02 User-selected model.

- **Expected:** The user can pick a specific model and the request runs on it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** Composer model button > "Recommended" list > click a model name, or "All models ($COUNT$)" for the full list (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the composer model button.
  2. Under "Recommended", click a model name.
  3. Confirm the composer button now shows that model instead of "Auto".
  4. Send a message and read the model name under the answer.
  5. Compare with Expected: the answer comes from the model you picked.

## S79.04 Task-specific model profile.

- **Expected:** Auto applies a task-specific routing profile (e.g. premium for coding and reasoning).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:33; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** no screen of its own. The task-to-profile map is in packages/ai/model-registry/catalog/routing-policies.json (autoProfileByTask). The premium profile has no menu row of its own (auto-premium is not selectable), so it is seen only through the answering model.
- **Needs:** a signed-in account
- **Steps:**
  1. With "Auto" selected, send a plain chat question, then a coding request.
  2. Read the model name under each answer.
  3. Compare with Expected: coding and reasoning requests get the premium profile.

## S79.07 Cost-first profile.

- **Expected:** A cost-first routing profile can be applied that prefers the cheapest eligible route.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6071 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:418 (quoted code not found in the file now)
- **Where to find it:** Composer model button (with "Auto" selected) > "Quick" toggle below the "Effort" section (labels found in the code)
- **Needs:** a signed-in account whose plan includes the cheapest Auto route (the toggle is greyed out otherwise)
- **Steps:**
  1. Sign in and select "Auto" in the composer model button.
  2. Open the model button and scroll to the "Quick" toggle, with its line "Answers faster on a cheaper route, good for summaries and quick lookups".
  3. Switch "Quick" on and send a short question.
  4. Read the model name under the answer and compare with the same question with "Quick" off.
  5. Compare with Expected: Quick uses the cheaper route.

## S79.09 Classification of task intent.

- **Expected:** Each request's task intent is classified and used for routing.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/classify.ts:137
- **Where to find it:** no screen of its own. Classification runs on the server (packages/ai/routing/src/classify.ts). Not visible directly.
- **Needs:** a signed-in account
- **Steps:**
  1. With "Auto" selected, send a greeting, then a request to write code.
  2. Read the model name under each answer.
  3. Compare with Expected: each request is routed by its task.

## S79.10 Classification of required tools.

- **Expected:** Which tools a request needs (research, agentic work, code execution) changes the routing task.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1032
- **Where to find it:** no screen of its own. The tool classification code cited (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts) is outside apps/extension, so it was not confirmed in the extension.
- **Needs:** a signed-in account
- **Steps:**
  1. With "Auto" selected, ask for information that needs a live web search.
  2. Read the model name under the answer and check whether it names sources.
  3. Open the model button > "All models ($COUNT$)" and use the "Web search" filter to see which models offer that capability.
  4. Compare with Expected: the request is routed to a search-capable model.

## S79.11 Classification of required modalities.

- **Expected:** Attached images/video route the request to a multimodal-capable model.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/classify.ts:164; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** no screen of its own. The attach menu item is in apps/extension/src/side_panel.ts; the trigger button's visible text was not confirmed.
- **Needs:** a file to upload (an image) and a signed-in account
- **Steps:**
  1. With "Auto" selected, open the composer attach menu and choose "Upload from device".
  2. Pick an image and ask a question about it.
  3. Read the model name under the answer; open the model button > "All models ($COUNT$)" and filter by "Vision" to see which models accept images.
  4. Compare with Expected: the answer comes from a model that can read images.

## S79.12 Complexity/effort classification.

- **Expected:** Requests are classified by complexity so routing can set a quality floor or effort.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. The classification is inner logic in packages/ai/routing/src/task-family.ts. The effort badge only shows once a model is resolved.
- **Needs:** a signed-in account
- **Steps:**
  1. With "Auto" selected, send a simple question and read the effort badge on the composer model button.
  2. Send a hard multi-step problem and read the badge again.
  3. Compare with Expected: the effort level changes with complexity.

## S79.13 Source-freshness classification.

- **Expected:** Requests needing current information are detected and routed to search-capable handling.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:981
- **Where to find it:** no screen of its own. Freshness detection is in apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts, outside apps/extension.
- **Needs:** a signed-in account
- **Steps:**
  1. With "Auto" selected, ask a question about today's news.
  2. Check whether the answer names sources or links.
  3. Open the model button > "All models ($COUNT$)" and use the "Web search" filter to compare capable models.
  4. Compare with Expected: a freshness request goes to search-capable handling.

## S79.14 Model eligibility filtering.

- **Expected:** Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1353
- **Where to find it:** Composer model button > "All models ($COUNT$)" (labels found in the code)
- **Needs:** a Free account, and a paid account to compare
- **Steps:**
  1. Sign in and open the composer model button.
  2. Click "All models ($COUNT$)" and scroll the list.
  3. Look for rows with a lock label and the hint "Opens plans in a new tab".
  4. Pick an unlocked model and send a message to confirm it is used.
  5. Compare with Expected: only models the plan allows can be chosen.

## S79.15 Provider-route selection.

- **Expected:** Among eligible routes for a model, one provider route is chosen by ranking (health, cost, cache).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/auto.ts:1425
- **Where to find it:** no screen of its own. The answer footer shows the model, not the provider route, so the health, cost and cache ranking cannot be seen from the UI. Ranking is in packages/ai/routing/src/auto.ts.

## S79.16 Exact-model lock.

- **Expected:** An explicitly chosen model is never silently swapped for another model.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** Composer model button > pick a model under "Recommended" or "All models ($COUNT$)" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Pick a specific model from the composer model button.
  2. Send several messages, including a hard one, in the same chat.
  3. Read the model name under each answer and check that no "Moved to" line appears.
  4. Compare with Expected: the chosen model is never swapped.

## S79.19 Quota-aware selection.

- **Expected:** Routing takes the user's remaining budget into account when choosing a route.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4634
- **Where to find it:** no screen of its own. Quota-aware choice is in apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts. No visible effect could be confirmed from the extension UI.

## S79.20 Health-aware fallback.

- **Expected:** Unhealthy routes are demoted and failed calls fall back to healthy alternatives.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1810 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/route.ts:1051
- **Where to find it:** no screen of its own. Health fallback is in apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts and route.ts. The reason phrase for it is in packages/contracts/types/src/auto-route-explanation.ts.
- **Needs:** a signed-in account; a route outage cannot be forced from the UI
- **Steps:**
  1. With "Auto" selected, send several messages in one chat.
  2. Look under each answer for a line starting "Moved to" and read its reason.
  3. Compare with Expected: an unhealthy route is replaced by a healthy one.

## S79.26 User-visible routing explanation.

- **Expected:** The user can see why Auto chose (or moved to) a model.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:1038; apps/extension/src/features/side-panel/bubbles.ts:471; apps/extension/src/features/side-panel/bubbles.ts:619; apps/extension/src/features/background/conversation-history.ts:394
- **Where to find it:** Chat answer > "Moved to" line under the answer; hover the model name in the answer footer (labels found in the code)
- **Needs:** a signed-in account; the "Moved to" line appears only when the model changes
- **Steps:**
  1. Sign in with "Auto" selected.
  2. Send messages until Auto answers with a different model; a line reading "Moved to ..." appears under that answer.
  3. Read the reason after the colon.
  4. Hover the model name in the answer footer and read the tooltip "Auto chose this model: ...".
  5. Compare with Expected: the user can see why Auto chose or moved to a model.

## S79.27 Actual-model attribution.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:9891; apps/extension/src/side_panel.ts:628 (quoted code not found in the file now)
- **Where to find it:** Answer footer under each reply (model name · duration) (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and send a message.
  2. Read the small line under the answer: a model name, then a time.
  3. Open the composer model button and compare the name with the model you chose.
  4. Compare with Expected: each answer names the model that produced it.

## S79.30 Classification failure fallback.

- **Expected:** When classification fails or is ambiguous, routing falls back to a safe default.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. Fallback on ambiguous classification is in packages/ai/routing/src/task-family.ts and the classification code; no visible control or message for it was found in the extension.
