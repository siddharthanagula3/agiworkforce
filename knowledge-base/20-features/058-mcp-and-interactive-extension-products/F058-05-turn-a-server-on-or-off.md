---
id: "F058-05"
type: "feature"
title: "Turn a server on or off"
aliases: ["Use in chats", "Turn a server on or off", "Enable/disable server", "agi mcp enable / disable", "/mcp enable|disable", "Enabled switch", "Connectors menu in the composer", "S58.13"]
area: "58 MCP and interactive extension products"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "built", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S58.13"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "mode:cloud", "mode:local", "table:connector_account_states", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "F058-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-05 Turn a server on or off

Turns a connected server off without removing it, and back on. Web has a 'Use in chats' switch and a composer Connectors menu, saved to the cloud per user. CLI and VS Code move the entry in the local registry. Mobile has no switch.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.13](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5813).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person stop the assistant from using a server while keeping its settings. On web it saves a per-user disabled flag; in the CLI it parks the entry under 'disabledServers' so it is not loaded (apps/web/app/api/connectors/account-state/route.ts:36-90; apps/cli/src/mcp/registry.rs:1-12).

**Why it exists.** A server may be noisy, risky or slow for a task; removing it loses credentials and setup. [inferred]

**Who uses it.** Any connector user. [inferred]

**Problems it solves**

- Stopping tool use without deleting the server.
- Reducing the number of tools sent to the model per chat. [inferred]

**Use cases**

- Turn off a server before a sensitive chat.
- Toggle a connector from the composer Connectors menu.
- agi mcp disable docs then agi mcp enable docs.
- Turn a server off in the VS Code settings panel.

## 2. User experience

**Where to find it**

- Web: connector detail footer switch labelled 'Use in chats' with hint 'When off, AGI cannot use this connector in any chat.'; and the composer Connectors menu 'Connectors' with one toggle row per connector (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:89-93,925-960; apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx:25,155-170).
- Desktop (public): same hosted web screens. Tauri desktop: 'Enabled' switch on each server card and in the Configuration tab (apps/desktop/src/features/mcp/MCPServerCard.tsx:181; apps/desktop/src/features/mcp/MCPConfigEditor.tsx:165-170).
- Mobile: none found.
- CLI: agi mcp enable|disable <name>; /mcp enable|disable <name> then /mcp restart (apps/cli/src/lib.rs:2165-2175,5314-5320; apps/cli/src/repl/registry.rs:1655-1670).
- VS Code: settings panel switch on user-scope MCP rows (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:2536; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:911).
- Chrome: none.

**Before you start**

- A connected or registered server.
- Web composer menu lists only connectors that are released (apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx:84-90).
- VS Code: CLI offers setEnabled; only user-scope servers are switchable (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:911).

**Screens and controls**

- Web switch with aria-label 'Use in chats: <name>', disabled while saving or before the state loads, with a 'Retry' button when the state could not load (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:938-960).
- CLI status column shows enabled, disabled or blocked (apps/cli/src/lib.rs:5170-5180).

**Journey**

1. Open the connector detail or composer menu.
2. Flip the switch.
3. Web: the client PUTs the new state, the server saves and records an audit event, the switch updates.
4. CLI: new sessions skip the server; a running session keeps it until /mcp restart (apps/cli/src/lib.rs:5004-5017).

**What the person sees and gets**

- Web error text 'Could not save whether this connector is on.' (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:93).
- CLI: "Turned off MCP server '<name>'. A running session keeps it until `/mcp restart`." (apps/cli/src/lib.rs:5013).
- Error when too many entries: 'Only N connectors can be switched on or off. Disconnect one you no longer use.' (apps/web/app/api/connectors/account-state/route.ts:70-72).

**Settings**

- CLI allow, ask, block rules via agi mcp allow|ask|block|unset (apps/cli/src/lib.rs:2176-2200).
- Web per-tool permissions under 'Tool permissions' are a separate setting (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:95).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web PUT /api/connectors/account-state upserts a row in connector_account_states in a transaction after advancing the permission generation, limited to a maximum number of entries, with an audit event (apps/web/app/api/connectors/account-state/route.ts:36-90).
- Web GET returns the disabled ids; chat reads them through readDisabledConnectorIds (apps/web/app/api/connectors/account-state/route.ts:26-34).
- Composer menu toggles use the same state (apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx:155-170).
- CLI enable and disable move an entry between 'mcpServers' and 'disabledServers' so a disabled server is genuinely not loaded (apps/cli/src/mcp/registry.rs:1-12,224).
- CLI list shows blocked when policy refuses (apps/cli/src/lib.rs:5159-5180).
- VS Code settings switch calls mcp/setEnabled (apps/extension-vscode/src/integrations/localRuntimeClient.ts:2248).
- Tauri desktop commands mcp_enable_server and mcp_disable_server (apps/desktop/src-tauri/src/sys/commands/mcp.rs:1329,1338).

