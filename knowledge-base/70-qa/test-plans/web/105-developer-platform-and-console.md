---
id: "PLAN-web-105"
type: "test-plan"
title: "Web · 105. Developer platform and console"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "105"
---
# Web · 105. Developer platform and console

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S105.01 Developer organization/project creation.

- **Expected:** A developer can create an organization and projects that scope API keys, usage and limits.
- **Code:** done. Evidence present: apps/web/features/developers/components/ProjectsPanel.tsx:153; apps/web/features/developers/components/ProjectsPanel.tsx:97; apps/web/lib/developer-api/project-spend.ts:27; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:291; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:302; apps/web/lib/services/managed-usage-request-service.ts:699
- **Where to find it:** Type /developers in the address bar after signing in (no menu link to it was found), then the "Projects" card > "Create project" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. After signing in, type /developers in the address bar and press Return.
  2. Find the card with the "Projects" heading and the name field.
  3. Type a project name. Optionally fill "Monthly limit in credits".
  4. Click "Create project".
  5. Look for the new project in the card's list and compare with Expected (a project that scopes keys, usage and limits). No control to create an organization was found on this page.

## S105.02 API-key management.

- **Expected:** A developer can create scoped API keys (with expiry), see them masked with last-used time, and revoke them.
- **Code:** done. Evidence present: apps/web/features/settings/components/Settings/ApiKeys.tsx:416; apps/web/features/settings/components/Settings/ApiKeys.tsx:389; apps/web/app/api/settings/api-keys/route.ts:35; apps/web/features/settings/components/Settings/ApiKeys.tsx:272
- **Where to find it:** Type /developers in the address bar, then the "API Keys" card > "New Key" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. In the "API Keys" card, click "New Key".
  3. Enter a "Key Name", pick "Scopes", optionally a "Project" and an "Expires" choice, then submit.
  4. Read the new key once in the dialog, then close it.
  5. In the key list, check the masked key, the "Created" date and "Last used" date, then click the trash button labelled "Delete <key name>" and confirm "Delete Key". Compare with Expected (scoped key, expiry, masked, last used, revoke).

## S105.03 Service-account management.

- **Expected:** A workspace admin can create non-human service identities with scoped keys, list them and disable or revoke them.
- **Code:** done. Evidence present: apps/web/app/workspace/identity/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx:82; apps/web/app/api/settings/organization/admin-api-keys/route.ts:298
- **Where to find it:** Workspace console > Records > Audit > "Create key" (creates a service principal with the first workspace API key); list and disable under Workspace console > Identity > "Service principals" (labels found in the code)
- **Needs:** a workspace admin account on a workspace that allows workspace API keys (Team or Enterprise)
- **Steps:**
  1. Sign in as a workspace admin and open the workspace console (Settings > Workspace > "Workspace administration").
  2. Open Records > Audit and find the "Workspace API keys" card.
  3. Enter a name, choose scopes, then click "Create key"; copy the key shown once.
  4. Open Identity and find the "Service principals" list; check the new principal and its permissions.
  5. Click "Disable" on a principal, confirm in the dialog, then check the button changes to "Enable" and the row shows "Disabled". Compare with Expected.

## S105.04 Model catalog.

- **Expected:** Developers can browse the models their key can call, with capabilities and context size.
- **Code:** done. Evidence moved: apps/web/features/developers/components/DeveloperConsolePage.tsx:38; apps/web/shared/components/layout/AccountMenuItems.tsx:117 (quoted code not found in the file now)
- **Where to find it:** Type /developers in the address bar, then the "Reference" card > "Models" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. Scroll to the "Reference" card and click "Models".
  3. On the Models page read the model cards: each shows "Context" and capability chips.
  4. Use the "Capabilities" filter buttons and check the list narrows.
  5. Compare with Expected (models your key can call, with capabilities and context size).

## S105.12 Prompt templates.

- **Expected:** Developers can save reusable prompt templates (with arguments) and invoke them.
- **Code:** done. Evidence present: apps/web/features/settings/components/CloudSettingsSync.tsx:210; apps/web/features/settings/components/CloudSettingsSync.tsx:224; apps/web/features/settings/components/CloudSettingsSync.tsx:303; apps/web/features/settings/lib/custom-commands-namespace.ts:52
- **Where to find it:** Account menu > Settings > General > "Custom commands" > "New command" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the account menu and choose "Settings", then the "General" pane.
  2. Scroll to "Custom commands" and click "New command".
  3. Fill "Name", "Description" and the "Template" field (it takes one user-text placeholder).
  4. Click "Create command".
  5. In a chat, type / and look for the new command in the slash menu; check that the placeholder is filled with the text you typed.

## S105.18 Usage and cost dashboards.

