# Area 105. Developer platform and console

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S105.01 Developer organization/project creation.
- Should: A developer can create an organization and projects that scope API keys, usage and limits.
- Status: web done, desktop done
- Code: apps/web/features/developers/components/ProjectsPanel.tsx:113; apps/web/features/developers/components/ProjectsPanel.tsx:59; apps/web/lib/developer-api/project-spend.ts:27; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:224; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:273; apps/web/lib/services/managed-usage-request-service.ts:578

## S105.02 API-key management.
- Should: A developer can create scoped API keys (with expiry), see them masked with last-used time, and revoke them.
- Status: web done, desktop done
- Code: apps/web/features/settings/components/Settings/ApiKeys.tsx:348; apps/web/features/settings/components/Settings/ApiKeys.tsx:320; apps/web/app/api/settings/api-keys/route.ts:26; apps/web/features/settings/components/Settings/ApiKeys.tsx:205

## S105.03 Service-account management.
- Should: A workspace admin can create non-human service identities with scoped keys, list them and disable or revoke them.
- Status: web done, desktop done
- Code: apps/web/app/workspace/identity/page.tsx:1; apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx:75; apps/web/app/api/settings/organization/admin-api-keys/route.ts:279

## S105.04 Model catalog.
- Should: Developers can browse the models their key can call, with capabilities and context size.
- Status: web done, desktop done, cli done, api done
- Code: apps/web/features/developers/components/DeveloperConsolePage.tsx:29; apps/web/shared/components/layout/AccountMenuItems.tsx:117; apps/cli/src/lib.rs:1175; apps/cli/src/lib.rs:2237; apps/web/app/api/llm/v1/models/route.ts:146; apps/web/app/api/llm/v1/models/route.ts:202

## S105.05 API playground.
- Should: Developers can send test requests to the API from a browser playground and see the response.
- Status: web missing, desktop missing

## S105.06 Request builder.
- Should: Developers can compose an API request (model, params, messages) in a form and copy it as code.
- Status: web missing, desktop missing

## S105.07 Streaming event inspector.
- Should: Developers can watch the raw streamed events of an API call in an inspector.
- Status: web missing, desktop missing

## S105.08 Tool-call inspector.
- Should: Developers can inspect the tool calls (arguments, results) made during an API request.
- Status: web missing, desktop missing

## S105.09 Structured-output schema editor.
- Should: Developers can author and validate a structured-output JSON schema in the console.
- Status: web missing, desktop missing

## S105.10 File upload and reuse.
- Should: Developers can upload files once through the API/console and reuse them by id across requests.
- Status: web missing, desktop missing, api missing

## S105.11 Retrieval collection manager.
- Should: Developers can create and manage retrieval collections (vector stores) and query them from API calls.
- Status: web missing, desktop missing, api missing

## S105.12 Prompt templates.
- Should: Developers can save reusable prompt templates (with arguments) and invoke them.
- Status: web done, desktop done, cli done
- Code: apps/web/features/settings/components/CloudSettingsSync.tsx:119; apps/web/features/settings/components/CloudSettingsSync.tsx:129; apps/web/features/settings/components/CloudSettingsSync.tsx:211; apps/web/features/settings/lib/custom-commands-namespace.ts:52; apps/cli/src/command_registry.rs:27; apps/cli/src/tui/tui_app.rs:4082

## S105.13 Prompt versions.
- Should: Prompt templates keep versions that can be compared and rolled back.
- Status: web missing, desktop missing, cli missing

## S105.14 Evaluation datasets.
- Should: Developers can build evaluation datasets of inputs and expected outputs.
- Status: web missing, desktop missing

## S105.15 Evaluation runs.
- Should: Developers can run a dataset against a model/prompt as an evaluation run.
- Status: web missing, desktop missing

## S105.16 Per-case evaluation results.
- Should: Evaluation results are shown per case with scores and diffs.
- Status: web missing, desktop missing

## S105.17 Trace explorer.
- Should: Developers can browse traces/logs of their API requests with timing and steps.
- Status: web missing, desktop missing

## S105.18 Usage and cost dashboards.
- Should: Developers can see usage and cost over time, broken down by model.
- Status: web done, desktop done, cli done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:630; apps/web/features/settings/sections/UsageSection.tsx:218; apps/web/app/api/usage/history/route.ts:50; apps/cli/src/usage_summary.rs:714; apps/cli/src/usage_summary.rs:758; apps/web/public/openapi.json:1891; apps/web/lib/services/account-usage-history-service.ts:70

