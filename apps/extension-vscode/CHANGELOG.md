# Changelog

All notable changes to the AGI Workforce VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] - Codebase Audit Remediation (2026-03-25)

Full-spectrum audit: 47 issues identified (7 Critical, 11 High, 16 Medium, 13 Low/Info).

## [FIX-001] - Unbounded patch snapshot store (memory leak / DoS)

- **Files:** `src/services/patchEngine.ts`
- **Category:** Performance / Security
- **Severity:** Critical
- **What changed:** Added LRU eviction to `batchSnapshotStore` (max 50 entries). Previously the global Map grew without bounds.
- **Why:** Each batch stores full file snapshots. Without eviction, long agent sessions could cause unbounded memory growth.

## [FIX-002] - Unhandled promise rejection in desktop bridge reconnect

- **Files:** `src/services/desktopBridge.ts`
- **Category:** Bug
- **Severity:** Critical
- **What changed:** Wrapped `void this.connect()` in reconnect timer and health loop with `.catch()` error handlers.
- **Why:** If `connect()` threw, the error was silently swallowed as an unhandled promise rejection, potentially crashing the extension host.

## [FIX-003] - Race condition in chatCompletion() double-settle

- **Files:** `src/utils/api.ts`
- **Category:** Bug
- **Severity:** High
- **What changed:** Added `settled` guard flag to prevent `resolve` and `reject` from being called after the promise has already settled.
- **Why:** `streamChatCompletion().catch(reject)` could fire `reject` while `onDone` subsequently fires `resolve`, causing double-settlement.

## [FIX-004] - Missing cancellation check before onDone callback

- **Files:** `src/utils/api.ts`
- **Category:** Bug
- **Severity:** Medium
- **What changed:** Added `cancellationToken.isCancellationRequested` check before calling `callbacks.onDone()` and recording metrics.
- **Why:** After streaming completes, `onDone()` was called even if the request was cancelled, recording phantom metrics.

## [FIX-005] - Duplicate MODEL_CONTEXT_LIMITS (DRY violation)

- **Files:** `src/services/modelConstants.ts` (new), `src/services/tokenCounter.ts`, `src/services/contextBudget.ts`
- **Category:** Architecture / Code Quality
- **Severity:** High
- **What changed:** Extracted shared `MODEL_CONTEXT_LIMITS` and `DEFAULT_CONTEXT_LIMIT` into `src/services/modelConstants.ts`. Both consumers now import from the shared module.
- **Why:** Identical 17-entry map duplicated in two files. Adding/updating a model required changes in multiple places with risk of inconsistency.

## [FIX-006] - WebSocket send race condition

- **Files:** `src/services/desktopBridge.ts`
- **Category:** Bug
- **Severity:** High
- **What changed:** Captured `this._ws` in a local variable before null-check and send to prevent TOCTOU race.
- **Why:** Between the `!== undefined` check and `.send()`, another async handler could set `this._ws` to undefined via `_closeWebSocket()`.

## [FIX-007] - File watcher leak on re-registration

- **Files:** `src/services/workspaceIndexer.ts`
- **Category:** Bug / Resource Leak
- **Severity:** High
- **What changed:** Added disposal of previous `_fileWatcher` before creating a new one in `registerFileWatcher()`.
- **Why:** If `registerFileWatcher()` was called twice (e.g., on config change), the previous watcher was never disposed, accumulating OS file handles.

## [FIX-008] - Unhandled clipboard promise in sidebar webview

- **Files:** `src/providers/sidebarProvider.ts`
- **Category:** Bug
- **Severity:** High
- **What changed:** Added `.catch()` handler to `navigator.clipboard.writeText()` in the webview JavaScript.
- **Why:** Clipboard access can be denied by CSP or user permissions. The unhandled rejection would surface as a console error.

## [FIX-009] - Dead code removal: \_getBridgeEndpoint, \_pingApi, httpsGet

- **Files:** `src/utils/api.ts`
- **Category:** Dead Code
- **Severity:** High
- **What changed:** Removed three unused functions: `_getBridgeEndpoint()` (never called), `_pingApi()` (never called, had CancellationTokenSource leak), and `httpsGet()` (only caller was `_pingApi`).
- **Why:** Dead code increases bundle size, confuses readers about API endpoint strategy, and `_pingApi` contained a resource leak if it were ever called.

## [FIX-010] - Redundant isNaN check in diagnosticsProvider

- **Files:** `src/providers/diagnosticsProvider.ts`
- **Category:** Code Quality / Logic Error
- **Severity:** Medium
- **What changed:** Removed redundant `isNaN(lineOffset) ? 0 : lineOffset` ternary inside an `if (!isNaN(lineOffset))` block where the condition was already guaranteed.
- **Why:** The ternary always evaluated to `lineOffset` since the outer guard already verified it was not NaN. Dead branch.

