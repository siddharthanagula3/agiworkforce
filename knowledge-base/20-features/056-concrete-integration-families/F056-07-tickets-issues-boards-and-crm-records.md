---
id: "F056-07"
type: "feature"
title: "Tickets, issues, boards and CRM records"
aliases: ["Tickets, issues, boards and CRM records", "S56.25 Issue and task creation", "S56.26 Issue status updates", "S56.27 Project-management boards", "S56.28 CRM account/contact lookup", "S56.29 CRM opportunity updates", "S56.30 Support-ticket workflows", "project-management connectors", "CRM connectors", "help-desk connectors"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.25", "S56.26", "S56.27", "S56.28", "S56.29", "S56.30"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-model-catalog-and-routing", "mode:cloud", "surface:web", "surface:mobile", "surface:chrome", "surface:cli", "surface:vscode", "surface:desktop", "file:packages/contracts/types/src/connector-release.ts", "file:apps/web/lib/user-connector-tools.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-07 Tickets, issues, boards and CRM records

Lets the AGI assistant, in a Cloud chat turn, use a connected tracker, board, CRM or help desk (for example Jira, Linear, HubSpot, Intercom) through that vendor's hosted MCP server. Today the global connector release state is coming_soon, so only Jira, Linear, Monday, ClickUp, Airtable and Todoist can reach a turn. CRM and help-desk connectors are withheld.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.25](../../10-requirements/capabilities/056-concrete-integration-families.md#s5625), [S56.26](../../10-requirements/capabilities/056-concrete-integration-families.md#s5626), [S56.27](../../10-requirements/capabilities/056-concrete-integration-families.md#s5627), [S56.28](../../10-requirements/capabilities/056-concrete-integration-families.md#s5628), [S56.29](../../10-requirements/capabilities/056-concrete-integration-families.md#s5629), [S56.30](../../10-requirements/capabilities/056-concrete-integration-families.md#s5630).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** The assistant lists the tools a connected vendor server offers (create or read issues, tasks, boards, CRM objects, tickets), asks the model to call them during a chat turn, and shows an approval card before the call runs. The vendor, not AGI, decides which tools exist; AGI adds the approval rules, the plan limits and the release gate (apps/web/lib/connectors/catalog.ts:94-103 for the record shape; apps/web/lib/user-connector-tools.ts:2437).

**Why it exists.** Claude and ChatGPT let people work with their trackers, CRMs and help desks from chat. The founder decision says connectors the leaders ship are built (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-08).

**Who uses it.** A signed-in person on a paid managed plan who has connected a vendor account: a product manager, a developer, a salesperson or a support agent. Free, own-key (byok) and local-only plans do not get the connectors capability (packages/contracts/types/src/billing-catalog.ts:351 and the PAID_TIERS list at :332-340).

**Problems it solves**

- Moving between chat and the tracker or CRM to copy data by hand.
- Writing a ticket or deal update from a chat summary.
- Looking up a deal, account or ticket without opening the vendor site.

**Use cases**

- Ask the assistant to turn a chat summary into a Jira issue and approve the create call.
- Ask for the status of a Linear issue or a Monday or ClickUp board.
- Ask for the owner and stage of a HubSpot deal (HubSpot is not released today, so this is the required behaviour, not the current one).
- Ask the assistant to change an issue status and approve the change.

## 2. User experience

**Where to find it**

- Web: the Connectors page (apps/web/app/connectors/page.tsx) and the Connectors section of the settings modal (packages/ui/ui/src/settings-modal/SettingsModal.tsx); an unreleased connector shows 'Coming soon' (packages/contracts/types/src/connector-release.ts:38).
- Desktop: the public Electron Desktop shows the hosted web app, so it uses the same screens (doc: AGENTS.md section 5; doc: docs/product/surface-feature-matrix.md:385). The retained Tauri code has its own connector files (apps/desktop/src/features/connectors/) that the public Desktop does not show (doc: AGENTS.md section 5).
- Mobile: Settings, Connectors (apps/mobile/src/features/settings/cloud-connectors/index.tsx). Rows of unreleased connectors read 'Coming soon' (index.tsx:162-164). It needs a signed-in account and Cloud mode (index.tsx:519).
- CLI: `agi connectors` lists connected connectors and `agi connectors disconnect <id>` removes one (apps/cli/src/lib.rs:7375-7410). Connecting is done in a browser through a link (apps/cli/src/cloud/connectors.rs:169-173 area, function connect_url).
- VS Code: the Connectors tree with a 'Manage Connectors' item that opens the web app (apps/extension-vscode/src/features/connectors/connectorsTree.ts:15-16, :123-135).
- Chrome: no connector screen of its own. The side panel shows the approval and input forms of a Cloud turn and a coming-soon lock (apps/extension/src/features/cloud-bridge/capabilityDocument.ts:80; apps/extension/src/features/side-panel/bubbles.ts:1142).

**Before you start**

- A signed-in AGI account on a paid managed plan (billing-catalog.ts:351).
- The connector id is released (connector-release.ts:16-30 lists the 13 released ids).
- The operator configured the vendor OAuth client for pre-registered vendors such as HubSpot, Asana, Intercom (doc: docs/runbooks/connector-oauth-apps.md, section 'Descriptor entries').
- The person connected the vendor account.
- A chat model that supports tools; a model whose registry capability tools is false gets no connector tools (apps/web/app/api/llm/v1/chat/completions/route.ts:788-791).

**Screens and controls**

- Connector card with Connect, status ('Connected', 'Needs reauthorization', 'Not responding'; mobile index.tsx:150-160).
- Tool Permissions panel: groups 'Read-only tools' and 'Write and delete tools'; per tool levels 'Always run without asking', 'Needs approval each time', 'Never run this tool'; a 'Reset all to default' action (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:46-100).
- Approval card in chat with 'Allow once', 'Allow for this chat', 'Always allow', 'Deny' (packages/contracts/types/src/tool-approval-policy.ts:23-31).
- Activity timeline row 'Needs approval' (packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:341).

**Journey**

1. Open Connectors and connect the vendor (OAuth sign-in in a browser).
2. Optionally open Tool Permissions and set tools to allow, ask or deny.
3. Start a chat on a model that supports tools and ask for the lookup or change.
4. The turn shows a tool step; for a tool that needs approval the run pauses and shows an approval card.
5. Choose Allow once, Allow for this chat, Always allow (only where permitted) or Deny.
6. The server calls the vendor server, fences the result as untrusted data and the model answers using it.
7. If the vendor sign-in expired the model sees a reconnect tool and the person is told to reconnect (user-connector-tools.ts:2536-2539 area).

**What the person sees and gets**

- Tool step with status and elapsed time in the timeline.
- Approval card naming the connector and tool.
- Plain error text from the vendor server, fenced as untrusted (user-connector-tools.ts:273-290).
- CLI prints a reconnect notice with a link (apps/cli/src/cloud/connectors.rs:25-38).

**Settings**

- Per-tool permission levels saved per account (table connector_tool_permissions, connector-tool-permissions.ts:68-90).
- Account tool-approval default: ask_every_time, auto_approve_read_only or autonomous (packages/contracts/types/src/tool-approval-policy.ts:3-9).
- Per-chat and per-account connector off switches (connector-tool-permissions.ts, readDisabledConnectorIds).
- Workspace connector policy for organization members (apps/web/lib/services/connector-policy-service.ts, used at user-connector-tools.ts:2491-2500).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- A generic remote-MCP client builds a tool catalog per connected vendor and runs calls with the person's own token (apps/web/lib/user-connector-tools.ts:2437-2600).
- Approval gating exists: tool metadata, per-tool allow/ask/deny, session grants and a lock-down mode (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts, connector-tool-permissions.ts).
- Hosted MCP endpoints are pinned for Linear, Jira, Asana, Monday, ClickUp, Airtable, Todoist, HubSpot, Intercom (apps/web/lib/connectors/mcp-endpoints.ts:11,41,47,78,90,115,145,151).
- Per-plan tool count limits are enforced when the catalog is built (user-connector-tools.ts:177-181; billing-catalog.ts:626,643,662,682,700).
- Released and connectable in principle today: Jira, Linear, Monday, ClickUp, Airtable, Todoist (connector-release.ts:16-30).
- Jira directory entry names getJiraIssue, createJiraIssue, searchJiraIssuesUsingJql; Asana names search_tasks, get_task, create_tasks, update_tasks; HubSpot names search_crm_objects, manage_crm_objects, query_crm_data (apps/web/lib/connectors/directory/sources/first-party.json entries jira, asana, hubspot). Linear, Monday and ClickUp list no tool names, so their tools are known only after connecting (first-party.json).

**Incomplete**

- Lookups do not run without approval for these connectors. Their tools are undeclared in AGI's metadata, and an undeclared tool resolves to an irreversible write with an egress path (tool-metadata.ts:876-882). The comment on policyAutoApprovesTool says an undeclared connector tool still asks, even under autonomous (tool-metadata.ts:1066-1083). Only a saved per-tool Always allow, or an allow for this chat, removes the prompt.
- The Read-only tools category in Tool Permissions looks up a tool's action class, and an undeclared tool counts as a write, so that category does not cover these vendor tools (connector-tool-permissions.ts, function lookupLevel, about line 190).
- Jira has no update or transition tool in its listed tool names (first-party.json, jira entry), so 'update an issue status' on Jira depends on what the vendor server returns after connecting [inferred].
- No test was found that drives an issue create, a CRM lookup or a ticket action end to end.

**Present but disconnected or switched off**

- CONNECTOR_RELEASE_STATE is 'coming_soon' (packages/contracts/types/src/connector-release.ts:14). HubSpot, Asana, Intercom, Salesforce, Zendesk, Freshdesk and Pipedrive are not in the 13-id selective release list, so connectorReleased returns false and their tools never reach a turn (user-connector-tools.ts:2491-2493, :2537, :2572). GET /api/connectors drops them from the available list (apps/web/app/api/connectors/route.ts:187).
- The test packages/contracts/types/src/__tests__/connector-release.test.ts lists gmail, github, paypal, plaid, stripe, bank-accounts, slack, vercel as not released; the same logic holds for the CRM and help-desk ids [inferred].
- The capability handshake removes canUseConnectors only when no connector at all is released (apps/web/lib/services/capability-handshake-service.ts:99-111); with 13 released ids it stays on for paid plans [inferred].
- Pre-registered vendors need an operator client pair. The runbook says Asana, Intercom and others still need a vendor-side step (doc: docs/runbooks/connector-oauth-apps.md, section 'Vendors that advertise registration and refuse it').

**Not available**

- Salesforce has a catalog entry (catalog.ts:195) but no pinned MCP endpoint in mcp-endpoints.ts and no URL in the vendor directory snapshot, so it needs an operator descriptor in CONNECTOR_OAUTH_PROVIDERS_JSON (oauth-setup.ts:describeConnectorSetup, oauth2 branch).
- Zendesk and Freshdesk are api-key entries with no remote endpoint, so describeConnectorSetup answers 'no remote MCP server this deployment can reach' (catalog.ts:240-241; oauth-setup.ts:155-162).
- CLI: no connector tools of its own; connector tools run only inside a managed Cloud turn and the CLI relays approvals (apps/cli/src/models/managed_approvals.rs:1-40; apps/cli/src/models/streaming.rs:1030-1050). Issue creation, boards and tickets are therefore not a separate CLI capability.
- VS Code: shows a connector list only; no connector tool code of its own was found (apps/extension-vscode/src/features/connectors/).

## 4. Required behaviour

**Established requirements**

- The assistant can create an issue or task in a connected tracker, after approval. (source: brief S56.25)
- The assistant can update an issue's status or fields in a connected tracker. (source: brief S56.26)
- The assistant can view and work with project boards in a connected project-management tool. (source: brief S56.27)
- The assistant can look up CRM accounts and contacts in a connected CRM. (source: brief S56.28)
- The assistant can update CRM opportunities and deals, after approval. (source: brief S56.29)
- The assistant can search, read and act on support tickets in a connected help desk. (source: brief S56.30)
- Where ChatGPT or Claude ships a connector capability, it is built. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-08))
- Connectors stay 'coming soon' on every plan until CONNECTOR_RELEASE_STATE is released. (source: doc: docs/product/definition.md:309)

