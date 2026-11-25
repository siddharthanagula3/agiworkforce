---
id: "AREA-079"
type: "area"
title: "Routing and model-neutral orchestration"
features: ["F079-01", "F079-02", "F079-03", "F079-04", "F079-05", "F079-06", "F079-07", "F079-08", "F079-09", "F079-10", "F079-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 79. Routing and model-neutral orchestration

This area decides which AI model answers each message. In Auto, the app picks a model from the request, the person's plan, cost and the health of each provider route. A person can also pin one model, set a default model for a project, compare answers side by side, and see which model answered and why. It matters because cost, privacy and plan limits are enforced here, and a chosen model must not be swapped without the person knowing.

**Who uses it.** Every user of the six apps uses Auto and the model picker. In Cloud (our managed service) the plan tier decides which models are allowed (tierAdmissionRejection in packages/ai/routing/src/auto.ts), and the Free plan has its own cheap lane (apps/web/lib/services/free-lane/mode.ts). Workspace admins set model and privacy rules that routing obeys (apps/web/features/settings/sections/WorkspacePolicySection.tsx). Developers using the CLI get extra flags (--auto, --provider, --fallback-model, --agent). The public API uses the same server router as web chat.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F079-01](F079-01-auto-picks-the-model.md) | Auto picks the model | built | built | built | built | built | built |
| [F079-02](F079-02-instant-best-and-economy-choices.md) | Instant, Best and Economy choices | built | built | n/a | built | built | built |
| [F079-03](F079-03-understanding-the-request.md) | Understanding the request | built | built | built | built | built | built |
| [F079-04](F079-04-pick-a-model-yourself-and-locks.md) | Pick a model yourself, and locks | built | built | partly | built | partly | partly |
| [F079-05](F079-05-project-default-model.md) | Project default model | built | built | built | no | built | no |
| [F079-06](F079-06-privacy-first-routing.md) | Privacy-first routing | built | built | built | built | built | n/a |
| [F079-07](F079-07-health-fallback-and-switch-offers.md) | Health, fallback and switch offers | built | built | built | built | built | built |
| [F079-08](F079-08-which-model-answered-and-why.md) | Which model answered, and why | built | built | built | built | partly | built |
| [F079-09](F079-09-compare-models-side-by-side.md) | Compare models side by side | built | built | built | no | no | no |
| [F079-10](F079-10-specialist-workers-with-their-own-model.md) | Specialist workers with their own model | n/a | n/a | no | built | n/a | no |
| [F079-11](F079-11-not-built.md) | Not built | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md).

## How this area works in the code

1. **Person chooses a model or Auto.** The picker stores the choice. On web it also stores the routing choice (auto, speed, quality, cost). Project defaults are applied on a new chat. (`apps/web/features/chat/components/Composer/ComposerFooter.tsx:1005`, `apps/web/shared/stores/model-store.ts:325`, `apps/web/features/chat/pages/WebChatPage.tsx:2125`, `packages/contracts/types/src/routing-profile-choice.ts:13`)
2. **Client sends the request.** The web hook adds routing_profile only when it is not 'auto'. Mobile and Chrome first run the shared router on the device. The CLI resolves Auto itself for the launch prompt. (`apps/web/lib/hooks/useChatStream.ts:4646`, `apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:94`, `apps/extension/src/features/cloud-bridge/managedChatRouting.ts:55`, `apps/cli/src/lib.rs:8004`)
3. **Server labels the request.** The server classifies the text and attachments, lets explicit toggles override it, then adds a task family. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4512`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4548`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4622`, `packages/ai/routing/src/classify.ts:99`)
4. **Server gathers the limits.** In parallel it reads route health, conversation route history, zero-data-retention policy, workspace model policy, the user's saved routing preference and residency region. It also reads credit balance for the affordability check. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4600`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4645`, `apps/web/lib/services/user-routing-preferences.ts:41`)
5. **Router resolves a route.** resolveAutoRoute checks trust mode, capabilities and runtime profile. A named model is checked and used as is; an Auto alias goes to eligibility filtering, then ordering by profile and task family, then route ranking. Fallbacks are attached. (`packages/ai/routing/src/auto.ts:1722`, `packages/ai/routing/src/auto.ts:1744`, `packages/ai/routing/src/auto.ts:1840`, `packages/ai/routing/src/auto.ts:1342`, `packages/ai/routing/src/profiles/index.ts:64`)
6. **Server records the decision and sends the call.** A trace with the policy version is built and saved without blocking the turn. Failover routes are built from the decision. Out of credits, a cheaper model may replace the one asked for unless a route was pinned. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4852`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6052`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6837`, `apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:44`)
7. **Answer returns with attribution.** The stream carries the served model and, if it moved, the moved-from model and reason. Each app shows the model and an optional 'Moved to' line. (`apps/web/features/chat/components/messages/MessageBubble.tsx:831`, `packages/ui/unified-chat/src/lib/modelEscalation.ts:32`, `packages/contracts/types/src/auto-route-explanation.ts:1`, `apps/mobile/src/features/chat/components/messageTurnNotices.ts:47`)
8. **CLI path.** --auto resolves a model for the first prompt and then, for own-key sessions, re-resolves every turn with continuity and prints the change. Cloud sessions are re-resolved by the server. (`apps/cli/src/lib.rs:8004`, `apps/cli/src/model_catalog.rs:698`, `apps/cli/src/agent/chat.rs:660`, `apps/cli/src/routing/fallback.rs:1`)

