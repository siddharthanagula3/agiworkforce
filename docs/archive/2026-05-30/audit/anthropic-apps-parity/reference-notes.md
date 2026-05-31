# Local Reference Notes

Status: Current evidence
Owner: Product/platform
Last updated: 2026-05-20.

This file records architecture patterns from `/Users/siddhartha/Desktop/reference`. It is not permission to copy code.

## License Snapshot

| Reference       | Path                                             | License status observed                                                            | Guidance                                                                                                                        |
| --------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Codex CLI       | `/Users/siddhartha/Desktop/reference/codex-cli`  | Apache-2.0 license file present.                                                   | Architecture is safe to study. Do not copy source unless Apache-2.0 obligations and `NOTICE` handling are explicitly preserved. |
| OpenClaw        | `/Users/siddhartha/Desktop/reference/openclaw`   | MIT license file present.                                                          | Concepts can be reimplemented cleanly. Copied source would require copyright/license notice.                                    |
| Gemini CLI      | `/Users/siddhartha/Desktop/reference/gemini-cli` | Apache-2.0 license file present.                                                   | Architecture is safe to study. Copied source would need Apache headers/notices as required by that repo.                        |
| opencode        | `/Users/siddhartha/Desktop/reference/opencode`   | MIT license file present.                                                          | Concepts can be reimplemented cleanly. Copied source would require copyright/license notice.                                    |
| claw-code       | `/Users/siddhartha/Desktop/reference/claw-code`  | MIT declared in `rust/Cargo.toml`, but no root `LICENSE` found in inspected paths. | Treat as license-uncertain until a repository-level license is verified. Use high-level ideas only.                             |
| `reference/src` | `/Users/siddhartha/Desktop/reference/src`        | No license metadata found in inspected paths.                                      | Treat as internal/proprietary unless owner clearance says otherwise. Do not redistribute or copy from it.                       |

## Architecture Patterns To Evaluate

| Pattern                                    | References to inspect                                                                            | AGI use                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed event protocol                       | Codex submission/event queues, Gemini `stream-json`, OpenClaw WebSocket events, Claw lane events | Define one NDJSON/WebSocket event model with `seq`, `stateVersion`, `sessionId`, `workerId`, `toolCallId`, provenance, and replay support.      |
| Durable session manager                    | Codex thread lifecycle, opencode sessions, AGI task/session stores                               | Parent/child sessions, fork/resume/archive, branch metadata, snapshots, usage/cost, and persistent task outputs.                                |
| Rust CLI as engine with protocol contracts | Codex CLI, AGI `apps/cli`, `crates/*`                                                            | Keep CLI/Rust engine as canonical behavior source instead of letting surfaces diverge.                                                          |
| Declarative tool registry                  | Codex tool registry plan, opencode tools, `reference/src/Tool.ts`                                | Split tool declarations from executors: schema, visibility, diagnostics, permissions, parallelism, owner, executor reference.                   |
| Worker lifecycle states                    | Claw worker states, opencode child sessions, AGI task runtime                                    | Standard states: `spawning`, `trust_required`, `ready_for_prompt`, `prompt_accepted`, `running`, `blocked`, `finished`, `failed`.               |
| Permission profiles                        | opencode permissions, Codex sandbox/exec policy, Claude tool permission behavior                 | Build/plan/review/explore/general profiles, session grants, turn grants, persisted approvals, and deny-by-default dangerous operations.         |
| Gateway daemon                             | OpenClaw gateway, AGI future local engine                                                        | A local daemon owns sessions, workers, tools, plugins, credentials, device pairing, and event broadcast; CLI/TUI/Web/Mobile become clients.     |
| Team topology                              | `reference/src` team/swarm/task primitives, opencode child tasks                                 | Manager/worker topology, mailboxes, task assignment, quotas, cancellation, worker health, reconnection, and visible lane state.                 |
| Plugin activation plan                     | OpenClaw manifest-first plugins, Codex/Gemini extension patterns                                 | Validate manifests without executing plugin code; dependency resolution, capability registration, startup diagnostics, stable SDK public types. |
| Parity harness                             | Gemini tests/perf/checkpoints, Claw compat harness, Codex protocol tests                         | Golden task scenarios, mock providers, deterministic shell fixtures, sandbox matrix, memory/perf baselines, event transcript replay.            |
| Command palette and slash command registry | `reference/src/commands`, Codex/Gemini/opencode command layers                                   | Finish custom commands and MCP prompt commands.                                                                                                 |
| Provider abstraction                       | OpenClaw packages, AGI `packages/providers`, `packages/llm-runtime`                              | Multi-provider BYOK without per-surface drift.                                                                                                  |
| MCP/connectors                             | Claude docs, Codex/OpenClaw/Gemini MCP code, AGI `packages/mcp`                                  | Unified connector registry and OAuth state.                                                                                                     |
| Artifacts/sandbox rendering                | Claude artifact behavior, AGI `apps/sandbox`, `packages/unified-chat`                            | Dedicated artifact contract and secure renderer.                                                                                                |
| Agents/subagents/tasks                     | Claude subagents docs, opencode/Gemini task patterns, AGI task crates                            | Agent manager plus separate context execution.                                                                                                  |
| Local/BYOK boundary                        | AGI product decision, local model packages                                                       | Carry privacy mode through all surfaces.                                                                                                        |

