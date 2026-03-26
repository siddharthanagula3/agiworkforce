# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AGI Workforce VS Code extension (`apps/extension-vscode/`) — a model-agnostic AI coding assistant supporting 15+ LLMs (Claude, GPT, Gemini, DeepSeek, Perplexity, Grok, etc.) with smart auto-routing. Part of the AGI Workforce monorepo.

---

## Build & Dev Commands

```bash
pnpm compile                    # esbuild → out/extension.js (dev, with sourcemaps)
pnpm watch                      # esbuild watch mode
pnpm package                    # production build + VSIX package (vsce)
pnpm lint                       # ESLint with caching
pnpm typecheck                  # tsc --noEmit (strict mode)
pnpm test                       # vitest run (all tests)
pnpm test -- src/__tests__/api.test.ts  # single test file
pnpm clean                      # rimraf out/
```

**Build pipeline**: esbuild (not tsc) → `out/extension.js` — single CJS bundle. `vscode` is external (provided by VS Code at runtime). Target: Node 18. Platform: node.

---

## Tech Stack

| Layer         | Technology                  | Version             |
| ------------- | --------------------------- | ------------------- |
| VS Code API   | vscode                      | >=1.95.0            |
| Language      | TypeScript                  | 5.9.3 (strict mode) |
| Bundler       | esbuild                     | 0.27.4              |
| Module format | CommonJS (CJS)              | -                   |
| Test runner   | Vitest                      | 4.0.18              |
| WebSocket     | ws                          | 8.20.0              |
| Packaging     | @vscode/vsce                | 3.7.1               |
| Linting       | ESLint + @typescript-eslint | 9.x                 |
| Node target   | Node.js                     | 18                  |

**Only runtime dependency**: `ws` (WebSocket for desktop bridge). Everything else is devDependencies. The `vscode` module is external — provided by VS Code at runtime.

---

## Architecture

### Entry Point & Activation

`src/extension.ts` (~748 lines) → `activate()` — activated on `onStartupFinished`. Registers components in strict order:

1. **Telemetry** + model metrics (non-critical, wrapped in try/catch)
2. **Desktop bridge** (WebSocket to desktop app at `ws://127.0.0.1:8787/ws`)
3. **Conversation store** + tree provider (globalState persistence, max 50 conversations)
4. **@agi chat participant** — VS Code Chat panel with 6 slash commands
5. **Sidebar webview** — self-contained chat UI in activity bar (`retainContextWhenHidden: true`)
6. **Context panel** tree view (pinned files injected into prompts)
7. **Workspace indexer** file watcher (incremental, cap: 500 files / 5000 symbols)
8. **Diff decoration provider** (inline accept/reject with CodeLens)
9. **Code intelligence**: CodeAction, Hover, CodeLens, Diagnostics, InlineCompletion providers
10. **Token counter** status bar, terminal integration, error explainer
11. **41 commands** (see Command Reference below)

**Critical rule**: Non-critical features are wrapped in try/catch during activation — they must **never** block the activation sequence.

### Source Tree

```
src/
├── extension.ts                       # Activation, command registration (~748 lines)
├── providers/                         # VS Code API integrations (13 files)
│   ├── chatParticipant.ts            #   @agi chat participant + slash commands (~350 lines)
│   ├── sidebarProvider.ts            #   Webview sidebar chat UI (~700 lines, inline HTML)
│   ├── agentModeProvider.ts          #   Multi-file editing agent (~500 lines)
│   ├── diffDecorationProvider.ts     #   Inline diff accept/reject (~400 lines)
│   ├── contextPanelProvider.ts       #   Pinned context files tree (~200 lines)
│   ├── codeLensProvider.ts           #   "Ask AI" / "Tests" / "Docs" lenses (~158 lines)
│   ├── codeActionProvider.ts         #   Quick Fix / Refactor code actions (~80 lines)
│   ├── hoverProvider.ts              #   AI actions on hover, opt-in (~38 lines)
│   ├── inlineCompletionProvider.ts   #   Ghost-text completions, opt-in (~189 lines)
│   ├── diagnosticsProvider.ts        #   AI code review → Problems panel (~163 lines)
│   ├── terminalProvider.ts           #   Run/explain/suggest terminal commands (~250 lines)
│   ├── errorExplainerProvider.ts     #   One-click error explanations (~250 lines)
│   └── conversationTreeProvider.ts   #   History tree view (~67 lines)
├── services/                          # Business logic (8 files)
│   ├── desktopBridge.ts              #   WebSocket + HTTP bridge to desktop app (~450 lines)
│   ├── patchEngine.ts                #   SEARCH/REPLACE patch parser (~600 lines)
│   ├── contextBuilder.ts             #   Workspace context for prompts (~400 lines)
│   ├── workspaceIndexer.ts           #   File/symbol indexer with incremental updates (~250 lines)
│   ├── contextBudget.ts              #   Token budget allocation for context (~99 lines)
│   ├── tokenCounter.ts              #   Session token usage tracking + cost (~200 lines)
│   ├── modelMetrics.ts               #   Per-model latency/token/cost dashboard (~300 lines)
│   └── telemetry.ts                  #   Anonymous telemetry, VS Code TelemetryLogger API (~200 lines)
├── storage/
│   └── conversationStore.ts          #   globalState persistence, max 50 conversations (~96 lines)
└── utils/
    ├── api.ts                        #   HTTP client, SSE streaming, retry (~565 lines)
    ├── applyEdit.ts                  #   Apply LLM-suggested edits (~103 lines)
    └── version.ts                    #   Extension version helper (~22 lines)
```

