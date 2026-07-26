# AGI VS Code Extension — Volume 18 — Security

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`. Grounded in real repo paths: `apps/extension-vscode/package.json` (manifest, `capabilities.untrustedWorkspaces`), `apps/extension-vscode/src/utils/api.ts` (SecretStorage), `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` (device sign-in), `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` (bridge token + auth), `apps/extension-vscode/src/platform/config.ts` (trust-gated config), `apps/extension-vscode/src/providers/terminalProvider.ts`, `apps/extension-vscode/src/providers/agentMode/agentUI.ts`, `apps/extension-vscode/src/core/commandSetup.ts`.

## Overview & stance

Security for the AGI VS Code Extension is shaped by three trust modes — **Local**, **BYOK**, and **Managed Cloud** — with explicit selection and visible host/provider labels. The surface is workspace-scoped with no automatic app-chat sync. Developer-session provider credentials are owned by the local app-server/CLI, while the extension stores only its legacy AGI gateway credential and Managed account token. Key custody, workspace-path containment, the optional localhost bridge token, and approval-gated write/execute paths are the core attack surface.

## Secret Storage — VS Code SecretStorage

All extension-persisted secrets live in `vscode.SecretStorage`, never settings, workspace state, or globalState. `src/utils/api.ts` stores the legacy AGI gateway key under `agiWorkforce.apiKey` and the Cloud account token under `agiWorkforce.accountToken`. Provider keys used by developer sessions remain in the CLI/runtime's own credential store. Clearing/signing out deletes the corresponding extension secret, and endpoint/gateway/telemetry redirect settings are workspace-trust restricted.

## OAuth

Managed Cloud sign-in uses an RFC-8628-style **device authorization flow**, not an embedded secret. ✅ Built: `src/features/account-auth/deviceAuth.ts` derives a stable `device_id` + fingerprint from `vscode.env.machineId` plus a per-install salt, opens the AGI web connect page for in-browser approval, and polls `POST /api/device/poll` until it returns an approved Clerk access token, which is stored via `setAccountToken` in SecretStorage. Requirements: no client secret ships in the marketplace bundle (public extensions cannot hold one); the token is bound to the device fingerprint; approval is user-driven in the browser; polling is time-bounded. Auth is Clerk-issued (never Supabase). 🔭 Planned: registering a first-class `vscode.AuthenticationProvider` so other extensions and the built-in accounts menu can surface AGI sessions; token refresh/expiry handling beyond the initial grant.

## API Keys

BYOK is a **first-class, opt-in** developer-session mode. Provider credentials are configured through `agi login <provider>` and consumed by the app-server; the palette's Set/Clear API Key commands manage only the legacy AGI gateway credential. Inputs are masked and never echoed. The sidebar shows Local host plus the resolved provider or Auto routing. A provider-boundary change starts a new thread, does not forward the earlier transcript, and emits a visible notice. Any future feature that forwards existing Local context must add the complete context-selection, secret-scan, payload-preview, and consent ceremony. `agiWorkforce.useProviderStream` is an account-authenticated Managed transport for cloud-backed utilities, not BYOK.

## Workspace Trust

The extension declares **limited** untrusted-workspace support. ✅ Built: `restrictedConfigurations` contains `apiEndpoint`, `gatewayUrl`, `cliPath`, `autoApplyFixes`, `telemetryEndpoint`, and `tier`; a manifest regression test prevents nonexistent settings from being listed. Enforced at runtime: tier values are read from global scope only, terminal execution and git/test fallbacks are refused in untrusted workspaces, and agent edits/patches require trust. Every new file-write, execute, or endpoint-redirect capability must add an `isTrusted` gate or a restricted-config entry before merge.

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

Claude Code and Codex IDE extensions gate agent edits behind approvals, apply diffs locally, and preview cloud handoffs; both lean on a single first-party account. AGI's deliberate divergence is multi-provider BYOK owned by the local runtime, three explicit trust modes with visible labels, local-first custody, and an optional localhost bridge with strict token hygiene and command allowlists. Remote control remains planned as a secure window over a locally running session, not cloud offload.

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
- Hardcoding or inventing model IDs (use `packages/contracts/types/src/models.json`), inventing routes/env vars/INR prices, referencing removed tiers (Plus/Hobby/pro_plus) or credit top-ups, or referencing Supabase.
