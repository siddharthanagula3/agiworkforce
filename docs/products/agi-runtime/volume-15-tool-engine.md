# AGI Runtime — Volume 15 — Tool Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/cli/AGENTS.md` (nearest surface rules for the app-server consumer). Grounded in `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-command-registry/src/lib.rs`, `apps/cli/src/app_server.rs`, `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/cli/src/tool_search.rs`, `apps/cli/src/tool_filters.rs`, `apps/cli/src/mcp/mod.rs`, `crates/agiworkforce-task-runtime/src/lib.rs`, and `services/signaling-server/src/index.ts`.

## Overview & stance

The Tool Engine is the part of AGI Runtime that turns "the model wants to call `read_file`" into a validated, permission-gated, size-capped, timed execution and a normalized result. It is not a user surface; it is shared machinery the six surfaces compile in. Today its most complete expression is the CLI-consumed **app-server** (`crates/agiworkforce-app-server`, a local JSON-RPC-over-stdio + WebSocket host) plus the CLI's tool catalog and filters.

Trust modes shape this volume tightly. The app-server is a **local**, read-only, non-interactive surface: it advertises only seven tools and hard-blocks mutating tools because there is no approval channel on that path (`apps/cli/src/app_server.rs`). The engine mechanism itself is trust-mode agnostic, but every invocation must stay inside its session's boundary — a Local tool call never silently reaches BYOK or Managed Cloud, and remote control is a **window** over a session running on the host, not a fourth mode. BYOK-only invocation (choosing a provider key) applies to Desktop/CLI/VS Code and never Web or Mobile.

## Tool Registry — register available tools

The engine keeps two registries. **Commands** are modeled as metadata-rich records in `crates/agiworkforce-command-registry/src/lib.rs`: `RegistryCommand` carries `name`, `kind`, `source` (`CommandSource::{Builtin,User,Project,Plugin,Mcp,Bundled,Managed}`), `allowed_tools`, `disable_model_invocation`, `available_during_task`, and `is_sensitive`; `CommandRegistry` exposes `push`/`extend`/`find`, and `builtin_slash_registry_commands()` seeds the built-ins. **Tools** live in `apps/cli/src/platform/runtime/tool_catalog.rs`: `built_in_tool_definitions()` / `all_builtin_tool_definitions()` build `ToolDefinition{ name, description, input_schema, is_read_only, permission_class, max_result_size_chars, should_defer }` via a `def()` builder with `.read_only()`, `.control()`, `.interactive()`, `.deferred()`, and `.with_size_cap()`. The app-server exposes this through the `ToolDispatch` trait (`list_tools`) and its `tools/list` method.

- ✅ Built — command + tool catalogs (`crates/agiworkforce-command-registry/src/lib.rs`; `apps/cli/src/platform/runtime/tool_catalog.rs`).
- ✅ Built — app-server `tools/list` catalog with seven wired schemas (`apps/cli/src/app_server.rs`, `cli_tool_catalog()`).
- 🟡 Partial — MCP-server-registered tools: `McpServerConfig`/`PluginManifest` exist (`crates/agiworkforce-plugin-runtime/src/lib.rs`) and the CLI loads live MCP tools (`apps/cli/src/mcp/mod.rs`), but they are not merged into one cross-surface registry.
- 🔭 Planned — a unified runtime registry spanning surfaces (blocked: `surface_heartbeats` table absent; only `apps/web/app/api/control-plane/status` stub exists).

## Discovery — discover tools dynamically

Only the ~11 core tool schemas ship in the model's initial context; niche tools (`apply_patch`, `glob`, `batch`, `multiedit`, `todo_*`, `read_many_files`, etc.) are `.deferred()` and loaded on demand — a Rust translation of Claude Code's `ToolSearchTool` / `shouldDefer` pattern (`apps/cli/src/tool_search.rs`). `search_tool_schemas()` accepts a `select:tool1,tool2` directive for exact schema fetch and a fuzzy keyword mode scoring name/alias/description, returning `was_deferred`. Names normalize through `tool_catalog::canonical_tool_name` and `tool_aliases`.

- ✅ Built — deferred-tool search + on-demand schema loading (`apps/cli/src/tool_search.rs`).
- 🟡 Partial — live MCP tool discovery via `tools/list` on connected servers and the `/mcp` command (`apps/cli/src/mcp/mod.rs`; command in `command-registry`).
- 🔭 Planned — remote/cross-surface tool discovery over the companion/remote-control fabric.

## Invocation — execute tools

`tools/call` extracts `{name, arguments}` and dispatches through `ToolDispatch::call_tool` (`crates/agiworkforce-app-server/src/lib.rs`). The CLI's `CliToolDispatch::call_tool` first checks the `AVAILABLE_VIA_APP_SERVER` allowlist (seven read-only tools), returning an honest `isError` result — not a bare `-32601` — for anything mutating, then runs `execute_tool_with_opts` with `ToolExecOptions{ require_confirmation:false, auto_approve_safe:true, quiet:true, approval_callback:None }` (`apps/cli/src/app_server.rs`). Before any call, `ensure_tool_call_allowed(tool_name, args, allowed_tools, disallowed_tools)` enforces allow/deny specs with argument-pattern matching (`apps/cli/src/tool_filters.rs`).

- ✅ Built — local `tools/call` dispatch + read-only allowlist gate (`apps/cli/src/app_server.rs`).
- ✅ Built — allow/deny tool-filter enforcement (`apps/cli/src/tool_filters.rs`).
- 🟡 Partial — remote approval-gated invocation: the signaling relay defines `approval_request`/`approval_response` and `dispatch_request`/`dispatch_response` verbs (`services/signaling-server/src/index.ts`), but the desktop last mile is unwired and mobile `dispatch` is flag-off (`apps/mobile/lib/v1FeatureFlags.ts`).

