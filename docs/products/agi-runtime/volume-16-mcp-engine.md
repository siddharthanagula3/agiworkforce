# AGI Runtime — Volume 16 — MCP Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `services/AGENTS.md`; and the real code this volume grounds in — `crates/agiworkforce-protocol/src/mcp.rs`, `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `packages/tools/mcp/src/{connect,transport,types}.ts`, `services/api-gateway/src/mcp/{mcpConfig,sharedClient,mcpRoutes}.ts`, `services/api-gateway/mcp-servers.json`.

## Overview & stance

The MCP Engine is the AGI Runtime component that speaks the Model Context Protocol as a **client** — discovering third-party MCP servers, enumerating their tools/resources/prompts, and brokering calls — and, in one narrow path, exposes an AGI surface **as** an MCP server. It is internal plumbing shared by the surfaces, not a user product.

Trust mode governs _where_ an MCP server runs and _who_ may reach it:

- **Local** (Desktop, CLI, VS Code): MCP servers are launched on-device through the plugin runtime + shared `@agiworkforce/mcp` client. Compute and server output stay local; nothing is silently forwarded to Cloud.
- **BYOK** (Desktop, CLI, VS Code only): an MCP server that itself needs a provider key uses the user's key on the same host. Local→BYOK remains an explicit fork (context selection, secret scan, payload preview, visible provider label, consent) — never on Web or Mobile.
- **Managed Cloud** (public alpha, open by default for signed-in users): Web and Mobile have **no local process host and no keys**, so their MCP access is bridged through the gateway proxy (`services/api-gateway`), which runs an allowlisted, audited server pool. This is a distinct trust boundary; Local/BYOK server output is never fed into it.

MCP is a free capability across all access modes; server counts or premium connectors may later be plan-gated (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) — that gating is 🔭.

## Server Discovery — discover MCP servers

Two real discovery paths exist. **On the host (Local/BYOK):** plugin manifests declare servers via an `mcpServers` map (camelCase accepted) plus the legacy `.mcp.json` format; transport passthrough (`transport`/`url`/`headers`/`auth`) is preserved verbatim in an `extra` catch-all so HTTP/SSE entries load without loss. ✅ Built — `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` (`McpServerConfig`, `ManifestFormat::LegacyMcp`). **On the gateway (Managed Cloud):** servers are read from `mcp-servers.json` (or `MCP_CONFIG_PATH`), validated by Zod, filtered to `enabled`, and listed with a live `connected` flag. ✅ Built — `services/api-gateway/src/mcp/mcpConfig.ts`, `GET /api/mcp/servers` in `mcpRoutes.ts`.

A unified cross-surface registry, per-user server catalogs, and marketplace/dynamic discovery are 🔭 (no registry table today).

## Tool Discovery — discover exposed tools

The shared client connects a server, calls `listTools()`, and flattens results into a catalog for prompt injection; per-server failures are isolated so one bad server does not sink the catalog. ✅ Built — `packages/tools/mcp/src/connect.ts` (`connectMcpServer`, `buildMcpToolCatalog`), typed by `packages/tools/mcp/src/types.ts`. The gateway surfaces this to Web/Mobile at `GET /api/mcp/servers/:serverId/tools`, returning `{ name, description, inputSchema }`, and executes calls at `POST /api/mcp/servers/:serverId/tools/:toolName/call` with argument validation against the tool's input schema. ✅ Built — `services/api-gateway/src/mcp/mcpRoutes.ts`. Wire-shape tool JSON is normalized into strongly typed protocol structs (`Tool`, `CallToolResult`, `Tool::from_mcp_value`). ✅ Built — `crates/agiworkforce-protocol/src/mcp.rs`. `list/changed` tool-notification subscriptions and de-duplicated namespacing across many servers are 🔭.

## Resource Access

Protocol types for resources are fully modeled: `Resource`, `ResourceTemplate`, and `ResourceContent` (`Text`/`Blob` variants), each with lossy-safe deserialization and adapter helpers (`Resource::from_mcp_value`, `ResourceTemplate::from_mcp_value`). ✅ Built — `crates/agiworkforce-protocol/src/mcp.rs`. **However, no runtime path reads resources yet:** the shared client and gateway expose no `resources/list`, `resources/read`, or `resources/templates/list` — the client only lists and calls tools. 🟡 Partial — types exist (`crates/agiworkforce-protocol/src/mcp.rs`) but the read/list wiring in `packages/tools/mcp/src/connect.ts` and the gateway routes is unbuilt (gap). Embedded-resource blocks _returned inside_ a tool result are already represented (`type: 'resource'` in `packages/tools/mcp/src/types.ts`), so tools that emit resources work; standalone resource browsing does not.

## Prompt Access

MCP server **prompts** (`prompts/list`, `prompts/get`) are 🔭 — there is no client or gateway method for them today. AGI's own `custom_prompts` (`/prompts:<name>` slash commands loaded from `~/.agiworkforce/prompts/`) are a separate, AGI-native mechanism and must **not** be conflated with MCP prompt primitives — `crates/agiworkforce-protocol/src/custom_prompts.rs`. The target: expose server prompts as first-class, namespaced slash commands with argument prompts, gated by the same approval and trust-boundary rules as tools. 🔭 Planned.

## Authentication — authenticate MCP servers

