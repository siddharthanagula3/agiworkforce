# Reference Spine Notes

This file records high-priority line-audit notes from the reference CLIs. It is not the final exhaustive audit; it is the first transfer layer built on top of the generated file ledgers.

## Codex CLI Spine

Source slice audited: `reference/codex-cli` high-priority files around turn execution, tool routing, exec policy, app-server protocol, and TUI adapter.

Patterns AGI should adapt:

- Model the CLI turn as the central state machine: record context/input, build prompt from history, stream model events, execute tools, append tool outputs, repeat only when needed, then run stop/after hooks. Evidence: `codex-rs/core/src/session/turn.rs:118`, `:136`, `:322`, `:375`, `:445`, `:503`, `:622`.
- Compact before sampling when over limit and before a model downshift to a smaller context model; reset model-client session after compaction. Evidence: `turn.rs:154`, `:486`, `:498`, `:701`, `:738`, `:779`.
- Keep the configured tool registry separate from model-visible tool specs. Deferred/dynamic tools can be registered but hidden until surfaced. Evidence: `codex-rs/core/src/tools/router.rs:39`, `:55`, `:79`, `:103`, `:110`, `:300`.
- Normalize provider tool calls into one internal `ToolCall` shape before dispatch, including MCP, client-only tool search, custom tools, and local shell. Evidence: `router.rs:32`, `:175`, `:181`, `:207`, `:226`, `:236`, `:269`.
- Centralize approval, sandbox choice, execution attempt, sandbox-denial retry, guardian review, hooks, telemetry, and network approval in one orchestration path. Evidence: `codex-rs/core/src/tools/orchestrator.rs:1`, `:126`, `:143`, `:215`, `:262`, `:382`.
- Make retry boundaries explicit. Do not automatically drop sandbox after every denial; check approval policy, tool retry intent, network denial context, strict auto-review, and whether fresh approval is required. Evidence: `orchestrator.rs:279`, `:285`, `:306`, `:316`, `:321`, `:348`.
- Use most-restrictive exec policy matching. `Decision` orders `Allow < Prompt < Forbidden`, and evaluation picks `max()`. Exact rules win first, optional host-executable rules are separate, heuristics only apply when no rule matched. Evidence: `codex-rs/execpolicy/src/decision.rs:7`, `codex-rs/execpolicy/src/policy.rs:188`, `:253`, `:268`, `:297`, `:307`, `:349`.
- Keep protocol types as versioned adapters, not leaked core structs. `v2.rs` wraps core enums/types with serde, JSON schema, TypeScript export, and explicit conversions. Evidence: `codex-rs/app-server-protocol/src/protocol/v2.rs:121`, `:152`, `:210`, `:1261`, `:1456`, `:1648`.
- Treat `permissionProfile` as the canonical permissions view while keeping legacy sandbox fields only for compatibility. Evidence: `v2.rs:1456`, `:1648`, `:1777`, `:1847`, `:3530`, `:5312`.
- Isolate app-server/TUI migration glue in an adapter that routes notifications by scope, rejects unsupported server requests with JSON-RPC errors, and replays snapshots through the same event sequence as live turns. Evidence: `codex-rs/tui/src/app/app_server_adapter.rs:1`, `:125`, `:238`, `:302`, `:335`, `:466`, `:714`, `:779`.

Behavior boundaries to carry into AGI:

- Do not expose all registered tools to the model.
- Do not retry without sandbox under restrictive approval modes unless explicit conditions pass.
- Do not treat plan deltas as authoritative final plan content.
- Do not let pending input preempt the initial user prompt or post-compaction continuation.
- Do not collapse approval decisions into accept/deny only; preserve session acceptance, exec-policy amendments, network amendments, decline, and cancel.
- Do not make replay semantics diverge from live event semantics.

## OpenCode Spine

Source slice audited: `reference/opencode` high-priority session, tool, permission, MCP, plugin, agent, and config files.

Patterns AGI should adapt:

