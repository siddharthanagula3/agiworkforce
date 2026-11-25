---
id: "F076-04"
type: "feature"
title: "Tool calls and multi-step tool use"
aliases: ["Tool calling", "Function calling", "Parallel tool calls", "Multi-round tool use", "Agentic loop", "S76.21", "S76.22", "S76.23", "functionCalling", "Tools chip", "tool loop"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S76.21", "S76.22", "S76.23"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-execution-boundaries", "api:POST /api/llm/v1/chat/completions", "file:apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-04 Tool calls and multi-step tool use

Lets a model call tools (search, files, connectors, code) and keep going for several rounds in one turn. A model whose catalog entry has no tool calling gets no connector or MCP tools and answers in a single turn. Parallel read-only tool calls run only on routes that declare support.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.21](../../10-requirements/capabilities/076-model-capability-registry.md#s7621), [S76.22](../../10-requirements/capabilities/076-model-capability-registry.md#s7622), [S76.23](../../10-requirements/capabilities/076-model-capability-registry.md#s7623).

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

**What it does.** Offers tools only to models flagged as able to call them, runs a loop of model, tool, result up to a step limit, and runs read-only tools in parallel where the route allows.

**Why it exists.** A provider rejects a request that carries tool definitions for a model that cannot take them. The flag avoids that failure and lets agent features work.

**Who uses it.** Users of search, files, connectors, code execution and agent modes on every app; API callers who send a tools array.

**Problems it solves**

- Models without tools are not sent tool definitions.
- Multi-step tasks finish in one turn.
- Read-only tools run side by side to save time.

**Use cases**

- Ask a question that needs web search; the model calls search and answers.
- Connector tool reads a calendar and replies.
- CLI agent runs several read-only tools in parallel.
- API caller sends tools and receives tool calls.

## 2. User experience

**Where to find it**

- Web: 'Tools' chip on a model card (ModelCatalogue.tsx:105); tool controls in the composer (search, connectors, code run).
- Desktop: hosted web app (doc: AGENTS.md section 5).
- Mobile: tools run inside chat; tool status events appear in the stream (streaming.ts:150-190).
- CLI: agent chat with the T letter in the model list (provider.rs:184).
- VS Code: model switch warning 'cannot use tools, so it cannot read or edit files or run commands' (modelConstants.ts:349-351).
- Chrome: side panel tools are offered only for tool-capable models (side_panel.ts:8768-8772; managedChatHandler.ts:792).
- API: tools array in the chat completions request.

**Before you start**

- A model with tool calling, or Auto.
- Plan that includes connectors for connector tools (request-processor.ts:3592-3598).
- Approval policy for tools that change things (tool-loop approval tests; not read in full).

**Screens and controls**

- Web tool toggles, approval cards, tool status lines.
- VS Code modal warning when switching to a model without tools.
- CLI tool approval prompts.

**Journey**

1. Pick a model that has tools (or Auto).
2. Ask something that needs a tool.
3. The model asks for a tool; the app or server runs it (asking approval if needed).
4. The result goes back to the model and it continues until it answers or the step limit is reached.

**What the person sees and gets**

- Tool status and result events in the stream (apps/mobile/services/streaming.ts: x_tool_status, x_tool_result, x_tool_approval_request).
- Web warning: '<model> cannot call tools, so the tools you switched on will be off for this turn.' (model-compatibility.ts:202-207).
- Refusals 'The selected model cannot load skills. Choose a tool-capable model.' (code skill_model_unsupported) and 'cannot create Office files' (code office_creation_model_unsupported) (request-processor.ts:5406-5420, 5477-5490).

**Settings**

- Tool approval policy and connector permissions (request-processor / route.ts 806-840).
- Per-conversation connector opt-out (route.ts:838-845).
- Workspace controls can turn features off (request-processor.ts:4040-4050 region).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Registry flag tools maps to functionCalling (packages/ai/model-registry/scripts/compile.mjs:1574, 1630).
- Auto refuses a model lacking a required capability such as functionCalling (packages/ai/routing/src/auto.ts:1406-1412); several tasks require functionCalling (routing-policies.json:584-600, 693, 760).
- The chat route gives no MCP or connector tools to a model whose tools flag is false and takes the single-turn path (apps/web/app/api/llm/v1/chat/completions/route.ts:791-807).
- Skill and Office creation turns on a no-tools model are refused (request-processor.ts:5406-5420, 5477-5490).
- Parallel read-only tool calls run up to 4 at a time only when the serving route's harness implements parallelToolCalls; otherwise one at a time (tool-loop.ts:541-542, 5395-5404).
- Step limit: chat 10, work 100, caller default 20 (packages/contracts/cloud-contracts/src/tool-call-limits.ts:3-6; tool-loop.ts:893-904).
- Free promotion turns trim older tool results before each request (tool-loop.ts:6845-6860).
- CLI runs concurrency-safe tools in parallel only when the harness declares the feature (agent/chat.rs:756-761, 1389-1392).
- Chrome offers tools only for tool-capable or Auto selections (side_panel.ts:8768-8772; managedChatHandler.ts:792).
- VS Code warns when switching to a model without tools (modelConstants.ts:347-351; commandSetup.ts:1359-1372).
- Live voice tools are withheld for a backend without tools or a plan without tool use (apps/web/lib/voice/live-voice-tools.ts:302, 378).

**Incomplete**

- Parallel support is per route (harness), not per model as the brief says (tool-loop.ts:5395-5404).
- The brief says tool-dependent turns are refused or routed; for an explicit no-tools model the server quietly drops tools instead (route.ts:791-807), except skill and Office turns, which are refused.
- Mobile and CLI client gating for a no-tools model was not found beyond list display (CLI) and is unknown (Mobile).

**Present but disconnected or switched off**

- Caller-supplied tools on a no-tools model: behaviour not established.

**Not available**

- none found in the code beyond the gaps above

## 4. Required behaviour

**Established requirements**

- The registry records tool calling per model; tool-dependent turns are refused or routed only to tool-capable models (S76.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.21)
- The registry records whether a model supports parallel tool calls and the tool loop uses it (S76.22). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.22)
- The registry records agentic multi-round capability and the request path uses it (S76.23). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.23)
- Web search, MCP, code execution and tool discovery depend on a provider route or an AGI harness, never described as intrinsic model capabilities. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Select a model without tool calling on Web and arm a tool: the warning says tools will be off for this turn.
2. API: a skill turn on a no-tools model returns 422 skill_model_unsupported.
3. With a route whose harness implements parallelToolCalls, two read-only tool calls in one step run concurrently; on another route they run one by one.
4. A turn that never finishes stops at the step limit and reports it.
5. Chrome with a no-tools model selected: tool controls are not offered.
6. VS Code switching to a model without tools shows the loss warning before switching.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The agentic flag (S76.23) has no separate enforcement point beyond the tools flag in the code read. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the brief say 'per route' for parallel calls.
- [proposed] Return a clear message when a caller's tools array meets a no-tools model, instead of relying on provider behaviour.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | harness features | `packages/ai/model-registry/catalog/harnesses.json` | parallelToolCalls feature per harness. |
| service | registry accessors (TS) | `packages/ai/model-registry/generated/registry.ts` | harnessFeatureImplemented (line 329). |
| service | registry accessors (Rust) | `crates/agiworkforce-model-registry/src/lib.rs` | harness_feature_implemented (line 737). |
| service | tool-loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Multi-round loop, parallel read-only calls, step budget, history trimming. |
| endpoint | chat completions route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Tool catalog and connector tools gated by model tools flag (lines 791-860). |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Skill and Office refusals, connector gating (lines 3588-3598, 5406, 5477). |
| config | tool call limits | `packages/contracts/cloud-contracts/src/tool-call-limits.ts` | Step and per-step limits. |
| service | Auto eligibility | `packages/ai/routing/src/auto.ts` | Required capability check (1406-1412). |
| service | capability envelope | `packages/ai/routing/src/auto-capability-envelope.ts` | supportsTools across reachable models (line 172). |
| service | live voice tools | `apps/web/lib/voice/live-voice-tools.ts` | Withholds tools for no-tools backends or plans. |
| component | ModelCatalogue chip | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Tools chip. |
| service | model-compatibility | `apps/web/features/chat/components/Composer/model-compatibility.ts` | no_tools finding. |
| service | CLI agent chat | `apps/cli/src/agent/chat.rs` | Parallel decision and tool execution. |
| command | CLI model list | `apps/cli/src/provider.rs` | T flag and Tool use line. |
| service | VS Code switch losses | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | describeModelSwitchLosses. |
| service | Chrome tool gating | `apps/extension/src/side_panel.ts` | selectedModelSupportsChatTools (line 8768). |
| service | Chrome managed chat | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Sends tools only for tool-capable routed model (line 792). |
| service | mobile streaming | `apps/mobile/services/streaming.ts` | Receives tool events (lines 150-190). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app sends the turn with its tool settings (Web, Mobile, Chrome) or the CLI runs its own agent loop. | device | apps/mobile/services/streaming.ts; apps/cli/src/agent/chat.rs |
| The server checks the model's tools flag, builds the tool catalog and permissions, and runs the tool loop. | our servers | route.ts:791-860; tool-loop.ts:893-904 |
| The model provider returns tool calls; read-only calls run in parallel when the route declares it. | outside service | tool-loop.ts:5395-5404 |
| Tools run on the server for hosted tools, or on the user's device for device tools, with approval where needed. | device and our servers | request-processor.ts:3695-3712 (device host declaration comment) |
| Results go back to the model; the loop ends on a final answer or the step limit. | our servers | tool-loop.ts:9-12 header comment and 893-904 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Tool calls, results, audit | Conversation records and tool audit (tool-loop.tool-audit.test.ts exists; table names not read) | unknown | unknown |

