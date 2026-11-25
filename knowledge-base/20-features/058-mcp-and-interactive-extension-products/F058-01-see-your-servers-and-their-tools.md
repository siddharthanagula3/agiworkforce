---
id: "F058-01"
type: "feature"
title: "See your servers and their tools"
aliases: ["MCP server list", "Connected connectors", "Custom connectors list", "Capability inspector", "Live MCP capabilities", "/mcp info", "agi mcp list / get", "MCP servers (VS Code)", "Tool Management > Connected Tools (Tauri desktop)", "S58.01", "S58.08", "S58.11", "S58.28"]
area: "58 MCP and interactive extension products"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S58.01", "S58.08", "S58.11", "S58.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-api-and-contracts", "api:GET /api/connectors/custom", "api:GET /api/connectors/[connectorId]/capabilities", "table:user_custom_connectors", "file:packages/contracts/cloud-contracts/src/connector-capabilities.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-01 See your servers and their tools

Shows the MCP servers a person has connected, what tools each offers, the protocol version, transport, server name and version, and compatibility notices. Web reads one catalog route. CLI and VS Code show a text report. Mobile shows tools only. The Tauri desktop shows local servers; its cloud connector list has no inspector.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.01](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5801), [S58.08](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5808), [S58.11](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5811), [S58.28](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5828).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists configured MCP servers and, for one server, shows its tools (with parameters and risk tier), resources, prompts, apps, protocol, transport, server identity and any compatibility warning or partly failed discovery. (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:56-119; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:45)

**Why it exists.** A person needs to see what an assistant can do through a server before trusting it, and to learn why a server shows fewer tools than expected (rejected tool names, old handshake, deprecated transport). The panel's own copy says this (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:19-35).

**Who uses it.** Anyone who connects an MCP server: web and Desktop (hosted web app) users, mobile users in Cloud mode, developers using the CLI or VS Code, and workspace admins checking what members connect. [inferred]

**Problems it solves**

- No way to tell what a connected server offers.
- Silent loss of tools whose names or schemas the product refuses (rejectedTools list) (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:85).
- Old or deprecated protocol and transport are explained instead of failing silently (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:25-30).

**Use cases**

- Web user opens a custom connector and reads its tool list and protocol line.
- Developer runs agi mcp get docs to see the server name and its tools.
- VS Code user clicks the info button on a server to read protocol, capabilities, instructions and recent output.
- Mobile user opens a connector to see its tools and set tool permissions.

## 2. User experience

**Where to find it**

- Web: Settings modal > Connectors; open a connected connector; the detail footer shows the panel with label 'Live MCP capabilities' (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1191; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:213). Desktop (public) shows the hosted web app, so it gets the same screen (doc: AGENTS.md section 5).
- Tauri desktop (internal build): Settings > Connectors tab shows the cloud connector gallery and a 'Tool Management' workspace with tabs Servers, Bundle Registry, Tools, Credentials, Configuration; 'Connected Tools' lists local servers (apps/desktop/src/features/settings/tabs/Connectors/index.tsx:10; apps/desktop/src/features/mcp/MCPWorkspace.tsx:80).
- Mobile: Settings > Connectors (screen title 'Connectors'); tap a connector; the 'Tool permissions' section lists its tools (apps/mobile/src/features/settings/cloud-connectors/index.tsx:832; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1024).
- CLI: agi mcp list, agi mcp get <name>, and in a session /mcp list, /mcp tools [server], /mcp info <server> (apps/cli/src/lib.rs:5149; apps/cli/src/repl/registry.rs:1568-1710).
- VS Code: command surface 'MCP servers' picker; the info button opens a read-only document with the report (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:770; apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:31).
- Chrome: not applicable; no MCP server list was found in apps/extension.

**Before you start**

- Web, mobile and Tauri cloud list: signed in to a cloud account (apps/mobile/src/features/settings/cloud-connectors/index.tsx:809-818).
- Web custom connectors currently need connectors to be released; the release constant is 'coming_soon' (packages/contracts/types/src/connector-release.ts:14), so custom connector capabilities answer 404 today (apps/web/lib/user-connector-tools.ts:2083).
- Mobile: Cloud mode must be active (apps/mobile/src/features/settings/cloud-connectors/index.tsx:429).
- CLI and VS Code: the local agi command line; VS Code needs a CLI that offers the inspect capability (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:776-777).

