# AGI VS Code Extension — Volume 12 — MCP

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, `docs/surfaces/vscode-extension.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/platform/config.ts`, `apps/extension-vscode/src/core/advancedFeatures.ts`, `apps/extension-vscode/src/extension.ts`, `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`, `apps/extension-vscode/src/utils/api.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`.

## Overview & stance

This volume specifies how the VS Code extension participates in the **Model Context Protocol (MCP)** — how it discovers, registers, and uses MCP servers, and how MCP resources, prompts, tools, and auth behave under AGI's trust model. The extension is the IDE-native, **workspace-scoped** developer surface, exposed to **Local + BYOK + Managed Cloud** with explicit selection and visible provider labels.

The extension is not an MCP protocol client. Developer-session MCP discovery and execution are owned by `agi app-server`, configured through the CLI/runtime, and surfaced through loading/ready/unavailable events in `@agi` and the sidebar. The separate `agiWorkforce.mcp.enabled` toggle defaults false and applies only to legacy cloud-backed editor utilities plus the optional Desktop bridge; its manifest description makes that scope explicit. There is no extension-owned server registry, resource/prompt browser, or MCP OAuth UI.

The binding trust rule: developer-session MCP configuration is app-server/CLI-owned and workspace/task-scoped. Tool output follows the explicitly selected runtime provider and never auto-syncs to consumer app chat. The optional Desktop bridge is a separate Local transport for legacy extension utilities.

## Server Discovery

Discovery is how the extension learns which MCP servers exist and are reachable.

- **Enable signal** — 🟡 `agiWorkforce.mcp.enabled` gates the whole domain; a webview status chip renders `mcp` when set (`apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`). Gap: this is a boolean, not a discovered inventory.
- **Bridge-provided catalog** — 🔭 Planned. The extension shall request the list of Local MCP servers the desktop bridge hosts and render name, transport, tool/resource/prompt counts, and health. No discovery frame exists in the bridge protocol allowlists yet (`ALLOWED_INBOUND_TYPES`/`ALLOWED_OUTBOUND_TYPES`, `desktopBridge.ts`).
- **Workspace-declared servers** — 🔭 Planned. Read an optional workspace `mcp.json`-style manifest; entries from untrusted workspaces are treated as untrusted config (mirror the `restrictedConfigurations` policy in `package.json`) and disabled until the workspace is trusted.
- **Testable:** with `mcp.enabled=false`, discovery performs zero bridge/network calls; with it on but bridge down, the user sees the existing warning, not a silent failure (`advancedFeatures.ts`).

## Server Registration

Registration binds a discovered server to this workspace session with an explicit trust mode.

- **Registration record** — 🔭 Planned. Each server records id, transport (stdio/local socket via bridge, or remote URL), trust mode (Local via bridge = `local_only`; a remote MCP endpoint is BYOK/Managed and labeled), and enabled tools/resources.
- **Explicit, scoped, non-syncing** — 🔭 Planned. Registrations are workspace-scoped and stored locally; they must never sync into Web/Mobile/Desktop app chat (`apps/extension-vscode/AGENTS.md` lane contract). A remote MCP server is a trust-boundary change requiring consent + a visible provider label.
- **Bridge dependency** — the extension utility toggle can connect/warn about the optional Desktop bridge, but app-server MCP does not depend on that toggle or bridge.

## Resources

MCP resources are read-only context objects (files, docs, records) a server exposes.

- **Enumerate + attach** — 🔭 Planned. List a server's resources and let the user attach them to the Context Files tree (`agi-workforce.contextPanel`) so they flow through the existing context budget, not a side channel.
- **Provenance labels** — 🔭 Planned. Every attached resource shows its source server and trust mode; a Local-server resource must be visibly marked before any BYOK/Cloud send, and included only after the redacted-fork consent.
- **No silent fetch** — 🔭 Planned. Resource reads occur only on explicit attach/refresh; no background polling that could exfiltrate workspace data.

## Prompts

MCP prompts are server-published prompt templates / slash-style entries.

- **Prompt catalog** — 🔭 Planned. Surface server prompts alongside the built-in `@agi` participant commands (`explain`, `fix`, `refactor`, `tests`, `docs`, `model` — `package.json` `chatParticipants`) without colliding with reserved names.
- **Argument capture** — 🔭 Planned. Render declared prompt arguments as typed inputs; validate before send (Zod-style, consistent with inbound-frame validation in `desktopBridge.ts`).
- **Current behavior** — ✅ app-server capability negotiation and runtime MCP status events are rendered by `chatParticipant.ts` and `ChatStateManager.ts`; tool execution remains runtime-owned.

## Tools

MCP tools are callable, side-effecting server functions — the highest-risk surface.