## Reference Strengths

- Codex CLI: strongest terminal-agent architecture boundary, typed submission/event queues, thread lifecycle, declarative tool registry, sandbox/policy separation.
- opencode: strongest productized client/server split, OpenAPI/SDK generation, SQLite-backed sessions, child sessions, plugin hooks around LLM calls, and explicit agent permission profiles.
- OpenClaw: strongest local-first gateway model: daemon, typed WebSocket protocol, device pairing, scoped roles, manifest-first plugins, runtime selection, and nodes as capability hosts.
- Gemini CLI: strongest operational maturity: CLI/core/A2A/SDK split, checkpointing, noninteractive JSON modes, trusted folders, sandbox matrix, hooks/extensions/skills docs, memory tests, performance baselines.
- claw-code: useful for parity harness thinking: machine-readable events, worker lifecycle states, prompt-acceptance evidence, preflight doctor contracts, recovery recipes, and registry-backed placeholders.
- `reference/src`: contains many AGI-shaped primitives already: tools, tasks, remote transports, bridge/session runners, permissions, swarm/team backends, plugin marketplace utilities, telemetry, shell wrappers, secure storage, memory, and command surfaces.

## Files Inspected By Reference Explorer

Codex CLI: `LICENSE`, `NOTICE`, `README.md`, `docs/license.md`, `codex-rs/README.md`, `codex-rs/Cargo.toml`, `codex-rs/core/src/lib.rs`, `codex-rs/core/src/thread_manager.rs`, `codex-rs/core/src/codex_thread.rs`, `codex-rs/core/src/session/session.rs`, `codex-rs/core/src/session/turn.rs`, `codex-rs/core/src/tools/handlers/mod.rs`, `codex-rs/core/src/tools/context.rs`, `codex-rs/core/src/tools/handlers/multi_agents.rs`, `codex-rs/core/src/agent/mod.rs`, `codex-rs/core/src/agent/registry.rs`, `codex-rs/protocol/src/lib.rs`, `protocol.rs`, `items.rs`, `codex-rs/tools/src/lib.rs`, `tool_registry_plan.rs`, `tool_registry_plan_types.rs`, `codex-rs/config/src/lib.rs`, `codex-rs/execpolicy/src/lib.rs`, `codex-rs/tui/src/app.rs`.

