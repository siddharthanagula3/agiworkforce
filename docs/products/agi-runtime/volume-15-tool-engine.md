# AGI Runtime — Volume 15 — Tool Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-17

Authority: `AGENTS.md` (repo root); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/cli/AGENTS.md` (nearest surface rules for the app-server consumer). Grounded in `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-command-registry/src/lib.rs`, `apps/cli/src/app_server.rs`, `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/cli/src/tool_search.rs`, `apps/cli/src/tool_filters.rs`, `apps/cli/src/mcp/mod.rs`, `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, and `services/signaling-server/src/index.ts`.

## Overview & stance

The Tool Engine is the part of AGI Runtime that turns "the model wants to call `read_file`" into a validated, permission-gated, size-capped, timed execution and a normalized result. It is not a user surface; it is shared machinery the six surfaces compile in. Today its most complete expression is the CLI developer-session host exposed by `crates/agiworkforce-app-server` over typed stdio and authenticated WebSocket, plus the CLI's tool catalog and filters.

Trust modes shape this volume tightly. `agi app-server` is a **local full-engine surface**: both transports preserve the session's Local/BYOK/Managed boundary and mutating tools pause on `approval/requested` until the client returns a typed `ReviewDecision` through `approval/respond`. The obsolete seven-tool CLI adapter was deleted; the crate's generic `ToolDispatch` interface remains separate from the live command and has no AGI production dispatch registered. A Local tool call never silently reaches BYOK or Managed Cloud, and remote control is a **window** over a session running on the host, not a fourth mode. BYOK-only invocation applies to Desktop/CLI/VS Code and never Web or Mobile.

## Tool Registry — register available tools

The engine keeps two registries. **Commands** are modeled as metadata-rich records in `crates/agiworkforce-command-registry/src/lib.rs`: `RegistryCommand` carries `name`, `kind`, `source` (`CommandSource::{Builtin,User,Project,Plugin,Mcp,Bundled,Managed}`), `allowed_tools`, `disable_model_invocation`, `available_during_task`, and `is_sensitive`; `CommandRegistry` exposes `push`/`extend`/`find`, and `builtin_slash_registry_commands()` seeds the built-ins. **Tools** live in `apps/cli/src/platform/runtime/tool_catalog.rs`: `built_in_tool_definitions()` / `all_builtin_tool_definitions()` build `ToolDefinition{ name, description, input_schema, is_read_only, permission_class, max_result_size_chars, should_defer }` via a `def()` builder with `.read_only()`, `.control()`, `.interactive()`, `.deferred()`, and `.with_size_cap()`. Developer-session turns use this full agent registry; the separate `ToolDispatch` API exposes a caller-supplied direct-tool catalog to legacy embedders.

- ✅ Built — command + tool catalogs (`crates/agiworkforce-command-registry/src/lib.rs`; `apps/cli/src/platform/runtime/tool_catalog.rs`).
- ✅ Built — one full developer-session agent registry on stdio and WebSocket; the obsolete seven-schema CLI duplicate was removed.
- 🟡 Partial — MCP-server-registered tools: `McpServerConfig`/`PluginManifest` exist (`crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`) and the CLI loads live MCP tools (`apps/cli/src/mcp/mod.rs`), but they are not merged into one cross-surface registry.
- 🔭 Planned — a unified runtime registry spanning surfaces (blocked: `surface_heartbeats` table absent; only `apps/web/app/api/control-plane/status` stub exists).

## Discovery — discover tools dynamically

Only the ~11 core tool schemas ship in the model's initial context; niche tools (`apply_patch`, `glob`, `batch`, `multiedit`, `todo_*`, `read_many_files`, etc.) are `.deferred()` and loaded on demand — a Rust translation of Claude Code's `ToolSearchTool` / `shouldDefer` pattern (`apps/cli/src/tool_search.rs`). `search_tool_schemas()` accepts a `select:tool1,tool2` directive for exact schema fetch and a fuzzy keyword mode scoring name/alias/description, returning `was_deferred`. Names normalize through `tool_catalog::canonical_tool_name` and `tool_aliases`.

- ✅ Built — deferred-tool search + on-demand schema loading (`apps/cli/src/tool_search.rs`).
- 🟡 Partial — live MCP tool discovery via `tools/list` on connected servers and the `/mcp` command (`apps/cli/src/mcp/mod.rs`; command in `command-registry`).
- 🔭 Planned — remote/cross-surface tool discovery over the companion/remote-control fabric.

## Invocation — execute tools

Typed clients invoke the full engine through `turn/start`; the model's tool calls run inside `AgentSession`, and mutating calls suspend on the host's approval callback until `approval/respond` supplies a `ReviewDecision`. Before calls, `ensure_tool_call_allowed(tool_name, args, allowed_tools, disallowed_tools)` enforces allow/deny specs with argument-pattern matching (`apps/cli/src/tool_filters.rs`). The crate's generic direct API still supports caller-supplied `tools/call`, but the CLI no longer registers a second restricted catalog there.

