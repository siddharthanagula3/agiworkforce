# AGI VS Code Extension — Volume 18 — Security

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`. Grounded in real repo paths: `apps/extension-vscode/package.json` (manifest, `capabilities.untrustedWorkspaces`), `apps/extension-vscode/src/utils/api.ts` (SecretStorage), `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` (device sign-in), `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` (bridge token + auth), `apps/extension-vscode/src/platform/config.ts` (trust-gated config), `apps/extension-vscode/src/providers/terminalProvider.ts`, `apps/extension-vscode/src/providers/agentMode/agentUI.ts`, `apps/extension-vscode/src/core/commandSetup.ts`.

## Overview & stance

Security for the AGI VS Code Extension is shaped by the three trust modes it exposes — **Local**, **BYOK** (Desktop/CLI/VS Code only), and **Managed Cloud** — each with an explicit selection and a visible provider label. This surface is workspace-scoped: there is **no automatic app-chat sync**, and any handoff to app chat must be explicit and redacted (see `apps/extension-vscode/AGENTS.md`). Secrets never leave device boundaries silently, Local sessions are never routed to BYOK or Cloud without an explicit fork, and tool execution is gated behind VS Code Workspace Trust. The extension holds real provider keys (unlike Chrome), so key custody, the shared localhost bridge token, and approval-gated write/execute paths are the core attack surface this volume governs.

## Secret Storage — VS Code SecretStorage

All persisted secrets live in `vscode.SecretStorage` (OS keychain–backed), never in `settings.json`, workspace state, or globalState. ✅ Built: `src/utils/api.ts` stores the BYOK provider key under `agiWorkforce.apiKey` (`getApiKey`/`setApiKey`/`clearApiKey`) and the AGI Cloud account token under `agiWorkforce.accountToken` (`getAccountToken`/`setAccountToken`). Requirements: (1) no secret is ever written to a config key or logged; (2) `clearApiKey`/sign-out must delete the corresponding SecretStorage entry; (3) settings that could redirect traffic (`apiEndpoint`, `gatewayUrl`, `telemetryEndpoint`) are workspace-trust restricted (see below) so an untrusted workspace cannot exfiltrate a stored secret to an attacker endpoint. 🔭 Planned: per-provider distinct keys for multi-provider BYOK sessions and a "reveal/rotate key" audit surface.

## OAuth

Managed Cloud sign-in uses an RFC-8628-style **device authorization flow**, not an embedded secret. ✅ Built: `src/features/account-auth/deviceAuth.ts` derives a stable `device_id` + fingerprint from `vscode.env.machineId` plus a per-install salt, opens the AGI web connect page for in-browser approval, and polls `POST /api/device/poll` until it returns an approved Clerk access token, which is stored via `setAccountToken` in SecretStorage. Requirements: no client secret ships in the marketplace bundle (public extensions cannot hold one); the token is bound to the device fingerprint; approval is user-driven in the browser; polling is time-bounded. Auth is Clerk-issued (never Supabase). 🔭 Planned: registering a first-class `vscode.AuthenticationProvider` so other extensions and the built-in accounts menu can surface AGI sessions; token refresh/expiry handling beyond the initial grant.

## API Keys

BYOK is a **first-class, opt-in** mode on this surface only. ✅ Built: the `agi-workforce.setApiKey` and `agi-workforce.clearApiKey` commands (`apps/extension-vscode/package.json`) write/remove the key through the SecretStorage helpers in `src/utils/api.ts`. Requirements: (1) keys are entered via masked input, never echoed; (2) a Local→BYOK transition is an explicit fork with context selection, secret scan, payload preview, visible provider label, and consent (canon) — the extension must never silently promote a Local session to a keyed provider; (3) the active provider must be labeled in the UI so the user always knows which trust mode is live; (4) BYOK keys are never synced (Neon delta-sync carries Managed-Cloud chats only — Local/BYOK rows never sync). 🟡 Partial: the provider-stream path (`agiWorkforce.useProviderStream`) enumerates providers but its manifest note states web auth "is not wired in the VS Code extension yet."

## Workspace Trust

The extension declares **limited** untrusted-workspace support. ✅ Built: `capabilities.untrustedWorkspaces` in `apps/extension-vscode/package.json` marks it `"supported": "limited"` and lists `restrictedConfigurations` that a workspace cannot override — `apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, `agent.autoApply`, `autoApplyFixes`, `telemetryEndpoint`, and `tier`. Enforced at runtime: `src/platform/config.ts` reads `currentTier` from global scope only (workspace values ignored to prevent tier spoofing); `src/providers/terminalProvider.ts` refuses command execution when `!vscode.workspace.isTrusted`; `src/core/commandSetup.ts` blocks the git-commit and test-run fallbacks in untrusted workspaces; `src/providers/agentMode/agentUI.ts` blocks auto-apply of AI edits and patches until the workspace is trusted (modal "Trust Workspace and Proceed"). Requirement: every new file-write, execute, or endpoint-redirect capability must add an `isTrusted` gate or a restricted-config entry before merge.

## Sandboxing

