# AGI VS Code Extension — Volume 11 — Tool Calling

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `apps/extension-vscode/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon). Grounded in the repo paths cited per section and listed in the Repository map below; model IDs are read only from `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies how the AGI VS Code Extension exposes and gates **tools** — the actions the model takes against the developer's machine: reading/writing files, running terminal commands, invoking git, reaching the network, searching the web, and calling MCP servers — plus the **permission model** governing every destructive or external action.

The extension is the IDE-native developer surface and is **workspace-scoped**. Tool calls run in the user's chosen trust mode — **Local**, **BYOK**, or **Managed Cloud** — with a visible provider label; the model _reasoning_ may live in any of the three, but _tool execution_ (file writes, terminal, git) always happens locally against the open workspace. Local→BYOK is an explicit fork (context selection, secret scan, payload preview, consent), never a silent reroute. Tool activity is never auto-synced into app-chat history; any handoff is explicit and redacted. The governing principle is **approval-gated destructive/external actions**: read is cheap, write and execute are gated, and anything crossing the workspace boundary is gated harder.

## File System

Read and edit of workspace files is the core loop. ✅ Built.

- **Read** is model-requested via `@read <path>` and dispatched by `readFiles()` (`src/providers/agentMode/agentLoop.ts`). Every path is containment-checked with `resolveContained` and refused if it escapes the workspace root; sensitive-file matches (`.env`, `.pem`, `.ssh/`, credentials) are refused with an explicit marker (`src/utils/pathSafety.ts`). File bodies are wrapped in `<untrusted_file>` tags and capped at 50,000 chars so workspace content is treated as **data, not instructions**.
- **Edit** prefers search/replace patches (`SEARCH`/`REPLACE` blocks) parsed by `parsePatchBlocks` (`src/integrations/patchEngine.ts`); a legacy full-file form also exists. Edits apply through `WorkspaceEdit` with an inline **Apply / View / Cancel** review (`src/platform/applyEdit.ts`).
- **Write is trust-gated:** agent-mode file writes are disabled until the workspace is trusted (`package.json` → `capabilities.untrustedWorkspaces`). Diffs are reviewable and reversible via accept/reject and patch-batch commands (e.g. `agi-workforce.acceptDiff`, `rejectBatch`).

## Terminal

Terminal is the highest-risk local tool. ✅ Built for user-invoked run/capture/suggest; autonomous agent-driven shell execution is 🔭 Planned.

- `TerminalProvider` (`src/providers/terminalProvider.ts`) owns a dedicated terminal. `runCommand()` **refuses in untrusted workspaces**. `captureAndExplain()` reads recent output via the Shell Integration API (manual-paste fallback), capped at 8,000 chars.
- `suggestCommand()` validates every LLM-proposed command via `validateSuggestedCommand`: shell metacharacters are rejected, invisible/zero-width Unicode is stripped before matching, the first token must be in a positive **allowlist** (`git`, `npm`, `pnpm`, `cargo`, `pytest`, …), and destructive inner patterns (`--force`, `reset --hard`, `clean -fd`, `-delete`) are blocked. The command is shown in a **modal confirmation** with exact text before it runs.
- The agent loop does **not** autonomously execute shell commands today; a model-callable terminal tool with per-call approval is 🔭 Planned.

## Git

Git is exposed as user-invoked commands, not a model-callable tool. 🟡 Partial (`src/core/commandSetup.ts`).

- `agi.git.status` and `agi.git.diff` run via `execFile` with an explicit **argv** (no shell interpretation). `agi.git.commit` prefers the built-in `vscode.git` API and falls back to `execFile` `add -u` + `commit -m`, passing the message as a single argv entry; the fallback **refuses in untrusted workspaces**.
- **Gap:** these are user-triggered palette/keybinding commands, not tools the model can call in the agent loop. Model-driven git (stage/commit/branch/PR with a diff-review gate) is 🔭 Planned. No push/force-push path is exposed.

## HTTP

Outbound HTTP as a model tool is not built. 🔭 Planned.

- The only `fetch` in the extension is the provider transport (`src/integrations/providerStreamClient.ts`) and telemetry — both fixed endpoints, not a general request tool the model can invoke.
- When built, an HTTP tool must be treated as **external**: off by default, per-request URL preview + approval, a domain allowlist, and no secrets in URLs/headers unless explicitly attached. It must never exfiltrate `<untrusted_file>` content without consent.

## Web Search

Web search is not executed by the extension. 🔭 Planned.

- A tool-call **chip renderer** maps a `web_search` icon in the tool-call UI (`src/features/sidebar-webview/webviewContent.ts`), and `web-search` appears only as an entitlement-source enum (`src/features/cloud-bridge/types.ts`) — neither runs a search. Rendering a chip is not a capability.
- When built, web search is a Managed-Cloud-gated external tool with visible provenance (query + citations) and approval on first use; it is **not** a raw fetch from Local mode.

