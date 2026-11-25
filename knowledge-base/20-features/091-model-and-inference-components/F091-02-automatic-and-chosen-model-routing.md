---
id: "F091-02"
type: "feature"
title: "Automatic and chosen model routing"
aliases: ["Model router", "Auto routing", "Task classifier", "Exact-selection enforcement", "resolveAutoRoute", "Auto", "Economy / Balanced / Best profiles", "S91.19, S91.20, S91.23"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.19", "S91.20", "S91.23"]
depends_on: ["F091-01", "F091-05", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "mode:cloud", "mode:local", "surface:web", "surface:mobile", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-02 Automatic and chosen model routing

Turns the model choice into one model and one route. 'Auto' means the server classifies the task and picks a model the plan allows and the budget can afford. A named model must be used or refused with a reason. Cloud Code sessions send an explicit model with each agent turn, but clients may substitute it first.

Area: [91. Model and inference components](README.md). Requirement items: [S91.19](../../10-requirements/capabilities/091-model-and-inference-components.md#s9119), [S91.20](../../10-requirements/capabilities/091-model-and-inference-components.md#s9120), [S91.23](../../10-requirements/capabilities/091-model-and-inference-components.md#s9123).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** resolveAutoRoute takes a selection (Auto alias or a model id), task type, plan, trust mode and runtime profile and returns a selected model plus route and fallbacks, or an 'unavailable' code with reasons (packages/ai/routing/src/auto.ts:1722). classifyTaskLocally and classifyTaskFamily label the request (packages/ai/routing/src/classify.ts:137; packages/ai/routing/src/task-family.ts:173).

**Why it exists.** So people can leave the choice to the product (cost, plan, capability aware) or pin a model and be sure it is the one that answers (doc: docs/product/requirements.md:294-296; packages/ai/model-registry/catalog/routing-policies.json:566).

**Who uses it.** Everyone who sends a message. Developers read the routing package. Operators tune routing through catalog policy and environment switches.

**Problems it solves**

- Choosing a model per message by hand.
- A pinned model silently answered by a different model.
- Sending a message to a model the plan does not include.
- Spending more than the account budget allows.

**Use cases**

- Free or paid person leaves the picker on Auto and sends a coding question; the server classifies it and picks a coding-capable model.
- Person pins a model in the picker; the same model answers or the request is refused with a reason.
- Person on a lower plan pins a higher-plan model and gets a 403 'not available' error naming the plan.
- Cloud Code session starts an agent turn with the chosen model.

## 2. User experience

**Where to find it**

- Web chat: model trigger in the composer footer (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1932). Auto appears with label 'Auto' and description 'Automatically routes each message to the best model for the task, your plan, and cost' (packages/ai/model-registry/catalog/routing-policies.json aliases.auto).
- Mobile chat: ModelPickerSheet; local scope offers Auto on every plan, cloud scope only for plans allowed (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:318-325).
- Web Cloud Code page: model comes from the model store (apps/web/features/code/CloudCodePage.tsx:464).
- Mobile Cloud Code session screen (apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:243).
- VS Code: 'Continue in cloud' (apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:120).
- Chrome extension: managed chat routing (apps/extension/src/features/cloud-bridge/managedChatRouting.ts).
- Desktop: the hosted web app (doc: AGENTS.md section 5). CLI: unknown.

**Before you start**

- Cloud mode requires sign-in and a plan that allows the model; Auto is closed to the free tier in canAccessModel (apps/web/lib/model-tiers.ts:9-13), though the free-trial path has its own rules (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5330-5332).

**Screens and controls**

- Model picker with Auto and named models.
- Mobile Auto profile choices (economy, balanced, best), shown only when the plan allows (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:318).
- Cloud Code composer shows the agent model it will use (apps/web/features/code/CloudCodePage.tsx:2087).

**Journey**

1. Person picks Auto or a model.
2. Person sends a message; the client sends the selection as the request's model field.
3. Server classifies the task and builds a routing request from plan, budget, health and policy (apps/web/lib/server/managed-cloud-routing/routing-request.ts:94).
4. Router returns a selected model and route, or unavailable.
5. Server answers with a stream, or an error: 403 model_not_available with the needed plan, 422 model_route_unavailable, 403 model_not_available_in_region.
6. The served model is returned in the X-AGI-Resolved-Model header (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:961).

**What the person sees and gets**

- Error text 'Model <id> is on the <plan> plan, not yours. Choose a model your plan includes.' (request-processor.ts:5340-5345).
- Message text for unavailable routes: AUTO_ROUTE_UNAVAILABLE_MESSAGE or EXPLICIT_ROUTE_UNAVAILABLE_MESSAGE, or 'Your selected API provider is unavailable for this model...' (request-processor.ts:4963-4975).
- Auto route explanations such as 'the model you picked cannot handle this request' (packages/contracts/types/src/auto-route-explanation.ts:10).

**Settings**

- Model picker selection; Auto profile on Mobile; Cloud Code turn mode.
- Operator switches AGI_ROUTING_TASK_FAMILY_STAGE, AGI_ROUTING_OBSERVED_HEALTH, AGI_ROUTING_CANARY, AGI_ROUTING_SHADOW: on unless set to 0, false or off (packages/ai/routing/src/routing-stages.ts:11-18; packages/ai/routing/README.md:66-80).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Auto aliases (auto, auto-economy, auto-balanced, auto-premium) map to profiles; continuity policy has preserveExplicitSelection true (packages/ai/model-registry/catalog/routing-policies.json:566).
- Named selection: unknown id returns unknown_selection; ineligible returns explicit_model_ineligible or model_not_available_in_region; a pinned route that is unhealthy or lacks a credential returns explicit_route_ineligible (packages/ai/routing/src/auto.ts:1752-1850).
- Pinned model is not replaced by the router; only a client-set flag can turn a capability mismatch into Auto (packages/ai/routing/src/auto.ts:1819-1840).
- Server chat path never sets that flag, so a named model is not swapped for Auto there (apps/web/lib/server/managed-cloud-routing/routing-request.ts:94-130, no fallbackToAuto field; admission.ts:253 sets it false when exactSelection).
- Auto order honours plan slots, budget (isAffordable) and prompt fit (packages/ai/routing/src/auto.ts:1677-1686).
- Plan gate for named models returns 403 model_not_available with requiredTier (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5330-5350).
- Schema rejects an empty model string (request-processor.ts:591).
- Cloud Code agent route rejects missing model, a model not in the catalog, and a model not on the plan (apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:136, :148, :164).
- Local classifier covers task types coding, reasoning, agentic, multimodal, long_context, computer-use, image_generation and more (packages/ai/routing/src/classify.ts:137-247); 12 task families (packages/ai/routing/src/task-family.ts:68-81).

**Incomplete**

- Cloud Code clients replace the chosen model before sending: resolveCloudCodeAgentModel keeps the selection only if it supports tools, else picks a coding model from a family chain or the plan default, with no message (packages/contracts/types/src/cloud-code-agent-model.ts:13-40). Used by web (apps/web/features/code/CloudCodePage.tsx:464), Mobile (apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:243; CloudCodeSessionsScreen.tsx:373) and VS Code (continueInCloud.ts:120). The server then receives the replacement as if chosen.
- Mobile and Chrome resolve routes client-side with fallbackToAutoForCapabilityMismatch true (apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:94; apps/extension/src/features/cloud-bridge/managedChatRouting.ts:55). Mobile's resolver is called only by image-request and unreadable-image helpers per grep, so its effect on the model actually sent is unknown.
- Explicit selection fallback plan holds one route per provider with no 4-route cap (packages/ai/routing/src/auto.ts:1506-1513) while Auto plans cap at 4 (auto.ts:757, :1620).
- Order of plan check versus routing refusal for a higher-plan pinned model: the route decision at request-processor.ts:4912 runs before the plan gate at :5330, and the 403 test shows the plan error is reachable; which case yields 422 versus 403: unknown.

**Present but disconnected or switched off**

- Task-family stage is gated by an environment switch (on by default) (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4621; packages/ai/routing/README.md:66-69).

**Not available**

- CLI routing: unknown, not read.
- Desktop-specific routing: the public Desktop shows the hosted web app, so no separate routing; Tauri routing code is retained internal (doc: AGENTS.md section 5).

## 4. Required behaviour

**Established requirements**

- A model router resolves Auto and explicit selections to a model and route. (source: S91.19 Should)
- A task classifier labels each request for routing. (source: S91.20 Should)
- An explicitly selected model is enforced end to end (never silently replaced). (source: S91.23 Should)
- Stronger models are not the default because they are stronger; routing weighs intent, capability, quality, latency, privacy, reliability, context and total cost. (source: doc: AGENTS.md section 7)
- Nothing silently routes a Local chat to BYOK or managed cloud. (source: doc: docs/product/requirements.md:104-116)

**Acceptance criteria**

1. Auto message from a plan-allowed account is served by a model that plan allows and the response carries the resolved model header.
2. A pinned model is either the serving model or the request is refused with a code; the served model never differs.
3. A pinned model above the plan returns 403 with code model_not_available and the required plan name.
4. An empty model value is rejected; an unknown name returns an error, not a different model.
5. Cloud Code: the model shown in the composer equals the model in the request body of the agent turn, or the person is told about the change.
6. Auto never picks a model whose estimated cost exceeds the remaining budget when a budget is set.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A tool-less model chosen in Cloud Code should be refused with a message, in line with S91.23, not swapped.

**Proposed improvements** (suggestions, not requirements)

- [proposed] In Cloud Code, show a notice when the chosen model cannot run the agent and ask the person to confirm the replacement.
- [proposed] Drop fallbackToAutoForCapabilityMismatch from Mobile and Chrome client resolution, or surface it as a notice.
- [proposed] Cap explicit-selection fallback plans at the same limit as Auto.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveAutoRoute | `packages/ai/routing/src/auto.ts` | Router for Auto and named models (:1722); fallbacks (:1574); previewAutoRoute (:2204). |
| service | classifyTaskLocally | `packages/ai/routing/src/classify.ts` | Regex task classifier (:137) and applyConversationContext (:247). |
| service | classifyTaskFamily | `packages/ai/routing/src/task-family.ts` | Twelve task families from request signals (:173). |
| config | routing-policies.json | `packages/ai/model-registry/catalog/routing-policies.json` | Auto aliases, slots, tier slots, continuity policy, tasks. |
| service | managed routing request builder | `apps/web/lib/server/managed-cloud-routing/routing-request.ts` | Builds the routing request from plan, budget, health, region and policy (:94). |
| service | admission | `apps/web/lib/server/managed-cloud-routing/admission.ts` | Utility and chat admission; exactSelection turns off Auto fallback (:55, :253). |
| service | request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Schema (:591), route decision handling (:4912-4978), plan gate (:5330-5350). |
| endpoint | chat completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Endpoint that runs the request processor (:359). |
| service | model tier gate | `apps/web/lib/model-tiers.ts` | canAccessModel for named models and Auto. |
| endpoint | Cloud Code agent turn | `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` | Validates goal, model, plan and runs the cloud turn (:136-164). |
| service | resolveCloudCodeAgentModel | `packages/contracts/types/src/cloud-code-agent-model.ts` | Client-side model choice for Cloud Code; replaces tool-less selections (:17). |
| component | Web Cloud Code page | `apps/web/features/code/CloudCodePage.tsx` | Computes agentModel from store and plan (:464). |
| screen | Mobile Cloud Code session | `apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx` | Computes agentModel (:243). |
| command | VS Code continue in cloud | `apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts` | Resolves cloud model for the cloud task (:120). |
| service | Mobile cloud dispatch routing | `apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts` | Client-side route resolution; capability fallback on (:94). |
| service | Chrome managed routing | `apps/extension/src/features/cloud-bridge/managedChatRouting.ts` | Client-side route resolution; capability fallback on (:55). |
| service | routing stage switches | `packages/ai/routing/src/routing-stages.ts` | Environment switches on unless 0/false/off. |
| test | routing tests | `packages/ai/routing/src/__tests__/` | auto, classify, task-family, pinned-model, capability tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks Auto or a model and sends; the client puts the selection in the request's model field. | device | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:591 |
| Server validates the schema, classifies the task and task family, estimates input tokens and reads the account budget. | our servers | request-processor.ts:4565-4640 |
| Server builds a managed-cloud routing request and calls resolveAutoRoute. | our servers | apps/web/lib/server/managed-cloud-routing/routing-request.ts:94-130; packages/ai/routing/src/auto.ts:1722 |
| On 'unavailable', server checks workspace model policy and answers 403 or 422; otherwise it carries the decision on. | our servers | request-processor.ts:4912-4978 |
| For a named model, server checks the plan and answers 403 model_not_available with requiredTier if not allowed. | our servers | request-processor.ts:5330-5350 |
| Cloud Code: the client resolves the agent model and posts it; the server validates it against the catalog and plan and runs the turn. | device and our servers | packages/contracts/types/src/cloud-code-agent-model.ts:17; apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:136-164 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selected model per chat and route affinity (previous served model, used for continuity) | Server conversation data; table and column not opened | Read from route affinity on the next turn (request-processor.ts:2881). | unknown |
| Picker selection | Client model store (web useModelStore, mobile useModelStore) | unknown | unknown |

**Models and providers.** The router chooses among catalog models; it makes no provider call. The classifier is local regex code, not a model call (packages/ai/routing/src/classify.ts:137).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for cloud; the chat endpoint runs an auth gate (apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts). |
| Permissions | Workspace model policy can refuse an explicit model (request-processor.ts:4915-4930). |
| Subscription | Plan tier decides allowed slots, Auto and named models (apps/web/lib/model-tiers.ts:9; packages/contracts/types/src/model-catalog.ts:2216). |
| Limits and metering | Remaining credit budget is passed to routing as an affordability limit when the account has credits allocated (request-processor.ts:4581-4595); metering is another feature. |
| Feature flags | AGI_ROUTING_TASK_FAMILY_STAGE, AGI_ROUTING_OBSERVED_HEALTH, AGI_ROUTING_CANARY, AGI_ROUTING_SHADOW (packages/ai/routing/README.md:66-80). |
| Model compatibility | Router rejects models lacking an intrinsic capability needed by the task (packages/ai/routing/src/auto.ts:1815-1821); images to a model without vision give 400 model_no_vision (request-processor.ts:5108). |
| Provider restrictions | Trust mode must be permitted by workspace policy (packages/ai/routing/src/auto.ts:1691); region and jurisdiction checks give model_not_available_in_region (request-processor.ts:4946). |
| Local mode | The router supports trust modes local and on_device (packages/ai/routing/src/auto.ts:36), and Mobile's local picker offers Auto on every plan (ModelPickerSheet.tsx:316-325). The server request path in this page is managed cloud only (MANAGED_CLOUD_TRUST_MODE in routing-request.ts:105). How local Auto picks an on-device model: unknown, not read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty model | Schema validation fails for min length 1. | request-processor.ts:591 |
| Unknown model name | unknown_selection, answered 422 model_route_unavailable (not a validation error). Cloud Code route gives a validation error instead. | packages/ai/routing/src/auto.ts:1757-1768; request-processor.ts:4975; agent/route.ts:148 |
| Plan lacks model | 403 model_not_available with requiredTier. | request-processor.ts:5330-5350 |
| Low classifier confidence on a premium Auto profile | Auto selection is demoted below premium. | request-processor.ts:4565-4585 |
| Trust mode not permitted | trust_mode_not_permitted refusal before ranking, even for a named model. | packages/ai/routing/src/auto.ts:1691-1705 |
| Pinned provider route unhealthy | explicit_route_ineligible. | packages/ai/routing/src/auto.ts:1780-1800 |
| Offline | not handled in this feature; requests fail in transport. [inferred] | none found in routing code |
| Model lacks tools in Cloud Code | Client swaps to another model without notice. | packages/contracts/types/src/cloud-code-agent-model.ts:13-40 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/auto.test.ts`: Auto router [inferred from file name]
- `packages/ai/routing/src/__tests__/pinned-model-fallback-plan.test.ts`: fallback plan for a pinned model [inferred from file name]
- `packages/ai/routing/src/__tests__/capability-routing.test.ts`: capability mismatch routing; references fallbackToAuto flag per grep
- `packages/ai/routing/src/__tests__/classify.test.ts`: task classifier [inferred from file name]
- `packages/ai/routing/src/__tests__/task-family.test.ts`: task family classification [inferred from file name]
- `packages/ai/routing/src/__tests__/retired-model-selection.test.ts`: pinned retired models never swapped (read)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-plan-message.test.ts`: 403 model_not_available names the plan label and requiredTier (read)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-policy.test.ts`: workspace model policy refusal [inferred from file name]
- `apps/web/app/api/code/sessions/[sessionId]/agent/route.test.ts`: refuses missing goal or non-catalog model; refuses a model above the plan with code model_not_available (read, :159-178)
- `apps/extension-vscode/src/__tests__/continueInCloud.test.ts`: VS Code cloud model resolution [inferred from imports]
- `apps/mobile/__tests__/cloud-dispatch-routing.test.ts`: Mobile client routing [inferred from file name]

**Test scenarios**

- **Pinned model refused not swapped**
  1. Pin a model the plan allows but whose route is unhealthy (test double).
  2. Send a message.
  - Expected: Error with a route-unavailable code; no other model answers.
- **Above-plan model**
  1. As a lower plan account, call the chat endpoint with a higher-plan model id.
  - Expected: 403 with code model_not_available and the plan label; or a routing refusal code if routing refuses first (record which).
- **Auto respects budget**
  1. Give an account a tiny remaining credit.
  2. Send a long Auto request.
  - Expected: A cheaper eligible model is chosen or a clear unavailable result; never a model above budget.
- **Cloud Code tool-less selection**
  1. Select a model whose capabilities lack tools on web Cloud Code.
  2. Start an agent turn and watch the request body.
  - Expected: Today the body names a different model without notice (gap); required: refusal or visible notice.
- **Empty and unknown model**
  1. POST the chat endpoint with model '' then with a made-up name.
  - Expected: 400-class schema error for empty; 422 model_route_unavailable for unknown.

**Where to look when it fails**

- Log 'Managed Web model route unavailable' with routeCode and reasons (request-processor.ts:4954-4964).
- Log 'Auto model resolved to actual model' (request-processor.ts:5085-5095).
- Response header X-AGI-Resolved-Model (stream-transform.ts:961).
- Log '[model-policy] explicitly requested model refused by workspace policy' (request-processor.ts:4920).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Cloud Code clients swap a chosen model that lacks tools, with no notice, though the brief marks exact selection done.** Affects: Web, Mobile, VS Code Cloud Code users.. Evidence: packages/contracts/types/src/cloud-code-agent-model.ts:17-24; apps/web/features/code/CloudCodePage.tsx:464. Work needed: Refuse or show a notice; keep one decision in the shared resolver.
- **Client-side resolvers on Mobile and Chrome enable Auto fallback on capability mismatch.** Affects: Mobile, Chrome extension.. Evidence: apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:94; apps/extension/src/features/cloud-bridge/managedChatRouting.ts:55. Work needed: Confirm whether the resolved model is sent; if so set the flag false for explicit choices.
- **Unknown model name is answered as a route-unavailable 422, not a validation error as the draft said.** Affects: API users, all apps.. Evidence: request-processor.ts:4975. Work needed: Decide whether to add a 400 validation message for unknown names.
- **Explicit-selection fallback plan has no route cap.** Affects: All apps on managed cloud.. Evidence: packages/ai/routing/src/auto.ts:1506-1513. Work needed: Apply the same cap as Auto or document why not.

**Depends on**

- F091-01
- F091-05
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- mode:cloud
- mode:local
- surface:web
- surface:mobile
- surface:vscode
- surface:chrome

## Unknown

- Whether Mobile's client resolution reaches the model actually sent.
- Which response (422 or 403) an above-plan pinned model gets in each plan combination.
- How local Auto picks an on-device model.
- CLI model selection path.
- Where the per-chat selected model and route affinity are stored (table not opened).
- Whether Desktop-only (Tauri) routing is shipped to users; AGENTS.md says Tauri is internal.