**Models and providers.** Tool ability is a model flag; parallel ability is a harness (route) feature. Own-key and Cloud routes may differ by harness. In the CLI own-key route the same harness feature is read (chat.rs:756-761).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud tool turns need sign-in; CLI tools in Local mode run on the device. |
| Permissions | Tool approval policy, connector allow/ask/deny verdicts, device capability declarations are claims not authorisation (request-processor.ts:3695-3706). |
| Subscription | Connector tools need a plan that includes connectors (planIncludesConnectors, request-processor.ts:3592-3598); custom connector limits by plan (route.ts:836-841); live voice tools need tierPolicy.allowToolUse (live-voice-tools.ts:378). |
| Limits and metering | Steps 10 chat, 100 work, 20 caller; 4 parallel read-only calls; 32 tool calls per step cap (tool-call-limits.ts:2-5; tool-loop.ts:541). |
| Feature flags | Free-trial capability gates; workspace controls can disable features. |
| Model compatibility | Needs tools flag (functionCalling); parallel needs the route's parallelToolCalls feature. |
| Provider restrictions | Harness features differ by route (harnesses.json). |
| Local mode | CLI Local and own-key run the loop on the device; which local models take tools: CLI checks Ollama tool support (apps/cli/src/local_models.rs:337). Mobile local tool use: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model without tools | No MCP or connector tools; single-turn path. | route.ts:791-807 |
| Skill or Office on no-tools model | 422 refusal. | request-processor.ts:5406-5420, 5477-5490 |
| Step budget reached | Run is paused rather than killed; resume with larger maxSteps. | tool-loop.ts:9-12 |
| Tool declined by user | Handled (tool-loop.declined-tool test exists). | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.declined-tool.test.ts |
| Cancel | Handled in the loop (cancellation test exists). | tool-loop.cancellation.test.ts |
| Provider error mid-loop | Provider error frame test exists; behaviour not read. | tool-loop.provider-error-frame.test.ts |
| Offline | not handled in the code that was read. | not established |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.e2e.test.ts`: End-to-end tool loop (assertions not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.hardening.test.ts`: Mentions parallel behaviour (grep hit); assertions not read.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.capability-adherence.test.ts`: Capability adherence in the loop (assertions not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.skill.test.ts`: Skill turns (assertions not read).
- `apps/web/features/chat/components/Composer/model-compatibility.test.ts`: Switch compatibility incl. tools (assertions not read).
- `apps/extension/__tests__/managed-model-picker.test.ts`: Chrome model picker and effort (assertions partly read).

