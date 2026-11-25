---
id: "F056-09"
type: "feature"
title: "Databases, warehouses and dashboards"
aliases: ["Databases, warehouses and dashboards", "S56.36 Database querying", "S56.37 Warehouse analysis", "S56.38 Dashboard creation", "Snowflake connector", "Databricks connector", "account-URL connectors"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.36", "S56.37", "S56.38"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "SYS-authorization-and-workspaces", "mode:cloud", "surface:web", "surface:mobile", "surface:desktop", "surface:chrome", "surface:cli", "surface:vscode", "file:apps/web/lib/connectors/account-url-connectors.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-09 Databases, warehouses and dashboards

Meant to let the assistant query a connected database, analyse a Snowflake or Databricks warehouse added by account URL, and create a dashboard in an analytics tool, all through vendor MCP servers in a Cloud turn. Today none of these connectors is in the released list, custom connectors are blocked by the release gate, and no read-only guard for queries exists in the code read.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.36](../../10-requirements/capabilities/056-concrete-integration-families.md#s5636), [S56.37](../../10-requirements/capabilities/056-concrete-integration-families.md#s5637), [S56.38](../../10-requirements/capabilities/056-concrete-integration-families.md#s5638).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Database and warehouse vendors publish MCP servers with query tools. AGI connects to them with the person's sign-in, offers their tools to the model and asks for approval before calls. Snowflake and Databricks are added by pasting the account's MCP server URL, because each account has its own address (apps/web/lib/connectors/account-url-connectors.ts:10-31).

**Why it exists.** Analysts and developers want answers from their data inside chat. The founder decision says Snowflake and Databricks are added by account URL, and the Google-hosted BigQuery server is not pinned because it needs a broader scope than the read-only ceiling (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-08).

**Who uses it.** Analysts, developers and data teams on a paid managed plan.

**Problems it solves**

- Copying SQL results into chat by hand.
- Hunting for the right warehouse endpoint format.
- Letting a model touch data without a human check.

**Use cases**

- Ask a question; the assistant runs a query through a database MCP server and shows the table.
- Add a Snowflake MCP server URL and ask about sales by region.
- Add a Databricks workspace server URL and run a SQL question.
- Ask an analytics tool such as PostHog or Datadog to build a dashboard (tool availability unknown).

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): Connectors; the Snowflake and Databricks cards open the custom connector form with a URL format hint (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:343-353, :795).
- Mobile: Settings, Connectors, with the same server list and 'Add custom connector' modal (apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx).
- CLI, VS Code and Chrome: no screen to add one; they see only a Cloud turn's tool steps and approvals.

**Before you start**

