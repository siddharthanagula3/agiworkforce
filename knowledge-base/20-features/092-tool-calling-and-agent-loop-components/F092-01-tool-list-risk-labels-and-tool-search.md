---
id: "F092-01"
type: "feature"
title: "Tool list, risk labels and tool search"
aliases: ["Tool registry", "Tool metadata", "PLATFORM_TOOL_METADATA", "Tool directory (load_connector_tools)", "Tool search", "Tool schema loader", "Tool access (Auto / On demand / Always available)", "Tool risk labels"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.01", "S92.02", "S92.03"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-model-catalog-and-routing", "SYS-security-and-privacy", "SYS-api-and-contracts", "F092-02", "F092-05", "surface:web", "surface:mobile", "surface:cli", "mode:cloud", "file:apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts", "file:apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-01 Tool list, risk labels and tool search

Every platform tool is declared once with four risk labels (what it does, whether it can be undone, whether it returns other people's content, whether it can send data out). Undeclared tools count as the riskiest kind. With many connected tools, only a budgeted, relevant set of schemas is sent; the rest sit behind a 'load_connector_tools' directory the model can query. Web server only.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.01](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9201), [S92.02](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9202), [S92.03](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9203).

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

**What it does.** Holds the one table that says, for each AGI platform tool, its action class (read, write, delete, execute, external_send), whether the effect is reversible, whether it returns untrusted content and whether it opens an outbound path (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:101). Connector tools (GitHub, Gmail, Outlook and others) have their own tables (tool-metadata.ts:863). Separately, it picks which connector tool schemas go to the model each turn and lists the others in a directory tool (apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:116).

**Why it exists.** Risk was once guessed from tool names; the file header says a name guess misclassifies send_email, post_comment and similar tools as harmless (tool-metadata.ts:1-12). Sending every connector schema also grows the prompt without limit, so a byte budget bounds it (tool-schema-loader.ts:27-30).

**Who uses it.** The model (it sees the offered tools). The approval gate and the loop read the labels. The person only sees the effect: fewer tool prompts for safe tools, more prompts for risky or unknown ones, and a Tool access setting.

**Problems it solves**

- A tool nobody classified cannot slip through as harmless: it resolves to an irreversible write with an egress path (tool-metadata.ts:876-882).
- Prompt size stays bounded when many connector tools are connected (tool-schema-loader.ts:116-163).
- A tool the ranking missed is still reachable: the model can load it by name or keyword (tool-loop.ts:3982-4027).

**Use cases**

- A user with Gmail, GitHub and Outlook connected asks to summarise a pull request; only tools matching the words of the request are sent first, the rest are listed in the directory.
- An MCP server adds a tool nobody declared; it is treated as an irreversible write and asks every time.
- A user picks 'Always available' in Capabilities so every connector tool schema is sent from the start (up to the larger budget).

## 2. User experience

**Where to find it**

- Web: Settings, Capabilities section, heading 'Tool access' with options Auto, On demand, Always available; shown only when the server lists the 'toolAccess' switch as available (apps/web/features/settings/sections/CapabilitiesSection.tsx:23-35,172-190).
- Mobile: Settings, Capabilities, Tool access options with the same three labels (apps/mobile/src/features/settings/capabilities/toolAccessPreferenceService.ts:21-37).
- Desktop: the public Electron Desktop shows the hosted web app, so the web screen applies (AGENTS.md section 5, doc: AGENTS.md).
- CLI: has its own tool list with deferred tools and a 'tool_search' tool, a separate implementation (apps/cli/src/tool_search.rs:123,465; apps/cli/src/platform/runtime/tool_catalog.rs:134-175).
- VS Code extension and Chrome extension: no tool-list code found in the files searched; unknown.

**Before you start**

- Hosted chat (Cloud mode) with at least one connector or MCP tool connected; with none, only built-in tools are offered and no directory tool appears (tool-schema-loader.ts:174-175).
- The Tool access control is hidden unless the account's available switches include 'toolAccess' (CapabilitiesSection.tsx:172).

**Screens and controls**

- Tool access radio group: 'Auto' (AGI chooses for you), 'On demand' (load tools when needed; more steps, lower accuracy), 'Always available' (ready from the start; fewer messages, better accuracy) (CapabilitiesSection.tsx:23-35).
- The model-facing directory tool 'load_connector_tools' takes 'names' (list) and 'query' (keywords, up to 200 characters) (tool-schema-loader.ts:173-200). The activity label for it is 'Load connector tools' (tool-loop.ts:1053).

**Journey**

1. The person types a request in chat.
2. The server resolves the account's Tool access mode (default Auto) (tool-loop.ts:3931-3937).
3. Connector tools are ranked against the words of the latest user turn and admitted until the budget is spent; the rest become directory entries (tool-schema-loader.ts:116-163).
4. If the model needs a hidden tool it calls load_connector_tools with names or keywords; the schemas are loaded and the tool says 'Call them on the next step' (tool-loop.ts:3982-4027).
5. The model calls the tool on its next step; the call goes through validation and approval like any other.

**What the person sees and gets**

- The loop emits a running/completed status event per call; the person sees a 'Load connector tools' row in the activity list [inferred from tool-loop.ts:1053].
- If nothing matches: 'No connected tool matched ...' as a tool error to the model (tool-loop.ts:4009-4015).
- If the directory is not offered this turn: 'The connector tool directory is not available on this turn.' (tool-loop.ts:5481-5487).

**Settings**

- toolAccess (modes auto, on_demand, always; default auto) (packages/contracts/cloud-contracts/src/tool-access-setting.ts:3-9).
- Default budget 32 tools and 24,000 bytes of schema; 'always' allows 32 tools and 96,000 bytes and ignores relevance; 'on_demand' admits none up front (tool-schema-loader.ts:21-47; apps/web/lib/user-connector-tools.ts:135; tool-schema-state.ts:4).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Metadata table for platform tools and several connectors with the four properties, plus optional riskTier, retrySafety, externalDelivery, autoInReadOnlyMode, readsPrivateData (tool-metadata.ts:68-99).
- Undeclared tools resolve to write, not reversible, untrusted content, egress, declared false (tool-metadata.ts:876-882). An MCP destructiveHint annotation can only raise an undeclared tool to delete (tool-metadata.ts:893-904).
- Risk tier is derived: read is low; delete or external_send is high if reversible else critical; other classes are medium if reversible else high (tool-metadata.ts:933-939).
- Only declared read-class tools count as parallel safe (tool-metadata.ts:1008; same rule in Rust at crates/agiworkforce-protocol/src/tool_primitive.rs:139-141).
- Relevance ranking: name match weight 3, server match 2, description 1; pinned (already loaded) tools first (tool-schema-loader.ts:9-12,116-163).
- Loaded schemas are kept: loaded names accumulate for the rest of the turn, are saved in checkpoints and re-pinned after a pause (tool-loop.ts:3938-3946,4003-4008; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-state.ts:7-30).
- Keyword search returns up to 8 matches scored by name and description (apps/web/lib/connectors/tool-search.ts:4,35-50).
- A call to a name that is not offered is refused with 'Unknown tool' or 'not available on this turn' and is not run (tool-loop.ts:2877-2881,4167-4171,7485-7491).

**Incomplete**

- The Rust protocol type ToolDefinition carries the same four labels and an undeclared builder, but the CLI catalog uses a separate struct with is_read_only, is_concurrency_safe and should_defer instead (crates/agiworkforce-protocol/src/tool_primitive.rs:58-128; apps/cli/src/platform/runtime/tool_catalog.rs:11-30,134-175).
- The brief's line numbers for this item no longer match the files (for example tool-loop.ts:2690 is inside the Office file tool branch, the schema selection is at 3938); the brief should be refreshed.

**Present but disconnected or switched off**

- Shadow ranking: a shortlist shadow run is scheduled when a decision scope exists; whether it changes what is sent is unknown (tool-loop.ts:3947-3958; apps/web/app/api/llm/v1/chat/completions/lib/tool-shortlist-shadow.ts).

**Not available**

- VS Code and Chrome extension tool lists: none found in the searched files.
- A user-facing screen listing the directory contents: none found.

## 4. Required behaviour

**Established requirements**

- One registry declares every platform tool with action class, reversibility, untrusted content and egress, and the loop consults it. (source: Brief S92.01)
- When many tools are connected a selector picks relevant schemas per turn and the rest stay discoverable. (source: Brief S92.02)
- Deferred tool schemas load on demand into the next step when the model asks. (source: Brief S92.03)
- An undeclared tool must be treated as the most dangerous shape it could be. (source: crates/agiworkforce-protocol/src/tool_primitive.rs:38-41 and tool-metadata.ts:876-882)
- Capabilities must include tool access mode and loading tools when needed; the product requirement lists modes Off, Ask/load when needed, Auto-load safe tools, Always available for the selected conversation. (source: doc: docs/product/requirements.md (section 16, Tool access modes) and docs/product/definition.md:285)

**Acceptance criteria**

1. A tool named in PLATFORM_TOOL_METADATA resolves to its declared labels; any other unqualified or connector tool resolves to write, irreversible, untrusted, egress, declared false.
2. With Tool access 'Auto' and more than 32 connector tools (or over 24,000 bytes of schema), the excess tools are absent from the request and listed in load_connector_tools.
3. With 'On demand', no connector schema is sent up front and the directory lists every connector tool.
4. With 'Always available', up to 32 tools within 96,000 bytes are sent regardless of relevance.
5. Calling load_connector_tools with an exact qualified name or a keyword makes that tool callable on the next step and it stays loaded for the rest of the turn.
6. With no connector tools, the directory tool is not offered.
7. A call to a tool name that was never offered returns an error result and does not run.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The product requirement names 'Off' and 'Auto-load safe tools' modes; the code has only auto, on_demand and always, so the requirement and code differ [inferred].
- Deferral hides schemas but does not remove the name from the callable set, since availableTools is built from all mcpTools (tool-loop.ts:4030-4036) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Refuse a call to a deferred tool whose schema was never loaded, or auto-load it, so the argument check always has the real schema.
- [proposed] Show the person which tools were loaded for a turn in the activity list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | PLATFORM_TOOL_METADATA | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Frozen table of declared platform tools and connector tables; resolveToolMetadata, risk tier, parallel safety, policy auto-approve |
| service | selectToolSchemas / expandDeferredToolSchemas / toolDirectoryToolDef | `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts` | Ranks connector tools, applies the byte and count budget, builds the directory tool definition |
| config | tool schema state | `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-state.ts` | Directory tool name, default 24,000-byte budget, checkpointed list of loaded tool names |
| service | searchToolsByKeyword | `apps/web/lib/connectors/tool-search.ts` | Keyword scoring used when the model passes a query |
| service | runToolLoop schema selection | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Resolves Tool access mode, selects schemas (3938), offers directory (3965), loads on request (3982) |
| config | toolAccess setting contract | `packages/contracts/cloud-contracts/src/tool-access-setting.ts` | Mode names, default and parser shared by web and mobile |
| component | CapabilitiesSection | `apps/web/features/settings/sections/CapabilitiesSection.tsx` | Web Tool access radio group |
| service | toolAccessPreferenceService | `apps/mobile/src/features/settings/capabilities/toolAccessPreferenceService.ts` | Mobile Tool access labels and preference |
| component | ToolAccessOptions | `apps/mobile/src/features/settings/capabilities/ToolAccessOptions.tsx` | Mobile Tool access options screen |
| schema | ToolDefinition (Rust) | `crates/agiworkforce-protocol/src/tool_primitive.rs` | Cross-surface tool primitive with undeclared builder and is_parallel_safe; exported to TypeScript by ts-rs |
| service | toContractToolDefinition | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Expresses the web declaration as the cross-surface tool primitive (line 1041) |
| service | CLI tool_search | `apps/cli/src/tool_search.rs` | CLI deferred tool loading, separate from the web implementation |
| config | CLI tool catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | CLI tool definitions with read_only, concurrency_safe and defer flags |
| test | tool-schema-loader test | `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-schema-loader.test.ts` | Unit test of the loader (contents not opened) |
| test | tool-loop.tool-schemas.e2e test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.tool-schemas.e2e.test.ts` | Loop-level tests of Tool access choice and the schema budget (describe titles at lines 225 and 300) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends a chat message; the server loads connector tools and the account Tool access mode. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3931-3937 |
| Denied tools and denied connectors are removed first, then schemas are ranked and admitted against the budget; the rest are deferred. | our servers | tool-loop.ts:3917-3946; apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:116-163 |
| The offered list is loaded tools, the directory tool when something is deferred, and the stored-result reader when stored results exist; it is sent to the chosen provider. | our servers | tool-loop.ts:3965-3980 |
| The provider model may call load_connector_tools; the server adds the matched tool names to the loaded set and removes them from the directory. | our servers | tool-loop.ts:3982-4027 |
| The model call goes to an outside model provider through the provider adapter table. | outside service | tool-loop.ts:14-18 (file header on adapter dispatch) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Loaded tool names for the turn (x_tool_schema_state) | In the request and in approval, pause and step-budget checkpoints | Yes, with the checkpoint so any device that resumes the run re-pins them | Kept with the checkpoint row; maximum 1,024 names and 24,000 bytes (tool-schema-state.ts:7-20); removed from the public request copy (tool-schema-state.ts:23-27) |
| Tool access mode | Account settings read by resolveToolAccessMode (storage table not opened) | Per account across web and mobile | unknown |

**Models and providers.** The same tool list is sent to whichever provider the turn is routed to through the shared adapter table; model support for tools is checked elsewhere (scheduled path checks capabilities.tools, apps/web/lib/services/scheduled-agent-executor.ts:251). Which models fail at tool search quality is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for hosted chat; the Tool access mode is read per user (tool-loop.ts:4228-4243 region, accountToolAccessMode). |
| Permissions | Denied tools and denied connectors are filtered out before ranking (tool-loop.ts:3917-3920). |
| Subscription | Plan policy has an allowToolUse field per plan (packages/contracts/types/src/model-catalog.ts:1106,1254,1294,1346); where the chat path checks it is not established. No plan-specific tool-list rule found. |
| Limits and metering | 32 connector tools and 24,000 schema bytes by default; 96,000 bytes in Always mode (tool-schema-loader.ts:21-47). No metering of the directory call itself found. |
| Feature flags | toolAccess availability switch gates the setting UI (CapabilitiesSection.tsx:172). No feature flag on the loader found. |
| Model compatibility | Not established per model; the loader is model-neutral. |
| Provider restrictions | none found in the code |
| Local mode | This registry and loader run on our servers in Cloud mode only. Local and own-key tool behaviour on desktop and mobile was not established; the CLI has its own separate tool list (apps/cli/src/tool_search.rs). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty: no connector tools | Directory tool is not built; only built-in tools are offered | tool-schema-loader.ts:174-175 |
| Nothing matches the request words | If no tool scores at least 1, relevance filtering is skipped and tools are admitted by order until the budget is spent | tool-schema-loader.ts:138-149 |
| Directory query matches nothing | Tool error telling the model to try other keywords or an exact name | tool-loop.ts:4009-4015 |
| Loaded-state too large | Error 'The loaded tool schema state exceeds this turn's metadata limit.' | tool-loop.ts:3994-3999 |
| Unknown or unoffered tool name | Refused with a message; the tool is not run | tool-loop.ts:2877-2881,4167-4171 |
| Undeclared connector tool | Treated as irreversible write with egress; asks first under every policy | tool-metadata.ts:876-882,1070-1081 |
| Pause and resume | Loaded tools are restored from the checkpoint and filtered to tools that still exist | tool-loop.ts:3938-3946 |
| Offline, cancel, accessibility of the setting | Setting radiogroup has aria-labelledby; offline behaviour of the setting not handled in the code read | CapabilitiesSection.tsx:174-182 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-schema-loader.test.ts`: Loader unit tests (by file name; contents not opened)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.tool-schemas.e2e.test.ts`: Tool access choice shaping schemas and the connector schema budget (describe titles)
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.contract.test.ts`: Metadata contract (by file name; contents not opened)
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.risk-tier.test.ts`: Risk tier derivation (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.annotations.test.ts`: MCP annotation hints on undeclared tools (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-shortlist-shadow.test.ts`: Shadow shortlist (by file name)
- `packages/contracts/cloud-contracts/src/__tests__/tool-access-setting.test.ts`: Tool access setting parsing (by file name)

**Test scenarios**

- **Undeclared tool asks first**
  1. Connect an MCP server whose tool is not in the metadata table.
  2. Set the account default to 'Run read-only actions without asking'.
  3. Ask the model to use that tool.
  - Expected: An approval card appears; the tool does not run until allowed.
- **Budget defers excess tools**
  1. Connect more than 32 connector tools in Auto mode.
  2. Send a request that names one tool's service.
  3. Inspect the offered tool list in a request log or test.
  - Expected: At most 32 schemas are sent; others are listed in load_connector_tools.
- **Load by keyword**
  1. In On demand mode ask for an action on a connected service.
  2. Watch the model call load_connector_tools with a query.
  - Expected: A 'Loaded N tool schema(s)' result, then the tool is callable on the next step.
- **No connectors**
  1. Use an account with no connectors.
  2. Send a chat message.
  - Expected: No load_connector_tools tool is offered.
- **Always mode**
  1. Choose 'Always available' in Capabilities.
  2. Send a request unrelated to the connected tools.
  - Expected: Tool schemas are sent up to 32 tools and 96,000 bytes.

**Where to look when it fails**

- Log '[tool-loop] tool call refused: the tool was not offered on this turn' (tool-loop.ts:7518).
- Tool result text 'Unknown tool: <name>' (tool-loop.ts:2879).
- Tool result 'The connector tool directory is not available on this turn.'

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **A deferred tool whose schema was never loaded can still be called by exact name because availableTools holds every connector tool; argument checks then use the stored schema, but the model never saw it.** Affects: Web Cloud chat. Evidence: tool-loop.ts:4030-4040. Work needed: Decide and enforce: refuse or auto-load; add a test.
- **Product requirement lists modes Off and Auto-load safe tools; code offers only auto, on_demand, always.** Affects: Web and mobile settings. Evidence: docs/product/requirements.md (Tool access modes) vs packages/contracts/cloud-contracts/src/tool-access-setting.ts:5. Work needed: Align the requirement or add the modes.
- **Brief line references are stale for most items in this feature.** Affects: Documentation. Evidence: audit brief S92.02 cites tool-loop.ts:2690; the selector is at tool-loop.ts:3938. Work needed: Refresh the brief.
- **Other apps' tool lists (desktop Tauri, mobile local, VS Code, Chrome) not tied to this registry.** Affects: Desktop (Tauri), CLI, extensions. Evidence: CLI uses its own ToolDefinition (apps/cli/src/platform/runtime/tool_catalog.rs:11). Work needed: Map each surface to the shared primitive (wire-or-cut decision D-P0-5 says per-surface adoption follows: docs/decisions/wire-or-cut.md:506).

**Depends on**

- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-model-catalog-and-routing
- SYS-security-and-privacy
- SYS-api-and-contracts
- F092-02
- F092-05
- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- file:apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts
- file:apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts

## Unknown

- Whether the shortlist shadow run affects what is sent.
- Where the Tool access value is stored (table) and whether it is rate limited.
- Which plans, if any, restrict tool use in the hosted chat path.
- Whether the VS Code and Chrome extensions offer any tool list.
- Whether Local mode tool use on mobile and desktop uses this registry.
