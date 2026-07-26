# AGI VS Code Extension — Volume 23 — UI Components

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/extension-vscode/AGENTS.md`, and real repo paths: `apps/extension-vscode/package.json`, `src/providers/chatEditorPanel.ts`, `src/features/sidebar-webview/{sidebarProvider.ts,webviewContent.ts}`, `src/webview/render.ts`, `src/providers/diffDecorationProvider.ts`, `src/core/commandSetup.ts`, `src/providers/agentMode/agentUI.ts`, `src/features/model-picker/{index.ts,modelConstants.ts}`, `src/data/tokenCounter.ts`, `src/extension.ts`, `src/features/desktop-bridge/desktopBridge.ts`. Model facts (never re-listed): `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies the presentation-layer UI components of the AGI VS Code Extension: the chat surfaces, the composer, the diff/patch review UI, the menus/toolbars, Quick Pick pickers, the status bar, and notifications. The extension is the IDE-native developer surface and is **workspace-scoped**: UI never auto-syncs a session to app chat, and any handoff is explicit and redacted.

All three trust modes apply here — **Local**, **BYOK**, and **Managed Cloud** — with explicit selection and visible host/provider labels. Every component that shows or switches a model must make the boundary legible. The current sidebar labels “Local host” plus the resolved provider or “Auto routing,” including at narrow widths. A provider-boundary change starts a new runtime thread, does not forward the previous transcript, and adds a visible reset notice. `providerSwitchGuard.ts` enforces plan eligibility for cross-provider selection inside the visible conversation; it never authorizes transcript forwarding. Any future continuity feature must add the full context-selection/secret-scan/payload-preview consent ceremony. Cloud features are gated by `tierResolver.ts`, not faked in the UI. Components use VS Code theme tokens so light, dark, and high-contrast themes remain legible.

## Chat Panel

Two functionally identical webview surfaces: the activity-bar **sidebar** (`contributes.views` → `agi-workforce.sidebar`, `src/features/sidebar-webview/sidebarProvider.ts`) and a **chat-in-editor** tab (`src/providers/chatEditorPanel.ts`, `createOrShow` single-instance pattern, command `agi-workforce.openChatInEditor`). Both share HTML from `webviewContent.ts` and the message protocol in `src/protocol/webviewMessages.ts`. ✅ Built.

- Assistant markdown must render through the sanitized pipeline in `src/webview/render.ts` (markdown-it `html:false` + DOMPurify + CSP nonce) — no raw HTML, no `data:` images. ✅ Built (`src/webview/render.ts`).
- The panel must display the active model/provider label and current agent mode/effort at all times. ✅ Built (`webviewContent.ts` composer-controls chips).
- Narrow sidebars preserve the runtime/provider labels, constrain long badges, and keep the composer usable instead of hiding provenance. ✅ Built and webview-tested.
- Markdown code blocks use VS Code code foreground/background tokens, and their copy control is keyboard-visible. ✅ Built and webview-tested.
- Inline tool-call/patch results render within the transcript with accept/reject affordances. 🟡 Partial — transcript rendering exists (`webviewContent.ts`); inline tool-call UI rubric is fixture-verified (`src/__tests__/`), full agent tool-call streaming UI is still hardening.
- `@agi` chat participant (`contributes.chatParticipants`, `src/features/chat-participant/chatParticipant.ts`) surfaces the same responses in VS Code's native Chat view with `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model`. ✅ Built.

## Composer

The composer is the rounded input card at the bottom of the webview (`webviewContent.ts` `.composer-card`, `#userInput`, placeholder "Ask about your code…"). ✅ Built.

- Multiline textarea with focus-within styling; Enter sends, Shift+Enter newlines. ✅ Built (`webviewContent.ts`).
- **Attachment strip + drag-drop overlay**: files dropped/pasted or added through the `+` menu appear as chips with uploading/failed states. Workspace files are validated against traversal, symlinks, folders, and sensitive filenames before becoming model context. ✅ Built.
- **Composer control chips row**: agent-mode chip, effort chip, and model chip (`.composer-controls`) — the model chip is the always-visible trust/provider label. ✅ Built (`webviewContent.ts`).
- `+` (plus) toolbar button opens the attach/tools menu (`#plusBtn`, `role="menu"`). ✅ Built.
- `@`-mention of workspace files must feed the redacted context builder, never auto-upload the whole workspace (`agi-workforce.mentionFileInChat`, `src/data/contextBuilder.ts`). ✅ Built.
- Sensitive-file guard: composer/context must flag secrets before any BYOK/Cloud send (`src/utils/pathSafety.ts` `isSensitiveFile`). ✅ Built.

