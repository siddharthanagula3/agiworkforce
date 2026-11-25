---
id: "AREA-105"
type: "area"
title: "Developer platform and console"
features: ["F105-01", "F105-02", "F105-03", "F105-04", "F105-05", "F105-06", "F105-07", "F105-08", "F105-09", "F105-10", "F105-11", "F105-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 105. Developer platform and console

A developer uses this area to create projects and API keys, then call the AGI Workforce gateway from their own code, scripts or the command line. Each key can be limited by scope, expiry and project, and spend can be capped per project and per workspace. The area also holds webhooks (automatic messages sent to the developer's server when something happens), rate-limit readouts, prompt templates with test cases, and the API reference. It matters because it is the only path for a developer to use the platform outside the apps, and because a spend cap must hold when a key is used.

**Who uses it.** Developers on a plan that includes the managed API capability (the server checks this with canUseBillingPlanCapability(planTier, 'managed_api') in apps/web/app/api/settings/api-keys/route.ts:85). Workspace admins and owners for service accounts and the workspace spend cap (apps/web/app/api/settings/organization/admin-api-keys/route.ts and spend-limit/route.ts, which use role checks). Anyone can read the public API docs at /api-docs. The code does not show a separate free-plan rule for the console beyond the managed_api check, so the exact plan list is in the types package, which I did not open.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F105-01](F105-01-projects-with-monthly-credit-limits.md) | Projects with monthly credit limits | built | built | n/a | n/a | n/a | n/a |
| [F105-02](F105-02-api-keys.md) | API keys | built | built | n/a | n/a | n/a | n/a |
| [F105-03](F105-03-service-accounts-workspace-admin.md) | Service accounts (workspace admin) | built | built | n/a | n/a | n/a | n/a |
| [F105-04](F105-04-model-list-and-deprecation-notices.md) | Model list and deprecation notices | built | built | n/a | built | n/a | n/a |
| [F105-05](F105-05-try-a-request-in-the-browser.md) | Try a request in the browser | partly | partly | n/a | n/a | n/a | n/a |
| [F105-06](F105-06-prompt-templates-versions-and-test-cases.md) | Prompt templates, versions and test cases | partly | partly | n/a | partly | n/a | n/a |
| [F105-07](F105-07-request-logs-and-usage.md) | Request logs and usage | partly | partly | n/a | built | n/a | n/a |
| [F105-08](F105-08-rate-limits-and-budget-caps.md) | Rate limits and budget caps | built | built | n/a | built | n/a | n/a |
| [F105-09](F105-09-webhooks.md) | Webhooks | built | built | n/a | n/a | n/a | n/a |
| [F105-10](F105-10-docs-reference-and-support.md) | Docs, reference and support | built | built | n/a | partly | n/a | n/a |
| [F105-11](F105-11-plugin-testing-and-publishing.md) | Plugin testing and publishing | built | built | n/a | built | n/a | n/a |
| [F105-12](F105-12-inspectors-and-data-tools-not-built.md) | Inspectors and data tools (not built) | partly | partly | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/105-developer-platform-and-console.md](../../10-requirements/capabilities/105-developer-platform-and-console.md).

## How this area works in the code