## Files to know

| File | Role |
|---|---|
| `packages/ai/routing/src/auto.ts` | The router: eligibility, ranking, fallbacks, health, budget, explicit model and route pin handling |
| `packages/ai/routing/src/classify.ts` | Word-pattern classifier that labels each message |
| `packages/ai/routing/src/task-family.ts` | Groups a request into a task family from structural signals |
| `packages/ai/routing/src/profiles/index.ts` | The four named profiles (Instant, High, Code, Research) and their weights |
| `packages/ai/routing/src/routing-trace.ts` | Builds the per-decision trace and holds the policy version |
| `packages/contracts/types/src/routing-profile-choice.ts` | The Auto, Instant, Best, Economy choices shared by apps |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Server turn setup: classifies, gathers limits, routes, falls back, records the trace |
| `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web model picker and profile choice |
| `packages/ui/unified-chat/src/lib/modelEscalation.ts` | Builds the 'Moved to' line shown on answers, shared by apps |
| `apps/web/lib/services/model-rollout/routing-decision-trace-service.ts` | Saves routing decisions and outcomes |
| `apps/cli/src/model_catalog.rs` | CLI Auto resolution through the model registry crate |
| `apps/cli/src/routing/fallback.rs` | CLI fallback chain across models |

## What is stored

- One row per routing decision (selection, task type, reason, model, provider, route, region, trace JSON), later updated with outcome, speed and cost: database table public.routing_decision_traces (apps/web/db/neon/0212_routing_decision_traces.sql; written in routing-decision-trace-service.ts:47)
- The user's routing preference (us_only): column routing_preferences on the profiles table (apps/web/lib/services/user-routing-preferences.ts:49)
- A project's default model: column default_model_id on the projects table (apps/web/db/neon/0053_projects_managed_cloud_contract.sql:9)
- The chosen routing profile (auto, speed, quality, cost) on web: model store state with a persist reader (apps/web/shared/stores/model-store.ts:325-328); the exact storage key was not opened
- Outcome history for routes and credentials, used to demote unhealthy routes: key-value store through the port in packages/ai/routing/src/route-health-store.ts
- Moved-from model, moved reason and fallback reason on each answer: message metadata (apps/web/features/chat/components/messages/MessageBubble.tsx:831-841)
- CLI session Auto state with policy version: ManagedSessionAutoRouting in the CLI session (apps/cli/src/platform/runtime/session.rs; set at apps/cli/src/agent/chat.rs:731-738)
- CLI fallback chain and routing settings: ~/.agiworkforce/config.toml [routing] section (named in apps/cli/src/routing/fallback.rs header)
- Custom agent definitions: .agiworkforce/agents/*.md and ~/.agiworkforce/agents/*.md (apps/cli/src/agents.rs header)
- VS Code active project (id, name, instructions): VS Code workspaceState (apps/extension-vscode/src/features/projects/projectActions.ts:393-396)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_ROUTING_OBSERVED_HEALTH**: Kill switch for health-aware ranking; 0, false or off disables it (packages/ai/routing/src/auto.ts:766-770 and packages/ai/routing/src/routing-stages.ts:11)
- **AGI_ROUTING_CANARY**: Kill switch for trying a newer model on some requests (packages/ai/routing/src/auto.ts:772-776)
- **AGI_ROUTING_SHADOW**: Kill switch for mirroring requests to a candidate model (packages/ai/routing/src/auto.ts:778-782)
- **AGI_ROUTING_TASK_FAMILY_STAGE**: Kill switch for the task-family step (packages/ai/routing/src/task-family-routing.ts:71,80)
- **AGI_FREE_LANE_MODE**: Sets how the Free plan's cheap lane runs (apps/web/lib/services/free-lane/mode.ts:3,31)
- **Plan tier**: Limits which models and Auto bands a person can use (packages/ai/routing/src/auto.ts (tierAdmissionRejection; resolveTierMaximumProfile at 2174); apps/web/features/projects/components/ProjectDefaultModelField.tsx:28-36)
- **Zero-data-retention and no-training opt-out**: Drops providers that keep or train on inputs (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4690-4715; packages/ai/routing/src/auto.ts:1099)
- **Workspace model policy and residency region**: Refuses models or providers a workspace does not allow, or that fall outside its region (packages/ai/routing/src/auto.ts (evaluateEligibility); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4690-4696)
- **routing_profile on the request**: Chooses speed, quality or cost for Auto (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:714,3635,4769)
- **CLI flags --auto, --model, --provider, --fallback-model, --agent**: Chooses routing mode, locks and fallback for the CLI; --auto cannot be combined with --model or --provider (apps/cli/src/lib.rs:190-200,326-328,477-479)
- **Privacy mode (Local, own key, Managed)**: Decides which routes are allowed at all (apps/cli/src/agent/mod.rs (validate_privacy_boundary); apps/web/features/settings/sections/WorkspacePolicySection.tsx:73)

## Shared between apps

Shared: the router and classifier in packages/ai/routing (used by web server, mobile, Chrome and VS Code), the model registry in packages/ai/model-registry, the profile choices in packages/contracts/types/src/routing-profile-choice.ts, the 'Moved to' line in packages/ui/unified-chat/src/lib/modelEscalation.ts and the reason phrases in packages/contracts/types/src/auto-route-explanation.ts. Separate: the CLI has Rust copies of the router, classifier and profiles (crates/agiworkforce-model-registry, apps/cli/src/routing/*), kept in line by tests. The web server adds credit, workspace policy, residency, free lane and trace saving (request-processor.ts). Each app has its own picker screen. The public Desktop shows the hosted web app, so it follows the web path.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief says an explicit model is never silently swapped (S79.16), but Mobile and Chrome call the router with fallbackToAutoForCapabilityMismatch true. A pinned model that lacks a needed capability is moved to Auto with reason 'capability_fallback'. The web server turns this off for exact selections. (apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:94; apps/extension/src/features/cloud-bridge/managedChatRouting.ts:55; apps/web/lib/server/managed-cloud-routing/admission.ts:253; packages/ai/routing/src/auto.ts:1822)
- On the web, a person who named a model and has no credits left can get a cheaper model instead (reason 'insufficient_credits'), unless a route was pinned. It is reported in message metadata, but it is still a swap of a chosen model. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6052-6113)
- Many code references in the brief point to the wrong place. ComposerFooter.tsx:278 is a thinking-effort helper, not Auto routing. ModelRow.tsx:166 is an accessibility hint. apps/cli/src/models/streaming.rs:234 is a quota warning parser, not a provider lock. request-processor.ts line numbers have moved (the file is over 7000 lines). (apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/cli/src/models/streaming.rs:234)
- The user routing preference (us_only) is read on every chat turn, but its own comment says nothing yet offers a control to set it and the route has no caller. (apps/web/lib/services/user-routing-preferences.ts:11-20)
- The migration that creates the decision trace table says 'NOT YET APPLIED: draft only', which may be stale or true; the code writes to the table either way. (apps/web/db/neon/0212_routing_decision_traces.sql:4; apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:47)
- Mobile's request type accepts routing_profile, but the brief lists no mobile status for speed and quality, and I found no mobile control that sets it. (apps/mobile/services/streaming.ts:567)
- The CLI fallback-trigger enum is marked allow(dead_code), which hints some variants are unused. (apps/cli/src/routing/fallback.rs:19)
- The classifier's header says its accuracy is far lower than its old 75 to 85 percent claim, and it has no model fallback. Routing quality for ambiguous text depends on a weak heuristic. (packages/ai/routing/src/classify.ts:6-9)
- In the CLI, per-turn re-resolution only changes the model for own-key sessions. Cloud, Local and on-device sessions return without switching (Cloud is left to the server). (apps/cli/src/agent/chat.rs:660-728)

## Not established

- I did not open the Desktop app code beyond noting apps/desktop/src/runtime/CloudRuntime.ts; AGENTS.md says the public Desktop shows the hosted web app, so I treated it as the web path.
- I did not confirm the exact browser storage key for the web routing profile.
- I did not open VS Code's reachability and picker code in depth (apps/extension-vscode/src/features/model-picker/reachability.ts), so how its 'needs setup' section behaves in each privacy mode is not described.
- I did not find where Mobile's privacy-first handling lives beyond the brief's references (apps/mobile/src/features/settings/capabilities/index.tsx:72, model-picker/service.ts:30).
- I could not tell whether anything reads routing_decision_traces for a dashboard; the brief says not applicable, and I found only the writer and a rollout benchmarks reference in the migration header.
- I did not trace how Chrome shows quota-aware selection, health fallback or the Instant, Best and Economy choices.
- I did not verify the Free plan lane's exact behavior (AGI_FREE_LANE_MODE values) or the free-auto ranking in packages/ai/routing/src/free-auto.ts.
- I did not check how the mobile Compare screen is reached, or whether it limits answers to two on purpose.
