# Area 79. Routing and model-neutral orchestration

31 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S79.01 Automatic model selection.
- Should: Auto picks a model per request from the registry for the task, plan and constraints.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; packages/ai/routing/src/auto.ts:1344; packages/ai/routing/src/auto.ts:1363; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/lib.rs:458; apps/cli/src/agent/chat.rs:552; crates/agiworkforce-model-registry/src/lib.rs:848

## S79.02 User-selected model.
- Should: The user can pick a specific model and the request runs on it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1018; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/lib.rs:199; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S79.03 Project default model.
- Should: A project can set a default model that new chats in the project use.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/projects/components/ProjectDefaultModelField.tsx:53; apps/web/features/projects/components/ProjectSettingsDialog.tsx:284; apps/web/features/projects/components/ProjectSettingsDialog.tsx:153; apps/web/features/chat/pages/WebChatPage.tsx:1703; apps/mobile/app/(app)/(tabs)/chat.tsx:218; apps/mobile/stores/projects/cloudProjectStore.ts:140; apps/extension-vscode/src/features/projects/projectActions.ts:389

## S79.04 Task-specific model profile.
- Should: Auto applies a task-specific routing profile (e.g. premium for coding and reasoning).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; packages/ai/routing/src/auto.ts:32; packages/ai/routing/src/auto.ts:1344; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/lib.rs:458; apps/cli/src/routing/classify.rs:1; crates/agiworkforce-model-registry/src/lib.rs:848

## S79.05 Speed-first profile.
- Should: A speed-first routing profile can be applied that prefers the fastest eligible route.
- Status: web done, desktop done, cli done, vscode done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1510; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3545; apps/web/lib/hooks/useChatStream.ts:3756; apps/cli/src/agent/mod.rs:1787; apps/cli/src/routing/profile.rs:18; apps/cli/src/claude_parity.rs:140; apps/extension-vscode/src/features/model-picker/modelConstants.ts:446; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3548

## S79.06 Quality-first profile.
- Should: A quality-first routing profile can be applied that prefers the most capable eligible route.
- Status: web done, desktop done, cli done, vscode done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1510; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2584; apps/cli/src/agent/mod.rs:1787; apps/cli/src/agent/mod.rs:1866; apps/cli/src/agent/mod.rs:1752; apps/extension-vscode/src/features/model-picker/modelConstants.ts:207; apps/extension-vscode/src/features/model-picker/modelConstants.ts:442; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3219

## S79.07 Cost-first profile.
- Should: A cost-first routing profile can be applied that prefers the cheapest eligible route.
- Status: web done, desktop done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1510; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2584; apps/cli/src/lib.rs:458; apps/cli/src/agent/chat.rs:552; apps/extension-vscode/src/features/model-picker/modelConstants.ts:207; apps/extension-vscode/src/features/model-picker/modelConstants.ts:442; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3219; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3241

## S79.08 Privacy-first profile.
- Should: A privacy-first profile keeps requests on local models or zero-retention routes.
- Status: web done, desktop done, mobile done, cli done, vscode done, api done
- Code: apps/web/features/settings/sections/WorkspacePolicySection.tsx:622; packages/ai/routing/src/auto.ts:1070; apps/mobile/src/features/settings/capabilities/index.tsx:72; apps/mobile/src/features/model-picker/service.ts:30; apps/cli/src/lib.rs:1632; apps/cli/src/lib.rs:1638; apps/extension-vscode/src/features/model-picker/reachability.ts:6; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S79.09 Classification of task intent.
- Should: Each request's task intent is classified and used for routing.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; packages/ai/routing/src/classify.ts:99; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/routing/classify.rs:1; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/integrations/routingTask.ts:19

## S79.10 Classification of required tools.
- Should: Which tools a request needs (research, agentic work, code execution) changes the routing task.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:598; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/agent/chat.rs:736; apps/cli/src/agent/chat.rs:742; apps/cli/src/agent/chat.rs:2193; apps/cli/src/models/streaming.rs:464

## S79.11 Classification of required modalities.
- Should: Attached images/video route the request to a multimodal-capable model.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; packages/ai/routing/src/classify.ts:113; packages/ai/routing/src/auto.ts:1344; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/routing/classify.rs:110; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S79.12 Complexity/effort classification.
- Should: Requests are classified by complexity so routing can set a quality floor or effort.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; packages/ai/routing/src/task-family.ts:173; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/agent/chat.rs:761; apps/cli/src/agent/chat.rs:1812; apps/cli/src/models/streaming.rs:647; crates/agiworkforce-llm/src/stream.rs:815