**Incomplete**

- The brief cites the organization MCP route for the toggle; that route manages the organization's published servers (published, retired), not the personal switch (apps/web/app/api/settings/organization/mcp/route.ts:235-270).
- CLI running sessions keep a disabled server until /mcp restart (by design in the message).

**Present but disconnected or switched off**

- Web composer connector rows are empty while connectors are not released (apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx:84-90).

**Not available**

- Mobile: no on/off control found in cloud-connectors screens (search of the screens read found none). [inferred from files read]
- VS Code: project-scope servers are not switchable.
- Chrome: none.

## 4. Required behaviour

**Established requirements**

- The user can disable a configured server without removing it and re-enable it (web, desktop, CLI done; mobile, VS Code listed missing). (source: brief S58.13)
- Reversible actions need not ask; irreversible ones ask first and name the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Turning 'Use in chats' off makes the connector's tools unavailable in the next chat turn.
2. The server's credentials and tools remain after turning off and on.
3. A failed save shows 'Could not save whether this connector is on.' and the switch does not change.
4. agi mcp list shows 'disabled' after agi mcp disable.
5. A disabled CLI server does not start in a new session.
6. The PUT route refuses a request without a valid CSRF token.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should offer the same switch because the cloud route is shared. [inferred]
- VS Code switch exists; brief status missing is outdated. [inferred from apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:2536]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a switch to the mobile connector detail wired to the existing route.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | PUT/GET /api/connectors/account-state | `apps/web/app/api/connectors/account-state/route.ts` | Reads and saves the disabled list. |
| table | connector_account_states | `apps/web/app/api/connectors/account-state/route.ts` | user_id, connector_id, enabled. |
| service | readDisabledConnectorIds | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Chat reads disabled ids. |
| service | advanceConnectorPermissionGeneration | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts` | Invalidates session grants on change. |
| schema | SetConnectorAccountStateRequestSchema | `packages/contracts/cloud-contracts/src/connector-directory.ts` | Request shape and path constant. |
| hook | setConnectorAccountEnabled | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Client save and switch render. |
| component | ComposerPluginsMenu | `apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx` | Composer toggles. |
| command | McpSubcommand::Enable/Disable | `apps/cli/src/lib.rs` | CLI switch commands. |
| service | set_server_enabled | `apps/cli/src/mcp/registry.rs` | Moves entries between enabled and disabled maps. |
| command | /mcp enable/disable | `apps/cli/src/repl/registry.rs` | In-session switch. |
| component | settings MCP switch | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | VS Code switch rendering. |
| service | setMcpServerEnabled | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | mcp/setEnabled request. |
| component | MCPServerCard | `apps/desktop/src/features/mcp/MCPServerCard.tsx` | Tauri Enabled switch. |
| command | mcp_enable_server / mcp_disable_server | `apps/desktop/src-tauri/src/sys/commands/mcp.rs` | Tauri commands. |
| endpoint | PATCH /api/settings/organization/mcp | `apps/web/app/api/settings/organization/mcp/route.ts` | Workspace-level publish and retire of shared servers (related, not the personal switch). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User flips the switch; the client sends PUT with connectorId, enabled and a CSRF token. | device | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:888-905 |
| Server checks CSRF and rate limit, validates the body, advances the permission generation and upserts the row in one transaction. | our servers | apps/web/app/api/connectors/account-state/route.ts:36-66 |
| An audit event 'connector_setting_changed' records enabled or disabled. | our servers | apps/web/app/api/connectors/account-state/route.ts:74-86 |
| On the next chat turn, the pipeline reads the disabled ids and leaves those connectors' tools out. | our servers | apps/web/app/api/connectors/account-state/route.ts:20,28 (import and use of readDisabledConnectorIds); exact use in the turn builder not traced |
| CLI: registry file is rewritten with the entry moved; new sessions load only enabled servers. | device | apps/cli/src/mcp/registry.rs:1-12,224 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Per-user enabled flag per connector | table:connector_account_states | yes, across web, mobile and Desktop that read the same account | kept until the user changes it; whether it is cleaned when a connector is deleted is not traced (custom delete clears tool permissions, apps/web/app/api/connectors/custom/route.ts:206) |
| CLI disabled entry | ~/.agiworkforce/mcp.json under disabledServers | no | stays until enabled or removed |

**Models and providers.** No model takes part. The effect is on which tools are offered to any model (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs sign-in; CLI local registry needs none. |
| Permissions | User-scoped database; workspace role is not checked for the personal switch (apps/web/app/api/connectors/account-state/route.ts:46-48). |
| Subscription | none found in the code for the switch itself. |
| Limits and metering | Maximum number of switched entries per user (constant CONNECTOR_ACCOUNT_STATE_MAX_ENTRIES, value not read); rate limit bucket 'chat-conversation'. |
| Feature flags | Release state limits the composer list. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | CLI and VS Code switches are local files and work with no cloud. Tauri local switch is on the device. Mobile Local mode: not applicable (no switch). Web: cloud only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| state not loaded | Switch disabled and text 'unavailable' with Retry. | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:91-92,950-959 |
| saving | Switch disabled while that connector is pending. | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:943 |
| limit reached | Validation error naming the limit and what to do. | apps/web/app/api/connectors/account-state/route.ts:68-73 |
| already on or off (CLI) | Message "already on" or "already off". | apps/cli/src/lib.rs:5004-5017 |
| running session (CLI) | Keeps the server until /mcp restart. | apps/cli/src/lib.rs:5013 |
| project-scope server (VS Code) | Not switchable. | apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:911 |
| offline, timeout, retry | not handled in the code read beyond the save error. | not found in files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/account-state/__tests__/route.test.ts`: Account state route (contents not read).
- `apps/web/features/connectors/hooks/__tests__/useConnectorsSettingsAdapter.test.tsx`: Adapter including switch (contents not read).
- `apps/desktop/src/features/mcp/__tests__/MCPServerCard.test.tsx`: Tauri card switch (contents not read).
- `apps/extension-vscode/src/__tests__/settingsLocalCapabilities.webview.test.ts`: VS Code settings switch rendering (contents not read).
- `apps/cli/src/mcp/registry.rs`: Registry unit tests (9) in the same file.