**Test scenarios**

- **No-tools model on Web**
  1. Select a model whose card lacks the Tools chip.
  2. Turn on web search.
  3. Try to switch to it from a tools model.
  - Expected: Compatibility warning says tools will be off for this turn.
- **Skill on no-tools model**
  1. Call the API with a skill and a no-tools model.
  - Expected: 422 skill_model_unsupported.
- **Parallel on and off**
  1. Trigger two read-only tool calls in one step on a route with parallelToolCalls.
  2. Repeat on a route without it.
  - Expected: Concurrent on the first, sequential on the second.
- **Step limit**
  1. Run a task that keeps calling tools past the chat step limit.
  - Expected: The run stops or pauses at the limit with a visible state.
- **Chrome gating**
  1. Select a no-tools model in the Chrome side panel.
  - Expected: Tools are not offered.

**Where to look when it fails**

- Error codes skill_model_unsupported, office_creation_model_unsupported.
- Tool-loop logs and tool audit (tool-loop.observability.test.ts exists).
- gen_ai.request.tool_count trace attribute (adapter-factory.ts:145).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)
- VS Code: [70-qa/test-plans/vscode/076-model-capability-registry.md](../../70-qa/test-plans/vscode/076-model-capability-registry.md)
- Chrome: [70-qa/test-plans/chrome/076-model-capability-registry.md](../../70-qa/test-plans/chrome/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **Brief says parallel support is per model; code reads it per route.** Affects: Engineers, testers.. Evidence: tool-loop.ts:5395-5404; chat.rs:756-761. Work needed: Correct the brief or add a per-model flag if intended.
- **A caller's tools array on a no-tools model has no explicit refusal found.** Affects: API.. Evidence: route.ts:791-807 handles connector/MCP tools only. Work needed: Test and add a clear error.
- **The step limit's user-visible message was not read.** Affects: All apps.. Evidence: tool-loop.ts:9-12. Work needed: Verify by scenario.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-execution-boundaries
- api:POST /api/llm/v1/chat/completions
- file:apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- mode:local

## Unknown

- How Mobile gates tools for a no-tools model.
- What the person sees at the step limit.
- Table names for tool audit.
- Whether harnesses.json marks parallelToolCalls for every provider route.
- Test assertions (most not read).
