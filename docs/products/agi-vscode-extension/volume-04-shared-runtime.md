# AGI VS Code Extension — Volume 04 — Shared Runtime

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/extension.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/providers/agentMode/{agentLoop,agentUI}.ts`, `apps/extension-vscode/src/providers/agentModeProvider.ts`, `apps/extension-vscode/src/integrations/{providerStreamClient,providerSwitchGuard,tierResolver,patchEngine}.ts`, `apps/extension-vscode/src/data/{contextBuilder,contextBudget,workspaceIndexer,projectInstructions,conversationStore,checkpointManager,sendQueue,tokenCounter,usageMeter}.ts`, `apps/extension-vscode/src/memory/memoryStore.ts`, `packages/runtime/src/index.ts`, and `packages/types/src/models.json`.

## Overview & stance

This volume specifies how the VS Code extension **consumes** the shared AGI Runtime rather than reimplementing the agent loop, storage, or dispatch inside the extension. The extension is the IDE-native, **workspace-scoped** developer surface. Its trust exposure is **Local + BYOK + Managed Cloud**, each selected explicitly with a visible provider label. Local sessions never route silently to BYOK or Cloud; a Local→BYOK move is an explicit fork (context selection, secret scan, payload preview, consent, visible label). Conversation data stays device/workspace-local — there is **no automatic sync into Web/Mobile/Desktop app chat**; any handoff is explicit and redacted over the desktop bridge. The shared localhost bridge (`desktopBridge.ts`, `ws://127.0.0.1:8787/ws`, token at `~/.agiworkforce/bridge-token`, `0600`) is the same transport the Chrome extension uses ✅.

## Session Engine

A "session" is a chat/agent thread bound to the active workspace. Requirements: (1) every session records its trust mode and provider label; (2) the message pipeline is queued and backpressured; (3) provider streaming flows through one client, not per-feature ad-hoc `fetch`.

- **Message queue / backpressure** — ✅ Consumed from shared runtime: `createMessageQueue`, `MessageQueue`, `QueueFullError`, `QueuedCommand` from `@agiworkforce/runtime` (`packages/runtime/src/index.ts`), used in `apps/extension-vscode/src/data/sendQueue.ts`.
- **Agent orchestration** — 🟡 The extension runs a local `AgentLoop` (`apps/extension-vscode/src/providers/agentMode/agentLoop.ts`) wired by `agentModeProvider.ts`. Gap: this is a surface-local loop; the target is to drive it from the shared task runtime (`crates/agiworkforce-task-runtime`, `crates/agiworkforce-command-registry`) so CLI and VS Code share one engine.
- **Provider streaming** — 🟡 `apps/extension-vscode/src/integrations/providerStreamClient.ts` mirrors the web SSE client, but `agiWorkforce.useProviderStream` defaults `false` and the setting notes web auth is **not yet wired** (`apps/extension-vscode/package.json`).
- **Shared CLI sessions** — 🔭 A common developer-session schema in `packages/types` is the target; not wired.

## Context Engine

Context assembly is workspace-scoped and budget-bounded. Requirements: deterministic file inclusion, a token budget the user can inspect, and no cross-surface context leakage.

- **Context builder + budget** — ✅ `apps/extension-vscode/src/data/contextBuilder.ts` and `contextBudget.ts`; token accounting in `tokenCounter.ts`.
- **Workspace index** — ✅ `apps/extension-vscode/src/data/workspaceIndexer.ts`.
- **Project instructions** — ✅ `apps/extension-vscode/src/data/projectInstructions.ts`.
- **Pinned Context Files + @ references** — ✅ Context Files tree and `@agi` file mentions via `apps/extension-vscode/src/features/trees` and commands `agi-workforce.addToContext` / `mentionFileInChat` (`apps/extension-vscode/package.json`).
- **Memory** — 🟡 `apps/extension-vscode/src/memory/memoryStore.ts` exists; cross-surface memory sync (Neon) is **not** wired for VS Code and stays out of scope (🔭).

