# AGI VS Code Extension — Volume 01 — Product Overview

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: `AGENTS.md`, `apps/extension-vscode/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `docs/surfaces/vscode-extension.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`, `apps/extension-vscode/src/integrations/`, `apps/extension-vscode/src/providers/`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines the product vision, mission, goals, personas, principles, and top-level architecture for the **AGI VS Code Extension** — the IDE-native developer surface of the AGI suite (one of six user surfaces; there is no seventh product). It is **workspace-scoped**: sessions belong to the editor and repo, not to a synced consumer chat account. Unlike Web (Cloud only) and Mobile (Local + Cloud, no BYOK), VS Code exposes **all three trust modes — Local, BYOK, and Managed Cloud — with explicit user selection and a visible provider label**. There is **no automatic app-chat sync**; any handoff to app chat is explicit and redacted. The extension holds no proprietary competitor code; Claude Code and Codex IDE extensions are parity references only.

## Vision

Make the editor the highest-leverage place to run AGI: multi-provider, trust-mode-aware coding help that keeps local work local, lets developers bring their own keys with no markup, and offers Managed Cloud when they want hosted compute — all inside VS Code, never forcing data across a trust boundary. ✅ Developer-session routing is owned by the multi-provider `agi app-server`; managed models come from the governed catalog and installed local models from `model/list`.

## Mission

Ship an IDE extension that brings AGI chat, edit, and agent workflows to the workspace: an `@agi` chat participant, sidebar webview, History and Context Files trees, model picker, inline completions, code lens, hover, terminal capture, and patch/checkpoint review — over a shared runtime, with a localhost bridge to Desktop. ✅ Feature set is contributed in `apps/extension-vscode/package.json` (`contributes.chatParticipants` `agiworkforce.agi`, `contributes.views` sidebar/History/Context Files/Memory, `contributes.commands`).

## Product Goals

- **Trust-mode clarity**: the sidebar shows the Local host plus the resolved provider or Auto routing. Same-provider model changes preserve the runtime thread; a provider-boundary change starts a new thread, does not forward the earlier transcript, and emits a visible notice. The full context-selection/payload-preview ceremony remains required before any future feature forwards an existing Local transcript.
- **Workspace-scoped, no silent sync**: IDE context never lands in Web/Mobile/Desktop app chat automatically. ✅ Enforced by scope rules in `apps/extension-vscode/AGENTS.md`; handoff commands are explicit (`agi-workforce.sendToDesktop`, `agi-workforce.syncContextToDesktop` in `package.json`).
- **Reviewable edits**: all agent edits are diff-gated with accept/reject and checkpoints. ✅ `apps/extension-vscode/src/providers/diffDecorationProvider.ts`, `apps/extension-vscode/src/integrations/patchEngine.ts`, checkpoint commands in `package.json`.
- **Correct model catalog**: model IDs resolve only from the SSOT. ✅ `packages/contracts/types/src/models.json`; never hardcoded.

## User Personas

- **Repo developer (BYOK)**: uses own provider keys, no markup, in a trusted workspace. ✅ `agi-workforce.setApiKey` / `clearApiKey` (`package.json`).
- **Local-first / privacy engineer**: on-device runtime only (Ollama / LM Studio), no cloud egress. ✅ The app-server owns local inference and returns installed local models to the extension.
- **Managed Cloud subscriber**: signs in for hosted compute and higher limits. ✅ `agi-workforce.signIn` / `signOut` (`apps/extension-vscode/src/features/account-auth/deviceAuth.ts`).
- **Enterprise/admin**: needs org controls and untrusted-workspace safety. 🟡 Restricted-config gating exists (`package.json` `capabilities.untrustedWorkspaces`); org admin is 🔭.

## Product Principles

- **Local, BYOK, Managed Cloud are separate trust boundaries** — never silently routed. ✅ mirrored in `AGENTS.md`; prior context is not forwarded across provider resets.
- **Explicit, labeled, consent-gated crossings.** 🔭/🟡 as above.
- **Reviewable by default** — diffs, checkpoints, approval-gated agent modes (`ask`/`auto`/`plan`/`bypass`). ✅ `agiWorkforce.agent.mode` in `package.json`; `apps/extension-vscode/src/providers/agentModeProvider.ts`.
- **Grounded truth, not invention** — model IDs from `models.json`; no fabricated routes/prices.

## Shared Runtime Architecture — thin client over shared crates/packages

The extension is a **thin client** over the `agi app-server`, not a standalone inference engine. `LocalRuntimePool` maintains one lazy runtime per workspace root; the app-server owns threads, turns, streamed output, approvals, cancellation, history, provider configuration, and local-model discovery. Shared TypeScript packages provide the catalog and UI contracts, while protocol/session schemas live in shared contract/Rust owners rather than extension-only files.

## VS Code Architecture

- **Entry / activation**: `apps/extension-vscode/src/extension.ts`; activation events `onStartupFinished`, `onChatParticipant:agiworkforce.agi`, `onView:agi-workforce.sidebar` (`package.json`). ✅
- **Chat participant**: `@agi` with slash commands `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model` (`apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`). ✅
- **UI surfaces**: sidebar webview (`src/features/sidebar-webview/`), History tree, Context Files tree, and Memory tree (`src/features/trees/`, `src/memory/`). ✅
- **Editor intelligence**: model picker (`src/features/model-picker/`), inline completions (`src/features/inline-completions/inlineCompletionProvider.ts`), code lens (`src/features/code-lens/`), hover (`src/features/hover/`, default off via `agiWorkforce.hoverEnabled`) 🟡. ✅ others.
- **Agent & edits**: agent modes, diff decorations, patch engine, terminal capture, diagnostics/error explainer (`src/providers/`). ✅
- **Desktop bridge**: `src/features/desktop-bridge/desktopBridge.ts` connects `ws://127.0.0.1:8787/ws` with the shared token at `~/.agiworkforce/bridge-token` (0600, TOCTOU-hardened read) — same transport as the Chrome extension. ✅ Migration target Unix domain socket / named pipe behind `agiWorkforce.desktopBridge.transport` is 🔭 (pending Desktop side, per file header).
- **Remote control of an editor session from phone/web**: 🔭 not built (parity: Claude Code `/remote-control` banner + session URL).

