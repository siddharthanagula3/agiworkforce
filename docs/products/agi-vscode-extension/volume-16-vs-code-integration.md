# AGI VS Code Extension — Volume 16 — VS Code Integration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, `docs/surfaces/vscode-extension.md`, and grounded in `apps/extension-vscode/package.json`, `apps/extension-vscode/src/extension.ts`, `apps/extension-vscode/src/features/{sidebar-webview,trees,code-lens,hover,chat-participant,desktop-bridge}/`, `apps/extension-vscode/src/data/tokenCounter.ts`, `apps/extension-vscode/src/core/subsystemHealth.ts`, `apps/extension-vscode/src/providers/{diffDecorationProvider.ts,terminalProvider.ts}`.

## Overview & stance

This volume maps AGI onto VS Code's native contribution surfaces — the points where the editor exposes the extension. AGI VS Code is the IDE-native, workspace-scoped developer surface with all three trust modes (Local, BYOK, Managed Cloud) selectable, each carrying a visible provider/model label. Every integration point below inherits the surface invariants: sessions stay workspace/task-scoped, there is **no automatic app-chat sync** (any handoff is explicit and redacted), and Local context is never silently routed to BYOK or Cloud. The manifest is the source of truth for what is contributed: `apps/extension-vscode/package.json` declares 1 activity-bar container, 4 side-bar views, 71 commands, 14 keybindings, 1 `@agi` chat participant (6 slash commands), 4 menu groups, and 26 configuration keys — verified counts. Parity references are the Claude Code and Codex IDE extensions; AGI diverges by being multi-provider, BYOK where the surface allows it, per-surface trust, and local-first.

## Activity Bar

- ✅ Built — one dedicated view container `agi-workforce-sidebar` (title "AGI Workforce", icon `media/icon-sidebar.svg`) registered under `contributes.viewsContainers.activitybar` (`package.json`). Requirement: a single branded entry point that must not imply a trust mode until opened.

## Side Bar

- ✅ Built — the container hosts four views (`contributes.views.agi-workforce-sidebar`): a `webview` chat view `agi-workforce.sidebar` (`src/features/sidebar-webview/sidebarProvider.ts`), a `History` tree `agi-workforce.conversations` and a collapsed `Context Files` tree `agi-workforce.contextPanel` (`src/features/trees/`), and a collapsed `Memory` tree `agi-workforce.memory`. `view/title` and `view/item/context` menus wire refresh/clear/open/delete/edit actions (`package.json`). Requirement: the webview must show the resolved trust mode + provider/model label at all times; History and Memory rows are workspace/account-scoped and never auto-synced to app chat.

## Editor

- ✅ Built — an `editor/context` menu group (`agi-workforce@1..9`) contributes Explain, Fix, Refactor, Generate Tests, Docs, Code Review, Ask About Code, Explain Error, and Add File to Context; selection-gated entries use `when: editorHasSelection` (`package.json`). Inline edits render as reviewable diffs in the active editor (`src/providers/diffDecorationProvider.ts`; see Volume 08). Requirement: editor actions operate on the current selection/file only and must show the active provider label before dispatch.

## Inline Chat

- 🔭 Planned — there is **no** native editor-anchored inline-chat widget (`CommentController` / VS Code inline-chat surface) in `src/`. The shipped substitute is command-driven inline editing plus the `@agi` participant and `editor/context` actions (Volume 08). Requirement: when built, an in-editor prompt box must show trust mode + provider before sending and honor `agiWorkforce.agent.mode` (`ask`/`auto`/`plan`/`bypass`) so `ask`/`plan` never edit without confirmation.

## CodeLens

- ✅ Built — `src/features/code-lens/codeLensProvider.ts` renders "Ask AI / Tests / Docs" lenses above functions and classes, gated by `agiWorkforce.codeLensEnabled` (default `true`, `package.json`). A separate `DiffCodeLensProvider` (`src/providers/diffDecorationProvider.ts`) places Accept/Reject/Accept-All/Reject-All/Accept-Batch lenses over pending diff hunks. Requirement: lenses must be toggleable and must not trigger any network call until the user clicks one.

## Hover

- ✅ Built (opt-in) — `src/features/hover/hoverProvider.ts` shows AGI quick actions on hover over identifiers, gated by `agiWorkforce.hoverEnabled` (default `false`, `package.json`). Requirement: because it is default-off, enabling it must be a deliberate user choice; hover must never fire an LLM request on mouse-over alone — only on an explicit action click.

## Commands

- ✅ Built — 71 commands under `contributes.commands` (`package.json`), spanning chat/agent, edit actions (`explain`/`fix`/`refactor`/`generateTests`/`docs`/`codeReview`), diff/patch/checkpoint flows, model/tier/account, memory, context, and desktop-bridge (`sendToDesktop`, `bridgeReconnect`). 14 keybindings and a `commandPalette` filter scope palette visibility by `when` context. Requirement: commands crossing a trust boundary (send-to-desktop, cloud sign-in) must be explicit and labeled; palette entries must not appear when their `when` context is unmet.

## Status Bar

- ✅ Built — status-bar items are created via the VS Code API (no manifest contribution point): a model indicator (`src/extension.ts`, `command: agi-workforce.selectModel`), a token-usage counter (`src/data/tokenCounter.ts`, `$(pulse) Tokens: x/y`), a subsystem-health item (`src/core/subsystemHealth.ts`), and a desktop-bridge connection indicator (`src/features/desktop-bridge/desktopBridge.ts`: connected/disconnected/reconnecting). Requirement: the status bar must reflect the true resolved provider and bridge state — never a fake "connected" or stale model label.

