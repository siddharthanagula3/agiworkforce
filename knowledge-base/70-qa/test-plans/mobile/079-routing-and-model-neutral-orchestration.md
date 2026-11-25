---
id: "PLAN-mobile-079"
type: "test-plan"
title: "Mobile · 79. Routing and model-neutral orchestration"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "79"
---
# Mobile · 79. Routing and model-neutral orchestration

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S79.01 Automatic model selection.

- **Expected:** Auto picks a model per request from the registry for the task, plan and constraints.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1425
- **Where to find it:** Open navigation drawer > Settings > General > Models > Auto (labels found in the code)
- **Steps:**
  1. Tap the menu icon at the top left of the chat screen (Open navigation drawer).
  2. Tap Settings, then General, then Models.
  3. Tap the row Auto at the top of the list.
  4. Go back to the chat, send a message, and read the answer's footer (provider · model) to see which model answered.
  5. Compare with Expected: Auto should pick a model for the request from the registry.

## S79.02 User-selected model.

- **Expected:** The user can pick a specific model and the request runs on it.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** Open navigation drawer > Settings > General > Models > pick a specific model row (labels found in the code)
- **Needs:** a Cloud account for cloud models (a Free account can choose Free models)
- **Steps:**
  1. Tap the menu icon at the top left (Open navigation drawer).
  2. Tap Settings, then General, then Models.
  3. Under Selected model, tap a named model row that is not Auto.
  4. Go back to the chat, send a message, and read the footer under the answer.
  5. Compare with Expected: the footer should show the chosen model, not a different one.

## S79.03 Project default model.

- **Expected:** A project can set a default model that new chats in the project use.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:218 (quoted code not found in the file now); apps/mobile/stores/projects/cloudProjectStore.ts:149
- **Where to find it:** Open navigation drawer > Projects > tap a project > Default model: (labels found in the code)
- **Needs:** a Cloud account and a project whose default model was set on the web app
- **Steps:**
  1. Tap the menu icon at the top left (Open navigation drawer).
  2. Under Projects, tap a Cloud project.
  3. Read the line Default model: on the project's details.
  4. Tap New chat inside that project and check the model it opens with.
  5. Compare with Expected: a new chat in the project should use the project's default model.

## S79.04 Task-specific model profile.

- **Expected:** Auto applies a task-specific routing profile (e.g. premium for coding and reasoning).
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:33; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** no screen of its own. The task-specific profile is set in the routing registry (autoProfileByTask, coding maps to premium); no mobile control sets it. The line appears only when the answering model differs from the requested one.
- **Needs:** a Cloud account
- **Steps:**
  1. Select Auto as the model (see S79.01).
  2. Send a coding or reasoning request, for example a small function to write.
  3. Read the line under the answer that starts with Auto chose, if it appears.

## S79.08 Privacy-first profile.

- **Expected:** A privacy-first profile keeps requests on local models or zero-retention routes.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/capabilities/index.tsx:102; apps/mobile/src/features/model-picker/service.ts:37
- **Where to find it:** not found in the code. No privacy-first profile control found in apps/mobile. Searched for zero retention, retention and privacy profile. Nearest controls: the Local / Cloud switch in the drawer (ModeToggle, accessibility label Local Mode, apps/mobile/src/features/chat/components/ModeToggle.tsx) and Settings > Privacy > Data retention (apps/mobile/src/features/settings/cloud-privacy/index.tsx).

## S79.09 Classification of task intent.

- **Expected:** Each request's task intent is classified and used for routing.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/classify.ts:137
- **Where to find it:** no screen of its own. Intent classification has no control; the code is in packages/ai/routing/src/classify.ts.
- **Needs:** a Cloud account
- **Steps:**
  1. Select Auto and send two different requests, one simple and one that needs a specialised task.
  2. Compare the footer model under each answer, and any Auto chose line.

## S79.10 Classification of required tools.

- **Expected:** Which tools a request needs (research, agentic work, code execution) changes the routing task.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1032
- **Where to find it:** no screen of its own. The tool control is shown as Active chat tools in apps/mobile/src/features/chat/components/ChatInput.tsx (accessibility label only), so the label is not a visible word.
- **Needs:** a Cloud account
- **Steps:**
  1. Turn on a chat tool such as search or a code tool from the chat tools control.
  2. Send a request that needs that tool, then read the footer under the answer for the model used.

## S79.11 Classification of required modalities.

- **Expected:** Attached images/video route the request to a multimodal-capable model.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/classify.ts:164; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** no screen of its own. Modality classification is in packages/ai/routing/src/classify.ts and has no control of its own.
- **Needs:** a photo to attach and a Cloud account
- **Steps:**
  1. Select Auto, attach a photo to the message, and ask about it.
  2. Read the footer under the answer for the model that answered, and check that it can read images.

## S79.12 Complexity/effort classification.

- **Expected:** Requests are classified by complexity so routing can set a quality floor or effort.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. The effort controls in the picker are chosen by the user and are not the routing classification.
- **Needs:** a Cloud account
- **Steps:**
  1. Send a very short question and then a long multi-step question with Auto selected.
  2. Compare the footer model under each answer.

## S79.13 Source-freshness classification.

- **Expected:** Requests needing current information are detected and routed to search-capable handling.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:981
- **Where to find it:** no screen of its own. Freshness detection has no visible control; the routing code is in apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts.
- **Needs:** a Cloud account and an internet connection
- **Steps:**
  1. Select Auto and ask about a current event, for example today's news.
  2. Check that the answer shows current information and read the footer for the model used.

