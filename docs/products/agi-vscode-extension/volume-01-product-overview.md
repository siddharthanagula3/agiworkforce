# AGI VS Code Extension — Volume 01 — Product Overview

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/extension-vscode/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `docs/surfaces/vscode-extension.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`, `apps/extension-vscode/src/integrations/`, `apps/extension-vscode/src/providers/`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines the product vision, mission, goals, personas, principles, and top-level architecture for the **AGI VS Code Extension** — the IDE-native developer surface of the AGI suite (one of six user surfaces; there is no seventh product). It is **workspace-scoped**: sessions belong to the editor and repo, not to a synced consumer chat account. Unlike Web (Cloud only) and Mobile (Local + Cloud, no BYOK), VS Code exposes **all three trust modes — Local, BYOK, and Managed Cloud — with explicit user selection and a visible provider label**. There is **no automatic app-chat sync**; any handoff to app chat is explicit and redacted. The extension holds no proprietary competitor code; Claude Code and Codex IDE extensions are parity references only.

## Vision

Make the editor the highest-leverage place to run AGI: multi-provider, trust-mode-aware coding help that keeps local work local, lets developers bring their own keys with no markup, and offers Managed Cloud when they want hosted compute — all inside VS Code, never forcing data across a trust boundary. ✅ Multi-provider surface exists today (`apps/extension-vscode/package.json` `contributes.configuration` `agiWorkforce.providerStreamProvider` enum; `apps/extension-vscode/src/integrations/providerStreamClient.ts`).

## Mission

Ship an IDE extension that brings AGI chat, edit, and agent workflows to the workspace: an `@agi` chat participant, sidebar webview, History and Context Files trees, model picker, inline completions, code lens, hover, terminal capture, and patch/checkpoint review — over a shared runtime, with a localhost bridge to Desktop. ✅ Feature set is contributed in `apps/extension-vscode/package.json` (`contributes.chatParticipants` `agiworkforce.agi`, `contributes.views` sidebar/History/Context Files/Memory, `contributes.commands`).

## Product Goals

- **Trust-mode clarity**: every session shows its active mode (Local / BYOK / Managed Cloud) and provider label; switching Local→BYOK is an explicit fork. 🟡 A provider-switch guard exists (`apps/extension-vscode/src/integrations/providerSwitchGuard.ts`); the full fork ceremony (context selection, secret scan, payload preview, consent) is not yet fully wired — treat missing pieces as 🔭.
- **Workspace-scoped, no silent sync**: IDE context never lands in Web/Mobile/Desktop app chat automatically. ✅ Enforced by scope rules in `apps/extension-vscode/AGENTS.md`; handoff commands are explicit (`agi-workforce.sendToDesktop`, `agi-workforce.syncContextToDesktop` in `package.json`).
- **Reviewable edits**: all agent edits are diff-gated with accept/reject and checkpoints. ✅ `apps/extension-vscode/src/providers/diffDecorationProvider.ts`, `apps/extension-vscode/src/integrations/patchEngine.ts`, checkpoint commands in `package.json`.
- **Correct model catalog**: model IDs resolve only from the SSOT. ✅ `packages/contracts/types/src/models.json`; never hardcoded.

## User Personas

- **Repo developer (BYOK)**: uses own provider keys, no markup, in a trusted workspace. ✅ `agi-workforce.setApiKey` / `clearApiKey` (`package.json`).
- **Local-first / privacy engineer**: on-device runtime only (Ollama / LM Studio), no cloud egress. 🟡 Local providers are referenced (`agiWorkforce.providerStreamProvider` enum includes `ollama`, `ollama-cloud`, `lmstudio`); full local-only isolation guarantees are still hardening.
- **Managed Cloud subscriber**: signs in for hosted compute and higher limits. ✅ `agi-workforce.signIn` / `signOut` (`apps/extension-vscode/src/features/account-auth/deviceAuth.ts`).
- **Enterprise/admin**: needs org controls and untrusted-workspace safety. 🟡 Restricted-config gating exists (`package.json` `capabilities.untrustedWorkspaces`); org admin is 🔭.

## Product Principles

- **Local, BYOK, Managed Cloud are separate trust boundaries** — never silently routed. ✅ mirrored in `AGENTS.md`; guard in `providerSwitchGuard.ts`.
- **Explicit, labeled, consent-gated crossings.** 🔭/🟡 as above.
- **Reviewable by default** — diffs, checkpoints, approval-gated agent modes (`ask`/`auto`/`plan`/`bypass`). ✅ `agiWorkforce.agent.mode` in `package.json`; `apps/extension-vscode/src/providers/agentModeProvider.ts`.
- **Grounded truth, not invention** — model IDs from `models.json`; no fabricated routes/prices.

## Shared Runtime Architecture — thin client over shared crates/packages

The extension is a **thin client** over the internal AGI Runtime layer, not a standalone engine. It depends on shared workspace packages `@agiworkforce/client-runtime`, `@agiworkforce/types`, `@agiworkforce/utils`, and `@agiworkforce/design-tokens`. ✅ declared in `apps/extension-vscode/package.json` `dependencies`. Cross-surface protocol/session schemas live in `packages/contracts/types` and Rust crates, never in extension-only files (`apps/extension-vscode/AGENTS.md` Lane Contract). Shared developer sessions with the CLI are a **target direction** — 🔭 where unwired.