## Tool Engine

Tools mutate the workspace or shell and must be discrete, previewable, and reversible.

- **File edits / patch application** — ✅ `apps/extension-vscode/src/integrations/patchEngine.ts` plus edit parsing (`parseFileEdits`, `parseFileReads`) exported from `agentLoop.ts`; diff decorations in `providers/diffDecorationProvider.ts`.
- **Checkpoints** — ✅ `apps/extension-vscode/src/data/checkpointManager.ts` (commands `createCheckpoint` / `restoreCheckpoint` / `listCheckpoints`).
- **Terminal capture / run** — ✅ `apps/extension-vscode/src/providers/terminalProvider.ts` (commands `runCommand`, `explainTerminal`, `suggestCommand`).
- **Diagnostics / code actions** — ✅ `providers/diagnosticsProvider.ts`, `providers/codeActionProvider.ts`.
- **MCP tools** — 🟡 `agiWorkforce.mcp.enabled` exists but defaults `false` (`apps/extension-vscode/package.json`); full MCP dispatch is 🔭.

## Permission Engine

Every mutating action is gated by workspace trust and an explicit agent mode.

- **Agent modes** — ✅ `agiWorkforce.agent.mode` enum `ask` | `auto` | `plan` | `bypass` (`apps/extension-vscode/package.json`); approvals + diff previews in `apps/extension-vscode/src/providers/agentMode/agentUI.ts`.
- **Untrusted workspaces** — ✅ `capabilities.untrustedWorkspaces` limits endpoint/gateway/CLI-path/system-prompt/auto-apply overrides and disables agent file writes until trusted (`apps/extension-vscode/package.json`).
- **Bridge command allowlist + rate limit** — ✅ `ALLOWED_BRIDGE_COMMANDS`, 30 cmd/min limit, and workspace-folder file-open guard in `desktopBridge.ts`.
- **Local→BYOK fork** — 🔭 The explicit fork ceremony (secret scan, payload preview, consent, visible label) is a spec requirement not yet implemented as a single gated flow.

## Configuration

Settings live in the `agiWorkforce.*` namespace.

- **Settings surface** — ✅ `contributes.configuration.properties` (`apps/extension-vscode/package.json`): endpoint, gateway URL, model, streaming, context lines, agent mode/effort/thinking/maxIterations, inline completions, desktop bridge port/enabled, telemetry (default off).
- **Tier resolution** — 🟡 `apps/extension-vscode/src/integrations/tierResolver.ts` and the `agiWorkforce.tier` enum still encode removed tiers (`hobby`, `pro_plus`). Canon tiers are **Free / Basic $8 (₹399) / Pro $20 / Max $100 & $200 / Enterprise**; Local + BYOK are free access modes. Reconciling `packages/types/src/billing-catalog.ts` and this enum is a separate tracked task.
- **Settings sync** — 🔭 Allowlist-gated cross-device settings sync lands last; not wired here.

## Conversation Storage

- **Local store** — ✅ `apps/extension-vscode/src/data/conversationStore.ts` persists to VS Code `globalState`, capped at 50 conversations (oldest pruned). Device/workspace-local, **never** Neon delta-synced.
- **No automatic app-chat sync** — ✅ (by design) The extension does not write into `apps/web/app/api/{chat,memory,projects}/sync`. Handoff to Desktop is explicit and redacted via `sendToDesktop` / `syncContextToDesktop` (`desktopBridge.ts`), not automatic.
- **Usage metering** — ✅ `apps/extension-vscode/src/data/usageMeter.ts` (local counters; commands `showTokenBreakdown`, `resetTokenCounter`).

## Runtime Lifecycle

