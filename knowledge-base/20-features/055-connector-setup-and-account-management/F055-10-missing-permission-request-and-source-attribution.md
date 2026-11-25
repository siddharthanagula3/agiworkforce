---
id: "F055-10"
type: "feature"
title: "Missing-permission request and source attribution"
aliases: ["Missing scope request", "Connector connect card", "agi_connector_authorization_required", "Reconnect card", "Re-consent", "Source attribution", "Provider attribution", "S55.29", "S55.30", "insufficient_scope"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S55.29", "S55.30"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "F055-07", "F055-08", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "api:GET /api/connectors/oauth/start", "table:connector_oauth_grants"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-10 Missing-permission request and source attribution

When a chat tool needs a connector that is not connected, expired, or lacks a permission, the tool returns a marker that the app turns into a card that offers Connect or Reconnect and lists the scopes. Each connector step is labelled with the provider name. CLI prints a sign-in command.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.29](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5529), [S55.30](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5530).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Server tools answer with agi_connector_authorization_required, naming the connector, tool, reason (not_connected, authorization_expired, insufficient_scope, authorization_unavailable), a connect URL and scopes. Clients show a card with a Connect or Reconnect link and a Retry button (apps/web/lib/connectors/connect-required.ts:52-70, packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx:15-40). Tool steps are labelled '<Provider> · <Tool>' (packages/contracts/cloud-contracts/src/mcp-tool-name.ts:44-52).

**Why it exists.** The assistant should not fail silently or invent data when a connector grant is missing; the person must see what to grant and where the data came from.

**Who uses it.** People chatting on Web, Desktop (hosted web), Mobile and the CLI with connectors.

**Problems it solves**

- A task stops with a vague error when a token expired or lacks a scope.
- People cannot tell which service supplied a fact.

**Use cases**

- Ask to read a calendar when the calendar connector is not connected: a 'Connect' card appears.
- A write needs an extra permission: card 'needs more permission' with scopes.
- CLI agent hits a remote MCP server needing a higher scope: message tells to run agi mcp login.
- See 'Notion · Search' in the activity timeline.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): under a failed connector step in the chat tool timeline (apps/web/features/chat/components/messages/ToolTimeline.tsx:206-212, 494-505).
- Mobile: card in the chat message (apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx).
- CLI: a warning notice and an error message with the command to run (apps/cli/src/cloud/connectors.rs notice; apps/cli/src/mcp/mod.rs:2584-2603).
- Chrome: connector name appears in the heading of a connector input form (apps/extension/src/features/side-panel/connectorInputForm.ts:68, 325); no connect card found.
- VS Code: not marked.

**Before you start**

- Signed in and a connector task in chat.
- Reconnect links need an OAuth app configured on the deployment; otherwise the card says the connector can't be connected here.

**Screens and controls**

- Card headline: 'Connect <name>', '<name> needs more permission' or 'Reconnect <name>', or '<name> can't be connected here' (ConnectorConnectCard.tsx:15-25).
- List 'This will request' (or 'Would request') with up to 8 scope chips and '+N more'.
- Link 'Connect <name>' or 'Reconnect <name>' and button 'Retry this turn' (ConnectorConnectCard.tsx:120-145).
- Mobile card: asks before a first connect, opens sign-in in place, and says Connecting does not resume the turn, use Retry this turn (apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx:147-252).

**Journey**

1. Ask the assistant for something that needs a connector.
2. The step fails with the marker and the card appears.
3. Press Connect or Reconnect; the provider consent page opens.
4. Return to chat and press 'Retry this turn'.
5. The answer's tool steps show the provider name.

**What the person sees and gets**

- Explanation text per reason, for example 'Your <name> authorization doesn't cover what <tool> asked for.'
- Mobile alert titles from connector authorization notices.
- CLI: '<name> needs reconnecting before <tool> can run. Open <url> to reconnect it, then ask again and the task continues from there.' (apps/cli/src/cloud/connectors.rs ConnectorReconnect.notice).

**Settings**