1. **Console page.** The Developer console page renders the cards in order: API keys, projects, playground, prompts, logs, webhooks, rate limits and reference links. (`apps/web/features/developers/components/DeveloperConsolePage.tsx:54-74`)
2. **Create a key.** The key form posts to the settings API keys route. The route checks the CSRF token, the managed_api plan capability, the 20-key limit and the project, then asks for a step-up check. The service makes the key, stores only its hash, and returns the full key once. (`apps/web/app/api/settings/api-keys/route.ts:71-160`, `apps/web/lib/services/api-key-service.ts:126-145`)
3. **Use the key on the gateway.** A call to the chat gateway sends the key. The service looks up the key where it is not revoked and not expired, and updates its last-used time. Then the project spend check runs: if the project is over its limit, the call gets HTTP 429. (`apps/web/lib/services/api-key-service.ts:244-290`, `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:291`, `apps/web/lib/developer-api/project-spend.ts:27-85`)
4. **Workspace spend cap.** Before the turn runs, the chat route checks the workspace cap. If the check is refused, the call gets HTTP 429 with the cap's reason. If the check itself errors, the code lets the call through (see things that look wrong). (`apps/web/app/api/llm/v1/chat/completions/route.ts:445-453`, `apps/web/lib/managed-compute-gate.ts:511-539`)
5. **Model list.** GET models filters the catalog by the plan, by the surface, and by kill switches, then returns the list with capabilities and any retirement date. (`apps/web/app/api/llm/v1/models/route.ts:140-205`)
6. **Webhook queued and sent.** An event is written to the deliveries table. The first attempt runs after the response. The delivery signs the body with the endpoint secret, opened with the platform key, and posts it. Failures are retried by a queued job. (`apps/web/lib/services/developer-webhook-service.ts:339-362`, `apps/web/lib/services/developer-webhook-service.ts:475-545`, `apps/web/lib/developer-api/webhook-signature.ts:24-46`)
7. **Archive a project.** Archiving a project revokes its keys, writes an audit event for each one, and queues an api_key.revoked webhook event. (`apps/web/app/api/developers/projects/[projectId]/route.ts:62-90`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/developers/components/DeveloperConsolePage.tsx` | The console page that lays out every card and the reference links. |
| `apps/web/app/api/settings/api-keys/route.ts` | Lists and creates API keys; enforces plan, key limit and step-up. |
| `apps/web/app/api/settings/api-keys/[keyId]/route.ts` | Revokes one key (DELETE). |
| `apps/web/lib/services/api-key-service.ts` | Makes keys, stores their hash, checks expiry and revocation when a key is used. |
| `apps/web/lib/developer-api/project-spend.ts` | Refuses calls from a project that has reached its monthly credit limit. |
| `apps/web/app/api/llm/v1/models/route.ts` | Gateway model list, filtered by plan, surface and kill switches. |
| `apps/web/lib/managed-compute-gate.ts` | Workspace spend cap check before a managed turn. |
| `apps/web/lib/services/developer-webhook-service.ts` | Webhook endpoints, deliveries, signing secret handling, retries. |
| `apps/web/lib/developer-api/webhook-events.ts` | List of webhook event types, retry limits and timeout. |
| `apps/web/features/developers/components/RequestPlayground.tsx` | Browser form that sends a test request and builds a copyable curl command. |
| `apps/web/features/developers/components/PromptEvaluations.tsx` | Test cases, CSV import, runs and per-case diffs for a prompt. |
| `apps/web/app/api-docs/page.tsx` | Public API documentation page: auth, scopes, webhooks, migration, deprecations. |

## What is stored

- API keys: name, key hash, visible prefix, scopes, project id, created, last used, expires, revoked time. The full key is not stored; only its hash.: public.api_keys (read and written in apps/web/app/api/settings/api-keys/route.ts and apps/web/lib/services/api-key-service.ts).
- Developer projects: name, monthly credit limit, archive time.: public.developer_projects (apps/web/lib/developer-api/project-spend.ts:35-46).
- Webhook endpoints: url, description, event types, secret prefix, and the encrypted secret.: public.developer_webhook_endpoints (apps/web/lib/services/developer-webhook-service.ts:151, 184).
- Webhook deliveries: event, status, attempts, response status, error, times.: public.developer_webhook_deliveries (apps/web/lib/developer-api/project-spend.ts:54-63; service file for writes).
- Key create, revoke and service-account changes, with actor and subject.: Audit events via recordAuditEvent (apps/web/app/api/settings/api-keys/route.ts:~138; admin-api-keys/route.ts:180).
- Prompts, versions, test cases and runs.: Server routes under apps/web/app/api/developers/prompts/ (table names not read).
- Workspace spend cap settings.: apps/web/lib/services/spend-limit-service.ts via apps/web/app/api/settings/organization/spend-limit/route.ts.
- Browser state: none found for these cards beyond form state held in memory.: Not confirmed beyond the components I opened.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Active key limit (20)**: A user cannot create a 21st active key. (apps/web/app/api/settings/api-keys/route.ts:26)
- **managed_api plan capability**: Creating a key needs a plan that includes this capability; otherwise 403 with an upgrade link. (apps/web/app/api/settings/api-keys/route.ts:85)
- **developer_surfaces plan rule**: The model list is empty for a plan that does not serve the developer surface. (apps/web/app/api/llm/v1/models/route.ts:168-189)
- **Kill switches for models and providers**: A model or provider can be taken out of the list without a release. (apps/web/app/api/llm/v1/models/route.ts:135-154 (readKillSwitchGate))
- **Project monthly credit limit**: Null means no limit; a number caps the project's keys for the month. (apps/web/lib/developer-api/project-spend.ts:43, 49-52)
- **Workspace spend cap mode (block or warn)**: Block refuses turns; warn only records. Owners set it. (apps/web/app/api/settings/organization/spend-limit/route.ts:122 (severity from enforcement))
- **Maximum key lifetime**: Expiry dates beyond this many days are refused. (apps/web/lib/services/api-key-service.ts:28-43 (the value's source was not read))
- **Webhook endpoint limit (10)**: Maximum endpoints per user. (apps/web/lib/services/developer-webhook-service.ts:35)
- **Webhook attempts (20) and timeout (10 seconds)**: Retry count and wait per delivery. (apps/web/lib/developer-api/webhook-events.ts:48-49)
- **Endpoint rate limits**: Per-endpoint request limits and windows. (apps/web/lib/developer-api/rate-limit-summary.ts:9-16 (values from lib/rate-limit.ts, not read))
- **CLI --max-budget-usd**: Stops one CLI session when its spend passes the value; not the workspace cap. (apps/cli/src/lib.rs:489-492)
- **Developer surface flag and plan for the playground**: Not found in the code read; the playground sends whatever the gateway allows. (not established)

## Shared between apps

Web console components, routes under apps/web/app/api, and the shared types and gate code are used by the web app, and the brief marks the desktop as the same hosted screens (AGENTS.md section 5). The CLI has its own Rust code: model discovery (apps/cli/src/models/gateway_models.rs), usage (apps/cli/src/usage_summary.rs), project creation (apps/cli/src/cloud/mod.rs:441), custom prompts (apps/cli/src/command_registry.rs). Shared across apps: the gateway itself and its model list, the key verification service, and the webhook signing helper. The gateway docs in apps/web/app/api-docs are web only. I did not open desktop, mobile, VS Code or Chrome extension code.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says the API playground (S105.05) and request builder (S105.06) are missing on web and desktop. The code has a Request playground that sends a request and copies a curl command. Status should be partial, not missing. (apps/web/features/developers/components/RequestPlayground.tsx:151, :121, :181; rendered at apps/web/features/developers/components/DeveloperConsolePage.tsx:70)
- Brief says evaluation datasets, runs and per-case results (S105.14 to S105.16) are missing. The code has test cases with CSV import, runs, and a line diff per case. (apps/web/features/developers/components/PromptEvaluations.tsx:212, :411, :186-187; used by apps/web/features/developers/components/PromptsPanel.tsx:385; routes under apps/web/app/api/developers/prompts/[promptId]/cases and runs)
- Brief says prompt versions (S105.13) are missing on web, desktop and CLI. A versions route and a version draft editor exist on web. Rollback and compare were not confirmed. (apps/web/app/api/developers/prompts/[promptId]/versions/route.ts; apps/web/features/developers/components/PromptsPanel.tsx:56-89)
- Brief says the trace explorer (S105.17) is missing. A request log panel shows a step timeline per request. It is partial: no tool-call detail. (apps/web/features/developers/components/RequestLogsPanel.tsx:109 and step labels above it)
- Brief says SDK documentation (S105.23) is done. The page says there is no AGI SDK and points to the libraries of the chat format the gateway accepts. (apps/web/app/api-docs/page.tsx:219-234)
- Workspace spend cap fails open. If the cap check throws, the code logs an error and lets the turn through as ungoverned. The brief says the owner's cap is enforced by the API, and AGENTS.md section 9 says security behaviour fails closed. (apps/web/lib/managed-compute-gate.ts:519-523)
- Brief line numbers for the CLI and the chat auth gate do not match the code. apps/cli/src/lib.rs:1175 is a flag named yes, not a model catalog line. apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:224 is the account-unavailable branch; the project spend refusal is called at line 291. (apps/cli/src/lib.rs:1175; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:224, :291)
- CLI --max-budget-usd is a per-session stop on the client. The brief reads it as the owner's spend cap, which the server enforces. They are different controls. (apps/cli/src/lib.rs:489-492)
- Brief item S105.01 says organizations and projects. The console shows only projects; no organization creation was found. (apps/web/features/developers/components/ProjectsPanel.tsx)
- Brief item S105.04 points to DeveloperConsolePage.tsx:29, which is the Webhooks link label in the reference list, not a model catalog. (apps/web/features/developers/components/DeveloperConsolePage.tsx:27-31)

## Not established

- How the three ways (Local, own key, Cloud) apply to this area. The key routes and gateway I read are managed Cloud only; I did not check whether a Local or own-key path exists for developer keys.
- Desktop, mobile, VS Code extension and Chrome extension code was not opened. Desktop status comes from the brief and AGENTS.md.
- Plan names and the full list of plans with managed_api or developer_surfaces (in packages/contracts types, not opened).
- Source of the maximum key lifetime value and the rate-limit values (lib/rate-limit.ts not read).
- Whether the step-up check is required for every key change (route.ts reading was partial).
- Exact table names for prompts, versions, cases, runs and request logs (only the routes were seen).
- Webhook retry backoff timing details (the job queue in lib/jobs was not read).
- Whether prompt version rollback and compare exist (the UI was only partly read).
- Whether the rate-limit response headers on the chat route are set as the card says (route.ts:1419 not opened).
- Whether organization creation exists anywhere outside the console.
- The meaning of the 'developer surface' flag in the playground; no flag was found in RequestPlayground.tsx.
- The content of the plugin moderation page (PluginModerationPage.tsx:813 not opened).
