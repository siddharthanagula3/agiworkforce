# Volume 19 — MCP (Model Context Protocol)

Status: Canonical (depth expansion of `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 19)
Authority: this manual · `docs/strategy/10-oss-corpus-port-plan.md` (MCP Python SDK OAuth reference, deferred tools) · `docs/strategy/09-reference-codebases.md` (deferred tools + ToolSearch, per-agent envelopes) · `crates/agiworkforce-protocol/src/mcp.rs` · `apps/cli/src/features/mcp/` · `packages/client/desktop-command-client/src/mcp.ts`

## Philosophy & Cloud/Local stance

MCP is how AGI consumes external tools, resources, and prompts without baking each integration into the core. AGI is an MCP **client** (consuming servers), is building toward exposing an MCP **server** surface, and runs a **registry/discovery** layer so users can find and connect servers. The governing constraint: an MCP server is an **untrusted remote**. Its tools are loaded lazily (deferred), scoped per agent, permission-gated per call, and — critically — **MCP-sourced skills may not shell-inject** (the untrusted-remote boundary, `docs/strategy/09`). Tools are **deferred**: announced by name only, with the full schema fetched via `ToolSearch` on first use, so hundreds of tools can be exposed without paying their schema cost every turn.

Cloud/Local/Hybrid changes which servers are reachable and how auth flows, never the trust posture. A Local agent may use local stdio MCP servers; it does not silently connect to a remote MCP server that would carry Local context off-device. Remote MCP servers authenticate via OAuth 2.1 with PKCE (RFC 9728 + dynamic client registration, the MCP Python SDK reference in `docs/strategy/10` §2). Per-agent scoping is additive-only: a subagent receives extra servers, never broader authority than its parent (Vol 17). Every MCP tool call is data-in/data-out under the same fail-closed permission pipeline as native tools (Vol 18); content returned by an MCP server is untrusted data, never instructions.

## Binding rules

1. MCP servers are untrusted remotes; their tools pass the same fail-closed permission pipeline as native tools (Vol 18), with per-tool consent.
2. MCP tools are deferred — name only until `ToolSearch` loads the schema; a parse failure on a deferred tool tells the model to load the schema and retry (`docs/strategy/09`).
3. Per-agent MCP scoping is additive-only; a child never gains broader authority than its parent (Vol 17).
4. Remote servers use OAuth 2.1 + PKCE (with DCR where supported); tokens live in the OS keystore, never in client logs (Vol 25/27).
5. MCP-sourced skills/tools may not shell-inject or execute arbitrary commands; validate and sandbox (`docs/strategy/09`, `10` §5).
6. A Local agent never connects to a remote MCP server in a way that carries Local context off-device without the explicit fork.
7. Server content returned to the model is wrapped as untrusted data; it never becomes an instruction (port odysseus O5, `docs/strategy/09`).
8. Registry installs are vetted (SkillSpector / declared-vs-actual permission diff) before a server is enabled (`docs/strategy/10` §5).

## Repository map

- MCP protocol types: `crates/agiworkforce-protocol/src/mcp.rs`; dynamic/deferred tool plumbing: `crates/agiworkforce-protocol/src/dynamic_tools.rs`.
- CLI MCP client: `apps/cli/src/features/mcp/mod.rs` (server lifecycle, tool exposure); permissions via `crates/agiworkforce-execpolicy/` + `request_permissions.rs`.
- TS MCP API: `packages/client/desktop-command-client/src/mcp.ts`; MCP-app surfaces: `packages/contracts/types/src/mcp-apps.ts`, `packages/contracts/types/src/webmcp.ts`.
- Gateway-side MCP config/registry: `services/api-gateway/src/mcp/mcpConfig.ts`, `services/api-gateway/mcp-servers.json`, `services/api-gateway/src/mcp/__tests__/sharedClient.test.ts`.
- Plugin-delivered MCP servers (manifest declares them): `crates/agiworkforce-plugin-runtime/` fixtures (`.agiworkforce-plugin/plugin.json`) — Vol 22.
- Connector layer that may ride MCP transport: Vol 20 (`packages/ui/unified-chat/src/lib/connectorPermissionStore.ts`).

## Competitor notes

Claude Code and Claude Desktop popularized MCP as the integration substrate (servers, resources, prompts, OAuth-gated remotes) and Claude Code's deferred-tool + `ToolSearch` pattern is the context-cost solution AGI adapts (study only; `docs/strategy/09`). ChatGPT's connectors/apps cover similar ground via a different protocol (`docs/strategy/01`). AGI's divergence: MCP is consumed under **enforced trust boundaries and pre-install vetting** — per-agent additive scoping, untrusted-content wrapping, a no-shell-injection rule for remote-sourced skills, and a registry that scans before enabling (`docs/strategy/10` §5). The MCP Python SDK's full OAuth (RFC 9728 + DCR + PKCE) is the license-clean reference for the remote-server auth path. Parity is consume/expose/registry capability, never copied server code.

## Checklists

### Client (consuming servers)

- [ ] Server lifecycle managed (connect/health/disconnect) with cleanup on agent end (Vol 17).
- [ ] Tools are deferred; schema fetched via `ToolSearch` on first use.
- [ ] Deferred-tool arg-parse failure returns a load-the-schema-and-retry hint.
- [ ] Every MCP tool call runs through the fail-closed permission pipeline with per-tool consent.

### Server (exposing an MCP surface)

- [ ] Only explicitly published tools/resources/prompts are exposed; nothing by default.
- [ ] Exposed surface respects the caller's entitlement/trust; no Local data leaks via a served resource.
- [ ] Inputs validated (serde/Zod) at the server boundary (Vol 38).

### Registry / discovery

- [ ] Servers install only from an allowlisted/vetted source; SkillSpector scan + declared-vs-actual diff before enable.
- [ ] Discovery shows server identity, declared scopes, and required auth before connect.
- [ ] Re-scan on server update (rug-pull detection, `docs/strategy/10` §5).

### Auth (remote servers)

- [ ] OAuth 2.1 + PKCE; DCR where supported (RFC 9728 reference).
- [ ] Tokens stored in OS keystore; refresh handled; revoke path exists.
- [ ] No token or secret in client logs/telemetry (Vol 29).

### Per-agent scoping

- [ ] MCP servers attached to a subagent are additive-only; child authority ≤ parent.
- [ ] Read-only/plan agents get a minimal server set (cost + blast radius, Vol 17).

### Trust-boundary & safety

- [ ] A Local agent does not connect to a remote server carrying Local context off-device without the fork (test-asserted).
- [ ] MCP-sourced skills cannot shell-inject; command execution from remote content is blocked.
- [ ] Server-returned content is wrapped as untrusted data before reaching the model.

## Definition of Done

MCP is consumed via deferred tools + `ToolSearch` under the fail-closed permission pipeline; servers are vetted before enabling and re-scanned on update; remote auth uses OAuth 2.1 + PKCE with keystore-stored tokens; per-agent scoping is additive-only; remote-sourced skills cannot shell-inject; and a trust-boundary test proves Local context does not leak to a remote server without the fork. Verified per Operating Law 4 (targeted + trust-boundary tests + gateway MCP tests).

## Anti-patterns

- Sending every MCP tool schema each turn instead of deferring.
- Treating MCP server content as trusted instructions.
- Letting a subagent's MCP set widen its authority beyond the parent.
- Bearer-token-in-URL or logging OAuth tokens; skipping PKCE on remote servers.
- Enabling a registry server without a vetting scan or rug-pull re-scan.
- Allowing remote-sourced skills to shell out.