- ✅ Built — full WebSocket/stdio agent invocation with approval round-trip; the generic direct API remains independently contract-tested.
- ✅ Built — allow/deny tool-filter enforcement (`apps/cli/src/tool_filters.rs`).
- 🟡 Partial — remote approval-gated invocation: the signaling relay defines `approval_request`/`approval_response` and `dispatch_request`/`dispatch_response` verbs (`services/signaling-server/src/index.ts`), but the desktop last mile is unwired and mobile `dispatch` is flag-off (`apps/mobile/lib/v1FeatureFlags.ts`).

## Result Processing — normalize outputs

Developer-session results stream as typed turn notifications (`turn/output_delta` followed by a terminal turn state). The generic direct API follows MCP conventions for caller-supplied dispatches: `{ content: [{ type:"text", text }], isError:bool }`. Agent tool outputs are bounded by `tool_result_size_cap()` → each tool's `max_result_size_chars` (`apps/cli/src/platform/runtime/tool_catalog.rs`).

- ✅ Built — MCP `content`/`isError` normalization on both the local and MCP-client paths.
- ✅ Built — per-tool result size caps (`tool_result_size_cap`).
- 🔭 Planned — structured (typed/streamed) result envelopes beyond text content blocks.

## Retry Policies

The only retry today is transport-level: an MCP `tools/call` that fails with a connection error triggers a single `reconnect()` and one retry on the fresh connection; other errors propagate (`apps/cli/src/mcp/mod.rs:744`). There is no exponential backoff, jitter, or per-tool retry budget.

- 🟡 Partial — reconnect-once-and-retry for MCP tool calls (`apps/cli/src/mcp/mod.rs`).
- 🔭 Planned — a declared retry policy per tool (max attempts, backoff, idempotency guard) so non-idempotent/mutating tools are never blindly re-run.

## Timeouts — prevent hanging tools

`McpTimeouts` bounds each MCP phase — `initialize` 30s, `list_tools` 10s, `call_tool` 120s, `health_check` 5s — overridable via `mcp_initialize_timeout` / `mcp_call_tool_timeout` config (`apps/cli/src/mcp/mod.rs`; `apps/cli/src/config.rs`). The developer-session host owns turn cancellation and approval timeouts; there is not yet one uniform per-tool deadline across built-in, MCP, and remote calls.

- ✅ Built — per-phase MCP timeouts, turn interruption, and approval timeout.
- 🟡 Partial — built-in tool calls have no uniform hard per-invocation wall-clock.
- 🔭 Planned — a uniform per-invocation deadline enforced across built-in, MCP, and remote tool calls.

## Repository map

- `crates/agiworkforce-app-server/src/lib.rs` — typed developer-session stdio/WS transport, approvals, and legacy `ToolDispatch` API.
- `crates/agiworkforce-command-registry/src/lib.rs` — `RegistryCommand`, `CommandRegistry`, `CommandSource`, built-ins.
- `apps/cli/src/app_server.rs` — `CliDeveloperSessionHost` wiring and the separate MCP-server entry point.
- `apps/cli/src/platform/runtime/tool_catalog.rs` — `ToolDefinition`, size caps, deferral, permission class.
- `apps/cli/src/tool_search.rs` — deferred-tool discovery / on-demand schema loader.
- `apps/cli/src/tool_filters.rs` — allow/deny tool-call enforcement.
- `apps/cli/src/mcp/mod.rs` — MCP client, timeouts, reconnect-retry, result extraction.
- `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` — `McpServerConfig`, `PluginManifest`.
- `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` — `StallWatchdog` stall timeout.
- `services/signaling-server/src/index.ts` — remote dispatch/approval verbs.

## Competitor notes

Claude Code, ChatGPT, and Codex ship a single-vendor tool loop bound to their own model and cloud. AGI's deliberate divergence: the engine is provider-neutral (model IDs resolve only from `packages/contracts/types/src/models.json`) and **per-session trust-scoped** — mutating app-server tools require a client-visible approval round-trip, and BYOK invocation is confined to Desktop/CLI/VS Code. Deferred-tool search mirrors Claude Code's `ToolSearchTool` while the MCP client keeps AGI open to third-party tool servers. Remote control remains a window over the host engine; nothing moves to the cloud implicitly.

## Acceptance / Definition of Done

The Tool Engine is production-ready when registry, discovery, invocation, normalization, retry, and timeout all hold under trust boundaries, with no mutating tool reachable without an approval channel.

- [ ] Build: `tools/list` and `tools/call` round-trip; deferred tools load via `select:` and fuzzy search; result caps applied.
- [ ] Trust: every mutating developer-session tool pauses for `approval/respond`; no Local invocation reaches BYOK/Cloud silently.
- [ ] Security: `ensure_tool_call_allowed` enforced pre-execution; per-phase timeouts and stall watchdog active; retries never re-run non-idempotent tools.

## Anti-patterns

- Auto-approving or silently exposing mutating tools without the developer-session approval channel.
- Routing a Local tool call to BYOK/Managed Cloud without an explicit fork (context selection, secret scan, payload preview, provider label, consent).
- Treating remote control as a fourth trust mode instead of a window over a host-local session.
- Hardcoding or inventing model IDs; enabling BYOK invocation on Web or Mobile.
- Claiming a unified cross-surface registry, structured retry, or per-invocation deadlines as shipped — they are 🔭.
- Referencing Supabase, `middleware.ts`, removed tiers (Plus/Hobby/`pro_plus`), or credit top-ups.