## Diff Viewer

AI edits are reviewed as inline decorations, never silently applied by default (`agiWorkforce.autoApplyFixes` defaults `false`). Implemented by `src/providers/diffDecorationProvider.ts` (`DiffSession`, gutter +/− decorations, summary header "Changes: +X lines, −Y lines"). ✅ Built.

- Per-hunk accept/reject plus file-level and global batch controls: `agi-workforce.acceptCurrentDiff`/`rejectCurrentDiff`, `acceptAllDiffsGlobal`/`rejectAllDiffsGlobal`, `acceptBatch`/`rejectBatch` (`package.json:contributes.commands`). ✅ Built.
- Keybindings are context-gated by `agi-workforce.hasDiff` so `cmd/ctrl+shift+a` means "new chat" without a diff and "accept current diff" with one (intentional dual-binding). ✅ Built (`package.json:contributes.keybindings`).
- Patch provenance: `agi-workforce.showOriginalContext` (expected vs actual) and `agi-workforce.showPatchLogs` expose why a patch applied/failed. ✅ Built.
- The editor-panel Apply action now calls the shared `DiffDecorationProvider`, opens the proposed change in VS Code's native diff view, and emits the normal `diffProposed` state. ✅ Built and regression-tested.
- Applying a **remote/cloud** diff locally must show the provider label and route through the same approval UI. 🔭 Planned (parity: Codex/Claude local-apply-of-remote-diff; not wired end-to-end).

## Toolbars

- **View title bars**: History tree (`refreshConversations`), Context Files tree (`refreshContext`, `clearContext`), Memory tree (`memory.refresh`, `memory.create`) via `contributes.menus.view/title`. ✅ Built.
- **View item context menus**: open/delete conversation, remove-from-context, mention-in-chat, edit/delete memory fact (`contributes.menus.view/item/context`). ✅ Built.
- **Editor right-click group** `agi-workforce@1..9`: explain, fix, refactor, generateTests, docs, codeReview, askAboutCode, explainError, addToContext (`contributes.menus.editor/context`). ✅ Built.
- **Composer bottom toolbar**: plus/attach button + control chips (`.composer-bottom`). ✅ Built.
- **Action sheet**: `agi-workforce.openActionSheet` aggregates context/model/mode actions into one Quick Pick. ✅ Built (`src/core/commandSetup.ts`).

## Quick Pick

Quick Pick is the primary command-driven picker surface (`src/core/commandSetup.ts`, `src/providers/agentMode/agentUI.ts`).

- **Model picker**: `agi-workforce.selectModel` builds provider-grouped items via `buildGroupedQuickPickItems()` (`src/features/model-picker/modelConstants.ts`), using separators per provider. Model IDs are sourced from the picker options/`packages/contracts/types/src/models.json` — never hardcoded in UI copy. ✅ Built.
- Conversation switcher, agent-action sheet, feedback-type picker, and agent-mode/effort pickers all use `showQuickPick` with `QuickPickItemKind.Separator` grouping. ✅ Built (`src/core/commandSetup.ts`).
- Approval pickers for agent tool execution must default to the safe choice and clearly name the target (`src/providers/agentMode/agentUI.ts`). ✅ Built.

## Status Bar

Two right-aligned status bar items:

- **Model/mode item** (`src/extension.ts:97`, priority 100, command `agi-workforce.selectModel`): renders `$(hubot) AGI: <model>` plus chips for non-default agent mode, `mcp`, and `bridge:<port>`. Click opens the model picker. ✅ Built.
- **Token meter** (`src/data/tokenCounter.ts`, priority 80): `$(pulse) Tokens: used/limit` with a tooltip breakdown; command `agi-workforce.showTokenBreakdown`. ✅ Built.
- **Bridge status** must reflect connected/disconnected/reconnecting for the localhost desktop bridge (`src/features/desktop-bridge/desktopBridge.ts`, `ws://127.0.0.1:8787/ws`, token at `~/.agiworkforce/bridge-token`, 0600). ✅ Built.
- **Remote-control banner/indicator** (phone/web steering a local editor session) is 🔭 Planned (parity: Claude Code `/remote-control` banner + session URL).

