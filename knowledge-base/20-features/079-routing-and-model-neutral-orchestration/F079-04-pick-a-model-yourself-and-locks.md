---
id: "F079-04"
type: "feature"
title: "Pick a model yourself, and locks"
aliases: ["model selection", "explicit model", "exact-model lock", "pick a model", "provider lock", "route lock", "provider pin", "selected_route_id", "requiredRouteId", "--model", "--provider", "explicit_model_ineligible"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S79.02", "S79.16", "S79.17", "S79.18"]
depends_on: ["F079-01", "F079-03", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "table:web_conversations", "store:agi-model-store"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-04 Pick a model yourself, and locks

A person can pin one named model so the request runs on it, with the same eligibility checks as Auto. If it fails the answer is a refusal with reasons, not a swap. A provider route can be pinned in the data model, but no screen sets it, and a decision says there is no provider or route lock for customers.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.02](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7902), [S79.16](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7916), [S79.17](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7917), [S79.18](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7918).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person choose a specific model from the picker (or --model in the CLI) and keeps the request on it; the router only picks among that model's provider routes. [inferred from auto.ts:1760-1850]

**Why it exists.** Some work needs one known model. Customers choose a model, never a supplier (docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-07).

**Who uses it.** Anyone who wants a particular model; CLI users who force a provider for own-key or local use.

**Problems it solves**

- Getting a different model than the one chosen.
- Hidden provider changes for a named model.

**Use cases**

- Pick a model in the Web picker for one conversation.
- Run agi --model <id> in a script.
- Run agi --provider ollama for a local server (provider names listed in the flag help).
- Start a chat on the project's default model (F079-05).

## 2. User experience

**Where to find it**

- Web and Desktop: model picker rows and the model catalogue (ComposerFooter.tsx:1018, 1590-1620).
- Mobile: model picker sheet rows; Local chats only list on-device models (apps/mobile/src/features/model-picker/components/ModelRow.tsx).
- Chrome: model dropdown from the account's admitted models (managedModelPicker.ts:100-140).
- VS Code: model quick pick grouped by provider with plan locks (modelConstants.ts:209-300).
- CLI: -m or --model <id> (comma list gives a fallback chain), -p or --provider <name> (lib.rs:187-195, 8060-8075).

**Before you start**

- The model must be allowed for the plan, workspace policy and region; locked rows show a plan lock reason (VS Code planLock; Mobile tierUpgradeLockReason apps/mobile/src/features/model-picker/service.ts:60-66).

**Screens and controls**

- Picker rows; catalogue search (Web); provider filter chips (Mobile ModelFilterChips).

**Journey**

1. Open the picker.
2. Choose a model.
3. Send a message.
4. If the model is eligible it answers; if not the person gets a refusal that names why.

**What the person sees and gets**

- Web 422 with 'The selected model is not available for this task in Managed Web chat.' or 'This model is not available in your region. Choose Auto or another model.' (request-processor.ts:2804-2807, 4944).
- Mobile messages per code, for example 'This model is not available for this request or plan. Choose another AGI Cloud model to continue.' (cloudDispatchRouting.ts:28-47).
- Pinned route unavailable: 'Your selected API provider is unavailable for this model. Choose another provider or clear the provider pin, then try again.' (request-processor.ts:4965-4972).

**Settings**

- Web persists selected model, provider and route in agi-model-store (model-store.ts:376-385) and the conversation stores model and selected_route_id (apps/web/lib/hooks/useConversations.ts:623-634).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Named model goes through evaluateEligibility; ineligible gives explicit_model_ineligible, or model_not_available_in_region when the developer jurisdiction rule is the cause (packages/ai/routing/src/auto.ts:1838-1850).
- A named model's only fallbacks are its other routes (sameModelFallbacks, auto.ts:1801-1812; pinned-model-fallback-plan test).
- Route pin: requiredRouteId on an explicit model needs that route healthy and credentialed, otherwise explicit_route_ineligible; on an Auto alias it is refused (auto.ts:1745-1795).
- Server stores the pin per conversation: web_conversations.selected_route_id (apps/web/db/neon/0293_conversation_provider_route_pin.sql), contract field selectedRouteId (packages/contracts/cloud-contracts/src/conversations.ts:168-180), read in the chat route (request-processor.ts:3920) and passed as requiredRouteId (4787).
- Out-of-credits swap is skipped when a route is pinned (request-processor.ts:6052).
- Mobile Local chats refuse Cloud models (chatExecutionStore.ts:2262-2270); Mobile Cloud refuses a model outside the plan (cloudDispatchRouting.ts:56-70).
- CLI --auto conflicts with --model and --provider (lib.rs:477).

**Incomplete**

- Mobile and Chrome pass fallbackToAutoForCapabilityMismatch true, so a named model that lacks a needed capability is answered by Auto with reason capability_fallback (cloudDispatchRouting.ts:94; managedChatRouting.ts:55; auto.ts:1822-1840). Web main chat does not set it.
- Web out-of-credit path swaps a named model for a cheaper one unless a route is pinned, reporting fallback.original_model and reason insufficient_credits (request-processor.ts:6052-6113; response-builder.ts:424-428).
- Chrome reconciles a stored selection not in the admitted list back to 'auto' (managedModelPicker.ts:273-287).

**Present but disconnected or switched off**

- Provider pin and route pin have storage, API fields and an error message but no picker control; setSelectedModelId(id, routeId) has no UI caller (grep of apps/web features and app).
- Mobile, VS Code and Chrome have no provider or route lock (brief S79.17, S79.18); decision D-2026-09-28-07 says none on web, desktop, API or CLI managed routes.

**Not available**

- Provider lock outside the CLI (--provider).
- Route lock on any screen.

## 4. Required behaviour

**Established requirements**

- The user can pick a specific model and the request runs on it. (source: brief S79.02)
- An explicitly chosen model is never silently swapped for another model. (source: brief S79.16)
- The user can lock requests to one provider for the chosen model. (source: brief S79.17)
- The user can lock requests to one specific provider route. (source: brief S79.18)
- Customers choose a model, never a supplier, so there is no provider or route lock on web, desktop, the API or the CLI's managed routes. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-07))

**Acceptance criteria**

1. Naming an eligible model sends the request to that model, or to another route of that same model during failover, never to a different model.
2. Naming a model the plan does not include gives a refusal that names the reason.
3. On Web, running out of credits while on a named model is reported with the original model and the reason when a cheaper model answers.
4. agi --auto --model x is rejected at parse time.
5. A Local Mobile chat refuses a Cloud model with a message telling the person to start a Cloud chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because a named model can be answered by a cheaper model on out-of-credit and by Auto on a capability mismatch, 'never silently swapped' holds only if each swap is clearly shown to the person; UI wording was not verified. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Remove or wire the dormant route-pin fields so they do not suggest a feature that does not exist.
- [proposed] Make the out-of-credit swap ask first for a named model.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | explicit branch of resolveAutoRoute | `packages/ai/routing/src/auto.ts` | Named model eligibility, route pin and capability fallback (lines 1745-1850). |
| component | ComposerFooter model rows | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web picker. |
| store | useModelStore | `apps/web/shared/stores/model-store.ts` | Selected model, provider, route (lines 305-410). |
| hook | useConversations createConversation | `apps/web/lib/hooks/useConversations.ts` | Persists model and selectedRouteId with the conversation (600-640). |
| table | web_conversations.selected_route_id | `apps/web/db/neon/0293_conversation_provider_route_pin.sql` | Column that stores the route pin. |
| schema | conversation contract | `packages/contracts/cloud-contracts/src/conversations.ts` | selectedRouteId in wire and client shapes. |
| endpoint | conversations API | `apps/web/app/api/chat/conversations/[id]/route.ts` | Reads and updates selected_route_id (lines 110, 372). |
| service | request-processor route ownership | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads selectedRouteId, passes requiredRouteId, error text, credit swap guard (3920, 4787, 4965, 6052). |
| service | managed-failover | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts` | Never answers a pinned model with a different model. |
| service | mobile dispatch for explicit models | `apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts` | Plan check and capability fallback. |
| service | mobile local/cloud guard | `apps/mobile/stores/chat/chatExecutionStore.ts` | Refuses Cloud model in a Local chat (2262-2270). |
| service | chrome model reconciliation | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Stored selection fallback to auto (273-287). |
| service | chrome handler admission | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | model_not_admitted errors (708-760). |
| component | VS Code picker and locks | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Rows, plan locks, per-model access. |
| service | VS Code reachability | `apps/extension-vscode/src/features/model-picker/reachability.ts` | Marks models unreachable or refused by privacy mode. |
| command | --model, --provider flags | `apps/cli/src/lib.rs` | CLI flags (187-195) and model resolution (8060-8120). |
| service | CLI fallback chain | `apps/cli/src/routing/fallback.rs` | Parses comma-separated model lists. |
| service | credit fallback model | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | findCheaperFallbackModel use (6052-6113). |
| service | response fallback fields | `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts` | fallback.original_model and reason (424-428). |
| other | fallback reason helpers | `apps/web/lib/chat-fallback-reason.ts` | Re-exports reason codes and describeFallbackReason from @agiworkforce/types. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person selects a model; Web stores it and, on first message, creates the conversation with model and optional route. | device | model-store.ts:339-345; useConversations.ts:623-634 |
| Server reads the conversation's selected_route_id and builds the routing request with requiredRouteId. | our servers | request-processor.ts:3920, 4787 |
| Router checks the named model (eligibility) and the pinned route if any; returns selected or an unavailable code. | our servers | auto.ts:1760-1850 |
| Request goes to the provider route; on availability failure it rotates to another route of the same model only. | outside service | managed-failover.ts:1-40 |
| If credits run out and no route is pinned, a cheaper model may answer and the response says so. | our servers | request-processor.ts:6052-6113; response-builder.ts:424-428 |
| CLI --model or --provider sets the model and provider for the session; a Local session blocks a model that routes elsewhere. | device | lib.rs:8060-8120; agent/mod.rs:1791-1825 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation model and route pin | table:web_conversations columns model and selected_route_id | Yes, through the conversations API | Kept with the conversation |
| Selected model, provider, route in the browser | store:agi-model-store | No | Until browser data is cleared |

**Models and providers.** Any model in the registry that the plan, policy, region and credentials allow. Providers are chosen only among that model's declared routes. CLI --provider help lists anthropic, openai, google, ollama (lib.rs:194).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud models need sign-in. Mobile shows 'Sign in to use AGI Cloud chat.' (service.ts:57). |
| Permissions | Workspace model policy is checked after routing so a blocked model cannot be reached (request-processor.ts:5032-5050). |
| Subscription | Model rows carry a minimum plan; locked rows show an upgrade reason; Mobile lock text depends on whether purchases exist on the platform (service.ts:60-66). |
| Limits and metering | Same credit reservation as Auto; out-of-credit may swap a named model. |
| Feature flags | none found for the picker; AGI_ROUTING_GATEWAY_ROUTES affects route availability. |
| Model compatibility | Missing capability or context gives a refusal on Web; Mobile and Chrome fall back to Auto instead. |
| Provider restrictions | Excluded-provider rule for Auto does not apply to a named model, but no-training, region, transport and workspace policy do (auto.ts:182-215, 1760-1775). |
| Local mode | Local models are chosen from the same picker on Mobile; the Electron Desktop refuses on-device inference in chat (dispatcher.ts:3235-3243); CLI Local sessions block any model that routes outside Local (agent/mod.rs:1791-1825). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown model id | unknown_selection; Mobile says 'This model selection is no longer available.' | auto.ts:1760-1768; cloudDispatchRouting.ts:36-38 |
| Model retired | Eligibility refuses with 'passed its deprecation date'. | auto.ts:1355-1357 |
| Pinned route unhealthy | explicit_route_ineligible; Web asks the person to choose another provider or clear the pin. | auto.ts:1773-1795; request-processor.ts:4965-4972 |
| Credits exhausted on a named model | Cheaper model may answer unless route pinned, and the reply names original model and reason. | request-processor.ts:6052-6113 |
| Capability mismatch on Mobile or Chrome | Answered by Auto with reason capability_fallback. | auto.ts:1822-1840 |
| Stale stored model | Web rehydrates an unknown persisted model to the canonical default. | apps/web/shared/stores/model-store.test.ts:82 |
| Offline | not handled in the code I read for this feature. | not examined |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/pinned-model-fallback-plan.test.ts`: A pinned model is served as asked and fallback entries are only other routes of that model.
- `packages/ai/routing/src/__tests__/retired-model-selection.test.ts`: Retired model selection (name only; contents not read).
- `packages/ai/routing/src/__tests__/auto-router-trust-mode.test.ts`: A named model is refused when its trust mode is not permitted.
- `apps/mobile/__tests__/cloud-dispatch-routing.test.ts`: Eligible explicit model preserved for ordinary chat.
- `apps/extension/__tests__/managed-chat-routing.test.ts`: Unknown selection fails closed instead of crossing to Local or own key.
- `apps/web/shared/stores/model-store.test.ts`: Unknown persisted model rehydrates to the default.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.route-validation.test.ts`: Route validation in the chat route (name only; contents not read).

**Test scenarios**

- **Named model runs**
  1. Choose an eligible model on Web.
  2. Send a message.
  - Expected: Response resolved_model equals the chosen model.
- **Ineligible model**
  1. On a lower plan call the API with a model above the plan.
  - Expected: Refusal that names the plan; no other model answers.
- **Out-of-credit swap**
  1. Use an account near zero credits on a named expensive model with no route pin.
  2. Send a long message.
  - Expected: Either a monthly-limit refusal or a cheaper model answers and the response includes fallback.original_model and reason insufficient_credits.
- **CLI exclusivity**
  1. Run agi --auto --model x.
  - Expected: Argument error.
- **Local chat on Mobile**
  1. Open a Local Mode chat and try to send with a Cloud model.
  - Expected: Error 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.'

**Where to look when it fails**

- Error codes explicit_model_ineligible, model_not_available_in_region, explicit_route_ineligible, model_route_unavailable.
- Response field x_agi_workforce.fallback.
- Admin RoutingHealthPanel for route health (apps/web/features/admin/components/RoutingHealthPanel.tsx).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- Mobile: [70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md)
- CLI: [70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md)
- VS Code: [70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md)
- Chrome: [70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **Out-of-credit swap replaces a named model on Web when no route is pinned.** Affects: Web, Desktop, API. Evidence: request-processor.ts:6052-6113. Work needed: Decide if a named model should be refused or confirmed instead; check how the UI words the notice.
- **Mobile and Chrome replace a named model with Auto on capability mismatch.** Affects: Mobile, Chrome. Evidence: cloudDispatchRouting.ts:94; managedChatRouting.ts:55; auto.ts:1822-1840. Work needed: Align with Web, which refuses.
- **Route-pin storage and error text exist with no control to set them.** Affects: Web, API. Evidence: 0293 migration; request-processor.ts:4965-4972; no UI caller of setSelectedModelId with a route.. Work needed: Remove the dead path or build the control, subject to the decision against provider locks.
- **Provider lock is CLI only, and the CLI help lists four providers while twelve or more provider folders exist.** Affects: CLI. Evidence: lib.rs:194; packages/ai/providers directory listing.. Work needed: Confirm the help text is current.
- **Chrome silently reconciles a stored model back to Auto when it is no longer admitted.** Affects: Chrome. Evidence: managedModelPicker.ts:273-287. Work needed: Show a note when the selection is changed.

**Depends on**

- F079-01
- F079-03
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- table:web_conversations
- store:agi-model-store

## Unknown

- How the Web UI words the notice when a cheaper model replaces a named model (describeFallbackReason text not read).
- Whether the API documents the pin fields to developers.
- Whether Desktop Electron needs different handling; it loads the hosted web app.
- Whether Chrome and VS Code store a per-conversation model on the server.
- Contents of retired-model-selection and route-validation tests.
