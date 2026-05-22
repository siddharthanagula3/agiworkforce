# GAP-EXT-VSCODE: AGI Workforce VS Code extension vs Anthropic "Claude Code for VS Code"

**Scope:** `/Users/siddhartha/Desktop/agiworkforce/apps/extension-vscode/` — 65 .ts files (62 production + 3 test scaffolding files like `runTests.ts`, `suite/index.ts`; tooling claim of 66 was approximate). Manifest at `apps/extension-vscode/package.json` v0.3.0 (preview), 56 contributed commands, 23 settings, 13 keybindings, 1 chat participant, 3 sidebar views.

**Reference (Anthropic):** `apps/extension-vscode/` analog ships as `anthropic.claude-code` v2.1.86, ~6 M installs, sidebar/auxiliary panel + editor-canvas placement, "Filter actions…" Quick Pick palette, four mutually-exclusive modes cycled with `Cmd+Tab` (Ask before edits / Edit automatically / Plan mode / Bypass permissions), three-position Effort slider (low / med / high) with `auto` and `max` exposed via the CLI, native `@`-mention picker (`@`= file/symbol; `Cmd+Option+K` inserts `@src/auth.ts#L1-99`), Local + Web sessions tabs, "Rewind" checkpoint, persistent file pill, Spark icon launch, Cmd+Esc / Ctrl+Esc shortcut, WSL command setting, bundled `claude` binary, and tight integration with Claude Code CLI's slash command surface (`/explain /fix /refactor /tests /docs /model /plan /plugins /agents /mcp /init /team-onboarding` plus the 60+ from `§5.2` of `tasks/research/anthropic-claude-suite-may-2026.md:254-264`).

**Citation conventions:** filenames are absolute under `apps/extension-vscode/`. `package.json` line numbers refer to the manifest in this repo.

---

## Have