## [FIX-011] - Consolidate COST_PER_MILLION pricing tables (DRY)

- **Files:** `src/services/modelConstants.ts`, `src/services/tokenCounter.ts`, `src/services/modelMetrics.ts`
- **Category:** Architecture / Code Quality
- **Severity:** High
- **What changed:** Moved cost-per-million data from both `tokenCounter.ts` and `modelMetrics.ts` into `modelConstants.ts` as `MODEL_COST_RATES` (input/output split) and `MODEL_COST_BLENDED` (computed average). Both consumers now import from the shared module.
- **Why:** Cost tables were duplicated with different schemas (input/output vs blended). Adding a model required updating multiple files with risk of inconsistency.

## [FIX-012] - Delete unused vscode.mock.ts test file

- **Files:** `src/__tests__/vscode.mock.ts` (deleted)
- **Category:** Dead Code
- **Severity:** Low
- **What changed:** Removed `vscode.mock.ts` (188 lines) which was never imported by any test. All tests use the main `__mocks__/vscode.ts` mock via vitest alias.
- **Why:** Maintenance burden — maintainers could update the wrong mock file.

## [FIX-013] - Rename ChatMessage → LlmChatMessage across extension

- **Files:** `src/utils/api.ts`, `src/extension.ts`, `src/providers/chatParticipant.ts`, `src/providers/agentModeProvider.ts`, `src/providers/sidebarProvider.ts`, `src/providers/diagnosticsProvider.ts`, `src/providers/terminalProvider.ts`, `src/providers/errorExplainerProvider.ts`, `src/providers/inlineCompletionProvider.ts`
- **Category:** Code Quality / Naming
- **Severity:** Medium
- **What changed:** Removed the deprecated `ChatMessage` type alias from `api.ts` and replaced all 23 occurrences across 9 source files with the canonical `LlmChatMessage` interface. Test file `api.test.ts` uses a locally-scoped type and was not affected.
- **Why:** `ChatMessage` collided with the canonical `ChatMessage` from `@agiworkforce/types` (a persisted UI message with id, conversationId, timestamps). `LlmChatMessage` clearly communicates this is a wire-format message for the OpenAI-compatible API endpoint.

## [FIX-015] - Inline completion cancellation listener leak

- **Files:** `src/providers/inlineCompletionProvider.ts`
- **Category:** Resource Leak / Performance
- **Severity:** High
- **What changed:** Each debounce cycle now stores and disposes the `token.onCancellationRequested` listener. Previously, every call to `provideInlineCompletionItems` registered a new listener that was never disposed, causing O(n) listener accumulation during rapid typing.
- **Why:** Typing 100 characters registered 100 cancellation listeners on the same token. When cancelled, all 100 fired — wasting CPU and leaking memory for the session.

## [FIX-016] - Agent mode CancellationTokenSource leak on error

- **Files:** `src/providers/agentModeProvider.ts`
- **Category:** Resource Leak
- **Severity:** High
- **What changed:** Wrapped `chatCompletion()` calls in both `handleUserMessage` and `handleAgentContinue` with try/finally to ensure `cancelSource.dispose()` is always called, even when the LLM call throws.
- **Why:** If `chatCompletion()` threw (network error, API error), `cancelSource.dispose()` on the next line was skipped. Long agent sessions with intermittent failures accumulated undisposed token sources.

## [FIX-017] - SSE streaming buffer overflow protection

- **Files:** `src/utils/api.ts`
- **Category:** Security / Reliability
- **Severity:** High
- **What changed:** Added a 1 MB max buffer guard to the SSE line parser in `httpsPostStream`. If the buffer exceeds this limit (malformed stream with no newlines), the request is destroyed and an error is thrown.
- **Why:** A pathological SSE stream sending megabytes without a newline delimiter would accumulate unbounded memory in the buffer variable.

## [FIX-018] - Workspace indexer concurrent update serialization

- **Files:** `src/services/workspaceIndexer.ts`
- **Category:** Bug / Data Integrity
- **Severity:** High
- **What changed:** Added an `_updateQueue` promise chain to serialize `_reindexFile` and `_removeFile` calls. Previously, rapid file changes (e.g., `pnpm install` creating hundreds of files) triggered concurrent `workspaceState.update()` calls, risking lost updates.
- **Why:** VS Code's `workspaceState` is not designed for concurrent writes. Parallel updates from file watcher events could corrupt the index cache.

## [FIX-019] - Context diagnostics prioritize errors/warnings

- **Files:** `src/services/contextBuilder.ts`
- **Category:** Performance / Quality
- **Severity:** Medium
- **What changed:** `getDiagnosticsContext()` now filters to `Error` and `Warning` severity before slicing to `MAX_DIAGNOSTICS`. Previously, the first 20 diagnostics of any severity were included, potentially wasting context budget on hints and informational messages.
- **Why:** In strict TypeScript projects with hundreds of diagnostics, the 20-item cap could be filled entirely with info/hints, crowding out actual errors from the LLM context.

