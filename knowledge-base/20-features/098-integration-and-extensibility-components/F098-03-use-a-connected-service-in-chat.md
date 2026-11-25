---
id: "F098-03"
type: "feature"
title: "Use a connected service in chat"
aliases: ["Connector tools in chat", "MCP gateway", "Connector gateway route", "Microsoft Graph adapter", "Outlook, OneDrive, SharePoint and Teams connector", "User connector tools"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.07", "S98.14"]
depends_on: ["F098-01", "F098-02", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "surface:web", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-03 Use a connected service in chat

Lets the assistant use a connected service from a chat turn. The server builds the tool list for the signed-in person, applies login, plan, policy and approval rules, calls the service, and logs the outcome. A built-in Microsoft 365 adapter exists but is off: those ids are not released and need vendor app settings.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.07](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9807), [S98.14](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9814).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** For each chat turn the server lists the tools of the connectors the person has connected (remote MCP servers, a GitHub adapter, bank accounts, and a Microsoft Graph adapter for Outlook, OneDrive, SharePoint and Teams). It runs a call with the person's own token, asks for approval where the rules say so, and returns the result to the model. A separate POST route proxies MCP operations (call tool, read resource, get prompt, tasks) for the web UI.

**Why it exists.** The assistant must act inside services where the person already works, with that person's permissions, under server-held credentials and rules (S98.07, S98.14).

**Who uses it.** A person on a paid plan chatting on the web (and Desktop, which shows the hosted web app). Mobile, CLI and VS Code reach the same server chat; their own connector tool handling beyond reconnect notices is unverified.

**Problems it solves**

- Reading mail or files without copy and paste.
- Sending or creating items only after approval.
- One gateway so tokens never reach a browser or device.

**Use cases**

- 'Summarize unread mail from my manager' using the mail adapter.
- 'List my events for tomorrow'.
- 'Read this document from my drive as text'.
- Approve or deny a send_mail request before it leaves.

## 2. User experience

**Where to find it**

- Web chat: connector tools are used by the assistant during a turn once a connector is connected and released; the composer plus menu lists connector options (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx imports hasReleasedConnectors).
- Connector tool permissions (deny / ask / allow per tool) are read by loadConnectorToolPermissions (app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts); the settings control for them is not read.
- Mobile: ConnectorConnectCard in chat (apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx) and permissions calls in apps/mobile/services/connectors.ts:164-182.
- CLI: reconnect notices from tool results (apps/cli/src/cloud/connectors.rs:16-85).
- VS Code: 'Code: Show Connectors' view and 'Manage connectors on web' (package.json:723-734; surfaces/index.ts:245-249).

**Before you start**

- Connector connected and released (F098-01).
- Paid plan with connectors capability; kill switch open; workspace policy allows the connector (connector-capability.ts:44-84).
- For the Microsoft adapter: the owner registers an Entra app and sets client ID and secret for outlook, onedrive, sharepoint and teams (apps/web/.env.example:405-417; docs/development/connectors-setup.md).

**Screens and controls**

- Chat approval prompt for tools that need approval.
- Tool permission levels deny, ask, allow per connector tool (mcp/route.ts:49-59).

**Journey**

1. 1. Person asks for a task that needs a connected service.
2. 2. The server loads the tool list for that person (user-connector-tools.ts:2437-2600).
3. 3. The model picks a tool; the server checks release, circuit and ceiling, and screens outgoing content (user-connector-tools.ts:2757-2795).
4. 4. For send or create tools, the person approves when asked (tool-metadata.ts:827-846).
5. 5. The server gets a token (refresh if needed), calls the service, and returns text to the model.
6. 6. The model answers; the outcome is logged.

**What the person sees and gets**

- Tool results appear in the reply; blocked or failed calls return a plain message such as 'Nothing was sent.'
- Authorization-required result with a reconnect link when the grant is missing or expired (microsoft-graph.ts:789-808).
- For tools that return an interactive app, a card is added (see F098-04).

**Settings**

- Per-tool permission level (deny, ask, allow).
- Workspace connector policy.
- CONNECTOR_OAUTH_OUTLOOK_CLIENT_ID and _CLIENT_SECRET etc. (names only) for the Microsoft adapter.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Gateway route POST /api/connectors/{connectorId}/mcp: CSRF check, rate limit, body size limit, user scope, permission level, approval gate for non-allow or critical tools, then call, with audit event data_accessed or tool_executed (app/api/connectors/[connectorId]/mcp/route.ts:25-146).
- A call needing approval returns approvalRequired and runs only when the body carries approved: true (mcp/route.ts:57-59).
- Read operations: readResource, getPrompt, taskGet; task operations check the task was bound to this user (mcp/route.ts:78-121).
- Tool catalog per user, including first-party adapters (user-connector-tools.ts:2437-2600).
- Executor checks release, then the circuit and ceiling gate, then screens outgoing content before the call, and logs each outcome (user-connector-tools.ts:2737-2800).
- Microsoft Graph adapter code: Outlook search_mail, read_mail, list_events, send_mail, create_event; OneDrive search_files, read_file; SharePoint search_sites, search_files, read_file; Teams list_chats, read_chat_messages, list_teams, list_channels (catalog.ts:175-190, 257-261; microsoft-graph.ts:25, 297-834).
- send_mail and create_event are classed external_send, not reversible, at most once (tool-metadata.ts:827-846); the tool text says the person approves every send (microsoft-graph.ts:410, 448).
- Graph errors: 401 gives authorization expired, 403 gives insufficient scope, unreachable gives a try-again message (microsoft-graph.ts:795-816).

**Incomplete**

- Microsoft adapter is marked partial in the brief; saving Outlook drafts needs a broader scope that is not admitted (area brief S98.07 unfinished note).
- Which approval prompt the chat shows for external_send under each policy was not read; the classification exists but the 'always asks under every policy' claim is from the brief only.
- The executor and the tool list always use the default grant; no account choice (oauth-access.ts:84-97).

**Present but disconnected or switched off**

- All of this is off by release state: outlook, onedrive, sharepoint, teams, gmail, slack, github and others are not in the 13 released ids (connector-release.ts:14-34; user-connector-tools.ts:2083, 2492, 2537).
- Microsoft adapter also stays off until the owner's Entra app settings exist (.env.example:413-417).
- Free plan: tools withheld (connector-capability.ts:44-67).

**Not available**

- Local mode: none for cloud connectors. Device-local connectors (filesystem, terminal, browser automation, screen vision, local model runtime) are run by the desktop runtime, not this gateway (catalog.ts:125-137).
- Private-network bridge is missing (S98.15).
- Connector search and index worker is missing (S98.08).

## 4. Required behaviour

**Established requirements**

- Provider-specific adapters implement connector behaviour for each supported provider (S98.07, status partial). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.07)
- A server-side gateway proxies MCP operations for a user, applying auth and permissions (S98.14). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.14)
- send_mail and create_event are external sends and ask under every policy. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.07)
- Connector release is selective: the full-launch switch stays coming_soon. (source: doc: docs/runbooks/connector-oauth-apps.md)
- Web search, memory, MCP and similar features are route or harness features, not intrinsic model capabilities. (source: AGENTS.md section 4)

