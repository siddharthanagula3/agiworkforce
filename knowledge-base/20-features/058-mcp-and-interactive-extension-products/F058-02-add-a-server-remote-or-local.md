---
id: "F058-02"
type: "feature"
title: "Add a server (remote or local)"
aliases: ["Add custom connector", "Add custom MCP connector", "Add custom MCP", "agi mcp add", "/mcp add", "Add an MCP server (VS Code)", "Remote MCP server URL", "S58.02", "S58.03", "S58.16", "S58.27"]
area: "58 MCP and interactive extension products"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S58.02", "S58.03", "S58.16", "S58.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "plan:free", "plan:basic", "plan:premium", "plan:max", "plan:ultra", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "F058-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-02 Add a server (remote or local)

Lets a person connect a new MCP server. Web and mobile add a remote server by https address through one cloud route. The CLI and VS Code register a local command or a remote URL in a local registry. Web add is refused today because connectors are marked coming soon.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.02](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5802), [S58.03](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5803), [S58.16](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5816), [S58.27](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5827).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Creates a saved MCP server entry. On web, desktop and mobile it posts name, address and optional credentials to the cloud route, which checks policy and plan, probes the server, encrypts any token and stores a row. On CLI and VS Code it writes an entry to the local registry file. (apps/web/lib/connectors/custom-connector-creation.ts:63-170; apps/cli/src/installs.rs:27-66)

**Why it exists.** The assistant can only use tools from servers the person has connected, and the directory cannot list every server. [inferred]

**Who uses it.** Developers and power users who run or own an MCP server; admins who want to forbid it use the organization policy. [inferred]

**Problems it solves**

- Using a private or in-house MCP server in chat.
- Connecting from any app without editing config files (web, mobile).
- Local stdio servers on a developer's machine (CLI, VS Code).

**Use cases**

- Paste https://mcp.example.com/mcp with a token in web Settings.
- Run agi mcp add docs --command node --arg server.js.
- Add a remote SSE server from the VS Code picker.
- Mobile user adds a server by URL and an optional auth token.

## 2. User experience

**Where to find it**

- Web: Settings modal > Connectors > Add menu 'Add' > 'Add custom connector'; the button is shown only when connectors are released and the plan is not locked (packages/ui/ui/src/settings-modal/SettingsModal.tsx:57,2241; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1281). Desktop (public) shows the same hosted screen.
- Tauri desktop: Settings > Connectors: cloud adapter exposes addCustomConnector (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:973), and ConnectorGallery has a dialog titled 'Add custom connector' that saves a local server (apps/desktop/src/features/connectors/CustomRemoteMcpConnectorDialog.tsx:187).
- Mobile: Settings > Connectors > button 'Add custom MCP' (accessibility label 'Add custom MCP connector'); sheet 'Add custom MCP connector' (apps/mobile/src/features/settings/cloud-connectors/index.tsx:981-1000; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:161).
- CLI: agi mcp add <name> (--command ... | --url ...), or in a session /mcp add <name> <url> (apps/cli/src/lib.rs:2128-2156; apps/cli/src/repl/registry.rs:1568-1640).
- VS Code: server picker item 'Add an MCP server', or the 'mcpAddServer' button in the settings panel (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:793; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:2102).
- Chrome: no MCP add flow found.

**Before you start**

- Web, Desktop, mobile: signed in; plan that allows custom servers (Free has 0) (packages/contracts/types/src/billing-catalog.ts:621); organization allowCustomConnectors on; connectors released (apps/web/lib/services/connector-policy-gate.ts:146-153).
- Mobile: Cloud mode.
- CLI and VS Code: the CLI installed; stdio command must exist on the machine.

**Screens and controls**