VS Code extensions run in the extension host with the user's privileges; there is no OS-level process jail. AGI's mitigations are **path containment + allowlisting**, not a true sandbox. ✅ Built: agent edits/patches are confined to workspace folders via `resolveContained` in `src/providers/agentMode/agentUI.ts`; the desktop bridge confines `desktop:open-file` to workspace folders and rejects adjacent-directory prefix bypass (`src/features/desktop-bridge/desktopBridge.ts`). 🟡 Partial: terminal commands run in the user's real shell (trust-gated, but unsandboxed). 🔭 Planned: routing agent tool execution through a sandboxed runtime (E2B-style env-gating, per the product vision) so untrusted-model tool calls cannot touch the host filesystem or network directly.

## Permission System

Actions are approval-gated by agent mode and command allowlists. ✅ Built: `agiWorkforce.agent.mode` (`ask` | `auto` | `plan` | `bypass`) governs edit confirmation; `ask` confirms every edit, `plan` proposes before editing, `bypass` skips prompts (a documented footgun — it must never be the default and remains subordinate to the Workspace-Trust block on auto-apply). The desktop bridge enforces defense-in-depth: an inbound/outbound **message-type allowlist** (`ALLOWED_INBOUND_TYPES`/`ALLOWED_OUTBOUND_TYPES`), a **command allowlist** (`ALLOWED_BRIDGE_COMMANDS`), never forwarding attacker-controlled args, a 50 ms debounce, and a 30-commands/min rate limit (`src/features/desktop-bridge/desktopBridge.ts`). Requirement: any new bridge command or tool must be added to the allowlist explicitly and rate-limited.

### Bridge token hygiene

✅ Built: `readBridgeToken` in `src/features/desktop-bridge/desktopBridge.ts` reads `~/.agiworkforce/bridge-token`, refuses to load it if POSIX mode is group/world-readable (`mode & 0o044`), and opens-then-fstats the same file descriptor to close a TOCTOU race. The bridge requires an `auth` → `auth_ok` handshake (HMAC/bearer headers) before any other frame is accepted. 🟡 Partial gap: the transport is still `ws://127.0.0.1:8787/ws`, reachable by any process running as the same user; the 0600 file protects only against _other_ users. Migration target (stated in-file) is a Unix domain socket / named pipe behind `agiWorkforce.desktopBridge.transport`, shipped once the desktop side lands — 🔭 Planned. Remote control of an editor session from phone/web is also 🔭 Planned (parity: Claude Code `/remote-control`).

## Repository map

- `apps/extension-vscode/src/utils/api.ts` — SecretStorage for API key + account token.
- `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` — device sign-in / Clerk token.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — bridge token hygiene, auth handshake, allowlists, rate limiting.
- `apps/extension-vscode/src/platform/config.ts` — trust-gated config resolution.
- `apps/extension-vscode/src/providers/terminalProvider.ts`, `src/core/commandSetup.ts`, `src/providers/agentMode/agentUI.ts` — Workspace-Trust enforcement points.
- `apps/extension-vscode/package.json` — `capabilities.untrustedWorkspaces`, `restrictedConfigurations`, commands, agent-mode settings.

## Competitor notes

Claude Code and Codex IDE extensions gate agent edits behind approvals, apply diffs locally, and preview cloud handoffs; both lean on a single first-party account. AGI's deliberate divergence: **multi-provider BYOK** with per-provider keys in SecretStorage (Desktop/CLI/VS Code only), **three explicit trust modes** with visible labels rather than one hosted identity, **local-first** custody (Local/BYOK rows never sync; only Managed-Cloud chats delta-sync via Neon), and a **shared localhost bridge** with strict token hygiene and command allowlists. Remote control is a secure window over a locally-running session, not a cloud offload.

## Acceptance / Definition of Done

Production-ready when: secrets exist only in SecretStorage; sign-out fully clears them; every write/execute/endpoint capability is Workspace-Trust gated or restricted-config'd; the bridge enforces token permissions, the auth handshake, and its allowlists + rate limits; and no Local session reaches BYOK/Cloud without the explicit fork.

- [ ] Build: `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` green.
- [ ] Trust: no secret in `settings.json`/globalState; BYOK key entry masked; provider label visible per session; Local/BYOK never synced.
- [ ] Security: `bridge-token` 0600 enforced; `auth_ok` required before any frame; command allowlist + 30/min rate limit verified; untrusted-workspace edit/patch/terminal/git/test paths blocked.

## Anti-patterns

- Storing keys or tokens in `settings.json`, workspace state, logs, or telemetry.
- Silently routing a Local chat/file/session to BYOK or Managed Cloud, or auto-syncing IDE context into app chat history.
- Accepting bridge frames before `auth_ok`, widening `ALLOWED_BRIDGE_COMMANDS` without rate limits, or forwarding attacker-controlled command args.
- Loading a group/world-readable bridge token; defaulting `agent.mode` to `bypass`; bypassing the untrusted-workspace auto-apply block.
- Hardcoding or inventing model IDs (use `packages/types/src/models.json`), inventing routes/env vars/INR prices, referencing removed tiers (Plus/Hobby/pro_plus) or credit top-ups, or referencing Supabase.