- **Activation / deactivation** — ✅ `apps/extension-vscode/src/extension.ts`; activation events `onStartupFinished`, `onChatParticipant:agiworkforce.agi`, `onView:agi-workforce.sidebar` (`apps/extension-vscode/package.json`).
- **Bridge lifecycle** — ✅ `activateDesktopBridge` with connect / reconnect / health loop / exponential backoff and a status-bar indicator (`desktopBridge.ts`); all disposables tracked on `context.subscriptions`.
- **Subsystem health** — ✅ `apps/extension-vscode/src/core/subsystemHealth.ts` (command `agi-workforce.showSubsystemHealth`).
- **Provider switch guard** — ✅ `apps/extension-vscode/src/integrations/providerSwitchGuard.ts` prevents unlabeled provider changes mid-thread.

## Repository map

- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge transport, auth, allowlists.
- `apps/extension-vscode/src/providers/agentMode/{agentLoop,agentUI}.ts`, `providers/agentModeProvider.ts` — session/tool/approval orchestration.
- `apps/extension-vscode/src/data/{contextBuilder,contextBudget,workspaceIndexer,projectInstructions,conversationStore,checkpointManager,sendQueue,tokenCounter,usageMeter}.ts` — context + storage.
- `apps/extension-vscode/src/integrations/{providerStreamClient,providerSwitchGuard,tierResolver,patchEngine}.ts` — provider + tier + patch.
- `apps/extension-vscode/src/memory/memoryStore.ts`, `apps/extension-vscode/src/protocol/bridgeMessages.ts`.
- `packages/runtime/src/index.ts` (message queue, state store); shared crates `crates/agiworkforce-task-runtime`, `crates/agiworkforce-command-registry`.

## Competitor notes

Claude Code and Codex IDE extensions each drive a single-vendor agent loop with editor context, `@` file references, diagnostics, inline diff review, and approvals; cloud handoff previews and local application of remote diffs are their remote-session model. AGI's deliberate divergence: **multi-provider** (auto-inferred from the model-id prefix on the provider-stream path, `apps/extension-vscode/package.json`), **BYOK where allowed** (Desktop/CLI/VS Code only), **per-surface trust** with visible provider labels, and **local-first** conversation storage that never auto-syncs to app chat. Remote control of an editor session from phone/web (Claude Code `/remote-control` parity: banner, session URL, open-in-browser) is 🔭. Model IDs come only from `packages/types/src/models.json`.

## Acceptance / Definition of Done

The domain is production-ready when the extension consumes shared runtime primitives (queue, state, dispatch) with no forked agent loop, trust labels are visible on every session, and no conversation data leaves the device without an explicit redacted handoff.

- [ ] **Build** — `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; `out/extension.js` compiles.
- [ ] **Trust** — Local sessions never route to BYOK/Cloud without an explicit fork; provider label visible on every send; `conversationStore` remains local-only (no Neon writes).
- [ ] **Security** — Bridge stays token-authed with allowlist + rate limit; untrusted-workspace restricted configs enforced; no attacker-controlled args forwarded from bridge frames.
- [ ] **Pricing** — Tier resolver + `agiWorkforce.tier` enum reconciled to Free / Basic / Pro / Max ($100 & $200) / Enterprise (tracked task).

## Anti-patterns

- Reimplementing the agent loop, queue, or dispatch inside the extension instead of consuming `@agiworkforce/runtime` / shared crates.
- Auto-syncing VS Code conversations, context, or memory into Web/Mobile/Desktop app chat (handoff must be explicit + redacted).
- Silently promoting a Local session to BYOK or Cloud, or hiding the active provider label.
- Hardcoding or inventing model IDs instead of reading `packages/types/src/models.json`.
- Reintroducing removed tiers (`Plus`, `pro_plus`, `Hobby`) or credit top-ups in tier logic or copy.
- Referencing Supabase, or renaming `proxy.ts` back to `middleware.ts` in any web-facing config the extension calls.
- Weakening the bridge token permission check, allowlist, or rate limit; forwarding bridge-supplied command arguments.