---

## Communication Patterns

### 1. Cloud API (`src/utils/api.ts`)

OpenAI-compatible `/chat/completions` endpoint with SSE streaming.

| Aspect    | Detail                                                              |
| --------- | ------------------------------------------------------------------- |
| Protocol  | HTTP/HTTPS with raw `http`/`https` modules (NOT fetch)              |
| Streaming | SSE line-by-line parsing, `data: [DONE]` sentinel                   |
| Auth      | API key in VS Code SecretStorage (OS keychain encrypted)            |
| Retry     | 2 retries on 5xx errors, exponential backoff (1s → 2s)              |
| Timeout   | 10 seconds per request                                              |
| Defaults  | `temperature: 0.2`, `max_tokens: 4096`                              |
| Fallback  | `vscode.lm` (GitHub Copilot) when API key missing                   |
| Headers   | `Authorization: Bearer`, `User-Agent`, `X-Client: vscode-extension` |

**Secret storage key**: `agiWorkforce.apiKey`

**Error class**: `AgiWorkforceApiError` with `statusCode` + `code` (`NO_API_KEY` | `CANCELLED` | `HTTP_ERROR`)

### 2. Desktop Bridge (`src/services/desktopBridge.ts`)

Dual-transport connection to AGI Workforce desktop app.

| Transport | URL                                            | Purpose                  |
| --------- | ---------------------------------------------- | ------------------------ |
| WebSocket | `ws://127.0.0.1:{port}/ws`                     | Real-time events         |
| HTTP POST | `http://127.0.0.1:{port}/api/bridge/{command}` | Commands                 |
| HTTP GET  | `http://127.0.0.1:{port}/api/health`           | Health check (every 30s) |

**Connection states**: `disconnected` → `connecting` → `connected` | `error`

**Auto-reconnect**: Exponential backoff (1s → 2s → 4s → 8s max). Status bar indicator shows connection state (plug/sync/disconnect/error icons).

**Graceful degradation**: All bridge features are optional — lack of connection never blocks the extension.

### 3. Sidebar Webview (`src/providers/sidebarProvider.ts`)

postMessage protocol with discriminated union types:

```typescript
// Webview → Extension
{ type: 'sendMessage'; payload: { text: string; model?: string } }
{ type: 'setApiKey'; payload: { key: string } }
{ type: 'clearApiKey' }
{ type: 'ready' }
{ type: 'getModel' }
{ type: 'openSettings' }
{ type: 'cancel' }
{ type: 'fileSearch'; payload: { query: string } }
{ type: 'shareDiagnostics' }
{ type: 'clearConversation' }

// Extension → Webview
{ type: 'token'; payload: { text: string } }    // Stream token
{ type: 'done' }                                  // Stream complete
{ type: 'error'; payload: { message: string } }
{ type: 'apiKeyStatus'; payload: { hasKey: boolean } }
{ type: 'model'; payload: { model: string } }
{ type: 'fileSearchResults'; payload: { files: string[] } }
{ type: 'conversationCleared' }
{ type: 'addUserMessage'; payload: { text: string } }
```

