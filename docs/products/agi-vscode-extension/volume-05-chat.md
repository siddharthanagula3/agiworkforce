# AGI VS Code Extension — Volume 05 — Chat

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and the real code cited in the Repository map below.

## Overview & stance

This volume specifies conversational chat on the AGI VS Code Extension — the IDE-native, workspace-scoped developer surface. Chat here runs in three trust modes with explicit selection and a visible label: **Local** (on-device / local runtime), **BYOK** (user keys — permitted on Desktop/CLI/VS Code only), and **Managed Cloud** (public alpha, open by default for signed-in users). The extension never silently promotes a Local or BYOK conversation into Managed Cloud; a Local→BYOK move is an explicit fork with context selection, secret scan, payload preview, consent, and a provider label (see the trust-mode volume).

The defining constraint on this surface: **chat is developer-session-scoped and does not sync to app chat.** Completed conversations are written only to `vscode.ExtensionContext.globalState` via `ConversationStore` — no platform DB client is imported, and `platform/surface.ts` throws at activation if `vscode` is reclassified as a synced surface (documented in `chatParticipant.ts`). Any handoff to app chat is explicit and redacted, never automatic. Pricing gates use the canon ladder only — Free $0 / Basic $8 (₹399) / Pro $20 / Max $100 & $200 / Enterprise; Local and BYOK are free access modes, not plans.

## Chat Panel — sidebar webview

**✅ Built.** The manifest contributes a webview view `agi-workforce.sidebar` inside the `agi-workforce-sidebar` activity-bar container (`package.json`), backed by `sidebarProvider.ts`, HTML/CSP in `webviewContent.ts`, and turn state in `ChatStateManager.ts`. Requirements: the panel renders the active model label and trust mode; the composer supports `@`-mention of workspace files (`agi-workforce.mentionFileInChat`); `agi-workforce.chat` (Ctrl/Cmd+Shift+A) focuses it and `agi-workforce.openChatInEditor` opens it as an editor tab. The webview CSP forbids inline handlers and `data:` image sources. The `@agi` participant (below) is the parallel path inside VS Code's native Chat view.

## Conversation History — History tree

**✅ Built.** The manifest contributes a tree view `agi-workforce.conversations` named **History** (`package.json` `contributes.views`), implemented by `src/features/trees/conversationTreeProvider.ts`. Each item shows the title, relative time, and a tooltip preview; clicking runs `agi-workforce.openConversation`. `view/title` menus expose `agi-workforce.refreshConversations`; `view/item/context` exposes open/delete. Storage is `globalState`-only, capped at 50 conversations with oldest-pruned semantics (`conversationStore.ts` `MAX_CONVERSATIONS`). Requirement: history never leaves the device and never writes to `conversations`/`chat_messages` Neon tables.

## Resume Sessions

**✅ Built.** `agi-workforce.showSessionsHistory` (`commandSetup.ts`) opens a QuickPick of stored sessions (title, relative time, message count · model) and re-opens the chosen one via `agi-workforce.openConversation`, which reloads the message array from `ConversationStore.get(id)`. Requirements: resuming restores the full user/assistant turn history and the model the session used; an empty history offers **New Chat** (`agi-workforce.newConversation`). Cross-device resume is out of scope by trust design — a VS Code session is never synced, so it cannot resume on Mobile/Web.

## Shared Sessions with CLI — 🔭 target

**🔭 Planned.** A single live session shared between the `agi` CLI and the VS Code extension is a target direction and is **not** wired today. The only cross-surface transport present is the localhost desktop bridge (`desktopBridge.ts`, `ws://127.0.0.1:8787/ws`, shared token at `~/.agiworkforce/bridge-token`, `0600`), which connects the extension to the **Desktop** app and carries snippet/context/agent-action frames — not CLI session state. Target requirements when built: sessions stay local (no cloud round-trip), the connection is outbound-only and approval-gated, and the migration to a Unix domain socket / named pipe (noted in `desktopBridge.ts`) lands first. Mark unwired until a real path exists.

## Streaming

**✅ Built (core) / 🟡 Partial (provider-stream route).** The `@agi` handler streams tokens through `streamChatCompletion`, pushing each token to VS Code via `stream.markdown` and accumulating the full reply for persistence on `onDone` (`chatParticipant.ts`). `agiWorkforce.streamingEnabled` (default `true`) governs streaming; `CancellationToken` aborts cleanly. The alternate `streamChatCompletionViaProvider` route (`agiWorkforce.useProviderStream`) is **🟡** — it fails closed with `AGI_ACCOUNT_WEB_AUTH_NOT_WIRED` because AGI Cloud sign-in is not yet wired in the extension (`chatParticipant.ts`, manifest description of `useProviderStream`). On `NO_API_KEY` or network errors with `agiWorkforce.fallbackToVscodeLm` on, the handler degrades to the built-in `vscode.lm` model.

## Markdown

