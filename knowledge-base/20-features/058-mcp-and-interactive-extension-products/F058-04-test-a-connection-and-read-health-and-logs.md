---
id: "F058-04"
type: "feature"
title: "Test a connection and read health and logs"
aliases: ["Test connection", "Connection test", "Recent calls", "Connector health", "Connector call log", "Server health and logs", "/mcp logs", "Test connection (VS Code)", "S58.07", "S58.12"]
area: "58 MCP and interactive extension products"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S58.07", "S58.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "table:connector_call_events", "SYS-observability-and-operations", "SYS-connectors-plugins-and-skills", "SYS-execution-boundaries", "F058-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-04 Test a connection and read health and logs

Checks that an MCP server answers and shows its health and recent history. Web re-runs discovery (the capabilities route) and shows 'Connector health' and 'Recent calls'. Mobile shows call log and health card. CLI and VS Code test the live connection and show server output.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.07](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5807), [S58.12](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5812).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Tells the person whether a server is reachable and how its recent tool calls went. Web and mobile read a call log table for health states 'Responding', 'Degraded', 'Not responding'; CLI and VS Code connect and report responding plus recent server output lines (apps/web/lib/connectors/health.ts:20-60; apps/cli/src/app_server/surfaces.rs:838-875).

**Why it exists.** Servers fail quietly (token expired, server down). The person needs a way to see failure and when it began. [inferred]

**Who uses it.** Anyone with connected servers, and developers debugging their own server. [inferred]

**Problems it solves**

- Not knowing why a tool did not work.
- Seeing which tools worked, failed or were blocked and how long they took.
- Confirming a freshly added server answers.

**Use cases**

- Web user opens a connector and reads 'Recent calls'.
- Mobile user checks the health card after tools stop working.
- VS Code user clicks 'Test connection' on a server.
- CLI user runs /mcp logs docs.

## 2. User experience

**Where to find it**

- Web: Settings > Connectors: a 'Connector health' dashboard, the capabilities panel with 'Retry discovery', and 'Recent calls' under Tool permissions (apps/web/features/connectors/components/ConnectorHealthDashboard.tsx:19; apps/web/features/connectors/components/ConnectorCallLog.tsx:31; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:377).
- Mobile: connector detail screen: 'Recent calls' and a health card (apps/mobile/src/features/settings/cloud-connectors/ConnectorCallLog.tsx:59; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1160-1175).
- Tauri desktop: Settings > Connectors > ConnectorHealthDashboard and the local server logs (apps/desktop/src/features/settings/tabs/Connectors/index.tsx:25-30; apps/desktop/src-tauri/src/sys/commands/mcp.rs:1502,1511).
- CLI: /mcp info <server> and /mcp logs <server>; agi mcp get connects and reports (apps/cli/src/repl/registry.rs:1687-1760).
- VS Code: server row buttons 'Test connection' and the info details (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:721,821-830).
- Chrome: not in the brief.

**Before you start**

- A connected server.
- Web and mobile: signed in; mobile in Cloud mode.
- CLI /mcp commands: the server must be connected in the running session.

**Screens and controls**

- Web call log: heading 'Recent calls', outcomes 'Worked', 'Failed', 'Blocked here', 'Retry' button, empty text 'This connector has not been called yet, so there is nothing to show.' (apps/web/features/connectors/components/ConnectorCallLog.tsx:20-35).
- Web health: heading 'Connector health', state labels 'Responding', 'Degraded', 'Not responding' (apps/web/features/connectors/components/ConnectorHealthDashboard.tsx:19-31).
- VS Code: progress 'testing <name>', message with tool count and milliseconds, or 'did not connect' (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:721-741).

**Journey**

1. Open the server's detail.
2. Read health and recent calls, or press Test connection.
3. If it failed, retry; on web use 'Retry discovery'.
4. If the server keeps failing, check sign-in (F058-03) or remove and re-add (F058-02).

**What the person sees and gets**

- Web list rows show warning text 'Not responding to recent requests.' when health is not-responding (apps/web/features/directory/constants.ts:265; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:714).
- CLI report line '<name>: responding' or 'not responding' then 'Protocol ...', 'Capabilities: ...' and a count of output lines (apps/cli/src/repl/registry.rs:1714-1760).
- VS Code details show 'Output' lines from the server.