- Persist event-sourced session parts while streaming, not only final messages. Text, reasoning, tool, patch, step-start, and step-finish parts are durable, and incomplete parts are cleaned up on abort. Evidence: `packages/opencode/src/session/processor.ts:108-124`, `:222-255`, `:259-334`, `:346-402`, `:406-450`, `:463-520`.
- Wrap every tool call in one centralized execution envelope carrying schema, execution metadata, permission ask, abort signal, messages, call IDs, validation, truncation, and tracing. Evidence: `packages/opencode/src/tool/tool.ts:15-25`, `:27-43`, `:77-127`.
- Compose built-ins, local tool files, plugin tools, skills, subagents, provider/model filters, and plugin mutation hooks into one effective registry. Evidence: `packages/opencode/src/tool/registry.ts:118-181`, `:187-225`, `:241-273`, `:275-314`.
- Use capability-based tool selection, not model substring gates. OpenCode has hardcoded `modelID.includes("gpt-")` logic for patch/edit tools at `tool/registry.ts:281-285`; AGI must express this through `models.json` capabilities or provider metadata.
- Model permissions as structured rules and pending requests, with `allow | deny | ask`, multi-pattern permission requests, always approvals, rejection feedback, and same-session cascading rejection. Evidence: `packages/opencode/src/permission/index.ts:21-57`, `:136-144`, `:180-214`, `:217-272`, `:292-320`.
- Make permissions and modes agent-scoped. Agents carry mode, native/hidden flags, model overrides, step limits, prompts, options, and their own permission rules. Evidence: `packages/opencode/src/agent/agent.ts:28-48`, `:86-103`, `:107-232`, `:234-277`, `:295-307`.
- Give MCP lifecycle explicit status: `connected`, `disabled`, `failed`, `needs_auth`, and `needs_client_registration`; refresh cached tool definitions on list-change notifications; close transports and descendants on finalizer. Evidence: `packages/opencode/src/mcp/index.ts:74-99`, `:122-150`, `:249-265`, `:303-377`, `:433-444`, `:472-483`, `:524-544`, `:630-662`.
- Make plugin loading deterministic and user-visible. Load internal/external plugins, surface install/compat/entry/load errors as session-visible errors, apply hooks sequentially, subscribe to bus events, and allow typed hook output mutation. Evidence: `packages/opencode/src/plugin/index.ts:56-64`, `:92-103`, `:150-165`, `:167-205`, `:211-253`, `:259-272`.
- Preserve config provenance through layered merge. Normalize deprecated keys, resolve plugin paths relative to the declaring file, track plugin origins, merge global/project/env/remote/managed layers, and patch JSONC without destroying comments. Evidence: `packages/opencode/src/config/config.ts:49-78`, `:89-97`, `:97-264`, `:305-329`, `:448-581`, `:583-689`, `:723-774`.

Behavior boundaries to carry into AGI:

- Do not allow tool calls while generating summaries.
- Treat context overflow as a compaction transition, not a normal failure.
- On interrupted streams, wait briefly for running tools, then mark unfinished calls aborted with metadata.
- Do not advertise denied subagents/tools to the model.
- Do not let plugin load failures abort core startup; surface them and continue.
- Do not surprise-write config during read-only flows.

## Gemini CLI Spine

Source slice audited: `reference/gemini-cli` high-priority core tools, registry, shell/edit/MCP/policy, settings, extension manager, and SDK session files.

Patterns AGI should adapt:

- Split tool definition from per-call invocation. Raw model args are schema-validated before execution, and the invocation owns description, locations, confirmation, and execution. Evidence: `packages/core/src/tools/tools.ts:47`, `:390`, `:679`.
- Route confirmations through a central bus with correlation IDs. Abort maps to deny, timeout maps to ask user, and always-allow persists through policy updates. Evidence: `tools.ts:187`, `:236`, `:288`, `:323`, `:348`.
- Use a typed result contract that separates LLM-visible content, user display, machine error, data payload, optional tail calls, and `Kind`-based read-only/mutator scheduling. Evidence: `tools.ts:742`, `:923`, `:1097`, `:1113`.
- Register known tools first, then compute active tools through policy, aliases, MCP metadata, plan mode, and mode-specific visibility. Evidence: `packages/core/src/tools/tool-registry.ts:231`, `:271`, `:548`, `:647`, `:689`.
- Harden shell execution with root parsing for policy persistence, proactive sandbox expansion requests, command-substitution blocking, cwd path access validation, inactivity timeouts, background execution support, and structured sandbox-denial errors. Evidence: `packages/core/src/tools/shell.ts:232`, `:251`, `:447`, `:493`, `:526`, `:773`.
- Make edits robust but bounded: exact/flexible/regex/fuzzy replacement, conservative occurrence errors, hash self-correction guards, diff confirmation, path validation before write, line-ending preservation, and omission-placeholder rejection. Evidence: `packages/core/src/tools/edit.ts:294`, `:511`, `:758`, `:847`, `:1092`, `:1217`.
- Evaluate policy with prioritized rules matching mode, MCP identity, tool name, annotations, args pattern, interactivity, and subagent. Recursively check shell commands, downgrade redirection and extra permissions to ask, and deny on checker failure. Evidence: `packages/core/src/policy/policy-engine.ts:85`, `:209`, `:345`, `:504`, `:676`, `:706`.
- Give MCP explicit server status/discovery state, listeners, coalesced refresh on `list_changed`, lenient output schema validation, progress-token routing, OAuth retry, sanitized env/header expansion, stdio blocks in untrusted folders, and include/exclude filtering. Evidence: `packages/core/src/tools/mcp-client.ts:100`, `:387`, `:690`, `:1124`, `:1372`, `:1775`, `:2244`, `:2346`.
- Layer settings as schema defaults, system defaults, user, trusted workspace, then system overrides; blank untrusted workspace settings and let remote admin override file admin settings. Evidence: `packages/cli/src/config/settings.ts:252`, `:326`, `:370`.
- Load `.env` safely: discover upward, but in untrusted workspaces load only auth allowlist vars, sanitize values, never overwrite existing env, and validate settings after expansion. Evidence: `settings.ts:502`, `:561`, `:604`, `:676`.
- Enforce extension trust boundaries: allowed-extension regex, trusted-workspace install gate, consent for hooks/skills, integrity storage, admin-filtered MCP, stripped extension-supplied trust, context-file path constraints, and hydration into hooks/skills/agents/policies. Evidence: `packages/cli/src/config/extension-manager.ts:183`, `:217`, `:341`, `:443`, `:826`, `:860`, `:1238`.
- SDK sessions should lazily initialize, allow dynamic per-turn instructions with context, collect stream tool calls, clone registry, bind SDK tool context, schedule tools, and feed function responses until no calls remain. Evidence: `packages/sdk/src/session.ts:93`, `:171`, `:189`, `:244`, `:256`.