- Sidebar webview chat panel via `viewsContainers.activitybar` slot `agi-workforce-sidebar` + `views.agi-workforce-sidebar` (`package.json:408-438`) with `retainContextWhenHidden: true` (`src/extension.ts:127`).
- Inline diff decorations + accept/reject CodeLens with gutter `+`/`-` markers, Per-file and global Accept/Reject, batch-level accept/reject, summary header "Changes: +X −Y in file" (`src/providers/diffDecorationProvider.ts:65-535`).
- `@`-mention dropdown with workspace-file file search wired through `fileSearch` postMessage (`src/providers/sidebarProvider.ts:1191-1241`); `@file.ts` references resolved + injected as user-role context (`sidebarProvider.ts:1593-1651`).
- @-mention completions in the sidebar chat composer, but not in the VS Code Chat panel surface (`src/providers/chatParticipant.ts` does not call `request.references` API).
- Conversation tree view "History" with relative-time stamps, click-to-open as Markdown, delete + refresh inline (`src/providers/conversationTreeProvider.ts:1-66`, `package.json:425-431`).
- Multi-conversation persistence (50 cap, FIFO prune) via `globalState` (`src/storage/conversationStore.ts:25-95`).
- Modes: 4-state agent.mode enum `ask | auto | plan | bypass` (`package.json:612-622`), set via `agi-workforce.openActionSheet` Quick Pick (`src/extension.ts:1164-1199`), persisted at global config scope, surfaced as a chip in the sidebar status bar (`src/extension.ts:1281-1298`).
- Effort slider: 4-position `low | medium | high | max` enum (`package.json:623-633`), Quick Pick UI in `openActionSheet` (`extension.ts:1131-1162`); supportsEffort gating per provider via `PROVIDER_DISPLAY` (`sidebarProvider.ts:81`).
- Add-context menu equivalents: `agi-workforce.addToContext` / `removeFromContext` / `clearContext` / `refreshContext` (`extension.ts:144-170`); editor context menu wires Explain/Fix/Refactor/GenerateTests/Docs/CodeReview/AskAboutCode/ExplainError/AddToContext (`package.json:475-518`).
- "AGI Workforce — Actions" Quick Pick action sheet with Filter actions… pattern (`extension.ts:1050-1205`), Anthropic "Filter actions…" parity copy ("Attach file" / "Switch model…" / "Effort:" / "Mode:" / "Account & usage" / "Rewind" / "Clear conversation").
- @claude/@agi chat participant shim: `chatParticipants[0]` registers id `agiworkforce.agi`, sticky, with 6 slash subcommands `explain / fix / refactor / tests / docs / model` (`package.json:352-407`), plus disambiguation categories `coding` and `architecture`.
- Slash commands shipped: `/explain /fix /refactor /tests /docs /model` — 6 of the 12 in §8.4 (`package.json:359-384`, `src/providers/chatParticipant.ts:236-272`).
- Inline completions via `vscode.languages.registerInlineCompletionItemProvider` with debounce, LRU cache, prefix/suffix context, paywall suppression-on-first-hit (`src/providers/inlineCompletionProvider.ts:81-258`); enabled by default (`package.json:588-592`).
- CodeLens for "Ask AI / Tests / Docs" above functions and classes for 12 languages (`src/providers/codeLensProvider.ts:51-183`); cached per document version.
- Hover provider with command links (Explain / Fix / Tests) — opt-in (default `false`) (`src/providers/hoverProvider.ts:11-38`, `package.json:573-577`).
- Diagnostic sharing: `errorExplainer` reads `vscode.languages.getDiagnostics` for current line and feeds to LLM (`src/providers/errorExplainerProvider.ts:55-104`); `agi-workforce.codeReview` produces `vscode.Diagnostic` entries from AI review (`src/providers/diagnosticsProvider.ts:13-91`).
- Code Action / lightbulb integration: "Fix with AGI Workforce" (QuickFix on diagnostic), "Refactor" / "Explain" / "Generate Tests" with selection (`src/providers/codeActionProvider.ts:11-79`).
- Status bar: model + mode + mcp + bridge port chip (`src/extension.ts:1276-1299`); Token Counter status bar with color-coded budget (`src/services/tokenCounter.ts:18-141`); subsystem health status bar (`src/services/subsystemHealth.ts:30-102`); bridge reachability status bar (`src/lifecycle/advancedFeatures.ts:65-112`).
- Terminal integration: `agi-workforce.runCommand`, `explainTerminal` via Shell Integration API, `suggestCommand` with safety denylist (`src/providers/terminalProvider.ts:34-619`).
- Checkpoint manager (`/rewind` analog): git-stash-based, 20-checkpoint cap, restore via Quick Pick, status `agi-workforce.createCheckpoint / restoreCheckpoint / listCheckpoints` (`src/services/checkpointManager.ts:65-389`).
- Plan mode handling in chat participant: detects `proceed/yes/run/ship`, prefixes plan-only system instruction (`src/providers/chatParticipant.ts:150-187`).
- Desktop bridge with auth handshake, allowlist of inbound/outbound message types, exponential reconnect, status bar item, shared `~/.agiworkforce/bridge-token` (`src/services/desktopBridge.ts:31-829`).
- Workspace context builder: open files, git status, diagnostics, tree, pinned files (`src/services/contextBuilder.ts:60-444`).
- Workspace indexer: 500-file / 5000-symbol cap, incremental file watcher (`src/services/workspaceIndexer.ts:27-200`).
- Tier-aware paywall + Pro+ provider-switch guard (`src/services/providerSwitchGuard.ts:39-116`); inline paywall card on 429 (`src/providers/chatParticipant.ts:418-462`).
- VS Code LM API fallback (Copilot models) when no AGI key set + opt-in toggle (`src/providers/chatParticipant.ts:195-231`, `package.json:563-567`).
- Workspace Trust gating for `apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, `agent.autoApply`, `autoApplyFixes`, `telemetryEndpoint`, `tier` (`package.json:46-60`); `git.commit`/`test.run`/`runCommand` refuse in untrusted workspaces (`src/extension.ts:980, 996`, `src/providers/terminalProvider.ts:160`).
- Telemetry events with PII redaction (`src/services/telemetry.ts` + `src/__tests__/telemetryRedaction.test.ts`).
- 23 keybindings declared but only 13 (per audit): `cmd+shift+a` open chat (when `!hasDiff`), accept/reject diff, accept-all/reject-all global, run/ask/explain/explainError/agentMode/newConversation chords (`package.json:723-797`).
- Provider-stream pipeline shim with Supabase JWT secret + `useProviderStream` flag for /api/v1/providers/:id/stream (`src/utils/api.ts:159-169`, `package.json:663-693`).
- 13 Anthropic-parity providers in the model picker enum (anthropic, openai, google, ollama, ollama-cloud, xai, deepseek, perplexity, qwen, moonshot, zhipu, lmstudio, custom) (`package.json:673-691`).
- 3 auto-mode model IDs (`auto-balanced`, `auto-economy`, `auto-premium`) at top of QuickPick (`src/services/modelConstants.ts:110-128`).

---

## Partial

### Sidebar chat panel — 75 %

Renders a single webview, but no **multi-tab** chat sessions inside the panel (Anthropic's "New Chat | Untitled" tab strip per `ui-05-claude-extensions.md:138-141`); a "new conversation" command (`agi-workforce.newConversation`, `extension.ts:1031-1035`) replaces the live conversation rather than opening a parallel tab. No second placement (editor-canvas tab) — the `Preferred Location` setting from V-08 is absent. **Effort:** 3 d to add tab strip + per-tab conversation in `sidebarProvider.ts`; 2 d for an editor-canvas placement (rewriting webview as `vscode.window.createWebviewPanel`).

### Inline diffs — 80 %

Decorations + accept/reject works (`diffDecorationProvider.ts`), but no native VS Code diff editor (`vscode.diff` URI scheme) integration for side-by-side review (Anthropic V-05's `Edit automatically` likely routes through that). The `agi-workforce.showOriginalContext` command opens an info modal, not a diff tab. **Effort:** 2 d to add `vscode.commands.executeCommand('vscode.diff', ...)` flow.

### `@-mentions` — 60 %

Sidebar webview has `@`-file mention dropdown (`sidebarProvider.ts:1191-1241`), but no `@symbol`, `@selection`, `@terminal`, `@problems`, `@debug` referent types (Anthropic ships File / Selection / Terminal output / Problem / Debug session per `anthropic-claude-suite-may-2026.md:454`). Also no `@`-pick inside the VS Code Chat panel surface — the `chatParticipant.ts` ignores `request.references`. **Effort:** 4 d to add 4 referent types + chat-participant integration.

### Multiple conversations — 50 %

Conversations persist across sessions (`conversationStore.ts`), shown in History tree, but only **one is "live"** at any moment in the sidebar; opening an older conversation renders it as a read-only Markdown tab (`extension.ts:580-589`) rather than as a re-engageable chat. No tab strip, no `Untitled` parallel sessions. No Local/Web tabs split (Anthropic V-09 ships both a search box and a Local/Web filter). **Effort:** 4 d to make stored conversations resumable + 3 d for tab strip in webview.

### Modes (Default / Auto-accept / Plan) — 75 %

`agent.mode` enum has 4 values (`ask | auto | plan | bypass`) (`package.json:612-622`); `openActionSheet` Quick Pick (`extension.ts:1164-1199`) provides the picker. Missing: `Shift+Tab` cycle keybinding (Anthropic) — closest analog `Cmd+Tab` is absent; mode chip in composer footer (currently in status bar, not composer); maroon "danger" tinting of send button when `bypass` is active (`ui-05-claude-extensions.md:230`). **Effort:** 1 d for `Shift+Tab` keybinding registration + composer-pill rendering inside webview HTML.

### Effort slider — 70 %

4-position enum `low | medium | high | max` (`package.json:623-633`), but no `auto` value (Anthropic exposes `auto` per `anthropic-claude-suite-may-2026.md:258`). UI is a Quick Pick, not a true slider with three filled dots (V-05's pip-style); no inline slider in composer footer; no display of three discrete dots. **Effort:** 1 d to add `auto` enum + custom slider HTML.

### Spark icon — 0 % (placeholder only)

No spark icon in editor toolbar group; the `agi-workforce.chat` command is bound to a chord `cmd+shift+a` (`package.json:723-728`), not surfaced via toolbar `editor/title` menu. Anthropic ships a sparkle in the editor's top-right when a file is open (`anthropic-claude-suite-may-2026.md:462`). **Effort:** 0.5 d to add `editor/title` menu entry with `$(sparkle)` codicon + when-clause.

### Slash commands — 50 %

Ships 6 of 12 in §8.4: `/explain /fix /refactor /tests /docs /model` (`package.json:359-384`). Missing: `/plan /plugins /agents /mcp /init /team-onboarding`. (`/plan` is partially handled via the `agent.planMode` setting and the `agentModeProvider.setPlanMode` helper at `agentModeProvider.ts:148-158`, but is **not** registered as a `chatParticipants[].commands[]` entry — there is no `/plan` slash command on `@agi`.) **Effort:** 3 d to wire each missing command (UI + handler + tests).

### Diagnostic sharing — 70 %

`errorExplainerProvider.ts:55-104` collects diagnostics on current line and current selection, includes severity + source + code + message, sends to LLM. Anthropic's "Diagnostic sharing flows lint and syntax errors **automatically** into prompts" (`anthropic-claude-suite-may-2026.md:462`) — ours is opt-in via `agi-workforce.explainError` chord (`Cmd+Shift+Alt+X`), not background context injection on every prompt. The `contextBuilder.ts:214-238` does include diagnostics in the system prompt context block, so it is partially auto. **Effort:** 1 d to make explicit toggle for auto-inject diagnostics in the chat composer.

### Conversation tabs/windows — 25 %

Conversation history is shown in a TreeView (`conversationTreeProvider.ts`), opening any past conversation as a Markdown read-only tab. There is **no** parallel-session tab strip (V-04's `Untitled` tab beside `New Chat`), **no** ability to keep two threads live at once, **no** "Cmd/Ctrl+N" parallel session keybinding (declared `cmd+shift+alt+n` calls `newConversation` which **resets** rather than spawning). **Effort:** 5 d to implement parallel webview-panel-per-tab with state coordination.

### Account routing / tier UX — 80 %

`agi-workforce.showTierStatus` Quick Pick shows tier + token usage + dashboard link (`extension.ts:1208-1272`); upgrade flow opens `agiworkforce.com/pricing`. Missing: Anthropic-parity in-chat "Upgrade for 3x usage & faster responses" persistent card next to the composer (V-03 / V-04 right pane); only inline paywall card on 429 (`chatParticipant.ts:427-462`). **Effort:** 1 d for persistent in-sidebar tier banner.

### Bundled CLI — 0 %

No `claude` (or `agiworkforce`) binary bundled in the .vsix. Anthropic bundles its `claude` CLI internally (`anthropic-claude-suite-may-2026.md:441`). The settings document a desktop bridge (port 8787) and a Supabase pipeline, but no bundled binary inside `apps/extension-vscode/`. **Effort:** 2 d for binary packaging in vsce build + execution shim, but the desktop bridge is a deliberate alternative architecture, so this may not be a target.

### Inline completions in editor — 90 %

Working ghost-text via `provideInlineCompletionItems`, debounce, LRU cache (`inlineCompletionProvider.ts:81-258`). Missing: language-specific tuning, multi-line accept (`Tab` accepts whole completion; word-by-word `Cmd+→` not implemented), and accept-as-snippet behaviour. **Effort:** 1 d for partial-accept handler.

---

## Missing

### A. Sidebar chat panel features

- **Editor-canvas placement** — V-08 shows the chat in a primary editor tab. Settings `Claude Code: Preferred Location: panel | editor | sidebar` is absent.
- **Tab strip with `Untitled` / parallel chats** — V-04.
- **`Cmd+N` / `Cmd+T` for new chat tab** — current chord just resets.
- **Local / Web sessions split** — V-09's two-tab session list is absent (we have only the local TreeView).
- **Search sessions… text input** — V-09's session-list search is absent.
- **Persistent file pill in composer** — V-05's `📄 audit.toml` ambient-context indicator (we ship a Context Files tree view, but not an inline pill in the composer).
- **`Shift+Tab` mode-cycle chord** — V-05's `⌘ + tab to cycle`. Our `agent.mode` is changed only via Quick Pick.
- **Maroon "danger" tint on send button when bypass mode active** — V-05's color signal.

### B. Inline-edits and decorations

- **`vscode.diff`-URI side-by-side diff editor** — diff is rendered only as decorations + CodeLens, not in VS Code's native diff editor.
- **Inline ghost-text ranges via decorations for partial-edit suggestions** — `Edit automatically` mode equivalent.
- **`/init` CLAUDE.md generator** — the `/init` slash command from §5.2 (line 264) is not wired.

### C. Modes (Default / Auto-accept / Plan)

- **`Shift+Tab`-cycle keybinding** — see §A above.
- **Composer-footer mode pill** — modes only show in the status bar.
- **Per-conversation mode override visible in chat header** — sidebar tracks `_mode` but does not render it.
- **Modes-popover with descriptions** — V-05's floating popover layout.

### D. Effort slider

- **`auto` value** — missing from enum (`package.json:625-630` lists only `low|medium|high|max`).
- **Three-position visual slider** — current is Quick Pick.
- **Effort badge on send button or status bar.**

### E. Add-context menu (referent types)

- **`@symbol`** — pick a symbol from `vscode.languages.getDocumentSymbols`.
- **`@terminal`** — pipe last terminal execution output into prompt (we have explainTerminal, but not @terminal pick).
- **`@problems`** — auto-include all `Problems panel` entries.
- **`@debug`** — current debug session state.
- **`Cmd+Option+K` / `Alt+Ctrl+K`** keybinding to insert `@src/auth.ts#L1-99` reference — both chord and the line-range `#L1-99` syntax.
- **"Upload from computer" file dialog inside chat composer** — V-07 shows this; we route through `agi-workforce.attach-file` action, but the picker is `vscode.window.showOpenDialog` not an in-composer drop area.