## Inference Providers — three trust modes

- **Local**: on-device Ollama/LM Studio inference owned by the app-server; installed models arrive through `model/list`.
- **BYOK**: provider credentials configured through the CLI runtime, direct/no-markup, on Desktop/CLI/VS Code only. The legacy extension API-key command stores an AGI gateway credential, not a third-party provider vault.
- **Managed Cloud**: public alpha, open by default for signed-in users. Device auth is wired. The default-off provider-stream setting is an account-authenticated transport for cloud-backed editor utilities only; it does not affect local developer sessions. Model IDs resolve only from `packages/contracts/types/src/models.json`.

## Constraints

- Workspace-scoped; no automatic app-chat sync (`apps/extension-vscode/AGENTS.md`). ✅
- Untrusted workspaces restrict `apiEndpoint`, `gatewayUrl`, `cliPath`, `autoApplyFixes`, `telemetryEndpoint`, and `tier` overrides; agent file writes are disabled until trusted. ✅
- No credit top-ups. The extension access-mode enum preserves every canonical plan value.
- Auth/DB/billing stack is Clerk + Neon + Stripe; never Supabase.

## Risks

- **Trust-boundary leak** — Local/BYOK data silently reaching Cloud. Mitigation: explicit fork + label; complete the fork ceremony (🔭) and audit `providerSwitchGuard.ts`.
- **Bridge same-user exposure** — TCP `8787` is reachable by same-user processes despite the 0600 token; socket migration is 🔭.
- **Local runtime packaging** — the `.vsix` does not bundle `agi`; demo/release setup must install the CLI or configure `agiWorkforce.cliPath`.
- **Provider-stream scope confusion** — keep `useProviderStream` explicitly labeled as cloud-utility-only; developer chat remains app-server-owned.

## Repository map

- `apps/extension-vscode/package.json` — manifest: commands, `chatParticipants`, `views`, `configuration`, `keybindings`.
- `apps/extension-vscode/src/extension.ts` — activation.
- `apps/extension-vscode/src/features/{chat-participant,sidebar-webview,trees,model-picker,inline-completions,code-lens,hover,desktop-bridge,account-auth,cloud-bridge}/`.
- `apps/extension-vscode/src/providers/` — agent mode, diff decoration, terminal, diagnostics, code action, error explainer, chat editor panel.
- `apps/extension-vscode/src/integrations/` — `patchEngine.ts`, `providerStreamClient.ts`, `providerSwitchGuard.ts`, `tierResolver.ts`.
- `apps/extension-vscode/src/{core,memory,platform,protocol}/`.
- Shared: `packages/client/client-runtime`, `packages/contracts/types` (incl. `src/models.json`), `packages/platform/utils`.

## Competitor notes

Claude Code and Codex IDE extensions offer chat/edit/agent modes, `@`-file references, editor/diagnostics context, inline diff review, approvals, and cloud handoff preview. Both are single-vendor. **AGI's deliberate divergence**: catalog-driven multi-provider selection, **BYOK with no markup where the trust matrix allows it**, **per-surface trust modes** with visible labels, and **local-first** privacy. Remote control remains a planned remote-window model rather than moving sessions to the cloud.

## Acceptance / Definition of Done

Production-ready when the trust modes are explicit and labeled, no IDE context syncs automatically to app chat, edits are diff-gated, and the model catalog resolves only from SSOT.

- [ ] **Build**: `pnpm --filter agi-workforce typecheck`, `test`, and `build` pass; `out/extension.js` compiles.
- [ ] **Trust**: active mode + provider label visible; Local→BYOK requires explicit fork (context selection, secret scan, payload preview, consent); no silent Local/BYOK→Cloud routing.
- [ ] **Security**: bridge token read enforces 0600; untrusted-workspace restricted configs honored; no removed tiers or invented model IDs/routes/INR prices ship.

## Anti-patterns

- Silently routing Local/BYOK chats, files, or sessions to Cloud, or auto-syncing IDE context into app chat.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`.
- Reintroducing removed tiers (`Plus`, `pro_plus`, `Hobby`) or adding credit top-ups; inventing Pro/Max INR prices.
- Referencing Supabase, or renaming Next.js `proxy.ts` back to `middleware.ts`.
- Claiming shipped state without a real repo path, or presenting remote control as live.
- Using `agiworkforce <cmd>` in examples — the binary is `agi`.
