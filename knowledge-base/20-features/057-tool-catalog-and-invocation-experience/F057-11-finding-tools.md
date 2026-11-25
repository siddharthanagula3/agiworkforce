---
id: "F057-11"
type: "feature"
title: "Finding tools"
aliases: ["Tool discovery", "Tool search", "load_connector_tools", "tool_search", "Deferred tools", "On-demand tool loading", "S57.28", "S57.29"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.28", "S57.29"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "F057-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-11 Finding tools

When more tools are connected than fit in one turn, the server sends only the most relevant tool schemas and lists the rest by name and a short summary. The model calls load_connector_tools by exact name or keyword to load more. The CLI has a separate tool_search tool with its own ranking.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.28](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5728), [S57.29](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5729).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps the prompt small as the connected tool count grows. Hosted: ranks tools against the turn, admits schemas up to a byte budget, defers the rest, and offers load_connector_tools. CLI: keeps niche tools deferred and loads them with tool_search.

**Why it exists.** Large tool catalogs must not be dumped into every prompt (doc: docs/product/requirements.md:650-653).

**Who uses it.** The model, automatically; people only see a 'Load connector tools' row.

**Problems it solves**

- Prompt bloat and cost from many connected tools.
- A relevant tool being missed by ranking.

**Use cases**

- A person with many connectors asks to post in Slack; the Slack tool loads.
- The model searches for 'calendar' to find which tool to use.
- The CLI model loads apply_patch with select:apply_patch.

## 2. User experience

**Where to find it**

- Web: Settings, Capabilities, 'Tool access' with Auto, On demand, Always available (apps/web/features/settings/sections/CapabilitiesSection.tsx:22-33,175).
- Mobile: Settings, Capabilities, shown only in Cloud mode and when unlocked (apps/mobile/src/features/settings/capabilities/index.tsx:277-286).
- Transcript on all hosted apps: a tool row labelled 'Load connector tools' (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1053).
- CLI and VS Code: tool_search tool, no visible control.

**Before you start**

- Hosted: connected connectors that are released (see F057-09); with none connected nothing is deferred.
- CLI: none.

**Screens and controls**

- Tool access options: Auto 'AGI chooses for you', On demand 'Load tools when needed. More steps, lower accuracy', Always available 'Ready from the start. Fewer messages, better accuracy' (CapabilitiesSection.tsx:22-33).

**Journey**

1. 1. The turn starts with many tools connected.
2. 2. The server ranks them and loads schemas up to the budget.
3. 3. The rest are listed on the directory tool.
4. 4. The model calls load_connector_tools with names or a query.
5. 5. The server loads the schemas and tells the model to call them on the next step.
6. 6. The model calls the loaded tool.

**What the person sees and gets**

- Result text 'Loaded N tool schema(s). Matches for ...' or 'No connected tool matched ...' (tool-loop.ts:4001-4025).
- A 'Load connector tools' row in the transcript.

**Settings**

- Tool access mode auto, on_demand, always (packages/contracts/cloud-contracts/src/tool-access-setting.ts:5-9).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Hosted schema selection with a 24,000 byte default budget, ranking by name 3, server 2, description 1, pinned tools kept, deferred listing by name and an 80 character summary (apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:7-12,60-160; tool-schema-state.ts:5).
- Keyword search with name weight 3, description weight 1, minimum term length 2, up to 8 results (apps/web/lib/connectors/tool-search.ts:1-4,14-36).
- load_connector_tools loads by exact name or query and remembers loaded names in the turn state (tool-loop.ts:3984-4026).
- CLI tool_search with select: and keyword search, name match 10 or 5, alias 9 or 4, description 2, default 10 results (apps/cli/src/tool_search.rs:101-170; apps/cli/src/platform/runtime/tool_catalog.rs:682-690).
- CLI names deferred MCP tools on the tool_search description (tool_catalog.rs:1411-1450).

**Incomplete**

- Keyword weights in the brief (3 and 1, up to 8) hold only for the hosted search. The CLI uses different weights and a default of 10.
- The brief lists the API as done; the OpenAPI entry at line 758 was not opened, so the API surface is unverified.

**Present but disconnected or switched off**

- The semantic shortlist is shadow only: the lexical shortlist still builds the turn (apps/web/lib/services/semantic-decisions/kinds.ts:38).

**Not available**

- User-facing tool search box in any app: none found.

## 4. Required behaviour

**Established requirements**

- Tools that do not fit the schema budget are listed by name and summary and marked deferred. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.28)
- The assistant can load deferred tools by exact name or by keyword. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.29)
- Keyword search ranks by name match (3) and description match (1) and returns up to 8. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.29)
- Tool search and deferred loading is a core requirement; start with a small set, search or load when relevant, keep source and permission, and support a local fallback. (source: doc: docs/product/requirements.md:650-661)

**Acceptance criteria**

