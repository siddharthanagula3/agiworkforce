---
id: "PLAN-desktop-079"
type: "test-plan"
title: "Desktop · 79. Routing and model-neutral orchestration"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "79"
---
# Desktop · 79. Routing and model-neutral orchestration

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S79.01 Automatic model selection.

- **Expected:** Auto picks a model per request from the registry for the task, plan and constraints.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1425
- **Where to find it:** Composer model picker > Auto (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in on a paid plan and open the model picker from the chat composer.
  2. Choose the row labelled Auto.
  3. Send a short question, then a harder coding question in a new chat.
  4. Compare the answers: Auto should pick a model for each message and a "Moved to" line appears when it changes model.

## S79.02 User-selected model.

- **Expected:** The user can pick a specific model and the request runs on it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1148; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** Composer model picker > choose a named model row (labels found in the code)
- **Needs:** a paid account (free plans see fewer models)
- **Steps:**
  1. Open the model picker from the chat composer.
  2. Choose a specific model from the list (for example under Recommended).
  3. Send a message.
  4. Check the answer is from the chosen model: no "Moved to" line should appear.

## S79.03 Project default model.

- **Expected:** A project can set a default model that new chats in the project use.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectDefaultModelField.tsx:53; apps/web/features/projects/components/ProjectSettingsDialog.tsx:336; apps/web/features/projects/components/ProjectSettingsDialog.tsx:83; apps/web/features/chat/pages/WebChatPage.tsx:2141
- **Where to find it:** Projects > open a project > Project settings > Default model (labels found in the code)
- **Needs:** a paid account, a project
- **Steps:**
  1. Open a project from the sidebar.
  2. Open Project settings.
  3. Under Default model, pick a model from the dropdown and save.
  4. Start a new chat inside that project and check the model shown in the composer is the default.

## S79.04 Task-specific model profile.

- **Expected:** Auto applies a task-specific routing profile (e.g. premium for coding and reasoning).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:33; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Composer model picker > Auto > Best (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open the model picker from the chat composer.
  2. Choose the row labelled Best under the Auto section.
  3. Send a harder coding or reasoning question.
  4. Check the answer and the model note; it should come from the most capable model your plan includes.

## S79.05 Speed-first profile.

- **Expected:** A speed-first routing profile can be applied that prefers the fastest eligible route.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1661; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4769; apps/web/lib/hooks/useChatStream.ts:4646
- **Where to find it:** Composer model picker > Instant (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open the model picker from the chat composer.
  2. Choose the row labelled Instant.
  3. Send a simple question.
  4. Check the answer comes back quickly and the model is one of your plan's fastest models.

## S79.06 Quality-first profile.

- **Expected:** A quality-first routing profile can be applied that prefers the most capable eligible route.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1661; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3635
- **Where to find it:** Composer model picker > Best (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open the model picker from the chat composer.
  2. Choose the row labelled Best.
  3. Send a hard question.
  4. Check the answer model is the most capable one your plan includes.

## S79.07 Cost-first profile.

- **Expected:** A cost-first routing profile can be applied that prefers the cheapest eligible route.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1661; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3635
- **Where to find it:** Composer model picker > Economy (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open the model picker from the chat composer.
  2. Choose the row labelled Economy.
  3. Send a simple task.
  4. Check the answer model is a low-cost one that can handle the task.

## S79.08 Privacy-first profile.

- **Expected:** A privacy-first profile keeps requests on local models or zero-retention routes.
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspacePolicySection.tsx:668; packages/ai/routing/src/auto.ts:1099
- **Where to find it:** Workspace policy > Default privacy mode (labels found in the code)
- **Needs:** a workspace admin account
- **Steps:**
  1. Open the Workspace policy page (admin only).
  2. Under Allowed privacy modes and Default privacy mode, read the Local option.
  3. Set Default privacy mode to Local and save.
  4. Check that Local shows the hint "On-device models. Nothing leaves the machine."

## S79.09 Classification of task intent.

- **Expected:** Each request's task intent is classified and used for routing.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/classify.ts:137
- **Where to find it:** no screen of its own. Intent classification is server-side inner behaviour; its effect shows only through model changes.
- **Steps:**
  1. Send a coding question and then a plain chat question in the same chat.
  2. Compare which model label appears under each answer ("Moved to" line if the model changed).

## S79.10 Classification of required tools.

- **Expected:** Which tools a request needs (research, agentic work, code execution) changes the routing task.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1032
- **Where to find it:** no screen of its own. Tool classification is server-side (request-processor); no direct control found.
- **Steps:**
  1. Ask for something that needs a web search, then a question that does not.
  2. Compare which model answers, using the "Moved to" line if shown.

## S79.11 Classification of required modalities.

- **Expected:** Attached images/video route the request to a multimodal-capable model.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/classify.ts:164; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Chat composer > attach an image > Choose a compatible model (labels found in the code)
- **Needs:** a file to upload (an image)
- **Steps:**
  1. Attach an image in the chat composer while the current model cannot read images.
  2. Look for the message "No model on your plan can read this attachment." or click Choose a compatible model.
  3. Pick a model from the list.
  4. Check the attachment is sent and the answer reads the image.

## S79.12 Complexity/effort classification.

- **Expected:** Requests are classified by complexity so routing can set a quality floor or effort.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. Complexity classification is internal; no visible setting found.
- **Steps:**
  1. Send a short simple question and then a long multi-step question.
  2. Compare the model and depth of the answers.

## S79.13 Source-freshness classification.

- **Expected:** Requests needing current information are detected and routed to search-capable handling.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:981
- **Where to find it:** no screen of its own. Freshness detection is server-side (request-processor); I did not verify the exact visible result.
- **Steps:**
  1. Ask about a current event such as today's news.
  2. Check whether the answer uses fresh sources.

## S79.14 Model eligibility filtering.

- **Expected:** Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1353
- **Where to find it:** no screen of its own. Filtering is applied before ranking; the effect is seen as a different model list per plan.
- **Needs:** a Free account and a paid account
- **Steps:**
  1. Open the model picker on a Free account and on a paid account.
  2. Compare which models are listed.

## S79.15 Provider-route selection.

- **Expected:** Among eligible routes for a model, one provider route is chosen by ranking (health, cost, cache).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1425
- **Where to find it:** no screen of its own. Provider-route choice has no visible control; it is server-side ranking.
- **Steps:**
  1. Send a message on a chosen model and check the answer comes back without an error.

## S79.16 Exact-model lock.

- **Expected:** An explicitly chosen model is never silently swapped for another model.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1148; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The lock is behaviour; visible proof is the absence of the "Moved to" line.
- **Needs:** a paid account
- **Steps:**
  1. Pick a specific model in the model picker.
  2. Send several messages.
  3. Check no answer shows a "Moved to" line, so the model is never swapped.

## S79.19 Quota-aware selection.

- **Expected:** Routing takes the user's remaining budget into account when choosing a route.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4634
- **Where to find it:** no screen of its own. Quota-aware selection is in request-processor; the exact limit message was not verified.
- **Needs:** a Free account
- **Steps:**
  1. Use a Free account until its usage limit is near.
  2. Send messages and check the model still answers or a limit message shows.

## S79.20 Health-aware fallback.

- **Expected:** Unhealthy routes are demoted and failed calls fall back to healthy alternatives.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1810 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/route.ts:1051
- **Where to find it:** no screen of its own. Fallback notice text was not read; the failure cannot be forced from the UI.
- **Steps:**
  1. If a model call fails, look under the answer for a fallback notice (role status, data-testid fallback-reason-notice).
  2. Check an answer still arrives.

## S79.21 Explicit model-switch offer.

- **Expected:** When another model would work better, the user is offered an explicit one-click switch.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5477; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1511
- **Where to find it:** not found in the code. Only the attachment conflict switch (Choose a compatible model, ChatComposerNew.tsx) was found; no general better-model one-click offer was found in the code read.
- **Needs:** a file to upload (an image)

## S79.24 Multi-model comparison.

- **Expected:** One prompt can be sent to several models and the answers compared.
- **Code:** done. Evidence present: apps/web/features/models/components/ModelCatalogueBrowser.tsx:314; apps/web/app/models/compare/page.tsx:24; apps/web/features/models/lib/use-compare-answers.ts:116; apps/web/features/models/lib/compare-answer-stream.ts:140; apps/web/features/models/components/CompareAnswersPage.tsx:345
- **Where to find it:** Models catalogue > select models > Compare (labels found in the code)
- **Steps:**
  1. Open the models catalogue page.
  2. Tick at least two models using their compare checkboxes.
  3. Click the Compare button.
  4. Check the comparison table lists the chosen models side by side.

## S79.26 User-visible routing explanation.

- **Expected:** The user can see why Auto chose (or moved to) a model.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/lib/modelEscalation.ts:58; packages/contracts/types/src/auto-route-explanation.ts:13
- **Where to find it:** Chat answer > line under the answer that starts "Moved to" (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Use Auto in a chat and send a message that makes Auto change model.
  2. Look under the answer for the line starting "Moved to" with the model name and reason.
  3. Check the reason explains why Auto chose or moved to that model.

## S79.27 Actual-model attribution.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3513; packages/ui/unified-chat/src/lib/modelEscalation.ts:38
- **Where to find it:** not found in the code. The receipt line under an answer (MessageBubble.tsx) appears only when a model escalation happened; a general model label on every answer was not found.

## S79.28 Routing-policy versioning.

- **Expected:** Routing policies are versioned and each decision can be traced to the policy version that made it.
- **Code:** done. Evidence present: packages/ai/routing/src/routing-trace.ts:154; apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:73
- **Where to find it:** no screen of its own. Policy versioning is server-side (routing-trace.ts, routing-decision-trace-service.ts); no visible control found.

## S79.30 Classification failure fallback.

- **Expected:** When classification fails or is ambiguous, routing falls back to a safe default.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. Fallback to a safe default is server-side (task-family.ts); visible effect is a normal answer.
- **Needs:** a paid account
- **Steps:**
  1. Send a short ambiguous message such as "hi" with Auto selected.
  2. Check an answer still arrives from a default model.