- Paid managed plan.
- A vendor MCP server URL for the warehouse (for Snowflake: https://<account>.snowflakecomputing.com/api/v2/databases/<database>/schemas/<schema>/mcp-servers/<server>; for Databricks: https://<workspace-hostname>/api/2.0/mcp/sql) (account-url-connectors.ts:12-31).
- Sign-in with an admin OAuth client or a personal access token (useConnectorsSettingsAdapter.tsx:347).
- Release of the connector id or of connectors in general (user-connector-tools.ts:2491-2493).

**Screens and controls**

- Custom connector form with the preset name, URL format, hint and documentation link.
- URL validation message: 'That is not a Snowflake MCP server URL. Use the form ...' (account-url-connectors.ts:44-46).
- Tool Permissions panel and approval cards.

**Journey**

1. Open Connectors and choose Snowflake or Databricks.
2. Paste the account MCP server URL; the form checks host and path.
3. Sign in with an OAuth client or token.
4. Ask a data question in chat.
5. Approve the query tool call; the assistant shows the result.

**What the person sees and gets**

- Query result text or table in the assistant answer.
- Validation error for a wrong URL.
- 'Needs approval' step in the timeline.
- Setup message when the deployment lacks the token encryption key (oauth-setup.ts:60-70).

**Settings**

- Per-tool permissions.
- Account tool-approval default.
- Workspace connector policy and approved MCP hosts (user-connector-tools.ts:2604-2610).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Account-URL presets and URL validation for Snowflake and Databricks (account-url-connectors.ts:10-47; custom-connector-creation.ts:72-77).
- POST /api/connectors answers a Snowflake or Databricks request with the custom-form preset instead of a directory toggle (apps/web/app/api/connectors/route.ts:638-660; the 409 branch is read by useConnectorsSettingsAdapter.tsx:795).
- Directory entries for Neon and Supabase exist with tools discovered at runtime (first-party.json, neon and supabase entries); the vendor directory snapshot lists PlanetScale and others (vendor-directory.json).
- The generic client fences tool output and applies approval gating (user-connector-tools.ts:243-290).

**Incomplete**

- Read-only queries are not enforced by AGI. A database tool is undeclared, so it is treated as a write that asks every time (tool-metadata.ts:876-882). No code was found that checks a query is a SELECT.
- Warehouse analysis was never live-checked with a real Snowflake or Databricks account (brief S56.37 'Unfinished').
- No dashboard-creation tool is declared anywhere in AGI. PostHog and Datadog are released with runtime-discovered tools, so whether a create-dashboard tool exists is unknown (mcp-endpoints.ts:59,84).
- No test was found for account-url-connectors.ts.

**Present but disconnected or switched off**

- Custom connectors, including account-URL ones, are blocked while the release state is coming_soon: dialPermitted calls connectorReleased on the custom server id and custom ids are never in the selective list (user-connector-tools.ts:2491-2493; connector-release.test.ts asserts custom-<id> is not released).
- Neon, Supabase, Snowflake, Databricks, BigQuery are not in SELECTIVELY_RELEASED_CONNECTOR_IDS (connector-release.ts:16-30).
- GET /api/connectors drops unreleased ids from available (route.ts:187), so the cards cannot connect [inferred].

**Not available**

- CLI and VS Code: no query tool of their own; reach data only through a Cloud turn.
- Mobile: no database code beyond the generic connector list; the brief cites an import line (cloud-connectors/index.tsx:44) as evidence, which is not a query feature.
- The brief's 'CLI: dashboards done' has no matching code; the cited chat.rs:969 is context compaction (apps/cli/src/agent/chat.rs:956-975).

## 4. Required behaviour

**Established requirements**

- The assistant can run queries against a connected database. (source: brief S56.36)
- The assistant can analyze data in a connected data warehouse. (source: brief S56.37)
- The assistant can create a dashboard in a connected analytics or BI tool. (source: brief S56.38)
- Snowflake and Databricks are added by account URL, not from a fixed list. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-08); apps/web/lib/connectors/account-url-connectors.ts:10)
- The Google-hosted BigQuery server is not pinned because it needs the full BigQuery scope and the Google ceiling stays read-only. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-08))

**Acceptance criteria**

