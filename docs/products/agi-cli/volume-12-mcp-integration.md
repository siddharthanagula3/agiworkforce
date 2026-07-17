# AGI CLI — Volume 12 — MCP Integration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), the surface rules in `apps/cli/AGENTS.md`, and verified repo code: `apps/cli/src/mcp/{mod.rs,http.rs,sse.rs,resources.rs,elicitation.rs,oauth_flow.rs,oauth_store.rs,connection_pool.rs,status.rs}`, `apps/cli/src/app_server.rs`, `apps/cli/src/lib.rs`, `apps/cli/src/cli_options.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/ecosystem.rs`, and `crates/agiworkforce-app-server/{src/lib.rs,README.md}`. Model IDs (where referenced) come only from `packages/contracts/types/src/models.json`.

## Overview & stance

AGI CLI is the pure-Rust (Ratatui TUI) developer surface with three trust modes: **Local**, **BYOK** (Desktop/CLI/VS Code only), and **Managed Cloud** (public alpha). The CLI acts as an **MCP client** that attaches external tool servers. Its typed app-server lets other local clients drive the full AGI engine; the separate `agi mcp-server` command currently advertises no executable tools rather than presenting an unwired one (`apps/cli/src/app_server.rs`, dispatched from `Command::McpServer` and `Command::AppServer`).

The binding constraint is the trust boundary. An MCP server over stdio is a local child process; an MCP server over SSE/HTTP is a network egress. The session privacy mode (`PrivacyMode::{Local,Byok,Managed}` in `apps/cli/src/agent/mod.rs` — ✅ Built) governs what may leave the device. Local sessions must never silently ship prompts, files, or tool arguments to a remote MCP endpoint; a remote MCP attach in a Local session is a boundary crossing that requires the same explicit fork discipline as Local→BYOK (context selection, secret scan, payload preview, visible provider/server label, consent). Sessions are workspace/session-scoped — MCP results never auto-sync to app chat.

## MCP Client

✅ Built — `apps/cli/src/mcp/mod.rs`. The client performs the `initialize` handshake (client sends `protocolVersion` `2024-11-05`, `clientInfo` `agiworkforce-cli`), emits `notifications/initialized`, then discovers capabilities. It supports `tools/list` (`list_tools`), `tools/call` (`call_tool`), `prompts/list` (`list_prompts`), and `prompts/get` (`get_prompt`). Discovered tools are namespaced `mcp_{server}_{tool}` (`McpTool::namespaced_name`) so multiple servers never collide, and each carries `permission_class: "external"`. Per-method timeouts (`initialize`, `list_tools`, `call_tool`, `health_check`) are configurable via `CliConfig`.

## MCP Server Discovery

✅ Built — `load_default_mcp_configs` / `load_explicit_mcp_configs` in `apps/cli/src/mcp/mod.rs`. Discovery order: project `.mcp.json` and `mcp.json`; `~/.agiworkforce/.mcp.json` and `~/.agiworkforce/mcp.json`; `~/.agiworkforce/config.toml`. Explicit files load via repeatable `--mcp-config <FILE>`, and `--strict-mcp-config` restricts the session to only those files (`McpConfigLoadOptions`, `apps/cli/src/cli_options.rs`). Cross-ecosystem import is ✅ Built: `agi ecosystem scan` / `agi ecosystem import` detect Claude, Codex, Cursor, and Gemini installs and import their MCP server configs (`apps/cli/src/ecosystem.rs`, wired at `apps/cli/src/lib.rs`).

## Server Registration

🟡 Partial — registration today is config-file driven. `McpServerConfig` accepts a tagged shape (`transport = "stdio" | "sse" | "http"`) or the legacy `{command, args, env}` stdio shape, normalized by `into_transport()` (`apps/cli/src/mcp/mod.rs`). There is **no dedicated `agi mcp add/list/remove` management subcommand** — the only MCP-named commands are `agi mcp-server` (run the CLI as a server) and `agi app-server`. Gap: an interactive registration/list/health CLI (`agi mcp …`) is 🔭 Planned; until then users register servers by editing `.mcp.json` / `config.toml` or via `agi ecosystem import`.