Behavior boundaries to carry into AGI:

- Do not copy Gemini SDK `defaultDecision: ALLOW` into AGI interactive CLI without an explicit approval bridge; prefer non-interactive deny default.
- Treat `wait_for_previous` as scheduling metadata, not a safety control.
- Keep fuzzy/LLM edit correction bounded and never bypass path validation or diff confirmation.
- Keep extension and MCP trust host-controlled; strip extension-provided MCP trust and block stdio MCP in untrusted folders.
- Gemini sources are Apache-2.0; any code port requires SPDX attribution and `THIRD_PARTY_LICENSES.md` updates.

## Reference Src Spine

Source slice audited: primary `reference/src` high-priority tool contract, tool pool assembly, permission pipeline, command loading, agent tool, agent definition loading, and remote session bridge.

Patterns AGI should adapt:

- Use a metadata-rich tool contract with schema, aliases, deferred loading, read/write classification, concurrency safety, destructive flags, result limits, permission hooks, validation, progress, and rendering hooks. Evidence: `Tool.ts:362-695`.
- Validate input before permission checks, and call permissions only after validation passes. Evidence: `Tool.ts:483`, `:494`.
- Centralize tool defaults through a builder. Concurrency and read-only default to false so new tools are conservative by default. Evidence: `Tool.ts:743`, `:757`.
- Treat deferred tools and always-loaded tools as explicit schema-exposure decisions. Evidence: `Tool.ts:438`, `:443`.
- Build all built-ins and MCP tools through one pool assembly path. Blanket-denied tools are removed before model exposure, MCP deny rules use the same matcher as runtime, built-ins and MCP are sorted separately for prompt-cache stability, and built-ins win duplicate names. Evidence: `tools.ts:253`, `:258`, `:329`, `:354`, `:363`.
- Adapt the ordered permission pipeline: deny rules, ask rules, tool-specific checks, bypass-immune safety checks, bypass mode, allow rules, then final ask/deny/auto/headless transformations. Evidence: `utils/permissions/permissions.ts:503`, `:929`, `:1158`, `:1169`, `:1183`, `:1225`, `:1238`, `:1252`, `:1262`, `:1299`.
- Use a permission context/queue bridge with generic queue ops, frozen context, one-shot resolution guard, persisted permission updates, and explicit abort/cancel behavior. Evidence: `hooks/toolPermission/PermissionContext.ts:55`, `:75`, `:96`.
- Load commands from built-ins, bundled skills, plugin skills, skill dirs, workflows, plugin commands, then dynamic skills inserted before built-ins. Memoize expensive loading while reevaluating auth/provider availability fresh every call. Evidence: `commands.ts:353`, `:408`, `:449`, `:471`, `:519`.
- Make remote command safety explicit: prompt commands are safe, local commands need allowlist membership, and local JSX/UI commands are blocked. Evidence: `commands.ts:610`, `:651`, `:662`.
- Treat Agent as a first-class tool with typed inputs, permission-aware and MCP-aware exposure, background execution, output-file resumability, and worktree/remote isolation. Evidence: `tools/AgentTool/AgentTool.tsx:81`, `:197`, `:239`, `:337`, `:369`, `:568`, `:643`, `:686`, `:1264`, `:1281`.
- Support richer agent definition schema and precedence across built-in, plugin, user, project, flag, and managed agents, with later groups overriding earlier by `agentType`. Evidence: `tools/AgentTool/loadAgentsDir.ts:73`, `:193`.
- Separate remote session transport from SDK-message adaptation. Track permission requests by request ID, answer once, explicitly error unknown control subtypes, opt in to tool-result/historical user-message conversion, and ignore unknown SDK messages without crashing. Evidence: `remote/RemoteSessionManager.ts:19`, `:87`, `:95`, `:189`, `:247`; `remote/sdkMessageAdapter.ts:21`, `:150`, `:176`, `:220`, `:268`.

Behavior boundaries to carry into AGI:

- Do not copy React rendering, Bun feature gates, or Anthropic-specific SDK types directly.
- Preserve the contract shape, ordered decision pipeline, source precedence, and control/event boundaries as Rust traits/enums and registry builders.
- Do not let worker agents inherit accidental parent restrictions; assemble their tool pools independently under their permission mode.
- Clean up only unchanged worktrees; preserve changed ones.