- **Developer-session execution** — ✅ the app-server advertises MCP capability, emits loading/ready/unavailable events, and owns tool invocation/approval. The extension renders those events but does not itself list or invoke tools.
- **Approval-gated execution** — 🔭 Planned. Local MCP tool calls must route through the existing agent-mode approval ladder (`agiWorkforce.agent.mode`: `ask`/`auto`/`plan`/`bypass`, `package.json`); destructive tools require explicit confirmation regardless of mode.
- **Allowlist + rate limit** — 🔭 Planned, reuse the bridge pattern: any bridge-mediated tool invocation must pass a command allowlist and per-tool rate limit, exactly as `ALLOWED_BRIDGE_COMMANDS` + `withinCommandRateLimit` guard `desktop:run-command` (`desktopBridge.ts`).
- **Trust containment** — 🔭 Planned. A Local MCP tool result must not auto-enter a BYOK/Cloud request body; escalation is the explicit fork with secret scan + payload preview.
- **Testable:** unknown tool names are rejected and logged (defense-in-depth), matching the extension's existing message-type allowlist behavior.

## Authentication

- **Transport auth (bridge)** — ✅ MCP tools reached via the bridge inherit the bearer/`X-AGI-Bridge-Token` handshake and `auth_ok` gate; the token file is refused if not `0600` (`desktopBridge.ts` `readBridgeToken`, `getBridgeAuthHeaders`). Migration target is a Unix domain socket / named pipe.
- **Per-server credentials / OAuth** — 🔭 Planned. Remote MCP servers requiring OAuth or API keys must store secrets in VS Code `SecretStorage` (never settings JSON), mirroring `getApiKey(context.secrets)` (`advancedFeatures.ts`). Endpoint/URL overrides stay in `restrictedConfigurations` so untrusted workspaces cannot redirect them (`package.json`).
- **No key leakage across trust modes** — 🔭 Planned. BYOK/remote MCP credentials are never sent to Managed Cloud or embedded in Local payloads.

## Repository map

- `apps/extension-vscode/package.json` — `agiWorkforce.mcp.enabled` config + participant/command surface.
- `apps/extension-vscode/src/platform/config.ts` — `mcpEnabled()` accessor + default.
- `apps/extension-vscode/src/core/advancedFeatures.ts` — MCP↔bridge validation warning.
- `apps/extension-vscode/src/extension.ts` — connects bridge on startup when MCP is enabled; config reactions.
- `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` — runtime MCP status rendering.
- `apps/extension-vscode/src/integrations/localRuntimeClient.ts` — app-server MCP capability/status protocol.
- `apps/extension-vscode/src/utils/api.ts` — `mcp_enabled` request metadata.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — transport, token auth, allowlists, rate limit (MCP's target carrier).
- `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` — `mcp` status chip.

## Competitor notes

Claude Code, ChatGPT/Codex, and the Codex IDE extension expose in-IDE MCP configuration and resource/prompt pickers. AGI currently delegates discovery and execution to the local app-server/CLI, preserving multi-provider and workspace trust while lacking a first-class extension-owned server-management UI.

## Acceptance / Definition of Done

Production-ready when a workspace user can discover, register, and use an MCP server with explicit trust labeling, approval-gated tools, and zero silent cross-boundary sends.

- [ ] **Build:** discovery/registration/resources/prompts/tools/auth land behind `agiWorkforce.mcp.enabled`; `pnpm --filter agi-workforce typecheck`, `test`, and `build` pass; new bridge frame types are added to the inbound/outbound allowlists with Zod validation.
- [ ] **Trust:** every MCP server, resource, and tool shows its trust mode + source label; Local→BYOK/Cloud is an explicit fork (context selection, secret scan, payload preview, consent); registrations never auto-sync to app chat.
- [ ] **Security:** tool calls pass an allowlist + rate limit and the agent-mode approval ladder; credentials live in `SecretStorage`; untrusted workspaces cannot override MCP endpoints; bridge token remains `0600`-gated.

## Anti-patterns

- Claiming an extension-owned MCP registry/resource/prompt UI is shipped; developer-session execution exists through the app-server, while that management UI remains planned.
- Routing a Local MCP tool result into a BYOK or Managed-Cloud request without the explicit, consented, redacted fork.
- Adding MCP on Web or Mobile BYOK paths (BYOK is Desktop/CLI/VS Code only; never Web/Mobile).
- Storing MCP OAuth tokens or API keys in settings JSON instead of `SecretStorage`; letting untrusted workspaces override MCP endpoint config.
- Auto-syncing MCP registrations or resource content into Web/Mobile/Desktop app chat.
- Hardcoding model IDs for MCP-driven flows — read from `packages/contracts/types/src/models.json`.
- Referencing removed tiers (Plus/Hobby/`pro_plus`), inventing INR prices, adding credit top-ups, or referencing Supabase; auth/DB/billing is Clerk + Neon + Stripe.