## [FIX-020] - Patch engine: new file creation marked medium confidence

- **Files:** `src/services/patchEngine.ts`
- **Category:** Reliability / UX
- **Severity:** Medium
- **What changed:** Files created by the patch engine (empty search block = new file) are now assigned `'medium'` confidence instead of `'high'`. The diff decoration provider shows a warning icon for medium-confidence changes.
- **Why:** New files are 100% LLM-generated with no existing code to compare against. Marking them 'high' confidence (same as exact-match edits on existing code) gave false assurance.

## [FIX-021] - Model metrics persist failure handling

- **Files:** `src/services/modelMetrics.ts`
- **Category:** Reliability
- **Severity:** Medium
- **What changed:** Wrapped `globalState.update()` in `Promise.resolve().catch()` to handle Thenable rejections from storage write failures. Previously, a disk or permission error during persist was an unhandled rejection.
- **Why:** VS Code's `globalState.update()` returns `Thenable` (not `Promise`), so `.catch()` required wrapping in `Promise.resolve()`. Silent failures could crash the extension host.

## [FIX-022] - Expand language inference map for context builder

- **Files:** `src/services/contextBuilder.ts`
- **Category:** Code Quality / Completeness
- **Severity:** Low
- **What changed:** Added 15 missing file extensions to `_inferLanguageFromUri`: `.mts`, `.cts`, `.mjs`, `.cjs`, `.hpp`, `.hxx`, `.vue`, `.svelte`, `.scala`, `.groovy`, `.lua`, `.r`, `.dart`, `.zig`, `.tf`, `.dockerfile`, `.zsh`, `.xml`, `.svg`.
- **Why:** Missing extensions returned the raw extension as the language ID (e.g., `mts` instead of `typescript`), confusing the LLM when formatting code blocks in context.

## [FIX-023] - .vscodeignore missing competitive-research.md and docs

- **Files:** `.vscodeignore`
- **Category:** Build / Distribution
- **Severity:** Medium
- **What changed:** Added `competitive-research.md`, `CHANGELOG.md`, and `CLAUDE.md` to `.vscodeignore`. The existing entry for `COMPETITIVE_VSCODE_RESEARCH.md` (uppercase) didn't match the actual file `competitive-research.md` (lowercase).
- **Why:** Without this fix, competitive analysis notes, the changelog, and CLAUDE.md were bundled into the published `.vsix` — wasting extension download size with files irrelevant to users.

## [FIX-014] - Replace terminal double-cast with runtime property check

- **Files:** `src/providers/terminalProvider.ts`
- **Category:** Code Quality / Type Safety
- **Severity:** Low
- **What changed:** Replaced `(terminal as unknown as TerminalWithShellIntegration).shellIntegration` with a `'shellIntegration' in terminal` runtime check. Removed the now-unused `TerminalWithShellIntegration` interface.
- **Why:** The `as unknown as` double-cast bypassed all type checking and would mask errors if the VS Code API shape changed. A runtime `in` check is both safer and self-documenting.

## [0.2.0] - 2026-03-17

### Added

- Workspace-aware context in every chat prompt (diagnostics, git status, open files, structure)
- @filename references in sidebar chat with fuzzy-matching dropdown and keyboard navigation
- Per-file accept/reject for agent mode edits (replaces batch-only Apply All)
- New Conversation command (Cmd+Shift+Alt+N) with sidebar reset
- Share Diagnostics button in sidebar header for one-click error analysis
- Model Performance Dashboard (request count, avg latency, tokens, estimated cost per model)
- Model metrics tracking persisted across sessions

### Changed

- Sidebar system prompt now includes full workspace context from ContextBuilder
- Chat participant (@agi) system prompt enriched with diagnostics, git, and workspace structure
- Agent mode includes rich context alongside WorkspaceIndexer output

## [0.1.0] - 2026-02-27

### Added

- @agi chat participant with /explain, /fix, /refactor, /tests, /docs, /model commands
- Sidebar chat panel with AGI Workforce dark theme
- Agent mode with multi-file editing, diff preview, and batch undo
- Inline completions (ghost-text, opt-in)
- CodeLens provider (Ask AI, Tests, Docs above functions)
- Code review with AI-powered diagnostics
- Terminal integration (run, explain, suggest commands)
- Error explainer and Ask About Code features
- Desktop bridge for AGI Workforce desktop app integration
- Support for 15+ LLM models (GPT, Claude, Gemini, DeepSeek, Perplexity, and more)
- Smart auto-routing: auto-economy, auto-balanced, auto-premium
- SSE streaming with cancellation support
- Fallback to VS Code built-in LM when API unavailable
- SecretStorage-based API key management
- Status bar model indicator
- Conversation history with tree view