**Acceptance criteria**

1. A POST to the gateway without a CSRF token is refused.
2. A tool set to deny returns forbidden.
3. A tool that needs approval returns approvalRequired and does not call the service until approved:true is sent.
4. A critical-risk tool asks even when its level is allow.
5. send_mail is never executed without an approval step.
6. A Free account sees no connector tools.
7. An expired grant returns an authorization-required result with a reconnect path, not a crash.
8. Each executed call writes a connector_call_events row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The gateway route is used by the interactive-app card (F098-04) and Settings catalog views, not by the model loop, which uses the executor.
- [inferred] Any model provider can use connector tools because the tool loop is server side.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one test that proves approval for external_send under every policy mode.
- [proposed] Pass the chosen account into the executor once multi-account works.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:POST /api/connectors/{connectorId}/mcp | `apps/web/app/api/connectors/[connectorId]/mcp/route.ts` | MCP operation gateway with permission and approval checks. |
| service | User connector tools | `apps/web/lib/user-connector-tools.ts` | Tool catalogs, MCP handles, executor, gate and metering (about 2,800 lines). |
| service | Reachable MCP handle | `apps/web/lib/connectors/reachable-mcp-handle.ts` | Wraps handle access so a failed refresh reads as try again. |
| service | Microsoft Graph adapter | `apps/web/lib/connectors/microsoft-graph.ts` | Outlook, OneDrive, SharePoint and Teams tools and executor. |
| config | Tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Action class, reversibility and retry rules per tool (Graph at lines 827-846). |
| service | Connector tool permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Loads deny, ask or allow per connector tool. |
| service | Chat tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs connector tools in a chat turn; builds interactive cards. |
| service | Connector capability gate | `apps/web/lib/connectors/connector-capability.ts` | Release, plan and kill-switch checks per turn. |
| service | Connector policy gate | `apps/web/lib/services/connector-policy-gate.ts` | Workspace policy and plan check at connection time. |
| service | Connector access resolver | `apps/web/lib/connectors/oauth-access.ts` | Token for the call; reconnect states. |
| service | Connector health gate | `apps/web/lib/connectors/health.ts` | Circuit and ceiling before each call. |
| service | Auth challenge detector | `apps/web/lib/connectors/oauth-challenge.ts` | Turns a vendor sign-in challenge into a reconnect result. |
| service | Connect-required payload | `apps/web/lib/connectors/connect-required.ts` | Builds the authorization-required tool result. |
| service | MCP runtime cache | `apps/web/lib/connectors/mcp-runtime-cache.ts` | Caches discovery state for stateless MCP calls. |
| service | MCP state store | `apps/web/lib/connectors/mcp-state-store.ts` | Binds tasks to users; saves app payloads. |
| service | TypeScript MCP client | `packages/tools/mcp/src/connect.ts` | connectMcpServer handle used by the server (callTool, readResource, getPrompt). |
| config | Connector release gate | `packages/contracts/types/src/connector-release.ts` | Exact-id release list. |
| table | table:connector_call_events | `apps/web/db/neon/0223_connector_call_events.sql` | Call outcomes. |
| service | Mobile connector service | `apps/mobile/services/connectors.ts` | Tool permission calls and connect from the phone. |
| service | CLI reconnect collector | `apps/cli/src/cloud/connectors.rs` | Reads x_tool_result events to show reconnect links. |
| config | Connector setup guide | `docs/development/connectors-setup.md` | Environment names per connector. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chat turn starts; server checks release, plan tier and kill switch for connectors. | our servers | connector-capability.ts:44-67 |
| Server builds the tool list from connected grants and first-party adapters. | our servers | user-connector-tools.ts:2437-2600 |
| Model (through the chosen provider route) asks for a tool call. | outside service | tool-loop.ts connector branch near line 2950 |
| Executor checks release, circuit and ceiling, then screens the arguments for secrets. | our servers | user-connector-tools.ts:2757-2800 |
| Approval is requested for non-allow or critical tools; with approval the call runs. | device and our servers | mcp/route.ts:49-59; tool-metadata.ts:827-846 |
| Server resolves the token (refresh if needed) and calls the vendor API or MCP server. | outside service | microsoft-graph.ts:789-816; oauth-access.ts:84 |
| Outcome logged and metered; text result returned to the model; audit event written on the gateway route. | our servers | health.ts:280-298; mcp/route.ts:129-142 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Tool arguments and results for the turn. | Conversation store of the chat (SYS-chat-turn-pipeline). | With the conversation. | With the conversation. |
| Call log row. | table:connector_call_events | Server only. | Cascade on user deletion. |
| MCP task binding and app payload. | mcp_app_payloads and task binding tables (mcp-state-store.ts; db/neon/0147_mcp_stateless_cache.sql, 0173) | Server only. | Payload life 30 days (mcp-state-store.ts:10). |
| Audit event data_accessed or tool_executed. | audit log | Server only. | Per audit policy. |