### 4. Agent Mode (`src/providers/agentModeProvider.ts`)

Webview panel with autonomous multi-file editing. LLM responses parsed for:

- `@read path/to/file` → file reads (async, displayed in webview)
- ` ```patch:path/to/file ` → SEARCH/REPLACE patches (preferred format)
- ` ```edit:path/to/file ` → full file replacement (legacy format)

Max iterations: configurable via `agiWorkforce.agent.maxIterations` (default 25).

---

## Patch Engine (Agent Mode)

**File**: `src/services/patchEngine.ts` (~600 lines)

### Format

````
```patch:path/to/file.ts
<<<<<<< SEARCH
exact text to find
=======
replacement text
>>>>>>> REPLACE
```
````

Multiple SEARCH/REPLACE blocks per file. Applied bottom-to-top to preserve line offsets.

### Matching Strategy

| Priority | Method                        | Confidence | Criteria                                             |
| -------- | ----------------------------- | ---------- | ---------------------------------------------------- |
| 1        | Exact match                   | `high`     | Case-sensitive, whitespace-exact                     |
| 2        | Fuzzy (whitespace-normalized) | `medium`   | <5% whitespace difference                            |
| 3        | Aggressive fuzzy              | `low`      | Case-insensitive, all whitespace stripped, >=5% diff |
| 4        | No match                      | -          | Returns error with diagnostic suggestion             |

### Key Exports

- `parsePatchBlocks(text)` — Parse ` ```patch:filepath ` blocks
- `applyPatch(document, patch)` — Apply single patch with exact/fuzzy matching
- `applyPatchBatch(...)` — Apply multiple patches with undo support (returns `BatchResult`)
- `applyPatchAggressive(...)` — Last-resort fuzzy matching
- `undoPatchBatch()` — Undo a batch of applied patches
- `showOriginalContext(...)` — Side-by-side diff of expected vs actual
- `getPatchOutputChannel()` — Output channel `"AGI Workforce: Patches"` for logging

---

## Configuration Reference

All settings under `agiWorkforce.*` namespace (19 properties):

### API & Model

| Setting              | Type    | Default                               | Description                                      |
| -------------------- | ------- | ------------------------------------- | ------------------------------------------------ |
| `apiEndpoint`        | string  | `https://agiworkforce.com/api/llm/v1` | Cloud API URL                                    |
| `model`              | string  | `auto-balanced`                       | Default LLM model or routing strategy            |
| `streamingEnabled`   | boolean | `true`                                | Enable SSE streaming responses                   |
| `fallbackToVscodeLm` | boolean | `true`                                | Fall back to GitHub Copilot when API key missing |

### Context & Intelligence

| Setting           | Type    | Default | Description                                      |
| ----------------- | ------- | ------- | ------------------------------------------------ |
| `contextLines`    | number  | `50`    | Lines to gather around selection (0-500)         |
| `codeLensEnabled` | boolean | `true`  | Show "Ask AI" / "Tests" / "Docs" above functions |
| `hoverEnabled`    | boolean | `false` | Show AI quick actions on hover                   |
| `autoApplyFixes`  | boolean | `false` | Auto-apply AI fixes without diff preview         |

### Inline Completions

| Setting                        | Type    | Default | Description                    |
| ------------------------------ | ------- | ------- | ------------------------------ |
| `inlineCompletions.enabled`    | boolean | `false` | Ghost-text completions         |
| `inlineCompletions.debounceMs` | number  | `300`   | Debounce (50-2000ms)           |
| `inlineCompletions.maxLength`  | number  | `500`   | Max completion chars (50-5000) |

### Agent Mode

| Setting               | Type    | Default | Description                                        |
| --------------------- | ------- | ------- | -------------------------------------------------- |
| `agent.planMode`      | boolean | `false` | Show plan before executing (requires confirmation) |
| `agent.maxIterations` | number  | `25`    | Autonomous loop cap (1-200)                        |

### Desktop Bridge

| Setting                 | Type    | Default | Description              |
| ----------------------- | ------- | ------- | ------------------------ |
| `desktopBridge.enabled` | boolean | `true`  | Connect to desktop app   |
| `desktopBridge.port`    | number  | `8787`  | Bridge port (1024-65535) |

### Telemetry & MCP