claw-code: `README.md`, `PARITY.md`, `ROADMAP.md`, `rust/README.md`, `rust/Cargo.toml`, all `rust/crates/*/Cargo.toml`, `rust/crates/rusty-claude-cli/src/main.rs`, `rust/crates/runtime/src/lib.rs`, `rust/crates/api/src/lib.rs`, `rust/crates/tools/src/lib.rs`, plus `rust/crates/{api,commands,compat-harness,mock-anthropic-service,plugins,runtime,rusty-claude-cli,telemetry,tools}` and `src`.

OpenClaw: `LICENSE`, `package.json`, `README.md`, `VISION.md`, `AGENTS.md`, `openclaw.mjs`, `src/index.ts`, `src/cli/program/index.ts`, `src/plugin-sdk/index.ts`, `src/gateway/protocol/version.ts`, `docs/concepts/{architecture.md,agent-runtimes.md,session.md}`, `docs/plugins/{architecture.md,manifest.md}`, `docs/gateway/protocol.md`, `src/agents/runtime-plan/{types.ts,build.ts}`, `src/tools/{planner.ts,types.ts}`, plus `src`, `packages`, `extensions/{codex,opencode,openai,browser}`, and docs subdirectories.

opencode: `LICENSE`, `package.json`, `README.md`, `AGENTS.md`, `STATS.md`, package manifests under `packages/{opencode,core,plugin,sdk/js}`, `packages/opencode/src/index.ts`, `server/server.ts`, `tool/{tool.ts,bash.ts,task.ts}`, `session/{session.ts,processor.ts,llm.ts}`, `config/config.ts`, `agent/agent.ts`, `permission/index.ts`, `acp/README.md`, `specs/v2/session.md`, plus `packages/{opencode,core,plugin}/src`, `specs`, and `packages/docs`.

Gemini CLI: `LICENSE`, `package.json`, `README.md`, `GEMINI.md`, `ROADMAP.md`, package manifests under `packages/{cli,core,a2a-server,sdk}`, plus `packages/{cli,core,a2a-server,sdk}/src` and docs under `docs/{core,cli,tools,hooks,extensions}`.

`reference/src`: top-level files including `QueryEngine.ts`, `Task.ts`, `Tool.ts`, `commands.ts`, `context.ts`, `cost-tracker.ts`, `history.ts`, `main.tsx`, `query.ts`, `replLauncher.tsx`, `tasks.ts`, `tools.ts`; directories including `assistant`, `bridge`, `cli`, `commands`, `components`, `context`, `coordinator`, `entrypoints`, `hooks`, `ink`, `memdir`, `plugins`, `query`, `remote`, `schemas`, `server`, `services`, `skills`, `state`, `tasks`, `tools`, `utils`, `vim`, and `voice`.

## Full `reference/src` Read Pass

Completed: 2026-05-20.

Inventory command: `rg --files -g '!node_modules' -g '!dist' -g '!build' -g '!target' -g '!.git'` from `/Users/siddhartha/Desktop/reference/src`.

Coverage: 1902 of 1902 scoped files were read through assigned parallel explorer passes. This is a coverage record, not permission to copy code.

| Scope                                                                                                     |    Files | Coverage notes                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core runtime, entrypoints, bridge, remote, state, tasks, types, migrations, native shims, top-level files |      157 | Covered by the core explorer. Includes `QueryEngine.ts`, `query.ts`, `Tool.ts`, `Task.ts`, `commands.ts`, `main.tsx`, `screens/REPL.tsx`, bridge/remote/session/task files. |
| `commands/`                                                                                               |      207 | Covered by the commands explorer.                                                                                                                                           |
| `components/` + `ink/`                                                                                    |      485 | Covered by the terminal UI explorer.                                                                                                                                        |
| `tools/`                                                                                                  |      184 | Covered by the tools explorer.                                                                                                                                              |
| `services/` + `hooks/`                                                                                    |      234 | Covered by the services/hooks explorer and verified by checksumming the file set.                                                                                           |
| `utils/`                                                                                                  |      564 | Covered by the utils explorer.                                                                                                                                              |
| `constants/`, `keybindings/`, `memdir/`, `plugins/`, `skills/`, `buddy/`                                  |       71 | Covered by the small-scope explorer; an initial count mismatch was reconciled to 71 files and no omissions.                                                                 |
| **Total**                                                                                                 | **1902** | Matches the scoped inventory.                                                                                                                                               |