## VS Code Architecture

- **Entry / activation**: `apps/extension-vscode/src/extension.ts`; activation events `onStartupFinished`, `onChatParticipant:agiworkforce.agi`, `onView:agi-workforce.sidebar` (`package.json`). ✅
- **Chat participant**: `@agi` with slash commands `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model` (`apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`). ✅
- **UI surfaces**: sidebar webview (`src/features/sidebar-webview/`), History tree, Context Files tree, and Memory tree (`src/features/trees/`, `src/memory/`). ✅
- **Editor intelligence**: model picker (`src/features/model-picker/`), inline completions (`src/features/inline-completions/inlineCompletionProvider.ts`), code lens (`src/features/code-lens/`), hover (`src/features/hover/`, default off via `agiWorkforce.hoverEnabled`) 🟡. ✅ others.
- **Agent & edits**: agent modes, diff decorations, patch engine, terminal capture, diagnostics/error explainer (`src/providers/`). ✅
- **Desktop bridge**: `src/features/desktop-bridge/desktopBridge.ts` connects `ws://127.0.0.1:8787/ws` with the shared token at `~/.agiworkforce/bridge-token` (0600, TOCTOU-hardened read) — same transport as the Chrome extension. ✅ Migration target Unix domain socket / named pipe behind `agiWorkforce.desktopBridge.transport` is 🔭 (pending Desktop side, per file header).
- **Remote control of an editor session from phone/web**: 🔭 not built (parity: Claude Code `/remote-control` banner + session URL).

## Inference Providers — three trust modes

- **Local**: on-device runtime (e.g. `ollama`, `lmstudio` in `agiWorkforce.providerStreamProvider`). 🟡 present; strict no-egress isolation still hardening.
- **BYOK**: user keys, direct, no markup — Desktop/CLI/VS Code only. ✅ `agi-workforce.setApiKey`; Local→BYOK guarded by `providerSwitchGuard.ts` (fork ceremony partially 🔭).
- **Managed Cloud**: public alpha, open by default for signed-in users. ✅ device auth (`deviceAuth.ts`); provider-stream path 🟡 — `agiWorkforce.useProviderStream` defaults `false` and account web auth is "not wired in the VS Code extension yet" (`package.json` description). Model IDs resolve only from `packages/contracts/types/src/models.json`.

## Constraints

- Workspace-scoped; no automatic app-chat sync (`apps/extension-vscode/AGENTS.md`). ✅
- Untrusted workspaces restrict `apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, auto-apply, and `tier` overrides; agent file writes disabled until trusted (`package.json` `capabilities.untrustedWorkspaces`). ✅
- No credit top-ups; pricing is Free / Basic $8 (₹399) / Pro $20 / Max $100 and $200 / Enterprise. 🟡 **Reconciliation gap**: `package.json` `agiWorkforce.tier` enum still encodes removed tiers (`hobby`, `pro_plus`) — a separate tracked billing-catalog task.
- Auth/DB/billing stack is Clerk + Neon + Stripe; never Supabase.

## Risks

- **Trust-boundary leak** — Local/BYOK data silently reaching Cloud. Mitigation: explicit fork + label; complete the fork ceremony (🔭) and audit `providerSwitchGuard.ts`.
- **Bridge same-user exposure** — TCP `8787` is reachable by same-user processes despite the 0600 token; socket migration is 🔭.
- **Stale tier/pricing UI** — removed tiers in the manifest could surface to users; track against canon pricing.
- **Provider-stream half-wired** — `useProviderStream` off and unauthenticated could confuse Cloud users; keep labels honest until wired.

## Repository map

- `apps/extension-vscode/package.json` — manifest: commands, `chatParticipants`, `views`, `configuration`, `keybindings`.
- `apps/extension-vscode/src/extension.ts` — activation.
- `apps/extension-vscode/src/features/{chat-participant,sidebar-webview,trees,model-picker,inline-completions,code-lens,hover,desktop-bridge,account-auth,cloud-bridge}/`.
- `apps/extension-vscode/src/providers/` — agent mode, diff decoration, terminal, diagnostics, code action, error explainer, chat editor panel.
- `apps/extension-vscode/src/integrations/` — `patchEngine.ts`, `providerStreamClient.ts`, `providerSwitchGuard.ts`, `tierResolver.ts`.
- `apps/extension-vscode/src/{core,memory,platform,protocol}/`.
- Shared: `packages/client/client-runtime`, `packages/contracts/types` (incl. `src/models.json`), `packages/platform/utils`.

## Competitor notes

Claude Code and Codex IDE extensions offer chat/edit/agent modes, `@`-file references, editor/diagnostics context, inline diff review, approvals, and cloud handoff preview. Both are single-vendor. **AGI's deliberate divergence**: multi-provider by design (`providerStreamProvider` enum), **BYOK with no markup where the trust matrix allows it** (Desktop/CLI/VS Code), **per-surface trust modes** with visible labels, and **local-first** privacy — local work never silently leaves the machine. Remote control mirrors Claude Code's remote-window model (compute stays on host, outbound-only, QR + HMAC, approval-gated) rather than moving sessions to the cloud.

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
- Claiming shipped state without a real repo path, or presenting `useProviderStream`/remote control as live.
- Using `agiworkforce <cmd>` in examples — the binary is `agi`.