**Test scenarios**

- **Web off and on**
  1. Open a connected connector.
  2. Turn 'Use in chats' off.
  3. Send a chat that needs it.
  4. Turn it on and repeat.
  - Expected: Off: no tools from that connector; on: tools return; credentials unchanged.
- **Save failure**
  1. Block the PUT request.
  2. Flip the switch.
  - Expected: Error 'Could not save whether this connector is on.'; switch unchanged.
- **CLI switch**
  1. agi mcp disable demo
  2. agi mcp list
  3. agi mcp enable demo
  - Expected: list shows disabled then enabled; messages mention /mcp restart for running sessions.
- **Limit**
  1. Set switches on more than the maximum number of connectors.
  - Expected: Validation error naming the limit.

**Where to look when it fails**

- Audit event connector_setting_changed with status enabled or disabled.
- Table connector_account_states.
- CLI file ~/.agiworkforce/mcp.json: disabledServers.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md)
- Desktop: [70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md)
- CLI: [70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md)
- VS Code: [70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **Mobile has no on/off control though the route is shared.** Affects: Mobile users. Evidence: brief S58.13; no switch in apps/mobile/src/features/settings/cloud-connectors screens read. Work needed: Add switch using CONNECTOR_ACCOUNT_STATE_PATH.
- **Brief says VS Code is missing; code has a switch for user-scope servers.** Affects: Brief accuracy. Evidence: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:2536. Work needed: Update the brief.
- **Brief cites the organization MCP route as the toggle save path; that route is a different feature (workspace publish).** Affects: Brief accuracy. Evidence: apps/web/app/api/settings/organization/mcp/route.ts:235-270. Work needed: Correct the brief.
- **The exact place where chat omits disabled connectors was not traced.** Affects: Verification. Evidence: readDisabledConnectorIds imported in the route only. Work needed: Trace in tool-loop and add a test.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- mode:cloud
- mode:local
- table:connector_account_states
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- F058-02

## Unknown

- Value of CONNECTOR_ACCOUNT_STATE_MAX_ENTRIES.
- Where chat reads the disabled ids in the turn pipeline.
- Whether deleting a connector removes its connector_account_states row.
- Mobile switch: not found, but not every mobile file was read.
- Contents of the listed tests.
- The Tauri switch's persistence file (not traced).