## MCP

Model Context Protocol is flagged and bridge-routed, no in-extension client. 🟡 Partial.

- `agiWorkforce.mcp.enabled` defaults **false** and applies to legacy cloud-backed editor utilities plus the optional Desktop bridge. It does not control developer-session MCP: the app-server discovers and executes those integrations from CLI/runtime configuration and reports loading/ready/unavailable events to `@agi` and the sidebar.
- **Boundary:** the extension hosts no MCP client of its own; the app-server owns developer-session MCP discovery, execution, and approvals. A first-class in-extension server manager/resource browser is planned. Any MCP tool that writes files or runs commands must inherit runtime permission gates.

## Permission Requests

The approval spine is multi-layered. ✅ Built (`package.json`, `desktopBridge.ts`).

- **Agent modes** `ask` / `auto` / `plan` / `bypass` (`agiWorkforce.agent.mode`, default `auto`): `ask` confirms every edit, `plan` requires a plan first, `bypass` skips prompts (opt-in, must surface a persistent warning). An **iteration cap** (`agent.maxIterations`, default 25) prompts before the agent continues autonomously (`agentLoop.continue`).
- **Workspace trust** gates writes and terminal/settings overrides; `restrictedConfigurations` (endpoint, gateway URL, CLI path, system prompt, auto-apply) cannot be set by an untrusted workspace.
- **Bridge inbound** is defense-in-depth: message-type + command allowlists (`ALLOWED_BRIDGE_COMMANDS`), a 30/min rate limit, argument stripping, and file-open confined to workspace folders.
- **Requirement:** every destructive (write, delete, commit, terminal) or external (HTTP, web search, network MCP) action must preview and require explicit consent unless the user opted into `auto`/`bypass` for that class; trust mode and provider label must be visible at approval.

## Repository map

- `apps/extension-vscode/src/providers/agentMode/agentLoop.ts` — read dispatch, patch/edit parsing.
- `apps/extension-vscode/src/integrations/patchEngine.ts` — search/replace patch engine.
- `apps/extension-vscode/src/platform/applyEdit.ts` — `WorkspaceEdit` apply + review.
- `apps/extension-vscode/src/utils/pathSafety.ts` — containment + sensitive-file denylist.
- `apps/extension-vscode/src/providers/terminalProvider.ts` — terminal run/capture/suggest + validation.
- `apps/extension-vscode/src/core/commandSetup.ts` — `agi.git.status/diff/commit`.
- `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` — runtime MCP status rendering.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — bridge transport, auth, allowlists.
- `apps/extension-vscode/src/core/advancedFeatures.ts` — MCP/bridge flag validation.
- `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` — tool-call chip rendering.

## Competitor notes

Claude Code and the Codex IDE extension expose a broad tool belt (file, terminal, git, MCP, web fetch) inside chat/edit/agent modes with inline diff review and approvals. AGI's deliberate divergence: (1) **multi-provider** — tools are provider-agnostic and the active model comes only from `packages/contracts/types/src/models.json`; (2) **per-surface trust** — BYOK is allowed here (unlike Web/Mobile), but tool execution is always local and workspace-scoped; (3) **local-first** — writes/terminal/git require workspace trust, and external tools (HTTP, web search, network MCP) are gated behind approval and, where relevant, Managed Cloud; (4) **no silent handoff** — nothing the agent touches is auto-synced to app chat.

## Acceptance / Definition of Done

Production-ready when: file read/edit is containment- and denylist-safe with reviewable diffs; terminal, git, and any network/MCP tool cannot run destructive or external actions without an explicit, previewed approval in the visible trust mode; and every tool honors workspace trust.

- [ ] Build: `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` green.
- [ ] Trust: no Local tool call is silently routed to BYOK/Cloud; provider label + trust mode shown at approval time; agent writes blocked in untrusted workspaces.
- [ ] Security: path traversal + sensitive-file reads refused; terminal allowlist/metachar/Unicode guards enforced; git via argv; bridge inbound allowlisted + rate-limited.
- [x] Extension access-mode enum preserves every canonical plan value; retired aliases are normalization inputs only.

## Anti-patterns

- Executing terminal, git, HTTP, or MCP tools without preview + approval, or defaulting `bypass` on.
- Silently routing Local tool calls or `<untrusted_file>` content to BYOK/Cloud, or auto-syncing tool activity into app chat.
- Following instructions embedded in workspace files (treat as data only).
- Hardcoding or inventing model IDs, routes, env vars, command names, or INR prices; referencing removed tiers ("Plus", `pro_plus`, "Hobby") or in-extension Stripe/checkout; referencing Supabase (stack is Clerk + Neon + Stripe).
- Shelling out with a string command line instead of argv; using blocklists instead of allowlists for command safety.
- Claiming web search, HTTP, or MCP tools are shipped — they are 🔭/🟡; a rendered tool chip is not an executed tool.