## S105.19 Rate-limit inspection.
- Should: Developers can see their rate limits and how close they are to them.
- Status: web done, desktop done, api done
- Code: apps/web/features/developers/components/RateLimitsPanel.tsx:20; apps/web/lib/developer-api/rate-limit-summary.ts:18; apps/web/features/developers/components/RequestPlayground.tsx:221; apps/web/lib/rate-limit.ts:1183; apps/web/lib/rate-limit-headers.ts:12; apps/web/app/api/llm/v1/chat/completions/route.ts:1419

## S105.20 Budget controls.
- Should: An owner can set a spend cap that the API enforces.
- Status: web done, desktop done, cli done, api done
- Code: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:345; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:60; apps/web/app/api/settings/organization/spend-limit/route.ts:161; apps/cli/src/lib.rs:477; apps/cli/src/lib.rs:5122; apps/web/app/api/llm/v1/chat/completions/route.ts:405

## S105.21 Webhook configuration.
- Should: Developers can register a webhook endpoint and choose which events it receives.
- Status: web done, desktop done
- Code: apps/web/features/developers/components/WebhooksPanel.tsx:393; apps/web/app/api/developers/webhooks/route.ts:59; apps/web/lib/developer-api/webhook-signature.ts:15; apps/web/lib/services/developer-webhook-service.ts:119; apps/web/lib/services/developer-webhook-service.ts:420; apps/web/lib/services/developer-webhook-service.ts:332

## S105.22 Webhook event history.
- Should: Developers can see a history of webhook deliveries with status and can redeliver.
- Status: web done, desktop done
- Code: apps/web/features/developers/components/WebhooksPanel.tsx:269; apps/web/features/developers/components/WebhooksPanel.tsx:291; apps/web/app/api/developers/webhooks/[endpointId]/deliveries/route.ts:25; apps/web/app/api/developers/webhooks/[endpointId]/deliveries/[deliveryId]/redeliver/route.ts:29; apps/web/lib/services/developer-webhook-service.ts:382

## S105.23 SDK documentation.
- Should: There is documentation for official client SDKs.
- Status: web done, desktop done
- Code: apps/web/app/api-docs/page.tsx:258; apps/web/app/api-docs/page.tsx:277; apps/web/app/api-docs/page.tsx:286

## S105.24 API reference.
- Should: A published API reference documents every public endpoint, credential and scope.
- Status: web done, desktop done
- Code: apps/web/app/api-docs/page.tsx:140; apps/web/app/api/llm/v1/models/route.ts:146

## S105.25 Integration examples.
- Should: Docs include copyable integration examples (curl, Python, TypeScript).
- Status: web done, desktop done
- Code: apps/web/app/api-docs/page.tsx:23; apps/web/app/api/llm/v1/models/route.ts:146

## S105.26 Migration guides.
- Should: Developers get migration guides for API/model changes and from other providers.
- Status: web done, desktop done
- Code: apps/web/app/api-docs/page.tsx:290; apps/web/app/api-docs/page.tsx:302; apps/web/app/api-docs/page.tsx:321; apps/web/app/api-docs/page.tsx:339

## S105.27 Deprecation notices.
- Should: Developers are told ahead of time when a model or API is deprecated.
- Status: web done, desktop done, api done
- Code: apps/web/app/api-docs/page.tsx:352; apps/web/app/api-docs/page.tsx:368; apps/web/app/api/llm/v1/models/route.ts:104

## S105.28 Developer support.
- Should: Developers have a support channel (tickets or contact) reachable from the product.
- Status: web done, desktop done, cli unverified
- Code: apps/web/app/support/page.tsx:67; apps/web/features/support/lib/ticket-client.ts:1

## S105.29 Custom app/Plugin testing.
- Should: A developer can load an unpublished custom plugin into their own account to try it.
- Status: web done, desktop done, cli done
- Code: packages/ui/ui/src/directory/DirectoryPanel.tsx:723; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1193; apps/web/app/api/plugins/uploads/route.ts:82; apps/cli/src/lib.rs:1296; apps/cli/src/lib.rs:3613

## S105.30 Publishing workflow.
- Should: A developer can submit a plugin/app for review and publish versions to users.
- Status: web done, desktop done
- Code: apps/web/app/api/plugins/submissions/route.ts:49; apps/web/lib/services/plugin-submission-service.ts:167; apps/web/app/api/admin/plugin-submissions/[id]/route.ts:79; apps/web/features/admin/pages/PluginModerationPage.tsx:813; apps/web/features/directory/services/plugins-directory.ts:1166
