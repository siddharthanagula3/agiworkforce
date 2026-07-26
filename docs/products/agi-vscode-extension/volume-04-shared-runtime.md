# AGI VS Code Extension — Volume 04 — Shared Runtime

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: Grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/extension.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/providers/agentMode/{agentLoop,agentUI}.ts`, `apps/extension-vscode/src/providers/agentModeProvider.ts`, `apps/extension-vscode/src/integrations/{providerStreamClient,providerSwitchGuard,tierResolver,patchEngine}.ts`, `apps/extension-vscode/src/data/{contextBuilder,contextBudget,workspaceIndexer,projectInstructions,conversationStore,checkpointManager,sendQueue,tokenCounter,usageMeter}.ts`, `apps/extension-vscode/src/memory/memoryStore.ts`, `packages/client/client-runtime/src/index.ts`, and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies how VS Code consumes the shared `agi app-server` rather than reimplementing developer-session inference. The extension is workspace-scoped and exposes Local + BYOK + Managed Cloud with visible host/provider labels. Conversation data does not enter consumer app-chat sync; optional Desktop handoff is explicit and redacted.

## Session Engine

A "session" is a chat/agent thread bound to the active workspace. Requirements: (1) every session records its trust mode and provider label; (2) the message pipeline is queued and backpressured; (3) provider streaming flows through one client, not per-feature ad-hoc `fetch`.

- **App-server process pool** — ✅ `LocalRuntimePool` starts one lazy process per workspace root and disposes/restarts it when `agiWorkforce.cliPath` changes.
- **Developer-session protocol** — ✅ the app-server owns thread creation, turns, streaming, approvals, cancellation, history, provider credentials, and `model/list`.
- **Message queue / backpressure** — ✅ utility command queues still consume `@agiworkforce/client-runtime`; chat turn serialization is app-server-owned.
- **Legacy agent utilities** — 🟡 surface-local agent/edit helpers remain for editor commands, while primary chat orchestration is app-server-owned.
- **Cloud-utility provider streaming** — ✅ the default-off account-authenticated path is wired for older editor utilities and remains separate from developer sessions.

## Context Engine

Context assembly is workspace-scoped and budget-bounded. Requirements: deterministic file inclusion, a token budget the user can inspect, and no cross-surface context leakage.

- **Context builder + budget** — ✅ `apps/extension-vscode/src/data/contextBuilder.ts` and `contextBudget.ts`; token accounting in `tokenCounter.ts`.
- **Workspace index** — ✅ `apps/extension-vscode/src/data/workspaceIndexer.ts`.
- **Project instructions** — ✅ `apps/extension-vscode/src/data/projectInstructions.ts`.
- **Pinned Context Files + @ references** — ✅ Context Files tree and `@agi` file mentions via `apps/extension-vscode/src/features/trees` and commands `agi-workforce.addToContext` / `mentionFileInChat` (`apps/extension-vscode/package.json`).
- **Memory** — ✅ device-local facts are bounded, trust-tag escaped, and injected as user-role untrusted context into future sidebar/editor/`@agi` turns. Cross-surface memory sync remains intentionally out of scope.

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
- **Untrusted workspaces** — ✅ restrictions cover endpoint, gateway, CLI path, auto-apply, telemetry endpoint, and tier; agent file writes stay disabled until trusted.
- **Bridge command allowlist + rate limit** — ✅ `ALLOWED_BRIDGE_COMMANDS`, 30 cmd/min limit, and workspace-folder file-open guard in `desktopBridge.ts`.
- **Local→BYOK fork** — 🔭 The explicit fork ceremony (secret scan, payload preview, consent, visible label) is a spec requirement not yet implemented as a single gated flow.

## Configuration

Settings live in the `agiWorkforce.*` namespace.

- **Settings surface** — ✅ 24 contributed settings cover endpoint/gateway/model/CLI, context, agent mode/effort, opt-in utilities, bridge, and telemetry.
- **Tier resolution** — ✅ `tierResolver.ts` preserves every canonical plan value; retired values are accepted only as legacy normalization inputs.
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
- `apps/extension-vscode/src/integrations/localRuntimeClient.ts` — app-server process pool and developer-session protocol.
- `apps/extension-vscode/src/providers/agentMode/{agentLoop,agentUI}.ts`, `providers/agentModeProvider.ts` — session/tool/approval orchestration.
- `apps/extension-vscode/src/data/{contextBuilder,contextBudget,workspaceIndexer,projectInstructions,conversationStore,checkpointManager,sendQueue,tokenCounter,usageMeter}.ts` — context + storage.
- `apps/extension-vscode/src/integrations/{providerStreamClient,providerSwitchGuard,tierResolver,patchEngine}.ts` — provider + tier + patch.
- `apps/extension-vscode/src/memory/memoryStore.ts`, `apps/extension-vscode/src/protocol/bridgeMessages.ts`.
- `packages/client/client-runtime/src/index.ts` (message queue, state store); shared crates `crates/agiworkforce-task-runtime`, `crates/agiworkforce-command-registry`.

## Competitor notes

Claude Code and Codex IDE extensions each drive a single-vendor agent loop with editor context, `@` file references, diagnostics, inline diff review, and approvals; cloud handoff previews and local application of remote diffs are their remote-session model. AGI's deliberate divergence: **multi-provider** (auto-inferred from the model-id prefix on the provider-stream path, `apps/extension-vscode/package.json`), **BYOK where allowed** (Desktop/CLI/VS Code only), **per-surface trust** with visible provider labels, and **local-first** conversation storage that never auto-syncs to app chat. Remote control of an editor session from phone/web (Claude Code `/remote-control` parity: banner, session URL, open-in-browser) is 🔭. Model IDs come only from `packages/contracts/types/src/models.json`.

## Acceptance / Definition of Done

The domain is production-ready when the extension consumes shared runtime primitives (queue, state, dispatch) with no forked agent loop, trust labels are visible on every session, and no conversation data leaves the device without an explicit redacted handoff.

- [ ] **Build** — `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; `out/extension.js` compiles.
- [ ] **Trust** — Local sessions never route to BYOK/Cloud without an explicit fork; provider label visible on every send; `conversationStore` remains local-only (no Neon writes).
- [ ] **Security** — Bridge stays token-authed with allowlist + rate limit; untrusted-workspace restricted configs enforced; no attacker-controlled args forwarded from bridge frames.
- [ ] **Pricing** — Tier resolver + `agiWorkforce.tier` enum reconciled to Free / Basic / Pro / Max ($100 & $200) / Enterprise (tracked task).

## Anti-patterns

- Reimplementing the agent loop, queue, or dispatch inside the extension instead of consuming `@agiworkforce/client-runtime` / shared crates.
- Auto-syncing VS Code conversations, context, or memory into Web/Mobile/Desktop app chat (handoff must be explicit + redacted).
- Silently promoting a Local session to BYOK or Cloud, or hiding the active provider label.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`.
- Reintroducing removed tiers (`Plus`, `pro_plus`, `Hobby`) or credit top-ups in tier logic or copy.
- Referencing Supabase, or renaming `proxy.ts` back to `middleware.ts` in any web-facing config the extension calls.
- Weakening the bridge token permission check, allowlist, or rate limit; forwarding bridge-supplied command arguments.