### Main Architecture Lessons

- `reference/src` is a mature TypeScript/Bun terminal-agent application, with React Ink UI, a headless SDK path, remote/control-plane paths, and cloud/app connectors built around shared runtime concepts.
- Core turn execution is centered on `query.ts`; `QueryEngine.ts` wraps it for SDK/headless use; `screens/REPL.tsx` integrates it into the interactive app.
- Tools are declarative objects with schemas, permission metadata, render hooks, concurrency/read-only flags, MCP metadata, activity summaries, and result serialization.
- Slash commands are typed product workflows, not macros. They support local text results, local JSX flows, and prompt-injection workflows, with explicit completion routing.
- Terminal UI is treated as a real rendering engine: frame buffers, dirty damage, cursor/selection/search state, virtualized transcripts, pinned prompt/status regions, and overlay cleanup through diffing.
- Permissions are layered across mode, per-tool checks, deny/ask/allow rules, hooks, classifier, sandbox, bridge callbacks, remote control requests, and UI-specific prompts.
- Shell safety is semantic. Bash and PowerShell use separate validation systems, with AST/parsing, path checks, read-only validation, dangerous-subcommand handling, output persistence, and sandbox wrapping.
- Remote control is first-class: bridge, websocket/SSE transports, direct connect, session ingress, worker registration, heartbeats, session URLs, and cloud session compatibility all share lifecycle concepts.
- MCP/connectors are productized: config scopes, OAuth/PKCE/XAA, enterprise policy, transport health, reconnect flows, tool/resource/prompt metadata, elicitation, and user-visible status.
- Long-running sessions require compaction, prompt-cache boundaries, session memory, durable extracted memory, recent-context restoration, transcript persistence, resume/rewind, and tool-result storage.
- Plugins/skills/keybindings/settings are registry-driven with schema validation, source precedence, policy locks, and feature-gated additions.
- Telemetry and feature flags are infrastructure-level concepts: privacy tagging, sinks/killswitches, sampling, failed-batch retry, OpenTelemetry traces, plugin privacy hashing, and cached feature evaluation.

### AGI Workforce Application Lessons

The most important product lesson is that Claude-style parity comes from a shared engine contract, not from independently matching UI screens. AGI should use the CLI/Rust engine as the canonical behavior source and expose the same contracts to Desktop, Web, Mobile, VS Code, and Chrome.

Prioritized implementation targets for AGI:

1. Define one event/message envelope for local CLI, TUI, SDK, Desktop, Web, Mobile, remote sessions, and future cloud workers.
2. Split tool declarations from executors with schema, metadata, diagnostics, permission requirements, result renderers, and model-facing summaries.
3. Implement deny/ask/allow permission ordering everywhere, with read-before-write and stale-state checks for file mutation.
4. Add separate Bash and PowerShell semantic validators rather than relying on command string allowlists.
5. Build slash commands as typed workflows with lazy-loaded implementation and noninteractive support where useful.
6. Make MCP/connectors a full product surface: auth, policy, scopes, health, reconnect, prompts, tools, resources, and marketplace state.
7. Promote plugins, skills, output styles, agents, hooks, and keybindings into shared registries with schema validation and policy precedence.
8. Make remote/background agents explicit session/task types with lifecycle state, output persistence, cancellation, heartbeats, and recovery.
9. Add compaction, session memory, durable memory, and prompt-cache-aware context building as engine features rather than surface-local features.
10. Keep Local/BYOK/Managed privacy labels and handoff previews attached to the message/session envelope, not only UI state.

### `reference/src` Study-First Files