## Notifications

- Use `showInformationMessage`/`showWarningMessage`/`showErrorMessage` for confirmations, and `withProgress` for long operations. Destructive/agent actions (writes, terminal, checkpoint restore) must use a **warning** modal with a non-default confirm (`src/providers/agentMode/agentUI.ts`). ✅ Built.
- Bridge-down notification offers a "Reconnect" action (`agi-workforce.bridgeReconnect`). ✅ Built (`src/features/desktop-bridge/desktopBridge.ts`).
- Provider-boundary resets and Cloud upgrade messages name the boundary and do not forward prior transcript context. ✅ Built. A full Cloud-run handoff payload preview remains planned.

## Repository map

- `apps/extension-vscode/package.json` — commands, menus, views, keybindings, configuration.
- `src/providers/chatEditorPanel.ts`, `src/providers/diffDecorationProvider.ts`.
- `src/features/sidebar-webview/{sidebarProvider.ts,webviewContent.ts,ChatStateManager.ts}`, `src/webview/render.ts`.
- `src/features/{model-picker,chat-participant,trees,memory,desktop-bridge}/`.
- `src/core/commandSetup.ts`, `src/providers/agentMode/agentUI.ts`, `src/data/tokenCounter.ts`, `src/extension.ts`.
- `src/integrations/{providerSwitchGuard.ts,tierResolver.ts}`, `src/protocol/webviewMessages.ts`.

## Competitor notes

Claude Code and Codex IDE extensions ship chat/edit/agent modes, `@`-file references, editor context, diagnostics, inline diff review, approvals, and cloud-handoff preview. AGI matches the interaction model but diverges deliberately: (1) **multi-provider** model picker grouped by provider rather than a single vendor; (2) **BYOK** allowed here (unlike Web/Mobile), with an explicit fork UI and secret scan; (3) **per-surface trust** — the model chip and status bar always name the active boundary; (4) **local-first** — the shared bridge runs on localhost and compute stays on the host; remote control is a window, not a data move.

## Acceptance / Definition of Done

Production-ready when every component renders through theme tokens, every model/provider is visibly labeled, no removed tier or invented model ID appears in UI copy, and destructive actions are confirm-gated.

Build

- [ ] `pnpm --filter agi-workforce typecheck && pnpm --filter agi-workforce build` clean.
- [ ] `pnpm --filter agi-workforce test` and `test:webview` green; `check:vscode-theme-tokens` passes.

Trust

- [ ] Active provider/model label visible in composer chip and status bar in every mode.
- [ ] Local→BYOK/Cloud transitions require explicit consent; no silent routing.
- [ ] Extension access-mode enum preserves every canonical plan value; locked model rows cannot be selected through Quick Pick or forged webview messages.

Security

- [ ] All assistant markdown flows through `render.ts` sanitizer + CSP nonce.
- [ ] Diff apply is opt-in; sensitive-file guard runs before any BYOK/Cloud send.

## Anti-patterns

- Silently routing a Local chat/file to BYOK or Cloud, or hiding the provider label.
- Auto-syncing an editor session to app chat, or handing off unredacted context.
- Hardcoding model IDs in UI strings instead of reading `packages/contracts/types/src/models.json` / the picker options.
- Showing removed tiers ("Plus", `pro_plus`, "Hobby") or inventing INR prices for Pro/Max, or offering credit top-ups.
- Rendering unsanitized markdown/raw HTML in a webview, or bypassing the CSP nonce.
- Auto-applying diffs without review, or making a destructive action's confirm the default button.
- Referencing Supabase, or renaming Next.js `proxy.ts` back to `middleware.ts` in shared web references.
- Claiming remote-control or cloud-handoff UI as shipped — both are 🔭 Planned.