**✅ Built.** Assistant output is rendered by `src/webview/render.ts`: `markdown-it` with `html:false`, `linkify:true`, `breaks:false`, then a DOMPurify pass (`FORBID_TAGS` for svg/iframe/script/style/etc., `FORBID_ATTR` for `style`/`on*`/`srcdoc`, `ALLOWED_URI_REGEXP` limited to `https`/`mailto`, `ALLOW_DATA_ATTR:false`). An `afterSanitizeAttributes` hook forces `target="_blank" rel="noopener noreferrer"` on links. Requirement: no raw HTML from model output ever reaches the DOM; the renderer is the single sanitization chokepoint (audit findings F-02/F-10).

## Code Rendering

**✅ Built (fenced blocks + copy) / 🟡 Partial (syntax highlighting) / 🔭 (apply-to-editor from chat).** Fenced code blocks render inside `.code-block-wrapper` with a hover **Copy** button, bound after sanitization by `bindCopyButtons` in `webviewContent.ts` (inline handlers are stripped by DOMPurify, so binding happens in script). Language-class fenced blocks are emitted, but no highlighter (e.g. an `hljs` bridge) is wired into `render.ts`, so token-level syntax coloring is **🟡** with that gap. Applying a chat code block straight into the editor is **🔭** on the chat path; edit application flows through the separate agent patch/diff review (`agi-workforce.acceptDiff` and related, gated by Workspace Trust), which is specified in the agent/edit volumes.

## Citations

**🔭 Planned.** Inline source citations (linking generated claims to workspace files, URLs, or retrieved context) are not implemented — no citation model or renderer exists in the chat pipeline. Target requirements: cite `@`-mentioned files and any retrieval context with click-through to the exact range, and never fabricate a citation. Until built, do not present model-emitted "sources" as verified citations.

## Search

**🟡 Partial.** The `showSessionsHistory` QuickPick supports fuzzy filtering across session title, description, and detail (`matchOnDescription`/`matchOnDetail` in `commandSetup.ts`), so users can find a past session by title, model, or recency. Full-text search **inside** message bodies and a persistent search box in the History tree are **not** present — that is the tracked gap. Requirement for completion: local-only search over message content with no network call and no index leaving `globalState`.

## Repository map

- `apps/extension-vscode/package.json` — chat participant, sidebar/History views, commands, keybindings, config.
- `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` — `@agi` participant, streaming, fallback, persistence.
- `apps/extension-vscode/src/features/sidebar-webview/{sidebarProvider.ts,webviewContent.ts,ChatStateManager.ts}` — sidebar chat panel.
- `apps/extension-vscode/src/webview/render.ts` — Markdown → sanitized HTML.
- `apps/extension-vscode/src/data/conversationStore.ts` — `globalState` persistence.
- `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts` — History tree.
- `apps/extension-vscode/src/core/commandSetup.ts` — sessions-history and conversation commands.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge (Desktop only; CLI sharing 🔭).

## Competitor notes

Claude Code's VS Code extension and OpenAI Codex's IDE extension both offer chat/edit/agent modes, `@` file references, editor context, diagnostics, inline diff review, and cloud handoff — each bound to a single vendor. AGI's deliberate divergence: (1) **multi-provider** — the model is chosen from `packages/contracts/types/src/models.json` via `agi-workforce.selectModel`, not hardwired; (2) **per-surface trust** — Local + BYOK + Managed with visible labels; (3) **local-first, no silent sync** — VS Code chat lives in `globalState` and never auto-syncs to app chat. Remote control of an editor session from phone/web (Claude Code `/remote-control` — banner above the prompt, session URL, Open in browser) is a 🔭 parity target, not a fourth trust mode.

## Acceptance / Definition of Done

Chat is production-ready on this surface when: the sidebar panel and `@agi` participant stream reliably; history persists and resumes locally; the trust mode and active model are always visible; and no chat data crosses the developer-session boundary.

- [ ] **Build:** `@agi` streams and cancels; sidebar renders sanitized Markdown; History tree + `showSessionsHistory` resume the full turn history and prior model; copy buttons work in every code block.
- [ ] **Trust:** conversations write only to `globalState`; no Neon `chat`/`memory`/`projects` sync from this surface; Local→BYOK requires explicit fork + label; any app-chat handoff is explicit and redacted; paywall/upgrade links use canon tiers only.
- [ ] **Security:** DOMPurify chokepoint intact (no raw model HTML in DOM); webview CSP blocks inline handlers and `data:` images; `useProviderStream` fails closed until AGI web auth is wired; no model ID hardcoded outside `models.json`.

## Anti-patterns

- Silently routing a Local or BYOK conversation to Managed Cloud, or auto-syncing VS Code chat to app chat / Neon. Both violate the surface trust boundary.
- Claiming citations, CLI-shared sessions, cross-device resume, or apply-from-chat as shipped — they are 🔭/🟡; never label them ✅ without a path.
- Bypassing `render.ts` (raw `innerHTML` of model output) or relaxing the DOMPurify/CSP config.
- Hardcoding or inventing a model ID instead of reading `packages/contracts/types/src/models.json`.
- Surfacing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups in any paywall/upgrade copy — note the manifest's `agiWorkforce.tier` enum still lists `hobby`/`pro_plus` (🟡 legacy gap, reconciled separately); specs use the canon ladder.
- Referencing Supabase, or renaming Next.js `proxy.ts` back to `middleware.ts`, in any related backend touchpoint.