**Settings**

- none found for health thresholds in the UI; thresholds are constants (apps/web/lib/services/connector-call-log-service.ts:34-35).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web test equals discovery: capabilities route probes the server, failure maps to 503 (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:62-70).
- Web calls route GET /api/connectors/calls returns up to 50 entries by default and at most 100, optionally per connector (apps/web/app/api/connectors/calls/route.ts:16-30; apps/web/lib/services/connector-call-log-service.ts:40,103).
- Call outcomes are written without blocking the tool call to table connector_call_events (apps/web/lib/services/connector-call-log-service.ts:49-70).
- Health derives only from the call log: three consecutive failures within 30 minutes mean not-responding; degraded at a 25 percent failure ratio; circuit and backoff states exist (apps/web/lib/services/connector-call-log-service.ts:34-35; apps/web/lib/connectors/health.ts:24-60).
- GET /api/connectors/health returns per-connector health (apps/web/app/api/connectors/health/route.ts:15-30).
- Mobile shows the call log and a health card (apps/mobile/src/features/settings/cloud-connectors/ConnectorCallLog.tsx:36-80; apps/mobile/src/features/settings/cloud-connectors/ConnectorTrustSections.tsx).
- CLI /mcp info and /mcp logs report responding, protocol, capabilities and recent lines (apps/cli/src/repl/registry.rs:1687-1760).
- VS Code test connection runs mcp/test on the CLI and reports tool count and elapsed time (apps/extension-vscode/src/integrations/localRuntimeClient.ts:2262; apps/cli/src/app_server/surfaces.rs:801).

**Incomplete**

- There is no explicit 'Test' button on web; the nearest is 'Retry discovery' (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:179,372).
- Call history records tool calls made by the assistant, not tests, and has no log of server stderr for cloud servers. [inferred from the insert in connector-call-log-service.ts:56]
- Tauri desktop cloud connectors do not show call history (no call route use found in apps/desktop/src).

**Present but disconnected or switched off**

- For custom cloud servers the test and health views are dark while connectors are coming soon (apps/web/lib/user-connector-tools.ts:2083).

**Not available**

- Chrome: none.

## 4. Required behaviour

**Established requirements**

- The user can test the connection to an MCP server and see whether it succeeded (web, desktop, CLI, VS Code done; mobile not listed). (source: brief S58.07)
- Each server shows health and the user can read recent logs or call history (all five apps done). (source: brief S58.12)
- Production features need observability and graceful degradation. (source: doc: AGENTS.md section 8)

**Acceptance criteria**

