---
id: "F057-09"
type: "feature"
title: "Connected services: calendar and messages"
aliases: ["Calendar tool", "Messaging tool", "Connected services", "Connectors", "Google Calendar connector", "Outlook connector", "Slack connector", "Teams connector", "S57.22", "S57.23"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.22", "S57.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "table:connector_call_events", "api:GET /api/connectors/calls", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "F057-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-09 Connected services: calendar and messages

The assistant can read or create calendar events and read or send messages through connected services, with approval. In the current code every hosted connector except a short released list is switched off: the release state is 'coming soon', and Slack, Google Calendar, Outlook and Teams are not on that list. So these tools are neither offered nor runnable today.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.22](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5722), [S57.23](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5723).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers connector tools to the model: Google Calendar and Slack through remote MCP servers, Outlook calendar and mail and Teams reads through built-in Microsoft Graph adapters. Sends and event creation ask for approval.

**Why it exists.** So the assistant can act on calendar and messaging apps the person already uses, with consent.

**Who uses it.** Signed-in people with a connected account, once connectors are released.

**Problems it solves**

- Reading a schedule without leaving chat.
- Posting or reading messages in a work chat app.
- Creating an event with invitees.

**Use cases**

- Ask 'what is on my calendar tomorrow' and the assistant lists events.
- Ask 'send the team a Slack update' and approve the send.
- Ask 'create a meeting with Sam at 3' and approve the Outlook event.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Connectors section (apps/web/app/connectors/page.tsx:25-27 opens settings section connectors); signed-out page headline 'Connectors bring your own tools into a thread' (page.tsx:30-33). Connector detail shows 'Coming soon' for unreleased connectors (apps/web/features/connectors/lib/connector-release-lock.ts:22-47).
- Per-connector tool permissions dialog titled '<connector> - ...' with levels, plus a 'Recent calls' list (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:262-290; apps/web/features/connectors/components/ConnectorCallLog.tsx:36).
- Mobile and Chrome: connector tools arrive through the same hosted route; mobile card file apps/mobile/src/features/chat/components/ToolCallTimeline.tsx.
- CLI and VS Code: hosted connector approvals are relayed to the terminal or editor in Cloud mode (apps/cli/src/models/managed_approvals.rs:126-143).

**Before you start**

- Connectors released for that connector id (packages/contracts/types/src/connector-release.ts:14-30).
- A paid plan (doc: docs/product/definition.md:303-309; test: apps/web/lib/connectors/__tests__/connector-release.test.ts:112).
- The service connected through OAuth; Google Calendar needs an OAuth client in the server setting CONNECTOR_OAUTH_PROVIDERS_JSON (doc: area brief S57.22 Unfinished; apps/web/lib/connectors/oauth-registry.ts:21).

**Screens and controls**

- Approval card buttons 'Allow', 'Allow for this chat', 'Deny' (packages/contracts/types/src/tool-approval-policy.ts:23-31; packages/ui/unified-chat/src/components/ToolCallCard.tsx:405-435).
- Per-tool permission levels in the Tool permissions dialog.
- CLI overlay 'Tool Approval' (apps/cli/src/tui/widgets/approval_overlay.rs:568).

**Journey**

1. 1. The person connects the service in Connectors (blocked today for unreleased ids).
2. 2. The person asks the assistant to read or send.
3. 3. The server offers the connector's tools for the turn.
4. 4. The model calls a tool; a send or create asks for approval, and a read of an undeclared tool also asks.
5. 5. The person allows or denies.
6. 6. The result returns; a call record is logged.

**What the person sees and gets**

- Tool card with status, arguments and result.
- 'Connection required: <connector>' summary when the service needs sign-in (apps/web/features/chat/components/messages/ToolTimeline.tsx:555-556).
- Coming-soon message 'Connectors are coming soon.' when a call hits an unreleased connector (apps/web/lib/user-connector-tools.ts:2766-2768).
- Call log outcomes 'Worked', 'Failed', 'Blocked here' (ConnectorCallLog.tsx:20-24).