- None specific. Scope lists come from the reviewed ceiling per connector.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server builds the payload with reason, connect URL (OAuth start path), scopes and a model-facing message that tells the model not to retry (apps/web/lib/connectors/connect-required.ts:23-70).
- A 403 with insufficient_scope or a 401 refresh failure is turned into the right reason; 401 triggers one token refresh and one retry (apps/web/lib/user-connector-tools.ts:1575-1625, apps/web/lib/connectors/oauth-challenge.ts:29-34).
- OAuth start compares granted scopes with the connector's declared scopes; a widened list returns status scope_reconsent with the added scopes, so consent is asked again (apps/web/app/api/connectors/oauth/start/route.ts:316-330, apps/web/lib/connectors/scopes-escalation.ts).
- Scopes above the reviewed ceiling are dropped and logged: at provider registry load and at start (apps/web/lib/connectors/oauth-registry.ts:155-163, start/route.ts:322-327).
- The shared card is used by Web (ToolTimeline) and Mobile has its own card with an in-place sign-in (apps/mobile/__tests__/ConnectorConnectCardInPlace.test.tsx).
- Attribution: describeMcpTool returns serverLabel and 'Server · Tool'; custom connectors show 'Custom connector' (packages/contracts/cloud-contracts/src/mcp-tool-name.ts:36-52); MessageBubble passes connectorName (apps/web/features/chat/components/messages/MessageBubble.tsx:1024-1029, 1069-1073).
- CLI: tool results containing the marker are collected and printed as notices (apps/cli/src/cloud/connectors.rs:66-90); local MCP step-up scope is remembered, then 'Run agi mcp login <server> to grant it.' is shown and the next login requests the scope (apps/cli/src/mcp/mod.rs:1248-1258, 2584-2603).

**Incomplete**

- The reconnect link starts the OAuth start path for the connector; the 403 challenged scope is placed in the card's scope list, but the authorize request is built from the provider's declared scopes, not from the challenged scope (apps/web/app/api/connectors/oauth/start/route.ts:316-380) [inferred from reading; not tested]. The card can therefore show a scope the reconnect does not request.
- Chrome shows the provider only in the connector input form heading; provider naming on ordinary tool steps in Chrome was not found (brief says present).
- Brief line citations (apps/cli/src/mcp/mod.rs:669, ToolTimeline.tsx:280, tool-loop.ts:826, bubbles.ts:388) do not point at this behaviour.

**Present but disconnected or switched off**

- Connect links cannot work on a deployment without the OAuth app: card shows 'can't be connected here' (ConnectorConnectCard.tsx:15-35).
- Connectors are coming_soon for all but 13 ids (connector-release.ts:12-27).

**Not available**

- VS Code: no card found (brief: not marked).
- Mobile is marked n/a in the brief, but a card exists in code (apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx).
- Per-answer attribution line listing providers used in a reply: not found; attribution is per tool step.

## 4. Required behaviour

**Established requirements**

- When a task needs a scope the grant lacks, the product asks the user to grant that permission (S55.30). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.30)
- Answers or steps that used a connector name the provider that supplied the data (S55.29). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.29)
- Scopes above the reviewed list are dropped from the request and logged. (source: doc: draft in the task brief; code at apps/web/app/api/connectors/oauth/start/route.ts:322-327)
- Connect, discover, execute an allowed action, renew an expired token, revoke and reconnect must work against a real service account. (source: doc: docs/product/experience-contract.md W14)

**Acceptance criteria**