## S79.13 Source-freshness classification.
- Should: Requests needing current information are detected and routed to search-capable handling.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:564; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S79.14 Model eligibility filtering.
- Should: Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; packages/ai/routing/src/auto.ts:1344; packages/ai/routing/src/auto.ts:1302; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; crates/agiworkforce-model-registry/src/lib.rs:848; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S79.15 Provider-route selection.
- Should: Among eligible routes for a model, one provider route is chosen by ranking (health, cost, cache).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; packages/ai/routing/src/auto.ts:1363; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S79.16 Exact-model lock.
- Should: An explicitly chosen model is never silently swapped for another model.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1018; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1744; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/lib.rs:199; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S79.17 Provider lock.
- Should: The user can lock requests to one provider for the chosen model.
- Status: mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/lib.rs:203; apps/cli/src/models/streaming.rs:234

## S79.18 Route lock.
- Should: The user can lock requests to one specific provider route.
- Status: mobile missing, vscode missing, chrome missing

## S79.19 Quota-aware selection.
- Should: Routing takes the user's remaining budget into account when choosing a route.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3201; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S79.20 Health-aware fallback.
- Should: Unhealthy routes are demoted and failed calls fall back to healthy alternatives.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1810; apps/web/app/api/llm/v1/chat/completions/route.ts:961; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/lib.rs:334; apps/cli/src/routing/fallback.rs:1; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S79.21 Explicit model-switch offer.
- Should: When another model would work better, the user is offered an explicit one-click switch.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4069; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1202; apps/mobile/src/features/chat/actions/alertBlockedImageRequest.ts:16; apps/mobile/app/(app)/chat/[id].tsx:540; apps/cli/src/errors.rs:580; apps/cli/src/errors.rs:609; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:380; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:354

## S79.22 Advisor escalation.
- Should: A worker model can escalate to (consult) a stronger advisor model when needed.
- Status: not applicable anywhere

## S79.23 Specialist worker selection.
- Should: Work is delegated to specialist workers that can use their own models.
- Status: mobile missing, cli done, chrome missing
- Code: apps/cli/src/agents.rs:26; apps/cli/src/agents.rs:56

## S79.24 Multi-model comparison.
- Should: One prompt can be sent to several models and the answers compared.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/models/components/ModelCatalogueBrowser.tsx:306; apps/web/app/models/compare/page.tsx:24; apps/web/features/models/lib/use-compare-answers.ts:116; apps/web/features/models/lib/compare-answer-stream.ts:131; apps/web/features/models/components/CompareAnswersPage.tsx:341; apps/mobile/src/features/chat/components/ChatInput.tsx:637; apps/mobile/src/features/compare/index.tsx:192

## S79.25 Confidence-based abstention.
- Should: When routing or the answer is low-confidence, the system abstains or asks rather than guessing.
- Status: not applicable anywhere

## S79.26 User-visible routing explanation.
- Should: The user can see why Auto chose (or moved to) a model.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done, api done
- Code: packages/ui/unified-chat/src/lib/modelEscalation.ts:58; packages/contracts/types/src/auto-route-explanation.ts:11; apps/mobile/src/features/chat/components/MessageBubble.tsx:411; apps/cli/src/agent/chat.rs:604; apps/cli/src/agent/chat.rs:552; apps/extension/src/side_panel.ts:922; apps/extension/src/features/side-panel/bubbles.ts:403; apps/extension/src/features/side-panel/bubbles.ts:486

## S79.27 Actual-model attribution.
- Should: Each answer shows which model actually produced it.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done, api done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2656; packages/ui/unified-chat/src/lib/modelEscalation.ts:32; apps/mobile/src/features/chat/components/MessageBubble.tsx:290; apps/mobile/src/features/chat/components/MessageBubble.tsx:189; apps/cli/src/agent/chat.rs:604; apps/cli/src/agent/chat.rs:552; apps/extension/src/side_panel.ts:5119; apps/extension/src/side_panel.ts:628

## S79.28 Routing-policy versioning.
- Should: Routing policies are versioned and each decision can be traced to the policy version that made it.
- Status: web done, desktop done, mobile done, cli done, api done
- Code: packages/ai/routing/src/routing-trace.ts:153; apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:73; apps/cli/src/platform/runtime/session.rs:285

## S79.29 Classification adapter, including Jev if chosen.
- Should: A pluggable classification adapter (e.g. Jev) can replace or augment the heuristic classifier.
- Status: not applicable anywhere

## S79.30 Classification failure fallback.
- Should: When classification fails or is ambiguous, routing falls back to a safe default.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:278; packages/ai/routing/src/task-family.ts:173; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/routing/classify.rs:1; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239; apps/extension-vscode/src/utils/api.ts:581

## S79.31 Routing evaluation dashboard.
- Should: Operators can see a dashboard evaluating routing decisions and outcomes.
- Status: not applicable anywhere