| Setting             | Type    | Default                                        | Description                        |
| ------------------- | ------- | ---------------------------------------------- | ---------------------------------- |
| `telemetryEnabled`  | boolean | `false`                                        | Anonymous usage telemetry          |
| `telemetryEndpoint` | string  | `https://telemetry.agiworkforce.com/v1/events` | Telemetry server                   |
| `mcp.enabled`       | boolean | `false`                                        | Model Context Protocol integration |

---

## Command Reference (41 commands)

### Core Chat & UI

| Command ID                      | Title            | Keybinding (macOS) |
| ------------------------------- | ---------------- | ------------------ |
| `agi-workforce.chat`            | Open Chat        | `Cmd+Shift+A`      |
| `agi-workforce.agentMode`       | Agent Mode       | `Cmd+Shift+Alt+G`  |
| `agi-workforce.newConversation` | New Conversation | `Cmd+Shift+Alt+N`  |

### Code Actions (require `editorHasSelection` or `editorTextFocus`)

| Command ID                    | Title             | Keybinding        |
| ----------------------------- | ----------------- | ----------------- |
| `agi-workforce.explain`       | Explain Selection | `Cmd+Shift+Alt+E` |
| `agi-workforce.fix`           | Fix Issue         | -                 |
| `agi-workforce.refactor`      | Refactor Code     | -                 |
| `agi-workforce.generateTests` | Generate Tests    | -                 |
| `agi-workforce.docs`          | Generate Docs     | -                 |
| `agi-workforce.codeReview`    | Code Review       | -                 |
| `agi-workforce.askAboutCode`  | Ask About Code    | `Cmd+Shift+Alt+A` |

### Terminal & Errors

| Command ID                      | Title                    | Keybinding        |
| ------------------------------- | ------------------------ | ----------------- |
| `agi-workforce.runCommand`      | Run Terminal Command     | `Cmd+Shift+Alt+T` |
| `agi-workforce.explainTerminal` | Explain Terminal Output  | -                 |
| `agi-workforce.suggestCommand`  | Suggest Terminal Command | -                 |
| `agi-workforce.explainError`    | Explain Error            | `Cmd+Shift+Alt+X` |

### Diff Management (8 commands, active when `agi-workforce.hasDiff`)

| Command ID                           | Keybinding        |
| ------------------------------------ | ----------------- |
| `agi-workforce.acceptDiff`           | `Cmd+Shift+Enter` |
| `agi-workforce.rejectDiff`           | `Escape`          |
| `agi-workforce.acceptCurrentDiff`    | `Cmd+Shift+A`     |
| `agi-workforce.rejectCurrentDiff`    | `Cmd+Shift+R`     |
| `agi-workforce.acceptAllDiffs`       | -                 |
| `agi-workforce.rejectAllDiffs`       | -                 |
| `agi-workforce.acceptAllDiffsGlobal` | `Cmd+Shift+Alt+Y` |
| `agi-workforce.rejectAllDiffsGlobal` | `Cmd+Shift+Alt+U` |

### Patch & Context

`acceptBatch`, `rejectBatch`, `showOriginalContext`, `showPatchLogs`, `addToContext`, `removeFromContext`, `clearContext`, `refreshContext`

### Model & API Key

`selectModel`, `setApiKey`, `clearApiKey`

### Conversations

`openConversation`, `deleteConversation`, `refreshConversations`

### Desktop Bridge

`sendToDesktop`, `syncContextToDesktop`, `triggerAgentAction`, `bridgeReconnect`

### Git

`agi.git.status`, `agi.git.diff`, `agi.git.commit`

### Monitoring

`modelDashboard`, `showTokenBreakdown`, `resetTokenCounter`

---

## Chat Participant (@agi)

**ID**: `agiworkforce.agi` — registered in VS Code Chat panel with 6 slash commands.

### Slash Commands

| Command     | Purpose                               | Prompt Strategy                 |
| ----------- | ------------------------------------- | ------------------------------- |
| `/explain`  | Explain selected code or current file | Clarity-focused, plain language |
| `/fix`      | Find and fix bugs                     | Bug-focused analysis            |
| `/refactor` | Suggest refactoring improvements      | Code quality and patterns       |
| `/tests`    | Generate unit tests                   | Coverage-focused                |
| `/docs`     | Generate documentation comments       | Comment style matching          |
| `/model`    | Switch the active LLM model           | Shows quick pick                |

### Prompt Construction Flow