**Screens and controls**

- Web panel chips: protocol label ('MCP <version>', 'MCP stateless' or 'MCP initialize handshake'), 'Tasks', '<n> App(s)'; groups Tools, Resources, Templates, Prompts; click a tool to open a detail with parameters ('required'/'optional'); 'Close'; 'Compatibility' section with Protocol, Server supports, Transport, Server rows; 'Retry discovery' button (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:30-60, 213-378).
- Mobile: 'Loading tools...', 'Could not load the tool list' with 'Try again', per-tool permission rows, 'Recent calls', health card (apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1030-1175).
- CLI get prints name, status, transport, target, file, rules, then connects (20 second limit) and prints server identity, 'about', and 'Tools (n):' (apps/cli/src/lib.rs:5192-5310).
- VS Code details: Health, Connection (live/probe), Protocol, Server, Capabilities, error, 'checked at', Instructions, Output (apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:31-63).

**Journey**

1. Open the surface for your app (see where_to_find_it).
2. See the list of servers; on web and mobile the list is the connected connectors.
3. Open one server.
4. The app asks the server what it offers (web: GET capabilities route; CLI: connect then list tools; VS Code: mcp/inspect request).
5. Read tools, protocol and compatibility notes.
6. If discovery failed or is partial, use 'Retry discovery' (web) or 'Try again' (mobile) or re-run the command (CLI).

**What the person sees and gets**

- Web: loading text 'Discovering live MCP capabilities…'; error text 'Live capabilities could not be loaded.'; empty text 'This connector answered but offers no tools, resources or prompts yet...'; partial text 'Unavailable during discovery: <names>.' (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:19-27, 170-180, 365-376).
- CLI: 'could not connect: <error>' or 'did not answer within 20 seconds', 'It offers no tools.' (apps/cli/src/lib.rs:5262-5300).
- VS Code: 'Not reported' for missing fields, 'No output from this server yet' style text from translation keys (apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:31-63).

**Settings**

- Web: 'Use in chats' switch beside the panel decides if the connector is usable in chats (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:89-93); see F058-05.
- CLI: --mcp-config and --strict-mcp-config choose which config files are read (apps/cli/src/lib.rs:402-407).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web list route GET /api/connectors/custom returns the user's custom connectors with signedIn flag and directory link (apps/web/app/api/connectors/custom/route.ts:50-78).
- Web capabilities route returns protocolEra, protocolVersion, supportedVersions, transport, serverInfo, capabilityKeys, tasksSupported, rejectedTools, tools (name, title, description, parameters, visibility, hasApp, readOnly, riskTier), resources, resourceTemplates, prompts, apps, discoveryErrors; 404 for an unknown connector, 503 'Connector is temporarily unreachable' when the catalog has no entry for it (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:56-119).
- Web panel renders protocol label, transport label, server name and version, legacy handshake notice, deprecated transport notice, rejected tool notices (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:45-95).
- Web client caches a catalog for 30 seconds and validates it with a schema (apps/web/features/connectors/hooks/use-connector-capabilities.ts:12-40).
- Mobile fetches the same route and validates it, and shows tools grouped by category (apps/mobile/services/connectors.ts:241-249; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:388-410).
- CLI agi mcp list/get and /mcp list/tools/info/logs work against the registry and live session (apps/cli/src/lib.rs:5149-5310; apps/cli/src/repl/registry.rs:1687-1760).
- VS Code picker lists servers with status, transport and scope, and shows tools, prompts, resources and a details document (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:670-870).
- Tauri desktop lists local servers through the mcp_list_servers command (apps/desktop/src-tauri/src/sys/commands/mcp.rs:781).

**Incomplete**