## Explorer

- 🔭 Planned — the manifest contributes **no** `explorer/context` menu, so right-clicking a file in the file Explorer does not offer AGI actions today. File-to-context flows run through the `editor/context` `Add File to Context` command and the `Context Files` tree instead (`src/features/trees/contextPanelProvider.ts`). Requirement: when added, an Explorer "Add to AGI Context" action must respect workspace trust and must not read files outside the workspace root.

## SCM

- 🟡 Partial — git actions exist as commands (`agi.git.status`, `agi.git.diff`, `agi.git.commit` in `package.json`; see Volume 10) but there is **no** native SCM integration: no `scm/title` or `scm/resourceState/context` menu, and no `SourceControlInputBox` provider (grep finds no `SourceControl`/`inputBox` usage outside test mocks). AI commit-message generation into the native SCM input box is 🔭. Requirement: any SCM write (commit) must be explicit and user-confirmed; generated messages must render for review before commit.

## Debugger

- 🔭 Planned — no debug API usage (`vscode.debug`, `registerDebugConfigurationProvider`, DebugAdapter) and no `debuggers`/`breakpoints` contributions. AGI does not read debug sessions, breakpoints, or the debug console today. Requirement: a future debug integration must treat captured stack/variable state as sensitive context, subject to the same secret scan and consent as any BYOK/Cloud payload.

## Tasks

- 🔭 Planned — no `taskDefinitions` contribution and no `TaskProvider`. Terminal execution and capture exist (`src/providers/terminalProvider.ts` uses `createTerminal` + `TerminalShellExecution.read()`; `agi.test.run`), but that is terminal integration (Volume 09), not VS Code Tasks. Requirement: a Task provider must never auto-run tasks without approval in `ask`/`plan` mode and must be disabled in untrusted workspaces.

## Notebooks

- 🔭 Planned — no `NotebookController`, `notebooks` contribution, or notebook-cell menus. AGI cannot read or edit `.ipynb` cells today. Requirement: a notebook controller must render per-cell diffs through the same review/accept path as editor edits, with the active provider label.

## Repository map

- `apps/extension-vscode/package.json` — all contribution points (activity bar, views, commands, keybindings, menus, chat participant, configuration).
- `apps/extension-vscode/src/extension.ts` — activation, status-bar model item wiring.
- `apps/extension-vscode/src/features/sidebar-webview/` — side-bar chat webview.
- `apps/extension-vscode/src/features/trees/` — History, Context Files, Memory tree providers.
- `apps/extension-vscode/src/features/code-lens/` and `.../hover/` — CodeLens and hover providers.
- `apps/extension-vscode/src/providers/diffDecorationProvider.ts` — inline diff + diff CodeLenses.
- `apps/extension-vscode/src/data/tokenCounter.ts`, `src/core/subsystemHealth.ts` — status-bar items.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge + status indicator.

## Competitor notes

Claude Code and Codex IDE extensions integrate deeply with editor context, diagnostics, inline diff review, and approvals, adding cloud handoff and local application of remote diffs; Copilot ships an editor-anchored inline-chat widget. AGI matches the core surfaces today — activity bar, multi-view side bar, editor actions, CodeLens, hover, commands, live status bar — and diverges by (1) being multi-provider with a **visible provider/model label** everywhere; (2) allowing **BYOK** in the IDE where Web/Mobile cannot; (3) enforcing per-surface trust and local-first, so Local sessions run on-device via the localhost bridge with no data leaving the machine. Visible parity gaps: inline-chat widget, native SCM commit-message generation, and Explorer/Debugger/Tasks/Notebook integration — all 🔭.

## Acceptance / Definition of Done

VS Code integration is production-ready when every contributed point behaves as declared, shows accurate trust/provider state, and no integration crosses a trust boundary without consent.

Build:

- [ ] Manifest counts verified against `package.json` (1 container, 4 views, 71 commands, 14 keybindings, 1 participant, 26 config keys); no contribution references a missing handler. Status-bar items reflect real model/bridge state; CodeLens/hover respect their enable flags.

Trust:

- [ ] Every surface shows the active trust mode + provider label; no Local→BYOK/Cloud routing without the explicit fork; no view or command auto-syncs workspace context to app chat.

Security:

- [ ] Untrusted-workspace restrictions honored (restricted configs not workspace-overridable; agent writes disabled until trusted); planned Explorer/Debugger/Tasks/Notebook integrations gate reads/writes behind trust + secret scan before shipping.

## Anti-patterns

- Claiming Inline Chat, Explorer, Debugger, Tasks, or Notebook integration as shipped — they are 🔭; only the manifest-backed points are ✅.
- Showing a stale or fake provider/model or a "connected" bridge status that is not real.
- Auto-syncing side-bar History/Memory/Context to Web/Mobile/Desktop app chat, or routing a Local session to BYOK/Cloud without consent, a payload preview, and a visible label.
- Firing an LLM request on hover, CodeLens render, or Explorer expansion before an explicit user action.
- Hardcoding or inventing model IDs; all LLM IDs come from `packages/contracts/types/src/models.json`.
- Referencing removed tiers. `package.json` `agiWorkforce.tier` still enumerates `hobby`/`pro_plus` — a known 🟡 reconciliation gap; specs use only Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise, with no top-ups.
- Referencing Supabase (fully migrated away) or renaming `proxy.ts` to `middleware.ts`.