**Acceptance criteria**

1. With a Jira connection on a paid plan, asking for a new issue shows an approval card, and no issue exists in Jira until Allow is chosen.
2. After Deny, the vendor server receives no create call and the assistant says it did not run.
3. With HubSpot not released, the HubSpot card reads 'Coming soon' on web and mobile and no HubSpot tool is offered to the model.
4. On the Free plan, no connector tool is offered (maxConnectorTools 0, billing-catalog.ts:626).
5. A tool set to 'Never run this tool' is not offered to the model.
6. Vendor error text reaches the model fenced as untrusted data.
7. After disconnecting, the connector's tools are gone from the next turn and its saved tool permissions are removed (CLI confirm text, apps/cli/src/lib.rs:7391-7396).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Lookups should run without approval when the policy is auto_approve_read_only, but that only holds for declared read tools; vendor tools are undeclared, so the brief line 'lookups run without approval' is not met today [inferred from tool-metadata.ts:1083].
- Release of CRM and help-desk connectors needs the global state or an id added to the selective list [inferred from connector-release.ts:52-58].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Treat a vendor tool whose server annotation says read-only as read for the Read-only tools category, but only after the platform confirms it by a named allow list, since annotations are untrusted (tool-metadata.ts:885-899).
- [proposed] Declare metadata for the common Jira, Linear, HubSpot and Intercom read tools so lookups can run unasked under auto_approve_read_only.
- [proposed] Add an end-to-end test per released connector for create, update and lookup.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | connector-release.ts | `packages/contracts/types/src/connector-release.ts` | Global release state and the 13 selectively released connector ids; connectorReleased() decides what reaches a turn. |
| config | CONNECTOR_CAPABILITIES | `apps/web/lib/connectors/catalog.ts` | Per-connector record: auth scheme, runtime-discovered actions, risk class (lines 183-197 for Linear, Jira, Asana, HubSpot, Salesforce, Intercom; 240-241 Zendesk, Freshdesk). |
| config | MCP_ENDPOINTS | `apps/web/lib/connectors/mcp-endpoints.ts` | Pinned hosted MCP URLs and client registration mode per vendor. |
| config | first-party directory | `apps/web/lib/connectors/directory/sources/first-party.json` | Pinned directory entries with known tool names (Jira, Asana, HubSpot, Intercom, Monday, ClickUp). |
| service | loadUserConnectorToolCatalog | `apps/web/lib/user-connector-tools.ts` | Builds the per-turn tool list from connected, released, permitted connectors and applies the plan tool limit. |
| service | connectorsAllowedForTurn | `apps/web/lib/connectors/connector-capability.ts` | Plan check, release check and operator kill switch for connectors on a turn. |
| service | tool-metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declares action class, reversibility and risk tier; undeclared tools resolve to an irreversible write. |
| service | connector-tool-permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Saved allow/ask/deny per tool, session grants, critical tools ask every time. |
| service | tool-approval-policy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Loads the account's default approval policy. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | The chat turn that loads connector tools (lines 788-860) and runs the tool loop. |
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Receives the person's approval decision and resumes the paused run. |
| endpoint | GET/POST/DELETE /api/connectors | `apps/web/app/api/connectors/route.ts` | Lists connectors, available ids (filtered by release, line 187), starts connect, disconnects. |
| endpoint | /api/connectors/permissions | `apps/web/app/api/connectors/permissions/` | Reads and saves per-tool permission levels. |
| component | ToolPermissionsPanel | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Per-tool allow/ask/deny UI on web and the hosted Desktop. |
| component | ToolApprovalCard | `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Approval card in web chat. |
| screen | Connectors screen (mobile) | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list, connect, 'Coming soon' labels (line 162). |
| component | AgentActivityTimeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Mobile tool step and approval display. |
| component | Side panel bubbles | `apps/extension/src/features/side-panel/bubbles.ts` | Chrome approval actions and connector input form (lines 1129-1143). |
| component | connectorsTree | `apps/extension-vscode/src/features/connectors/connectorsTree.ts` | VS Code connector list and Manage Connectors command. |
| service | cloud connectors client | `apps/cli/src/cloud/connectors.rs` | CLI list, disconnect, reconnect notice. |
| service | managed approvals | `apps/cli/src/models/managed_approvals.rs` | CLI prompts for connector approvals and resumes the run. |
| table | connector_tool_permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Saved per-tool level, destructive flag (insert at lines 80-90). |
| table | connector_oauth_grants | `apps/web/lib/connectors/oauth-store.ts` | Encrypted vendor tokens per account (insert at line 302). |
| config | BILLING_PLAN_PRODUCT_LIMITS | `packages/contracts/types/src/billing-catalog.ts` | Connector capability tiers (line 351) and tool counts per plan. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person types a request in chat on web, mobile, Chrome, CLI or VS Code. Desktop shows the web app. | device | doc: AGENTS.md section 5; apps/mobile/src/features/settings/cloud-connectors/index.tsx:519 |
| The client sends a Cloud chat turn to AGI's chat endpoint. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:794 |
| The server checks the plan, the release state and the operator kill switch. | our servers | apps/web/lib/connectors/connector-capability.ts:23-58 |
| The server loads the saved per-tool permissions and the account approval policy. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:93-122 |
| The server asks each connected, released vendor MCP server for its tools using the person's stored token, then trims to the plan's tool limit. | outside service | apps/web/lib/user-connector-tools.ts:2437-2600, :177-181 |
| The model picks a tool. The server checks the gate; an undeclared tool needs approval, so the run pauses and the client shows an approval card. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:876-882, :1083-1100 |
| The person decides on the device; the decision is sent to the approve endpoint. | device and our servers | apps/web/app/api/llm/v1/chat/completions/approve/route.ts; apps/cli/src/models/streaming.rs:1035-1047 |
| The server calls the vendor MCP server; the vendor creates or reads the record. | outside service | apps/web/lib/user-connector-tools.ts:211-225 |
| The result or error is fenced as untrusted data and returned to the model, which writes the answer. | our servers | apps/web/lib/user-connector-tools.ts:273-290 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Vendor OAuth token | table connector_oauth_grants, encrypted | Server side; every app reads the same grant through the account | Removed on disconnect; the CLI text says the saved sign-in and tool permissions are removed and every surface loses the connector (apps/cli/src/lib.rs:7391-7396) |
| Per-tool permission level | table connector_tool_permissions | Account level, shared by all apps | Reset by 'Reset all to default'; removed on disconnect |
| Tool call arguments and results | Conversation record and run journal on our servers | Yes with the conversation | unknown: no connector-specific retention rule was read |

**Models and providers.** The chat model comes from the normal model catalog and routing; any model whose capability tools is true can call connector tools (route.ts:788-791). The vendor MCP server is an outside service. Provider choice does not change which connectors exist [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in AGI account. Mobile also needs Cloud mode (cloud-connectors/index.tsx:519). The CLI refuses connectors when the account tier lacks the capability (apps/cli/src/lib.rs:7377-7381). |
| Permissions | Per-tool allow, ask or deny; critical tools ask every time; organization connector policy can block members (user-connector-tools.ts:2491-2500); lock-down mode denies tools (connector-tool-permissions.ts, readLockdown). |
| Subscription | Connectors capability is for plans basic, pro, max, max_15x, team, team_premium and enterprise (billing-catalog.ts:332-351). Free, local-only and byok are not listed. |
| Limits and metering | Tool count per plan: free 0, basic 50, pro 150, max_15x 500, team 150 (billing-catalog.ts:626,643,662,682,700); a fallback of 32 when the plan has no product limits (user-connector-tools.ts:135, :177-181). Connector-specific usage metering: none found in the code read; the turn is metered as a normal Cloud turn [inferred]. |
| Feature flags | CONNECTOR_RELEASE_STATE and SELECTIVELY_RELEASED_CONNECTOR_IDS (connector-release.ts:14-30); operator kill switch for canUseConnectors (connector-capability.ts:27-37); request field connector_tools_enabled can switch connectors off for a turn (route.ts:795). |
| Model compatibility | Needs a model whose capability tools is true; otherwise no connector tools are offered (route.ts:788-791). |
| Provider restrictions | none found in the code for model providers. Vendor side: Asana, Intercom and others need operator-registered clients (doc: docs/runbooks/connector-oauth-apps.md). |
| Local mode | Not available. Connector tools load only in the Cloud chat route, and the byok and local-only tiers lack the connectors capability (billing-catalog.ts:351). Local inference on device does not call vendor tracker or CRM servers; whether any Local-mode path reaches a connector on mobile or Desktop is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connector not released | Card reads 'Coming soon'; its tools are not offered. | apps/mobile/src/features/settings/cloud-connectors/index.tsx:162-164; user-connector-tools.ts:2537 |
| Free plan | No connector tools; tool limit 0. | packages/contracts/types/src/billing-catalog.ts:626 |
| Sign-in expired | A reconnect tool is offered; the CLI prints a notice with a link. | apps/web/lib/user-connector-tools.ts:2538-2540; apps/cli/src/cloud/connectors.rs:25-38 |
| Vendor error | Error text fenced and truncated to 4,000 characters. | apps/web/lib/user-connector-tools.ts:243-290 |
| Vendor asks for more input | The run pauses on an input form (attended runs only); Chrome and mobile render the form. | apps/web/lib/user-connector-tools.ts:187-205; apps/extension/src/features/side-panel/connectorInputForm.ts; apps/mobile/stores/chat/chatExecutionStore.ts:503-512 |
| Approval resume expired or already finished | Mobile treats statuses 404, 409 and 410 as terminal. | apps/mobile/stores/chat/chatExecutionStore.ts:490-495 |
| Offline | not handled in the code read for connector calls specifically; the approval send shows 'Could not send your answer. Check your connection and try again.' on mobile. | apps/mobile/stores/chat/chatExecutionStore.ts:498 |
| Accessibility | Mobile rows carry accessibilityLabel with name and status; VS Code tree items carry accessibilityInformation. | apps/mobile/src/features/settings/cloud-connectors/index.tsx:166-171; apps/extension-vscode/src/features/connectors/connectorsTree.ts:54 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/connector-release.test.ts`: State is coming_soon, 13 released ids, exact-id matching, github, plaid, stripe, bank-accounts, slack, vercel stay unreleased.
- `apps/web/lib/connectors/__tests__/connector-selective-release.test.ts`: Selective eligibility needs an explicit opt-in before the kill switch is consulted.
- `apps/web/lib/connectors/__tests__/catalog-endpoints.test.ts`: Hosted endpoint auth scheme and risk class agree with the catalog.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.contract.test.ts`: Tool metadata contract (named for it; body not read in detail).
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.annotations.test.ts`: Annotations only move an undeclared tool toward asking (named for it; body not read in detail).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.permission-matrix.test.ts`: Allow/ask/deny matrix in the tool loop (named for it; body not read in detail).
- `apps/web/app/api/llm/v1/chat/completions/lib/connector-tools-reach-the-turn.test.ts`: Connector tools reach the turn (named for it; body not read in detail).
- `apps/web/features/connectors/components/__tests__/ToolPermissionsPanel.test.tsx`: Tool permission panel (named for it; body not read in detail).
- `apps/web/app/api/connectors/route.test.ts`: Connector list and connect route.
- `apps/extension/__tests__/connectors-coming-soon.test.ts`: Chrome coming-soon lock follows the capability document.
- `apps/cli/src/cloud/connectors.rs`: Inline tests for the disconnect receipt and terminal-control stripping (mod tests at line 237).

**Test scenarios**

- **Create an issue with approval**
  1. Sign in on a paid plan and connect Jira.
  2. Ask: create an issue titled X from this summary.
  3. When the approval card appears, choose Deny first, then repeat and choose Allow once.
  - Expected: Deny: no issue in Jira. Allow once: the issue exists and the assistant reports it.
- **Lookup asks too**
  1. Connect Linear on a paid plan.
  2. Set the account default to auto_approve_read_only.
  3. Ask for the status of an issue.
  - Expected: Per the code, the lookup still asks, because the Linear tools are undeclared. Record the real behaviour; a run that does not ask contradicts tool-metadata.ts:1083.
- **Unreleased CRM**
  1. Open Connectors on web and mobile.
  2. Find HubSpot and Intercom.
  - Expected: Both read 'Coming soon' and cannot be connected; asking the assistant for a deal returns no HubSpot tool call.
- **Free plan**
  1. Sign in on the Free plan.
  2. Open Connectors.
  - Expected: Connectors are not offered for use; no connector tool in a chat turn.
- **Disconnect**
  1. Run `agi connectors disconnect <id>` and confirm.
  2. Ask a new question that needed it.
  - Expected: The connector and its tool permissions are gone on every app.

**Where to look when it fails**

- Log line '[connector-policy] custom MCP host not approved; connector not dialled' (user-connector-tools.ts:2606 area).
- Log '[user-connector] Google-hosted connector withheld from a turn that may train'.
- GET /api/connectors/health returns per-connector health (apps/web/app/api/connectors/health/route.ts).
- Errors ConnectorToolPermissionStaleError and ConnectorToolPermissionChangedError (connector-tool-permissions.ts:93-111).
- Tables connector_tool_permissions, connector_permission_generations, connector_oauth_grants.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **Lookups ask for approval on vendor tools; the brief says lookups run without approval.** Affects: All apps; Jira, Linear, Monday, ClickUp, Airtable, Todoist today; HubSpot and Intercom after release.. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:876-882, :1066-1083. Work needed: Declare read metadata for named vendor tools or add a vetted read-only classification.
- **CRM and help-desk connectors are not released, so the 'done' status in the brief is not reachable by a user.** Affects: Web, Desktop, Mobile, Chrome, CLI, VS Code.. Evidence: packages/contracts/types/src/connector-release.ts:14-30. Work needed: Owner completes vendor client setup, then release the ids; live-check each.
- **Salesforce, Zendesk and Freshdesk have no connectable endpoint.** Affects: All apps.. Evidence: apps/web/lib/connectors/catalog.ts:195,240-241; apps/web/lib/connectors/oauth-setup.ts:155-162. Work needed: Pin a vendor MCP endpoint or accept custom connectors for them.
- **No end-to-end test for create, update or lookup on any released tracker.** Affects: Quality on all apps.. Evidence: No such test found in apps/web tests searched.. Work needed: Add contract tests with a fake MCP server.
- **CLI and VS Code have no tracker, board or CRM tooling of their own.** Affects: CLI and VS Code users.. Evidence: apps/cli/src/cloud/connectors.rs (list and disconnect only); apps/extension-vscode/src/features/connectors/. Work needed: Decide if reaching them through the Cloud turn is enough; document it.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-model-catalog-and-routing
- mode:cloud
- surface:web
- surface:mobile
- surface:chrome
- surface:cli
- surface:vscode
- surface:desktop
- file:packages/contracts/types/src/connector-release.ts
- file:apps/web/lib/user-connector-tools.ts

## Unknown

- Whether the account default approval policy for a new Cloud account is ask_every_time or autonomous; the contract names both (tool-approval-policy.ts:11,13) and the server parse default was not traced.
- Which tools Linear, Monday, ClickUp and Airtable expose today; they are discovered at connect time.
- Whether any Local-mode path on Desktop or mobile can reach a tracker or CRM.
- Whether tool call data has a connector-specific retention rule.
- Whether the OAuth start route refuses an unreleased connector; no release check was found in apps/web/app/api/connectors/oauth/start/route.ts.
