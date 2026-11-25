---
id: "PLAN-desktop-105"
type: "test-plan"
title: "Desktop · 105. Developer platform and console"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "105"
---
# Desktop · 105. Developer platform and console

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S105.01 Developer organization/project creation.

- **Expected:** A developer can create an organization and projects that scope API keys, usage and limits.
- **Code:** done. Evidence present: apps/web/features/developers/components/ProjectsPanel.tsx:153; apps/web/features/developers/components/ProjectsPanel.tsx:97; apps/web/lib/developer-api/project-spend.ts:27; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:291; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:302; apps/web/lib/services/managed-usage-request-service.ts:699
- **Where to find it:** Type /developers after the site address (no menu link found) > Projects > New project (labels found in the code)
- **Needs:** a paid account with API access (other plans get no keys)
- **Steps:**
  1. Open /developers in the browser or the Desktop app.
  2. Click New project in the Projects card.
  3. Type Production in Name and 500 in Monthly limit in credits, then click Create project.
  4. Look at the Projects list: the new project appears, with a spend line that ends in 'this month' and shows the limit you typed (or 'no monthly limit' if blank).

## S105.02 API-key management.

- **Expected:** A developer can create scoped API keys (with expiry), see them masked with last-used time, and revoke them.
- **Code:** done. Evidence present: apps/web/features/settings/components/Settings/ApiKeys.tsx:416; apps/web/features/settings/components/Settings/ApiKeys.tsx:389; apps/web/app/api/settings/api-keys/route.ts:35; apps/web/features/settings/components/Settings/ApiKeys.tsx:272
- **Where to find it:** Settings > Account > API keys > New Key (labels found in the code)
- **Needs:** a plan with API access (other plans see an upgrade message instead of the form)
- **Steps:**
  1. Click the account menu (labelled Account menu for your name), click Settings, then Account, then the API keys row.
  2. Click New Key. Type a name, pick a project or keep Default project, choose Expires (Never, 30 days, 90 days or 1 year), and tick scopes (Read model catalog, Run inference, Read usage).
  3. Click Generate Key, then Copy to Clipboard. The full key is shown only once.
  4. Check the list: each key shows its prefix followed by '...', Created, Last used once used, and Expires or Never expires.
  5. Click the trash icon labelled Delete <name>, then Delete Key, and check the key is gone from the list.

## S105.03 Service-account management.

- **Expected:** A workspace admin can create non-human service identities with scoped keys, list them and disable or revoke them.
- **Code:** done. Evidence present: apps/web/app/workspace/identity/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx:82; apps/web/app/api/settings/organization/admin-api-keys/route.ts:298
- **Where to find it:** Settings > Workspace > Workspace administration > Audit (Workspace API keys) and Identity (Service principals) (labels found in the code)
- **Needs:** a workspace owner or admin on a Team or Enterprise plan (the create form shows only for accounts that can manage keys)
- **Steps:**
  1. Open Settings, click Workspace, then Workspace administration.
  2. Click Audit, scroll to Workspace API keys, type a name, pick an expiry, tick at least one scope and click Create key. Copy the key shown.
  3. Click Identity and scroll to Service principals. Find the principal the key created.
  4. Click Disable on a principal and check it now says Disabled and its button reads Enable.
  5. Back on Audit, click Revoke on a workspace key, confirm Revoke key, and check the key shows Revoked.

## S105.04 Model catalog.