- Mobile shows tools only; protocol, transport, resources, prompts, apps and rejected tools from the catalog are not rendered (apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1123; search of catalog usage found only tools).
- CLI get and /mcp info show protocol version and capability names but not resources, prompts, rejected tools or supported-version diagnostics (apps/cli/src/lib.rs:5192-5310; apps/cli/src/repl/registry.rs:1714-1760).
- VS Code report shows protocol and capability names only; no compatibility warnings (apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:31-63).
- Tauri desktop cloud connector list has no capability panel; ConnectorCapabilitiesPanel is used only by the web adapter (found by search of apps/desktop/src and apps/web).

**Present but disconnected or switched off**

- On web, custom connector capabilities are switched off while connectors are 'coming_soon': the loader returns null for any id not in the selective list, so the route answers 404 (packages/contracts/types/src/connector-release.ts:14-33; apps/web/lib/user-connector-tools.ts:2083). Thirteen directory connectors are selectively released (packages/contracts/types/src/connector-release.ts:16-30).

**Not available**

- Chrome extension: no MCP server list found.
- Plan cap display: no UI element that shows the number of allowed custom connectors was found; the cap is only in server error text (apps/web/lib/services/free-plan-entitlements.ts:69-82).

## 4. Required behaviour

**Established requirements**