- **Expected:** Developers can see usage and cost over time, broken down by model.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1451; apps/web/features/settings/sections/UsageSection.tsx:218 (quoted code not found in the file now); apps/web/app/api/usage/history/route.ts:63
- **Where to find it:** Account menu > Settings > "Usage" (settings pane) (labels found in the code)
- **Needs:** a signed-in account with some usage
- **Steps:**
  1. Open the account menu, choose "Settings", then "Usage".
  2. Read "Where your usage went" and the "Group usage history by" control; choose "Days", "Weeks" or "Months".
  3. Read the "By model" table for the period.
  4. Compare the figures across periods with Expected (usage and cost over time, broken down by model).

## S105.19 Rate-limit inspection.

- **Expected:** Developers can see their rate limits and how close they are to them.
- **Code:** done. Evidence present: apps/web/features/developers/components/RateLimitsPanel.tsx:27; apps/web/lib/developer-api/rate-limit-summary.ts:18; apps/web/features/developers/components/RequestPlayground.tsx:210
- **Where to find it:** Type /developers in the address bar, then the "Rate limits" card (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. Scroll to the "Rate limits" card.
  3. Read each row in "Request limits by endpoint": endpoint, requests per window, and whether it counts per account or per IP.
  4. Compare with Expected (see the limits and how close the account is to them).

## S105.20 Budget controls.

- **Expected:** An owner can set a spend cap that the API enforces.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:377; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:60 (quoted code not found in the file now); apps/web/app/api/settings/organization/spend-limit/route.ts:183
- **Where to find it:** Settings > Workspace > "Workspace administration" > Usage > "Monthly spend limit" (labels found in the code)
- **Needs:** a workspace owner account on a workspace
- **Steps:**
  1. Open Settings, choose the "Workspace" pane and click "Workspace administration".
  2. Open Records > Usage and scroll to "Monthly spend limit".
  3. Enter a cap, choose "Notify" or "Block" under "Spend limit enforcement", then click "Set limit".
  4. Read the usage meter ("% of the monthly limit used") and check the cap shows.
  5. Optionally click "Remove limit" and confirm, then check the message says spending is no longer capped. Compare with Expected (an owner's spend cap the API enforces).

## S105.21 Webhook configuration.

- **Expected:** Developers can register a webhook endpoint and choose which events it receives.
- **Code:** done. Evidence moved: apps/web/features/developers/components/WebhooksPanel.tsx:916; apps/web/app/api/developers/webhooks/route.ts:59; apps/web/lib/developer-api/webhook-signature.ts:15; apps/web/lib/services/developer-webhook-service.ts:119; apps/web/lib/services/developer-webhook-service.ts:420 (quoted code not found in the file now); apps/web/lib/services/developer-webhook-service.ts:339
- **Where to find it:** Type /developers in the address bar, then the "Webhooks" card > "Add endpoint" (labels found in the code)
- **Needs:** a signed-in account and an HTTPS URL you control
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. In the "Webhooks" card, click "Add endpoint".
  3. Enter the "Endpoint URL" and an optional "Description", tick the events under "Events", then click "Add endpoint" in the dialog.
  4. Copy the signing secret from the "Copy the signing secret now" dialog and close it.
  5. Check the endpoint appears in the "Webhook endpoints" list with its events. Compare with Expected.

## S105.22 Webhook event history.

- **Expected:** Developers can see a history of webhook deliveries with status and can redeliver.
- **Code:** done. Evidence present: apps/web/features/developers/components/WebhooksPanel.tsx:385; apps/web/features/developers/components/WebhooksPanel.tsx:404; apps/web/app/api/developers/webhooks/[endpointId]/deliveries/route.ts:25; apps/web/app/api/developers/webhooks/[endpointId]/deliveries/[deliveryId]/redeliver/route.ts:29; apps/web/lib/services/developer-webhook-service.ts:389
- **Where to find it:** Type /developers in the address bar, then the "Webhooks" card > an endpoint > "Recent deliveries" > "Resend" (labels found in the code)
- **Needs:** a signed-in account with at least one webhook endpoint
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. In the "Webhooks" card, pick an endpoint from "Webhook endpoints" (or use "Send test event").
  3. Read the "Recent deliveries" list: each row shows its status.
  4. Click "Resend" on one delivery.
  5. Check a new row appears with ", resent" after its details. Compare with Expected (delivery history with status and redeliver).

## S105.23 SDK documentation.

- **Expected:** There is documentation for official client SDKs.
- **Code:** done. Evidence present: apps/web/app/api-docs/page.tsx:215; apps/web/app/api-docs/page.tsx:234; apps/web/app/api-docs/page.tsx:243
- **Where to find it:** Type /developers in the address bar, then the "Reference" card > "API docs" > scroll to "SDKs." (labels found in the code)
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. In the "Reference" card, click "API docs".
  3. Scroll to the "SDKs." heading and read the Python and TypeScript tabs.
  4. Compare with Expected (documentation for official client SDKs).

## S105.24 API reference.

- **Expected:** A published API reference documents every public endpoint, credential and scope.
- **Code:** done. Evidence present: apps/web/app/api-docs/page.tsx:388; apps/web/app/api/llm/v1/models/route.ts:225
- **Where to find it:** Type /developers in the address bar, then the "Reference" card > "API docs" (and "OpenAPI bundle") (labels found in the code)
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. In the "Reference" card, click "API docs" and read the "Quick start" text on credentials and scopes.
  3. Scroll to the "Reference." heading and follow its link to the bundle.
  4. Click "OpenAPI bundle" on the /developers Reference card and check it lists endpoints. Compare with Expected (every public endpoint, credential and scope).

## S105.25 Integration examples.

- **Expected:** Docs include copyable integration examples (curl, Python, TypeScript).
- **Code:** done. Evidence present: apps/web/app/api-docs/page.tsx:62; apps/web/app/api/llm/v1/models/route.ts:225
- **Where to find it:** Type /developers in the address bar, then the "Reference" card > "API docs" > "Quick start" tabs "curl", "Python", "TypeScript" (labels found in the code)
- **Steps:**
  1. Type /developers in the address bar and press Return, then click "API docs" in the Reference card.
  2. Find the "Quick start" section.
  3. Click the "curl" tab, then "Python", then "TypeScript".
  4. Check each tab shows a copyable example. Compare with Expected (curl, Python and TypeScript examples).

## S105.26 Migration guides.

- **Expected:** Developers get migration guides for API/model changes and from other providers.
- **Code:** done. Evidence moved: apps/web/app/api-docs/page.tsx:290 (quoted code not found in the file now); apps/web/app/api-docs/page.tsx:292; apps/web/app/api-docs/page.tsx:311; apps/web/app/api-docs/page.tsx:329
- **Where to find it:** Type /developers in the address bar, then the "Reference" card > "Migration guides" (labels found in the code)
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. In the "Reference" card, click "Migration guides".
  3. Read the headings "From the OpenAI API", "From the Anthropic API" and "Between models".
  4. Compare with Expected (migration guides for API and model changes and from other providers).

## S105.27 Deprecation notices.

- **Expected:** Developers are told ahead of time when a model or API is deprecated.
- **Code:** done. Evidence moved: apps/web/app/api-docs/page.tsx:352 (quoted code not found in the file now); apps/web/app/api-docs/page.tsx:358
- **Where to find it:** Type /developers in the address bar, then the "Reference" card > "Deprecations" (labels found in the code)
- **Steps:**
  1. Type /developers in the address bar and press Return.
  2. In the "Reference" card, click "Deprecations".
  3. Read the "Deprecations." section, which says models are announced before they go and points to deprecation_date in GET /models.
  4. Compare with Expected (developers told ahead of time). The dated list is not on this page itself.

## S105.28 Developer support.

- **Expected:** Developers have a support channel (tickets or contact) reachable from the product.
- **Code:** done. Evidence moved: apps/web/app/support/page.tsx:105; apps/web/features/support/lib/ticket-client.ts:1 (quoted code not found in the file now)
- **Where to find it:** Settings > Help > "Raise ticket" (also the /support page's "Raise a ticket" button) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the account menu, choose "Settings", then "Help".
  2. Find the support ticket form and fill it in.
  3. Click "Raise ticket".
  4. Check the ticket appears in the list with replies. Compare with Expected (a support channel reachable from the product).

## S105.29 Custom app/Plugin testing.

- **Expected:** A developer can load an unpublished custom plugin into their own account to try it.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/DirectoryPanel.tsx:1031; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1193 (quoted code not found in the file now); apps/web/app/api/plugins/uploads/route.ts:32
- **Where to find it:** Settings > "Plugins" > "Upload plugin" (or "Create a plugin") (labels found in the code)
- **Needs:** a plugin archive file on disk
- **Steps:**
  1. Open the account menu, choose "Settings", then "Plugins".
  2. Click the "Upload plugin" action in the list toolbar.
  3. Choose a plugin archive file and submit (the "Upload" button).
  4. Read the result and check the plugin appears in your list without being published. Compare with Expected (load an unpublished plugin into your own account).

## S105.30 Publishing workflow.

- **Expected:** A developer can submit a plugin/app for review and publish versions to users.
- **Code:** done. Evidence present: apps/web/app/api/plugins/submissions/route.ts:49; apps/web/lib/services/plugin-submission-service.ts:169; apps/web/app/api/admin/plugin-submissions/[id]/route.ts:79; apps/web/features/admin/pages/PluginModerationPage.tsx:804; apps/web/features/directory/services/plugins-directory.ts:1320
- **Where to find it:** Settings > "Plugins" > open your plugin > "Submit to the directory" (labels found in the code)
- **Needs:** a plugin you own
- **Steps:**
  1. Open the account menu, choose "Settings", then "Plugins".
  2. Open one of your plugins from the list.
  3. Click "Submit to the directory" and confirm "Submit for review".
  4. Check the status shows a pending submission, with "Withdraw" available.
  5. Use "Switch version" to choose an installed version. Compare with Expected (submit for review and publish versions).