1. `gatherEditorContext()` — Collects: file path, language, selection, surrounding code (±`contextLines`)
2. `buildSystemPrompt(ctx, options)` — Assembles: workspace name, active file context, command-specific guidance, MCP/bridge status, plan mode instructions, rich workspace context from `contextBuilder`, pinned context files (up to 10)
3. `buildUserMessage(request, ctx)` — Transforms slash command into full LLM prompt
4. `historyToMessages()` — Converts VS Code chat history to OpenAI `{ role, content }` format

### Execution Confirmation

`isExecutionConfirmation(text)` recognizes: yes, y, ok, okay, go, proceed, execute, run, continue, ship, do it (case-insensitive, word-boundary matched).

---

## Provider Details

### CodeLens Provider (`codeLensProvider.ts`)

Three lenses above function/class/method declarations:

- `$(hubot) Ask AI` → `agi-workforce.explain`
- `$(beaker) Tests` → `agi-workforce.generateTests`
- `$(book) Docs` → `agi-workforce.docs`

Language-aware detection via regex for: TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, Ruby, PHP, C/C++/C#, Swift, and generic fallback. Dynamically registered/unregistered when `agiWorkforce.codeLensEnabled` changes.

### CodeAction Provider (`codeActionProvider.ts`)

| Trigger             | Action Kind | Label                               |
| ------------------- | ----------- | ----------------------------------- |
| Diagnostics present | QuickFix    | "Fix with AGI Workforce"            |
| Text selected       | Refactor    | "Refactor with AGI Workforce"       |
| Text selected       | (empty)     | "Explain with AGI Workforce"        |
| Text selected       | (empty)     | "Generate Tests with AGI Workforce" |

### Diff Decoration Provider (`diffDecorationProvider.ts`)

- Green gutter for added lines (`rgba(76,175,80,0.08)`)
- Red gutter for removed lines (`rgba(244,67,54,0.08)`)
- Orange gutter for modified lines (`rgba(255,152,0,0.08)`)
- Summary CodeLens: `$(diff) Changes: +X, -Y in filename`
- Confidence icons: `$(pass-filled)` HIGH, `$(warning)` MEDIUM, `$(error)` LOW
- Batch operations for multi-file patches

### Inline Completion Provider (`inlineCompletionProvider.ts`)

| Constant                        | Value  | Purpose                                |
| ------------------------------- | ------ | -------------------------------------- |
| `MIN_PREFIX_CHARS`              | 3      | Minimum chars before cursor to trigger |
| `MAX_CONTEXT_LINES`             | 80     | Lines before cursor for context        |
| `MAX_SUFFIX_LINES`              | 20     | Lines after cursor for context         |
| `CACHE_TTL_MS`                  | 15,000 | Cache validity (15 seconds)            |
| `DEFAULT_DEBOUNCE_MS`           | 300    | Debounce typing                        |
| `DEFAULT_MAX_COMPLETION_LENGTH` | 500    | Max chars returned                     |

Cache keyed on: document URI + position + last 1200 chars of context.

### Diagnostics Provider (`diagnosticsProvider.ts`)

Parses LLM responses for structured issues: `ISSUE|<line_offset>|<severity>|<message>`

Severity mapping: `error` → Error, `warning` → Warning, `hint` → Hint, `info` → Information.

### Terminal Provider (`terminalProvider.ts`)

Singleton terminal named `"AGI Workforce"`. Uses VS Code Shell Integration API for output capture (max 8000 chars). Falls back to user copy-paste when shell integration unavailable.

---

## Services Deep Dive

### Context Builder (`contextBuilder.ts`)

| Method                    | Output                                 | Limit                  |
| ------------------------- | -------------------------------------- | ---------------------- |
| `getActiveFileContext()`  | File path, language, selection, cursor | 3000 chars/selection   |
| `getOpenFilesContext()`   | All open tab names + language IDs      | 1500 chars             |
| `getGitContext()`         | `git status --porcelain` + diff stat   | 2000 chars, 5s timeout |
| `getDiagnosticsContext()` | Active file diagnostics                | 20 items max           |
| `getFileTreeContext()`    | Workspace directory listing            | 30 entries, 1500 chars |
| `buildFullContext()`      | All of the above combined              | Composed               |

**Fail-safe**: All methods return empty string on error — never throw.

### Context Budget (`contextBudget.ts`)

Model-aware token budget allocation:

- `chat` mode: 3% of model context window
- `agent` mode: 5% of model context window
- ~40% of character budget allocated to workspace indexer
- Estimation: 1 token ~ 4 characters
- Overridable via `agiWorkforce.contextBudgetPercent` (clamped 1-20%)

### Token Counter (`tokenCounter.ts`)

Status bar display: `$(pulse) Tokens: X/Y | Cost: $Z`

Color coding: green (<50% of context), yellow (50-80%), red (>=80%).

Key model context windows:

- Claude Opus 4.6: 1,000,000 tokens
- Claude Sonnet 4.6: 200,000 tokens
- Gemini 3 Pro Preview: 2,000,000 tokens
- GPT-5 Pro: 256,000 tokens
- Auto-balanced: 200,000 tokens

### Workspace Indexer (`workspaceIndexer.ts`)

| Constant             | Value                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- |
| Max files            | 500                                                                                   |
| Max total symbols    | 5,000                                                                                 |
| Max symbols per file | 50                                                                                    |
| Cache TTL            | 1 hour                                                                                |
| Watched extensions   | .ts, .tsx, .js, .jsx, .py, .go, .rs, .java, .cs, .cpp, .c, .h, .rb, .php, .swift, .kt |
| Excluded dirs        | node_modules, dist, build, .next, target                                              |

Incremental updates via file watcher (onDidChange, onDidCreate, onDidDelete). Symbol extraction using VS Code `DocumentSymbol` API.

### Telemetry (`telemetry.ts`)

- Uses VS Code `TelemetryLogger` API (respects global + extension-level settings)
- Anonymous — no PII collected
- Domain allowlist: `agiworkforce.com`, `localhost`, `127.0.0.1`
- Fire-and-forget HTTP POST (never throws)
- Event names: `EXTENSION_ACTIVATED`, `INLINE_COMMAND_EXECUTED`, `MODEL_SELECTED`, `ERROR_OCCURRED`

---

## State Management

**No Zustand** in the extension (unlike desktop app). Imperative state via `vscode.Memento`.

| Data            | Storage        | Key                           | Scope                   |
| --------------- | -------------- | ----------------------------- | ----------------------- |
| Conversations   | globalState    | `agiWorkforce.conversations`  | Persisted (max 50)      |
| Model metrics   | globalState    | `agiWorkforce.modelMetrics`   | Session                 |
| Token usage     | globalState    | `agiWorkforce.tokenUsage`     | Session                 |
| Workspace index | workspaceState | `agiWorkforce.workspaceIndex` | Workspace               |
| API key         | SecretStorage  | `agiWorkforce.apiKey`         | Encrypted (OS keychain) |

**Singletons** (in-memory, module-level): TokenCounter, ModelMetrics, ContextBuilder, DesktopBridge, ContextPanelProvider, WorkspaceIndexer.

---

## Views & UI

### Activity Bar Sidebar (`agi-workforce-sidebar`)

| View ID                       | Type    | Name          | Notes                                        |
| ----------------------------- | ------- | ------------- | -------------------------------------------- |
| `agi-workforce.sidebar`       | Webview | AGI Workforce | Main chat, `retainContextWhenHidden`         |
| `agi-workforce.conversations` | Tree    | History       | Sorted by updatedAt descending               |
| `agi-workforce.contextPanel`  | Tree    | Context Files | Pinned + auto-detected, collapsed by default |

### Sidebar Webview Theme

- Background: `#0f0f0f` (dark), elevated: `#1a1a1a`
- Accent teal: `#21808d`, accent terra cotta: `#da7756` (send button)
- CSP-enforced with nonce-based `<style>` and `<script>` tags
- Inline HTML template (no external files)

### Editor Context Menu

Right-click menu items (group `agi-workforce@{n}`): Explain, Fix, Refactor, Generate Tests, Generate Docs, Code Review, Ask About Code, Explain Error, Add to Context. Most require `editorHasSelection`.

---

## Testing

### Setup

- **Runner**: Vitest 4.0.18 (NOT jest)
- **Environment**: Node.js (no browser/DOM)
- **Globals**: `false` — explicit imports required (`import { describe, it, expect } from 'vitest'`)
- **Mock alias**: `vscode` → `src/__tests__/__mocks__/vscode.ts` via vitest resolve alias
- **Test discovery**: `src/__tests__/**/*.test.ts`
- **Test files excluded** from main build via tsconfig `exclude`