**Settings**

- Tool access mode, tool approval policy and per-tool permission levels.
- Per-conversation connector switches via disabled_connector_ids (request-processor.ts:776-780).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Outlook adapter tools: search_mail, read_mail, list_events, send_mail, create_event; send and create are marked external send (apps/web/lib/connectors/microsoft-graph.ts:301-460; tool-metadata.ts:818-863).
- Teams adapter reads only: list_chats, read_chat_messages, list_teams, list_channels (tool-metadata.ts:853-858).
- Google Calendar tool names are declared in the directory: list_calendars, list_events, get_event, search_events, suggest_time, create_event, update_event, delete_event, respond_to_event (apps/web/lib/connectors/directory/sources/first-party.json:47-62).
- Slack is a preregistered remote MCP endpoint (apps/web/lib/connectors/mcp-endpoints.ts:157-162); its tool list is not declared in the directory (first-party.json:81-90).
- Approval for undeclared tools: an undeclared tool counts as an irreversible write with an egress path, so it asks (tool-metadata.ts:876-882).
- CLI relays hosted connector approvals to the terminal (managed_approvals.rs:126-143).

**Incomplete**

- Google Calendar needs the owner to create an OAuth client and add it to CONNECTOR_OAUTH_PROVIDERS_JSON (doc: area brief S57.22 Unfinished).
- Google Calendar and Slack tools have no declared risk metadata, so even reads ask (tool-metadata.ts:859-868 lists only outlook, onedrive, sharepoint, teams and others).

**Present but disconnected or switched off**

- Connector release state is coming_soon, and the selective list does not include slack, google-calendar, outlook or teams (packages/contracts/types/src/connector-release.ts:14-30). Tool discovery skips unreleased ids (apps/web/lib/user-connector-tools.ts:2492,2537) and execution refuses them (user-connector-tools.ts:2766-2768; apps/web/lib/services/connector-policy-gate.ts:147-153). This applies on all six apps because they share the hosted route.
- Authorization completion is also refused for an unreleased connector (apps/web/lib/connectors/finish-authorization.ts:65).

**Not available**

- Messaging send in Teams (adapter has read tools only).
- Calendar and messaging in Local mode and own-key mode (hosted connector route only).

## 4. Required behaviour

**Established requirements**

- Messaging sends only after the person approves the call. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.23)
- Calendar read and create run through the connector tools once the OAuth client exists. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.22)
- Without the OAuth client, the calendar connector cannot connect. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.22)
- Connectors stay 'coming soon' on every plan until the release state is released; connectors come with paid plans only. (source: doc: docs/product/definition.md:303-309)
- Approval prompts are required for external connector writes. (source: doc: docs/product/requirements.md section 9.7 (lines 768-780))

**Acceptance criteria**