- **Expected:** Developers can browse the models their key can call, with capabilities and context size.
- **Code:** done. Evidence moved: apps/web/features/developers/components/DeveloperConsolePage.tsx:38; apps/web/shared/components/layout/AccountMenuItems.tsx:117 (quoted code not found in the file now)
- **Where to find it:** Developer console (/developers) > Reference > Models (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open /developers and scroll to the Reference card.
  2. Click Models. Check the page heading reads Models and a list of model cards appears.
  3. Open a model card and read its Context line and its capability chips.
  4. Click the Plan access filter 'In your plan' and check which models remain.

## S105.12 Prompt templates.

- **Expected:** Developers can save reusable prompt templates (with arguments) and invoke them.
- **Code:** done. Evidence present: apps/web/features/settings/components/CloudSettingsSync.tsx:210; apps/web/features/settings/components/CloudSettingsSync.tsx:224; apps/web/features/settings/components/CloudSettingsSync.tsx:303; apps/web/features/settings/lib/custom-commands-namespace.ts:52
- **Where to find it:** Settings > General > Custom commands > New command (labels found in the code)
- **Needs:** a signed-in account (commands sync to the account)
- **Steps:**
  1. Open Settings, click General, and scroll to Custom commands.
  2. Click New command. Type a Name (lower case, no spaces), a Description, and a Template that contains the input token.
  3. Click Create command and check it appears in the list.
  4. Click into the chat box, type / and the command name, add some text and send.
  5. Check the reply follows the template with your text in place of the input token.

## S105.18 Usage and cost dashboards.

- **Expected:** Developers can see usage and cost over time, broken down by model.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1451; apps/web/features/settings/sections/UsageSection.tsx:218 (quoted code not found in the file now); apps/web/app/api/usage/history/route.ts:63
- **Where to find it:** Settings > Usage > Where your usage went (labels found in the code)
- **Needs:** a paid plan (the history section is hidden on the Free plan)
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went and choose Days, Weeks or Months.
  3. Read the tables By product area, By model and By project for the chosen period.
  4. Compare: the By model table lists each model with its usage over time.

## S105.19 Rate-limit inspection.

- **Expected:** Developers can see their rate limits and how close they are to them.
- **Code:** done. Evidence present: apps/web/features/developers/components/RateLimitsPanel.tsx:27; apps/web/lib/developer-api/rate-limit-summary.ts:18; apps/web/features/developers/components/RequestPlayground.tsx:210
- **Where to find it:** Developer console (/developers) > Rate limits (labels found in the code)
- **Needs:** an AGI API key and any HTTP client, to see the per-response headers
- **Steps:**
  1. Open /developers and scroll to the Rate limits card.
  2. Read the list 'Request limits by endpoint': each row gives an endpoint, a number of requests per window, and whether it counts per account or per IP for an API key.
  3. Read the card text: each response carries X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset.
  4. Send a request with an AGI API key and read those headers to see how close you are to the limit. Compare with Expected.

## S105.20 Budget controls.

- **Expected:** An owner can set a spend cap that the API enforces.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:377; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:60 (quoted code not found in the file now); apps/web/app/api/settings/organization/spend-limit/route.ts:183
- **Where to find it:** Settings > Workspace > Workspace administration > Usage (Monthly spend limit); personal cap at Settings > Usage > Monthly spend limit (labels found in the code)
- **Needs:** a workspace owner or admin account for the workspace cap; a paid plan for the personal cap
- **Steps:**
  1. Open Settings, click Workspace, then Workspace administration, then Usage.
  2. Scroll to Monthly spend limit. Type an amount, set Spend limit enforcement to Block, and click Set limit.
  3. Check the card shows the cap you set and the enforcement choice.
  4. For a personal cap, open Settings > Usage and find Monthly spend limit; set and check it the same way.

## S105.21 Webhook configuration.

- **Expected:** Developers can register a webhook endpoint and choose which events it receives.
- **Code:** done. Evidence moved: apps/web/features/developers/components/WebhooksPanel.tsx:916; apps/web/app/api/developers/webhooks/route.ts:59; apps/web/lib/developer-api/webhook-signature.ts:15; apps/web/lib/services/developer-webhook-service.ts:119; apps/web/lib/services/developer-webhook-service.ts:420 (quoted code not found in the file now); apps/web/lib/services/developer-webhook-service.ts:339
- **Where to find it:** Developer console (/developers) > Webhooks > Add endpoint (labels found in the code)
- **Needs:** a paid account with API access, and an HTTPS address you control to receive events
- **Steps:**
  1. Open /developers, scroll to the Webhooks card and click Add endpoint.
  2. Type an https address in Endpoint URL and optionally a Description.
  3. Under Events, tick the events you want to receive.
  4. Click Add endpoint and read the Copy the signing secret now dialog.
  5. Check the new endpoint appears in the Webhook endpoints list.

## S105.22 Webhook event history.

- **Expected:** Developers can see a history of webhook deliveries with status and can redeliver.
- **Code:** done. Evidence present: apps/web/features/developers/components/WebhooksPanel.tsx:385; apps/web/features/developers/components/WebhooksPanel.tsx:404; apps/web/app/api/developers/webhooks/[endpointId]/deliveries/route.ts:25; apps/web/app/api/developers/webhooks/[endpointId]/deliveries/[deliveryId]/redeliver/route.ts:29; apps/web/lib/services/developer-webhook-service.ts:389
- **Where to find it:** Developer console (/developers) > Webhooks > endpoint row > Deliveries (labels found in the code)
- **Needs:** a registered endpoint that can receive HTTPS requests
- **Steps:**
  1. Open /developers, scroll to Webhooks, and make sure an endpoint is listed.
  2. Click Send test event on the endpoint, or use an event that already happened.
  3. Click Deliveries on the endpoint row and read Recent deliveries: each row shows a status such as Delivered, Failed or Retrying after N attempts.
  4. Click Resend on a delivery row and check its status updates.

## S105.23 SDK documentation.

- **Expected:** There is documentation for official client SDKs.
- **Code:** done. Evidence present: apps/web/app/api-docs/page.tsx:215; apps/web/app/api-docs/page.tsx:234; apps/web/app/api-docs/page.tsx:243
- **Where to find it:** API (site menu, apps/web/features/marketing/components/system/nav.ts) > SDKs. (labels found in the code)
- **Steps:**
  1. Open the API docs page (type /api-docs after the site address, or use the API entry in the site menu).
  2. Scroll to the section titled SDKs.
  3. Read it: it says there is no AGI SDK and that OpenAI's official libraries are the client.
  4. Look at the Python and TypeScript tabs under it and check they show example code for the gateway.
  5. Compare with Expected: the docs cover OpenAI's libraries, not a separate AGI SDK.

## S105.24 API reference.

- **Expected:** A published API reference documents every public endpoint, credential and scope.
- **Code:** done. Evidence present: apps/web/app/api-docs/page.tsx:388; apps/web/app/api/llm/v1/models/route.ts:225
- **Where to find it:** API docs page > Reference. > OpenAPI bundle (labels found in the code)
- **Steps:**
  1. Open the API docs page and scroll to the section titled Reference.
  2. Read the paragraph: the OpenAPI bundle describes every endpoint and the credential each one takes.
  3. Click OpenAPI bundle and check a JSON document opens.
  4. Scroll to the top, click Authentication and scopes, and read which credential each endpoint accepts.

## S105.25 Integration examples.

- **Expected:** Docs include copyable integration examples (curl, Python, TypeScript).
- **Code:** done. Evidence present: apps/web/app/api-docs/page.tsx:62; apps/web/app/api/llm/v1/models/route.ts:225
- **Where to find it:** API docs page > code tabs curl, Python, TypeScript (labels found in the code)
- **Steps:**
  1. Open the API docs page. The first example sits under the title 'One chat completion against the gateway'.
  2. Click the tabs curl, Python and TypeScript in turn and read each sample.
  3. Scroll to SDKs. and click the Python and TypeScript tabs there.
  4. Compare with Expected: each tab shows a copyable request to the gateway.

## S105.26 Migration guides.

- **Expected:** Developers get migration guides for API/model changes and from other providers.
- **Code:** done. Evidence moved: apps/web/app/api-docs/page.tsx:290 (quoted code not found in the file now); apps/web/app/api-docs/page.tsx:292; apps/web/app/api-docs/page.tsx:311; apps/web/app/api-docs/page.tsx:329
- **Where to find it:** API docs page > Moving to the gateway. > From the OpenAI API / From the Anthropic API / Between models (labels found in the code)
- **Steps:**
  1. Open the API docs page and scroll to Moving to the gateway.
  2. Read the three sub-headings: From the OpenAI API, From the Anthropic API and Between models.
  3. Open the text under From the Anthropic API and read the steps to change the client.
  4. Compare with Expected: there is a guide for each other provider and one for moving between models.

## S105.27 Deprecation notices.

- **Expected:** Developers are told ahead of time when a model or API is deprecated.
- **Code:** done. Evidence moved: apps/web/app/api-docs/page.tsx:352 (quoted code not found in the file now); apps/web/app/api-docs/page.tsx:358
- **Where to find it:** API docs page > Deprecations. ; model cards on Developer console > Reference > Models (labels found in the code)
- **Steps:**
  1. Open the API docs page and scroll to Deprecations.
  2. Read the text: each model carries a deprecation date, which is empty until a retirement is scheduled.
  3. Read the table Scheduled model retirements if it appears; otherwise the page says No model retirements are scheduled.
  4. Open /developers > Reference > Models and look for a model marked Retiring with a date.
  5. Compare with Expected: retirements appear in advance with a date.

## S105.28 Developer support.

- **Expected:** Developers have a support channel (tickets or contact) reachable from the product.
- **Code:** done. Evidence moved: apps/web/app/support/page.tsx:105; apps/web/features/support/lib/ticket-client.ts:1 (quoted code not found in the file now)
- **Where to find it:** Settings > Help > Contact support, then Settings > Help > Your support tickets > Raise ticket (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and click Help.
  2. Click Contact support to open the support page and read the Raise a ticket button there.
  3. Back in Help, scroll to Your support tickets and fill in Subject and What happened.
  4. Click Raise ticket and check the new ticket appears in the list with its Raised date and priority.

## S105.29 Custom app/Plugin testing.

- **Expected:** A developer can load an unpublished custom plugin into their own account to try it.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/DirectoryPanel.tsx:1031; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1193 (quoted code not found in the file now); apps/web/app/api/plugins/uploads/route.ts:32
- **Where to find it:** Settings > Plugins > Add > Upload plugin (labels found in the code)
- **Needs:** a plugin .zip file with a skills folder (a manifest folder is optional)
- **Steps:**
  1. Open Settings and click Plugins.
  2. Click Add, then Upload plugin.
  3. Choose a .zip of a plugin that has a skills folder, and submit the dialog.
  4. Check the plugin shows under Installed and can be opened.

## S105.30 Publishing workflow.

- **Expected:** A developer can submit a plugin/app for review and publish versions to users.
- **Code:** done. Evidence present: apps/web/app/api/plugins/submissions/route.ts:49; apps/web/lib/services/plugin-submission-service.ts:169; apps/web/app/api/admin/plugin-submissions/[id]/route.ts:79; apps/web/features/admin/pages/PluginModerationPage.tsx:804; apps/web/features/directory/services/plugins-directory.ts:1320
- **Where to find it:** Settings > Plugins > open your plugin > Submit to the directory (labels found in the code)
- **Needs:** a plugin you created; an admin must approve it in the plugin moderation page before it is listed
- **Steps:**
  1. Open Settings, click Plugins, and open a plugin you created.
  2. Click Submit to the directory.
  3. Read the confirmation text and click Submit for review.
  4. Check the plugin shows a pending submission with a Withdraw action.