- The user can see a list of the MCP servers configured for their account or workspace, on web, desktop, mobile, CLI and VS Code. (source: brief S58.01)
- Connecting a server discovers its tools and the user can see them (web, desktop, mobile, CLI, VS Code). (source: brief S58.08)
- The user can inspect protocol, tools, resources, prompts and extensions; brief marks mobile as missing. (source: brief S58.11)
- The product reports protocol or schema version mismatches or partial compatibility; web and desktop done, mobile, CLI, VS Code missing. (source: brief S58.28)
- Shared UI must not assume one surface's routing or billing model. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. With one connected custom server that supports tools, the web panel lists every tool the server published except app-only tools.
2. A server on the old handshake shows the legacy handshake notice; a server on the deprecated SSE transport shows the transport notice.
3. A tool with a name the model cannot call appears in a rejected notice and not in Tools.
4. An unknown connector id returns 404; an unreachable one returns 503 with 'Connector is temporarily unreachable'.
5. Mobile detail shows the same tool set as the web panel for the same connector.
6. CLI agi mcp get prints identity and tools within 20 seconds or a clear failure line.
7. With no servers, each app shows its empty text and no error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile and CLI should show the same compatibility facts the route already returns; the data exists on the client for mobile (apps/mobile/services/connectors.ts:241).
- The brief's 'done' for desktop applies to the hosted web app in Electron, not the Tauri build. [inferred from doc: AGENTS.md section 5]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Render protocolEra, transport, rejectedTools and discoveryErrors on mobile from the data it already fetches.
- [proposed] Show the plan's custom connector cap next to the list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/connectors/custom | `apps/web/app/api/connectors/custom/route.ts` | Lists the user's custom connectors with signedIn and directoryId. |
| endpoint | GET /api/connectors/[connectorId]/capabilities | `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts` | Returns the capability catalog of one connected server. |
| service | loadUserConnectorCapabilityCatalog | `apps/web/lib/user-connector-tools.ts` | Finds the server (github, custom, organization, operator) and builds the catalog; returns null when not released. |
| schema | ConnectorCapabilityCatalogSchema | `packages/contracts/cloud-contracts/src/connector-capabilities.ts` | Shared shape of the catalog used by web and mobile. |
| hook | useConnectorCapabilities | `apps/web/features/connectors/hooks/use-connector-capabilities.ts` | Fetches, validates and caches the catalog for 30 seconds. |
| component | ConnectorCapabilitiesPanel | `apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx` | Web panel with tools, compatibility and retry. |
| hook | useConnectorsSettingsAdapter | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Mounts the panel in the connector detail footer; merges custom connectors into the list. |
| component | SettingsModal | `packages/ui/ui/src/settings-modal/SettingsModal.tsx` | Shared settings modal that hosts the connectors list for web and the Tauri desktop. |
| service | fetchConnectorCapabilities | `apps/mobile/services/connectors.ts` | Mobile client call for the catalog. |
| screen | ConnectorDetailScreen | `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Mobile detail with tool permissions, call log and health. |
| screen | Cloud connectors page | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list of connectors. |
| command | agi mcp list / get | `apps/cli/src/lib.rs` | Registry listing and one-server inspection from the shell. |
| command | /mcp list/tools/info/logs | `apps/cli/src/repl/registry.rs` | In-session inspection of the live servers. |
| service | inspect_connection | `apps/cli/src/app_server/surfaces.rs` | Builds the inspect report (protocol version, capabilities, instructions, logs) used by the CLI and VS Code. |
| component | manageMcpServers | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | VS Code server picker with info, tools and test actions. |
| component | renderMcpServerDetails | `apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts` | Builds the VS Code details document. |
| component | MCPWorkspace | `apps/desktop/src/features/mcp/MCPWorkspace.tsx` | Tauri local server workspace (Servers, Tools, Credentials, Configuration). |
| command | mcp_list_servers | `apps/desktop/src-tauri/src/sys/commands/mcp.rs` | Tauri command that lists local servers. |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Release switch that currently hides custom connectors. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web or mobile client calls GET /api/connectors/<id>/capabilities with the user's session. | device and our servers | apps/web/features/connectors/hooks/use-connector-capabilities.ts:20-40; apps/mobile/services/connectors.ts:241 |
| The route applies a rate limit, checks the connector id pattern, resolves the user and workspace. | our servers | apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:56-66 |
| The server loads the connector row, opens the MCP connection and discovers tools, resources, prompts and apps (a runtime cache exists). | our servers | apps/web/lib/user-connector-tools.ts:2076-2116; apps/web/lib/connectors/mcp-runtime-cache.ts (file name only, contents not read) |
| The MCP server itself answers the discovery requests. | outside service | apps/web/lib/connectors/mcp-custom-connections.ts:33 (30 second connection timeout) |
| The route strips fences from server text, computes riskTier and returns JSON with Cache-Control private, no-store. | our servers | apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:85-119 |
| CLI and VS Code instead start or connect to the server on the user's machine (stdio) or call the remote URL directly, then list tools and negotiated protocol. | device | apps/cli/src/lib.rs:5256-5300; apps/cli/src/app_server/surfaces.rs:838-875 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Capability catalog (tools, resources, prompts, apps) | Not stored as a table by this route; held in a server runtime cache and a 30 second browser memory cache | no | Browser cache expires after 30 seconds or on invalidate (apps/web/features/connectors/hooks/use-connector-capabilities.ts:12,45) |
| Custom connector rows (name, url, transport, encrypted credential) | table:user_custom_connectors (name seen in apps/web/lib/connectors/mcp-custom-connections.ts:244) | yes, one cloud row used by web, mobile, Desktop | Deleted by DELETE /api/connectors/custom (apps/web/app/api/connectors/custom/route.ts:177) |
| CLI registry of servers | ~/.agiworkforce/mcp.json on the device | no | Edited or removed by agi mcp commands (apps/cli/src/mcp/registry.rs:62-66) |

**Models and providers.** No model or inference provider is used to list or inspect servers; the catalog is read from the MCP server. Which model later calls the tools is a chat concern (SYS-chat-turn-pipeline). Tool count limits depend on plan, not model (apps/web/lib/connectors/mcp-custom-connections.ts:227-239).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, mobile and Tauri cloud list need a signed-in cloud account (apps/mobile/src/features/settings/cloud-connectors/index.tsx:809-818). CLI and VS Code local registry reading needs no account in the code read (apps/cli/src/lib.rs:5096-5160). |
| Permissions | Web routes use a user-scoped database handle (getUserScopedDb) so a user sees only their rows (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:62). Workspace connector policy gate applies to discovery (apps/web/lib/user-connector-tools.ts:2089). |
| Subscription | Connectors need a plan that includes the connectors capability; Free allows 0 custom servers and 0 connector tools (packages/contracts/types/src/billing-catalog.ts:621-626; apps/web/lib/connectors/connector-capability.ts:19-21). |
| Limits and metering | Route is rate limited under the 'chat-conversation' bucket (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:57). Browser cache 30 seconds. Listing is not metered in the code read; unknown whether it counts toward a quota. |
| Feature flags | Release state constant 'coming_soon' and a kill switch 'canUseConnectors' (packages/contracts/types/src/connector-release.ts:14; apps/web/lib/connectors/connector-capability.ts:34-45). |
| Model compatibility | none found in the code; the catalog does not depend on the chosen model. |
| Provider restrictions | none found in the code for listing. Provider list in packages/ai/providers is not involved. |
| Local mode | Mobile: connector screens work only in Cloud mode; Local mode shows a blocked banner (apps/mobile/src/features/settings/cloud-connectors/index.tsx:429,862). CLI and VS Code inspect local and remote servers on the device without our servers. Tauri desktop lists local MCP servers on the device. Web has no Local mode for custom connectors. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Web shows spinner and 'Discovering live MCP capabilities…'; mobile 'Loading tools…'; VS Code progress notification. | apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:19,150-158; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1030; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:743-750 |
| empty list | Web composer menu: 'No connectors are connected yet.' CLI: 'No MCP servers registered in <path>.' VS Code: 'No MCP servers are configured yet'. Web settings and mobile empty text: not traced. | apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx:23; apps/cli/src/lib.rs:5151-5155; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:783-785 |
| server unreachable | Capabilities route answers 503; web shows 'Live capabilities could not be loaded.' with 'Retry discovery' and calls onUnavailable to reload the list; CLI prints 'could not connect'. | apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:70; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:140-180; apps/cli/src/lib.rs:5262-5290 |
| timeout | CLI waits 20 seconds then prints 'did not answer within 20 seconds'. Web connection timeout 30 seconds. | apps/cli/src/lib.rs:5261,5292; apps/web/lib/connectors/mcp-custom-connections.ts:33 |
| partial discovery | Web lists the names that failed under 'Unavailable during discovery:' with a retry button. | apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:365-376 |
| server offers nothing | Web shows 'This connector answered but offers no tools, resources or prompts yet'; mobile '<name> does not list any tools yet.' | apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:23-24; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1123-1135 |
| disabled or blocked server | CLI get tells the user to enable it first; VS Code hides info/tools actions for blocked or disabled servers. | apps/cli/src/lib.rs:5246-5250; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:798-815 |
| offline | not handled in the code read beyond the error states above. | not found in files read |
| accessibility | Panel has aria-label 'Live MCP capabilities', section 'Compatibility', spinner aria-label; mobile controls have accessibilityLabel (e.g. 'Retry loading tools'). | apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:213,52; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1071 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/[connectorId]/capabilities/route.test.ts`: Display text without the untrusted fence, raw tool name beside plain title, unreachable answer when a refresh failed, 404 for not connected, risk tiers, request and workspace passed to discovery.
- `apps/web/features/connectors/components/__tests__/ConnectorCapabilitiesPanel.test.tsx`: Web panel rendering (file exists; contents not read).
- `apps/web/features/connectors/hooks/__tests__/useConnectorCapabilities.test.tsx`: Capability hook caching and errors (file exists; contents not read).
- `apps/web/app/api/connectors/custom/route.test.ts`: List with directory linkage (GET describe at line 245).
- `apps/mobile/__tests__/ConnectorDetail.test.tsx`: Mobile connector detail screen (file exists; contents not read).
- `apps/desktop/src/features/mcp/__tests__/MCPWorkspace.test.tsx`: Tauri MCP workspace (contents not read).
- `apps/extension-vscode/src/__tests__/settingsPanelLocalCapabilities.test.ts`: VS Code settings local capabilities including MCP rows (contents not read).
- `apps/cli/src/mcp/registry.rs`: Nine unit tests inside the registry module (validation and file edits).