### VS Code Mock (`__mocks__/vscode.ts`, ~540 lines)

Comprehensive mock covering all VS Code APIs used:

| Mock                               | Coverage                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `EventEmitter<T>`                  | Full event bus with fire/listener management                                |
| `Disposable`                       | Cleanup pattern with static `from()`                                        |
| `Uri`                              | `file()`, `parse()`, `joinPath()`, `fsPath`                                 |
| `Position` / `Range` / `Selection` | Text navigation                                                             |
| `CancellationTokenSource`          | Cancellation with listener support                                          |
| `MockExtensionContext`             | SecretStorage, globalState, workspaceState, subscriptions                   |
| `MockTextDocument`                 | Content, languageId, URI, line access                                       |
| `MockWebview`                      | postMessage mocking                                                         |
| Namespaces                         | `window`, `workspace`, `languages`, `commands`, `extensions`, `env`, `chat` |
| Enums                              | StatusBarAlignment, ViewColumn, DiagnosticSeverity, CodeActionKind, etc.    |

### Test Files (11 files)

| File                               | Tests | Covers                                                               |
| ---------------------------------- | ----- | -------------------------------------------------------------------- |
| `api.test.ts`                      | 13    | API errors, secret storage, retry, SSE parsing                       |
| `extension.test.ts`                | 21    | Command registration, status bar, model selection, config validation |
| `conversationStore.test.ts`        | 27    | CRUD, auto-title, pruning, relative time formatting                  |
| `chatParticipant.test.ts`          | 27    | System prompt building, slash commands, execution confirmation       |
| `applyEdit.test.ts`                | 8     | Code block extraction from LLM responses                             |
| `codeActionProvider.test.ts`       | 6     | Diagnostic/selection-triggered code actions                          |
| `desktopBridge.test.ts`            | 15    | Messaging, status management, handler lifecycle                      |
| `conversationTreeProvider.test.ts` | 7     | Tree item creation, relative time display                            |
| `hoverProvider.test.ts`            | 4     | Conditional hover content                                            |
| `inlineCompletionProvider.test.ts` | 12    | Completion extraction, caching, filtering                            |
| `workspaceIndexer.test.ts`         | 18    | Relevance scoring, language inference, cache staleness               |

### Writing Tests

- Import from `vitest`: `import { describe, it, expect, vi, beforeEach } from 'vitest'`
- Use `vi.fn()` for spies and mocks
- API tests mock HTTP — the client uses raw `http`/`https` modules (not fetch)
- Most tests replicate logic in-test since importing from source would trigger vscode import issues
- Use `it.each([...])` for parameterized tests
- Verify disposal via type assertion: `bridge as unknown as { _handlers: ... }`

---

## Coding Conventions

### TypeScript