1. A reachable server returns the catalog; an unreachable one returns 503.
2. After three failed calls in a row inside 30 minutes the connector shows 'Not responding'.
3. A success after failures returns the state to Responding or Degraded according to the 25 percent ratio.
4. GET /api/connectors/calls only returns the caller's rows.
5. A failed read of the call log is an error, not an empty list.
6. VS Code Test connection shows tool count and time for a good server and a failure reason for a bad one.
7. The call log write never fails the tool call.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web needs an explicit test action, since the brief marks S58.07 done for web through discovery only. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a visible 'Test connection' button on web and mobile that calls the capabilities route and states the result in one line.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/connectors/[connectorId]/capabilities | `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts` | Test by discovery. |
| endpoint | GET /api/connectors/calls | `apps/web/app/api/connectors/calls/route.ts` | Recent call history. |
| endpoint | GET /api/connectors/health | `apps/web/app/api/connectors/health/route.ts` | Per-connector health. |
| service | connector-call-log-service | `apps/web/lib/services/connector-call-log-service.ts` | Writes and reads connector_call_events; thresholds. |
| service | connectors/health | `apps/web/lib/connectors/health.ts` | Health, circuit and backoff derived from the log. |
| table | connector_call_events | `apps/web/lib/services/connector-call-log-service.ts` | Stores user, connector, tool, outcome, duration, surface. |
| schema | ConnectorCallEntrySchema | `packages/contracts/cloud-contracts/src/connectors.ts` | Shared call entry and health shapes. |
| component | ConnectorCallLog (web) | `apps/web/features/connectors/components/ConnectorCallLog.tsx` | Web call list. |
| component | ConnectorHealthDashboard (web) | `apps/web/features/connectors/components/ConnectorHealthDashboard.tsx` | Web health dashboard. |
| component | ToolPermissionsPanel | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Hosts the call log beside permissions. |
| component | ConnectorCallLog (mobile) | `apps/mobile/src/features/settings/cloud-connectors/ConnectorCallLog.tsx` | Mobile call list. |
| component | ConnectorHealthCard | `apps/mobile/src/features/settings/cloud-connectors/ConnectorTrustSections.tsx` | Mobile health card. |
| service | fetchConnectorCalls | `apps/mobile/services/connectors.ts` | Mobile call to the calls route. |
| command | /mcp info/logs | `apps/cli/src/repl/registry.rs` | CLI session health report. |
| service | inspect_connection / test_mcp_server | `apps/cli/src/app_server/surfaces.rs` | Responding check, logs, probe. |
| component | testMcpServer and details | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | VS Code test and details actions. |
| command | mcp_get_health / mcp_get_server_logs | `apps/desktop/src-tauri/src/sys/commands/mcp.rs` | Tauri local health and logs. |
| component | MCPLogsViewer | `apps/desktop/src/features/mcp/MCPLogsViewer.tsx` | Tauri logs view. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Every tool call made through a connector records an outcome (succeeded, failed, blocked) with duration, without waiting for the write. | our servers | apps/web/lib/services/connector-call-log-service.ts:49-70 |
| The client asks GET /api/connectors/calls?connectorId=... or /health. | device and our servers | apps/web/features/connectors/components/ConnectorCallLog.tsx:53; apps/web/app/api/connectors/calls/route.ts:19-33 |
| The server reads rows scoped to the user and returns them; health is computed from them. | our servers | apps/web/app/api/connectors/health/route.ts:19-29; apps/web/lib/connectors/health.ts |
| Test: the capabilities route opens the MCP connection and asks for capabilities. | our servers | apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:62-70 |
| The MCP server answers or does not. | outside service | apps/web/lib/connectors/mcp-custom-connections.ts:33 |
| CLI/VS Code: connect locally, check responding, read recent server output buffered in memory. | device | apps/cli/src/app_server/surfaces.rs:838-875 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Call events (connector id, tool name, outcome, duration, surface, user, organization) | table:connector_call_events | yes, all cloud apps read the same rows | retention period not found in the code read |
| CLI server output lines | in memory of the running CLI session | no | lost when the session ends [inferred] |