**Test scenarios**

- **Web panel shows tools and compatibility**
  1. Sign in on a plan that includes connectors.
  2. Connect a directory connector in the selective release list.
  3. Open Settings > Connectors > the connector.
  4. Read the panel.
  - Expected: Chips show the protocol label; Tools lists names; Compatibility shows Protocol and Transport; no error text.
- **Unreachable server**
  1. Connect a server, then make it unreachable.
  2. Reopen the connector detail.
  - Expected: 'Live capabilities could not be loaded.' with 'Retry discovery'; the route answers 503.
- **Unknown connector id**
  1. Call GET /api/connectors/custom-doesnotexist/capabilities while signed in.
  - Expected: 404 'Connected connector not found' (or 404 for any custom id while connectors are coming soon).
- **CLI inspect**
  1. agi mcp add docs --command <server>
  2. agi mcp get docs
  - Expected: Prints name, status enabled, transport stdio, then identity and 'Tools (n):' or a clear failure line within 20 seconds.
- **Mobile tool list**
  1. Open Cloud mode on a signed-in phone.
  2. Open a connected connector.
  - Expected: Tools listed under 'Tool permissions'; with the network off, 'Could not load the tool list' and 'Try again'.

**Where to look when it fails**

- Error names: createError.notFound 'Connected connector not found', serviceUnavailable 'Connector is temporarily unreachable' (capabilities route).
- Log line '[connector-call-log] a connector call was not logged' for call log write failures (apps/web/lib/services/connector-call-log-service.ts).
- Table user_custom_connectors for rows; table connector_call_events for outcomes.
- CLI: registry file ~/.agiworkforce/mcp.json; /mcp logs <server> for server output.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md)
- Desktop: [70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md)
- Mobile: [70-qa/test-plans/mobile/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/mobile/058-mcp-and-interactive-extension-products.md)
- CLI: [70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md)
- VS Code: [70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **Custom connector list works but add and inspect are refused while release state is coming_soon, so the web feature is dark for custom servers.** Affects: Web, Desktop (hosted web), mobile users. Evidence: packages/contracts/types/src/connector-release.ts:14; apps/web/lib/user-connector-tools.ts:2083; apps/web/app/api/connectors/custom/route.test.ts:350-370. Work needed: Product decision to release; no code change except the constant. Unknown who decides.
- **Mobile does not show protocol, transport, resources, prompts, apps or compatibility notices.** Affects: Mobile users. Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:492,1123 (only catalog.tools used); brief S58.11, S58.28. Work needed: Add an inspector section using the catalog already fetched.
- **CLI and VS Code show no compatibility diagnostics (supported versions, deprecated transport, rejected tools).** Affects: CLI and VS Code users. Evidence: apps/cli/src/repl/registry.rs:1714-1760; apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:31-63; brief S58.28. Work needed: Extend inspect report with the same facts the web route returns.
- **The brief says the capability inspector is done on desktop, but the Tauri desktop's cloud connector list has no inspector; only the hosted web app inside Electron has it.** Affects: Tauri desktop (internal build). Evidence: search of apps/desktop/src found no ConnectorCapabilitiesPanel; doc: AGENTS.md section 5. Work needed: Clarify which desktop the brief means; fix the brief.
- **Brief code references for the CLI (apps/cli/src/lib.rs:1363, :2485) point at unrelated code now; current MCP list code is at lib.rs:5149.** Affects: Anyone using the brief. Evidence: apps/cli/src/lib.rs:1325-1375 is project/archive code. Work needed: Refresh the brief.
- **No place shows the plan's connector cap.** Affects: All cloud surfaces. Evidence: apps/web/lib/services/free-plan-entitlements.ts:69-82 holds the text only in errors. Work needed: Design and add a cap indicator.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-api-and-contracts
- api:GET /api/connectors/custom
- api:GET /api/connectors/[connectorId]/capabilities
- table:user_custom_connectors
- file:packages/contracts/cloud-contracts/src/connector-capabilities.ts

## Unknown

- Empty state text for the web settings list and for the mobile list was not traced.
- Whether the capability route counts against a usage quota.
- Contents of the existing test files other than the capabilities, custom and calls route tests were not read.
- Who decides to move connectors from coming_soon to released.
- No docs/product or docs/decisions page about MCP was read.
- How the Electron desktop builds its hosted URL list was not traced beyond AGENTS.md.
