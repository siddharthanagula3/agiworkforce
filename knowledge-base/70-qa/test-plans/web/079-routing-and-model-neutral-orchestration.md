---
id: "PLAN-web-079"
type: "test-plan"
title: "Web · 79. Routing and model-neutral orchestration"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "79"
---
# Web · 79. Routing and model-neutral orchestration

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S79.01 Automatic model selection.

- **Expected:** Auto picks a model per request from the registry for the task, plan and constraints.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1425
- **Where to find it:** Composer model button (the selected model name, e.g. under the message box) > top row "Auto" (labels found in the code)
- **Needs:** a paid account (Free accounts see "Auto (free) · community models, capacity varies" instead)
- **Steps:**
  1. Sign in with a paid account.
  2. Click the model name button at the bottom of the message box (its accessible name ends in "Change model").
  3. Find the row labelled "Auto" with the text "Picks the best model for each message" and click it.
  4. Send a short message and an image-free question, then look at the answer: it should come from a model chosen by Auto, not a fixed one.

## S79.02 User-selected model.

- **Expected:** The user can pick a specific model and the request runs on it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1148; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** Composer model button > model rows below "Auto" (under "Recommended" or the model list) (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid account.
  2. Click the model name button at the bottom of the message box.
  3. Click any model row other than "Auto", for example one listed under "Recommended".
  4. Send a message and check that the model name shown in the composer button is the one you picked.

## S79.03 Project default model.

- **Expected:** A project can set a default model that new chats in the project use.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectDefaultModelField.tsx:53; apps/web/features/projects/components/ProjectSettingsDialog.tsx:336; apps/web/features/projects/components/ProjectSettingsDialog.tsx:83; apps/web/features/chat/pages/WebChatPage.tsx:2141
- **Where to find it:** Projects > open a project > the More (···) button > project settings, then the "Default model" field (labels found in the code)
- **Needs:** a paid account, a project
- **Steps:**
  1. Open Projects from the left sidebar and open a project.
  2. Click the More (···) button at the top of the project and open its settings.
  3. Find the "Default model" field and pick a model from the dropdown.
  4. Save, open a new chat in that project and check the composer shows the chosen model.

## S79.04 Task-specific model profile.

- **Expected:** Auto applies a task-specific routing profile (e.g. premium for coding and reasoning).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:33; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** Composer model button > "Auto" row, then the profile rows "Instant", "Best", "Economy" below it (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid account.
  2. Click the model name button at the bottom of the message box.
  3. Click "Instant", "Best" or "Economy" under the "Auto" row.
  4. Send a question about coding or reasoning and compare the answer's model with what the row said.

## S79.05 Speed-first profile.

- **Expected:** A speed-first routing profile can be applied that prefers the fastest eligible route.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1661; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4769; apps/web/lib/hooks/useChatStream.ts:4646
- **Where to find it:** Composer model button > "Instant" row (under "Auto") (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid account.
  2. Click the model name button at the bottom of the message box.
  3. Click the row "Instant" with the text "Answers fastest, on the quickest models your plan includes."
  4. Send a short question and check the answer arrives quickly and the composer shows a fast model.

## S79.06 Quality-first profile.

- **Expected:** A quality-first routing profile can be applied that prefers the most capable eligible route.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1661; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3635
- **Where to find it:** Composer model button > "Best" row (under "Auto") (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid account.
  2. Click the model name button at the bottom of the message box.
  3. Click the row "Best" with the text "The most capable model your plan includes, for harder work."
  4. Send a hard question and check the composer shows the most capable model for your plan.

## S79.07 Cost-first profile.

- **Expected:** A cost-first routing profile can be applied that prefers the cheapest eligible route.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1661; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3635
- **Where to find it:** Composer model button > "Economy" row (under "Auto") (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid account.
  2. Click the model name button at the bottom of the message box.
  3. Click the row "Economy" with the text "The lowest-cost model that can handle the task."
  4. Send a simple question and check the composer shows a low-cost model.

## S79.08 Privacy-first profile.

- **Expected:** A privacy-first profile keeps requests on local models or zero-retention routes.
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspacePolicySection.tsx:668; packages/ai/routing/src/auto.ts:1099
- **Where to find it:** Settings > Workspace policy > "Zero data retention only" (labels found in the code)
- **Needs:** an organization admin account
- **Steps:**
  1. Open Settings and go to Workspace policy (organization admin access is needed to change it).
  2. Find the row "Zero data retention only".
  3. Turn on the toggle and save.
  4. Send a request and check that it is refused rather than sent to a provider without zero data retention.

## S79.09 Classification of task intent.

- **Expected:** Each request's task intent is classified and used for routing.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/classify.ts:137
- **Where to find it:** no screen of its own. Intent classification is internal routing logic in packages/ai/routing/src/classify.ts with no control of its own; its effect shows only as the model chosen.

## S79.10 Classification of required tools.

- **Expected:** Which tools a request needs (research, agentic work, code execution) changes the routing task.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1032
- **Where to find it:** no screen of its own. Tool needs are classified on the server (request-processor.ts) with no control of its own.

## S79.11 Classification of required modalities.

- **Expected:** Attached images/video route the request to a multimodal-capable model.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/classify.ts:164; packages/ai/routing/src/auto.ts:1406
- **Where to find it:** no screen of its own. Attached-media routing is internal; the only visible result is the "Choose a compatible model" offer (see S79.21).

## S79.12 Complexity/effort classification.

- **Expected:** Requests are classified by complexity so routing can set a quality floor or effort.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. Complexity classification is internal (packages/ai/routing/src/task-family.ts) with no visible control.

## S79.13 Source-freshness classification.

- **Expected:** Requests needing current information are detected and routed to search-capable handling.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:981
- **Where to find it:** no screen of its own. Freshness detection is server-side with no visible control; the effect shows only in the answer.

## S79.14 Model eligibility filtering.

- **Expected:** Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1406; packages/ai/routing/src/auto.ts:1353
- **Where to find it:** no screen of its own. Candidate filtering is a server rule; its effect is visible only as which models appear in the picker.

## S79.15 Provider-route selection.

- **Expected:** Among eligible routes for a model, one provider route is chosen by ranking (health, cost, cache).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1425
- **Where to find it:** no screen of its own. Provider route choice is server-side ranking with no control of its own.

## S79.16 Exact-model lock.

- **Expected:** An explicitly chosen model is never silently swapped for another model.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1148; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. A server rule. Visible sign: a model picked by hand is not replaced; the "Moved to" line (S79.26) appears only for Auto moves.

## S79.19 Quota-aware selection.

- **Expected:** Routing takes the user's remaining budget into account when choosing a route.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4634
- **Where to find it:** no screen of its own. Quota-aware routing is server-side with no control of its own.

## S79.20 Health-aware fallback.

- **Expected:** Unhealthy routes are demoted and failed calls fall back to healthy alternatives.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1810 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/route.ts:1051
- **Where to find it:** no screen of its own. Health fallback is server-side. A visible fallback notice exists (role=status, testid fallback-reason-notice in MessageBubble.tsx) but its wording was not read.

## S79.21 Explicit model-switch offer.

- **Expected:** When another model would work better, the user is offered an explicit one-click switch.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5477; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1511
- **Where to find it:** Message box > attach a file or image that the selected model cannot read > "Choose a compatible model" (labels found in the code)
- **Needs:** a file to upload, a model that cannot read it
- **Steps:**
  1. Select a model that cannot read images.
  2. Attach an image to the message box.
  3. Read the warning and click "Choose a compatible model".
  4. Pick a model from the list and check the composer switches to it and the attachment is kept.

## S79.24 Multi-model comparison.

- **Expected:** One prompt can be sent to several models and the answers compared.
- **Code:** done. Evidence present: apps/web/features/models/components/ModelCatalogueBrowser.tsx:314; apps/web/app/models/compare/page.tsx:24; apps/web/features/models/lib/use-compare-answers.ts:116; apps/web/features/models/lib/compare-answer-stream.ts:140; apps/web/features/models/components/CompareAnswersPage.tsx:345
- **Where to find it:** Models (catalogue) > the Compare button (scale icon) on two or more model cards > Compare answers page (labels found in the code)
- **Needs:** a paid account (at least two models your plan includes)
- **Steps:**
  1. Open the models catalogue.
  2. Click the scale icon on two models (its accessible name is "Compare <model name>").
  3. Open the compare answers view and type one prompt in the box "Ask every model the same thing".
  4. Press send and check each model returns its own answer side by side.

## S79.26 User-visible routing explanation.

- **Expected:** The user can see why Auto chose (or moved to) a model.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/lib/modelEscalation.ts:58; packages/contracts/types/src/auto-route-explanation.ts:13
- **Where to find it:** A chat answer > the small line "Moved to <model>: <reason>" under the answer (appears only when Auto switched models) (labels found in the code)
- **Needs:** a paid account, a long chat or a case where Auto moves
- **Steps:**
  1. Start a chat with Auto and keep sending messages until Auto moves to another model (it is not forced).
  2. Look at the answer where the model changed.
  3. Read the line under the answer that starts with "Moved to".
  4. Check the reason text matches the reasons listed in the contracts file.

## S79.27 Actual-model attribution.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3513; packages/ui/unified-chat/src/lib/modelEscalation.ts:38
- **Where to find it:** not found in the code. Only the "Moved to" receipt (apps/web/features/chat/components/messages/MessageBubble.tsx) was found, and it shows only after a move; no per-answer model name was found.

## S79.28 Routing-policy versioning.

- **Expected:** Routing policies are versioned and each decision can be traced to the policy version that made it.
- **Code:** done. Evidence present: packages/ai/routing/src/routing-trace.ts:154; apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:73
- **Where to find it:** not found in the code. Searched apps/web and packages/ui for routing policy version text: none found; trace code is in packages/ai/routing/src/routing-trace.ts and a service in apps/web/lib/services/model-rollout/.

## S79.30 Classification failure fallback.

- **Expected:** When classification fails or is ambiguous, routing falls back to a safe default.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278 (quoted code not found in the file now); packages/ai/routing/src/task-family.ts:173
- **Where to find it:** no screen of its own. Fallback on ambiguous classification is server-side; the visible result is a normal answer.