Real controls exist at both boundaries. **Gateway:** every MCP route requires a JWT (`authenticateToken`), rate limits list vs. call (`mcp-list`, `mcp-call`), rejects unexpected fields with Zod `.strict()`, audit-logs each call with user/server/tool, and blocks SSRF by refusing loopback/link-local/private HTTP URLs. ✅ Built — `services/api-gateway/src/mcp/{mcpRoutes,mcpConfig}.ts`. **Stdio spawn safety:** stdio transports require a **signed manifest** (legacy user consent honored only in developer mode with `for_command` + `for_args` pinned exactly), and dangerous env vars are stripped before spawn. ✅ Built — `packages/tools/mcp/src/transport.ts` (`MCPTransportError`). **HTTP auth headers** are passed through for streamable-http/SSE. ✅ Built — `packages/tools/mcp/src/{transport,connect}.ts`. Full **OAuth 2.1 / dynamic client registration, token refresh, and per-user secret vaulting** for remote MCP servers are 🔭.

## Lifecycle — manage server lifecycle

The shared client owns connect/close and transport selection across stdio, SSE, and streamable-http (default). The gateway keeps a live handle map, coalesces concurrent catalog builds, caches the catalog (default 60s TTL), replaces and cleanly closes stale handles, and closes all handles on graceful shutdown. ✅ Built — `services/api-gateway/src/mcp/sharedClient.ts` (`getSharedMcpCatalog`, `callSharedMcpTool`, `closeAllSharedMcpHandles`), `packages/tools/mcp/src/transport.ts`. The reverse direction — an AGI surface acting **as** an MCP server exposing a single `agiworkforce_exec` tool over stdio — is a distinct lifecycle consumed only by the CLI. ✅ Built — `crates/agiworkforce-app-server/src/lib.rs` (`run_mcp_server`). Health checks, automatic restart/backoff, per-user pooling, idle eviction, and cross-surface presence of MCP servers are 🔭 (`apps/web/app/api/control-plane/status` exists but no `surface_heartbeats` table).

## Repository map

- `crates/agiworkforce-protocol/src/mcp.rs` — MCP wire types (`Tool`, `Resource`, `ResourceTemplate`, `ResourceContent`, `CallToolResult`) + adapters.
- `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` — manifest MCP server discovery (`mcpServers`, `.mcp.json`).
- `crates/agiworkforce-app-server/src/lib.rs` — `run_mcp_server` (CLI-as-MCP-server) + `ToolDispatch::list_tools`.
- `packages/tools/mcp/src/{connect,transport,types}.ts` — `@agiworkforce/mcp` SDK client, transport resolver, catalog builder.
- `services/api-gateway/src/mcp/{mcpConfig,sharedClient,mcpRoutes}.ts` + `mcp-servers.json` — gateway proxy, allowlist, routes.
- `services/skill-vetting/src/skillspector/nodes/analyzers/mcp_*.py` — MCP tool-poisoning / rug-pull / least-privilege static analysis.

## Competitor notes

Claude and ChatGPT expose MCP as a single-account connector directory tied to their own model. Codex wires MCP into a local coding agent. AGI's deliberate divergence: MCP is **per-surface and per-trust-mode**. On Desktop/CLI/VS Code, servers run **local-first** with optional BYOK — no gateway sees the traffic. On Web/Mobile, MCP is a **bridged, allowlisted, audited** cloud path with no client-held keys. Server catalogs are provider-neutral (model IDs, when a server needs one, come only from `packages/contracts/types/src/models.json`), and stdio spawns are gated by signed manifests plus supply-chain analysis, rather than trusting an unvetted directory.

## Acceptance / Definition of Done

Production-ready gate: server discovery, tool discovery, resource read, and prompt access all work behind trust-mode isolation, with signed-manifest + allowlist enforcement, per-call audit logging, and no Local/BYOK data crossing into the gateway.

- [ ] Build: `resources/list`+`resources/read`+`prompts/list`+`prompts/get` wired in `packages/tools/mcp` and mirrored on the gateway; tool-list-changed notifications handled.
- [ ] Trust: Web/Mobile MCP flows only through the gateway allowlist; Desktop/CLI/VS Code local servers never emit to Cloud; Local→BYOK server keys pass the explicit fork (secret scan, payload preview, consent, visible provider label).
- [ ] Security: stdio requires signed manifest; HTTP URLs SSRF-checked; env scrubbed; every call JWT-authed, rate-limited, and audit-logged; skill-vetting MCP analyzers run on new server entries.

## Anti-patterns

- Treating Remote Control or the gateway MCP proxy as a fourth trust mode, or routing Local/BYOK server output into Managed Cloud.
- Claiming resource or prompt access is shipped — resources are 🟡 (types only), prompts are 🔭.
- Conflating AGI `custom_prompts` slash commands with MCP `prompts/*`.
- Spawning stdio servers without a signed manifest, or bypassing the command allowlist / SSRF URL checks.
- Enabling BYOK-backed MCP on Web or Mobile.
- Hardcoding or inventing model IDs, routes, env vars, or command names; use `models.json`, the real routes above, and the `agi` binary.
- Referencing Supabase, or resurrecting removed tiers (Plus, pro_plus, Hobby) or credit top-ups in any MCP billing/gating design.
