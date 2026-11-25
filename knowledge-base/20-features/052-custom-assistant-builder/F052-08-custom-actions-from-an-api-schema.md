---
id: "F052-08"
type: "feature"
title: "Custom actions from an API schema"
aliases: ["Custom actions from an API schema", "Custom-action schema", "Authentication configuration for actions", "S52.22", "S52.23", "GPT Actions style actions", "OpenAPI actions"]
area: "52 Custom-assistant builder"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.22", "S52.23"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "surface:cli", "surface:vscode", "surface:chrome", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "F052-07", "table:user_agents"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-08 Custom actions from an API schema

A planned way to turn an API description such as OpenAPI into actions an assistant can call, with sign-in settings for those calls. Nothing implements it in any app. The nearest existing pieces are MCP servers in the CLI agent file and the connector directory, which is currently hidden as coming soon.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.22](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5222), [S52.23](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5223).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a builder paste or upload an API schema, have the product list the operations as callable actions on one assistant, and store how calls sign in (API key or OAuth). Not built.

**Why it exists.** The area brief lists custom-action schema (S52.22) and authentication configuration for actions (S52.23) as parts of a complete assistant builder, matching how other assistant products let builders attach their own APIs (brief S52.22, S52.23).

**Who uses it.** Builders who own or use an API that no connector covers, for example an internal tool.

**Problems it solves**

- Reaching a private or niche API without waiting for a first-party connector.
- Keeping the API key or OAuth setup with the assistant rather than pasting keys into instructions.

**Use cases**

- A support lead links an internal ticket API and the assistant files tickets.
- A finance assistant calls a company reporting API with an API key.
- A developer imports an OpenAPI file for a staging service to test calls.

## 2. User experience

**Where to find it**

- No app has this feature: no screen, command or route was found in Web, Desktop, Mobile, CLI, VS Code or Chrome (searched apps, packages and crates for custom action, API schema and OpenAPI handling tied to agents).

**Before you start**

- Unknown: not designed in the code.

**Screens and controls**

- None exist. The Web agent form has no actions section (apps/web/features/agents/components/AgentConfigForm.tsx:333-672).
- The CLI agent file has no actions field; the nearest is mcpServers (apps/cli/src/agents.rs:1511-1514).

**Journey**

1. Not available. Today a builder can only choose among connectors and skills the person already has (AgentConfigForm.tsx:634-672), or in the CLI name MCP servers in the file.

**What the person sees and gets**

- None.

**Settings**

- None. The workspace connector policy covers website lists, not action schemas (apps/web/app/api/settings/organization/connector-policy/route.ts:75, 138).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.
- Closest existing control: the CLI agent file limits which MCP servers a session may use through mcpServers, enforced by mcp_server_permitted (apps/cli/src/agents.rs:125-127, 1511-1514; apps/cli/src/agent/mod.rs:1015-1022). This limits servers; it does not create actions from a schema.
- Closest web control: connector and skill selection on an agent (apps/web/lib/agents/agent-turn-config.ts:150-173).

**Incomplete**

- Web connector custom entries exist as a settings 'createEntry' action in the connector directory but are refused while connectors are coming soon (apps/web/features/connectors/lib/__tests__/connector-release-lock.test.ts:108-121). Whether that entry creates something schema-based was not opened: unknown.

**Present but disconnected or switched off**

- Connector custom creation is locked by the release state (packages/contracts/types/src/connector-release.ts:14; connector-release-lock.test.ts:108-121).

**Not available**

- Schema import, action list, per-action authentication, test-an-action (S52.24 is a neighbour item) on every app.
- Any table for action definitions: the user_agents migration has no such column or table (apps/web/db/neon/0370_user_agents.sql:44-76).

## 4. Required behaviour

**Established requirements**