1. Pasting a Snowflake URL with a wrong path is refused with the form hint.
2. A Databricks URL on an allowed host suffix with a valid path is accepted.
3. A query tool call shows an approval card before any query runs.
4. With the connector unreleased, no warehouse tool reaches the model.
5. A write statement through a database tool is refused or asks every time.
6. Disconnecting removes the connector and its tools from the next turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Read-only queries are expected by the brief wording 'queries are read-only unless the brief says otherwise' (the brief's own note); the code gives approval, not a read-only check [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer a read-only mode for database connectors by requiring a read-only vendor role at connect time and showing it on the card.
- [proposed] Add unit tests for ACCOUNT_URL_CONNECTORS host and path rules.
- [proposed] Declare a dashboard-create tool class as external write once a vendor tool is confirmed.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | ACCOUNT_URL_CONNECTORS | `apps/web/lib/connectors/account-url-connectors.ts` | Snowflake and Databricks URL formats, host suffixes and path checks. |
| service | custom-connector-creation | `apps/web/lib/connectors/custom-connector-creation.ts` | Validates a custom connector URL, including the account-URL rule (line 75). |
| endpoint | POST /api/connectors | `apps/web/app/api/connectors/route.ts` | Answers account-URL connectors with the custom-form preset (line 638). |
| endpoint | /api/connectors/custom | `apps/web/app/api/connectors/custom/route.ts` | Creates and lists custom connectors. |
| component | useConnectorsSettingsAdapter | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Turns the 409 answer into the custom connector preset (lines 343-353, 795). |
| component | SettingsModal | `packages/ui/ui/src/settings-modal/SettingsModal.tsx` | Shared settings UI that shows the custom form and cards. |
| config | first-party.json | `apps/web/lib/connectors/directory/sources/first-party.json` | Neon and Supabase pinned entries; tools discovered at runtime. |
| config | vendor-directory.json | `apps/web/lib/connectors/directory/sources/vendor-directory.json` | Vendor snapshot listing database and analytics servers. |
| config | CONNECTOR_CAPABILITIES | `apps/web/lib/connectors/catalog.ts` | snowflake (235), bigquery, databricks (237) records. |
| config | connector-release.ts | `packages/contracts/types/src/connector-release.ts` | Release gate that blocks these connectors. |
| service | loadUserConnectorToolCatalog | `apps/web/lib/user-connector-tools.ts` | Dials custom connectors only if released and host-approved (lines 2491-2610). |
| service | oauth-setup | `apps/web/lib/connectors/oauth-setup.ts` | Reports missing deployment setup per connector (account-URL: token storage). |
| service | tool-metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Undeclared tools are irreversible writes that ask. |
| component | ToolPermissionsPanel | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Per-tool permission UI. |
| screen | AddCustomConnectorModal | `apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx` | Mobile custom connector form. |
| table | user_custom_connectors | `apps/web/lib/user-connector-tools.ts` | Stores a person's custom connector rows (queries at lines 893, 943, 1137). |
| table | connector_oauth_grants | `apps/web/lib/connectors/oauth-store.ts` | Encrypted tokens for the signed-in connector. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Turn that offers the tools. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person adds the warehouse by URL in Connectors; the browser or phone sends it to AGI. | device | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:795 |
| The server validates host suffix and path and stores the encrypted connection. | our servers | apps/web/lib/connectors/custom-connector-creation.ts:72-77; account-url-connectors.ts:44-46 |
| In a chat turn the server dials the vendor MCP server and lists its tools, only if the connector is released and the host approved. | outside service | apps/web/lib/user-connector-tools.ts:2491-2493, :2599-2625 |
| The model proposes a query; the run pauses for approval on the device. | device and our servers | tool-metadata.ts:876-882, :1083 |
| The vendor runs the query on the person's warehouse and returns rows. | outside service | apps/web/lib/user-connector-tools.ts:211-225 |
| The server fences the result and gives it to the model, which writes the answer. | our servers | user-connector-tools.ts:273-290 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connection URL and token | user_custom_connectors and connector_oauth_grants, token encrypted | Server side | Removed on disconnect |
| Query result rows | Conversation records on our servers | With the conversation | unknown |

**Models and providers.** Any tool-capable chat model. The warehouse's own engine runs the query. Result rows pass through the chosen model provider route, which matters for privacy [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account. |
| Permissions | Per-tool allow, ask, deny; organization connector policy and approved hosts. |
| Subscription | Connectors capability on paid managed plans (billing-catalog.ts:351); custom MCP server count is limited by plan (getCustomRemoteMcpLimit used at route.ts:848). |
| Limits and metering | Connector tool limit per plan (billing-catalog.ts:626-700); query cost is on the person's warehouse account; AGI metering of connector calls: none found in the code read. |
| Feature flags | connector-release.ts; kill switch canUseConnectors. |
| Model compatibility | Model must support tools (route.ts:788-791). |
| Provider restrictions | Snowflake host must end in .snowflakecomputing.com; Databricks in .cloud.databricks.com, .gcp.databricks.com or .azuredatabricks.net (account-url-connectors.ts:16,22). |
| Local mode | Not available: custom connectors load in the Cloud chat route only, and local-only and byok plans lack the connectors capability (billing-catalog.ts:351). A local database tool on Desktop, CLI or mobile was not found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Wrong URL | Validation error with the expected form. | apps/web/lib/connectors/account-url-connectors.ts:42-47 |
| Deployment lacks token encryption key | 501 with a setup message. | apps/web/app/api/connectors/route.ts:640-655; oauth-setup.ts:60-70 |
| Host not approved by workspace policy | Connector not dialled; log '[connector-policy] custom MCP host not approved'. | apps/web/lib/user-connector-tools.ts:2604-2610 |
| Connector unreleased | No tools offered. | user-connector-tools.ts:2491-2493 |
| Sign-in expired | Reconnect tool offered. | user-connector-tools.ts:2538-2540 |
| Timeouts and retries for long queries | not handled in the code read for warehouse queries specifically. | searched user-connector-tools.ts and found no query-specific timeout |
| Offline | not handled in the code read for this feature. | none |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/custom/route.test.ts`: Custom connector route (named for it; body not read in detail).
- `apps/web/lib/connectors/__tests__/mcp-custom-connections.test.ts`: Custom MCP connections (named for it).
- `apps/web/lib/connectors/__tests__/custom-connector-credential.test.ts`: Custom connector credentials (named for it).
- `packages/contracts/types/src/__tests__/connector-release.test.ts`: custom-<id> is never released.
- `apps/web/lib/connectors/__tests__/catalog-endpoints.test.ts`: Catalog auth schemes for hosted endpoints.

**Test scenarios**

- **Reject a bad Snowflake URL**
  1. Open the Snowflake card and paste https://acme.snowflakecomputing.com/foo.
  - Expected: The form refuses it and shows the correct format.
- **Accept a Databricks URL**
  1. Paste https://<workspace>.cloud.databricks.com/api/2.0/mcp/sql.
  - Expected: The URL is accepted; sign-in is asked.
- **Release gate**
  1. With the current release state, connect a custom connector and start a chat.
  - Expected: No custom tool is offered, per the gate; record whether the UI explains why.
- **Approval before a query**
  1. With a released database connector, ask a data question.
  - Expected: Approval card first; the query runs only after Allow.
- **Write attempt**
  1. Ask the assistant to delete rows.
  - Expected: The call asks every time and the person can Deny; no code-level read-only refusal exists, so record what the vendor does.

**Where to look when it fails**

- Log '[connector-policy] custom MCP host not approved; connector not dialled'.
- POST /api/connectors 501 with setup field.
- GET /api/connectors/health per connector.
- Tables user_custom_connectors, connector_oauth_grants.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **No read-only guard for database queries.** Affects: All apps using Cloud turns.. Evidence: tool-metadata.ts:876-882 treats the tool as a write; no SQL check found.. Work needed: Decide the rule (vendor role, tool annotation allow list, or SQL check) and implement it.
- **Custom and warehouse connectors are blocked by the release gate.** Affects: Web, Desktop, Mobile, Chrome.. Evidence: user-connector-tools.ts:2491-2493; connector-release.test.ts. Work needed: Release state change or a selective rule for custom ids.
- **No live check of Snowflake or Databricks.** Affects: Quality.. Evidence: brief S56.37 'Unfinished'. Work needed: Owner live-check with real accounts.
- **No tests for account-URL rules.** Affects: Quality.. Evidence: No test file references ACCOUNT_URL_CONNECTORS.. Work needed: Add tests for host suffix and path patterns.
- **No dashboard-creation capability is declared; the brief's CLI 'done' is not backed.** Affects: All apps.. Evidence: apps/cli/src/agent/chat.rs:956-975 is compaction.. Work needed: Identify a vendor tool, declare it, and test.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- SYS-authorization-and-workspaces
- mode:cloud
- surface:web
- surface:mobile
- surface:desktop
- surface:chrome
- surface:cli
- surface:vscode
- file:apps/web/lib/connectors/account-url-connectors.ts

## Unknown

- Whether Snowflake or Databricks sign-in and a query tool run end to end; no record of a live check.
- Whether PostHog or Datadog tools can create dashboards.
- Whether any AGI code limits a query to read-only.
- Retention of query results.
- Which database tools Neon and Supabase expose; discovered at connect time.