- **Strict mode**: `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- **No default exports** — named exports only
- **`vscode` import**: Always as namespace: `import * as vscode from 'vscode'`
- **All providers** register on `'*'` language selector (language-agnostic)
- **Disposables**: Always push to `context.subscriptions`
- **Secrets**: API key via `SecretStorage` only — never `getConfiguration()` for secrets
- **Webview CSP**: Nonce-based `<style>` and `<script>` tags, always enforced
- **Error handling**: Try/catch wraps all non-critical features during activation
- **Cancellation**: All long-running operations accept `CancellationToken`
- **No external packages** beyond `ws` — use Node.js built-ins (`http`, `https`, `crypto`, `child_process`)

### Naming Conventions

| Entity              | Convention                | Example                                   |
| ------------------- | ------------------------- | ----------------------------------------- |
| Files (providers)   | camelCase                 | `chatParticipant.ts`                      |
| Files (services)    | camelCase                 | `desktopBridge.ts`                        |
| Classes             | PascalCase                | `SidebarProvider`, `DesktopBridge`        |
| Interfaces          | PascalCase, no `I` prefix | `EditorContext`, `PatchBlock`             |
| Types               | PascalCase                | `BridgeStatus`, `PatchConfidence`         |
| Constants           | SCREAMING_SNAKE           | `MAX_CONTEXT_LINES`, `CACHE_TTL_MS`       |
| Command IDs         | kebab-case with prefix    | `agi-workforce.explain`                   |
| Config keys         | camelCase dot notation    | `agiWorkforce.desktopBridge.port`         |
| globalState keys    | dot notation              | `agiWorkforce.conversations`              |
| Singleton accessors | `get{Name}()`             | `getDesktopBridge()`, `getTokenCounter()` |

### Patterns

- **Singleton services**: Module-level `let instance: T | undefined` with `get{Name}()` accessor
- **Provider registration**: Return `vscode.Disposable` from registration functions
- **Dynamic registration**: Providers toggled by config (e.g., CodeLens, InlineCompletion) use `onDidChangeConfiguration` to register/dispose
- **Context values**: Set via `vscode.commands.executeCommand('setContext', key, value)` for conditional keybindings/menus
- **Webview state**: No React/framework — raw HTML with inline `<script>` and postMessage protocol
- **Git operations**: `child_process.execFile('git', [...])` with `util.promisify`, always with timeout (5s)

---

## Error Handling Patterns

### API Errors

```typescript
try {
  await streamChatCompletion(secrets, messages, callbacks, token);
} catch (err) {
  if (err instanceof AgiWorkforceApiError) {
    switch (err.code) {
      case 'NO_API_KEY': // Prompt to set API key
      case 'CANCELLED': // User cancelled — silently ignore
      case 'HTTP_ERROR': // Show error message with status code
    }
  }
}
```

### Activation Safety

```typescript
// Non-critical features MUST be wrapped
try {
  registerTelemetry(context);
} catch (err) {
  console.error('Telemetry failed:', err);
  // Extension continues — never block activation
}
```

### Graceful Degradation Chain

1. Try cloud API with user's API key
2. If no API key → fall back to `vscode.lm` (GitHub Copilot) if `fallbackToVscodeLm` enabled
3. If no Copilot → show "Set API Key" prompt
4. Desktop bridge features → silently degrade when bridge disconnected

---

## Keyboard Shortcuts

| Command             | macOS             | Windows/Linux      | Condition      |
| ------------------- | ----------------- | ------------------ | -------------- |
| Open Chat           | `Cmd+Shift+A`     | `Ctrl+Shift+A`     | No diff active |
| Explain             | `Cmd+Shift+Alt+E` | `Ctrl+Shift+Alt+E` | Text selected  |
| Agent Mode          | `Cmd+Shift+Alt+G` | `Ctrl+Shift+Alt+G` | -              |
| Ask About Code      | `Cmd+Shift+Alt+A` | `Ctrl+Shift+Alt+A` | Editor focused |
| Explain Error       | `Cmd+Shift+Alt+X` | `Ctrl+Shift+Alt+X` | Editor focused |
| Run Command         | `Cmd+Shift+Alt+T` | `Ctrl+Shift+Alt+T` | -              |
| New Conversation    | `Cmd+Shift+Alt+N` | `Ctrl+Shift+Alt+N` | -              |
| Accept Diff         | `Cmd+Shift+Enter` | `Ctrl+Shift+Enter` | Diff active    |
| Reject Diff         | `Escape`          | `Escape`           | Diff active    |
| Accept Current      | `Cmd+Shift+A`     | `Ctrl+Shift+A`     | Diff active    |
| Reject Current      | `Cmd+Shift+R`     | `Ctrl+Shift+R`     | Diff active    |
| Accept All (global) | `Cmd+Shift+Alt+Y` | `Ctrl+Shift+Alt+Y` | Diff active    |
| Reject All (global) | `Cmd+Shift+Alt+U` | `Ctrl+Shift+Alt+U` | Diff active    |

Note: `Cmd+Shift+A` is overloaded — opens chat when no diff is active, accepts current diff when diff is active (via `when` clause).

---

## Extension Metadata

| Field         | Value                                             |
| ------------- | ------------------------------------------------- |
| Name          | `agi-workforce`                                   |
| Display Name  | AGI Workforce                                     |
| Version       | 0.3.0                                             |
| Publisher     | agiworkforce                                      |
| Engine        | VS Code >=1.95.0                                  |
| License       | PROPRIETARY                                       |
| Status        | Preview                                           |
| Entry         | `./out/extension.js`                              |
| Gallery Theme | Dark (`#0f0f0f`)                                  |
| Categories    | AI, Chat, Machine Learning, Programming Languages |

### Activation Events

- `onStartupFinished`
- `onChatParticipant:agiworkforce.agi`
- `onView:agi-workforce.sidebar`