- Web dialog: fields Name (placeholder 'My connector'), Remote MCP server URL (placeholder https://example.com/mcp), token field (placeholder 'Token is encrypted before storage'), OAuth client fields, optional JSON import 'MCP server JSON config' (packages/ui/ui/src/settings-modal/SettingsModal.tsx:640-800).
- Mobile sheet: 'Connector name', 'Connector URL', 'Auth token (optional)', Cancel, Add; hint 'Use an address that starts with https://.' (apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:27,170-226).
- Tauri dialog: name, URL (http or https), advanced: bearer token, headers JSON, OAuth client id and secret, timeout, verify SSL (apps/desktop/src/features/connectors/CustomRemoteMcpConnectorDialog.tsx:92-310).
- VS Code prompts: name, choose 'Local command' / 'Remote server over HTTP' / 'Remote server over SSE', command or URL, env or header values, then a confirmation naming the consequence (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:566-668).

**Journey**

1. Open the add control for your app.
2. Enter name and address (command for local).
3. Optionally enter a token or OAuth client.
4. Submit.
5. Web: server probes the endpoint; if sign-in is needed the OAuth sign-in opens; if sign-in fails and no client was given, the new row is deleted and a hint is shown (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1062-1118).
6. The new server appears in the list; open it to see tools (F058-01).

**What the person sees and gets**

- Web success: HTTP 201 with connector, signInRequired, toolCount, capabilityCounts, protocolEra (apps/web/app/api/connectors/custom/route.ts:145-173).
- Errors are user-safe text: 'Connectors are coming soon.', plan limit text, 'You already have a custom connector for this URL.', 'Failed to connect to MCP server: ...' (apps/web/lib/connectors/custom-connector-creation.ts:120-128; apps/web/lib/connectors/mcp-custom-connections.ts:45).
- CLI: "Registered MCP server '<name>' in <path>." (apps/cli/src/lib.rs:5142-5147).
- VS Code: confirmation dialog then refreshed list.

**Settings**

- Organization policy allowCustomConnectors (apps/web/lib/services/connector-policy-service.ts:56).
- CLI --force replaces an existing entry; --transport http|sse; --header; --env (apps/cli/src/lib.rs:2128-2156).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web POST /api/connectors/custom: CSRF, rate limit, workspace access gate, policy gate before the body is read, then create; 201 on success; invalid JSON gives a validation error (apps/web/app/api/connectors/custom/route.ts:83-173).
- Create validates name (1 to 200 chars), https URL resolving to a public host, no embedded credentials, token length, OAuth client rules, plan capacity, probes the server, checks tool cap, seals the credential, inserts, writes an audit event (apps/web/lib/connectors/custom-connector-creation.ts:63-170; apps/web/lib/mcp-url-validation.ts:6-28).
- Mobile add modal posts name, url, authToken via the shared runtime (apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:109; apps/mobile/services/connectors.ts:183).
- CLI agi mcp add supports stdio command with args and env, and remote url with http or sse and headers; names and URLs are validated before writing (apps/cli/src/lib.rs:5101-5147; apps/cli/src/mcp/registry.rs:358-370).
- CLI accepts http:// and https:// URLs with any host, so a server on localhost or a private address can be registered (apps/cli/src/mcp/registry.rs:358-370).
- VS Code add flow calls mcp/add on the CLI app server (apps/extension-vscode/src/integrations/localRuntimeClient.ts:2241; apps/cli/src/app_server/surfaces.rs:1109).
- Tauri dialog writes a local http server entry through McpClient.updateConfig and stores the bearer token as an API key (apps/desktop/src/features/connectors/CustomRemoteMcpConnectorDialog.tsx:160-175).

**Incomplete**

- Web add has no way to enter headers or environment variables; only token or OAuth client.
- Private-network reach: web requires a public https host (apps/web/lib/mcp-url-validation.ts:6-28); no tunnel or relay route was found in the CLI either; only direct http access (searched apps/cli/src/mcp and lib.rs for 'private network', 'tunnel', 'relay' with no hit).
- Developer-mode flow: no distinct developer mode found; the CLI simply accepts localhost URLs (apps/cli/src/mcp/registry.rs:358-370).

**Present but disconnected or switched off**

- Web, Desktop (hosted) and mobile add are refused with 403 'Connectors are coming soon.' while the release state is coming_soon (apps/web/lib/services/connector-policy-gate.ts:146-153; apps/web/app/api/connectors/custom/route.test.ts:350-370). The web add button is also not offered (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1281).

**Not available**

- Chrome extension: no add flow.
- Brief says VS Code add is missing; the code has it (see gaps).

## 4. Required behaviour

**Established requirements**

- The user can register a local (stdio) server that the product starts (CLI done; VS Code listed missing). (source: brief S58.02)
- The user can add a remote MCP server by URL with optional credentials and it becomes available to the assistant. (source: brief S58.03)
- Where offered, an MCP server on a private network can be reached through a supported route (CLI done; web, desktop, mobile, chrome missing). (source: brief S58.16)
- A developer can connect an in-development server such as localhost through a developer-mode flow (CLI done). (source: brief S58.27)
- The web add route checks CSRF, rate limit, workspace access and allowCustomConnectors before reading the body; a refused request writes nothing. (source: apps/web/app/api/connectors/custom/route.ts:83-117 (code comment and order))
- Never route Local data silently to cloud; consent and visible label required for crossing. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. On a plan with room and connectors released, posting a valid https URL returns 201 with toolCount.
2. A free plan gets a refusal naming the plan before any network call.
3. A request with a private IP URL is refused as 'targets a private or unsafe network address'.
4. With allowCustomConnectors off for the workspace, the request returns 403 and no row is written.
5. Adding the same URL twice is refused with 'You already have a custom connector for this URL.'
6. A token and OAuth client id together are refused.
7. agi mcp add with --command writes the entry and agi mcp list shows it as enabled.
8. A bad JSON body returns a validation error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Brief 'done' for web, desktop and mobile add describes the code, not live behaviour, because release state blocks it. [inferred]
- VS Code add exists, so brief status 'missing' is out of date. [inferred from apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:566]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Provide a safe private-network route (agent on the user's network) for cloud users; today web refuses private hosts by design.
- [proposed] Add header and environment entry to the mobile and web add flows to match CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/connectors/custom | `apps/web/app/api/connectors/custom/route.ts` | Add route with CSRF, rate limit, access gate, policy gate. |
| service | createCustomConnector | `apps/web/lib/connectors/custom-connector-creation.ts` | Validation, probe, capacity checks, sealing, insert, audit. |
| service | validateHttpsMcpUrl | `apps/web/lib/mcp-url-validation.ts` | Requires https, public host, no embedded credentials. |
| service | mcp-custom-connections | `apps/web/lib/connectors/mcp-custom-connections.ts` | Probe, capacity checks, short id, insert row. |
| service | custom-connector-crypto | `apps/web/lib/custom-connector-crypto.ts` | Seals the bearer credential before storage. |
| service | connector-policy-gate | `apps/web/lib/services/connector-policy-gate.ts` | Release, plan, kill switch and workspace policy decision. |
| config | connector-release | `packages/contracts/types/src/connector-release.ts` | Release state and selective list. |
| config | billing-catalog limits | `packages/contracts/types/src/billing-catalog.ts` | customMcpServers and maxConnectorTools per plan. |
| hook | addCustomConnector (web) | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Posts to the route, starts sign-in, rolls back the row on sign-in failure. |
| component | SettingsModal add dialog | `packages/ui/ui/src/settings-modal/SettingsModal.tsx` | Shared add dialog fields and JSON import. |
| service | createCustomConnector (desktop api) | `apps/desktop/src/api/cloudConnectors.ts` | Tauri cloud client for the same route. |
| component | CustomRemoteMcpConnectorDialog | `apps/desktop/src/features/connectors/CustomRemoteMcpConnectorDialog.tsx` | Tauri dialog that saves a local remote server. |
| component | AddCustomConnectorModal | `apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx` | Mobile add sheet. |
| service | addCustomConnector (mobile) | `apps/mobile/services/connectors.ts` | Mobile call into the shared connector runtime. |
| command | McpSubcommand::Add | `apps/cli/src/lib.rs` | agi mcp add flags and handler. |
| service | add_mcp_server | `apps/cli/src/installs.rs` | Builds entry, writes env and headers, sets file mode 0600 on unix. |
| service | McpRegistry | `apps/cli/src/mcp/registry.rs` | Registry file, validation, enable and disable. |
| command | /mcp add | `apps/cli/src/repl/registry.rs` | In-session add and reconfigure. |
| service | add_mcp_server (app server) | `apps/cli/src/app_server/surfaces.rs` | mcp/add request handler for VS Code. |
| component | addMcpServer (VS Code) | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Guided prompts and confirmation. |
| table | user_custom_connectors | `apps/web/lib/connectors/mcp-custom-connections.ts` | Row store for custom connectors (name seen in a query). |
| service | recordAuditEvent connector_added | `apps/web/lib/connectors/custom-connector-creation.ts` | Audit record of the add. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends POST with name, url, optional authToken or OAuth client id and secret and the CSRF header. | device | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1062-1090 |
| Route checks CSRF, rate limit, workspace access gate and the connector policy (including allowCustomConnectors) before parsing the body. | our servers | apps/web/app/api/connectors/custom/route.ts:83-117 |
| Create step validates input, plan capacity and URL, checks policy for that host, then probes the server over MCP. | our servers | apps/web/lib/connectors/custom-connector-creation.ts:63-135 |
| The MCP server answers the probe (tool and capability counts). | outside service | apps/web/lib/connectors/custom-connector-creation.ts:114-120 |
| A row is inserted with the sealed credential; an audit event is recorded; the external resource is recorded best effort. | our servers | apps/web/lib/connectors/custom-connector-creation.ts:137-165; apps/web/app/api/connectors/custom/route.ts:127-143 |
| If sign-in is required the client opens the OAuth start route and the provider consent page. | device and our servers | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:728-760 |
| CLI path: the command validates the name and URL or command, edits ~/.agiworkforce/mcp.json atomically and prints the path; nothing leaves the device. | device | apps/cli/src/installs.rs:27-66; apps/cli/src/mcp/registry.rs:299-340 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Custom connector row with encrypted token and optional OAuth client | table:user_custom_connectors | yes, one cloud row for all cloud apps | Deleted by DELETE /api/connectors/custom, which also revokes the OAuth grant, clears tool permissions and evicts caches (apps/web/app/api/connectors/custom/route.ts:177-224) |
| Audit event connector_added | security audit log (table name not traced) | server only | unknown |
| CLI registry entry including env and headers | ~/.agiworkforce/mcp.json on the device, mode 0600 on unix when it holds env or headers (apps/cli/src/installs.rs:58-64) | no | Removed by agi mcp remove |

**Models and providers.** No model or provider takes part in adding a server. After adding, any model with tool use can call its tools; plan caps limit the number of tools (apps/web/lib/connectors/mcp-custom-connections.ts:227-239).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud add needs a signed-in account and a confirmed email (apps/web/lib/services/connector-policy-gate.ts:132-135). CLI and VS Code add need no account in the code read. |
| Permissions | Workspace policy allowCustomConnectors and host rules can refuse (apps/web/lib/services/connector-policy-gate.ts:196-212; apps/web/app/api/connectors/custom/route.ts:96-117). VS Code asks for confirmation and names what runs with the user's permissions (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:604-625). |
| Subscription | Custom servers per plan from the catalog: Free 0, Basic 5, Premium 25, Max unlimited, Ultra unlimited, Team 25, Enterprise set by contract; connector tools per server: Free 0, Basic 50, Premium 150, Max 300, Ultra 500, Team 150 (packages/contracts/types/src/billing-catalog.ts:586-722 (limits blocks), labels at :193-228). |
| Limits and metering | Route rate limit bucket 'chat-conversation'; connection timeout 30 seconds; name 200 chars; token 4096 chars; OAuth secret 4096 chars (apps/web/lib/connectors/custom-connector-creation.ts:26-30). A database function assert_user_resource_limit('custom_connectors') is checked at insert (apps/web/app/api/connectors/custom/route.test.ts:222). |
| Feature flags | Release state coming_soon; canUseConnectors kill switch (packages/contracts/types/src/connector-release.ts:14; apps/web/lib/connectors/connector-capability.ts:34-45). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code for adding; URL must be a public https host on cloud (apps/web/lib/mcp-url-validation.ts). |
| Local mode | CLI, VS Code and Tauri local dialog work on the device with no cloud call. Mobile in Local mode cannot add a cloud connector (Cloud mode required). Own-key mode: whether a Bring-your-own-key plan row gets cloud connectors is unknown; the catalog shows unlimited custom servers for local-only and byok rows (packages/contracts/types/src/billing-catalog.ts:587,604) but the gate was not traced for them. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| validation error | Name missing or too long, non-https, private address, credentials in URL, token too long, OAuth secret without id, token plus OAuth client together all return validation errors. | apps/web/lib/connectors/custom-connector-creation.ts:66-110 |
| duplicate url | Message 'You already have a custom connector for this URL.' | apps/web/lib/connectors/mcp-custom-connections.ts:45 |
| server unreachable or edge blocked | 503 'Failed to connect to MCP server: ...' or an edge-blocked message; a server that answers an auth challenge is still saved with sign-in required. | apps/web/lib/connectors/custom-connector-creation.ts:120-133 |
| sign-in fails after add | The new row is deleted and a hint to supply an OAuth client is shown unless a client id was given. | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1098-1117 |
| mobile bad url | Inline reason 'Use an address that starts with https://.' | apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:27-33 |
| account switched during add | Mobile drops the result if the account scope changed. | apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:109-118 |
| overwrite | CLI needs --force; VS Code shows a modal 'Replace the MCP server' warning. | apps/cli/src/lib.rs:2153; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:576-588 |
| cancel | VS Code returns without change if any prompt is dismissed; mobile Cancel button. | apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:572-575 |
| offline or retry | not handled in the code beyond showing the error; the user retries by submitting again. | not found in files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/custom/route.test.ts`: Free plan refused before network work; Premium (catalog 'pro') limit used; directory linkage; revocation on delete; refusal as coming soon with no server contact and no write.
- `apps/web/lib/connectors/__tests__/mcp-custom-connections.test.ts`: Custom connection helpers (contents not read).
- `apps/web/lib/connectors/__tests__/custom-connector-credential.test.ts`: Credential sealing (contents not read).
- `apps/mobile/__tests__/custom-connector.test.ts`: Mobile custom connector (contents not read).
- `apps/mobile/__tests__/CustomConnectorAccountIsolation.test.tsx`: Account isolation of the add form (contents not read).
- `apps/desktop/src/features/connectors/__tests__/CustomRemoteMcpConnectorDialog.test.tsx`: Tauri dialog (contents not read).
- `apps/desktop/src/api/__tests__/cloudConnectors.test.ts`: Tauri cloud client (contents not read).
- `apps/cli/src/mcp/registry.rs`: Nine unit tests including URL validation (apps/cli/src/mcp/registry.rs:643-662).
- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Release gating (contents not read).

**Test scenarios**

- **Add refused while coming soon**
  1. Sign in on a paid plan on web.
  2. POST a valid body to /api/connectors/custom with a CSRF token.
  - Expected: 403 'Connectors are coming soon.'; no row written.
- **Add succeeds when released**
  1. Release connectors in a test environment.
  2. Add https://<public mcp server> with a token.
  - Expected: 201 with toolCount; row visible in the list; token never returned.
- **Policy refusal**
  1. Turn allowCustomConnectors off for the workspace.
  2. Post an add request.
  - Expected: 403 with the policy reason; no row.
- **Private address**
  1. Post url https://10.0.0.5/mcp.
  - Expected: Validation error 'targets a private or unsafe network address'.
- **CLI local server**
  1. agi mcp add demo --command <server> --arg <file>
  2. agi mcp list
  - Expected: Entry shown as enabled, kind stdio.
- **VS Code add**
  1. Open MCP servers picker > Add an MCP server; choose Remote over HTTP; enter URL and confirm.
  - Expected: Server appears in the list with scope user.

**Where to look when it fails**

- Error text strings above; audit event type connector_added or connector_removed.
- Log '[connectors] the custom connector server was not recorded' (apps/web/app/api/connectors/custom/route.ts:139).
- Table user_custom_connectors; CLI file ~/.agiworkforce/mcp.json.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md)
- Desktop: [70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md)
- Mobile: [70-qa/test-plans/mobile/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/mobile/058-mcp-and-interactive-extension-products.md)
- CLI: [70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md)
- VS Code: [70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **Cloud add is switched off by release state, so web, Desktop and mobile users cannot add a server today.** Affects: Web, Desktop (hosted), mobile. Evidence: packages/contracts/types/src/connector-release.ts:14; apps/web/app/api/connectors/custom/route.test.ts:350-370. Work needed: Release decision.
- **Brief says VS Code add is missing; the code has it.** Affects: Brief accuracy; VS Code users have the feature. Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:566-668. Work needed: Update the brief and the status.
- **No private-network or tunnel route exists for cloud users; brief marks CLI done but the CLI only accepts direct http addresses and no distinct route was found.** Affects: Web, Desktop, mobile, Chrome; CLI claim. Evidence: apps/web/lib/mcp-url-validation.ts:6-28; apps/cli/src/mcp/registry.rs:358-370. Work needed: Define the supported route, then build it, or correct the brief.
- **No developer-mode flow found as a distinct flow.** Affects: Developers on all apps. Evidence: no match for 'developer mode' in apps/cli/src/mcp or apps/cli/src/lib.rs. Work needed: Define the flow or correct the brief.
- **Web and mobile cannot add request headers or environment variables.** Affects: Web, mobile. Evidence: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1062-1075; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:109. Work needed: Design fields; store encrypted.
- **Chrome extension has no add flow (brief: private-network route missing).** Affects: Chrome. Evidence: no MCP code found in apps/extension. Work needed: Decide whether Chrome needs one.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- plan:free
- plan:basic
- plan:premium
- plan:max
- plan:ultra
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- F058-03

## Unknown

- Where the audit event is stored (table name).
- Whether Bring-your-own-key (own-key) users get cloud connectors; the gate for that plan row was not traced.
- Whether the mobile add call goes through any extra mobile-side policy check before the route (shared runtime not read).
- Contents of tests other than the custom route test.
- Whether the Tauri desktop local dialog is reachable in a shipped build; AGENTS.md says Tauri is retained internal code.
- No docs/product or docs/decisions page was read.