- Core: `entrypoints/cli.tsx`, `main.tsx`, `setup.ts`, `screens/REPL.tsx`, `QueryEngine.ts`, `query.ts`, `Tool.ts`, `tools.ts`, `Task.ts`, `commands.ts`.
- SDK/protocol: `entrypoints/sdk/coreSchemas.ts`, `entrypoints/sdk/controlSchemas.ts`, `cli/structuredIO.ts`, `cli/remoteIO.ts`, `cli/transports/*`.
- Commands: `commands/plugin/ManagePlugins.tsx`, `commands/plugin/PluginSettings.tsx`, `commands/mcp/mcp.tsx`, `commands/mcp/addCommand.ts`, `commands/model/model.tsx`, `commands/fast/fast.tsx`, `commands/resume/resume.tsx`, `commands/compact/compact.ts`, `commands/install-github-app/install-github-app.tsx`.
- UI: `ink/ink.tsx`, `ink/screen.ts`, `ink/render-node-to-output.ts`, `components/FullscreenLayout.tsx`, `components/Messages.tsx`, `components/PromptInput/PromptInput.tsx`, `components/permissions/PermissionRequest.tsx`, `components/mcp/MCPSettings.tsx`, `components/agents/AgentsMenu.tsx`, `components/Settings/Config.tsx`.
- Tools: `tools/BashTool/BashTool.tsx`, `tools/BashTool/bashPermissions.ts`, `tools/BashTool/readOnlyValidation.ts`, `tools/PowerShellTool/PowerShellTool.tsx`, `tools/FileReadTool/FileReadTool.ts`, `tools/FileEditTool/FileEditTool.ts`, `tools/FileWriteTool/FileWriteTool.ts`, `tools/ToolSearchTool/prompt.ts`, `tools/AgentTool/AgentTool.tsx`, `tools/SkillTool/SkillTool.ts`, `tools/MCPTool/MCPTool.ts`.
- Services/hooks: `services/api/claude.ts`, `services/api/client.ts`, `services/api/withRetry.ts`, `services/mcp/config.ts`, `services/mcp/auth.ts`, `services/mcp/client.ts`, `services/mcp/useManageMCPConnections.ts`, `services/compact/compact.ts`, `services/SessionMemory/sessionMemory.ts`, `hooks/useCanUseTool.tsx`, `hooks/useTypeahead.tsx`, `hooks/useRemoteSession.ts`, `hooks/useReplBridge.tsx`, `hooks/useVirtualScroll.ts`.
- Utilities/registries: `utils/settings/types.ts`, `utils/settings/settings.ts`, `utils/permissions/permissions.ts`, `utils/permissions/filesystem.ts`, `utils/Shell.ts`, `utils/ShellCommand.ts`, `utils/plugins/pluginLoader.ts`, `utils/plugins/marketplaceManager.ts`, `utils/model/model.ts`, `utils/sessionStorage.ts`, `utils/messages.ts`, `constants/prompts.ts`, `memdir/memdir.ts`, `skills/loadSkillsDir.ts`, `keybindings/defaultBindings.ts`.

### `reference/src` Copying Cautions

- Treat `reference/src` as unknown-license/internal reference code. Do not copy code, comments, unique strings, endpoint paths, client IDs, feature flag names, telemetry names, schemas, or prompt text into AGI Workforce.
- Several files contain inline source maps or generated output. Use them as behavior clues only, not style or source material.
- Security-sensitive areas include bridge tokens, JWT/session ingress, trusted device, sandbox bypass, MCP OAuth, remote worker secrets, secure storage, permission bypass, shell validation, and upstream proxy credentials.
- Cyber/safeguards instructions, OAuth config, beta headers, and internal cloud endpoints should not be ported verbatim.
- Any AGI implementation should be a clean-room behavior implementation based on public docs, AGI product requirements, and independently written tests.

## Reuse Rules

- MIT/Apache references can inform design and, if copied, must preserve license/copyright notices.
- Do not mix unknown-license code into AGI.
- Prefer original implementation around public behavior, test cases, and architecture contracts.
- For proprietary Claude behavior, implement compatible workflows from public docs and user-visible behavior only.