### F. @claude / @agi chat participant

- **`isSticky: true`** is set (`package.json:358`), but no `references[]` parsing in handler — the `chatParticipant.ts` does not consume `request.references` so VS Code's native @-file picker passes empty content.
- **No `commands[].when` clauses** to gate slash commands on selection / open file (Anthropic disambiguates per editor state).

### G. Slash commands

- **`/plan`** — agent has `setPlanMode()` but no slash command.
- **`/plugins`** — no marketplace browsing in the chat surface.
- **`/agents`** — no subagent CRUD (Anthropic's Library + "Generate with Claude" wizard from §5.7).
- **`/mcp`** — no MCP server management (the `mcp.enabled` setting flips on integration but exposes no in-chat picker).
- **`/init`** — no CLAUDE.md generator (Anthropic ships this for project-bootstrap).
- **`/team-onboarding`** — Anthropic v2.1.101+; no analog.
- **`/security-review`, `/loop`, `/simplify`, `/debug`, `/batch`, `/claude-api`** — Claude Code CLI ships these (`anthropic-claude-suite-may-2026.md:264`); not present here.
- **`/effort low|medium|high|max|auto`** — modeling exists (`agent.effort`) but no in-chat slash route.
- **`/fast`, `/sandbox`, `/output-style`, `/keybindings`, `/color`, `/btw`** — none of these.
- **`/agents` Library tab Personal vs Project scope** — UX gap.

### H. Inline completions

- **Multi-line ghost-text** — current returns at most one line of fenced content (`extractCompletionText` strips to first line; `inlineCompletionProvider.ts:62-79`).
- **Tab-to-accept-word** vs Tab-to-accept-all granularity.
- **Auto-pause when typing fast > N chars/s** — debounce only, no rate-of-typing throttle.
- **Provider routing for completions** — uses `chatCompletion()` end-point, not a dedicated `/v1/completions` low-latency path.

### I. Code lens

- Lens is wired for functions/classes (`codeLensProvider.ts:115-181`), but missing: **per-line diff lens** for unstaged changes, **per-test-failure lens** that opens explainError, and **per-import lens** for "Suggest refactor of imports". Anthropic likely just exposes Explain / Fix / Refactor lenses (per `§8.5`).

### J. Hover provider

- Default `hoverEnabled: false` (`package.json:573-577`); off by default. Anthropic's hover is implicit in the chat panel's symbol picker.
- No type-info or doc-string fetch (vendored from `vscode.languages.getHover`) shown in our hover.

### K. Spark icon

- **No `media/spark.svg` or codicon `$(sparkle)` in `editor/title` menu group**. Only registered in the Quick Pick `Best (auto)` label and `agi-workforce.openActionSheet` items.

### L. Diagnostic sharing

- **No "auto-inject all diagnostics on every prompt" toggle** — currently context builder only injects warnings + errors for active file (`contextBuilder.ts:218-238`); no global Problems-panel aggregation.
- **No share-with-LLM-on-Save trigger** (Anthropic's diagnostic-share is automatic; ours requires explicit `explainError` chord).

### M. WSL command setting

- **`agiWorkforce.wslCommand`** — absent. Anthropic ships "WSL-specific Claude command (`wsl -d Ubuntu -- bash -lic "claude"`)" per `anthropic-claude-suite-may-2026.md:466`. Our extension has zero WSL handling — `terminalProvider.ts` always uses the integrated terminal which on WSL would already inherit the host platform but does not route through `wsl.exe -d` for command execution.
- **WSL-aware path translation** for `/`-vs-`\` round-tripping is also absent.

### N. `Cmd+Esc` / `Ctrl+Esc` launch

- **Default keybinding `Cmd+Esc` / `Ctrl+Esc`** for `agi-workforce.chat` — currently bound to `Cmd+Shift+A` (`package.json:725-728`), which differs from Anthropic's documented chord.
- **`Cmd+Enter` / `Ctrl+Enter` submit** — Anthropic's `Use Ctrl Enter To Send` setting is absent in our manifest. Our submit chord is the webview-controlled Enter (newline) vs Shift+Enter, which is the inverse of Anthropic's.

### O. `Cmd+Option+K` file references

- **`Cmd+Option+K` / `Alt+Ctrl+K` chord** — absent.
- **`@src/auth.ts#L1-99` line-range syntax** — `@`-mention dropdown only inserts `@filename`, no line-range UX. The chat participant references API also doesn't render line ranges.

### P. Bundled CLI

- **No bundled `agiworkforce` or `claude` binary inside the .vsix** — Anthropic ships the binary in their package; ours relies on the desktop app bridge or the cloud API.
- **No "Claude command path override" setting** (`Claude Code: Claude Process Wrapper` per `ui-05-claude-extensions.md:187`).
- **No "Enable automatic updates" toggle for the bundled binary.**
- **No "Disable Login Prompt" setting** for headless bundled-CLI usage.

### Q. Native settings parity

- **`Autosave` toggle** before agent reads/writes (V-04's `Claude Code: Autosave` default-checked) — absent.
- **`Hide Onboarding`** — absent (we show a one-time `checkFirstRun` notice but there is no checklist + hide setting).
- **`Initial Permission Mode`** dropdown — absent. Our `agent.mode` is the closest analog but defaults to `auto` not `default`.
- **`Preferred Location`** dropdown (panel/editor/sidebar) — absent.
- **`Respect Git Ignore`** — absent. `workspaceIndexer.ts:135` excludes `node_modules/dist/build/.next/target` hardcoded; doesn't read `.gitignore`.
- **`Use Python Environment`** — absent.
- **`Use Terminal`** legacy fallback — absent.
- **`Suppress notification for Claude command not found`** — absent.

### R. Account routing extras

- **In-chat "3x usage" banner** card — V-03 / V-04's persistent right-side entitlement card is absent in our sidebar.
- **`Generate test case`** Quick Pick action — Anthropic's "Filter actions…" surface includes account-billing actions; ours stops at `Account & usage…` placeholder.

### S. Other gaps

- **Sessions popover with `Local | Web` tabs** — V-09; our History tree only shows the local store.
- **Quick Mode bundle** — the Chrome ext's "Quick mode" (Haiku + Act-without-asking auto-toggle) is mirrored in V-06 as `Toggle fast mode (Opus 4.6 only)`; absent here.
- **`Convert to task` recurring-schedule action** — absent.
- **In-chat `Rewind` last-AI-turn button** — `agi-workforce.rewindLast` is wired but **stubbed** to `"coming soon in a future release"` (`extension.ts:1043-1047`); the `Rewind` action in `openActionSheet` (line 1067) routes here.
- **MCP Apps live UI rendering in chat** (Amplitude / Asana / Box / Canva / Clay / Figma / Hex / Monday / Slack / Salesforce launch partners from §1.4) — all absent.
- **Dispatch (mobile→desktop)** — not relevant to a VS Code extension target.
- **Voice mode** in extension chat — absent.
- **Per-conversation system-prompt + style override** — Anthropic's Projects feature; absent.

---

## Per-axis percentage

| Axis                   | Have % | Notes                                                                                                                 |
| ---------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Sidebar chat           | 75     | webview chat; missing tab strip + editor-canvas + Local/Web tabs + composer file pill                                 |
| Inline ops (diffs)     | 65     | accept/reject + CodeLens shipped; no `vscode.diff` route, no batch-apply UX                                           |
| Modes (4-state)        | 70     | enum + Quick Pick; missing Shift+Tab chord, composer pill, danger color                                               |
| Effort slider          | 60     | `low/med/high/max`; no `auto`; Quick Pick not slider                                                                  |
| @-mentions             | 35     | sidebar @-file dropdown only; no @symbol/@terminal/@problems/@debug; no `Cmd+Option+K` line-ranges                    |
| Slash commands         | 50     | 6 of 12 (`/explain /fix /refactor /tests /docs /model`); missing `/plan /plugins /agents /mcp /init /team-onboarding` |
| Code lens              | 75     | function/class lenses; missing per-line/import lenses                                                                 |
| Inline completions     | 80     | ghost-text + cache + paywall; missing multi-line, tab-by-word, dedicated low-latency endpoint                         |
| Diagnostic sharing     | 65     | manual command + auto in context; not auto-injected on every prompt                                                   |
| WSL                    | 5      | no `wslCommand` setting, no path translation                                                                          |
| Bundled CLI            | 10     | desktop-bridge architectural alternative; no `claude`-binary in .vsix                                                 |
| Account routing / tier | 75     | tier resolution chain + paywall card; missing in-chat persistent banner                                               |

**Weighted average (12 axes, equal weight):** **(75+65+70+60+35+50+75+80+65+5+10+75)/12 = 55.4 %**

---

## Surface percentage

**Overall surface parity: ~55 %**

Headline gaps:

1. **No multi-tab parallel chat** — V-04's `New Chat | Untitled` tab strip and the `Cmd+N`-spawns-new-tab UX is the single biggest discoverability gap.
2. **No editor-canvas chat placement** — V-08's tertiary location.
3. **No bundled CLI** — by-design alternative architecture (desktop bridge + cloud API) but a marketing gap vs Anthropic's "Claude Code for VS Code: Harness the power of Claude Code without leaving your IDE."
4. **Slash command surface 50 %** — 6 of 12.
5. **WSL is a 5 % gap** — entirely unbuilt.
6. **`@`-mention referent-type taxonomy gap** — missing 4 of 5 referent types (Selection / Terminal / Problem / Debug).
7. **`Cmd+Esc` chord** — wrong default chord; we ship `Cmd+Shift+A`.
8. **`Cmd+Option+K` line-range references** — entirely absent.

Strengths over Anthropic:

- **10+ provider catalog vs Claude-only** (`package.json:673-691`); Pro+ provider-switch guard (`providerSwitchGuard.ts:97-116`); custom BYO endpoint.
- **Local / BYOK / Hobby / Pro / Pro+ / Max tier ladder** vs Anthropic's flat Pro/Max.
- **Subsystem health status bar** — visibility we have that Anthropic does not surface.
- **Token Counter status bar with cost estimation** — Anthropic has no such surface.
- **Workspace Trust gating** is more aggressive than Anthropic's published settings (8 restricted configurations).

---

## Effort to reach 100 %

Ordering by effort (Anthropic-parity-first; provider-multi work is already done so it scores 0 d):

| Bucket                                                                               | Days | Cumulative |
| ------------------------------------------------------------------------------------ | ---- | ---------- |
| `Cmd+Esc` chord rebind + `Use Ctrl Enter To Send` setting                            | 0.5  | 0.5        |
| Spark icon in `editor/title` menu                                                    | 0.5  | 1.0        |
| `auto` enum value on `agent.effort`                                                  | 0.25 | 1.25       |
| `Shift+Tab` mode-cycle keybinding                                                    | 0.5  | 1.75       |
| Composer-footer mode pill + danger tint                                              | 1.0  | 2.75       |
| Composer-footer effort slider (3 dots)                                               | 1.0  | 3.75       |
| `agiWorkforce.wslCommand` setting + path translation                                 | 2.0  | 5.75       |
| `Respect Git Ignore` + `Hide Onboarding` + `Autosave` + `Initial Permission Mode`    | 1.5  | 7.25       |
| Wire `@symbol` referent type                                                         | 1.0  | 8.25       |
| Wire `@terminal` / `@problems` / `@debug` referent types                             | 2.0  | 10.25      |
| `Cmd+Option+K` chord + `@src/auth.ts#L1-99` line-range UX                            | 1.5  | 11.75      |
| `vscode.diff` URI integration for diff editor                                        | 2.0  | 13.75      |
| Slash commands `/plan` and `/init`                                                   | 2.0  | 15.75      |
| Slash commands `/agents` (Library + Personal/Project scope)                          | 4.0  | 19.75      |
| Slash command `/mcp` (server picker + add/remove + status)                           | 3.0  | 22.75      |
| Slash command `/plugins` (marketplace browser)                                       | 3.0  | 25.75      |
| Slash command `/team-onboarding`                                                     | 1.5  | 27.25      |
| Slash commands `/security-review /loop /simplify /debug /batch /claude-api`          | 3.0  | 30.25      |
| In-chat persistent tier banner                                                       | 1.0  | 31.25      |
| Local / Web sessions tabs in History popover                                         | 2.0  | 33.25      |
| `Search sessions…` input                                                             | 0.5  | 33.75      |
| Editor-canvas placement (`Preferred Location: editor`) + dynamic webview re-host     | 3.0  | 36.75      |
| Multi-tab parallel chat in sidebar (`Cmd+N` spawns parallel tab, state coordination) | 5.0  | 41.75      |
| Persistent file pill in composer                                                     | 1.0  | 42.75      |
| Real `Rewind` last-AI-turn implementation                                            | 2.0  | 44.75      |
| Multi-line inline completions + tab-by-word accept                                   | 1.5  | 46.25      |
| Auto-inject diagnostics-on-prompt toggle                                             | 1.0  | 47.25      |
| Bundled-CLI binary packaging (vsce + binary shim)                                    | 4.0  | 51.25      |
| Quick Mode (Haiku + auto-act bundle preset)                                          | 1.0  | 52.25      |
| MCP Apps live UI rendering in chat (10 launch partners)                              | 12.0 | 64.25      |
| Per-conversation system-prompt + style override (Projects)                           | 3.0  | 67.25      |

**Total to 100 %: ~67 engineer-days (~3 months at 1 FTE; ~6 weeks at 2 FTE).**

Pragmatic 80 %-parity target excluding bundled-CLI + MCP-Apps + Projects: **~50 days (~2.5 months at 1 FTE; ~5 weeks at 2 FTE)**.

Pragmatic 70 %-parity target (skip slash-command full set + Local/Web tabs + multi-tab parallel chat): **~25 days (~5 weeks at 1 FTE; ~2.5 weeks at 2 FTE)**.