1. With the connector not connected, a tool call produces a card with headline 'Connect <name>' and a working link.
2. With an expired grant the card says 'Reconnect <name>' and explains it expired or was revoked.
3. With a 403 insufficient_scope the card says it needs more permission and lists the scopes.
4. After reconnecting and pressing 'Retry this turn', the turn runs and the step shows '<Provider> · <Tool>'.
5. When the deployment has no OAuth app, no connect link is shown.
6. A scope outside the ceiling is never present in the authorize URL.
7. CLI prints a command to run for a missing scope.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The scope that was challenged should be requested on reconnect, not only the declared list [inferred from the card text 'This will request'].
- Mobile should be marked as having the card [inferred from code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass the challenged scope to the OAuth start request and verify it against the ceiling.
- [proposed] Add one line under each answer that names the providers used.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ConnectorConnectCard | `packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx` | Shared card: headline, explanation, scope chips, Connect/Reconnect link, Retry this turn. |
| component | ToolTimeline connect request | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | findConnectRequest (206) and card render (about 494). |
| config | connector connect contract | `packages/contracts/types/src/connector-connect-required.ts` | Marker key, reasons, readConnectorConnectRequest, buildConnectHref. |
| service | connect-required builder | `apps/web/lib/connectors/connect-required.ts` | Builds and parses the authorization-required payload. |
| service | user-connector-tools auth handling | `apps/web/lib/user-connector-tools.ts` | Lines 1575-1625: challenge to reason mapping, refresh and retry. |
| service | oauth-challenge | `apps/web/lib/connectors/oauth-challenge.ts` | Parses WWW-Authenticate for insufficient_scope. |
| endpoint | GET /api/connectors/oauth/start | `apps/web/app/api/connectors/oauth/start/route.ts` | Starts authorization; scope reconsent status; policy checks. |
| service | scopes-escalation | `apps/web/lib/connectors/scopes-escalation.ts` | Compares granted and requested scopes; refused list. |
| service | oauth-scope-allowlist | `apps/web/lib/connectors/oauth-scope-allowlist.ts` | filterConnectorScopes drops scopes above the ceiling. |
| config | scope ceilings and descriptions | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Reviewed scopes and plain-language sentences. |
| service | describeMcpTool | `packages/contracts/cloud-contracts/src/mcp-tool-name.ts` | Provider label and tool label for steps. |
| component | MessageBubble connector labels | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Lines 1024 and 1069 pass provider names. |
| component | Mobile ConnectorConnectCard | `apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx` | Card with in-place sign-in and Retry this turn. |
| service | mobile connect sentences | `apps/mobile/src/features/chat/utils/connectorConnectSentences.ts` | Headline and explanation per reason. |
| service | CLI connector reconnect notices | `apps/cli/src/cloud/connectors.rs` | Collects and prints reconnect notices from tool results. |
| service | CLI MCP step-up | `apps/cli/src/mcp/mod.rs` | complete_step_up (1248), remember_step_up (1304), tool error text (2584-2603). |
| service | MCP HTTP transport authorize | `crates/agiworkforce-mcp/src/transport/http.rs` | Detects 401/403 and the step-up scope (line 252 onward). |
| store | McpServerOAuthStore step-up | `apps/cli/src/mcp/oauth_store.rs` | Saves and loads the pending step-up scope (line 225 onward). |
| component | Chrome connector input form | `apps/extension/src/features/side-panel/connectorInputForm.ts` | Provider label in a form heading (line 68, 325). |
| test | ConnectorConnectCard test | `packages/ui/unified-chat/src/components/__tests__/ConnectorConnectCard.test.tsx` | Card states. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model calls a connector tool; the server finds no grant, an expired grant or a 403 from the connector. | our servers | apps/web/lib/user-connector-tools.ts:1575-1625 |
| The server returns the authorization-required marker as the tool result, with connect URL and scopes, and tells the model not to retry. | our servers | apps/web/lib/connectors/connect-required.ts:23-70 |
| The client reads the marker from the failed step and renders the card. | device | apps/web/features/chat/components/messages/ToolTimeline.tsx:206-212 |
| Person presses Connect or Reconnect; the OAuth start route checks policy, builds the authorize URL with PKCE and redirects the person to the provider. | our servers | apps/web/app/api/connectors/oauth/start/route.ts:255-380 |
| Person approves at the provider, returns to the product and presses Retry this turn; the turn runs again with the new grant. | outside service | packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx:130-145 |
| CLI: the MCP transport returns an authorization fault with the challenged scope; the CLI stores it and tells the person to run agi mcp login. | device | apps/cli/src/mcp/mod.rs:2584-2603; crates/agiworkforce-mcp/src/transport/http.rs:252-270 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending OAuth authorization (state, PKCE verifier, requested scopes, return path) | table connector_oauth_authorizations | Server only | Expires with a time to live; deleted on disconnect |
| Granted scopes | table connector_oauth_grants | Account level | Replaced on reconnect |
| CLI step-up scope | OS credential store entry (store:keyring) | No | Deleted after the extra sign-in completes (apps/cli/src/mcp/mod.rs:1257) |

**Models and providers.** The model triggers the tool call and is told not to retry. The card text does not depend on the model. Provider names shown come from the connector catalog, not from an AI provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; start route also checks workspace access and connector policy (oauth/start/route.ts:255-270). |
| Permissions | Organization connector policy can block with policy_blocked (route.ts:268-272). |
| Subscription | Connectors capability: plan:basic, plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise (billing-catalog.ts:332-351). |
| Limits and metering | Authorization TTL for sensitive connectors (start/route.ts:354). No metering of cards found. |
| Feature flags | coming_soon release state with 13 released ids; kill switch canUseConnectors (connector-capability.ts:33). |
| Model compatibility | Only models that can call tools reach connector tools at all. |
| Provider restrictions | A connector needs a configured OAuth app on the deployment; otherwise connectUrl is null. |
| Local mode | Account connectors are Cloud only. CLI local MCP sign-in works on the device without the account. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not connected | Card 'Connect <name>'. | ConnectorConnectCard.tsx:15-27 |
| Expired or revoked | Card 'Reconnect <name>'. | ConnectorConnectCard.tsx:28-30 |
| Insufficient scope | Card '<name> needs more permission'. | ConnectorConnectCard.tsx:18-19 |
| No OAuth app configured | Dashed card, no link. | ConnectorConnectCard.tsx:15-27, 60-66 |
| Key-based connector on mobile | Sends the person to the detail screen for the key. | test apps/mobile/__tests__/ConnectorConnectCardInPlace.test.tsx:197 |
| Connector unreachable | Message 'Couldn't reach <label> just now. It is still connected, so try again in a moment.' | apps/web/lib/connectors/oauth-access.ts:469-471 |
| Authorization server changed | Reauthorize status with a message. | apps/web/app/api/connectors/oauth/start/route.ts:333-345 |
| Non-interactive CLI | login needs an interactive terminal. | apps/cli/src/mcp/mod.rs:1197-1199 |
| Cancel, timeout, offline | not handled in the card itself; sign-in outcome handled by the OAuth routes | ConnectorConnectCard.tsx read in full |
| Accessibility | Card has role group with the headline as label; scope list labelled 'Requested permissions'. | ConnectorConnectCard.tsx:62-79 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/__tests__/ConnectorConnectCard.test.tsx`: Shared card.
- `packages/contracts/types/src/__tests__/connector-connect-required.test.ts`: Marker parsing.
- `apps/web/lib/connectors/__tests__/connect-required.test.ts`: Payload builder.
- `apps/web/lib/connectors/__tests__/oauth-challenge.test.ts`: Challenge parsing.
- `apps/web/lib/connectors/__tests__/oauth-scope-allowlist.test.ts`: Ceiling filter.
- `apps/web/lib/connectors/__tests__/oauth-registry.scope-allowlist.test.ts`: Registry drops scopes above the ceiling.
- `apps/mobile/__tests__/ConnectorConnectCardInPlace.test.tsx`: Mobile card behaviours.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.connector.e2e.test.ts`: Connector tool loop end to end.
- `packages/contracts/cloud-contracts/src/__tests__/mcp-tool-name.test.ts`: Provider labels.

**Test scenarios**

- **Not connected**
  1. With no grant, ask for a connector action.
  - Expected: Card 'Connect <name>' with scopes and a link.
- **Expired grant**
  1. Revoke the grant at the provider.
  2. Ask again.
  - Expected: Card 'Reconnect <name>' after one refresh attempt.
- **Missing scope**
  1. Use a grant lacking a scope.
  2. Run a tool that needs it.
  - Expected: Card 'needs more permission' with scope chips.
- **Retry**
  1. Reconnect, return, press 'Retry this turn'.
  - Expected: Turn completes and the step label shows '<Provider> · <Tool>'.
- **Scope ceiling**
  1. Request a scope above the ceiling in the provider config.
  - Expected: Scope is dropped and logged; authorize URL lacks it.
- **CLI step-up**
  1. Call an MCP tool that returns 403 insufficient_scope.
  2. Run agi mcp login <server>.
  - Expected: Error tells the extra permission; login requests it.

**Where to look when it fails**

- Log '[connector-oauth] scopes above the reviewed ceiling were dropped from the request'.
- Log '[user-connector] OAuth connector tool execution failed'.
- Statuses scope_reconsent, policy_blocked, reauthorize on the start route.
- Table connector_oauth_authorizations.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)
- CLI: [70-qa/test-plans/cli/055-connector-setup-and-account-management.md](../../70-qa/test-plans/cli/055-connector-setup-and-account-management.md)
- Chrome: [70-qa/test-plans/chrome/055-connector-setup-and-account-management.md](../../70-qa/test-plans/chrome/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **The challenged scope may not reach the authorize request.** Affects: Web and Mobile Cloud connectors. Evidence: apps/web/app/api/connectors/oauth/start/route.ts:316-380 builds from provider scopes; user-connector-tools.ts:1599 passes only to the card. Work needed: Verify with a test; pass the challenged scope through the ceiling filter.
- **Chrome and VS Code have no connect card; Chrome shows the provider only on input forms.** Affects: Chrome, VS Code. Evidence: apps/extension/src/features/side-panel/connectorInputForm.ts:68. Work needed: Decide scope for extensions; document.
- **No single place states which providers supplied an answer.** Affects: All chat surfaces. Evidence: label per step only (mcp-tool-name.ts:44). Work needed: Add an answer-level attribution if required.
- **Brief marks Mobile n/a but a card exists.** Affects: Documentation. Evidence: apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx. Work needed: Correct the brief.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- F055-07
- F055-08
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- api:GET /api/connectors/oauth/start
- table:connector_oauth_grants

## Unknown

- Whether Chrome labels ordinary connector tool steps with a provider (only the input form was found).
- Whether the Desktop Electron wrapper renders the card identically (hosted web assumed per AGENTS.md section 5).
- The live behaviour of the web agi_reconnect card (brief item S55.20 says live check pending).
- Whether the 403 challenged scope reaches the authorize request in practice (code read only).