1. While release state is coming_soon, no Slack or calendar tool is offered and a direct call returns the coming-soon message.
2. After release, an Outlook send_mail or create_event call always produces an approval request unless a saved Allow exists.
3. A saved Deny blocks the call and the model is told not to retry.
4. A Free account is withheld from released connectors (test: connector-release.test.ts:112).
5. A Slack send from an unattended run with untrusted content in context is denied rather than asked (gate rank 8).
6. The call log lists the call with outcome and duration but no arguments.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief's 'done' for messaging describes code that exists; it does not account for the release switch.
- [inferred] A saved 'Always allow' lets a send run without a prompt (tool-call-gate.ts:88-92), except under the untrusted-content-plus-private-data escalation (rank 3).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief status for S57.22 and S57.23 to disabled until release.
- [proposed] Declare Google Calendar and Slack tool metadata so reads can run without a prompt under the read-only policy.
- [proposed] Add Teams message send only after a design decision.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | connector release state | `packages/contracts/types/src/connector-release.ts` | Release switch and selective release list |
| service | user connector tools | `apps/web/lib/user-connector-tools.ts` | Builds connector tool defs, drops unreleased, guards execution |
| service | connector policy gate | `apps/web/lib/services/connector-policy-gate.ts` | Refuses unreleased connector use |
| config | MCP endpoints | `apps/web/lib/connectors/mcp-endpoints.ts` | Remote server addresses such as Slack |
| config | OAuth registry | `apps/web/lib/connectors/oauth-registry.ts` | Reads CONNECTOR_OAUTH_PROVIDERS_JSON |
| config | first-party directory | `apps/web/lib/connectors/directory/sources/first-party.json` | Google Calendar and Slack entries |
| service | Microsoft Graph adapter | `apps/web/lib/connectors/microsoft-graph.ts` | Outlook, OneDrive, SharePoint, Teams tools |
| config | tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Risk class per connector tool |
| config | call gate | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Approval decision table |
| service | connector tool permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Saved allow, ask, deny levels |
| service | finish authorization | `apps/web/lib/connectors/finish-authorization.ts` | Completes OAuth, refuses unreleased |
| component | ToolPermissionsPanel | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Per-tool permission dialog |
| component | connector release lock | `apps/web/features/connectors/lib/connector-release-lock.ts` | Shows 'Coming soon' in the directory |
| service | managed approvals (CLI) | `apps/cli/src/models/managed_approvals.rs` | Relays hosted approvals to the terminal |
| component | ToolCallTimeline (mobile) | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Mobile tool card with approval controls |
| component | side panel bubbles | `apps/extension/src/features/side-panel/bubbles.ts` | Chrome approval actions |
| test | connector release test | `apps/web/lib/connectors/__tests__/connector-release.test.ts` | Release gates and plan entitlement |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The turn builds the connector tool list; unreleased connector ids are skipped. | our servers | apps/web/lib/user-connector-tools.ts:2492,2537 |
| The model calls a tool; the gate returns allow, ask or deny from saved levels, policy and the injection escalation. | our servers | tool-call-gate.ts:68-126 |
| If ask, the stream pauses with an approval request; the client shows a card and sends the decision to the approve route. | device and our servers | tool-loop.ts:7808-7880; apps/web/app/api/llm/v1/chat/completions/approve/route.ts |
| Outlook and Teams calls go to the Microsoft Graph API with the person's token; Slack and Google Calendar go to remote MCP servers. | outside service | microsoft-graph.ts:20; mcp-endpoints.ts:157-162; first-party.json:47-50 |
| The outcome is logged without arguments or results. | our servers | apps/web/lib/services/connector-call-log-service.ts:52-70 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| OAuth connection and tokens | connector OAuth store (table name unknown) | account level | unknown |
| Call outcome | table connector_call_events | server side | the call log reads at most 100 entries (connector-call-log-service.ts MAX_LOG_ENTRIES) |
| Connector content | not stored by this feature; fenced as untrusted text in the turn | no | per chat retention |