**Models and providers.** The model provider only sees tool descriptions and results as text; connector calls themselves run on our servers with the person's own vendor token. Tool use works with any model route that supports tools [inferred]. Connector results fed to a model leave the connector boundary for that provider; Local mode would have to opt in (not found in the code).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in (getUserScopedDb) (mcp/route.ts:40). |
| Permissions | Per-tool deny/ask/allow, critical-risk always asks, workspace connector policy, outbound content screening (mcp/route.ts:49-59; user-connector-tools.ts:2780-2795). |
| Subscription | 'connectors' capability needs a paid plan tier; Free gets no tools (connector-capability.ts:44-67; billing-catalog.ts:351). Artifact use of connectors needs a pro-level tier (billing-catalog.ts:361). |
| Limits and metering | 60 calls per minute per connector, circuit after 3 failures, payload size cap CONNECTOR_MCP_OPERATION_MAX_BYTES, route rate limit bucket chat-conversation (mcp/route.ts:31-38; health.ts:33-38). Calls recorded as infrastructure cost (health.ts:290). |
| Feature flags | CONNECTOR_RELEASE_STATE, selective ids, canUseConnectors kill switch, GitHub and Plaid availability checks (user-connector-tools.ts:2451, 2479). |
| Model compatibility | Tools are passed as normal tool definitions; model-specific support is not checked in the files read. |
| Provider restrictions | Needs the vendor's OAuth app; Microsoft adapter needs an Entra app registered by the owner (.env.example:413-417). |
| Local mode | Cloud connectors are not available in Local mode: they run on our servers with a vendor token. A Local-to-cloud move would have to be an explicit fork (AGENTS.md section 6); whether the product enforces that for connector tools was not verified. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | No connected connector: no tools; unreleased connector: the executor returns 'Connectors are coming soon.' | user-connector-tools.ts:2765-2768; connector-release.ts:41 |
| Approval pending | Gateway returns approvalRequired; the card shows Allow once or Deny for app tool calls. | mcp/route.ts:57-59; McpAppCard.tsx:196-235 |
| Denied | forbidden 'This connector tool is denied'. | mcp/route.ts:50 |
| Error | Graph 401 gives authorization expired, 403 insufficient scope, other errors return the message as a tool error. | microsoft-graph.ts:807-816 |
| Unreachable | Gateway returns service unavailable that is user-safe; Graph returns the unreachable message. | reachable-mcp-handle.ts:11-16; microsoft-graph.ts:795-799 |
| Circuit open or ceiling | Call refused with a message naming the wait. | health.ts:236-255; user-connector-tools.ts:2770-2775 |
| Cancel | request.signal and options.signal are passed through; aborted calls throw. | mcp/route.ts:61; user-connector-tools.ts:2751 |
| Offline | Gate read failure returns 'Connector availability could not be checked. Try again.' | user-connector-tools.ts:2776-2786 |
| Outbound content blocked | Call not sent; logged as blocked. | user-connector-tools.ts:2788-2795 |
| Accessibility and app differences | not handled in the code beyond text results; mobile shows plain results only for apps. | apps/mobile/src/features/chat/components/cards/McpAppCard.tsx:14-40 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/[connectorId]/mcp/__tests__/route.test.ts`: Gateway route behaviour.
- `apps/web/app/api/connectors/[connectorId]/mcp/route.critical-tools.test.ts`: Critical tools ask for approval.
- `apps/web/lib/connectors/__tests__/connector-unreachable-adapters.test.ts`: Adapters when a refresh is unreachable.
- `apps/web/lib/connectors/__tests__/microsoft-graph-markup.test.ts`: Graph text handling.
- `apps/web/lib/__tests__/user-connector-tools.oauth.test.ts`: Connector tools with OAuth grants.
- `apps/web/lib/__tests__/user-connector-tools.discovery-policy.test.ts`: Discovery policy.
- `apps/web/lib/__tests__/connector-tool-outbound-inspection.test.ts`: Outbound screening.
- `apps/web/lib/__tests__/connector-tool-cancellation.test.ts`: Cancellation.
- `apps/web/lib/connectors/__tests__/connector-selective-release.test.ts`: Selective release.

**Test scenarios**

- **Approval gate**
  1. Connect a released connector that has a write tool.
  2. Ask the assistant to use it.
  - Expected: Approval asked first; denying sends nothing.
- **Denied tool**
  1. Set a tool to deny.
  2. Call the gateway for that tool.
  - Expected: 403 forbidden.
- **Expired grant**
  1. Expire the refresh token.
  2. Ask for a task that uses the connector.
  - Expected: Reconnect result and notification.
- **Free plan**
  1. Sign in on Free; ask for a connector task.
  - Expected: No connector tools are offered.
- **Microsoft adapter off**
  1. On a default deployment ask for mail from Outlook.
  - Expected: Not offered (id not released; no vendor app settings).
- **Microsoft adapter on**
  1. On a test deployment release outlook and set vendor settings; connect; run search_mail then send_mail.
  - Expected: Search returns messages; send_mail asks first and writes to Sent Items.

**Where to look when it fails**

- Log lines: 'Connector gate could not be read'; '[connector-policy] ...'.
- Tables: connector_call_events, mcp_app_payloads.
- Audit events tool_executed and data_accessed with connectorId.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Microsoft adapter cannot run in production: ids are not released and owner setup is open.** Affects: All apps for Outlook, OneDrive, SharePoint, Teams users.. Evidence: connector-release.ts:17-34; .env.example:413-417.. Work needed: Owner registers the Entra app, sets settings, releases ids, then live-tests.
- **Approval for external_send under every policy is a brief statement, not proven here.** Affects: Anyone sending mail through the adapter.. Evidence: tool-metadata.ts:827-846 only classifies; approval prompt code not read.. Work needed: Trace and test the approval path.
- **No per-task account selection.** Affects: Multi-account users.. Evidence: oauth-access.ts:84-97.. Work needed: See F098-01 gaps.
- **Mobile, CLI, VS Code and Chrome behaviour for connector tools is unverified.** Affects: Those apps.. Evidence: Only client code for connect and reconnect found.. Work needed: Drive each app against a released connector.

**Depends on**

- F098-01
- F098-02
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- surface:web
- mode:cloud

## Unknown

- Settings control and labels for per-tool permissions.
- Whether mobile, CLI, VS Code use connector tools in their own turns beyond reconnect notices.
- The exact approval prompt wording and policy modes for external sends.
- Whether any connector tool runs in a Local mode turn.
- Whether plan tiers named in code match the product's Premium/Max/Ultra names.