## Tool Discovery

✅ Built — `list_tools` (`apps/cli/src/mcp/mod.rs`) parses each `{name, description, inputSchema}` entry, requires a non-empty `name`, requires `inputSchema`, and rejects any schema whose `type` is not `"object"` (fails closed with a server-scoped error). Discovered tools merge into the agent tool set under their namespaced names and are subject to the session tool filter — `--allowedTools` / `--disallowedTools` (comma-separated, repeatable) gate MCP tools identically to built-ins. Servers whose `tools/list` fails degrade gracefully rather than aborting the session.

## Resources

🟡 Partial — `apps/cli/src/mcp/resources.rs` defines `McpResource` (`uri`, `name`, `description`, `mime_type`) and `McpResourceList` with `next_cursor` pagination and serde round-trip tests, but the client does **not** yet issue `resources/list` or `resources/read` RPCs (no wired call sites). Gap: resource enumeration, cursor paging, and reading resource contents into context are 🔭 Planned. Requirement when built: resource reads in a Local session must respect the trust boundary and never auto-fetch remote URIs without consent.

## Prompts

✅ Built — `apps/cli/src/mcp/mod.rs` discovers server prompts via `list_prompts` and resolves them with `get_prompt`. Each `McpPrompt` gets a slash-style `command_name` (`mcp:<server>:<prompt>`) plus `arguments` metadata; `expand_prompt_invocation` turns a typed invocation into the server-provided prompt text. Prompt discovery failures surface as a non-fatal "prompts unavailable" notice.

## Authentication

✅ Built — HTTP transport supports OAuth 2.1 PKCE (`apps/cli/src/mcp/oauth_flow.rs`, `oauth_store.rs`; `McpOAuthConfig` in `mod.rs`). On first `401`, the client runs RFC 9728 → RFC 8414 discovery, and when no `client_id` is configured it attempts RFC 7591 dynamic client registration; tokens persist to `~/.agiworkforce/mcp-oauth.json`. Static per-server bearer/API-key auth is supported via the `headers` map on SSE and HTTP transports. When the CLI itself runs as an app server, admission is enforced by `WebSocketSecurity` (`auth_token`, `allowed_origins`, `allow_query_token` — off by default because URL tokens leak into logs). Secrets must never be logged or written into synced state.

## Transport

