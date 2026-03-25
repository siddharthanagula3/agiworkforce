# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AGI Workforce VS Code extension — a model-agnostic AI coding assistant that supports 15+ LLMs (Claude, GPT, Gemini, DeepSeek, Perplexity, Grok, etc.) with smart auto-routing. Part of the AGI Workforce monorepo at `apps/extension-vscode/`.

## Build & Dev Commands

```bash
pnpm compile                    # esbuild → out/extension.js (dev, with sourcemaps)
pnpm watch                      # esbuild watch mode
pnpm package                    # production build + VSIX package
pnpm lint                       # ESLint with caching
pnpm typecheck                  # tsc --noEmit (strict mode)
pnpm test                       # vitest run (all tests)
pnpm test -- src/__tests__/api.test.ts  # single test file
```

Build is esbuild (not tsc). Output: `out/extension.js` — single CJS bundle. `vscode` is external (provided by VS Code at runtime). Target: Node 18.

## Architecture

### Entry Point & Activation

`src/extension.ts` → `activate()` — activated on `onStartupFinished`. Registers everything in this order:

1. Telemetry + model metrics (non-critical, wrapped in try/catch)
2. Desktop bridge (WebSocket to desktop app at `ws://127.0.0.1:8787/ws`)
3. Conversation store + tree provider (globalState persistence, max 50 conversations)
4. **@agi chat participant** — VS Code Chat panel integration with slash commands
5. **Sidebar webview** — self-contained chat UI in activity bar (retainContextWhenHidden)
6. Context panel tree view (pinned files injected into prompts)
7. Workspace indexer file watcher (incremental, cap: 500 files / 5000 symbols)
8. Diff decoration provider (inline accept/reject with CodeLens)
9. Code intelligence: CodeAction, Hover, CodeLens, Diagnostics, InlineCompletion providers
10. Token counter, terminal integration, error explainer
11. ~30 commands (see package.json `contributes.commands`)

### Key Layers

```
src/
├── extension.ts              # Activation, command registration
├── providers/
│   ├── chatParticipant.ts    # @agi in VS Code Chat (slash commands, vscode.lm fallback)
│   ├── sidebarProvider.ts    # Webview sidebar chat UI (HTML inline, postMessage protocol)
│   ├── agentModeProvider.ts  # Multi-file editing agent (patch parsing, autonomous loops)
│   ├── diffDecorationProvider.ts  # Inline diff accept/reject with decorations + CodeLens
│   ├── contextPanelProvider.ts    # Pinned context files tree
│   ├── codeLensProvider.ts   # "Ask AI" / "Tests" / "Docs" lenses above functions
│   ├── codeActionProvider.ts # Quick Fix / Refactor code actions
│   ├── hoverProvider.ts      # AI actions on hover (opt-in)
│   ├── inlineCompletionProvider.ts  # Ghost-text completions (opt-in)
│   ├── diagnosticsProvider.ts     # AI code review → Problems panel
│   ├── terminalProvider.ts   # Run/explain/suggest terminal commands
│   ├── errorExplainerProvider.ts  # One-click error explanations
│   └── conversationTreeProvider.ts  # History tree view
├── services/
│   ├── desktopBridge.ts      # WebSocket + HTTP bridge to desktop app
│   ├── patchEngine.ts        # Search/replace patch parser (SEARCH/REPLACE blocks)
│   ├── contextBuilder.ts     # Workspace context for prompts (git, diagnostics, files)
│   ├── workspaceIndexer.ts   # File/symbol indexer with incremental updates
│   ├── contextBudget.ts      # Token budget allocation for context
│   ├── tokenCounter.ts       # Session token usage tracking
│   ├── modelMetrics.ts       # Per-model latency/token/cost dashboard
│   └── telemetry.ts          # Anonymous telemetry (VS Code TelemetryLogger API)
├── storage/
│   └── conversationStore.ts  # globalState persistence (max 50 conversations)
└── utils/
    ├── api.ts                # HTTP client for AGI Workforce LLM API (SSE streaming)
    ├── applyEdit.ts          # Apply LLM-suggested edits to documents
    └── version.ts            # Extension version helper
```

### Communication Patterns

- **API calls**: `src/utils/api.ts` — OpenAI-compatible `/chat/completions` endpoint with SSE streaming. API key stored in VS Code SecretStorage. Retry with exponential backoff (server errors only). Falls back to `vscode.lm` (Copilot) when API key is missing.
- **Desktop bridge**: `src/services/desktopBridge.ts` — WebSocket for real-time events, HTTP POST for commands. Auto-reconnect with exponential backoff (1s→8s). Status bar indicator. Security: command allowlist, workspace-scoped file opens, no arg forwarding.
- **Sidebar ↔ extension**: postMessage protocol. Webview sends `{ type, payload }`, extension responds with `{ type, payload }`. Message types defined as union types in `sidebarProvider.ts`.
- **Agent mode**: Webview panel. LLM responses parsed for `@read path/to/file` (file reads) and `` ```edit:path/to/file `` (edits). Patch engine uses `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` blocks with exact + fuzzy matching.

### Configuration Namespace

All settings under `agiWorkforce.*` in VS Code settings. Key settings:
- `agiWorkforce.model` — default `auto-balanced` (smart routing)
- `agiWorkforce.apiEndpoint` — cloud API URL
- `agiWorkforce.desktopBridge.enabled/port` — desktop app connection (default port 8787)
- `agiWorkforce.inlineCompletions.enabled` — ghost-text (off by default)
- `agiWorkforce.agent.maxIterations` — autonomous loop cap (default 25)
- `agiWorkforce.codeLensEnabled` — CodeLens above functions (on by default)
- `agiWorkforce.hoverEnabled` — hover AI actions (off by default)

## Testing

Tests use Vitest with a comprehensive VS Code API mock at `src/__tests__/__mocks__/vscode.ts`. The mock is aliased as `vscode` in `vitest.config.ts` via resolve alias — no real VS Code host needed.

When writing tests:
- Import from `vitest` (not jest). `globals: false` — explicit imports required.
- The vscode mock provides: SecretStorage, EventEmitter, Disposable, Uri, Range, Position, workspace, window, commands, languages, CancellationTokenSource, etc.
- Mock HTTP responses for API tests — the api client uses raw `http`/`https` (not fetch).

## Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- No default exports — named exports only
- `vscode` import always as namespace: `import * as vscode from 'vscode'`
- All providers register on `'*'` language selector (language-agnostic)
- Non-critical features wrapped in try/catch during activation (telemetry, metrics, terminal, etc.) — must never block activation
- CSP-enforced webviews: nonce-based `<style>` and `<script>` tags
- Context subscriptions: always push disposables to `context.subscriptions`
- API key via SecretStorage only — never `getConfiguration()` for secrets

## Patch Format (Agent Mode)

The patch engine (`patchEngine.ts`) expects LLM responses in this format:

````
```patch:path/to/file.ts
<<<<<<< SEARCH
exact text to find
=======
replacement text
>>>>>>> REPLACE
```
````

Multiple SEARCH/REPLACE blocks per file. Applied bottom-to-top. Fuzzy matching (whitespace-normalized) as fallback. Confidence scoring: high (exact), medium (<5% diff), low (>5% diff).
