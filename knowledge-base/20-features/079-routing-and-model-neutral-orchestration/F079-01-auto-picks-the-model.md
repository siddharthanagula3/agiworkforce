---
id: "F079-01"
type: "feature"
title: "Auto picks the model"
aliases: ["Auto", "Auto routing", "automatic model selection", "auto alias", "auto-balanced", "single Auto", "managed Auto", "resolveAutoRoute", "evaluateEligibility", "quota-aware selection", "provider-route selection", "task-specific profile"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S79.01", "S79.04", "S79.14", "S79.15", "S79.19"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-inference-providers", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "F079-03", "F079-06", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "file:packages/ai/routing/src/auto.ts", "file:packages/ai/model-registry/catalog/routing-policies.json", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-01 Auto picks the model

Auto is the default way to chat. For each message it picks one model and one provider route that the person's plan, workspace rules, region, credentials and remaining credits allow. If nothing qualifies it says so with reasons instead of guessing. Free plans get a fixed plan model, not Auto.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.01](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7901), [S79.04](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7904), [S79.14](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7914), [S79.15](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7915), [S79.19](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7919).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not stated on this page | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Auto looks at each message, lists the models the account may use, removes the ones that are retired, too costly for the remaining credits, blocked by workspace policy or region, or lacking a usable credential, ranks what is left and sends the message to one model on one provider route. [inferred from auto.ts:1340-1440, auto.ts:1722-1960]

**Why it exists.** People should not need to know which model suits a task or which provider is healthy. Auto keeps cost and plan limits under control while still using a stronger model for hard work (brief S79.01, S79.04, S79.14, S79.15, S79.19).

**Who uses it.** Every signed-in person on a paid plan in Web, the Electron Desktop (which shows the hosted web app), Mobile, Chrome, VS Code and the CLI in Cloud mode; developers calling the public API with the Auto alias.

**Problems it solves**

- Choosing a model by hand for every task.
- Paying for a strong model on a trivial question.
- Failing a turn because one provider route is unhealthy.
- Sending a request to a model the plan, workspace policy or region does not allow.

**Use cases**

- A short greeting is answered on a cheap model; a coding question is moved to a stronger one.
- A long chat stays on the same model while it remains eligible, which keeps the prompt cache warm.
- A person near the end of their monthly credits keeps getting answers because costlier models are dropped.
- A workspace that blocks one vendor never has Auto pick that vendor.

## 2. User experience

**Where to find it**

- Web and Desktop: model picker in the composer footer, row labelled 'Auto', shown only for paid plans (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1635-1654).
- Mobile: model picker sheet, Auto row (apps/mobile/src/features/model-picker/components/ModelRow.tsx); the routing runs on the device (apps/mobile/stores/chat/chatExecutionStore.ts:2418).
- Chrome extension: side-panel model dropdown, option from getDefaultAutoRoutingProfile (apps/extension/src/features/cloud-bridge/managedModelPicker.ts:64-69).
- VS Code: model quick pick, first row 'Auto' with detail 'Recommended' (apps/extension-vscode/src/features/model-picker/modelConstants.ts:209-228).
- CLI: flag --auto at launch, or /route auto inside a saved Cloud session (apps/cli/src/lib.rs:477, apps/cli/src/claude_parity.rs:191).

**Before you start**

- A signed-in account with Cloud access; the registry's Auto alias needs at least the basic tier (packages/ai/model-registry/catalog/routing-policies.json:537-545).
- Free plan: Auto rows are hidden on the web picker and a request naming Auto is replaced by the plan's default chat model (ComposerFooter.tsx:1635, request-processor.ts:3346-3352).
- VS Code: the plan must include developer surfaces or the Auto row shows a plan lock (modelConstants.ts:67-79, 213).
- CLI: --auto needs a session; with no valid sign-in the tier falls back to 'free' and a sign-in warning is printed (apps/cli/src/lib.rs:8004-8030).

**Screens and controls**

- Web: 'Auto' row plus separate rows for Instant, Best, Economy (see F079-02).
- VS Code: 'Auto' row; locked rows grouped under a plan lock (modelConstants.ts:213-240).
- CLI: --auto is mutually exclusive with --model and --provider (lib.rs:477, test lib.rs:10798-10805); /route prints 'Routing: <alias> is choosing the model for each message; now <model>' (agent/mod.rs:2276-2284).

**Journey**

1. Open the model picker and choose Auto (or start the CLI with --auto).
2. Type a message and send it.
3. The router classifies the message, filters and ranks models and routes.
4. The answer streams from the chosen model; the answer shows which model produced it.
5. On the next message the same model is kept while it stays eligible and the task has not changed (auto.ts:1885-1925).

**What the person sees and gets**

- Web response carries x_agi_workforce.routing with task_type, resolved_model and slot (apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:409-418).
- When Auto moves to a different model than the previous turn, a moved-from model and reason are reported (request-processor.ts:2881-2893, 6927-6928) with human phrases from explainAutoRouteReason (packages/contracts/types/src/auto-route-explanation.ts:1-12).
- CLI prints 'Auto: AGI picks the model for each message; starting with <name>.' and 'Auto chose <name> for this message' (lib.rs:8075-8080, agent/chat.rs:921-940).
- No route: HTTP 422 code model_route_unavailable with the text 'Auto could not find a model for this request on your plan. Choose a model from the picker.' (request-processor.ts:2803, 4960-4978).

**Settings**

- Workspace policy: allowed models and providers, zero data retention, region (see F079-06).
- Per-user: US-only provider routing (apps/web/features/settings/components/UsOnlyRoutingPanel.tsx).
- Operator kill switches for routing stages, on by default: AGI_ROUTING_TASK_FAMILY_STAGE, AGI_ROUTING_OBSERVED_HEALTH, AGI_ROUTING_CANARY, AGI_ROUTING_SHADOW (packages/ai/routing/src/routing-stages.ts:1-18, auto.ts:766-781).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Eligibility filter before ranking: unknown or not-live or deprecated or past-deprecation model, tier admission, US-only policy, excluded providers, no-training, developer jurisdiction, no route for the trust mode, missing capability, too-small context (packages/ai/routing/src/auto.ts:1340-1435).
- Route-level admission: workspace model policy, blocked commercial status, harness, zero data retention, no-training, regions (auto.ts:1060-1125).
- Route ranking per model: healthy first, then has credential, observed-health penalty, expected cost, default route, route id; a warm-cache route wins unless it costs more than a ceiling multiple (auto.ts:1144-1196).
- Plan clamp: tier maximum profile free/basic economy, pro balanced, max/enterprise/byok premium; Auto's profile per task (simple, general, creative economy; coding, reasoning, agentic, computer-use premium; long-context balanced) (routing-policies.json:416-440, auto.ts:1198-1216).
- Affordability: a candidate whose estimated cost exceeds the remaining credits is skipped, except the fallback slot (auto.ts:1682-1685, 2034, 2090).
- Web server reads the credit balance only when credits are allocated and no free trial is active, and routes without the check if the read fails (request-processor.ts:4600-4616).
- Continuity: the current model is kept when eligible, affordable, and the task is unchanged or the cache route is preferred (auto.ts:1885-1925, routing-policies.json continuity block).
- No route gives an 'unavailable' decision with code and reasons (auto.ts:473-489, 1838-1850).
- Managed failover for Auto may cross models; a named model only rotates across routes of the same model (apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:1-40).
- Chrome and Mobile run the shared TypeScript router on the device before sending (apps/extension/src/features/cloud-bridge/managedChatRouting.ts:38-57, apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:46-101); Chrome then sends the Auto alias so the server routes again (managedChatHandler.ts:772).
- CLI Cloud sessions send the Auto alias to the gateway, which routes (agent/chat.rs:896-935); CLI own-key sessions re-resolve every turn with the Rust resolver (agent/chat.rs:660-740).

**Incomplete**

- Mobile sends the already-chosen concrete model to the server (apps/mobile/stores/chat/chatExecutionStore.ts:3360-3379), and the on-device call passes no credit budget, no no-training flag, no zero-retention flag, no workspace policy and no region (cloudDispatchRouting.ts:82-96). [inferred] the server then treats it as a named model, so credit-aware dropping is not applied to Mobile Auto.
- The Rust resolver used by the CLI for launch and own-key sessions has no budget, no no-training, no zero-retention and no workspace-policy fields (crates/agiworkforce-model-registry/src/lib.rs:122-139).
- VS Code Auto picker rows lock by plan through isAutoReachableForTier (modelConstants.ts:67-79); the actual routing for VS Code runs in the developer session host, whose source was only partly read (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5370-5413).

**Present but disconnected or switched off**

- Named profiles Instant, High, Code and Research have weights (packages/ai/routing/src/profiles/index.ts:51-100) but weightedScore is only exported and tested; auto.ts uses profileForTaskFamily only to put a label in the decision (auto.ts:1466; usages grep: index.ts:319-324, routing-profiles.test.ts). The weights do not order candidates today.
- allowedTrustModes exists on the router (auto.ts:342) but no non-test caller sets it (grep of apps and packages).
- Auto's task-family cost stage, observed-health ranking, canary and shadow stages run unless an operator sets the matching environment variable to 0, false or off; the deployed values are not in the repository (routing-stages.ts:1-18).

**Not available**

- Free plan: no Auto picker row on Web; Auto is replaced by the free default model (ComposerFooter.tsx:1635, request-processor.ts:3346-3352).
- Chrome 'Auto' needs Managed Cloud access (managedChatHandler.ts:650-660).
- Local on-device models are never chosen by Auto; Auto only routes Cloud (managed_cloud trust mode in cloudDispatchRouting.ts:90, routing-request.ts:107).

## 4. Required behaviour

**Established requirements**

- Auto picks a model per request from the registry for the task, plan and constraints, on every app and the API. (source: brief S79.01)
- Auto applies a task-specific routing profile, for example premium for coding and reasoning. (source: brief S79.04)
- Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking. (source: brief S79.14)
- Among eligible routes for a model one provider route is chosen by ranking on health, cost and cache. (source: brief S79.15)
- Routing takes the user's remaining budget into account when choosing a route. (source: brief S79.19)
- The founder wants Auto as the default and, on Mobile, the only routing choice. (source: doc: docs/decisions/2026-11-12-founder-decisions.md (D-2026-11-12-07))
- Picker eligibility agrees with the server's effective plan, deployment, model and route policy; route failures identify the model actually executed. (source: doc: docs/product/experience-contract.md:776 (W03))

**Acceptance criteria**

1. On Web with a paid plan and Auto selected, a one-line greeting and a long coding request can resolve to different models, and the answer shows the model used.
2. With a workspace policy that blocks a vendor, Auto never answers from that vendor.
3. With a nearly empty credit balance, Auto does not pick a model whose estimated cost exceeds the balance (except the fallback slot).
4. If no model qualifies, the person sees the 'Auto could not find a model' message and the API returns 422 model_route_unavailable.
5. On Free, selecting nothing special sends the plan's default model and the picker shows no Auto row.
6. In a CLI Cloud session started with --auto, the model name is printed at start and again when it changes.
7. --auto together with --model or --provider is rejected at parse time.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile Auto should apply the same credit, training and policy rules as Web, because the product premise is one subscription system for every app.
- Auto should never choose a Local on-device model, because Local, own-key and Cloud are separate boundaries (docs AGENTS.md §6).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Send the Auto alias from Mobile (as Chrome does) so the server applies budget, training and policy rules, and keep the on-device call only for the picker preview.
- [proposed] Add budget and training fields to the Rust resolver or document that own-key sessions have no credit budget.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveAutoRoute | `packages/ai/routing/src/auto.ts` | Shared TypeScript router: alias handling, explicit-model branch, slot ordering, continuity, affordability, fallbacks (line 1722). |
| service | evaluateEligibility / admissibleModelRoutes | `packages/ai/routing/src/auto.ts` | Per-model and per-route eligibility and the reasons list (lines 1060-1125, 1340). |
| service | rankRoutes / slotRouteCost | `packages/ai/routing/src/auto.ts` | Chooses one route of a model by health, credential, cost and cache (lines 1144, 1304). |
| config | routing-policies.json auto policy | `packages/ai/model-registry/catalog/routing-policies.json` | Aliases, tier ceilings, allowed slots per tier, auto profile per task, continuity flags. |
| service | request-processor (managed chat route) | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Web, Desktop and API server path: classification, balance read, policy reads, routing, 422 on no route (lines 4512-5030). |
| service | buildManagedCloudRoutingRequest | `apps/web/lib/server/managed-cloud-routing/routing-request.ts` | Builds the AutoRoutingRequest from account policy and usage (lines 94-203). |
| service | managed-failover | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts` | Rotates to the next candidate on availability failures; models only change for Auto. |
| service | resolveMobileCloudDispatch | `apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts` | On-device Auto resolution for Mobile Cloud chat. |
| store | chatExecutionStore send path | `apps/mobile/stores/chat/chatExecutionStore.ts` | Calls the on-device router and sends the chosen model (lines 2418-2452, 3360). |
| service | resolveChromeManagedChatRoute | `apps/extension/src/features/cloud-bridge/managedChatRouting.ts` | Chrome on-device pre-check using runtime profile chrome/managed-chat. |
| service | managedChatHandler | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Chrome admission checks, route call, then sends the Auto alias (lines 650-772). |
| component | buildGroupedQuickPickItems | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | VS Code Auto rows and plan locks. |
| service | ChatStateManager turn start | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Sends model 'auto' with an optional routingProfile to the developer session (lines 5370-5413). |
| command | --auto flag and launch resolution | `apps/cli/src/lib.rs` | CLI parse rule and managed Auto start (lines 477, 8004-8080). |
| service | AgentSession Auto handling | `apps/cli/src/agent/chat.rs` | server_routes_auto, request_model, adopt_served_model, per-turn re-resolution (lines 660-940). |
| service | resolve_auto_model_with_speed | `apps/cli/src/model_catalog.rs` | CLI wrapper over the Rust registry resolver (line 698). |
| service | Rust resolve_auto_route | `crates/agiworkforce-model-registry/src/lib.rs` | Rust copy of the router; request type at lines 122-160. |
| component | ComposerFooter Auto rows | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web picker rows for Auto (lines 1635-1680). |
| store | useModelStore | `apps/web/shared/stores/model-store.ts` | Persists selected model, provider, route and routing profile in localStorage key agi-model-store (lines 325-410). |
| other | explainAutoRouteReason | `packages/contracts/types/src/auto-route-explanation.ts` | Plain-word phrases for each route reason code. |
| service | free lane stage | `apps/web/lib/services/free-lane/stage.ts` | Free-plan stage over the router output (activateFreeLane at line 111). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks Auto and sends a message on Web or Desktop; the client sends model 'auto' (an alias) to the chat completions API. | device | apps/web/lib/hooks/useChatStream.ts:4646-4649 |
| Server classifies the text, attachments and history, applies tool toggles, reads the credit balance, workspace policy, zero-retention rule, training opt-out, region and route health, then builds the routing request. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4512-4790 |
| resolveAutoRoute filters, ranks and returns a selected route or an unavailable decision. | our servers | packages/ai/routing/src/auto.ts:1722-1960 |
| Selected model is written to the request; the call goes to the provider route through the managed adapters, with failover to other candidates before the first byte. | outside service | request-processor.ts:5030, apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:1-40 |
| Mobile and Chrome run the same TypeScript router on the device first; Mobile sends the chosen model, Chrome sends the Auto alias. | device and our servers | apps/mobile/stores/chat/chatExecutionStore.ts:2418,3360; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:697,772 |
| CLI Cloud session sends 'auto' with an optional routing_profile to the gateway; CLI own-key session picks a model locally with the Rust resolver every turn. | device and our servers | apps/cli/src/agent/chat.rs:896-935, 660-740 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chosen model, task type, slot, reason on each assistant turn | Response body x_agi_workforce.routing and the stored assistant message (apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:110-128) | Yes, with the conversation through the web chat store | Kept with the conversation; deleted when the conversation is deleted [inferred] |
| Route affinity for a conversation (served model and route) | Read by getServedRouteAffinity (request-processor.ts:4586) | Server side | unknown |
| Selected model and routing profile in the browser | store:agi-model-store (localStorage) (apps/web/shared/stores/model-store.ts:376-385) | No | Until the browser data is cleared |
| Route health snapshots | Route health store (packages/ai/routing/src/route-health-store.ts) | Server side | unknown |

**Models and providers.** The router reads the generated model registry (models, routes, harnesses, policies). Routes are provider routes through managed adapters; which provider serves a request depends on credentials available to the deployment (availableProviderIds, request-processor.ts:4706). No model name is written in this page on purpose.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for Cloud Auto on every app. CLI falls back to the free policy with a warning when sign-in is missing (apps/cli/src/lib.rs:8004-8030). |
| Permissions | Workspace model policy can refuse a model or a provider and the router honours it (auto.ts:1070-1081). Workspace allowed trust modes exist in the router but no production caller sets them. |
| Subscription | Tier decides allowed slots and the highest band: free economy, basic economy, pro balanced, max/enterprise/byok premium (routing-policies.json:433-440). Auto alias minimum tier is basic (routing-policies.json:544). VS Code needs the developer_surfaces plan capability (modelConstants.ts:70). |
| Limits and metering | Remaining credits drop costlier candidates when credits are allocated (request-processor.ts:4600-4616, auto.ts:1682). Credits are reserved per request (request-processor.ts:6160-6180 managed usage reservation). Rate limits: none found specific to Auto. |
| Feature flags | AGI_ROUTING_TASK_FAMILY_STAGE, AGI_ROUTING_OBSERVED_HEALTH, AGI_ROUTING_CANARY, AGI_ROUTING_SHADOW (default on), AGI_ROUTING_GATEWAY_ROUTES (apps/web/lib/services/gateway-routing.ts:13). |
| Model compatibility | Capability, context window and harness features are checked per task (auto.ts:1415-1435). Image attachments need a multimodal-capable model through the task requirements. |
| Provider restrictions | Excluded providers for US-only (max and enterprise tiers), no-training, zero retention, workspace policy and region residency all remove routes (auto.ts:1060-1125, 1355-1385). |
| Local mode | Auto never picks a Local on-device model; it resolves with trust mode managed_cloud (routing-request.ts:107). On Mobile a Local Mode chat refuses Cloud models (chatExecutionStore.ts:2262-2270). Desktop (Electron) answers every chat in the cloud (apps/desktop/electron/runtime/dispatcher.ts:3235-3243). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No eligible route | Unavailable decision; Web returns 422 model_route_unavailable with the Auto message; Mobile shows 'No AGI Cloud model is available right now' for no_eligible_route. | request-processor.ts:4960-4978; cloudDispatchRouting.ts:40-47 |
| Credit balance unreadable | Logs a warning and routes without the affordability check. | request-processor.ts:4607-4616 |
| Every candidate too costly | The fallback slot is exempt from the cost check, so a request still has a target; the later credit gate may then refuse or swap. | auto.ts:2034, 2090; request-processor.ts:6035-6120 |
| Media or image-generation route | A route whose harness ends in /media returns 422 model_route_requires_media_dispatch on the chat endpoint. | request-processor.ts:5010-5025 |
| Route unhealthy | Unhealthy routes rank last and failover rotates to the next candidate before the first byte. | auto.ts:1144-1160; managed-failover.ts:1-40 |
| Offline / cancel / retry | not handled in the router itself; client streaming layers own cancel and retry. | not handled in the code I read for this feature |
| Free plan | Auto request replaced by the plan default model; free lane may observe or dispatch depending on configured mode. | request-processor.ts:3346-3352, 4799-4820 |
| Accessibility | unknown; not checked for the Auto row. | not examined |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/auto.test.ts`: Economy, balanced and premium profile resolution, tier clamp, affordability falling to cheaper slots.
- `packages/ai/routing/src/__tests__/cost-aware-auto.test.ts`: Cheapest floor-passing slot, no coding below balanced on pro, skipping routes without credentials, kill switch restores authored order.
- `packages/ai/routing/src/__tests__/auto-route-conformance.test.ts`: Replays every alias, task, tier and trust mode against a recorded fixture shared with the Rust resolver.
- `packages/ai/routing/src/__tests__/slot-preference.test.ts`: preferSlots reorders but never widens admission.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.free-plan-routing.test.ts`: A free-plan request naming Auto is served the free default and never dispatched outside the free plan.
- `apps/web/lib/server/managed-cloud-routing/__tests__/admission.test.ts`: Admission refuses when policy, region or retention cannot be read; never resolves to a forbidden model.
- `apps/mobile/__tests__/cloud-dispatch-routing.test.ts`: Mobile Cloud dispatch: entitled models, eligible explicit model preserved, media and research harness routing.
- `apps/extension/__tests__/managed-chat-routing.test.ts`: Chrome Auto resolves through chrome/managed-chat, keeps a still-eligible route, fails closed on unknown selection.
- `apps/extension-vscode/src/__tests__/routingTask.test.ts`: VS Code classifies each turn instead of pinning Auto to coding.
- `apps/cli/src/model_catalog.rs`: In-file tests: CLI Auto uses the registry policy; managed routes resolve to catalog models; fallback chains never repeat a model.
- `apps/cli/src/lib.rs`: In-file test: --auto is rejected with --provider or --model (line 10798).

**Test scenarios**

- **Easy versus hard message**
  1. Sign in on Web with a paid plan and choose Auto.
  2. Send 'hi'.
  3. Send a message containing a fenced code block and a stack trace.
  - Expected: The second answer comes from a model in a higher band than the first, and each answer shows its model.
- **No route**
  1. In a workspace policy block every model for the tier (or use a test account with all routes refused).
  2. Send a message on Auto.
  - Expected: 422 model_route_unavailable and the Auto message; nothing is sent to a provider.
- **Low credits**
  1. Use an account with a tiny remaining balance and credits allocated.
  2. Send a long coding message on Auto.
  - Expected: A cheaper candidate is chosen, or the credit gate responds; no premium model above the balance is picked unless it is the fallback slot.
- **CLI Auto**
  1. Run agi --auto with a signed-in account.
  2. Send a coding prompt, then a chat prompt.
  - Expected: Start line 'Auto: AGI picks the model for each message', and an 'Auto chose ...' notice when the model changes.
- **Free plan**
  1. Open Web on a Free account.
  2. Open the model picker.
  - Expected: No Auto row; sending uses the plan default model.

**Where to look when it fails**

- Server log line 'Auto route decision for a continuing conversation' (request-processor.ts:4990).
- Server log '[managed-cloud-routing] call refused' with reason and code (apps/web/lib/server/managed-cloud-routing/admission.ts:196).
- Warning 'Usage-aware routing: balance read failed' (request-processor.ts:4612).
- Error code model_route_unavailable (HTTP 422) and unavailable codes unknown_selection, no_eligible_route, trust_mode_not_permitted (auto.ts:473-489).
- Admin screens RoutingHealthPanel and RouteEconomicsPanel (apps/web/features/admin/components/).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- Mobile: [70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md)
- CLI: [70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md)
- VS Code: [70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md)
- Chrome: [70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **Named profiles Instant, High, Code, Research are not used to order candidates.** Affects: Web, Desktop, API and every surface that expects task-family weights to bite. Evidence: weightedScore only in packages/ai/routing/src/profiles/index.ts:169, index.ts:324 and tests; auto.ts:1466 only labels the decision.. Work needed: Either feed weightedScore into the task-family ordering or remove the unused weights and say routing is band plus cost only.
- **Mobile Auto is decided on the device without budget, training, zero-retention, policy or region inputs, then sent as a named model.** Affects: Mobile users on paid plans, workspace members. Evidence: cloudDispatchRouting.ts:82-96; chatExecutionStore.ts:3360-3379.. Work needed: Send the Auto alias and let the server route, or pass the same inputs on the device.
- **Rust resolver lacks budget, no-training, zero-retention and workspace-policy inputs.** Affects: CLI own-key Auto and launch-time resolution. Evidence: crates/agiworkforce-model-registry/src/lib.rs:122-139; packages/ai/routing/src/task-family-routing.ts header notes the two resolvers diverged and OQ-1 is undecided.. Work needed: Decide the canonical resolver (design question OQ-1) and close the field gap.
- **Free plan has no Auto and the product premise says Auto is the default.** Affects: Free users on Web, Desktop, Mobile. Evidence: routing-policies.json:544 minTier basic; request-processor.ts:3346-3352.. Work needed: Product decision: keep a fixed free default or give Free a labelled Auto over free models.
- **No test found for the Web 'Auto' picker rows being hidden on Free in combination with the server swap.** Affects: Web Free users. Evidence: ComposerFooter tests exist (ComposerFooter.free-section.test.tsx) but their content was not read.. Work needed: Read or add a test that asserts both sides.
- **Deployed values of routing kill switches are not recorded in the repository.** Affects: All surfaces served by the managed route. Evidence: routing-stages.ts:1-18.. Work needed: Record deployed settings in the runbook or the operations page.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-inference-providers
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- F079-03
- F079-06
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- file:packages/ai/routing/src/auto.ts
- file:packages/ai/model-registry/catalog/routing-policies.json
- api:POST /api/llm/v1/chat/completions

## Unknown

- Whether the Electron Desktop app adds any routing of its own beyond the hosted web app; only the web path and the Cloud-only dispatcher comment were read.
- How public plan names (Premium, Max, Ultra in the owner's notes) map to the code tier names free, basic, pro, max, enterprise.
- Deployed values of the AGI_ROUTING_* switches.
- What the user-facing notice says when Auto moves models; only the phrase table was read.
- How VS Code's developer session host performs Auto on the server side; only the sending side was read.
- Whether accessibility labels for the Auto row are correct.