**Models and providers.** Any tool-capable model on the hosted route. The connector service is an outside party. No provider-specific rule found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account and a connected service. |
| Permissions | Per-tool Allow, Ask or Deny; workspace connector policy gate; org dial policy (user-connector-tools.ts:2486-2495). |
| Subscription | Connectors are for paid plans only (doc: docs/product/definition.md:303-306); a Free account is withheld (connector-release.test.ts:112). |
| Limits and metering | MAX_CONNECTOR_TOOLS_PER_USER caps the tool count (apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:3,16). Per-call cost metering for connectors: none found in the code. |
| Feature flags | CONNECTOR_RELEASE_STATE and SELECTIVELY_RELEASED_CONNECTOR_IDS in code; CONNECTOR_OAUTH_PROVIDERS_JSON and CONNECTOR_OAUTH_REDIRECT_BASE_URL in server settings (oauth-registry.ts:21-22). |
| Model compatibility | Tool-capable models only. |
| Provider restrictions | none found in the code. |
| Local mode | Not available. Connector tools are built by the hosted route; Local and own-key chats are not routed there (apps/web/lib/user-connector-tools.ts). Mobile and Desktop Local behaviour: unknown beyond that. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unreleased connector | Tool not offered; a direct call returns the coming-soon message | user-connector-tools.ts:2537,2766-2768 |
| Service not connected | A connection-required card with Retry after sign-in | ToolTimeline.tsx:555-556; MessageBubble.tsx:1049-1054 |
| Approval expired | Card says the request expired and offers Resend | packages/ui/unified-chat/src/components/ToolCallCard.tsx:371-380 |
| Unattended run with risky mix | Denied instead of asked | tool-call-gate.ts:150-155 |
| Connector unreachable | Failure logged; three failures in 30 minutes mark it not responding | connector-call-log-service.ts:32-34 |
| Offline or timeout | not handled in the code beyond tool deadline errors | tool-loop.ts has TOOL_CALL_DEADLINE_MS use at line 5500; no offline branch found in microsoft-graph.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Coming-soon gate, paid-plan grant, Free withheld, pending authorization refused
- `apps/web/lib/connectors/__tests__/connector-selective-release.test.ts`: Selective release (name only)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts`: Approval ranks, undeclared connector tools treated as egress
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.connector.e2e.test.ts`: Connector tool loop (name only)
- `apps/web/lib/connectors/__tests__/connector-unreachable-adapters.test.ts`: Unreachable adapters (name only)
- `apps/web/features/chat/components/messages/MessageBubble.scopedApproval.test.tsx`: Allow once and Always allow buttons

**Test scenarios**

- **Release switch off**
  1. Open Settings, Connectors
  2. Look at Slack and Google Calendar
  3. Ask the assistant to read the calendar
  - Expected: Coming soon shown; no calendar tool offered
- **Send needs approval (after release)**
  1. Connect Outlook
  2. Ask to email someone
  3. Observe the card
  - Expected: An approval card appears; nothing sends until Allow
- **Deny returns to the model**
  1. Deny a send
  - Expected: The model is told the call was denied and does not retry
- **Call log**
  1. Open the connector tool permissions dialog after a call
  - Expected: Recent calls shows outcome and time, with no arguments
- **CLI relay**
  1. Use the CLI in Cloud mode with a released connector
  2. Trigger a send
  - Expected: The terminal asks 'Allow connector action' before it runs

**Where to look when it fails**

- Result text 'Connectors are coming soon.'
- Gate code 'connectors_coming_soon' (connector-policy-gate.ts:150).
- Table connector_call_events.
- Logger tag '[connector-call-log]'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **Brief says messaging is done on all apps; in code it is switched off for every unreleased connector.** Affects: All six apps and the API. Evidence: connector-release.ts:14-30; user-connector-tools.ts:2537. Work needed: Release the connector ids or correct the brief and tests.
- **Google Calendar OAuth client is not created.** Affects: All apps. Evidence: doc: area brief S57.22 Unfinished. Work needed: Owner creates the client and sets CONNECTOR_OAUTH_PROVIDERS_JSON.
- **Google Calendar and Slack tools have no risk metadata.** Affects: All apps after release. Evidence: tool-metadata.ts:859-868,876-882. Work needed: Declare per-tool metadata.
- **No Teams or other messaging send tool.** Affects: All apps. Evidence: tool-metadata.ts:853-858. Work needed: Design and add if wanted.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- table:connector_call_events
- api:GET /api/connectors/calls
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- F057-12

## Unknown

- The OAuth token table name.
- Whether Google Calendar tools are reachable at all without the OAuth client in any environment.
- Whether Slack offers read and send tool names (the directory lists none).
- Retention of connector_call_events rows.
- Mobile Local mode connector behaviour.