✅ Built — three transports (`apps/cli/src/mcp/mod.rs` header, `http.rs`, `sse.rs`): `stdio` (JSON-RPC over a child process's stdin/stdout), `sse` (long-lived SSE stream + POST), and `http` (Streamable HTTP per the MCP 2025-06-18 spec, with sticky `Mcp-Session-Id` capture and JSON-or-SSE response handling in `http.rs`). `connection_pool.rs` (`McpConnectionManager`) manages live connections; `status.rs` snapshots per-server health.

## Permissions

✅ Built (client-side gate) — MCP tool calls carry `permission_class: "external"` and route through the CLI permission/approval store (`apps/cli/src/permissions.rs`, surfaced by `agi approvals`). Server-initiated `elicitation/create` requests are handled by `apps/cli/src/mcp/elicitation.rs`: the default `AutoDeclineHandler` declines every request (safe default), with a human-in-the-loop handler for interactive sessions and auto-decline for headless/non-interactive and SSE contexts so the approval boundary is never silently bypassed. Trust-mode enforcement for remote MCP egress in Local sessions is 🟡 — the privacy mode exists and blocks the cloud advisor tool, but MCP-specific consent-on-remote-attach is 🔭 Planned and must be added before remote MCP is offered inside Local sessions.

## Error Handling

✅ Built — JSON-RPC errors use the `JsonRpcError { code, message }` envelope (`crates/agiworkforce-app-server/src/lib.rs`); client-side failures are typed `anyhow` errors carrying the server name for context. Malformed tool schemas fail closed, missing capabilities degrade gracefully, per-method timeouts bound hangs, and cancellation emits `notifications/cancelled`. Unknown JSON-RPC methods on the server side return `-32601`.

### CLI as MCP / app server

🟡 Partial — `agi mcp-server` speaks MCP stdio but advertises an empty catalog until real agent execution is wired. ✅ Built — `agi app-server --listen stdio|<ws-addr>` runs the same typed developer-session host on either transport: full `AgentSession` tools/MCP plus `approval/requested` → `approval/respond` round-trips, interruption, steering, and streaming. WebSocket admission uses `WebSocketSecurity`; callers must provide `--auth-token` or `AGI_APP_SERVER_TOKEN`, and the token is never printed. The crate's separate `run_app_server`/`ToolDispatch` direct-tool API remains for embedders but is no longer the CLI command's restricted WebSocket path.

## Repository map

- `apps/cli/src/mcp/mod.rs` — MCP client, config discovery, tool/prompt discovery, namespacing.
- `apps/cli/src/mcp/{http.rs,sse.rs}` — Streamable HTTP + SSE transports.
- `apps/cli/src/mcp/{oauth_flow.rs,oauth_store.rs}` — OAuth PKCE, token store.
- `apps/cli/src/mcp/{elicitation.rs,resources.rs,connection_pool.rs,status.rs}` — elicitation, resource types, pooling, health.
- `apps/cli/src/app_server.rs` — full `CliDeveloperSessionHost` plus the separate `run_mcp_server` entry point.
- `crates/agiworkforce-app-server/src/lib.rs` — typed developer-session stdio/WS transport plus legacy direct `ToolDispatch` API.
- `apps/cli/src/cli_options.rs`, `apps/cli/src/ecosystem.rs` — flags + cross-tool MCP import.

## Competitor notes

Claude Code and Codex CLI both consume MCP servers and can run as MCP servers; ChatGPT exposes MCP connectors server-side. AGI's divergence: **multi-provider by construction** (MCP tools attach to any Local/BYOK/Managed session, not one vendor's model), **per-surface trust** (BYOK only on Desktop/CLI/VS Code; remote MCP in Local requires an explicit fork), **local-first** (stdio servers stay on-device; remote transports are visible network egress), and **ecosystem import** (`agi ecosystem import`) that adopts existing Claude/Codex/Cursor/Gemini MCP configs rather than locking users in.

## Acceptance / Definition of Done

- [ ] **Build:** `cargo check -p agiworkforce-cli` and `cargo test -p agiworkforce-cli --lib` pass; `cargo test -p agiworkforce-app-server` passes.
- [ ] **Discovery/registration:** all documented config sources load; `--strict-mcp-config` excludes defaults; every capability label above matches code (no 🟡/🔭 described as shipped).
- [ ] **Trust:** remote (SSE/HTTP) MCP attach inside a Local session is blocked or gated by explicit consent with a visible server label; stdio-local servers permitted; no MCP result auto-syncs to app chat.
- [ ] **Security:** OAuth/bearer secrets never logged or synced; `allow_query_token` stays off by default; server-initiated elicitation defaults to decline; malformed tool schemas fail closed.

## Anti-patterns

- Do **not** claim `agi mcp add` (or any `agi mcp …` management command) exists — only `agi mcp-server` and `agi app-server` ship; use config files or `agi ecosystem import`.
- Do **not** let a Local session silently reach a remote MCP server, or route MCP tool arguments/files to BYOK/Managed without an explicit fork.
- Do **not** describe Resources as shipped — enumeration/reading is 🔭.
- Do **not** hardcode or invent model IDs (use `packages/contracts/types/src/models.json`), routes, env vars, or INR prices; pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise — never "Plus", "Hobby", `pro_plus`, or credit top-ups.
- Do **not** reference Supabase (Clerk + Neon + Stripe only), enable `allow_query_token` by default, or auto-approve server elicitations.
- Do **not** use the `agiworkforce` binary in examples — it is a compatibility alias only.
