# AGI VS Code Extension — Volume 12 — MCP

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, `docs/surfaces/vscode-extension.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/platform/config.ts`, `apps/extension-vscode/src/core/advancedFeatures.ts`, `apps/extension-vscode/src/extension.ts`, `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`, `apps/extension-vscode/src/utils/api.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`.

## Overview & stance

This volume specifies how the VS Code extension participates in the **Model Context Protocol (MCP)** — how it discovers, registers, and uses MCP servers, and how MCP resources, prompts, tools, and auth behave under AGI's trust model. The extension is the IDE-native, **workspace-scoped** developer surface, exposed to **Local + BYOK + Managed Cloud** with explicit selection and visible provider labels.

The load-bearing truth today: MCP in the extension is a **signal, not a client**. `agiWorkforce.mcp.enabled` (default `false`) exists ✅ (`apps/extension-vscode/package.json`, `apps/extension-vscode/src/platform/config.ts`). When on, it (1) requires the desktop bridge and warns otherwise ✅ (`apps/extension-vscode/src/core/advancedFeatures.ts`), (2) injects a system-prompt line into the `@agi` participant ✅ (`apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`), and (3) forwards `mcp_enabled` in chat request metadata to the backend ✅ (`apps/extension-vscode/src/utils/api.ts`). There is **no in-extension MCP client** — no server discovery, registry UI, resource/prompt enumeration, or MCP OAuth. Actual MCP execution is delegated to the desktop bridge / backend. Accordingly most requirements below are 🔭 Planned.

The binding trust rule: MCP servers reached over the localhost desktop bridge (`ws://127.0.0.1:8787/ws`, token `~/.agiworkforce/bridge-token`, `0600` ✅) are **Local** tools. Their output must never be silently folded into a BYOK or Managed-Cloud payload — crossing that boundary is an explicit, consented, redacted fork. MCP registrations are workspace/task-scoped and must not auto-sync to app chat.

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
- **Bridge dependency** — 🟡 Local MCP registration presupposes the bridge; the extension already blocks/ warns when `mcp.enabled && !desktopBridge.enabled` (`advancedFeatures.ts`) and connects the bridge on startup when MCP is on (`apps/extension-vscode/src/extension.ts`).

## Resources

MCP resources are read-only context objects (files, docs, records) a server exposes.

- **Enumerate + attach** — 🔭 Planned. List a server's resources and let the user attach them to the Context Files tree (`agi-workforce.contextPanel`) so they flow through the existing context budget, not a side channel.
- **Provenance labels** — 🔭 Planned. Every attached resource shows its source server and trust mode; a Local-server resource must be visibly marked before any BYOK/Cloud send, and included only after the redacted-fork consent.
- **No silent fetch** — 🔭 Planned. Resource reads occur only on explicit attach/refresh; no background polling that could exfiltrate workspace data.

## Prompts

MCP prompts are server-published prompt templates / slash-style entries.

- **Prompt catalog** — 🔭 Planned. Surface server prompts alongside the built-in `@agi` participant commands (`explain`, `fix`, `refactor`, `tests`, `docs`, `model` — `package.json` `chatParticipants`) without colliding with reserved names.
- **Argument capture** — 🔭 Planned. Render declared prompt arguments as typed inputs; validate before send (Zod-style, consistent with inbound-frame validation in `desktopBridge.ts`).
- **Current behavior** — 🟡 The only MCP-aware prompt wiring today is a static system-prompt line ("Use MCP tools when the backend exposes them; if unavailable, state that clearly") injected when the flag is on (`chatParticipant.ts`).

## Tools

MCP tools are callable, side-effecting server functions — the highest-risk surface.

- **Flag + backend hint** — 🟡 Today the extension only tells the model MCP may be available and passes `mcp_enabled` metadata to the backend (`chatParticipant.ts`, `api.ts`); it does not itself list or invoke MCP tools.
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
- `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` — MCP system-prompt injection.
- `apps/extension-vscode/src/utils/api.ts` — `mcp_enabled` request metadata.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — transport, token auth, allowlists, rate limit (MCP's target carrier).
- `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` — `mcp` status chip.

## Competitor notes

Claude Code, ChatGPT/Codex, and the Codex IDE extension ship first-class MCP clients: in-IDE server config, resource/prompt pickers, and approval-gated tool calls. AGI's deliberate divergence: (1) **per-surface trust** — bridge-hosted MCP is Local by default and never silently promoted to BYOK/Cloud; (2) **multi-provider + BYOK where allowed** — MCP results feed the user's explicitly selected provider (BYOK on Desktop/CLI/VS Code only), never a forced vendor; (3) **local-first** — discovery and execution ride the localhost bridge with a `0600` token, not an always-on cloud connector. AGI lags on breadth today (flag-only) to land trust plumbing before the client.

## Acceptance / Definition of Done

Production-ready when a workspace user can discover, register, and use an MCP server with explicit trust labeling, approval-gated tools, and zero silent cross-boundary sends.

- [ ] **Build:** discovery/registration/resources/prompts/tools/auth land behind `agiWorkforce.mcp.enabled`; `pnpm --filter agi-workforce typecheck`, `test`, and `build` pass; new bridge frame types are added to the inbound/outbound allowlists with Zod validation.
- [ ] **Trust:** every MCP server, resource, and tool shows its trust mode + source label; Local→BYOK/Cloud is an explicit fork (context selection, secret scan, payload preview, consent); registrations never auto-sync to app chat.
- [ ] **Security:** tool calls pass an allowlist + rate limit and the agent-mode approval ladder; credentials live in `SecretStorage`; untrusted workspaces cannot override MCP endpoints; bridge token remains `0600`-gated.

## Anti-patterns

- Claiming MCP resources/prompts/tools are shipped — today only the flag, prompt line, and metadata exist; label the rest 🔭.
- Routing a Local MCP tool result into a BYOK or Managed-Cloud request without the explicit, consented, redacted fork.
- Adding MCP on Web or Mobile BYOK paths (BYOK is Desktop/CLI/VS Code only; never Web/Mobile).
- Storing MCP OAuth tokens or API keys in settings JSON instead of `SecretStorage`; letting untrusted workspaces override MCP endpoint config.
- Auto-syncing MCP registrations or resource content into Web/Mobile/Desktop app chat.
- Hardcoding model IDs for MCP-driven flows — read from `packages/contracts/types/src/models.json`.
- Referencing removed tiers (Plus/Hobby/`pro_plus`), inventing INR prices, adding credit top-ups, or referencing Supabase; auth/DB/billing is Clerk + Neon + Stripe.
