# AGI VS Code Extension — Volume 14 — Context Management

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and the real surface paths `apps/extension-vscode/src/data/contextBuilder.ts`, `.../data/contextBudget.ts`, `.../data/tokenCounter.ts`, `.../data/conversationStore.ts`, `.../data/projectInstructions.ts`, `.../features/trees/contextPanelProvider.ts`, `.../providers/diagnosticsProvider.ts`, `.../features/model-picker/modelConstants.ts`, `.../features/desktop-bridge/desktopBridge.ts`, `.../core/telemetry.ts`, and `packages/contracts/types/src/models.json`.

## Overview & stance

Context management is how the extension decides _what_ text is sent to a model and _how much_. On an IDE surface this is safety-critical: the extension reads the user's real source, git state, diagnostics, and terminal output, so context assembly is also a **trust-boundary** operation. AGI VS Code runs three modes — **Local**, **BYOK** (Desktop/CLI/VS Code only), and **Managed Cloud** — with explicit selection and a visible provider label. Context is always **workspace/task-scoped**: it is never automatically synced into Web/Mobile/Desktop app chat, and any handoff to app chat must be explicit and redacted (`AGENTS.md`, `docs/products/README.md`). A Local→BYOK fork must run secret scan, payload preview, and consent before context leaves the machine. Redaction already runs on the highest-risk slice — git diffs pass through `redactSecrets` (`src/core/telemetry.ts:50`) before inclusion in `contextBuilder.ts`. This volume covers the six context layers and the budget/compression machinery that keeps them inside model limits.

## Repository Context

The extension gathers workspace-level context in `ContextBuilder` (`src/data/contextBuilder.ts`). `getWorkspaceStructure()` emits a bounded file tree (`MAX_TREE_ENTRIES = 30`, `MAX_FILE_TREE_CHARS = 1500`), and `getGitContext()` includes a redacted, truncated diff summary (`MAX_GIT_DIFF_CHARS = 2000`). Project instruction files — `CLAUDE.md` / `AGENTS.md` / `.cursorrules` — are loaded by `src/data/projectInstructions.ts` (max 2 files, 8 KB each, wrapped in `<project_instructions>` tags as data-only, never traversing `node_modules`/`.git`). **✅ Built** for tree + git + instruction ingestion. A semantic repository index (embeddings, symbol graph, ranked retrieval across the whole repo) is **🔭 Planned** — today repository context is heuristic breadth-first, not ranked relevance.

- Requirement: repository context MUST stay under its char caps and MUST redact secrets before any provider send in any mode.
- Requirement: instruction-file content MUST be labeled data-only so it cannot inject tool/agent commands.

## File Context

Explicit and implicit file selection is handled by the **Context Files** tree (`src/features/trees/contextPanelProvider.ts`), which shows a `pinned` group and an `auto` group (open tabs). Commands `agi-workforce.addToContext`, `removeFromContext`, `clearContext`, `refreshContext`, `mentionFileInChat`, and `mentionFileFromProject` (`package.json` `contributes.commands`) let the user curate the set; `getOpenFilesContext()` (`contextBuilder.ts:98`) enumerates open editors with relative path and language id. **✅ Built.** Baseline parity with Claude Code / Codex `@`-file references is partial: `@agi` chat participant file mentions exist, but ranked multi-file retrieval and directory-scope `@` references are **🔭 Planned**.