**Models and providers.** No model is used to test or read health. Calls logged come from model tool use in chat (SYS-chat-turn-pipeline); the log does not record which model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile need sign-in; CLI and VS Code local checks do not need an account. |
| Permissions | Rows are read through a user-scoped database handle so only the caller's calls appear (apps/web/app/api/connectors/calls/route.ts:21-23; apps/web/app/api/connectors/calls/route.test.ts:34). |
| Subscription | none found in the code for viewing calls or health; the connector plan caps in F058-02 limit what can be connected. |
| Limits and metering | Calls route default 50, maximum 100; rate limit bucket 'chat-conversation'; outbound call limit 60 per minute window and backoff constants exist in health.ts (apps/web/lib/connectors/health.ts:33-37). |
| Feature flags | canUseConnectors kill switch and release state (see F058-01). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | CLI, VS Code and Tauri local checks run on the device. Mobile Local mode: the call log screen needs Cloud mode. The cloud call log has no local equivalent on web. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Spinner with loading copy on web call log; mobile loading indicator. | apps/web/features/connectors/components/ConnectorCallLog.tsx:107 |
| empty | 'This connector has not been called yet, so there is nothing to show.' | apps/web/features/connectors/components/ConnectorCallLog.tsx:33 |
| error | A failed read is reported as an error, not as an empty log; Retry button. | apps/web/app/api/connectors/calls/route.test.ts:56; apps/web/features/connectors/components/ConnectorCallLog.tsx:35 |
| stale failures | A failure streak older than 30 minutes no longer marks the connector down. | apps/web/lib/services/connector-call-log-service.ts:23-35 |
| log write fails | Logged as a warning; the tool call is unaffected. | apps/web/lib/services/connector-call-log-service.ts:66-69 |
| server unreachable on test | 503 from the route; CLI/VS Code print the failure reason. | apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:70; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:735-740 |
| timeout | 30 seconds cloud; 20 seconds CLI get; VS Code uses MCP_PROBE_TIMEOUT_MS (value not read). | apps/web/lib/connectors/mcp-custom-connections.ts:33; apps/cli/src/lib.rs:5261 |
| offline, reconnect | CLI /mcp restart reconnects; other apps: not handled beyond retry. | apps/cli/src/repl/registry.rs:1680-1685 |
| accessibility | Call log is a labelled section; mobile retry has an accessibility label. | apps/web/features/connectors/components/ConnectorCallLog.tsx:97 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/calls/route.test.ts`: Reads through the RLS scoped handle, narrowing by connector, error not empty on failed read, response shape.
- `apps/web/features/connectors/components/__tests__/ConnectorCallLog.test.tsx`: Web call log panel (contents not read).
- `apps/web/lib/connectors/__tests__/health.test.ts`: Health computation (contents not read).
- `apps/web/app/api/connectors/health/route.test.ts`: Health route (contents not read).
- `apps/web/app/api/connectors/[connectorId]/capabilities/route.test.ts`: Unreachable and not-connected answers.
- `apps/mobile/src/features/settings/cloud-connectors/__tests__/ConnectorTrustSections.test.tsx`: Mobile health card (contents not read).
- `apps/desktop/src/features/connectors/__tests__`: Tauri connector tests folder (contents not read).

**Test scenarios**

- **Three failures mark down**
  1. Cause three tool calls to fail in a row for one connector.
  2. Open its detail.
  - Expected: State 'Not responding' and the 'Recent calls' list shows three 'Failed'.
- **Empty history**
  1. Connect a new server, do not use it.
  2. Open 'Recent calls'.
  - Expected: Empty text appears.
- **Read failure**
  1. Make the calls route fail.
  2. Open the call log.
  - Expected: Error with Retry, not an empty list.
- **VS Code test**
  1. Use Test connection on a good and a bad server.
  - Expected: Good: message with tool count and milliseconds. Bad: 'did not connect: <reason>'.
- **CLI logs**
  1. Start a session with a stdio server.
  2. Run /mcp logs <server>.
  - Expected: Lines of recent output or 'No output from this server yet.'

**Where to look when it fails**

- Warning '[connector-call-log] a connector call was not logged'.
- Table connector_call_events rows by user and connector.
- Route responses 503 'Connector is temporarily unreachable'.
- /mcp logs <server> in the CLI.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md)
- Desktop: [70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md)
- Mobile: [70-qa/test-plans/mobile/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/mobile/058-mcp-and-interactive-extension-products.md)
- CLI: [70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md)
- VS Code: [70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **No explicit test button on web or mobile; only discovery and health.** Affects: Web, mobile. Evidence: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:179. Work needed: Add a button and a one-line result.
- **Call history only exists for calls the assistant made; a new server has no history, and there is no cloud log of server output.** Affects: Web, mobile developers. Evidence: apps/web/lib/services/connector-call-log-service.ts:56. Work needed: Decide whether to capture probe results or server logs.
- **Retention of connector_call_events is not set in the code read.** Affects: Privacy and cost. Evidence: no delete or retention found in connector-call-log-service.ts. Work needed: Confirm or define retention.
- **Mobile test is listed done in the brief S58.12 but S58.07 has no mobile status; no mobile test button found.** Affects: Mobile. Evidence: brief S58.07 status line. Work needed: Clarify requirement.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- table:connector_call_events
- SYS-observability-and-operations
- SYS-connectors-plugins-and-skills
- SYS-execution-boundaries
- F058-01

## Unknown

- Retention period of connector_call_events.
- Value of MCP_PROBE_TIMEOUT_MS in VS Code.
- Whether the Tauri cloud connector view reads the calls route (none found).
- Contents of most test files.
- How the brief's CLI test lines (registry.rs:1320, tui_app.rs:5309) map to current code; they no longer match.