- A builder can define custom actions from an API schema (for example OpenAPI) that the assistant can call. (source: brief S52.22)
- A builder can configure authentication (API key or OAuth) for an assistant's custom actions. (source: brief S52.23)
- Reusable plugins combine instructions with apps and tools; Custom GPTs and the GPT Store are a migration source, not AGI's enduring target architecture. (source: doc: docs/product/definition.md:183-184)
- OpenAI announced a custom-GPT retirement and plugin migration; this is a migration notice, so investigate reusable instructions, tools, sharing and migration rather than freezing an old GPT-builder design. (source: doc: docs/product/competitive-guidance.md:179)
- Secrets are never committed and security fails closed; Local, BYOK and Managed Cloud stay separate trust boundaries. (source: doc: AGENTS.md section 6)
- No mock production paths or dead controls. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A builder can add an API description and see the list of operations it produced.
2. Each action can be switched on or off for the assistant.
3. An API key or OAuth connection is stored without showing the secret again, and is used only for that action.
4. A call to the action from a chat shows what was sent and the result.
5. A teammate who runs a shared assistant uses the builder's saved sign-in only if the builder allowed it, and never sees the key.
6. Egress goes through the product's host-owned policy.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the product direction treats the GPT builder as a migration source, actions are likely to map onto MCP servers or connectors rather than a separate schema runtime [inferred from definition.md:183].
- Credentials need a server-side secret store; the agent table has none [inferred from 0370_user_agents.sql].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build actions on the existing connector and MCP layer: import a schema into a workspace-owned connector, then select it in the agent's connector list.
- [proposed] Keep credentials in the connector credential store and show only 'connected' status in the builder.
- [proposed] Add an action test button before publish.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | AgentConfigSchema (no actions field) | `packages/contracts/cloud-contracts/src/agents.ts` | Where an actions list would attach; it has connectorIds and skillNames only (lines 89-111). |
| table | table:user_agents | `apps/web/db/neon/0370_user_agents.sql` | Agent row with no action columns (lines 44-76). |
| table | table:user_agent_versions | `apps/web/db/neon/0370_user_agents.sql` | Published JSON copy; an actions list would be frozen here (lines 95-104). |
| service | agentAllowsConnector / agentConnectorSelection | `apps/web/lib/agents/agent-turn-config.ts` | Existing gate that limits tools by connector id (lines 150-173). |
| endpoint | chat completions connector tool filter | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Place where connector tools are filtered per agent (line 863). |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Global gate that keeps connectors, and custom creation, closed (line 14). |
| test | connector-release-lock test | `apps/web/features/connectors/lib/__tests__/connector-release-lock.test.ts` | Shows custom creation is refused while locked (lines 108-121). |
| component | AgentConfigForm connectors section | `apps/web/features/agents/components/AgentConfigForm.tsx` | Web UI that would host an actions section (lines 634-672). |
| command | mcpServers frontmatter and allowed_mcp_servers | `apps/cli/src/agents.rs` | CLI limit on MCP servers per agent; nearest CLI equivalent (lines 125-127, 1511-1514). |
| service | mcp_server_permitted | `apps/cli/src/agent/mod.rs` | Enforces the MCP server allowlist in a CLI session (lines 1015-1022). |
| service | MCP configuration in desktop | `apps/desktop/src-tauri/src/core/mcp/config.rs` | Desktop MCP server config; line 1261 handles an OPENAPI_MCP_HEADERS key, which I read as header handling for an OpenAPI-style MCP server, not an agent action builder [inferred]. |
| endpoint | api:GET /api/skills | `apps/web/features/agents/components/AgentEditorPage.tsx` | Skill list used by the agent form (SKILLS_PATH, line 41). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. Searches of apps, packages and crates found no agent-linked code that parses an API schema or stores action sign-in settings. | our servers | No file found; see implementation_map for where it would attach. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Action definitions and their sign-in settings | Not stored anywhere today | Not applicable | Not applicable |

**Models and providers.** Not applicable today. A future action call would be made by whichever model the agent runs on; the model must support tool calling, which the chat route checks (request-processor.ts:6334 resolvedModelCaps) [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code. The existing connectors capability is limited to paid plans (packages/contracts/types/src/billing-catalog.ts:352) which a future action feature could reuse [inferred]. |
| Limits and metering | none found in the code |
| Feature flags | Connector release state would gate it if built on connectors (connector-release.ts:14). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not available in any mode. A Local-mode action call would have to follow the egress rule that Local data never silently leaves the device (AGENTS.md section 6) [doc]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state | not handled in the code; the feature does not exist. | No implementation found. |
| Nearest user-visible message | The connectors area says 'Connectors are coming soon.' | packages/contracts/types/src/connector-release.ts:35 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/connectors/lib/__tests__/connector-release-lock.test.ts`: Custom creation and installs are refused while connectors are locked; not an action builder test.

**Test scenarios**

- **Confirm absence on Web**
  1. Open /chat/agents/new and scroll the whole form.
  - Expected: No section for actions or schema import.
- **Confirm absence in the CLI**
  1. Run /agents help and /agents set with an unknown field such as actions.
  - Expected: The field list is description, model, color, tools, disallowedTools, skills, maxTurns, maxBudgetUsd, permissionMode, prompt; actions is refused as unknown.
- **Confirm no schema column**
  1. Read the user_agents table definition in the 0370 migration.
  - Expected: No column for actions or schemas.

**Where to look when it fails**

- Search the repo for custom action code before building: none expected.
- Check connector release state before testing any custom entry.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Whole feature missing: no schema import, action list, call path or sign-in settings.** Affects: All six apps. Evidence: No implementation found; brief S52.22 and S52.23 mark every app missing. Work needed: Design on the connector and MCP layer, add storage for credentials, add UI on Web and Mobile, add enforcement in the chat route.
- **Product direction on actions is not decided in the docs; only the GPT builder is named a migration source.** Affects: Planning. Evidence: docs/product/definition.md:183-184. Work needed: A decision record before building.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- surface:vscode
- surface:chrome
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- F052-07
- table:user_agents

## Unknown

- Whether the connector directory's 'createEntry' builds anything schema-based; only its lock test was read.
- Whether the API docs page publishes an OpenAPI file for AGI's own API (apps/web/app/api-docs/page.tsx mentions OpenAPI); this is not an import of a builder's schema and was not read.
- Intended auth model for action credentials.