- Requirement: pinned files persist per workspace; the tree MUST show which files are actually in the payload, not a superset.
- Requirement: file context MUST NOT silently pull files outside the trusted workspace root (mirrors the bridge's workspace-boundary check in `desktopBridge.ts:806-822`).

## Editor Context — selection/diagnostics

`getActiveFileContext()` (`contextBuilder.ts`) captures the active document, selected text (`MAX_SELECTION_CHARS = 3000`), cursor line/character, and language id. `getDiagnosticsContext()` maps VS Code diagnostics to a bounded list (`MAX_DIAGNOSTICS = 20`) with severity, message, and location. The AI review path (`src/providers/diagnosticsProvider.ts`) writes findings back into a dedicated `agiWorkforce` `DiagnosticCollection`. **✅ Built.** This matches the Claude/Codex "editor context + diagnostics feed the model" baseline. Live diagnostics-driven quick-fix loops with automatic re-context after an edit are **🔭 Planned**.

- Requirement: selection over the cap MUST be truncated with a visible `... (truncated)` marker, never silently dropped.
- Requirement: diagnostics context MUST reflect the current editor, not a stale snapshot.

## Conversation Context

Conversation history is stored in `src/data/conversationStore.ts` using VS Code `globalState` — **device-scoped, never synced** (`MAX_CONVERSATIONS = 50`, oldest pruned). The History tree (`src/features/trees/conversationTreeProvider.ts`) and the `@agi` chat participant read from it. **✅ Built.** This deliberately diverges from the app surfaces: per canon, VS Code stays workspace/task-scoped and does **not** join the Neon delta-sync loop (`apps/web/app/api/{chat,memory,projects}/sync`). Any promotion of a conversation into synced app chat is an explicit, redacted handoff — **🔭 Planned** as a wired feature.

- Requirement: conversation context MUST NOT auto-sync to cloud/app chat; export is opt-in and redacted.
- Requirement: prior turns included in a new request MUST count against the token budget below.

## Token Budget

`src/data/contextBudget.ts` computes a model-aware budget: it reads the selected model's window from `MODEL_CONTEXT_LIMITS` (`src/features/model-picker/modelConstants.ts`, `DEFAULT_CONTEXT_LIMIT` fallback), allocates **3% (chat) / 5% (agent)** by default, honors an `agiWorkforce.contextBudgetPercent` override clamped to 1–20%, and reserves ~40% of the char budget for the indexer section. `src/data/tokenCounter.ts` tracks session prompt/completion tokens and an estimated cost in the status bar (`agi-workforce.showTokenBreakdown`, `agi-workforce.resetTokenCounter`). **🟡 Partial:** budgeting uses a `CHARS_PER_TOKEN` (4-chars/token) heuristic, not per-provider tokenizers, and `agiWorkforce.contextBudgetPercent` is read in code but **not declared** in `package.json` `contributes.configuration` — users cannot set it from Settings UI yet. Model-window figures MUST stay sourced from `packages/contracts/types/src/models.json` (via `modelConstants.ts`); do not hardcode new model IDs.

- Requirement: the budget MUST recompute when the active model changes.
- Requirement: over-budget assembly MUST drop lowest-priority sections (workspace tree first, pinned selection last), not the user's prompt.

## Context Compression

Today "compression" is bounded truncation and pruning, not semantic summarization: char caps in `contextBuilder.ts`, conversation pruning in `conversationStore.ts`, agent file-read caps (`src/providers/agentMode/agentLoop.ts` `FILE_READ_CAP`), and terminal-output truncation (`src/providers/terminalProvider.ts`). **🟡 Partial.** Real compression — mid-conversation compaction, relevance-ranked summarization of old turns, and dedup across pinned/auto/diagnostics sections — is **🔭 Planned**. When built, summaries MUST be labeled as derived context and MUST re-run secret scan before any BYOK/Cloud send.

- Requirement: any summarizer MUST be deterministic about what it discarded (show a "compacted N turns" marker).

## Repository map

- `apps/extension-vscode/src/data/contextBuilder.ts` — workspace/git/diagnostics/selection assembly.
- `apps/extension-vscode/src/data/contextBudget.ts`, `.../data/tokenCounter.ts` — budget + session token tracking.
- `apps/extension-vscode/src/data/conversationStore.ts` — device-scoped conversation history.
- `apps/extension-vscode/src/data/projectInstructions.ts` — CLAUDE.md/AGENTS.md/.cursorrules ingestion.
- `apps/extension-vscode/src/features/trees/contextPanelProvider.ts`, `.../conversationTreeProvider.ts` — Context Files + History trees.
- `apps/extension-vscode/src/providers/diagnosticsProvider.ts` — AI review → diagnostics.
- `apps/extension-vscode/src/features/model-picker/modelConstants.ts` — context limits/cost (sync target: `packages/contracts/types/src/models.json`).
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — workspace-boundary + redacted bridge handoff.

## Competitor notes

Claude Code and Codex IDE extensions assemble editor context, `@`-file references, diagnostics, and inline diff review, then offer cloud-run handoff. AGI matches the local context layers and diverges deliberately: **multi-provider** budgets keyed to whichever model is selected (from `models.json`), **BYOK** allowed here (never on Web/Mobile), **per-surface trust** so IDE context stays workspace-scoped and never auto-syncs to app chat, and **local-first** history in `globalState`. Remote control of an editor session from phone/web (Claude Code `/remote-control` parity) is **🔭 Planned**.

## Acceptance / Definition of Done

Context management is production-ready when every layer respects caps, the budget is model-accurate, and no context crosses a trust boundary without consent + redaction + a visible provider label.

Build:

- [ ] Budget recomputes on model change; token counter and `showTokenBreakdown` reflect the active session.
- [ ] `agiWorkforce.contextBudgetPercent` is declared in `package.json` or the code override is removed (close the 🟡 gap).

Trust:

- [ ] No context layer auto-syncs to cloud/app chat; Local→BYOK handoff runs secret scan + payload preview + consent.
- [ ] Provider label is visible whenever context is sent.

Security:

- [ ] Git diffs and instruction/summary content pass `redactSecrets`; file context stays inside the trusted workspace root.

## Anti-patterns

- Auto-syncing IDE conversation/context into Web/Mobile/Desktop app chat (trust-boundary violation).
- Silently routing Local context to BYOK/Cloud without fork consent, secret scan, or provider label.
- Claiming a semantic repo index, tokenizer-exact budgets, or conversation summarization as shipped — they are 🔭/🟡.
- Hardcoding model IDs or context-window numbers instead of sourcing from `packages/contracts/types/src/models.json`.
- Referencing removed tiers (`hobby`, `pro_plus`, "Plus", "Hobby") or credit top-ups; use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise. Note: `package.json` `agiWorkforce.tier` still enumerates `hobby`/`pro_plus` (🟡 catalog-reconciliation gap).
- Reintroducing Supabase or `middleware.ts`; the stack is Clerk + Neon + Stripe with Next.js `proxy.ts`.