## S79.14 Model eligibility filtering.

- **Expected:** Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1353
- **Where to find it:** no screen of its own. The locked-row message is an accessibility hint in apps/mobile/src/features/model-picker/components/ModelRow.tsx, not visible text, so no exact visible label was found.
- **Needs:** a Free account, to see locked rows
- **Steps:**
  1. Open the model picker from Settings > General > Models.
  2. Look for rows that are locked or unavailable and compare them with the models your plan includes.

## S79.15 Provider-route selection.

- **Expected:** Among eligible routes for a model, one provider route is chosen by ranking (health, cost, cache).
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/auto.ts:1425
- **Where to find it:** no screen of its own. Only the model is shown in the footer under each answer, not the provider route.

## S79.16 Exact-model lock.

- **Expected:** An explicitly chosen model is never silently swapped for another model.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The server-side lock is in apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts.
- **Needs:** a Cloud account
- **Steps:**
  1. Open Settings > General > Models and pick a specific model that is not Auto.
  2. Send a message, then read the footer under the answer.
  3. Check the footer shows the same model and that no Auto chose line appears.

## S79.19 Quota-aware selection.

- **Expected:** Routing takes the user's remaining budget into account when choosing a route.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4634
- **Where to find it:** no screen of its own. The quota text is the description of a Free quota model; the budget check itself is not shown to the user.
- **Needs:** a Free account or a Cloud account with a limited plan
- **Steps:**
  1. Note the remaining usage shown in the app, then send several requests with Auto selected.
  2. Check the footer model under each answer as the usage is used up.

## S79.20 Health-aware fallback.

- **Expected:** Unhealthy routes are demoted and failed calls fall back to healthy alternatives.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1810 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/route.ts:1051
- **Where to find it:** no screen of its own. The fallback runs in apps/web/app/api/llm/v1/chat/completions/route.ts; it cannot be forced from the app, so reproduction is not dependable.
- **Needs:** a Cloud account
- **Steps:**
  1. Send a message with Auto selected and read the footer model.
  2. Repeat during a provider outage if one is known, and check the footer shows a working model.

## S79.21 Explicit model-switch offer.

- **Expected:** When another model would work better, the user is offered an explicit one-click switch.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/actions/alertBlockedImageRequest.ts:16; apps/mobile/app/(app)/chat/[id].tsx:742
- **Where to find it:** Chat composer > Add to chat (attach an image) > send an image edit request with an image model that cannot edit it > Use <model name> in the alert (labels found in the code)
- **Needs:** a Cloud account, a photo to attach, and an image model that cannot edit
- **Steps:**
  1. Tap Add to chat and attach a photo.
  2. Choose an image model that cannot edit images, then send an edit request.
  3. Read the alert and check whether it offers Use <model name> beside Cancel.
  4. Tap Use <model name> and check that the image model changes.
  5. Compare with Expected: the switch is offered as a one-tap choice.

## S79.24 Multi-model comparison.

- **Expected:** One prompt can be sent to several models and the answers compared.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1577; apps/mobile/src/features/compare/index.tsx:274
- **Where to find it:** Chat (Cloud mode) > message box > type / > compare (Compare model responses) > Compare Models (labels found in the code)
- **Needs:** a signed-in Cloud account
- **Steps:**
  1. Open a chat in Cloud mode.
  2. Tap the message box and type /.
  3. Tap compare, which reads Compare model responses.
  4. On the Compare Models screen, choose a model for each slot and send one prompt.
  5. Compare the two answers side by side with Expected.

## S79.26 User-visible routing explanation.

- **Expected:** The user can see why Auto chose (or moved to) a model.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:820
- **Where to find it:** Chat > ask a question > read the line under the answer that starts Auto chose (labels found in the code)
- **Needs:** a Cloud account
- **Steps:**
  1. Select Auto and send a question.
  2. Wait for the answer to finish.
  3. Read the line under the answer that starts with Auto chose, with the reason after it.
  4. Compare with Expected: the line should say why Auto picked or moved to a model.

## S79.27 Actual-model attribution.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1129; apps/mobile/src/features/chat/components/MessageBubble.tsx:189 (quoted code not found in the file now)
- **Where to find it:** Chat > send a message > read the footer under the answer (provider · model) (labels found in the code)
- **Steps:**
  1. Send any message in a chat.
  2. Wait for the answer to finish streaming.
  3. Read the small grey footer under the answer, which shows provider and model.
  4. Compare with Expected: the model named in the footer should be the one that answered.

## S79.28 Routing-policy versioning.

- **Expected:** Routing policies are versioned and each decision can be traced to the policy version that made it.
- **Code:** done. Evidence present: packages/ai/routing/src/routing-trace.ts:154; apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:73
- **Where to find it:** no screen of its own. Searched apps/mobile for routing policy version and trace; only the server-side trace in packages/ai/routing/src/routing-trace.ts and apps/web/lib/services/model-rollout/routing-decision-trace-service.ts exist.

## S79.30 Classification failure fallback.

- **Expected:** When classification fails or is ambiguous, routing falls back to a safe default.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. A failed classification cannot be forced from the app, so the effect is hard to reproduce on demand.
- **Needs:** a Cloud account
- **Steps:**
  1. Send an unusual or ambiguous message with Auto selected.
  2. Check the answer still arrives and read the footer for the model used.