## Result Processing — normalize outputs

Every result follows MCP conventions: `{ content: [{ type:"text", text }], isError:bool }`. `CliToolDispatch` maps executor `{output, success}` into that shape (`apps/cli/src/app_server.rs`), the app-server documents it on `ToolDispatch`, and the MCP client extracts the same `content` array from downstream servers (`apps/cli/src/mcp/mod.rs`). Oversized outputs are bounded by `tool_result_size_cap()` → each tool's `max_result_size_chars` (`apps/cli/src/platform/runtime/tool_catalog.rs`).

- ✅ Built — MCP `content`/`isError` normalization on both the local and MCP-client paths.
- ✅ Built — per-tool result size caps (`tool_result_size_cap`).
- 🔭 Planned — structured (typed/streamed) result envelopes beyond text content blocks.

## Retry Policies

The only retry today is transport-level: an MCP `tools/call` that fails with a connection error triggers a single `reconnect()` and one retry on the fresh connection; other errors propagate (`apps/cli/src/mcp/mod.rs:744`). There is no exponential backoff, jitter, or per-tool retry budget.

- 🟡 Partial — reconnect-once-and-retry for MCP tool calls (`apps/cli/src/mcp/mod.rs`).
- 🔭 Planned — a declared retry policy per tool (max attempts, backoff, idempotency guard) so non-idempotent/mutating tools are never blindly re-run.

## Timeouts — prevent hanging tools

`McpTimeouts` bounds each MCP phase — `initialize` 30s, `list_tools` 10s, `call_tool` 120s, `health_check` 5s — overridable via `mcp_initialize_timeout` / `mcp_call_tool_timeout` config (`apps/cli/src/mcp/mod.rs`; `apps/cli/src/config.rs`). Long-running background tasks are watched by `StallWatchdog`, which fails a task with `"stall timeout"` when its output file stops growing (`crates/agiworkforce-task-runtime/src/lib.rs`). The app-server carries `session_timeout_secs` (default 3600) (`crates/agiworkforce-app-server/src/lib.rs`).

- ✅ Built — per-phase MCP timeouts + stall watchdog.
- 🟡 Partial — app-server session timeout exists, but built-in `tools/call` has no hard per-invocation wall-clock on the local dispatch path.
- 🔭 Planned — a uniform per-invocation deadline enforced across built-in, MCP, and remote tool calls.

## Repository map

- `crates/agiworkforce-app-server/src/lib.rs` — `ToolDispatch` trait, `tools/list` / `tools/call`, JSON-RPC envelope, transports.
- `crates/agiworkforce-command-registry/src/lib.rs` — `RegistryCommand`, `CommandRegistry`, `CommandSource`, built-ins.
- `apps/cli/src/app_server.rs` — `CliToolDispatch`, seven-tool catalog, read-only allowlist.
- `apps/cli/src/platform/runtime/tool_catalog.rs` — `ToolDefinition`, size caps, deferral, permission class.
- `apps/cli/src/tool_search.rs` — deferred-tool discovery / on-demand schema loader.
- `apps/cli/src/tool_filters.rs` — allow/deny tool-call enforcement.
- `apps/cli/src/mcp/mod.rs` — MCP client, timeouts, reconnect-retry, result extraction.
- `crates/agiworkforce-plugin-runtime/src/lib.rs` — `McpServerConfig`, `PluginManifest`.
- `crates/agiworkforce-task-runtime/src/lib.rs` — `StallWatchdog` stall timeout.
- `services/signaling-server/src/index.ts` — remote dispatch/approval verbs.

## Competitor notes

Claude Code, ChatGPT, and Codex ship a single-vendor tool loop bound to their own model and cloud. AGI's deliberate divergence: the engine is provider-neutral (model IDs resolve only from `packages/types/src/models.json`) and **per-surface trust-scoped** — the app-server refuses mutating tools locally rather than assuming a cloud approval UI, and BYOK invocation is confined to Desktop/CLI/VS Code. Deferred-tool search mirrors Claude Code's `ToolSearchTool` while the MCP client keeps AGI open to third-party tool servers. Remote control follows Claude Code Remote Control / Codex parity: the tool loop runs on the host and the phone is an approval-gated window — nothing moves to the cloud implicitly.

## Acceptance / Definition of Done

The Tool Engine is production-ready when registry, discovery, invocation, normalization, retry, and timeout all hold under trust boundaries, with no mutating tool reachable without an approval channel.

- [ ] Build: `tools/list` and `tools/call` round-trip; deferred tools load via `select:` and fuzzy search; result caps applied.
- [ ] Trust: app-server allowlist rejects every mutating tool with an `isError` result; no Local invocation reaches BYOK/Cloud silently; remote invocation stays approval-gated.
- [ ] Security: `ensure_tool_call_allowed` enforced pre-execution; per-phase timeouts and stall watchdog active; retries never re-run non-idempotent tools.

## Anti-patterns

- Auto-approving or silently exposing mutating tools on the read-only app-server surface.
- Routing a Local tool call to BYOK/Managed Cloud without an explicit fork (context selection, secret scan, payload preview, provider label, consent).
- Treating remote control as a fourth trust mode instead of a window over a host-local session.
- Hardcoding or inventing model IDs; enabling BYOK invocation on Web or Mobile.
- Claiming a unified cross-surface registry, structured retry, or per-invocation deadlines as shipped — they are 🔭.
- Referencing Supabase, `middleware.ts`, removed tiers (Plus/Hobby/`pro_plus`), or credit top-ups.