1. With more tools than the budget allows, the schema bytes stay at or under the budget (test: tool-schema-loader.test.ts:41).
2. Deferred tools are all named on load_connector_tools.
3. With nothing deferred the directory tool is absent (test line 124).
4. Searching 'calendar' returns at most 8 tools ordered by score then original order.
5. On demand mode admits no schema up front (test line 156).
6. In the CLI, tool_search 'select:apply_patch' returns its schema with was_deferred true.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The unreleased connector rule (F057-09) means the hosted deferral rarely triggers in production today.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align CLI and hosted keyword weights or document why they differ.
- [proposed] Add a visible 'tools available' list for people.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | tool schema loader | `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts` | Selects schemas, builds directory tool |
| service | tool schema state | `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-state.ts` | Tool name, budget, loaded-name state |
| service | keyword search | `apps/web/lib/connectors/tool-search.ts` | Ranks tools by keyword |
| service | tool loop loader | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | loadDeferredToolSchemas (lines 3984-4026) and dispatch (5481) |
| config | tool access setting | `packages/contracts/cloud-contracts/src/tool-access-setting.ts` | auto, on_demand, always |
| hook | tool access mode reader | `apps/web/lib/tool-access-mode.ts` | Reads the account setting |
| screen | CapabilitiesSection | `apps/web/features/settings/sections/CapabilitiesSection.tsx` | Tool access control on web |
| screen | mobile capabilities | `apps/mobile/src/features/settings/capabilities/index.tsx` | Tool access on mobile |
| service | semantic shortlist (shadow) | `apps/web/lib/services/semantic-decisions/consumers/tool-shortlist.ts` | Shadow comparison only |
| command | tool_search (CLI) | `apps/cli/src/tool_search.rs` | Select and keyword search of schemas |
| config | CLI tool catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Deferred flags and tool_search definition |
| command | tool_search execution | `apps/cli/src/features/exec/tools/mod.rs` | Dispatches tool_search (line 1146) |
| config | openapi | `apps/web/public/openapi.json` | Lists a tool search entry (line 758 per the brief, not opened) |
| test | schema loader tests | `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-schema-loader.test.ts` | Budget, ranking, directory, modes |
| test | tool schema e2e | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.tool-schemas.e2e.test.ts` | Loop with deferred schemas |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The server reads the account tool access mode and picks a budget. | our servers | tool-loop.ts:3931-3946; tool-schema-loader.ts:30-45 |
| Tools are ranked against the last user text; schemas are admitted up to the byte budget; the rest are deferred. | our servers | tool-schema-loader.ts:99-160 |
| A directory tool lists the deferred names and summaries. | our servers | tool-schema-loader.ts:181-195 |
| The model calls load_connector_tools; names and keyword matches are loaded and remembered. | our servers | tool-loop.ts:3984-4026 |
| CLI: tool_search runs on the device over the local catalog, including connected MCP tools. | device | apps/cli/src/features/exec/tools/mod.rs:1146-1150; tool_search.rs:101 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Loaded tool names for the turn | request checkpoint key x_tool_schema_state | travels with the run checkpoint | limited to 1024 names and the byte budget (tool-schema-state.ts:7-20) |

**Models and providers.** Provider neutral: the loader sits in front of any model. Native provider tool search is not used in the files opened; the product requirement asks for it where supported (doc: docs/product/requirements.md:657-659).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Hosted: signed in. CLI: none. |
| Permissions | Only tools the person's connectors and policies allow are in the pool. |
| Subscription | none found in the code for the search itself; connectors are paid (see F057-09). |
| Limits and metering | 24,000 byte default schema budget; Always mode allows four times that; On demand allows zero up front (tool-schema-loader.ts:14-45). Search returns 8; CLI default 10. |
| Feature flags | Account setting tool access mode. |
| Model compatibility | Any tool-capable model. |
| Provider restrictions | none found in the code. |
| Local mode | CLI tool_search works on the device in Local mode. Hosted loading is Cloud only. Mobile Local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Nothing deferred | No directory tool | tool-schema-loader.ts:181-182; test line 124 |
| No match | Error result 'No connected tool matched ...' | tool-loop.ts:4005-4012 |
| State too large | Error 'The loaded tool schema state exceeds this turn's metadata limit.' | tool-loop.ts:3994-4000 |
| Directory tool not offered this turn | Error result | tool-loop.ts:5481-5487 |
| Offline, cancel, timeout | not handled in the code beyond the general tool deadline | No offline or cancel branch in tool-schema-loader.ts or tool-search.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-schema-loader.test.ts`: Budget, never over budget, ranking, pinned tools, directory tool, On demand and Auto modes
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.tool-schemas.e2e.test.ts`: Loop with schemas (name only)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.tool-shortlist-shadow.test.ts`: Shadow shortlist (name only)
- `apps/cli/src/tool_search.rs`: In-file tests: select, aliases, keyword, max results, empty query, deferred flags (lines 272-519)

**Test scenarios**

- **Budget overflow**
  1. Connect many tools
  2. Send a message about one of them
  3. Inspect the request tools
  - Expected: Only relevant schemas under the byte budget, others listed on load_connector_tools
- **Keyword load**
  1. Call load_connector_tools with query 'calendar'
  - Expected: Up to 8 matches loaded and listed with descriptions
- **On demand mode**
  1. Set Tool access to On demand
  2. Send a message
  - Expected: No connector schema up front; all listed on the directory tool
- **CLI select**
  1. Run tool_search with select:todo_write
  - Expected: Schema returned with was_deferred true

**Where to look when it fails**

- Result text 'Loaded N tool schema(s)'.
- Shadow decision kinds in semantic-decisions.
- processed.toolSchemaState in the run checkpoint.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **Native provider tool search is a requirement but no use was found in the opened files.** Affects: Hosted route. Evidence: docs/product/requirements.md:657-659; no match in tool-schema-loader.ts. Work needed: Check provider adapters; add or record deviation.
- **CLI and hosted ranking differ from the brief's single rule.** Affects: CLI, VS Code. Evidence: tool_search.rs:138-155 vs tool-search.ts:2-4. Work needed: Document or align.
- **The API listing at openapi.json:758 was not verified.** Affects: API. Evidence: Not opened. Work needed: Open and confirm.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- F057-09

## Unknown

- Whether apps/web/public/openapi.json:758 describes tool search or something else.
- Whether Chrome and Mobile show any special deferred indicator beyond the shared row.
- Provider-native tool search use.
